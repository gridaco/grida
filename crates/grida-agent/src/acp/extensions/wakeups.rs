//! GRIDA-SEC-004 — Private negotiated controls for an existing task wake-up.

use super::*;
use crate::host::Wakeups;
use agent_kit_core::WaitId;

const LIST: &str = "co.grida/session/wakeups";
const CANCEL: &str = "co.grida/session/cancel-wakeup";
const RECOVER: &str = "co.grida/session/recover-wakeup";
const CAPABILITIES: [&str; 3] = [LIST, CANCEL, RECOVER];

pub(super) fn capabilities(private: bool) -> impl Iterator<Item = &'static str> {
    CAPABILITIES.into_iter().filter(move |_| private)
}

pub(super) fn available(sessions: &Mutex<ConnectionSessions>) -> bool {
    let sessions = sessions.lock().unwrap();
    CAPABILITIES
        .iter()
        .all(|capability| sessions.negotiated.contains(capability))
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/wakeups", response = WakeupsResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListWakeups {
    session_id: SessionId,
    turn_id: TurnId,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WakeupTarget {
    session_id: SessionId,
    turn_id: TurnId,
    wait_id: WaitId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/cancel-wakeup", response = WakeupsResponse)]
#[serde(transparent)]
struct CancelWakeup(WakeupTarget);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/recover-wakeup", response = WakeupsResponse)]
#[serde(transparent)]
struct RecoverWakeup(WakeupTarget);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct WakeupsResponse(Wakeups);

pub(super) fn handlers(
    host: Arc<Host>,
    sessions: Arc<Mutex<ConnectionSessions>>,
) -> Builder<Agent, impl HandleDispatchFrom<Client>> {
    let list = (host.clone(), sessions.clone());
    let cancel = (host.clone(), sessions.clone());
    Agent
        .v1()
        .on_receive_request(
            async move |request: ListWakeups, responder, _| {
                let result = async {
                    require(&list.1, LIST, Some(&request.session_id))?;
                    list.0
                        .wakeups(request.session_id, request.turn_id)
                        .await
                        .map(WakeupsResponse)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |CancelWakeup(request): CancelWakeup, responder, _| {
                let result = async {
                    require(&cancel.1, CANCEL, Some(&request.session_id))?;
                    cancel
                        .0
                        .cancel_wakeup(request.session_id, request.turn_id, request.wait_id)
                        .await
                        .map(WakeupsResponse)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |RecoverWakeup(request): RecoverWakeup, responder, _| {
                let result = async {
                    require(&sessions, RECOVER, Some(&request.session_id))?;
                    host.recover_wakeup(request.session_id, request.turn_id, request.wait_id)
                        .await
                        .map(WakeupsResponse)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
