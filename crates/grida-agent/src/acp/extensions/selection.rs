//! GRIDA-SEC-004 — supervisor-only durable product selections.

use super::*;
use crate::host::{ChatSelection, SelectionUpdate};
use std::path::PathBuf;

pub(super) const CAPABILITY: &str = "co.grida/session/selection";
pub(super) const REVISION_META: &str = "co.grida/selectionRevision";

pub(super) fn web_search(
    meta: Option<&Meta>,
    sessions: &Mutex<ConnectionSessions>,
) -> Result<bool> {
    let Some(value) = meta.and_then(|meta| meta.get("co.grida/webSearch")) else {
        return Ok(false);
    };
    require(
        sessions,
        crate::supervised_provider::TURN_CAPABILITIES,
        None,
    )?;
    if value != &Value::Bool(true) {
        return Err(Error::invalid_params().data("web_search_invalid"));
    }
    Ok(true)
}

pub(super) fn revision(
    meta: Option<&Meta>,
    sessions: &Mutex<ConnectionSessions>,
) -> Result<Option<u64>> {
    let Some(value) = meta.and_then(|meta| meta.get(REVISION_META)) else {
        return Ok(None);
    };
    require(sessions, CAPABILITY, None)?;
    value
        .as_u64()
        .filter(|revision| *revision > 0)
        .map(Some)
        .ok_or_else(|| Error::invalid_params().data("chat_selection_revision_invalid"))
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/selection", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Inspect {
    cwd: PathBuf,
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/selection/update", response = Value)]
#[serde(transparent)]
struct Update(SelectionUpdate);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/selection/receipt", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    cwd: PathBuf,
    session_id: SessionId,
    operation_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/selection/ack", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ack {
    cwd: PathBuf,
    session_id: SessionId,
    operation_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/selection/create", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Create {
    cwd: PathBuf,
    session_id: SessionId,
    request_id: ChangeId,
    selection: ChatSelection,
}

fn value(value: impl Serialize) -> Result<Value> {
    serde_json::to_value(value).map_err(|_| Error::internal_error())
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let inspect = (host.clone(), sessions.clone());
    let update = (host.clone(), sessions.clone());
    let receipt = (host.clone(), sessions.clone());
    let ack = (host.clone(), sessions.clone());
    RequestRoutes::default()
        .on_receive_request(
            async move |request: Inspect, responder, _| {
                let result = async {
                    require(&inspect.1, CAPABILITY, None)?;
                    value(
                        inspect
                            .0
                            .chat_selection(request.cwd, request.session_id)
                            .await
                            .map_err(host_error)?,
                    )
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Update, responder, _| {
                let result = async {
                    require(&update.1, CAPABILITY, None)?;
                    value(
                        update
                            .0
                            .update_chat_selection(request.0)
                            .await
                            .map_err(host_error)?,
                    )
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Receipt, responder, _| {
                let result = async {
                    require(&receipt.1, CAPABILITY, None)?;
                    value(
                        receipt
                            .0
                            .chat_selection_receipt(
                                request.cwd,
                                request.session_id,
                                request.operation_id,
                            )
                            .await
                            .map_err(host_error)?,
                    )
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Ack, responder, _| {
                let result = async {
                    require(&ack.1, CAPABILITY, None)?;
                    ack.0
                        .acknowledge_chat_selection(
                            request.cwd,
                            request.session_id,
                            request.operation_id,
                        )
                        .await
                        .map_err(host_error)?;
                    Ok(Value::Null)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Create, responder, _| {
                let result = async {
                    require(&sessions, CAPABILITY, None)?;
                    value(
                        host.create_chat_with_selection(
                            request.cwd,
                            request.session_id,
                            request.request_id,
                            request.selection,
                        )
                        .await
                        .map_err(host_error)?,
                    )
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
