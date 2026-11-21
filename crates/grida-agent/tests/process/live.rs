//! Built-process proof of detached live text and durable final replacement.

use super::*;
use tokio::process::{ChildStdin, ChildStdout};

const LIVE: &str = "co.grida/session/updates";

struct Observer {
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    next: u64,
    updates: Vec<Value>,
}

impl Observer {
    async fn request(&mut self, method: &str, params: Value) -> Value {
        self.next += 1;
        let id = self.next;
        let request = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        self.input
            .write_all(format!("{request}\n").as_bytes())
            .await
            .unwrap();
        loop {
            let frame = self.frame().await;
            if frame["id"] == id {
                assert!(frame.get("error").is_none(), "{frame}");
                return frame["result"].clone();
            }
            self.updates.push(frame);
        }
    }

    async fn frame(&mut self) -> Value {
        let mut line = String::new();
        assert_ne!(
            timeout(WAIT, self.output.read_line(&mut line))
                .await
                .unwrap()
                .unwrap(),
            0
        );
        serde_json::from_str(&line).unwrap()
    }

    async fn observed(&mut self, session: &str, replace: bool) -> Value {
        loop {
            if let Some(index) = self.updates.iter().position(|frame| {
                frame["method"] == "session/update"
                    && frame["params"]["sessionId"] == session
                    && frame["params"]["_meta"][LIVE]["replace"] == replace
            }) {
                return self.updates.remove(index);
            }
            let frame = self.frame().await;
            self.updates.push(frame);
        }
    }
}

#[tokio::test]
async fn identified_submission_streams_visible_text_and_keeps_durable_ownership() {
    let temp = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Completed draft."),
        Reply::Hold("Still working."),
    ])
    .await;
    let mut command = executable();
    command.args(["serve", "--stdio"]);
    configured(&mut command, &state, &endpoint.url);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut observer = Observer {
        input: child.stdin.take().unwrap(),
        output: BufReader::new(child.stdout.take().unwrap()),
        next: 0,
        updates: vec![],
    };
    let mut capabilities = extension_initialize();
    capabilities["clientCapabilities"]["_meta"][LIVE] = 1.into();
    let ready = observer.request("initialize", capabilities).await;
    assert_eq!(ready["agentCapabilities"]["_meta"][LIVE], 1);
    let session = observer
        .request(
            "session/new",
            json!({
                "cwd":workspace.path(),"mcpServers":[]
            }),
        )
        .await["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();
    let first = observer.request("_co.grida/session/submit", json!({
        "sessionId":session,"inputId":"first-live-input","prompt":[{"type":"text","text":"First"}]
    })).await;
    endpoint.request().await;
    let draft = observer.observed(&session, false).await;
    let finalized = observer.observed(&session, true).await;
    for update in [&draft, &finalized] {
        assert_eq!(update["params"]["_meta"][LIVE]["turnId"], first["turnId"]);
        assert_eq!(update["params"]["_meta"][LIVE]["offsetBytes"], 0);
        assert_eq!(
            update["params"]["update"]["content"]["text"],
            "Completed draft."
        );
    }
    assert_eq!(
        draft["params"]["update"]["messageId"],
        finalized["params"]["update"]["messageId"]
    );
    timeout(WAIT, async {
        loop {
            let snapshot = observer
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            if snapshot["latest"]["turnId"] == first["turnId"] {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();

    let second = observer.request("_co.grida/session/enqueue", json!({
        "sessionId":session,"inputId":"held-live-input","prompt":[{"type":"text","text":"Continue"}]
    })).await;
    assert_eq!(second["inputId"], "held-live-input");
    endpoint.request().await;
    let held = observer.observed(&session, false).await;
    assert_eq!(
        held["params"]["update"]["content"]["text"],
        "Still working."
    );
    let current = observer
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert_eq!(
        current["current"]["turnId"],
        held["params"]["_meta"][LIVE]["turnId"]
    );
    assert_ne!(current["current"]["turnId"], first["turnId"]);
    drop(observer.input);
    let output = finish_child(child).await;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    endpoint.done().await;
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn requested_tool_calls_stream_their_activity_and_recorded_outcome() {
    use super::approvals::Fixture;

    let fixture = Fixture::new(false);
    std::fs::write(fixture.primary.join("note.txt"), "fixture note").unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", r#"{"path":"note.txt"}"#),
        Reply::Finished("Read it."),
    ])
    .await;
    let mut child = fixture
        .process(&endpoint.url, "serve")
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut observer = Observer {
        input: child.stdin.take().unwrap(),
        output: BufReader::new(child.stdout.take().unwrap()),
        next: 0,
        updates: vec![],
    };
    let mut capabilities = extension_initialize();
    capabilities["clientCapabilities"]["_meta"][LIVE] = 1.into();
    observer.request("initialize", capabilities).await;
    let session = observer
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();
    let submitted = observer.request("_co.grida/session/submit", json!({
        "sessionId":session,"inputId":"activity-input","prompt":[{"type":"text","text":"Read the note"}]
    })).await;
    endpoint.request().await;
    endpoint.request().await;
    let mut outcomes = Vec::new();
    timeout(WAIT, async {
        while outcomes.last() != Some(&json!("succeeded")) {
            let frame = if observer.updates.is_empty() {
                observer.frame().await
            } else {
                observer.updates.remove(0)
            };
            let params = &frame["params"];
            if params["update"]["sessionUpdate"] != "tool_call" {
                continue;
            }
            let meta = &params["_meta"][LIVE];
            assert_eq!(meta["turnId"], submitted["turnId"]);
            assert_eq!(meta["activity"], "read");
            assert!(meta["messageId"].is_string());
            assert_eq!(params["update"]["title"], "read_file");
            outcomes.push(meta["outcome"].clone());
        }
    })
    .await
    .unwrap();
    assert_eq!(outcomes, [json!("running"), json!("succeeded")]);
    drop(observer);
    let _ = child.kill().await;
    endpoint.done().await;
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn command_actions_match_live_and_reopened_activity() {
    use super::approvals::Fixture;

    const TRANSCRIPT: &str = "co.grida/session/transcript-window";
    let fixture = Fixture::new(true);
    let mut profile: Value =
        serde_json::from_slice(&std::fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandRead"] = json!("allow");
    std::fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    std::fs::write(fixture.primary.join("note.txt"), "fixture note").unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Tool(
                "exec_command",
                r#"{"cmd":"/bin/cat note.txt","access":"read"}"#,
            ),
            Reply::Tool(
                "exec_command",
                r#"{"cmd":"/bin/cat missing.txt","access":"read"}"#,
            ),
            Reply::Tool(
                "exec_command",
                r#"{"cmd":"/bin/cat note.txt && printf done","access":"read"}"#,
            ),
            Reply::Finished("Done."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let start = |url: &str| {
        let mut child = fixture
            .process(url, "serve")
            .args(["--stdio", "--provider", "responses"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let observer = Observer {
            input: child.stdin.take().unwrap(),
            output: BufReader::new(child.stdout.take().unwrap()),
            next: 0,
            updates: vec![],
        };
        (child, observer)
    };
    let mut capabilities = extension_initialize();
    capabilities["clientCapabilities"]["_meta"][LIVE] = 1.into();
    capabilities["clientCapabilities"]["_meta"][TRANSCRIPT] = 1.into();
    let (child, mut observer) = start(&endpoint.url);
    observer.request("initialize", capabilities.clone()).await;
    let created = observer
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = &created["sessionId"];
    let submitted = observer
        .request(
            "_co.grida/session/submit",
            json!({
                "sessionId":session,"inputId":"command-actions","prompt":[{"type":"text","text":"Check the note"}]
            }),
        )
        .await;
    for _ in 0..4 {
        endpoint.request().await;
    }
    let finalized = observer.observed(session.as_str().unwrap(), true).await;
    assert_eq!(finalized["params"]["update"]["content"]["text"], "Done.");
    timeout(WAIT, async {
        loop {
            let snapshot = observer
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            if snapshot["latest"]["turnId"] == submitted["turnId"] {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();

    // Updates use one ID for the running call and its terminal result.
    let mut live = Vec::new();
    for frame in &observer.updates {
        let params = &frame["params"];
        if let Some(meta) = params["_meta"].get(LIVE)
            && params["update"]["sessionUpdate"] == "tool_call"
        {
            assert_eq!(meta["turnId"], submitted["turnId"], "{frame}");
            assert_eq!(meta["activity"], "execute", "{frame}");
            assert_eq!(params["update"]["title"], "exec_command", "{frame}");
            assert_eq!(params["update"]["kind"], "execute", "{frame}");
            live.push((&params["update"], meta));
        }
    }
    let cases = [
        (
            "/bin/cat note.txt",
            "succeeded",
            Some(json!([{"kind":"read","path":"note.txt"}])),
        ),
        (
            "/bin/cat missing.txt",
            "failed",
            Some(json!([{"kind":"read","path":"missing.txt"}])),
        ),
        ("/bin/cat note.txt && printf done", "succeeded", None),
    ];
    assert_eq!(live.len(), cases.len() * 2);
    let mut settled = Vec::new();
    for ((command, outcome, actions), pair) in cases.iter().zip(live.as_chunks::<2>().0) {
        assert_eq!(pair[0].1["outcome"], "running");
        assert_eq!(pair[1].1["outcome"], *outcome);
        assert_eq!(pair[0].0["toolCallId"], pair[1].0["toolCallId"]);
        for (update, meta) in pair {
            assert_eq!(update["rawInput"]["cmd"], *command);
            assert_eq!(meta.get("commandActions"), actions.as_ref());
        }
        settled.push((
            pair[1].0["toolCallId"].clone(),
            pair[1].1["outcome"].clone(),
            pair[1].1.get("commandActions").cloned(),
        ));
    }
    drop(observer.input);
    let output = finish_child(child).await;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );

    let (child, mut observer) = start(&endpoint.url);
    observer.request("initialize", capabilities).await;
    let mut load = json!({
        "sessionId":session,"cwd":fixture.primary,"mcpServers":[],
        "_meta":{TRANSCRIPT:{"kind":"attach"}}
    });
    observer.request("session/load", load.clone()).await;
    load["_meta"][TRANSCRIPT] = json!({"kind":"read","requestId":"reopened"});
    observer.request("session/load", load).await;
    let replayed: Vec<_> = observer
        .updates
        .iter()
        .filter_map(|frame| {
            let params = &frame["params"];
            let update = &params["update"];
            let meta = params["_meta"].get(TRANSCRIPT)?;
            (update["sessionUpdate"] == "tool_call").then(|| {
                (
                    update["toolCallId"].clone(),
                    meta["outcome"].clone(),
                    meta.get("commandActions").cloned(),
                )
            })
        })
        .collect();
    assert_eq!(replayed, settled);
    assert!(endpoint.requests.try_recv().is_err());
    drop(observer.input);
    let output = finish_child(child).await;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    endpoint.done().await;
}

#[tokio::test]
async fn a_submitted_reasoning_level_reaches_only_a_reasoning_model() {
    for supported in [true, false] {
        let temp = TempDir::new().unwrap();
        let workspace = TempDir::new().unwrap();
        let mut endpoint = Endpoint::start(vec![Reply::Finished("Reasoned.")]).await;
        let mut command = executable();
        command.args(["serve", "--stdio"]);
        configured(&mut command, &temp.path().join("state"), &endpoint.url);
        if supported {
            command.arg("--reasoning");
        }
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut observer = Observer {
            input: child.stdin.take().unwrap(),
            output: BufReader::new(child.stdout.take().unwrap()),
            next: 0,
            updates: vec![],
        };
        observer.request("initialize", extension_initialize()).await;
        let session = observer
            .request(
                "session/new",
                json!({"cwd":workspace.path(),"mcpServers":[]}),
            )
            .await["sessionId"]
            .as_str()
            .unwrap()
            .to_owned();
        observer
            .request(
                "_co.grida/session/submit",
                json!({
                    "sessionId":session,"inputId":"reasoning-input","reasoning":"high",
                    "prompt":[{"type":"text","text":"Think it through"}]
                }),
            )
            .await;
        let body = endpoint.request().await;
        assert_eq!(
            body.get("reasoning_effort"),
            supported.then(|| json!("high")).as_ref(),
            "{body}"
        );
        drop(observer);
        let _ = child.kill().await;
        endpoint.done().await;
    }
}
