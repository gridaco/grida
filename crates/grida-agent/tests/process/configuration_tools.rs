use super::lifecycle::{session_snapshot, terminate_shared_server, wait_for_snapshot};
use super::*;

async fn client(url: &str, configuration: bool) -> SharedSocket {
    let mut socket = connect_shared(url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let mut capabilities = extension_initialize();
    if !configuration {
        let meta = capabilities["clientCapabilities"]["_meta"]
            .as_object_mut()
            .unwrap();
        for capability in [
            "co.grida/config/inspect",
            "co.grida/config/update",
            "co.grida/config/reload",
        ] {
            meta.remove(capability);
        }
    }
    assert!(
        ws_rpc(&mut socket, 1, "initialize", capabilities)
            .await
            .get("error")
            .is_none()
    );
    socket
}

#[tokio::test]
async fn explicit_configuration_permission_changes_future_defaults_through_model_tools() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Tool("config_inspect", "{}"),
        Reply::Tool("config_update", r#"{"expected_file_revision":null,"change":{"operation":"set_context_max_input_tokens","value":64000}}"#),
        Reply::Finished("Future tasks will use the requested cap."),
    ]).await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = client(&url, true).await;
    let created = ws_rpc(
        &mut socket,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let accepted = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        json!({
            "sessionId":session,"inputId":"change-default", "allowConfigurationChanges":true,
            "prompt":[{"type":"text","text":"Use a 64000-token input limit for future tasks."}]
        }),
    )
    .await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    let first = endpoint.request().await;
    let offered = first["tools"].as_array().unwrap();
    for name in ["config_inspect", "config_update", "config_reload"] {
        assert!(offered.iter().any(|tool| tool["function"]["name"] == name));
    }
    let inspected = endpoint.request().await;
    assert!(
        inspected["messages"]
            .to_string()
            .contains("Maximum context input")
    );
    let applied = endpoint.request().await;
    assert!(applied["messages"].to_string().contains("64000"));
    let settled = wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert_eq!(settled["latest"]["status"], "succeeded");
    let inspected = ws_rpc(&mut socket, 4, "_co.grida/config/inspect", json!({})).await;
    assert_eq!(inspected["result"]["exact_input_counting"], false);
    assert_eq!(
        inspected["result"]["active"]["defaults"]["context"]["max_input_tokens"],
        64000
    );
    let input = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":"change-default"}),
    )
    .await;
    assert_eq!(
        input["result"]["settings"]["configurationPermission"],
        "change"
    );
    assert!(input["result"]["settings"]["maxInputTokens"].is_null());
    let changed_permission = ws_rpc(
        &mut socket,
        51,
        "_co.grida/session/submit",
        json!({
            "sessionId":session,"inputId":"change-default",
            "prompt":[{"type":"text","text":"Use a 64000-token input limit for future tasks."}]
        }),
    )
    .await;
    assert_eq!(
        changed_permission["error"]["data"],
        "submission_configuration_permission_changed"
    );
    let later = ws_rpc(
        &mut socket,
        6,
        "_co.grida/session/enqueue",
        json!({
            "sessionId":session,"inputId":"later","prompt":[{"type":"text","text":"Continue"}]
        }),
    )
    .await;
    assert!(later.get("error").is_none(), "{later}");
    let settled = wait_for_snapshot(&mut socket, session, |snapshot| {
        snapshot["current"].is_null()
            && snapshot["latest"]["turnId"] != accepted["result"]["turnId"]
    })
    .await;
    assert_eq!(settled["latest"]["status"], "failed");
    assert!(endpoint.requests.try_recv().is_err());
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn negotiation_alone_never_gives_the_model_configuration_write_access() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Inspection only.")]).await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut plain = client(&url, false).await;
    let created = ws_rpc(
        &mut plain,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let refused = ws_rpc(
        &mut plain,
        3,
        "_co.grida/session/submit",
        json!({
            "sessionId":session,"inputId":"unnegotiated","allowConfigurationChanges":true,
            "prompt":[{"type":"text","text":"Change future defaults"}]
        }),
    )
    .await;
    assert!(refused.get("error").is_some(), "{refused}");
    assert!(session_snapshot(&mut plain, session).await["latest"].is_null());
    drop(plain);
    let mut capable = client(&url, true).await;
    let loaded = ws_rpc(
        &mut capable,
        2,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let accepted=ws_rpc(&mut capable,3,"_co.grida/session/submit",json!({
        "sessionId":session,"inputId":"readonly","prompt":[{"type":"text","text":"Inspect the defaults"}]
    })).await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    let request = endpoint.request().await;
    let names = request["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["function"]["name"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(names, ["config_inspect"]);
    wait_for_snapshot(&mut capable, session, |snapshot| {
        snapshot["current"].is_null()
    })
    .await;
    assert!(!state.join("config.toml").exists());
    drop(capable);
    terminate_shared_server(host).await;
    endpoint.done().await;
}
