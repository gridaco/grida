//! Control and inference boundaries of passive waits through the built host.

use super::approvals::Stdio as Client;
use super::lifecycle::{prompt_request, task_basis};
use super::*;

const LIVE: &str = "co.grida/session/updates";

async fn connect(state: &Path, endpoint: &str, subagents: bool) -> Client {
    let mut child = executable();
    child
        .args(["serve", "--stdio", "--state-dir"])
        .arg(state)
        .args([
            "--endpoint",
            endpoint,
            "--model",
            "fixture-model",
            "--credential-env",
            "GRIDA_AGENT_PROCESS_TEST_KEY",
        ])
        .env("GRIDA_AGENT_PROCESS_TEST_KEY", TEST_CREDENTIAL)
        .env("GRIDA_HOME", fixture_config_home(state))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if subagents {
        child.arg("--subagents");
    }
    let mut client = Client::from_child(child.spawn().unwrap());
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"][LIVE] = 1.into();
    let ready = call(&mut client, "initialize", initialize).await;
    assert_eq!(ready["agentCapabilities"]["_meta"][LIVE], 1);
    client
}

pub(super) async fn call(client: &mut Client, method: &str, params: Value) -> Value {
    let response = client.request(method, params).await;
    assert!(response.get("result").is_some(), "{method}: {response}");
    response["result"].clone()
}

async fn session(client: &mut Client, cwd: &Path) -> String {
    call(client, "session/new", json!({"cwd":cwd,"mcpServers":[]})).await["sessionId"]
        .as_str()
        .unwrap()
        .to_owned()
}

pub(super) async fn tool_started(client: &mut Client, name: &str) {
    timeout(WAIT, async {
        loop {
            let frame = client.read_frame().await;
            if frame["params"]["update"]["title"] == name
                && frame["params"]["_meta"][LIVE]["outcome"] == "running"
            {
                break;
            }
        }
    })
    .await
    .unwrap();
}

pub(super) async fn quiet_for(endpoint: &mut Endpoint, duration: Duration) {
    assert!(
        timeout(duration, endpoint.requests.recv()).await.is_err(),
        "inference while the host should be waiting",
    );
}

pub(super) async fn snapshot(client: &mut Client, session: &str) -> Value {
    call(
        client,
        "_co.grida/session/snapshot",
        json!({"sessionId":session}),
    )
    .await
}

pub(super) async fn steer(client: &mut Client, session: &str, text: &str) -> Value {
    let basis = snapshot(client, session).await;
    call(
        client,
        "_co.grida/session/steer",
        json!({
            "task":task_basis(&basis,session,"steering-input"),
            "expectedHistoryPosition":basis["current"]["historyPosition"],
            "prompt":[{"type":"text","text":text}],
        }),
    )
    .await
}

pub(super) fn results(request: &Value) -> impl Iterator<Item = Value> + '_ {
    request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|message| message["role"] == "tool")
        .map(|message| serde_json::from_str(message["content"].as_str().unwrap()).unwrap())
}

#[tokio::test]
async fn clock_wait_resumes_once_for_active_input_and_leaves_ordinary_input_queued() {
    for pending_at_start in [false, true] {
        let root = TempDir::new().unwrap();
        let cwd = TempDir::new().unwrap();
        let (start_sleep, held) = tokio::sync::oneshot::channel();
        let mut replies = vec![
            Reply::After(
                held,
                Box::new(Reply::Tool("clock_sleep", r#"{"duration_ms":60000}"#)),
            ),
            Reply::Tool("clock_curr_time", "{}"),
            Reply::Finished("This is the updated reply."),
        ];
        if !pending_at_start {
            replies.push(Reply::Finished("This is the queued reply."));
        }
        let mut endpoint = Endpoint::start(replies).await;
        let mut client = connect(&root.path().join("state"), &endpoint.url, false).await;
        let session = session(&mut client, cwd.path()).await;
        let first = call(
            &mut client,
            "_co.grida/session/submit",
            prompt_request(&session, "first", "Wait a minute."),
        )
        .await;
        let request = endpoint.request().await;
        assert!(request["tools"].to_string().contains("clock_sleep"));
        if pending_at_start {
            assert_eq!(
                steer(&mut client, &session, "Use the updated direction.").await["turnId"],
                first["turnId"]
            );
            start_sleep.send(()).unwrap();
        } else {
            start_sleep.send(()).unwrap();
            tool_started(&mut client, "clock_sleep").await;
            let queued = call(
                &mut client,
                "_co.grida/session/enqueue",
                prompt_request(&session, "later", "A separate queued request."),
            )
            .await;
            assert_eq!(queued["disposition"], "queued");
            quiet_for(&mut endpoint, Duration::from_millis(120)).await;
            assert_eq!(
                steer(&mut client, &session, "Use the updated direction.").await["turnId"],
                first["turnId"]
            );
        }
        let continuation = endpoint.request().await;
        assert_eq!(
            continuation["messages"]
                .to_string()
                .matches("Use the updated direction.")
                .count(),
            1
        );
        assert!(
            !continuation["messages"]
                .to_string()
                .contains("A separate queued request.")
        );
        assert_eq!(
            results(&continuation).last().unwrap()["structured"]["status"],
            "input"
        );
        let request = endpoint.request().await;
        let time = results(&request).last().unwrap()["structured"]["current_time"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(time.ends_with('Z') && time.contains('T'), "{time}");
        if !pending_at_start {
            let later = endpoint.request().await;
            assert!(
                later["messages"]
                    .to_string()
                    .contains("A separate queued request.")
            );
        }
        client.close().await;
        endpoint.done().await;
    }
}

#[tokio::test]
async fn stopping_a_clock_wait_starts_no_inference() {
    let root = TempDir::new().unwrap();
    let cwd = TempDir::new().unwrap();
    let mut endpoint =
        Endpoint::start(vec![Reply::Tool("clock_sleep", r#"{"duration_ms":60000}"#)]).await;
    let mut client = connect(&root.path().join("state"), &endpoint.url, false).await;
    let session = session(&mut client, cwd.path()).await;
    call(
        &mut client,
        "_co.grida/session/submit",
        prompt_request(&session, "first", "Wait."),
    )
    .await;
    endpoint.request().await;
    tool_started(&mut client, "clock_sleep").await;
    let basis = snapshot(&mut client, &session).await;
    call(
        &mut client,
        "_co.grida/session/stop",
        task_basis(&basis, &session, "stop-the-wait"),
    )
    .await;
    timeout(WAIT, async {
        while snapshot(&mut client, &session).await["current"].is_object() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn reopening_a_clock_wait_is_observational_and_resume_does_not_repeat_the_timer() {
    let root = TempDir::new().unwrap();
    let cwd = TempDir::new().unwrap();
    let state = root.path().join("state");
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("clock_sleep", r#"{"duration_ms":60000}"#),
        Reply::Finished("The wait was interrupted."),
    ])
    .await;
    let mut client = connect(&state, &endpoint.url, false).await;
    let session = session(&mut client, cwd.path()).await;
    call(
        &mut client,
        "_co.grida/session/submit",
        prompt_request(&session, "first", "Wait."),
    )
    .await;
    endpoint.request().await;
    tool_started(&mut client, "clock_sleep").await;
    let running = snapshot(&mut client, &session).await;
    call(
        &mut client,
        "_co.grida/session/pause",
        task_basis(&running, &session, "pause-wait"),
    )
    .await;
    timeout(WAIT, async {
        while snapshot(&mut client, &session).await["current"]["disposition"] != "suspended" {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    client.close().await;
    let mut client = connect(&state, &endpoint.url, false).await;
    call(
        &mut client,
        "session/load",
        json!({"sessionId":session,"cwd":cwd.path(),"mcpServers":[]}),
    )
    .await;
    quiet_for(&mut endpoint, Duration::from_millis(120)).await;
    let basis = snapshot(&mut client, &session).await;
    call(
        &mut client,
        "_co.grida/session/resume",
        json!({
            "task":task_basis(&basis,&session,"recover-wait"),
            "expectedEpoch":basis["current"]["epoch"],
            "expectedJournalPosition":basis["current"]["journalPosition"],
        }),
    )
    .await;
    let resumed = endpoint.request().await;
    let result = results(&resumed).last().unwrap();
    assert_eq!(result["structured"]["status"], "cancelled", "{result}");
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn worker_wait_times_out_then_steers_without_restarting_the_assignment() {
    let root = TempDir::new().unwrap();
    let cwd = TempDir::new().unwrap();
    let (finish, held) = tokio::sync::oneshot::channel();
    let held = Arc::new(std::sync::Mutex::new(Some(held)));
    let states = (0..6)
        .map(|_| {
            let held = held.clone();
            Reply::Choose(Box::new(move |request| {
                if !request["tools"].to_string().contains("spawn_agent") {
                    return Reply::After(
                        held.lock().unwrap().take().unwrap(),
                        Box::new(Reply::Finished("Worker done.")),
                    );
                }
                let outputs = results(request).collect::<Vec<_>>();
                if outputs.is_empty() {
                    return Reply::Tool(
                        "spawn_agent",
                        r#"{"name":"Worker","instructions":"Do the independent work."}"#,
                    );
                }
                let child = outputs[0]["structured"]["assignment"]["child"].clone();
                let wait = |timeout| {
                    Reply::Tool(
                        "wait_agent",
                        json!({"children":[child],"timeout_ms":timeout})
                            .to_string()
                            .leak(),
                    )
                };
                match outputs.len() {
                    1 => wait(10_500),
                    2 => wait(60_000),
                    3 => wait(60_000),
                    4 => Reply::Finished("Worker results collected."),
                    _ => panic!("unexpected worker wait result: {outputs:?}"),
                }
            }))
        })
        .collect();
    let mut endpoint = Endpoint::start(states).await;
    let mut client = connect(&root.path().join("state"), &endpoint.url, true).await;
    let session = session(&mut client, cwd.path()).await;
    call(
        &mut client,
        "_co.grida/session/submit",
        prompt_request(&session, "first", "Delegate and wait."),
    )
    .await;
    // The child request and the parent's spawn acknowledgement may arrive in either order.
    for _ in 0..3 {
        endpoint.request().await;
    }
    tool_started(&mut client, "wait_agent").await;
    quiet_for(&mut endpoint, Duration::from_millis(120)).await;
    let after_timeout = endpoint.request().await;
    let pending = results(&after_timeout).last().unwrap();
    assert_eq!(pending["structured"]["wait"]["status"], "timeout");
    assert!(
        pending["structured"]["wait"]["elapsed_ms"]
            .as_u64()
            .unwrap()
            >= 10_500
    );
    assert_eq!(
        pending["structured"]["pending"].as_array().unwrap().len(),
        1
    );

    tool_started(&mut client, "wait_agent").await;
    quiet_for(&mut endpoint, Duration::from_millis(120)).await;
    steer(&mut client, &session, "Keep the same assignment.").await;
    let after_steer = timeout(Duration::from_secs(5), endpoint.request())
        .await
        .unwrap();
    let interrupted = results(&after_steer).last().unwrap();
    assert_eq!(interrupted["structured"]["wait"]["status"], "input");
    assert_eq!(
        pending["structured"]["pending"],
        interrupted["structured"]["pending"]
    );

    tool_started(&mut client, "wait_agent").await;
    quiet_for(&mut endpoint, Duration::from_millis(120)).await;
    finish.send(()).unwrap();
    let after_result = timeout(Duration::from_secs(5), endpoint.request())
        .await
        .unwrap();
    let settled = results(&after_result).last().unwrap();
    assert_eq!(settled["structured"]["wait"]["status"], "settled");
    assert_eq!(
        settled["structured"]["collected"][0]["child"],
        pending["structured"]["pending"][0]["child"]
    );
    assert_eq!(
        settled["structured"]["collected"][0]["text"],
        "Worker done."
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn headless_wait_refuses_an_impossible_duration_and_can_retry() {
    let root = TempDir::new().unwrap();
    let cwd = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("clock_sleep", r#"{"duration_ms":60000}"#),
        Reply::Tool("clock_sleep", r#"{"duration_ms":10}"#),
        Reply::Finished("Short wait completed."),
    ])
    .await;
    let mut child = executable();
    child.args(["run", "--deadline-ms", "12000", "--cwd"]);
    child.arg(cwd.path()).args(["--prompt", "Wait briefly."]);
    configured(&mut child, &root.path().join("state"), &endpoint.url);
    let child = child
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    endpoint.request().await;
    let rejected = timeout(Duration::from_secs(5), endpoint.request())
        .await
        .unwrap();
    assert!(
        results(&rejected)
            .last()
            .unwrap()
            .to_string()
            .contains("wait_exceeds_run_deadline")
    );
    let retried = endpoint.request().await;
    assert_eq!(
        results(&retried).last().unwrap()["structured"]["status"],
        "elapsed"
    );
    let outcome = finish_child(child).await;
    assert!(
        outcome.status.success(),
        "{}",
        String::from_utf8_lossy(&outcome.stderr)
    );
    assert_eq!(
        records(&outcome.stdout).last().unwrap()["disposition"],
        "succeeded"
    );
    endpoint.done().await;
}

#[tokio::test]
async fn worker_wait_returns_first_result_with_other_assignments_pending() {
    let root = TempDir::new().unwrap();
    let cwd = TempDir::new().unwrap();
    let (finish_first, first) = tokio::sync::oneshot::channel();
    let (finish_second, second) = tokio::sync::oneshot::channel();
    let first = Arc::new(std::sync::Mutex::new(Some(first)));
    let second = Arc::new(std::sync::Mutex::new(Some(second)));
    let replies = (0..7)
        .map(|_| {
            let first = first.clone();
            let second = second.clone();
            Reply::Choose(Box::new(move |request| {
                if !request["tools"].to_string().contains("spawn_agent") {
                    let (receiver, reply) = if request["messages"]
                        .to_string()
                        .contains("Check marker alpha.")
                    {
                        (&first, "Alpha complete.")
                    } else {
                        (&second, "Beta complete.")
                    };
                    return Reply::After(
                        receiver.lock().unwrap().take().unwrap(),
                        Box::new(Reply::Finished(reply)),
                    );
                }
                let outputs: Vec<_> = results(request).collect();
                let child =
                    |index: usize| outputs[index]["structured"]["assignment"]["child"].clone();
                let wait = |children| {
                    Reply::Tool(
                        "wait_agent",
                        json!({"children":children,"timeout_ms":60000})
                            .to_string()
                            .leak(),
                    )
                };
                match outputs.len() {
                    0 => Reply::Tool(
                        "spawn_agent",
                        r#"{"name":"Alpha","instructions":"Check marker alpha."}"#,
                    ),
                    1 => Reply::Tool(
                        "spawn_agent",
                        r#"{"name":"Beta","instructions":"Check marker beta."}"#,
                    ),
                    2 => wait(vec![child(0), child(1)]),
                    3 => wait(vec![child(1)]),
                    4 => Reply::Finished("Both assignments collected."),
                    _ => panic!("unexpected worker results: {outputs:?}"),
                }
            }))
        })
        .collect();
    let mut endpoint = Endpoint::start(replies).await;
    let mut client = connect(&root.path().join("state"), &endpoint.url, true).await;
    let session = session(&mut client, cwd.path()).await;
    call(
        &mut client,
        "_co.grida/session/submit",
        prompt_request(
            &session,
            "first",
            "Delegate two assignments and wait for both results.",
        ),
    )
    .await;
    for _ in 0..5 {
        endpoint.request().await;
    }
    tool_started(&mut client, "wait_agent").await;
    quiet_for(&mut endpoint, Duration::from_millis(120)).await;
    finish_first.send(()).unwrap();

    let partial = timeout(Duration::from_secs(5), endpoint.request())
        .await
        .unwrap();
    let assignments: Vec<_> = results(&partial)
        .take(2)
        .map(|result| result["structured"]["assignment"].clone())
        .collect();
    let partial = results(&partial).last().unwrap()["structured"].clone();
    assert_eq!(partial["wait"]["status"], "settled");
    assert_eq!(partial["collected"].as_array().unwrap().len(), 1);
    assert_eq!(partial["pending"].as_array().unwrap().len(), 1);
    for field in ["child", "input", "turn"] {
        assert_eq!(partial["collected"][0][field], assignments[0][field]);
        assert_eq!(partial["pending"][0][field], assignments[1][field]);
    }
    assert_eq!(partial["collected"][0]["text"], "Alpha complete.");
    assert_eq!(partial["pending"][0]["status"], "running");

    tool_started(&mut client, "wait_agent").await;
    quiet_for(&mut endpoint, Duration::from_millis(120)).await;
    finish_second.send(()).unwrap();
    let final_request = timeout(Duration::from_secs(5), endpoint.request())
        .await
        .unwrap();
    let final_result = results(&final_request).last().unwrap()["structured"].clone();
    assert_eq!(
        final_result["collected"][0]["child"],
        assignments[1]["child"]
    );
    assert_eq!(final_result["collected"][0]["text"], "Beta complete.");
    assert_eq!(final_result["pending"], json!([]));
    client.close().await;
    endpoint.done().await;
}
