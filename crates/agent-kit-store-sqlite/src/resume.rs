//! Paused claims with an exact state or related control committed beside the lease.

use super::{
    ClaimRecord, PreparedClaim, SqliteStore, commit_error, database_error, error, execute,
    finish_claim, load_turn, lookup_request, prepare_pending_claim, require_released, turn_view,
};
use crate::control_pair::{OperationRelatedControl, apply_related_control};
use agent_kit_core::driver_state::DriverStateChange;
use agent_kit_core::turn::ControlDirective;
use agent_kit_core::{ErrorKind, Fingerprint, Result, TurnId};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ControlReceipt, ControlRequest, SessionControl, TurnSelection,
    TurnView,
};
use rusqlite::TransactionBehavior;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ResumeCompanion {
    /// Commit opaque state to the resumed session and turn before rebinding.
    DriverState(DriverStateChange),
    /// Check or control the exact related destination without issuing its lease.
    Related(OperationRelatedControl),
}

pub struct ResumeClaimOutcome {
    pub claim: ClaimOutcome,
    pub related: Option<ControlReceipt>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ResumeClaimReceipt {
    pub turn: TurnView,
    pub related: Option<ControlReceipt>,
}

#[derive(Serialize, Deserialize)]
pub(super) struct ResumeRecord {
    fingerprint: Fingerprint,
    related: Option<ControlReceipt>,
}

impl SqliteStore {
    /// Observe the exact original paused claim, including a related control if
    /// one committed with it. Earlier ordinary claims have no related receipt.
    /// This read never issues a lease.
    pub async fn resume_receipt(
        &self,
        request: ClaimRequest,
    ) -> Result<Option<ResumeClaimReceipt>> {
        paused_turn(&request)?;
        let fingerprint = Fingerprint::of(&request)?;
        execute(Arc::clone(&self.inner), move |inner, connection| {
            lookup_request::<ClaimRecord>(
                connection,
                &request.session,
                "claim",
                &request.id,
                fingerprint,
            )?
            .map(|record| {
                let state = load_turn(connection, &request.session, &record.turn)?;
                Ok(ResumeClaimReceipt {
                    turn: turn_view(inner, &state)?,
                    related: record.resume.and_then(|resume| resume.related),
                })
            })
            .transpose()
        })
        .await
    }

    /// Reclaim a paused turn and commit its companion in the same transaction.
    /// Reopening a related destination requires its paused suspension and the
    /// release of its current owner. It still needs its own later claim.
    ///
    /// An exact repeat observes the committed source turn and related receipt.
    /// The companion cannot be added to or changed on a recorded claim.
    pub async fn resume_with(
        &self,
        request: ClaimRequest,
        companion: ResumeCompanion,
    ) -> Result<ResumeClaimOutcome> {
        let turn = paused_turn(&request)?.clone();
        if let ResumeCompanion::Related(related) = &companion {
            related.require_distinct(&request.session)?;
        }
        let fingerprint = Fingerprint::of(&request)?;
        let companion_fingerprint = Fingerprint::of(&companion)?;
        let inner = Arc::clone(&self.inner);
        let (prepared, related) = execute(Arc::clone(&inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            if let Some(record) = lookup_request::<ClaimRecord>(
                &transaction,
                &request.session,
                "claim",
                &request.id,
                fingerprint,
            )? {
                let resume = record
                    .resume
                    .filter(|resume| resume.fingerprint == companion_fingerprint)
                    .ok_or_else(|| error(ErrorKind::Conflict, "request_identity_reused"))?;
                let state = load_turn(&transaction, &request.session, &record.turn)?;
                return Ok((
                    PreparedClaim::Existing(turn_view(inner, &state)?),
                    resume.related,
                ));
            }
            let (change, related) = match companion {
                ResumeCompanion::DriverState(change) => (Some(change), None),
                ResumeCompanion::Related(related) => (
                    None,
                    apply_related_control(
                        &transaction,
                        &request.session,
                        &turn,
                        &related,
                        |control, turn| {
                            if !opens_admission(control) {
                                return Ok(None);
                            }
                            let state = load_turn(&transaction, &control.session, turn)?;
                            if !state.is_suspended()
                                || !state.controls().paused
                                || state.controls().cancelled
                            {
                                return Err(error(
                                    ErrorKind::Conflict,
                                    "resume_destination_not_suspended",
                                ));
                            }
                            require_released(inner, state.binding())?;
                            Ok(Some(state))
                        },
                    )?,
                ),
            };
            let claim = prepare_pending_claim(
                inner,
                &transaction,
                request,
                change,
                None,
                fingerprint,
                Some(ResumeRecord {
                    fingerprint: companion_fingerprint,
                    related: related.clone(),
                }),
            )?;
            transaction.commit().map_err(commit_error)?;
            inner.changed.notify_waiters();
            Ok((PreparedClaim::Acquired(claim), related))
        })
        .await?;
        Ok(ResumeClaimOutcome {
            claim: finish_claim(inner, prepared)?,
            related,
        })
    }
}

fn paused_turn(request: &ClaimRequest) -> Result<&TurnId> {
    let TurnSelection::ResumePaused { turn, .. } = &request.selection else {
        return Err(error(
            ErrorKind::InvalidInput,
            "resume_requires_paused_turn",
        ));
    };
    Ok(turn)
}

fn opens_admission(control: &ControlRequest) -> bool {
    match &control.action {
        SessionControl::Turn { directive, .. } => *directive == ControlDirective::Resume,
        SessionControl::DriverState {
            turn: Some(control),
            ..
        } => control.directive == ControlDirective::Resume,
        _ => false,
    }
}
