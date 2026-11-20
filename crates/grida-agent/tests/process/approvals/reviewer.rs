//! GRIDA-SEC-004 — built approval review with synthetic read-only actions.

use super::super::lifecycle::{prompt_request, task_basis};
use super::*;

const READ: &str = r#"{"directory":"extra","path":"note.txt"}"#;
const OTHER_READ: &str = r#"{"directory":"extra","path":"other.txt"}"#;
const PRIVATE_TEXT: &str = "isolated authorized reference";
const PROMPT: &str = "Read note.txt before preparing a short draft.";

fn profile(fixture: &Fixture, selected: bool) {
    fs::write(fixture.extra.join("note.txt"), PRIVATE_TEXT).unwrap();
    if selected {
        let mut profile: Value =
            serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
        profile["automaticReadReview"] = json!({"directory":"extra","relativePath":"note.txt"});
        fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    }
}

async fn open(fixture: &Fixture, endpoint: &str) -> Stdio {
    let mut client = Stdio::start(fixture, endpoint);
    let initialized = client.request("initialize", initialize()).await;
    assert_eq!(
        initialized["result"]["agentCapabilities"]["_meta"][ANSWER],
        1
    );
    client
}

async fn session(client: &mut Stdio, fixture: &Fixture) -> String {
    let created = client
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    created["result"]["sessionId"].as_str().unwrap().to_owned()
}

async fn submit(client: &mut Stdio, session: &str) -> String {
    let accepted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(session, "read-review", PROMPT),
        )
        .await;
    assert_eq!(accepted["result"]["disposition"], "claimed", "{accepted}");
    accepted["result"]["turnId"].as_str().unwrap().to_owned()
}

async fn snapshot(client: &mut Stdio, session: &str) -> Value {
    let read = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(read.get("error").is_none(), "{read}");
    read["result"].clone()
}

async fn wait_for(client: &mut Stdio, session: &str, matches: impl Fn(&Value) -> bool) -> Value {
    timeout(WAIT, async {
        loop {
            let current = snapshot(client, session).await;
            if matches(&current) {
                break current;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

fn verify_reviewer_request(request: &Value, fixture: &Fixture) {
    assert!(request.get("tools").is_none(), "{request}");
    assert_eq!(request["max_completion_tokens"], 128);
    assert_eq!(request["messages"].as_array().unwrap().len(), 2);
    let body = request.to_string();
    assert!(body.contains(PROMPT));
    assert!(body.contains("note.txt"));
    assert!(!body.contains(fixture.extra.to_str().unwrap()));
    assert!(!body.contains(PRIVATE_TEXT));
}

#[tokio::test]
async fn automatic_review_approves_only_the_configured_read_and_keeps_its_reply_private() {
    for (selected, path) in [(false, READ), (true, OTHER_READ)] {
        let fixture = Fixture::new(false);
        profile(&fixture, selected);
        let mut endpoint = Endpoint::start(vec![Reply::Tool("read_file", path)]).await;
        let output = fixture.run_with_cwd(&endpoint.url, None, 6).await;
        assert_eq!(output[1]["disposition"], "input_required", "{output:?}");
        assert_eq!(output[1]["approvals"].as_array().unwrap().len(), 1);
        endpoint.request().await;
        assert!(endpoint.requests.try_recv().is_err());
        endpoint.done().await;
    }

    let fixture = Fixture::new(false);
    profile(&fixture, true);
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", READ),
        Reply::Finished("allow"),
        Reply::Finished("Read completed."),
    ])
    .await;
    let mut owner = open(&fixture, &endpoint.url).await;
    let session = session(&mut owner, &fixture).await;
    let prompt = owner
        .send(
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":PROMPT}]}),
        )
        .await;
    let mut streamed = String::new();
    loop {
        let frame = owner.read_frame().await;
        if frame["id"] == prompt {
            assert!(frame.get("error").is_none(), "{frame}");
            break;
        }
        if frame["params"]["update"]["sessionUpdate"] == "agent_message_chunk"
            && let Some(text) = frame["params"]["update"]["content"]["text"].as_str()
        {
            streamed.push_str(text);
        }
    }
    assert_eq!(streamed, "Read completed.");
    endpoint.request().await;
    verify_reviewer_request(&endpoint.request().await, &fixture);
    let continued = endpoint.request().await.to_string();
    assert!(continued.contains(PRIVATE_TEXT));
    assert!(!continued.contains("Return only allow"));
    assert!(endpoint.requests.try_recv().is_err());
    owner.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn invalid_automatic_review_keeps_the_manual_wait_across_restart() {
    const EARLIER_READ: &str = r#"{"path":"earlier.txt"}"#;
    const EARLIER_TEXT: &str = "earlier result stays recorded";
    let fixture = Fixture::new(false);
    profile(&fixture, true);
    fs::write(fixture.primary.join("earlier.txt"), EARLIER_TEXT).unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", EARLIER_READ),
        Reply::Tool("read_file", READ),
        Reply::Finished("allow\nUnexpected commentary"),
        Reply::Finished("Read completed."),
    ])
    .await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .args(["--prompt", PROMPT])
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    let output_records = records(&output.stdout);
    assert_eq!(output.status.code(), Some(6), "{output_records:?}");
    let session = output_records[0]["session_id"].as_str().unwrap();
    let turn = output_records[0]["turn_id"].as_str().unwrap();
    let wait = output_records[1]["approvals"][0]["waitId"]
        .as_str()
        .unwrap();
    assert_eq!(
        output_records[1]["approvals"][0]["reviewFailure"],
        "invalid_reply"
    );
    endpoint.request().await;
    assert!(endpoint.request().await.to_string().contains(EARLIER_TEXT));
    let review = endpoint.request().await;
    verify_reviewer_request(&review, &fixture);
    assert!(!review.to_string().contains(EARLIER_TEXT));
    assert!(endpoint.requests.try_recv().is_err());
    let mut owner = approve(&fixture, &endpoint.url, session, turn, wait).await;
    let continued = endpoint.request().await.to_string();
    assert!(continued.contains(PRIVATE_TEXT));
    assert!(continued.contains(EARLIER_TEXT));
    settle(&mut owner, session).await;
    owner.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn manual_decline_wins_over_a_later_automatic_allow() {
    let fixture = Fixture::new(false);
    profile(&fixture, true);
    let (release, wait) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", READ),
        Reply::Release("allow", wait),
        Reply::Finished("Respect the declined read."),
    ])
    .await;
    let mut owner = open(&fixture, &endpoint.url).await;
    let session = session(&mut owner, &fixture).await;
    let turn = submit(&mut owner, &session).await;
    endpoint.request().await;
    verify_reviewer_request(&endpoint.request().await, &fixture);
    let view = snapshot(&mut owner, &session).await;
    let pending = owner
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    let declined = owner
        .request(
            "_co.grida/session/answer-approval",
            json!({
                "sessionId":session,"turnId":turn,
                "requestId":"human-decline","waitId":pending["result"]["approvals"][0]["waitId"],
                "expectedSessionRevision":view["sessionRevision"],
                "expectedControlRevision":pending["result"]["controlRevision"],
                "decision":"decline"
            }),
        )
        .await;
    assert!(declined.get("error").is_none(), "{declined}");
    release.send(()).unwrap();
    let continued = endpoint.request().await.to_string();
    assert!(continued.contains("permission_declined"), "{continued}");
    assert!(!continued.contains(PRIVATE_TEXT));
    settle(&mut owner, &session).await;
    owner.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn automatic_allow_from_before_steering_keeps_the_wait_manual() {
    let fixture = Fixture::new(false);
    profile(&fixture, true);
    let (release, wait) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("read_file", READ),
        Reply::Release("allow", wait),
    ])
    .await;
    let mut owner = open(&fixture, &endpoint.url).await;
    let session = session(&mut owner, &fixture).await;
    let turn = submit(&mut owner, &session).await;
    endpoint.request().await;
    verify_reviewer_request(&endpoint.request().await, &fixture);
    let view = snapshot(&mut owner, &session).await;
    let steering = owner
        .request(
            "_co.grida/session/steer",
            json!({
                "task":task_basis(&view,&session,"steer-during-review"),
                "expectedHistoryPosition":view["current"]["historyPosition"],
                "prompt":[{"type":"text","text":"Change the draft to two paragraphs."}]
            }),
        )
        .await;
    assert_eq!(steering["result"]["turnId"], turn, "{steering}");
    release.send(()).unwrap();
    wait_for(&mut owner, &session, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    let pending = owner
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    assert_eq!(pending["result"]["approvals"].as_array().unwrap().len(), 1);
    assert!(endpoint.requests.try_recv().is_err());
    owner.close().await;
    endpoint.done().await;
}

#[cfg(unix)]
#[tokio::test]
async fn automatic_allow_cannot_widen_the_read_and_automatic_deny_resolves_it() {
    for (verdict, retarget) in [("allow", true), ("deny", false)] {
        let fixture = Fixture::new(false);
        profile(&fixture, true);
        let (release, wait) = tokio::sync::oneshot::channel();
        let mut endpoint = Endpoint::start(vec![
            Reply::Tool("read_file", READ),
            Reply::Release(verdict, wait),
            Reply::Finished("The read did not complete."),
        ])
        .await;
        let mut owner = open(&fixture, &endpoint.url).await;
        let session = session(&mut owner, &fixture).await;
        submit(&mut owner, &session).await;
        endpoint.request().await;
        verify_reviewer_request(&endpoint.request().await, &fixture);
        if retarget {
            let outside = fixture.primary.join("out-of-scope.txt");
            fs::write(&outside, "PRIVATE_TO_ANOTHER_ROOT").unwrap();
            let selected = fixture.extra.join("note.txt");
            fs::remove_file(&selected).unwrap();
            std::os::unix::fs::symlink(outside, selected).unwrap();
        }
        release.send(()).unwrap();
        let continued = endpoint.request().await.to_string();
        assert!(
            !continued.contains("PRIVATE_TO_ANOTHER_ROOT"),
            "{continued}"
        );
        assert!(!continued.contains(PRIVATE_TEXT), "{continued}");
        if retarget {
            assert!(
                continued.contains("file_symlink_unsupported"),
                "{continued}"
            );
        } else {
            assert!(continued.contains("permission_declined"), "{continued}");
        }
        settle(&mut owner, &session).await;
        owner.close().await;
        endpoint.done().await;
    }
}

#[tokio::test]
async fn timed_out_automatic_review_leaves_an_answerable_wait() {
    let fixture = Fixture::new(false);
    profile(&fixture, true);
    let mut endpoint =
        Endpoint::start(vec![Reply::Tool("read_file", READ), Reply::Hold("allow")]).await;
    let output = timeout(
        WAIT,
        fixture
            .process(&endpoint.url, "run")
            .args(["--prompt", PROMPT])
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    let records = records(&output.stdout);
    assert_eq!(output.status.code(), Some(6), "{records:?}");
    assert_eq!(records[1]["approvals"][0]["reviewFailure"], "timed_out");
    endpoint.request().await;
    verify_reviewer_request(&endpoint.request().await, &fixture);
    assert!(endpoint.requests.try_recv().is_err());
    endpoint.done().await;
}

#[tokio::test]
async fn pause_and_stop_interrupt_review_without_authorizing_the_read() {
    for action in ["pause", "stop"] {
        let fixture = Fixture::new(false);
        profile(&fixture, true);
        let mut endpoint =
            Endpoint::start(vec![Reply::Tool("read_file", READ), Reply::Hold("allow")]).await;
        let mut owner = open(&fixture, &endpoint.url).await;
        let session = session(&mut owner, &fixture).await;
        let turn = submit(&mut owner, &session).await;
        endpoint.request().await;
        verify_reviewer_request(&endpoint.request().await, &fixture);
        let view = snapshot(&mut owner, &session).await;
        let interrupted = owner
            .request(
                &format!("_co.grida/session/{action}"),
                task_basis(&view, &session, action),
            )
            .await;
        assert!(interrupted.get("error").is_none(), "{interrupted}");
        let finished = wait_for(&mut owner, &session, |view| {
            if action == "pause" {
                view["current"]["disposition"] == "suspended"
            } else {
                view["current"].is_null()
            }
        })
        .await;
        if action == "pause" {
            assert_eq!(finished["current"]["paused"], true);
        } else {
            assert_eq!(finished["latest"]["status"], "cancelled");
        }
        owner.close().await;
        if action == "pause" {
            let mut reopened = open(&fixture, &endpoint.url).await;
            let loaded = reopened
                .request(
                    "session/load",
                    json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[]}),
                )
                .await;
            assert!(loaded.get("error").is_none(), "{loaded}");
            let resumed = reopened
                .request(
                    "_co.grida/session/resume",
                    json!({
                        "task":task_basis(&finished,&session,"resume-after-review"),
                        "expectedEpoch":finished["current"]["epoch"],
                        "expectedJournalPosition":finished["current"]["journalPosition"],
                    }),
                )
                .await;
            assert!(resumed.get("error").is_none(), "{resumed}");
            wait_for(&mut reopened, &session, |view| {
                view["current"]["disposition"] == "suspended" && view["current"]["paused"] == false
            })
            .await;
            let pending = reopened
                .request(
                    "_co.grida/session/approvals",
                    json!({"sessionId":session,"turnId":turn}),
                )
                .await;
            assert_eq!(pending["result"]["approvals"].as_array().unwrap().len(), 1);
            assert_eq!(
                pending["result"]["approvals"][0]["reviewFailure"],
                "interrupted"
            );
            reopened.close().await;
        }
        assert!(endpoint.requests.try_recv().is_err());
        endpoint.done().await;
    }
}

#[tokio::test]
async fn a_human_answer_preserves_only_a_review_that_already_deferred() {
    const WINDOW: &str = "co.grida/session/transcript-window";
    for person_answers_first in [false, true] {
        let fixture = Fixture::new(false);
        let path = fixture.primary.parent().unwrap().join("outside.txt");
        fs::write(&path, PRIVATE_TEXT).unwrap();
        let mut profile: Value =
            serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
        profile["allowExternalFileRead"] = json!(true);
        profile["allowApproveForMe"] = json!(true);
        profile["initialPermissionMode"] = json!("approve_for_me");
        fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
        let arguments = Box::leak(
            json!({"directory":"external-file","path":path.strip_prefix("/").unwrap()})
                .to_string()
                .into_boxed_str(),
        );
        let (release, held) = tokio::sync::oneshot::channel();
        let mut release = Some(release);
        let mut endpoint = Endpoint::start(vec![
            Reply::Tool("read_file", arguments),
            Reply::Release("ask", held),
            Reply::Finished("I left the file alone."),
        ])
        .await;
        let mut init = initialize();
        init["clientCapabilities"]["_meta"][WINDOW] = json!(1);
        let mut client = Stdio::start(&fixture, &endpoint.url);
        client.request("initialize", init.clone()).await;
        let chat = session(&mut client, &fixture).await;
        let accepted = client
            .request(
                "_co.grida/session/submit",
                prompt_request(
                    &chat,
                    "external-read",
                    &format!("Please read {}", path.display()),
                ),
            )
            .await;
        let turn = accepted["result"]["turnId"].as_str().unwrap();
        endpoint.request().await;
        endpoint.request().await;
        let view = if person_answers_first {
            snapshot(&mut client, &chat).await
        } else {
            release.take().unwrap().send(()).unwrap();
            wait_for(&mut client, &chat, |s| {
                s["current"]["disposition"] == "suspended"
            })
            .await
        };
        let pending = client
            .request(
                "_co.grida/session/approvals",
                json!({"sessionId":chat,"turnId":turn}),
            )
            .await;
        let approval = &pending["result"]["approvals"][0];
        if person_answers_first {
            assert_eq!(approval["reviewing"], true, "{pending}");
        } else {
            assert_eq!(approval["reviewFailure"], "needs_human", "{pending}");
        }
        let control = json!({"sessionId":chat,"turnId":turn,"requestId":"manual-decline",
            "waitId":approval["waitId"],"decision":"decline",
            "expectedSessionRevision":view["sessionRevision"],"expectedControlRevision":pending["result"]["controlRevision"]});
        let answered = client
            .request("_co.grida/session/answer-approval", control.clone())
            .await;
        assert!(answered.get("error").is_none(), "{answered}");
        if let Some(release) = release {
            release.send(()).unwrap();
        }
        assert!(
            endpoint
                .request()
                .await
                .to_string()
                .contains("permission_declined")
        );
        settle(&mut client, &chat).await;
        let retry = client
            .request("_co.grida/session/answer-approval", control)
            .await;
        assert_eq!(retry["result"], answered["result"], "{retry}");
        client.close().await;

        let mut client = Stdio::start(&fixture, &endpoint.url);
        client.request("initialize", init).await;
        let loaded = client
            .request(
                "session/load",
                json!({"cwd":fixture.primary,"sessionId":chat,"mcpServers":[]}),
            )
            .await;
        assert!(loaded.get("error").is_none(), "{loaded}");
        let window = client.request("session/load",json!({"cwd":fixture.primary,"sessionId":chat,"mcpServers":[],"_meta":{WINDOW:{"kind":"read","requestId":"review-replay"}}})).await;
        assert!(window.get("error").is_none(), "{window}");
        let review = &window["result"]["_meta"][WINDOW]["turns"][0]["approvalReviews"];
        if person_answers_first {
            assert!(review.is_null(), "{window}");
        } else {
            assert_eq!(
                review,
                &json!([{"action":path,"decision":"needs_human"}]),
                "{window}"
            );
        }
        client.close().await;
        endpoint.done().await;
    }
}

fn automatic_external_reads() -> Fixture {
    let fixture = external_read_fixture();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["initialPermissionMode"] = json!("approve_for_me");
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    fixture
}

#[tokio::test]
async fn approve_for_me_reviews_siblings_after_one_needs_a_person() {
    let fixture = automatic_external_reads();
    let directory = fixture.primary.parent().unwrap();
    let paths = [directory.join("first.txt"), directory.join("second.txt")];
    fs::write(&paths[0], "first sibling contents").unwrap();
    fs::write(&paths[1], "second sibling contents").unwrap();
    let calls: Vec<_> = paths
        .iter()
        .enumerate()
        .map(|(index, path)| {
            let arguments =
                json!({"directory":"external-file","path":path.strip_prefix("/").unwrap()});
            json!({"index":index,"id":format!("read-{index}"),"type":"function",
            "function":{"name":"read_file","arguments":arguments.to_string()}})
        })
        .collect();
    let streamed = json!({"id":"reads","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":calls},"finish_reason":null}]});
    let finished =
        json!({"id":"reads","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]});
    let body = format!("data: {streamed}\n\ndata: {finished}\n\ndata: [DONE]\n\n");
    let mut endpoint = Endpoint::start(vec![
        Reply::RawHttp(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())),
        Reply::Finished("ask"),
        Reply::Finished("allow"),
        Reply::Finished("Done."),
    ]).await;
    let mut client = open(&fixture, &endpoint.url).await;
    let chat = session(&mut client, &fixture).await;
    let prompt = format!("Read {} and {}", paths[0].display(), paths[1].display());
    let accepted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(&chat, "two-reads", &prompt),
        )
        .await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    endpoint.request().await;
    let mut reviewed = Vec::new();
    for _ in &paths {
        let review = endpoint.request().await;
        let evidence: Value =
            serde_json::from_str(review["messages"][1]["content"].as_str().unwrap()).unwrap();
        reviewed.push(PathBuf::from(
            evidence["action"]["absolute_path"].as_str().unwrap(),
        ));
    }
    assert!(
        paths.iter().all(|path| reviewed.contains(path)),
        "{reviewed:?}"
    );
    let paused = wait_for(&mut client, &chat, |s| {
        s["current"]["disposition"] == "suspended"
    })
    .await;
    let waits = client
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":chat,"turnId":turn}),
        )
        .await;
    let waits = &waits["result"]["approvals"];
    assert_eq!(waits.as_array().unwrap().len(), 1, "{waits}");
    assert_eq!(waits[0]["reviewFailure"], "needs_human", "{waits}");
    assert_eq!(
        waits[0]["request"]["effect"]["relative_path"],
        json!(reviewed[0].strip_prefix("/").unwrap()),
        "{waits}"
    );
    let mut decline = task_basis(&paused, &chat, "decline-first");
    decline["waitId"] = waits[0]["waitId"].clone();
    decline["decision"] = json!("decline");
    let declined = client
        .request("_co.grida/session/answer-approval", decline)
        .await;
    assert!(declined.get("error").is_none(), "{declined}");
    let result = endpoint.request().await["messages"].to_string();
    assert!(result.contains("permission_declined"), "{result}");
    for (index, path) in reviewed.iter().enumerate() {
        let contents = fs::read_to_string(path).unwrap();
        assert_eq!(result.contains(&contents), index == 1, "{result}");
    }
    settle(&mut client, &chat).await;
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn approve_for_me_uses_attributed_answers_to_optional_and_required_questions() {
    let fixture = automatic_external_reads();
    let directory = fixture.primary.parent().unwrap();
    let named = directory.join("selected.txt");
    let additional = directory.join("additional.txt");
    fs::write(&additional, "additional reading").unwrap();
    let suggested = directory.join("suggested.txt");
    fs::write(&named, PRIVATE_TEXT).unwrap();
    fs::write(&suggested, "unapproved suggestion").unwrap();
    let question = format!(
        "Which reference should I read? One possibility is {}",
        suggested.display()
    );
    let arguments = Box::leak(json!({"question":question}).to_string().into_boxed_str());
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool(
            "question_async",
            r#"{"question":"Which other reference should I use?"}"#,
        ),
        Reply::Tool("question", arguments),
        external_read(&named),
        Reply::Finished("allow"),
        external_read(&additional),
        Reply::Finished("allow"),
        external_read(&suggested),
    ])
    .await;
    let mut init = initialize();
    for key in [
        "co.grida/session/questions",
        "co.grida/session/answer-question",
    ] {
        init["clientCapabilities"]["_meta"][key] = json!(1);
    }
    let mut client = Stdio::start(&fixture, &endpoint.url);
    client.request("initialize", init).await;
    let chat = session(&mut client, &fixture).await;
    let accepted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(
                &chat,
                "choose-a-file",
                "Help me summarize a reference file.",
            ),
        )
        .await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    endpoint.request().await;
    endpoint.request().await;
    let selection = format!("Read {}", named.display());
    let second_selection = format!("Also include {}", additional.display());
    for (style, text) in [
        ("nonblocking", &second_selection),
        ("answer_dependent", &selection),
    ] {
        let waiting = wait_for(&mut client, &chat, |s| {
            s["current"]["disposition"] == "suspended"
        })
        .await;
        let list = client
            .request(
                "_co.grida/session/questions",
                json!({"sessionId":chat,"turnId":turn}),
            )
            .await;
        let item = list["result"]["questions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["style"] == style)
            .unwrap();
        let mut response = task_basis(&waiting, &chat, style);
        response["expectedHistoryPosition"] = list["result"]["historyPosition"].clone();
        response["waitId"] = item["waitId"].clone();
        response["answer"] = json!({"kind":"text","text":text});
        let answer = client
            .request("_co.grida/session/answer-question", response)
            .await;
        assert!(answer.get("error").is_none(), "{answer}");
    }
    let acting = endpoint.request().await;
    assert!(
        acting["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["role"] == "tool" && m["content"].as_str().unwrap().contains(&selection)),
        "{acting}"
    );
    assert!(
        acting["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["role"] == "user"
                && m["content"]
                    .as_str()
                    .is_some_and(|text| text.contains(&second_selection))),
        "{acting}"
    );
    for (path, contents) in [(&named, PRIVATE_TEXT), (&additional, "additional reading")] {
        let review = endpoint.request().await;
        let evidence: Value =
            serde_json::from_str(review["messages"][1]["content"].as_str().unwrap()).unwrap();
        assert_eq!(evidence["action"]["absolute_path"], json!(path), "{review}");
        assert!(
            evidence["user_instructions"]
                .to_string()
                .contains(&selection)
                && evidence["user_instructions"]
                    .to_string()
                    .contains(&second_selection),
            "{review}"
        );
        let result = endpoint.request().await["messages"].to_string();
        assert!(result.contains(contents), "{result}");
    }
    wait_for(&mut client, &chat, |s| {
        s["current"]["disposition"] == "suspended"
    })
    .await;
    let waits = client
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":chat,"turnId":turn}),
        )
        .await;
    assert_eq!(
        waits["result"]["approvals"][0]["request"]["effect"]["relative_path"],
        json!(suggested.strip_prefix("/").unwrap()),
        "{waits}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn approve_for_me_reviews_only_a_named_external_file_under_the_accepted_mode() {
    const MODE: &str = "co.grida/session/permission-mode";
    const WINDOW: &str = "co.grida/session/transcript-window";
    let fixture = Fixture::new(false);
    let path = fixture
        .primary
        .parent()
        .unwrap()
        .join("named reference.txt");
    fs::write(&path, PRIVATE_TEXT).unwrap();
    let second_path = path.with_file_name("second reference.txt");
    fs::write(&second_path, "unapproved second reference").unwrap();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowExternalFileRead"] = json!(true);
    profile["allowApproveForMe"] = json!(true);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let arguments: &'static str = Box::leak(
        json!({"directory":"external-file","path":path.strip_prefix("/").unwrap()})
            .to_string()
            .into_boxed_str(),
    );
    let second_arguments: &'static str = Box::leak(
        json!({"directory":"external-file","path":second_path.strip_prefix("/").unwrap()})
            .to_string()
            .into_boxed_str(),
    );
    let (release_tool, held_tool) = tokio::sync::oneshot::channel();
    let (release_review, held_review) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Understood."),
        Reply::Finished("The user is drafting a report."),
        Reply::After(held_tool, Box::new(Reply::Tool("read_file", arguments))),
        Reply::Release("allow", held_review),
        Reply::Tool("read_file", second_arguments),
        Reply::Finished("deny"),
        Reply::Finished("Read is complete."),
        Reply::Tool("read_file", arguments),
    ])
    .await;
    let mut init = initialize();
    init["clientCapabilities"]["_meta"][MODE] = json!(1);
    init["clientCapabilities"]["_meta"][WINDOW] = json!(1);
    init["clientCapabilities"]["_meta"]["co.grida/session/compact"] = json!(1);
    let mut client = Stdio::start(&fixture, &endpoint.url);
    client.request("initialize", init.clone()).await;
    let chat = session(&mut client, &fixture).await;
    let another = session(&mut client, &fixture).await;
    let inspect = |id: &str| json!({"cwd":fixture.primary, "sessionId":id});
    let update = |revision: u64, mode: &str| json!({"cwd":fixture.primary, "sessionId":chat,"expectedRevision":revision,"requestId":format!("choice-{revision}"),"mode":mode});
    let initial = client
        .request("_co.grida/session/permission-mode", inspect(&chat))
        .await;
    assert_eq!(
        initial["result"]["available"],
        json!(["restricted", "approve_for_me"]),
        "{initial}"
    );
    assert_eq!(initial["result"]["mode"], "restricted");
    let chosen = client
        .request(
            "_co.grida/session/permission-mode/update",
            update(0, "approve_for_me"),
        )
        .await;
    assert_eq!(chosen["result"]["mode"], "approve_for_me", "{chosen}");
    assert_eq!(
        client
            .request(
                "_co.grida/session/permission-mode/update",
                update(0, "approve_for_me")
            )
            .await["result"],
        chosen["result"]
    );
    assert_eq!(
        client
            .request("_co.grida/session/permission-mode", inspect(&another))
            .await["result"]["mode"],
        "restricted"
    );

    // Reopen before accepting work to exercise persisted selection.
    client.close().await;
    let mut client = Stdio::start(&fixture, &endpoint.url);
    client.request("initialize", init).await;
    let loaded = client
        .request(
            "session/load",
            json!({"cwd":fixture.primary,"sessionId":chat,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    assert_eq!(
        client
            .request("_co.grida/session/permission-mode", inspect(&chat))
            .await["result"]["mode"],
        "approve_for_me"
    );
    // Omit the original restriction from the acting model's compacted context.
    // Review must independently obtain it from this chat's original transcript.
    const RESTRICTION: &str =
        "Keep the project offline and ask before reading confidential drafts.";
    let instruction = format!(
        "{RESTRICTION} {}",
        "Use plain English in the report. ".repeat(26)
    );
    let first = client
        .request(
            "session/prompt",
            json!({"sessionId":chat,"prompt":[{"type":"text","text":instruction}]}),
        )
        .await;
    assert!(first.get("error").is_none(), "{first}");
    endpoint.request().await;
    let compact = client
        .request(
            "_co.grida/session/compact",
            json!({"sessionId":chat,"requestId":"short-context"}),
        )
        .await;
    assert_eq!(compact["result"]["status"], "installed", "{compact}");
    endpoint.request().await;

    let prompt = format!(
        "Please read {} and {} before drafting.",
        path.display(),
        second_path.display()
    );
    let accepted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(&chat, "captured-review", &prompt),
        )
        .await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    let acting = endpoint.request().await;
    assert!(!acting.to_string().contains(RESTRICTION), "{acting}");
    let lowered = client
        .request(
            "_co.grida/session/permission-mode/update",
            update(1, "restricted"),
        )
        .await;
    assert_eq!(lowered["result"]["mode"], "restricted", "{lowered}");
    release_tool.send(()).unwrap();
    let reviewer = endpoint.request().await;
    assert!(reviewer.get("tools").is_none(), "{reviewer}");
    let evidence = reviewer.to_string();
    assert!(evidence.contains(RESTRICTION), "{reviewer}");
    assert!(
        evidence.contains(path.to_str().unwrap()) && !evidence.contains(PRIVATE_TEXT),
        "{reviewer}"
    );
    let waiting = client
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":chat,"turnId":turn}),
        )
        .await;
    assert_eq!(
        waiting["result"]["approvals"][0]["reviewing"], true,
        "{waiting}"
    );
    release_review.send(()).unwrap();
    assert!(endpoint.request().await.to_string().contains(PRIVATE_TEXT));
    let second_review = endpoint.request().await;
    assert!(
        second_review.get("tools").is_none()
            && second_review
                .to_string()
                .contains(second_path.to_str().unwrap()),
        "{second_review}"
    );
    let result = endpoint.request().await.to_string();
    assert!(
        result.contains("permission_declined") && !result.contains("unapproved second reference"),
        "{result}"
    );
    settle(&mut client, &chat).await;
    let window = client.request("session/load",json!({"cwd":fixture.primary,"sessionId":chat,"mcpServers":[],"_meta":{WINDOW:{"kind":"read","requestId":"reviewed-turn"}}})).await;
    assert_eq!(
        window["result"]["_meta"][WINDOW]["turns"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["turnId"] == turn)
            .unwrap()["approvalReviews"],
        json!([{"action":path,"decision":"approved"}, {"action":second_path,"decision":"declined"}]),
        "{window}"
    );

    // Switch on again. An inherited path in the prior conversation supplies no permission for another read.
    client
        .request(
            "_co.grida/session/permission-mode/update",
            update(2, "approve_for_me"),
        )
        .await;
    let accepted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(&chat, "unnamed-read", "Continue drafting."),
        )
        .await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    endpoint.request().await;
    wait_for(&mut client, &chat, |snapshot| {
        snapshot["current"]["disposition"] == "suspended"
    })
    .await;
    let pending = client
        .request(
            "_co.grida/session/approvals",
            json!({"sessionId":chat,"turnId":turn}),
        )
        .await;
    assert_eq!(
        pending["result"]["approvals"].as_array().unwrap().len(),
        1,
        "{pending}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}

fn network_fixture() -> Fixture {
    let fixture = Fixture::new(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["allowApproveForMe"] = json!(true);
    profile["initialPermissionMode"] = json!("approve_for_me");
    profile["allowCommandNetwork"] = json!(true);
    profile["command"]["diskRead"] = json!(true);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    fixture
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and working Seatbelt or bubblewrap"]
async fn approved_network_command_uses_its_exact_destination_broker() {
    let fixture = network_fixture();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("exec_command", r#"{"cmd":"exec /usr/bin/curl --max-time 3 -sS http://other.example/","access":"read_write","directory":"extra","network":{"host":"updates.example","port":80}}"#),
        Reply::Finished("allow"),
        Reply::Finished("The broker refused the other destination."),
    ]).await;
    let mut owner = open(&fixture, &endpoint.url).await;
    let chat = session(&mut owner, &fixture).await;
    let reply = owner.request("session/prompt", json!({"sessionId":chat,"prompt":[{"type":"text","text":"Check that a command granted http://updates.example:80 rejects other destinations."}]})).await;
    assert!(reply.get("error").is_none(), "{reply}");
    endpoint.request().await;
    let review = endpoint.request().await;
    assert!(review.to_string().contains("network_command"), "{review}");
    let completed = endpoint.request().await;
    let result = completed["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["role"] == "tool")
        .unwrap()
        .to_string();
    // SOCKS status 2 distinguishes a live broker's policy refusal from a
    // connection/setup error. The forbidden name must never reach DNS.
    assert!(
        result.contains("SOCKS5") && result.contains("(2)"),
        "{result}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    owner.close().await;
    endpoint.done().await;

    // The Linux qualification runs a fixture origin under this exact hostname
    // inside an isolated network namespace, with a real resolver and TCP dial.
    if std::env::var_os("GRIDA_AGENT_TEST_BROKER_ORIGIN").is_some() {
        let body = "approved manifest from the fixture origin";
        let origin =
            crate::full_access::ResourceServer::bind("updates.example", body.as_bytes().to_vec())
                .await;
        let url = reqwest::Url::parse(&origin.url).unwrap();
        let args = json!({
            "directory":"extra", "access":"read_write",
            "cmd": format!("exec /usr/bin/curl --max-time 5 -fsS {url}manifest"),
            "network":{"host":url.host_str().unwrap(),"port":url.port().unwrap()}
        });
        let mut endpoint = Endpoint::start(vec![
            Reply::Tool("exec_command", Box::leak(args.to_string().into_boxed_str())),
            Reply::Finished("allow"),
            Reply::Finished("Read the approved manifest."),
        ])
        .await;
        let mut owner = open(&fixture, &endpoint.url).await;
        let chat = session(&mut owner, &fixture).await;
        let result = owner.request("session/prompt", json!({
            "sessionId":chat, "prompt":[{"type":"text","text":format!("Read {url}manifest using a command.")}]
        })).await;
        assert!(result.get("error").is_none(), "{result}");
        endpoint.request().await;
        let review = endpoint.request().await;
        assert!(review.to_string().contains("network_command"), "{review}");
        let completed = endpoint.request().await;
        let result = crate::full_access::last_tool(&completed);
        assert!(result["content"].to_string().contains(body), "{result}");
        assert_eq!(
            origin.paths.lock().unwrap().as_slice(),
            ["GET /manifest HTTP/1.1"]
        );
        owner.close().await;
        endpoint.done().await;
    }
}

#[tokio::test]
#[ignore = "requires a reviewed native helper and working Seatbelt or bubblewrap"]
async fn a_broader_network_retry_requires_a_second_review_of_the_same_command() {
    const OFFLINE: &str = "Keep this project offline.";
    let fixture = network_fixture();
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    const ENV_VALUE: &str = "private fixture environment value";
    profile["command"]["environment"] = json!({"BUILD_CONTEXT":ENV_VALUE});
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let local = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = local.local_addr().unwrap().port();
    let request = format!(
        "Check the service at http://updates.example:{port} as far as the existing offline restriction allows."
    );
    let cmd = format!(
        "printf x >> starts; /usr/bin/curl --max-time 1 --resolve updates.example:{port}:127.0.0.1 http://updates.example:{port}/ || printf 'isolated-command-could-not-connect'"
    );
    let base = json!({"cmd":cmd,"access":"read_write","directory":"extra"});
    let mut broader = base.clone();
    broader["network"] = json!({"host":"updates.example","port":port});
    let args = |value: Value| &*Box::leak(value.to_string().into_boxed_str());
    let (permit, first_wait) = tokio::sync::oneshot::channel();
    let (decline, second_wait) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("I will keep the project offline."),
        Reply::Tool("exec_command", args(base)),
        Reply::Release("allow", first_wait),
        Reply::Tool("exec_command", args(broader)),
        Reply::Release("deny", second_wait),
        Reply::Finished(
            "The confined command could not connect. The requested network retry was declined.",
        ),
    ])
    .await;
    let mut owner = open(&fixture, &endpoint.url).await;
    let session = session(&mut owner, &fixture).await;
    let reply = owner
        .request(
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":OFFLINE}]}),
        )
        .await;
    assert!(reply.get("error").is_none(), "{reply}");
    let accepted = owner
        .request(
            "_co.grida/session/submit",
            prompt_request(&session, "validate-network", &request),
        )
        .await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    let scope = json!({"sessionId":session,"turnId":turn});
    endpoint.request().await;
    endpoint.request().await;
    let first_review = endpoint.request().await;
    let first = owner
        .request("_co.grida/session/approvals", scope.clone())
        .await["result"]["approvals"][0]["request"]
        .clone();
    assert_eq!(first["effect"]["command"], cmd);
    assert_eq!(first["effect"]["finite"], true);
    assert!(first["effect"].get("network").is_none());
    let fs_access = &first["effect"]["filesystem"];
    assert_eq!(fs_access["disk_read"], true, "{first}");
    assert_eq!(fs_access["private_temp_write"], true);
    assert_eq!(fs_access["resolved_cwd"], json!(fixture.extra));
    assert!(Path::new(fs_access["resolved_executable"].as_str().unwrap()).is_absolute());
    assert!(
        fs_access["runtime_roots"]
            .as_array()
            .is_some_and(|roots| !roots.is_empty())
    );
    for writable in [
        fixture.extra.clone(),
        Path::new("/tmp").canonicalize().unwrap(),
    ] {
        assert!(
            fs_access["write_roots"]
                .as_array()
                .unwrap()
                .contains(&json!(writable)),
            "{fs_access}"
        );
    }
    assert_eq!(
        first["effect"]["environment_names"],
        json!(["BUILD_CONTEXT"])
    );
    assert!(!fixture.extra.join("starts").exists());
    permit.send(()).unwrap();
    let first_outcome = endpoint.request().await;
    let second_review = endpoint.request().await;
    let second = owner.request("_co.grida/session/approvals", scope).await["result"]["approvals"]
        [0]["request"]
        .clone();
    assert_eq!(
        second["effect"]["network"],
        json!({"host":"updates.example","port":port})
    );
    let mut expected_effect = first["effect"].clone();
    expected_effect["network"] = second["effect"]["network"].clone();
    assert_eq!(second["effect"], expected_effect);
    assert_eq!(first["session"], second["session"]);
    assert_eq!(first["turn"], second["turn"]);
    for field in ["operation", "action", "scope"] {
        assert!(!first[field].is_null());
        assert_ne!(first[field], second[field], "{field}");
    }
    assert_eq!(fs::read(fixture.extra.join("starts")).unwrap(), b"x");
    decline.send(()).unwrap();
    let final_outcome = endpoint.request().await;
    for review in [&first_review, &second_review] {
        let evidence: Value =
            serde_json::from_str(review["messages"][1]["content"].as_str().unwrap()).unwrap();
        assert_eq!(&evidence["action"]["filesystem"], fs_access);
        assert_eq!(evidence["action"]["workspace_root"], first["root"]);
        assert_eq!(
            evidence["action"]["environment_names"],
            json!(["BUILD_CONTEXT"])
        );
        assert!(!review.to_string().contains(ENV_VALUE));
        assert!(review.get("tools").is_none(), "{review}");
        assert!(review.to_string().contains(OFFLINE), "{review}");
        assert!(review.to_string().contains(&cmd), "{review}");
    }
    assert_ne!(first_review["messages"], second_review["messages"]);
    assert!(
        first_outcome["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["role"] == "tool"
                && m.to_string().contains("isolated-command-could-not-connect")),
        "{first_outcome}"
    );
    assert!(
        second_review.to_string().contains("network_command"),
        "{second_review}"
    );
    assert!(
        final_outcome.to_string().contains("permission_declined"),
        "{final_outcome}"
    );
    assert_eq!(fs::read(fixture.extra.join("starts")).unwrap(), b"x");
    assert!(
        tokio::time::timeout(Duration::from_millis(25), local.accept())
            .await
            .is_err()
    );
    assert!(endpoint.requests.try_recv().is_err());
    settle(&mut owner, &session).await;
    owner.close().await;
    endpoint.done().await;
}
