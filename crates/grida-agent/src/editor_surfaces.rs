//! GRIDA-SEC-004 — live editor observations use the captured Desktop binding.

use crate::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
    ToolHost,
};
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::{Client, JsonRpcRequest, JsonRpcResponse};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::{BindingId, BoxFuture, Error, ErrorKind, Result, SessionId, ToolId};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub(crate) const CAPABILITY: &str = "co.grida/session/editor-surfaces";
pub(crate) const LIST_OPEN: &str = "surface_list_open";
const MAX_PATH_BYTES: usize = 4096;
const MAX_OPEN_PATHS: usize = 50;
const SNAPSHOT_BYTES: usize = 16 * 1024;
const READ_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Default)]
pub(crate) struct EditorSurfaces {
    connection: Arc<Mutex<Option<ConnectionTo<Client>>>>,
}

impl EditorSurfaces {
    pub(crate) fn attach(&self, connection: ConnectionTo<Client>) {
        *self.connection.lock().unwrap() = Some(connection);
    }

    pub(crate) fn detach(&self) {
        self.connection.lock().unwrap().take();
    }

    pub(crate) fn tool_host(&self, session: SessionId, endpoint: BindingId) -> Result<ToolHost> {
        ToolHost::new([(
            CapabilityDefinition {
                tool: ToolDefinition {
                    id: ToolId::new(LIST_OPEN)?,
                    version: 2,
                    description: "Read the workspace editor's currently active file and open files. Paths are relative to the workspace root, shown with a leading slash.".into(),
                    input: InputFormat::Json(json!({
                        "type": "object",
                        "additionalProperties": false
                    })),
                    max_input_bytes: 32,
                    max_output_bytes: SNAPSHOT_BYTES + 512,
                    recovery: RecoveryKind::Unavailable,
                },
                output_schema: json!({
                    "type": "object",
                    "properties": {
                        "interactive": {"const": true},
                        "active": {"type": ["string", "null"]},
                        "open": {"type": "array", "items": {"type": "string"}, "maxItems": MAX_OPEN_PATHS},
                        "truncated": {"type": "boolean"}
                    },
                    "required": ["interactive", "active", "open", "truncated"],
                    "additionalProperties": false
                }),
                effect: CapabilityEffect::Read,
            },
            Arc::new(Observe {
                owner: self.clone(),
                request: Read { session_id: session, endpoint_id: endpoint },
            }) as Arc<dyn CapabilityExecutor>,
        )])
    }
}

struct Observe {
    owner: EditorSurfaces,
    request: Read,
}

impl CapabilityExecutor for Observe {
    fn validate(&self, arguments: &Value) -> Result<()> {
        if arguments
            .as_object()
            .is_some_and(|object| object.is_empty())
        {
            Ok(())
        } else {
            Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_editor_surface_arguments",
            ))
        }
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let connection = self.owner.connection.lock().unwrap().clone();
            let outcome = if let Some(connection) = connection {
                let deadline = call.deadline.min(std::time::Instant::now() + READ_TIMEOUT);
                tokio::select! {
                    biased;
                    _ = call.cancellation.cancelled() => ToolOutcome::uncertain(),
                    _ = tokio::time::sleep_until(deadline.into()) => ToolOutcome::uncertain(),
                    reply = connection.send_request(self.request.clone()).block_task() => {
                        reply.map_or_else(|_| ToolOutcome::uncertain(), |reply| {
                            reply.outcome(&self.request)
                        })
                    }
                }
            } else {
                ToolOutcome::failed("editor_surface_endpoint_unavailable")
            };
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/editor/surface-list-open", response = Snapshot)]
#[serde(rename_all = "camelCase")]
struct Read {
    session_id: SessionId,
    endpoint_id: BindingId,
}

#[derive(Clone, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    session_id: SessionId,
    endpoint_id: BindingId,
    available: bool,
    active: Option<String>,
    open: Vec<String>,
    truncated: bool,
}

impl std::fmt::Debug for Snapshot {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("EditorSurfaceSnapshot")
    }
}

impl Snapshot {
    fn outcome(self, request: &Read) -> ToolOutcome {
        if self.session_id != request.session_id || self.endpoint_id != request.endpoint_id {
            return ToolOutcome::uncertain();
        }
        if !self.available {
            return if self.active.is_none() && self.open.is_empty() && !self.truncated {
                ToolOutcome::failed("editor_surface_endpoint_unavailable")
            } else {
                ToolOutcome::uncertain()
            };
        }
        if self.open.len() > MAX_OPEN_PATHS
            || self
                .active
                .as_ref()
                .is_some_and(|active| !self.open.contains(active))
            || self
                .active
                .iter()
                .chain(&self.open)
                .any(|path| !valid_path(path))
            || self
                .open
                .iter()
                .collect::<std::collections::BTreeSet<_>>()
                .len()
                != self.open.len()
            || serde_json::to_vec(&(&self.active, &self.open))
                .map_or(usize::MAX, |bytes| bytes.len())
                > SNAPSHOT_BYTES
        {
            return ToolOutcome::uncertain();
        }
        ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content: Vec::new(),
            structured: Some(json!({
                "interactive": true,
                "active": self.active,
                "open": self.open,
                "truncated": self.truncated
            })),
            receipt: None,
            truncated: self.truncated,
        }
    }
}

fn valid_path(path: &str) -> bool {
    path.len() <= MAX_PATH_BYTES
        && !path.contains(['\0', '\\'])
        && path.strip_prefix('/').is_some_and(|relative| {
            relative
                .split('/')
                .all(|part| !matches!(part, "" | "." | ".."))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read() -> Read {
        Read {
            session_id: SessionId::new("chat").unwrap(),
            endpoint_id: BindingId::new("endpoint").unwrap(),
        }
    }

    fn snapshot(request: &Read) -> Snapshot {
        Snapshot {
            session_id: request.session_id.clone(),
            endpoint_id: request.endpoint_id.clone(),
            available: true,
            active: Some("/drafts/one.svg".into()),
            open: vec!["/drafts/one.svg".into(), "/drafts/two.svg".into()],
            truncated: false,
        }
    }

    #[test]
    fn only_projects_bounded_snapshots_from_the_captured_chat_and_endpoint() {
        let request = read();
        let result = snapshot(&request).outcome(&request);
        assert_eq!(result.status, OutcomeStatus::Succeeded);
        assert_eq!(
            result.structured,
            Some(json!({
                "interactive": true,
                "active": "/drafts/one.svg",
                "open": ["/drafts/one.svg", "/drafts/two.svg"],
                "truncated": false
            }))
        );

        let mut wrong_chat = snapshot(&request);
        wrong_chat.session_id = SessionId::new("other-chat").unwrap();
        let mut wrong_endpoint = snapshot(&request);
        wrong_endpoint.endpoint_id = BindingId::new("new-endpoint").unwrap();
        let mut too_many = snapshot(&request);
        too_many.open = (0..=MAX_OPEN_PATHS)
            .map(|index| format!("/{index}"))
            .collect();
        let mut oversized = snapshot(&request);
        oversized.open = (0..5)
            .map(|index| format!("/{index}{}", "a".repeat(4094)))
            .collect();
        let mut bad_path = snapshot(&request);
        bad_path.open.push("/../private".into());
        let mut duplicates = snapshot(&request);
        duplicates.open.push("/drafts/one.svg".into());
        let mut missing_active = snapshot(&request);
        missing_active.active = Some("/drafts/other.svg".into());
        for invalid in [
            wrong_chat,
            wrong_endpoint,
            too_many,
            oversized,
            bad_path,
            duplicates,
            missing_active,
        ] {
            let result = invalid.outcome(&request);
            assert_eq!(result.status, ToolOutcome::uncertain().status);
            assert!(result.structured.is_none());
        }
    }

    #[test]
    fn an_empty_editor_is_distinct_from_a_revoked_endpoint() {
        let request = read();
        let mut empty = snapshot(&request);
        empty.active = None;
        empty.open.clear();
        let absent = Snapshot {
            available: false,
            ..empty.clone()
        };
        assert_eq!(empty.outcome(&request).status, OutcomeStatus::Succeeded);
        let result = absent.outcome(&request);
        assert_eq!(
            result.status,
            ToolOutcome::failed("editor_surface_endpoint_unavailable").status
        );
        assert!(result.structured.is_none());
    }
}
