use super::approvals::Stdio as StdioClient;
use super::lifecycle::{prompt_request, task_basis};
use super::*;

async fn start(state: &Path, endpoint: &str, model: &str) -> StdioClient {
    let mut command = executable();
    command
        .args(["serve", "--stdio", "--state-dir"])
        .arg(state)
        .args([
            "--endpoint",
            endpoint,
            "--model",
            model,
            "--credential-env",
            "GRIDA_AGENT_PROCESS_TEST_KEY",
        ])
        .env("GRIDA_AGENT_PROCESS_TEST_KEY", TEST_CREDENTIAL);
    let mut client = StdioClient::from_child(
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"]["co.grida/session/model-change"] = 1.into();
    let ready = client.request("initialize", initialize).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"]["co.grida/session/model-change"], 1,
        "{ready}"
    );
    client
}

async fn snapshot(client: &mut StdioClient, session: &str) -> Value {
    let reply = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(reply.get("error").is_none(), "{reply}");
    reply["result"].clone()
}

async fn wait_for(
    client: &mut StdioClient,
    session: &str,
    ready: impl Fn(&Value) -> bool,
) -> Value {
    timeout(WAIT, async {
        loop {
            let view = snapshot(client, session).await;
            if ready(&view) {
                return view;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn accepted_model_keeps_queued_paused_and_restarted_work_after_creation_route_changes() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("First B attempt"),
        Reply::Hold("Resumed B attempt"),
        Reply::Finished("Recovered B answer"),
        Reply::Finished("Queued B answer"),
    ])
    .await;
    let mut birth = start(&state, &endpoint.url, "route-a").await;
    let created = birth
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    birth.close().await;
    let load = json!({"cwd":workspace.path(),"sessionId":session,"mcpServers":[]});
    let mut selected = start(&state, &endpoint.url, "route-b").await;
    assert!(
        selected
            .request("session/load", load.clone())
            .await
            .get("error")
            .is_none()
    );
    let accepted = selected
        .request(
            "_co.grida/session/submit",
            prompt_request(session, "accepted-b", "Run under B"),
        )
        .await;
    assert_eq!(accepted["result"]["disposition"], "claimed", "{accepted}");
    assert_eq!(endpoint.request().await["model"], "route-b");
    let queued = selected
        .request(
            "_co.grida/session/enqueue",
            prompt_request(session, "queued-b", "Continue under B"),
        )
        .await;
    assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
    let blocker = selected
        .request("_co.grida/session/model-change", json!({"prepare":true}))
        .await;
    assert_eq!(blocker["result"]["blocker"], "active_turn", "{blocker}");
    let view = snapshot(&mut selected, session).await;
    let paused = selected
        .request(
            "_co.grida/session/pause",
            task_basis(&view, session, "pause-b"),
        )
        .await;
    assert!(paused.get("error").is_none(), "{paused}");
    let view = wait_for(&mut selected, session, |v| {
        v["current"]["disposition"] == "suspended"
    })
    .await;
    let resumed = selected.request("_co.grida/session/resume",json!({"task":task_basis(&view,session,"resume-b"),"expectedEpoch":view["current"]["epoch"],"expectedJournalPosition":view["current"]["journalPosition"]})).await;
    assert!(resumed.get("error").is_none(), "{resumed}");
    assert_eq!(endpoint.request().await["model"], "route-b");
    selected.close().await;

    let mut reopened = start(&state, &endpoint.url, "route-b").await;
    let loaded = reopened.request("session/load", load).await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let view = snapshot(&mut reopened, session).await;
    assert_eq!(view["current"]["disposition"], "suspended");
    let blocker = reopened
        .request("_co.grida/session/model-change", json!({"prepare":true}))
        .await;
    assert_eq!(blocker["result"]["blocker"], "retained_turn", "{blocker}");
    let resumed = reopened.request("_co.grida/session/resume",json!({"task":task_basis(&view,session,"resume-after-restart"),"expectedEpoch":view["current"]["epoch"],"expectedJournalPosition":view["current"]["journalPosition"]})).await;
    assert!(resumed.get("error").is_none(), "{resumed}");
    assert_eq!(endpoint.request().await["model"], "route-b");
    assert_eq!(endpoint.request().await["model"], "route-b");
    wait_for(&mut reopened, session, |v| {
        v["current"].is_null() && v["queue"].as_array().unwrap().is_empty()
    })
    .await;
    // Preparation closes admission in the producer, including requests that
    // arrive on another connection after the observer's snapshot.
    let prepared = timeout(WAIT, async {
        loop {
            let result = reopened
                .request("_co.grida/session/model-change", json!({"prepare":true}))
                .await;
            if result["result"]["prepared"] == true {
                break result;
            }
            // Settlement commits before the exact worker releases ownership.
            assert!(
                matches!(
                    result["result"]["blocker"].as_str(),
                    Some("active_turn" | "pending_work")
                ),
                "{result}"
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        reopened
            .request("_co.grida/session/model-change", json!({"prepare":true}))
            .await["result"],
        prepared["result"]
    );
    let refused = reopened
        .request(
            "_co.grida/session/enqueue",
            prompt_request(session, "late", "Do not accept after retirement"),
        )
        .await;
    assert_eq!(refused["error"]["data"], "host_shutting_down", "{refused}");
    assert!(endpoint.requests.try_recv().is_err());
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn a_different_model_can_finalize_an_explicit_stop_without_dispatching_the_old_turn() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold("Original route work")]).await;
    let mut original = start(&state, &endpoint.url, "route-a").await;
    let created = original
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    original
        .request(
            "_co.grida/session/submit",
            prompt_request(session, "old-work", "Keep the accepted connection"),
        )
        .await;
    assert_eq!(endpoint.request().await["model"], "route-a");
    original.close().await;
    let mut selected = start(&state, &endpoint.url, "route-b").await;
    selected
        .request(
            "session/load",
            json!({"cwd":workspace.path(),"sessionId":session,"mcpServers":[]}),
        )
        .await;
    let view = snapshot(&mut selected, session).await;
    assert_eq!(view["current"]["disposition"], "suspended");
    let denied = selected.request("_co.grida/session/resume",json!({"task":task_basis(&view,session,"wrong-route-resume"),"expectedEpoch":view["current"]["epoch"],"expectedJournalPosition":view["current"]["journalPosition"]})).await;
    assert_eq!(
        denied["error"]["data"], "session_active_route_changed",
        "{denied}"
    );
    let stopped = selected
        .request(
            "_co.grida/session/stop",
            task_basis(&view, session, "cancel-original"),
        )
        .await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let settled = wait_for(&mut selected, session, |v| v["current"].is_null()).await;
    assert_eq!(settled["latest"]["status"], "cancelled", "{settled}");
    assert!(endpoint.requests.try_recv().is_err());
    selected.close().await;
    endpoint.done().await;
}
