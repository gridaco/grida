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
