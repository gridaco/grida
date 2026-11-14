// GRIDA-SEC-004 — separate trusted native listeners and raw command scopes.
use super::super::lifecycle::{prompt_request, wait_for_snapshot};
use super::*;
use tokio_tungstenite::tungstenite::{Error as SocketError, http::StatusCode};

const OTHER_SERVER_TOKEN: &str = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const OTHER_CREDENTIAL: &str = "separate-synthetic-provider-credential";

fn launch(fixture: &Fixture, endpoint: &str, token: &str, credential: &str) -> Command {
    let mut command = fixture.process(endpoint, "serve");
    command
        .args([
            "--listen",
            "ws://127.0.0.1:0/acp",
            "--server-token-env",
            "GRIDA_AGENT_FIXTURE_SERVER_TOKEN",
        ])
        .env("GRIDA_AGENT_FIXTURE_SERVER_TOKEN", token)
        .env("GRIDA_AGENT_PROCESS_TEST_KEY", credential);
    command
}

async fn connect(url: &str, token: &str, workspace: &Path) -> (SharedSocket, String) {
    let mut socket = connect_shared(url, Some(token), None, None).await.unwrap();
    let initialized = ws_rpc(&mut socket, 1, "initialize", extension_initialize()).await;
    assert_eq!(initialized["result"]["protocolVersion"], 1);
    let created = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace,"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"]
        .as_str()
        .unwrap_or_else(|| panic!("session creation failed: {created}"))
        .to_owned();
    (socket, session)
}

async fn submit(socket: &mut SharedSocket, session: &str, text: &str) {
    let accepted = ws_rpc(
        socket,
        4,
        "_co.grida/session/submit",
        prompt_request(session, "request", text),
    )
    .await;
    assert_eq!(accepted["result"]["disposition"], "claimed", "{accepted}");
}

async fn settled(socket: &mut SharedSocket, session: &str) {
    let snapshot =
        wait_for_snapshot(socket, session, |snapshot| snapshot["current"].is_null()).await;
    assert_eq!(snapshot["latest"]["status"], "succeeded", "{snapshot}");
}

#[tokio::test]
async fn simultaneous_listeners_keep_state_and_provider_authority_separate() {
    let left = Fixture::new(false);
    let right = Fixture::new(false);
    let (release_left, left_reply) = tokio::sync::oneshot::channel();
    let (release_right, right_reply) = tokio::sync::oneshot::channel();
    let mut left_provider = Endpoint::start(vec![Reply::Release("Left reply.", left_reply)]).await;
    let mut right_provider = Endpoint::start_with_credential(
        vec![Reply::Release("Right reply.", right_reply)],
        Some(OTHER_CREDENTIAL),
    )
    .await;
    let ((left_host, left_url), (right_host, right_url)) = tokio::join!(
        spawn_shared_server(launch(
            &left,
            &left_provider.url,
            SERVER_TOKEN,
            TEST_CREDENTIAL
        )),
        spawn_shared_server(launch(
            &right,
            &right_provider.url,
            OTHER_SERVER_TOKEN,
            OTHER_CREDENTIAL
        )),
    );
    for (url, wrong_token) in [(&left_url, OTHER_SERVER_TOKEN), (&right_url, SERVER_TOKEN)] {
        let rejected = connect_shared(url, Some(wrong_token), None, None).await;
        assert!(matches!(rejected, Err(SocketError::Http(response))
            if response.status() == StatusCode::UNAUTHORIZED));
    }
    let duplicate = timeout(
        WAIT,
        launch(
            &left,
            &right_provider.url,
            OTHER_SERVER_TOKEN,
            OTHER_CREDENTIAL,
        )
        .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(!duplicate.status.success());
    assert_eq!(
        String::from_utf8_lossy(&duplicate.stderr).trim(),
        "grida-agent: store_already_owned"
    );

    let ((mut left_client, left_session), (mut right_client, right_session)) = tokio::join!(
        connect(&left_url, SERVER_TOKEN, &left.primary),
        connect(&right_url, OTHER_SERVER_TOKEN, &right.primary),
    );
    for (socket, session, cwd) in [
        (&mut left_client, &right_session, &right.primary),
        (&mut right_client, &left_session, &left.primary),
    ] {
        let rejected = ws_rpc(
            socket,
            3,
            "session/load",
            json!({"sessionId":session,"cwd":cwd,"mcpServers":[]}),
        )
        .await;
        assert!(
            rejected["error"].to_string().contains("session_missing"),
            "{rejected}"
        );
    }
    tokio::join!(
        submit(&mut left_client, &left_session, "Left input"),
        submit(&mut right_client, &right_session, "Right input"),
    );
    let (left_request, right_request) =
        tokio::join!(left_provider.request(), right_provider.request());
    assert_eq!(
        left_request["messages"].as_array().unwrap().last().unwrap()["content"],
        "Left input"
    );
    assert_eq!(
        right_request["messages"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()["content"],
        "Right input"
    );
    release_left.send(()).unwrap();
    release_right.send(()).unwrap();
    tokio::join!(
        settled(&mut left_client, &left_session),
        settled(&mut right_client, &right_session)
    );
    drop((left_client, right_client));
    tokio::join!(
        terminate_shared_server(left_host),
        terminate_shared_server(right_host)
    );
    tokio::join!(left_provider.done(), right_provider.done());
}

fn command_reply(owner: &Fixture, other: &Fixture, text: &str, port: u16) -> Reply {
    fs::write(owner.extra.join("selected.txt"), text).unwrap();
    let mut profile: Value = serde_json::from_slice(&fs::read(&owner.profile).unwrap()).unwrap();
    profile["directories"][1]["commandReadWrite"] = json!("allow");
    fs::write(&owner.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    // The default shell is /bin/sh; bash provides /dev/tcp for the probe.
    let script = format!(
        r#"exec /bin/bash -c '
            test "$(/bin/cat selected.txt)" = "{text}" || exit 71
            test -z "${{GRIDA_AGENT_PROCESS_TEST_KEY+x}}${{GRIDA_AGENT_FIXTURE_SERVER_TOKEN+x}}" || exit 72
            if (: < "{other}/selected.txt") 2>/dev/null; then exit 73; fi
            if (printf denied > "{other}/foreign-write") 2>/dev/null; then exit 74; fi
            if (: > "/dev/tcp/127.0.0.1/{port}") 2>/dev/null; then exit 75; fi
            printf "%s" "{text}" > effect || exit 76
            while [ ! -f release ]; do /bin/sleep 0.04; done
            printf "%s" "{text}"
        '"#,
        other = other.extra.display(),
    );
    let arguments = json!({
        "directory":"extra","access":"read_write","cmd":script,"yield_time_ms":30000,
    });
    Reply::Tool(
        "exec_command",
        Box::leak(arguments.to_string().into_boxed_str()),
    )
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and working Seatbelt or bubblewrap"]
async fn simultaneous_listener_commands_keep_distinct_files_and_deny_raw_network() {
    let left = Fixture::new(true);
    let right = Fixture::new(true);
    let probe = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = probe.local_addr().unwrap().port();
    let mut left_provider = Endpoint::start(vec![
        command_reply(&left, &right, "left scope", port),
        Reply::Finished("Left complete."),
    ])
    .await;
    let mut right_provider = Endpoint::start_with_credential(
        vec![
            command_reply(&right, &left, "right scope", port),
            Reply::Finished("Right complete."),
        ],
        Some(OTHER_CREDENTIAL),
    )
    .await;
    let ((left_host, left_url), (right_host, right_url)) = tokio::join!(
        spawn_shared_server(launch(
            &left,
            &left_provider.url,
            SERVER_TOKEN,
            TEST_CREDENTIAL
        )),
        spawn_shared_server(launch(
            &right,
            &right_provider.url,
            OTHER_SERVER_TOKEN,
            OTHER_CREDENTIAL
        )),
    );
    let ((mut left_client, left_session), (mut right_client, right_session)) = tokio::join!(
        connect(&left_url, SERVER_TOKEN, &left.primary),
        connect(&right_url, OTHER_SERVER_TOKEN, &right.primary),
    );
    tokio::join!(
        submit(&mut left_client, &left_session, "Left command"),
        submit(&mut right_client, &right_session, "Right command")
    );
    tokio::join!(left_provider.request(), right_provider.request());
    timeout(WAIT, async {
        while fs::read_to_string(left.extra.join("effect"))
            .ok()
            .as_deref()
            != Some("left scope")
            || fs::read_to_string(right.extra.join("effect"))
                .ok()
                .as_deref()
                != Some("right scope")
        {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("both independently scoped commands must reach the barrier");
    for workspace in [&left.extra, &right.extra] {
        assert!(!workspace.join("foreign-write").exists());
        fs::write(workspace.join("release"), "release").unwrap();
    }
    let (left_request, right_request) =
        tokio::join!(left_provider.request(), right_provider.request());
    for (request, text) in [(left_request, "left scope"), (right_request, "right scope")] {
        let tool = request["messages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["role"] == "tool")
            .unwrap();
        let outcome: Value = serde_json::from_str(tool["content"].as_str().unwrap()).unwrap();
        assert_eq!(outcome["status"], "succeeded", "{outcome}");
        assert_eq!(outcome["structured"]["cleanup_verified"], true, "{outcome}");
        assert!(outcome["content"].to_string().contains(text), "{outcome}");
    }
    tokio::join!(
        settled(&mut left_client, &left_session),
        settled(&mut right_client, &right_session)
    );
    drop((left_client, right_client));
    tokio::join!(
        terminate_shared_server(left_host),
        terminate_shared_server(right_host)
    );
    tokio::join!(left_provider.done(), right_provider.done());
}
