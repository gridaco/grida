//! Shared native publication order survives live delivery, polling and reopen.
use super::*;

const ORDER: &str = "co.grida/session/activity-order";
const WINDOW: &str = "co.grida/session/transcript-window";
const ACTIVITY: &str = "_co.grida/subagent/activity";

struct Client {
    io: PrivateStdio,
    frames: Vec<Value>,
    replies: BTreeMap<u64, Value>,
}
impl Client {
    fn new(child: Child) -> Self {
        Self {
            io: PrivateStdio::from_child(child),
            frames: Vec::new(),
            replies: BTreeMap::new(),
        }
    }
    async fn response(&mut self, id: u64) -> Value {
        if let Some(frame) = self.replies.remove(&id) {
            return frame;
        }
        loop {
            let frame = self.io.read_frame().await;
            if frame["id"] == id {
                return frame;
            }
            if let Some(id) = frame["id"].as_u64() {
                self.replies.insert(id, frame);
            } else {
                self.frames.push(frame);
            }
        }
    }
    async fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.io.send(method, params).await;
        let frame = self.response(id).await;
        assert!(frame.get("error").is_none(), "{frame}");
        frame["result"].clone()
    }
    async fn activity(&mut self, session: &str) -> Value {
        self.request(ACTIVITY, json!({"parentSessionId":session}))
            .await
    }
}
fn initialize() -> Value {
    let mut request = extension_initialize();
    for capability in [
        ORDER,
        WINDOW,
        "co.grida/subagent/activity",
        "co.grida/session/updates",
    ] {
        request["clientCapabilities"]["_meta"][capability] = 1.into();
    }
    request
}
fn reply(text: &str, name: &str, arguments: Value) -> Reply {
    let body = format!(
        "data: {}\n\ndata: {}\n\ndata: [DONE]\n\n",
        json!({"id":"timeline-response","choices":[{"index":0,"delta":{"role":"assistant","content":text,"tool_calls":[{"index":0,"id":"timeline-call","type":"function","function":{"name":name,"arguments":arguments.to_string()}}]},"finish_reason":null}]}),
        json!({"id":"timeline-response","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]})
    );
    Reply::RawHttp(format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ))
}
fn spawn(fixture: &Fixture, endpoint: &Endpoint) -> Child {
    fixture
        .process(&endpoint.url, "serve")
        .args(["--stdio", "--subagents"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap()
}
fn orders(frames: &[Value], parent: &str) -> BTreeMap<String, u64> {
    let mut orders = BTreeMap::new();
    for frame in frames {
        let params = &frame["params"];
        if params["sessionId"] != parent {
            continue;
        }
        let meta = &params["_meta"][ORDER];
        let Some(order) = meta["activityOrder"].as_u64() else {
            continue;
        };
        assert!(order > 0 && order <= 9_007_199_254_740_991);
        assert!(meta["activityOrderIncomplete"].is_null());
        let update = &params["update"];
        let key = match update["sessionUpdate"].as_str() {
            Some("agent_message_chunk" | "user_message_chunk") => {
                format!("message/{}", update["messageId"].as_str().unwrap())
            }
            Some("tool_call") => format!("call/{}", update["toolCallId"].as_str().unwrap()),
            _ => continue,
        };
        if let Some(prior) = orders.insert(key, order) {
            assert_eq!(prior, order);
        }
    }
    orders
}
fn text_order(frames: &[Value], text: &str) -> u64 {
    frames
        .iter()
        .find_map(|frame| {
            let p = &frame["params"];
            (p["update"]["content"]["text"]
                .as_str()
                .is_some_and(|v| v.contains(text)))
            .then(|| p["_meta"][ORDER]["activityOrder"].as_u64())
            .flatten()
        })
        .unwrap_or_else(|| panic!("missing ordered text {text}: {frames:?}"))
}
async fn wait_ordered_finish(client: &mut Client, session: &str, name: &str) -> Value {
    timeout(WAIT, async {
        loop {
            let page = client.activity(session).await;
            // Settlement can be visible before the publisher records its order.
            if page["orderComplete"] == true
                && page["events"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|e| e["name"] == name && e["kind"] == "finished")
            {
                return page;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("missing ordered completion for {name}"))
}

async fn scenario(detached: bool) {
    let fixture = Fixture::new(false);
    fs::write(fixture.primary.join("note.txt"), "local fixture").unwrap();
    let step = Arc::new(Mutex::new(0_usize));
    let children = Arc::new(Mutex::new(Vec::<Value>::new()));
    let (a_seen, a_ready) = tokio::sync::oneshot::channel();
    let (b_seen, _b_ready) = tokio::sync::oneshot::channel();
    let (release_a, hold_a) = tokio::sync::oneshot::channel();
    let (release_b, hold_b) = tokio::sync::oneshot::channel();
    let (middle_seen, middle_ready) = tokio::sync::oneshot::channel();
    let (release_middle, hold_middle) = tokio::sync::oneshot::channel();
    let (later_seen, later_ready) = tokio::sync::oneshot::channel();
    let (release_later, hold_later) = tokio::sync::oneshot::channel();
    let a_seen = Arc::new(Mutex::new(Some(a_seen)));
    let a_ready = Arc::new(Mutex::new(Some(a_ready)));
    let b_seen = Arc::new(Mutex::new(Some(b_seen)));
    let hold_a = Arc::new(Mutex::new(Some(hold_a)));
    let hold_b = Arc::new(Mutex::new(Some(hold_b)));
    let middle_seen = Arc::new(Mutex::new(Some(middle_seen)));
    let hold_middle = Arc::new(Mutex::new(Some(hold_middle)));
    let later_seen = Arc::new(Mutex::new(Some(later_seen)));
    let hold_later = Arc::new(Mutex::new(Some(hold_later)));
    let replies = (0..8).map(|_| {
        let step = step.clone(); let children = children.clone();
        let a_seen = a_seen.clone(); let a_ready = a_ready.clone(); let b_seen = b_seen.clone();
        let hold_a = hold_a.clone(); let hold_b = hold_b.clone(); let middle_seen = middle_seen.clone(); let hold_middle = hold_middle.clone();
        let later_seen = later_seen.clone(); let hold_later = hold_later.clone();
        Reply::Choose(Box::new(move |request| {
            if !offered(request, "spawn_agent") {
                if request["messages"].to_string().contains("timeline-unit-a") {
                    a_seen.lock().unwrap().take().unwrap().send(()).unwrap();
                    return Reply::After(hold_a.lock().unwrap().take().unwrap(), Box::new(Reply::Finished("Worker A finished.")));
                }
                b_seen.lock().unwrap().take().unwrap().send(()).unwrap();
                return Reply::After(hold_b.lock().unwrap().take().unwrap(), Box::new(Reply::Finished("Worker B finished.")));
            }
            for result in tool_results(request) {
                if let Some(assignment) = result["structured"].get("assignment") {
                    let mut children = children.lock().unwrap(); if !children.contains(assignment) { children.push(assignment.clone()); }
                }
            }
            let current = { let mut step = step.lock().unwrap(); let current = *step; *step += 1; current };
            match current {
                0 => reply("Before first worker.", "spawn_agent", json!({"name":"First unit","instructions":"timeline-unit-a: report your independent result."})),
                1 => Reply::After(a_ready.lock().unwrap().take().unwrap(), Box::new(reply("Between worker starts.", "read_file", json!({"path":"note.txt"})))),
                2 => reply("Before second worker.", "spawn_agent", json!({"name":"Second unit","instructions":"timeline-unit-b: report your independent result."})),
                3 => {
                    middle_seen.lock().unwrap().take().unwrap().send(()).unwrap();
                    Reply::After(hold_middle.lock().unwrap().take().unwrap(), Box::new(reply("After second worker finished.", "read_file", json!({"path":"note.txt"}))))
                }
                4 => {
                    later_seen.lock().unwrap().take().unwrap().send(()).unwrap();
                    let ids = children.lock().unwrap().iter().map(|c| c["child"].clone()).collect::<Vec<_>>();
                    Reply::After(hold_later.lock().unwrap().take().unwrap(), Box::new(reply("After first worker finished.", "wait_agent", json!({"children":ids}))))
                }
                5 => Reply::Finished("Both workers collected."),
                _ => panic!("unexpected parent step {current}"),
            }
        }))
    }).collect();
    let endpoint = Endpoint::start(replies).await;
    let mut client = Client::new(spawn(&fixture, &endpoint));
    let initialized = client.request("initialize", initialize()).await;
    assert_eq!(initialized["agentCapabilities"]["_meta"][ORDER], 1);
    let session = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await["sessionId"]
        .as_str()
        .unwrap()
        .to_owned();
    let prompt = if detached {
        client.request("_co.grida/session/submit", json!({"sessionId":session,"inputId":"ordered-work","prompt":[{"type":"text","text":"Coordinate two units and inspect the local note between their lifecycle events."}]})).await;
        None
    } else {
        Some(client.io.send("session/prompt", json!({"sessionId":session,"prompt":[{"type":"text","text":"Coordinate two units and inspect the local note between their lifecycle events."}]})).await)
    };
    timeout(WAIT, middle_ready).await.unwrap().unwrap();
    let started = client.activity(&session).await;
    assert_eq!(
        started["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["kind"] == "started")
            .count(),
        2
    );
    release_b.send(()).unwrap();
    wait_ordered_finish(&mut client, &session, "Second unit").await;
    release_middle.send(()).unwrap();
    timeout(WAIT, later_ready).await.unwrap().unwrap();
    release_a.send(()).unwrap();
    let completed = wait_ordered_finish(&mut client, &session, "First unit").await;
    release_later.send(()).unwrap();
    if let Some(prompt) = prompt {
        assert!(client.response(prompt).await.get("error").is_none());
    }
    timeout(WAIT, async {
        loop {
            let snapshot = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            if snapshot["current"].is_null() && snapshot["latest"]["status"] == "succeeded" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    while !client.frames.iter().any(|f| {
        f["params"]["update"]["content"]["text"]
            .as_str()
            .is_some_and(|s| s.contains("Both workers collected."))
    }) {
        let frame = client.io.read_frame().await;
        client.frames.push(frame);
    }
    let live = orders(&client.frames, &session);
    let event_order = |name: &str, kind: &str| {
        completed["events"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["name"] == name && e["kind"] == kind)
            .unwrap()["activityOrder"]
            .as_u64()
            .unwrap()
    };
    assert!(
        text_order(&client.frames, "Before first worker.") < event_order("First unit", "started")
    );
    assert!(
        event_order("First unit", "started") < text_order(&client.frames, "Between worker starts.")
    );
    assert!(
        text_order(&client.frames, "Before second worker.") < event_order("Second unit", "started")
    );
    assert!(event_order("Second unit", "started") < event_order("Second unit", "finished"));
    assert!(
        event_order("Second unit", "finished")
            < text_order(&client.frames, "After second worker finished.")
    );
    assert!(
        text_order(&client.frames, "After second worker finished.")
            < event_order("First unit", "finished")
    );
    assert!(
        event_order("First unit", "finished")
            < text_order(&client.frames, "After first worker finished.")
    );
    let calls = live.keys().filter(|key| key.starts_with("call/")).count();
    assert_eq!(
        calls, 5,
        "individual tool calls need their own stable positions: {live:?}"
    );
    client.io.close().await;
    endpoint.done().await;
    let idle = Endpoint::start(Vec::new()).await;
    let mut reopened = Client::new(spawn(&fixture, &idle));
    reopened.request("initialize", initialize()).await;
    reopened.request("session/load", json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[],"_meta":{WINDOW:{"kind":"attach"}}})).await;
    reopened.request("session/load", json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[],"_meta":{WINDOW:{"kind":"read","requestId":"ordered-replay"}}})).await;
    let replay = orders(&reopened.frames, &session);
    for (key, order) in &live {
        assert_eq!(
            replay.get(key),
            Some(order),
            "{key}: live={live:?} replay={replay:?}"
        );
    }
    assert_eq!(
        reopened.activity(&session).await["events"],
        completed["events"]
    );
    let repeat = reopened.activity(&session).await;
    assert_eq!(repeat["events"], completed["events"]);
    reopened.io.close().await;
    idle.done().await;
}

#[tokio::test]
async fn detached_publication_interleaves_actual_child_lifecycle_and_replays_after_restart() {
    scenario(true).await;
}
#[tokio::test]
async fn standard_prompt_publication_interleaves_actual_child_lifecycle_and_replays_after_restart()
{
    scenario(false).await;
}
