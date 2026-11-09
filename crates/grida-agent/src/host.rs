//! Product composition and ownership for native agent turns.

use crate::configuration::{Configuration, ConfigurationInspection, ConfigurationSnapshot};
use crate::http::{HttpTransport, ProviderOptions};
use agent_kit_core::authority::{AuthorityRequest, AuthorityValidator, GrantSelection};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{Modality, ModelCapabilities, Provider};
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
use agent_kit_core::tools::Inventory;
use agent_kit_core::turn::{CommitReceipt, ControlDirective, ControlRevision, TurnOutcome};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, MessageId, Result,
    SchemaId, SessionId, TurnId,
};
use agent_kit_providers::{ModelProfile, OpenAiCompatible, OutputLimitField, StreamLimits};
use agent_kit_runtime::{
    AdmissionContext, ExecutionLimits, ExecutionServices, Runtime, ToolAdmission, ToolDecision,
    ToolGate, TurnUpdate,
};
use agent_kit_sessions::{
    Acceptance, ClaimOutcome, ClaimRequest, ControlReceipt, ControlRequest, CreateSession,
    InputDisposition, SessionControl, SessionRevision, SessionStore, SessionView, Submission,
    TurnDisposition, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent_master::configuration::SettingChange;
use grida_agent_master::{Master, MasterAuthority, MasterConfig, MasterOutcome};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Notify, broadcast, oneshot};
use tokio::task::AbortHandle;

const SESSION_SCHEMA: &str = "grida.agent.native.session";
const INPUT_SCHEMA: &str = "grida.agent.native.input";
const MAX_PROMPT_BYTES: usize = 512 * 1024;
const MAX_PROMPT_PARTS: usize = 64;
const MAX_ACTIVE_RUNS: usize = 8;
const UPDATE_CAPACITY: usize = 128;
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(8);
const MODEL_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone)]
pub struct Host {
    store: Arc<SqliteStore>,
    execution: Option<Arc<Execution>>,
    configuration: Option<Arc<Configuration>>,
    configuration_admission: Arc<Mutex<()>>,
    work: Arc<Mutex<Work>>,
    changed: Arc<Notify>,
}

struct Execution {
    configuration: Fingerprint,
    runtime: Runtime,
    config: MasterConfig,
    provider: Arc<dyn Provider>,
    authority: MasterAuthority,
}

#[derive(Default)]
struct Work {
    closed: bool,
    unverified: bool,
    active: BTreeMap<SessionId, Active>,
}

struct Active {
    turn: TurnId,
    admitted: bool,
    handle: AbortHandle,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum PromptPart {
    Text {
        text: String,
    },
    ResourceLink {
        name: String,
        uri: String,
        mime_type: Option<String>,
    },
}

#[derive(Clone)]
pub struct PromptRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub parts: Vec<PromptPart>,
}

pub struct AcceptedRun {
    pub session: SessionId,
    pub turn: TurnId,
    pub input: ChangeId,
    pub position: u64,
    pub updates: broadcast::Receiver<TurnUpdate>,
    pub completion: oneshot::Receiver<Result<RunResult>>,
}

#[derive(Clone, Debug)]
pub struct DurableSubmission {
    pub session: SessionId,
    pub input: ChangeId,
    pub position: u64,
    pub disposition: InputDisposition,
}

#[derive(Serialize, Deserialize)]
struct StoredPrompt {
    parts: Vec<PromptPart>,
    configuration: ConfigurationSnapshot,
}

#[derive(Debug, Serialize)]
#[serde(tag = "disposition", content = "outcome", rename_all = "snake_case")]
pub enum RunResult {
    Settled(TurnOutcome),
    Suspended,
}

pub struct SessionSnapshot {
    pub messages: Vec<Message>,
}

#[derive(Serialize, Deserialize)]
struct SessionConfiguration {
    cwd: PathBuf,
    execution: Fingerprint,
}

impl Host {
    pub fn open(state_dir: &Path, provider: Option<ProviderOptions>) -> Result<Self> {
        let database = state_dir.join("runtime.sqlite");
        if provider.is_some() {
            prepare_state_dir(state_dir)?;
        } else if !database.is_file() {
            return Err(problem(ErrorKind::Unavailable, "agent_state_unavailable"));
        }
        let store = Arc::new(SqliteStore::open(database)?);
        let configuration = provider
            .as_ref()
            .map(|_| Configuration::open(state_dir))
            .transpose()?
            .map(Arc::new);
        let execution = provider.map(Execution::new).transpose()?.map(Arc::new);
        Ok(Self {
            store,
            execution,
            configuration,
            configuration_admission: Arc::default(),
            work: Arc::default(),
            changed: Arc::default(),
        })
    }

    pub async fn new_session(&self, cwd: PathBuf) -> Result<SessionId> {
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let execution = self.execution()?;
        let configuration = SessionConfiguration {
            cwd: canonical_workspace(&cwd)?,
            execution: execution.configuration,
        };
        let session = SessionId::new(uuid())?;
        self.store
            .create(CreateSession {
                id: session.clone(),
                request: change_id()?,
                configuration: encode(SESSION_SCHEMA, 1, &configuration)?,
            })
            .await?;
        Ok(session)
    }

    pub async fn load_session(&self, id: SessionId, cwd: PathBuf) -> Result<SessionSnapshot> {
        let session = self.store.inspect(id.clone()).await?;
        if session_configuration(&session)?.cwd != canonical_workspace(&cwd)? {
            return Err(problem(ErrorKind::Conflict, "session_workspace_mismatch"));
        }
        Ok(SessionSnapshot {
            messages: self.history(id, None).await?,
        })
    }

    pub async fn inspect(&self, id: SessionId) -> Result<SessionView> {
        self.store.inspect(id).await
    }

    pub async fn start_prompt(&self, request: PromptRequest) -> Result<AcceptedRun> {
        self.execution()?;
        let PromptRequest { id, session, parts } = request;
        let input = prompt_input(&id, &parts)?;
        let turn = TurnId::new(uuid())?;
        let (admission_tx, admission) = oneshot::channel();
        let (updates_tx, updates) = broadcast::channel(UPDATE_CAPACITY);
        let (completion_tx, completion) = oneshot::channel();
        {
            let mut work = self.work.lock().await;
            if work.closed {
                return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
            }
            if work.active.len() >= MAX_ACTIVE_RUNS {
                return Err(problem(ErrorKind::LimitExceeded, "active_run_limit"));
            }
            if work.active.contains_key(&session) {
                return Err(problem(ErrorKind::Conflict, "session_prompt_in_progress"));
            }
            let host = self.clone();
            let worker_session = session.clone();
            let worker_turn = turn.clone();
            let worker_input = id.clone();
            let handle = tokio::spawn(async move {
                // The first admission check acquires the same lock that records
                // this worker. No durable submission precedes host ownership.
                let prepared = host
                    .admit(&worker_session, &worker_turn, worker_input, parts)
                    .await;
                let (master, opened, acceptance) = match prepared {
                    Ok(run) => run,
                    Err(error) => {
                        host.finish_work(&worker_session, error.kind == ErrorKind::Uncertain)
                            .await;
                        let _ = admission_tx.send(Err(error));
                        return;
                    }
                };
                let _ = admission_tx.send(Ok(acceptance));
                let result = drive(host.store.clone(), master, opened, input, updates_tx).await;
                host.finish_work(&worker_session, result.is_err()).await;
                let _ = completion_tx.send(result);
            });
            work.active.insert(
                session.clone(),
                Active {
                    turn: turn.clone(),
                    admitted: false,
                    handle: handle.abort_handle(),
                },
            );
        }
        // Dropping the requesting client only detaches this receiver. The
        // registered worker keeps ownership through claim and settlement.
        let acceptance = admission
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "admission_worker_interrupted"))??;
        Ok(AcceptedRun {
            session,
            turn,
            input: id,
            position: acceptance.position,
            updates,
            completion,
        })
    }

    async fn admit(
        &self,
        session: &SessionId,
        turn: &TurnId,
        id: ChangeId,
        parts: Vec<PromptPart>,
    ) -> Result<(Master, agent_kit_runtime::OpenedTurn, Acceptance)> {
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let execution = self.execution()?;
        let view = self.store.inspect(session.clone()).await?;
        if session_configuration(&view)?.execution != execution.configuration {
            return Err(problem(
                ErrorKind::Conflict,
                "session_execution_configuration_changed",
            ));
        }
        if view.admission_paused {
            return Err(problem(ErrorKind::InvalidState, "session_admission_paused"));
        }
        if view.current.is_some() {
            return Err(problem(
                ErrorKind::InvalidState,
                "session_turn_requires_recovery",
            ));
        }
        let history = self.history(session.clone(), None).await?;
        // Serialize settings activation with the commit that captures them.
        let configuration_admission = self.configuration_admission.lock().await;
        let configuration = self.with_configuration(Configuration::snapshot).await?;
        let input_limit = configuration.defaults.context.max_input_tokens;
        let master = Master::new(
            execution.config.clone(),
            execution.provider.clone(),
            Inventory::new().snapshot(&[])?,
            execution.authority.clone(),
        )?
        .with_history(history)
        .with_input_limit(input_limit);
        let acceptance = self
            .store
            .submit(
                session.clone(),
                Submission {
                    id: id.clone(),
                    payload: encode(
                        INPUT_SCHEMA,
                        2,
                        &StoredPrompt {
                            parts,
                            configuration,
                        },
                    )?,
                },
            )
            .await?;
        drop(configuration_admission);
        let view = self.store.inspect(session.clone()).await?;
        let claim = self
            .store
            .claim(ClaimRequest {
                id: change_id()?,
                session: session.clone(),
                expected_revision: view.revision,
                selection: TurnSelection::New {
                    turn: turn.clone(),
                    inputs: vec![id],
                },
            })
            .await?;
        let ClaimOutcome::Acquired(claim) = claim else {
            return Err(problem(ErrorKind::Conflict, "session_turn_already_claimed"));
        };
        let opened = execution
            .runtime
            .open(claim.lease)
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "admitted_turn_open_failed"))?;
        let closing = {
            let mut work = self.work.lock().await;
            let active = work
                .active
                .get_mut(session)
                .expect("registered admission worker");
            active.admitted = true;
            work.closed
        };
        if closing {
            // A concurrent shutdown may have observed this worker before its
            // lease existed. Apply the pause before entering the master.
            control(
                &self.store,
                session.clone(),
                turn.clone(),
                ControlDirective::Pause,
            )
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "admitted_turn_pause_failed"))?;
        }
        Ok((master, opened, acceptance))
    }

    async fn finish_work(&self, session: &SessionId, unverified: bool) {
        {
            let mut work = self.work.lock().await;
            work.unverified |= unverified;
            work.active.remove(session);
        }
        self.changed.notify_waiters();
    }

    pub async fn submit_prompt(&self, request: PromptRequest) -> Result<DurableSubmission> {
        prompt_input(&request.id, &request.parts)?;
        if let Some(accepted) = self.existing_submission(&request).await? {
            return Ok(accepted);
        }
        match self.start_prompt(request.clone()).await {
            Ok(run) => Ok(DurableSubmission {
                session: run.session,
                input: run.input,
                position: run.position,
                disposition: InputDisposition::Claimed { turn: run.turn },
            }),
            // An acceptance may have committed before the claim or response
            // failed. Re-read its identity and leave unclaimed input queued.
            Err(error) => self.existing_submission(&request).await?.ok_or(error),
        }
    }

    async fn existing_submission(
        &self,
        request: &PromptRequest,
    ) -> Result<Option<DurableSubmission>> {
        let Some(view) = self
            .store
            .input(request.session.clone(), request.id.clone())
            .await?
        else {
            return Ok(None);
        };
        let stored = &view.input.payload;
        if stored.schema().as_str() != INPUT_SCHEMA {
            return Err(problem(
                ErrorKind::Unsupported,
                "unsupported_submission_schema",
            ));
        }
        let same_input = match stored.version() {
            1 => {
                let previous: Vec<Message> = serde_json::from_slice(stored.bytes())
                    .map_err(|_| problem(ErrorKind::InvalidState, "invalid_submission"))?;
                let current = prompt_input(&request.id, &request.parts)?;
                previous.len() == 1 && previous[0].content == current[0].content
            }
            2 => {
                let previous: StoredPrompt = serde_json::from_slice(stored.bytes())
                    .map_err(|_| problem(ErrorKind::InvalidState, "invalid_submission"))?;
                previous.parts == request.parts
            }
            _ => {
                return Err(problem(
                    ErrorKind::Unsupported,
                    "unsupported_submission_schema",
                ));
            }
        };
        if !same_input {
            return Err(problem(ErrorKind::Conflict, "submission_input_changed"));
        }
        Ok(Some(DurableSubmission {
            session: request.session.clone(),
            input: request.id.clone(),
            position: view.position,
            disposition: view.disposition,
        }))
    }

    pub async fn stop(
        &self,
        session: SessionId,
        turn: TurnId,
        request: ChangeId,
        expected_session: SessionRevision,
        expected_control: ControlRevision,
    ) -> Result<ControlReceipt> {
        self.store
            .control(ControlRequest {
                id: request,
                session,
                expected_revision: expected_session,
                action: SessionControl::PauseAndCancel {
                    turn,
                    expected: expected_control,
                },
            })
            .await
    }

    pub async fn configuration_inspect(&self) -> Result<ConfigurationInspection> {
        self.with_configuration(Configuration::inspect).await
    }

    pub async fn configuration_update(
        &self,
        expected: Option<Fingerprint>,
        change: SettingChange,
    ) -> Result<ConfigurationSnapshot> {
        let admission = self.configuration_admission.clone().lock_owned().await;
        self.with_configuration(move |configuration| {
            let _admission = admission;
            configuration.update(expected, change)
        })
        .await
    }

    pub async fn configuration_reload(
        &self,
        expected: Option<Fingerprint>,
    ) -> Result<ConfigurationSnapshot> {
        let admission = self.configuration_admission.clone().lock_owned().await;
        self.with_configuration(move |configuration| {
            let _admission = admission;
            configuration.reload(expected)
        })
        .await
    }

    async fn with_configuration<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&Configuration) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let configuration = self
            .configuration
            .clone()
            .ok_or_else(|| problem(ErrorKind::Unavailable, "configuration_unavailable"))?;
        tokio::task::spawn_blocking(move || operation(&configuration))
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "configuration_worker_interrupted"))?
    }

    pub async fn cancel(&self, session: SessionId, turn: TurnId) -> Result<()> {
        control(&self.store, session, turn, ControlDirective::Cancel).await
    }

    pub async fn shutdown(&self) -> Result<()> {
        let deadline = tokio::time::Instant::now() + SHUTDOWN_TIMEOUT;
        let active = {
            let mut work = tokio::time::timeout_at(deadline, self.work.lock())
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "host_shutdown_timeout"))?;
            work.closed = true;
            work.active
                .iter()
                .map(|(session, run)| {
                    (
                        session.clone(),
                        run.turn.clone(),
                        run.admitted,
                        run.handle.clone(),
                    )
                })
                .collect::<Vec<_>>()
        };
        let result = tokio::time::timeout_at(deadline, async {
            for (session, turn, admitted, _) in &active {
                if *admitted {
                    control(
                        &self.store,
                        session.clone(),
                        turn.clone(),
                        ControlDirective::Pause,
                    )
                    .await?;
                }
            }
            loop {
                // notify_waiters wakes an existing Notified before its first poll.
                let changed = self.changed.notified();
                {
                    let work = self.work.lock().await;
                    if work.active.is_empty() {
                        return if work.unverified {
                            Err(problem(ErrorKind::Uncertain, "host_turn_unverified"))
                        } else {
                            Ok(())
                        };
                    }
                }
                changed.await;
            }
        })
        .await;
        match result {
            Ok(Ok(())) => Ok(()),
            Ok(Err(error)) if error.kind == ErrorKind::Uncertain => Err(error),
            failure => {
                for (_, _, _, handle) in &active {
                    handle.abort();
                }
                let code = if failure.is_err() {
                    "host_shutdown_timeout"
                } else {
                    "host_shutdown_unverified"
                };
                Err(problem(ErrorKind::Uncertain, code))
            }
        }
    }

    fn execution(&self) -> Result<&Execution> {
        self.execution
            .as_deref()
            .ok_or_else(|| problem(ErrorKind::Unavailable, "provider_configuration_required"))
    }

    async fn history(
        &self,
        session: SessionId,
        before_turn: Option<TurnId>,
    ) -> Result<Vec<Message>> {
        Ok(self
            .store
            .history(session, before_turn)
            .await?
            .into_iter()
            .map(|HistoryRecord::Message(message)| message)
            .collect())
    }
}

impl Execution {
    fn new(options: ProviderOptions) -> Result<Self> {
        let configuration = Fingerprint::of(&options)?;
        let transport = Arc::new(HttpTransport::new(&options)?);
        let binding = transport.binding().clone();
        let profile = ModelProfile {
            capabilities: ModelCapabilities {
                revision: BindingId::new("openai-compatible-text-v1")?,
                input_modalities: [Modality::Text].into_iter().collect(),
                json_tools: false,
                text_tools: false,
                max_output_tokens: None,
            },
            output_limit: OutputLimitField::CompletionTokens,
            include_usage: true,
        };
        let provider: Arc<dyn Provider> = Arc::new(OpenAiCompatible::new(
            binding.clone(),
            BTreeMap::from([(options.model.clone(), profile)]),
            transport.clone(),
            StreamLimits {
                max_request_bytes: 1024 * 1024,
                max_response_bytes: 4 * 1024 * 1024,
                max_event_bytes: 256 * 1024,
                max_tool_calls: 8,
                max_tool_argument_bytes: 64 * 1024,
            },
        )?);
        let inference = GrantSelection {
            authority: binding.authority,
            grants: Vec::new(),
        };
        let runtime = Runtime::new(ExecutionServices {
            providers: BTreeMap::from([(binding.provider, provider.clone())]),
            tools: Inventory::new().snapshot(&[])?,
            authority: Arc::new(InferenceAuthority {
                inference: inference.clone(),
                transport,
            }),
            gate: Arc::new(NoTools),
            limits: ExecutionLimits {
                max_operations: 8,
                max_concurrent_inferences: MAX_ACTIVE_RUNS,
                max_concurrent_tools: 1,
                max_output_bytes: 512 * 1024,
                operation_timeout: MODEL_TIMEOUT,
                observer_capacity: UPDATE_CAPACITY,
            },
        })?;
        Ok(Self {
            configuration,
            runtime,
            config: MasterConfig {
                model: options.model,
                instructions: "You are Grida Agent, a helpful assistant.".into(),
                max_steps: 1,
                max_output_tokens: options.max_output_tokens,
            },
            provider,
            authority: MasterAuthority {
                inference,
                tools: BTreeMap::new(),
            },
        })
    }
}

struct InferenceAuthority {
    inference: GrantSelection,
    transport: Arc<HttpTransport>,
}

impl AuthorityValidator for InferenceAuthority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            if request.selection != self.inference {
                return Err(problem(
                    ErrorKind::Unavailable,
                    "provider_authority_unavailable",
                ));
            }
            self.transport.validate_credential()
        })
    }
}

struct NoTools;

impl ToolGate for NoTools {
    fn decide(&self, _: ToolAdmission, _: AdmissionContext) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async {
            Err(problem(
                ErrorKind::Unsupported,
                "tool_execution_unavailable",
            ))
        })
    }
}

async fn drive(
    store: Arc<SqliteStore>,
    master: Master,
    opened: agent_kit_runtime::OpenedTurn,
    input: Vec<Message>,
    updates: broadcast::Sender<TurnUpdate>,
) -> Result<RunResult> {
    let agent_kit_runtime::OpenedTurn { turn, mut observer } = opened;
    let binding = observer.snapshot().state.binding().clone();
    let run = master.run(turn, input);
    tokio::pin!(run);
    let mut observer_open = true;
    let outcome = loop {
        tokio::select! {
            outcome = &mut run => break outcome,
            update = observer.next(), if observer_open => match update {
                Some(update) => { let _ = updates.send(update); }
                None => observer_open = false,
            }
        }
    };
    // The turn controller releases its publishers on return. Forward their
    // buffered updates before publishing the terminal result to the client.
    if observer_open {
        while let Some(update) = observer.next().await {
            let _ = updates.send(update);
        }
    }
    match outcome? {
        MasterOutcome::Settled(receipt) => {
            if receipt.record.binding != binding {
                return Err(problem(
                    ErrorKind::Conflict,
                    "driver_receipt_binding_mismatch",
                ));
            }
            let outcome = receipt.outcome.clone();
            store.verify(CommitReceipt::Settled(receipt)).await?;
            Ok(RunResult::Settled(outcome))
        }
        MasterOutcome::Suspended(receipt) => {
            if receipt.record.binding != binding {
                return Err(problem(
                    ErrorKind::Conflict,
                    "driver_receipt_binding_mismatch",
                ));
            }
            store.verify(CommitReceipt::Suspended(receipt)).await?;
            Ok(RunResult::Suspended)
        }
    }
}

async fn control(
    store: &SqliteStore,
    session: SessionId,
    turn: TurnId,
    directive: ControlDirective,
) -> Result<()> {
    for _ in 0..4 {
        let session_view = store.inspect(session.clone()).await?;
        let turn_view = store.inspect_turn(session.clone(), turn.clone()).await?;
        if matches!(turn_view.disposition, TurnDisposition::Settled)
            || (directive == ControlDirective::Cancel && turn_view.controls.cancelled)
            || (directive == ControlDirective::Pause && turn_view.controls.paused)
        {
            return Ok(());
        }
        if session_view
            .current
            .as_ref()
            .map(|current| &current.binding.turn)
            != Some(&turn)
        {
            return Err(problem(ErrorKind::Conflict, "control_turn_changed"));
        }
        let result = store
            .control(agent_kit_sessions::ControlRequest {
                id: change_id()?,
                session: session.clone(),
                expected_revision: session_view.revision,
                action: SessionControl::Turn {
                    turn: turn.clone(),
                    expected: turn_view.controls.revision,
                    directive,
                },
            })
            .await;
        match result {
            Ok(_) => return Ok(()),
            Err(error) if error.kind == ErrorKind::Conflict => continue,
            Err(error) => return Err(error),
        }
    }
    Err(problem(ErrorKind::Conflict, "control_revision_changed"))
}

fn prompt_input(id: &ChangeId, parts: &[PromptPart]) -> Result<Vec<Message>> {
    if parts.is_empty() || parts.len() > MAX_PROMPT_PARTS {
        return Err(problem(ErrorKind::InvalidInput, "invalid_prompt_parts"));
    }
    let bytes = serde_json::to_vec(parts)
        .map_err(|_| problem(ErrorKind::InvalidInput, "prompt_encoding_failed"))?;
    if bytes.len() > MAX_PROMPT_BYTES {
        return Err(problem(ErrorKind::LimitExceeded, "prompt_too_large"));
    }
    let content = parts
        .iter()
        .map(|part| match part {
            PromptPart::Text { text } => Content::Text(text.clone()),
            reference @ PromptPart::ResourceLink { .. } => {
                // A reference is context supplied by the user. It is neither
                // imported nor granted filesystem or network authority here.
                Content::Text(serde_json::to_string(reference).expect("serializable reference"))
            }
        })
        .collect();
    Ok(vec![Message {
        id: MessageId::new(format!(
            "input/{:x}",
            uuid::Uuid::from_bytes(
                Fingerprint::of(id)?.bytes()[..16]
                    .try_into()
                    .expect("fingerprint prefix"),
            )
        ))?,
        role: Role::User,
        phase: None,
        content,
        provenance: Provenance {
            source: "native-client".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    }])
}

fn session_configuration(view: &SessionView) -> Result<SessionConfiguration> {
    let config = &view.configuration;
    if config.schema().as_str() != SESSION_SCHEMA || config.version() != 1 {
        return Err(problem(
            ErrorKind::Unsupported,
            "unsupported_session_configuration",
        ));
    }
    serde_json::from_slice(config.bytes())
        .map_err(|_| problem(ErrorKind::InvalidState, "invalid_session_configuration"))
}

fn canonical_workspace(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() {
        return Err(problem(
            ErrorKind::InvalidInput,
            "workspace_must_be_absolute",
        ));
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| problem(ErrorKind::Unavailable, "workspace_unavailable"))?;
    if !canonical.is_dir() {
        return Err(problem(
            ErrorKind::InvalidInput,
            "workspace_must_be_directory",
        ));
    }
    Ok(canonical)
}

fn prepare_state_dir(path: &Path) -> Result<()> {
    let mut directory = std::fs::DirBuilder::new();
    directory.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        directory.mode(0o700);
    }
    directory
        .create(path)
        .map_err(|_| problem(ErrorKind::Unavailable, "state_directory_unavailable"))
}

fn encode(schema: &str, version: u32, value: &(impl Serialize + ?Sized)) -> Result<Envelope> {
    Envelope::new(
        SchemaId::new(schema)?,
        version,
        serde_json::to_vec(value)
            .map_err(|_| problem(ErrorKind::InvalidInput, "host_record_encoding_failed"))?,
    )
}

pub fn change_id() -> Result<ChangeId> {
    ChangeId::new(uuid())
}

fn uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}
