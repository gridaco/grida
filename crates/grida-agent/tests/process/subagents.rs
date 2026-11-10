//! GRIDA-SEC-004 — the built private host retains child scope and assignment evidence.

use super::approvals::Stdio as PrivateStdio;
use super::summaries::reported_usage_answer;
use super::*;

const CREATE: &str = "_co.grida/subagent/create";
const ASSIGN: &str = "_co.grida/subagent/assign";
const SEND_MESSAGE: &str = "_co.grida/subagent/send-message";
const LIST: &str = "_co.grida/subagent/list";
const INSPECT: &str = "_co.grida/subagent/inspect";
const STOP: &str = "_co.grida/subagent/stop";
const PAUSE: &str = "_co.grida/subagent/pause";
const RESUME: &str = "_co.grida/subagent/resume";
const STEER: &str = "_co.grida/subagent/steer";
const RESUME_QUEUE: &str = "_co.grida/subagent/resume-queue";
const WITHDRAW: &str = "_co.grida/subagent/withdraw";
const SUMMARY: &str = "_co.grida/session/turn-summary";
const CAPABILITIES: [&str; 11] = [
    CREATE,
    ASSIGN,
    SEND_MESSAGE,
    LIST,
    INSPECT,
    STOP,
    PAUSE,
    RESUME,
    STEER,
    RESUME_QUEUE,
    WITHDRAW,
];

async fn serve(state: &Path, endpoint: &str) -> PrivateStdio {
    serve_with_key(state, endpoint, TEST_CREDENTIAL).await
}

async fn serve_with_key(state: &Path, endpoint: &str, key: &str) -> PrivateStdio {
    let mut command = executable();
    command.args([
        "serve",
        "--stdio",
        "--subagents",
        "--max-output-tokens",
        "128",
    ]);
    configured(&mut command, state, endpoint);
    command.env("GRIDA_AGENT_PROCESS_TEST_KEY", key);
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = PrivateStdio::from_child(child);
    let mut request = extension_initialize();
    for key in CAPABILITIES.into_iter().chain([SUMMARY]) {
        request["clientCapabilities"]["_meta"][&key[1..]] = 1.into();
    }
    let response = client.request("initialize", request).await;
    for key in CAPABILITIES.into_iter().chain([SUMMARY]) {
        assert_eq!(
            response["result"]["agentCapabilities"]["_meta"][&key[1..]],
            1
        );
    }
    client
}

async fn new_session(client: &mut PrivateStdio, workspace: &Path) -> String {
    let result = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    result["result"]["sessionId"].as_str().unwrap().into()
}

async fn settle_parent(client: &mut PrivateStdio, parent: &str) -> String {
    let result = client
        .request(
            "session/prompt",
            json!({
                "sessionId":parent,
                "prompt":[{"type":"text","text":"Parent-only context."}]
            }),
        )
        .await;
    assert_eq!(result["result"]["stopReason"], "end_turn", "{result}");
    let snapshot = client
        .request("_co.grida/session/snapshot", json!({"sessionId":parent}))
        .await;
    snapshot["result"]["latest"]["turnId"]
        .as_str()
        .unwrap()
        .into()
}

fn create(parent: &str) -> Value {
    json!({"parentSessionId":parent,"requestId":"create-researcher","name":"Researcher","workTurns":2})
}

fn assign(parent: &str, child: &str, parent_turn: &str, input: &str, text: &str) -> Value {
    json!({
        "parentSessionId":parent,"childId":child,"parentTurnId":parent_turn,
        "inputId":input,"instructions":text,
    })
}

fn note(parent: &str, child: &str, input: &str, text: &str) -> Value {
    json!({"parentSessionId":parent,"childId":child,"inputId":input,"text":text})
}

async fn inspect(client: &mut PrivateStdio, parent: &str, child: &str, input: &str) -> Value {
    let response = client
        .request(
            INSPECT,
            json!({
                "parentSessionId":parent,"childId":child,"inputId":input,
            }),
        )
        .await;
    assert!(response.get("error").is_none(), "{response}");
    response["result"].clone()
}

async fn observed_assignment(client: &mut PrivateStdio, parent: &str, child: &str) -> Value {
    let reply = client
        .request(INSPECT, json!({"parentSessionId":parent,"childId":child}))
        .await;
    assert!(reply.get("error").is_none(), "{reply}");
    assert!(reply["result"]["assignment"].is_null(), "{reply}");
    reply["result"]["observedAssignment"].clone()
}

async fn wait_for(
    client: &mut PrivateStdio,
    parent: &str,
    child: &str,
    input: &str,
    predicate: impl Fn(&Value) -> bool,
) -> Value {
    timeout(WAIT, async {
        loop {
            let view = inspect(client, parent, child, input).await;
            if predicate(&view) {
                return view;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap()
}

async fn load_parent(client: &mut PrivateStdio, parent: &str, workspace: &Path) {
    let loaded = client
        .request(
            "session/load",
            json!({"sessionId":parent,"cwd":workspace,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
}

fn child_basis(view: &Value, parent: &str, child: &str, request: &str) -> Value {
    json!({
        "parentSessionId":parent,"childId":child,"turnId":view["current"]["turnId"],
        "requestId":request,"expectedSessionRevision":view["sessionRevision"],
        "expectedControlRevision":view["current"]["controlRevision"],
    })
}

fn resume_basis(view: &Value, parent: &str, child: &str, request: &str) -> Value {
    json!({
        "task":child_basis(view,parent,child,request),
        "expectedEpoch":view["current"]["epoch"],
        "expectedJournalPosition":view["current"]["journalPosition"],
    })
}

fn queue_basis(view: &Value, parent: &str, child: &str, request: &str) -> Value {
    json!({
        "parentSessionId":parent,"childId":child,"requestId":request,
        "expectedSessionRevision":view["sessionRevision"],
    })
}

#[tokio::test]
async fn an_attached_parent_reopens_only_its_named_children_in_bounded_pages() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let provider = Endpoint::start(Vec::new()).await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let other = new_session(&mut first, workspace.path()).await;
    let foreign = first.request(CREATE, create(&other)).await;
    let mut expected = Vec::new();
    for index in 0..33 {
        let name = format!("Researcher {index}");
        let reply = first
            .request(
                CREATE,
                json!({
                    "parentSessionId":parent,
                    "requestId":format!("researcher-{index}"),
                    "name":name,
                    "workTurns":1,
                }),
            )
            .await;
        assert!(reply["result"]["childId"].is_string(), "{reply}");
        expected.push(json!({"childId":reply["result"]["childId"],"name":name}));
    }
    expected.reverse();
    first.close().await;

    let mut reopened = serve(&state, &provider.url).await;
    let first_page = json!({"parentSessionId":parent});
    assert!(
        reopened
            .request(LIST, first_page.clone())
            .await
            .get("error")
            .is_some()
    );
    load_parent(&mut reopened, &parent, workspace.path()).await;
    let page = reopened.request(LIST, first_page).await;
    assert_eq!(page["result"]["parentSessionId"], parent, "{page}");
    assert_eq!(page["result"]["children"], json!(&expected[..32]), "{page}");
    let cursor = &page["result"]["nextAfterChildId"];
    assert_eq!(*cursor, expected[31]["childId"]);
    let remainder = reopened
        .request(
            LIST,
            json!({"parentSessionId":parent,"afterChildId":cursor}),
        )
        .await;
    assert_eq!(remainder["result"]["children"], json!(&expected[32..]));
    assert!(remainder["result"]["nextAfterChildId"].is_null());
    let out_of_scope = reopened
        .request(
            LIST,
            json!({
                "parentSessionId":parent,
                "afterChildId":foreign["result"]["childId"],
            }),
        )
        .await;
    assert_eq!(out_of_scope["error"]["data"], "invalid_session_cursor");
    let newest = expected[0]["childId"].as_str().unwrap();
    assert!(
        observed_assignment(&mut reopened, &parent, newest)
            .await
            .is_null()
    );
    reopened.close().await;
    provider.done().await;
}

#[tokio::test]
async fn named_child_reuses_its_own_context_and_retains_exact_assignment_results() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut provider = Endpoint::start(vec![
        reported_usage_answer("Parent completed.", 13, 5),
        reported_usage_answer("First child finding.", 3, 1),
        reported_usage_answer("Second child finding.", 7, 2),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let parent_basis = json!({"sessionId":parent,"turnId":parent_turn});
    let parent_result = first.request(SUMMARY, parent_basis.clone()).await;
    let usage = |input, output| {
        json!({
            "reported": [
                {"category":"input","tokens":input,"partial":false},
                {"category":"output","tokens":output,"partial":false},
                {"category":"cached_input","tokens":"0","partial":false},
            ],
            "attemptsWithoutCounts": 0,
        })
    };
    assert_eq!(parent_result["result"]["tokenUsage"], usage("13", "5"));

    let created = first.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap().to_owned();
    assert_eq!(
        first.request(CREATE, create(&parent)).await["result"],
        created["result"]
    );
    let mut changed = create(&parent);
    changed["name"] = "Different name".into();
    assert!(first.request(CREATE, changed).await.get("error").is_some());

    let other_parent = new_session(&mut first, workspace.path()).await;
    let unrelated = first
        .request(
            INSPECT,
            json!({"parentSessionId":other_parent,"childId":child}),
        )
        .await;
    assert_eq!(unrelated["error"]["data"], "subagent_unavailable");
    let raw = first
        .request(
            "session/load",
            json!({
                "sessionId":child,"cwd":workspace.path(),"mcpServers":[]
            }),
        )
        .await;
    assert_eq!(raw["error"]["data"], "session_missing");
    let catalog = first
        .request("session/list", json!({"cwd":workspace.path()}))
        .await;
    let ids = catalog["result"]["sessions"].as_array().unwrap();
    assert!(ids.iter().all(|session| session["sessionId"] != child));

    let first_input = assign(
        &parent,
        &child,
        &parent_turn,
        "research-one",
        "Check the first point.",
    );
    let accepted = first.request(ASSIGN, first_input.clone()).await;
    assert_eq!(
        accepted["result"]["disposition"]["kind"], "queued",
        "{accepted}"
    );
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    assert!(messages.contains("You are a subagent"));
    assert!(messages.contains("Check the first point."));
    assert!(!messages.contains("Parent-only context."));
    assert!(!messages.contains("Parent completed."));
    assert_eq!(request["max_completion_tokens"], 128);
    assert!(request["tools"].as_array().is_none_or(Vec::is_empty));
    let before = wait_for(&mut first, &parent, &child, "research-one", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    let first_result = &before["assignment"];
    assert_eq!(before["name"], "Researcher");
    assert_eq!(before["allocation"], json!({"workTurns":2,"reserved":1}));
    assert_eq!(first_result["parentTurnId"], parent_turn);
    assert_eq!(first_result["result"]["text"], "First child finding.");
    assert_eq!(first_result["result"]["tokenUsage"], usage("3", "1"));
    assert_eq!(first_result["instructionPreview"], "Check the first point.");
    assert_eq!(first_result["instructionTruncated"], false);
    first.close().await;

    let mut second = serve(&state, &provider.url).await;
    load_parent(&mut second, &parent, workspace.path()).await;
    let retained = inspect(&mut second, &parent, &child, "research-one").await;
    assert_eq!(retained["assignment"], *first_result);
    assert_eq!(
        observed_assignment(&mut second, &parent, &child).await,
        *first_result
    );
    assert_eq!(
        second.request(SUMMARY, parent_basis).await["result"],
        parent_result["result"]
    );
    assert!(matches!(
        provider.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    assert_eq!(
        second.request(ASSIGN, first_input.clone()).await["result"],
        *first_result
    );
    let mut altered = first_input;
    altered["instructions"] = "Different work with the same input ID.".into();
    let conflict = second.request(ASSIGN, altered).await;
    assert_eq!(
        conflict["error"]["data"],
        "subagent_assignment_identity_reused"
    );

    let instructions = format!("Check the second point. {}", "🧩".repeat(300));
    let follow_up = assign(&parent, &child, &parent_turn, "research-two", &instructions);
    let accepted = second.request(ASSIGN, follow_up).await;
    assert_eq!(
        accepted["result"]["disposition"]["kind"], "queued",
        "{accepted}"
    );
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    assert!(messages.contains("First child finding."));
    assert!(messages.contains("Check the second point."));
    assert!(!messages.contains("Parent-only context."));
    let after = wait_for(&mut second, &parent, &child, "research-two", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(after["allocation"], json!({"workTurns":2,"reserved":2}));
    assert_ne!(
        after["assignment"]["turn"]["turnId"],
        first_result["turn"]["turnId"]
    );
    assert_eq!(
        after["assignment"]["result"]["text"],
        "Second child finding."
    );
    assert_eq!(after["assignment"]["result"]["tokenUsage"], usage("7", "2"));
    assert_eq!(
        after["assignment"]["instructionPreview"],
        &instructions[..instructions.floor_char_boundary(1024)]
    );
    assert_eq!(after["assignment"]["instructionTruncated"], true);
    assert_eq!(
        observed_assignment(&mut second, &parent, &child).await,
        after["assignment"]
    );
    assert_eq!(
        inspect(&mut second, &parent, &child, "research-one").await["assignment"],
        *first_result
    );
    let over_limit = second
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "research-three",
                "Outside the allowance.",
            ),
        )
        .await;
    assert_eq!(over_limit["error"]["data"], "subagent_allocation_exhausted");
    second.close().await;
    provider.done().await;
}

#[tokio::test]
async fn child_messages_wait_for_an_assignment_and_keep_the_exact_delivery_after_restart() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let (release, wait) = tokio::sync::oneshot::channel();
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Release("First child finding.", wait),
        Reply::Finished("Second child finding."),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let created = first.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap();
    let other = new_session(&mut first, workspace.path()).await;
    let unrelated = first
        .request(
            SEND_MESSAGE,
            note(&other, child, "first-note", "Wrong parent"),
        )
        .await;
    assert_eq!(unrelated["error"]["data"], "subagent_unavailable");
    let first_note = note(&parent, child, "first-note", "First contextual fact.");
    let oversized = first
        .request(
            SEND_MESSAGE,
            note(&parent, child, "large-note", &"x".repeat(4 * 1024 + 1)),
        )
        .await;
    assert_eq!(oversized["error"]["data"], "subagent_message_invalid");
    let receipt = first.request(SEND_MESSAGE, first_note.clone()).await;
    let receipt = &receipt["result"];
    assert_eq!(receipt["disposition"]["kind"], "queued");
    assert_eq!(receipt["text"], "First contextual fact.");
    let second_note = note(&parent, child, "second-note", "Second contextual fact.");
    let second = first.request(SEND_MESSAGE, second_note.clone()).await;
    assert_eq!(
        second["result"]["disposition"]["kind"], "queued",
        "{second}"
    );
    let mismatched = first
        .request(
            ASSIGN,
            assign(
                &parent,
                child,
                &parent_turn,
                "first-note",
                "Treat the note as work.",
            ),
        )
        .await;
    assert_eq!(
        mismatched["error"]["data"],
        "subagent_assignment_identity_reused"
    );
    let view = inspect(&mut first, &parent, child, "first-note").await;
    assert_eq!(
        view["pendingMessageIds"],
        json!(["first-note", "second-note"])
    );
    assert_eq!(view["queuedInputIds"], json!([]));
    assert_eq!(view["message"], *receipt);
    assert_eq!(view["allocation"]["reserved"], 0);
    assert!(view["current"].is_null());
    assert!(provider.requests.try_recv().is_err());
    first.close().await;

    let mut reopened = serve(&state, &provider.url).await;
    load_parent(&mut reopened, &parent, workspace.path()).await;
    let work = assign(
        &parent,
        child,
        &parent_turn,
        "first-work",
        "First approved assignment.",
    );
    let accepted = reopened.request(ASSIGN, work.clone()).await;
    assert_eq!(
        accepted["result"]["disposition"]["kind"], "queued",
        "{accepted}"
    );
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    let first = messages.find("First contextual fact.").unwrap();
    let second = messages.find("Second contextual fact.").unwrap();
    let task = messages.find("First approved assignment.").unwrap();
    assert!(first < second && second < task, "{messages}");
    assert!(messages.contains("Informational context from the parent chat"));
    assert!(!messages.contains("Parent-only context."));
    let busy_note = note(&parent, child, "busy-note", "Context sent while busy.");
    let queued = reopened.request(SEND_MESSAGE, busy_note.clone()).await;
    assert_eq!(queued["result"]["disposition"]["kind"], "queued");
    let claimed = inspect(&mut reopened, &parent, child, "first-note").await;
    assert_eq!(claimed["message"]["disposition"]["kind"], "claimed");
    assert_eq!(claimed["pendingMessageIds"], json!(["busy-note"]));
    assert_eq!(claimed["allocation"]["reserved"], 1);
    assert!(!messages.contains("Context sent while busy."));
    release.send(()).unwrap();
    let finished = wait_for(&mut reopened, &parent, child, "first-work", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    let turn = &finished["assignment"]["turn"]["turnId"];
    assert_eq!(
        finished["assignment"]["messageInputIds"],
        json!(["first-note", "second-note"])
    );
    assert_eq!(finished["pendingMessageIds"], json!(["busy-note"]));
    assert!(finished["current"].is_null());
    let delivered = reopened.request(SEND_MESSAGE, first_note.clone()).await;
    assert_eq!(
        delivered["result"]["inputPosition"],
        receipt["inputPosition"]
    );
    assert_eq!(
        delivered["result"]["disposition"],
        json!({"kind":"completed", "turn":turn})
    );
    assert_eq!(
        reopened.request(ASSIGN, work).await["result"],
        finished["assignment"]
    );
    assert!(
        timeout(Duration::from_millis(100), provider.requests.recv())
            .await
            .is_err()
    );
    reopened.close().await;

    let mut followup = serve(&state, &provider.url).await;
    load_parent(&mut followup, &parent, workspace.path()).await;
    assert_eq!(
        followup.request(SEND_MESSAGE, busy_note).await["result"],
        queued["result"]
    );
    let accepted = followup
        .request(
            ASSIGN,
            assign(
                &parent,
                child,
                &parent_turn,
                "second-work",
                "Second approved assignment.",
            ),
        )
        .await;
    assert_eq!(
        accepted["result"]["disposition"]["kind"], "queued",
        "{accepted}"
    );
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    assert_eq!(messages.matches("First contextual fact.").count(), 1);
    assert_eq!(messages.matches("Second contextual fact.").count(), 1);
    assert_eq!(messages.matches("Context sent while busy.").count(), 1);
    assert!(
        messages.find("Context sent while busy.").unwrap()
            < messages.find("Second approved assignment.").unwrap()
    );
    let finished = wait_for(&mut followup, &parent, child, "second-work", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(
        finished["assignment"]["messageInputIds"],
        json!(["busy-note"])
    );
    assert_eq!(finished["pendingMessageIds"], json!([]));
    assert_eq!(finished["allocation"]["reserved"], 2);
    followup.close().await;

    let mut rotated = serve_with_key(&state, &provider.url, "rotated-fixture-key").await;
    load_parent(&mut rotated, &parent, workspace.path()).await;
    assert_eq!(
        rotated.request(SEND_MESSAGE, first_note.clone()).await["result"],
        delivered["result"]
    );
    let different = rotated
        .request(
            SEND_MESSAGE,
            note(&parent, child, "first-note", "Changed body."),
        )
        .await;
    assert_eq!(
        different["error"]["data"],
        "subagent_message_identity_reused"
    );
    let denied = rotated
        .request(
            SEND_MESSAGE,
            note(&parent, child, "new-note", "Wrong provider authority."),
        )
        .await;
    assert_eq!(denied["error"]["data"], "subagent_authority_changed");
    assert!(provider.requests.try_recv().is_err());
    rotated.close().await;

    provider.done().await;
}

#[tokio::test]
async fn shared_connections_cannot_negotiate_child_discovery_or_message_delivery() {
    let temporary = TempDir::new().unwrap();
    let mut provider = Endpoint::start(vec![]).await;
    let mut command = executable();
    command.args([
        "serve",
        "--listen",
        "ws://127.0.0.1:0/acp",
        "--server-token-env",
        "GRIDA_AGENT_SUBAGENT_FIXTURE_TOKEN",
        "--max-output-tokens",
        "128",
    ]);
    configured(&mut command, &temporary.path().join("state"), &provider.url);
    command.env("GRIDA_AGENT_SUBAGENT_FIXTURE_TOKEN", SERVER_TOKEN);
    let (child, url) = spawn_shared_server(command).await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut request = extension_initialize();
    request["clientCapabilities"]["_meta"][&SEND_MESSAGE[1..]] = 1.into();
    request["clientCapabilities"]["_meta"][&LIST[1..]] = 1.into();
    let ready = ws_rpc(&mut socket, 1, "initialize", request).await;
    assert!(ready["result"]["agentCapabilities"]["_meta"][&SEND_MESSAGE[1..]].is_null());
    assert!(ready["result"]["agentCapabilities"]["_meta"][&LIST[1..]].is_null());
    let denied = ws_rpc(
        &mut socket,
        2,
        SEND_MESSAGE,
        note("parent", "child", "note", "data"),
    )
    .await;
    assert_eq!(denied["error"]["code"], -32601, "{denied}");
    let list = ws_rpc(&mut socket, 3, LIST, json!({"parentSessionId":"parent"})).await;
    assert_eq!(list["error"]["code"], -32601, "{list}");
    assert!(provider.requests.try_recv().is_err());
    drop(socket);
    super::lifecycle::terminate_shared_server(child).await;
    provider.done().await;
}

#[tokio::test]
async fn paused_child_accepts_exact_steering_and_resumes_the_same_assignment_after_restart() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let (release, held) = tokio::sync::oneshot::channel();
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Hold("Initial child finding."),
        Reply::Release("Corrected child finding.", held),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let created = first.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap().to_owned();
    let note = first
        .request(
            SEND_MESSAGE,
            note(
                &parent,
                &child,
                "supporting-note",
                "A retained supporting fact.",
            ),
        )
        .await;
    assert_eq!(note["result"]["disposition"]["kind"], "queued", "{note}");
    let accepted = first
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "initial",
                "Investigate the point.",
            ),
        )
        .await;
    assert_eq!(accepted["result"]["maxGenerationSteps"], 2, "{accepted}");
    provider.request().await;
    let running = inspect(&mut first, &parent, &child, "initial").await;
    assert_eq!(
        observed_assignment(&mut first, &parent, &child).await,
        running["assignment"]
    );
    let turn = running["current"]["turnId"].as_str().unwrap().to_owned();
    let other = new_session(&mut first, workspace.path()).await;
    let unrelated = first
        .request(PAUSE, child_basis(&running, &other, &child, "wrong-parent"))
        .await;
    assert_eq!(unrelated["error"]["data"], "subagent_unavailable");
    let pause = child_basis(&running, &parent, &child, "pause-child");
    let paused = first.request(PAUSE, pause.clone()).await;
    assert_eq!(paused["result"]["turnId"], turn, "{paused}");
    assert_eq!(
        first.request(PAUSE, pause).await["result"],
        paused["result"]
    );
    let retained = wait_for(&mut first, &parent, &child, "initial", |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    assert_eq!(retained["current"]["paused"], true);
    first.close().await;

    let steer = json!({
        "task":child_basis(&retained,&parent,&child,"steer-child"),
        "expectedHistoryPosition":retained["current"]["historyPosition"],
        "instructions":"Use this correction.",
    });
    let mut reopened = serve(&state, &provider.url).await;
    load_parent(&mut reopened, &parent, workspace.path()).await;
    let corrected = reopened.request(STEER, steer.clone()).await;
    assert_eq!(corrected["result"]["turnId"], turn, "{corrected}");
    assert_eq!(
        reopened.request(STEER, steer.clone()).await["result"],
        corrected["result"]
    );
    let after_steer = inspect(&mut reopened, &parent, &child, "initial").await;
    assert_eq!(after_steer["current"]["paused"], true);
    assert!(provider.requests.try_recv().is_err());
    let resume = resume_basis(&after_steer, &parent, &child, "resume-child");
    let resumed = reopened.request(RESUME, resume.clone()).await;
    assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
    assert_eq!(resumed["result"]["turn"]["epoch"], 2);
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    assert!(messages.contains("Investigate the point."));
    assert_eq!(messages.matches("A retained supporting fact.").count(), 1);
    assert!(messages.contains("Use this correction."));
    assert!(!messages.contains("Parent-only context."));
    assert!(request["tools"].as_array().is_none_or(Vec::is_empty));
    let retried = reopened.request(RESUME, resume).await;
    assert_eq!(retried["result"]["turn"]["epoch"], 2);
    assert!(provider.requests.try_recv().is_err());
    release.send(()).unwrap();
    let settled = wait_for(&mut reopened, &parent, &child, "initial", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(
        settled["assignment"]["result"]["text"],
        "Corrected child finding."
    );
    assert_eq!(settled["assignment"]["result"]["steps"], 2);
    assert_eq!(settled["allocation"]["reserved"], 1);
    assert_eq!(settled["assignment"]["parentTurnId"], parent_turn);
    assert_eq!(
        settled["assignment"]["messageInputIds"],
        json!(["supporting-note"])
    );
    reopened.close().await;

    let mut replacement = serve_with_key(&state, &provider.url, "other-fixture-principal").await;
    load_parent(&mut replacement, &parent, workspace.path()).await;
    let denied = replacement.request(STEER, steer.clone()).await;
    assert_eq!(denied["error"]["data"], "subagent_authority_changed");
    let denied = replacement
        .request(
            RESUME,
            resume_basis(&retained, &parent, &child, "wrong-authority"),
        )
        .await;
    assert_eq!(denied["error"]["data"], "subagent_authority_changed");
    replacement.close().await;
    assert!(provider.requests.try_recv().is_err());

    provider.done().await;
}

#[tokio::test]
async fn child_queue_survives_restart_and_stays_held_after_stop() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Hold("Partial child finding."),
        Reply::Finished("A separate follow-up."),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let created = first.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap().to_owned();
    let first_input = assign(
        &parent,
        &child,
        &parent_turn,
        "first",
        "Investigate the point.",
    );
    let accepted = first.request(ASSIGN, first_input.clone()).await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    provider.request().await;
    let queued = first
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "later",
                "Another assignment.",
            ),
        )
        .await;
    assert_eq!(
        queued["result"]["disposition"]["kind"], "queued",
        "{queued}"
    );
    let over_limit = first
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "extra",
                "Outside the allowance.",
            ),
        )
        .await;
    assert_eq!(over_limit["error"]["data"], "subagent_allocation_exhausted");
    first.close().await;

    let mut second = serve(&state, &provider.url).await;
    load_parent(&mut second, &parent, workspace.path()).await;
    let pending = inspect(&mut second, &parent, &child, "first").await;
    assert_eq!(pending["current"]["disposition"], "suspended");
    assert_eq!(pending["allocation"]["reserved"], 1);
    assert_eq!(pending["queuedInputIds"], json!(["later"]));
    let stop = child_basis(&pending, &parent, &child, "stop-first");
    let stopped = second.request(STOP, stop.clone()).await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let cancelled = wait_for(&mut second, &parent, &child, "first", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(cancelled["assignment"]["result"]["status"], "cancelled");
    assert!(cancelled["current"].is_null());
    assert_eq!(cancelled["allocation"]["reserved"], 1);
    assert_eq!(cancelled["admissionPaused"], true);
    assert_eq!(cancelled["queuedInputIds"], json!(["later"]));
    assert_eq!(
        second.request(STOP, stop).await["result"],
        stopped["result"]
    );
    assert_eq!(
        second.request(ASSIGN, first_input).await["result"],
        cancelled["assignment"]
    );
    let withdraw = json!({
        "queue":queue_basis(&cancelled,&parent,&child,"withdraw-later"),
        "inputId":"later",
    });
    let removed = second.request(WITHDRAW, withdraw.clone()).await;
    assert!(removed.get("error").is_none(), "{removed}");
    assert_eq!(
        second.request(WITHDRAW, withdraw).await["result"],
        removed["result"]
    );
    assert_eq!(
        inspect(&mut second, &parent, &child, "later").await["assignment"]["disposition"]["kind"],
        "withdrawn",
    );
    let accepted = second
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "follow-up",
                "Continue with the new question.",
            ),
        )
        .await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    let held = inspect(&mut second, &parent, &child, "follow-up").await;
    assert_eq!(held["queuedInputIds"], json!(["follow-up"]));
    assert_eq!(held["admissionPaused"], true);
    assert!(provider.requests.try_recv().is_err());
    let resume = queue_basis(&held, &parent, &child, "release-child-queue");
    let resumed = second.request(RESUME_QUEUE, resume.clone()).await;
    assert!(resumed.get("error").is_none(), "{resumed}");
    assert_eq!(
        second.request(RESUME_QUEUE, resume).await["result"],
        resumed["result"]
    );
    provider.request().await;
    let completed = wait_for(&mut second, &parent, &child, "follow-up", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(completed["allocation"]["reserved"], 2);
    assert_eq!(
        completed["assignment"]["result"]["text"],
        "A separate follow-up."
    );
    second.close().await;
    provider.done().await;
}

#[tokio::test]
async fn stop_replays_a_retained_child_cancellation_from_before_queue_controls() {
    use agent_kit_core::turn::ControlDirective;
    use agent_kit_core::{ChangeId, SessionId};
    use agent_kit_sessions::{ControlRequest, SessionControl, SessionStore};
    use agent_kit_store_sqlite::SqliteStore;

    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Hold("Partial child finding."),
    ])
    .await;
    let mut client = serve(&state, &provider.url).await;
    let parent = new_session(&mut client, workspace.path()).await;
    let parent_turn = settle_parent(&mut client, &parent).await;
    provider.request().await;
    let created = client.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap().to_owned();
    let accepted = client
        .request(
            ASSIGN,
            assign(&parent, &child, &parent_turn, "first", "Investigate."),
        )
        .await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    provider.request().await;
    client.close().await;

    let store = SqliteStore::open(state.join("runtime.sqlite")).unwrap();
    let child_id = SessionId::new(child.clone()).unwrap();
    let paused = store.inspect(child_id.clone()).await.unwrap();
    let turn = paused.current.unwrap();
    let old_receipt = store
        .control(ControlRequest {
            id: ChangeId::new("earlier-stop").unwrap(),
            session: child_id,
            expected_revision: paused.revision,
            action: SessionControl::Turn {
                turn: turn.binding.turn.clone(),
                expected: turn.controls.revision,
                directive: ControlDirective::Cancel,
            },
        })
        .await
        .unwrap();
    drop(store);

    let mut reopened = serve(&state, &provider.url).await;
    load_parent(&mut reopened, &parent, workspace.path()).await;
    let replay = reopened
        .request(
            STOP,
            json!({
                "parentSessionId":parent,"childId":child,"turnId":turn.binding.turn,
                "requestId":"earlier-stop","expectedSessionRevision":paused.revision,
                "expectedControlRevision":turn.controls.revision,
            }),
        )
        .await;
    assert_eq!(
        replay["result"]["sessionRevision"], old_receipt.revision.0,
        "{replay}"
    );
    let settled = wait_for(&mut reopened, &parent, &child, "first", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(settled["assignment"]["result"]["status"], "cancelled");
    assert_eq!(settled["admissionPaused"], false);
    assert!(provider.requests.try_recv().is_err());
    reopened.close().await;
    provider.done().await;
}

#[tokio::test]
async fn replaced_provider_authority_can_observe_but_cannot_reuse_child_context() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Finished("Retained under the original credential."),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let child = first.request(CREATE, create(&parent)).await["result"]["childId"]
        .as_str()
        .unwrap()
        .to_owned();
    let original = assign(
        &parent,
        &child,
        &parent_turn,
        "initial",
        "Investigate once.",
    );
    assert!(first.request(ASSIGN, original).await.get("error").is_none());
    provider.request().await;
    let completed = wait_for(&mut first, &parent, &child, "initial", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    first.close().await;

    let mut rotated = serve_with_key(&state, &provider.url, "rotated-fixture-credential").await;
    load_parent(&mut rotated, &parent, workspace.path()).await;
    let retained = inspect(&mut rotated, &parent, &child, "initial").await;
    assert_eq!(retained["assignment"], completed["assignment"]);
    assert_eq!(retained["allocation"]["reserved"], 1);
    let refused = rotated
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "replacement",
                "Reuse the old context.",
            ),
        )
        .await;
    assert_eq!(refused["error"]["data"], "subagent_authority_changed");
    rotated.close().await;
    provider.done().await;
}
