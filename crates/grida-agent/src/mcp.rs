//! GRIDA-SEC-004 — explicitly enabled MCP tools over authenticated loopback HTTP.

use crate::loopback_bearer;
use crate::surface_tools::{OPEN_SURFACE, headless_surface};
use crate::tool_host::{CapabilityGrant, ToolHost};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::{CancellationToken, Error, ErrorKind, Result, ToolId};
use http_body_util::{BodyExt, Full, combinators::BoxBody};
use hyper::body::{Bytes, Incoming};
use hyper::header::{AUTHORIZATION, WWW_AUTHENTICATE};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::{TokioIo, TokioTimer};
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ErrorData,
    Implementation, ListToolsResult, PaginatedRequestParams, ProtocolVersion, ServerCapabilities,
    ServerConfig, Tool,
};
use rmcp::service::RequestContext;
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::never::NeverSessionManager,
};
use rmcp::{RoleServer, ServerHandler};
use serde_json::Value;
use std::borrow::Cow;
use std::collections::BTreeMap;
use std::convert::Infallible;
use std::future::Future;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::TcpListener;
use tokio::task::JoinSet;
use zeroize::Zeroizing;

mod browser;
mod editor;

const MCP_PATH: &str = "/mcp";
const MAX_CONNECTIONS: usize = 16;
const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_CALL_TIME: Duration = Duration::from_secs(10);
const MAX_CONNECTION_TIME: Duration = Duration::from_secs(15);

pub struct ListenOptions {
    address: SocketAddr,
    authorization: Zeroizing<Vec<u8>>,
}

impl ListenOptions {
    pub fn from_environment(address: &str, token_env: &str) -> Result<Self> {
        let address = address
            .strip_prefix("http://")
            .and_then(|target| target.strip_suffix(MCP_PATH))
            .and_then(|target| target.parse::<SocketAddr>().ok())
            .filter(|address| address.ip().is_loopback())
            .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "invalid_mcp_listen_address"))?;
        Ok(Self {
            address,
            authorization: loopback_bearer::authorization_from_env(token_env)?,
        })
    }
}

/// Serve the explicitly selected headless capabilities without opening a model
/// session, provider connection, or agent database.
pub async fn serve_headless(
    options: ListenOptions,
    shutdown: impl Future<Output = Result<()>>,
) -> Result<()> {
    serve_tools(options, headless_surface()?, &[OPEN_SURFACE], shutdown).await
}

/// Export the one live editor read owned by the private Desktop stdio peer.
/// The HTTP listener has no model, chat, or agent store.
pub async fn serve_editor(
    options: ListenOptions,
    shutdown: impl Future<Output = Result<()>>,
) -> Result<()> {
    let (host, pipe) = editor::tool()?;
    let closing = async {
        tokio::select! {
            biased;
            result = shutdown => result,
            result = pipe.run(tokio::io::stdin(), tokio::io::stdout()) => result,
        }
    };
    serve_tools(options, host, &[crate::editor_surfaces::LIST_OPEN], closing).await
}

/// Export the negotiated browser and workbench tools for the exact Desktop owner.
pub async fn serve_editor_browser(
    options: ListenOptions,
    shutdown: impl Future<Output = Result<()>>,
) -> Result<()> {
    let (host, pipe) = browser::tools()?;
    let closing = async {
        tokio::select! {
            biased;
            result = shutdown => result,
            result = pipe.run(tokio::io::stdin(), tokio::io::stdout()) => result,
        }
    };
    serve_tools(options, host, crate::browser_tools::NAMES, closing).await
}

async fn serve_tools(
    options: ListenOptions,
    host: ToolHost,
    names: &[&str],
    shutdown: impl Future<Output = Result<()>>,
) -> Result<()> {
    let catalog = ExportedTools::new(&host, names)?;
    let listener = TcpListener::bind(options.address)
        .await
        .map_err(|_| Error::new(ErrorKind::Unavailable, "mcp_listener_unavailable"))?;
    let address = listener
        .local_addr()
        .map_err(|_| Error::new(ErrorKind::Unavailable, "mcp_listener_address_unavailable"))?;
    let authority = Arc::new(address.to_string());
    let authorization = Arc::new(options.authorization);
    let closing = CancellationToken::new();
    let service = StreamableHttpService::new(
        move || Ok(catalog.clone()),
        NeverSessionManager::default().into(),
        StreamableHttpServerConfig::default()
            .with_legacy_session_mode(false)
            .with_json_response(true)
            .with_allowed_hosts([authority.as_str()])
            .enforce_origin_validation()
            .with_max_request_body_bytes(MAX_REQUEST_BYTES)
            .with_cancellation_token(closing.clone()),
    );
    eprintln!("grida-agent: MCP listening on http://{address}{MCP_PATH}");
    let mut clients = JoinSet::new();
    tokio::pin!(shutdown);
    let result = loop {
        tokio::select! {
            biased;
            result = &mut shutdown => break result,
            _ = clients.join_next(), if !clients.is_empty() => {}
            stream = loopback_bearer::next_loopback("MCP", || listener.accept()) => {
                if clients.len() >= MAX_CONNECTIONS {
                    continue;
                }
                let service = service.clone();
                let authority = authority.clone();
                let authorization = authorization.clone();
                clients.spawn(async move {
                    let connection = http1::Builder::new()
                        .keep_alive(false)
                        .timer(TokioTimer::new())
                        .header_read_timeout(Duration::from_secs(3))
                        .max_headers(32)
                        .max_buf_size(16 * 1024)
                        .serve_connection(
                            TokioIo::new(stream),
                            service_fn(move |mut request: Request<Incoming>| {
                                let service = service.clone();
                                let authority = authority.clone();
                                let authorization = authorization.clone();
                                async move {
                                    Ok::<_, Infallible>(match reject(&request, &authority, &authorization) {
                                        Some(response) => response,
                                        None => {
                                            request.headers_mut().remove(AUTHORIZATION);
                                            service.handle(request).await
                                        }
                                    })
                                }
                            }),
                        );
                    let _ = tokio::time::timeout(MAX_CONNECTION_TIME, connection).await;
                });
            }
        }
    };
    host.close();
    closing.cancel();
    clients.shutdown().await;
    result
}

fn reject(
    request: &Request<Incoming>,
    authority: &str,
    authorization: &[u8],
) -> Option<Response<BoxBody<Bytes, Infallible>>> {
    let status = loopback_bearer::rejection(request, MCP_PATH, authority, authorization)?;
    let mut response = Response::new(Full::new(Bytes::new()).boxed());
    *response.status_mut() = status;
    if status == StatusCode::UNAUTHORIZED {
        response
            .headers_mut()
            .insert(WWW_AUTHENTICATE, "Bearer".parse().expect("constant header"));
    }
    Some(response)
}

#[derive(Clone)]
struct ExportedTools {
    grants: Arc<BTreeMap<String, CapabilityGrant>>,
}

impl ExportedTools {
    fn new(host: &ToolHost, names: &[&str]) -> Result<Self> {
        let mut grants = BTreeMap::new();
        for &name in names {
            let grant = host.grant(&ToolId::new(name)?)?;
            if grants.insert(name.to_owned(), grant).is_some() {
                return Err(Error::new(ErrorKind::Conflict, "duplicate_mcp_export_tool"));
            }
        }
        Ok(Self {
            grants: Arc::new(grants),
        })
    }

    fn list(&self) -> std::result::Result<ListToolsResult, ErrorData> {
        let tools = self
            .grants
            .values()
            .map(Self::describe)
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(ListToolsResult::with_all_items(tools))
    }

    fn describe(grant: &CapabilityGrant) -> std::result::Result<Tool, ErrorData> {
        let definition = grant
            .describe()
            .map_err(|_| ErrorData::internal_error("Tool endpoint unavailable", None))?;
        let InputFormat::Json(input) = &definition.tool.input else {
            return Err(ErrorData::internal_error("Tool schema unavailable", None));
        };
        let input = input
            .as_object()
            .ok_or_else(|| ErrorData::internal_error("Tool schema unavailable", None))?;
        let output = definition
            .output_schema
            .as_object()
            .ok_or_else(|| ErrorData::internal_error("Tool schema unavailable", None))?;
        Ok(Tool::new(
            definition.tool.id.as_str().to_owned(),
            definition.tool.description.clone(),
            input.clone(),
        )
        .with_raw_output_schema(Arc::new(output.clone())))
    }

    async fn call(
        &self,
        request: CallToolRequestParams,
        cancellation: CancellationToken,
    ) -> std::result::Result<CallToolResponse, ErrorData> {
        let grant = self
            .grants
            .get(request.name.as_ref())
            .ok_or_else(|| ErrorData::invalid_params("Unknown tool", None))?;
        let definition = grant
            .describe()
            .map_err(|_| ErrorData::internal_error("Tool endpoint unavailable", None))?;
        if request.input_responses.is_some() || request.request_state.is_some() {
            return Err(ErrorData::invalid_params(
                "This tool takes one request",
                None,
            ));
        }
        let outcome = grant
            .invoke(
                definition.tool.version,
                Value::Object(request.arguments.unwrap_or_default()),
                cancellation,
                Instant::now() + MAX_CALL_TIME,
                definition.tool.max_output_bytes,
            )
            .await;
        let browser_profile = self.grants.contains_key("browser_open");
        let result = match outcome {
            Ok(outcome) => {
                let capture_binding = (browser_profile
                    && request.name.as_ref() == crate::browser_tools::CAPTURE
                    && outcome.status == OutcomeStatus::Succeeded)
                    .then(|| crate::tool_host::verified_call_binding(&outcome))
                    .flatten();
                let content = outcome
                    .content
                    .into_iter()
                    .filter_map(|item| match item {
                        ResultContent::Text(text) => Some(ContentBlock::text(text)),
                        ResultContent::Media(media) => {
                            let binding = capture_binding.as_ref()?;
                            let image = crate::browser_tools::mcp_image(&media, binding)?;
                            Some(ContentBlock::image(image, "image/jpeg"))
                        }
                    })
                    .collect();
                let mut result = match outcome.status {
                    OutcomeStatus::Succeeded => CallToolResult::success(content),
                    OutcomeStatus::Failed => CallToolResult::error(content),
                    OutcomeStatus::Cancelled => {
                        CallToolResult::error(vec![ContentBlock::text("Tool call cancelled")])
                    }
                    OutcomeStatus::Uncertain => {
                        CallToolResult::error(vec![ContentBlock::text("Tool outcome uncertain")])
                    }
                };
                result.structured_content = outcome.structured.or_else(|| {
                    if browser_profile && matches!(outcome.status, OutcomeStatus::Uncertain | OutcomeStatus::Cancelled) {
                        Some(serde_json::json!({"disposition": if outcome.status == OutcomeStatus::Cancelled { "not_dispatched" } else { "unknown" }}))
                    } else {
                        None
                    }
                });
                result
            }
            Err(error) => {
                let mut result =
                    CallToolResult::error(vec![ContentBlock::text(error.code.clone())]);
                if browser_profile {
                    let disposition = if error.kind == ErrorKind::Uncertain {
                        "unknown"
                    } else {
                        "not_dispatched"
                    };
                    result.structured_content =
                        Some(serde_json::json!({"error": error.code, "disposition": disposition}));
                }
                result
            }
        };
        Ok(CallToolResponse::Complete(result))
    }
}

impl ServerHandler for ExportedTools {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_server_info(
            Implementation::new("grida-tool-host", env!("CARGO_PKG_VERSION")),
        )
    }

    fn supported_protocol_versions(&self) -> Cow<'static, [ProtocolVersion]> {
        Cow::Borrowed(&[ProtocolVersion::V_2025_11_25, ProtocolVersion::V_2026_07_28])
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> std::result::Result<ListToolsResult, ErrorData> {
        self.list()
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> std::result::Result<CallToolResponse, ErrorData> {
        self.call(request, context.ct).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tool_host::{
        CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
    };
    use agent_kit_core::BoxFuture;
    use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
    use serde_json::json;

    struct Marker(&'static str);

    impl CapabilityExecutor for Marker {
        fn validate(&self, arguments: &Value) -> Result<()> {
            if arguments.as_object().is_some_and(|args| args.is_empty()) {
                Ok(())
            } else {
                Err(Error::new(
                    ErrorKind::InvalidInput,
                    "invalid_marker_arguments",
                ))
            }
        }

        fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
            Box::pin(async move {
                CapabilityReply {
                    binding: call.binding,
                    outcome: ToolOutcome {
                        status: OutcomeStatus::Succeeded,
                        content: vec![],
                        structured: Some(json!({"marker": self.0, "version": call.version})),
                        receipt: None,
                        truncated: false,
                    },
                }
            })
        }
    }

    #[tokio::test]
    async fn export_lists_and_dispatches_only_selected_grants() {
        let host = ToolHost::new([("first", 1), ("second", 2), ("private", 3)].map(
            |(name, version)| {
                (
                    CapabilityDefinition {
                        tool: ToolDefinition {
                            id: ToolId::new(name).unwrap(),
                            version,
                            description: format!("Read the {name} marker"),
                            input: InputFormat::Json(json!({
                                "type": "object", "additionalProperties": false
                            })),
                            max_input_bytes: 1024,
                            max_output_bytes: 1024,
                            recovery: RecoveryKind::Unavailable,
                        },
                        output_schema: json!({"type": "object"}),
                        effect: CapabilityEffect::Read,
                    },
                    Arc::new(Marker(name)) as Arc<dyn CapabilityExecutor>,
                )
            },
        ))
        .unwrap();
        assert!(ExportedTools::new(&host, &["first", "missing"]).is_err());
        assert!(ExportedTools::new(&host, &["first", "first"]).is_err());
        let catalog = ExportedTools::new(&host, &["second", "first"]).unwrap();
        let listed = catalog.list().unwrap();
        assert_eq!(
            listed
                .tools
                .iter()
                .map(|tool| tool.name.as_ref())
                .collect::<Vec<_>>(),
            ["first", "second"],
        );
        for (name, version) in [("first", 1), ("second", 2)] {
            let CallToolResponse::Complete(result) = catalog
                .call(CallToolRequestParams::new(name), CancellationToken::new())
                .await
                .unwrap()
            else {
                panic!("expected a complete tool result");
            };
            assert_eq!(
                result.structured_content,
                Some(json!({"marker": name, "version": version}))
            );
        }
        let denied = catalog
            .call(
                CallToolRequestParams::new("private"),
                CancellationToken::new(),
            )
            .await
            .unwrap_err();
        assert_eq!(denied.message, "Unknown tool");
        host.close();
        assert!(catalog.list().is_err());
        assert!(
            catalog
                .call(
                    CallToolRequestParams::new("first"),
                    CancellationToken::new()
                )
                .await
                .is_err()
        );
    }
}
