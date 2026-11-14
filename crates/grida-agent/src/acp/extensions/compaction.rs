//! Negotiated compaction and the standard command catalog.

use super::super::transport::Delivery;
use super::*;
use crate::host::{CompactRequest, CompactionReport, CompactionStatus, change_id};
use agent_client_protocol::RequestCancellation;
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::{
    AvailableCommand, AvailableCommandsUpdate, PromptResponse, SessionNotification, SessionUpdate,
    StopReason,
};
use tokio::sync::oneshot;

pub(super) const COMPACT: &str = "co.grida/session/compact";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/compact", response = CompactResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Compact {
    session_id: SessionId,
    request_id: ChangeId,
    #[serde(default)]
    recover: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct CompactResponse(CompactionReport);

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    RequestRoutes::default().on_receive_request(
        async move |request: Compact, responder, connection| {
            let host = host.clone();
            let sessions = sessions.clone();
            connection.spawn(async move {
                let result = async {
                    require(&sessions, COMPACT, Some(&request.session_id))?;
                    host.compact(CompactRequest {
                        session: request.session_id,
                        request: request.request_id,
                        recover: request.recover,
                    })
                    .await
                    .map(CompactResponse)
                    .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            })
        },
        on_receive_request!(),
    )
}

#[derive(Clone, Copy)]
pub(in crate::acp) enum Command {
    Compact,
    Fork,
}

impl Command {
    fn capability(self) -> &'static str {
        match self {
            Self::Compact => COMPACT,
            Self::Fork => super::history::FORK,
        }
    }

    fn entry(self) -> AvailableCommand {
        match self {
            Self::Compact => AvailableCommand::new(
                "compact",
                "Summarize earlier context while keeping the original conversation.",
            ),
            Self::Fork => AvailableCommand::new(
                "fork",
                "Create a separate conversation from the latest committed message.",
            ),
        }
    }
}

pub(in crate::acp) fn command(
    sessions: &Mutex<ConnectionSessions>,
    prompt: &[ContentBlock],
) -> Option<Command> {
    let [ContentBlock::Text(text)] = prompt else {
        return None;
    };
    let command = match text.text.trim() {
        "/compact" => Command::Compact,
        "/fork" => Command::Fork,
        _ => return None,
    };
    sessions
        .lock()
        .unwrap()
        .negotiated
        .contains(command.capability())
        .then_some(command)
}

pub(in crate::acp) async fn announce(
    sessions: &Mutex<ConnectionSessions>,
    session: &SessionId,
    connection: &ConnectionTo<Client>,
    delivery: &Delivery,
) -> Result<()> {
    let available: Vec<_> = {
        let sessions = sessions.lock().unwrap();
        [Command::Compact, Command::Fork]
            .into_iter()
            .filter(|command| sessions.negotiated.contains(command.capability()))
            .map(Command::entry)
            .collect()
    };
    if !available.is_empty() {
        delivery
            .send(
                connection,
                SessionNotification::new(
                    session.as_str().to_owned(),
                    SessionUpdate::AvailableCommandsUpdate(AvailableCommandsUpdate::new(available)),
                ),
            )
            .await?;
    }
    Ok(())
}

pub(in crate::acp) async fn invoke(
    host: &Host,
    sessions: &Mutex<ConnectionSessions>,
    session: SessionId,
    command: Command,
    cancellation: RequestCancellation,
) -> Result<PromptResponse> {
    let request = change_id().map_err(host_error)?;
    let (reason, result) = match command {
        Command::Fork => {
            let destination = host
                .fork_latest(session, request)
                .await
                .map_err(host_error)?;
            (
                StopReason::EndTurn,
                serde_json::json!({ "sessionId": destination }),
            )
        }
        Command::Compact => {
            let (accepted, ready) = oneshot::channel();
            let run = host.compact_observed(
                CompactRequest {
                    session: session.clone(),
                    request,
                    recover: false,
                },
                Some(accepted),
            );
            tokio::pin!(run);
            let report = tokio::select! {
                result = &mut run => result,
                ready = ready => match ready {
                    Ok(turn) => {
                        sessions.lock().unwrap().active.insert(session.clone(), turn.clone());
                        let result = tokio::select! {
                            result = &mut run => result,
                            _ = cancellation.cancelled() => {
                                match host.cancel(session.clone(), turn).await {
                                    Ok(()) => run.await,
                                    Err(error) => Err(error),
                                }
                            }
                        };
                        sessions.lock().unwrap().active.remove(&session);
                        result
                    }
                    Err(_) => run.await,
                },
            }
            .map_err(host_error)?;
            let reason = match report.status {
                CompactionStatus::Stopped | CompactionStatus::Suspended => StopReason::Cancelled,
                _ => StopReason::EndTurn,
            };
            let result = serde_json::to_value(report)
                .map_err(|_| unavailable("compaction_projection_failed"))?;
            (reason, result)
        }
    };
    let mut metadata = Meta::new();
    metadata.insert(command.capability().into(), result);
    Ok(PromptResponse::new(reason).meta(metadata))
}
