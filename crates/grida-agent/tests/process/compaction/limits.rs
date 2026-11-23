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
        limits(&fixture_config_home(&state), window, limit);
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
        limits(
            &fixture_config_home(&state),
            50_000,
            if compact { 40_000 } else { 100 },
        );
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
        limits(&fixture.profile.with_file_name("grida-home"), 20_000, 1_024);
        let archive = format!("{MARKER}{}", "x".repeat(6_000));
        std::fs::write(fixture.primary.join("index.txt"), &archive).unwrap();
        let mut endpoint = Endpoint::start(vec![
            reported_usage(Reply::Tool("read_file", r#"{"path":"index.txt"}"#), 900, 50),
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
        let source = summary["messages"].as_array().unwrap().last().unwrap();
        assert_eq!(source["role"], "user", "{summary}");
        let source = source["content"].as_str().unwrap();
        assert!(source.contains(USER), "Missing active request: {source}");
        let observation = |prefix: &str| -> Value {
            let evidence = source
                .lines()
                .find_map(|line| line.strip_prefix(prefix))
                .unwrap_or_else(|| panic!("Missing {prefix} in {source}"));
            serde_json::from_str(evidence).unwrap()
        };
        let call = observation("Earlier tool call (history only): ");
        let result = observation("Earlier tool result (history only): ");
        assert!(call["call"].is_string(), "{call}");
        assert_eq!(call["call"], result["call"]);
        assert_eq!(call["tool"], "read_file");
        assert_eq!(call["arguments"]["value"], json!({"path":"index.txt"}));
        assert_eq!(result["status"], "succeeded");
        assert_eq!(result["truncated"], false);
        assert_eq!(result["content"], json!([{"text":archive}]));
        let following = endpoint.request().await;
        assert!(offers_tool(&following, "read_file"), "{following}");
        let messages = following["messages"].to_string();
        assert_eq!(
            following["messages"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|message| message["role"] == "user" && message["content"] == USER)
                .count(),
            1,
            "{following}"
        );
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
    limits(&fixture_config_home(&state), 100_000, 90_000);
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

    limits(&fixture_config_home(&state), 2_000, 1_000);
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

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tokio::test]
async fn inline_compaction_items_keep_live_identity_through_turn_controls_and_reopen() {
    use crate::lifecycle::{prompt_request, task_basis};

    const WINDOW: &str = "co.grida/session/transcript-window";
    const ITEMS: &str = "co.grida/session/compaction-items";
    const ORDER: &str = "co.grida/session/activity-order";
    const LIFECYCLE: &str = "co.grida/session/lifecycle";
    const UPDATES: &str = "co.grida/session/updates";
    const QUESTIONS: &str = "co.grida/session/questions";
    const ANSWER: &str = "co.grida/session/answer-question";
    const FIRST: &str = "The first archive entry is 302.";
    const SECOND: &str = "The second archive entry is 504.";
    const FINAL: &str = "Both archive entries are verified.";

    #[derive(PartialEq, Eq)]
    enum Ending {
        Settle,
        Pause,
        AnswerQuestion,
    }

    for (second, status, ending) in [
        (Reply::Finished(SECOND), "succeeded", Ending::Settle),
        (Reply::Finished(SECOND), "succeeded", Ending::Pause),
        (Reply::Stop("length"), "failed", Ending::Pause),
        (Reply::Finished(SECOND), "succeeded", Ending::AnswerQuestion),
    ] {
        let fixture = crate::approvals::Fixture::new(false);
        limits(&fixture.profile.with_file_name("grida-home"), 20_000, 8_000);
        std::fs::write(
            fixture.primary.join("first.txt"),
            format!("Archive 302. {}", "x".repeat(6_000)),
        )
        .unwrap();
        std::fs::write(
            fixture.primary.join("second.txt"),
            format!("Archive 504. {}", "y".repeat(6_000)),
        )
        .unwrap();
        let (finish, held) = tokio::sync::oneshot::channel();
        let final_reply = if ending == Ending::Pause {
            Reply::Hold("Still working.")
        } else {
            Reply::Release(FINAL, held)
        };
        let mut replies = vec![
            reported_usage(
                Reply::Tool("read_file", r#"{"path":"first.txt"}"#),
                6_950,
                50,
            ),
            Reply::Finished(FIRST),
            reported_usage(
                Reply::Tool("read_file", r#"{"path":"second.txt"}"#),
                6_950,
                50,
            ),
            second,
        ];
        if ending == Ending::AnswerQuestion {
            replies.push(Reply::Question("question"));
        }
        replies.push(final_reply);
        let mut endpoint = Endpoint::start(replies).await;
        let url = endpoint.url.clone();
        let start = || {
            let child = fixture
                .process(&url, "serve")
                .arg("--stdio")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            crate::approvals::Stdio::from_child(child)
        };
        let mut capabilities = extension_initialize();
        for key in [WINDOW, ITEMS, ORDER, LIFECYCLE, UPDATES, QUESTIONS, ANSWER] {
            capabilities["clientCapabilities"]["_meta"][key] = json!(1);
        }
        let mut owner = start();
        let initialized = owner.request("initialize", capabilities.clone()).await;
        assert!(initialized.get("result").is_some(), "{initialized}");
        let created = owner
            .request(
                "session/new",
                json!({"cwd":fixture.primary,"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let submit = owner
            .send(
                "_co.grida/session/submit",
                prompt_request(session, "archives", "Check the two archive entries."),
            )
            .await;
        let mut accepted = None;
        let mut events = Vec::new();
        let mut tool_order = Vec::new();
        while accepted.is_none() || events.len() < 4 {
            let frame = owner.read_frame().await;
            if frame["id"] == submit {
                assert!(frame["error"].is_null(), "{frame}");
                accepted = frame["result"]["turnId"].as_str().map(str::to_owned);
                assert!(accepted.is_some(), "{frame}");
            }
            let params = &frame["params"];
            let meta = &params["_meta"];
            assert!(
                meta.get(LIFECYCLE).is_none(),
                "inline items cannot settle the turn: {frame}"
            );
            if params["update"]["sessionUpdate"] == "tool_call"
                && let Some(order) = meta[ORDER]["activityOrder"].as_u64()
                && tool_order.last() != Some(&order)
            {
                tool_order.push(order);
            }
            if let Some(event) = meta.get(ITEMS) {
                events.push(event.clone());
            }
        }
        let turn = accepted.unwrap();
        let items: Vec<_> = events
            .iter()
            .map(|event| {
                assert_eq!(event["turnId"], turn);
                let item = &event["item"];
                assert_eq!(item["automatic"], true);
                item
            })
            .collect();
        assert_eq!(items[0]["status"], "running");
        assert_eq!(items[1]["status"], "succeeded");
        assert_eq!(items[1]["summary"], FIRST);
        assert_eq!(items[2]["status"], "running");
        assert_eq!(items[3]["status"], status);
        if status == "succeeded" {
            assert_eq!(items[3]["summary"], SECOND);
        } else {
            assert!(items[3].get("summary").is_none());
        }
        for (start, end) in [(items[0], items[1]), (items[2], items[3])] {
            assert_eq!(start["id"], end["id"]);
            assert_eq!(start["activityOrder"], end["activityOrder"]);
            assert!(
                end["finishedAtMs"].as_u64().unwrap() >= start["startedAtMs"].as_u64().unwrap()
            );
        }
        assert_ne!(items[0]["id"], items[2]["id"]);
        let first = items[0]["activityOrder"].as_u64().unwrap();
        let second = items[2]["activityOrder"].as_u64().unwrap();
        assert_eq!(tool_order.len(), 2, "{tool_order:?}");
        assert!(tool_order[0] < first && first < tool_order[1] && tool_order[1] < second);

        // Both completion records were visible before the foreground reply.
        for _ in 0..5 {
            endpoint.request().await;
        }
        let page_request = || {
            json!({
                "sessionId":session,"cwd":fixture.primary,"mcpServers":[],
                "_meta":{WINDOW:{"kind":"read","requestId":"compaction-replay"}}
            })
        };
        let turn_record = |page: Value| {
            page["result"]["_meta"][WINDOW]["turns"]
                .as_array()
                .and_then(|turns| turns.iter().find(|record| record["turnId"] == turn))
                .cloned()
                .unwrap_or_else(|| panic!("{page}"))
        };
        let settled_record = if ending == Ending::Pause {
            let running = owner
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            assert_eq!(running["result"]["current"]["turnId"], turn, "{running}");
            assert_eq!(
                running["result"]["current"]["disposition"], "running",
                "{running}"
            );
            let paused = owner
                .request(
                    "_co.grida/session/pause",
                    task_basis(&running["result"], session, "pause-after-compaction"),
                )
                .await;
            assert_eq!(paused["result"]["turnId"], turn, "{paused}");
            None
        } else {
            if ending == Ending::AnswerQuestion {
                let suspended = timeout(WAIT, async {
                    loop {
                        let snapshot = owner
                            .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                            .await;
                        if snapshot["result"]["current"]["disposition"] == "suspended" {
                            return snapshot;
                        }
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                })
                .await
                .unwrap();
                assert_eq!(
                    suspended["result"]["current"]["turnId"], turn,
                    "{suspended}"
                );
                let pending = owner
                    .request(
                        "_co.grida/session/questions",
                        json!({"sessionId":session,"turnId":turn}),
                    )
                    .await;
                let pending = &pending["result"];
                assert_eq!(
                    pending["questions"][0]["style"], "answer_dependent",
                    "{pending}"
                );
                let answered = owner
                    .request(
                        "_co.grida/session/answer-question",
                        json!({
                            "sessionId":session,
                            "turnId":turn,
                            "requestId":"answer-after-compaction",
                            "expectedSessionRevision":suspended["result"]["sessionRevision"],
                            "expectedControlRevision":pending["controlRevision"],
                            "expectedHistoryPosition":pending["historyPosition"],
                            "waitId":pending["questions"][0]["waitId"],
                            "answer":{"kind":"text","text":"Print"}
                        }),
                    )
                    .await;
                assert_eq!(answered["result"]["turnId"], turn, "{answered}");
                endpoint.request().await;
            }
            finish.send(()).unwrap();
            let mut final_order = None;
            loop {
                let frame = owner.read_frame().await;
                let params = &frame["params"];
                let meta = &params["_meta"];
                assert!(meta.get(ITEMS).is_none(), "{frame}");
                if params["update"]["content"]["text"] == FINAL {
                    let order = meta[UPDATES]["activityOrder"]
                        .as_u64()
                        .unwrap_or_else(|| panic!("{frame}"));
                    assert!(order > second, "{frame}");
                    final_order = Some(order);
                }
                if let Some(event) = meta.get(LIFECYCLE) {
                    assert_eq!(event["kind"], "settled", "{frame}");
                    assert_eq!(event["turnId"], turn, "{frame}");
                    assert_eq!(event["status"], "succeeded", "{frame}");
                    break;
                }
            }
            let record = turn_record(owner.request("session/load", page_request()).await);
            assert_eq!(record["status"], "succeeded", "{record}");
            Some((record, final_order.expect("ordered live final answer")))
        };
        owner.close().await;

        let mut reopened = start();
        reopened.request("initialize", capabilities).await;
        let load = json!({
            "sessionId":session,"cwd":fixture.primary,"mcpServers":[],
            "_meta":{WINDOW:{"kind":"attach"}}
        });
        let attached = reopened.request("session/load", load).await;
        assert!(attached.get("result").is_some(), "{attached}");
        let request = reopened.send("session/load", page_request()).await;
        let mut replayed_final = None;
        let record = loop {
            let frame = reopened.read_frame().await;
            if frame["id"] == request {
                break turn_record(frame);
            }
            let params = &frame["params"];
            if params["update"]["content"]["text"] == FINAL {
                replayed_final = params["_meta"][WINDOW]["activityOrder"].as_u64();
            }
        };
        if let Some((settled, final_order)) = settled_record {
            assert_eq!(record, settled);
            assert_eq!(replayed_final, Some(final_order));
        }
        let replayed = record["compactions"]
            .as_array()
            .unwrap_or_else(|| panic!("{record}"));
        assert_eq!(replayed.len(), 2, "{replayed:?}");
        let latest = if status == "succeeded" { SECOND } else { FIRST };
        assert_eq!(record["compaction"]["summary"], latest, "{record}");
        for (item, observed) in replayed.iter().zip([items[1], items[3]]) {
            assert!(item.get("summary").is_none(), "{item}");
            for field in [
                "id",
                "status",
                "activityOrder",
                "startedAtMs",
                "finishedAtMs",
            ] {
                assert_eq!(item[field], observed[field], "{item}");
            }
        }
        reopened.close().await;
        endpoint.done().await;
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tokio::test]
async fn resuming_interrupted_inline_compaction_keeps_the_original_activity() {
    const WINDOW: &str = "co.grida/session/transcript-window";
    const ITEMS: &str = "co.grida/session/compaction-items";
    const LIFECYCLE: &str = "co.grida/session/lifecycle";
    const ARCHIVE: &str = "Archive entry 302.";
    let fixture = crate::approvals::Fixture::new(false);
    limits(&fixture.profile.with_file_name("grida-home"), 20_000, 8_000);
    std::fs::write(
        fixture.primary.join("index.txt"),
        format!("{ARCHIVE} {}", "x".repeat(6_000)),
    )
    .unwrap();
    let mut endpoint = Endpoint::start(vec![
        reported_usage(
            Reply::Tool("read_file", r#"{"path":"index.txt"}"#),
            6_950,
            50,
        ),
        Reply::Hold("Unfinished summary."),
        Reply::Finished("The archive entry is verified."),
    ])
    .await;
    let child = fixture
        .process(&endpoint.url, "serve")
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut owner = crate::approvals::Stdio::from_child(child);
    let mut capabilities = extension_initialize();
    for key in [WINDOW, ITEMS, LIFECYCLE] {
        capabilities["clientCapabilities"]["_meta"][key] = json!(1);
    }
    let initialized = owner.request("initialize", capabilities).await;
    assert!(initialized.get("result").is_some(), "{initialized}");
    let created = owner
        .request(
            "session/new",
            json!({"cwd":fixture.primary,"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let submit = owner
        .send(
            "_co.grida/session/submit",
            prompt_request(session, "archives", "Check the archive entry."),
        )
        .await;
    let mut turn = None;
    let mut started = None;
    while turn.is_none() || started.is_none() {
        let frame = owner.read_frame().await;
        if frame["id"] == submit {
            turn = Some(frame["result"]["turnId"].as_str().unwrap().to_owned());
        }
        if let Some(event) = frame["params"]["_meta"].get(ITEMS) {
            assert_eq!(event["item"]["status"], "running", "{event}");
            started = Some(event.clone());
        }
    }
    let turn = turn.unwrap();
    let started = started.unwrap();
    assert_eq!(started["turnId"], turn, "{started}");
    let item = &started["item"]["id"];
    endpoint.request().await;
    let summary = endpoint.request().await;
    assert!(!offers_tool(&summary, "read_file"), "{summary}");
    let running = owner
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    let paused = owner
        .request(
            "_co.grida/session/pause",
            task_basis(&running["result"], session, "pause-inline-summary"),
        )
        .await;
    assert_eq!(paused["result"]["turnId"], turn, "{paused}");
    let snapshot = timeout(WAIT, async {
        loop {
            let snapshot = owner
                .request("_co.grida/session/snapshot", json!({"sessionId":session}))
                .await;
            let current = &snapshot["result"]["current"];
            if current["disposition"] == "suspended" {
                return snapshot["result"].clone();
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let resume = owner
        .send(
            "_co.grida/session/resume",
            json!({
                "task":task_basis(&snapshot,session,"resume-inline-summary"),
                "expectedEpoch":snapshot["current"]["epoch"],
                "expectedJournalPosition":snapshot["current"]["journalPosition"],
            }),
        )
        .await;
    let mut accepted = false;
    let mut settled = false;
    while !accepted || !settled {
        let frame = owner.read_frame().await;
        if frame["id"] == resume {
            assert_eq!(frame["result"]["turn"]["turnId"], turn, "{frame}");
            accepted = true;
        }
        let meta = &frame["params"]["_meta"];
        if let Some(event) = meta.get(ITEMS) {
            assert_eq!(&event["item"]["id"], item, "{event}");
            assert_eq!(event["item"]["status"], "failed", "{event}");
        }
        if let Some(event) = meta.get(LIFECYCLE) {
            assert_eq!(event["kind"], "settled", "{event}");
            assert_eq!(event["turnId"], turn, "{event}");
            assert_eq!(event["status"], "succeeded", "{event}");
            settled = true;
        }
    }
    let foreground = endpoint.request().await;
    assert!(offers_tool(&foreground, "read_file"), "{foreground}");
    assert!(foreground["messages"].to_string().contains(ARCHIVE));

    let page = owner
        .request(
            "session/load",
            json!({
                "sessionId":session, "cwd":fixture.primary,"mcpServers":[],
                "_meta":{WINDOW:{"kind":"read","requestId":"resumed-compaction"}},
            }),
        )
        .await;
    let turns = page["result"]["_meta"][WINDOW]["turns"].as_array().unwrap();
    let record = turns
        .iter()
        .find(|record| record["turnId"] == turn)
        .unwrap();
    let items = record["compactions"].as_array().unwrap();
    assert_eq!(items.len(), 1, "{items:?}");
    assert_eq!(&items[0]["id"], item, "{items:?}");
    assert_eq!(items[0]["status"], "failed", "{items:?}");
    assert!(record.get("compaction").is_none(), "{record}");
    owner.close().await;
    endpoint.done().await;
}
