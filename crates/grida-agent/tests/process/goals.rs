use super::lifecycle::{session_snapshot, terminate_shared_server, wait_for_snapshot};
use super::*;
use agent_kit_core::{ChangeId, ModelId, SessionId};
use agent_kit_sessions::{InputDisposition, TurnDisposition};
use grida_agent::host::{GoalRequest, Host, PromptPart, PromptRequest, TurnControl};
use grida_agent::{ConfigurationPermission, ProviderOptions};
use grida_agent_master::goals::{Allowance, Blocker, Objective, Status, Usage};
use std::num::NonZeroU32;

fn options(endpoint: &Endpoint) -> ProviderOptions {
    ProviderOptions {
        endpoint: endpoint.url.clone(),
        protocol: ProviderProtocol::OpenAiCompatible,
        model: ModelId::new("fixture-model").unwrap(),
        credential_env: None,
        credential_home: None,
        max_output_tokens: 1024,
        compatible_output_limit_field: None,
    }
}

fn goal() -> GoalRequest {
    GoalRequest {
        objective: Objective {
            description: "Prepare the export".into(),
            criteria: vec!["The exported file opens".into()],
        },
        allowance: Allowance {
            work_turns: NonZeroU32::new(3).unwrap(),
            inference_steps: NonZeroU32::new(5).unwrap(),
        },
        automatic: false,
    }
}

fn request(session: &SessionId, id: &str, text: &str) -> PromptRequest {
    PromptRequest {
        id: ChangeId::new(id).unwrap(),
        session: session.clone(),
        parts: vec![PromptPart::Text { text: text.into() }],
        questions: false,
        configuration_permission: ConfigurationPermission::Disabled,
        operating_regime: None,
    }
}

async fn goal_client(url: &str, negotiate: bool, inspect_config: bool) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut initialize = extension_initialize();
    if !inspect_config {
        initialize["clientCapabilities"]["_meta"]
            .as_object_mut()
            .unwrap()
            .remove("co.grida/config/inspect");
    }
    if negotiate {
        for operation in ["start", "inspect", "control", "recover"] {
            initialize["clientCapabilities"]["_meta"][format!("co.grida/goal/{operation}")] =
                1.into();
        }
    }
    let response = ws_rpc(&mut socket, 1, "initialize", initialize).await;
    assert_eq!(
        response["result"]["agentCapabilities"]["_meta"]["co.grida/goal/start"],
        1
    );
    socket
}

#[tokio::test]
async fn negotiated_goals_keep_interrupted_continuation_owned_after_restart() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool(
            "goal_report",
            r#"{"report":{"kind":"progress","summary":"Prepared the export"}}"#,
        ),
        Reply::Finished("First goal answer"),
        Reply::Hold("Follow-up in progress"),
    ])
    .await;
    let (mut child, url) = shared_server(&state, &endpoint.url).await;
    let mut standard = goal_client(&url, false, false).await;
    let denied = ws_rpc(
        &mut standard,
        2,
        "_co.grida/goal/inspect",
        json!({"sessionId":"unknown"}),
    )
    .await;
    assert_eq!(denied["error"]["code"], -32601);
    drop(standard);
    let mut client = goal_client(&url, true, true).await;
    let denied = ws_rpc(
        &mut client,
        2,
        "_co.grida/goal/inspect",
        json!({"sessionId":"unattached"}),
    )
    .await;
    assert_eq!(denied["error"]["data"], "session_setup_required");
    let new = ws_rpc(
        &mut client,
        3,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = new["result"]["sessionId"].as_str().unwrap();
    let selector = json!({"sessionId":session});
    let start = json!({
        "sessionId":session,"inputId":"wire-goal",
        "prompt":[{"type":"text","text":"Prepare the export"}],
        "goal":{
            "objective":{"description":"Prepare the export","criteria":["The exported file opens"]},
            "allowance":{"work_turns":3,"inference_steps":5},"automatic":true
        }
    });
    let accepted = ws_rpc(&mut client, 4, "_co.grida/goal/start", start.clone()).await;
    assert_eq!(accepted["result"]["inputId"], "wire-goal", "{accepted}");
    endpoint.request().await;
    endpoint.request().await;
    endpoint.request().await;
    let inspected = ws_rpc(&mut client, 5, "_co.grida/goal/inspect", selector.clone()).await;
    let goal = &inspected["result"]["goal"];
    assert_eq!(goal["automatic"], true);
    assert_eq!(goal["spent"], json!({"work_turns":1,"inference_steps":2}));
    let follow_up = goal["reservation"]["turn"].as_str().unwrap();
    let retry = ws_rpc(&mut client, 6, "_co.grida/goal/start", start.clone()).await;
    assert_eq!(
        retry["result"]["inputPosition"],
        accepted["result"]["inputPosition"]
    );
    assert_eq!(retry["result"]["disposition"], "completed");
    assert_ne!(retry["result"]["turnId"], follow_up);
    child.start_kill().unwrap();
    timeout(WAIT, child.wait()).await.unwrap().unwrap();
    drop(client);
    let endpoint_url = endpoint.url.clone();
    endpoint.done().await;

    let (child, url) = shared_server(&state, &endpoint_url).await;
    let mut client = goal_client(&url, true, false).await;
    let load = ws_rpc(
        &mut client,
        2,
        "session/load",
        json!({
            "sessionId":session,"cwd":workspace.path(),"mcpServers":[]
        }),
    )
    .await;
    assert!(load.get("result").is_some(), "{load}");
    let replayed_start = ws_rpc(&mut client, 3, "_co.grida/goal/start", start).await;
    assert_eq!(replayed_start["result"], retry["result"]);
    let snapshot = session_snapshot(&mut client, session).await;
    assert_eq!(snapshot["current"]["turnId"], follow_up);
    assert_eq!(snapshot["current"]["disposition"], "interrupted");
    let recovered = ws_rpc(&mut client, 4, "_co.grida/goal/recover", selector.clone()).await;
    assert_eq!(recovered["result"]["sessionId"], session, "{recovered}");
    assert_eq!(session_snapshot(&mut client, session).await, snapshot);
    let current = ws_rpc(&mut client, 5, "_co.grida/goal/inspect", selector.clone()).await;
    assert_eq!(current["result"]["goal"]["reservation"]["turn"], follow_up);
    let clear = json!({
        "sessionId":session,"requestId":"clear-interrupted-goal",
        "expectedSessionRevision":current["result"]["revision"],
        "expectedStateRevision":current["result"]["stateRevision"],
        "basis":current["result"]["goal"]["basis"],"change":{"action":"clear"}
    });
    let cleared = ws_rpc(&mut client, 6, "_co.grida/goal/control", clear.clone()).await;
    assert_eq!(cleared["result"]["turnId"], follow_up, "{cleared}");
    wait_for_snapshot(&mut client, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    let after = ws_rpc(&mut client, 8, "_co.grida/goal/inspect", selector).await;
    assert_eq!(after["result"]["goal"]["status"]["status"], "cleared");
    assert_eq!(after["result"]["goal"]["reservation"]["uncertain_steps"], 1);
    let retry = ws_rpc(&mut client, 9, "_co.grida/goal/control", clear).await;
    assert_eq!(retry["result"], cleared["result"]);
    terminate_shared_server(child).await;
}

#[tokio::test]
async fn explicit_goal_uses_owned_queue_and_keeps_ordinary_work_separate() {
    let (release, blocked) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start_with_credential(
        vec![
            Reply::Tool(
                "goal_report",
                r#"{"report":{"kind":"progress","summary":"Prepared the export"}}"#,
            ),
            Reply::Release("Ready for review", blocked),
            Reply::Finished("Ordinary answer"),
        ],
        None,
    )
    .await;
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let host = Host::open(&state, Some(options(&endpoint))).unwrap();
    let session = host.new_session(workspace.path().into()).await.unwrap();
    let input = request(&session, "first-goal", "Prepare the export");
    let accepted = host.start_goal(input.clone(), goal()).await.unwrap();
    let first = endpoint.request().await;
    assert!(first["tools"].to_string().contains("goal_report"));
    assert!(first["tools"].to_string().contains("goal_inspect"));
    let second = endpoint.request().await;
    assert!(
        second["messages"]
            .to_string()
            .contains("Goal proposal recorded")
    );
    let current = host
        .inspect_goal(session.clone())
        .await
        .unwrap()
        .goal
        .unwrap();
    assert_eq!(current.basis.goal, accepted.input);
    assert_eq!(current.remaining.inference_steps, 0);
    assert_eq!(
        current.reservation.as_ref().unwrap().inference_steps.get(),
        5
    );

    let duplicate = host.start_goal(input.clone(), goal()).await.unwrap();
    assert_eq!(duplicate.position, accepted.position);
    assert!(matches!(
        duplicate.disposition,
        InputDisposition::Claimed { .. }
    ));
    let mut changed = goal();
    changed.objective.description = "A different goal".into();
    assert_eq!(
        host.start_goal(input.clone(), changed)
            .await
            .unwrap_err()
            .code,
        "input_identity_reused"
    );
    assert_eq!(
        host.enqueue(input.clone()).await.unwrap_err().code,
        "submission_input_changed"
    );
    host.enqueue(request(&session, "ordinary", "Explain something else"))
        .await
        .unwrap();
    release.send(()).unwrap();
    let ordinary = endpoint.request().await;
    assert!(!ordinary["tools"].to_string().contains("goal_report"));
    let settled = timeout(WAIT, async {
        loop {
            let view = host.inspect(session.clone()).await.unwrap();
            if view.current.is_none() && view.queued.is_empty() {
                break view;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let goal = host
        .inspect_goal(session.clone())
        .await
        .unwrap()
        .goal
        .unwrap();
    assert_eq!(goal.status, Status::Active);
    assert_eq!(goal.progress.as_deref(), Some("Prepared the export"));
    assert_eq!(
        goal.spent,
        Usage {
            work_turns: 1,
            inference_steps: 2
        }
    );
    assert_eq!(goal.remaining.inference_steps, 3);
    assert!(goal.reservation.is_none());
    let ordinary_account = grida_agent_master::read_account(
        settled
            .latest
            .unwrap()
            .outcome
            .unwrap()
            .account
            .as_ref()
            .unwrap(),
    )
    .unwrap();
    assert!(ordinary_account.goal.is_none());
    host.shutdown().await.unwrap();
    drop(host);
    let reopened = Host::open(&state, Some(options(&endpoint))).unwrap();
    let observed = reopened.inspect_goal(session).await.unwrap().goal.unwrap();
    assert_eq!(observed.spent, goal.spent);
    assert_eq!(observed.progress, goal.progress);
    assert!(matches!(
        reopened
            .start_goal(input, self::goal())
            .await
            .unwrap()
            .disposition,
        InputDisposition::Completed { .. }
    ));
    reopened.shutdown().await.unwrap();
    endpoint.done().await;
}

#[tokio::test]
async fn automatic_goal_yields_to_user_queue_and_stops_at_repeated_progress() {
    const REPORT: &str = r#"{"report":{"kind":"progress","summary":"Prepared the export"}}"#;
    let (release, blocked) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start_with_credential(
        vec![
            Reply::Tool("goal_report", REPORT),
            Reply::Release("First goal answer", blocked),
            Reply::Finished("Ordinary answer"),
            Reply::Tool("goal_report", REPORT),
            Reply::Finished("No further progress"),
        ],
        None,
    )
    .await;
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let host = Host::open(&state, Some(options(&endpoint))).unwrap();
    let session = host.new_session(workspace.path().into()).await.unwrap();
    let input = request(&session, "automatic-goal", "Prepare the export");
    let mut goal = goal();
    goal.automatic = true;
    host.start_goal(input.clone(), goal).await.unwrap();
    endpoint.request().await;
    endpoint.request().await;
    let initial = host
        .inspect(session.clone())
        .await
        .unwrap()
        .current
        .unwrap();
    host.enqueue(request(
        &session,
        "ordinary-first",
        "Explain something else",
    ))
    .await
    .unwrap();
    release.send(()).unwrap();

    let ordinary = endpoint.request().await;
    assert!(!ordinary["tools"].to_string().contains("goal_report"));
    let follow_up = endpoint.request().await;
    assert!(follow_up["tools"].to_string().contains("goal_report"));
    let user_text = follow_up["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|message| message["role"] == "user")
        .map(|message| message["content"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(user_text, ["Prepare the export", "Explain something else"]);
    endpoint.request().await;
    let final_view = timeout(WAIT, async {
        loop {
            let view = host.inspect(session.clone()).await.unwrap();
            if view.current.is_none()
                && view.queued.is_empty()
                && view
                    .latest
                    .as_ref()
                    .is_some_and(|latest| latest.binding.turn != initial.binding.turn)
                && host
                    .inspect_goal(session.clone())
                    .await
                    .unwrap()
                    .goal
                    .unwrap()
                    .status
                    == Status::Blocked(Blocker::NoProgress)
            {
                break view;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let final_goal = host
        .inspect_goal(session.clone())
        .await
        .unwrap()
        .goal
        .unwrap();
    assert_eq!(
        final_goal.spent,
        Usage {
            work_turns: 2,
            inference_steps: 4
        }
    );
    assert_eq!(final_goal.remaining.inference_steps, 1);
    assert!(final_goal.reservation.is_none());
    let generated = grida_agent_master::goals::Continuation {
        basis: final_goal.basis.clone(),
        after: initial.binding.turn,
    }
    .input_id(&session)
    .unwrap();
    let observed = host
        .inspect_input(session.clone(), generated.clone())
        .await
        .unwrap();
    assert_eq!(
        observed.receipt.disposition,
        InputDisposition::Completed {
            turn: final_view.latest.unwrap().binding.turn,
        }
    );
    assert!(observed.parts.is_empty());
    host.shutdown().await.unwrap();
    drop(host);
    let reopened = Host::open(&state, Some(options(&endpoint))).unwrap();
    reopened.recover_goal_work(session.clone()).await.unwrap();
    reopened.recover_goal_work(session.clone()).await.unwrap();
    assert_eq!(
        reopened
            .inspect_input(session.clone(), generated)
            .await
            .unwrap()
            .receipt
            .position,
        observed.receipt.position
    );
    assert_eq!(
        reopened
            .inspect_goal(session)
            .await
            .unwrap()
            .goal
            .unwrap()
            .spent,
        final_goal.spent
    );
    reopened.shutdown().await.unwrap();
    endpoint.done().await;
}

#[tokio::test]
async fn paused_goal_work_keeps_its_reservation_and_stop_preserves_uncertainty() {
    let mut endpoint =
        Endpoint::start_with_credential(vec![Reply::Hold("Partial goal work")], None).await;
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let host = Host::open(
        &temporary.path().join("agent-state"),
        Some(options(&endpoint)),
    )
    .unwrap();
    let session = host.new_session(workspace.path().into()).await.unwrap();
    host.start_goal(request(&session, "stop-goal", "Prepare the export"), goal())
        .await
        .unwrap();
    endpoint.request().await;
    let view = host.inspect(session.clone()).await.unwrap();
    let current = view.current.unwrap();
    let turn = current.binding.turn;
    host.pause(TurnControl {
        session: session.clone(),
        turn: turn.clone(),
        request: ChangeId::new("pause").unwrap(),
        expected_session: view.revision,
        expected_control: current.controls.revision,
    })
    .await
    .unwrap();
    let suspended = timeout(WAIT, async {
        loop {
            let view = host.inspect(session.clone()).await.unwrap();
            if view
                .current
                .as_ref()
                .is_some_and(|current| current.disposition == TurnDisposition::Suspended)
            {
                break view;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let held = host
        .inspect_goal(session.clone())
        .await
        .unwrap()
        .goal
        .unwrap();
    assert_eq!(held.reservation.as_ref().unwrap().turn, turn);
    host.stop(
        session.clone(),
        turn.clone(),
        ChangeId::new("stop").unwrap(),
        suspended.revision,
        suspended.current.unwrap().controls.revision,
    )
    .await
    .unwrap();
    timeout(WAIT, async {
        loop {
            let view = host.inspect(session.clone()).await.unwrap();
            if view.current.is_none() {
                assert!(view.admission_paused);
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let stopped = host.inspect_goal(session).await.unwrap().goal.unwrap();
    assert_eq!(stopped.status, Status::Blocked(Blocker::UncertainWork));
    assert_eq!(stopped.reservation.unwrap().uncertain_steps, Some(1));
    assert_eq!(stopped.spent, Usage::default());
    host.shutdown().await.unwrap();
    endpoint.done().await;
}

#[tokio::test]
async fn explicit_goal_resume_keeps_the_same_turn_and_replays_controls() {
    use grida_agent::host::{GoalAction, GoalControl, GoalInspection};

    fn action(view: &GoalInspection, id: &str, action: GoalAction) -> GoalControl {
        GoalControl {
            id: ChangeId::new(id).unwrap(),
            session: view.session.clone(),
            expected_revision: view.revision,
            expected_state: view.state_revision,
            basis: view.goal.as_ref().unwrap().basis.clone(),
            action,
        }
    }
    let (release, blocked) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start_with_credential(
        vec![
            Reply::Hold("Partial work"),
            Reply::Release("Reopened the export", blocked),
        ],
        None,
    )
    .await;
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let host = Host::open(
        &temporary.path().join("agent-state"),
        Some(options(&endpoint)),
    )
    .unwrap();
    let session = host.new_session(workspace.path().into()).await.unwrap();
    host.start_goal(
        request(&session, "resume-goal", "Prepare the export"),
        goal(),
    )
    .await
    .unwrap();
    endpoint.request().await;
    let before = host.inspect_goal(session.clone()).await.unwrap();
    let original = before
        .goal
        .as_ref()
        .unwrap()
        .reservation
        .as_ref()
        .unwrap()
        .clone();
    let pause = action(&before, "pause-goal", GoalAction::Pause);
    let paused = host.control_goal(pause.clone()).await.unwrap();
    let suspended = timeout(WAIT, async {
        loop {
            let view = host.inspect(session.clone()).await.unwrap();
            if let Some(current) = view.current
                && current.disposition == TurnDisposition::Suspended
            {
                break current;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    assert!(suspended.controls.paused);
    let paused_view = host.inspect_goal(session.clone()).await.unwrap();
    assert!(paused_view.goal.as_ref().unwrap().paused);
    assert_eq!(
        host.resume(
            TurnControl {
                session: session.clone(),
                turn: suspended.binding.turn.clone(),
                request: ChangeId::new("generic-resume-cannot-bypass-goal-pause").unwrap(),
                expected_session: paused_view.revision,
                expected_control: suspended.controls.revision,
            },
            suspended.binding.epoch,
            suspended.position,
        )
        .await
        .unwrap_err()
        .code,
        "goal_control_required"
    );
    assert_eq!(
        host.inspect(session.clone()).await.unwrap().current,
        Some(suspended.clone())
    );
    let resume = action(&paused_view, "resume-goal-control", GoalAction::Resume);
    let resumed = host.control_goal(resume.clone()).await.unwrap();
    endpoint.request().await;
    let active = host
        .inspect(session.clone())
        .await
        .unwrap()
        .current
        .unwrap();
    assert_eq!(active.binding.turn, original.turn);
    assert!(active.binding.epoch > suspended.binding.epoch);
    let resumed_goal = host
        .inspect_goal(session.clone())
        .await
        .unwrap()
        .goal
        .unwrap();
    let held = resumed_goal.reservation.unwrap();
    assert_eq!(held.inference_steps, original.inference_steps);
    assert_ne!(held.basis, original.basis);
    assert_eq!(host.control_goal(resume.clone()).await.unwrap(), resumed);
    let mut changed = resume;
    changed.action = GoalAction::Clear;
    assert_eq!(
        host.control_goal(changed).await.unwrap_err().code,
        "request_identity_reused"
    );
    release.send(()).unwrap();
    timeout(WAIT, async {
        while host
            .inspect(session.clone())
            .await
            .unwrap()
            .current
            .is_some()
        {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let finished = host.inspect_goal(session.clone()).await.unwrap();
    let clear = action(&finished, "clear-goal", GoalAction::Clear);
    host.control_goal(clear).await.unwrap();
    assert_eq!(host.control_goal(pause).await.unwrap(), paused);
    let cleared = host.inspect_goal(session).await.unwrap().goal.unwrap();
    assert_eq!(cleared.status, Status::Cleared);
    assert!(!cleared.paused);
    assert_eq!(cleared.reservation.unwrap().uncertain_steps, Some(2));
    host.shutdown().await.unwrap();
    endpoint.done().await;
}
