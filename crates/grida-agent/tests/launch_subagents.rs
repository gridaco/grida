//! GRIDA-SEC-004 — supervised child launches require a Gateway scope.

use std::process::Command;

#[test]
fn rejects_supervised_subagents_for_generic_and_subscription_launches() {
    for subscription in [false, true] {
        let state = tempfile::TempDir::new().unwrap();
        let mut command = Command::new(env!("CARGO_BIN_EXE_grida-agent"));
        command
            .args(["serve", "--stdio", "--subagents", "--supervised-provider"])
            .arg("--state-dir")
            .arg(state.path().join("state"))
            .args(["--endpoint", "http://127.0.0.1:1/v1", "--model", "fixture"]);
        if subscription {
            command
                .args(["--provider", "responses", "--supervised-chatgpt-scope"])
                .arg("a".repeat(64));
        }
        let output = command.output().unwrap();
        assert_eq!(output.status.code(), Some(1));
        assert!(output.stdout.is_empty());
        assert_eq!(
            String::from_utf8(output.stderr).unwrap().trim(),
            "grida-agent: subagent_supervised_gateway_required"
        );
    }
}
