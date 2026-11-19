//! Bounded catalog pages keyed by an opaque scope selected by the owner.

use super::*;

const PAGE_SIZE: usize = 32;
const MAX_LABEL_BYTES: usize = 256;
const TURN_ACTIVITY: &str = "SELECT active_turn,
    (SELECT COALESCE(settled_ms,started_ms) FROM turns
     WHERE session=?1 ORDER BY ordinal DESC LIMIT 1)
    FROM sessions WHERE id=?1";

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

/// The owner can propose a label at first input acceptance, or reserve an
/// untitled entry for a later conditional suggestion.
pub enum InitialLabel {
    Display(String),
    AwaitSuggestion,
}

/// Catalog metadata with read-only facts about local turn activity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CatalogRecord {
    pub entry: CatalogEntry,
    /// Wall-clock milliseconds since the Unix epoch from the latest turn by
    /// execution ordinal: its first settlement time, or its start time until
    /// settlement. Absent when the session has no local turn. This fact never
    /// orders or authorizes work and is not a catalog mutation input.
    pub latest_turn_activity_ms: Option<u64>,
    /// The current turn's authoritative disposition, absent for an idle or queued-only session.
    pub current_turn_disposition: Option<TurnDisposition>,
}

/// One page of a scoped catalog listing in reverse creation order.
pub struct CatalogPage<T = CatalogEntry> {
    pub entries: Vec<T>,
    /// The anchor for the next page, absent after the last page.
    pub next_after: Option<SessionId>,
}

impl SqliteStore {
    /// Read presentation metadata only after verifying its owner-defined scope.
    pub async fn scoped_catalog_entry(
        &self,
        scope: Fingerprint,
        session: SessionId,
    ) -> Result<CatalogEntry> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            scoped_lookup(connection, scope, &session)
        })
        .await
    }

    /// Read catalog metadata and local turn activity after verifying its scope.
    pub async fn scoped_catalog_record(
        &self,
        scope: Fingerprint,
        session: SessionId,
    ) -> Result<CatalogRecord> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let entry = scoped_lookup(connection, scope, &session)?;
            read_record(inner, connection, entry)
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

    /// Read the same bounded catalog page with the latest retained local
    /// turn's timing and the current turn's disposition. Indexed reads visit
    /// the current turn head when present, without loading queues or transcripts.
    pub async fn list_catalog_records(
        &self,
        scope: Fingerprint,
        bucket: u8,
        after: Option<SessionId>,
    ) -> Result<CatalogPage<CatalogRecord>> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let page = read_page(connection, scope, bucket, after)?;
            let entries = page
                .entries
                .into_iter()
                .map(|entry| read_record(inner, connection, entry))
                .collect::<Result<_>>()?;
            Ok(CatalogPage {
                entries,
                next_after: page.next_after,
            })
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
            let entries = page
                .entries
                .into_iter()
                .map(|entry| {
                    let configuration = load_configuration(connection, &entry.session)?;
                    Ok((entry.session, configuration))
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

    /// Read catalog metadata and local turn activity without a scope filter.
    /// The owner is responsible for authorizing the session identity.
    pub async fn catalog_record(&self, session: SessionId) -> Result<CatalogRecord> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let entry = lookup(connection, &session)?;
            read_record(inner, connection, entry)
        })
        .await
    }

    /// Replace catalog metadata at its observed revision. A label edit may
    /// cross an automatic label update within the same bucket. Any intervening
    /// human edit or bucket change fences stale revisions.
    pub async fn replace_catalog_entry(&self, entry: CatalogEntry) -> Result<CatalogEntry> {
        validate_label(entry.label.as_deref())?;
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let current = lookup(&transaction, &entry.session)?;
            let same_label = current.label == entry.label;
            let same_bucket = current.bucket == entry.bucket;
            let manual = label_change(&transaction, &entry.session, MANUAL)?.is_some();
            let initial = label_change(&transaction, &entry.session, INITIAL)?;
            let generated = label_change(&transaction, &entry.session, GENERATED)?;
            let pending = !manual && initial.is_some() && generated.is_none();
            // A rename can cross automatic label writes only. Any intervening
            // move or human edit ends that range, including a move away and back.
            let can_rebase_rename = same_bucket
                && !manual
                && generated.or(initial).is_some_and(|change| {
                    change.revision == current.revision
                        && (change.basis..change.revision).contains(&entry.revision)
                });
            let can_apply = current.revision == entry.revision || can_rebase_rename;
            // A retry of an already-applied move must not take over the title.
            if same_label && same_bucket && (!pending || !can_apply) {
                return Ok(current);
            }
            if !can_apply {
                return Err(error(
                    ErrorKind::Conflict,
                    "session_catalog_revision_changed",
                ));
            }
            let revision =
                write_entry(&transaction, &current, entry.bucket, entry.label.as_deref())?;
            if !manual && (!same_label || same_bucket) {
                // Reaffirming the displayed label also claims it. A bucket-only
                // move preserves both the current label and its pending suggestion.
                record_label_change(
                    &transaction,
                    &entry.session,
                    MANUAL,
                    current.revision,
                    revision,
                )?;
            }
            let updated = lookup(&transaction, &entry.session)?;
            commit(inner, transaction)?;
            Ok(updated)
        })
        .await
    }

    /// Finalize the first input's suggestion after any bucket-only moves.
    /// A human label edit (including clearing or confirming it) wins.
    pub async fn finish_label_suggestion(
        &self,
        session: SessionId,
        expected: u64,
        label: String,
    ) -> Result<()> {
        validate_label(Some(&label))?;
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let tx = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let Some(initial) = label_change(&tx, &session, INITIAL)? else {
                return Ok(());
            };
            if initial.revision != expected
                || label_change(&tx, &session, MANUAL)?.is_some()
                || label_change(&tx, &session, GENERATED)?.is_some()
            {
                return Ok(());
            }
            let current = lookup(&tx, &session)?;
            let basis = if current.revision == expected {
                initial.basis
            } else {
                current.revision
            };
            let revision = write_entry(&tx, &current, current.bucket, Some(&label))?;
            record_label_change(&tx, &session, GENERATED, basis, revision)?;
            commit(inner, tx)?;
            Ok(())
        })
        .await
    }
}

fn validate_label(label: Option<&str>) -> Result<()> {
    if label.is_some_and(|v| v.len() > MAX_LABEL_BYTES) {
        return Err(error(
            ErrorKind::InvalidInput,
            "session_catalog_label_too_large",
        ));
    }
    Ok(())
}

/// The first accepted input can initialize an unlabeled catalog entry after
/// placement changes. A label already assigned or cleared by its owner wins.
pub(super) fn initial_label(
    tx: &Transaction<'_>,
    session: &SessionId,
    initial: InitialLabel,
) -> Result<Option<u64>> {
    let entry = lookup(tx, session)?;
    if entry.label.is_some() || label_change(tx, session, MANUAL)?.is_some() {
        return Ok(None);
    }
    let revision = match initial {
        InitialLabel::Display(label) => {
            validate_label(Some(&label))?;
            write_entry(tx, &entry, entry.bucket, Some(&label))?
        }
        InitialLabel::AwaitSuggestion => entry.revision,
    };
    record_label_change(tx, session, INITIAL, entry.revision, revision)?;
    Ok(Some(revision))
}

// Three immutable receipts at most, regardless of how many times a session is
// organized. Existing databases without these receipts keep their own labels.
const LABEL_CHANGE: &str = "catalog_label_change";
const INITIAL: &str = "initial";
const GENERATED: &str = "generated";
const MANUAL: &str = "manual";

#[derive(Clone, Copy, Serialize, Deserialize)]
struct LabelChange {
    basis: u64,
    revision: u64,
}

fn label_change(
    connection: &Connection,
    session: &SessionId,
    kind: &str,
) -> Result<Option<LabelChange>> {
    lookup_request(
        connection,
        session,
        LABEL_CHANGE,
        &ChangeId::new(kind)?,
        Fingerprint::of(&kind)?,
    )
}

fn record_label_change(
    tx: &Transaction<'_>,
    session: &SessionId,
    kind: &str,
    basis: u64,
    revision: u64,
) -> Result<()> {
    save_request(
        tx,
        session,
        LABEL_CHANGE,
        &ChangeId::new(kind)?,
        Fingerprint::of(&kind)?,
        &LabelChange { basis, revision },
    )
}

fn write_entry(
    tx: &Transaction<'_>,
    current: &CatalogEntry,
    bucket: u8,
    label: Option<&str>,
) -> Result<u64> {
    tx.execute(
        "UPDATE sessions SET bucket=?1,label=?2,catalog_revision=catalog_revision+1 WHERE id=?3",
        params![bucket, label, current.session.as_str()],
    )
    .map_err(database_error)?;
    Ok(current.revision + 1)
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

fn scoped_lookup(
    connection: &Connection,
    scope: Fingerprint,
    session: &SessionId,
) -> Result<CatalogEntry> {
    let admitted: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND scope=?2)",
            params![session.as_str(), scope.bytes().as_slice()],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if !admitted {
        return Err(error(
            ErrorKind::Unavailable,
            "session_catalog_scope_mismatch",
        ));
    }
    lookup(connection, session)
}

fn read_record(
    inner: &Inner,
    connection: &Connection,
    entry: CatalogEntry,
) -> Result<CatalogRecord> {
    let (current, activity): (Option<String>, Option<i64>) = connection
        .prepare_cached(TURN_ACTIVITY)
        .map_err(database_error)?
        .query_row([entry.session.as_str()], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(database_error)?;
    let current_turn_disposition = current
        .map(|id| Ok(view_turn(inner, connection, &entry.session, &TurnId::new(id)?)?.disposition))
        .transpose()?;
    Ok(CatalogRecord {
        entry,
        latest_turn_activity_ms: activity.map(unsigned).transpose()?,
        current_turn_disposition,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_turn_timing_uses_the_session_ordinal_index() {
        let mut connection = Connection::open_in_memory().unwrap();
        schema::install_for_test(&mut connection);
        let mut statement = connection
            .prepare(&format!("EXPLAIN QUERY PLAN {TURN_ACTIVITY}"))
            .unwrap();
        let plan = statement
            .query_map(["session"], |row| row.get::<_, String>(3))
            .unwrap()
            .collect::<std::result::Result<Vec<_>, _>>()
            .unwrap();
        assert!(
            plan.iter()
                .any(|step| { step.contains("SEARCH") && step.contains("turns_by_session") }),
            "{plan:?}"
        );
        assert!(
            plan.iter()
                .all(|step| !step.contains("SCAN") && !step.contains("TEMP B-TREE")),
            "{plan:?}"
        );
    }
}
