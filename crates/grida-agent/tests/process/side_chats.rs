//! GRIDA-SEC-004 — Side chats keep the parent task and its authority separate.

use super::approvals::Stdio as PrivateStdio;
use super::lifecycle::{prompt_request, terminate_shared_server};
use super::*;

const OPEN: &str = "_co.grida/side-chat/open";
const ASK: &str = "_co.grida/side-chat/ask";
const CLOSE: &str = "_co.grida/side-chat/close";

fn capabilities() -> Value {
    let mut initialize = extension_initialize();
    let meta = initialize["clientCapabilities"]["_meta"]
        .as_object_mut()
        .unwrap();
    for key in [OPEN, ASK, CLOSE] {
        meta.insert(key[1..].into(), 1.into());
    }
    for key in [
        "co.grida/session/compact",
        "co.grida/session/questions",
        "co.grida/session/answer-question",
    ] {
        meta.insert(key.into(), 1.into());
    }
    initialize
}

async fn client(state: &Path, endpoint: &str) -> PrivateStdio {
    let mut client = PrivateStdio::from_child(spawn_serve(state, endpoint));
    let response = client.request("initialize", capabilities()).await;
    for key in [OPEN, ASK, CLOSE] {
        assert_eq!(
            response["result"]["agentCapabilities"]["_meta"][&key[1..]],
            1
        );
    }
    client
}

async fn snapshot(client: &mut PrivateStdio, session: &str) -> Value {
    let response = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(response.get("error").is_none(), "{response}");
    response["result"].clone()
}

fn side_input(id: &Value, request: &str, text: &str) -> Value {
    json!({"sideChatId":id,"requestId":request,"text":text})
}

#[tokio::test]
async fn side_chat_reuses_compacted_context_and_closes_without_controlling_the_parent() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let (release_parent, parent_held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("The original response."),
        Reply::Finished("Retained summary of project decisions."),
        Reply::Release("Parent finished its own task.", parent_held),
        Reply::Finished("The side answer."),
        Reply::Finished("The side follow-up."),
        Reply::Hold("Side work is still streaming."),
    ])
    .await;
    let mut client = client(&state, &endpoint.url).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let parent = created["result"]["sessionId"].as_str().unwrap();
    let original = "An original requirement that only the parent transcript retains. ".repeat(24);
    let replied = client
        .request(
            "session/prompt",
            json!({
                "sessionId":parent,"prompt":[{"type":"text","text":original}],
            }),
        )
        .await;
    assert_eq!(replied["result"]["stopReason"], "end_turn", "{replied}");
    endpoint.request().await;
    let compacted = client
        .request(
            "_co.grida/session/compact",
            json!({"sessionId":parent,"requestId":"compact"}),
        )
        .await;
    assert_eq!(compacted["result"]["status"], "installed", "{compacted}");
    endpoint.request().await;
    let started = client
        .request(
            "_co.grida/session/submit",
            prompt_request(parent, "parent-active", "Continue the main task."),
        )
        .await;
    assert_eq!(started["result"]["disposition"], "claimed", "{started}");
    let parent_request = endpoint.request().await;
    assert!(
        parent_request["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tool| tool["function"]["name"] == "question")
    );
    let active = snapshot(&mut client, parent).await;
    assert_eq!(active["current"]["disposition"], "running");
    assert_eq!(active["current"]["turnId"], started["result"]["turnId"]);

    let open = json!({"sessionId":parent,"requestId":"open"});
    let opened = client.request(OPEN, open.clone()).await;
    assert_eq!(opened["result"]["parentSessionId"], parent);
    assert_eq!(opened["result"]["compacted"], true);
    assert_eq!(opened["result"]["temporary"], true);
    assert_eq!(opened["result"]["readOnly"], true);
    assert_eq!(
        opened["result"]["sourceContext"]["tail"]["turn"],
        active["current"]["turnId"]
    );
    let side = &opened["result"]["sideChatId"];
    assert_ne!(side, parent);
    assert_eq!(client.request(OPEN, open).await["result"], opened["result"]);
    assert!(endpoint.requests.try_recv().is_err());

    let refused = client
        .request(
            "session/load",
            json!({
                "sessionId":side,"cwd":workspace.path(),"mcpServers":[],
            }),
        )
        .await;
    assert!(refused.get("error").is_some(), "{refused}");
    let asked = side_input(side, "first", "Explain one decision.");
    let first = client.request(ASK, asked.clone()).await;
    assert_eq!(first["result"]["status"], "succeeded", "{first}");
    assert_eq!(first["result"]["account"]["text"], "The side answer.");
    let request = endpoint.request().await;
    assert!(request.get("tools").is_none());
    let messages = request["messages"].as_array().unwrap();
    assert_eq!(messages[0]["role"], "system");
    assert!(
        messages[0]["content"]
            .as_str()
            .unwrap()
            .contains("read-only side chat")
    );
    assert_eq!(messages[1]["role"], "user");
    let background = messages[1]["content"].as_str().unwrap();
    assert!(background.contains("Retained summary of project decisions."));
    assert!(background.contains("Continue the main task."));
    assert!(!background.contains("An original requirement"));
    assert_eq!(messages.last().unwrap()["content"], "Explain one decision.");

    assert_eq!(client.request(ASK, asked).await["result"], first["result"]);
    let rejected = client
        .request(ASK, side_input(side, "first", "Changed."))
        .await;
    assert_eq!(rejected["error"]["data"], "submission_input_changed");
    assert!(endpoint.requests.try_recv().is_err());
    let follow_up = client
        .request(ASK, side_input(side, "second", "Go on."))
        .await;
    assert_eq!(
        follow_up["result"]["account"]["text"],
        "The side follow-up."
    );
    let request = endpoint.request().await;
    assert!(request["messages"].to_string().contains("The side answer."));
    assert!(request.get("tools").is_none());

    let running = client
        .send(ASK, side_input(side, "running", "Still looking?"))
        .await;
    endpoint.request().await;
    let closed = client.send(CLOSE, json!({"sideChatId":side})).await;
    let mut replies = [client.read_reply().await, client.read_reply().await];
    replies.sort_by_key(|reply| reply["id"].as_u64().unwrap());
    assert_eq!(replies[0]["id"], running);
    assert_eq!(
        replies[0]["error"]["data"], "side_chat_turn_unsettled",
        "{replies:?}"
    );
    assert_eq!(replies[1]["id"], closed);
    assert!(replies[1].get("result").is_some(), "{replies:?}");
    assert_eq!(snapshot(&mut client, parent).await, active);
    let gone = client
        .request(ASK, side_input(side, "after-close", "Continue."))
        .await;
    assert_eq!(gone["error"]["data"], "side_chat_unavailable");

    release_parent.send(()).unwrap();
    timeout(WAIT, async {
        loop {
            let view = snapshot(&mut client, parent).await;
            if view["current"].is_null() {
                assert_eq!(view["latest"]["status"], "succeeded");
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let retained = client
        .request("_co.grida/session/history", json!({"sessionId":parent}))
        .await;
    assert!(retained.to_string().contains("An original requirement"));
    assert!(!retained.to_string().contains("The side answer."));
    endpoint.done().await;
    client.close().await;

    let mut restarted = super::side_chats::client(&state, "http://127.0.0.1:9/v1").await;
    let gone = restarted
        .request(ASK, side_input(side, "after-restart", "Continue."))
        .await;
    assert_eq!(gone["error"]["data"], "side_chat_unavailable");
    restarted.close().await;
}

#[tokio::test]
async fn side_chat_controls_require_private_stdio_and_an_attached_parent() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let mut stdio = client(&state, "http://127.0.0.1:9/v1").await;
    let rejected = stdio
        .request(OPEN, json!({"sessionId":"unknown","requestId":"open"}))
        .await;
    assert_eq!(rejected["error"]["data"], "session_setup_required");
    stdio.close().await;

    let (host, url) = shared_server(&state, "http://127.0.0.1:9/v1").await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let initialized = ws_rpc(&mut socket, 1, "initialize", capabilities()).await;
    for key in [OPEN, ASK, CLOSE] {
        assert!(
            initialized["result"]["agentCapabilities"]["_meta"]
                .get(&key[1..])
                .is_none()
        );
    }
    let refused = ws_rpc(
        &mut socket,
        2,
        OPEN,
        json!({"sessionId":"unknown","requestId":"open"}),
    )
    .await;
    assert_eq!(refused["error"]["code"], -32601);
    drop(socket);
    terminate_shared_server(host).await;
}

#[tokio::test]
async fn stdio_eof_ends_active_side_inference_before_process_exit() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint =
        Endpoint::start(vec![Reply::Hold("Side response is still streaming.")]).await;
    let mut client = client(&state, &endpoint.url).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let opened = client
        .request(
            OPEN,
            json!({"sessionId":created["result"]["sessionId"],"requestId":"open"}),
        )
        .await;
    let side = &opened["result"]["sideChatId"];
    assert!(side.is_string(), "{opened}");
    client
        .send(ASK, side_input(side, "ask", "Explore this."))
        .await;
    endpoint.request().await;
    client.close().await;
    endpoint.done().await;
}
