//! Eligibility, evidence and decision policy for bounded private approval review.

use agent_kit_core::authority::GrantSelection;
use agent_kit_core::history::HistoryPosition;
use agent_kit_core::inference::{
    FailureKind, InferenceOutcome, InferenceRequest, InferenceStatus, PreparedRequest,
};
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
use agent_kit_core::turn::{
    ControlRevision, OperationInput, OperationOutcome, OperationState, TurnState,
};
use agent_kit_core::{
    BindingId, BoxFuture, Error, ErrorKind, Fingerprint, MessageId, OperationId, Result, WaitId,
};
use agent_kit_runtime::{OperationKey, TurnOperations, TurnView};
use serde::{Deserialize, Serialize};
use std::time::Duration;

mod assessment;
mod command_safety;
pub use assessment::{Assessment, AssessmentOutcome, RiskLevel, UserAuthorization};
pub use command_safety::requires_command_review;

const MAX_PATH_BYTES: usize = 512;
const MAX_INTENT_BYTES: usize = 2048;
const MAX_EVIDENCE_BYTES: usize = 4096;
const MAX_REPLY_BYTES: usize = 64;
const MAX_OUTPUT_TOKENS: u64 = 128;
const INSTRUCTIONS: &str = include_str!("prompts/approval-review.md").trim_ascii_end();
const SCOPED_POLICY_ID: &str = "approval-review/assessment-policy-v2";
const SCOPED_INSTRUCTIONS: &str =
    include_str!("prompts/scoped-approval-review.md").trim_ascii_end();
const MAX_SCOPED_EVIDENCE_BYTES: usize = 32 * 1024;
const MAX_SCOPED_REPLY_BYTES: usize = 4096;
const MAX_RATIONALE_BYTES: usize = 512;
/// Host-assigned provenance for a historical action containing private observations.
pub const PRIVATE_OBSERVATION_SOURCE: &str = "approval-review/history/observations";
pub const MAX_REVIEW_ATTEMPTS: u32 = 3;
pub const SCOPED_TIMEOUT: Duration = Duration::from_secs(90);

/// Explicitly selected in trusted host configuration. This identifies the
/// single action eligible for review. The host separately enforces the grant.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadProfile {
    pub directory: BindingId,
    pub relative_path: String,
}

#[derive(Serialize)]
pub struct ReadTarget<'a> {
    pub operation: &'a OperationId,
    pub action: Fingerprint,
    pub scope: Fingerprint,
    pub directory: &'a BindingId,
    pub relative_path: &'a str,
    pub control: ControlRevision,
    pub history: HistoryPosition,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Deny,
    Ask(AskReason),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AskReason {
    TimedOut,
    Interrupted,
    Unavailable,
    InvalidReply,
    NeedsHuman,
}

pub const TIMEOUT: Duration = Duration::from_secs(10);

/// Review deferred tool actions under the same turn's authority.
pub trait Reviewer: Send + Sync {
    /// Explain applied denials on their source tool results in model context.
    /// User approvals and private reviewer reasoning stay outside this projection.
    fn denied_actions(
        &self,
        _state: &TurnState,
    ) -> Result<std::collections::BTreeMap<MessageId, Vec<String>>> {
        Ok(std::collections::BTreeMap::new())
    }

    /// Private single-read policies can reserve a foreground generation. Scoped
    /// safety reviews have their own deadline and the runtime's operation limit.
    fn reserved_foreground_steps(&self) -> u32 {
        1
    }

    fn review<'a>(
        self: std::sync::Arc<Self>,
        operations: &'a TurnOperations,
        basis: &'a TurnView,
        deferred: &'a [WaitId],
    ) -> BoxFuture<'a, Result<bool>>;
}

pub fn operation_key() -> OperationKey {
    OperationKey::new("approval-review").expect("static operation key")
}

impl ReadProfile {
    pub fn validate(&self) -> Result<()> {
        if self.relative_path.len() > MAX_PATH_BYTES
            || self.relative_path.contains('\\')
            || self.relative_path.chars().any(char::is_control)
            || self
                .relative_path
                .split('/')
                .any(|part| matches!(part, "" | "." | ".."))
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_automatic_read_review_path",
            ));
        }
        Ok(())
    }

    pub fn includes(&self, directory: &BindingId, relative_path: &str) -> bool {
        &self.directory == directory && self.relative_path == relative_path
    }

    /// Prepare a private request using only the last supplied user text from
    /// the inference that proposed the action. The host selects that inference
    /// from the recorded origin. Oversized or mixed input stays with Ask.
    pub fn request(
        &self,
        target: &ReadTarget<'_>,
        source: &InferenceRequest,
    ) -> Result<Option<InferenceRequest>> {
        self.validate()?;
        if !self.includes(target.directory, target.relative_path) {
            return Ok(None);
        }
        let Some(output_limit) = source.max_output_tokens.filter(|limit| *limit > 0) else {
            return Ok(None);
        };
        let Some((intent, text)) = supplied_intent(source) else {
            return Ok(None);
        };
        let quoted = serde_json::json!({
            "user_request": text,
            "relative_path": target.relative_path,
        })
        .to_string();
        let basis = Fingerprint::of(&(self, target, &intent.id))?;
        prepare_request(
            source,
            target_fingerprint(target.operation, target.action, target.scope)?,
            format!("approval-review/{}", basis.to_hex()),
            quoted,
            "approval-review/instructions",
            INSTRUCTIONS,
            Some(output_limit.min(MAX_OUTPUT_TOKENS)),
        )
    }
}

/// Issued filesystem permissions before mandatory protected-path exclusions.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandFilesystem {
    pub disk_read: bool,
    pub read_roots: Vec<String>,
    pub write_roots: Vec<String>,
    pub runtime_roots: Vec<String>,
    pub private_temp_write: bool,
    pub resolved_executable: String,
    pub resolved_cwd: String,
}

#[derive(Serialize)]
pub struct CommandReview<'a> {
    pub command: &'a str,
    pub cwd: &'a str,
    pub executable: &'a str,
    pub workspace_root: &'a str,
    pub filesystem_access: &'a str,
    pub filesystem: &'a CommandFilesystem,
    pub environment_names: &'a [String],
    pub terminal: bool,
    pub finite: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "network", rename_all = "snake_case")]
pub enum CommandNetworkScope {
    Denied,
    Managed,
    Listen { listen_port: u16 },
}

/// The host constructs these inputs from a retained approval and its originating
/// inference. The action identifies the execution scope the reviewer must assess.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ScopedAction<'a> {
    EscalatedCommand {
        #[serde(flatten)]
        command: CommandReview<'a>,
        justification: &'a str,
        #[serde(flatten)]
        network: CommandNetworkScope,
    },
    ExternalFileRead {
        absolute_path: &'a str,
    },
    ConfinedCommand {
        #[serde(flatten)]
        command: CommandReview<'a>,
        #[serde(flatten)]
        network: CommandNetworkScope,
    },
    NetworkCommand {
        host: &'a str,
        port: u16,
        #[serde(flatten)]
        command: CommandReview<'a>,
    },
}

#[derive(Serialize)]
pub struct ReviewBasis<'a> {
    pub operation: &'a OperationId,
    pub action: Fingerprint,
    pub scope: Fingerprint,
    pub control: ControlRevision,
    pub history: HistoryPosition,
}

/// Conversation evidence with separate fields for assistant text and user input.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum ReviewExchange {
    Plain {
        user: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        preceding_assistant: Option<String>,
    },
    Questions {
        question_answers: Vec<ReviewQuestionAnswer>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ReviewQuestionAnswer {
    pub question: String,
    pub user_answer: String,
}

impl ReviewExchange {
    /// Size of the attributed contribution, before optional assistant prose.
    pub fn instruction_bytes(&self) -> usize {
        match self {
            Self::Plain { user, .. } => user.len(),
            Self::Questions { question_answers } => question_answers
                .iter()
                .map(|entry| entry.question.len() + entry.user_answer.len())
                .sum(),
        }
    }
}

pub struct ReviewContext<'a> {
    pub intent: &'a Message,
    pub answers: &'a [String],
    pub conversation: &'a [ReviewExchange],
    pub inherited_context: &'a [String],
    pub observed_reference_urls: &'a [String],
    pub action_evidence: &'a [String],
    pub informed_reconsideration: bool,
    pub project_instructions: Option<&'a str>,
}

impl ScopedAction<'_> {
    pub fn request(
        &self,
        target: &ReviewBasis<'_>,
        source: &InferenceRequest,
        context: ReviewContext<'_>,
    ) -> Result<Option<InferenceRequest>> {
        let ReviewContext {
            intent,
            answers,
            conversation,
            inherited_context,
            observed_reference_urls,
            action_evidence,
            informed_reconsideration,
            project_instructions,
        } = context;
        let [Content::Text(text)] = intent.content.as_slice() else {
            return Ok(None);
        };
        if intent.role != Role::User
            || intent.provenance.kind != ProvenanceKind::Supplied
            || text.len() > MAX_SCOPED_EVIDENCE_BYTES
            || text.trim().is_empty()
            || !source.messages.contains(intent)
        {
            return Ok(None);
        }
        if let Self::ExternalFileRead { absolute_path } = self {
            let named = absolute_path.starts_with('/')
                && absolute_path.len() <= MAX_PATH_BYTES
                && (names_path(text, absolute_path)
                    || answers
                        .iter()
                        .any(|answer| names_path(answer, absolute_path)));
            if !named {
                return Ok(None);
            }
        }
        let mut evidence = serde_json::json!({
            "user_request": text, "user_answers": answers,
            "conversation": conversation.iter().map(|entry| match entry {
                ReviewExchange::Plain { user, .. } => serde_json::json!({ "user": user }),
                ReviewExchange::Questions { .. } => serde_json::json!(entry),
            }).collect::<Vec<_>>(),
            "action": self,
        });
        if informed_reconsideration {
            evidence["user_requested_reconsideration_of_exact_action"] = true.into();
        }
        if !inherited_context.is_empty() {
            evidence["inherited_context"] = serde_json::json!(inherited_context);
        }
        if let Some(instructions) = project_instructions {
            evidence["project_instructions"] = instructions.into();
        }
        for (field, values) in [
            ("observed_reference_urls", observed_reference_urls),
            ("action_evidence", action_evidence),
        ] {
            if !values.is_empty() {
                evidence[field] = serde_json::json!(values);
                if evidence.to_string().len() > MAX_SCOPED_EVIDENCE_BYTES {
                    evidence
                        .as_object_mut()
                        .expect("review evidence is an object")
                        .remove(field);
                    evidence[format!("{field}_omitted")] = true.into();
                }
            }
        }
        // Keep every user instruction. Include complete assistant messages, newest
        // first, only in space left over after mandatory evidence.
        let mut remaining = MAX_SCOPED_EVIDENCE_BYTES.saturating_sub(evidence.to_string().len());
        let entries = evidence["conversation"]
            .as_array_mut()
            .expect("conversation array");
        for (entry, source) in entries.iter_mut().zip(conversation).rev() {
            if let ReviewExchange::Plain {
                preceding_assistant: Some(text),
                ..
            } = source
            {
                let field = serde_json::json!({ "preceding_assistant": text });
                // Adding the field replaces the two braces with a single comma.
                let bytes = field.to_string().len() - 1;
                if bytes <= remaining {
                    entry["preceding_assistant"] = text.as_str().into();
                    remaining -= bytes;
                }
            }
        }
        let quoted = evidence.to_string();
        let basis = Fingerprint::of(&(SCOPED_POLICY_ID, target, &intent.id, &quoted))?;
        prepare_request(
            source,
            target_fingerprint(target.operation, target.action, target.scope)?,
            format!(
                "approval-review/{}/{}/{}",
                target.control.0,
                target.history.0,
                basis.to_hex()
            ),
            quoted,
            SCOPED_POLICY_ID,
            SCOPED_INSTRUCTIONS,
            source.max_output_tokens.map(|limit| limit.min(1024)),
        )
    }
}

fn names_path(text: &str, path: &str) -> bool {
    text.match_indices(path).any(|(index, _)| {
        let before = text[..index].chars().next_back();
        let after = text[index + path.len()..].chars().next();
        match before {
            Some(quote @ ('\'' | '"' | '`')) => after == Some(quote),
            Some('(') => after == Some(')'),
            Some('[') => after == Some(']'),
            before if before.is_none_or(char::is_whitespace) => {
                after.is_none_or(char::is_whitespace)
            }
            _ => false,
        }
    })
}

fn supplied_intent(source: &InferenceRequest) -> Option<(&Message, &str)> {
    let intent = source.messages.iter().rev().find(|message| {
        message.role == Role::User && message.provenance.kind == ProvenanceKind::Supplied
    })?;
    let [Content::Text(text)] = intent.content.as_slice() else {
        return None;
    };
    (text.len() <= MAX_INTENT_BYTES && !text.trim().is_empty()).then_some((intent, text))
}

fn prepare_request(
    source: &InferenceRequest,
    target: Fingerprint,
    candidate_id: String,
    quoted: String,
    policy_id: &str,
    instructions: &str,
    output_limit: Option<u64>,
) -> Result<Option<InferenceRequest>> {
    let max_bytes = if policy_id == SCOPED_POLICY_ID {
        MAX_SCOPED_EVIDENCE_BYTES
    } else {
        MAX_EVIDENCE_BYTES
    };
    if quoted.len() > max_bytes {
        return Ok(None);
    }
    let mut candidate = message(&candidate_id, Role::User, quoted)?;
    candidate.provenance.fingerprint = Some(target);
    Ok(Some(InferenceRequest {
        model: source.model.clone(),
        messages: vec![
            message(policy_id, Role::System, instructions.into())?,
            candidate,
        ],
        tools: Vec::new(),
        max_output_tokens: output_limit,
        extension: None,
        reasoning: Default::default(),
    }))
}

/// Project a safe fallback reason for this exact still-pending action.
/// This projection does not validate or apply a review decision.
pub fn recorded_failure(
    state: &TurnState,
    operation: &OperationId,
    action: Fingerprint,
    scope: Fingerprint,
) -> Result<Option<AskReason>> {
    Ok(recorded_review(state, operation, action, scope)?.and_then(failure_reason))
}

pub fn failure_reason(review: &OperationState) -> Option<AskReason> {
    if let OperationInput::Inference(input) = &review.record.input
        && is_scoped_assessment(input.request())
    {
        return match review.outcome() {
            Some(OperationOutcome::Inference(outcome)) => assessment::parse(outcome).err(),
            Some(_) => Some(AskReason::InvalidReply),
            None => None,
        };
    }
    match review.outcome() {
        Some(OperationOutcome::Inference(outcome)) => match decide(outcome) {
            Decision::Ask(reason) => Some(reason),
            Decision::Allow | Decision::Deny => None,
        },
        _ => None,
    }
}

/// The version is retained with the actual reviewer input so historical
/// one-word decisions continue to be interpreted under their original policy.
pub fn is_scoped_assessment(request: &InferenceRequest) -> bool {
    scoped_attempt(request).is_some()
}

pub fn is_configured_read_review(review: &OperationState) -> bool {
    let OperationInput::Inference(input) = &review.record.input else {
        return false;
    };
    input.request().messages.first().is_some_and(|policy| {
        policy.id.as_str() == "approval-review/instructions"
            && policy.role == Role::System
            && policy.provenance.kind == ProvenanceKind::Transformed
            && policy.provenance.source == "approval-review"
            && matches!(policy.content.as_slice(), [Content::Text(text)] if text == INSTRUCTIONS)
    })
}

fn scoped_attempt(request: &InferenceRequest) -> Option<u32> {
    let message = request.messages.first()?;
    if message.role != Role::System
        || message.provenance.kind != ProvenanceKind::Transformed
        || message.provenance.source != "approval-review"
    {
        return None;
    }
    let id = message.id.as_str();
    if id == SCOPED_POLICY_ID {
        return Some(0);
    }
    let attempt = id
        .strip_prefix(SCOPED_POLICY_ID)?
        .strip_prefix("/retry/")?
        .parse()
        .ok()?;
    (attempt > 0 && attempt < MAX_REVIEW_ATTEMPTS).then_some(attempt)
}

pub fn set_scoped_attempt(request: &mut InferenceRequest, attempt: u32) -> Result<()> {
    if !is_scoped_assessment(request) || attempt >= MAX_REVIEW_ATTEMPTS {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "invalid_approval_review_attempt",
        ));
    }
    request.messages[0].id = MessageId::new(if attempt == 0 {
        SCOPED_POLICY_ID.to_owned()
    } else {
        format!("{SCOPED_POLICY_ID}/retry/{attempt}")
    })?;
    Ok(())
}

/// The current action follows any private conversation restored by the host.
pub fn action_message(request: &InferenceRequest) -> Option<&Message> {
    request.messages.iter().skip(1).find(|message| {
        message.role == Role::User
            && message.provenance.source == "approval-review"
            && message.provenance.kind == ProvenanceKind::Transformed
    })
}

pub fn scoped_order(review: &OperationState) -> Option<(u64, u64, u32)> {
    let OperationInput::Inference(input) = &review.record.input else {
        return None;
    };
    let request = input.request();
    let attempt = scoped_attempt(request)?;
    let mut parts = action_message(request)?
        .id
        .as_str()
        .strip_prefix("approval-review/")?
        .split('/');
    let control = parts.next()?.parse().ok()?;
    let history = parts.next()?.parse().ok()?;
    Some((control, history, attempt))
}

/// Project the final public explanation after validating the same private
/// result used to authorize the action. Provider state never enters this view.
pub fn scoped_assessment(review: &OperationState) -> Option<Assessment> {
    let OperationInput::Inference(input) = &review.record.input else {
        return None;
    };
    if !is_scoped_assessment(input.request())
        || review.rejection.is_some()
        || review.attempts.len() != 1
    {
        return None;
    }
    let Some(OperationOutcome::Inference(outcome)) = review.outcome() else {
        return None;
    };
    let mut assessment = assessment::parse(outcome).ok()?;
    // A failed command can emit private bytes as well. Carry that privacy
    // across saved reviewer context when the next assessment reuses it.
    if input.request().messages.iter().any(|message| {
        (message.role == Role::User
            && message.provenance.kind == ProvenanceKind::Transformed
            && message.provenance.source == PRIVATE_OBSERVATION_SOURCE)
            || message.role == Role::Tool
                && message.provenance.kind == ProvenanceKind::Observed
                && message.provenance.source == "approval-review"
                && message
                    .content
                    .iter()
                    .any(|part| matches!(part, Content::ToolResult(_)))
    }) {
        assessment.rationale = match assessment.outcome {
            AssessmentOutcome::Allow => {
                "Automatic review allowed this action after private investigation."
            }
            AssessmentOutcome::Deny => {
                "Automatic review declined this action after private investigation."
            }
        }
        .to_owned();
    }
    Some(assessment)
}

pub fn assessment_rationale(review: &OperationState) -> Option<String> {
    scoped_assessment(review).map(|assessment| assessment.rationale)
}

/// Only retry a malformed completed assessment or a transient provider
/// failure. The host shares the attempt and wall-clock budgets across retries.
pub fn retryable_scoped_review(review: &OperationState) -> bool {
    let OperationInput::Inference(input) = &review.record.input else {
        return false;
    };
    if !is_scoped_assessment(input.request()) {
        return false;
    }
    let Some(OperationOutcome::Inference(outcome)) = review.outcome() else {
        return false;
    };
    match assessment::parse(outcome) {
        Err(AskReason::InvalidReply) => true,
        Err(AskReason::Unavailable) => outcome.failure.as_ref().is_some_and(|failure| {
            matches!(
                failure.kind,
                FailureKind::RateLimit | FailureKind::Transient
            )
        }),
        _ => false,
    }
}

/// The private reviewer operation for the exact approval, for read-only activity projection.
pub fn recorded_review<'a>(
    state: &'a TurnState,
    operation: &OperationId,
    action: Fingerprint,
    scope: Fingerprint,
) -> Result<Option<&'a OperationState>> {
    let fingerprint = target_fingerprint(operation, action, scope)?;
    Ok(state
        .operations()
        .values()
        .filter(|record| {
            let OperationInput::Inference(prepared) = &record.record.input else {
                return false;
            };
            action_message(prepared.request()).is_some_and(|message| {
                message.role == Role::User
                    && message.provenance.kind == ProvenanceKind::Transformed
                    && message.provenance.source == "approval-review"
                    && message.provenance.fingerprint == Some(fingerprint)
            })
        })
        .max_by_key(|record| {
            let messages = match &record.record.input {
                OperationInput::Inference(input) => input.request().messages.len(),
                _ => 0,
            };
            (scoped_order(record), messages)
        }))
}

fn target_fingerprint(
    operation: &OperationId,
    action: Fingerprint,
    scope: Fingerprint,
) -> Result<Fingerprint> {
    Fingerprint::of(&(operation, action, scope))
}

/// Reuse only the exact retained operation. The caller reads the one slot
/// before admitting review. An occupied slot never starts another inference.
pub fn retained_decision(
    existing: &OperationState,
    expected: &PreparedRequest,
    grants: &GrantSelection,
) -> Option<Decision> {
    if !matches!(&existing.record.input, OperationInput::Inference(recorded) if recorded == expected)
        || &existing.record.grants != grants
        || existing.record.origin.is_some()
        || existing.record.source_call.is_some()
        || existing.attempts.len() > 1
    {
        return None;
    }
    match existing.outcome() {
        Some(OperationOutcome::Inference(outcome)) => {
            let decision = if is_scoped_assessment(expected.request()) {
                match assessment::parse(outcome) {
                    Ok(assessment) => match assessment.outcome {
                        AssessmentOutcome::Allow => Decision::Allow,
                        AssessmentOutcome::Deny => Decision::Deny,
                    },
                    Err(reason) => Decision::Ask(reason),
                }
            } else {
                decide(outcome)
            };
            if matches!(decision, Decision::Allow | Decision::Deny)
                && (existing.attempts.len() != 1 || existing.rejection.is_some())
            {
                return None;
            }
            Some(decision)
        }
        _ => Some(Decision::Ask(AskReason::Interrupted)),
    }
}

fn decide(outcome: &InferenceOutcome) -> Decision {
    match reply_text(outcome, MAX_REPLY_BYTES, |_| true)
        .as_deref()
        .map(str::trim)
    {
        Ok("allow") => Decision::Allow,
        Ok("deny") => Decision::Deny,
        Ok("ask") => Decision::Ask(AskReason::NeedsHuman),
        Err(reason) => Decision::Ask(*reason),
        _ => Decision::Ask(AskReason::InvalidReply),
    }
}

fn reply_text(
    outcome: &InferenceOutcome,
    max_bytes: usize,
    accepts_phase: impl Fn(Option<agent_kit_core::messages::MessagePhase>) -> bool,
) -> std::result::Result<String, AskReason> {
    if outcome
        .failure
        .as_ref()
        .is_some_and(|failure| failure.code == "deadline")
    {
        return Err(AskReason::TimedOut);
    }
    if outcome.status == InferenceStatus::Interrupted {
        return Err(AskReason::Interrupted);
    }
    if outcome.status != InferenceStatus::Completed || outcome.failure.is_some() {
        return Err(AskReason::Unavailable);
    }
    let mut reply = None;
    for message in &outcome.messages {
        if message.role != Role::Assistant || message.content.is_empty() {
            return Err(AskReason::InvalidReply);
        }
        let mut text = None;
        for part in &message.content {
            match part {
                Content::Text(part) => {
                    if !accepts_phase(message.phase) {
                        continue;
                    }
                    let text = text.get_or_insert_with(String::new);
                    if text.len().saturating_add(part.len()) > max_bytes {
                        return Err(AskReason::InvalidReply);
                    }
                    text.push_str(part);
                }
                Content::Reasoning(_) | Content::ProviderState(_) => {}
                _ => return Err(AskReason::InvalidReply),
            }
        }
        if let Some(text) = text
            && reply.replace(text).is_some()
        {
            return Err(AskReason::InvalidReply);
        }
    }
    reply.ok_or(AskReason::InvalidReply)
}

fn message(id: &str, role: Role, text: String) -> Result<Message> {
    Ok(Message {
        id: MessageId::new(id)?,
        role,
        phase: None,
        content: vec![Content::Text(text)],
        provenance: Provenance {
            source: "approval-review".into(),
            kind: ProvenanceKind::Transformed,
            fingerprint: None,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::authority::AuthorityBinding;
    use agent_kit_core::inference::{
        FailureKind, InferenceFailure, Modality, ModelCapabilities, ProviderBinding,
    };
    use agent_kit_core::turn::{AttemptRecord, OperationRecord};
    use agent_kit_core::{AttemptId, ModelId, PrincipalId, ProviderId, ScopeId};

    fn profile() -> ReadProfile {
        ReadProfile {
            directory: BindingId::new("reference").unwrap(),
            relative_path: "brief.txt".into(),
        }
    }

    fn source() -> InferenceRequest {
        let mut intent = message(
            "intent",
            Role::User,
            "Read the brief before drafting.".into(),
        )
        .unwrap();
        intent.provenance.kind = ProvenanceKind::Supplied;
        InferenceRequest {
            model: ModelId::new("fixture-model").unwrap(),
            messages: vec![
                message("system", Role::System, "private tool policy".into()).unwrap(),
                intent,
                message("assistant", Role::Assistant, "prior tool details".into()).unwrap(),
            ],
            tools: Vec::new(),
            max_output_tokens: Some(256),
            extension: None,
            reasoning: Default::default(),
        }
    }

    fn outcome(text: &str) -> InferenceOutcome {
        InferenceOutcome {
            status: InferenceStatus::Completed,
            messages: vec![message("reply", Role::Assistant, text.into()).unwrap()],
            usage: Vec::new(),
            failure: None,
            receipt: None,
            terminal_receipt: None,
        }
    }

    #[test]
    fn selects_one_exact_read_and_quotes_only_bounded_originating_text() {
        let profile = profile();
        let operation = OperationId::new("requested-read").unwrap();
        let mut target = ReadTarget {
            operation: &operation,
            action: Fingerprint::of(&"action").unwrap(),
            scope: Fingerprint::of(&"scope").unwrap(),
            directory: &profile.directory,
            relative_path: "brief.txt",
            control: ControlRevision(1),
            history: HistoryPosition(2),
        };
        let mut source = source();
        let request = profile.request(&target, &source).unwrap().unwrap();
        assert_eq!(request.max_output_tokens, Some(128));
        assert!(request.tools.is_empty());
        assert!(request.extension.is_none());
        assert_eq!(request.messages.len(), 2);
        let Content::Text(evidence) = &request.messages[1].content[0] else {
            panic!("expected quoted data");
        };
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(evidence).unwrap(),
            serde_json::json!({
                "relative_path": "brief.txt",
                "user_request": "Read the brief before drafting."
            })
        );

        target.scope = Fingerprint::of(&"other-scope").unwrap();
        let changed = profile.request(&target, &source).unwrap().unwrap();
        assert_ne!(request.messages[1].id, changed.messages[1].id);
        assert_eq!(request.messages[1].content, changed.messages[1].content);
        target.control = ControlRevision(2);
        let resumed = profile.request(&target, &source).unwrap().unwrap();
        assert_ne!(changed.messages[1].id, resumed.messages[1].id);
        target.relative_path = "other.txt";
        assert!(profile.request(&target, &source).unwrap().is_none());
        target.relative_path = "brief.txt";
        source.max_output_tokens = None;
        assert!(profile.request(&target, &source).unwrap().is_none());
        source.max_output_tokens = Some(16);
        assert_eq!(
            profile
                .request(&target, &source)
                .unwrap()
                .unwrap()
                .max_output_tokens,
            Some(16)
        );
        source.messages[1].content = vec![Content::Text("x".repeat(MAX_INTENT_BYTES + 1))];
        assert!(profile.request(&target, &source).unwrap().is_none());
        source.messages[1].content = vec![Content::Text("\u{0001}".repeat(MAX_INTENT_BYTES))];
        assert!(profile.request(&target, &source).unwrap().is_none());
    }

    #[test]
    fn escalated_review_quotes_the_command_and_its_reason_separately_from_user_authority() {
        let op = OperationId::new("launch").unwrap();
        let basis = ReviewBasis {
            operation: &op,
            action: Fingerprint::of(&"command").unwrap(),
            scope: Fingerprint::of(&"approved loopback listener").unwrap(),
            control: ControlRevision(0),
            history: HistoryPosition(1),
        };
        let source = source();
        let names = ["PATH".to_owned()];
        let filesystem = CommandFilesystem {
            disk_read: true,
            read_roots: vec!["/project".into()],
            write_roots: Vec::new(),
            runtime_roots: vec!["/usr/bin".into()],
            private_temp_write: true,
            resolved_executable: "/bin/sh".into(),
            resolved_cwd: "/project".into(),
        };
        let action = ScopedAction::EscalatedCommand {
            command: CommandReview {
                command: "next start --hostname 127.0.0.1 --port 3000",
                cwd: "/project",
                executable: "/bin/sh",
                workspace_root: "/project",
                filesystem_access: "read",
                filesystem: &filesystem,
                environment_names: &names,
                terminal: false,
                finite: true,
            },
            justification: "Start the requested local preview",
            network: CommandNetworkScope::Listen { listen_port: 3000 },
        };
        let instructions = [ReviewExchange::Plain {
            user: "Keep the project offline.".into(),
            preceding_assistant: None,
        }];
        let review = action
            .request(
                &basis,
                &source,
                ReviewContext {
                    intent: &source.messages[1],
                    answers: &[],
                    conversation: &instructions,
                    inherited_context: &[],
                    observed_reference_urls: &["https://example.org/project".into()],
                    project_instructions: None,
                    action_evidence: &["Previously approved one scoped action.".into()],
                    informed_reconsideration: false,
                },
            )
            .unwrap()
            .unwrap();
        assert!(review.tools.is_empty());
        let [Content::Text(evidence)] = review.messages[1].content.as_slice() else {
            panic!("missing evidence");
        };
        let evidence: serde_json::Value = serde_json::from_str(evidence).unwrap();
        assert_eq!(
            evidence["action"],
            serde_json::json!({
                "kind": "escalated_command", "command": "next start --hostname 127.0.0.1 --port 3000",
                "justification": "Start the requested local preview", "cwd": "/project",
                "filesystem": filesystem,
                "executable": "/bin/sh", "workspace_root": "/project", "environment_names": ["PATH"], "terminal": false, "finite": true,
                "filesystem_access": "read",
                "network": "listen", "listen_port": 3000
            })
        );
        assert_eq!(evidence["conversation"], serde_json::json!(instructions));
        assert_eq!(
            evidence["observed_reference_urls"][0],
            "https://example.org/project"
        );
        assert_eq!(
            evidence["action_evidence"][0],
            "Previously approved one scoped action."
        );
        assert!(is_scoped_assessment(&review));
        let mut retried = review;
        set_scoped_attempt(&mut retried, 1).unwrap();
        assert_eq!(scoped_attempt(&retried), Some(1));
        assert!(set_scoped_attempt(&mut retried, MAX_REVIEW_ATTEMPTS).is_err());
    }

    #[test]
    fn review_evidence_preserves_user_restrictions_and_recent_replies_under_pressure() {
        let basis = ReviewBasis {
            operation: &OperationId::new("read").unwrap(),
            action: Fingerprint::of(&"read").unwrap(),
            scope: Fingerprint::of(&"scope").unwrap(),
            control: ControlRevision(0),
            history: HistoryPosition(2),
        };
        let path = "/outside/a.txt";
        let reply = "Yes, read /outside/a.txt";
        let question = "Reading this file will share its text with the model. Read it?";
        let reference = ["https://example.org/project".to_owned()];
        let action_evidence = ["The user declined the earlier write.".to_owned()];
        let mut source = source();
        source.messages[1].content = vec![Content::Text(reply.into())];
        let render = |conversation: &[ReviewExchange]| {
            let review = ScopedAction::ExternalFileRead {
                absolute_path: path,
            }
            .request(
                &basis,
                &source,
                ReviewContext {
                    intent: &source.messages[1],
                    answers: &[],
                    conversation,
                    inherited_context: &[],
                    observed_reference_urls: &reference,
                    action_evidence: &action_evidence,
                    informed_reconsideration: false,
                    project_instructions: None,
                },
            )
            .unwrap()
            .expect("optional assistant context must not prevent review");
            let [Content::Text(text)] = review.messages[1].content.as_slice() else {
                panic!("missing review evidence");
            };
            text.clone()
        };
        let mut conversation = [
            ReviewExchange::Plain {
                user: "Keep all drafts local. ".into(),
                preceding_assistant: Some(
                    "Should I send the \"résumé\"?\nOr keep it local?".into(),
                ),
            },
            ReviewExchange::Plain {
                user: reply.into(),
                preceding_assistant: Some(question.into()),
            },
        ];
        let full = render(&conversation);
        let full_evidence: serde_json::Value = serde_json::from_str(&full).unwrap();
        assert_eq!(
            full_evidence["conversation"],
            serde_json::json!(conversation)
        );

        // Exceed the limit by one encoded byte, so even partial truncation would be visible.
        let ReviewExchange::Plain { user, .. } = &mut conversation[0] else {
            panic!("expected plain chat text");
        };
        user.push_str(&"x".repeat(MAX_SCOPED_EVIDENCE_BYTES - full.len() + 1));
        let restriction = user.clone();
        let bounded = render(&conversation);
        assert!(bounded.len() <= MAX_SCOPED_EVIDENCE_BYTES);
        let evidence: serde_json::Value = serde_json::from_str(&bounded).unwrap();
        assert_eq!(
            evidence["observed_reference_urls"],
            serde_json::json!(reference)
        );
        assert_eq!(
            evidence["action_evidence"],
            serde_json::json!(action_evidence)
        );
        assert_eq!(
            evidence["conversation"],
            serde_json::json!([
                { "user": restriction },
                { "user": reply, "preceding_assistant": question },
            ])
        );

        // A reply whose own question no longer fits cannot inherit the older question.
        conversation[1] = ReviewExchange::Plain {
            user: reply.into(),
            preceding_assistant: Some(question.repeat(4)),
        };
        let evidence: serde_json::Value = serde_json::from_str(&render(&conversation)).unwrap();
        assert_eq!(
            evidence["conversation"][0],
            serde_json::json!(conversation[0])
        );
        assert_eq!(
            evidence["conversation"][1],
            serde_json::json!({ "user": reply })
        );
    }

    #[test]
    fn scoped_review_handles_inferred_network_destinations_and_requires_exact_outside_files() {
        let operation = OperationId::new("network-command").unwrap();
        let basis = ReviewBasis {
            operation: &operation,
            action: Fingerprint::of(&"command").unwrap(),
            scope: Fingerprint::of(&"scope").unwrap(),
            control: ControlRevision(0),
            history: HistoryPosition(1),
        };
        let filesystem = CommandFilesystem {
            disk_read: true,
            read_roots: vec!["/project".into()],
            write_roots: Vec::new(),
            runtime_roots: vec!["/usr/bin".into()],
            private_temp_write: true,
            resolved_executable: "/bin/sh".into(),
            resolved_cwd: "/project".into(),
        };
        let network = ScopedAction::NetworkCommand {
            host: "example.org",
            port: 443,
            command: CommandReview {
                command: "curl https://example.org/source",
                cwd: "/project",
                executable: "/bin/sh",
                workspace_root: "/project",
                filesystem_access: "read",
                filesystem: &filesystem,
                environment_names: &[],
                terminal: false,
                finite: true,
            },
        };
        let mut source = source();
        // An endpoint that cannot accept an output-token field still gets the
        // same deadline, one-turn allowance, and bounded response validation.
        source.max_output_tokens = None;
        let oversized_reference = [format!(
            "https://example.org/{}",
            "x".repeat(MAX_SCOPED_EVIDENCE_BYTES)
        )];
        for text in [
            "Read the upstream project's public documentation.",
            "Download https://example.org/source",
            "Only contact https://other.example.",
        ] {
            source.messages[1].content = vec![Content::Text(text.into())];
            let request = network
                .request(
                    &basis,
                    &source,
                    ReviewContext {
                        intent: &source.messages[1],
                        answers: &[],
                        conversation: &[ReviewExchange::Plain {
                            user: "Keep the project offline.".into(),
                            preceding_assistant: None,
                        }],
                        inherited_context: &[],
                        observed_reference_urls: &oversized_reference,
                        project_instructions: None,
                        action_evidence: &[],
                        informed_reconsideration: false,
                    },
                )
                .unwrap()
                .expect("a network command is eligible for a scoped decision");
            assert!(request.tools.is_empty());
            assert_eq!(request.max_output_tokens, None);
            let [Content::Text(evidence)] = request.messages[1].content.as_slice() else {
                panic!("missing evidence");
            };
            let evidence: serde_json::Value = serde_json::from_str(evidence).unwrap();
            assert_eq!(evidence["user_request"], text);
            assert!(evidence.get("observed_reference_urls").is_none());
            assert_eq!(evidence["observed_reference_urls_omitted"], true);
            assert_eq!(
                evidence["conversation"][0]["user"],
                "Keep the project offline."
            );
            assert_eq!(
                evidence["action"]["command"],
                "curl https://example.org/source"
            );
            assert_eq!(evidence["action"]["host"], "example.org");
            assert_eq!(evidence["action"]["port"], 443);
        }
        let file = ScopedAction::ExternalFileRead {
            absolute_path: "/outside/a.txt",
        };
        for (text, eligible) in [
            ("Open /outside/a.txt please", true),
            ("Open /outside/a.txt.bak", false),
            ("Open `/outside/a.txt extra notes`", false),
            ("Open `/outside/a.txt`.", true),
            ("Open /somewhere/outside/a.txt", false),
            ("Open the reference file.", false),
            ("Yes.", false),
        ] {
            source.messages[1].content = vec![Content::Text(text.into())];
            assert_eq!(
                file.request(
                    &basis,
                    &source,
                    ReviewContext {
                        intent: &source.messages[1],
                        answers: &[],
                        conversation: &[ReviewExchange::Plain {
                            user: text.into(),
                            preceding_assistant: Some("Read /outside/a.txt for this task?".into()),
                        }],
                        inherited_context: &[],
                        observed_reference_urls: &["https://example.org/outside/a.txt".into()],
                        project_instructions: None,
                        action_evidence: &[],
                        informed_reconsideration: false,
                    }
                )
                .unwrap()
                .is_some(),
                eligible,
                "{text}"
            );
        }
        assert_eq!(
            decide(&outcome("ask")),
            Decision::Ask(AskReason::NeedsHuman)
        );
    }

    #[test]
    fn rejects_ambiguous_or_unsafe_profile_paths() {
        for path in [
            "",
            "/brief.txt",
            "../brief.txt",
            "one//two",
            "one\\two",
            "one/./two",
            "line\nfeed",
        ] {
            let mut profile = profile();
            profile.relative_path = path.into();
            assert!(profile.validate().is_err(), "{path:?}");
        }
    }

    #[test]
    fn distinguishes_decisions_and_requires_manual_review_after_invalid_or_failed_output() {
        assert_eq!(decide(&outcome(" allow\n")), Decision::Allow);
        assert_eq!(decide(&outcome("deny")), Decision::Deny);
        for text in ["ALLOW", "allow\nextra", "", "{\"decision\":\"allow\"}"] {
            assert_eq!(
                decide(&outcome(text)),
                Decision::Ask(AskReason::InvalidReply)
            );
        }
        let mut response = outcome("allow");
        response.status = InferenceStatus::Failed;
        response.failure = Some(InferenceFailure {
            kind: FailureKind::Cancelled,
            code: "deadline".into(),
            retry_after_ms: None,
            dispatch: None,
        });
        assert_eq!(decide(&response), Decision::Ask(AskReason::TimedOut));
        response.failure.as_mut().unwrap().code = "transport_interrupted".into();
        response.status = InferenceStatus::Interrupted;
        assert_eq!(decide(&response), Decision::Ask(AskReason::Interrupted));
        response.status = InferenceStatus::Failed;
        assert_eq!(decide(&response), Decision::Ask(AskReason::Unavailable));
    }

    #[test]
    fn accepts_a_single_verdict_with_separate_provider_metadata() {
        use agent_kit_core::messages::ProviderState;
        use agent_kit_core::{Envelope, SchemaId};

        let mut metadata = message("metadata", Role::Assistant, String::new()).unwrap();
        metadata.content = vec![
            Content::Reasoning("Private reasoning can contain the word deny.".into()),
            Content::ProviderState(ProviderState {
                producer: ProviderId::new("fixture").unwrap(),
                binding: BindingId::new("fixture-provider").unwrap(),
                validity: Fingerprint::of(&"fixture-state").unwrap(),
                payload: Envelope::new(SchemaId::new("fixture-state").unwrap(), 1, vec![42])
                    .unwrap(),
            }),
        ];
        for (text, expected) in [
            ("allow", Decision::Allow),
            ("deny", Decision::Deny),
            ("ask", Decision::Ask(AskReason::NeedsHuman)),
        ] {
            let mut response = outcome(text);
            response.messages.insert(0, metadata.clone());
            assert_eq!(decide(&response), expected);
        }

        let mut response = outcome("allow");
        response.messages = vec![metadata];
        assert_eq!(decide(&response), Decision::Ask(AskReason::InvalidReply));
    }

    #[test]
    fn separate_text_messages_cannot_supply_a_verdict() {
        for (first, second) in [("allow", "deny"), ("al", "low"), (" ", "allow")] {
            let mut response = outcome(first);
            response
                .messages
                .push(message("second-reply", Role::Assistant, second.into()).unwrap());
            assert_eq!(decide(&response), Decision::Ask(AskReason::InvalidReply));
        }
    }

    #[test]
    fn scoped_assessment_keeps_risk_authority_and_rationale_separate() {
        let low = assessment::parse(&outcome(r#"{"outcome":"allow"}"#)).unwrap();
        assert_eq!(low.risk_level, RiskLevel::Low);
        assert_eq!(low.user_authorization, UserAuthorization::Unknown);
        assert_eq!(low.outcome, AssessmentOutcome::Allow);
        let reviewed = assessment::parse(&outcome(
            r#"{"risk_level":"high","user_authorization":"medium","outcome":"deny","rationale":"Private data would leave\nthe workspace."}"#,
        )).unwrap();
        assert_eq!(reviewed.risk_level, RiskLevel::High);
        assert_eq!(reviewed.user_authorization, UserAuthorization::Medium);
        assert_eq!(reviewed.outcome, AssessmentOutcome::Deny);
        assert_eq!(
            reviewed.rationale,
            "Private data would leave the workspace."
        );
        let critical = assessment::parse(&outcome(
            r#"{"risk_level":"critical","user_authorization":"high","outcome":"deny"}"#,
        ))
        .unwrap();
        assert_eq!(critical.outcome, AssessmentOutcome::Deny);
        for invalid in [
            "allow",
            "ask",
            r#"{"outcome":"ask"}"#,
            r#"{"risk_level":"critical","user_authorization":"high","outcome":"allow"}"#,
            r#"{"risk_level":"high","user_authorization":"low","outcome":"allow"}"#,
            r#"{"outcome":"allow"} {"outcome":"deny"}"#,
            r#"The example was {"outcome":"allow"} but this action must be declined."#,
        ] {
            assert_eq!(
                assessment::parse(&outcome(invalid)),
                Err(AskReason::InvalidReply),
                "{invalid}"
            );
        }
        let mut reasoning_only = message("metadata", Role::Assistant, String::new()).unwrap();
        reasoning_only.content = vec![Content::Reasoning("deny".into())];
        let mut with_reasoning = outcome(r#"{"outcome":"allow"}"#);
        with_reasoning.messages.insert(0, reasoning_only);
        assert_eq!(assessment::parse(&with_reasoning).unwrap(), low);
        let mut progress = outcome(r#"{"outcome":"allow"}"#);
        progress.messages[0].phase = Some(agent_kit_core::messages::MessagePhase::Progress);
        assert_eq!(assessment::parse(&progress), Err(AskReason::InvalidReply));
        progress
            .messages
            .extend(outcome(r#"{"outcome":"deny"}"#).messages);
        assert_eq!(
            assessment::parse(&progress).unwrap().outcome,
            AssessmentOutcome::Deny
        );
    }

    #[test]
    fn scoped_review_retries_only_transient_failures_and_malformed_replies() {
        let source = source();
        let scope = ReviewBasis {
            operation: &OperationId::new("external-read").unwrap(),
            action: Fingerprint::of(&"action").unwrap(),
            scope: Fingerprint::of(&"scope").unwrap(),
            control: ControlRevision(12),
            history: HistoryPosition(30),
        };
        let mut request = ScopedAction::ExternalFileRead {
            absolute_path: "/files/brief",
        }
        .request(
            &scope,
            &source,
            ReviewContext {
                intent: &source.messages[1],
                answers: &["Read /files/brief".into()],
                conversation: &[],
                inherited_context: &[],
                observed_reference_urls: &[],
                project_instructions: None,
                action_evidence: &[],
                informed_reconsideration: false,
            },
        )
        .unwrap()
        .unwrap();
        set_scoped_attempt(&mut request, 2).unwrap();
        let grants = GrantSelection {
            authority: AuthorityBinding {
                principal: PrincipalId::new("fixture").unwrap(),
                binding: BindingId::new("fixture").unwrap(),
                scope: ScopeId::new("fixture").unwrap(),
            },
            grants: Vec::new(),
        };
        let prepared = PreparedRequest::from_validated(
            request,
            ProviderBinding {
                provider: ProviderId::new("fixture").unwrap(),
                authority: grants.authority.clone(),
            },
            ModelCapabilities {
                revision: BindingId::new("fixture").unwrap(),
                input_modalities: [Modality::Text].into_iter().collect(),
                json_tools: true,
                text_tools: false,
                max_output_tokens: Some(256),
                reasoning: Default::default(),
            },
        )
        .unwrap();
        let mut review = OperationState {
            record: OperationRecord {
                id: OperationId::new("review").unwrap(),
                input: OperationInput::Inference(prepared.clone()),
                origin: None,
                source_call: None,
                grants: grants.clone(),
            },
            attempts: vec![AttemptRecord {
                id: AttemptId::new("review/1").unwrap(),
                outcome: None,
                prior_outcomes: Vec::new(),
            }],
            rejection: None,
        };
        assert_eq!(scoped_order(&review), Some((12, 30, 2)));
        for (payload, expected, retry, explanation) in [
            ("allow", Decision::Ask(AskReason::InvalidReply), true, None),
            (
                r#"{"outcome":"deny","rationale":"Private transfer."}"#,
                Decision::Deny,
                false,
                Some("Private transfer."),
            ),
            (
                r#"{"outcome":"allow"}"#,
                Decision::Allow,
                false,
                Some("Automatic review allowed this action."),
            ),
        ] {
            review.attempts[0].outcome = Some(OperationOutcome::Inference(outcome(payload)));
            assert_eq!(
                retained_decision(&review, &prepared, &grants),
                Some(expected)
            );
            assert_eq!(retryable_scoped_review(&review), retry);
            assert_eq!(assessment_rationale(&review).as_deref(), explanation);
        }
        // The provider may quote what it read in the rationale. The decision
        // and risk remain observable through the public view after reopening.
        {
            use agent_kit_core::messages::{
                OutcomeStatus, ResultContent, ToolArguments, ToolCall, ToolResult,
            };
            let call = agent_kit_core::ToolCallId::new("inspect").unwrap();
            let mut continuation = prepared.request().clone();
            let mut reader = message("inspection", Role::Assistant, String::new()).unwrap();
            reader.content = vec![Content::ToolCall(ToolCall {
                id: call.clone(),
                tool: agent_kit_core::ToolId::new("read_workspace_file").unwrap(),
                arguments: ToolArguments::Json(serde_json::json!({"path":"context.txt"})),
            })];
            let private = "unpublished fixture data";
            let mut result =
                message("approval-review/evidence/1", Role::Tool, String::new()).unwrap();
            result.provenance.kind = ProvenanceKind::Observed;
            result.content = vec![Content::ToolResult(ToolResult {
                call,
                status: OutcomeStatus::Failed,
                content: vec![ResultContent::Text(private.into())],
                structured: None,
                truncated: false,
            })];
            continuation.messages.extend([reader, result]);
            let mut from_history = prepared.request().clone();
            let mut historical =
                message("historical-inspection", Role::User, private.into()).unwrap();
            historical.provenance.source = PRIVATE_OBSERVATION_SOURCE.into();
            from_history.messages.insert(1, historical);
            for continuation in [continuation, from_history] {
                let mut with_file = review.clone();
                with_file.record.input = OperationInput::Inference(
                    PreparedRequest::from_validated(
                        continuation.clone(),
                        prepared.binding().clone(),
                        prepared.capabilities().clone(),
                    )
                    .unwrap(),
                );
                for decision in ["allow", "deny"] {
                    with_file.attempts[0].outcome = Some(OperationOutcome::Inference(outcome(
                        &format!(
                            r#"{{"outcome":"{decision}","risk_level":"medium","rationale":"{private}"}}"#
                        ),
                    )));
                    let projected = scoped_assessment(&with_file).unwrap();
                    assert_eq!(projected.risk_level, RiskLevel::Medium);
                    assert_eq!(
                        projected.outcome == AssessmentOutcome::Allow,
                        decision == "allow"
                    );
                    assert!(projected.rationale.contains("private investigation"));
                    assert!(!assessment_rationale(&with_file).unwrap().contains(private));
                }
            }
        }
        for (kind, code, reason, retryable) in [
            (
                FailureKind::RateLimit,
                "provider_rate_limit",
                AskReason::Unavailable,
                true,
            ),
            (
                FailureKind::Transient,
                "network_transient",
                AskReason::Unavailable,
                true,
            ),
            (
                FailureKind::Authentication,
                "unauthorized",
                AskReason::Unavailable,
                false,
            ),
            (
                FailureKind::Cancelled,
                "deadline",
                AskReason::TimedOut,
                false,
            ),
            (
                FailureKind::Cancelled,
                "user_cancelled",
                AskReason::Interrupted,
                false,
            ),
        ] {
            let mut failed = outcome("");
            failed.status = InferenceStatus::Failed;
            failed.failure = Some(InferenceFailure {
                kind,
                code: code.into(),
                retry_after_ms: None,
                dispatch: None,
            });
            review.attempts[0].outcome = Some(OperationOutcome::Inference(failed));
            assert_eq!(failure_reason(&review), Some(reason));
            assert_eq!(retryable_scoped_review(&review), retryable);
            assert!(assessment_rationale(&review).is_none());
        }
    }

    #[test]
    fn retained_approval_requires_the_exact_request_grants_and_single_attempt() {
        let profile = profile();
        let operation = OperationId::new("requested-read").unwrap();
        let mut target = ReadTarget {
            operation: &operation,
            action: Fingerprint::of(&"action").unwrap(),
            scope: Fingerprint::of(&"scope").unwrap(),
            directory: &profile.directory,
            relative_path: "brief.txt",
            control: ControlRevision(1),
            history: HistoryPosition(2),
        };
        let authority = AuthorityBinding {
            principal: PrincipalId::new("fixture-account").unwrap(),
            binding: BindingId::new("fixture-credential").unwrap(),
            scope: ScopeId::new("fixture-model").unwrap(),
        };
        let grants = GrantSelection {
            authority: authority.clone(),
            grants: Vec::new(),
        };
        let prepare = |target: &ReadTarget<'_>| {
            PreparedRequest::from_validated(
                profile.request(target, &source()).unwrap().unwrap(),
                ProviderBinding {
                    provider: ProviderId::new("fixture").unwrap(),
                    authority: authority.clone(),
                },
                ModelCapabilities {
                    revision: BindingId::new("fixture-text").unwrap(),
                    input_modalities: [Modality::Text].into_iter().collect(),
                    json_tools: true,
                    text_tools: false,
                    max_output_tokens: Some(256),
                    reasoning: Default::default(),
                },
            )
            .unwrap()
        };
        let expected = prepare(&target);
        let mut retained = OperationState {
            record: OperationRecord {
                id: OperationId::new("review").unwrap(),
                input: OperationInput::Inference(expected.clone()),
                origin: None,
                source_call: None,
                grants: grants.clone(),
            },
            attempts: vec![AttemptRecord {
                id: AttemptId::new("review/first").unwrap(),
                outcome: Some(OperationOutcome::Inference(outcome("allow"))),
                prior_outcomes: Vec::new(),
            }],
            rejection: None,
        };
        assert_eq!(
            retained_decision(&retained, &expected, &grants),
            Some(Decision::Allow)
        );
        target.action = Fingerprint::of(&"different-action").unwrap();
        assert_eq!(
            retained_decision(&retained, &prepare(&target), &grants),
            None
        );
        let mut changed = grants.clone();
        changed.authority.binding = BindingId::new("different-credential").unwrap();
        assert_eq!(retained_decision(&retained, &expected, &changed), None);
        retained.attempts.push(retained.attempts[0].clone());
        assert_eq!(retained_decision(&retained, &expected, &grants), None);
        retained.attempts.truncate(1);
        retained.attempts[0].outcome = None;
        assert_eq!(
            retained_decision(&retained, &expected, &grants),
            Some(Decision::Ask(AskReason::Interrupted))
        );
    }
}
