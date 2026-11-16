//! GRIDA-SEC-004 — chat-owned command sessions under the native sandbox.
//!
//! A model command that is still running after its short wait stays with the
//! chat as a numbered process. The chat's later turns read its output, type
//! into it and stop it through `write_stdin`; a person lists and stops it
//! through the host. Turn end, cancellation, pause and approval suspension
//! leave it running. A stop request, deleting the chat, evicting it for a
//! newer process, its scope lifetime and shutting the host down stop it.
//! A changed permission profile governs later launches only; it does not
//! stop a running process. The sandbox ends it if this process disappears.

mod output;
mod tools;

pub use tools::ProcessTools;
pub(crate) use tools::{AuthorizedProcess, EXEC_COMMAND, ExecArguments, WRITE_STDIN};

use crate::command::{cleanup_verified, summarize};
use crate::host::live::{LiveProcesses, LiveUpdate};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::{AttemptId, CancellationToken, Error, ErrorKind, Result, SessionId};
use agent_kit_sandbox::{Completion, ProcessEvidence, RunningSession, StopReason};
use output::Captured;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{Notify, broadcast};

/// Processes one chat keeps at once. Starting another evicts one.
pub const MAX_PROCESSES_PER_CHAT: usize = 64;
/// The most recently used processes eviction never chooses.
const PROTECTED_RECENT: usize = 8;
/// Unread output each process retains between reads.
pub(crate) const RETAINED_OUTPUT_BYTES: usize = 1024 * 1024;
/// A process that nobody stops ends after this long.
pub(crate) const SESSION_LIFETIME: Duration = Duration::from_secs(24 * 60 * 60);
/// Listed command lines are cut to this many bytes.
const MAX_LISTED_COMMAND_BYTES: usize = 1024;
const WATCH_INTERVAL: Duration = Duration::from_millis(250);
const STOP_WATCH_INTERVAL: Duration = Duration::from_millis(25);
const MAX_TRACKED_SCOPES: usize = 64;

/// The last process number each chat was given while this process runs,
/// shared by every store. A chat's counter starts above the numbers its model
/// context has already been shown (see [`ProcessSessions::raise_number_floor`])
/// and is dropped once the chat holds no process and its deletion ends.
static NEXT_IDS: LazyLock<Mutex<BTreeMap<SessionId, u64>>> = LazyLock::new(Mutex::default);

fn next_ids() -> MutexGuard<'static, BTreeMap<SessionId, u64>> {
    NEXT_IDS.lock().unwrap_or_else(|error| error.into_inner())
}

/// A chat's process as clients see it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessEntry {
    pub process_id: u64,
    /// The command line, cut to a bounded length.
    pub command: String,
    pub cwd: PathBuf,
    pub terminal: bool,
    /// Unix milliseconds.
    pub started_at: u64,
    pub state: ProcessState,
    /// Set only when the process exited on its own with a code.
    pub exit_code: Option<i32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessState {
    Running,
    /// Ended, and the model has not yet read its end.
    Ended,
}

/// Every running and ended-but-unread process of the host's chats.
pub struct ProcessSessions {
    state: Mutex<State>,
    changed: Notify,
    live: Option<broadcast::Sender<LiveUpdate>>,
}

#[derive(Default)]
struct State {
    closed: bool,
    chats: BTreeMap<SessionId, BTreeMap<u64, Arc<Entry>>>,
    /// Chats being deleted accept no new process.
    retiring: BTreeSet<SessionId>,
    /// Admitted launches that have no supervised process yet, by serial.
    launching: BTreeMap<u64, (SessionId, CancellationToken)>,
    /// Every launched process until its supervision has finished, listed or
    /// not: a process still within its first wait, or one evicted.
    supervised: BTreeMap<u64, Arc<Entry>>,
    next_serial: u64,
    unverified: bool,
    unverified_chats: BTreeSet<SessionId>,
    /// Only bounded one-shot scopes request this incarnation's launch evidence.
    tracked_attempts: BTreeMap<SessionId, BTreeSet<AttemptId>>,
}

pub(crate) struct Entry {
    serial: u64,
    session: SessionId,
    id: OnceLock<u64>,
    command: String,
    cwd: PathBuf,
    terminal: bool,
    started_at: u64,
    stop: CancellationToken,
    /// Held for one interaction: a read, write or the final collection.
    io: tokio::sync::Mutex<Io>,
    status: Mutex<Status>,
}

struct Io {
    running: Option<RunningSession>,
    unread: Captured,
}

/// An admitted launch before its process is supervised. Dropping it
/// unsupervised withdraws it.
pub(crate) struct Launch {
    sessions: Arc<ProcessSessions>,
    serial: u64,
    session: SessionId,
    stop: CancellationToken,
    pending: bool,
}

impl Launch {
    /// Cancelled when the launch or its process should stop.
    pub(crate) fn stop(&self) -> CancellationToken {
        self.stop.clone()
    }
}

impl Drop for Launch {
    fn drop(&mut self) {
        if self.pending {
            self.sessions.state().launching.remove(&self.serial);
            self.sessions.changed.notify_waiters();
        }
    }
}

struct Status {
    last_used: Instant,
    ending: Option<Ending>,
}

/// How a process ended, from its native evidence.
#[derive(Clone, Debug)]
pub(crate) struct Ending {
    pub completion: Completion,
    pub stopped: Option<StopReason>,
    pub verified: bool,
    pub status: OutcomeStatus,
    pub details: serde_json::Value,
}

impl Ending {
    fn from_evidence(evidence: &ProcessEvidence) -> Self {
        let (details, status, verified) = summarize(evidence);
        debug_assert_eq!(verified, cleanup_verified(evidence));
        Self {
            completion: evidence.completion,
            stopped: evidence.stopped,
            verified,
            status,
            details,
        }
    }

    fn lost() -> Self {
        Self {
            completion: Completion::Uncertain,
            stopped: None,
            verified: false,
            status: OutcomeStatus::Uncertain,
            details: serde_json::json!({"completion": {"kind": "uncertain"}, "cleanup_verified": false}),
        }
    }

    /// The exit code, when the process exited on its own.
    pub(crate) fn exit_code(&self) -> Option<i32> {
        match (self.completion, self.stopped) {
            (Completion::Exited(code), None) => Some(code),
            _ => None,
        }
    }
}

/// One process eviction may weigh.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Candidate {
    pub id: u64,
    pub last_used: Instant,
    pub ended: bool,
    /// An interaction is in progress.
    pub locked: bool,
}

/// The process to evict for a new one: never one of the most recently used,
/// never one in use, an ended one before a running one, the least recently
/// used first.
pub(crate) fn eviction_victim(candidates: &[Candidate]) -> Option<u64> {
    let mut recent = candidates.iter().collect::<Vec<_>>();
    recent.sort_by(|a, b| b.last_used.cmp(&a.last_used).then(b.id.cmp(&a.id)));
    let protected = recent
        .iter()
        .take(PROTECTED_RECENT)
        .map(|candidate| candidate.id)
        .collect::<BTreeSet<_>>();
    let oldest = |ended: bool| {
        candidates
            .iter()
            .filter(|candidate| {
                !protected.contains(&candidate.id) && !candidate.locked && candidate.ended == ended
            })
            .min_by(|a, b| a.last_used.cmp(&b.last_used).then(a.id.cmp(&b.id)))
            .map(|candidate| candidate.id)
    };
    oldest(true).or_else(|| oldest(false))
}

impl Default for ProcessSessions {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessSessions {
    /// A store that publishes no live updates.
    pub fn new() -> Self {
        Self {
            state: Mutex::default(),
            changed: Notify::new(),
            live: None,
        }
    }

    pub(crate) fn with_live(live: broadcast::Sender<LiveUpdate>) -> Self {
        Self {
            live: Some(live),
            ..Self::new()
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|error| error.into_inner())
    }

    /// The chat's processes: running ones first, then ended ones the model
    /// has not read, each in start order.
    pub fn list(&self, session: &SessionId) -> Vec<ProcessEntry> {
        let state = self.state();
        state
            .chats
            .get(session)
            .map(|chat| project(chat.values()))
            .unwrap_or_default()
    }

    /// Admit a new process for this chat when the store is open and the chat
    /// has room, or a process it may evict. Until it is supervised or
    /// dropped, the launch is stopped and awaited like a running process.
    pub(crate) fn admit(self: &Arc<Self>, session: &SessionId) -> Result<Launch> {
        let mut state = self.state();
        if state.closed || state.retiring.contains(session) {
            return Err(closed());
        }
        if let Some(chat) = state.chats.get(session)
            && chat.len() >= MAX_PROCESSES_PER_CHAT
            && eviction_victim(&candidates(chat)).is_none()
        {
            return Err(limit());
        }
        state.next_serial += 1;
        let serial = state.next_serial;
        let stop = CancellationToken::new();
        state
            .launching
            .insert(serial, (session.clone(), stop.clone()));
        Ok(Launch {
            sessions: self.clone(),
            serial,
            session: session.clone(),
            stop,
            pending: true,
        })
    }

    pub(crate) fn track_attempts(&self, session: &SessionId) -> Result<()> {
        let mut state = self.state();
        if !state.tracked_attempts.contains_key(session)
            && state.tracked_attempts.len() >= MAX_TRACKED_SCOPES
        {
            return Err(Error::new(ErrorKind::LimitExceeded, "process_scope_limit"));
        }
        state.tracked_attempts.entry(session.clone()).or_default();
        Ok(())
    }

    pub(crate) fn admit_attempt(
        self: &Arc<Self>,
        session: &SessionId,
        attempt: &AttemptId,
    ) -> Result<Launch> {
        let launch = self.admit(session)?;
        if let Some(attempts) = self.state().tracked_attempts.get_mut(session) {
            attempts.insert(attempt.clone());
        }
        Ok(launch)
    }

    pub(crate) fn knows_attempt(&self, session: &SessionId, attempt: &AttemptId) -> bool {
        self.state()
            .tracked_attempts
            .get(session)
            .is_some_and(|attempts| attempts.contains(attempt))
    }

    pub(crate) fn forget_attempts(&self, session: &SessionId) {
        self.state().tracked_attempts.remove(session);
    }

    /// A completion proposal can be reconsidered. Reopening its quiescent
    /// capability must not reuse numbers already shown to the model.
    pub(crate) fn continue_after_retirement(&self, session: &SessionId) {
        self.state().retiring.remove(session);
    }

    /// Supervise an admitted launch's process until it ends. It is not
    /// listed until [`Self::register`] gives it a number.
    pub(crate) fn supervise(
        self: &Arc<Self>,
        mut launch: Launch,
        command: String,
        cwd: PathBuf,
        terminal: bool,
        running: RunningSession,
    ) -> Arc<Entry> {
        let mut state = self.state();
        state.launching.remove(&launch.serial);
        launch.pending = false;
        let stop = launch.stop.clone();
        let entry = Arc::new(Entry {
            serial: launch.serial,
            session: launch.session.clone(),
            id: OnceLock::new(),
            command,
            cwd,
            terminal,
            started_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |time| {
                    u64::try_from(time.as_millis()).unwrap_or(u64::MAX)
                }),
            stop,
            io: tokio::sync::Mutex::new(Io {
                running: Some(running),
                unread: Captured::default(),
            }),
            status: Mutex::new(Status {
                last_used: Instant::now(),
                ending: None,
            }),
        });
        if state.closed || state.retiring.contains(&entry.session) {
            entry.stop.cancel();
        }
        state.supervised.insert(entry.serial, entry.clone());
        drop(state);
        tokio::spawn(watch(self.clone(), entry.clone()));
        entry
    }

    /// List a process that outlived its first wait under the chat's next
    /// number, evicting one when the chat is full. A refused process is
    /// stopped.
    pub(crate) fn register(&self, entry: &Arc<Entry>) -> Result<u64> {
        let mut state = self.state();
        if state.closed || state.retiring.contains(&entry.session) {
            entry.stop.cancel();
            return Err(closed());
        }
        let chat = state.chats.entry(entry.session.clone()).or_default();
        if chat.len() >= MAX_PROCESSES_PER_CHAT {
            let Some(victim) = eviction_victim(&candidates(chat)) else {
                entry.stop.cancel();
                return Err(limit());
            };
            if let Some(evicted) = chat.remove(&victim) {
                evicted.stop.cancel();
            }
        }
        let id = {
            let mut ids = next_ids();
            let next = ids.entry(entry.session.clone()).or_insert(0);
            *next += 1;
            *next
        };
        let _ = entry.id.set(id);
        entry.touch();
        chat.insert(id, entry.clone());
        let list = project(chat.values());
        // Published under the lock, so lists reach clients in change order.
        self.publish(&entry.session, list);
        Ok(id)
    }

    pub(crate) fn get(&self, session: &SessionId, id: u64) -> Option<Arc<Entry>> {
        self.state().chats.get(session)?.get(&id).cloned()
    }

    /// Forget an ended process whose end the model has read.
    pub(crate) fn collect(&self, entry: &Entry) {
        let Some(id) = entry.id.get() else {
            return;
        };
        let mut state = self.state();
        let Some(chat) = state.chats.get_mut(&entry.session) else {
            return;
        };
        if chat
            .get(id)
            .is_none_or(|listed| listed.serial != entry.serial)
        {
            return;
        }
        chat.remove(id);
        let list = project(chat.values());
        if chat.is_empty() {
            state.chats.remove(&entry.session);
        }
        self.publish(&entry.session, list);
    }

    fn finalized(&self, entry: &Entry, verified: bool) {
        let mut state = self.state();
        state.supervised.remove(&entry.serial);
        state.unverified |= !verified;
        if !verified {
            state.unverified_chats.insert(entry.session.clone());
        }
        let list = entry.id.get().and_then(|id| {
            let chat = state.chats.get(&entry.session)?;
            chat.get(id)
                .is_some_and(|listed| listed.serial == entry.serial)
                .then(|| project(chat.values()))
        });
        if let Some(list) = list {
            self.publish(&entry.session, list);
        }
        drop(state);
        self.changed.notify_waiters();
    }

    /// Wait until each of the given launches and processes has ended and its
    /// supervision finished, or the deadline passes. Returns whether every
    /// one did.
    async fn await_serials(&self, serials: &BTreeSet<u64>, deadline: Instant) -> bool {
        self.wait(deadline, || {
            let state = self.state();
            !serials.iter().any(|serial| {
                state.launching.contains_key(serial) || state.supervised.contains_key(serial)
            })
        })
        .await;
        let state = self.state();
        !serials.iter().any(|serial| {
            state.launching.contains_key(serial) || state.supervised.contains_key(serial)
        })
    }

    /// Cancel every admitted launch and supervised process of the chat,
    /// listed or not, and return their serials.
    fn cancel_chat(state: &State, session: &SessionId) -> BTreeSet<u64> {
        let mut serials = BTreeSet::new();
        for (serial, (owner, stop)) in &state.launching {
            if owner == session {
                stop.cancel();
                serials.insert(*serial);
            }
        }
        for entry in state.supervised.values() {
            if &entry.session == session {
                entry.stop.cancel();
                serials.insert(entry.serial);
            }
        }
        serials
    }

    /// Stop the named processes of a chat, or all of them, and wait until
    /// each has ended or the deadline passes. Returns the ones that ended.
    /// Ended processes stay listed until the model reads their end. Stopping
    /// all of them also stops a process still within its first wait and a
    /// launch not yet started, which have no number to return.
    pub async fn stop(
        &self,
        session: &SessionId,
        ids: Option<&[u64]>,
        deadline: Instant,
    ) -> Vec<u64> {
        let (targets, unlisted) = {
            let state = self.state();
            let targets = state
                .chats
                .get(session)
                .map(|chat| {
                    chat.iter()
                        .filter(|(id, _)| ids.is_none_or(|ids| ids.contains(id)))
                        .map(|(_, entry)| entry.clone())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            for target in &targets {
                target.stop.cancel();
            }
            let unlisted = if ids.is_none() {
                Self::cancel_chat(&state, session)
            } else {
                BTreeSet::new()
            };
            (targets, unlisted)
        };
        self.wait(deadline, || {
            let state = self.state();
            targets.iter().all(|target| target.has_ended())
                && !unlisted.iter().any(|serial| {
                    state.launching.contains_key(serial) || state.supervised.contains_key(serial)
                })
        })
        .await;
        targets
            .iter()
            .filter(|target| target.has_ended())
            .filter_map(|target| target.id.get().copied())
            .collect()
    }

    pub(crate) fn cleanup_unverified(&self, session: &SessionId) -> bool {
        self.state().unverified_chats.contains(session)
    }

    /// Stop every process of a chat that is being deleted and keep it from
    /// starting more until [`Self::release`]. Cleanup that native evidence
    /// cannot confirm is recorded for host shutdown.
    pub(crate) async fn retire(&self, session: &SessionId, deadline: Instant) -> Result<()> {
        let targets = {
            let mut state = self.state();
            state.retiring.insert(session.clone());
            Self::cancel_chat(&state, session)
        };
        if !self.await_serials(&targets, deadline).await {
            return Err(Error::new(ErrorKind::Uncertain, "process_cleanup_pending"));
        }
        let mut state = self.state();
        if state.unverified_chats.contains(session) {
            return Err(Error::new(
                ErrorKind::Uncertain,
                "process_cleanup_unverified",
            ));
        }
        if state.chats.remove(session).is_some() {
            self.publish(session, Vec::new());
        }
        Ok(())
    }

    /// Let a chat whose deletion finished or failed start processes again.
    /// A chat left with no process forgets its counter: its next process
    /// number is taken again from what its model context has been shown.
    pub(crate) fn release(&self, session: &SessionId) {
        let mut state = self.state();
        state.retiring.remove(session);
        let idle = !state.chats.contains_key(session)
            && !state.launching.values().any(|(owner, _)| owner == session)
            && !state
                .supervised
                .values()
                .any(|entry| &entry.session == session);
        if idle {
            next_ids().remove(session);
        }
    }

    /// Whether this chat has no process counter yet in this process, so its
    /// floor must be raised before it is given a number.
    pub(crate) fn needs_number_floor(&self, session: &SessionId) -> bool {
        !next_ids().contains_key(session)
    }

    /// The last number this chat was given in this process, or zero.
    pub(crate) fn issued_numbers(&self, session: &SessionId) -> u64 {
        next_ids().get(session).copied().unwrap_or(0)
    }

    /// Give this chat's later processes numbers above `floor`: the highest
    /// number its model context, or the chat it was forked from, has shown.
    /// Numbers are then never repeated after a restart or in a fork.
    pub(crate) fn raise_number_floor(&self, session: &SessionId, floor: u64) {
        let mut ids = next_ids();
        let next = ids.entry(session.clone()).or_insert(0);
        *next = (*next).max(floor);
    }

    /// Stop every process and wait for its supervision to finish. Admission
    /// stays closed. Pending or unverified cleanup is uncertain.
    pub async fn shutdown(&self, deadline: Instant) -> Result<()> {
        {
            let mut state = self.state();
            state.closed = true;
            for (_, stop) in state.launching.values() {
                stop.cancel();
            }
            for entry in state.supervised.values() {
                entry.stop.cancel();
            }
        }
        let settled = || {
            let state = self.state();
            state.launching.is_empty() && state.supervised.is_empty()
        };
        self.wait(deadline, settled).await;
        let state = self.state();
        if !state.launching.is_empty() || !state.supervised.is_empty() {
            return Err(Error::new(ErrorKind::Uncertain, "process_cleanup_pending"));
        }
        if state.unverified {
            return Err(Error::new(
                ErrorKind::Uncertain,
                "process_cleanup_unverified",
            ));
        }
        Ok(())
    }

    async fn wait(&self, deadline: Instant, done: impl Fn() -> bool) {
        loop {
            // notify_waiters wakes a Notified created before the check.
            let changed = self.changed.notified();
            if done() {
                return;
            }
            if tokio::time::timeout_at(deadline.into(), changed)
                .await
                .is_err()
            {
                return;
            }
        }
    }

    fn publish(&self, session: &SessionId, processes: Vec<ProcessEntry>) {
        if let Some(live) = &self.live
            && live.receiver_count() > 0
        {
            let _ = live.send(LiveUpdate::Processes(LiveProcesses {
                session: session.clone(),
                processes,
            }));
        }
    }
}

impl Entry {
    fn touch(&self) {
        self.status
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .last_used = Instant::now();
    }

    pub(crate) fn ending(&self) -> Option<Ending> {
        self.status
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .ending
            .clone()
    }

    fn has_ended(&self) -> bool {
        self.status
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .ending
            .is_some()
    }

    fn view(&self) -> Option<ProcessEntry> {
        let ending = self.ending();
        Some(ProcessEntry {
            process_id: *self.id.get()?,
            command: bounded(&self.command),
            cwd: self.cwd.clone(),
            terminal: self.terminal,
            started_at: self.started_at,
            state: if ending.is_some() {
                ProcessState::Ended
            } else {
                ProcessState::Running
            },
            exit_code: ending.and_then(|ending| ending.exit_code()),
        })
    }

    /// Collect the remaining output and the native evidence once the
    /// process ended. The caller holds the interaction lock. The evidence is
    /// recorded even when the caller stops waiting.
    async fn finalize(self: &Arc<Self>, sessions: &Arc<ProcessSessions>, io: &mut Io) {
        let Some(running) = io.running.take() else {
            return;
        };
        let (entry, sessions) = (self.clone(), sessions.clone());
        let (send, receive) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            let rest = running.read(Instant::now(), RETAINED_OUTPUT_BYTES).await;
            let ending = match running.finish().await {
                Ok(evidence) => Ending::from_evidence(&evidence),
                Err(_) => Ending::lost(),
            };
            let verified = ending.verified;
            entry
                .status
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .ending = Some(ending);
            sessions.finalized(&entry, verified);
            let _ = send.send(rest);
        });
        if let Ok(rest) = receive.await {
            io.unread.push(rest);
        }
    }
}

/// Notice the end of a process nobody is reading.
async fn watch(sessions: Arc<ProcessSessions>, entry: Arc<Entry>) {
    loop {
        if entry.stop.is_cancelled() {
            tokio::time::sleep(STOP_WATCH_INTERVAL).await;
        } else {
            tokio::select! {
                _ = entry.stop.cancelled() => {}
                _ = tokio::time::sleep(WATCH_INTERVAL) => {}
            }
        }
        let Ok(mut io) = entry.io.try_lock() else {
            continue;
        };
        match &io.running {
            None => return,
            Some(running) if running.has_ended() => {
                entry.finalize(&sessions, &mut io).await;
                return;
            }
            Some(_) => {}
        }
    }
}

/// The highest process number these messages show the model: in a command
/// tool's response, or in text that repeats its label. Zero when none.
pub(crate) fn shown_numbers(messages: &[agent_kit_core::messages::Message]) -> u64 {
    use agent_kit_core::messages::{Content, ResultContent};
    messages
        .iter()
        .flat_map(|message| &message.content)
        .flat_map(|content| match content {
            Content::Text(text) => vec![text.as_str()],
            Content::ToolResult(result) => result
                .content
                .iter()
                .filter_map(|part| match part {
                    ResultContent::Text(text) => Some(text.as_str()),
                    _ => None,
                })
                .collect(),
            _ => Vec::new(),
        })
        .map(output::highest_number)
        .max()
        .unwrap_or(0)
}

fn candidates(chat: &BTreeMap<u64, Arc<Entry>>) -> Vec<Candidate> {
    chat.iter()
        .map(|(id, entry)| {
            let status = entry
                .status
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            Candidate {
                id: *id,
                last_used: status.last_used,
                ended: status.ending.is_some(),
                locked: entry.io.try_lock().is_err(),
            }
        })
        .collect()
}

fn project<'a>(entries: impl Iterator<Item = &'a Arc<Entry>>) -> Vec<ProcessEntry> {
    let mut list = entries.filter_map(|entry| entry.view()).collect::<Vec<_>>();
    list.sort_by_key(|entry| (entry.state == ProcessState::Ended, entry.process_id));
    list
}

fn bounded(command: &str) -> String {
    if command.len() <= MAX_LISTED_COMMAND_BYTES {
        return command.to_owned();
    }
    format!(
        "{}…",
        &command[..command.floor_char_boundary(MAX_LISTED_COMMAND_BYTES)]
    )
}

fn closed() -> Error {
    Error::new(ErrorKind::Unavailable, "process_sessions_closed")
}

fn limit() -> Error {
    Error::new(ErrorKind::LimitExceeded, "process_session_limit")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A listed process with no native session, for store bookkeeping.
    fn entry(sessions: &ProcessSessions, session: &SessionId) -> Arc<Entry> {
        let mut state = sessions.state();
        state.next_serial += 1;
        Arc::new(Entry {
            serial: state.next_serial,
            session: session.clone(),
            id: OnceLock::new(),
            command: "true".into(),
            cwd: PathBuf::from("/"),
            terminal: false,
            started_at: 0,
            stop: CancellationToken::new(),
            io: tokio::sync::Mutex::new(Io {
                running: None,
                unread: Captured::default(),
            }),
            status: Mutex::new(Status {
                last_used: Instant::now(),
                ending: None,
            }),
        })
    }

    #[test]
    fn concurrent_changes_publish_lists_in_change_order() {
        let (live, mut receiver) = broadcast::channel(256);
        let sessions = Arc::new(ProcessSessions::with_live(live));
        let session = SessionId::new("published-in-order").unwrap();
        let threads = (0..8)
            .map(|_| {
                let (sessions, session) = (sessions.clone(), session.clone());
                std::thread::spawn(move || {
                    for _ in 0..8 {
                        let entry = entry(&sessions, &session);
                        sessions.register(&entry).unwrap();
                    }
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread.join().unwrap();
        }
        let mut lengths = Vec::new();
        while let Ok(LiveUpdate::Processes(update)) = receiver.try_recv() {
            lengths.push(update.processes.len());
        }
        assert_eq!(lengths, (1..=64).collect::<Vec<_>>());
    }

    #[test]
    fn numbers_continue_above_the_floor_and_restart_after_release() {
        let sessions = Arc::new(ProcessSessions::new());
        let session = SessionId::new("numbered-above-floor").unwrap();
        assert!(sessions.needs_number_floor(&session));
        sessions.raise_number_floor(&session, 7);
        assert!(!sessions.needs_number_floor(&session));
        // A lower floor, as from an ancestor, never lowers the counter.
        sessions.raise_number_floor(&session, 3);
        let first = entry(&sessions, &session);
        assert_eq!(sessions.register(&first).unwrap(), 8);
        assert_eq!(sessions.issued_numbers(&session), 8);
        // A chat that still holds a process keeps its counter.
        sessions.release(&session);
        assert!(!sessions.needs_number_floor(&session));
        sessions.state().chats.remove(&session);
        sessions.release(&session);
        assert!(sessions.needs_number_floor(&session));
        assert_eq!(sessions.issued_numbers(&session), 0);
    }

    #[tokio::test]
    async fn stopping_all_and_shutdown_include_launches_not_yet_supervised() {
        let sessions = Arc::new(ProcessSessions::new());
        let session = SessionId::new("launch-in-flight").unwrap();
        let other = SessionId::new("launch-elsewhere").unwrap();
        let launch = sessions.admit(&session).unwrap();
        let elsewhere = sessions.admit(&other).unwrap();
        // Named stops do not reach an unnumbered launch.
        sessions
            .stop(
                &session,
                Some(&[1]),
                Instant::now() + Duration::from_millis(20),
            )
            .await;
        assert!(!launch.stop().is_cancelled());
        // Stopping all of a chat's processes cancels the launch and waits
        // for it to be withdrawn.
        let stopping = {
            let sessions = sessions.clone();
            let session = session.clone();
            tokio::spawn(async move {
                sessions
                    .stop(&session, None, Instant::now() + Duration::from_secs(10))
                    .await
            })
        };
        let cancelled = launch.stop();
        tokio::time::timeout(Duration::from_secs(5), cancelled.cancelled())
            .await
            .unwrap();
        assert!(!stopping.is_finished());
        assert!(!elsewhere.stop().is_cancelled());
        drop(launch);
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(5), stopping)
                .await
                .unwrap()
                .unwrap(),
            Vec::<u64>::new()
        );
        // Shutdown waits for a launch still in flight.
        let error = sessions
            .shutdown(Instant::now() + Duration::from_millis(50))
            .await
            .unwrap_err();
        assert_eq!(error.code, "process_cleanup_pending");
        assert!(elsewhere.stop().is_cancelled());
        drop(elsewhere);
        sessions
            .shutdown(Instant::now() + Duration::from_secs(1))
            .await
            .unwrap();
        assert_eq!(
            sessions.admit(&session).err().unwrap().code,
            "process_sessions_closed"
        );
    }

    #[tokio::test]
    async fn retirement_reports_unverified_cleanup_only_for_its_own_chat() {
        let sessions = Arc::new(ProcessSessions::new());
        let chat = SessionId::new("unverified-owner").unwrap();
        let process = entry(&sessions, &chat);
        sessions.register(&process).unwrap();
        sessions.finalized(&process, false);
        assert_eq!(
            sessions
                .retire(&chat, Instant::now() + Duration::from_secs(1))
                .await
                .unwrap_err()
                .code,
            "process_cleanup_unverified"
        );
        assert!(sessions.cleanup_unverified(&chat));
        let unrelated = SessionId::new("independent-owner").unwrap();
        sessions
            .retire(&unrelated, Instant::now() + Duration::from_secs(1))
            .await
            .unwrap();
        assert!(!sessions.cleanup_unverified(&unrelated));
    }

    #[test]
    fn scoped_attempt_evidence_is_owned_bounded_and_released_explicitly() {
        let sessions = Arc::new(ProcessSessions::new());
        let chat = SessionId::new("tracked-owner").unwrap();
        let attempt = AttemptId::new("physical-attempt").unwrap();
        sessions.track_attempts(&chat).unwrap();
        let launch = sessions.admit_attempt(&chat, &attempt).unwrap();
        assert!(sessions.knows_attempt(&chat, &attempt));
        assert!(!sessions.knows_attempt(&SessionId::new("other").unwrap(), &attempt));
        drop(launch);
        for index in 1..MAX_TRACKED_SCOPES {
            sessions
                .track_attempts(&SessionId::new(format!("scope-{index}")).unwrap())
                .unwrap();
        }
        let next = SessionId::new("next-scope").unwrap();
        assert_eq!(
            sessions.track_attempts(&next).unwrap_err().code,
            "process_scope_limit"
        );
        sessions.forget_attempts(&chat);
        assert!(!sessions.knows_attempt(&chat, &attempt));
        sessions.track_attempts(&next).unwrap();
    }

    #[tokio::test]
    async fn reconsidering_completion_never_reuses_an_earlier_process_number() {
        let sessions = Arc::new(ProcessSessions::new());
        let chat = SessionId::new("reconsidered-completion").unwrap();
        let first = entry(&sessions, &chat);
        let first_id = sessions.register(&first).unwrap();
        sessions
            .retire(&chat, Instant::now() + Duration::from_secs(1))
            .await
            .unwrap();
        sessions.continue_after_retirement(&chat);
        let second = entry(&sessions, &chat);
        let second_id = sessions.register(&second).unwrap();
        assert!(second_id > first_id);
        assert!(sessions.get(&chat, first_id).is_none());
        sessions
            .retire(&chat, Instant::now() + Duration::from_secs(1))
            .await
            .unwrap();
        sessions.release(&chat);
    }

    fn candidate(id: u64, age: u64, ended: bool, locked: bool) -> Candidate {
        Candidate {
            id,
            last_used: Instant::now() - Duration::from_secs(age),
            ended,
            locked,
        }
    }

    #[test]
    fn eviction_protects_recent_prefers_ended_and_skips_locked() {
        let base = Instant::now();
        let at = |id: u64, ended: bool, locked: bool| Candidate {
            id,
            // Higher ids were used more recently.
            last_used: base - Duration::from_secs(1000 - id),
            ended,
            locked,
        };
        // Sixteen running processes: the oldest is chosen.
        let running = (1..=16).map(|id| at(id, false, false)).collect::<Vec<_>>();
        assert_eq!(eviction_victim(&running), Some(1));
        // An ended process is chosen before an older running one.
        let mut mixed = running.clone();
        mixed[5].ended = true;
        assert_eq!(eviction_victim(&mixed), Some(6));
        // A process in use is skipped.
        let mut busy = running.clone();
        busy[0].locked = true;
        assert_eq!(eviction_victim(&busy), Some(2));
        // The eight most recent are protected even when ended.
        let mut recent = running.clone();
        recent[15].ended = true;
        assert_eq!(eviction_victim(&recent), Some(1));
        // Nothing qualifies: every unprotected process is in use.
        let locked = (1..=16)
            .map(|id| at(id, false, id <= 8))
            .collect::<Vec<_>>();
        assert_eq!(eviction_victim(&locked), None);
        // Eight or fewer are all protected.
        let few = (1..=8).map(|id| at(id, true, false)).collect::<Vec<_>>();
        assert_eq!(eviction_victim(&few), None);
        assert_eq!(eviction_victim(&[candidate(3, 5, false, false); 1]), None);
    }

    #[test]
    fn listed_commands_are_bounded_on_a_character_boundary() {
        let long = "é".repeat(MAX_LISTED_COMMAND_BYTES);
        let listed = bounded(&long);
        assert!(listed.len() <= MAX_LISTED_COMMAND_BYTES + "…".len());
        assert!(listed.ends_with('…'));
        assert_eq!(bounded("npm run dev"), "npm run dev");
    }

    #[test]
    fn exit_codes_are_listed_only_for_processes_that_exited_on_their_own() {
        let ending = |completion, stopped| Ending {
            completion,
            stopped,
            verified: true,
            status: OutcomeStatus::Succeeded,
            details: serde_json::Value::Null,
        };
        assert_eq!(ending(Completion::Exited(3), None).exit_code(), Some(3));
        assert_eq!(
            ending(Completion::Exited(0), Some(StopReason::Requested)).exit_code(),
            None
        );
        assert_eq!(ending(Completion::Signaled(2), None).exit_code(), None);
    }

    #[test]
    fn entries_serialize_as_clients_read_them() {
        let entry = ProcessEntry {
            process_id: 1,
            command: "npm run dev".into(),
            cwd: PathBuf::from("/project"),
            terminal: false,
            started_at: 5,
            state: ProcessState::Running,
            exit_code: None,
        };
        assert_eq!(
            serde_json::to_value(entry).unwrap(),
            serde_json::json!({
                "processId": 1, "command": "npm run dev", "cwd": "/project",
                "terminal": false, "startedAt": 5, "state": "running", "exitCode": null,
            })
        );
    }
}
