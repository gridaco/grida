use super::lifecycle::{
    prompt_request, queue_basis, session_snapshot, task_basis, terminate_shared_server,
    wait_for_snapshot,
};
use super::*;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

async fn client(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"]["co.grida/session/compact"] = 1.into();
    let reply = ws_rpc(&mut socket, 1, "initialize", initialize).await;
    assert_eq!(
        reply["result"]["agentCapabilities"]["_meta"]["co.grida/session/compact"],
        1
    );
    socket
}

async fn collect(
    socket: &mut SharedSocket,
    id: u64,
    method: &str,
    params: Value,
) -> (Value, Vec<Value>) {
    timeout(WAIT, async {
        let request = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        socket
            .send(Message::Text(request.to_string().into()))
            .await
            .unwrap();
        let mut updates = Vec::new();
        loop {
            let frame = socket.next().await.unwrap().unwrap();
            let Message::Text(line) = frame else { continue };
            let value: Value = serde_json::from_str(line.as_str()).unwrap();
            if value["id"] == id {
                return (value, updates);
            }
            if value["method"] == "session/update" {
                updates.push(value["params"]["update"].clone());
            }
        }
    })
    .await
    .unwrap()
}

async fn create(socket: &mut SharedSocket, cwd: &Path) -> String {
    let (reply, updates) =
        collect(socket, 2, "session/new", json!({"cwd":cwd,"mcpServers":[]})).await;
    let catalog = updates
        .iter()
        .find(|update| update["sessionUpdate"] == "available_commands_update")
        .unwrap();
    assert_eq!(catalog["availableCommands"][0]["name"], "compact");
    assert_eq!(catalog["availableCommands"][1]["name"], "fork");
    reply["result"]["sessionId"].as_str().unwrap().into()
}

async fn load(socket: &mut SharedSocket, session: &str, cwd: &Path) -> Vec<String> {
    let (reply, updates) = collect(
        socket,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":cwd,"mcpServers":[]}),
    )
    .await;
    assert!(reply.get("result").is_some(), "{reply}");
    updates
        .into_iter()
        .filter_map(|update| update["content"]["text"].as_str().map(str::to_owned))
        .collect()
}

async fn prompt(socket: &mut SharedSocket, id: u64, session: &str, text: &str) -> Value {
    ws_rpc(
        socket,
        id,
        "session/prompt",
        json!({
            "sessionId":session,"prompt":[{"type":"text","text":text}],
        }),
    )
    .await
}

fn compact(session: &str, id: &str) -> Value {
    json!({"sessionId":session,"requestId":id})
}

async fn prime_automatic_history(
    endpoint: &mut Endpoint,
    socket: &mut SharedSocket,
    session: &str,
) -> String {
    let older = format!("Earlier requirements {}", "a".repeat(105_000));
    for (id, text) in [(3, older.as_str()), (4, "Keep this recent turn verbatim.")] {
        let result = prompt(socket, id, session, text).await;
        assert_eq!(result["result"]["stopReason"], "end_turn", "{result}");
        endpoint.request().await;
    }
    older
}

#[tokio::test]
async fn identified_submit_keeps_one_queued_receipt_during_automatic_compaction() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let (release, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Initial direct answer."),
        Reply::Finished("First original answer."),
        Reply::Finished("Recent original answer."),
        Reply::Finished("Synchronous prompt answer."),
        Reply::Release("Earlier work and unresolved decisions.", held),
        Reply::Finished("Direct input answer."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    let ordinary = ws_rpc(
        &mut socket,
        9,
        "_co.grida/session/submit",
        prompt_request(&session, "initial-direct", "Small identified submission."),
    )
    .await;
    assert_eq!(ordinary["result"]["disposition"], "claimed", "{ordinary}");
    assert!(ordinary["result"]["turnId"].is_string());
    endpoint.request().await;
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;

    let older = prime_automatic_history(&mut endpoint, &mut socket, &session).await;
    let synchronous = prompt(
        &mut socket,
        10,
        &session,
        "Keep this standard prompt verbatim.",
    )
    .await;
    assert_eq!(
        synchronous["result"]["stopReason"], "end_turn",
        "{synchronous}"
    );
    let synchronous_request = endpoint.request().await;
    assert_eq!(
        synchronous_request["messages"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()["content"],
        "Keep this standard prompt verbatim."
    );
    assert!(synchronous_request["messages"].to_string().contains(&older));

    let mut direct = prompt_request(
        &session,
        "direct-after-history",
        "Exactly one direct input.",
    );
    direct["operatingRegime"] = "act".into();
    let pending = ws_rpc(&mut socket, 11, "_co.grida/session/submit", direct.clone()).await;
    assert_eq!(pending["result"]["disposition"], "queued", "{pending}");
    assert!(pending["result"]["turnId"].is_null());
    let summary = endpoint.request().await;
    assert!(summary.get("tools").is_none());
    let messages = summary["messages"].to_string();
    assert!(messages.contains(&older));
    assert!(!messages.contains("Keep this standard prompt verbatim."));
    assert!(!messages.contains("Exactly one direct input."));
    let current = session_snapshot(&mut socket, &session).await;
    let helper_turn = current["current"]["turnId"].as_str().unwrap().to_owned();
    let receipt_request = json!({"sessionId":session,"inputId":"direct-after-history"});
    let captured = ws_rpc(
        &mut socket,
        12,
        "_co.grida/session/input",
        receipt_request.clone(),
    )
    .await;
    assert_eq!(captured["result"]["receipt"], pending["result"]);
    assert_eq!(captured["result"]["settings"]["operatingRegime"], "act");
    let retried = ws_rpc(&mut socket, 13, "_co.grida/session/submit", direct.clone()).await;
    assert_eq!(retried["result"], pending["result"]);
    direct["operatingRegime"] = "plan".into();
    let changed = ws_rpc(&mut socket, 14, "_co.grida/session/submit", direct).await;
    assert!(
        changed["error"]
            .to_string()
            .contains("submission_operating_regime_changed"),
        "{changed}"
    );
    release.send(()).unwrap();
    let user = endpoint.request().await;
    let messages = user["messages"].to_string();
    assert!(messages.contains("Earlier work and unresolved decisions."));
    assert!(messages.contains("Keep this standard prompt verbatim."));
    assert_eq!(messages.matches("Exactly one direct input.").count(), 1);
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    let settled = ws_rpc(&mut socket, 15, "_co.grida/session/input", receipt_request).await;
    assert_eq!(
        settled["result"]["settings"],
        captured["result"]["settings"]
    );
    assert_eq!(settled["result"]["prompt"], captured["result"]["prompt"]);
    assert_eq!(settled["result"]["receipt"]["disposition"], "completed");
    assert_eq!(
        settled["result"]["receipt"]["inputPosition"],
        pending["result"]["inputPosition"]
    );
    assert_ne!(settled["result"]["receipt"]["turnId"], helper_turn);
    let transcript = load(&mut socket, &session, workspace.path()).await.join("");
    assert_eq!(transcript.matches("Exactly one direct input.").count(), 1);
    assert!(!transcript.contains("Earlier work and unresolved decisions."));
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn automatic_compaction_keeps_queue_inputs_and_the_recent_context_exact() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let (release, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("First original answer."),
        Reply::Finished("Recent original answer."),
        Reply::Release("Earlier work and unresolved decisions.", held),
        Reply::Finished("First queued answer."),
        Reply::Finished("Second queued answer."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    let older = prime_automatic_history(&mut endpoint, &mut socket, &session).await;
    let head = prompt_request(&session, "queue-head", "First new queued input.");
    let result = ws_rpc(&mut socket, 5, "_co.grida/session/enqueue", head.clone()).await;
    assert_eq!(result["result"]["disposition"], "queued", "{result}");
    let request = endpoint.request().await;
    assert!(request.get("tools").is_none(), "{request}");
    let source = request["messages"].to_string();
    assert!(source.contains(&older));
    assert!(!source.contains("Keep this recent turn"));
    assert!(!source.contains("First new queued input"));
    let retry = ws_rpc(&mut socket, 6, "_co.grida/session/enqueue", head).await;
    assert_eq!(
        retry,
        json!({"jsonrpc":"2.0", "id":6, "result":result["result"]})
    );
    let tail = ws_rpc(
        &mut socket,
        7,
        "_co.grida/session/enqueue",
        prompt_request(&session, "queue-tail", "Second new queued input."),
    )
    .await;
    assert_eq!(tail["result"]["disposition"], "queued", "{tail}");
    assert!(endpoint.requests.try_recv().is_err());
    release.send(()).unwrap();
    let next = endpoint.request().await["messages"].to_string();
    assert!(next.contains("Earlier work and unresolved decisions."));
    assert!(next.contains("Keep this recent turn verbatim."));
    assert!(next.contains("Recent original answer."));
    assert!(next.contains("First new queued input."));
    assert!(!next.contains("Earlier requirements"));
    assert!(!next.contains("Second new queued input."));
    let following = endpoint.request().await;
    assert_eq!(
        following["messages"].as_array().unwrap().last().unwrap()["content"],
        "Second new queued input."
    );
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    let transcript = load(&mut socket, &session, workspace.path()).await.join("");
    assert!(transcript.contains(&older));
    assert!(!transcript.contains("Earlier work and unresolved decisions."));
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn provider_context_rejection_compacts_once_before_the_next_input_after_restart() {
    after_provider_rejection("context_length_exceeded", "context_limit", true).await;
}

#[tokio::test]
async fn unrelated_provider_rejection_does_not_compact_after_restart() {
    after_provider_rejection("unsupported_parameter", "provider_request_rejected", false).await;
}

async fn after_provider_rejection(provider_code: &str, terminal_code: &str, compacts: bool) {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let error = json!({"error":{"type":"invalid_request_error","code":provider_code}}).to_string();
    let summary = "A concise account of the earlier agreement.";
    let mut replies = vec![
        Reply::Finished("An earlier agreement."),
        Reply::RawHttp(format!(
            "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{error}",
            error.len(),
        )),
    ];
    if compacts {
        replies.push(Reply::Finished(summary));
    }
    replies.push(Reply::Finished("The new request can continue."));
    let mut endpoint = Endpoint::start(replies).await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    // Deliberately below the ordinary approximate byte trigger.
    let older = format!("Earlier requirements {}", "a".repeat(12_000));
    let failed_input = "Retain this rejected request.";
    assert!(
        prompt(&mut socket, 3, &session, &older)
            .await
            .get("result")
            .is_some()
    );
    endpoint.request().await;
    let failed_reply = prompt(&mut socket, 4, &session, failed_input).await;
    assert_eq!(failed_reply["error"]["data"]["code"], terminal_code);
    let rejected = endpoint.request().await["messages"].to_string();
    assert!(rejected.contains(&older));
    assert!(rejected.contains(failed_input));
    let failed = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null() && snapshot["latest"]["status"] == "failed"
    })
    .await;
    let failed_turn = failed["latest"]["turnId"].as_str().unwrap().to_owned();
    drop(socket);
    terminate_shared_server(host).await;

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let original = load(&mut socket, &session, workspace.path()).await.join("");
    assert!(original.contains(&older));
    assert!(original.contains(failed_input));
    assert!(endpoint.requests.try_recv().is_err());
    let new_input = "Continue with this separate, newly accepted task.";
    let accepted = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/enqueue",
        prompt_request(&session, "after-context-rejection", new_input),
    )
    .await;
    assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
    if compacts {
        let helper = endpoint.request().await["messages"].to_string();
        assert!(helper.contains(&older));
        assert!(!helper.contains(failed_input));
        assert!(!helper.contains(new_input));
    }
    let next = endpoint.request().await["messages"].to_string();
    assert_eq!(next.contains(summary), compacts);
    assert_eq!(next.contains(&older), !compacts);
    assert!(next.contains(failed_input));
    assert_eq!(next.matches(new_input).count(), 1);
    let settled = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
            && snapshot["latest"]["status"] == "succeeded"
            && snapshot["latest"]["turnId"] != failed_turn
    })
    .await;
    assert_ne!(settled["latest"]["turnId"], failed_turn);
    let transcript = load(&mut socket, &session, workspace.path()).await.join("");
    assert!(transcript.contains(&older));
    assert_eq!(transcript.matches(failed_input).count(), 1);
    assert!(!transcript.contains(summary));
    assert!(transcript.contains("The new request can continue."));
    assert!(endpoint.requests.try_recv().is_err());
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn automatic_compaction_fails_once_and_uses_the_previous_context() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("First original answer."),
        Reply::Finished("Recent original answer."),
        Reply::Stop("length"),
        Reply::Finished("Handled the original input."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    let older = prime_automatic_history(&mut endpoint, &mut socket, &session).await;
    let queued = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/enqueue",
        prompt_request(
            &session,
            "input-after-failure",
            "Continue using the retained history.",
        ),
    )
    .await;
    assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains(&older)
    );
    let next = endpoint.request().await;
    assert!(next["messages"].to_string().contains(&older));
    assert_eq!(
        next["messages"].as_array().unwrap().last().unwrap()["content"],
        "Continue using the retained history."
    );
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn automatic_compaction_pause_and_restart_keep_the_exact_queue_until_stop_released() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("First original answer."),
        Reply::Finished("Recent original answer."),
        Reply::Hold("Partial maintenance candidate."),
        Reply::Finished("Continued after explicit queue release."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    let older = prime_automatic_history(&mut endpoint, &mut socket, &session).await;
    let queued = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/enqueue",
        prompt_request(
            &session,
            "held-input",
            "Preserve the accepted queued input.",
        ),
    )
    .await;
    assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
    endpoint.request().await;
    let active = session_snapshot(&mut socket, &session).await;
    let turn = active["current"]["turnId"].as_str().unwrap().to_owned();
    let pause = ws_rpc(
        &mut socket,
        6,
        "_co.grida/session/pause",
        task_basis(&active, &session, "pause-automatic"),
    )
    .await;
    assert!(pause.get("result").is_some(), "{pause}");
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    drop(socket);
    terminate_shared_server(host).await;

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let transcript = load(&mut socket, &session, workspace.path()).await.join("");
    assert!(transcript.contains(&older));
    assert!(!transcript.contains("Partial maintenance candidate."));
    let paused = session_snapshot(&mut socket, &session).await;
    assert_eq!(paused["current"]["turnId"], turn);
    assert_eq!(paused["current"]["disposition"], "suspended");
    let stop = ws_rpc(
        &mut socket,
        7,
        "_co.grida/session/stop",
        task_basis(&paused, &session, "stop-automatic"),
    )
    .await;
    assert!(stop.get("result").is_some(), "{stop}");
    let stopped = wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(stopped["admissionPaused"], true);
    let retained = ws_rpc(
        &mut socket,
        8,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":"held-input"}),
    )
    .await;
    assert_eq!(retained["result"]["receipt"], queued["result"]);
    assert!(endpoint.requests.try_recv().is_err());
    let released = ws_rpc(
        &mut socket,
        9,
        "_co.grida/session/resume-queue",
        queue_basis(&stopped, &session, "release-after-stop"),
    )
    .await;
    assert!(released.get("result").is_some(), "{released}");
    let next = endpoint.request().await;
    assert!(next["messages"].to_string().contains(&older));
    assert_eq!(
        next["messages"].as_array().unwrap().last().unwrap()["content"],
        "Preserve the accepted queued input."
    );
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn oversized_history_compacts_complete_early_turns_and_keeps_the_exact_suffix() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("First original answer."),
        Reply::Finished("Second original answer."),
        Reply::Finished("Third original answer."),
        Reply::Finished("Earlier requirements and decisions."),
        Reply::Finished("Continued with recent context."),
        Reply::Finished("Updated concise context."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    let first = format!("First large source {}", "a".repeat(115_000));
    let second = format!("Second large source {}", "b".repeat(115_000));
    let recent = format!("Recent large source {}", "c".repeat(115_000));
    for (index, text) in [&first, &second, &recent].into_iter().enumerate() {
        let reply = prompt(&mut socket, 3 + index as u64, &session, text).await;
        assert_eq!(reply["result"]["stopReason"], "end_turn", "{reply}");
        endpoint.request().await;
    }

    let request = compact(&session, "compact-prefix");
    let result = ws_rpc(&mut socket, 6, "_co.grida/session/compact", request.clone()).await;
    assert_eq!(result["result"]["status"], "installed", "{result}");
    assert_eq!(result["result"]["coveredRecords"], 4);
    let summary_request = endpoint.request().await["messages"].to_string();
    assert!(summary_request.contains(&first));
    assert!(summary_request.contains(&second));
    assert!(summary_request.contains("Second original answer."));
    assert!(!summary_request.contains("Recent large source"));
    drop(socket);
    terminate_shared_server(host).await;

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let transcript = load(&mut socket, &session, workspace.path()).await.join("");
    for source in [&first, &second, &recent] {
        assert!(transcript.contains(source));
    }
    assert!(!transcript.contains("Earlier requirements and decisions."));
    let retried = ws_rpc(&mut socket, 7, "_co.grida/session/compact", request).await;
    assert_eq!(retried["result"], result["result"]);
    assert!(endpoint.requests.try_recv().is_err());

    let reply = prompt(&mut socket, 8, &session, "Continue from here.").await;
    assert_eq!(reply["result"]["stopReason"], "end_turn", "{reply}");
    let next = endpoint.request().await["messages"].to_string();
    assert!(next.contains("Earlier requirements and decisions."));
    assert!(next.contains(&recent));
    assert!(next.contains("Third original answer."));
    assert!(!next.contains("First large source"));
    assert!(!next.contains("Second large source"));
    let compacted = ws_rpc(
        &mut socket,
        9,
        "_co.grida/session/compact",
        compact(&session, "compact-tail"),
    )
    .await;
    assert_eq!(compacted["result"]["status"], "installed", "{compacted}");
    let summary_request = endpoint.request().await["messages"].to_string();
    assert!(summary_request.contains("Earlier requirements and decisions."));
    assert!(summary_request.contains(&recent));
    assert!(summary_request.contains("Continued with recent context."));
    assert!(!summary_request.contains("First large source"));
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn manual_compaction_recovers_a_chat_beyond_the_context_projection_limit() {
    use agent_kit_core::history::HistoryRecord;
    use agent_kit_core::messages::{
        Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role,
    };
    use agent_kit_core::turn::{JournalAction, JournalChange, TurnOutcome};
    use agent_kit_core::{ChangeId, Envelope, MessageId, SchemaId, SessionId, TurnId};
    use agent_kit_sessions::ClaimOutcome;
    use agent_kit_store_sqlite::SqliteStore;
    use agent_kit_store_sqlite::context::UnpromptedClaim;

    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let summary = "The earliest retained decisions.";
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished(summary),
        Reply::Finished("Continued after compaction."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    drop(socket);
    terminate_shared_server(host).await;

    // Seed through the journal so the live ACP path starts with retained
    // history beyond the request projection limit without 4,098 wire updates
    // during fixture setup. The first two turns fit that record projection,
    // but only the first fits the bounded summary input.
    let store = SqliteStore::open(state.join("runtime.sqlite")).unwrap();
    let session_id = SessionId::new(session.clone()).unwrap();
    let mut original = Vec::new();
    for (turn, count, padding) in [
        ("older", 2_000, 96),
        ("middle", 2_000, 32),
        ("recent", 98, 0),
    ] {
        let mut records = Vec::with_capacity(count);
        for index in 0..count {
            let id = format!("{turn}-{index}");
            let text = format!("Original {id}. {}", "x".repeat(padding));
            original.push(text.clone());
            records.push(HistoryRecord::Message(Message {
                id: MessageId::new(id).unwrap(),
                role: if index % 2 == 0 {
                    Role::User
                } else {
                    Role::Assistant
                },
                phase: None,
                content: vec![Content::Text(text)],
                provenance: Provenance {
                    source: "fixture".into(),
                    kind: ProvenanceKind::Supplied,
                    fingerprint: None,
                },
            }));
        }
        let context = store
            .context_history_with(session_id.clone(), None, |_| Vec::new())
            .await
            .unwrap();
        let ClaimOutcome::Acquired(claim) = store
            .claim_unprompted(UnpromptedClaim {
                session: session_id.clone(),
                turn: TurnId::new(turn).unwrap(),
                request: ChangeId::new(format!("retain-{turn}")).unwrap(),
                expected_revision: context.session_revision,
                expected_context: context.basis,
                checkpoint: Envelope::new(SchemaId::new("fixture.history").unwrap(), 1, Vec::new())
                    .unwrap(),
            })
            .await
            .unwrap()
        else {
            panic!("expected fixture turn ownership");
        };
        let journal = claim.lease.journal();
        let snapshot = journal.load().await.unwrap();
        journal
            .commit(
                JournalChange::new(
                    ChangeId::new("retain-history").unwrap(),
                    snapshot.binding().clone(),
                    snapshot.position(),
                    snapshot.controls().revision,
                    vec![
                        JournalAction::AppendHistory(records),
                        JournalAction::Settle(TurnOutcome {
                            status: OutcomeStatus::Succeeded,
                            account: None,
                            evidence: Vec::new(),
                        }),
                    ],
                )
                .unwrap(),
            )
            .await
            .unwrap();
    }
    drop(store);

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    assert_eq!(
        load(&mut socket, &session, workspace.path()).await,
        original
    );
    let overflow = prompt(&mut socket, 3, &session, "Cannot send this before repair.").await;
    assert_eq!(
        overflow["error"]["data"], "history_projection_limit",
        "{overflow}"
    );
    assert!(endpoint.requests.try_recv().is_err());

    let compact_request = compact(&session, "repair-context");
    let repaired = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/compact",
        compact_request.clone(),
    )
    .await;
    assert_eq!(repaired["result"]["status"], "installed", "{repaired}");
    assert_eq!(repaired["result"]["coveredRecords"], 2_000);
    let helper = endpoint.request().await;
    let source = helper["messages"][1]["content"].as_str().unwrap();
    assert!(source.contains(&original[0]));
    assert!(source.contains(&original[1_999]));
    assert!(!source.contains(&original[2_000]));
    assert!(!source.contains(&original[4_000]));
    drop(socket);
    terminate_shared_server(host).await;

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    assert_eq!(
        load(&mut socket, &session, workspace.path()).await,
        original
    );
    let retried = ws_rpc(&mut socket, 5, "_co.grida/session/compact", compact_request).await;
    assert_eq!(retried["result"], repaired["result"]);
    assert!(endpoint.requests.try_recv().is_err());

    let followup = "Continue with the repaired context.";
    let next = prompt(&mut socket, 6, &session, followup).await;
    assert_eq!(next["result"]["stopReason"], "end_turn", "{next}");
    let next = endpoint.request().await;
    let messages = next["messages"].as_array().unwrap();
    let mut contents = messages
        .iter()
        .rev()
        .map(|message| message["content"].as_str().unwrap());
    assert_eq!(contents.next(), Some(followup));
    for text in original[2_000..].iter().rev() {
        assert_eq!(contents.next(), Some(text.as_str()));
    }
    assert!(contents.next().unwrap().contains(summary));
    assert!(!next.to_string().contains("Original older-"));
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

async fn compact_on_peer(
    url: &str,
    session: &str,
    cwd: &Path,
    id: &str,
) -> tokio::task::JoinHandle<Value> {
    let mut peer = client(url).await;
    load(&mut peer, session, cwd).await;
    let request = compact(session, id);
    tokio::spawn(async move { ws_rpc(&mut peer, 3, "_co.grida/session/compact", request).await })
}

#[tokio::test]
async fn compact_preserves_queued_input_and_original_transcript_across_restart() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let (release, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Original answer."),
        Reply::Release("Retained constraints and prior decision.", held),
        Reply::Finished("Handled queued input."),
        Reply::Finished("Revised concise context."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    let original = "Original design requirement that should stay in the transcript. ".repeat(32);
    let first = prompt(&mut socket, 3, &session, &original).await;
    assert_eq!(first["result"]["stopReason"], "end_turn", "{first}");
    endpoint.request().await;

    let compaction = compact_on_peer(&url, &session, workspace.path(), "compact-original").await;
    let summary_request = endpoint.request().await;
    assert!(summary_request.get("tools").is_none());
    assert!(summary_request["messages"].to_string().contains(&original));
    let active = session_snapshot(&mut socket, &session).await;
    assert_eq!(active["current"]["disposition"], "running");
    let queued = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/enqueue",
        prompt_request(&session, "new-input", "Handle this newer input."),
    )
    .await;
    assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
    assert!(endpoint.requests.try_recv().is_err());
    release.send(()).unwrap();
    let result = compaction.await.unwrap();
    assert_eq!(result["result"]["status"], "installed", "{result}");
    assert_eq!(result["result"]["coveredRecords"], 2);
    assert_eq!(
        result["result"]["inferenceUsage"]["unreported_attempts"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let next = endpoint.request().await;
    let messages = next["messages"].as_array().unwrap();
    assert!(messages.iter().any(|item| {
        item["content"]
            .as_str()
            .unwrap()
            .contains("Retained constraints")
    }));
    assert_eq!(
        messages.last().unwrap()["content"],
        "Handle this newer input."
    );
    assert!(!next.to_string().contains("Original design requirement"));
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    let transcript = load(&mut socket, &session, workspace.path()).await;
    assert_eq!(
        transcript,
        [
            original.as_str(),
            "Original answer.",
            "Handle this newer input.",
            "Handled queued input."
        ]
    );

    drop(socket);
    terminate_shared_server(host).await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    assert_eq!(
        load(&mut socket, &session, workspace.path()).await,
        transcript
    );
    let retry = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/compact",
        compact(&session, "compact-original"),
    )
    .await;
    assert_eq!(retry["result"], result["result"]);
    assert!(endpoint.requests.try_recv().is_err());

    let slash = prompt(&mut socket, 6, &session, "/compact").await;
    assert_eq!(
        slash["result"]["_meta"]["co.grida/session/compact"]["status"], "installed",
        "{slash}"
    );
    let repeated = endpoint.request().await;
    assert!(repeated.to_string().contains("Retained constraints"));
    assert!(repeated.to_string().contains("Handle this newer input."));
    assert!(!repeated.to_string().contains("Original design requirement"));
    assert_eq!(
        load(&mut socket, &session, workspace.path()).await,
        transcript
    );
    let fork = prompt(&mut socket, 7, &session, "/fork").await;
    let destination = fork["result"]["_meta"]["co.grida/session/fork"]["sessionId"]
        .as_str()
        .unwrap();
    assert_ne!(destination, session);
    assert_eq!(
        load(&mut socket, destination, workspace.path()).await,
        transcript
    );
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn paused_compaction_resumes_the_same_turn_without_repeating_dispatched_inference() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Original answer."),
        Reply::Hold("Partial candidate."),
        Reply::Finished("Continued from original context."),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    let original = "Retain the original source when a summary attempt cannot finish. ".repeat(10);
    assert!(
        prompt(&mut socket, 3, &session, &original)
            .await
            .get("result")
            .is_some()
    );
    endpoint.request().await;
    let compaction = compact_on_peer(&url, &session, workspace.path(), "pause-summary").await;
    endpoint.request().await;
    let active = session_snapshot(&mut socket, &session).await;
    let turn = active["current"]["turnId"].as_str().unwrap().to_owned();
    let pause = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/pause",
        task_basis(&active, &session, "pause"),
    )
    .await;
    assert!(pause.get("result").is_some(), "{pause}");
    let suspended = compaction.await.unwrap();
    assert_eq!(suspended["result"]["status"], "suspended", "{suspended}");
    drop(socket);
    terminate_shared_server(host).await;

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    assert_eq!(
        load(&mut socket, &session, workspace.path()).await,
        [original.as_str(), "Original answer."]
    );
    let observed = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/compact",
        compact(&session, "pause-summary"),
    )
    .await;
    assert_eq!(observed["result"]["status"], "suspended", "{observed}");
    let snapshot = session_snapshot(&mut socket, &session).await;
    let resumed = ws_rpc(
        &mut socket,
        6,
        "_co.grida/session/resume",
        json!({
            "task":task_basis(&snapshot,&session,"resume-summary"),
            "expectedEpoch":snapshot["current"]["epoch"],
            "expectedJournalPosition":snapshot["current"]["journalPosition"],
        }),
    )
    .await;
    assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    let result = ws_rpc(
        &mut socket,
        7,
        "_co.grida/session/compact",
        compact(&session, "pause-summary"),
    )
    .await;
    assert_eq!(result["result"]["status"], "uncertain", "{result}");
    assert_eq!(
        result["result"]["inferenceUsage"]["unreported_attempts"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(endpoint.requests.try_recv().is_err());

    let next = prompt(&mut socket, 8, &session, "Continue the task.").await;
    assert!(next.get("result").is_some(), "{next}");
    let request = endpoint.request().await;
    assert!(request.to_string().contains("Retain the original source"));
    assert!(!request.to_string().contains("Partial candidate."));
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn interrupted_compaction_requires_explicit_recovery_and_failed_candidates_leave_context() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Original answer."),
        Reply::Hold("Partial summary."),
        Reply::Stop("length"),
        Reply::Finished("Continued from prior context."),
    ])
    .await;
    let (mut host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    let session = create(&mut socket, workspace.path()).await;
    let original = "Original instructions for the drawing. ".repeat(32);
    assert!(
        prompt(&mut socket, 3, &session, &original)
            .await
            .get("result")
            .is_some()
    );
    endpoint.request().await;
    let candidate = compact_on_peer(&url, &session, workspace.path(), "interrupted").await;
    endpoint.request().await;
    let active = session_snapshot(&mut socket, &session).await;
    let turn = active["current"]["turnId"].clone();
    candidate.abort();
    drop(socket);
    host.kill().await.unwrap();

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url).await;
    assert_eq!(
        load(&mut socket, &session, workspace.path()).await,
        [original.as_str(), "Original answer."]
    );
    let observed = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/compact",
        compact(&session, "interrupted"),
    )
    .await;
    assert_eq!(observed["result"]["status"], "interrupted", "{observed}");
    assert_eq!(observed["result"]["turnId"], turn);
    assert!(endpoint.requests.try_recv().is_err());
    let mut recover = compact(&session, "interrupted");
    recover["recover"] = true.into();
    let recovered = ws_rpc(&mut socket, 5, "_co.grida/session/compact", recover).await;
    assert_eq!(recovered["result"]["status"], "uncertain", "{recovered}");
    assert_eq!(recovered["result"]["turnId"], turn);
    assert_eq!(
        recovered["result"]["providerFailure"]["code"],
        "execution_owner_lost"
    );
    assert!(endpoint.requests.try_recv().is_err());

    let failed = ws_rpc(
        &mut socket,
        6,
        "_co.grida/session/compact",
        compact(&session, "output-limit"),
    )
    .await;
    assert_eq!(failed["result"]["status"], "failed", "{failed}");
    assert_eq!(failed["result"]["failure"], "provider");
    endpoint.request().await;
    let next = prompt(
        &mut socket,
        7,
        &session,
        "Continue after failed compaction.",
    )
    .await;
    assert!(next.get("result").is_some(), "{next}");
    let request = endpoint.request().await;
    assert!(
        request
            .to_string()
            .contains("Original instructions for the drawing.")
    );
    assert!(!request.to_string().contains("Partial summary."));
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}
