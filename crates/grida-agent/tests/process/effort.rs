use super::lifecycle::{session_snapshot, task_basis, terminate_shared_server, wait_for_snapshot};
use super::*;
use tokio::sync::oneshot;

const PARENT: &str = "Parent-only background for the task.";
const ASSIGNMENT: &str = "Review the candidate and return independent evidence.";
const ASSIGNMENT_ARGUMENTS: &str =
    r#"{"instructions":"Review the candidate and return independent evidence."}"#;
const FINDING: &str = "The independent review found the missing evidence.";

fn offers(request: &Value, tool: &str) -> bool {
    request["tools"]
        .as_array()
        .is_some_and(|tools| tools.iter().any(|offer| offer["function"]["name"] == tool))
}

async fn run(endpoint: &str, effort: &str, mode: &str) -> Vec<Value> {
    let root = TempDir::new().unwrap();
    let workspace = root.path().join("workspace");
    std::fs::create_dir(&workspace).unwrap();
    let mut command = executable();
    command.arg("run");
    configured(&mut command, &root.path().join("state"), endpoint);
    let output = timeout(
        WAIT,
        command
            .arg("--cwd")
            .arg(&workspace)
            .args([
                "--effort",
                effort,
                "--mode",
                mode,
                "--prompt",
                PARENT,
                "--compatible-output-limit-field",
                "max-tokens",
                "--max-output-tokens",
                "1024",
            ])
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    records(&output.stdout)
}

#[tokio::test]
async fn built_ultra_delegates_and_collects_in_plan_and_act() {
    for mode in ["plan", "act"] {
        let (release, ready) = oneshot::channel();
        let release = Arc::new(Mutex::new(Some(release)));
        let ready = Arc::new(Mutex::new(Some(ready)));
        let next = || {
            let release = release.clone();
            let ready = ready.clone();
            Reply::Choose(Box::new(move |request| {
                if offers(request, "collect_review") {
                    release.lock().unwrap().take().unwrap().send(()).unwrap();
                    Reply::Tool("collect_review", "{}")
                } else {
                    Reply::Release(FINDING, ready.lock().unwrap().take().unwrap())
                }
            }))
        };
        let mut endpoint = Endpoint::start(vec![
            Reply::Tool("delegate_review", ASSIGNMENT_ARGUMENTS),
            next(),
            next(),
            Reply::Tool("delegate_review", ASSIGNMENT_ARGUMENTS),
            Reply::Finished("Integrated the independently verified finding."),
        ])
        .await;
        let records = run(&endpoint.url, "ultra", mode).await;
        assert_eq!(
            records[1]["account"]["independent_review"]["findings_collected"],
            true
        );
        assert!(records.iter().any(|record| {
            record
                .to_string()
                .contains("Integrated the independently verified finding.")
        }));
        let initial = endpoint.request().await;
        assert!(offers(&initial, "delegate_review"));
        assert!(offers(&initial, "collect_review"));
        assert!(
            initial["messages"]
                .to_string()
                .contains("Ultra effort is active")
        );
        let first = endpoint.request().await;
        let second = endpoint.request().await;
        let (parent, child) = if offers(&first, "collect_review") {
            (first, second)
        } else {
            (second, first)
        };
        let parent_messages = parent["messages"].to_string();
        assert!(parent_messages.contains(PARENT));
        assert!(parent_messages.contains("reviewer started"));
        assert!(child.get("tools").is_none());
        let child_messages = child["messages"].to_string();
        assert!(child_messages.contains(ASSIGNMENT));
        assert!(!child_messages.contains(PARENT));
        assert!(!child_messages.contains("Ultra effort is active"));
        assert_eq!(child_messages.contains("Plan is active."), mode == "plan");
        assert_eq!(child["max_tokens"], 1024);
        let collected = endpoint.request().await;
        assert!(collected["messages"].to_string().contains(FINDING));
        let final_request = endpoint.request().await;
        assert!(
            final_request["messages"]
                .to_string()
                .contains("sponsored_subagent_slot_used")
        );
        endpoint.done().await;
    }
}

#[tokio::test]
async fn built_standard_does_not_offer_review_tools() {
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Direct result.")]).await;
    run(&endpoint.url, "standard", "act").await;
    let request = endpoint.request().await;
    assert!(!offers(&request, "delegate_review"));
    assert!(!offers(&request, "collect_review"));
    assert!(
        !request["messages"]
            .to_string()
            .contains("Ultra effort is active")
    );
    endpoint.done().await;
}

#[tokio::test]
async fn finished_ultra_account_discloses_uncollected_review() {
    let (child_requested, finish) = oneshot::channel();
    let child_requested = Arc::new(Mutex::new(Some(child_requested)));
    let finish = Arc::new(Mutex::new(Some(finish)));
    let next = || {
        let child_requested = child_requested.clone();
        let finish = finish.clone();
        Reply::Choose(Box::new(move |request| {
            if offers(request, "collect_review") {
                Reply::Release(
                    "The parent finished before collecting.",
                    finish.lock().unwrap().take().unwrap(),
                )
            } else {
                child_requested
                    .lock()
                    .unwrap()
                    .take()
                    .unwrap()
                    .send(())
                    .unwrap();
                Reply::Finished(FINDING)
            }
        }))
    };
    let endpoint = Endpoint::start(vec![
        Reply::Tool("delegate_review", ASSIGNMENT_ARGUMENTS),
        next(),
        next(),
    ])
    .await;
    let result = run(&endpoint.url, "ultra", "act").await;
    assert_eq!(
        result[1]["account"]["independent_review"]["findings_collected"],
        false
    );
    assert!(result[1]["account"]["independent_review"]["child"].is_string());
    endpoint.done().await;
}

#[tokio::test]
async fn stopping_suspended_ultra_does_not_require_live_review_tools() {
    let root = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = root.path().join("state");
    let mut endpoint = Endpoint::start(vec![Reply::Question("question")]).await;
    let mut command = executable();
    command.arg("run");
    configured(&mut command, &state, &endpoint.url);
    command.arg("--cwd").arg(workspace.path()).args([
        "--effort",
        "ultra",
        "--questions",
        "--prompt",
        PARENT,
    ]);
    let output = timeout(WAIT, command.output()).await.unwrap().unwrap();
    assert_eq!(
        output.status.code(),
        Some(6),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result = records(&output.stdout);
    assert_eq!(result[1]["disposition"], "input_required");
    let session = result[0]["session_id"].as_str().unwrap();
    assert!(offers(&endpoint.request().await, "delegate_review"));

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    ws_rpc(&mut socket, 1, "initialize", extension_initialize()).await;
    let loaded = ws_rpc(
        &mut socket,
        2,
        "session/load",
        json!({
            "sessionId":session,"cwd":workspace.path(),"mcpServers":[],
        }),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let snapshot = session_snapshot(&mut socket, session).await;
    let stopped = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/stop",
        task_basis(&snapshot, session, "stop-ultra"),
    )
    .await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let cancelled = wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(cancelled["latest"]["status"], "cancelled");
    assert_eq!(cancelled["latest"]["turnId"], result[0]["turn_id"]);
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}
