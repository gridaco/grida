use super::approvals::Stdio as StdioClient;
use super::lifecycle::{prompt_request, task_basis, terminate_shared_server};
use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

const LIST: &str = "co.grida/session/wakeups";
const CANCEL: &str = "co.grida/session/cancel-wakeup";
const RECOVER: &str = "co.grida/session/recover-wakeup";
const CONTINUE_CANCELLED: &str = "co.grida/session/continue-cancelled-wakeup";
const GOAL_START: &str = "_co.grida/goal/start";
const GOAL_INSPECT: &str = "_co.grida/goal/inspect";
const GOAL_CONTROL: &str = "_co.grida/goal/control";
const GOAL_RECOVER: &str = "_co.grida/goal/recover";
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
    for key in [GOAL_START, GOAL_INSPECT, GOAL_CONTROL, GOAL_RECOVER] {
        params["clientCapabilities"]["_meta"][&key[1..]] = 1.into();
    }
    params
}

async fn client(state: &Path, endpoint: &str) -> StdioClient {
    client_with_continuation(state, endpoint, false).await
}

async fn client_with_continuation(state: &Path, endpoint: &str, continuing: bool) -> StdioClient {
    let mut client = StdioClient::from_child(spawn_serve(state, endpoint));
    let mut params = initialize();
    if continuing {
        params["clientCapabilities"]["_meta"][CONTINUE_CANCELLED] = 1.into();
    }
    let ready = client.request("initialize", params).await;
    for key in [LIST, CANCEL, RECOVER] {
        assert_eq!(
            ready["result"]["agentCapabilities"]["_meta"][key], 1,
            "{ready}"
        );
    }
    if continuing {
        assert_eq!(
            ready["result"]["agentCapabilities"]["_meta"][CONTINUE_CANCELLED], 1,
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

fn goal_input(session: &str, automatic: bool) -> Value {
    json!({
        "sessionId":session,"inputId":"goal-with-checkin","allowWakeups":true,
        "operatingRegime":"act",
        "prompt":[{"type":"text","text":"Verify the export and check back if needed."}],
        "goal":{
            "objective":{"description":"Verify the export","criteria":["The exported file opens"]},
            "allowance":{"work_turns":2,"inference_steps":4},"automatic":automatic,
        }
    })
}

async fn goal_state(client: &mut StdioClient, session: &str) -> Value {
    let response = client
        .request(GOAL_INSPECT, json!({"sessionId":session}))
        .await;
    response
        .get("result")
        .unwrap_or_else(|| panic!("{response}"))
        .clone()
}

fn goal_control(session: &str, view: &Value, action: &str) -> Value {
    json!({
        "sessionId":session,"requestId":format!("goal-{action}"),
        "expectedSessionRevision":view["revision"],"expectedStateRevision":view["stateRevision"],
        "basis":view["goal"]["basis"],"change":{"action":action},
    })
}

async fn goal_checkin(
    client: &mut StdioClient,
    session: &str,
    endpoint: &mut Endpoint,
    input: Value,
) -> (String, Value) {
    let submitted = client.request(GOAL_START, input).await;
    assert_eq!(
        submitted["result"]["inputId"], "goal-with-checkin",
        "{submitted}"
    );
    let request = endpoint.request().await;
    for expected in ["goal_report", "request_wakeup"] {
        assert!(
            request["tools"]
                .as_array()
                .unwrap()
                .iter()
                .any(|tool| tool["function"]["name"] == expected)
        );
    }
    let waiting = wait_for(client, session, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    let turn = waiting["current"]["turnId"].as_str().unwrap().to_owned();
    let wakeup = schedule(client, session, &turn).await;
    assert_eq!(wakeup["status"], "waiting");
    (turn, wakeup)
}

#[tokio::test]
async fn a_goal_checkin_preserves_its_reserved_turn_and_delivers_once_after_resume() {
    let temp = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let (finish, final_step) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        RESTART_WAKE,
        Reply::Tool(
            "goal_report",
            r#"{"report":{"kind":"progress","summary":"The export passed its first check."}}"#,
        ),
        Reply::Finished("The reserved task completed after the check-in."),
        Reply::Release("Used the final inference step.", final_step),
    ])
    .await;
    let mut first = client(&state, &endpoint.url).await;
    let session = new_chat(&mut first, workspace.path()).await;
    let input = goal_input(&session, true);
    let mut plan = input.clone();
    plan["operatingRegime"] = "plan".into();
    assert_eq!(
        first.request(GOAL_START, plan).await["error"]["data"],
        "plan_wakeups_unavailable"
    );
    let (turn, wakeup) = goal_checkin(&mut first, &session, &mut endpoint, input.clone()).await;
    let mut omitted = input;
    omitted.as_object_mut().unwrap().remove("allowWakeups");
    assert_eq!(
        first.request(GOAL_START, omitted).await["error"]["data"],
        "input_identity_reused"
    );
    let held = goal_state(&mut first, &session).await;
    assert_eq!(held["goal"]["reservation"]["turn"], turn);
    assert_eq!(held["goal"]["reservation"]["inference_steps"], 4);
    assert_eq!(held["goal"]["spent"]["inference_steps"], 0);
    let pause = goal_control(&session, &held, "pause");
    let paused = first.request(GOAL_CONTROL, pause.clone()).await;
    assert_eq!(paused["result"]["turnId"], turn, "{paused}");
    first.close().await;

    let mut reopened = client(&state, &endpoint.url).await;
    let loaded = reopened
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(loaded["result"].is_object(), "{loaded}");
    let observed = schedule(&mut reopened, &session, &turn).await;
    assert_eq!(observed["status"], "paused");
    assert_eq!(observed["armed"], false);
    assert_eq!(observed["waitId"], wakeup["waitId"]);
    assert_eq!(observed["dueAtMs"], wakeup["dueAtMs"]);
    let scheduled_target = target(&session, &turn, &wakeup);
    let rearmed = reopened
        .request("_co.grida/session/recover-wakeup", scheduled_target.clone())
        .await;
    assert_eq!(rearmed["result"]["wakeup"]["armed"], true);
    assert_eq!(
        reopened
            .request("_co.grida/session/recover-wakeup", scheduled_target.clone())
            .await["result"],
        rearmed["result"]
    );
    after_due(&wakeup).await;
    assert_eq!(
        schedule(&mut reopened, &session, &turn).await["status"],
        "paused"
    );
    assert!(endpoint.requests.try_recv().is_err());
    assert_eq!(
        reopened.request(GOAL_CONTROL, pause).await["result"],
        paused["result"]
    );
    let state = goal_state(&mut reopened, &session).await;
    assert_eq!(state["goal"]["reservation"]["turn"], turn);
    let resume = goal_control(&session, &state, "resume");
    let resumed = reopened.request(GOAL_CONTROL, resume.clone()).await;
    assert_eq!(resumed["result"]["turnId"], turn, "{resumed}");
    assert_eq!(
        reopened.request(GOAL_CONTROL, resume).await["result"],
        resumed["result"]
    );
    let resumed_request = endpoint.request().await;
    let deliveries = resumed_request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|message| {
            message["role"] == "tool"
                && message["content"]
                    .as_str()
                    .is_some_and(|text| text.contains(PURPOSE))
        })
        .count();
    assert_eq!(deliveries, 1);
    endpoint.request().await;
    let next = endpoint.request().await;
    assert!(!next["tools"].to_string().contains("request_wakeup"));
    assert!(next["tools"].to_string().contains("goal_report"));
    let second = goal_state(&mut reopened, &session).await;
    assert_eq!(
        second["goal"]["spent"],
        json!({"work_turns":1,"inference_steps":3})
    );
    assert_ne!(second["goal"]["reservation"]["turn"], turn);
    assert_eq!(second["goal"]["reservation"]["inference_steps"], 1);
    let delivered = schedule(&mut reopened, &session, &turn).await;
    assert_eq!(delivered["status"], "delivered");
    assert_eq!(delivered["waitId"], wakeup["waitId"]);
    assert_eq!(delivered["dueAtMs"], wakeup["dueAtMs"]);
    let recovered = reopened
        .request("_co.grida/session/recover-wakeup", scheduled_target)
        .await;
    assert_eq!(recovered["result"]["wakeup"], delivered);
    finish.send(()).unwrap();
    wait_for(&mut reopened, &session, |view| view["current"].is_null()).await;
    let finished = goal_state(&mut reopened, &session).await;
    assert_eq!(
        finished["goal"]["spent"],
        json!({"work_turns":2,"inference_steps":4})
    );
    assert_eq!(finished["goal"]["status"]["status"], "exhausted");
    assert!(endpoint.requests.try_recv().is_err());
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn recovering_a_goal_does_not_continue_a_cancelled_checkin() {
    let temp = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let mut endpoint = Endpoint::start(vec![
        RESTART_WAKE,
        Reply::Finished("Explicitly continued the goal."),
    ])
    .await;
    let mut first = client_with_continuation(&state, &endpoint.url, true).await;
    let session = new_chat(&mut first, workspace.path()).await;
    let (turn, wakeup) = goal_checkin(
        &mut first,
        &session,
        &mut endpoint,
        goal_input(&session, false),
    )
    .await;
    let cancelled = first
        .request(
            "_co.grida/session/cancel-wakeup",
            target(&session, &turn, &wakeup),
        )
        .await;
    assert_eq!(
        cancelled["result"]["wakeup"]["status"], "cancelled",
        "{cancelled}"
    );
    first.close().await;

    let mut reopened = client_with_continuation(&state, &endpoint.url, true).await;
    let loaded = reopened
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(loaded["result"].is_object(), "{loaded}");
    let before = goal_state(&mut reopened, &session).await;
    let recovered = reopened
        .request(GOAL_RECOVER, json!({"sessionId":session}))
        .await;
    assert_eq!(recovered["result"]["sessionId"], session, "{recovered}");
    assert!(
        timeout(Duration::from_millis(100), endpoint.requests.recv())
            .await
            .is_err()
    );
    assert_eq!(goal_state(&mut reopened, &session).await, before);
    assert_eq!(
        schedule(&mut reopened, &session, &turn).await["status"],
        "cancelled"
    );
    let view = status(&mut reopened, &session).await;
    let request = json!({
        "task":task_basis(&view,&session,"continue-cancelled-goal"),
        "expectedEpoch":view["current"]["epoch"],
        "expectedJournalPosition":view["current"]["journalPosition"],
        "cancelledWakeupId":wakeup["waitId"],
    });
    let resumed = reopened
        .request("_co.grida/session/resume", request.clone())
        .await;
    assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
    let next = endpoint.request().await;
    assert!(next["messages"].as_array().unwrap().iter().any(|message| {
        message["role"] == "tool"
            && message["content"]
                .as_str()
                .is_some_and(|text| text.contains("cancelled") && !text.contains(PURPOSE))
    }));
    let settled = wait_for(&mut reopened, &session, |view| view["current"].is_null()).await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(
        goal_state(&mut reopened, &session).await["goal"]["spent"],
        json!({"work_turns":1,"inference_steps":2})
    );
    let retried = reopened.request("_co.grida/session/resume", request).await;
    assert_eq!(
        retried["result"]["turn"]["epoch"],
        resumed["result"]["turn"]["epoch"]
    );
    assert!(endpoint.requests.try_recv().is_err());
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn clearing_a_goal_retires_its_armed_checkin_without_new_generation() {
    let temp = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![RESTART_WAKE]).await;
    let mut client = client(&temp.path().join("state"), &endpoint.url).await;
    let session = new_chat(&mut client, workspace.path()).await;
    let (turn, wakeup) = goal_checkin(
        &mut client,
        &session,
        &mut endpoint,
        goal_input(&session, true),
    )
    .await;
    assert_eq!(wakeup["armed"], true);
    let held = goal_state(&mut client, &session).await;
    let clear = goal_control(&session, &held, "clear");
    let cleared = client.request(GOAL_CONTROL, clear.clone()).await;
    assert_eq!(cleared["result"]["turnId"], turn, "{cleared}");
    let settled = wait_for(&mut client, &session, |view| view["current"].is_null()).await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "cancelled");
    let stopped = schedule(&mut client, &session, &turn).await;
    assert_eq!(stopped["status"], "stopped");
    assert_eq!(stopped["armed"], false);
    let goal = goal_state(&mut client, &session).await;
    assert_eq!(goal["goal"]["status"]["status"], "cleared");
    assert!(goal["goal"]["reservation"].is_null());
    assert_eq!(
        goal["goal"]["spent"],
        json!({"work_turns":1,"inference_steps":1})
    );
    assert_eq!(
        client.request(GOAL_CONTROL, clear).await["result"],
        cleared["result"]
    );
    let recovered = client
        .request(
            "_co.grida/session/recover-wakeup",
            target(&session, &turn, &wakeup),
        )
        .await;
    assert_eq!(
        recovered["error"]["data"], "wakeup_unavailable",
        "{recovered}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
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
    let store =
        grida_agent::host::open_store(&state.join(grida_agent::host::DATABASE_FILE)).unwrap();
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
async fn a_cancelled_unpaused_checkin_continues_the_same_turn_only_on_explicit_resume() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut provider = Endpoint::start(vec![
        RESTART_WAKE,
        Reply::Finished("Continued without the cancelled check-in."),
    ])
    .await;
    let mut original = client(&state, &provider.url).await;
    let session = new_chat(&mut original, workspace.path()).await;
    let (turn, wakeup) = start(&mut original, &session, &mut provider).await;
    let cancelled = original
        .request(
            "_co.grida/session/cancel-wakeup",
            target(&session, &turn, &wakeup),
        )
        .await;
    assert_eq!(
        cancelled["result"]["wakeup"]["status"], "cancelled",
        "{cancelled}"
    );
    let view = status(&mut original, &session).await;
    assert_eq!(view["current"]["disposition"], "suspended");
    assert_eq!(view["current"]["paused"], false);
    let request = json!({
        "task":task_basis(&view,&session,"continue-cancelled"),
        "expectedEpoch":view["current"]["epoch"],
        "expectedJournalPosition":view["current"]["journalPosition"],
        "cancelledWakeupId":wakeup["waitId"],
    });
    let unnegotiated = original
        .request("_co.grida/session/resume", request.clone())
        .await;
    assert_eq!(unnegotiated["error"]["code"], -32601, "{unnegotiated}");
    let ordinary = resume(&mut original, &session, &view, "paused-only").await;
    assert_eq!(
        ordinary["error"]["data"], "pause_state_changed",
        "{ordinary}"
    );
    assert!(provider.requests.try_recv().is_err());
    original.close().await;

    let mut reopened = client_with_continuation(&state, &provider.url, true).await;
    let loaded = reopened
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    assert!(loaded["result"].is_object(), "{loaded}");
    after_due(&wakeup).await;
    assert!(provider.requests.try_recv().is_err());
    let mut wrong = request.clone();
    wrong["cancelledWakeupId"] = "other-wakeup".into();
    let refused = reopened.request("_co.grida/session/resume", wrong).await;
    assert_eq!(refused["error"]["data"], "wakeup_unavailable", "{refused}");
    let mut wrong_basis = request.clone();
    wrong_basis["task"]["expectedControlRevision"] =
        (view["current"]["controlRevision"].as_u64().unwrap() + 1).into();
    let refused = reopened
        .request("_co.grida/session/resume", wrong_basis.clone())
        .await;
    assert_eq!(
        refused["error"]["data"], "cancelled_wakeup_resume_unavailable",
        "{refused}"
    );
    assert!(provider.requests.try_recv().is_err());
    let resumed = reopened
        .request("_co.grida/session/resume", request.clone())
        .await;
    assert_eq!(
        resumed["result"]["requestId"], "continue-cancelled",
        "{resumed}"
    );
    assert_eq!(resumed["result"]["turn"]["turnId"], turn);
    assert_eq!(resumed["result"]["turn"]["epoch"], 2);
    let continued = provider.request().await;
    assert!(
        continued["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| {
                message["role"] == "tool"
                    && message["content"]
                        .as_str()
                        .is_some_and(|text| text.contains("cancelled") && !text.contains(PURPOSE))
            })
    );
    let settled = wait_for(&mut reopened, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "succeeded");
    let retried = reopened.request("_co.grida/session/resume", request).await;
    assert_eq!(
        retried["result"]["requestId"], "continue-cancelled",
        "{retried}"
    );
    assert_eq!(retried["result"]["turn"]["epoch"], 2);
    let refused = reopened
        .request("_co.grida/session/resume", wrong_basis)
        .await;
    assert_eq!(
        refused["error"]["data"], "cancelled_wakeup_resume_unavailable",
        "{refused}"
    );
    assert!(provider.requests.try_recv().is_err());
    reopened.close().await;
    provider.done().await;
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
    let refused = ws_rpc(&mut socket, 4, GOAL_START, goal_input(session, true)).await;
    assert_eq!(
        refused["error"]["data"], "wakeup_capability_required",
        "{refused}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    drop(socket);
    terminate_shared_server(child).await;
    endpoint.done().await;
}

/// A chat started as a goal is titled from its objective, like any other chat's
/// first request.
#[tokio::test]
async fn a_chat_started_as_a_goal_is_titled_from_its_objective() {
    let temp = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temp.path().join("state");
    // Spare replies keep the endpoint open for the title request, which the
    // host sends once the goal's first step has its answer.
    let mut endpoint = Endpoint::start(
        (0..4)
            .map(|_| Reply::Finished("Checked the export."))
            .collect(),
    )
    .await;
    let mut command = executable();
    command.args(["serve", "--stdio", "--chat-titles"]);
    configured(&mut command, &state, &endpoint.url);
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = StdioClient::from_child(child);
    let ready = client.request("initialize", initialize()).await;
    assert!(ready["result"].is_object(), "{ready}");
    let session = new_chat(&mut client, workspace.path()).await;
    let started = client
        .request(GOAL_START, goal_input(&session, false))
        .await;
    assert_eq!(
        started["result"]["inputId"], "goal-with-checkin",
        "{started}"
    );
    let title = endpoint.title_request().await;
    assert!(
        title
            .to_string()
            .contains("Verify the export and check back"),
        "the title reads the goal's request: {title}"
    );
    client.close().await;
}
