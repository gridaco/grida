//! GRIDA-SEC-004 — independent catalog clients observe only the authorized store set.
use super::*;
use futures_util::StreamExt;
use std::fs;
use std::os::unix::fs::PermissionsExt;

const WATCH: &str = "co.grida/catalog/watch";
const READ: &str = "co.grida/session/read-state";
const QUERY: &str = "co.grida/session/catalog-query";
const CHANGED: &str = "_co.grida/catalog/changed";

fn registry(path: &Path, workspaces: &[(&Path, &Path)]) {
    let workspaces: Vec<_> = workspaces
        .iter()
        .map(|(cwd, state)| json!({"cwd": cwd, "stateDir": state}))
        .collect();
    let manifest = json!({"workspaces": workspaces});
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, manifest.to_string()).unwrap();
    fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600)).unwrap();
    fs::rename(temporary, path).unwrap();
}

async fn observer(url: &str, filter: Option<&Path>) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut init = extension_initialize();
    for key in [WATCH, READ, QUERY] {
        init["clientCapabilities"]["_meta"][key] = json!(1);
    }
    let reply = ws_rpc(&mut socket, 1, "initialize", init).await;
    assert_eq!(
        reply["result"]["agentCapabilities"]["_meta"][WATCH], 1,
        "{reply}"
    );
    let reply = ws_rpc(
        &mut socket,
        2,
        "_co.grida/catalog/subscribe",
        json!({"cwd":filter}),
    )
    .await;
    assert!(reply["result"].is_object(), "{reply}");
    socket
}

async fn changed(socket: &mut SharedSocket) -> Value {
    use tokio_tungstenite::tungstenite::Message;
    timeout(WAIT, async {
        loop {
            if let Message::Text(line) = socket.next().await.unwrap().unwrap() {
                let frame: Value = serde_json::from_str(&line).unwrap();
                if frame["method"] == CHANGED {
                    return frame["params"].clone();
                }
            }
        }
    })
    .await
    .unwrap()
}

async fn list(socket: &mut SharedSocket) -> Value {
    let page = ws_rpc(
        socket,
        10,
        "session/list",
        json!({"_meta":{"co.grida/catalogOrder":"messageActivity","co.grida/catalogLimit":1}}),
    )
    .await;
    assert!(page["result"]["sessions"].is_array(), "{page}");
    page["result"].clone()
}

async fn first_after_change(socket: &mut SharedSocket, verify: impl Fn(&Value) -> bool) -> Value {
    timeout(WAIT, async {
        loop {
            changed(socket).await;
            let page = list(socket).await;
            if verify(&page) {
                return page;
            }
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn catalog_subscription_observes_other_writers_scopes_and_owner_loss() {
    let tmp = TempDir::new().unwrap();
    fs::set_permissions(tmp.path(), fs::Permissions::from_mode(0o700)).unwrap();
    let base = tmp.path().canonicalize().unwrap();
    let a = base.join("a");
    let b = base.join("b");
    fs::create_dir(&a).unwrap();
    fs::create_dir(&b).unwrap();
    let state_a = base.join("store-a");
    let state_b = base.join("store-b");
    let manifest = base.join("registry.json");
    registry(&manifest, &[(&a, &state_a), (&b, &state_b)]);
    let mut command = executable();
    command
        .args([
            "serve-catalog",
            "--listen",
            "ws://127.0.0.1:0/acp",
            "--server-token-env",
            "GRIDA_AGENT_FIXTURE_SERVER_TOKEN",
            "--catalog-registry",
        ])
        .arg(&manifest)
        .env("GRIDA_AGENT_FIXTURE_SERVER_TOKEN", SERVER_TOKEN);
    let (service, url) = spawn_shared_server(command).await;
    let mut global = observer(&url, None).await;
    let mut scoped = observer(&url, Some(&b)).await;
    assert!(
        list(&mut global).await["sessions"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("In B."),
        Reply::Finished("In A."),
        Reply::Question("question_async"),
        Reply::Hold("Working."),
    ])
    .await;
    let (mut writer_a, url_a) = shared_server(&state_a, &endpoint.url).await;
    let (writer_b, url_b) = shared_server(&state_b, &endpoint.url).await;
    let mut a_client = questions::question_socket(&url_a, true).await;
    let mut b_client = connect_shared(&url_b, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    ws_rpc(&mut b_client, 1, "initialize", extension_initialize()).await;
    let a_session = ws_rpc(
        &mut a_client,
        2,
        "session/new",
        json!({"cwd":a,"mcpServers":[]}),
    )
    .await["result"]["sessionId"]
        .clone();
    first_after_change(&mut global, |page| {
        page["sessions"][0]["sessionId"] == a_session
    })
    .await;
    let b_session = ws_rpc(
        &mut b_client,
        2,
        "session/new",
        json!({"cwd":b,"mcpServers":[]}),
    )
    .await["result"]["sessionId"]
        .clone();
    let prompt = |id: &Value| json!({"sessionId":id,"prompt":[{"type":"text","text":"Reply."}]});
    assert_eq!(
        ws_rpc(&mut b_client, 3, "session/prompt", prompt(&b_session)).await["result"]["stopReason"],
        "end_turn"
    );
    endpoint.request().await;
    // The B subscription received no wake identifying A, even when both
    // previously missing store directories shared a watched ancestor.
    let first = changed(&mut scoped).await;
    assert_eq!(first["cwds"], json!([b]));
    let page = first_after_change(&mut global, |page| {
        page["sessions"][0]["sessionId"] == b_session
    })
    .await;
    assert!(page["nextCursor"].is_string());
    assert_eq!(
        ws_rpc(&mut a_client, 3, "session/prompt", prompt(&a_session)).await["result"]["stopReason"],
        "end_turn"
    );
    endpoint.request().await;
    let page = first_after_change(&mut global, |page| {
        page["sessions"][0]["sessionId"] == a_session
            && page["sessions"][0]["_meta"]["co.grida/readState"]["unread"] == true
    })
    .await;
    let read = &page["sessions"][0]["_meta"]["co.grida/readState"];
    let seen = json!({
        "cwd": a, "sessionId": a_session, "action": "acknowledge",
        "revision": read["revision"], "replyId": read["replyId"]
    });
    let ack = ws_rpc(&mut global, 11, "_co.grida/session/read-state", seen).await;
    assert_eq!(ack["result"]["unread"], false, "{ack}");

    let submit = ws_rpc(
        &mut a_client,
        4,
        "_co.grida/session/submit",
        json!({"sessionId":a_session,"inputId":"last","prompt":[{"type":"text","text":"Hold."}]}),
    )
    .await;
    assert!(submit["result"].is_object(), "{submit}");
    endpoint.request().await;
    endpoint.request().await;
    first_after_change(&mut global, |p| {
        p["_meta"]["co.grida/runningSessionIds"] == json!([a_session])
            && p["_meta"]["co.grida/inputNeededSessionIds"] == json!([a_session])
    })
    .await;
    writer_a.kill().await.unwrap();
    writer_a.wait().await.unwrap();
    first_after_change(&mut global, |p| {
        p["_meta"]["co.grida/runningSessionIds"] == json!([])
    })
    .await;
    registry(&manifest, &[(&b, &state_b)]);
    first_after_change(&mut global, |p| {
        p["sessions"][0]["sessionId"] == b_session && p["nextCursor"].is_null()
    })
    .await;
    let mut reconnected = observer(&url, None).await;
    assert_eq!(
        list(&mut reconnected).await["sessions"][0]["sessionId"],
        b_session
    );
    assert!(
        ws_rpc(
            &mut global,
            12,
            "_co.grida/session/read-state",
            json!({"cwd":a,"sessionId":a_session,"action":"markUnread"})
        )
        .await["error"]
            .is_object()
    );
    drop(a_client);
    drop(b_client);
    drop(global);
    drop(scoped);
    drop(reconnected);
    lifecycle::terminate_shared_server(writer_b).await;
    lifecycle::terminate_shared_server(service).await;
    endpoint.done().await;
}

fn stdio_catalog(manifest: &Path) -> super::approvals::Stdio {
    let child = executable()
        .args(["serve-catalog", "--stdio", "--catalog-registry"])
        .arg(manifest)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    super::approvals::Stdio::from_child(child)
}

#[tokio::test]
async fn stdio_catalog_snapshots_cover_setup_bursts_and_disconnected_changes() {
    use super::approvals::Stdio;
    let directory = TempDir::new().unwrap();
    let root = directory.path().canonicalize().unwrap();
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
    let cwd = root.join("project");
    fs::create_dir(&cwd).unwrap();
    let state = root.join("state");
    let manifest = root.join("registry.json");
    registry(&manifest, &[(&cwd, &state)]);
    let catalog = || stdio_catalog(&manifest);
    let mut init = extension_initialize();
    init["clientCapabilities"]["_meta"][WATCH] = json!(1);
    init["clientCapabilities"]["_meta"]["co.grida/session/organize"] = json!(1);
    let mut observer = catalog();
    observer.request("initialize", init.clone()).await;
    let ack = observer
        .send("_co.grida/catalog/subscribe", json!({}))
        .await;
    let mut writer = Stdio::from_child(spawn_serve(&state, "http://127.0.0.1:1"));
    writer.request("initialize", init.clone()).await;
    let mut sessions = Vec::new();
    for _ in 0..10 {
        let row = writer
            .request("session/new", json!({"cwd":cwd,"mcpServers":[]}))
            .await;
        sessions.push(row["result"]["sessionId"].clone());
    }
    assert_eq!(observer.read_reply().await["id"], ack);
    let page = observer.request("session/list", json!({})).await;
    assert_eq!(
        page["result"]["sessions"].as_array().unwrap().len(),
        sessions.len()
    );
    assert!(observer.finish().await.status.success());

    for (i, id) in sessions.iter().take(2).enumerate() {
        let old = writer
            .request("_co.grida/session/catalog-entry", json!({"sessionId":id}))
            .await;
        let params = json!({
            "sessionId": id, "revision": old["result"]["revision"],
            "title": "Reviewed", "archived": i == 0
        });
        let row = writer.request("_co.grida/session/organize", params).await;
        assert_eq!(row["result"]["archived"], i == 0, "{row}");
    }
    // The next client can read this store after its owning process has closed.
    assert!(writer.finish().await.status.success());
    let mut observer = catalog();
    observer.request("initialize", init).await;
    observer
        .request("_co.grida/catalog/subscribe", json!({}))
        .await;
    let page = observer.request("session/list", json!({})).await;
    let rows = page["result"]["sessions"].as_array().unwrap();
    assert_eq!(rows.len(), sessions.len() - 1);
    assert!(!rows.iter().any(|r| r["sessionId"] == sessions[0]));
    assert!(
        rows.iter()
            .any(|r| r["sessionId"] == sessions[1] && r["title"] == "Reviewed")
    );
    assert!(observer.finish().await.status.success());
}

#[tokio::test]
async fn catalog_subscription_continues_when_a_store_directory_is_replaced() {
    use super::approvals::Stdio;
    let directory = TempDir::new().unwrap();
    let root = directory.path().canonicalize().unwrap();
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
    let cwd = root.join("workspace");
    let state = root.join("stores/state");
    fs::create_dir(&cwd).unwrap();
    fs::create_dir_all(&state).unwrap();
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700)).unwrap();
    let manifest = root.join("registry.json");
    registry(&manifest, &[(&cwd, &state)]);
    let mut init = extension_initialize();
    init["clientCapabilities"]["_meta"][WATCH] = json!(1);
    let mut observer = stdio_catalog(&manifest);
    observer.request("initialize", init.clone()).await;
    assert!(
        observer
            .request("_co.grida/catalog/subscribe", json!({}))
            .await["result"]
            .is_object()
    );

    // Replace the inode before the observer consumes the removal. The registry
    // and its containing directory remain unchanged.
    fs::remove_dir(&state).unwrap();
    fs::create_dir(&state).unwrap();
    fs::set_permissions(&state, fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(observer.read_frame().await["method"], CHANGED);
    assert_eq!(
        observer.request("session/list", json!({})).await["result"]["sessions"],
        json!([])
    );

    let mut writer = Stdio::from_child(spawn_serve(&state, "http://127.0.0.1:1"));
    writer.request("initialize", init).await;
    for _ in 0..2 {
        let row = writer
            .request("session/new", json!({"cwd":cwd,"mcpServers":[]}))
            .await;
        let session = row["result"]["sessionId"].as_str().unwrap();
        timeout(WAIT, async {
            loop {
                assert_eq!(observer.read_frame().await["method"], CHANGED);
                let page = observer.request("session/list", json!({})).await;
                if page["result"]["sessions"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|item| item["sessionId"] == session)
                {
                    break;
                }
            }
        })
        .await
        .unwrap();
    }
    assert!(writer.finish().await.status.success());
    assert!(observer.finish().await.status.success());
}
