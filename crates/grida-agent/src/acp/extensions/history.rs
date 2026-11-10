//! Negotiated conversation history anchors and derivation controls.
//! GRIDA-SEC-004 binds access to an attached source session.

use super::*;
use crate::host::{ConversationDerivation, HistoryPage, HistoryQuery, RevisionTarget};
use agent_kit_core::MessageId;
use agent_kit_store_sqlite::history::HistoryBasis;
use grida_agent_master::conversation_seed::ConversationAnchor;

const HISTORY: &str = "co.grida/session/history";
pub(super) const FORK: &str = "co.grida/session/fork";
const REVISE: &str = "co.grida/session/revise";
const REVISION_TARGET: &str = "co.grida/session/revision-target";
pub(super) const CAPABILITIES: [&str; 4] = [HISTORY, FORK, REVISE, REVISION_TARGET];

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/history", response = HistoryResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct History {
    session_id: SessionId,
    view: Option<SessionRevision>,
    #[serde(default)]
    offset: usize,
    expected_history: Option<HistoryBasis>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct HistoryResponse(HistoryPage);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/fork", response = ForkResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fork {
    session_id: SessionId,
    request_id: ChangeId,
    expected_history: HistoryBasis,
    anchor: ConversationAnchor,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ForkResponse {
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/revision-target", response = RevisionTargetResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadRevisionTarget {
    session_id: SessionId,
    message_id: MessageId,
    expected_session_revision: SessionRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct RevisionTargetResponse(RevisionTarget);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/revise", response = ReviseResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Revise {
    session_id: SessionId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_history: HistoryBasis,
    anchor: ConversationAnchor,
    replacement_input_id: ChangeId,
    prompt: Vec<ContentBlock>,
    #[serde(default)]
    allow_configuration_changes: bool,
    operating_regime: Option<crate::OperatingRegime>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ReviseResponse {
    session_id: SessionId,
    view: SessionRevision,
    input_id: ChangeId,
    input_position: u64,
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let history = (host.clone(), sessions.clone());
    let fork = (host.clone(), sessions.clone());
    let target = (host.clone(), sessions.clone());
    RequestRoutes::default()
        .on_receive_request(
            async move |request: History, responder, _| {
                let result = async {
                    require(&history.1, HISTORY, Some(&request.session_id))?;
                    history
                        .0
                        .history_page(HistoryQuery {
                            session: request.session_id,
                            view: request.view,
                            offset: request.offset,
                            expected_history: request.expected_history,
                        })
                        .await
                        .map(HistoryResponse)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Fork, responder, _| {
                let result = async {
                    require(&fork.1, FORK, Some(&request.session_id))?;
                    let session_id = fork
                        .0
                        .fork_session(
                            request.session_id,
                            ConversationDerivation {
                                request: request.request_id,
                                basis: request.expected_history,
                                anchor: request.anchor,
                            },
                        )
                        .await
                        .map_err(host_error)?;
                    Ok(ForkResponse { session_id })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ReadRevisionTarget, responder, _| {
                let result = async {
                    require(&target.1, REVISION_TARGET, Some(&request.session_id))?;
                    target
                        .0
                        .revision_target(
                            request.session_id,
                            request.message_id,
                            request.expected_session_revision,
                        )
                        .await
                        .map(RevisionTargetResponse)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Revise, responder, _| {
                let result = async {
                    require(&sessions, REVISE, Some(&request.session_id))?;
                    let revised = host
                        .revise_session(
                            ConversationDerivation {
                                request: request.request_id,
                                basis: request.expected_history,
                                anchor: request.anchor,
                            },
                            request.expected_session_revision,
                            PromptRequest {
                                session: request.session_id,
                                id: request.replacement_input_id,
                                parts: request
                                    .prompt
                                    .into_iter()
                                    .map(prompt_part)
                                    .collect::<Result<_>>()?,
                                questions: questions::available(&sessions),
                                configuration_permission: configuration_permission(
                                    &sessions,
                                    request.allow_configuration_changes,
                                )?,
                                operating_regime: operating_regime(
                                    &sessions,
                                    request.operating_regime,
                                )?,
                            },
                        )
                        .await
                        .map_err(host_error)?;
                    Ok(ReviseResponse {
                        session_id: revised.acceptance.session,
                        view: revised.view,
                        input_id: revised.acceptance.input,
                        input_position: revised.acceptance.position,
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
