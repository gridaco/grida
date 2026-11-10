//! Persistent goal policy. The session owner commits these transitions.

pub(crate) mod settlement;
pub mod tools;

use agent_kit_core::{
    ChangeId, Envelope, Error, ErrorKind, Fingerprint, OperationId, Result, SchemaId, SessionId,
    ToolCallId, TurnId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::num::NonZeroU32;

const SCHEMA: &str = "grida.agent.goal";
const VERSION: u32 = 1;
const MAX_OBJECTIVE_BYTES: usize = 8_192;
const MAX_CRITERIA: usize = 16;
const MAX_CRITERION_BYTES: usize = 1_024;
const MAX_PROGRESS_BYTES: usize = 4_096;
const MAX_STATE_BYTES: usize = 64 * 1024;

/// Identity and revision of the goal decision on which work is based.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Basis {
    pub goal: ChangeId,
    pub revision: u64,
}

/// A candidate continuation derived from one accounted predecessor.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Continuation {
    pub basis: Basis,
    pub after: TurnId,
}

impl Continuation {
    pub fn input_id(&self, session: &SessionId) -> Result<ChangeId> {
        let fingerprint = Fingerprint::of(&("goal-continuation-v1", session, self))?;
        ChangeId::new(crate::hex(fingerprint))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Objective {
    pub description: String,
    pub criteria: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Allowance {
    pub work_turns: NonZeroU32,
    pub inference_steps: NonZeroU32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Usage {
    pub work_turns: u32,
    pub inference_steps: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Blocker {
    NeedsInput,
    CapabilityUnavailable,
    NoProgress,
    UnverifiedCompletion,
    UncertainWork,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", content = "reason", rename_all = "snake_case")]
pub enum Status {
    Active,
    Blocked(Blocker),
    Exhausted,
    Complete,
    Cleared,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Reservation {
    pub turn: TurnId,
    pub basis: Basis,
    pub inference_steps: NonZeroU32,
    /// Reported steps so far if the previous outcome was uncertain.
    pub uncertain_steps: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    objective_fingerprint: Option<Fingerprint>,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CriterionEvidence {
    /// The criterion's one-based position in the objective.
    pub criterion: u8,
    pub call: ToolCallId,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Report {
    Progress {
        summary: String,
    },
    Blocked {
        reason: ReportedBlocker,
        summary: String,
    },
    Completion {
        summary: String,
        evidence: Vec<CriterionEvidence>,
    },
    ReadyForReview {
        summary: String,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReportedBlocker {
    NeedsInput,
    CapabilityUnavailable,
}

/// Trusted evidence from the owning turn. A model report is a proposal.
pub enum WorkOutcome<'a> {
    NotDispatched,
    Uncertain {
        observed_steps: u32,
    },
    Settled {
        inference_steps: u32,
        report: Option<Report>,
        /// Independently verified links between these criteria and operations.
        verified_evidence: &'a BTreeSet<CriterionEvidence>,
    },
}

/// The goal's state at a settled work boundary, retained with the turn account.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProgressAccount {
    pub basis: Basis,
    pub status: Status,
    pub paused: bool,
    pub progress: Option<String>,
    pub spent: Usage,
    pub remaining: Usage,
    pub held: Option<Reservation>,
    pub verified: Vec<VerifiedCriterion>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifiedCriterion {
    pub criterion: u8,
    pub operation: OperationId,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReviewCandidate {
    pub basis: Basis,
    pub turn: TurnId,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum CompletionReview {
    Pending {
        candidate: ReviewCandidate,
    },
    Confirmed {
        candidate: ReviewCandidate,
        request: ChangeId,
    },
}

/// Product state persisted in a versioned envelope. Only validated transitions
/// can produce a goal that is eligible to reserve more work.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Goal {
    state: State,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct State {
    basis: Basis,
    objective: Objective,
    allowance: Allowance,
    spent: Usage,
    reservation: Option<Reservation>,
    paused: bool,
    status: Status,
    progress: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_work: Option<TurnId>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    user_review: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    review: Option<CompletionReview>,
}

impl Goal {
    pub fn start(id: ChangeId, objective: Objective, allowance: Allowance) -> Result<Self> {
        Self::start_with_review(id, objective, allowance, false)
    }

    pub fn start_with_review(
        id: ChangeId,
        objective: Objective,
        allowance: Allowance,
        user_review: bool,
    ) -> Result<Self> {
        Ok(Self {
            state: State {
                basis: Basis {
                    goal: id,
                    revision: 1,
                },
                objective: objective.normalized()?,
                allowance,
                spent: Usage::default(),
                reservation: None,
                paused: false,
                status: Status::Active,
                progress: None,
                last_work: None,
                user_review,
                review: None,
            },
        })
    }

    pub fn encode(&self) -> Result<Envelope> {
        let bytes = serde_json::to_vec(&self.state)
            .map_err(|_| problem(ErrorKind::InvalidState, "goal_encoding_failed"))?;
        if bytes.len() > MAX_STATE_BYTES {
            return Err(problem(ErrorKind::LimitExceeded, "goal_state_limit"));
        }
        Envelope::new(SchemaId::new(SCHEMA)?, VERSION, bytes)
    }

    pub fn decode(envelope: &Envelope) -> Result<Self> {
        if envelope.schema().as_str() != SCHEMA || envelope.version() != VERSION {
            return Err(problem(ErrorKind::Unsupported, "goal_state_schema"));
        }
        if envelope.bytes().len() > MAX_STATE_BYTES {
            return Err(problem(ErrorKind::LimitExceeded, "goal_state_limit"));
        }
        let state: State = serde_json::from_slice(envelope.bytes())
            .map_err(|_| problem(ErrorKind::InvalidState, "invalid_goal_state"))?;
        let goal = Self { state };
        goal.validate()?;
        Ok(goal)
    }

    pub fn basis(&self) -> &Basis {
        &self.state.basis
    }
    pub fn objective(&self) -> &Objective {
        &self.state.objective
    }
    pub fn allowance(&self) -> Allowance {
        self.state.allowance
    }
    pub fn spent(&self) -> Usage {
        self.state.spent
    }
    pub fn reservation(&self) -> Option<&Reservation> {
        self.state.reservation.as_ref()
    }
    pub fn paused(&self) -> bool {
        self.state.paused
    }
    pub fn status(&self) -> Status {
        if self.state.status == Status::Active
            && self
                .reservation()
                .is_some_and(|value| value.uncertain_steps.is_some())
        {
            Status::Blocked(Blocker::UncertainWork)
        } else {
            self.state.status
        }
    }
    pub fn progress(&self) -> Option<&str> {
        self.state.progress.as_deref()
    }
    pub fn user_review_enabled(&self) -> bool {
        self.state.user_review
    }
    pub fn completion_review(&self) -> Option<&CompletionReview> {
        self.state.review.as_ref()
    }

    /// Record the person's review of the exact successful, accounted work.
    /// The owning client authenticates this control and retains its receipt.
    pub fn confirm_completion(
        &mut self,
        expected: &Basis,
        turn: &TurnId,
        request: ChangeId,
    ) -> Result<()> {
        self.require_basis(expected)?;
        let Some(CompletionReview::Pending { candidate }) = self.completion_review() else {
            return Err(problem(
                ErrorKind::Conflict,
                "goal_completion_review_unavailable",
            ));
        };
        if &candidate.turn != turn
            || &candidate.basis != expected
            || self.paused()
            || self.reservation().is_some()
            || self.status() != Status::Blocked(Blocker::UnverifiedCompletion)
        {
            return Err(problem(
                ErrorKind::Conflict,
                "goal_completion_review_changed",
            ));
        }
        let candidate = candidate.clone();
        self.advance_basis()?;
        self.state.progress = Some(candidate.summary.clone());
        self.state.status = Status::Complete;
        self.state.review = Some(CompletionReview::Confirmed { candidate, request });
        Ok(())
    }

    /// Observation supplies a candidate only. A host must still conditionally
    /// accept and claim it under the captured session and goal revisions.
    pub fn continuation(&self) -> Option<Continuation> {
        if self.paused() || self.status() != Status::Active || self.reservation().is_some() {
            return None;
        }
        Some(Continuation {
            basis: self.basis().clone(),
            after: self.state.last_work.clone()?,
        })
    }

    /// Work already reserved remains unavailable until the owning turn is reconciled.
    pub fn remaining(&self) -> Usage {
        let held_turns = u32::from(self.state.reservation.is_some());
        let held_steps = self
            .state
            .reservation
            .as_ref()
            .map_or(0, |value| value.inference_steps.get());
        Usage {
            work_turns: self.state.allowance.work_turns.get()
                - self.state.spent.work_turns
                - held_turns,
            inference_steps: self.state.allowance.inference_steps.get()
                - self.state.spent.inference_steps
                - held_steps,
        }
    }

    pub fn revise(&mut self, expected: &Basis, objective: Objective) -> Result<()> {
        self.require_editable(expected)?;
        let objective = objective.normalized()?;
        if objective == self.state.objective {
            return Ok(());
        }
        self.advance_basis()?;
        self.state.objective = objective;
        self.state.progress = None;
        self.state.status = Status::Active;
        self.state.review = None;
        self.mark_exhausted();
        Ok(())
    }

    pub fn set_paused(&mut self, expected: &Basis, paused: bool) -> Result<()> {
        self.require_editable(expected)?;
        if paused != self.state.paused {
            if self.completion_review().is_some() {
                return Err(problem(
                    ErrorKind::Conflict,
                    "goal_completion_review_pending",
                ));
            }
            self.advance_basis()?;
            self.state.paused = paused;
        }
        Ok(())
    }

    pub fn clear(&mut self, expected: &Basis) -> Result<()> {
        self.require_basis(expected)?;
        if self.state.status != Status::Cleared {
            self.advance_basis()?;
            self.state.status = Status::Cleared;
            self.state.paused = false;
            self.state.review = None;
        }
        Ok(())
    }

    /// Resume the existing reserved turn under the unchanged objective.
    /// Earlier proposals retain their original basis and cannot complete it.
    pub fn resume_reserved(&mut self, expected: &Basis, turn: &TurnId) -> Result<()> {
        self.require_editable(expected)?;
        let objective = Fingerprint::of(&self.state.objective)?;
        if !self.paused()
            || self.status() != Status::Active
            || self.reservation().is_none_or(|value| {
                &value.turn != turn || value.objective_fingerprint != Some(objective)
            })
        {
            return Err(problem(
                ErrorKind::Conflict,
                "goal_reserved_resume_mismatch",
            ));
        }
        self.set_paused(expected, false)?;
        self.state
            .reservation
            .as_mut()
            .expect("checked reservation")
            .basis = self.state.basis.clone();
        Ok(())
    }

    /// An explicit resume can reconsider a blocked idle goal within its same
    /// remaining allowance. Unreconciled work keeps its reservation.
    pub fn resume_idle(&mut self, expected: &Basis) -> Result<()> {
        self.require_editable(expected)?;
        if self.reservation().is_some() {
            return Err(problem(ErrorKind::Conflict, "goal_work_reserved"));
        }
        let remaining = self.remaining();
        if remaining.work_turns == 0 || remaining.inference_steps == 0 {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "goal_allowance_exhausted",
            ));
        }
        if self.paused() || matches!(self.status(), Status::Blocked(_)) {
            self.advance_basis()?;
            self.state.paused = false;
            self.state.status = Status::Active;
            self.state.review = None;
        }
        Ok(())
    }

    /// The scheduler must persist this with admission before starting work.
    pub fn reserve(
        &mut self,
        expected: &Basis,
        turn: TurnId,
        requested_steps: NonZeroU32,
    ) -> Result<Reservation> {
        self.require_basis(expected)?;
        if self.state.status == Status::Exhausted {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "goal_allowance_exhausted",
            ));
        }
        if self.state.paused || self.state.status != Status::Active {
            return Err(problem(ErrorKind::InvalidState, "goal_not_active"));
        }
        if self.state.reservation.is_some() {
            return Err(problem(ErrorKind::Conflict, "goal_work_reserved"));
        }
        let remaining = self.remaining();
        let steps = NonZeroU32::new(requested_steps.get().min(remaining.inference_steps));
        let Some(inference_steps) = steps.filter(|_| remaining.work_turns > 0) else {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "goal_allowance_exhausted",
            ));
        };
        let reservation = Reservation {
            turn,
            basis: expected.clone(),
            inference_steps,
            uncertain_steps: None,
            objective_fingerprint: Some(Fingerprint::of(&self.state.objective)?),
        };
        self.state.reservation = Some(reservation.clone());
        Ok(reservation)
    }

    /// Charge the exact reserved turn. An obsolete report may reconcile its own
    /// work but cannot change the current objective's progress or status.
    pub fn account(&mut self, turn: &TurnId, outcome: WorkOutcome<'_>) -> Result<()> {
        let reservation = self
            .state
            .reservation
            .as_ref()
            .filter(|value| &value.turn == turn)
            .ok_or_else(|| problem(ErrorKind::Conflict, "goal_reservation_mismatch"))?;
        let current = reservation.basis == self.state.basis
            && !self.state.paused
            && !matches!(self.state.status, Status::Cleared | Status::Complete);
        let previous = reservation.uncertain_steps.unwrap_or(0);
        let steps = match &outcome {
            WorkOutcome::NotDispatched => 0,
            WorkOutcome::Uncertain { observed_steps } => *observed_steps,
            WorkOutcome::Settled {
                inference_steps, ..
            } => *inference_steps,
        };
        if steps < previous || steps > reservation.inference_steps.get() {
            return Err(problem(
                ErrorKind::InvalidInput,
                "goal_step_account_mismatch",
            ));
        }
        match outcome {
            WorkOutcome::Uncertain { observed_steps } => {
                self.state
                    .reservation
                    .as_mut()
                    .expect("checked reservation")
                    .uncertain_steps = Some(observed_steps);
            }
            WorkOutcome::NotDispatched => {
                self.state.reservation = None;
                self.state.last_work = Some(turn.clone());
                if current {
                    self.state.status = Status::Blocked(Blocker::NoProgress);
                }
                self.mark_exhausted();
            }
            WorkOutcome::Settled {
                report,
                verified_evidence,
                ..
            } => {
                self.state.reservation = None;
                self.state.last_work = Some(turn.clone());
                self.state.spent.work_turns += 1;
                self.state.spent.inference_steps += steps;
                if current {
                    self.apply_report(
                        turn,
                        report.and_then(|value| value.normalized().ok()),
                        verified_evidence,
                    );
                }
                self.mark_exhausted();
            }
        }
        Ok(())
    }

    fn apply_report(
        &mut self,
        turn: &TurnId,
        report: Option<Report>,
        verified: &BTreeSet<CriterionEvidence>,
    ) {
        match report {
            Some(Report::Progress { summary }) if self.progress() != Some(&summary) => {
                self.state.progress = Some(summary);
                self.state.status = Status::Active;
            }
            Some(Report::Blocked { summary, reason }) => {
                self.state.progress = Some(summary);
                let reason = match reason {
                    ReportedBlocker::NeedsInput => Blocker::NeedsInput,
                    ReportedBlocker::CapabilityUnavailable => Blocker::CapabilityUnavailable,
                };
                self.state.status = Status::Blocked(reason);
            }
            Some(Report::Completion { summary, evidence }) => {
                let criteria: BTreeSet<_> = evidence.iter().map(|entry| entry.criterion).collect();
                if criteria.iter().copied().map(usize::from).eq(1..=self
                    .state
                    .objective
                    .criteria
                    .len())
                    && evidence.len() == criteria.len()
                    && evidence.iter().all(|entry| verified.contains(entry))
                {
                    self.state.progress = Some(summary);
                    self.state.status = Status::Complete;
                } else {
                    self.state.status = Status::Blocked(Blocker::UnverifiedCompletion);
                }
            }
            Some(Report::ReadyForReview { summary }) if self.user_review_enabled() => {
                self.state.status = Status::Blocked(Blocker::UnverifiedCompletion);
                self.state.review = Some(CompletionReview::Pending {
                    candidate: ReviewCandidate {
                        basis: self.basis().clone(),
                        turn: turn.clone(),
                        summary,
                    },
                });
            }
            _ => self.state.status = Status::Blocked(Blocker::NoProgress),
        }
    }

    fn mark_exhausted(&mut self) {
        if self.state.reservation.is_none()
            && self.state.review.is_none()
            && matches!(self.state.status, Status::Active | Status::Blocked(_))
        {
            let remaining = self.remaining();
            if remaining.work_turns == 0 || remaining.inference_steps == 0 {
                self.state.status = Status::Exhausted;
            }
        }
    }

    fn require_basis(&self, expected: &Basis) -> Result<()> {
        if expected != self.basis() {
            return Err(problem(ErrorKind::Conflict, "goal_revision_changed"));
        }
        Ok(())
    }

    fn advance_basis(&mut self) -> Result<()> {
        self.state.basis.revision = self
            .state
            .basis
            .revision
            .checked_add(1)
            .ok_or_else(|| problem(ErrorKind::LimitExceeded, "goal_revision_limit"))?;
        Ok(())
    }

    fn require_editable(&self, expected: &Basis) -> Result<()> {
        self.require_basis(expected)?;
        if matches!(self.state.status, Status::Complete | Status::Cleared) {
            return Err(problem(ErrorKind::InvalidState, "goal_not_active"));
        }
        Ok(())
    }

    fn validate(&self) -> Result<()> {
        let state = &self.state;
        let bad_reservation = state.reservation.as_ref().is_some_and(|value| {
            value.basis.goal != state.basis.goal
                || value.basis.revision == 0
                || value.basis.revision > state.basis.revision
                || value
                    .uncertain_steps
                    .is_some_and(|steps| steps > value.inference_steps.get())
                || value.inference_steps.get()
                    > state
                        .allowance
                        .inference_steps
                        .get()
                        .saturating_sub(state.spent.inference_steps)
                || state.spent.work_turns >= state.allowance.work_turns.get()
        });
        let bad_review = state.review.as_ref().is_some_and(|value| {
            let (candidate, valid_status) = match value {
                CompletionReview::Pending { candidate } => (
                    candidate,
                    state.status == Status::Blocked(Blocker::UnverifiedCompletion)
                        && candidate.basis == state.basis,
                ),
                CompletionReview::Confirmed { candidate, .. } => (
                    candidate,
                    state.status == Status::Complete
                        && candidate.basis.revision.checked_add(1) == Some(state.basis.revision)
                        && state.progress.as_ref() == Some(&candidate.summary),
                ),
            };
            !state.user_review
                || !valid_status
                || state.paused
                || state.reservation.is_some()
                || state.spent.work_turns == 0
                || candidate.basis.goal != state.basis.goal
                || candidate.basis.revision == 0
                || state.last_work.as_ref() != Some(&candidate.turn)
                || bounded_text(candidate.summary.clone(), MAX_PROGRESS_BYTES).as_ref()
                    != Ok(&candidate.summary)
        });
        if state.basis.revision == 0
            || state.objective.clone().normalized()? != state.objective
            || state.spent.work_turns > state.allowance.work_turns.get()
            || state.spent.inference_steps > state.allowance.inference_steps.get()
            || bad_reservation
            || bad_review
            || state.status == Status::Blocked(Blocker::UncertainWork)
            || state.status == Status::Complete
                && (state.reservation.is_some() || state.progress.is_none() || state.paused)
            || state.status == Status::Cleared && state.paused
            || state.progress.as_ref().is_some_and(|text| {
                text.is_empty() || text.len() > MAX_PROGRESS_BYTES || text.trim() != text
            })
        {
            return Err(problem(ErrorKind::InvalidState, "invalid_goal_state"));
        }
        Ok(())
    }
}

impl Objective {
    fn normalized(mut self) -> Result<Self> {
        self.description = bounded_text(self.description, MAX_OBJECTIVE_BYTES)?;
        if self.criteria.is_empty() || self.criteria.len() > MAX_CRITERIA {
            return Err(problem(ErrorKind::InvalidInput, "invalid_goal_criteria"));
        }
        for criterion in &mut self.criteria {
            *criterion = bounded_text(std::mem::take(criterion), MAX_CRITERION_BYTES)?;
        }
        if self.criteria.iter().collect::<BTreeSet<_>>().len() != self.criteria.len() {
            return Err(problem(ErrorKind::InvalidInput, "duplicate_goal_criteria"));
        }
        Ok(self)
    }
}

impl Report {
    fn normalized(self) -> Result<Self> {
        Ok(match self {
            Self::Progress { summary } => Self::Progress {
                summary: bounded_text(summary, MAX_PROGRESS_BYTES)?,
            },
            Self::ReadyForReview { summary } => Self::ReadyForReview {
                summary: bounded_text(summary, MAX_PROGRESS_BYTES)?,
            },
            Self::Blocked { summary, reason } => Self::Blocked {
                summary: bounded_text(summary, MAX_PROGRESS_BYTES)?,
                reason,
            },
            Self::Completion { summary, evidence } => {
                if evidence.len() > MAX_CRITERIA {
                    return Err(problem(ErrorKind::InvalidInput, "invalid_goal_evidence"));
                }
                Self::Completion {
                    summary: bounded_text(summary, MAX_PROGRESS_BYTES)?,
                    evidence,
                }
            }
        })
    }
}

fn bounded_text(value: String, maximum: usize) -> Result<String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > maximum
        || value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(problem(ErrorKind::InvalidInput, "invalid_goal_text"));
    }
    Ok(value.to_owned())
}

fn problem(kind: ErrorKind, code: &str) -> Error {
    Error::new(kind, code)
}
