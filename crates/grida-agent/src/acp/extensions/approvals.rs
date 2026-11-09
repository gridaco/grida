//! GRIDA-SEC-004 / GRIDA-SEC-014 — Durable approvals on the native ACP extension.

use super::*;
use crate::host::{Approvals, TurnControl};
use crate::permissions::ApprovalDecision;
use agent_kit_core::WaitId;

const LIST: &str = "co.grida/session/approvals";
const ANSWER: &str = "co.grida/session/answer-approval";

pub(super) fn capabilities(reviewer: bool) -> impl Iterator<Item = &'static str> {
    [Some(LIST), reviewer.then_some(ANSWER)]
        .into_iter()
        .flatten()
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/approvals", response = ApprovalsResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListApprovals {
    session_id: SessionId,
    turn_id: TurnId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct ApprovalsResponse(Approvals);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/answer-approval", response = TurnControlResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnswerApproval {
    session_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_control_revision: ControlRevision,
    wait_id: WaitId,
    decision: ApprovalDecision,
}

pub(super) fn handlers(
    host: Arc<Host>,
    sessions: Arc<Mutex<ConnectionSessions>>,
    reviewer: bool,
) -> Builder<
    Agent,
    impl HandleDispatchFrom<Client>,
    impl agent_client_protocol::RunWithConnectionTo<Client>,
    impl agent_client_protocol::HandleConnectionClose<Client>,
> {
    let list_host = host.clone();
    let list_sessions = sessions.clone();
    Agent
        .v1()
        .on_receive_request(
            async move |request: ListApprovals, responder, _| {
                let result = async {
                    require(&list_sessions, LIST, Some(&request.session_id))?;
                    let approvals = list_host
                        .approvals(request.session_id, request.turn_id)
                        .await
                        .map_err(host_error)?;
                    Ok(ApprovalsResponse(approvals))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: AnswerApproval, responder, _| {
                let result = async {
                    if !reviewer {
                        return Err(unavailable("approval_reviewer_required"));
                    }
                    require(&sessions, ANSWER, Some(&request.session_id))?;
                    let receipt = host
                        .answer_approval(
                            TurnControl {
                                session: request.session_id,
                                turn: request.turn_id.clone(),
                                request: request.request_id,
                                expected_session: request.expected_session_revision,
                                expected_control: request.expected_control_revision,
                            },
                            request.wait_id,
                            request.decision,
                        )
                        .await
                        .map_err(host_error)?;
                    turn_receipt(receipt, request.turn_id)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
