//! Install the current store schema, open the matching profile, or upgrade
//! the verified version 1 schema. Unknown databases are refused unchanged.

use super::{Result, catalog::ConversationProjection, commit_error, database_error, decode, error};
use agent_kit_core::ErrorKind;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};

/// The SQLite application identity of this store's databases.
pub(crate) const APPLICATION_ID: i64 = 0x4752_4147;
pub(crate) const VERSION: i64 = 5;

/// Encoded values are JSON. Digests and identities the store compares in SQL
/// are raw 32-byte blobs. No CHECK enumerates an open vocabulary such as
/// request kinds, which SQLite could not later extend in place.
const SCHEMA_V1: &str = "
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

// Applied to both new stores and verified version 1 stores. Negative sort
// values let both components of the seek cursor use the same index direction.
const CONVERSATION_SCHEMA: &str = "
ALTER TABLE store_profile ADD COLUMN conversations INTEGER NOT NULL DEFAULT 0
    CHECK (conversations IN (0, 1) AND conversations <= catalog);
ALTER TABLE sessions ADD COLUMN conversation_group TEXT;
ALTER TABLE sessions ADD COLUMN last_message_ms INTEGER CHECK (last_message_ms >= 0);
ALTER TABLE sessions ADD COLUMN message_rank INTEGER GENERATED ALWAYS AS (-coalesce(last_message_ms,-1)) VIRTUAL;
ALTER TABLE sessions ADD COLUMN creation_rank INTEGER GENERATED ALWAYS AS (-ordinal) VIRTUAL;
CREATE INDEX conversations_recent ON sessions(bucket, message_rank, id)
    WHERE conversation_group IS NOT NULL;
CREATE INDEX conversations_group_recent ON sessions(conversation_group, bucket, message_rank, id)
    WHERE conversation_group IS NOT NULL;
CREATE INDEX conversations_created ON sessions(bucket, creation_rank, id)
    WHERE conversation_group IS NOT NULL;
CREATE INDEX conversations_group_created ON sessions(conversation_group, bucket, creation_rank, id)
    WHERE conversation_group IS NOT NULL;
";

// Old conversations begin read. Only newly published final replies establish
// a reply identity; upgrading never scans turn history or manufactures unread mail.
const READ_STATE_SCHEMA: &str = "
ALTER TABLE sessions ADD COLUMN reply_id TEXT;
ALTER TABLE sessions ADD COLUMN read_revision INTEGER NOT NULL DEFAULT 0 CHECK (read_revision >= 0);
ALTER TABLE sessions ADD COLUMN unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0,1));
";

// Idle context additions follow the latest turn without reopening its journal.
// Active turns use the journal itself. Both use the same durable idempotency key.
const ANNOTATION_SCHEMA: &str = "
CREATE TABLE context_annotations (
    ordinal INTEGER PRIMARY KEY,
    session TEXT NOT NULL,
    view INTEGER NOT NULL,
    after_turn INTEGER NOT NULL REFERENCES turns(ordinal) ON DELETE CASCADE,
    record BLOB NOT NULL,
    FOREIGN KEY (session,view) REFERENCES history_views(session,view) ON DELETE CASCADE
);
CREATE INDEX context_annotations_at ON context_annotations(session,view,after_turn,ordinal);
";

// A private branch can see only the checkpoint from its exact history view
// and compatibility scope. It has no catalog membership or transcript rows.
const PRIVATE_CHECKPOINT_SCHEMA: &str = "
CREATE TABLE private_checkpoints (
    session TEXT PRIMARY KEY,
    view INTEGER NOT NULL,
    compatibility BLOB NOT NULL CHECK (length(compatibility) = 32),
    generation BLOB NOT NULL CHECK (length(generation) = 32),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    snapshot BLOB,
    FOREIGN KEY (session,view) REFERENCES history_views(session,view) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE TABLE private_branches (
    session TEXT NOT NULL REFERENCES private_checkpoints(session) ON DELETE CASCADE,
    turn TEXT NOT NULL,
    wait TEXT NOT NULL,
    basis BLOB NOT NULL CHECK (length(basis) = 32),
    revision INTEGER NOT NULL,
    trunk INTEGER NOT NULL CHECK (trunk IN (0,1)),
    snapshot BLOB,
    PRIMARY KEY (session,turn,wait,basis)
) WITHOUT ROWID;
CREATE TRIGGER release_private_turn AFTER UPDATE OF active_turn ON sessions
WHEN OLD.active_turn IS NOT NULL AND OLD.active_turn IS NOT NEW.active_turn
BEGIN DELETE FROM private_branches WHERE session=OLD.id AND turn=OLD.active_turn; END;
";

/// The owner projections a store opens with. A database keeps the profile it
/// was created with.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct Profile {
    pub(crate) catalog: bool,
    pub(crate) turn_links: bool,
}

/// Validate the database identity, version and owner projections before use.
pub(crate) fn prepare(
    connection: &mut Connection,
    profile: Profile,
    conversations: Option<ConversationProjection>,
) -> Result<()> {
    let application_id: i64 = connection
        .pragma_query_value(None, "application_id", |row| row.get(0))
        .map_err(database_error)?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(database_error)?;
    match (application_id, version) {
        (APPLICATION_ID, VERSION | 4 | 3 | 2) => {
            require_profile(connection, profile)?;
            let enabled: bool = connection
                .query_row(
                    "SELECT conversations FROM store_profile WHERE singleton=1",
                    [],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            if enabled != conversations.is_some() {
                return Err(error(ErrorKind::Unsupported, "store_profile_mismatch"));
            }
            if version == VERSION {
                return verify_definitions(connection, version);
            }
            let tx = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            verify_definitions(&tx, version)?;
            if version == 2 {
                tx.execute_batch(READ_STATE_SCHEMA)
                    .map_err(database_error)?;
            }
            if version < 4 {
                tx.execute_batch(ANNOTATION_SCHEMA)
                    .map_err(database_error)?;
            }
            tx.execute_batch(PRIVATE_CHECKPOINT_SCHEMA)
                .map_err(database_error)?;
            tx.pragma_update(None, "user_version", VERSION)
                .map_err(database_error)?;
            tx.commit().map_err(commit_error)
        }
        (APPLICATION_ID, 1) => upgrade(connection, profile, conversations),
        (0, 0) => install(connection, profile, conversations.is_some()),
        _ => Err(unsupported()),
    }
}

fn install(connection: &mut Connection, profile: Profile, conversations: bool) -> Result<()> {
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
    transaction
        .execute_batch(SCHEMA_V1)
        .map_err(database_error)?;
    transaction
        .execute_batch(CONVERSATION_SCHEMA)
        .map_err(database_error)?;
    transaction
        .execute_batch(READ_STATE_SCHEMA)
        .map_err(database_error)?;
    transaction
        .execute_batch(ANNOTATION_SCHEMA)
        .map_err(database_error)?;
    transaction
        .execute_batch(PRIVATE_CHECKPOINT_SCHEMA)
        .map_err(database_error)?;
    transaction
        .execute(
            "INSERT INTO store_profile(singleton,catalog,turn_links,conversations) VALUES(1,?1,?2,?3)",
            params![profile.catalog, profile.turn_links, conversations],
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

fn upgrade(
    connection: &mut Connection,
    profile: Profile,
    conversations: Option<ConversationProjection>,
) -> Result<()> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    // Verify the actual schema before modifying anything. A matching version
    // header alone is insufficient, particularly if there are unknown triggers.
    let reference = Connection::open_in_memory().map_err(database_error)?;
    reference.execute_batch(SCHEMA_V1).map_err(database_error)?;
    if definitions(&transaction)? != definitions(&reference)? {
        return Err(unsupported());
    }
    require_profile(&transaction, profile)?;
    transaction
        .execute_batch(CONVERSATION_SCHEMA)
        .map_err(database_error)?;
    transaction
        .execute_batch(READ_STATE_SCHEMA)
        .map_err(database_error)?;
    transaction
        .execute_batch(ANNOTATION_SCHEMA)
        .map_err(database_error)?;
    transaction
        .execute_batch(PRIVATE_CHECKPOINT_SCHEMA)
        .map_err(database_error)?;
    if let Some(project) = conversations {
        // Version 1 retained immutable session configuration but no message
        // timestamps. Recover membership without opening a single transcript.
        let mut last = 0;
        let mut next = transaction.prepare(
            "SELECT ordinal, configuration FROM sessions WHERE ordinal>?1 ORDER BY ordinal LIMIT 1"
        ).map_err(database_error)?;
        let mut update = transaction
            .prepare("UPDATE sessions SET conversation_group=?1 WHERE ordinal=?2")
            .map_err(database_error)?;
        while let Some((ordinal, bytes)) = next
            .query_row([last], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?))
            })
            .optional()
            .map_err(database_error)?
        {
            if let Some(group) = (project.group)(&decode(&bytes)?) {
                update
                    .execute(params![group, ordinal])
                    .map_err(database_error)?;
            }
            last = ordinal;
        }
        transaction
            .execute(
                "UPDATE store_profile SET conversations=1 WHERE singleton=1",
                [],
            )
            .map_err(database_error)?;
    }
    transaction
        .pragma_update(None, "user_version", VERSION)
        .map_err(database_error)?;
    transaction.commit().map_err(commit_error)
}

fn verify_definitions(connection: &Connection, version: i64) -> Result<()> {
    let reference = Connection::open_in_memory().map_err(database_error)?;
    for sql in [
        Some(SCHEMA_V1),
        Some(CONVERSATION_SCHEMA),
        (version >= 3).then_some(READ_STATE_SCHEMA),
        (version >= 4).then_some(ANNOTATION_SCHEMA),
        (version >= 5).then_some(PRIVATE_CHECKPOINT_SCHEMA),
    ]
    .into_iter()
    .flatten()
    {
        reference.execute_batch(sql).map_err(database_error)?;
    }
    if definitions(connection)? != definitions(&reference)? {
        return Err(unsupported());
    }
    Ok(())
}

fn definitions(connection: &Connection) -> Result<Vec<String>> {
    connection
        .prepare("SELECT sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY name")
        .map_err(database_error)?
        .query_map([], |row| row.get(0))
        .map_err(database_error)?
        .collect::<rusqlite::Result<_>>()
        .map_err(database_error)
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
        false,
    )
    .unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SqliteStore, encode, turn_links::TurnLinkDecision};
    use agent_kit_core::{ChangeId, Envelope, Fingerprint, SchemaId, SessionId};
    use agent_kit_sessions::{SessionStore, Submission};

    #[test]
    fn current_schema_requires_private_checkpoint_cleanup() {
        let mut db = Connection::open_in_memory().unwrap();
        let profile = Profile {
            catalog: false,
            turn_links: false,
        };
        install(&mut db, profile, false).unwrap();
        prepare(&mut db, profile, None).unwrap();
        db.execute_batch("DROP TRIGGER release_private_turn")
            .unwrap();
        assert_eq!(prepare(&mut db, profile, None), Err(unsupported()));
    }

    #[test]
    fn version_four_adds_private_checkpoints_without_touching_other_state() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(SCHEMA_V1).unwrap();
        db.execute_batch(CONVERSATION_SCHEMA).unwrap();
        db.execute_batch(READ_STATE_SCHEMA).unwrap();
        db.execute_batch(ANNOTATION_SCHEMA).unwrap();
        db.pragma_update(None, "application_id", APPLICATION_ID)
            .unwrap();
        db.pragma_update(None, "user_version", 4).unwrap();
        db.execute(
            "INSERT INTO store_profile(singleton,catalog,turn_links) VALUES(1,0,0)",
            [],
        )
        .unwrap();
        let profile = Profile {
            catalog: false,
            turn_links: false,
        };
        db.execute_batch("CREATE TABLE unexpected(value INTEGER);")
            .unwrap();
        assert_eq!(prepare(&mut db, profile, None), Err(unsupported()));
        db.execute_batch("DROP TABLE unexpected;").unwrap();
        prepare(&mut db, profile, None).unwrap();
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM private_checkpoints", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        assert_eq!(
            db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            VERSION
        );
    }

    #[test]
    fn version_three_adds_empty_context_annotations_and_refuses_unknown_objects() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(SCHEMA_V1).unwrap();
        db.execute_batch(CONVERSATION_SCHEMA).unwrap();
        db.execute_batch(READ_STATE_SCHEMA).unwrap();
        db.pragma_update(None, "application_id", APPLICATION_ID)
            .unwrap();
        db.pragma_update(None, "user_version", 3).unwrap();
        db.execute(
            "INSERT INTO store_profile(singleton,catalog,turn_links) VALUES(1,0,0)",
            [],
        )
        .unwrap();
        let profile = Profile {
            catalog: false,
            turn_links: false,
        };
        db.execute_batch("CREATE TABLE unexpected(value INTEGER);")
            .unwrap();
        assert_eq!(prepare(&mut db, profile, None), Err(unsupported()));
        let version: i64 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 3);
        db.execute_batch("DROP TABLE unexpected;").unwrap();
        prepare(&mut db, profile, None).unwrap();
        let annotations: i64 = db
            .query_row("SELECT COUNT(*) FROM context_annotations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(annotations, 0);
    }

    #[test]
    fn version_two_upgrades_read_positions_without_changing_existing_recency() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(SCHEMA_V1).unwrap();
        db.execute_batch(CONVERSATION_SCHEMA).unwrap();
        db.pragma_update(None, "application_id", APPLICATION_ID)
            .unwrap();
        db.pragma_update(None, "user_version", 2).unwrap();
        db.execute(
            "INSERT INTO store_profile(singleton,catalog,turn_links,conversations)
            VALUES(1,1,0,1)",
            [],
        )
        .unwrap();
        db.execute("INSERT INTO sessions(id,configuration,revision,paused,next_input,conversation_group,last_message_ms)
            VALUES('old',X'00',0,0,0,'workspace',42)", []).unwrap();
        let project = ConversationProjection {
            group: |_| panic!("existing groups must not be recomputed"),
            input: |_| false,
            message: |_| false,
            final_reply: |_| None,
            revised_reply: |_, _| Ok(None),
        };
        prepare(
            &mut db,
            Profile {
                catalog: true,
                turn_links: false,
            },
            Some(project),
        )
        .unwrap();
        let state: (bool, i64, Option<String>, i64) = db
            .query_row(
                "SELECT unread,read_revision,reply_id,last_message_ms FROM sessions WHERE id='old'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(state, (false, 0, None, 42));
    }

    #[tokio::test]
    async fn legacy_catalog_upgrades_once_and_dates_only_new_messages() {
        use crate::catalog::ConversationOrder;
        let directory = tempfile::tempdir().unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700))
                .unwrap();
        }
        let path = directory
            .path()
            .canonicalize()
            .unwrap()
            .join("legacy.sqlite");
        drop(crate::open_private_file(&path).unwrap());
        let db = Connection::open(&path).unwrap();
        db.execute_batch(SCHEMA_V1).unwrap();
        db.pragma_update(None, "application_id", APPLICATION_ID)
            .unwrap();
        db.pragma_update(None, "user_version", 1).unwrap();
        db.execute("INSERT INTO store_profile VALUES(1,1,1)", [])
            .unwrap();
        let envelope = |name: &str| {
            Envelope::new(
                SchemaId::new("test.group").unwrap(),
                1,
                name.as_bytes().to_vec(),
            )
            .unwrap()
        };
        let scope = |config: &Envelope| Fingerprint::of(config).ok();
        for name in ["public", "private"] {
            let config = envelope(name);
            db.execute("INSERT INTO sessions(id,configuration,revision,paused,next_input,scope) VALUES(?1,?2,0,0,0,?3)",
                params![name,encode(&config).unwrap(),scope(&config).unwrap().bytes().as_slice()]).unwrap();
        }
        drop(db);
        let links: Option<crate::turn_links::TurnLinkProjection> =
            Some(|_, _| Ok(TurnLinkDecision::Unrelated));
        let conversations = ConversationProjection {
            group: |config| (config.bytes() == b"public").then(|| "public".to_owned()),
            input: |_| true,
            message: |_| false,
            final_reply: |_| None,
            revised_reply: |_, _| Ok(None),
        };
        let open = || SqliteStore::open_with_conversations(&path, scope, links, conversations);
        let version = || {
            Connection::open(&path)
                .unwrap()
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap()
        };
        assert_eq!(
            SqliteStore::open(&path).err().unwrap().code,
            "store_profile_mismatch"
        );
        assert_eq!(version(), 1);
        let db = Connection::open(&path).unwrap();
        db.execute("CREATE TABLE unrecognized (id INTEGER)", [])
            .unwrap();
        assert_eq!(open().err().unwrap().code, "store_schema_unsupported");
        assert_eq!(version(), 1);
        db.execute("DROP TABLE unrecognized", []).unwrap();

        // Stall a real migration after it acquired the legacy writer lock,
        // then start the execution host while that lock is still occupied.
        db.execute_batch("BEGIN IMMEDIATE").unwrap();
        let store = std::thread::scope(|threads| {
            use crate::catalog_reader::CatalogReader;
            use std::{
                sync::mpsc,
                thread,
                time::{Duration, Instant},
            };
            let reader = threads.spawn(|| {
                CatalogReader::open_with_conversations(&path, false, scope, links, conversations)
                    .unwrap()
                    .is_some()
            });
            let deadline = Instant::now() + Duration::from_secs(3);
            while std::fs::metadata(crate::lock_path(&path)).unwrap().len() == 0 {
                assert!(
                    Instant::now() < deadline,
                    "catalog never acquired the migration lock"
                );
                thread::sleep(Duration::from_millis(2));
            }
            let (tx, rx) = mpsc::channel();
            threads.spawn(move || tx.send(open()).unwrap());
            assert!(matches!(
                rx.recv_timeout(Duration::from_millis(100)),
                Err(mpsc::RecvTimeoutError::Timeout)
            ));
            db.execute_batch("ROLLBACK").unwrap();
            assert!(reader.join().unwrap());
            rx.recv().unwrap().unwrap()
        });
        drop(db);
        // Only startup waits; a second actual execution owner still fails.
        assert_eq!(open().err().unwrap().code, "store_already_owned");
        assert_eq!(version(), VERSION);
        let list = |store: &SqliteStore| {
            let store = store.clone();
            async move {
                store
                    .list_conversations(None, 0, ConversationOrder::Recent, None, 32)
                    .await
                    .unwrap()
                    .entries
            }
        };
        let rows = list(&store).await;
        assert_eq!(rows.len(), 1);
        let id = SessionId::new("public").unwrap();
        assert_eq!(rows[0].record.entry.session, id);
        assert!(rows[0].record.last_message_ms.is_none());
        store
            .submit(
                id,
                Submission {
                    id: ChangeId::new("message").unwrap(),
                    payload: envelope("accepted"),
                },
            )
            .await
            .unwrap();
        let time = list(&store).await[0].record.last_message_ms.unwrap();
        drop(store);
        assert_eq!(
            list(&open().unwrap()).await[0].record.last_message_ms,
            Some(time)
        );
    }
}
