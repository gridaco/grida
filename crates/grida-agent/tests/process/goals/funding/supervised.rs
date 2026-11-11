//! GRIDA-SEC-004 / GRIDA-SEC-014 — exact saved-provider Goal work over private stdio.

use super::*;
use agent_kit_core::TurnId;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::collections::BTreeMap;

const PROVIDERS: [(&str, &str); 2] = [
    ("openrouter", "https://openrouter.ai/api/v1"),
    ("vercel", "https://ai-gateway.vercel.sh/v1"),
];

fn called(request: &Value, name: &str) -> bool {
    request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .any(|message| {
            message["tool_calls"]
                .as_array()
                .is_some_and(|calls| calls.iter().any(|call| call["function"]["name"] == name))
        })
}

struct Stream {
    request: Value,
    chunk: Option<String>,
    held: bool,
}

struct Worker {
    client: PrivateStdio,
    endpoint: String,
    streams: BTreeMap<String, Stream>,
    dispatches: Vec<Value>,
    hold: bool,
    rotate: Option<(grida_auth::ProviderStore, &'static str)>,
    rotated: bool,
    parent: String,
    chosen_child: Option<String>,
    pending_parent: Option<Value>,
}

impl Worker {
    async fn open(state: &Path, home: &Path, endpoint: &str) -> Self {
        let child = executable()
            .args([
                "serve",
                "--stdio",
                "--subagents",
                "--supervised-provider",
                "--state-dir",
            ])
            .arg(state)
            .arg("--credential-home")
            .arg(home)
            .args(["--endpoint", endpoint, "--model", "fixture-model"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut worker = Self {
            client: PrivateStdio::from_child(child),
            endpoint: endpoint.into(),
            streams: BTreeMap::new(),
            dispatches: Vec::new(),
            hold: false,
            rotate: None,
            rotated: false,
            parent: String::new(),
            chosen_child: None,
            pending_parent: None,
        };
        let mut initialize = extension_initialize();
        for capability in [
            "provider/egress",
            "session/effort",
            "goal/start",
            "goal/inspect",
            "goal/control",
            "goal/recover",
            "goal/funded-review",
            "goal/named-child",
            "subagent/create",
            "subagent/inspect",
        ] {
            initialize["clientCapabilities"]["_meta"][format!("co.grida/{capability}")] = 1.into();
        }
        let ready = worker.request("initialize", initialize).await;
        for capability in [
            "co.grida/session/effort",
            "co.grida/goal/funded-review",
            "co.grida/goal/named-child",
        ] {
            assert_eq!(
                ready["agentCapabilities"]["_meta"][capability], 1,
                "{ready}"
            );
        }
        worker
    }

    async fn request(&mut self, method: &str, params: Value) -> Value {
        let result = self.request_one(method, params).await;
        if let Some(response) = self.pending_parent.take() {
            // Keep this fixed-step settlement scenario separate from the
            // pending-collection cases by observing the actual child outcome.
            let parent = self.parent.clone();
            let snapshot = self
                .request_one("_co.grida/session/snapshot", json!({"sessionId":parent}))
                .await;
            let turn = TurnId::new(snapshot["current"]["turnId"].as_str().unwrap()).unwrap();
            let child = self.chosen_child.clone().unwrap_or_else(|| {
                sponsored_identity(&SessionId::new(&parent).unwrap(), &turn)
                    .unwrap()
                    .to_string()
            });
            timeout(WAIT, async {
                loop {
                    let view = self
                        .request_one(
                            "_co.grida/subagent/inspect",
                            json!({"parentSessionId":parent,"childId":child}),
                        )
                        .await;
                    if view["current"].is_null() && view["latest"]["disposition"] == "settled" {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap();
            self.client
                .respond(&response, json!({"status":"accepted"}))
                .await;
        }
        result
    }

    async fn request_one(&mut self, method: &str, params: Value) -> Value {
        let id = self.client.send(method, params).await;
        loop {
            let frame = self.client.read_frame().await;
            match frame["method"].as_str() {
                Some("_co.grida/provider/exchange") => self.exchange(frame).await,
                Some("_co.grida/provider/cancel") => {
                    self.streams.remove(frame["params"]["id"].as_str().unwrap());
                }
                None if frame["id"] == id => {
                    assert!(frame.get("error").is_none(), "{frame}");
                    return frame["result"].clone();
                }
                _ => {}
            }
        }
    }

    async fn exchange(&mut self, frame: Value) {
        let params = &frame["params"];
        let id = params["id"].as_str().unwrap().to_owned();
        let reply = match params["action"].as_str() {
            Some("open") => {
                assert_eq!(
                    params["target"],
                    format!("{}/chat/completions", self.endpoint)
                );
                assert!(
                    params["headers"]
                        .as_array()
                        .unwrap()
                        .contains(&json!(["authorization", "Bearer fixture-key"]))
                );
                let request: Value = serde_json::from_slice(
                    &STANDARD
                        .decode(params["initial"].as_str().unwrap())
                        .unwrap(),
                )
                .unwrap();
                assert_eq!(request["model"], "fixture-model");
                let child = !offers(&request, "goal_report");
                let defer_parent = !child
                    && !self.hold
                    && self.rotate.is_none()
                    && !self.rotated
                    && called(&request, "delegate_review")
                    && !called(&request, "collect_review");
                if child {
                    assert!(request.get("tools").is_none(), "{request}");
                    if let Some((store, provider)) = self.rotate.take() {
                        store.set(provider, "rotated-fixture-key").unwrap();
                        self.rotated = true;
                    }
                }
                assert!(
                    self.streams
                        .insert(
                            id,
                            Stream {
                                request,
                                chunk: None,
                                held: false
                            }
                        )
                        .is_none()
                );
                if defer_parent {
                    assert!(self.pending_parent.replace(frame["id"].clone()).is_none());
                    return;
                }
                json!({"status":"accepted"})
            }
            Some("dispatch") => {
                let stream = self.streams.get_mut(&id).unwrap();
                let parent = offers(&stream.request, "goal_report");
                let messages = stream.request["messages"].to_string();
                let reply = if !parent {
                    if self.hold {
                        Reply::Hold("Partial funded review")
                    } else {
                        Reply::Finished(FINDING)
                    }
                } else if !called(&stream.request, "delegate_review") {
                    Reply::Tool("delegate_review", DELEGATE)
                } else if self.hold {
                    Reply::Hold("Partial funded parent work")
                } else if !called(&stream.request, "collect_review") {
                    Reply::Tool("collect_review", "{}")
                } else if !called(&stream.request, "goal_report") {
                    assert!(messages.contains(FINDING), "{messages}");
                    Reply::Tool("goal_report", PROGRESS)
                } else {
                    Reply::Finished("The funded review was integrated.")
                };
                stream.held = matches!(reply, Reply::Hold(_));
                stream.chunk =
                    Some(STANDARD.encode(fixture_body(reply, ProviderProtocol::OpenAiCompatible)));
                self.dispatches.push(stream.request.clone());
                json!({"status":"ready","httpStatus":200})
            }
            Some("read") => {
                let stream = self.streams.get_mut(&id).unwrap();
                if let Some(data) = stream.chunk.take() {
                    json!({"status":"chunk","data":data})
                } else if stream.held {
                    return;
                } else {
                    json!({"status":"end"})
                }
            }
            _ => panic!("unexpected exchange {frame}"),
        };
        self.client.respond(&frame["id"], reply).await;
    }

    async fn wait(
        &mut self,
        method: &str,
        params: Value,
        matches: impl Fn(&Value) -> bool,
    ) -> Value {
        timeout(WAIT, async {
            loop {
                let view = self.request(method, params.clone()).await;
                if matches(&view) {
                    return view;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap()
    }

    async fn wait_held(&mut self, session: &str) {
        timeout(WAIT, async {
            loop {
                self.request("_co.grida/session/snapshot", json!({"sessionId":session}))
                    .await;
                if self.dispatches.len() == 3
                    && self
                        .streams
                        .values()
                        .filter(|stream| stream.held && stream.chunk.is_none())
                        .count()
                        == 2
                {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
    }

    async fn start(
        &mut self,
        workspace: &Path,
        named: bool,
        regime: &str,
    ) -> (String, Value, Option<String>) {
        let created = self
            .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
            .await;
        let session = created["sessionId"].as_str().unwrap().to_owned();
        self.parent = session.clone();
        let child = if named {
            Some(self.request("_co.grida/subagent/create", json!({
                "parentSessionId":session,"requestId":"reviewer","name":"Reviewer","workTurns":2,
            })).await["childId"].as_str().unwrap().to_owned())
        } else {
            None
        };
        self.chosen_child = child.clone();
        let mut request = json!({
            "sessionId":session,"inputId":"funded-goal","effort":"ultra","operatingRegime":regime,
            "prompt":[{"type":"text","text":"Review the export."}],
            "goal":{"objective":{"description":"Review the export","criteria":["Export reviewed"]},
                "allowance":{"work_turns":1,"inference_steps":7},"automatic":false},
        });
        if let Some(child) = &child {
            request["goal"]["named_child"] = child.clone().into();
        }
        let accepted = self.request("_co.grida/goal/start", request.clone()).await;
        assert_eq!(accepted["inputId"], "funded-goal");
        (session, request, child)
    }
}

#[tokio::test]
async fn exact_saved_providers_fund_anonymous_and_named_goal_reviews_once() {
    for (provider, endpoint) in PROVIDERS {
        for (named, regime) in [(false, "act"), (false, "plan"), (true, "act")] {
            let root = TempDir::new().unwrap();
            let directory = root.path().canonicalize().unwrap();
            let home = directory.join("credentials");
            let state = directory.join("state");
            let workspace = directory.join("workspace");
            std::fs::create_dir(&workspace).unwrap();
            grida_auth::ProviderStore::new(home.clone())
                .unwrap()
                .set(provider, "fixture-key")
                .unwrap();
            let mut worker = Worker::open(&state, &home, endpoint).await;
            let (session, start, _) = worker.start(&workspace, named, regime).await;
            let goal = worker
                .wait(
                    "_co.grida/goal/inspect",
                    json!({"sessionId":session}),
                    |view| view["goal"]["spent"]["inference_steps"] == 5,
                )
                .await;
            assert_eq!(
                goal["goal"]["spent"],
                json!({"work_turns":1,"inference_steps":5}),
                "{goal}"
            );
            assert!(goal["goal"]["reservation"].is_null());
            assert_eq!(goal["goal"]["remaining"]["inference_steps"], 2, "{goal}");
            assert_eq!(
                goal["goal"]["progress"], "Checked the export structure.",
                "{goal}"
            );
            assert_eq!(worker.dispatches.len(), 5);
            for request in &worker.dispatches {
                assert_eq!(
                    request["messages"].to_string().contains("Plan is active."),
                    regime == "plan",
                    "{request}"
                );
            }
            worker
                .wait(
                    "_co.grida/session/snapshot",
                    json!({"sessionId":session}),
                    |view| view["current"].is_null(),
                )
                .await;
            worker.request("_co.grida/goal/start", start.clone()).await;
            worker.client.close().await;
            let mut reopened = Worker::open(&state, &home, endpoint).await;
            reopened
                .request(
                    "session/load",
                    json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
                )
                .await;
            let replay = reopened.request("_co.grida/goal/start", start).await;
            assert_eq!(replay["disposition"], "completed", "{replay}");
            assert_eq!(
                reopened
                    .request("_co.grida/goal/inspect", json!({"sessionId":session}))
                    .await,
                goal
            );
            assert!(reopened.dispatches.is_empty());
            reopened.client.close().await;
        }
    }
}

#[tokio::test]
async fn exact_saved_providers_keep_both_goal_attempts_held_after_stop_and_restart() {
    for (provider, endpoint) in PROVIDERS {
        for named in [false, true] {
            let root = TempDir::new().unwrap();
            let directory = root.path().canonicalize().unwrap();
            let home = directory.join("credentials");
            let state = directory.join("state");
            let workspace = directory.join("workspace");
            std::fs::create_dir(&workspace).unwrap();
            grida_auth::ProviderStore::new(home.clone())
                .unwrap()
                .set(provider, "fixture-key")
                .unwrap();
            let mut worker = Worker::open(&state, &home, endpoint).await;
            worker.hold = true;
            let (session, _, chosen) = worker.start(&workspace, named, "act").await;
            worker.wait_held(&session).await;
            let select = json!({"sessionId":session});
            let snapshot = worker
                .request("_co.grida/session/snapshot", select.clone())
                .await;
            let turn = TurnId::new(snapshot["current"]["turnId"].as_str().unwrap()).unwrap();
            let child = chosen
                .map(|child| SessionId::new(child).unwrap())
                .unwrap_or_else(|| {
                    sponsored_identity(&SessionId::new(&session).unwrap(), &turn).unwrap()
                });
            let child_select = json!({"parentSessionId":session,"childId":child});
            worker
                .request(
                    "_co.grida/session/pause",
                    task_basis(&snapshot, &session, "pause-task"),
                )
                .await;
            let paused = worker
                .wait("_co.grida/session/snapshot", select.clone(), |view| {
                    view["current"]["disposition"] == "suspended"
                })
                .await;
            worker
                .wait("_co.grida/subagent/inspect", child_select.clone(), |view| {
                    view["current"]["disposition"] == "suspended"
                })
                .await;
            worker.client.close().await;
            let mut restarted = Worker::open(&state, &home, endpoint).await;
            restarted
                .request(
                    "session/load",
                    json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
                )
                .await;
            assert_eq!(
                restarted
                    .request("_co.grida/session/snapshot", select.clone())
                    .await,
                paused
            );
            let stop = task_basis(&paused, &session, "stop-task");
            let receipt = restarted
                .request("_co.grida/session/stop", stop.clone())
                .await;
            restarted
                .wait("_co.grida/session/snapshot", select.clone(), |view| {
                    view["current"].is_null()
                })
                .await;
            restarted
                .wait("_co.grida/subagent/inspect", child_select, |view| {
                    view["current"].is_null() && view["latest"]["status"] == "cancelled"
                })
                .await;
            assert_eq!(
                restarted.request("_co.grida/session/stop", stop).await,
                receipt
            );
            let held = restarted
                .request("_co.grida/goal/inspect", select.clone())
                .await;
            assert_eq!(held["goal"]["status"]["reason"], "uncertain_work", "{held}");
            assert_eq!(held["goal"]["reservation"]["uncertain_steps"], 3, "{held}");
            assert_eq!(
                held["goal"]["spent"],
                json!({"work_turns":0,"inference_steps":0})
            );
            restarted
                .request("_co.grida/goal/recover", select.clone())
                .await;
            assert_eq!(
                restarted.request("_co.grida/goal/inspect", select).await,
                held
            );
            assert!(restarted.dispatches.is_empty());
            restarted.client.close().await;
        }
    }
}

#[tokio::test]
async fn goal_review_key_rotation_between_upload_and_dispatch_cannot_run_either_scope() {
    for (provider, endpoint) in PROVIDERS {
        for named in [false, true] {
            let root = TempDir::new().unwrap();
            let directory = root.path().canonicalize().unwrap();
            let home = directory.join("credentials");
            let state = directory.join("state");
            let workspace = directory.join("workspace");
            std::fs::create_dir(&workspace).unwrap();
            let store = grida_auth::ProviderStore::new(home.clone()).unwrap();
            store.set(provider, "fixture-key").unwrap();
            let mut worker = Worker::open(&state, &home, endpoint).await;
            worker.rotate = Some((store, provider));
            let (session, start, _) = worker.start(&workspace, named, "act").await;
            worker
                .wait(
                    "_co.grida/session/snapshot",
                    json!({"sessionId":session}),
                    |view| view["current"].is_null() && view["latest"].is_object(),
                )
                .await;
            assert!(worker.rotated);
            assert_eq!(
                worker.dispatches.len(),
                1,
                "only the original parent request was dispatched"
            );
            worker.request("_co.grida/goal/start", start.clone()).await;
            assert_eq!(worker.dispatches.len(), 1);
            worker.client.close().await;
            let mut reopened = Worker::open(&state, &home, endpoint).await;
            reopened
                .request(
                    "session/load",
                    json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
                )
                .await;
            reopened.request("_co.grida/goal/start", start).await;
            reopened
                .request("_co.grida/goal/recover", json!({"sessionId":session}))
                .await;
            assert!(reopened.dispatches.is_empty());
            reopened.client.close().await;
        }
    }
}

#[tokio::test]
#[ignore = "requires GRIDA_AGENT_PRE_BYOK_GOAL_BIN pointing to a reviewed previous worker"]
async fn previous_saved_provider_worker_withholds_funded_goal_capabilities() {
    let binary = std::env::var_os("GRIDA_AGENT_PRE_BYOK_GOAL_BIN").unwrap();
    for (provider, endpoint) in PROVIDERS {
        let temporary = TempDir::new().unwrap();
        let directory = temporary.path().canonicalize().unwrap();
        let home = directory.join("credentials");
        let workspace = directory.join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        grida_auth::ProviderStore::new(home.clone())
            .unwrap()
            .set(provider, "fixture-key")
            .unwrap();
        let child = Command::new(&binary)
            .kill_on_drop(true)
            .args([
                "serve",
                "--stdio",
                "--subagents",
                "--supervised-provider",
                "--state-dir",
            ])
            .arg(directory.join("state"))
            .arg("--credential-home")
            .arg(&home)
            .args(["--endpoint", endpoint, "--model", "fixture-model"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut client = PrivateStdio::from_child(child);
        let mut initialize = extension_initialize();
        for capability in [
            "provider/egress",
            "session/effort",
            "goal/start",
            "goal/funded-review",
            "goal/named-child",
        ] {
            initialize["clientCapabilities"]["_meta"][format!("co.grida/{capability}")] = 1.into();
        }
        let ready = client.request("initialize", initialize).await;
        let capabilities = &ready["result"]["agentCapabilities"]["_meta"];
        assert_eq!(capabilities["co.grida/session/effort"], 1, "{ready}");
        assert!(
            capabilities["co.grida/goal/funded-review"].is_null(),
            "{ready}"
        );
        assert!(
            capabilities["co.grida/goal/named-child"].is_null(),
            "{ready}"
        );
        let session = client
            .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
            .await["result"]["sessionId"]
            .clone();
        let refused = client.request("_co.grida/goal/start", json!({
            "sessionId":session,"inputId":"unavailable-funding","effort":"ultra",
            "prompt":[{"type":"text","text":"Review the export."}],
            "goal":{"objective":{"description":"Review the export","criteria":["Export reviewed"]},
                "allowance":{"work_turns":1,"inference_steps":7}},
        })).await;
        assert_eq!(
            refused["error"]["data"], "goal_funded_review_unavailable",
            "{refused}"
        );
        client.close().await;
    }
}
