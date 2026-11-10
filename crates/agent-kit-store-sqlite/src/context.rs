//! Retained model context replacements backed by owned turn outcomes.

use super::history::{
    HistoryBasis, HistorySeed, HistorySelection, RetainedHistory, View, read_view, require_basis,
    seed_bytes, select_view,
};
use super::{
    Acquired, ClaimRecord, MAX_HISTORY_BYTES, PreparedClaim, SqliteStore, bump_revision,
    commit_error, database_error, decode, encode, encode_snapshot, error, execute, finish_claim,
    load_session, load_turn, lookup_request, register_owner, require_revision, save_request,
    save_session, sql_number, turn_view,
};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{JournalAction, JournalChange, TurnBinding, TurnState};
use agent_kit_core::{ChangeId, Envelope, ErrorKind, Fingerprint, Result, SessionId, TurnId};
use agent_kit_sessions::{ClaimOutcome, SessionRevision};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// An owned turn that begins from an opaque checkpoint rather than a submission.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnpromptedClaim {
    pub session: SessionId,
    pub turn: TurnId,
    pub request: ChangeId,
    pub expected_revision: SessionRevision,
    pub expected_context: HistoryBasis,
    pub checkpoint: Envelope,
}

/// A candidate that replaces preceding model context after its producing turn.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ContextInstall {
    pub session: SessionId,
    pub turn: TurnId,
    pub expected_context: HistoryBasis,
    pub expected_outcome: Fingerprint,
    pub replacement: HistorySeed,
    /// Last source turn covered by the replacement. Later source turns stay
    /// in context. With no boundary, the replacement covers the full source.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub covered_through: Option<TurnId>,
}

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum StoredContextReplacement {
    Prefix { seed: HistorySeed, through: i64 },
    Full(HistorySeed),
}

impl SqliteStore {
    /// Read the selected history view with its latest eligible context replacement.
    pub async fn context_history_with(
        &self,
        session: SessionId,
        before_turn: Option<TurnId>,
        project: impl Fn(&TurnState) -> Vec<HistoryRecord> + Send + 'static,
    ) -> Result<RetainedHistory> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let revision = load_session(connection, &session)?.revision;
            read_context(connection, &session, revision, before_turn, &project)
        })
        .await
    }

    /// Claim an idle session with an empty queue. The checkpoint and lease
    /// are recorded together, and retries of an accepted claim are observational.
    pub async fn claim_unprompted(&self, request: UnpromptedClaim) -> Result<ClaimOutcome> {
        self.claim_unprompted_for(request, None).await
    }

    /// Claim maintenance ahead of the exact queue head without selecting it.
    pub async fn claim_unprompted_before_input(
        &self,
        request: UnpromptedClaim,
        head: ChangeId,
    ) -> Result<ClaimOutcome> {
        self.claim_unprompted_for(request, Some(head)).await
    }

    async fn claim_unprompted_for(
        &self,
        request: UnpromptedClaim,
        head: Option<ChangeId>,
    ) -> Result<ClaimOutcome> {
        let inner = Arc::clone(&self.inner);
        let prepared = execute(Arc::clone(&inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let id = &request.session;
            let fingerprint = match &head {
                Some(head) => Fingerprint::of(&(&request, head))?,
                None => Fingerprint::of(&request)?,
            };
            if let Some(receipt) = lookup_request::<ClaimRecord>(
                &transaction, id, "unprompted-claim", &request.request, fingerprint,
            )? {
                return Ok(PreparedClaim::Existing(turn_view(
                    inner, &load_turn(&transaction, id, &receipt.turn)?,
                )?));
            }
            let mut session = load_session(&transaction, id)?;
            require_revision(&session, request.expected_revision)?;
            if session.paused {
                return Err(error(ErrorKind::InvalidState, "session_admission_paused"));
            }
            if session.active_turn.is_some() {
                return Err(error(ErrorKind::Conflict, "session_turn_active"));
            }
            let queued: Option<String> = transaction.query_row(
                "SELECT id FROM submissions WHERE session=?1 AND queue_order IS NOT NULL ORDER BY queue_order LIMIT 1",
                [id.as_str()], |row| row.get(0),
            ).optional().map_err(database_error)?;
            if queued.as_deref() != head.as_ref().map(ChangeId::as_str) {
                return Err(error(ErrorKind::Conflict, "session_queue_waiting"));
            }
            let history = read_context(&transaction, id, session.revision, None, &|_| Vec::new())?;
            require_basis(&history.basis, &request.expected_context)?;
            let mut state = TurnState::with_driver_state(TurnBinding {
                session: id.clone(), turn: request.turn.clone(), epoch: 1,
            }, session.driver_state.clone())?;
            state.apply(JournalChange::new(
                request.request.clone(),
                state.binding().clone(),
                state.position(),
                state.controls().revision,
                vec![JournalAction::SetCheckpoint(request.checkpoint)],
            )?)?;
            let inserted = transaction.execute(
                "INSERT INTO turns(session,id,snapshot) VALUES(?1,?2,?3)
                 ON CONFLICT(session,id) DO NOTHING",
                params![id.as_str(), request.turn.as_str(), encode_snapshot(&state)?],
            ).map_err(database_error)?;
            if inserted == 0 {
                return Err(error(ErrorKind::Conflict, "turn_exists"));
            }
            let owner = register_owner(inner, state.binding())?;
            session.active_turn = Some(request.turn.clone());
            bump_revision(&mut session)?;
            save_session(&transaction, id, &session)?;
            save_request(&transaction, id, "unprompted-claim", &request.request, fingerprint,
                &ClaimRecord::new(request.turn))?;
            transaction.commit().map_err(commit_error)?;
            Ok(PreparedClaim::Acquired(Acquired {
                binding: state.binding().clone(), configuration: session.configuration,
                inputs: Vec::new(), owner,
            }))
        }).await?;
        finish_claim(inner, prepared)
    }

    /// Install once after a successful retained outcome. A changed context,
    /// source view or newer claimed turn leaves the prior replacement intact.
    /// Queued submissions are independent of this model-context boundary.
    pub async fn install_context(&self, request: ContextInstall) -> Result<()> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let id = &request.session;
            let session = load_session(&transaction, id)?;
            let (source_view, ordinal) = select_view(
                &transaction, id, HistorySelection::BeforeTurn(request.turn.clone()),
            )?;
            let ordinal = ordinal.expect("before turn has ordinal");
            let view = sql_number(source_view.id.0)?;
            let identity = encode(&Fingerprint::of(&request)?)?;
            let existing: Option<Vec<u8>> = transaction.query_row(
                "SELECT identity FROM session_context_replacements WHERE session=?1 AND view=?2 AND turn_ordinal=?3",
                params![id.as_str(), view, ordinal], |row| row.get(0),
            ).optional().map_err(database_error)?;
            if let Some(existing) = existing {
                return if existing == identity { Ok(()) } else {
                    Err(error(ErrorKind::Conflict, "context_replacement_identity_reused"))
                };
            }
            let (current_view, _) = select_view(&transaction, id, HistorySelection::Current)?;
            let latest: Option<i64> = transaction.query_row(
                "SELECT MAX(ordinal) FROM turns WHERE session=?1",
                [id.as_str()], |row| row.get(0),
            ).map_err(database_error)?;
            if current_view.id != source_view.id || latest != Some(ordinal) || session.active_turn.is_some() {
                return Err(error(ErrorKind::Conflict, "context_install_basis_changed"));
            }
            let state = load_turn(&transaction, id, &request.turn)?;
            let outcome = state.outcome().ok_or_else(|| error(ErrorKind::Conflict, "context_outcome_missing"))?;
            if outcome.status != OutcomeStatus::Succeeded || Fingerprint::of(outcome)? != request.expected_outcome {
                return Err(error(ErrorKind::Conflict, "context_outcome_changed"));
            }
            let (context, before) = context_view(&transaction, id, Some(request.turn))?;
            let previous_through = context.after;
            let history = read_view(&transaction, id, session.revision, context, before, &|_| Vec::new())?;
            require_basis(&history.basis, &request.expected_context)?;
            let mut bytes = seed_bytes(&request.replacement)?;
            if let Some(turn) = request.covered_through {
                let through = transaction.query_row(
                    "SELECT ordinal FROM turns WHERE session=?1 AND id=?2 AND ordinal>?3 AND ordinal<?4",
                    params![id.as_str(), turn.as_str(), previous_through, ordinal],
                    |row| row.get(0),
                ).optional().map_err(database_error)?.ok_or_else(|| {
                    error(ErrorKind::Conflict, "context_coverage_boundary_changed")
                })?;
                bytes = encode(&StoredContextReplacement::Prefix { seed: request.replacement, through })?;
                if bytes.len() > MAX_HISTORY_BYTES {
                    return Err(error(ErrorKind::LimitExceeded, "history_projection_limit"));
                }
            }
            transaction.execute(
                "INSERT INTO session_context_replacements(session,view,turn_ordinal,replacement,identity)
                 VALUES(?1,?2,?3,?4,?5)",
                params![id.as_str(), view, ordinal, bytes, identity],
            ).map_err(database_error)?;
            transaction.commit().map_err(commit_error)?;
            Ok(())
        }).await
    }
}

fn read_context(
    connection: &Connection,
    session: &SessionId,
    revision: SessionRevision,
    before_turn: Option<TurnId>,
    project: &dyn Fn(&TurnState) -> Vec<HistoryRecord>,
) -> Result<RetainedHistory> {
    let (view, before) = context_view(connection, session, before_turn)?;
    read_view(connection, session, revision, view, before, project)
}

fn context_view(
    connection: &Connection,
    session: &SessionId,
    before_turn: Option<TurnId>,
) -> Result<(View, Option<i64>)> {
    let selection = before_turn.map_or(HistorySelection::Current, HistorySelection::BeforeTurn);
    let (mut view, before) = select_view(connection, session, selection)?;
    let replacement = connection
        .query_row(
            "SELECT turn_ordinal,replacement,identity FROM session_context_replacements
         WHERE session=?1 AND view=?2 AND (?3 IS NULL OR turn_ordinal<?3)
         ORDER BY turn_ordinal DESC LIMIT 1",
            params![session.as_str(), sql_number(view.id.0)?, before],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, Vec<u8>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?;
    if let Some((ordinal, bytes, identity)) = replacement {
        if bytes.len() > MAX_HISTORY_BYTES || ordinal <= view.after {
            return Err(error(
                ErrorKind::InvalidState,
                "stored_context_replacement_invalid",
            ));
        }
        let (seed, through) = match decode(&bytes)? {
            StoredContextReplacement::Prefix { seed, through } => (seed, through),
            StoredContextReplacement::Full(seed) => (seed, ordinal),
        };
        if through <= view.after || through > ordinal {
            return Err(error(
                ErrorKind::InvalidState,
                "stored_context_replacement_invalid",
            ));
        }
        view.after = through;
        view.seed = Some(seed);
        view.seed_identity = Some(decode(&identity)?);
    }
    Ok((view, before))
}
