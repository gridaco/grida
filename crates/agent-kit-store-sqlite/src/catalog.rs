//! Bounded catalog pages keyed by an opaque scope selected by the owner.

use super::*;

const PAGE_SIZE: usize = 32;
const MAX_LABEL_BYTES: usize = 256;
const PROJECTION_BATCH: i64 = 128;
// A serialized envelope represents each byte with at most three digits
// and a comma, plus its bounded schema name and version.
const MAX_CONFIGURATION_BYTES: usize = Envelope::MAX_BYTES * 4 + 1024;

pub(super) const SCHEMA: &str = "
CREATE TABLE session_catalog (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
    scope BLOB CHECK(scope IS NULL OR length(scope) IN (0, 32))
);
CREATE INDEX session_catalog_scope ON session_catalog(scope, ordinal);
INSERT INTO session_catalog(session) SELECT id FROM sessions ORDER BY rowid;
";

pub(super) const ORGANIZATION_SCHEMA: &str = "
ALTER TABLE session_catalog ADD COLUMN bucket INTEGER NOT NULL DEFAULT 0 CHECK(bucket BETWEEN 0 AND 255);
ALTER TABLE session_catalog ADD COLUMN label TEXT CHECK(length(CAST(label AS BLOB)) <= 256);
ALTER TABLE session_catalog ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0);
DROP INDEX session_catalog_scope;
CREATE INDEX session_catalog_bucket ON session_catalog(scope, bucket, ordinal);
";

// The owner's newer projection can classify previously unscoped rows.
pub(super) const REPROJECT_UNSCOPED: &str = "UPDATE session_catalog SET scope=NULL WHERE scope=X''";

/// Return a stable scope for an immutable configuration this owner recognizes.
pub type ScopeProjection = fn(&Envelope) -> Option<Fingerprint>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CatalogEntry {
    pub session: SessionId,
    pub bucket: u8,
    pub label: Option<String>,
    pub revision: u64,
}

pub struct CatalogPage<T = CatalogEntry> {
    pub entries: Vec<T>,
    pub next_after: Option<SessionId>,
}

impl SqliteStore {
    /// Check an owner-defined scope without reading catalog entries or turns.
    pub async fn has_catalog_entries(&self, scope: Fingerprint) -> Result<bool> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM session_catalog WHERE scope=?1)",
                    [scope.bytes().as_slice()],
                    |row| row.get(0),
                )
                .map_err(database_error)
        })
        .await
    }

    /// List by newest creation within one scope and owner-selected bucket.
    /// The supplied anchor must belong to that scope. This reads no turns.
    pub async fn list_catalog(
        &self,
        scope: Fingerprint,
        bucket: u8,
        after: Option<SessionId>,
    ) -> Result<CatalogPage> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            read_page(connection, scope, bucket, after)
        })
        .await
    }

    /// Read the same bounded page with immutable configuration, without
    /// reading queues, turn snapshots, or transcripts.
    pub async fn list_catalog_configurations(
        &self,
        scope: Fingerprint,
        bucket: u8,
        after: Option<SessionId>,
    ) -> Result<CatalogPage<(SessionId, Envelope)>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let page = read_page(connection, scope, bucket, after)?;
            let mut statement = connection
                .prepare_cached("SELECT configuration FROM sessions WHERE id=?1")
                .map_err(database_error)?;
            let entries = page
                .entries
                .into_iter()
                .map(|entry| {
                    let configuration: Vec<u8> = statement
                        .query_row([entry.session.as_str()], |row| row.get(0))
                        .map_err(database_error)?;
                    Ok((entry.session, decode(&configuration)?))
                })
                .collect::<Result<_>>()?;
            Ok(CatalogPage {
                entries,
                next_after: page.next_after,
            })
        })
        .await
    }

    pub async fn catalog_entry(&self, session: SessionId) -> Result<CatalogEntry> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            lookup(connection, &session)
        })
        .await
    }

    /// Replace only presentation metadata at the observed catalog revision.
    /// Session execution and its revision are independent of this record.
    pub async fn replace_catalog_entry(&self, entry: CatalogEntry) -> Result<CatalogEntry> {
        if entry
            .label
            .as_ref()
            .is_some_and(|label| label.len() > MAX_LABEL_BYTES)
        {
            return Err(error(
                ErrorKind::InvalidInput,
                "session_catalog_label_too_large",
            ));
        }
        execute(Arc::clone(&self.inner), move |_, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let current = lookup(&transaction, &entry.session)?;
            if current.bucket == entry.bucket && current.label == entry.label {
                return Ok(current);
            }
            if current.revision != entry.revision {
                return Err(error(ErrorKind::InvalidInput, "session_catalog_revision_changed"));
            }
            transaction
                .execute(
                    "UPDATE session_catalog SET bucket=?1,label=?2,revision=revision+1 WHERE session=?3",
                    params![entry.bucket, entry.label, entry.session.as_str()],
                )
                .map_err(database_error)?;
            let updated = lookup(&transaction, &entry.session)?;
            transaction.commit().map_err(commit_error)?;
            Ok(updated)
        })
        .await
    }
}

fn read_page(
    connection: &Connection,
    scope: Fingerprint,
    bucket: u8,
    after: Option<SessionId>,
) -> Result<CatalogPage> {
    let scope = scope.bytes().as_slice();
    let upper = if let Some(after) = after {
        let ordinal: i64 = connection
            .query_row(
                "SELECT ordinal FROM session_catalog WHERE scope=?1 AND session=?2",
                params![scope, after.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?
            .ok_or_else(|| error(ErrorKind::InvalidInput, "invalid_session_cursor"))?;
        ordinal - 1
    } else {
        i64::MAX
    };
    let mut statement = connection
        .prepare(
            "SELECT session,bucket,label,revision FROM session_catalog
             WHERE scope=?1 AND bucket=?2 AND ordinal<=?3
             ORDER BY ordinal DESC LIMIT ?4",
        )
        .map_err(database_error)?;
    let mut entries = statement
        .query_map(
            params![scope, bucket, upper, PAGE_SIZE as i64 + 1],
            read_entry,
        )
        .map_err(database_error)?
        .map(decode_entry)
        .collect::<Result<Vec<_>>>()?;
    let next_after = if entries.len() > PAGE_SIZE {
        entries.pop();
        entries.last().map(|entry| entry.session.clone())
    } else {
        None
    };
    Ok(CatalogPage {
        entries,
        next_after,
    })
}

type StoredEntry = (String, u8, Option<String>, i64);

fn read_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredEntry> {
    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
}

fn decode_entry(row: rusqlite::Result<StoredEntry>) -> Result<CatalogEntry> {
    let (session, bucket, label, revision) = row.map_err(database_error)?;
    Ok(CatalogEntry {
        session: SessionId::new(session)?,
        bucket,
        label,
        revision: u64::try_from(revision)
            .map_err(|_| error(ErrorKind::InvalidState, "invalid_session_catalog_revision"))?,
    })
}

fn lookup(connection: &Connection, session: &SessionId) -> Result<CatalogEntry> {
    let row = connection
        .query_row(
            "SELECT session,bucket,label,revision FROM session_catalog WHERE session=?1",
            [session.as_str()],
            read_entry,
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "session_catalog_entry_missing"))?;
    decode_entry(Ok(row))
}

pub(super) fn insert(
    transaction: &Transaction<'_>,
    request: &CreateSession,
    project: Option<ScopeProjection>,
) -> Result<()> {
    let scope = project.map(|project| encode_scope(project(&request.configuration)));
    transaction
        .execute(
            "INSERT INTO session_catalog(session,scope) VALUES(?1,?2)",
            params![request.id.as_str(), scope],
        )
        .map_err(database_error)?;
    Ok(())
}

pub(super) fn project_existing(
    connection: &mut Connection,
    project: ScopeProjection,
) -> Result<()> {
    let transaction = connection.transaction().map_err(database_error)?;
    let mut through = 0;
    loop {
        let mut candidates = Vec::new();
        {
            let mut statement = transaction
                .prepare(
                    "SELECT c.ordinal,s.configuration FROM session_catalog c
                     JOIN sessions s ON s.id=c.session
                     WHERE c.scope IS NULL AND c.ordinal>?1 ORDER BY c.ordinal LIMIT ?2",
                )
                .map_err(database_error)?;
            let mut rows = statement
                .query(params![through, PROJECTION_BATCH])
                .map_err(database_error)?;
            while let Some(row) = rows.next().map_err(database_error)? {
                let ordinal: i64 = row.get(0).map_err(database_error)?;
                let bytes = row
                    .get_ref(1)
                    .map_err(database_error)?
                    .as_blob()
                    .map_err(|_| {
                        error(
                            ErrorKind::InvalidState,
                            "invalid_session_catalog_configuration",
                        )
                    })?;
                let scope = if bytes.len() <= MAX_CONFIGURATION_BYTES {
                    decode::<Envelope>(bytes).ok().as_ref().and_then(project)
                } else {
                    None
                };
                candidates.push((ordinal, encode_scope(scope)));
                through = ordinal;
            }
        }
        if candidates.is_empty() {
            break;
        }
        for (ordinal, scope) in candidates {
            transaction
                .execute(
                    "UPDATE session_catalog SET scope=?1 WHERE ordinal=?2",
                    params![scope, ordinal],
                )
                .map_err(database_error)?;
        }
    }
    transaction.commit().map_err(commit_error)
}

fn encode_scope(scope: Option<Fingerprint>) -> Vec<u8> {
    // NULL means this row has never been projected. Empty records an
    // unsupported configuration without making it visible in any scope.
    scope.map_or_else(Vec::new, |scope| scope.bytes().to_vec())
}
