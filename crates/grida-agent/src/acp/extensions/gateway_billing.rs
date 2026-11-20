//! GRIDA-SEC-006 / GRIDA-GG: provider — read settlement for a retained Gateway attempt.

use super::*;
use crate::gg::{GatewayBillingRead, GatewayChildBillingRef};
use agent_client_protocol::v1::ConnectionTo;
use agent_kit_core::{AttemptId, OperationId};
use std::time::Duration;

pub(in crate::acp) const CAPABILITY: &str = "co.grida/gateway/billing-status";
pub(in crate::acp) const CHILD_CAPABILITY: &str = "co.grida/gateway/child-billing";
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Debug, Deserialize, Serialize, JsonRpcRequest)]
#[request(method = "_co.grida/gateway/billing-status", response = GatewayBillingRead)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Status {
    session_id: SessionId,
    turn_id: TurnId,
    operation_id: OperationId,
    attempt_id: AttemptId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    child: Option<GatewayChildBillingRef>,
}

#[derive(Clone, Deserialize, Serialize, JsonRpcRequest)]
#[request(method = "_co.grida/gateway/read-job-billing", response = GatewayBillingRead)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadJob {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    route_id: Option<uuid::Uuid>,
    request_id: String,
}

impl std::fmt::Debug for ReadJob {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("GatewayBillingReadJob")
    }
}

pub(super) async fn read_job(
    client: &ConnectionTo<Client>,
    route_id: Option<uuid::Uuid>,
    request_id: String,
    timeout: Duration,
) -> GatewayBillingRead {
    tokio::time::timeout(timeout, async {
        client
            .send_request(ReadJob {
                request_id,
                route_id,
            })
            .block_task()
            .await
    })
    .await
    .ok()
    .and_then(std::result::Result::ok)
    .map_or(GatewayBillingRead::Unavailable, GatewayBillingRead::checked)
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
                    let has_child = request.child.is_some();
                    if has_child {
                        require(&sessions, CHILD_CAPABILITY, Some(&request.session_id))?;
                    }
                    let Ok(host) = host.for_turn(&request.session_id, &request.turn_id).await
                    else {
                        return Ok(GatewayBillingRead::Unavailable);
                    };
                    let request_id = host
                        .gateway_billing_request_id(
                            request.session_id.clone(),
                            request.turn_id.clone(),
                            request.operation_id.clone(),
                            request.attempt_id.clone(),
                            request.child.clone(),
                        )
                        .await;
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    if has_child {
                        require(&sessions, CHILD_CAPABILITY, Some(&request.session_id))?;
                    }
                    let Some(request_id) = request_id else {
                        return Ok(GatewayBillingRead::Unavailable);
                    };
                    let billing = read_job(
                        &client,
                        host.supervised_route_id(),
                        request_id,
                        LOOKUP_TIMEOUT,
                    )
                    .await;
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    if has_child {
                        require(&sessions, CHILD_CAPABILITY, Some(&request.session_id))?;
                    }
                    host.retain_spending_settlement(
                        request.session_id,
                        request.turn_id,
                        request.attempt_id,
                        &billing,
                    )
                    .await
                    .map_err(host_error)?;
                    Ok(billing)
                }
                .await;
                responder.respond_with_result(result)
            })
        },
        on_receive_request!(),
    )
}
