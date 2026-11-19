use super::*;
use futures_util::SinkExt;
use history::load_transcript;
use lifecycle::{
    initialized_shared_socket, prompt_request, session_snapshot, terminate_shared_server,
    wait_for_snapshot,
};
use tokio_tungstenite::tungstenite::Message;

const FIRST_PROMPT: &str = "Keep this established context.";
const FIRST_ANSWER: &str = "The established context is saved.";
const SECOND_PROMPT: &str = "Submit this request only once.";
const SECOND_ANSWER: &str = "The retained request succeeded.";
const INPUT_ID: &str = "retained-input";

#[tokio::test]
async fn unobserved_submission_reply_preserves_receipt_and_work_after_host_exit() {
    use std::os::unix::process::ExitStatusExt;

    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let (release, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished(FIRST_ANSWER),
        Reply::Release(SECOND_ANSWER, held),
        Reply::Finished("The follow-up succeeded."),
    ])
    .await;
    let (mut host, url) = shared_server(&state, &endpoint.url).await;
    let mut observer = initialized_shared_socket(&url).await;
    let (session, first) = seed_history(&mut observer, workspace.path(), &mut endpoint).await;

    let mut submitter = initialized_shared_socket(&url).await;
    assert_eq!(
        load_transcript(&mut submitter, &session, workspace.path()).await,
        [FIRST_PROMPT, FIRST_ANSWER]
    );
    let submission = prompt_request(&session, INPUT_ID, SECOND_PROMPT);
    let message = json!({
        "jsonrpc":"2.0","id":3,"method":"_co.grida/session/submit","params":submission,
    });
    timeout(
        WAIT,
        submitter.send(Message::Text(message.to_string().into())),
    )
    .await
    .unwrap()
    .unwrap();
    // The provider cannot see work before acceptance commits. An independent
    // observer reads the claimed receipt while the provider response is held.
    // The submitting client discards the connection without reading its reply.
    assert_messages(
        &endpoint.request().await,
        &[FIRST_PROMPT, FIRST_ANSWER, SECOND_PROMPT],
    );
    let claimed = query_input(&mut observer, &session, INPUT_ID).await;
    assert_eq!(claimed["result"]["receipt"]["disposition"], "claimed");
    let turn = claimed["result"]["receipt"]["turnId"].as_str().unwrap();
    assert_ne!(first["latest"]["turnId"], turn);
    drop(submitter);
    release.send(()).unwrap();
    wait_for_success(&mut observer, &session, turn).await;
    let completed = query_input(&mut observer, &session, INPUT_ID).await;
    let receipt = &completed["result"]["receipt"];
    assert_eq!(receipt["disposition"], "completed");
    assert_eq!(receipt["turnId"], turn);
    assert_eq!(receipt["inputId"], INPUT_ID);
    assert_eq!(
        receipt["inputPosition"],
        claimed["result"]["receipt"]["inputPosition"]
    );

    host.start_kill().unwrap();
    assert_eq!(finish_child(host).await.status.signal(), Some(9));
    drop(observer);

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = initialized_shared_socket(&url).await;
    assert_eq!(
        load_transcript(&mut socket, &session, workspace.path()).await,
        [FIRST_PROMPT, FIRST_ANSWER, SECOND_PROMPT, SECOND_ANSWER]
    );
    let readback = query_input(&mut socket, &session, INPUT_ID).await;
    assert_eq!(readback["result"], completed["result"]);
    let retry = ws_rpc(&mut socket, 3, "_co.grida/session/submit", submission).await;
    assert_eq!(retry["result"], *receipt);
    let conflict = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/submit",
        prompt_request(&session, INPUT_ID, "Changed text under the same identity."),
    )
    .await;
    assert_eq!(conflict["error"]["data"], "submission_input_changed");
    let idle = session_snapshot(&mut socket, &session).await;
    assert!(idle["current"].is_null());
    assert_eq!(idle["queuedInputs"], 0);
    assert_eq!(idle["latest"]["turnId"], turn);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));

    let follow_up = "Continue with a distinct request.";
    let accepted = ws_rpc(
        &mut socket,
        5,
        "_co.grida/session/submit",
        prompt_request(&session, "next-input", follow_up),
    )
    .await;
    let next_turn = accepted["result"]["turnId"].as_str().unwrap();
    assert_ne!(next_turn, turn);
    assert_messages(
        &endpoint.request().await,
        &[
            FIRST_PROMPT,
            FIRST_ANSWER,
            SECOND_PROMPT,
            SECOND_ANSWER,
            follow_up,
        ],
    );
    wait_for_success(&mut socket, &session, next_turn).await;
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

#[tokio::test]
async fn failed_submission_commit_leaves_no_receipt_and_the_same_input_can_succeed() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished(FIRST_ANSWER),
        Reply::Finished(SECOND_ANSWER),
    ])
    .await;
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = initialized_shared_socket(&url).await;
    let (session, first) = seed_history(&mut socket, workspace.path(), &mut endpoint).await;
    let prior = query_input(&mut socket, &session, "first-input").await;
    let first_position = prior["result"]["receipt"]["inputPosition"]
        .as_u64()
        .unwrap();
    drop(socket);
    terminate_shared_server(host).await;

    // The trigger inserts a deferred constraint violation in the fixture
    // database. The ordinary store stages the input and claim, then SQLite
    // rejects COMMIT and rolls back. The fixture edits only a closed database.
    let database = state.join(grida_agent::host::DATABASE_FILE);
    rusqlite::Connection::open(&database)
        .unwrap()
        .execute_batch(
            "CREATE TABLE fixture_parent (id INTEGER PRIMARY KEY);
             CREATE TABLE fixture_child (parent INTEGER REFERENCES fixture_parent(id)
                 DEFERRABLE INITIALLY DEFERRED);
             CREATE TRIGGER reject_input_commit AFTER INSERT ON submissions
                 WHEN NEW.id = 'retained-input'
             BEGIN
                 INSERT INTO fixture_child (parent) VALUES (1);
             END;",
        )
        .unwrap();

    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = initialized_shared_socket(&url).await;
    assert_eq!(
        load_transcript(&mut socket, &session, workspace.path()).await,
        [FIRST_PROMPT, FIRST_ANSWER]
    );
    let submission = prompt_request(&session, INPUT_ID, SECOND_PROMPT);
    let failed = ws_rpc(
        &mut socket,
        3,
        "_co.grida/session/submit",
        submission.clone(),
    )
    .await;
    assert_eq!(
        failed["error"]["data"], "sqlite_commit_unconfirmed",
        "{failed}"
    );
    assert_absent(&mut socket, &session, &first).await;
    let unrelated = ws_rpc(
        &mut socket,
        4,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert_ne!(unrelated["result"]["sessionId"].as_str().unwrap(), session);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    drop(socket);
    // A later read proves this receipt absent, but the failed commit remains
    // part of the exiting process's conservative quiescence report.
    let signal = Command::new("kill")
        .args(["-TERM", &host.id().unwrap().to_string()])
        .status()
        .await
        .unwrap();
    assert!(signal.success());
    let output = finish_child(host).await;
    assert_eq!(output.status.code(), Some(5));
    assert!(String::from_utf8_lossy(&output.stderr).contains("host_turn_unverified"));

    rusqlite::Connection::open(&database)
        .unwrap()
        .execute_batch(
            "DROP TRIGGER reject_input_commit;
             DROP TABLE fixture_child;
             DROP TABLE fixture_parent;",
        )
        .unwrap();
    let (host, url) = shared_server(&state, &endpoint.url).await;
    let mut socket = initialized_shared_socket(&url).await;
    assert_eq!(
        load_transcript(&mut socket, &session, workspace.path()).await,
        [FIRST_PROMPT, FIRST_ANSWER]
    );
    assert_absent(&mut socket, &session, &first).await;
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));

    let accepted = ws_rpc(
        &mut socket,
        4,
        "_co.grida/session/submit",
        submission.clone(),
    )
    .await;
    assert_eq!(accepted["result"]["disposition"], "claimed", "{accepted}");
    assert_eq!(accepted["result"]["inputId"], INPUT_ID);
    assert_eq!(accepted["result"]["inputPosition"], first_position + 1);
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    assert_ne!(first["latest"]["turnId"], turn);
    assert_messages(
        &endpoint.request().await,
        &[FIRST_PROMPT, FIRST_ANSWER, SECOND_PROMPT],
    );
    wait_for_success(&mut socket, &session, turn).await;
    let retry = ws_rpc(&mut socket, 5, "_co.grida/session/submit", submission).await;
    assert_eq!(retry["result"]["disposition"], "completed", "{retry}");
    assert_eq!(retry["result"]["turnId"], turn);
    assert_eq!(retry["result"]["inputPosition"], first_position + 1);
    assert_eq!(
        load_transcript(&mut socket, &session, workspace.path()).await,
        [FIRST_PROMPT, FIRST_ANSWER, SECOND_PROMPT, SECOND_ANSWER]
    );
    drop(socket);
    terminate_shared_server(host).await;
    endpoint.done().await;
}

async fn seed_history(
    socket: &mut SharedSocket,
    workspace: &Path,
    endpoint: &mut Endpoint,
) -> (String, Value) {
    let created = ws_rpc(
        socket,
        2,
        "session/new",
        json!({"cwd":workspace,"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
    let first = ws_rpc(
        socket,
        3,
        "_co.grida/session/submit",
        prompt_request(&session, "first-input", FIRST_PROMPT),
    )
    .await;
    let turn = first["result"]["turnId"].as_str().unwrap();
    assert_messages(&endpoint.request().await, &[FIRST_PROMPT]);
    let settled = wait_for_success(socket, &session, turn).await;
    (session, settled)
}

async fn query_input(socket: &mut SharedSocket, session: &str, input: &str) -> Value {
    ws_rpc(
        socket,
        1001,
        "_co.grida/session/input",
        json!({"sessionId":session,"inputId":input}),
    )
    .await
}

async fn assert_absent(socket: &mut SharedSocket, session: &str, prior: &Value) {
    let missing = query_input(socket, session, INPUT_ID).await;
    assert_eq!(missing["error"]["data"], "input_unavailable", "{missing}");
    let snapshot = session_snapshot(socket, session).await;
    assert!(snapshot["current"].is_null());
    assert_eq!(snapshot["queuedInputs"], 0);
    assert_eq!(snapshot["latest"], prior["latest"]);
    assert_eq!(snapshot["sessionRevision"], prior["sessionRevision"]);
}

async fn wait_for_success(socket: &mut SharedSocket, session: &str, turn: &str) -> Value {
    let settled = wait_for_snapshot(socket, session, |snapshot| {
        snapshot["current"].is_null() && snapshot["latest"]["turnId"] == turn
    })
    .await;
    assert_eq!(settled["latest"]["status"], "succeeded");
    settled
}

fn assert_messages(request: &Value, expected: &[&str]) {
    let messages: Vec<_> = request["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|message| message["role"] != "system")
        .map(|message| message["content"].as_str().unwrap())
        .collect();
    assert_eq!(messages, expected);
}
