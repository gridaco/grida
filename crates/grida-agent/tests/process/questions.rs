use super::lifecycle::{
    prompt_request, session_snapshot, task_basis, terminate_shared_server, wait_for_snapshot,
};
use super::*;

pub(super) const EDITION_QUESTION: &str = r#"{"questions":[{"id":"edition","question":"Which edition?","options":[{"label":"Screen"},{"label":"Print"}]}]}"#;

const QUESTION_BATCH: &str = r#"{"questions":[
    {"id":"edition","header":"Edition","question":"Which edition?","options":[{"label":"Screen","description":"For on-screen reading"},{"label":"Print"}]},
    {"id":"title","question":"What title should we use?"},
    {"id":"notes","question":"Any other notes?"}
]}"#;

pub(super) async fn question_socket(url: &str, questions: bool) -> SharedSocket {
    question_socket_with_batches(url, questions, false).await
}

async fn question_socket_with_batches(url: &str, questions: bool, batches: bool) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut capabilities = extension_initialize();
    if questions || batches {
        let meta = capabilities["clientCapabilities"]["_meta"]
            .as_object_mut()
            .unwrap();
        if questions {
            meta.insert("co.grida/session/questions".into(), 1.into());
            meta.insert("co.grida/session/answer-question".into(), 1.into());
        }
        if batches {
            meta.insert("co.grida/session/questions-v2".into(), 1.into());
            meta.insert("co.grida/session/answer-question-v2".into(), 1.into());
        }
    }
    let initialized = ws_rpc(&mut socket, 1, "initialize", capabilities).await;
    assert_eq!(initialized["result"]["protocolVersion"], 1);
    assert_eq!(
        initialized["result"]["agentCapabilities"]["_meta"]["co.grida/session/optional-questions"],
        1
    );
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

async fn check_reopened_reply(state: &Path, workspace: &Path, session: &str, expected: &str) {
    use super::approvals::Stdio;
    const WINDOW: &str = "co.grida/session/transcript-window";
    let mut client = Stdio::from_child(spawn_serve(state, "http://127.0.0.1:1"));
    let mut capabilities = extension_initialize();
    capabilities["clientCapabilities"]["_meta"][WINDOW] = 1.into();
    capabilities["clientCapabilities"]["_meta"]["co.grida/session/activity-order"] = 1.into();
    client.request("initialize", capabilities).await;
    let mut load = json!({"sessionId":session,"cwd":workspace,"mcpServers":[],
        "_meta":{WINDOW:{"kind":"attach"}}});
    assert!(
        client
            .request("session/load", load.clone())
            .await
            .get("error")
            .is_none()
    );
    load["_meta"][WINDOW] = json!({"kind":"read","requestId":"reply-window"});
    let id = client.send("session/load", load).await;
    let mut replies = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == id {
            assert!(frame.get("error").is_none(), "{frame}");
            break;
        }
        let params = &frame["params"];
        if params["update"]["sessionUpdate"] == "user_message_chunk" {
            assert!(
                !params["update"]
                    .to_string()
                    .contains("send_user_message_question_reply")
            );
            if let Some(reply) = params["_meta"][WINDOW].get("questionReply") {
                assert_eq!(reply["question"], "Which edition?");
                assert!(reply["waitId"].as_str().unwrap().starts_with("question/"));
                assert!(params["_meta"][WINDOW]["activityOrder"].as_u64().is_some());
                replies.push(params["update"]["content"]["text"].clone());
            }
        }
    }
    assert_eq!(replies, [json!(expected)]);
    let history = client
        .request("_co.grida/session/history", json!({"sessionId": session}))
        .await;
    let messages = history["result"]["messages"].as_array().unwrap();
    assert!(
        messages
            .iter()
            .any(|message| message["preview"] == expected && message["editable"] == false)
    );
    assert!(!messages.iter().any(|message| {
        message["preview"]
            .as_str()
            .unwrap()
            .contains("send_user_message_question_reply")
    }));
    client.close().await;
}

#[tokio::test]
async fn negotiated_question_survives_restart_and_answer_resumes_the_same_turn() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Plain reply."),
        Reply::Question("question_async"),
        Reply::Question("question"),
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
    let questions = pending["questions"].as_array().unwrap();
    assert_eq!(questions.len(), 2);
    let required = questions
        .iter()
        .find(|q| q["style"] == "answer_dependent")
        .unwrap();
    let optional = questions
        .iter()
        .find(|q| q["style"] == "nonblocking")
        .unwrap();
    assert_eq!(required["question"], "Which edition?");
    assert_eq!(required["options"], json!(["Screen", "Print"]));
    drop(first);
    terminate_shared_server(first_host).await;

    let (second_host, url) = shared_server(&state, &endpoint.url).await;
    // A client that enables batches still recovers the exact singleton tool
    // captured before batches were available for this input.
    let mut second = question_socket_with_batches(&url, true, true).await;
    let loaded = ws_rpc(
        &mut second,
        2,
        "session/load",
        json!({"sessionId":session, "cwd":workspace.path(), "mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    assert_eq!(question_list(&mut second, session, turn).await, pending);
    assert_eq!(batch_list(&mut second, session, turn).await, pending);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    let snapshot = session_snapshot(&mut second, session).await;
    assert_eq!(snapshot["current"]["inputNeeded"], true);
    let answer = json!({
        "sessionId":session,
        "turnId":turn,
        "requestId":"answer-edition",
        "expectedSessionRevision":snapshot["sessionRevision"],
        "expectedControlRevision":pending["controlRevision"],
        "expectedHistoryPosition":pending["historyPosition"],
        "waitId":required["waitId"],
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
    assert!(
        request["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| message["role"] == "tool"
                && message["content"]
                    .as_str()
                    .is_some_and(|s| s.contains("Use large print.")))
    );
    assert!(
        !request["messages"]
            .to_string()
            .contains("<send_user_message_question_reply>")
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
    let mut expired = answer.clone();
    expired["waitId"] = optional["waitId"].clone();
    expired["requestId"] = "late-optional".into();
    let late = ws_rpc(&mut second, 6, "_co.grida/session/answer-question", expired).await;
    assert_eq!(late["error"]["data"], "question_no_longer_answerable");
    let replayed = ws_rpc(&mut second, 5, "_co.grida/session/answer-question", answer).await;
    assert_eq!(replayed["result"], accepted["result"]);
    endpoint.done().await;
    drop(second);
    terminate_shared_server(second_host).await;
    check_reopened_reply(&state, workspace.path(), session, "Use large print.").await;
}

async fn run_with_questions(
    state: &Path,
    workspace: &Path,
    endpoint: &str,
    flag: &str,
) -> std::process::Output {
    let mut command = executable();
    command.arg("run");
    configured(&mut command, state, endpoint);
    command
        .arg("--cwd")
        .arg(workspace)
        .args([flag, "--prompt", "Prepare the document."]);
    timeout(WAIT, command.output()).await.unwrap().unwrap()
}

fn input_required_result(output: std::process::Output, version: u64) -> Value {
    assert_eq!(
        output.status.code(),
        Some(6),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result = records(&output.stdout);
    let [accepted, finished] = result.as_slice() else {
        panic!("expected an accepted and finished record: {result:?}");
    };
    assert_eq!(accepted["schema_version"], version);
    assert_eq!(accepted["kind"], "accepted");
    assert_eq!(finished["schema_version"], version);
    assert_eq!(finished["kind"], "finished");
    assert_eq!(finished["disposition"], "input_required");
    for id in ["session_id", "turn_id", "input_id"] {
        assert!(accepted[id].is_string());
        assert_eq!(finished[id], accepted[id]);
    }
    finished.clone()
}

fn assert_question_tools(request: &Value, field: &str) {
    let tools = request["tools"].as_array().unwrap();
    for name in ["question", "question_async"] {
        assert!(tools.iter().any(|tool| {
            tool["function"]["name"] == name
                && tool["function"]["parameters"]["required"] == json!([field])
        }));
    }
}

async fn load_waiting_turn(
    socket: &mut SharedSocket,
    workspace: &Path,
    session: &str,
    turn: &str,
) -> Value {
    let loaded = ws_rpc(
        socket,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let snapshot = session_snapshot(socket, session).await;
    assert_eq!(snapshot["current"]["turnId"], turn);
    assert_eq!(snapshot["current"]["disposition"], "suspended");
    assert_eq!(snapshot["current"]["inputNeeded"], true);
    snapshot
}

async fn assert_resumed_turn_settles(socket: &mut SharedSocket, session: &str, turn: &str) {
    let settled =
        wait_for_snapshot(socket, session, |snapshot| snapshot["current"].is_null()).await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "succeeded");
}

#[tokio::test]
async fn embedded_singleton_question_uses_v1_output_and_answers_over_v1_acp() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question"),
        Reply::Finished("Applied the print choice."),
    ])
    .await;
    let output = run_with_questions(&state, workspace.path(), &endpoint.url, "--questions").await;
    let result = input_required_result(output, 1);
    let question = &result["questions"][0];
    assert_eq!(
        result["questions"],
        json!([{
            "waitId":question["waitId"].as_str().unwrap(),
            "style":"answer_dependent",
            "question":"Which edition?",
            "options":["Screen", "Print"]
        }])
    );
    assert_question_tools(&endpoint.request().await, "question");

    let session = result["session_id"].as_str().unwrap();
    let turn = result["turn_id"].as_str().unwrap();
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
    assert!(
        inspected.status.success(),
        "{}",
        String::from_utf8_lossy(&inspected.stderr)
    );
    let saved = records(&inspected.stdout);
    assert_eq!(saved[0]["current"]["disposition"], "suspended");
    assert_eq!(saved[0]["input_needed"], true);

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = question_socket(&url, true).await;
    load_waiting_turn(&mut socket, workspace.path(), session, turn).await;
    let pending = question_list(&mut socket, session, turn).await;
    assert_eq!(pending["questions"], result["questions"]);
    answer_edition(&mut socket, session, turn).await;
    endpoint.request().await;
    assert_resumed_turn_settles(&mut socket, session, turn).await;
    endpoint.done().await;
    drop(socket);
    terminate_shared_server(host).await;
}

#[tokio::test]
async fn embedded_question_batch_uses_v2_output_and_answers_over_v2_acp() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("question", QUESTION_BATCH),
        Reply::Finished("Applied the answers."),
    ])
    .await;
    let output =
        run_with_questions(&state, workspace.path(), &endpoint.url, "--questions-v2").await;
    let result = input_required_result(output, 2);
    let batch = &result["questions"][0];
    assert_eq!(result["questions"].as_array().unwrap().len(), 1);
    assert_eq!(batch["style"], "answer_dependent");
    assert!(batch["waitId"].is_string());
    assert_question_tools(&endpoint.request().await, "questions");

    let session = result["session_id"].as_str().unwrap();
    let turn = result["turn_id"].as_str().unwrap();
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = question_socket_with_batches(&url, false, true).await;
    let snapshot = load_waiting_turn(&mut socket, workspace.path(), session, turn).await;
    let pending = batch_list(&mut socket, session, turn).await;
    assert_eq!(pending["questions"], result["questions"]);
    let accepted = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/answer-question-v2",
        batch_response(session, turn, &snapshot, &pending),
    )
    .await;
    assert_eq!(accepted["result"]["turnId"], turn, "{accepted}");
    endpoint.request().await;
    assert_resumed_turn_settles(&mut socket, session, turn).await;
    endpoint.done().await;
    drop(socket);
    terminate_shared_server(host).await;
}

#[tokio::test]
async fn embedded_optional_question_batch_allows_completion() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("question_async", QUESTION_BATCH),
        Reply::Finished("Applied the default."),
    ])
    .await;
    let output =
        run_with_questions(&state, workspace.path(), &endpoint.url, "--questions-v2").await;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result = records(&output.stdout);
    let finished = result.last().unwrap();
    assert_eq!(finished["schema_version"], 2);
    assert_eq!(finished["disposition"], "succeeded");
    assert!(finished.get("questions").is_none());
    endpoint.request().await;
    endpoint.request().await;
    endpoint.done().await;
}

#[tokio::test]
async fn embedded_run_rejects_conflicting_question_flags() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let mut command = executable();
    command.arg("run");
    configured(&mut command, &state, "http://127.0.0.1:1");
    command.args([
        "--questions",
        "--questions-v2",
        "--prompt",
        "Prepare the document.",
    ]);
    let output = timeout(WAIT, command.output()).await.unwrap().unwrap();
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(2), "{stderr}");
    assert!(stderr.contains("cannot be used with"), "{stderr}");
    assert!(stderr.contains("'--questions'"), "{stderr}");
    assert!(stderr.contains("--questions-v2"), "{stderr}");
    assert!(output.stdout.is_empty());
}

async fn batch_list(socket: &mut SharedSocket, session: &str, turn: &str) -> Value {
    let reply = ws_rpc(
        socket,
        40,
        "_co.grida/session/questions-v2",
        json!({"sessionId": session, "turnId": turn}),
    )
    .await;
    assert!(reply.get("error").is_none(), "{reply}");
    reply["result"].clone()
}

fn batch_response(session: &str, turn: &str, snapshot: &Value, pending: &Value) -> Value {
    let batch = &pending["questions"][0];
    assert_eq!(batch["questions"], {
        let request: Value = serde_json::from_str(QUESTION_BATCH).unwrap();
        // The pending projection normalizes omitted option lists to empty.
        let mut questions = request["questions"].clone();
        for index in [1, 2] {
            questions[index]["options"] = json!([]);
        }
        questions
    });
    json!({
        "sessionId":session, "turnId":turn, "requestId":"answer-batch",
        "expectedSessionRevision":snapshot["sessionRevision"],
        "expectedControlRevision":pending["controlRevision"],
        "expectedHistoryPosition":pending["historyPosition"],
        "waitId":batch["waitId"],
        "answers":[
            {"id":"title","answer":{"kind":"text","text":"The Atlas"}},
            {"id":"notes","answer":{"kind":"skipped"}},
            {"id":"edition","answer":{"kind":"choice","index":1}}
        ],
    })
}

#[tokio::test]
async fn negotiated_question_client_can_capture_singleton_tools_for_one_input() {
    let root = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = root.path().join("state");
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question"),
        Reply::Finished("Applied the singleton answer."),
        Reply::Tool("question", QUESTION_BATCH),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = question_socket_with_batches(&url, true, true).await;
    let created = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let mut submit = prompt_request(session, "older-view", "Prepare the document.");
    submit["_meta"] = json!({"co.grida/session/questions-v2": false});
    let started = ws_rpc(&mut socket, 3, "_co.grida/session/submit", submit).await;
    let turn = started["result"]["turnId"].as_str().unwrap();
    assert_question_tools(&endpoint.request().await, "question");
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    let pending = question_list(&mut socket, session, turn).await;
    assert_eq!(pending["questions"][0]["question"], "Which edition?");
    assert_eq!(batch_list(&mut socket, session, turn).await, pending);
    answer_edition(&mut socket, session, turn).await;
    endpoint.request().await;
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;

    let started = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/submit",
        prompt_request(session, "current-view", "Update the document."),
    )
    .await;
    let turn = started["result"]["turnId"].as_str().unwrap();
    assert_question_tools(&endpoint.request().await, "questions");
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    let pending = batch_list(&mut socket, session, turn).await;
    assert_eq!(
        pending["questions"][0]["questions"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    endpoint.done().await;
    drop(socket);
    terminate_shared_server(host).await;
}

#[tokio::test]
async fn required_question_batch_restarts_and_settles_atomically() {
    let root = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = root.path().join("state");
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("question", QUESTION_BATCH),
        Reply::Finished("Applied the answers."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut first = question_socket_with_batches(&url, false, true).await;
    let (session, turn) = start_question(&mut first, workspace.path()).await;
    let request = endpoint.request().await;
    assert!(request["tools"].as_array().unwrap().iter().any(|tool| {
        tool["function"]["name"] == "question"
            && tool["function"]["parameters"]["properties"]["questions"].is_object()
    }));
    wait_for_snapshot(&mut first, &session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    let pending = batch_list(&mut first, &session, &turn).await;
    assert_eq!(pending["questions"].as_array().unwrap().len(), 1);
    assert_eq!(pending["questions"][0]["style"], "answer_dependent");
    drop(first);
    terminate_shared_server(host).await;

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut second = question_socket_with_batches(&url, true, true).await;
    let loaded = ws_rpc(
        &mut second,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    assert_eq!(batch_list(&mut second, &session, &turn).await, pending);
    assert_eq!(
        question_list(&mut second, &session, &turn).await["questions"],
        json!([])
    );
    let snapshot = session_snapshot(&mut second, &session).await;
    let response = batch_response(&session, &turn, &snapshot, &pending);

    let mut incomplete = response.clone();
    incomplete["requestId"] = "incomplete-batch".into();
    incomplete["answers"].as_array_mut().unwrap().pop();
    let rejected = ws_rpc(
        &mut second,
        3,
        "_co.grida/session/answer-question-v2",
        incomplete,
    )
    .await;
    assert!(rejected.get("error").is_some(), "{rejected}");
    assert_eq!(batch_list(&mut second, &session, &turn).await, pending);
    assert!(endpoint.requests.try_recv().is_err());

    let accepted = ws_rpc(
        &mut second,
        4,
        "_co.grida/session/answer-question-v2",
        response.clone(),
    )
    .await;
    assert_eq!(accepted["result"]["turnId"], turn, "{accepted}");
    let request = endpoint.request().await;
    let result = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|message| message["role"] == "tool")
        .unwrap();
    let content: Value = serde_json::from_str(result["content"].as_str().unwrap()).unwrap();
    assert_eq!(
        content["structured"]["answers"],
        json!([
            {"id":"edition","answer":"Print"},
            {"id":"title","answer":"The Atlas"},
            {"id":"notes","answer":null},
        ])
    );
    let settled = wait_for_snapshot(&mut second, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "succeeded");
    assert_eq!(
        batch_list(&mut second, &session, &turn).await["questions"],
        json!([])
    );
    let replay = ws_rpc(
        &mut second,
        5,
        "_co.grida/session/answer-question-v2",
        response,
    )
    .await;
    assert_eq!(replay["result"], accepted["result"], "{replay}");
    endpoint.done().await;
    drop(second);
    terminate_shared_server(host).await;
    check_reopened_batch_reply(&state, workspace.path(), &session).await;
}

async fn check_reopened_batch_reply(state: &Path, workspace: &Path, session: &str) {
    use super::approvals::Stdio;
    const WINDOW: &str = "co.grida/session/transcript-window";
    let mut client = Stdio::from_child(spawn_serve(state, "http://127.0.0.1:1"));
    let mut capabilities = extension_initialize();
    capabilities["clientCapabilities"]["_meta"][WINDOW] = 1.into();
    client.request("initialize", capabilities).await;
    let mut load = json!({"sessionId":session,"cwd":workspace,"mcpServers":[],
        "_meta":{WINDOW:{"kind":"attach"}}});
    let attached = client.request("session/load", load.clone()).await;
    assert!(attached.get("error").is_none(), "{attached}");
    load["_meta"][WINDOW] = json!({"kind":"read","requestId":"batch-window"});
    let read = client.send("session/load", load).await;
    let mut accepted = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == read {
            assert!(frame.get("error").is_none(), "{frame}");
            break;
        }
        let params = &frame["params"];
        if let Some(replies) = params["_meta"][WINDOW].get("questionReplies") {
            assert_eq!(params["update"]["sessionUpdate"], "user_message_chunk");
            let fallback = params["update"]["content"]["text"].as_str().unwrap();
            assert!(fallback.contains("Question: Which edition?\nAnswer: Print"));
            assert!(!fallback.contains("send_user_message_question_reply"));
            accepted.push(replies.clone());
        }
    }
    let [replies] = accepted.as_slice() else {
        panic!("Expected one accepted contribution, received {accepted:?}");
    };
    let wait = &replies[0]["waitId"];
    assert!(wait.as_str().unwrap().starts_with("question/"));
    assert_eq!(
        replies,
        &json!([
            {"waitId":wait,"id":"edition","question":"Which edition?","answer":"Print"},
            {"waitId":wait,"id":"title","question":"What title should we use?","answer":"The Atlas"},
            {"waitId":wait,"id":"notes","question":"Any other notes?","answer":"The user skipped this question.","skipped":true},
        ])
    );
    client.close().await;
}

#[tokio::test]
async fn optional_question_batch_reaches_the_next_decision_during_work() {
    use super::approvals::Stdio;
    const LIVE: &str = "co.grida/session/updates";

    let root = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = root.path().join("state");
    let (release, blocked) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("question_async", QUESTION_BATCH),
        Reply::Release("Independent work is complete.", blocked),
        Reply::Finished("Applied the answers."),
    ])
    .await;
    let mut client = Stdio::from_child(spawn_serve(&state, &endpoint.url));
    let mut capabilities = extension_initialize();
    for capability in [
        LIVE,
        "co.grida/session/questions-v2",
        "co.grida/session/answer-question-v2",
    ] {
        capabilities["clientCapabilities"]["_meta"][capability] = 1.into();
    }
    client.request("initialize", capabilities).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let submitted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(session, "optional-batch", "Prepare the document."),
        )
        .await;
    let turn = submitted["result"]["turnId"].as_str().unwrap().to_owned();
    endpoint.request().await;
    endpoint.request().await;
    let pending = client
        .request(
            "_co.grida/session/questions-v2",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    assert_eq!(pending["result"]["questions"][0]["style"], "nonblocking");
    let snapshot = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert_eq!(snapshot["result"]["current"]["disposition"], "running");
    let response = batch_response(session, &turn, &snapshot["result"], &pending["result"]);
    let receipt = client
        .send("_co.grida/session/answer-question-v2", response)
        .await;
    let mut ack = false;
    let mut live = false;
    while !ack || !live {
        let frame = client.read_frame().await;
        if frame["id"] == receipt {
            assert_eq!(frame["result"]["turnId"], turn, "{frame}");
            ack = true;
        } else if let Some(replies) = frame["params"]["_meta"][LIVE].get("questionReplies") {
            assert!(!live, "{frame}");
            assert_eq!(
                frame["params"]["update"]["sessionUpdate"],
                "user_message_chunk"
            );
            assert_eq!(frame["params"]["_meta"][LIVE]["turnId"], turn);
            assert_eq!(replies[0]["answer"], "Print");
            assert_eq!(replies[1]["answer"], "The Atlas");
            assert_eq!(replies[2]["skipped"], true);
            live = true;
        }
    }
    let pending = client
        .request(
            "_co.grida/session/questions-v2",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    assert_eq!(pending["result"]["questions"], json!([]));
    release.send(()).unwrap();

    let request = endpoint.request().await;
    let last = request["messages"].as_array().unwrap().last().unwrap();
    assert_eq!(last["role"], "user");
    let body = last["content"]
        .as_str()
        .unwrap()
        .strip_prefix("<send_user_message_question_reply>")
        .unwrap()
        .strip_suffix("</send_user_message_question_reply>")
        .unwrap();
    let replies: Value = serde_json::from_str(body).unwrap();
    assert_eq!(replies[0]["questionId"], "edition");
    assert_eq!(replies[0]["answer"], "Print");
    assert_eq!(replies[1]["questionId"], "title");
    assert_eq!(replies[1]["answer"], "The Atlas");
    assert_eq!(replies[2]["questionId"], "notes");
    assert_eq!(replies[2]["skipped"], true);
    let settled = timeout(WAIT, async {
        loop {
            let observed = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            if observed["result"]["current"].is_null() {
                break observed;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(settled["result"]["latest"]["turnId"], turn);
    assert_eq!(settled["result"]["latest"]["epoch"], 1);
    endpoint.done().await;
    client.close().await;
    check_reopened_batch_reply(&state, workspace.path(), session).await;
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
    let state = temporary.path().join("agent-state");
    let (host, url) = shared_server(&state, &endpoint.url).await;
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
    let body = last["content"]
        .as_str()
        .unwrap()
        .strip_prefix("<send_user_message_question_reply>")
        .unwrap()
        .strip_suffix("</send_user_message_question_reply>")
        .unwrap();
    let reply: Value = serde_json::from_str(body).unwrap();
    assert!(
        reply[0]["questionItemId"]
            .as_str()
            .unwrap()
            .starts_with("question/")
    );
    assert_eq!(reply[0]["question"], "Which edition?");
    assert_eq!(reply[0]["answer"], "Print");
    let settled = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["epoch"], 1);
    endpoint.done().await;
    drop(socket);
    terminate_shared_server(host).await;
    check_reopened_reply(&state, workspace.path(), &session, "Print").await;
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
            llama_cpp_input_count: false,
            max_output_tokens: 1024,
            reasoning: Default::default(),
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
            question_batches: false,
            operating_regime: None,
            effort: None,
            reasoning: Default::default(),
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
