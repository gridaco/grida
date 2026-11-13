//! Bounded catalog pages keyed by an opaque scope selected by the owner.

use super::*;

const PAGE_SIZE: usize = 32;
const MAX_LABEL_BYTES: usize = 256;

/// Return a stable scope for an immutable configuration this owner recognizes.
pub type ScopeProjection = fn(&Envelope) -> Option<Fingerprint>;

/// A session's owner-defined catalog placement and display label.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CatalogEntry {
    pub session: SessionId,
    /// Owner-defined group within the scope, such as active or archived.
    pub bucket: u8,
    /// Optional bounded display label.
    pub label: Option<String>,
    /// Advances with every change to this entry; updates are conditional on it.
    pub revision: u64,
}

/// One page of a scoped catalog listing in reverse creation order.
pub struct CatalogPage<T = CatalogEntry> {
    pub entries: Vec<T>,
    /// The anchor for the next page, absent after the last page.
    pub next_after: Option<SessionId>,
}

impl SqliteStore {
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
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let current = lookup(&transaction, &entry.session)?;
            if current.bucket == entry.bucket && current.label == entry.label {
                return Ok(current);
            }
            if current.revision != entry.revision {
                return Err(error(ErrorKind::Conflict, "session_catalog_revision_changed"));
            }
            transaction
                .execute(
                    "UPDATE sessions SET bucket=?1,label=?2,catalog_revision=catalog_revision+1 WHERE id=?3",
                    params![entry.bucket, entry.label, entry.session.as_str()],
                )
                .map_err(database_error)?;
            let updated = lookup(&transaction, &entry.session)?;
            commit(inner, transaction)?;
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
                "SELECT ordinal FROM sessions WHERE scope=?1 AND id=?2",
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
            "SELECT id,bucket,label,catalog_revision FROM sessions
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
            "SELECT id,bucket,label,catalog_revision FROM sessions WHERE id=?1",
            [session.as_str()],
            read_entry,
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "session_catalog_entry_missing"))?;
    decode_entry(Ok(row))
}
