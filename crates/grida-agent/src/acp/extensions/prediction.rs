//! Private, negotiated one-shot prediction for an attached conversation.
use super::*;
use crate::host::prediction::Prediction;
use std::time::{Duration, Instant};

pub(super) const CAPABILITY: &str = "co.grida/session/predict-prompt";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/predict-prompt", response = Response)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Predict {
    session_id: SessionId,
    turn_id: TurnId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct Response {
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model_id: Option<agent_kit_core::ModelId>,
    elapsed_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_usage: Option<summaries::ReportedTokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    gateway_billing: Option<crate::gg::GatewayBillingRead>,
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    RequestRoutes::default().on_supervised_request(
        async move |request: Predict, responder, client| {
            let cancellation = responder.cancellation();
            let result = async {
                require(&sessions, CAPABILITY, Some(&request.session_id))?;
                let started = Instant::now();
                let deadline = started + grida_agent_master::prediction::TIMEOUT;
                let billing_sessions = sessions.clone();
                let billing_session = request.session_id.clone();
                let refresh = |route_id, request_id| async move {
                    if require(&billing_sessions, gateway_billing::CAPABILITY, Some(&billing_session)).is_err() {
                        return crate::gg::GatewayBillingRead::Unavailable;
                    }
                    // Settlement is optional. Leave time to return the draft and
                    // the original pending receipt even if the lookup stalls.
                    let timeout = deadline.saturating_duration_since(Instant::now())
                        .saturating_sub(Duration::from_millis(100)).min(Duration::from_secs(1));
                    gateway_billing::read_job(&client, route_id, request_id, timeout).await
                };
                let prediction = tokio::select! {
                    biased;
                    _ = cancellation.cancelled() => Prediction::default(),
                    result = tokio::time::timeout_at(deadline.into(),
                        host.predict_prompt(&request.session_id, &request.turn_id, deadline,
                            || require(&sessions, CAPABILITY, Some(&request.session_id)).is_ok(), refresh))
                        => result.ok().and_then(std::result::Result::ok).unwrap_or_default(),
                };
                require(&sessions, CAPABILITY, Some(&request.session_id))?;
                Ok(Response {
                    gateway_billing: prediction.gateway_billing.filter(|_| {
                        sessions
                            .lock()
                            .unwrap()
                            .negotiated
                            .contains(gateway_billing::CAPABILITY)
                    }),
                    text: prediction.text,
                    model_id: prediction.model_id,
                    elapsed_ms: started.elapsed().as_millis() as u64,
                    token_usage: summaries::ReportedTokenUsage::from_usage(&prediction.usage),
                })
            }
            .await;
            responder.respond_with_result(result)
        },
        on_receive_request!(),
    )
}
