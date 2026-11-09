//! Product composition and ownership for native agent turns.

mod compaction;
mod goals;
mod history;
mod lifecycle;
mod permissions;
mod questions;
mod skills;
pub use compaction::{CompactRequest, CompactionReport, CompactionStatus};
pub use goals::{GoalInspection, GoalRequest, GoalView};
pub use history::{ConversationDerivation, HistoryPage, HistoryQuery};
pub use lifecycle::{InputInspection, InputSettings, QueueEdit, TurnControl};
pub use permissions::{Approvals, PendingApproval};
pub use questions::{PendingQuestion, Questions};

use crate::configuration::{Configuration, ConfigurationInspection, ConfigurationSnapshot};
use crate::configuration_tools::ConfigurationAccess;
use crate::gg::GgConnection;
use crate::http::{CompatibleOutputLimitField, HttpTransport, ProviderOptions, ProviderProtocol};
use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::history::{HistoryPosition, HistoryRecord};
use agent_kit_core::inference::{
    Modality, ModelCapabilities, Provider, ProviderBinding, RequestControl,
};
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
use agent_kit_core::tools::Inventory;
use agent_kit_core::turn::{
    CommitReceipt, ControlDirective, ControlRevision, JournalPosition, TurnOutcome,
};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, MessageId, ModelId,
    PrincipalId, Result, SchemaId, ScopeId, SessionId, TurnId,
};
use agent_kit_providers::{
    Anthropic, Gemini, GeminiProfile, ModelProfile, OpenAiCompatible, OutputLimitField, Responses,
    ResponsesEndpoint, ResponsesProfile, StreamLimits, StreamingTransport,
};
use agent_kit_runtime::{
    AdmissionContext, ExecutionLimits, ExecutionServices, Runtime, ToolAdmission, ToolDecision,
    ToolGate, TurnUpdate,
};
use agent_kit_sessions::{
    Acceptance, ClaimOutcome, ClaimRequest, ControlReceipt, ControlRequest, CreateSession,
    InputDisposition, RecoveryRequest, SessionControl, SessionRevision, SessionStore, SessionView,
    Submission, TurnDisposition, TurnSelection, TurnView,
};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent_master::configuration::SettingChange;
use grida_agent_master::{Master, MasterAuthority, MasterConfig, MasterOutcome};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Notify, Semaphore, broadcast, oneshot};
use tokio::task::AbortHandle;

const SESSION_SCHEMA: &str = "grida.agent.native.session";
const INPUT_SCHEMA: &str = "grida.agent.native.input";
const MAX_PROMPT_BYTES: usize = 512 * 1024;
const MAX_PROMPT_PARTS: usize = 64;
const MAX_ACTIVE_RUNS: usize = 8;
const MAX_OWNED_CONTROLS: usize = 32;
const MAX_READY_SESSIONS: usize = 128;
const MAX_TURN_STEPS: u32 = 8;
const UPDATE_CAPACITY: usize = 128;
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(8);
const MODEL_TIMEOUT: Duration = Duration::from_secs(120);
const PROVIDER_LIMITS: StreamLimits = StreamLimits {
    max_request_bytes: 1024 * 1024,
    max_response_bytes: 4 * 1024 * 1024,
    max_event_bytes: 256 * 1024,
    max_tool_calls: 8,
    max_tool_argument_bytes: 64 * 1024,
};

#[derive(Clone)]
pub struct Host {
    store: Arc<SqliteStore>,
    execution: Option<Arc<Execution>>,
    gg_connection: Option<Arc<GgConnection>>,
    configuration: Option<Arc<Configuration>>,
    permissions: Option<Arc<crate::permissions::PermissionProfile>>,
    #[cfg(unix)]
    guidance_root: Option<Arc<skills::HeadlessGuidance>>,
    configuration_admission: Arc<Mutex<()>>,
    controls: Arc<Semaphore>,
    work: Arc<Mutex<Work>>,
    changed: Arc<Notify>,
}

struct Execution {
    configuration: Fingerprint,
    legacy_configuration: Fingerprint,
    runtime: Runtime,
    config: MasterConfig,
    provider: Arc<dyn Provider>,
    authority: MasterAuthority,
    authorization: Arc<ExecutionAuthority>,
    questions: Arc<questions::QuestionAccess>,
    configuration_tools: Arc<ConfigurationAccess>,
}

#[derive(Default)]
struct Work {
    closed: bool,
    unverified: bool,
    active: BTreeMap<SessionId, Active>,
    ready: VecDeque<ReadyWork>,
}

#[derive(PartialEq, Eq)]
enum ReadyWork {
    Queue(SessionId),
    Stop(SessionId, TurnId),
    Answered {
        session: SessionId,
        turn: TurnId,
        position: JournalPosition,
    },
}

impl ReadyWork {
    fn session(&self) -> &SessionId {
        match self {
            Self::Queue(session) | Self::Stop(session, _) | Self::Answered { session, .. } => {
                session
            }
        }
    }

    fn wakes_answer(&self, session: &SessionId, turn: &TurnId) -> bool {
        matches!(self, Self::Answered { session: owner, turn: target, .. } if owner == session && target == turn)
    }
}

impl Work {
    fn defer(&mut self, ready: ReadyWork) {
        if self.ready.len() < MAX_READY_SESSIONS && !self.ready.contains(&ready) {
            if matches!(ready, ReadyWork::Stop(..)) {
                self.ready.push_front(ready);
            } else {
                self.ready.push_back(ready);
            }
        }
    }
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
    Skill {
        reference: crate::skills::SkillReference,
    },
}

#[derive(Clone)]
pub struct PromptRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub parts: Vec<PromptPart>,
    pub questions: bool,
    pub configuration_permission: crate::ConfigurationPermission,
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
    max_output_tokens: Option<u64>,
    max_steps: Option<u32>,
    model: Option<agent_kit_core::ModelId>,
    authority: Option<CapturedAuthority>,
    #[serde(default)]
    questions: bool,
    #[serde(default)]
    configuration_permission: crate::ConfigurationPermission,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    permission_capture: Option<crate::permissions::PermissionCapture>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    guidance: Option<crate::skills::CapturedGuidance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    goal: Option<GoalRequest>,
}

#[derive(Serialize, Deserialize)]
struct CapturedAuthority {
    principal: PrincipalId,
    scope: ScopeId,
}

enum InputAuthority {
    RequireCaptured,
    CancellationOnly,
}

impl InputAuthority {
    fn validate(self, captured: Option<&CapturedAuthority>, live: &AuthorityBinding) -> Result<()> {
        if matches!(self, Self::CancellationOnly) {
            return Ok(());
        }
        let captured = captured
            .ok_or_else(|| problem(ErrorKind::Unavailable, "retained_authority_unavailable"))?;
        if captured.principal != live.principal || captured.scope != live.scope {
            return Err(problem(ErrorKind::Conflict, "retained_authority_changed"));
        }
        Ok(())
    }
}

enum Launch {
    Prompt {
        id: ChangeId,
        parts: Vec<PromptPart>,
        questions: bool,
        configuration_permission: crate::ConfigurationPermission,
    },
    Queued,
    Compact(ChangeId),
    RecoverCompaction(RecoveryRequest),
    Resume(ClaimRequest),
    ResumeAnswered(JournalPosition),
    RecoverStopped(RecoveryRequest),
}

enum WorkerClaim {
    Select(ClaimRequest),
    Recover(RecoveryRequest),
}

struct LaunchTicket {
    admission: oneshot::Receiver<Result<Option<Acceptance>>>,
    updates: broadcast::Receiver<TurnUpdate>,
    completion: oneshot::Receiver<Result<RunResult>>,
}

struct Admitted {
    opened: agent_kit_runtime::OpenedTurn,
    work: TurnWork,
    acceptance: Option<Acceptance>,
}

enum TurnWork {
    Conversation {
        master: Box<Master>,
        input: Vec<Message>,
        command: Option<Arc<crate::command::CommandTool>>,
    },
    Compaction(Box<compaction::CompactionPlan>),
}

struct PreparedInput {
    config: MasterConfig,
    messages: Vec<Message>,
    limit: Option<NonZeroU64>,
    questions: bool,
    configuration_permission: crate::ConfigurationPermission,
    captured: Option<ConfigurationSnapshot>,
    permission_capture: Option<crate::permissions::PermissionCapture>,
    guidance: Option<Message>,
    goal: Option<GoalRequest>,
}

#[derive(Clone, Debug, Serialize)]
pub struct PendingInteractions {
    #[serde(flatten)]
    pub questions: Questions,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub approvals: Vec<PendingApproval>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "disposition", content = "outcome", rename_all = "snake_case")]
pub enum RunResult {
    Settled(TurnOutcome),
    Suspended,
    InputRequired(PendingInteractions),
}

pub struct SessionSnapshot {
    pub messages: Vec<Message>,
}

#[derive(Serialize, Deserialize)]
struct SessionConfiguration {
    cwd: PathBuf,
    execution: Fingerprint,
}

/// The selected model and explicit output allowance for the scoped GG host.
pub struct GgOptions {
    pub model: ModelId,
    pub max_output_tokens: u64,
}

impl Host {
    pub fn open(state_dir: &Path, provider: Option<ProviderOptions>) -> Result<Self> {
        Self::open_with(
            state_dir,
            provider.map(|options| || Execution::new(state_dir, options)),
        )
    }

    // GRIDA-SEC-006 / GRIDA-GG: provider — bind execution to the admitted scope.
    /// Embed a host with a current, invocation-owned grant and its approved
    /// transport. The transport receives no account credentials.
    pub fn open_gg(
        state_dir: &Path,
        options: GgOptions,
        connection: Arc<GgConnection>,
        transport: Arc<dyn StreamingTransport>,
    ) -> Result<Self> {
        connection.validate()?;
        if !(1..=65_536).contains(&options.max_output_tokens) {
            return Err(problem(
                ErrorKind::InvalidInput,
                "invalid_output_token_limit",
            ));
        }
        let mut host = Self::open_with(
            state_dir,
            Some(|| Execution::new_gg(options, connection.clone(), transport)),
        )?;
        host.gg_connection = Some(connection);
        Ok(host)
    }

    fn open_with(
        state_dir: &Path,
        execution: Option<impl FnOnce() -> Result<Execution>>,
    ) -> Result<Self> {
        let database = state_dir.join("runtime.sqlite");
        if execution.is_some() {
            prepare_state_dir(state_dir)?;
        } else if !database.is_file() {
            return Err(problem(ErrorKind::Unavailable, "agent_state_unavailable"));
        }
        let store = Arc::new(SqliteStore::open(database)?);
        let configuration = execution
            .as_ref()
            .map(|_| Configuration::open(state_dir))
            .transpose()?
            .map(Arc::new);
        let execution = execution.map(|open| open()).transpose()?.map(Arc::new);
        Ok(Self {
            store,
            execution,
            gg_connection: None,
            configuration,
            permissions: None,
            #[cfg(unix)]
            guidance_root: None,
            configuration_admission: Arc::default(),
            controls: Arc::new(Semaphore::new(MAX_OWNED_CONTROLS)),
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
                configuration: encode(SESSION_SCHEMA, 2, &configuration)?,
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
            messages: self
                .store
                .history_with(id, None, grida_agent_master::history::project)
                .await?
                .into_iter()
                .map(|HistoryRecord::Message(message)| message)
                .collect(),
        })
    }

    pub async fn inspect(&self, id: SessionId) -> Result<SessionView> {
        self.store.inspect(id).await
    }

    pub async fn start_prompt(&self, request: PromptRequest) -> Result<AcceptedRun> {
        self.execution()?;
        let PromptRequest {
            id,
            session,
            parts,
            questions,
            configuration_permission,
        } = request;
        prompt_input(&id, &parts)?;
        let turn = TurnId::new(uuid())?;
        let ticket = {
            let mut work = self.work.lock().await;
            self.register(
                &mut work,
                session.clone(),
                turn.clone(),
                Launch::Prompt {
                    id: id.clone(),
                    parts,
                    questions,
                    configuration_permission,
                },
            )?
        };
        let acceptance = ticket
            .admission
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "admission_worker_interrupted"))??
            .ok_or_else(|| problem(ErrorKind::Uncertain, "prompt_acceptance_missing"))?;
        Ok(AcceptedRun {
            session,
            turn,
            input: id,
            position: acceptance.position,
            updates: ticket.updates,
            completion: ticket.completion,
        })
    }

    fn register(
        &self,
        work: &mut Work,
        session: SessionId,
        turn: TurnId,
        launch: Launch,
    ) -> Result<LaunchTicket> {
        if work.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        if work.active.len() >= MAX_ACTIVE_RUNS {
            return Err(problem(ErrorKind::LimitExceeded, "active_run_limit"));
        }
        if work.active.contains_key(&session) {
            return Err(problem(ErrorKind::Conflict, "session_prompt_in_progress"));
        }
        let (admission_tx, admission) = oneshot::channel();
        let (updates_tx, updates) = broadcast::channel(UPDATE_CAPACITY);
        let (completion_tx, completion) = oneshot::channel();
        let host = self.clone();
        let worker_session = session.clone();
        let worker_turn = turn.clone();
        let handle = tokio::spawn(async move {
            // The worker checks the same lock used for registration before
            // any durable claim, even when its requesting client disappears.
            let answered = match &launch {
                Launch::ResumeAnswered(position) => Some((&worker_turn, *position)),
                _ => None,
            };
            let result = host.admit(&worker_session, &worker_turn, launch).await;
            let admitted = match result {
                Ok(Some(run)) => run,
                Ok(None) => {
                    host.finish_work(&worker_session, false, answered).await;
                    let _ = admission_tx.send(Ok(None));
                    host.wake_ready().await;
                    return;
                }
                Err(error) => {
                    let queue_waiting = error.code == "session_queue_waiting";
                    let basis_changed = matches!(
                        error.code.as_str(),
                        "stale_session_revision" | "suspension_mismatch"
                    );
                    host.finish_work(
                        &worker_session,
                        error.kind == ErrorKind::Uncertain,
                        answered.filter(|_| !basis_changed),
                    )
                    .await;
                    let _ = admission_tx.send(Err(error));
                    host.wake_ready().await;
                    if queue_waiting {
                        host.kick_queue(worker_session).await;
                    }
                    return;
                }
            };
            let _ = admission_tx.send(Ok(admitted.acceptance));
            let mut completion_tx = Some(completion_tx);
            let result = match admitted.work {
                TurnWork::Conversation {
                    master,
                    input,
                    command,
                } => {
                    let result = drive(
                        host.store.clone(),
                        *master,
                        admitted.opened,
                        input,
                        updates_tx,
                    )
                    .await;
                    if let Some(command) = command {
                        match permissions::finish_commands(command, &mut completion_tx).await {
                            Ok(()) => result,
                            Err(error) => {
                                // Leave queued inputs retained without automatically
                                // admitting more work after uncertain native cleanup.
                                host.work
                                    .lock()
                                    .await
                                    .ready
                                    .retain(|work| work.session() != &worker_session);
                                Err(error)
                            }
                        }
                    } else {
                        result
                    }
                }
                TurnWork::Compaction(plan) => host.drive_compaction(admitted.opened, *plan).await,
            };
            let settled = matches!(&result, Ok(RunResult::Settled(_)));
            let suspended = matches!(
                &result,
                Ok(RunResult::Suspended | RunResult::InputRequired(_))
            );
            host.finish_work(
                &worker_session,
                result.is_err(),
                settled.then_some((&worker_turn, JournalPosition(u64::MAX))),
            )
            .await;
            if let Some(completion_tx) = completion_tx {
                let _ = completion_tx.send(result);
            }
            host.wake_ready().await;
            if settled {
                host.kick_queue(worker_session).await;
            } else if suspended {
                host.kick_stopped(worker_session, worker_turn).await;
            }
        });
        work.ready.retain(|waiting| {
            waiting.session() != &session || matches!(waiting, ReadyWork::Answered { .. })
        });
        work.active.insert(
            session,
            Active {
                turn,
                admitted: false,
                handle: handle.abort_handle(),
            },
        );
        Ok(LaunchTicket {
            admission,
            updates,
            completion,
        })
    }

    async fn admit(
        &self,
        session: &SessionId,
        turn: &TurnId,
        launch: Launch,
    ) -> Result<Option<Admitted>> {
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let maintenance_claim = match &launch {
            Launch::Compact(request) => {
                return self.admit_compaction(session, turn, request.clone()).await;
            }
            Launch::Resume(request) => Some(WorkerClaim::Select(request.clone())),
            Launch::RecoverStopped(request) | Launch::RecoverCompaction(request) => {
                Some(WorkerClaim::Recover(request.clone()))
            }
            _ => None,
        };
        if let Some(claim) = maintenance_claim
            && let Some(plan) = self.compaction_plan(session.clone(), turn.clone()).await?
        {
            return self
                .admit_retained_compaction(session, turn, claim, plan)
                .await;
        }
        let execution = self.execution()?;
        let configuration_admission = if matches!(&launch, Launch::Prompt { .. } | Launch::Queued) {
            Some(self.configuration_admission.lock().await)
        } else {
            None
        };
        let view = self.store.inspect(session.clone()).await?;
        self.check_execution(&view)?;
        let (claim_request, input, acceptance, history) = match launch {
            Launch::Prompt {
                id,
                parts,
                questions,
                configuration_permission,
            } => {
                require_idle(&view)?;
                if !view.queued.is_empty() {
                    return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
                }
                let history = self.provider_history(session.clone(), None).await?;
                let input = self
                    .capture_submission(&view, id, parts, questions, configuration_permission)
                    .await?;
                let acceptance = self.store.submit(session.clone(), input.clone()).await?;
                let view = self.store.inspect(session.clone()).await?;
                if view.queued.first().map(|head| &head.input.id) != Some(&input.id) {
                    return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
                }
                let claim = new_claim(
                    session.clone(),
                    turn.clone(),
                    view.revision,
                    input.id.clone(),
                )?;
                (
                    WorkerClaim::Select(claim),
                    Some(input),
                    Some(acceptance),
                    history,
                )
            }
            Launch::Queued => {
                require_idle(&view)?;
                let next = view
                    .queued
                    .first()
                    .ok_or_else(|| problem(ErrorKind::Unavailable, "session_queue_empty"))?;
                let history = self.provider_history(session.clone(), None).await?;
                let claim = new_claim(
                    session.clone(),
                    turn.clone(),
                    view.revision,
                    next.input.id.clone(),
                )?;
                (
                    WorkerClaim::Select(claim),
                    Some(next.input.clone()),
                    None,
                    history,
                )
            }
            resume @ (Launch::Resume(_) | Launch::ResumeAnswered(_)) => {
                let request = match resume {
                    Launch::Resume(request) => request,
                    Launch::ResumeAnswered(_) => {
                        let Some(request) = self.answered_claim(session, turn, &view).await? else {
                            return Ok(None);
                        };
                        request
                    }
                    _ => unreachable!("resume launch selected"),
                };
                let history = self
                    .provider_history(session.clone(), Some(turn.clone()))
                    .await?;
                let inputs = self
                    .store
                    .turn_submissions(session.clone(), turn.clone())
                    .await?;
                let [input] = inputs.as_slice() else {
                    return Err(problem(
                        ErrorKind::InvalidState,
                        "retained_input_selection_invalid",
                    ));
                };
                (
                    WorkerClaim::Select(request),
                    Some(input.clone()),
                    None,
                    history,
                )
            }
            Launch::RecoverStopped(request) => {
                let history = self
                    .provider_history(session.clone(), Some(turn.clone()))
                    .await?;
                (WorkerClaim::Recover(request), None, None, history)
            }
            Launch::Compact(_) | Launch::RecoverCompaction(_) => {
                return Err(problem(ErrorKind::InvalidState, "compaction_plan_missing"));
            }
        };
        let prepared = input
            .as_ref()
            .map(|input| self.prepare_input(execution, input, InputAuthority::RequireCaptured))
            .transpose()?;
        let claimed = match claim_request {
            WorkerClaim::Select(request) => {
                let change = match (input.as_ref(), prepared.as_ref(), &request.selection) {
                    (Some(input), Some(prepared), TurnSelection::New { .. }) => prepared
                        .goal
                        .as_ref()
                        .map(|goal| {
                            goals::claim_update(
                                &view,
                                &input.id,
                                turn,
                                goal,
                                prepared.config.max_steps,
                            )
                        })
                        .transpose()?,
                    _ => None,
                };
                match change {
                    Some(change) => self.store.claim_with_driver_state(request, change).await?,
                    None => self.store.claim(request).await?,
                }
            }
            WorkerClaim::Recover(request) => self.store.recover(request).await?,
        };
        drop(configuration_admission);
        let claim = match claimed {
            ClaimOutcome::Acquired(claim) => claim,
            ClaimOutcome::Existing(_) => return Ok(None),
        };
        let mut prepared = match prepared {
            Some(prepared) => prepared,
            None => {
                let [input] = claim.inputs.as_slice() else {
                    return Err(problem(
                        ErrorKind::Uncertain,
                        "retained_input_selection_invalid",
                    ));
                };
                self.prepare_input(execution, input, InputAuthority::CancellationOnly)
                    .map_err(|_| problem(ErrorKind::Uncertain, "retained_input_unavailable"))?
            }
        };
        let permission_scope = prepared
            .permission_capture
            .as_ref()
            .map(|capture| {
                self.bind_permissions(
                    capture,
                    claim.lease.binding().clone(),
                    execution.authorization.clone(),
                )
                .map_err(|_| problem(ErrorKind::Uncertain, "admitted_permission_unavailable"))
            })
            .transpose()?;
        let goal_authority = if prepared.goal.is_some() {
            let (validator, gate): (Arc<dyn AuthorityValidator>, Arc<dyn ToolGate>) =
                match &permission_scope {
                    Some((_, authorization)) => (authorization.clone(), authorization.clone()),
                    None => (
                        execution.authorization.clone(),
                        execution.authorization.clone(),
                    ),
                };
            Some(
                goals::GoalAuthority::bind(&claim, validator, gate)
                    .await
                    .map_err(|_| {
                        problem(ErrorKind::Uncertain, "admitted_goal_authority_unavailable")
                    })?,
            )
        } else {
            None
        };
        let runtime = goal_authority
            .as_ref()
            .map(|goal| {
                execution
                    .runtime
                    .with_authorization(goal.clone(), goal.clone())
            })
            .or_else(|| {
                permission_scope.as_ref().map(|(_, authorization)| {
                    execution
                        .runtime
                        .with_authorization(authorization.clone(), authorization.clone())
                })
            });
        let (opened, closing) = self
            .open_owned_turn_with_runtime(
                session,
                turn,
                claim.lease,
                runtime.as_ref().unwrap_or(&execution.runtime),
            )
            .await?;
        let mut authority = execution.authority.clone();
        let operations = opened.turn.operations();
        let mut inventory = Inventory::new();
        let command = if let Some((permissions, _)) = permission_scope {
            permissions.insert(&mut inventory, &mut authority.tools)?
        } else {
            None
        };
        if prepared.questions {
            execution
                .questions
                .insert(operations.clone(), &mut inventory, &mut authority.tools)?;
        }
        if prepared.configuration_permission != crate::ConfigurationPermission::Disabled {
            let captured = prepared.captured.ok_or_else(|| {
                problem(ErrorKind::InvalidState, "captured_configuration_missing")
            })?;
            execution.configuration_tools.insert(
                self.clone(),
                captured,
                prepared.configuration_permission,
                &mut inventory,
                &mut authority.tools,
            )?;
        }
        if let Some(goal) = goal_authority {
            goal.insert(&mut inventory, &mut authority.tools)?;
        }
        let selected = authority.tools.keys().cloned().collect::<Vec<_>>();
        let tools = inventory.snapshot(&selected)?;
        if !closing && prepared.questions {
            execution.questions.reconcile(&operations, &tools).await?;
        }
        if !closing && prepared.configuration_permission != crate::ConfigurationPermission::Disabled
        {
            execution
                .configuration_tools
                .reconcile(&operations, &tools)
                .await?;
        }
        if let Some(disclosure) = history.disclosure {
            if !prepared.config.instructions.is_empty() {
                prepared.config.instructions.push_str("\n\n");
            }
            prepared.config.instructions.push_str(&disclosure);
        }
        let mut prior = history.messages;
        prior.extend(prepared.guidance);
        let master = Master::new(
            prepared.config,
            execution.provider.clone(),
            tools,
            authority,
        )?
        .with_history(prior)
        .with_input_limit(prepared.limit);
        Ok(Some(Admitted {
            opened,
            work: TurnWork::Conversation {
                master: Box::new(master),
                input: prepared.messages,
                command,
            },
            acceptance,
        }))
    }

    async fn open_owned_turn(
        &self,
        session: &SessionId,
        turn: &TurnId,
        lease: agent_kit_core::turn::TurnLease,
    ) -> Result<(agent_kit_runtime::OpenedTurn, bool)> {
        self.open_owned_turn_with_runtime(session, turn, lease, &self.execution()?.runtime)
            .await
    }

    async fn open_owned_turn_with_runtime(
        &self,
        session: &SessionId,
        turn: &TurnId,
        lease: agent_kit_core::turn::TurnLease,
        runtime: &Runtime,
    ) -> Result<(agent_kit_runtime::OpenedTurn, bool)> {
        let opened = runtime
            .open(lease)
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
            control(
                &self.store,
                session.clone(),
                turn.clone(),
                ControlDirective::Pause,
            )
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "admitted_turn_pause_failed"))?;
        }
        Ok((opened, closing))
    }

    fn check_execution(&self, view: &SessionView) -> Result<()> {
        let execution = self.execution()?;
        let expected = if view.configuration.version() == 1 {
            execution.legacy_configuration
        } else {
            execution.configuration
        };
        if session_configuration(view)?.execution != expected {
            return Err(problem(
                ErrorKind::Conflict,
                "session_execution_configuration_changed",
            ));
        }
        Ok(())
    }

    async fn capture_submission(
        &self,
        session: &SessionView,
        id: ChangeId,
        parts: Vec<PromptPart>,
        questions: bool,
        configuration_permission: crate::ConfigurationPermission,
    ) -> Result<Submission> {
        let execution = self.execution()?;
        let configuration = self.with_configuration(Configuration::snapshot).await?;
        let permission_capture = self.capture_permissions(session, &id)?;
        let guidance = skills::capture_guidance(self.guidance_scope(session)?, &parts).await?;
        Ok(Submission {
            id,
            payload: encode(
                INPUT_SCHEMA,
                2,
                &StoredPrompt {
                    parts,
                    configuration,
                    max_output_tokens: Some(execution.config.max_output_tokens),
                    max_steps: Some(execution.config.max_steps),
                    model: Some(execution.config.model.clone()),
                    authority: Some(CapturedAuthority {
                        principal: execution.authority.inference.authority.principal.clone(),
                        scope: execution.authority.inference.authority.scope.clone(),
                    }),
                    questions,
                    configuration_permission,
                    permission_capture,
                    guidance,
                    goal: None,
                },
            )?,
        })
    }

    fn prepare_input(
        &self,
        execution: &Execution,
        input: &Submission,
        authority: InputAuthority,
    ) -> Result<PreparedInput> {
        let mut config = execution.config.clone();
        let cancellation_only = matches!(authority, InputAuthority::CancellationOnly);
        let (
            messages,
            limit,
            questions,
            configuration_permission,
            captured,
            permission_capture,
            guidance,
            goal,
        ) = match input.payload.version() {
            1 if input.payload.schema().as_str() == INPUT_SCHEMA => {
                authority.validate(None, &execution.authority.inference.authority)?;
                config.max_steps = 1;
                (
                    decode_input(input)?,
                    None,
                    false,
                    crate::ConfigurationPermission::Disabled,
                    None,
                    None,
                    None,
                    None,
                )
            }
            2 if input.payload.schema().as_str() == INPUT_SCHEMA => {
                let stored: StoredPrompt = decode_input(input)?;
                authority.validate(
                    stored.authority.as_ref(),
                    &execution.authority.inference.authority,
                )?;
                if stored
                    .model
                    .as_ref()
                    .is_some_and(|model| *model != config.model)
                {
                    return Err(problem(ErrorKind::Conflict, "retained_model_changed"));
                }
                if let Some(permission) = &stored.permission_capture {
                    config.instructions.push_str(permission.context());
                }
                let guidance = stored
                    .guidance
                    .as_ref()
                    .map(|guidance| guidance.message(&input.id))
                    .transpose()?;
                if guidance.is_some() {
                    config.instructions.push_str("\n\n");
                    config.instructions.push_str(crate::skills::GUIDANCE_POLICY);
                }
                if stored.goal.is_some() {
                    config.instructions.push_str("\n\n");
                    config.instructions.push_str(goals::INSTRUCTIONS);
                }
                config.max_steps = stored.max_steps.unwrap_or(1);
                config.max_output_tokens =
                    stored.max_output_tokens.unwrap_or(config.max_output_tokens);
                (
                    prompt_input(&input.id, &stored.parts)?,
                    stored.configuration.defaults.context.max_input_tokens,
                    stored.questions,
                    stored.configuration_permission,
                    Some(stored.configuration),
                    if cancellation_only {
                        None
                    } else {
                        stored.permission_capture
                    },
                    guidance,
                    if cancellation_only { None } else { stored.goal },
                )
            }
            _ => {
                return Err(problem(
                    ErrorKind::Unsupported,
                    "unsupported_submission_schema",
                ));
            }
        };
        if let Some(capture) = &permission_capture {
            self.permissions
                .as_ref()
                .ok_or_else(|| problem(ErrorKind::Unavailable, "permission_profile_unavailable"))?
                .validate_capture(capture)?;
        }
        if config.max_steps == 0 || config.max_output_tokens == 0 {
            return Err(problem(ErrorKind::InvalidInput, "invalid_master_limits"));
        }
        Ok(PreparedInput {
            config,
            messages,
            limit,
            questions,
            configuration_permission,
            captured,
            permission_capture,
            guidance,
            goal,
        })
    }

    async fn kick_queue(&self, session: SessionId) {
        if self.work.lock().await.closed {
            return;
        }
        let Ok(view) = self.store.inspect(session.clone()).await else {
            return;
        };
        if view.current.is_some() || view.admission_paused || view.queued.is_empty() {
            return;
        }
        let Ok(turn) = TurnId::new(uuid()) else {
            return;
        };
        let mut work = self.work.lock().await;
        if work.closed || work.active.contains_key(&session) {
            return;
        }
        if work.active.len() >= MAX_ACTIVE_RUNS {
            work.defer(ReadyWork::Queue(session));
            return;
        }
        // Dropping the automatic continuation ticket detaches its result
        // channels. The registered worker still owns the selected turn.
        let _ = self.register(&mut work, session, turn, Launch::Queued);
    }

    async fn wake_ready(&self) {
        loop {
            let next = {
                let mut work = self.work.lock().await;
                if work.closed || work.active.len() >= MAX_ACTIVE_RUNS {
                    return;
                }
                let Some(index) = work
                    .ready
                    .iter()
                    .position(|ready| !work.active.contains_key(ready.session()))
                else {
                    return;
                };
                if let ReadyWork::Answered {
                    session,
                    turn,
                    position,
                } = &work.ready[index]
                {
                    let (session, turn, position) = (session.clone(), turn.clone(), *position);
                    // Keep the wake reserved until its worker determines the
                    // disposition. A stale claim leaves it for the next drain.
                    if self
                        .register(&mut work, session, turn, Launch::ResumeAnswered(position))
                        .is_err()
                    {
                        work.ready.remove(index);
                    }
                    continue;
                }
                work.ready.remove(index)
            };
            match next {
                Some(ReadyWork::Queue(session)) => self.kick_queue(session).await,
                Some(ReadyWork::Stop(session, turn)) => self.kick_stopped(session, turn).await,
                Some(ReadyWork::Answered { .. }) => unreachable!("answered wake registered above"),
                None => return,
            }
        }
    }

    async fn finish_work(
        &self,
        session: &SessionId,
        unverified: bool,
        remove_answered: Option<(&TurnId, JournalPosition)>,
    ) {
        {
            let mut work = self.work.lock().await;
            work.unverified |= unverified;
            work.active.remove(session);
            if let Some((turn, through)) = remove_answered {
                work.ready.retain(|ready| {
                    !(ready.wakes_answer(session, turn) && matches!(ready, ReadyWork::Answered { position, .. } if *position <= through))
                });
            }
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
        lifecycle::check_input(&view.input, &request.parts)?;
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
        self.owned_control(move |host| async move {
            let receipt = host
                .store
                .control(ControlRequest {
                    id: request,
                    session: session.clone(),
                    expected_revision: expected_session,
                    action: SessionControl::PauseAndCancel {
                        turn: turn.clone(),
                        expected: expected_control,
                    },
                })
                .await?;
            host.kick_stopped(session, turn).await;
            Ok(receipt)
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
        self.configuration_update_controlled(expected, change, None)
            .await
    }

    pub(crate) async fn configuration_update_controlled(
        &self,
        expected: Option<Fingerprint>,
        change: SettingChange,
        control: Option<RequestControl>,
    ) -> Result<ConfigurationSnapshot> {
        self.owned_control(move |host| async move {
            let admission = host.configuration_admission.clone().lock_owned().await;
            host.with_configuration(move |configuration| {
                let _admission = admission;
                configuration.update_guarded(expected, change, || {
                    control.as_ref().map_or(Ok(()), check_configuration_control)
                })
            })
            .await
        })
        .await
    }

    pub async fn configuration_reload(
        &self,
        expected: Option<Fingerprint>,
    ) -> Result<ConfigurationSnapshot> {
        self.configuration_reload_controlled(expected, None).await
    }

    pub(crate) async fn configuration_reload_controlled(
        &self,
        expected: Option<Fingerprint>,
        control: Option<RequestControl>,
    ) -> Result<ConfigurationSnapshot> {
        self.owned_control(move |host| async move {
            let admission = host.configuration_admission.clone().lock_owned().await;
            host.with_configuration(move |configuration| {
                let _admission = admission;
                configuration.reload_guarded(expected, || {
                    control.as_ref().map_or(Ok(()), check_configuration_control)
                })
            })
            .await
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
            self.controls.close();
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
            if let Some(gg) = &self.gg_connection {
                gg.close();
            }
            loop {
                // notify_waiters wakes an existing Notified before its first poll.
                let changed = self.changed.notified();
                {
                    let work = self.work.lock().await;
                    if work.active.is_empty()
                        && self.controls.available_permits() == MAX_OWNED_CONTROLS
                    {
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
        let renewal = if let Some(gg) = &self.gg_connection {
            gg.shutdown(deadline).await
        } else {
            Ok(())
        };
        match result {
            Ok(Ok(())) => renewal,
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
}

impl Execution {
    fn new(state_dir: &Path, options: ProviderOptions) -> Result<Self> {
        let legacy_configuration = Fingerprint::of(&options)?;
        let transport = Arc::new(HttpTransport::new(state_dir, &options)?);
        let configuration = transport.selection();
        let binding = transport.binding().clone();
        let capabilities = text_capabilities(options.protocol.as_str())?;
        let provider: Arc<dyn Provider> = match options.protocol {
            ProviderProtocol::OpenAiCompatible => Arc::new(OpenAiCompatible::new(
                binding.clone(),
                BTreeMap::from([(
                    options.model.clone(),
                    ModelProfile {
                        capabilities,
                        output_limit: match options.compatible_output_limit_field {
                            Some(CompatibleOutputLimitField::MaxTokens) => OutputLimitField::Tokens,
                            Some(CompatibleOutputLimitField::MaxCompletionTokens) | None => {
                                OutputLimitField::CompletionTokens
                            }
                        },
                        include_usage: true,
                    },
                )]),
                transport.clone(),
                PROVIDER_LIMITS,
            )?),
            ProviderProtocol::Anthropic => Arc::new(Anthropic::new(
                binding.clone(),
                BTreeMap::from([(options.model.clone(), capabilities)]),
                transport.clone(),
                PROVIDER_LIMITS,
            )?),
            ProviderProtocol::Responses => Arc::new(Responses::new(
                binding.clone(),
                transport.replay_binding().cloned().ok_or_else(|| {
                    problem(ErrorKind::InvalidState, "provider_replay_binding_missing")
                })?,
                ResponsesEndpoint::Api,
                BTreeMap::from([(
                    options.model.clone(),
                    ResponsesProfile {
                        capabilities,
                        wire_model: options.model.clone(),
                        reasoning_effort: None,
                    },
                )]),
                transport.clone(),
                PROVIDER_LIMITS,
            )?),
            ProviderProtocol::Gemini => Arc::new(Gemini::new(
                binding.clone(),
                transport.replay_binding().cloned().ok_or_else(|| {
                    problem(ErrorKind::InvalidState, "provider_replay_binding_missing")
                })?,
                BTreeMap::from([(
                    options.model.clone(),
                    GeminiProfile {
                        capabilities,
                        requires_tool_signatures: false,
                    },
                )]),
                transport.clone(),
                PROVIDER_LIMITS,
            )?),
        };
        Self::compose(
            configuration,
            legacy_configuration,
            options.model,
            options.max_output_tokens,
            provider,
            binding,
            Credential::Http(transport),
        )
    }

    fn new_gg(
        options: GgOptions,
        connection: Arc<GgConnection>,
        transport: Arc<dyn StreamingTransport>,
    ) -> Result<Self> {
        let configuration = Fingerprint::of(&(
            "gg-chat-selection-v1",
            connection.scope_fingerprint(),
            &options.model,
        ))?;
        let binding = connection.binding().clone();
        let provider = Arc::new(OpenAiCompatible::new(
            binding.clone(),
            BTreeMap::from([(
                options.model.clone(),
                ModelProfile {
                    capabilities: text_capabilities("gg")?,
                    output_limit: OutputLimitField::CompletionTokens,
                    include_usage: true,
                },
            )]),
            transport,
            PROVIDER_LIMITS,
        )?);
        Self::compose(
            configuration,
            configuration,
            options.model,
            options.max_output_tokens,
            provider,
            binding,
            Credential::Gg(connection),
        )
    }

    fn compose(
        configuration: Fingerprint,
        legacy_configuration: Fingerprint,
        model: ModelId,
        max_output_tokens: u64,
        provider: Arc<dyn Provider>,
        binding: ProviderBinding,
        credential: Credential,
    ) -> Result<Self> {
        let inference = GrantSelection {
            authority: binding.authority,
            grants: Vec::new(),
        };
        let questions = Arc::new(questions::QuestionAccess::new()?);
        let configuration_tools = Arc::new(ConfigurationAccess::new()?);
        let authorization = Arc::new(ExecutionAuthority {
            inference: inference.clone(),
            questions: questions.clone(),
            configuration_tools: configuration_tools.clone(),
            credential,
        });
        let runtime = Runtime::new(ExecutionServices {
            providers: BTreeMap::from([(binding.provider, provider.clone())]),
            tools: Inventory::new().snapshot(&[])?,
            authority: authorization.clone(),
            gate: authorization.clone(),
            limits: ExecutionLimits {
                max_operations: 32,
                max_concurrent_inferences: MAX_ACTIVE_RUNS,
                max_concurrent_tools: 1,
                max_output_bytes: 512 * 1024,
                operation_timeout: MODEL_TIMEOUT,
                observer_capacity: UPDATE_CAPACITY,
            },
        })?;
        Ok(Self {
            configuration,
            legacy_configuration,
            runtime,
            config: MasterConfig {
                model,
                instructions: "You are Grida Agent, a helpful assistant.".into(),
                max_steps: MAX_TURN_STEPS,
                max_output_tokens,
            },
            provider,
            authority: MasterAuthority {
                inference,
                tools: BTreeMap::new(),
            },
            authorization,
            questions,
            configuration_tools,
        })
    }
}

fn text_capabilities(protocol: &str) -> Result<ModelCapabilities> {
    Ok(ModelCapabilities {
        revision: BindingId::new(format!("{protocol}-text-tools-v1"))?,
        input_modalities: [Modality::Text].into_iter().collect(),
        json_tools: true,
        text_tools: false,
        max_output_tokens: None,
    })
}

enum Credential {
    Http(Arc<HttpTransport>),
    Gg(Arc<GgConnection>),
}

struct ExecutionAuthority {
    inference: GrantSelection,
    questions: Arc<questions::QuestionAccess>,
    configuration_tools: Arc<ConfigurationAccess>,
    credential: Credential,
}

impl AuthorityValidator for ExecutionAuthority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            if self.questions.accepts(&request.selection)
                || self.configuration_tools.accepts(&request.selection)
            {
                return Ok(());
            }
            if request.selection != self.inference {
                return Err(problem(
                    ErrorKind::Unavailable,
                    "provider_authority_unavailable",
                ));
            }
            match &self.credential {
                Credential::Http(transport) => transport.validate_credential().await,
                Credential::Gg(connection) => connection.ensure_current().await,
            }
        })
    }
}

impl ToolGate for ExecutionAuthority {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        if self.configuration_tools.accepts(&admission.grants)
            && self
                .configuration_tools
                .permits(&admission.invocation, &admission.grants)
        {
            return Box::pin(async { Ok(ToolDecision::Permit) });
        }
        self.questions.decide(admission, context)
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
    let mut observer_open = true;
    let outcome = {
        let run = master.run(turn, input);
        tokio::pin!(run);
        loop {
            tokio::select! {
                outcome = &mut run => break outcome,
                update = observer.next(), if observer_open => match update {
                    Some(update) => { let _ = updates.send(update); }
                    None => observer_open = false,
                }
            }
        }
    };
    // Turn-bound tools retain the publisher while they are offered by Master.
    drop(master);
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
            let state = observer.snapshot().state;
            if state.controls().admits_work() {
                let questions = questions::pending(&state)?;
                let approvals = permissions::pending_approvals(&state)?.approvals;
                if !questions.questions.is_empty() || !approvals.is_empty() {
                    return Ok(RunResult::InputRequired(PendingInteractions {
                        questions,
                        approvals,
                    }));
                }
            }
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
            || (directive == ControlDirective::Pause
                && (turn_view.controls.paused || turn_view.controls.cancelled))
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

fn require_idle(view: &SessionView) -> Result<()> {
    if view.admission_paused {
        return Err(problem(ErrorKind::InvalidState, "session_admission_paused"));
    }
    if view.current.is_some() {
        return Err(problem(
            ErrorKind::InvalidState,
            "session_turn_requires_recovery",
        ));
    }
    Ok(())
}

fn new_claim(
    session: SessionId,
    turn: TurnId,
    revision: SessionRevision,
    input: ChangeId,
) -> Result<ClaimRequest> {
    Ok(ClaimRequest {
        id: change_id()?,
        session,
        expected_revision: revision,
        selection: TurnSelection::New {
            turn,
            inputs: vec![input],
        },
    })
}

fn decode_input<T: serde::de::DeserializeOwned>(input: &Submission) -> Result<T> {
    serde_json::from_slice(input.payload.bytes())
        .map_err(|_| problem(ErrorKind::InvalidState, "invalid_submission"))
}

pub(crate) fn validate_prompt_parts(parts: &[PromptPart]) -> Result<()> {
    if parts.is_empty() || parts.len() > MAX_PROMPT_PARTS {
        return Err(problem(ErrorKind::InvalidInput, "invalid_prompt_parts"));
    }
    let bytes = serde_json::to_vec(parts)
        .map_err(|_| problem(ErrorKind::InvalidInput, "prompt_encoding_failed"))?;
    if bytes.len() > MAX_PROMPT_BYTES {
        return Err(problem(ErrorKind::LimitExceeded, "prompt_too_large"));
    }
    Ok(())
}

fn prompt_input(id: &ChangeId, parts: &[PromptPart]) -> Result<Vec<Message>> {
    validate_prompt_parts(parts)?;
    let content = parts
        .iter()
        .map(|part| match part {
            PromptPart::Text { text } => Content::Text(text.clone()),
            reference @ PromptPart::ResourceLink { .. } => {
                // A reference is context supplied by the user. It is neither
                // imported nor granted filesystem or network authority here.
                Content::Text(serde_json::to_string(reference).expect("serializable reference"))
            }
            PromptPart::Skill { reference } => {
                Content::Text(format!("\n\nSelected skill {}.", reference.name()))
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
    if config.schema().as_str() != SESSION_SCHEMA || !matches!(config.version(), 1 | 2) {
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

pub(crate) fn check_configuration_control(control: &RequestControl) -> Result<()> {
    if control.cancellation.is_cancelled() {
        return Err(problem(ErrorKind::Unavailable, "configuration_cancelled"));
    }
    if control
        .deadline
        .is_some_and(|deadline| deadline <= std::time::Instant::now())
    {
        return Err(problem(ErrorKind::Unavailable, "configuration_deadline"));
    }
    Ok(())
}
