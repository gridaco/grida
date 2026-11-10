use super::lifecycle::{
    prompt_request, session_snapshot, task_basis, terminate_shared_server, wait_for_snapshot,
};
use super::*;

const SUMMARY: &str = "co.grida/session/turn-summary";

async fn connect(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut request = extension_initialize();
    request["clientCapabilities"]["_meta"][SUMMARY] = 1.into();
    let response = ws_rpc(&mut socket, 1, "initialize", request).await;
    assert_eq!(response["result"]["agentCapabilities"]["_meta"][SUMMARY], 1);
    socket
}

async fn summary(socket: &mut SharedSocket, session: &str, turn: &str) -> Value {
    ws_rpc(
        socket,
        500,
        "_co.grida/session/turn-summary",
        json!({"sessionId":session,"turnId":turn}),
    )
    .await
}

#[tokio::test]
async fn terminal_summaries_reopen_with_exact_turn_status_and_never_start_provider_work() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Finished and ready to review."),
        Reply::Stop("length"),
        Reply::Hold("Partial answer."),
    ])
    .await;
    let (first, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = connect(&url).await;
    let created = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let mut retained = Vec::new();
    for (index, status) in ["succeeded", "failed", "cancelled"].into_iter().enumerate() {
        let accepted = ws_rpc(
            &mut socket,
            index as u64 + 3,
            "_co.grida/session/submit",
            prompt_request(session, &format!("input-{index}"), "Run the fixture."),
        )
        .await;
        let turn = accepted["result"]["turnId"].as_str().unwrap();
        endpoint.request().await;
        if status == "cancelled" {
            let pending = summary(&mut socket, session, turn).await;
            assert!(
                pending["error"]
                    .to_string()
                    .contains("turn_summary_unavailable")
            );
            let snapshot = session_snapshot(&mut socket, session).await;
            let stop = ws_rpc(
                &mut socket,
                6,
                "_co.grida/session/stop",
                task_basis(&snapshot, session, "stop-summary-fixture"),
            )
            .await;
            assert!(stop.get("error").is_none(), "{stop}");
        }
        wait_for_snapshot(&mut socket, session, |snapshot| {
            snapshot["current"].is_null() && snapshot["latest"]["turnId"] == turn
        })
        .await;
        let recorded = summary(&mut socket, session, turn).await;
        let result = &recorded["result"];
        assert_eq!(result["status"], status, "{recorded}");
        assert_eq!(result["turnId"], turn);
        assert!(!result["text"].as_str().unwrap().trim().is_empty());
        assert_eq!(result["textTruncated"], false);
        assert_eq!(result["toolActivity"]["succeeded"], 0);
        if status == "succeeded" {
            assert_eq!(result["text"], "Finished and ready to review.");
        }
        retained.push((turn.to_owned(), result.clone()));
    }
    drop(socket);
    terminate_shared_server(first).await;

    let (second, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = connect(&url).await;
    assert!(
        summary(&mut socket, session, &retained[0].0)
            .await
            .get("error")
            .is_some()
    );
    let loaded = ws_rpc(
        &mut socket,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    for (turn, expected) in retained {
        assert_eq!(
            summary(&mut socket, session, &turn).await["result"],
            expected
        );
    }
    assert!(endpoint.requests.try_recv().is_err());
    drop(socket);
    terminate_shared_server(second).await;
    endpoint.done().await;
}
