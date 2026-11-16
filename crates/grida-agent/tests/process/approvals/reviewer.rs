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
