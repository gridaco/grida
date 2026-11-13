//! GRIDA-SEC-004 coverage for retained history access and authority.

use super::lifecycle::{
    prompt_request, session_snapshot, task_basis, terminate_shared_server, wait_for_partial_prompt,
    wait_for_snapshot,
};
use super::*;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

async fn client(url: &str, history: bool) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut capabilities = extension_initialize();
    let meta = capabilities["clientCapabilities"]["_meta"]
        .as_object_mut()
        .unwrap();
    if history {
        meta.insert("co.grida/session/revision-target".into(), 1.into());
    } else {
        for suffix in ["history", "fork", "revise"] {
            meta.remove(&format!("co.grida/session/{suffix}"));
        }
    }
    let response = ws_rpc(&mut socket, 1, "initialize", capabilities).await;
    for suffix in ["history", "fork", "revise", "revision-target"] {
        assert_eq!(
            response["result"]["agentCapabilities"]["_meta"][format!("co.grida/session/{suffix}")],
            1
        );
    }
    socket
}

async fn create(socket: &mut SharedSocket, cwd: &Path) -> String {
    let response = ws_rpc(socket, 2, "session/new", json!({"cwd":cwd,"mcpServers":[]})).await;
    response["result"]["sessionId"].as_str().unwrap().into()
}

async fn page(socket: &mut SharedSocket, session: &str, view: Option<Value>) -> Value {
    let response = ws_rpc(
        socket,
        200,
        "_co.grida/session/history",
        json!({"sessionId":session,"view":view}),
    )
    .await;
    response
        .get("result")
        .unwrap_or_else(|| panic!("{response}"))
        .clone()
}

async fn revision_target(
    socket: &mut SharedSocket,
    session: &str,
    page: &Value,
    message: usize,
) -> Value {
    ws_rpc(
        socket,
        201,
        "_co.grida/session/revision-target",
        json!({
            "sessionId":session,
            "expectedSessionRevision":page["sessionRevision"],
            "messageId":page["messages"][message]["anchor"]["message"],
        }),
    )
    .await
}

fn previews(page: &Value) -> Vec<&str> {
    page["messages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|message| message["preview"].as_str().unwrap())
        .collect()
}

async fn load_transcript(socket: &mut SharedSocket, session: &str, cwd: &Path) -> Vec<String> {
    timeout(WAIT, async {
        let id = 500;
        let request = json!({"jsonrpc":"2.0","id":id,"method":"session/load",
            "params":{"sessionId":session,"cwd":cwd,"mcpServers":[]}});
        socket
            .send(Message::Text(request.to_string().into()))
            .await
            .unwrap();
        let mut messages = Vec::new();
        loop {
            let frame = socket.next().await.unwrap().unwrap();
            let Message::Text(line) = frame else { continue };
            let value: Value = serde_json::from_str(line.as_str()).unwrap();
            if value["id"] == id {
                assert!(value.get("result").is_some(), "{value}");
                return messages;
            }
            if value["method"] == "session/update"
                && value["params"]["sessionId"] == session
                && let Some(text) = value["params"]["update"]["content"]["text"].as_str()
            {
                messages.push(text.to_owned());
            }
        }
    })
    .await
    .unwrap()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn transcript_windows_require_opt_in_and_keep_standard_replay() {
    use super::approvals::{Fixture, Stdio as PrivateStdio};

    const CAPABILITY: &str = "co.grida/session/transcript-window";
    let temporary = TempDir::new().unwrap();
    let fixture = Fixture::new(false);
    std::fs::write(fixture.primary.join("note.txt"), "fixture note").unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", r#"{"path":"note.txt"}"#),
        Reply::Finished("Settled answer"),
    ])
    .await;
    let serve = |endpoint: &str| {
        fixture
            .process(endpoint, "serve")
            .arg("--stdio")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap()
    };
    let workspace = fixture.primary.clone();
    let mut plain = PrivateStdio::from_child(serve(&endpoint.url));
    let ready = plain.request("initialize", extension_initialize()).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][CAPABILITY], 1);
    let created = plain
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = &created["result"]["sessionId"];
    let prompt = plain
        .request(
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":"Saved question"}]}),
        )
        .await;
    assert_eq!(prompt["result"]["stopReason"], "end_turn", "{prompt}");
    endpoint.request().await;
    endpoint.request().await;
    let mut load = json!({"sessionId":session,"cwd":workspace,"mcpServers":[]});
    let attach = json!({CAPABILITY:{"kind":"attach"}});
    let read = json!({CAPABILITY:{"kind":"read","requestId":"page-1"}});
    load["_meta"] = attach.clone();
    let denied = plain.request("session/load", load.clone()).await;
    assert_eq!(
        denied["error"]["data"],
        "transcript_window_capability_required"
    );
    plain.close().await;

    let mut observer = PrivateStdio::from_child(serve(&endpoint.url));
    let mut capabilities = extension_initialize();
    capabilities["clientCapabilities"]["_meta"][CAPABILITY] = 1.into();
    let ready = observer.request("initialize", capabilities).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][CAPABILITY], 1);
    load["_meta"] = read.clone();
    let denied = observer.request("session/load", load.clone()).await;
    assert_eq!(denied["error"]["data"], "session_setup_required");
    load["_meta"] = attach;
    let mut wrong = load.clone();
    wrong["cwd"] = json!(temporary.path());
    let denied = observer.request("session/load", wrong).await;
    assert_eq!(denied["error"]["data"], "session_workspace_mismatch");
    let id = observer.send("session/load", load.clone()).await;
    loop {
        let frame = observer.read_frame().await;
        if frame["id"] == id {
            assert!(frame.get("result").is_some(), "{frame}");
            break;
        }
        assert_ne!(
            frame["params"]["update"]["sessionUpdate"],
            "user_message_chunk"
        );
        assert_ne!(
            frame["params"]["update"]["sessionUpdate"],
            "agent_message_chunk"
        );
    }

    for correlated in [true, false] {
        if correlated {
            load["_meta"] = read.clone();
        } else {
            load.as_object_mut().unwrap().remove("_meta");
        }
        let id = observer.send("session/load", load.clone()).await;
        let mut messages = Vec::new();
        let mut activity = Vec::new();
        let mut turn = None;
        loop {
            let frame = observer.read_frame().await;
            if frame["id"] == id {
                assert!(frame.get("result").is_some(), "{frame}");
                if correlated {
                    let receipt = &frame["result"]["_meta"][CAPABILITY];
                    assert_eq!(receipt["requestId"], "page-1", "{frame}");
                    assert!(receipt["view"].is_u64());
                    assert_eq!(receipt.get("older"), Some(&Value::Null));
                    // The window names each contributing turn with its
                    // outcome and recorded wall-clock interval.
                    let turns = receipt["turns"].as_array().unwrap();
                    assert_eq!(turns.len(), 1, "{receipt}");
                    assert_eq!(Some(&turns[0]["turnId"]), turn.as_ref());
                    assert_eq!(turns[0]["status"], "succeeded");
                    let started = turns[0]["startedAtMs"].as_u64().unwrap();
                    assert!(started <= turns[0]["settledAtMs"].as_u64().unwrap());
                    assert!(turns[0].get("goalStart").is_none(), "{receipt}");
                }
                break;
            }
            let params = &frame["params"];
            let meta = &params["_meta"][CAPABILITY];
            if params["update"]["sessionUpdate"] == "tool_call" {
                assert!(correlated, "standard replay stays text-only: {frame}");
                assert_eq!(params["update"]["title"], "read_file");
                assert_eq!(params["update"]["kind"], "read");
                assert_eq!(params["update"]["status"], "completed");
                assert_eq!(meta["outcome"], "succeeded");
                assert_eq!(meta["activity"], "read");
                assert_eq!(Some(&meta["turnId"]), turn.as_ref());
                // The call carries its arguments and result for its card.
                assert_eq!(params["update"]["rawInput"]["path"], "note.txt", "{frame}");
                assert!(
                    params["update"]["rawOutput"]["text"]
                        .as_str()
                        .is_some_and(|text| text.contains("fixture note")),
                    "{frame}"
                );
                activity.push(meta["messageId"].clone());
            }
            if let Some(text) = params["update"]["content"]["text"].as_str() {
                assert_eq!(frame["method"], "session/update");
                assert_eq!(params["sessionId"], *session);
                assert_eq!(meta["requestId"].as_str(), correlated.then_some("page-1"),);
                if correlated {
                    assert!(meta["turnId"].is_string(), "{frame}");
                    turn.get_or_insert_with(|| meta["turnId"].clone());
                    assert_eq!(Some(&meta["turnId"]), turn.as_ref());
                    let expected = (text == "Settled answer").then_some("answer");
                    assert_eq!(
                        meta["phase"].as_str(),
                        expected.or((params["update"]["sessionUpdate"] == "agent_message_chunk")
                            .then_some("progress"))
                    );
                }
                messages.push(text.to_owned());
            }
        }
        assert_eq!(messages, ["Saved question", "Settled answer"]);
        assert_eq!(activity.len(), usize::from(correlated));
    }
    assert!(endpoint.requests.try_recv().is_err());
    observer.close().await;
}

async fn after_owner_release(
    socket: &mut SharedSocket,
    id: u64,
    method: &str,
    params: Value,
    busy: &str,
) -> Value {
    timeout(WAIT, async {
        loop {
            let response = ws_rpc(socket, id, method, params.clone()).await;
            if response["error"]["data"] != busy {
                return response;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn a_fork_captures_committed_live_history_without_starting_or_stopping_work() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("Before pause."),
        Reply::Finished("Independent result."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url, true).await;
    let source = create(&mut socket, workspace.path()).await;
    let mut plain = client(&url, false).await;
    load_transcript(&mut plain, &source, workspace.path()).await;
    let unsupported = ws_rpc(
        &mut plain,
        4,
        "_co.grida/session/history",
        json!({"sessionId":source}),
    )
    .await;
    assert_eq!(unsupported["error"]["code"], -32601);
    drop(plain);

    wait_for_partial_prompt(&mut socket, &source).await;
    endpoint.request().await;
    let before = page(&mut socket, &source, None).await;
    assert_eq!(previews(&before), ["Initial request"]);
    assert_eq!(before["latestAnchor"], before["messages"][0]["anchor"]);
    let fork = json!({
        "sessionId":source,"requestId":"fork-live","expectedHistory":before["basis"],
        "anchor":before["latestAnchor"],
    });
    let created = ws_rpc(&mut socket, 4, "_co.grida/session/fork", fork.clone()).await;
    let destination = created["result"]["sessionId"]
        .as_str()
        .unwrap_or_else(|| panic!("{created}"))
        .to_owned();
    assert_ne!(destination, source);
    assert_eq!(
        session_snapshot(&mut socket, &source).await["current"]["disposition"],
        "running"
    );
    let unattached = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/history",
        json!({"sessionId":destination}),
    )
    .await;
    assert_eq!(unattached["error"]["data"], "session_setup_required");
    let wrong_workspace = ws_rpc(
        &mut socket,
        6,
        "session/load",
        json!({"sessionId":destination,"cwd":temporary.path(),"mcpServers":[]}),
    )
    .await;
    assert_eq!(
        wrong_workspace["error"]["data"],
        "session_workspace_mismatch"
    );
    assert_eq!(
        load_transcript(&mut socket, &destination, workspace.path()).await,
        ["Initial request"]
    );
    let child = page(&mut socket, &destination, None).await;
    assert_eq!(previews(&child), ["Initial request"]);
    assert_eq!(child["messages"][0]["anchor"]["kind"], "inherited");
    assert_eq!(child["seed"]["source"]["session"], source);
    let snapshot = session_snapshot(&mut socket, &destination).await;
    assert!(snapshot["current"].is_null() && snapshot["latest"].is_null());
    assert_eq!(snapshot["queuedInputs"], 0);
    assert!(endpoint.requests.try_recv().is_err());

    let current = session_snapshot(&mut socket, &source).await;
    let steered = ws_rpc(
        &mut socket,
        7,
        "_co.grida/session/steer",
        json!({
            "task":task_basis(&current,&source,"correct-running"),
            "expectedHistoryPosition":current["current"]["historyPosition"],
            "prompt":[{"type":"text","text":"Correction after partial answer"}],
        }),
    )
    .await;
    assert!(steered.get("result").is_some(), "{steered}");
    let old_page = ws_rpc(
        &mut socket,
        8,
        "_co.grida/session/history",
        json!({
            "sessionId":source,"offset":1,"expectedHistory":before["basis"],
        }),
    )
    .await;
    assert_eq!(old_page["error"]["data"], "history_basis_changed");
    let mut stale = fork.clone();
    stale["requestId"] = "new-id-stale-basis".into();
    let denied = ws_rpc(&mut socket, 9, "_co.grida/session/fork", stale).await;
    assert_eq!(denied["error"]["data"], "history_basis_changed");

    let current = session_snapshot(&mut socket, &source).await;
    let stopped = ws_rpc(
        &mut socket,
        10,
        "_co.grida/session/stop",
        task_basis(&current, &source, "stop-source"),
    )
    .await;
    assert!(stopped.get("result").is_some(), "{stopped}");
    wait_for_snapshot(&mut socket, &source, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    let mut observer = client(&url, true).await;
    let transcript = load_transcript(&mut observer, &source, workspace.path()).await;
    drop(observer);
    let source_page = page(&mut socket, &source, None).await;
    assert_eq!(transcript, previews(&source_page));
    assert_eq!(
        transcript,
        [
            "Initial request",
            "Before pause.",
            "Correction after partial answer"
        ]
    );
    let destination_page = page(&mut socket, &destination, None).await;
    assert_eq!(previews(&destination_page), ["Initial request"]);
    let inherited = revision_target(&mut socket, &destination, &destination_page, 0).await;
    assert_eq!(
        inherited["error"]["data"],
        "history_revision_target_unavailable"
    );

    drop(socket);
    terminate_shared_server(host).await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url, true).await;
    load_transcript(&mut socket, &source, workspace.path()).await;
    let retried = ws_rpc(&mut socket, 11, "_co.grida/session/fork", fork).await;
    assert_eq!(retried["result"], created["result"]);
    load_transcript(&mut socket, &destination, workspace.path()).await;
    let started = ws_rpc(
        &mut socket,
        12,
        "_co.grida/session/submit",
        prompt_request(&destination, "child-input", "Continue in fork"),
    )
    .await;
    assert!(started.get("result").is_some(), "{started}");
    let request = endpoint.request().await;
    let conversation = request["messages"].as_array().unwrap();
    assert_eq!(
        conversation[conversation.len() - 2]["content"],
        "Initial request"
    );
    assert_eq!(conversation.last().unwrap()["content"], "Continue in fork");
    assert!(
        !request
            .to_string()
            .contains("Correction after partial answer")
    );
    wait_for_snapshot(&mut socket, &destination, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn an_earlier_revision_retains_original_view_and_captures_fresh_permissions() {
    use agent_kit_core::{ChangeId, SessionId};
    use agent_kit_sessions::{SessionStore, Submission};
    use agent_kit_store_sqlite::SqliteStore;

    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("config_inspect", "{}"),
        Reply::Finished("First answer"),
        Reply::Finished("Second answer"),
        Reply::Finished("Third answer"),
        Reply::Finished("Replacement answer"),
        Reply::Finished("Explicitly resumed queued work."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url, true).await;
    let session = create(&mut socket, workspace.path()).await;
    let original = "Second input with the complete original wording. ".repeat(16);
    for (id, text) in [
        (3, "First input"),
        (4, original.as_str()),
        (5, "Third input"),
    ] {
        if id < 5 {
            let mut request =
                prompt_request(&session, if id == 3 { "first" } else { "second" }, text);
            request["allowConfigurationChanges"] = (id == 4).into();
            let started = after_owner_release(
                &mut socket,
                id,
                "_co.grida/session/submit",
                request,
                "session_prompt_in_progress",
            )
            .await;
            assert!(started.get("result").is_some(), "{started}");
            let generation = endpoint.request().await;
            assert_eq!(
                generation["tools"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|tool| tool["function"]["name"] == "config_update"),
                id == 4,
            );
            if id == 3 {
                let with_result = endpoint.request().await;
                assert!(with_result.to_string().contains("Maximum context input"));
            }
            wait_for_snapshot(&mut socket, &session, |snapshot| {
                snapshot["current"].is_null()
            })
            .await;
        } else {
            let response = after_owner_release(
                &mut socket,
                id,
                "session/prompt",
                json!({
                    "sessionId":session,"prompt":[
                        {"type":"text","text":text},
                        {"type":"resource_link","uri":"fixture://linked-context","name":"Fixture reference"}
                    ],
                }),
                "session_prompt_in_progress",
            )
            .await;
            assert!(response.get("result").is_some(), "{response}");
            endpoint.request().await;
        }
    }
    let old = page(&mut socket, &session, None).await;
    let old_previews = previews(&old);
    assert_eq!(
        &old_previews[..4],
        [
            "First input",
            "First answer",
            &original[..256],
            "Second answer",
        ]
    );
    assert!(old_previews[4].starts_with("Third input"));
    assert!(old_previews[4].contains("fixture://linked-context"));
    assert_eq!(old_previews[5], "Third answer");
    let target = revision_target(&mut socket, &session, &old, 2).await;
    assert_eq!(target["result"]["text"], original);
    assert_eq!(target["result"]["sessionRevision"], old["sessionRevision"]);
    assert_eq!(target["result"]["basis"], old["basis"]);
    assert_eq!(target["result"]["anchor"], old["messages"][2]["anchor"]);
    assert_eq!(target["result"]["subsequentMessages"], 3);
    for ineligible in [1, 4] {
        let denied = revision_target(&mut socket, &session, &old, ineligible).await;
        assert_eq!(
            denied["error"]["data"],
            "history_revision_target_unavailable"
        );
    }
    let mut unattached = client(&url, true).await;
    let denied = revision_target(&mut unattached, &session, &old, 2).await;
    assert_eq!(denied["error"]["data"], "session_setup_required");
    drop(unattached);
    let revision = json!({
        "sessionId":session,"requestId":"edit-second","expectedSessionRevision":target["result"]["sessionRevision"],
        "expectedHistory":target["result"]["basis"],"anchor":target["result"]["anchor"],
        "replacementInputId":"replacement","prompt":[{"type":"text","text":"Revised second input"}],
    });
    let changed = ws_rpc(&mut socket, 6, "_co.grida/session/revise", revision.clone()).await;
    assert_eq!(changed["result"]["sessionId"], session, "{changed}");
    assert_eq!(changed["result"]["inputId"], "replacement");
    let next = endpoint.request().await;
    let conversation = next["messages"].as_array().unwrap();
    let instructions = conversation[0]["content"].as_str().unwrap();
    assert!(instructions.contains("tool calls (1)"));
    assert!(instructions.contains("tool result payloads (1)"));
    assert!(!next.to_string().contains("Maximum context input"));
    assert_eq!(
        conversation
            .iter()
            .filter(|message| message["role"] != "system")
            .map(|message| message["content"].as_str().unwrap())
            .collect::<Vec<_>>(),
        [
            "First input",
            "Prior tool result (Succeeded)",
            "First answer",
            "Revised second input"
        ]
    );
    let offered = next["tools"].as_array().unwrap();
    assert!(
        offered
            .iter()
            .any(|tool| tool["function"]["name"] == "config_inspect")
    );
    assert!(
        !offered
            .iter()
            .any(|tool| tool["function"]["name"] == "config_update")
    );
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    let current = page(&mut socket, &session, None).await;
    let stale = revision_target(&mut socket, &session, &old, 2).await;
    assert_eq!(stale["error"]["data"], "stale_session_revision");
    let inherited = revision_target(&mut socket, &session, &current, 0).await;
    assert_eq!(inherited["result"]["text"], "First input", "{inherited}");
    assert_eq!(inherited["result"]["anchor"]["kind"], "inherited");
    assert_eq!(current["seed"]["omissions"]["toolCalls"], 1);
    assert_eq!(current["seed"]["omissions"]["toolResults"], 1);
    assert_eq!(
        previews(&current),
        [
            "First input",
            "Prior tool result (Succeeded)",
            "First answer",
            "Revised second input",
            "Replacement answer"
        ]
    );
    let historical = page(&mut socket, &session, Some(old["basis"]["view"].clone())).await;
    assert_eq!(previews(&historical), previews(&old));
    assert_eq!(historical["basis"], old["basis"]);
    let original = ws_rpc(
        &mut socket,
        7,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":"second"}),
    )
    .await;
    assert_eq!(
        original["result"]["settings"]["configurationPermission"],
        "change"
    );
    assert_eq!(original["result"]["receipt"]["disposition"], "completed");

    drop(socket);
    terminate_shared_server(host).await;
    // Retain unrelated input as if the previous process stopped before its
    // claim. An old revision receipt must never kick this new queue.
    let store = SqliteStore::open(state.join("runtime.sqlite")).unwrap();
    let session_id = SessionId::new(session.clone()).unwrap();
    let payload = store
        .input(session_id.clone(), ChangeId::new("replacement").unwrap())
        .await
        .unwrap()
        .unwrap()
        .input
        .payload;
    store
        .submit(
            session_id,
            Submission {
                id: ChangeId::new("unrelated").unwrap(),
                payload,
            },
        )
        .await
        .unwrap();
    drop(store);
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url, true).await;
    assert_eq!(
        load_transcript(&mut socket, &session, workspace.path()).await,
        previews(&current)
    );
    let retry = ws_rpc(&mut socket, 8, "_co.grida/session/revise", revision.clone()).await;
    assert_eq!(retry["result"], changed["result"]);
    let mut different = revision;
    different["allowConfigurationChanges"] = true.into();
    let rejected = ws_rpc(&mut socket, 9, "_co.grida/session/revise", different).await;
    assert_eq!(rejected["error"]["data"], "request_identity_reused");
    assert!(endpoint.requests.try_recv().is_err());
    let retained = session_snapshot(&mut socket, &session).await;
    assert_eq!(retained["queue"][0]["inputId"], "unrelated");
    assert!(retained["current"].is_null());
    let resumed = ws_rpc(&mut socket, 10, "_co.grida/session/resume-queue", json!({
        "sessionId":session,"requestId":"resume-unrelated","expectedSessionRevision":retained["sessionRevision"],
    })).await;
    assert!(resumed.get("result").is_some(), "{resumed}");
    endpoint.request().await;
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn a_pending_question_survives_fork_and_requires_stop_before_revision() {
    use super::questions::{question_list, question_socket};

    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question"),
        Reply::Finished("Revised task completed."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = question_socket(&url, true).await;
    let source = create(&mut socket, workspace.path()).await;
    let started = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        prompt_request(&source, "original", "Prepare the document"),
    )
    .await;
    let turn = started["result"]["turnId"].as_str().unwrap();
    endpoint.request().await;
    let suspended = wait_for_snapshot(&mut socket, &source, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    let pending = question_list(&mut socket, &source, turn).await;
    assert_eq!(pending["questions"].as_array().unwrap().len(), 1);
    let source_history = page(&mut socket, &source, None).await;
    let fork = ws_rpc(&mut socket, 4, "_co.grida/session/fork", json!({
        "sessionId":source, "requestId":"fork-waiting", "expectedHistory":source_history["basis"],
        "anchor":source_history["messages"][0]["anchor"],
    })).await;
    let child = fork["result"]["sessionId"].as_str().unwrap();
    load_transcript(&mut socket, child, workspace.path()).await;
    let child_snapshot = session_snapshot(&mut socket, child).await;
    assert!(child_snapshot["current"].is_null() && child_snapshot["latest"].is_null());
    assert_eq!(question_list(&mut socket, &source, turn).await, pending);

    let mut revise = json!({
        "sessionId":source, "requestId":"replace-waiting", "expectedHistory":source_history["basis"],
        "expectedSessionRevision":source_history["sessionRevision"],
        "anchor":source_history["messages"][0]["anchor"], "replacementInputId":"replacement",
        "prompt":[{"type":"text","text":"Use the screen layout"}],
    });
    let denied = ws_rpc(&mut socket, 5, "_co.grida/session/revise", revise.clone()).await;
    assert_eq!(denied["error"]["data"], "history_revision_requires_idle");
    let stopped = ws_rpc(
        &mut socket,
        6,
        "_co.grida/session/stop",
        task_basis(&suspended, &source, "stop-waiting"),
    )
    .await;
    assert!(stopped.get("result").is_some(), "{stopped}");
    let settled = wait_for_snapshot(&mut socket, &source, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["status"], "cancelled");
    let after_stop = page(&mut socket, &source, None).await;
    revise["expectedSessionRevision"] = after_stop["sessionRevision"].clone();
    revise["expectedHistory"] = after_stop["basis"].clone();
    let revised = after_owner_release(
        &mut socket,
        7,
        "_co.grida/session/revise",
        revise,
        "history_revision_requires_idle",
    )
    .await;
    assert!(revised.get("result").is_some(), "{revised}");
    assert!(previews(&page(&mut socket, &source, None).await).is_empty());
    assert!(
        question_list(&mut socket, &source, turn).await["questions"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let late = ws_rpc(
        &mut socket,
        8,
        "_co.grida/session/answer-question",
        json!({
            "sessionId":source,"turnId":turn,"requestId":"late-answer",
            "expectedSessionRevision":revised["result"]["view"],
            "expectedControlRevision":pending["controlRevision"],
            "expectedHistoryPosition":pending["historyPosition"],
            "waitId":pending["questions"][0]["waitId"],"answer":{"kind":"text","text":"Print"},
        }),
    )
    .await;
    assert!(late.get("error").is_some(), "{late}");
    let queued = session_snapshot(&mut socket, &source).await;
    assert_eq!(queued["admissionPaused"], true);
    assert_eq!(queued["queuedInputs"], 1);
    assert!(endpoint.requests.try_recv().is_err());

    let resumed = ws_rpc(&mut socket, 9, "_co.grida/session/resume-queue", json!({
        "sessionId":source,"requestId":"resume-after-revision","expectedSessionRevision":queued["sessionRevision"],
    })).await;
    assert!(resumed.get("result").is_some(), "{resumed}");
    let request = endpoint.request().await;
    assert_eq!(
        request["messages"].as_array().unwrap().last().unwrap()["content"],
        "Use the screen layout"
    );
    assert!(!request.to_string().contains("Which edition?"));
    wait_for_snapshot(&mut socket, &source, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn a_reply_may_make_many_parallel_tool_calls() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    // One reply may make more parallel calls than a typical client cap.
    let calls: Vec<Value> = (0..12)
        .map(|index| {
            json!({"index":index,"id":format!("call-{index}"),"type":"function",
                "function":{"name":"config_inspect","arguments":"{}"}})
        })
        .collect();
    let delta = json!({"id":"fixture-response","choices":[{"index":0,"delta":{
        "role":"assistant","tool_calls":calls},"finish_reason":null}]});
    let finish = json!({"id":"fixture-response","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]});
    let body = format!("data: {delta}\n\ndata: {finish}\n\ndata: [DONE]\n\n");
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let mut endpoint = Endpoint::start(vec![
        Reply::RawHttp(response),
        Reply::Finished("Inspected twelve times."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url, true).await;
    let session = create(&mut socket, workspace.path()).await;
    let started = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        prompt_request(&session, "inspect", "Inspect the settings."),
    )
    .await;
    assert!(started.get("result").is_some(), "{started}");
    endpoint.request().await;
    let with_results = endpoint.request().await;
    let results = with_results["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|message| message["role"] == "tool")
        .count();
    assert_eq!(results, 12, "{with_results}");
    let settled = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["status"], "succeeded", "{settled}");
    endpoint.done().await;
    terminate_shared_server(host).await;
}
