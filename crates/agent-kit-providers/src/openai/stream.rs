use crate::StreamLimits;
use crate::wire::short_identity;
use crate::wire::{Incoming, RateRejectionEvidence, WireError, WireStream, classify_error};
use crate::{StreamingTransport, TerminalReceiptDecoder, TransportRequest};
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceOutcome, InferenceStatus,
    InferenceUpdate, MeasurementKind, ProviderEvent, UsageObservation,
};
use agent_kit_core::messages::{
    Content, Message, Provenance, ProvenanceKind, Role, ToolArguments, ToolCall,
};
use agent_kit_core::{Envelope, MessageId, ToolCallId, ToolId};
use futures_core::stream::BoxStream;
use futures_util::stream;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::Arc;

pub(super) fn events(
    transport: Arc<dyn StreamingTransport>,
    request: TransportRequest,
    control: InferenceControl,
    limits: StreamLimits,
    names: BTreeMap<String, ToolId>,
    message_id: MessageId,
    rate_rejection_evidence: RateRejectionEvidence,
) -> BoxStream<'static, ProviderEvent> {
    let source = request.binding.provider.to_string();
    let receipt_decoder = transport.terminal_receipt_decoder();
    let state = ResponseStream {
        wire: WireStream::new(transport, request, control.clone(), limits)
            .with_rate_rejection_evidence(rate_rejection_evidence),
        control,
        limits,
        names,
        updates: VecDeque::new(),
        source,
        message_id,
        response_id: None,
        receipt: None,
        receipt_decoder,
        terminal_receipt: None,
        text: String::new(),
        reasoning: String::new(),
        refusal: String::new(),
        call_parts: BTreeMap::new(),
        calls: Vec::new(),
        usage: BTreeMap::new(),
        usage_revision: 0,
        finish_reason: None,
        finished: false,
    };
    Box::pin(stream::unfold(state, |mut state| async move {
        state.next().await.map(|event| (event, state))
    }))
}

struct ResponseStream {
    wire: WireStream,
    control: InferenceControl,
    limits: StreamLimits,
    names: BTreeMap<String, ToolId>,
    updates: VecDeque<ProviderEvent>,
    source: String,
    message_id: MessageId,
    response_id: Option<String>,
    receipt: Option<Envelope>,
    receipt_decoder: Option<Arc<TerminalReceiptDecoder>>,
    terminal_receipt: Option<Envelope>,
    text: String,
    reasoning: String,
    refusal: String,
    call_parts: BTreeMap<usize, CallParts>,
    calls: Vec<ToolCall>,
    usage: BTreeMap<&'static str, UsageObservation>,
    usage_revision: u64,
    finish_reason: Option<FinishReason>,
    finished: bool,
}

#[derive(Default)]
struct CallParts {
    id: Option<String>,
    name: String,
    arguments: String,
}

#[derive(Deserialize)]
struct Chunk {
    id: Option<String>,
    #[serde(default)]
    choices: Vec<Choice>,
    usage: Option<Usage>,
    error: Option<WireError>,
}

#[derive(Deserialize)]
struct Choice {
    index: usize,
    #[serde(default)]
    delta: Delta,
    finish_reason: Option<FinishReason>,
}

#[derive(Default, Deserialize)]
struct Delta {
    role: Option<String>,
    content: Option<String>,
    #[serde(alias = "reasoning_content")]
    reasoning: Option<String>,
    refusal: Option<String>,
    tool_calls: Option<Vec<CallDelta>>,
}

#[derive(Deserialize)]
struct CallDelta {
    index: usize,
    id: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    function: Option<FunctionDelta>,
}

#[derive(Deserialize)]
struct FunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum FinishReason {
    Stop,
    Length,
    ToolCalls,
    ContentFilter,
}

#[derive(Deserialize)]
struct Usage {
    prompt_tokens: Option<u64>,
    completion_tokens: Option<u64>,
    prompt_tokens_details: Option<PromptDetails>,
    completion_tokens_details: Option<CompletionDetails>,
}

#[derive(Deserialize)]
struct PromptDetails {
    cached_tokens: Option<u64>,
}
#[derive(Deserialize)]
struct CompletionDetails {
    reasoning_tokens: Option<u64>,
}

impl ResponseStream {
    async fn next(&mut self) -> Option<ProviderEvent> {
        loop {
            if let Some(update) = self.updates.pop_front() {
                return Some(update);
            }
            if self.finished {
                return None;
            }
            match self.wire.next().await {
                Incoming::Receipt(receipt) => {
                    self.receipt = Some(receipt.clone());
                    return Some(ProviderEvent::Receipt(receipt));
                }
                Incoming::Frame(frame) => {
                    if let Err(code) = self.event(&frame) {
                        self.fail(InferenceStatus::Interrupted, FailureKind::Protocol, code);
                    }
                }
                Incoming::End => self.fail(
                    InferenceStatus::Interrupted,
                    FailureKind::Protocol,
                    "missing_terminal_event",
                ),
                Incoming::Failure(status, failure) => self.finish(status, Some(failure)),
            }
        }
    }

    fn event(&mut self, bytes: &[u8]) -> Result<(), &'static str> {
        let event = std::str::from_utf8(bytes)
            .map_err(|_| "invalid_event_encoding")?
            .trim();
        if event.is_empty() {
            return Ok(());
        }
        if event == "[DONE]" {
            let reason = self.finish_reason.ok_or("missing_finish_reason")?;
            let status = match reason {
                FinishReason::Length => InferenceStatus::Limited,
                FinishReason::ContentFilter => InferenceStatus::Refused,
                FinishReason::Stop if !self.refusal.is_empty() => InferenceStatus::Refused,
                FinishReason::Stop | FinishReason::ToolCalls => InferenceStatus::Completed,
            };
            self.finish(status, None);
            return Ok(());
        }
        let chunk: Chunk = serde_json::from_str(event).map_err(|_| "invalid_completion_chunk")?;
        if let Some(error) = chunk.error {
            let failure = classify_error(200, error.code(), None);
            self.finish(InferenceStatus::Interrupted, Some(failure));
            return Ok(());
        }
        if let Some(id) = chunk.id {
            if id.is_empty()
                || id.len() > 256
                || self
                    .response_id
                    .as_ref()
                    .is_some_and(|existing| existing != &id)
            {
                return Err("response_identity_changed");
            }
            self.response_id = Some(id);
        }
        if chunk.choices.is_empty() && chunk.usage.is_none() {
            return Err("empty_completion_chunk");
        }
        if chunk.choices.len() > 1 {
            return Err("unexpected_choice_count");
        }
        let final_usage = chunk.choices.is_empty() && self.finish_reason.is_some();
        if let Some(choice) = chunk.choices.into_iter().next() {
            self.choice(choice)?;
            if self.finish_reason.is_some()
                && let (Some(decoder), Some(receipt)) = (&self.receipt_decoder, &self.receipt)
            {
                self.terminal_receipt = decoder(receipt, bytes);
            }
        }
        if let Some(usage) = chunk.usage {
            self.observe_usage(usage, final_usage);
        }
        Ok(())
    }

    fn choice(&mut self, choice: Choice) -> Result<(), &'static str> {
        if choice.index != 0 {
            return Err("unexpected_choice_index");
        }
        if self.finish_reason.is_some() {
            return Err("choice_after_finish");
        }
        if choice
            .delta
            .role
            .as_deref()
            .is_some_and(|role| role != "assistant")
        {
            return Err("unexpected_message_role");
        }
        if let Some(text) = choice.delta.reasoning.filter(|text| !text.is_empty()) {
            self.reasoning.push_str(&text);
            self.updates
                .push_back(ProviderEvent::Update(InferenceUpdate::ReasoningDelta {
                    message: self.message_id.clone(),
                    text,
                }));
        }
        if let Some(text) = choice.delta.content.filter(|text| !text.is_empty()) {
            self.text.push_str(&text);
            self.updates
                .push_back(ProviderEvent::Update(InferenceUpdate::TextDelta {
                    message: self.message_id.clone(),
                    text,
                }));
        }
        if let Some(refusal) = choice.delta.refusal {
            self.refusal.push_str(&refusal);
        }
        for delta in choice.delta.tool_calls.unwrap_or_default() {
            self.call_delta(delta)?;
        }
        if let Some(reason) = choice.finish_reason {
            match reason {
                FinishReason::ToolCalls => self.complete_calls()?,
                FinishReason::Stop if !self.call_parts.is_empty() => {
                    return Err("unfinished_tool_calls");
                }
                _ => {}
            }
            self.finish_reason = Some(reason);
        }
        Ok(())
    }

    fn call_delta(&mut self, delta: CallDelta) -> Result<(), &'static str> {
        if delta.index >= self.limits.max_tool_calls {
            return Err("tool_call_limit");
        }
        if delta.kind.as_deref().is_some_and(|kind| kind != "function") {
            return Err("unsupported_tool_call_type");
        }
        let parts = self.call_parts.entry(delta.index).or_default();
        if let Some(id) = delta.id {
            if id.is_empty()
                || id.len() > 256
                || parts.id.as_ref().is_some_and(|existing| existing != &id)
            {
                return Err("tool_call_identity_changed");
            }
            parts.id = Some(id);
        }
        if let Some(function) = delta.function {
            if let Some(name) = function.name {
                if name.len() > 64usize.saturating_sub(parts.name.len()) {
                    return Err("tool_name_limit");
                }
                parts.name.push_str(&name);
            }
            if let Some(arguments) = function.arguments {
                if arguments.len()
                    > self
                        .limits
                        .max_tool_argument_bytes
                        .saturating_sub(parts.arguments.len())
                {
                    return Err("tool_argument_limit");
                }
                parts.arguments.push_str(&arguments);
            }
        }
        Ok(())
    }

    fn complete_calls(&mut self) -> Result<(), &'static str> {
        if self.call_parts.is_empty() {
            return Err("missing_tool_calls");
        }
        let mut seen = BTreeSet::new();
        let mut calls = Vec::new();
        for (index, parts) in &self.call_parts {
            let source_id = parts.id.as_ref().ok_or("missing_tool_call_identity")?;
            if !seen.insert(source_id) {
                return Err("duplicate_tool_call_identity");
            }
            let tool = self
                .names
                .get(&parts.name)
                .cloned()
                .ok_or("unoffered_tool_call")?;
            let id = short_identity("call", &(&self.control.attempt, index, source_id))
                .map_err(|_| "tool_call_identity_failed")?;
            let id = ToolCallId::new(id).map_err(|_| "tool_call_identity_failed")?;
            let arguments =
                serde_json::from_str(&parts.arguments).map_err(|_| "invalid_tool_arguments")?;
            calls.push(ToolCall {
                id,
                tool,
                arguments: ToolArguments::Json(arguments),
            });
        }
        for call in &calls {
            self.updates
                .push_back(ProviderEvent::Update(InferenceUpdate::ToolCall(
                    call.clone(),
                )));
        }
        self.calls = calls;
        self.call_parts.clear();
        Ok(())
    }

    fn observe_usage(&mut self, usage: Usage, final_value: bool) {
        self.usage_revision += 1;
        let values = [
            ("input_tokens", usage.prompt_tokens),
            ("output_tokens", usage.completion_tokens),
            (
                "cached_input_tokens",
                usage
                    .prompt_tokens_details
                    .and_then(|details| details.cached_tokens),
            ),
            (
                "reasoning_output_tokens",
                usage
                    .completion_tokens_details
                    .and_then(|details| details.reasoning_tokens),
            ),
        ];
        for (category, quantity) in values {
            let Some(quantity) = quantity else {
                continue;
            };
            let observation = UsageObservation {
                attempt: self.control.attempt.clone(),
                source: self.source.clone(),
                category: category.into(),
                unit: "tokens".into(),
                revision: self.usage_revision,
                quantity,
                certainty: MeasurementKind::Exact,
                final_value,
            };
            self.usage.insert(category, observation.clone());
            self.updates
                .push_back(ProviderEvent::Update(InferenceUpdate::Usage(observation)));
        }
    }

    fn fail(&mut self, status: InferenceStatus, kind: FailureKind, code: &str) {
        self.finish(
            status,
            Some(InferenceFailure {
                kind,
                code: code.into(),
                retry_after_ms: None,
                dispatch: None,
            }),
        );
    }

    fn finish(&mut self, status: InferenceStatus, failure: Option<InferenceFailure>) {
        self.finished = true;
        self.wire.close();
        let mut content = Vec::new();
        if !self.reasoning.is_empty() {
            content.push(Content::Reasoning(std::mem::take(&mut self.reasoning)));
        }
        if !self.text.is_empty() {
            content.push(Content::Text(std::mem::take(&mut self.text)));
        }
        if !self.refusal.is_empty() {
            content.push(Content::Text(std::mem::take(&mut self.refusal)));
        }
        content.extend(
            std::mem::take(&mut self.calls)
                .into_iter()
                .map(Content::ToolCall),
        );
        let messages = if content.is_empty() {
            vec![]
        } else {
            vec![Message {
                id: self.message_id.clone(),
                role: Role::Assistant,
                phase: None,
                content,
                provenance: Provenance {
                    source: self.source.clone(),
                    kind: ProvenanceKind::Generated,
                    fingerprint: None,
                },
            }]
        };
        let terminal_receipt = if failure.is_none() {
            self.terminal_receipt.take()
        } else {
            None
        };
        self.updates
            .push_back(ProviderEvent::Finished(InferenceOutcome {
                status,
                messages,
                usage: std::mem::take(&mut self.usage).into_values().collect(),
                failure,
                receipt: self.receipt.take(),
                terminal_receipt,
            }));
    }
}
