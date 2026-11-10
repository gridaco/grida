use crate::*;
use agent_kit_core::authority::AuthorityRequest;
use agent_kit_core::driver_state::DriverStateChange;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceStatus, MeasurementKind,
    RequestControl,
};
use agent_kit_core::messages::{Content, Message, OutcomeStatus, Provenance, ProvenanceKind};
use agent_kit_core::tools::{InvocationContext, InvocationRecovery};
use agent_kit_core::turn::{
    CommitReceipt, ControlSnapshot, InterruptionReason, JournalAction, JournalChange,
    OperationInput, OperationOutcome, OperationRecord, TurnLease, WaitRecord,
};
use agent_kit_core::{AttemptId, CancellationToken, ChangeId, Fingerprint, MessageId};
use std::num::NonZeroU64;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::{Mutex as AsyncMutex, Semaphore, broadcast, mpsc, watch};

pub struct Runtime {
    services: Arc<ExecutionServices>,
    inference_permits: Arc<Semaphore>,
    tool_permits: Arc<Semaphore>,
}

impl Runtime {
    pub fn new(services: ExecutionServices) -> Result<Self> {
        services.limits.validate()?;
        Ok(Self {
            inference_permits: Arc::new(Semaphore::new(services.limits.max_concurrent_inferences)),
            tool_permits: Arc::new(Semaphore::new(services.limits.max_concurrent_tools)),
            services: Arc::new(services),
        })
    }

    /// Bind a turn-specific authority and gate while retaining the runtime's
    /// shared inference and tool admission capacity.
    pub fn with_authorization(
        &self,
        authority: Arc<dyn agent_kit_core::authority::AuthorityValidator>,
        gate: Arc<dyn ToolGate>,
    ) -> Self {
        Self {
            services: Arc::new(ExecutionServices {
                providers: self.services.providers.clone(),
                tools: self.services.tools.clone(),
                authority,
                gate,
                limits: self.services.limits.clone(),
            }),
            inference_permits: self.inference_permits.clone(),
            tool_permits: self.tool_permits.clone(),
        }
    }

    pub async fn open(&self, lease: TurnLease) -> Result<OpenedTurn> {
        let state = lease.journal().load().await?;
        state.validate()?;
        if state.binding() != lease.binding() || state.outcome().is_some() || state.is_suspended() {
            return Err(Error::new(ErrorKind::InvalidState, "turn_not_active"));
        }
        let admission_closed = !state.controls().admits_work();
        let (view, _) = watch::channel(TurnView {
            state,
            active: vec![],
            admission_closed,
        });
        let (events, _) = broadcast::channel(self.services.limits.observer_capacity);
        let inner = Arc::new(Inner {
            binding: lease.binding().clone(),
            lease: Mutex::new(Some(Arc::new(lease))),
            abandoned: AtomicBool::new(false),
            services: Arc::clone(&self.services),
            inference_permits: Arc::clone(&self.inference_permits),
            tool_permits: Arc::clone(&self.tool_permits),
            serial: AsyncMutex::new(()),
            active: Mutex::new(BTreeMap::new()),
            closing: AtomicBool::new(false),
            frozen: AtomicBool::new(false),
            cancellation: CancellationToken::new(),
            view,
            events,
        });
        let observer = TurnObserver::new(&inner);
        let controls = Arc::clone(&inner);
        let monitor = tokio::spawn(async move { controls.monitor().await });
        Ok(OpenedTurn {
            turn: Turn {
                inner,
                monitor: Some(monitor),
            },
            observer,
        })
    }
}

pub struct OpenedTurn {
    pub turn: Turn,
    pub observer: TurnObserver,
}

pub struct Turn {
    pub(crate) inner: Arc<Inner>,
    monitor: Option<tokio::task::JoinHandle<()>>,
}

impl Turn {
    pub fn view(&self) -> TurnView {
        self.inner.view.borrow().clone()
    }

    pub fn operation(&self, key: &OperationKey) -> Result<Option<OperationState>> {
        let id = self.operations().operation_id(key)?;
        Ok(self.view().state.operations().get(&id).cloned())
    }

    pub fn operations(&self) -> TurnOperations {
        TurnOperations {
            inner: Arc::clone(&self.inner),
        }
    }

    /// Wait without claiming an executor. A changed control revision releases
    /// the caller early so it can act on the new durable state.
    pub async fn wait_while_admitted(
        &self,
        expected: ControlRevision,
        delay: Duration,
    ) -> Result<bool> {
        self.inner.ensure_open()?;
        let lease = self.inner.lease()?;
        let current = self.inner.refresh().await?;
        if current.controls().revision != expected || !current.controls().admits_work() {
            return Ok(false);
        }
        let elapsed = tokio::select! {
            biased;
            _ = self.inner.cancellation.cancelled() => return Err(Error::new(ErrorKind::InvalidState, "admission_closed")),
            changed = lease.controls().changed(expected) => { changed?; false }
            _ = tokio::time::sleep(delay) => true,
        };
        let current = self.inner.refresh().await?;
        self.inner.ensure_open()?;
        Ok(elapsed && current.controls().revision == expected && current.controls().admits_work())
    }

    pub async fn append_history(
        &mut self,
        key: OperationKey,
        records: Vec<HistoryRecord>,
    ) -> Result<CommitReceipt> {
        self.inner.ensure_open()?;
        self.inner
            .apply(
                change_id(&self.inner, &key, "history")?,
                vec![JournalAction::AppendHistory(records)],
            )
            .await
    }

    pub async fn publish_continuation(
        &mut self,
        key: OperationKey,
        records: Vec<HistoryRecord>,
        checkpoint: Envelope,
    ) -> Result<CommitReceipt> {
        self.inner.ensure_open()?;
        self.inner
            .apply(
                change_id(&self.inner, &key, "continuation")?,
                vec![
                    JournalAction::AppendHistory(records),
                    JournalAction::SetCheckpoint(checkpoint),
                ],
            )
            .await
    }

    pub async fn checkpoint(
        &mut self,
        key: OperationKey,
        checkpoint: Envelope,
    ) -> Result<CommitReceipt> {
        self.inner.ensure_open()?;
        self.inner
            .apply(
                change_id(&self.inner, &key, "checkpoint")?,
                vec![JournalAction::SetCheckpoint(checkpoint)],
            )
            .await
    }

    pub async fn try_finish(&mut self, draft: CompletionDraft) -> Result<FinishOutcome> {
        self.finish(draft, None).await
    }

    /// Publish a conditional driver-state update with the same terminal receipt.
    pub async fn try_finish_with_driver_state(
        &mut self,
        draft: CompletionDraft,
        change: DriverStateChange,
    ) -> Result<FinishOutcome> {
        self.finish(draft, Some(change)).await
    }

    async fn finish(
        &mut self,
        draft: CompletionDraft,
        state_change: Option<DriverStateChange>,
    ) -> Result<FinishOutcome> {
        self.inner.closing.store(true, Ordering::SeqCst);
        let _serial = self.inner.serial.lock().await;
        let state = self.inner.refresh().await?;
        if let Some(error) =
            self.inner
                .boundary_rejection(&state, draft.expected_control, draft.expected_history)
        {
            self.inner.reopen();
            return Ok(FinishOutcome::Continue(error));
        }
        if state
            .operations()
            .values()
            .any(|operation| operation.outcome().is_none())
            || state.waits().values().any(WaitRecord::is_pending)
        {
            self.inner.reopen();
            return Ok(FinishOutcome::Continue(Error::new(
                ErrorKind::InvalidState,
                "work_unsettled",
            )));
        }
        let mut actions = Vec::new();
        let id = match state_change {
            Some(change) => {
                let id = phase_id(
                    &self.inner.binding.turn,
                    "settle",
                    &(&draft.outcome, &change),
                )?;
                actions.push(JournalAction::SetDriverState(change));
                id
            }
            None => phase_id(&self.inner.binding.turn, "settle", &draft.outcome)?,
        };
        actions.push(JournalAction::Settle(draft.outcome));
        let receipt = match self
            .inner
            .commit_with_basis(
                id,
                actions,
                Some(CommitBasis::Completion(
                    draft.expected_control,
                    draft.expected_history,
                )),
            )
            .await
        {
            Ok(receipt) => receipt,
            Err(error) if error.kind != ErrorKind::Uncertain => {
                self.inner.reopen();
                return Ok(FinishOutcome::Continue(error));
            }
            Err(error) => return Err(error),
        };
        match receipt {
            CommitReceipt::Settled(receipt) => {
                self.release_owner();
                Ok(FinishOutcome::Settled(Box::new(receipt)))
            }
            _ => Err(self.inner.freeze("invalid_settlement_receipt")),
        }
    }

    pub async fn try_suspend(&mut self, draft: SuspensionDraft) -> Result<SuspendOutcome> {
        self.inner.closing.store(true, Ordering::SeqCst);
        let _serial = self.inner.serial.lock().await;
        let state = self.inner.refresh().await?;
        if let Some(error) =
            self.inner
                .boundary_rejection(&state, draft.expected_control, draft.expected_history)
        {
            self.inner.reopen();
            return Ok(SuspendOutcome::Continue(error));
        }
        if state.operations().values().any(OperationState::is_running) {
            self.inner.reopen();
            return Ok(SuspendOutcome::Continue(Error::new(
                ErrorKind::InvalidState,
                "work_still_running",
            )));
        }
        let mut actions = vec![];
        if let Some(checkpoint) = draft.checkpoint {
            actions.push(JournalAction::SetCheckpoint(checkpoint));
        }
        actions.push(JournalAction::Suspend);
        let id = phase_id(
            &self.inner.binding.turn,
            "suspend",
            &(state.position(), &actions),
        )?;
        let receipt = match self
            .inner
            .commit_with_basis(
                id,
                actions,
                Some(CommitBasis::Completion(
                    draft.expected_control,
                    draft.expected_history,
                )),
            )
            .await
        {
            Ok(receipt) => receipt,
            Err(error) if error.kind != ErrorKind::Uncertain => {
                self.inner.reopen();
                return Ok(SuspendOutcome::Continue(error));
            }
            Err(error) => return Err(error),
        };
        match receipt {
            CommitReceipt::Suspended(receipt) => {
                self.release_owner();
                Ok(SuspendOutcome::Suspended(receipt))
            }
            _ => Err(self.inner.freeze("invalid_suspension_receipt")),
        }
    }
}

impl Turn {
    fn release_owner(&self) {
        if let Some(monitor) = &self.monitor {
            monitor.abort();
        }
        self.inner.lease.lock().expect("lease lock").take();
    }
}

impl Drop for Turn {
    fn drop(&mut self) {
        self.inner.closing.store(true, Ordering::SeqCst);
        self.inner.abandoned.store(true, Ordering::SeqCst);
        self.inner.cancellation.cancel();
        self.inner.cancel_active();
        self.inner.publish_current();
        if let Some(monitor) = self.monitor.take() {
            monitor.abort();
        }
        if self.inner.active.lock().expect("active lock").is_empty() {
            self.inner.lease.lock().expect("lease lock").take();
        }
    }
}

pub struct TurnObserver {
    view: watch::Receiver<TurnView>,
    events: broadcast::Receiver<TurnUpdate>,
}

impl TurnObserver {
    fn new(inner: &Inner) -> Self {
        Self {
            view: inner.view.subscribe(),
            events: inner.events.subscribe(),
        }
    }

    pub fn snapshot(&self) -> TurnView {
        self.view.borrow().clone()
    }

    pub async fn next(&mut self) -> Option<TurnUpdate> {
        match self.events.recv().await {
            Ok(event) => Some(event),
            Err(broadcast::error::RecvError::Lagged(_)) => {
                Some(TurnUpdate::Snapshot(Box::new(self.snapshot())))
            }
            Err(broadcast::error::RecvError::Closed) => None,
        }
    }
}

#[derive(Clone)]
pub struct TurnOperations {
    pub(crate) inner: Arc<Inner>,
}

impl TurnOperations {
    pub fn view(&self) -> TurnView {
        self.inner.view.borrow().clone()
    }

    pub fn operation_id(&self, key: &OperationKey) -> Result<OperationId> {
        OperationId::new(fingerprint_name(
            "operation",
            &(&self.inner.binding.session, &self.inner.binding.turn, key),
        )?)
    }

    pub async fn infer(
        &self,
        key: OperationKey,
        request: PreparedRequest,
        grants: GrantSelection,
    ) -> Result<InferenceOutcome> {
        self.infer_updates(key, request, grants, None, None).await
    }

    /// Execute ordinary inference with a caller-selected earlier deadline.
    /// Cancellation and final evidence remain owned by this turn.
    pub async fn infer_until(
        &self,
        key: OperationKey,
        request: PreparedRequest,
        grants: GrantSelection,
        deadline: Instant,
    ) -> Result<InferenceOutcome> {
        self.infer_updates(key, request, grants, None, Some(deadline))
            .await
    }

    pub(crate) async fn infer_updates(
        &self,
        key: OperationKey,
        request: PreparedRequest,
        grants: GrantSelection,
        updates: Option<mpsc::Sender<ToolCall>>,
        deadline_cap: Option<Instant>,
    ) -> Result<InferenceOutcome> {
        let id = self.operation_id(&key)?;
        self.inner.ensure_open()?;
        let state = self.inner.refresh().await?;
        let input = OperationInput::Inference(request.clone());
        if let Some(existing) = state.operations().get(&id) {
            if existing.record.input != input {
                return Err(Error::new(ErrorKind::Conflict, "operation_identity_reused"));
            }
            if let Some(OperationOutcome::Inference(outcome)) = existing.outcome() {
                return Ok(outcome.clone());
            }
        }
        if request.binding().authority != grants.authority {
            return Err(Error::new(
                ErrorKind::Conflict,
                "provider_authority_mismatch",
            ));
        }
        let record = OperationRecord {
            id: id.clone(),
            input,
            grants,
            origin: None,
            source_call: None,
        };
        let owner = match self.inner.claim(record.clone()).await? {
            Claim::Completed(OperationOutcome::Inference(outcome)) => return Ok(outcome),
            Claim::Completed(_) => {
                return Err(Error::new(ErrorKind::Conflict, "operation_kind_changed"));
            }
            Claim::Owner(owner) => owner,
        };
        let provider = match self
            .inner
            .services
            .providers
            .get(&request.binding().provider)
        {
            Some(provider) => Arc::clone(provider),
            None => {
                let outcome = inference_failure("provider_unavailable", FailureKind::Configuration);
                self.inner
                    .reject(&id, OperationOutcome::Inference(outcome.clone()))
                    .await?;
                return Ok(outcome);
            }
        };
        let deadline = Instant::now() + self.inner.services.limits.operation_timeout;
        let deadline = deadline_cap.map_or(deadline, |cap| cap.min(deadline));
        let permit = tokio::select! {
            _ = owner.admission.cancellation.cancelled() => {
                return self.reject_inference(&id, owner.admission.cancellation_code(), FailureKind::Cancelled).await;
            }
            permit = Arc::clone(&self.inner.inference_permits).acquire_owned() => {
                permit.map_err(|_| Error::new(ErrorKind::Unavailable, "inference_capacity_closed"))?
            }
            _ = tokio::time::sleep_until(deadline.into()) => {
                return self.reject_inference(&id, "deadline", FailureKind::Cancelled).await;
            }
        };
        if let Err(failure) = self
            .authorize_inference(&record, &owner.admission, deadline)
            .await
        {
            drop(permit);
            return self.reject_inference_failure(&id, failure).await;
        }
        if let Some(limit) = request.input_limit() {
            if let Err(failure) = check_input_limit(
                provider.as_ref(),
                &request,
                limit,
                &owner.admission,
                deadline,
            )
            .await
            {
                drop(permit);
                return self.reject_inference_failure(&id, failure).await;
            }
            // A count can outlive the grants or control state it began with.
            if let Err(failure) = self
                .authorize_inference(&record, &owner.admission, deadline)
                .await
            {
                drop(permit);
                return self.reject_inference_failure(&id, failure).await;
            }
        }
        if Instant::now() >= deadline {
            drop(permit);
            return self
                .reject_inference(&id, "deadline", FailureKind::Cancelled)
                .await;
        }
        let attempt = match self.inner.start_attempt(&owner).await {
            Ok(attempt) => attempt,
            Err(error) if error.kind == ErrorKind::InvalidState => {
                return self
                    .reject_inference(&id, &error.code, FailureKind::Cancelled)
                    .await;
            }
            Err(error) => return Err(error),
        };
        let cancellation = owner
            .admission
            .cancellation
            .is_cancelled()
            .then(|| owner.admission.cancellation_code())
            .or_else(|| (Instant::now() >= deadline).then_some("deadline"));
        if let Some(code) = cancellation {
            let outcome = inference_failure(code, FailureKind::Cancelled);
            self.inner
                .complete(&id, &attempt, OperationOutcome::Inference(outcome.clone()))
                .await?;
            return Ok(outcome);
        }
        let control = InferenceControl {
            attempt: attempt.clone(),
            cancellation: owner.admission.cancellation.clone(),
            deadline: Some(deadline),
            max_output_bytes: self.inner.services.limits.max_output_bytes,
        };
        let mut run = match provider.start(request, control) {
            Ok(run) => run,
            Err(error) => {
                drop(permit);
                let outcome = inference_failure(&error.code, FailureKind::Configuration);
                self.inner
                    .complete(&id, &attempt, OperationOutcome::Inference(outcome.clone()))
                    .await?;
                return Ok(outcome);
            }
        };
        let mut calls = BTreeMap::new();
        loop {
            let update = tokio::select! {
                value = run.next() => value,
                _ = tokio::time::sleep_until(deadline.into()) => {
                    owner.admission.cancellation.cancel();
                    run.next().await
                }
            };
            let Some(update) = update else { break };
            if let InferenceUpdate::ToolCall(call) = &update {
                if let Some(previous) = calls.get(&call.id) {
                    if previous != call {
                        owner.admission.cancellation.cancel();
                        return Err(Error::new(ErrorKind::Conflict, "tool_call_identity_reused"));
                    }
                } else {
                    calls.insert(call.id.clone(), call.clone());
                    if let Some(sender) = &updates {
                        sender.send(call.clone()).await.map_err(|_| {
                            Error::new(ErrorKind::Unavailable, "step_consumer_closed")
                        })?;
                    }
                }
            }
            let _ = self.inner.events.send(TurnUpdate::Inference {
                operation: id.clone(),
                update,
            });
        }
        let mut outcome = run.finish().await;
        if deadline_cap.is_some()
            && Instant::now() >= deadline
            && owner.admission.interruption_code().is_none()
        {
            outcome.status = InferenceStatus::Interrupted;
            outcome.failure = inference_failure("deadline", FailureKind::Cancelled).failure;
        } else if let Some(failure) = &mut outcome.failure
            && outcome.status == InferenceStatus::Interrupted
            && failure.kind == FailureKind::Cancelled
            && let Some(code) = owner.admission.interruption_code()
        {
            failure.code = code.into();
        }
        retain_calls(&id, &mut outcome, calls.into_values().collect())?;
        drop(permit);
        self.inner
            .complete(&id, &attempt, OperationOutcome::Inference(outcome.clone()))
            .await?;
        Ok(outcome)
    }

    async fn reject_inference(
        &self,
        id: &OperationId,
        code: &str,
        kind: FailureKind,
    ) -> Result<InferenceOutcome> {
        self.reject_inference_failure(id, admission_failure(code, kind))
            .await
    }

    async fn reject_inference_failure(
        &self,
        id: &OperationId,
        failure: InferenceFailure,
    ) -> Result<InferenceOutcome> {
        let outcome = failed_inference(failure);
        self.inner
            .reject(id, OperationOutcome::Inference(outcome.clone()))
            .await?;
        Ok(outcome)
    }

    async fn authorize_inference(
        &self,
        record: &OperationRecord,
        admission: &Admission,
        deadline: Instant,
    ) -> std::result::Result<(), InferenceFailure> {
        self.inner
            .authorize(record, admission, deadline)
            .await
            .map_err(|error| {
                if let Some(code) = admission.interruption_code() {
                    admission_failure(code, FailureKind::Cancelled)
                } else if error.code == "deadline" {
                    admission_failure("deadline", FailureKind::Cancelled)
                } else {
                    admission_failure(&error.code, FailureKind::Configuration)
                }
            })
    }

    pub async fn invoke(
        &self,
        key: OperationKey,
        plan: PlannedInvocation,
    ) -> Result<InvokeOutcome> {
        self.invoke_with_inventory(key, plan, self.inner.services.tools.clone())
            .await
    }

    /// Invoke a host-selected operation with the inventory captured for this
    /// decision. Dispatch uses the same journal, gate, and current authority.
    pub async fn invoke_with_inventory(
        &self,
        key: OperationKey,
        plan: PlannedInvocation,
        inventory: InventorySnapshot,
    ) -> Result<InvokeOutcome> {
        self.invoke_captured(key, plan, inventory, None, None).await
    }

    pub(crate) async fn invoke_captured(
        &self,
        key: OperationKey,
        plan: PlannedInvocation,
        inventory: InventorySnapshot,
        origin: Option<OperationId>,
        source_call: Option<agent_kit_core::ToolCallId>,
    ) -> Result<InvokeOutcome> {
        let id = self.operation_id(&key)?;
        self.inner.ensure_open()?;
        let state = self.inner.refresh().await?;
        if let Some(existing) = state.operations().get(&id) {
            let OperationInput::Tool(invocation) = &existing.record.input else {
                return Err(Error::new(ErrorKind::Conflict, "operation_kind_changed"));
            };
            if invocation.definition().id != plan.tool
                || invocation.arguments() != &plan.arguments
                || existing.record.origin != origin
                || existing.record.source_call != source_call
            {
                return Err(Error::new(ErrorKind::Conflict, "operation_identity_reused"));
            }
            if let Some(OperationOutcome::Tool(outcome)) = existing.outcome() {
                return Ok(InvokeOutcome::Complete(outcome.clone()));
            }
            if existing.record.grants != plan.grants {
                return Err(Error::new(ErrorKind::Conflict, "operation_identity_reused"));
            }
        }
        let prepared = inventory.prepare(id.clone(), &plan.tool, plan.arguments)?;
        let record = OperationRecord {
            id: id.clone(),
            input: OperationInput::Tool(prepared.invocation().clone()),
            grants: plan.grants,
            origin,
            source_call,
        };
        let owner = match self.inner.claim(record.clone()).await? {
            Claim::Completed(OperationOutcome::Tool(outcome)) => {
                return Ok(InvokeOutcome::Complete(outcome));
            }
            Claim::Completed(_) => {
                return Err(Error::new(ErrorKind::Conflict, "operation_kind_changed"));
            }
            Claim::Owner(owner) => owner,
        };
        if let Err(error) = owner.admission.ensure_pending() {
            return self.reject_tool(&id, &error.code).await;
        }
        let admission = ToolAdmission {
            operation: id.clone(),
            invocation: prepared.invocation().clone(),
            grants: record.grants.clone(),
        };
        let deadline = Instant::now() + self.inner.services.limits.operation_timeout;
        let gate = self.inner.services.gate.decide(
            admission,
            AdmissionContext {
                operations: self.clone(),
            },
        );
        let decision = tokio::select! {
            biased;
            _ = owner.admission.cancellation.cancelled() => Err(Error::new(ErrorKind::InvalidState, owner.admission.cancellation_code())),
            result = gate => result,
            _ = tokio::time::sleep_until(deadline.into()) => Err(Error::new(ErrorKind::LimitExceeded, "deadline")),
        };
        match decision {
            Ok(ToolDecision::Permit) => {}
            Ok(ToolDecision::Defer(wait)) => {
                let state = self.inner.refresh().await?;
                if !state.waits().contains_key(&wait) {
                    return Err(Error::new(ErrorKind::InvalidState, "deferred_wait_missing"));
                }
                let _ = self.inner.events.send(TurnUpdate::Deferred {
                    operation: id,
                    wait: wait.clone(),
                });
                return Ok(InvokeOutcome::Deferred(wait));
            }
            Ok(ToolDecision::Deny(Denial { reason })) | Err(reason) => {
                let outcome = ToolOutcome::failed(&reason.code);
                self.inner
                    .reject(&id, OperationOutcome::Tool(outcome.clone()))
                    .await?;
                return Ok(InvokeOutcome::Complete(outcome));
            }
        }
        let permit = tokio::select! {
            _ = owner.admission.cancellation.cancelled() => return self.reject_tool(&id, owner.admission.cancellation_code()).await,
            result = Arc::clone(&self.inner.tool_permits).acquire_owned() => result.map_err(|_| Error::new(ErrorKind::Unavailable, "tool_capacity_closed"))?,
            _ = tokio::time::sleep_until(deadline.into()) => return self.reject_tool(&id, "deadline").await,
        };
        if let Err(error) = self
            .inner
            .authorize(&record, &owner.admission, deadline)
            .await
        {
            drop(permit);
            return self.reject_tool(&id, &error.code).await;
        }
        let attempt = match self.inner.start_attempt(&owner).await {
            Ok(attempt) => attempt,
            Err(error) if error.kind == ErrorKind::InvalidState => {
                return self.reject_tool(&id, &error.code).await;
            }
            Err(error) => return Err(error),
        };
        let context = InvocationContext {
            attempt: attempt.clone(),
            cancellation: owner.admission.cancellation.clone(),
            deadline: Some(deadline),
            max_output_bytes: self.inner.services.limits.max_output_bytes,
        };
        let outcome = if let Err(error) = owner.admission.ensure_pending() {
            let mut outcome = ToolOutcome::failed(&error.code);
            outcome.status = OutcomeStatus::Cancelled;
            outcome
        } else {
            tokio::select! {
                outcome = prepared.invoke(context) => outcome,
                _ = owner.admission.cancellation.cancelled() => ToolOutcome::uncertain(),
                _ = tokio::time::sleep_until(deadline.into()) => ToolOutcome::uncertain(),
            }
        };
        drop(permit);
        self.inner
            .complete(&id, &attempt, OperationOutcome::Tool(outcome.clone()))
            .await?;
        Ok(InvokeOutcome::Complete(outcome))
    }

    async fn reject_tool(&self, id: &OperationId, code: &str) -> Result<InvokeOutcome> {
        let outcome = ToolOutcome::failed(code);
        self.inner
            .reject(id, OperationOutcome::Tool(outcome.clone()))
            .await?;
        Ok(InvokeOutcome::Complete(outcome))
    }

    pub async fn request_input(&self, request: WaitRecord) -> Result<CommitReceipt> {
        self.inner.ensure_open()?;
        let _serial = self.inner.serial.lock().await;
        let state = self.inner.refresh().await?;
        let id = phase_id(&self.inner.binding.turn, "wait", &request.id)?;
        if let Some(existing) = state.waits().get(&request.id) {
            if existing.request != request.request || existing.response != request.response {
                return Err(Error::new(ErrorKind::Conflict, "wait_identity_reused"));
            }
            return state
                .receipt(&id)
                .cloned()
                .ok_or_else(|| self.inner.freeze("wait_receipt_missing"));
        }
        if state.waits().len() >= self.inner.services.limits.max_operations {
            return Err(Error::new(ErrorKind::LimitExceeded, "interaction_limit"));
        }
        self.inner
            .commit_locked(id, vec![JournalAction::OpenWait(request)])
            .await
    }

    /// Withdraw an outstanding interaction without changing earlier answers.
    pub async fn withdraw_input(&self, wait: WaitId) -> Result<CommitReceipt> {
        self.inner
            .apply(
                phase_id(&self.inner.binding.turn, "withdraw", &wait)?,
                vec![JournalAction::WithdrawWait(wait)],
            )
            .await
    }

    /// Account for prepared work that the caller has explicitly cancelled.
    /// Active or previously dispatched attempts require their own disposition.
    pub async fn cancel_prepared(&self, id: OperationId) -> Result<OperationOutcome> {
        let _serial = self.inner.serial.lock().await;
        let state = self.inner.refresh().await?;
        if self
            .inner
            .active
            .lock()
            .expect("active lock")
            .contains_key(&id)
        {
            return Err(Error::new(ErrorKind::InvalidState, "operation_active"));
        }
        let operation = state
            .operations()
            .get(&id)
            .ok_or_else(|| Error::new(ErrorKind::InvalidState, "operation_missing"))?;
        if let Some(outcome) = operation.outcome() {
            return Ok(outcome.clone());
        }
        if !operation.attempts.is_empty() {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "operation_was_dispatched",
            ));
        }
        let outcome = match operation.record.input {
            OperationInput::Inference(_) => {
                OperationOutcome::Inference(inference_failure("cancelled", FailureKind::Cancelled))
            }
            OperationInput::Tool(_) => {
                let mut outcome = ToolOutcome::failed("cancelled");
                outcome.status = OutcomeStatus::Cancelled;
                OperationOutcome::Tool(outcome)
            }
        };
        self.inner
            .commit_locked(
                phase_id(&id, "reject", &outcome)?,
                vec![JournalAction::RejectPrepared {
                    operation: id.clone(),
                    outcome: outcome.clone(),
                }],
            )
            .await?;
        let _ = self.inner.events.send(TurnUpdate::Operation {
            operation: id,
            outcome: outcome.clone(),
        });
        Ok(outcome)
    }

    pub async fn wait(&self, request: WaitRecord) -> Result<WaitOutcome> {
        let id = request.id.clone();
        self.request_input(request).await?;
        let lease = self.inner.lease()?;
        loop {
            let state = self.inner.refresh().await?;
            let wait = state
                .waits()
                .get(&id)
                .ok_or_else(|| Error::new(ErrorKind::InvalidState, "wait_missing"))?;
            if let Some(answer) = &wait.answer {
                return Ok(WaitOutcome::Answered(answer.clone()));
            }
            if wait.withdrawn {
                return Ok(WaitOutcome::Withdrawn);
            }
            if !state.controls().admits_work() || self.inner.cancellation.is_cancelled() {
                return Ok(WaitOutcome::Pending(id));
            }
            tokio::select! {
                result = lease.controls().changed(state.controls().revision) => { result?; }
                _ = self.inner.cancellation.cancelled() => return Ok(WaitOutcome::Pending(id)),
            }
        }
    }

    /// Record the loss of an execution owner without contacting an executor.
    /// This preserves uncertain effects and allows a successor to account for
    /// them. A prepared operation with no attempt has no execution to interrupt.
    pub async fn record_interruption(&self, id: OperationId) -> Result<OperationOutcome> {
        let _serial = self.inner.serial.lock().await;
        let state = self.inner.refresh().await?;
        if self
            .inner
            .active
            .lock()
            .expect("active lock")
            .contains_key(&id)
        {
            return Err(Error::new(ErrorKind::InvalidState, "operation_active"));
        }
        let operation = state
            .operations()
            .get(&id)
            .ok_or_else(|| Error::new(ErrorKind::InvalidState, "operation_missing"))?;
        if let Some(outcome) = operation.outcome() {
            return Ok(outcome.clone());
        }
        let attempt = operation
            .attempts
            .last()
            .ok_or_else(|| Error::new(ErrorKind::InvalidState, "attempt_not_started"))?;
        let outcome = match &operation.record.input {
            OperationInput::Tool(_) => OperationOutcome::Tool(ToolOutcome::uncertain()),
            OperationInput::Inference(_) => {
                let mut outcome = inference_failure("execution_owner_lost", FailureKind::Protocol);
                outcome.status = InferenceStatus::Interrupted;
                let calls = state
                    .operations()
                    .values()
                    .filter_map(|child| {
                        if child.record.origin.as_ref() != Some(&id) {
                            return None;
                        }
                        let OperationInput::Tool(invocation) = &child.record.input else {
                            return None;
                        };
                        child.record.source_call.as_ref().map(|call| ToolCall {
                            id: call.clone(),
                            tool: invocation.definition().id.clone(),
                            arguments: invocation.arguments().clone(),
                        })
                    })
                    .collect();
                retain_calls(&id, &mut outcome, calls)?;
                OperationOutcome::Inference(outcome)
            }
        };
        self.inner
            .commit_locked(
                phase_id(&id, "interrupt", &attempt.id)?,
                vec![JournalAction::CompleteAttempt {
                    operation: id.clone(),
                    attempt: attempt.id.clone(),
                    outcome: outcome.clone(),
                }],
            )
            .await?;
        let _ = self.inner.events.send(TurnUpdate::Operation {
            operation: id,
            outcome: outcome.clone(),
        });
        Ok(outcome)
    }

    pub async fn recover_tool(&self, key: OperationKey) -> Result<ToolOutcome> {
        let id = self.operation_id(&key)?;
        self.reconcile_tool(id, self.inner.services.tools.clone())
            .await
    }

    /// Reconcile a recorded tool operation with the inventory captured by its
    /// current turn owner. The recorded definition and attempt still apply.
    pub async fn reconcile_tool(
        &self,
        id: OperationId,
        inventory: InventorySnapshot,
    ) -> Result<ToolOutcome> {
        self.inner.ensure_open()?;
        let _serial = self.inner.serial.lock().await;
        let state = self.inner.refresh().await?;
        let operation = state
            .operations()
            .get(&id)
            .cloned()
            .ok_or_else(|| Error::new(ErrorKind::InvalidState, "operation_missing"))?;
        if self
            .inner
            .active
            .lock()
            .expect("active lock")
            .contains_key(&id)
        {
            return Err(Error::new(ErrorKind::InvalidState, "operation_active"));
        }
        let OperationInput::Tool(invocation) = &operation.record.input else {
            return Err(Error::new(ErrorKind::InvalidInput, "not_tool_operation"));
        };
        if let Some(OperationOutcome::Tool(outcome)) = operation.outcome()
            && outcome.status != OutcomeStatus::Uncertain
        {
            return Ok(outcome.clone());
        }
        let attempt = operation
            .attempts
            .last()
            .ok_or_else(|| Error::new(ErrorKind::InvalidState, "attempt_missing"))?
            .id
            .clone();
        if operation.outcome().is_none() {
            self.inner
                .commit_locked(
                    phase_id(&id, "unknown", &attempt)?,
                    vec![JournalAction::CompleteAttempt {
                        operation: id.clone(),
                        attempt: attempt.clone(),
                        outcome: OperationOutcome::Tool(ToolOutcome::uncertain()),
                    }],
                )
                .await?;
        }
        let controls = self.inner.view.borrow().state.controls().clone();
        let owner = self.inner.owner(id.clone(), &controls)?;
        drop(_serial);
        let deadline = Instant::now() + self.inner.services.limits.operation_timeout;
        let permit = tokio::select! {
            result = Arc::clone(&self.inner.tool_permits).acquire_owned() => result.map_err(|_| Error::new(ErrorKind::Unavailable, "tool_capacity_closed"))?,
            _ = owner.admission.cancellation.cancelled() => return Err(Error::new(ErrorKind::InvalidState, "cancelled")),
            _ = tokio::time::sleep_until(deadline.into()) => return Err(Error::new(ErrorKind::LimitExceeded, "deadline")),
        };
        self.inner
            .authorize(&operation.record, &owner.admission, deadline)
            .await?;
        let prepared = inventory.restore(invocation.clone())?;
        let receipts: Vec<_> = operation
            .attempts
            .iter()
            .flat_map(|attempt| attempt.prior_outcomes.iter().chain(attempt.outcome.iter()))
            .filter_map(|outcome| match outcome {
                OperationOutcome::Tool(result) => result.receipt.clone(),
                _ => None,
            })
            .collect();
        let recovery = InvocationRecovery {
            invocation: invocation.clone(),
            checkpoint: None,
            receipts: receipts.clone(),
        };
        let mut uncertain = operation
            .outcome()
            .and_then(|outcome| match outcome {
                OperationOutcome::Tool(outcome) => Some(outcome.clone()),
                _ => None,
            })
            .unwrap_or_else(ToolOutcome::uncertain);
        uncertain.status = OutcomeStatus::Uncertain;
        if uncertain.receipt.is_none() {
            uncertain.receipt = receipts.last().cloned();
        }
        let future = prepared.recover(
            recovery,
            InvocationContext {
                attempt: attempt.clone(),
                cancellation: owner.admission.cancellation.clone(),
                deadline: Some(deadline),
                max_output_bytes: self.inner.services.limits.max_output_bytes,
            },
        );
        let outcome = tokio::select! {
            outcome = future => outcome,
            _ = owner.admission.cancellation.cancelled() => uncertain,
            _ = tokio::time::sleep_until(deadline.into()) => uncertain,
        };
        drop(permit);
        self.inner
            .apply(
                phase_id(&id, "reconcile", &outcome)?,
                vec![JournalAction::ReconcileAttempt {
                    operation: id,
                    attempt,
                    outcome: OperationOutcome::Tool(outcome.clone()),
                }],
            )
            .await?;
        Ok(outcome)
    }
}

fn inference_failure(code: &str, kind: FailureKind) -> InferenceOutcome {
    failed_inference(admission_failure(code, kind))
}

fn admission_failure(code: &str, kind: FailureKind) -> InferenceFailure {
    InferenceFailure {
        kind,
        code: code.into(),
        retry_after_ms: None,
        dispatch: None,
    }
}

fn failed_inference(failure: InferenceFailure) -> InferenceOutcome {
    InferenceOutcome {
        status: InferenceStatus::Failed,
        messages: vec![],
        usage: vec![],
        failure: Some(failure),
        receipt: None,
        terminal_receipt: None,
    }
}

async fn check_input_limit(
    provider: &dyn Provider,
    request: &PreparedRequest,
    limit: NonZeroU64,
    admission: &Admission,
    deadline: Instant,
) -> std::result::Result<(), InferenceFailure> {
    let cancellation = admission.cancellation.child_token();
    let _cancel_on_drop = cancellation.clone().drop_guard();
    let control = RequestControl {
        cancellation,
        deadline: Some(deadline),
    };
    let measurement = tokio::select! {
        biased;
        _ = admission.cancellation.cancelled() => return Err(admission_failure(admission.cancellation_code(), FailureKind::Cancelled)),
        _ = tokio::time::sleep_until(deadline.into()) => return Err(admission_failure("deadline", FailureKind::Cancelled)),
        result = provider.measure_input_async(request, control) => result?,
    };
    if measurement.kind == MeasurementKind::Estimate {
        return Err(admission_failure(
            "input_bound_unavailable",
            FailureKind::Configuration,
        ));
    }
    if measurement.tokens > limit.get() {
        return Err(admission_failure(
            "input_token_limit",
            FailureKind::ContextLimit,
        ));
    }
    Ok(())
}

fn retain_calls(
    id: &OperationId,
    outcome: &mut InferenceOutcome,
    calls: Vec<ToolCall>,
) -> Result<()> {
    let recorded: BTreeMap<_, _> = outcome
        .messages
        .iter()
        .flat_map(|message| message.content.iter())
        .filter_map(|content| match content {
            Content::ToolCall(call) => Some((call.id.clone(), call.clone())),
            _ => None,
        })
        .collect();
    let mut missing = vec![];
    for call in calls {
        match recorded.get(&call.id) {
            Some(existing) if existing != &call => {
                return Err(Error::new(ErrorKind::Conflict, "tool_call_identity_reused"));
            }
            None => missing.push(Content::ToolCall(call)),
            _ => {}
        }
    }
    if !missing.is_empty() {
        outcome.messages.push(Message {
            id: MessageId::new(fingerprint_name("calls", id)?)?,
            role: agent_kit_core::messages::Role::Assistant,
            phase: None,
            content: missing,
            provenance: Provenance {
                source: "provider_stream".into(),
                kind: ProvenanceKind::Observed,
                fingerprint: None,
            },
        });
    }
    Ok(())
}

pub(crate) struct Inner {
    binding: agent_kit_core::turn::TurnBinding,
    lease: Mutex<Option<Arc<TurnLease>>>,
    abandoned: AtomicBool,
    services: Arc<ExecutionServices>,
    inference_permits: Arc<Semaphore>,
    tool_permits: Arc<Semaphore>,
    serial: AsyncMutex<()>,
    active: Mutex<BTreeMap<OperationId, Active>>,
    closing: AtomicBool,
    frozen: AtomicBool,
    cancellation: CancellationToken,
    view: watch::Sender<TurnView>,
    events: broadcast::Sender<TurnUpdate>,
}

struct Active {
    admission: Arc<Admission>,
    finished: watch::Sender<bool>,
}

struct Owner {
    inner: Arc<Inner>,
    id: OperationId,
    admission: Arc<Admission>,
}

struct Admission {
    control: ControlRevision,
    cancellation: CancellationToken,
    interruption: Mutex<Option<InterruptionReason>>,
}

impl Admission {
    fn observe(&self, controls: &ControlSnapshot) {
        let Some(interruption) = &controls.interruption else {
            return;
        };
        if self.control < interruption.revision {
            let mut reason = self.interruption.lock().expect("interruption lock");
            if !self.cancellation.is_cancelled() {
                *reason = Some(interruption.reason);
                self.cancellation.cancel();
            }
        }
    }

    fn interruption_code(&self) -> Option<&'static str> {
        match *self.interruption.lock().expect("interruption lock") {
            Some(InterruptionReason::Pause) => Some("turn_paused"),
            Some(InterruptionReason::Cancel) => Some("turn_cancelled"),
            None => None,
        }
    }

    fn cancellation_code(&self) -> &'static str {
        self.interruption_code().unwrap_or("cancelled")
    }

    fn ensure_pending(&self) -> Result<()> {
        if self.cancellation.is_cancelled() {
            return Err(Error::new(
                ErrorKind::InvalidState,
                self.cancellation_code(),
            ));
        }
        Ok(())
    }

    fn check(&self, controls: &ControlSnapshot) -> Result<()> {
        self.observe(controls);
        self.ensure_pending()?;
        if !controls.admits_work() {
            return Err(Error::new(ErrorKind::InvalidState, "admission_closed"));
        }
        Ok(())
    }
}

impl Drop for Owner {
    fn drop(&mut self) {
        self.admission.cancellation.cancel();
        if let Some(active) = self
            .inner
            .active
            .lock()
            .expect("active lock")
            .remove(&self.id)
        {
            let _ = active.finished.send(true);
        }
        self.inner.publish_current();
        if self.inner.abandoned.load(Ordering::SeqCst)
            && self.inner.active.lock().expect("active lock").is_empty()
        {
            self.inner.lease.lock().expect("lease lock").take();
        }
    }
}

enum Claim {
    Owner(Owner),
    Completed(OperationOutcome),
}

enum CommitBasis<'a> {
    Completion(ControlRevision, HistoryPosition),
    Admission(&'a Admission),
}

impl Inner {
    pub(crate) fn max_operations(&self) -> usize {
        self.services.limits.max_operations
    }

    fn lease(&self) -> Result<Arc<TurnLease>> {
        self.lease
            .lock()
            .expect("lease lock")
            .clone()
            .ok_or_else(|| Error::new(ErrorKind::InvalidState, "owner_released"))
    }
    fn ensure_open(&self) -> Result<()> {
        if self.closing.load(Ordering::SeqCst)
            || self.frozen.load(Ordering::SeqCst)
            || self.cancellation.is_cancelled()
        {
            return Err(Error::new(ErrorKind::InvalidState, "admission_closed"));
        }
        Ok(())
    }

    fn freeze(&self, code: &str) -> Error {
        self.frozen.store(true, Ordering::SeqCst);
        self.cancel_active();
        self.publish_current();
        Error::new(ErrorKind::Uncertain, code)
    }

    fn reopen(&self) {
        self.closing.store(false, Ordering::SeqCst);
        self.publish_current();
    }

    fn cancel_active(&self) {
        for active in self.active.lock().expect("active lock").values() {
            active.admission.cancellation.cancel();
        }
    }

    fn observe_controls(&self, controls: &ControlSnapshot) {
        for active in self.active.lock().expect("active lock").values() {
            active.admission.observe(controls);
        }
    }

    fn publish_current(&self) {
        let active: Vec<_> = self
            .active
            .lock()
            .expect("active lock")
            .keys()
            .cloned()
            .collect();
        self.view.send_modify(|view| {
            view.active = active;
            view.admission_closed = self.closing.load(Ordering::SeqCst)
                || self.frozen.load(Ordering::SeqCst)
                || !view.state.controls().admits_work();
        });
        let _ = self
            .events
            .send(TurnUpdate::Snapshot(Box::new(self.view.borrow().clone())));
    }

    pub(crate) async fn refresh(&self) -> Result<TurnState> {
        let lease = self.lease()?;
        let state = lease
            .journal()
            .load()
            .await
            .map_err(|_| self.freeze("journal_unavailable"))?;
        if state.binding() != &self.binding {
            return Err(self.freeze("writer_superseded"));
        }
        self.view.send_modify(|view| {
            if state.position() >= view.state.position() {
                view.state = state.clone();
            }
        });
        self.observe_controls(state.controls());
        self.publish_current();
        Ok(state)
    }

    async fn monitor(self: Arc<Self>) {
        let mut revision = self.view.borrow().state.controls().revision;
        loop {
            let Ok(lease) = self.lease() else { break };
            tokio::select! {
                _ = self.cancellation.cancelled() => break,
                next = lease.controls().changed(revision) => {
                    let Ok(controls) = next else { self.freeze("control_unavailable"); break };
                    if controls.binding != self.binding { self.freeze("writer_superseded"); break }
                    revision = controls.revision;
                    self.observe_controls(&controls);
                    if self.refresh().await.is_err() { self.freeze("journal_unavailable"); break }
                }
            }
        }
    }

    fn boundary_rejection(
        &self,
        state: &TurnState,
        control: ControlRevision,
        history: HistoryPosition,
    ) -> Option<Error> {
        if self.frozen.load(Ordering::SeqCst)
            || !self.active.lock().expect("active lock").is_empty()
        {
            return Some(Error::new(ErrorKind::InvalidState, "work_still_running"));
        }
        if state.controls().revision != control || state.history().position() != history {
            return Some(Error::new(ErrorKind::Conflict, "stale_completion_basis"));
        }
        None
    }

    fn owner(self: &Arc<Self>, id: OperationId, controls: &ControlSnapshot) -> Result<Owner> {
        if !controls.admits_work() {
            return Err(Error::new(ErrorKind::InvalidState, "admission_closed"));
        }
        let admission = Arc::new(Admission {
            control: controls.revision,
            cancellation: self.cancellation.child_token(),
            interruption: Mutex::new(None),
        });
        let (finished, _) = watch::channel(false);
        self.active.lock().expect("active lock").insert(
            id.clone(),
            Active {
                admission: Arc::clone(&admission),
                finished,
            },
        );
        admission.observe(self.view.borrow().state.controls());
        self.publish_current();
        Ok(Owner {
            inner: Arc::clone(self),
            id,
            admission,
        })
    }

    async fn claim(self: &Arc<Self>, record: OperationRecord) -> Result<Claim> {
        loop {
            let serial = self.serial.lock().await;
            self.ensure_open()?;
            let state = self.refresh().await?;
            if let Some(existing) = state.operations().get(&record.id) {
                if existing.record != record {
                    return Err(Error::new(ErrorKind::Conflict, "operation_identity_reused"));
                }
                if let Some(outcome) = existing.outcome() {
                    return Ok(Claim::Completed(outcome.clone()));
                }
                let waiting = self
                    .active
                    .lock()
                    .expect("active lock")
                    .get(&record.id)
                    .map(|active| active.finished.subscribe());
                if let Some(mut waiting) = waiting {
                    drop(serial);
                    tokio::select! {
                        _ = waiting.changed() => continue,
                        _ = self.cancellation.cancelled() => return Err(Error::new(ErrorKind::InvalidState, "admission_closed")),
                    }
                }
                if existing.is_running() {
                    return Err(Error::new(
                        ErrorKind::Uncertain,
                        "operation_requires_recovery",
                    ));
                }
                return self.owner(record.id, state.controls()).map(Claim::Owner);
            }
            if state.operations().len() >= self.services.limits.max_operations {
                return Err(Error::new(ErrorKind::LimitExceeded, "operation_limit"));
            }
            self.commit_locked(
                phase_id(&record.id, "prepare", &())?,
                vec![JournalAction::prepare(record.clone())],
            )
            .await?;
            let controls = self.view.borrow().state.controls().clone();
            return self.owner(record.id, &controls).map(Claim::Owner);
        }
    }

    async fn apply(&self, id: ChangeId, actions: Vec<JournalAction>) -> Result<CommitReceipt> {
        let _serial = self.serial.lock().await;
        self.commit_locked(id, actions).await
    }

    async fn commit_locked(
        &self,
        id: ChangeId,
        actions: Vec<JournalAction>,
    ) -> Result<CommitReceipt> {
        self.commit_with_basis(id, actions, None).await
    }

    async fn commit_with_basis(
        &self,
        id: ChangeId,
        actions: Vec<JournalAction>,
        basis: Option<CommitBasis<'_>>,
    ) -> Result<CommitReceipt> {
        let fingerprint = Fingerprint::of(&actions)?;
        let lease = self.lease()?;
        for _ in 0..8 {
            if let Some(receipt) = lease
                .journal()
                .lookup(id.clone())
                .await
                .map_err(|_| self.freeze("journal_lookup_unavailable"))?
            {
                if receipt.record().content_fingerprint != fingerprint {
                    return Err(Error::new(ErrorKind::Conflict, "change_identity_reused"));
                }
                self.refresh().await?;
                return Ok(receipt);
            }
            let state = self.refresh().await?;
            match &basis {
                Some(CommitBasis::Completion(control, history))
                    if state.controls().revision != *control
                        || state.history().position() != *history =>
                {
                    return Err(Error::new(ErrorKind::Conflict, "stale_completion_basis"));
                }
                Some(CommitBasis::Admission(admission)) => admission.check(state.controls())?,
                _ => {}
            }
            let change = JournalChange::new(
                id.clone(),
                state.binding().clone(),
                state.position(),
                state.controls().revision,
                actions.clone(),
            )?;
            match lease.journal().commit(change).await {
                Ok(receipt) => {
                    if receipt.record().change != id
                        || receipt.record().content_fingerprint != fingerprint
                    {
                        return Err(self.freeze("invalid_commit_receipt"));
                    }
                    let state = self.refresh().await?;
                    if state.receipt(&id) != Some(&receipt) {
                        return Err(self.freeze("commit_not_visible"));
                    }
                    return Ok(receipt);
                }
                Err(error)
                    if error.kind == ErrorKind::Conflict
                        && !matches!(basis, Some(CommitBasis::Completion(..))) =>
                {
                    continue;
                }
                Err(error) if error.kind == ErrorKind::Conflict => {
                    self.refresh().await?;
                    return Err(error);
                }
                Err(error)
                    if error.kind == ErrorKind::Uncertain
                        || error.kind == ErrorKind::Unavailable =>
                {
                    if let Ok(Some(receipt)) = lease.journal().lookup(id.clone()).await
                        && receipt.record().content_fingerprint == fingerprint
                    {
                        self.refresh().await?;
                        return Ok(receipt);
                    }
                    return Err(self.freeze("commit_outcome_unknown"));
                }
                Err(error) => return Err(error),
            }
        }
        Err(Error::new(
            ErrorKind::Conflict,
            "journal_changed_repeatedly",
        ))
    }

    async fn authorize(
        &self,
        record: &OperationRecord,
        admission: &Admission,
        deadline: Instant,
    ) -> Result<()> {
        self.ensure_open()?;
        admission.ensure_pending()?;
        let result = tokio::select! {
            biased;
            _ = admission.cancellation.cancelled() => Err(Error::new(ErrorKind::InvalidState, admission.cancellation_code())),
            result = self.services.authority.validate(AuthorityRequest {
                operation: record.id.clone(), action: record.input.fingerprint(), selection: record.grants.clone(),
            }) => result,
            _ = tokio::time::sleep_until(deadline.into()) => Err(Error::new(ErrorKind::LimitExceeded, "deadline")),
        };
        result?;
        let lease = self.lease()?;
        let controls = lease.controls().read().await?;
        if controls.binding != self.binding {
            return Err(self.freeze("writer_superseded"));
        }
        admission.check(&controls)?;
        self.ensure_open()
    }

    async fn start_attempt(&self, owner: &Owner) -> Result<AttemptId> {
        let _serial = self.serial.lock().await;
        self.ensure_open()?;
        let id = &owner.id;
        let attempt = AttemptId::new(fingerprint_name("attempt", &(id, 0_u64))?)?;
        self.commit_with_basis(
            phase_id(id, "start", &attempt)?,
            vec![JournalAction::StartAttempt {
                operation: id.clone(),
                attempt: attempt.clone(),
            }],
            Some(CommitBasis::Admission(&owner.admission)),
        )
        .await?;
        Ok(attempt)
    }

    async fn reject(&self, id: &OperationId, outcome: OperationOutcome) -> Result<()> {
        self.apply(
            phase_id(id, "reject", &outcome)?,
            vec![JournalAction::RejectPrepared {
                operation: id.clone(),
                outcome: outcome.clone(),
            }],
        )
        .await?;
        let _ = self.events.send(TurnUpdate::Operation {
            operation: id.clone(),
            outcome,
        });
        Ok(())
    }

    async fn complete(
        &self,
        id: &OperationId,
        attempt: &AttemptId,
        outcome: OperationOutcome,
    ) -> Result<()> {
        self.apply(
            phase_id(id, "complete", attempt)?,
            vec![JournalAction::CompleteAttempt {
                operation: id.clone(),
                attempt: attempt.clone(),
                outcome: outcome.clone(),
            }],
        )
        .await?;
        let _ = self.events.send(TurnUpdate::Operation {
            operation: id.clone(),
            outcome,
        });
        Ok(())
    }
}

pub(crate) fn fingerprint_name(prefix: &str, value: &impl Serialize) -> Result<String> {
    let fingerprint = Fingerprint::of(value)?;
    let mut name = format!("{prefix}_");
    for byte in fingerprint.bytes() {
        use std::fmt::Write;
        write!(&mut name, "{byte:02x}").expect("string formatting");
    }
    Ok(name)
}

fn phase_id(value: &impl Serialize, phase: &str, content: &impl Serialize) -> Result<ChangeId> {
    ChangeId::new(fingerprint_name("change", &(value, phase, content))?)
}

fn change_id(inner: &Inner, key: &OperationKey, phase: &str) -> Result<ChangeId> {
    phase_id(&(&inner.binding.session, &inner.binding.turn), phase, key)
}
