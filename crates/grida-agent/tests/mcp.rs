//! GRIDA-SEC-004 — actual native MCP listener, tool contract and admission.

use reqwest::{Client, Response, StatusCode};
use serde_json::{Value, json};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
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
        Self::start_tool("serve-mcp").await
    }

    async fn start_tool(command: &str) -> Self {
        let state = tempfile::tempdir().unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_grida-agent"))
            .env_clear()
            // Windows sockets need the system root, which clearing the environment removes.
            .envs(std::env::var_os("SystemRoot").map(|root| ("SystemRoot", root)))
            .env(TOKEN_ENV, TOKEN)
            .current_dir(state.path())
            .args([
                command,
                "--listen",
                "http://127.0.0.1:0/mcp",
                "--server-token-env",
                TOKEN_ENV,
            ])
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut stderr = BufReader::new(child.stderr.take().unwrap()).lines();
        let mut seen = Vec::new();
        let url = tokio::time::timeout(Duration::from_secs(5), async {
            while let Some(line) = stderr.next_line().await.unwrap() {
                if let Some(url) = line.strip_prefix("grida-agent: MCP listening on ") {
                    return Some(url.to_owned());
                }
                seen.push(line);
            }
            None
        })
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| panic!("the MCP listener did not start; stderr: {seen:?}"));
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

#[tokio::test]
async fn live_editor_exports_the_same_bounded_read_without_a_chat_store() {
    let mut server = Server::start_tool("serve-editor-mcp").await;
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
    assert_eq!(tools[0]["name"], "surface_list_open");
    assert_eq!(tools[0]["inputSchema"]["additionalProperties"], false);
    assert_eq!(
        tools[0]["outputSchema"]["properties"]["open"]["maxItems"],
        50
    );
    let mut input = server.child.stdin.take().unwrap();
    let mut output = BufReader::new(server.child.stdout.take().unwrap()).lines();
    let invalid = decode(
        server
            .request(
                "tools/call",
                json!({
                    "name": "surface_list_open", "arguments": {"workspace": "other"}
                }),
            )
            .send()
            .await
            .unwrap(),
    )
    .await;
    assert_eq!(invalid["result"]["isError"], true);
    assert!(
        tokio::time::timeout(Duration::from_millis(75), output.next_line())
            .await
            .is_err()
    );

    for snapshot in [
        json!({"available":true,"active":null,"open":[],"truncated":false}),
        json!({"available":true,"active":"/second.canvas","open":["/first.svg","/second.canvas"],"truncated":false}),
        json!({"available":false,"active":null,"open":[],"truncated":false}),
    ] {
        let call = server.request(
            "tools/call",
            json!({"name":"surface_list_open","arguments":{}}),
        );
        let pending = tokio::spawn(async move { decode(call.send().await.unwrap()).await });
        let line = tokio::time::timeout(Duration::from_secs(1), output.next_line())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let request: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(request.as_object().unwrap().len(), 1);
        assert!(uuid::Uuid::parse_str(request["requestId"].as_str().unwrap()).is_ok());
        let reply = json!({"requestId":request["requestId"], "snapshot":snapshot});
        input
            .write_all(format!("{reply}\n").as_bytes())
            .await
            .unwrap();
        let result = pending.await.unwrap();
        if snapshot["available"] == true {
            assert_eq!(result["result"]["isError"], false);
            assert_eq!(
                result["result"]["structuredContent"],
                json!({
                    "interactive":true,"active":snapshot["active"],"open":snapshot["open"],"truncated":false
                })
            );
        } else {
            assert_eq!(result["result"]["isError"], true);
            assert_eq!(
                result["result"]["content"][0]["text"],
                "editor_surface_endpoint_unavailable"
            );
            assert!(result["result"].get("structuredContent").is_none());
        }
    }
    assert!(server.state.path().read_dir().unwrap().next().is_none());
    drop(input);
    let status = tokio::time::timeout(Duration::from_secs(2), server.child.wait())
        .await
        .unwrap()
        .unwrap();
    assert!(status.success());
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
