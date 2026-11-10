use super::*;

fn run(state: &Path, workspace: &Path, endpoint: &str, prompt: &str) -> Command {
    let mut command = executable();
    command.args(["run", "--provider", "responses"]);
    configured(&mut command, state, endpoint);
    command
        .arg("--cwd")
        .arg(workspace)
        .args(["--prompt", prompt]);
    command
}

fn input_limit(state: &Path, tokens: u64) {
    std::fs::create_dir_all(state).unwrap();
    let path = state.join("config.toml");
    std::fs::write(
        &path,
        format!("schema_version = 1\n[context]\nmax_input_tokens = {tokens}\n"),
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(state, std::fs::Permissions::from_mode(0o700)).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
}

#[tokio::test]
async fn verified_responses_admission_rejection_retries_once_after_the_advised_delay() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::RateLimited {
                code: "rate_limit_exceeded",
                retry_after: &["1"],
            },
            Reply::Finished("Recovered reply."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let child = tokio::spawn({
        let mut command = run(
            &state,
            workspace.path(),
            &endpoint.url,
            "Retry only on rejection.",
        );
        async move { timeout(WAIT, command.output()).await.unwrap().unwrap() }
    });
    let first = endpoint.request().await;
    let first_seen = tokio::time::Instant::now();
    assert_eq!(endpoint.request().await, first);
    assert!(first_seen.elapsed() >= Duration::from_millis(950));
    let output = child.await.unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result = records(&output.stdout);
    assert_eq!(result[1]["account"]["text"], "Recovered reply.");
    assert_eq!(result[1]["account"]["steps"], 2);
    assert_eq!(
        result[1]["account"]["inference_usage"]["unreported_attempts"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    endpoint.done().await;
}

#[tokio::test]
async fn responses_rate_limit_budget_stops_after_the_second_rejection() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::RateLimited {
                code: "rate_limit_exceeded",
                retry_after: &["0"],
            },
            Reply::RateLimited {
                code: "rate_limit_exceeded",
                retry_after: &["0"],
            },
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let output = timeout(
        WAIT,
        run(
            &state,
            workspace.path(),
            &endpoint.url,
            "Repeated rate limit.",
        )
        .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(output.status.code(), Some(1));
    let result = records(&output.stdout);
    let account = &result[1]["account"];
    assert_eq!(account["steps"], 2);
    assert_eq!(account["inference_failure"]["kind"], "rate_limit");
    assert_eq!(
        account["inference_failure"]["dispatch"],
        "rejected_before_execution"
    );
    assert_eq!(endpoint.request().await, endpoint.request().await);
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[tokio::test]
async fn responses_leaves_quota_or_unusable_retry_advice_for_the_client() {
    for (code, advice, kind) in [
        ("insufficient_quota", &["0"][..], "quota"),
        ("rate_limit_exceeded", &["6"][..], "rate_limit"),
        (
            "rate_limit_exceeded",
            &["Sun, 06 Nov 2094 08:49:37 GMT"][..],
            "rate_limit",
        ),
        ("rate_limit_exceeded", &[][..], "rate_limit"),
        ("rate_limit_exceeded", &["0", "60"][..], "rate_limit"),
    ] {
        let directory = TempDir::new().unwrap();
        let state = directory.path().join("state");
        let workspace = TempDir::new().unwrap();
        let mut endpoint = Endpoint::start_protocol(
            ProviderProtocol::Responses,
            vec![Reply::RateLimited {
                code,
                retry_after: advice,
            }],
            Some(TEST_CREDENTIAL),
        )
        .await;
        let output = timeout(
            WAIT,
            run(
                &state,
                workspace.path(),
                &endpoint.url,
                "Respect the provider's decision.",
            )
            .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(output.status.code(), Some(1));
        let result = records(&output.stdout);
        assert_eq!(result[1]["account"]["steps"], 1);
        assert_eq!(result[1]["account"]["inference_failure"]["kind"], kind);
        endpoint.request().await;
        assert!(endpoint.requests.try_recv().is_err());
        endpoint.done().await;
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn private_client_sees_the_retry_deadline_and_can_stop_before_dispatch() {
    use super::approvals::Stdio as StdioClient;
    use super::lifecycle::{prompt_request, task_basis};

    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::RateLimited {
            code: "rate_limit_exceeded",
            retry_after: &["5"],
        }],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut command = executable();
    command.args(["serve", "--stdio", "--provider", "responses"]);
    configured(&mut command, &state, &endpoint.url);
    let mut client = StdioClient::from_child(
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let ready = client.request("initialize", extension_initialize()).await;
    assert_eq!(ready["result"]["protocolVersion"], 1);
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let accepted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(session, "wait", "Wait for the limit."),
        )
        .await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    endpoint.request().await;
    let waiting = timeout(Duration::from_secs(3), async {
        loop {
            let response = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            assert!(response["result"].is_object(), "{response}");
            if response["result"]["retryNotBeforeMs"].is_u64() {
                break response["result"].clone();
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("a waiting retry is observable");
    assert_eq!(waiting["current"]["turnId"], turn);
    let stopped = client
        .request(
            "_co.grida/session/stop",
            task_basis(&waiting, session, "stop-backoff"),
        )
        .await;
    assert!(stopped["result"].is_object(), "{stopped}");
    timeout(Duration::from_secs(3), async {
        loop {
            let response = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            assert!(response["result"].is_object(), "{response}");
            if response["result"]["current"].is_null() {
                assert_eq!(response["result"]["latest"]["status"], "cancelled");
                assert!(response["result"].get("retryNotBeforeMs").is_none());
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("Stop settles without waiting for the retry time");
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn complete_input_is_counted_before_native_responses_generation() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    input_limit(&state, 64);
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::InputCount(32), Reply::Finished("Counted reply.")],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let output = timeout(
        WAIT,
        run(&state, workspace.path(), &endpoint.url, "Count this input").output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result = records(&output.stdout);
    assert_eq!(result[1]["account"]["text"], "Counted reply.");
    let count = endpoint.request().await;
    let mut generation = endpoint.request().await;
    assert_eq!(count["input"][0]["content"], "Count this input");
    assert_eq!(count["model"], "fixture-model");
    assert_eq!(generation["stream"], true);
    assert_eq!(generation["store"], false);
    assert_eq!(generation["max_output_tokens"], 4096);
    for field in ["stream", "store", "max_output_tokens", "include"] {
        generation.as_object_mut().unwrap().remove(field);
        assert!(count.get(field).is_none());
    }
    assert_eq!(count, generation);
    endpoint.done().await;
}

#[tokio::test]
async fn excessive_responses_input_retains_failure_without_generation() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    input_limit(&state, 16);
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![Reply::InputCount(17)],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let output = timeout(
        WAIT,
        run(&state, workspace.path(), &endpoint.url, "Too much input").output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(output.status.code(), Some(1));
    let result = records(&output.stdout);
    assert_eq!(result[1]["account"]["failure"]["code"], "input_token_limit");
    assert_eq!(
        result[1]["account"]["inference_failure"]["kind"],
        "context_limit"
    );
    for field in ["observations", "unreported_attempts"] {
        assert!(
            result[1]["account"]["inference_usage"][field]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
    endpoint.request().await;
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tokio::test]
async fn responses_history_and_encrypted_reasoning_survive_native_restart() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::ResponsesSigned("First reply."),
            Reply::Finished("Continued reply."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let first = timeout(
        WAIT,
        run(&state, workspace.path(), &endpoint.url, "First input").output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    assert!(!String::from_utf8_lossy(&first.stdout).contains("retained-private-reasoning"));
    let result = records(&first.stdout);
    let session = result[0]["session_id"].as_str().unwrap();
    let mut continuation = run(&state, workspace.path(), &endpoint.url, "Second input");
    continuation.args(["--session", session]);
    let second = timeout(WAIT, continuation.output()).await.unwrap().unwrap();
    assert!(
        second.status.success(),
        "{}",
        String::from_utf8_lossy(&second.stderr)
    );
    assert_eq!(
        records(&second.stdout)[1]["account"]["text"],
        "Continued reply."
    );
    endpoint.request().await;
    let continuation = endpoint.request().await;
    assert_eq!(continuation["store"], false);
    assert!(continuation.get("previous_response_id").is_none());
    let items = continuation["input"].as_array().unwrap();
    assert!(
        items
            .iter()
            .any(|item| item["encrypted_content"] == "retained-private-reasoning")
    );
    assert!(
        items
            .iter()
            .any(|item| item["role"] == "user" && item["content"] == "Second input")
    );
    endpoint.done().await;
}
