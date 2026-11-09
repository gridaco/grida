//! GRIDA-SEC-004 — Built native completion authority and restart controls.

use super::approvals::Stdio as PrivateStdio;
use super::lifecycle::{prompt_request, task_basis};
use super::*;

const CHECK: &str = "require-completion-text";
const FLAG: &str = "--require-completion-text";

#[tokio::test]
async fn a_required_completion_check_records_its_decision_without_offering_a_tool() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished(" "),
        Reply::Finished("Fixture answer."),
        Reply::Finished(" "),
    ])
    .await;
    for (enabled, exit_code, status, check) in [
        (true, 1, "failed", "denied"),
        (true, 0, "succeeded", "allowed"),
        (false, 0, "succeeded", ""),
    ] {
        let mut command = executable();
        command.arg("run");
        configured(&mut command, &state, &endpoint.url);
        if enabled {
            command.arg(FLAG);
        }
        let output = timeout(
            WAIT,
            command
                .arg("--cwd")
                .arg(workspace.path())
                .args(["--prompt", "Answer this task."])
                .output(),
        )
        .await
        .unwrap()
        .unwrap();
        let records = records(&output.stdout);
        assert_eq!(
            output.status.code(),
            Some(exit_code),
            "{records:?} {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(records[1]["disposition"], status);
        let account = &records[1]["account"];
        if enabled {
            let receipt = &account["completion_checks"][0];
            assert_eq!(receipt["check"], CHECK);
            assert_eq!(receipt["status"], check);
            assert!(receipt["operation"].is_string());
            assert_eq!(account["steps"], 1);
            assert_eq!(account["unresolved"], json!([]));
        } else {
            assert!(account.get("completion_checks").is_none());
        }
        if exit_code == 1 {
            assert_eq!(account["failure"]["code"], "completion_check_blocked");
        }
        assert!(endpoint.request().await.get("tools").is_none());
    }
    endpoint.done().await;
}

async fn server(state: &Path, endpoint: &str, enabled: bool) -> PrivateStdio {
    let mut command = executable();
    command.args(["serve", "--stdio"]);
    configured(&mut command, state, endpoint);
    if enabled {
        command.arg(FLAG);
    }
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = PrivateStdio::from_child(child);
    let mut capabilities = extension_initialize();
    let meta = capabilities["clientCapabilities"]["_meta"]
        .as_object_mut()
        .unwrap();
    meta.insert("co.grida/session/questions".into(), 1.into());
    meta.insert("co.grida/session/answer-question".into(), 1.into());
    let initialized = client.request("initialize", capabilities).await;
    assert_eq!(initialized["result"]["protocolVersion"], 1);
    client
}

async fn snapshot(client: &mut PrivateStdio, session: &str) -> Value {
    let response = client
        .request("_co.grida/session/snapshot", json!({"sessionId":session}))
        .await;
    assert!(response.get("error").is_none(), "{response}");
    response["result"].clone()
}

async fn wait_for(
    client: &mut PrivateStdio,
    session: &str,
    matches: impl Fn(&Value) -> bool,
) -> Value {
    timeout(WAIT, async {
        loop {
            let view = snapshot(client, session).await;
            if matches(&view) {
                return view;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}

async fn start(client: &mut PrivateStdio, workspace: &Path) -> String {
    let created = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
    let submitted = client
        .request(
            "_co.grida/session/submit",
            prompt_request(&session, "question", "Prepare the answer."),
        )
        .await;
    assert_eq!(submitted["result"]["disposition"], "claimed", "{submitted}");
    session
}

async fn load(client: &mut PrivateStdio, session: &str, workspace: &Path) {
    let loaded = client
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace,"mcpServers":[]}),
        )
        .await;
    assert!(loaded.get("error").is_none(), "{loaded}");
}

#[tokio::test]
async fn restart_preserves_the_selected_check_and_stop_works_without_the_handler() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Question("question_async"),
        Reply::Finished(" "),
        Reply::Finished(" "),
        Reply::Question("question"),
    ])
    .await;
    let mut host = server(&state, &endpoint.url, true).await;
    let session = start(&mut host, workspace.path()).await;
    for _ in 0..2 {
        let request = endpoint.request().await;
        assert!(
            request["tools"]
                .as_array()
                .unwrap()
                .iter()
                .all(|tool| tool["function"]["name"] != "require_completion_text")
        );
    }
    let suspended = wait_for(&mut host, &session, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    host.close().await;

    let mut host = server(&state, &endpoint.url, true).await;
    load(&mut host, &session, workspace.path()).await;
    let turn = &suspended["current"]["turnId"];
    let pending = host
        .request(
            "_co.grida/session/questions",
            json!({"sessionId":session,"turnId":turn}),
        )
        .await;
    let pending = &pending["result"];
    let answered = host
        .request(
            "_co.grida/session/answer-question",
            json!({
                "sessionId":session, "turnId":turn, "requestId":"answer",
                "expectedSessionRevision":suspended["sessionRevision"],
                "expectedControlRevision":pending["controlRevision"],
                "expectedHistoryPosition":pending["historyPosition"],
                "waitId":pending["questions"][0]["waitId"],
                "answer":{"kind":"text","text":"Screen"},
            }),
        )
        .await;
    assert!(answered.get("error").is_none(), "{answered}");
    endpoint.request().await;
    let finished = wait_for(&mut host, &session, |view| view["current"].is_null()).await;
    assert_eq!(finished["latest"]["turnId"], *turn);
    assert_eq!(finished["latest"]["status"], "failed");

    let session = start(&mut host, workspace.path()).await;
    endpoint.request().await;
    let suspended = wait_for(&mut host, &session, |view| {
        view["current"]["disposition"] == "suspended"
    })
    .await;
    let paused = host
        .request(
            "_co.grida/session/pause",
            task_basis(&suspended, &session, "pause"),
        )
        .await;
    assert!(paused.get("error").is_none(), "{paused}");
    let paused = snapshot(&mut host, &session).await;
    assert_eq!(paused["current"]["paused"], true);
    host.close().await;

    let mut host = server(&state, &endpoint.url, false).await;
    load(&mut host, &session, workspace.path()).await;
    let resume = host
        .request(
            "_co.grida/session/resume",
            json!({
                "task":task_basis(&paused,&session,"resume"),
                "expectedEpoch":paused["current"]["epoch"],
                "expectedJournalPosition":paused["current"]["journalPosition"],
            }),
        )
        .await;
    assert_eq!(
        resume["error"]["data"], "completion_check_profile_unavailable",
        "{resume}"
    );
    assert_eq!(
        snapshot(&mut host, &session).await["current"],
        paused["current"]
    );
    let stopped = host
        .request(
            "_co.grida/session/stop",
            task_basis(&paused, &session, "stop"),
        )
        .await;
    assert!(stopped.get("error").is_none(), "{stopped}");
    let finished = wait_for(&mut host, &session, |view| view["current"].is_null()).await;
    assert_eq!(finished["latest"]["turnId"], paused["current"]["turnId"]);
    assert_eq!(finished["latest"]["status"], "cancelled");
    endpoint.done().await;
    host.close().await;
}
