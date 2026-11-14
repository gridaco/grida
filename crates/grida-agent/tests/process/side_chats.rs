//! GRIDA-SEC-004 — Side chats are ordinary temporary chats under the parent's
//! authority, private to the connection that opened them.

use super::approvals::{Fixture, Stdio as Client};
use super::lifecycle::{prompt_request, terminate_shared_server};
use super::*;
use std::fs;
use std::path::PathBuf;

const OPEN: &str = "_co.grida/side-chat/open";
const CLOSE: &str = "_co.grida/side-chat/close";
const SNAPSHOT: &str = "_co.grida/session/snapshot";
const SUBMIT: &str = "_co.grida/session/submit";
const LIVE: &str = "co.grida/session/updates";
const REFUSALS: [&str; 8] = [
    "fork",
    "side_chat",
    "compaction",
    "goals",
    "subagents",
    "delegation",
    "wakeups",
    "catalog",
];

fn capabilities() -> Value {
    let mut initialize = extension_initialize();
    let meta = initialize["clientCapabilities"]["_meta"]
        .as_object_mut()
        .unwrap();
    for key in [
        &OPEN[1..],
        &CLOSE[1..],
        LIVE,
        "co.grida/session/compact",
        "co.grida/session/organize",
        "co.grida/session/delete",
        "co.grida/session/delete-preview",
        "co.grida/session/effort",
        "co.grida/session/wakeups",
        "co.grida/session/cancel-wakeup",
        "co.grida/session/recover-wakeup",
        "co.grida/session/approvals",
        "co.grida/session/answer-approval",
        "co.grida/subagent/create",
        "co.grida/goal/start",
    ] {
        meta.insert(key.into(), 1.into());
    }
    initialize
}

async fn initialized(mut client: Client) -> Client {
    let response = client.request("initialize", capabilities()).await;
    for key in [OPEN, CLOSE] {
        assert_eq!(
            response["result"]["agentCapabilities"]["_meta"][&key[1..]],
            1,
            "{response}"
        );
    }
    client
}

/// A private stdio host that can delegate, so side-chat refusals are its own.
async fn start(state: &Path, endpoint: &str) -> Client {
    let mut command = executable();
    command.args([
        "serve",
        "--stdio",
        "--subagents",
        "--max-output-tokens",
        "128",
    ]);
    configured(&mut command, state, endpoint);
    initialized(Client::from_child(
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    ))
    .await
}

fn ok(response: Value) -> Value {
    assert!(response.get("error").is_none(), "{response}");
    response["result"].clone()
}

fn refused(response: &Value, code: &str) {
    assert_eq!(response["error"]["data"], code, "{response}");
}

async fn created(client: &mut Client, cwd: &Path) -> String {
    let created = ok(client
        .request("session/new", json!({"cwd":cwd,"mcpServers":[]}))
        .await);
    created["sessionId"].as_str().unwrap().to_owned()
}

async fn answered(client: &mut Client, session: &str, text: &str) {
    let replied = ok(client
        .request(
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":text}]}),
        )
        .await);
    assert_eq!(replied["stopReason"], "end_turn", "{replied}");
}

async fn open(client: &mut Client, parent: &str) -> (String, Value) {
    let opened = ok(client.request(OPEN, json!({"sessionId":parent})).await);
    (opened["sideChatId"].as_str().unwrap().to_owned(), opened)
}

async fn snapshot(client: &mut Client, session: &str) -> Value {
    ok(client.request(SNAPSHOT, json!({"sessionId":session})).await)
}

async fn settled(client: &mut Client, session: &str) -> Value {
    timeout(WAIT, async {
        loop {
            let view = snapshot(client, session).await;
            if view["current"].is_null() && !view["latest"].is_null() {
                return view;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

/// What `grida-agent inspect` reports for a session once no host owns the state.
async fn inspected(state: &Path, session: &str) -> std::process::Output {
    let mut command = executable();
    command
        .arg("inspect")
        .arg("--state-dir")
        .arg(state)
        .arg(session);
    timeout(WAIT, command.output()).await.unwrap().unwrap()
}

async fn assert_discarded(state: &Path, session: &str) {
    let output = inspected(state, session).await;
    assert!(!output.status.success());
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("session_missing"),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn text(message: &Value) -> String {
    match &message["content"] {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

#[tokio::test]
async fn a_side_chat_forks_committed_context_and_runs_as_an_ordinary_temporary_chat() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let cwd = workspace.path();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Parent answer: keep the discount at checkout."),
        Reply::Finished("Side answer about the discount."),
    ])
    .await;
    let mut client = start(&state, &endpoint.url).await;
    let parent = created(&mut client, cwd).await;
    answered(
        &mut client,
        &parent,
        "Where should the cart discount apply?",
    )
    .await;
    endpoint.request().await;
    let before = snapshot(&mut client, &parent).await;
    let history = ok(client
        .request("_co.grida/session/history", json!({"sessionId":parent}))
        .await);

    let (side, opened) = open(&mut client, &parent).await;
    assert!(side.starts_with("side/"), "{opened}");
    assert_eq!(opened["parentSessionId"], parent);
    assert_eq!(opened["temporary"], true);
    assert_eq!(opened["compacted"], false);
    assert!(opened.get("truncated").is_none(), "{opened}");
    assert_eq!(opened["sourceContext"], history["basis"]);
    assert_eq!(opened["omissions"]["toolCalls"], 0, "{opened}");
    assert!(endpoint.requests.try_recv().is_err());
    assert_eq!(snapshot(&mut client, &parent).await, before);

    let view = snapshot(&mut client, &side).await;
    assert_eq!(view["side"]["parentSessionId"], parent, "{view}");
    assert_eq!(view["side"]["temporary"], true);
    assert_eq!(view["side"]["unavailable"], json!(REFUSALS));
    assert!(before.get("side").is_none(), "{before}");
    let listed = ok(client.request("session/list", json!({"cwd":cwd})).await);
    let ids: Vec<_> = listed["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["sessionId"].as_str().unwrap())
        .collect();
    assert_eq!(ids, [parent.as_str()]);

    // An ordinary identified submission streams live text on this connection.
    let sent = client
        .send(
            SUBMIT,
            prompt_request(&side, "side-question", "Why at checkout?"),
        )
        .await;
    let mut streamed = false;
    let accepted = timeout(WAIT, async {
        let mut reply = None;
        while reply.is_none() || !streamed {
            let frame = client.read_frame().await;
            if frame["id"] == sent {
                reply = Some(frame);
            } else if frame["method"] == "session/update"
                && frame["params"]["sessionId"] == side
                && frame["params"]["_meta"].get(LIVE).is_some()
            {
                streamed = true;
            }
        }
        reply.unwrap()
    })
    .await
    .unwrap();
    assert_eq!(ok(accepted)["disposition"], "claimed");
    let request = endpoint.request().await;
    let done = settled(&mut client, &side).await;
    assert_eq!(done["latest"]["status"], "succeeded", "{done}");

    // The policy leads, then the inherited history, then the boundary, then
    // the person's first side question.
    let messages = request["messages"].as_array().unwrap();
    assert_eq!(messages[0]["role"], "system");
    assert!(
        text(&messages[0]).contains("This is a side chat"),
        "{request}"
    );
    let position = |needle: &str| {
        messages
            .iter()
            .position(|message| text(message).contains(needle))
            .unwrap_or_else(|| panic!("{needle}: {request}"))
    };
    let inherited = position("Parent answer: keep the discount");
    let boundary = position("Side chat boundary.");
    assert!(position("Where should the cart discount apply?") < inherited);
    assert!(inherited < boundary);
    assert_eq!(boundary + 1, messages.len() - 1);
    assert_eq!(messages[boundary]["role"], "user");
    assert_eq!(text(messages.last().unwrap()), "Why at checkout?");

    // The parent is unchanged by the side chat's work.
    assert_eq!(snapshot(&mut client, &parent).await, before);
    let parent_history = client
        .request("_co.grida/session/history", json!({"sessionId":parent}))
        .await;
    assert!(!parent_history.to_string().contains("Side answer"));

    // Operations a side chat does not offer.
    let side_history = ok(client
        .request("_co.grida/session/history", json!({"sessionId":side}))
        .await);
    refused(
        &client
            .request(
                "_co.grida/session/fork",
                json!({
                    "sessionId":side,"requestId":"fork","expectedHistory":side_history["basis"],
                    "anchor":side_history["latestAnchor"],
                }),
            )
            .await,
        "side_chat_fork_unavailable",
    );
    refused(
        &client.request(OPEN, json!({"sessionId":side})).await,
        "side_chat_nested_unavailable",
    );
    refused(
        &client
            .request(
                "_co.grida/session/compact",
                json!({"sessionId":side,"requestId":"compact"}),
            )
            .await,
        "side_chat_compaction_unavailable",
    );
    refused(
        &client
            .request(
                "_co.grida/goal/start",
                json!({
                    "sessionId":side,"inputId":"goal",
                    "prompt":[{"type":"text","text":"Prepare the export"}],
                    "goal":{
                        "objective":{"description":"Prepare the export","criteria":["It opens"]},
                        "allowance":{"work_turns":1,"inference_steps":2},"automatic":true
                    }
                }),
            )
            .await,
        "side_chat_goals_unavailable",
    );
    refused(
        &client
            .request(
                "_co.grida/subagent/create",
                json!({
                    "parentSessionId":side,"requestId":"child","name":"Reader","workTurns":1,
                }),
            )
            .await,
        "side_chat_subagents_unavailable",
    );
    let mut delegated = prompt_request(&side, "delegated", "Review this.");
    delegated["effort"] = "ultra".into();
    refused(
        &client.request(SUBMIT, delegated).await,
        "side_chat_delegation_unavailable",
    );
    let mut scheduled = prompt_request(&side, "scheduled", "Check back later.");
    scheduled["allowWakeups"] = true.into();
    refused(
        &client.request(SUBMIT, scheduled).await,
        "side_chat_wakeups_unavailable",
    );
    refused(
        &client
            .request("_co.grida/session/catalog-entry", json!({"sessionId":side}))
            .await,
        "side_chat_catalog_unavailable",
    );
    refused(
        &client
            .request(
                "_co.grida/session/organize",
                json!({"sessionId":side,"revision":0,"title":"Saved","archived":false}),
            )
            .await,
        "side_chat_catalog_unavailable",
    );
    refused(
        &client
            .request(
                "_co.grida/session/delete-preview",
                json!({"sessionId":side,"cwd":cwd}),
            )
            .await,
        "side_chat_catalog_unavailable",
    );
    assert!(endpoint.requests.try_recv().is_err());

    assert_eq!(
        ok(client.request(CLOSE, json!({"sideChatId":side})).await),
        json!({})
    );
    refused(
        &client.request(SNAPSHOT, json!({"sessionId":side})).await,
        "session_setup_required",
    );
    refused(
        &client.request(CLOSE, json!({"sideChatId":side})).await,
        "side_chat_unavailable",
    );
    assert_eq!(snapshot(&mut client, &parent).await, before);
    client.close().await;
    endpoint.done().await;
    assert_discarded(&state, &side).await;
}

#[tokio::test]
async fn an_edited_side_question_keeps_earlier_side_turns_after_the_boundary() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Parent answer."),
        Reply::Finished("First side answer."),
        Reply::Finished("Second side answer."),
        Reply::Finished("Edited side answer."),
    ])
    .await;
    let mut client = start(&state, &endpoint.url).await;
    let parent = created(&mut client, workspace.path()).await;
    answered(&mut client, &parent, "Parent question.").await;
    endpoint.request().await;
    let (side, _) = open(&mut client, &parent).await;
    for (input, question) in [
        ("first", "First side question."),
        ("second", "Second side question."),
    ] {
        ok(client
            .request(SUBMIT, prompt_request(&side, input, question))
            .await);
        endpoint.request().await;
        settled(&mut client, &side).await;
    }
    let history = ok(client
        .request("_co.grida/session/history", json!({"sessionId":side}))
        .await);
    assert_eq!(history["messages"][4]["preview"], "Second side question.");
    let revised = ok(client
        .request(
            "_co.grida/session/revise",
            json!({
                "sessionId":side,"requestId":"edit","expectedSessionRevision":history["sessionRevision"],
                "expectedHistory":history["basis"],"anchor":history["messages"][4]["anchor"],
                "replacementInputId":"edited","prompt":[{"type":"text","text":"Edited side question."}],
            }),
        )
        .await);
    assert_eq!(revised["sessionId"], side);
    let request = endpoint.request().await;
    settled(&mut client, &side).await;
    let messages = request["messages"].as_array().unwrap();
    let position = |needle: &str| {
        messages
            .iter()
            .position(|message| text(message).contains(needle))
            .unwrap_or_else(|| panic!("{needle}: {request}"))
    };
    assert!(position("Parent answer.") < position("Side chat boundary."));
    assert!(position("Side chat boundary.") < position("First side question."));
    assert!(!request.to_string().contains("Second side question."));
    assert_eq!(text(messages.last().unwrap()), "Edited side question.");
    ok(client.request(CLOSE, json!({"sideChatId":side})).await);
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn automatic_compaction_summarizes_inherited_history_ahead_of_the_boundary() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Parent answer about the export."),
        Reply::Finished("Inherited summary: keep the export format."),
        Reply::Finished("First side answer."),
        Reply::Finished("Second side answer."),
    ])
    .await;
    let mut client = start(&state, &endpoint.url).await;
    let parent = created(&mut client, workspace.path()).await;
    let older = format!("Earlier requirements {}", "a".repeat(105_000));
    answered(&mut client, &parent, &older).await;
    endpoint.request().await;
    let (side, opened) = open(&mut client, &parent).await;
    assert_eq!(opened["compacted"], false);
    refused(
        &client
            .request(
                "_co.grida/session/compact",
                json!({"sessionId":side,"requestId":"manual"}),
            )
            .await,
        "side_chat_compaction_unavailable",
    );

    ok(client
        .request(
            SUBMIT,
            prompt_request(&side, "first", "First side question."),
        )
        .await);
    // The summary covers only the inherited history.
    let summary = endpoint.request().await;
    assert!(summary.get("tools").is_none(), "{summary}");
    let source = summary["messages"].to_string();
    assert!(source.contains("Earlier requirements"));
    assert!(source.contains("Parent answer about the export."));
    assert!(!source.contains("First side question."));
    assert!(!source.contains("Side chat boundary."));

    let first = endpoint.request().await;
    settled(&mut client, &side).await;
    ok(client
        .request(
            SUBMIT,
            prompt_request(&side, "second", "Second side question."),
        )
        .await);
    let second = endpoint.request().await;
    let done = settled(&mut client, &side).await;
    assert_eq!(done["latest"]["status"], "succeeded", "{done}");
    for request in [&first, &second] {
        assert!(
            !request.to_string().contains("Earlier requirements"),
            "{request}"
        );
        let messages = request["messages"].as_array().unwrap();
        assert_eq!(messages[0]["role"], "system");
        assert!(
            text(&messages[0]).contains("This is a side chat"),
            "{request}"
        );
        let position = |needle: &str| {
            messages
                .iter()
                .position(|message| text(message).contains(needle))
                .unwrap_or_else(|| panic!("{needle}: {request}"))
        };
        assert!(
            position("Inherited summary: keep the export format.")
                < position("Side chat boundary.")
        );
        assert_eq!(
            position("Side chat boundary.") + 1,
            position("First side question.")
        );
    }
    let messages = second["messages"].as_array().unwrap();
    assert_eq!(text(messages.last().unwrap()), "Second side question.");
    assert!(second.to_string().contains("First side answer."));

    // The parent keeps its own uncompacted context.
    let parent_history = client
        .request("_co.grida/session/history", json!({"sessionId":parent}))
        .await;
    assert!(!parent_history.to_string().contains("Inherited summary"));
    ok(client.request(CLOSE, json!({"sideChatId":side})).await);
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn side_chat_tools_follow_the_parent_permissions_and_ask_the_same_way() {
    let fixture = Fixture::new(false);
    fs::write(fixture.extra.join("note"), "side fixture text").unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Parent ready."),
        Reply::Tool("read_file", r#"{"directory":"extra","path":"note"}"#),
        Reply::Finished("The note is read."),
    ])
    .await;
    let mut client = initialized(Client::from_child(
        fixture
            .process(&endpoint.url, "serve")
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    ))
    .await;
    let parent = created(&mut client, &fixture.primary).await;
    answered(&mut client, &parent, "Prepare to read notes.").await;
    let parent_request = endpoint.request().await;
    let (side, _) = open(&mut client, &parent).await;

    let accepted = ok(client
        .request(
            SUBMIT,
            prompt_request(&side, "read", "Read the extra note."),
        )
        .await);
    let turn = accepted["turnId"].as_str().unwrap().to_owned();
    let side_request = endpoint.request().await;
    let names = |request: &Value| {
        let mut names: Vec<_> = request["tools"]
            .as_array()
            .map(|tools| {
                tools
                    .iter()
                    .map(|tool| tool["function"]["name"].as_str().unwrap().to_owned())
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    };
    assert!(names(&side_request).contains(&"read_file".to_owned()));
    assert_eq!(names(&side_request), names(&parent_request));

    let listed = timeout(WAIT, async {
        loop {
            let listed = ok(client
                .request(
                    "_co.grida/session/approvals",
                    json!({"sessionId":side,"turnId":turn}),
                )
                .await);
            if !listed["approvals"].as_array().unwrap().is_empty() {
                return listed;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(listed["approvals"][0]["request"]["directory"], "extra");
    let view = snapshot(&mut client, &side).await;
    let answered = ok(client
        .request(
            "_co.grida/session/answer-approval",
            json!({
                "sessionId":side,"turnId":turn,"waitId":listed["approvals"][0]["waitId"],
                "requestId":"approve","expectedSessionRevision":view["sessionRevision"],
                "expectedControlRevision":listed["controlRevision"],"decision":"approve_once",
            }),
        )
        .await);
    assert_eq!(answered["sessionId"], side);
    assert!(
        endpoint.request().await["messages"]
            .to_string()
            .contains("side fixture text")
    );
    let done = settled(&mut client, &side).await;
    assert_eq!(done["latest"]["status"], "succeeded", "{done}");
    ok(client.request(CLOSE, json!({"sideChatId":side})).await);
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn closing_deleting_the_parent_or_disconnecting_discards_side_chats() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let cwd = workspace.path();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("First parent answer."),
        Reply::Hold("A side turn still running."),
        Reply::Finished("Second parent answer."),
        Reply::Hold("Another side turn still running."),
    ])
    .await;
    let mut client = start(&state, &endpoint.url).await;
    let first = created(&mut client, cwd).await;
    answered(&mut client, &first, "First topic.").await;
    endpoint.request().await;

    // Close stops a running side turn and discards the side chat.
    let (running, _) = open(&mut client, &first).await;
    let accepted = ok(client
        .request(SUBMIT, prompt_request(&running, "running", "Keep going."))
        .await);
    assert_eq!(accepted["disposition"], "claimed");
    endpoint.request().await;
    ok(client.request(CLOSE, json!({"sideChatId":running})).await);

    // Deleting the parent discards its side chats.
    let (orphaned, _) = open(&mut client, &first).await;
    let params = super::deletion::deletion(&mut client, &first, cwd).await;
    ok(client.request("_co.grida/session/delete", params).await);
    refused(
        &client
            .request(SNAPSHOT, json!({"sessionId":orphaned}))
            .await,
        "session_setup_required",
    );
    refused(
        &client.request(CLOSE, json!({"sideChatId":orphaned})).await,
        "side_chat_unavailable",
    );

    // Closing the connection discards a side chat with a running turn.
    let second = created(&mut client, cwd).await;
    answered(&mut client, &second, "Second topic.").await;
    endpoint.request().await;
    let (open_at_exit, _) = open(&mut client, &second).await;
    let accepted = ok(client
        .request(
            SUBMIT,
            prompt_request(&open_at_exit, "held", "Look around."),
        )
        .await);
    assert_eq!(accepted["disposition"], "claimed");
    endpoint.request().await;
    client.close().await;
    endpoint.done().await;
    for side in [&running, &orphaned, &open_at_exit] {
        assert_discarded(&state, side).await;
    }
    assert!(inspected(&state, &second).await.status.success());
}

#[tokio::test]
async fn a_side_chat_left_by_a_crash_is_swept_before_the_next_host_serves() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Parent answer.")]).await;
    let mut client = start(&state, &endpoint.url).await;
    let parent = created(&mut client, workspace.path()).await;
    answered(&mut client, &parent, "Keep this chat.").await;
    endpoint.request().await;
    let (side, _) = open(&mut client, &parent).await;
    client.kill().await;
    endpoint.done().await;
    assert!(inspected(&state, &side).await.status.success());

    let restarted = start(&state, "http://127.0.0.1:9/v1").await;
    restarted.close().await;
    assert_discarded(&state, &side).await;
    assert!(inspected(&state, &parent).await.status.success());
}

#[tokio::test]
async fn side_chat_controls_require_private_stdio_and_an_attached_parent() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let mut stdio = start(&state, "http://127.0.0.1:9/v1").await;
    refused(
        &stdio.request(OPEN, json!({"sessionId":"unknown"})).await,
        "session_setup_required",
    );
    refused(
        &stdio.request(CLOSE, json!({"sideChatId":"unknown"})).await,
        "side_chat_unavailable",
    );
    stdio.close().await;

    let (host, url) = shared_server(&state, "http://127.0.0.1:9/v1").await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let initialized = ws_rpc(&mut socket, 1, "initialize", capabilities()).await;
    for key in [OPEN, CLOSE] {
        assert!(
            initialized["result"]["agentCapabilities"]["_meta"]
                .get(&key[1..])
                .is_none()
        );
    }
    let refused = ws_rpc(&mut socket, 2, OPEN, json!({"sessionId":"unknown"})).await;
    assert_eq!(refused["error"]["code"], -32601);
    drop(socket);
    terminate_shared_server(host).await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn closing_a_side_chat_stops_its_background_processes() {
    let fixture = Fixture::new(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandReadWrite"] = json!("allow");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let beat = fixture.primary.join("beat");
    let command = json!({
        "access":"read_write",
        "cmd":"while :; do printf . >> beat; /bin/sleep 0.05; done",
        "yield_time_ms":250,
    })
    .to_string();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Parent ready."),
        Reply::Tool("exec_command", command.leak()),
        Reply::Finished("Started in the background."),
    ])
    .await;
    let mut client = initialized(Client::from_child(
        fixture
            .process(&endpoint.url, "serve")
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    ))
    .await;
    let parent = created(&mut client, &fixture.primary).await;
    answered(&mut client, &parent, "Prepare.").await;
    endpoint.request().await;
    let (side, _) = open(&mut client, &parent).await;
    ok(client
        .request(SUBMIT, prompt_request(&side, "start", "Run the heartbeat."))
        .await);
    endpoint.request().await;
    endpoint.request().await;
    let done = settled(&mut client, &side).await;
    assert_eq!(done["latest"]["status"], "succeeded", "{done}");
    let growing = |path: PathBuf| async move {
        let before = fs::metadata(&path).map_or(0, |metadata| metadata.len());
        tokio::time::sleep(Duration::from_millis(400)).await;
        fs::metadata(&path).map_or(0, |metadata| metadata.len()) > before
    };
    assert!(growing(beat.clone()).await);
    ok(client.request(CLOSE, json!({"sideChatId":side})).await);
    assert!(!growing(beat).await);
    client.close().await;
    endpoint.done().await;
}
