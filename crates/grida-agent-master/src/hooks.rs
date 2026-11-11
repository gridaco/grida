//! Reviewed completion checks over ordinary recorded operations.

use crate::{hex, read_account};
use agent_kit_core::authority::GrantSelection;
use agent_kit_core::history::HistoryPosition;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{InventorySnapshot, ToolOutcome};
use agent_kit_core::turn::{OperationInput, OperationOutcome, OperationState, TurnOutcome};
use agent_kit_core::{
    BindingId, Error, ErrorKind, Fingerprint, OperationId, Result, SessionId, ToolId, TurnId,
    WaitId,
};
use agent_kit_runtime::{InvokeOutcome, OperationKey, PlannedInvocation, TurnOperations, TurnView};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

const MAX_CHECKS: usize = 8;
const MAX_TEXT_BYTES: usize = 4 * 1024;
const MAX_REASON_BYTES: usize = 1024;
const MAX_EVENT_BYTES: usize = 32 * 1024;
const MAX_EVIDENCE: usize = 64;
const EVENT: &str = "before_completion";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckMode {
    Required,
    Observe,
}

/// Selected by the host from its reviewed configuration at task acceptance.
/// Live grants and handler code are supplied separately.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompletionCheck {
    pub id: BindingId,
    pub revision: Fingerprint,
    pub handler: ToolId,
    pub mode: CheckMode,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct CompletionChecks(Vec<CompletionCheck>);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "decision", rename_all = "snake_case", deny_unknown_fields)]
pub enum HandlerReply {
    Allow {},
    Deny { reason: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Block,
    Deferred(WaitId),
    Reconsider,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckStatus {
    Allowed,
    Denied,
    Failed,
    Cancelled,
    Uncertain,
    InvalidReply,
    Unavailable,
    Deferred,
    Skipped,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckEvidence {
    pub check: BindingId,
    pub revision: Fingerprint,
    /// Present only when the runtime recorded this operation.
    pub operation: Option<OperationId>,
    pub status: CheckStatus,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Review {
    pub decision: Decision,
    pub checks: Vec<CheckEvidence>,
}

impl CompletionChecks {
    pub fn new(checks: Vec<CompletionCheck>) -> Result<Self> {
        let selected = Self(checks);
        selected.validate()?;
        Ok(selected)
    }

    fn validate(&self) -> Result<()> {
        let mut ids = BTreeSet::new();
        if self.0.len() > MAX_CHECKS || self.0.iter().any(|check| !ids.insert(&check.id)) {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_completion_checks",
            ));
        }
        Ok(())
    }

    /// Run selected checks for one candidate. The caller settles against the
    /// original basis, so a later control or input change invalidates Allow.
    /// The runtime supplies the handler inventory and current authority checks.
    pub async fn review(
        &self,
        operations: &TurnOperations,
        basis: &TurnView,
        proposal: &TurnOutcome,
        tools: &InventorySnapshot,
        grants: &BTreeMap<BindingId, GrantSelection>,
    ) -> Result<Review> {
        self.validate()?;
        let mut review = Review {
            decision: Decision::Allow,
            checks: Vec::new(),
        };
        if proposal.status != OutcomeStatus::Succeeded || self.0.is_empty() {
            return Ok(review);
        }
        if !same_basis(operations, basis) {
            review.decision = Decision::Reconsider;
            return Ok(review);
        }
        let event = CompletionEvent::new(basis, proposal, Fingerprint::of(self)?)?;
        for (index, check) in self.0.iter().enumerate() {
            if !same_basis(operations, basis) {
                review.decision = Decision::Reconsider;
                break;
            }
            let result =
                execute_check(operations, &event, check, tools, grants.get(&check.id)).await;
            if !same_basis(operations, basis) {
                if let Ok((evidence, _)) = result {
                    review.checks.push(evidence);
                }
                review.decision = Decision::Reconsider;
                break;
            }
            let (evidence, interruption) = result?;
            let allowed = evidence.status == CheckStatus::Allowed;
            review.checks.push(evidence);
            if let Some(decision) = interruption {
                review.decision = decision;
                break;
            }
            if !allowed && check.mode == CheckMode::Required {
                review.decision = Decision::Block;
                review
                    .checks
                    .extend(self.0[index + 1..].iter().map(|later| CheckEvidence {
                        check: later.id.clone(),
                        revision: later.revision,
                        operation: None,
                        status: CheckStatus::Skipped,
                        reason: None,
                    }));
                break;
            }
        }
        Ok(review)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckInvocation {
    pub check: CompletionCheck,
    pub occurrence: CompletionEvent,
}

impl CheckInvocation {
    pub fn read(arguments: &ToolArguments) -> Result<Self> {
        let ToolArguments::Json(value) = arguments else {
            return Err(invalid_event());
        };
        let invocation: Self =
            serde_json::from_value(value.clone()).map_err(|_| invalid_event())?;
        let event = &invocation.occurrence;
        if event.event != EVENT
            || event.version != 1
            || event.text.len() > MAX_TEXT_BYTES
            || event.evidence.len() > MAX_EVIDENCE
            || event.identity
                != occurrence_identity(
                    &event.session,
                    &event.turn,
                    event.history_position,
                    event.proposal,
                )?
        {
            return Err(invalid_event());
        }
        Ok(invocation)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompletionEvent {
    event: String,
    version: u32,
    pub session: SessionId,
    pub turn: TurnId,
    pub history_position: HistoryPosition,
    pub has_text: bool,
    identity: Fingerprint,
    selection: Fingerprint,
    proposal: Fingerprint,
    text: String,
    text_truncated: bool,
    evidence: Vec<OperationId>,
    evidence_truncated: bool,
}

impl CompletionEvent {
    fn new(basis: &TurnView, proposal: &TurnOutcome, selection: Fingerprint) -> Result<Self> {
        if proposal.evidence.iter().any(|id| {
            basis
                .operation(id)
                .is_none_or(|record| record.outcome().is_none())
        }) {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "completion_hook_evidence_missing",
            ));
        }
        let binding = basis.state.binding();
        let history = basis.state.history().position();
        let proposal_id = Fingerprint::of(proposal)?;
        let account = proposal.account.as_ref().map(read_account).transpose()?;
        let text = account.as_ref().map_or("", |account| account.text.as_str());
        let end = text.floor_char_boundary(MAX_TEXT_BYTES.min(text.len()));
        Ok(Self {
            event: EVENT.into(),
            version: 1,
            session: binding.session.clone(),
            turn: binding.turn.clone(),
            history_position: history,
            has_text: !text.trim().is_empty(),
            identity: occurrence_identity(&binding.session, &binding.turn, history, proposal_id)?,
            selection,
            proposal: proposal_id,
            text: text[..end].into(),
            text_truncated: end < text.len(),
            evidence: proposal
                .evidence
                .iter()
                .take(MAX_EVIDENCE)
                .cloned()
                .collect(),
            evidence_truncated: proposal.evidence.len() > MAX_EVIDENCE,
        })
    }
}

async fn execute_check(
    operations: &TurnOperations,
    event: &CompletionEvent,
    check: &CompletionCheck,
    tools: &InventorySnapshot,
    grant: Option<&GrantSelection>,
) -> Result<(CheckEvidence, Option<Decision>)> {
    // A changed revision keeps the operation key. Its different captured
    // invocation cannot reuse a result or dispatch over the original record.
    let key = OperationKey::new(format!(
        "hook/{}",
        hex(Fingerprint::of(&(event.identity, &check.id))?)
    ))?;
    let id = operations.operation_id(&key)?;
    let arguments = ToolArguments::Json(json!({"check":check, "occurrence":event}));
    let mut evidence = CheckEvidence {
        check: check.id.clone(),
        revision: check.revision,
        operation: None,
        status: CheckStatus::Unavailable,
        reason: None,
    };
    let view = operations.view();
    if let Some(record) = recorded_check(&view, &id, check, &arguments)? {
        evidence.operation = Some(id.clone());
        if let Some(OperationOutcome::Tool(outcome)) = record.outcome() {
            (evidence.status, evidence.reason) = project_reply(outcome);
            return Ok((evidence, None));
        }
    }
    let Some(grant) = grant else {
        evidence.reason = Some("hook_grant_unavailable".into());
        return Ok((evidence, None));
    };
    if serde_json::to_vec(&arguments).map_or(true, |encoded| encoded.len() > MAX_EVENT_BYTES) {
        evidence.reason = Some("hook_event_limit".into());
        return Ok((evidence, None));
    }
    let result = operations
        .invoke_with_inventory(
            key,
            PlannedInvocation {
                tool: check.handler.clone(),
                arguments: arguments.clone(),
                grants: grant.clone(),
            },
            tools.clone(),
        )
        .await;
    let view = operations.view();
    if recorded_check(&view, &id, check, &arguments)?.is_some() {
        evidence.operation = Some(id);
    }
    let interruption = match result {
        Ok(InvokeOutcome::Complete(outcome)) => {
            (evidence.status, evidence.reason) = project_reply(&outcome);
            None
        }
        Ok(InvokeOutcome::Deferred(wait)) => {
            evidence.status = CheckStatus::Deferred;
            Some(Decision::Deferred(wait))
        }
        Ok(InvokeOutcome::Paused) => {
            evidence.status = CheckStatus::Deferred;
            Some(Decision::Reconsider)
        }
        Err(error) if error.kind == ErrorKind::Conflict => return Err(error),
        Err(error) => {
            evidence.status = if error.kind == ErrorKind::Uncertain {
                CheckStatus::Uncertain
            } else {
                CheckStatus::Unavailable
            };
            evidence.reason = safe_code(&error.code);
            None
        }
    };
    Ok((evidence, interruption))
}

fn occurrence_identity(
    session: &SessionId,
    turn: &TurnId,
    history: HistoryPosition,
    proposal: Fingerprint,
) -> Result<Fingerprint> {
    Fingerprint::of(&(EVENT, session, turn, history, proposal))
}

fn invalid_event() -> Error {
    Error::new(ErrorKind::InvalidInput, "invalid_completion_hook_event")
}

fn recorded_check<'a>(
    view: &'a TurnView,
    id: &OperationId,
    check: &CompletionCheck,
    arguments: &ToolArguments,
) -> Result<Option<&'a OperationState>> {
    let Some(record) = view.operation(id) else {
        return Ok(None);
    };
    if !matches!(&record.record.input, OperationInput::Tool(invocation)
        if invocation.definition().id == check.handler && invocation.arguments() == arguments)
    {
        return Err(Error::new(ErrorKind::Conflict, "hook_identity_changed"));
    }
    Ok(Some(record))
}

fn project_reply(outcome: &ToolOutcome) -> (CheckStatus, Option<String>) {
    match outcome.status {
        OutcomeStatus::Succeeded if !outcome.truncated => {
            let reply = outcome
                .structured
                .as_ref()
                .and_then(|body| serde_json::from_value(body.clone()).ok());
            match reply {
                Some(HandlerReply::Allow {}) => (CheckStatus::Allowed, None),
                Some(HandlerReply::Deny { reason })
                    if !reason.trim().is_empty() && reason.len() <= MAX_REASON_BYTES =>
                {
                    (CheckStatus::Denied, Some(reason))
                }
                _ => (CheckStatus::InvalidReply, None),
            }
        }
        OutcomeStatus::Succeeded => (CheckStatus::InvalidReply, None),
        OutcomeStatus::Failed | OutcomeStatus::Uncertain => (
            if outcome.status == OutcomeStatus::Failed {
                CheckStatus::Failed
            } else {
                CheckStatus::Uncertain
            },
            outcome.content.first().and_then(|part| match part {
                ResultContent::Text(reason) => safe_code(reason),
                _ => None,
            }),
        ),
        OutcomeStatus::Cancelled => (CheckStatus::Cancelled, None),
    }
}

fn same_basis(operations: &TurnOperations, basis: &TurnView) -> bool {
    let current = operations.view();
    current.state.binding() == basis.state.binding()
        && current.state.outcome().is_none()
        && current.state.controls().admits_work()
        && current.state.controls().revision == basis.state.controls().revision
        && current.state.history().position() == basis.state.history().position()
}

fn safe_code(text: &str) -> Option<String> {
    (!text.is_empty()
        && text.len() <= 128
        && text
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_'))
    .then(|| text.into())
}
