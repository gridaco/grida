//! GRIDA-SEC-004 — retained terminal accounts and exact private artifact reads.

use super::*;
use crate::host::CropArtifact;
use agent_kit_core::inference::{MeasurementKind, usage};
use agent_kit_core::turn::TurnOutcome;
use agent_kit_core::{AttemptId, OperationId};
use base64::{Engine, engine::general_purpose::STANDARD};
use grida_agent_master::hooks::CheckStatus;
use grida_agent_master::usage::InferenceUsage;
use grida_agent_master::{ToolActivity, read_account};
use std::collections::{BTreeMap, BTreeSet};
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    child_billing_after: Option<crate::gg::GatewayChildBillingRef>,
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
    review_findings_collected: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_usage: Option<ReportedTokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    gateway_billing: Option<crate::gg::GatewayTurnBilling>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artifacts: Option<Vec<CropArtifact>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artifacts_omitted: Option<usize>,
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
            tool_activity: account.as_ref().map(|account| account.tool_activity),
            token_usage: account
                .as_ref()
                .and_then(|account| ReportedTokenUsage::from_usage(&account.inference_usage)),
            gateway_billing: None,
            review_findings_collected: account
                .as_ref()
                .and_then(|account| account.independent_review.as_ref())
                .map(|review| review.findings_collected),
            checks: account.map_or_else(Vec::new, |account| {
                account
                    .completion_checks
                    .into_iter()
                    .map(|check| check.status)
                    .collect()
            }),
            artifacts: None,
            artifacts_omitted: None,
        }
    }

    fn prepend_factual_note(&mut self, note: &str) {
        self.text.insert_str(0, "\n\n");
        self.text.insert_str(0, note);
        let end = self.text.floor_char_boundary(MAX_TEXT_BYTES);
        self.text_truncated |= end < self.text.len();
        self.text.truncate(end);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportedTokenUsage {
    reported: Vec<ReportedTokenCount>,
    attempts_without_counts: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportedTokenCount {
    category: TokenCategory,
    /// Decimal preserves the exact subtotal on clients with narrower numbers.
    tokens: String,
    partial: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum TokenCategory {
    Input,
    Output,
    UncachedInput,
    CachedInput,
    CacheCreationInput,
    ToolInput,
    ReasoningOutput,
}

impl TokenCategory {
    fn from_provider(category: &str) -> Option<Self> {
        match category {
            usage::INPUT_TOKENS => Some(Self::Input),
            usage::OUTPUT_TOKENS => Some(Self::Output),
            usage::UNCACHED_INPUT_TOKENS => Some(Self::UncachedInput),
            usage::CACHED_INPUT_TOKENS => Some(Self::CachedInput),
            usage::CACHE_CREATION_INPUT_TOKENS => Some(Self::CacheCreationInput),
            usage::TOOL_INPUT_TOKENS => Some(Self::ToolInput),
            usage::REASONING_OUTPUT_TOKENS => Some(Self::ReasoningOutput),
            _ => None,
        }
    }
}

impl ReportedTokenUsage {
    fn from_usage(usage: &InferenceUsage) -> Option<Self> {
        let mut attempts: BTreeSet<_> = usage.unreported_attempts.iter().collect();
        let mut categories: BTreeMap<_, BTreeMap<&AttemptId, _>> = BTreeMap::new();
        for observation in &usage.observations {
            attempts.insert(&observation.attempt);
            if observation.unit != usage::TOKENS || observation.certainty != MeasurementKind::Exact
            {
                continue;
            }
            let Some(category) = TokenCategory::from_provider(&observation.category) else {
                continue;
            };
            // The account already retains the newest revision per source. If
            // two sources claim one metric for the same attempt, that metric
            // lacks a unique value for this projection.
            categories
                .entry(category)
                .or_default()
                .entry(&observation.attempt)
                .and_modify(|value| *value = None)
                .or_insert(Some(observation));
        }
        if attempts.is_empty() {
            return None;
        }
        let mut counted = BTreeSet::new();
        let mut reported = Vec::new();
        for (category, observations) in categories {
            let mut coverage = 0;
            let mut final_values = true;
            let mut tokens = 0_u128;
            for (attempt, observation) in observations {
                let Some(observation) = observation else {
                    continue;
                };
                counted.insert(attempt);
                coverage += 1;
                tokens += u128::from(observation.quantity);
                final_values &= observation.final_value;
            }
            if coverage > 0 {
                reported.push(ReportedTokenCount {
                    category,
                    tokens: tokens.to_string(),
                    partial: coverage < attempts.len() || !final_values,
                });
            }
        }
        Some(Self {
            reported,
            attempts_without_counts: attempts.len() - counted.len(),
        })
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
                    let (include_artifacts, include_gateway_billing, include_child_billing) = {
                        let sessions = summary_sessions.lock().unwrap();
                        (
                            sessions.negotiated.contains(ARTIFACTS),
                            sessions.negotiated.contains(gateway_billing::CAPABILITY),
                            sessions
                                .negotiated
                                .contains(gateway_billing::CHILD_CAPABILITY),
                        )
                    };
                    if request.child_billing_after.is_some() {
                        require(
                            &summary_sessions,
                            gateway_billing::CHILD_CAPABILITY,
                            Some(&request.session_id),
                        )?;
                    }
                    let (outcome, artifacts, image_generation, gateway_billing) = summary_host
                        .settled_summary(
                            request.session_id.clone(),
                            request.turn_id.clone(),
                            include_artifacts,
                            include_gateway_billing,
                            include_child_billing,
                            request.child_billing_after,
                        )
                        .await
                        .map_err(host_error)?;
                    require(&summary_sessions, SUMMARY, Some(&request.session_id))?;
                    if include_artifacts {
                        require(&summary_sessions, ARTIFACTS, Some(&request.session_id))?;
                    }
                    if include_gateway_billing {
                        require(
                            &summary_sessions,
                            gateway_billing::CAPABILITY,
                            Some(&request.session_id),
                        )?;
                    }
                    if include_child_billing {
                        require(
                            &summary_sessions,
                            gateway_billing::CHILD_CAPABILITY,
                            Some(&request.session_id),
                        )?;
                    }
                    let mut summary = SummaryResponse::from_outcome(request.turn_id, &outcome);
                    summary.gateway_billing = gateway_billing;
                    if let Some(note) = image_generation {
                        summary.prepend_factual_note(note);
                    }
                    if let Some(artifacts) = artifacts {
                        summary.artifacts = Some(artifacts.items);
                        summary.artifacts_omitted =
                            (artifacts.omitted > 0).then_some(artifacts.omitted);
                    }
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
