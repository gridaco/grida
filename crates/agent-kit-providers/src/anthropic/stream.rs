use crate::wire::{Incoming, Usage, WireStream, classify_error, short_identity};
use crate::{StreamLimits, StreamingTransport, TransportRequest};
use agent_kit_core::inference::usage::{
    CACHE_CREATION_INPUT_TOKENS, CACHED_INPUT_TOKENS, OUTPUT_TOKENS, UNCACHED_INPUT_TOKENS,
};
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
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::Arc;

pub(super) fn events(
    transport: Arc<dyn StreamingTransport>,
    request: TransportRequest,
    control: InferenceControl,
    limits: StreamLimits,
    names: BTreeMap<String, ToolId>,
    message: MessageId,
) -> BoxStream<'static, ProviderEvent> {
    let source = request.binding.provider.to_string();
    let state = Response {
        wire: WireStream::new(transport, request, control.clone(), limits),
        control,
        limits,
        names,
        message,
        source,
        receipt: None,
        updates: VecDeque::new(),
        usage: Usage::default(),
        content: Vec::new(),
        call_ids: BTreeSet::new(),
        block: None,
        next_index: 0,
        started: false,
        stop: None,
        finished: false,
    };
    Box::pin(stream::unfold(state, |mut state| async move {
        state.next().await.map(|event| (event, state))
    }))
}

struct Response {
    wire: WireStream,
    control: InferenceControl,
    limits: StreamLimits,
    names: BTreeMap<String, ToolId>,
    message: MessageId,
    source: String,
    receipt: Option<Envelope>,
    updates: VecDeque<ProviderEvent>,
    usage: Usage,
    content: Vec<Content>,
    call_ids: BTreeSet<String>,
    block: Option<Block>,
    next_index: usize,
    started: bool,
    stop: Option<Stop>,
    finished: bool,
}

enum Block {
    Text(String),
    Tool {
        id: String,
        tool: ToolId,
        initial: Value,
        fragments: String,
    },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    MessageStart {
        message: Start,
    },
    ContentBlockStart {
        index: usize,
        content_block: BlockStart,
    },
    ContentBlockDelta {
        index: usize,
        delta: Delta,
    },
    ContentBlockStop {
        index: usize,
    },
    MessageDelta {
        delta: MessageDelta,
        usage: Option<TokenUsage>,
    },
    MessageStop,
    Error {
        error: WireError,
    },
    Ping,
    #[serde(other)]
    Unknown,
}

#[derive(Deserialize)]
struct Start {
    role: String,
    content: Vec<Value>,
    usage: Option<TokenUsage>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BlockStart {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(other)]
    Unsupported,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Delta {
    #[serde(rename = "text_delta")]
    Text { text: String },
    #[serde(rename = "input_json_delta")]
    Json { partial_json: String },
    #[serde(other)]
    Unsupported,
}

#[derive(Deserialize)]
struct MessageDelta {
    stop_reason: Option<Stop>,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Stop {
    EndTurn,
    #[serde(rename = "stop_sequence")]
    Sequence,
    ToolUse,
    MaxTokens,
    ModelContextWindowExceeded,
    Refusal,
    #[serde(other)]
    Unsupported,
}

#[derive(Deserialize)]
struct TokenUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
}

#[derive(Deserialize)]
struct WireError {
    #[serde(rename = "type")]
    kind: String,
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
                Incoming::End => self.fail("missing_terminal_event"),
                Incoming::Failure(status, failure) => self.finish(status, Some(failure), false),
            }
        }
    }

    fn event(&mut self, frame: &[u8]) -> Result<(), &'static str> {
        let event = serde_json::from_slice(frame).map_err(|_| "invalid_message_event")?;
        match event {
            Event::MessageStart { message } => {
                if self.started || message.role != "assistant" || !message.content.is_empty() {
                    return Err("invalid_message_start");
                }
                self.started = true;
                self.observe_usage(message.usage);
            }
            Event::ContentBlockStart {
                index,
                content_block,
            } => {
                if !self.started
                    || self.stop.is_some()
                    || self.block.is_some()
                    || index != self.next_index
                {
                    return Err("unexpected_content_block");
                }
                self.block = Some(match content_block {
                    BlockStart::Text { text } => {
                        self.text_delta(&text);
                        Block::Text(text)
                    }
                    BlockStart::ToolUse { id, name, input } => {
                        if self.call_ids.len() >= self.limits.max_tool_calls {
                            return Err("tool_call_limit");
                        }
                        if id.is_empty() || id.len() > 256 || !self.call_ids.insert(id.clone()) {
                            return Err("invalid_tool_call_identity");
                        }
                        if !input.is_object()
                            || input.to_string().len() > self.limits.max_tool_argument_bytes
                        {
                            return Err("invalid_tool_arguments");
                        }
                        let tool = self
                            .names
                            .get(&name)
                            .cloned()
                            .ok_or("unoffered_tool_call")?;
                        Block::Tool {
                            id,
                            tool,
                            initial: input,
                            fragments: String::new(),
                        }
                    }
                    BlockStart::Unsupported => return Err("unsupported_content_block"),
                });
            }
            Event::ContentBlockDelta { index, delta } => {
                if index != self.next_index {
                    return Err("unexpected_content_block");
                }
                match (self.block.as_mut(), delta) {
                    (Some(Block::Text(text)), Delta::Text { text: delta }) => {
                        text.push_str(&delta);
                        self.text_delta(&delta);
                    }
                    (Some(Block::Tool { fragments, .. }), Delta::Json { partial_json }) => {
                        if partial_json.len()
                            > self
                                .limits
                                .max_tool_argument_bytes
                                .saturating_sub(fragments.len())
                        {
                            return Err("tool_argument_limit");
                        }
                        fragments.push_str(&partial_json);
                    }
                    _ => return Err("unexpected_content_delta"),
                }
            }
            Event::ContentBlockStop { index } => {
                if index != self.next_index {
                    return Err("unexpected_content_block");
                }
                let block = self.block.take().ok_or("unexpected_content_block")?;
                let part = match block {
                    Block::Text(text) => Content::Text(text),
                    Block::Tool {
                        id,
                        tool,
                        initial,
                        fragments,
                    } => {
                        let arguments = if fragments.is_empty() {
                            initial
                        } else {
                            if !initial.as_object().is_some_and(|object| object.is_empty()) {
                                return Err("ambiguous_tool_arguments");
                            }
                            serde_json::from_str(&fragments)
                                .map_err(|_| "invalid_tool_arguments")?
                        };
                        if !arguments.is_object() {
                            return Err("invalid_tool_arguments");
                        }
                        let id = short_identity("call", &(&self.control.attempt, index, id))
                            .and_then(ToolCallId::new)
                            .map_err(|_| "tool_call_identity_failed")?;
                        let call = ToolCall {
                            id,
                            tool,
                            arguments: ToolArguments::Json(arguments),
                        };
                        self.updates
                            .push_back(ProviderEvent::Update(InferenceUpdate::ToolCall(
                                call.clone(),
                            )));
                        Content::ToolCall(call)
                    }
                };
                self.content.push(part);
                self.next_index += 1;
            }
            Event::MessageDelta { delta, usage } => {
                if !self.started || self.block.is_some() {
                    return Err("unexpected_message_delta");
                }
                if let Some(stop) = delta.stop_reason
                    && self
                        .stop
                        .replace(stop)
                        .is_some_and(|previous| previous != stop)
                {
                    return Err("stop_reason_changed");
                }
                self.observe_usage(usage);
            }
            Event::MessageStop => {
                if !self.started || self.block.is_some() {
                    return Err("unexpected_message_stop");
                }
                let stop = self.stop.ok_or("missing_stop_reason")?;
                let status = match stop {
                    Stop::ToolUse if self.call_ids.is_empty() => return Err("missing_tool_calls"),
                    Stop::EndTurn | Stop::Sequence if !self.call_ids.is_empty() => {
                        return Err("unexpected_tool_calls");
                    }
                    Stop::ToolUse | Stop::EndTurn | Stop::Sequence => InferenceStatus::Completed,
                    Stop::MaxTokens | Stop::ModelContextWindowExceeded => InferenceStatus::Limited,
                    Stop::Refusal => InferenceStatus::Refused,
                    Stop::Unsupported => return Err("unsupported_stop_reason"),
                };
                let failure =
                    (stop == Stop::ModelContextWindowExceeded).then(|| InferenceFailure {
                        kind: FailureKind::ContextLimit,
                        code: "context_limit".into(),
                        retry_after_ms: None,
                        dispatch: None,
                    });
                self.finish(status, failure, true);
            }
            Event::Error { error } => {
                self.finish(
                    InferenceStatus::Interrupted,
                    Some(classify_error(200, Some(&error.kind), None)),
                    false,
                );
            }
            Event::Ping | Event::Unknown => {}
        }
        Ok(())
    }

    fn text_delta(&mut self, text: &str) {
        if !text.is_empty() {
            self.updates
                .push_back(ProviderEvent::Update(InferenceUpdate::TextDelta {
                    message: self.message.clone(),
                    text: text.into(),
                }));
        }
    }

    fn observe_usage(&mut self, usage: Option<TokenUsage>) {
        if let Some(usage) = usage {
            self.usage.observe(
                &self.control.attempt,
                &self.source,
                [
                    (UNCACHED_INPUT_TOKENS, usage.input_tokens),
                    (OUTPUT_TOKENS, usage.output_tokens),
                    (
                        CACHE_CREATION_INPUT_TOKENS,
                        usage.cache_creation_input_tokens,
                    ),
                    (CACHED_INPUT_TOKENS, usage.cache_read_input_tokens),
                ],
                false,
                &mut self.updates,
            );
        }
    }

    fn fail(&mut self, code: &str) {
        self.finish(
            InferenceStatus::Interrupted,
            Some(InferenceFailure {
                kind: FailureKind::Protocol,
                code: code.into(),
                retry_after_ms: None,
                dispatch: None,
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
        if let Some(Block::Text(text)) = self.block.take() {
            self.content.push(Content::Text(text));
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
                    source: self.source.clone(),
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
                terminal_receipt: None,
            }));
    }
}
