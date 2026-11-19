//! GRIDA-SEC-004 / GRIDA-SEC-014 — private product chat selection, not execution state.

use super::*;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};

const SCHEMA: &str = "grida.agent.chat-selection";
const MAX_BYTES: u64 = 128 * 1024;
const MAX_RECEIPTS: usize = 64;
const MAX_RECONCILE: usize = 4096;

/// The visible product effort. The execution harness and model reasoning remain
/// independent captures; saving this choice does not reconfigure either one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectionEffort {
    Low,
    #[serde(alias = "standard")]
    Medium,
    High,
    Xhigh,
    Ultra,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatSelection {
    pub connection_id: Option<String>,
    pub model: ModelId,
    pub effort: SelectionEffort,
}

impl ChatSelection {
    fn validate(&self) -> Result<()> {
        if self.connection_id.as_ref().is_some_and(|id| {
            id.len() != 64
                || !id
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        }) || self.model.as_str().len() > 256
        {
            return Err(problem(ErrorKind::InvalidInput, "chat_selection_invalid"));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectionSnapshot {
    pub session_id: SessionId,
    pub revision: u64,
    pub selection: Option<ChatSelection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub legacy: Option<LegacySelection>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LegacySelection {
    pub model: ModelId,
    pub effort: SelectionEffort,
    pub principal: Option<PrincipalId>,
    pub scope: Option<ScopeId>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub matches_current: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectionReceipt {
    pub session_id: SessionId,
    pub operation_id: ChangeId,
    pub revision: u64,
    pub selection: ChatSelection,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum SelectionOutcome {
    Missing,
    Committed { receipt: SelectionReceipt },
    Retired { receipt: SelectionReceipt },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectionUpdate {
    pub cwd: PathBuf,
    pub session_id: SessionId,
    pub expected_revision: u64,
    pub operation_id: ChangeId,
    pub selection: ChatSelection,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ledger {
    schema: String,
    version: u32,
    session_id: SessionId,
    cwd: PathBuf,
    retired: bool,
    head: SelectionReceipt,
    /// Bounded outstanding coordination receipts outlive newer selection heads.
    pending: BTreeMap<ChangeId, Pending>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Pending {
    expected_revision: u64,
    receipt: SelectionReceipt,
}

/// A fork captures inheritance before SQLite creation. Keeping its immutable
/// intent also makes an interrupted exact fork retry independent of later
/// source or destination setting edits.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ForkInitialization {
    schema: String,
    version: u32,
    source: SessionId,
    session_id: SessionId,
    request_id: ChangeId,
    cwd: PathBuf,
    basis: Fingerprint,
    selection: Option<ChatSelection>,
    published: bool,
}

/// The SQLite handle retains exclusive process ownership. All operations run
/// under the host's existing configuration-admission gate, also used by new
/// input acceptance, fork creation and retirement. No second writer is opened.
struct SelectionStore {
    directory: PathBuf,
    _owner: Arc<SqliteStore>,
}

impl SelectionStore {
    fn new(host: &Host) -> Result<Self> {
        Ok(Self {
            directory: host
                .state_dir
                .as_ref()
                .ok_or_else(unavailable)?
                .join("chat-selections"),
            _owner: host.store.clone(),
        })
    }

    fn path(&self, session: &SessionId) -> Result<PathBuf> {
        let digest = Fingerprint::of(&(SCHEMA, session))?;
        let name: String = digest.bytes().iter().map(|b| format!("{b:02x}")).collect();
        Ok(self.directory.join(format!("{name}.json")))
    }

    fn fork_path(&self, session: &SessionId) -> Result<PathBuf> {
        let path = self.path(session)?;
        Ok(self.directory.join(format!(
            "fork-{}",
            path.file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(unavailable)?
        )))
    }

    fn fork(&self, session: &SessionId) -> Result<Option<ForkInitialization>> {
        if !private_directory(&self.directory, false)? {
            return Ok(None);
        }
        let Some(bytes) = read_private(&self.fork_path(session)?)? else {
            return Ok(None);
        };
        let intent: ForkInitialization =
            serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
        if intent.schema != "grida.agent.chat-selection.fork"
            || intent.version != 1
            || &intent.session_id != session
            || !intent.cwd.is_absolute()
        {
            return Err(unavailable());
        }
        if let Some(selection) = &intent.selection {
            selection.validate().map_err(|_| unavailable())?;
        }
        Ok(Some(intent))
    }

    fn write_fork(&self, intent: &ForkInitialization) -> Result<()> {
        write_private(
            &self.fork_path(&intent.session_id)?,
            &serde_json::to_vec(intent).map_err(|_| unavailable())?,
        )
    }

    fn read(&self, session: &SessionId) -> Result<Option<Ledger>> {
        if !private_directory(&self.directory, false)? {
            return Ok(None);
        }
        let path = self.path(session)?;
        let Some(bytes) = read_private(&path)? else {
            return Ok(None);
        };
        let ledger: Ledger = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
        ledger.validate(session)?;
        Ok(Some(ledger))
    }

    fn write(&self, ledger: &Ledger) -> Result<()> {
        ledger.validate(&ledger.session_id)?;
        private_directory(&self.directory, true)?;
        let path = self.path(&ledger.session_id)?;
        let bytes = serde_json::to_vec(ledger).map_err(|_| unavailable())?;
        write_private(&path, &bytes)
    }

    fn sync(&self) -> Result<()> {
        File::open(&self.directory)
            .and_then(|file| file.sync_all())
            .map_err(|_| unavailable())
    }

    fn remove(&self, session: &SessionId) -> Result<()> {
        let path = self.path(session)?;
        private_file(&std::fs::symlink_metadata(&path).map_err(|_| unavailable())?)?;
        std::fs::remove_file(path).map_err(|_| unavailable())?;
        self.sync()
    }
}

impl Ledger {
    fn validate(&self, session: &SessionId) -> Result<()> {
        if self.schema != SCHEMA
            || self.version != 1
            || &self.session_id != session
            || self.head.session_id != *session
            || self.head.revision == 0
            || !self.cwd.is_absolute()
            || self.pending.len() > MAX_RECEIPTS
        {
            return Err(unavailable());
        }
        self.head.selection.validate().map_err(|_| unavailable())?;
        let mut revisions = BTreeSet::new();
        for (operation, pending) in &self.pending {
            if pending.receipt.session_id != *session
                || &pending.receipt.operation_id != operation
                || pending.receipt.revision == 0
                || pending.expected_revision.checked_add(1) != Some(pending.receipt.revision)
                || pending.receipt.revision > self.head.revision
                || !revisions.insert(pending.receipt.revision)
                || (pending.receipt.revision == self.head.revision && pending.receipt != self.head)
            {
                return Err(unavailable());
            }
            pending
                .receipt
                .selection
                .validate()
                .map_err(|_| unavailable())?;
        }
        Ok(())
    }

    fn require_scope(&self, cwd: &Path) -> Result<()> {
        if self.cwd != cwd {
            return Err(problem(ErrorKind::Conflict, "session_workspace_mismatch"));
        }
        Ok(())
    }
}

impl Host {
    async fn selection_scope(&self, session: &SessionId, cwd: &Path) -> Result<PathBuf> {
        let cwd = canonical_workspace(cwd)?;
        let view = self.store.inspect(session.clone()).await?;
        let configuration = session_configuration(&view)?;
        if configuration.subagent.is_some() || configuration.side.is_some() {
            return Err(problem(ErrorKind::Unavailable, "session_missing"));
        }
        if configuration.cwd != cwd {
            return Err(problem(ErrorKind::Conflict, "session_workspace_mismatch"));
        }
        Ok(cwd)
    }

    pub async fn chat_selection(
        &self,
        cwd: PathBuf,
        session: SessionId,
    ) -> Result<SelectionSnapshot> {
        let _admission = self.configuration_admission.lock().await;
        let cwd = self.selection_scope(&session, &cwd).await?;
        let store = SelectionStore::new(self)?;
        if let Some(ledger) = store.read(&session)? {
            ledger.require_scope(&cwd)?;
            if ledger.retired {
                return Err(problem(ErrorKind::Unavailable, "session_missing"));
            }
            return Ok(SelectionSnapshot {
                session_id: session,
                revision: ledger.head.revision,
                selection: Some(ledger.head.selection),
                legacy: None,
            });
        }
        let view = self.store.inspect(session.clone()).await?;
        let legacy = self.legacy_selection(&view).await?;
        Ok(SelectionSnapshot {
            session_id: session,
            revision: 0,
            selection: None,
            legacy,
        })
    }

    async fn legacy_selection(&self, view: &SessionView) -> Result<Option<LegacySelection>> {
        let mut inputs = view.queued.clone();
        if let Some(latest) = &view.latest {
            for input in self
                .store
                .turn_submissions(view.session.clone(), latest.binding.turn.clone())
                .await?
            {
                if let Some(found) = self.store.input(view.session.clone(), input.id).await? {
                    inputs.push(found);
                }
            }
        }
        inputs.sort_by_key(|input| input.position);
        for input in inputs.into_iter().rev() {
            if !is_stored_input(&input.input.payload) {
                continue;
            }
            let stored: StoredPrompt = decode_input(&input.input)?;
            if stored.subagent.is_some() {
                continue;
            }
            let Some(model) = stored.model else {
                continue;
            };
            let effort = if stored
                .effort
                .as_ref()
                .is_some_and(|effort| effort.preset() == EffortPreset::Ultra)
            {
                SelectionEffort::Ultra
            } else {
                match stored.reasoning {
                    Some(agent_kit_core::inference::ReasoningEffort::Low) => SelectionEffort::Low,
                    Some(agent_kit_core::inference::ReasoningEffort::High) => SelectionEffort::High,
                    Some(agent_kit_core::inference::ReasoningEffort::XHigh) => {
                        SelectionEffort::Xhigh
                    }
                    _ => SelectionEffort::Medium,
                }
            };
            return Ok(Some(LegacySelection {
                matches_current: self.execution.as_ref().is_some_and(|execution| {
                    model == execution.config.model
                        && stored.authority.as_ref().is_some_and(|authority| {
                            authority.principal == execution.authority.inference.authority.principal
                                && authority.scope == execution.authority.inference.authority.scope
                        })
                }),
                model,
                effort,
                principal: stored.authority.as_ref().map(|a| a.principal.clone()),
                scope: stored.authority.map(|a| a.scope),
            }));
        }
        Ok(None)
    }

    pub async fn update_chat_selection(
        &self,
        request: SelectionUpdate,
    ) -> Result<SelectionReceipt> {
        let _admission = self.configuration_admission.lock().await;
        self.update_chat_selection_locked(request).await
    }

    async fn update_chat_selection_locked(
        &self,
        request: SelectionUpdate,
    ) -> Result<SelectionReceipt> {
        request.selection.validate()?;
        let cwd = self
            .selection_scope(&request.session_id, &request.cwd)
            .await?;
        let store = SelectionStore::new(self)?;
        let mut ledger = store.read(&request.session_id)?;
        if let Some(existing) = &ledger {
            existing.require_scope(&cwd)?;
            if existing.retired {
                return Err(problem(ErrorKind::Unavailable, "session_missing"));
            }
            if let Some(pending) = existing.pending.get(&request.operation_id) {
                if pending.expected_revision == request.expected_revision
                    && pending.receipt.selection == request.selection
                {
                    return Ok(pending.receipt.clone());
                }
                return Err(problem(
                    ErrorKind::Conflict,
                    "chat_selection_operation_reused",
                ));
            }
            if existing.head.operation_id == request.operation_id {
                if request.expected_revision.checked_add(1) == Some(existing.head.revision)
                    && existing.head.selection == request.selection
                {
                    return Ok(existing.head.clone());
                }
                return Err(problem(
                    ErrorKind::Conflict,
                    "chat_selection_operation_reused",
                ));
            }
            if existing.pending.len() >= MAX_RECEIPTS {
                return Err(problem(
                    ErrorKind::Unavailable,
                    "chat_selection_receipt_limit",
                ));
            }
        }
        let current = ledger.as_ref().map_or(0, |l| l.head.revision);
        if request.expected_revision != current {
            return Err(problem(
                ErrorKind::Conflict,
                "chat_selection_revision_changed",
            ));
        }
        let receipt = SelectionReceipt {
            session_id: request.session_id.clone(),
            operation_id: request.operation_id.clone(),
            revision: current.checked_add(1).ok_or_else(unavailable)?,
            selection: request.selection,
        };
        let ledger = ledger.get_or_insert_with(|| Ledger {
            schema: SCHEMA.into(),
            version: 1,
            session_id: request.session_id,
            cwd,
            retired: false,
            head: receipt.clone(),
            pending: BTreeMap::new(),
        });
        ledger.head = receipt.clone();
        ledger.pending.insert(
            receipt.operation_id.clone(),
            Pending {
                expected_revision: current,
                receipt: receipt.clone(),
            },
        );
        store.write(ledger)?;
        Ok(receipt)
    }

    pub async fn chat_selection_receipt(
        &self,
        cwd: PathBuf,
        session: SessionId,
        operation: ChangeId,
    ) -> Result<SelectionOutcome> {
        let _admission = self.configuration_admission.lock().await;
        let cwd = canonical_workspace(&cwd)?;
        let store = SelectionStore::new(self)?;
        let Some(mut ledger) = store.read(&session)? else {
            self.selection_scope(&session, &cwd).await?;
            return Ok(SelectionOutcome::Missing);
        };
        ledger.require_scope(&cwd)?;
        match self.store.inspect(session).await {
            Ok(_) => {}
            Err(error) if error.code == "session_missing" => {
                ledger.retired = true;
                store.write(&ledger)?;
            }
            Err(error) => return Err(error),
        }
        let receipt = ledger
            .pending
            .get(&operation)
            .map(|p| p.receipt.clone())
            .or_else(|| (ledger.head.operation_id == operation).then(|| ledger.head.clone()));
        Ok(match receipt {
            Some(receipt) if ledger.retired => SelectionOutcome::Retired { receipt },
            Some(receipt) => SelectionOutcome::Committed { receipt },
            None => SelectionOutcome::Missing,
        })
    }

    pub async fn acknowledge_chat_selection(
        &self,
        cwd: PathBuf,
        session: SessionId,
        operation: ChangeId,
    ) -> Result<()> {
        let _admission = self.configuration_admission.lock().await;
        let cwd = canonical_workspace(&cwd)?;
        let store = SelectionStore::new(self)?;
        let Some(mut ledger) = store.read(&session)? else {
            return Ok(());
        };
        ledger.require_scope(&cwd)?;
        ledger.pending.remove(&operation);
        if ledger.retired && ledger.pending.is_empty() {
            store.remove(&session)
        } else {
            store.write(&ledger)
        }
    }

    /// Create from a durable Desktop draft identity. The same session/request
    /// pair is reused after a lost reply; no first input is submitted here.
    pub async fn create_chat_with_selection(
        &self,
        cwd: PathBuf,
        session: SessionId,
        request: ChangeId,
        selection: ChatSelection,
    ) -> Result<SelectionReceipt> {
        let _admission = self.configuration_admission.lock().await;
        selection.validate()?;
        let cwd = canonical_workspace(&cwd)?;
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let configuration = match self.store.inspect(session.clone()).await {
            Ok(view) => {
                self.selection_scope(&session, &cwd).await?;
                view.configuration
            }
            Err(error) if error.code == "session_missing" => {
                if SelectionStore::new(self)?.read(&session)?.is_some() {
                    return Err(problem(ErrorKind::Conflict, "chat_selection_retired"));
                }
                let execution = self.execution()?;
                encode(
                    SESSION_SCHEMA,
                    SESSION_VERSION,
                    &SessionConfiguration {
                        inherited_route: None,
                        cwd: cwd.clone(),
                        execution: execution.configuration,
                        owner: execution.owner,
                        subagent: None,
                        worker: None,
                        side: None,
                    },
                )?
            }
            Err(error) => return Err(error),
        };
        self.store
            .create(CreateSession {
                id: session.clone(),
                request: request.clone(),
                configuration,
            })
            .await?;
        self.update_chat_selection_locked(SelectionUpdate {
            cwd,
            session_id: session,
            expected_revision: 0,
            operation_id: request,
            selection,
        })
        .await
    }

    /// Called with admission held, before the database retires the chat.
    pub(super) fn validate_chat_selection_retirement(&self, session: &SessionId) -> Result<()> {
        let store = SelectionStore::new(self)?;
        store.read(session)?;
        store.fork(session).map(|_| ())
    }

    pub(super) fn retire_chat_selection(&self, session: &SessionId) -> Result<()> {
        let store = SelectionStore::new(self)?;
        if store.fork(session)?.is_some() {
            std::fs::remove_file(store.fork_path(session)?).map_err(|_| unavailable())?;
            store.sync()?;
        }
        let Some(mut ledger) = store.read(session)? else {
            return Ok(());
        };
        if ledger.pending.is_empty() {
            return store.remove(session);
        }
        ledger.retired = true;
        store.write(&ledger)
    }

    pub(super) async fn reconcile_chat_selections(&self) -> Result<()> {
        let _admission = self.configuration_admission.lock().await;
        let store = SelectionStore::new(self)?;
        if !private_directory(&store.directory, false)? {
            return Ok(());
        }
        let mut count = 0;
        for entry in std::fs::read_dir(&store.directory).map_err(|_| unavailable())? {
            count += 1;
            if count > MAX_RECONCILE {
                return Err(unavailable());
            }
            let path = entry.map_err(|_| unavailable())?.path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(unavailable)?;
            if let Some(suffix) = name.strip_prefix(".chat-selection-stage-") {
                if suffix.len() != 6 || !suffix.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
                    return Err(unavailable());
                }
                private_file(&std::fs::symlink_metadata(&path).map_err(|_| unavailable())?)?;
                std::fs::remove_file(path).map_err(|_| unavailable())?;
                store.sync()?;
                continue;
            }
            if name.starts_with("fork-") {
                let bytes = read_private(&path)?.ok_or_else(unavailable)?;
                let intent: ForkInitialization =
                    serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
                let checked = store.fork(&intent.session_id)?.ok_or_else(unavailable)?;
                if store.fork_path(&checked.session_id)? != path {
                    return Err(unavailable());
                }
                if checked.published {
                    match self.store.inspect(checked.session_id.clone()).await {
                        Ok(_) => {}
                        Err(error) if error.code == "session_missing" => {
                            self.retire_chat_selection(&checked.session_id)?
                        }
                        Err(error) => return Err(error),
                    }
                }
                continue;
            }
            if name.len() != 69 || !name.ends_with(".json") {
                return Err(unavailable());
            }
            // Reconciliation reads only bounded private files and checks their
            // embedded identity against the derived path before any mutation.
            private_file(&std::fs::symlink_metadata(&path).map_err(|_| unavailable())?)?;
            let bytes = read_private(&path)?.ok_or_else(unavailable)?;
            let ledger: Ledger = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
            ledger.validate(&ledger.session_id)?;
            if store.path(&ledger.session_id)? != path {
                return Err(unavailable());
            }
            match self.store.inspect(ledger.session_id.clone()).await {
                Ok(_) => {}
                Err(error) if error.code == "session_missing" => {
                    self.retire_chat_selection(&ledger.session_id)?
                }
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }

    pub(super) async fn prepare_fork_selection(
        &self,
        source: &SessionId,
        destination: &SessionId,
        request: &ChangeId,
        basis: Fingerprint,
    ) -> Result<(Option<ChatSelection>, bool)> {
        let store = SelectionStore::new(self)?;
        let view = self.store.inspect(source.clone()).await?;
        let cwd = session_configuration(&view)?.cwd;
        if let Some(intent) = store.fork(destination)? {
            if intent.source != *source
                || intent.request_id != *request
                || intent.basis != basis
                || intent.cwd != cwd
            {
                return Err(problem(
                    ErrorKind::Conflict,
                    "chat_selection_fork_identity_reused",
                ));
            }
            return Ok((intent.selection, true));
        }
        // Already-created forks without our inheritance intent predate this
        // contract. Preserve the seed request fingerprint they were born with.
        match self.store.inspect(destination.clone()).await {
            Ok(_) => return Ok((None, false)),
            Err(error) if error.code == "session_missing" => {}
            Err(error) => return Err(error),
        }
        let selection = match store.read(source)? {
            Some(ledger) => {
                ledger.require_scope(&cwd)?;
                if ledger.retired {
                    return Err(unavailable());
                }
                Some(ledger.head.selection)
            }
            None => None,
        };
        store.write_fork(&ForkInitialization {
            schema: "grida.agent.chat-selection.fork".into(),
            version: 1,
            source: source.clone(),
            session_id: destination.clone(),
            request_id: request.clone(),
            cwd,
            basis,
            selection: selection.clone(),
            published: false,
        })?;
        Ok((selection, true))
    }

    pub(super) async fn finish_fork_selection(&self, destination: &SessionId) -> Result<()> {
        let store = SelectionStore::new(self)?;
        let Some(mut intent) = store.fork(destination)? else {
            return Ok(());
        };
        if intent.published {
            return Ok(());
        }
        if let Some(selection) = intent.selection.clone() {
            let receipt = self
                .update_chat_selection_locked(SelectionUpdate {
                    cwd: intent.cwd.clone(),
                    session_id: destination.clone(),
                    expected_revision: 0,
                    operation_id: intent.request_id.clone(),
                    selection,
                })
                .await?;
            // This initialization is wholly native; no application-default
            // update is involved, so no Main coordination receipt is needed.
            let mut ledger = store.read(destination)?.ok_or_else(unavailable)?;
            ledger.pending.remove(&receipt.operation_id);
            store.write(&ledger)?;
        }
        intent.published = true;
        store.write_fork(&intent)
    }

    pub(super) fn selected_provider(
        &self,
        session: &SessionView,
        revision: u64,
    ) -> Result<ChatSelection> {
        self.selection_at_revision(session, revision)?
            .ok_or_else(|| problem(ErrorKind::Conflict, "chat_selection_revision_changed"))
    }

    pub(super) fn selection_at_revision(
        &self,
        session: &SessionView,
        revision: u64,
    ) -> Result<Option<ChatSelection>> {
        match SelectionStore::new(self)?.read(&session.session)? {
            None if revision == 0 => Ok(None),
            Some(ledger) if !ledger.retired && ledger.head.revision == revision => {
                ledger.require_scope(&session_configuration(session)?.cwd)?;
                Ok(Some(ledger.head.selection))
            }
            _ => Err(problem(
                ErrorKind::Conflict,
                "chat_selection_revision_changed",
            )),
        }
    }

    pub(super) fn capture_chat_selection(
        &self,
        session: &SessionView,
        expected: Option<u64>,
        effort: Option<&EffortPolicy>,
        reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
        goal: bool,
    ) -> Result<Option<SelectionSnapshot>> {
        let Some(revision) = expected else {
            return Ok(None);
        };
        let selection = self.selected_provider(session, revision)?;
        let execution = self.execution()?;
        if selection.model != execution.config.model {
            return Err(problem(ErrorKind::Conflict, "chat_selection_route_changed"));
        }
        let ultra = effort.is_some_and(|effort| effort.preset() == EffortPreset::Ultra);
        if ultra != (selection.effort == SelectionEffort::Ultra) {
            return Err(problem(
                ErrorKind::Conflict,
                "chat_selection_effort_changed",
            ));
        }
        if !goal {
            use agent_kit_core::inference::ReasoningEffort;
            let expected_reasoning = match selection.effort {
                SelectionEffort::Low => ReasoningEffort::Low,
                SelectionEffort::Medium => ReasoningEffort::Medium,
                SelectionEffort::High => ReasoningEffort::High,
                SelectionEffort::Xhigh | SelectionEffort::Ultra => ReasoningEffort::XHigh,
            };
            // An omitted ordinary level means the product's Medium default;
            // Ultra may let its configured harness choose the reasoning level.
            if reasoning.map_or(
                !matches!(
                    selection.effort,
                    SelectionEffort::Medium | SelectionEffort::Ultra
                ),
                |level| level != expected_reasoning,
            ) {
                return Err(problem(
                    ErrorKind::Conflict,
                    "chat_selection_effort_changed",
                ));
            }
        }
        Ok(Some(SelectionSnapshot {
            session_id: session.session.clone(),
            revision,
            selection: Some(selection),
            legacy: None,
        }))
    }
}

fn private_directory(path: &Path, create: bool) -> Result<bool> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        if let Err(error) = std::fs::symlink_metadata(path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(unavailable());
            }
            if !create {
                return Ok(false);
            }
            use std::os::unix::fs::DirBuilderExt;
            std::fs::DirBuilder::new()
                .mode(0o700)
                .create(path)
                .map_err(|_| unavailable())?;
            File::open(path.parent().ok_or_else(unavailable)?)
                .and_then(|file| file.sync_all())
                .map_err(|_| unavailable())?;
        }
        crate::scratch::check_private_directory(path)?;
        Ok(true)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (path, create);
        Err(unavailable())
    }
}

fn private_file(metadata: &std::fs::Metadata) -> Result<()> {
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_BYTES {
        return Err(unavailable());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() & 0o077 != 0
            || metadata.nlink() != 1
            || metadata.uid() != rustix::process::geteuid().as_raw()
        {
            return Err(unavailable());
        }
    }
    Ok(())
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "chat_selection_storage_unavailable")
}

fn read_private(path: &Path) -> Result<Option<Vec<u8>>> {
    let before = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(unavailable()),
    };
    private_file(&before)?;
    grida_auth::refuse_granting_acl(path).map_err(|_| unavailable())?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(path).map_err(|_| unavailable())?;
    let opened = file.metadata().map_err(|_| unavailable())?;
    private_file(&opened)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != opened.dev() || before.ino() != opened.ino() {
            return Err(unavailable());
        }
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unavailable())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(unavailable());
    }
    Ok(Some(bytes))
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    if bytes.len() as u64 > MAX_BYTES {
        return Err(unavailable());
    }
    let parent = path.parent().ok_or_else(unavailable)?;
    private_directory(parent, true)?;
    match std::fs::symlink_metadata(path) {
        Ok(metadata) => private_file(&metadata)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(unavailable()),
    }
    let mut stage = tempfile::Builder::new()
        .prefix(".chat-selection-stage-")
        .tempfile_in(parent)
        .map_err(|_| unavailable())?;
    stage
        .write_all(bytes)
        .and_then(|_| stage.as_file().sync_all())
        .map_err(|_| unavailable())?;
    stage.persist(path).map_err(|_| unavailable())?;
    File::open(parent)
        .and_then(|file| file.sync_all())
        .map_err(|_| unavailable())
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;

    fn host(path: &Path) -> Host {
        Host::open(
            path,
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:9/v1".into(),
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new("fixture").unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: false,
            }),
        )
        .unwrap()
    }

    fn pair(model: &str, effort: SelectionEffort) -> ChatSelection {
        ChatSelection {
            connection_id: Some("a".repeat(64)),
            model: ModelId::new(model).unwrap(),
            effort,
        }
    }

    fn update(
        cwd: &Path,
        session: &SessionId,
        revision: u64,
        operation: &str,
        selection: ChatSelection,
    ) -> SelectionUpdate {
        SelectionUpdate {
            cwd: cwd.to_owned(),
            session_id: session.clone(),
            expected_revision: revision,
            operation_id: ChangeId::new(operation).unwrap(),
            selection,
        }
    }

    #[tokio::test]
    async fn unsent_settings_are_per_chat_durable_and_do_not_rewrite_execution_or_schema() {
        let root = tempfile::tempdir().unwrap();
        let state = root.path().join("state");
        let host = host(&state);
        let cwd = root.path().canonicalize().unwrap();
        let a = host.new_session(cwd.clone()).await.unwrap();
        let b = host.new_session(cwd.clone()).await.unwrap();
        let before_a = host.inspect(a.clone()).await.unwrap();
        let before_b = host.inspect(b.clone()).await.unwrap();
        assert_eq!(
            host.chat_selection(cwd.clone(), a.clone())
                .await
                .unwrap()
                .revision,
            0
        );
        let a_pair = pair("model-a", SelectionEffort::Low);
        let b_pair = pair("model-b", SelectionEffort::High);
        host.attach_routes(Default::default()).unwrap();
        let (_, revision) = host.for_derived_session(&a).await.unwrap();
        let revision = revision.expect("routed derivation must recheck the first selection");
        assert_eq!(
            host.selection_at_revision(&before_a, revision).unwrap(),
            None
        );
        host.update_chat_selection(update(&cwd, &a, 0, "select-a", a_pair.clone()))
            .await
            .unwrap();
        assert_eq!(
            host.selection_at_revision(&before_a, revision)
                .unwrap_err()
                .code,
            "chat_selection_revision_changed"
        );
        host.update_chat_selection(update(&cwd, &b, 0, "select-b", b_pair.clone()))
            .await
            .unwrap();
        assert_eq!(host.inspect(a.clone()).await.unwrap(), before_a);
        assert_eq!(host.inspect(b.clone()).await.unwrap(), before_b);
        assert_eq!(host.workers.load(Ordering::Relaxed), 0);
        drop(host);
        let reopened = Host::open(&state, None).unwrap();
        assert_eq!(
            reopened
                .chat_selection(cwd.clone(), a.clone())
                .await
                .unwrap()
                .selection,
            Some(a_pair)
        );
        assert_eq!(
            reopened.chat_selection(cwd, b).await.unwrap().selection,
            Some(b_pair)
        );
        assert_eq!(reopened.inspect(a).await.unwrap(), before_a);
    }

    #[tokio::test]
    async fn stale_edits_conflict_while_lost_reply_receipts_outlive_newer_edits() {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        let first = update(
            &cwd,
            &session,
            0,
            "first",
            pair("fixture", SelectionEffort::Low),
        );
        let receipt = host.update_chat_selection(first.clone()).await.unwrap();
        host.update_chat_selection(update(
            &cwd,
            &session,
            1,
            "second",
            pair("other", SelectionEffort::Medium),
        ))
        .await
        .unwrap();
        assert_eq!(
            host.update_chat_selection(first.clone()).await.unwrap(),
            receipt
        );
        assert!(
            matches!(host.chat_selection_receipt(cwd.clone(), session.clone(), first.operation_id.clone()).await.unwrap(), SelectionOutcome::Committed { receipt: found } if found == receipt)
        );
        assert_eq!(
            host.chat_selection(cwd.clone(), session.clone())
                .await
                .unwrap()
                .selection
                .unwrap()
                .model
                .as_str(),
            "other"
        );
        host.acknowledge_chat_selection(cwd.clone(), session.clone(), first.operation_id.clone())
            .await
            .unwrap();
        assert_eq!(
            host.update_chat_selection(first).await.unwrap_err().code,
            "chat_selection_revision_changed"
        );
        assert_eq!(
            host.update_chat_selection(update(
                &cwd,
                &session,
                0,
                "stale",
                pair("fixture", SelectionEffort::High)
            ))
            .await
            .unwrap_err()
            .code,
            "chat_selection_revision_changed"
        );
        let invalid = update(
            &cwd,
            &session,
            2,
            "invalid",
            ChatSelection {
                connection_id: Some("secret".into()),
                ..pair("fixture", SelectionEffort::Low)
            },
        );
        assert_eq!(
            host.update_chat_selection(invalid).await.unwrap_err().code,
            "chat_selection_invalid"
        );
    }

    #[tokio::test]
    async fn an_acknowledged_latest_operation_still_has_an_observational_retry_receipt() {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        let request = update(
            &cwd,
            &session,
            0,
            "first",
            pair("fixture", SelectionEffort::Medium),
        );
        let receipt = host.update_chat_selection(request.clone()).await.unwrap();
        host.acknowledge_chat_selection(cwd.clone(), session.clone(), request.operation_id.clone())
            .await
            .unwrap();
        assert_eq!(
            host.update_chat_selection(request.clone()).await.unwrap(),
            receipt
        );
        assert!(
            matches!(host.chat_selection_receipt(cwd, session, request.operation_id).await.unwrap(), SelectionOutcome::Committed { receipt: found } if found == receipt)
        );
    }

    #[tokio::test]
    async fn a_duplicate_operation_with_different_intent_never_changes_the_saved_head() {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        let first = update(
            &cwd,
            &session,
            0,
            "first",
            pair("fixture", SelectionEffort::Low),
        );
        host.update_chat_selection(first.clone()).await.unwrap();
        let mut wrong = first;
        wrong.selection.effort = SelectionEffort::High;
        assert_eq!(
            host.update_chat_selection(wrong).await.unwrap_err().code,
            "chat_selection_operation_reused"
        );
        assert_eq!(
            host.chat_selection(cwd, session)
                .await
                .unwrap()
                .selection
                .unwrap()
                .effort,
            SelectionEffort::Low
        );
    }

    #[tokio::test]
    async fn create_from_a_durable_draft_identity_is_exactly_once_and_selection_only() {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = SessionId::new("durable-draft").unwrap();
        let request = ChangeId::new("create-draft").unwrap();
        let selected = pair("future-model", SelectionEffort::High);
        let first = host
            .create_chat_with_selection(
                cwd.clone(),
                session.clone(),
                request.clone(),
                selected.clone(),
            )
            .await
            .unwrap();
        assert_eq!(
            host.create_chat_with_selection(cwd.clone(), session.clone(), request, selected)
                .await
                .unwrap(),
            first
        );
        let view = host.inspect(session).await.unwrap();
        assert!(view.current.is_none() && view.latest.is_none() && view.queued.is_empty());
        assert_eq!(
            host.store.session_page(None).await.unwrap().entries.len(),
            1
        );
        let wrong = tempfile::tempdir().unwrap();
        assert_eq!(
            host.chat_selection(wrong.path().to_owned(), first.session_id)
                .await
                .unwrap_err()
                .code,
            "session_workspace_mismatch"
        );
    }

    #[tokio::test]
    async fn corrupt_future_oversized_and_aliased_records_are_preserved_and_refused() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        host.update_chat_selection(update(
            &cwd,
            &session,
            0,
            "first",
            pair("fixture", SelectionEffort::Low),
        ))
        .await
        .unwrap();
        let store = SelectionStore::new(&host).unwrap();
        let path = store.path(&session).unwrap();
        let original = std::fs::read(&path).unwrap();
        let mut future: serde_json::Value = serde_json::from_slice(&original).unwrap();
        future["version"] = 99.into();
        let future = serde_json::to_vec(&future).unwrap();
        std::fs::write(&path, &future).unwrap();
        assert!(
            host.chat_selection(cwd.clone(), session.clone())
                .await
                .is_err()
        );
        assert_eq!(std::fs::read(&path).unwrap(), future);
        std::fs::write(&path, vec![b'a'; MAX_BYTES as usize + 1]).unwrap();
        assert!(
            host.chat_selection(cwd.clone(), session.clone())
                .await
                .is_err()
        );
        std::fs::write(&path, &original).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(
            host.chat_selection(cwd.clone(), session.clone())
                .await
                .is_err()
        );
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        let alias = root.path().join("alias");
        std::fs::hard_link(&path, &alias).unwrap();
        assert!(
            host.chat_selection(cwd.clone(), session.clone())
                .await
                .is_err()
        );
        std::fs::remove_file(alias).unwrap();
        std::fs::remove_file(&path).unwrap();
        let outside = root.path().join("outside");
        std::fs::write(&outside, &original).unwrap();
        std::fs::set_permissions(&outside, std::fs::Permissions::from_mode(0o600)).unwrap();
        std::os::unix::fs::symlink(&outside, &path).unwrap();
        assert!(host.chat_selection(cwd, session).await.is_err());
        assert_eq!(std::fs::read(&outside).unwrap(), original);
    }

    #[tokio::test]
    async fn receipt_capacity_refuses_before_changing_either_head_or_outcomes() {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        for revision in 0..MAX_RECEIPTS as u64 {
            host.update_chat_selection(update(
                &cwd,
                &session,
                revision,
                &format!("op-{revision}"),
                pair("fixture", SelectionEffort::Low),
            ))
            .await
            .unwrap();
        }
        assert_eq!(
            host.update_chat_selection(update(
                &cwd,
                &session,
                MAX_RECEIPTS as u64,
                "overflow",
                pair("other", SelectionEffort::High)
            ))
            .await
            .unwrap_err()
            .code,
            "chat_selection_receipt_limit"
        );
        let snapshot = host.chat_selection(cwd, session).await.unwrap();
        assert_eq!(snapshot.revision, MAX_RECEIPTS as u64);
        assert_eq!(snapshot.selection.unwrap().model.as_str(), "fixture");
    }

    #[tokio::test]
    async fn capture_requires_the_exact_saved_revision_and_active_model_without_changing_work() {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        host.update_chat_selection(update(
            &cwd,
            &session,
            0,
            "first",
            pair("fixture", SelectionEffort::Medium),
        ))
        .await
        .unwrap();
        let view = host.inspect(session.clone()).await.unwrap();
        assert_eq!(
            host.capture_chat_selection(&view, Some(1), None, None, false)
                .unwrap()
                .unwrap()
                .revision,
            1
        );
        assert_eq!(
            host.capture_chat_selection(&view, Some(2), None, None, false)
                .unwrap_err()
                .code,
            "chat_selection_revision_changed"
        );
        host.update_chat_selection(update(
            &cwd,
            &session,
            1,
            "second",
            pair("other", SelectionEffort::Medium),
        ))
        .await
        .unwrap();
        assert_eq!(
            host.capture_chat_selection(&view, Some(2), None, None, false)
                .unwrap_err()
                .code,
            "chat_selection_route_changed"
        );
        assert!(
            host.capture_chat_selection(&view, None, None, None, false)
                .unwrap()
                .is_none()
        );
        assert_eq!(host.inspect(session).await.unwrap(), view);
    }

    #[tokio::test]
    async fn ordinary_input_binds_every_selected_effort_while_goal_reasoning_keeps_its_default() {
        use agent_kit_core::inference::ReasoningEffort;
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        host.update_chat_selection(update(
            &cwd,
            &session,
            0,
            "selected",
            pair("fixture", SelectionEffort::High),
        ))
        .await
        .unwrap();
        let before = host.inspect(session.clone()).await.unwrap();
        let request = PromptRequest {
            id: ChangeId::new("wrong-effort").unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Do not dispatch".into(),
            }],
            questions: false,
            operating_regime: None,
            effort: None,
            reasoning: Some(ReasoningEffort::Low),
        };
        let mut policy = host.submission_policy(&request, false).unwrap();
        policy.selection_revision = Some(1);
        assert_eq!(
            host.capture_input(&before, request.id, request.parts, policy)
                .await
                .unwrap_err()
                .code,
            "chat_selection_effort_changed"
        );
        assert_eq!(host.inspect(session.clone()).await.unwrap(), before);
        assert_eq!(host.workers.load(Ordering::Relaxed), 0);
        assert!(
            host.capture_chat_selection(&before, Some(1), None, Some(ReasoningEffort::High), false)
                .is_ok()
        );
        assert_eq!(
            host.capture_chat_selection(&before, Some(1), None, None, false)
                .unwrap_err()
                .code,
            "chat_selection_effort_changed"
        );
        assert!(
            host.capture_chat_selection(&before, Some(1), None, None, true)
                .is_ok()
        );
        for (revision, chosen, level) in [
            (1, SelectionEffort::Low, ReasoningEffort::Low),
            (2, SelectionEffort::Medium, ReasoningEffort::Medium),
            (3, SelectionEffort::Xhigh, ReasoningEffort::XHigh),
        ] {
            host.update_chat_selection(update(
                &cwd,
                &session,
                revision,
                &format!("select-{revision}"),
                pair("fixture", chosen),
            ))
            .await
            .unwrap();
            assert!(
                host.capture_chat_selection(&before, Some(revision + 1), None, Some(level), false)
                    .is_ok()
            );
            if chosen != SelectionEffort::Medium {
                assert!(
                    host.capture_chat_selection(&before, Some(revision + 1), None, None, false)
                        .is_err()
                );
            }
        }
    }

    #[tokio::test]
    async fn accepted_input_retry_observes_its_original_selection_after_a_new_choice() {
        let root = tempfile::tempdir().unwrap();
        let host = host(&root.path().join("state"));
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        host.update_chat_selection(update(
            &cwd,
            &session,
            0,
            "first",
            pair("fixture", SelectionEffort::Medium),
        ))
        .await
        .unwrap();
        let request = PromptRequest {
            id: ChangeId::new("accepted").unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Retained request".into(),
            }],
            questions: false,
            operating_regime: None,
            effort: None,
            reasoning: None,
        };
        {
            let _admission = host.configuration_admission.lock().await;
            let view = host.inspect(session.clone()).await.unwrap();
            let mut policy = host.submission_policy(&request, false).unwrap();
            policy.selection_revision = Some(1);
            let input = host
                .capture_input(&view, request.id.clone(), request.parts.clone(), policy)
                .await
                .unwrap();
            host.store.submit(session.clone(), input).await.unwrap();
        }
        host.update_chat_selection(update(
            &cwd,
            &session,
            1,
            "second",
            pair("different", SelectionEffort::High),
        ))
        .await
        .unwrap();
        let retry = host
            .submit_prompt_with_context(
                request.clone(),
                SubmissionContext {
                    selection_revision: Some(2),
                    ..SubmissionContext::default()
                },
            )
            .await
            .unwrap();
        assert_eq!(retry.input, request.id);
        let retained = host
            .store
            .input(session.clone(), request.id)
            .await
            .unwrap()
            .unwrap();
        let retained: StoredPrompt = decode_input(&retained.input).unwrap();
        assert_eq!(retained.selection.unwrap().revision, 1);
        assert_eq!(retained.model.unwrap().as_str(), "fixture");
        assert_eq!(host.workers.load(Ordering::Relaxed), 0);
        let snapshot = host.chat_selection(cwd, session).await.unwrap();
        assert_eq!(snapshot.selection.unwrap().model.as_str(), "different");
    }

    #[tokio::test]
    async fn legacy_route_match_requires_current_model_and_authority_and_is_absent_providerlessly()
    {
        let root = tempfile::tempdir().unwrap();
        let state = root.path().join("state");
        let active = host(&state);
        let cwd = root.path().canonicalize().unwrap();
        let session = active.new_session(cwd.clone()).await.unwrap();
        let request = PromptRequest {
            id: ChangeId::new("legacy").unwrap(),
            session: session.clone(),
            parts: vec![PromptPart::Text {
                text: "Remember this route".into(),
            }],
            questions: false,
            operating_regime: None,
            effort: None,
            reasoning: None,
        };
        let view = active.inspect(session.clone()).await.unwrap();
        let input = active
            .capture_input(
                &view,
                request.id.clone(),
                request.parts.clone(),
                active.submission_policy(&request, false).unwrap(),
            )
            .await
            .unwrap();
        active.store.submit(session.clone(), input).await.unwrap();
        assert!(
            active
                .chat_selection(cwd.clone(), session.clone())
                .await
                .unwrap()
                .legacy
                .unwrap()
                .matches_current
        );
        drop(active);
        let metadata = Host::open(&state, None).unwrap();
        assert!(
            !metadata
                .chat_selection(cwd.clone(), session.clone())
                .await
                .unwrap()
                .legacy
                .unwrap()
                .matches_current
        );
        drop(metadata);
        let other = Host::open(
            &state,
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:10/v1".into(),
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new("fixture").unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: false,
            }),
        )
        .unwrap();
        assert!(
            !other
                .chat_selection(cwd, session)
                .await
                .unwrap()
                .legacy
                .unwrap()
                .matches_current
        );
    }

    #[tokio::test]
    async fn deletion_preserves_unacknowledged_terminal_receipts_and_never_resurrects_settings() {
        let root = tempfile::tempdir().unwrap();
        let state = root.path().join("state");
        let host = host(&state);
        let cwd = root.path().canonicalize().unwrap();
        let session = host.new_session(cwd.clone()).await.unwrap();
        let request = update(
            &cwd,
            &session,
            0,
            "first",
            pair("fixture", SelectionEffort::Medium),
        );
        host.update_chat_selection(request.clone()).await.unwrap();
        let before = host.inspect(session.clone()).await.unwrap();
        let (catalog, _) = host.catalog_entry(session.clone()).await.unwrap();
        let store = SelectionStore::new(&host).unwrap();
        let path = store.path(&session).unwrap();
        let before_retirement = std::fs::read(&path).unwrap();
        host.delete_saved_chat(deletion::SavedChatDeletion {
            session: session.clone(),
            cwd: cwd.clone(),
            request: ChangeId::new("delete").unwrap(),
            expected_revision: before.revision,
            expected_catalog_revision: catalog.entry.revision,
            expected_owned_children: None,
        })
        .await
        .unwrap();
        assert!(matches!(
            host.chat_selection_receipt(cwd.clone(), session.clone(), request.operation_id.clone())
                .await
                .unwrap(),
            SelectionOutcome::Retired { .. }
        ));
        assert_eq!(
            host.update_chat_selection(request.clone())
                .await
                .unwrap_err()
                .code,
            "session_missing"
        );
        // Simulate death after database retirement but before settings cleanup.
        std::fs::write(&path, before_retirement).unwrap();
        drop(store);
        drop(host);
        let reopened = Host::open(&state, None).unwrap();
        reopened.reconcile_chat_selections().await.unwrap();
        assert!(matches!(
            reopened
                .chat_selection_receipt(cwd.clone(), session.clone(), request.operation_id.clone())
                .await
                .unwrap(),
            SelectionOutcome::Retired { .. }
        ));
        reopened
            .acknowledge_chat_selection(cwd, session.clone(), request.operation_id)
            .await
            .unwrap();
        assert!(!path.exists());
        assert_eq!(
            reopened.inspect(session).await.unwrap_err().code,
            "session_missing"
        );
    }

    #[tokio::test]
    async fn fork_inheritance_is_frozen_before_creation_and_does_not_overwrite_later_edits() {
        let root = tempfile::tempdir().unwrap();
        let state = root.path().join("state");
        let host = host(&state);
        let cwd = root.path().canonicalize().unwrap();
        let source = host.new_session(cwd.clone()).await.unwrap();
        host.update_chat_selection(update(
            &cwd,
            &source,
            0,
            "source",
            pair("fixture", SelectionEffort::Low),
        ))
        .await
        .unwrap();
        let destination = SessionId::new("fork/fixture").unwrap();
        let operation = ChangeId::new("fork").unwrap();
        let basis = Fingerprint::of(&"cut").unwrap();
        let (frozen, inheritance) = host
            .prepare_fork_selection(&source, &destination, &operation, basis)
            .await
            .unwrap();
        assert!(inheritance);
        host.update_chat_selection(update(
            &cwd,
            &source,
            1,
            "source-edit",
            pair("other", SelectionEffort::High),
        ))
        .await
        .unwrap();
        assert_eq!(
            host.prepare_fork_selection(&source, &destination, &operation, basis)
                .await
                .unwrap()
                .0,
            frozen
        );
        let configuration = host.inspect(source.clone()).await.unwrap().configuration;
        host.store
            .create(CreateSession {
                id: destination.clone(),
                request: operation.clone(),
                configuration,
            })
            .await
            .unwrap();
        host.finish_fork_selection(&destination).await.unwrap();
        assert_eq!(
            host.chat_selection(cwd.clone(), destination.clone())
                .await
                .unwrap()
                .selection,
            frozen
        );
        host.update_chat_selection(update(
            &cwd,
            &destination,
            1,
            "destination-edit",
            pair("destination", SelectionEffort::Medium),
        ))
        .await
        .unwrap();
        host.finish_fork_selection(&destination).await.unwrap();
        assert_eq!(
            host.chat_selection(cwd.clone(), destination.clone())
                .await
                .unwrap()
                .selection
                .unwrap()
                .model
                .as_str(),
            "destination"
        );
        assert_eq!(
            host.prepare_fork_selection(&source, &destination, &operation, basis)
                .await
                .unwrap()
                .0,
            frozen
        );
        drop(host);
        let reopened = Host::open(&state, None).unwrap();
        assert_eq!(
            reopened
                .prepare_fork_selection(&source, &destination, &operation, basis)
                .await
                .unwrap()
                .0,
            frozen
        );
    }
}
