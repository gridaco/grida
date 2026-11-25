//! GRIDA-SEC-007 process coverage for captured, scoped skill references.

use super::approvals::Stdio as StdioClient;
use super::lifecycle::{session_snapshot, task_basis, terminate_shared_server, wait_for_snapshot};
use super::*;

fn write_skill(workspace: &Path, body: &str) {
    let directory = workspace.join(".agents/skills/slides");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(directory.join("SKILL.md"), format!(
        "---\nname: slides\ndescription: Plan a local deck.\nallowed-tools: shell\nmetadata:\n  also_in_load: [../../../secret]\n---\n{body}"
    )).unwrap();
}

async fn client(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut capabilities = extension_initialize();
    capabilities["clientCapabilities"]["_meta"]["co.grida/session/skills"] = 1.into();
    let reply = ws_rpc(&mut socket, 1, "initialize", capabilities).await;
    assert_eq!(
        reply["result"]["agentCapabilities"]["_meta"]["co.grida/session/skills"],
        1
    );
    socket
}

async fn catalog(socket: &mut SharedSocket, session: &str) -> Value {
    let response = ws_rpc(
        socket,
        100,
        "_co.grida/session/skills",
        json!({"sessionId":session}),
    )
    .await;
    assert!(response.get("result").is_some(), "{response}");
    response["result"]["skills"].clone()
}

fn selected(catalog: &Value, name: &str) -> Value {
    catalog
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["name"] == name)
        .unwrap()
        .clone()
}

fn prompt(session: &str, input: &str, uri: &Value) -> Value {
    json!({
        "sessionId":session, "inputId":input,
        "prompt":[{"type":"text","text":"Plan the deck"},
                  {"type":"resource_link","uri":uri,"name":"slides"}],
    })
}

#[tokio::test]
async fn headless_selected_skills_apply_without_granting_tool_capabilities() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    write_skill(workspace.path(), "Use the explicit local slide workflow.");
    std::fs::write(
        workspace.path().join("AGENTS.md"),
        "Use this project guidance.",
    )
    .unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Planned.")]).await;

    let mut absent = executable();
    absent.arg("run");
    configured(&mut absent, &state, &endpoint.url);
    absent
        .arg("--cwd")
        .arg(workspace.path())
        .args(["--prompt", "Plan it", "--skill", "missing"]);
    let failed = timeout(WAIT, absent.output()).await.unwrap().unwrap();
    assert!(!failed.status.success());
    assert!(String::from_utf8_lossy(&failed.stderr).contains("selected_skill_unavailable"));
    assert!(endpoint.requests.try_recv().is_err());

    let mut command = executable();
    command.arg("run");
    configured(&mut command, &state, &endpoint.url);
    command
        .arg("--cwd")
        .arg(workspace.path())
        .args(["--prompt", "Plan it", "--skill", "slides", "--skill", "svg"]);
    let output = timeout(WAIT, command.output()).await.unwrap().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let request = endpoint.request().await;
    let messages = request["messages"].to_string();
    assert!(messages.contains("Use the explicit local slide workflow."));
    assert!(messages.contains("Host-supplied workspace-relative skill directory"));
    assert!(messages.contains(".agents/skills/slides"));
    assert!(messages.contains("Use this project guidance."));
    assert!(messages.contains("A standalone SVG is renderable when it parses"));
    assert!(!messages.contains("first meaningful renderable checkpoint"));
    assert!(!messages.contains("workbench_show"));
    assert!(!messages.contains("also_in_load"));
    assert!(!messages.contains("Build a Grida slides deck"));
    // Without workspace tools the turn lists no skills to read on its own.
    assert!(!messages.contains("## Skills"));
    assert_only_clock_tools(&request);
    endpoint.done().await;
}

#[tokio::test]
async fn selected_project_skill_supporting_files_use_existing_read_authority() {
    use std::os::unix::fs::symlink;
    let fixture = super::approvals::Fixture::new(false);
    write_skill(
        &fixture.primary,
        "Read references/example.txt for the selected workflow.",
    );
    let references = fixture.primary.join(".agents/skills/slides/references");
    std::fs::create_dir(&references).unwrap();
    std::fs::write(references.join("example.txt"), "AUTHORIZED SUPPORTING FILE").unwrap();
    let private = fixture
        .profile
        .parent()
        .unwrap()
        .join("private-reference.txt");
    std::fs::write(&private, "PRIVATE SUPPORTING FILE").unwrap();
    symlink(private, references.join("linked.txt")).unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Choose(Box::new(|request| {
            let messages = request["messages"].to_string();
            assert!(messages.contains(".agents/skills/slides"));
            assert!(!messages.contains("AUTHORIZED SUPPORTING FILE"));
            Reply::Tool(
                "read_file",
                r#"{"path":".agents/skills/slides/references/example.txt"}"#,
            )
        })),
        Reply::Choose(Box::new(|request| {
            assert!(
                request["messages"]
                    .to_string()
                    .contains("AUTHORIZED SUPPORTING FILE")
            );
            Reply::Tool(
                "read_file",
                r#"{"path":".agents/skills/slides/references/linked.txt"}"#,
            )
        })),
        Reply::Choose(Box::new(|request| {
            assert!(
                !request["messages"]
                    .to_string()
                    .contains("PRIVATE SUPPORTING FILE")
            );
            Reply::Tool(
                "read_file",
                r#"{"path":".agents/skills/slides/../../../../private-reference.txt"}"#,
            )
        })),
        Reply::Choose(Box::new(|request| {
            let messages = request["messages"].to_string();
            assert!(!messages.contains("PRIVATE SUPPORTING FILE"));
            assert!(
                messages.contains("file_relative_path_invalid"),
                "{messages}"
            );
            Reply::Finished("Applied the reviewed supporting text.")
        })),
    ])
    .await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .arg("--cwd")
            .arg(&fixture.primary)
            .args([
                "--skill",
                "slides",
                "--prompt",
                "Use the selected workflow.",
            ])
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
    for _ in 0..4 {
        endpoint.request().await;
    }
    endpoint.done().await;
}

fn offered(request: &Value, name: &str) -> bool {
    request["tools"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|tool| tool["function"]["name"] == name)
}

#[tokio::test]
async fn listed_skills_are_read_by_the_model_without_a_selection() {
    let fixture = super::approvals::Fixture::new(false);
    let mut profile: Value =
        serde_json::from_slice(&std::fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["write"] = json!("allow");
    std::fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let directory = fixture.primary.join(".agents/skills/deck-notes");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(
        directory.join("SKILL.md"),
        "---\nname: deck-notes\ndescription: Add speaker notes to a deck.\n---\nWORKSPACE NOTES WORKFLOW\n",
    )
    .unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Choose(Box::new(|request| {
            let messages = request["messages"].to_string();
            assert!(messages.contains("## Skills"), "{messages}");
            assert!(messages.contains("- slides: Build a Grida slides deck"));
            assert!(messages.contains("(bundled; read with `read_skill`)"));
            assert!(messages.contains(
                "- deck-notes: Add speaker notes to a deck. (workspace; read `.agents/skills/deck-notes/SKILL.md`)"
            ));
            // Only names and descriptions are listed, never a skill's text.
            assert!(!messages.contains("Today this is Grida's only slide format"));
            assert!(!messages.contains("WORKSPACE NOTES WORKFLOW"));
            assert!(offered(request, "read_skill"));
            Reply::Tool("read_skill", r#"{"name":"slides"}"#)
        })),
        Reply::Choose(Box::new(|request| {
            let messages = request["messages"].to_string();
            assert!(messages.contains("Today this is Grida's only slide format"));
            Reply::Tool("read_skill", r#"{"name":"deck-notes"}"#)
        })),
        Reply::Choose(Box::new(|request| {
            let messages = request["messages"].to_string();
            // A workspace skill is not served by the bundled reader.
            assert!(messages.contains("skill_not_listed"), "{messages}");
            Reply::Tool(
                "read_file",
                r#"{"path":".agents/skills/deck-notes/SKILL.md"}"#,
            )
        })),
        Reply::Choose(Box::new(|request| {
            assert!(
                request["messages"]
                    .to_string()
                    .contains("WORKSPACE NOTES WORKFLOW")
            );
            // Follow the slides skill: one SVG slide, then the manifest.
            Reply::Tool(
                "write_file",
                r##"{"path":"Tides.canvas/001.svg","content":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1920 1080\" width=\"1920\" height=\"1080\"><title>Cover</title><rect width=\"1920\" height=\"1080\" fill=\"#0b1220\"/></svg>"}"##,
            )
        })),
        Reply::Tool(
            "write_file",
            r#"{"path":"Tides.canvas/.canvas.json","content":"{\"editor\":\"slides\",\"files\":[\"*.svg\"],\"documents\":[{\"src\":\"001.svg\",\"id\":\"cover\"}]}"}"#,
        ),
        Reply::Finished("Followed the slides and notes skills."),
    ])
    .await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .arg("--cwd")
            .arg(&fixture.primary)
            .args(["--prompt", "Make a three-slide deck about tides."])
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
    for _ in 0..6 {
        endpoint.request().await;
    }
    endpoint.done().await;
    let deck = fixture.primary.join("Tides.canvas");
    let manifest: Value =
        serde_json::from_slice(&std::fs::read(deck.join(".canvas.json")).unwrap()).unwrap();
    assert_eq!(manifest["editor"], "slides");
    assert_eq!(manifest["documents"][0]["src"], "001.svg");
    assert!(
        std::fs::read_to_string(deck.join("001.svg"))
            .unwrap()
            .contains("<title>Cover</title>")
    );
}

#[tokio::test]
async fn a_workspace_whose_skills_cannot_be_listed_still_accepts_messages() {
    use std::os::unix::fs::PermissionsExt;
    for case in ["unreadable", "too-many"] {
        let fixture = super::approvals::Fixture::new(false);
        let skills = fixture.primary.join(".agents/skills");
        let locked = skills.join("locked");
        match case {
            "unreadable" => {
                std::fs::create_dir_all(&locked).unwrap();
                std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
                if std::fs::read_dir(&locked).is_ok() {
                    // Permissions do not refuse this user; nothing to test.
                    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o700))
                        .unwrap();
                    continue;
                }
            }
            _ => {
                for index in 0..=128 {
                    let directory = skills.join(format!("w{index}"));
                    std::fs::create_dir_all(&directory).unwrap();
                    std::fs::write(
                        directory.join("SKILL.md"),
                        format!("---\nname: w{index}\ndescription: Workspace skill.\n---\nBody\n"),
                    )
                    .unwrap();
                }
            }
        }
        let mut endpoint = Endpoint::start(vec![Reply::Choose(Box::new(|request| {
            let messages = request["messages"].to_string();
            assert!(messages.contains("## Skills"), "{messages}");
            assert!(messages.contains("- slides: Build a Grida slides deck"));
            assert!(messages.contains("skills could not be listed for this request"));
            assert!(!messages.contains("- w0:"));
            assert!(offered(request, "read_skill"));
            Reply::Finished("Listed the bundled skills.")
        }))])
        .await;
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .arg("--cwd")
                .arg(&fixture.primary)
                .args(["--prompt", "What skills can you use?"])
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            output.status.success(),
            "{case}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        endpoint.request().await;
        endpoint.done().await;
        if case == "unreadable" {
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
    }
}

#[tokio::test]
async fn queue_retains_selected_guidance_and_new_acceptance_rejects_a_stale_reference() {
    use std::os::unix::fs::PermissionsExt;

    let temporary = TempDir::new().unwrap();
    let base = temporary.path().canonicalize().unwrap();
    let state = base.join("state");
    let workspace = TempDir::new().unwrap();
    let guide = workspace.path().join("AGENTS.md");
    write_skill(workspace.path(), "Original selected workflow.");
    std::fs::write(&guide, "Original project guidance.").unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("Earlier work"),
        Reply::Finished("Queued selection was applied."),
        Reply::Finished("Updated selection was applied."),
    ])
    .await;
    let private = base.join("private");
    std::fs::create_dir(&private).unwrap();
    std::fs::set_permissions(&private, std::fs::Permissions::from_mode(0o700)).unwrap();
    let profile = private.join("permission.json");
    std::fs::write(&profile, serde_json::to_vec(&json!({
        "version":1,"workspace":"project","revision":"owner-selection","primary":"primary",
        "directories":[{"id":"primary","name":"Primary","path":workspace.path().canonicalize().unwrap(),"generation":"first","read":"allow"}],
    })).unwrap()).unwrap();
    std::fs::set_permissions(&profile, std::fs::Permissions::from_mode(0o600)).unwrap();

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut ungranted = client(&url).await;
    let created = ws_rpc(
        &mut ungranted,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let ungranted_id = created["result"]["sessionId"].as_str().unwrap();
    assert_eq!(
        selected(&catalog(&mut ungranted, ungranted_id).await, "slides")["source"],
        "bundled"
    );
    drop(ungranted);
    terminate_shared_server(host).await;

    let (host, url) =
        shared_server_with_profile(&state, &endpoint.url, TEST_CREDENTIAL, Some(&profile)).await;
    let mut socket = client(&url).await;
    let unknown = ws_rpc(
        &mut socket,
        90,
        "_co.grida/session/skills",
        json!({"sessionId":"unattached"}),
    )
    .await;
    assert_eq!(unknown["error"]["data"], "session_setup_required");
    let created = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let old = selected(&catalog(&mut socket, session).await, "slides");
    assert_eq!(old["source"], "project_agents");
    assert!(!old.to_string().contains(workspace.path().to_str().unwrap()));
    assert!(!old.to_string().contains("Original selected workflow."));

    let started = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        super::lifecycle::prompt_request(session, "prior", "Start earlier work"),
    )
    .await;
    assert!(started.get("result").is_some(), "{started}");
    endpoint.request().await;
    let queued = prompt(session, "selected", &old["uri"]);
    let accepted = ws_rpc(&mut socket, 4, "_co.grida/session/enqueue", queued.clone()).await;
    assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
    write_skill(workspace.path(), "Updated selected workflow.");
    std::fs::write(&guide, "Updated project guidance.").unwrap();

    let stale = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/enqueue",
        prompt(session, "stale", &old["uri"]),
    )
    .await;
    assert_eq!(stale["error"]["data"], "selected_skill_changed");
    let retry = ws_rpc(&mut socket, 6, "_co.grida/session/enqueue", queued).await;
    assert_eq!(retry["result"], accepted["result"]);
    let current = session_snapshot(&mut socket, session).await;
    let stopped = ws_rpc(
        &mut socket,
        7,
        "_co.grida/session/stop",
        task_basis(&current, session, "stop-earlier"),
    )
    .await;
    assert!(stopped.get("result").is_some(), "{stopped}");
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    drop(socket);
    terminate_shared_server(host).await;

    let retained_guidance = {
        use agent_kit_core::{ChangeId, SessionId};
        let store =
            grida_agent::host::open_store(&state.join(grida_agent::host::DATABASE_FILE)).unwrap();
        let retained = store
            .input(
                SessionId::new(session).unwrap(),
                ChangeId::new("selected").unwrap(),
            )
            .await
            .unwrap()
            .unwrap();
        let payload: Value = serde_json::from_slice(retained.input.payload.bytes()).unwrap();
        payload["guidance"].clone()
    };
    let (host, url) =
        shared_server_with_profile(&state, &endpoint.url, TEST_CREDENTIAL, Some(&profile)).await;
    let mut socket = client(&url).await;
    let loaded = ws_rpc(
        &mut socket,
        2,
        "session/load",
        json!({
            "sessionId":session,"cwd":workspace.path(),"mcpServers":[],
        }),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let input = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/input",
        json!({
            "sessionId":session,"inputId":"selected",
        }),
    )
    .await;
    assert_eq!(input["result"]["settings"]["skills"][0], old);
    assert_eq!(input["result"]["prompt"][1]["uri"], old["uri"]);
    assert!(input["result"]["settings"]["projectInstructionRevision"].is_string());
    let current = session_snapshot(&mut socket, session).await;
    let resumed = ws_rpc(&mut socket, 4, "_co.grida/session/resume-queue", json!({
        "sessionId":session,"requestId":"resume-selected","expectedSessionRevision":current["sessionRevision"],
    })).await;
    assert!(resumed.get("result").is_some(), "{resumed}");
    let request = endpoint.request().await;
    let supplied = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|message| {
            message["content"].as_str()?.strip_prefix(
                "Workspace and explicitly selected skill guidance for the next request\n\n",
            )
        })
        .next()
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(supplied).unwrap(),
        retained_guidance
    );
    let request = request.to_string();
    assert!(request.contains("Original selected workflow."));
    assert!(request.contains("Original project guidance."));
    assert!(request.contains("Host-supplied workspace-relative skill directory"));
    assert!(request.contains(".agents/skills/slides"));
    assert!(!request.contains("Updated selected workflow."));
    wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;

    let latest = selected(&catalog(&mut socket, session).await, "slides");
    assert_ne!(latest["revision"], old["revision"]);
    let next = ws_rpc(
        &mut socket,
        5,
        "session/prompt",
        json!({
            "sessionId":session, "prompt":prompt(session,"next",&latest["uri"])["prompt"],
        }),
    )
    .await;
    assert!(next.get("result").is_some(), "{next}");
    let request = endpoint.request().await.to_string();
    assert!(request.contains("Updated selected workflow."));
    assert!(request.contains("Updated project guidance."));
    assert!(!request.contains("Original selected workflow."));
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

const MESSAGE_CONTEXT: &str = "co.grida/session/message-context";
const LIVE_UPDATES: &str = "co.grida/session/updates";
const TRANSCRIPT_WINDOW: &str = "co.grida/session/transcript-window";
const FILE_REFERENCE: &str = "co.grida/session/file-reference";

async fn metadata(home: &Path, workspace: Option<(&Path, u64, u64)>) -> std::process::Output {
    let mut command = executable();
    command.arg("skills").env("HOME", home);
    if let Some((root, device, inode)) = workspace {
        command
            .arg("--workspace-root")
            .arg(root)
            .arg("--workspace-device")
            .arg(device.to_string())
            .arg("--workspace-inode")
            .arg(inode.to_string());
    }
    timeout(WAIT, command.output()).await.unwrap().unwrap()
}

fn metadata_skills(output: std::process::Output) -> Vec<Value> {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice::<Value>(&output.stdout).unwrap()["skills"]
        .as_array()
        .unwrap()
        .clone()
}

async fn skill_client(home: &Path, state: &Path, endpoint: &str, profile: &Path) -> StdioClient {
    let mut command = executable();
    command
        .args(["serve", "--stdio"])
        .env("HOME", home)
        .arg("--permission-profile")
        .arg(profile);
    configured(&mut command, state, endpoint);
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = StdioClient::from_child(child);
    let mut capabilities = extension_initialize();
    for cap in [
        MESSAGE_CONTEXT,
        TRANSCRIPT_WINDOW,
        LIVE_UPDATES,
        FILE_REFERENCE,
        "co.grida/session/skills",
        "co.grida/session/queue-actions",
    ] {
        capabilities["clientCapabilities"]["_meta"][cap] = 1.into();
    }
    let initialized = client.request("initialize", capabilities).await;
    for cap in [MESSAGE_CONTEXT, TRANSCRIPT_WINDOW, LIVE_UPDATES] {
        assert_eq!(
            initialized["result"]["agentCapabilities"]["_meta"][cap], 1,
            "{initialized}"
        );
    }
    client
}

async fn skill_transcript(client: &mut StdioClient, workspace: &Path, session: &str) -> Vec<Value> {
    let replay = client
        .send(
            "session/load",
            json!({"sessionId":session,"cwd":workspace,"mcpServers":[],
            "_meta":{TRANSCRIPT_WINDOW:{"kind":"read","requestId":"skills-page"}}}),
        )
        .await;
    let mut messages = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == replay {
            assert!(frame["result"].is_object(), "{frame}");
            return messages;
        }
        let params = &frame["params"];
        let meta = &params["_meta"][TRANSCRIPT_WINDOW];
        if meta.get("displayParts").is_some() {
            assert_eq!(meta["requestId"], "skills-page");
            assert_eq!(params["update"]["sessionUpdate"], "user_message_chunk");
            messages.push(json!({
                "text":params["update"]["content"]["text"],
                "displayParts":meta["displayParts"]
            }));
        }
    }
}

#[tokio::test]
async fn plain_skill_mentions_capture_the_unique_workflow_at_acceptance() {
    let fixture = super::approvals::Fixture::new(false);
    let home = fixture.profile.with_file_name("home");
    std::fs::create_dir(&home).unwrap();
    let skill_dir = fixture.primary.join(".agents/skills/deck-notes");
    std::fs::create_dir_all(&skill_dir).unwrap();
    let skill_file = skill_dir.join("SKILL.md");
    let manifest = "---\nname: deck-notes\ndescription: Add speaker notes to a deck.\n---\n";
    let original = "The original speaker notes workflow.";
    let updated = "The changed speaker notes workflow.";
    std::fs::write(&skill_file, format!("{manifest}{original}")).unwrap();
    // The built-in and project slides skills make this bare name ambiguous.
    let ambiguous = "The project slide workflow must remain unselected.";
    write_skill(&fixture.primary, ambiguous);

    let (finish_active, active) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Release("Ready for speaker notes.", active),
        Reply::Finished("Added speaker notes."),
    ])
    .await;
    let mut client = skill_client(&home, &fixture.state, &endpoint.url, &fixture.profile).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let catalog = client
        .request("_co.grida/session/skills", json!({"sessionId":session}))
        .await;
    let skill = selected(&catalog["result"]["skills"], "deck-notes");
    assert_eq!(skill["source"], "project_agents");
    let active = client
        .request(
            "_co.grida/session/submit",
            super::lifecycle::prompt_request(session, "prior", "Prepare a deck."),
        )
        .await;
    assert_eq!(active["result"]["disposition"], "claimed", "{active}");
    let prior_request = endpoint.request().await.to_string();
    assert!(!prior_request.contains(original), "{prior_request}");

    let authored =
        "Use $deck-notes twice ($deck-notes), check $slides and $missing, and keep $100.";
    let receipt = client
        .request(
            "_co.grida/session/enqueue",
            super::lifecycle::prompt_request(session, "plain-skill", authored),
        )
        .await;
    assert_eq!(receipt["result"]["disposition"], "queued", "{receipt}");
    std::fs::write(&skill_file, format!("{manifest}{updated}")).unwrap();
    let retained = client
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"plain-skill"}),
        )
        .await;
    assert_eq!(retained["result"]["settings"]["skills"], json!([skill]));
    assert_eq!(retained["result"]["prompt"][0]["text"], authored);
    let retry = client
        .request(
            "_co.grida/session/enqueue",
            super::lifecycle::prompt_request(session, "plain-skill", authored),
        )
        .await;
    assert_eq!(retry["result"], receipt["result"]);
    let snapshot = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    let snapshot = &snapshot["result"];
    assert_eq!(snapshot["queue"][0]["steerable"], false);
    let denied = client
        .request(
            "_co.grida/session/steer-queued",
            json!({
                "task":task_basis(snapshot, session, "steer-with-skill"),
                "inputId":"plain-skill"
            }),
        )
        .await;
    assert_eq!(denied["error"]["data"], "queued_input_not_steerable");

    finish_active.send(()).unwrap();
    let request = endpoint.request().await;
    let messages = request["messages"].as_array().unwrap();
    let authored_index = messages
        .iter()
        .position(|message| message["role"] == "user" && message["content"] == authored)
        .unwrap();
    assert!(messages[..authored_index].iter().any(|message| {
        message["role"] == "user"
            && message["content"]
                .as_str()
                .is_some_and(|content| content.contains(original))
    }));
    let request = request.to_string();
    assert_eq!(request.matches(original).count(), 1, "{request}");
    assert!(!request.contains(updated), "{request}");
    assert!(!request.contains(ambiguous), "{request}");
    endpoint.done().await;
    client.close().await;
}

#[tokio::test]
async fn skill_with_an_attachment_replays_together_during_the_turn() {
    for queued in [false, true] {
        let fixture = super::approvals::Fixture::new(false);
        write_skill(&fixture.primary, "Use the attached outline.");
        let outline = fixture.primary.join("outline.txt");
        std::fs::write(&outline, "A deck outline.").unwrap();
        let (finish_prior, prior) = tokio::sync::oneshot::channel();
        let (finish_selected, response) = tokio::sync::oneshot::channel();
        let mut replies = Vec::new();
        if queued {
            replies.push(Reply::Release("Ready for the outline.", prior));
        }
        replies.push(Reply::Release("Outline applied.", response));
        let mut endpoint = Endpoint::start(replies).await;
        let home = fixture.profile.with_file_name("home");
        std::fs::create_dir(&home).unwrap();
        let mut client = skill_client(&home, &fixture.state, &endpoint.url, &fixture.profile).await;
        let created = client
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let response = client
            .request("_co.grida/session/skills", json!({"sessionId":session}))
            .await;
        let skill = selected(&response["result"]["skills"], "slides");
        assert_eq!(skill["source"], "project_agents");

        if queued {
            let started = client
                .request(
                    "_co.grida/session/submit",
                    super::lifecycle::prompt_request(session, "prior", "Wait for the outline."),
                )
                .await;
            assert!(started["result"].is_object(), "{started}");
            endpoint.request().await;
        }

        let mut input = prompt(session, "with-outline", &skill["uri"]);
        let reference = json!({
            "type":"resource_link","name":"outline.txt","mimeType":"text/plain",
            "uri":reqwest::Url::from_file_path(&outline).unwrap().as_str(),
            "_meta":{"co.grida/file-reference":{"workspacePath":"outline.txt"}}
        });
        input["prompt"]
            .as_array_mut()
            .unwrap()
            .push(reference.clone());
        let method = if queued {
            "_co.grida/session/enqueue"
        } else {
            "_co.grida/session/submit"
        };
        let submit = client.send(method, input).await;
        if queued {
            let receipt = client.read_reply().await;
            assert_eq!(receipt["id"], submit);
            assert_eq!(receipt["result"]["disposition"], "queued", "{receipt}");
            finish_prior.send(()).unwrap();
        }
        // The host has journaled the input once inference starts. Keep the
        // response held so replay must supply the complete running message.
        let request = endpoint.request().await.to_string();
        assert!(request.contains("Use the attached outline."), "{request}");
        let page = client
            .send(
                "session/load",
                json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[],
                    "_meta":{TRANSCRIPT_WINDOW:{"kind":"read","requestId":"outline-page"}}}),
            )
            .await;
        let mut replay = Vec::new();
        loop {
            let frame = client.read_frame().await;
            if frame["id"] == page {
                assert!(frame["result"].is_object(), "{frame}");
                break;
            }
            if frame["id"] == submit {
                assert_eq!(frame["result"]["disposition"], "claimed", "{frame}");
            }
            let params = &frame["params"];
            let meta = &params["_meta"];
            assert_ne!(meta[LIVE_UPDATES]["inputId"], "with-outline", "{frame}");
            if meta[TRANSCRIPT_WINDOW]["inputId"] == "with-outline" {
                replay.push(params.clone());
            }
        }
        assert_eq!(replay.len(), 2, "{replay:?}");
        let text = &replay[0]["update"];
        let attachment = &replay[1]["update"];
        assert_eq!(
            text["content"],
            json!({"type":"text","text":"Plan the deck"})
        );
        assert_eq!(
            replay[0]["_meta"][TRANSCRIPT_WINDOW]["displayParts"],
            json!([{"kind":"skill","version":1,"data":{
                "name":"slides","source":"project_agents","uri":skill["uri"]
            }}]),
        );
        assert!(text["messageId"].is_string());
        assert_eq!(text["messageId"], attachment["messageId"]);
        assert_eq!(attachment["content"], reference);

        finish_selected.send(()).unwrap();
        endpoint.done().await;
        client.close().await;
    }
}

#[tokio::test]
async fn pre_chat_personal_selection_survives_project_shadowing_and_reopen() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    let directory = TempDir::new().unwrap();
    let base = directory.path().canonicalize().unwrap();
    let home = base.join("home");
    let workspace = base.join("project");
    let state = base.join("state");
    let private = base.join("private");
    std::fs::create_dir(&private).unwrap();
    std::fs::set_permissions(&private, std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::create_dir(&home).unwrap();
    let start = metadata_skills(metadata(&home, None).await);
    assert!(!start.iter().any(|entry| entry["source"] == "personal"));
    write_skill(&home, "Apply the personal workflow from Home.");
    write_skill(&workspace, "Apply the destination project's workflow.");
    let global = metadata_skills(metadata(&home, None).await);
    let personal = global
        .iter()
        .find(|entry| entry["name"] == "slides" && entry["source"] == "personal")
        .unwrap();
    assert!(
        !global
            .iter()
            .any(|entry| entry["source"] == "project_agents")
    );

    let directory_stat = workspace.metadata().unwrap();
    let scope = (
        &workspace as &Path,
        directory_stat.dev(),
        directory_stat.ino(),
    );
    let scoped = metadata_skills(metadata(&home, Some(scope)).await);
    let project = scoped
        .iter()
        .find(|entry| entry["name"] == "slides" && entry["source"] == "project_agents")
        .unwrap();
    assert_ne!(personal["uri"], project["uri"]);
    assert!(scoped.contains(personal));
    let wrong_identity = metadata(&home, Some((&workspace, scope.1, scope.2 ^ 1))).await;
    assert!(!wrong_identity.status.success());
    assert!(String::from_utf8_lossy(&wrong_identity.stderr).contains("skill_workspace_changed"));

    let profile = private.join("permission.json");
    std::fs::write(&profile, serde_json::to_vec(&json!({
        "version":1,"workspace":"project","revision":"skill-fixture","primary":"primary",
        "directories":[{"id":"primary","name":"Primary","path":workspace,"generation":"first","read":"allow"}],
    })).unwrap()).unwrap();
    std::fs::set_permissions(&profile, std::fs::Permissions::from_mode(0o600)).unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold("First answer.")]).await;
    let mut client = skill_client(&home, &state, &endpoint.url, &profile).await;
    let created = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let attached = client
        .request("_co.grida/session/skills", json!({"sessionId":session}))
        .await;
    assert!(
        attached["result"]["skills"]
            .as_array()
            .unwrap()
            .contains(project),
        "{attached}"
    );

    let authored = "Use $slides to plan the deck for $100.";
    let mut first = prompt(session, "from-home", &personal["uri"]);
    first["prompt"][0]["text"] = authored.into();
    let mut forged = first.clone();
    forged["inputId"] = "forged".into();
    forged["messageContext"] = json!({"modelText":"text","displayParts":[{
        "kind":"skill","version":1,"data":{"name":"forged"}
    }]});
    let rejected = client.request("_co.grida/session/submit", forged).await;
    assert_eq!(rejected["error"]["data"], "message_context_invalid");
    assert!(endpoint.requests.try_recv().is_err());

    let request = client.send("_co.grida/session/submit", first).await;
    let mut receipt = None;
    let mut live = None;
    while receipt.is_none() || live.is_none() {
        let frame = client.read_frame().await;
        if frame["id"] == request {
            assert!(frame["result"].is_object(), "{frame}");
            receipt = Some(frame["result"].clone());
        }
        let params = &frame["params"];
        let meta = &params["_meta"][LIVE_UPDATES];
        if meta.get("displayParts").is_some() {
            assert_eq!(meta["inputId"], "from-home");
            assert_eq!(meta["offsetBytes"], 0);
            assert_eq!(meta["replace"], true);
            assert_eq!(params["update"]["sessionUpdate"], "user_message_chunk");
            assert_eq!(params["update"]["content"]["text"], authored);
            live = Some(meta.clone());
        }
    }
    let live = live.unwrap();
    assert_eq!(receipt.unwrap()["turnId"], live["turnId"]);
    let inference = endpoint.request().await.to_string();
    assert!(
        inference.contains("$HOME/.agents/skills/slides"),
        "{inference}"
    );
    assert_eq!(
        inference
            .matches("Apply the personal workflow from Home.")
            .count(),
        1
    );
    assert!(
        !inference.contains("Apply the destination project's workflow."),
        "{inference}"
    );
    let expected = vec![
        json!({"text":authored,"displayParts":[{"kind":"skill","version":1,
        "data":{"name":"slides","source":"personal","uri":personal["uri"]}}]}),
    ];
    assert_eq!(live["displayParts"], expected[0]["displayParts"]);
    assert_eq!(
        skill_transcript(&mut client, &workspace, session).await,
        expected
    );

    write_skill(&home, "An updated personal workflow.");
    let rejected = client
        .request(
            "_co.grida/session/enqueue",
            prompt(session, "changed", &personal["uri"]),
        )
        .await;
    assert_eq!(
        rejected["error"]["data"], "selected_skill_changed",
        "{rejected}"
    );
    let gone = home.join(".agents/skills/slides/SKILL.md");
    std::fs::remove_file(gone).unwrap();
    let rejected = client
        .request(
            "_co.grida/session/enqueue",
            prompt(session, "missing", &personal["uri"]),
        )
        .await;
    assert!(
        matches!(
            rejected["error"]["data"].as_str(),
            Some("selected_skill_changed" | "selected_skill_unavailable")
        ),
        "{rejected}"
    );
    assert!(!metadata_skills(metadata(&home, None).await).contains(personal));
    assert!(endpoint.requests.try_recv().is_err());

    let original = client
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"from-home"}),
        )
        .await;
    assert_eq!(original["result"]["settings"]["skills"][0], *personal);
    let current = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    let stop = client
        .request(
            "_co.grida/session/stop",
            task_basis(&current["result"], session, "stop"),
        )
        .await;
    assert!(stop["result"].is_object(), "{stop}");
    client.close().await;

    let mut reopened = skill_client(&home, &state, &endpoint.url, &profile).await;
    let attached = reopened
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
        )
        .await;
    assert!(attached["result"].is_object(), "{attached}");
    assert_eq!(
        skill_transcript(&mut reopened, &workspace, session).await,
        expected
    );
    reopened.close().await;
}
