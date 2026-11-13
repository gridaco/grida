//! GRIDA-SEC-004 — the built private host retains child scope and assignment evidence.

use super::approvals::Stdio as PrivateStdio;
use super::lifecycle::task_basis;
use super::summaries::reported_usage_answer;
use super::*;

const CREATE: &str = "_co.grida/subagent/create";
const ASSIGN: &str = "_co.grida/subagent/assign";
const SEND_MESSAGE: &str = "_co.grida/subagent/send-message";
const LIST: &str = "_co.grida/subagent/list";
const INSPECT: &str = "_co.grida/subagent/inspect";
const STOP: &str = "_co.grida/subagent/stop";
const PAUSE: &str = "_co.grida/subagent/pause";
const RESUME: &str = "_co.grida/subagent/resume";
const STEER: &str = "_co.grida/subagent/steer";
const RESUME_QUEUE: &str = "_co.grida/subagent/resume-queue";
const WITHDRAW: &str = "_co.grida/subagent/withdraw";
const SUMMARY: &str = "_co.grida/session/turn-summary";
const EFFORT: &str = "_co.grida/session/effort";
const GATEWAY_BILLING: &str = "_co.grida/gateway/billing-status";
const GATEWAY_CHILD_BILLING: &str = "co.grida/gateway/child-billing";
const CAPABILITIES: [&str; 11] = [
    CREATE,
    ASSIGN,
    SEND_MESSAGE,
    LIST,
    INSPECT,
    STOP,
    PAUSE,
    RESUME,
    STEER,
    RESUME_QUEUE,
    WITHDRAW,
];

#[tokio::test]
async fn supervised_children_refuse_unreviewed_provider_profiles() {
    let temporary = TempDir::new().unwrap();
    let home = temporary.path().join("credentials");
    for extra in [
        vec!["--endpoint", "http://127.0.0.1:1/v1"],
        vec!["--endpoint", "https://openrouter.ai/api/v1"],
        vec![
            "--endpoint",
            "https://api.openai.com/v1",
            "--credential-home",
            home.to_str().unwrap(),
        ],
        vec![
            "--endpoint",
            "https://openrouter.ai/api/v1",
            "--credential-home",
            home.to_str().unwrap(),
            "--supervised-configured-endpoint-key",
            "custom",
        ],
        vec![
            "--endpoint",
            "https://openrouter.ai/api/v1",
            "--supervised-chatgpt-scope",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ],
    ] {
        let output = executable()
            .args([
                "serve",
                "--stdio",
                "--subagents",
                "--supervised-provider",
                "--state-dir",
            ])
            .arg(temporary.path().join("state"))
            .args(["--model", "fixture-model"])
            .args(extra)
            .stdin(Stdio::null())
            .output()
            .await
            .unwrap();
        assert!(!output.status.success());
        assert!(
            String::from_utf8_lossy(&output.stderr)
                .contains("subagent_supervised_provider_unsupported"),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn supervised_stored_vendor_children_keep_the_selected_route_after_restart() {
    use base64::{Engine, engine::general_purpose::STANDARD};

    async fn start(state: &Path, home: &Path, endpoint: &str, model: &str) -> PrivateStdio {
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
            .args(["--endpoint", endpoint, "--model", model])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut client = PrivateStdio::from_child(child);
        let mut initialize = extension_initialize();
        let meta = &mut initialize["clientCapabilities"]["_meta"];
        for key in CAPABILITIES {
            meta[&key[1..]] = 1.into();
        }
        meta["co.grida/provider/egress"] = 1.into();
        for capability in [
            "co.grida/session/effort",
            "co.grida/goal/start",
            "co.grida/goal/funded-review",
            "co.grida/goal/named-child",
        ] {
            meta[capability] = 1.into();
        }
        let ready = client.request("initialize", initialize).await;
        assert_eq!(
            ready["result"]["agentCapabilities"]["_meta"][&CREATE[1..]],
            1,
            "{ready}"
        );
        assert_eq!(
            ready["result"]["agentCapabilities"]["_meta"]["co.grida/session/effort"], 1,
            "{ready}"
        );
        for capability in ["co.grida/goal/funded-review", "co.grida/goal/named-child"] {
            assert_eq!(
                ready["result"]["agentCapabilities"]["_meta"][capability], 1,
                "{ready}"
            );
        }
        client
    }

    async fn infer(
        client: &mut PrivateStdio,
        method: &str,
        request: Value,
        endpoint: &str,
    ) -> Value {
        let ultra = request["effort"] == "ultra";
        let id = client.send(method, request).await;
        let mut chunk = Some(STANDARD.encode(concat!(
            "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Done.\"},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n"
        )));
        let mut result = None;
        let mut finished = false;
        while result.is_none() || !finished {
            let frame = client.read_frame().await;
            let params = &frame["params"];
            match frame["method"].as_str() {
                Some("_co.grida/provider/exchange") => {
                    let reply = match params["action"].as_str() {
                        Some("open") => {
                            assert_eq!(params["target"], format!("{endpoint}/chat/completions"));
                            assert!(
                                params["headers"]
                                    .as_array()
                                    .unwrap()
                                    .contains(&json!(["authorization", "Bearer fixture-key"]))
                            );
                            let body = STANDARD
                                .decode(params["initial"].as_str().unwrap())
                                .unwrap();
                            let body: Value = serde_json::from_slice(&body).unwrap();
                            assert_eq!(body["model"], "fixture-model");
                            for tool in ["delegate_review", "collect_review"] {
                                assert_eq!(
                                    body["tools"].as_array().is_some_and(|tools| tools
                                        .iter()
                                        .any(|offer| offer["function"]["name"] == tool)),
                                    ultra,
                                    "{body}"
                                );
                            }
                            json!({"status":"accepted"})
                        }
                        Some("dispatch") => json!({"status":"ready","httpStatus":200}),
                        Some("read") => match chunk.take() {
                            Some(data) => json!({"status":"chunk","data":data}),
                            None => json!({"status":"end"}),
                        },
                        _ => panic!("unexpected exchange {frame}"),
                    };
                    client.respond(&frame["id"], reply).await;
                }
                Some("_co.grida/provider/cancel") => finished = true,
                None if frame["id"] == id => {
                    assert!(frame.get("error").is_none(), "{frame}");
                    result = Some(frame["result"].clone());
                }
                _ => {}
            }
        }
        result.unwrap()
    }

    for (provider, endpoint) in [
        ("openrouter", "https://openrouter.ai/api/v1"),
        ("vercel", "https://ai-gateway.vercel.sh/v1"),
    ] {
        let temporary = TempDir::new().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        let home = root.join("credentials");
        let state = root.join("state");
        let workspace = root.join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        let credentials = grida_auth::ProviderStore::new(home.clone()).unwrap();
        credentials.set(provider, "fixture-key").unwrap();
        let mut client = start(&state, &home, endpoint, "fixture-model").await;
        let parent = new_session(&mut client, &workspace).await;
        let forbidden = client.request("_co.grida/goal/start", json!({
            "sessionId":parent,"inputId":"unfunded-goal","effort":"ultra",
            "prompt":[{"type":"text","text":"Try a funded Goal"}],
            "goal":{"objective":{"description":"Review the draft","criteria":["Draft is reviewed"]},"allowance":{"work_turns":1,"inference_steps":2}}
        })).await;
        assert_eq!(
            forbidden["error"]["data"], "goal_child_allowance_unavailable",
            "{forbidden}"
        );
        let prompt = json!({"sessionId":parent,"prompt":[{"type":"text","text":"Parent"}]});
        assert_eq!(
            infer(&mut client, "session/prompt", prompt, endpoint).await["stopReason"],
            "end_turn"
        );
        let snapshot = client
            .request("_co.grida/session/snapshot", json!({"sessionId":parent}))
            .await;
        let turn = snapshot["result"]["latest"]["turnId"].as_str().unwrap();
        let created = client.request(CREATE, create(&parent)).await;
        let child = created["result"]["childId"].as_str().unwrap();
        let work = assign(&parent, child, turn, "child-input", "Investigate");
        assert_eq!(
            infer(&mut client, ASSIGN, work.clone(), endpoint).await["disposition"]["kind"],
            "queued"
        );
        let completed = wait_for(&mut client, &parent, child, "child-input", |view| {
            view["assignment"]["disposition"]["kind"] == "completed"
        })
        .await;
        let ultra = infer(
            &mut client,
            "_co.grida/session/submit",
            json!({
                "sessionId":parent,"inputId":"ordinary-ultra","effort":"ultra",
                "prompt":[{"type":"text","text":"Review this draft"}]
            }),
            endpoint,
        )
        .await;
        assert_eq!(ultra["inputId"], "ordinary-ultra");
        timeout(WAIT, async {
            loop {
                let input = client
                    .request(
                        "_co.grida/session/input",
                        json!({"sessionId":parent,"inputId":"ordinary-ultra"}),
                    )
                    .await;
                if input["result"]["receipt"]["disposition"] == "completed" {
                    break;
                }
                assert!(input.get("error").is_none(), "{input}");
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        client.close().await;
        let mut reopened = start(&state, &home, endpoint, "fixture-model").await;
        load_parent(&mut reopened, &parent, &workspace).await;
        let retained = inspect(&mut reopened, &parent, child, "child-input").await;
        assert_eq!(
            retained["assignment"]["disposition"],
            completed["assignment"]["disposition"]
        );
        let exact_retry = reopened.request(ASSIGN, work).await;
        assert_eq!(exact_retry["result"]["disposition"]["kind"], "completed");
        let denied_id = reopened
            .send(
                ASSIGN,
                assign(&parent, child, turn, "revoked-during-upload", "More work"),
            )
            .await;
        let mut accepted = false;
        let mut revoked = false;
        let mut cancelled = false;
        while !accepted || !cancelled {
            let frame = reopened.read_frame().await;
            match frame["method"].as_str() {
                Some("_co.grida/provider/exchange") => {
                    assert_eq!(frame["params"]["action"], "open", "{frame}");
                    credentials.set(provider, "rotated-fixture-key").unwrap();
                    revoked = true;
                    reopened
                        .respond(&frame["id"], json!({"status":"accepted"}))
                        .await;
                }
                Some("_co.grida/provider/cancel") => {
                    assert!(revoked);
                    cancelled = true;
                }
                None if frame["id"] == denied_id => {
                    assert!(frame.get("error").is_none(), "{frame}");
                    accepted = true;
                }
                _ => {}
            }
        }
        reopened.close().await;

        let (other_provider, other_endpoint) = if provider == "openrouter" {
            ("vercel", "https://ai-gateway.vercel.sh/v1")
        } else {
            ("openrouter", "https://openrouter.ai/api/v1")
        };
        credentials
            .set(other_provider, "other-fixture-key")
            .unwrap();
        let mut other = start(&state, &home, other_endpoint, "fixture-model").await;
        load_parent(&mut other, &parent, &workspace).await;
        let cross_profile = other
            .request(
                ASSIGN,
                assign(&parent, child, turn, "cross-profile", "More work"),
            )
            .await;
        assert!(cross_profile.get("error").is_some(), "{cross_profile}");
        other.close().await;

        credentials.set(provider, "fixture-key").unwrap();
        let mut other_model = start(&state, &home, endpoint, "different-model").await;
        load_parent(&mut other_model, &parent, &workspace).await;
        let wrong_model = other_model
            .request(
                ASSIGN,
                assign(&parent, child, turn, "cross-model", "More work"),
            )
            .await;
        assert!(wrong_model.get("error").is_some(), "{wrong_model}");
        other_model.close().await;

        credentials.set(provider, "rotated-fixture-key").unwrap();
        let mut rotated = start(&state, &home, endpoint, "fixture-model").await;
        load_parent(&mut rotated, &parent, &workspace).await;
        let changed = rotated
            .request(
                ASSIGN,
                assign(&parent, child, turn, "new-after-rotation", "More work"),
            )
            .await;
        assert!(changed.get("error").is_some(), "{changed}");
        rotated.close().await;
    }
}

#[tokio::test]
async fn gateway_summary_attributes_the_exact_ordinary_assignment_after_reuse_and_restart() {
    use base64::{Engine, engine::general_purpose::STANDARD};

    async fn serve_gateway(state: &Path, scope: &str, child_billing: bool) -> PrivateStdio {
        let mut command = executable();
        let process = command
            .args([
                "serve",
                "--stdio",
                "--subagents",
                "--supervised-provider",
                "--state-dir",
            ])
            .arg(state)
            .args([
                "--supervised-gateway-scope",
                scope,
                "--endpoint",
                "https://grida.co/api/v1/ai",
                "--model",
                "openai/gpt-5.6-sol",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut client = PrivateStdio::from_child(process);
        let mut initialize = extension_initialize();
        let meta = &mut initialize["clientCapabilities"]["_meta"];
        for key in CAPABILITIES.into_iter().chain([SUMMARY, GATEWAY_BILLING]) {
            meta[&key[1..]] = 1.into();
        }
        meta["co.grida/provider/egress"] = 1.into();
        if child_billing {
            meta[GATEWAY_CHILD_BILLING] = 1.into();
        }
        let ready = client.request("initialize", initialize).await;
        let advertised = &ready["result"]["agentCapabilities"]["_meta"];
        assert_eq!(advertised[&GATEWAY_BILLING[1..]], 1, "{ready}");
        let child_version = if child_billing { json!(1) } else { Value::Null };
        assert_eq!(advertised[GATEWAY_CHILD_BILLING], child_version, "{ready}");
        client
    }

    async fn inference(
        client: &mut PrivateStdio,
        method: &str,
        request: Value,
        provider_id: &str,
        amount: Option<&str>,
    ) -> Value {
        let id = client.send(method, request).await;
        let response = json!({
            "choices":[{"index":0,"delta":{"content":"Recorded work."},"finish_reason":"stop"}],
            "grida_billing":{
                "version":1,"request_id":provider_id,
                "status":if amount.is_some() { "settled" } else { "pending" },
                "charged_mills":amount,
            }
        });
        let mut chunk = Some(STANDARD.encode(format!("data: {response}\n\ndata: [DONE]\n\n")));
        let mut exchange = None;
        let mut reply = None;
        let mut finished = false;
        while reply.is_none() || !finished {
            let frame = client.read_frame().await;
            let params = &frame["params"];
            match frame["method"].as_str() {
                Some("_co.grida/provider/exchange") => {
                    let result = match params["action"].as_str() {
                        Some("open") => {
                            assert!(exchange.is_none(), "{frame}");
                            assert_eq!(
                                params["target"],
                                "https://grida.co/api/v1/ai/chat/completions"
                            );
                            exchange = Some(params["id"].clone());
                            json!({"status":"accepted"})
                        }
                        Some("dispatch") => {
                            json!({"status":"ready","httpStatus":200,"requestId":provider_id})
                        }
                        Some("read") => match chunk.take() {
                            Some(data) => json!({"status":"chunk","data":data}),
                            None => json!({"status":"end"}),
                        },
                        _ => panic!("unexpected reverse request {frame}"),
                    };
                    assert_eq!(exchange.as_ref(), Some(&params["id"]));
                    client.respond(&frame["id"], result).await;
                }
                Some("_co.grida/provider/cancel") => {
                    assert_eq!(exchange.as_ref(), Some(&params["id"]));
                    assert!(chunk.is_none());
                    finished = true;
                }
                None if frame["id"] == id => {
                    assert!(frame.get("error").is_none(), "{frame}");
                    reply = Some(frame["result"].clone());
                }
                _ => {}
            }
        }
        reply.unwrap()
    }

    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let scope = "a".repeat(64);
    let mut first = serve_gateway(&state, &scope, true).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let mut child = None;
    let mut parent_turns = Vec::new();
    let mut child_turns = Vec::new();
    for (turn, input, amount) in [
        ("first", "assignment-one", None),
        ("second", "assignment-two", Some("3.25")),
    ] {
        let prompt = json!({"sessionId":parent,"prompt":[{"type":"text","text":turn}]});
        let result = inference(
            &mut first,
            "session/prompt",
            prompt,
            &format!("req_parent_{turn}"),
            Some("1"),
        )
        .await;
        assert_eq!(result["stopReason"], "end_turn");
        let parent_view = first
            .request("_co.grida/session/snapshot", json!({"sessionId":parent}))
            .await;
        let parent_turn = parent_view["result"]["latest"]["turnId"]
            .as_str()
            .unwrap()
            .to_owned();
        parent_turns.push(parent_turn.clone());
        let summary = first
            .request(SUMMARY, json!({"sessionId":parent,"turnId":parent_turn}))
            .await;
        assert_eq!(
            summary["result"]["gatewayBilling"]["children"],
            json!({"assignments":[],"coverageIncomplete":false})
        );
        if child.is_none() {
            let created = first.request(CREATE, create(&parent)).await;
            child = Some(created["result"]["childId"].as_str().unwrap().to_owned());
        }
        let child_id = child.as_deref().unwrap();
        let work = assign(&parent, child_id, &parent_turn, input, turn);
        let accepted = inference(
            &mut first,
            ASSIGN,
            work,
            &format!("req_child_{turn}"),
            amount,
        )
        .await;
        assert_eq!(accepted["disposition"]["kind"], "queued");
        let settled = wait_for(&mut first, &parent, child_id, input, |view| {
            view["assignment"]["disposition"]["kind"] == "completed"
        })
        .await;
        child_turns.push(settled["assignment"]["disposition"]["turn"].clone());
    }
    first.close().await;

    let load = json!({"sessionId":parent,"cwd":workspace.path(),"mcpServers":[]});
    let mut reopened = serve_gateway(&state, &scope, true).await;
    assert!(reopened.request("session/load", load.clone()).await["result"].is_object());
    let mut previous_attempt = Value::Null;
    for (index, input, kind) in [
        (0, "assignment-one", "pending"),
        (1, "assignment-two", "settled"),
    ] {
        let summary = reopened
            .request(
                SUMMARY,
                json!({"sessionId":parent,"turnId":parent_turns[index]}),
            )
            .await;
        let billing = &summary["result"]["gatewayBilling"];
        assert!(billing["review"].is_null(), "{summary}");
        assert_eq!(billing["attempts"][0]["chargedMills"], "1", "{summary}");
        let page = &billing["children"];
        assert_eq!(page["coverageIncomplete"], false, "{summary}");
        let [assignment] = page["assignments"].as_array().unwrap().as_slice() else {
            panic!("expected one exact assignment: {summary}");
        };
        assert_eq!(assignment["childId"], child.as_deref().unwrap());
        assert_eq!(assignment["inputId"], input);
        assert_eq!(assignment["name"], "Researcher");
        assert_eq!(assignment["disposition"]["turn"], child_turns[index]);
        let attempt = &assignment["billing"]["attempts"][0];
        assert_eq!(attempt["kind"], kind);
        if index == 0 {
            assert_eq!(attempt["refreshable"], true);
            previous_attempt = attempt.clone();
        } else {
            assert_eq!(attempt["chargedMills"], "3.25");
        }
    }
    let mut refresh = json!({
        "sessionId":parent, "turnId":parent_turns[1],
        "operationId":previous_attempt["operationId"], "attemptId":previous_attempt["attemptId"],
        "child":{"childId":child,"inputId":"assignment-one"},
    });
    let wrong_page = reopened
        .request(
            SUMMARY,
            json!({
                "sessionId":parent,"turnId":parent_turns[1],"childBillingAfter":refresh["child"],
            }),
        )
        .await;
    assert_eq!(wrong_page["error"]["data"], "invalid_turn_link_cursor");
    let stale = reopened.request(GATEWAY_BILLING, refresh.clone()).await;
    assert_eq!(stale["result"]["kind"], "unavailable", "{stale}");
    refresh["turnId"] = json!(parent_turns[0]);
    let id = reopened.send(GATEWAY_BILLING, refresh).await;
    let reverse = reopened.read_reply().await;
    assert_eq!(reverse["method"], "_co.grida/gateway/read-job-billing");
    assert_eq!(reverse["params"]["requestId"], "req_child_first");
    reopened
        .respond(&reverse["id"], json!({"kind":"settled","chargedMills":"0"}))
        .await;
    let settled = reopened.read_reply().await;
    assert_eq!(settled["id"], id);
    assert_eq!(
        settled["result"],
        json!({"kind":"settled","chargedMills":"0"})
    );
    reopened.close().await;

    let mut legacy = serve_gateway(&state, &scope, false).await;
    assert!(legacy.request("session/load", load).await["result"].is_object());
    let summary = legacy
        .request(
            SUMMARY,
            json!({"sessionId":parent,"turnId":parent_turns[0]}),
        )
        .await;
    assert_eq!(
        summary["result"]["gatewayBilling"]["attempts"][0]["chargedMills"],
        "1"
    );
    assert!(summary["result"]["gatewayBilling"]["children"].is_null());
    legacy.close().await;

    let mut foreign = serve_gateway(&state, &"b".repeat(64), true).await;
    let load = json!({"sessionId":parent,"cwd":workspace.path(),"mcpServers":[]});
    assert!(foreign.request("session/load", load).await["result"].is_object());
    let foreign_summary = foreign
        .request(
            SUMMARY,
            json!({"sessionId":parent,"turnId":parent_turns[0]}),
        )
        .await;
    assert!(
        foreign_summary["result"]["gatewayBilling"].is_null(),
        "{foreign_summary}"
    );
    foreign.close().await;
}

async fn serve(state: &Path, endpoint: &str) -> PrivateStdio {
    serve_with_key(state, endpoint, TEST_CREDENTIAL).await
}

async fn serve_with_key(state: &Path, endpoint: &str, key: &str) -> PrivateStdio {
    let mut command = executable();
    command.args([
        "serve",
        "--stdio",
        "--subagents",
        "--max-output-tokens",
        "128",
    ]);
    configured(&mut command, state, endpoint);
    command.env("GRIDA_AGENT_PROCESS_TEST_KEY", key);
    connect_subagents(command).await
}

async fn connect_subagents(mut command: Command) -> PrivateStdio {
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = PrivateStdio::from_child(child);
    let mut request = extension_initialize();
    for key in CAPABILITIES.into_iter().chain([SUMMARY, EFFORT]) {
        request["clientCapabilities"]["_meta"][&key[1..]] = 1.into();
    }
    let response = client.request("initialize", request).await;
    for key in CAPABILITIES.into_iter().chain([SUMMARY, EFFORT]) {
        assert_eq!(
            response["result"]["agentCapabilities"]["_meta"][&key[1..]],
            1
        );
    }
    client
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn ordinary_ultra_reviewer_reads_only_its_captured_primary_across_restart() {
    verify_primary_reviewer("act", true).await;
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn ordinary_ultra_plan_reviewer_reads_only_its_captured_primary_across_restart() {
    verify_primary_reviewer("plan", true).await;
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn ordinary_ultra_parent_collects_the_primary_review_finding() {
    verify_primary_reviewer("act", false).await;
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
async fn verify_primary_reviewer(regime: &str, interrupt: bool) {
    const PRIMARY: &str = "PRIMARY REVIEW FIXTURE CONTENT";
    const PRIVATE: &str = "ADDITIONAL ROOT MUST STAY PRIVATE";
    const FINDING: &str = "The primary file is ready for review.";
    fn reply(request: &Value, interrupt: bool) -> Reply {
        let messages = request["messages"].to_string();
        if !messages.contains("You are a subagent.") {
            return if interrupt || messages.contains(FINDING) {
                Reply::Finished("Parent step finished.")
            } else {
                Reply::Tool("collect_review", "{}")
            };
        }
        if messages.contains(PRIMARY) {
            return if interrupt {
                Reply::Hold("Review is ready for interruption.")
            } else {
                Reply::Finished(FINDING)
            };
        }
        let calls = json!([
            {"index":0,"id":"primary","type":"function","function":{
                "name":"read_file","arguments":r#"{"path":"review.txt"}"#}},
            {"index":1,"id":"foreign","type":"function","function":{
                "name":"read_file","arguments":r#"{"directory":"extra","path":"private.txt"}"#}},
        ]);
        let delta = json!({"id":"fixture-response","choices":[{"index":0,
            "delta":{"role":"assistant","tool_calls":calls},"finish_reason":null}]});
        let finish = json!({"id":"fixture-response","choices":[{"index":0,
            "delta":{},"finish_reason":"tool_calls"}]});
        let body = format!("data: {delta}\n\ndata: {finish}\n\ndata: [DONE]\n\n");
        Reply::RawHttp(format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ))
    }
    let fixture = super::approvals::Fixture::new(false);
    let mut profile: Value =
        serde_json::from_slice(&std::fs::read(&fixture.profile).unwrap()).unwrap();
    if !interrupt {
        profile["directories"][1]["read"] = json!("allow");
        std::fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    }
    let extra = profile["directories"][1]["path"].as_str().unwrap();
    std::fs::write(fixture.primary.join("review.txt"), PRIMARY).unwrap();
    std::fs::write(Path::new(extra).join("private.txt"), PRIVATE).unwrap();
    let follow_ups = if interrupt { 3 } else { 4 };
    let mut replies = vec![Reply::Tool(
        "delegate_review",
        r#"{"instructions":"Check the primary workspace."}"#,
    )];
    replies.extend(
        (0..follow_ups).map(|_| Reply::Choose(Box::new(move |request| reply(request, interrupt)))),
    );
    replies.push(Reply::Finished("Unexpected duplicate dispatch."));
    let mut endpoint = Endpoint::start(replies).await;
    let endpoint_url = endpoint.url.clone();
    let open = || {
        let mut command = fixture.process(&endpoint_url, "serve");
        command.args(["--stdio", "--subagents", "--max-output-tokens", "128"]);
        connect_subagents(command)
    };
    let mut host = open().await;
    let parent = new_session(&mut host, &fixture.primary).await;
    let submitted = host
        .request(
            "_co.grida/session/submit",
            json!({
                "sessionId":parent,"inputId":"review-primary","effort":"ultra","operatingRegime":regime,
                "prompt":[{"type":"text","text":"Assess the project."}],
            }),
        )
        .await;
    let parent_turn = submitted["result"]["turnId"].as_str().unwrap();
    let first = endpoint.request().await;
    assert!(first["tools"].to_string().contains("delegate_review"));
    assert!(
        first["messages"]
            .to_string()
            .contains("may inspect the primary workspace using read-only tools")
    );
    let mut reviewer_requests = Vec::new();
    let mut collected = false;
    for _ in 0..follow_ups {
        let request = endpoint.request().await;
        let messages = request["messages"].to_string();
        if messages.contains("You are a subagent.") {
            reviewer_requests.push(request);
        } else if messages.contains(FINDING) {
            assert!(!messages.contains(PRIVATE));
            collected = true;
        }
    }
    let [first, second] = reviewer_requests.as_slice() else {
        panic!("expected exact reviewer requests: {reviewer_requests:?}");
    };
    let names = first["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["function"]["name"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(names, ["list_files", "read_file", "search_text"]);
    let messages = first["messages"].to_string();
    assert!(!messages.contains(extra) && !messages.contains(fixture.primary.to_str().unwrap()));
    let messages = second["messages"].to_string();
    assert!(
        messages.contains(PRIMARY) && messages.contains("permission_denied"),
        "{messages}"
    );
    assert!(!messages.contains(PRIVATE) && !messages.contains(extra));
    let children = host.request(LIST, json!({"parentSessionId":parent})).await;
    let child = children["result"]["children"][0]["childId"]
        .as_str()
        .unwrap();
    let assignment = observed_assignment(&mut host, &parent, child).await;
    let input = assignment["inputId"].as_str().unwrap();
    assert_eq!(assignment["parentTurnId"], parent_turn);
    assert_eq!(assignment["maxGenerationSteps"], 2);
    if !interrupt {
        assert!(collected, "the parent receives the settled review finding");
        let terminal = wait_for(&mut host, &parent, child, input, |view| {
            view["current"].is_null()
        })
        .await;
        assert_eq!(
            terminal["assignment"]["result"]["status"], "succeeded",
            "{terminal}"
        );
        assert_eq!(terminal["assignment"]["result"]["steps"], 2, "{terminal}");
        host.close().await;
        assert!(
            timeout(Duration::from_millis(100), endpoint.requests.recv())
                .await
                .is_err()
        );
        endpoint.abort().await;
        return;
    }
    let active = inspect(&mut host, &parent, child, input).await;
    let paused = host
        .request(PAUSE, child_basis(&active, &parent, child, "pause"))
        .await;
    assert!(paused.get("error").is_none(), "{paused}");
    let paused = wait_for(&mut host, &parent, child, input, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    host.close().await;
    let resume = resume_basis(&paused, &parent, child, "resume");
    let mut changed_profile = profile.clone();
    changed_profile["revision"] = json!("changed-permissions");
    std::fs::write(
        &fixture.profile,
        serde_json::to_vec(&changed_profile).unwrap(),
    )
    .unwrap();
    let mut changed = open().await;
    load_parent(&mut changed, &parent, &fixture.primary).await;
    let refused = changed.request(RESUME, resume.clone()).await;
    assert_eq!(
        refused["error"]["data"], "permission_profile_changed",
        "{refused}"
    );
    assert_eq!(inspect(&mut changed, &parent, child, input).await, paused);
    changed.close().await;
    assert!(endpoint.requests.try_recv().is_err());
    std::fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let mut reopened = open().await;
    load_parent(&mut reopened, &parent, &fixture.primary).await;
    let resumed = reopened.request(RESUME, resume.clone()).await;
    assert_eq!(
        resumed["result"]["turn"]["turnId"], paused["current"]["turnId"],
        "{resumed}"
    );
    let terminal = wait_for(&mut reopened, &parent, child, input, |view| {
        view["current"].is_null()
    })
    .await;
    let result = &terminal["assignment"]["result"];
    assert_eq!(result["steps"], 2, "{result}");
    assert_eq!(result["unresolvedOperations"], 1, "{result}");
    assert_eq!(result["toolActivity"]["succeeded"], 1, "{result}");
    assert_eq!(result["toolActivity"]["failed"], 1, "{result}");
    let replay = reopened.request(RESUME, resume).await;
    assert_eq!(
        replay["result"]["requestId"],
        resumed["result"]["requestId"]
    );
    assert_eq!(replay["result"]["turn"], terminal["latest"], "{replay}");
    reopened.close().await;
    assert!(
        timeout(Duration::from_millis(100), endpoint.requests.recv())
            .await
            .is_err()
    );
    endpoint.abort().await;
}

async fn new_session(client: &mut PrivateStdio, workspace: &Path) -> String {
    let result = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    result["result"]["sessionId"].as_str().unwrap().into()
}

async fn settle_parent(client: &mut PrivateStdio, parent: &str) -> String {
    let result = client
        .request(
            "session/prompt",
            json!({
                "sessionId":parent,
                "prompt":[{"type":"text","text":"Parent-only context."}]
            }),
        )
        .await;
    assert_eq!(result["result"]["stopReason"], "end_turn", "{result}");
    let snapshot = client
        .request("_co.grida/session/snapshot", json!({"sessionId":parent}))
        .await;
    snapshot["result"]["latest"]["turnId"]
        .as_str()
        .unwrap()
        .into()
}

fn create(parent: &str) -> Value {
    json!({"parentSessionId":parent,"requestId":"create-researcher","name":"Researcher","workTurns":2})
}

fn assign(parent: &str, child: &str, parent_turn: &str, input: &str, text: &str) -> Value {
    json!({
        "parentSessionId":parent,"childId":child,"parentTurnId":parent_turn,
        "inputId":input,"instructions":text,
    })
}

fn note(parent: &str, child: &str, input: &str, text: &str) -> Value {
    json!({"parentSessionId":parent,"childId":child,"inputId":input,"text":text})
}

async fn inspect(client: &mut PrivateStdio, parent: &str, child: &str, input: &str) -> Value {
    let response = client
        .request(
            INSPECT,
            json!({
                "parentSessionId":parent,"childId":child,"inputId":input,
            }),
        )
        .await;
    assert!(response.get("error").is_none(), "{response}");
    response["result"].clone()
}

async fn observed_assignment(client: &mut PrivateStdio, parent: &str, child: &str) -> Value {
    let reply = client
        .request(INSPECT, json!({"parentSessionId":parent,"childId":child}))
        .await;
    assert!(reply.get("error").is_none(), "{reply}");
    assert!(reply["result"]["assignment"].is_null(), "{reply}");
    reply["result"]["observedAssignment"].clone()
}

async fn wait_for(
    client: &mut PrivateStdio,
    parent: &str,
    child: &str,
    input: &str,
    predicate: impl Fn(&Value) -> bool,
) -> Value {
    let mut latest = Value::Null;
    let result = timeout(WAIT, async {
        loop {
            let view = inspect(client, parent, child, input).await;
            latest = view.clone();
            if predicate(&view) {
                return view;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await;
    result.unwrap_or_else(|_| panic!("the child did not reach the expected state: {latest}"))
}

async fn load_parent(client: &mut PrivateStdio, parent: &str, workspace: &Path) {
    let loaded = client
        .request(
            "session/load",
            json!({"sessionId":parent,"cwd":workspace,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
}

fn child_basis(view: &Value, parent: &str, child: &str, request: &str) -> Value {
    json!({
        "parentSessionId":parent,"childId":child,"turnId":view["current"]["turnId"],
        "requestId":request,"expectedSessionRevision":view["sessionRevision"],
        "expectedControlRevision":view["current"]["controlRevision"],
    })
}

fn resume_basis(view: &Value, parent: &str, child: &str, request: &str) -> Value {
    json!({
        "task":child_basis(view,parent,child,request),
        "expectedEpoch":view["current"]["epoch"],
        "expectedJournalPosition":view["current"]["journalPosition"],
    })
}

fn queue_basis(view: &Value, parent: &str, child: &str, request: &str) -> Value {
    json!({
        "parentSessionId":parent,"childId":child,"requestId":request,
        "expectedSessionRevision":view["sessionRevision"],
    })
}

#[tokio::test]
async fn an_attached_parent_reopens_only_its_named_children_in_bounded_pages() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let provider = Endpoint::start(Vec::new()).await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let other = new_session(&mut first, workspace.path()).await;
    let foreign = first.request(CREATE, create(&other)).await;
    let mut expected = Vec::new();
    for index in 0..33 {
        let name = format!("Researcher {index}");
        let reply = first
            .request(
                CREATE,
                json!({
                    "parentSessionId":parent,
                    "requestId":format!("researcher-{index}"),
                    "name":name,
                    "workTurns":1,
                }),
            )
            .await;
        assert!(reply["result"]["childId"].is_string(), "{reply}");
        expected.push(json!({"childId":reply["result"]["childId"],"name":name}));
    }
    expected.reverse();
    first.close().await;

    let mut reopened = serve(&state, &provider.url).await;
    let first_page = json!({"parentSessionId":parent});
    assert!(
        reopened
            .request(LIST, first_page.clone())
            .await
            .get("error")
            .is_some()
    );
    load_parent(&mut reopened, &parent, workspace.path()).await;
    let page = reopened.request(LIST, first_page).await;
    assert_eq!(page["result"]["parentSessionId"], parent, "{page}");
    assert_eq!(page["result"]["children"], json!(&expected[..32]), "{page}");
    let cursor = &page["result"]["nextAfterChildId"];
    assert_eq!(*cursor, expected[31]["childId"]);
    let remainder = reopened
        .request(
            LIST,
            json!({"parentSessionId":parent,"afterChildId":cursor}),
        )
        .await;
    assert_eq!(remainder["result"]["children"], json!(&expected[32..]));
    assert!(remainder["result"]["nextAfterChildId"].is_null());
    let out_of_scope = reopened
        .request(
            LIST,
            json!({
                "parentSessionId":parent,
                "afterChildId":foreign["result"]["childId"],
            }),
        )
        .await;
    assert_eq!(out_of_scope["error"]["data"], "invalid_session_cursor");
    let newest = expected[0]["childId"].as_str().unwrap();
    assert!(
        observed_assignment(&mut reopened, &parent, newest)
            .await
            .is_null()
    );
    reopened.close().await;
    provider.done().await;
}

#[tokio::test]
async fn named_child_reuses_its_own_context_and_retains_exact_assignment_results() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut provider = Endpoint::start(vec![
        reported_usage_answer("Parent completed.", 13, 5),
        reported_usage_answer("First child finding.", 3, 1),
        reported_usage_answer("Later parent work completed.", 11, 4),
        reported_usage_answer("Second child finding.", 7, 2),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let parent_basis = json!({"sessionId":parent,"turnId":parent_turn});
    let parent_result = first.request(SUMMARY, parent_basis.clone()).await;
    let usage = |input, output| {
        json!({
            "reported": [
                {"category":"input","tokens":input,"partial":false},
                {"category":"output","tokens":output,"partial":false},
                {"category":"cached_input","tokens":"0","partial":false},
            ],
            "attemptsWithoutCounts": 0,
        })
    };
    assert_eq!(parent_result["result"]["tokenUsage"], usage("13", "5"));

    let created = first.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap().to_owned();
    assert_eq!(
        first.request(CREATE, create(&parent)).await["result"],
        created["result"]
    );
    let mut changed = create(&parent);
    changed["name"] = "Different name".into();
    assert!(first.request(CREATE, changed).await.get("error").is_some());

    let other_parent = new_session(&mut first, workspace.path()).await;
    let unrelated = first
        .request(
            INSPECT,
            json!({"parentSessionId":other_parent,"childId":child}),
        )
        .await;
    assert_eq!(unrelated["error"]["data"], "subagent_unavailable");
    let raw = first
        .request(
            "session/load",
            json!({
                "sessionId":child,"cwd":workspace.path(),"mcpServers":[]
            }),
        )
        .await;
    assert_eq!(raw["error"]["data"], "session_missing");
    let catalog = first
        .request("session/list", json!({"cwd":workspace.path()}))
        .await;
    let ids = catalog["result"]["sessions"].as_array().unwrap();
    assert!(ids.iter().all(|session| session["sessionId"] != child));

    let first_input = assign(
        &parent,
        &child,
        &parent_turn,
        "research-one",
        "Check the first point.",
    );
    let accepted = first.request(ASSIGN, first_input.clone()).await;
    assert_eq!(
        accepted["result"]["disposition"]["kind"], "queued",
        "{accepted}"
    );
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    assert!(messages.contains("You are a subagent"));
    assert!(messages.contains("Check the first point."));
    assert!(!messages.contains("Parent-only context."));
    assert!(!messages.contains("Parent completed."));
    assert_eq!(request["max_completion_tokens"], 128);
    assert!(request["tools"].as_array().is_none_or(Vec::is_empty));
    let before = wait_for(&mut first, &parent, &child, "research-one", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    let first_result = &before["assignment"];
    assert_eq!(before["name"], "Researcher");
    assert_eq!(before["allocation"], json!({"workTurns":2,"reserved":1}));
    assert_eq!(first_result["parentTurnId"], parent_turn);
    assert_eq!(first_result["result"]["text"], "First child finding.");
    assert_eq!(first_result["result"]["tokenUsage"], usage("3", "1"));
    assert_eq!(first_result["instructionPreview"], "Check the first point.");
    assert_eq!(first_result["instructionTruncated"], false);
    first.close().await;

    let mut second = serve(&state, &provider.url).await;
    load_parent(&mut second, &parent, workspace.path()).await;
    let retained = inspect(&mut second, &parent, &child, "research-one").await;
    assert_eq!(retained["assignment"], *first_result);
    assert_eq!(
        observed_assignment(&mut second, &parent, &child).await,
        *first_result
    );
    assert_eq!(
        second.request(SUMMARY, parent_basis).await["result"],
        parent_result["result"]
    );
    assert!(matches!(
        provider.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    assert_eq!(
        second.request(ASSIGN, first_input.clone()).await["result"],
        *first_result
    );
    let mut altered = first_input;
    altered["instructions"] = "Different work with the same input ID.".into();
    let conflict = second.request(ASSIGN, altered).await;
    assert_eq!(
        conflict["error"]["data"],
        "subagent_assignment_identity_reused"
    );

    let later_parent = settle_parent(&mut second, &parent).await;
    assert_ne!(later_parent, parent_turn);
    let request = provider.request().await;
    assert!(
        !request["messages"]
            .to_string()
            .contains("First child finding.")
    );
    let instructions = format!("Check the second point. {}", "🧩".repeat(300));
    let follow_up = assign(
        &parent,
        &child,
        &later_parent,
        "research-two",
        &instructions,
    );
    let accepted = second.request(ASSIGN, follow_up).await;
    assert_eq!(
        accepted["result"]["disposition"]["kind"], "queued",
        "{accepted}"
    );
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    assert!(messages.contains("First child finding."));
    assert!(messages.contains("Check the second point."));
    assert!(!messages.contains("Parent-only context."));
    let after = wait_for(&mut second, &parent, &child, "research-two", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(after["allocation"], json!({"workTurns":2,"reserved":2}));
    assert_eq!(after["assignment"]["parentTurnId"], later_parent);
    assert_ne!(
        after["assignment"]["turn"]["turnId"],
        first_result["turn"]["turnId"]
    );
    assert_eq!(
        after["assignment"]["result"]["text"],
        "Second child finding."
    );
    assert_eq!(after["assignment"]["result"]["tokenUsage"], usage("7", "2"));
    let later_result = second
        .request(SUMMARY, json!({"sessionId":parent,"turnId":later_parent}))
        .await;
    assert_eq!(later_result["result"]["tokenUsage"], usage("11", "4"));
    assert_eq!(
        after["assignment"]["instructionPreview"],
        &instructions[..instructions.floor_char_boundary(1024)]
    );
    assert_eq!(after["assignment"]["instructionTruncated"], true);
    assert_eq!(
        observed_assignment(&mut second, &parent, &child).await,
        after["assignment"]
    );
    assert_eq!(
        inspect(&mut second, &parent, &child, "research-one").await["assignment"],
        *first_result
    );
    let over_limit = second
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &later_parent,
                "research-three",
                "Outside the allowance.",
            ),
        )
        .await;
    assert_eq!(over_limit["error"]["data"], "subagent_allocation_exhausted");
    second.close().await;
    provider.done().await;
}

#[tokio::test]
async fn child_messages_wait_for_an_assignment_and_keep_the_exact_delivery_after_restart() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let (release, wait) = tokio::sync::oneshot::channel();
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Release("First child finding.", wait),
        Reply::Finished("Second child finding."),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let created = first.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap();
    let other = new_session(&mut first, workspace.path()).await;
    let unrelated = first
        .request(
            SEND_MESSAGE,
            note(&other, child, "first-note", "Wrong parent"),
        )
        .await;
    assert_eq!(unrelated["error"]["data"], "subagent_unavailable");
    let first_note = note(&parent, child, "first-note", "First contextual fact.");
    let oversized = first
        .request(
            SEND_MESSAGE,
            note(&parent, child, "large-note", &"x".repeat(4 * 1024 + 1)),
        )
        .await;
    assert_eq!(oversized["error"]["data"], "subagent_message_invalid");
    let receipt = first.request(SEND_MESSAGE, first_note.clone()).await;
    let receipt = &receipt["result"];
    assert_eq!(receipt["disposition"]["kind"], "queued");
    assert_eq!(receipt["text"], "First contextual fact.");
    let second_note = note(&parent, child, "second-note", "Second contextual fact.");
    let second = first.request(SEND_MESSAGE, second_note.clone()).await;
    assert_eq!(
        second["result"]["disposition"]["kind"], "queued",
        "{second}"
    );
    let mismatched = first
        .request(
            ASSIGN,
            assign(
                &parent,
                child,
                &parent_turn,
                "first-note",
                "Treat the note as work.",
            ),
        )
        .await;
    assert_eq!(
        mismatched["error"]["data"],
        "subagent_assignment_identity_reused"
    );
    let view = inspect(&mut first, &parent, child, "first-note").await;
    assert_eq!(
        view["pendingMessageIds"],
        json!(["first-note", "second-note"])
    );
    assert_eq!(view["queuedInputIds"], json!([]));
    assert_eq!(view["message"], *receipt);
    assert_eq!(view["allocation"]["reserved"], 0);
    assert!(view["current"].is_null());
    assert!(provider.requests.try_recv().is_err());
    first.close().await;

    let mut reopened = serve(&state, &provider.url).await;
    load_parent(&mut reopened, &parent, workspace.path()).await;
    let work = assign(
        &parent,
        child,
        &parent_turn,
        "first-work",
        "First approved assignment.",
    );
    let accepted = reopened.request(ASSIGN, work.clone()).await;
    assert_eq!(
        accepted["result"]["disposition"]["kind"], "queued",
        "{accepted}"
    );
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    let first = messages.find("First contextual fact.").unwrap();
    let second = messages.find("Second contextual fact.").unwrap();
    let task = messages.find("First approved assignment.").unwrap();
    assert!(first < second && second < task, "{messages}");
    assert!(messages.contains("Informational context from the parent chat"));
    assert!(!messages.contains("Parent-only context."));
    let busy_note = note(&parent, child, "busy-note", "Context sent while busy.");
    let queued = reopened.request(SEND_MESSAGE, busy_note.clone()).await;
    assert_eq!(queued["result"]["disposition"]["kind"], "queued");
    let claimed = inspect(&mut reopened, &parent, child, "first-note").await;
    assert_eq!(claimed["message"]["disposition"]["kind"], "claimed");
    assert_eq!(claimed["pendingMessageIds"], json!(["busy-note"]));
    assert_eq!(claimed["allocation"]["reserved"], 1);
    assert!(!messages.contains("Context sent while busy."));
    release.send(()).unwrap();
    let finished = wait_for(&mut reopened, &parent, child, "first-work", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    let turn = &finished["assignment"]["turn"]["turnId"];
    assert_eq!(
        finished["assignment"]["messageInputIds"],
        json!(["first-note", "second-note"])
    );
    assert_eq!(finished["pendingMessageIds"], json!(["busy-note"]));
    assert!(finished["current"].is_null());
    let delivered = reopened.request(SEND_MESSAGE, first_note.clone()).await;
    assert_eq!(
        delivered["result"]["inputPosition"],
        receipt["inputPosition"]
    );
    assert_eq!(
        delivered["result"]["disposition"],
        json!({"kind":"completed", "turn":turn})
    );
    assert_eq!(
        reopened.request(ASSIGN, work).await["result"],
        finished["assignment"]
    );
    assert!(
        timeout(Duration::from_millis(100), provider.requests.recv())
            .await
            .is_err()
    );
    reopened.close().await;

    let mut followup = serve(&state, &provider.url).await;
    load_parent(&mut followup, &parent, workspace.path()).await;
    assert_eq!(
        followup.request(SEND_MESSAGE, busy_note).await["result"],
        queued["result"]
    );
    let accepted = followup
        .request(
            ASSIGN,
            assign(
                &parent,
                child,
                &parent_turn,
                "second-work",
                "Second approved assignment.",
            ),
        )
        .await;
    assert_eq!(
        accepted["result"]["disposition"]["kind"], "queued",
        "{accepted}"
    );
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    assert_eq!(messages.matches("First contextual fact.").count(), 1);
    assert_eq!(messages.matches("Second contextual fact.").count(), 1);
    assert_eq!(messages.matches("Context sent while busy.").count(), 1);
    assert!(
        messages.find("Context sent while busy.").unwrap()
            < messages.find("Second approved assignment.").unwrap()
    );
    let finished = wait_for(&mut followup, &parent, child, "second-work", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(
        finished["assignment"]["messageInputIds"],
        json!(["busy-note"])
    );
    assert_eq!(finished["pendingMessageIds"], json!([]));
    assert_eq!(finished["allocation"]["reserved"], 2);
    followup.close().await;

    let mut rotated = serve_with_key(&state, &provider.url, "rotated-fixture-key").await;
    load_parent(&mut rotated, &parent, workspace.path()).await;
    assert_eq!(
        rotated.request(SEND_MESSAGE, first_note.clone()).await["result"],
        delivered["result"]
    );
    let different = rotated
        .request(
            SEND_MESSAGE,
            note(&parent, child, "first-note", "Changed body."),
        )
        .await;
    assert_eq!(
        different["error"]["data"],
        "subagent_message_identity_reused"
    );
    let denied = rotated
        .request(
            SEND_MESSAGE,
            note(&parent, child, "new-note", "Wrong provider authority."),
        )
        .await;
    assert_eq!(denied["error"]["data"], "subagent_authority_changed");
    assert!(provider.requests.try_recv().is_err());
    rotated.close().await;

    provider.done().await;
}

#[tokio::test]
async fn shared_connections_cannot_negotiate_child_discovery_or_message_delivery() {
    let temporary = TempDir::new().unwrap();
    let mut provider = Endpoint::start(vec![]).await;
    let mut command = executable();
    command.args([
        "serve",
        "--listen",
        "ws://127.0.0.1:0/acp",
        "--server-token-env",
        "GRIDA_AGENT_SUBAGENT_FIXTURE_TOKEN",
        "--max-output-tokens",
        "128",
    ]);
    configured(&mut command, &temporary.path().join("state"), &provider.url);
    command.env("GRIDA_AGENT_SUBAGENT_FIXTURE_TOKEN", SERVER_TOKEN);
    let (child, url) = spawn_shared_server(command).await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut request = extension_initialize();
    request["clientCapabilities"]["_meta"][&SEND_MESSAGE[1..]] = 1.into();
    request["clientCapabilities"]["_meta"][&LIST[1..]] = 1.into();
    let ready = ws_rpc(&mut socket, 1, "initialize", request).await;
    assert!(ready["result"]["agentCapabilities"]["_meta"][&SEND_MESSAGE[1..]].is_null());
    assert!(ready["result"]["agentCapabilities"]["_meta"][&LIST[1..]].is_null());
    let denied = ws_rpc(
        &mut socket,
        2,
        SEND_MESSAGE,
        note("parent", "child", "note", "data"),
    )
    .await;
    assert_eq!(denied["error"]["code"], -32601, "{denied}");
    let list = ws_rpc(&mut socket, 3, LIST, json!({"parentSessionId":"parent"})).await;
    assert_eq!(list["error"]["code"], -32601, "{list}");
    assert!(provider.requests.try_recv().is_err());
    drop(socket);
    super::lifecycle::terminate_shared_server(child).await;
    provider.done().await;
}

#[tokio::test]
async fn paused_child_accepts_exact_steering_and_resumes_the_same_assignment_after_restart() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let (release, held) = tokio::sync::oneshot::channel();
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Hold("Initial child finding."),
        Reply::Release("Corrected child finding.", held),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let created = first.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap().to_owned();
    let note = first
        .request(
            SEND_MESSAGE,
            note(
                &parent,
                &child,
                "supporting-note",
                "A retained supporting fact.",
            ),
        )
        .await;
    assert_eq!(note["result"]["disposition"]["kind"], "queued", "{note}");
    let accepted = first
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "initial",
                "Investigate the point.",
            ),
        )
        .await;
    assert_eq!(accepted["result"]["maxGenerationSteps"], 2, "{accepted}");
    provider.request().await;
    let running = inspect(&mut first, &parent, &child, "initial").await;
    assert_eq!(
        observed_assignment(&mut first, &parent, &child).await,
        running["assignment"]
    );
    let turn = running["current"]["turnId"].as_str().unwrap().to_owned();
    let other = new_session(&mut first, workspace.path()).await;
    let unrelated = first
        .request(PAUSE, child_basis(&running, &other, &child, "wrong-parent"))
        .await;
    assert_eq!(unrelated["error"]["data"], "subagent_unavailable");
    let pause = child_basis(&running, &parent, &child, "pause-child");
    let paused = first.request(PAUSE, pause.clone()).await;
    assert_eq!(paused["result"]["turnId"], turn, "{paused}");
    assert_eq!(
        first.request(PAUSE, pause).await["result"],
        paused["result"]
    );
    let retained = wait_for(&mut first, &parent, &child, "initial", |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    assert_eq!(retained["current"]["paused"], true);
    first.close().await;

    let steer = json!({
        "task":child_basis(&retained,&parent,&child,"steer-child"),
        "expectedHistoryPosition":retained["current"]["historyPosition"],
        "instructions":"Use this correction.",
    });
    let mut reopened = serve(&state, &provider.url).await;
    load_parent(&mut reopened, &parent, workspace.path()).await;
    let corrected = reopened.request(STEER, steer.clone()).await;
    assert_eq!(corrected["result"]["turnId"], turn, "{corrected}");
    assert_eq!(
        reopened.request(STEER, steer.clone()).await["result"],
        corrected["result"]
    );
    let after_steer = inspect(&mut reopened, &parent, &child, "initial").await;
    assert_eq!(after_steer["current"]["paused"], true);
    assert!(provider.requests.try_recv().is_err());
    let resume = resume_basis(&after_steer, &parent, &child, "resume-child");
    let resumed = reopened.request(RESUME, resume.clone()).await;
    assert_eq!(resumed["result"]["turn"]["turnId"], turn, "{resumed}");
    assert_eq!(resumed["result"]["turn"]["epoch"], 2);
    let request = provider.request().await;
    let messages = request["messages"].to_string();
    assert!(messages.contains("Investigate the point."));
    assert_eq!(messages.matches("A retained supporting fact.").count(), 1);
    assert!(messages.contains("Use this correction."));
    assert!(!messages.contains("Parent-only context."));
    assert!(request["tools"].as_array().is_none_or(Vec::is_empty));
    let retried = reopened.request(RESUME, resume).await;
    assert_eq!(retried["result"]["turn"]["epoch"], 2);
    assert!(provider.requests.try_recv().is_err());
    release.send(()).unwrap();
    let settled = wait_for(&mut reopened, &parent, &child, "initial", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(
        settled["assignment"]["result"]["text"],
        "Corrected child finding."
    );
    assert_eq!(settled["assignment"]["result"]["steps"], 2);
    assert_eq!(settled["allocation"]["reserved"], 1);
    assert_eq!(settled["assignment"]["parentTurnId"], parent_turn);
    assert_eq!(
        settled["assignment"]["messageInputIds"],
        json!(["supporting-note"])
    );
    reopened.close().await;

    let mut replacement = serve_with_key(&state, &provider.url, "other-fixture-principal").await;
    load_parent(&mut replacement, &parent, workspace.path()).await;
    let denied = replacement.request(STEER, steer.clone()).await;
    assert_eq!(denied["error"]["data"], "subagent_authority_changed");
    let denied = replacement
        .request(
            RESUME,
            resume_basis(&retained, &parent, &child, "wrong-authority"),
        )
        .await;
    assert_eq!(denied["error"]["data"], "subagent_authority_changed");
    replacement.close().await;
    assert!(provider.requests.try_recv().is_err());

    provider.done().await;
}

#[tokio::test]
async fn a_parent_resume_preserves_the_reviewers_independent_pause_after_restart() {
    const SNAPSHOT: &str = "_co.grida/session/snapshot";
    const TASK_PAUSE: &str = "_co.grida/session/pause";
    const TASK_RESUME: &str = "_co.grida/session/resume";
    const ASSIGNMENT: &str = "Verify the candidate independently.";

    async fn parent_snapshot(client: &mut PrivateStdio, session: &str) -> Value {
        let response = client.request(SNAPSHOT, json!({"sessionId":session})).await;
        response
            .get("result")
            .unwrap_or_else(|| panic!("{response}"))
            .clone()
    }

    for child_first in [true, false] {
        let temporary = TempDir::new().unwrap();
        let workspace = TempDir::new().unwrap();
        let state = temporary.path().join("state");
        let (release, parent_pending) = tokio::sync::oneshot::channel();
        let mut provider = Endpoint::start(vec![
            Reply::Tool(
                "delegate_review",
                r#"{"instructions":"Verify the candidate independently."}"#,
            ),
            Reply::Hold("Partial task or review work."),
            Reply::Hold("Partial review or task work."),
            Reply::Release("Parent work resumed.", parent_pending),
            Reply::Finished("Review work resumed separately."),
        ])
        .await;
        let mut first = serve(&state, &provider.url).await;
        let parent = new_session(&mut first, workspace.path()).await;
        let accepted = first
            .request(
                "_co.grida/session/submit",
                json!({
                    "sessionId":parent,"inputId":"review-task","effort":"ultra",
                    "prompt":[{"type":"text","text":"Private parent task."}],
                }),
            )
            .await;
        let parent_turn = accepted["result"]["turnId"].as_str().unwrap();
        for _ in 0..3 {
            provider.request().await;
        }
        let children = first.request(LIST, json!({"parentSessionId":parent})).await;
        let [reviewer] = children["result"]["children"]
            .as_array()
            .unwrap()
            .as_slice()
        else {
            panic!("expected one funded reviewer: {children}");
        };
        let child = reviewer["childId"].as_str().unwrap();
        let assignment = observed_assignment(&mut first, &parent, child).await;
        let input = assignment["inputId"].as_str().unwrap();
        let child_turn = assignment["turn"]["turnId"].as_str().unwrap();
        assert_eq!(assignment["parentTurnId"], parent_turn);
        assert_eq!(assignment["maxGenerationSteps"], 2);

        let mut child_pause = None;
        if child_first {
            let active = inspect(&mut first, &parent, child, input).await;
            let pause = child_basis(&active, &parent, child, "independent-child-pause");
            let receipt = first.request(PAUSE, pause.clone()).await;
            assert_eq!(receipt["result"]["turnId"], child_turn, "{receipt}");
            child_pause = Some((pause, receipt["result"].clone()));
        }
        let active = parent_snapshot(&mut first, &parent).await;
        let parent_pause = task_basis(&active, &parent, "ancestor-pause");
        let parent_receipt = first.request(TASK_PAUSE, parent_pause.clone()).await;
        assert_eq!(
            parent_receipt["result"]["turnId"], parent_turn,
            "{parent_receipt}"
        );
        let parent_held = timeout(WAIT, async {
            loop {
                let view = parent_snapshot(&mut first, &parent).await;
                if view["current"]["disposition"] == "suspended" {
                    break view;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        let ancestor_held = wait_for(&mut first, &parent, child, input, |view| {
            view["current"]["disposition"] == "suspended"
        })
        .await;
        if !child_first {
            let pause = child_basis(&ancestor_held, &parent, child, "independent-child-pause");
            let receipt = first.request(PAUSE, pause.clone()).await;
            assert_eq!(receipt["result"]["turnId"], child_turn, "{receipt}");
            child_pause = Some((pause, receipt["result"].clone()));
        }
        let both_held = inspect(&mut first, &parent, child, input).await;
        let denied = first
            .request(
                RESUME,
                resume_basis(&both_held, &parent, child, "child-under-ancestor"),
            )
            .await;
        assert_eq!(
            denied["error"]["data"], "sponsored_subagent_held_by_ancestor",
            "{denied}"
        );
        assert_eq!(inspect(&mut first, &parent, child, input).await, both_held);
        first.close().await;

        let mut second = serve(&state, &provider.url).await;
        load_parent(&mut second, &parent, workspace.path()).await;
        assert_eq!(parent_snapshot(&mut second, &parent).await, parent_held);
        assert_eq!(inspect(&mut second, &parent, child, input).await, both_held);
        assert_eq!(
            second.request(TASK_PAUSE, parent_pause).await["result"],
            parent_receipt["result"]
        );
        let (child_pause, receipt) = child_pause.unwrap();
        assert_eq!(second.request(PAUSE, child_pause).await["result"], receipt);
        assert!(provider.requests.try_recv().is_err());

        let parent_resume = json!({
            "task":task_basis(&parent_held,&parent,"resume-ancestor"),
            "expectedEpoch":parent_held["current"]["epoch"],
            "expectedJournalPosition":parent_held["current"]["journalPosition"],
        });
        let resumed = second.request(TASK_RESUME, parent_resume.clone()).await;
        assert_eq!(
            resumed["result"]["turn"]["turnId"], parent_turn,
            "{resumed}"
        );
        assert_eq!(resumed["result"]["turn"]["epoch"], 2);
        let parent_request = provider.request().await;
        assert!(
            parent_request["messages"]
                .to_string()
                .contains("Private parent task.")
        );
        let independent = inspect(&mut second, &parent, child, input).await;
        assert_eq!(independent["current"]["turnId"], child_turn);
        assert_eq!(independent["current"]["epoch"], 1);
        assert_eq!(independent["current"]["paused"], true);
        assert_eq!(independent["current"]["disposition"], "suspended");
        assert_eq!(
            second.request(TASK_RESUME, parent_resume).await["result"]["turn"]["epoch"],
            2
        );
        assert!(provider.requests.try_recv().is_err());

        let child_resume = resume_basis(&independent, &parent, child, "resume-independent-child");
        let resumed = second.request(RESUME, child_resume.clone()).await;
        assert_eq!(resumed["result"]["turn"]["turnId"], child_turn, "{resumed}");
        assert_eq!(resumed["result"]["turn"]["epoch"], 2);
        let child_request = provider.request().await;
        let messages = child_request["messages"].to_string();
        assert!(messages.contains(ASSIGNMENT));
        assert!(!messages.contains("Private parent task."));
        assert!(child_request.get("tools").is_none());
        let completed = wait_for(&mut second, &parent, child, input, |view| {
            view["assignment"]["disposition"]["kind"] == "completed"
        })
        .await;
        assert_eq!(completed["allocation"], json!({"workTurns":1,"reserved":1}));
        assert_eq!(completed["assignment"]["parentTurnId"], parent_turn);
        assert_eq!(
            completed["assignment"]["result"]["text"],
            "Review work resumed separately."
        );
        assert_eq!(
            second.request(RESUME, child_resume).await["result"]["turn"]["epoch"],
            2
        );
        assert_eq!(
            parent_snapshot(&mut second, &parent).await["current"]["disposition"],
            "running"
        );
        assert!(provider.requests.try_recv().is_err());
        release.send(()).unwrap();
        timeout(WAIT, async {
            loop {
                let view = parent_snapshot(&mut second, &parent).await;
                if view["current"].is_null() {
                    assert_eq!(view["latest"]["turnId"], parent_turn);
                    assert_eq!(view["latest"]["status"], "succeeded");
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        second.close().await;
        provider.done().await;
    }
}

#[tokio::test]
async fn child_queue_survives_restart_and_stays_held_after_stop() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Hold("Partial child finding."),
        Reply::Finished("A separate follow-up."),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let created = first.request(CREATE, create(&parent)).await;
    let child = created["result"]["childId"].as_str().unwrap().to_owned();
    let first_input = assign(
        &parent,
        &child,
        &parent_turn,
        "first",
        "Investigate the point.",
    );
    let accepted = first.request(ASSIGN, first_input.clone()).await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    provider.request().await;
    let queued = first
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "later",
                "Another assignment.",
            ),
        )
        .await;
    assert_eq!(
        queued["result"]["disposition"]["kind"], "queued",
        "{queued}"
    );
    let over_limit = first
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "extra",
                "Outside the allowance.",
            ),
        )
        .await;
    assert_eq!(over_limit["error"]["data"], "subagent_allocation_exhausted");
    first.close().await;

    let mut second = serve(&state, &provider.url).await;
    load_parent(&mut second, &parent, workspace.path()).await;
    let pending = inspect(&mut second, &parent, &child, "first").await;
    assert_eq!(pending["current"]["disposition"], "suspended");
    assert_eq!(pending["allocation"]["reserved"], 1);
    assert_eq!(pending["queuedInputIds"], json!(["later"]));
    let stop = child_basis(&pending, &parent, &child, "stop-first");
    let stopped = second.request(STOP, stop.clone()).await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let cancelled = wait_for(&mut second, &parent, &child, "first", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(cancelled["assignment"]["result"]["status"], "cancelled");
    assert!(cancelled["current"].is_null());
    assert_eq!(cancelled["allocation"]["reserved"], 1);
    assert_eq!(cancelled["admissionPaused"], true);
    assert_eq!(cancelled["queuedInputIds"], json!(["later"]));
    assert_eq!(
        second.request(STOP, stop).await["result"],
        stopped["result"]
    );
    assert_eq!(
        second.request(ASSIGN, first_input).await["result"],
        cancelled["assignment"]
    );
    let withdraw = json!({
        "queue":queue_basis(&cancelled,&parent,&child,"withdraw-later"),
        "inputId":"later",
    });
    let removed = second.request(WITHDRAW, withdraw.clone()).await;
    assert!(removed.get("error").is_none(), "{removed}");
    assert_eq!(
        second.request(WITHDRAW, withdraw).await["result"],
        removed["result"]
    );
    assert_eq!(
        inspect(&mut second, &parent, &child, "later").await["assignment"]["disposition"]["kind"],
        "withdrawn",
    );
    let accepted = second
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "follow-up",
                "Continue with the new question.",
            ),
        )
        .await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    let held = inspect(&mut second, &parent, &child, "follow-up").await;
    assert_eq!(held["queuedInputIds"], json!(["follow-up"]));
    assert_eq!(held["admissionPaused"], true);
    assert!(provider.requests.try_recv().is_err());
    let resume = queue_basis(&held, &parent, &child, "release-child-queue");
    let resumed = second.request(RESUME_QUEUE, resume.clone()).await;
    assert!(resumed.get("error").is_none(), "{resumed}");
    assert_eq!(
        second.request(RESUME_QUEUE, resume).await["result"],
        resumed["result"]
    );
    provider.request().await;
    let completed = wait_for(&mut second, &parent, &child, "follow-up", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    assert_eq!(completed["allocation"]["reserved"], 2);
    assert_eq!(
        completed["assignment"]["result"]["text"],
        "A separate follow-up."
    );
    second.close().await;
    provider.done().await;
}

#[tokio::test]
async fn replaced_provider_authority_can_observe_but_cannot_reuse_child_context() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let mut provider = Endpoint::start(vec![
        Reply::Finished("Parent completed."),
        Reply::Finished("Retained under the original credential."),
    ])
    .await;
    let mut first = serve(&state, &provider.url).await;
    let parent = new_session(&mut first, workspace.path()).await;
    let parent_turn = settle_parent(&mut first, &parent).await;
    provider.request().await;
    let child = first.request(CREATE, create(&parent)).await["result"]["childId"]
        .as_str()
        .unwrap()
        .to_owned();
    let original = assign(
        &parent,
        &child,
        &parent_turn,
        "initial",
        "Investigate once.",
    );
    assert!(first.request(ASSIGN, original).await.get("error").is_none());
    provider.request().await;
    let completed = wait_for(&mut first, &parent, &child, "initial", |view| {
        view["assignment"]["disposition"]["kind"] == "completed"
    })
    .await;
    first.close().await;

    let mut rotated = serve_with_key(&state, &provider.url, "rotated-fixture-credential").await;
    load_parent(&mut rotated, &parent, workspace.path()).await;
    let retained = inspect(&mut rotated, &parent, &child, "initial").await;
    assert_eq!(retained["assignment"], completed["assignment"]);
    assert_eq!(retained["allocation"]["reserved"], 1);
    let refused = rotated
        .request(
            ASSIGN,
            assign(
                &parent,
                &child,
                &parent_turn,
                "replacement",
                "Reuse the old context.",
            ),
        )
        .await;
    assert_eq!(refused["error"]["data"], "subagent_authority_changed");
    rotated.close().await;
    provider.done().await;
}
