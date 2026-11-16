//! GRIDA-SEC-004 / GRIDA-SEC-008 — children retain ordinary provider validation.

use std::process::Command;

#[test]
fn subagents_do_not_relax_subscription_profile_validation() {
    for (endpoint, model, scope, failure) in [
        (
            "http://127.0.0.1:1/v1",
            "openai/gpt-5.6-sol",
            "a".repeat(64),
            "chatgpt_subscription_endpoint_invalid",
        ),
        (
            "https://chatgpt.com/backend-api/codex",
            "openai/unknown",
            "a".repeat(64),
            "chatgpt_subscription_model_unavailable",
        ),
        (
            "https://chatgpt.com/backend-api/codex",
            "openai/gpt-5.5",
            "a".repeat(64),
            "chatgpt_subscription_model_unavailable",
        ),
        (
            "https://chatgpt.com/backend-api/codex",
            "openai/gpt-5.4",
            "a".repeat(64),
            "chatgpt_subscription_model_unavailable",
        ),
        (
            "https://chatgpt.com/backend-api/codex",
            "openai/gpt-5.6-sol",
            "bad-scope".into(),
            "chatgpt_subscription_scope_invalid",
        ),
    ] {
        let state = tempfile::TempDir::new().unwrap();
        let directory = state.path().join("state");
        let mut command = Command::new(env!("CARGO_BIN_EXE_grida-agent"));
        command
            .args(["serve", "--stdio", "--subagents", "--supervised-provider"])
            .arg("--state-dir")
            .arg(&directory)
            .args(["--endpoint", endpoint, "--model", model])
            .args(["--provider", "responses", "--supervised-chatgpt-scope"])
            .arg(scope);
        let output = command.output().unwrap();
        assert_eq!(output.status.code(), Some(1));
        assert!(output.stdout.is_empty());
        assert_eq!(
            String::from_utf8(output.stderr).unwrap().trim(),
            format!("grida-agent: {failure}")
        );
        assert!(!directory.exists(), "refused launch created retained state");
    }
}
