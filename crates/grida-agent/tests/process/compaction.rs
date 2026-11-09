use super::lifecycle::{
    prompt_request, session_snapshot, task_basis, terminate_shared_server, wait_for_snapshot,
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
