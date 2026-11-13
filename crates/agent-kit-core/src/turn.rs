use crate::authority::GrantSelection;
use crate::driver_state::{DriverStateChange, DriverStateRevision, DriverStateSnapshot};
use crate::history::{History, HistoryRecord};
use crate::inference::{InferenceOutcome, PreparedRequest};
use crate::messages::OutcomeStatus;
use crate::tools::{Invocation, ToolOutcome};
use crate::{
    AttemptId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, OperationId, Result,
    SchemaId, SessionId, ToolCallId, TurnId, WaitId,
};
use futures_channel::oneshot;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnBinding {
    pub session: SessionId,
    pub turn: TurnId,
    pub epoch: u64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct JournalPosition(pub u64);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ControlRevision(pub u64);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ControlSnapshot {
    pub binding: TurnBinding,
    pub revision: ControlRevision,
    pub paused: bool,
    pub cancelled: bool,
    #[serde(default)]
    pub interruption: Option<ControlInterruption>,
}

/// The latest admission-closing control, retained even after resumption.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ControlInterruption {
    pub revision: ControlRevision,
    pub reason: InterruptionReason,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptionReason {
    Pause,
    Cancel,
}

impl ControlSnapshot {
    pub fn admits_work(&self) -> bool {
        !self.paused && !self.cancelled
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum OperationInput {
    Inference(PreparedRequest),
    Tool(Invocation),
}

impl OperationInput {
    pub fn fingerprint(&self) -> Fingerprint {
        match self {
            Self::Inference(request) => request.fingerprint(),
            Self::Tool(invocation) => invocation.fingerprint(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OperationRecord {
    pub id: OperationId,
    pub input: OperationInput,
    #[serde(default)]
    pub origin: Option<OperationId>,
    #[serde(default)]
    pub source_call: Option<ToolCallId>,
    pub grants: GrantSelection,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum OperationOutcome {
    Inference(InferenceOutcome),
    Tool(ToolOutcome),
}

impl OperationOutcome {
    /// Whether the effect of the work is unknown: an interrupted inference or
    /// an uncertain tool outcome. An uncertain attempt admits no new attempt
    /// of the same operation until a `ReconcileAttempt` records what happened.
    pub fn is_uncertain(&self) -> bool {
        match self {
            Self::Inference(outcome) => {
                outcome.status == crate::inference::InferenceStatus::Interrupted
            }
            Self::Tool(outcome) => outcome.status == OutcomeStatus::Uncertain,
        }
    }
    /// Whether the work completed as requested.
    pub fn is_success(&self) -> bool {
        match self {
            Self::Inference(outcome) => {
                outcome.status == crate::inference::InferenceStatus::Completed
            }
            Self::Tool(outcome) => outcome.status == OutcomeStatus::Succeeded,
        }
    }

    fn can_reject_prepared(&self) -> bool {
        match self {
            Self::Tool(result) => matches!(
                result.status,
                OutcomeStatus::Failed | OutcomeStatus::Cancelled
            ),
            Self::Inference(result) => result.status == crate::inference::InferenceStatus::Failed,
        }
    }
    fn matches(&self, input: &OperationInput) -> bool {
        matches!(
            (self, input),
            (Self::Inference(_), OperationInput::Inference(_))
                | (Self::Tool(_), OperationInput::Tool(_))
        )
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AttemptRecord {
    pub id: AttemptId,
    pub outcome: Option<OperationOutcome>,
    #[serde(default)]
    pub prior_outcomes: Vec<OperationOutcome>,
}

/// One admitted operation and its physical attempts, oldest first. A
/// prepared operation either gains attempts or is rejected before dispatch,
/// never both.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OperationState {
    pub record: OperationRecord,
    pub attempts: Vec<AttemptRecord>,
    /// The outcome recorded when the operation was refused before any attempt.
    #[serde(default)]
    pub rejection: Option<OperationOutcome>,
}

impl OperationState {
    /// Whether the latest attempt has started and has no outcome yet.
    pub fn is_running(&self) -> bool {
        self.attempts
            .last()
            .is_some_and(|attempt| attempt.outcome.is_none())
    }
    /// Whether the current outcome is uncertain and requires reconciliation.
    pub fn is_uncertain(&self) -> bool {
        self.outcome().is_some_and(OperationOutcome::is_uncertain)
    }
    /// The rejection, or else the latest attempt's outcome.
    pub fn outcome(&self) -> Option<&OperationOutcome> {
        self.rejection.as_ref().or_else(|| {
            self.attempts
                .last()
                .and_then(|attempt| attempt.outcome.as_ref())
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResponseContract {
    pub schema: SchemaId,
    pub version: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WaitRecord {
    pub id: WaitId,
    pub request: Envelope,
    pub response: ResponseContract,
    pub answer: Option<Envelope>,
    pub withdrawn: bool,
}

impl WaitRecord {
    pub fn is_pending(&self) -> bool {
        self.answer.is_none() && !self.withdrawn
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ControlDirective {
    Pause,
    Resume,
    Cancel,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TurnOutcome {
    pub status: OutcomeStatus,
    pub account: Option<Envelope>,
    pub evidence: Vec<OperationId>,
}

/// One step of a journal change. A change applies all of its actions or none.
/// Admission-gated actions fail with `admission_closed` while the turn is
/// paused, cancelled, suspended or settled. A settled turn accepts only
/// `ReconcileAttempt`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum JournalAction {
    /// Admit a new operation before any effect. Admission-gated.
    Prepare(Box<OperationRecord>),
    /// Begin a physical attempt of a prepared operation. Admission-gated; the
    /// previous attempt must have ended and must be neither successful nor
    /// uncertain.
    StartAttempt {
        operation: OperationId,
        attempt: AttemptId,
    },
    /// Refuse a prepared operation that never started, with a failed or
    /// cancelled outcome.
    RejectPrepared {
        operation: OperationId,
        outcome: OperationOutcome,
    },
    /// Record the outcome of the running attempt.
    CompleteAttempt {
        operation: OperationId,
        attempt: AttemptId,
        outcome: OperationOutcome,
    },
    /// Replace an uncertain outcome with reconciled evidence, retaining the
    /// previous outcome in the attempt's `prior_outcomes`.
    ReconcileAttempt {
        operation: OperationId,
        attempt: AttemptId,
        outcome: OperationOutcome,
    },
    /// Append validated records to the turn's history.
    AppendHistory(Vec<HistoryRecord>),
    /// Open a pending interaction. Admission-gated; advances the control revision.
    OpenWait(WaitRecord),
    /// Answer a pending interaction with its declared response contract.
    /// Advances the control revision.
    ResolveWait { wait: WaitId, answer: Envelope },
    /// Withdraw a pending interaction. Advances the control revision.
    WithdrawWait(WaitId),
    /// Replace the driver's opaque checkpoint for this turn.
    SetCheckpoint(Envelope),
    /// Conditionally replace the session's driver state. At most one per change.
    SetDriverState(DriverStateChange),
    /// Pause, resume or cancel. Advances the control revision; cancellation
    /// is final.
    Control(ControlDirective),
    /// Close admission until `TurnState::rebind` moves the turn to a new
    /// writer epoch. Requires that no attempt is running.
    Suspend,
    /// Settle the turn. Every operation must have an outcome and no wait may
    /// be pending.
    Settle(TurnOutcome),
}

impl JournalAction {
    pub fn prepare(record: OperationRecord) -> Self {
        Self::Prepare(Box::new(record))
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct JournalChange {
    id: ChangeId,
    binding: TurnBinding,
    expected: JournalPosition,
    control: ControlRevision,
    actions: Vec<JournalAction>,
    fingerprint: Fingerprint,
    content_fingerprint: Fingerprint,
}

impl JournalChange {
    pub fn new(
        id: ChangeId,
        binding: TurnBinding,
        expected: JournalPosition,
        control: ControlRevision,
        actions: Vec<JournalAction>,
    ) -> Result<Self> {
        if binding.epoch == 0 || actions.is_empty() {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_journal_change",
            ));
        }
        let fingerprint = Fingerprint::of(&(&binding, expected, control, &actions))?;
        let content_fingerprint = Fingerprint::of(&actions)?;
        Ok(Self {
            id,
            binding,
            expected,
            control,
            actions,
            fingerprint,
            content_fingerprint,
        })
    }
    pub fn id(&self) -> &ChangeId {
        &self.id
    }
    pub fn binding(&self) -> &TurnBinding {
        &self.binding
    }
    pub fn expected(&self) -> JournalPosition {
        self.expected
    }
    pub fn control_revision(&self) -> ControlRevision {
        self.control
    }
    pub fn actions(&self) -> &[JournalAction] {
        &self.actions
    }
    pub fn fingerprint(&self) -> Fingerprint {
        self.fingerprint
    }
    pub fn content_fingerprint(&self) -> Fingerprint {
        self.content_fingerprint
    }
}

impl<'de> Deserialize<'de> for JournalChange {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Data {
            id: ChangeId,
            binding: TurnBinding,
            expected: JournalPosition,
            control: ControlRevision,
            actions: Vec<JournalAction>,
            fingerprint: Fingerprint,
            content_fingerprint: Fingerprint,
        }
        let data = Data::deserialize(deserializer)?;
        let value = Self::new(
            data.id,
            data.binding,
            data.expected,
            data.control,
            data.actions,
        )
        .map_err(serde::de::Error::custom)?;
        if value.fingerprint != data.fingerprint
            || value.content_fingerprint != data.content_fingerprint
        {
            return Err(serde::de::Error::custom("journal fingerprint mismatch"));
        }
        Ok(value)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordedPosition {
    pub change: ChangeId,
    pub binding: TurnBinding,
    pub position: JournalPosition,
    pub fingerprint: Fingerprint,
    pub content_fingerprint: Fingerprint,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub driver_state_revision: Option<DriverStateRevision>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SettlementReceipt {
    pub record: RecordedPosition,
    pub outcome: TurnOutcome,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SuspensionReceipt {
    pub record: RecordedPosition,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum CommitReceipt {
    Recorded(RecordedPosition),
    Suspended(SuspensionReceipt),
    Settled(SettlementReceipt),
}

impl CommitReceipt {
    pub fn record(&self) -> &RecordedPosition {
        match self {
            Self::Recorded(record) => record,
            Self::Suspended(receipt) => &receipt.record,
            Self::Settled(receipt) => &receipt.record,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct TurnState {
    binding: TurnBinding,
    position: JournalPosition,
    controls: ControlSnapshot,
    history: History,
    operations: BTreeMap<OperationId, OperationState>,
    waits: BTreeMap<WaitId, WaitRecord>,
    checkpoint: Option<Envelope>,
    #[serde(skip_serializing_if = "DriverStateSnapshot::is_initial")]
    driver_state: DriverStateSnapshot,
    suspended: bool,
    outcome: Option<TurnOutcome>,
    receipts: BTreeMap<ChangeId, CommitReceipt>,
}

impl TurnState {
    pub fn new(binding: TurnBinding) -> Result<Self> {
        Self::with_driver_state(binding, DriverStateSnapshot::default())
    }

    pub fn with_driver_state(
        binding: TurnBinding,
        driver_state: DriverStateSnapshot,
    ) -> Result<Self> {
        if binding.epoch == 0 {
            return Err(Error::new(ErrorKind::InvalidInput, "invalid_writer_epoch"));
        }
        Ok(Self {
            controls: ControlSnapshot {
                binding: binding.clone(),
                revision: ControlRevision(0),
                paused: false,
                cancelled: false,
                interruption: None,
            },
            binding,
            position: JournalPosition(0),
            history: History::new(),
            operations: BTreeMap::new(),
            waits: BTreeMap::new(),
            checkpoint: None,
            driver_state,
            suspended: false,
            outcome: None,
            receipts: BTreeMap::new(),
        })
    }
    pub fn binding(&self) -> &TurnBinding {
        &self.binding
    }
    pub fn position(&self) -> JournalPosition {
        self.position
    }
    pub fn controls(&self) -> &ControlSnapshot {
        &self.controls
    }
    pub fn history(&self) -> &History {
        &self.history
    }
    pub fn operations(&self) -> &BTreeMap<OperationId, OperationState> {
        &self.operations
    }
    pub fn waits(&self) -> &BTreeMap<WaitId, WaitRecord> {
        &self.waits
    }
    pub fn checkpoint(&self) -> Option<&Envelope> {
        self.checkpoint.as_ref()
    }
    pub fn driver_state(&self) -> &DriverStateSnapshot {
        &self.driver_state
    }
    pub fn outcome(&self) -> Option<&TurnOutcome> {
        self.outcome.as_ref()
    }
    pub fn is_suspended(&self) -> bool {
        self.suspended
    }
    /// Every recorded commit receipt, by change.
    pub fn receipts(&self) -> &BTreeMap<ChangeId, CommitReceipt> {
        &self.receipts
    }
    pub fn receipt(&self, id: &ChangeId) -> Option<&CommitReceipt> {
        self.receipts.get(id)
    }

    pub fn validate(&self) -> Result<()> {
        if self.binding.epoch == 0 || self.controls.binding != self.binding {
            return Err(Error::new(ErrorKind::InvalidState, "invalid_turn_binding"));
        }
        if self.controls.interruption.is_some_and(|interruption| {
            interruption.revision.0 == 0
                || interruption.revision > self.controls.revision
                || (interruption.reason == InterruptionReason::Cancel) != self.controls.cancelled
        }) {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "invalid_control_interruption",
            ));
        }
        self.history.validate()?;
        let mut attempts = std::collections::BTreeSet::new();
        for (id, state) in &self.operations {
            self.validate_source_call(&state.record)?;
            if state
                .record
                .origin
                .as_ref()
                .is_some_and(|origin| origin == id || !self.operations.contains_key(origin))
            {
                return Err(Error::new(
                    ErrorKind::InvalidState,
                    "invalid_operation_origin",
                ));
            }
            let mut ancestors = std::collections::BTreeSet::new();
            let mut origin = state.record.origin.as_ref();
            while let Some(parent) = origin {
                if !ancestors.insert(parent) {
                    return Err(Error::new(
                        ErrorKind::InvalidState,
                        "cyclic_operation_origin",
                    ));
                }
                origin = self
                    .operations
                    .get(parent)
                    .and_then(|state| state.record.origin.as_ref());
            }
            if state.rejection.as_ref().is_some_and(|outcome| {
                !outcome.matches(&state.record.input) || !outcome.can_reject_prepared()
            }) {
                return Err(Error::new(
                    ErrorKind::InvalidState,
                    "invalid_prepared_rejection",
                ));
            }
            if id != &state.record.id {
                return Err(Error::new(
                    ErrorKind::InvalidState,
                    "invalid_operation_identity",
                ));
            }
            if state.rejection.is_some() && !state.attempts.is_empty() {
                return Err(Error::new(
                    ErrorKind::InvalidState,
                    "invalid_rejected_operation",
                ));
            }
            for (index, attempt) in state.attempts.iter().enumerate() {
                if attempt
                    .prior_outcomes
                    .iter()
                    .any(|outcome| !outcome.matches(&state.record.input) || !outcome.is_uncertain())
                {
                    return Err(Error::new(
                        ErrorKind::InvalidState,
                        "invalid_reconciliation_history",
                    ));
                }
                if !attempts.insert(&attempt.id)
                    || (attempt.outcome.is_none() && index + 1 != state.attempts.len())
                    || attempt
                        .outcome
                        .as_ref()
                        .is_some_and(|outcome| !outcome.matches(&state.record.input))
                {
                    return Err(Error::new(
                        ErrorKind::InvalidState,
                        "invalid_attempt_history",
                    ));
                }
            }
        }
        for (id, wait) in &self.waits {
            if id != &wait.id
                || wait.response.version == 0
                || (wait.withdrawn && wait.answer.is_some())
                || wait.answer.as_ref().is_some_and(|answer| {
                    answer.schema() != &wait.response.schema
                        || answer.version() != wait.response.version
                })
            {
                return Err(Error::new(ErrorKind::InvalidState, "invalid_wait_state"));
            }
        }
        let positions: std::collections::BTreeSet<_> = self
            .receipts
            .values()
            .map(|receipt| receipt.record().position.0)
            .collect();
        if self.receipts.len() as u64 != self.position.0
            || positions.len() != self.receipts.len()
            || positions
                .iter()
                .enumerate()
                .any(|(index, position)| *position != index as u64 + 1)
        {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "invalid_journal_positions",
            ));
        }
        let settlements: Vec<_> = self
            .receipts
            .values()
            .filter_map(|receipt| match receipt {
                CommitReceipt::Settled(receipt) => Some(receipt),
                _ => None,
            })
            .collect();
        match (&self.outcome, settlements.as_slice()) {
            (Some(outcome), [receipt]) if outcome == &receipt.outcome => {}
            (Some(_), _) => {
                return Err(Error::new(
                    ErrorKind::InvalidState,
                    "invalid_settlement_receipt",
                ));
            }
            (None, []) => {}
            (None, _) => {
                return Err(Error::new(
                    ErrorKind::InvalidState,
                    "unexpected_settlement_receipt",
                ));
            }
        }
        for (id, receipt) in &self.receipts {
            let record = receipt.record();
            if id != &record.change
                || record.position.0 == 0
                || record.position > self.position
                || record.binding.session != self.binding.session
                || record.binding.turn != self.binding.turn
                || record.binding.epoch > self.binding.epoch
            {
                return Err(Error::new(
                    ErrorKind::InvalidState,
                    "invalid_commit_receipt",
                ));
            }
        }
        if self.outcome.is_some()
            && (self
                .operations
                .values()
                .any(|state| state.outcome().is_none())
                || self.waits.values().any(WaitRecord::is_pending))
        {
            return Err(Error::new(ErrorKind::InvalidState, "invalid_settled_state"));
        }
        Ok(())
    }

    /// Storage calls this only after establishing exclusive ownership of the new epoch.
    pub fn rebind(&mut self, binding: TurnBinding) -> Result<()> {
        if binding.session != self.binding.session
            || binding.turn != self.binding.turn
            || binding.epoch <= self.binding.epoch
            || self.outcome.is_some()
        {
            return Err(Error::new(ErrorKind::Conflict, "invalid_writer_transition"));
        }
        self.binding = binding.clone();
        self.controls.binding = binding;
        self.suspended = false;
        Ok(())
    }

    /// Validate a complete transition before publishing any of its changes.
    pub fn apply(&mut self, change: JournalChange) -> Result<CommitReceipt> {
        if let Some(receipt) = self.receipts.get(&change.id) {
            return if receipt.record().fingerprint == change.fingerprint {
                Ok(receipt.clone())
            } else {
                Err(Error::new(ErrorKind::Conflict, "change_identity_reused"))
            };
        }
        if change.binding != self.binding
            || change.expected != self.position
            || change.control != self.controls.revision
        {
            return Err(Error::new(ErrorKind::Conflict, "stale_journal_change"));
        }
        let settles = change
            .actions
            .iter()
            .filter(|action| matches!(action, JournalAction::Settle(_)))
            .count();
        let suspends = change
            .actions
            .iter()
            .filter(|action| matches!(action, JournalAction::Suspend))
            .count();
        if settles + suspends > 1 {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "multiple_lifecycle_transitions",
            ));
        }
        if change
            .actions
            .iter()
            .filter(|action| matches!(action, JournalAction::SetDriverState(_)))
            .take(2)
            .count()
            > 1
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "multiple_driver_state_changes",
            ));
        }
        let mut next = self.clone();
        for action in change.actions {
            next.apply_action(action)?;
        }
        next.position =
            JournalPosition(self.position.0.checked_add(1).ok_or_else(|| {
                Error::new(ErrorKind::LimitExceeded, "journal_position_overflow")
            })?);
        let record = RecordedPosition {
            change: change.id.clone(),
            binding: next.binding.clone(),
            position: next.position,
            fingerprint: change.fingerprint,
            content_fingerprint: change.content_fingerprint,
            driver_state_revision: (next.driver_state.revision() != self.driver_state.revision())
                .then_some(next.driver_state.revision()),
        };
        let receipt = if settles == 1 {
            CommitReceipt::Settled(SettlementReceipt {
                record,
                outcome: next
                    .outcome
                    .clone()
                    .expect("settlement action records its outcome"),
            })
        } else if suspends == 1 {
            CommitReceipt::Suspended(SuspensionReceipt { record })
        } else {
            CommitReceipt::Recorded(record)
        };
        next.receipts.insert(change.id, receipt.clone());
        *self = next;
        Ok(receipt)
    }

    fn validate_source_call(&self, record: &OperationRecord) -> Result<()> {
        let Some(call) = &record.source_call else {
            return Ok(());
        };
        let origin = record
            .origin
            .as_ref()
            .and_then(|id| self.operations.get(id));
        if !matches!(record.input, OperationInput::Tool(_))
            || !origin
                .is_some_and(|origin| matches!(origin.record.input, OperationInput::Inference(_)))
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_source_call_origin",
            ));
        }
        if self.operations.values().any(|other| {
            other.record.id != record.id
                && other.record.origin == record.origin
                && other.record.source_call.as_ref() == Some(call)
        }) {
            return Err(Error::new(
                ErrorKind::Conflict,
                "source_call_already_recorded",
            ));
        }
        Ok(())
    }

    fn admits_work(&self) -> Result<()> {
        if !self.controls.admits_work() || self.suspended || self.outcome.is_some() {
            return Err(Error::new(ErrorKind::InvalidState, "admission_closed"));
        }
        Ok(())
    }

    fn bump_control(&mut self) -> Result<()> {
        self.controls.revision.0 = self
            .controls
            .revision
            .0
            .checked_add(1)
            .ok_or_else(|| Error::new(ErrorKind::LimitExceeded, "control_revision_overflow"))?;
        Ok(())
    }

    fn apply_action(&mut self, action: JournalAction) -> Result<()> {
        if self.outcome.is_some() && !matches!(action, JournalAction::ReconcileAttempt { .. }) {
            return Err(Error::new(ErrorKind::InvalidState, "turn_settled"));
        }
        match action {
            JournalAction::Prepare(record) => {
                self.admits_work()?;
                let record = *record;
                self.validate_source_call(&record)?;
                if record.origin.as_ref().is_some_and(|origin| {
                    origin == &record.id || !self.operations.contains_key(origin)
                }) {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "invalid_operation_origin",
                    ));
                }
                if let OperationInput::Inference(request) = &record.input
                    && request.binding().authority != record.grants.authority
                {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "inference_authority_mismatch",
                    ));
                }
                if self.operations.contains_key(&record.id) {
                    return Err(Error::new(ErrorKind::Conflict, "operation_exists"));
                }
                if let OperationInput::Tool(invocation) = &record.input
                    && invocation.id() != &record.id
                {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "invocation_identity_mismatch",
                    ));
                }
                self.operations.insert(
                    record.id.clone(),
                    OperationState {
                        record,
                        attempts: vec![],
                        rejection: None,
                    },
                );
            }
            JournalAction::StartAttempt { operation, attempt } => {
                self.admits_work()?;
                if self
                    .operations
                    .values()
                    .any(|state| state.attempts.iter().any(|old| old.id == attempt))
                {
                    return Err(Error::new(ErrorKind::Conflict, "attempt_exists"));
                }
                let state = self
                    .operations
                    .get_mut(&operation)
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "operation_missing"))?;
                if state.rejection.is_some() {
                    return Err(Error::new(ErrorKind::InvalidState, "operation_rejected"));
                }
                if state.is_running() {
                    return Err(Error::new(ErrorKind::InvalidState, "attempt_running"));
                }
                if state
                    .outcome()
                    .is_some_and(|outcome| outcome.is_success() || outcome.is_uncertain())
                {
                    return Err(Error::new(
                        ErrorKind::InvalidState,
                        "operation_requires_new_identity_or_reconciliation",
                    ));
                }
                state.attempts.push(AttemptRecord {
                    id: attempt,
                    outcome: None,
                    prior_outcomes: vec![],
                });
            }
            JournalAction::RejectPrepared { operation, outcome } => {
                let state = self
                    .operations
                    .get_mut(&operation)
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "operation_missing"))?;
                if !state.attempts.is_empty()
                    || state.rejection.is_some()
                    || !outcome.matches(&state.record.input)
                    || !outcome.can_reject_prepared()
                {
                    return Err(Error::new(
                        ErrorKind::InvalidState,
                        "invalid_prepared_rejection",
                    ));
                }
                state.rejection = Some(outcome);
            }
            JournalAction::CompleteAttempt {
                operation,
                attempt,
                outcome,
            } => {
                let state = self
                    .operations
                    .get_mut(&operation)
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "operation_missing"))?;
                if !outcome.matches(&state.record.input) {
                    return Err(Error::new(ErrorKind::InvalidInput, "outcome_kind_mismatch"));
                }
                let active = state
                    .attempts
                    .last_mut()
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "attempt_missing"))?;
                if active.id != attempt || active.outcome.is_some() {
                    return Err(Error::new(ErrorKind::Conflict, "attempt_outcome_conflict"));
                }
                active.outcome = Some(outcome);
            }
            JournalAction::ReconcileAttempt {
                operation,
                attempt,
                outcome,
            } => {
                let state = self
                    .operations
                    .get_mut(&operation)
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "operation_missing"))?;
                if !outcome.matches(&state.record.input) {
                    return Err(Error::new(ErrorKind::InvalidInput, "outcome_kind_mismatch"));
                }
                let active = state
                    .attempts
                    .last_mut()
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "attempt_missing"))?;
                if active.id != attempt
                    || !active
                        .outcome
                        .as_ref()
                        .is_some_and(OperationOutcome::is_uncertain)
                {
                    return Err(Error::new(ErrorKind::Conflict, "attempt_not_uncertain"));
                }
                if let Some(previous) = active.outcome.replace(outcome) {
                    active.prior_outcomes.push(previous);
                }
            }
            JournalAction::AppendHistory(records) => {
                self.history.append(self.history.position(), &records)?;
            }
            JournalAction::OpenWait(wait) => {
                self.admits_work()?;
                if wait.response.version == 0
                    || !wait.is_pending()
                    || self.waits.contains_key(&wait.id)
                {
                    return Err(Error::new(ErrorKind::InvalidInput, "invalid_wait"));
                }
                self.waits.insert(wait.id.clone(), wait);
                self.bump_control()?;
            }
            JournalAction::ResolveWait { wait, answer } => {
                let record = self
                    .waits
                    .get_mut(&wait)
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "wait_missing"))?;
                if !record.is_pending()
                    || answer.schema() != &record.response.schema
                    || answer.version() != record.response.version
                {
                    return Err(Error::new(ErrorKind::Conflict, "wait_response_mismatch"));
                }
                record.answer = Some(answer);
                self.bump_control()?;
            }
            JournalAction::WithdrawWait(wait) => {
                let record = self
                    .waits
                    .get_mut(&wait)
                    .ok_or_else(|| Error::new(ErrorKind::InvalidState, "wait_missing"))?;
                if !record.is_pending() {
                    return Err(Error::new(ErrorKind::Conflict, "wait_already_resolved"));
                }
                record.withdrawn = true;
                self.bump_control()?;
            }
            JournalAction::SetCheckpoint(checkpoint) => {
                self.checkpoint = Some(checkpoint);
            }
            JournalAction::SetDriverState(change) => self.driver_state.apply(change)?,
            JournalAction::Control(directive) => {
                let interruption = match directive {
                    ControlDirective::Pause if !self.controls.cancelled => {
                        self.controls.paused = true;
                        Some(InterruptionReason::Pause)
                    }
                    ControlDirective::Resume if !self.controls.cancelled => {
                        self.controls.paused = false;
                        None
                    }
                    ControlDirective::Pause | ControlDirective::Resume => {
                        return Err(Error::new(ErrorKind::InvalidState, "turn_cancelled"));
                    }
                    ControlDirective::Cancel => {
                        self.controls.cancelled = true;
                        Some(InterruptionReason::Cancel)
                    }
                };
                self.bump_control()?;
                if let Some(reason) = interruption {
                    self.controls.interruption = Some(ControlInterruption {
                        revision: self.controls.revision,
                        reason,
                    });
                }
            }
            JournalAction::Suspend => {
                if self.operations.values().any(OperationState::is_running) {
                    return Err(Error::new(ErrorKind::InvalidState, "work_still_running"));
                }
                self.suspended = true;
            }
            JournalAction::Settle(outcome) => {
                if self
                    .operations
                    .values()
                    .any(|state| state.outcome().is_none())
                    || self.waits.values().any(WaitRecord::is_pending)
                {
                    return Err(Error::new(ErrorKind::InvalidState, "work_unsettled"));
                }
                if outcome
                    .evidence
                    .iter()
                    .any(|id| !self.operations.contains_key(id))
                {
                    return Err(Error::new(ErrorKind::InvalidInput, "evidence_missing"));
                }
                self.suspended = false;
                self.outcome = Some(outcome);
            }
        }
        Ok(())
    }
}

impl<'de> Deserialize<'de> for TurnState {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Data {
            binding: TurnBinding,
            position: JournalPosition,
            controls: ControlSnapshot,
            history: History,
            operations: BTreeMap<OperationId, OperationState>,
            waits: BTreeMap<WaitId, WaitRecord>,
            checkpoint: Option<Envelope>,
            #[serde(default)]
            driver_state: DriverStateSnapshot,
            suspended: bool,
            outcome: Option<TurnOutcome>,
            receipts: BTreeMap<ChangeId, CommitReceipt>,
        }
        let value = Data::deserialize(deserializer)?;
        let state = Self {
            binding: value.binding,
            position: value.position,
            controls: value.controls,
            history: value.history,
            operations: value.operations,
            waits: value.waits,
            checkpoint: value.checkpoint,
            driver_state: value.driver_state,
            suspended: value.suspended,
            outcome: value.outcome,
            receipts: value.receipts,
        };
        state.validate().map_err(serde::de::Error::custom)?;
        Ok(state)
    }
}

pub trait TurnJournal: Send + Sync {
    fn binding(&self) -> &TurnBinding;
    fn load(&self) -> BoxFuture<'_, Result<TurnState>>;
    fn commit(&self, change: JournalChange) -> BoxFuture<'_, Result<CommitReceipt>>;
    fn lookup(&self, change: ChangeId) -> BoxFuture<'_, Result<Option<CommitReceipt>>>;
}

pub trait ControlReader: Send + Sync {
    fn binding(&self) -> &TurnBinding;
    fn read(&self) -> BoxFuture<'_, Result<ControlSnapshot>>;
    fn changed(&self, after: ControlRevision) -> BoxFuture<'_, Result<ControlSnapshot>>;
}

/// Exclusive writer access to one turn: its journal and the control reader
/// bound to the same session, turn and writer epoch. Created by `bind_lease`;
/// the issuing adapter keeps its ownership guard alive with the journal.
pub struct TurnLease {
    journal: Box<dyn TurnJournal>,
    controls: Arc<dyn ControlReader>,
}

impl TurnLease {
    pub fn binding(&self) -> &TurnBinding {
        self.journal.binding()
    }
    pub fn journal(&self) -> &dyn TurnJournal {
        self.journal.as_ref()
    }
    pub fn controls(&self) -> &dyn ControlReader {
        self.controls.as_ref()
    }
}

pub fn bind_lease(
    binding: TurnBinding,
    journal: Box<dyn TurnJournal>,
    controls: Arc<dyn ControlReader>,
) -> Result<TurnLease> {
    if binding.epoch == 0 || journal.binding() != &binding || controls.binding() != &binding {
        return Err(Error::new(ErrorKind::Conflict, "turn_binding_mismatch"));
    }
    Ok(TurnLease { journal, controls })
}

struct MemoryState {
    state: TurnState,
    listeners: Vec<oneshot::Sender<ControlSnapshot>>,
}

impl MemoryState {
    /// Apply a change and wake control observers when the controls moved.
    fn apply(&mut self, change: JournalChange) -> Result<CommitReceipt> {
        let old = self.state.controls.revision;
        let receipt = self.state.apply(change)?;
        if self.state.controls.revision != old {
            let snapshot = self.state.controls.clone();
            for listener in self.listeners.drain(..) {
                let _ = listener.send(snapshot.clone());
            }
        }
        Ok(receipt)
    }
}

struct MemoryJournal {
    binding: TurnBinding,
    inner: Arc<Mutex<MemoryState>>,
}

impl MemoryJournal {
    /// Record a control-plane action at the current journal position. The
    /// receipt check, change construction and application share one lock, so
    /// concurrent driver commits cannot make it stale: it conflicts only when
    /// its expected control revision is no longer current.
    fn control(
        &self,
        id: ChangeId,
        expected: ControlRevision,
        action: JournalAction,
    ) -> Result<CommitReceipt> {
        let actions = vec![action];
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| Error::new(ErrorKind::Unavailable, "journal_poisoned"))?;
        if let Some(receipt) = inner.state.receipt(&id) {
            if receipt.record().content_fingerprint == Fingerprint::of(&actions)? {
                return Ok(receipt.clone());
            }
            return Err(Error::new(ErrorKind::Conflict, "change_identity_reused"));
        }
        let change = JournalChange::new(
            id,
            inner.state.binding.clone(),
            inner.state.position,
            expected,
            actions,
        )?;
        inner.apply(change)
    }
}

impl TurnJournal for MemoryJournal {
    fn binding(&self) -> &TurnBinding {
        &self.binding
    }
    fn load(&self) -> BoxFuture<'_, Result<TurnState>> {
        Box::pin(async {
            Ok(self
                .inner
                .lock()
                .map_err(|_| Error::new(ErrorKind::Unavailable, "journal_poisoned"))?
                .state
                .clone())
        })
    }
    fn commit(&self, change: JournalChange) -> BoxFuture<'_, Result<CommitReceipt>> {
        Box::pin(async move {
            self.inner
                .lock()
                .map_err(|_| Error::new(ErrorKind::Unavailable, "journal_poisoned"))?
                .apply(change)
        })
    }
    fn lookup(&self, change: ChangeId) -> BoxFuture<'_, Result<Option<CommitReceipt>>> {
        Box::pin(async move {
            Ok(self
                .inner
                .lock()
                .map_err(|_| Error::new(ErrorKind::Unavailable, "journal_poisoned"))?
                .state
                .receipt(&change)
                .cloned())
        })
    }
}

impl ControlReader for MemoryJournal {
    fn binding(&self) -> &TurnBinding {
        &self.binding
    }
    fn read(&self) -> BoxFuture<'_, Result<ControlSnapshot>> {
        Box::pin(async {
            Ok(self
                .inner
                .lock()
                .map_err(|_| Error::new(ErrorKind::Unavailable, "journal_poisoned"))?
                .state
                .controls
                .clone())
        })
    }
    fn changed(&self, after: ControlRevision) -> BoxFuture<'_, Result<ControlSnapshot>> {
        Box::pin(async move {
            let receiver = {
                let mut inner = self
                    .inner
                    .lock()
                    .map_err(|_| Error::new(ErrorKind::Unavailable, "journal_poisoned"))?;
                if inner.state.controls.revision != after {
                    return Ok(inner.state.controls.clone());
                }
                inner.listeners.retain(|sender| !sender.is_canceled());
                let (sender, receiver) = oneshot::channel();
                inner.listeners.push(sender);
                receiver
            };
            receiver
                .await
                .map_err(|_| Error::new(ErrorKind::Unavailable, "control_reader_closed"))
        })
    }
}

pub struct EphemeralJournal;
pub struct EphemeralTurn {
    pub lease: TurnLease,
    pub control: EphemeralControl,
}
pub struct EphemeralControl {
    journal: MemoryJournal,
}

impl EphemeralJournal {
    pub fn create(binding: TurnBinding) -> Result<EphemeralTurn> {
        let inner = Arc::new(Mutex::new(MemoryState {
            state: TurnState::new(binding.clone())?,
            listeners: vec![],
        }));
        let journal = MemoryJournal {
            binding: binding.clone(),
            inner: Arc::clone(&inner),
        };
        let controls = MemoryJournal {
            binding: binding.clone(),
            inner: Arc::clone(&inner),
        };
        let control = EphemeralControl {
            journal: MemoryJournal {
                binding: binding.clone(),
                inner,
            },
        };
        Ok(EphemeralTurn {
            lease: bind_lease(binding, Box::new(journal), Arc::new(controls))?,
            control,
        })
    }
}

impl EphemeralControl {
    pub async fn change(
        &self,
        id: ChangeId,
        expected: ControlRevision,
        directive: ControlDirective,
    ) -> Result<CommitReceipt> {
        self.journal
            .control(id, expected, JournalAction::Control(directive))
    }
    pub async fn resolve(
        &self,
        id: ChangeId,
        expected: ControlRevision,
        wait: WaitId,
        answer: Envelope,
    ) -> Result<CommitReceipt> {
        self.journal
            .control(id, expected, JournalAction::ResolveWait { wait, answer })
    }
}
