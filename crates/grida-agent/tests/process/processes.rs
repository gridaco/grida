//! GRIDA-SEC-004 — chat processes through the built private host.

use super::approvals::{Fixture, Stdio as Client};
use super::lifecycle::{queue_basis, task_basis};
use super::*;
use std::fs;

const PROCESSES: &str = "co.grida/session/processes";
const BEAT: &str = "while :; do printf . >> beat; /bin/sleep 0.05; done";

/// A fixture whose primary directory allows writing commands.
fn fixture() -> Fixture {
    let fixture = Fixture::new(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandReadWrite"] = json!("allow");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    fixture
}

fn initialize(processes: bool) -> Value {
    let mut request = super::deletion::capabilities();
    if processes {
        request["clientCapabilities"]["_meta"][PROCESSES] = 1.into();
    }
    request
}

async fn start(fixture: &Fixture, endpoint: &str, processes: bool) -> Client {
    let mut client = Client::from_child(
        fixture
            .process(endpoint, "serve")
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let ready = client.request("initialize", initialize(processes)).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"][PROCESSES], 1,
        "{ready}"
    );
    client
}

/// Process lists the host published, in arrival order, and replies read
/// while waiting for something else.
#[derive(Default)]
struct Updates {
    lists: Vec<Value>,
    replies: std::collections::BTreeMap<u64, Value>,
}

impl Updates {
    async fn next(&mut self, client: &mut Client) {
        let frame = client.read_frame().await;
        if let Some(update) = frame["params"]["_meta"].get(PROCESSES) {
            assert_eq!(frame["method"], "session/update", "{frame}");
            self.lists.push(update["processes"].clone());
        } else if frame["method"].is_null()
            && let Some(id) = frame["id"].as_u64()
        {
            self.replies.insert(id, frame);
        }
    }

    /// A request's reply, noting updates that arrive first.
    async fn call(&mut self, client: &mut Client, method: &str, params: Value) -> Value {
        let id = client.send(method, params).await;
        self.reply(client, id).await
    }

    async fn reply(&mut self, client: &mut Client, id: u64) -> Value {
        timeout(WAIT, async {
            loop {
                if let Some(reply) = self.replies.remove(&id) {
                    return reply;
                }
                self.next(client).await;
            }
        })
        .await
        .unwrap()
    }

    /// Read until a published list satisfies `matches`.
    async fn until(&mut self, client: &mut Client, matches: impl Fn(&Value) -> bool) -> Value {
        timeout(WAIT, async {
            loop {
                if let Some(found) = self.lists.iter().find(|list| matches(list)) {
                    return found.clone();
                }
                self.next(client).await;
            }
        })
        .await
        .unwrap()
    }
}

fn states(list: &Value) -> Vec<(u64, String)> {
    list.as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            (
                entry["processId"].as_u64().unwrap(),
                entry["state"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
}

/// Whether a process keeps writing its heartbeat file.
async fn beating(path: &Path) -> bool {
    let before = fs::metadata(path).map_or(0, |metadata| metadata.len());
    tokio::time::sleep(Duration::from_millis(400)).await;
    fs::metadata(path).map_or(0, |metadata| metadata.len()) > before
}

async fn wait_for_file(path: &Path) {
    timeout(WAIT, async {
        while !path.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

async fn session(updates: &mut Updates, client: &mut Client, cwd: &Path) -> String {
    let created = updates
        .call(client, "session/new", json!({"cwd":cwd,"mcpServers":[]}))
        .await;
    created["result"]["sessionId"].as_str().unwrap().to_owned()
}

fn prompt(session: &str, text: &str) -> Value {
    json!({"sessionId":session,"prompt":[{"type":"text","text":text}]})
}

fn tool_text(request: &Value) -> String {
    request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|message| message["role"] == "tool")
        .unwrap()["content"]
        .to_string()
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn a_process_outlives_its_turn_and_stops_on_request() {
    let fixture = fixture();
    let start_process = json!({
        "access":"read_write","cmd":format!("printf started; {BEAT}"),"yield_time_ms":30000,
    })
    .to_string();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("exec_command", start_process.leak()),
        Reply::Tool("write_stdin", r#"{"session_id":1,"yield_time_ms":5000}"#),
        Reply::Finished("It is still running."),
    ])
    .await;
    let mut client = start(&fixture, &endpoint.url, true).await;
    let mut updates = Updates::default();
    let session = session(&mut updates, &mut client, &fixture.primary).await;
    let beat = fixture.primary.join("beat");

    // The turn is stopped while the command's first wait is in progress.
    let first = client
        .send("session/prompt", prompt(&session, "Start the server"))
        .await;
    endpoint.request().await;
    wait_for_file(&beat).await;
    let snapshot = updates
        .call(
            &mut client,
            "_co.grida/session/snapshot",
            json!({"sessionId":session}),
        )
        .await;
    let stop = updates
        .call(
            &mut client,
            "_co.grida/session/stop",
            task_basis(&snapshot["result"], &session, "stop-turn"),
        )
        .await;
    assert!(stop.get("error").is_none(), "{stop}");
    let stopped = updates.reply(&mut client, first).await;
    assert_eq!(stopped["result"]["stopReason"], "cancelled", "{stopped}");
    let started = updates
        .until(&mut client, |list| !list.as_array().unwrap().is_empty())
        .await;
    assert_eq!(states(&started), [(1, "running".to_owned())]);
    assert!(beating(&beat).await);

    let listed = updates
        .call(
            &mut client,
            "_co.grida/session/processes",
            json!({"sessionId":session}),
        )
        .await;
    assert_eq!(listed["result"]["sessionId"], session, "{listed}");
    let entry = &listed["result"]["processes"][0];
    assert_eq!(entry["processId"], 1, "{listed}");
    assert_eq!(entry["state"], "running");
    assert_eq!(entry["exitCode"], Value::Null);
    assert_eq!(entry["terminal"], false);
    assert_eq!(entry["cwd"], json!(fixture.primary));
    assert!(
        entry["command"]
            .as_str()
            .unwrap()
            .starts_with("printf started")
    );
    assert!(entry["startedAt"].as_u64().unwrap() > 0);

    // The next turn reads the same process.
    let paused = updates
        .call(
            &mut client,
            "_co.grida/session/snapshot",
            json!({"sessionId":session}),
        )
        .await;
    let resumed = updates
        .call(
            &mut client,
            "_co.grida/session/resume-queue",
            queue_basis(&paused["result"], &session, "resume-queue"),
        )
        .await;
    assert!(resumed.get("error").is_none(), "{resumed}");
    let second = updates
        .call(&mut client, "session/prompt", prompt(&session, "Is it up?"))
        .await;
    assert_eq!(second["result"]["stopReason"], "end_turn", "{second}");
    endpoint.request().await;
    let polled = tool_text(&endpoint.request().await);
    assert!(
        polled.contains("Process running with session ID 1"),
        "{polled}"
    );
    assert!(beating(&beat).await);

    // Stopping waits for the process to end; it is listed as ended until the
    // model reads its end.
    for invalid in [json!([]), json!([1, 1]), json!([0])] {
        let refused = updates
            .call(
                &mut client,
                "_co.grida/session/stop-processes",
                json!({"sessionId":session,"processIds":invalid}),
            )
            .await;
        assert_eq!(refused["error"]["code"], -32602, "{refused}");
    }
    let stopped = updates
        .call(
            &mut client,
            "_co.grida/session/stop-processes",
            json!({"sessionId":session,"processIds":[1, 7]}),
        )
        .await;
    assert_eq!(
        stopped["result"],
        json!({"sessionId":session,"stopped":[1]})
    );
    assert!(!beating(&beat).await);
    let ended = updates
        .until(&mut client, |list| {
            states(list) == [(1, "ended".to_owned())]
        })
        .await;
    assert_eq!(ended[0]["exitCode"], Value::Null, "{ended}");
    let all = updates
        .call(
            &mut client,
            "_co.grida/session/stop-processes",
            json!({"sessionId":session}),
        )
        .await;
    assert_eq!(all["result"]["stopped"], json!([1]), "{all}");
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn deleting_a_chat_and_closing_the_host_stop_its_processes() {
    let fixture = fixture();
    let deleted = fixture.primary.join("deleted");
    let open = fixture.primary.join("open");
    fs::create_dir(&deleted).unwrap();
    fs::create_dir(&open).unwrap();
    let command = |directory: &Path| -> &'static str {
        json!({
            "access":"read_write","cmd":BEAT,"workdir":directory,"yield_time_ms":250,
        })
        .to_string()
        .leak()
    };
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("exec_command", command(&deleted)),
        Reply::Finished("Started."),
        Reply::Tool("exec_command", command(&open)),
        Reply::Finished("Started."),
    ])
    .await;
    let mut client = start(&fixture, &endpoint.url, true).await;
    let mut updates = Updates::default();

    let retired = session(&mut updates, &mut client, &fixture.primary).await;
    let reply = updates
        .call(&mut client, "session/prompt", prompt(&retired, "Start it"))
        .await;
    assert_eq!(reply["result"]["stopReason"], "end_turn", "{reply}");
    endpoint.request().await;
    assert!(tool_text(&endpoint.request().await).contains("Process running with session ID 1"));
    assert!(beating(&deleted.join("beat")).await);
    // A running process does not keep the chat from being deleted.
    let request = super::deletion::deletion(&mut client, &retired, &fixture.primary).await;
    let removed = updates
        .call(&mut client, "_co.grida/session/delete", request)
        .await;
    assert!(removed.get("error").is_none(), "{removed}");
    assert!(!beating(&deleted.join("beat")).await);

    let kept = session(&mut updates, &mut client, &fixture.primary).await;
    let reply = updates
        .call(&mut client, "session/prompt", prompt(&kept, "Start it"))
        .await;
    assert_eq!(reply["result"]["stopReason"], "end_turn", "{reply}");
    endpoint.request().await;
    endpoint.request().await;
    assert!(beating(&open.join("beat")).await);
    let listed = updates
        .call(
            &mut client,
            "_co.grida/session/processes",
            json!({"sessionId":kept}),
        )
        .await;
    assert_eq!(
        states(&listed["result"]["processes"]),
        [(1, "running".to_owned())]
    );
    // Closing the host stops every process with verified cleanup.
    client.close().await;
    assert!(!beating(&open.join("beat")).await);
    let temporary = fixture
        .profile
        .parent()
        .unwrap()
        .with_file_name("temporary");
    assert!(fs::read_dir(temporary).unwrap().next().is_none());
    endpoint.done().await;
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn process_controls_and_queued_editor_bindings_require_negotiation() {
    let fixture = fixture();
    let endpoint = Endpoint::start(vec![]).await;
    let mut client = Client::from_child(
        fixture
            .process(&endpoint.url, "serve")
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let ready = client.request("initialize", initialize(false)).await;
    // Offered, but not negotiated by this client.
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"][PROCESSES], 1,
        "{ready}"
    );
    let mut updates = Updates::default();
    let session = session(&mut updates, &mut client, &fixture.primary).await;
    for (method, params) in [
        ("_co.grida/session/processes", json!({"sessionId":session})),
        (
            "_co.grida/session/stop-processes",
            json!({"sessionId":session}),
        ),
    ] {
        let refused = client.request(method, params).await;
        assert_eq!(refused["error"]["code"], -32601, "{refused}");
    }
    // A queued request may name an editor surface only with the editor
    // capability, as a submitted one.
    let queued = client
        .request(
            "_co.grida/session/enqueue",
            json!({
                "sessionId":session,"inputId":"queued",
                "prompt":[{"type":"text","text":"Edit the open design"}],
                "editorEndpointId":"6f9619ff-8b86-4011-b42d-00c04fc964ff",
            }),
        )
        .await;
    assert_eq!(queued["error"]["code"], -32601, "{queued}");
    client.close().await;
    endpoint.done().await;
}
