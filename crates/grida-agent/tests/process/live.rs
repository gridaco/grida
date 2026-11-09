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
