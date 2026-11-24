//! Conditional queue actions for an attached private ACP client.

use super::*;
use crate::host::TurnControl;
use agent_kit_sessions::QueueAction;

pub(super) const CAPABILITY: &str = "co.grida/session/queue-actions";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/queue-checkout", response = ActionReceipt)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Checkout {
    session_id: SessionId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    input_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/queue-reinsert", response = ActionReceipt)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reinsert {
    session_id: SessionId,
    request_id: ChangeId,
    checkout_id: ChangeId,
    text: Option<String>,
    attachments: Option<Vec<attachments::Attachment>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/steer-queued", response = ActionReceipt)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SteerQueued {
    task: Task,
    input_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Task {
    session_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_control_revision: ControlRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/queue-action-receipt", response = ReceiptLookup)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FindReceipt {
    session_id: SessionId,
    request_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ReceiptLookup {
    receipt: Option<ActionReceipt>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ActionReceipt {
    session_id: SessionId,
    request_id: ChangeId,
    session_revision: SessionRevision,
    #[serde(flatten)]
    action: Action,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
enum Action {
    Checkout {
        input_id: ChangeId,
        checkout_id: ChangeId,
    },
    Reinsert {
        checkout_id: ChangeId,
        input_id: ChangeId,
    },
    Steer {
        input_id: ChangeId,
        turn_id: TurnId,
    },
}

impl TryFrom<ControlReceipt> for ActionReceipt {
    type Error = Error;

    fn try_from(receipt: ControlReceipt) -> Result<Self> {
        let action = match receipt.queue_action {
            Some(QueueAction::CheckedOut { input }) => Action::Checkout {
                input_id: input,
                checkout_id: receipt.request.clone(),
            },
            Some(QueueAction::Reinserted { checkout, input }) => Action::Reinsert {
                checkout_id: checkout,
                input_id: input,
            },
            Some(QueueAction::Transferred { input, turn }) => Action::Steer {
                input_id: input,
                turn_id: turn,
            },
            None => return Err(unavailable("queue_receipt_unavailable")),
        };
        Ok(Self {
            session_id: receipt.session,
            request_id: receipt.request,
            session_revision: receipt.revision,
            action,
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OpenCheckout {
    checkout_id: ChangeId,
    input_id: ChangeId,
}

impl OpenCheckout {
    pub(super) fn project(view: &InputView) -> Option<Self> {
        let InputDisposition::CheckedOut { checkout } = &view.disposition else {
            return None;
        };
        Some(Self {
            checkout_id: checkout.clone(),
            input_id: view.input.id.clone(),
        })
    }
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let checkout = (host.clone(), sessions.clone());
    let reinsert = (host.clone(), sessions.clone());
    let steer = (host.clone(), sessions.clone());
    RequestRoutes::default()
        .on_receive_request(
            async move |request: Checkout, responder, _| {
                let result = async {
                    require(&checkout.1, CAPABILITY, Some(&request.session_id))?;
                    checkout
                        .0
                        .checkout_queued(
                            request.session_id,
                            request.request_id,
                            request.expected_session_revision,
                            request.input_id,
                        )
                        .await
                        .map_err(host_error)?
                        .try_into()
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Reinsert, responder, _| {
                let result = async {
                    require(&reinsert.1, CAPABILITY, Some(&request.session_id))?;
                    let attachments = request
                        .attachments
                        .map(|items| {
                            attachments::decode(items, &reinsert.1, &request.session_id, true)
                        })
                        .transpose()?;
                    reinsert
                        .0
                        .reinsert_queued(
                            request.session_id,
                            request.request_id,
                            request.checkout_id,
                            request.text,
                            attachments,
                        )
                        .await
                        .map_err(host_error)?
                        .try_into()
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: SteerQueued, responder, _| {
                let result = async {
                    require(&steer.1, CAPABILITY, Some(&request.task.session_id))?;
                    let task = request.task;
                    let control = TurnControl {
                        session: task.session_id,
                        turn: task.turn_id,
                        request: task.request_id,
                        expected_session: task.expected_session_revision,
                        expected_control: task.expected_control_revision,
                    };
                    steer
                        .0
                        .steer_queued(control, request.input_id)
                        .await
                        .map_err(host_error)?
                        .try_into()
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: FindReceipt, responder, _| {
                let result = async {
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    let receipt = host
                        .queue_action_receipt(request.session_id, request.request_id)
                        .await
                        .map_err(host_error)?
                        .map(ActionReceipt::try_from)
                        .transpose()?;
                    Ok(ReceiptLookup { receipt })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
