//! Conditional removal from the owner's saved-session catalog.

use super::*;
use rusqlite::types::ValueRef;

pub(super) const SCHEMA: &str = "
CREATE TABLE session_retirements (
    session TEXT PRIMARY KEY,
    scope BLOB NOT NULL CHECK(length(scope) = 32),
    fingerprint BLOB NOT NULL CHECK(length(fingerprint) = 32)
) WITHOUT ROWID;
";

#[derive(Clone, Debug, Serialize)]
pub struct DeleteSession {
    pub session: SessionId,
    pub scope: Fingerprint,
    pub request: ChangeId,
    pub expected_revision: SessionRevision,
    pub expected_catalog_revision: u64,
}

/// Receipt for removal of SQLite-owned records and retirement of their identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionDeleted {
    pub session: SessionId,
    pub request: ChangeId,
}

impl SqliteStore {
    /// Read the receipt for an exact deletion retry in its original scope.
    pub async fn deletion_receipt(&self, request: DeleteSession) -> Result<Option<SessionDeleted>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let fingerprint = deletion_fingerprint(&request)?;
            lookup_receipt(connection, &request, fingerprint)
        })
        .await
    }

    /// Atomically remove an idle, empty-queue session at both observed revisions.
    ///
    /// The owner's pure checks see metadata and all retained turns in the same
    /// transaction. Turns are decoded one at a time within the history scan
    /// bounds. Checks must not do I/O or reenter the store. An exact replay
    /// returns the original receipt without rechecking retired state.
    pub async fn delete_idle(
        &self,
        request: DeleteSession,
        check_session: impl FnOnce(&Envelope, &DriverStateSnapshot) -> Result<()> + Send + 'static,
        check_turn: impl FnMut(&TurnState) -> Result<()> + Send + 'static,
    ) -> Result<SessionDeleted> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = deletion_fingerprint(&request)?;
            if let Some(receipt) = lookup_receipt(&transaction, &request, fingerprint)? {
                return Ok(receipt);
            }

            let id = &request.session;
            let catalog_revision: i64 = transaction
                .query_row(
                    "SELECT revision FROM session_catalog WHERE session=?1 AND scope=?2",
                    params![id.as_str(), request.scope.bytes().as_slice()],
                    |row| row.get(0),
                )
                .optional()
                .map_err(database_error)?
                .ok_or_else(|| error(ErrorKind::InvalidInput, "session_missing"))?;
            if unsigned(catalog_revision)? != request.expected_catalog_revision {
                return Err(error(ErrorKind::Conflict, "session_catalog_revision_changed"));
            }
            let session = load_session(&transaction, id)?;
            require_revision(&session, request.expected_revision)?;
            if session.active_turn.is_some() || has_live_session_owner(inner, id)? {
                return Err(error(ErrorKind::Conflict, "session_deletion_requires_idle"));
            }
            let queued: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM submissions WHERE session=?1 AND queue_order IS NOT NULL)",
                    [id.as_str()],
                    |row| row.get(0),
                )
                .map_err(database_error)?;
            if queued {
                return Err(error(ErrorKind::Conflict, "session_deletion_requires_empty_queue"));
            }
            check_session(&session.configuration, &session.driver_state)?;
            check_turns(&transaction, id, check_turn)?;

            transaction
                .execute(
                    "INSERT INTO session_retirements(session,scope,fingerprint) VALUES(?1,?2,?3)",
                    params![id.as_str(), request.scope.bytes().as_slice(), fingerprint.bytes().as_slice()],
                )
                .map_err(database_error)?;
            for sql in [
                "DELETE FROM session_context_replacements WHERE session=?1",
                "DELETE FROM session_history_views WHERE session=?1",
                "DELETE FROM submissions WHERE session=?1",
                "DELETE FROM requests WHERE session=?1",
                "DELETE FROM turns WHERE session=?1",
                "DELETE FROM sessions WHERE id=?1",
            ] {
                transaction.execute(sql, [id.as_str()]).map_err(database_error)?;
            }
            transaction.commit().map_err(commit_error)?;
            inner.changed.notify_waiters();
            Ok(receipt(&request))
        })
        .await
    }
}

pub(super) fn require_unretired(connection: &Connection, id: &SessionId) -> Result<()> {
    let retired: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM session_retirements WHERE session=?1)",
            [id.as_str()],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if retired {
        return Err(error(ErrorKind::Conflict, "session_identity_retired"));
    }
    Ok(())
}

fn check_turns(
    connection: &Connection,
    session: &SessionId,
    mut check: impl FnMut(&TurnState) -> Result<()>,
) -> Result<()> {
    let mut statement = connection
        .prepare("SELECT id,snapshot FROM turns WHERE session=?1 ORDER BY ordinal LIMIT ?2")
        .map_err(database_error)?;
    let mut rows = statement
        .query(params![session.as_str(), MAX_HISTORY_TURNS + 1])
        .map_err(database_error)?;
    let mut turns = 0;
    let mut bytes = 0;
    while let Some(row) = rows.next().map_err(database_error)? {
        let ValueRef::Blob(snapshot) = row.get_ref(1).map_err(database_error)? else {
            return Err(error(ErrorKind::InvalidState, "stored_data_invalid"));
        };
        turns += 1;
        bytes += snapshot.len();
        if turns > MAX_HISTORY_TURNS || bytes > MAX_HISTORY_SCAN_BYTES {
            return Err(error(
                ErrorKind::LimitExceeded,
                "session_deletion_scan_limit",
            ));
        }
        let turn = TurnId::new(row.get::<_, String>(0).map_err(database_error)?)?;
        let state = decode_turn(snapshot, session, &turn)?;
        if state.outcome().is_none() {
            return Err(error(ErrorKind::Conflict, "session_deletion_requires_idle"));
        }
        check(&state)?;
    }
    Ok(())
}

fn deletion_fingerprint(request: &DeleteSession) -> Result<Fingerprint> {
    Fingerprint::of(&("delete-saved-session-v1", request))
}

fn lookup_receipt(
    connection: &Connection,
    request: &DeleteSession,
    fingerprint: Fingerprint,
) -> Result<Option<SessionDeleted>> {
    let stored: Option<Vec<u8>> = connection
        .query_row(
            "SELECT fingerprint FROM session_retirements WHERE session=?1 AND scope=?2",
            params![request.session.as_str(), request.scope.bytes().as_slice()],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    match stored {
        Some(stored) if stored.as_slice() == fingerprint.bytes() => Ok(Some(receipt(request))),
        Some(_) => Err(error(ErrorKind::Conflict, "request_identity_reused")),
        None => Ok(None),
    }
}

fn receipt(request: &DeleteSession) -> SessionDeleted {
    SessionDeleted {
        session: request.session.clone(),
        request: request.request.clone(),
    }
}
