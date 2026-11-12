//! Durable layout of one turn: a small head row, one row per part, and each
//! conversation message stored once per session.
//!
//! A turn's state repeats the conversation many times: every model call
//! carries the whole context it was sent, and its outcome carries the reply
//! that history also records. Storing the state as one value made its size
//! grow with the square of the turn's length, and rewriting it on every commit
//! made the bytes written grow faster still. Here each message is stored once,
//! under its digest, and referenced where the state holds it; operations,
//! history records and commit receipts are separate rows. Reading assembles
//! the same state value, so the journal's recovery, identity and evidence
//! rules are unchanged.
//!
//! A commit encodes and writes only the parts that differ from this process's
//! previous write of the turn. That previous state is kept in memory beside a
//! generation token stored with the turn, and is trusted only while the stored
//! token still matches, so a rolled-back write is never mistaken for the
//! stored state.
//!
//! References replace messages only at the positions where the state model
//! holds a message, never inside arbitrary values such as tool arguments.
//! A head that still holds its operations is a turn written before this
//! layout; it is read as before and rewritten in this layout on its next
//! commit.

use super::{MAX_SNAPSHOT_BYTES, Result, database_error, decode, encode, error};
use agent_kit_core::turn::TurnState;
use agent_kit_core::{ErrorKind, SessionId, TurnId};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS turn_parts (
    session TEXT NOT NULL,
    turn TEXT NOT NULL,
    key TEXT NOT NULL,
    digest BLOB NOT NULL,
    body BLOB NOT NULL,
    PRIMARY KEY(session, turn, key),
    FOREIGN KEY(session, turn) REFERENCES turns(session, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS turn_messages (
    session TEXT NOT NULL REFERENCES sessions(id),
    digest BLOB NOT NULL,
    body BLOB NOT NULL,
    PRIMARY KEY(session, digest)
);
";

/// Create this layout's tables and the turn columns when absent.
pub(crate) fn install(connection: &Connection) -> Result<()> {
    connection.execute_batch(SCHEMA).map_err(database_error)?;
    let sized: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('turns') WHERE name='bytes')",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if !sized {
        connection
            .execute_batch(
                "ALTER TABLE turns ADD COLUMN bytes INTEGER;
                 ALTER TABLE turns ADD COLUMN generation INTEGER;",
            )
            .map_err(database_error)?;
    }
    Ok(())
}

/// The assembled state a reader holds in memory. Repeated context is shared
/// on disk but not in memory, so this bounds one turn's decoded size.
const MAX_ASSEMBLED_BYTES: usize = 512 * 1024 * 1024;
const CACHED_TURNS: usize = 16;

const OPERATION: &str = "o/";
const RECORD: &str = "h/";
const RECEIPT: &str = "r/";
/// The turn's conversation checkpoint, set when it starts and rarely after.
const CHECKPOINT: &str = "c/";

#[derive(Clone, Copy, Default)]
struct Size {
    /// Encoded with message references.
    stored: usize,
    /// Encoded with its messages in place, as a reader holds it.
    assembled: usize,
}

/// A turn as this process last wrote or read it.
struct Cached {
    generation: i64,
    state: TurnState,
    /// Digest of the stored head, so a head changed outside a write is read again.
    head_digest: [u8; 32],
    head: usize,
    parts: BTreeMap<String, Size>,
    /// Distinct messages the turn refers to, by digest, with their sizes.
    messages: BTreeMap<[u8; 32], usize>,
}

impl Cached {
    fn stored(&self) -> usize {
        self.head
            + self.parts.values().map(|size| size.stored).sum::<usize>()
            + self.messages.values().sum::<usize>()
    }
    fn assembled(&self) -> usize {
        self.head
            + self
                .parts
                .values()
                .map(|size| size.assembled)
                .sum::<usize>()
    }
}

type CacheKey = (String, String, String);

fn cache() -> &'static Mutex<BTreeMap<CacheKey, Cached>> {
    static CACHE: OnceLock<Mutex<BTreeMap<CacheKey, Cached>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

fn cache_key(connection: &Connection, session: &str, turn: &str) -> Option<CacheKey> {
    let path = connection.path().filter(|path| !path.is_empty())?;
    Some((path.to_owned(), session.to_owned(), turn.to_owned()))
}

fn remember(key: Option<CacheKey>, entry: Cached) {
    let Some(key) = key else { return };
    let Ok(mut cache) = cache().lock() else {
        return;
    };
    if entry.state.outcome().is_some() {
        // A settled turn is no longer written; readers assemble it as needed.
        cache.remove(&key);
        return;
    }
    if !cache.contains_key(&key)
        && cache.len() >= CACHED_TURNS
        && let Some(evicted) = cache.keys().next().cloned()
    {
        cache.remove(&evicted);
    }
    cache.insert(key, entry);
}

/// The stored generation and head digest of a turn written in this layout.
fn stored_identity(
    connection: &Connection,
    session: &str,
    turn: &str,
) -> Result<Option<(i64, [u8; 32])>> {
    let row: Option<(Option<i64>, Vec<u8>)> = connection
        .query_row(
            "SELECT generation,snapshot FROM turns WHERE session=?1 AND id=?2",
            params![session, turn],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    Ok(row.and_then(|(generation, head)| Some((generation?, Sha256::digest(&head).into()))))
}

/// Forget every turn cached for a database, as when its store is opened.
pub(crate) fn forget(path: &str) {
    if let Ok(mut cache) = cache().lock() {
        cache.retain(|(cached, _, _), _| cached != path);
    }
}

/// A token no earlier write of this database can hold.
fn fresh_generation() -> i64 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    static SALT: OnceLock<[u8; 16]> = OnceLock::new();
    let salt = SALT.get_or_init(|| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos());
        let mut salt = [0u8; 16];
        salt.copy_from_slice(&Sha256::digest(format!("{now}:{}", std::process::id()))[..16]);
        salt
    });
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let digest = Sha256::digest([salt.as_slice(), &count.to_le_bytes()].concat());
    i64::from_le_bytes(digest[..8].try_into().expect("eight bytes"))
}

/// Load the turn a journal is writing, from this process's last write while
/// the store still holds it.
pub(crate) fn load(
    connection: &Connection,
    session: &SessionId,
    turn: &TurnId,
) -> Result<TurnState> {
    let key = cache_key(connection, session.as_str(), turn.as_str());
    let row: Option<(Vec<u8>, Option<i64>)> = connection
        .query_row(
            "SELECT snapshot,generation FROM turns WHERE session=?1 AND id=?2",
            params![session.as_str(), turn.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    let (head, stored) = row.ok_or_else(|| error(ErrorKind::InvalidInput, "turn_missing"))?;
    let head_digest: [u8; 32] = Sha256::digest(&head).into();
    if let (Some(key), Some(stored)) = (&key, stored)
        && let Ok(cache) = cache().lock()
        && let Some(entry) = cache.get(key)
        && entry.generation == stored
        && entry.head_digest == head_digest
    {
        return Ok(entry.state.clone());
    }
    let (state, sizes) = assemble(connection, &head, session, turn)?;
    if let (Some(stored), Some((head, parts, messages))) = (stored, sizes) {
        remember(
            key,
            Cached {
                generation: stored,
                state: state.clone(),
                head_digest,
                head,
                parts,
                messages,
            },
        );
    }
    Ok(state)
}

/// Write a turn's rows. `insert` creates its head and reports whether it was
/// new; otherwise the existing head is replaced. Parts equal to the previous
/// write are neither encoded nor written.
pub(crate) fn write(connection: &Connection, state: &TurnState, insert: bool) -> Result<bool> {
    let binding = state.binding();
    let (session, turn) = (binding.session.as_str(), binding.turn.as_str());
    let key = cache_key(connection, session, turn);
    let previous = match (&key, insert) {
        (Some(key), false) => {
            let stored = stored_identity(connection, session, turn)?;
            match cache().lock() {
                Ok(mut cache) => match cache.remove(key) {
                    Some(entry) if stored == Some((entry.generation, entry.head_digest)) => {
                        Some(entry)
                    }
                    _ => None,
                },
                Err(_) => None,
            }
        }
        _ => None,
    };
    let full = previous.is_none();
    let (mut parts, mut messages) = previous
        .as_ref()
        .map(|entry| (entry.parts.clone(), entry.messages.clone()))
        .unwrap_or_default();
    let mut changed: Vec<(String, Vec<u8>)> = Vec::new();
    let mut removed: Vec<String> = Vec::new();
    let mut bodies: BTreeMap<[u8; 32], Vec<u8>> = BTreeMap::new();
    let mut put = |key: String, value: Value, size: usize, parts: &mut BTreeMap<String, Size>| {
        let bytes = encode(&value)?;
        parts.insert(
            key.clone(),
            Size {
                stored: bytes.len(),
                assembled: bytes.len() + size,
            },
        );
        changed.push((key, bytes));
        Ok::<(), agent_kit_core::Error>(())
    };

    let earlier = previous.as_ref().map(|entry| &entry.state);
    for (id, operation) in state.operations() {
        if earlier.and_then(|earlier| earlier.operations().get(id)) == Some(operation) {
            continue;
        }
        let mut value = to_value(operation)?;
        let size =
            operation_messages(&mut value, &mut |message| externalize(message, &mut bodies))?;
        put(format!("{OPERATION}{id}"), value, size, &mut parts)?;
    }
    let records = state.history().records();
    for (index, record) in records.iter().enumerate() {
        if earlier.and_then(|earlier| earlier.history().records().get(index)) == Some(record) {
            continue;
        }
        let mut value = to_value(record)?;
        let size = record_message(&mut value, &mut |message| externalize(message, &mut bodies))?;
        put(format!("{RECORD}{index:08}"), value, size, &mut parts)?;
    }
    for (change, receipt) in state.receipts() {
        if earlier.and_then(|earlier| earlier.receipts().get(change)) == Some(receipt) {
            continue;
        }
        put(
            format!("{RECEIPT}{change}"),
            to_value(receipt)?,
            0,
            &mut parts,
        )?;
    }
    if let Some(checkpoint) = state.checkpoint()
        && earlier.and_then(TurnState::checkpoint) != Some(checkpoint)
    {
        put(CHECKPOINT.into(), to_value(checkpoint)?, 0, &mut parts)?;
    }
    if let Some(earlier) = earlier {
        if earlier.checkpoint().is_some() && state.checkpoint().is_none() {
            removed.push(CHECKPOINT.into());
        }
        for id in earlier.operations().keys() {
            if !state.operations().contains_key(id) {
                removed.push(format!("{OPERATION}{id}"));
            }
        }
        for index in records.len()..earlier.history().records().len() {
            removed.push(format!("{RECORD}{index:08}"));
        }
        for change in earlier.receipts().keys() {
            if !state.receipts().contains_key(change) {
                removed.push(format!("{RECEIPT}{change}"));
            }
        }
        for key in &removed {
            parts.remove(key);
        }
    }
    for (digest, body) in &bodies {
        messages.entry(*digest).or_insert(body.len());
    }
    let head = encode(&head(state)?)?;
    let entry = Cached {
        generation: fresh_generation(),
        state: state.clone(),
        head_digest: Sha256::digest(&head).into(),
        head: head.len(),
        parts,
        messages,
    };
    if entry.assembled() > MAX_ASSEMBLED_BYTES || entry.stored() > MAX_SNAPSHOT_BYTES {
        return Err(error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"));
    }
    let bytes = i64::try_from(entry.stored())
        .map_err(|_| error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"))?;
    if insert {
        let inserted = connection
            .execute(
                "INSERT INTO turns(session,id,snapshot,bytes,generation) VALUES(?1,?2,?3,?4,?5)
                 ON CONFLICT(session,id) DO NOTHING",
                params![session, turn, head, bytes, entry.generation],
            )
            .map_err(database_error)?;
        if inserted == 0 {
            return Ok(false);
        }
    } else {
        connection
            .execute(
                "UPDATE turns SET snapshot=?3,bytes=?4,generation=?5 WHERE session=?1 AND id=?2",
                params![session, turn, head, bytes, entry.generation],
            )
            .map_err(database_error)?;
    }
    {
        let mut statement = connection
            .prepare_cached(
                "INSERT INTO turn_messages(session,digest,body) VALUES(?1,?2,?3)
                 ON CONFLICT(session,digest) DO NOTHING",
            )
            .map_err(database_error)?;
        for (digest, body) in &bodies {
            statement
                .execute(params![session, digest.as_slice(), body])
                .map_err(database_error)?;
        }
    }
    // Without a trusted previous write, compare against the stored parts so
    // unchanged rows are kept and parts the state no longer holds are removed.
    let existing: BTreeMap<String, Vec<u8>> = if full {
        let mut statement = connection
            .prepare_cached("SELECT key,digest FROM turn_parts WHERE session=?1 AND turn=?2")
            .map_err(database_error)?;
        let rows = statement
            .query_map(params![session, turn], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(database_error)?;
        rows.collect::<std::result::Result<_, _>>()
            .map_err(database_error)?
    } else {
        BTreeMap::new()
    };
    if full {
        removed = existing
            .keys()
            .filter(|key| !entry.parts.contains_key(*key))
            .cloned()
            .collect();
    }
    {
        let mut upsert = connection
            .prepare_cached(
                "INSERT INTO turn_parts(session,turn,key,digest,body) VALUES(?1,?2,?3,?4,?5)
                 ON CONFLICT(session,turn,key) DO UPDATE SET digest=excluded.digest,body=excluded.body",
            )
            .map_err(database_error)?;
        for (key, body) in &changed {
            let digest: [u8; 32] = Sha256::digest(body).into();
            if existing.get(key).map(Vec::as_slice) == Some(digest.as_slice()) {
                continue;
            }
            upsert
                .execute(params![session, turn, key, digest.as_slice(), body])
                .map_err(database_error)?;
        }
    }
    if !removed.is_empty() {
        let mut statement = connection
            .prepare_cached("DELETE FROM turn_parts WHERE session=?1 AND turn=?2 AND key=?3")
            .map_err(database_error)?;
        for key in &removed {
            statement
                .execute(params![session, turn, key])
                .map_err(database_error)?;
        }
    }
    remember(key, entry);
    Ok(true)
}

/// The head: the state without its operations, history records, receipts and
/// checkpoint, which are parts. Field names and order follow the state's own
/// encoding.
fn head(state: &TurnState) -> Result<Value> {
    let mut head = Map::new();
    head.insert("binding".into(), to_value(state.binding())?);
    head.insert("position".into(), to_value(&state.position())?);
    head.insert("controls".into(), to_value(state.controls())?);
    head.insert("history".into(), Value::Object(Map::new()));
    head.insert("waits".into(), to_value(state.waits())?);
    if !state.driver_state().is_initial() {
        head.insert("driver_state".into(), to_value(state.driver_state())?);
    }
    head.insert("suspended".into(), Value::Bool(state.is_suspended()));
    head.insert("outcome".into(), to_value(&state.outcome())?);
    Ok(Value::Object(head))
}

fn to_value(value: &impl Serialize) -> Result<Value> {
    serde_json::to_value(value).map_err(|_| error(ErrorKind::InvalidInput, "store_encoding_failed"))
}

/// Replace one message with its digest; returns its encoded size.
fn externalize(message: &mut Value, bodies: &mut BTreeMap<[u8; 32], Vec<u8>>) -> Result<usize> {
    let bytes = encode(&*message)?;
    let digest: [u8; 32] = Sha256::digest(&bytes).into();
    let size = bytes.len();
    *message = Value::String(hex(&digest));
    bodies.entry(digest).or_insert(bytes);
    Ok(size)
}

/// Visit the messages an operation holds: an inference request's context and
/// the messages of each inference outcome it recorded. Returns the visitor's
/// summed sizes.
fn operation_messages(
    operation: &mut Value,
    visit: &mut dyn FnMut(&mut Value) -> Result<usize>,
) -> Result<usize> {
    let mut size = 0;
    let mut all = |list: Option<&mut Value>, size: &mut usize| -> Result<()> {
        if let Some(Value::Array(list)) = list {
            for message in list {
                *size += visit(message)?;
            }
        }
        Ok(())
    };
    if let Some(input) = inference(operation.pointer_mut("/record/input")) {
        all(input.pointer_mut("/request/messages"), &mut size)?;
    }
    if let Some(Value::Array(attempts)) = operation.get_mut("attempts") {
        for attempt in attempts {
            if let Some(outcome) = inference(attempt.get_mut("outcome")) {
                all(outcome.get_mut("messages"), &mut size)?;
            }
            if let Some(Value::Array(prior)) = attempt.get_mut("prior_outcomes") {
                for outcome in prior {
                    if let Some(outcome) = inference(Some(outcome)) {
                        all(outcome.get_mut("messages"), &mut size)?;
                    }
                }
            }
        }
    }
    if let Some(outcome) = inference(operation.get_mut("rejection")) {
        all(outcome.get_mut("messages"), &mut size)?;
    }
    Ok(size)
}

/// Visit the message a history record holds.
fn record_message(
    record: &mut Value,
    visit: &mut dyn FnMut(&mut Value) -> Result<usize>,
) -> Result<usize> {
    if record.get("kind").and_then(Value::as_str) != Some("message") {
        return Ok(0);
    }
    match record.get_mut("value") {
        Some(message) => visit(message),
        None => Ok(0),
    }
}

/// The value of an `{"kind":"inference","value":…}` tagged variant.
fn inference(value: Option<&mut Value>) -> Option<&mut Value> {
    let value = value?;
    if value.get("kind").and_then(Value::as_str) != Some("inference") {
        return None;
    }
    value.get_mut("value")
}

/// Assemble a turn from its head row as read from `turns.snapshot`.
pub(crate) fn read(
    connection: &Connection,
    head: &[u8],
    session: &SessionId,
    turn: &TurnId,
) -> Result<TurnState> {
    assemble(connection, head, session, turn).map(|(state, _)| state)
}

type Sizes = (usize, BTreeMap<String, Size>, BTreeMap<[u8; 32], usize>);

/// The assembled state and, for a turn in this layout, its part sizes.
fn assemble(
    connection: &Connection,
    head: &[u8],
    session: &SessionId,
    turn: &TurnId,
) -> Result<(TurnState, Option<Sizes>)> {
    if head.len() > MAX_SNAPSHOT_BYTES {
        return Err(error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"));
    }
    let Value::Object(mut value) = decode::<Value>(head)? else {
        return Err(error(ErrorKind::InvalidState, "stored_data_invalid"));
    };
    // A head that holds its operations was written before this layout: the
    // whole state with messages inline, read as it is.
    let sizes = if value.contains_key("operations") {
        None
    } else {
        Some(assemble_parts(
            connection,
            &mut value,
            session,
            turn,
            head.len(),
        )?)
    };
    let state: TurnState = serde_json::from_value(Value::Object(value))
        .map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
    if &state.binding().session != session || &state.binding().turn != turn {
        return Err(error(
            ErrorKind::InvalidState,
            "stored_turn_binding_mismatch",
        ));
    }
    Ok((state, sizes))
}

fn assemble_parts(
    connection: &Connection,
    value: &mut Map<String, Value>,
    session: &SessionId,
    turn: &TurnId,
    head: usize,
) -> Result<Sizes> {
    let mut operations = Map::new();
    let mut receipts = Map::new();
    let mut records = Vec::new();
    let mut checkpoint = None;
    let mut sizes = BTreeMap::new();
    let mut referenced: BTreeMap<[u8; 32], usize> = BTreeMap::new();
    let mut resolved: BTreeMap<[u8; 32], (Value, usize)> = BTreeMap::new();
    let mut assembled = head;
    let mut lookup = connection
        .prepare_cached("SELECT body FROM turn_messages WHERE session=?1 AND digest=?2")
        .map_err(database_error)?;
    let mut resolve = |message: &mut Value| -> Result<usize> {
        let Value::String(reference) = message else {
            return Err(error(ErrorKind::InvalidState, "stored_data_invalid"));
        };
        let digest = unhex(reference)?;
        let (content, size) = match resolved.get(&digest) {
            Some(found) => found.clone(),
            None => {
                let body: Vec<u8> = lookup
                    .query_row(params![session.as_str(), digest.as_slice()], |row| {
                        row.get(0)
                    })
                    .optional()
                    .map_err(database_error)?
                    .ok_or_else(|| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
                if <[u8; 32]>::from(Sha256::digest(&body)) != digest {
                    return Err(error(ErrorKind::InvalidState, "stored_data_invalid"));
                }
                let found = (decode::<Value>(&body)?, body.len());
                referenced.insert(digest, body.len());
                resolved.insert(digest, found.clone());
                found
            }
        };
        *message = content;
        Ok(size)
    };
    let mut statement = connection
        .prepare_cached("SELECT key,body FROM turn_parts WHERE session=?1 AND turn=?2 ORDER BY key")
        .map_err(database_error)?;
    let mut rows = statement
        .query(params![session.as_str(), turn.as_str()])
        .map_err(database_error)?;
    while let Some(row) = rows.next().map_err(database_error)? {
        let key: String = row.get(0).map_err(database_error)?;
        let body = row
            .get_ref(1)
            .map_err(database_error)?
            .as_blob()
            .map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
        let mut part: Value = decode(body)?;
        let messages = if let Some(id) = key.strip_prefix(OPERATION) {
            let size = operation_messages(&mut part, &mut resolve)?;
            operations.insert(id.to_owned(), part);
            size
        } else if let Some(change) = key.strip_prefix(RECEIPT) {
            receipts.insert(change.to_owned(), part);
            0
        } else if key == CHECKPOINT {
            checkpoint = Some(part);
            0
        } else if key.starts_with(RECORD) {
            // Keys are zero-padded, so key order is record order.
            let size = record_message(&mut part, &mut resolve)?;
            records.push(part);
            size
        } else {
            return Err(error(ErrorKind::InvalidState, "stored_data_invalid"));
        };
        let size = Size {
            stored: body.len(),
            assembled: body.len() + messages,
        };
        assembled += size.assembled;
        if assembled > MAX_ASSEMBLED_BYTES {
            return Err(error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"));
        }
        sizes.insert(key, size);
    }
    drop(rows);
    value.insert("operations".into(), Value::Object(operations));
    value.insert("receipts".into(), Value::Object(receipts));
    value.insert("checkpoint".into(), checkpoint.unwrap_or(Value::Null));
    match value.get_mut("history") {
        Some(Value::Object(history)) => {
            history.insert("records".into(), Value::Array(records));
        }
        _ => return Err(error(ErrorKind::InvalidState, "stored_data_invalid")),
    }
    Ok((head, sizes, referenced))
}

fn hex(bytes: &[u8; 32]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn unhex(text: &str) -> Result<[u8; 32]> {
    let invalid = || error(ErrorKind::InvalidState, "stored_data_invalid");
    if text.len() != 64 {
        return Err(invalid());
    }
    let mut bytes = [0u8; 32];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[index * 2..index * 2 + 2], 16).map_err(|_| invalid())?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::history::HistoryRecord;
    use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
    use agent_kit_core::turn::{JournalAction, JournalChange, TurnBinding};
    use agent_kit_core::{ChangeId, MessageId};

    fn binding() -> TurnBinding {
        TurnBinding {
            session: SessionId::new("session").unwrap(),
            turn: TurnId::new("turn").unwrap(),
            epoch: 1,
        }
    }

    fn said(state: &mut TurnState, id: &str) {
        let message = Message {
            id: MessageId::new(id).unwrap(),
            role: Role::User,
            phase: None,
            content: vec![Content::Text(id.into())],
            provenance: Provenance {
                source: "fixture".into(),
                kind: ProvenanceKind::Supplied,
                fingerprint: None,
            },
        };
        let change = JournalChange::new(
            ChangeId::new(format!("change-{id}")).unwrap(),
            state.binding().clone(),
            state.position(),
            state.controls().revision,
            vec![JournalAction::AppendHistory(vec![HistoryRecord::Message(
                message,
            )])],
        )
        .unwrap();
        state.apply(change).unwrap();
    }

    fn same(state: &TurnState) -> Value {
        serde_json::to_value(state).unwrap()
    }

    /// A write inside a transaction that rolls back is never read back from
    /// memory, and the next write still stores exactly its state.
    #[test]
    fn a_rolled_back_write_is_never_read_back() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("turns.sqlite");
        let mut connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE sessions(id TEXT PRIMARY KEY);
                 CREATE TABLE turns(ordinal INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT NOT NULL,
                     id TEXT NOT NULL, snapshot BLOB NOT NULL, UNIQUE(session,id));
                 INSERT INTO sessions(id) VALUES('session');",
            )
            .unwrap();
        install(&connection).unwrap();
        let (session, turn) = (binding().session, binding().turn);

        let mut state = TurnState::new(binding()).unwrap();
        said(&mut state, "first");
        assert!(write(&connection, &state, true).unwrap());
        let committed = state.clone();
        assert_eq!(
            same(&load(&connection, &session, &turn).unwrap()),
            same(&committed)
        );

        said(&mut state, "rolled-back");
        let transaction = connection.transaction().unwrap();
        write(&transaction, &state, false).unwrap();
        transaction.rollback().unwrap();
        assert_eq!(
            same(&load(&connection, &session, &turn).unwrap()),
            same(&committed)
        );

        let mut later = committed.clone();
        said(&mut later, "later");
        write(&connection, &later, false).unwrap();
        assert_eq!(
            same(&load(&connection, &session, &turn).unwrap()),
            same(&later)
        );
        forget(connection.path().unwrap());
        assert_eq!(
            same(&load(&connection, &session, &turn).unwrap()),
            same(&later)
        );
    }

    /// The head written without encoding the whole state must equal the
    /// state's own encoding less its parts, so no field is ever dropped.
    #[test]
    fn the_head_holds_every_field_but_the_parts() {
        use agent_kit_core::turn::TurnBinding;
        let state = TurnState::new(TurnBinding {
            session: SessionId::new("session").unwrap(),
            turn: TurnId::new("turn").unwrap(),
            epoch: 1,
        })
        .unwrap();
        let Value::Object(mut whole) = serde_json::to_value(&state).unwrap() else {
            panic!("object");
        };
        whole.remove("operations");
        whole.remove("receipts");
        whole.remove("checkpoint");
        whole.insert("history".into(), Value::Object(Map::new()));
        assert_eq!(head(&state).unwrap(), Value::Object(whole));
    }
}
