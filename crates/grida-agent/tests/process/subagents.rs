//! GRIDA-SEC-004 — the built private host retains child scope and assignment evidence.

use super::approvals::Stdio as PrivateStdio;
use super::*;

const CREATE: &str = "_co.grida/subagent/create";
const ASSIGN: &str = "_co.grida/subagent/assign";
const INSPECT: &str = "_co.grida/subagent/inspect";
const STOP: &str = "_co.grida/subagent/stop";

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
    for key in [CREATE, ASSIGN, INSPECT, STOP] {
        request["clientCapabilities"]["_meta"][&key[1..]] = 1.into();
    }
    let response = client.request("initialize", request).await;
    for key in [CREATE, ASSIGN, INSPECT, STOP] {
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

#[tokio::test]
async fn named_child_reuses_its_own_context_and_retains_exact_assignment_results() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Finished("First child finding."),
        Reply::Finished("Second child finding."),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;

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
    first.close().await;

    let mut second = serve(&state, &provider.url).await;
    load_parent(&mut second, &parent, workspace.path()).await;
    let retained = inspect(&mut second, &parent, &child, "research-one").await;
    assert_eq!(retained["assignment"], *first_result);
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

    let follow_up = assign(
        &parent,
        &child,
        &parent_turn,
        "research-two",
        "Check the second point.",
    );
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
async fn stopped_child_keeps_its_reserved_work_and_allows_a_separate_follow_up() {
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
    let denied = first
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
    assert_eq!(denied["error"]["data"], "subagent_busy");
    first.close().await;

    let mut second = serve(&state, &provider.url).await;
    load_parent(&mut second, &parent, workspace.path()).await;
    let pending = inspect(&mut second, &parent, &child, "first").await;
    assert_eq!(pending["current"]["disposition"], "suspended");
    assert_eq!(pending["allocation"]["reserved"], 1);
    let stop = json!({
        "parentSessionId":parent,"childId":child,"turnId":pending["current"]["turnId"],
        "requestId":"stop-first","expectedSessionRevision":pending["sessionRevision"],
        "expectedControlRevision":pending["current"]["controlRevision"],
    });
    let stopped = second.request(STOP, stop.clone()).await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let cancelled = wait_for(&mut second, &parent, &child, "first", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(cancelled["assignment"]["result"]["status"], "cancelled");
    assert_eq!(cancelled["allocation"]["reserved"], 1);
    assert_eq!(
        second.request(STOP, stop).await["result"],
        stopped["result"]
    );
    assert_eq!(
        second.request(ASSIGN, first_input).await["result"],
        cancelled["assignment"]
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
