//! GRIDA-SEC-004 — trusted outbound MCP tools bound to one authenticated local endpoint.

use crate::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityGrant,
    CapabilityReply, ToolHost,
};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::{BindingId, BoxFuture, Error, ErrorKind, Result, ToolId};
use rmcp::model::{
    CallToolRequest, CallToolRequestParams, CallToolResult, ClientCapabilities, ClientRequest,
    ContentBlock, DiscoverRequest, DiscoverRequestParams, GetMeta, Implementation,
    ListToolsRequest, PaginatedRequestParams, ProtocolVersion, RequestId, RequestMetaObject,
    ServerResult,
};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use uuid::Uuid;

mod http;
use http::Endpoint;

const MAX_DISCOVERY_TIME: Duration = Duration::from_secs(10);
const MAX_PAGES: usize = 8;
const MAX_TOOLS: usize = 128;
const MAX_SELECTED_TOOLS: usize = 16;
const MAX_SCHEMA_BYTES: usize = 16 * 1024;
const MAX_TOOL_INPUT_BYTES: usize = 64 * 1024;
const MAX_TOOL_OUTPUT_BYTES: usize = 64 * 1024;
const MAX_DESCRIPTION_BYTES: usize = 2048;
const VERSION: ProtocolVersion = ProtocolVersion::V_2026_07_28;

/// Captures only explicitly selected tools from one local MCP endpoint. The
/// caller owns endpoint and bearer selection and keeps this owner alive while
/// using its grants. Reconnecting creates a new lease. A consumer must obtain
/// fresh host authorization for that lease before offering its tools.
pub struct McpClient {
    host: ToolHost,
    endpoint: Arc<Endpoint>,
    selected: BTreeMap<String, ToolId>,
}

impl McpClient {
    /// Opens the stateless 2026-07-28 Streamable HTTP profile. The configuration
    /// must come from the trusted host. The named server may receive arguments
    /// for the selected tools and is responsible for validating their schema
    /// and enforcing their actual effects.
    pub async fn connect(
        source: &str,
        endpoint: &str,
        bearer: &str,
        allowlist: &[&str],
    ) -> Result<Self> {
        let allowed = validate_selection(source, allowlist)?;
        let endpoint = Arc::new(Endpoint::new(endpoint, bearer)?);
        let deadline = Instant::now() + MAX_DISCOVERY_TIME;
        let discovered = endpoint
            .post(
                DiscoverRequest::new(DiscoverRequestParams {}).into(),
                request_id(),
                deadline,
            )
            .await?;
        let ServerResult::DiscoverResult(discovered) = discovered else {
            return Err(protocol_error());
        };
        if !discovered.supported_versions.contains(&VERSION)
            || discovered.capabilities.tools.is_none()
        {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "mcp_tools_protocol_unavailable",
            ));
        }

        let definitions = list_selected(&endpoint, allowed, deadline).await?;
        let mut selected = BTreeMap::new();
        let mut capabilities = Vec::new();
        for (name, definition) in definitions {
            let definition = capture_definition(source, &name, definition)?;
            selected.insert(name.clone(), definition.tool.id.clone());
            let executor: Arc<dyn CapabilityExecutor> = Arc::new(McpTool {
                endpoint: Arc::clone(&endpoint),
                name,
            });
            capabilities.push((definition, executor));
        }
        let host = ToolHost::new(capabilities)?;
        Ok(Self {
            host,
            endpoint,
            selected,
        })
    }

    pub fn lease(&self) -> &BindingId {
        self.host.endpoint()
    }

    /// Issues an ordinary tool-host grant for one selected remote tool name.
    pub fn grant(&self, name: &str) -> Result<CapabilityGrant> {
        if self.endpoint.closed.is_cancelled() {
            return Err(endpoint_closed());
        }
        self.host.grant(
            self.selected
                .get(name)
                .ok_or_else(|| Error::new(ErrorKind::Unavailable, "mcp_tool_not_selected"))?,
        )
    }

    pub fn close(&self) {
        self.host.close();
        self.endpoint.closed.cancel();
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        self.close();
    }
}

async fn list_selected(
    endpoint: &Endpoint,
    allowed: BTreeSet<String>,
    deadline: Instant,
) -> Result<BTreeMap<String, rmcp::model::Tool>> {
    let mut captured = BTreeMap::new();
    let mut cursors = BTreeSet::new();
    let mut cursor = None;
    let mut count = 0;
    for _ in 0..MAX_PAGES {
        let listed = endpoint
            .post(
                ListToolsRequest::with_param(PaginatedRequestParams::default().with_cursor(cursor))
                    .into(),
                request_id(),
                deadline,
            )
            .await?;
        let ServerResult::ListToolsResult(listed) = listed else {
            return Err(protocol_error());
        };
        count += listed.tools.len();
        if count > MAX_TOOLS {
            return Err(catalog_limit());
        }
        for tool in listed.tools {
            let name = tool.name.as_ref();
            if allowed.contains(name) && captured.insert(name.to_owned(), tool).is_some() {
                return Err(Error::new(
                    ErrorKind::Conflict,
                    "mcp_duplicate_selected_tool",
                ));
            }
        }
        let Some(next) = listed.next_cursor else {
            return if captured.len() == allowed.len() {
                Ok(captured)
            } else {
                Err(Error::new(
                    ErrorKind::Unavailable,
                    "mcp_selected_tool_missing",
                ))
            };
        };
        if next.is_empty() || next.len() > 1024 || !cursors.insert(next.clone()) {
            return Err(catalog_limit());
        }
        cursor = Some(next);
    }
    Err(catalog_limit())
}

fn validate_selection(source: &str, names: &[&str]) -> Result<BTreeSet<String>> {
    let valid_source = !source.is_empty()
        && source.len() <= 16
        && source
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit());
    let mut selected = BTreeSet::new();
    if !valid_source
        || names.is_empty()
        || names.len() > MAX_SELECTED_TOOLS
        || !names.iter().all(|name| {
            !name.is_empty()
                && source.len() + name.len() + "mcp__".len() <= 64
                && name
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
                && selected.insert((*name).to_owned())
        })
    {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "invalid_mcp_tool_selection",
        ));
    }
    Ok(selected)
}

fn capture_definition(
    source: &str,
    name: &str,
    remote: rmcp::model::Tool,
) -> Result<CapabilityDefinition> {
    let input = Value::Object((*remote.input_schema).clone());
    let output = remote.output_schema.map_or_else(
        || Value::Object(Default::default()),
        |schema| Value::Object((*schema).clone()),
    );
    let description = remote.description.as_deref().unwrap_or_default();
    if description.len() > MAX_DESCRIPTION_BYTES
        || input.get("type").and_then(Value::as_str) != Some("object")
        || !supported_schema(&input)
        || !supported_schema(&output)
    {
        return Err(Error::new(
            ErrorKind::Unsupported,
            "mcp_tool_descriptor_unsupported",
        ));
    }
    Ok(CapabilityDefinition {
        tool: ToolDefinition {
            id: ToolId::new(format!("mcp_{source}_{name}"))?,
            version: 1,
            description: format!("MCP tool {name} from {source}. {description}"),
            input: InputFormat::Json(input),
            max_input_bytes: MAX_TOOL_INPUT_BYTES,
            max_output_bytes: MAX_TOOL_OUTPUT_BYTES,
            recovery: RecoveryKind::Unavailable,
        },
        output_schema: output,
        // Server annotations are hints. This profile grants potential effects
        // explicitly and never infers read access or retry safety from them.
        effect: CapabilityEffect::Mutation,
    })
}

fn supported_schema(schema: &Value) -> bool {
    fn inert(value: &Value) -> bool {
        match value {
            Value::Object(fields) => fields.iter().all(|(key, value)| match key.as_str() {
                "x-mcp-header" => false,
                "$ref" | "$dynamicRef" | "$recursiveRef" => {
                    value.as_str().is_some_and(|target| target.starts_with('#'))
                }
                _ => inert(value),
            }),
            Value::Array(items) => items.iter().all(inert),
            _ => true,
        }
    }
    serde_json::to_vec(schema).is_ok_and(|bytes| bytes.len() <= MAX_SCHEMA_BYTES) && inert(schema)
}

struct McpTool {
    endpoint: Arc<Endpoint>,
    name: String,
}

impl CapabilityExecutor for McpTool {
    fn validate(&self, arguments: &Value) -> Result<()> {
        if self.endpoint.closed.is_cancelled() {
            return Err(endpoint_closed());
        }
        if !arguments.is_object() {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "mcp_tool_requires_object",
            ));
        }
        Ok(())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let mut outcome = ToolOutcome::uncertain();
            if let Value::Object(arguments) = call.arguments {
                let request = CallToolRequest::new(
                    CallToolRequestParams::new(self.name.clone()).with_arguments(arguments),
                );
                let response = tokio::select! {
                    biased;
                    () = call.cancellation.cancelled() => None,
                    () = self.endpoint.closed.cancelled() => None,
                    response = self.endpoint.post(
                        request.into(),
                        RequestId::String(call.binding.id.as_str().into()),
                        call.deadline,
                    ) => Some(response),
                };
                match response {
                    Some(Ok(ServerResult::CallToolResult(result))) => {
                        outcome = project_result(result);
                    }
                    Some(_) => self.endpoint.closed.cancel(),
                    None => {}
                }
            }
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

fn project_result(result: CallToolResult) -> ToolOutcome {
    let mut dropped_content = false;
    let content = result
        .content
        .into_iter()
        .filter_map(|item| match item {
            ContentBlock::Text(text) => Some(ResultContent::Text(text.text)),
            _ => {
                dropped_content = true;
                None
            }
        })
        .collect();
    ToolOutcome {
        status: if result.is_error == Some(true) {
            OutcomeStatus::Failed
        } else {
            OutcomeStatus::Succeeded
        },
        content,
        structured: result.structured_content,
        receipt: None,
        truncated: dropped_content,
    }
}

fn set_client_meta(request: &mut ClientRequest) {
    *request.get_meta_mut() = RequestMetaObject::with_client_context(
        VERSION,
        Implementation::new("grida-agent", env!("CARGO_PKG_VERSION")),
        ClientCapabilities::default(),
    );
}

fn request_id() -> RequestId {
    RequestId::String(Uuid::new_v4().to_string().into())
}

fn protocol_error() -> Error {
    Error::new(ErrorKind::Unavailable, "mcp_invalid_response")
}

fn endpoint_closed() -> Error {
    Error::new(ErrorKind::Unavailable, "mcp_endpoint_closed")
}

fn catalog_limit() -> Error {
    Error::new(ErrorKind::LimitExceeded, "mcp_catalog_limit")
}
