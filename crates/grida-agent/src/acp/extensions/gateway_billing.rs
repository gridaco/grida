//! GRIDA-SEC-006 / GRIDA-GG: provider — read settlement for a retained Gateway attempt.

use super::*;
use crate::gg::GatewayBillingRead;
use agent_kit_core::{AttemptId, OperationId};
use std::time::Duration;

pub(in crate::acp) const CAPABILITY: &str = "co.grida/gateway/billing-status";
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Debug, Deserialize, Serialize, JsonRpcRequest)]
#[request(method = "_co.grida/gateway/billing-status", response = GatewayBillingRead)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Status {
    session_id: SessionId,
    turn_id: TurnId,
    operation_id: OperationId,
    attempt_id: AttemptId,
}

#[derive(Clone, Deserialize, Serialize, JsonRpcRequest)]
#[request(method = "_co.grida/gateway/read-job-billing", response = GatewayBillingRead)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadJob {
    request_id: String,
}

impl std::fmt::Debug for ReadJob {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("GatewayBillingReadJob")
    }
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    RequestRoutes::default().on_receive_request(
        async move |request: Status, responder, connection| {
            let host = host.clone();
            let sessions = sessions.clone();
            let client = connection.clone();
            connection.spawn(async move {
                let result = async {
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    let request_id = host
                        .gateway_billing_request_id(
                            request.session_id.clone(),
                            request.turn_id,
                            request.operation_id,
                            request.attempt_id,
                        )
                        .await;
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    let Some(request_id) = request_id else {
                        return Ok(GatewayBillingRead::Unavailable);
                    };
                    let reply = tokio::time::timeout(LOOKUP_TIMEOUT, async {
                        client
                            .send_request(ReadJob { request_id })
                            .block_task()
                            .await
                    })
                    .await;
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    Ok(reply
                        .ok()
                        .and_then(std::result::Result::ok)
                        .map_or(GatewayBillingRead::Unavailable, GatewayBillingRead::checked))
                }
                .await;
                responder.respond_with_result(result)
            })
        },
        on_receive_request!(),
    )
}
