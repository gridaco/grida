//! Committed cancellation survives a full in-memory readiness queue.

use super::lifecycle::{
    prompt_request, session_snapshot, task_basis, terminate_shared_server, wait_for_snapshot,
};
use super::*;

struct ProcessGuard(Option<Child>);
impl Drop for ProcessGuard {
    fn drop(&mut self) {
        if let Some(child) = &mut self.0 {
            let _ = child.start_kill();
        }
    }
}

struct ServerGuard(tokio::task::JoinHandle<()>);
impl Drop for ServerGuard {
    fn drop(&mut self) {
        self.0.abort();
    }
}

async fn holding_provider() -> (String, mpsc::UnboundedReceiver<Value>, ServerGuard) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
    let (sent, requests) = mpsc::unbounded_channel();
    let task = tokio::spawn(async move {
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            let sent = sent.clone();
            tokio::spawn(async move {
                let mut stream = BufReader::new(stream);
                let mut line = String::new();
                stream.read_line(&mut line).await.unwrap();
                assert!(line.starts_with("POST /v1/chat/completions "));
                let mut length = None;
                loop {
                    line.clear();
                    stream.read_line(&mut line).await.unwrap();
                    if line == "\r\n" {
                        break;
                    }
                    if let Some((name, value)) = line.trim_end().split_once(':')
                        && name.eq_ignore_ascii_case("content-length")
                    {
                        length = Some(value.trim().parse::<usize>().unwrap());
                    }
                }
                let mut body = vec![0; length.unwrap()];
                stream.read_exact(&mut body).await.unwrap();
                sent.send(serde_json::from_slice(&body).unwrap()).unwrap();
                let mut stream = stream.into_inner();
                stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 1048576\r\n\r\ndata: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Working\"},\"finish_reason\":null}]}\n\n").await.unwrap();
                stream.flush().await.unwrap();
                let mut byte = [0; 1];
                let _ = stream.read(&mut byte).await;
            });
        }
    });
    (endpoint, requests, ServerGuard(task))
}

async fn initialized(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let response = ws_rpc(&mut socket, 1, "initialize", extension_initialize()).await;
    assert_eq!(response["result"]["protocolVersion"], 1);
    socket
}

async fn create(socket: &mut SharedSocket, workspace: &Path, id: u64) -> String {
    let response = ws_rpc(
        socket,
        id,
        "session/new",
        json!({"cwd":workspace,"mcpServers":[]}),
    )
    .await;
    response["result"]["sessionId"].as_str().unwrap().to_owned()
}

async fn next_request(requests: &mut mpsc::UnboundedReceiver<Value>) -> Value {
    timeout(Duration::from_secs(20), requests.recv())
        .await
        .unwrap()
        .unwrap()
}

#[tokio::test]
async fn committed_stops_recover_when_the_ready_queue_is_full() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (endpoint, mut requests, _provider) = holding_provider().await;
    let (child, url) = shared_server(&temporary.path().join("agent-state"), &endpoint).await;
    let mut child = ProcessGuard(Some(child));
    let mut first = initialized(&url).await;
    let mut second = initialized(&url).await;

    // Two real turns are suspended before filling the host's worker slots.
    let mut stopped_sessions = Vec::new();
    for index in 0..2 {
        let session = create(&mut first, workspace.path(), 10 + index).await;
        let input = format!("suspended-{index}");
        let started = ws_rpc(
            &mut first,
            20 + index,
            "_co.grida/session/submit",
            prompt_request(&session, &input, &input),
        )
        .await;
        assert_eq!(started["result"]["disposition"], "claimed", "{started}");
        next_request(&mut requests).await;
        let current = session_snapshot(&mut first, &session).await;
        let pause = ws_rpc(
            &mut first,
            30 + index,
            "_co.grida/session/pause",
            task_basis(&current, &session, &format!("pause-{index}")),
        )
        .await;
        assert!(pause.get("result").is_some(), "{pause}");
        wait_for_snapshot(&mut first, &session, |snapshot| {
            snapshot["current"]["disposition"] == "suspended"
        })
        .await;
        stopped_sessions.push(session);
    }

    let mut held_sessions = Vec::new();
    for index in 0..8 {
        let session = create(&mut first, workspace.path(), 100 + index).await;
        let held = ws_rpc(
            &mut first,
            120 + index,
            "_co.grida/session/submit",
            prompt_request(&session, "held", "Held worker"),
        )
        .await;
        assert_eq!(held["result"]["disposition"], "claimed", "{held}");
        next_request(&mut requests).await;
        held_sessions.push(session);
    }

    // Distinct sessions fill every readiness entry, retaining all input receipts.
    let mut queued = Vec::new();
    for index in 0..128_u64 {
        let socket = if index % 2 == 0 {
            &mut first
        } else {
            &mut second
        };
        let session = create(socket, workspace.path(), 200 + index).await;
        let input = format!("queued-{index}");
        let accepted = ws_rpc(
            socket,
            400 + index,
            "_co.grida/session/enqueue",
            prompt_request(&session, &input, &input),
        )
        .await;
        assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
        queued.push((
            index % 2,
            session,
            input,
            accepted["result"]["inputPosition"].clone(),
        ));
    }
    assert!(requests.try_recv().is_err());

    let mut receipts = Vec::new();
    for (index, session) in stopped_sessions.iter().enumerate() {
        let current = session_snapshot(&mut first, session).await;
        let request = task_basis(&current, session, &format!("stop-suspended-{index}"));
        let stopped = ws_rpc(
            &mut first,
            700 + index as u64,
            "_co.grida/session/stop",
            request.clone(),
        )
        .await;
        assert!(stopped.get("result").is_some(), "{stopped}");
        let exact = ws_rpc(
            &mut first,
            710 + index as u64,
            "_co.grida/session/stop",
            request.clone(),
        )
        .await;
        assert_eq!(exact["result"], stopped["result"]);
        receipts.push((request, stopped["result"].clone()));
    }
    assert!(requests.try_recv().is_err());

    // Cancellation of one running worker releases capacity without reissuing inference.
    let first_held = &held_sessions[0];
    let current = session_snapshot(&mut first, first_held).await;
    let freed = ws_rpc(
        &mut first,
        800,
        "_co.grida/session/stop",
        task_basis(&current, first_held, "free-worker"),
    )
    .await;
    assert!(freed.get("result").is_some(), "{freed}");
    let ordinary = next_request(&mut requests).await;
    let content = ordinary["messages"].as_array().unwrap().last().unwrap()["content"]
        .as_str()
        .unwrap();
    assert!(
        content.starts_with("queued-"),
        "unexpected redispatch: {ordinary}"
    );

    // The first released slot goes to existing ready work. A second gives
    // the bounded cancellation scan a chance to settle a stopped turn.
    let second_held = &held_sessions[1];
    let current = session_snapshot(&mut first, second_held).await;
    let freed = ws_rpc(
        &mut first,
        801,
        "_co.grida/session/stop",
        task_basis(&current, second_held, "free-another-worker"),
    )
    .await;
    assert!(freed.get("result").is_some(), "{freed}");
    timeout(WAIT, async {
        loop {
            for session in &stopped_sessions {
                let snapshot = session_snapshot(&mut first, session).await;
                if snapshot["current"].is_null() && snapshot["latest"]["status"] == "cancelled" {
                    return;
                }
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let third_held = &held_sessions[2];
    let current = session_snapshot(&mut first, third_held).await;
    let freed = ws_rpc(
        &mut first,
        802,
        "_co.grida/session/stop",
        task_basis(&current, third_held, "free-third-worker"),
    )
    .await;
    assert!(freed.get("result").is_some(), "{freed}");
    for (index, session) in stopped_sessions.iter().enumerate() {
        let settled = wait_for_snapshot(&mut first, session, |snapshot| {
            snapshot["current"].is_null()
        })
        .await;
        assert_eq!(settled["latest"]["status"], "cancelled", "{settled}");
        let exact = ws_rpc(
            &mut first,
            820 + index as u64,
            "_co.grida/session/stop",
            receipts[index].0.clone(),
        )
        .await;
        assert_eq!(exact["result"], receipts[index].1);
    }

    for (owner, session, input, position) in queued {
        let socket = if owner == 0 { &mut first } else { &mut second };
        let retained = ws_rpc(
            socket,
            900,
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":input}),
        )
        .await;
        let disposition = retained["result"]["receipt"]["disposition"]
            .as_str()
            .unwrap();
        assert!(
            matches!(disposition, "queued" | "claimed" | "completed"),
            "{retained}"
        );
        assert_eq!(retained["result"]["receipt"]["inputPosition"], position);
        assert_eq!(retained["result"]["prompt"][0]["text"], input);
    }
    while let Ok(request) = requests.try_recv() {
        let content = request["messages"].as_array().unwrap().last().unwrap()["content"]
            .as_str()
            .unwrap();
        assert!(
            content.starts_with("queued-"),
            "unexpected redispatch: {request}"
        );
    }
    drop(first);
    drop(second);
    terminate_shared_server(child.0.take().unwrap()).await;
}
