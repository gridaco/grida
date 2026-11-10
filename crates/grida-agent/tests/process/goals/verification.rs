//! GRIDA-SEC-004 — built Goal verification through the exact native file grant.

use super::super::approvals::{Fixture, Stdio};
use super::*;
use agent_kit_core::TurnId;
use agent_kit_store_sqlite::SqliteStore;
use grida_agent_master::read_account;
use sha2::{Digest, Sha256};
use std::fs;

const EXPECTED: &[u8] = b"\xef\xbb\xbfApproved release manifest\r\n";
const READ: &str = r#"{"directory":"primary","path":"manifest.txt"}"#;
const OTHER_FILE: &str = r#"{"directory":"primary","path":"another.txt"}"#;
const EVIDENCE_PREFIX: &str =
    "Use these retained call IDs for the indicated goal criteria in goal_report: ";

#[tokio::test]
async fn configured_goal_checks_the_exact_observed_bytes_before_completing() {
    for (label, selected, criterion_matches, read, content, complete) in [
        ("exact", true, true, Some(READ), EXPECTED, true),
        ("wrong file", true, true, Some(OTHER_FILE), EXPECTED, false),
        (
            "wrong bytes",
            true,
            true,
            Some(READ),
            b"Changed manifest\n",
            false,
        ),
        ("wrong criterion", true, false, Some(READ), EXPECTED, false),
        ("model assertion", true, true, None, EXPECTED, false),
        ("unselected", false, true, Some(READ), EXPECTED, false),
    ] {
        let fixture = Fixture::new(false);
        let digest: [u8; 32] = Sha256::digest(EXPECTED).into();
        let mut profile: Value =
            serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
        if selected {
            profile["goalReadVerification"] = json!({
                "directory":"primary","relativePath":"manifest.txt","sha256":digest
            });
            fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
        }
        fs::write(fixture.primary.join("manifest.txt"), content).unwrap();
        fs::write(fixture.primary.join("another.txt"), EXPECTED).unwrap();
        let digest_hex = digest
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let criterion = if criterion_matches {
            format!(
                "Observe SHA-256 {digest_hex} for directory \"primary\", path \"manifest.txt\"."
            )
        } else {
            "The release has been published.".into()
        };
        let mut replies = Vec::new();
        if let Some(arguments) = read {
            replies.push(Reply::Tool("read_file", arguments));
        }
        replies.push(Reply::Choose(Box::new(move |request| {
            let call: String = if complete {
                // The provider's history has a wire alias. The model can only
                // cite the retained ID when it gets the independent data hint.
                let wire = request["messages"].as_array().unwrap().iter().find(|m| m["role"] == "tool").unwrap();
                let alias = wire["tool_call_id"].as_str().unwrap();
                let hint = evidence_hint(request).unwrap();
                let retained = hint[0]["call"].as_str().unwrap();
                assert_ne!(retained, alias);
                retained.into()
            } else {
                assert!(evidence_hint(request).is_none(), "{label}: unsolicited evidence hint");
                "fixture-call".into()
            };
            let args = json!({"report":{"kind":"completion","summary":"The manifest was verified.","evidence":[{"criterion":1,"call":call}]}});
            let body = fixture_tool_body("goal_report", &args.to_string())
                .replacen("\"id\":\"fixture-call\"", "\"id\":\"fixture-report\"", 1);
            Reply::RawHttp(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()))
        })));
        replies.push(Reply::Finished("Finished checking the release manifest."));
        let mut endpoint = Endpoint::start(replies).await;
        let mut client = open(&fixture, &endpoint.url).await;
        let created = client
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let submitted = client.request("_co.grida/goal/start", json!({
            "sessionId":session,"inputId":"manifest-goal",
            "prompt":[{"type":"text","text":"Check the approved release manifest."}],
            "goal":{
                "objective":{"description":"Verify the release manifest","criteria":[criterion]},
                "allowance":{"work_turns":2,"inference_steps":5}
            }
        })).await;
        assert_eq!(
            submitted["result"]["inputId"], "manifest-goal",
            "{label}: {submitted}"
        );
        if read.is_some() {
            endpoint.request().await;
        }
        let report_input = endpoint.request().await;
        let hint = evidence_hint(&report_input);
        let hinted_call = if complete {
            let entries = hint.as_ref().and_then(Value::as_array).unwrap();
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0]["criterion"], 1);
            Some(entries[0]["call"].as_str().unwrap())
        } else {
            assert!(hint.is_none(), "{label}: unsolicited evidence hint");
            None
        };
        endpoint.request().await;
        let settled = timeout(WAIT, async {
            loop {
                let snapshot = client
                    .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                    .await;
                if snapshot["result"]["current"].is_null()
                    && snapshot["result"]["latest"].is_object()
                {
                    break snapshot;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        let turn = settled["result"]["latest"]["turnId"].as_str().unwrap();
        let status = if complete {
            json!({"status":"complete"})
        } else {
            json!({"status":"blocked","reason":"unverified_completion"})
        };
        let goal = client
            .request("_co.grida/goal/inspect", json!({"sessionId":session}))
            .await;
        assert_eq!(goal["result"]["goal"]["status"], status, "{label}: {goal}");
        client.close().await;

        if let Some(hinted_call) = hinted_call {
            let state = fixture.primary.parent().unwrap().join("state");
            let store = SqliteStore::open(state.join("runtime.sqlite")).unwrap();
            let exact = store
                .inspect_turn_with(
                    SessionId::new(session).unwrap(),
                    TurnId::new(turn).unwrap(),
                    |turn| {
                        let outcome = turn.outcome().unwrap();
                        let account = read_account(outcome.account.as_ref().unwrap())?
                            .goal
                            .unwrap();
                        let [verified] = account.verified.as_slice() else {
                            panic!("expected one verified observation");
                        };
                        assert_eq!(verified.criterion, 1);
                        assert!(outcome.evidence.contains(&verified.operation));
                        Ok(turn.operations()[&verified.operation]
                            .record
                            .source_call
                            .as_ref()
                            .unwrap()
                            .as_str()
                            .to_owned())
                    },
                )
                .await
                .unwrap();
            assert_eq!(exact, hinted_call);
            drop(store);
            fs::write(
                fixture.primary.join("manifest.txt"),
                b"changed after verified observation",
            )
            .unwrap();
            let mut restarted = open(&fixture, &endpoint.url).await;
            let loaded = restarted
                .request(
                    "session/load",
                    json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[]}),
                )
                .await;
            assert!(loaded.get("error").is_none(), "{loaded}");
            assert_eq!(
                restarted
                    .request("_co.grida/goal/inspect", json!({"sessionId":session}))
                    .await["result"]["goal"]["status"],
                status
            );
            restarted.close().await;
        }
        assert!(endpoint.requests.try_recv().is_err());
        endpoint.done().await;
    }
}

fn evidence_hint(request: &Value) -> Option<Value> {
    request["messages"].as_array()?.iter().find_map(|message| {
        let value = message["content"].as_str()?.strip_prefix(EVIDENCE_PREFIX)?;
        serde_json::from_str(value).ok()
    })
}

async fn open(fixture: &Fixture, endpoint: &str) -> Stdio {
    let child = fixture
        .process(endpoint, "serve")
        .arg("--stdio")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = Stdio::from_child(child);
    let mut request = extension_initialize();
    for operation in ["start", "inspect"] {
        request["clientCapabilities"]["_meta"][format!("co.grida/goal/{operation}")] = 1.into();
    }
    let ready = client.request("initialize", request).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"]["co.grida/goal/start"],
        1
    );
    client
}
