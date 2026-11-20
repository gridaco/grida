//! Exercise predictions through the exact executable and its negotiated private transport.
use super::approvals::Stdio as Client;
use super::*;
const METHOD: &str = "_co.grida/session/predict-prompt";
const SNAPSHOT: &str = "_co.grida/session/snapshot";
pub(super) const ECONOMY_MODEL: &str = "openai/gpt-6-luna";
pub(super) const ECONOMY_ROUTE: &str = "87b48b17-e898-4771-9be7-fa8378b2a6c0";

async fn start(state: &Path, endpoint: &str, negotiate: bool) -> Client {
    initialize(Client::from_child(spawn_serve(state, endpoint)), negotiate).await
}

async fn initialize(mut client: Client, negotiate: bool) -> Client {
    let mut init = extension_initialize();
    init["clientCapabilities"]["_meta"]["co.grida/session/compact"] = 1.into();
    if negotiate {
        init["clientCapabilities"]["_meta"][&METHOD[1..]] = 1.into();
    }
    let reply = client.request("initialize", init).await;
    assert_eq!(
        reply["result"]["agentCapabilities"]["_meta"][&METHOD[1..]],
        1,
        "{reply}"
    );
    client
}

async fn answered(client: &mut Client, session: &str, text: &str) {
    let reply = client
        .request(
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":text}]}),
        )
        .await;
    assert_eq!(reply["result"]["stopReason"], "end_turn", "{reply}");
}

async fn create(client: &mut Client, cwd: &Path) -> String {
    let reply = client
        .request("session/new", json!({"cwd":cwd,"mcpServers":[]}))
        .await;
    reply["result"]["sessionId"].as_str().unwrap().to_owned()
}

#[tokio::test]
async fn prediction_reuses_the_compacted_request_and_preserves_parent_and_usage() {
    let tmp = TempDir::new().unwrap();
    let state = tmp.path().join("state");
    let cwd = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("First original reply."),
        Reply::Finished("I checked the changelog."),
        Reply::Finished("Use mulberry for the release heading."),
        Reply::Finished("The heading is ready."),
        super::summaries::reported_usage_answer(
            "Apply the mulberry heading to the changelog.",
            72,
            11,
        ),
    ])
    .await;
    let localhost = endpoint.url.replace("127.0.0.1", "localhost");
    let mut client = start(&state, &localhost, true).await;
    let session = create(&mut client, cwd.path()).await;
    let scope = json!({"sessionId":session});
    answered(
        &mut client,
        &session,
        "Remember the private scratch wording from the first step.",
    )
    .await;
    endpoint.request().await;
    answered(&mut client, &session, "Check the changelog.").await;
    endpoint.request().await;
    let compact = client
        .request(
            "_co.grida/session/compact",
            json!({"sessionId":session,"requestId":"compact"}),
        )
        .await;
    assert!(compact["error"].is_null(), "{compact}");
    endpoint.request().await;
    answered(&mut client, &session, "Prepare the heading.").await;
    let original = endpoint.request().await;
    let snapshot = client.request(SNAPSHOT, scope.clone()).await["result"].clone();
    let history = client
        .request("_co.grida/session/history", scope.clone())
        .await["result"]
        .clone();
    let request = json!({"sessionId":session,"turnId": snapshot["latest"]["turnId"]});
    let reply = client.request(METHOD, request.clone()).await;
    assert_eq!(
        reply["result"]["text"], "Apply the mulberry heading to the changelog.",
        "{reply}"
    );
    let sent = endpoint.request().await;
    assert_eq!(reply["result"]["modelId"], original["model"]);
    assert_eq!(sent["model"], original["model"]);
    let messages = sent["messages"].as_array().unwrap();
    let original = original["messages"].as_array().unwrap();
    assert_eq!(&messages[..original.len()], original);
    let material = sent["messages"].to_string();
    assert!(
        material.contains("Use mulberry for the release heading.")
            && material.contains("The heading is ready."),
        "{sent}"
    );
    assert!(!material.contains("private scratch wording"));
    assert!(
        sent.get("tools")
            .is_none_or(|tools| tools.as_array().is_some_and(Vec::is_empty))
    );
    assert!(reply["result"]["elapsedMs"].is_u64());
    let counts = reply["result"]["tokenUsage"]["reported"]
        .as_array()
        .unwrap();
    for (category, tokens) in [("input", "72"), ("cached_input", "0"), ("output", "11")] {
        assert!(
            counts
                .iter()
                .any(|part| part["category"] == category && part["tokens"] == tokens),
            "{reply}"
        );
    }
    assert_eq!(
        client.request(SNAPSHOT, scope.clone()).await["result"],
        snapshot
    );
    assert_eq!(
        client
            .request("_co.grida/session/history", scope.clone())
            .await["result"],
        history
    );
    client.close().await;
    let mut reopened = start(&state, &localhost, true).await;
    assert!(reopened.request(METHOD, request.clone()).await["error"].is_object());
    reopened
        .request(
            "session/load",
            json!({"cwd":cwd.path(),"sessionId":session,"mcpServers":[]}),
        )
        .await;
    let replay = reopened.request(METHOD, request).await;
    assert_eq!(replay["result"]["text"], Value::Null, "{replay}");
    assert!(replay["error"].is_null(), "{replay}");
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn a_held_prediction_never_blocks_the_next_turn_or_charges_for_a_duplicate() {
    let tmp = TempDir::new().unwrap();
    let state = tmp.path().join("state");
    let cwd = TempDir::new().unwrap();
    let (release, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("The outline is ready."),
        Reply::Release("Expand the outline.", held),
        Reply::Finished("The new task is complete."),
        Reply::Stop("content_filter"),
    ])
    .await;
    let mut client = start(&state, &endpoint.url, true).await;
    let session = create(&mut client, cwd.path()).await;
    let scope = json!({"sessionId":session});
    answered(&mut client, &session, "Prepare an outline.").await;
    endpoint.request().await;
    let snapshot = client.request(SNAPSHOT, scope.clone()).await;
    let request = json!({"sessionId":session,"turnId":snapshot["result"]["latest"]["turnId"]});
    let first = client.send(METHOD, request.clone()).await;
    endpoint.request().await;
    let duplicate = client.request(METHOD, request.clone()).await;
    assert!(
        duplicate["error"].is_null() && duplicate["result"]["text"].is_null(),
        "{duplicate}"
    );
    answered(&mut client, &session, "Change direction.").await;
    endpoint.request().await;
    release.send(()).unwrap();
    let late = client.read_reply().await;
    assert_eq!(late["id"], first);
    assert!(
        late["result"]["text"].is_null() && late["error"].is_null(),
        "{late}"
    );
    let snapshot = client.request(SNAPSHOT, scope).await;
    let refused = client
        .request(
            METHOD,
            json!({"sessionId":session,"turnId":snapshot["result"]["latest"]["turnId"]}),
        )
        .await;
    assert!(
        refused["error"].is_null() && refused["result"]["text"].is_null(),
        "{refused}"
    );
    endpoint.request().await;
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn predictions_require_negotiation_and_refuse_workspace_actions_or_unusable_text() {
    let tmp = TempDir::new().unwrap();
    let state = tmp.path().join("state");
    let cwd = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("The specification is ready."),
        Reply::Tool(
            "write_file",
            r#"{"path":"unexpected","content":"unexpected"}"#,
        ),
        Reply::Finished("The work is finished."),
        Reply::Finished("NONE"),
        Reply::Finished("The draft is ready."),
        Reply::Finished("First line\u{2028}Second line"),
        Reply::Finished("The changes are ready."),
        Reply::Finished("First paragraph\u{2029}Second paragraph"),
        Reply::Finished("All reports are filed."),
        Reply::Hold("Partially generated"),
        Reply::Finished("The final report is published."),
    ])
    .await;
    let mut unnegotiated = start(&state, &endpoint.url, false).await;
    let session = create(&mut unnegotiated, cwd.path()).await;
    let scope = json!({"sessionId":session});
    answered(&mut unnegotiated, &session, "Prepare the specification.").await;
    endpoint.request().await;
    let snapshot = unnegotiated.request(SNAPSHOT, scope.clone()).await;
    let request = json!({"sessionId":session,"turnId":snapshot["result"]["latest"]["turnId"]});
    assert_eq!(
        unnegotiated.request(METHOD, request.clone()).await["error"]["code"],
        -32601
    );
    unnegotiated.close().await;

    let mut client = start(&state, &endpoint.url, true).await;
    let load = client
        .request(
            "session/load",
            json!({"cwd":cwd.path(),"sessionId":session,"mcpServers":[]}),
        )
        .await;
    assert!(load["error"].is_null(), "{load}");
    let refused = client.request(METHOD, request).await;
    assert!(
        refused["error"].is_null() && refused["result"]["text"].is_null(),
        "{refused}"
    );
    endpoint.request().await;
    assert!(!cwd.path().join("unexpected").exists());

    for prompt in [
        "Finish the work.",
        "Prepare the draft.",
        "Make the changes.",
        "File the reports.",
    ] {
        answered(&mut client, &session, prompt).await;
        endpoint.request().await;
        let snapshot = client.request(SNAPSHOT, scope.clone()).await;
        let request = json!({"sessionId":session,"turnId":snapshot["result"]["latest"]["turnId"]});
        let reply = client.request(METHOD, request).await;
        assert!(
            reply["error"].is_null() && reply["result"]["text"].is_null(),
            "{reply}"
        );
        endpoint.request().await;
    }
    answered(&mut client, &session, "Publish the final report.").await;
    endpoint.request().await;
    let snapshot = client.request(SNAPSHOT, scope).await;
    let request = json!({"sessionId":session,"turnId":snapshot["result"]["latest"]["turnId"]});
    client.close().await;

    let mut rotated = executable();
    rotated.args(["serve", "--stdio"]);
    configured(&mut rotated, &state, &endpoint.url);
    rotated.env("GRIDA_AGENT_PROCESS_TEST_KEY", "different-fixture-key");
    let child = rotated
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut switched = initialize(Client::from_child(child), true).await;
    let loaded = switched
        .request(
            "session/load",
            json!({"cwd":cwd.path(),"sessionId":session,"mcpServers":[]}),
        )
        .await;
    assert!(loaded["error"].is_null(), "{loaded}");
    let different_account = switched.request(METHOD, request.clone()).await;
    assert!(
        different_account["error"].is_null() && different_account["result"]["text"].is_null(),
        "{different_account}"
    );
    assert!(endpoint.requests.try_recv().is_err());
    switched.close().await;

    endpoint.done().await;
}

#[tokio::test]
async fn prediction_usage_and_absent_cache_evidence_follow_the_selected_protocol() {
    for (protocol, wire, input) in [
        (ProviderProtocol::Responses, "responses", "input"),
        (ProviderProtocol::Anthropic, "anthropic", "uncached_input"),
        (ProviderProtocol::Gemini, "gemini", "input"),
    ] {
        let tmp = TempDir::new().unwrap();
        let cwd = TempDir::new().unwrap();
        let answer = match protocol {
            ProviderProtocol::Responses => Reply::ResponsesSigned("Use the design summary."),
            ProviderProtocol::Gemini => Reply::GeminiSigned("Use the design summary."),
            _ => Reply::Finished("Use the design summary."),
        };
        let mut endpoint = Endpoint::start_protocol(
            protocol,
            vec![answer, Reply::Finished("Apply the design summary.")],
            Some(TEST_CREDENTIAL),
        )
        .await;
        let mut command = executable();
        command.args(["serve", "--stdio", "--provider", wire]);
        configured(&mut command, &tmp.path().join("state"), &endpoint.url);
        let child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let mut client = initialize(Client::from_child(child), true).await;
        let session = create(&mut client, cwd.path()).await;
        answered(&mut client, &session, "Read the summary.").await;
        endpoint.request().await;
        let snapshot = client.request(SNAPSHOT, json!({"sessionId":session})).await;
        let reply = client
            .request(
                METHOD,
                json!({"sessionId":session, "turnId":snapshot["result"]["latest"]["turnId"]}),
            )
            .await;
        assert_eq!(
            reply["result"]["text"], "Apply the design summary.",
            "{wire}: {reply}"
        );
        let sent = endpoint.request().await;
        assert!(
            sent.to_string().contains("Use the design summary."),
            "{wire}: {sent}"
        );
        let reported = reply["result"]["tokenUsage"]["reported"]
            .as_array()
            .unwrap();
        assert!(
            reported
                .iter()
                .any(|row| row["category"] == input && row["tokens"] == "5"),
            "{wire}: {reported:?}"
        );
        assert!(
            reported
                .iter()
                .any(|row| row["category"] == "output" && row["tokens"] == "3")
        );
        assert!(
            !reported.iter().any(|row| row["category"] == "cached_input"),
            "{wire}: {reported:?}"
        );
        client.close().await;
        endpoint.done().await;
    }
}
