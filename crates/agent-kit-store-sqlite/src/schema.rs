//! The database's one schema and the gate every open passes.
//!
//! A database is either empty, in which case this store installs the schema
//! in one transaction, or it carries this store's application identity and
//! schema version. Every other file is refused, so a database written by an
//! unrelated program or by a different schema is never read as this one.

use super::{Result, commit_error, database_error, error};
use agent_kit_core::ErrorKind;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};

/// The SQLite application identity of this store's databases.
const APPLICATION_ID: i64 = 0x4752_4147;
const VERSION: i64 = 1;

/// Encoded values are JSON. Digests and identities the store compares in SQL
/// are raw 32-byte blobs. No CHECK enumerates an open vocabulary such as
/// request kinds, which SQLite could not later extend in place.
const SCHEMA: &str = "
-- Which owner projections this database was created with. Reopening it
-- with different projections is refused.
CREATE TABLE store_profile (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    catalog INTEGER NOT NULL CHECK (catalog IN (0, 1)),
    turn_links INTEGER NOT NULL CHECK (turn_links IN (0, 1) AND turn_links <= catalog)
);

CREATE TABLE sessions (
    -- Creation order and the catalog cursor.
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    configuration BLOB NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 0),
    paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
    active_turn TEXT,
    next_input INTEGER NOT NULL CHECK (next_input >= 0),
    -- Absent while the driver state is initial.
    driver_state BLOB,
    -- Catalog placement, projected once at creation. Absent in every scope.
    scope BLOB CHECK (scope IS NULL OR length(scope) = 32),
    bucket INTEGER NOT NULL DEFAULT 0 CHECK (bucket BETWEEN 0 AND 255),
    label TEXT CHECK (label IS NULL OR length(CAST(label AS BLOB)) <= 256),
    catalog_revision INTEGER NOT NULL DEFAULT 0 CHECK (catalog_revision >= 0)
);
CREATE INDEX sessions_catalog ON sessions(scope, bucket, ordinal) WHERE scope IS NOT NULL;
CREATE INDEX sessions_active_turn_scan ON sessions(id, active_turn) WHERE active_turn IS NOT NULL;

-- Retired identities outlive their sessions.
CREATE TABLE session_retirements (
    session TEXT PRIMARY KEY,
    scope BLOB NOT NULL CHECK (length(scope) = 32),
    fingerprint BLOB NOT NULL CHECK (length(fingerprint) = 32),
    cleanup BLOB CHECK (cleanup IS NULL OR length(cleanup) = 32)
) WITHOUT ROWID;
CREATE INDEX session_retirements_pending ON session_retirements(session) WHERE cleanup IS NOT NULL;

CREATE TABLE turns (
    -- Order of turns within a session, and history and context boundaries.
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    -- The turn's state without its operations, history records, receipts
    -- and checkpoint, which are parts.
    head BLOB NOT NULL,
    history_len INTEGER NOT NULL CHECK (history_len >= 0),
    -- Head, parts and distinct messages, as written.
    stored_bytes INTEGER NOT NULL CHECK (stored_bytes >= 0),
    -- Wall-clock facts for presentation. They never order or authorize work.
    started_ms INTEGER NOT NULL CHECK (started_ms >= 0),
    settled_ms INTEGER CHECK (settled_ms IS NULL OR settled_ms >= started_ms),
    UNIQUE (session, id)
);
CREATE INDEX turns_by_session ON turns(session, ordinal);

-- Keys are 'o/<operation>', 'h/<8-digit record index>', 'r/<change>' and 'c/'.
CREATE TABLE turn_parts (
    session TEXT NOT NULL,
    turn TEXT NOT NULL,
    key TEXT NOT NULL,
    digest BLOB NOT NULL CHECK (length(digest) = 32),
    body BLOB NOT NULL,
    PRIMARY KEY (session, turn, key),
    FOREIGN KEY (session, turn) REFERENCES turns(session, id) ON DELETE CASCADE
);

-- Each message once per session, under the SHA-256 of its body.
CREATE TABLE turn_messages (
    session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    digest BLOB NOT NULL CHECK (length(digest) = 32),
    body BLOB NOT NULL,
    PRIMARY KEY (session, digest)
);

CREATE TABLE submissions (
    session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    payload BLOB NOT NULL,
    -- Also the submission's idempotency key.
    fingerprint BLOB NOT NULL CHECK (length(fingerprint) = 32),
    state TEXT NOT NULL CHECK (state IN ('queued', 'claimed', 'completed', 'superseded', 'withdrawn')),
    queue_order INTEGER CHECK (queue_order IS NULL OR queue_order >= 0),
    turn TEXT,
    turn_order INTEGER CHECK (turn_order IS NULL OR turn_order >= 0),
    replacement TEXT,
    CHECK ((state = 'queued') = (queue_order IS NOT NULL)),
    CHECK ((state IN ('claimed', 'completed')) = (turn IS NOT NULL)),
    CHECK ((turn IS NULL) = (turn_order IS NULL)),
    CHECK ((state = 'superseded') = (replacement IS NOT NULL)),
    PRIMARY KEY (session, id),
    UNIQUE (session, position),
    FOREIGN KEY (session, turn) REFERENCES turns(session, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX submissions_queue ON submissions(session, queue_order) WHERE queue_order IS NOT NULL;
CREATE INDEX submissions_turn ON submissions(session, turn, turn_order) WHERE turn IS NOT NULL;

-- Written at acceptance when the owner projects turn links.
CREATE TABLE submission_links (
    ordinal INTEGER PRIMARY KEY,
    session TEXT NOT NULL,
    input TEXT NOT NULL,
    parent_session TEXT NOT NULL,
    parent_turn TEXT NOT NULL,
    UNIQUE (session, input),
    FOREIGN KEY (session, input) REFERENCES submissions(session, id) ON DELETE CASCADE,
    FOREIGN KEY (parent_session, parent_turn) REFERENCES turns(session, id) ON DELETE CASCADE
);
CREATE INDEX submission_links_parent ON submission_links(parent_session, parent_turn, ordinal);

-- Idempotency receipts by request kind.
CREATE TABLE requests (
    session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    fingerprint BLOB NOT NULL CHECK (length(fingerprint) = 32),
    receipt BLOB NOT NULL,
    PRIMARY KEY (session, kind, id)
);

-- Every session has view 0 from creation; a seeded session's view 0 holds its seed.
CREATE TABLE history_views (
    session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    view INTEGER NOT NULL CHECK (view >= 0),
    after_ordinal INTEGER NOT NULL CHECK (after_ordinal >= 0),
    end_ordinal INTEGER CHECK (end_ordinal IS NULL OR end_ordinal >= after_ordinal),
    seed BLOB,
    seed_identity BLOB CHECK (seed_identity IS NULL OR length(seed_identity) = 32),
    CHECK ((seed IS NULL) = (seed_identity IS NULL)),
    PRIMARY KEY (session, view)
);
CREATE UNIQUE INDEX history_views_current ON history_views(session) WHERE end_ordinal IS NULL;
CREATE INDEX history_views_by_after ON history_views(session, after_ordinal, view);

-- A replacement covers its view from the view's start through through_ordinal,
-- which equals turn_ordinal when it covers the whole source.
CREATE TABLE context_replacements (
    session TEXT NOT NULL,
    view INTEGER NOT NULL,
    turn_ordinal INTEGER NOT NULL REFERENCES turns(ordinal) ON DELETE CASCADE,
    through_ordinal INTEGER NOT NULL CHECK (through_ordinal <= turn_ordinal),
    seed BLOB NOT NULL,
    identity BLOB NOT NULL CHECK (length(identity) = 32),
    PRIMARY KEY (session, view, turn_ordinal),
    FOREIGN KEY (session, view) REFERENCES history_views(session, view) ON DELETE CASCADE
);
CREATE INDEX context_replacements_turn ON context_replacements(turn_ordinal);
";

/// The owner projections a store opens with. A database keeps the profile it
/// was created with.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct Profile {
    pub(crate) catalog: bool,
    pub(crate) turn_links: bool,
}

/// Install the schema in an empty database, or check that this database
/// holds it with the same profile. Every other file is refused unchanged.
pub(crate) fn prepare(connection: &mut Connection, profile: Profile) -> Result<()> {
    let application_id: i64 = connection
        .pragma_query_value(None, "application_id", |row| row.get(0))
        .map_err(database_error)?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(database_error)?;
    match (application_id, version) {
        (APPLICATION_ID, VERSION) => require_profile(connection, profile),
        (0, 0) => install(connection, profile),
        _ => Err(unsupported()),
    }
}

fn install(connection: &mut Connection, profile: Profile) -> Result<()> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let empty: bool = transaction
        .query_row(
            "SELECT NOT EXISTS(SELECT 1 FROM sqlite_schema)",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if !empty {
        return Err(unsupported());
    }
    transaction.execute_batch(SCHEMA).map_err(database_error)?;
    transaction
        .execute(
            "INSERT INTO store_profile(singleton,catalog,turn_links) VALUES(1,?1,?2)",
            params![profile.catalog, profile.turn_links],
        )
        .map_err(database_error)?;
    transaction
        .pragma_update(None, "application_id", APPLICATION_ID)
        .map_err(database_error)?;
    transaction
        .pragma_update(None, "user_version", VERSION)
        .map_err(database_error)?;
    transaction.commit().map_err(commit_error)
}

fn require_profile(connection: &Connection, profile: Profile) -> Result<()> {
    let stored = connection
        .query_row(
            "SELECT catalog,turn_links FROM store_profile WHERE singleton=1",
            [],
            |row| {
                Ok(Profile {
                    catalog: row.get(0)?,
                    turn_links: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(unsupported)?;
    if stored != profile {
        return Err(error(ErrorKind::Unsupported, "store_profile_mismatch"));
    }
    Ok(())
}

fn unsupported() -> agent_kit_core::Error {
    error(ErrorKind::Unsupported, "store_schema_unsupported")
}

#[cfg(test)]
pub(crate) fn install_for_test(connection: &mut Connection) {
    install(
        connection,
        Profile {
            catalog: false,
            turn_links: false,
        },
    )
    .unwrap();
}
