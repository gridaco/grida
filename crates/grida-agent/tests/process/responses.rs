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
    use super::*;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use std::collections::{BTreeMap, VecDeque};

    const FIRST: &str = "openai/gpt-5.6-sol";
    const SECOND: &str = "openai/gpt-5.6-terra";
    const ENDPOINT: &str = "https://chatgpt.com/backend-api/codex";

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
            ] {
                initialize["clientCapabilities"]["_meta"][format!("co.grida/{capability}")] =
                    1.into();
            }
            let ready = worker.request("initialize", initialize).await;
            assert_eq!(ready["result"]["protocolVersion"], 1, "{ready}");
            assert_eq!(
                ready["result"]["agentCapabilities"]["_meta"]["co.grida/session/effort"], 1,
                "{ready}"
            );
            assert!(
                ready["result"]["agentCapabilities"]["_meta"]["co.grida/goal/spending"].is_null()
            );
            worker
        }

        async fn request(&mut self, method: &str, params: Value) -> Value {
            let id = self.client.send(method, params).await;
            loop {
                let frame = self.client.read_frame().await;
                match frame["method"].as_str() {
                    Some("_co.grida/provider/exchange") => self.exchange(frame).await,
                    Some("_co.grida/provider/cancel") => {
                        self.cancelled += 1;
                        self.exchanges
                            .remove(frame["params"]["id"].as_str().unwrap());
                    }
                    Some("session/update") => self.updates.push(frame["params"]["update"].clone()),
                    None if frame["id"] == id => return frame,
                    _ => {}
                }
            }
        }

        async fn exchange(&mut self, frame: Value) {
            let params = &frame["params"];
            let id = params["id"].as_str().unwrap().to_owned();
            let reply = match params["action"].as_str().unwrap() {
                "open" => {
                    let path = if self.protocol == ProviderProtocol::Responses {
                        "responses"
                    } else {
                        "chat/completions"
                    };
                    assert_eq!(params["target"], format!("{}/{path}", self.endpoint));
                    assert_eq!(params["headers"].as_array().unwrap().len(), 2);
                    for header in params["headers"].as_array().unwrap() {
                        assert!(matches!(
                            header[0].as_str(),
                            Some("content-type" | "accept")
                        ));
                    }
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
                    let model = if self.protocol == ProviderProtocol::Responses {
                        self.model.strip_prefix("openai/").unwrap()
                    } else {
                        &self.model
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
            timeout(WAIT, async {
                loop {
                    let view = self
                        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                        .await;
                    assert!(view.get("error").is_none(), "{view}");
                    if view["result"]["current"].is_null() && view["result"]["latest"].is_object() {
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
