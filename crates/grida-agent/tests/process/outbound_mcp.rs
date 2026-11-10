//! GRIDA-SEC-004 — launch-owned outbound MCP through the built agent.

use super::approvals::Stdio as PrivateStdio;
use super::lifecycle::{prompt_request, queue_basis, task_basis};
use super::*;

const MCP_TOKEN: &str = "ab0123456789ab0123456789ab0123456789ab0123456789ab0123456789ab01";
const TOKEN_ENV: &str = "GRIDA_FIXTURE_OUTBOUND_MCP_TOKEN";
const TOOL: &str = "mcp_grida_surface_open";
const OPEN_ARGUMENTS: &str = r#"{"path":"/poster.canvas"}"#;

async fn local_mcp(workspace: &Path) -> (Child, String) {
    let mut child = executable()
        .env_clear()
        .env(TOKEN_ENV, MCP_TOKEN)
        .current_dir(workspace)
        .args([
            "serve-mcp",
            "--listen",
            "http://127.0.0.1:0/mcp",
            "--server-token-env",
            TOKEN_ENV,
        ])
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stderr = BufReader::new(child.stderr.take().unwrap()).lines();
    let started = timeout(WAIT, stderr.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let address = started
        .strip_prefix("grida-agent: MCP listening on ")
        .unwrap()
        .to_owned();
    (child, address)
}

fn with_mcp(command: &mut Command, address: &str) {
    command
        .args([
            "--mcp-endpoint",
            address,
            "--mcp-source",
            "grida",
            "--mcp-token-env",
            TOKEN_ENV,
            "--mcp-tool",
            "surface_open",
        ])
        .env(TOKEN_ENV, MCP_TOKEN);
}

fn run(state: &Path, workspace: &Path, provider: &str, peer: &str, mode: &str) -> Command {
    let mut command = executable();
    command
        .args(["run", "--mode", mode, "--prompt", "Handle presentation."])
        .arg("--cwd")
        .arg(workspace);
    configured(&mut command, state, provider);
    with_mcp(&mut command, peer);
    command
}

fn offered(request: &Value) -> bool {
    request["tools"]
        .as_array()
        .is_some_and(|tools| tools.iter().any(|tool| tool["function"]["name"] == TOOL))
}

fn assert_domain_result(request: &Value) {
    let content = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|message| message["role"] == "tool")
        .unwrap()["content"]
        .as_str()
        .unwrap();
    let result: Value = serde_json::from_str(content).unwrap();
    assert_eq!(result["status"], "succeeded");
    assert_eq!(
        result["structured"],
        json!({"path":"/poster.canvas","requested":false,"reason":"not_interactive"})
    );
}

#[tokio::test]
async fn act_runs_allowlisted_mcp_tool_and_plan_never_contacts_peer() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (mut peer, address) = local_mcp(workspace.path()).await;
    let mut provider = Endpoint::start(vec![
        Reply::Tool(TOOL, OPEN_ARGUMENTS),
        Reply::Finished("Presentation is unavailable."),
        Reply::Finished("Propose a presentation step."),
    ])
    .await;

    let act = timeout(
        WAIT,
        run(
            &temporary.path().join("act"),
            workspace.path(),
            &provider.url,
            &address,
            "act",
        )
        .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        act.status.success(),
        "{}",
        String::from_utf8_lossy(&act.stderr)
    );
    assert_eq!(records(&act.stdout)[1]["disposition"], "succeeded");
    assert!(offered(&provider.request().await));
    assert_domain_result(&provider.request().await);

    let untouched = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let decoy = format!("http://{}/mcp", untouched.local_addr().unwrap());
    let plan = timeout(
        WAIT,
        run(
            &temporary.path().join("plan"),
            workspace.path(),
            &provider.url,
            &decoy,
            "plan",
        )
        .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        plan.status.success(),
        "{}",
        String::from_utf8_lossy(&plan.stderr)
    );
    assert_eq!(records(&plan.stdout)[1]["disposition"], "succeeded");
    let planned = provider.request().await;
    assert!(!offered(&planned));
    assert!(planned["messages"].to_string().contains("Plan is active"));
    assert!(
        timeout(Duration::from_millis(50), untouched.accept())
            .await
            .is_err()
    );
    provider.done().await;
    peer.kill().await.unwrap();
}

async fn serve(state: &Path, endpoint: &str, peer: &str) -> PrivateStdio {
    let mut command = executable();
    command.args(["serve", "--stdio"]);
    configured(&mut command, state, endpoint);
    with_mcp(&mut command, peer);
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = PrivateStdio::from_child(child);
    let initialize = client.request("initialize", extension_initialize()).await;
    assert_eq!(initialize["result"]["protocolVersion"], 1);
    client
}

async fn new_session(client: &mut PrivateStdio, workspace: &Path) -> String {
    let created = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    created["result"]["sessionId"].as_str().unwrap().into()
}

async fn snapshot(client: &mut PrivateStdio, session: &str) -> Value {
    let snapshot = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(snapshot["result"].is_object(), "{snapshot}");
    snapshot["result"].clone()
}

#[tokio::test]
async fn stdio_act_lease_cannot_resume_or_edit_its_retained_work_after_restart() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let (mut peer, address) = local_mcp(workspace.path()).await;
    let mut provider = Endpoint::start(vec![
        Reply::Finished("A proposal only."),
        Reply::Tool(TOOL, OPEN_ARGUMENTS),
        Reply::Hold("Paused after the remote tool."),
    ])
    .await;
    let mut first = serve(&state, &provider.url, &address).await;
    let plan = new_session(&mut first, workspace.path()).await;
    let mut draft = prompt_request(&plan, "new-plan", "Propose a change.");
    draft["operatingRegime"] = "plan".into();
    let planned = first.request("_co.grida/session/submit", draft).await;
    assert_eq!(planned["result"]["disposition"], "claimed", "{planned}");
    assert!(!offered(&provider.request().await));
    let session = new_session(&mut first, workspace.path()).await;
    let session = session.as_str();

    let started = first
        .request(
            "_co.grida/session/submit",
            prompt_request(session, "start-act", "Present the artifact."),
        )
        .await;
    assert_eq!(started["result"]["disposition"], "claimed", "{started}");
    assert!(offered(&provider.request().await));
    assert_domain_result(&provider.request().await);
    let queued = first
        .request(
            "_co.grida/session/enqueue",
            prompt_request(session, "retained-queued", "Act later."),
        )
        .await;
    assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
    first.close().await;

    let mut second = serve(&state, &provider.url, &address).await;
    let loaded = second
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let current = snapshot(&mut second, session).await;
    assert_eq!(current["current"]["disposition"], "suspended");
    let resume = second
        .request(
            "_co.grida/session/resume",
            json!({
                "task":task_basis(&current,session,"resume-with-replacement-mcp"),
                "expectedEpoch":current["current"]["epoch"],
                "expectedJournalPosition":current["current"]["journalPosition"],
            }),
        )
        .await;
    assert_eq!(
        resume["error"]["data"], "retained_mcp_lease_unavailable",
        "{resume}"
    );
    let edit = second
        .request(
            "_co.grida/session/replace",
            json!({
                "queue":queue_basis(&current,session,"edit-with-replacement-mcp"),
                "inputId":"retained-queued",
                "replacementInputId":"replacement",
                "prompt":[{"type":"text","text":"Revised prompt."}],
            }),
        )
        .await;
    assert_eq!(
        edit["error"]["data"], "retained_mcp_lease_unavailable",
        "{edit}"
    );
    assert_eq!(
        snapshot(&mut second, session).await["current"],
        current["current"]
    );

    let stop = second
        .request(
            "_co.grida/session/stop",
            task_basis(&current, session, "stop-without-mcp"),
        )
        .await;
    assert!(stop.get("error").is_none(), "{stop}");
    timeout(WAIT, async {
        loop {
            let current = snapshot(&mut second, session).await;
            if current["current"].is_null() {
                assert_eq!(current["latest"]["status"], "cancelled");
                assert_eq!(current["queue"][0]["inputId"], "retained-queued");
                assert_eq!(current["admissionPaused"], true);
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    second.close().await;
    provider.done().await;
    peer.kill().await.unwrap();
}

#[tokio::test]
async fn lost_mcp_result_is_reported_without_redispatch() {
    use http_body_util::{BodyExt, Full};
    use hyper::body::{Bytes, Incoming};
    use hyper::server::conn::http1;
    use hyper::service::service_fn;
    use hyper::{Request, Response};
    use hyper_util::rt::TokioIo;
    use std::convert::Infallible;

    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let peer = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("http://{}/mcp", peer.local_addr().unwrap());
    let exchange = tokio::spawn(async move {
        for method in ["server/discover", "tools/list", "tools/call"] {
            let (socket, _) = timeout(WAIT, peer.accept()).await.unwrap().unwrap();
            let service = service_fn(move |request: Request<Incoming>| async move {
                assert_eq!(
                    request.headers()["authorization"],
                    format!("Bearer {MCP_TOKEN}")
                );
                let bytes = request.collect().await.unwrap().to_bytes();
                let request: Value = serde_json::from_slice(&bytes).unwrap();
                assert_eq!(request["method"], method);
                let response = Response::builder().header("connection", "close");
                if method == "tools/call" {
                    // The operation was received, but the stream has no final result.
                    assert_eq!(request["params"]["name"], "surface_open");
                    return Ok::<_, Infallible>(
                        response
                            .header("content-type", "text/event-stream")
                            .body(Full::new(Bytes::from_static(b": effect accepted\n\n")))
                            .unwrap(),
                    );
                }
                let result = if method == "server/discover" {
                    json!({
                        "resultType":"complete","supportedVersions":["2026-07-28"],
                        "capabilities":{"tools":{}},"ttlMs":0,"cacheScope":"private"
                    })
                } else {
                    json!({
                        "resultType":"complete",
                        "tools":[{"name":"surface_open","inputSchema":{"type":"object"}}]
                    })
                };
                let rpc = json!({"jsonrpc":"2.0","id":request["id"],"result":result}).to_string();
                Ok(response
                    .header("content-type", "application/json")
                    .body(Full::new(Bytes::from(rpc)))
                    .unwrap())
            });
            timeout(
                WAIT,
                http1::Builder::new().serve_connection(TokioIo::new(socket), service),
            )
            .await
            .unwrap()
            .unwrap();
        }
        peer
    });
    let mut provider = Endpoint::start(vec![Reply::Tool(TOOL, OPEN_ARGUMENTS)]).await;
    let output = timeout(
        WAIT,
        run(
            &temporary.path().join("state"),
            workspace.path(),
            &provider.url,
            &address,
            "act",
        )
        .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(
        output.status.code(),
        Some(5),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let finished = &records(&output.stdout)[1];
    assert_eq!(finished["disposition"], "uncertain");
    assert_eq!(
        finished["account"]["unresolved"].as_array().unwrap().len(),
        1
    );
    assert!(offered(&provider.request().await));
    let peer = timeout(WAIT, exchange).await.unwrap().unwrap();
    assert!(
        timeout(Duration::from_millis(50), peer.accept())
            .await
            .is_err()
    );
    provider.done().await;
}
