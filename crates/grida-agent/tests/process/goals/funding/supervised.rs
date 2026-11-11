//! GRIDA-SEC-004 / GRIDA-SEC-014 — exact saved-provider Goal work over private stdio.

use super::*;
use agent_kit_core::TurnId;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::collections::BTreeMap;

const PROVIDERS: [(&str, &str); 2] = [
    ("openrouter", "https://openrouter.ai/api/v1"),
    ("vercel", "https://ai-gateway.vercel.sh/v1"),
];
const GATEWAY: &str = "https://grida.co/api/v1/ai";

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
        let mut command = executable();
        command
            .args([
                "serve",
                "--stdio",
                "--subagents",
                "--supervised-provider",
                "--state-dir",
            ])
            .arg(state);
        if endpoint == GATEWAY {
            command.args(["--supervised-gateway-scope", &"a".repeat(64)]);
        } else {
            command.arg("--credential-home").arg(home);
        }
        let child = command
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
            "goal/spending",
            "gateway/billing-status",
            "session/turn-summary",
            "subagent/create",
            "subagent/inspect",
        ] {
            initialize["clientCapabilities"]["_meta"][format!("co.grida/{capability}")] = 1.into();
        }
        let ready = worker.request("initialize", initialize).await;
        assert_eq!(
            ready["agentCapabilities"]["_meta"]["co.grida/goal/spending"] == 1,
            endpoint == GATEWAY,
            "{ready}"
        );
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
                Some("_co.grida/gateway/read-job-billing") => {
                    assert_eq!(self.endpoint, GATEWAY);
                    assert!(
                        frame["params"]["requestId"]
                            .as_str()
                            .unwrap()
                            .starts_with("req_budget_")
                    );
                    self.client
                        .respond(
                            &frame["id"],
                            json!({"kind":"settled","chargedMills":"0.25"}),
                        )
                        .await;
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
                    format!(
                        "{}/chat/completions{}",
                        self.endpoint,
                        if self.endpoint == GATEWAY {
                            "/capped"
                        } else {
                            ""
                        }
                    )
                );
                let headers = params["headers"].as_array().unwrap();
                if self.endpoint == GATEWAY {
                    assert!(headers.contains(&json!(["x-gg-max-cost-mills", "1"])));
                    assert!(!headers.iter().any(|field| field[0] == "authorization"));
                } else {
                    assert!(headers.contains(&json!(["authorization", "Bearer fixture-key"])));
                }
                let request: Value = serde_json::from_slice(
                    &STANDARD
                        .decode(params["initial"].as_str().unwrap())
                        .unwrap(),
                )
                .unwrap();
                assert_eq!(request["model"], "fixture-model");
                let child = !offers(&request, "goal_report");
                if self.endpoint == GATEWAY {
                    for tool in request["tools"].as_array().into_iter().flatten() {
                        let name = tool["function"]["name"].as_str().unwrap();
                        assert!(
                            [
                                "goal_inspect",
                                "goal_report",
                                "delegate_review",
                                "collect_review",
                                "config_inspect",
                                "question",
                                "question_async"
                            ]
                            .contains(&name),
                            "unqualified billed lane: {name}"
                        );
                    }
                }
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
                let mut body = fixture_body(reply, ProviderProtocol::OpenAiCompatible);
                let request_id = format!("req_budget_{}", self.dispatches.len());
                if self.endpoint == GATEWAY {
                    body = body.split("\n\n").map(|part| {
                        if let Some(data) = part.strip_prefix("data: ")
                            && let Ok(mut frame) = serde_json::from_str::<Value>(data)
                            && !frame["choices"][0]["finish_reason"].is_null()
                        {
                            frame["grida_billing"] = json!({"version":1,"request_id":request_id,"status":"settled","charged_mills":"0.25"});
                            return format!("data: {frame}");
                        }
                        part.to_owned()
                    }).collect::<Vec<_>>().join("\n\n");
                }
                stream.chunk = Some(STANDARD.encode(body));
                self.dispatches.push(stream.request.clone());
                if self.endpoint == GATEWAY {
                    json!({"status":"ready","httpStatus":200,"requestId":request_id})
                } else {
                    json!({"status":"ready","httpStatus":200})
                }
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
        if self.endpoint == GATEWAY {
            request["maxCostMills"] = "7".into();
        }
        let accepted = self.request("_co.grida/goal/start", request.clone()).await;
        assert_eq!(accepted["inputId"], "funded-goal");
        (session, request, child)
    }
}

#[tokio::test]
async fn rejected_goal_admission_cannot_publish_or_change_spending_authority() {
    let root = TempDir::new().unwrap();
    let directory = root.path().canonicalize().unwrap();
    let state = directory.join("state");
    let workspace = directory.join("workspace");
    std::fs::create_dir(&workspace).unwrap();
    let mut worker = Worker::open(&state, &directory, GATEWAY).await;
    let created = worker
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = created["sessionId"].as_str().unwrap().to_owned();
    worker.parent = session.clone();
    let mut start = json!({
        "sessionId":session,"inputId":"funded-goal","effort":"ultra","operatingRegime":"act",
        "prompt":[{"type":"text","text":"Review the export."}],"maxCostMills":"7",
        "goal":{"objective":{"description":"Review the export","criteria":["Export reviewed"]},
            "allowance":{"work_turns":1,"inference_steps":2},"automatic":false},
    });
    let rejected = worker
        .client
        .request("_co.grida/goal/start", start.clone())
        .await;
    assert!(
        rejected
            .to_string()
            .contains("goal_child_allowance_unavailable"),
        "{rejected}"
    );
    assert!(!state.join("task-spending").exists());
    start["goal"]["allowance"]["inference_steps"] = 7.into();
    start["goal"]["named_child"] = "missing-child".into();
    let rejected = worker
        .client
        .request("_co.grida/goal/start", start.clone())
        .await;
    assert!(
        rejected
            .to_string()
            .contains("goal_named_child_unavailable"),
        "{rejected}"
    );
    assert!(!state.join("task-spending").exists());
    assert!(worker.dispatches.is_empty());
    start["goal"].as_object_mut().unwrap().remove("named_child");
    let accepted = worker.request("_co.grida/goal/start", start).await;
    assert_eq!(accepted["inputId"], "funded-goal");
    let goal = worker
        .wait(
            "_co.grida/goal/inspect",
            json!({"sessionId":session}),
            |view| view["goal"]["spent"]["inference_steps"] == 5,
        )
        .await;
    assert_eq!(
        goal["goal"]["spending"]["perRequestMaxCostMills"], "1",
        "{goal}"
    );
    assert_eq!(goal["goal"]["spending"]["chargedMills"], "1.25", "{goal}");
    worker
        .wait(
            "_co.grida/session/snapshot",
            json!({"sessionId":session}),
            |view| view["current"].is_null(),
        )
        .await;
    assert_eq!(worker.dispatches.len(), 5);
    worker.client.close().await;
}

#[tokio::test]
async fn failed_spending_publication_keeps_accepted_input_fail_closed_on_retry() {
    let root = TempDir::new().unwrap();
    let directory = root.path().canonicalize().unwrap();
    let state = directory.join("state");
    let workspace = directory.join("workspace");
    std::fs::create_dir(&workspace).unwrap();
    let mut worker = Worker::open(&state, &directory, GATEWAY).await;
    let created = worker
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = created["sessionId"].as_str().unwrap().to_owned();
    worker.parent = session.clone();
    let start = json!({
        "sessionId":session,"inputId":"funded-goal","effort":"ultra","operatingRegime":"act",
        "prompt":[{"type":"text","text":"Review the export."}],"maxCostMills":"7",
        "goal":{"objective":{"description":"Review the export","criteria":["Export reviewed"]},
            "allowance":{"work_turns":1,"inference_steps":7},"automatic":false},
    });
    // A real private-state publication error occurs after durable acceptance.
    // Removing its cause cannot turn an accepted retry into fresh authority.
    std::fs::write(state.join("task-spending"), b"publication unavailable").unwrap();
    let rejected = worker
        .client
        .request("_co.grida/goal/start", start.clone())
        .await;
    assert!(
        rejected
            .to_string()
            .contains("goal_spending_publication_unconfirmed"),
        "{rejected}"
    );
    let captured = worker
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"funded-goal"}),
        )
        .await;
    assert_eq!(captured["settings"]["goalMaxCostMills"], "7", "{captured}");
    std::fs::remove_file(state.join("task-spending")).unwrap();
    let retry = worker.client.request("_co.grida/goal/start", start).await;
    assert!(retry.get("error").is_some(), "{retry}");
    assert_eq!(
        std::fs::read_dir(state.join("task-spending"))
            .unwrap()
            .count(),
        0
    );
    assert!(worker.dispatches.is_empty());
    worker.client.close().await;
}

#[tokio::test]
async fn gateway_goal_spending_is_shared_by_parent_and_review_and_retained_after_restart() {
    for named in [false, true] {
        let root = TempDir::new().unwrap();
        let directory = root.path().canonicalize().unwrap();
        let state = directory.join("state");
        let workspace = directory.join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        let mut worker = Worker::open(&state, &directory, GATEWAY).await;
        let (session, start, _) = worker.start(&workspace, named, "act").await;
        let captured = worker
            .request(
                "_co.grida/session/input",
                json!({"sessionId":session,"inputId":"funded-goal"}),
            )
            .await;
        assert_eq!(captured["settings"]["goalMaxCostMills"], "7", "{captured}");
        let goal = worker
            .wait(
                "_co.grida/goal/inspect",
                json!({"sessionId":session}),
                |view| view["goal"]["spent"]["inference_steps"] == 5,
            )
            .await;
        let budget = json!({
            "maxCostMills":"7", "perRequestMaxCostMills":"1", "chargedMills":"1.25",
            "heldMills":"0", "remainingMills":"5.75", "unsettledAttempts":0,
        });
        assert_eq!(goal["goal"]["spending"], budget, "{goal}");
        assert_eq!(worker.dispatches.len(), 5);
        worker
            .wait(
                "_co.grida/session/snapshot",
                json!({"sessionId":session}),
                |view| view["current"].is_null(),
            )
            .await;
        worker.client.close().await;

        let mut reopened = Worker::open(&state, &directory, GATEWAY).await;
        reopened
            .request(
                "session/load",
                json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
            )
            .await;
        let retained = reopened
            .request("_co.grida/goal/inspect", json!({"sessionId":session}))
            .await;
        let captured = reopened
            .request(
                "_co.grida/session/input",
                json!({"sessionId":session,"inputId":"funded-goal"}),
            )
            .await;
        assert_eq!(captured["settings"]["goalMaxCostMills"], "7", "{captured}");
        assert_eq!(retained["goal"]["spending"], budget);
        let retry = reopened
            .request("_co.grida/goal/start", start.clone())
            .await;
        assert_eq!(retry["disposition"], "completed", "{retry}");
        assert!(reopened.dispatches.is_empty());

        // A missing authority record must never be recreated by an exact
        // start retry, which would erase already charged and held partitions.
        let owners = std::fs::read_dir(state.join("task-spending"))
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();
        assert_eq!(owners.len(), 1);
        for entry in std::fs::read_dir(&owners[0]).unwrap() {
            std::fs::remove_file(entry.unwrap().path()).unwrap();
        }
        let missing = reopened.client.request("_co.grida/goal/start", start).await;
        assert!(missing.get("error").is_some(), "{missing}");
        assert_eq!(std::fs::read_dir(&owners[0]).unwrap().count(), 0);
        assert!(reopened.dispatches.is_empty());
        reopened.client.close().await;
    }
}

#[tokio::test]
async fn gateway_goal_spending_keeps_parent_and_child_holds_after_stop_and_restart() {
    let root = TempDir::new().unwrap();
    let directory = root.path().canonicalize().unwrap();
    let state = directory.join("state");
    let workspace = directory.join("workspace");
    std::fs::create_dir(&workspace).unwrap();
    let mut worker = Worker::open(&state, &directory, GATEWAY).await;
    worker.hold = true;
    let (session, _, _) = worker.start(&workspace, false, "act").await;
    worker.wait_held(&session).await;
    let select = json!({"sessionId":session});
    let snapshot = worker
        .request("_co.grida/session/snapshot", select.clone())
        .await;
    let turn = snapshot["current"]["turnId"].clone();
    worker
        .request(
            "_co.grida/session/stop",
            task_basis(&snapshot, &session, "stop-budgeted-work"),
        )
        .await;
    worker
        .wait("_co.grida/session/snapshot", select.clone(), |view| {
            view["current"].is_null()
        })
        .await;
    let goal = worker
        .request("_co.grida/goal/inspect", select.clone())
        .await;
    assert_eq!(goal["goal"]["spending"]["heldMills"], "2", "{goal}");
    assert_eq!(goal["goal"]["spending"]["chargedMills"], "0.25", "{goal}");
    assert_eq!(goal["goal"]["spending"]["unsettledAttempts"], 2, "{goal}");
    worker.client.close().await;
    let mut reopened = Worker::open(&state, &directory, GATEWAY).await;
    reopened
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
        )
        .await;
    let retained = reopened.request("_co.grida/goal/inspect", select).await;
    assert_eq!(retained["goal"]["spending"], goal["goal"]["spending"]);
    assert!(reopened.dispatches.is_empty());
    let summary = reopened
        .request(
            "_co.grida/session/turn-summary",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    let forged = reopened.request("_co.grida/gateway/billing-status", json!({"sessionId":session,"turnId":turn,"operationId":"unrecorded","attemptId":"unrecorded"})).await;
    assert_eq!(forged, json!({"kind":"unavailable"}));
    let unchanged = reopened
        .request("_co.grida/goal/inspect", json!({"sessionId":session}))
        .await;
    assert_eq!(unchanged["goal"]["spending"], retained["goal"]["spending"]);
    let billing = &summary["gatewayBilling"];
    let mut refreshed = 0;
    for attempt in billing["attempts"]
        .as_array()
        .unwrap()
        .iter()
        .chain(billing["review"]["attempts"].as_array().unwrap())
        .filter(|attempt| attempt["kind"] != "settled")
    {
        assert_eq!(attempt["refreshable"], true, "{summary}");
        let refresh = json!({"sessionId":session,"turnId":turn,"operationId":attempt["operationId"],"attemptId":attempt["attemptId"]});
        for _ in 0..2 {
            let settled = reopened
                .request("_co.grida/gateway/billing-status", refresh.clone())
                .await;
            assert_eq!(settled, json!({"kind":"settled","chargedMills":"0.25"}));
        }
        refreshed += 1;
    }
    assert_eq!(refreshed, 2, "{summary}");
    let reconciled = reopened
        .request("_co.grida/goal/inspect", json!({"sessionId":session}))
        .await;
    assert_eq!(
        reconciled["goal"]["spending"]["heldMills"], "0",
        "{reconciled}"
    );
    assert_eq!(
        reconciled["goal"]["spending"]["chargedMills"], "0.75",
        "{reconciled}"
    );
    assert_eq!(
        reconciled["goal"]["spending"]["remainingMills"], "6.25",
        "{reconciled}"
    );
    assert!(reopened.dispatches.is_empty());
    reopened.client.close().await;
}

#[tokio::test]
#[ignore = "requires GRIDA_AGENT_PRE_TASK_POLICY_BIN pointing to a reviewed task-policy-unsupported worker"]
async fn previous_worker_cannot_resume_a_capped_goal_or_its_review_without_enforcing_spend() {
    async fn read_without_dispatch(
        client: &mut PrivateStdio,
        method: &str,
        params: Value,
    ) -> Value {
        let id = client.send(method, params).await;
        loop {
            let frame = client.read_frame().await;
            assert_ne!(
                frame["method"], "_co.grida/provider/exchange",
                "old worker attempted uncapped work"
            );
            if frame["id"] == id {
                return frame;
            }
        }
    }
    let binary = std::env::var("GRIDA_AGENT_PRE_TASK_POLICY_BIN").unwrap();
    let root = TempDir::new().unwrap();
    let directory = root.path().canonicalize().unwrap();
    let state = directory.join("state");
    let workspace = directory.join("workspace");
    std::fs::create_dir(&workspace).unwrap();
    let mut worker = Worker::open(&state, &directory, GATEWAY).await;
    worker.hold = true;
    let (session, mut start, _) = worker.start(&workspace, false, "act").await;
    worker.wait_held(&session).await;
    let select = json!({"sessionId":session});
    let snapshot = worker
        .request("_co.grida/session/snapshot", select.clone())
        .await;
    worker
        .request(
            "_co.grida/session/pause",
            task_basis(&snapshot, &session, "pause-capped-work"),
        )
        .await;
    worker
        .wait("_co.grida/session/snapshot", select.clone(), |view| {
            view["current"]["disposition"] == "suspended"
        })
        .await;
    let owner = std::fs::read_dir(state.join("task-spending"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let ledger = std::fs::read_dir(owner)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let before = std::fs::read(&ledger).unwrap();
    worker.client.close().await;

    let process = Command::new(binary)
        .kill_on_drop(true)
        .args([
            "serve",
            "--stdio",
            "--subagents",
            "--supervised-provider",
            "--state-dir",
        ])
        .arg(&state)
        .args([
            "--supervised-gateway-scope",
            &"a".repeat(64),
            "--endpoint",
            GATEWAY,
            "--model",
            "fixture-model",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut previous = PrivateStdio::from_child(process);
    let mut initialize = extension_initialize();
    for capability in [
        "provider/egress",
        "session/effort",
        "goal/start",
        "goal/inspect",
        "goal/control",
        "goal/recover",
        "goal/funded-review",
        "goal/spending",
    ] {
        initialize["clientCapabilities"]["_meta"][format!("co.grida/{capability}")] = 1.into();
    }
    let ready = read_without_dispatch(&mut previous, "initialize", initialize).await;
    assert!(ready["result"]["agentCapabilities"]["_meta"]["co.grida/goal/spending"].is_null());
    let loaded = read_without_dispatch(
        &mut previous,
        "session/load",
        json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    start.as_object_mut().unwrap().remove("maxCostMills");
    let retry = read_without_dispatch(&mut previous, "_co.grida/goal/start", start).await;
    assert_eq!(retry["error"]["data"], "input_identity_reused", "{retry}");
    let snapshot =
        read_without_dispatch(&mut previous, "_co.grida/session/snapshot", select.clone()).await;
    read_without_dispatch(
        &mut previous,
        "_co.grida/session/resume",
        task_basis(&snapshot["result"], &session, "old-resume-capped-work"),
    )
    .await;
    for _ in 0..5 {
        read_without_dispatch(&mut previous, "_co.grida/goal/recover", select.clone()).await;
        read_without_dispatch(&mut previous, "_co.grida/session/snapshot", select.clone()).await;
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert_eq!(std::fs::read(&ledger).unwrap(), before);
    previous.close().await;
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
