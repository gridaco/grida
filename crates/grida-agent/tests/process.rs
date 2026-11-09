use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::v1::schema::{
    CancelNotification, ContentBlock, InitializeRequest, LoadSessionRequest, NewSessionRequest,
    PromptRequest, ResourceLink, SessionNotification, SessionUpdate, StopReason,
};
use agent_client_protocol::{ByteStreams, Client, on_receive_notification};
use serde_json::{Value, json};
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tempfile::TempDir;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio::time::timeout;
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

const WAIT: Duration = Duration::from_secs(15);
const TEST_CREDENTIAL: &str = "fixture-only-bearer-token";

struct Endpoint {
    url: String,
    requests: mpsc::UnboundedReceiver<Value>,
    task: tokio::task::JoinHandle<()>,
}

enum Reply {
    Finished(&'static str),
    Hold(&'static str),
    Stop(&'static str),
}

impl Endpoint {
    async fn start(replies: Vec<Reply>) -> Self {
        Self::start_with_credential(replies, Some(TEST_CREDENTIAL)).await
    }

    async fn start_with_credential(replies: Vec<Reply>, credential: Option<&'static str>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/v1", listener.local_addr().unwrap());
        let (sent, requests) = mpsc::unbounded_channel();
        let task = tokio::spawn(async move {
            for reply in replies {
                let (stream, _) = timeout(WAIT, listener.accept()).await.unwrap().unwrap();
                fixture_request(stream, &sent, reply, credential).await;
            }
        });
        Self {
            url,
            requests,
            task,
        }
    }

    async fn request(&mut self) -> Value {
        timeout(WAIT, self.requests.recv()).await.unwrap().unwrap()
    }

    async fn done(self) {
        timeout(WAIT, self.task).await.unwrap().unwrap();
    }
}

async fn fixture_request(
    stream: TcpStream,
    sent: &mpsc::UnboundedSender<Value>,
    reply: Reply,
    credential: Option<&str>,
) {
    let mut stream = BufReader::new(stream);
    let mut line = String::new();
    stream.read_line(&mut line).await.unwrap();
    assert_eq!(line, "POST /v1/chat/completions HTTP/1.1\r\n");
    let mut length = None;
    let mut authorization = None;
    loop {
        line.clear();
        assert_ne!(stream.read_line(&mut line).await.unwrap(), 0);
        if line == "\r\n" {
            break;
        }
        let (key, value) = line.trim_end().split_once(':').unwrap();
        if key.eq_ignore_ascii_case("content-length") {
            length = Some(value.trim().parse::<usize>().unwrap());
        }
        if key.eq_ignore_ascii_case("authorization") {
            authorization = Some(value.trim().to_owned());
        }
    }
    assert_eq!(
        authorization,
        credential.map(|value| format!("Bearer {value}"))
    );
    let mut request = vec![0; length.unwrap()];
    stream.read_exact(&mut request).await.unwrap();
    sent.send(serde_json::from_slice(&request).unwrap())
        .unwrap();
    let (text, finish) = match reply {
        Reply::Finished(text) => (text, Some("stop")),
        Reply::Hold(text) => (text, None),
        Reply::Stop(reason) => ("", Some(reason)),
    };
    let delta = json!({
        "id": "fixture-response",
        "choices": [{"index": 0, "delta": {"role": "assistant", "content": text}, "finish_reason": null}],
    });
    let mut body = format!("data: {delta}\n\n");
    if let Some(reason) = finish {
        let stop = json!({
            "id": "fixture-response",
            "choices": [{"index": 0, "delta": {}, "finish_reason": reason}],
        });
        body.push_str(&format!("data: {stop}\n\ndata: [DONE]\n\n"));
    }
    let hold = finish.is_none();
    let advertised_length = if hold { 1 << 20 } else { body.len() };
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {advertised_length}\r\nConnection: close\r\nX-Request-Id: fixture-request\r\n\r\n"
    );
    let mut stream = stream.into_inner();
    stream.write_all(head.as_bytes()).await.unwrap();
    stream.write_all(body.as_bytes()).await.unwrap();
    stream.flush().await.unwrap();
    if hold {
        let mut remaining = [0; 1];
        assert_eq!(
            timeout(WAIT, stream.read(&mut remaining))
                .await
                .unwrap()
                .unwrap(),
            0
        );
    }
}

fn executable() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_grida-agent"));
    command.kill_on_drop(true);
    command
}

fn configured(command: &mut Command, state: &Path, endpoint: &str) {
    command
        .arg("--state-dir")
        .arg(state)
        .args(["--endpoint", endpoint, "--model", "fixture-model"])
        .args(["--credential-env", "GRIDA_AGENT_PROCESS_TEST_KEY"])
        .env("GRIDA_AGENT_PROCESS_TEST_KEY", TEST_CREDENTIAL);
}

fn spawn_serve(state: &Path, endpoint: &str) -> Child {
    let mut command = executable();
    command.args(["serve", "--stdio"]);
    configured(&mut command, state, endpoint);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap()
}

async fn finish_child(child: Child) -> std::process::Output {
    timeout(WAIT, child.wait_with_output())
        .await
        .unwrap()
        .unwrap()
}

fn records(bytes: &[u8]) -> Vec<Value> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

#[tokio::test]
async fn embedded_run_and_restart_inspect_through_built_executable() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Hello from the fixture.")]).await;
    let mut command = executable();
    command.arg("run");
    configured(&mut command, &state, &endpoint.url);
    command
        .arg("--cwd")
        .arg(workspace.path())
        .args(["--prompt", "Hello"]);
    let output = timeout(WAIT, command.output()).await.unwrap().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let output = records(&output.stdout);
    assert_eq!(output.len(), 2);
    assert_eq!(output[0]["kind"], "accepted");
    assert_eq!(output[1]["disposition"], "succeeded");
    assert_eq!(output[1]["account"]["text"], "Hello from the fixture.");
    assert_eq!(output[0]["turn_id"], output[1]["turn_id"]);
    let request = endpoint.request().await;
    assert_eq!(request["model"], "fixture-model");
    assert_eq!(request["stream"], true);
    assert_eq!(request["messages"][1]["content"], "Hello");
    endpoint.done().await;

    let session = output[0]["session_id"].as_str().unwrap();
    let inspected = timeout(
        WAIT,
        executable()
            .arg("inspect")
            .arg("--state-dir")
            .arg(&state)
            .arg(session)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        inspected.status.success(),
        "{}",
        String::from_utf8_lossy(&inspected.stderr)
    );
    let inspected = records(&inspected.stdout);
    assert_eq!(inspected[0]["session_id"], session);
    assert_eq!(inspected[0]["latest"]["outcome"]["status"], "succeeded");
    assert!(inspected[0]["current"].is_null());
    let database = std::fs::read(state.join("runtime.sqlite")).unwrap();
    assert!(
        !database
            .windows(TEST_CREDENTIAL.len())
            .any(|bytes| bytes == TEST_CREDENTIAL.as_bytes())
    );
}

#[tokio::test]
async fn standard_sdk_client_streams_and_reloads_without_starting_work() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Finished("First reply."),
        Reply::Finished("Second reply."),
    ])
    .await;
    let cwd = workspace.path().to_owned();
    let mut first = spawn_serve(&state, &endpoint.url);
    let initial_updates = Arc::new(Mutex::new(Vec::new()));
    let session = timeout(
        WAIT,
        client(initial_updates.clone()).connect_with(
            child_transport(&mut first),
            async |connection| {
                let initialized = connection
                    .send_request(InitializeRequest::new(ProtocolVersion::V1))
                    .block_task()
                    .await?;
                assert_eq!(initialized.protocol_version, ProtocolVersion::V1);
                assert!(initialized.agent_capabilities.load_session);
                assert!(!initialized.agent_capabilities.prompt_capabilities.image);
                let session = connection
                    .send_request(NewSessionRequest::new(cwd.clone()))
                    .block_task()
                    .await?
                    .session_id;
                let prompt = vec![
                    "First prompt".into(),
                    ContentBlock::ResourceLink(ResourceLink::new(
                        "context.txt",
                        "file:///does-not-exist/context.txt",
                    )),
                ];
                let response = connection
                    .send_request(PromptRequest::new(session.clone(), prompt))
                    .block_task()
                    .await?;
                assert_eq!(response.stop_reason, StopReason::EndTurn);
                assert_eq!(
                    visible_text(&initial_updates.lock().unwrap()),
                    ["First reply."]
                );
                Ok(session)
            },
        ),
    )
    .await
    .unwrap()
    .unwrap();
    let first = finish_child(first).await;
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let request = endpoint.request().await;
    assert!(
        request
            .to_string()
            .contains("file:///does-not-exist/context.txt")
    );

    let mut second = spawn_serve(&state, &endpoint.url);
    let replay = Arc::new(Mutex::new(Vec::new()));
    timeout(
        WAIT,
        client(replay.clone()).connect_with(child_transport(&mut second), async |connection| {
            connection
                .send_request(InitializeRequest::new(ProtocolVersion::V1))
                .block_task()
                .await?;
            connection
                .send_request(LoadSessionRequest::new(session.clone(), cwd))
                .block_task()
                .await?;
            let text = visible_text(&replay.lock().unwrap());
            assert!(text[0].starts_with("First prompt"));
            assert!(text[0].contains("file:///does-not-exist/context.txt"));
            assert_eq!(text.last().map(String::as_str), Some("First reply."));
            let response = connection
                .send_request(PromptRequest::new(session, vec!["Second prompt".into()]))
                .block_task()
                .await?;
            assert_eq!(response.stop_reason, StopReason::EndTurn);
            Ok(())
        }),
    )
    .await
    .unwrap()
    .unwrap();
    let second = finish_child(second).await;
    assert!(
        second.status.success(),
        "{}",
        String::from_utf8_lossy(&second.stderr)
    );
    let request = endpoint.request().await;
    assert_eq!(request["messages"].as_array().unwrap().len(), 4);
    assert_eq!(request["messages"][2]["content"], "First reply.");
    assert_eq!(request["messages"][3]["content"], "Second prompt");
    endpoint.done().await;
}

#[tokio::test]
async fn standard_session_cancel_waits_for_durable_stop() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold("Partial answer.")]).await;
    let mut child = spawn_serve(&state, &endpoint.url);
    let (streamed, mut observed) = mpsc::channel(1);
    let session = timeout(
        WAIT,
        Client
            .v1()
            .on_receive_notification(
                async move |notification: SessionNotification, _| {
                    if matches!(notification.update, SessionUpdate::AgentMessageChunk(_)) {
                        let _ = streamed.try_send(());
                    }
                    Ok(())
                },
                on_receive_notification!(),
            )
            .connect_with(child_transport(&mut child), async |connection| {
                connection
                    .send_request(InitializeRequest::new(ProtocolVersion::V1))
                    .block_task()
                    .await?;
                let session = connection
                    .send_request(NewSessionRequest::new(workspace.path()))
                    .block_task()
                    .await?
                    .session_id;
                let pending = connection
                    .send_request(PromptRequest::new(session.clone(), vec!["Wait".into()]));
                assert_eq!(observed.recv().await, Some(()));
                connection.send_notification(CancelNotification::new(session.clone()))?;
                assert_eq!(
                    pending.block_task().await?.stop_reason,
                    StopReason::Cancelled
                );
                Ok(session)
            }),
    )
    .await
    .unwrap()
    .unwrap();
    let child = finish_child(child).await;
    assert!(
        child.status.success(),
        "{}",
        String::from_utf8_lossy(&child.stderr)
    );
    endpoint.request().await;
    endpoint.done().await;
    let inspected = timeout(
        WAIT,
        executable()
            .arg("inspect")
            .arg("--state-dir")
            .arg(&state)
            .arg(session.to_string())
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(
        records(&inspected.stdout)[0]["latest"]["outcome"]["status"],
        "cancelled"
    );
}

#[tokio::test]
async fn oversized_unterminated_stdio_frame_ends_the_connection() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let mut child = spawn_serve(&state, "http://127.0.0.1:1/v1");
    let mut stdin = child.stdin.take().unwrap();
    let _ = timeout(WAIT, stdin.write_all(&vec![b'x'; (1 << 20) + 1]))
        .await
        .unwrap();
    let output = finish_child(child).await;
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("invalid_stdio_frame_length"));
}

fn child_transport(
    child: &mut Child,
) -> ByteStreams<
    tokio_util::compat::Compat<tokio::process::ChildStdin>,
    tokio_util::compat::Compat<tokio::process::ChildStdout>,
> {
    ByteStreams::new(
        child.stdin.take().unwrap().compat_write(),
        child.stdout.take().unwrap().compat(),
    )
}

fn client(
    updates: Arc<Mutex<Vec<SessionNotification>>>,
) -> agent_client_protocol::v1::Builder<
    Client,
    impl agent_client_protocol::HandleDispatchFrom<agent_client_protocol::Agent>,
> {
    Client.v1().on_receive_notification(
        async move |notification: SessionNotification, _| {
            updates.lock().unwrap().push(notification);
            Ok(())
        },
        on_receive_notification!(),
    )
}

fn visible_text(updates: &[SessionNotification]) -> Vec<String> {
    updates
        .iter()
        .filter_map(|notification| match &notification.update {
            SessionUpdate::UserMessageChunk(chunk) | SessionUpdate::AgentMessageChunk(chunk) => {
                match &chunk.content {
                    ContentBlock::Text(text) => Some(text.text.clone()),
                    _ => None,
                }
            }
            _ => None,
        })
        .collect()
}

#[tokio::test]
async fn stdio_eof_suspends_owned_work() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold("Partial answer.")]).await;
    let mut child = spawn_serve(&state, &endpoint.url);
    let (streamed, mut observed) = mpsc::channel(1);
    let session = timeout(
        WAIT,
        Client
            .v1()
            .on_receive_notification(
                async move |notification: SessionNotification, _| {
                    if matches!(notification.update, SessionUpdate::AgentMessageChunk(_)) {
                        let _ = streamed.try_send(());
                    }
                    Ok(())
                },
                on_receive_notification!(),
            )
            .connect_with(child_transport(&mut child), async |connection| {
                connection
                    .send_request(InitializeRequest::new(ProtocolVersion::V1))
                    .block_task()
                    .await?;
                let session = connection
                    .send_request(NewSessionRequest::new(workspace.path()))
                    .block_task()
                    .await?
                    .session_id;
                connection
                    .send_request(PromptRequest::new(session.clone(), vec!["Wait".into()]))
                    .detach();
                assert_eq!(observed.recv().await, Some(()));
                // Closing this foreground drops the supervising process's
                // stdin without sending either kind of cancellation.
                Ok(session)
            }),
    )
    .await
    .unwrap()
    .unwrap();
    let output = finish_child(child).await;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    endpoint.request().await;
    endpoint.done().await;
    let inspected = timeout(
        WAIT,
        executable()
            .arg("inspect")
            .arg("--state-dir")
            .arg(&state)
            .arg(session.to_string())
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        inspected.status.success(),
        "{}",
        String::from_utf8_lossy(&inspected.stderr)
    );
    let records = records(&inspected.stdout);
    assert_eq!(records[0]["current"]["disposition"], "suspended");
    assert_eq!(records[0]["current"]["controls"]["paused"], true);
}

#[tokio::test]
async fn acp_uses_standard_stop_reasons_for_token_limits_and_refusals() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint =
        Endpoint::start(vec![Reply::Stop("length"), Reply::Stop("content_filter")]).await;
    let mut child = spawn_serve(&state, &endpoint.url);
    timeout(
        WAIT,
        Client
            .v1()
            .connect_with(child_transport(&mut child), async |connection| {
                connection
                    .send_request(InitializeRequest::new(ProtocolVersion::V1))
                    .block_task()
                    .await?;
                let session = connection
                    .send_request(NewSessionRequest::new(workspace.path()))
                    .block_task()
                    .await?
                    .session_id;
                for expected in [StopReason::MaxTokens, StopReason::Refusal] {
                    let response = connection
                        .send_request(PromptRequest::new(session.clone(), vec!["Respond".into()]))
                        .block_task()
                        .await?;
                    assert_eq!(response.stop_reason, expected);
                }
                Ok(())
            }),
    )
    .await
    .unwrap()
    .unwrap();
    let output = finish_child(child).await;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    endpoint.request().await;
    endpoint.request().await;
    endpoint.done().await;
}

#[tokio::test]
async fn malformed_json_returns_a_bounded_error_without_echoing_input() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let mut child = spawn_serve(&state, "http://127.0.0.1:1/v1");
    let mut stdin = child.stdin.take().unwrap();
    stdin
        .write_all(b"{\"fixture-untrusted-payload\":broken}\n")
        .await
        .unwrap();
    stdin
        .write_all(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":1}}\n")
        .await
        .unwrap();
    drop(stdin);
    let output = finish_child(child).await;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(!String::from_utf8_lossy(&output.stdout).contains("fixture-untrusted-payload"));
    let output = records(&output.stdout);
    assert_eq!(output[0]["error"]["code"], -32700);
    assert_eq!(output[1]["result"]["protocolVersion"], 1);
}

#[tokio::test]
async fn stdio_rejects_an_excessive_request_burst() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let mut child = spawn_serve(&state, "http://127.0.0.1:1/v1");
    let mut stdin = child.stdin.take().unwrap();
    let burst = (0..32)
        .map(|id| format!("{{\"jsonrpc\":\"2.0\",\"id\":{id},\"method\":\"_unknown\"}}\n"))
        .collect::<String>();
    stdin.write_all(burst.as_bytes()).await.unwrap();
    let output = finish_child(child).await;
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("too_many_outstanding_requests"));
}

#[tokio::test]
async fn dropping_admission_waiter_leaves_the_worker_under_host_ownership() {
    use agent_kit_core::ModelId;
    use agent_kit_sessions::TurnDisposition;
    use grida_agent::ProviderOptions;
    use grida_agent::host::{Host, PromptPart, PromptRequest, change_id};

    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start_with_credential(vec![Reply::Hold("Working.")], None).await;
    let host = Host::open(
        &temporary.path().join("agent-state"),
        Some(ProviderOptions {
            endpoint: endpoint.url.clone(),
            model: ModelId::new("fixture-model").unwrap(),
            credential_env: None,
            max_output_tokens: 1024,
        }),
    )
    .unwrap();
    let session = host.new_session(workspace.path().into()).await.unwrap();
    {
        let mut admission = std::pin::pin!(host.start_prompt(PromptRequest {
            id: change_id().unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Continue work".into()
            }],
        }));
        // The current-thread executor cannot run the registered worker during
        // this poll. Drop the request before its first durable admission step.
        assert!(futures_util::poll!(&mut admission).is_pending());
    }
    endpoint.request().await;
    timeout(WAIT, host.shutdown()).await.unwrap().unwrap();
    let view = host.inspect(session).await.unwrap();
    assert_eq!(
        view.current.unwrap().disposition,
        TurnDisposition::Suspended
    );
    endpoint.done().await;
}

#[cfg(unix)]
#[tokio::test]
async fn signal_stops_an_accepted_run_and_writes_its_verified_final_disposition() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold("Working.")]).await;
    let mut command = executable();
    command.arg("run");
    configured(&mut command, &state, &endpoint.url);
    let mut child = command
        .arg("--cwd")
        .arg(workspace.path())
        .args(["--prompt", "Wait"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    let mut accepted = String::new();
    timeout(WAIT, stdout.read_line(&mut accepted))
        .await
        .unwrap()
        .unwrap();
    let accepted: Value = serde_json::from_str(&accepted).unwrap();
    assert_eq!(accepted["kind"], "accepted");
    endpoint.request().await;
    let signal = Command::new("kill")
        .args(["-TERM", &child.id().unwrap().to_string()])
        .status()
        .await
        .unwrap();
    assert!(signal.success());
    let mut final_output = Vec::new();
    timeout(WAIT, stdout.read_to_end(&mut final_output))
        .await
        .unwrap()
        .unwrap();
    let output = finish_child(child).await;
    assert_eq!(
        output.status.code(),
        Some(130),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result = records(&final_output);
    assert_eq!(result[0]["kind"], "finished");
    assert_eq!(result[0]["disposition"], "cancelled");
    assert_eq!(result[0]["turn_id"], accepted["turn_id"]);
    endpoint.done().await;

    let output = timeout(
        WAIT,
        executable()
            .arg("inspect")
            .arg("--state-dir")
            .arg(&state)
            .arg(accepted["session_id"].as_str().unwrap())
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        records(&output.stdout)[0]["latest"]["outcome"]["status"],
        "cancelled"
    );
}
