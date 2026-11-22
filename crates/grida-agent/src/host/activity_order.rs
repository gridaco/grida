//! GRIDA-SEC-004 — durable product presentation order, never execution authority.

use super::*;
use std::collections::BTreeMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::sync::Mutex as SyncMutex;

const SCHEMA: &str = "grida.agent.activity-order";
const MAX_FACTS: usize = 4096;
const MAX_BYTES: u64 = 2 * 1024 * 1024;
const MAX_CACHED: usize = 8;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Key {
    session: SessionId,
    turn: TurnId,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Ledger {
    schema: String,
    session: SessionId,
    turn: TurnId,
    closed: bool,
    complete: bool,
    entries: BTreeMap<String, u64>,
}

struct Cached {
    ledger: Option<Ledger>,
    blocked: bool,
    used: u64,
}
struct Cache {
    entries: BTreeMap<Key, Cached>,
    serial: u64,
    failed: std::collections::BTreeSet<Key>,
    disabled: bool,
}

pub(crate) struct State {
    directory: Option<PathBuf>,
    // The existing SQLite owner excludes a second process throughout the life
    // of this private presentation writer. No second database is opened.
    _owner: Arc<SqliteStore>,
    cache: SyncMutex<Cache>,
}

impl State {
    pub(super) fn new(directory: Option<PathBuf>, owner: Arc<SqliteStore>) -> Self {
        Self {
            directory: directory.map(|p| p.join("activity-order")),
            _owner: owner,
            cache: SyncMutex::new(Cache {
                entries: BTreeMap::new(),
                serial: 0,
                failed: Default::default(),
                disabled: false,
            }),
        }
    }

    fn path(&self, key: &Key) -> Result<Option<PathBuf>> {
        self.directory
            .as_ref()
            .map(|directory| {
                Fingerprint::of(&(SCHEMA, &key.session)).and_then(|session| {
                    Fingerprint::of(&(SCHEMA, &key.session, &key.turn)).map(|id| {
                        directory
                            .join(session.to_hex())
                            .join(format!("{}.json", id.to_hex()))
                    })
                })
            })
            .transpose()
    }

    fn load(&self, key: &Key) -> Result<Option<Ledger>> {
        let Some(path) = self.path(key)? else {
            return Ok(None);
        };
        let Some(bytes) = read_private(&path)? else {
            return Ok(None);
        };
        let ledger: Ledger = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
        validate_ledger(key, &ledger)?;
        Ok(Some(ledger))
    }

    fn persist(&self, key: &Key, ledger: &Ledger) -> Result<()> {
        let Some(path) = self.path(key)? else {
            return Ok(());
        };
        let parent = path.parent().ok_or_else(unavailable)?;
        for directory in [
            self.directory.as_ref().ok_or_else(unavailable)?.as_path(),
            parent,
        ] {
            if !directory.exists() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::DirBuilderExt;
                    std::fs::DirBuilder::new()
                        .mode(0o700)
                        .create(directory)
                        .map_err(|_| unavailable())?;
                }
            }
            crate::scratch::check_private_directory(directory)?;
        }
        crate::scratch::check_private_directory(parent)?;
        grida_auth::refuse_granting_acl(parent).map_err(|_| unavailable())?;
        if let Ok(metadata) = std::fs::symlink_metadata(&path) {
            private_file(&metadata)?;
        }
        let bytes = serde_json::to_vec(ledger).map_err(|_| unavailable())?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(unavailable());
        }
        let mut staged = tempfile::Builder::new()
            .prefix(".activity-order-stage-")
            .tempfile_in(parent)
            .map_err(|_| unavailable())?;
        staged
            .write_all(&bytes)
            .and_then(|_| staged.as_file().sync_all())
            .map_err(|_| unavailable())?;
        staged.persist(&path).map_err(|_| unavailable())?;
        File::open(parent)
            .and_then(|file| file.sync_all())
            .map_err(|_| unavailable())
    }

    fn cached<'a>(&self, cache: &'a mut Cache, key: &Key) -> &'a mut Cached {
        cache.serial = cache.serial.wrapping_add(1);
        if !cache.entries.contains_key(key) {
            if cache.entries.len() >= MAX_CACHED {
                let oldest = cache
                    .entries
                    .iter()
                    .min_by_key(|(_, value)| value.used)
                    .map(|(key, _)| key.clone())
                    .unwrap();
                cache.entries.remove(&oldest);
            }
            let (ledger, blocked) = match self.load(key) {
                Ok(ledger) => (ledger, false),
                Err(_) => (None, true),
            };
            cache.entries.insert(
                key.clone(),
                Cached {
                    ledger,
                    blocked: blocked || cache.disabled || cache.failed.contains(key),
                    used: cache.serial,
                },
            );
        }
        let entry = cache.entries.get_mut(key).unwrap();
        entry.used = cache.serial;
        entry
    }

    /// Only a newly claimed, empty first epoch may create a timeline. Reading
    /// old history or resuming a turn can never manufacture its missing past.
    pub(super) fn begin(&self, binding: &agent_kit_core::turn::TurnBinding, fresh: bool) {
        let key = Key {
            session: binding.session.clone(),
            turn: binding.turn.clone(),
        };
        let mut cache = self.cache.lock().unwrap();
        let entry = self.cached(&mut cache, &key);
        if entry.ledger.is_some() || entry.blocked || !fresh {
            return;
        }
        let ledger = Ledger {
            schema: SCHEMA.into(),
            session: key.session.clone(),
            turn: key.turn.clone(),
            closed: false,
            complete: true,
            entries: BTreeMap::new(),
        };
        match self.persist(&key, &ledger) {
            Ok(()) => entry.ledger = Some(ledger),
            Err(_) => {
                entry.blocked = true;
                fail(&mut cache, &key);
            }
        }
    }

    fn record(&self, session: &SessionId, turn: &TurnId, fact: String) -> Option<u64> {
        self.record_fact(session, turn, fact, false)
    }

    fn record_finish(&self, session: &SessionId, turn: &TurnId, event: &str) -> Option<u64> {
        self.record_fact(session, turn, format!("event/{event}"), true)
    }

    fn record_fact(
        &self,
        session: &SessionId,
        turn: &TurnId,
        fact: String,
        matching_finish: bool,
    ) -> Option<u64> {
        if !valid_fact(&fact) {
            return None;
        }
        let key = Key {
            session: session.clone(),
            turn: turn.clone(),
        };
        let mut cache = self.cache.lock().unwrap();
        let entry = self.cached(&mut cache, &key);
        let ledger = entry.ledger.as_ref()?;
        if let Some(order) = ledger.entries.get(&fact) {
            return Some(*order);
        }
        let retained_start = matching_finish
            && fact
                .strip_suffix("/finished")
                .is_some_and(|prefix| ledger.entries.contains_key(&format!("{prefix}/started")));
        if matching_finish && !retained_start {
            return None;
        }
        if entry.blocked || !ledger.complete || (ledger.closed && !retained_start) {
            return None;
        }
        let mut next = ledger.clone();
        if next.entries.len() >= MAX_FACTS {
            next.complete = false;
            let _ = self.persist(&key, &next);
            entry.ledger = Some(next);
            entry.blocked = true;
            return None;
        }
        let order = u64::try_from(next.entries.len()).ok()?.checked_add(1)?;
        next.entries.insert(fact, order);
        if self.persist(&key, &next).is_err() {
            entry.blocked = true;
            fail(&mut cache, &key);
            return None;
        }
        entry.ledger = Some(next);
        Some(order)
    }

    fn lookup(&self, session: &SessionId, turn: &TurnId, fact: String) -> Option<u64> {
        let key = Key {
            session: session.clone(),
            turn: turn.clone(),
        };
        let mut cache = self.cache.lock().unwrap();
        self.cached(&mut cache, &key)
            .ledger
            .as_ref()?
            .entries
            .get(&fact)
            .copied()
    }

    pub(super) fn record_message(
        &self,
        session: &SessionId,
        turn: &TurnId,
        id: &MessageId,
    ) -> Option<u64> {
        self.record(session, turn, format!("message/{id}"))
    }
    pub(super) fn record_call(
        &self,
        session: &SessionId,
        turn: &TurnId,
        id: &agent_kit_core::ToolCallId,
    ) -> Option<u64> {
        self.record(session, turn, format!("call/{id}"))
    }
    pub(super) fn record_event(&self, session: &SessionId, turn: &TurnId, id: &str) -> Option<u64> {
        self.record(session, turn, format!("event/{id}"))
    }
    pub(crate) fn message(
        &self,
        session: &SessionId,
        turn: &TurnId,
        id: &MessageId,
    ) -> Option<u64> {
        self.lookup(session, turn, format!("message/{id}"))
    }
    pub(crate) fn call(
        &self,
        session: &SessionId,
        turn: &TurnId,
        id: &agent_kit_core::ToolCallId,
    ) -> Option<u64> {
        self.lookup(session, turn, format!("call/{id}"))
    }
    pub(crate) fn event(&self, session: &SessionId, turn: &TurnId, id: &str) -> Option<u64> {
        self.lookup(session, turn, format!("event/{id}"))
    }

    pub(super) fn close(&self, session: &SessionId, turn: &TurnId) {
        let key = Key {
            session: session.clone(),
            turn: turn.clone(),
        };
        let mut cache = self.cache.lock().unwrap();
        let entry = self.cached(&mut cache, &key);
        let Some(mut ledger) = entry.ledger.clone() else {
            return;
        };
        if ledger.closed {
            return;
        }
        ledger.closed = true;
        if self.persist(&key, &ledger).is_err() {
            entry.blocked = true;
            fail(&mut cache, &key);
        } else {
            entry.ledger = Some(ledger);
        }
    }

    fn audit_existing(&self, binding: &agent_kit_core::turn::TurnBinding, facts: &[String]) {
        let key = Key {
            session: binding.session.clone(),
            turn: binding.turn.clone(),
        };
        let mut cache = self.cache.lock().unwrap();
        let entry = self.cached(&mut cache, &key);
        let Some(mut ledger) = entry.ledger.clone() else {
            return;
        };
        if facts.len() >= MAX_FACTS || facts.iter().any(|fact| !ledger.entries.contains_key(fact)) {
            ledger.complete = false;
            entry.blocked = true;
            if self.persist(&key, &ledger).is_err() {
                fail(&mut cache, &key);
            } else {
                entry.ledger = Some(ledger);
            }
        }
    }

    fn incomplete(&self, binding: &agent_kit_core::turn::TurnBinding) {
        let key = Key {
            session: binding.session.clone(),
            turn: binding.turn.clone(),
        };
        let mut cache = self.cache.lock().unwrap();
        let entry = self.cached(&mut cache, &key);
        if let Some(mut ledger) = entry.ledger.clone() {
            ledger.complete = false;
            let _ = self.persist(&key, &ledger);
            entry.ledger = Some(ledger);
        }
        entry.blocked = true;
        fail(&mut cache, &key);
    }

    pub(super) async fn reconcile(&self) -> Result<()> {
        let Some(base) = &self.directory else {
            return Ok(());
        };
        if !base.exists() {
            return Ok(());
        }
        crate::scratch::check_private_directory(base)?;
        let mut budget = CleanupBudget::new();
        for directory in std::fs::read_dir(base).map_err(|_| unavailable())? {
            budget.directory()?;
            let directory = directory.map_err(|_| unavailable())?.path();
            crate::scratch::check_private_directory(&directory)?;
            let mut owner = None;
            for file in std::fs::read_dir(&directory).map_err(|_| unavailable())? {
                let path = file.map_err(|_| unavailable())?.path();
                let bytes = budget.read(&path)?;
                if path
                    .file_name()
                    .and_then(|v| v.to_str())
                    .is_some_and(|v| v.starts_with(".activity-order-stage-"))
                {
                    std::fs::remove_file(path).map_err(|_| unavailable())?;
                    continue;
                }
                let ledger: Ledger = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
                let key = Key {
                    session: ledger.session.clone(),
                    turn: ledger.turn.clone(),
                };
                if self.path(&key)?.as_ref() != Some(&path) {
                    return Err(unavailable());
                }
                validate_ledger(&key, &ledger)?;
                owner = Some(key.session);
                break;
            }
            if let Some(session) = owner {
                match self._owner.inspect(session.clone()).await {
                    Ok(_) => {}
                    Err(error) if error.code == "session_missing" => {
                        self.retire_with_budget(&session, &mut budget)?
                    }
                    Err(error) => return Err(error),
                }
            }
        }
        Ok(())
    }

    pub(super) fn retire(&self, session: &SessionId) -> Result<()> {
        self.retire_with_budget(session, &mut CleanupBudget::new())
    }

    fn retire_with_budget(&self, session: &SessionId, budget: &mut CleanupBudget) -> Result<()> {
        self.cache
            .lock()
            .unwrap()
            .entries
            .retain(|key, _| &key.session != session);
        let Some(base) = &self.directory else {
            return Ok(());
        };
        let directory = base.join(Fingerprint::of(&(SCHEMA, session))?.to_hex());
        if !directory.exists() {
            return Ok(());
        }
        crate::scratch::check_private_directory(base)?;
        crate::scratch::check_private_directory(&directory)?;
        // Cleanup is scoped to this session. A bounded partial pass can be
        // repeated after it has removed its verified entries.
        for entry in std::fs::read_dir(&directory).map_err(|_| unavailable())? {
            let path = entry.map_err(|_| unavailable())?.path();
            let bytes = budget.read(&path)?;
            if path
                .file_name()
                .and_then(|v| v.to_str())
                .is_some_and(|v| v.starts_with(".activity-order-stage-"))
            {
                std::fs::remove_file(path).map_err(|_| unavailable())?;
                continue;
            }
            let ledger: Ledger = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
            let key = Key {
                session: session.clone(),
                turn: ledger.turn.clone(),
            };
            if ledger.session != *session || self.path(&key)?.as_ref() != Some(&path) {
                return Err(unavailable());
            }
            validate_ledger(&key, &ledger)?;
            std::fs::remove_file(path).map_err(|_| unavailable())?;
        }
        File::open(&directory)
            .and_then(|file| file.sync_all())
            .map_err(|_| unavailable())?;
        std::fs::remove_dir(&directory).map_err(|_| unavailable())?;
        File::open(base)
            .and_then(|file| file.sync_all())
            .map_err(|_| unavailable())
    }
}

struct CleanupBudget {
    entries: usize,
    bytes: u64,
}
impl CleanupBudget {
    fn new() -> Self {
        Self {
            entries: 256,
            bytes: 8 * 1024 * 1024,
        }
    }
    fn directory(&mut self) -> Result<()> {
        self.entries = self.entries.checked_sub(1).ok_or_else(cleanup_pending)?;
        Ok(())
    }
    fn read(&mut self, path: &Path) -> Result<Vec<u8>> {
        self.directory()?;
        let bytes = read_private_limit(path, self.bytes.min(MAX_BYTES))?.ok_or_else(unavailable)?;
        self.bytes = self
            .bytes
            .checked_sub(bytes.len() as u64)
            .ok_or_else(cleanup_pending)?;
        Ok(bytes)
    }
}
fn cleanup_pending() -> Error {
    problem(ErrorKind::LimitExceeded, "activity_order_cleanup_pending")
}
fn validate_ledger(key: &Key, ledger: &Ledger) -> Result<()> {
    if ledger.schema != SCHEMA
        || ledger.session != key.session
        || ledger.turn != key.turn
        || ledger.entries.len() > MAX_FACTS
    {
        return Err(unavailable());
    }
    let mut orders = std::collections::BTreeSet::new();
    for (fact, order) in &ledger.entries {
        if !valid_fact(fact) || *order == 0 || *order > MAX_SAFE_INTEGER || !orders.insert(*order) {
            return Err(unavailable());
        }
    }
    if orders
        .iter()
        .copied()
        .ne(1..=u64::try_from(orders.len()).map_err(|_| unavailable())?)
    {
        return Err(unavailable());
    }
    Ok(())
}

fn fail(cache: &mut Cache, key: &Key) {
    if cache.failed.len() < 256 {
        cache.failed.insert(key.clone());
    } else {
        cache.disabled = true;
    }
}

#[derive(Clone)]
pub(super) struct Parent {
    session: SessionId,
    turn: TurnId,
    event_prefix: String,
}

impl Parent {
    fn record(&self, state: &State, kind: &str) {
        let event = format!("{}/{kind}", self.event_prefix);
        if kind == "finished" {
            state.record_finish(&self.session, &self.turn, &event);
        } else {
            state.record_event(&self.session, &self.turn, &event);
        }
    }
}

impl Host {
    pub(super) async fn order_admission(
        &self,
        claim: &agent_kit_sessions::ClaimedTurn,
        messages: &[Message],
    ) -> Option<Parent> {
        let binding = claim.lease.binding();
        let fresh = binding.epoch == 1;
        self.activity_order.begin(binding, fresh);
        if !fresh {
            match self
                .store
                .inspect_turn_with(binding.session.clone(), binding.turn.clone(), |state| {
                    Ok(retained_public_facts(state))
                })
                .await
            {
                Ok(messages) => self.activity_order.audit_existing(binding, &messages),
                Err(_) => self.activity_order.incomplete(binding),
            }
        }
        if fresh {
            for message in messages {
                record_public(&self.activity_order, binding, message);
            }
        }
        let configuration = decode_session_configuration(&claim.configuration).ok()?;
        let profile = configuration.subagent?;
        let assignment = claim
            .inputs
            .iter()
            .filter_map(|input| decode_input(input).ok())
            .find_map(|stored: StoredPrompt| stored.subagent)?;
        let parent = Parent {
            session: profile.parent().clone(),
            turn: assignment.parent_turn,
            event_prefix: format!("{}/{}", binding.session, binding.turn),
        };
        // A late private assignment may name an already settled parent turn.
        // That old work timeline stays closed; later events remain unplaced.
        let history = self
            .store
            .inspect_turn_with(parent.session.clone(), parent.turn.clone(), |state| {
                Ok((state.outcome().is_some(), retained_public_facts(state)))
            })
            .await;
        let parent_binding = agent_kit_core::turn::TurnBinding {
            session: parent.session.clone(),
            turn: parent.turn.clone(),
            epoch: 1,
        };
        if let Ok((settled, records)) = history {
            if records.len() >= MAX_FACTS {
                self.activity_order.incomplete(&parent_binding);
            }
            if settled {
                self.activity_order.close(&parent.session, &parent.turn);
            } else if fresh {
                // Tool admission already committed these causal predecessors,
                // even if its parent's observer has not drained them yet.
                for fact in records {
                    self.activity_order
                        .record(&parent.session, &parent.turn, fact);
                }
                parent.record(&self.activity_order, "started");
            }
        } else {
            self.activity_order.incomplete(&parent_binding);
        }
        Some(parent)
    }
}

fn retained_public_facts(state: &agent_kit_core::turn::TurnState) -> Vec<String> {
    use agent_kit_core::turn::OperationOutcome;
    let mut seen = std::collections::BTreeSet::new();
    state
        .history()
        .records()
        .iter()
        .map(|HistoryRecord::Message(message)| message)
        .chain(
            state
                .operations()
                .values()
                .filter_map(|operation| match operation.outcome() {
                    Some(OperationOutcome::Inference(outcome)) => Some(outcome.messages.iter()),
                    _ => None,
                })
                .flatten(),
        )
        .flat_map(public_facts)
        .filter(|fact| seen.insert(fact.clone()))
        .take(MAX_FACTS)
        .collect()
}

fn public_facts(message: &Message) -> Vec<String> {
    if !matches!(message.role, Role::User | Role::Assistant)
        || super::message_context::is_supplemental(message)
    {
        return Vec::new();
    }
    let mut facts = Vec::new();
    if super::message_context::has_context(message)
        || message.content.iter().any(|part| {
            matches!(part, Content::Text(text) if !text.is_empty())
                || matches!(part, Content::ProviderEvidence(_))
                || (message.role == Role::User && matches!(part, Content::Media(_)))
        })
    {
        facts.push(format!("message/{}", message.id));
    }
    if message.role == Role::Assistant {
        for part in &message.content {
            if let Content::ToolCall(call) = part {
                facts.push(format!("call/{}", call.id));
            }
        }
    }
    facts
}

fn record_public(state: &State, binding: &agent_kit_core::turn::TurnBinding, message: &Message) {
    if !matches!(message.role, Role::User | Role::Assistant)
        || super::message_context::is_supplemental(message)
    {
        return;
    }
    if super::message_context::has_context(message)
        || message.content.iter().any(|part| {
            matches!(part, Content::Text(text) if !text.is_empty())
                || (message.role == Role::User && matches!(part, Content::Media(_)))
        })
    {
        state.record_message(&binding.session, &binding.turn, &message.id);
    }
    if message.role == Role::Assistant {
        for part in &message.content {
            if let Content::ToolCall(call) = part {
                state.record_call(&binding.session, &binding.turn, &call.id);
            }
        }
    }
}

pub(super) struct Publisher {
    state: Arc<State>,
    binding: agent_kit_core::turn::TurnBinding,
    parent: Option<Parent>,
    seen: std::collections::BTreeSet<MessageId>,
}
impl Publisher {
    pub(super) fn new(
        state: Arc<State>,
        binding: agent_kit_core::turn::TurnBinding,
        parent: Option<Parent>,
        initial: &agent_kit_core::turn::TurnState,
    ) -> Self {
        Self {
            state,
            binding,
            parent,
            seen: initial
                .history()
                .records()
                .iter()
                .map(|HistoryRecord::Message(message)| message.id.clone())
                .collect(),
        }
    }
    pub(super) fn update(&mut self, update: &agent_kit_runtime::TurnUpdate) {
        use agent_kit_core::inference::InferenceUpdate;
        use agent_kit_core::turn::OperationOutcome;
        use agent_kit_runtime::TurnUpdate;
        match update {
            TurnUpdate::Inference {
                update: InferenceUpdate::TextDelta { message, text },
                ..
            } if !text.is_empty() => {
                self.state
                    .record_message(&self.binding.session, &self.binding.turn, message);
            }
            TurnUpdate::Inference {
                update: InferenceUpdate::ProviderEvidence { message, .. },
                ..
            } => {
                self.state
                    .record_message(&self.binding.session, &self.binding.turn, message);
            }
            TurnUpdate::Operation {
                outcome: OperationOutcome::Inference(outcome),
                ..
            } => {
                for message in &outcome.messages {
                    record_public(&self.state, &self.binding, message);
                }
            }
            TurnUpdate::Snapshot(view) => {
                for HistoryRecord::Message(message) in view.state.history().records() {
                    if self.seen.insert(message.id.clone()) {
                        record_public(&self.state, &self.binding, message);
                    }
                }
                if view.state.outcome().is_some() {
                    if let Some(parent) = &self.parent {
                        parent.record(&self.state, "finished");
                    }
                    self.state.close(&self.binding.session, &self.binding.turn);
                }
            }
            _ => {}
        }
    }
}

/// Metadata for one visible fact. Incomplete is explicit and mutually exclusive
/// with a usable positive safe-integer position.
pub(crate) fn metadata(order: Option<u64>) -> serde_json::Value {
    match order {
        Some(order) => serde_json::json!({"activityOrder": order}),
        None => serde_json::json!({"activityOrderIncomplete": true}),
    }
}

fn read_private(path: &Path) -> Result<Option<Vec<u8>>> {
    read_private_limit(path, MAX_BYTES)
}

fn read_private_limit(path: &Path, limit: u64) -> Result<Option<Vec<u8>>> {
    let before = match std::fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(unavailable()),
        Ok(metadata) => metadata,
    };
    crate::scratch::check_private_directory(path.parent().ok_or_else(unavailable)?)?;
    private_file(&before)?;
    if before.len() > limit {
        return Err(cleanup_pending());
    }
    grida_auth::refuse_granting_acl(path).map_err(|_| unavailable())?;
    if path.canonicalize().map_err(|_| unavailable())? != path {
        return Err(unavailable());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut file = options.open(path).map_err(|_| unavailable())?;
    let after = file.metadata().map_err(|_| unavailable())?;
    private_file(&after)?;
    if after.len() > limit {
        return Err(cleanup_pending());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != after.dev() || before.ino() != after.ino() {
            return Err(unavailable());
        }
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(limit)
        .read_to_end(&mut bytes)
        .map_err(|_| unavailable())?;
    if file.metadata().map_err(|_| unavailable())?.len() > limit {
        return Err(cleanup_pending());
    }
    Ok(Some(bytes))
}

fn valid_fact(fact: &str) -> bool {
    fact.len() <= 1024
        && !fact.chars().any(char::is_control)
        && ["message/", "call/", "event/"]
            .iter()
            .any(|prefix| fact.starts_with(prefix) && fact.len() > prefix.len())
}
fn private_file(metadata: &std::fs::Metadata) -> Result<()> {
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err(unavailable());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.uid() != rustix::process::geteuid().as_raw()
            || metadata.mode() & 0o7777 != 0o600
            || metadata.nlink() != 1
        {
            return Err(unavailable());
        }
    }
    Ok(())
}
fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "activity_order_unavailable")
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    use agent_kit_core::messages::{Provenance, ProvenanceKind};
    use agent_kit_core::turn::TurnBinding;
    fn binding(session: &str) -> TurnBinding {
        TurnBinding {
            session: SessionId::new(session).unwrap(),
            turn: TurnId::new("turn").unwrap(),
            epoch: 1,
        }
    }
    fn state(root: &Path) -> State {
        State::new(
            Some(root.to_owned()),
            Arc::new(SqliteStore::open_in_memory().unwrap()),
        )
    }

    #[test]
    fn shared_positions_are_durable_idempotent_and_closed_parent_work_stays_closed() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let binding = binding("parent");
        let message = MessageId::new("first-public-text").unwrap();
        let call = agent_kit_core::ToolCallId::new("spawn-call").unwrap();
        let store = state(&root);
        store.begin(&binding, true);
        assert_eq!(
            store.record_message(&binding.session, &binding.turn, &message),
            Some(1)
        );
        assert_eq!(
            store.record_call(&binding.session, &binding.turn, &call),
            Some(2)
        );
        assert_eq!(
            store.record_event(&binding.session, &binding.turn, "child-a/turn/started"),
            Some(3)
        );
        assert_eq!(
            store.record_message(&binding.session, &binding.turn, &message),
            Some(1)
        );
        assert_eq!(
            store.record_event(&binding.session, &binding.turn, "child-b/turn/finished"),
            Some(4)
        );
        store.close(&binding.session, &binding.turn);
        assert_eq!(
            store.record_finish(&binding.session, &binding.turn, "child-a/turn/finished"),
            Some(5)
        );
        assert_eq!(
            store.record_finish(&binding.session, &binding.turn, "unmatched/turn/finished"),
            None
        );
        assert_eq!(
            store.record_message(
                &binding.session,
                &binding.turn,
                &MessageId::new("late-message").unwrap()
            ),
            None
        );
        assert_eq!(
            store.record_call(
                &binding.session,
                &binding.turn,
                &agent_kit_core::ToolCallId::new("late-call").unwrap()
            ),
            None
        );
        assert_eq!(
            store.record_event(&binding.session, &binding.turn, "late-private/turn/started"),
            None
        );
        drop(store);
        let reopened = state(&root);
        assert_eq!(
            reopened.message(&binding.session, &binding.turn, &message),
            Some(1)
        );
        assert_eq!(
            reopened.call(&binding.session, &binding.turn, &call),
            Some(2)
        );
        assert_eq!(
            reopened.event(&binding.session, &binding.turn, "child-b/turn/finished"),
            Some(4)
        );
        assert_eq!(
            reopened.record_finish(&binding.session, &binding.turn, "child-a/turn/finished"),
            Some(5)
        );
        assert_eq!(
            reopened.record_event(
                &binding.session,
                &binding.turn,
                "late-private/turn/finished"
            ),
            None
        );
    }

    #[test]
    fn legacy_and_resumed_missing_publications_never_acquire_invented_history_positions() {
        let root = tempfile::tempdir().unwrap();
        let store = state(&root.path().canonicalize().unwrap());
        let legacy = binding("legacy");
        store.begin(&legacy, false);
        assert_eq!(
            store.record_event(&legacy.session, &legacy.turn, "child/turn/finished"),
            None
        );
        let parent = binding("parent");
        store.begin(&parent, true);
        let known = MessageId::new("known").unwrap();
        store.record_message(&parent.session, &parent.turn, &known);
        let missing = Message {
            id: MessageId::new("previously-unordered").unwrap(),
            role: Role::Assistant,
            phase: None,
            content: vec![Content::Text("historical public text".into())],
            provenance: Provenance {
                source: "fixture".into(),
                kind: ProvenanceKind::Generated,
                fingerprint: None,
            },
        };
        store.audit_existing(&parent, &public_facts(&missing));
        assert_eq!(
            store.record_message(&parent.session, &parent.turn, &missing.id),
            None
        );
        assert_eq!(
            store.record_event(&parent.session, &parent.turn, "later/turn/started"),
            None
        );
        assert_eq!(
            store.message(&parent.session, &parent.turn, &known),
            Some(1)
        );
        let path = store
            .path(&Key {
                session: parent.session.clone(),
                turn: parent.turn.clone(),
            })
            .unwrap()
            .unwrap();
        let bytes = std::fs::read(path).unwrap();
        assert!(
            !String::from_utf8(bytes)
                .unwrap()
                .contains("historical public text")
        );
    }

    #[test]
    fn reasoning_is_not_a_public_fact_and_full_ledgers_keep_known_positions() {
        let root = tempfile::tempdir().unwrap();
        let store = state(&root.path().canonicalize().unwrap());
        let binding = binding("parent");
        store.begin(&binding, true);
        let hidden = Message {
            id: MessageId::new("hidden").unwrap(),
            role: Role::Assistant,
            phase: None,
            content: vec![Content::Reasoning("private provider reasoning".into())],
            provenance: Provenance {
                source: "fixture".into(),
                kind: ProvenanceKind::Generated,
                fingerprint: None,
            },
        };
        record_public(&store, &binding, &hidden);
        assert!(public_facts(&hidden).is_empty());
        assert_eq!(
            store.message(&binding.session, &binding.turn, &hidden.id),
            None
        );
        let key = Key {
            session: binding.session.clone(),
            turn: binding.turn.clone(),
        };
        let ledger = Ledger {
            schema: SCHEMA.into(),
            session: binding.session.clone(),
            turn: binding.turn.clone(),
            closed: false,
            complete: true,
            entries: (1..=MAX_FACTS)
                .map(|i| (format!("message/{i}"), i as u64))
                .collect(),
        };
        store.persist(&key, &ledger).unwrap();
        drop(store);
        let reopened = state(&root.path().canonicalize().unwrap());
        assert_eq!(
            reopened.record_event(&binding.session, &binding.turn, "extra/finished"),
            None
        );
        assert_eq!(
            reopened.message(
                &binding.session,
                &binding.turn,
                &MessageId::new("1").unwrap()
            ),
            Some(1)
        );
    }

    #[test]
    fn cleanup_budget_has_progress_and_failure_tombstones_survive_cache_eviction() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let store = state(&root);
        let parent = binding("parent");
        store.begin(&parent, true);
        let known = MessageId::new("known").unwrap();
        store.record_message(&parent.session, &parent.turn, &known);
        store.incomplete(&parent);
        for i in 0..16 {
            let other = binding(&format!("other-{i}"));
            store.begin(&other, true);
        }
        assert_eq!(
            store.message(&parent.session, &parent.turn, &known),
            Some(1)
        );
        assert_eq!(
            store.record_event(&parent.session, &parent.turn, "later/started"),
            None
        );
        let doomed = SessionId::new("doomed").unwrap();
        for i in 0..257 {
            let key = Key {
                session: doomed.clone(),
                turn: TurnId::new(format!("turn-{i}")).unwrap(),
            };
            store
                .persist(
                    &key,
                    &Ledger {
                        schema: SCHEMA.into(),
                        session: key.session.clone(),
                        turn: key.turn.clone(),
                        closed: true,
                        complete: true,
                        entries: BTreeMap::new(),
                    },
                )
                .unwrap();
        }
        assert_eq!(
            store.retire(&doomed).unwrap_err().code,
            "activity_order_cleanup_pending"
        );
        store.retire(&doomed).unwrap();
        assert_eq!(
            store.message(&parent.session, &parent.turn, &known),
            Some(1)
        );
    }

    #[test]
    fn unsafe_and_oversized_private_files_are_unavailable_and_retirement_is_session_scoped() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        let store = state(&root);
        let a = binding("a");
        let b = binding("b");
        for binding in [&a, &b] {
            store.begin(binding, true);
            store.record_message(
                &binding.session,
                &binding.turn,
                &MessageId::new("text").unwrap(),
            );
        }
        store.retire(&a.session).unwrap();
        assert_eq!(
            store.message(&b.session, &b.turn, &MessageId::new("text").unwrap()),
            Some(1)
        );
        let key = Key {
            session: b.session.clone(),
            turn: b.turn.clone(),
        };
        let path = store.path(&key).unwrap().unwrap();
        drop(store);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(state(&root).load(&key).is_err());
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(state(&root).load(&key).is_err());
        assert!(state(&root).retire(&b.session).is_err());
    }
}
