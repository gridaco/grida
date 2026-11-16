//! GRIDA-SEC-004 — durable selections are private, observational product state.

use super::approvals::Stdio as StdioClient;
use super::lifecycle::prompt_request;
use super::*;

const CAPABILITY: &str = "co.grida/session/selection";
const INSPECT: &str = "_co.grida/session/selection";
const UPDATE: &str = "_co.grida/session/selection/update";

fn selected(model: &str, effort: &str) -> Value {
    json!({"connectionId":"a".repeat(64),"model":model,"effort":effort})
}

async fn start(state: &Path, endpoint: &str, negotiate: bool) -> StdioClient {
    let mut command = executable();
    command
        .args(["serve", "--stdio", "--state-dir"])
        .arg(state)
        .args([
            "--endpoint",
            endpoint,
            "--model",
            "fixture",
            "--credential-env",
            "GRIDA_AGENT_PROCESS_TEST_KEY",
        ])
        .env("GRIDA_AGENT_PROCESS_TEST_KEY", TEST_CREDENTIAL)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut client = StdioClient::from_child(command.spawn().unwrap());
    let mut initialize = extension_initialize();
    if negotiate {
        initialize["clientCapabilities"]["_meta"][CAPABILITY] = 1.into();
    }
    let ready = client.request("initialize", initialize).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"][CAPABILITY],
        json!(1)
    );
    client
}

#[tokio::test]
async fn private_selection_survives_restart_and_metadata_cli_without_provider_work() {
    let root = TempDir::new().unwrap();
    let state = root.path().join("state");
    let cwd = TempDir::new().unwrap();
    let endpoint = Endpoint::start(vec![]).await;
    let mut client = start(&state, &endpoint.url, true).await;
    let create = json!({"cwd":cwd.path(),"sessionId":"durable-draft","requestId":"create-draft","selection":selected("future-model","high")});
    let first = client
        .request("_co.grida/session/selection/create", create.clone())
        .await;
    assert_eq!(first["result"]["revision"], 1, "{first}");
    assert_eq!(
        client
            .request("_co.grida/session/selection/create", create)
            .await["result"],
        first["result"]
    );
    let identity = json!({"cwd":cwd.path(),"sessionId":"durable-draft"});
    assert_eq!(
        client.request(INSPECT, identity.clone()).await["result"]["selection"],
        selected("future-model", "high")
    );
    let wrong = client
        .request(
            INSPECT,
            json!({"cwd":root.path(),"sessionId":"durable-draft"}),
        )
        .await;
    assert_eq!(
        wrong["error"]["data"], "session_workspace_mismatch",
        "{wrong}"
    );
    let second_owner = executable()
        .args(["chat-selection", "--state-dir"])
        .arg(&state)
        .arg("--cwd")
        .arg(cwd.path())
        .args(["--session", "durable-draft"])
        .output()
        .await
        .unwrap();
    assert!(
        !second_owner.status.success(),
        "second process acquired the native store"
    );
    client.close().await;
    let inspect = executable()
        .args(["chat-selection", "--state-dir"])
        .arg(&state)
        .arg("--cwd")
        .arg(cwd.path())
        .args(["--session", "durable-draft"])
        .output()
        .await
        .unwrap();
    assert!(
        inspect.status.success(),
        "{}",
        String::from_utf8_lossy(&inspect.stderr)
    );
    let snapshot: Value = serde_json::from_slice(&inspect.stdout).unwrap();
    assert_eq!(snapshot["selection"], selected("future-model", "high"));
    let update = json!({"cwd":cwd.path(),"sessionId":"durable-draft","operationId":"second","expectedRevision":1,"selection":selected("another-model","low")});
    let updated = executable()
        .args(["chat-selection", "--state-dir"])
        .arg(&state)
        .arg("--cwd")
        .arg(cwd.path())
        .args([
            "--session",
            "durable-draft",
            "--operation",
            "update",
            "--request-json",
        ])
        .arg(update.to_string())
        .output()
        .await
        .unwrap();
    assert!(
        updated.status.success(),
        "{}",
        String::from_utf8_lossy(&updated.stderr)
    );
    let mut reopened = start(&state, &endpoint.url, true).await;
    let snapshot = reopened.request(INSPECT, identity.clone()).await;
    assert_eq!(snapshot["result"]["revision"], 2, "{snapshot}");
    assert_eq!(
        snapshot["result"]["selection"],
        selected("another-model", "low")
    );
    let receipt = reopened
        .request(
            "_co.grida/session/selection/receipt",
            json!({"cwd":cwd.path(),"sessionId":"durable-draft","operationId":"create-draft"}),
        )
        .await;
    assert_eq!(receipt["result"]["status"], "committed", "{receipt}");
    assert_eq!(receipt["result"]["receipt"], first["result"]);
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn new_admission_checks_selection_but_exact_input_retry_keeps_its_original_capture() {
    let root = TempDir::new().unwrap();
    let state = root.path().join("state");
    let cwd = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Retained answer")]).await;
    let mut client = start(&state, &endpoint.url, true).await;
    let session = "selected-chat";
    let created = client.request("_co.grida/session/selection/create",json!({"cwd":cwd.path(),"sessionId":session,"requestId":"create","selection":selected("fixture","medium")})).await;
    assert_eq!(created["result"]["revision"], 1, "{created}");
    let loaded = client
        .request(
            "session/load",
            json!({"cwd":cwd.path(),"sessionId":session,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let mut request = prompt_request(session, "input", "Inspect this request");
    request["_meta"] = json!({"co.grida/selectionRevision":2});
    let stale = client
        .request("_co.grida/session/submit", request.clone())
        .await;
    assert_eq!(
        stale["error"]["data"], "chat_selection_revision_changed",
        "{stale}"
    );
    request["_meta"]["co.grida/selectionRevision"] = 1.into();
    let accepted = client
        .request("_co.grida/session/submit", request.clone())
        .await;
    assert_eq!(accepted["result"]["inputId"], "input", "{accepted}");
    assert_eq!(endpoint.request().await["model"], "fixture");
    timeout(WAIT, async {
        loop {
            let snapshot = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            if snapshot["result"]["current"]["disposition"] == "settled"
                || (snapshot["result"]["current"].is_null()
                    && snapshot["result"]["latest"]["disposition"] == "settled")
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let changed = client.request(UPDATE,json!({"cwd":cwd.path(),"sessionId":session,"expectedRevision":1,"operationId":"choose-future","selection":selected("other-model","high")})).await;
    assert_eq!(changed["result"]["revision"], 2, "{changed}");
    request["_meta"]["co.grida/selectionRevision"] = 2.into();
    let retry = client.request("_co.grida/session/submit", request).await;
    assert_eq!(retry["result"]["inputId"], "input", "{retry}");
    let mut next = prompt_request(session, "next", "Future request");
    next["_meta"] = json!({"co.grida/selectionRevision":2});
    let wrong_route = client.request("_co.grida/session/submit", next).await;
    assert_eq!(
        wrong_route["error"]["data"], "chat_selection_route_changed",
        "{wrong_route}"
    );
    let history = client
        .request("_co.grida/session/history", json!({"sessionId":session}))
        .await;
    let fork_request = json!({"sessionId":session,"requestId":"fork-selected","expectedHistory":history["result"]["basis"],"anchor":history["result"]["latestAnchor"]});
    let fork = client
        .request("_co.grida/session/fork", fork_request.clone())
        .await;
    let destination = fork["result"]["sessionId"]
        .as_str()
        .unwrap_or_else(|| panic!("{fork}"));
    let inherited = client
        .request(INSPECT, json!({"cwd":cwd.path(),"sessionId":destination}))
        .await;
    assert_eq!(
        inherited["result"]["selection"],
        selected("other-model", "high"),
        "{inherited}"
    );
    let source_edit = client.request(UPDATE,json!({"cwd":cwd.path(),"sessionId":session,"expectedRevision":2,"operationId":"choose-source","selection":selected("fixture","low")})).await;
    assert_eq!(source_edit["result"]["revision"], 3, "{source_edit}");
    let destination_edit = client.request(UPDATE,json!({"cwd":cwd.path(),"sessionId":destination,"expectedRevision":1,"operationId":"choose-destination","selection":selected("fixture","medium")})).await;
    assert_eq!(
        destination_edit["result"]["revision"], 2,
        "{destination_edit}"
    );
    let retried_fork = client.request("_co.grida/session/fork", fork_request).await;
    assert_eq!(
        retried_fork["result"]["sessionId"], destination,
        "{retried_fork}"
    );
    let retained_destination = client
        .request(INSPECT, json!({"cwd":cwd.path(),"sessionId":destination}))
        .await;
    assert_eq!(
        retained_destination["result"]["selection"],
        selected("fixture", "medium"),
        "{retained_destination}"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn selection_operations_refuse_unnegotiated_private_and_shared_clients() {
    let root = TempDir::new().unwrap();
    let state = root.path().join("state");
    let cwd = TempDir::new().unwrap();
    let endpoint = Endpoint::start(vec![]).await;
    let mut client = start(&state, &endpoint.url, false).await;
    let response = client.request("_co.grida/session/selection/create",json!({"cwd":cwd.path(),"sessionId":"not-created","requestId":"create","selection":selected("fixture","medium")})).await;
    assert_eq!(response["error"]["code"], -32601, "{response}");
    assert!(!state.join("chat-selections").exists());
    client.close().await;
    let (server, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"][CAPABILITY] = 1.into();
    let ready = ws_rpc(&mut socket, 1, "initialize", initialize).await;
    assert!(ready["result"]["agentCapabilities"]["_meta"][CAPABILITY].is_null());
    let denied = ws_rpc(
        &mut socket,
        2,
        INSPECT,
        json!({"cwd":cwd.path(),"sessionId":"not-created"}),
    )
    .await;
    assert_eq!(denied["error"]["code"], -32601, "{denied}");
    drop(socket);
    super::lifecycle::terminate_shared_server(server).await;
    endpoint.done().await;
}
