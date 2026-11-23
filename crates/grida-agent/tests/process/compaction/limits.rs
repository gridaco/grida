//! Automatic compaction uses the accepted input's token limits.

use super::*;
use crate::summaries::{reported_usage, reported_usage_answer};
use std::os::unix::fs::PermissionsExt;

fn limits(state: &Path, window: u64, limit: u64) {
    std::fs::create_dir_all(state).unwrap();
    std::fs::set_permissions(state, std::fs::Permissions::from_mode(0o700)).unwrap();
    let path = state.join("config.toml");
    std::fs::write(
        &path,
        format!("schema_version = 1\nmodel_context_window = {window}\nmodel_auto_compact_token_limit = {limit}\n"),
    )
    .unwrap();
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
}

#[tokio::test]
async fn queued_compaction_uses_reported_context_and_the_limits_captured_before_reload() {
    const OLD: &str = "Keep the printed originals in the archive. The digital collection is a separate source and must retain its own index.";
    const RECENT: &str = "Always keep this recent turn verbatim.";
    const SUMMARY: &str = "Keep the original archive.";
    // 7,950 reported input + 49 output + one new token in "Next" = 8,000.
    // A limit above the window falls back to nine tenths of that window.
    for (window, limit, input, compact) in [
        (50_000, 8_001, 7_950, false),
        (20_000, 8_000, 7_950, true),
        (10_000, 20_000, 8_950, true),
    ] {
        let temporary = TempDir::new().unwrap();
        let state = temporary.path().join("state");
        let workspace = TempDir::new().unwrap();
        limits(&state, window, limit);
        let (release, held) = tokio::sync::oneshot::channel();
        let mut replies = vec![
            reported_usage_answer("The originals have their own index.", 1_000, 10),
            Reply::After(
                held,
                Box::new(reported_usage_answer("Understood.", input, 49)),
            ),
        ];
        if compact {
            replies.push(Reply::Finished(SUMMARY));
        }
        replies.push(Reply::Finished("Finished."));
        let mut endpoint = Endpoint::start(replies).await;
        let (host, url) = shared_server(&state, &endpoint.url).await;
        let mut socket = client(&url).await;
        let session = create(&mut socket, workspace.path()).await;
        // With an exact low measurement, the legacy 96 KiB fallback must not
        // replace the configured token threshold.
        let archive = if compact {
            OLD.to_owned()
        } else {
            OLD.repeat(1_000)
        };
        let initial = prompt(&mut socket, 3, &session, &archive).await;
        assert_eq!(initial["result"]["stopReason"], "end_turn", "{initial}");
        endpoint.request().await;
        let active = ws_rpc(
            &mut socket,
            4,
            "_co.grida/session/submit",
            prompt_request(&session, "recent", RECENT),
        )
        .await;
        assert!(active["result"]["turnId"].is_string(), "{active}");
        endpoint.request().await;
        let queued = ws_rpc(
            &mut socket,
            5,
            "_co.grida/session/enqueue",
            prompt_request(&session, "next", "Next"),
        )
        .await;
        assert_eq!(queued["result"]["disposition"], "queued", "{queued}");

        // The inflight input holds the queue while the new configuration takes
        // effect. The accepted input must still apply its original window/limit.
        limits(&state, 50_000, if compact { 40_000 } else { 100 });
        let inspect = ws_rpc(&mut socket, 6, "_co.grida/config/inspect", json!({})).await;
        let revision = &inspect["result"]["file_revision"];
        assert!(revision.is_string(), "{inspect}");
        let reloaded = ws_rpc(
            &mut socket,
            7,
            "_co.grida/config/reload",
            json!({"expectedRevision":revision}),
        )
        .await;
        assert!(reloaded.get("result").is_some(), "{reloaded}");
        release.send(()).unwrap();

        let mut next = endpoint.request().await;
        if compact {
            assert!(next["messages"].to_string().contains(OLD), "{next}");
            assert!(!next["messages"].to_string().contains(RECENT), "{next}");
            assert!(next["tools"].as_array().is_none_or(Vec::is_empty), "{next}");
            next = endpoint.request().await;
        }
        let messages = &next["messages"];
        let last = messages.as_array().unwrap().last().unwrap();
        assert_eq!(last["role"], "user", "{next}");
        assert_eq!(last["content"], "Next", "{next}");
        let text = messages.to_string();
        assert_eq!(text.contains(OLD), !compact);
        assert_eq!(text.contains(SUMMARY), compact);
        assert!(text.contains(RECENT));
        wait_for_snapshot(&mut socket, &session, |view| view["current"].is_null()).await;
        drop(socket);
        terminate_shared_server(host).await;
        endpoint.done().await;
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tokio::test]
async fn growing_tool_output_compacts_before_the_same_turn_continues() {
    const USER: &str = "Read the archive index and tell me which collection it describes.";
    const MARKER: &str = "Original archive record 302.";
    const SUMMARY: &str = "The archive index identifies collection 302.";
    const FINAL: &str = "It describes collection 302.";
    const WINDOW: &str = "co.grida/session/transcript-window";
    const LIFECYCLE: &str = "co.grida/session/lifecycle";
    for (summary_reply, installed) in [
        (Reply::Finished(SUMMARY), true),
        (Reply::Stop("length"), false),
    ] {
        let fixture = crate::approvals::Fixture::new(false);
        limits(&fixture.state, 20_000, 8_000);
        std::fs::write(
            fixture.primary.join("index.txt"),
            format!("{MARKER}{}", "x".repeat(6_000)),
        )
        .unwrap();
        let mut endpoint = Endpoint::start(vec![
            reported_usage(
                Reply::Tool("read_file", r#"{"path":"index.txt"}"#),
                6_950,
                50,
            ),
            summary_reply,
            Reply::Finished(FINAL),
        ])
        .await;
        let start = |url: &str| {
            let child = fixture
                .process(url, "serve")
                .arg("--stdio")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            crate::approvals::Stdio::from_child(child)
        };
        let mut capabilities = extension_initialize();
        for key in [WINDOW, LIFECYCLE] {
            capabilities["clientCapabilities"]["_meta"][key] = json!(1);
        }
        let mut owner = start(&endpoint.url);
        owner.request("initialize", capabilities.clone()).await;
        let created = owner
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let id = owner
            .send(
                "session/prompt",
                json!({"sessionId":session,"prompt":[{"type":"text","text":USER}]}),
            )
            .await;
        let first = endpoint.request().await;
        assert!(offers_tool(&first, "read_file"), "{first}");
        let summary = endpoint.request().await;
        assert!(
            summary["tools"].as_array().is_none_or(Vec::is_empty),
            "{summary}"
        );
        assert!(
            summary["messages"].to_string().contains(MARKER),
            "{summary}"
        );
        let following = endpoint.request().await;
        assert!(offers_tool(&following, "read_file"), "{following}");
        let messages = following["messages"].to_string();
        assert!(messages.contains(USER));
        assert_eq!(messages.contains(SUMMARY), installed);
        assert_eq!(messages.contains(MARKER), !installed);
        let mut events = Vec::new();
        let mut answered = false;
        while !answered
            || !events
                .iter()
                .any(|event: &Value| event["kind"] == "settled")
        {
            let frame = owner.read_frame().await;
            if frame["id"] == id {
                assert_eq!(frame["result"]["stopReason"], "end_turn", "{frame}");
                answered = true;
            }
            if let Some(event) = frame["params"]["_meta"].get(LIFECYCLE) {
                events.push(event.clone());
            }
        }
        assert_eq!(events.len(), 1, "{events:?}");
        assert_eq!(events[0]["status"], "succeeded");
        let turn = events[0]["turnId"].as_str().unwrap();
        owner.close().await;

        // Reopen the same turn, including original observations replaced only in
        // the provider request. The private summary is a display fact if installed.
        let mut reopened = start(&endpoint.url);
        reopened.request("initialize", capabilities).await;
        let mut load = json!({"sessionId":session,"cwd":fixture.primary,"mcpServers":[],"_meta":{WINDOW:{"kind":"attach"}}});
        let attached = reopened.request("session/load", load.clone()).await;
        assert!(attached.get("result").is_some(), "{attached}");
        load["_meta"][WINDOW] = json!({"kind":"read","requestId":"after-tool"});
        let id = reopened.send("session/load", load).await;
        let mut replay = Vec::new();
        loop {
            let frame = reopened.read_frame().await;
            if frame["id"] == id {
                let turns = frame["result"]["_meta"][WINDOW]["turns"]
                    .as_array()
                    .unwrap();
                assert_eq!(turns.len(), 1);
                assert_eq!(turns[0]["turnId"], turn);
                assert_eq!(turns[0]["contextWindowTokens"], 20_000);
                assert_eq!(
                    turns[0].get("compaction").cloned(),
                    installed.then(|| json!({"summary":SUMMARY,"automatic":true}))
                );
                break;
            }
            if frame["method"] == "session/update" {
                replay.push(frame["params"]["update"].clone());
            }
        }
        let transcript = serde_json::to_string(&replay).unwrap();
        assert!(
            transcript.contains(USER) && transcript.contains(FINAL),
            "{transcript}"
        );
        assert!(transcript.contains(MARKER), "{transcript}");
        assert!(!transcript.contains(SUMMARY), "{transcript}");
        assert_eq!(
            replay
                .iter()
                .filter(|item| item["sessionUpdate"] == "tool_call")
                .count(),
            1
        );
        reopened.close().await;
        endpoint.done().await;
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tokio::test]
async fn switching_models_estimates_the_new_context_instead_of_reusing_its_predecessors_usage() {
    const RECENT: &str = "Keep the new accession number.";
    const SUMMARY: &str = "Retain the original accession.";
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let original = format!("Earlier catalog notes {}", "a".repeat(8_000));
    limits(&state, 100_000, 90_000);
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("The previous entry is preserved."),
        reported_usage_answer("Understood.", 100, 5),
        Reply::Finished(SUMMARY),
        Reply::Finished("The new accession is ready."),
    ])
    .await;
    let mut larger = crate::model_change::start(&state, &endpoint.url, "large-model").await;
    let created = larger
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    for text in [original.as_str(), RECENT] {
        let completed = larger
            .request(
                "session/prompt",
                json!({"sessionId":session,"prompt":[{"type":"text","text":text}]}),
            )
            .await;
        assert_eq!(completed["result"]["stopReason"], "end_turn", "{completed}");
        assert_eq!(endpoint.request().await["model"], "large-model");
    }
    larger.close().await;

    limits(&state, 2_000, 1_000);
    let mut smaller = crate::model_change::start(&state, &endpoint.url, "small-model").await;
    let inspect = smaller.request("_co.grida/config/inspect", json!({})).await;
    let reload = smaller
        .request(
            "_co.grida/config/reload",
            json!({"expectedRevision":inspect["result"]["file_revision"]}),
        )
        .await;
    assert!(reload.get("result").is_some(), "{reload}");
    let loaded = smaller
        .request(
            "session/load",
            json!({"cwd":workspace.path(),"sessionId":session,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let next = smaller
        .request(
            "_co.grida/session/submit",
            prompt_request(session, "after-downshift", "Next"),
        )
        .await;
    assert!(next.get("result").is_some(), "{next}");
    // Under the previous measurement this is 106 tokens. The new model has
    // never measured this chat. The original content alone exceeds 2,000.
    let summary = endpoint.request().await;
    assert_eq!(summary["model"], "small-model", "{summary}");
    assert!(summary["messages"].to_string().contains(&original));
    assert!(!summary["messages"].to_string().contains(RECENT));
    let reply = endpoint.request().await;
    assert_eq!(reply["model"], "small-model", "{reply}");
    let messages = reply["messages"].to_string();
    assert!(messages.contains(SUMMARY) && messages.contains(RECENT));
    assert!(!messages.contains(&original));
    assert_eq!(
        reply["messages"].as_array().unwrap().last().unwrap()["content"],
        "Next"
    );
    smaller.close().await;
    endpoint.done().await;
}
