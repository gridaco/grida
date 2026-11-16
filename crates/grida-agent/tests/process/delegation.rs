//! GRIDA-SEC-004 / GRIDA-SEC-007 — delegated work uses captured native capabilities.

use super::approvals::{Fixture, Stdio as PrivateStdio};
use super::*;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;

const PARENT_ONLY: &str =
    "PARENT-ONLY-CONTEXT: coordinate five independent units and integrate their files.";
const PROJECT_GUIDANCE: &str = "Keep each unit's output in its own file.";
const SKILL_BODY: &str = "Verify the source facts before reporting a unit complete.";
const TOOLS: [&str; 4] = [
    "spawn_agent",
    "send_agent_message",
    "wait_agent",
    "stop_agent",
];

fn offered(request: &Value, name: &str) -> bool {
    request["tools"].as_array().is_some_and(|tools| {
        tools.iter().any(|tool| {
            tool["name"] == name
                || tool["function"]["name"] == name
                || tool["functionDeclarations"]
                    .as_array()
                    .is_some_and(|items| items.iter().any(|item| item["name"] == name))
        })
    })
}

fn tool_reply(name: &str, arguments: Value) -> Reply {
    let body = fixture_tool_body(name, &arguments.to_string());
    Reply::RawHttp(format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ))
}

fn tool_results(request: &Value) -> Vec<Value> {
    request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|message| message["role"] == "tool")
        .map(|message| serde_json::from_str(message["content"].as_str().unwrap()).unwrap())
        .collect()
}

fn writable(fixture: &Fixture) {
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["write"] = "allow".into();
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
}

#[derive(Default)]
struct WorkScript {
    parent_step: usize,
    worker_steps: BTreeMap<usize, usize>,
    assignments: Vec<Value>,
}

impl WorkScript {
    fn reply(&mut self, request: &Value) -> Reply {
        assert!(!offered(request, "retire_worker_processes"));
        assert_eq!(request["model"], "fixture-model");
        assert_eq!(request["reasoning_effort"], "high");
        if offered(request, "spawn_agent") {
            self.parent(request)
        } else {
            self.worker(request)
        }
    }

    fn parent(&mut self, request: &Value) -> Reply {
        let results = tool_results(request);
        for result in &results {
            if let Some(assignment) = result["structured"].get("assignment") {
                assert_eq!(result["status"], "succeeded", "{result}");
                if !self.assignments.contains(assignment) {
                    for field in ["child", "input", "turn"] {
                        assert!(assignment[field].is_string(), "{assignment}");
                    }
                    self.assignments.push(assignment.clone());
                }
            }
        }
        let step = self.parent_step;
        self.parent_step += 1;
        match step {
            0..=4 => {
                assert_eq!(self.assignments.len(), step);
                for tool in TOOLS {
                    assert!(offered(request, tool));
                }
                assert!(!offered(request, "delegate_review"));
                tool_reply(
                    "spawn_agent",
                    json!({
                        "name": format!("Unit {}", step + 1),
                        "instructions": format!("TASK-UNIT-{}: read the work-notes skill, produce and verify your assigned local output, then report the result.", step + 1)
                    }),
                )
            }
            5 => Reply::Finished("Everything is already complete."),
            6 => {
                assert_eq!(self.assignments.len(), 5);
                let context = request["messages"].to_string();
                assert!(context.contains("Outstanding delegated assignments must be collected"));
                for assignment in &self.assignments {
                    for field in ["child", "input", "turn"] {
                        assert!(context.contains(assignment[field].as_str().unwrap()));
                    }
                }
                let children: Vec<_> = self
                    .assignments
                    .iter()
                    .map(|item| item["child"].clone())
                    .collect();
                let identities: BTreeSet<_> = children.iter().map(Value::to_string).collect();
                assert_eq!(identities.len(), 5, "spawn calls reused one child");
                tool_reply("wait_agent", json!({"children": children}))
            }
            7..=12 => {
                let latest = results.last().unwrap();
                assert_eq!(latest["status"], "succeeded", "{latest}");
                if step == 7 {
                    let collected = latest["structured"]["collected"].as_array().unwrap();
                    assert_eq!(collected.len(), 5, "{latest}");
                    assert!(
                        latest["structured"]["pending"]
                            .as_array()
                            .unwrap()
                            .is_empty()
                    );
                    for assignment in &self.assignments {
                        assert!(
                            collected.iter().any(|result| {
                                result["child"] == assignment["child"]
                                    && result["input"] == assignment["input"]
                                    && result["turn"] == assignment["turn"]
                                    && result["disposition"] == "settled"
                                    && result["status"] == "succeeded"
                                    && result["resource_status"] == "verified"
                            }),
                            "missing exact assignment: {assignment}; {latest}"
                        );
                    }
                } else {
                    assert!(
                        latest["content"]
                            .to_string()
                            .contains(&format!("unit-result-{}", step - 7)),
                        "{latest}"
                    );
                }
                if step < 12 {
                    tool_reply(
                        "read_file",
                        json!({"path": format!("unit-{}.txt", step - 6)}),
                    )
                } else {
                    tool_reply(
                        "write_file",
                        json!({"path":"combined.txt", "content":combined()}),
                    )
                }
            }
            13 => {
                assert!(
                    !request["messages"]
                        .to_string()
                        .contains("Outstanding delegated assignments must be collected")
                );
                assert_eq!(results.last().unwrap()["status"], "succeeded");
                Reply::Finished("Verified all five outputs and saved the integrated result.")
            }
            _ => panic!("unexpected parent step {step}"),
        }
    }

    fn worker(&mut self, request: &Value) -> Reply {
        for tool in TOOLS.into_iter().chain([
            "delegate_review",
            "collect_review",
            "surface_open",
            "surface_list_open",
        ]) {
            assert!(!offered(request, tool), "worker acquired {tool}");
        }
        for tool in ["read_file", "write_file", "read_skill"] {
            assert!(offered(request, tool), "worker lacks {tool}");
        }
        let context = request["messages"].to_string();
        assert!(
            !context.contains("PARENT-ONLY-CONTEXT"),
            "parent transcript leaked into worker context"
        );
        assert!(context.contains(PROJECT_GUIDANCE));
        assert!(context.contains("work-notes"));
        let unit = (1..=5)
            .find(|unit| context.contains(&format!("TASK-UNIT-{unit}:")))
            .unwrap();
        let step = self.worker_steps.entry(unit).or_default();
        let current = *step;
        *step += 1;
        match current {
            0 => tool_reply(
                "read_file",
                json!({"path":".agents/skills/work-notes/SKILL.md"}),
            ),
            1 => {
                let results = tool_results(request);
                assert_eq!(results.last().unwrap()["status"], "succeeded");
                assert!(
                    results.last().unwrap()["content"]
                        .to_string()
                        .contains(SKILL_BODY)
                );
                tool_reply(
                    "write_file",
                    json!({"path":format!("unit-{unit}.txt"),"content":format!("unit-result-{unit}")}),
                )
            }
            2 => {
                assert_eq!(tool_results(request).last().unwrap()["status"], "succeeded");
                tool_reply("read_file", json!({"path":format!("unit-{unit}.txt")}))
            }
            3 => {
                let results = tool_results(request);
                assert_eq!(results.last().unwrap()["status"], "succeeded");
                assert!(
                    results.last().unwrap()["content"]
                        .to_string()
                        .contains(&format!("unit-result-{unit}"))
                );
                Reply::Finished("The assigned local output was written and verified.")
            }
            _ => panic!("unexpected unit {unit} step {current}"),
        }
    }
}

fn combined() -> String {
    (1..=5)
        .map(|unit| format!("unit-result-{unit}\n"))
        .collect()
}

#[tokio::test]
async fn ordinary_reasoning_delegates_five_capable_workers_and_integrates_exact_results() {
    let fixture = Fixture::new(false);
    writable(&fixture);
    fs::write(fixture.primary.join("AGENTS.md"), PROJECT_GUIDANCE).unwrap();
    let skill = fixture.primary.join(".agents/skills/work-notes");
    fs::create_dir_all(&skill).unwrap();
    fs::write(
        skill.join("SKILL.md"),
        format!(
            "---\nname: work-notes\ndescription: Verify general task outputs.\n---\n{SKILL_BODY}\n"
        ),
    )
    .unwrap();
    let script = Arc::new(Mutex::new(WorkScript::default()));
    let replies = (0..34)
        .map(|_| {
            let script = script.clone();
            Reply::Choose(Box::new(move |request| {
                script.lock().unwrap().reply(request)
            }))
        })
        .collect();
    let endpoint = Endpoint::start(replies).await;
    let child = fixture
        .process(&endpoint.url, "serve")
        .args(["--stdio", "--subagents", "--reasoning"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = PrivateStdio::from_child(child);
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"]["co.grida/session/effort"] = 1.into();
    for capability in [
        "co.grida/subagent/activity",
        "co.grida/subagent/list",
        "co.grida/subagent/inspect",
    ] {
        initialize["clientCapabilities"]["_meta"][capability] = 1.into();
    }
    let initialized = client.request("initialize", initialize).await;
    assert!(initialized.get("error").is_none(), "{initialized}");
    let created = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let accepted = client.request("_co.grida/session/submit", json!({
        "sessionId":session,"inputId":"five-units","prompt":[{"type":"text","text":PARENT_ONLY}],
        "operatingRegime":"act","effort":"standard","reasoning":"high"
    })).await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    let snapshot = timeout(WAIT, async {
        loop {
            let snapshot = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            assert!(snapshot.get("error").is_none(), "{snapshot}");
            if snapshot["result"]["current"].is_null() && !snapshot["result"]["latest"].is_null() {
                break snapshot;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        snapshot["result"]["latest"]["status"], "succeeded",
        "{snapshot}"
    );
    let assignments = {
        let script = script.lock().unwrap();
        assert_eq!(script.parent_step, 14);
        assert_eq!(script.worker_steps.len(), 5);
        assert!(script.worker_steps.values().all(|steps| *steps == 4));
        script.assignments.clone()
    };
    let activity = client
        .request(
            "_co.grida/subagent/activity",
            json!({"parentSessionId":session}),
        )
        .await;
    assert_eq!(
        activity["result"]["counts"],
        json!({"active":0,"done":5,"complete":true}),
        "{activity}"
    );
    let children = activity["result"]["children"].as_array().unwrap();
    assert_eq!(children.len(), 5);
    let names: BTreeSet<_> = children
        .iter()
        .map(|child| child["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        names,
        (1..=5)
            .map(|unit| format!("Unit {unit}"))
            .collect::<BTreeSet<_>>()
    );
    assert!(
        children.iter().all(|child| child["section"] == "done"
            && child["status"] == "succeeded"
            && child["kind"] == "named"),
        "{activity}"
    );
    let events = activity["result"]["events"].as_array().unwrap();
    assert_eq!(events.len(), 10, "{activity}");
    assert_eq!(
        events
            .iter()
            .filter(|event| event["kind"] == "started")
            .count(),
        5
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| event["kind"] == "finished")
            .count(),
        5
    );
    for assignment in &assignments {
        for kind in ["started", "finished"] {
            assert!(
                events
                    .iter()
                    .any(|event| event["childId"] == assignment["child"]
                        && event["childTurnId"] == assignment["turn"]
                        && event["inputId"] == assignment["input"]
                        && event["parentTurnId"] == snapshot["result"]["latest"]["turnId"]
                        && event["kind"] == kind),
                "{activity}"
            );
        }
        let inspected=client.request("_co.grida/subagent/inspect",json!({"parentSessionId":session,"childId":assignment["child"],"inputId":assignment["input"]})).await;
        assert!(inspected.get("error").is_none(), "{inspected}");
        assert_eq!(
            inspected["result"]["assignment"]["maxGenerationSteps"], 8,
            "{inspected}"
        );
        let conversation = client
            .request(
                "_co.grida/subagent/conversation",
                json!({"parentSessionId":session,"childId":assignment["child"]}),
            )
            .await;
        assert!(conversation.get("error").is_none(), "{conversation}");
        assert_eq!(conversation["result"]["kind"], "named", "{conversation}");
        assert_eq!(
            conversation["result"]["execution"],
            json!({"model":"fixture-model","effort":"high"}),
            "{conversation}"
        );
        let messages = conversation["result"]["messages"].as_array().unwrap();
        assert!(
            messages.iter().any(|message| message["role"] == "assistant"
                && message["text"] == "The assigned local output was written and verified."),
            "{conversation}"
        );
        assert!(
            messages.iter().any(|message| message["activity"]
                .as_array()
                .is_some_and(|activity| !activity.is_empty())),
            "{conversation}"
        );
        assert!(!messages.iter().any(|message| {
            message["text"]
                .as_str()
                .is_some_and(|text| text.contains("PARENT-ONLY-CONTEXT"))
        }));
    }
    client.close().await;
    for unit in 1..=5 {
        assert_eq!(
            fs::read_to_string(fixture.primary.join(format!("unit-{unit}.txt"))).unwrap(),
            format!("unit-result-{unit}")
        );
    }
    assert_eq!(
        fs::read_to_string(fixture.primary.join("combined.txt")).unwrap(),
        combined()
    );
    endpoint.done().await;
}

#[tokio::test]
async fn headless_delegation_requires_capability_and_act_without_requiring_ultra() {
    for (enabled, mode, expected) in [
        (false, "act", false),
        (true, "plan", false),
        (true, "act", true),
    ] {
        let fixture = Fixture::new(false);
        let mut endpoint = Endpoint::start(vec![Reply::Finished("Direct result.")]).await;
        let mut command = fixture.process(&endpoint.url, "run");
        if enabled {
            command.arg("--subagents");
        }
        let output = timeout(
            WAIT,
            command
                .arg("--cwd")
                .arg(&fixture.primary)
                .args([
                    "--mode",
                    mode,
                    "--effort",
                    "standard",
                    "--prompt",
                    "Complete the local task.",
                ])
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            output.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
        let request = endpoint.request().await;
        for tool in TOOLS {
            assert_eq!(
                offered(&request, tool),
                expected,
                "{mode}/{enabled}: {tool}"
            );
        }
        assert!(!offered(&request, "delegate_review"));
        endpoint.done().await;
    }
}

#[tokio::test]
async fn general_delegation_offers_cross_builtin_provider_protocols() {
    for protocol in [
        ProviderProtocol::OpenAiCompatible,
        ProviderProtocol::Responses,
        ProviderProtocol::Anthropic,
        ProviderProtocol::Gemini,
    ] {
        let fixture = Fixture::new(false);
        let mut endpoint = Endpoint::start_protocol(
            protocol,
            vec![Reply::Finished("Direct result.")],
            Some(TEST_CREDENTIAL),
        )
        .await;
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .args([
                    "--provider",
                    protocol.as_str(),
                    "--subagents",
                    "--effort",
                    "standard",
                    "--prompt",
                    "Complete the local task.",
                ])
                .arg("--cwd")
                .arg(&fixture.primary)
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            output.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
        let request = endpoint.request().await;
        for tool in TOOLS {
            assert!(offered(&request, tool), "{}: {tool}", protocol.as_str());
        }
        assert!(!offered(&request, "delegate_review"));
        endpoint.done().await;
    }
}

#[tokio::test]
async fn delegated_workers_cannot_promote_ask_or_read_only_permissions() {
    for primary_writable in [false, true] {
        let fixture = Fixture::new(false);
        if primary_writable {
            writable(&fixture);
        }
        let secret = "OUTSIDE-UNIT-PRIVATE-CONTENT";
        fs::write(fixture.extra.join("private.txt"), secret).unwrap();
        let parent_step = Arc::new(Mutex::new(0));
        let child_step = Arc::new(Mutex::new(0));
        let requests = if primary_writable { 6 } else { 5 };
        let replies = (0..requests).map(|_| {
            let parent_step = parent_step.clone();
            let child_step = child_step.clone();
            Reply::Choose(Box::new(move |request| {
                let results = tool_results(request);
                assert!(!results.iter().any(|result| result.to_string().contains(secret)));
                if offered(request, "spawn_agent") {
                    let mut step = parent_step.lock().unwrap();
                    let current = *step; *step += 1;
                    match current {
                        0 => tool_reply("spawn_agent", json!({"name":"Bounded unit","instructions":"Inspect the requested resource and produce a local result only when allowed."})),
                        1 => tool_reply("wait_agent", json!({"children":[results.last().unwrap()["structured"]["assignment"]["child"]]})),
                        2 => {
                            let result = results.last().unwrap();
                            assert_eq!(result["status"], "succeeded", "{result}");
                            assert_eq!(result["structured"]["collected"].as_array().unwrap().len(), 1, "{result}");
                            assert!(result["structured"]["pending"].as_array().unwrap().is_empty(), "{result}");
                            Reply::Finished("The worker reported its permission limits.")
                        }
                        _ => panic!("unexpected parent permission step {current}"),
                    }
                } else {
                    let mut step = child_step.lock().unwrap();
                    let current = *step; *step += 1;
                    assert_eq!(offered(request,"write_file"), primary_writable);
                    match current {
                        0 => tool_reply("read_file", json!({"directory":"extra","path":"private.txt"})),
                        1 => {
                            let result = results.last().unwrap();
                            assert_eq!(result["status"], "failed", "{result}");
                            assert!(result.to_string().contains("permission_review_unavailable"), "{result}");
                            if primary_writable {
                                tool_reply("write_file", json!({"directory":"extra","path":"forbidden.txt","content":"unauthorized change"}))
                            } else {
                                Reply::Finished("The read was refused and this worker has no write capability.")
                            }
                        }
                        2 if primary_writable => {
                            assert_eq!(results.last().unwrap()["status"], "failed", "{results:?}");
                            Reply::Finished("The requested read and write were refused; no output was produced.")
                        }
                        _ => panic!("unexpected child permission step {current}"),
                    }
                }
            }))
        }).collect();
        let endpoint = Endpoint::start(replies).await;
        let output = timeout(
            WAIT,
            fixture
                .process(&endpoint.url, "run")
                .arg("--cwd")
                .arg(&fixture.primary)
                .args([
                    "--subagents",
                    "--effort",
                    "standard",
                    "--prompt",
                    "Delegate the bounded task and report its outcome.",
                ])
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            output.status.success(),
            "{}\n{}",
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        );
        assert_eq!(*parent_step.lock().unwrap(), 3);
        assert_eq!(
            *child_step.lock().unwrap(),
            if primary_writable { 3 } else { 2 }
        );
        assert!(!fixture.extra.join("forbidden.txt").exists());
        assert_eq!(
            fs::read_to_string(fixture.extra.join("private.txt")).unwrap(),
            secret
        );
        assert!(!String::from_utf8_lossy(&output.stdout).contains(secret));
        endpoint.done().await;
    }
}

/// Worker resources have no independent lifetime after the one-shot assignment.
/// Keep the parent model request open so collection cannot cause the cleanup.
#[tokio::test]
#[ignore = "requires a reviewed native helper and OS confinement"]
async fn completed_worker_retires_its_real_command_before_parent_collection() {
    let fixture = Fixture::new(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["directories"][0]["commandReadWrite"] = "allow".into();
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let heartbeat = fixture.primary.join("worker-beat");
    let parent_step = Arc::new(Mutex::new(0));
    let child_step = Arc::new(Mutex::new(0));
    let (release, held) = tokio::sync::oneshot::channel();
    let held = Arc::new(Mutex::new(Some(held)));
    let parent_waiting = Arc::new(Mutex::new(false));
    let replies = (0..5).map(|_| {
        let parent_step = parent_step.clone();
        let child_step = child_step.clone();
        let held = held.clone();
        let parent_waiting = parent_waiting.clone();
        Reply::Choose(Box::new(move |request| {
            assert!(!offered(request, "retire_worker_processes"));
            if offered(request,"spawn_agent") {
                let mut step=parent_step.lock().unwrap();
                let current=*step;*step+=1;
                match current {
                    0=>tool_reply("spawn_agent",json!({"name":"Process unit","instructions":"Perform the bounded local command task, then return your result."})),
                    1=> {
                        let results=tool_results(request);
                        let child=results.last().unwrap()["structured"]["assignment"]["child"].clone();
                        *parent_waiting.lock().unwrap()=true;
                        Reply::After(held.lock().unwrap().take().unwrap(),Box::new(tool_reply("wait_agent",json!({"children":[child]}))))
                    },
                    2=> {
                        let results=tool_results(request);let result=results.last().unwrap();
                        assert_eq!(result["status"],"succeeded","{result}");
                        assert!(result["structured"]["pending"].as_array().unwrap().is_empty(),"{result}");
                        let collected=result["structured"]["collected"].as_array().unwrap();
                        assert_eq!(collected.len(),1,"{result}");
                        assert_eq!(collected[0]["status"],"succeeded","{result}");
                        assert_eq!(collected[0]["resource_status"],"verified","{result}");
                        Reply::Finished("The assignment and its owned resources are complete.")
                    },
                    _=>panic!("unexpected parent command step {current}"),
                }
            }else{
                let mut step=child_step.lock().unwrap();let current=*step;*step+=1;
                assert!(offered(request,"exec_command"));
                match current {
                    0=>tool_reply("exec_command",json!({
                        "access":"read_write",
                        "cmd":"printf ready; while :; do printf . >> worker-beat; /bin/sleep 0.05; done",
                        "yield_time_ms":1000,
                    })),
                    1=> {
                        let results=tool_results(request);let result=results.last().unwrap();
                        assert_eq!(result["status"],"succeeded","{result}");
                        assert!(result["content"].to_string().contains("Process running with session ID"),"{result}");
                        Reply::Finished("The bounded assignment is complete.")
                    },
                    _=>panic!("unexpected worker command step {current}"),
                }
            }
        }))
    }).collect();
    let endpoint = Endpoint::start(replies).await;
    let child = fixture
        .process(&endpoint.url, "serve")
        .args(["--stdio", "--subagents"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = PrivateStdio::from_child(child);
    let mut initialize = extension_initialize();
    for capability in ["co.grida/subagent/activity", "co.grida/session/effort"] {
        initialize["clientCapabilities"]["_meta"][capability] = 1.into();
    }
    client.request("initialize", initialize).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let accepted=client.request("_co.grida/session/submit",json!({
        "sessionId":session,"inputId":"owned-command","prompt":[{"type":"text","text":"Delegate the bounded task and collect its result."}],
        "operatingRegime":"act","effort":"standard"
    })).await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    // Ordinary inspection must not be needed to retire a process, and the
    // parent has not been allowed to invoke its collection tool yet.
    timeout(WAIT, async {
        while !heartbeat.exists()
            || !*parent_waiting.lock().unwrap()
            || *child_step.lock().unwrap() != 2
        {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let before = timeout(Duration::from_secs(15), async {
        loop {
            let before = fs::metadata(&heartbeat).unwrap().len();
            assert!(before > 0);
            tokio::time::sleep(Duration::from_millis(400)).await;
            if fs::metadata(&heartbeat).unwrap().len() == before {
                break before;
            }
        }
    })
    .await
    .expect("a completed worker kept its command alive before parent collection");
    let active = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(active["result"]["current"].is_object(), "{active}");
    release.send(()).unwrap();
    let final_snapshot = timeout(WAIT, async {
        loop {
            let snapshot = client
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            if snapshot["result"]["current"].is_null() && !snapshot["result"]["latest"].is_null() {
                break snapshot;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        final_snapshot["result"]["latest"]["status"], "succeeded",
        "{final_snapshot}"
    );
    assert_eq!(*parent_step.lock().unwrap(), 3);
    assert_eq!(*child_step.lock().unwrap(), 2);
    assert_eq!(fs::metadata(&heartbeat).unwrap().len(), before);
    client.close().await;
    endpoint.done().await;
}
