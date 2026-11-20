//! GRIDA-SEC-004 — MCP tool calls on the private Desktop supervisor connection.

use crate::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
    ToolHost,
};
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::{Client, JsonRpcRequest, JsonRpcResponse};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::{
    BindingId, BoxFuture, CancellationToken, Error, ErrorKind, Result, SessionId, ToolId,
};
use grida_agent_master::presentation;
use rmcp::model::{
    CallToolRequest, CallToolRequestParams, CallToolResult, ClientCapabilities,
    ClientJsonRpcMessage, ClientRequest, ErrorData, GetMeta, Implementation, ListToolsRequest,
    PaginatedRequestParams, ProtocolVersion, RequestId, RequestMetaObject, ServerJsonRpcMessage,
    ServerResult, Tool,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub(crate) const CAPABILITY: &str = "co.grida/session/desktop-tools";
const REVISION: &str = "co.grida/definitionRevision";
const TRUNCATED: &str = "co.grida/truncated";
const MAX_TOOLS: usize = 16;
const MAX_CATALOG_BYTES: usize = 32 * 1024;
const MAX_TOOL_BYTES: usize = 32 * 1024;
const REPLY_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Scope {
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub(crate) presentation: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) svg_target_id: Option<BindingId>,
}

impl Scope {
    fn is_empty(&self) -> bool {
        !self.presentation && self.svg_target_id.is_none()
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum GrantKind {
    Extension,
    Presentation,
}

#[derive(Clone)]
struct Target {
    session: SessionId,
    endpoint: BindingId,
    scope: Scope,
}

#[derive(Clone)]
pub(super) struct Source {
    id: BindingId,
    client: ConnectionTo<Client>,
    lifetime: CancellationToken,
}

impl Source {
    pub(super) fn new(client: ConnectionTo<Client>) -> Result<Self> {
        Ok(Self {
            id: BindingId::new(Uuid::new_v4().to_string())?,
            client,
            lifetime: CancellationToken::new(),
        })
    }

    pub(super) fn close(self) {
        self.lifetime.cancel();
    }

    pub(super) fn id(&self) -> &BindingId {
        &self.id
    }

    pub(super) fn matches(&self, catalog: &Catalog) -> bool {
        catalog.source == self.id && !self.lifetime.is_cancelled()
    }

    pub(super) async fn discover(
        &self,
        session: &SessionId,
        endpoint: &BindingId,
        scope: Scope,
    ) -> Catalog {
        let target = Target {
            session: session.clone(),
            endpoint: endpoint.clone(),
            scope,
        };
        let reply = self
            .request(
                &target,
                RequestId::String(Uuid::new_v4().to_string().into()),
                ListToolsRequest::with_param(PaginatedRequestParams::default()).into(),
                &self.lifetime,
                Instant::now() + REPLY_TIMEOUT,
                None,
            )
            .await;
        Catalog {
            source: self.id.clone(),
            definitions: reply
                .and_then(|message| Catalog::definitions(message, &target.scope))
                .unwrap_or_default(),
            scope: target.scope,
        }
    }

    async fn request(
        &self,
        target: &Target,
        id: RequestId,
        mut request: ClientRequest,
        cancellation: &CancellationToken,
        deadline: Instant,
        revision: Option<u32>,
    ) -> Option<ServerJsonRpcMessage> {
        let timeout = deadline.checked_duration_since(Instant::now())?;
        let expires_at_ms = SystemTime::now()
            .checked_add(timeout)?
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_millis()
            .try_into()
            .ok()?;
        let metadata = request.get_meta_mut();
        *metadata = RequestMetaObject::with_client_context(
            ProtocolVersion::V_2026_07_28,
            Implementation::new("grida-agent", env!("CARGO_PKG_VERSION")),
            ClientCapabilities::default(),
        );
        if let Some(revision) = revision {
            metadata.insert(REVISION.to_owned(), revision.into());
        }
        let request = Request {
            session_id: target.session.clone(),
            endpoint_id: target.endpoint.clone(),
            scope: target.scope.clone(),
            timeout_ms: timeout.as_millis().clamp(1, 120_000) as u64,
            expires_at_ms,
            message: ClientJsonRpcMessage::request(request, id.clone()),
        };
        // Dropping the ACP request cancels only this outstanding call.
        let reply = tokio::select! {
            biased;
            () = self.lifetime.cancelled() => None,
            () = cancellation.cancelled() => None,
            () = tokio::time::sleep_until(deadline.into()) => None,
            reply = self.client.send_request(request).block_task() => reply.ok(),
        }?;
        if self.lifetime.is_cancelled()
            || reply.session_id != target.session
            || reply.endpoint_id != target.endpoint
        {
            return None;
        }
        let correlated = match &reply.message {
            ServerJsonRpcMessage::Response(reply) => reply.id == id,
            ServerJsonRpcMessage::Error(reply) => reply.id.as_ref() == Some(&id),
            _ => false,
        };
        correlated.then_some(reply.message)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Catalog {
    source: BindingId,
    definitions: Vec<CapabilityDefinition>,
    #[serde(default, skip_serializing_if = "Scope::is_empty")]
    scope: Scope,
}

impl Catalog {
    pub(super) fn unavailable(source: BindingId, scope: Scope) -> Self {
        Self {
            source,
            definitions: Vec::new(),
            scope,
        }
    }

    pub(crate) fn source(&self) -> &BindingId {
        &self.source
    }

    pub(crate) fn names(&self, kind: GrantKind, workbench: bool) -> Vec<&str> {
        self.granted(kind, workbench)
            .map(|definition| exposed_name(definition.tool.id.as_str(), workbench))
            .collect()
    }

    pub(crate) fn has_presentation(&self) -> bool {
        self.granted(GrantKind::Presentation, false)
            .next()
            .is_some()
    }

    pub(crate) fn without_workbench_compatibility(mut self) -> Self {
        self.definitions.retain(|definition| {
            !matches!(
                definition.tool.id.as_str(),
                super::LIST_OPEN | presentation::OPEN
            )
        });
        self
    }

    fn granted(
        &self,
        kind: GrantKind,
        workbench: bool,
    ) -> impl Iterator<Item = &CapabilityDefinition> {
        self.definitions.iter().filter(move |definition| {
            let reserved = workbench
                && matches!(
                    definition.tool.id.as_str(),
                    super::WORKBENCH_LIST_TABS
                        | presentation::WORKBENCH_SHOW
                        | crate::browser_tools::WORKBENCH_CLOSE_BROWSER_TAB
                );
            !reserved
                && (definition.effect == CapabilityEffect::Presentation)
                    == (kind == GrantKind::Presentation)
        })
    }

    fn definitions(
        message: ServerJsonRpcMessage,
        scope: &Scope,
    ) -> Option<Vec<CapabilityDefinition>> {
        let ServerJsonRpcMessage::Response(reply) = message else {
            return None;
        };
        let ServerResult::ListToolsResult(list) = reply.result else {
            return None;
        };
        if list.next_cursor.is_some()
            || list.tools.len() > MAX_TOOLS
            || serde_json::to_vec(&list.tools).ok()?.len() > MAX_CATALOG_BYTES
        {
            return None;
        }
        let mut definitions = list
            .tools
            .into_iter()
            .map(capability_definition)
            .collect::<Option<Vec<_>>>()?;
        // An exact first-party descriptor and captured presentation permission
        // qualify for the master's auxiliary-outcome policy. An annotation does not.
        let presentation = scope
            .presentation
            .then(presentation::definition)
            .transpose()
            .ok()?;
        definitions.retain_mut(|definition| {
            if definition.tool.id.as_str() != presentation::OPEN {
                return true;
            }
            if presentation.as_ref() != Some(&definition.tool) {
                return false;
            }
            definition.effect = CapabilityEffect::Presentation;
            true
        });
        definitions.sort_by(|left, right| left.tool.id.cmp(&right.tool.id));
        definitions
            .windows(2)
            .all(|pair| pair[0].tool.id != pair[1].tool.id)
            .then_some(definitions)
    }

    pub(super) fn tool_host(
        &self,
        source: Option<Source>,
        session: &SessionId,
        endpoint: &BindingId,
        kind: GrantKind,
        workbench: bool,
    ) -> Result<Option<ToolHost>> {
        let mut definitions = self.granted(kind, workbench).peekable();
        if definitions.peek().is_none() {
            return Ok(None);
        }
        let target = Target {
            session: session.clone(),
            endpoint: endpoint.clone(),
            scope: self.scope.clone(),
        };
        let projected = definitions
            .map(|definition| {
                let wire_name = definition.tool.id.clone();
                let name = exposed_name(wire_name.as_str(), workbench);
                let mut definition = definition.clone();
                let reveal_file = workbench && name == presentation::WORKBENCH_SHOW;
                if reveal_file {
                    definition.tool = presentation::workbench_show_definition()?;
                } else if workbench && name == super::WORKBENCH_LIST_TABS {
                    definition.tool.id = ToolId::new(name)?;
                    definition.tool.description =
                        "List file tabs in the attached workbench and report its active file. Paths are relative to the workspace root and have a leading slash.".into();
                }
                let executor = Arc::new(Execute {
                    source: source.clone(),
                    target: target.clone(),
                    wire_name,
                    reveal_file,
                }) as Arc<dyn CapabilityExecutor>;
                Ok((definition, executor))
            })
            .collect::<Result<Vec<_>>>()?;
        ToolHost::new(projected).map(Some)
    }
}

fn exposed_name(name: &str, workbench: bool) -> &str {
    match (name, workbench) {
        (super::LIST_OPEN, true) => super::WORKBENCH_LIST_TABS,
        (presentation::OPEN, true) => presentation::WORKBENCH_SHOW,
        _ => name,
    }
}

/// The trusted Desktop adapter declares a versioned definition. Its read hint
/// only describes the operation; the bound Desktop grant authorizes execution.
pub(crate) fn capability_definition(tool: Tool) -> Option<CapabilityDefinition> {
    let name = tool.name.as_ref();
    if name.len() > 64
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return None;
    }
    let revision = u32::try_from(tool.meta.as_ref()?.get(REVISION)?.as_u64()?).ok()?;
    let description = tool.description.as_ref()?;
    if revision == 0 || description.is_empty() || description.len() > 2048 {
        return None;
    }
    let read_only = tool
        .annotations
        .as_ref()
        .and_then(|annotations| annotations.read_only_hint)
        == Some(true);
    Some(CapabilityDefinition {
        tool: ToolDefinition {
            id: ToolId::new(name).ok()?,
            version: revision,
            description: description.to_string(),
            input: InputFormat::Json(Value::Object((*tool.input_schema).clone())),
            max_input_bytes: MAX_TOOL_BYTES,
            max_output_bytes: MAX_TOOL_BYTES,
            recovery: RecoveryKind::Unavailable,
        },
        output_schema: Value::Object(tool.output_schema.as_deref().cloned().unwrap_or_default()),
        effect: if read_only {
            CapabilityEffect::Read
        } else {
            CapabilityEffect::Mutation
        },
    })
}

struct Execute {
    source: Option<Source>,
    target: Target,
    wire_name: ToolId,
    reveal_file: bool,
}

impl CapabilityExecutor for Execute {
    fn validate(&self, arguments: &Value) -> Result<()> {
        if self.reveal_file {
            return file_path(arguments).map(|_| ());
        }
        if !arguments.is_object() {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "desktop_tool_requires_object",
            ));
        }
        Ok(())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = self.call(&call).await;
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

impl Execute {
    fn wire_arguments(&self, arguments: &Value) -> Result<Map<String, Value>> {
        if self.reveal_file {
            return Ok(Map::from_iter([(
                "path".into(),
                file_path(arguments)?.into(),
            )]));
        }
        arguments
            .as_object()
            .cloned()
            .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "desktop_tool_requires_object"))
    }

    async fn call(&self, call: &CapabilityCall) -> ToolOutcome {
        let Some(source) = self
            .source
            .as_ref()
            .filter(|source| !source.lifetime.is_cancelled())
        else {
            return ToolOutcome::failed("editor_surface_endpoint_unavailable");
        };
        let arguments = match self.wire_arguments(&call.arguments) {
            Ok(arguments) => arguments,
            Err(error) => return ToolOutcome::failed(&error.code),
        };
        let request = CallToolRequest::new(
            CallToolRequestParams::new(self.wire_name.as_str().to_owned())
                .with_arguments(arguments),
        );
        let message = source
            .request(
                &self.target,
                RequestId::String(call.binding.id.as_str().into()),
                request.into(),
                &call.cancellation,
                call.deadline.min(Instant::now() + REPLY_TIMEOUT),
                Some(call.version),
            )
            .await;
        match message {
            Some(ServerJsonRpcMessage::Response(reply)) => match reply.result {
                ServerResult::CallToolResult(result) => project(result),
                _ => ToolOutcome::uncertain(),
            },
            Some(ServerJsonRpcMessage::Error(reply)) => protocol_error(reply.error),
            _ => ToolOutcome::uncertain(),
        }
    }
}

fn file_path(arguments: &Value) -> Result<&str> {
    presentation::file_reveal_path(arguments)
        .filter(|path| super::valid_path(path))
        .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "invalid_surface_path"))
}

pub(crate) fn protocol_error(error: ErrorData) -> ToolOutcome {
    match (error.code.0, error.message.as_ref()) {
        (-32001, "editor_surface_endpoint_unavailable") => {
            ToolOutcome::failed("editor_surface_endpoint_unavailable")
        }
        (-32002, "desktop_tool_definition_changed") => {
            ToolOutcome::failed("host_capability_changed")
        }
        (-32003, "desktop_tool_backend_busy") => ToolOutcome::failed("desktop_tool_backend_busy"),
        (-32004, "desktop_tool_deadline_elapsed") => {
            ToolOutcome::failed("desktop_tool_deadline_elapsed")
        }
        (-32602, _) => ToolOutcome::failed("desktop_tool_invalid_request"),
        _ => ToolOutcome::uncertain(),
    }
}

pub(crate) fn project(result: CallToolResult) -> ToolOutcome {
    let mut content = Vec::new();
    for block in result.content {
        let Some(text) = block.as_text() else {
            return ToolOutcome::uncertain();
        };
        content.push(ResultContent::Text(text.text.clone()));
    }
    ToolOutcome {
        status: if result.is_error == Some(true) {
            OutcomeStatus::Failed
        } else {
            OutcomeStatus::Succeeded
        },
        content,
        structured: result.structured_content,
        receipt: None,
        truncated: result.meta.as_ref().and_then(|meta| meta.get(TRUNCATED))
            == Some(&Value::Bool(true)),
    }
}

#[derive(Clone, Deserialize, JsonRpcRequest, Serialize)]
#[request(method = "_co.grida/editor/desktop-tools", response = Reply)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    session_id: SessionId,
    endpoint_id: BindingId,
    #[serde(default, skip_serializing_if = "Scope::is_empty")]
    scope: Scope,
    timeout_ms: u64,
    expires_at_ms: u64,
    message: ClientJsonRpcMessage,
}

impl std::fmt::Debug for Request {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("DesktopMcpRequest")
    }
}

#[derive(Clone, Deserialize, JsonRpcResponse, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reply {
    session_id: SessionId,
    endpoint_id: BindingId,
    message: ServerJsonRpcMessage,
}

impl std::fmt::Debug for Reply {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("DesktopMcpReply")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_new_workbench_turns_project_the_file_catalog() {
        let list = super::super::open_surfaces_definition().unwrap();
        let show = CapabilityDefinition {
            tool: presentation::definition().unwrap(),
            output_schema: json!({"type": "object"}),
            effect: CapabilityEffect::Presentation,
        };
        let catalog = Catalog {
            source: BindingId::new("editor-source").unwrap(),
            definitions: vec![list.clone(), show.clone()],
            scope: Scope {
                presentation: true,
                svg_target_id: None,
            },
        };
        let captured = serde_json::to_value(&catalog).unwrap();
        let session = SessionId::new("captured-session").unwrap();
        let endpoint = BindingId::new("editor-endpoint").unwrap();
        assert_eq!(
            catalog.names(GrantKind::Extension, false),
            [super::super::LIST_OPEN]
        );
        assert_eq!(
            catalog.names(GrantKind::Extension, true),
            [super::super::WORKBENCH_LIST_TABS]
        );
        assert_eq!(
            catalog.names(GrantKind::Presentation, false),
            [presentation::OPEN]
        );
        assert_eq!(
            catalog.names(GrantKind::Presentation, true),
            [presentation::WORKBENCH_SHOW]
        );
        let legacy_show = catalog
            .tool_host(None, &session, &endpoint, GrantKind::Presentation, false)
            .unwrap()
            .unwrap();
        let legacy_grant = legacy_show.grant(&show.tool.id).unwrap();
        assert_eq!(legacy_grant.describe().unwrap(), &show);
        let current_show = catalog
            .tool_host(None, &session, &endpoint, GrantKind::Presentation, true)
            .unwrap()
            .unwrap();
        let current = presentation::workbench_show_definition().unwrap();
        let current_grant = current_show.grant(&current.id).unwrap();
        assert_eq!(current_grant.describe().unwrap().tool, current);
        assert!(current_show.grant(&show.tool.id).is_err());
        assert_eq!(serde_json::to_value(&catalog).unwrap(), captured);
    }

    #[test]
    fn typed_workbench_file_reveal_uses_the_original_path_contract() {
        let execute = Execute {
            source: None,
            target: Target {
                session: SessionId::new("captured-session").unwrap(),
                endpoint: BindingId::new("editor-endpoint").unwrap(),
                scope: Scope::default(),
            },
            wire_name: ToolId::new(presentation::OPEN).unwrap(),
            reveal_file: true,
        };
        for arguments in [
            json!({"target": {"kind": "file", "path": "/poster.svg"}}),
            json!({
                "target": {"kind": "file", "path": "/poster.svg"},
                "presentation": "reveal"
            }),
        ] {
            assert_eq!(
                Value::Object(execute.wire_arguments(&arguments).unwrap()),
                json!({"path": "/poster.svg"})
            );
        }
        for arguments in [
            json!({"target": {"kind": "url", "url": "https://example.com/"}}),
            json!({"target": {"kind": "tab", "tabId": "browser-tab"}}),
            json!({"target": {"kind": "file", "path": "file:///poster.svg"}}),
            json!({
                "target": {"kind": "file", "path": "/poster.svg"},
                "presentation": "focus"
            }),
        ] {
            assert!(execute.validate(&arguments).is_err());
            assert!(execute.wire_arguments(&arguments).is_err());
        }
    }
}
