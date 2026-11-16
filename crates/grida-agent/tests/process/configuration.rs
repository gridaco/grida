use super::*;

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tokio::test]
async fn supervised_workspace_workers_share_defaults_without_rewriting_queued_input() {
    use super::approvals::Stdio as SupervisedStdio;

    async fn start(
        state: &Path,
        configuration: &Path,
        epoch: &str,
        model: &str,
    ) -> SupervisedStdio {
        let child = executable()
            .args(["serve", "--stdio", "--supervised-provider", "--state-dir"])
            .arg(state)
            .arg("--workspace-configuration")
            .arg(configuration)
            .args([
                "--workspace-configuration-epoch",
                epoch,
                "--endpoint",
                "http://127.0.0.1:1/v1",
                "--model",
                model,
            ])
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
    let configuration = root.join("state");
    let workspace = root.join("project");
    let alternate_state = configuration.join("profiles").join("a".repeat(64));
    std::fs::create_dir(&workspace).unwrap();
    let epoch = uuid::Uuid::new_v4().to_string();
    let mut first = start(&configuration, &configuration, &epoch, "original").await;
    let mut second = start(&alternate_state, &configuration, &epoch, "alternate").await;

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
    assert!(before["maxInputTokens"].is_null());
    let applied = second
        .request(
            "_co.grida/config/update",
            json!({
                "expectedRevision": null,
                "change":{"operation":"set_context_max_input_tokens","value":64000},
            }),
        )
        .await;
    assert!(applied.get("error").is_none(), "{applied}");
    let after = enqueue(&mut first, session, "after-change").await;
    assert_eq!(after["maxInputTokens"], 64000);
    let alternate_created = second
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let alternate = alternate_created["result"]["sessionId"].as_str().unwrap();
    let alternate_capture = enqueue(&mut second, alternate, "alternate-capture").await;
    assert_eq!(alternate_capture["model"], "alternate");
    assert_eq!(alternate_capture["maxInputTokens"], 64000);
    let observed = first
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"before-change"}),
        )
        .await;
    assert_eq!(observed["result"]["settings"], before);

    std::fs::write(
        configuration.join("config.toml"),
        "schema_version = 1\n[context]\nmax_input_tokens = 96000\n",
    )
    .unwrap();
    second.close().await;
    let mut second = start(&alternate_state, &configuration, &epoch, "alternate").await;
    let pending = second.request("_co.grida/config/inspect", json!({})).await;
    let pending = &pending["result"];
    assert_eq!(
        pending["active"]["defaults"]["context"]["max_input_tokens"],
        64000
    );
    assert_ne!(
        pending["file_revision"],
        pending["active"]["source_revision"]
    );
    let reloaded = second
        .request(
            "_co.grida/config/reload",
            json!({"expectedRevision":pending["file_revision"]}),
        )
        .await;
    assert!(reloaded.get("error").is_none(), "{reloaded}");
    let after_reload = enqueue(&mut first, session, "after-reload").await;
    assert_eq!(after_reload["maxInputTokens"], 96000);
    let observed = first
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"before-change"}),
        )
        .await;
    assert_eq!(observed["result"]["settings"], before);
    assert!(!alternate_state.join("config.toml").exists());
    second.close().await;
    first.close().await;
}
