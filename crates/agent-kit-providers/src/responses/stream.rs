use super::search;
use super::{ItemStatus, ReplayScope, Summary, WireContent, WireItem};
use crate::wire::{
    Incoming, RateRejectionEvidence, Usage, WireError, WireStream, classify_error, json_arguments,
    short_identity,
};
use crate::{StreamLimits, StreamingTransport, TransportRequest};
use agent_kit_core::inference::usage::{
    CACHED_INPUT_TOKENS, INPUT_TOKENS, OUTPUT_TOKENS, REASONING_OUTPUT_TOKENS,
};
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceOutcome, InferenceStatus,
    InferenceUpdate, ProviderEvent,
};
use agent_kit_core::messages::{
    Content, Message, Provenance, ProvenanceKind, ProviderEvidence, Role, ToolCall,
};
use agent_kit_core::{AttemptId, MessageId, ToolCallId, ToolId};
use futures_core::stream::BoxStream;
use futures_util::stream;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::Arc;

pub(super) fn events(
    transport: Arc<dyn StreamingTransport>,
    request: TransportRequest,
    control: InferenceControl,
    limits: StreamLimits,
    scope: ReplayScope,
    offered: (BTreeMap<String, ToolId>, bool),
    rate_rejection_evidence: RateRejectionEvidence,
) -> BoxStream<'static, ProviderEvent> {
    let state = Response {
        wire: WireStream::new(transport, request, control.clone(), limits)
            .with_rate_rejection_evidence(rate_rejection_evidence),
        attempt: control.attempt,
        limits,
        scope,
        names: offered.0,
        search: offered.1,
        updates: VecDeque::new(),
        items: BTreeMap::new(),
        partial: BTreeMap::new(),
        done_ids: BTreeSet::new(),
        response_id: None,
        usage: Usage::default(),
        finished: false,
    };
    Box::pin(stream::unfold(state, |mut state| async move {
        state.next().await.map(|event| (event, state))
    }))
}

struct Response {
    wire: WireStream,
    attempt: AttemptId,
    limits: StreamLimits,
    scope: ReplayScope,
    names: BTreeMap<String, ToolId>,
    search: bool,
    updates: VecDeque<ProviderEvent>,
    items: BTreeMap<usize, WireItem>,
    partial: BTreeMap<String, PartialItem>,
    done_ids: BTreeSet<String>,
    response_id: Option<String>,
    usage: Usage,
    finished: bool,
}

struct PartialItem {
    message: Message,
    ordinal: usize,
    visible: Visible,
    annotations: BTreeMap<(usize, usize), Value>,
    search: Option<Box<search::Call>>,
}

#[derive(Default)]
struct Visible {
    text: String,
    reasoning: String,
    refusal: String,
}

#[derive(Clone, Copy)]
enum Channel {
    Text,
    Reasoning,
    Refusal,
}

impl Visible {
    fn select(&mut self, channel: Channel) -> &mut String {
        match channel {
            Channel::Text => &mut self.text,
            Channel::Reasoning => &mut self.reasoning,
            Channel::Refusal => &mut self.refusal,
        }
    }

    fn projection(self) -> Vec<Content> {
        let mut content = Vec::new();
        for (value, channel) in [
            (self.text, Channel::Text),
            (self.reasoning, Channel::Reasoning),
            (self.refusal, Channel::Refusal),
        ] {
            if !value.is_empty() {
                content.push(match channel {
                    Channel::Text | Channel::Refusal => Content::Text(value),
                    Channel::Reasoning => Content::Reasoning(value),
                });
            }
        }
        content
    }
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum Event {
    #[serde(rename = "response.created")]
    Created { response: Terminal },
    #[serde(rename = "response.output_text.delta")]
    Text { item_id: String, delta: String },
    #[serde(rename = "response.reasoning_summary_text.delta")]
    Reasoning { item_id: String, delta: String },
    #[serde(rename = "response.refusal.delta")]
    Refusal { item_id: String, delta: String },
    #[serde(rename = "response.output_item.added")]
    ItemAdded { item: Value },
    #[serde(
        rename = "response.web_search_call.in_progress",
        alias = "response.web_search_call.searching"
    )]
    SearchStarted { item_id: String },
    #[serde(rename = "response.web_search_call.completed")]
    SearchCompleted { item_id: String },
    #[serde(rename = "response.output_text.annotation.added")]
    Annotation(Value),
    #[serde(rename = "response.output_item.done")]
    ItemDone { output_index: usize, item: WireItem },
    #[serde(rename = "response.completed")]
    Completed { response: Terminal },
    #[serde(rename = "response.incomplete")]
    Incomplete { response: Terminal },
    #[serde(rename = "response.failed")]
    Failed { response: Terminal },
    #[serde(rename = "error")]
    Error {
        error: Option<WireError>,
        code: Option<Value>,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct Terminal {
    id: Option<String>,
    status: Option<String>,
    usage: Option<TokenUsage>,
    error: Option<WireError>,
    incomplete_details: Option<Incomplete>,
    output: Option<Vec<Value>>,
}

#[derive(Deserialize)]
struct Incomplete {
    reason: Option<String>,
}

#[derive(Deserialize)]
struct OutputAnnotation {
    item_id: String,
    content_index: usize,
    annotation_index: usize,
    annotation: Value,
}

#[derive(Deserialize)]
struct TokenUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    input_tokens_details: Option<TokenDetails>,
    output_tokens_details: Option<TokenDetails>,
}

#[derive(Deserialize)]
struct TokenDetails {
    cached_tokens: Option<u64>,
    reasoning_tokens: Option<u64>,
}

impl Response {
    async fn next(&mut self) -> Option<ProviderEvent> {
        loop {
            if let Some(event) = self.updates.pop_front() {
                return Some(event);
            }
            if self.finished {
                return None;
            }
            match self.wire.next().await {
                Incoming::Receipt(receipt) => return Some(ProviderEvent::Receipt(receipt)),
                Incoming::Frame(frame) => {
                    if let Err(code) = self.event(&frame) {
                        self.protocol_failure(code);
                    }
                }
                Incoming::End => self.protocol_failure("missing_terminal_event"),
                Incoming::Failure(status, error) => self.finish(status, Some(error), None),
            }
        }
    }

    fn event(&mut self, frame: &[u8]) -> Result<(), &'static str> {
        match serde_json::from_slice(frame).map_err(|_| "invalid_responses_event")? {
            Event::Created { response } => self.response_identity(response.id)?,
            Event::Text { item_id, delta } => self.delta(&item_id, Channel::Text, &delta)?,
            Event::Reasoning { item_id, delta } => {
                self.delta(&item_id, Channel::Reasoning, &delta)?;
            }
            Event::Refusal { item_id, delta } => self.delta(&item_id, Channel::Refusal, &delta)?,
            Event::ItemAdded { item } if item["type"] == "web_search_call" => {
                let id = item["id"]
                    .as_str()
                    .ok_or("invalid_output_item_identity")?
                    .to_owned();
                let mut call = search::Call::progress("in_progress");
                call.merge(serde_json::from_value(item).map_err(|_| "invalid_responses_event")?);
                self.search_update(&id, call)?;
            }
            Event::ItemAdded { .. } => {}
            Event::SearchStarted { item_id } => {
                self.search_update(&item_id, search::Call::progress("in_progress"))?
            }
            Event::SearchCompleted { item_id } => {
                self.search_update(&item_id, search::Call::progress("completed"))?
            }
            Event::Annotation(fields) => {
                // Optional source metadata must not invalidate the assistant's answer.
                if self.search
                    && let Ok(OutputAnnotation {
                        item_id,
                        content_index,
                        annotation_index,
                        annotation,
                    }) = serde_json::from_value(fields)
                    && valid_item_id(&item_id)
                    && !self.done_ids.contains(&item_id)
                    && annotation["type"] == "url_citation"
                {
                    let part = self.partial_item(&item_id)?;
                    if part.annotations.len() < search::MAX_CITATIONS {
                        if content_index == 0 {
                            let citation =
                                search::citation(&annotation, part.visible.text.chars().count(), 0);
                            if let Some(citation) = citation {
                                self.evidence(&item_id, citation)?;
                            }
                        }
                        self.partial_item(&item_id)?
                            .annotations
                            .insert((content_index, annotation_index), annotation);
                    }
                }
            }
            Event::ItemDone { output_index, item } => self.complete_item(output_index, item)?,
            Event::Completed { response } => {
                if response
                    .status
                    .as_deref()
                    .is_some_and(|status| status != "completed")
                    || response.error.is_some()
                    || response.incomplete_details.is_some()
                {
                    return Err("inconsistent_terminal_status");
                }
                let output = response.output;
                self.terminal_metadata(response.id, response.usage)?;
                if let Some(output) = output.as_deref() {
                    self.terminal_search_evidence(output)?;
                }
                self.validate_completion(output.as_deref())?;
                if self
                    .partial
                    .values()
                    .any(|item| !item.visible.refusal.is_empty())
                {
                    self.finish(InferenceStatus::Refused, None, None);
                } else {
                    let messages = self.completed_messages()?;
                    self.finish(InferenceStatus::Completed, None, Some(messages));
                }
            }
            Event::Incomplete { response } => {
                let details = response
                    .incomplete_details
                    .as_ref()
                    .and_then(|details| details.reason.as_deref());
                let (status, failure) = match details {
                    Some("max_output_tokens") => (
                        InferenceStatus::Limited,
                        Some(failure(FailureKind::OutputLimit, "output_limit")),
                    ),
                    Some("content_filter") => (InferenceStatus::Refused, None),
                    _ => (
                        InferenceStatus::Interrupted,
                        Some(failure(FailureKind::Transient, "response_incomplete")),
                    ),
                };
                self.terminal_metadata(response.id, response.usage)?;
                if let Some(output) = response.output.as_deref() {
                    self.terminal_search_evidence(output)?;
                }
                self.finish(status, failure, None);
            }
            Event::Failed { response } => {
                if response
                    .status
                    .as_deref()
                    .is_some_and(|status| status != "failed")
                {
                    return Err("inconsistent_terminal_status");
                }
                let (status, failure) =
                    provider_error(response.error.as_ref().and_then(WireError::code));
                self.terminal_metadata(response.id, response.usage)?;
                if let Some(output) = response.output.as_deref() {
                    self.terminal_search_evidence(output)?;
                }
                let status = if self.response_id.is_some() {
                    status
                } else {
                    InferenceStatus::Interrupted
                };
                self.finish(status, failure, None);
            }
            Event::Error { error, code } => {
                let code = code
                    .as_ref()
                    .and_then(Value::as_str)
                    .or_else(|| error.as_ref().and_then(WireError::code));
                let (status, failure) = provider_error(code);
                // A stream-level error does not establish a failed response's
                // identity or final usage.
                let status = if status == InferenceStatus::Refused {
                    status
                } else {
                    InferenceStatus::Interrupted
                };
                self.finish(status, failure, None);
            }
            // Finalized items contain the full arguments and encrypted state.
            // Raw reasoning and provider-specific telemetry are outside this profile.
            Event::Other => {}
        }
        Ok(())
    }

    fn evidence(&mut self, id: &str, evidence: ProviderEvidence) -> Result<(), &'static str> {
        let message = &mut self.partial_item(id)?.message;
        if matches!(&evidence, ProviderEvidence::UrlCitation(_))
            && message.content.len() >= search::MAX_CITATIONS
        {
            return Ok(());
        }
        if evidence.record(&mut message.content) {
            let update = InferenceUpdate::ProviderEvidence {
                message: message.id.clone(),
                evidence,
            };
            self.updates.push_back(ProviderEvent::Update(update));
        }
        Ok(())
    }

    fn search_update(&mut self, id: &str, report: search::Call) -> Result<(), &'static str> {
        if !self.search {
            return Err("unoffered_hosted_search");
        }
        if self.done_ids.contains(id) {
            return Ok(());
        }
        let part = self.partial_item(id)?;
        if !part.visible.text.is_empty()
            || !part.visible.reasoning.is_empty()
            || !part.visible.refusal.is_empty()
        {
            return Err("output_item_type_changed");
        }
        let call = part.search.get_or_insert_default();
        call.merge(report);
        let next = call.evidence();
        self.evidence(id, next)
    }

    /// Some endpoints supply the complete action or annotations only in the terminal
    /// response. Reconcile with the exact streamed item and visible text.
    fn terminal_search_evidence(&mut self, output: &[Value]) -> Result<(), &'static str> {
        if !self.search {
            return Ok(());
        }
        for (index, value) in output.iter().enumerate() {
            let Some(item) = self.items.get_mut(&index) else {
                if value["type"] == "web_search_call"
                    || value["type"] == "message" && value["content"].is_array()
                {
                    self.complete_item(
                        index,
                        serde_json::from_value(value.clone())
                            .map_err(|_| "invalid_responses_event")?,
                    )?;
                }
                continue;
            };
            if value["id"] != item.id() || value["type"] != item.kind() {
                return Err("terminal_output_changed");
            }
            let id = item.id().to_owned();
            match item {
                WireItem::WebSearchCall { call, .. } => {
                    call.merge(
                        serde_json::from_value(value.clone())
                            .map_err(|_| "invalid_responses_event")?,
                    );
                    let observation = call.evidence();
                    self.evidence(&id, observation)?;
                }
                WireItem::Message {
                    content: Some(original),
                    ..
                } => {
                    if let Some(parts) = value["content"].as_array() {
                        for citation in search::terminal_citations(original, parts)? {
                            self.evidence(&id, citation)?;
                        }
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn response_identity(&mut self, id: Option<String>) -> Result<(), &'static str> {
        if let Some(id) = id {
            if !valid_item_id(&id)
                || self
                    .response_id
                    .as_ref()
                    .is_some_and(|previous| previous != &id)
            {
                return Err("response_identity_changed");
            }
            self.response_id = Some(id);
        }
        Ok(())
    }

    fn terminal_metadata(
        &mut self,
        id: Option<String>,
        usage: Option<TokenUsage>,
    ) -> Result<(), &'static str> {
        self.response_identity(id)?;
        if let Some(usage) = usage {
            self.usage.observe(
                &self.attempt,
                self.scope.producer.as_str(),
                [
                    (INPUT_TOKENS, usage.input_tokens),
                    (OUTPUT_TOKENS, usage.output_tokens),
                    (
                        CACHED_INPUT_TOKENS,
                        usage.input_tokens_details.and_then(|d| d.cached_tokens),
                    ),
                    (
                        REASONING_OUTPUT_TOKENS,
                        usage.output_tokens_details.and_then(|d| d.reasoning_tokens),
                    ),
                ],
                true,
                &mut self.updates,
            );
        }
        Ok(())
    }

    fn partial_item(&mut self, id: &str) -> Result<&mut PartialItem, &'static str> {
        let ordinal = self.partial.len();
        match self.partial.entry(id.into()) {
            std::collections::btree_map::Entry::Occupied(entry) => Ok(entry.into_mut()),
            std::collections::btree_map::Entry::Vacant(entry) => {
                if !valid_item_id(id) {
                    return Err("invalid_output_item_identity");
                }
                let message = short_identity("message", &(&self.attempt, id))
                    .and_then(MessageId::new)
                    .map_err(|_| "output_item_identity_failed")?;
                Ok(entry.insert(PartialItem {
                    message: Message {
                        id: message,
                        role: Role::Assistant,
                        phase: None,
                        content: Vec::new(),
                        provenance: Provenance {
                            source: self.scope.producer.to_string(),
                            kind: ProvenanceKind::Generated,
                            fingerprint: None,
                        },
                    },
                    ordinal,
                    visible: Visible::default(),
                    annotations: BTreeMap::new(),
                    search: None,
                }))
            }
        }
    }

    fn delta(&mut self, id: &str, channel: Channel, delta: &str) -> Result<(), &'static str> {
        if self.done_ids.contains(id) {
            return Err("output_item_already_completed");
        }
        let partial = self.partial_item(id)?;
        partial.visible.select(channel).push_str(delta);
        let message = partial.message.id.clone();
        self.emit(message, channel, delta);
        Ok(())
    }

    fn emit(&mut self, message: MessageId, channel: Channel, delta: &str) {
        if delta.is_empty() {
            return;
        }
        let text = delta.into();
        let update = match channel {
            Channel::Text | Channel::Refusal => InferenceUpdate::TextDelta { message, text },
            Channel::Reasoning => InferenceUpdate::ReasoningDelta { message, text },
        };
        self.updates.push_back(ProviderEvent::Update(update));
    }

    fn complete_item(&mut self, index: usize, mut item: WireItem) -> Result<(), &'static str> {
        let id = item.id().to_owned();
        if self.items.contains_key(&index) || self.done_ids.contains(&id) {
            return Err("output_item_identity_reused");
        }
        match &mut item {
            WireItem::Message { .. } | WireItem::Reasoning { .. }
                if self.partial.get(&id).is_some_and(|part| {
                    part.message.content.iter().any(|content| {
                        matches!(
                            content,
                            Content::ProviderEvidence(ProviderEvidence::WebSearch { .. })
                        )
                    })
                }) =>
            {
                return Err("output_item_type_changed");
            }
            WireItem::Message {
                role,
                phase,
                content,
                ..
            } => {
                if role.as_deref().is_some_and(|role| role != "assistant") {
                    return Err("invalid_output_message_role");
                }
                let partial = self.partial_item(&id)?;
                partial.message.phase = phase.map(Into::into);
                if partial.visible.reasoning.is_empty() {
                    let content = content.get_or_insert_with(|| {
                        let mut parts = Vec::new();
                        if !partial.visible.text.is_empty() {
                            parts.push(WireContent::OutputText {
                                text: partial.visible.text.clone(),
                                annotations: Vec::new(),
                            });
                        }
                        if !partial.visible.refusal.is_empty() {
                            parts.push(WireContent::Refusal {
                                refusal: partial.visible.refusal.clone(),
                            });
                        }
                        parts
                    });
                    let mut final_text = String::new();
                    let mut refusal = String::new();
                    let pending = std::mem::take(&mut partial.annotations);
                    let mut offset = 0;
                    let mut citations = Vec::new();
                    for (part_index, part) in content.iter_mut().enumerate() {
                        match part {
                            WireContent::OutputText { text, annotations } => {
                                let count = text.chars().count();
                                if self.search {
                                    for annotation in annotations
                                        .iter()
                                        .chain(
                                            pending
                                                .range((part_index, 0)..=(part_index, usize::MAX))
                                                .map(|(_, v)| v),
                                        )
                                        .take(search::MAX_CITATIONS)
                                    {
                                        if let Some(citation) =
                                            search::citation(annotation, count, offset)
                                        {
                                            citations.push(citation);
                                        }
                                    }
                                }
                                annotations.clear();
                                final_text.push_str(text);
                                offset += count;
                            }
                            WireContent::Refusal { refusal: text } => refusal.push_str(text),
                        }
                    }
                    self.sync_text(&id, Channel::Text, &final_text)?;
                    self.sync_text(&id, Channel::Refusal, &refusal)?;
                    for citation in citations {
                        self.evidence(&id, citation)?;
                    }
                    *role = Some("assistant".into());
                } else {
                    return Err("output_item_type_changed");
                }
            }
            WireItem::Reasoning { summary, .. } => {
                let partial = self.partial_item(&id)?;
                if !partial.visible.text.is_empty() || !partial.visible.refusal.is_empty() {
                    return Err("output_item_type_changed");
                }
                let text: String = summary
                    .iter()
                    .map(|Summary::SummaryText { text }| text.as_str())
                    .collect();
                self.sync_text(&id, Channel::Reasoning, &text)?;
            }
            WireItem::WebSearchCall { call, .. } => {
                self.search_update(&id, std::mem::take(call))?;
                *call = *self
                    .partial_item(&id)?
                    .search
                    .take()
                    .ok_or("output_items_incomplete")?;
            }
            WireItem::FunctionCall { .. } if self.partial.contains_key(&id) => {
                return Err("output_item_type_changed");
            }
            WireItem::FunctionCall { .. } => {
                self.partial_item(&id)?;
            }
        }
        self.done_ids.insert(id);
        self.items.insert(index, item);
        Ok(())
    }

    fn sync_text(&mut self, id: &str, channel: Channel, text: &str) -> Result<(), &'static str> {
        let partial = self.partial_item(id)?;
        let previous = partial.visible.select(channel);
        let suffix = text
            .strip_prefix(previous.as_str())
            .ok_or("output_item_content_changed")?;
        self.delta(id, channel, suffix)
    }

    fn validate_completion(&self, output: Option<&[Value]>) -> Result<(), &'static str> {
        if self.items.is_empty() || self.partial.len() != self.items.len() {
            return Err("output_items_incomplete");
        }
        if !self.items.keys().copied().eq(0..self.items.len()) {
            return Err("output_item_order_incomplete");
        }
        if let Some(output) = output
            && !self
                .items
                .values()
                .map(|item| (item.id(), item.kind()))
                .eq(output.iter().map(|item| {
                    (
                        item["id"].as_str().unwrap_or_default(),
                        item["type"].as_str().unwrap_or_default(),
                    )
                }))
        {
            return Err("terminal_output_changed");
        }
        Ok(())
    }

    fn completed_messages(&self) -> Result<Vec<Message>, &'static str> {
        let mut calls = BTreeSet::new();
        let mut messages = Vec::with_capacity(self.items.len());
        for item in self.items.values() {
            let mut message = self.partial[item.id()].message.clone();
            message.content = match item {
                WireItem::Message {
                    content: Some(content),
                    status,
                    ..
                } => {
                    if status.is_some_and(|status| status != ItemStatus::Completed) {
                        return Err("output_items_incomplete");
                    }
                    content
                        .iter()
                        .map(|part| match part {
                            WireContent::OutputText { text, .. } => Content::Text(text.clone()),
                            WireContent::Refusal { refusal } => Content::Text(refusal.clone()),
                        })
                        .collect()
                }
                WireItem::Message { content: None, .. } => return Err("output_items_incomplete"),
                WireItem::Reasoning { summary, .. } => summary
                    .iter()
                    .map(|Summary::SummaryText { text }| Content::Reasoning(text.clone()))
                    .collect(),
                WireItem::WebSearchCall { .. } => Vec::new(),
                WireItem::FunctionCall {
                    call_id,
                    name,
                    arguments,
                    namespace,
                    encrypted_function_args,
                    status,
                    ..
                } => {
                    if status.is_some_and(|status| status != ItemStatus::Completed) {
                        return Err("output_items_incomplete");
                    }
                    if calls.len() >= self.limits.max_tool_calls {
                        return Err("tool_call_limit");
                    }
                    if !calls.insert(call_id) {
                        return Err("invalid_tool_call_identity");
                    }
                    if namespace.is_some() || encrypted_function_args.is_some() {
                        return Err("unsupported_function_call");
                    }
                    let tool = self.names.get(name).cloned().ok_or("unoffered_tool_call")?;
                    if arguments.len() > self.limits.max_tool_argument_bytes {
                        return Err("tool_argument_limit");
                    }
                    let arguments = json_arguments(arguments);
                    let id = short_identity("call", &(&self.attempt, call_id))
                        .and_then(ToolCallId::new)
                        .map_err(|_| "tool_call_identity_failed")?;
                    vec![Content::ToolCall(ToolCall {
                        id,
                        tool,
                        arguments,
                    })]
                }
            };
            message
                .content
                .extend(self.partial[item.id()].message.content.iter().cloned());
            let state = self
                .scope
                .state(&message, item)
                .map_err(|_| "provider_state_limit")?;
            message.content.push(Content::ProviderState(state));
            messages.push(message);
        }
        Ok(messages)
    }

    fn protocol_failure(&mut self, code: &'static str) {
        let (status, kind) = match code {
            "provider_state_limit" | "tool_call_limit" | "tool_argument_limit" => {
                (InferenceStatus::Limited, FailureKind::OutputLimit)
            }
            _ => (InferenceStatus::Interrupted, FailureKind::Protocol),
        };
        self.finish(status, Some(failure(kind, code)), None);
    }

    fn finish(
        &mut self,
        status: InferenceStatus,
        failure: Option<InferenceFailure>,
        messages: Option<Vec<Message>>,
    ) {
        self.finished = true;
        self.wire.close();
        let messages = messages.unwrap_or_else(|| {
            let mut partial: Vec<_> = std::mem::take(&mut self.partial).into_values().collect();
            partial.sort_by_key(|item| item.ordinal);
            partial
                .into_iter()
                .filter_map(|mut item| {
                    let mut visible = item.visible.projection();
                    visible.append(&mut item.message.content);
                    item.message.content = visible;
                    (!item.message.content.is_empty()).then_some(item.message)
                })
                .collect()
        });
        self.updates
            .push_back(ProviderEvent::Finished(InferenceOutcome {
                status,
                messages,
                usage: self.usage.finish(false),
                failure,
                receipt: None,
                terminal_receipt: None,
            }));
    }
}

fn valid_item_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 256
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn failure(kind: FailureKind, code: &str) -> InferenceFailure {
    InferenceFailure {
        kind,
        code: code.into(),
        retry_after_ms: None,
        dispatch: None,
    }
}

fn provider_error(code: Option<&str>) -> (InferenceStatus, Option<InferenceFailure>) {
    let failure = match code {
        Some("content_filter" | "cyber_policy" | "bio_policy") => {
            return (InferenceStatus::Refused, None);
        }
        _ => classify_error(200, code, None),
    };
    let status = if failure.kind == FailureKind::ContextLimit {
        InferenceStatus::Limited
    } else {
        InferenceStatus::Failed
    };
    (status, Some(failure))
}
