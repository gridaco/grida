//! GRIDA-SEC-004 — saved chat retirement through the built private host.

use super::approvals::Stdio as Client;
use super::lifecycle::terminate_shared_server;
use super::*;
use agent_kit_core::{Fingerprint, SessionId};
use std::os::unix::fs::DirBuilderExt;

const DELETE: &str = "_co.grida/session/delete";
const PREVIEW: &str = "_co.grida/session/delete-preview";
const CATALOG: &str = "_co.grida/session/catalog-entry";
const SNAPSHOT: &str = "_co.grida/session/snapshot";

pub(super) fn capabilities() -> Value {
    let mut request = extension_initialize();
    for key in [
        "co.grida/session/delete",
        "co.grida/session/delete-preview",
        "co.grida/session/organize",
        "co.grida/session/updates",
        "co.grida/side-chat/open",
        "co.grida/side-chat/ask",
        "co.grida/side-chat/close",
        "co.grida/subagent/create",
        "co.grida/subagent/assign",
        "co.grida/subagent/inspect",
        "co.grida/goal/start",
    ] {
        request["clientCapabilities"]["_meta"][key] = 1.into();
    }
    request
}

async fn start(state: &Path, endpoint: &str) -> Client {
    let mut command = executable();
    command.args(["serve", "--stdio", "--subagents"]);
    configured(&mut command, state, endpoint);
    let mut client = Client::from_child(
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let initialized = client.request("initialize", capabilities()).await;
    assert_eq!(
        initialized["result"]["agentCapabilities"]["_meta"][&DELETE[1..]],
        1,
        "{initialized}"
    );
    client
}

async fn created(client: &mut Client, cwd: &Path) -> String {
    let created = client
        .request("session/new", json!({"cwd":cwd,"mcpServers":[]}))
        .await;
    created["result"]["sessionId"].as_str().unwrap().to_owned()
}

fn setup(session: &str, cwd: &Path) -> Value {
    json!({"sessionId":session,"cwd":cwd,"mcpServers":[]})
}

pub(super) async fn deletion(client: &mut Client, session: &str, cwd: &Path) -> Value {
    let target = json!({"sessionId":session});
    let snapshot = client.request(SNAPSHOT, target.clone()).await;
    let catalog = client.request(CATALOG, target).await;
    json!({
        "sessionId":session,"cwd":cwd,"requestId":"confirmed-delete",
        "expectedSessionRevision":snapshot["result"]["sessionRevision"].as_u64().unwrap(),
        "expectedCatalogRevision":catalog["result"]["revision"].as_u64().unwrap(),
    })
}

async fn prompt(client: &mut Client, session: &str, text: &str) {
    let reply = client
        .request(
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":text}]}),
        )
        .await;
    assert_eq!(reply["result"]["stopReason"], "end_turn", "{reply}");
}

fn refused(reply: &Value, reason: &str) {
    assert_eq!(reply["error"]["data"], reason, "{reply}");
}

#[tokio::test]
async fn reviewed_deletion_removes_only_idle_owned_children() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let cwd = workspace.path();
    let (release, wait) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Parent has work to review."),
        Reply::Release("Child work is resolved.", wait),
    ])
    .await;
    let mut client = start(&state, &endpoint.url).await;
    let parent = created(&mut client, cwd).await;
    let foreign_parent = created(&mut client, cwd).await;
    prompt(&mut client, &parent, "Keep a reviewed parent result").await;
    endpoint.request().await;
    let snapshot = client.request(SNAPSHOT, json!({"sessionId":parent})).await;
    let parent_turn = snapshot["result"]["latest"]["turnId"].as_str().unwrap();

    let foreign = create_child(&mut client, &foreign_parent, "foreign").await;
    let first = create_child(&mut client, &parent, "first").await;
    let before = preview(&mut client, &parent, cwd, 1).await;
    let second = create_child(&mut client, &parent, "second").await;
    let mut request = deletion(&mut client, &parent, cwd).await;
    request["expectedOwnedChildren"] = before;
    refused(
        &client.request(DELETE, request.clone()).await,
        "session_deletion_dependencies_changed",
    );

    let assigned = client
        .request(
            "_co.grida/subagent/assign",
            json!({
                "parentSessionId":parent,"childId":second,"parentTurnId":parent_turn,
                "inputId":"second-work","instructions":"Check the evidence.",
            }),
        )
        .await;
    assert!(assigned["result"].is_object(), "{assigned}");
    endpoint.request().await;
    request["expectedOwnedChildren"] = preview(&mut client, &parent, cwd, 2).await;
    refused(
        &client.request(DELETE, request.clone()).await,
        "session_deletion_requires_idle",
    );
    assert_eq!(
        inspect_child(&mut client, &parent, &first).await["result"]["childId"],
        first
    );
    assert_eq!(
        inspect_child(&mut client, &foreign_parent, &foreign).await["result"]["childId"],
        foreign
    );

    release.send(()).unwrap();
    timeout(WAIT, async {
        loop {
            let child = inspect_child(&mut client, &parent, &second).await;
            if child["result"]["current"].is_null() && child["result"]["latest"].is_object() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    refused(
        &client.request(DELETE, request.clone()).await,
        "session_deletion_dependencies_changed",
    );
    request["expectedOwnedChildren"] = preview(&mut client, &parent, cwd, 2).await;
    let result = timeout(WAIT, async {
        loop {
            let deleted = client.request(DELETE, request.clone()).await;
            if deleted["error"]["data"] != "session_deletion_requires_idle" {
                break deleted;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        result["result"],
        json!({"sessionId":parent,"requestId":"confirmed-delete"}),
        "{result}"
    );
    client.close().await;

    let store =
        grida_agent::host::open_store(&state.join(grida_agent::host::DATABASE_FILE)).unwrap();
    use agent_kit_sessions::SessionStore;
    for removed in [&parent, &first, &second] {
        assert_eq!(
            store
                .inspect(SessionId::new(removed).unwrap())
                .await
                .unwrap_err()
                .code,
            "session_missing"
        );
    }
    assert!(
        store
            .inspect(SessionId::new(&foreign).unwrap())
            .await
            .is_ok()
    );
    drop(store);

    let mut client = start(&state, &endpoint.url).await;
    assert_eq!(
        client.request(DELETE, request).await["result"],
        result["result"]
    );
    assert!(
        client
            .request("session/load", setup(&foreign_parent, cwd))
            .await["result"]
            .is_object()
    );
    assert_eq!(
        inspect_child(&mut client, &foreign_parent, &foreign).await["result"]["childId"],
        foreign
    );
    client.close().await;
    endpoint.done().await;
}

async fn create_child(client: &mut Client, parent: &str, name: &str) -> String {
    let child = client
        .request(
            "_co.grida/subagent/create",
            json!({
                "parentSessionId":parent,"requestId":name,"name":name,"workTurns":1,
            }),
        )
        .await;
    child["result"]["childId"]
        .as_str()
        .unwrap_or_else(|| panic!("{child}"))
        .to_owned()
}

async fn preview(client: &mut Client, session: &str, cwd: &Path, count: usize) -> Value {
    let reply = client
        .request(PREVIEW, json!({"sessionId":session,"cwd":cwd}))
        .await;
    assert_eq!(reply["result"]["sessionId"], session);
    assert_eq!(reply["result"]["ownedChildren"], count, "{reply}");
    let basis = reply["result"]["ownedChildrenBasis"].clone();
    assert_eq!(basis.as_str().map(str::len), Some(64), "{basis}");
    basis
}

async fn inspect_child(client: &mut Client, parent: &str, child: &str) -> Value {
    client
        .request(
            "_co.grida/subagent/inspect",
            json!({"parentSessionId":parent,"childId":child}),
        )
        .await
}

#[tokio::test]
async fn private_delete_revokes_attachment_and_retains_fork_and_exact_restart_receipt() {
    let temp = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let workspace = TempDir::new().unwrap();
    let foreign = TempDir::new().unwrap();
    let authored = workspace.path().join("artwork.txt");
    std::fs::write(&authored, "authored project file").unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Independent copied context")]).await;
    let mut client = start(&state, &endpoint.url).await;
    let session = created(&mut client, workspace.path()).await;
    prompt(&mut client, &session, "Keep a separate conversation").await;
    endpoint.request().await;
    let history = client
        .request("_co.grida/session/history", json!({"sessionId":session}))
        .await;
    let fork = client.request("_co.grida/session/fork", json!({
        "sessionId":session,"requestId":"fork","expectedHistory":history["result"]["basis"],
        "anchor":history["result"]["messages"].as_array().unwrap().last().unwrap()["anchor"],
    })).await;
    let fork = fork["result"]["sessionId"].as_str().unwrap();

    let stale = deletion(&mut client, &session, workspace.path()).await;
    let archived = client.request("_co.grida/session/organize", json!({
        "sessionId":session,"revision":stale["expectedCatalogRevision"],"title":"Archived draft","archived":true,
    })).await;
    assert_eq!(archived["result"]["archived"], true);
    refused(
        &client.request(DELETE, stale).await,
        "session_catalog_revision_changed",
    );
    let params = deletion(&mut client, &session, workspace.path()).await;
    let archived_list = client
        .request(
            "_co.grida/session/list-archived",
            json!({"cwd":workspace.path()}),
        )
        .await;
    assert_eq!(archived_list["result"]["sessions"][0]["sessionId"], session);
    let mut wrong_workspace = params.clone();
    wrong_workspace["cwd"] = json!(foreign.path());
    refused(
        &client.request(DELETE, wrong_workspace.clone()).await,
        "session_missing",
    );
    let deleted = client.request(DELETE, params.clone()).await;
    assert_eq!(
        deleted["result"],
        json!({"sessionId":session,"requestId":"confirmed-delete"}),
        "{deleted}"
    );
    refused(
        &client.request(SNAPSHOT, json!({"sessionId":session})).await,
        "session_setup_required",
    );
    refused(
        &client
            .request("session/load", setup(&session, workspace.path()))
            .await,
        "session_missing",
    );
    let archived_list = client
        .request(
            "_co.grida/session/list-archived",
            json!({"cwd":workspace.path()}),
        )
        .await;
    assert_eq!(archived_list["result"]["sessions"], json!([]));
    let list = client
        .request("session/list", json!({"cwd":workspace.path()}))
        .await;
    assert_eq!(list["result"]["sessions"][0]["sessionId"], fork);
    assert_eq!(
        client.request(DELETE, params.clone()).await["result"],
        deleted["result"]
    );
    client.close().await;

    let mut reopened = start(&state, &endpoint.url).await;
    assert_eq!(
        reopened.request(DELETE, params.clone()).await["result"],
        deleted["result"]
    );
    refused(
        &reopened.request(DELETE, wrong_workspace).await,
        "session_setup_required",
    );
    let mut different = params;
    different["requestId"] = json!("different-delete");
    refused(
        &reopened.request(DELETE, different).await,
        "request_identity_reused",
    );
    let loaded = reopened
        .request("session/load", setup(fork, workspace.path()))
        .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let history = reopened
        .request("_co.grida/session/history", json!({"sessionId":fork}))
        .await;
    assert!(
        history.to_string().contains("Independent copied context"),
        "{history}"
    );
    assert_eq!(
        std::fs::read_to_string(&authored).unwrap(),
        "authored project file"
    );
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn private_delete_refuses_side_chats_children_retained_inputs_and_live_work() {
    let temp = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let workspace = TempDir::new().unwrap();
    let cwd = workspace.path();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("Side source"),
        Reply::Hold("Still working"),
    ])
    .await;
    let mut client = start(&state, &endpoint.url).await;
    let parent = created(&mut client, cwd).await;
    prompt(&mut client, &parent, "Use this side context").await;
    endpoint.request().await;
    let params = deletion(&mut client, &parent, cwd).await;
    let side = client
        .request(
            "_co.grida/side-chat/open",
            json!({"sessionId":parent,"requestId":"open-side"}),
        )
        .await;
    let side = side["result"]["sideChatId"].as_str().unwrap();
    refused(
        &client.request(DELETE, params.clone()).await,
        "session_deletion_has_side_chat",
    );
    let closed = client
        .request("_co.grida/side-chat/close", json!({"sideChatId":side}))
        .await;
    assert!(closed.get("result").is_some(), "{closed}");
    let child = client
        .request(
            "_co.grida/subagent/create",
            json!({
                "parentSessionId":parent,"requestId":"create-child","name":"Reader","workTurns":1,
            }),
        )
        .await;
    let child = child["result"]["childId"].as_str().unwrap();
    let list = client.request("session/list", json!({"cwd":cwd})).await;
    assert_eq!(list["result"]["sessions"].as_array().unwrap().len(), 1);
    assert_ne!(list["result"]["sessions"][0]["sessionId"], child);
    refused(
        &client.request(DELETE, params).await,
        "session_deletion_has_subagents",
    );

    let scratch_chat = created(&mut client, cwd).await;
    let owner = SessionId::new(&scratch_chat).unwrap();
    let owner_key = Fingerprint::of(&owner)
        .unwrap()
        .bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let retained = state.join("retained-inputs");
    std::fs::DirBuilder::new()
        .mode(0o700)
        .create(&retained)
        .unwrap();
    let marker = cwd.join("untouched.txt");
    std::fs::write(&marker, "preserve this").unwrap();
    std::os::unix::fs::symlink(cwd, retained.join(owner_key)).unwrap();
    let scratch_params = deletion(&mut client, &scratch_chat, cwd).await;
    refused(
        &client.request(DELETE, scratch_params).await,
        "session_deletion_has_retained_inputs",
    );
    assert_eq!(std::fs::read_to_string(marker).unwrap(), "preserve this");

    let active = created(&mut client, cwd).await;
    let accepted = client.request("_co.grida/session/submit", json!({
        "sessionId":active,"inputId":"active","prompt":[{"type":"text","text":"Keep working"}]
    })).await;
    assert_eq!(accepted["result"]["disposition"], "claimed", "{accepted}");
    endpoint.request().await;
    let queued = client.request("_co.grida/session/enqueue", json!({
        "sessionId":active,"inputId":"pending","prompt":[{"type":"text","text":"Keep this input"}]
    })).await;
    assert_eq!(queued["result"]["disposition"], "queued", "{queued}");
    let active_params = deletion(&mut client, &active, cwd).await;
    refused(
        &client.request(DELETE, active_params.clone()).await,
        "session_deletion_requires_idle",
    );
    let running = client.request(SNAPSHOT, json!({"sessionId":active})).await;
    assert_eq!(running["result"]["queuedInputs"], 1);
    client.close().await;

    let mut reopened = start(&state, &endpoint.url).await;
    for session in [&active, &parent] {
        let loaded = reopened.request("session/load", setup(session, cwd)).await;
        assert!(loaded.get("result").is_some(), "{loaded}");
    }
    let active_params = deletion(&mut reopened, &active, cwd).await;
    refused(
        &reopened.request(DELETE, active_params).await,
        "session_deletion_requires_idle",
    );
    let parent_params = deletion(&mut reopened, &parent, cwd).await;
    refused(
        &reopened.request(DELETE, parent_params).await,
        "session_deletion_has_subagents",
    );
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn replay_cannot_publish_or_attach_after_private_deletion() {
    let temp = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Finished the long transcript")]).await;
    let mut client = start(&state, &endpoint.url).await;
    let session = created(&mut client, workspace.path()).await;
    prompt(
        &mut client,
        &session,
        &"Long retained line. ".repeat(12_000),
    )
    .await;
    endpoint.request().await;
    let params = deletion(&mut client, &session, workspace.path()).await;
    let load = client
        .send("session/load", setup(&session, workspace.path()))
        .await;
    let delete = client.send(DELETE, params.clone()).await;
    let (mut loaded, mut deleted) = (None, None::<Value>);
    let mut replay_chunks = 0;
    timeout(WAIT, async {
        while loaded.is_none() || deleted.is_none() {
            let frame = client.read_frame().await;
            if frame["method"] == "session/update" && frame["params"]["sessionId"] == session {
                assert!(
                    !deleted
                        .as_ref()
                        .is_some_and(|reply| reply.get("result").is_some()),
                    "post-delete update"
                );
                replay_chunks += 1;
            } else if frame["id"] == load {
                loaded = Some(frame);
            } else if frame["id"] == delete {
                deleted = Some(frame);
            }
        }
    })
    .await
    .unwrap();
    if loaded.unwrap().get("result").is_some() {
        assert!(replay_chunks > 8);
    }
    let result = deleted.unwrap();
    if result.get("result").is_none() {
        refused(&result, "session_deletion_observation_in_progress");
        let retry = client.request(DELETE, params).await;
        assert!(retry.get("result").is_some(), "{retry}");
    }
    refused(
        &client.request(SNAPSHOT, json!({"sessionId":session})).await,
        "session_setup_required",
    );
    refused(
        &client
            .request("session/load", setup(&session, workspace.path()))
            .await,
        "session_missing",
    );
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn shared_connection_cannot_negotiate_deletion() {
    let temp = TempDir::new().unwrap();
    let (child, url) = shared_server(&temp.path().join("state"), "http://127.0.0.1:1/v1").await;
    let mut socket = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let init = ws_rpc(&mut socket, 1, "initialize", capabilities()).await;
    assert!(init["result"]["agentCapabilities"]["_meta"][&DELETE[1..]].is_null());
    assert!(init["result"]["agentCapabilities"]["_meta"][&PREVIEW[1..]].is_null());
    let unreviewable = ws_rpc(
        &mut socket,
        2,
        PREVIEW,
        json!({"sessionId":"missing","cwd":temp.path()}),
    )
    .await;
    assert_eq!(unreviewable["error"]["code"], -32601);
    let denied = ws_rpc(
        &mut socket,
        3,
        DELETE,
        json!({
            "sessionId":"missing","cwd":temp.path(),"requestId":"delete",
            "expectedSessionRevision":0,"expectedCatalogRevision":0,
        }),
    )
    .await;
    assert_eq!(denied["error"]["code"], -32601);
    drop(socket);
    terminate_shared_server(child).await;
}

#[tokio::test]
async fn deletion_preserves_a_goal_after_its_turn_settles() {
    let temp = TempDir::new().unwrap();
    let state = temp.path().join("state");
    let workspace = TempDir::new().unwrap();
    let cwd = workspace.path();
    let mut endpoint = Endpoint::start(vec![Reply::Finished(
        "An attempt without completion evidence",
    )])
    .await;
    let mut client = start(&state, &endpoint.url).await;
    let session = created(&mut client, cwd).await;
    let accepted = client
        .request(
            "_co.grida/goal/start",
            json!({
                "sessionId":session,"inputId":"goal-input",
                "prompt":[{"type":"text","text":"Prepare the export"}],
                "goal":{
                    "objective":{"description":"Prepare the export","criteria":["The file opens"]},
                    "allowance":{"work_turns":3,"inference_steps":5},"automatic":false
                }
            }),
        )
        .await;
    assert_eq!(accepted["result"]["inputId"], "goal-input", "{accepted}");
    endpoint.request().await;
    let refused_deletion = timeout(WAIT, async {
        loop {
            let params = deletion(&mut client, &session, cwd).await;
            let reply = client.request(DELETE, params).await;
            if !matches!(
                reply["error"]["data"].as_str(),
                Some("session_deletion_requires_idle" | "stale_session_revision")
            ) {
                break reply;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    refused(&refused_deletion, "session_goal_exists");
    let snapshot = client.request(SNAPSHOT, json!({"sessionId":session})).await;
    assert!(snapshot["result"]["current"].is_null());
    assert!(snapshot["result"]["latest"].is_object());
    client.close().await;
    endpoint.done().await;
}
