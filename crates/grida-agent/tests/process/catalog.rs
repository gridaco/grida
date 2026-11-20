use super::lifecycle::{
    prompt_request, session_snapshot, task_basis, terminate_shared_server, wait_for_snapshot,
};
use super::*;

pub(super) async fn catalog_client(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut offered = extension_initialize();
    offered["clientCapabilities"]["_meta"]["co.grida/session/catalog-query"] = 1.into();
    offered["clientCapabilities"]["_meta"]["co.grida/session/organize"] = 1.into();
    offered["clientCapabilities"]["_meta"]["co.grida/session/read-state"] = 1.into();
    let init = ws_rpc(&mut socket, 1, "initialize", offered).await;
    assert_eq!(
        init["result"]["agentCapabilities"]["_meta"]["co.grida/session/catalog-query"],
        1
    );
    assert_eq!(
        init["result"]["agentCapabilities"]["sessionCapabilities"]["list"],
        json!({})
    );
    socket
}

async fn new_session(socket: &mut SharedSocket, id: u64, cwd: &Path) -> String {
    let reply = ws_rpc(
        socket,
        id,
        "session/new",
        json!({"cwd":cwd,"mcpServers":[]}),
    )
    .await;
    reply["result"]["sessionId"].as_str().unwrap().to_owned()
}

fn ids(result: &Value) -> Vec<&str> {
    result["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["sessionId"].as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn only_the_displayed_reply_can_clear_shared_unread_state() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("One"), Reply::Finished("Two")]).await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut writer = catalog_client(&url).await;
    let mut observer = catalog_client(&url).await;
    let chat = new_session(&mut writer, 2, workspace.path()).await;
    let query = json!({"cwd":workspace.path()});
    let prompt = json!({"sessionId":chat,"prompt":[{"type":"text","text":"Answer."}]});
    let mut versions = Vec::new();
    for n in 0..2 {
        let result = ws_rpc(&mut writer, 3 + n, "session/prompt", prompt.clone()).await;
        assert_eq!(result["result"]["stopReason"], "end_turn", "{result}");
        endpoint.request().await;
        let list = ws_rpc(&mut observer, 2 + n, "session/list", query.clone()).await;
        let meta = &list["result"]["sessions"][0]["_meta"];
        let read = &meta["co.grida/readState"];
        assert_eq!(read["unread"], true);
        assert!(read["replyId"].is_string());
        versions.push((read.clone(), meta["co.grida/lastMessageAtMs"].clone()));
    }
    let (a, _) = &versions[0];
    let (b, recent) = &versions[1];
    assert_ne!(a["replyId"], b["replyId"]);
    let method = "_co.grida/session/read-state";
    let ack = |state: &Value| {
        json!({"cwd":workspace.path(),"sessionId":chat,
        "action":"acknowledge","revision":state["revision"],"replyId":state["replyId"]})
    };
    let stale = ws_rpc(&mut observer, 4, method, ack(a)).await;
    assert_eq!(stale["result"], *b);
    let seen = ws_rpc(&mut observer, 5, method, ack(b)).await;
    assert_eq!(seen["result"]["unread"], false, "{seen}");
    let manual = ws_rpc(
        &mut writer,
        5,
        method,
        json!({
            "cwd":workspace.path(),"sessionId":chat,"action":"markUnread",
        }),
    )
    .await;
    assert_eq!(manual["result"]["unread"], true, "{manual}");
    let attached = ws_rpc(
        &mut writer,
        6,
        "_co.grida/session/catalog-entry",
        json!({"sessionId":chat}),
    )
    .await;
    assert_eq!(attached["result"]["readState"], manual["result"]);
    let duplicate = ws_rpc(&mut observer, 6, method, ack(b)).await;
    assert_eq!(duplicate["result"], manual["result"]);
    let foreign = TempDir::new().unwrap();
    let mut wrong = ack(&manual["result"]);
    wrong["cwd"] = json!(foreign.path());
    let rejected = ws_rpc(&mut observer, 7, method, wrong).await;
    assert!(rejected.get("error").is_some(), "{rejected}");
    let page = ws_rpc(&mut observer, 8, "session/list", query).await;
    assert_eq!(
        page["result"]["sessions"][0]["_meta"]["co.grida/readState"],
        manual["result"]
    );
    assert_eq!(
        page["result"]["sessions"][0]["_meta"]["co.grida/lastMessageAtMs"],
        *recent
    );
    drop(observer);
    drop(writer);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn workspace_catalog_reports_open_user_input_during_work_and_clears_it_at_completion() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let foreign = TempDir::new().unwrap();
    let (release, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question_async"),
        Reply::Release("Independent work is finished.", held),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut writer = super::questions::question_socket(&url, true).await;
    let mut observer = catalog_client(&url).await;
    let chat = new_session(&mut writer, 2, workspace.path()).await;
    let started = ws_rpc(
        &mut writer,
        3,
        "_co.grida/session/submit",
        prompt_request(&chat, "catalog-question", "Prepare the document."),
    )
    .await;
    assert!(started["result"]["turnId"].is_string(), "{started}");
    endpoint.request().await;
    endpoint.request().await;
    let page = ws_rpc(
        &mut observer,
        2,
        "session/list",
        json!({"cwd":workspace.path()}),
    )
    .await;
    assert_eq!(
        page["result"]["_meta"]["co.grida/runningSessionIds"],
        json!([&chat])
    );
    assert_eq!(
        page["result"]["_meta"]["co.grida/inputNeededSessionIds"],
        json!([&chat])
    );
    assert!(!page.to_string().contains("Which edition?"));
    let other = ws_rpc(
        &mut observer,
        3,
        "session/list",
        json!({"cwd":foreign.path()}),
    )
    .await;
    assert_eq!(
        other["result"]["_meta"]["co.grida/inputNeededSessionIds"],
        json!([])
    );
    release.send(()).unwrap();
    wait_for_snapshot(&mut writer, &chat, |snapshot| {
        snapshot["latest"]["status"] == "succeeded"
    })
    .await;
    let page = ws_rpc(
        &mut observer,
        4,
        "session/list",
        json!({"cwd":workspace.path()}),
    )
    .await;
    assert_eq!(
        page["result"]["_meta"]["co.grida/runningSessionIds"],
        json!([])
    );
    assert_eq!(
        page["result"]["_meta"]["co.grida/inputNeededSessionIds"],
        json!([])
    );
    drop(writer);
    drop(observer);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn standard_acp_catalog_discovers_saved_workspace_sessions_without_loading_them() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let a = TempDir::new().unwrap();
    let b = TempDir::new().unwrap();
    let alias = temporary.path().join("workspace-alias");
    std::os::unix::fs::symlink(a.path(), &alias).unwrap();
    let (release, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![Reply::Release("Retained answer", held)]).await;
    let (child, url) = shared_server(&state, &endpoint.url).await;
    let mut client = catalog_client(&url).await;
    let mut a_sessions = Vec::new();
    for n in 2..36 {
        a_sessions.push(new_session(&mut client, n, a.path()).await);
    }
    let b_id = new_session(&mut client, 36, b.path()).await;
    let prompt = ws_rpc(
        &mut client,
        37,
        "_co.grida/session/submit",
        prompt_request(&a_sessions[0], "work", "PRIVATE_TRANSCRIPT_MARKER"),
    )
    .await;
    assert!(prompt["result"]["turnId"].is_string(), "{prompt}");
    endpoint.request().await;
    let mut observer = catalog_client(&url).await;
    let first = ws_rpc(&mut observer, 2, "session/list", json!({"cwd":a.path()})).await;
    assert_eq!(
        first["result"]["_meta"]["co.grida/runningSessionIds"],
        json!([])
    );
    let tail = json!({"cwd":a.path(),"cursor":first["result"]["nextCursor"].as_str().unwrap()});
    let running = ws_rpc(&mut observer, 3, "session/list", tail.clone()).await;
    assert_eq!(
        running["result"]["_meta"]["co.grida/runningSessionIds"],
        json!([a_sessions[0]])
    );
    assert!(!running.to_string().contains("PRIVATE_TRANSCRIPT_MARKER"));
    let recent_request = json!({"_meta":{"co.grida/catalogOrder":"messageActivity"}});
    let recent = ws_rpc(&mut observer, 50, "session/list", recent_request.clone()).await;
    assert_eq!(ids(&recent["result"])[0], a_sessions[0]);
    assert_eq!(
        recent["result"]["sessions"][0]["cwd"],
        json!(a.path().canonicalize().unwrap())
    );
    let admitted_at = recent["result"]["sessions"][0]["_meta"]["co.grida/lastMessageAtMs"]
        .as_u64()
        .unwrap();
    let mut filtered = recent_request.clone();
    filtered["cwd"] = json!(b.path());
    let only_b = ws_rpc(&mut observer, 51, "session/list", filtered.clone()).await;
    assert_eq!(ids(&only_b["result"]), [b_id.as_str()]);
    filtered["cursor"] = recent["result"]["nextCursor"].clone();
    let cross_scope = ws_rpc(&mut observer, 52, "session/list", filtered).await;
    assert_eq!(cross_scope["error"]["data"], "invalid_session_cursor");
    let wrong_order = ws_rpc(
        &mut observer,
        53,
        "session/list",
        json!({"cursor":recent["result"]["nextCursor"]}),
    )
    .await;
    assert_eq!(wrong_order["error"]["data"], "invalid_session_cursor");
    let foreign = ws_rpc(&mut observer, 4, "session/list", json!({"cwd":b.path()})).await;
    assert_eq!(
        foreign["result"]["_meta"]["co.grida/runningSessionIds"],
        json!([])
    );
    let unattached = ws_rpc(
        &mut observer,
        5,
        "_co.grida/session/snapshot",
        json!({"sessionId":a_sessions[0]}),
    )
    .await;
    assert_eq!(unattached["error"]["data"], "session_setup_required");
    release.send(()).unwrap();
    let before = wait_for_snapshot(&mut client, &a_sessions[0], |view| {
        view["latest"]["status"] == "succeeded" && view["current"].is_null()
    })
    .await;
    let settled = ws_rpc(&mut observer, 6, "session/list", tail).await;
    assert_eq!(
        settled["result"]["_meta"]["co.grida/runningSessionIds"],
        json!([])
    );
    let final_recent = ws_rpc(&mut observer, 54, "session/list", recent_request.clone()).await;
    let reply_at = final_recent["result"]["sessions"][0]["_meta"]["co.grida/lastMessageAtMs"]
        .as_u64()
        .unwrap();
    assert!(reply_at > admitted_at);
    drop(observer);
    terminate_shared_server(child).await;
    let endpoint_url = endpoint.url.clone();
    endpoint.done().await;

    let absent = temporary.path().join("unopened-store");
    let missing = executable()
        .args(["chat-catalog", "--state-dir"])
        .arg(&absent)
        .output()
        .await
        .unwrap();
    assert!(!missing.status.success());
    assert!(!absent.exists(), "discovery created a new store");
    let cold = executable()
        .args(["chat-catalog", "--state-dir"])
        .arg(&state)
        .args(["--order", "message-activity"])
        .output()
        .await
        .unwrap();
    assert!(
        cold.status.success(),
        "{}",
        String::from_utf8_lossy(&cold.stderr)
    );
    assert_eq!(records(&cold.stdout)[0], final_recent["result"]);

    let (child, url) = shared_server(&state, &endpoint_url).await;
    let mut client = catalog_client(&url).await;
    let unscoped = ws_rpc(&mut client, 2, "session/list", json!({})).await;
    assert_eq!(ids(&unscoped["result"])[0], b_id);
    let reopened = ws_rpc(&mut client, 51, "session/list", recent_request).await;
    assert_eq!(reopened["result"], final_recent["result"]);
    let relative = ws_rpc(&mut client, 3, "session/list", json!({"cwd":"workspace"})).await;
    assert_eq!(relative["error"]["code"], -32602);
    let first = ws_rpc(&mut client, 4, "session/list", json!({"cwd":alias})).await;
    let page = &first["result"];
    let expected = a_sessions[2..]
        .iter()
        .rev()
        .map(String::as_str)
        .collect::<Vec<_>>();
    assert_eq!(ids(page), expected);
    let expected_cwd = a.path().canonicalize().unwrap();
    let empty_metadata = json!({"co.grida/readState": {"unread":false,"revision":0,"replyId":null}, "co.grida/running":false, "co.grida/inputNeeded":false});
    assert!(page["sessions"].as_array().unwrap().iter().all(|row| {
        row == &json!({
            "sessionId": row["sessionId"], "cwd": expected_cwd,
            "_meta": empty_metadata,
        })
    }));
    assert!(!first.to_string().contains("PRIVATE_TRANSCRIPT_MARKER"));
    let cursor = page["nextCursor"].as_str().unwrap();
    let cross_scope = ws_rpc(
        &mut client,
        5,
        "session/list",
        json!({"cwd":b.path(),"cursor":cursor}),
    )
    .await;
    assert_eq!(cross_scope["error"]["code"], -32602);
    let malformed = ws_rpc(
        &mut client,
        6,
        "session/list",
        json!({"cwd":a.path(),"cursor":"malformed"}),
    )
    .await;
    assert_eq!(malformed["error"]["code"], -32602);
    let second = ws_rpc(
        &mut client,
        7,
        "session/list",
        json!({"cwd":a.path(),"cursor":cursor}),
    )
    .await;
    assert_eq!(
        ids(&second["result"]),
        [a_sessions[1].as_str(), a_sessions[0].as_str()]
    );
    assert!(second["result"]["nextCursor"].is_null());
    assert_eq!(second["result"]["sessions"][0]["_meta"], empty_metadata);
    assert!(
        second["result"]["sessions"][1]["_meta"]["co.grida/lastActivityAtMs"]
            .as_u64()
            .is_some_and(|timestamp| timestamp > 0)
    );
    let other = ws_rpc(&mut client, 8, "session/list", json!({"cwd":b.path()})).await;
    assert_eq!(ids(&other["result"]), [b_id.as_str()]);
    let unattached = ws_rpc(
        &mut client,
        9,
        "_co.grida/session/snapshot",
        json!({"sessionId":a_sessions[0]}),
    )
    .await;
    assert_eq!(unattached["error"]["data"], "session_setup_required");
    let loaded = ws_rpc(
        &mut client,
        10,
        "session/load",
        json!({
            "sessionId":a_sessions[0],"cwd":a.path(),"mcpServers":[],
        }),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    assert_eq!(session_snapshot(&mut client, &a_sessions[0]).await, before);
    let history = ws_rpc(
        &mut client,
        11,
        "_co.grida/session/history",
        json!({"sessionId":a_sessions[0]}),
    )
    .await;
    let fork = ws_rpc(
        &mut client,
        12,
        "_co.grida/session/fork",
        json!({
            "sessionId":a_sessions[0],"requestId":"catalog-fork",
            "expectedHistory":history["result"]["basis"],
            "anchor":history["result"]["messages"][0]["anchor"],
        }),
    )
    .await;
    let fork = fork["result"]["sessionId"].as_str().unwrap();
    let with_fork = ws_rpc(&mut client, 13, "session/list", json!({"cwd":a.path()})).await;
    assert_eq!(ids(&with_fork["result"])[0], fork);
    assert_eq!(with_fork["result"]["sessions"][0]["_meta"], empty_metadata);
    terminate_shared_server(child).await;
}

#[tokio::test]
async fn pinned_workspace_catalog_does_not_expose_other_saved_chats() {
    let fixture = super::approvals::Fixture::new(false);
    let endpoint = "http://127.0.0.1:1/v1";
    let (host, url) = shared_server(&fixture.state, endpoint).await;
    let mut client = catalog_client(&url).await;
    let own = new_session(&mut client, 2, &fixture.primary).await;
    new_session(&mut client, 3, &fixture.extra).await;
    drop(client);
    terminate_shared_server(host).await;

    let (host, url) = shared_server_with_profile(
        &fixture.state,
        endpoint,
        "catalog-fixture",
        Some(&fixture.profile),
    )
    .await;
    let mut client = catalog_client(&url).await;
    let implicit = ws_rpc(
        &mut client,
        2,
        "session/list",
        json!({"_meta":{"co.grida/catalogOrder":"messageActivity"}}),
    )
    .await;
    assert_eq!(ids(&implicit["result"]), [own.as_str()]);
    let foreign = ws_rpc(&mut client, 3, "session/list", json!({"cwd":fixture.extra})).await;
    assert_eq!(foreign["error"]["data"], "session_catalog_scope_mismatch");
    drop(client);
    terminate_shared_server(host).await;
}

async fn organizer(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut request = extension_initialize();
    request["clientCapabilities"]["_meta"]["co.grida/session/organize"] = 1.into();
    request["clientCapabilities"]["_meta"]["co.grida/session/initial-title"] = 1.into();
    request["clientCapabilities"]["_meta"]["co.grida/settings/archive-catalog"] = 1.into();
    let init = ws_rpc(&mut socket, 1, "initialize", request).await;
    assert_eq!(
        init["result"]["agentCapabilities"]["_meta"]["co.grida/session/organize"],
        1
    );
    socket
}

#[tokio::test]
async fn archived_chat_keeps_its_turn_and_reopens_with_the_same_title() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let other = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold("Work in progress.")]).await;
    let (first, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = organizer(&url).await;
    let session = new_session(&mut socket, 2, workspace.path()).await;
    let fresh = ws_rpc(
        &mut socket,
        20,
        "_co.grida/session/catalog-entry",
        json!({"sessionId":session}),
    )
    .await;
    assert!(fresh["result"].get("lastActivityAtMs").is_none());
    let forged = ws_rpc(
        &mut socket,
        21,
        "_co.grida/session/organize",
        json!({
            "sessionId":session,"revision":0,"title":null,"archived":false,
            "lastActivityAtMs":1,
        }),
    )
    .await;
    assert_eq!(forged["error"]["code"], -32602);
    let accepted = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        prompt_request(&session, "one-input", "Start the work."),
    )
    .await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    endpoint.request().await;
    let running = ws_rpc(
        &mut socket,
        22,
        "session/list",
        json!({"cwd":workspace.path()}),
    )
    .await;
    let started = running["result"]["sessions"][0]["_meta"]["co.grida/lastActivityAtMs"]
        .as_u64()
        .unwrap();
    assert!(started > 0);
    let incomplete = ws_rpc(
        &mut socket,
        31,
        "_co.grida/session/organize",
        json!({"sessionId":session,"revision":0,"archived":true}),
    )
    .await;
    assert_eq!(incomplete["error"]["code"], -32602);
    let draft =
        json!({"sessionId":session,"revision":0,"title":"  Reusable work  ","archived":true});
    let archived = ws_rpc(&mut socket, 4, "_co.grida/session/organize", draft.clone()).await;
    assert_eq!(
        archived["result"],
        json!({"sessionId":session,"revision":1,"title":"Reusable work","archived":true})
    );
    let retry = ws_rpc(&mut socket, 5, "_co.grida/session/organize", draft).await;
    assert_eq!(retry["result"], archived["result"]);
    let during = ws_rpc(
        &mut socket,
        24,
        "_co.grida/session/catalog-entry",
        json!({"sessionId":session}),
    )
    .await;
    assert_eq!(during["result"]["lastActivityAtMs"], started);
    let stale = ws_rpc(
        &mut socket,
        6,
        "_co.grida/session/organize",
        json!({"sessionId":session,"revision":0,"title":"Stale edit","archived":false}),
    )
    .await;
    assert_eq!(stale["error"]["data"], "session_catalog_revision_changed");
    let snapshot = session_snapshot(&mut socket, &session).await;
    assert_eq!(snapshot["current"]["turnId"], turn);
    let active = ws_rpc(
        &mut socket,
        7,
        "session/list",
        json!({"cwd":workspace.path()}),
    )
    .await;
    assert!(ids(&active["result"]).is_empty());
    let other = ws_rpc(
        &mut socket,
        8,
        "_co.grida/session/list-archived",
        json!({"cwd":other.path()}),
    )
    .await;
    assert!(ids(&other["result"]).is_empty());
    let stop = ws_rpc(
        &mut socket,
        9,
        "_co.grida/session/stop",
        task_basis(&snapshot, &session, "stop-work"),
    )
    .await;
    assert!(stop.get("error").is_none(), "{stop}");
    wait_for_snapshot(&mut socket, &session, |snapshot| {
        snapshot["current"].is_null() && snapshot["latest"]["turnId"] == turn
    })
    .await;
    let settled = ws_rpc(
        &mut socket,
        23,
        "_co.grida/session/catalog-entry",
        json!({"sessionId":session}),
    )
    .await;
    let settled_at = settled["result"]["lastActivityAtMs"].as_u64().unwrap();
    assert!(settled_at >= started);
    let page = ws_rpc(
        &mut socket,
        25,
        "_co.grida/settings/archive-catalog",
        json!({"cwd":workspace.path()}),
    )
    .await;
    assert_eq!(
        page["result"],
        json!({"entries":[{"sessionId":session,"title":"Reusable work","revision":1,"lastActivityAtMs":settled_at}],"nextCursor":null})
    );
    drop(socket);
    terminate_shared_server(first).await;

    let detached = Command::new(env!("CARGO_BIN_EXE_grida-agent"))
        .args(["archive-catalog", "--state-dir"])
        .arg(&state)
        .arg("--cwd")
        .arg(workspace.path())
        .output()
        .await
        .unwrap();
    assert!(detached.status.success(), "{detached:?}");
    let detached: Value = serde_json::from_slice(&detached.stdout).unwrap();
    assert_eq!(detached, page["result"]);

    let (second, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = organizer(&url).await;
    let list = ws_rpc(
        &mut socket,
        2,
        "_co.grida/session/list-archived",
        json!({"cwd":workspace.path()}),
    )
    .await;
    assert_eq!(ids(&list["result"]), [session.as_str()]);
    assert_eq!(list["result"]["sessions"][0]["title"], "Reusable work");
    let message_time = list["result"]["sessions"][0]["_meta"]["co.grida/lastMessageAtMs"]
        .as_u64()
        .unwrap();
    assert_eq!(
        list["result"]["sessions"][0]["_meta"]["co.grida/lastActivityAtMs"],
        settled_at
    );
    let detached = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/catalog-entry",
        json!({"sessionId":session}),
    )
    .await;
    assert_eq!(detached["error"]["data"], "session_setup_required");
    let loaded = ws_rpc(
        &mut socket,
        4,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let saved = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/catalog-entry",
        json!({"sessionId":session}),
    )
    .await;
    assert_eq!(saved["result"], settled["result"]);
    let restored = ws_rpc(
        &mut socket,
        6,
        "_co.grida/session/organize",
        json!({"sessionId":session,"revision":1,"title":"Reusable work","archived":false}),
    )
    .await;
    assert_eq!(restored["result"]["revision"], 2);
    assert_eq!(restored["result"]["archived"], false);
    assert!(restored["result"].get("lastActivityAtMs").is_none());
    let active = ws_rpc(
        &mut socket,
        7,
        "session/list",
        json!({"cwd":workspace.path()}),
    )
    .await;
    assert_eq!(ids(&active["result"]), [session.as_str()]);
    assert_eq!(active["result"]["sessions"][0]["title"], "Reusable work");
    assert_eq!(
        active["result"]["sessions"][0]["_meta"]["co.grida/lastMessageAtMs"],
        message_time
    );
    assert_eq!(
        active["result"]["sessions"][0]["_meta"]["co.grida/lastActivityAtMs"],
        settled_at
    );
    assert_eq!(
        session_snapshot(&mut socket, &session).await["latest"]["turnId"],
        turn
    );
    endpoint.done().await;
    terminate_shared_server(second).await;
}

async fn title_server(state: &Path, endpoint: &Endpoint) -> (Child, String) {
    let mut command = executable();
    command
        .args([
            "serve",
            "--listen",
            "ws://127.0.0.1:0/acp",
            "--server-token-env",
            "GRIDA_AGENT_FIXTURE_SERVER_TOKEN",
            "--chat-titles",
        ])
        .env("GRIDA_AGENT_FIXTURE_SERVER_TOKEN", SERVER_TOKEN)
        .env("GRIDA_AGENT_PROCESS_TEST_KEY", TEST_CREDENTIAL);
    configured(&mut command, state, &endpoint.url);
    spawn_shared_server(command).await
}

#[tokio::test]
async fn a_first_request_titles_an_untitled_chat_without_overriding_a_rename() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Here is a plan."),
        Reply::Finished("Done."),
    ])
    .await;
    let (child, url) = title_server(&state, &endpoint).await;
    let mut client = organizer(&url).await;
    let session = new_session(&mut client, 2, workspace.path()).await;
    let prompt = |id: u64, text: &str| {
        (
            id,
            json!({"sessionId":session,"prompt":[{"type":"text","text":text}]}),
        )
    };
    let (id, request) = prompt(3, "Help me plan our spring collection launch.");
    let reply = ws_rpc(&mut client, id, "session/prompt", request).await;
    assert_eq!(reply["result"]["stopReason"], "end_turn");
    endpoint.request().await;
    let title = endpoint.title_request().await;
    assert!(
        title.to_string().contains("spring collection launch"),
        "the title reads the first request: {title}"
    );
    assert!(
        title["tools"].as_array().is_none_or(Vec::is_empty),
        "a title request offers no tools: {title}"
    );
    let mut attempt = 10;
    let titled = timeout(WAIT, async {
        loop {
            let titled = ws_rpc(
                &mut client,
                attempt,
                "_co.grida/session/catalog-entry",
                json!({"sessionId":session}),
            )
            .await;
            if !titled["result"]["title"].is_null() {
                break titled;
            }
            attempt += 1;
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("the background title is written");
    assert_eq!(titled["result"]["title"], FIXTURE_TITLE, "{titled}");

    // Later requests never retitle, so a rename stays.
    let renamed = ws_rpc(
        &mut client,
        attempt + 1,
        "_co.grida/session/organize",
        json!({
            "sessionId":session,"revision":titled["result"]["revision"],
            "title":"Spring launch","archived":false,
        }),
    )
    .await;
    assert_eq!(renamed["result"]["title"], "Spring launch", "{renamed}");
    let (id, request) = prompt(attempt + 2, "Now draft the announcement.");
    let reply = ws_rpc(&mut client, id, "session/prompt", request).await;
    assert_eq!(reply["result"]["stopReason"], "end_turn");
    endpoint.request().await;
    let after = ws_rpc(
        &mut client,
        attempt + 3,
        "_co.grida/session/catalog-entry",
        json!({"sessionId":session}),
    )
    .await;
    assert_eq!(after["result"]["title"], "Spring launch");
    endpoint.done().await;
    terminate_shared_server(child).await;
}

#[tokio::test]
async fn first_accepted_title_survives_retries_and_either_order_of_rename_and_generation() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint =
        Endpoint::start(vec![Reply::Finished("Done."), Reply::Finished("Done.")]).await;
    let (child, url) = title_server(&state, &endpoint).await;
    let mut client = organizer(&url).await;
    let mut observer = catalog_client(&url).await;
    for rename_first in [true, false] {
        let (release, held) = tokio::sync::oneshot::channel();
        assert!(
            endpoint
                .title_replies
                .send(Reply::After(held, Box::new(Reply::Finished(FIXTURE_TITLE))))
                .is_ok()
        );
        let session = new_session(&mut client, 2, workspace.path()).await;
        let read = json!({"sessionId":session});
        let rejected = ws_rpc(
            &mut client,
            3,
            "_co.grida/session/submit",
            json!({
                "sessionId": session,
                "inputId": "first",
                "prompt": [],
                "initialTitle": "Rejected title"
            }),
        )
        .await;
        assert_eq!(
            rejected["error"]["data"], "invalid_prompt_parts",
            "{rejected}"
        );
        let empty = ws_rpc(
            &mut client,
            4,
            "_co.grida/session/catalog-entry",
            read.clone(),
        )
        .await;
        assert_eq!(empty["result"]["revision"], 0, "{empty}");
        assert!(empty["result"]["title"].is_null());

        let mut first = prompt_request(
            &session,
            "first",
            "Plan a spring launch with the design team",
        );
        first["initialTitle"] = json!("Launch planning");
        let accepted = ws_rpc(&mut client, 5, "_co.grida/session/submit", first.clone()).await;
        assert!(accepted["result"]["turnId"].is_string(), "{accepted}");
        assert!(
            !endpoint
                .request()
                .await
                .to_string()
                .contains("Launch planning")
        );
        endpoint.title_request().await;
        let provisional = ws_rpc(&mut client, 6, "_co.grida/session/catalog-entry", read).await;
        assert_eq!(
            provisional["result"]["title"], "Launch planning",
            "{provisional}"
        );
        assert_eq!(provisional["result"]["titleGenerationPending"], true);
        let listed = ws_rpc(
            &mut observer,
            7,
            "session/list",
            json!({"cwd":workspace.path()}),
        )
        .await;
        assert_eq!(listed["result"]["sessions"][0]["sessionId"], session);
        assert_eq!(listed["result"]["sessions"][0]["title"], "Launch planning");

        let rename = json!({"sessionId":session,"revision":provisional["result"]["revision"],
            "title":"My launch plan","archived":false});
        if rename_first {
            let renamed =
                ws_rpc(&mut client, 8, "_co.grida/session/organize", rename.clone()).await;
            assert_eq!(renamed["result"]["title"], "My launch plan", "{renamed}");
        }
        release.send(()).unwrap();
        if !rename_first {
            let generated = wait_for_title_worker(&mut client, &session).await;
            assert_eq!(generated["title"], FIXTURE_TITLE, "{generated}");
            let renamed = ws_rpc(&mut client, 9, "_co.grida/session/organize", rename).await;
            assert_eq!(renamed["result"]["title"], "My launch plan", "{renamed}");
        }
        let retry = ws_rpc(&mut client, 10, "_co.grida/session/submit", first).await;
        assert_eq!(
            retry["result"]["turnId"], accepted["result"]["turnId"],
            "{retry}"
        );
        let settled = wait_for_title_worker(&mut client, &session).await;
        assert_eq!(settled["title"], "My launch plan");
    }
    terminate_shared_server(child).await;
    endpoint.done().await;
}

async fn wait_for_title_worker(client: &mut SharedSocket, session: &str) -> Value {
    timeout(WAIT, async {
        loop {
            let entry = ws_rpc(
                client,
                20,
                "_co.grida/session/catalog-entry",
                json!({"sessionId":session}),
            )
            .await;
            let entry = entry.get("result").unwrap_or_else(|| panic!("{entry}"));
            if entry.get("titleGenerationPending").is_none() {
                break entry.clone();
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("the background title request settled")
}

#[tokio::test]
async fn failed_generation_keeps_the_standard_prompt_title_after_restart() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Done."),
        Reply::Finished("Done again."),
    ])
    .await;
    let (release, held) = tokio::sync::oneshot::channel();
    let failure = Reply::RawHttp(
        "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(),
    );
    assert!(
        endpoint
            .title_replies
            .send(Reply::After(held, Box::new(failure)))
            .is_ok()
    );
    let (child, url) = title_server(&state, &endpoint).await;
    let mut client = organizer(&url).await;
    let session = new_session(&mut client, 2, workspace.path()).await;
    let first = ws_rpc(
        &mut client,
        3,
        "session/prompt",
        json!({"sessionId":session,"prompt":[{"type":"text","text":"Compare the drafts"}],
            "_meta":{"co.grida/initialTitle":"Draft comparison"}}),
    )
    .await;
    assert_eq!(first["result"]["stopReason"], "end_turn", "{first}");
    endpoint.request().await;
    endpoint.title_request().await;
    release.send(()).unwrap();
    let retained = wait_for_title_worker(&mut client, &session).await;
    assert_eq!(retained["title"], "Draft comparison");
    let mut later = prompt_request(&session, "later", "Now summarize the differences");
    later["initialTitle"] = json!("Later message");
    let reply = ws_rpc(&mut client, 4, "_co.grida/session/submit", later).await;
    assert!(reply["result"]["turnId"].is_string(), "{reply}");
    endpoint.request().await;
    wait_for_snapshot(&mut client, &session, |view| {
        view["latest"]["turnId"] == reply["result"]["turnId"] && view["current"].is_null()
    })
    .await;
    terminate_shared_server(child).await;
    let inspected = executable()
        .args(["inspect", "--state-dir"])
        .arg(&state)
        .arg(&session)
        .output()
        .await
        .unwrap();
    assert!(
        inspected.status.success(),
        "{}",
        String::from_utf8_lossy(&inspected.stderr)
    );
    assert_eq!(records(&inspected.stdout)[0]["title"], "Draft comparison");
    let (child, url) = title_server(&state, &endpoint).await;
    let mut observer = catalog_client(&url).await;
    let listed = ws_rpc(
        &mut observer,
        2,
        "session/list",
        json!({"cwd":workspace.path()}),
    )
    .await;
    assert_eq!(ids(&listed["result"]), [session.as_str()]);
    assert_eq!(listed["result"]["sessions"][0]["title"], "Draft comparison");
    terminate_shared_server(child).await;
    endpoint.done().await;
}

#[tokio::test]
async fn settings_archives_are_scoped_metadata_without_attaching_or_model_execution() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let other = TempDir::new().unwrap();
    let endpoint = Endpoint::start(vec![]).await;
    let (child, url) = shared_server(&state, &endpoint.url).await;
    let mut creator = organizer(&url).await;
    let session = new_session(&mut creator, 2, workspace.path()).await;
    let archived = ws_rpc(
        &mut creator,
        3,
        "_co.grida/session/organize",
        json!({"sessionId":session,"revision":0,"title":"Archived example","archived":true}),
    )
    .await;
    assert_eq!(archived["result"]["revision"], 1);
    let mut settings = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut init = extension_initialize();
    init["clientCapabilities"]["_meta"]["co.grida/settings/archive-catalog"] = 1.into();
    let initialized = ws_rpc(&mut settings, 1, "initialize", init).await;
    assert_eq!(
        initialized["result"]["agentCapabilities"]["_meta"]["co.grida/settings/archive-catalog"],
        1
    );
    let listed = ws_rpc(
        &mut settings,
        2,
        "_co.grida/settings/archive-catalog",
        json!({"cwd":workspace.path()}),
    )
    .await;
    assert_eq!(
        listed["result"],
        json!({"entries":[{"sessionId":session,"title":"Archived example","revision":1}],"nextCursor":null})
    );
    let denied = ws_rpc(
        &mut settings,
        3,
        "_co.grida/settings/unarchive",
        json!({"cwd":other.path(),"sessionId":session,"revision":1}),
    )
    .await;
    assert_eq!(denied["error"]["data"], "session_catalog_scope_mismatch");
    let stale = ws_rpc(
        &mut settings,
        4,
        "_co.grida/settings/unarchive",
        json!({"cwd":workspace.path(),"sessionId":session,"revision":0}),
    )
    .await;
    assert_eq!(stale["error"]["data"], "session_catalog_revision_changed");
    let executable = env!("CARGO_BIN_EXE_grida-agent");
    let competing = Command::new(executable)
        .args(["archive-catalog", "--state-dir"])
        .arg(&state)
        .arg("--cwd")
        .arg(workspace.path())
        .output()
        .await
        .unwrap();
    assert!(!competing.status.success());
    assert!(String::from_utf8_lossy(&competing.stderr).contains("store_already_owned"));
    drop(settings);
    drop(creator);
    terminate_shared_server(child).await;
    let listed = Command::new(executable)
        .args(["archive-catalog", "--state-dir"])
        .arg(&state)
        .arg("--cwd")
        .arg(workspace.path())
        .output()
        .await
        .unwrap();
    assert!(
        listed.status.success(),
        "{}",
        String::from_utf8_lossy(&listed.stderr)
    );
    let listed: Value = serde_json::from_slice(&listed.stdout).unwrap();
    assert_eq!(listed["entries"][0]["sessionId"], session);
    let restored = Command::new(executable)
        .args(["archive-catalog", "--state-dir"])
        .arg(&state)
        .arg("--cwd")
        .arg(workspace.path())
        .arg("--unarchive")
        .arg(&session)
        .args(["--revision", "1"])
        .output()
        .await
        .unwrap();
    assert!(
        restored.status.success(),
        "{}",
        String::from_utf8_lossy(&restored.stderr)
    );
    let host = grida_agent::host::Host::open(&state, None).unwrap();
    let archived = host
        .archive_catalog(workspace.path().to_path_buf(), None)
        .await
        .unwrap();
    assert!(archived.entries.is_empty());
    let active = host
        .list_sessions(workspace.path().to_path_buf(), false, None)
        .await
        .unwrap();
    assert_eq!(active.entries.len(), 1);
    assert_eq!(active.entries[0].entry.revision, 2);
    let id = agent_kit_core::SessionId::new(&session).unwrap();
    let view = host.inspect(id).await.unwrap();
    assert!(view.current.is_none() && view.latest.is_none());
}
