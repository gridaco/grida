//! GRIDA-SEC-004 — Host-owned timers for durable one-shot task wake-ups.

use super::*;
use agent_kit_core::tools::{InventorySnapshot, Tool};
use agent_kit_core::turn::{OperationInput, TurnBinding, TurnState, WaitRecord};
use agent_kit_core::{CancellationToken, GrantId, ToolId, WaitId};
use agent_kit_runtime::TurnOperations;
use grida_agent_master::wakeups::{
    Delivery, Resolution, WakeupDisposition, WakeupTool, defer_for_wakeup, is_wakeup,
    prepare_delivery, read_disposition, read_wakeup,
};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_TIMERS: usize = 128;
const RETRY_DELAY: Duration = Duration::from_millis(100);
const WALL_CLOCK_RECHECK: Duration = Duration::from_secs(30);

pub(super) type TimerOwners = BTreeMap<(SessionId, TurnId), Arc<CancellationToken>>;

pub(super) struct WakeupAccess {
    host: Host,
    binding: TurnBinding,
    selection: GrantSelection,
}

impl WakeupAccess {
    pub(super) fn bind(host: Host, binding: &TurnBinding) -> Result<Arc<Self>> {
        let identity = Fingerprint::of(&(&binding.session, &binding.turn))?;
        let id = uuid::Uuid::from_bytes(
            identity.bytes()[..16]
                .try_into()
                .expect("fingerprint prefix"),
        );
        Ok(Arc::new(Self {
            host,
            binding: binding.clone(),
            selection: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("grida-local")?,
                    binding: BindingId::new(format!("wakeup/{id}"))?,
                    scope: ScopeId::new("local-task-wakeup")?,
                },
                grants: vec![GrantId::new("request-wakeup")?],
            },
        }))
    }

    pub(super) fn accepts(&self, selection: &GrantSelection) -> bool {
        &self.selection == selection
    }

    pub(super) fn insert(
        &self,
        operations: TurnOperations,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        let tool = WakeupTool::new(operations)?;
        grants.insert(tool.definition().id.clone(), self.selection.clone());
        inventory.insert(Arc::new(tool))
    }

    pub(super) async fn reconcile(
        &self,
        operations: &TurnOperations,
        tools: &InventorySnapshot,
    ) -> Result<()> {
        let view = operations.view();
        let Some(wait) = view
            .state
            .waits()
            .values()
            .find(|wait| is_wakeup(wait) && wait.answer.is_some())
        else {
            return Ok(());
        };
        let schedule = read_wakeup(wait)?;
        let Some(operation) = view.operation(&schedule.operation) else {
            return Err(unavailable());
        };
        if !(operation.is_running() || operation.is_uncertain()) {
            return Ok(());
        }
        let OperationInput::Tool(invocation) = &operation.record.input else {
            return Err(unavailable());
        };
        if !self.accepts(&operation.record.grants) || tools.restore(invocation.clone()).is_err() {
            return Err(unavailable());
        }
        if let Err(error) = operations
            .reconcile_tool(schedule.operation, tools.clone())
            .await
            && operations.view().state.controls().admits_work()
        {
            return Err(error);
        }
        Ok(())
    }
}

impl ToolGate for WakeupAccess {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            if !self.accepts(&admission.grants)
                || context.operations.view().state.binding() != &self.binding
                || admission.invocation.definition().id.as_str() != "request_wakeup"
            {
                return Err(unavailable());
            }
            let key = (self.binding.session.clone(), self.binding.turn.clone());
            let mut work = self.host.work.lock().await;
            let new = !context
                .operations
                .view()
                .state
                .waits()
                .values()
                .any(is_wakeup);
            // Keep the bounded timer reservation and durable registration in
            // the same host critical section. Store commit still owns the wait.
            if new {
                work.check_timer(&key)?;
            }
            let decision = defer_for_wakeup(&admission, &context.operations, now_ms()?)
                .await?
                .ok_or_else(unavailable)?;
            if new && let ToolDecision::Defer(wait) = &decision {
                self.host.start_timer(&mut work, key, wait.clone());
            }
            Ok(decision)
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wakeups {
    pub session_id: SessionId,
    pub turn_id: TurnId,
    pub control_revision: ControlRevision,
    pub wakeup: Option<ScheduledWakeup>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledWakeup {
    pub wait_id: WaitId,
    pub due_at_ms: u64,
    pub reason: String,
    pub status: WakeupStatus,
    pub armed: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WakeupStatus {
    Waiting,
    Paused,
    Delivered,
    Cancelled,
    Stopped,
}

fn inspect(state: &TurnState) -> Result<Wakeups> {
    let wakeup = state
        .waits()
        .values()
        .find(|wait| is_wakeup(wait))
        .map(|wait| {
            let schedule = read_wakeup(wait)?;
            if schedule.session != state.binding().session || schedule.turn != state.binding().turn
            {
                return Err(unavailable());
            }
            let status = match read_disposition(wait)? {
                Some(WakeupDisposition::Due) => WakeupStatus::Delivered,
                Some(WakeupDisposition::Cancelled) => WakeupStatus::Cancelled,
                None if wait.withdrawn
                    || state.controls().cancelled
                    || state.outcome().is_some() =>
                {
                    WakeupStatus::Stopped
                }
                None if state.controls().paused => WakeupStatus::Paused,
                None => WakeupStatus::Waiting,
            };
            Ok(ScheduledWakeup {
                wait_id: wait.id.clone(),
                due_at_ms: schedule.due_at_ms,
                reason: schedule.request.reason,
                status,
                armed: false,
            })
        })
        .transpose()?;
    Ok(Wakeups {
        session_id: state.binding().session.clone(),
        turn_id: state.binding().turn.clone(),
        control_revision: state.controls().revision,
        wakeup,
    })
}

pub(super) fn was_delivered(wait: &WaitRecord) -> bool {
    is_wakeup(wait) && matches!(read_disposition(wait), Ok(Some(WakeupDisposition::Due)))
}

impl Work {
    fn check_timer(&self, key: &(SessionId, TurnId)) -> Result<()> {
        if self.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        if self.retiring.contains(&key.0) {
            return Err(problem(ErrorKind::Conflict, "session_deletion_in_progress"));
        }
        if self.timers.len() >= MAX_TIMERS && !self.timers.contains_key(key) {
            return Err(problem(ErrorKind::LimitExceeded, "host_wakeup_limit"));
        }
        Ok(())
    }

    pub(super) fn release_timer(&mut self, session: &SessionId, turn: &TurnId) {
        if let Some(timer) = self.timers.remove(&(session.clone(), turn.clone())) {
            timer.cancel();
        }
    }
}

impl Host {
    pub async fn wakeups(&self, session: SessionId, turn: TurnId) -> Result<Wakeups> {
        let key = (session.clone(), turn.clone());
        let mut status = self.store.inspect_turn_with(session, turn, inspect).await?;
        if let Some(wakeup) = &mut status.wakeup {
            wakeup.armed = self.work.lock().await.timers.contains_key(&key);
        }
        Ok(status)
    }

    pub async fn recover_wakeup(
        &self,
        session: SessionId,
        turn: TurnId,
        wait: WaitId,
    ) -> Result<Wakeups> {
        self.owned_control(move |host| async move {
            let view = host.store.inspect(session.clone()).await?;
            host.check_execution(&view)?;
            let mut scheduled = host.wakeups(session.clone(), turn.clone()).await?;
            let schedule = scheduled
                .wakeup
                .as_mut()
                .filter(|schedule| schedule.wait_id == wait)
                .ok_or_else(unavailable)?;
            if matches!(
                schedule.status,
                WakeupStatus::Cancelled | WakeupStatus::Stopped
            ) {
                return Err(unavailable());
            }
            if !view
                .current
                .as_ref()
                .is_some_and(|current| current.binding.turn == turn)
            {
                return if schedule.status == WakeupStatus::Delivered {
                    Ok(scheduled)
                } else {
                    Err(unavailable())
                };
            }
            if view
                .current
                .as_ref()
                .is_some_and(|current| current.disposition == TurnDisposition::Interrupted)
            {
                return Err(problem(
                    ErrorKind::Unavailable,
                    "wakeup_task_recovery_required",
                ));
            }
            let key = (session, turn);
            let mut work = host.work.lock().await;
            work.check_timer(&key)?;
            host.start_timer(&mut work, key, wait);
            schedule.armed = true;
            Ok(scheduled)
        })
        .await
    }

    pub async fn cancel_wakeup(
        &self,
        session: SessionId,
        turn: TurnId,
        wait: WaitId,
    ) -> Result<Wakeups> {
        self.owned_control(move |host| async move {
            let revision = host.store.inspect(session.clone()).await?.revision;
            let expected = wait.clone();
            let plan = host
                .store
                .inspect_turn_with(session.clone(), turn.clone(), move |state| {
                    prepare_delivery(state, &expected, WakeupDisposition::Cancelled, 0)
                })
                .await?;
            match plan {
                Delivery::Resolve(plan) => {
                    host.resolve_wakeup(&session, &turn, revision, plan, None)
                        .await?
                }
                Delivery::AlreadyResolved => {}
                _ => return Err(unavailable()),
            }
            host.release_timer(&session, &turn).await;
            host.wakeups(session, turn).await
        })
        .await
    }

    /// Continue an unpaused suspension after explicit cancellation of its
    /// exact timer. Cancelling the timer itself never admits continuation.
    pub(crate) async fn resume_cancelled_wakeup(
        &self,
        control: TurnControl,
        epoch: u64,
        position: JournalPosition,
        wait: WaitId,
    ) -> Result<TurnView> {
        let revision = control.expected_control;
        // Ordinary resume already binds epoch, journal position and session
        // revision. Include the wake-up and control basis in its receipt key.
        let identity = Fingerprint::of(&(
            "continue-cancelled-wakeup",
            &control.request,
            &wait,
            revision,
        ))?;
        let key: String = identity
            .bytes()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        let request = ClaimRequest {
            id: ChangeId::new(format!("cancelled-wakeup/{key}"))?,
            session: control.session.clone(),
            expected_revision: control.expected_session,
            selection: TurnSelection::Resume {
                turn: control.turn.clone(),
                epoch,
                position,
            },
        };
        let ready = self
            .store
            .inspect_turn_with(control.session, control.turn.clone(), move |state| {
                let record = state
                    .waits()
                    .get(&wait)
                    .filter(|record| is_wakeup(record))
                    .ok_or_else(unavailable)?;
                let scheduled = read_wakeup(record)?;
                if scheduled.session != state.binding().session
                    || scheduled.turn != state.binding().turn
                    || read_disposition(record)? != Some(WakeupDisposition::Cancelled)
                {
                    return Err(unavailable());
                }
                Ok(state.is_suspended()
                    && state.controls().admits_work()
                    && state.controls().revision == revision
                    && state.position() == position
                    && state.binding().epoch == epoch
                    && state.waits().values().all(|wait| !wait.is_pending())
                    && state
                        .operations()
                        .get(&scheduled.operation)
                        .is_some_and(|operation| operation.outcome().is_none()))
            })
            .await?;
        if !ready {
            return self.store.claim_receipt(request).await?.ok_or_else(|| {
                problem(ErrorKind::Conflict, "cancelled_wakeup_resume_unavailable")
            });
        }
        self.resume_claim(request, control.turn).await
    }

    pub(super) async fn release_timer(&self, session: &SessionId, turn: &TurnId) {
        self.work.lock().await.release_timer(session, turn);
    }

    fn start_timer(&self, work: &mut Work, key: (SessionId, TurnId), wait: WaitId) {
        if work.timers.contains_key(&key) {
            return;
        }
        let token = Arc::new(CancellationToken::new());
        work.timers.insert(key.clone(), token.clone());
        self.workers.fetch_add(1, Ordering::Relaxed);
        let lifetime = WorkerLifetime {
            workers: self.workers.clone(),
            changed: self.changed.clone(),
        };
        let host = self.clone();
        tokio::spawn(async move {
            let _lifetime = lifetime;
            host.run_timer(&key, &wait, &token).await;
            let mut work = host.work.lock().await;
            if work
                .timers
                .get(&key)
                .is_some_and(|timer| Arc::ptr_eq(timer, &token))
            {
                work.timers.remove(&key);
            }
        });
    }

    async fn run_timer(&self, key: &(SessionId, TurnId), wait: &WaitId, token: &CancellationToken) {
        let (session, turn) = key;
        while !token.is_cancelled() {
            let changed = self.changed.notified();
            let action = self.timer_action(session, turn, wait, token).await;
            match action {
                Ok(TimerAction::Done) => return,
                Ok(TimerAction::WaitForControl) => tokio::select! {
                    () = token.cancelled() => return,
                    () = changed => {},
                },
                Ok(TimerAction::Sleep(duration)) => tokio::select! {
                    () = token.cancelled() => return,
                    () = tokio::time::sleep(duration) => {},
                },
                Err(error)
                    if error.kind == ErrorKind::Uncertain
                        || matches!(
                            error.code.as_str(),
                            "stale_session_revision"
                                | "stale_journal_change"
                                | "host_ready_queue_limit"
                        ) =>
                {
                    tokio::select! {
                        () = token.cancelled() => return,
                        () = tokio::time::sleep(RETRY_DELAY) => {},
                    }
                }
                Err(_) => return,
            }
        }
    }

    async fn timer_action(
        &self,
        session: &SessionId,
        turn: &TurnId,
        wait: &WaitId,
        token: &CancellationToken,
    ) -> Result<TimerAction> {
        let view = self.store.inspect(session.clone()).await?;
        if !view.current.as_ref().is_some_and(|current| {
            &current.binding.turn == turn && current.disposition != TurnDisposition::Interrupted
        }) {
            return Ok(TimerAction::Done);
        }
        self.check_execution(&view)?;
        let now = now_ms()?;
        let wait = wait.clone();
        let step = self
            .store
            .inspect_turn_with(session.clone(), turn.clone(), move |state| {
                let record = state.waits().get(&wait).ok_or_else(unavailable)?;
                if state.controls().cancelled
                    || state.outcome().is_some()
                    || record.withdrawn
                    || read_disposition(record)? == Some(WakeupDisposition::Cancelled)
                {
                    return Ok(TimerStep::Done);
                }
                if state.controls().paused {
                    return Ok(TimerStep::Paused);
                }
                Ok(
                    match prepare_delivery(state, &wait, WakeupDisposition::Due, now)? {
                        Delivery::NotDue => {
                            TimerStep::Sleep(clock_delay(now, read_wakeup(record)?.due_at_ms))
                        }
                        Delivery::Paused => TimerStep::Paused,
                        Delivery::Resolve(plan) => TimerStep::Resolve(plan),
                        Delivery::AlreadyResolved
                            if state.waits().values().all(|wait| !wait.is_pending()) =>
                        {
                            TimerStep::Wake(state.position())
                        }
                        Delivery::AlreadyResolved => TimerStep::Done,
                    },
                )
            })
            .await?;
        match step {
            TimerStep::Done => Ok(TimerAction::Done),
            TimerStep::Paused => Ok(TimerAction::WaitForControl),
            TimerStep::Sleep(duration) => Ok(TimerAction::Sleep(duration)),
            TimerStep::Resolve(plan) => {
                self.resolve_wakeup(session, turn, view.revision, plan, Some(token))
                    .await?;
                Ok(TimerAction::Done)
            }
            TimerStep::Wake(position) => {
                let mut work = self.work.lock().await;
                if token.is_cancelled() {
                    return Ok(TimerAction::Done);
                }
                work.check_answer_capacity(session, turn)?;
                work.queue_answered(session.clone(), turn.clone(), position);
                drop(work);
                self.wake_ready().await;
                Ok(TimerAction::Done)
            }
        }
    }

    async fn resolve_wakeup(
        &self,
        session: &SessionId,
        turn: &TurnId,
        revision: SessionRevision,
        plan: Resolution,
        timer: Option<&CancellationToken>,
    ) -> Result<()> {
        let expected = plan.expected_control;
        self.resolve_interaction(
            TurnControl {
                session: session.clone(),
                turn: turn.clone(),
                request: plan.request,
                expected_session: revision,
                expected_control: expected,
            },
            SessionControl::Resolve {
                turn: turn.clone(),
                expected,
                wait: plan.wait,
                answer: plan.answer,
            },
            plan.can_wake,
            timer,
        )
        .await?;
        Ok(())
    }
}

enum TimerStep {
    Done,
    Paused,
    Sleep(Duration),
    Resolve(Resolution),
    Wake(JournalPosition),
}

enum TimerAction {
    Done,
    WaitForControl,
    Sleep(Duration),
}

fn clock_delay(now_ms: u64, due_at_ms: u64) -> Duration {
    // The persisted deadline uses wall time, while the sleep uses a monotonic
    // clock that may stop during system suspend. Recheck before sleeping again.
    Duration::from_millis(due_at_ms.saturating_sub(now_ms)).min(WALL_CLOCK_RECHECK)
}

fn now_ms() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
        .ok_or_else(|| problem(ErrorKind::Unavailable, "wakeup_clock_unavailable"))
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "wakeup_unavailable")
}
