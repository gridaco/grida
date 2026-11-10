//! GRIDA-SEC-004 — retained terminal accounts and exact private artifact reads.

use super::*;
use crate::host::CropArtifact;
use agent_kit_core::OperationId;
use agent_kit_core::turn::TurnOutcome;
use base64::{Engine, engine::general_purpose::STANDARD};
use grida_agent_master::hooks::CheckStatus;
use grida_agent_master::{ToolActivity, read_account};
use std::fmt;

pub(super) const SUMMARY: &str = "co.grida/session/turn-summary";
const ARTIFACTS: &str = "co.grida/session/artifacts";
const MAX_TEXT_BYTES: usize = 8 * 1024;

pub(super) fn artifact_capability(private_stdio: bool) -> Option<&'static str> {
    (private_stdio && cfg!(any(target_os = "macos", target_os = "linux"))).then_some(ARTIFACTS)
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/turn-summary", response = SummaryResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SummaryRequest {
    session_id: SessionId,
    turn_id: TurnId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub(super) struct SummaryResponse {
    turn_id: TurnId,
    status: OutcomeStatus,
    text: String,
    text_truncated: bool,
    steps: Option<u32>,
    unresolved_operations: Option<usize>,
    tool_activity: Option<ToolActivity>,
    checks: Vec<CheckStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artifacts: Option<Vec<CropArtifact>>,
}

impl SummaryResponse {
    pub(super) fn from_outcome(turn_id: TurnId, outcome: &TurnOutcome) -> Self {
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
            artifacts: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/read-artifact", response = ArtifactResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArtifactRequest {
    session_id: SessionId,
    turn_id: TurnId,
    artifact_id: OperationId,
}

#[derive(Clone, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ArtifactResponse {
    artifact_id: OperationId,
    mime_type: String,
    data: String,
}

impl fmt::Debug for ArtifactResponse {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ArtifactResponse")
            .field("artifact_id", &self.artifact_id)
            .field("mime_type", &self.mime_type)
            .field("encoded_bytes", &self.data.len())
            .finish()
    }
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let summary_host = host.clone();
    let summary_sessions = sessions.clone();
    RequestRoutes::default()
        .on_receive_request(
            async move |request: SummaryRequest, responder, _| {
                let result = async {
                    require(&summary_sessions, SUMMARY, Some(&request.session_id))?;
                    let include_artifacts = summary_sessions
                        .lock()
                        .unwrap()
                        .negotiated
                        .contains(ARTIFACTS);
                    let (outcome, artifacts) = summary_host
                        .settled_summary(
                            request.session_id.clone(),
                            request.turn_id.clone(),
                            include_artifacts,
                        )
                        .await
                        .map_err(host_error)?;
                    require(&summary_sessions, SUMMARY, Some(&request.session_id))?;
                    if include_artifacts {
                        require(&summary_sessions, ARTIFACTS, Some(&request.session_id))?;
                    }
                    let mut summary = SummaryResponse::from_outcome(request.turn_id, &outcome);
                    summary.artifacts = artifacts;
                    Ok(summary)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ArtifactRequest, responder, _| {
                let result = async {
                    require(&sessions, ARTIFACTS, Some(&request.session_id))?;
                    let bytes = host
                        .read_crop_artifact(
                            request.session_id.clone(),
                            request.turn_id,
                            request.artifact_id.clone(),
                        )
                        .await
                        .map_err(host_error)?;
                    require(&sessions, ARTIFACTS, Some(&request.session_id))?;
                    Ok(ArtifactResponse {
                        artifact_id: request.artifact_id,
                        mime_type: "image/png".into(),
                        data: STANDARD.encode(bytes),
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
