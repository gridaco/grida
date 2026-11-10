//! GRIDA-SEC-004 — parent and review attempts share a durable Goal allowance.

use super::super::approvals::Stdio as PrivateStdio;
use super::super::lifecycle::task_basis;
use super::*;
use grida_agent_master::subagents::sponsored_identity;
use tokio::sync::oneshot;

const DELEGATE: &str = r#"{"instructions":"Check the export independently."}"#;
const PROGRESS: &str =
    r#"{"report":{"kind":"progress","summary":"Checked the export structure."}}"#;
const BLOCKED: &str = r#"{"report":{"kind":"blocked","reason":"needs_input","summary":"The publisher must confirm the destination."}}"#;
const FINDING: &str = "The export structure is consistent.";

async fn open(state: &Path, endpoint: &str) -> PrivateStdio {
    let mut command = executable();
    command.args(["serve", "--stdio", "--subagents"]);
    configured(&mut command, state, endpoint);
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = PrivateStdio::from_child(child);
    let mut request = extension_initialize();
    for capability in [
        "goal/start",
        "goal/inspect",
        "goal/control",
        "goal/recover",
        "goal/funded-review",
        "session/effort",
        "subagent/inspect",
    ] {
        request["clientCapabilities"]["_meta"][format!("co.grida/{capability}")] = 1.into();
    }
    let ready = client.request("initialize", request).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"]["co.grida/session/effort"], 1,
        "{ready}"
    );
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"]["co.grida/goal/funded-review"], 1,
        "{ready}"
    );
    client
}

async fn accepted(client: &mut PrivateStdio, workspace: &Path, inference_steps: u32) -> String {
    let created = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
    let request = json!({
        "sessionId":session,"inputId":"funded-goal","effort":"ultra",
        "prompt":[{"type":"text","text":"Check the export."}],
        "goal":{
            "objective":{"description":"Verify the export","criteria":["The export opens"]},
            "allowance":{"work_turns":3,"inference_steps":inference_steps},"automatic":true
        }
    });
    let mut invalid = request.clone();
    invalid["goal"]["allowance"]["inference_steps"] = 2.into();
    let denied = client.request("_co.grida/goal/start", invalid).await;
    assert_eq!(
        denied["error"]["data"], "goal_child_allowance_unavailable",
        "{denied}"
    );
    let submitted = client
        .request("_co.grida/goal/start", request.clone())
        .await;
    assert_eq!(submitted["result"]["inputId"], "funded-goal", "{submitted}");
    let mut changed = request;
    changed["effort"] = "standard".into();
    let denied = client.request("_co.grida/goal/start", changed).await;
    assert_eq!(denied["error"]["data"], "input_identity_reused", "{denied}");
    session
}

fn offers(request: &Value, tool: &str) -> bool {
    request["tools"]
        .as_array()
        .is_some_and(|tools| tools.iter().any(|offer| offer["function"]["name"] == tool))
}

async fn read(client: &mut PrivateStdio, method: &str, params: Value) -> Value {
    let result = client.request(method, params).await;
    result
        .get("result")
        .unwrap_or_else(|| panic!("{result}"))
        .clone()
}

async fn wait_for(
    client: &mut PrivateStdio,
    method: &str,
    params: Value,
    done: impl Fn(&Value) -> bool,
) -> Value {
    timeout(WAIT, async {
        loop {
            let view = read(client, method, params.clone()).await;
            if done(&view) {
                break view;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn goal_ultra_charges_the_actual_review_and_limits_later_goal_work() {
    let root = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = root.path().join("state");
    let (release, ready) = oneshot::channel();
    let release = Arc::new(Mutex::new(Some(release)));
    let ready = Arc::new(Mutex::new(Some(ready)));
    let concurrent = || {
        let release = release.clone();
        let ready = ready.clone();
        Reply::Choose(Box::new(move |request| {
            if offers(request, "collect_review") {
                release.lock().unwrap().take().unwrap().send(()).unwrap();
                Reply::Tool("collect_review", "{}")
            } else {
                assert!(request.get("tools").is_none());
                assert!(!request["messages"].to_string().contains("goal_report"));
                Reply::Release(FINDING, ready.lock().unwrap().take().unwrap())
            }
        }))
    };
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("delegate_review", DELEGATE),
        concurrent(),
        concurrent(),
        Reply::Choose(Box::new(|request| {
            assert!(request["messages"].to_string().contains(FINDING));
            Reply::Tool("goal_report", PROGRESS)
        })),
        Reply::Finished("The first Goal turn integrated the review."),
        Reply::Choose(Box::new(|request| {
            assert!(offers(request, "goal_report"));
            assert!(!offers(request, "delegate_review"));
            Reply::Tool("goal_report", BLOCKED)
        })),
        Reply::Finished("The remaining allowance is exhausted."),
    ])
    .await;
    let mut client = open(&state, &endpoint.url).await;
    let session = accepted(&mut client, workspace.path(), 7).await;
    for _ in 0..7 {
        endpoint.request().await;
    }
    let view = wait_for(
        &mut client,
        "_co.grida/goal/inspect",
        json!({"sessionId":session}),
        |view| view["goal"]["spent"]["work_turns"] == 2,
    )
    .await;
    assert_eq!(view["goal"]["spent"]["inference_steps"], 7);
    assert_eq!(view["goal"]["remaining"]["inference_steps"], 0);
    assert_eq!(view["goal"]["status"]["status"], "exhausted");
    assert!(view["goal"]["reservation"].is_null());
    client.close().await;
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[tokio::test]
async fn late_review_is_held_then_charged_once_across_restart_without_stale_progress() {
    let root = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = root.path().join("state");
    let (finish_parent, parent_gate) = oneshot::channel();
    let (finish_child, child_gate) = oneshot::channel();
    let parent_gate = Arc::new(Mutex::new(Some(parent_gate)));
    let child_gate = Arc::new(Mutex::new(Some(child_gate)));
    let concurrent = || {
        let parent_gate = parent_gate.clone();
        let child_gate = child_gate.clone();
        Reply::Choose(Box::new(move |request| {
            if offers(request, "collect_review") {
                Reply::Release(
                    "The Goal work finished before review.",
                    parent_gate.lock().unwrap().take().unwrap(),
                )
            } else {
                Reply::Release(FINDING, child_gate.lock().unwrap().take().unwrap())
            }
        }))
    };
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("delegate_review", DELEGATE),
        concurrent(),
        concurrent(),
    ])
    .await;
    let mut client = open(&state, &endpoint.url).await;
    let session = accepted(&mut client, workspace.path(), 7).await;
    for _ in 0..3 {
        endpoint.request().await;
    }
    let select = json!({"sessionId":session});
    let running = read(&mut client, "_co.grida/goal/inspect", select.clone()).await;
    let reservation = &running["goal"]["reservation"];
    assert_eq!(running["goal"]["effort"], "ultra");
    assert_eq!(reservation["child_inference_steps"], 2);
    assert_eq!(reservation["inference_steps"], 7);
    let child = sponsored_identity(
        &SessionId::new(&session).unwrap(),
        &agent_kit_core::TurnId::new(reservation["turn"].as_str().unwrap()).unwrap(),
    )
    .unwrap();
    let control = |view: &Value, request: &str, action: Value| {
        json!({
            "sessionId":session,"requestId":request,"expectedSessionRevision":view["revision"],
            "expectedStateRevision":view["stateRevision"],"basis":view["goal"]["basis"],"change":action,
        })
    };
    let pause = client
        .request(
            "_co.grida/goal/control",
            control(&running, "pause-goal", json!({"action":"pause"})),
        )
        .await;
    assert_eq!(
        pause["error"]["data"], "goal_use_task_controls_for_funded_review",
        "{pause}"
    );
    finish_parent.send(()).unwrap();
    let held = wait_for(
        &mut client,
        "_co.grida/goal/inspect",
        select.clone(),
        |view| view["goal"]["status"]["reason"] == "uncertain_work",
    )
    .await;
    assert_eq!(held["goal"]["reservation"]["uncertain_steps"], 3);
    assert_eq!(held["goal"]["spent"]["inference_steps"], 0);
    assert_eq!(held["goal"]["remaining"]["inference_steps"], 0);
    let reconcile = json!({"action":"reconcile_review","turn":reservation["turn"]});
    let stale_control = control(&held, "settle-held-review", reconcile.clone());
    let pending = client
        .request("_co.grida/goal/control", stale_control.clone())
        .await;
    assert_eq!(
        pending["error"]["data"], "goal_review_still_held",
        "{pending}"
    );
    read(&mut client, "_co.grida/goal/recover", select.clone()).await;
    assert_eq!(
        read(&mut client, "_co.grida/goal/inspect", select.clone()).await,
        held
    );

    let revised = json!({"action":"revise","objective":{"description":"An updated objective","criteria":["The new file opens"]}});
    read(
        &mut client,
        "_co.grida/goal/control",
        control(&held, "revise-goal", revised),
    )
    .await;
    finish_child.send(()).unwrap();
    wait_for(
        &mut client,
        "_co.grida/subagent/inspect",
        json!({"parentSessionId":session,"childId":child}),
        |view| view["latest"]["status"] == "succeeded",
    )
    .await;
    client.close().await;

    let mut restarted = open(&state, &endpoint.url).await;
    read(
        &mut restarted,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let retained = read(&mut restarted, "_co.grida/goal/inspect", select.clone()).await;
    assert_eq!(retained["goal"]["reservation"], held["goal"]["reservation"]);
    assert_eq!(retained["goal"]["effort"], "ultra");
    let stale = restarted
        .request("_co.grida/goal/control", stale_control)
        .await;
    assert_eq!(stale["error"]["data"], "stale_session_revision", "{stale}");
    let exact = control(&retained, "account-review", reconcile);
    let receipt = read(&mut restarted, "_co.grida/goal/control", exact.clone()).await;
    assert!(receipt["turnId"].is_null());
    assert_eq!(
        read(&mut restarted, "_co.grida/goal/control", exact).await,
        receipt
    );
    let accounted = read(&mut restarted, "_co.grida/goal/inspect", select.clone()).await;
    assert_eq!(
        accounted["goal"]["spent"],
        json!({"work_turns":1,"inference_steps":3})
    );
    assert_eq!(accounted["goal"]["remaining"]["inference_steps"], 4);
    assert_eq!(
        accounted["goal"]["objective"]["description"],
        "An updated objective"
    );
    assert!(accounted["goal"]["progress"].is_null());
    assert!(accounted["goal"]["reservation"].is_null());
    read(&mut restarted, "_co.grida/goal/recover", select.clone()).await;
    assert_eq!(
        read(&mut restarted, "_co.grida/goal/inspect", select).await,
        accounted
    );
    restarted.close().await;
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[tokio::test]
async fn stopping_the_paused_funded_goal_keeps_both_uncertain_attempts_held() {
    let root = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("delegate_review", DELEGATE),
        Reply::Hold("Partial parent or review work."),
        Reply::Hold("Partial review or parent work."),
    ])
    .await;
    let mut client = open(&root.path().join("state"), &endpoint.url).await;
    let session = accepted(&mut client, workspace.path(), 7).await;
    for _ in 0..3 {
        endpoint.request().await;
    }
    let select = json!({"sessionId":session});
    let snapshot = "_co.grida/session/snapshot";
    let running = read(&mut client, snapshot, select.clone()).await;
    let turn = agent_kit_core::TurnId::new(running["current"]["turnId"].as_str().unwrap()).unwrap();
    let child = sponsored_identity(&SessionId::new(&session).unwrap(), &turn).unwrap();
    let inspect_child = "_co.grida/subagent/inspect";
    let child_select = json!({"parentSessionId":session,"childId":child});
    read(
        &mut client,
        "_co.grida/session/pause",
        task_basis(&running, &session, "pause-task"),
    )
    .await;
    let paused = wait_for(&mut client, snapshot, select.clone(), |view| {
        view["current"]["disposition"] == "suspended" && view["current"]["paused"] == true
    })
    .await;
    wait_for(&mut client, inspect_child, child_select.clone(), |view| {
        view["current"]["disposition"] == "suspended" && view["current"]["paused"] == true
    })
    .await;
    let stop = task_basis(&paused, &session, "stop-task");
    let stopped = read(&mut client, "_co.grida/session/stop", stop.clone()).await;
    wait_for(&mut client, snapshot, select.clone(), |view| {
        view["current"].is_null()
    })
    .await;
    wait_for(&mut client, inspect_child, child_select, |view| {
        view["current"].is_null() && view["latest"]["status"] == "cancelled"
    })
    .await;
    assert_eq!(
        read(&mut client, "_co.grida/session/stop", stop).await,
        stopped
    );
    let held = read(&mut client, "_co.grida/goal/inspect", select.clone()).await;
    assert_eq!(held["goal"]["status"]["reason"], "uncertain_work");
    assert_eq!(held["goal"]["reservation"]["uncertain_steps"], 3);
    assert_eq!(
        held["goal"]["spent"],
        json!({"work_turns":0,"inference_steps":0})
    );
    read(&mut client, "_co.grida/goal/recover", select.clone()).await;
    assert_eq!(
        read(&mut client, "_co.grida/goal/inspect", select).await,
        held
    );
    client.close().await;
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}
