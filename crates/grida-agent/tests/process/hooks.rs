//! GRIDA-SEC-004 — Built native completion authority and restart controls.

use super::approvals::{Fixture, Stdio as PrivateStdio};
use super::lifecycle::{prompt_request, task_basis};
use super::*;
use agent_kit_sessions::SessionStore;
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::PathBuf;

const CHECK: &str = "require-completion-text";
const FLAG: &str = "--require-completion-text";
const COMMAND_CHECK: &str = "before-completion-command";
const MANIFEST_CHECK: &str = r#"
    NR == 1 && $0 == "format=1" { valid = 1 }
    END {
        if (valid && NR == 1) print "{\"decision\":\"allow\"}"
        else print "{\"decision\":\"deny\",\"reason\":\"Expected one format=1 line in design-manifest.txt.\"}"
    }
"#;
const HEARTBEAT: &str = r#"
    exec 3>"$TMPDIR/heartbeat"
    while :; do printf . >&3; /bin/sleep 0.04; done
"#;

const BEFORE_TOOL_CHECK: &str = r#"
    index($0, "\"event\":\"before_tool\"") && index($0, "\"tool\":\"run_command\"") && index($0, "printf x >> effect") { valid = 1 }
    END { if (!valid) print "unexpected event"; else print response }
"#;

fn hook(fixture: &Fixture, path: &str, arguments: &[&str], mode: &str, changed: bool) -> PathBuf {
    let path = Path::new(path).canonicalize().unwrap();
    let mut sha256: [u8; 32] = Sha256::digest(fs::read(&path).unwrap()).into();
    if changed {
        sha256[0] ^= 1;
    }
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandRead"] = json!("allow");
    profile["beforeCompletion"] = json!({
        "executable": {"path":path,"sha256":sha256}, "arguments":arguments,
        "mode":mode, "timeoutMs":20_000,
    });
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    PathBuf::from(profile["command"]["temporaryParent"].as_str().unwrap())
}

fn set_hook_timeout(fixture: &Fixture, timeout_ms: u32) {
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["beforeCompletion"]["timeoutMs"] = timeout_ms.into();
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
}

fn select_hooks_only(fixture: &Fixture, enabled: bool) {
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["command"]["hooksOnly"] = json!(enabled);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
}

fn before_tool(fixture: &Fixture, path: &str, arguments: &[&str]) -> PathBuf {
    let temporary = hook(fixture, path, arguments, "required", false);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    let fields = profile.as_object_mut().unwrap();
    let definition = fields.remove("beforeCompletion").unwrap();
    fields.insert("beforeTool".into(), definition);
    profile["directories"][0]["commandReadWrite"] = json!("allow");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    temporary
}

fn command_arguments(fixture: &Fixture) -> String {
    json!({
        "directory":"primary", "access":"read_write", "program":"/bin/bash",
        "cwd":fixture.primary, "args":["-c", "printf x >> effect"],
    })
    .to_string()
}

fn command_call(fixture: &Fixture) -> Reply {
    Reply::Tool("run_command", command_arguments(fixture).leak())
}

fn command_with_goal_report(fixture: &Fixture) -> Reply {
    let calls = json!([
        {"index":0,"id":"report","type":"function","function":{
            "name":"goal_report","arguments":r#"{"report":{"kind":"progress","summary":"Checked the proposed command."}}"#}},
        {"index":1,"id":"command","type":"function","function":{
            "name":"run_command","arguments":command_arguments(fixture)}},
    ]);
    let delta = json!({"id":"fixture-response","choices":[{"index":0,
        "delta":{"role":"assistant","tool_calls":calls},"finish_reason":null}]});
    let finish = json!({"id":"fixture-response","choices":[{"index":0,
        "delta":{},"finish_reason":"tool_calls"}]});
    let body = format!("data: {delta}\n\ndata: {finish}\n\ndata: [DONE]\n\n");
    Reply::RawHttp(format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ))
}

fn goal_request(session: &str) -> Value {
    json!({
        "sessionId":session,"inputId":"goal","prompt":[{"type":"text","text":"Run a Goal"}],
        "goal":{"objective":{"description":"Check the task","criteria":["Check the target"]},
            "allowance":{"work_turns":1,"inference_steps":4},"automatic":false}
    })
}

async fn goal_view(client: &mut PrivateStdio, session: &str) -> Value {
    let response = client
        .request("_co.grida/goal/inspect", json!({"sessionId":session}))
        .await;
    assert!(response.get("error").is_none(), "{response}");
    response["result"]["goal"].clone()
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn before_tool_checks_the_exact_command_and_preserves_a_refusal() {
    for (reply, blocked) in [
        (r#"{"decision":"allow"}"#, false),
        (r#"{"decision":"deny","reason":"private diagnostic"}"#, true),
    ] {
        let fixture = Fixture::new(true);
        let response = format!("response={reply}");
        let temporary = before_tool(
            &fixture,
            "/usr/bin/awk",
            &["-v", &response, BEFORE_TOOL_CHECK],
        );
        let mut endpoint =
            Endpoint::start(vec![command_call(&fixture), Reply::Finished("Done.")]).await;
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .args(["--mode", "act", "--prompt", "Review and run the command."])
                .arg("--cwd")
                .arg(&fixture.primary)
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            output.status.success(),
            "{} {}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
        let first = endpoint.request().await.to_string();
        assert!(first.contains("run_command"));
        assert!(!first.contains("before_tool_command"));
        let next = endpoint.request().await.to_string();
        assert_eq!(next.contains("before_tool_hook_denied"), blocked, "{next}");
        assert!(!next.contains("private diagnostic"));
        let effect = fs::read_to_string(fixture.primary.join("effect"));
        if blocked {
            assert_eq!(effect.unwrap_err().kind(), std::io::ErrorKind::NotFound);
        } else {
            assert_eq!(effect.unwrap(), "x");
        }
        assert!(fs::read_dir(temporary).unwrap().next().is_none());
        endpoint.done().await;
    }
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn configured_completion_command_records_only_its_reviewed_decision() {
    let cases = [
        (
            r#"{"decision":"allow"}"#,
            "required",
            false,
            "act",
            0,
            "allowed",
        ),
        (
            r#"{"decision":"deny","reason":"Verification failed."}"#,
            "required",
            false,
            "act",
            1,
            "denied",
        ),
        (
            "unknown output",
            "required",
            false,
            "act",
            1,
            "invalid_reply",
        ),
        (
            "unknown output",
            "observe",
            false,
            "act",
            0,
            "invalid_reply",
        ),
        (
            r#"{"decision":"allow"}"#,
            "required",
            true,
            "act",
            1,
            "failed",
        ),
        (
            r#"{"decision":"deny","reason":"Must not run."}"#,
            "required",
            false,
            "plan",
            0,
            "",
        ),
    ];
    let mut endpoint = Endpoint::start(
        cases
            .iter()
            .map(|_| Reply::Finished("Fixture answer."))
            .collect(),
    )
    .await;
    for (reply, mode, changed, regime, exit, check) in cases {
        let fixture = Fixture::new(true);
        let temporary = hook(&fixture, "/usr/bin/printf", &["%s", reply], mode, changed);
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .args(["--mode", regime, "--prompt", "Prepare the answer."])
                .arg("--cwd")
                .arg(&fixture.primary)
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        let results = records(&output.stdout);
        assert_eq!(
            output.status.code(),
            Some(exit),
            "{results:?} {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let account = &results[1]["account"];
        if check.is_empty() {
            assert!(account.get("completion_checks").is_none(), "{account}");
        } else {
            let evidence = &account["completion_checks"][0];
            assert_eq!(evidence["check"], COMMAND_CHECK);
            assert_eq!(evidence["status"], check, "{account}");
            assert!(evidence["operation"].is_string());
            if changed {
                assert_eq!(evidence["reason"], "reviewed_executable_changed");
            }
            assert!(!account.to_string().contains("unknown output"));
        }
        let request = endpoint.request().await;
        assert!(!request.to_string().contains("before_completion_command"));
        assert!(endpoint.requests.try_recv().is_err());
        assert!(fs::read_dir(temporary).unwrap().next().is_none());
    }
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn configured_completion_command_checks_the_real_primary_workspace() {
    let cases = [
        ("format=1\n", "required", 0, "allowed"),
        ("format=2\n", "required", 1, "denied"),
        ("format=1\nunexpected\n", "observe", 0, "denied"),
    ];
    let mut endpoint = Endpoint::start(
        cases
            .iter()
            .map(|_| Reply::Finished("The manifest is ready for review."))
            .collect(),
    )
    .await;
    for (contents, mode, exit, decision) in cases {
        let fixture = Fixture::new(true);
        let manifest = fixture.primary.join("design-manifest.txt");
        fs::write(&manifest, contents).unwrap();
        let temporary = hook(
            &fixture,
            "/usr/bin/awk",
            &[MANIFEST_CHECK, "design-manifest.txt"],
            mode,
            false,
        );
        select_hooks_only(&fixture, true);
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .args(["--prompt", "Summarize the proposed design."])
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        let results = records(&output.stdout);
        assert_eq!(
            output.status.code(),
            Some(exit),
            "{results:?} {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let check = &results[1]["account"]["completion_checks"][0];
        assert_eq!(check["check"], COMMAND_CHECK);
        assert_eq!(check["status"], decision, "{results:?}");
        assert!(check["operation"].is_string());
        if decision == "denied" {
            assert_eq!(
                check["reason"],
                "Expected one format=1 line in design-manifest.txt."
            );
        }
        assert_eq!(fs::read_to_string(&manifest).unwrap(), contents);
        assert!(fs::read_dir(temporary).unwrap().next().is_none());
        let request = endpoint.request().await;
        assert!(!request.to_string().contains("design-manifest.txt"));
        assert!(!request.to_string().contains("before_completion_command"));
        assert!(!request.to_string().contains("run_command"));
    }
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn completion_command_retains_observed_limits_without_exposing_output() {
    let cases: [(&str, &[&str], u32, &str); 2] = [
        ("/bin/sleep", &["10"], 1_500, "completion_hook_timed_out"),
        (
            "/usr/bin/printf",
            &["untrusted-output:%5000s", ""],
            20_000,
            "completion_hook_output_limit",
        ),
    ];
    let mut endpoint = Endpoint::start(
        cases
            .iter()
            .map(|_| Reply::Finished("Fixture answer."))
            .collect(),
    )
    .await;
    for (program, arguments, timeout_ms, reason) in cases {
        let fixture = Fixture::new(true);
        let temporary = hook(&fixture, program, arguments, "required", false);
        set_hook_timeout(&fixture, timeout_ms);
        select_hooks_only(&fixture, true);
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .args(["--prompt", "Prepare the answer."])
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        let results = records(&output.stdout);
        let account = if results[1]["account"].is_null() {
            #[cfg(target_os = "linux")]
            {
                // Forced namespace teardown can remain unverified. The host
                // must retain that disposition, not discard the recorded limit.
                assert_eq!(results[1]["reason"], "command_cleanup_unverified");
                assert_eq!(results[1]["disposition"], "uncertain");
                assert_eq!(output.status.code(), Some(5));
                let session =
                    agent_kit_core::SessionId::new(results[0]["session_id"].as_str().unwrap())
                        .unwrap();
                let turn =
                    agent_kit_core::TurnId::new(results[0]["turn_id"].as_str().unwrap()).unwrap();
                let store =
                    agent_kit_store_sqlite::SqliteStore::open(fixture.state.join("runtime.sqlite"))
                        .unwrap();
                store
                    .inspect_turn_with(session, turn, move |state| {
                        let outcome = state.outcome().expect("retained completion account");
                        assert_eq!(
                            outcome.status,
                            agent_kit_core::messages::OutcomeStatus::Uncertain
                        );
                        let command = state
                            .operations()
                            .values()
                            .find(|operation| {
                                matches!(&operation.record.input,
                                    agent_kit_core::turn::OperationInput::Tool(invocation)
                                        if invocation.definition().id.as_str()
                                            == "before_completion_command")
                            })
                            .expect("recorded native completion command");
                        let Some(agent_kit_core::turn::OperationOutcome::Tool(command)) =
                            command.outcome()
                        else {
                            panic!("native command outcome missing")
                        };
                        let receipt: Value =
                            serde_json::from_slice(command.receipt.as_ref().unwrap().bytes())
                                .unwrap();
                        assert_eq!(receipt["backend"], "bubblewrap");
                        assert_eq!(receipt["descendants"], "unverified");
                        assert_eq!(receipt["cleanup_verified"], false);
                        assert_eq!(receipt["temporary_removed"], true);
                        assert_eq!(
                            receipt["stop_reason"],
                            if reason == "completion_hook_timed_out" {
                                "deadline"
                            } else {
                                "output_limit"
                            }
                        );
                        let account =
                            grida_agent_master::read_account(outcome.account.as_ref().unwrap())?;
                        Ok(serde_json::to_value(account).unwrap())
                    })
                    .await
                    .unwrap()
            }
            #[cfg(not(target_os = "linux"))]
            panic!("completion account missing: {results:?}");
        } else {
            results[1]["account"].clone()
        };
        let check = &account["completion_checks"][0];
        assert_eq!(
            check["reason"],
            reason,
            "{results:?} {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let (exit, disposition) = match check["status"].as_str() {
            Some("failed") => (1, "failed"),
            Some("uncertain") => (5, "uncertain"),
            _ => panic!("unexpected completion check: {check}"),
        };
        assert_eq!(results[1]["disposition"], disposition);
        assert_eq!(output.status.code(), Some(exit));
        assert_eq!(account["failure"]["code"], "completion_check_blocked");
        assert!(!account.to_string().contains("untrusted-output"));
        assert!(fs::read_dir(temporary).unwrap().next().is_none());
        endpoint.request().await;
    }
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn hooks_only_configures_a_real_check_without_offering_model_commands() {
    let fixture = Fixture::new(true);
    select_hooks_only(&fixture, true);
    let rejected = timeout(
        WAIT,
        fixture
            .process("http://127.0.0.1:1/v1", "run")
            .args(["--prompt", "Prepare the answer."])
            .arg("--cwd")
            .arg(&fixture.primary)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(rejected.status.code(), Some(1));
    assert_eq!(
        String::from_utf8_lossy(&rejected.stderr).trim(),
        "grida-agent: permission_profile_invalid"
    );

    let temporary = hook(
        &fixture,
        "/usr/bin/printf",
        &[
            "%s",
            r#"{"decision":"deny","reason":"Independent check refused."}"#,
        ],
        "required",
        false,
    );
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Fixture answer.")]).await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .args(["--prompt", "Prepare the answer."])
            .arg("--cwd")
            .arg(&fixture.primary)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    let results = records(&output.stdout);
    assert_eq!(
        output.status.code(),
        Some(1),
        "{results:?} {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let account = &results[1]["account"];
    assert_eq!(account["failure"]["code"], "completion_check_blocked");
    let check = &account["completion_checks"][0];
    assert_eq!(check["check"], COMMAND_CHECK);
    assert_eq!(check["status"], "denied");
    assert_eq!(check["reason"], "Independent check refused.");
    assert!(check["operation"].is_string());
    let request = endpoint.request().await;
    let tools = request["tools"].as_array().unwrap();
    assert!(
        tools
            .iter()
            .any(|tool| tool["function"]["name"] == "read_file")
    );
    assert!(tools.iter().all(|tool| !matches!(
        tool["function"]["name"].as_str(),
        Some("run_command" | "before_completion_command")
    )));
    assert!(fs::read_dir(temporary).unwrap().next().is_none());
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn a_matching_digest_cannot_authorize_a_user_owned_hook_program() {
    let fixture = Fixture::new(true);
    let directory = fixture.profile.parent().unwrap().join("reviewed-program");
    fs::create_dir(&directory).unwrap();
    let program = directory.join("check");
    fs::copy("/usr/bin/printf", &program).unwrap();
    fs::set_permissions(&program, fs::Permissions::from_mode(0o755)).unwrap();
    assert_ne!(fs::metadata(&program).unwrap().uid(), 0);
    let temporary = hook(
        &fixture,
        program.to_str().unwrap(),
        &["%s", r#"{"decision":"allow"}"#],
        "required",
        false,
    );
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["command"]["runtimePaths"]
        .as_array_mut()
        .unwrap()
        .push(json!(directory));
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Fixture answer.")]).await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .args(["--prompt", "Prepare the answer."])
            .arg("--cwd")
            .arg(&fixture.primary)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(output.status.code(), Some(1));
    let results = records(&output.stdout);
    let evidence = &results[1]["account"]["completion_checks"][0];
    assert_eq!(evidence["status"], "failed", "{results:?}");
    assert_eq!(
        evidence["reason"],
        "reviewed_executable_custody_unavailable"
    );
    assert!(fs::read_dir(temporary).unwrap().next().is_none());
    endpoint.request().await;
    endpoint.done().await;
}

#[tokio::test]
async fn a_required_completion_check_records_its_decision_without_offering_a_tool() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished(" "),
        Reply::Finished("Fixture answer."),
        Reply::Finished(" "),
    ])
    .await;
    for (enabled, exit_code, status, check) in [
        (true, 1, "failed", "denied"),
        (true, 0, "succeeded", "allowed"),
        (false, 0, "succeeded", ""),
    ] {
        let mut command = executable();
        command.arg("run");
        configured(&mut command, &state, &endpoint.url);
        if enabled {
            command.arg(FLAG);
        }
        let output = timeout(
            WAIT,
            command
                .arg("--cwd")
                .arg(workspace.path())
                .args(["--prompt", "Answer this task."])
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        let records = records(&output.stdout);
        assert_eq!(
            output.status.code(),
            Some(exit_code),
            "{records:?} {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(records[1]["disposition"], status);
        let account = &records[1]["account"];
        if enabled {
            let receipt = &account["completion_checks"][0];
            assert_eq!(receipt["check"], CHECK);
            assert_eq!(receipt["status"], check);
            assert!(receipt["operation"].is_string());
            assert_eq!(account["steps"], 1);
            assert_eq!(account["unresolved"], json!([]));
        } else {
            assert!(account.get("completion_checks").is_none());
        }
        if exit_code == 1 {
            assert_eq!(account["failure"]["code"], "completion_check_blocked");
        }
        assert!(endpoint.request().await.get("tools").is_none());
    }
    endpoint.done().await;
}

async fn server(state: &Path, endpoint: &str, enabled: bool) -> PrivateStdio {
    let mut command = executable();
    command.args(["serve", "--stdio"]);
    configured(&mut command, state, endpoint);
    if enabled {
        command.arg(FLAG);
    }
    connect(command).await
}

async fn connect(mut command: Command) -> PrivateStdio {
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = PrivateStdio::from_child(child);
    let mut capabilities = extension_initialize();
    let meta = capabilities["clientCapabilities"]["_meta"]
        .as_object_mut()
        .unwrap();
    meta.insert("co.grida/session/questions".into(), 1.into());
    meta.insert("co.grida/session/answer-question".into(), 1.into());
    meta.insert("co.grida/session/effort".into(), 1.into());
    meta.insert("co.grida/goal/start".into(), 1.into());
    meta.insert("co.grida/goal/inspect".into(), 1.into());
    meta.insert("co.grida/session/hooks".into(), 1.into());
    let initialized = client.request("initialize", capabilities).await;
    assert_eq!(initialized["result"]["protocolVersion"], 1);
    client
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn interrupted_before_tool_check_blocks_the_command_and_next_model_request() {
    let fixture = Fixture::new(true);
    let temporary = before_tool(&fixture, "/bin/sh", &["-c", HEARTBEAT]);
    let mut endpoint = Endpoint::start(vec![
        command_call(&fixture),
        Reply::Finished("Unexpected continuation."),
    ])
    .await;
    let endpoint_url = endpoint.url.clone();
    let open = || {
        let mut command = fixture.process(&endpoint_url, "serve");
        command.args(["--stdio", "--subagents"]);
        connect(command)
    };
    let mut host = open().await;
    let session = start(&mut host, &fixture.primary).await;
    let mut goal = goal_request(&session);
    goal["operatingRegime"] = json!("plan");
    let goal = host.request("_co.grida/goal/start", goal).await;
    assert_eq!(
        goal["error"]["data"], "before_tool_hook_goal_unavailable",
        "{goal}"
    );
    let mut goal = goal_request(&session);
    goal["effort"] = json!("ultra");
    let goal = host.request("_co.grida/goal/start", goal).await;
    assert_eq!(
        goal["error"]["data"], "before_tool_hook_goal_unavailable",
        "{goal}"
    );
    endpoint.request().await;
    wait_for_heartbeat(&temporary).await;
    let working = snapshot(&mut host, &session).await;
    let receipt = host
        .request(
            "_co.grida/session/pause",
            task_basis(&working, &session, "pause-check"),
        )
        .await;
    assert!(receipt.get("error").is_none(), "{receipt}");
    let paused = wait_for(&mut host, &session, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    let closed = host.finish().await;
    #[cfg(target_os = "macos")]
    assert!(
        closed.status.success(),
        "{}",
        String::from_utf8_lossy(&closed.stderr)
    );
    #[cfg(target_os = "linux")]
    assert_eq!(closed.status.code(), Some(5));
    assert!(fs::read_dir(&temporary).unwrap().next().is_none());
    let resume = json!({
        "task":task_basis(&paused,&session,"resume-check"),
        "expectedEpoch":paused["current"]["epoch"],
        "expectedJournalPosition":paused["current"]["journalPosition"],
    });
    before_tool(&fixture, "/bin/sh", &["-c", HEARTBEAT, "changed"]);
    let mut changed = open().await;
    load(&mut changed, &session, &fixture.primary).await;
    let denied = changed
        .request("_co.grida/session/resume", resume.clone())
        .await;
    assert_eq!(
        denied["error"]["data"], "permission_profile_changed",
        "{denied}"
    );
    changed.close().await;

    before_tool(&fixture, "/bin/sh", &["-c", HEARTBEAT]);
    let mut reopened = open().await;
    load(&mut reopened, &session, &fixture.primary).await;
    let resumed = reopened.request("_co.grida/session/resume", resume).await;
    assert!(resumed.get("error").is_none(), "{resumed}");
    let stopped = wait_for(&mut reopened, &session, |view| view["current"].is_null()).await;
    assert_eq!(stopped["latest"]["status"], "uncertain", "{stopped}");
    reopened.close().await;
    assert!(!fixture.primary.join("effect").exists());
    assert!(fs::read_dir(&temporary).unwrap().next().is_none());
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.abort().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn before_tool_checks_standard_act_goal_commands_and_accounts_known_work() {
    for (reply, blocked) in [
        (r#"{"decision":"allow"}"#, false),
        (r#"{"decision":"deny","reason":"private diagnostic"}"#, true),
    ] {
        let fixture = Fixture::new(true);
        let response = format!("response={reply}");
        let temporary = before_tool(
            &fixture,
            "/usr/bin/awk",
            &["-v", &response, BEFORE_TOOL_CHECK],
        );
        let mut endpoint = Endpoint::start(vec![
            command_with_goal_report(&fixture),
            Reply::Finished("Goal step assessed."),
        ])
        .await;
        let mut command = fixture.process(&endpoint.url, "serve");
        command.arg("--stdio");
        let mut host = connect(command).await;
        let session = new_session(&mut host, &fixture.primary).await;
        let goal = host
            .request("_co.grida/goal/start", goal_request(&session))
            .await;
        assert_eq!(goal["result"]["inputId"], "goal", "{goal}");
        let first = endpoint.request().await["tools"].to_string();
        assert!(
            first.contains("goal_report") && first.contains("run_command"),
            "{first}"
        );
        assert!(!first.contains("before_tool_command"), "{first}");
        let next = endpoint.request().await["messages"].to_string();
        assert_eq!(next.contains("before_tool_hook_denied"), blocked, "{next}");
        assert!(!next.contains("private diagnostic"), "{next}");
        wait_for(&mut host, &session, |view| {
            view["current"].is_null() && view["latest"].is_object()
        })
        .await;
        let settled = goal_view(&mut host, &session).await;
        assert_eq!(
            settled["progress"], "Checked the proposed command.",
            "{settled}"
        );
        assert_eq!(
            settled["spent"],
            json!({"work_turns":1,"inference_steps":2})
        );
        assert!(settled["reservation"].is_null(), "{settled}");
        let effect = fs::read_to_string(fixture.primary.join("effect"));
        if blocked {
            assert_eq!(effect.unwrap_err().kind(), std::io::ErrorKind::NotFound);
        } else {
            assert_eq!(effect.unwrap(), "x");
        }
        assert!(fs::read_dir(temporary).unwrap().next().is_none());
        host.close().await;
        endpoint.done().await;
    }
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn interrupted_goal_before_tool_check_retains_reservation_through_stop_after_restart() {
    let fixture = Fixture::new(true);
    let temporary = before_tool(&fixture, "/bin/sh", &["-c", HEARTBEAT]);
    let mut endpoint = Endpoint::start(vec![
        command_with_goal_report(&fixture),
        Reply::Finished("Unexpected continuation."),
    ])
    .await;
    let endpoint_url = endpoint.url.clone();
    let open = || {
        let mut command = fixture.process(&endpoint_url, "serve");
        command.arg("--stdio");
        connect(command)
    };
    let mut host = open().await;
    let session = new_session(&mut host, &fixture.primary).await;
    let accepted = host
        .request("_co.grida/goal/start", goal_request(&session))
        .await;
    assert_eq!(accepted["result"]["inputId"], "goal", "{accepted}");
    endpoint.request().await;
    wait_for_heartbeat(&temporary).await;
    let working = snapshot(&mut host, &session).await;
    let receipt = host
        .request(
            "_co.grida/session/pause",
            task_basis(&working, &session, "pause"),
        )
        .await;
    assert!(receipt.get("error").is_none(), "{receipt}");
    let paused = wait_for(&mut host, &session, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    let held = goal_view(&mut host, &session).await;
    assert!(held["reservation"].is_object(), "{held}");
    assert!(held["progress"].is_null(), "{held}");
    let _ = host.finish().await;
    assert!(fs::read_dir(&temporary).unwrap().next().is_none());

    before_tool(&fixture, "/bin/sh", &["-c", HEARTBEAT, "changed"]);
    let mut changed = open().await;
    load(&mut changed, &session, &fixture.primary).await;
    let resume = changed
        .request(
            "_co.grida/session/resume",
            json!({
                "task":task_basis(&paused,&session,"resume"),
                "expectedEpoch":paused["current"]["epoch"],
                "expectedJournalPosition":paused["current"]["journalPosition"],
            }),
        )
        .await;
    assert_eq!(
        resume["error"]["data"], "permission_profile_changed",
        "{resume}"
    );
    let stopped = changed
        .request(
            "_co.grida/session/stop",
            task_basis(&paused, &session, "stop"),
        )
        .await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let terminal = wait_for(&mut changed, &session, |view| view["current"].is_null()).await;
    assert_eq!(terminal["latest"]["status"], "cancelled", "{terminal}");
    changed.close().await;

    before_tool(&fixture, "/bin/sh", &["-c", HEARTBEAT]);
    let mut reopened = open().await;
    load(&mut reopened, &session, &fixture.primary).await;
    let stopped = goal_view(&mut reopened, &session).await;
    assert_eq!(
        stopped["status"],
        json!({"status":"blocked","reason":"uncertain_work"}),
        "{stopped}"
    );
    assert_eq!(stopped["reservation"]["turn"], held["reservation"]["turn"]);
    assert_eq!(stopped["reservation"]["uncertain_steps"], 1);
    assert_eq!(
        stopped["spent"],
        json!({"work_turns":0,"inference_steps":0})
    );
    assert!(stopped["progress"].is_null(), "{stopped}");
    reopened.close().await;
    let store =
        agent_kit_store_sqlite::SqliteStore::open(fixture.state.join("runtime.sqlite")).unwrap();
    let basis = serde_json::from_value(held["basis"].clone()).unwrap();
    let reported = store
        .inspect_turn_with(
            agent_kit_core::SessionId::new(session).unwrap(),
            serde_json::from_value(held["reservation"]["turn"].clone()).unwrap(),
            move |state| {
                Ok(state.operations().values().any(|operation| {
                    grida_agent_master::goals::tools::read_report(
                        operation,
                        &state.binding().turn,
                        &basis,
                    )
                    .unwrap()
                    .is_some()
                }))
            },
        )
        .await
        .unwrap();
    assert!(
        reported,
        "the sibling Goal report was recorded before the hook stopped"
    );
    assert!(!fixture.primary.join("effect").exists());
    assert!(fs::read_dir(&temporary).unwrap().next().is_none());
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.abort().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn interrupting_a_native_hook_cleans_up_and_a_changed_profile_cannot_resume_it() {
    let cases = [
        ("stop", false, true),
        ("pause", false, false),
        ("pause", false, true),
        ("pause", true, true),
    ];
    let mut endpoint = Endpoint::start(
        cases
            .iter()
            .map(|_| Reply::Finished("A candidate that must be checked."))
            .collect(),
    )
    .await;
    for (action, changed, hooks_only) in cases {
        let fixture = Fixture::new(true);
        let temporary = hook(&fixture, "/bin/sh", &["-c", HEARTBEAT], "required", false);
        if hooks_only {
            select_hooks_only(&fixture, true);
        }
        let mut command = fixture.process(&endpoint.url, "serve");
        command.arg("--stdio");
        let mut host = connect(command).await;
        let session = start(&mut host, &fixture.primary).await;
        endpoint.request().await;
        let heartbeat = timeout(WAIT, async {
            loop {
                let active = fs::read_dir(&temporary)
                    .unwrap()
                    .flatten()
                    .find_map(|entry| {
                        let file = fs::File::open(entry.path().join("heartbeat")).ok()?;
                        (file.metadata().ok()?.len() >= 2).then_some(file)
                    });
                if let Some(active) = active {
                    break active;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        let working = snapshot(&mut host, &session).await;
        let receipt = host
            .request(
                &format!("_co.grida/session/{action}"),
                task_basis(&working, &session, action),
            )
            .await;
        assert!(receipt.get("error").is_none(), "{receipt}");
        let stopped = wait_for(&mut host, &session, |view| {
            if action == "pause" {
                view["current"]["disposition"] == "suspended"
            } else {
                view["current"].is_null() && view["latest"]["status"] == "cancelled"
            }
        })
        .await;
        let output = host.finish().await;
        let diagnostic = String::from_utf8_lossy(&output.stderr);
        #[cfg(target_os = "macos")]
        assert!(output.status.success(), "{diagnostic}");
        #[cfg(target_os = "linux")]
        {
            assert_eq!(output.status.code(), Some(5), "{diagnostic}");
            assert_eq!(diagnostic.trim(), "grida-agent: host_turn_unverified");
        }
        assert!(fs::read_dir(&temporary).unwrap().next().is_none());
        // The open descriptor still observes writes after temporary path cleanup.
        let size = heartbeat.metadata().unwrap().len();
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(heartbeat.metadata().unwrap().len(), size);
        assert!(endpoint.requests.try_recv().is_err());
        if action == "stop" {
            continue;
        }

        if changed {
            hook(
                &fixture,
                "/bin/sh",
                &["-c", HEARTBEAT, "changed"],
                "required",
                false,
            );
        } else if !hooks_only {
            // Explicit false must still match work accepted before this
            // selector was present in the trusted launch profile.
            select_hooks_only(&fixture, false);
        }
        let mut command = fixture.process(&endpoint.url, "serve");
        command.arg("--stdio");
        let mut reopened = connect(command).await;
        load(&mut reopened, &session, &fixture.primary).await;
        let resume = reopened
            .request(
                "_co.grida/session/resume",
                json!({
                    "task":task_basis(&stopped,&session,"resume"),
                    "expectedEpoch":stopped["current"]["epoch"],
                    "expectedJournalPosition":stopped["current"]["journalPosition"],
                }),
            )
            .await;
        if changed {
            assert_eq!(
                resume["error"]["data"], "completion_check_profile_unavailable",
                "{resume}"
            );
            let stop = reopened
                .request(
                    "_co.grida/session/stop",
                    task_basis(&stopped, &session, "stop-later"),
                )
                .await;
            assert!(stop.get("error").is_none(), "{stop}");
            wait_for(&mut reopened, &session, |view| {
                view["latest"]["status"] == "cancelled"
            })
            .await;
        } else {
            assert!(resume.get("error").is_none(), "{resume}");
            let finished = wait_for(&mut reopened, &session, |view| {
                assert!(
                    fs::read_dir(&temporary).unwrap().next().is_none(),
                    "hook redispatched"
                );
                view["current"].is_null()
            })
            .await;
            assert!(
                matches!(
                    finished["latest"]["status"].as_str(),
                    Some("failed" | "uncertain")
                ),
                "{finished}"
            );
        }
        assert!(fs::read_dir(&temporary).unwrap().next().is_none());
        assert!(endpoint.requests.try_recv().is_err());
        reopened.close().await;
    }
    endpoint.done().await;
}

async fn snapshot(client: &mut PrivateStdio, session: &str) -> Value {
    let response = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(response.get("error").is_none(), "{response}");
    response["result"].clone()
}

async fn wait_for(
    client: &mut PrivateStdio,
    session: &str,
    matches: impl Fn(&Value) -> bool,
) -> Value {
    let mut latest = Value::Null;
    let result = timeout(WAIT, async {
        loop {
            let view = snapshot(client, session).await;
            latest = view.clone();
            if matches(&view) {
                return view;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await;
    result.unwrap_or_else(|_| panic!("session did not reach the expected state: {latest}"))
}

async fn start(client: &mut PrivateStdio, workspace: &Path) -> String {
    let session = new_session(client, workspace).await;
    let submitted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(&session, "question", "Prepare the answer."),
        )
        .await;
    assert_eq!(submitted["result"]["disposition"], "claimed", "{submitted}");
    session
}

async fn new_session(client: &mut PrivateStdio, workspace: &Path) -> String {
    let created = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    created["result"]["sessionId"].as_str().unwrap().to_owned()
}

async fn wait_for_heartbeat(temporary: &Path) {
    timeout(WAIT, async {
        loop {
            if fs::read_dir(temporary).unwrap().flatten().any(|entry| {
                fs::metadata(entry.path().join("heartbeat")).is_ok_and(|file| file.len() >= 2)
            }) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

async fn load(client: &mut PrivateStdio, session: &str, workspace: &Path) {
    let loaded = client
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
}

#[tokio::test]
async fn restart_preserves_the_selected_check_and_stop_works_without_the_handler() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question_async"),
        Reply::Finished(" "),
        Reply::Finished(" "),
        Reply::Question("question"),
    ])
    .await;
    let mut host = server(&state, &endpoint.url, true).await;
    let session = start(&mut host, workspace.path()).await;
    for _ in 0..2 {
        let request = endpoint.request().await;
        assert!(
            request["tools"]
                .as_array()
                .unwrap()
                .iter()
                .all(|tool| tool["function"]["name"] != "require_completion_text")
        );
    }
    let suspended = wait_for(&mut host, &session, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    host.close().await;

    let mut host = server(&state, &endpoint.url, true).await;
    load(&mut host, &session, workspace.path()).await;
    let turn = &suspended["current"]["turnId"];
    let pending = host
        .request(
            "_co.grida/session/questions",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    let pending = &pending["result"];
    let answered = host
        .request(
            "_co.grida/session/answer-question",
            json!({
                "sessionId":session, "turnId":turn, "requestId":"answer",
                "expectedSessionRevision":suspended["sessionRevision"],
                "expectedControlRevision":pending["controlRevision"],
                "expectedHistoryPosition":pending["historyPosition"],
                "waitId":pending["questions"][0]["waitId"],
                "answer":{"kind":"text","text":"Screen"},
            }),
        )
        .await;
    assert!(answered.get("error").is_none(), "{answered}");
    endpoint.request().await;
    let finished = wait_for(&mut host, &session, |view| view["current"].is_null()).await;
    assert_eq!(finished["latest"]["turnId"], *turn);
    assert_eq!(finished["latest"]["status"], "failed");

    let session = start(&mut host, workspace.path()).await;
    endpoint.request().await;
    let suspended = wait_for(&mut host, &session, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    let paused = host
        .request(
            "_co.grida/session/pause",
            task_basis(&suspended, &session, "pause"),
        )
        .await;
    assert!(paused.get("error").is_none(), "{paused}");
    let paused = snapshot(&mut host, &session).await;
    assert_eq!(paused["current"]["paused"], true);
    host.close().await;

    let mut host = server(&state, &endpoint.url, false).await;
    load(&mut host, &session, workspace.path()).await;
    let resume = host
        .request(
            "_co.grida/session/resume",
            json!({
                "task":task_basis(&paused,&session,"resume"),
                "expectedEpoch":paused["current"]["epoch"],
                "expectedJournalPosition":paused["current"]["journalPosition"],
            }),
        )
        .await;
    assert_eq!(
        resume["error"]["data"], "completion_check_profile_unavailable",
        "{resume}"
    );
    assert_eq!(
        snapshot(&mut host, &session).await["current"],
        paused["current"]
    );
    let stopped = host
        .request(
            "_co.grida/session/stop",
            task_basis(&paused, &session, "stop"),
        )
        .await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let finished = wait_for(&mut host, &session, |view| view["current"].is_null()).await;
    assert_eq!(finished["latest"]["turnId"], paused["current"]["turnId"]);
    assert_eq!(finished["latest"]["status"], "cancelled");
    endpoint.done().await;
    host.close().await;
}

fn lifecycle_hooks(fixture: &Fixture, definitions: &[(&str, &str, &str, Option<&str>, &str)]) {
    let executable = Path::new("/usr/bin/printf").canonicalize().unwrap();
    let digest: [u8; 32] = Sha256::digest(fs::read(&executable).unwrap()).into();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandRead"] = json!("allow");
    profile["command"]["hooksOnly"] = json!(true);
    profile["hooks"]=Value::Array(definitions.iter().map(|(id,event,mode,tool,reply)|json!({
        "id":id,"source":"reviewed-user-definition","event":event,"tool":tool,"enabled":true,
        "executable":{"path":executable,"sha256":digest},"arguments":["%s",reply],"mode":mode,"timeoutMs":20_000,
    })).collect());
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
}

#[tokio::test]
#[ignore = "requires a provisioned native sandbox helper"]
async fn lifecycle_hooks_cover_plan_read_tools_context_and_observational_reopen() {
    let fixture = Fixture::new(true);
    fs::write(fixture.primary.join("note"), "retained workspace content").unwrap();
    lifecycle_hooks(
        &fixture,
        &[
            (
                "start",
                "session_start",
                "required",
                None,
                r#"{"decision":"allow","context":"Project conventions are contextual data."}"#,
            ),
            (
                "input",
                "before_input",
                "required",
                None,
                r#"{"decision":"allow"}"#,
            ),
            (
                "read",
                "before_tool",
                "required",
                Some("read_file"),
                r#"{"decision":"allow"}"#,
            ),
            (
                "observed",
                "after_tool",
                "observe",
                Some("read_file"),
                r#"{"decision":"deny","reason":"An observational rejection cannot rewrite the read."}"#,
            ),
            (
                "complete",
                "before_completion",
                "required",
                None,
                r#"{"decision":"allow"}"#,
            ),
        ],
    );
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", r#"{"path":"note"}"#),
        Reply::Finished("Read the retained note."),
    ])
    .await;
    let mut command = fixture.process(&endpoint.url, "serve");
    command.arg("--stdio");
    let mut host = connect(command).await;
    let before = host.request("_co.grida/session/hooks", json!({})).await;
    assert_eq!(
        before["result"]["hooks"].as_array().unwrap().len(),
        5,
        "{before}"
    );
    assert!(before["result"]["results"].as_array().unwrap().is_empty());
    assert!(endpoint.requests.try_recv().is_err());
    let session = new_session(&mut host, &fixture.primary).await;
    let mut prompt = prompt_request(&session, "lifecycle-input", "Read note using read_file.");
    prompt["operatingRegime"] = json!("plan");
    let accepted = host.request("_co.grida/session/submit", prompt).await;
    assert_eq!(accepted["result"]["disposition"], "claimed", "{accepted}");
    let finished = wait_for(&mut host, &session, |view| view["current"].is_null()).await;
    assert_eq!(finished["latest"]["status"], "succeeded", "{finished}");
    let first = endpoint.request().await;
    let second = endpoint.request().await;
    for request in [&first, &second] {
        assert!(!request.to_string().contains("lifecycle_hook/"));
        assert!(
            !request["tools"]
                .as_array()
                .unwrap()
                .iter()
                .any(|tool| tool["function"]["name"] == "run_command")
        );
    }
    assert!(first.to_string().contains("contextual_data"));
    assert!(second.to_string().contains("retained workspace content"));
    let inspected = host
        .request("_co.grida/session/hooks", json!({"sessionId":session}))
        .await;
    let results = inspected["result"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 5, "{inspected}");
    assert!(
        results
            .iter()
            .any(|result| result["id"] == "observed" && result["status"] == "denied")
    );
    host.close().await;
    let mut command = fixture.process(&endpoint.url, "serve");
    command.arg("--stdio");
    let mut host = connect(command).await;
    load(&mut host, &session, &fixture.primary).await;
    let reopened = host
        .request("_co.grida/session/hooks", json!({"sessionId":session}))
        .await;
    assert_eq!(
        reopened["result"]["results"],
        inspected["result"]["results"]
    );
    assert!(endpoint.requests.try_recv().is_err());
    host.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a provisioned native sandbox helper"]
async fn required_input_hooks_reject_before_inference_and_keep_ordered_skips() {
    let fixture = Fixture::new(true);
    lifecycle_hooks(
        &fixture,
        &[
            (
                "reject",
                "before_input",
                "required",
                None,
                r#"{"decision":"deny","reason":"Input needs review."}"#,
            ),
            (
                "later",
                "before_input",
                "required",
                None,
                r#"{"decision":"allow"}"#,
            ),
        ],
    );
    let mut endpoint = Endpoint::start(vec![]).await;
    let mut command = fixture.process(&endpoint.url, "serve");
    command.arg("--stdio");
    let mut host = connect(command).await;
    let session = start(&mut host, &fixture.primary).await;
    let finished = wait_for(&mut host, &session, |view| view["current"].is_null()).await;
    assert_eq!(finished["latest"]["status"], "failed", "{finished}");
    let inspected = host
        .request("_co.grida/session/hooks", json!({"sessionId":session}))
        .await;
    let results = inspected["result"]["results"].as_array().unwrap();
    assert_eq!(results.len(), 2, "{inspected}");
    assert!(
        results
            .iter()
            .any(|result| result["id"] == "reject" && result["status"] == "denied")
    );
    assert!(results.iter().any(|result| result["id"] == "later"
        && result["status"] == "skipped"
        && result["operation"].is_null()));
    assert!(endpoint.requests.try_recv().is_err());
    host.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a provisioned native sandbox helper"]
async fn a_required_after_tool_hook_retains_the_successful_read_before_blocking() {
    let fixture = Fixture::new(true);
    fs::write(fixture.primary.join("note"), "verified original content").unwrap();
    lifecycle_hooks(
        &fixture,
        &[(
            "after",
            "after_tool",
            "required",
            Some("read_file"),
            r#"{"decision":"deny","reason":"Follow-up verification did not pass."}"#,
        )],
    );
    let mut endpoint = Endpoint::start(vec![Reply::Tool("read_file", r#"{"path":"note"}"#)]).await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .arg("--cwd")
            .arg(&fixture.primary)
            .args(["--mode", "plan", "--prompt", "Read note."])
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    let records = records(&output.stdout);
    assert_eq!(
        output.status.code(),
        Some(1),
        "{records:?} {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        records[1]["account"]["failure"]["code"],
        "lifecycle_hook_blocked"
    );
    let session =
        agent_kit_core::SessionId::new(records[0]["session_id"].as_str().unwrap()).unwrap();
    let turn = agent_kit_core::TurnId::new(records[0]["turn_id"].as_str().unwrap()).unwrap();
    let store =
        agent_kit_store_sqlite::SqliteStore::open(fixture.state.join("runtime.sqlite")).unwrap();
    let preserved=store.inspect_turn_with(session,turn,|state|Ok(state.operations().values().any(|operation|matches!(&operation.record.input,agent_kit_core::turn::OperationInput::Tool(invocation) if invocation.definition().id.as_str()=="read_file") && matches!(operation.outcome(),Some(agent_kit_core::turn::OperationOutcome::Tool(outcome)) if outcome.status==agent_kit_core::messages::OutcomeStatus::Succeeded && serde_json::to_string(outcome).unwrap().contains("verified original content"))))).await.unwrap();
    assert!(preserved);
    endpoint.request().await;
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a provisioned native sandbox helper"]
async fn an_oversized_input_event_keeps_a_diagnostic_without_running_a_handler() {
    let fixture = Fixture::new(true);
    lifecycle_hooks(
        &fixture,
        &[(
            "bounded",
            "before_input",
            "required",
            None,
            r#"{"decision":"allow"}"#,
        )],
    );
    let mut endpoint = Endpoint::start(vec![]).await;
    let prompt = "x".repeat(100_000);
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .arg("--cwd")
            .arg(&fixture.primary)
            .args(["--prompt", &prompt])
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    let records = records(&output.stdout);
    assert_eq!(
        output.status.code(),
        Some(1),
        "{records:?} {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(records[0]["kind"], "accepted");
    let result = &records[1]["account"]["lifecycle_hooks"][0];
    assert_eq!(result["id"], "bounded");
    assert_eq!(result["status"], "unavailable");
    assert_eq!(result["reason"], "hook_event_limit");
    assert!(result["operation"].is_null());
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a provisioned native sandbox helper"]
async fn completion_hooks_can_request_only_bounded_additional_work() {
    let fixture = Fixture::new(true);
    lifecycle_hooks(
        &fixture,
        &[(
            "verify",
            "before_completion",
            "required",
            None,
            r#"{"decision":"continue","context":"Perform another bounded verification pass."}"#,
        )],
    );
    let mut endpoint = Endpoint::start(
        (0..8)
            .map(|_| Reply::Finished("Candidate answer."))
            .collect(),
    )
    .await;
    let output = timeout(
        Duration::from_secs(45),
        fixture
            .process(&endpoint.url, "run")
            .arg("--cwd")
            .arg(&fixture.primary)
            .args(["--prompt", "Prepare an answer."])
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    let records = records(&output.stdout);
    assert_eq!(
        output.status.code(),
        Some(1),
        "{records:?} {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        records[1]["account"]["failure"]["code"],
        "lifecycle_hook_step_limit"
    );
    assert_eq!(records[1]["account"]["steps"], 8);
    endpoint.request().await;
    let second = endpoint.request().await;
    assert!(
        second
            .to_string()
            .contains("Perform another bounded verification pass.")
    );
    assert!(second.to_string().contains("contextual_data"));
    for _ in 2..8 {
        endpoint.request().await;
    }
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a provisioned native sandbox helper"]
async fn registered_hook_changes_cannot_replace_a_paused_turns_captured_policy() {
    for original_hooks in [false, true] {
        let fixture = Fixture::new(true);
        if original_hooks {
            lifecycle_hooks(
                &fixture,
                &[(
                    "original",
                    "before_input",
                    "required",
                    None,
                    r#"{"decision":"allow"}"#,
                )],
            );
        }
        let mut endpoint = Endpoint::start(vec![Reply::Question("question")]).await;
        let mut command = fixture.process(&endpoint.url, "serve");
        command.arg("--stdio");
        let mut host = connect(command).await;
        let session = start(&mut host, &fixture.primary).await;
        endpoint.request().await;
        let pending = wait_for(&mut host, &session, |view| {
            view["current"]["disposition"] == "suspended"
        })
        .await;
        let paused = host
            .request(
                "_co.grida/session/pause",
                task_basis(&pending, &session, "pause-before-change"),
            )
            .await;
        assert!(paused.get("error").is_none(), "{paused}");
        let basis = wait_for(&mut host, &session, |view| {
            view["current"]["paused"] == true
        })
        .await;
        host.close().await;
        lifecycle_hooks(
            &fixture,
            &[(
                "replacement",
                "before_input",
                "required",
                None,
                r#"{"decision":"deny","reason":"Must never run for old work."}"#,
            )],
        );
        let mut command = fixture.process(&endpoint.url, "serve");
        command.arg("--stdio");
        let mut host = connect(command).await;
        load(&mut host, &session, &fixture.primary).await;
        let before = host
            .request("_co.grida/session/hooks", json!({"sessionId":session}))
            .await;
        assert!(
            !before["result"]["results"]
                .as_array()
                .unwrap()
                .iter()
                .any(|result| result["id"] == "replacement")
        );
        let resumed=host.request("_co.grida/session/resume",json!({"task":task_basis(&basis,&session,"resume-after-change"),"expectedEpoch":basis["current"]["epoch"],"expectedJournalPosition":basis["current"]["journalPosition"]})).await;
        assert!(
            matches!(
                resumed["error"]["data"].as_str(),
                Some("permission_profile_changed" | "lifecycle_hook_profile_unavailable")
            ),
            "{resumed}"
        );
        let current = snapshot(&mut host, &session).await;
        let stopped = host
            .request(
                "_co.grida/session/stop",
                task_basis(&current, &session, "stop-old-policy"),
            )
            .await;
        assert!(stopped.get("error").is_none(), "{stopped}");
        wait_for(&mut host, &session, |view| {
            view["current"].is_null() && view["latest"]["status"] == "cancelled"
        })
        .await;
        let after = host
            .request("_co.grida/session/hooks", json!({"sessionId":session}))
            .await;
        assert_eq!(after["result"]["results"], before["result"]["results"]);
        assert!(endpoint.requests.try_recv().is_err());
        host.close().await;
        endpoint.done().await;
    }
}

#[tokio::test]
#[ignore = "requires a provisioned native sandbox helper"]
async fn a_sponsored_child_cannot_bypass_its_captured_input_hooks() {
    let fixture = Fixture::new(true);
    lifecycle_hooks(
        &fixture,
        &[(
            "review-child",
            "before_input",
            "required",
            None,
            r#"{"decision":"allow"}"#,
        )],
    );
    let executable = Path::new("/usr/bin/awk").canonicalize().unwrap();
    let digest: [u8; 32] = Sha256::digest(fs::read(&executable).unwrap()).into();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["hooks"][0]["executable"] = json!({"path":executable,"sha256":digest});
    profile["hooks"][0]["arguments"] = json!([
        r#"index($0, "CHILD_REVIEW_SENTINEL") { blocked=1 } END { if (blocked) print "{\"decision\":\"deny\",\"reason\":\"The child requires review.\"}"; else print "{\"decision\":\"allow\"}" }"#
    ]);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool(
            "delegate_review",
            r#"{"instructions":"Review CHILD_REVIEW_SENTINEL independently."}"#,
        ),
        Reply::Tool("collect_review", "{}"),
        Reply::Finished("The independent review could not proceed."),
    ])
    .await;
    let output = timeout(
        Duration::from_secs(45),
        fixture
            .process(&endpoint.url, "run")
            .arg("--cwd")
            .arg(&fixture.primary)
            .args([
                "--effort",
                "ultra",
                "--mode",
                "plan",
                "--prompt",
                "Parent-only task context.",
            ])
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    let records = records(&output.stdout);
    assert!(
        output.status.success(),
        "{records:?} {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let child = records[1]["account"]["independent_review"]["child"]
        .as_str()
        .unwrap();
    for _ in 0..3 {
        assert!(
            endpoint.request().await["messages"]
                .to_string()
                .contains("Parent-only task context.")
        );
    }
    assert!(endpoint.requests.try_recv().is_err());
    let store =
        agent_kit_store_sqlite::SqliteStore::open(fixture.state.join("runtime.sqlite")).unwrap();
    let session = agent_kit_core::SessionId::new(child).unwrap();
    let view = store.inspect(session.clone()).await.unwrap();
    let turn = view.latest.unwrap();
    assert_eq!(
        turn.outcome.as_ref().unwrap().status,
        agent_kit_core::messages::OutcomeStatus::Failed
    );
    let denied = store
        .inspect_turn_with(session, turn.binding.turn, |state| {
            let account = grida_agent_master::read_account(
                state.outcome().unwrap().account.as_ref().unwrap(),
            )?;
            Ok(account.steps == 0
                && account.lifecycle_hooks.iter().any(|result| {
                    result.id.as_str() == "review-child"
                        && result.status == grida_agent_master::hooks::CheckStatus::Denied
                }))
        })
        .await
        .unwrap();
    assert!(denied);
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a provisioned native sandbox helper"]
async fn an_unavailable_hook_program_keeps_inspection_and_retained_controls_available() {
    let fixture = Fixture::new(true);
    lifecycle_hooks(
        &fixture,
        &[(
            "missing-program",
            "before_input",
            "required",
            None,
            r#"{"decision":"allow"}"#,
        )],
    );
    let missing = Path::new("/usr/bin/grida-nonexistent-hook-fixture");
    assert!(!missing.exists());
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["hooks"][0]["executable"]["path"] = json!(missing);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let mut endpoint = Endpoint::start(vec![]).await;
    let mut command = fixture.process(&endpoint.url, "serve");
    command.arg("--stdio");
    let mut host = connect(command).await;
    let inspected = host.request("_co.grida/session/hooks", json!({})).await;
    assert_eq!(
        inspected["result"]["hooks"][0]["executable"],
        missing.to_str().unwrap(),
        "{inspected}"
    );
    let session = start(&mut host, &fixture.primary).await;
    let failed = wait_for(&mut host, &session, |view| view["current"].is_null()).await;
    assert_eq!(failed["latest"]["status"], "failed", "{failed}");
    let inspected = host
        .request("_co.grida/session/hooks", json!({"sessionId":session}))
        .await;
    assert_eq!(inspected["result"]["results"][0]["id"], "missing-program");
    assert_eq!(inspected["result"]["results"][0]["status"], "failed");
    assert!(endpoint.requests.try_recv().is_err());
    host.close().await;
    endpoint.done().await;
}
