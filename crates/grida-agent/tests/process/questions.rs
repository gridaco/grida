use super::lifecycle::{
    prompt_request, session_snapshot, task_basis, terminate_shared_server, wait_for_snapshot,
};
use super::*;

pub(super) async fn question_socket(url: &str, questions: bool) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut capabilities = extension_initialize();
    if questions {
        let meta = capabilities["clientCapabilities"]["_meta"]
            .as_object_mut()
            .unwrap();
        meta.insert("co.grida/session/questions".into(), 1.into());
        meta.insert("co.grida/session/answer-question".into(), 1.into());
    }
    let initialized = ws_rpc(&mut socket, 1, "initialize", capabilities).await;
    assert_eq!(initialized["result"]["protocolVersion"], 1);
    socket
}

pub(super) async fn question_list(socket: &mut SharedSocket, session: &str, turn: &str) -> Value {
    let listed = ws_rpc(
        socket,
        40,
        "_co.grida/session/questions",
        json!({"sessionId": session, "turnId": turn}),
    )
    .await;
    assert!(listed.get("error").is_none(), "{listed}");
    listed["result"].clone()
}

#[tokio::test]
async fn negotiated_question_survives_restart_and_answer_resumes_the_same_turn() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Plain reply."),
        Reply::Question("question_async"),
        Reply::Finished("Independent work is complete."),
        Reply::Finished("Applied the user's answer."),
    ])
    .await;
    let (first_host, url) = shared_server(&state, &endpoint.url).await;

    let mut plain = question_socket(&url, false).await;
    let created = ws_rpc(
        &mut plain,
        2,
        "session/new",
        json!({"cwd": workspace.path(), "mcpServers": []}),
    )
    .await;
    let plain_session = created["result"]["sessionId"].as_str().unwrap();
    let replied = ws_rpc(
        &mut plain,
        3,
        "session/prompt",
        json!({"sessionId": plain_session, "prompt": [{"type":"text","text":"Plain prompt"}]}),
    )
    .await;
    assert_eq!(replied["result"]["stopReason"], "end_turn", "{replied}");
    assert!(endpoint.request().await.get("tools").is_none());
    drop(plain);

    let mut first = question_socket(&url, true).await;
    let created = ws_rpc(
        &mut first,
        2,
        "session/new",
        json!({"cwd": workspace.path(), "mcpServers": []}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let started = ws_rpc(
        &mut first,
        3,
        "_co.grida/session/submit",
        prompt_request(session, "question-prompt", "Prepare the document."),
    )
    .await;
    let turn = started["result"]["turnId"].as_str().unwrap();
    let request = endpoint.request().await;
    let tools = request["tools"].as_array().unwrap();
    for name in ["question", "question_async"] {
        assert!(tools.iter().any(|tool| tool["function"]["name"] == name));
    }
    endpoint.request().await;
    wait_for_snapshot(&mut first, session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    let pending = question_list(&mut first, session, turn).await;
    assert_eq!(pending["questions"].as_array().unwrap().len(), 1);
    assert_eq!(pending["questions"][0]["style"], "nonblocking");
    assert_eq!(pending["questions"][0]["question"], "Which edition?");
    assert_eq!(
        pending["questions"][0]["options"],
        json!(["Screen", "Print"])
    );
    drop(first);
    terminate_shared_server(first_host).await;

    let (second_host, url) = shared_server(&state, &endpoint.url).await;
    let mut second = question_socket(&url, true).await;
    let loaded = ws_rpc(
        &mut second,
        2,
        "session/load",
        json!({"sessionId":session, "cwd":workspace.path(), "mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    assert_eq!(question_list(&mut second, session, turn).await, pending);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    let snapshot = session_snapshot(&mut second, session).await;
    let answer = json!({
        "sessionId":session,
        "turnId":turn,
        "requestId":"answer-edition",
        "expectedSessionRevision":snapshot["sessionRevision"],
        "expectedControlRevision":pending["controlRevision"],
        "expectedHistoryPosition":pending["historyPosition"],
        "waitId":pending["questions"][0]["waitId"],
        "answer":{"kind":"text", "text":"Use large print."}
    });
    let mut wrong = answer.clone();
    wrong["requestId"] = "wrong-question".into();
    wrong["waitId"] = "unknown".into();
    let rejected = ws_rpc(&mut second, 3, "_co.grida/session/answer-question", wrong).await;
    assert!(rejected.get("error").is_some(), "{rejected}");
    assert_eq!(question_list(&mut second, session, turn).await, pending);
    assert_eq!(
        session_snapshot(&mut second, session).await["queuedInputs"],
        0
    );

    let accepted = ws_rpc(
        &mut second,
        4,
        "_co.grida/session/answer-question",
        answer.clone(),
    )
    .await;
    assert_eq!(accepted["result"]["turnId"], turn, "{accepted}");
    let request = endpoint.request().await;
    let input = request["messages"].as_array().unwrap().last().unwrap();
    assert_eq!(input["role"], "user");
    assert!(
        input["content"]
            .as_str()
            .unwrap()
            .ends_with("Use large print.")
    );
    let settled = wait_for_snapshot(&mut second, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "succeeded");
    assert_eq!(
        question_list(&mut second, session, turn).await["questions"],
        json!([])
    );
    let replayed = ws_rpc(&mut second, 5, "_co.grida/session/answer-question", answer).await;
    assert_eq!(replayed["result"], accepted["result"]);
    endpoint.done().await;
    drop(second);
    terminate_shared_server(second_host).await;
}

#[tokio::test]
async fn embedded_questions_return_an_identified_input_required_result() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Question("question")]).await;
    let mut command = executable();
    command.arg("run");
    configured(&mut command, &state, &endpoint.url);
    command.arg("--cwd").arg(workspace.path()).args([
        "--questions",
        "--prompt",
        "Prepare the document.",
    ]);
    let output = timeout(WAIT, command.output()).await.unwrap().unwrap();
    assert_eq!(
        output.status.code(),
        Some(6),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result = records(&output.stdout);
    assert_eq!(result.len(), 2);
    assert_eq!(result[1]["disposition"], "input_required");
    assert_eq!(result[1]["session_id"], result[0]["session_id"]);
    assert_eq!(result[1]["turn_id"], result[0]["turn_id"]);
    assert_eq!(result[1]["questions"][0]["style"], "answer_dependent");
    assert_eq!(result[1]["questions"][0]["question"], "Which edition?");
    assert!(result[1]["questions"][0]["waitId"].is_string());
    endpoint.request().await;
    endpoint.done().await;

    let session = result[0]["session_id"].as_str().unwrap();
    let inspected = timeout(
        WAIT,
        executable()
            .args(["inspect", "--state-dir"])
            .arg(&state)
            .arg(session)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(inspected.status.success());
    let saved = records(&inspected.stdout);
    assert_eq!(saved[0]["current"]["disposition"], "suspended");
}

async fn start_question(socket: &mut SharedSocket, workspace: &Path) -> (String, String) {
    let created = ws_rpc(
        socket,
        2,
        "session/new",
        json!({"cwd":workspace,"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
    let started = ws_rpc(
        socket,
        3,
        "_co.grida/session/submit",
        prompt_request(&session, "question", "Prepare the document."),
    )
    .await;
    let turn = started["result"]["turnId"].as_str().unwrap().to_owned();
    (session, turn)
}

async fn answer_edition(socket: &mut SharedSocket, session: &str, turn: &str) {
    let pending = question_list(socket, session, turn).await;
    let snapshot = session_snapshot(socket, session).await;
    let receipt = ws_rpc(
        socket,
        4,
        "_co.grida/session/answer-question",
        json!({
            "sessionId":session,
            "turnId":turn,
            "requestId":"answer-edition",
            "expectedSessionRevision":snapshot["sessionRevision"],
            "expectedControlRevision":pending["controlRevision"],
            "expectedHistoryPosition":pending["historyPosition"],
            "waitId":pending["questions"][0]["waitId"],
            "answer":{"kind":"choice", "index":1}
        }),
    )
    .await;
    assert_eq!(receipt["result"]["turnId"], turn, "{receipt}");
}

#[tokio::test]
async fn answer_during_independent_inference_reaches_the_next_decision_without_a_second_owner() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (release, blocked) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question_async"),
        Reply::Release("Independent work is complete.", blocked),
        Reply::Finished("Applied the print choice."),
    ])
    .await;
    let (host, url) = shared_server(&temporary.path().join("agent-state"), &endpoint.url).await;
    let mut socket = question_socket(&url, true).await;
    let (session, turn) = start_question(&mut socket, workspace.path()).await;
    endpoint.request().await;
    endpoint.request().await;
    assert_eq!(
        session_snapshot(&mut socket, &session).await["current"]["disposition"],
        "running"
    );
    answer_edition(&mut socket, &session, &turn).await;
    release.send(()).unwrap();

    let request = endpoint.request().await;
    let last = request["messages"].as_array().unwrap().last().unwrap();
    assert_eq!(last["role"], "user");
    assert!(last["content"].as_str().unwrap().ends_with("Print"));
    let settled = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["epoch"], 1);
    endpoint.done().await;
    drop(socket);
    terminate_shared_server(host).await;
}

#[tokio::test]
async fn answered_turn_keeps_its_wake_under_capacity_and_resumes_with_later_steering() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (release, blocked) = tokio::sync::oneshot::channel();
    let mut replies = vec![
        Reply::Question("question"),
        Reply::Release("Worker completed.", blocked),
    ];
    replies.extend((0..7).map(|_| Reply::Hold("Other work.")));
    replies.push(Reply::Finished("Applied print and wide margins."));
    let mut endpoint = Endpoint::start(replies).await;
    let (host, url) = shared_server(&temporary.path().join("agent-state"), &endpoint.url).await;
    let mut socket = question_socket(&url, true).await;
    let (session, turn) = start_question(&mut socket, workspace.path()).await;
    endpoint.request().await;
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;

    for index in 0..8 {
        let created = ws_rpc(
            &mut socket,
            10 + index * 2,
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
        let worker = created["result"]["sessionId"].as_str().unwrap();
        let accepted = ws_rpc(
            &mut socket,
            11 + index * 2,
            "_co.grida/session/submit",
            prompt_request(worker, "worker", "Keep working."),
        )
        .await;
        assert_eq!(accepted["result"]["disposition"], "claimed", "{accepted}");
        endpoint.request().await;
    }

    answer_edition(&mut socket, &session, &turn).await;
    let snapshot = session_snapshot(&mut socket, &session).await;
    assert_eq!(snapshot["current"]["disposition"], "suspended");
    let steered = ws_rpc(
        &mut socket,
        30,
        "_co.grida/session/steer",
        json!({
            "task":task_basis(&snapshot, &session, "steer-edition"),
            "expectedHistoryPosition":snapshot["current"]["historyPosition"],
            "prompt":[{"type":"text","text":"Keep the margins wide."}]
        }),
    )
    .await;
    assert_eq!(steered["result"]["turnId"], turn, "{steered}");
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    release.send(()).unwrap();

    let request = endpoint.request().await;
    let messages = request["messages"].as_array().unwrap();
    assert_eq!(
        messages.last().unwrap()["content"],
        "Keep the margins wide."
    );
    assert!(messages.iter().any(|message| {
        message["role"] == "tool"
            && message["content"]
                .as_str()
                .is_some_and(|text| text.contains("Print"))
    }));
    let settled = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["epoch"], 2);
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn answering_a_paused_question_preserves_the_explicit_pause() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question"),
        Reply::Finished("Applied the print choice."),
    ])
    .await;
    let (host, url) = shared_server(&temporary.path().join("agent-state"), &endpoint.url).await;
    let mut socket = question_socket(&url, true).await;
    let (session, turn) = start_question(&mut socket, workspace.path()).await;
    endpoint.request().await;
    let suspended = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    let paused = ws_rpc(
        &mut socket,
        8,
        "_co.grida/session/pause",
        task_basis(&suspended, &session, "pause-question"),
    )
    .await;
    assert_eq!(paused["result"]["turnId"], turn, "{paused}");
    answer_edition(&mut socket, &session, &turn).await;
    let state = session_snapshot(&mut socket, &session).await;
    assert_eq!(state["current"]["paused"], true);
    assert_eq!(state["current"]["epoch"], 1);
    assert_eq!(
        question_list(&mut socket, &session, &turn).await["questions"],
        json!([])
    );
    assert!(
        timeout(Duration::from_millis(100), endpoint.requests.recv())
            .await
            .is_err()
    );

    let resumed = ws_rpc(
        &mut socket,
        9,
        "_co.grida/session/resume",
        json!({
            "task":task_basis(&state, &session, "resume-question"),
            "expectedEpoch":state["current"]["epoch"],
            "expectedJournalPosition":state["current"]["journalPosition"]
        }),
    )
    .await;
    assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
    endpoint.request().await;
    let settled = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["epoch"], 2);
    endpoint.done().await;
    drop(socket);
    terminate_shared_server(host).await;
}

#[tokio::test]
async fn answer_before_a_deferred_step_suspends_keeps_its_resume_wake() {
    use agent_kit_core::{ChangeId, ModelId};
    use agent_kit_runtime::TurnUpdate;
    use grida_agent::host::{Host, PromptPart, PromptRequest, RunResult, TurnControl};
    use grida_agent_master::questions::QuestionAnswer;

    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (release, blocked) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start_with_credential(
        vec![
            Reply::QuestionThenHold(blocked),
            Reply::Finished("Applied the print choice."),
        ],
        None,
    )
    .await;
    let host = Host::open(
        &temporary.path().join("agent-state"),
        Some(grida_agent::ProviderOptions {
            protocol: ProviderProtocol::OpenAiCompatible,
            endpoint: endpoint.url.clone(),
            model: ModelId::new("fixture-model").unwrap(),
            credential_home: None,
            credential_env: None,
            compatible_output_limit_field: None,
            max_output_tokens: 1024,
        }),
    )
    .unwrap();
    let session = host.new_session(workspace.path().into()).await.unwrap();
    let mut run = host
        .start_prompt(PromptRequest {
            id: ChangeId::new("question-input").unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Prepare the document.".into(),
            }],
            questions: true,
            configuration_permission: grida_agent::ConfigurationPermission::Disabled,
            operating_regime: None,
        })
        .await
        .unwrap();
    endpoint.request().await;
    let wait = timeout(WAIT, async {
        loop {
            if let TurnUpdate::Deferred { wait, .. } = run.updates.recv().await.unwrap() {
                return wait;
            }
        }
    })
    .await
    .unwrap();
    let view = host.inspect(session.clone()).await.unwrap();
    let current = view.current.unwrap();
    host.answer_question(
        TurnControl {
            session: session.clone(),
            turn: run.turn.clone(),
            request: ChangeId::new("answer-question").unwrap(),
            expected_session: view.revision,
            expected_control: current.controls.revision,
        },
        current.history_position,
        wait,
        QuestionAnswer::Choice { index: 1 },
    )
    .await
    .unwrap();
    release.send(()).unwrap();
    assert!(matches!(
        timeout(WAIT, run.completion)
            .await
            .unwrap()
            .unwrap()
            .unwrap(),
        RunResult::Suspended
    ));
    let request = endpoint.request().await;
    assert!(
        request["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| {
                message["role"] == "tool" && message["content"].as_str().unwrap().contains("Print")
            })
    );
    timeout(WAIT, async {
        loop {
            let view = host.inspect(session.clone()).await.unwrap();
            if view.current.is_none() {
                let latest = view.latest.unwrap();
                assert_eq!(latest.binding.turn, run.turn);
                assert_eq!(latest.binding.epoch, 2);
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    host.shutdown().await.unwrap();
    endpoint.done().await;
}
