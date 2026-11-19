use super::*;

async fn output(command: &mut Command) -> std::process::Output {
    timeout(WAIT, command.output()).await.unwrap().unwrap()
}

async fn success(command: &mut Command) -> Vec<u8> {
    let result = output(command).await;
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    result.stdout
}

async fn bake(options: &[&str]) -> Value {
    let bytes = success(executable().arg("bake-prompt").arg("--json").args(options)).await;
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn offline_bake_matches_the_selected_role_mode_and_question_inventory() {
    let act = bake(&[]).await;
    assert_eq!(
        bake(&[]).await,
        act,
        "temporary session identities leaked into preview"
    );
    let text = success(executable().arg("bake-prompt")).await;
    assert_eq!(
        String::from_utf8(text).unwrap().trim_end(),
        act["instructions"][0]
    );
    let tools = |prompt: &Value, name: &str| {
        prompt["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tool| tool["id"] == name)
    };
    assert!(tools(&act, "question_async"));
    assert!(act["instructions"].to_string().contains("question_async"));
    assert!(!tools(&act, "delegate_review"));

    let plan_side = bake(&["--mode", "plan", "--role", "side", "--no-questions"]).await;
    let instructions = plan_side["instructions"].to_string();
    assert!(instructions.contains("Plan is active."));
    assert!(instructions.contains("This is a side chat"));
    assert!(!instructions.contains("question_async"));
    assert!(!tools(&plan_side, "question"));
    assert!(!tools(&plan_side, "question_async"));

    let ultra = bake(&["--effort", "ultra"]).await;
    assert!(tools(&ultra, "delegate_review"));
    assert!(tools(&ultra, "spawn_agent"));
    let delegated = bake(&["--subagents"]).await;
    assert!(tools(&delegated, "spawn_agent") && !tools(&delegated, "delegate_review"));
    assert!(
        ultra["instructions"]
            .to_string()
            .contains("Ultra effort is active")
    );
    let refused =
        output(executable().args(["bake-prompt", "--role", "side", "--effort", "ultra"])).await;
    assert!(!refused.status.success());
    assert!(String::from_utf8_lossy(&refused.stderr).contains("side_chat_delegation_unavailable"));
    assert!(refused.stdout.is_empty());
}

#[tokio::test]
async fn historical_inspection_lists_operations_and_reads_only_the_selected_prepared_prompt() {
    let root = TempDir::new().unwrap();
    let state = root.path().join("state");
    let workspace = TempDir::new().unwrap();
    let project_text = "private project guidance for the captured turn";
    std::fs::write(workspace.path().join("AGENTS.md"), project_text).unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question_async"),
        Reply::Finished("Done."),
    ])
    .await;
    let mut run = executable();
    run.arg("run");
    configured(&mut run, &state, &endpoint.url);
    let private = "private user content for the captured turn";
    run.arg("--cwd").arg(workspace.path()).args([
        "--mode",
        "plan",
        "--questions",
        "--prompt",
        private,
    ]);
    let started = records(&success(&mut run).await);
    let first = endpoint.request().await;
    let second = endpoint.request().await;
    assert!(first["messages"].to_string().contains(project_text));
    endpoint.done().await;
    drop(workspace);
    let inspect = || {
        let mut command = executable();
        command
            .arg("inspect")
            .arg("--state-dir")
            .arg(&state)
            .arg(started[0]["session_id"].as_str().unwrap())
            .arg("--prompt-turn")
            .arg(started[0]["turn_id"].as_str().unwrap());
        command
    };
    let index: Vec<Value> = serde_json::from_slice(&success(&mut inspect()).await).unwrap();
    assert_eq!(index.len(), 2);
    assert_ne!(index[0]["message_count"], index[1]["message_count"]);
    assert_ne!(
        index[0]["request_fingerprint"],
        index[1]["request_fingerprint"]
    );
    for item in index {
        assert_eq!(item["model"], "fixture-model");
        assert_eq!(item["attempts"], 1);
        assert!(item.get("instructions").is_none() && item.get("tools").is_none());
        let bytes = success(
            inspect()
                .arg("--operation")
                .arg(item["operation"].as_str().unwrap()),
        )
        .await;
        assert!(!String::from_utf8_lossy(&bytes).contains(private));
        assert!(!String::from_utf8_lossy(&bytes).contains(project_text));
        let selected: Vec<Value> = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(selected.len(), 1);
        let prompt = &selected[0];
        assert_eq!(prompt["operation"], item["operation"]);
        assert_eq!(prompt["request_fingerprint"], item["request_fingerprint"]);
        // Match the metadata to the wire call. The second includes the tool exchange.
        let wire = [&first, &second]
            .into_iter()
            .find(|wire| item["message_count"] == wire["messages"].as_array().unwrap().len())
            .expect("prepared message count matches the request seen by the fixture");
        let instructions: Vec<_> = wire["messages"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|message| message["role"] == "system")
            .map(|message| message["content"].clone())
            .collect();
        assert_eq!(prompt["instructions"], json!(instructions));
        for (tool, wire_tool) in prompt["tools"]
            .as_array()
            .unwrap()
            .iter()
            .zip(wire["tools"].as_array().unwrap())
        {
            assert_eq!(tool["id"], wire_tool["function"]["name"]);
            assert_eq!(tool["description"], wire_tool["function"]["description"]);
            assert_eq!(tool["input"]["schema"], wire_tool["function"]["parameters"]);
        }
        assert_eq!(
            prompt["tools"].as_array().unwrap().len(),
            wire["tools"].as_array().unwrap().len()
        );
    }
    let missing = output(inspect().args(["--operation", "missing"])).await;
    assert!(!missing.status.success());
    assert!(String::from_utf8_lossy(&missing.stderr).contains("prepared_prompt_unavailable"));
}
