use super::*;

#[tokio::test]
async fn queue_edits_keep_receipts_and_only_advance_after_stop_is_released() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("Working."),
        Reply::Finished("Third first."),
        Reply::Finished("Replacement second."),
    ])
    .await;
    let (child, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = initialized_shared_socket(&url).await;
    let created = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let started = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        prompt_request(session, "first", "First"),
    )
    .await;
    assert_eq!(started["result"]["disposition"], "claimed");
    endpoint.request().await;

    for (id, label) in [(4, "a"), (5, "b"), (6, "c")] {
        let queued = ws_rpc(
            &mut socket,
            id,
            "_co.grida/session/enqueue",
            prompt_request(session, label, label),
        )
        .await;
        assert_eq!(queued["result"]["disposition"], "queued");
    }
    let snapshot = session_snapshot(&mut socket, session).await;
    assert_eq!(queue_ids(&snapshot), ["a", "b", "c"]);
    assert_eq!(snapshot["queue"][1]["settings"]["model"], "fixture-model");
    let edit = json!({
        "queue":queue_basis(&snapshot, session, "edit-b"),
        "inputId":"b","replacementInputId":"b2",
        "prompt":[{"type":"text","text":"edited b"}],
    });
    let replaced = ws_rpc(&mut socket, 8, "_co.grida/session/replace", edit.clone()).await;
    assert_eq!(replaced["result"]["requestId"], "edit-b", "{replaced}");
    let replayed = ws_rpc(&mut socket, 9, "_co.grida/session/replace", edit).await;
    assert_eq!(replayed["result"], replaced["result"]);
    let original = ws_rpc(
        &mut socket,
        10,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":"b"}),
    )
    .await;
    assert_eq!(original["result"]["receipt"]["replacementInputId"], "b2");
    assert_eq!(original["result"]["receipt"]["disposition"], "superseded");
    let replacement = ws_rpc(
        &mut socket,
        11,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":"b2"}),
    )
    .await;
    assert_eq!(replacement["result"]["prompt"][0]["text"], "edited b");

    let snapshot = session_snapshot(&mut socket, session).await;
    assert_eq!(queue_ids(&snapshot), ["a", "b2", "c"]);
    let reordered = ws_rpc(
        &mut socket,
        12,
        "_co.grida/session/reorder",
        json!({"queue":queue_basis(&snapshot,session,"reorder"),"inputIds":["c","b2","a"]}),
    )
    .await;
    assert_eq!(reordered["result"]["requestId"], "reorder", "{reordered}");
    let snapshot = session_snapshot(&mut socket, session).await;
    assert_eq!(queue_ids(&snapshot), ["c", "b2", "a"]);
    let removed = ws_rpc(
        &mut socket,
        13,
        "_co.grida/session/withdraw",
        json!({"queue":queue_basis(&snapshot,session,"withdraw-a"),"inputId":"a"}),
    )
    .await;
    assert_eq!(removed["result"]["requestId"], "withdraw-a", "{removed}");
    let retained = ws_rpc(
        &mut socket,
        14,
        "_co.grida/session/enqueue",
        prompt_request(session, "a", "a"),
    )
    .await;
    assert_eq!(retained["result"]["disposition"], "withdrawn");

    let snapshot = session_snapshot(&mut socket, session).await;
    assert_eq!(queue_ids(&snapshot), ["c", "b2"]);
    let stopped = ws_rpc(
        &mut socket,
        15,
        "_co.grida/session/stop",
        task_basis(&snapshot, session, "stop-first"),
    )
    .await;
    assert_eq!(stopped["result"]["requestId"], "stop-first", "{stopped}");
    let stopped = wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(stopped["latest"]["status"], "cancelled");
    assert_eq!(stopped["admissionPaused"], true);
    assert_eq!(queue_ids(&stopped), ["c", "b2"]);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    let resumed = ws_rpc(
        &mut socket,
        16,
        "_co.grida/session/resume-queue",
        queue_basis(&stopped, session, "release-queue"),
    )
    .await;
    assert_eq!(resumed["result"]["requestId"], "release-queue", "{resumed}");
    assert_eq!(
        endpoint.request().await["messages"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()["content"],
        "c"
    );
    assert_eq!(
        endpoint.request().await["messages"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()["content"],
        "edited b"
    );
    let settled = wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null() && snapshot["queue"].as_array().is_some_and(Vec::is_empty)
    })
    .await;
    assert_eq!(settled["latest"]["status"], "succeeded");
    endpoint.done().await;
    drop(socket);
    terminate_shared_server(child).await;
}

#[tokio::test]
async fn paused_task_resumes_after_restart_with_retained_input_and_steering() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let (release, held_reply) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("Before pause."),
        Reply::Release("Applied the correction.", held_reply),
    ])
    .await;
    let (first_host, url) = shared_server(&state, &endpoint.url).await;
    let mut first = initialized_shared_socket(&url).await;
    let created = ws_rpc(
        &mut first,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    wait_for_partial_prompt(&mut first, session).await;
    endpoint.request().await;
    let current = session_snapshot(&mut first, session).await;
    let turn = current["current"]["turnId"].as_str().unwrap();
    let pause = task_basis(&current, session, "pause-initial");
    let paused = ws_rpc(&mut first, 4, "_co.grida/session/pause", pause.clone()).await;
    assert_eq!(paused["result"]["turnId"], turn, "{paused}");
    let paused = wait_for_snapshot(&mut first, session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    assert_eq!(paused["current"]["paused"], true);
    assert_eq!(paused["current"]["turnId"], turn);
    drop(first);
    terminate_shared_server(first_host).await;

    let (second_host, url) = shared_server(&state, &endpoint.url).await;
    let mut second = initialized_shared_socket(&url).await;
    let loaded = ws_rpc(
        &mut second,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let current = session_snapshot(&mut second, session).await;
    assert_eq!(current["current"], paused["current"]);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    let steer = json!({
        "task":task_basis(&current,session,"correct-initial"),
        "expectedHistoryPosition":current["current"]["historyPosition"],
        "prompt":[{"type":"text","text":"Apply this correction"}],
    });
    let corrected = ws_rpc(&mut second, 3, "_co.grida/session/steer", steer.clone()).await;
    assert_eq!(corrected["result"]["turnId"], turn, "{corrected}");
    let replayed = ws_rpc(&mut second, 4, "_co.grida/session/steer", steer).await;
    assert_eq!(replayed["result"], corrected["result"]);
    let current = session_snapshot(&mut second, session).await;
    assert_eq!(current["current"]["paused"], true);
    let resume = json!({
        "task":task_basis(&current,session,"resume-initial"),
        "expectedEpoch":current["current"]["epoch"],
        "expectedJournalPosition":current["current"]["journalPosition"],
    });
    let resumed = ws_rpc(&mut second, 5, "_co.grida/session/resume", resume.clone()).await;
    assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
    assert_eq!(resumed["result"]["turn"]["epoch"], 2);
    let retry = ws_rpc(&mut second, 6, "_co.grida/session/resume", resume).await;
    assert_eq!(retry["result"]["turn"]["turnId"], turn, "{retry}");
    assert_eq!(retry["result"]["turn"]["epoch"], 2);
    assert_eq!(retry["result"]["turn"]["disposition"], "running");
    let request = endpoint.request().await;
    assert_eq!(
        request["messages"].as_array().unwrap().last().unwrap()["content"],
        "Apply this correction"
    );
    assert!(
        request["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| message["role"] == "assistant" && message["content"] == "Before pause.")
    );
    release.send(()).unwrap();
    let settled = wait_for_snapshot(&mut second, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["turnId"], turn);
    assert_eq!(settled["latest"]["status"], "succeeded");
    endpoint.done().await;
    drop(second);
    terminate_shared_server(second_host).await;
}

async fn wait_for_partial_prompt(socket: &mut SharedSocket, session: &str) {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    timeout(WAIT, async {
        let request = json!({
            "jsonrpc":"2.0","id":3,"method":"session/prompt",
            "params":{"sessionId":session,"prompt":[{"type":"text","text":"Initial request"}]},
        });
        socket
            .send(Message::Text(request.to_string().into()))
            .await
            .unwrap();
        loop {
            let frame = socket.next().await.unwrap().unwrap();
            if let Message::Text(line) = frame {
                let update: Value = serde_json::from_str(line.as_str()).unwrap();
                if update["params"]["update"]["sessionUpdate"] == "agent_message_chunk" {
                    assert_eq!(
                        update["params"]["update"]["content"]["text"],
                        "Before pause."
                    );
                    return;
                }
                assert_ne!(update["id"], 3, "{update}");
            }
        }
    })
    .await
    .unwrap();
}

async fn initialized_shared_socket(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let initialized = ws_rpc(&mut socket, 1, "initialize", extension_initialize()).await;
    assert_eq!(initialized["result"]["protocolVersion"], 1);
    socket
}

pub(super) async fn terminate_shared_server(mut child: Child) {
    let signal = Command::new("kill")
        .args(["-TERM", &child.id().unwrap().to_string()])
        .status()
        .await
        .unwrap();
    assert!(signal.success());
    assert_eq!(
        timeout(WAIT, child.wait()).await.unwrap().unwrap().code(),
        Some(130)
    );
}

pub(super) async fn session_snapshot(socket: &mut SharedSocket, session: &str) -> Value {
    let response = ws_rpc(
        socket,
        1000,
        "_co.grida/session/snapshot",
        json!({"sessionId":session}),
    )
    .await;
    response
        .get("result")
        .unwrap_or_else(|| panic!("{response}"))
        .clone()
}

pub(super) async fn wait_for_snapshot(
    socket: &mut SharedSocket,
    session: &str,
    done: impl Fn(&Value) -> bool,
) -> Value {
    timeout(WAIT, async {
        loop {
            let snapshot = session_snapshot(socket, session).await;
            if done(&snapshot) {
                return snapshot;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

fn queue_ids(snapshot: &Value) -> Vec<&str> {
    snapshot["queue"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["inputId"].as_str().unwrap())
        .collect()
}

fn queue_basis(snapshot: &Value, session: &str, request: &str) -> Value {
    json!({
        "sessionId":session,"requestId":request,
        "expectedSessionRevision":snapshot["sessionRevision"],
    })
}

pub(super) fn task_basis(snapshot: &Value, session: &str, request: &str) -> Value {
    json!({
        "sessionId":session,"requestId":request,
        "turnId":snapshot["current"]["turnId"],
        "expectedSessionRevision":snapshot["sessionRevision"],
        "expectedControlRevision":snapshot["current"]["controlRevision"],
    })
}

pub(super) fn prompt_request(session: &str, input: &str, text: &str) -> Value {
    json!({
        "sessionId":session,"inputId":input,
        "prompt":[{"type":"text","text":text}],
    })
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn changed_provider_credential_cannot_resume_a_paused_input() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("Working."),
        Reply::Finished("Unexpected dispatch."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut first = initialized_shared_socket(&url).await;
    let created = ws_rpc(
        &mut first,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let started = ws_rpc(
        &mut first,
        3,
        "_co.grida/session/submit",
        prompt_request(session, "held", "Working"),
    )
    .await;
    assert_eq!(started["result"]["disposition"], "claimed");
    endpoint.request().await;
    let snapshot = session_snapshot(&mut first, session).await;
    let pause = ws_rpc(
        &mut first,
        4,
        "_co.grida/session/pause",
        task_basis(&snapshot, session, "pause-for-rotation"),
    )
    .await;
    assert!(pause.get("result").is_some(), "{pause}");
    let paused = wait_for_snapshot(&mut first, session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    drop(first);
    terminate_shared_server(host).await;

    let (host, url) =
        shared_server_with_credential(&state, &endpoint.url, "rotated-fixture-key").await;
    let mut second = initialized_shared_socket(&url).await;
    let loaded = ws_rpc(
        &mut second,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let denied = ws_rpc(
        &mut second,
        3,
        "_co.grida/session/resume",
        json!({
            "task":task_basis(&paused,session,"resume-after-rotation"),
            "expectedEpoch":paused["current"]["epoch"],
            "expectedJournalPosition":paused["current"]["journalPosition"],
        }),
    )
    .await;
    assert_eq!(
        denied["error"]["data"], "retained_authority_changed",
        "{denied}"
    );
    assert_eq!(
        session_snapshot(&mut second, session).await["current"],
        paused["current"]
    );
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));

    let stopped = ws_rpc(
        &mut second,
        4,
        "_co.grida/session/stop",
        task_basis(&paused, session, "stop-with-rotated-key"),
    )
    .await;
    assert!(stopped.get("result").is_some(), "{stopped}");
    let stopped = wait_for_snapshot(&mut second, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(stopped["latest"]["status"], "cancelled");
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    endpoint.task.abort();
    let _ = endpoint.task.await;
    drop(second);
    terminate_shared_server(host).await;
}

#[tokio::test]
async fn freed_provider_slot_wakes_the_queue_in_another_session() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut replies = (0..8).map(|_| Reply::Hold("Working.")).collect::<Vec<_>>();
    replies.push(Reply::Finished("Queued work completed."));
    let mut endpoint = Endpoint::start(replies).await;
    let (child, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = initialized_shared_socket(&url).await;
    let mut sessions = Vec::new();
    for id in 0..9 {
        let created = ws_rpc(
            &mut socket,
            2 + id,
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
        let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
        if id < 8 {
            let started = ws_rpc(
                &mut socket,
                20 + id,
                "_co.grida/session/submit",
                prompt_request(&session, "held", "Occupy a provider slot"),
            )
            .await;
            assert_eq!(started["result"]["disposition"], "claimed", "{started}");
        }
        sessions.push(session);
    }
    for _ in 0..8 {
        endpoint.request().await;
    }
    let waiting = sessions.last().unwrap();
    let queued = ws_rpc(
        &mut socket,
        30,
        "_co.grida/session/enqueue",
        prompt_request(waiting, "ninth", "Queue in another session"),
    )
    .await;
    assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
    let snapshot = session_snapshot(&mut socket, waiting).await;
    assert!(snapshot["current"].is_null());
    assert_eq!(queue_ids(&snapshot), ["ninth"]);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));

    let first = &sessions[0];
    let snapshot = session_snapshot(&mut socket, first).await;
    let stopped = ws_rpc(
        &mut socket,
        31,
        "_co.grida/session/stop",
        task_basis(&snapshot, first, "free-first-slot"),
    )
    .await;
    assert!(stopped.get("result").is_some(), "{stopped}");
    let request = endpoint.request().await;
    assert_eq!(
        request["messages"].as_array().unwrap().last().unwrap()["content"],
        "Queue in another session"
    );
    let settled = wait_for_snapshot(&mut socket, waiting, |snapshot| {
        snapshot["current"].is_null() && snapshot["queue"].as_array().is_some_and(Vec::is_empty)
    })
    .await;
    assert_eq!(settled["latest"]["status"], "succeeded");
    drop(socket);
    terminate_shared_server(child).await;
    endpoint.done().await;
}
