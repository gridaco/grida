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

pub(super) fn input_limit(state: &Path, tokens: u64) {
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

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod subscription_history {
    use super::super::approvals::{Fixture, Stdio as PrivateStdio};
    use super::super::prediction::{ECONOMY_MODEL, ECONOMY_ROUTE};
    use super::*;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use std::collections::{BTreeMap, VecDeque};

    const FIRST: &str = "openai/gpt-5.6-sol";
    const SECOND: &str = "openai/gpt-5.6-terra";
    const ENDPOINT: &str = "https://chatgpt.com/backend-api/codex";
    const LAUNCH_ROUTE: &str = "419bdebf-c5bd-4bc9-aa5b-371e578a984f";
    const ALTERNATE_ENDPOINT: &str = "http://127.0.0.1:2/v1";

    struct Exchange {
        body: Vec<u8>,
        response: Option<String>,
        held: bool,
    }

    /// The product executable's private supervisor: all provider bytes stay
    /// on stdio and every response is synthetic.
    struct Worker {
        client: PrivateStdio,
        model: String,
        protocol: ProviderProtocol,
        endpoint: &'static str,
        alternate_route: Option<String>,
        alternate_account: Option<char>,
        catalog_route: Option<Value>,
        retained_resolutions: Vec<Value>,
        prediction_route: Option<(Value, Option<Value>)>,
        // Saved named key and expected synthetic authorization for the alternate HTTP route.
        alternate_key: Option<(std::path::PathBuf, &'static str)>,
        replies: VecDeque<Reply>,
        exchanges: BTreeMap<String, Exchange>,
        requests: Vec<Value>,
        cancelled: usize,
        updates: Vec<Value>,
    }

    impl Worker {
        async fn open(fixture: &Fixture, model: &str, owner: char, replies: Vec<Reply>) -> Self {
            Self::open_route(fixture, model, Some(owner), replies).await
        }

        async fn open_route(
            fixture: &Fixture,
            model: &str,
            owner: Option<char>,
            replies: Vec<Reply>,
        ) -> Self {
            Self::start(fixture, model, owner, replies, &[]).await
        }

        async fn start(
            fixture: &Fixture,
            model: &str,
            owner: Option<char>,
            replies: Vec<Reply>,
            capabilities: &[&str],
        ) -> Self {
            let protocol = if owner.is_some() {
                ProviderProtocol::Responses
            } else {
                ProviderProtocol::OpenAiCompatible
            };
            let endpoint = if owner.is_some() {
                ENDPOINT
            } else {
                "http://127.0.0.1:1/v1"
            };
            let mut command = executable();
            command
                .args([
                    "serve",
                    "--stdio",
                    "--subagents",
                    "--supervised-provider",
                    "--provider",
                    protocol.as_str(),
                ])
                .arg("--state-dir")
                .arg(&fixture.state)
                .args(["--endpoint", endpoint, "--model", model]);
            if let Some(owner) = owner {
                command
                    .arg("--supervised-chatgpt-scope")
                    .arg(owner.to_string().repeat(64));
            }
            let child = command
                .arg("--permission-profile")
                .arg(&fixture.profile)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            let mut worker = Self {
                client: PrivateStdio::from_child(child),
                model: model.into(),
                protocol,
                endpoint,
                alternate_route: capabilities
                    .contains(&"provider/routes")
                    .then(|| uuid::Uuid::new_v4().to_string()),
                alternate_account: None,
                catalog_route: None,
                retained_resolutions: Vec::new(),
                prediction_route: None,
                alternate_key: None,
                replies: replies.into(),
                exchanges: BTreeMap::new(),
                requests: Vec::new(),
                cancelled: 0,
                updates: Vec::new(),
            };
            let mut initialize = extension_initialize();
            for capability in [
                "provider/egress",
                "session/effort",
                "session/turn-summary",
                "goal/start",
                "goal/inspect",
                "goal/recover",
                "session/model-change",
                "session/selected-image",
                "session/input-image-chunks",
                "goal/funded-review",
                "goal/named-child",
                "goal/confirm-completion",
            ]
            .into_iter()
            .chain(capabilities.iter().copied())
            {
                initialize["clientCapabilities"]["_meta"][format!("co.grida/{capability}")] =
                    1.into();
            }
            let ready = worker.request("initialize", initialize).await;
            assert_eq!(ready["result"]["protocolVersion"], 1, "{ready}");
            assert_eq!(
                ready["result"]["agentCapabilities"]["_meta"]["co.grida/session/effort"], 1,
                "{ready}"
            );
            if worker.alternate_route.is_none() {
                assert!(
                    ready["result"]["agentCapabilities"]["_meta"]["co.grida/goal/spending"]
                        .is_null()
                );
            } else {
                assert_eq!(
                    ready["result"]["agentCapabilities"]["_meta"]["co.grida/provider/routes"],
                    1
                );
            }
            worker
        }

        async fn request(&mut self, method: &str, params: Value) -> Value {
            let id = self.client.send(method, params).await;
            loop {
                let frame = self.client.read_frame().await;
                if frame["method"].is_null() && frame["id"] == id {
                    return frame;
                }
                self.on_frame(frame).await;
            }
        }

        async fn on_frame(&mut self, frame: Value) {
            match frame["method"].as_str() {
                Some("_co.grida/provider/resolve") if !frame["params"]["purpose"].is_null() => {
                    let (expected, route) = self
                        .prediction_route
                        .as_ref()
                        .expect("prediction routing was offered");
                    assert_eq!(&frame["params"], expected, "{frame}");
                    if let Some(route) = route {
                        self.client.respond(&frame["id"], route.clone()).await;
                    } else {
                        self.client
                            .reject(&frame["id"], "prediction_model_unavailable")
                            .await;
                    }
                }
                Some("_co.grida/provider/resolve") => {
                    let model = frame["params"]["model"].as_str().unwrap();
                    let route_id = self
                        .alternate_route
                        .as_ref()
                        .expect("negotiated provider routes");
                    if frame["params"]["retainedWireModel"].is_string() {
                        assert!(frame["params"]["retainedImageInput"].is_boolean());
                        self.retained_resolutions.push(frame["params"].clone());
                    } else {
                        assert!(frame["params"].get("retainedImageInput").is_none());
                        assert!(frame["params"].get("retainedSpeed").is_none());
                    }
                    let route = match model {
                        model
                            if self
                                .catalog_route
                                .as_ref()
                                .is_some_and(|r| r["model"] == model) =>
                        {
                            let mut route = self.catalog_route.clone().unwrap();
                            route["routeId"] = json!(route_id);
                            route
                        }
                        "fixture-a" | "openai/gpt-6.1-sol" => {
                            json!({"kind":"launch","routeId":LAUNCH_ROUTE,"model":model})
                        }
                        "fixture-b" => {
                            let mut route = json!({"kind":"http","routeId":route_id,"model":model,
                            "endpoint":ALTERNATE_ENDPOINT,"protocol":"openai-compatible"});
                            if let Some((home, _)) = &self.alternate_key {
                                route["credentialHome"] = json!(home);
                                route["configuredEndpointKey"] = json!("fixture-byok");
                            }
                            route
                        }
                        SECOND => {
                            json!({"kind":"chatgpt","routeId":route_id,"model":model,
                            "endpoint":ENDPOINT,"scope":self.alternate_account.unwrap().to_string().repeat(64)})
                        }
                        _ => panic!("unexpected model resolution {frame}"),
                    };
                    self.client.respond(&frame["id"], route).await;
                }
                Some("_co.grida/provider/turnCapabilities") => {
                    let expected = match frame["params"]["routeId"].as_str() {
                        Some(route) if Some(route) == self.alternate_route.as_deref() => self
                            .catalog_route
                            .as_ref()
                            .and_then(|r| r["model"].as_str())
                            .unwrap_or(SECOND),
                        None | Some(LAUNCH_ROUTE) => &self.model,
                        _ => panic!("unexpected capability route {frame}"),
                    };
                    assert_eq!(frame["params"]["model"], expected);
                    self.client
                        .respond(
                            &frame["id"],
                            json!({"status":"available","speeds":["fast"],"webSearch":true}),
                        )
                        .await;
                }
                Some("_co.grida/provider/exchange") => self.exchange(frame).await,
                Some("_co.grida/provider/cancel") => {
                    self.cancelled += 1;
                    self.exchanges
                        .remove(frame["params"]["id"].as_str().unwrap());
                }
                Some("session/update") => self.updates.push(frame["params"].clone()),
                _ => {}
            }
        }

        async fn exchange(&mut self, frame: Value) {
            let params = &frame["params"];
            let id = params["id"].as_str().unwrap().to_owned();
            let catalog_route = self.catalog_route.as_ref().filter(|_| {
                self.alternate_route
                    .as_ref()
                    .is_some_and(|id| params["routeId"] == id.as_str())
            });
            let (model, endpoint) = match params["routeId"].as_str() {
                None | Some(LAUNCH_ROUTE) => (self.model.as_str(), self.endpoint),
                Some(ECONOMY_ROUTE) => (ECONOMY_MODEL, ENDPOINT),
                Some(_) if catalog_route.is_some() => {
                    let descriptor = catalog_route.unwrap();
                    (
                        descriptor["wireModel"].as_str().unwrap(),
                        descriptor["endpoint"].as_str().unwrap(),
                    )
                }
                Some(id)
                    if Some(id) == self.alternate_route.as_deref()
                        && self.alternate_account.is_some() =>
                {
                    (SECOND, ENDPOINT)
                }
                Some(id) if Some(id) == self.alternate_route.as_deref() => {
                    ("fixture-b", ALTERNATE_ENDPOINT)
                }
                Some(route) => panic!("unexpected exchange route {route}"),
            };
            let reply = match params["action"].as_str().unwrap() {
                "open" => {
                    let path = if self.protocol == ProviderProtocol::Responses {
                        "responses"
                    } else {
                        "chat/completions"
                    };
                    assert_eq!(params["target"], format!("{endpoint}/{path}"));
                    let expected_bearer = self
                        .alternate_key
                        .as_ref()
                        .filter(|_| endpoint == ALTERNATE_ENDPOINT || catalog_route.is_some())
                        .map(|(_, key)| format!("Bearer {key}"));
                    let headers = params["headers"].as_array().unwrap();
                    assert_eq!(headers.len(), 2 + usize::from(expected_bearer.is_some()));
                    let mut headers: BTreeMap<_, _> = headers
                        .iter()
                        .map(|header| (header[0].as_str().unwrap(), header[1].as_str().unwrap()))
                        .collect();
                    assert!(headers.remove("content-type").is_some());
                    assert!(headers.remove("accept").is_some());
                    assert_eq!(headers.remove("authorization"), expected_bearer.as_deref());
                    assert!(headers.is_empty());
                    self.exchanges.insert(
                        id,
                        Exchange {
                            body: STANDARD
                                .decode(params["initial"].as_str().unwrap())
                                .unwrap(),
                            response: None,
                            held: false,
                        },
                    );
                    json!({"status":"accepted"})
                }
                "append" => {
                    self.exchanges
                        .get_mut(&id)
                        .unwrap()
                        .body
                        .extend(STANDARD.decode(params["data"].as_str().unwrap()).unwrap());
                    json!({"status":"accepted"})
                }
                "dispatch" => {
                    let exchange = self.exchanges.get_mut(&id).unwrap();
                    let request: Value = serde_json::from_slice(&exchange.body).unwrap();
                    let model = if self.protocol == ProviderProtocol::Responses
                        && catalog_route.is_none()
                    {
                        model.strip_prefix("openai/").unwrap()
                    } else {
                        model
                    };
                    assert_eq!(request["model"], model);
                    assert_eq!(request["stream"], true);
                    if self.protocol == ProviderProtocol::Responses {
                        assert_eq!(request["store"], false);
                        assert!(request.get("max_output_tokens").is_none());
                    }
                    let mut response = self
                        .replies
                        .pop_front()
                        .expect("only scripted provider work");
                    while let Reply::Choose(choose) = response {
                        response = choose(&request);
                    }
                    exchange.held = matches!(response, Reply::Hold(_));
                    self.requests.push(request);
                    exchange.response = Some(fixture_body(response, self.protocol).replace(
                        "retained-private-reasoning",
                        &format!("private-{}", self.model),
                    ));
                    json!({"status":"ready","httpStatus":200,"requestId":"fixture-subscription","retryAfterMs":null})
                }
                "read" => match self.exchanges.get_mut(&id).unwrap().response.take() {
                    Some(body) => json!({"status":"chunk","data":STANDARD.encode(body)}),
                    None => {
                        if self.exchanges.get(&id).unwrap().held {
                            return;
                        }
                        self.exchanges.remove(&id);
                        json!({"status":"end"})
                    }
                },
                _ => panic!("unexpected provider exchange {frame}"),
            };
            self.client.respond(&frame["id"], reply).await;
        }

        async fn pause_dispatched(&mut self, session: &str, turn: &str) -> Value {
            use super::super::lifecycle::task_basis;
            while self.requests.is_empty() {
                let frame = self.client.read_frame().await;
                self.on_frame(frame).await;
            }
            let current = self
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            let paused = self
                .request(
                    "_co.grida/session/pause",
                    task_basis(&current["result"], session, "pause"),
                )
                .await;
            assert_eq!(paused["result"]["turnId"], turn, "{paused}");
            self.wait_for_snapshot(session, |view| {
                view["current"]["disposition"] == "suspended"
            })
            .await
        }

        async fn prompt(&mut self, session: &str, text: &str) {
            let result = self
                .request(
                    "session/prompt",
                    json!({
                        "sessionId":session,"prompt":[{"type":"text","text":text}],
                    }),
                )
                .await;
            assert_eq!(result["result"]["stopReason"], "end_turn", "{result}");
        }

        async fn load(&mut self, fixture: &Fixture, session: &str) {
            let result = self
                .request(
                    "session/load",
                    json!({
                        "sessionId":session,"cwd":fixture.primary,"mcpServers":[],
                    }),
                )
                .await;
            assert!(result.get("error").is_none(), "{result}");
        }

        async fn close(self) {
            assert!(self.replies.is_empty());
            self.client.close().await;
        }

        async fn idle(&mut self, session: &str) -> Value {
            self.wait_for_snapshot(session, |view| {
                view["current"].is_null() && view["latest"].is_object()
            })
            .await
        }

        async fn wait_for_snapshot(
            &mut self,
            session: &str,
            ready: impl Fn(&Value) -> bool,
        ) -> Value {
            timeout(WAIT, async {
                loop {
                    let view = self
                        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                        .await;
                    assert!(view.get("error").is_none(), "{view}");
                    if ready(&view["result"]) {
                        break view["result"].clone();
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap()
        }
    }

    #[tokio::test]
    async fn a_side_chat_reports_the_image_capability_of_the_route_it_inherited() {
        let fixture = Fixture::new(false);
        let vision_model = "openai/gpt-6.1-sol";
        let mut worker = Worker::start(
            &fixture,
            vision_model,
            Some('a'),
            vec![],
            &[
                "provider/routes",
                "session/selection",
                "side-chat/open",
                "side-chat/close",
            ],
        )
        .await;
        let parent = "side-image-route";
        let selection = |model: &str| json!({"connectionId":null,"model":model,"effort":"medium"});
        let create = worker.request("_co.grida/session/selection/create", json!({
            "cwd":fixture.primary,"sessionId":parent,"requestId":"create","selection":selection("fixture-b")
        })).await;
        assert_eq!(create["result"]["revision"], 1, "{create}");
        worker.load(&fixture, parent).await;
        let open = |id: &str| json!({"sessionId":parent,"requestId":id});
        let text = worker
            .request("_co.grida/side-chat/open", open("text"))
            .await;
        assert_eq!(text["result"]["imageInput"], false, "{text}");
        let update = worker.request("_co.grida/session/selection/update", json!({
            "cwd":fixture.primary,"sessionId":parent,"expectedRevision":1,"operationId":"vision","selection":selection(vision_model)
        })).await;
        assert_eq!(update["result"]["revision"], 2, "{update}");
        let vision = worker
            .request("_co.grida/side-chat/open", open("vision"))
            .await;
        assert_eq!(vision["result"]["imageInput"], true, "{vision}");
        let again = worker
            .request("_co.grida/side-chat/open", open("text"))
            .await;
        assert_eq!(again["result"], text["result"]);
        assert!(worker.requests.is_empty());
        worker.close().await;
    }

    #[tokio::test]
    async fn revising_a_side_message_uses_its_inherited_route_after_the_parent_changes_model() {
        let fixture = Fixture::new(false);
        let mut worker = Worker::start(
            &fixture,
            "fixture-a",
            None,
            vec![
                Reply::Finished("First answer"),
                Reply::Finished("Edited answer"),
            ],
            &[
                "provider/routes",
                "session/selection",
                "side-chat/open",
                "side-chat/close",
                "subagent/create",
            ],
        )
        .await;
        let parent = "side-revision-route";
        let selection = |model: &str| json!({"connectionId":null,"model":model,"effort":"medium"});
        let created = worker.request("_co.grida/session/selection/create", json!({
            "cwd":fixture.primary,"sessionId":parent,"requestId":"create","selection":selection("fixture-b")
        })).await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        worker.load(&fixture, parent).await;
        let opened = worker
            .request("_co.grida/side-chat/open", json!({"sessionId":parent}))
            .await;
        let side = opened["result"]["sideChatId"].as_str().unwrap();
        let update = worker.request("_co.grida/session/selection/update", json!({
            "cwd":fixture.primary,"sessionId":parent,"expectedRevision":1,"operationId":"switch","selection":selection("fixture-a")
        })).await;
        assert_eq!(update["result"]["revision"], 2, "{update}");
        let submitted = worker
            .request(
                "_co.grida/session/submit",
                super::super::lifecycle::prompt_request(side, "original", "Side question"),
            )
            .await;
        assert_eq!(submitted["result"]["inputId"], "original", "{submitted}");
        let before = worker.idle(side).await;
        let history = worker
            .request("_co.grida/session/history", json!({"sessionId":side}))
            .await;
        let history = &history["result"];
        let revised = worker.request("_co.grida/session/revise", json!({
            "sessionId":side,"requestId":"edit","replacementInputId":"edited",
            "expectedSessionRevision":history["sessionRevision"],"expectedHistory":history["basis"],
            "anchor":history["messages"][0]["anchor"],"prompt":[{"type":"text","text":"Edited question"}]
        })).await;
        assert_eq!(revised["result"]["sessionId"], side, "{revised}");
        let edited = worker
            .wait_for_snapshot(side, |view| {
                view["current"].is_null()
                    && view["latest"]["status"].is_string()
                    && view["latest"]["turnId"] != before["latest"]["turnId"]
            })
            .await;
        assert_eq!(edited["latest"]["status"], "succeeded", "{edited}");
        assert_eq!(worker.requests.len(), 2);
        assert!(
            worker
                .requests
                .iter()
                .all(|request| request["model"] == "fixture-b")
        );
        let nested = worker
            .request("_co.grida/side-chat/open", json!({"sessionId":side}))
            .await;
        assert_eq!(
            nested["error"]["data"], "side_chat_nested_unavailable",
            "{nested}"
        );
        let child = worker
            .request(
                "_co.grida/subagent/create",
                json!({
                    "parentSessionId":side,"requestId":"child","name":"Reader","workTurns":1
                }),
            )
            .await;
        assert_eq!(
            child["error"]["data"], "side_chat_subagents_unavailable",
            "{child}"
        );
        worker.close().await;
    }

    #[tokio::test]
    async fn optional_library_selection_on_a_text_route_accepts_and_replays_the_prompt() {
        use super::super::lifecycle::prompt_request;

        let fixture = Fixture::new(false);
        let mut worker = Worker::start(
            &fixture,
            "fixture-a",
            None,
            vec![Reply::Finished("Text answer")],
            &[
                "provider/routes",
                "session/selection",
                "session/library-selections",
                "session/answer-library-selection",
            ],
        )
        .await;
        let session = "text-route-library";
        let created = worker
            .request(
                "_co.grida/session/selection/create",
                json!({
                    "cwd":fixture.primary,"sessionId":session,"requestId":"create",
                    "selection":{"connectionId":null,"model":"fixture-b","effort":"medium"}
                }),
            )
            .await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        worker.load(&fixture, session).await;

        let mut prompt = prompt_request(session, "text", "Hello");
        prompt["_meta"] = json!({"co.grida/selectionRevision":1});
        prompt["allowLibrarySelection"] = true.into();
        let accepted = worker
            .request("_co.grida/session/submit", prompt.clone())
            .await;
        assert_eq!(accepted["result"]["inputId"], "text", "{accepted}");
        let settled = worker.idle(session).await;
        assert_eq!(settled["latest"]["status"], "succeeded", "{settled}");
        let replay = worker
            .request("_co.grida/session/submit", prompt.clone())
            .await;
        assert_eq!(replay["result"]["inputId"], "text", "{replay}");
        assert_eq!(worker.requests.len(), 1);
        let request = &worker.requests[0];
        assert_eq!(request["model"], "fixture-b");
        assert!(
            !request["tools"]
                .as_array()
                .unwrap()
                .iter()
                .any(|tool| tool["function"]["name"] == "design_search")
        );
        prompt["allowLibrarySelection"] = false.into();
        let changed = worker.request("_co.grida/session/submit", prompt).await;
        assert_eq!(
            changed["error"]["data"], "submission_library_selection_changed",
            "{changed}"
        );
        worker.close().await;
    }

    #[tokio::test]
    #[ignore = "requires the current native helper and working Seatbelt or bubblewrap"]
    async fn running_and_queued_turns_keep_the_model_and_permissions_they_were_accepted_with() {
        use super::super::{full_access, lifecycle::prompt_request};

        let fixture = full_access::fixture(true);
        let mut worker = Worker::start(
            &fixture,
            "fixture-a",
            None,
            vec![
                Reply::Tool(
                    "exec_command",
                    r#"{"cmd":"printf captured","access":"read_write"}"#,
                ),
                Reply::Finished("First answer"),
                Reply::Finished("Second answer"),
                Reply::Finished("Third answer"),
            ],
            &[
                "provider/routes",
                "session/selection",
                "session/permission-mode",
                "session/transcript-window",
            ],
        )
        .await;
        let session = "live-settings";
        let select = |model: &str| json!({"connectionId":null,"model":model,"effort":"medium"});
        let input = |id: &str, text: &str, revision: u64| {
            let mut input = prompt_request(session, id, text);
            input["_meta"] = json!({"co.grida/selectionRevision":revision});
            input
        };
        let created = worker.request("_co.grida/session/selection/create", json!({
            "cwd":fixture.primary,"sessionId":session,"requestId":"create","selection":select("fixture-a")
        })).await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        worker.load(&fixture, session).await;

        // Keep the first response on the supervisor's side until both changes
        // are acknowledged. The provider may open before the submit receipt arrives.
        let id = worker
            .client
            .send("_co.grida/session/submit", input("first", "First input", 1))
            .await;
        let mut accepted = false;
        let mut first_read = None;
        while !accepted || first_read.is_none() {
            let frame = worker.client.read_frame().await;
            if frame["method"].is_null() && frame["id"] == id {
                assert_eq!(frame["result"]["inputId"], "first", "{frame}");
                accepted = true;
            } else if frame["method"] == "_co.grida/provider/exchange"
                && frame["params"]["action"] == "read"
            {
                first_read = Some(frame);
            } else {
                worker.on_frame(frame).await;
            }
        }
        let queued = worker
            .request(
                "_co.grida/session/enqueue",
                input("second", "Second input", 1),
            )
            .await;
        assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
        let model = worker.request("_co.grida/session/selection/update", json!({
            "cwd":fixture.primary,"sessionId":session,"expectedRevision":1,"operationId":"model-b","selection":select("fixture-b")
        })).await;
        assert_eq!(model["result"]["revision"], 2, "{model}");
        let permissions = worker.request("_co.grida/session/permission-mode/update", json!({
            "cwd":fixture.primary,"sessionId":session,"expectedRevision":0,"requestId":"allow-full","mode":"full_access"
        })).await;
        assert_eq!(
            permissions["result"]["mode"], "full_access",
            "{permissions}"
        );
        let queued = worker
            .request(
                "_co.grida/session/enqueue",
                input("third", "Third input", 2),
            )
            .await;
        assert_eq!(queued["result"]["disposition"], "queued", "{queued}");

        let captured = worker
            .request("_co.grida/session/snapshot", json!({"sessionId":session}))
            .await;
        assert_eq!(
            captured["result"]["current"]["modelId"], "fixture-a",
            "{captured}"
        );
        assert_eq!(
            captured["result"]["latest"]["modelId"], "fixture-a",
            "{captured}"
        );

        worker.exchange(first_read.unwrap()).await;
        let settled = worker
            .wait_for_snapshot(session, |view| {
                view["current"].is_null() && view["queuedInputs"] == 0 && view["latest"].is_object()
            })
            .await;
        assert_eq!(settled["latest"]["status"], "succeeded", "{settled}");
        assert_eq!(settled["latest"]["modelId"], "fixture-b", "{settled}");
        let attempts: Vec<_> = worker
            .requests
            .iter()
            .map(|request| {
                let command = request["tools"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|tool| &tool["function"])
                    .find(|tool| tool["name"] == "exec_command")
                    .unwrap();
                let full = command["description"]
                    .as_str()
                    .unwrap()
                    .contains("Full access was explicitly selected");
                (request["model"].as_str().unwrap(), full)
            })
            .collect();
        assert_eq!(
            attempts,
            [
                ("fixture-a", false),
                ("fixture-a", false),
                ("fixture-a", false),
                ("fixture-b", true)
            ]
        );
        let observed = full_access::last_tool(&worker.requests[1]);
        assert_eq!(
            observed["structured"]["completion"]["code"], 0,
            "{observed}"
        );
        assert!(
            matches!(
                observed["structured"]["backend"].as_str(),
                Some("seatbelt" | "bubblewrap")
            ),
            "{observed}"
        );

        worker.updates.clear();
        worker.load(&fixture, session).await;
        let transcript: Vec<_> = worker
            .updates
            .iter()
            .map(|notification| &notification["update"])
            .filter(|update| {
                matches!(
                    update["sessionUpdate"].as_str(),
                    Some("user_message_chunk" | "agent_message_chunk")
                )
            })
            .filter_map(|update| update["content"]["text"].as_str())
            .collect();
        assert_eq!(
            transcript,
            [
                "First input",
                "First answer",
                "Second input",
                "Second answer",
                "Third input",
                "Third answer"
            ]
        );
        let window = "co.grida/session/transcript-window";
        let page = worker.request("session/load",json!({"cwd":fixture.primary,"sessionId":session,"mcpServers":[],"_meta":{window:{"kind":"read","requestId":"captured-models"}}})).await;
        let turns = page["result"]["_meta"][window]["turns"].as_array().unwrap();
        let models: Vec<_> = turns
            .iter()
            .map(|turn| turn["modelId"].as_str().unwrap())
            .collect();
        assert_eq!(models, ["fixture-a", "fixture-a", "fixture-b"]);
        worker.close().await;
    }

    #[tokio::test]
    async fn subscription_search_streams_activity_then_restores_the_same_cited_answer() {
        use super::super::lifecycle::prompt_request;
        let fixture = Fixture::new(false);
        let model = "openai/gpt-6.1-sol";
        let capabilities = [
            "provider/routes",
            "provider/turn-capabilities",
            "session/selection",
            "session/updates",
            "session/transcript-window",
            "session/activity-order",
        ];
        let reply = Reply::ResponsesEvents(vec![
            json!({"type":"response.web_search_call.searching","item_id":"ws_1"}),
            json!({"type":"response.output_item.done","output_index":0,"item":{"type":"web_search_call","id":"ws_1","status":"completed","action":{"type":"search","query":"release date"}}}),
            json!({"type":"response.output_item.done","output_index":1,"item":{"type":"message","id":"msg_1","role":"assistant","status":"completed","phase":"final_answer","content":[{"type":"output_text","text":"Release notes","annotations":[{"type":"url_citation","url":"https://example.org/release","title":"Release notes","start_index":0,"end_index":7}]}]}}),
            json!({"type":"response.completed","response":{"status":"completed"}}),
        ]);
        let mut worker =
            Worker::start(&fixture, model, Some('a'), vec![reply], &capabilities).await;
        let session = "search-subscription";
        let created = worker.request("_co.grida/session/selection/create",json!({
            "cwd":fixture.primary,"sessionId":session,"requestId":"create","selection":{"connectionId":"a".repeat(64),"model":model,"effort":"medium","speed":"fast"}
        })).await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        worker.load(&fixture, session).await;
        let mut input = prompt_request(session, "search", "Find the release notes.");
        input["_meta"] = json!({"co.grida/selectionRevision":1,"co.grida/webSearch":true});
        let accepted = worker.request("_co.grida/session/submit", input).await;
        assert!(accepted.get("error").is_none(), "{accepted}");
        worker.idle(session).await;
        let inspected = worker
            .request(
                "_co.grida/session/input",
                json!({"sessionId":session,"inputId":"search"}),
            )
            .await;
        assert_eq!(
            inspected["result"]["settings"]["webSearch"], true,
            "{inspected}"
        );
        assert!(inspected["result"]["receipt"].get("webSearch").is_none());
        let wire = &worker.requests[0];
        assert_eq!(worker.requests.len(), 1);
        assert_eq!(wire["service_tier"], "priority");
        let tools = wire["tools"].as_array().unwrap();
        assert!(tools.iter().any(|tool| tool["type"] == "function"));
        assert!(tools.contains(&json!({"type":"web_search","external_web_access":true})));
        let assert_evidence = |notifications: &[Value], key: &str| {
            let searches: Vec<_> = notifications
                .iter()
                .filter(|v| v["update"]["title"] == "web_search" && !v["_meta"][key].is_null())
                .collect();
            assert!(!searches.is_empty(), "{notifications:?}");
            let last = searches.last().unwrap();
            assert_eq!(last["_meta"][key]["source"], "provider");
            assert_eq!(last["_meta"][key]["outcome"], "succeeded");
            assert_eq!(last["update"]["rawInput"]["query"], "release date");
            let id = &last["update"]["toolCallId"];
            assert!(
                searches
                    .iter()
                    .all(|item| &item["update"]["toolCallId"] == id)
            );
            let answer = notifications
                .iter()
                .find(|v| v["_meta"][key]["citations"].is_array())
                .expect("a cited answer");
            assert_eq!(answer["update"]["content"]["text"], "Release notes");
            assert_eq!(
                answer["_meta"][key]["citations"],
                json!([{"url":"https://example.org/release","title":"Release notes","startIndex":0,"endIndex":7}])
            );
            id.clone()
        };
        let live_id = assert_evidence(&worker.updates, "co.grida/session/updates");
        worker.close().await;

        let mut restored = Worker::start(&fixture, model, Some('a'), vec![], &capabilities).await;
        let window = "co.grida/session/transcript-window";
        let attached = restored.request("session/load",json!({"cwd":fixture.primary,"sessionId":session,"mcpServers":[],"_meta":{window:{"kind":"attach"}}})).await;
        assert!(attached.get("error").is_none(), "{attached}");
        let page = restored.request("session/load",json!({"cwd":fixture.primary,"sessionId":session,"mcpServers":[],"_meta":{window:{"kind":"read","requestId":"restore"}}})).await;
        assert!(page.get("error").is_none(), "{page}");
        assert_eq!(assert_evidence(&restored.updates, window), live_id);
        assert!(restored.requests.is_empty());
        restored.updates.clear();
        restored.load(&fixture, session).await;
        assert!(
            restored
                .updates
                .iter()
                .any(|frame| frame["update"]["content"]["text"] == "Release notes")
        );
        assert!(
            restored
                .updates
                .iter()
                .all(|frame| frame["update"]["sessionUpdate"] != "tool_call"
                    && !frame.to_string().contains("example.org"))
        );
        restored.close().await;
    }

    #[tokio::test]
    async fn predictions_resolve_the_economy_model_on_the_selected_subscription_and_use_portable_history()
     {
        use super::super::lifecycle::prompt_request;
        let fixture = Fixture::new(false);
        std::fs::write(
            fixture.primary.join("note.txt"),
            "Use mulberry for the heading.",
        )
        .unwrap();
        let session = "predict-on-selected-subscription";
        let mut worker = Worker::start(
            &fixture,
            FIRST,
            Some('a'),
            vec![
                Reply::Tool("read_file", r#"{"path":"note.txt"}"#),
                Reply::ResponsesSigned("Original response."),
                Reply::Finished("Use the summary."),
                Reply::Finished("A new reply."),
            ],
            &[
                "provider/routes",
                "provider/prediction-route",
                "provider/turn-capabilities",
                "session/selection",
                "session/predict-prompt",
            ],
        )
        .await;
        worker.alternate_account = Some('b');
        let created = worker
            .request(
                "_co.grida/session/selection/create",
                json!({
                    "cwd":fixture.primary,"sessionId":session,"requestId":"create",
                    "selection":{"connectionId":"b".repeat(64),"model":SECOND,"effort":"medium","speed":"fast"}
                }),
            )
            .await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        worker.load(&fixture, session).await;
        let mut input = prompt_request(session, "source", "Prepare a summary.");
        input["_meta"] = json!({"co.grida/selectionRevision":1,"co.grida/webSearch":true});
        let accepted = worker.request("_co.grida/session/submit", input).await;
        let turn = accepted["result"]["turnId"].as_str().unwrap();
        let before = worker.idle(session).await;
        assert_eq!(worker.requests.len(), 2);
        for foreground in &worker.requests {
            assert_eq!(foreground["service_tier"], "priority");
            assert!(
                foreground["tools"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|tool| tool["type"] == "web_search")
            );
        }
        let request = json!({"sessionId":session,"turnId":turn});
        let source = json!({
            "connectionId": "b".repeat(64), "model": SECOND,
            "purpose": "composerPrediction", "sourceRouteId": worker.alternate_route.as_ref().unwrap()
        });
        let offer = |model: &str, account: char| {
            json!({"kind":"chatgpt","routeId":ECONOMY_ROUTE,"model":model,
                "endpoint":ENDPOINT,"scope":account.to_string().repeat(64)})
        };
        worker.alternate_account = Some('c');
        let refused = worker
            .request("_co.grida/session/predict-prompt", request.clone())
            .await;
        assert!(
            refused["error"].is_null() && refused["result"]["text"].is_null(),
            "{refused}"
        );
        assert_eq!(worker.requests.len(), 2);
        worker.alternate_account = Some('b');
        for denied in [
            None,
            Some(offer(ECONOMY_MODEL, 'c')),
            Some(offer(SECOND, 'b')),
        ] {
            worker.prediction_route = Some((source.clone(), denied));
            let skipped = worker
                .request("_co.grida/session/predict-prompt", request.clone())
                .await;
            assert!(
                skipped["error"].is_null() && skipped["result"]["text"].is_null(),
                "{skipped}"
            );
            assert!(skipped["result"].get("modelId").is_none(), "{skipped}");
            assert_eq!(
                worker.requests.len(),
                2,
                "unavailable, foreign and premium offers spend nothing"
            );
        }
        worker.prediction_route = Some((source, Some(offer(ECONOMY_MODEL, 'b'))));
        let prediction = worker
            .request("_co.grida/session/predict-prompt", request.clone())
            .await;
        let result = &prediction["result"];
        assert_eq!(result["text"], "Use the summary.", "{prediction}");
        assert_eq!(result["modelId"], ECONOMY_MODEL);
        assert!(result.get("gatewayBilling").is_none());
        let counts = result["tokenUsage"]["reported"].as_array().unwrap();
        for (category, tokens) in [("input", "5"), ("output", "3")] {
            assert!(
                counts
                    .iter()
                    .any(|row| row["category"] == category && row["tokens"] == tokens),
                "{counts:?}"
            );
        }
        assert!(!counts.iter().any(|row| row["category"] == "cached_input"));
        assert_eq!(worker.requests.len(), 3);
        let wire = &worker.requests[2];
        assert!(wire.get("service_tier").is_none());
        assert_eq!(
            wire["model"],
            ECONOMY_MODEL.strip_prefix("openai/").unwrap()
        );
        assert!(
            wire["tools"].is_null() || wire["tools"] == json!([]),
            "{wire}"
        );
        let context = wire["input"].to_string();
        assert!(
            context.contains("Original response.")
                && context.contains("Prepare a summary.")
                && context.contains("Earlier tool call (history only)")
                && context.contains("Use mulberry for the heading.")
                && !context.contains("encrypted_content")
                && !context.contains("private-openai"),
            "{context}"
        );
        let duplicate = worker
            .request("_co.grida/session/predict-prompt", request)
            .await;
        assert!(
            duplicate["error"].is_null()
                && duplicate["result"]["text"].is_null()
                && duplicate["result"]["modelId"].is_null()
        );
        assert_eq!(worker.requests.len(), 3);
        assert_eq!(worker.idle(session).await, before);
        let mut second = prompt_request(session, "second", "Review the summary.");
        second["_meta"] = json!({"co.grida/selectionRevision":1});
        let accepted = worker.request("_co.grida/session/submit", second).await;
        let turn = accepted["result"]["turnId"].as_str().unwrap();
        worker.idle(session).await;
        assert_eq!(
            worker.requests[3]["model"],
            SECOND.strip_prefix("openai/").unwrap()
        );
        assert!(
            worker.requests[3]["input"]
                .to_string()
                .contains("encrypted_content")
        );
        let changed = worker.request("_co.grida/session/selection/update", json!({
            "cwd":fixture.primary,"sessionId":session,"expectedRevision":1,"operationId":"switch",
            "selection":{"connectionId":"a".repeat(64),"model":FIRST,"effort":"medium"}
        })).await;
        assert_eq!(changed["result"]["revision"], 2, "{changed}");
        let stale = worker
            .request(
                "_co.grida/session/predict-prompt",
                json!({"sessionId":session,"turnId":turn}),
            )
            .await;
        assert!(
            stale["error"].is_null() && stale["result"]["text"].is_null(),
            "{stale}"
        );
        assert_eq!(worker.requests.len(), 4);
        worker.close().await;
    }

    #[tokio::test]
    async fn a_subscription_prediction_requires_its_route_offer_and_preserves_same_model_reasoning()
    {
        for (model, negotiate) in [(FIRST, false), (ECONOMY_MODEL, true)] {
            let fixture = Fixture::new(false);
            let mut capabilities = vec!["provider/routes", "session/predict-prompt"];
            let mut replies = vec![Reply::ResponsesSigned("Original response.")];
            if negotiate {
                capabilities.push("provider/prediction-route");
                replies.push(Reply::Finished("Review the summary."));
            }
            let mut worker =
                Worker::start(&fixture, model, Some('a'), replies, &capabilities).await;
            let created = worker
                .request(
                    "session/new",
                    json!({"cwd":fixture.primary,"mcpServers":[]}),
                )
                .await;
            let session = created["result"]["sessionId"].as_str().unwrap();
            let reply = worker.request("session/prompt", json!({"sessionId":session,"prompt":[{"type":"text","text":"Prepare a summary."}]})).await;
            assert_eq!(reply["result"]["stopReason"], "end_turn", "{reply}");
            let snapshot = worker.idle(session).await;
            if negotiate {
                worker.prediction_route = Some((
                    json!({"connectionId":null,"model":model,"purpose":"composerPrediction"}),
                    Some(json!({"kind":"launch","routeId":LAUNCH_ROUTE,"model":model})),
                ));
            }
            let request = json!({"sessionId":session,"turnId":snapshot["latest"]["turnId"]});
            let prediction = worker
                .request("_co.grida/session/predict-prompt", request)
                .await;
            let result = &prediction["result"];
            assert!(prediction["error"].is_null(), "{prediction}");
            if negotiate {
                assert_eq!(result["text"], "Review the summary.", "{prediction}");
                assert_eq!(result["modelId"], ECONOMY_MODEL);
                assert_eq!(worker.requests.len(), 2);
                let context = worker.requests[1]["input"].to_string();
                assert!(
                    context.contains("Original response.") && context.contains("encrypted_content"),
                    "{context}"
                );
            } else {
                assert!(
                    result["text"].is_null() && result["modelId"].is_null(),
                    "{prediction}"
                );
                assert_eq!(worker.requests.len(), 1);
            }
            worker.close().await;
        }
    }

    #[tokio::test]
    async fn archiving_a_chat_during_prediction_route_resolution_prevents_dispatch() {
        let fixture = Fixture::new(false);
        let mut worker = Worker::start(
            &fixture,
            FIRST,
            Some('a'),
            vec![Reply::Finished("I prepared the outline.")],
            &[
                "provider/prediction-route",
                "session/predict-prompt",
                "session/organize",
            ],
        )
        .await;
        let created = worker
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        worker.prompt(session, "Prepare the outline.").await;
        let snapshot = worker.idle(session).await;

        let prediction = worker
            .client
            .send(
                "_co.grida/session/predict-prompt",
                json!({"sessionId":session,"turnId":snapshot["latest"]["turnId"]}),
            )
            .await;
        let resolve = worker.client.read_reply().await;
        assert_eq!(resolve["method"], "_co.grida/provider/resolve");
        assert_eq!(
            resolve["params"],
            json!({"connectionId":null,"model":FIRST,"purpose":"composerPrediction"})
        );

        let archived = worker
            .request(
                "_co.grida/session/organize",
                json!({"sessionId":session,"revision":0,"title":null,"archived":true}),
            )
            .await;
        assert_eq!(archived["result"]["archived"], true, "{archived}");
        worker
            .client
            .respond(
                &resolve["id"],
                json!({
                    "kind": "chatgpt", "model": ECONOMY_MODEL, "routeId": ECONOMY_ROUTE,
                    "endpoint": ENDPOINT, "scope": "a".repeat(64)
                }),
            )
            .await;
        let skipped = worker.client.read_reply().await;
        assert_eq!(
            skipped["id"], prediction,
            "archiving must prevent a provider exchange, received {}",
            skipped["method"]
        );
        assert!(
            skipped["error"].is_null()
                && skipped["result"]["text"].is_null()
                && skipped["result"]["modelId"].is_null(),
            "{skipped}"
        );
        worker.close().await;
    }

    #[tokio::test]
    async fn resuming_a_captured_model_after_restart_requires_its_original_subscription_account() {
        use super::super::lifecycle::{prompt_request, task_basis};
        let fixture = Fixture::new(false);
        let session = "captured-subscription";
        let capabilities = &["provider/routes", "session/selection"];
        let mut first = Worker::start(
            &fixture,
            FIRST,
            Some('a'),
            vec![Reply::Hold("Before pause")],
            capabilities,
        )
        .await;
        first.alternate_account = Some('b');
        let created = first
            .request(
                "_co.grida/session/selection/create",
                json!({
                    "cwd":fixture.primary,"sessionId":session,"requestId":"create",
                    "selection":{"connectionId":"b".repeat(64),"model":SECOND,"effort":"medium"}
                }),
            )
            .await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        first.load(&fixture, session).await;
        let mut input = prompt_request(session, "held", "Hold this turn.");
        input["_meta"] = json!({"co.grida/selectionRevision":1});
        let accepted = first.request("_co.grida/session/submit", input).await;
        let turn = accepted["result"]["turnId"]
            .as_str()
            .unwrap_or_else(|| panic!("{accepted}"));
        let retained = first.pause_dispatched(session, turn).await;
        first.close().await;

        let mut reopened = Worker::start(
            &fixture,
            FIRST,
            Some('a'),
            vec![Reply::Finished("Resumed original turn")],
            capabilities,
        )
        .await;
        reopened.alternate_account = Some('c');
        reopened.load(&fixture, session).await;
        let resume = json!({
            "task":task_basis(&retained,session,"resume"),
            "expectedEpoch":retained["current"]["epoch"],
            "expectedJournalPosition":retained["current"]["journalPosition"]
        });
        let refused = reopened
            .request("_co.grida/session/resume", resume.clone())
            .await;
        assert_eq!(
            refused["error"]["data"], "session_active_route_changed",
            "{refused}"
        );
        assert!(reopened.requests.is_empty());
        let unchanged = reopened
            .request("_co.grida/session/snapshot", json!({"sessionId":session}))
            .await;
        assert_eq!(unchanged["result"]["current"], retained["current"]);

        // This receipt predates wireModel. Even a supervisor for the right account
        // must recover its historical selector when upgrading to explicit bindings.
        let binding = |wire: &str| {
            json!({
                "kind":"chatgpt","model":SECOND,"wireModel":wire,"imageInput":true,
                "endpoint":ENDPOINT,"scope":"b".repeat(64)
            })
        };
        reopened.catalog_route = Some(binding("fixture-remapped-model"));
        let remapped = reopened
            .request("_co.grida/session/resume", resume.clone())
            .await;
        assert_eq!(
            remapped["error"]["data"], "session_active_route_changed",
            "{remapped}"
        );
        assert!(reopened.requests.is_empty());
        assert!(reopened.retained_resolutions.is_empty());

        reopened.catalog_route = Some(binding(SECOND.strip_prefix("openai/").unwrap()));
        let resumed = reopened.request("_co.grida/session/resume", resume).await;
        assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
        assert_eq!(
            reopened.idle(session).await["latest"]["status"],
            "succeeded"
        );
        assert_eq!(reopened.requests.len(), 1);
        assert_eq!(
            reopened.requests[0]["model"],
            SECOND.strip_prefix("openai/").unwrap()
        );
        reopened.close().await;
    }

    #[tokio::test]
    async fn catalog_selectors_survive_queue_and_restart_and_remaps_require_the_original_selector()
    {
        use super::super::lifecycle::{prompt_request, task_basis};
        let fixture = Fixture::new(false);
        let session = "catalog-queue";
        let model = "openai/fixture-new-public-model";
        let wire = "fixture-subscription-revision";
        let account = "b".repeat(64);
        let descriptor = |selector: &str| {
            json!({
                "kind":"chatgpt","model":model,"wireModel":selector,"imageInput":true,
                "endpoint":ENDPOINT,"scope":account
            })
        };
        let input = |id: &str| {
            let mut request = prompt_request(session, id, "Use the accepted model.");
            request["_meta"] = json!({"co.grida/selectionRevision":1});
            request
        };
        let capabilities = &[
            "provider/routes",
            "session/selection",
            "provider/turn-capabilities",
        ];
        let mut first = Worker::start(
            &fixture,
            FIRST,
            Some('a'),
            vec![Reply::Hold("Before pause")],
            capabilities,
        )
        .await;
        first.catalog_route = Some(descriptor(wire));
        let created = first
            .request(
                "_co.grida/session/selection/create",
                json!({
                    "cwd":fixture.primary,"sessionId":session,"requestId":"create",
                    "selection":{"connectionId":account,"model":model,"effort":"medium","speed":"fast"}
                }),
            )
            .await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        first.load(&fixture, session).await;
        let accepted = first
            .request("_co.grida/session/submit", input("held"))
            .await;
        let turn = accepted["result"]["turnId"]
            .as_str()
            .unwrap_or_else(|| panic!("{accepted}"));
        let queued = first
            .request("_co.grida/session/enqueue", input("queued"))
            .await;
        assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
        let paused = first.pause_dispatched(session, turn).await;
        assert_eq!(paused["current"]["modelId"], model);
        assert_eq!(first.requests[0]["model"], wire);
        first.close().await;

        let mut reopened = Worker::start(
            &fixture,
            FIRST,
            Some('a'),
            vec![
                Reply::Finished("Original turn resumed"),
                Reply::Finished("Queued turn finished"),
            ],
            capabilities,
        )
        .await;
        reopened.catalog_route = Some(descriptor("fixture-remapped"));
        reopened.load(&fixture, session).await;
        let resume = json!({
            "task":task_basis(&paused,session,"resume"),"expectedEpoch":paused["current"]["epoch"],
            "expectedJournalPosition":paused["current"]["journalPosition"]
        });
        let refused = reopened
            .request("_co.grida/session/resume", resume.clone())
            .await;
        assert_eq!(
            refused["error"]["data"], "session_active_route_changed",
            "{refused}"
        );
        assert!(reopened.requests.is_empty());
        assert!(!reopened.retained_resolutions.is_empty());
        let mut changed_image = descriptor(wire);
        changed_image["imageInput"] = false.into();
        reopened.catalog_route = Some(changed_image);
        let refused = reopened
            .request("_co.grida/session/resume", resume.clone())
            .await;
        assert_eq!(
            refused["error"]["data"], "session_active_route_changed",
            "{refused}"
        );
        assert!(reopened.requests.is_empty());

        reopened.catalog_route = Some(descriptor(wire));
        let resumed = reopened.request("_co.grida/session/resume", resume).await;
        assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
        let settled = reopened
            .wait_for_snapshot(session, |view| {
                view["current"].is_null()
                    && view["queuedInputs"] == 0
                    && view["latest"]["turnId"] != turn
                    && view["latest"]["status"] == "succeeded"
            })
            .await;
        assert_eq!(settled["latest"]["modelId"], model);
        assert_eq!(reopened.requests.len(), 2);
        assert!(
            reopened
                .requests
                .iter()
                .all(|request| request["model"] == wire)
        );
        let expected = json!({"connectionId":account,"model":model,"retainedWireModel":wire,"retainedImageInput":true,"retainedSpeed":"fast"});
        assert!(
            reopened
                .retained_resolutions
                .iter()
                .all(|params| params == &expected),
            "{:?}",
            reopened.retained_resolutions
        );
        assert!(
            reopened
                .requests
                .iter()
                .all(|body| body["service_tier"] == "priority")
        );
        reopened.close().await;
    }

    #[tokio::test]
    async fn catalog_byok_selection_serializes_its_provider_selector_and_keeps_the_public_id() {
        use super::super::lifecycle::prompt_request;
        let fixture = Fixture::new(false);
        let credentials = tempfile::tempdir().unwrap();
        let home = credentials.path().canonicalize().unwrap();
        grida_auth::ProviderStore::new(home.clone())
            .unwrap()
            .set("openrouter", "fixture-key")
            .unwrap();
        let model = "example/fixture-public-model";
        let wire = "provider/fixture-wire-id";
        let session = "catalog-byok";
        let mut worker = Worker::start(
            &fixture,
            "fixture-a",
            None,
            vec![Reply::Finished("Finished")],
            &["provider/routes", "session/selection"],
        )
        .await;
        worker.alternate_key = Some((home.clone(), "fixture-key"));
        worker.catalog_route = Some(
            json!({"kind":"http","model":model,"wireModel":wire,"imageInput":false,
            "protocol":"openai-compatible","endpoint":"https://openrouter.ai/api/v1","credentialHome":home}),
        );
        let created = worker
            .request(
                "_co.grida/session/selection/create",
                json!({
                    "cwd":fixture.primary,"sessionId":session,"requestId":"create",
                    "selection":{"connectionId":"b".repeat(64),"model":model,"effort":"medium"}
                }),
            )
            .await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        worker.load(&fixture, session).await;
        let mut request = prompt_request(session, "accepted", "Use the selected provider model.");
        request["_meta"] = json!({"co.grida/selectionRevision":1});
        let accepted = worker.request("_co.grida/session/submit", request).await;
        assert!(accepted["result"]["turnId"].is_string(), "{accepted}");
        let settled = worker.idle(session).await;
        assert_eq!(settled["latest"]["status"], "succeeded", "{settled}");
        assert_eq!(settled["latest"]["modelId"], model);
        assert_eq!(worker.requests[0]["model"], wire);
        worker.close().await;
    }

    #[tokio::test]
    async fn a_rotated_named_key_dispatches_new_inputs_but_cannot_resume_the_old_turn() {
        use super::super::lifecycle::{prompt_request, task_basis};
        let fixture = Fixture::new(false);
        let credentials = tempfile::tempdir().unwrap();
        let home = credentials.path().canonicalize().unwrap();
        let store = grida_auth::ProviderStore::new(home.clone()).unwrap();
        let session = "old-byok";
        let capabilities = &["provider/routes", "session/selection"];
        let selection = |session: &str| {
            json!({
                "cwd":fixture.primary,"sessionId":session,"requestId":"create",
                "selection":{"connectionId":"b".repeat(64),"model":"fixture-b","effort":"medium"}
            })
        };
        let input = |session: &str| {
            let mut input = prompt_request(session, "input", "Run the selected model.");
            input["_meta"] = json!({"co.grida/selectionRevision":1});
            input
        };
        store.set("fixture-byok", "fixture-old-key").unwrap();
        let mut worker = Worker::start(
            &fixture,
            "fixture-a",
            None,
            vec![Reply::Hold("Before pause")],
            capabilities,
        )
        .await;
        worker.alternate_key = Some((home.clone(), "fixture-old-key"));
        let created = worker
            .request("_co.grida/session/selection/create", selection(session))
            .await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        worker.load(&fixture, session).await;
        let accepted = worker
            .request("_co.grida/session/submit", input(session))
            .await;
        let turn = accepted["result"]["turnId"]
            .as_str()
            .unwrap_or_else(|| panic!("{accepted}"));
        let paused = worker.pause_dispatched(session, turn).await;
        worker.close().await;

        store.set("fixture-byok", "fixture-new-key").unwrap();
        let mut worker = Worker::start(
            &fixture,
            "fixture-a",
            None,
            vec![Reply::Finished("New key accepted.")],
            capabilities,
        )
        .await;
        worker.alternate_key = Some((home, "fixture-new-key"));
        worker.load(&fixture, session).await;
        let refuse = worker
            .request(
                "_co.grida/session/resume",
                json!({
                    "task":task_basis(&paused,session,"resume"),
                    "expectedEpoch":paused["current"]["epoch"],
                    "expectedJournalPosition":paused["current"]["journalPosition"]
                }),
            )
            .await;
        assert_eq!(
            refuse["error"]["data"], "session_active_route_changed",
            "{refuse}"
        );
        assert!(worker.requests.is_empty());
        let fresh = "fresh-byok";
        let created = worker
            .request("_co.grida/session/selection/create", selection(fresh))
            .await;
        assert_eq!(created["result"]["revision"], 1, "{created}");
        worker.load(&fixture, fresh).await;
        let accepted = worker
            .request("_co.grida/session/submit", input(fresh))
            .await;
        assert!(accepted["result"]["turnId"].is_string(), "{accepted}");
        assert_eq!(worker.idle(fresh).await["latest"]["status"], "succeeded");
        assert_eq!(worker.requests.len(), 1);
        worker.close().await;
    }

    #[tokio::test]
    async fn subscription_selected_jpeg_and_webp_tool_supply_actual_pixels_without_output_cap() {
        use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
        use sha2::{Digest, Sha256};
        use std::io::Cursor;
        fn encoded(format: ImageFormat, color: [u8; 3]) -> Vec<u8> {
            let image = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(9, 6, Rgb(color)));
            let mut bytes = Cursor::new(Vec::new());
            image.write_to(&mut bytes, format).unwrap();
            bytes.into_inner()
        }
        fn images(value: &Value, output: &mut Vec<Vec<u8>>) {
            match value {
                Value::String(text) => {
                    if let Some(data) = text.strip_prefix("data:image/png;base64,") {
                        output.push(STANDARD.decode(data).unwrap());
                    }
                }
                Value::Array(values) => {
                    for value in values {
                        images(value, output);
                    }
                }
                Value::Object(fields) => {
                    for value in fields.values() {
                        images(value, output);
                    }
                }
                _ => {}
            }
        }
        let fixture = Fixture::new(false);
        let selected = fixture.primary.join("original.jpg");
        let original = encoded(ImageFormat::Jpeg, [210, 30, 15]);
        std::fs::write(&selected, &original).unwrap();
        std::fs::write(
            fixture.primary.join("tool.webp"),
            encoded(ImageFormat::WebP, [15, 210, 30]),
        )
        .unwrap();
        let mut worker = Worker::open(
            &fixture,
            "openai/gpt-6.1-sol",
            'a',
            vec![
                Reply::Tool("view_image", r#"{"path":"tool.webp"}"#),
                Reply::Finished("Observed the eager red image and tool's green image."),
            ],
        )
        .await;
        let created = worker
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let digest: [u8; 32] = Sha256::digest(&original).into();
        let accepted = worker.request("_co.grida/session/submit", json!({
            "sessionId":session,"inputId":"subscription-image",
            "prompt":[{"type":"text","text":"Describe this and inspect tool.webp."}],
            "selectedImage":{"path":selected,"sha256":digest,"name":"original.jpg","source":"disk"},
        })).await;
        assert!(accepted["result"].is_object(), "{accepted}");
        assert_eq!(worker.idle(session).await["latest"]["status"], "succeeded");
        assert_eq!(worker.requests.len(), 2);
        let first = &worker.requests[0];
        assert!(first.get("max_output_tokens").is_none());
        assert_eq!(first["store"], false);
        assert!(
            first["input"]
                .to_string()
                .contains(selected.to_str().unwrap())
        );
        assert!(
            first["tools"]
                .as_array()
                .unwrap()
                .iter()
                .any(|tool| tool["name"] == "view_image")
        );
        let mut first_images = Vec::new();
        images(first, &mut first_images);
        assert_eq!(first_images.len(), 1);
        let first_pixels = image::load_from_memory(&first_images[0]).unwrap().to_rgb8();
        assert!(first_pixels.get_pixel(0, 0)[0] > 190);
        let mut next_images = Vec::new();
        images(&worker.requests[1], &mut next_images);
        assert!(next_images.iter().any(|bytes| {
            image::load_from_memory(bytes)
                .unwrap()
                .to_rgb8()
                .get_pixel(0, 0)[1]
                > 190
        }));
        assert!(
            worker.requests[1]["input"]
                .to_string()
                .contains("Viewed image/webp tool.webp")
        );
        worker.load(&fixture, session).await;
        let attached = worker
            .updates
            .iter()
            .map(|notification| &notification["update"])
            .find(|update| {
                update["sessionUpdate"] == "user_message_chunk"
                    && update["content"]["type"] == "resource_link"
                    && update["content"]["mimeType"] == "image/jpeg"
            })
            .unwrap();
        let message = attached["messageId"].clone();
        let uri = attached["content"]["uri"].clone();
        std::fs::remove_file(&selected).unwrap();
        let preview = worker
            .request(
                "_co.grida/session/read-input-image-chunk",
                json!({
                    "sessionId":session,"messageId":message,"attachmentUri":uri,"offset":0,
                }),
            )
            .await;
        assert_eq!(preview["result"]["mimeType"], "image/jpeg", "{preview}");
        assert_eq!(
            STANDARD
                .decode(preview["result"]["data"].as_str().unwrap())
                .unwrap(),
            original
        );
        assert_eq!(worker.requests.len(), 2, "preview starts no inference");
        worker.close().await;
    }

    #[tokio::test]
    async fn every_subscription_model_uses_its_selected_wire_id() {
        for (model, wire) in [
            ("openai/gpt-6.2-sol", "gpt-6.2-sol"),
            ("openai/gpt-6.2-astra", "gpt-6.2-astra"),
            ("openai/gpt-6.1-sol", "gpt-6.1-sol"),
            ("openai/gpt-6-astra", "gpt-6-astra"),
            ("openai/gpt-6.1-terra", "gpt-6.1-terra"),
            ("openai/gpt-6-luna", "gpt-6-luna"),
            ("openai/gpt-6-sol", "gpt-6-sol"),
            ("openai/gpt-5.6-sol", "gpt-5.6-sol"),
            ("openai/gpt-5.6-terra", "gpt-5.6-terra"),
            ("openai/gpt-5.6-luna", "gpt-5.6-luna"),
        ] {
            let fixture = Fixture::new(false);
            let mut worker = Worker::open(
                &fixture,
                model,
                'a',
                vec![Reply::Finished("The selected subscription model replied.")],
            )
            .await;
            let created = worker
                .request(
                    "session/new",
                    json!({"cwd":fixture.primary,"mcpServers":[]}),
                )
                .await;
            let session = created["result"]["sessionId"].as_str().unwrap();
            worker
                .prompt(session, "Use this selected subscription model.")
                .await;
            assert_eq!(worker.requests.len(), 1);
            assert_eq!(worker.requests[0]["model"], wire);
            assert_eq!(worker.requests[0]["reasoning"], json!({"effort":"medium"}));
            worker.close().await;
        }
    }

    #[tokio::test]
    async fn anonymous_supervised_ultra_runs_and_collects_the_real_reviewer() {
        let fixture = Fixture::new(false);
        let next = || {
            Reply::Choose(Box::new(|request| {
                if request["tools"].as_array().is_some_and(|tools| {
                    tools
                        .iter()
                        .any(|tool| tool["function"]["name"] == "collect_review")
                }) {
                    Reply::Tool("collect_review", "{}")
                } else {
                    Reply::Finished("The anonymous reviewer independently checked the result.")
                }
            }))
        };
        let mut worker = Worker::open_route(
            &fixture,
            "fixture-model",
            None,
            vec![
                Reply::Tool(
                    "delegate_review",
                    r#"{"instructions":"Verify the anonymous result independently."}"#,
                ),
                next(),
                next(),
                Reply::Finished("Integrated the anonymous finding."),
            ],
        )
        .await;
        let created = worker
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let accepted = worker
            .request(
                "_co.grida/session/submit",
                json!({
                    "sessionId":session,"inputId":"anonymous-ultra","effort":"ultra",
                    "prompt":[{"type":"text","text":"Parent-only anonymous task context."}],
                }),
            )
            .await;
        assert!(accepted.get("error").is_none(), "{accepted}");
        let view = worker.idle(session).await;
        assert_eq!(view["latest"]["status"], "succeeded", "{view}");
        let summary = worker
            .request(
                "_co.grida/session/turn-summary",
                json!({"sessionId":session,"turnId":view["latest"]["turnId"]}),
            )
            .await;
        assert_eq!(
            summary["result"]["reviewFindingsCollected"], true,
            "{summary}"
        );
        assert_eq!(worker.requests.len(), 4);
        let child = worker
            .requests
            .iter()
            .find(|request| {
                !request["tools"].as_array().is_some_and(|tools| {
                    tools
                        .iter()
                        .any(|tool| tool["function"]["name"] == "collect_review")
                })
            })
            .unwrap();
        assert!(
            child["messages"]
                .to_string()
                .contains("Verify the anonymous result independently.")
        );
        assert!(
            !child["messages"]
                .to_string()
                .contains("Parent-only anonymous task context.")
        );
        assert!(
            worker.requests.last().unwrap()["messages"]
                .to_string()
                .contains("The anonymous reviewer independently checked the result.")
        );
        worker.close().await;
    }

    #[tokio::test]
    async fn subscription_ultra_stop_cancels_parent_and_reviewer_and_survives_restart() {
        let fixture = Fixture::new(false);
        let next = || {
            Reply::Choose(Box::new(|request| {
                if request["tools"]
                    .as_array()
                    .is_some_and(|tools| tools.iter().any(|tool| tool["name"] == "collect_review"))
                {
                    Reply::Hold("Parent is still working.")
                } else {
                    Reply::Hold("Reviewer is still working.")
                }
            }))
        };
        let mut worker = Worker::open(
            &fixture,
            FIRST,
            'a',
            vec![
                Reply::Tool(
                    "delegate_review",
                    r#"{"instructions":"Inspect the result independently."}"#,
                ),
                next(),
                next(),
            ],
        )
        .await;
        let created = worker
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
        let accepted = worker
            .request(
                "_co.grida/session/submit",
                json!({
                    "sessionId":session,"inputId":"held-ultra","effort":"ultra",
                    "prompt":[{"type":"text","text":"Work until stopped."}],
                }),
            )
            .await;
        assert!(accepted.get("error").is_none(), "{accepted}");
        let snapshot = timeout(WAIT, async {
            loop {
                let view = worker
                    .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                    .await;
                assert!(view.get("error").is_none(), "{view}");
                if worker.requests.len() == 3 {
                    break view["result"].clone();
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert!(snapshot["current"].is_object());
        let stopped = worker
            .request(
                "_co.grida/session/stop",
                super::super::lifecycle::task_basis(&snapshot, &session, "stop-ultra-review"),
            )
            .await;
        assert!(stopped.get("error").is_none(), "{stopped}");
        let settled = worker.idle(&session).await;
        assert_eq!(settled["latest"]["status"], "cancelled", "{settled}");
        assert!(worker.cancelled >= 2);
        assert_eq!(worker.requests.len(), 3);
        worker.close().await;

        let mut reopened = Worker::open(&fixture, FIRST, 'a', vec![]).await;
        reopened.load(&fixture, &session).await;
        let view = reopened
            .request("_co.grida/session/snapshot", json!({"sessionId":session}))
            .await;
        assert_eq!(view["result"]["latest"]["status"], "cancelled", "{view}");
        assert!(reopened.requests.is_empty());
        reopened.close().await;
    }

    #[tokio::test]
    async fn subscription_ultra_delegates_and_collects_with_no_wire_token_cap() {
        for goal in [false, true] {
            const FINDING: &str = "The independent subscription reviewer verified the result.";
            let fixture = Fixture::new(false);
            let next = || {
                Reply::Choose(Box::new(|request| {
                    if request["tools"].as_array().is_some_and(|tools| {
                        tools.iter().any(|tool| tool["name"] == "collect_review")
                    }) {
                        Reply::Tool("collect_review", "{}")
                    } else {
                        Reply::ResponsesSigned(FINDING)
                    }
                }))
            };
            let mut replies = vec![
                Reply::Tool(
                    "delegate_review",
                    r#"{"instructions":"Verify the result independently."}"#,
                ),
                next(),
                next(),
            ];
            if goal {
                replies.push(Reply::Tool("goal_report", r#"{"report":{"kind":"ready_for_review","summary":"Independent review is ready."}}"#));
            }
            replies.push(Reply::Finished("Integrated the independent finding."));
            let mut birth = Worker::open(&fixture, FIRST, 'a', vec![]).await;
            let created = birth
                .request(
                    "session/new",
                    json!({"cwd":fixture.primary,"mcpServers":[]}),
                )
                .await;
            let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
            birth.close().await;
            let mut worker = Worker::open(&fixture, SECOND, 'a', replies).await;
            worker.load(&fixture, &session).await;
            let mut input = json!({
                "sessionId":session,"inputId":"ultra-review","effort":"ultra","reasoning":"xhigh",
                "prompt":[{"type":"text","text":"Parent-only subscription task context."}],
            });
            if goal {
                input.as_object_mut().unwrap().remove("reasoning");
                input["goal"] = json!({
                    "objective":{"description":"Verify the result","criteria":["The result was checked"]},
                    "allowance":{"work_turns":1,"inference_steps":8},"user_review":true,
                });
            }
            let accepted = worker
                .request(
                    if goal {
                        "_co.grida/goal/start"
                    } else {
                        "_co.grida/session/submit"
                    },
                    input,
                )
                .await;
            assert!(accepted.get("error").is_none(), "{accepted}");
            let view = worker.idle(&session).await;
            assert_eq!(view["latest"]["status"], "succeeded", "{view}");
            let summary = worker
                .request(
                    "_co.grida/session/turn-summary",
                    json!({
                        "sessionId":session,"turnId":view["latest"]["turnId"],
                    }),
                )
                .await;
            assert_eq!(
                summary["result"]["reviewFindingsCollected"], true,
                "{summary}"
            );
            let child = worker
                .requests
                .iter()
                .find(|request| {
                    !request["tools"].as_array().is_some_and(|tools| {
                        tools.iter().any(|tool| tool["name"] == "collect_review")
                    })
                })
                .unwrap();
            assert!(
                child["input"]
                    .to_string()
                    .contains("Verify the result independently.")
            );
            assert!(
                !child["input"]
                    .to_string()
                    .contains("Parent-only subscription task context.")
            );
            assert!(
                worker.requests.last().unwrap()["input"]
                    .to_string()
                    .contains(FINDING)
            );
            if goal {
                let inspected = worker
                    .request("_co.grida/goal/inspect", json!({"sessionId":session}))
                    .await;
                assert!(inspected.get("error").is_none(), "{inspected}");
                assert!(
                    inspected
                        .to_string()
                        .contains("Independent review is ready."),
                    "{inspected}"
                );
            }
            worker.close().await;

            let mut reopened = Worker::open(&fixture, SECOND, 'a', vec![]).await;
            reopened.load(&fixture, &session).await;
            let retained = reopened
                .request(
                    "_co.grida/session/turn-summary",
                    json!({
                        "sessionId":session,"turnId":view["latest"]["turnId"],
                    }),
                )
                .await;
            assert_eq!(
                retained["result"]["reviewFindingsCollected"], true,
                "{retained}"
            );
            assert!(reopened.requests.is_empty());
            reopened.close().await;
        }
    }

    #[tokio::test]
    async fn an_automatic_goal_after_a_model_change_continues_under_its_accepted_route() {
        let fixture = Fixture::new(false);
        let mut birth = Worker::open(&fixture, FIRST, 'a', vec![]).await;
        let created = birth
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
        birth.close().await;
        let mut worker = Worker::open(&fixture, SECOND, 'a', vec![
            Reply::Tool("goal_report", r#"{"report":{"kind":"progress","summary":"First part prepared"}}"#),
            Reply::Finished("First goal turn"),
            Reply::Tool("goal_report", r#"{"report":{"kind":"blocked","reason":"needs_input","summary":"Please review the result"}}"#),
            Reply::Finished("Second goal turn"),
        ]).await;
        worker.load(&fixture, &session).await;
        let accepted = worker.request("_co.grida/goal/start", json!({
            "sessionId":session,"inputId":"goal-b",
            "prompt":[{"type":"text","text":"Prepare both parts"}],
            "goal":{"objective":{"description":"Prepare both parts","criteria":["Both parts exist"]},
                "allowance":{"work_turns":2,"inference_steps":4},"automatic":true}
        })).await;
        assert!(accepted.get("error").is_none(), "{accepted}");
        timeout(WAIT, async {
            loop {
                let inspected = worker
                    .request("_co.grida/goal/inspect", json!({"sessionId":session}))
                    .await;
                if inspected["result"]["goal"]["spent"]["work_turns"] == 2
                    && inspected["result"]["goal"]["reservation"].is_null()
                {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(worker.requests.len(), 4);
        worker.close().await;
        let mut wrong = Worker::open(&fixture, SECOND, 'b', vec![]).await;
        wrong.load(&fixture, &session).await;
        let denied = wrong
            .request("_co.grida/goal/recover", json!({"sessionId":session}))
            .await;
        assert_eq!(
            denied["error"]["data"], "session_goal_route_changed",
            "{denied}"
        );
        assert!(wrong.requests.is_empty());
        wrong.close().await;
        let mut reopened = Worker::open(&fixture, SECOND, 'a', vec![]).await;
        reopened.load(&fixture, &session).await;
        let recovered = reopened
            .request("_co.grida/goal/recover", json!({"sessionId":session}))
            .await;
        assert!(recovered.get("error").is_none(), "{recovered}");
        let blocked = reopened
            .request("_co.grida/session/model-change", json!({"prepare":true}))
            .await;
        assert_eq!(blocked["result"]["blocker"], "unresolved_goal", "{blocked}");
        assert!(reopened.requests.is_empty());
        reopened.close().await;
    }

    #[tokio::test]
    async fn model_changes_keep_tool_history_without_replaying_another_models_private_state() {
        let fixture = Fixture::new(false);
        std::fs::write(fixture.primary.join("note.txt"), "observed fixture note").unwrap();
        let mut first = Worker::open(
            &fixture,
            FIRST,
            'a',
            vec![
                Reply::Tool("read_file", r#"{"path":"note.txt"}"#),
                Reply::ResponsesSigned("First model answer"),
            ],
        )
        .await;
        let created = first
            .request(
                "session/new",
                json!({
                    "cwd":fixture.primary,"mcpServers":[],
                }),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
        first.prompt(&session, "Read the note").await;
        assert!(
            first.requests[1]
                .to_string()
                .contains("observed fixture note")
        );
        let original_call = first.requests[1]["input"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["type"] == "function_call")
            .unwrap()
            .clone();
        first.close().await;

        let mut restarted = Worker::open(
            &fixture,
            FIRST,
            'a',
            vec![Reply::ResponsesSigned("Same route answer")],
        )
        .await;
        restarted.load(&fixture, &session).await;
        restarted
            .prompt(&session, "Continue on the same model")
            .await;
        let replayed = &restarted.requests[0]["input"];
        assert!(replayed.as_array().unwrap().contains(&original_call));
        assert!(replayed.to_string().contains(&format!("private-{FIRST}")));
        restarted.close().await;

        let mut changed = Worker::open(
            &fixture,
            SECOND,
            'a',
            vec![
                Reply::Tool("read_file", r#"{"path":"note.txt"}"#),
                Reply::ResponsesSigned("Second model answer"),
            ],
        )
        .await;
        changed.load(&fixture, &session).await;
        changed
            .prompt(&session, "Continue with another model")
            .await;
        let portable = &changed.requests[0]["input"];
        let text = portable.to_string();
        for fact in [
            "First model answer",
            "Same route answer",
            "Earlier tool call (history only)",
            "Earlier tool result (history only)",
            "read_file",
            "note.txt",
            "observed fixture note",
        ] {
            assert!(text.contains(fact), "missing {fact}: {portable}");
        }
        assert!(!text.contains("encrypted_content"));
        assert!(!text.contains(&format!("private-{FIRST}")));
        assert!(
            portable
                .as_array()
                .unwrap()
                .iter()
                .all(|item| item["type"] == "message")
        );
        assert!(
            changed.requests[1]["input"]
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item["type"] == "function_call_output")
        );
        changed.close().await;

        let mut resumed = Worker::open(
            &fixture,
            SECOND,
            'a',
            vec![Reply::Finished("Resumed second model")],
        )
        .await;
        resumed.load(&fixture, &session).await;
        resumed
            .prompt(&session, "Keep the selected model after restart")
            .await;
        let replayed = resumed.requests[0]["input"].to_string();
        assert!(replayed.contains(&format!("private-{SECOND}")));
        assert!(!replayed.contains(&format!("private-{FIRST}")));
        resumed.close().await;

        let mut foreign = Worker::open(
            &fixture,
            SECOND,
            'b',
            vec![Reply::Finished("Selected new principal")],
        )
        .await;
        foreign.load(&fixture, &session).await;
        foreign
            .prompt(&session, "Continue with the explicitly selected account")
            .await;
        let portable = foreign.requests[0]["input"].to_string();
        assert!(portable.contains("First model answer"));
        assert!(portable.contains("Resumed second model"));
        assert!(!portable.contains("encrypted_content"));
        assert!(!portable.contains(&format!("private-{SECOND}")));
        foreign.close().await;
        let mut another_provider = Worker::open_route(
            &fixture,
            "fixture-model",
            None,
            vec![Reply::Finished("Selected another provider")],
        )
        .await;
        another_provider.load(&fixture, &session).await;
        another_provider
            .prompt(&session, "Continue on the selected compatible provider")
            .await;
        let portable = another_provider.requests[0]["messages"].to_string();
        assert!(portable.contains("First model answer"));
        assert!(portable.contains("Selected new principal"));
        assert!(!portable.contains("encrypted_content"));
        assert!(!portable.contains(&format!("private-{SECOND}")));
        another_provider.close().await;
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn paused_responses_retry_reopens_under_the_same_credential_only() {
    use super::approvals::Stdio as StdioClient;
    use super::lifecycle::{prompt_request, task_basis};

    async fn start(state: &Path, endpoint: &str, key: &str) -> StdioClient {
        let mut command = executable();
        command.args(["serve", "--stdio", "--provider", "responses"]);
        configured(&mut command, state, endpoint);
        let mut client = StdioClient::from_child(
            command
                .env("GRIDA_AGENT_PROCESS_TEST_KEY", key)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap(),
        );
        let mut initialization = extension_initialize();
        initialization["clientCapabilities"]["_meta"]["co.grida/session/turn-summary"] = 1.into();
        let ready = client.request("initialize", initialization).await;
        assert_eq!(ready["result"]["protocolVersion"], 1, "{ready}");
        client
    }

    async fn snapshot(client: &mut StdioClient, session: &str) -> Value {
        let reply = client
            .request("_co.grida/session/snapshot", json!({"sessionId":session}))
            .await;
        reply
            .get("result")
            .unwrap_or_else(|| panic!("{reply}"))
            .clone()
    }

    async fn wait_for(
        client: &mut StdioClient,
        session: &str,
        ready: impl Fn(&Value) -> bool,
    ) -> Value {
        timeout(WAIT, async {
            loop {
                let snapshot = snapshot(client, session).await;
                if ready(&snapshot) {
                    return snapshot;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap()
    }

    for rotated in [false, true] {
        let temp = TempDir::new().unwrap();
        let state = temp.path().join("state");
        let workspace = TempDir::new().unwrap();
        let mut replies = vec![Reply::RateLimited {
            code: "rate_limit_exceeded",
            retry_after: &["5"],
        }];
        if !rotated {
            replies.push(Reply::Finished("Recovered after restart."));
        }
        let mut endpoint =
            Endpoint::start_protocol(ProviderProtocol::Responses, replies, Some(TEST_CREDENTIAL))
                .await;
        let mut first = start(&state, &endpoint.url, TEST_CREDENTIAL).await;
        let attach = json!({"cwd":workspace.path(),"mcpServers":[]});
        let created = first.request("session/new", attach.clone()).await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let accepted = first
            .request(
                "_co.grida/session/submit",
                prompt_request(session, "retry", "Check the original request."),
            )
            .await;
        let turn = accepted["result"]["turnId"].as_str().unwrap();
        let request = endpoint.request().await;
        let waiting = wait_for(&mut first, session, |view| {
            view["retryNotBeforeMs"].is_u64()
        })
        .await;
        let due = &waiting["retryNotBeforeMs"];
        let held = first
            .request(
                "_co.grida/session/pause",
                task_basis(&waiting, session, "hold-retry"),
            )
            .await;
        assert_eq!(held["result"]["turnId"], turn, "{held}");
        let paused = wait_for(&mut first, session, |view| {
            view["current"]["disposition"] == "suspended"
        })
        .await;
        assert_eq!(&paused["retryNotBeforeMs"], due);
        first.close().await;

        let key = if rotated {
            "rotated-fixture-key"
        } else {
            TEST_CREDENTIAL
        };
        let mut second = start(&state, &endpoint.url, key).await;
        let mut load = attach;
        load["sessionId"] = session.into();
        let loaded = second.request("session/load", load).await;
        assert!(loaded["result"].is_object(), "{loaded}");
        let restored = snapshot(&mut second, session).await;
        assert_eq!(restored, paused);
        assert!(endpoint.requests.try_recv().is_err());
        let resume = json!({
            "task":task_basis(&restored,session,"resume-retry"),
            "expectedEpoch":restored["current"]["epoch"],
            "expectedJournalPosition":restored["current"]["journalPosition"],
        });
        let resumed = second
            .request("_co.grida/session/resume", resume.clone())
            .await;
        if rotated {
            assert_eq!(
                resumed["error"]["data"], "session_active_route_changed",
                "{resumed}"
            );
            assert_eq!(snapshot(&mut second, session).await, paused);
        } else {
            assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
            assert_eq!(
                second.request("_co.grida/session/resume", resume).await["result"],
                resumed["result"]
            );
            let ended = wait_for(&mut second, session, |view| view["current"].is_null()).await;
            assert_eq!(ended["latest"]["status"], "succeeded", "{ended}");
            assert!(ended.get("retryNotBeforeMs").is_none());
            assert_eq!(endpoint.request().await, request);
            let account = second
                .request(
                    "_co.grida/session/turn-summary",
                    json!({"sessionId":session,"turnId":turn}),
                )
                .await;
            assert_eq!(account["result"]["steps"], 2, "{account}");
            assert_eq!(account["result"]["text"], "Recovered after restart.");
        }
        assert!(endpoint.requests.try_recv().is_err());
        second.close().await;
        endpoint.done().await;
    }
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
