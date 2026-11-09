use super::{RemoteCall, Replay, ReplayScope};
use crate::wire::{Incoming, Usage, WireStream, classify_error, short_identity};
use crate::{StreamLimits, StreamingTransport, TransportRequest};
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceOutcome, InferenceStatus,
    InferenceUpdate, ProviderEvent,
};
use agent_kit_core::messages::{
    Content, Message, Provenance, ProvenanceKind, Role, ToolArguments, ToolCall,
};
use agent_kit_core::{Envelope, MessageId, ToolCallId, ToolId};
use futures_core::stream::BoxStream;
use futures_util::stream;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::Arc;

pub(super) struct Profile {
    pub scope: ReplayScope,
    pub names: BTreeMap<String, ToolId>,
    pub requires_tool_signatures: bool,
}

pub(super) fn events(
    transport: Arc<dyn StreamingTransport>,
    request: TransportRequest,
    control: InferenceControl,
    limits: StreamLimits,
    message: MessageId,
    profile: Profile,
) -> BoxStream<'static, ProviderEvent> {
    let state = Response {
        profile,
        wire: WireStream::new(transport, request, control.clone(), limits),
        control,
        limits,
        message,
        receipt: None,
        updates: VecDeque::new(),
        usage: Usage::default(),
        content: Vec::new(),
        replay: Replay::default(),
        call_ids: BTreeSet::new(),
        response_id: None,
        first_call_signed: None,
        replay_required: false,
        stop: None,
        finished: false,
    };
    Box::pin(stream::unfold(state, |mut state| async move {
        state.next().await.map(|event| (event, state))
    }))
}

struct Response {
    profile: Profile,
    wire: WireStream,
    control: InferenceControl,
    limits: StreamLimits,
    message: MessageId,
    receipt: Option<Envelope>,
    updates: VecDeque<ProviderEvent>,
    usage: Usage,
    content: Vec<Content>,
    replay: Replay,
    call_ids: BTreeSet<String>,
    response_id: Option<String>,
    first_call_signed: Option<bool>,
    replay_required: bool,
    stop: Option<Stop>,
    finished: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Frame {
    #[serde(default)]
    candidates: Vec<Candidate>,
    usage_metadata: Option<TokenUsage>,
    prompt_feedback: Option<PromptFeedback>,
    response_id: Option<String>,
    error: Option<WireError>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Candidate {
    #[serde(default)]
    index: usize,
    content: Option<Parts>,
    finish_reason: Option<Stop>,
}

#[derive(Deserialize)]
struct Parts {
    role: Option<String>,
    #[serde(default)]
    parts: Vec<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Part {
    text: Option<String>,
    #[serde(default)]
    thought: bool,
    thought_signature: Option<String>,
    function_call: Option<Call>,
    #[serde(rename = "partMetadata")]
    _metadata: Option<BTreeMap<String, Value>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Call {
    name: String,
    id: Option<String>,
    args: Option<Value>,
    #[serde(default)]
    will_continue: bool,
    partial_args: Option<Vec<Value>>,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum Stop {
    #[serde(rename = "STOP")]
    Completed,
    #[serde(rename = "FINISH_REASON_UNSPECIFIED")]
    Unspecified,
    MaxTokens,
    Safety,
    Recitation,
    Blocklist,
    ProhibitedContent,
    Spii,
    #[serde(other)]
    Unsupported,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptFeedback {
    block_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenUsage {
    prompt_token_count: Option<u64>,
    candidates_token_count: Option<u64>,
    cached_content_token_count: Option<u64>,
    thoughts_token_count: Option<u64>,
    tool_use_prompt_token_count: Option<u64>,
}

#[derive(Deserialize)]
struct WireError {
    status: Option<String>,
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
                Incoming::Receipt(receipt) => {
                    self.receipt = Some(receipt.clone());
                    return Some(ProviderEvent::Receipt(receipt));
                }
                Incoming::Frame(frame) => {
                    if let Err(code) = self.event(&frame) {
                        self.fail(code);
                    }
                }
                Incoming::End => {
                    if let Err(code) = self.finish_at_eof() {
                        self.fail(code);
                    }
                }
                Incoming::Failure(status, failure) => self.finish(status, Some(failure), false),
            }
        }
    }

    fn event(&mut self, bytes: &[u8]) -> Result<(), &'static str> {
        let frame: Frame =
            serde_json::from_slice(bytes).map_err(|_| "invalid_generate_content_event")?;
        if let Some(error) = frame.error {
            self.finish(
                InferenceStatus::Interrupted,
                Some(classify_error(200, error.status.as_deref(), None)),
                false,
            );
            return Ok(());
        }
        if let Some(id) = frame.response_id {
            if id.is_empty()
                || id.len() > 256
                || self
                    .response_id
                    .as_ref()
                    .is_some_and(|previous| previous != &id)
            {
                return Err("response_identity_changed");
            }
            self.response_id = Some(id);
        }
        if frame.candidates.len() > 1 {
            return Err("unexpected_candidate_count");
        }
        if frame
            .prompt_feedback
            .and_then(|feedback| feedback.block_reason)
            .is_some_and(|reason| reason != "BLOCK_REASON_UNSPECIFIED")
        {
            if !frame.candidates.is_empty() || !self.content.is_empty() || self.stop.is_some() {
                return Err("unexpected_prompt_block");
            }
            self.stop = Some(Stop::Safety);
        }
        if let Some(candidate) = frame.candidates.into_iter().next() {
            if candidate.index != 0 {
                return Err("unexpected_candidate_index");
            }
            if self.stop.is_some() {
                return Err("candidate_after_finish");
            }
            if let Some(content) = candidate.content {
                if content.role.as_deref().is_some_and(|role| role != "model") {
                    return Err("unexpected_message_role");
                }
                for part in content.parts {
                    self.part(part)?;
                }
            }
            self.stop = candidate
                .finish_reason
                .filter(|reason| *reason != Stop::Unspecified);
        }
        if let Some(usage) = frame.usage_metadata {
            let source = self.profile.scope.producer.as_str();
            self.usage.observe(
                &self.control.attempt,
                source,
                [
                    ("input_tokens", usage.prompt_token_count),
                    ("output_tokens", usage.candidates_token_count),
                    ("cached_input_tokens", usage.cached_content_token_count),
                    ("reasoning_output_tokens", usage.thoughts_token_count),
                    ("tool_input_tokens", usage.tool_use_prompt_token_count),
                ],
                false,
                &mut self.updates,
            );
        }
        Ok(())
    }

    fn part(&mut self, value: Value) -> Result<(), &'static str> {
        let part: Part =
            serde_json::from_value(value.clone()).map_err(|_| "unsupported_response_part")?;
        let signed = match part.thought_signature {
            Some(signature) if signature.is_empty() => return Err("invalid_thought_signature"),
            Some(_) => true,
            None => false,
        };
        match (part.text, part.function_call) {
            (Some(text), None) => {
                let update = if part.thought {
                    self.content.push(Content::Reasoning(text.clone()));
                    InferenceUpdate::ReasoningDelta {
                        message: self.message.clone(),
                        text,
                    }
                } else {
                    self.content.push(Content::Text(text.clone()));
                    InferenceUpdate::TextDelta {
                        message: self.message.clone(),
                        text,
                    }
                };
                self.updates.push_back(ProviderEvent::Update(update));
            }
            (None, Some(call)) if !part.thought => self.call(call, signed)?,
            (None, None) if signed => {}
            _ => return Err("invalid_response_part"),
        }
        self.replay_required |= signed || part.thought;
        self.replay.parts.push(value);
        Ok(())
    }

    fn call(&mut self, call: Call, signed: bool) -> Result<(), &'static str> {
        if self.replay.calls.len() >= self.limits.max_tool_calls {
            return Err("tool_call_limit");
        }
        if call.will_continue || call.partial_args.is_some() {
            return Err("unsupported_streamed_function_arguments");
        }
        if let Some(id) = &call.id
            && (id.is_empty() || id.len() > 256 || !self.call_ids.insert(id.clone()))
        {
            return Err("invalid_tool_call_identity");
        }
        let tool = self
            .profile
            .names
            .get(&call.name)
            .cloned()
            .ok_or("unoffered_tool_call")?;
        let arguments = call.args.unwrap_or_else(|| json!({}));
        if !arguments.is_object() {
            return Err("invalid_tool_arguments");
        }
        if arguments.to_string().len() > self.limits.max_tool_argument_bytes {
            return Err("tool_argument_limit");
        }
        let id = short_identity(
            "call",
            &(&self.control.attempt, self.replay.parts.len(), &call.id),
        )
        .and_then(ToolCallId::new)
        .map_err(|_| "tool_call_identity_failed")?;
        self.first_call_signed.get_or_insert(signed);
        self.replay_required = true;
        self.replay.calls.push(RemoteCall {
            call: id.clone(),
            name: call.name,
            id: call.id,
        });
        self.content.push(Content::ToolCall(ToolCall {
            id,
            tool,
            arguments: ToolArguments::Json(arguments),
        }));
        Ok(())
    }

    fn finish_at_eof(&mut self) -> Result<(), &'static str> {
        let status = match self.stop.ok_or("missing_finish_reason")? {
            Stop::Completed => InferenceStatus::Completed,
            Stop::MaxTokens => InferenceStatus::Limited,
            Stop::Safety
            | Stop::Recitation
            | Stop::Blocklist
            | Stop::ProhibitedContent
            | Stop::Spii => InferenceStatus::Refused,
            Stop::Unspecified | Stop::Unsupported => return Err("unsupported_finish_reason"),
        };
        if status == InferenceStatus::Completed && self.replay_required {
            if self.profile.requires_tool_signatures && self.first_call_signed == Some(false) {
                return Err("missing_tool_thought_signature");
            }
            let state = self
                .replay
                .state(&self.profile.scope, &self.message, &self.content)
                .map_err(|_| "provider_state_encoding_failed")?;
            self.content.push(Content::ProviderState(state));
        }
        self.finish(status, None, true);
        Ok(())
    }

    fn fail(&mut self, code: &str) {
        self.finish(
            InferenceStatus::Interrupted,
            Some(InferenceFailure {
                kind: FailureKind::Protocol,
                code: code.into(),
                retry_after_ms: None,
            }),
            false,
        );
    }

    fn finish(
        &mut self,
        status: InferenceStatus,
        failure: Option<InferenceFailure>,
        final_usage: bool,
    ) {
        self.finished = true;
        self.wire.close();
        if status != InferenceStatus::Completed {
            self.content
                .retain(|part| !matches!(part, Content::ToolCall(_)));
        }
        let messages = if self.content.is_empty() {
            Vec::new()
        } else {
            vec![Message {
                id: self.message.clone(),
                role: Role::Assistant,
                phase: None,
                content: std::mem::take(&mut self.content),
                provenance: Provenance {
                    source: self.profile.scope.producer.to_string(),
                    kind: ProvenanceKind::Generated,
                    fingerprint: None,
                },
            }]
        };
        self.updates
            .push_back(ProviderEvent::Finished(InferenceOutcome {
                status,
                messages,
                usage: self.usage.finish(final_usage),
                failure,
                receipt: self.receipt.take(),
            }));
    }
}
