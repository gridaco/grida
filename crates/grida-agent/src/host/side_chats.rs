//! GRIDA-SEC-004 — Temporary side chats.
//!
//! A side chat is an ordinary session forked from a parent chat's committed
//! history. It runs on the same engine, under the same execution, tools and
//! permission rules as the parent, and differs only by policy:
//!
//! - every side turn runs under [`grida_agent_master::side_chat`]'s policy and
//!   sees its history boundary between the inherited history (or the summary
//!   that replaced it) and its own turns;
//! - operations listed in [`Refusal`] are refused where the host admits them;
//! - the session lives outside every workspace catalog and is discarded with
//!   its data when closed, when its parent is deleted, when its connection
//!   closes, or by the sweep a host runs before serving.

use super::*;
use agent_kit_store_sqlite::history::{HistoryBasis, HistorySelection, SeededSession};
use grida_agent_master::conversation_seed::{ConversationCut, SeedOmissions};
use grida_agent_master::history::project;

/// Side chats one connection may hold open at once.
const MAX_OPEN_CHATS: usize = 4;
/// How long discarding a side chat waits for its running turn to stop.
const DISCARD_WAIT: Duration = Duration::from_secs(8);
/// Attempts to capture a parent whose committed history keeps moving.
const OPEN_ATTEMPTS: usize = 3;

/// The parent a temporary side session was forked from.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct SideSession {
    pub(super) parent: SessionId,
}

/// The catalog scope every side session is created in. No workspace listing,
/// search or saved-chat count reads it.
pub(super) fn scope() -> Result<Fingerprint> {
    Fingerprint::of(&"grida-side-chats-v1")
}

/// What a side chat does not offer. A snapshot lists every entry so a client
/// can hide the matching controls; the host refuses each with its code.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Refusal {
    /// Forking the side chat into another chat.
    Fork,
    /// Opening a side chat from a side chat.
    SideChat,
    /// Manual compaction. Automatic compaction can still summarize the
    /// inherited history before the first side turn.
    Compaction,
    Goals,
    Subagents,
    /// Effort levels that delegate review to another agent.
    Delegation,
    /// Scheduled continuation.
    Wakeups,
    /// Renaming, organizing, archiving or saving the chat, and deleting it as a
    /// saved chat. Close discards it instead.
    Catalog,
}

impl Refusal {
    const ALL: [Self; 8] = [
        Self::Fork,
        Self::SideChat,
        Self::Compaction,
        Self::Goals,
        Self::Subagents,
        Self::Delegation,
        Self::Wakeups,
        Self::Catalog,
    ];

    pub(crate) fn code(self) -> &'static str {
        match self {
            Self::Fork => "side_chat_fork_unavailable",
            Self::SideChat => "side_chat_nested_unavailable",
            Self::Compaction => "side_chat_compaction_unavailable",
            Self::Goals => "side_chat_goals_unavailable",
            Self::Subagents => "side_chat_subagents_unavailable",
            Self::Delegation => "side_chat_delegation_unavailable",
            Self::Wakeups => "side_chat_wakeups_unavailable",
            Self::Catalog => "side_chat_catalog_unavailable",
        }
    }

    pub(super) fn error(self) -> Error {
        problem(ErrorKind::Unsupported, self.code())
    }
}

/// The result of opening a side chat.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SideChatView {
    pub side_chat_id: SessionId,
    pub parent_session_id: SessionId,
    /// The parent's committed history the side chat was forked from.
    pub source_context: HistoryBasis,
    /// The parent's model context had been compacted. The side chat still
    /// starts from the parent's complete committed transcript.
    pub compacted: bool,
    /// Parent material the portable fork leaves out.
    pub omissions: SeedOmissions,
    pub temporary: bool,
}

/// How a snapshot presents a side session.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SideSnapshot {
    parent_session_id: SessionId,
    temporary: bool,
    unavailable: [Refusal; 8],
}

/// The side-chat presentation of a session, when it is one.
pub(crate) fn side_snapshot(view: &SessionView) -> Result<Option<SideSnapshot>> {
    Ok(session_configuration(view)?.side.map(|side| SideSnapshot {
        parent_session_id: side.parent,
        temporary: true,
        unavailable: Refusal::ALL,
    }))
}

impl Host {
    /// The parent of a side session, or `None` for any other session.
    pub(crate) async fn side_parent(&self, session: &SessionId) -> Result<Option<SessionId>> {
        let view = self.store.inspect(session.clone()).await?;
        Ok(session_configuration(&view)?.side.map(|side| side.parent))
    }

    /// Refuse `refusal` for a side session. Other sessions, and sessions that
    /// cannot be read, are left to the caller's own checks.
    pub(super) async fn refuse_in_side_chat(
        &self,
        session: &SessionId,
        refusal: Refusal,
    ) -> Result<()> {
        match self.side_parent(session).await {
            Ok(Some(_)) => Err(refusal.error()),
            _ => Ok(()),
        }
    }

    /// Fork `parent`'s committed history into a new temporary side session
    /// under the parent's execution.
    async fn open_side_chat(&self, parent: SessionId) -> Result<SideChatView> {
        self.owned_control(move |host| async move {
            if host.work.lock().await.closed {
                return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
            }
            let execution = host.execution()?;
            let source = host.store.inspect(parent.clone()).await?;
            host.check_execution(&source)?;
            let configuration = session_configuration(&source)?;
            if configuration.side.is_some() {
                return Err(Refusal::SideChat.error());
            }
            if configuration.subagent.is_some() {
                return Err(problem(ErrorKind::Unavailable, "session_missing"));
            }
            let side = SessionId::new(format!("side/{}", uuid::Uuid::new_v4().simple()))?;
            let create = CreateSession {
                id: side.clone(),
                request: change_id()?,
                configuration: encode(
                    SESSION_SCHEMA,
                    SESSION_VERSION,
                    &SessionConfiguration {
                        cwd: canonical_workspace(&configuration.cwd)?,
                        execution: execution.configuration,
                        owner: execution.owner,
                        subagent: None,
                        side: Some(SideSession {
                            parent: parent.clone(),
                        }),
                    },
                )?,
            };
            let mut attempt = 0;
            let basis = loop {
                let history = host
                    .store
                    .retained_history_with(parent.clone(), HistorySelection::Current, project)
                    .await?;
                let basis = history.basis.clone();
                let Some(anchor) = history::latest_anchor(&history) else {
                    host.store.create(create.clone()).await?;
                    break basis;
                };
                let cut = ConversationCut::Through(anchor);
                let request = SeededSession {
                    create: create.clone(),
                    source: parent.clone(),
                    expected_history: basis.clone(),
                    intent: Fingerprint::of(&cut)?,
                };
                let source = parent.clone();
                match host
                    .store
                    .create_seeded(request, project, move |history| {
                        history::lower_seed(source, cut, history)
                    })
                    .await
                {
                    Ok(_) => break basis,
                    Err(error)
                        if error.code == "history_basis_changed" && attempt + 1 < OPEN_ATTEMPTS =>
                    {
                        attempt += 1;
                    }
                    Err(error) => return Err(error),
                }
            };
            let compacted = host
                .store
                .context_history_with(parent.clone(), None, project)
                .await?
                .seed
                .map(|seed| grida_agent_master::compaction::replacement_coverage(&seed.provenance))
                .transpose()?
                .flatten()
                .is_some();
            let omissions = history::decode_seed(
                host.store
                    .retained_history_with(side.clone(), HistorySelection::Current, project)
                    .await?
                    .seed,
            )?
            .map(|seed| seed.provenance().omissions())
            .unwrap_or_default();
            Ok(SideChatView {
                side_chat_id: side,
                parent_session_id: parent,
                source_context: basis,
                compacted,
                omissions,
                temporary: true,
            })
        })
        .await
    }

    /// Stop a side session's work and processes, then remove its data.
    /// Unconfirmed cleanup leaves it fenced for the next sweep.
    pub(crate) async fn discard_side_chat(&self, session: &SessionId) -> Result<()> {
        if self.side_parent(session).await?.is_none() {
            return Err(problem(ErrorKind::Unavailable, "session_missing"));
        }
        {
            let mut work = self.work.lock().await;
            work.retiring.insert(session.clone());
            work.ready.retain(|ready| ready.session() != session);
        }
        let result = self.stop_and_purge(session).await;
        if result.is_ok() {
            self.work.lock().await.retiring.remove(session);
            self.processes.release(session);
        }
        result
    }

    async fn stop_and_purge(&self, session: &SessionId) -> Result<()> {
        let deadline = tokio::time::Instant::now() + DISCARD_WAIT;
        loop {
            let released = self.changed.notified();
            tokio::pin!(released);
            released.as_mut().enable();
            // A worker admitted before the fence may still claim a turn, so
            // cancel whatever turn is current until no worker remains.
            if let Some(current) = self.store.inspect(session.clone()).await?.current {
                // A turn that settles meanwhile needs no cancellation.
                let _ = self
                    .cancel(session.clone(), current.binding.turn.clone())
                    .await;
            }
            if !self.work.lock().await.active.contains_key(session) {
                break;
            }
            if tokio::time::timeout_at(deadline, released).await.is_err() {
                return Err(problem(ErrorKind::Uncertain, "side_chat_discard_pending"));
            }
        }
        self.processes.retire(session, deadline.into_std()).await?;
        self.purge_side_chat(session.clone()).await
    }

    /// Remove an idle side session's records and reclaim its private data.
    async fn purge_side_chat(&self, session: SessionId) -> Result<()> {
        let state_dir = self.state_dir.clone().filter(|_| self.deletion_available());
        let cleanup = match state_dir {
            Some(state_dir) => {
                let owner = session.clone();
                tokio::task::spawn_blocking(move || {
                    retained_inputs::RetainedInputs::retirement_identity(&state_dir, &owner)
                })
                .await
                .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))??
            }
            None => None,
        };
        self.store
            .discard(session.clone(), scope()?, cleanup)
            .await?;
        let spending = self.spending.clone();
        let owner = session.clone();
        tokio::task::spawn_blocking(move || spending.retire(&owner))
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "side_chat_discard_pending"))??;
        if let Some(identity) = cleanup {
            self.cleanup_retired(session, identity).await?;
        }
        Ok(())
    }

    /// Every side session in the store.
    async fn side_sessions(&self) -> Result<Vec<(SessionId, SideSession)>> {
        let scope = scope()?;
        let mut sessions = Vec::new();
        let mut after = None;
        loop {
            let page = self
                .store
                .list_catalog_configurations(scope, 0, after)
                .await?;
            for (id, configuration) in page.entries {
                if let Some(side) = decode_session_configuration(&configuration)?.side {
                    sessions.push((id, side));
                }
            }
            match page.next_after {
                Some(next) => after = Some(next),
                None => return Ok(sessions),
            }
        }
    }

    /// Discard the side chats forked from `parent`, returning those removed.
    pub(super) async fn discard_side_chats_of(&self, parent: &SessionId) -> Vec<SessionId> {
        let mut discarded = Vec::new();
        let Ok(sessions) = self.side_sessions().await else {
            eprintln!("grida-agent: side chat cleanup is pending");
            return discarded;
        };
        for (id, side) in sessions {
            if &side.parent != parent {
                continue;
            }
            match self.discard_side_chat(&id).await {
                Ok(()) => discarded.push(id),
                Err(_) => eprintln!("grida-agent: side chat cleanup is pending"),
            }
        }
        discarded
    }

    /// Shut the host down, then discard every side chat. Side chats exist
    /// only on the private connection being closed, and no side turn runs
    /// after shutdown. A side chat whose cleanup cannot be confirmed now is
    /// discarded by the sweep the next host runs before serving.
    pub(crate) async fn shutdown_discarding_side_chats(&self) -> Result<()> {
        let shutdown = self.shutdown().await;
        let swept = self.sweep_side_chats().await;
        shutdown.and(swept)
    }

    /// Remove every side session left in the store. A host runs this before
    /// serving and after shutdown, when no side turn can be running.
    pub(crate) async fn sweep_side_chats(&self) -> Result<()> {
        let mut result = Ok(());
        for (id, _) in self.side_sessions().await? {
            let purged = self.purge_side_chat(id).await;
            if result.is_ok() {
                result = purged;
            }
        }
        result
    }
}

/// The side chats one private connection opened. Closing the connection
/// discards them through the host's sweep.
#[derive(Default)]
pub(crate) struct SideChats {
    state: Mutex<SideChatState>,
}

#[derive(Default)]
struct SideChatState {
    closed: bool,
    /// Open side chats and their parents.
    open: BTreeMap<SessionId, SessionId>,
}

impl SideChats {
    pub(crate) async fn open(&self, host: &Host, parent: SessionId) -> Result<SideChatView> {
        let mut state = self.state.lock().await;
        if state.closed {
            return Err(problem(ErrorKind::Unavailable, "side_chat_scope_closed"));
        }
        if state.open.len() >= MAX_OPEN_CHATS {
            return Err(problem(ErrorKind::LimitExceeded, "side_chat_scope_limit"));
        }
        let view = host.open_side_chat(parent).await?;
        state
            .open
            .insert(view.side_chat_id.clone(), view.parent_session_id.clone());
        Ok(view)
    }

    pub(crate) async fn owns(&self, id: &SessionId) -> bool {
        self.state.lock().await.open.contains_key(id)
    }

    /// Discard a side chat this connection opened. A failed discard leaves it
    /// open here, so the client can retry.
    pub(crate) async fn close(&self, host: &Host, id: &SessionId) -> Result<()> {
        let mut state = self.state.lock().await;
        if !state.open.contains_key(id) {
            return Err(missing());
        }
        let host = host.clone();
        let owner = id.clone();
        let result = host
            .owned_control(move |host| async move { host.discard_side_chat(&owner).await })
            .await;
        if result.is_ok()
            || result
                .as_ref()
                .is_err_and(|error| error.code == "session_missing")
        {
            state.open.remove(id);
        }
        result
    }

    /// Forget the side chats of a deleted parent, returning them.
    pub(crate) async fn forget_parent(&self, parent: &SessionId) -> Vec<SessionId> {
        let mut state = self.state.lock().await;
        let removed: Vec<_> = state
            .open
            .iter()
            .filter(|(_, owner)| *owner == parent)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &removed {
            state.open.remove(id);
        }
        removed
    }

    /// Refuse further opens once the connection is closing.
    pub(crate) async fn close_scope(&self) {
        self.state.lock().await.closed = true;
    }
}

fn missing() -> Error {
    problem(ErrorKind::Unavailable, "side_chat_unavailable")
}
