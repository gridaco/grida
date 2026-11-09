//! Read-only catalog pages keyed by an opaque scope selected by the owner.

use super::*;

const PAGE_SIZE: usize = 32;
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

/// Return a stable scope for an immutable configuration this owner recognizes.
pub type ScopeProjection = fn(&Envelope) -> Option<Fingerprint>;

pub struct CatalogPage {
    pub sessions: Vec<SessionId>,
    pub next_after: Option<SessionId>,
}

impl SqliteStore {
    /// List by newest creation within one scope. The supplied anchor must be
    /// a visible session in that scope. This reads no turn or input records.
    pub async fn list_catalog(
        &self,
        scope: Fingerprint,
        after: Option<SessionId>,
    ) -> Result<CatalogPage> {
        execute(Arc::clone(&self.inner), move |_, connection| {
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
                    "SELECT session FROM session_catalog WHERE scope=?1 AND ordinal<=?2
                 ORDER BY ordinal DESC LIMIT ?3",
                )
                .map_err(database_error)?;
            let mut sessions = statement
                .query_map(params![scope, upper, PAGE_SIZE as i64 + 1], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(database_error)?
                .map(|value| SessionId::new(value.map_err(database_error)?))
                .collect::<Result<Vec<_>>>()?;
            let next_after = if sessions.len() > PAGE_SIZE {
                sessions.pop();
                sessions.last().cloned()
            } else {
                None
            };
            Ok(CatalogPage {
                sessions,
                next_after,
            })
        })
        .await
    }
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
