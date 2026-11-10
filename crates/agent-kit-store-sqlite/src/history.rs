//! Bounded history reads and retained views over immutable turn snapshots.

use super::{
    Inner, MAX_HISTORY_BYTES, MAX_HISTORY_RECORDS, MAX_HISTORY_SCAN_BYTES, MAX_HISTORY_TURNS,
    SqliteStore, bump_revision, commit_error, database_error, decode, decode_turn, encode, error,
    execute, has_live_session_owner, insert_input, insert_session, load_session, load_turn,
    lookup_request, require_revision, save_request, save_session, sql_number, unsigned,
};
use agent_kit_core::history::{History, HistoryPosition, HistoryRecord};
use agent_kit_core::turn::{JournalPosition, TurnState};
use agent_kit_core::{ChangeId, Envelope, ErrorKind, Fingerprint, Result, SessionId, TurnId};
use agent_kit_sessions::{Acceptance, CreateSession, SessionCreated, SessionRevision, Submission};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistorySelection {
    Current,
    BeforeTurn(TurnId),
    View(SessionRevision),
}

/// Identity of the selected view, seed and all scanned committed snapshots.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryBasis {
    pub view: SessionRevision,
    pub tail: Option<HistoryTail>,
    pub fingerprint: Fingerprint,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryTail {
    pub turn: TurnId,
    pub ordinal: u64,
    pub position: JournalPosition,
}

/// Materialized prefix and caller-owned provenance. Contains no session controls.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HistorySeed {
    pub records: Vec<HistoryRecord>,
    pub provenance: Envelope,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RetainedRecord {
    pub turn: TurnId,
    pub position: JournalPosition,
    pub record: HistoryRecord,
}

/// A seed followed by local records in the selected interval.
#[derive(Clone, Debug, PartialEq)]
pub struct RetainedHistory {
    pub basis: HistoryBasis,
    pub session_revision: SessionRevision,
    pub seed: Option<HistorySeed>,
    pub records: Vec<RetainedRecord>,
}

impl RetainedHistory {
    pub fn into_records(self) -> Vec<HistoryRecord> {
        let mut records = self.seed.map_or_else(Vec::new, |seed| seed.records);
        records.extend(self.records.into_iter().map(|entry| entry.record));
        records
    }
}

/// The destination identity must remain stable across retries. The intent
/// fingerprint binds caller-owned parameters such as the selected message cut.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeededSession {
    pub create: CreateSession,
    pub source: SessionId,
    pub expected_history: HistoryBasis,
    pub intent: Fingerprint,
}

/// A replacement input is accepted with the revised view, before any new claim.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryRevision {
    pub session: SessionId,
    pub request: ChangeId,
    pub expected_revision: SessionRevision,
    pub expected_history: HistoryBasis,
    pub intent: Fingerprint,
    pub replacement: Submission,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryRevised {
    pub view: SessionRevision,
    pub acceptance: Acceptance,
}

type TurnProjection<'a> = dyn Fn(&TurnState) -> Vec<HistoryRecord> + 'a;

const REPLAY_PAGE_TURNS: i64 = 32;

/// A captured transcript interval. Settled turns are read in bounded pages;
/// the mutable active turn is projected when the interval is opened.
pub struct HistoryReplay {
    inner: Arc<Inner>,
    session: SessionId,
    after: i64,
    end: i64,
    prefix: Option<Vec<HistoryRecord>>,
    active: Option<Vec<HistoryRecord>>,
    project: fn(&TurnState) -> Vec<HistoryRecord>,
}

impl HistoryReplay {
    pub async fn next(&mut self) -> Result<Option<Vec<HistoryRecord>>> {
        if let Some(prefix) = self.prefix.take() {
            return Ok(Some(prefix));
        }
        if self.after >= self.end {
            return Ok(self.active.take());
        }
        let session = self.session.clone();
        let (after, end, project) = (self.after, self.end, self.project);
        let (after, records) = execute(Arc::clone(&self.inner), move |_, connection| {
            read_replay_page(connection, &session, after, end, project)
        })
        .await?;
        self.after = after;
        Ok(Some(records))
    }
}

impl SqliteStore {
    /// Capture the current view for observation without taking a turn lease.
    /// The projection must be pure and keep settled history stable through
    /// operation reconciliation.
    pub async fn open_history_replay(
        &self,
        session: SessionId,
        project: fn(&TurnState) -> Vec<HistoryRecord>,
    ) -> Result<HistoryReplay> {
        let replay_owner = Arc::clone(&self.inner);
        execute(Arc::clone(&self.inner), move |_, connection| {
            let state = load_session(connection, &session)?;
            let (view, _) = select_view(connection, &session, HistorySelection::Current)?;
            let mut end = connection
                .query_row(
                    "SELECT COALESCE(MAX(ordinal),?2) FROM turns
                     WHERE session=?1 AND ordinal>?2 AND (?3 IS NULL OR ordinal<=?3)",
                    params![session.as_str(), view.after, view.end],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(database_error)?;
            let mut active = None;
            if let Some(turn) = state.active_turn {
                let ordinal = connection
                    .query_row(
                        "SELECT ordinal FROM turns WHERE session=?1 AND id=?2",
                        params![session.as_str(), turn.as_str()],
                        |row| row.get::<_, i64>(0),
                    )
                    .map_err(database_error)?;
                if ordinal > view.after && ordinal <= end {
                    if ordinal != end {
                        return Err(error(
                            ErrorKind::InvalidState,
                            "history_active_turn_not_last",
                        ));
                    }
                    active = Some(project(&load_turn(connection, &session, &turn)?));
                    end -= 1;
                }
            }
            Ok(HistoryReplay {
                inner: replay_owner,
                session,
                after: view.after,
                end,
                prefix: view.seed.map(|seed| seed.records),
                active,
                project,
            })
        })
        .await
    }

    /// The projection runs under the store lock and must be pure.
    pub async fn retained_history_with(
        &self,
        session: SessionId,
        selection: HistorySelection,
        project: impl Fn(&TurnState) -> Vec<HistoryRecord> + Send + 'static,
    ) -> Result<RetainedHistory> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let revision = load_session(connection, &session)?.revision;
            read_history(connection, &session, revision, selection, &project)
        })
        .await
    }

    /// Capture a committed source view and atomically create an independent session.
    /// Both callbacks must be pure. An exact retry returns its original receipt
    /// without calling them or consulting the source again.
    pub async fn create_seeded(
        &self,
        request: SeededSession,
        project: impl Fn(&TurnState) -> Vec<HistoryRecord> + Send + 'static,
        make_seed: impl FnOnce(RetainedHistory) -> Result<HistorySeed> + Send + 'static,
    ) -> Result<SessionCreated> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = Fingerprint::of(&request)?;
            let destination = &request.create.id;
            if let Some(receipt) = lookup_request(
                &transaction,
                destination,
                "create",
                &request.create.request,
                fingerprint,
            )? {
                return Ok(receipt);
            }
            let revision = load_session(&transaction, &request.source)?.revision;
            let history = read_history(
                &transaction,
                &request.source,
                revision,
                HistorySelection::Current,
                &project,
            )?;
            require_basis(&history.basis, &request.expected_history)?;
            let seed = make_seed(history)?;
            let receipt = insert_session(&transaction, &request.create, inner.catalog)?;
            insert_view(&transaction, destination, receipt.revision, &seed, 0)?;
            save_request(
                &transaction,
                destination,
                "create",
                &request.create.request,
                fingerprint,
                &receipt,
            )?;
            transaction.commit().map_err(commit_error)?;
            Ok(receipt)
        })
        .await
    }

    /// Install a new current view for an idle, empty-queue session. Existing
    /// admission pause is preserved. The seed, prior view boundary, accepted
    /// replacement, and idempotency receipt commit together.
    pub async fn revise_history(
        &self,
        request: HistoryRevision,
        project: impl Fn(&TurnState) -> Vec<HistoryRecord> + Send + 'static,
        make_seed: impl FnOnce(RetainedHistory) -> Result<HistorySeed> + Send + 'static,
    ) -> Result<HistoryRevised> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = Fingerprint::of(&request)?;
            let id = &request.session;
            if let Some(receipt) = lookup_request(
                &transaction,
                id,
                "history_revision",
                &request.request,
                fingerprint,
            )? {
                return Ok(receipt);
            }
            let mut session = load_session(&transaction, id)?;
            require_revision(&session, request.expected_revision)?;
            if session.active_turn.is_some() || has_live_session_owner(inner, id)? {
                return Err(error(ErrorKind::Conflict, "history_revision_requires_idle"));
            }
            let queued: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM submissions WHERE session=?1 AND queue_order IS NOT NULL)",
                [id.as_str()],
                |row| row.get(0),
            ).map_err(database_error)?;
            if queued {
                return Err(error(ErrorKind::Conflict, "history_revision_requires_empty_queue"));
            }
            let history = read_history(&transaction, id, session.revision, HistorySelection::Current, &project)?;
            require_basis(&history.basis, &request.expected_history)?;
            let end: i64 = transaction.query_row(
                "SELECT COALESCE(MAX(ordinal),0) FROM turns WHERE session=?1",
                [id.as_str()],
                |row| row.get(0),
            ).map_err(database_error)?;
            let seed = make_seed(history)?;
            let closed = transaction.execute(
                "UPDATE session_history_views SET end_ordinal=?2 WHERE session=?1 AND end_ordinal IS NULL",
                params![id.as_str(), end],
            ).map_err(database_error)?;
            if closed == 0 {
                transaction.execute(
                    "INSERT INTO session_history_views(session,view,after_ordinal,end_ordinal) VALUES(?1,0,0,?2)",
                    params![id.as_str(), end],
                ).map_err(database_error)?;
            }
            let acceptance = insert_input(&transaction, id, &mut session, &request.replacement, None)?;
            bump_revision(&mut session)?;
            insert_view(&transaction, id, session.revision, &seed, end)?;
            save_session(&transaction, id, &session)?;
            save_request(
                &transaction,
                id,
                "submit",
                &request.replacement.id,
                Fingerprint::of(&request.replacement)?,
                &acceptance,
            )?;
            let receipt = HistoryRevised { view: session.revision, acceptance };
            save_request(
                &transaction,
                id,
                "history_revision",
                &request.request,
                fingerprint,
                &receipt,
            )?;
            transaction.commit().map_err(commit_error)?;
            inner.changed.notify_waiters();
            Ok(receipt)
        })
        .await
    }
}

pub(super) fn require_basis(current: &HistoryBasis, expected: &HistoryBasis) -> Result<()> {
    if current != expected {
        return Err(error(ErrorKind::Conflict, "history_basis_changed"));
    }
    Ok(())
}

fn insert_view(
    transaction: &Transaction<'_>,
    session: &SessionId,
    view: SessionRevision,
    seed: &HistorySeed,
    after: i64,
) -> Result<()> {
    let bytes = seed_bytes(seed)?;
    let identity = encode(&Fingerprint::of(seed)?)?;
    transaction.execute(
        "INSERT INTO session_history_views(session,view,seed,after_ordinal,seed_identity) VALUES(?1,?2,?3,?4,?5)",
        params![session.as_str(), sql_number(view.0)?, bytes, after, identity],
    ).map_err(database_error)?;
    Ok(())
}

pub(super) fn seed_bytes(seed: &HistorySeed) -> Result<Vec<u8>> {
    if seed.records.len() > MAX_HISTORY_RECORDS {
        return Err(projection_limit());
    }
    let bytes = encode(seed)?;
    if bytes.len() > MAX_HISTORY_BYTES {
        return Err(projection_limit());
    }
    History::new().append(HistoryPosition::default(), &seed.records)?;
    Ok(bytes)
}

#[derive(Default)]
pub(super) struct View {
    pub(super) id: SessionRevision,
    pub(super) seed: Option<HistorySeed>,
    pub(super) seed_identity: Option<Fingerprint>,
    pub(super) after: i64,
    pub(super) end: Option<i64>,
}

pub(super) fn select_view(
    connection: &Connection,
    session: &SessionId,
    selection: HistorySelection,
) -> Result<(View, Option<i64>)> {
    let (before, view) = match selection {
        HistorySelection::Current => (None, None),
        HistorySelection::BeforeTurn(turn) => {
            let ordinal = connection
                .query_row(
                    "SELECT ordinal FROM turns WHERE session=?1 AND id=?2",
                    params![session.as_str(), turn.as_str()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(database_error)?
                .ok_or_else(|| error(ErrorKind::InvalidInput, "turn_missing"))?;
            (Some(ordinal), None)
        }
        HistorySelection::View(id) => (None, Some(sql_number(id.0)?)),
    };
    let sql = match (before, view) {
        (Some(_), _) => "SELECT view,seed,after_ordinal,end_ordinal,seed_identity FROM session_history_views
                        WHERE session=?1 AND after_ordinal<?2 AND (end_ordinal IS NULL OR ?2<=end_ordinal)
                        ORDER BY after_ordinal DESC,view DESC LIMIT 1",
        (_, Some(_)) => "SELECT view,seed,after_ordinal,end_ordinal,seed_identity FROM session_history_views
                        WHERE session=?1 AND view=?2",
        _ => "SELECT view,seed,after_ordinal,end_ordinal,seed_identity FROM session_history_views
              WHERE session=?1 AND end_ordinal IS NULL",
    };
    let mut statement = connection.prepare(sql).map_err(database_error)?;
    let mut rows = if let Some(value) = before.or(view) {
        statement.query(params![session.as_str(), value])
    } else {
        statement.query([session.as_str()])
    }
    .map_err(database_error)?;
    let selected = match rows.next().map_err(database_error)? {
        Some(row) => {
            let seed = row
                .get_ref(1)
                .map_err(database_error)?
                .as_blob_or_null()
                .map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
            let seed = seed
                .map(|bytes| {
                    if bytes.len() > MAX_HISTORY_BYTES {
                        return Err(projection_limit());
                    }
                    decode(bytes)
                })
                .transpose()?;
            View {
                id: SessionRevision(unsigned(row.get(0).map_err(database_error)?)?),
                seed,
                seed_identity: row
                    .get::<_, Option<Vec<u8>>>(4)
                    .map_err(database_error)?
                    .map(|bytes| decode(&bytes))
                    .transpose()?,
                after: row.get(2).map_err(database_error)?,
                end: row.get(3).map_err(database_error)?,
            }
        }
        None if view.is_none_or(|id| id == 0) => {
            let materialized: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM session_history_views WHERE session=?1)",
                    [session.as_str()],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            if materialized {
                return Err(error(
                    ErrorKind::InvalidState,
                    "stored_history_view_missing",
                ));
            }
            View::default()
        }
        None => return Err(error(ErrorKind::InvalidInput, "history_view_missing")),
    };
    Ok((selected, before))
}

fn read_replay_page(
    connection: &Connection,
    session: &SessionId,
    mut after: i64,
    end: i64,
    project: fn(&TurnState) -> Vec<HistoryRecord>,
) -> Result<(i64, Vec<HistoryRecord>)> {
    load_session(connection, session)?;
    let mut query = connection
        .prepare(
            "SELECT ordinal,id,snapshot FROM turns WHERE session=?1 AND ordinal>?2 AND ordinal<=?3
             ORDER BY ordinal LIMIT ?4",
        )
        .map_err(database_error)?;
    let mut rows = query
        .query(params![session.as_str(), after, end, REPLAY_PAGE_TURNS])
        .map_err(database_error)?;
    let mut records = Vec::new();
    let mut scanned_bytes = 0;
    let mut scanned_turns = 0;
    while let Some(row) = rows.next().map_err(database_error)? {
        let snapshot = row
            .get_ref(2)
            .map_err(database_error)?
            .as_blob()
            .map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
        // A single durable turn may exceed the target page size. Never split
        // its projection or accumulate it alongside other large snapshots.
        if scanned_turns != 0 && scanned_bytes + snapshot.len() > MAX_HISTORY_BYTES {
            return Ok((after, records));
        }
        let turn = TurnId::new(row.get::<_, String>(1).map_err(database_error)?)?;
        let state = decode_turn(snapshot, session, &turn)?;
        records.extend(project(&state));
        after = row.get(0).map_err(database_error)?;
        scanned_turns += 1;
        scanned_bytes += snapshot.len();
    }
    if scanned_turns < REPLAY_PAGE_TURNS {
        after = end;
    }
    Ok((after, records))
}

fn read_history(
    connection: &Connection,
    session: &SessionId,
    session_revision: SessionRevision,
    selection: HistorySelection,
    project: &TurnProjection<'_>,
) -> Result<RetainedHistory> {
    let (view, before) = select_view(connection, session, selection)?;
    read_view(connection, session, session_revision, view, before, project)
}

pub(super) fn read_view(
    connection: &Connection,
    session: &SessionId,
    session_revision: SessionRevision,
    view: View,
    before: Option<i64>,
    project: &TurnProjection<'_>,
) -> Result<RetainedHistory> {
    let mut query = connection.prepare(
        "SELECT ordinal,id,snapshot FROM turns
         WHERE session=?1 AND ordinal>?2 AND (?3 IS NULL OR ordinal<=?3) AND (?4 IS NULL OR ordinal<?4)
         ORDER BY ordinal LIMIT ?5",
    ).map_err(database_error)?;
    let mut rows = query
        .query(params![
            session.as_str(),
            view.after,
            view.end,
            before,
            MAX_HISTORY_TURNS + 1
        ])
        .map_err(database_error)?;
    let mut budget = HistoryBudget::default();
    if let Some(seed) = &view.seed {
        budget.add(&seed.records)?;
    }
    let mut records = Vec::new();
    let mut snapshots = Vec::new();
    let mut scanned_turns = 0;
    let mut scanned_bytes = 0;
    while let Some(row) = rows.next().map_err(database_error)? {
        let ordinal = unsigned(row.get(0).map_err(database_error)?)?;
        let turn = TurnId::new(row.get::<_, String>(1).map_err(database_error)?)?;
        let snapshot = row
            .get_ref(2)
            .map_err(database_error)?
            .as_blob()
            .map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
        scanned_turns += 1;
        scanned_bytes += snapshot.len();
        if scanned_turns > MAX_HISTORY_TURNS || scanned_bytes > MAX_HISTORY_SCAN_BYTES {
            return Err(projection_limit());
        }
        let state = decode_turn(snapshot, session, &turn)?;
        let position = state.position();
        let projected = project(&state);
        budget.add(&projected)?;
        records.extend(projected.into_iter().map(|record| RetainedRecord {
            turn: turn.clone(),
            position,
            record,
        }));
        snapshots.push((
            HistoryTail {
                turn,
                ordinal,
                position,
            },
            state.binding().epoch,
        ));
    }
    Ok(RetainedHistory {
        basis: HistoryBasis {
            view: view.id,
            tail: snapshots.last().map(|(tail, _)| tail.clone()),
            fingerprint: Fingerprint::of(&(session, view.id, view.seed_identity, snapshots))?,
        },
        session_revision,
        seed: view.seed,
        records,
    })
}

#[derive(Default)]
struct HistoryBudget {
    records: usize,
    bytes: usize,
}

impl HistoryBudget {
    fn add(&mut self, records: &[HistoryRecord]) -> Result<()> {
        if self.records + records.len() > MAX_HISTORY_RECORDS {
            return Err(projection_limit());
        }
        for record in records {
            self.bytes += encode(record)?.len() + usize::from(self.records != 0);
            self.records += 1;
            if self.bytes > MAX_HISTORY_BYTES - 2 {
                return Err(projection_limit());
            }
        }
        Ok(())
    }
}

fn projection_limit() -> agent_kit_core::Error {
    error(ErrorKind::LimitExceeded, "history_projection_limit")
}
