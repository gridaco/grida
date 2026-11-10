//! GRIDA-SEC-004 — live editor capabilities use the captured Desktop binding.

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
use grida_agent_master::presentation::{self, MAX_PATH_BYTES};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub(crate) const CAPABILITY: &str = "co.grida/session/editor-surfaces";
pub(crate) const OPEN_CAPABILITY: &str = "co.grida/session/editor-surface-open";
pub(crate) const LIST_OPEN: &str = "surface_list_open";
const MAX_OPEN_PATHS: usize = 50;
const SNAPSHOT_BYTES: usize = 16 * 1024;
const REPLY_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Default)]
pub(crate) struct EditorSurfaces {
    connection: Arc<Mutex<Option<DesktopConnection>>>,
}

struct DesktopConnection {
    client: ConnectionTo<Client>,
    presentation: bool,
}

impl EditorSurfaces {
    pub(crate) fn attach(&self, client: ConnectionTo<Client>, presentation: bool) {
        *self.connection.lock().unwrap() = Some(DesktopConnection {
            client,
            presentation,
        });
    }

    pub(crate) fn detach(&self) {
        self.connection.lock().unwrap().take();
    }

    fn client(&self, needs_presentation: bool) -> Option<ConnectionTo<Client>> {
        self.connection
            .lock()
            .unwrap()
            .as_ref()
            .filter(|connection| !needs_presentation || connection.presentation)
            .map(|connection| connection.client.clone())
    }

    pub(crate) fn tool_host(
        &self,
        session: SessionId,
        endpoint: BindingId,
        present: bool,
    ) -> Result<ToolHost> {
        let mut capabilities = vec![(
            open_surfaces_definition()?,
            Arc::new(Observe {
                owner: self.clone(),
                request: Read {
                    session_id: session.clone(),
                    endpoint_id: endpoint.clone(),
                },
            }) as Arc<dyn CapabilityExecutor>,
        )];
        if present {
            capabilities.push((
                CapabilityDefinition {
                    tool: presentation::definition()?,
                    output_schema: json!({
                        "type": "object",
                        "properties": {
                            "path": {"type": "string"},
                            "requested": {"type": "boolean"},
                            "reason": {"enum": ["dispatched", "editor_unavailable"]}
                        },
                        "required": ["path", "requested", "reason"],
                        "additionalProperties": false
                    }),
                    effect: CapabilityEffect::Presentation,
                },
                Arc::new(Present {
                    owner: self.clone(),
                    session,
                    endpoint,
                }),
            ));
        }
        ToolHost::new(capabilities)
    }
}

pub(crate) fn open_surfaces_definition() -> Result<CapabilityDefinition> {
    Ok(CapabilityDefinition {
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
            })
}

pub(crate) fn validate_open_surfaces_arguments(arguments: &Value) -> Result<()> {
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

struct Observe {
    owner: EditorSurfaces,
    request: Read,
}

impl CapabilityExecutor for Observe {
    fn validate(&self, arguments: &Value) -> Result<()> {
        validate_open_surfaces_arguments(arguments)
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let connection = self.owner.client(false);
            let outcome = if let Some(connection) = connection {
                let deadline = call.deadline.min(Instant::now() + REPLY_TIMEOUT);
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

struct Present {
    owner: EditorSurfaces,
    session: SessionId,
    endpoint: BindingId,
}

impl CapabilityExecutor for Present {
    fn validate(&self, arguments: &Value) -> Result<()> {
        presentation_path(arguments).map(|_| ())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = match presentation_path(&call.arguments) {
                Ok(path) => self.request(&call, path).await,
                Err(error) => ToolOutcome::failed(&error.code),
            };
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

impl Present {
    async fn request(&self, call: &CapabilityCall, path: &str) -> ToolOutcome {
        let Some(connection) = self.owner.client(true) else {
            return presentation_result(path, false);
        };
        let deadline = call.deadline.min(Instant::now() + REPLY_TIMEOUT);
        if call.cancellation.is_cancelled() || deadline <= Instant::now() {
            return ToolOutcome::failed("editor_presentation_cancelled_before_request");
        }
        let request = Open {
            session_id: self.session.clone(),
            endpoint_id: self.endpoint.clone(),
            call_id: call.binding.id.clone(),
            path: path.to_owned(),
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

#[derive(Clone, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/editor/surface-open", response = OpenReceipt)]
#[serde(rename_all = "camelCase")]
struct Open {
    session_id: SessionId,
    endpoint_id: BindingId,
    call_id: BindingId,
    path: String,
}

impl std::fmt::Debug for Open {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("EditorSurfaceOpen")
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OpenReceipt {
    session_id: SessionId,
    endpoint_id: BindingId,
    call_id: BindingId,
    requested: bool,
}

impl OpenReceipt {
    fn outcome(self, request: &Open) -> ToolOutcome {
        if self.session_id != request.session_id
            || self.endpoint_id != request.endpoint_id
            || self.call_id != request.call_id
        {
            return ToolOutcome::uncertain();
        }
        presentation_result(&request.path, self.requested)
    }
}

fn presentation_result(path: &str, requested: bool) -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Succeeded,
        content: Vec::new(),
        structured: Some(json!({
            "path": path,
            "requested": requested,
            "reason": if requested { "dispatched" } else { "editor_unavailable" }
        })),
        receipt: None,
        truncated: false,
    }
}

fn presentation_path(arguments: &Value) -> Result<&str> {
    arguments
        .as_object()
        .filter(|object| object.len() == 1)
        .and_then(|object| object.get("path"))
        .and_then(Value::as_str)
        .filter(|path| valid_path(path))
        .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "invalid_surface_path"))
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
        OpenSurfacesSnapshot {
            available: self.available,
            active: self.active,
            open: self.open,
            truncated: self.truncated,
        }
        .outcome()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct OpenSurfacesSnapshot {
    available: bool,
    active: Option<String>,
    open: Vec<String>,
    truncated: bool,
}

impl OpenSurfacesSnapshot {
    pub(crate) fn outcome(self) -> ToolOutcome {
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

    #[test]
    fn presentation_acknowledges_only_the_exact_request() {
        let read = read();
        let request = Open {
            session_id: read.session_id,
            endpoint_id: read.endpoint_id,
            call_id: BindingId::new("request").unwrap(),
            path: "/drafts/poster.canvas".into(),
        };
        let receipt = OpenReceipt {
            session_id: request.session_id.clone(),
            endpoint_id: request.endpoint_id.clone(),
            call_id: request.call_id.clone(),
            requested: true,
        };
        let sent = receipt.clone().outcome(&request);
        assert_eq!(sent.status, OutcomeStatus::Succeeded);
        assert_eq!(
            sent.structured,
            Some(json!({"path": request.path, "requested": true, "reason": "dispatched"}))
        );
        let unavailable = OpenReceipt {
            requested: false,
            ..receipt.clone()
        }
        .outcome(&request);
        assert_eq!(unavailable.structured.unwrap()["requested"], false);
        let unrelated = OpenReceipt {
            call_id: BindingId::new("different-request").unwrap(),
            ..receipt
        }
        .outcome(&request);
        assert_eq!(unrelated.status, OutcomeStatus::Uncertain);
        assert!(unrelated.structured.is_none());
        assert!(presentation_path(&json!({"path":"/drafts/../poster.canvas"})).is_err());
        assert!(presentation_path(&json!({"path":"/poster.canvas","endpointId":"other"})).is_err());
    }
}
