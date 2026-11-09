//! Versioned product operations layered over standard ACP.

pub(super) mod approvals;
pub(super) mod compaction;
mod goals;
mod history;
mod lifecycle;
mod questions;
mod skills;

use super::{ConnectionSessions, host_error, prompt_part, prompt_parts, unavailable};
use crate::host::{DurableSubmission, Host, InputSettings, PromptRequest};
use agent_client_protocol::v1::Builder;
use agent_client_protocol::v1::schema::{ContentBlock, Meta};
use agent_client_protocol::{
    Agent, Client, Error, HandleDispatchFrom, JsonRpcRequest, JsonRpcResponse, Result,
    on_receive_request,
};
use agent_kit_core::history::HistoryPosition;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{ControlRevision, JournalPosition};
use agent_kit_core::{ChangeId, Fingerprint, SessionId, TurnId};
use agent_kit_sessions::{
    ControlReceipt, InputDisposition, InputView, SessionRevision, TurnDisposition, TurnView,
};
use grida_agent_master::configuration::SettingChange;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};

const SUBMIT: &str = "co.grida/session/submit";
const SNAPSHOT: &str = "co.grida/session/snapshot";
const STOP: &str = "co.grida/session/stop";
const CONFIG_INSPECT: &str = "co.grida/config/inspect";
const CONFIG_UPDATE: &str = "co.grida/config/update";
const CONFIG_RELOAD: &str = "co.grida/config/reload";
const CAPABILITIES: [&str; 6] = [
    SUBMIT,
    SNAPSHOT,
    STOP,
    CONFIG_INSPECT,
    CONFIG_UPDATE,
    CONFIG_RELOAD,
];

pub(super) fn advertised(reviewer: bool) -> Meta {
    capability_keys(reviewer)
        .map(|key| (key.into(), 1.into()))
        .collect()
}

pub(super) fn negotiated(meta: Option<&Meta>, reviewer: bool) -> BTreeSet<&'static str> {
    capability_keys(reviewer)
        .filter(|key| meta.and_then(|meta| meta.get(*key)).and_then(Value::as_u64) == Some(1))
        .collect()
}

fn capability_keys(reviewer: bool) -> impl Iterator<Item = &'static str> {
    CAPABILITIES
        .into_iter()
        .chain(lifecycle::CAPABILITIES)
        .chain(questions::CAPABILITIES)
        .chain(approvals::capabilities(reviewer))
        .chain(history::CAPABILITIES)
        .chain([compaction::COMPACT])
        .chain([skills::CATALOG])
        .chain(goals::CAPABILITIES)
}

pub(super) fn configuration_permission(
    sessions: &Mutex<ConnectionSessions>,
    allow_changes: bool,
) -> Result<crate::ConfigurationPermission> {
    let sessions = sessions.lock().unwrap();
    let can_inspect = sessions.negotiated.contains(CONFIG_INSPECT);
    let can_change = [CONFIG_INSPECT, CONFIG_UPDATE, CONFIG_RELOAD]
        .iter()
        .all(|key| sessions.negotiated.contains(key));
    if allow_changes {
        return if can_change {
            Ok(crate::ConfigurationPermission::Change)
        } else {
            Err(unavailable("configuration_capability_required"))
        };
    }
    Ok(if can_inspect {
        crate::ConfigurationPermission::Inspect
    } else {
        crate::ConfigurationPermission::Disabled
    })
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/submit", response = SubmitResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Submit {
    session_id: SessionId,
    input_id: ChangeId,
    prompt: Vec<ContentBlock>,
    #[serde(default)]
    allow_configuration_changes: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct SubmitResponse {
    session_id: SessionId,
    input_id: ChangeId,
    input_position: u64,
    disposition: SubmissionDisposition,
    turn_id: Option<TurnId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    replacement_input_id: Option<ChangeId>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SubmissionDisposition {
    Queued,
    Claimed,
    Completed,
    Superseded,
    Withdrawn,
}

impl From<DurableSubmission> for SubmitResponse {
    fn from(submission: DurableSubmission) -> Self {
        let (disposition, turn_id, replacement_input_id) = match submission.disposition {
            InputDisposition::Queued => (SubmissionDisposition::Queued, None, None),
            InputDisposition::Claimed { turn } => {
                (SubmissionDisposition::Claimed, Some(turn), None)
            }
            InputDisposition::Completed { turn } => {
                (SubmissionDisposition::Completed, Some(turn), None)
            }
            InputDisposition::Superseded { replacement } => {
                (SubmissionDisposition::Superseded, None, Some(replacement))
            }
            InputDisposition::Withdrawn => (SubmissionDisposition::Withdrawn, None, None),
        };
        Self {
            session_id: submission.session,
            input_id: submission.input,
            input_position: submission.position,
            disposition,
            turn_id,
            replacement_input_id,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/snapshot", response = SnapshotResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct SnapshotResponse {
    session_id: SessionId,
    session_revision: SessionRevision,
    queued_inputs: usize,
    queue: Vec<QueuedInput>,
    admission_paused: bool,
    current: Option<TurnSummary>,
    latest: Option<TurnSummary>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueuedInput {
    input_id: ChangeId,
    input_position: u64,
    settings: InputSettings,
}

fn queued_input(view: &InputView) -> Result<QueuedInput> {
    Ok(QueuedInput {
        input_id: view.input.id.clone(),
        input_position: view.position,
        settings: InputSettings::for_input(&view.input).map_err(host_error)?,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnSummary {
    turn_id: TurnId,
    epoch: u64,
    journal_position: JournalPosition,
    history_position: HistoryPosition,
    control_revision: ControlRevision,
    paused: bool,
    cancelled: bool,
    disposition: TurnDisposition,
    status: Option<OutcomeStatus>,
}

impl From<TurnView> for TurnSummary {
    fn from(turn: TurnView) -> Self {
        Self {
            turn_id: turn.binding.turn,
            epoch: turn.binding.epoch,
            journal_position: turn.position,
            history_position: turn.history_position,
            control_revision: turn.controls.revision,
            paused: turn.controls.paused,
            cancelled: turn.controls.cancelled,
            disposition: turn.disposition,
            status: turn.outcome.map(|outcome| outcome.status),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/stop", response = TurnControlResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stop {
    session_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_control_revision: ControlRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct TurnControlResponse {
    session_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    session_revision: SessionRevision,
    journal_position: JournalPosition,
}

fn turn_receipt(receipt: ControlReceipt, turn_id: TurnId) -> Result<TurnControlResponse> {
    let turn = receipt
        .turn
        .ok_or_else(|| unavailable("turn_control_receipt_missing"))?;
    Ok(TurnControlResponse {
        session_id: receipt.session,
        turn_id,
        request_id: receipt.request,
        session_revision: receipt.revision,
        journal_position: turn.record().position,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/config/inspect", response = Value)]
#[serde(deny_unknown_fields)]
struct ConfigInspect {}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/config/update", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConfigUpdate {
    expected_revision: Option<Fingerprint>,
    change: SettingChange,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/config/reload", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConfigReload {
    expected_revision: Option<Fingerprint>,
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
    let submit_host = host.clone();
    let submit_sessions = sessions.clone();
    let snapshot_host = host.clone();
    let snapshot_sessions = sessions.clone();
    let stop_host = host.clone();
    let stop_sessions = sessions.clone();
    let inspect_host = host.clone();
    let inspect_sessions = sessions.clone();
    let update_host = host.clone();
    let update_sessions = sessions.clone();
    let image_intake = reviewer && host.accepts_images();

    Agent
        .v1()
        .with_connection_builder(lifecycle::handlers(
            host.clone(),
            sessions.clone(),
            image_intake,
        ))
        .with_connection_builder(questions::handlers(host.clone(), sessions.clone()))
        .with_connection_builder(approvals::handlers(
            host.clone(),
            sessions.clone(),
            reviewer,
        ))
        .with_connection_builder(history::handlers(host.clone(), sessions.clone()))
        .with_connection_builder(compaction::handlers(host.clone(), sessions.clone()))
        .with_connection_builder(skills::handlers(host.clone(), sessions.clone()))
        .with_connection_builder(goals::handlers(
            host.clone(),
            sessions.clone(),
            image_intake,
        ))
        .on_receive_request(
            async move |request: Submit, responder, _| {
                let result = async {
                    require(&submit_sessions, SUBMIT, Some(&request.session_id))?;
                    let parts = prompt_parts(request.prompt, image_intake)?;
                    let accepted = submit_host
                        .submit_prompt(PromptRequest {
                            id: request.input_id,
                            session: request.session_id,
                            parts,
                            questions: questions::available(&submit_sessions),
                            configuration_permission: configuration_permission(
                                &submit_sessions,
                                request.allow_configuration_changes,
                            )?,
                        })
                        .await
                        .map_err(host_error)?;
                    Ok(SubmitResponse::from(accepted))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Snapshot, responder, _| {
                let result = async {
                    require(&snapshot_sessions, SNAPSHOT, Some(&request.session_id))?;
                    let snapshot = snapshot_host
                        .inspect(request.session_id)
                        .await
                        .map_err(host_error)?;
                    Ok(SnapshotResponse {
                        session_id: snapshot.session,
                        session_revision: snapshot.revision,
                        queued_inputs: snapshot.queued.len(),
                        queue: snapshot
                            .queued
                            .iter()
                            .map(queued_input)
                            .collect::<Result<_>>()?,
                        admission_paused: snapshot.admission_paused,
                        current: snapshot.current.map(TurnSummary::from),
                        latest: snapshot.latest.map(TurnSummary::from),
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Stop, responder, _| {
                let result = async {
                    require(&stop_sessions, STOP, Some(&request.session_id))?;
                    let receipt = stop_host
                        .stop(
                            request.session_id,
                            request.turn_id.clone(),
                            request.request_id,
                            request.expected_session_revision,
                            request.expected_control_revision,
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
        .on_receive_request(
            async move |_: ConfigInspect, responder, _| {
                let result = async {
                    require(&inspect_sessions, CONFIG_INSPECT, None)?;
                    encode_config(inspect_host.configuration_inspect().await)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ConfigUpdate, responder, _| {
                let result = async {
                    require(&update_sessions, CONFIG_UPDATE, None)?;
                    encode_config(
                        update_host
                            .configuration_update(request.expected_revision, request.change)
                            .await,
                    )
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ConfigReload, responder, _| {
                let result = async {
                    require(&sessions, CONFIG_RELOAD, None)?;
                    encode_config(host.configuration_reload(request.expected_revision).await)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}

fn require(
    sessions: &Mutex<ConnectionSessions>,
    capability: &'static str,
    session: Option<&SessionId>,
) -> Result<()> {
    let sessions = sessions.lock().unwrap();
    if !sessions.negotiated.contains(capability) {
        return Err(Error::method_not_found());
    }
    if let Some(id) = session {
        sessions.ensure_attached(id)?;
    }
    Ok(())
}

fn encode_config(value: agent_kit_core::Result<impl Serialize>) -> Result<Value> {
    serde_json::to_value(value.map_err(host_error)?)
        .map_err(|_| unavailable("configuration_projection_failed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configuration_negotiation_keeps_inspection_and_explicit_changes_distinct() {
        let sessions = Mutex::new(ConnectionSessions::default());
        assert_eq!(
            configuration_permission(&sessions, false).unwrap(),
            crate::ConfigurationPermission::Disabled
        );
        assert!(configuration_permission(&sessions, true).is_err());
        sessions.lock().unwrap().negotiated.insert(CONFIG_INSPECT);
        assert_eq!(
            configuration_permission(&sessions, false).unwrap(),
            crate::ConfigurationPermission::Inspect
        );
        assert!(configuration_permission(&sessions, true).is_err());
        sessions
            .lock()
            .unwrap()
            .negotiated
            .extend([CONFIG_UPDATE, CONFIG_RELOAD]);
        assert_eq!(
            configuration_permission(&sessions, false).unwrap(),
            crate::ConfigurationPermission::Inspect
        );
        assert_eq!(
            configuration_permission(&sessions, true).unwrap(),
            crate::ConfigurationPermission::Change
        );
    }
}
