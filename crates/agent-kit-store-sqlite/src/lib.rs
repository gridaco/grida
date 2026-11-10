//! SQLite persistence for session admission and the bound execution journal.

pub mod catalog;
pub mod context;
mod control_pair;
pub mod deletion;
pub mod driver;
pub mod history;
mod resume;

pub use control_pair::{OperationPairControl, OperationPairReceipt, OperationRelatedControl};
pub use resume::{ResumeClaimOutcome, ResumeClaimReceipt, ResumeCompanion};

use agent_kit_core::driver_state::{DriverStateChange, DriverStateSnapshot};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::turn::{
    CommitReceipt, ControlDirective, ControlReader, ControlRevision, ControlSnapshot,
    JournalAction, JournalChange, OperationInput, TurnBinding, TurnJournal, TurnState, bind_lease,
};
use agent_kit_core::{
    AttemptId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, OperationId, Result,
    SessionId, TurnId,
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

const SCHEMA_VERSION: i64 = 10;
const MAX_PENDING_INPUTS: i64 = 256;
const MAX_PENDING_BYTES: i64 = 32 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES: usize = 64 * 1024 * 1024;
const MAX_HISTORY_TURNS: i64 = 4_096;
const MAX_HISTORY_RECORDS: usize = 4_096;
const MAX_HISTORY_BYTES: usize = 8 * 1024 * 1024;
const MAX_HISTORY_SCAN_BYTES: usize = 128 * 1024 * 1024;
const OPERATION_CLAIM: &str = "operation-claim";

/// The exact running tool attempt allowed to create one independent turn.
#[derive(Clone, Debug, Serialize)]
pub struct OperationClaimSource {
    pub binding: TurnBinding,
    pub control: ControlRevision,
    pub operation: OperationId,
    pub attempt: AttemptId,
    pub action: Fingerprint,
}

/// Create a fresh session and claim its first input from a running operation.
/// The caller selects the destination identities and the opaque driver state.
#[derive(Clone, Debug, Serialize)]
pub struct OperationClaim {
    pub source: OperationClaimSource,
    pub create: CreateSession,
    pub claim: ClaimRequest,
    pub input: Submission,
    pub driver_state: DriverStateChange,
}

const SCHEMA: &str = "
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    configuration BLOB NOT NULL,
    revision INTEGER NOT NULL,
    paused INTEGER NOT NULL,
    active_turn TEXT,
    next_input INTEGER NOT NULL,
    driver_state BLOB
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
    queue_order INTEGER CHECK(queue_order IS NULL OR queue_order >= 0),
    replacement_id TEXT,
    withdrawn INTEGER NOT NULL DEFAULT 0 CHECK(withdrawn IN (0, 1)),
    PRIMARY KEY(session, id),
    UNIQUE(session, position)
);
CREATE UNIQUE INDEX submission_queue_order ON submissions(session,queue_order)
WHERE queue_order IS NOT NULL;
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

const UPGRADE_QUEUE: &str = "
ALTER TABLE submissions ADD COLUMN queue_order INTEGER CHECK(queue_order IS NULL OR queue_order >= 0);
ALTER TABLE submissions ADD COLUMN replacement_id TEXT;
ALTER TABLE submissions ADD COLUMN withdrawn INTEGER NOT NULL DEFAULT 0 CHECK(withdrawn IN (0, 1));
UPDATE submissions SET queue_order=position WHERE turn_id IS NULL;
CREATE UNIQUE INDEX submission_queue_order ON submissions(session,queue_order)
WHERE queue_order IS NOT NULL;
";

const HISTORY_VIEWS: &str = "
CREATE INDEX session_turn_order ON turns(session,ordinal);
CREATE TABLE session_history_views (
    session TEXT NOT NULL REFERENCES sessions(id),
    view INTEGER NOT NULL CHECK(view >= 0),
    seed BLOB,
    seed_identity BLOB CHECK((seed IS NULL) = (seed_identity IS NULL)),
    after_ordinal INTEGER NOT NULL CHECK(after_ordinal >= 0),
    end_ordinal INTEGER CHECK(end_ordinal IS NULL OR end_ordinal >= after_ordinal),
    PRIMARY KEY(session, view)
);
CREATE UNIQUE INDEX active_history_view ON session_history_views(session)
WHERE end_ordinal IS NULL;
CREATE INDEX history_view_order ON session_history_views(session,after_ordinal,view);
";

const CONTEXT_REPLACEMENTS: &str = "
CREATE TABLE session_context_replacements (
    session TEXT NOT NULL REFERENCES sessions(id),
    view INTEGER NOT NULL CHECK(view >= 0),
    turn_ordinal INTEGER NOT NULL REFERENCES turns(ordinal),
    replacement BLOB NOT NULL,
    identity BLOB NOT NULL,
    PRIMARY KEY(session,view,turn_ordinal)
);
";

/// One opened database authority. Clones share its connection and ownership lock.
#[derive(Clone)]
pub struct SqliteStore {
    inner: Arc<Inner>,
}

/// An input and its associated turn read from the same committed state.
pub struct InputObservation {
    pub input: InputView,
    pub turn: Option<TurnView>,
}

struct Inner {
    connection: Mutex<Connection>,
    owners: Mutex<BTreeMap<(SessionId, TurnId), Weak<()>>>,
    changed: Notify,
    catalog: Option<catalog::ScopeProjection>,
    // Drop SQLite before releasing the writer lock.
    _lock: Option<WriterLock>,
}

struct WriterLock(File);

impl WriterLock {
    fn acquire(path: &Path) -> Result<Self> {
        let file = open_private_file(path)?;
        file.try_lock()
            .map_err(|_| error(ErrorKind::Unavailable, "store_already_owned"))?;
        Ok(Self(file))
    }
}

impl Drop for WriterLock {
    fn drop(&mut self) {
        // A process between fork and exec can still hold the same file
        // description. Release the lock even if that descriptor stays open.
        let _ = self.0.unlock();
    }
}

struct SessionRecord {
    configuration: Envelope,
    driver_state: DriverStateSnapshot,
    revision: SessionRevision,
    paused: bool,
    active_turn: Option<TurnId>,
    next_input: u64,
}

#[derive(Serialize, Deserialize)]
struct ClaimRecord {
    turn: TurnId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resume: Option<resume::ResumeRecord>,
}

impl ClaimRecord {
    fn new(turn: TurnId) -> Self {
        Self { turn, resume: None }
    }
}

#[derive(Deserialize, Serialize)]
struct OperationClaimRecord {
    session: SessionId,
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
    /// Use the same session and turn journal without a database file.
    /// Its state lives only while this store or a bound journal is retained.
    pub fn open_in_memory() -> Result<Self> {
        let connection = Connection::open_in_memory().map_err(database_error)?;
        connection
            .pragma_update(None, "temp_store", "MEMORY")
            .map_err(database_error)?;
        Self::initialize(None, connection, None)
    }

    /// Open a private application database with synchronous WAL commits.
    ///
    /// The parent directory must exist. One process owns this database while
    /// any store or bound journal handle remains alive.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::open_inner(path.as_ref(), None)
    }

    /// Open with a stable, owner-defined scope projection for read-only
    /// catalog queries. The projection uses only immutable session metadata.
    pub fn open_cataloged(
        path: impl AsRef<Path>,
        project: catalog::ScopeProjection,
    ) -> Result<Self> {
        Self::open_inner(path.as_ref(), Some(project))
    }

    fn open_inner(path: &Path, catalog: Option<catalog::ScopeProjection>) -> Result<Self> {
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
        let lock = WriterLock::acquire(&lock_path(&path))?;
        let database = open_private_file(&path)?;
        drop(database);
        let connection = Connection::open(&path).map_err(database_error)?;
        Self::initialize(Some(lock), connection, catalog)
    }

    fn initialize(
        // Parameters drop in reverse order on an initialization failure.
        lock: Option<WriterLock>,
        mut connection: Connection,
        catalog: Option<catalog::ScopeProjection>,
    ) -> Result<Self> {
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(database_error)?;
        connection
            .pragma_update(None, "foreign_keys", true)
            .map_err(database_error)?;
        if lock.is_some() {
            connection
                .pragma_update(None, "journal_mode", "WAL")
                .map_err(database_error)?;
            connection
                .pragma_update(None, "synchronous", "FULL")
                .map_err(database_error)?;
        }
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(database_error)?;
        match version {
            0 => {
                let transaction = connection.transaction().map_err(database_error)?;
                transaction.execute_batch(SCHEMA).map_err(database_error)?;
                transaction
                    .execute_batch(HISTORY_VIEWS)
                    .map_err(database_error)?;
                transaction
                    .execute_batch(CONTEXT_REPLACEMENTS)
                    .map_err(database_error)?;
                transaction
                    .execute_batch(catalog::SCHEMA)
                    .map_err(database_error)?;
                transaction
                    .execute_batch(catalog::ORGANIZATION_SCHEMA)
                    .map_err(database_error)?;
                transaction
                    .execute_batch(deletion::SCHEMA)
                    .map_err(database_error)?;
                transaction
                    .execute_batch(deletion::CLEANUP_SCHEMA)
                    .map_err(database_error)?;
                transaction
                    .pragma_update(None, "user_version", SCHEMA_VERSION)
                    .map_err(database_error)?;
                transaction.commit().map_err(database_error)?;
            }
            SCHEMA_VERSION => {}
            1..=9 => {
                let transaction = connection.transaction().map_err(database_error)?;
                if version == 1 {
                    transaction
                        .execute_batch(UPGRADE_QUEUE)
                        .map_err(database_error)?;
                }
                if version <= 2 {
                    transaction
                        .execute_batch(HISTORY_VIEWS)
                        .map_err(database_error)?;
                }
                if version <= 3 {
                    transaction
                        .execute_batch(CONTEXT_REPLACEMENTS)
                        .map_err(database_error)?;
                }
                if version <= 4 {
                    transaction
                        .execute_batch("ALTER TABLE sessions ADD COLUMN driver_state BLOB")
                        .map_err(database_error)?;
                }
                if version <= 5 {
                    transaction
                        .execute_batch(catalog::SCHEMA)
                        .map_err(database_error)?;
                }
                if version <= 6 {
                    transaction
                        .execute_batch(catalog::ORGANIZATION_SCHEMA)
                        .map_err(database_error)?;
                }
                if version <= 7 {
                    transaction
                        .execute_batch(deletion::SCHEMA)
                        .map_err(database_error)?;
                }
                if version <= 8 {
                    transaction
                        .execute_batch(catalog::REPROJECT_UNSCOPED)
                        .map_err(database_error)?;
                }
                transaction
                    .execute_batch(deletion::CLEANUP_SCHEMA)
                    .map_err(database_error)?;
                transaction
                    .pragma_update(None, "user_version", SCHEMA_VERSION)
                    .map_err(database_error)?;
                transaction.commit().map_err(commit_error)?;
            }
            _ => return Err(error(ErrorKind::Unsupported, "store_schema_unsupported")),
        }
        if let Some(project) = catalog {
            catalog::project_existing(&mut connection, project)?;
        }
        Ok(Self {
            inner: Arc::new(Inner {
                connection: Mutex::new(connection),
                owners: Mutex::new(BTreeMap::new()),
                changed: Notify::new(),
                catalog,
                _lock: lock,
            }),
        })
    }

    /// Observe a submission's retained payload and disposition in its session.
    pub async fn input(&self, session: SessionId, input: ChangeId) -> Result<Option<InputView>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            load_session(connection, &session)?;
            find_input(connection, &session, &input)
        })
        .await
    }

    /// Observe a session and optionally one input and its turn under the same lock.
    pub async fn inspect_with_input(
        &self,
        session: SessionId,
        input: ChangeId,
    ) -> Result<(SessionView, Option<InputObservation>)> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let input = find_input(connection, &session, &input)?
                .map(|input| {
                    let turn = match &input.disposition {
                        InputDisposition::Claimed { turn }
                        | InputDisposition::Completed { turn } => {
                            Some(turn_view(inner, &load_turn(connection, &session, turn)?)?)
                        }
                        _ => None,
                    };
                    Ok(InputObservation { input, turn })
                })
                .transpose()?;
            Ok((session_view(inner, connection, session)?, input))
        })
        .await
    }

    /// Project the current turn from the same state used for the session view.
    /// The projection runs under the store lock and must be a pure in-memory transform.
    pub async fn inspect_with_current<T: Send + 'static>(
        &self,
        session: SessionId,
        project: impl FnOnce(Option<&TurnState>) -> Result<T> + Send + 'static,
    ) -> Result<(SessionView, T)> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            session_view_with(inner, connection, session, project)
        })
        .await
    }

    /// Observe the current turn view associated with an exactly repeated claim.
    /// This issues no lease and never starts or resumes execution.
    pub async fn claim_receipt(&self, request: ClaimRequest) -> Result<Option<TurnView>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let receipt = lookup_request::<ClaimRecord>(
                connection,
                &request.session,
                "claim",
                &request.id,
                Fingerprint::of(&request)?,
            )?;
            receipt
                .map(|receipt| {
                    let state = load_turn(connection, &request.session, &receipt.turn)?;
                    turn_view(inner, &state)
                })
                .transpose()
        })
        .await
    }

    /// Read the original receipt of an exact recorded control without applying it.
    pub async fn control_receipt(&self, request: ControlRequest) -> Result<Option<ControlReceipt>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            lookup_request(
                connection,
                &request.session,
                "control",
                &request.id,
                Fingerprint::of(&request)?,
            )
        })
        .await
    }

    /// Read the immutable submissions selected by a turn without issuing a lease.
    pub async fn turn_submissions(
        &self,
        session: SessionId,
        turn: TurnId,
    ) -> Result<Vec<Submission>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            load_turn(connection, &session, &turn)?;
            turn_inputs(connection, &session, &turn)
        })
        .await
    }

    /// Read a caller-owned view from one committed turn snapshot without a lease.
    /// The projection runs under the store lock and must be a pure in-memory transform.
    pub async fn inspect_turn_with<T: Send + 'static>(
        &self,
        session: SessionId,
        turn: TurnId,
        project: impl FnOnce(&TurnState) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            project(&load_turn(connection, &session, &turn)?)
        })
        .await
    }

    /// Read the selected view's seed and committed local history in append order.
    ///
    /// A `before_turn` cut uses the view that owned that turn and excludes the
    /// turn itself. Without a cut this reads the current view. Projection is bounded
    /// and returns `history_projection_limit` if a full result would exceed it.
    pub async fn history(
        &self,
        session: SessionId,
        before_turn: Option<TurnId>,
    ) -> Result<Vec<HistoryRecord>> {
        self.history_with(session, before_turn, |state| {
            state.history().records().to_vec()
        })
        .await
    }

    /// Apply a caller-owned per-turn projection within the same bounded read.
    /// The projection runs under the store lock and must be a pure in-memory transform.
    pub async fn history_with(
        &self,
        session: SessionId,
        before_turn: Option<TurnId>,
        project: impl Fn(&TurnState) -> Vec<HistoryRecord> + Send + 'static,
    ) -> Result<Vec<HistoryRecord>> {
        let selection = before_turn.map_or(
            history::HistorySelection::Current,
            history::HistorySelection::BeforeTurn,
        );
        Ok(self
            .retained_history_with(session, selection, project)
            .await?
            .into_records())
    }

    /// Accept an ordinary submission only at the observed session revision.
    /// A previously accepted identical input retains its receipt across revisions.
    pub async fn submit_at_revision(
        &self,
        session: SessionId,
        input: Submission,
        expected: SessionRevision,
    ) -> Result<Acceptance> {
        self.accept(session, input, Some(expected)).await
    }

    /// Claim new work and conditionally change the session driver's state in the
    /// same transaction. Repeat both arguments to resolve a lost acknowledgment.
    pub async fn claim_with_driver_state(
        &self,
        request: ClaimRequest,
        change: DriverStateChange,
    ) -> Result<ClaimOutcome> {
        if !matches!(request.selection, TurnSelection::New { .. }) {
            return Err(error(
                ErrorKind::InvalidInput,
                "driver_state_claim_requires_new_turn",
            ));
        }
        self.acquire(request, Some(change), None).await
    }

    /// Accept and claim a new submission against an idle, empty queue, with
    /// the driver state update in the same transaction as both receipts.
    pub async fn submit_and_claim(
        &self,
        request: ClaimRequest,
        input: Submission,
        change: DriverStateChange,
    ) -> Result<ClaimOutcome> {
        if !matches!(&request.selection, TurnSelection::New { inputs, .. } if inputs == std::slice::from_ref(&input.id))
        {
            return Err(error(ErrorKind::InvalidInput, "claim_submission_mismatch"));
        }
        self.acquire(request, Some(change), Some(input)).await
    }

    /// Atomically create and claim one independent turn from a live tool
    /// operation. The destination must be absent, and each source operation
    /// records at most one destination, including across writer epochs.
    /// Repeat the exact request to inspect a committed claim without another
    /// lease. Any further execution requires a separate explicit recovery.
    pub async fn claim_from_operation(&self, request: OperationClaim) -> Result<ClaimOutcome> {
        if request.create.id != request.claim.session
            || request.create.id == request.source.binding.session
            || request.claim.expected_revision != SessionRevision(0)
            || !matches!(&request.claim.selection, TurnSelection::New { inputs, .. } if inputs == std::slice::from_ref(&request.input.id))
        {
            return Err(error(ErrorKind::InvalidInput, "invalid_operation_claim"));
        }
        let inner = Arc::clone(&self.inner);
        let prepared = execute(Arc::clone(&inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = Fingerprint::of(&request)?;
            let source_key =
                operation_claim_key(&request.source.binding.turn, &request.source.operation)?;
            let source_session = &request.source.binding.session;
            if let Some(receipt) = lookup_request::<OperationClaimRecord>(
                &transaction,
                source_session,
                OPERATION_CLAIM,
                &source_key,
                fingerprint,
            )? {
                let state = load_turn(&transaction, &receipt.session, &receipt.turn)?;
                return Ok(PreparedClaim::Existing(turn_view(inner, &state)?));
            }
            let _source_owner = require_operation_owner(inner, &transaction, &request.source)?;
            record_creation(
                &transaction,
                &request.create,
                inner.catalog,
                Fingerprint::of(&request.create)?,
            )?;
            let prepared = prepare_claim(
                inner,
                &transaction,
                request.claim,
                Some(request.driver_state),
                Some(request.input),
            )?;
            let PreparedClaim::Acquired(claim) = &prepared else {
                return Err(error(
                    ErrorKind::Conflict,
                    "operation_claim_destination_exists",
                ));
            };
            save_request(
                &transaction,
                source_session,
                OPERATION_CLAIM,
                &source_key,
                fingerprint,
                &OperationClaimRecord {
                    session: claim.binding.session.clone(),
                    turn: claim.binding.turn.clone(),
                },
            )?;
            transaction.commit().map_err(commit_error)?;
            Ok(prepared)
        })
        .await?;
        finish_claim(inner, prepared)
    }

    fn accept(
        &self,
        session_id: SessionId,
        input: Submission,
        expected: Option<SessionRevision>,
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
            if let Some(expected) = expected {
                require_revision(&session, expected)?;
            }
            let receipt = insert_input(&transaction, &session_id, &mut session, &input, None)?;
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

    fn acquire(
        &self,
        request: ClaimRequest,
        state_change: Option<DriverStateChange>,
        submission: Option<Submission>,
    ) -> BoxFuture<'_, Result<ClaimOutcome>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            let prepared = execute(Arc::clone(&inner), move |inner, connection| {
                let transaction = connection
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(database_error)?;
                let prepared =
                    prepare_claim(inner, &transaction, request, state_change, submission)?;
                if matches!(&prepared, PreparedClaim::Acquired(_)) {
                    transaction.commit().map_err(commit_error)?;
                }
                Ok(prepared)
            })
            .await?;
            finish_claim(inner, prepared)
        })
    }
}

fn prepare_claim(
    inner: &Inner,
    transaction: &Transaction<'_>,
    request: ClaimRequest,
    state_change: Option<DriverStateChange>,
    submission: Option<Submission>,
) -> Result<PreparedClaim> {
    let fingerprint = match (&state_change, &submission) {
        (change, Some(input)) => Fingerprint::of(&(&request, change, input))?,
        (Some(change), None) => Fingerprint::of(&(&request, change))?,
        (None, None) => Fingerprint::of(&request)?,
    };
    if let Some(receipt) = lookup_request::<ClaimRecord>(
        transaction,
        &request.session,
        "claim",
        &request.id,
        fingerprint,
    )? {
        let state = load_turn(transaction, &request.session, &receipt.turn)?;
        return Ok(PreparedClaim::Existing(turn_view(inner, &state)?));
    }
    Ok(PreparedClaim::Acquired(prepare_pending_claim(
        inner,
        transaction,
        request,
        state_change,
        submission,
        fingerprint,
        None,
    )?))
}

fn prepare_pending_claim(
    inner: &Inner,
    transaction: &Transaction<'_>,
    request: ClaimRequest,
    state_change: Option<DriverStateChange>,
    submission: Option<Submission>,
    fingerprint: Fingerprint,
    resume: Option<resume::ResumeRecord>,
) -> Result<Acquired> {
    let mut session = load_session(transaction, &request.session)?;
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
            let exists: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM turns WHERE session=?1 AND id=?2)",
                    params![request.session.as_str(), turn.as_str()],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            if exists {
                return Err(error(ErrorKind::Conflict, "turn_exists"));
            }
            if let Some(change) = state_change {
                session.driver_state.apply(change)?;
            }
            if let Some(input) = submission {
                let waiting: bool = transaction.query_row(
                    "SELECT EXISTS(SELECT 1 FROM submissions WHERE session=?1 AND queue_order IS NOT NULL)",
                    [request.session.as_str()],
                    |row| row.get(0),
                ).map_err(database_error)?;
                if waiting {
                    return Err(error(ErrorKind::Conflict, "session_queue_waiting"));
                }
                let receipt =
                    insert_input(transaction, &request.session, &mut session, &input, None)?;
                save_request(
                    transaction,
                    &request.session,
                    "submit",
                    &input.id,
                    Fingerprint::of(&input)?,
                    &receipt,
                )?;
            }
            let state = TurnState::with_driver_state(
                TurnBinding {
                    session: request.session.clone(),
                    turn: turn.clone(),
                    epoch: 1,
                },
                session.driver_state.clone(),
            )?;
            let mut selected = Vec::with_capacity(inputs.len());
            for id in inputs {
                let input = load_input(transaction, &request.session, id)?;
                match input.disposition {
                    InputDisposition::Queued => {}
                    InputDisposition::Claimed { .. } | InputDisposition::Completed { .. } => {
                        return Err(error(ErrorKind::Conflict, "input_already_claimed"));
                    }
                    InputDisposition::Superseded { .. } | InputDisposition::Withdrawn => {
                        return Err(error(ErrorKind::Conflict, "input_not_queued"));
                    }
                }
                selected.push(input.input);
            }
            transaction
                .execute(
                    "INSERT INTO turns(session,id,snapshot) VALUES(?1,?2,?3)",
                    params![
                        request.session.as_str(),
                        turn.as_str(),
                        encode_snapshot(&state)?
                    ],
                )
                .map_err(database_error)?;
            for (order, id) in inputs.iter().enumerate() {
                transaction.execute(
                    "UPDATE submissions SET turn_id=?3,turn_order=?4,queue_order=NULL WHERE session=?1 AND id=?2",
                    params![request.session.as_str(), id.as_str(), turn.as_str(), order as i64],
                ).map_err(database_error)?;
            }
            (state, selected)
        }
        TurnSelection::Resume {
            turn,
            epoch,
            position,
        }
        | TurnSelection::ResumePaused {
            turn,
            epoch,
            position,
            ..
        } => {
            if session.active_turn.as_ref() != Some(turn) {
                return Err(error(ErrorKind::Conflict, "active_turn_mismatch"));
            }
            let mut state = load_turn(transaction, &request.session, turn)?;
            if !state.is_suspended()
                || state.position() != *position
                || state.binding().epoch != *epoch
            {
                return Err(error(ErrorKind::Conflict, "suspension_mismatch"));
            }
            require_released(inner, state.binding())?;
            if let TurnSelection::ResumePaused {
                control_revision, ..
            } = &request.selection
            {
                if state.controls().revision != *control_revision
                    || !state.controls().paused
                    || state.controls().cancelled
                {
                    return Err(error(ErrorKind::Conflict, "pause_state_changed"));
                }
                let mut actions = Vec::new();
                let updates_state = state_change.is_some();
                if let Some(change) = state_change {
                    if state.driver_state() != &session.driver_state {
                        return Err(error(ErrorKind::Conflict, "driver_state_snapshot_mismatch"));
                    }
                    actions.push(JournalAction::SetDriverState(change));
                }
                actions.push(JournalAction::Control(ControlDirective::Resume));
                state.apply(JournalChange::new(
                    ChangeId::new(
                        Fingerprint::of(&("resume-control", &request.id))?
                            .bytes()
                            .iter()
                            .map(|byte| format!("{byte:02x}"))
                            .collect::<String>(),
                    )?,
                    state.binding().clone(),
                    state.position(),
                    *control_revision,
                    actions,
                )?)?;
                if updates_state {
                    session.driver_state = state.driver_state().clone();
                }
            }
            if !state.controls().admits_work() {
                return Err(error(ErrorKind::InvalidState, "turn_admission_closed"));
            }
            rebind(&mut state)?;
            save_turn(transaction, &state)?;
            let inputs = turn_inputs(transaction, &request.session, turn)?;
            (state, inputs)
        }
    };
    let owner = register_owner(inner, state.binding())?;
    session.active_turn = Some(state.binding().turn.clone());
    bump_revision(&mut session)?;
    save_session(transaction, &request.session, &session)?;
    save_request(
        transaction,
        &request.session,
        "claim",
        &request.id,
        fingerprint,
        &ClaimRecord {
            turn: state.binding().turn.clone(),
            resume,
        },
    )?;
    Ok(Acquired {
        binding: state.binding().clone(),
        configuration: session.configuration,
        inputs,
        owner,
    })
}

impl SessionStore for SqliteStore {
    fn create(&self, request: CreateSession) -> BoxFuture<'_, Result<SessionCreated>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
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
            let receipt = record_creation(&transaction, &request, inner.catalog, fingerprint)?;
            transaction.commit().map_err(commit_error)?;
            Ok(receipt)
        })
    }

    fn submit(
        &self,
        session_id: SessionId,
        input: Submission,
    ) -> BoxFuture<'_, Result<Acceptance>> {
        self.accept(session_id, input, None)
    }

    fn claim(&self, request: ClaimRequest) -> BoxFuture<'_, Result<ClaimOutcome>> {
        self.acquire(request, None, None)
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
                    &ClaimRecord::new(request.turn.clone()),
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
            let receipt = record_control(&transaction, &request, fingerprint, None)?;
            transaction.commit().map_err(commit_error)?;
            inner.changed.notify_waiters();
            Ok(receipt)
        })
    }

    fn inspect(&self, session_id: SessionId) -> BoxFuture<'_, Result<SessionView>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            session_view(inner, connection, session_id)
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
            let before = change
                .actions()
                .iter()
                .any(|action| matches!(action, JournalAction::SetDriverState(_)))
                .then(|| state.driver_state().clone());
            let receipt = state.apply(change)?;
            save_turn(&transaction, &state)?;
            let previous = before.filter(|snapshot| snapshot != state.driver_state());
            let settled = state.outcome().is_some();
            if settled || previous.is_some() {
                let mut session = load_session(&transaction, &binding.session)?;
                if session.active_turn.as_ref() == Some(&binding.turn) {
                    if let Some(previous) = previous {
                        if previous != session.driver_state {
                            return Err(error(
                                ErrorKind::Conflict,
                                "driver_state_snapshot_mismatch",
                            ));
                        }
                        session.driver_state = state.driver_state().clone();
                    }
                    if settled {
                        session.active_turn = None;
                        transaction.execute(
                            "UPDATE submissions SET completed=1 WHERE session=?1 AND turn_id=?2",
                            params![binding.session.as_str(), binding.turn.as_str()],
                        ).map_err(database_error)?;
                    }
                    bump_revision(&mut session)?;
                    save_session(&transaction, &binding.session, &session)?;
                } else if previous.is_some() {
                    return Err(error(ErrorKind::Conflict, "active_turn_mismatch"));
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
            let result = match inner.connection.lock() {
                Ok(mut connection) => operation(&inner, &mut connection),
                Err(_) => Err(error(ErrorKind::Unavailable, "store_connection_poisoned")),
            };
            // Release transient ownership before publishing the blocking task's
            // result. An awaited operation must not retain the database lock
            // until the scheduler later drops its completed task.
            drop(inner);
            result
        })
        .await
        .map_err(|_| error(ErrorKind::Uncertain, "store_task_interrupted"))?
    })
}

fn insert_session(
    transaction: &Transaction<'_>,
    request: &CreateSession,
    catalog: Option<catalog::ScopeProjection>,
) -> Result<SessionCreated> {
    deletion::require_unretired(transaction, &request.id)?;
    let inserted = transaction
        .execute(
            "INSERT INTO sessions(id,configuration,revision,paused,next_input) VALUES(?1,?2,0,0,0)
         ON CONFLICT(id) DO NOTHING",
            params![request.id.as_str(), encode(&request.configuration)?],
        )
        .map_err(database_error)?;
    if inserted == 0 {
        return Err(error(ErrorKind::Conflict, "session_exists"));
    }
    catalog::insert(transaction, request, catalog)?;
    Ok(SessionCreated {
        session: request.id.clone(),
        revision: SessionRevision(0),
    })
}

fn record_creation(
    transaction: &Transaction<'_>,
    request: &CreateSession,
    catalog: Option<catalog::ScopeProjection>,
    fingerprint: Fingerprint,
) -> Result<SessionCreated> {
    let receipt = insert_session(transaction, request, catalog)?;
    save_request(
        transaction,
        &request.id,
        "create",
        &request.request,
        fingerprint,
        &receipt,
    )?;
    Ok(receipt)
}

fn operation_claim_key(turn: &TurnId, operation: &OperationId) -> Result<ChangeId> {
    let fingerprint = Fingerprint::of(&(turn, operation))?;
    ChangeId::new(
        fingerprint
            .bytes()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>(),
    )
}

fn require_operation_owner(
    inner: &Inner,
    transaction: &Transaction<'_>,
    source: &OperationClaimSource,
) -> Result<Arc<()>> {
    let binding = &source.binding;
    let session = load_session(transaction, &binding.session)?;
    if session.active_turn.as_ref() != Some(&binding.turn) {
        return Err(error(ErrorKind::Conflict, "active_turn_mismatch"));
    }
    let state = load_turn(transaction, &binding.session, &binding.turn)?;
    require_binding(&state, binding)?;
    if state.controls().revision != source.control {
        return Err(error(ErrorKind::Conflict, "stale_control_revision"));
    }
    if state.is_suspended() || !state.controls().admits_work() {
        return Err(error(
            ErrorKind::InvalidState,
            "operation_claim_source_closed",
        ));
    }
    let matches = state
        .operations()
        .get(&source.operation)
        .is_some_and(|operation| {
            matches!(&operation.record.input, OperationInput::Tool(invocation) if invocation.fingerprint() == source.action)
                && operation.attempts.last().is_some_and(|attempt| {
                    attempt.id == source.attempt && attempt.outcome.is_none()
                })
        });
    if !matches {
        return Err(error(
            ErrorKind::Conflict,
            "operation_claim_source_mismatch",
        ));
    }
    // Keep the exact owner's liveness through this transaction, including
    // the interval between checking the source and publishing the claim.
    live_owner(inner, binding)?
        .ok_or_else(|| error(ErrorKind::Conflict, "operation_claim_source_not_owned"))
}

fn load_session(connection: &Connection, id: &SessionId) -> Result<SessionRecord> {
    let row = connection
        .query_row(
            "SELECT configuration,revision,paused,active_turn,next_input,driver_state FROM sessions WHERE id=?1",
            [id.as_str()],
            |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, bool>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<Vec<u8>>>(5)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "session_missing"))?;
    Ok(SessionRecord {
        configuration: decode(&row.0)?,
        driver_state: row
            .5
            .as_deref()
            .map(decode)
            .transpose()?
            .unwrap_or_default(),
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
    let driver_state = (!session.driver_state.is_initial())
        .then(|| encode(&session.driver_state))
        .transpose()?;
    transaction
        .execute(
            "UPDATE sessions SET revision=?2,paused=?3,active_turn=?4,next_input=?5,driver_state=?6 WHERE id=?1",
            params![
                id.as_str(),
                sql_number(session.revision.0)?,
                session.paused,
                session.active_turn.as_ref().map(TurnId::as_str),
                sql_number(session.next_input)?,
                driver_state,
            ],
        )
        .map_err(database_error)?;
    Ok(())
}

fn apply_control(
    transaction: &Transaction<'_>,
    request: &ControlRequest,
    mut session: SessionRecord,
    active: Option<TurnState>,
) -> Result<ControlReceipt> {
    let state_revision = session.driver_state.revision();
    let action = match &request.action {
        SessionControl::PauseAdmission => {
            session.paused = true;
            None
        }
        SessionControl::ResumeAdmission => {
            session.paused = false;
            None
        }
        SessionControl::ReplaceQueued { input, replacement } => {
            let order = queued_order(transaction, &request.session, input)?;
            if find_input(transaction, &request.session, &replacement.id)?.is_some() {
                return Err(error(ErrorKind::Conflict, "input_identity_reused"));
            }
            transaction.execute(
                "UPDATE submissions SET queue_order=NULL,replacement_id=?3 WHERE session=?1 AND id=?2",
                params![request.session.as_str(), input.as_str(), replacement.id.as_str()],
            ).map_err(database_error)?;
            let receipt = insert_input(
                transaction,
                &request.session,
                &mut session,
                replacement,
                Some(order),
            )?;
            save_request(
                transaction,
                &request.session,
                "submit",
                &replacement.id,
                Fingerprint::of(replacement)?,
                &receipt,
            )?;
            None
        }
        SessionControl::WithdrawQueued { input } => {
            queued_order(transaction, &request.session, input)?;
            transaction.execute(
                "UPDATE submissions SET queue_order=NULL,withdrawn=1 WHERE session=?1 AND id=?2",
                params![request.session.as_str(), input.as_str()],
            ).map_err(database_error)?;
            None
        }
        SessionControl::ReorderQueued { inputs } => {
            reorder_queue(transaction, &request.session, inputs)?;
            None
        }
        SessionControl::AppendHistory {
            turn,
            expected,
            expected_history,
            records,
        } => {
            let state = load_turn(transaction, &request.session, turn)?;
            if state.history().position() != *expected_history {
                return Err(error(ErrorKind::Conflict, "history_position_changed"));
            }
            if records.is_empty() {
                return Err(error(ErrorKind::InvalidInput, "empty_history_contribution"));
            }
            Some((
                turn,
                *expected,
                vec![JournalAction::AppendHistory(records.clone())],
            ))
        }
        SessionControl::Turn {
            turn,
            expected,
            directive,
        } => Some((turn, *expected, vec![JournalAction::Control(*directive)])),
        SessionControl::Resolve {
            turn,
            expected,
            wait,
            answer,
        } => Some((
            turn,
            *expected,
            vec![JournalAction::ResolveWait {
                wait: wait.clone(),
                answer: answer.clone(),
            }],
        )),
        SessionControl::ResolveAndAppend {
            turn,
            expected,
            expected_history,
            wait,
            answer,
            records,
        } => {
            let state = load_turn(transaction, &request.session, turn)?;
            if state.history().position() != *expected_history {
                return Err(error(ErrorKind::Conflict, "history_position_changed"));
            }
            if records.is_empty() {
                return Err(error(ErrorKind::InvalidInput, "empty_history_contribution"));
            }
            Some((
                turn,
                *expected,
                vec![
                    JournalAction::ResolveWait {
                        wait: wait.clone(),
                        answer: answer.clone(),
                    },
                    JournalAction::AppendHistory(records.clone()),
                ],
            ))
        }
        SessionControl::PauseAndCancel { turn, expected } => {
            session.paused = true;
            Some((
                turn,
                *expected,
                vec![JournalAction::Control(ControlDirective::Cancel)],
            ))
        }
        SessionControl::DriverState {
            change,
            turn: Some(control),
        } => Some((
            &control.turn,
            control.expected,
            vec![
                JournalAction::SetDriverState(change.clone()),
                JournalAction::Control(control.directive),
            ],
        )),
        SessionControl::DriverState { change, turn: None } => {
            if session.active_turn.is_some() {
                return Err(error(
                    ErrorKind::Conflict,
                    "driver_state_requires_turn_control",
                ));
            }
            session.driver_state.apply(change.clone())?;
            None
        }
    };
    let turn_receipt = if let Some((turn, expected, actions)) = action {
        if session.active_turn.as_ref() != Some(turn) {
            return Err(error(ErrorKind::Conflict, "active_turn_mismatch"));
        }
        let mut state = match active {
            Some(state) => state,
            None => load_turn(transaction, &request.session, turn)?,
        };
        if state.driver_state() != &session.driver_state {
            return Err(error(ErrorKind::Conflict, "driver_state_snapshot_mismatch"));
        }
        if state.controls().cancelled
            && actions.iter().any(|action| {
                matches!(
                    action,
                    JournalAction::AppendHistory(_) | JournalAction::ResolveWait { .. }
                )
            })
        {
            return Err(error(ErrorKind::InvalidState, "turn_cancelled"));
        }
        let change = JournalChange::new(
            request.id.clone(),
            state.binding().clone(),
            state.position(),
            expected,
            actions,
        )?;
        let receipt = state.apply(change)?;
        session.driver_state = state.driver_state().clone();
        save_turn(transaction, &state)?;
        Some(receipt)
    } else {
        None
    };
    bump_revision(&mut session)?;
    save_session(transaction, &request.session, &session)?;
    let receipt = ControlReceipt {
        session: request.session.clone(),
        request: request.id.clone(),
        revision: session.revision,
        turn: turn_receipt,
        driver_state_revision: (state_revision != session.driver_state.revision())
            .then_some(session.driver_state.revision()),
    };
    Ok(receipt)
}

fn record_control(
    transaction: &Transaction<'_>,
    request: &ControlRequest,
    fingerprint: Fingerprint,
    active: Option<TurnState>,
) -> Result<ControlReceipt> {
    let session = load_session(transaction, &request.session)?;
    require_revision(&session, request.expected_revision)?;
    let receipt = apply_control(transaction, request, session, active)?;
    save_request(
        transaction,
        &request.session,
        "control",
        &request.id,
        fingerprint,
        &receipt,
    )?;
    Ok(receipt)
}

fn insert_input(
    transaction: &Transaction<'_>,
    session_id: &SessionId,
    session: &mut SessionRecord,
    input: &Submission,
    order: Option<u64>,
) -> Result<Acceptance> {
    if find_input(transaction, session_id, &input.id)?.is_some() {
        return Err(error(ErrorKind::Conflict, "input_identity_reused"));
    }
    let (count, bytes): (i64, i64) = transaction.query_row(
        "SELECT COUNT(*),COALESCE(SUM(length(payload)),0) FROM submissions WHERE session=?1 AND queue_order IS NOT NULL",
        [session_id.as_str()],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(database_error)?;
    let payload = encode(&input.payload)?;
    if count >= MAX_PENDING_INPUTS || bytes.saturating_add(payload.len() as i64) > MAX_PENDING_BYTES
    {
        return Err(error(ErrorKind::LimitExceeded, "session_queue_full"));
    }
    let receipt = Acceptance {
        session: session_id.clone(),
        input: input.id.clone(),
        position: session.next_input,
    };
    transaction.execute(
        "INSERT INTO submissions(session,id,position,payload,fingerprint,queue_order) VALUES(?1,?2,?3,?4,?5,?6)",
        params![session_id.as_str(), input.id.as_str(), sql_number(receipt.position)?,
            payload, Fingerprint::of(input)?.bytes().as_slice(), sql_number(order.unwrap_or(receipt.position))?],
    ).map_err(database_error)?;
    session.next_input = session
        .next_input
        .checked_add(1)
        .ok_or_else(|| error(ErrorKind::LimitExceeded, "input_position_overflow"))?;
    Ok(receipt)
}

fn queued_order(connection: &Connection, session: &SessionId, input: &ChangeId) -> Result<u64> {
    if load_input(connection, session, input)?.disposition != InputDisposition::Queued {
        return Err(error(ErrorKind::Conflict, "input_not_queued"));
    }
    let order = connection
        .query_row(
            "SELECT queue_order FROM submissions WHERE session=?1 AND id=?2",
            params![session.as_str(), input.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map_err(database_error)?;
    unsigned(order)
}

fn reorder_queue(
    transaction: &Transaction<'_>,
    session: &SessionId,
    inputs: &[ChangeId],
) -> Result<()> {
    if inputs.len() > MAX_PENDING_INPUTS as usize {
        return Err(error(ErrorKind::LimitExceeded, "session_queue_full"));
    }
    let mut statement = transaction.prepare(
        "SELECT id,queue_order FROM submissions WHERE session=?1 AND queue_order IS NOT NULL ORDER BY queue_order",
    ).map_err(database_error)?;
    let pending = statement
        .query_map([session.as_str()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(database_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(database_error)?;
    let selected: BTreeSet<_> = inputs.iter().map(ChangeId::as_str).collect();
    let expected: BTreeSet<_> = pending.iter().map(|(id, _)| id.as_str()).collect();
    if selected.len() != inputs.len() || selected != expected {
        return Err(error(ErrorKind::Conflict, "queue_order_mismatch"));
    }
    transaction
        .execute(
            "UPDATE submissions SET queue_order=NULL WHERE session=?1 AND queue_order IS NOT NULL",
            [session.as_str()],
        )
        .map_err(database_error)?;
    for (input, (_, order)) in inputs.iter().zip(pending) {
        transaction
            .execute(
                "UPDATE submissions SET queue_order=?3 WHERE session=?1 AND id=?2",
                params![session.as_str(), input.as_str(), order],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

fn session_view(
    inner: &Inner,
    connection: &Connection,
    session_id: SessionId,
) -> Result<SessionView> {
    session_view_with(inner, connection, session_id, |_| Ok(())).map(|(view, ())| view)
}

fn session_view_with<T>(
    inner: &Inner,
    connection: &Connection,
    session_id: SessionId,
    project: impl FnOnce(Option<&TurnState>) -> Result<T>,
) -> Result<(SessionView, T)> {
    let session = load_session(connection, &session_id)?;
    let mut statement = connection.prepare(
        "SELECT id FROM submissions WHERE session=?1 AND queue_order IS NOT NULL ORDER BY queue_order",
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
    let (current, projection) = {
        let state = session
            .active_turn
            .as_ref()
            .map(|id| load_turn(connection, &session_id, id))
            .transpose()?;
        let projection = project(state.as_ref())?;
        let current = state
            .as_ref()
            .map(|state| turn_view(inner, state))
            .transpose()?;
        (current, projection)
    };
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
    let view = SessionView {
        session: session_id,
        revision: session.revision,
        configuration: session.configuration,
        driver_state: session.driver_state,
        admission_paused: session.paused,
        queued,
        current,
        latest,
    };
    Ok((view, projection))
}

fn load_input(connection: &Connection, session: &SessionId, id: &ChangeId) -> Result<InputView> {
    find_input(connection, session, id)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "submission_missing"))
}

fn find_input(
    connection: &Connection,
    session: &SessionId,
    id: &ChangeId,
) -> Result<Option<InputView>> {
    let Some((position, bytes, turn, completed, fingerprint, queue_order, replacement, withdrawn)) = connection
        .query_row(
            "SELECT position,payload,turn_id,completed,fingerprint,queue_order,replacement_id,withdrawn FROM submissions WHERE session=?1 AND id=?2",
            params![session.as_str(), id.as_str()],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                    row.get::<_, Vec<u8>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, bool>(7)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)? else {
            return Ok(None);
        };
    let queued = queue_order.map(unsigned).transpose()?.is_some();
    let disposition = match (turn, completed, queued, replacement, withdrawn) {
        (None, false, true, None, false) => InputDisposition::Queued,
        (Some(turn), true, false, None, false) => InputDisposition::Completed {
            turn: TurnId::new(turn)?,
        },
        (Some(turn), false, false, None, false) => InputDisposition::Claimed {
            turn: TurnId::new(turn)?,
        },
        (None, false, false, Some(replacement), false) => InputDisposition::Superseded {
            replacement: ChangeId::new(replacement)?,
        },
        (None, false, false, None, true) => InputDisposition::Withdrawn,
        _ => {
            return Err(error(
                ErrorKind::InvalidState,
                "stored_input_disposition_invalid",
            ));
        }
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
    Ok(Some(InputView {
        input,
        position: unsigned(position)?,
        disposition,
    }))
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
        history_position: state.history().position(),
        controls: state.controls().clone(),
        disposition,
        outcome: state.outcome().cloned(),
    })
}

fn has_owner(inner: &Inner, binding: &TurnBinding) -> Result<bool> {
    Ok(live_owner(inner, binding)?.is_some())
}

fn live_owner(inner: &Inner, binding: &TurnBinding) -> Result<Option<Arc<()>>> {
    let owners = inner
        .owners
        .lock()
        .map_err(|_| error(ErrorKind::Unavailable, "store_owners_poisoned"))?;
    Ok(owners
        .get(&(binding.session.clone(), binding.turn.clone()))
        .and_then(Weak::upgrade))
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

fn has_live_session_owner(inner: &Inner, session: &SessionId) -> Result<bool> {
    Ok(inner
        .owners
        .lock()
        .map_err(|_| error(ErrorKind::Unavailable, "store_owners_poisoned"))?
        .iter()
        .any(|((owner_session, _), owner)| owner_session == session && owner.strong_count() > 0))
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

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn closing_the_store_releases_a_duplicated_writer_lock() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        let path = directory.path().join("sessions.sqlite");
        let store = SqliteStore::open(&path).unwrap();
        // A pre-exec child retains another reference to the same flock.
        let inherited = store.inner._lock.as_ref().unwrap().0.try_clone().unwrap();
        assert_eq!(
            SqliteStore::open(&path).err().unwrap().code,
            "store_already_owned",
        );
        drop(store);

        let reopened = SqliteStore::open(&path).unwrap();
        drop(inherited);
        assert_eq!(
            SqliteStore::open(&path).err().unwrap().code,
            "store_already_owned",
        );
        drop(reopened);
    }
}
