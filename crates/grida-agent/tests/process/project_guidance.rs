//! GRIDA-SEC-007 process coverage for scoped project instruction capture.

use super::approvals::{Fixture, Stdio as StdioClient};
use super::lifecycle::{prompt_request, queue_basis, task_basis};
use super::*;
use std::fs;
use std::path::PathBuf;

const ROOT: &str = "Root guidance: use a table.";
const PARENT: &str = "Section guidance: use a bulleted list.";
const LEAF: &str = "Chapter guidance: use numbered steps.";
const SIBLING: &str = "Sibling guidance: use a timeline.";
const OUTSIDE: &str = "Instructions outside the admitted project.";
const CHAT: &str = "For this reply, use plain paragraphs.";
const EXPLICIT_PRECEDENCE: &str =
    "Explicit chat instructions take precedence over project guidance.";
const DEEPER_LOOKUP: &str = "use your existing workspace tools to check for AGENTS.md only in directories outside the captured chain.";

fn project(fixture: &Fixture) -> PathBuf {
    let section = fixture.primary.join("section");
    let selected = section.join("chapter");
    let sibling = section.join("sibling");
    fs::create_dir_all(&selected).unwrap();
    fs::create_dir(&sibling).unwrap();
    fs::write(fixture.primary.join("AGENTS.md"), ROOT).unwrap();
    fs::write(section.join("AGENTS.md"), PARENT).unwrap();
    fs::write(selected.join("AGENTS.md"), LEAF).unwrap();
    fs::write(sibling.join("AGENTS.md"), SIBLING).unwrap();
    fs::write(fixture.primary.parent().unwrap().join("AGENTS.md"), OUTSIDE).unwrap();
    selected
}

async fn start(fixture: &Fixture, endpoint: &Endpoint, cwd: Option<&Path>) -> StdioClient {
    let mut command = fixture.process(&endpoint.url, "serve");
    command.arg("--stdio");
    if let Some(cwd) = cwd {
        command.arg("--cwd").arg(cwd);
    }
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = StdioClient::from_child(child);
    rpc(&mut client, "initialize", extension_initialize()).await;
    client
}

async fn rpc(client: &mut StdioClient, method: &str, params: Value) -> Value {
    let response = client.request(method, params).await;
    response
        .get("result")
        .unwrap_or_else(|| panic!("{method}: {response}"))
        .clone()
}

async fn new_session(client: &mut StdioClient, root: &Path) -> String {
    let created = rpc(client, "session/new", json!({"cwd":root, "mcpServers":[]})).await;
    created["sessionId"].as_str().unwrap().to_owned()
}

async fn prompt(client: &mut StdioClient, session: &str, text: &str) {
    let settled = rpc(
        client,
        "session/prompt",
        json!({"sessionId":session, "prompt":[{"type":"text","text":text}]}),
    )
    .await;
    assert_eq!(settled["stopReason"], "end_turn", "{settled}");
}

async fn snapshot(client: &mut StdioClient, session: &str) -> Value {
    rpc(
        client,
        "_co.grida/session/snapshot",
        json!({"sessionId":session}),
    )
    .await
}

async fn wait_for_idle(client: &mut StdioClient, session: &str) -> Value {
    timeout(WAIT, async {
        loop {
            let current = snapshot(client, session).await;
            if current["current"].is_null() {
                return current;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

fn guidance<'a>(request: &'a Value, authored: &str) -> &'a str {
    let messages = request["messages"].as_array().unwrap();
    let authored_index = messages
        .iter()
        .rposition(|item| item["role"] == "user" && item["content"] == authored)
        .unwrap_or_else(|| panic!("no verbatim user request in {request}"));
    messages[..authored_index]
        .iter()
        .rev()
        .filter(|item| item["role"] == "user")
        .filter_map(|item| item["content"].as_str())
        .find(|content| content.contains(ROOT))
        .unwrap_or_else(|| panic!("no project context before the user request in {request}"))
}

#[tokio::test]
async fn acp_selects_only_the_applicable_instruction_chain_with_the_same_workspace_profile() {
    let fixture = Fixture::new(false);
    let selected = project(&fixture);
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Followed the request."),
        Reply::Finished("Followed the request at the root."),
        Reply::Finished("Handled a project without instructions."),
        Reply::Finished("Handled a nested directory without instruction files."),
    ])
    .await;

    let mut client = start(&fixture, &endpoint, Some(&selected)).await;
    let session = new_session(&mut client, &fixture.primary).await;
    prompt(&mut client, &session, CHAT).await;
    let nested = endpoint.request().await;
    let context = guidance(&nested, CHAT);
    let root = context.find(ROOT).unwrap();
    let parent = context.find(PARENT).unwrap();
    let leaf = context.find(LEAF).unwrap();
    assert!(root < parent && parent < leaf, "{context}");
    assert!(context.contains("section/AGENTS.md"), "{context}");
    assert!(context.contains("section/chapter/AGENTS.md"), "{context}");
    assert!(
        context.contains("\"scope\":\"section/chapter\""),
        "{context}"
    );
    let messages = nested["messages"].to_string();
    assert!(
        !messages.contains(SIBLING) && !messages.contains(OUTSIDE),
        "{messages}"
    );
    assert!(messages.contains(EXPLICIT_PRECEDENCE), "{messages}");
    assert!(
        messages.contains("Use the host's captured instructions for the entire turn")
            && messages.contains("Tool paths still default to the project root."),
        "{messages}"
    );
    assert!(
        messages.contains("the closest applicable AGENTS.md takes precedence"),
        "{messages}"
    );
    client.close().await;

    let mut client = start(&fixture, &endpoint, None).await;
    let session = new_session(&mut client, &fixture.primary).await;
    prompt(&mut client, &session, CHAT).await;
    let at_root = endpoint.request().await;
    let messages = at_root["messages"].to_string();
    assert!(guidance(&at_root, CHAT).contains(ROOT));
    for absent in [PARENT, LEAF, SIBLING, OUTSIDE] {
        assert!(!messages.contains(absent), "{messages}");
    }
    assert!(messages.contains(DEEPER_LOOKUP), "{messages}");
    assert_eq!(nested["tools"], at_root["tools"]);

    fs::remove_file(fixture.primary.join("AGENTS.md")).unwrap();
    fs::remove_dir_all(fixture.primary.join("section")).unwrap();
    let session = new_session(&mut client, &fixture.primary).await;
    prompt(&mut client, &session, CHAT).await;
    let empty = endpoint.request().await["messages"].to_string();
    assert!(empty.contains(DEEPER_LOOKUP), "{empty}");
    assert!(!empty.contains(ROOT) && !empty.contains(OUTSIDE), "{empty}");
    client.close().await;

    fs::create_dir_all(&selected).unwrap();
    let mut client = start(&fixture, &endpoint, Some(&selected)).await;
    let session = new_session(&mut client, &fixture.primary).await;
    prompt(&mut client, &session, CHAT).await;
    let request = endpoint.request().await;
    assert!(
        request["messages"].as_array().unwrap().iter().any(|item| {
            item["role"] == "user"
                && item["content"].as_str().is_some_and(|content| {
                    content.contains("\"directory\":\"section/chapter\"")
                        && content.contains("\"sources\":[]")
                })
        }),
        "{request}"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn accepted_nested_guidance_survives_an_edit_a_retry_and_an_acp_restart() {
    let fixture = Fixture::new(false);
    let selected = project(&fixture);
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("Earlier work"),
        Reply::Finished("Used the accepted project guidance."),
        Reply::Finished("Used the refreshed project guidance."),
    ])
    .await;
    let mut client = start(&fixture, &endpoint, Some(&selected)).await;
    let session = new_session(&mut client, &fixture.primary).await;
    let started = rpc(
        &mut client,
        "_co.grida/session/submit",
        prompt_request(&session, "first", "Start earlier work."),
    )
    .await;
    assert_eq!(started["disposition"], "claimed");
    endpoint.request().await;

    let queued = prompt_request(&session, "queued", CHAT);
    let accepted = rpc(&mut client, "_co.grida/session/enqueue", queued.clone()).await;
    assert_eq!(accepted["disposition"], "queued");
    let params = json!({"sessionId":session, "inputId":"queued"});
    let original = rpc(&mut client, "_co.grida/session/input", params.clone()).await;
    assert_eq!(original["prompt"][0]["text"], CHAT);
    let revision = original["settings"]["projectInstructionRevision"]
        .as_str()
        .unwrap();
    const UPDATED: &str = "Section guidance changed: use a definition list.";
    fs::write(fixture.primary.join("section/AGENTS.md"), UPDATED).unwrap();
    fs::remove_file(selected.join("AGENTS.md")).unwrap();

    let retry = rpc(&mut client, "_co.grida/session/enqueue", queued.clone()).await;
    assert_eq!(retry, accepted);
    let current = snapshot(&mut client, &session).await;
    rpc(
        &mut client,
        "_co.grida/session/stop",
        task_basis(&current, &session, "stop-first"),
    )
    .await;
    wait_for_idle(&mut client, &session).await;
    client.close().await;

    let mut client = start(&fixture, &endpoint, Some(&selected)).await;
    rpc(
        &mut client,
        "session/load",
        json!({"sessionId":session, "cwd":fixture.primary, "mcpServers":[]}),
    )
    .await;
    let retry = rpc(&mut client, "_co.grida/session/enqueue", queued).await;
    assert_eq!(retry, accepted);
    let restored = rpc(&mut client, "_co.grida/session/input", params).await;
    assert_eq!(restored["settings"]["projectInstructionRevision"], revision);
    assert_eq!(restored["prompt"][0]["text"], CHAT);
    let current = snapshot(&mut client, &session).await;
    rpc(
        &mut client,
        "_co.grida/session/resume-queue",
        queue_basis(&current, &session, "resume-queued"),
    )
    .await;
    let request = endpoint.request().await;
    let context = guidance(&request, CHAT);
    assert!(
        context.contains(PARENT) && context.contains(LEAF),
        "{context}"
    );
    assert!(!context.contains(UPDATED), "{context}");
    wait_for_idle(&mut client, &session).await;

    const NEXT: &str = "Report the next step.";
    prompt(&mut client, &session, NEXT).await;
    let request = endpoint.request().await;
    let context = guidance(&request, NEXT);
    assert!(context.contains(UPDATED), "{context}");
    assert!(
        !context.contains(PARENT) && !context.contains(LEAF),
        "{context}"
    );
    let replay = client
        .send(
            "session/load",
            json!({"sessionId":session, "cwd":fixture.primary, "mcpServers":[]}),
        )
        .await;
    let mut user_messages = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == replay {
            assert!(frame["result"].is_object(), "{frame}");
            break;
        }
        let update = &frame["params"]["update"];
        if update["sessionUpdate"] == "user_message_chunk"
            && let Some(text) = update["content"]["text"].as_str()
        {
            user_messages.push(text.to_owned());
        }
    }
    assert!(
        user_messages.ends_with(&[CHAT.to_owned(), NEXT.to_owned()]),
        "{user_messages:?}"
    );
    assert!(
        !user_messages.iter().any(|text| text.contains(ROOT)),
        "{user_messages:?}"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn headless_run_can_switch_instruction_scopes_without_changing_workspace() {
    let fixture = Fixture::new(false);
    let selected = project(&fixture);
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Followed the chapter guidance."),
        Reply::Finished("Followed the sibling guidance."),
    ])
    .await;
    let run = |cwd: &Path, prompt: &str| {
        let mut command = fixture.process(&endpoint.url, "run");
        command.arg("--cwd").arg(cwd).args(["--prompt", prompt]);
        command
    };
    let mut initial = run(&selected, CHAT);
    const NEXT: &str = "Summarize the sibling section.";
    let sibling = fixture.primary.join("section/sibling");
    let mut continued = run(&sibling, NEXT);
    let output = timeout(WAIT, initial.output()).await.unwrap().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let requests = records(&output.stdout);
    let session = requests[0]["session_id"].as_str().unwrap();
    let request = endpoint.request().await;
    let context = guidance(&request, CHAT);
    assert!(
        context.contains(ROOT) && context.contains(LEAF),
        "{context}"
    );
    assert!(
        !context.contains(SIBLING) && !context.contains(OUTSIDE),
        "{context}"
    );

    let output = timeout(WAIT, continued.args(["--session", session]).output())
        .await
        .unwrap()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let requests = records(&output.stdout);
    assert_eq!(requests[0]["session_id"], session);
    let request = endpoint.request().await;
    let context = guidance(&request, NEXT);
    assert!(
        context.contains(PARENT) && context.contains(SIBLING),
        "{context}"
    );
    assert!(
        !context.contains(LEAF) && !context.contains(OUTSIDE),
        "{context}"
    );
    endpoint.done().await;
}

#[tokio::test]
async fn admitted_root_alias_preserves_scope_without_following_descendant_links() {
    let fixture = Fixture::new(false);
    let selected = project(&fixture);
    let alias = fixture.primary.with_file_name("primary-alias");
    std::os::unix::fs::symlink(&fixture.primary, &alias).unwrap();
    let alias_selection = alias.join(selected.strip_prefix(&fixture.primary).unwrap());
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["path"] = json!(alias);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();

    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Used the canonical scope."),
        Reply::Finished("Used the admitted alias."),
        Reply::Finished("Used the admitted alias from run."),
    ])
    .await;
    let mut captured = Vec::new();
    for directory in [&selected, &alias_selection] {
        let mut client = start(&fixture, &endpoint, Some(directory)).await;
        let session = new_session(&mut client, &fixture.primary).await;
        prompt(&mut client, &session, CHAT).await;
        let request = endpoint.request().await;
        captured.push(guidance(&request, CHAT).to_owned());
        client.close().await;
    }
    assert!(captured[0].contains(LEAF));
    assert_eq!(captured[0], captured[1]);

    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .arg("--cwd")
            .arg(&alias_selection)
            .args(["--prompt", CHAT])
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let request = endpoint.request().await;
    assert_eq!(guidance(&request, CHAT), captured[0]);

    std::os::unix::fs::symlink(&selected, fixture.primary.join("linked")).unwrap();
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "serve")
            .args(["--stdio", "--cwd"])
            .arg(alias.join("linked"))
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(!output.status.success());
    let error = String::from_utf8_lossy(&output.stderr);
    assert!(
        error.contains("project_instruction_directory_invalid"),
        "{error}"
    );
    endpoint.done().await;
}

#[tokio::test]
async fn explicit_instruction_scope_refuses_outside_linked_and_unreadable_directories() {
    let fixture = Fixture::new(false);
    let selected = project(&fixture);
    let linked = fixture.primary.join("linked");
    std::os::unix::fs::symlink(&selected, &linked).unwrap();
    let endpoint = Endpoint::start(Vec::new()).await;

    let denied = Fixture::new(false);
    let denied_selection = project(&denied);
    let mut profile: Value = serde_json::from_slice(&fs::read(&denied.profile).unwrap()).unwrap();
    profile["directories"][0]["read"] = json!("deny");
    fs::write(&denied.profile, serde_json::to_vec(&profile).unwrap()).unwrap();

    for (fixture, directory, expected) in [
        (
            &fixture,
            &fixture.extra,
            "project_instruction_directory_outside_workspace",
        ),
        (&fixture, &linked, "project_instruction_directory_invalid"),
        (
            &denied,
            &denied_selection,
            "project_instruction_directory_unreadable",
        ),
    ] {
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "serve")
                .args(["--stdio", "--cwd"])
                .arg(directory)
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(!output.status.success(), "accepted {directory:?}");
        let error = String::from_utf8_lossy(&output.stderr);
        assert!(error.contains(expected), "{directory:?}: {error}");
    }
    endpoint.done().await;
}

#[tokio::test]
async fn oversized_instruction_chain_reports_an_admission_error_before_inference() {
    let fixture = Fixture::new(false);
    let selected = project(&fixture);
    fs::write(fixture.primary.join("AGENTS.md"), "r".repeat(16 * 1024)).unwrap();
    fs::write(selected.join("AGENTS.md"), "n".repeat(16 * 1024)).unwrap();
    let endpoint = Endpoint::start(Vec::new()).await;
    let mut client = start(&fixture, &endpoint, Some(&selected)).await;
    let session = new_session(&mut client, &fixture.primary).await;
    let refused = client
        .request(
            "_co.grida/session/submit",
            prompt_request(&session, "oversized", CHAT),
        )
        .await;
    assert_eq!(
        refused["error"]["data"], "project_instruction_limit_exceeded",
        "{refused}"
    );
    client.close().await;
    endpoint.done().await;
}
