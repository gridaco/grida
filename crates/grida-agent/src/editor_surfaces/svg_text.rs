//! GRIDA-SEC-004 — one renderer-owned, revision-bound SVG text operation.

use super::{EditorSurfaces, REPLY_TIMEOUT, valid_path};
use crate::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
};
use agent_client_protocol::{JsonRpcRequest, JsonRpcResponse};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::{BindingId, BoxFuture, Error, ErrorKind, Result, SessionId, ToolId};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

pub(crate) const CAPABILITY: &str = "co.grida/session/editor-svg-text";
pub(crate) const READ_TEXT: &str = "svg_read_selected_text";
pub(crate) const REPLACE_TEXT: &str = "svg_replace_selected_text";
const TEXT_BYTES: usize = 4096;

pub(super) fn tools(
    owner: EditorSurfaces,
    session: SessionId,
    endpoint: BindingId,
    target: BindingId,
) -> Result<[(CapabilityDefinition, Arc<dyn CapabilityExecutor>); 2]> {
    let read = Arc::new(SvgText {
        owner: owner.clone(),
        session: session.clone(),
        endpoint: endpoint.clone(),
        target: target.clone(),
        replace: false,
    });
    let replace = Arc::new(SvgText {
        owner,
        session,
        endpoint,
        target,
        replace: true,
    });
    Ok([(definition(false)?, read), (definition(true)?, replace)])
}

fn definition(replace: bool) -> Result<CapabilityDefinition> {
    let (name, description, effect, input, output) = if replace {
        (
            REPLACE_TEXT,
            "Replace the captured selected SVG text using the revision from svg_read_selected_text. The live edit is undoable and leaves saving to the editor's normal Save action.",
            CapabilityEffect::Mutation,
            json!({"type":"object","properties":{"revision":{"type":"string","maxLength":36},"text":{"type":"string","maxLength":TEXT_BYTES}},"required":["revision","text"],"additionalProperties":false}),
            json!({"type":"object","properties":{"kind":{"enum":["applied","unchanged"]},"path":{"type":"string"},"saved":{"const":false}},"required":["kind","path","saved"],"additionalProperties":false}),
        )
    } else {
        (
            READ_TEXT,
            "Read the selected plain text in the SVG captured when this workspace Act message was sent. The revision is valid only while the exact view, document and selection remain current.",
            CapabilityEffect::Read,
            json!({"type":"object","additionalProperties":false}),
            json!({"type":"object","properties":{"kind":{"const":"read"},"path":{"type":"string"},"revision":{"type":"string"},"text":{"type":"string"}},"required":["kind","path","revision","text"],"additionalProperties":false}),
        )
    };
    Ok(CapabilityDefinition {
        tool: ToolDefinition {
            id: ToolId::new(name)?,
            version: 1,
            description: description.into(),
            input: InputFormat::Json(input),
            max_input_bytes: if replace { 9 * 1024 } else { 32 },
            max_output_bytes: 16 * 1024,
            recovery: RecoveryKind::Unavailable,
        },
        output_schema: output,
        effect,
    })
}

struct SvgText {
    owner: EditorSurfaces,
    session: SessionId,
    endpoint: BindingId,
    target: BindingId,
    replace: bool,
}

impl SvgText {
    fn operation(&self, arguments: &Value) -> Result<Operation> {
        let invalid = || Error::new(ErrorKind::InvalidInput, "invalid_svg_text_arguments");
        let fields = arguments.as_object().ok_or_else(invalid)?;
        if !self.replace {
            return if fields.is_empty() {
                Ok(Operation::Read)
            } else {
                Err(invalid())
            };
        }
        if fields.len() != 2 {
            return Err(invalid());
        }
        let revision = fields
            .get("revision")
            .and_then(Value::as_str)
            .ok_or_else(invalid)?;
        let text = fields
            .get("text")
            .and_then(Value::as_str)
            .filter(|text| valid_text(text))
            .ok_or_else(invalid)?;
        if uuid::Uuid::parse_str(revision).is_err() {
            return Err(invalid());
        }
        Ok(Operation::Replace {
            revision: BindingId::new(revision)?,
            text: text.to_owned(),
        })
    }

    async fn run(&self, call: &CapabilityCall) -> ToolOutcome {
        let Ok(operation) = self.operation(&call.arguments) else {
            return ToolOutcome::failed("invalid_svg_text_arguments");
        };
        if matches!(&operation, Operation::Replace { revision, .. } if revision != &self.target) {
            return ToolOutcome::failed("svg_text_revision_changed");
        }
        let Some(connection) = self.owner.svg_client() else {
            return ToolOutcome::failed("svg_text_endpoint_unavailable");
        };
        let deadline = call.deadline.min(Instant::now() + REPLY_TIMEOUT);
        let Some(expires_at_ms) = SystemTime::now()
            .checked_add(deadline.saturating_duration_since(Instant::now()))
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .and_then(|time| u64::try_from(time.as_millis()).ok())
        else {
            return ToolOutcome::failed("svg_text_endpoint_unavailable");
        };
        let request = Request {
            session_id: self.session.clone(),
            endpoint_id: self.endpoint.clone(),
            target_id: self.target.clone(),
            call_id: call.binding.id.clone(),
            expires_at_ms,
            operation,
        };
        tokio::select! {
            biased;
            _ = call.cancellation.cancelled() => ToolOutcome::uncertain(),
            _ = tokio::time::sleep_until(deadline.into()) => ToolOutcome::uncertain(),
            reply = connection.send_request(request.clone()).block_task() => {
                reply.map_or_else(|_| ToolOutcome::uncertain(), |reply| reply.outcome(&request))
            }
        }
    }
}

impl CapabilityExecutor for SvgText {
    fn validate(&self, arguments: &Value) -> Result<()> {
        self.operation(arguments).map(|_| ())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = self.run(&call).await;
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Operation {
    Read,
    Replace { revision: BindingId, text: String },
}

#[derive(Clone, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/editor/svg-selected-text", response = Reply)]
#[serde(rename_all = "camelCase")]
struct Request {
    session_id: SessionId,
    endpoint_id: BindingId,
    target_id: BindingId,
    call_id: BindingId,
    expires_at_ms: u64,
    operation: Operation,
}

#[derive(Clone, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reply {
    session_id: SessionId,
    endpoint_id: BindingId,
    target_id: BindingId,
    call_id: BindingId,
    result: DomainResult,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum DomainResult {
    Read {
        path: String,
        revision: BindingId,
        text: String,
    },
    Applied {
        path: String,
        saved: bool,
    },
    Unchanged {
        path: String,
        saved: bool,
    },
    Unavailable,
    Stale,
}

impl std::fmt::Debug for Request {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SvgTextRequest")
    }
}

impl std::fmt::Debug for Reply {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SvgTextReply")
    }
}

impl Reply {
    fn outcome(self, request: &Request) -> ToolOutcome {
        if self.session_id != request.session_id
            || self.endpoint_id != request.endpoint_id
            || self.target_id != request.target_id
            || self.call_id != request.call_id
        {
            return ToolOutcome::uncertain();
        }
        match (&request.operation, &self.result) {
            (_, DomainResult::Unavailable) => {
                return ToolOutcome::failed("svg_text_endpoint_unavailable");
            }
            (Operation::Replace { .. }, DomainResult::Stale) => {
                return ToolOutcome::failed("svg_text_revision_changed");
            }
            (
                Operation::Read,
                DomainResult::Read {
                    path,
                    revision,
                    text,
                },
            ) if svg_path(path) && revision == &self.target_id && valid_text(text) => {}
            (
                Operation::Replace { .. },
                DomainResult::Applied { path, saved: false }
                | DomainResult::Unchanged { path, saved: false },
            ) if svg_path(path) => {}
            _ => return ToolOutcome::uncertain(),
        }
        ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content: Vec::new(),
            structured: Some(json!(self.result)),
            receipt: None,
            truncated: false,
        }
    }
}

fn svg_path(path: &str) -> bool {
    valid_path(path)
        && path
            .rsplit_once('.')
            .is_some_and(|(_, extension)| extension.eq_ignore_ascii_case("svg"))
}

fn valid_text(text: &str) -> bool {
    text.len() <= TEXT_BYTES
        && text.chars().all(|char| {
            matches!(char, '\t' | '\n' | '\r')
                || char >= ' ' && char != '\u{fffe}' && char != '\u{ffff}'
        })
}
