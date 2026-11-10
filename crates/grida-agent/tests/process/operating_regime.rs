use super::lifecycle::{
    prompt_request, queue_basis, session_snapshot, task_basis, terminate_shared_server,
    wait_for_snapshot,
};
use super::*;

const CHANGE_DEFAULT: &str = r#"{"expected_file_revision":null,"change":{"operation":"set_context_max_input_tokens","value":64000}}"#;

async fn start_mode(state: &Path, endpoint: &str, mode: &str) -> (Child, SharedSocket) {
    let mut command = executable();
    command
        .args([
            "serve",
            "--listen",
            "ws://127.0.0.1:0/acp",
            "--server-token-env",
            "GRIDA_AGENT_FIXTURE_SERVER_TOKEN",
            "--mode",
            mode,
        ])
        .env("GRIDA_AGENT_FIXTURE_SERVER_TOKEN", SERVER_TOKEN);
    configured(&mut command, state, endpoint);
    let (child, url) = spawn_shared_server(command).await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    assert_eq!(
        ws_rpc(&mut socket, 1, "initialize", extension_initialize()).await["result"]["protocolVersion"],
        1
    );
    (child, socket)
}

fn offered(request: &Value, tool: &str) -> bool {
    request["tools"]
        .as_array()
        .is_some_and(|tools| tools.iter().any(|entry| entry["function"]["name"] == tool))
}

#[tokio::test]
async fn plan_withholds_settings_writes_and_preserves_its_scope_through_a_queue_edit_after_restart()
{
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("Investigating."),
        Reply::Finished("Proposed change and verification."),
        Reply::Tool("config_update", CHANGE_DEFAULT),
        Reply::Finished("The requested setting was applied."),
    ])
    .await;
    let (first, mut socket) = start_mode(&state, &endpoint.url, "plan").await;
    let created = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let mut draft = prompt_request(session, "first-plan", "Investigate the default.");
    draft["allowConfigurationChanges"] = true.into();
    assert_eq!(
        ws_rpc(&mut socket, 3, "_co.grida/session/submit", draft).await["result"]["disposition"],
        "claimed"
    );
    let request = endpoint.request().await;
    assert!(request["messages"].to_string().contains("Plan is active"));
    assert!(offered(&request, "config_inspect"));
    assert!(!offered(&request, "config_update"));
    assert!(!offered(&request, "config_reload"));
    assert_eq!(
        ws_rpc(
            &mut socket,
            4,
            "_co.grida/session/enqueue",
            prompt_request(session, "queued-plan", "Propose the change."),
        )
        .await["result"]["disposition"],
        "queued"
    );
    let snapshot = session_snapshot(&mut socket, session).await;
    assert_eq!(snapshot["queue"][0]["settings"]["operatingRegime"], "plan");
    let stopped = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/stop",
        task_basis(&snapshot, session, "stop-investigation"),
    )
    .await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null() && snapshot["admissionPaused"] == true
    })
    .await;
    drop(socket);
    terminate_shared_server(first).await;

    let (second, mut socket) = start_mode(&state, &endpoint.url, "act").await;
    let loaded = ws_rpc(
        &mut socket,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let snapshot = session_snapshot(&mut socket, session).await;
    let edited = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/replace",
        json!({
            "queue":queue_basis(&snapshot, session, "edit-plan"),
            "inputId":"queued-plan","replacementInputId":"revised-plan",
            "allowConfigurationChanges":true,
            "prompt":[{"type":"text","text":"Propose the 64000-token cap."}],
        }),
    )
    .await;
    assert!(edited.get("error").is_none(), "{edited}");
    let snapshot = session_snapshot(&mut socket, session).await;
    assert_eq!(snapshot["queue"][0]["settings"]["operatingRegime"], "plan");
    assert_eq!(
        snapshot["queue"][0]["settings"]["configurationPermission"],
        "inspect"
    );
    let resumed = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/resume-queue",
        queue_basis(&snapshot, session, "run-revised-plan"),
    )
    .await;
    assert!(resumed.get("error").is_none(), "{resumed}");
    let request = endpoint.request().await;
    assert!(request["messages"].to_string().contains("Plan is active"));
    assert!(offered(&request, "config_inspect"));
    assert!(!offered(&request, "config_update"));
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
            && snapshot["queuedInputs"] == 0
            && snapshot["latest"]["status"] == "succeeded"
    })
    .await;
    let before = ws_rpc(&mut socket, 5, "_co.grida/config/inspect", json!({})).await;
    assert!(before["result"]["active"]["defaults"]["context"]["max_input_tokens"].is_null());

    let mut act = prompt_request(session, "approved-act", "Apply the planned change.");
    act["allowConfigurationChanges"] = true.into();
    let accepted = ws_rpc(&mut socket, 6, "_co.grida/session/submit", act).await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    let request = endpoint.request().await;
    assert!(
        !request["messages"][0]["content"]
            .to_string()
            .contains("Plan is active")
    );
    assert!(offered(&request, "config_update"));
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains("64000")
    );
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    let after = ws_rpc(&mut socket, 7, "_co.grida/config/inspect", json!({})).await;
    assert_eq!(
        after["result"]["active"]["defaults"]["context"]["max_input_tokens"],
        64000
    );
    drop(socket);
    terminate_shared_server(second).await;
    endpoint.done().await;
}

#[tokio::test]
async fn plan_launch_can_observe_and_stop_retained_act_but_refuses_to_resume_it() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold("Act started.")]).await;
    let (first, mut socket) = start_mode(&state, &endpoint.url, "act").await;
    let created = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let accepted = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        prompt_request(session, "act-task", "Perform the task."),
    )
    .await;
    assert_eq!(accepted["result"]["disposition"], "claimed");
    endpoint.request().await;
    let running = session_snapshot(&mut socket, session).await;
    let pause = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/pause",
        task_basis(&running, session, "pause-act"),
    )
    .await;
    assert!(pause.get("error").is_none(), "{pause}");
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    drop(socket);
    terminate_shared_server(first).await;

    let (second, mut socket) = start_mode(&state, &endpoint.url, "plan").await;
    let loaded = ws_rpc(
        &mut socket,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let before = session_snapshot(&mut socket, session).await;
    let refused = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/resume",
        json!({
            "task":task_basis(&before,session,"resume-act-from-plan"),
            "expectedEpoch":before["current"]["epoch"],
            "expectedJournalPosition":before["current"]["journalPosition"],
        }),
    )
    .await;
    assert!(
        refused["error"]
            .to_string()
            .contains("retained_act_requires_act")
    );
    let after = session_snapshot(&mut socket, session).await;
    assert_eq!(after["current"], before["current"]);
    let stopped = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/stop",
        task_basis(&after, session, "stop-act-from-plan"),
    )
    .await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let settled = wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["status"], "cancelled");
    assert!(endpoint.requests.try_recv().is_err());
    drop(socket);
    terminate_shared_server(second).await;
    endpoint.done().await;
}
