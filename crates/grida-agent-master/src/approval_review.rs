//! Eligibility, evidence and decision policy for bounded private approval review.

use agent_kit_core::authority::GrantSelection;
use agent_kit_core::history::HistoryPosition;
use agent_kit_core::inference::{
    InferenceOutcome, InferenceRequest, InferenceStatus, PreparedRequest,
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

const MAX_PATH_BYTES: usize = 512;
const MAX_INTENT_BYTES: usize = 2048;
const MAX_EVIDENCE_BYTES: usize = 4096;
const MAX_REPLY_BYTES: usize = 64;
const MAX_OUTPUT_TOKENS: u64 = 128;
const INSTRUCTIONS: &str = include_str!("prompts/approval-review.md").trim_ascii_end();

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

pub const MAX_SCOPED_REVIEWS: u32 = 4;

pub const TIMEOUT: Duration = Duration::from_secs(10);

/// Invoked by Master after the source step has durably deferred its actions.
/// Return true when the same step can be reconsidered. A failed review leaves
/// the manual interaction pending.
pub trait Reviewer: Send + Sync {
    fn allowance(&self, max_steps: u32) -> u32 {
        u32::from(max_steps > 1)
    }

    fn review<'a>(
        &'a self,
        operations: &'a TurnOperations,
        basis: &'a TurnView,
        deferred: &'a [WaitId],
    ) -> BoxFuture<'a, Result<bool>>;

    /// Review within the allowance reserved from this turn's generation budget.
    /// Existing single-slot reviewers use their original policy.
    fn review_with_allowance<'a>(
        &'a self,
        operations: &'a TurnOperations,
        basis: &'a TurnView,
        deferred: &'a [WaitId],
        _allowance: u32,
    ) -> BoxFuture<'a, Result<bool>> {
        self.review(operations, basis, deferred)
    }
}

/// A single slot for the turn. A different candidate cannot start a second
/// review, including when multiple tool requests arrive from the same step.
pub fn operation_key() -> OperationKey {
    OperationKey::new("approval-review").expect("static operation key")
}

/// Each slot can fund one private decision. The saved request binds its slot to
/// the exact tool invocation, scope, control and history.
pub fn scoped_operation_key(slot: u32) -> Result<OperationKey> {
    OperationKey::new(format!("scoped-approval-review/{slot}"))
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
            basis,
            quoted,
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
}

/// The host constructs these inputs from a retained approval and its originating
/// inference. The product policy accepts only explicitly named destinations.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ScopedAction<'a> {
    ExternalFileRead {
        absolute_path: &'a str,
    },
    ConfinedCommand {
        #[serde(flatten)]
        command: CommandReview<'a>,
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

impl ScopedAction<'_> {
    pub fn request(
        &self,
        target: &ReviewBasis<'_>,
        source: &InferenceRequest,
        intent: &Message,
        answers: &[String],
        user_instructions: &[String],
    ) -> Result<Option<InferenceRequest>> {
        let [Content::Text(text)] = intent.content.as_slice() else {
            return Ok(None);
        };
        if intent.role != Role::User
            || intent.provenance.kind != ProvenanceKind::Supplied
            || text.len() > MAX_INTENT_BYTES
            || text.trim().is_empty()
            || !source.messages.contains(intent)
        {
            return Ok(None);
        }
        if !self.named_by(text) && !answers.iter().any(|answer| self.named_by(answer)) {
            return Ok(None);
        }
        let quoted = serde_json::json!({ "user_request": text, "user_instructions": user_instructions, "action": self }).to_string();
        let basis = Fingerprint::of(&(
            "scoped-approval-v1",
            target,
            &intent.id,
            self,
            user_instructions,
        ))?;
        prepare_request(
            source,
            target_fingerprint(target.operation, target.action, target.scope)?,
            basis,
            quoted,
            include_str!("prompts/scoped-approval-review.md").trim_ascii_end(),
            source
                .max_output_tokens
                .map(|limit| limit.min(MAX_OUTPUT_TOKENS)),
        )
    }

    /// A model-authored question and earlier conversation may explain the
    /// action, but only a current user prompt or its answers can name it.
    fn named_by(&self, text: &str) -> bool {
        match self {
            Self::ConfinedCommand { .. } => true,
            Self::ExternalFileRead { absolute_path } => {
                absolute_path.starts_with('/')
                    && absolute_path.len() <= MAX_PATH_BYTES
                    && names_path(text, absolute_path)
            }
            Self::NetworkCommand { host, port, .. } => {
                // Exact port is part of authority. Without one, recognize only
                // the standard port of a URL explicitly supplied by the user.
                names_destination(text, &format!("{host}:{port}"))
                    || names_destination(text, &format!("https://{host}:{port}"))
                    || names_destination(text, &format!("http://{host}:{port}"))
                    || (*port == 443 && names_destination(text, &format!("https://{host}")))
                    || (*port == 80 && names_destination(text, &format!("http://{host}")))
            }
        }
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

fn names_destination(text: &str, destination: &str) -> bool {
    text.split(|c: char| c.is_whitespace() || matches!(c, '\'' | '"' | '`' | '(' | '[' | ')' | ']'))
        .any(|word| {
            word.strip_prefix(destination)
                .is_some_and(|rest| rest.is_empty() || rest.starts_with(['/', '?', '#']))
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
    basis: Fingerprint,
    quoted: String,
    instructions: &str,
    output_limit: Option<u64>,
) -> Result<Option<InferenceRequest>> {
    if quoted.len() > MAX_EVIDENCE_BYTES {
        return Ok(None);
    }
    let candidate_id = format!("approval-review/{}", basis.to_hex());
    let mut candidate = message(&candidate_id, Role::User, quoted)?;
    candidate.provenance.fingerprint = Some(target);
    Ok(Some(InferenceRequest {
        model: source.model.clone(),
        messages: vec![
            message(
                "approval-review/instructions",
                Role::System,
                instructions.into(),
            )?,
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
    match review.outcome() {
        Some(OperationOutcome::Inference(outcome)) => match decide(outcome) {
            Decision::Ask(reason) => Some(reason),
            Decision::Allow | Decision::Deny => None,
        },
        _ => None,
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
    Ok(state.operations().values().find(|record| {
        let OperationInput::Inference(prepared) = &record.record.input else {
            return false;
        };
        prepared.request().messages.get(1).is_some_and(|message| {
            message.role == Role::User
                && message.provenance.kind == ProvenanceKind::Transformed
                && message.provenance.source == "approval-review"
                && message.provenance.fingerprint == Some(fingerprint)
        })
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
            let decision = decide(outcome);
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
    if outcome
        .failure
        .as_ref()
        .is_some_and(|failure| failure.code == "deadline")
    {
        return Decision::Ask(AskReason::TimedOut);
    }
    if outcome.status == InferenceStatus::Interrupted {
        return Decision::Ask(AskReason::Interrupted);
    }
    if outcome.status != InferenceStatus::Completed || outcome.failure.is_some() {
        return Decision::Ask(AskReason::Unavailable);
    }
    let [message] = outcome.messages.as_slice() else {
        return Decision::Ask(AskReason::InvalidReply);
    };
    if message.role != Role::Assistant {
        return Decision::Ask(AskReason::InvalidReply);
    }
    let mut reply = String::new();
    for part in &message.content {
        match part {
            Content::Text(text) if reply.len().saturating_add(text.len()) <= MAX_REPLY_BYTES => {
                reply.push_str(text);
            }
            Content::Reasoning(_) | Content::ProviderState(_) => {}
            _ => return Decision::Ask(AskReason::InvalidReply),
        }
    }
    match reply.trim() {
        "allow" => Decision::Allow,
        "deny" => Decision::Deny,
        "ask" => Decision::Ask(AskReason::NeedsHuman),
        _ => Decision::Ask(AskReason::InvalidReply),
    }
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
    fn scoped_review_requires_the_user_to_name_the_exact_destination() {
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
            },
        };
        let mut source = source();
        // An endpoint that cannot accept an output-token field still gets the
        // same deadline, one-turn allowance, and bounded response validation.
        source.max_output_tokens = None;
        for (text, eligible) in [
            ("Download https://example.org/source", true),
            ("Use example.org:443", true),
            ("Download https://example.org.evil.test", false),
            (
                "Download https://private.test/path/example.org:443/file",
                false,
            ),
            ("Download https://example.org:444/file", false),
            ("Use the URL in that file.", false),
        ] {
            source.messages[1].content = vec![Content::Text(text.into())];
            let request = network
                .request(
                    &basis,
                    &source,
                    &source.messages[1],
                    &[],
                    &["Keep the project offline.".into()],
                )
                .unwrap();
            assert_eq!(request.is_some(), eligible, "{text}");
            if let Some(request) = request {
                assert!(request.tools.is_empty());
                assert_eq!(request.max_output_tokens, None);
                let [Content::Text(evidence)] = request.messages[1].content.as_slice() else {
                    panic!("missing evidence");
                };
                assert!(evidence.contains("curl https://example.org/source"));
                assert!(evidence.contains("Keep the project offline."));
            }
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
        ] {
            source.messages[1].content = vec![Content::Text(text.into())];
            assert_eq!(
                file.request(&basis, &source, &source.messages[1], &[], &[])
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
