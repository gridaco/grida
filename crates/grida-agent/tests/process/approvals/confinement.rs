// GRIDA-SEC-004 — built ACP command permission and native confinement cases.
use super::*;
use std::os::unix::fs::symlink;

#[test]
#[ignore = "requires a reviewed native helper and working Seatbelt or bubblewrap"]
fn approved_command_stays_in_scope_after_alias_retarget() {
    #[cfg(target_os = "linux")]
    if socket_probe::is_child() {
        socket_probe::verify_denials();
        return;
    }
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(approve_scoped_command());
}

async fn approve_scoped_command() {
    let fixture = Fixture::new(true);
    let contained = fixture.extra.join("contained");
    let attached = fixture.extra.join("attached");
    let protected = fixture
        ._base
        .path()
        .canonicalize()
        .unwrap()
        .join("protected");
    let secret = protected.join("input");
    let forbidden = protected.join("forbidden-write");
    fs::create_dir(&contained).unwrap();
    fs::create_dir(&protected).unwrap();
    fs::write(contained.join("input"), "visible fixture content").unwrap();
    fs::write(&secret, "outside fixture content").unwrap();
    symlink(&contained, &attached).unwrap();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["protectedPaths"] = json!([protected]);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();

    #[cfg(target_os = "linux")]
    let (probe, _listeners) = socket_probe::bind(&fixture.extra);
    #[cfg(not(target_os = "linux"))]
    let probe = String::new();
    let script = format!(
        r#"
            if (: < '{secret}') 2>/dev/null; then exit 41; fi
            if (: < attached/input) 2>/dev/null; then exit 42; fi
            if (printf denied > '{forbidden}') 2>/dev/null; then exit 43; fi
            if (printf denied > attached/forbidden-write) 2>/dev/null; then exit 44; fi
            {probe}
            printf selected >> effect
        "#,
        secret = secret.display(),
        forbidden = forbidden.display(),
    );
    let args = json!({"directory":"extra","access":"read_write","cmd":script});
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("exec_command", Box::leak(args.to_string().into_boxed_str())),
        Reply::Finished("Command complete."),
    ])
    .await;
    let records = fixture.run(&endpoint.url, &fixture.primary, 6).await;
    let session = records[0]["session_id"].as_str().unwrap();
    let turn = records[0]["turn_id"].as_str().unwrap();
    let wait = records[1]["approvals"][0]["waitId"].as_str().unwrap();
    assert!(!fixture.extra.join("effect").exists());
    endpoint.request().await;

    assert_eq!(
        fs::read_to_string(attached.join("input")).unwrap(),
        "visible fixture content"
    );
    fs::remove_file(&attached).unwrap();
    symlink(&protected, &attached).unwrap();
    let mut owner = approve(&fixture, &endpoint.url, session, turn, wait).await;
    let request = endpoint.request().await;
    let tool = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|message| message["role"] == "tool")
        .unwrap();
    let outcome: Value = serde_json::from_str(tool["content"].as_str().unwrap()).unwrap();
    assert_eq!(outcome["status"], "succeeded", "{outcome}");
    assert!(
        outcome["content"]
            .to_string()
            .contains("Process exited with code 0"),
        "{outcome}"
    );
    #[cfg(target_os = "linux")]
    {
        socket_probe::assert_denied(&outcome);
        assert_eq!(outcome["structured"]["backend"], "bubblewrap");
        assert_eq!(outcome["structured"]["descendants"], "namespace_ended");
    }
    #[cfg(target_os = "macos")]
    {
        assert_eq!(outcome["structured"]["backend"], "seatbelt");
        assert_eq!(
            outcome["structured"]["descendants"],
            "process_group_signalled"
        );
    }
    assert_eq!(outcome["structured"]["completion"]["code"], 0);
    assert_eq!(outcome["structured"]["cleanup_verified"], true);
    assert_eq!(fs::read(fixture.extra.join("effect")).unwrap(), b"selected");
    assert!(!forbidden.exists());
    assert_eq!(
        fs::read_to_string(secret).unwrap(),
        "outside fixture content"
    );
    settle(&mut owner, session).await;
    owner.close().await;
    endpoint.done().await;
}

#[cfg(target_os = "linux")]
#[tokio::test]
#[ignore = "requires a reviewed native helper and working Linux bubblewrap"]
async fn host_shutdown_stops_a_kept_command_and_its_detached_work() {
    let fixture = Fixture::new(true);
    let args = json!({
        "directory":"extra","access":"read_write","cmd":r#"
            /usr/bin/setsid /bin/bash -c 'while :; do printf tick >> heartbeat; /usr/bin/sleep 0.04; done' &
            wait
        "#,
        "yield_time_ms":30000,
    });
    let mut endpoint = Endpoint::start(vec![Reply::Tool(
        "exec_command",
        Box::leak(args.to_string().into_boxed_str()),
    )])
    .await;
    let records = fixture.run(&endpoint.url, &fixture.primary, 6).await;
    let session = records[0]["session_id"].as_str().unwrap();
    let turn = records[0]["turn_id"].as_str().unwrap();
    let wait = records[1]["approvals"][0]["waitId"].as_str().unwrap();
    endpoint.request().await;
    let mut owner = approve(&fixture, &endpoint.url, session, turn, wait).await;
    let heartbeat = fixture.extra.join("heartbeat");
    timeout(WAIT, async {
        while fs::metadata(&heartbeat).map_or(true, |metadata| metadata.len() < 8) {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();

    let snapshot = owner
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert_eq!(snapshot["result"]["current"]["turnId"], turn, "{snapshot}");
    let stop = owner
        .request(
            "_co.grida/session/stop",
            crate::lifecycle::task_basis(&snapshot["result"], session, "stop-command-fixture"),
        )
        .await;
    assert!(stop.get("error").is_none(), "{stop}");
    let terminal = timeout(WAIT, async {
        loop {
            let response = owner
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            let snapshot = &response["result"];
            if snapshot["current"].is_null() {
                break snapshot.clone();
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(terminal["latest"]["status"], "cancelled", "{terminal}");
    assert_eq!(terminal["admissionPaused"], true, "{terminal}");
    // Stopping the turn leaves the command with the chat; host shutdown
    // stops it and everything it started.
    let running = fs::metadata(&heartbeat).unwrap().len();
    timeout(WAIT, async {
        while fs::metadata(&heartbeat).unwrap().len() == running {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();

    let Stdio {
        child,
        stdin,
        stdout,
        ..
    } = owner;
    drop(stdin);
    let output = finish_child(child).await;
    drop(stdout);
    let diagnostic = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        assert_eq!(output.status.code(), Some(5), "{diagnostic}");
        assert!(
            [
                "grida-agent: host_turn_unverified",
                "grida-agent: process_cleanup_unverified"
            ]
            .contains(&diagnostic.trim()),
            "{diagnostic}"
        );
    }
    let length = fs::metadata(&heartbeat).unwrap().len();
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert_eq!(fs::metadata(&heartbeat).unwrap().len(), length);
    assert!(
        fs::read_dir(fixture._base.path().join("temporary"))
            .unwrap()
            .next()
            .is_none()
    );
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[cfg(target_os = "linux")]
mod socket_probe {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr, TcpListener, TcpStream};
    use std::os::unix::net::{UnixListener, UnixStream};

    const EXECUTABLE: &str = "command-socket-probe";
    const TEST: &str =
        "approvals::confinement::approved_command_stays_in_scope_after_alias_retarget";
    const SOCKET: &str = "GRIDA_AGENT_TEST_COMMAND_SOCKET";
    const PORT: &str = "GRIDA_AGENT_TEST_COMMAND_PORT";
    const DENIALS: &str = "Unix, IPv4, and IPv6 socket creation denied";

    pub(super) fn is_child() -> bool {
        std::env::current_exe()
            .unwrap()
            .file_name()
            .is_some_and(|name| name == EXECUTABLE)
    }

    // Reuse the same test binary inside the command's namespace. Its parent
    // keeps both listeners open and requires the probe marker in the tool
    // result. Returns the script lines that run the probe.
    pub(super) fn bind(workspace: &Path) -> (String, (UnixListener, TcpListener)) {
        let probe = workspace.join(EXECUTABLE);
        fs::copy(std::env::current_exe().unwrap(), &probe).unwrap();
        fs::set_permissions(&probe, fs::Permissions::from_mode(0o700)).unwrap();
        let socket = workspace.join("listener.sock");
        let unix = UnixListener::bind(&socket).unwrap();
        let tcp = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = tcp.local_addr().unwrap().port();
        let socket = socket.display();
        let script = format!(
            "test -S '{socket}' || exit 45\n\
             {SOCKET}='{socket}' {PORT}='{port}' './{EXECUTABLE}' --exact '{TEST}' \
             --include-ignored --nocapture --test-threads=1 || exit 46"
        );
        (script, (unix, tcp))
    }

    pub(super) fn verify_denials() {
        let socket = std::env::var_os(SOCKET).unwrap();
        let port: u16 = std::env::var(PORT).unwrap().parse().unwrap();
        let unix = UnixStream::connect(socket).unwrap_err();
        let ipv4 = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap_err();
        let ipv6 = TcpStream::connect((Ipv6Addr::LOCALHOST, port)).unwrap_err();
        for error in [unix, ipv4, ipv6] {
            assert_eq!(error.raw_os_error(), Some(libc::EPERM), "{error}");
        }
        println!("{DENIALS}");
    }

    pub(super) fn assert_denied(outcome: &Value) {
        assert!(
            outcome["content"].to_string().contains(DENIALS),
            "{outcome}"
        );
    }
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and working Seatbelt or bubblewrap"]
async fn read_only_command_permits_selected_bytes_and_private_temporary_work() {
    let fixture = Fixture::new(true);
    let source = fixture.extra.join("input.txt");
    let disallowed = fixture.extra.join("ungranted-output.txt");
    let temporary = fixture._base.path().join("temporary");
    let secret = fixture.primary.join("protected.txt");
    fs::write(&source, "selected text").unwrap();
    fs::write(&secret, "host private fixture").unwrap();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][1]["commandRead"] = json!("allow");
    profile["directories"][1]["commandReadWrite"] = json!("deny");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();

    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port().to_string();
    // The default shell is /bin/sh; bash provides /dev/tcp for the probe.
    let script = format!(
        r#"exec /bin/bash -c '
            test "$(/bin/cat input.txt)" = "selected text" || exit 71
            test -z "${{GRIDA_TEST_HOST_ONLY_CREDENTIAL+x}}" || exit 73
            if (: < "{secret}") 2>/dev/null; then exit 74; fi
            if (printf denied > ungranted-output.txt) 2>/dev/null; then exit 75; fi
            if (: > "/dev/tcp/127.0.0.1/{port}") 2>/dev/null; then exit 76; fi
            printf private > "$TMPDIR/output" || exit 77
            test "$(/bin/cat "$TMPDIR/output")" = private || exit 78
            printf read-only-profile-verified
        '"#,
        secret = secret.display(),
    );
    let arguments = json!({"directory": "extra", "access": "read", "cmd": script});
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool(
            "exec_command",
            Box::leak(arguments.to_string().into_boxed_str()),
        ),
        Reply::Finished("Read-only operation complete."),
    ])
    .await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .args(["--prompt", "Read the selected project source."])
            .env(
                "GRIDA_TEST_HOST_ONLY_CREDENTIAL",
                "synthetic host-only value",
            )
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
    endpoint.request().await;
    let request = endpoint.request().await;
    let tool = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|message| message["role"] == "tool")
        .unwrap();
    let outcome: Value = serde_json::from_str(tool["content"].as_str().unwrap()).unwrap();
    assert_eq!(outcome["status"], "succeeded", "{outcome}");
    assert_eq!(outcome["structured"]["completion"]["code"], 0, "{outcome}");
    assert_eq!(outcome["structured"]["cleanup_verified"], true, "{outcome}");
    assert!(
        outcome.to_string().contains("read-only-profile-verified"),
        "{outcome}"
    );
    assert!(!disallowed.exists());
    assert!(fs::read_dir(temporary).unwrap().next().is_none());
    endpoint.done().await;
}
