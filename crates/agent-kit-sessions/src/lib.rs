//! Durable submissions and exclusive turn ownership around an injected driver.

use agent_kit_core::driver_state::{DriverStateChange, DriverStateRevision, DriverStateSnapshot};
use agent_kit_core::history::{HistoryPosition, HistoryRecord};
use agent_kit_core::turn::{
    CommitReceipt, ControlDirective, ControlRevision, ControlSnapshot, JournalPosition,
    SettlementReceipt, SuspensionReceipt, TurnBinding, TurnLease, TurnOutcome,
};
use agent_kit_core::{
    BoxFuture, ChangeId, Envelope, Error, ErrorKind, Result, SessionId, TurnId, WaitId,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// A session's committed revision. It advances whenever the session's
/// admission, queue, driver state or active turn changes, so a caller can make
/// a change conditional on the state it observed.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionRevision(pub u64);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// Create a session with owner-defined configuration. Repeating the same
/// request identity with the same content returns the original result.
pub struct CreateSession {
    /// The new session's identity; it must not already exist.
    pub id: SessionId,
    /// The request identity used to recognize an exact retry.
    pub request: ChangeId,
    /// Configuration carried into every turn claimed in this session.
    pub configuration: Envelope,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// A created session and its initial revision.
pub struct SessionCreated {
    pub session: SessionId,
    pub revision: SessionRevision,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// One immutable input offered to a session.
pub struct Submission {
    /// The input's identity within its session; resubmitting it with the
    /// same payload is recognized as a retry.
    pub id: ChangeId,
    /// Owner-defined content, retained unchanged.
    pub payload: Envelope,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// A durably accepted input and its order of acceptance in the session.
pub struct Acceptance {
    pub session: SessionId,
    pub input: ChangeId,
    /// Monotonic acceptance order within the session.
    pub position: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
/// Where an accepted input stands.
pub enum InputDisposition {
    /// Waiting for a turn to select it.
    Queued,
    /// Selected by a turn that has not settled.
    Claimed { turn: TurnId },
    /// Selected by a turn that has settled.
    Completed { turn: TurnId },
    /// Replaced in the queue by another input before any turn selected it.
    Superseded { replacement: ChangeId },
    /// Removed from the queue before any turn selected it.
    Withdrawn,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// An accepted input with its acceptance order and disposition.
pub struct InputView {
    pub input: Submission,
    pub position: u64,
    pub disposition: InputDisposition,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
/// The turn a claim acquires.
pub enum TurnSelection {
    /// Start a new turn over these queued inputs, in this order.
    New { turn: TurnId, inputs: Vec<ChangeId> },
    /// Resume a suspended turn exactly as last observed: same writer epoch
    /// and journal position. The claim takes the next writer epoch.
    Resume {
        turn: TurnId,
        epoch: u64,
        position: JournalPosition,
    },
    /// Resume a suspended, paused turn as last observed, lifting its pause in
    /// the same commit. Its control revision must also be unchanged.
    ResumePaused {
        turn: TurnId,
        epoch: u64,
        position: JournalPosition,
        control_revision: ControlRevision,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// Acquire exclusive ownership of a turn, conditional on the session
/// revision. An exact retry returns the existing turn instead of a new lease.
pub struct ClaimRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub expected_revision: SessionRevision,
    pub selection: TurnSelection,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// Reacquire an interrupted turn whose owner is gone, conditional on the
/// writer epoch last observed. The recovered owner takes the next epoch.
pub struct RecoveryRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub turn: TurnId,
    pub expected_epoch: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// A control directive for the session's active turn, conditional on the
/// turn's control revision.
pub struct TurnControl {
    pub turn: TurnId,
    pub expected: ControlRevision,
    pub directive: ControlDirective,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
/// One change to a session's admission, queue, active turn or driver state.
/// Changes that name a turn apply only to the session's active turn and only
/// at the expected control revision.
pub enum SessionControl {
    /// Stop new turns from being claimed; queued inputs stay queued.
    PauseAdmission,
    /// Allow new turns to be claimed again.
    ResumeAdmission,
    /// Replace a queued input with a new one at the same queue position.
    ReplaceQueued {
        input: ChangeId,
        replacement: Submission,
    },
    /// Remove a queued input from the queue.
    WithdrawQueued { input: ChangeId },
    /// Put exactly the queued inputs in this order.
    ReorderQueued { inputs: Vec<ChangeId> },
    /// Append records to the active turn's history, provided its history has
    /// not moved past the expected position.
    AppendHistory {
        turn: TurnId,
        expected: ControlRevision,
        expected_history: HistoryPosition,
        records: Vec<HistoryRecord>,
    },
    /// Apply a control directive to the active turn.
    Turn {
        turn: TurnId,
        expected: ControlRevision,
        directive: ControlDirective,
    },
    /// Answer one of the active turn's waits.
    Resolve {
        turn: TurnId,
        expected: ControlRevision,
        wait: WaitId,
        answer: Envelope,
    },
    /// Answer a wait and append history records in one commit, under the
    /// same history-position condition as `AppendHistory`.
    ResolveAndAppend {
        turn: TurnId,
        expected: ControlRevision,
        expected_history: HistoryPosition,
        wait: WaitId,
        answer: Envelope,
        records: Vec<HistoryRecord>,
    },
    /// Pause admission and cancel the active turn in one commit.
    PauseAndCancel {
        turn: TurnId,
        expected: ControlRevision,
    },
    /// Change driver-owned state. With an active turn, this must carry its exact
    /// control so admission and the state transition observe the same commit.
    DriverState {
        change: DriverStateChange,
        turn: Option<TurnControl>,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
/// A session control, conditional on the session revision. An exact retry
/// returns the original receipt.
pub struct ControlRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub expected_revision: SessionRevision,
    pub action: SessionControl,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
/// The committed result of a session control.
pub struct ControlReceipt {
    pub session: SessionId,
    pub request: ChangeId,
    /// The session revision after the control.
    pub revision: SessionRevision,
    /// The turn journal's receipt when the control changed a turn.
    pub turn: Option<CommitReceipt>,
    /// The new driver-state revision when the control changed driver state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub driver_state_revision: Option<DriverStateRevision>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
/// Whether a turn can still make progress, and who may drive it.
pub enum TurnDisposition {
    /// A live owner holds the turn's lease.
    Running,
    /// Stopped durably until a claim resumes it.
    Suspended,
    /// Unsettled with no live owner; recovery may reacquire it.
    Interrupted,
    /// Finished with a recorded outcome.
    Settled,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
/// A committed turn as observers see it, without its operations or messages.
pub struct TurnView {
    pub binding: TurnBinding,
    pub position: JournalPosition,
    pub history_position: HistoryPosition,
    pub controls: ControlSnapshot,
    pub disposition: TurnDisposition,
    pub outcome: Option<TurnOutcome>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
/// A session's committed state: admission, queue, and its current and most
/// recent turns, read together.
pub struct SessionView {
    pub session: SessionId,
    pub revision: SessionRevision,
    pub configuration: Envelope,
    #[serde(default, skip_serializing_if = "DriverStateSnapshot::is_initial")]
    pub driver_state: DriverStateSnapshot,
    pub admission_paused: bool,
    /// Queued inputs in queue order.
    pub queued: Vec<InputView>,
    /// The active turn, while one is unsettled.
    pub current: Option<TurnView>,
    /// The most recently created turn, whether or not it settled.
    pub latest: Option<TurnView>,
}

/// A newly acquired turn: the session configuration, the inputs it selected
/// and the exclusive lease over its journal.
pub struct ClaimedTurn {
    pub configuration: Envelope,
    pub inputs: Vec<Submission>,
    pub lease: TurnLease,
}

/// The result of a claim or recovery.
pub enum ClaimOutcome {
    /// This caller now owns the turn.
    Acquired(ClaimedTurn),
    /// An exact retry of an earlier claim: the turn as it now stands. No
    /// lease is issued.
    Existing(TurnView),
}

/// A persistence adapter atomically owns input, claims, controls, and turn journals.
pub trait SessionStore: Send + Sync {
    /// Create a session.
    fn create(&self, request: CreateSession) -> BoxFuture<'_, Result<SessionCreated>>;
    /// Durably accept an input into the session's queue.
    fn submit(&self, session: SessionId, input: Submission) -> BoxFuture<'_, Result<Acceptance>>;
    /// Acquire the selected turn, or observe it again for an exact retry.
    fn claim(&self, request: ClaimRequest) -> BoxFuture<'_, Result<ClaimOutcome>>;
    /// Reacquire an interrupted turn.
    fn recover(&self, request: RecoveryRequest) -> BoxFuture<'_, Result<ClaimOutcome>>;
    /// Apply one session control atomically.
    fn control(&self, request: ControlRequest) -> BoxFuture<'_, Result<ControlReceipt>>;
    /// Read the session's committed state.
    fn inspect(&self, session: SessionId) -> BoxFuture<'_, Result<SessionView>>;
    /// Read one committed turn.
    fn inspect_turn(&self, session: SessionId, turn: TurnId) -> BoxFuture<'_, Result<TurnView>>;
    /// Succeed only if this exact receipt is committed in its turn's journal.
    fn verify(&self, receipt: CommitReceipt) -> BoxFuture<'_, Result<()>>;
}

/// How a driver left the turn it ran, with the journal receipt proving it.
pub enum DriverOutcome {
    Settled(SettlementReceipt),
    Suspended(SuspensionReceipt),
}

/// Runs one claimed turn until it settles or suspends.
pub trait TurnDriver: Send + Sync {
    /// Drive the turn through its lease. The returned receipt must belong to
    /// this lease and be committed.
    fn run(&self, claim: ClaimedTurn) -> BoxFuture<'static, Result<DriverOutcome>>;
}

/// The result of running a claimed turn.
#[derive(Clone, Debug, PartialEq)]
pub enum RunDisposition {
    /// The driver settled the turn; the receipt is verified as committed.
    Settled(SettlementReceipt),
    /// The driver suspended the turn; the receipt is verified as committed.
    Suspended(SuspensionReceipt),
    /// The claim was an exact retry, or the driver failed after the turn had
    /// already settled or suspended: the turn as it now stands.
    Existing(TurnView),
}

/// Service coordination without provider, Runtime, or scheduling dependencies.
pub struct Sessions {
    store: Arc<dyn SessionStore>,
    driver: Arc<dyn TurnDriver>,
}

impl Sessions {
    /// Coordinate this store with this driver.
    pub fn new(store: Arc<dyn SessionStore>, driver: Arc<dyn TurnDriver>) -> Self {
        Self { store, driver }
    }

    /// Create a session.
    pub async fn create(&self, request: CreateSession) -> Result<SessionCreated> {
        self.store.create(request).await
    }

    /// Durably accept an input.
    pub async fn submit(&self, session: SessionId, input: Submission) -> Result<Acceptance> {
        self.store.submit(session, input).await
    }

    /// Apply one session control.
    pub async fn control(&self, request: ControlRequest) -> Result<ControlReceipt> {
        self.store.control(request).await
    }

    /// Read the session's committed state.
    pub async fn inspect(&self, session: SessionId) -> Result<SessionView> {
        self.store.inspect(session).await
    }

    /// Claim the selected turn and run it with the driver.
    pub async fn run_selected(&self, request: ClaimRequest) -> Result<RunDisposition> {
        self.drive(self.store.claim(request).await?).await
    }

    /// Recover an interrupted turn and run it with the driver.
    pub async fn recover(&self, request: RecoveryRequest) -> Result<RunDisposition> {
        self.drive(self.store.recover(request).await?).await
    }

    async fn drive(&self, outcome: ClaimOutcome) -> Result<RunDisposition> {
        let claim = match outcome {
            ClaimOutcome::Acquired(claim) => claim,
            ClaimOutcome::Existing(view) => return Ok(RunDisposition::Existing(view)),
        };
        let binding = claim.lease.binding().clone();
        let (receipt, disposition) = match self.driver.run(claim).await {
            Ok(DriverOutcome::Settled(receipt)) => (
                CommitReceipt::Settled(receipt.clone()),
                RunDisposition::Settled(receipt),
            ),
            Ok(DriverOutcome::Suspended(receipt)) => (
                CommitReceipt::Suspended(receipt.clone()),
                RunDisposition::Suspended(receipt),
            ),
            Err(error) => {
                // A turn that reached a durable stop despite the failure is
                // reported as it stands; otherwise the driver's error is kept,
                // even when the turn cannot be inspected.
                return match self.store.inspect_turn(binding.session, binding.turn).await {
                    Ok(view)
                        if matches!(
                            view.disposition,
                            TurnDisposition::Settled | TurnDisposition::Suspended
                        ) =>
                    {
                        Ok(RunDisposition::Existing(view))
                    }
                    _ => Err(error),
                };
            }
        };
        // A receipt for another turn or writer is refused before the store is
        // asked whether it committed.
        if receipt.record().binding != binding {
            return Err(Error::new(
                ErrorKind::Conflict,
                "driver_receipt_binding_mismatch",
            ));
        }
        self.store.verify(receipt).await?;
        Ok(disposition)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::Fingerprint;
    use agent_kit_core::SchemaId;
    use agent_kit_core::messages::OutcomeStatus;
    use agent_kit_core::turn::{EphemeralJournal, RecordedPosition};
    use std::future::Future;
    use std::sync::Mutex;
    use std::task::{Context, Poll, Waker};

    /// Every future here is ready on its first poll.
    fn ready<T>(future: impl Future<Output = T>) -> T {
        let mut future = std::pin::pin!(future);
        match future
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()))
        {
            Poll::Ready(value) => value,
            Poll::Pending => panic!("fixture futures complete immediately"),
        }
    }

    fn binding(turn: &str) -> TurnBinding {
        TurnBinding {
            session: SessionId::new("session").unwrap(),
            turn: TurnId::new(turn).unwrap(),
            epoch: 1,
        }
    }

    fn refused<T>(code: &'static str) -> BoxFuture<'static, Result<T>> {
        Box::pin(async move { Err(Error::new(ErrorKind::Unavailable, code)) })
    }

    /// Issues one lease, cannot inspect turns, and has committed nothing.
    struct Store {
        lease: Mutex<Option<TurnLease>>,
    }

    impl SessionStore for Store {
        fn create(&self, _: CreateSession) -> BoxFuture<'_, Result<SessionCreated>> {
            refused("unused")
        }
        fn submit(&self, _: SessionId, _: Submission) -> BoxFuture<'_, Result<Acceptance>> {
            refused("unused")
        }
        fn claim(&self, _: ClaimRequest) -> BoxFuture<'_, Result<ClaimOutcome>> {
            let lease = self.lease.lock().unwrap().take().unwrap();
            Box::pin(async move {
                Ok(ClaimOutcome::Acquired(ClaimedTurn {
                    configuration: Envelope::new(SchemaId::new("fixture").unwrap(), 1, vec![])
                        .unwrap(),
                    inputs: vec![],
                    lease,
                }))
            })
        }
        fn recover(&self, _: RecoveryRequest) -> BoxFuture<'_, Result<ClaimOutcome>> {
            refused("unused")
        }
        fn control(&self, _: ControlRequest) -> BoxFuture<'_, Result<ControlReceipt>> {
            refused("unused")
        }
        fn inspect(&self, _: SessionId) -> BoxFuture<'_, Result<SessionView>> {
            refused("unused")
        }
        fn inspect_turn(&self, _: SessionId, _: TurnId) -> BoxFuture<'_, Result<TurnView>> {
            refused("store_unavailable")
        }
        fn verify(&self, _: CommitReceipt) -> BoxFuture<'_, Result<()>> {
            Box::pin(async { Err(Error::new(ErrorKind::Conflict, "receipt_not_committed")) })
        }
    }

    struct Driver(Box<dyn Fn() -> Result<DriverOutcome> + Send + Sync>);

    impl TurnDriver for Driver {
        fn run(&self, _: ClaimedTurn) -> BoxFuture<'static, Result<DriverOutcome>> {
            let outcome = (self.0)();
            Box::pin(async move { outcome })
        }
    }

    fn run(
        driver: impl Fn() -> Result<DriverOutcome> + Send + Sync + 'static,
    ) -> Result<RunDisposition> {
        let lease = EphemeralJournal::create(binding("turn")).unwrap().lease;
        let sessions = Sessions::new(
            Arc::new(Store {
                lease: Mutex::new(Some(lease)),
            }),
            Arc::new(Driver(Box::new(driver))),
        );
        ready(sessions.run_selected(ClaimRequest {
            id: ChangeId::new("claim").unwrap(),
            session: SessionId::new("session").unwrap(),
            expected_revision: SessionRevision(0),
            selection: TurnSelection::New {
                turn: TurnId::new("turn").unwrap(),
                inputs: vec![],
            },
        }))
    }

    #[test]
    fn a_driver_failure_is_reported_when_the_turn_cannot_be_inspected() {
        let error = run(|| Err(Error::new(ErrorKind::Unavailable, "provider_failed"))).unwrap_err();
        assert_eq!(error.code, "provider_failed");
    }

    #[test]
    fn a_receipt_for_another_turn_is_refused_before_verification() {
        let foreign = binding("another-turn");
        let error = run(move || {
            Ok(DriverOutcome::Settled(SettlementReceipt {
                record: RecordedPosition {
                    change: ChangeId::new("settle").unwrap(),
                    binding: foreign.clone(),
                    position: JournalPosition(1),
                    fingerprint: Fingerprint::of(&"settle").unwrap(),
                    content_fingerprint: Fingerprint::of(&"settle").unwrap(),
                    driver_state_revision: None,
                },
                outcome: TurnOutcome {
                    status: OutcomeStatus::Succeeded,
                    account: None,
                    evidence: vec![],
                },
            }))
        })
        .unwrap_err();
        assert_eq!(error.code, "driver_receipt_binding_mismatch");
    }
}
