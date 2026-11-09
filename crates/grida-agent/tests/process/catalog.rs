use super::lifecycle::{session_snapshot, terminate_shared_server};
use super::*;

async fn catalog_client(url: &str) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let init = ws_rpc(&mut socket, 1, "initialize", extension_initialize()).await;
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
async fn standard_acp_catalog_discovers_saved_workspace_sessions_without_loading_them() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let a = TempDir::new().unwrap();
    let b = TempDir::new().unwrap();
    let alias = temporary.path().join("workspace-alias");
    std::os::unix::fs::symlink(a.path(), &alias).unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Retained answer")]).await;
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
        "session/prompt",
        json!({
            "sessionId":a_sessions[0],"prompt":[{"type":"text","text":"PRIVATE_TRANSCRIPT_MARKER"}],
        }),
    )
    .await;
    assert_eq!(prompt["result"]["stopReason"], "end_turn");
    endpoint.request().await;
    let before = session_snapshot(&mut client, &a_sessions[0]).await;
    terminate_shared_server(child).await;
    let endpoint_url = endpoint.url.clone();
    endpoint.done().await;

    let (child, url) = shared_server(&state, &endpoint_url).await;
    let mut client = catalog_client(&url).await;
    let unscoped = ws_rpc(&mut client, 2, "session/list", json!({})).await;
    assert_eq!(unscoped["error"]["code"], -32602);
    assert_eq!(unscoped["error"]["data"], "session_list_workspace_required");
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
    assert!(page["sessions"].as_array().unwrap().iter().all(|row| {
        row["cwd"] == json!(expected_cwd) && row.as_object().is_some_and(|keys| keys.len() == 2)
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
    terminate_shared_server(child).await;
}
