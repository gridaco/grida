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
    run_in(
        &root.path().join("state"),
        &workspace,
        endpoint,
        effort,
        mode,
    )
    .await
}

async fn run_in(
    state: &Path,
    workspace: &Path,
    endpoint: &str,
    effort: &str,
    mode: &str,
) -> Vec<Value> {
    let mut command = executable();
    command.arg("run");
    configured(&mut command, state, endpoint);
    let output = timeout(
        WAIT,
        command
            .arg("--cwd")
            .arg(workspace)
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

async fn verify_review_summary(
    state: &Path,
    workspace: &Path,
    endpoint: &str,
    record: &Value,
    collected: bool,
) {
    let session = record["session_id"].as_str().unwrap();
    let (host, url) = shared_server(state, endpoint).await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut capabilities = extension_initialize();
    capabilities["clientCapabilities"]["_meta"]["co.grida/session/turn-summary"] = 1.into();
    ws_rpc(&mut socket, 1, "initialize", capabilities).await;
    let loaded = ws_rpc(
        &mut socket,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let summary = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/turn-summary",
        json!({"sessionId":session,"turnId":record["turn_id"]}),
    )
    .await;
    assert_eq!(
        summary["result"]["reviewFindingsCollected"], collected,
        "{summary}"
    );
    assert!(summary["result"]["child"].is_null());
    drop(socket);
    terminate_shared_server(host).await;
}

#[tokio::test]
async fn built_ultra_delegates_and_collects_in_plan_and_act() {
    for mode in ["plan", "act"] {
        let root = TempDir::new().unwrap();
        let workspace = TempDir::new().unwrap();
        let state = root.path().join("state");
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
        let records = run_in(&state, workspace.path(), &endpoint.url, "ultra", mode).await;
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
        verify_review_summary(&state, workspace.path(), &endpoint.url, &records[0], true).await;
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
    let root = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = root.path().join("state");
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
    let result = run_in(&state, workspace.path(), &endpoint.url, "ultra", "act").await;
    assert_eq!(
        result[1]["account"]["independent_review"]["findings_collected"],
        false
    );
    assert!(result[1]["account"]["independent_review"]["child"].is_string());
    verify_review_summary(&state, workspace.path(), &endpoint.url, &result[0], false).await;
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

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod negotiated {
    use super::super::approvals::Stdio as PrivateStdio;
    use super::*;

    const EFFORT: &str = "co.grida/session/effort";

    fn capabilities(select_effort: bool) -> Value {
        let mut request = extension_initialize();
        if select_effort {
            request["clientCapabilities"]["_meta"][EFFORT] = 1.into();
        }
        request["clientCapabilities"]["_meta"]["co.grida/session/revision-target"] = 1.into();
        request
    }

    async fn private(
        state: &Path,
        endpoint: &str,
        opt_in: bool,
        negotiate: bool,
    ) -> (PrivateStdio, Value) {
        let mut command = executable();
        command.args(["serve", "--stdio"]);
        if opt_in {
            command.arg("--subagents");
        }
        configured(&mut command, state, endpoint);
        let child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut client = PrivateStdio::from_child(child);
        let initialized = client.request("initialize", capabilities(negotiate)).await;
        (
            client,
            initialized["result"]["agentCapabilities"]["_meta"][EFFORT].clone(),
        )
    }

    async fn snapshot(client: &mut PrivateStdio, session: &str) -> Value {
        let reply = client
            .request("_co.grida/session/snapshot", json!({"sessionId":session}))
            .await;
        reply
            .get("result")
            .unwrap_or_else(|| panic!("{reply}"))
            .clone()
    }

    async fn idle(client: &mut PrivateStdio, session: &str) -> Value {
        timeout(WAIT, async {
            loop {
                let view = snapshot(client, session).await;
                if view["current"].is_null() && !view["latest"].is_null() {
                    break view;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap()
    }

    fn input(session: &str, id: &str, text: &str, mode: &str, effort: &str) -> Value {
        json!({"sessionId":session,"inputId":id,"prompt":[{"type":"text","text":text}],"operatingRegime":mode,"effort":effort})
    }

    #[tokio::test]
    async fn effort_requires_a_trusted_private_launch_and_client_negotiation() {
        let root = TempDir::new().unwrap();
        let workspace = TempDir::new().unwrap();
        let endpoint = "http://127.0.0.1:1/v1";
        for (name, opt_in, negotiate) in [("plain", false, true), ("unnegotiated", true, false)] {
            let (mut client, advertised) =
                private(&root.path().join(name), endpoint, opt_in, negotiate).await;
            assert_eq!(advertised, if opt_in { json!(1) } else { Value::Null });
            let created = client
                .request(
                    "session/new",
                    json!({"cwd":workspace.path(),"mcpServers":[]}),
                )
                .await;
            let session = created["result"]["sessionId"].as_str().unwrap();
            let denied = client
                .request(
                    "_co.grida/session/submit",
                    input(session, "denied", PARENT, "act", "ultra"),
                )
                .await;
            assert!(denied.get("error").is_some(), "{denied}");
            assert!(snapshot(&mut client, session).await["current"].is_null());
            assert!(client.finish().await.status.success());
        }

        let (host, url) = shared_server(&root.path().join("shared"), endpoint).await;
        let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
            .await
            .unwrap();
        let initialized = ws_rpc(&mut socket, 1, "initialize", capabilities(true)).await;
        assert!(initialized["result"]["agentCapabilities"]["_meta"][EFFORT].is_null());
        let created = ws_rpc(
            &mut socket,
            2,
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let denied = ws_rpc(
            &mut socket,
            3,
            "_co.grida/session/enqueue",
            input(session, "denied", PARENT, "act", "ultra"),
        )
        .await;
        assert!(denied.get("error").is_some(), "{denied}");
        assert_eq!(
            session_snapshot(&mut socket, session).await["queuedInputs"],
            0
        );
        drop(socket);
        terminate_shared_server(host).await;
    }

    #[tokio::test]
    async fn per_input_effort_survives_queue_edit_restart_and_revision() {
        let root = TempDir::new().unwrap();
        let state = root.path().join("state");
        let workspace = TempDir::new().unwrap();
        let mut endpoint = Endpoint::start(vec![
            Reply::Hold("Current task."),
            Reply::Finished("Queued Plan."),
            Reply::Finished("Revised Plan."),
        ])
        .await;
        let (mut first, advertised) = private(&state, &endpoint.url, true, true).await;
        assert_eq!(advertised, 1);
        let created = first
            .request(
                "session/new",
                json!({"cwd":workspace.path(),"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let original = input(session, "active", "First task.", "act", "standard");
        let started = first
            .request("_co.grida/session/submit", original.clone())
            .await;
        assert!(started.get("result").is_some(), "{started}");
        assert!(!offers(&endpoint.request().await, "delegate_review"));
        let exact = first
            .request("_co.grida/session/submit", original.clone())
            .await;
        assert_eq!(
            exact["result"]["inputPosition"],
            started["result"]["inputPosition"]
        );
        let mut changed = original.clone();
        changed["effort"] = "ultra".into();
        let conflict = first.request("_co.grida/session/submit", changed).await;
        assert_eq!(conflict["error"]["data"], "submission_effort_changed");
        // A retry naming another reasoning level is another request, too.
        let mut reasoned = original;
        reasoned["reasoning"] = "high".into();
        let conflict = first.request("_co.grida/session/submit", reasoned).await;
        assert_eq!(conflict["error"]["data"], "submission_effort_changed");

        let queued = first
            .request(
                "_co.grida/session/enqueue",
                input(session, "queue", "Queued original.", "plan", "ultra"),
            )
            .await;
        assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
        let view = snapshot(&mut first, session).await;
        assert_eq!(view["queue"][0]["settings"]["effort"], "ultra");
        let edit = first.request("_co.grida/session/replace", json!({
            "queue":{"sessionId":session,"requestId":"edit-queue","expectedSessionRevision":view["sessionRevision"]},
            "inputId":"queue","replacementInputId":"edited","prompt":[{"type":"text","text":"Edited queued task."}],
        })).await;
        assert!(edit.get("result").is_some(), "{edit}");
        let view = snapshot(&mut first, session).await;
        let stopped = first
            .request(
                "_co.grida/session/stop",
                task_basis(&view, session, "stop-first"),
            )
            .await;
        assert!(stopped.get("result").is_some(), "{stopped}");
        assert!(
            idle(&mut first, session).await["admissionPaused"]
                .as_bool()
                .unwrap()
        );
        assert!(first.finish().await.status.success());

        let (mut second, advertised) = private(&state, &endpoint.url, true, true).await;
        assert_eq!(advertised, 1);
        let loaded = second
            .request(
                "session/load",
                json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
            )
            .await;
        assert!(loaded.get("result").is_some(), "{loaded}");
        let retained = second
            .request(
                "_co.grida/session/input",
                json!({"sessionId":session,"inputId":"edited"}),
            )
            .await;
        assert_eq!(retained["result"]["settings"]["effort"], "ultra");
        assert_eq!(retained["result"]["settings"]["operatingRegime"], "plan");
        let view = snapshot(&mut second, session).await;
        let resumed = second.request("_co.grida/session/resume-queue", json!({
            "sessionId":session,"requestId":"resume-queue","expectedSessionRevision":view["sessionRevision"],
        })).await;
        assert!(resumed.get("result").is_some(), "{resumed}");
        let next = endpoint.request().await;
        assert!(offers(&next, "delegate_review"));
        assert!(next["messages"].to_string().contains("Plan is active."));
        assert!(next["messages"].to_string().contains("Edited queued task."));
        let _ = idle(&mut second, session).await;

        let page = second
            .request("_co.grida/session/history", json!({"sessionId":session}))
            .await;
        let page = &page["result"];
        let original = page["messages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|message| message["preview"] == "Edited queued task.")
            .unwrap();
        let target = second.request("_co.grida/session/revision-target", json!({
            "sessionId":session,"expectedSessionRevision":page["sessionRevision"],"messageId":original["anchor"]["message"],
        })).await;
        let target = &target["result"];
        assert_eq!(target["effort"], "ultra");
        let revise = json!({"sessionId":session,"requestId":"revise","expectedSessionRevision":target["sessionRevision"],
            "expectedHistory":target["basis"],"anchor":target["anchor"],"replacementInputId":"revised",
            "prompt":[{"type":"text","text":"Revised task."}],"effort":"standard","operatingRegime":"plan"});
        let revised = second
            .request("_co.grida/session/revise", revise.clone())
            .await;
        assert!(revised.get("result").is_some(), "{revised}");
        let request = endpoint.request().await;
        assert!(!offers(&request, "delegate_review"));
        assert!(request["messages"].to_string().contains("Plan is active."));
        let exact = second
            .request("_co.grida/session/revise", revise.clone())
            .await;
        assert_eq!(exact["result"], revised["result"]);
        let mut changed = revise;
        changed["effort"] = "ultra".into();
        let conflict = second.request("_co.grida/session/revise", changed).await;
        assert_eq!(conflict["error"]["data"], "submission_effort_changed");
        let _ = idle(&mut second, session).await;
        assert!(second.finish().await.status.success());
        endpoint.done().await;
    }
}
