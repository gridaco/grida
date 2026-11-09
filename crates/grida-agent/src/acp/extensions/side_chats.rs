//! GRIDA-SEC-004 — Side conversations are private to the negotiated client connection.

use super::*;
use crate::host::side_chats::{SideAnswer, SideChatView, SideChats};

const OPEN: &str = "co.grida/side-chat/open";
const ASK: &str = "co.grida/side-chat/ask";
const CLOSE: &str = "co.grida/side-chat/close";
const CAPABILITIES: [&str; 3] = [OPEN, ASK, CLOSE];

pub(super) fn capabilities(private: bool) -> impl Iterator<Item = &'static str> {
    CAPABILITIES.into_iter().filter(move |_| private)
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/side-chat/open", response = Opened)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Open {
    session_id: SessionId,
    request_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct Opened(SideChatView);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/side-chat/ask", response = Answer)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ask {
    side_chat_id: SessionId,
    request_id: ChangeId,
    text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct Answer(SideAnswer);

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
) -> Builder<Agent, impl HandleDispatchFrom<Client>> {
    let open = (sessions.clone(), scope.clone());
    let ask = (sessions.clone(), scope.clone());
    Agent
        .v1()
        .on_receive_request(
            async move |request: Open, responder, _| {
                let result = async {
                    for key in CAPABILITIES {
                        require(&open.0, key, Some(&request.session_id))?;
                    }
                    open.1
                        .as_ref()
                        .ok_or_else(Error::method_not_found)?
                        .open(&host, request.session_id, request.request_id)
                        .await
                        .map(Opened)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Ask, responder, connection| {
                let scope = match require(&ask.0, ASK, None)
                    .and_then(|()| ask.1.clone().ok_or_else(Error::method_not_found))
                {
                    Ok(scope) => scope,
                    Err(error) => return responder.respond_with_error(error),
                };
                connection.spawn(async move {
                    let cancellation = responder.cancellation();
                    let result = async {
                        let chat = scope.get(&request.side_chat_id).await.map_err(host_error)?;
                        chat.ask(request.request_id, request.text, cancellation.cancelled())
                            .await
                            .map(Answer)
                            .map_err(host_error)
                    }
                    .await;
                    responder.respond_with_result(result)
                })
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Close, responder, _| {
                let result = async {
                    require(&sessions, CLOSE, None)?;
                    scope
                        .as_ref()
                        .ok_or_else(Error::method_not_found)?
                        .close(&request.side_chat_id)
                        .await
                        .map(|()| Closed {})
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
