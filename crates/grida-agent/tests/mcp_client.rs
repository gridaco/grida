//! GRIDA-SEC-004 — explicit outbound MCP dispatch over the real HTTP boundary.

use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{Inventory, InvocationContext, InvocationRecovery, RecoveryKind};
use agent_kit_core::{AttemptId, CancellationToken, OperationId, ToolId};
use futures_util::stream;
use grida_agent::mcp_client::McpClient;
use grida_agent::tool_host::CapabilityEffect;
use http_body_util::{BodyExt, Full, StreamBody, combinators::BoxBody};
use hyper::body::{Bytes, Frame, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde_json::{Value, json};
use std::convert::Infallible;
use std::process::Stdio;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio::task::{JoinHandle, JoinSet};

const TOKEN: &str = "ab0123456789ab0123456789ab0123456789ab0123456789ab0123456789ab01";
const REVISION: &str = "2026-07-28";

#[tokio::test]
async fn native_mcp_server_grants_only_explicitly_selected_tools() {
    let state = tempfile::tempdir().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_grida-agent"))
        .env_clear()
        .env("MCP_FIXTURE_TOKEN", TOKEN)
        .current_dir(state.path())
        .args([
            "serve-mcp",
            "--listen",
            "http://127.0.0.1:0/mcp",
            "--server-token-env",
            "MCP_FIXTURE_TOKEN",
        ])
        .kill_on_drop(true)
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stderr = BufReader::new(child.stderr.take().unwrap()).lines();
    let startup = tokio::time::timeout(Duration::from_secs(5), stderr.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let endpoint = startup
        .strip_prefix("grida-agent: MCP listening on ")
        .unwrap();

    let client = McpClient::connect("grida", endpoint, TOKEN, &["surface_open"])
        .await
        .unwrap();
    assert!(client.grant("unselected").is_err());
    let grant = client.grant("surface_open").unwrap();
    let definition = grant.describe().unwrap();
    assert_eq!(definition.tool.id.as_str(), "mcp_grida_surface_open");
    assert_eq!(definition.effect, CapabilityEffect::Mutation);
    assert_eq!(definition.tool.recovery, RecoveryKind::Unavailable);

    let outcome = grant
        .invoke(
            1,
            json!({"path": "/poster.canvas"}),
            CancellationToken::new(),
            deadline(),
            8192,
        )
        .await
        .unwrap();
    assert_eq!(outcome.status, OutcomeStatus::Succeeded);
    assert_eq!(
        outcome.structured,
        Some(json!({"path": "/poster.canvas", "requested": false, "reason": "not_interactive"}))
    );
    assert!(outcome.receipt.is_some());
    let remote_rejection = grant
        .invoke(
            1,
            json!({"path": "relative.canvas"}),
            CancellationToken::new(),
            deadline(),
            8192,
        )
        .await
        .unwrap();
    assert_eq!(remote_rejection.status, OutcomeStatus::Failed);

    let replacement = McpClient::connect("grida", endpoint, TOKEN, &["surface_open"])
        .await
        .unwrap();
    assert_ne!(replacement.lease(), client.lease());
    client.close();
    assert!(client.grant("surface_open").is_err());
    assert!(grant.describe().is_err());
    assert!(replacement.grant("surface_open").is_ok());
    child.kill().await.unwrap();
}

#[tokio::test]
async fn follows_bounded_pages_and_projects_only_supported_sse_content() {
    let peer = Peer::start(|request| match request["method"].as_str().unwrap() {
        "server/discover" => discovered(&request),
        "tools/list" if request["params"]["cursor"].is_null() => reply(
            &request,
            json!({"resultType":"complete","tools":[tool("unselected")],"nextCursor":"page-2"}),
        ),
        "tools/list" => {
            assert_eq!(request["params"]["cursor"], "page-2");
            reply(&request, json!({"resultType":"complete","tools":[tool("record")]}))
        }
        "tools/call" => {
            assert_eq!(request["params"]["name"], "record");
            assert_eq!(request["params"]["arguments"], json!({"value":7}));
            events(vec![
                ": comment\r\n\r\n".into(),
                "data: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{\"progressToken\":1,\"progress\":1}}\n\n".into(),
                "data: ".into(),
                rpc(&request, json!({
                    "resultType":"complete",
                    "isError":false,
                    "content":[
                        {"type":"text","text":"recorded"},
                        {"type":"resource_link","uri":"file:///unopened","name":"ignored"}
                    ],
                    "structuredContent":{"value":7}
                })),
                "\n\n".into(),
            ])
        }
        _ => panic!("unexpected request"),
    })
    .await;

    let client = McpClient::connect("fixture", &peer.url, TOKEN, &["record"])
        .await
        .unwrap();
    assert!(client.grant("unselected").is_err());
    let (inventory, tool) = inventory(&client);
    let prepared = inventory
        .prepare(
            OperationId::new("logical-record").unwrap(),
            &tool,
            ToolArguments::Json(json!({"value":7})),
        )
        .unwrap();
    let outcome = prepared.invoke(context()).await;
    assert_eq!(outcome.status, OutcomeStatus::Succeeded);
    assert_eq!(
        outcome.content,
        vec![ResultContent::Text("recorded".into())]
    );
    assert_eq!(outcome.structured, Some(json!({"value":7})));
    assert!(outcome.truncated);
}

#[tokio::test]
async fn response_stream_loss_after_dispatch_is_uncertain_and_not_replayed() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let peer_calls = Arc::clone(&calls);
    let peer = Peer::start(move |request| match request["method"].as_str().unwrap() {
        "server/discover" => discovered(&request),
        "tools/list" => reply(
            &request,
            json!({"resultType":"complete","tools":[tool("record")]}),
        ),
        "tools/call" => {
            peer_calls.lock().unwrap().push(request["id"].clone());
            events(vec![": effect admitted before disconnect\n\n".into()])
        }
        _ => panic!("unexpected request"),
    })
    .await;

    let client = McpClient::connect("fixture", &peer.url, TOKEN, &["record"])
        .await
        .unwrap();
    let (inventory, tool) = inventory(&client);
    let prepared = inventory
        .prepare(
            OperationId::new("logical-record").unwrap(),
            &tool,
            ToolArguments::Json(json!({"value":7})),
        )
        .unwrap();
    // An already-prepared recovery still uses the original lease and never
    // sends another request to the peer.
    let recovery = inventory.restore(prepared.invocation().clone()).unwrap();
    let invocation = prepared.invocation().clone();
    let outcome = prepared.invoke(context()).await;
    assert_eq!(outcome.status, OutcomeStatus::Uncertain);
    let evidence: Value = serde_json::from_slice(outcome.receipt.unwrap().bytes()).unwrap();
    assert_eq!(evidence["binding"]["endpoint"], client.lease().as_str());
    assert!(client.grant("record").is_err());
    assert_eq!(
        inventory.restore(invocation.clone()).err().unwrap().code,
        "mcp_endpoint_closed"
    );
    let recovered = recovery
        .recover(
            InvocationRecovery {
                invocation,
                checkpoint: None,
                receipts: Vec::new(),
            },
            context(),
        )
        .await;
    assert_eq!(recovered.status, OutcomeStatus::Uncertain);
    assert_eq!(
        *calls.lock().unwrap(),
        vec![evidence["binding"]["id"].clone()]
    );
}

#[tokio::test]
async fn refuses_redirects_and_non_numeric_or_unbound_endpoint_forms() {
    let redirected = Arc::new(AtomicUsize::new(0));
    let target_hits = Arc::clone(&redirected);
    let target = Peer::start(move |_| {
        target_hits.fetch_add(1, Ordering::SeqCst);
        empty(StatusCode::UNAUTHORIZED)
    })
    .await;
    let location = target.url.clone();
    let source = Peer::start(move |_| {
        let mut response = empty(StatusCode::TEMPORARY_REDIRECT);
        response
            .headers_mut()
            .insert("location", location.parse().unwrap());
        response
    })
    .await;
    assert_eq!(refusal(&source.url).await, "mcp_http_request_refused");
    assert_eq!(redirected.load(Ordering::SeqCst), 0);
    for endpoint in [
        "http://localhost:1234/mcp",
        "http://127.1:1234/mcp",
        "http://0.0.0.0:1234/mcp",
        "http://127.0.0.1:0/mcp",
        "http://name@127.0.0.1:1234/mcp",
        "http://127.0.0.1:1234/mcp?token=other",
        "http://127.0.0.1:1234/mcp#other",
        "http://127.0.0.1:1234/one/../mcp",
    ] {
        assert_eq!(refusal(endpoint).await, "invalid_mcp_endpoint");
    }
}

#[tokio::test]
async fn refuses_repeated_cursors_oversized_bodies_and_external_schema_references() {
    let repeat = Peer::start(|request| match request["method"].as_str().unwrap() {
        "server/discover" => discovered(&request),
        "tools/list" => reply(
            &request,
            json!({"resultType":"complete","tools":[],"nextCursor":"same"}),
        ),
        _ => panic!("unexpected request"),
    })
    .await;
    assert_eq!(refusal(&repeat.url).await, "mcp_catalog_limit");

    let oversized = Peer::start(|_| {
        Response::builder()
            .header("content-type", "application/json")
            .body(Full::new(Bytes::from(vec![b' '; 257 * 1024])).boxed())
            .unwrap()
    })
    .await;
    assert_eq!(refusal(&oversized.url).await, "mcp_http_body_limit");

    let schema = Peer::start(|request| match request["method"].as_str().unwrap() {
        "server/discover" => discovered(&request),
        "tools/list" => reply(
            &request,
            json!({"resultType":"complete","tools":[
                {"name":"record","inputSchema":{"type":"object","$ref":"file:///not-read"}}
            ]}),
        ),
        _ => panic!("unexpected request"),
    })
    .await;
    assert_eq!(
        refusal(&schema.url).await,
        "mcp_tool_descriptor_unsupported"
    );
}

type Reply = Response<BoxBody<Bytes, Infallible>>;

struct Peer {
    url: String,
    task: JoinHandle<()>,
}

impl Peer {
    async fn start(handler: impl Fn(Value) -> Reply + Clone + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let mut connections = JoinSet::new();
            loop {
                tokio::select! {
                    accepted = listener.accept() => {
                        let (socket, _) = accepted.unwrap();
                        let handler = handler.clone();
                        connections.spawn(async move {
                            let service = service_fn(move |request: Request<Incoming>| {
                                let handler = handler.clone();
                                async move {
                                    assert_eq!(request.method(), "POST");
                                    assert_eq!(request.uri().path(), "/mcp");
                                    assert_eq!(request.headers()["host"], address.to_string());
                                    assert_eq!(request.headers()["authorization"], format!("Bearer {TOKEN}"));
                                    assert_eq!(request.headers()["mcp-protocol-version"], REVISION);
                                    let method = request.headers()["mcp-method"].to_str().unwrap().to_owned();
                                    let name = request.headers().get("mcp-name").cloned();
                                    let bytes = request.collect().await.unwrap().to_bytes();
                                    let body: Value = serde_json::from_slice(&bytes).unwrap();
                                    assert_eq!(body["method"], method);
                                    assert_eq!(
                                        body["params"]["_meta"]["io.modelcontextprotocol/protocolVersion"],
                                        REVISION
                                    );
                                    assert_eq!(
                                        body["params"]["_meta"]["io.modelcontextprotocol/clientCapabilities"],
                                        json!({})
                                    );
                                    if method == "tools/call" {
                                        assert_eq!(name.unwrap().to_str().unwrap(), body["params"]["name"]);
                                    }
                                    Ok::<_, Infallible>(handler(body))
                                }
                            });
                            let _ = tokio::time::timeout(
                                Duration::from_secs(5),
                                http1::Builder::new().serve_connection(TokioIo::new(socket), service),
                            ).await;
                        });
                    }
                    _ = connections.join_next(), if !connections.is_empty() => {}
                }
            }
        });
        Self {
            url: format!("http://{address}/mcp"),
            task,
        }
    }
}

impl Drop for Peer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

fn tool(name: &str) -> Value {
    json!({
        "name":name,
        "description":"Records a value.",
        "inputSchema":{"type":"object","properties":{"value":{"type":"integer"}},"required":["value"]},
        "annotations":{"readOnlyHint":true,"idempotentHint":true}
    })
}

fn discovered(request: &Value) -> Reply {
    reply(
        request,
        json!({
            "resultType":"complete",
            "supportedVersions":[REVISION],
            "capabilities":{"tools":{}},
            "ttlMs":0,
            "cacheScope":"private"
        }),
    )
}

fn rpc(request: &Value, result: Value) -> String {
    json!({"jsonrpc":"2.0","id":request["id"],"result":result}).to_string()
}

fn reply(request: &Value, result: Value) -> Reply {
    Response::builder()
        .header("content-type", "application/json")
        .body(Full::new(Bytes::from(rpc(request, result))).boxed())
        .unwrap()
}

fn events(chunks: Vec<String>) -> Reply {
    let frames = chunks
        .into_iter()
        .map(|chunk| Ok(Frame::data(Bytes::from(chunk))));
    Response::builder()
        .header("content-type", "text/event-stream")
        .body(StreamBody::new(stream::iter(frames)).boxed())
        .unwrap()
}

fn empty(status: StatusCode) -> Reply {
    Response::builder()
        .status(status)
        .body(Full::new(Bytes::new()).boxed())
        .unwrap()
}

fn inventory(client: &McpClient) -> (agent_kit_core::tools::InventorySnapshot, ToolId) {
    let grant = client.grant("record").unwrap();
    let id = grant.describe().unwrap().tool.id.clone();
    let mut inventory = Inventory::new();
    inventory.insert(Arc::new(grant)).unwrap();
    (inventory.snapshot(std::slice::from_ref(&id)).unwrap(), id)
}

fn deadline() -> Instant {
    Instant::now() + Duration::from_secs(3)
}

fn context() -> InvocationContext {
    InvocationContext {
        attempt: AttemptId::new("attempt-1").unwrap(),
        cancellation: CancellationToken::new(),
        deadline: Some(deadline()),
        max_output_bytes: 8192,
    }
}

async fn refusal(endpoint: &str) -> String {
    McpClient::connect("fixture", endpoint, TOKEN, &["record"])
        .await
        .err()
        .expect("the peer must be refused")
        .code
}
