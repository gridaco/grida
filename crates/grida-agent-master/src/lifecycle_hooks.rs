//! Captured lifecycle policy over ordinary durable handler operations.

use crate::hooks::{CheckMode, CheckStatus};
use agent_kit_core::authority::GrantSelection;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Message, OutcomeStatus, ResultContent, Role, ToolArguments};
use agent_kit_core::tools::{InventorySnapshot, Invocation, ToolOutcome};
use agent_kit_core::turn::{ControlRevision, OperationInput, OperationOutcome, TurnOutcome};
use agent_kit_core::{
    BindingId, Error, ErrorKind, Fingerprint, OperationId, Result, SessionId, ToolId, TurnId,
};
use agent_kit_runtime::{InvokeOutcome, OperationKey, PlannedInvocation, TurnOperations, TurnView};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_HOOKS: usize = 8;
pub const MAX_EVENT_BYTES: usize = 64 * 1024;
pub const MAX_CONTEXT_BYTES: usize = 4 * 1024;
/// Leading bytes of the proposed answer a completion event carries.
pub const MAX_PROPOSAL_TEXT_BYTES: usize = 4 * 1024;
/// Evidence identifiers a completion event names; the rest are counted.
pub const MAX_PROPOSAL_EVIDENCE: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookEvent {
    SessionStart,
    BeforeInput,
    BeforeTool,
    AfterTool,
    BeforeCompletion,
}

impl HookEvent {
    pub const ALL: [Self; 5] = [
        Self::SessionStart,
        Self::BeforeInput,
        Self::BeforeTool,
        Self::AfterTool,
        Self::BeforeCompletion,
    ];
}

/// Host-reviewed selection. Executables and live grants remain with the host.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LifecycleHook {
    pub id: BindingId,
    pub source: String,
    pub revision: Fingerprint,
    pub event: HookEvent,
    pub tool: Option<ToolId>,
    pub mode: CheckMode,
    pub handler: ToolId,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct LifecycleHooks(Vec<LifecycleHook>);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case", deny_unknown_fields)]
pub enum HookMoment {
    SessionStart {
        control_revision: ControlRevision,
    },
    BeforeInput {
        message: Message,
    },
    BeforeTool {
        operation: OperationId,
        invocation: Invocation,
    },
    AfterTool {
        operation: OperationId,
        invocation: Invocation,
        outcome: ToolOutcome,
    },
    BeforeCompletion {
        proposal: CompletionProposal,
    },
}

/// The bounded review form of a proposed successful outcome. Its size does
/// not depend on how many steps, operations or hook results the turn holds:
/// accumulated diagnostics and usage stay in the account, and evidence is
/// named up to a fixed count. `fingerprint` identifies the complete proposal,
/// so each distinct candidate is a distinct occurrence.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompletionProposal {
    pub fingerprint: Fingerprint,
    pub status: OutcomeStatus,
    pub steps: u32,
    /// The leading bytes of the final answer, cut at a character boundary.
    pub text: String,
    pub text_truncated: bool,
    pub tool_activity: crate::ToolActivity,
    /// The lowest evidence identifiers in identifier order, at most
    /// [`MAX_PROPOSAL_EVIDENCE`].
    pub evidence: Vec<OperationId>,
    /// The number of distinct operations the proposal cites as evidence.
    pub evidence_total: usize,
}

impl CompletionProposal {
    /// Summarize a master-built outcome; one without its account is refused.
    pub fn new(outcome: &TurnOutcome) -> Result<Self> {
        let account = crate::read_account(outcome.account.as_ref().ok_or_else(invalid)?)?;
        let text = account.text.as_str();
        let end = text.floor_char_boundary(MAX_PROPOSAL_TEXT_BYTES.min(text.len()));
        let evidence = outcome.evidence.iter().collect::<BTreeSet<_>>();
        Ok(Self {
            fingerprint: Fingerprint::of(outcome)?,
            status: outcome.status,
            steps: account.steps,
            text: text[..end].into(),
            text_truncated: end < text.len(),
            tool_activity: account.tool_activity,
            evidence: evidence
                .iter()
                .take(MAX_PROPOSAL_EVIDENCE)
                .map(|id| (*id).clone())
                .collect(),
            evidence_total: evidence.len(),
        })
    }

    /// The named evidence is settled in this turn, and the total cannot
    /// exceed the operations the turn has settled.
    fn is_recorded_in(&self, view: &TurnView) -> bool {
        let settled = |id: &OperationId| {
            view.operation(id)
                .is_some_and(|record| record.outcome().is_some())
        };
        self.status == OutcomeStatus::Succeeded
            && self.text.len() <= MAX_PROPOSAL_TEXT_BYTES
            && self.evidence.len() == self.evidence_total.min(MAX_PROPOSAL_EVIDENCE)
            && self.evidence.is_sorted_by(|left, right| left < right)
            && self.evidence.iter().all(settled)
            && self.evidence_total
                <= view
                    .state
                    .operations()
                    .values()
                    .filter(|record| record.outcome().is_some())
                    .count()
    }
}

impl HookMoment {
    pub fn event(&self) -> HookEvent {
        match self {
            Self::SessionStart { .. } => HookEvent::SessionStart,
            Self::BeforeInput { .. } => HookEvent::BeforeInput,
            Self::BeforeTool { .. } => HookEvent::BeforeTool,
            Self::AfterTool { .. } => HookEvent::AfterTool,
            Self::BeforeCompletion { .. } => HookEvent::BeforeCompletion,
        }
    }
    fn tool(&self) -> Option<&ToolId> {
        match self {
            Self::BeforeTool { invocation, .. } | Self::AfterTool { invocation, .. } => {
                Some(&invocation.definition().id)
            }
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HookOccurrence {
    pub version: u32,
    pub session: SessionId,
    pub turn: TurnId,
    pub moment: HookMoment,
}

impl HookOccurrence {
    pub fn new(view: &TurnView, moment: HookMoment) -> Self {
        Self {
            version: 1,
            session: view.state.binding().session.clone(),
            turn: view.state.binding().turn.clone(),
            moment,
        }
    }

    pub fn validate(&self, view: &TurnView) -> Result<()> {
        if self.version != 1
            || self.session != view.state.binding().session
            || self.turn != view.state.binding().turn
        {
            return Err(invalid());
        }
        let valid = match &self.moment {
            HookMoment::SessionStart {control_revision} => *control_revision == view.state.controls().revision,
            HookMoment::BeforeInput {message} => message.role == Role::User && view.state.history().records().iter().any(|record| matches!(record, HistoryRecord::Message(existing) if existing == message)),
            HookMoment::BeforeTool {operation,invocation} => view.operation(operation).is_some_and(|target| target.outcome().is_none() && target.attempts.is_empty() && matches!(&target.record.input,OperationInput::Tool(expected) if expected == invocation)),
            HookMoment::AfterTool {operation,invocation,outcome} => view.operation(operation).is_some_and(|target| matches!(&target.record.input,OperationInput::Tool(expected) if expected == invocation) && matches!(target.outcome(),Some(OperationOutcome::Tool(expected)) if expected == outcome)),
            HookMoment::BeforeCompletion {proposal} => proposal.is_recorded_in(view),
        };
        if !valid {
            return Err(invalid());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HookInvocation {
    pub hook: LifecycleHook,
    pub selection: LifecycleHooks,
    pub occurrence: HookOccurrence,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "decision", rename_all = "snake_case", deny_unknown_fields)]
pub enum HookReply {
    Allow {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        context: Option<String>,
    },
    Deny {
        reason: String,
    },
    Continue {
        context: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookResult {
    pub id: BindingId,
    pub revision: Fingerprint,
    pub event: HookEvent,
    pub operation: Option<OperationId>,
    pub status: CheckStatus,
    pub reason: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HookDecision {
    Allow,
    Block,
    Uncertain,
    Continue,
    Reconsider,
}

pub struct HookReview {
    pub decision: HookDecision,
    pub results: Vec<HookResult>,
}

impl LifecycleHooks {
    pub fn new(hooks: Vec<LifecycleHook>) -> Result<Self> {
        let mut ids = BTreeSet::new();
        if hooks.len() > MAX_HOOKS
            || hooks.iter().any(|hook| {
                !ids.insert(&hook.id)
                    || hook.source.trim().is_empty()
                    || hook.source.len() > 256
                    || (hook.tool.is_some()
                        && !matches!(hook.event, HookEvent::BeforeTool | HookEvent::AfterTool))
            })
        {
            return Err(invalid());
        }
        Ok(Self(hooks))
    }
    pub fn definitions(&self) -> &[LifecycleHook] {
        &self.0
    }
    pub fn matches(&self, moment: &HookMoment) -> bool {
        self.0.iter().any(|hook| matches_hook(hook, moment))
    }
    /// Whether any hook selects this event and tool, without building the
    /// moment it would review.
    pub fn selects(&self, event: HookEvent, tool: Option<&ToolId>) -> bool {
        self.0.iter().any(|hook| selects(hook, event, tool))
    }
    pub fn is_handler(&self, tool: &ToolId) -> bool {
        self.0.iter().any(|hook| &hook.handler == tool)
    }
    pub fn unverified(
        &self,
        view: &TurnView,
        grants: &BTreeMap<BindingId, GrantSelection>,
    ) -> bool {
        self.0
            .iter()
            .filter(|hook| hook.mode == CheckMode::Required)
            .filter_map(|hook| grants.get(&hook.id))
            .any(|grant| crate::hooks::has_unverified_admission_check(view, grant))
    }
    pub async fn review(
        &self,
        operations: &TurnOperations,
        occurrence: HookOccurrence,
        tools: &InventorySnapshot,
        grants: &BTreeMap<BindingId, GrantSelection>,
    ) -> Result<HookReview> {
        Self::new(self.0.clone())?;
        let basis = operations.view();
        occurrence.validate(&basis)?;
        if matches!(occurrence.moment, HookMoment::SessionStart { .. }) {
            for record in basis
                .state
                .operations()
                .values()
                .filter(|record| record.outcome().is_none() && record.attempts.is_empty())
            {
                let OperationInput::Tool(invocation) = &record.record.input else {
                    continue;
                };
                let ToolArguments::Json(value) = invocation.arguments() else {
                    continue;
                };
                let Ok(previous) = serde_json::from_value::<HookInvocation>(value.clone()) else {
                    continue;
                };
                if previous.selection == *self
                    && previous.occurrence.session == occurrence.session
                    && previous.occurrence.turn == occurrence.turn
                    && matches!(previous.occurrence.moment, HookMoment::SessionStart { .. })
                    && Fingerprint::of(&previous.occurrence)? != Fingerprint::of(&occurrence)?
                {
                    // A pre-dispatch Pause retired this execution-start occurrence.
                    // Its unstarted handler must not survive beside the new start.
                    operations.cancel_prepared(record.record.id.clone()).await?;
                }
            }
        }
        let mut review = HookReview {
            decision: HookDecision::Allow,
            results: Vec::new(),
        };
        for hook in self
            .0
            .iter()
            .filter(|hook| matches_hook(hook, &occurrence.moment))
        {
            if !same_basis(&basis, &operations.view()) {
                review.decision = HookDecision::Reconsider;
                break;
            }
            let (result, decision) = execute(
                operations,
                self,
                hook,
                &occurrence,
                tools,
                grants.get(&hook.id),
            )
            .await?;
            review.results.push(result);
            if !same_basis(&basis, &operations.view()) {
                review.decision = HookDecision::Reconsider;
                break;
            }
            if decision == HookDecision::Reconsider {
                review.decision = decision;
                break;
            }
            if hook.mode == CheckMode::Required && decision != HookDecision::Allow {
                review.decision = decision;
                review.results.extend(
                    self.0
                        .iter()
                        .skip_while(|selected| selected.id != hook.id)
                        .skip(1)
                        .filter(|selected| matches_hook(selected, &occurrence.moment))
                        .map(|selected| HookResult {
                            id: selected.id.clone(),
                            revision: selected.revision,
                            event: selected.event,
                            operation: None,
                            status: CheckStatus::Skipped,
                            reason: Some("earlier_required_hook_blocked".into()),
                        }),
                );
                break;
            }
        }
        Ok(review)
    }
    /// Read only successfully recorded, attributed context. No handler is run.
    pub fn context(&self, view: &TurnView) -> Vec<serde_json::Value> {
        let mut context: Vec<_> = view.state.operations().values().filter_map(|record| {
            let OperationInput::Tool(invocation)=&record.record.input else{return None;};
            let ToolArguments::Json(value)=invocation.arguments() else{return None;};
            let selected:HookInvocation=serde_json::from_value(value.clone()).ok()?;
            if !self.0.contains(&selected.hook) || selected.occurrence.session!=view.state.binding().session || selected.occurrence.turn!=view.state.binding().turn || invocation.definition().id!=selected.hook.handler {return None;}
            let Some(OperationOutcome::Tool(outcome))=record.outcome() else{return None;};
            let (_,_,context)=project_reply(outcome,selected.hook.event);
            let effect = if matches!(read_reply(outcome), Some(HookReply::Continue {..})) {"verification_request"} else {"context"};
            context.map(|text|serde_json::json!({"source":selected.hook.source,"hook":selected.hook.id,"revision":selected.hook.revision,"event":selected.hook.event,"trust":"contextual_data","effect":effect,"text":text}))
        }).collect();
        let omitted = context.len().saturating_sub(64);
        context.truncate(64);
        if omitted > 0 {
            context.push(serde_json::json!({"trust":"contextual_data","omittedHookContexts":omitted,"reason":"hook_context_retention_limit"}));
        }
        context
    }
    /// Summarize retained results without exposing private command output.
    pub fn results(&self, view: &TurnView) -> Vec<HookResult> {
        let mut results = Vec::new();
        for record in view.state.operations().values() {
            let OperationInput::Tool(invocation) = &record.record.input else {
                continue;
            };
            let ToolArguments::Json(value) = invocation.arguments() else {
                continue;
            };
            let Ok(selected) = serde_json::from_value::<HookInvocation>(value.clone()) else {
                continue;
            };
            if !self.0.contains(&selected.hook)
                || selected.selection != *self
                || invocation.definition().id != selected.hook.handler
                || !selected.selection.0.contains(&selected.hook)
            {
                continue;
            }
            let (status, reason) = match record.outcome() {
                Some(OperationOutcome::Tool(outcome)) => {
                    let (status, reason, _) = project_reply(outcome, selected.hook.event);
                    (status, reason)
                }
                _ if record.is_uncertain() => (
                    CheckStatus::Uncertain,
                    Some("hook_outcome_uncertain".into()),
                ),
                _ => (CheckStatus::Deferred, None),
            };
            results.push(HookResult {
                id: selected.hook.id.clone(),
                revision: selected.hook.revision,
                event: selected.hook.event,
                operation: Some(record.record.id.clone()),
                status,
                reason,
            });
            if selected.hook.mode == CheckMode::Required
                && !matches!(status, CheckStatus::Allowed | CheckStatus::Deferred)
            {
                results.extend(
                    selected
                        .selection
                        .0
                        .iter()
                        .skip_while(|hook| hook.id != selected.hook.id)
                        .skip(1)
                        .filter(|hook| matches_hook(hook, &selected.occurrence.moment))
                        .map(|hook| HookResult {
                            id: hook.id.clone(),
                            revision: hook.revision,
                            event: hook.event,
                            operation: None,
                            status: CheckStatus::Skipped,
                            reason: Some("earlier_required_hook_blocked".into()),
                        }),
                );
            }
        }
        results
    }
}

fn matches_hook(hook: &LifecycleHook, moment: &HookMoment) -> bool {
    selects(hook, moment.event(), moment.tool())
}
fn selects(hook: &LifecycleHook, event: HookEvent, tool: Option<&ToolId>) -> bool {
    hook.event == event
        && hook
            .tool
            .as_ref()
            .is_none_or(|selected| tool == Some(selected))
}
fn same_basis(left: &TurnView, right: &TurnView) -> bool {
    left.state.controls().revision == right.state.controls().revision
        && left.state.history().position() == right.state.history().position()
        && right.state.controls().admits_work()
}
fn invalid() -> Error {
    Error::new(ErrorKind::InvalidInput, "invalid_lifecycle_hook")
}

async fn execute(
    operations: &TurnOperations,
    selection: &LifecycleHooks,
    hook: &LifecycleHook,
    occurrence: &HookOccurrence,
    tools: &InventorySnapshot,
    grant: Option<&GrantSelection>,
) -> Result<(HookResult, HookDecision)> {
    let identity = Fingerprint::of(&(occurrence, &hook.id))?;
    let key = OperationKey::new(format!("hook/lifecycle/{}", identity.to_hex()))?;
    let id = operations.operation_id(&key)?;
    let arguments = ToolArguments::Json(
        serde_json::to_value(HookInvocation {
            hook: hook.clone(),
            selection: selection.clone(),
            occurrence: occurrence.clone(),
        })
        .map_err(|_| invalid())?,
    );
    let mut result = HookResult {
        id: hook.id.clone(),
        revision: hook.revision,
        event: hook.event,
        operation: None,
        status: CheckStatus::Unavailable,
        reason: None,
    };
    let previous = operations.view().operation(&id).cloned();
    let outcome = if let Some(previous) = previous {
        result.operation = Some(id.clone());
        if !matches!(&previous.record.input,OperationInput::Tool(invocation) if invocation.definition().id==hook.handler && invocation.arguments()==&arguments)
        {
            return Err(Error::new(ErrorKind::Conflict, "hook_occurrence_changed"));
        }
        match previous.outcome() {
            Some(OperationOutcome::Tool(outcome)) => Some(outcome.clone()),
            _ if previous.is_uncertain() => {
                result.status = CheckStatus::Uncertain;
                result.reason = Some("hook_outcome_uncertain".into());
                return Ok((result, HookDecision::Uncertain));
            }
            _ => None,
        }
    } else {
        None
    };
    let outcome = match outcome {
        Some(outcome) => outcome,
        None => {
            let Some(grant) = grant else {
                result.reason = Some("hook_grant_unavailable".into());
                return Ok((result, HookDecision::Block));
            };
            if serde_json::to_vec(&arguments).map_or(true, |bytes| bytes.len() > MAX_EVENT_BYTES) {
                result.reason = Some("hook_event_limit".into());
                return Ok((result, HookDecision::Block));
            }
            let dispatched = operations
                .invoke_with_inventory(
                    key,
                    PlannedInvocation {
                        tool: hook.handler.clone(),
                        arguments,
                        grants: grant.clone(),
                    },
                    tools.clone(),
                )
                .await;
            if operations.view().operation(&id).is_some() {
                result.operation = Some(id);
            }
            match dispatched {
                Ok(InvokeOutcome::Complete(outcome)) => outcome,
                Ok(InvokeOutcome::Paused) => {
                    result.status = CheckStatus::Deferred;
                    return Ok((result, HookDecision::Reconsider));
                }
                Ok(InvokeOutcome::Deferred(_)) => {
                    result.status = CheckStatus::Deferred;
                    result.reason = Some("hook_deferred".into());
                    return Ok((result, HookDecision::Block));
                }
                Err(error) if error.kind == ErrorKind::Conflict => return Err(error),
                Err(error) => {
                    result.status = if error.kind == ErrorKind::Uncertain {
                        CheckStatus::Uncertain
                    } else {
                        CheckStatus::Failed
                    };
                    result.reason = Some("hook_execution_failed".into());
                    return Ok((
                        result,
                        if error.kind == ErrorKind::Uncertain {
                            HookDecision::Uncertain
                        } else {
                            HookDecision::Block
                        },
                    ));
                }
            }
        }
    };
    let (status, reason, context) = project_reply(&outcome, hook.event);
    result.status = status;
    result.reason = reason;
    let decision = match status {
        CheckStatus::Allowed => {
            if matches!(read_reply(&outcome), Some(HookReply::Continue { .. })) && context.is_some()
            {
                HookDecision::Continue
            } else {
                HookDecision::Allow
            }
        }
        CheckStatus::Uncertain => HookDecision::Uncertain,
        _ => HookDecision::Block,
    };
    Ok((result, decision))
}

fn read_reply(outcome: &ToolOutcome) -> Option<HookReply> {
    outcome
        .structured
        .clone()
        .and_then(|value| serde_json::from_value(value).ok())
}
fn project_reply(
    outcome: &ToolOutcome,
    event: HookEvent,
) -> (CheckStatus, Option<String>, Option<String>) {
    if outcome.status != OutcomeStatus::Succeeded || outcome.truncated {
        let reason = outcome
            .content
            .iter()
            .find_map(|content| match content {
                ResultContent::Text(code)
                    if matches!(
                        code.as_str(),
                        "lifecycle_hook_timed_out"
                            | "lifecycle_hook_output_limit"
                            | "reviewed_executable_changed"
                    ) =>
                {
                    Some(code.clone())
                }
                _ => None,
            })
            .unwrap_or_else(|| "hook_execution_failed".into());
        return (
            match outcome.status {
                OutcomeStatus::Uncertain => CheckStatus::Uncertain,
                OutcomeStatus::Cancelled => CheckStatus::Cancelled,
                _ => CheckStatus::Failed,
            },
            Some(reason),
            None,
        );
    }
    match read_reply(outcome) {
        Some(HookReply::Allow { context })
            if context
                .as_ref()
                .is_none_or(|text| text.len() <= MAX_CONTEXT_BYTES) =>
        {
            (CheckStatus::Allowed, None, context)
        }
        Some(HookReply::Deny { reason }) if !reason.trim().is_empty() && reason.len() <= 1024 => {
            (CheckStatus::Denied, Some(reason), None)
        }
        Some(HookReply::Continue { context })
            if event == HookEvent::BeforeCompletion
                && !context.trim().is_empty()
                && context.len() <= MAX_CONTEXT_BYTES =>
        {
            (CheckStatus::Allowed, None, Some(context))
        }
        _ => (
            CheckStatus::InvalidReply,
            Some("hook_invalid_reply".into()),
            None,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::AttemptId;
    use agent_kit_core::inference::{MeasurementKind, UsageObservation};

    const STEPS: usize = 200;

    fn longest(prefix: &str, index: usize) -> String {
        format!("{prefix}{index:0>width$}", width = 256 - prefix.len())
    }

    /// The account a turn at the step guard accumulates: one inference and
    /// one hook operation per step, every hook result and usage observation.
    fn guard_outcome(text: &str, evidence: Vec<OperationId>) -> TurnOutcome {
        let hook = BindingId::new("verify").unwrap();
        let revision = Fingerprint::of(&"reviewed").unwrap();
        let account = crate::Account {
            text: text.into(),
            steps: STEPS as u32,
            unresolved: Vec::new(),
            tool_activity: crate::ToolActivity {
                succeeded: STEPS,
                ..Default::default()
            },
            stop_reason: None,
            failure: None,
            inference_failure: None,
            inference_usage: crate::usage::InferenceUsage {
                observations: (0..2 * STEPS)
                    .map(|index| UsageObservation {
                        attempt: AttemptId::new(longest("attempt_", index)).unwrap(),
                        source: "provider".into(),
                        category: "input_tokens".into(),
                        unit: "tokens".into(),
                        revision: 2,
                        quantity: 4096,
                        certainty: MeasurementKind::Exact,
                        final_value: true,
                    })
                    .collect(),
                unreported_attempts: Vec::new(),
            },
            independent_review: None,
            goal: None,
            completion_checks: Vec::new(),
            lifecycle_hooks: evidence
                .iter()
                .take(STEPS)
                .map(|operation| HookResult {
                    id: hook.clone(),
                    revision,
                    event: HookEvent::BeforeCompletion,
                    operation: Some(operation.clone()),
                    status: CheckStatus::Allowed,
                    reason: None,
                })
                .collect(),
        };
        TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: Some(crate::encode(crate::ACCOUNT_SCHEMA, &account).unwrap()),
            evidence,
        }
    }

    fn event_bytes(session: &str, hooks: &LifecycleHooks, proposal: CompletionProposal) -> usize {
        let invocation = HookInvocation {
            hook: hooks
                .definitions()
                .iter()
                .find(|hook| hook.event == HookEvent::BeforeCompletion)
                .unwrap()
                .clone(),
            selection: hooks.clone(),
            occurrence: HookOccurrence {
                version: 1,
                session: SessionId::new(session).unwrap(),
                turn: TurnId::new(session).unwrap(),
                moment: HookMoment::BeforeCompletion { proposal },
            },
        };
        // `execute` measures the invocation arguments as this JSON value.
        serde_json::to_vec(&serde_json::to_value(&invocation).unwrap())
            .unwrap()
            .len()
    }

    #[test]
    fn a_completion_event_at_the_step_guard_stays_within_the_event_limit() {
        // Largest legal shape: eight hooks with maximal identifiers and
        // control-character sources, a long control-character answer, and
        // maximal evidence identifiers. Every string escapes at its worst.
        let source = "\u{1}".repeat(256);
        let hooks = LifecycleHooks::new(
            (0..MAX_HOOKS)
                .map(|index| {
                    let completion = index + 1 == MAX_HOOKS;
                    LifecycleHook {
                        id: BindingId::new(longest("hook_", index)).unwrap(),
                        source: source.clone(),
                        revision: Fingerprint::of(&index).unwrap(),
                        event: if completion {
                            HookEvent::BeforeCompletion
                        } else {
                            HookEvent::BeforeTool
                        },
                        tool: (!completion).then(|| ToolId::new(longest("tool_", index)).unwrap()),
                        mode: CheckMode::Required,
                        handler: ToolId::new(longest("handler_", index)).unwrap(),
                    }
                })
                .collect(),
        )
        .unwrap();
        let evidence = (0..2 * STEPS)
            .map(|index| OperationId::new(longest("operation_", index)).unwrap())
            .collect::<Vec<_>>();
        let outcome = guard_outcome(&"\u{1}".repeat(64 * 1024), evidence);
        assert!(
            serde_json::to_vec(&outcome).unwrap().len() > MAX_EVENT_BYTES,
            "the unbounded proposal must exceed the limit for this to prove anything"
        );
        let proposal = CompletionProposal::new(&outcome).unwrap();
        assert_eq!(proposal.steps, STEPS as u32);
        assert_eq!(proposal.text.len(), MAX_PROPOSAL_TEXT_BYTES);
        assert!(proposal.text_truncated);
        assert_eq!(proposal.evidence.len(), MAX_PROPOSAL_EVIDENCE);
        assert_eq!(proposal.evidence_total, 2 * STEPS);
        let bytes = event_bytes(&longest("session_", 0), &hooks, proposal);
        assert!(bytes < MAX_EVENT_BYTES, "{bytes}");
    }

    #[test]
    fn a_completion_event_does_not_grow_with_turn_length() {
        let hooks = LifecycleHooks::new(vec![LifecycleHook {
            id: BindingId::new("verify").unwrap(),
            source: "trusted-user".into(),
            revision: Fingerprint::of(&"reviewed").unwrap(),
            event: HookEvent::BeforeCompletion,
            tool: None,
            mode: CheckMode::Required,
            handler: ToolId::new("lifecycle_hook/verify").unwrap(),
        }])
        .unwrap();
        // Runtime-minted identifiers have this shape.
        let minted = |index: usize| {
            OperationId::new(format!(
                "operation_{}",
                Fingerprint::of(&index).unwrap().to_hex()
            ))
            .unwrap()
        };
        let short = guard_outcome(
            "Done.",
            (0..2 * MAX_PROPOSAL_EVIDENCE).map(minted).collect(),
        );
        let long = guard_outcome("Done.", (0..2 * STEPS).map(minted).collect());
        let short = event_bytes("session", &hooks, CompletionProposal::new(&short).unwrap());
        let long = event_bytes("session", &hooks, CompletionProposal::new(&long).unwrap());
        assert!(long.abs_diff(short) <= 4, "{short} {long}");
        assert!(long < MAX_EVENT_BYTES / 8, "{long}");
    }

    #[test]
    fn the_proposal_fingerprint_is_deterministic_and_distinguishes_candidates() {
        let evidence = (0..4)
            .map(|index| OperationId::new(format!("operation_{index}")).unwrap())
            .collect::<Vec<_>>();
        let first = guard_outcome("Done.", evidence.clone());
        let again = CompletionProposal::new(&first).unwrap();
        assert_eq!(CompletionProposal::new(&first).unwrap(), again);
        let mut changed = first.clone();
        crate::update_account(&mut changed, |account| {
            account.lifecycle_hooks.pop();
        })
        .unwrap();
        let changed = CompletionProposal::new(&changed).unwrap();
        // The bounded fields agree; only the complete candidate differs.
        assert_eq!(changed.evidence, again.evidence);
        assert_ne!(changed.fingerprint, again.fingerprint);
        let unaccounted = TurnOutcome {
            account: None,
            ..first
        };
        assert!(CompletionProposal::new(&unaccounted).is_err());
    }
}
