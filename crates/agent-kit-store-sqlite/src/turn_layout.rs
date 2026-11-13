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
//! A commit encodes and writes only the parts that differ from the store's
//! previous write of the turn. The store keeps that previous state in memory.
//! A write inside a transaction is staged and becomes the remembered state
//! only after the transaction commits; a transaction that ends any other way
//! leaves the remembered state as it was. The store is the database's only
//! writer while it is open, so a remembered state always equals the stored
//! rows. Only unsettled turns are kept, few of them, within a byte budget,
//! least recently used first out.
//!
//! Readers that need only what the head holds, such as controls or a turn's
//! view, read the head and the stored history length instead of assembling.
//!
//! References replace messages only at the positions where the state model
//! holds a message, never inside arbitrary values such as tool arguments.

use super::{MAX_STORED_TURN_BYTES, Result, database_error, decode, encode, error, now_ms};
use agent_kit_core::history::HistoryPosition;
use agent_kit_core::turn::{ControlSnapshot, JournalPosition, TurnBinding, TurnOutcome, TurnState};
use agent_kit_core::{ErrorKind, Fingerprint, SessionId, TurnId};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

/// The assembled state a reader holds in memory. Repeated context is shared
/// on disk but not in memory, so this bounds one turn's decoded size.
const MAX_ASSEMBLED_BYTES: usize = 512 * 1024 * 1024;
const CACHED_TURNS: usize = 16;
/// The summed assembled size of every turn one store keeps. One turn of the
/// largest readable size still fits.
const CACHED_BYTES: usize = MAX_ASSEMBLED_BYTES;

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

/// A turn as the store last wrote or read it.
struct Cached {
    state: TurnState,
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

type CacheKey = (String, String);

fn cache_key(session: &str, turn: &str) -> CacheKey {
    (session.to_owned(), turn.to_owned())
}

/// The turns one store last wrote or read. Committed entries are bounded by
/// count and by summed assembled size; the least recently used turn leaves
/// first, and a turn larger than the whole budget is not kept. Entries written
/// or read inside an open transaction are staged until it commits.
pub(crate) struct TurnCache {
    entries: BTreeMap<CacheKey, (u64, Cached)>,
    staged: BTreeMap<CacheKey, Cached>,
    clock: u64,
    bytes: usize,
    turns_limit: usize,
    bytes_limit: usize,
}

impl Default for TurnCache {
    fn default() -> Self {
        Self::new(CACHED_TURNS, CACHED_BYTES)
    }
}

impl TurnCache {
    const fn new(turns_limit: usize, bytes_limit: usize) -> Self {
        Self {
            entries: BTreeMap::new(),
            staged: BTreeMap::new(),
            clock: 0,
            bytes: 0,
            turns_limit,
            bytes_limit,
        }
    }

    fn tick(&mut self) -> u64 {
        self.clock = self.clock.wrapping_add(1);
        self.clock
    }

    /// The turn as the current transaction or the last commit left it.
    fn get(&mut self, key: &CacheKey) -> Option<&Cached> {
        if self.staged.contains_key(key) {
            return self.staged.get(key);
        }
        let now = self.tick();
        let (used, entry) = self.entries.get_mut(key)?;
        *used = now;
        Some(entry)
    }

    fn take(&mut self, key: &CacheKey) -> Option<Cached> {
        if let Some(entry) = self.staged.remove(key) {
            return Some(entry);
        }
        let (_, entry) = self.entries.remove(key)?;
        self.bytes = self.bytes.saturating_sub(entry.assembled());
        Some(entry)
    }

    /// Keep a turn read or written through `connection`. Inside an open
    /// transaction it is staged until that transaction commits.
    fn remember(&mut self, connection: &Connection, key: CacheKey, entry: Cached) {
        if entry.state.outcome().is_some() {
            // A settled turn is no longer written; readers assemble it as needed.
            self.take(&key);
        } else if connection.is_autocommit() {
            self.insert(key, entry);
        } else {
            self.staged.insert(key, entry);
        }
    }

    fn insert(&mut self, key: CacheKey, entry: Cached) {
        self.take(&key);
        let size = entry.assembled();
        if size > self.bytes_limit {
            return;
        }
        while self.entries.len() >= self.turns_limit || self.bytes + size > self.bytes_limit {
            let Some(oldest) = self
                .entries
                .iter()
                .min_by_key(|(_, (used, _))| *used)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            self.take(&oldest);
        }
        let now = self.tick();
        self.bytes += size;
        self.entries.insert(key, (now, entry));
    }

    /// Keep what the transaction that just committed staged.
    pub(crate) fn publish(&mut self) {
        for (key, entry) in std::mem::take(&mut self.staged) {
            self.insert(key, entry);
        }
    }

    /// Drop what a transaction that did not commit staged.
    pub(crate) fn discard(&mut self) {
        self.staged.clear();
    }
}

/// Every update leaves the cache consistent, so a panic elsewhere while it
/// was held does not invalidate it.
pub(crate) fn lock(cache: &Mutex<TurnCache>) -> MutexGuard<'_, TurnCache> {
    cache.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Load the turn a journal is writing, from the store's last write or read
/// while it keeps one.
pub(crate) fn load(
    cache: &Mutex<TurnCache>,
    connection: &Connection,
    session: &SessionId,
    turn: &TurnId,
) -> Result<TurnState> {
    let key = cache_key(session.as_str(), turn.as_str());
    if let Some(entry) = lock(cache).get(&key) {
        return Ok(entry.state.clone());
    }
    let head: Vec<u8> = connection
        .query_row(
            "SELECT head FROM turns WHERE session=?1 AND id=?2",
            params![session.as_str(), turn.as_str()],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "turn_missing"))?;
    let (state, (head, parts, messages)) = assemble(connection, &head, session, turn)?;
    lock(cache).remember(
        connection,
        key,
        Cached {
            state: state.clone(),
            head,
            parts,
            messages,
        },
    );
    Ok(state)
}

/// Write a turn's rows. `insert` creates its head, which must be absent;
/// otherwise the existing head is replaced. Parts equal to the previous write
/// are neither encoded nor written.
pub(crate) fn write(
    cache: &Mutex<TurnCache>,
    connection: &Connection,
    state: &TurnState,
    insert: bool,
) -> Result<()> {
    let binding = state.binding();
    let (session, turn) = (binding.session.as_str(), binding.turn.as_str());
    let key = cache_key(session, turn);
    let previous = if insert { None } else { lock(cache).take(&key) };
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
        state: state.clone(),
        head: head.len(),
        parts,
        messages,
    };
    if entry.assembled() > MAX_ASSEMBLED_BYTES || entry.stored() > MAX_STORED_TURN_BYTES {
        return Err(error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"));
    }
    let stored = i64::try_from(entry.stored())
        .map_err(|_| error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"))?;
    let history_len = i64::try_from(records.len())
        .map_err(|_| error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"))?;
    if insert {
        connection
            .execute(
                "INSERT INTO turns(session,id,head,history_len,stored_bytes,started_ms)
                 VALUES(?1,?2,?3,?4,?5,?6)",
                params![session, turn, head, history_len, stored, now_ms()],
            )
            .map_err(database_error)?;
    } else {
        // The first settlement is the recorded finish. A clock that moved
        // backwards cannot produce a negative duration.
        connection
            .execute(
                "UPDATE turns SET head=?3,history_len=?4,stored_bytes=?5,
                     settled_ms=CASE WHEN ?6 AND settled_ms IS NULL THEN MAX(started_ms,?7)
                                     ELSE settled_ms END
                 WHERE session=?1 AND id=?2",
                params![
                    session,
                    turn,
                    head,
                    history_len,
                    stored,
                    state.outcome().is_some(),
                    now_ms()
                ],
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
    // Without a remembered previous write, compare against the stored parts so
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
    lock(cache).remember(connection, key, entry);
    Ok(())
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
///
/// The body is the message as encoded, and the digest is SHA-256 of that body,
/// not the message's canonical fingerprint. The canonical encoding sorts
/// object keys, so storing it would reorder the JSON a model wrote as tool
/// arguments, and later model calls would replay different bytes than were
/// first sent, invalidating the provider's cached prefix.
fn externalize(message: &mut Value, bodies: &mut BTreeMap<[u8; 32], Vec<u8>>) -> Result<usize> {
    let bytes = encode(&*message)?;
    let digest: [u8; 32] = Sha256::digest(&bytes).into();
    let size = bytes.len();
    *message = Value::String(Fingerprint::from_bytes(digest).to_hex());
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

/// What a turn's head says about it, read without assembling the turn.
pub(crate) struct HeadFacts {
    pub(crate) binding: TurnBinding,
    pub(crate) position: JournalPosition,
    pub(crate) history_position: HistoryPosition,
    pub(crate) controls: ControlSnapshot,
    pub(crate) suspended: bool,
    pub(crate) outcome: Option<TurnOutcome>,
}

/// The head fields readers of controls and views need.
#[derive(Deserialize)]
struct StoredHead {
    binding: TurnBinding,
    position: JournalPosition,
    controls: ControlSnapshot,
    suspended: bool,
    outcome: Option<TurnOutcome>,
}

fn stored_head(
    connection: &Connection,
    session: &SessionId,
    turn: &TurnId,
) -> Result<(StoredHead, u64)> {
    let (head, history_len): (Vec<u8>, i64) = connection
        .query_row(
            "SELECT head,history_len FROM turns WHERE session=?1 AND id=?2",
            params![session.as_str(), turn.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::InvalidInput, "turn_missing"))?;
    if head.len() > MAX_STORED_TURN_BYTES {
        return Err(error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"));
    }
    let head: StoredHead = decode(&head)?;
    if &head.binding.session != session || &head.binding.turn != turn {
        return Err(error(
            ErrorKind::InvalidState,
            "stored_turn_binding_mismatch",
        ));
    }
    let history_len = u64::try_from(history_len)
        .map_err(|_| error(ErrorKind::InvalidState, "stored_data_invalid"))?;
    Ok((head, history_len))
}

/// A turn's writer binding and controls, from its head alone.
pub(crate) fn read_controls(
    connection: &Connection,
    session: &SessionId,
    turn: &TurnId,
) -> Result<(TurnBinding, ControlSnapshot)> {
    let (head, _) = stored_head(connection, session, turn)?;
    Ok((head.binding, head.controls))
}

/// A turn's view facts from its head and its stored history length, without
/// reading its operations or messages.
pub(crate) fn read_facts(
    connection: &Connection,
    session: &SessionId,
    turn: &TurnId,
) -> Result<HeadFacts> {
    let (head, records) = stored_head(connection, session, turn)?;
    Ok(HeadFacts {
        binding: head.binding,
        position: head.position,
        history_position: HistoryPosition(records),
        controls: head.controls,
        suspended: head.suspended,
        outcome: head.outcome,
    })
}

/// Assemble a turn from its head row as read from `turns.head`.
pub(crate) fn read(
    connection: &Connection,
    head: &[u8],
    session: &SessionId,
    turn: &TurnId,
) -> Result<TurnState> {
    assemble(connection, head, session, turn).map(|(state, _)| state)
}

type Sizes = (usize, BTreeMap<String, Size>, BTreeMap<[u8; 32], usize>);

/// The assembled state and its part sizes.
fn assemble(
    connection: &Connection,
    head: &[u8],
    session: &SessionId,
    turn: &TurnId,
) -> Result<(TurnState, Sizes)> {
    if head.len() > MAX_STORED_TURN_BYTES {
        return Err(error(ErrorKind::LimitExceeded, "turn_snapshot_too_large"));
    }
    let Value::Object(mut value) = decode::<Value>(head)? else {
        return Err(error(ErrorKind::InvalidState, "stored_data_invalid"));
    };
    let sizes = assemble_parts(connection, &mut value, session, turn, head.len())?;
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
        let digest = *Fingerprint::from_hex(reference)
            .ok_or_else(|| error(ErrorKind::InvalidState, "stored_data_invalid"))?
            .bytes();
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

    /// A write inside a transaction is remembered only once the transaction
    /// commits: a rolled-back write is never read back from memory, and the
    /// next write still stores exactly its state.
    #[test]
    fn a_rolled_back_write_is_never_read_back() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", true)
            .unwrap();
        crate::schema::install_for_test(&mut connection);
        connection
            .execute(
                "INSERT INTO sessions(id,configuration,revision,paused,next_input)
                 VALUES('session',x'',0,0,0)",
                [],
            )
            .unwrap();
        let cache = Mutex::new(TurnCache::default());
        let (session, turn) = (binding().session, binding().turn);
        let cold = |connection: &Connection| {
            let head: Vec<u8> = connection
                .query_row("SELECT head FROM turns", [], |row| row.get(0))
                .unwrap();
            same(&read(connection, &head, &session, &turn).unwrap())
        };

        let mut state = TurnState::new(binding()).unwrap();
        said(&mut state, "first");
        write(&cache, &connection, &state, true).unwrap();
        let committed = state.clone();
        assert_eq!(
            same(&load(&cache, &connection, &session, &turn).unwrap()),
            same(&committed)
        );

        said(&mut state, "rolled-back");
        let transaction = connection.transaction().unwrap();
        write(&cache, &transaction, &state, false).unwrap();
        // The transaction reads its own write.
        assert_eq!(
            same(&load(&cache, &transaction, &session, &turn).unwrap()),
            same(&state)
        );
        transaction.rollback().unwrap();
        lock(&cache).discard();
        assert_eq!(
            same(&load(&cache, &connection, &session, &turn).unwrap()),
            same(&committed)
        );

        let mut later = committed.clone();
        said(&mut later, "later");
        let transaction = connection.transaction().unwrap();
        write(&cache, &transaction, &later, false).unwrap();
        transaction.commit().unwrap();
        lock(&cache).publish();
        assert_eq!(
            same(&load(&cache, &connection, &session, &turn).unwrap()),
            same(&later)
        );
        assert_eq!(cold(&connection), same(&later));
        let history_len: i64 = connection
            .query_row("SELECT history_len FROM turns", [], |row| row.get(0))
            .unwrap();
        assert_eq!(history_len, 2);
    }

    /// The head written without encoding the whole state must equal the
    /// state's own encoding less its parts, so no field is ever dropped,
    /// including fields the state omits while they hold their initial value.
    #[test]
    fn the_head_holds_every_field_but_the_parts() {
        use agent_kit_core::driver_state::{
            DriverStateChange, DriverStateRevision, DriverStateSnapshot,
        };
        use agent_kit_core::turn::{ControlDirective, ResponseContract, WaitRecord};
        use agent_kit_core::{Envelope, SchemaId, WaitId};

        let envelope = |text: &str| {
            Envelope::new(
                SchemaId::new("fixture").unwrap(),
                1,
                text.as_bytes().to_vec(),
            )
            .unwrap()
        };
        let mut driver_state = DriverStateSnapshot::default();
        driver_state
            .apply(DriverStateChange {
                expected: DriverStateRevision(0),
                value: Some(envelope("driver")),
            })
            .unwrap();
        let initial = TurnState::new(binding()).unwrap();
        let mut populated = TurnState::with_driver_state(binding(), driver_state).unwrap();
        said(&mut populated, "first");
        let mut change = |id: &str, actions: Vec<JournalAction>| {
            let change = JournalChange::new(
                ChangeId::new(id).unwrap(),
                populated.binding().clone(),
                populated.position(),
                populated.controls().revision,
                actions,
            )
            .unwrap();
            populated.apply(change).unwrap();
        };
        change(
            "wait",
            vec![
                JournalAction::SetCheckpoint(envelope("checkpoint")),
                JournalAction::OpenWait(WaitRecord {
                    id: WaitId::new("question").unwrap(),
                    request: envelope("question"),
                    response: ResponseContract {
                        schema: SchemaId::new("fixture").unwrap(),
                        version: 1,
                    },
                    answer: None,
                    withdrawn: false,
                }),
            ],
        );
        change(
            "pause",
            vec![JournalAction::Control(ControlDirective::Pause)],
        );
        change("suspend", vec![JournalAction::Suspend]);
        assert!(!populated.driver_state().is_initial());
        assert!(populated.is_suspended() && populated.controls().paused);

        for state in [initial, populated] {
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

    fn cached(head: usize) -> Cached {
        Cached {
            state: TurnState::new(binding()).unwrap(),
            head,
            parts: BTreeMap::new(),
            messages: BTreeMap::new(),
        }
    }

    fn key(turn: usize) -> CacheKey {
        ("session".into(), format!("turn-{turn}"))
    }

    /// The turn used last stays while others leave, oldest use first.
    #[test]
    fn the_cache_keeps_the_most_recently_used_turns() {
        let mut cache = TurnCache::new(16, 1_000);
        for turn in 0..16 {
            cache.insert(key(turn), cached(1));
        }
        assert!(cache.get(&key(0)).is_some());
        cache.insert(key(16), cached(1));
        assert!(cache.get(&key(0)).is_some());
        assert!(cache.get(&key(1)).is_none());
        assert_eq!(cache.entries.len(), 16);
    }

    /// Cached turns stay within their summed size, and a turn larger than the
    /// whole budget is not kept.
    #[test]
    fn the_cache_stays_within_its_byte_budget() {
        let mut cache = TurnCache::new(16, 1_000);
        cache.insert(key(0), cached(400));
        cache.insert(key(1), cached(400));
        cache.insert(key(2), cached(400));
        assert!(cache.get(&key(0)).is_none());
        assert_eq!(cache.bytes, 800);
        cache.insert(key(3), cached(1_001));
        assert!(cache.get(&key(3)).is_none());
        assert_eq!(cache.bytes, 800);
    }
}
