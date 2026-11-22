//! Structured result of one scoped automatic review.

use super::{AskReason, MAX_RATIONALE_BYTES, MAX_SCOPED_REPLY_BYTES, reply_text};
use agent_kit_core::inference::{FailureKind, InferenceOutcome};
use agent_kit_core::messages::MessagePhase;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserAuthorization {
    #[default]
    Unknown,
    Low,
    Medium,
    High,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssessmentOutcome {
    Allow,
    Deny,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Assessment {
    pub risk_level: RiskLevel,
    pub user_authorization: UserAuthorization,
    pub outcome: AssessmentOutcome,
    pub rationale: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    risk_level: Option<RiskLevel>,
    #[serde(default)]
    user_authorization: UserAuthorization,
    outcome: AssessmentOutcome,
    rationale: Option<String>,
}

pub(super) fn parse(response: &InferenceOutcome) -> Result<Assessment, AskReason> {
    if response
        .failure
        .as_ref()
        .is_some_and(|failure| failure.kind == FailureKind::Cancelled && failure.code != "deadline")
    {
        return Err(AskReason::Interrupted);
    }
    let text = reply_text(response, MAX_SCOPED_REPLY_BYTES, |phase| {
        phase != Some(MessagePhase::Progress)
    })?;
    // Providers can fence a final JSON response. An example embedded in an
    // explanation must never grant authority.
    let text = text.trim();
    let json = text
        .strip_prefix("```json\n")
        .or_else(|| text.strip_prefix("```\n"))
        .and_then(|body| body.strip_suffix("```"))
        .unwrap_or(text);
    let Reply {
        risk_level,
        user_authorization,
        outcome,
        rationale,
    } = serde_json::from_str(json).map_err(|_| AskReason::InvalidReply)?;
    let risk_level = risk_level.unwrap_or(match outcome {
        AssessmentOutcome::Allow => RiskLevel::Low,
        AssessmentOutcome::Deny => RiskLevel::High,
    });
    if outcome == AssessmentOutcome::Allow
        && (risk_level == RiskLevel::Critical
            || (risk_level == RiskLevel::High
                && matches!(
                    user_authorization,
                    UserAuthorization::Unknown | UserAuthorization::Low
                )))
    {
        return Err(AskReason::InvalidReply);
    }
    let rationale = rationale.map(|text| {
        // Render a single plain-text line in the terminal and Desktop. Drop
        // nonprinting controls, including bidirectional overrides.
        let text = text.replace(|c: char| c.is_control() || matches!(c, '\u{061c}' | '\u{200e}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'), " ");
        let mut text = text.split_whitespace().collect::<Vec<_>>().join(" ");
        text.truncate(text.floor_char_boundary(MAX_RATIONALE_BYTES.min(text.len())));
        text
    }).filter(|text| !text.is_empty()).unwrap_or_else(|| match outcome {
        AssessmentOutcome::Allow => "Automatic review allowed this action.".into(),
        AssessmentOutcome::Deny => "Automatic review declined this action.".into(),
    });
    Ok(Assessment {
        risk_level,
        user_authorization,
        outcome,
        rationale,
    })
}
