#[cfg(any(target_os = "macos", target_os = "linux"))]
#[path = "process/approvals.rs"]
mod approvals;
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::v1::schema::{
    CancelNotification, ContentBlock, InitializeRequest, LoadSessionRequest, NewSessionRequest,
    PromptRequest, ResourceLink, SessionNotification, SessionUpdate, StopReason,
};
use agent_client_protocol::{ByteStreams, Client, on_receive_notification};
use grida_agent::ProviderProtocol;
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

#[cfg(unix)]
#[path = "process/compaction.rs"]
mod compaction;
#[cfg(unix)]
#[path = "process/configuration_tools.rs"]
mod configuration_tools;
#[cfg(unix)]
#[path = "process/goals.rs"]
mod goals;
#[cfg(unix)]
#[path = "process/history.rs"]
mod history;
#[cfg(any(target_os = "macos", target_os = "linux"))]
#[path = "process/images.rs"]
mod images;
#[cfg(unix)]
#[path = "process/lifecycle.rs"]
mod lifecycle;
#[cfg(unix)]
#[path = "process/questions.rs"]
mod questions;
#[path = "process/responses.rs"]
mod responses;
#[cfg(unix)]
#[path = "process/skills.rs"]
mod skills;

const WAIT: Duration = Duration::from_secs(15);
const TEST_CREDENTIAL: &str = "fixture-only-bearer-token";

struct Endpoint {
    url: String,
    requests: mpsc::UnboundedReceiver<Value>,
    task: tokio::task::JoinHandle<()>,
}

enum Reply {
    Finished(&'static str),
    InputCount(u64),
    Hold(&'static str),
    Stop(&'static str),
    #[cfg(unix)]
    Question(&'static str),
    #[cfg(unix)]
    Tool(&'static str, &'static str),
    #[cfg(unix)]
    QuestionThenHold(tokio::sync::oneshot::Receiver<()>),
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    GeminiSigned(&'static str),
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    ResponsesSigned(&'static str),
    #[cfg(unix)]
    Release(&'static str, tokio::sync::oneshot::Receiver<()>),
}

impl Endpoint {
    async fn start(replies: Vec<Reply>) -> Self {
        Self::start_with_credential(replies, Some(TEST_CREDENTIAL)).await
    }

    async fn start_with_credential(replies: Vec<Reply>, credential: Option<&'static str>) -> Self {
        Self::start_protocol(ProviderProtocol::OpenAiCompatible, replies, credential).await
    }

    async fn start_protocol(
        protocol: ProviderProtocol,
        replies: Vec<Reply>,
        credential: Option<&'static str>,
    ) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let version = if protocol == ProviderProtocol::Gemini {
            "v1beta"
        } else {
            "v1"
        };
        let url = format!("http://{}/{version}", listener.local_addr().unwrap());
        let (sent, requests) = mpsc::unbounded_channel();
        let task = tokio::spawn(async move {
            let mut connections = tokio::task::JoinSet::new();
            for reply in replies {
                let (stream, _) = timeout(WAIT, listener.accept()).await.unwrap().unwrap();
                let sent = sent.clone();
                connections.spawn(async move {
                    fixture_request(stream, &sent, reply, protocol, credential).await;
                });
            }
            while let Some(result) = connections.join_next().await {
                result.unwrap();
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
    protocol: ProviderProtocol,
    credential: Option<&str>,
) {
    let mut stream = BufReader::new(stream);
    let mut line = String::new();
    stream.read_line(&mut line).await.unwrap();
    let path = match protocol {
        ProviderProtocol::OpenAiCompatible => "/v1/chat/completions",
        ProviderProtocol::Responses if matches!(&reply, Reply::InputCount(_)) => {
            "/v1/responses/input_tokens"
        }
        ProviderProtocol::Responses => "/v1/responses",
        ProviderProtocol::Anthropic => "/v1/messages",
        ProviderProtocol::Gemini => "/v1beta/models/fixture-model:streamGenerateContent?alt=sse",
    };
    assert_eq!(line, format!("POST {path} HTTP/1.1\r\n"));
    let mut length = None;
    let mut authorization = None;
    let mut anthropic_version = None;
    let mut accept = None;
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
        if ["authorization", "x-api-key", "x-goog-api-key"]
            .into_iter()
            .any(|name| key.eq_ignore_ascii_case(name))
        {
            assert!(authorization.is_none());
            authorization = Some((key.to_ascii_lowercase(), value.trim().to_owned()));
        }
        if key.eq_ignore_ascii_case("anthropic-version") {
            anthropic_version = Some(value.trim().to_owned());
        }
        if key.eq_ignore_ascii_case("accept") {
            accept = Some(value.trim().to_owned());
        }
    }
    assert_eq!(
        authorization,
        credential.map(|value| match protocol {
            ProviderProtocol::OpenAiCompatible | ProviderProtocol::Responses =>
                ("authorization".into(), format!("Bearer {value}")),
            ProviderProtocol::Anthropic => ("x-api-key".into(), value.into()),
            ProviderProtocol::Gemini => ("x-goog-api-key".into(), value.into()),
        })
    );
    if protocol == ProviderProtocol::Anthropic {
        assert_eq!(anthropic_version.as_deref(), Some("2023-06-01"));
    }
    let mut request = vec![0; length.unwrap()];
    stream.read_exact(&mut request).await.unwrap();
    sent.send(serde_json::from_slice(&request).unwrap())
        .unwrap();
    if let Reply::InputCount(tokens) = reply {
        assert_eq!(protocol, ProviderProtocol::Responses);
        assert_eq!(accept.as_deref(), Some("application/json"));
        let body = json!({"object":"response.input_tokens","input_tokens":tokens}).to_string();
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream
            .get_mut()
            .write_all(response.as_bytes())
            .await
            .unwrap();
        return;
    }
    #[cfg(unix)]
    let (reply, delayed_done) = match reply {
        Reply::Release(text, ready) => {
            timeout(WAIT, ready).await.unwrap().unwrap();
            (Reply::Finished(text), None)
        }
        Reply::QuestionThenHold(ready) => (Reply::Question("question"), Some(ready)),
        reply => (reply, None),
    };
    let hold = matches!(reply, Reply::Hold(_));
    let body = fixture_body(reply, protocol);
    let advertised_length = if hold { 1 << 20 } else { body.len() };
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {advertised_length}\r\nConnection: close\r\nX-Request-Id: fixture-request\r\n\r\n"
    );
    let mut stream = stream.into_inner();
    stream.write_all(head.as_bytes()).await.unwrap();
    #[cfg(unix)]
    if let Some(ready) = delayed_done {
        let prefix = body.strip_suffix("data: [DONE]\n\n").unwrap();
        stream.write_all(prefix.as_bytes()).await.unwrap();
        stream.flush().await.unwrap();
        timeout(WAIT, ready).await.unwrap().unwrap();
        stream.write_all(b"data: [DONE]\n\n").await.unwrap();
        return;
    }
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

fn fixture_body(reply: Reply, protocol: ProviderProtocol) -> String {
    let mut signed = false;
    let (text, finish) = match reply {
        Reply::Finished(text) => (text, Some("stop")),
        Reply::Hold(text) => (text, None),
        Reply::Stop(reason) => ("", Some(reason)),
        Reply::InputCount(_) => unreachable!("count responses use the JSON endpoint"),
        #[cfg(unix)]
        Reply::Tool(name, arguments) => {
            assert_eq!(protocol, ProviderProtocol::OpenAiCompatible);
            return fixture_tool_body(name, arguments);
        }
        #[cfg(unix)]
        Reply::Question(name) => {
            assert_eq!(protocol, ProviderProtocol::OpenAiCompatible);
            let arguments = json!({"question":"Which edition?", "options":["Screen", "Print"]});
            return fixture_tool_body(name, &arguments.to_string());
        }
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        Reply::GeminiSigned(text) => {
            signed = true;
            (text, Some("stop"))
        }
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        Reply::ResponsesSigned(text) => {
            assert_eq!(protocol, ProviderProtocol::Responses);
            signed = true;
            (text, Some("stop"))
        }
        #[cfg(unix)]
        Reply::Release(..) | Reply::QuestionThenHold(_) => {
            unreachable!("fixture releases the response before encoding")
        }
    };
    let mut output = String::new();
    let mut frame = |event: Value| {
        use std::fmt::Write as _;
        write!(output, "data: {event}\n\n").unwrap();
    };
    match protocol {
        ProviderProtocol::Responses => {
            if finish.is_none() {
                frame(
                    json!({"type":"response.output_text.delta", "item_id":"message-fixture", "delta":text}),
                );
                return output;
            }
            assert_eq!(finish, Some("stop"));
            let mut index = 0;
            if signed {
                frame(
                    json!({"type":"response.output_item.done", "output_index":index, "item":{
                        "type":"reasoning", "id":"reasoning-fixture", "summary":[],
                        "encrypted_content":"retained-private-reasoning"
                    }}),
                );
                index += 1;
            }
            frame(
                json!({"type":"response.output_text.delta", "item_id":"message-fixture", "delta":text}),
            );
            frame(
                json!({"type":"response.output_item.done", "output_index":index, "item":{
                    "type":"message", "id":"message-fixture", "role":"assistant", "status":"completed",
                    "content":[{"type":"output_text", "text":text, "annotations":[]}]
                }}),
            );
            frame(json!({"type":"response.completed", "response":{
                "status":"completed", "usage":{"input_tokens":5,"output_tokens":3}
            }}));
        }
        ProviderProtocol::OpenAiCompatible => {
            frame(json!({
                "id": "fixture-response",
                "choices": [{"index":0,"delta":{"role":"assistant","content":text},"finish_reason":null}],
            }));
            if let Some(reason) = finish {
                frame(json!({
                    "id": "fixture-response",
                    "choices": [{"index":0,"delta":{},"finish_reason":reason}],
                }));
                output.push_str("data: [DONE]\n\n");
            }
        }
        ProviderProtocol::Anthropic => {
            assert!(finish.is_some());
            frame(
                json!({"type":"message_start","message":{"role":"assistant","content":[],"usage":{"input_tokens":5,"output_tokens":0}}}),
            );
            frame(
                json!({"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}),
            );
            frame(
                json!({"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":text}}),
            );
            frame(json!({"type":"content_block_stop","index":0}));
            frame(
                json!({"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}),
            );
            frame(json!({"type":"message_stop"}));
        }
        ProviderProtocol::Gemini => {
            assert!(finish.is_some());
            let mut part = json!({"text":text});
            if signed {
                part["thoughtSignature"] = "c2lnbg==".into();
            }
            frame(json!({
                "responseId":"fixture-response",
                "candidates":[{"index":0,"content":{"role":"model","parts":[part]},"finishReason":"STOP"}],
                "usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3},
            }));
        }
    }
    output
}

#[cfg(unix)]
fn fixture_tool_body(name: &str, arguments: &str) -> String {
    let delta = json!({"id":"fixture-response", "choices":[{"index":0,"delta":{
        "role":"assistant", "tool_calls":[{"index":0,"id":"fixture-call","type":"function",
        "function":{"name":name,"arguments":arguments}}]
    },"finish_reason":null}]});
    let finish = json!({"id":"fixture-response","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]});
    format!("data: {delta}\n\ndata: {finish}\n\ndata: [DONE]\n\n")
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
            protocol: ProviderProtocol::OpenAiCompatible,
            credential_home: None,
            compatible_output_limit_field: None,
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
            questions: false,
            configuration_permission: grida_agent::ConfigurationPermission::Disabled,
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

#[cfg(unix)]
#[tokio::test]
async fn slow_stdio_output_is_bounded_and_preserves_owned_work() {
    use std::os::fd::OwnedFd;
    use std::os::unix::net::UnixStream;

    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let text = std::str::from_utf8(&[b'x'; 64 * 1024]).unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold(text)]).await;
    let (reader, writer) = UnixStream::pair().unwrap();
    socket2::SockRef::from(&writer)
        .set_send_buffer_size(4096)
        .unwrap();
    reader.set_nonblocking(true).unwrap();
    let mut stdout = BufReader::new(tokio::net::UnixStream::from_std(reader).unwrap());
    let mut command = executable();
    command.args(["serve", "--stdio"]);
    configured(&mut command, &state, &endpoint.url);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::from(OwnedFd::from(writer)))
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let initialize =
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}});
    let new = json!({
        "jsonrpc":"2.0","id":2,"method":"session/new",
        "params":{"cwd":workspace.path(),"mcpServers":[]},
    });
    let mut line = String::new();
    for request in [initialize, new] {
        timeout(WAIT, stdin.write_all(format!("{request}\n").as_bytes()))
            .await
            .unwrap()
            .unwrap();
        line.clear();
        timeout(WAIT, stdout.read_line(&mut line))
            .await
            .unwrap()
            .unwrap();
    }
    let response: Value = serde_json::from_str(&line).unwrap();
    let session = response["result"]["sessionId"].as_str().unwrap();
    let prompt = json!({
        "jsonrpc":"2.0","id":3,"method":"session/prompt",
        "params":{"sessionId":session,"prompt":[{"type":"text","text":"Work"}]},
    });
    timeout(WAIT, stdin.write_all(format!("{prompt}\n").as_bytes()))
        .await
        .unwrap()
        .unwrap();
    endpoint.request().await;
    // Keep stdin connected and deliberately stop draining stdout.
    let output = finish_child(child).await;
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("stdio_write_timeout"));
    endpoint.done().await;
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
    assert_eq!(
        records(&inspected.stdout)[0]["current"]["disposition"],
        "suspended"
    );
}

#[cfg(unix)]
#[tokio::test]
async fn authenticated_websocket_detach_retry_snapshot_and_stop_are_independent() {
    use tokio_tungstenite::tungstenite::{Error as WebSocketError, http::StatusCode};

    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Hold("Working.")]).await;
    let (mut child, url) = shared_server(&state, &endpoint.url).await;
    for (token, origin, authority, status) in [
        (None, None, None, StatusCode::UNAUTHORIZED),
        (Some("wrong"), None, None, StatusCode::UNAUTHORIZED),
        (
            Some(SERVER_TOKEN),
            Some("https://invalid.example"),
            None,
            StatusCode::FORBIDDEN,
        ),
        (
            Some(SERVER_TOKEN),
            None,
            Some("invalid.example"),
            StatusCode::FORBIDDEN,
        ),
    ] {
        let result = connect_shared(&url, token, origin, authority).await;
        assert!(
            matches!(result, Err(WebSocketError::Http(ref response)) if response.status() == status)
        );
    }

    let mut first = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    let initialized = ws_rpc(&mut first, 1, "initialize", extension_initialize()).await;
    assert_eq!(
        initialized["result"]["agentCapabilities"]["_meta"]["co.grida/session/submit"],
        1
    );
    let created = ws_rpc(
        &mut first,
        2,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let submit = json!({
        "sessionId":session,
        "inputId":"user-input-a",
        "prompt":[{"type":"text","text":"Work"}],
    });
    let accepted = ws_rpc(&mut first, 3, "_co.grida/session/submit", submit.clone()).await;
    let turn = accepted["result"]["turnId"].as_str().unwrap();
    assert_eq!(accepted["result"]["disposition"], "claimed");
    endpoint.request().await;
    let retry = ws_rpc(&mut first, 4, "_co.grida/session/submit", submit.clone()).await;
    assert_eq!(retry["result"], accepted["result"]);
    let changed = ws_rpc(
        &mut first,
        5,
        "_co.grida/session/submit",
        json!({"sessionId":session,"inputId":"user-input-a","prompt":[{"type":"text","text":"Changed"}]}),
    )
    .await;
    assert_eq!(changed["error"]["data"], "submission_input_changed");
    let busy = ws_rpc(
        &mut first,
        6,
        "_co.grida/session/submit",
        json!({"sessionId":session,"inputId":"other","prompt":[{"type":"text","text":"Another"}]}),
    )
    .await;
    assert_eq!(busy["error"]["data"], "session_prompt_in_progress");
    drop(first);

    let mut second = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    ws_rpc(&mut second, 1, "initialize", extension_initialize()).await;
    let observation = json!({"sessionId":session});
    let denied = ws_rpc(
        &mut second,
        2,
        "_co.grida/session/snapshot",
        observation.clone(),
    )
    .await;
    assert_eq!(denied["error"]["data"], "session_setup_required");
    let loaded = ws_rpc(
        &mut second,
        3,
        "session/load",
        json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    assert!(loaded.get("result").is_some(), "{loaded}");
    let running = ws_rpc(
        &mut second,
        4,
        "_co.grida/session/snapshot",
        observation.clone(),
    )
    .await;
    assert_eq!(running["result"]["current"]["disposition"], "running");
    assert_eq!(running["result"]["current"]["paused"], false);
    assert_eq!(running["result"]["current"]["turnId"], turn);
    assert_eq!(running["result"]["queuedInputs"], 0);
    let configured = ws_rpc(
        &mut second,
        5,
        "_co.grida/config/update",
        json!({"expectedRevision":null,"change":{"operation":"set_context_max_input_tokens","value":1024}}),
    )
    .await;
    assert_eq!(
        configured["result"]["defaults"]["context"]["max_input_tokens"],
        1024
    );
    let retry = ws_rpc(&mut second, 6, "_co.grida/session/submit", submit.clone()).await;
    assert_eq!(retry["result"], accepted["result"]);
    let stop = json!({
        "sessionId":session,
        "turnId":turn,
        "requestId":"stop-a",
        "expectedSessionRevision":running["result"]["sessionRevision"],
        "expectedControlRevision":running["result"]["current"]["controlRevision"],
    });
    let stopped = ws_rpc(&mut second, 7, "_co.grida/session/stop", stop.clone()).await;
    assert_eq!(stopped["result"]["requestId"], "stop-a");
    endpoint.done().await;
    let settled = timeout(WAIT, async {
        let mut id = 8;
        loop {
            let snapshot = ws_rpc(
                &mut second,
                id,
                "_co.grida/session/snapshot",
                observation.clone(),
            )
            .await;
            if snapshot["result"]["current"].is_null() {
                break snapshot;
            }
            id += 1;
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(settled["result"]["latest"]["status"], "cancelled");
    assert_eq!(settled["result"]["admissionPaused"], true);
    let replayed_stop = ws_rpc(&mut second, 100, "_co.grida/session/stop", stop).await;
    assert_eq!(replayed_stop["result"], stopped["result"]);
    let retried_after_stop = ws_rpc(&mut second, 101, "_co.grida/session/submit", submit).await;
    assert_eq!(retried_after_stop["result"]["disposition"], "completed");
    assert_eq!(retried_after_stop["result"]["turnId"], turn);
    let paused = ws_rpc(
        &mut second,
        102,
        "_co.grida/session/submit",
        json!({"sessionId":session,"inputId":"after-stop","prompt":[{"type":"text","text":"Paused"}]}),
    )
    .await;
    assert_eq!(paused["error"]["data"], "session_admission_paused");
    let new_session = ws_rpc(
        &mut second,
        103,
        "session/new",
        json!({"cwd":workspace.path(),"mcpServers":[]}),
    )
    .await;
    let next = ws_rpc(
        &mut second,
        104,
        "session/prompt",
        json!({"sessionId":new_session["result"]["sessionId"],"prompt":[{"type":"text","text":"Use the new default"}]}),
    )
    .await;
    assert_eq!(
        next["error"]["data"], "input_measurement_unavailable",
        "{next}"
    );
    drop(second);

    let mut plain = connect_shared(&url, Some(SERVER_TOKEN), None, None)
        .await
        .unwrap();
    ws_rpc(&mut plain, 1, "initialize", json!({"protocolVersion":1})).await;
    let not_negotiated = ws_rpc(&mut plain, 2, "_co.grida/config/inspect", json!({})).await;
    assert_eq!(not_negotiated["error"]["code"], -32601);
    drop(plain);
    let status = Command::new("kill")
        .args(["-TERM", &child.id().unwrap().to_string()])
        .status()
        .await
        .unwrap();
    assert!(status.success());
    assert_eq!(
        timeout(WAIT, child.wait()).await.unwrap().unwrap().code(),
        Some(130)
    );
}

#[cfg(unix)]
const SERVER_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[cfg(unix)]
type SharedSocket = tokio_tungstenite::WebSocketStream<TcpStream>;

#[cfg(unix)]
async fn shared_server(state: &Path, endpoint: &str) -> (Child, String) {
    shared_server_with_credential(state, endpoint, TEST_CREDENTIAL).await
}

#[cfg(unix)]
async fn shared_server_with_credential(
    state: &Path,
    endpoint: &str,
    credential: &str,
) -> (Child, String) {
    shared_server_with_profile(state, endpoint, credential, None).await
}

#[cfg(unix)]
async fn shared_server_with_profile(
    state: &Path,
    endpoint: &str,
    credential: &str,
    profile: Option<&Path>,
) -> (Child, String) {
    let mut command = executable();
    command
        .args([
            "serve",
            "--listen",
            "ws://127.0.0.1:0/acp",
            "--server-token-env",
            "GRIDA_AGENT_FIXTURE_SERVER_TOKEN",
        ])
        .env("GRIDA_AGENT_FIXTURE_SERVER_TOKEN", SERVER_TOKEN);
    configured(&mut command, state, endpoint);
    if let Some(profile) = profile {
        command.arg("--permission-profile").arg(profile);
    }
    command.env("GRIDA_AGENT_PROCESS_TEST_KEY", credential);
    spawn_shared_server(command).await
}

#[cfg(unix)]
async fn spawn_shared_server(mut command: Command) -> (Child, String) {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stderr = BufReader::new(child.stderr.take().unwrap());
    let mut line = String::new();
    timeout(WAIT, stderr.read_line(&mut line))
        .await
        .unwrap()
        .unwrap();
    let url = line
        .trim()
        .strip_prefix("grida-agent: ACP listening on ")
        .unwrap_or_else(|| panic!("unexpected startup output: {line}"));
    child.stderr = Some(stderr.into_inner());
    (child, url.into())
}

#[cfg(unix)]
async fn connect_shared(
    url: &str,
    token: Option<&str>,
    origin: Option<&str>,
    authority: Option<&str>,
) -> Result<SharedSocket, tokio_tungstenite::tungstenite::Error> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::http::header;

    let mut request = url.into_client_request().unwrap();
    let socket_address = request.uri().authority().unwrap().to_string();
    if let Some(token) = token {
        request.headers_mut().insert(
            header::AUTHORIZATION,
            format!("Bearer {token}").parse().unwrap(),
        );
    }
    if let Some(origin) = origin {
        request
            .headers_mut()
            .insert(header::ORIGIN, origin.parse().unwrap());
    }
    if let Some(authority) = authority {
        request
            .headers_mut()
            .insert(header::HOST, authority.parse().unwrap());
    }
    timeout(WAIT, async {
        let stream = TcpStream::connect(socket_address).await.unwrap();
        tokio_tungstenite::client_async(request, stream)
            .await
            .map(|(socket, _)| socket)
    })
    .await
    .unwrap()
}

#[cfg(unix)]
async fn ws_rpc(socket: &mut SharedSocket, id: u64, method: &str, params: Value) -> Value {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    timeout(WAIT, async {
        let request = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        socket
            .send(Message::Text(request.to_string().into()))
            .await
            .unwrap();
        loop {
            let frame = socket.next().await.unwrap().unwrap();
            if let Message::Text(line) = frame {
                let reply: Value = serde_json::from_str(line.as_str()).unwrap();
                if reply["id"] == id {
                    return reply;
                }
            }
        }
    })
    .await
    .unwrap()
}

#[cfg(unix)]
fn extension_initialize() -> Value {
    json!({
        "protocolVersion":1,
        "clientCapabilities":{"_meta":{
            "co.grida/session/submit":1,
            "co.grida/session/snapshot":1,
            "co.grida/session/stop":1,
            "co.grida/session/enqueue":1,
            "co.grida/session/input":1,
            "co.grida/session/replace":1,
            "co.grida/session/withdraw":1,
            "co.grida/session/reorder":1,
            "co.grida/session/resume-queue":1,
            "co.grida/session/steer":1,
            "co.grida/session/pause":1,
            "co.grida/session/resume":1,
            "co.grida/session/history":1,
            "co.grida/session/fork":1,
            "co.grida/session/revise":1,
            "co.grida/config/inspect":1,
            "co.grida/config/update":1,
            "co.grida/config/reload":1
        }}
    })
}

#[tokio::test]
async fn retry_reports_a_previously_accepted_unclaimed_input_without_starting_it() {
    use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
    use agent_kit_core::{ChangeId, Envelope, MessageId, ModelId, SchemaId};
    use agent_kit_sessions::{InputDisposition, SessionStore, Submission};
    use agent_kit_store_sqlite::SqliteStore;
    use grida_agent::ProviderOptions;
    use grida_agent::host::{Host, PromptPart, PromptRequest};

    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let options = || ProviderOptions {
        protocol: ProviderProtocol::OpenAiCompatible,
        credential_home: None,
        compatible_output_limit_field: None,
        endpoint: "http://127.0.0.1:1/v1".into(),
        model: ModelId::new("fixture-model").unwrap(),
        credential_env: None,
        max_output_tokens: 1024,
    };
    let host = Host::open(&state, Some(options())).unwrap();
    let session = host.new_session(workspace.path().into()).await.unwrap();
    drop(host);
    let store = SqliteStore::open(state.join("runtime.sqlite")).unwrap();
    let id = ChangeId::new("accepted-before-interruption").unwrap();
    let recorded = vec![Message {
        id: MessageId::new("input/accepted-before-interruption").unwrap(),
        role: Role::User,
        phase: None,
        content: vec![Content::Text("Keep this input".into())],
        provenance: Provenance {
            source: "native-client".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    }];
    let accepted = store
        .submit(
            session.clone(),
            Submission {
                id: id.clone(),
                payload: Envelope::new(
                    SchemaId::new("grida.agent.native.input").unwrap(),
                    1,
                    serde_json::to_vec(&recorded).unwrap(),
                )
                .unwrap(),
            },
        )
        .await
        .unwrap();
    drop(store);

    let host = Host::open(&state, Some(options())).unwrap();
    let receipt = host
        .submit_prompt(PromptRequest {
            id,
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Keep this input".into(),
            }],
            questions: false,
            configuration_permission: grida_agent::ConfigurationPermission::Disabled,
        })
        .await
        .unwrap();
    assert_eq!(receipt.position, accepted.position);
    assert_eq!(receipt.disposition, InputDisposition::Queued);
    let snapshot = host.inspect(session).await.unwrap();
    assert!(snapshot.current.is_none());
    assert_eq!(snapshot.queued.len(), 1);
    host.shutdown().await.unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn abrupt_host_exit_retains_interrupted_turn_and_blocks_replacement() {
    use std::os::unix::process::ExitStatusExt;

    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![
        Reply::Hold("Started."),
        Reply::Finished("Unexpected replacement."),
    ])
    .await;
    let mut child = spawn_serve(&state, &endpoint.url);
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    let session = timeout(WAIT, async {
        let setup = [
            json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}),
            json!({
                "jsonrpc":"2.0","id":2,"method":"session/new",
                "params":{"cwd":workspace.path(),"mcpServers":[]},
            }),
        ];
        let mut line = String::new();
        for request in setup {
            stdin
                .write_all(format!("{request}\n").as_bytes())
                .await
                .unwrap();
            line.clear();
            assert_ne!(stdout.read_line(&mut line).await.unwrap(), 0);
        }
        let created: Value = serde_json::from_str(&line).unwrap();
        let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
        let prompt = json!({
            "jsonrpc":"2.0","id":3,"method":"session/prompt",
            "params":{"sessionId":session,"prompt":[{"type":"text","text":"Hold"}]},
        });
        stdin
            .write_all(format!("{prompt}\n").as_bytes())
            .await
            .unwrap();
        loop {
            line.clear();
            assert_ne!(stdout.read_line(&mut line).await.unwrap(), 0);
            let update: Value = serde_json::from_str(&line).unwrap();
            if update["params"]["update"]["sessionUpdate"] == "agent_message_chunk" {
                assert_eq!(update["params"]["update"]["content"]["text"], "Started.");
                break;
            }
            assert_ne!(update["id"], 3, "{update}");
        }
        session
    })
    .await
    .unwrap();
    assert_eq!(endpoint.request().await["messages"][1]["content"], "Hold");

    // Leave the supervising pipes open to force abrupt loss rather than the
    // orderly EOF path that asks the host to suspend its work.
    child.start_kill().unwrap();
    let output = finish_child(child).await;
    assert_eq!(output.status.signal(), Some(9));

    let inspect = || {
        let mut command = executable();
        command
            .arg("inspect")
            .arg("--state-dir")
            .arg(&state)
            .arg(&session);
        command
    };
    let interrupted = timeout(WAIT, inspect().output()).await.unwrap().unwrap();
    assert!(
        interrupted.status.success(),
        "{}",
        String::from_utf8_lossy(&interrupted.stderr)
    );
    let original = records(&interrupted.stdout);
    let current = &original[0]["current"];
    assert_eq!(current["disposition"], "interrupted");
    assert!(current["outcome"].is_null());

    let mut replacement = executable();
    replacement.arg("run");
    configured(&mut replacement, &state, &endpoint.url);
    replacement
        .arg("--cwd")
        .arg(workspace.path())
        .arg("--session")
        .arg(&session)
        .args(["--prompt", "Do not start a replacement"]);
    let refused = timeout(WAIT, replacement.output()).await.unwrap().unwrap();
    assert_eq!(refused.status.code(), Some(1));
    assert!(refused.stdout.is_empty());
    assert!(String::from_utf8_lossy(&refused.stderr).contains("session_turn_requires_recovery"));
    let retained = timeout(WAIT, inspect().output()).await.unwrap().unwrap();
    assert_eq!(records(&retained.stdout)[0]["current"], *current);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    endpoint.task.abort();
    let _ = endpoint.task.await;
}

#[tokio::test]
async fn built_anthropic_host_uses_native_headers_body_and_stream() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Anthropic,
        vec![Reply::Finished("Anthropic reply.")],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut command = executable();
    command.args(["run", "--provider", "anthropic"]);
    configured(
        &mut command,
        &state,
        &endpoint.url.replace("127.0.0.1", "localhost"),
    );
    command
        .arg("--cwd")
        .arg(workspace.path())
        .args(["--prompt", "Use the native route"]);
    let output = timeout(WAIT, command.output()).await.unwrap().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let output = records(&output.stdout);
    assert_eq!(output[1]["account"]["text"], "Anthropic reply.");
    let request = endpoint.request().await;
    assert_eq!(request["stream"], true);
    assert_eq!(request["max_tokens"], 4096);
    assert_eq!(
        request["messages"][0]["content"][0]["text"],
        "Use the native route"
    );
    endpoint.done().await;
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tokio::test]
async fn built_gemini_host_replays_signed_history_only_for_unchanged_credentials() {
    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Gemini,
        vec![
            Reply::GeminiSigned("Signed response."),
            Reply::Finished("Continued response."),
            Reply::Finished("Unexpected response."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let run = |session: Option<&str>, prompt: &str, credential: &str| {
        let mut command = executable();
        command.args(["run", "--provider", "gemini"]);
        configured(&mut command, &state, &endpoint.url);
        command
            .env("GRIDA_AGENT_PROCESS_TEST_KEY", credential)
            .arg("--cwd")
            .arg(workspace.path())
            .args(["--prompt", prompt]);
        if let Some(session) = session {
            command.args(["--session", session, "--max-output-tokens", "2048"]);
        }
        command
    };
    let first = timeout(WAIT, run(None, "First", TEST_CREDENTIAL).output())
        .await
        .unwrap()
        .unwrap();
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let first = records(&first.stdout);
    let session = first[0]["session_id"].as_str().unwrap();
    assert_eq!(first[1]["account"]["text"], "Signed response.");
    let second = timeout(WAIT, run(Some(session), "Second", TEST_CREDENTIAL).output())
        .await
        .unwrap()
        .unwrap();
    assert!(
        second.status.success(),
        "{}",
        String::from_utf8_lossy(&second.stderr)
    );
    assert_eq!(
        records(&second.stdout)[1]["account"]["text"],
        "Continued response."
    );
    let rotated = timeout(
        WAIT,
        run(Some(session), "Do not replay", "changed-fixture-token").output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(rotated.status.code(), Some(1));
    let rotated = records(&rotated.stdout);
    assert_eq!(
        rotated[1]["account"]["failure"]["code"],
        "provider_state_binding_changed"
    );
    let initial = endpoint.request().await;
    assert_eq!(initial["contents"][0]["parts"][0]["text"], "First");
    let continued = endpoint.request().await;
    assert_eq!(
        continued["contents"][1]["parts"][0]["thoughtSignature"],
        "c2lnbg=="
    );
    assert_eq!(continued["contents"][2]["parts"][0]["text"], "Second");
    assert_eq!(continued["generationConfig"]["maxOutputTokens"], 2048);
    assert!(matches!(
        endpoint.requests.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));
    endpoint.task.abort();
    let _ = endpoint.task.await;
}

#[tokio::test]
async fn stored_provider_key_cannot_be_selected_for_a_custom_destination() {
    let temporary = TempDir::new().unwrap();
    let credential_home = temporary.path().join("credential-home");
    let mut command = executable();
    let output = timeout(
        WAIT,
        command
            .args(["serve", "--stdio", "--provider", "anthropic"])
            .arg("--state-dir")
            .arg(temporary.path().join("agent-state"))
            .args([
                "--endpoint",
                "https://api.anthropic.com/unapproved",
                "--model",
                "fixture-model",
            ])
            .arg("--credential-home")
            .arg(&credential_home)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("stored_credential_endpoint_mismatch")
    );
    assert!(!credential_home.exists());
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
#[tokio::test]
async fn trusted_vendor_launch_reads_its_explicit_stored_credential() {
    let temporary = TempDir::new().unwrap();
    let directory = temporary.path().canonicalize().unwrap();
    let credential_home = directory.join("credential-home");
    grida_auth::ProviderStore::new(credential_home.clone())
        .unwrap()
        .set("openrouter", TEST_CREDENTIAL)
        .unwrap();

    let output = timeout(
        WAIT,
        executable()
            .args(["serve", "--stdio"])
            .arg("--state-dir")
            .arg(directory.join("agent-state"))
            .args([
                "--endpoint",
                "https://openrouter.ai/api/v1",
                "--model",
                "fixture-model",
            ])
            .arg("--credential-home")
            .arg(credential_home)
            .stdin(Stdio::null())
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    // EOF ends the initialized host without an inference request.
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stdout.is_empty());
    assert!(!String::from_utf8_lossy(&output.stderr).contains(TEST_CREDENTIAL));
}

#[tokio::test]
async fn remote_https_uses_the_host_proxy_without_sending_provider_credentials_to_it() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let proxy = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_url = format!(
        "http://proxy-user:proxy-test-secret@{}",
        proxy.local_addr().unwrap()
    );
    let mut command = executable();
    command.arg("run");
    configured(
        &mut command,
        &temporary.path().join("agent-state"),
        "https://provider.invalid/v1",
    );
    configure_proxy(&mut command, &proxy_url);
    command
        .arg("--cwd")
        .arg(workspace.path())
        .args(["--prompt", "Do not send this to a proxy"]);
    let (output, handshake) = timeout(WAIT, async {
        tokio::join!(command.output(), reject_proxy_tunnel(proxy))
    })
    .await
    .unwrap();
    let output = output.unwrap();
    assert!(!output.status.success());
    assert!(handshake.starts_with("CONNECT provider.invalid:443 HTTP/1.1\r\n"));
    assert!(handshake.lines().any(|line| {
        line.to_ascii_lowercase()
            .starts_with("proxy-authorization: basic ")
    }));
    assert!(
        !handshake
            .lines()
            .any(|line| line.to_ascii_lowercase().starts_with("authorization:"))
    );
    assert!(!handshake.contains(TEST_CREDENTIAL));
    assert!(!handshake.contains("Do not send this to a proxy"));
    for bytes in [output.stdout, output.stderr] {
        let text = String::from_utf8_lossy(&bytes);
        assert!(!text.contains(TEST_CREDENTIAL));
        assert!(!text.contains("proxy-test-secret"));
    }
}

#[tokio::test]
async fn loopback_provider_bypasses_even_an_explicit_host_proxy() {
    let temporary = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let mut endpoint = Endpoint::start(vec![Reply::Finished("Direct reply.")]).await;
    let proxy = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_url = format!("http://{}", proxy.local_addr().unwrap());
    let mut command = executable();
    command.args(["run", "--compatible-output-limit-field", "max-tokens"]);
    configured(
        &mut command,
        &temporary.path().join("agent-state"),
        &endpoint.url.replace("127.0.0.1", "localhost"),
    );
    configure_proxy(&mut command, &proxy_url);
    command
        .arg("--cwd")
        .arg(workspace.path())
        .args(["--prompt", "Use the local provider"]);
    let output = tokio::select! {
        output = timeout(WAIT, command.output()) => output.unwrap().unwrap(),
        _ = proxy.accept() => panic!("local provider request was routed through a proxy"),
    };
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        records(&output.stdout)[1]["account"]["text"],
        "Direct reply."
    );
    let request = endpoint.request().await;
    assert_eq!(request["messages"][1]["content"], "Use the local provider");
    assert_eq!(request["max_tokens"], 4096);
    assert!(request.get("max_completion_tokens").is_none());
    endpoint.done().await;
}

fn configure_proxy(command: &mut Command, proxy: &str) {
    for name in [
        "HTTP_PROXY",
        "http_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
    ] {
        command.env(name, proxy);
    }
    for name in ["NO_PROXY", "no_proxy", "REQUEST_METHOD"] {
        command.env_remove(name);
    }
}

async fn reject_proxy_tunnel(proxy: TcpListener) -> String {
    let (connection, _) = proxy.accept().await.unwrap();
    let mut connection = BufReader::new(connection);
    let mut handshake = String::new();
    loop {
        let mut line = String::new();
        assert_ne!(connection.read_line(&mut line).await.unwrap(), 0);
        if line == "\r\n" {
            break;
        }
        handshake.push_str(&line);
        assert!(handshake.len() < 16 * 1024);
    }
    connection
        .get_mut()
        .write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    handshake
}

#[tokio::test]
async fn compatible_paths_with_different_dispatch_targets_have_distinct_session_identity() {
    use agent_kit_core::ModelId;
    use grida_agent::ProviderOptions;
    use grida_agent::host::{Host, PromptPart, PromptRequest, change_id};

    let temporary = TempDir::new().unwrap();
    let state = temporary.path().join("agent-state");
    let workspace = TempDir::new().unwrap();
    let options = |endpoint: &str| ProviderOptions {
        endpoint: endpoint.into(),
        model: ModelId::new("fixture-model").unwrap(),
        credential_env: None,
        max_output_tokens: 1024,
        protocol: ProviderProtocol::OpenAiCompatible,
        credential_home: None,
        compatible_output_limit_field: None,
    };
    let host = Host::open(&state, Some(options("http://127.0.0.1:1/v1"))).unwrap();
    let session = host.new_session(workspace.path().into()).await.unwrap();
    drop(host);
    let host = Host::open(&state, Some(options("http://127.0.0.1:1/v1//"))).unwrap();
    let result = host
        .start_prompt(PromptRequest {
            id: change_id().unwrap(),
            session,
            parts: vec![PromptPart::Text {
                text: "Do not dispatch elsewhere".into(),
            }],
            questions: false,
            configuration_permission: grida_agent::ConfigurationPermission::Disabled,
        })
        .await;
    let Err(error) = result else {
        panic!("accepted a different provider route")
    };
    assert_eq!(error.code, "session_execution_configuration_changed");
    host.shutdown().await.unwrap();
}
