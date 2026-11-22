//! GRIDA-SEC-004 / GRIDA-SEC-014 — an approval authorizes a single process.

use super::*;
use crate::full_access::last_tool;

fn fixture() -> Fixture {
    let fixture = crate::full_access::fixture(false);
    let mut policy: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    policy["directories"][0]["commandRead"] = json!("allow");
    policy["allowApproveForMe"] = json!(true);
    policy["initialPermissionMode"] = json!("approve_for_me");
    policy["allowCommandEscalation"] = json!(true);
    fs::write(&fixture.profile, serde_json::to_vec(&policy).unwrap()).unwrap();
    fixture
}

fn call(tool: &'static str, args: Value) -> Reply {
    Reply::Tool(tool, Box::leak(args.to_string().into_boxed_str()))
}

fn request(command: &str, reason: &str) -> Value {
    json!({"cmd":command,"access":"read_write","sandbox_permissions":"require_escalated","justification":reason})
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn ordinary_command_reviews_each_destination_once_without_user_approval() {
    let fixture = fixture();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowCommandNetwork"] = json!(true);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    // Reserved names cannot supply an upstream. 502 proves the broker allowed
    // resolution, while the final denied destination must get 403 immediately.
    let command = json!({
        "cmd": "for n in 1 1 2 3 4 5 6; do code=502; if [ \"$n\" = 6 ]; then code=403; fi; /usr/bin/curl -sS --connect-timeout 10 --max-time 12 https://mirror-$n.invalid/ 2>&1 | /usr/bin/grep -q \"$code\" || exit 41; done; printf finished > receipt",
        "access": "read_write",
        "yield_time_ms": 25000
    });
    let mut replies = vec![call("exec_command", command)];
    replies.extend((1..=5).map(|_| Reply::Finished(r#"{"outcome":"allow"}"#)));
    replies.push(Reply::Finished(r#"{"outcome":"deny","risk_level":"high","user_authorization":"low","rationale":"The destination is outside the requested scope."}"#));
    replies.push(Reply::Finished(
        "The first five connections were allowed. The last was denied.",
    ));
    let mut endpoint = Endpoint::start(replies).await;
    const LIFECYCLE: &str = "co.grida/session/lifecycle";
    let mut client = Stdio::start(&fixture, &endpoint.url);
    let mut init = initialize();
    init["clientCapabilities"]["_meta"][LIFECYCLE] = json!(1);
    let negotiated = client.request("initialize", init).await;
    assert_eq!(
        negotiated["result"]["agentCapabilities"]["_meta"][LIFECYCLE],
        1
    );
    let chat = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = chat["result"]["sessionId"].as_str().unwrap();
    let submitted = client
        .send(
            "_co.grida/session/submit",
            crate::lifecycle::prompt_request(
                session,
                "auto-connect",
                "Contact the requested registry.",
            ),
        )
        .await;
    timeout(WAIT, async {
        let mut accepted = false;
        let mut settled = false;
        while !accepted || !settled {
            let frame = client.read_frame().await;
            if frame["id"] == submitted {
                assert!(frame["result"]["turnId"].is_string(), "{frame}");
                accepted = true;
            }
            let lifecycle = &frame["params"]["_meta"][LIFECYCLE];
            assert_ne!(lifecycle["kind"], "approval_required", "{frame}");
            if lifecycle["kind"] == "settled" {
                assert_eq!(lifecycle["status"], "succeeded", "{frame}");
                settled = true;
            }
        }
    })
    .await
    .unwrap();

    let acting = endpoint.request().await;
    let exec = acting["tools"]
        .as_array()
        .unwrap()
        .iter()
        .find(|tool| tool["function"]["name"] == "exec_command")
        .unwrap();
    let properties = &exec["function"]["parameters"]["properties"];
    assert!(properties.get("network_access").is_none());
    assert!(properties.get("network").is_none());
    for index in 1..=6 {
        let connect = endpoint.request().await;
        let evidence: Value = serde_json::from_str(
            current_review_message(&connect)["content"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(evidence["action"]["kind"], "network_command", "{evidence}");
        assert_eq!(
            evidence["action"]["host"],
            format!("mirror-{index}.invalid")
        );
        assert_eq!(evidence["action"]["port"], 443);
    }
    let result = last_tool(&endpoint.request().await);
    assert_eq!(result["status"], "succeeded", "{result}");
    assert_eq!(
        fs::read(fixture.primary.join("receipt")).unwrap(),
        b"finished"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn command_exit_withdraws_the_destination_wait_and_finishes_its_private_attempt() {
    let fixture = fixture();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowCommandNetwork"] = true.into();
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let mut endpoint = Endpoint::start(vec![
        call(
            "exec_command",
            json!({
                "cmd": "/usr/bin/curl -fsS --max-time 3 https://example.invalid/",
                "access": "read", "yield_time_ms": 8000
            }),
        ),
        Reply::Hold("Waiting on the private decision"),
        Reply::Finished("The required connection timed out."),
    ])
    .await;
    let mut process = fixture.process(&endpoint.url, "run");
    process
        .args([
            "--prompt",
            "Check the destination using the given short timeout.",
            "--cwd",
        ])
        .arg(&fixture.primary);
    let output = process.output();
    let (output, ()) = tokio::join!(output, async {
        endpoint.request().await;
        let review = endpoint.request().await;
        assert!(
            current_review_message(&review)["content"]
                .as_str()
                .unwrap()
                .contains("example.invalid")
        );
        let foreground = endpoint.request().await;
        assert!(
            last_tool(&foreground).to_string().contains("28"),
            "{foreground}"
        );
    });
    let output = output.unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(records(&output.stdout)[1]["disposition"], "succeeded");
    let db = rusqlite::Connection::open_with_flags(
        fixture.state.join("agent.sqlite"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    let head: Vec<u8> = db
        .query_row("SELECT head FROM turns", [], |r| r.get(0))
        .unwrap();
    let head: Value = serde_json::from_slice(&head).unwrap();
    let waits = head["waits"].as_object().unwrap();
    assert_eq!(waits.len(), 1);
    let wait = waits.values().next().unwrap();
    assert_eq!(wait["request"]["schema"], "grida.agent.network-review");
    assert_eq!(wait["withdrawn"], true);
    assert!(wait["answer"].is_null());
    let unfinished: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM turn_parts p
        JOIN json_each(p.body, '$.attempts') a WHERE p.key LIKE 'o/%'
        AND json_extract(a.value,'$.outcome') IS NULL)",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(!unfinished, "A cancelled private attempt is still running");
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn publishing_a_running_command_handle_keeps_its_destination_assessment() {
    let fixture = fixture();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowCommandNetwork"] = true.into();
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let (decide, held_review) = tokio::sync::oneshot::channel();
    let (poll, held_poll) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        call("exec_command", json!({
            "cmd": "/usr/bin/curl -sS --max-time 12 https://example.invalid/ 2>&1 | /usr/bin/grep -q 403 && printf blocked > receipt",
            "access": "read_write", "yield_time_ms": 1500
        })),
        Reply::Release(r#"{"outcome":"deny","risk_level":"medium","user_authorization":"low","rationale":"The workspace must remain offline."}"#, held_review),
        Reply::After(held_poll,Box::new(call("write_stdin",json!({"session_id":1,"chars":"","yield_time_ms":2000})))),
        Reply::Finished("The workspace stayed offline."),
    ]).await;
    let mut client = Stdio::start(&fixture, &endpoint.url);
    client.request("initialize", initialize()).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let accepted = client
        .request(
            "_co.grida/session/submit",
            crate::lifecycle::prompt_request(
                session,
                "network-during-yield",
                "Keep this workspace offline. Verify the request is blocked.",
            ),
        )
        .await;
    assert!(accepted["result"]["turnId"].is_string(), "{accepted}");
    endpoint.request().await;
    let review = endpoint.request().await;
    assert!(
        current_review_message(&review)["content"]
            .as_str()
            .unwrap()
            .contains("example.invalid"),
        "{review}"
    );
    let foreground = endpoint.request().await;
    assert!(
        last_tool(&foreground)
            .to_string()
            .contains("Process running with"),
        "{foreground}"
    );
    decide.send(()).unwrap();
    // A replacement assessment would consume another provider request here.
    // Only the returned verdict can let this synthetic command record the 403.
    timeout(WAIT, async {
        while !fixture.primary.join("receipt").exists() {
            assert!(
                endpoint.requests.try_recv().is_err(),
                "unexpected review after the command yielded"
            );
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    poll.send(()).unwrap();
    let continued = endpoint.request().await;
    assert_eq!(last_tool(&continued)["status"], "succeeded", "{continued}");
    assert_eq!(
        fs::read(fixture.primary.join("receipt")).unwrap(),
        b"blocked"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn denying_one_concurrent_destination_keeps_the_other_under_review() {
    const WINDOW: &str = "co.grida/session/transcript-window";
    let fixture = fixture();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowCommandNetwork"] = json!(true);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let command = json!({
        "cmd": "/usr/bin/curl -sS --parallel --parallel-immediate --max-time 25 https://first.invalid/ https://second.invalid/",
        "access": "read", "yield_time_ms": 28000,
    });
    let (release, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        call("exec_command", command),
        Reply::Release(r#"{"outcome":"allow"}"#, held),
        Reply::Finished(
            r#"{"outcome":"deny","risk_level":"high","rationale":"Outside the requested scope."}"#,
        ),
        Reply::Finished("The network checks finished."),
    ])
    .await;
    let mut client = Stdio::start(&fixture, &endpoint.url);
    let mut init = initialize();
    init["clientCapabilities"]["_meta"][WINDOW] = json!(1);
    client.request("initialize", init).await;
    let new = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = new["result"]["sessionId"].as_str().unwrap();
    let sent = client
        .request(
            "_co.grida/session/submit",
            crate::lifecycle::prompt_request(
                session,
                "two-registries",
                "Check the two registries.",
            ),
        )
        .await;
    assert!(sent["result"]["turnId"].is_string(), "{sent}");
    endpoint.request().await;
    let destination = |body: Value| {
        let action: Value =
            serde_json::from_str(current_review_message(&body)["content"].as_str().unwrap())
                .unwrap();
        action["action"]["host"].as_str().unwrap().to_owned()
    };
    let held_peer = destination(endpoint.request().await);
    let denied_peer = destination(
        timeout(Duration::from_secs(7), endpoint.request())
            .await
            .expect("the sibling must reach review while the first response is held"),
    );
    assert_ne!(held_peer, denied_peer);
    timeout(WAIT, async {
        let query = json!({
            "cwd": fixture.primary, "sessionId": session, "mcpServers": [],
            "_meta": {WINDOW: {"kind": "read", "requestId": "concurrent-reviews"}}
        });
        loop {
            let page = client.request("session/load", query.clone()).await;
            let reviews = &page["result"]["_meta"][WINDOW]["turns"][0]["approvalReviews"];
            let rows = reviews
                .as_array()
                .expect("both reviews are in the running turn");
            let review_for = |host: &str| {
                let label = format!("Network {host}:443 ");
                rows.iter().find(|row| {
                    row["action"]
                        .as_str()
                        .is_some_and(|action| action.starts_with(&label))
                })
            };
            if let Some(held) = review_for(&held_peer)
                && held["decision"] == "reviewing"
                && review_for(&denied_peer).is_some_and(|row| row["decision"] == "declined")
            {
                assert!(held.get("failure").is_none(), "{held}");
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let snapshot = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert_eq!(snapshot["result"]["current"]["inputNeeded"], false);
    let pending = client
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":session,"turnId":sent["result"]["turnId"]}),
        )
        .await;
    let approvals = pending["result"]["approvals"].as_array().unwrap();
    assert_eq!(approvals.len(), 1, "{pending}");
    assert_eq!(approvals[0]["reviewing"], true);
    assert!(approvals[0].get("reviewFailure").is_none());
    release.send(()).unwrap();
    let next = endpoint.request().await;
    assert!(
        last_tool(&next)
            .to_string()
            .contains("Outside the requested scope."),
        "{next}"
    );
    settle(&mut client, session).await;
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn managed_command_can_receive_manual_review_while_running() {
    let fixture = fixture();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowCommandNetwork"] = json!(true);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let command = json!({
        "cmd": "printf started > starts; /usr/bin/curl -sS --connect-timeout 25 --max-time 30 https://registry.example.test/ 2>&1 | /usr/bin/grep -q '403' && printf declined > receipt",
        "access":"read_write", "yield_time_ms":15000
    });
    let mut endpoint = Endpoint::start(vec![
        call("exec_command", command),
        Reply::Finished("The destination was declined."),
    ])
    .await;
    let mut client = Stdio::start(&fixture, &endpoint.url);
    let init = client.request("initialize", initialize()).await;
    assert!(init.get("error").is_none(), "{init}");
    let chat = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = chat["result"]["sessionId"].as_str().unwrap();
    // The original instructions exceed the bound for a complete review.
    // Human handoff remains possible while the process is waiting for its connection.
    let prompt = format!("Contact the requested registry. {}", "x".repeat(33 * 1024));
    let submit = crate::lifecycle::prompt_request(session, "managed-review", &prompt);
    let accepted = client.request("_co.grida/session/submit", submit).await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    endpoint.request().await;
    let (snapshot, pending) = timeout(WAIT, async {
        loop {
            let snapshot = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            let pending = client
                .request(
                    "_co.grida/session/approvals",
                    json!({"sessionId":session,"turnId":turn}),
                )
                .await;
            if pending["result"]["approvals"][0]["waitId"]
                .as_str()
                .is_some_and(|id| id.starts_with("approval/network/human/"))
                && pending["result"]["approvals"][0]["reviewing"] != true
                && snapshot["result"]["current"]["controlRevision"]
                    == pending["result"]["controlRevision"]
            {
                break (snapshot, pending);
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        snapshot["result"]["current"]["disposition"], "running",
        "{snapshot}"
    );
    assert_eq!(
        snapshot["result"]["current"]["inputNeeded"], true,
        "{snapshot}"
    );
    let manual = &pending["result"]["approvals"][0];
    assert_ne!(manual["reviewing"], true, "{pending}");
    assert_eq!(
        manual["request"]["effect"]["network"]["host"],
        "registry.example.test"
    );
    let decline = json!({
        "sessionId":session,"turnId":turn,"waitId":pending["result"]["approvals"][0]["waitId"],
        "requestId":"decline-managed-review", "decision":"decline",
        "expectedSessionRevision":snapshot["result"]["sessionRevision"],
        "expectedControlRevision":pending["result"]["controlRevision"],
    });
    let answer = client
        .request("_co.grida/session/answer-approval", decline)
        .await;
    assert!(answer.get("error").is_none(), "{answer}");
    let result = last_tool(&endpoint.request().await);
    assert_eq!(result["status"], "succeeded", "{result}");
    settle(&mut client, session).await;
    assert_eq!(
        fs::read(fixture.primary.join("starts")).unwrap(),
        b"started"
    );
    assert_eq!(
        fs::read(fixture.primary.join("receipt")).unwrap(),
        b"declined"
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn approved_command_keeps_host_state_unreadable() {
    let fixture = fixture();
    fs::create_dir_all(&fixture.state).unwrap();
    fs::set_permissions(&fixture.state, fs::Permissions::from_mode(0o700)).unwrap();
    fs::write(
        fixture.state.join("private-test"),
        "private fixture content",
    )
    .unwrap();
    let mut endpoint = Endpoint::start(vec![
        call(
            "exec_command",
            request(
                "if /bin/cat ../state/private-test >/dev/null 2>&1; then exit 77; fi; if (printf forbidden > .grida) 2>/dev/null; then exit 78; fi; printf recorded > receipt",
                "Write the requested receipt into the project.",
            ),
        ),
        Reply::Finished(r#"{"outcome":"allow"}"#),
        Reply::Finished("Checked."),
    ])
    .await;
    fixture.run_with_cwd(&endpoint.url, None, 0).await;
    endpoint.request().await;
    let review = endpoint.request().await;
    let evidence: Value =
        serde_json::from_str(current_review_message(&review)["content"].as_str().unwrap()).unwrap();
    assert_eq!(evidence["action"]["kind"], "escalated_command");
    assert_eq!(evidence["action"]["network"], "denied");
    let result = last_tool(&endpoint.request().await);
    assert_eq!(result["status"], "succeeded", "{result}");
    assert_eq!(
        fs::read(fixture.primary.join("receipt")).unwrap(),
        b"recorded"
    );
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn destructive_workspace_command_needs_review_before_it_can_run() {
    for (options, managed, terminal, finite) in [
        (json!({}), false, false, true),
        (json!({}), true, false, false),
        (json!({"tty":true}), true, true, false),
        (json!({"yield_time_ms":250}), true, false, false),
    ] {
        let fixture = fixture();
        let mut profile: Value =
            serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
        profile["allowCommandNetwork"] = json!(managed);
        fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
        let receipt = fixture.primary.join("keep");
        fs::write(&receipt, b"preserved").unwrap();
        let mut command = json!({"cmd":"rm -f keep", "access":"read_write"});
        command
            .as_object_mut()
            .unwrap()
            .extend(options.as_object().unwrap().clone());
        let mut endpoint = Endpoint::start(vec![
            call("exec_command", command),
            Reply::Finished(r#"{"outcome":"deny","risk_level":"high","user_authorization":"low","rationale":"Removing this file has no authorization."}"#),
            Reply::Finished("The file was preserved."),
        ]).await;
        fixture.run_with_cwd(&endpoint.url, None, 0).await;
        endpoint.request().await;
        let review = endpoint.request().await;
        let evidence: Value =
            serde_json::from_str(current_review_message(&review)["content"].as_str().unwrap())
                .unwrap();
        let action = &evidence["action"];
        assert_eq!(action["kind"], "confined_command", "{action}");
        assert_eq!(action["terminal"], terminal, "{action}");
        assert_eq!(action["finite"], finite, "{action}");
        assert_eq!(
            action["network"],
            if managed { "managed" } else { "denied" },
            "{action}"
        );
        let declined = last_tool(&endpoint.request().await);
        assert!(
            declined["content"]
                .to_string()
                .contains("permission_declined"),
            "{declined}"
        );
        assert_eq!(fs::read(receipt).unwrap(), b"preserved");
        endpoint.done().await;
    }
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn unavailable_retry_settles_as_a_tool_refusal() {
    for (mode, enabled) in [("act", false), ("plan", true)] {
        let fixture = fixture();
        let mut profile: Value =
            serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
        profile["allowCommandEscalation"] = json!(enabled);
        fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
        let mut command = request(
            "printf unexpected > receipt",
            "Write the requested receipt into the project.",
        );
        if mode == "plan" {
            command["cmd"] = json!("printf unexpected");
            command["access"] = json!("read");
            command["justification"] = json!("Check the project before proposing changes.");
        }
        let mut endpoint = Endpoint::start(vec![
            call("exec_command", command),
            Reply::Finished("Reviewed commands are unavailable."),
        ])
        .await;
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .args(["--mode", mode, "--prompt", "Use the selected directory"])
                .arg("--cwd")
                .arg(&fixture.primary)
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            output.status.success(),
            "{mode}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let acting = endpoint.request().await;
        let exec = acting["tools"]
            .as_array()
            .unwrap()
            .iter()
            .find(|tool| tool["function"]["name"] == "exec_command")
            .unwrap();
        let properties = &exec["function"]["parameters"]["properties"];
        for property in ["sandbox_permissions", "justification", "listen_port"] {
            assert!(properties.get(property).is_none(), "{mode}: {exec}");
        }
        let refused = last_tool(&endpoint.request().await);
        assert_eq!(refused["status"], "failed", "{mode}: {refused}");
        assert!(
            refused
                .to_string()
                .contains("command_escalation_unavailable"),
            "{mode}: {refused}"
        );
        assert!(!fixture.primary.join("receipt").exists(), "{mode}");
        endpoint.done().await;
    }
}

#[cfg(target_os = "linux")]
#[tokio::test]
#[ignore = "requires the current native helper and working bubblewrap"]
async fn unavailable_listener_is_neither_offered_nor_reviewed() {
    let fixture = fixture();
    let mut command = request(
        "printf unexpected > receipt",
        "Start a local fixture server.",
    );
    command["listen_port"] = json!(43001);
    let mut endpoint = Endpoint::start(vec![
        call("exec_command", command),
        Reply::Finished("Local listener permission is unavailable."),
    ])
    .await;
    fixture.run_with_cwd(&endpoint.url, None, 0).await;
    let acting = endpoint.request().await;
    let exec = acting["tools"]
        .as_array()
        .unwrap()
        .iter()
        .find(|tool| tool["function"]["name"] == "exec_command")
        .unwrap();
    let properties = &exec["function"]["parameters"]["properties"];
    assert!(properties.get("sandbox_permissions").is_some(), "{exec}");
    assert!(properties.get("listen_port").is_none(), "{exec}");
    let refused = last_tool(&endpoint.request().await);
    assert_eq!(refused["status"], "failed", "{refused}");
    assert!(refused.to_string().contains("command_listener_unavailable"));
    assert!(!fixture.primary.join("receipt").exists());
    endpoint.done().await;
}

#[cfg(target_os = "macos")]
#[tokio::test]
#[ignore = "requires the current native helper, python3 and working Seatbelt"]
async fn auto_reviews_one_listener_and_keeps_the_process_confined() {
    const SERVER: &str = r#"
import pathlib
import socket
import sys

port, other_port = map(int, sys.argv[1:])
listener = socket.socket()
listener.bind(("127.0.0.1", port))
listener.listen()

with socket.create_connection(("127.0.0.1", port), timeout=1) as probe:
    probe.sendall(b"fixture self-check")
    self_connection, _ = listener.accept()
    with self_connection:
        assert self_connection.recv(128) == b"fixture self-check"

try:
    with socket.socket() as other:
        other.bind(("127.0.0.1", other_port))
except PermissionError:
    pass
else:
    raise SystemExit("unapproved bind succeeded")

try:
    with socket.socket(type=socket.SOCK_DGRAM) as datagram:
        datagram.bind(("127.0.0.1", port))
except PermissionError:
    pass
else:
    raise SystemExit("unapproved UDP bind succeeded")

try:
    with socket.socket() as outbound:
        outbound.settimeout(0.3)
        outbound.connect(("127.0.0.1", other_port))
except PermissionError:
    pass
else:
    raise SystemExit("unapproved connection succeeded")

try:
    pathlib.Path("../state/private-test").read_bytes()
except PermissionError:
    pass
else:
    raise SystemExit("protected read succeeded")

for path in (".codex/config", ".git/config"):
    try:
        pathlib.Path(path).write_text("forbidden")
    except PermissionError:
        pass
    else:
        raise SystemExit(f"protected write succeeded: {path}")

pathlib.Path("ready").write_text("ready")
while True:
    connection, _ = listener.accept()
    with connection:
        request = connection.recv(4096)
        if request.startswith(b"GET / HTTP/1.1"):
            connection.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 15\r\nConnection: close\r\n\r\nfixture preview")
            print("Served the approved preview", flush=True)
"#;
    const REASON: &str = "Start the requested preview on localhost.";
    let fixture = fixture();
    fs::create_dir_all(&fixture.state).unwrap();
    fs::set_permissions(&fixture.state, fs::Permissions::from_mode(0o700)).unwrap();
    fs::write(fixture.state.join("private-test"), b"private fixture state").unwrap();
    fs::create_dir(fixture.primary.join(".codex")).unwrap();
    fs::create_dir(fixture.primary.join(".git")).unwrap();
    fs::write(fixture.primary.join("preview.py"), SERVER).unwrap();
    let ready = fixture.primary.join("ready");
    let intended = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = intended.local_addr().unwrap().port();
    let other = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let other_port = other.local_addr().unwrap().port();
    // Reserve both ports while selecting them, then free the second port before
    // the wrong-port bind to distinguish a permission denial from port collision.
    drop(other);
    let start = format!("exec python3 preview.py {port} {other_port}");
    let (allow, pending) = tokio::sync::oneshot::channel();
    let id = Arc::new(std::sync::OnceLock::new());
    let poll_id = id.clone();
    let input_id = id.clone();
    let mut retry = request(&start, REASON);
    retry["listen_port"] = json!(port);
    retry["yield_time_ms"] = json!(250);
    let mut endpoint = Endpoint::start(vec![
        call("exec_command", json!({"cmd":start,"access":"read_write"})),
        call("exec_command", retry),
        Reply::Release(r#"{"outcome":"allow"}"#, pending),
        Reply::Finished("The approved command is running."),
        Reply::Choose(Box::new(move |_| {
            call(
                "write_stdin",
                json!({"session_id":poll_id.get().unwrap(),"yield_time_ms":250}),
            )
        })),
        Reply::Choose(Box::new(move |request| {
            let output = last_tool(request);
            assert!(
                output["content"]
                    .to_string()
                    .contains("Served the approved preview"),
                "{output}"
            );
            call(
                "write_stdin",
                json!({"session_id":input_id.get().unwrap(),"chars":"unexpected input\n"}),
            )
        })),
        Reply::Choose(Box::new(|request| {
            let result = last_tool(request);
            assert_eq!(result["status"], "failed", "{result}");
            assert!(
                result["content"].to_string().contains("stdin is closed"),
                "{result}"
            );
            call(
                "exec_command",
                json!({"cmd":"printf extra > ../extra/after-command","access":"read_write"}),
            )
        })),
        Reply::Finished("The approved command is still running."),
        call("exec_command", json!({"cmd":start,"access":"read_write"})),
        Reply::Finished("A new command cannot use the earlier listener permission."),
    ])
    .await;
    let mut owner = Stdio::start(&fixture, &endpoint.url);
    let mut init = initialize();
    for cap in [
        "co.grida/session/processes",
        "co.grida/session/permission-mode",
    ] {
        init["clientCapabilities"]["_meta"][cap] = json!(1);
    }
    assert!(
        owner
            .request("initialize", init)
            .await
            .get("error")
            .is_none()
    );
    let chat = owner
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await["result"]["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();
    let submit = crate::lifecycle::prompt_request(
        &chat,
        "start-preview",
        "Start the local preview server so I can view it in my browser.",
    );
    drop(intended);
    let accepted = owner.request("_co.grida/session/submit", submit).await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    endpoint.request().await;
    let confined = last_tool(&endpoint.request().await);
    assert_eq!(confined["status"], "failed", "{confined}");
    assert_eq!(confined["structured"]["backend"], "seatbelt");
    let output = confined["content"].to_string();
    assert!(
        output.contains("listener.bind") && output.contains("PermissionError"),
        "{confined}"
    );
    let review = endpoint.request().await;
    let evidence: Value =
        serde_json::from_str(current_review_message(&review)["content"].as_str().unwrap()).unwrap();
    assert_eq!(evidence["action"]["kind"], "escalated_command");
    assert_eq!(evidence["action"]["command"], start);
    assert_eq!(evidence["action"]["network"], "listen");
    assert_eq!(evidence["action"]["listen_port"], port);
    let approvals = owner
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":chat,"turnId":turn}),
        )
        .await;
    let effect = &approvals["result"]["approvals"][0]["request"]["effect"];
    assert_eq!(effect["justification"], REASON);
    assert_eq!(effect["cwd"], json!(fixture.primary));
    assert_eq!(effect["network"], "listen");
    assert_eq!(effect["listen_port"], port);
    assert!(effect["filesystem"].is_object(), "{effect}");
    assert!(!ready.exists());
    allow.send(()).unwrap();
    let launched = last_tool(&endpoint.request().await);
    assert!(
        launched["content"]
            .to_string()
            .contains("Process running with session ID"),
        "{launched}"
    );
    settle(&mut owner, &chat).await;
    let scope = json!({"sessionId":chat});
    let processes = owner
        .request("_co.grida/session/processes", scope.clone())
        .await;
    let process = processes["result"]["processes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry["command"] == start && entry["state"] == "running")
        .unwrap();
    id.set(process["processId"].as_u64().unwrap()).unwrap();
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(1))
        .build()
        .unwrap();
    let url = format!("http://127.0.0.1:{port}/");
    let response = timeout(WAIT, async {
        loop {
            if let Ok(response) = client.get(&url).send().await {
                break response;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("the approved listener must accept a real HTTP connection");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    assert_eq!(response.text().await.unwrap(), "fixture preview");
    assert_eq!(fs::read(ready).unwrap(), b"ready");
    let followup = owner.request("session/prompt", json!({"sessionId":chat,"prompt":[{"type":"text","text":"Check the approved command's output and the default workspace boundary."}]})).await;
    assert!(followup.get("error").is_none(), "{followup}");
    for _ in 0..3 {
        endpoint.request().await;
    }
    let denied = last_tool(&endpoint.request().await);
    assert!(
        denied["structured"]["completion"]["code"]
            .as_i64()
            .is_some_and(|code| code != 0),
        "{denied}"
    );
    assert!(!fixture.extra.join("after-command").exists());
    let mode = owner
        .request(
            "_co.grida/session/permission-mode",
            json!({"sessionId":chat,"cwd":fixture.primary}),
        )
        .await;
    assert_eq!(mode["result"]["mode"], "approve_for_me", "{mode}");
    let other = owner
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let foreign_stop = owner
        .request(
            "_co.grida/session/stop-processes",
            json!({"sessionId":other["result"]["sessionId"],"processIds":[process["processId"]]}),
        )
        .await;
    assert_eq!(
        foreign_stop["result"]["stopped"],
        json!([]),
        "{foreign_stop}"
    );
    let stopped = owner
        .request(
            "_co.grida/session/stop-processes",
            json!({"sessionId":chat,"processIds":[process["processId"]]}),
        )
        .await;
    assert_eq!(stopped["result"]["stopped"], json!([process["processId"]]));
    assert!(client.get(&url).send().await.is_err());
    let again = owner.request("session/prompt", json!({"sessionId":chat,"prompt":[{"type":"text","text":"Check whether the default command can listen after the approved process stopped."}]})).await;
    assert!(again.get("error").is_none(), "{again}");
    endpoint.request().await;
    let confined = last_tool(&endpoint.request().await);
    assert_eq!(confined["status"], "failed", "{confined}");
    assert!(confined["content"].to_string().contains("PermissionError"));
    owner.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn each_retry_needs_a_fresh_decision() {
    let fixture = fixture();
    let target = fixture.primary.join("receipt");
    let command = request(
        "printf x >> receipt",
        "Append the requested receipt into the project.",
    );
    let mut endpoint = Endpoint::start(vec![
        call("exec_command", command.clone()),
        Reply::Finished(r#"{"outcome":"allow"}"#),
        call("exec_command", command),
        Reply::Finished(r#"{"outcome":"deny"}"#),
        Reply::Finished("One receipt was recorded."),
    ])
    .await;
    fixture.run_with_cwd(&endpoint.url, None, 0).await;
    for _ in 0..4 {
        endpoint.request().await;
    }
    let declined = last_tool(&endpoint.request().await);
    assert!(
        declined["content"]
            .to_string()
            .contains("permission_declined"),
        "{declined}"
    );
    assert_eq!(fs::read(target).unwrap(), b"x");
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native sandbox helper"]
async fn replacing_the_workdir_invalidates_the_pending_approval() {
    let fixture = fixture();
    let mut policy: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    policy["allowApproveForMe"] = json!(false);
    policy["initialPermissionMode"] = json!("restricted");
    fs::write(&fixture.profile, serde_json::to_vec(&policy).unwrap()).unwrap();
    let cwd = fixture.primary.join("preview");
    fs::create_dir(&cwd).unwrap();
    let mut command = request(
        "printf x > receipt",
        "Write the requested receipt inside this directory.",
    );
    command["workdir"] = json!(cwd);
    let mut endpoint = Endpoint::start(vec![
        call("exec_command", command),
        Reply::Finished("The directory changed."),
    ])
    .await;
    let output = fixture.run_with_cwd(&endpoint.url, None, 6).await;
    let chat = output[0]["session_id"].as_str().unwrap();
    let turn = output[0]["turn_id"].as_str().unwrap();
    let approval = &output[1]["approvals"][0];
    assert_eq!(approval["request"]["effect"]["cwd"], json!(cwd));
    endpoint.request().await;

    let original = fixture.primary.join("original");
    fs::rename(&cwd, &original).unwrap();
    fs::create_dir(&cwd).unwrap();
    let wait = approval["waitId"].as_str().unwrap();
    let mut owner = approve(&fixture, &endpoint.url, chat, turn, wait).await;
    let result = last_tool(&endpoint.request().await);
    assert_eq!(result["status"], "failed", "{result}");
    assert!(
        result.to_string().contains("permission_action_changed"),
        "{result}"
    );
    assert!(!original.join("receipt").exists());
    assert!(!cwd.join("receipt").exists());
    settle(&mut owner, chat).await;
    owner.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn final_response_settles_after_an_already_running_destination_review() {
    const FINAL: &str = "I have finished the foreground work.";
    let fixture = fixture();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowCommandNetwork"] = json!(true);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let (decide, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        call(
            "exec_command",
            json!({
                "cmd":"/usr/bin/curl -fsS --max-time 20 https://example.invalid/",
                "access":"read", "yield_time_ms": 2000,
            }),
        ),
        Reply::Release(
            r#"{"outcome":"deny","risk_level":"high","rationale":"Outside the requested scope."}"#,
            held,
        ),
        Reply::Finished(FINAL),
    ])
    .await;
    let child = fixture
        .process(&endpoint.url, "run")
        .args([
            "--prompt",
            "Keep this workspace offline. Check that this request is refused.",
            "--cwd",
        ])
        .arg(&fixture.primary)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    endpoint.request().await;
    let review = endpoint.request().await;
    assert!(
        current_review_message(&review)["content"]
            .as_str()
            .unwrap()
            .contains("example.invalid"),
        "{review}"
    );
    let foreground = endpoint.request().await;
    assert!(
        last_tool(&foreground)
            .to_string()
            .contains("Process running with"),
        "{foreground}"
    );

    // Wait for the actual foreground answer at the end of the transcript, while
    // the provider continues holding the private review. The model never polls.
    let db = wait_for_published_answer(&fixture, FINAL).await;
    decide.send(()).unwrap();
    let output = timeout(WAIT, child.wait_with_output())
        .await
        .unwrap()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let events = records(&output.stdout);
    assert_eq!(events[1]["disposition"], "succeeded", "{events:?}");
    assert_eq!(events[1]["account"]["text"], FINAL);
    assert_eq!(events[1]["account"]["unresolved"], json!([]));
    let head: Vec<u8> = db
        .query_row("SELECT head FROM turns", [], |row| row.get(0))
        .unwrap();
    let head: Value = serde_json::from_slice(&head).unwrap();
    let waits = head["waits"].as_object().unwrap();
    assert_eq!(waits.len(), 1);
    let wait = waits.values().next().unwrap();
    assert_eq!(wait["request"]["schema"], "grida.agent.network-review");
    assert!(!wait["answer"].is_null(), "{wait}");
    assert!(!wait["withdrawn"].as_bool().unwrap());
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

async fn wait_for_published_answer(fixture: &Fixture, text: &str) -> rusqlite::Connection {
    let db = rusqlite::Connection::open_with_flags(
        fixture.state.join("agent.sqlite"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    timeout(WAIT, async {
        loop {
            let published: bool = db
                .query_row(
                    "SELECT EXISTS(
                SELECT 1 FROM turn_parts h JOIN turn_messages m
                  ON m.session=h.session AND json_extract(h.body,'$.value')=lower(hex(m.digest))
                WHERE h.key LIKE 'h/%' AND instr(CAST(m.body AS TEXT),?1)>0)",
                    [text],
                    |row| row.get(0),
                )
                .unwrap();
            if published {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    db
}

#[tokio::test]
#[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
async fn a_destination_handed_to_a_person_remains_answerable_after_foreground_final() {
    const FINAL: &str = "The connection is still running.";
    let fixture = fixture();
    let mut policy: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    policy["allowCommandNetwork"] = json!(true);
    fs::write(&fixture.profile, serde_json::to_vec(&policy).unwrap()).unwrap();
    let (release, held) = tokio::sync::oneshot::channel();
    let body = r#"{"error":{"code":"context_length_exceeded","message":"This request exceeds the fixture context window."}}"#;
    let refusal = format!(
        "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    // The reserved domain yields an upstream 502 after approval. A rejected
    // connection gets 403 from the broker and cannot write the receipt.
    let mut endpoint = Endpoint::start(vec![
        call("exec_command", json!({
            "cmd": "/usr/bin/curl -fsS --max-time 24 https://example.invalid/ 2>&1 | /usr/bin/grep -q 502 && printf approved > receipt",
            "access": "read_write", "yield_time_ms": 1500
        })),
        Reply::After(held, Box::new(Reply::RawHttp(refusal))),
        Reply::Finished(FINAL),
    ]).await;
    let mut client = Stdio::start(&fixture, &endpoint.url);
    client.request("initialize", initialize()).await;
    let opened = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = &opened["result"]["sessionId"];
    let turn = client
        .request(
            "_co.grida/session/submit",
            crate::lifecycle::prompt_request(
                session.as_str().unwrap(),
                "try-registry",
                "Check the requested registry.",
            ),
        )
        .await["result"]["turnId"]
        .clone();
    endpoint.request().await;
    let review = endpoint.request().await;
    assert!(
        current_review_message(&review)["content"]
            .as_str()
            .unwrap()
            .contains("example.invalid")
    );
    let running = endpoint.request().await;
    assert!(
        last_tool(&running)
            .to_string()
            .contains("Process running with")
    );
    wait_for_published_answer(&fixture, FINAL).await;
    release.send(()).unwrap();

    let (snapshot, approvals) = timeout(WAIT, async {
        loop {
            let observed = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            let list = client
                .request(
                    "_co.grida/session/approvals",
                    json!({"sessionId":session,"turnId":turn}),
                )
                .await;
            let current = &observed["result"]["current"];
            let pending = &list["result"]["approvals"][0];
            if pending["waitId"]
                .as_str()
                .is_some_and(|id| id.starts_with("approval/network/human/"))
                && current["controlRevision"] == list["result"]["controlRevision"]
            {
                break (observed, list);
            }
            assert!(
                current.is_object(),
                "turn settled before the human could answer: {observed}"
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        snapshot["result"]["current"]["inputNeeded"], true,
        "{snapshot}"
    );
    let pending = &approvals["result"]["approvals"][0];
    assert_ne!(pending["reviewing"], true);
    let answer = client.request("_co.grida/session/answer-approval", json!({
        "sessionId":session,"turnId":turn,"waitId":pending["waitId"],"requestId":"approve-peer",
        "decision":"approve_once","expectedSessionRevision":snapshot["result"]["sessionRevision"],
        "expectedControlRevision":approvals["result"]["controlRevision"]
    })).await;
    assert!(answer.get("result").is_some(), "{answer}");
    let receipt = fixture.primary.join("receipt");
    timeout(WAIT, async {
        while !fs::read(&receipt).is_ok_and(|content| content == b"approved") {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("the original process must receive this user's approval");
    settle(&mut client, session.as_str().unwrap()).await;
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}
