//! GRIDA-SEC-004 — observational inspection of attached, trusted hook policy.

use super::*;
use crate::host::HookInspection;

pub(super) const INSPECT: &str = "co.grida/session/hooks";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/hooks", response = InspectResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Inspect {
    session_id: Option<SessionId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct InspectResponse(HookInspection);

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    RequestRoutes::default().on_receive_request(
        async move |request: Inspect, responder, _| {
            let result = async {
                require(&sessions, INSPECT, request.session_id.as_ref())?;
                host.inspect_hooks(request.session_id)
                    .await
                    .map(InspectResponse)
                    .map_err(host_error)
            }
            .await;
            responder.respond_with_result(result)
        },
        on_receive_request!(),
    )
}
