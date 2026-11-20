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
pub(crate) const WORKBENCH_LIST_TABS: &str = "workbench_list_tabs";
const MAX_OPEN_PATHS: usize = 50;
const SNAPSHOT_BYTES: usize = 16 * 1024;
const REPLY_TIMEOUT: Duration = Duration::from_secs(2);

mod browser;
pub(crate) mod mcp;
mod svg_text;
pub(crate) use mcp::{CAPABILITY as DESKTOP_TOOLS_CAPABILITY, Catalog as DesktopToolCatalog};
pub(crate) use svg_text::{CAPABILITY as SVG_TEXT_CAPABILITY, READ_TEXT, REPLACE_TEXT};

#[derive(Clone, Default)]
pub(crate) struct EditorSurfaces {
    state: Arc<Mutex<EditorConnectionState>>,
}

#[derive(Default)]
struct EditorConnectionState {
    connection: Option<DesktopConnection>,
    tool_source: Option<BindingId>,
    browser_mcp: bool,
}

struct DesktopConnection {
    client: ConnectionTo<Client>,
    presentation: bool,
    svg_text: bool,
    browser: bool,
    tools: Option<mcp::Source>,
}

pub(crate) struct LegacyToolScope {
    pub(crate) inventory: bool,
    pub(crate) presentation: bool,
    pub(crate) svg_target: Option<BindingId>,
    pub(crate) browser: bool,
    pub(crate) workbench_tools: bool,
}

impl EditorSurfaces {
    pub(crate) fn attach(
        &self,
        client: ConnectionTo<Client>,
        presentation: bool,
        svg_text: bool,
        browser: bool,
        desktop_tools: bool,
        browser_mcp: bool,
    ) -> Result<()> {
        let tools = desktop_tools
            .then(|| mcp::Source::new(client.clone()))
            .transpose()?;
        let mut state = self.state.lock().unwrap();
        if let Some(tools) = state
            .connection
            .take()
            .and_then(|connection| connection.tools)
        {
            tools.close();
        }
        state.tool_source = tools.as_ref().map(|source| source.id().clone());
        state.browser_mcp = browser_mcp;
        state.connection = Some(DesktopConnection {
            client,
            presentation,
            svg_text,
            browser,
            tools,
        });
        Ok(())
    }

    pub(crate) fn detach(&self) {
        if let Some(tools) = self
            .state
            .lock()
            .unwrap()
            .connection
            .take()
            .and_then(|connection| connection.tools)
        {
            tools.close();
        }
    }

    fn tool_source(&self) -> Option<mcp::Source> {
        self.state
            .lock()
            .unwrap()
            .connection
            .as_ref()
            .and_then(|connection| connection.tools.clone())
    }

    pub(crate) fn desktop_tools_negotiated(&self) -> bool {
        self.tool_source().is_some()
    }

    pub(crate) fn browser_mcp_negotiated(&self) -> bool {
        self.state.lock().unwrap().browser_mcp
    }

    pub(crate) async fn discover_tools(
        &self,
        session: &SessionId,
        endpoint: &BindingId,
        scope: mcp::Scope,
    ) -> Option<DesktopToolCatalog> {
        let (generation, source) = {
            let state = self.state.lock().unwrap();
            (
                state.tool_source.clone()?,
                state
                    .connection
                    .as_ref()
                    .and_then(|connection| connection.tools.clone()),
            )
        };
        Some(match source {
            Some(source) => source.discover(session, endpoint, scope).await,
            None => DesktopToolCatalog::unavailable(generation, scope),
        })
    }

    pub(crate) fn captured_tools(
        &self,
        session: &SessionId,
        endpoint: &BindingId,
        catalog: &DesktopToolCatalog,
        kind: mcp::GrantKind,
        workbench_tools: bool,
        capture: Option<Arc<crate::file_tools::ImageCapture>>,
    ) -> Result<Option<ToolHost>> {
        // Rebuild the accepted inventory even when its owner is gone. Its
        // definitions keep the recorded request reproducible, while only the
        // matching live source can execute a new operation.
        let source = self.tool_source().filter(|source| source.matches(catalog));
        catalog.tool_host(source, session, endpoint, kind, workbench_tools, capture)
    }

    fn client(&self, needs_presentation: bool) -> Option<ConnectionTo<Client>> {
        self.state
            .lock()
            .unwrap()
            .connection
            .as_ref()
            .filter(|connection| !needs_presentation || connection.presentation)
            .map(|connection| connection.client.clone())
    }

    fn svg_client(&self) -> Option<ConnectionTo<Client>> {
        self.state
            .lock()
            .unwrap()
            .connection
            .as_ref()
            .filter(|connection| connection.svg_text)
            .map(|connection| connection.client.clone())
    }

    fn browser_client(&self) -> Option<ConnectionTo<Client>> {
        self.state
            .lock()
            .unwrap()
            .connection
            .as_ref()
            .filter(|connection| connection.browser)
            .map(|connection| connection.client.clone())
    }

    pub(crate) fn browser_tools_available(&self) -> bool {
        self.browser_client().is_some()
    }

    pub(crate) fn tool_host(
        &self,
        session: SessionId,
        endpoint: BindingId,
        scope: &LegacyToolScope,
        browser_capture: Option<Arc<crate::file_tools::ImageCapture>>,
    ) -> Result<ToolHost> {
        if scope.browser {
            let mut capabilities = browser::tools(
                self.clone(),
                session.clone(),
                endpoint.clone(),
                browser_capture,
                scope.workbench_tools,
            )?;
            if let Some(target) = scope.svg_target.clone() {
                capabilities.extend(svg_text::tools(self.clone(), session, endpoint, target)?);
            }
            return ToolHost::new(capabilities);
        }
        let mut capabilities = Vec::new();
        if scope.inventory {
            capabilities.push((
                open_surfaces_definition()?,
                Arc::new(Observe {
                    owner: self.clone(),
                    request: Read {
                        session_id: session.clone(),
                        endpoint_id: endpoint.clone(),
                    },
                }) as Arc<dyn CapabilityExecutor>,
            ));
        }
        if scope.presentation {
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
                    session: session.clone(),
                    endpoint: endpoint.clone(),
                }),
            ));
        }
        if let Some(target) = scope.svg_target.clone() {
            capabilities.extend(svg_text::tools(self.clone(), session, endpoint, target)?);
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

pub(crate) fn valid_path(path: &str) -> bool {
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

    #[tokio::test]
    async fn a_disconnected_desktop_catalog_keeps_its_offer_and_refuses_dispatch() {
        let definition = open_surfaces_definition().unwrap();
        let catalog: DesktopToolCatalog = serde_json::from_value(json!({
            "source": "retired-source",
            "definitions": [definition],
        }))
        .unwrap();
        let request = read();
        let host = EditorSurfaces::default()
            .captured_tools(
                &request.session_id,
                &request.endpoint_id,
                &catalog,
                mcp::GrantKind::Extension,
                false,
                None,
            )
            .unwrap()
            .expect("the retained offer survives loss of its source");
        let grant = host.grant(&definition.tool.id).unwrap();
        assert_eq!(grant.describe().unwrap(), &definition);
        let outcome = grant
            .invoke(
                definition.tool.version,
                json!({}),
                agent_kit_core::CancellationToken::new(),
                Instant::now() + REPLY_TIMEOUT,
                definition.tool.max_output_bytes,
            )
            .await
            .unwrap();
        assert_eq!(outcome.status, OutcomeStatus::Failed);
        assert_eq!(
            outcome.content,
            [agent_kit_core::messages::ResultContent::Text(
                "editor_surface_endpoint_unavailable".into()
            )]
        );
    }

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
