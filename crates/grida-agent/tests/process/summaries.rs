use super::lifecycle::{
    prompt_request, queue_basis, session_snapshot, task_basis, terminate_shared_server,
    wait_for_snapshot,
};
use super::*;

const SUMMARY: &str = "co.grida/session/turn-summary";
const PRIVATE_DIAGNOSTIC: &str = "fixture private provider diagnostic";

fn rejected(status: &str, code: &str) -> Reply {
    let body = json!({"error":{"code":code,"message":PRIVATE_DIAGNOSTIC}}).to_string();
    Reply::RawHttp(format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ))
}

fn reported_usage_answer() -> Reply {
    let mut body = fixture_body(
        Reply::Finished("Finished and ready to review."),
        ProviderProtocol::OpenAiCompatible,
    );
    body.truncate(body.len() - "data: [DONE]\n\n".len());
    for prompt_tokens in [5, 11, 11] {
        let usage = json!({
            "id": "fixture-response",
            "choices": [],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": 3,
                "prompt_tokens_details": { "cached_tokens": 0 }
            }
        });
        use std::fmt::Write as _;
        write!(body, "data: {usage}\n\n").unwrap();
    }
    body.push_str("data: [DONE]\n\n");
    Reply::RawHttp(format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ))
}

async fn connect(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut request = extension_initialize();
    request["clientCapabilities"]["_meta"][SUMMARY] = 1.into();
    request["clientCapabilities"]["_meta"]["co.grida/session/compact"] = 1.into();
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
    let partial = fixture_body(
        Reply::Hold("Unconfirmed partial answer."),
        ProviderProtocol::OpenAiCompatible,
    );
    let (mut replies, expected): (Vec<_>, Vec<_>) = [
        (
            reported_usage_answer(),
            "succeeded",
            "Finished and ready to review.",
        ),
        (
            rejected("401 Unauthorized", "invalid_api_key"),
            "failed",
            "The provider rejected authentication or access. Check the provider's credentials and permissions.",
        ),
        (
            rejected("429 Too Many Requests", "insufficient_quota"),
            "failed",
            "The provider's quota or billing limit blocked this turn. Check its balance or quota, or choose another provider.",
        ),
        (
            rejected("404 Not Found", "model_not_found"),
            "failed",
            "The selected model is unavailable from this provider. Choose another model or check your access.",
        ),
        (
            rejected("429 Too Many Requests", "rate_limit_exceeded"),
            "failed",
            "The provider rate limit prevented this turn from finishing. Wait before trying again.",
        ),
        (
            rejected("400 Bad Request", "context_length_exceeded"),
            "failed",
            "The request exceeds the selected model's context limit. Shorten the input or compact the conversation.",
        ),
        (
            Reply::Stop("length"),
            "failed",
            "The model reached its output limit. Ask for a shorter response.",
        ),
        (
            Reply::Stop("content_filter"),
            "failed",
            "The model declined the request.",
        ),
        (
            Reply::RawHttp(format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 1048576\r\nConnection: close\r\n\r\n{partial}"
            )),
            "uncertain",
            "The provider did not confirm the result. Review any partial work before trying again.",
        ),
        (
            Reply::Hold("Partial answer."),
            "cancelled",
            "Work was stopped.",
        ),
    ]
    .into_iter()
    .map(|(reply, status, text)| (reply, (status, text)))
    .unzip();
    replies.push(Reply::Stop("length"));
    let mut endpoint = Endpoint::start(replies).await;
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
    for (index, (status, text)) in expected.into_iter().enumerate() {
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
                100,
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
        assert_eq!(result["text"], text);
        assert_eq!(result["textTruncated"], false);
        assert_eq!(result["toolActivity"]["succeeded"], 0);
        let usage = if index == 0 {
            json!({
                "reported": [
                    {"category":"input","tokens":"11","partial":false},
                    {"category":"output","tokens":"3","partial":false},
                    {"category":"cached_input","tokens":"0","partial":false}
                ],
                "attemptsWithoutCounts": 0
            })
        } else {
            json!({"reported":[],"attemptsWithoutCounts":1})
        };
        assert_eq!(result["tokenUsage"], usage, "{recorded}");
        if status == "uncertain" {
            assert_eq!(result["unresolvedOperations"], 1);
        }
        assert!(!result.to_string().contains(PRIVATE_DIAGNOSTIC));
        retained.push((turn.to_owned(), result.clone()));
    }
    let stopped = session_snapshot(&mut socket, session).await;
    let resumed = ws_rpc(
        &mut socket,
        101,
        "_co.grida/session/resume-queue",
        queue_basis(&stopped, session, "resume-for-compaction"),
    )
    .await;
    assert!(resumed.get("result").is_some(), "{resumed}");
    let compaction = ws_rpc(
        &mut socket,
        102,
        "_co.grida/session/compact",
        json!({"sessionId":session,"requestId":"unavailable-summary"}),
    )
    .await;
    assert_eq!(compaction["result"]["status"], "failed", "{compaction}");
    endpoint.request().await;
    let turn = compaction["result"]["turnId"].as_str().unwrap();
    let fallback = summary(&mut socket, session, turn).await;
    assert_eq!(fallback["result"]["status"], "failed");
    assert_eq!(fallback["result"]["text"], "The turn failed.");
    assert!(fallback["result"]["toolActivity"].is_null());
    assert!(fallback["result"]["unresolvedOperations"].is_null());
    assert!(fallback["result"].get("tokenUsage").is_none());
    retained.push((turn.to_owned(), fallback["result"].clone()));
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
