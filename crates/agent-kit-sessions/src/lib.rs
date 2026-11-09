//! Durable submissions and exclusive turn ownership around an injected driver.

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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionRevision(pub u64);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateSession {
    pub id: SessionId,
    pub request: ChangeId,
    pub configuration: Envelope,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionCreated {
    pub session: SessionId,
    pub revision: SessionRevision,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Submission {
    pub id: ChangeId,
    pub payload: Envelope,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Acceptance {
    pub session: SessionId,
    pub input: ChangeId,
    pub position: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InputDisposition {
    Queued,
    Claimed { turn: TurnId },
    Completed { turn: TurnId },
    Superseded { replacement: ChangeId },
    Withdrawn,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputView {
    pub input: Submission,
    pub position: u64,
    pub disposition: InputDisposition,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TurnSelection {
    New {
        turn: TurnId,
        inputs: Vec<ChangeId>,
    },
    Resume {
        turn: TurnId,
        epoch: u64,
        position: JournalPosition,
    },
    ResumePaused {
        turn: TurnId,
        epoch: u64,
        position: JournalPosition,
        control_revision: ControlRevision,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClaimRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub expected_revision: SessionRevision,
    pub selection: TurnSelection,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecoveryRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub turn: TurnId,
    pub expected_epoch: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SessionControl {
    PauseAdmission,
    ResumeAdmission,
    ReplaceQueued {
        input: ChangeId,
        replacement: Submission,
    },
    WithdrawQueued {
        input: ChangeId,
    },
    ReorderQueued {
        inputs: Vec<ChangeId>,
    },
    AppendHistory {
        turn: TurnId,
        expected: ControlRevision,
        expected_history: HistoryPosition,
        records: Vec<HistoryRecord>,
    },
    Turn {
        turn: TurnId,
        expected: ControlRevision,
        directive: ControlDirective,
    },
    Resolve {
        turn: TurnId,
        expected: ControlRevision,
        wait: WaitId,
        answer: Envelope,
    },
    ResolveAndAppend {
        turn: TurnId,
        expected: ControlRevision,
        expected_history: HistoryPosition,
        wait: WaitId,
        answer: Envelope,
        records: Vec<HistoryRecord>,
    },
    PauseAndCancel {
        turn: TurnId,
        expected: ControlRevision,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ControlRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub expected_revision: SessionRevision,
    pub action: SessionControl,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ControlReceipt {
    pub session: SessionId,
    pub request: ChangeId,
    pub revision: SessionRevision,
    pub turn: Option<CommitReceipt>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnDisposition {
    Running,
    Suspended,
    Interrupted,
    Settled,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TurnView {
    pub binding: TurnBinding,
    pub position: JournalPosition,
    pub history_position: HistoryPosition,
    pub controls: ControlSnapshot,
    pub disposition: TurnDisposition,
    pub outcome: Option<TurnOutcome>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SessionView {
    pub session: SessionId,
    pub revision: SessionRevision,
    pub configuration: Envelope,
    pub admission_paused: bool,
    pub queued: Vec<InputView>,
    pub current: Option<TurnView>,
    pub latest: Option<TurnView>,
}

pub struct ClaimedTurn {
    pub configuration: Envelope,
    pub inputs: Vec<Submission>,
    pub lease: TurnLease,
}

pub enum ClaimOutcome {
    Acquired(ClaimedTurn),
    Existing(TurnView),
}

/// A persistence adapter atomically owns input, claims, controls, and turn journals.
pub trait SessionStore: Send + Sync {
    fn create(&self, request: CreateSession) -> BoxFuture<'_, Result<SessionCreated>>;
    fn submit(&self, session: SessionId, input: Submission) -> BoxFuture<'_, Result<Acceptance>>;
    fn claim(&self, request: ClaimRequest) -> BoxFuture<'_, Result<ClaimOutcome>>;
    fn recover(&self, request: RecoveryRequest) -> BoxFuture<'_, Result<ClaimOutcome>>;
    fn control(&self, request: ControlRequest) -> BoxFuture<'_, Result<ControlReceipt>>;
    fn inspect(&self, session: SessionId) -> BoxFuture<'_, Result<SessionView>>;
    fn inspect_turn(&self, session: SessionId, turn: TurnId) -> BoxFuture<'_, Result<TurnView>>;
    fn verify(&self, receipt: CommitReceipt) -> BoxFuture<'_, Result<()>>;
}

pub enum DriverOutcome {
    Settled(SettlementReceipt),
    Suspended(SuspensionReceipt),
}

pub trait TurnDriver: Send + Sync {
    fn run(&self, claim: ClaimedTurn) -> BoxFuture<'static, Result<DriverOutcome>>;
}

#[derive(Clone, Debug, PartialEq)]
pub enum RunDisposition {
    Settled(SettlementReceipt),
    Suspended(SuspensionReceipt),
    Existing(TurnView),
}

/// Service coordination without provider, Runtime, or scheduling dependencies.
pub struct Sessions {
    store: Arc<dyn SessionStore>,
    driver: Arc<dyn TurnDriver>,
}

impl Sessions {
    pub fn new(store: Arc<dyn SessionStore>, driver: Arc<dyn TurnDriver>) -> Self {
        Self { store, driver }
    }

    pub async fn create(&self, request: CreateSession) -> Result<SessionCreated> {
        self.store.create(request).await
    }

    pub async fn submit(&self, session: SessionId, input: Submission) -> Result<Acceptance> {
        self.store.submit(session, input).await
    }

    pub async fn control(&self, request: ControlRequest) -> Result<ControlReceipt> {
        self.store.control(request).await
    }

    pub async fn inspect(&self, session: SessionId) -> Result<SessionView> {
        self.store.inspect(session).await
    }

    pub async fn run_selected(&self, request: ClaimRequest) -> Result<RunDisposition> {
        self.drive(self.store.claim(request).await?).await
    }

    pub async fn recover(&self, request: RecoveryRequest) -> Result<RunDisposition> {
        self.drive(self.store.recover(request).await?).await
    }

    async fn drive(&self, outcome: ClaimOutcome) -> Result<RunDisposition> {
        let claim = match outcome {
            ClaimOutcome::Acquired(claim) => claim,
            ClaimOutcome::Existing(view) => return Ok(RunDisposition::Existing(view)),
        };
        let binding = claim.lease.binding().clone();
        match self.driver.run(claim).await {
            Ok(DriverOutcome::Settled(receipt)) => {
                self.store
                    .verify(CommitReceipt::Settled(receipt.clone()))
                    .await?;
                if receipt.record.binding != binding {
                    return Err(Error::new(
                        ErrorKind::Conflict,
                        "driver_receipt_binding_mismatch",
                    ));
                }
                Ok(RunDisposition::Settled(receipt))
            }
            Ok(DriverOutcome::Suspended(receipt)) => {
                self.store
                    .verify(CommitReceipt::Suspended(receipt.clone()))
                    .await?;
                if receipt.record.binding != binding {
                    return Err(Error::new(
                        ErrorKind::Conflict,
                        "driver_receipt_binding_mismatch",
                    ));
                }
                Ok(RunDisposition::Suspended(receipt))
            }
            Err(error) => {
                let view = self
                    .store
                    .inspect_turn(binding.session, binding.turn)
                    .await?;
                if matches!(
                    view.disposition,
                    TurnDisposition::Settled | TurnDisposition::Suspended
                ) {
                    return Ok(RunDisposition::Existing(view));
                }
                Err(error)
            }
        }
    }
}
