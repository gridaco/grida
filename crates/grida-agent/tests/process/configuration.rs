use super::*;

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn supervised_workers_share_one_source_and_reload_preserves_queued_input() {
    use super::approvals::Stdio as SupervisedStdio;

    async fn start(state: &Path, configuration: &Path, model: &str) -> SupervisedStdio {
        let child = executable()
            .args(["serve", "--stdio", "--supervised-provider", "--state-dir"])
            .arg(state)
            .env("GRIDA_HOME", configuration)
            .args(["--endpoint", "http://127.0.0.1:1/v1", "--model", model])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let mut owner = SupervisedStdio::from_child(child);
        let mut capabilities = extension_initialize();
        capabilities["clientCapabilities"]["_meta"]["co.grida/provider/egress"] = 1.into();
        let ready = owner.request("initialize", capabilities).await;
        assert!(ready.get("error").is_none(), "{ready}");
        owner
    }

    async fn enqueue(owner: &mut SupervisedStdio, session: &str, input: &str) -> Value {
        let accepted = owner
            .request(
                "_co.grida/session/enqueue",
                json!({
                    "sessionId": session,
                    "inputId": input,
                    "prompt": [{"type": "text", "text": input}],
                }),
            )
            .await;
        assert!(accepted.get("error").is_none(), "{accepted}");
        assert_eq!(accepted["result"]["disposition"], "queued");
        owner
            .request(
                "_co.grida/session/input",
                json!({"sessionId": session, "inputId": input}),
            )
            .await["result"]["settings"]
            .clone()
    }

    let temporary = TempDir::new().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let configuration = root.join("grida-home");
    let state = root.join("state");
    let workspace = root.join("project");
    let other_workspace = root.join("other-project");
    let alternate_state = root.join("other-state");
    for folder in [&workspace, &other_workspace, &configuration, &state] {
        std::fs::create_dir(folder).unwrap();
    }
    std::fs::set_permissions(&state, std::os::unix::fs::PermissionsExt::from_mode(0o700)).unwrap();
    std::fs::write(
        state.join("config.toml"),
        "schema_version = 1\nmodel_context_window = 1\n",
    )
    .unwrap();
    std::fs::create_dir(workspace.join(".grida")).unwrap();
    std::fs::write(
        workspace.join(".grida/config.toml"),
        "schema_version = 1\nmodel_context_window = 2\n",
    )
    .unwrap();
    let global_path = configuration.join("config.toml");
    std::fs::write(
        &global_path,
        "schema_version = 1\nmodel_context_window = 64000\nunknown = true\n",
    )
    .unwrap();
    let mut first = start(&state, &configuration, "original").await;
    let mut second = start(&alternate_state, &configuration, "alternate").await;

    let created = first
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let accepted = first
        .request(
            "_co.grida/session/submit",
            json!({
                "sessionId":session,"inputId":"hold-owner",
                "prompt":[{"type":"text","text":"Hold at private provider admission."}],
            }),
        )
        .await;
    assert!(accepted.get("error").is_none(), "{accepted}");
    // The fixture leaves the reverse provider request unanswered. No
    // inference request is dispatched and subsequent input stays queued.
    let before = enqueue(&mut first, session, "before-change").await;
    assert_eq!(before["model"], "original");
    assert_eq!(before["modelContextWindow"], 64000);
    assert_eq!(before["modelAutoCompactTokenLimit"], 57600);
    let inspected = first.request("_co.grida/config/inspect", json!({})).await;
    assert_eq!(inspected["result"]["path"], json!(&global_path));
    assert_eq!(inspected["result"]["unknown_keys"], json!(["unknown"]));
    let alternate_created = second
        .request(
            "session/new",
            json!({"cwd":other_workspace,"mcpServers":[]}),
        )
        .await;
    let alternate = alternate_created["result"]["sessionId"].as_str().unwrap();
    let alternate_capture = enqueue(&mut second, alternate, "alternate-capture").await;
    assert_eq!(alternate_capture["model"], "alternate");
    assert_eq!(alternate_capture["modelContextWindow"], 64000);
    let observed = first
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"before-change"}),
        )
        .await;
    assert_eq!(observed["result"]["settings"], before);

    std::fs::write(
        &global_path,
        "schema_version = 1\nmodel_context_window = 96000\nmodel_auto_compact_token_limit = 71000\n",
    )
    .unwrap();
    let pending = first.request("_co.grida/config/inspect", json!({})).await;
    let pending = &pending["result"];
    assert_eq!(pending["active"]["defaults"]["model_context_window"], 64000);
    assert_ne!(
        pending["file_revision"],
        pending["active"]["source_revision"]
    );
    let reloaded = first
        .request(
            "_co.grida/config/reload",
            json!({"expectedRevision":pending["file_revision"]}),
        )
        .await;
    assert!(reloaded.get("error").is_none(), "{reloaded}");
    let after_reload = enqueue(&mut first, session, "after-reload").await;
    assert_eq!(after_reload["modelContextWindow"], 96000);
    assert_eq!(after_reload["modelAutoCompactTokenLimit"], 71000);
    let observed = first
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"before-change"}),
        )
        .await;
    assert_eq!(observed["result"]["settings"], before);
    assert!(!alternate_state.join("config.toml").exists());
    assert!(!state.join("config.active-v1.json").exists());
    second.close().await;

    let mut second = start(&alternate_state, &configuration, "alternate").await;
    let reopened = second.request("_co.grida/config/inspect", json!({})).await;
    assert_eq!(
        reopened["result"]["active"]["defaults"]["model_context_window"],
        96000
    );
    second.close().await;
    first.close().await;
}

#[tokio::test]
async fn native_settings_helper_handles_admission_and_reports_config_source() {
    let temporary = TempDir::new().unwrap();
    let home = temporary.path().join("grida-home");
    let path = home.join("config.toml");
    let mut child = executable()
        .env("GRIDA_HOME", &home)
        .args(["config", "--confirm-stdio", "create"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut reader = BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    timeout(WAIT, reader.read_line(&mut line))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(line, "ready\n");
    drop(child.stdin.take());
    let output = timeout(WAIT, child.wait_with_output())
        .await
        .unwrap()
        .unwrap();
    assert!(!output.status.success());
    assert!(!path.exists());

    let output = executable()
        .env("GRIDA_HOME", &home)
        .args(["config", "create"])
        .output()
        .await
        .unwrap();
    assert!(output.status.success());
    std::fs::write(
        &path,
        "schema_version = 1\nmodel_auto_compact_token_limit = 1024\nmisspelled = true\n",
    )
    .unwrap();
    let output = executable()
        .env("GRIDA_HOME", &home)
        .args(["config", "check"])
        .output()
        .await
        .unwrap();
    assert!(output.status.success(), "{output:?}");
    let json: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(json["path"], json!(&path));
    assert_eq!(json["unknown_keys"], json!(["misspelled"]));
    assert_eq!(
        json["active"]["defaults"]["model_auto_compact_token_limit"],
        1024
    );
    let stderr = String::from_utf8(output.stderr).unwrap();
    assert!(stderr.contains("misspelled"));
    assert!(stderr.contains(path.to_str().unwrap()));
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn headless_run_captures_the_global_settings_outside_its_state_and_project() {
    let temporary = TempDir::new().unwrap();
    let root = temporary.path().canonicalize().unwrap();
    let state = root.join("state");
    let project = root.join("project");
    let home = fixture_config_home(&state);
    for directory in [&state, &project, &home] {
        std::fs::create_dir(directory).unwrap();
    }
    std::fs::set_permissions(&state, std::os::unix::fs::PermissionsExt::from_mode(0o700)).unwrap();
    std::fs::write(
        state.join("config.toml"),
        "schema_version = 1\nmodel_context_window = 1\n",
    )
    .unwrap();
    std::fs::write(
        home.join("config.toml"),
        "schema_version = 1\nmodel_context_window = 65536\nmodel_auto_compact_token_limit = 32000\n",
    )
    .unwrap();

    let mut endpoint = Endpoint::start(vec![Reply::Finished("Done.")]).await;
    let mut command = executable();
    command
        .arg("run")
        .arg("--cwd")
        .arg(&project)
        .args(["--prompt", "Check the catalog"]);
    configured(&mut command, &state, &endpoint.url);
    let output = timeout(WAIT, command.output()).await.unwrap().unwrap();
    assert!(output.status.success(), "{output:?}");
    let records = records(&output.stdout);
    let accepted = &records[0];
    let session = &accepted["session_id"];
    let input = &accepted["input_id"];
    assert!(session.is_string() && input.is_string(), "{accepted}");
    endpoint.request().await;
    let mut owner = super::approvals::Stdio::from_child(spawn_serve(&state, &endpoint.url));
    let initialized = owner.request("initialize", extension_initialize()).await;
    assert!(initialized.get("error").is_none(), "{initialized}");
    let loaded = owner
        .request(
            "session/load",
            json!({"cwd":project,"sessionId":session,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
    let inspected = owner
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":input}),
        )
        .await;
    assert_eq!(inspected["result"]["settings"]["modelContextWindow"], 65536);
    assert_eq!(
        inspected["result"]["settings"]["modelAutoCompactTokenLimit"],
        32000
    );
    owner.close().await;
    endpoint.done().await;
}
