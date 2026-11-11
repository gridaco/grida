//! Bounded conversational policy composed over the reusable execution runtime.

pub mod approval_review;
pub mod compaction;
pub mod configuration;
pub mod conversation_seed;
pub mod effort;
pub mod goals;
pub mod history;
pub mod hooks;
pub mod presentation;
pub mod questions;
pub mod retained_file;
mod retry;
pub mod side_context;
pub mod subagents;
pub mod usage;
pub mod wakeups;

use agent_kit_core::authority::GrantSelection;
use agent_kit_core::history::{HistoryPosition, HistoryRecord};
use agent_kit_core::inference::{
    FailureKind, InferenceFailure, InferenceOutcome, InferenceRequest, InferenceStatus,
    PreparedRequest, Provider,
};
use agent_kit_core::messages::{Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role};
use agent_kit_core::tools::InventorySnapshot;
use agent_kit_core::turn::{
    OperationInput, OperationOutcome, OperationState, SettlementReceipt, SuspensionReceipt,
    TurnOutcome, TurnState,
};
use agent_kit_core::{
    BoxFuture, Envelope, Error, ErrorKind, Fingerprint, MessageId, OperationId, Result, SchemaId,
};
use agent_kit_runtime::{
    CompletionDraft, FinishOutcome, InvokeOutcome, OperationKey, StepPlan, SuspendOutcome,
    SuspensionDraft, Turn, TurnView,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::num::NonZeroU64;
use std::sync::Arc;

const CONTINUATION_SCHEMA: &str = "grida.agent.conversation";
const ACCOUNT_SCHEMA: &str = "grida.agent.account";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperatingRegime {
    #[default]
    Act,
    Plan,
}

impl OperatingRegime {
    pub fn is_act(&self) -> bool {
        *self == Self::Act
    }

    pub fn apply(self, config: &mut MasterConfig) {
        if self == Self::Plan {
            config.instructions.push_str("\n\nPlan is active. Investigate permitted material and ask useful questions. End with a reviewable proposal describing the intended outcome, important decisions, and how to verify the work. Leave execution for an explicitly authorized Act turn.");
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MasterConfig {
    pub model: agent_kit_core::ModelId,
    pub instructions: String,
    pub max_steps: u32,
    /// None selects the provider's own output allowance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Account {
    pub text: String,
    pub steps: u32,
    pub unresolved: Vec<OperationId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_activity: Option<ToolActivity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<StopReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<Error>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inference_failure: Option<InferenceFailure>,
    #[serde(default)]
    pub inference_usage: usage::InferenceUsage,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub independent_review: Option<effort::ReviewEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goal: Option<goals::ProgressAccount>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub completion_checks: Vec<hooks::CheckEvidence>,
}

/// Final dispositions of recorded tool operations, counted once per operation.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolActivity {
    pub succeeded: usize,
    pub failed: usize,
    pub cancelled: usize,
    pub unresolved: usize,
}

impl ToolActivity {
    fn from_turn(view: &TurnView) -> Self {
        let mut counts = Self::default();
        for operation in view.state.operations().values() {
            if !matches!(operation.record.input, OperationInput::Tool(_)) {
                continue;
            }
            match operation.outcome() {
                Some(OperationOutcome::Tool(result)) => match result.status {
                    OutcomeStatus::Succeeded => counts.succeeded += 1,
                    OutcomeStatus::Failed => counts.failed += 1,
                    OutcomeStatus::Cancelled => counts.cancelled += 1,
                    OutcomeStatus::Uncertain => counts.unresolved += 1,
                },
                _ => counts.unresolved += 1,
            }
        }
        counts
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    StepLimit,
    OutputLimit,
    Refused,
}

#[derive(Clone, Debug)]
pub struct MasterAuthority {
    pub inference: GrantSelection,
    pub tools: BTreeMap<agent_kit_core::ToolId, GrantSelection>,
}

pub enum MasterOutcome {
    Settled(SettlementReceipt),
    Suspended(SuspensionReceipt),
}

/// Product decisions for one bounded conversational turn.
pub struct Master {
    config: MasterConfig,
    provider: Arc<dyn Provider>,
    tools: InventorySnapshot,
    authority: MasterAuthority,
    history: Vec<Message>,
    input_limit: Option<NonZeroU64>,
    retained_file_check: Option<Box<dyn Fn() -> BoxFuture<'static, Result<()>> + Send + Sync>>,
    effort: Option<effort::Policy>,
    goal_verifier: Option<Box<goals::settlement::Verifier>>,
    goal_child_work: Option<Arc<dyn goals::ChildWorkObserver>>,
    completion_checks: Option<CompletionChecksExecution>,
    required_admission_check: Option<GrantSelection>,
    approval_reviewer: Option<Arc<dyn approval_review::Reviewer>>,
}

struct CompletionChecksExecution {
    checks: hooks::CompletionChecks,
    tools: InventorySnapshot,
    grants: BTreeMap<agent_kit_core::BindingId, GrantSelection>,
}

enum RequestRefresh {
    Unchanged,
    Retired,
    Rejected(Error),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Continuation {
    configuration: Fingerprint,
    step: u32,
    request: Option<PreparedRequest>,
    interrupted: bool,
    outcome: Option<TurnOutcome>,
    #[serde(default)]
    request_history: Option<HistoryPosition>,
    #[serde(default)]
    request_generation: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    retry: Option<retry::AdmissionRetry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    effort: Option<effort::Policy>,
}

impl Continuation {
    fn pending_retry(&self) -> Option<&retry::AdmissionRetry> {
        self.retry.as_ref().filter(|retry| retry.step == self.step)
    }

    fn step_key(&self) -> String {
        if self.request_generation == 0 {
            format!("conversation/{}", self.step)
        } else {
            format!(
                "conversation/{}/replacement/{}",
                self.step, self.request_generation
            )
        }
    }
}

/// The retained deadline for the current retry step, if it has been reserved.
pub fn pending_retry_not_before(state: &TurnState) -> Result<Option<u64>> {
    let has_rejection = state.operations().values().any(|operation| {
        matches!(
            operation.outcome(),
            Some(OperationOutcome::Inference(outcome)) if retry::admission_rejection(outcome).is_some()
        )
    });
    let Some(checkpoint) = state.checkpoint().filter(|checkpoint| {
        has_rejection
            && !state.controls().cancelled
            && checkpoint.schema().as_str() == CONTINUATION_SCHEMA
    }) else {
        return Ok(None);
    };
    let continuation: Continuation = decode(CONTINUATION_SCHEMA, checkpoint)?;
    Ok(continuation
        .pending_retry()
        .filter(|_| continuation.outcome.is_none())
        .map(|retry| retry.not_before_ms))
}

impl Master {
    pub fn new(
        config: MasterConfig,
        provider: Arc<dyn Provider>,
        tools: InventorySnapshot,
        authority: MasterAuthority,
    ) -> Result<Self> {
        if config.max_steps == 0 || config.max_output_tokens == Some(0) {
            return Err(Error::new(ErrorKind::InvalidInput, "invalid_master_limits"));
        }
        Ok(Self {
            config,
            provider,
            tools,
            authority,
            history: Vec::new(),
            input_limit: None,
            retained_file_check: None,
            effort: None,
            goal_verifier: None,
            goal_child_work: None,
            completion_checks: None,
            required_admission_check: None,
            approval_reviewer: None,
        })
    }

    /// Supply an immutable projection of preceding conversation turns.
    pub fn with_history(mut self, history: Vec<Message>) -> Self {
        self.history = history;
        self
    }

    /// Hold this turn if its host-owned admission check has an unverified result.
    pub fn with_required_admission_check(mut self, grant: GrantSelection) -> Self {
        self.required_admission_check = Some(grant);
        self
    }

    fn admission_unverified(&self, view: &TurnView) -> bool {
        self.required_admission_check
            .as_ref()
            .is_some_and(|grant| hooks::has_unverified_admission_check(view, grant))
    }

    /// Apply the accepted task's hard limit to the complete provider input.
    pub fn with_input_limit(mut self, limit: Option<NonZeroU64>) -> Self {
        self.input_limit = limit;
        self
    }

    /// Check the captured file dependency before generation, including when
    /// a prepared inference request is restored after suspension.
    pub fn with_retained_file_check(
        mut self,
        check: impl Fn() -> BoxFuture<'static, Result<()>> + Send + Sync + 'static,
    ) -> Self {
        self.retained_file_check = Some(Box::new(check));
        self
    }

    /// Apply a captured effort policy. The exact delegation offer is checked
    /// before further work, while Stop can settle without the live tool.
    pub fn with_effort(mut self, policy: effort::Policy) -> Result<Self> {
        if self.effort.is_some() {
            return Err(Error::new(
                ErrorKind::Conflict,
                "master_effort_already_bound",
            ));
        }
        policy.apply(&mut self.config)?;
        if policy.preset() == effort::Preset::Ultra {
            self.effort = Some(policy);
        }
        Ok(self)
    }

    /// Install the accepted completion policy and its private handler inventory.
    /// The selected revisions are retained separately from live dispatch grants.
    pub fn with_completion_checks(
        mut self,
        checks: hooks::CompletionChecks,
        tools: InventorySnapshot,
        grants: BTreeMap<agent_kit_core::BindingId, GrantSelection>,
    ) -> Self {
        self.completion_checks = Some(CompletionChecksExecution {
            checks,
            tools,
            grants,
        });
        self
    }

    /// Select the captured approval reviewer independently of tools and grants.
    pub fn with_approval_reviewer(mut self, reviewer: Arc<dyn approval_review::Reviewer>) -> Self {
        self.approval_reviewer = Some(reviewer);
        self
    }

    /// Accept evidence through a product verifier of recorded tool outcomes.
    /// The verifier must check the criterion against the outcome independently
    /// of the model's proposal. It can be called when preparing an evidence
    /// hint and again at settlement, so it must be pure.
    pub fn with_goal_verifier(
        mut self,
        verifier: impl Fn(&str, &OperationState) -> bool + Send + Sync + 'static,
    ) -> Self {
        self.goal_verifier = Some(Box::new(verifier));
        self
    }

    /// Observe recorded use of a captured Goal reservation's child share.
    /// A missing or unsettled observation holds the reservation.
    pub fn with_goal_child_work(mut self, observer: Arc<dyn goals::ChildWorkObserver>) -> Self {
        self.goal_child_work = Some(observer);
        self
    }

    pub async fn run(&self, mut turn: Turn, input: Vec<Message>) -> Result<MasterOutcome> {
        let max_steps = {
            let view = turn.view();
            goals::settlement::step_limit(
                &view.state,
                self.config.max_steps,
                self.effort
                    .as_ref()
                    .map_or(0, effort::Policy::reserved_child_generation_steps),
            )?
        };
        let reviewer = self.approval_reviewer.as_ref().filter(|_| max_steps > 1);
        let max_steps = max_steps - u32::from(reviewer.is_some());
        let mut continuation = self.continuation(&turn)?;
        self.accept_input(&mut turn, input).await?;
        Self::retain_orphaned_work(&turn, &turn.view()).await?;
        let mut effort_to_verify = self.effort.as_ref();
        loop {
            let view = turn.view();
            if view.state.controls().cancelled {
                let outcome = self
                    .cancelled_continuation(&mut turn, &mut continuation)
                    .await?;
                let basis = turn.view();
                match self
                    .finish(&mut turn, &mut continuation, outcome, &basis)
                    .await?
                {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            if view.state.controls().paused {
                if self.admission_unverified(&view) {
                    // A cancelled parent gate can drop a started private check.
                    // Preserve its orphaned attempt before releasing this owner.
                    Self::retain_orphaned_work(&turn, &view).await?;
                }
                let basis = turn.view();
                if basis.state.controls().revision != view.state.controls().revision {
                    continue;
                }
                continuation.interrupted = true;
                match self.suspend(&mut turn, &continuation, &basis).await? {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            if self.admission_unverified(&view) {
                let outcome = self
                    .interrupted_continuation(
                        &mut turn,
                        &mut continuation,
                        OutcomeStatus::Uncertain,
                        "A required tool check has an unconfirmed outcome.",
                    )
                    .await?;
                let basis = turn.view();
                if basis.state.controls().revision != view.state.controls().revision {
                    continue;
                }
                match self
                    .finish(&mut turn, &mut continuation, outcome, &basis)
                    .await?
                {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            if let Some(outcome) = continuation.outcome.clone() {
                if outcome.status == OutcomeStatus::Succeeded
                    && has_new_input(&turn, &continuation)?
                {
                    continuation.outcome = None;
                    continue;
                }
                if view.state.waits().values().any(|wait| wait.is_pending()) {
                    match self.suspend(&mut turn, &continuation, &view).await? {
                        Some(outcome) => return Ok(outcome),
                        None => continue,
                    }
                }
                match self
                    .finish(&mut turn, &mut continuation, outcome, &view)
                    .await?
                {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            if continuation.step >= max_steps {
                let outcome = self.account(
                    &turn,
                    OutcomeStatus::Failed,
                    continuation.step,
                    "The configured step limit was reached.",
                    Some(StopReason::StepLimit),
                    None,
                )?;
                match self
                    .finish(&mut turn, &mut continuation, outcome, &view)
                    .await?
                {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            if let Some(effort) = effort_to_verify.take() {
                effort.verify_offer(
                    &self.tools,
                    &self.authority.tools,
                    &self.provider.capabilities(&self.config.model)?,
                )?;
            }
            let rebind_failure = match self
                .retire_unstarted_request(&mut turn, &mut continuation)
                .await?
            {
                RequestRefresh::Unchanged => None,
                RequestRefresh::Retired => continue,
                RequestRefresh::Rejected(error) => Some(error),
            };
            let step_key = continuation.step_key();
            let retry = continuation.pending_retry();
            let delay = match rebind_failure {
                Some(error) => Err(error),
                None => retry
                    .map(|retry| retry.delay(&self.authority.inference))
                    .transpose(),
            };
            if let Ok(Some(delay)) = &delay
                && !delay.is_zero()
                && !turn
                    .wait_while_admitted(view.state.controls().revision, *delay)
                    .await?
            {
                continue;
            }
            let checked = if let Some(check) = &self.retained_file_check
                && delay.is_ok()
            {
                let result = check().await;
                if !turn.view().state.controls().admits_work() {
                    continue;
                }
                result
            } else {
                Ok(())
            };
            if checked.is_err() {
                // A restored step can still own prepared tool work even when
                // its inference has already completed. Preserve the answer
                // and close unstarted work before settling the missing input.
                Self::retire_outstanding_work(&turn).await?;
            }
            let input_view = turn.view();
            let prepared = delay.and(checked).and_then(|_| {
                let request = match &continuation.request {
                    Some(request) => request.clone(),
                    None => self.prepare(&input_view)?,
                };
                if let Some(retry) = retry {
                    retry.verify_request(&request)?;
                }
                Ok(request)
            });
            let request = match prepared {
                Ok(request) => request,
                Err(error) => {
                    let text = if error.code == "retained_file_original_unavailable" {
                        "The original attachment is unavailable. Attach the file again in a new message."
                    } else if error.code == "retained_file_working_copy_unavailable" {
                        "The recorded attachment working copy is unavailable. Attach the file again in a new message."
                    } else if retry.is_some() {
                        "The rate-limited request could not retry with its captured configuration."
                    } else {
                        "The model input could not be prepared with the selected configuration."
                    };
                    let mut outcome = self.account(
                        &turn,
                        OutcomeStatus::Failed,
                        continuation.step,
                        text,
                        None,
                        None,
                    )?;
                    let mut account =
                        read_account(outcome.account.as_ref().expect("master account"))?;
                    account.failure = Some(error);
                    outcome.account = Some(encode(ACCOUNT_SCHEMA, &account)?);
                    continuation.request = None;
                    continuation.outcome = Some(outcome);
                    turn.checkpoint(
                        OperationKey::new(format!("{step_key}/input-rejected"))?,
                        encode(CONTINUATION_SCHEMA, &continuation)?,
                    )
                    .await?;
                    continue;
                }
            };
            if continuation.request.is_none() {
                continuation.request_history = Some(input_view.state.history().position());
                if continuation.pending_retry().is_some() {
                    continuation.interrupted = false;
                }
                continuation.request = Some(request.clone());
                turn.checkpoint(
                    OperationKey::new(format!("{step_key}/request"))?,
                    encode(CONTINUATION_SCHEMA, &continuation)?,
                )
                .await?;
            }
            let step = turn
                .step(StepPlan {
                    key: OperationKey::new(step_key.clone())?,
                    request,
                    inference_grants: self.authority.inference.clone(),
                    tool_grants: self.authority.tools.clone(),
                    tools: self.tools.clone(),
                })
                .await;
            let step = match step {
                Ok(step) => step,
                Err(error) => {
                    let current = turn.view();
                    if self.admission_unverified(&current) {
                        continue;
                    }
                    if current.state.controls().paused && !current.state.controls().cancelled {
                        continuation.interrupted = true;
                        match self.suspend(&mut turn, &continuation, &current).await? {
                            Some(outcome) => return Ok(outcome),
                            None => continue,
                        }
                    }
                    if current.state.controls().cancelled {
                        let outcome = self
                            .cancelled_continuation(&mut turn, &mut continuation)
                            .await?;
                        let basis = turn.view();
                        match self
                            .finish(&mut turn, &mut continuation, outcome, &basis)
                            .await?
                        {
                            Some(outcome) => return Ok(outcome),
                            None => continue,
                        }
                    }
                    if error.kind == ErrorKind::LimitExceeded
                        && error.code == "operation_limit"
                        && current
                            .state
                            .operations()
                            .values()
                            .all(|operation| operation.outcome().is_some())
                    {
                        let mut outcome = self.account(
                            &turn,
                            OutcomeStatus::Failed,
                            continuation.step,
                            "Execution reached the configured operation limit.",
                            None,
                            None,
                        )?;
                        let mut account =
                            read_account(outcome.account.as_ref().expect("master account"))?;
                        account.failure = Some(error);
                        outcome.account = Some(encode(ACCOUNT_SCHEMA, &account)?);
                        continuation.request = None;
                        continuation.outcome = Some(outcome);
                        turn.checkpoint(
                            OperationKey::new(format!("{step_key}/execution-rejected"))?,
                            encode(CONTINUATION_SCHEMA, &continuation)?,
                        )
                        .await?;
                        continue;
                    }
                    return Err(error);
                }
            };
            if self.admission_unverified(&turn.view())
                || step
                    .tools
                    .iter()
                    .any(|tool| matches!(tool.outcome, InvokeOutcome::Paused))
            {
                // Revisit the same captured step after controls settle. A sibling
                // may already have committed an effect under this step identity.
                continue;
            }
            let deferred: Vec<_> = step
                .tools
                .iter()
                .filter_map(|tool| match &tool.outcome {
                    InvokeOutcome::Deferred(wait) => Some(wait.clone()),
                    InvokeOutcome::Complete(_) | InvokeOutcome::Paused => None,
                })
                .collect();
            if !deferred.is_empty() {
                let current = turn.view();
                if current.state.controls().admits_work()
                    && step.inference.status == InferenceStatus::Completed
                    && step.inference.failure.is_none()
                    && continuation.request_history == Some(current.state.history().position())
                    && let Some(reviewer) = reviewer
                    && reviewer
                        .review(&turn.operations(), &current, &deferred)
                        .await?
                {
                    continue;
                }
                let current = turn.view();
                if current.state.controls().cancelled {
                    let outcome = self
                        .cancelled_continuation(&mut turn, &mut continuation)
                        .await?;
                    let basis = turn.view();
                    match self
                        .finish(&mut turn, &mut continuation, outcome, &basis)
                        .await?
                    {
                        Some(outcome) => return Ok(outcome),
                        None => continue,
                    }
                }
                match self.suspend(&mut turn, &continuation, &current).await? {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            let current = turn.view();
            if current.state.controls().paused && !current.state.controls().cancelled {
                continuation.interrupted = true;
                match self.suspend(&mut turn, &continuation, &current).await? {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            let uncertain =
                presentation::blocks_continuation(&turn, &step_key, &current.state, &step.tools)?;
            let interrupted_by_pause = step.inference.failure.as_ref().is_some_and(|failure| {
                failure.kind == FailureKind::Cancelled && failure.code == "turn_paused"
            });
            if interrupted_by_pause
                && !current.state.controls().cancelled
                && turn
                    .operation(&OperationKey::new(step_key.clone())?)?
                    .as_ref()
                    .is_some_and(paused_before_generation)
            {
                // The next pass retires this request under the current controls.
                continue;
            }
            continuation.step += 1;
            let mut retrying = false;
            if continuation.retry.is_none()
                && continuation.step < max_steps
                && !current.state.controls().cancelled
                && step.tools.is_empty()
                && let Some(request) = &continuation.request
            {
                continuation.retry = retry::AdmissionRetry::schedule(
                    continuation.step,
                    request,
                    &self.authority.inference,
                    &step.inference,
                );
                retrying = continuation.retry.is_some();
            }
            let outcome = if current.state.controls().cancelled {
                Some(self.cancelled_outcome(&turn, continuation.step).await?)
            } else if uncertain {
                Some(self.account(
                    &turn,
                    OutcomeStatus::Uncertain,
                    continuation.step,
                    "An operation has an unconfirmed outcome.",
                    None,
                    step.inference.failure.as_ref(),
                )?)
            } else if interrupted_by_pause || retrying {
                None
            } else {
                match step.inference.status {
                    InferenceStatus::Completed if step.tools.is_empty() => {
                        let text = answer(&step.inference.messages);
                        Some(self.account(
                            &turn,
                            OutcomeStatus::Succeeded,
                            continuation.step,
                            &text,
                            None,
                            step.inference.failure.as_ref(),
                        )?)
                    }
                    InferenceStatus::Completed => None,
                    InferenceStatus::Interrupted if continuation.interrupted => None,
                    InferenceStatus::Interrupted => Some(self.account(
                        &turn,
                        OutcomeStatus::Uncertain,
                        continuation.step,
                        inference_failure_text(&step.inference),
                        None,
                        step.inference.failure.as_ref(),
                    )?),
                    InferenceStatus::Limited
                        if step.inference.failure.as_ref().is_some_and(|failure| {
                            failure.kind == FailureKind::ContextLimit
                                || host_response_limit(failure)
                        }) =>
                    {
                        Some(self.account(
                            &turn,
                            OutcomeStatus::Failed,
                            continuation.step,
                            inference_failure_text(&step.inference),
                            None,
                            step.inference.failure.as_ref(),
                        )?)
                    }
                    InferenceStatus::Limited => Some(self.account(
                        &turn,
                        OutcomeStatus::Failed,
                        continuation.step,
                        "The model reached its output limit. Ask for a shorter response.",
                        Some(StopReason::OutputLimit),
                        step.inference.failure.as_ref(),
                    )?),
                    InferenceStatus::Refused => Some(self.account(
                        &turn,
                        OutcomeStatus::Failed,
                        continuation.step,
                        "The model declined the request.",
                        Some(StopReason::Refused),
                        step.inference.failure.as_ref(),
                    )?),
                    InferenceStatus::Failed => {
                        let failure = step.inference.failure.as_ref();
                        Some(self.account(
                            &turn,
                            OutcomeStatus::Failed,
                            continuation.step,
                            inference_failure_text(&step.inference),
                            None,
                            failure,
                        )?)
                    }
                }
            };
            continuation.request = None;
            continuation.request_generation = 0;
            continuation.interrupted = false;
            continuation.outcome = outcome;
            turn.publish_continuation(
                OperationKey::new(format!("{step_key}/result"))?,
                step.history,
                encode(CONTINUATION_SCHEMA, &continuation)?,
            )
            .await?;
        }
    }

    async fn accept_input(&self, turn: &mut Turn, input: Vec<Message>) -> Result<()> {
        let view = turn.view();
        let mut additions = Vec::new();
        for message in input {
            if message.role != Role::User {
                return Err(Error::new(ErrorKind::InvalidInput, "expected_user_input"));
            }
            let existing = view.state.history().records().iter().find_map(|record| {
                let HistoryRecord::Message(existing) = record;
                (existing.id == message.id).then_some(existing)
            });
            match existing {
                Some(existing) if existing != &message => {
                    return Err(Error::new(ErrorKind::Conflict, "input_identity_reused"));
                }
                Some(_) => {}
                None => additions.push(HistoryRecord::Message(message)),
            }
        }
        if !additions.is_empty() {
            let fingerprint = Fingerprint::of(&additions)?;
            let suffix = hex(fingerprint);
            turn.append_history(OperationKey::new(format!("input/{suffix}"))?, additions)
                .await?;
        }
        Ok(())
    }

    fn continuation(&self, turn: &Turn) -> Result<Continuation> {
        let fingerprint = match (&self.completion_checks, self.input_limit) {
            (Some(execution), limit) => {
                Fingerprint::of(&(&self.config, &self.history, limit, &execution.checks))?
            }
            (None, Some(limit)) => Fingerprint::of(&(&self.config, &self.history, limit))?,
            (None, None) => Fingerprint::of(&(&self.config, &self.history))?,
        };
        let view = turn.view();
        match view.state.checkpoint() {
            None => Ok(Continuation {
                configuration: fingerprint,
                step: 0,
                request: None,
                interrupted: false,
                outcome: None,
                request_history: None,
                request_generation: 0,
                retry: None,
                effort: self.effort.clone(),
            }),
            Some(envelope) => {
                let value: Continuation = decode(CONTINUATION_SCHEMA, envelope)?;
                if value.effort != self.effort {
                    return Err(Error::new(ErrorKind::Conflict, "master_effort_changed"));
                }
                let legacy = self.completion_checks.is_none()
                    && self.input_limit.is_none()
                    && self.effort.is_none()
                    && self.history.is_empty()
                    && value.configuration == Fingerprint::of(&self.config)?;
                if value.configuration != fingerprint && !legacy {
                    return Err(Error::new(
                        ErrorKind::Conflict,
                        "master_configuration_changed",
                    ));
                }
                Ok(value)
            }
        }
    }

    async fn retire_unstarted_request(
        &self,
        turn: &mut Turn,
        continuation: &mut Continuation,
    ) -> Result<RequestRefresh> {
        let Some(request) = &continuation.request else {
            return Ok(RequestRefresh::Unchanged);
        };
        let key = continuation.step_key();
        let operation = turn.operation(&OperationKey::new(key.clone())?)?;
        if operation
            .as_ref()
            .is_some_and(|operation| !operation.attempts.is_empty())
        {
            return Ok(RequestRefresh::Unchanged);
        }
        let new_input = turn
            .view()
            .state
            .history()
            .records()
            .iter()
            .enumerate()
            .any(|(index, record)| {
                let HistoryRecord::Message(message) = record;
                message.role == Role::User
                    && match continuation.request_history {
                        Some(position) => index as u64 >= position.0,
                        None => !request.request().messages.contains(message),
                    }
            });
        let missing_limit = self
            .input_limit
            .is_some_and(|limit| request.input_limit() != Some(limit));
        if !new_input
            && !missing_limit
            && !operation.as_ref().is_some_and(paused_before_generation)
            && request.binding().authority == self.authority.inference.authority
        {
            return Ok(RequestRefresh::Unchanged);
        }
        let previous = &request.binding().authority;
        let current = &self.authority.inference.authority;
        if previous.principal != current.principal || previous.scope != current.scope {
            return Err(Error::new(
                ErrorKind::Conflict,
                "continuation_authority_changed",
            ));
        }
        let refreshed = self.provider.prepare(request.request().clone());
        if refreshed
            .as_ref()
            .is_ok_and(|refreshed| refreshed.binding().provider != request.binding().provider)
        {
            return Err(Error::new(
                ErrorKind::Conflict,
                "continuation_provider_changed",
            ));
        }
        if let Some(operation) = operation
            && operation.outcome().is_none()
        {
            turn.operations()
                .cancel_prepared(operation.record.id)
                .await?;
        }
        if let Err(error) = refreshed {
            return Ok(RequestRefresh::Rejected(error));
        }
        continuation.request = None;
        continuation.request_generation = continuation
            .request_generation
            .checked_add(1)
            .ok_or_else(|| Error::new(ErrorKind::LimitExceeded, "request_generation_overflow"))?;
        turn.checkpoint(
            OperationKey::new(format!("{key}/retired"))?,
            encode(CONTINUATION_SCHEMA, continuation)?,
        )
        .await?;
        Ok(RequestRefresh::Retired)
    }

    fn prepare(&self, view: &TurnView) -> Result<PreparedRequest> {
        let mut messages = Vec::new();
        if !self.config.instructions.is_empty() {
            messages.push(Message {
                id: MessageId::new("grida-system")?,
                role: Role::System,
                phase: None,
                content: vec![Content::Text(self.config.instructions.clone())],
                provenance: Provenance {
                    source: "product-instructions".into(),
                    kind: ProvenanceKind::Supplied,
                    fingerprint: Some(Fingerprint::of(&self.config.instructions)?),
                },
            });
        }
        if let Some(verifier) = self.goal_verifier.as_deref() {
            let evidence = goals::settlement::evidence_hints(&view.state, verifier)?;
            if !evidence.is_empty() {
                let data = serde_json::to_string(&evidence).map_err(|_| {
                    Error::new(ErrorKind::InvalidState, "goal_evidence_encoding_failed")
                })?;
                messages.push(Message {
                    id: MessageId::new("grida-goal-evidence")?,
                    role: Role::System,
                    phase: None,
                    content: vec![Content::Text(format!(
                        "Use these retained call IDs for the indicated goal criteria in goal_report: {data}"
                    ))],
                    provenance: Provenance {
                        source: "goal-evidence".into(),
                        kind: ProvenanceKind::Transformed,
                        fingerprint: Some(Fingerprint::of(&evidence)?),
                    },
                });
            }
        }
        messages.extend(self.history.iter().cloned());
        messages.extend(history::project(&view.state).into_iter().map(|record| {
            let HistoryRecord::Message(message) = record;
            message
        }));
        for content in messages.iter_mut().flat_map(|message| &mut message.content) {
            if let Content::Media(media) = content
                && let Some(display) = retained_file::display(media)
            {
                *content = Content::Text(display);
            }
        }
        let request = self.provider.prepare(InferenceRequest {
            model: self.config.model.clone(),
            messages,
            tools: self.tools.offers()?,
            max_output_tokens: self.config.max_output_tokens,
            extension: None,
        })?;
        match self.input_limit {
            Some(limit) => request.with_input_limit(limit),
            None => Ok(request),
        }
    }

    async fn retain_orphaned_work(turn: &Turn, view: &TurnView) -> Result<()> {
        let operations = turn.operations();
        for (id, operation) in view.state.operations() {
            if operation.is_running() && !view.active.contains(id) {
                operations.record_interruption(id.clone()).await?;
            }
        }
        Ok(())
    }

    async fn retire_outstanding_work(turn: &Turn) -> Result<()> {
        let view = turn.view();
        let operations = turn.operations();
        for (id, operation) in view.state.operations() {
            if operation.outcome().is_none() {
                if operation.is_running() && !view.active.contains(id) {
                    operations.record_interruption(id.clone()).await?;
                } else if !operation.is_running() {
                    operations.cancel_prepared(id.clone()).await?;
                }
            }
        }
        for (id, wait) in view.state.waits() {
            if wait.is_pending() {
                operations.withdraw_input(id.clone()).await?;
            }
        }
        Ok(())
    }

    async fn cancelled_outcome(&self, turn: &Turn, steps: u32) -> Result<TurnOutcome> {
        Self::retire_outstanding_work(turn).await?;
        self.account(
            turn,
            OutcomeStatus::Cancelled,
            steps,
            "Work was stopped.",
            None,
            None,
        )
    }

    async fn cancelled_continuation(
        &self,
        turn: &mut Turn,
        continuation: &mut Continuation,
    ) -> Result<TurnOutcome> {
        self.interrupted_continuation(
            turn,
            continuation,
            OutcomeStatus::Cancelled,
            "Work was stopped.",
        )
        .await
    }

    async fn interrupted_continuation(
        &self,
        turn: &mut Turn,
        continuation: &mut Continuation,
        status: OutcomeStatus,
        text: &str,
    ) -> Result<TurnOutcome> {
        Self::retire_outstanding_work(turn).await?;
        let mut outcome = self.account(turn, status, continuation.step, text, None, None)?;
        if continuation.request.is_some() {
            let step = continuation.step;
            let key = continuation.step_key();
            let records = turn
                .recorded_step_history(&OperationKey::new(key.clone())?)
                .await?;
            if records.is_some() {
                continuation.step = step
                    .checked_add(1)
                    .ok_or_else(|| Error::new(ErrorKind::LimitExceeded, "step_counter_overflow"))?;
                outcome = self.account(turn, status, continuation.step, text, None, None)?;
            }
            continuation.request = None;
            continuation.request_generation = 0;
            continuation.outcome = Some(outcome.clone());
            turn.publish_continuation(
                OperationKey::new(format!("{key}/result"))?,
                records.unwrap_or_default(),
                encode(CONTINUATION_SCHEMA, continuation)?,
            )
            .await?;
        }
        Ok(outcome)
    }

    fn account(
        &self,
        turn: &Turn,
        status: OutcomeStatus,
        steps: u32,
        text: &str,
        stop_reason: Option<StopReason>,
        inference_failure: Option<&InferenceFailure>,
    ) -> Result<TurnOutcome> {
        let view = turn.view();
        let evidence = view.state.operations().keys().cloned().collect();
        let unresolved = view
            .state
            .operations()
            .iter()
            .filter_map(|(id, operation)| {
                (operation.outcome().is_none() || operation.is_uncertain()).then_some(id.clone())
            })
            .collect();
        Ok(TurnOutcome {
            status,
            account: Some(encode(
                ACCOUNT_SCHEMA,
                &Account {
                    text: text.into(),
                    steps,
                    unresolved,
                    tool_activity: Some(ToolActivity::from_turn(&view)),
                    stop_reason,
                    failure: inference_failure.and_then(|failure| {
                        let kind = match failure.code.as_str() {
                            "input_measurement_unavailable" | "input_bound_unavailable" => {
                                ErrorKind::Unsupported
                            }
                            "input_token_limit" => ErrorKind::LimitExceeded,
                            _ => return None,
                        };
                        Some(Error::new(kind, &failure.code))
                    }),
                    inference_failure: inference_failure.cloned(),
                    inference_usage: usage::InferenceUsage::from_turn(&view.state)?,
                    independent_review: self
                        .effort
                        .as_ref()
                        .map(|effort| effort.review_evidence(&view.state))
                        .transpose()?
                        .flatten(),
                    goal: None,
                    completion_checks: Vec::new(),
                },
            )?),
            evidence,
        })
    }

    // A newer view can contain steering or a control that invalidates this
    // policy decision. The runtime validates the caller's captured basis.
    async fn finish(
        &self,
        turn: &mut Turn,
        continuation: &mut Continuation,
        mut outcome: TurnOutcome,
        basis: &TurnView,
    ) -> Result<Option<MasterOutcome>> {
        let may_continue = outcome.status == OutcomeStatus::Succeeded;
        if may_continue && let Some(execution) = &self.completion_checks {
            let review = execution
                .checks
                .review(
                    &turn.operations(),
                    basis,
                    &outcome,
                    &execution.tools,
                    &execution.grants,
                )
                .await?;
            match review.decision {
                hooks::Decision::Reconsider => return Ok(None),
                hooks::Decision::Deferred(_) => {
                    let view = turn.view();
                    return self.suspend(turn, continuation, &view).await;
                }
                hooks::Decision::Allow | hooks::Decision::Block => {}
            }
            let mut account = read_account(outcome.account.as_ref().expect("master account"))?;
            for check in &review.checks {
                if let Some(operation) = &check.operation {
                    if !outcome.evidence.contains(operation) {
                        outcome.evidence.push(operation.clone());
                    }
                    if check.status == hooks::CheckStatus::Uncertain
                        && !account.unresolved.contains(operation)
                    {
                        account.unresolved.push(operation.clone());
                    }
                }
            }
            if review.decision == hooks::Decision::Block {
                let uncertain = review
                    .checks
                    .iter()
                    .rev()
                    .find(|check| check.status != hooks::CheckStatus::Skipped)
                    .is_some_and(|check| check.status == hooks::CheckStatus::Uncertain);
                outcome.status = if uncertain {
                    OutcomeStatus::Uncertain
                } else {
                    OutcomeStatus::Failed
                };
                let kind = if uncertain {
                    ErrorKind::Uncertain
                } else {
                    ErrorKind::Unavailable
                };
                account.failure = Some(Error::new(kind, "completion_check_blocked"));
                account.text = if uncertain {
                    "A required completion check could not be verified. Review the recorded work before continuing."
                } else {
                    "A required completion check did not pass. Review the recorded work before continuing."
                }
                .into();
            }
            account.completion_checks = review.checks;
            outcome.account = Some(encode(ACCOUNT_SCHEMA, &account)?);
        }
        let child = match (
            &self.goal_child_work,
            goals::settlement::work_goal(&basis.state)?,
        ) {
            (Some(observer), Some(goal))
                if goal
                    .reservation()
                    .is_some_and(|work| work.child_inference_steps.is_some()) =>
            {
                Some(observer.observe(&basis.state).await)
            }
            _ => None,
        };
        let goal = goals::settlement::prepare(
            &basis.state,
            outcome.status,
            self.goal_verifier.as_deref(),
            child,
        )?;
        let state_change = match goal {
            Some((change, goal)) => {
                let mut account = read_account(outcome.account.as_ref().expect("master account"))?;
                account.goal = Some(goal);
                outcome.account = Some(encode(ACCOUNT_SCHEMA, &account)?);
                Some(change)
            }
            None => None,
        };
        let draft = CompletionDraft {
            expected_control: basis.state.controls().revision,
            expected_history: basis.state.history().position(),
            outcome,
        };
        let finished = match state_change {
            Some(change) => turn.try_finish_with_driver_state(draft, change).await?,
            None => turn.try_finish(draft).await?,
        };
        match finished {
            FinishOutcome::Settled(receipt) => Ok(Some(MasterOutcome::Settled(*receipt))),
            FinishOutcome::Continue(error) if error.kind == ErrorKind::Conflict => {
                if may_continue && has_new_input(turn, continuation)? {
                    continuation.outcome = None;
                    continuation.request = None;
                }
                Ok(None)
            }
            FinishOutcome::Continue(error) => Err(error),
        }
    }

    async fn suspend(
        &self,
        turn: &mut Turn,
        continuation: &Continuation,
        basis: &TurnView,
    ) -> Result<Option<MasterOutcome>> {
        match turn
            .try_suspend(SuspensionDraft {
                expected_control: basis.state.controls().revision,
                expected_history: basis.state.history().position(),
                checkpoint: Some(encode(CONTINUATION_SCHEMA, continuation)?),
            })
            .await?
        {
            SuspendOutcome::Suspended(receipt) => Ok(Some(MasterOutcome::Suspended(receipt))),
            SuspendOutcome::Continue(error) if error.kind == ErrorKind::Conflict => Ok(None),
            SuspendOutcome::Continue(error) => Err(error),
        }
    }
}

fn paused_before_generation(operation: &OperationState) -> bool {
    operation.attempts.is_empty()
        && matches!(&operation.rejection, Some(OperationOutcome::Inference(outcome))
            if outcome.failure.as_ref().is_some_and(|failure| failure.kind == FailureKind::Cancelled && failure.code == "turn_paused"))
}

fn has_new_input(turn: &Turn, continuation: &Continuation) -> Result<bool> {
    let view = turn.view();
    let Some(after) = continuation.request_history else {
        let previous = match continuation.step.checked_sub(1) {
            Some(step) => turn.operation(&OperationKey::new(format!("conversation/{step}"))?)?,
            None => None,
        };
        let consumed = previous.as_ref().and_then(|operation| {
            let OperationInput::Inference(request) = &operation.record.input else {
                return None;
            };
            matches!(operation.outcome(), Some(OperationOutcome::Inference(outcome))
                if outcome.status == InferenceStatus::Completed)
            .then_some(&request.request().messages)
        });
        return Ok(view.state.history().records().iter().any(|record| {
            let HistoryRecord::Message(message) = record;
            message.role == Role::User
                && consumed.is_none_or(|messages| !messages.contains(message))
        }));
    };
    Ok(view
        .state
        .history()
        .records()
        .iter()
        .enumerate()
        .any(|(index, record)| {
            let HistoryRecord::Message(message) = record;
            index as u64 >= after.0 && message.role == Role::User
        }))
}

pub fn read_account(envelope: &Envelope) -> Result<Account> {
    decode(ACCOUNT_SCHEMA, envelope)
}

fn encode<T: Serialize>(schema: &str, value: &T) -> Result<Envelope> {
    let bytes = serde_json::to_vec(value)
        .map_err(|_| Error::new(ErrorKind::InvalidInput, "invalid_master_state"))?;
    Envelope::new(SchemaId::new(schema)?, 1, bytes)
}

fn decode<T: serde::de::DeserializeOwned>(schema: &str, envelope: &Envelope) -> Result<T> {
    if envelope.schema().as_str() != schema || envelope.version() != 1 {
        return Err(Error::new(
            ErrorKind::Unsupported,
            "unsupported_master_state",
        ));
    }
    serde_json::from_slice(envelope.bytes())
        .map_err(|_| Error::new(ErrorKind::InvalidInput, "invalid_master_state"))
}

fn host_response_limit(failure: &InferenceFailure) -> bool {
    failure.kind == FailureKind::OutputLimit
        && matches!(
            failure.code.as_str(),
            "event_byte_limit" | "response_byte_limit"
        )
}

fn inference_failure_text(inference: &InferenceOutcome) -> &'static str {
    if inference.status == InferenceStatus::Interrupted {
        return "The provider did not confirm the result. Review any partial work before trying again.";
    }
    let Some(failure) = &inference.failure else {
        return "The model request failed.";
    };
    if host_response_limit(failure) {
        return "The provider response exceeded the agent's size limit. Ask for a shorter response.";
    }
    match (failure.kind, failure.code.as_str()) {
        (FailureKind::Configuration, "retained_image_unavailable") => {
            "The retained PNG is unavailable. Start a new chat and attach the original PNG again."
        }
        (FailureKind::Configuration, "retained_workspace_image_unavailable") => {
            "The captured workspace image is unavailable. Ask the agent to view the workspace image again."
        }
        (FailureKind::ContextLimit, "input_token_limit") => {
            "The request exceeds the configured input limit. Shorten the input or change the limit in settings."
        }
        (
            FailureKind::Configuration,
            "input_measurement_unavailable" | "input_bound_unavailable",
        ) => {
            "The selected model cannot verify the configured input limit. Choose another model or change the limit in settings."
        }
        (FailureKind::Configuration, "model_unavailable") => {
            "The selected model is unavailable from this provider. Choose another model or check your access."
        }
        (FailureKind::Configuration, "provider_unavailable") => {
            "The selected provider is unavailable. Check its configuration or choose another provider."
        }
        (FailureKind::Authentication, _) => {
            "The provider rejected authentication or access. Check the provider's credentials and permissions."
        }
        (FailureKind::Quota, _) => {
            "The provider's quota or billing limit blocked this turn. Check its balance or quota, or choose another provider."
        }
        (FailureKind::ContextLimit, _) => {
            "The request exceeds the selected model's context limit. Shorten the input or compact the conversation."
        }
        (FailureKind::RateLimit, _) => {
            "The provider rate limit prevented this turn from finishing. Wait before trying again."
        }
        (FailureKind::Cancelled, "deadline") => {
            "The model request reached its time limit. Try a shorter request."
        }
        _ => "The model request failed.",
    }
}

fn answer(messages: &[Message]) -> String {
    messages
        .iter()
        .filter(|message| message.role == Role::Assistant)
        .flat_map(|message| &message.content)
        .filter_map(|part| match part {
            Content::Text(text) => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn hex(fingerprint: Fingerprint) -> String {
    fingerprint
        .bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
