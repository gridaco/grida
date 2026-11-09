//! GRIDA-SEC-004 — actual native MCP listener, tool contract and admission.

use reqwest::{Client, Response, StatusCode};
use serde_json::{Value, json};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

const TOKEN_ENV: &str = "GRIDA_MCP_FIXTURE_TOKEN";
const TOKEN: &str = "ab0123456789ab0123456789ab0123456789ab0123456789ab0123456789ab01";
const REVISION: &str = "2026-07-28";

struct Server {
    child: Child,
    url: String,
    client: Client,
    state: tempfile::TempDir,
}

impl Server {
    async fn start() -> Self {
        let state = tempfile::tempdir().unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_grida-agent"))
            .env_clear()
            .env(TOKEN_ENV, TOKEN)
            .current_dir(state.path())
            .args([
                "serve-mcp",
                "--listen",
                "http://127.0.0.1:0/mcp",
                "--server-token-env",
                TOKEN_ENV,
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
        let url = startup
            .strip_prefix("grida-agent: MCP listening on ")
            .unwrap()
            .into();
        let client = Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        Self {
            child,
            url,
            client,
            state,
        }
    }

    fn request(&self, method: &str, params: Value) -> reqwest::RequestBuilder {
        let mut request = self
            .client
            .post(&self.url)
            .bearer_auth(TOKEN)
            .header("accept", "application/json, text/event-stream")
            .header("mcp-protocol-version", REVISION)
            .header("mcp-method", method);
        if let Some(name) = params.get("name").and_then(Value::as_str) {
            request = request.header("mcp-name", name);
        }
        let mut params = params.as_object().unwrap().clone();
        params.insert(
            "_meta".into(),
            json!({
                "io.modelcontextprotocol/protocolVersion": REVISION,
                "io.modelcontextprotocol/clientInfo": {"name": "fixture", "version": "1"},
                "io.modelcontextprotocol/clientCapabilities": {}
            }),
        );
        request.header("content-type", "application/json").body(
            json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).to_string(),
        )
    }
}

async fn decode(response: Response) -> Value {
    let status = response.status();
    let body = response.text().await.unwrap();
    assert_eq!(status, StatusCode::OK, "{body}");
    serde_json::from_str(&body).unwrap_or_else(|_| panic!("expected JSON: {body}"))
}

#[tokio::test]
async fn current_wire_discovers_and_runs_only_the_reviewed_headless_tool() {
    let mut server = Server::start().await;
    let discovery = decode(
        server
            .request("server/discover", json!({}))
            .send()
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(discovery["result"]["capabilities"]["tools"], json!({}));
    assert!(
        discovery["result"]["supportedVersions"]
            .as_array()
            .unwrap()
            .contains(&json!(REVISION))
    );
    let listed = decode(
        server
            .request("tools/list", json!({}))
            .send()
            .await
            .unwrap(),
    )
    .await;
    let tools = listed["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0]["name"], "surface_open");
    assert_eq!(tools[0]["inputSchema"]["required"], json!(["path"]));
    assert_eq!(
        tools[0]["outputSchema"]["properties"]["requested"]["const"],
        false
    );
    let called = decode(
        server
            .request(
                "tools/call",
                json!({
                    "name": "surface_open", "arguments": {"path": "/poster.canvas"}
                }),
            )
            .send()
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(called["result"]["isError"], false);
    assert_eq!(
        called["result"]["structuredContent"],
        json!({
            "path": "/poster.canvas", "requested": false, "reason": "not_interactive"
        })
    );
    let invalid = decode(
        server
            .request(
                "tools/call",
                json!({
                    "name": "surface_open", "arguments": {"path": "relative.canvas"}
                }),
            )
            .send()
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(invalid["result"]["isError"], true);
    assert!(server.state.path().read_dir().unwrap().next().is_none());
    server.child.kill().await.unwrap();
}

#[tokio::test]
async fn loopback_authorization_precedes_tool_dispatch() {
    let server = Server::start().await;
    let missing = server.client.post(&server.url).send().await.unwrap();
    assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);
    let origin = server
        .request("tools/list", json!({}))
        .header("origin", "https://untrusted.invalid")
        .send()
        .await
        .unwrap();
    assert_eq!(origin.status(), StatusCode::FORBIDDEN);
    let rebound = server
        .request("tools/list", json!({}))
        .header("host", "rebound.invalid")
        .send()
        .await
        .unwrap();
    assert_eq!(rebound.status(), StatusCode::FORBIDDEN);
    let wrong_path = server
        .client
        .post(format!("{}?secret=redacted", server.url))
        .bearer_auth(TOKEN)
        .send()
        .await
        .unwrap();
    assert_eq!(wrong_path.status(), StatusCode::NOT_FOUND);
}
