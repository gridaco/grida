//! SQLite persistence for session admission and the bound execution journal.

use agent_kit_core::history::HistoryRecord;
use agent_kit_core::turn::{
    CommitReceipt, ControlDirective, ControlReader, ControlRevision, ControlSnapshot,
    JournalAction, JournalChange, TurnBinding, TurnJournal, TurnState, bind_lease,
};
use agent_kit_core::{
    BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, Result, SessionId, TurnId,
};
use agent_kit_sessions::{
    Acceptance, ClaimOutcome, ClaimRequest, ClaimedTurn, ControlReceipt, ControlRequest,
    CreateSession, InputDisposition, InputView, RecoveryRequest, SessionControl, SessionCreated,
    SessionRevision, SessionStore, SessionView, Submission, TurnDisposition, TurnSelection,
    TurnView,
};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;
use tokio::sync::Notify;

const SCHEMA_VERSION: i64 = 1;
const MAX_PENDING_INPUTS: i64 = 256;
const MAX_PENDING_BYTES: i64 = 32 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES: usize = 64 * 1024 * 1024;
const MAX_HISTORY_TURNS: i64 = 4_096;
const MAX_HISTORY_RECORDS: usize = 4_096;
const MAX_HISTORY_BYTES: usize = 8 * 1024 * 1024;
const MAX_HISTORY_SCAN_BYTES: usize = 128 * 1024 * 1024;

const SCHEMA: &str = "
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    configuration BLOB NOT NULL,
    revision INTEGER NOT NULL,
    paused INTEGER NOT NULL,
    active_turn TEXT,
    next_input INTEGER NOT NULL
);
CREATE TABLE submissions (
    session TEXT NOT NULL REFERENCES sessions(id),
    id TEXT NOT NULL,
    position INTEGER NOT NULL,
    payload BLOB NOT NULL,
    fingerprint BLOB NOT NULL,
    turn_id TEXT,
    turn_order INTEGER,
    completed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(session, id),
    UNIQUE(session, position)
);
CREATE TABLE turns (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL REFERENCES sessions(id),
    id TEXT NOT NULL,
    snapshot BLOB NOT NULL,
    UNIQUE(session, id)
);
CREATE TABLE requests (
    session TEXT NOT NULL REFERENCES sessions(id),
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    fingerprint BLOB NOT NULL,
    receipt BLOB NOT NULL,
    PRIMARY KEY(session, kind, id)
);
";

/// One opened database authority. Clones share its connection and ownership lock.
#[derive(Clone)]
pub struct SqliteStore {
    inner: Arc<Inner>,
}

struct Inner {
    connection: Mutex<Connection>,
    owners: Mutex<BTreeMap<(SessionId, TurnId), Weak<()>>>,
    changed: Notify,
    _lock: File,
}

struct SessionRecord {
    configuration: Envelope,
    revision: SessionRevision,
    paused: bool,
    active_turn: Option<TurnId>,
    next_input: u64,
}

#[derive(Serialize, Deserialize)]
struct ClaimRecord {
    turn: TurnId,
}

struct Acquired {
    binding: TurnBinding,
    configuration: Envelope,
    inputs: Vec<Submission>,
    owner: Arc<()>,
}

enum PreparedClaim {
    Acquired(Acquired),
    Existing(TurnView),
}

impl SqliteStore {
    /// Open a private application database with synchronous WAL commits.
    ///
    /// The parent directory must exist. One process owns this database while
    /// any store or bound journal handle remains alive.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if path.file_name().is_none() || !path.parent().is_some_and(Path::is_dir) {
            return Err(error(ErrorKind::InvalidInput, "store_directory_missing"));
        }
        let parent = path
            .parent()
            .ok_or_else(|| error(ErrorKind::InvalidInput, "store_directory_missing"))?;
        require_private_directory(parent)?;
        let path = parent
            .canonicalize()
            .map_err(|_| error(ErrorKind::Unavailable, "store_directory_unavailable"))?
            .join(
                path.file_name()
                    .ok_or_else(|| error(ErrorKind::InvalidInput, "store_filename_missing"))?,
            );
        let lock_path = lock_path(&path);
        let lock = open_private_file(&lock_path)?;
        lock.try_lock()
            .map_err(|_| error(ErrorKind::Unavailable, "store_already_owned"))?;
        let database = open_private_file(&path)?;
        drop(database);
        let mut connection = Connection::open(&path).map_err(database_error)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(database_error)?;
        connection
            .pragma_update(None, "foreign_keys", true)
            .map_err(database_error)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(database_error)?;
        connection
            .pragma_update(None, "synchronous", "FULL")
            .map_err(database_error)?;
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(database_error)?;
        match version {
            0 => {
                let transaction = connection.transaction().map_err(database_error)?;
                transaction.execute_batch(SCHEMA).map_err(database_error)?;
                transaction
                    .pragma_update(None, "user_version", SCHEMA_VERSION)
                    .map_err(database_error)?;
                transaction.commit().map_err(database_error)?;
            }
            SCHEMA_VERSION => {}
            _ => return Err(error(ErrorKind::Unsupported, "store_schema_unsupported")),
        }
        Ok(Self {
            inner: Arc::new(Inner {
                connection: Mutex::new(connection),
                owners: Mutex::new(BTreeMap::new()),
                changed: Notify::new(),
                _lock: lock,
            }),
        })
    }

    /// Read committed history in turn creation and record append order.
    ///
    /// A `before_turn` cut excludes that turn and all subsequent turns. The
    /// cut must identify a turn in the supplied session. Projection is bounded
    /// and returns `history_projection_limit` if a full result would exceed it.
    pub async fn history(
        &self,
        session: SessionId,
        before_turn: Option<TurnId>,
    ) -> Result<Vec<HistoryRecord>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            load_session(connection, &session)?;
            let before = before_turn
                .map(|turn| {
                    connection
                        .query_row(
                            "SELECT ordinal FROM turns WHERE session=?1 AND id=?2",
                            params![session.as_str(), turn.as_str()],
                            |row| row.get::<_, i64>(0),
                        )
                        .optional()
                        .map_err(database_error)?
                        .ok_or_else(|| error(ErrorKind::InvalidInput, "turn_missing"))
                })
                .transpose()?;
            let mut query = connection
                .prepare(
                    "SELECT id,snapshot FROM turns
                     WHERE session=?1 AND (?2 IS NULL OR ordinal<?2)
                     ORDER BY ordinal LIMIT ?3",
                )
                .map_err(database_error)?;
            let mut rows = query
                .query(params![session.as_str(), before, MAX_HISTORY_TURNS + 1])
                .map_err(database_error)?;
            let mut history = Vec::new();
            let mut scanned_turns = 0;
            let mut scanned_bytes = 0;
            let mut result_bytes = 2;
            while let Some(row) = rows.next().map_err(database_error)? {
                let turn = TurnId::new(row.get::<_, String>(0).map_err(database_error)?)?;
                let snapshot = row
                    .get_ref(1)
                    .map_err(database_error)?
                    .as_blob()
                    .map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
                scanned_turns += 1;
                scanned_bytes += snapshot.len();
                if scanned_turns > MAX_HISTORY_TURNS || scanned_bytes > MAX_HISTORY_SCAN_BYTES {
                    return Err(error(ErrorKind::LimitExceeded, "history_projection_limit"));
                }
                let state = decode_turn(snapshot, &session, &turn)?;
                let records = state.history().records();
                if history.len() + records.len() > MAX_HISTORY_RECORDS {
                    return Err(error(ErrorKind::LimitExceeded, "history_projection_limit"));
                }
                for record in records {
                    result_bytes += encode(record)?.len() + usize::from(!history.is_empty());
                    if result_bytes > MAX_HISTORY_BYTES {
                        return Err(error(ErrorKind::LimitExceeded, "history_projection_limit"));
                    }
                    history.push(record.clone());
                }
            }
            Ok(history)
        })
        .await
    }

    fn acquire(&self, request: ClaimRequest) -> BoxFuture<'_, Result<ClaimOutcome>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            let prepared = execute(Arc::clone(&inner), move |inner, connection| {
                let transaction = connection
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(database_error)?;
                let fingerprint = Fingerprint::of(&request)?;
                if let Some(receipt) = lookup_request::<ClaimRecord>(
                    &transaction,
                    &request.session,
                    "claim",
                    &request.id,
                    fingerprint,
                )? {
                    let state = load_turn(&transaction, &request.session, &receipt.turn)?;
                    return Ok(PreparedClaim::Existing(turn_view(inner, &state)?));
                }
                let mut session = load_session(&transaction, &request.session)?;
                require_revision(&session, request.expected_revision)?;
                if session.paused {
                    return Err(error(ErrorKind::InvalidState, "session_admission_paused"));
                }
                let (state, inputs) = match &request.selection {
                    TurnSelection::New { turn, inputs } => {
                        if session.active_turn.is_some() {
                            return Err(error(ErrorKind::Conflict, "session_turn_active"));
                        }
                        if inputs.is_empty() || inputs.len() > MAX_PENDING_INPUTS as usize {
                            return Err(error(ErrorKind::InvalidInput, "invalid_input_selection"));
                        }
                        let unique: BTreeSet<_> = inputs.iter().collect();
                        if unique.len() != inputs.len() {
                            return Err(error(ErrorKind::InvalidInput, "duplicate_input_selection"));
                        }
                        let exists: bool = transaction.query_row(
                            "SELECT EXISTS(SELECT 1 FROM turns WHERE session=?1 AND id=?2)",
                            params![request.session.as_str(), turn.as_str()],
                            |row| row.get(0),
                        ).map_err(database_error)?;
                        if exists {
                            return Err(error(ErrorKind::Conflict, "turn_exists"));
                        }
                        let state = TurnState::new(TurnBinding {
                            session: request.session.clone(),
                            turn: turn.clone(),
                            epoch: 1,
                        })?;
                        let mut selected = Vec::with_capacity(inputs.len());
                        for id in inputs {
                            let input = load_input(&transaction, &request.session, id)?;
                            if input.disposition != InputDisposition::Queued {
                                return Err(error(ErrorKind::Conflict, "input_already_claimed"));
                            }
                            selected.push(input.input);
                        }
                        transaction.execute(
                            "INSERT INTO turns(session,id,snapshot) VALUES(?1,?2,?3)",
                            params![request.session.as_str(), turn.as_str(), encode_snapshot(&state)?],
                        ).map_err(database_error)?;
                        for (order, id) in inputs.iter().enumerate() {
                            transaction.execute(
                                "UPDATE submissions SET turn_id=?3,turn_order=?4 WHERE session=?1 AND id=?2",
                                params![request.session.as_str(), id.as_str(), turn.as_str(), order as i64],
                            ).map_err(database_error)?;
                        }
                        (state, selected)
                    }
                    TurnSelection::Resume { turn, epoch, position } => {
                        if session.active_turn.as_ref() != Some(turn) {
                            return Err(error(ErrorKind::Conflict, "active_turn_mismatch"));
                        }
                        let mut state = load_turn(&transaction, &request.session, turn)?;
                        if !state.is_suspended() || state.position() != *position || state.binding().epoch != *epoch {
                            return Err(error(ErrorKind::Conflict, "suspension_mismatch"));
                        }
                        if !state.controls().admits_work() {
                            return Err(error(ErrorKind::InvalidState, "turn_admission_closed"));
                        }
                        require_released(inner, state.binding())?;
                        rebind(&mut state)?;
                        save_turn(&transaction, &state)?;
                        let inputs = turn_inputs(&transaction, &request.session, turn)?;
                        (state, inputs)
                    }
                };
                let owner = register_owner(inner, state.binding())?;
                session.active_turn = Some(state.binding().turn.clone());
                bump_revision(&mut session)?;
                save_session(&transaction, &request.session, &session)?;
                save_request(
                    &transaction,
                    &request.session,
                    "claim",
                    &request.id,
                    fingerprint,
                    &ClaimRecord { turn: state.binding().turn.clone() },
                )?;
                transaction.commit().map_err(commit_error)?;
                Ok(PreparedClaim::Acquired(Acquired {
                    binding: state.binding().clone(),
                    configuration: session.configuration,
                    inputs,
                    owner,
                }))
            }).await?;
            finish_claim(inner, prepared)
        })
    }
}

impl SessionStore for SqliteStore {
    fn create(&self, request: CreateSession) -> BoxFuture<'_, Result<SessionCreated>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = Fingerprint::of(&request)?;
            if let Some(receipt) = lookup_request(
                &transaction,
                &request.id,
                "create",
                &request.request,
                fingerprint,
            )? {
                return Ok(receipt);
            }
            let exists: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1)",
                    [request.id.as_str()],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            if exists {
                return Err(error(ErrorKind::Conflict, "session_exists"));
            }
            transaction.execute(
                "INSERT INTO sessions(id,configuration,revision,paused,next_input) VALUES(?1,?2,0,0,0)",
                params![request.id.as_str(), encode(&request.configuration)?],
            ).map_err(database_error)?;
            let receipt = SessionCreated {
                session: request.id.clone(),
                revision: SessionRevision(0),
            };
            save_request(
                &transaction,
                &request.id,
                "create",
                &request.request,
                fingerprint,
                &receipt,
            )?;
            transaction.commit().map_err(commit_error)?;
            Ok(receipt)
        })
    }

    fn submit(
        &self,
        session_id: SessionId,
        input: Submission,
    ) -> BoxFuture<'_, Result<Acceptance>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let mut session = load_session(&transaction, &session_id)?;
            let fingerprint = Fingerprint::of(&input)?;
            if let Some(receipt) =
                lookup_request(&transaction, &session_id, "submit", &input.id, fingerprint)?
            {
                return Ok(receipt);
            }
            let (count, bytes): (i64, i64) = transaction.query_row(
                "SELECT COUNT(*),COALESCE(SUM(length(payload)),0) FROM submissions WHERE session=?1 AND turn_id IS NULL",
                [session_id.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).map_err(database_error)?;
            let payload = encode(&input.payload)?;
            if count >= MAX_PENDING_INPUTS
                || bytes.saturating_add(payload.len() as i64) > MAX_PENDING_BYTES
            {
                return Err(error(ErrorKind::LimitExceeded, "session_queue_full"));
            }
            let receipt = Acceptance {
                session: session_id.clone(),
                input: input.id.clone(),
                position: session.next_input,
            };
            transaction.execute(
                "INSERT INTO submissions(session,id,position,payload,fingerprint) VALUES(?1,?2,?3,?4,?5)",
                params![
                    session_id.as_str(),
                    input.id.as_str(),
                    sql_number(session.next_input)?,
                    payload,
                    fingerprint.bytes().as_slice(),
                ],
            ).map_err(database_error)?;
            session.next_input = session
                .next_input
                .checked_add(1)
                .ok_or_else(|| error(ErrorKind::LimitExceeded, "input_position_overflow"))?;
            bump_revision(&mut session)?;
            save_session(&transaction, &session_id, &session)?;
            save_request(
                &transaction,
                &session_id,
                "submit",
                &input.id,
                fingerprint,
                &receipt,
            )?;
            transaction.commit().map_err(commit_error)?;
            Ok(receipt)
        })
    }

    fn claim(&self, request: ClaimRequest) -> BoxFuture<'_, Result<ClaimOutcome>> {
        self.acquire(request)
    }

    fn recover(&self, request: RecoveryRequest) -> BoxFuture<'_, Result<ClaimOutcome>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            let prepared = execute(Arc::clone(&inner), move |inner, connection| {
                let transaction = connection
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(database_error)?;
                let fingerprint = Fingerprint::of(&request)?;
                if let Some(receipt) = lookup_request::<ClaimRecord>(
                    &transaction,
                    &request.session,
                    "recover",
                    &request.id,
                    fingerprint,
                )? {
                    return Ok(PreparedClaim::Existing(turn_view(
                        inner,
                        &load_turn(&transaction, &request.session, &receipt.turn)?,
                    )?));
                }
                let mut session = load_session(&transaction, &request.session)?;
                if session.active_turn.as_ref() != Some(&request.turn) {
                    return Err(error(ErrorKind::Conflict, "active_turn_mismatch"));
                }
                let mut state = load_turn(&transaction, &request.session, &request.turn)?;
                if state.binding().epoch != request.expected_epoch
                    || (state.is_suspended() && !state.controls().cancelled)
                    || state.outcome().is_some()
                {
                    return Err(error(ErrorKind::Conflict, "recovery_state_mismatch"));
                }
                require_released(inner, state.binding())?;
                rebind(&mut state)?;
                save_turn(&transaction, &state)?;
                let owner = register_owner(inner, state.binding())?;
                bump_revision(&mut session)?;
                save_session(&transaction, &request.session, &session)?;
                save_request(
                    &transaction,
                    &request.session,
                    "recover",
                    &request.id,
                    fingerprint,
                    &ClaimRecord {
                        turn: request.turn.clone(),
                    },
                )?;
                let inputs = turn_inputs(&transaction, &request.session, &request.turn)?;
                transaction.commit().map_err(commit_error)?;
                Ok(PreparedClaim::Acquired(Acquired {
                    binding: state.binding().clone(),
                    configuration: session.configuration,
                    inputs,
                    owner,
                }))
            })
            .await?;
            finish_claim(inner, prepared)
        })
    }

    fn control(&self, request: ControlRequest) -> BoxFuture<'_, Result<ControlReceipt>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = Fingerprint::of(&request)?;
            if let Some(receipt) = lookup_request(
                &transaction,
                &request.session,
                "control",
                &request.id,
                fingerprint,
            )? {
                return Ok(receipt);
            }
            let mut session = load_session(&transaction, &request.session)?;
            require_revision(&session, request.expected_revision)?;
            let action = match &request.action {
                SessionControl::PauseAdmission => {
                    session.paused = true;
                    None
                }
                SessionControl::ResumeAdmission => {
                    session.paused = false;
                    None
                }
                SessionControl::Turn {
                    turn,
                    expected,
                    directive,
                } => Some((turn, *expected, JournalAction::Control(*directive))),
                SessionControl::Resolve {
                    turn,
                    expected,
                    wait,
                    answer,
                } => Some((
                    turn,
                    *expected,
                    JournalAction::ResolveWait {
                        wait: wait.clone(),
                        answer: answer.clone(),
                    },
                )),
                SessionControl::PauseAndCancel { turn, expected } => {
                    session.paused = true;
                    Some((
                        turn,
                        *expected,
                        JournalAction::Control(ControlDirective::Cancel),
                    ))
                }
            };
            let turn_receipt = if let Some((turn, expected, action)) = action {
                if session.active_turn.as_ref() != Some(turn) {
                    return Err(error(ErrorKind::Conflict, "active_turn_mismatch"));
                }
                let mut state = load_turn(&transaction, &request.session, turn)?;
                let change = JournalChange::new(
                    request.id.clone(),
                    state.binding().clone(),
                    state.position(),
                    expected,
                    vec![action],
                )?;
                let receipt = state.apply(change)?;
                save_turn(&transaction, &state)?;
                Some(receipt)
            } else {
                None
            };
            bump_revision(&mut session)?;
            save_session(&transaction, &request.session, &session)?;
            let receipt = ControlReceipt {
                session: request.session.clone(),
                request: request.id.clone(),
                revision: session.revision,
                turn: turn_receipt,
            };
            save_request(
                &transaction,
                &request.session,
                "control",
                &request.id,
                fingerprint,
                &receipt,
            )?;
            transaction.commit().map_err(commit_error)?;
            inner.changed.notify_waiters();
            Ok(receipt)
        })
    }

    fn inspect(&self, session_id: SessionId) -> BoxFuture<'_, Result<SessionView>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let session = load_session(connection, &session_id)?;
            let mut statement = connection.prepare(
                "SELECT id FROM submissions WHERE session=?1 AND turn_id IS NULL ORDER BY position",
            ).map_err(database_error)?;
            let ids = statement
                .query_map([session_id.as_str()], |row| row.get::<_, String>(0))
                .map_err(database_error)?
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(database_error)?;
            let queued = ids
                .into_iter()
                .map(|id| load_input(connection, &session_id, &ChangeId::new(id)?))
                .collect::<Result<Vec<_>>>()?;
            let current = session
                .active_turn
                .as_ref()
                .map(|id| {
                    load_turn(connection, &session_id, id)
                        .and_then(|state| turn_view(inner, &state))
                })
                .transpose()?;
            let latest_id: Option<String> = connection
                .query_row(
                    "SELECT id FROM turns WHERE session=?1 ORDER BY ordinal DESC LIMIT 1",
                    [session_id.as_str()],
                    |row| row.get(0),
                )
                .optional()
                .map_err(database_error)?;
            let latest = latest_id
                .map(|id| {
                    load_turn(connection, &session_id, &TurnId::new(id)?)
                        .and_then(|state| turn_view(inner, &state))
                })
                .transpose()?;
            Ok(SessionView {
                session: session_id,
                revision: session.revision,
                configuration: session.configuration,
                admission_paused: session.paused,
                queued,
                current,
                latest,
            })
        })
    }

    fn inspect_turn(&self, session: SessionId, turn: TurnId) -> BoxFuture<'_, Result<TurnView>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            turn_view(inner, &load_turn(connection, &session, &turn)?)
        })
    }

    fn verify(&self, receipt: CommitReceipt) -> BoxFuture<'_, Result<()>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let record = receipt.record();
            let state = load_turn(connection, &record.binding.session, &record.binding.turn)?;
            if state.receipt(&record.change) != Some(&receipt) {
                return Err(error(ErrorKind::Conflict, "receipt_not_committed"));
            }
            Ok(())
        })
    }
}

struct SqliteJournal {
    inner: Arc<Inner>,
    binding: TurnBinding,
    _owner: Arc<()>,
}

struct SqliteControls {
    inner: Arc<Inner>,
    binding: TurnBinding,
}

impl TurnJournal for SqliteJournal {
    fn binding(&self) -> &TurnBinding {
        &self.binding
    }

    fn load(&self) -> BoxFuture<'_, Result<TurnState>> {
        let binding = self.binding.clone();
        execute(Arc::clone(&self.inner), move |_, connection| {
            let state = load_turn(connection, &binding.session, &binding.turn)?;
            require_binding(&state, &binding)?;
            Ok(state)
        })
    }

    fn commit(&self, change: JournalChange) -> BoxFuture<'_, Result<CommitReceipt>> {
        let binding = self.binding.clone();
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let mut state = load_turn(&transaction, &binding.session, &binding.turn)?;
            require_binding(&state, &binding)?;
            let receipt = state.apply(change)?;
            save_turn(&transaction, &state)?;
            if state.outcome().is_some() {
                let mut session = load_session(&transaction, &binding.session)?;
                if session.active_turn.as_ref() == Some(&binding.turn) {
                    session.active_turn = None;
                    bump_revision(&mut session)?;
                    save_session(&transaction, &binding.session, &session)?;
                    transaction
                        .execute(
                            "UPDATE submissions SET completed=1 WHERE session=?1 AND turn_id=?2",
                            params![binding.session.as_str(), binding.turn.as_str()],
                        )
                        .map_err(database_error)?;
                }
            }
            transaction.commit().map_err(commit_error)?;
            inner.changed.notify_waiters();
            Ok(receipt)
        })
    }

    fn lookup(&self, change: ChangeId) -> BoxFuture<'_, Result<Option<CommitReceipt>>> {
        let binding = self.binding.clone();
        execute(Arc::clone(&self.inner), move |_, connection| {
            Ok(load_turn(connection, &binding.session, &binding.turn)?
                .receipt(&change)
                .cloned())
        })
    }
}

impl ControlReader for SqliteControls {
    fn binding(&self) -> &TurnBinding {
        &self.binding
    }

    fn read(&self) -> BoxFuture<'_, Result<ControlSnapshot>> {
        let binding = self.binding.clone();
        execute(Arc::clone(&self.inner), move |_, connection| {
            let state = load_turn(connection, &binding.session, &binding.turn)?;
            require_binding(&state, &binding)?;
            Ok(state.controls().clone())
        })
    }

    fn changed(&self, after: ControlRevision) -> BoxFuture<'_, Result<ControlSnapshot>> {
        Box::pin(async move {
            loop {
                let notification = self.inner.changed.notified();
                tokio::pin!(notification);
                notification.as_mut().enable();
                let snapshot = self.read().await?;
                if snapshot.revision != after {
                    return Ok(snapshot);
                }
                notification.await;
            }
        })
    }
}

fn finish_claim(inner: Arc<Inner>, prepared: PreparedClaim) -> Result<ClaimOutcome> {
    match prepared {
        PreparedClaim::Existing(view) => Ok(ClaimOutcome::Existing(view)),
        PreparedClaim::Acquired(claim) => {
            let journal = SqliteJournal {
                inner: Arc::clone(&inner),
                binding: claim.binding.clone(),
                _owner: claim.owner,
            };
            let controls = SqliteControls {
                inner,
                binding: claim.binding.clone(),
            };
            let lease = bind_lease(claim.binding, Box::new(journal), Arc::new(controls))?;
            Ok(ClaimOutcome::Acquired(ClaimedTurn {
                configuration: claim.configuration,
                inputs: claim.inputs,
                lease,
            }))
        }
    }
}

fn execute<T: Send + 'static>(
    inner: Arc<Inner>,
    operation: impl FnOnce(&Inner, &mut Connection) -> Result<T> + Send + 'static,
) -> BoxFuture<'static, Result<T>> {
    Box::pin(async move {
        tokio::task::spawn_blocking(move || {
            let mut connection = inner
                .connection
                .lock()
                .map_err(|_| error(ErrorKind::Unavailable, "store_connection_poisoned"))?;
            operation(&inner, &mut connection)
        })
        .await
        .map_err(|_| error(ErrorKind::Uncertain, "store_task_interrupted"))?
    })
}

fn load_session(connection: &Connection, id: &SessionId) -> Result<SessionRecord> {
    let row = connection
        .query_row(
            "SELECT configuration,revision,paused,active_turn,next_input FROM sessions WHERE id=?1",
            [id.as_str()],
            |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, bool>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "session_missing"))?;
    Ok(SessionRecord {
        configuration: decode(&row.0)?,
        revision: SessionRevision(unsigned(row.1)?),
        paused: row.2,
        active_turn: row.3.map(TurnId::new).transpose()?,
        next_input: unsigned(row.4)?,
    })
}

fn save_session(
    transaction: &Transaction<'_>,
    id: &SessionId,
    session: &SessionRecord,
) -> Result<()> {
    transaction
        .execute(
            "UPDATE sessions SET revision=?2,paused=?3,active_turn=?4,next_input=?5 WHERE id=?1",
            params![
                id.as_str(),
                sql_number(session.revision.0)?,
                session.paused,
                session.active_turn.as_ref().map(TurnId::as_str),
                sql_number(session.next_input)?
            ],
        )
        .map_err(database_error)?;
    Ok(())
}

fn load_input(connection: &Connection, session: &SessionId, id: &ChangeId) -> Result<InputView> {
    let (position, bytes, turn, completed, fingerprint) = connection
        .query_row(
            "SELECT position,payload,turn_id,completed,fingerprint FROM submissions WHERE session=?1 AND id=?2",
            params![session.as_str(), id.as_str()],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                    row.get::<_, Vec<u8>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "submission_missing"))?;
    let disposition = match turn {
        None => InputDisposition::Queued,
        Some(turn) if completed => InputDisposition::Completed {
            turn: TurnId::new(turn)?,
        },
        Some(turn) => InputDisposition::Claimed {
            turn: TurnId::new(turn)?,
        },
    };
    let input = Submission {
        id: id.clone(),
        payload: decode(&bytes)?,
    };
    if fingerprint.as_slice() != Fingerprint::of(&input)?.bytes() {
        return Err(error(
            ErrorKind::InvalidState,
            "stored_input_fingerprint_mismatch",
        ));
    }
    Ok(InputView {
        input,
        position: unsigned(position)?,
        disposition,
    })
}

fn turn_inputs(
    connection: &Connection,
    session: &SessionId,
    turn: &TurnId,
) -> Result<Vec<Submission>> {
    let mut statement = connection
        .prepare("SELECT id FROM submissions WHERE session=?1 AND turn_id=?2 ORDER BY turn_order")
        .map_err(database_error)?;
    let ids = statement
        .query_map(params![session.as_str(), turn.as_str()], |row| {
            row.get::<_, String>(0)
        })
        .map_err(database_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(database_error)?;
    ids.into_iter()
        .map(|id| Ok(load_input(connection, session, &ChangeId::new(id)?)?.input))
        .collect()
}

fn load_turn(connection: &Connection, session: &SessionId, turn: &TurnId) -> Result<TurnState> {
    let bytes: Vec<u8> = connection
        .query_row(
            "SELECT snapshot FROM turns WHERE session=?1 AND id=?2",
            params![session.as_str(), turn.as_str()],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "turn_missing"))?;
    decode_turn(&bytes, session, turn)
}

fn decode_turn(bytes: &[u8], session: &SessionId, turn: &TurnId) -> Result<TurnState> {
    if bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err(error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"));
    }
    let state: TurnState = decode(bytes)?;
    if &state.binding().session != session || &state.binding().turn != turn {
        return Err(error(
            ErrorKind::InvalidState,
            "stored_turn_binding_mismatch",
        ));
    }
    Ok(state)
}

fn save_turn(transaction: &Transaction<'_>, state: &TurnState) -> Result<()> {
    transaction
        .execute(
            "UPDATE turns SET snapshot=?3 WHERE session=?1 AND id=?2",
            params![
                state.binding().session.as_str(),
                state.binding().turn.as_str(),
                encode_snapshot(state)?
            ],
        )
        .map_err(database_error)?;
    Ok(())
}

fn lookup_request<T: DeserializeOwned>(
    connection: &Connection,
    session: &SessionId,
    kind: &str,
    id: &ChangeId,
    fingerprint: Fingerprint,
) -> Result<Option<T>> {
    let row: Option<(Vec<u8>, Vec<u8>)> = connection
        .query_row(
            "SELECT fingerprint,receipt FROM requests WHERE session=?1 AND kind=?2 AND id=?3",
            params![session.as_str(), kind, id.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    row.map(|(stored, receipt)| {
        if stored.as_slice() != fingerprint.bytes() {
            return Err(error(ErrorKind::Conflict, "request_identity_reused"));
        }
        decode(&receipt)
    })
    .transpose()
}

fn save_request(
    transaction: &Transaction<'_>,
    session: &SessionId,
    kind: &str,
    id: &ChangeId,
    fingerprint: Fingerprint,
    receipt: &impl Serialize,
) -> Result<()> {
    transaction
        .execute(
            "INSERT INTO requests(session,kind,id,fingerprint,receipt) VALUES(?1,?2,?3,?4,?5)",
            params![
                session.as_str(),
                kind,
                id.as_str(),
                fingerprint.bytes().as_slice(),
                encode(receipt)?
            ],
        )
        .map_err(database_error)?;
    Ok(())
}

fn turn_view(inner: &Inner, state: &TurnState) -> Result<TurnView> {
    let disposition = if state.outcome().is_some() {
        TurnDisposition::Settled
    } else if state.is_suspended() {
        TurnDisposition::Suspended
    } else if has_owner(inner, state.binding())? {
        TurnDisposition::Running
    } else {
        TurnDisposition::Interrupted
    };
    Ok(TurnView {
        binding: state.binding().clone(),
        position: state.position(),
        controls: state.controls().clone(),
        disposition,
        outcome: state.outcome().cloned(),
    })
}

fn has_owner(inner: &Inner, binding: &TurnBinding) -> Result<bool> {
    let owners = inner
        .owners
        .lock()
        .map_err(|_| error(ErrorKind::Unavailable, "store_owners_poisoned"))?;
    Ok(owners
        .get(&(binding.session.clone(), binding.turn.clone()))
        .is_some_and(|owner| owner.strong_count() > 0))
}

fn require_released(inner: &Inner, binding: &TurnBinding) -> Result<()> {
    if has_owner(inner, binding)? {
        return Err(error(ErrorKind::Conflict, "turn_still_owned"));
    }
    Ok(())
}

fn register_owner(inner: &Inner, binding: &TurnBinding) -> Result<Arc<()>> {
    let mut owners = inner
        .owners
        .lock()
        .map_err(|_| error(ErrorKind::Unavailable, "store_owners_poisoned"))?;
    owners.retain(|_, owner| owner.strong_count() > 0);
    let key = (binding.session.clone(), binding.turn.clone());
    if owners.contains_key(&key) {
        return Err(error(ErrorKind::Conflict, "turn_still_owned"));
    }
    let owner = Arc::new(());
    owners.insert(key, Arc::downgrade(&owner));
    Ok(owner)
}

fn require_revision(session: &SessionRecord, revision: SessionRevision) -> Result<()> {
    if session.revision != revision {
        return Err(error(ErrorKind::Conflict, "stale_session_revision"));
    }
    Ok(())
}

fn require_binding(state: &TurnState, binding: &TurnBinding) -> Result<()> {
    if state.binding() != binding {
        return Err(error(ErrorKind::Conflict, "stale_writer_epoch"));
    }
    Ok(())
}

fn rebind(state: &mut TurnState) -> Result<()> {
    let mut binding = state.binding().clone();
    binding.epoch = binding
        .epoch
        .checked_add(1)
        .ok_or_else(|| error(ErrorKind::LimitExceeded, "writer_epoch_overflow"))?;
    state.rebind(binding)
}

fn bump_revision(session: &mut SessionRecord) -> Result<()> {
    session.revision.0 = session
        .revision
        .0
        .checked_add(1)
        .ok_or_else(|| error(ErrorKind::LimitExceeded, "session_revision_overflow"))?;
    sql_number(session.revision.0)?;
    Ok(())
}

fn unsigned(value: i64) -> Result<u64> {
    u64::try_from(value).map_err(|_| error(ErrorKind::InvalidState, "negative_stored_position"))
}
fn sql_number(value: u64) -> Result<i64> {
    i64::try_from(value).map_err(|_| error(ErrorKind::LimitExceeded, "sqlite_integer_overflow"))
}
fn encode(value: &impl Serialize) -> Result<Vec<u8>> {
    serde_json::to_vec(value).map_err(|_| error(ErrorKind::InvalidInput, "store_encoding_failed"))
}
fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    serde_json::from_slice(bytes).map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))
}
fn encode_snapshot(state: &TurnState) -> Result<Vec<u8>> {
    let bytes = encode(state)?;
    if bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err(error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"));
    }
    Ok(bytes)
}
fn error(kind: ErrorKind, code: &str) -> Error {
    Error::new(kind, code)
}
fn database_error(_: rusqlite::Error) -> Error {
    error(ErrorKind::Unavailable, "sqlite_operation_failed")
}
fn commit_error(_: rusqlite::Error) -> Error {
    error(ErrorKind::Uncertain, "sqlite_commit_unconfirmed")
}
fn lock_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".lock");
    PathBuf::from(value)
}
fn open_private_file(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    if let Ok(metadata) = std::fs::symlink_metadata(path)
        && !metadata.is_file()
    {
        return Err(error(ErrorKind::InvalidInput, "store_file_not_regular"));
    }
    let file = options
        .open(path)
        .map_err(|_| error(ErrorKind::Unavailable, "store_file_unavailable"))?;
    let metadata = file
        .metadata()
        .map_err(|_| error(ErrorKind::Unavailable, "store_file_unavailable"))?;
    if !metadata.is_file() {
        return Err(error(ErrorKind::InvalidInput, "store_file_not_regular"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() & 0o077 != 0 || metadata.nlink() != 1 {
            return Err(error(ErrorKind::InvalidInput, "store_file_not_private"));
        }
    }
    Ok(file)
}

fn require_private_directory(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(path)
            .map_err(|_| error(ErrorKind::Unavailable, "store_directory_unavailable"))?;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err(error(
                ErrorKind::InvalidInput,
                "store_directory_not_private",
            ));
        }
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
