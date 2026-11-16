//! GRIDA-SEC-004 — supervisor-only connection replacement preparation.

use super::*;
use crate::host::model_change::ModelChangeInspection;

pub(super) const MODEL_CHANGE: &str = "co.grida/session/model-change";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/model-change", response = InspectResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Inspect {
    session_id: Option<SessionId>,
    #[serde(default)]
    prepare: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct InspectResponse(ModelChangeInspection);

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    RequestRoutes::default().on_receive_request(
        async move |request: Inspect, responder, _| {
            let result = async {
                require(&sessions, MODEL_CHANGE, request.session_id.as_ref())?;
                host.inspect_model_change(request.session_id, request.prepare)
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
