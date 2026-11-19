//! Bounded catalog pages keyed by an opaque scope selected by the owner.

use super::*;
use agent_kit_core::messages::Message;

const PAGE_SIZE: usize = 32;
const MAX_LABEL_BYTES: usize = 256;
const TURN_ACTIVITY: &str = "SELECT active_turn, last_message_ms,
    (SELECT COALESCE(settled_ms,started_ms) FROM turns
     WHERE session=?1 ORDER BY ordinal DESC LIMIT 1), unread, read_revision, reply_id
    FROM sessions WHERE id=?1";

/// Return a stable scope for an immutable configuration this owner recognizes.
pub type ScopeProjection = fn(&Envelope) -> Option<Fingerprint>;

/// The owner identifies discoverable conversations, accepted conversational
/// submissions and newly published messages. An admission and its subsequent
/// replay into history should be counted by only one of the two predicates.
#[derive(Clone, Copy)]
pub struct ConversationProjection {
    pub group: fn(&Envelope) -> Option<String>,
    pub input: fn(&Submission) -> bool,
    pub message: fn(&Message) -> bool,
    /// Select the last user-visible reply from a newly settled turn.
    pub final_reply: fn(&TurnState) -> Option<agent_kit_core::MessageId>,
}

/// Last projected reply and the revision a client must have displayed to
/// acknowledge it. Independent from both recency and title/placement revisions.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationReadState {
    pub unread: bool,
    pub revision: u64,
    pub reply_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum ReadStateUpdate {
    Acknowledge {
        revision: u64,
        #[serde(rename = "replyId", deserialize_with = "Deserialize::deserialize")]
        reply_id: Option<agent_kit_core::MessageId>,
    },
    MarkUnread,
}

fn read_state(row: &rusqlite::Row<'_>, start: usize) -> rusqlite::Result<ConversationReadState> {
    let revision: i64 = row.get(start + 1)?;
    Ok(ConversationReadState {
        unread: row.get(start)?,
        revision: u64::try_from(revision)
            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(start + 1, revision))?,
        reply_id: row.get(start + 2)?,
    })
}

/// This operation changes only catalog read metadata. It can also be called
/// by an independently authorized catalog connection to an active store.
pub(crate) fn update_conversation_read(
    connection: &mut Connection,
    group: &str,
    bucket: u8,
    session: &SessionId,
    update: &ReadStateUpdate,
) -> Result<(ConversationReadState, bool)> {
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let mut current = tx
        .query_row(
            "SELECT unread,read_revision,reply_id FROM sessions
         WHERE conversation_group=?1 AND id=?2 AND bucket=?3",
            params![group, session.as_str(), bucket],
            |row| read_state(row, 0),
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "session_catalog_scope_mismatch"))?;
    let unread = match update {
        ReadStateUpdate::Acknowledge { revision, reply_id } => {
            if !current.unread
                || *revision != current.revision
                || reply_id.as_ref().map(|id| id.as_str()) != current.reply_id.as_deref()
            {
                return Ok((current, false));
            }
            false
        }
        // Even when already unread, this intent supersedes earlier displays.
        ReadStateUpdate::MarkUnread => true,
    };
    current = tx
        .query_row(
            "UPDATE sessions SET unread=?1,read_revision=read_revision+1 WHERE id=?2
         RETURNING unread,read_revision,reply_id",
            params![unread, session.as_str()],
            |row| read_state(row, 0),
        )
        .map_err(database_error)?;
    tx.commit().map_err(commit_error)?;
    Ok((current, true))
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConversationOrder {
    Created,
    Recent,
}

/// The ordering value is captured when the page is read. A subsequent message
/// or deletion cannot move the boundary when the caller requests the next page.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ConversationAnchor {
    pub value: i64,
    pub session: SessionId,
}

pub struct ConversationRow {
    pub group: String,
    pub record: CatalogRecord,
    pub anchor: ConversationAnchor,
}

pub struct ConversationPage {
    pub entries: Vec<ConversationRow>,
    pub next_after: Option<ConversationAnchor>,
}

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
    pub read_state: ConversationReadState,
    /// Most recent projected conversational admission or publication. Absent
    /// when no message timestamp was recorded (including version 1 data).
    pub last_message_ms: Option<u64>,
    /// Wall-clock milliseconds since the Unix epoch from the latest turn by
    /// execution ordinal: its first settlement time, or its start time until
    /// settlement. Absent when the session has no local turn. This fact never
    /// orders or authorizes work and is not a catalog mutation input.
    pub latest_turn_activity_ms: Option<u64>,
    /// The current turn's authoritative disposition, absent for an idle or queued-only session.
    pub current_turn_disposition: Option<TurnDisposition>,
    /// Open request schema identities for the current turn eligible for input.
    pub pending_request_schemas: BTreeSet<agent_kit_core::SchemaId>,
}

/// One page of a scoped catalog listing in reverse creation order.
pub struct CatalogPage<T = CatalogEntry> {
    pub entries: Vec<T>,
    /// The anchor for the next page, absent after the last page.
    pub next_after: Option<SessionId>,
}

impl SqliteStore {
    /// Acknowledge a displayed reply or deliberately mark a public chat unread.
    pub async fn update_read_state(
        &self,
        group: String,
        bucket: u8,
        session: SessionId,
        update: ReadStateUpdate,
    ) -> Result<ConversationReadState> {
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let (state, changed) =
                update_conversation_read(connection, &group, bucket, &session, &update)?;
            if changed && let Some(marker) = &inner.catalog_marker {
                marker.changed();
            }
            Ok(state)
        })
        .await
    }

    /// List discoverable conversations. Both group filtering and ordering
    /// precede pagination. Reading a page never loads conversation history.
    pub async fn list_conversations(
        &self,
        group: Option<String>,
        bucket: u8,
        order: ConversationOrder,
        after: Option<ConversationAnchor>,
        limit: usize,
    ) -> Result<ConversationPage> {
        if !(1..=PAGE_SIZE).contains(&limit)
            || after.as_ref().is_some_and(|anchor| anchor.value < -1)
        {
            return Err(error(ErrorKind::InvalidInput, "invalid_conversation_page"));
        }
        execute(Arc::clone(&self.inner), move |inner, connection| {
            if inner.conversations.is_none() {
                return Err(error(
                    ErrorKind::Unsupported,
                    "conversation_catalog_unavailable",
                ));
            }
            conversation_page(
                connection,
                group.as_deref(),
                bucket,
                order,
                (after.as_ref(), false),
                limit,
                |entry| read_record(inner, connection, entry),
            )
        })
        .await
    }

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

/// Ascending tuples let SQLite seek directly to (time, id), including
/// within a large timestamp tie. Only fixed SQL fragments vary.
pub(crate) fn conversation_page(
    connection: &Connection,
    group: Option<&str>,
    bucket: u8,
    order: ConversationOrder,
    boundary: (Option<&ConversationAnchor>, bool),
    limit: usize,
    mut record: impl FnMut(CatalogEntry) -> Result<CatalogRecord>,
) -> Result<ConversationPage> {
    let (after, inclusive) = boundary;
    let sql = conversation_page_query(order, group.is_some(), inclusive);
    let (boundary, id) = after.as_ref().map_or((i64::MIN, ""), |anchor| {
        (-anchor.value, anchor.session.as_str())
    });
    let mut query = connection.prepare_cached(&sql).map_err(database_error)?;
    let mut rows = query
        .query(params![bucket, group, boundary, id, limit as i64 + 1])
        .map_err(database_error)?;
    let mut entries = Vec::with_capacity(limit);
    let mut next_after = None;
    while let Some(row) = rows.next().map_err(database_error)? {
        if entries.len() == limit {
            next_after = entries
                .last()
                .map(|row: &ConversationRow| row.anchor.clone());
            break;
        }
        let entry = decode_entry(read_entry(row))?;
        let anchor = ConversationAnchor {
            value: -row.get::<_, i64>(5).map_err(database_error)?,
            session: entry.session.clone(),
        };
        entries.push(ConversationRow {
            group: row.get(4).map_err(database_error)?,
            record: record(entry)?,
            anchor,
        });
    }
    Ok(ConversationPage {
        entries,
        next_after,
    })
}

fn conversation_page_query(order: ConversationOrder, grouped: bool, inclusive: bool) -> String {
    let rank = match order {
        ConversationOrder::Created => "creation_rank",
        ConversationOrder::Recent => "message_rank",
    };
    let comparator = if inclusive { ">=" } else { ">" };
    let scope = if grouped {
        "conversation_group = ?2"
    } else {
        "conversation_group IS NOT NULL"
    };
    format!(
        "SELECT id, bucket, label, catalog_revision, conversation_group, {rank}
         FROM sessions WHERE bucket=?1 AND {scope} AND ({rank}, id) {comparator} (?3, ?4)
         ORDER BY {rank}, id LIMIT ?5"
    )
}

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
    record_with_view(connection, entry, |session, turn| {
        view_turn(inner, connection, session, turn)
    })
}

pub(crate) fn record_with_view(
    connection: &Connection,
    entry: CatalogEntry,
    view: impl FnOnce(&SessionId, &TurnId) -> Result<TurnView>,
) -> Result<CatalogRecord> {
    let (current, last_message, activity, read_state) = connection
        .prepare_cached(TURN_ACTIVITY)
        .map_err(database_error)?
        .query_row([entry.session.as_str()], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<i64>>(2)?,
                read_state(row, 3)?,
            ))
        })
        .map_err(database_error)?;
    let current = current
        .map(|id| view(&entry.session, &TurnId::new(id)?))
        .transpose()?;
    Ok(CatalogRecord {
        entry,
        read_state,
        last_message_ms: last_message.map(unsigned).transpose()?,
        latest_turn_activity_ms: activity.map(unsigned).transpose()?,
        current_turn_disposition: current.as_ref().map(|turn| turn.disposition),
        pending_request_schemas: current
            .filter(|turn| !turn.controls.cancelled)
            .map(|turn| turn.pending_request_schemas)
            .unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversation_pages_seek_the_ordering_tuple_in_the_index() {
        let mut db = Connection::open_in_memory().unwrap();
        schema::install_for_test(&mut db);
        for order in [ConversationOrder::Recent, ConversationOrder::Created] {
            for grouped in [true, false] {
                let query = format!(
                    "EXPLAIN QUERY PLAN {}",
                    conversation_page_query(order, grouped, false)
                );
                let plan = db
                    .prepare(&query)
                    .unwrap()
                    .query_map(params![0, "group", -100, "session", 33], |r| {
                        r.get::<_, String>(3)
                    })
                    .unwrap()
                    .collect::<rusqlite::Result<Vec<_>>>()
                    .unwrap()
                    .join("\n");
                assert!(
                    plan.contains("SEARCH sessions USING INDEX conversations_")
                        && plan.contains("rank,id)>(?,?)"),
                    "{plan}"
                );
                assert!(!plan.contains("TEMP B-TREE"), "{plan}");
            }
        }
    }

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
