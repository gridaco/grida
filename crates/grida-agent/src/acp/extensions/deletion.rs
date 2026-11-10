//! GRIDA-SEC-004 — explicit saved-chat retirement over the private connection.

use super::*;
use crate::acp::observation::Retirement;
use crate::host::deletion::SavedChatDeletion;
use crate::host::side_chats::SideChats;
use agent_kit_core::ErrorKind;
use agent_kit_store_sqlite::deletion::SessionDeleted;
use std::path::PathBuf;

pub(super) const DELETE: &str = "co.grida/session/delete";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/delete", response = Deleted)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Delete {
    session_id: SessionId,
    cwd: PathBuf,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_catalog_revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct Deleted {
    session_id: SessionId,
    request_id: ChangeId,
}

impl From<SessionDeleted> for Deleted {
    fn from(receipt: SessionDeleted) -> Self {
        Self {
            session_id: receipt.session,
            request_id: receipt.request,
        }
    }
}

pub(super) fn handlers(
    host: Arc<Host>,
    sessions: Arc<Mutex<ConnectionSessions>>,
    sides: Option<Arc<SideChats>>,
) -> RequestRoutes {
    RequestRoutes::default().on_receive_request(
        async move |request: Delete, responder, _| {
            let result = async {
                require(&sessions, DELETE, None)?;
                let sides = sides.clone().ok_or_else(Error::method_not_found)?;
                let fence = Retirement::begin(&sessions, &request.session_id)?;
                let request = SavedChatDeletion {
                    session: request.session_id,
                    cwd: request.cwd,
                    request: request.request_id,
                    expected_revision: request.expected_session_revision,
                    expected_catalog_revision: request.expected_catalog_revision,
                };
                let Some(fence) = fence else {
                    return host
                        .saved_chat_deletion_receipt(request)
                        .await
                        .map_err(host_error)?
                        .map(Deleted::from)
                        .ok_or_else(|| unavailable("session_setup_required"));
                };
                let host = host.clone();
                // The fence follows the admitted mutation even if its requester
                // cancels before the durable disposition reaches the connection.
                tokio::spawn(async move {
                    if sides.has_open_parent(&request.session).await {
                        return Err(unavailable("session_deletion_has_side_chat"));
                    }
                    let result = host.delete_saved_chat(request).await;
                    if result.is_ok()
                        || result
                            .as_ref()
                            .is_err_and(|error| error.kind == ErrorKind::Uncertain)
                    {
                        fence.revoke();
                    }
                    result.map(Deleted::from).map_err(host_error)
                })
                .await
                .map_err(|_| unavailable("session_deletion_unverified"))?
            }
            .await;
            responder.respond_with_result(result)
        },
        on_receive_request!(),
    )
}
