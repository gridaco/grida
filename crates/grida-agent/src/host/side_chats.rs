//! GRIDA-SEC-004 — Temporary side chats.
//!
//! A side chat is an ordinary session forked from a parent chat's committed
//! history. It runs on the same engine, under the same execution, tools and
//! permission rules as the parent, and differs only by policy:
//!
//! - every side turn runs under [`grida_agent_master::side_chat`]'s policy and
//!   sees its history boundary between the inherited history (or the summary
//!   that replaced it) and its own turns;
//! - the inherited history is model context only: the session's transcript,
//!   history and revision targets begin at the boundary;
//! - operations listed in [`Refusal`] are refused where the host admits them;
//! - the session lives outside every workspace catalog and is discarded with
//!   its data when closed, when its parent is deleted, when its connection
//!   closes, or by the sweep a host runs before serving. Its generated title
//!   lives and ends with it, and reaches clients through its snapshot.

use super::*;
use agent_kit_store_sqlite::history::{HistoryBasis, HistorySelection, SeededSession};
use grida_agent_master::conversation_seed::{ConversationCut, SeedOmissions};
use grida_agent_master::history::project;

/// Side chats one parent chat may have open at once.
const MAX_OPEN_PER_PARENT: usize = 8;
/// Side chats one connection may hold open at once, across its parents.
const MAX_OPEN_PER_CONNECTION: usize = 32;
/// How long discarding a side chat waits for its running turn to stop.
const DISCARD_WAIT: Duration = Duration::from_secs(8);
/// Attempts to capture a parent whose committed history keeps moving.
const OPEN_ATTEMPTS: usize = 3;

/// The parent a temporary side session was forked from.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct SideSession {
    pub(super) parent: SessionId,
    #[serde(
        default,
        skip_serializing_if = "crate::permissions::PermissionMode::is_restricted"
    )]
    pub(super) permission_mode: crate::permissions::PermissionMode,
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
    /// Whether the side chat's inherited execution accepts image inputs.
    pub image_input: bool,
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
    /// The side chat's current title, including an accepted provisional label.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    title_generation_pending: bool,
}

impl Host {
    /// The side-chat presentation of a session, when it is one.
    pub(crate) async fn side_snapshot(&self, view: &SessionView) -> Result<Option<SideSnapshot>> {
        let Some(side) = session_configuration(view)?.side else {
            return Ok(None);
        };
        let (entry, title_generation_pending) = self
            .read_with_title_state(
                &view.session,
                self.store.catalog_entry(view.session.clone()),
            )
            .await?;
        Ok(Some(SideSnapshot {
            parent_session_id: side.parent,
            temporary: true,
            unavailable: Refusal::ALL,
            title: entry.label,
            title_generation_pending,
        }))
    }

    /// The parent of a side session, or `None` for any other session.
    pub(crate) async fn side_parent(&self, session: &SessionId) -> Result<Option<SessionId>> {
        let configuration = self.store.configuration(session.clone()).await?;
        Ok(decode_session_configuration(&configuration)?
            .side
            .map(|side| side.parent))
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
            let (host, revision) = host.for_derived_session(&parent).await?;
            // Deleting the parent holds this admission from its idle check
            // until its data is gone, then discards the side chats it can
            // list. Opening under the same admission either completes first,
            // so that discard finds this side chat, or finds no parent.
            let _admission = host.configuration_admission.lock().await;
            {
                let work = host.work.lock().await;
                if work.closed {
                    return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
                }
                if work.retiring.contains(&parent) {
                    return Err(problem(ErrorKind::Conflict, "session_deletion_in_progress"));
                }
            }
            let execution = host.execution()?;
            let source = host.store.inspect(parent.clone()).await?;
            if let Some(revision) = revision {
                host.selection_at_revision(&source, revision)?;
            }
            host.check_new_submission(&source).await?;
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
                        inherited_route: host.selected_route.clone(),
                        cwd: canonical_workspace(&configuration.cwd)?,
                        execution: execution.configuration,
                        owner: execution.owner,
                        subagent: None,
                        worker: None,
                        side: Some(SideSession {
                            parent: parent.clone(),
                            permission_mode: host.selected_permission_mode(&source)?,
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
                let Some(anchor) = history::latest_anchor(&history, 0) else {
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
                image_input: host.accepts_images(),
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
        self.activity_order.retire(&session)?;
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
    /// Open side chats by id.
    open: BTreeMap<SessionId, OpenSideChat>,
}

/// A side chat this connection holds, and the client request that opened it.
struct OpenSideChat {
    request: Option<ChangeId>,
    view: SideChatView,
}

impl SideChatState {
    fn opened_by(&self, request: &ChangeId) -> Option<&SideChatView> {
        self.open
            .values()
            .find(|side| side.request.as_ref() == Some(request))
            .map(|side| &side.view)
    }
}

impl SideChats {
    /// Open a side chat of `parent`. `admit` runs before a new side chat is
    /// created and `attach` once it exists, both while no other open, close
    /// or parent deletion of this connection can interleave.
    ///
    /// A client request id makes opening idempotent while the side chat it
    /// opened stays open: the same id returns that side chat instead of
    /// opening another, so a client that lost the reply learns which side chat
    /// to close.
    pub(crate) async fn open(
        &self,
        host: &Host,
        parent: SessionId,
        request: Option<ChangeId>,
        admit: impl FnOnce() -> Result<()>,
        attach: impl FnOnce(&SideChatView),
    ) -> Result<SideChatView> {
        let mut state = self.state.lock().await;
        if state.closed {
            return Err(problem(ErrorKind::Unavailable, "side_chat_scope_closed"));
        }
        if let Some(view) = request.as_ref().and_then(|id| state.opened_by(id)) {
            if view.parent_session_id != parent {
                return Err(problem(ErrorKind::Conflict, "side_chat_request_conflict"));
            }
            let view = view.clone();
            attach(&view);
            return Ok(view);
        }
        if state
            .open
            .values()
            .filter(|side| side.view.parent_session_id == parent)
            .count()
            >= MAX_OPEN_PER_PARENT
        {
            return Err(problem(ErrorKind::LimitExceeded, "side_chat_parent_limit"));
        }
        if state.open.len() >= MAX_OPEN_PER_CONNECTION {
            return Err(problem(ErrorKind::LimitExceeded, "side_chat_scope_limit"));
        }
        admit()?;
        let view = host.open_side_chat(parent).await?;
        attach(&view);
        state.open.insert(
            view.side_chat_id.clone(),
            OpenSideChat {
                request,
                view: view.clone(),
            },
        );
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
            .filter(|(_, side)| side.view.parent_session_id == *parent)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn opening_waits_out_a_parent_deletion_and_finds_no_parent() {
        let root = tempfile::tempdir().unwrap();
        let host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:9/v1".into(),
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new("fixture").unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap();
        // A parent without history is forked by a plain create.
        let parent = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();

        // Deletion holds the admission and fences its family before it
        // removes the parent and lists the side chats to discard.
        let deletion = host.configuration_admission.lock().await;
        let opening = tokio::spawn({
            let host = host.clone();
            let parent = parent.clone();
            async move { host.open_side_chat(parent).await }
        });
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(
            !opening.is_finished(),
            "opened during the parent's deletion"
        );
        host.work.lock().await.retiring.insert(parent.clone());
        drop(deletion);

        let refused = opening.await.unwrap().unwrap_err();
        assert_eq!(refused.code, "session_deletion_in_progress");
        assert!(host.side_sessions().await.unwrap().is_empty());
        host.work.lock().await.retiring.remove(&parent);
        host.shutdown().await.unwrap();
    }
}
