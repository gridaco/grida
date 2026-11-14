//! GRIDA-SEC-004 — Side chats are private to the negotiated client connection.
//!
//! Opening a side chat attaches its session to this connection, so every
//! ordinary session method and live update applies to it here. Closing it, or
//! closing the connection, discards it.

use super::*;
use crate::acp::observation::Observation;
use crate::host::side_chats::{SideChatView, SideChats};

const OPEN: &str = "co.grida/side-chat/open";
const CLOSE: &str = "co.grida/side-chat/close";
const CAPABILITIES: [&str; 2] = [OPEN, CLOSE];

pub(super) fn capabilities(private: bool) -> impl Iterator<Item = &'static str> {
    CAPABILITIES.into_iter().filter(move |_| private)
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/side-chat/open", response = Opened)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Open {
    session_id: SessionId,
    /// The client's key for this open. Repeating it returns the side chat it
    /// opened while that side chat stays open.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    request_id: Option<ChangeId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct Opened(SideChatView);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/side-chat/close", response = Closed)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Close {
    side_chat_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
struct Closed {}

pub(super) fn handlers(
    host: Arc<Host>,
    sessions: Arc<Mutex<ConnectionSessions>>,
    scope: Option<Arc<SideChats>>,
) -> RequestRoutes {
    let open = (host.clone(), sessions.clone(), scope.clone());
    RequestRoutes::default()
        .on_receive_request(
            async move |request: Open, responder, _| {
                let _observation = match Observation::begin(&open.1, Some(&request.session_id)) {
                    Ok(guard) => guard,
                    Err(error) => return responder.respond_with_error(error),
                };
                let result = async {
                    for key in CAPABILITIES {
                        require(&open.1, key, Some(&request.session_id))?;
                    }
                    let scope = open.2.as_ref().ok_or_else(Error::method_not_found)?;
                    let sessions = &open.1;
                    let view = scope
                        .open(
                            &open.0,
                            request.session_id,
                            request.request_id,
                            || {
                                sessions.lock().unwrap().ensure_capacity(None).map_err(|_| {
                                    agent_kit_core::Error::new(
                                        agent_kit_core::ErrorKind::LimitExceeded,
                                        "attached_session_limit",
                                    )
                                })
                            },
                            |view| {
                                sessions
                                    .lock()
                                    .unwrap()
                                    .attached
                                    .insert(view.side_chat_id.clone());
                            },
                        )
                        .await
                        .map_err(host_error)?;
                    Ok(Opened(view))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Close, responder, _| {
                let result = async {
                    require(&sessions, CLOSE, None)?;
                    let scope = scope.as_ref().ok_or_else(Error::method_not_found)?;
                    let id = request.side_chat_id;
                    if !scope.owns(&id).await {
                        return Err(unavailable("side_chat_unavailable"));
                    }
                    // Stop delivering the side chat while it is discarded.
                    sessions.lock().unwrap().retiring.insert(id.clone());
                    let result = scope.close(&host, &id).await;
                    let mut state = sessions.lock().unwrap();
                    state.retiring.remove(&id);
                    if result.is_ok() {
                        state.attached.remove(&id);
                    }
                    result.map(|()| Closed {}).map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
