//! GRIDA-SEC-004 — private supervisor permission selection, never a model tool.

use super::*;
use crate::host::PermissionModeUpdate;
use std::path::PathBuf;

pub(super) const CAPABILITY: &str = "co.grida/session/permission-mode";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/permission-mode", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Inspect {
    cwd: PathBuf,
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/permission-mode/update", response = Value)]
#[serde(transparent)]
struct Update(PermissionModeUpdate);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/permission-mode/ack", response = Value)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ack {
    cwd: PathBuf,
    session_id: SessionId,
    request_id: ChangeId,
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let inspect = (host.clone(), sessions.clone());
    let update = (host.clone(), sessions.clone());
    RequestRoutes::default()
        .on_receive_request(
            async move |request: Inspect, responder, _| {
                let result = async {
                    require(&inspect.1, CAPABILITY, Some(&request.session_id))?;
                    serde_json::to_value(
                        inspect
                            .0
                            .permission_mode(request.cwd, request.session_id)
                            .await
                            .map_err(host_error)?,
                    )
                    .map_err(|_| Error::internal_error())
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Update, responder, _| {
                let result = async {
                    require(&update.1, CAPABILITY, Some(&request.0.session_id))?;
                    serde_json::to_value(
                        update
                            .0
                            .update_permission_mode(request.0)
                            .await
                            .map_err(host_error)?,
                    )
                    .map_err(|_| Error::internal_error())
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Ack, responder, _| {
                let result = async {
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    host.acknowledge_permission_mode(
                        request.cwd,
                        request.session_id,
                        request.request_id,
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
}
