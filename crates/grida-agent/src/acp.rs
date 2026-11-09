//! Stable ACP v1 over a supervised, bounded stdio connection.

mod extensions;
mod projection;
mod transport;
mod websocket;

pub use websocket::{ListenOptions, serve_websocket};

use crate::host::{AcceptedRun, Host, PromptPart, PromptRequest, RunResult};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::v1::schema::{
    AgentCapabilities, CancelNotification, ContentBlock, Implementation, InitializeRequest,
    InitializeResponse, LoadSessionRequest, LoadSessionResponse, NewSessionRequest,
    NewSessionResponse, PromptRequest as AcpPrompt, PromptResponse, StopReason,
};
use agent_client_protocol::{
    Agent, Channel, Error, Result, on_receive_notification, on_receive_request,
};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::{ChangeId, ErrorKind, SessionId, TurnId};
use projection::Projection;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::broadcast::error::{RecvError, TryRecvError};
use transport::Delivery;

const MAX_ATTACHED_SESSIONS: usize = 128;

#[derive(Debug)]
pub enum ServeError {
    Protocol(Error),
    Shutdown(agent_kit_core::Error),
}

pub async fn serve_stdio(host: Arc<Host>) -> std::result::Result<(), ServeError> {
    serve(host, tokio::io::stdin(), tokio::io::stdout()).await
}

async fn serve(
    host: Arc<Host>,
    input: impl AsyncRead + Unpin,
    output: impl AsyncWrite + Unpin,
) -> std::result::Result<(), ServeError> {
    let delivery = Arc::new(Delivery::new());
    let (sdk, wire) = Channel::duplex();
    let (incoming, outgoing) = wire.into_parts();
    let result = tokio::try_join!(
        serve_connection(host.clone(), sdk, delivery.clone()),
        transport::read(input, outgoing, delivery.clone()),
        transport::write(output, incoming, delivery),
    );
    host.shutdown().await.map_err(ServeError::Shutdown)?;
    result.map(|_| ()).map_err(ServeError::Protocol)
}

#[derive(Default)]
struct ConnectionSessions {
    attached: BTreeSet<SessionId>,
    active: BTreeMap<SessionId, TurnId>,
    negotiated: BTreeSet<&'static str>,
}

impl ConnectionSessions {
    fn ensure_capacity(&self, known: Option<&SessionId>) -> Result<()> {
        if self.attached.len() >= MAX_ATTACHED_SESSIONS
            && !known.is_some_and(|id| self.attached.contains(id))
        {
            return Err(unavailable("attached_session_limit"));
        }
        Ok(())
    }

    fn ensure_attached(&self, id: &SessionId) -> Result<()> {
        if !self.attached.contains(id) {
            return Err(unavailable("session_setup_required"));
        }
        Ok(())
    }
}

async fn serve_connection(
    host: Arc<Host>,
    channel: Channel,
    delivery: Arc<Delivery>,
) -> Result<()> {
    let sessions = Arc::new(Mutex::new(ConnectionSessions::default()));
    let initialized_sessions = sessions.clone();
    let new_host = host.clone();
    let new_sessions = sessions.clone();
    let load_host = host.clone();
    let load_sessions = sessions.clone();
    let load_delivery = delivery.clone();
    let prompt_host = host.clone();
    let prompt_sessions = sessions.clone();

    Agent
        .v1()
        .name("grida-agent")
        .with_connection_builder(extensions::handlers(host.clone(), sessions.clone()))
        .on_receive_request(
            async move |request: InitializeRequest, responder, _| {
                initialized_sessions.lock().unwrap().negotiated =
                    extensions::negotiated(request.client_capabilities.meta.as_ref());
                responder.respond(
                    InitializeResponse::new(ProtocolVersion::V1)
                        .agent_capabilities(
                            AgentCapabilities::new()
                                .load_session(true)
                                .meta(extensions::advertised()),
                        )
                        .agent_info(Implementation::new(
                            "grida-agent",
                            env!("CARGO_PKG_VERSION"),
                        )),
                )
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: NewSessionRequest, responder, _| {
                let result = async {
                    validate_session_setup(&request.mcp_servers, &request.additional_directories)?;
                    new_sessions.lock().unwrap().ensure_capacity(None)?;
                    let id = new_host
                        .new_session(request.cwd)
                        .await
                        .map_err(host_error)?;
                    let response = NewSessionResponse::new(id.as_str().to_owned());
                    new_sessions.lock().unwrap().attached.insert(id);
                    Ok(response)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: LoadSessionRequest, responder, connection| {
                let result = async {
                    validate_session_setup(&request.mcp_servers, &request.additional_directories)?;
                    let id = session_id(&request.session_id)?;
                    {
                        let sessions = load_sessions.lock().unwrap();
                        sessions.ensure_capacity(Some(&id))?;
                        if sessions.active.contains_key(&id) {
                            return Err(unavailable("session_prompt_in_progress"));
                        }
                    }
                    let snapshot = load_host
                        .load_session(id.clone(), request.cwd)
                        .await
                        .map_err(host_error)?;
                    let mut projection = Projection::new(request.session_id);
                    projection
                        .replay(&connection, &load_delivery, snapshot.messages)
                        .await?;
                    load_sessions.lock().unwrap().attached.insert(id);
                    Ok(LoadSessionResponse::new())
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: AcpPrompt, responder, connection| {
                let start = async {
                    let session = session_id(&request.session_id)?;
                    {
                        let sessions = prompt_sessions.lock().unwrap();
                        sessions.ensure_attached(&session)?;
                        if sessions.active.contains_key(&session) {
                            return Err(unavailable("session_prompt_in_progress"));
                        }
                    }
                    let parts = request
                        .prompt
                        .into_iter()
                        .map(prompt_part)
                        .collect::<Result<Vec<_>>>()?;
                    // ACP JSON-RPC IDs correlate requests on one connection. A
                    // distinct host-generated ID identifies each durable input.
                    let id = ChangeId::new(uuid::Uuid::new_v4().to_string()).map_err(host_error)?;
                    prompt_host
                        .start_prompt(PromptRequest {
                            id,
                            session,
                            parts,
                            questions: false,
                            configuration_permission: crate::ConfigurationPermission::Disabled,
                        })
                        .await
                        .map_err(host_error)
                }
                .await;
                let run = match start {
                    Ok(run) => run,
                    Err(error) => return responder.respond_with_error(error),
                };
                prompt_sessions
                    .lock()
                    .unwrap()
                    .active
                    .insert(run.session.clone(), run.turn.clone());
                connection.spawn({
                    let connection = connection.clone();
                    let delivery = delivery.clone();
                    let host = prompt_host.clone();
                    let sessions = prompt_sessions.clone();
                    async move {
                        let cancellation = responder.cancellation();
                        let session = run.session.clone();
                        let mut projection = Projection::new(request.session_id);
                        let result = project_run(
                            &host,
                            &connection,
                            &delivery,
                            &mut projection,
                            cancellation,
                            run,
                        )
                        .await;
                        sessions.lock().unwrap().active.remove(&session);
                        responder.respond_with_result(result)
                    }
                })
            },
            on_receive_request!(),
        )
        .on_receive_notification(
            async move |request: CancelNotification, _| {
                if let Ok(id) = session_id(&request.session_id) {
                    let turn = sessions.lock().unwrap().active.get(&id).cloned();
                    if let Some(turn) = turn {
                        // Notifications have no response. Cancellation is
                        // scoped to the foreground turn this client observed.
                        if let Err(error) = host.cancel(id, turn).await {
                            eprintln!("ACP session cancellation failed: {}", error.code);
                        }
                    }
                }
                Ok(())
            },
            on_receive_notification!(),
        )
        .connect_to(channel)
        .await
}

async fn project_run(
    host: &Host,
    connection: &agent_client_protocol::v1::ConnectionTo<agent_client_protocol::Client>,
    delivery: &Delivery,
    projection: &mut Projection,
    cancellation: agent_client_protocol::RequestCancellation,
    run: AcceptedRun,
) -> Result<PromptResponse> {
    let AcceptedRun {
        session,
        turn,
        mut updates,
        mut completion,
        ..
    } = run;
    let mut cancelled = false;
    let mut stream_open = true;
    let result = loop {
        tokio::select! {
            _ = cancellation.cancelled(), if !cancelled => {
                cancelled = true;
                host.cancel(session.clone(), turn.clone()).await.map_err(host_error)?;
            }
            event = updates.recv(), if stream_open => match event {
                Ok(event) => projection.update(connection, delivery, event).await?,
                Err(RecvError::Lagged(_)) => return Err(unavailable("session_updates_lost")),
                Err(RecvError::Closed) => stream_open = false,
            },
            result = &mut completion => break result,
        }
    };
    // The host publishes completion only after the last update has entered this
    // bounded stream. Queue remaining updates before the terminal ACP response.
    loop {
        match updates.try_recv() {
            Ok(event) => projection.update(connection, delivery, event).await?,
            Err(TryRecvError::Empty | TryRecvError::Closed) => break,
            Err(TryRecvError::Lagged(_)) => return Err(unavailable("session_updates_lost")),
        }
    }
    let result = result
        .map_err(|_| unavailable("agent_run_disconnected"))?
        .map_err(host_error)?;
    match result {
        RunResult::Settled(outcome) => match outcome.status {
            OutcomeStatus::Succeeded => Ok(PromptResponse::new(StopReason::EndTurn)),
            OutcomeStatus::Cancelled => Ok(PromptResponse::new(StopReason::Cancelled)),
            OutcomeStatus::Failed => {
                let account = outcome
                    .account
                    .as_ref()
                    .map(grida_agent_master::read_account)
                    .transpose()
                    .map_err(host_error)?;
                match account.as_ref().and_then(|account| account.stop_reason) {
                    Some(grida_agent_master::StopReason::StepLimit) => {
                        Ok(PromptResponse::new(StopReason::MaxTurnRequests))
                    }
                    Some(grida_agent_master::StopReason::OutputLimit) => {
                        Ok(PromptResponse::new(StopReason::MaxTokens))
                    }
                    Some(grida_agent_master::StopReason::Refused) => {
                        Ok(PromptResponse::new(StopReason::Refusal))
                    }
                    None => Err(account
                        .and_then(|account| {
                            account.failure.map(host_error).or_else(|| {
                                account.inference_failure.map(|failure| {
                                    Error::internal_error().data(serde_json::json!({
                                        "kind": failure.kind,
                                        "code": failure.code,
                                        "retryAfterMs": failure.retry_after_ms,
                                    }))
                                })
                            })
                        })
                        .unwrap_or_else(|| unavailable("agent_turn_failed"))),
                }
            }
            OutcomeStatus::Uncertain => Err(unavailable("agent_turn_uncertain")),
        },
        RunResult::Suspended => Err(unavailable("agent_turn_suspended")),
        RunResult::InputRequired(_) => Err(unavailable("agent_turn_input_required")),
    }
}

fn session_id(id: &agent_client_protocol::v1::schema::SessionId) -> Result<SessionId> {
    SessionId::new(id.to_string()).map_err(host_error)
}

fn prompt_part(block: ContentBlock) -> Result<PromptPart> {
    match block {
        ContentBlock::Text(text) => Ok(PromptPart::Text { text: text.text }),
        ContentBlock::ResourceLink(link) => Ok(PromptPart::ResourceLink {
            name: link.name,
            uri: link.uri,
            mime_type: link.mime_type,
        }),
        _ => Err(Error::invalid_params().data("unsupported_prompt_content")),
    }
}

fn validate_session_setup(
    servers: &[agent_client_protocol::v1::schema::McpServer],
    additional_directories: &[std::path::PathBuf],
) -> Result<()> {
    if !servers.is_empty() {
        return Err(Error::invalid_params().data("client_mcp_servers_unavailable"));
    }
    if !additional_directories.is_empty() {
        return Err(Error::invalid_params().data("additional_workspace_directories_unavailable"));
    }
    Ok(())
}

fn unavailable(code: &'static str) -> Error {
    Error::internal_error().data(code)
}

fn host_error(error: agent_kit_core::Error) -> Error {
    let wire_error = match error.kind {
        ErrorKind::InvalidInput | ErrorKind::Unsupported => Error::invalid_params(),
        _ => Error::internal_error(),
    };
    wire_error.data(error.code)
}
