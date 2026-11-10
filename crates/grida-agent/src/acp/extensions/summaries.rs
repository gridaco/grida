//! Read a retained terminal account through an attached conversation.

use super::*;
use agent_kit_core::turn::TurnOutcome;
use grida_agent_master::hooks::CheckStatus;
use grida_agent_master::{ToolActivity, read_account};

pub(super) const SUMMARY: &str = "co.grida/session/turn-summary";
const MAX_TEXT_BYTES: usize = 8 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/turn-summary", response = SummaryResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SummaryRequest {
    session_id: SessionId,
    turn_id: TurnId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct SummaryResponse {
    turn_id: TurnId,
    status: OutcomeStatus,
    text: String,
    text_truncated: bool,
    steps: Option<u32>,
    unresolved_operations: Option<usize>,
    tool_activity: Option<ToolActivity>,
    checks: Vec<CheckStatus>,
}

impl SummaryResponse {
    fn from_outcome(turn_id: TurnId, outcome: TurnOutcome) -> Self {
        let account = outcome
            .account
            .as_ref()
            .and_then(|data| read_account(data).ok());
        let fallback = match outcome.status {
            OutcomeStatus::Succeeded => "The turn finished.",
            OutcomeStatus::Failed => "The turn failed.",
            OutcomeStatus::Cancelled => "The turn was stopped.",
            OutcomeStatus::Uncertain => "The turn ended with unverified work.",
        };
        let text = account
            .as_ref()
            .map(|account| account.text.as_str())
            .filter(|text| !text.trim().is_empty())
            .unwrap_or(fallback);
        let end = text.floor_char_boundary(MAX_TEXT_BYTES);
        Self {
            turn_id,
            status: outcome.status,
            text: text[..end].to_owned(),
            text_truncated: end < text.len(),
            steps: account.as_ref().map(|account| account.steps),
            unresolved_operations: account.as_ref().map(|account| account.unresolved.len()),
            tool_activity: account.as_ref().and_then(|account| account.tool_activity),
            checks: account.map_or_else(Vec::new, |account| {
                account
                    .completion_checks
                    .into_iter()
                    .map(|check| check.status)
                    .collect()
            }),
        }
    }
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    RequestRoutes::default().on_receive_request(
        async move |request: SummaryRequest, responder, _| {
            let result = async {
                require(&sessions, SUMMARY, Some(&request.session_id))?;
                let outcome = host
                    .settled_outcome(request.session_id, request.turn_id.clone())
                    .await
                    .map_err(host_error)?;
                Ok(SummaryResponse::from_outcome(request.turn_id, outcome))
            }
            .await;
            responder.respond_with_result(result)
        },
        on_receive_request!(),
    )
}
