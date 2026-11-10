//! GRIDA-SEC-004 — Built native completion authority and restart controls.

use super::approvals::{Fixture, Stdio as PrivateStdio};
use super::lifecycle::{prompt_request, task_basis};
use super::*;
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::PathBuf;

const CHECK: &str = "require-completion-text";
const FLAG: &str = "--require-completion-text";
const COMMAND_CHECK: &str = "before-completion-command";
const HEARTBEAT: &str = r#"
    exec 3>"$TMPDIR/heartbeat"
    while :; do printf . >&3; /bin/sleep 0.04; done
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
    let initialized = client.request("initialize", capabilities).await;
    assert_eq!(initialized["result"]["protocolVersion"], 1);
    client
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn interrupting_a_native_hook_cleans_up_and_a_changed_profile_cannot_resume_it() {
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("A candidate that must be checked."),
        Reply::Finished("A candidate that must be checked."),
        Reply::Finished("A candidate that must be checked."),
    ])
    .await;
    for (action, changed) in [("stop", false), ("pause", false), ("pause", true)] {
        let fixture = Fixture::new(true);
        let temporary = hook(&fixture, "/bin/sh", &["-c", HEARTBEAT], "required", false);
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
    timeout(WAIT, async {
        loop {
            let view = snapshot(client, session).await;
            if matches(&view) {
                return view;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

async fn start(client: &mut PrivateStdio, workspace: &Path) -> String {
    let created = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
    let submitted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(&session, "question", "Prepare the answer."),
        )
        .await;
    assert_eq!(submitted["result"]["disposition"], "claimed", "{submitted}");
    session
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
