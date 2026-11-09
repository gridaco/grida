//! Persistent goal operations for an attached, negotiated client.
//! GRIDA-SEC-004 keeps admission within the existing host control boundary.

use super::*;
use crate::host::{GoalAction, GoalControl, GoalInspection, GoalRequest};
use agent_kit_core::driver_state::DriverStateRevision;
use grida_agent_master::goals::Basis;

const START: &str = "co.grida/goal/start";
const INSPECT: &str = "co.grida/goal/inspect";
const CONTROL: &str = "co.grida/goal/control";
const RECOVER: &str = "co.grida/goal/recover";
pub(super) const CAPABILITIES: [&str; 4] = [START, INSPECT, CONTROL, RECOVER];

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/goal/start", response = SubmitResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Start {
    session_id: SessionId,
    input_id: ChangeId,
    prompt: Vec<ContentBlock>,
    goal: GoalRequest,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/goal/inspect", response = Inspection)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Inspect {
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct Inspection(GoalInspection);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/goal/control", response = Controlled)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Control {
    session_id: SessionId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_state_revision: DriverStateRevision,
    basis: Basis,
    change: GoalAction,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct Controlled {
    session_id: SessionId,
    request_id: ChangeId,
    session_revision: SessionRevision,
    state_revision: DriverStateRevision,
    turn_id: Option<TurnId>,
    journal_position: Option<JournalPosition>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/goal/recover", response = Reconsidered)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Recover {
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct Reconsidered {
    session_id: SessionId,
}

pub(super) fn handlers(
    host: Arc<Host>,
    sessions: Arc<Mutex<ConnectionSessions>>,
    image_intake: bool,
) -> Builder<Agent, impl HandleDispatchFrom<Client>> {
    let start = (host.clone(), sessions.clone());
    let inspect = (host.clone(), sessions.clone());
    let control = (host.clone(), sessions.clone());
    Agent
        .v1()
        .on_receive_request(
            async move |request: Start, responder, _| {
                let result = async {
                    require(&start.1, START, Some(&request.session_id))?;
                    let parts = prompt_parts(request.prompt, image_intake)?;
                    start
                        .0
                        .start_goal(
                            PromptRequest {
                                id: request.input_id,
                                session: request.session_id,
                                parts,
                                questions: questions::available(&start.1),
                                configuration_permission: configuration_permission(
                                    &start.1, false,
                                )?,
                            },
                            request.goal,
                        )
                        .await
                        .map(SubmitResponse::from)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Inspect, responder, _| {
                let result = async {
                    require(&inspect.1, INSPECT, Some(&request.session_id))?;
                    inspect
                        .0
                        .inspect_goal(request.session_id)
                        .await
                        .map(Inspection)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Control, responder, _| {
                let result = async {
                    require(&control.1, CONTROL, Some(&request.session_id))?;
                    let receipt = control
                        .0
                        .control_goal(GoalControl {
                            id: request.request_id,
                            session: request.session_id,
                            expected_revision: request.expected_session_revision,
                            expected_state: request.expected_state_revision,
                            basis: request.basis,
                            action: request.change,
                        })
                        .await
                        .map_err(host_error)?;
                    Ok(Controlled {
                        session_id: receipt.session,
                        request_id: receipt.request,
                        session_revision: receipt.revision,
                        state_revision: receipt
                            .driver_state_revision
                            .ok_or_else(|| unavailable("goal_control_receipt_missing"))?,
                        turn_id: receipt
                            .turn
                            .as_ref()
                            .map(|turn| turn.record().binding.turn.clone()),
                        journal_position: receipt.turn.as_ref().map(|turn| turn.record().position),
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Recover, responder, _| {
                let result = async {
                    require(&sessions, RECOVER, Some(&request.session_id))?;
                    host.recover_goal_work(request.session_id.clone())
                        .await
                        .map_err(host_error)?;
                    Ok(Reconsidered {
                        session_id: request.session_id,
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
