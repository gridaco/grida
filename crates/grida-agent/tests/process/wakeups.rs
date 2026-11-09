use super::approvals::Stdio as StdioClient;
use super::lifecycle::{prompt_request, task_basis, terminate_shared_server};
use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

const LIST: &str = "co.grida/session/wakeups";
const CANCEL: &str = "co.grida/session/cancel-wakeup";
const RECOVER: &str = "co.grida/session/recover-wakeup";
const PURPOSE: &str = "Check the render again.";
const WAKE: Reply = Reply::Tool(
    "request_wakeup",
    r#"{"delay_ms":800,"reason":"Check the render","prompt":"Check the render again."}"#,
);
const RESTART_WAKE: Reply = Reply::Tool(
    "request_wakeup",
    r#"{"delay_ms":2500,"reason":"Check the render","prompt":"Check the render again."}"#,
);

fn initialize() -> Value {
    let mut params = extension_initialize();
    for key in [LIST, CANCEL, RECOVER] {
        params["clientCapabilities"]["_meta"][key] = 1.into();
    }
    params
}

async fn client(state: &Path, endpoint: &str) -> StdioClient {
    let mut client = StdioClient::from_child(spawn_serve(state, endpoint));
    let ready = client.request("initialize", initialize()).await;
    for key in [LIST, CANCEL, RECOVER] {
        assert_eq!(
            ready["result"]["agentCapabilities"]["_meta"][key], 1,
            "{ready}"
        );
    }
    client
}

async fn new_chat(client: &mut StdioClient, workspace: &Path) -> String {
    let response = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    response["result"]["sessionId"].as_str().unwrap().into()
}

fn submit(session: &str, id: &str) -> Value {
    let mut input = prompt_request(session, id, "Check the render after waiting.");
    input["allowWakeups"] = true.into();
    input
}

async fn status(client: &mut StdioClient, session: &str) -> Value {
    let response = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(response["result"].is_object(), "{response}");
    response["result"].clone()
}

async fn wait_for(
    client: &mut StdioClient,
    session: &str,
    condition: impl Fn(&Value) -> bool,
) -> Value {
    timeout(WAIT, async {
        loop {
            let snapshot = status(client, session).await;
            if condition(&snapshot) {
                return snapshot;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

async fn schedule(client: &mut StdioClient, session: &str, turn: &str) -> Value {
    let response = client
        .request(
            "_co.grida/session/wakeups",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    assert!(response["result"]["wakeup"].is_object(), "{response}");
    response["result"]["wakeup"].clone()
}

async fn start(
    client: &mut StdioClient,
    session: &str,
    endpoint: &mut Endpoint,
) -> (String, Value) {
    let accepted = client
        .request("_co.grida/session/submit", submit(session, "wake-task"))
        .await;
    assert_eq!(accepted["result"]["disposition"], "claimed", "{accepted}");
    let turn = accepted["result"]["turnId"].as_str().unwrap().to_owned();
    let request = endpoint.request().await;
    assert!(
        request["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tool| tool["function"]["name"] == "request_wakeup")
    );
    wait_for(client, session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    let scheduled = schedule(client, session, &turn).await;
    assert_eq!(scheduled["status"], "waiting", "{scheduled}");
    assert_eq!(scheduled["armed"], true, "{scheduled}");
    assert_eq!(scheduled["reason"], "Check the render");
    assert!(!scheduled.to_string().contains(PURPOSE));
    (turn, scheduled)
}

fn target(session: &str, turn: &str, wakeup: &Value) -> Value {
    json!({"sessionId":session,"turnId":turn,"waitId":wakeup["waitId"]})
}

async fn resume(client: &mut StdioClient, session: &str, view: &Value, request: &str) -> Value {
    client
        .request(
            "_co.grida/session/resume",
            json!({
                "task":task_basis(view, session, request),
                "expectedEpoch":view["current"]["epoch"],
                "expectedJournalPosition":view["current"]["journalPosition"],
            }),
        )
        .await
}

async fn after_due(wakeup: &Value) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let remaining = wakeup["dueAtMs"].as_u64().unwrap().saturating_sub(now);
    tokio::time::sleep(Duration::from_millis(remaining + 100)).await;
}

#[tokio::test]
async fn due_wakeup_uses_the_original_task_and_single_provider_continuation() {
    let temp = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![WAKE, Reply::Finished("Checked the render.")]).await;
    let mut client = client(&temp.path().join("state"), &endpoint.url).await;
    let session = new_chat(&mut client, workspace.path()).await;
    let (turn, wakeup) = start(&mut client, &session, &mut endpoint).await;
    let omitted_permission = client
        .request(
            "_co.grida/session/submit",
            prompt_request(&session, "wake-task", "Check the render after waiting."),
        )
        .await;
    assert_eq!(
        omitted_permission["error"]["data"],
        "submission_wakeup_permission_changed"
    );
    let continued = endpoint.request().await;
    assert!(
        continued["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| {
                message["role"] == "tool"
                    && message["content"]
                        .as_str()
                        .is_some_and(|content| content.contains(PURPOSE))
            })
    );
    let settled = wait_for(&mut client, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "succeeded");
    let delivered = schedule(&mut client, &session, &turn).await;
    assert_eq!(delivered["status"], "delivered");
    assert_eq!(delivered["waitId"], wakeup["waitId"]);
    let recovered = client
        .request(
            "_co.grida/session/recover-wakeup",
            target(&session, &turn, &wakeup),
        )
        .await;
    assert_eq!(
        recovered["result"]["wakeup"]["status"], "delivered",
        "{recovered}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn reopening_is_observational_until_a_private_recovery_request() {
    let temp = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        RESTART_WAKE,
        Reply::Finished("Resumed the render check."),
    ])
    .await;
    let mut first = client(&state, &endpoint.url).await;
    let session = new_chat(&mut first, workspace.path()).await;
    let (turn, wakeup) = start(&mut first, &session, &mut endpoint).await;
    first.close().await;
    after_due(&wakeup).await;
    let mut reopened = client(&state, &endpoint.url).await;
    let loaded = reopened
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(loaded["result"].is_object(), "{loaded}");
    let observed = schedule(&mut reopened, &session, &turn).await;
    assert_eq!(observed["waitId"], wakeup["waitId"]);
    assert_eq!(observed["dueAtMs"], wakeup["dueAtMs"]);
    assert_eq!(observed["status"], "waiting");
    assert_eq!(observed["armed"], false);
    assert!(endpoint.requests.try_recv().is_err());
    let target = target(&session, &turn, &wakeup);
    for _ in 0..2 {
        let recovered = reopened
            .request("_co.grida/session/recover-wakeup", target.clone())
            .await;
        assert!(recovered["result"].is_object(), "{recovered}");
    }
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains(PURPOSE)
    );
    let settled = wait_for(&mut reopened, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(
        schedule(&mut reopened, &session, &turn).await["status"],
        "delivered"
    );
    assert!(endpoint.requests.try_recv().is_err());
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn an_already_delivered_wakeup_recovers_its_unclaimed_continuation() {
    use agent_kit_core::{SessionId, TurnId, WaitId};
    use agent_kit_sessions::{ControlRequest, SessionControl, SessionStore};
    use agent_kit_store_sqlite::SqliteStore;
    use grida_agent_master::wakeups::{Delivery, WakeupDisposition, prepare_delivery};

    let temp = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint =
        Endpoint::start(vec![RESTART_WAKE, Reply::Finished("Recovered delivery.")]).await;
    let mut first = client(&state, &endpoint.url).await;
    let session = new_chat(&mut first, workspace.path()).await;
    let (turn, wakeup) = start(&mut first, &session, &mut endpoint).await;
    first.close().await;

    // Reproduce a process exit between the durable resolution and the
    // acquisition of the next execution owner.
    after_due(&wakeup).await;
    let store = SqliteStore::open(state.join("runtime.sqlite")).unwrap();
    let session_id = SessionId::new(&session).unwrap();
    let turn_id = TurnId::new(&turn).unwrap();
    let wait = WaitId::new(wakeup["waitId"].as_str().unwrap()).unwrap();
    let due = wakeup["dueAtMs"].as_u64().unwrap();
    let Delivery::Resolve(plan) = store
        .inspect_turn_with(session_id.clone(), turn_id.clone(), move |state| {
            prepare_delivery(state, &wait, WakeupDisposition::Due, due)
        })
        .await
        .unwrap()
    else {
        panic!("expected a due resolution");
    };
    let view = store.inspect(session_id.clone()).await.unwrap();
    let receipt = store
        .control(ControlRequest {
            id: plan.request,
            session: session_id.clone(),
            expected_revision: view.revision,
            action: SessionControl::Resolve {
                turn: turn_id,
                expected: plan.expected_control,
                wait: plan.wait,
                answer: plan.answer,
            },
        })
        .await
        .unwrap();
    let delivered_position = receipt.turn.unwrap().record().position.0;
    drop(store);

    let mut reopened = client(&state, &endpoint.url).await;
    let loaded = reopened
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(loaded["result"].is_object(), "{loaded}");
    let observed = schedule(&mut reopened, &session, &turn).await;
    assert_eq!(observed["status"], "delivered");
    assert_eq!(observed["armed"], false);
    assert_eq!(
        status(&mut reopened, &session).await["current"]["journalPosition"],
        delivered_position
    );
    assert!(endpoint.requests.try_recv().is_err());
    let recovered = reopened
        .request(
            "_co.grida/session/recover-wakeup",
            target(&session, &turn, &wakeup),
        )
        .await;
    assert!(recovered["result"].is_object(), "{recovered}");
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains(PURPOSE)
    );
    let settled = wait_for(&mut reopened, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "succeeded");
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn pause_cancel_and_stop_do_not_trigger_due_model_work() {
    let temp = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        WAKE,
        Reply::Finished("Acknowledged cancellation."),
        WAKE,
    ])
    .await;
    let mut client = client(&temp.path().join("state"), &endpoint.url).await;
    let session = new_chat(&mut client, workspace.path()).await;
    let (turn, wakeup) = start(&mut client, &session, &mut endpoint).await;
    let view = status(&mut client, &session).await;
    let paused = client
        .request(
            "_co.grida/session/pause",
            task_basis(&view, &session, "pause-waiting"),
        )
        .await;
    assert!(paused["result"].is_object(), "{paused}");
    after_due(&wakeup).await;
    assert!(endpoint.requests.try_recv().is_err());
    assert_eq!(
        schedule(&mut client, &session, &turn).await["status"],
        "paused"
    );
    for _ in 0..2 {
        let cancelled = client
            .request(
                "_co.grida/session/cancel-wakeup",
                target(&session, &turn, &wakeup),
            )
            .await;
        assert_eq!(
            cancelled["result"]["wakeup"]["status"], "cancelled",
            "{cancelled}"
        );
    }
    assert!(endpoint.requests.try_recv().is_err());
    let view = status(&mut client, &session).await;
    assert_eq!(view["current"]["paused"], true);
    let resumed = resume(&mut client, &session, &view, "resume-cancelled").await;
    assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
    let continued = endpoint.request().await;
    assert!(
        continued["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| message["role"] == "tool"
                && message["content"]
                    .as_str()
                    .is_some_and(|text| text.contains("cancelled") && !text.contains(PURPOSE)))
    );
    wait_for(&mut client, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;

    let other = new_chat(&mut client, workspace.path()).await;
    let (turn, wakeup) = start(&mut client, &other, &mut endpoint).await;
    let view = status(&mut client, &other).await;
    let stopped = client
        .request(
            "_co.grida/session/stop",
            task_basis(&view, &other, "stop-waiting"),
        )
        .await;
    assert!(stopped["result"].is_object(), "{stopped}");
    wait_for(&mut client, &other, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    after_due(&wakeup).await;
    assert!(endpoint.requests.try_recv().is_err());
    assert_eq!(
        schedule(&mut client, &other, &turn).await["status"],
        "stopped"
    );
    let refused = client
        .request(
            "_co.grida/session/recover-wakeup",
            target(&other, &turn, &wakeup),
        )
        .await;
    assert_eq!(refused["error"]["data"], "wakeup_unavailable", "{refused}");
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn explicit_resume_releases_an_already_due_live_timer() {
    let temp = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![WAKE, Reply::Finished("Checked after Resume.")]).await;
    let mut client = client(&temp.path().join("state"), &endpoint.url).await;
    let session = new_chat(&mut client, workspace.path()).await;
    let (turn, wakeup) = start(&mut client, &session, &mut endpoint).await;
    let view = status(&mut client, &session).await;
    let paused = client
        .request(
            "_co.grida/session/pause",
            task_basis(&view, &session, "pause-wakeup"),
        )
        .await;
    assert!(paused["result"].is_object(), "{paused}");
    after_due(&wakeup).await;
    assert!(endpoint.requests.try_recv().is_err());
    let waiting = schedule(&mut client, &session, &turn).await;
    assert_eq!(waiting["status"], "paused");
    assert_eq!(waiting["armed"], true);
    let view = status(&mut client, &session).await;
    let resumed = resume(&mut client, &session, &view, "release-wakeup").await;
    assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains(PURPOSE)
    );
    let settled = wait_for(&mut client, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(
        schedule(&mut client, &session, &turn).await["status"],
        "delivered"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn shared_connections_cannot_opt_into_scheduled_provider_work() {
    let temp = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![]).await;
    let (child, url) = shared_server(&temp.path().join("state"), &endpoint.url).await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let ready = ws_rpc(&mut socket, 1, "initialize", initialize()).await;
    assert!(ready["result"]["agentCapabilities"]["_meta"][LIST].is_null());
    let new = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = new["result"]["sessionId"].as_str().unwrap();
    let refused = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        submit(session, "forbidden"),
    )
    .await;
    assert_eq!(
        refused["error"]["data"], "wakeup_capability_required",
        "{refused}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    drop(socket);
    terminate_shared_server(child).await;
    endpoint.done().await;
}
