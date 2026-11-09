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
    }
}

fn request(session: &SessionId, id: &str, text: &str) -> PromptRequest {
    PromptRequest {
        id: ChangeId::new(id).unwrap(),
        session: session.clone(),
        parts: vec![PromptPart::Text { text: text.into() }],
        questions: false,
        configuration_permission: ConfigurationPermission::Disabled,
    }
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
