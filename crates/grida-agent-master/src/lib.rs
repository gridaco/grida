//! Bounded conversational policy composed over the reusable execution runtime.

pub mod configuration;

use agent_kit_core::authority::GrantSelection;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{
    FailureKind, InferenceRequest, InferenceStatus, MeasurementKind, PreparedRequest, Provider,
};
use agent_kit_core::messages::{Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role};
use agent_kit_core::tools::InventorySnapshot;
use agent_kit_core::turn::{SettlementReceipt, SuspensionReceipt, TurnOutcome};
use agent_kit_core::{
    Envelope, Error, ErrorKind, Fingerprint, MessageId, OperationId, Result, SchemaId,
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MasterConfig {
    pub model: agent_kit_core::ModelId,
    pub instructions: String,
    pub max_steps: u32,
    pub max_output_tokens: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Account {
    pub text: String,
    pub steps: u32,
    pub unresolved: Vec<OperationId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<StopReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<Error>,
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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Continuation {
    configuration: Fingerprint,
    step: u32,
    request: Option<PreparedRequest>,
    interrupted: bool,
    outcome: Option<TurnOutcome>,
}

impl Master {
    pub fn new(
        config: MasterConfig,
        provider: Arc<dyn Provider>,
        tools: InventorySnapshot,
        authority: MasterAuthority,
    ) -> Result<Self> {
        if config.max_steps == 0 || config.max_output_tokens == 0 {
            return Err(Error::new(ErrorKind::InvalidInput, "invalid_master_limits"));
        }
        Ok(Self {
            config,
            provider,
            tools,
            authority,
            history: Vec::new(),
            input_limit: None,
        })
    }

    /// Supply an immutable projection of preceding conversation turns.
    pub fn with_history(mut self, history: Vec<Message>) -> Self {
        self.history = history;
        self
    }

    /// Apply the accepted task's hard limit to the complete provider input.
    pub fn with_input_limit(mut self, limit: Option<NonZeroU64>) -> Self {
        self.input_limit = limit;
        self
    }

    pub async fn run(&self, mut turn: Turn, input: Vec<Message>) -> Result<MasterOutcome> {
        let mut continuation = self.continuation(&turn)?;
        self.accept_input(&mut turn, input).await?;
        let view = turn.view();
        let orphaned: Vec<_> = view
            .state
            .operations()
            .iter()
            .filter(|(id, operation)| operation.is_running() && !view.active.contains(id))
            .map(|(id, _)| id.clone())
            .collect();
        for operation in orphaned {
            turn.operations().record_interruption(operation).await?;
        }
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
                continuation.interrupted = true;
                match self.suspend(&mut turn, &continuation, &view).await? {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            if let Some(outcome) = continuation.outcome.clone() {
                match self
                    .finish(&mut turn, &mut continuation, outcome, &view)
                    .await?
                {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            if continuation.step >= self.config.max_steps {
                let outcome = self.account(
                    &turn,
                    OutcomeStatus::Failed,
                    continuation.step,
                    "The configured step limit was reached.",
                    Some(StopReason::StepLimit),
                )?;
                match self
                    .finish(&mut turn, &mut continuation, outcome, &view)
                    .await?
                {
                    Some(outcome) => return Ok(outcome),
                    None => continue,
                }
            }
            let request = match &continuation.request {
                Some(request) => request.clone(),
                None => {
                    let request = match self.prepare(&turn) {
                        Ok(request) => request,
                        Err(error) => {
                            let mut outcome = self.account(
                                &turn,
                                OutcomeStatus::Failed,
                                continuation.step,
                                "The model input could not be prepared with the selected configuration.",
                                None,
                            )?;
                            let mut account =
                                read_account(outcome.account.as_ref().expect("master account"))?;
                            account.failure = Some(error);
                            outcome.account = Some(encode(ACCOUNT_SCHEMA, &account)?);
                            continuation.outcome = Some(outcome);
                            turn.checkpoint(
                                OperationKey::new(format!(
                                    "conversation/{}/input-rejected",
                                    continuation.step
                                ))?,
                                encode(CONTINUATION_SCHEMA, &continuation)?,
                            )
                            .await?;
                            continue;
                        }
                    };
                    continuation.request = Some(request.clone());
                    turn.checkpoint(
                        OperationKey::new(format!("conversation/{}/request", continuation.step))?,
                        encode(CONTINUATION_SCHEMA, &continuation)?,
                    )
                    .await?;
                    request
                }
            };
            let step = turn
                .step(StepPlan {
                    key: OperationKey::new(format!("conversation/{}", continuation.step))?,
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
                    return Err(error);
                }
            };
            if step
                .tools
                .iter()
                .any(|tool| matches!(tool.outcome, InvokeOutcome::Deferred(_)))
            {
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
            continuation.step += 1;
            let uncertain = step.tools.iter().any(|tool| {
                matches!(&tool.outcome,
                InvokeOutcome::Complete(outcome) if outcome.status == OutcomeStatus::Uncertain)
            });
            let interrupted_by_pause = step.inference.failure.as_ref().is_some_and(|failure| {
                failure.kind == FailureKind::Cancelled && failure.code == "turn_paused"
            });
            let outcome = if current.state.controls().cancelled {
                Some(self.cancelled_outcome(&turn, continuation.step).await?)
            } else if uncertain {
                Some(self.account(
                    &turn,
                    OutcomeStatus::Uncertain,
                    continuation.step,
                    "An operation has an unconfirmed outcome.",
                    None,
                )?)
            } else if interrupted_by_pause {
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
                        )?)
                    }
                    InferenceStatus::Completed => None,
                    InferenceStatus::Interrupted if continuation.interrupted => None,
                    InferenceStatus::Interrupted => Some(self.account(
                        &turn,
                        OutcomeStatus::Uncertain,
                        continuation.step,
                        "The model response was interrupted.",
                        None,
                    )?),
                    InferenceStatus::Limited => Some(self.account(
                        &turn,
                        OutcomeStatus::Failed,
                        continuation.step,
                        "The model reached its output limit.",
                        Some(StopReason::OutputLimit),
                    )?),
                    InferenceStatus::Refused => Some(self.account(
                        &turn,
                        OutcomeStatus::Failed,
                        continuation.step,
                        "The model declined the request.",
                        Some(StopReason::Refused),
                    )?),
                    InferenceStatus::Failed => Some(self.account(
                        &turn,
                        OutcomeStatus::Failed,
                        continuation.step,
                        "The model request failed.",
                        None,
                    )?),
                }
            };
            continuation.request = None;
            continuation.interrupted = false;
            continuation.outcome = outcome;
            turn.publish_continuation(
                OperationKey::new(format!("conversation/{}/result", continuation.step - 1))?,
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
        let fingerprint = match self.input_limit {
            Some(limit) => Fingerprint::of(&(&self.config, &self.history, limit))?,
            None => Fingerprint::of(&(&self.config, &self.history))?,
        };
        let view = turn.view();
        match view.state.checkpoint() {
            None => Ok(Continuation {
                configuration: fingerprint,
                step: 0,
                request: None,
                interrupted: false,
                outcome: None,
            }),
            Some(envelope) => {
                let value: Continuation = decode(CONTINUATION_SCHEMA, envelope)?;
                let legacy = self.input_limit.is_none()
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

    fn prepare(&self, turn: &Turn) -> Result<PreparedRequest> {
        let view = turn.view();
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
        messages.extend(self.history.iter().cloned());
        messages.extend(view.state.history().records().iter().map(|record| {
            let HistoryRecord::Message(message) = record;
            message.clone()
        }));
        let request = self.provider.prepare(InferenceRequest {
            model: self.config.model.clone(),
            messages,
            tools: self.tools.offers()?,
            max_output_tokens: Some(self.config.max_output_tokens),
            extension: None,
        })?;
        if let Some(limit) = self.input_limit {
            let measurement = self.provider.measure_input(&request)?;
            if measurement.kind == MeasurementKind::Estimate {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "input_bound_unavailable",
                ));
            }
            if measurement.tokens > limit.get() {
                return Err(Error::new(ErrorKind::LimitExceeded, "input_token_limit"));
            }
        }
        Ok(request)
    }

    async fn cancelled_outcome(&self, turn: &Turn, steps: u32) -> Result<TurnOutcome> {
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
        self.account(
            turn,
            OutcomeStatus::Cancelled,
            steps,
            "Work was stopped.",
            None,
        )
    }

    async fn cancelled_continuation(
        &self,
        turn: &mut Turn,
        continuation: &mut Continuation,
    ) -> Result<TurnOutcome> {
        let mut outcome = self.cancelled_outcome(turn, continuation.step).await?;
        if continuation.request.is_some() {
            let step = continuation.step;
            let records = turn
                .recorded_step_history(&OperationKey::new(format!("conversation/{step}"))?)
                .await?;
            if records.is_some() {
                continuation.step = step
                    .checked_add(1)
                    .ok_or_else(|| Error::new(ErrorKind::LimitExceeded, "step_counter_overflow"))?;
                outcome = self.account(
                    turn,
                    OutcomeStatus::Cancelled,
                    continuation.step,
                    "Work was stopped.",
                    None,
                )?;
            }
            continuation.request = None;
            continuation.outcome = Some(outcome.clone());
            turn.publish_continuation(
                OperationKey::new(format!("conversation/{step}/result"))?,
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
                    stop_reason,
                    failure: None,
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
        outcome: TurnOutcome,
        basis: &TurnView,
    ) -> Result<Option<MasterOutcome>> {
        match turn
            .try_finish(CompletionDraft {
                expected_control: basis.state.controls().revision,
                expected_history: basis.state.history().position(),
                outcome,
            })
            .await?
        {
            FinishOutcome::Settled(receipt) => Ok(Some(MasterOutcome::Settled(*receipt))),
            FinishOutcome::Continue(error) if error.kind == ErrorKind::Conflict => {
                if turn.view().state.history().position() != basis.state.history().position() {
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
