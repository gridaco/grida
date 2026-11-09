//! GRIDA-SEC-007 process coverage for captured, scoped skill references.

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
    assert!(messages.contains("Use this project guidance."));
    assert!(messages.contains("live render of what you wrote"));
    assert!(!messages.contains("also_in_load"));
    assert!(!messages.contains("Build a Grida slides deck"));
    assert!(request.get("tools").is_none());
    endpoint.done().await;
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
    let request = endpoint.request().await.to_string();
    assert!(request.contains("Original selected workflow."));
    assert!(request.contains("Original project guidance."));
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
