//! Product composition and ownership for native agent turns.

mod approval_review;
mod before_tool;
mod catalog;
pub(crate) mod compaction;
mod completion_checks;
pub(crate) mod deletion;
mod goals;
mod history;
mod host_tools;
pub(crate) mod image_generation;
mod image_tools;
mod images;
pub(crate) mod library;
mod lifecycle;
mod lifecycle_hooks;
pub(crate) mod live;
mod permissions;
mod questions;
mod retained_file;
mod retained_inputs;
mod selected_file;
pub(crate) mod side_chats;
mod skills;
mod spending;
mod sponsorship;
mod subagents;
mod titles;
mod wakeups;
pub use catalog::SessionCatalog;
pub(crate) use catalog::is_archived;
pub use compaction::{CompactRequest, CompactionReport, CompactionStatus};
pub use goals::{GoalAction, GoalControl, GoalInspection, GoalRequest, GoalView};
pub(crate) use history::RevisionTarget;
pub use history::{ConversationDerivation, HistoryPage, HistoryQuery};
pub(crate) use image_tools::{CropArtifact, CropArtifacts};
pub use images::ImageUpload;
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(crate) use images::MAX_IMAGE_BYTES;
pub(crate) use images::{is_retained_image, retained_image_size};
pub use lifecycle::{InputInspection, InputSettings, QueueEdit, TurnControl};
pub use lifecycle_hooks::HookInspection;
pub use permissions::{Approvals, PendingApproval};
pub use questions::{PendingQuestion, Questions};
pub use retained_file::FileUpload;
pub use spending::SpendingInspection;
pub use subagents::{
    SubagentAssignment, SubagentInspection, SubagentMessage, SubagentMessageReceipt, SubagentWork,
};
pub use wakeups::{ScheduledWakeup, WakeupStatus, Wakeups};

use crate::EffortPreset;
use crate::configuration::{
    Configuration, ConfigurationInspection, ConfigurationSnapshot, WorkspaceConfiguration,
};
use crate::configuration_tools::ConfigurationAccess;
use crate::gg::{
    GatewayChildBilling, GatewayChildBillingPage, GatewayChildBillingRef, GgConnection,
};
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
    OperationId, PrincipalId, ProviderId, Result, SchemaId, ScopeId, SessionId, TurnId,
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
use agent_kit_store_sqlite::turn_links::TurnLinkCursor;
use agent_kit_store_sqlite::{OperationPairReceipt, SqliteStore};
use grida_agent_master::configuration::SettingChange;
use grida_agent_master::effort::Policy as EffortPolicy;
use grida_agent_master::hooks::CompletionChecks;
use grida_agent_master::{Master, MasterAuthority, MasterConfig, MasterOutcome, OperatingRegime};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::sync::{Mutex, MutexGuard, Notify, Semaphore, broadcast, oneshot};
use tokio::task::AbortHandle;

/// The session database of a state directory. External runs keep their own
/// database under the same name in their own directories.
pub const DATABASE_FILE: &str = "agent.sqlite";

/// Open a host's session database with the host's catalog and turn-link
/// projections. A database created with them refuses any other opener.
pub fn open_store(database: &Path) -> Result<SqliteStore> {
    SqliteStore::open_cataloged_with_turn_links(
        database,
        catalog::configuration_scope,
        subagents::turn_link,
    )
}

const SESSION_SCHEMA: &str = "grida.agent.native.session";
const INPUT_SCHEMA: &str = "grida.agent.native.input";
/// The one stored version of each envelope this host writes and reads.
const SESSION_VERSION: u32 = 1;
const INPUT_VERSION: u32 = 1;
const MAX_PROMPT_BYTES: usize = 512 * 1024;
pub(crate) const MAX_PROMPT_PARTS: usize = 64;
pub(crate) const RETAINED_IMAGE_LABEL: &str = "\n[Retained PNG image]\n";
const MAX_ACTIVE_RUNS: usize = 8;
const MAX_OWNED_CONTROLS: usize = 32;
const MAX_READY_SESSIONS: usize = 128;
/// A runaway guard, not a product limit: a turn ends when the model answers,
/// the person interrupts, or a budget they set runs out.
const MAX_TURN_STEPS: u32 = 200;
/// Model calls and tool calls one turn may record. A runaway guard, not a
/// product limit (permission policy, "What a program sees"): room for every
/// model call the step guard allows, each followed by several tool calls.
/// Turn storage keeps each message once, so a turn's stored size grows with
/// what it adds.
const MAX_TURN_OPERATIONS: usize = 1024;
/// The product's base instructions for every native agent turn.
const CORE_INSTRUCTIONS: &str = include_str!("prompts/core.md");
const UPDATE_CAPACITY: usize = 128;
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(8);
/// How long a new request waits for a settled turn's worker to finish.
const SETTLING_WORKER_WAIT: Duration = Duration::from_secs(10);
const MODEL_TIMEOUT: Duration = Duration::from_secs(120);
const PROVIDER_LIMITS: StreamLimits = StreamLimits {
    max_request_bytes: 1024 * 1024,
    max_response_bytes: 4 * 1024 * 1024,
    max_event_bytes: 256 * 1024,
    // Parallel calls in one reply are unbounded: the response byte limit
    // bounds the stream, and the turn's operation guard bounds the work and
    // ends the turn cleanly when reached.
    max_tool_calls: usize::MAX,
    max_tool_argument_bytes: 64 * 1024,
};

#[derive(Clone)]
pub struct Host {
    store: Arc<SqliteStore>,
    state_dir: Option<Arc<Path>>,
    execution: Option<Arc<Execution>>,
    gg_connection: Option<Arc<GgConnection>>,
    spending: Arc<spending::Store>,
    configuration: Option<Arc<Configuration>>,
    permissions: Option<Arc<crate::permissions::PermissionProfile>>,
    host_tools: Option<Arc<host_tools::HostTools>>,
    pub(crate) editor_surfaces: crate::editor_surfaces::EditorSurfaces,
    pub(crate) desktop_image_generation: Option<image_generation::DesktopImageGeneration>,
    subagents_enabled: bool,
    /// Title an untitled chat from its first request (see `titles`).
    chat_titles: bool,
    sponsorship_enabled: bool,
    goal_sponsorship_enabled: bool,
    effort: EffortPreset,
    operating_regime: OperatingRegime,
    require_completion_text: bool,
    side_context: Option<Arc<grida_agent_master::side_context::SideContext>>,
    #[cfg(unix)]
    guidance_root: Option<Arc<skills::HeadlessGuidance>>,
    configuration_admission: Arc<Mutex<()>>,
    controls: Arc<Semaphore>,
    work: Arc<Mutex<Work>>,
    wake_lock: Arc<Mutex<()>>,
    workers: Arc<AtomicUsize>,
    changed: Arc<Notify>,
    live_updates: broadcast::Sender<live::LiveUpdate>,
}

struct Execution {
    configuration: Fingerprint,
    owner: Fingerprint,
    runtime: Runtime,
    config: MasterConfig,
    provider: Arc<dyn Provider>,
    spending_profile: Option<Arc<spending::ProviderProfile>>,
    authority: MasterAuthority,
    authorization: Arc<ExecutionAuthority>,
    questions: Arc<questions::QuestionAccess>,
    configuration_tools: Arc<ConfigurationAccess>,
    accepts_selected_png: bool,
    image_tools: Option<Arc<retained_inputs::RetainedInputs>>,
    workspace_vision: bool,
    tool_result_images: bool,
    retained_inputs: Option<Arc<retained_inputs::RetainedInputs>>,
}

#[derive(Default)]
struct Work {
    closed: bool,
    unverified: bool,
    active: BTreeMap<SessionId, Active>,
    retiring: BTreeSet<SessionId>,
    ready: VecDeque<ReadyWork>,
    missed_stops: bool,
    stop_scan_active: bool,
    stop_scan_after: Option<SessionId>,
    stop_scan_turn: bool,
    timers: wakeups::TimerOwners,
}

#[derive(PartialEq, Eq)]
enum ReadyWork {
    Queue(SessionId, Option<SessionRevision>),
    GoalResume(goals::GoalResumeWake),
    Stop(SessionId, TurnId),
    Sponsored(sponsorship::SponsoredWake),
    Answered {
        session: SessionId,
        turn: TurnId,
        position: JournalPosition,
    },
}

impl ReadyWork {
    fn session(&self) -> &SessionId {
        match self {
            Self::Queue(session, _) | Self::Stop(session, _) | Self::Answered { session, .. } => {
                session
            }
            Self::GoalResume(wake) => &wake.binding.session,
            Self::Sponsored(wake) => &wake.binding.session,
        }
    }

    fn wakes_answer(&self, session: &SessionId, turn: &TurnId) -> bool {
        matches!(self, Self::Answered { session: owner, turn: target, .. } if owner == session && target == turn)
    }
}

impl Work {
    fn defer(&mut self, ready: ReadyWork) {
        if self.retiring.contains(ready.session()) {
            return;
        }
        if let ReadyWork::Queue(session, incoming) = &ready
            && let Some(ReadyWork::Queue(_, pending)) = self
                .ready
                .iter_mut()
                .find(|pending| matches!(pending, ReadyWork::Queue(owner, _) if owner == session))
        {
            match (*pending, *incoming) {
                (Some(old), Some(new)) if new.0 > old.0 => *pending = Some(new),
                (Some(_), None) => *pending = None,
                _ => {}
            }
            return;
        }
        if self.ready.contains(&ready) {
            return;
        }
        if self.ready.len() < MAX_READY_SESSIONS {
            if matches!(ready, ReadyWork::Stop(..)) {
                self.ready.push_front(ready);
            } else {
                self.ready.push_back(ready);
            }
        } else if matches!(ready, ReadyWork::Stop(..)) {
            // The durable cancellation remains the authority when this
            // bounded notification queue cannot retain another wake.
            self.missed_stops = true;
        }
    }
}

struct Active {
    turn: TurnId,
    admitted: bool,
    handle: AbortHandle,
    pending_stop: Option<TurnId>,
    missed_stop: bool,
}

struct WorkerLifetime {
    workers: Arc<AtomicUsize>,
    changed: Arc<Notify>,
}

impl Drop for WorkerLifetime {
    fn drop(&mut self) {
        self.workers.fetch_sub(1, Ordering::Release);
        self.changed.notify_waiters();
    }
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
    #[serde(skip)]
    Image {
        image: ImageUpload,
    },
    RetainedImage {
        asset: crate::scratch::AssetRef,
    },
    #[serde(skip)]
    File {
        file: FileUpload,
    },
    RetainedFile {
        work: crate::scratch::WorkingCopyReceipt,
    },
}

#[derive(Clone)]
pub struct PromptRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub parts: Vec<PromptPart>,
    pub questions: bool,
    pub configuration_permission: crate::ConfigurationPermission,
    pub operating_regime: Option<OperatingRegime>,
    pub effort: Option<EffortPreset>,
    /// The person's reasoning level for this request's turn.
    pub reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
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

impl DurableSubmission {
    fn accepted(acceptance: Acceptance, disposition: InputDisposition) -> Self {
        Self {
            session: acceptance.session,
            input: acceptance.input,
            position: acceptance.position,
            disposition,
        }
    }
}

#[derive(Serialize, Deserialize)]
struct StoredPrompt {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lifecycle_hooks: Option<grida_agent_master::lifecycle_hooks::LifecycleHooks>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    spending: Option<spending::Selection>,
    parts: Vec<PromptPart>,
    configuration: ConfigurationSnapshot,
    max_output_tokens: Option<u64>,
    max_steps: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    effort: Option<EffortPolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    model: Option<agent_kit_core::ModelId>,
    authority: Option<CapturedAuthority>,
    #[serde(default, skip_serializing_if = "OperatingRegime::is_act")]
    operating_regime: OperatingRegime,
    questions: bool,
    allow_wakeups: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    allow_library_selection: bool,
    configuration_permission: crate::ConfigurationPermission,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    permission_capture: Option<crate::permissions::PermissionCapture>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    allow_reviewer_primary_read: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    host_tools_capture: Option<host_tools::Capture>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    desktop_image_generation: Option<BindingId>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    allow_image_reference: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    allow_attachment_reference: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    allow_workspace_reference: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    allow_image_placement: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    editor_endpoint: Option<BindingId>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    editor_presentation: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    editor_svg_target: Option<BindingId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    guidance: Option<crate::skills::CapturedGuidance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    goal: Option<goals::GoalInput>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    subagent: Option<grida_agent_master::subagents::Assignment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    completion_checks: Option<CompletionChecks>,
}

#[derive(Serialize, Deserialize)]
struct CapturedAuthority {
    principal: PrincipalId,
    scope: ScopeId,
}

/// The model and inference authority an input was captured under.
#[derive(Deserialize)]
struct CapturedRoute {
    #[serde(default)]
    model: Option<agent_kit_core::ModelId>,
    #[serde(default)]
    authority: Option<CapturedAuthority>,
}

impl CapturedRoute {
    /// Whether a retained input would run under this execution, by the same
    /// model and authority rules that admission applies to it.
    fn admits(input: &Submission, execution: &Execution) -> bool {
        if !is_stored_input(&input.payload) {
            return false;
        }
        let live = &execution.authority.inference.authority;
        decode_input::<Self>(input).is_ok_and(|route| {
            route
                .model
                .is_none_or(|model| model == execution.config.model)
                && route.authority.is_some_and(|captured| {
                    captured.principal == live.principal && captured.scope == live.scope
                })
        })
    }
}

struct SubmissionPolicy {
    questions: bool,
    configuration_permission: crate::ConfigurationPermission,
    allow_wakeups: bool,
    allow_library_selection: bool,
    allow_host_tools: bool,
    desktop_image_generation: Option<BindingId>,
    allow_image_placement: bool,
    editor_endpoint: Option<BindingId>,
    editor_presentation: bool,
    editor_svg_target: Option<BindingId>,
    operating_regime: OperatingRegime,
    subagent: Option<grida_agent_master::subagents::Assignment>,
    effort: Option<EffortPolicy>,
    reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    /// The Goal spending selection the input runs under, carried by the
    /// Goal's own inputs and the assignments and replacements they create.
    spending: Option<spending::Selection>,
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
        policy: SubmissionPolicy,
        publish_text: bool,
    },
    Identified {
        id: ChangeId,
        parts: Vec<PromptPart>,
        policy: SubmissionPolicy,
    },
    /// An optional revision limits recovery to an unchanged accepted Resume.
    Queued(Option<Acceptance>, Option<SessionRevision>),
    Sponsored(Box<sponsorship::SponsoredClaim>),
    Compact(ChangeId),
    RecoverCompaction(RecoveryRequest),
    Resume(ClaimRequest),
    ResumeSponsored(sponsorship::SponsoredWake),
    ResumeAnswered(JournalPosition),
    RecoverStopped(RecoveryRequest),
}

enum WorkerClaim {
    Select(ClaimRequest),
    Recover(RecoveryRequest),
}

struct LaunchTicket {
    admission: oneshot::Receiver<Result<Option<DurableSubmission>>>,
    updates: broadcast::Receiver<TurnUpdate>,
    completion: oneshot::Receiver<Result<RunResult>>,
}

async fn prompt_acceptance(
    admission: oneshot::Receiver<Result<Option<DurableSubmission>>>,
) -> Result<DurableSubmission> {
    admission
        .await
        .map_err(|_| problem(ErrorKind::Uncertain, "admission_worker_interrupted"))??
        .ok_or_else(|| problem(ErrorKind::Uncertain, "prompt_acceptance_missing"))
}

struct Admitted {
    opened: agent_kit_runtime::OpenedTurn,
    work: TurnWork,
    acceptance: Option<DurableSubmission>,
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
    lifecycle_hooks: Option<grida_agent_master::lifecycle_hooks::LifecycleHooks>,
    spending: Option<spending::Selection>,
    config: MasterConfig,
    effort: Option<EffortPolicy>,
    subagent: bool,
    operating_regime: OperatingRegime,
    messages: Vec<Message>,
    retained_file: Option<crate::scratch::WorkingCopyReceipt>,
    limit: Option<NonZeroU64>,
    questions: bool,
    allow_wakeups: bool,
    allow_library_selection: bool,
    configuration_permission: crate::ConfigurationPermission,
    captured: Option<ConfigurationSnapshot>,
    permission_capture: Option<crate::permissions::PermissionCapture>,
    host_tools: Vec<Arc<host_tools::HostTools>>,
    image_generation: Option<image_generation::Prepared>,
    guidance: Option<Message>,
    goal: Option<goals::GoalInput>,
    completion_checks: Option<CompletionChecks>,
    completion_authorized: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct PendingInteractions {
    #[serde(flatten)]
    pub questions: Questions,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub approvals: Vec<PendingApproval>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) library_selections: Vec<library::PendingSelection>,
}

#[derive(Default)]
pub(crate) struct SubmissionContext {
    pub allow_wakeups: bool,
    pub allow_library_selection: bool,
    pub editor_endpoint: Option<BindingId>,
    pub editor_presentation: bool,
    pub editor_svg_target: Option<BindingId>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "disposition", content = "outcome", rename_all = "snake_case")]
pub enum RunResult {
    Settled(TurnOutcome),
    Suspended,
    InputRequired(PendingInteractions),
}

#[derive(Serialize, Deserialize)]
struct SessionConfiguration {
    cwd: PathBuf,
    execution: Fingerprint,
    /// Who holds the credential the chat runs under. A chat can change model
    /// between turns only within the same owner.
    owner: Fingerprint,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    subagent: Option<grida_agent_master::subagents::Profile>,
}

/// The selected model and explicit output allowance for the scoped GG host.
pub struct GgOptions {
    pub model: ModelId,
    pub max_output_tokens: u64,
}

impl GgOptions {
    fn validate(&self) -> Result<()> {
        if !(1..=65_536).contains(&self.max_output_tokens) {
            return Err(problem(
                ErrorKind::InvalidInput,
                "invalid_output_token_limit",
            ));
        }
        Ok(())
    }
}

impl Host {
    pub fn open(state_dir: &Path, provider: Option<ProviderOptions>) -> Result<Self> {
        Self::open_with(
            state_dir,
            provider.map(|options| {
                |retained_inputs| Execution::new(state_dir, options, None, retained_inputs)
            }),
            None,
        )
    }

    pub fn open_supervised(
        state_dir: &Path,
        provider: ProviderOptions,
        supervisor: crate::SupervisedProvider,
        workspace_configuration: Option<&WorkspaceConfiguration>,
    ) -> Result<Self> {
        Self::open_with(
            state_dir,
            Some(|retained_inputs| {
                Execution::new(state_dir, provider, Some(supervisor), retained_inputs)
            }),
            workspace_configuration,
        )
    }

    // GRIDA-SEC-006 — the Desktop supervisor owns the scoped bearer.
    pub fn open_supervised_gateway(
        state_dir: &Path,
        options: GgOptions,
        endpoint: &str,
        scope: &str,
        supervisor: crate::SupervisedProvider,
        workspace_configuration: Option<&WorkspaceConfiguration>,
    ) -> Result<Self> {
        options.validate()?;
        let connection = Arc::new(crate::gg::SupervisedGg::new(endpoint, scope, supervisor)?);
        Self::open_with(
            state_dir,
            Some(|retained_inputs| {
                Execution::new_gg(
                    options,
                    connection.scope,
                    connection.binding.clone(),
                    connection.clone(),
                    Credential::SupervisedGg(connection),
                    retained_inputs,
                )
            }),
            workspace_configuration,
        )
    }

    // GRIDA-SEC-008 — OAuth is owned by the attached Desktop supervisor.
    pub fn open_supervised_chatgpt(
        state_dir: &Path,
        endpoint: &str,
        model: ModelId,
        scope: &str,
        supervisor: crate::SupervisedProvider,
        workspace_configuration: Option<&WorkspaceConfiguration>,
    ) -> Result<Self> {
        let connection = Arc::new(crate::chatgpt_subscription::SupervisedChatGpt::new(
            endpoint, &model, scope, supervisor,
        )?);
        Self::open_with(
            state_dir,
            Some(|_| Execution::new_chatgpt(model, connection)),
            workspace_configuration,
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
        options.validate()?;
        let mut host = Self::open_with(
            state_dir,
            Some(|retained_inputs| {
                Execution::new_gg(
                    options,
                    connection.scope_fingerprint(),
                    connection.binding().clone(),
                    transport,
                    Credential::Gg(connection.clone()),
                    retained_inputs,
                )
            }),
            None,
        )?;
        host.gg_connection = Some(connection);
        Ok(host)
    }

    fn open_with(
        state_dir: &Path,
        execution: Option<
            impl FnOnce(Option<Arc<retained_inputs::RetainedInputs>>) -> Result<Execution>,
        >,
        workspace_configuration: Option<&WorkspaceConfiguration>,
    ) -> Result<Self> {
        let database = state_dir.join(DATABASE_FILE);
        if execution.is_some() {
            prepare_state_dir(state_dir)?;
        } else if !database.is_file() {
            return Err(problem(ErrorKind::Unavailable, "agent_state_unavailable"));
        }
        let store = Arc::new(open_store(&database)?);
        let configuration = execution
            .as_ref()
            .map(|_| match workspace_configuration {
                Some(workspace) => workspace.open(state_dir),
                None => Configuration::open(state_dir),
            })
            .transpose()?
            .map(Arc::new);
        let execution = execution
            .map(|open| {
                let retained_inputs = cfg!(any(target_os = "macos", target_os = "linux"))
                    .then(|| retained_inputs::RetainedInputs::open(state_dir).map(Arc::new))
                    .transpose()?;
                let mut execution = open(retained_inputs.clone())?;
                execution.retained_inputs = retained_inputs;
                Ok::<_, agent_kit_core::Error>(Arc::new(execution))
            })
            .transpose()?;
        let state_dir = state_dir
            .canonicalize()
            .map_err(|_| problem(ErrorKind::Unavailable, "state_directory_unavailable"))?;
        Ok(Self {
            spending: Arc::new(spending::Store::new(&state_dir, store.clone())),
            store,
            state_dir: Some(state_dir.into()),
            execution,
            gg_connection: None,
            configuration,
            permissions: None,
            host_tools: None,
            editor_surfaces: Default::default(),
            desktop_image_generation: None,
            subagents_enabled: false,
            chat_titles: false,
            sponsorship_enabled: true,
            goal_sponsorship_enabled: true,
            effort: EffortPreset::Standard,
            operating_regime: OperatingRegime::default(),
            require_completion_text: false,
            side_context: None,
            #[cfg(unix)]
            guidance_root: None,
            configuration_admission: Arc::default(),
            controls: Arc::new(Semaphore::new(MAX_OWNED_CONTROLS)),
            work: Arc::default(),
            wake_lock: Arc::default(),
            workers: Arc::default(),
            changed: Arc::default(),
            live_updates: broadcast::channel(UPDATE_CAPACITY).0,
        })
    }

    pub(crate) fn observe_live(&self) -> broadcast::Receiver<live::LiveUpdate> {
        self.live_updates.subscribe()
    }

    /// Select the allowed regime for new work without widening retained work.
    pub fn with_operating_regime(mut self, regime: OperatingRegime) -> Self {
        self.operating_regime = regime;
        self
    }

    pub(crate) fn supports_editor_tools(&self) -> bool {
        self.operating_regime.is_act()
            && self.side_context.is_none()
            && self
                .host_tools
                .as_ref()
                .is_none_or(|tools| !tools.has_local_surface())
    }

    pub async fn new_session(&self, cwd: PathBuf) -> Result<SessionId> {
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let execution = self.execution()?;
        let configuration = SessionConfiguration {
            cwd: canonical_workspace(&cwd)?,
            execution: execution.configuration,
            owner: execution.owner,
            subagent: None,
        };
        let session = SessionId::new(uuid())?;
        self.store
            .create(CreateSession {
                id: session.clone(),
                request: change_id()?,
                configuration: encode(SESSION_SCHEMA, SESSION_VERSION, &configuration)?,
            })
            .await?;
        Ok(session)
    }

    pub(crate) async fn validate_session_workspace(
        &self,
        id: SessionId,
        cwd: PathBuf,
    ) -> Result<()> {
        let session = self.store.inspect(id.clone()).await?;
        let configuration = session_configuration(&session)?;
        if configuration.subagent.is_some() {
            return Err(problem(ErrorKind::Unavailable, "session_missing"));
        }
        if configuration.cwd != canonical_workspace(&cwd)? {
            return Err(problem(ErrorKind::Conflict, "session_workspace_mismatch"));
        }
        Ok(())
    }

    pub(crate) async fn open_history_replay(
        &self,
        id: SessionId,
        cwd: PathBuf,
    ) -> Result<agent_kit_store_sqlite::history::HistoryReplay> {
        self.validate_session_workspace(id.clone(), cwd).await?;
        self.store
            .open_history_replay(id, grida_agent_master::history::project)
            .await
    }

    pub async fn inspect(&self, id: SessionId) -> Result<SessionView> {
        self.store.inspect(id).await
    }

    fn supervised_gateway(&self) -> Option<&Arc<crate::gg::SupervisedGg>> {
        let Credential::SupervisedGg(gateway) = &self.execution.as_ref()?.authorization.credential
        else {
            return None;
        };
        Some(gateway)
    }

    pub(crate) fn supports_gateway_billing_status(&self) -> bool {
        self.supervised_gateway().is_some()
    }

    pub(crate) async fn gateway_billing_request_id(
        &self,
        session: SessionId,
        turn: TurnId,
        operation: OperationId,
        attempt: agent_kit_core::AttemptId,
        child: Option<GatewayChildBillingRef>,
    ) -> Option<String> {
        let gateway = self.supervised_gateway()?.clone();
        gateway.validate().ok()?;
        if let Some(child) = child {
            self.require_gateway_billing_parent(&session).await.ok()?;
            let child_view = self.store.inspect(child.child_id.clone()).await.ok()?;
            self.check_execution(&child_view).ok()?;
            subagents::child_profile(&session, &child_view.configuration)
                .ok()?
                .require_authority(&gateway.binding.authority)
                .ok()?;
            return self
                .store
                .inspect_turn_link_with(session, turn, child.into(), move |state| {
                    Ok(gateway
                        .retained_attempt_request_id(state, &operation, &attempt)
                        .flatten())
                })
                .await
                .ok()
                .flatten()
                .flatten();
        }
        let parent_gateway = gateway.clone();
        let parent_operation = operation.clone();
        let parent_attempt = attempt.clone();
        let (parent, review_operations) = self
            .store
            .inspect_turn_with(session.clone(), turn.clone(), move |state| {
                Ok((
                    parent_gateway.retained_attempt_request_id(
                        state,
                        &parent_operation,
                        &parent_attempt,
                    ),
                    if parent_gateway.owns_retained_turn(state) {
                        sponsorship::retained_review_operations(state).unwrap_or_default()
                    } else {
                        vec![]
                    },
                ))
            })
            .await
            .ok()?;
        let review = match self
            .store
            .inspect_operation_claim_with(session, turn, review_operations, move |state| {
                Ok(gateway.retained_attempt_request_id(state, &operation, &attempt))
            })
            .await
        {
            Ok(review) => review.flatten(),
            Err(error) if error.code == "operation_claim_ambiguous" => return None,
            Err(_) => None,
        };
        match (parent, review) {
            (Some(id), None) | (None, Some(id)) => id,
            _ => None,
        }
    }

    pub(crate) async fn settled_summary(
        &self,
        session: SessionId,
        turn: TurnId,
        include_artifacts: bool,
        include_gateway_billing: bool,
        include_child_billing: bool,
        child_billing_after: Option<GatewayChildBillingRef>,
    ) -> Result<(
        TurnOutcome,
        Option<CropArtifacts>,
        Option<&'static str>,
        Option<crate::gg::GatewayTurnBilling>,
    )> {
        let gateway = self
            .supervised_gateway()
            .filter(|owner| include_gateway_billing && owner.validate().is_ok())
            .cloned();
        let parent_gateway = gateway.clone();
        let (outcome, artifacts, image_generation, direct) = self
            .store
            .inspect_turn_with(session.clone(), turn.clone(), move |state| {
                let outcome = state
                    .outcome()
                    .cloned()
                    .ok_or_else(|| problem(ErrorKind::Unavailable, "turn_summary_unavailable"))?;
                Ok((
                    outcome,
                    include_artifacts.then(|| image_tools::artifacts(state)),
                    image_generation::summary_note(state),
                    parent_gateway
                        .as_ref()
                        .and_then(|owner| owner.retained_billing(state))
                        .map(|direct| {
                            (
                                direct,
                                sponsorship::retained_review_operations(state).unwrap_or_default(),
                            )
                        }),
                ))
            })
            .await?;
        let children = match gateway.as_ref().filter(|_| include_child_billing) {
            Some(gateway) => {
                let after = child_billing_after.is_some();
                let page = self
                    .gateway_child_billing(
                        session.clone(),
                        turn.clone(),
                        child_billing_after,
                        gateway.clone(),
                    )
                    .await;
                GatewayChildBillingPage::with_read_coverage(page, after)?
            }
            None => None,
        };
        let billing = if let (Some(gateway), Some((direct, review_operations))) = (gateway, direct)
        {
            let review = self
                .store
                .inspect_operation_claim_with(session, turn, review_operations, move |state| {
                    Ok(gateway.retained_billing(state))
                })
                .await
                .ok()
                .flatten()
                .flatten();
            Some(crate::gg::GatewayTurnBilling::new(direct, review).with_children(children))
        } else {
            children.map(|children| {
                crate::gg::GatewayTurnBilling::new(Default::default(), None)
                    .with_children(Some(children))
            })
        };
        Ok((outcome, artifacts, image_generation, billing))
    }

    async fn require_gateway_billing_parent(&self, session: &SessionId) -> Result<()> {
        let view = self.store.inspect(session.clone()).await?;
        self.check_execution(&view)?;
        if session_configuration(&view)?.subagent.is_some() {
            return Err(problem(
                ErrorKind::Unavailable,
                "gateway_child_billing_unavailable",
            ));
        }
        Ok(())
    }

    async fn gateway_child_billing(
        &self,
        session: SessionId,
        turn: TurnId,
        after: Option<GatewayChildBillingRef>,
        gateway: Arc<crate::gg::SupervisedGg>,
    ) -> Result<Option<GatewayChildBillingPage>> {
        if let Err(error) = self.require_gateway_billing_parent(&session).await {
            return match error.code.as_str() {
                "session_execution_configuration_changed" | "gateway_child_billing_unavailable" => {
                    Ok(None)
                }
                _ => Err(error),
            };
        }
        let parent = session.clone();
        let authority = gateway.binding.authority.clone();
        let page = self
            .store
            .turn_links(session, turn, after.map(Into::into), move |state| {
                Ok(gateway.retained_billing(state))
            })
            .await?;
        let mut coverage_incomplete = false;
        let mut assignments = Vec::new();
        let mut owned_page = true;
        for entry in page.entries {
            let profile = subagents::child_profile(&parent, &entry.configuration).ok();
            let Some(profile) =
                profile.filter(|profile| profile.require_authority(&authority).is_ok())
            else {
                coverage_incomplete = true;
                owned_page = false;
                continue;
            };
            assignments.push(GatewayChildBilling {
                child_id: entry.cursor.session,
                input_id: entry.cursor.input,
                name: profile.name().to_owned(),
                disposition: entry.disposition,
                billing: entry.turn.and_then(|(_, billing)| billing),
            });
        }
        Ok(Some(GatewayChildBillingPage {
            assignments,
            next_after: page.next_after.filter(|_| owned_page).map(Into::into),
            coverage_incomplete,
        }))
    }

    pub(crate) async fn headless_gateway_billing(
        &self,
        session: SessionId,
        turn: TurnId,
    ) -> Option<crate::gg::GatewayBillingProjection> {
        let gateway = self.gg_connection.clone()?;
        self.store
            .inspect_turn_with(session, turn, move |state| {
                Ok(state
                    .outcome()
                    .and_then(|_| gateway.retained_billing(state)))
            })
            .await
            .ok()
            .flatten()
    }

    pub(crate) async fn read_crop_artifact(
        &self,
        session: SessionId,
        turn: TurnId,
        id: OperationId,
    ) -> Result<Vec<u8>> {
        let unavailable = || problem(ErrorKind::Unavailable, "artifact_unavailable");
        let proof = self
            .store
            .inspect_turn_with(session.clone(), turn, move |state| {
                image_tools::artifact_proof(state, &id).ok_or_else(unavailable)
            })
            .await
            .map_err(|_| unavailable())?;
        let state_dir = self.state_dir.clone().ok_or_else(unavailable)?;
        let images = self
            .execution
            .as_ref()
            .and_then(|execution| execution.retained_inputs.clone());
        tokio::task::spawn_blocking(move || {
            let images = match images {
                Some(images) => images,
                None => Arc::new(retained_inputs::RetainedInputs::open(&state_dir)?),
            };
            images.read_working(session, &proof)
        })
        .await
        .map_err(|_| unavailable())?
        .map_err(|_| unavailable())
    }

    pub async fn start_prompt(&self, request: PromptRequest) -> Result<AcceptedRun> {
        let policy = self.submission_policy(&request, false)?;
        let ticket = self.register_prompt(request, false, policy).await?;
        let acceptance = prompt_acceptance(ticket.admission).await?;
        let InputDisposition::Claimed { turn } = acceptance.disposition else {
            return Err(problem(ErrorKind::Uncertain, "prompt_claim_missing"));
        };
        Ok(AcceptedRun {
            session: acceptance.session,
            turn,
            input: acceptance.input,
            position: acceptance.position,
            updates: ticket.updates,
            completion: ticket.completion,
        })
    }

    async fn register_prompt(
        &self,
        request: PromptRequest,
        identified: bool,
        policy: SubmissionPolicy,
    ) -> Result<LaunchTicket> {
        self.execution()?;
        let PromptRequest {
            id, session, parts, ..
        } = request;
        validate_prompt_parts(&parts)?;
        let launch = if identified
            && compaction::ordinary_text(
                policy.configuration_permission,
                policy.effort.is_some(),
                &parts,
            ) {
            Launch::Identified { id, parts, policy }
        } else {
            Launch::Prompt {
                id,
                parts,
                policy,
                publish_text: identified,
            }
        };
        let mut work = self.settled_work(&session).await?;
        self.register(&mut work, session, TurnId::new(uuid())?, launch)
    }

    /// The work table, once a session's settled turn has released its worker.
    /// A turn is recorded as settled before its worker finishes, so a request,
    /// compaction, revision or deletion sent right after the answer could
    /// otherwise find the session still running. Each caller still refuses a
    /// session whose turn has not settled.
    async fn settled_work(&self, session: &SessionId) -> Result<MutexGuard<'_, Work>> {
        let deadline = tokio::time::Instant::now() + SETTLING_WORKER_WAIT;
        loop {
            let released = self.changed.notified();
            tokio::pin!(released);
            released.as_mut().enable();
            let work = self.work.lock().await;
            if !work.active.contains_key(session) {
                return Ok(work);
            }
            drop(work);
            if self.store.inspect(session.clone()).await?.current.is_some()
                || tokio::time::timeout_at(deadline, released).await.is_err()
            {
                return Ok(self.work.lock().await);
            }
        }
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
        if work.retiring.contains(&session) {
            return Err(problem(ErrorKind::Conflict, "session_deletion_in_progress"));
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
        let task = async move {
            // The worker checks the same lock used for registration before
            // any durable claim, even when its requesting client disappears.
            let answered = match &launch {
                Launch::ResumeAnswered(position) => Some((&worker_turn, *position)),
                _ => None,
            };
            let sponsored = match &launch {
                Launch::ResumeSponsored(wake) => Some(wake.clone()),
                _ => None,
            };
            let explicit_resume = matches!(
                &launch,
                Launch::Resume(ClaimRequest {
                    selection: TurnSelection::ResumePaused { .. },
                    ..
                })
            );
            let live = match &launch {
                Launch::Prompt { publish_text, .. } => *publish_text,
                _ => true,
            }
            .then(|| host.live_updates.clone());
            let identified = matches!(&launch, Launch::Identified { .. });
            let queue_recovery = match &launch {
                Launch::Queued(_, revision) => *revision,
                _ => None,
            };
            let queue_admission = identified || matches!(&launch, Launch::Queued(..));
            let result = host.admit(&worker_session, &worker_turn, launch).await;
            let admitted = match result {
                Ok(Some(run)) => run,
                Ok(None) => {
                    host.finish_work(&worker_session, false, answered, sponsored.as_ref())
                        .await;
                    let _ = admission_tx.send(Ok(None));
                    host.wake_ready().await;
                    if identified {
                        host.kick_queue(worker_session).await;
                    }
                    return;
                }
                Err(error) => {
                    let queue_waiting = error.code == "session_queue_waiting";
                    let basis_changed = matches!(
                        error.code.as_str(),
                        "stale_session_revision" | "suspension_mismatch"
                    );
                    let retry_queue = queue_recovery.is_none()
                        && (queue_waiting
                            || (queue_admission
                                && (basis_changed || error.code == "history_basis_changed")));
                    host.finish_work(
                        &worker_session,
                        error.kind == ErrorKind::Uncertain,
                        answered.filter(|_| !basis_changed),
                        sponsored.as_ref().filter(|_| !basis_changed),
                    )
                    .await;
                    let _ = admission_tx.send(Err(error));
                    host.wake_ready().await;
                    if retry_queue {
                        host.kick_queue(worker_session).await;
                    }
                    return;
                }
            };
            let worker_turn = admitted.opened.turn.view().state.binding().turn.clone();
            let _ = admission_tx.send(Ok(admitted.acceptance));
            if explicit_resume {
                host.wake_ready().await;
            }
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
                        live,
                    )
                    .await;
                    if let Some(command) = command {
                        match permissions::finish_commands(command, &mut completion_tx).await {
                            Ok(()) => result,
                            Err(error) => {
                                // Leave queued inputs retained without automatically
                                // admitting more work after uncertain native cleanup.
                                let mut work = host.work.lock().await;
                                work.release_timer(&worker_session, &worker_turn);
                                work.ready.retain(|work| work.session() != &worker_session);
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
            if settled || result.is_err() {
                host.release_timer(&worker_session, &worker_turn).await;
            }
            let suspended = matches!(
                &result,
                Ok(RunResult::Suspended | RunResult::InputRequired(_))
            );
            host.finish_work(
                &worker_session,
                result.is_err(),
                settled.then_some((&worker_turn, JournalPosition(u64::MAX))),
                sponsored.as_ref(),
            )
            .await;
            if let Ok(outcome) = &result {
                live::publish_lifecycle(&host.live_updates, &worker_session, &worker_turn, outcome);
            }
            if let Some(completion_tx) = completion_tx {
                let _ = completion_tx.send(result);
            }
            host.wake_ready().await;
            if settled {
                host.kick_queue(worker_session).await;
            } else if suspended {
                host.kick_stopped(worker_session, worker_turn).await;
            }
        };
        self.workers.fetch_add(1, Ordering::Relaxed);
        let lifetime = WorkerLifetime {
            workers: self.workers.clone(),
            changed: self.changed.clone(),
        };
        let handle = tokio::spawn(async move {
            // Release the worker's Host clone before acknowledging shutdown.
            let _lifetime = lifetime;
            task.await;
        });
        work.ready.retain(|waiting| {
            waiting.session() != &session
                || matches!(
                    waiting,
                    ReadyWork::Answered { .. } | ReadyWork::Sponsored(_) | ReadyWork::Stop(..)
                )
        });
        work.active.insert(
            session,
            Active {
                turn,
                admitted: false,
                handle: handle.abort_handle(),
                pending_stop: None,
                missed_stop: false,
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
        let launch = match launch {
            Launch::Sponsored(request) => return self.admit_sponsored(*request).await,
            Launch::Identified { id, parts, policy } => {
                let _admission = self.configuration_admission.lock().await;
                let view = self.store.inspect(session.clone()).await?;
                self.check_execution(&view)?;
                require_idle(&view)?;
                if !view.queued.is_empty() {
                    return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
                }
                let title = self.title_candidate(&view, &parts);
                let input = self.capture_input(&view, id, parts, policy).await?;
                let accepted = self
                    .store
                    .submit_at_revision(session.clone(), input, view.revision)
                    .await?;
                self.start_title(title);
                Launch::Queued(Some(accepted), None)
            }
            other => other,
        };
        if let Launch::Queued(direct, recovery) = &launch
            && let Some((maintenance, candidate)) = self
                .select_queued_compaction(
                    session,
                    turn,
                    direct.as_ref().map(|acceptance| &acceptance.input),
                    *recovery,
                )
                .await
        {
            let mut admitted = self
                .admit_automatic_compaction(session, &maintenance, candidate)
                .await?;
            if let Some(admitted) = &mut admitted {
                admitted.acceptance = direct.clone().map(|accepted| {
                    DurableSubmission::accepted(accepted, InputDisposition::Queued)
                });
            }
            return Ok(admitted);
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
        let configuration_admission =
            if matches!(&launch, Launch::Prompt { .. } | Launch::Queued(..)) {
                Some(self.configuration_admission.lock().await)
            } else {
                None
            };
        let view = self.store.inspect(session.clone()).await?;
        if let Launch::Queued(_, Some(revision)) = &launch
            && revision != &view.revision
        {
            return Ok(None);
        }
        self.check_execution(&view)?;
        let SessionConfiguration { cwd, subagent, .. } = session_configuration(&view)?;
        let (claim_request, input, acceptance, history) = match launch {
            Launch::Prompt {
                id, parts, policy, ..
            } => {
                require_idle(&view)?;
                if !view.queued.is_empty() {
                    return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
                }
                let history = self.provider_history(session.clone(), None).await?;
                let title = self.title_candidate(&view, &parts);
                let input = self.capture_input(&view, id, parts, policy).await?;
                let acceptance = self.store.submit(session.clone(), input.clone()).await?;
                self.start_title(title);
                let view = self.store.inspect(session.clone()).await?;
                if view.queued.first().map(|head| &head.input.id) != Some(&input.id) {
                    return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
                }
                let claim = new_claim(
                    session.clone(),
                    turn.clone(),
                    view.revision,
                    vec![input.id.clone()],
                )?;
                (
                    WorkerClaim::Select(claim),
                    Some(input),
                    Some(acceptance),
                    history,
                )
            }
            Launch::Queued(direct, _) => {
                require_idle(&view)?;
                self.install_pending_automatic_compaction(&view).await?;
                if let Some(accepted) = &direct
                    && view.queued.first().map(|head| &head.input.id) != Some(&accepted.input)
                {
                    return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
                }
                let next = match subagents::queued_work(&view) {
                    Some(next) => next.clone(),
                    None => {
                        let Some(next) = self.goal_continuation(&view).await? else {
                            return Ok(None);
                        };
                        next
                    }
                };
                let history = self.provider_history(session.clone(), None).await?;
                let mut selected = Vec::new();
                if subagent.is_some() {
                    selected.extend(
                        view.queued
                            .iter()
                            .filter(|input| subagents::is_message(&input.input))
                            .map(|input| input.input.id.clone()),
                    );
                }
                selected.push(next.id.clone());
                let claim = new_claim(session.clone(), turn.clone(), view.revision, selected)?;
                (WorkerClaim::Select(claim), Some(next), direct, history)
            }
            resume @ (Launch::Resume(_)
            | Launch::ResumeAnswered(_)
            | Launch::ResumeSponsored(_)) => {
                let request = match resume {
                    Launch::Resume(request) => request,
                    Launch::ResumeAnswered(_) => {
                        let Some(request) = self.answered_claim(session, turn, &view).await? else {
                            return Ok(None);
                        };
                        request
                    }
                    Launch::ResumeSponsored(wake) => {
                        let Some(request) = wake.claim(&view)? else {
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
                let input = subagents::assignment_input(&inputs, subagent.is_some())?;
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
            Launch::Sponsored(_) | Launch::Identified { .. } => {
                unreachable!("launch handled before session lookup")
            }
        };
        let prepared = input
            .as_ref()
            .map(|input| {
                self.prepare_input(
                    execution,
                    session,
                    input,
                    subagent.as_ref(),
                    InputAuthority::RequireCaptured,
                )
            })
            .transpose()?;
        if prepared
            .as_ref()
            .is_some_and(|input| input.subagent != subagent.is_some())
        {
            return Err(problem(
                ErrorKind::InvalidState,
                "subagent_assignment_mismatch",
            ));
        }
        let mut sponsored_permissions = None;
        if prepared.is_some()
            && let Some(profile) = &subagent
        {
            profile.require_authority(&execution.authority.inference.authority)?;
            if let Some(sponsor) = profile.sponsorship() {
                self.require_sponsored_origin(profile.parent(), &sponsor.parent_turn)
                    .await?;
            }
            if let Some((input, capture)) = input.as_ref().zip(
                prepared
                    .as_ref()
                    .and_then(|input| input.permission_capture.as_ref()),
            ) {
                self.require_committed_primary_reviewer(profile, session, turn)
                    .await?;
                self.require_sponsored_primary_read(profile, &cwd, &input.id, capture)
                    .await?;
                sponsored_permissions =
                    Some(self.prepare_sponsored_primary_read(capture, session, turn)?);
            }
        }
        let claimed = match claim_request {
            WorkerClaim::Select(request) => {
                if !matches!(&request.selection, TurnSelection::New { .. })
                    && prepared.as_ref().is_some_and(|input| input.goal.is_some())
                {
                    goals::require_resumable(&view, turn)?;
                }
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
                                prepared.effort.as_ref(),
                            )
                        })
                        .transpose()?,
                    _ => None,
                };
                let reservation = if matches!(&request.selection, TurnSelection::New { .. }) {
                    subagent
                        .as_ref()
                        .map(|profile| profile.reserve(&view.driver_state))
                        .transpose()?
                } else {
                    None
                };
                match (change.or(reservation), input.as_ref(), prepared.as_ref()) {
                    (Some(change), Some(input), Some(prepared))
                        if matches!(prepared.goal, Some(goals::GoalInput::Continue(_))) =>
                    {
                        self.store
                            .submit_and_claim(request, input.clone(), change)
                            .await?
                    }
                    (Some(change), _, _) => {
                        self.store.claim_with_driver_state(request, change).await?
                    }
                    (None, _, _) => match (&request.selection, subagent.as_ref()) {
                        (TurnSelection::ResumePaused { .. }, Some(profile))
                            if profile.funded_turn(&view.driver_state, turn)? =>
                        {
                            self.claim_sponsored_resume(request, &view, profile).await?
                        }
                        (TurnSelection::ResumePaused { .. }, None) => {
                            self.claim_parent_resume(request, turn).await?
                        }
                        _ => self.store.claim(request).await?,
                    },
                }
            }
            WorkerClaim::Recover(request) => self.store.recover(request).await?,
        };
        drop(configuration_admission);
        let claim = match claimed {
            ClaimOutcome::Acquired(claim) => claim,
            ClaimOutcome::Existing(_) => return Ok(None),
        };
        let cancellation_only = prepared.is_none();
        let mut prepared = match prepared {
            Some(prepared) => prepared,
            None => {
                let input = subagents::assignment_input(&claim.inputs, subagent.is_some())
                    .map_err(|_| {
                        problem(ErrorKind::Uncertain, "retained_input_selection_invalid")
                    })?;
                self.prepare_input(
                    execution,
                    session,
                    input,
                    subagent.as_ref(),
                    InputAuthority::CancellationOnly,
                )
                .map_err(|_| problem(ErrorKind::Uncertain, "retained_input_unavailable"))?
            }
        };
        if let Some(profile) = &subagent {
            let mut messages = subagents::selected_messages(profile, &claim.inputs)?;
            messages.append(&mut prepared.messages);
            prepared.messages = messages;
        }
        let permission_scope = if let Some(permissions) = sponsored_permissions {
            permissions.bind_claim(claim.lease.binding().clone())?;
            Some(permissions)
        } else {
            prepared
                .permission_capture
                .as_ref()
                .map(|capture| {
                    self.bind_permissions(capture, claim.lease.binding().clone())
                        .map_err(|_| {
                            problem(ErrorKind::Uncertain, "admitted_permission_unavailable")
                        })
                })
                .transpose()?
        };
        let image = execution
            .image_tools
            .as_ref()
            .filter(|_| prepared.operating_regime.is_act() && !prepared.subagent)
            .map(|images| {
                image_tools::TurnImage::bind(
                    images.clone(),
                    claim.lease.binding(),
                    &history.messages,
                    &prepared.messages,
                )
            })
            .transpose()?
            .flatten();
        let file = prepared
            .retained_file
            .take()
            .map(|work| {
                let storage = execution.retained_inputs.clone().ok_or_else(|| {
                    problem(ErrorKind::Unsupported, "file_attachment_unavailable")
                })?;
                retained_file::TurnFile::bind(storage, claim.lease.binding(), work)
            })
            .transpose()?;
        let wakeups = prepared
            .allow_wakeups
            .then(|| wakeups::WakeupAccess::bind(self.clone(), claim.lease.binding()))
            .transpose()?;
        let mut authority = execution.authority.clone();
        let mut inventory = Inventory::new();
        let capture_image = execution
            .image_tools
            .as_ref()
            .filter(|_| execution.workspace_vision && !prepared.subagent)
            .map(|images| {
                images.workspace_image_capture(claim.lease.binding().session.clone(), cwd.clone())
            });
        let capture_reference = prepared
            .image_generation
            .as_ref()
            .filter(|image| image.workspace_reference())
            .and(execution.retained_inputs.as_ref())
            .map(|images| {
                images.workspace_reference_capture(claim.lease.binding().session.clone(), cwd)
            });
        let command = match &permission_scope {
            Some(permissions) if prepared.operating_regime.is_act() && !prepared.subagent => {
                permissions.insert_with_images(
                    &mut inventory,
                    &mut authority.tools,
                    capture_image,
                    capture_reference,
                )?
            }
            Some(permissions) => {
                // Plan withholds changes: a write-capable profile still
                // offers only the read tools outside Act.
                permissions.insert_file_tools(
                    &mut inventory,
                    &mut authority.tools,
                    capture_image,
                    prepared.operating_regime.is_act(),
                )?;
                None
            }
            None => None,
        };
        let command = match command {
            Some(command) => Some(command),
            None => permission_scope
                .as_ref()
                .map(|scope| scope.hook_command_tool())
                .transpose()?
                .flatten(),
        };
        let lifecycle_hooks = if cancellation_only || prepared.lifecycle_hooks.is_none() {
            None
        } else {
            lifecycle_hooks::LifecycleAccess::bind(
                claim.lease.binding(),
                permission_scope.as_ref(),
                command.as_ref(),
            )?
        };
        let completion = prepared
            .completion_authorized
            .then(|| {
                completion_checks::CompletionAccess::bind(
                    self,
                    claim.lease.binding(),
                    prepared.operating_regime,
                    permission_scope.as_ref(),
                    command.as_ref(),
                )
            })
            .transpose()?;
        let before_tool =
            if prepared.operating_regime.is_act() && !prepared.subagent && !cancellation_only {
                before_tool::BeforeToolCheck::bind(
                    claim.lease.binding(),
                    permission_scope.as_ref(),
                    command.as_ref(),
                )?
            } else {
                None
            };
        if let Some(image_generation) = prepared.image_generation.take() {
            let workspace_capture = authority.tools.get(&agent_kit_core::ToolId::new(
                crate::file_tools::CAPTURE_IMAGE_REFERENCE,
            )?);
            prepared.host_tools.push(image_generation.bind(
                self.store.clone(),
                execution,
                claim.lease.binding(),
                workspace_capture,
            )?);
        }
        let host_tools = prepared
            .host_tools
            .into_iter()
            .map(|owner| owner.bind(claim.lease.binding()))
            .collect::<Result<Vec<_>>>()?;
        let delegation = (!cancellation_only && prepared.effort.is_some())
            .then(|| sponsorship::DelegationAccess::bind(self, claim.lease.binding()))
            .transpose()?;
        let tool_authority = permissions::ToolAuthority::bind(
            execution.authorization.clone(),
            permission_scope.clone(),
            permissions::AttachmentTools {
                image: image.clone(),
                file: file.clone(),
            },
            wakeups.clone(),
            permissions::HookTools {
                completion: completion.clone(),
                before_tool: before_tool.clone(),
                lifecycle: lifecycle_hooks.clone(),
            },
            host_tools.clone(),
            delegation.clone(),
        );
        let goal_authority = if prepared.goal.is_some() {
            let (validator, gate): (Arc<dyn AuthorityValidator>, Arc<dyn ToolGate>) =
                match &tool_authority {
                    Some(authorization) => (authorization.clone(), authorization.clone()),
                    None => (
                        execution.authorization.clone(),
                        execution.authorization.clone(),
                    ),
                };
            Some(
                goals::GoalAuthority::bind(
                    &claim,
                    validator,
                    gate,
                    before_tool.clone(),
                    lifecycle_hooks.clone(),
                )
                .await
                .map_err(|_| {
                    problem(ErrorKind::Uncertain, "admitted_goal_authority_unavailable")
                })?,
            )
        } else {
            None
        };
        let provider = self.spending_provider(
            execution,
            prepared.spending.as_ref().filter(|_| !cancellation_only),
        )?;
        let spending_runtime = (!cancellation_only && prepared.spending.is_some())
            .then(|| {
                execution
                    .runtime
                    .with_provider(ProviderId::new("gg")?, provider.clone())
            })
            .transpose()?;
        let base_runtime = spending_runtime.as_ref().unwrap_or(&execution.runtime);
        let runtime = self
            .side_context
            .as_ref()
            .map(|_| {
                let authority = Arc::new(side_chats::InferenceOnly::new(execution));
                base_runtime.with_authorization(authority.clone(), authority)
            })
            .or_else(|| {
                goal_authority
                    .as_ref()
                    .map(|goal| base_runtime.with_authorization(goal.clone(), goal.clone()))
            })
            .or_else(|| {
                tool_authority.as_ref().map(|authorization| {
                    base_runtime.with_authorization(authorization.clone(), authorization.clone())
                })
            });
        let (opened, closing) = self
            .open_owned_turn_with_runtime(
                session,
                turn,
                claim.lease,
                runtime.as_ref().unwrap_or(base_runtime),
            )
            .await?;
        let operations = opened.turn.operations();
        if let Some(image) = image {
            image.insert(&mut inventory, &mut authority.tools)?;
        }
        if let Some(file) = &file {
            file.insert(&mut inventory, &mut authority.tools)?;
        }
        if prepared.questions {
            execution
                .questions
                .insert(operations.clone(), &mut inventory, &mut authority.tools)?;
        }
        if prepared.allow_library_selection {
            execution.questions.insert_library(
                operations.clone(),
                &mut inventory,
                &mut authority.tools,
            )?;
        }
        if let Some(wakeups) = &wakeups {
            wakeups.insert(operations.clone(), &mut inventory, &mut authority.tools)?;
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
        for host_tools in host_tools {
            host_tools.insert(&mut inventory, &mut authority.tools)?;
        }
        if let Some(goal) = goal_authority {
            goal.insert(&mut inventory, &mut authority.tools)?;
        }
        if let Some(delegation) = &delegation {
            delegation.insert(operations.clone(), &mut inventory, &mut authority.tools)?;
        }
        let selected = authority.tools.keys().cloned().collect::<Vec<_>>();
        if self.side_context.is_some() && !selected.is_empty() {
            return Err(problem(
                ErrorKind::InvalidState,
                "side_chat_tools_unavailable",
            ));
        }
        let tools = inventory.snapshot(&selected)?;
        if !closing && let Some(delegation) = &delegation {
            delegation.reconcile(&operations, &tools).await?;
        }
        if !closing && (prepared.questions || prepared.allow_library_selection) {
            execution.questions.reconcile(&operations, &tools).await?;
        }
        if !closing && let Some(wakeups) = &wakeups {
            wakeups.reconcile(&operations, &tools).await?;
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
        let mut master = Master::new(prepared.config, provider, tools, authority)?
            .with_history(prior)
            .with_input_limit(prepared.limit);
        if let Some(file) = file {
            master = master.with_retained_file_check(move || file.check());
        }
        if !cancellation_only
            && prepared.goal.is_none()
            && !prepared.subagent
            && permission_scope.is_some()
            && let Some(profile) = self
                .permissions
                .as_ref()
                .and_then(|profile| profile.automatic_read_review())
        {
            master = master.with_approval_reviewer(Arc::new(
                approval_review::AutomaticReadReview::new(self, profile, execution),
            ));
        }
        if let Some(effort) = prepared.effort {
            master = master
                .with_effort(effort)?
                .with_goal_child_work(Arc::new(sponsorship::GoalChildWork(self.store.clone())));
        }
        if prepared.goal.is_some()
            && let Some(permissions) = &permission_scope
            && let Some(verifier) = permissions.goal_read_verifier()
        {
            master = master.with_goal_verifier(verifier);
        }
        if let Some(checks) = prepared.completion_checks {
            let (inventory, grants) = match completion {
                Some(completion) => (completion.inventory()?, completion.grants()),
                None => (Inventory::new().snapshot(&[])?, BTreeMap::new()),
            };
            master = master.with_completion_checks(checks, inventory, grants);
        }
        if let Some(check) = before_tool {
            master = master.with_required_admission_check(check.grant());
        }
        if let Some(selected) = prepared.lifecycle_hooks {
            let (inventory, grants) = match lifecycle_hooks {
                Some(hooks) => (hooks.inventory()?, hooks.grants()),
                None => (Inventory::new().snapshot(&[])?, BTreeMap::new()),
            };
            master = master.with_lifecycle_hooks(selected, inventory, grants);
        }
        Ok(Some(Admitted {
            opened,
            work: TurnWork::Conversation {
                master: Box::new(master),
                input: prepared.messages,
                command,
            },
            acceptance: acceptance.map(|accepted| {
                DurableSubmission::accepted(
                    accepted,
                    InputDisposition::Claimed { turn: turn.clone() },
                )
            }),
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
            control(self, session.clone(), turn.clone(), ControlDirective::Pause)
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "admitted_turn_pause_failed"))?;
        }
        Ok((opened, closing))
    }

    fn check_execution(&self, view: &SessionView) -> Result<()> {
        let execution = self.execution()?;
        let configuration = session_configuration(view)?;
        if configuration.execution != execution.configuration
            && !(configuration.owner == execution.owner
                && Self::route_movable(view, &configuration, execution))
        {
            return Err(problem(
                ErrorKind::Conflict,
                "session_execution_configuration_changed",
            ));
        }
        Ok(())
    }

    /// A chat follows the person's model selection between turns, within the
    /// credential owner that created it. A turn
    /// always finishes under the route that claimed it, delegated sessions
    /// keep their parent's route, and an active Goal keeps the route its
    /// allowance and spending were measured against. Queued inputs keep the
    /// model and authority they were accepted under, so a chat holding one
    /// captured under another route stays on that route until the input runs
    /// or is withdrawn.
    fn route_movable(
        view: &SessionView,
        configuration: &SessionConfiguration,
        execution: &Execution,
    ) -> bool {
        view.current.is_none()
            && configuration.subagent.is_none()
            && goals::require_resolved_goal(&view.driver_state).is_ok()
            && view
                .queued
                .iter()
                .all(|queued| CapturedRoute::admits(&queued.input, execution))
    }

    fn submission_policy(
        &self,
        request: &PromptRequest,
        allow_wakeups: bool,
    ) -> Result<SubmissionPolicy> {
        let operating_regime = request.operating_regime.unwrap_or(self.operating_regime);
        if operating_regime.is_act() && !self.operating_regime.is_act() {
            return Err(problem(
                ErrorKind::Unsupported,
                "act_unavailable_on_plan_host",
            ));
        }
        let image_owner = self
            .desktop_image_generation
            .as_ref()
            .filter(|_| operating_regime.is_act() && !allow_wakeups && self.side_context.is_none());
        Ok(SubmissionPolicy {
            questions: request.questions,
            configuration_permission: request.configuration_permission,
            allow_wakeups,
            allow_library_selection: false,
            allow_host_tools: true,
            desktop_image_generation: image_owner
                .and_then(image_generation::DesktopImageGeneration::capture),
            allow_image_placement: image_owner
                .is_some_and(image_generation::DesktopImageGeneration::placement),
            editor_endpoint: None,
            editor_presentation: false,
            editor_svg_target: None,
            operating_regime,
            subagent: None,
            effort: self.capture_effort(request.effort.unwrap_or(self.effort))?,
            reasoning: request.reasoning,
            spending: None,
        })
    }

    async fn capture_input(
        &self,
        session: &SessionView,
        id: ChangeId,
        parts: Vec<PromptPart>,
        policy: SubmissionPolicy,
    ) -> Result<Submission> {
        let SubmissionPolicy {
            questions,
            configuration_permission,
            allow_wakeups,
            allow_library_selection,
            allow_host_tools,
            desktop_image_generation,
            allow_image_placement,
            editor_endpoint,
            editor_presentation,
            editor_svg_target,
            operating_regime,
            subagent,
            effort,
            reasoning,
            spending,
        } = policy;
        if !operating_regime.is_act() && allow_wakeups {
            return Err(problem(ErrorKind::Unsupported, "plan_wakeups_unavailable"));
        }
        validate_prompt_parts(&parts)?;
        let execution = self.execution()?;
        let configuration = self.with_configuration(Configuration::snapshot).await?;
        let child_work = subagent.is_some();
        if allow_library_selection
            && (!execution.tool_result_images || child_work || self.side_context.is_some())
        {
            return Err(problem(
                ErrorKind::Unsupported,
                "library_selection_unavailable",
            ));
        }
        if child_work != session_configuration(session)?.subagent.is_some() {
            return Err(problem(
                ErrorKind::Unsupported,
                "subagent_assignment_required",
            ));
        }
        let permission_capture = if child_work {
            None
        } else {
            self.capture_permissions(session, &id)?
        };
        let allow_reviewer_primary_read = effort.is_some()
            && permission_capture.is_some()
            && self
                .permissions
                .as_ref()
                .is_some_and(|profile| profile.allows_primary_review());
        let host_tools_capture =
            self.capture_host_tools(!child_work && allow_host_tools && operating_regime.is_act())?;
        let allow_image_placement = allow_image_placement && desktop_image_generation.is_some();
        let allow_image_reference = allow_library_selection
            && desktop_image_generation.is_some()
            && self
                .desktop_image_generation
                .as_ref()
                .is_some_and(image_generation::DesktopImageGeneration::references);
        let guidance = if child_work {
            None
        } else if self.side_context.is_some() {
            if questions
                || allow_wakeups
                || configuration_permission != crate::ConfigurationPermission::Disabled
                || parts
                    .iter()
                    .any(|part| !matches!(part, PromptPart::Text { .. }))
            {
                return Err(problem(ErrorKind::Unsupported, "side_chat_text_only"));
            }
            None
        } else {
            skills::capture_guidance(self.guidance_scope(session)?, &parts).await?
        };
        let parts = if parts
            .iter()
            .any(|part| matches!(part, PromptPart::Image { .. } | PromptPart::File { .. }))
        {
            if parts
                .iter()
                .any(|part| matches!(part, PromptPart::Image { .. }))
                && !self.accepts_images()
            {
                return Err(problem(ErrorKind::Unsupported, "image_input_unavailable"));
            }
            let storage = execution
                .retained_inputs
                .clone()
                .ok_or_else(|| problem(ErrorKind::Unsupported, "file_attachment_unavailable"))?;
            let cwd = session_configuration(session)?.cwd;
            let session = session.session.clone();
            let input = id.clone();
            tokio::task::spawn_blocking(move || {
                parts
                    .into_iter()
                    .map(|part| match part {
                        PromptPart::Image { image } => Ok(PromptPart::RetainedImage {
                            asset: storage.retain_image(&session, &cwd, &input, image)?,
                        }),
                        PromptPart::File { file } => Ok(PromptPart::RetainedFile {
                            work: storage.retain_file(&session, &cwd, &input, file)?,
                        }),
                        other => Ok(other),
                    })
                    .collect::<Result<Vec<_>>>()
            })
            .await
            .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))??
        } else {
            parts
        };
        let allow_attachment_reference = desktop_image_generation.is_some()
            && self
                .desktop_image_generation
                .as_ref()
                .is_some_and(image_generation::DesktopImageGeneration::attachment_references)
            && image_generation::attached_image(&parts, &session.session).is_some();
        let allow_workspace_reference = desktop_image_generation.is_some()
            && permission_capture.is_some()
            && self.supports_workspace_image_reference()
            && self
                .desktop_image_generation
                .as_ref()
                .is_some_and(image_generation::DesktopImageGeneration::workspace_references);
        let lifecycle_hooks = if permission_capture.is_some() {
            self.capture_lifecycle_hooks()?
        } else {
            None
        };
        Ok(Submission {
            id,
            payload: encode_stored_prompt(&StoredPrompt {
                lifecycle_hooks,
                spending,
                parts,
                configuration,
                max_output_tokens: execution.config.max_output_tokens,
                max_steps: Some(if child_work {
                    grida_agent_master::subagents::INFERENCE_STEPS_PER_ASSIGNMENT
                } else {
                    execution.config.max_steps
                }),
                effort,
                reasoning,
                model: Some(execution.config.model.clone()),
                authority: Some(CapturedAuthority {
                    principal: execution.authority.inference.authority.principal.clone(),
                    scope: execution.authority.inference.authority.scope.clone(),
                }),
                operating_regime,
                questions,
                allow_wakeups,
                allow_library_selection,
                configuration_permission,
                permission_capture,
                allow_reviewer_primary_read,
                host_tools_capture,
                desktop_image_generation,
                allow_image_reference,
                allow_attachment_reference,
                allow_workspace_reference,
                allow_image_placement,
                editor_endpoint,
                editor_presentation,
                editor_svg_target,
                guidance,
                goal: None,
                subagent,
                completion_checks: if child_work {
                    None
                } else {
                    self.capture_completion_checks(operating_regime)?
                },
            })?,
        })
    }

    fn prepare_input(
        &self,
        execution: &Execution,
        session: &SessionId,
        input: &Submission,
        subagent_profile: Option<&grida_agent_master::subagents::Profile>,
        authority: InputAuthority,
    ) -> Result<PreparedInput> {
        let mut config = execution.config.clone();
        let lifecycle_hooks;
        let spending;
        if self.side_context.is_some() {
            if !config.instructions.is_empty() {
                config.instructions.push_str("\n\n");
            }
            config
                .instructions
                .push_str(grida_agent_master::side_context::INSTRUCTIONS);
        }
        let cancellation_only = matches!(authority, InputAuthority::CancellationOnly);
        let mut host_tools = Vec::new();
        let mut image_generation = None;
        let subagent;
        let effort;
        let mut retained_file = None;
        let (
            messages,
            operating_regime,
            limit,
            questions,
            allow_wakeups,
            allow_library_selection,
            configuration_permission,
            captured,
            permission_capture,
            guidance,
            goal,
            completion_checks,
        ) = match input.payload.version() {
            INPUT_VERSION if input.payload.schema().as_str() == INPUT_SCHEMA => {
                let stored: StoredPrompt = decode_input(input)?;
                lifecycle_hooks = stored.lifecycle_hooks.clone();
                spending = stored.spending.clone();
                if !cancellation_only
                    && spending.is_some()
                    && (stored.host_tools_capture.is_some()
                        || stored.desktop_image_generation.is_some()
                        || stored.editor_endpoint.is_some()
                        || stored.allow_library_selection)
                {
                    return Err(problem(
                        ErrorKind::Unsupported,
                        "goal_spending_tool_scope_unavailable",
                    ));
                }
                if !cancellation_only {
                    retained_file = stored.parts.iter().find_map(|part| match part {
                        PromptPart::RetainedFile { work } => Some(work.clone()),
                        _ => None,
                    });
                    if retained_file.is_some()
                        && (subagent_profile.is_some() || self.side_context.is_some())
                    {
                        return Err(problem(
                            ErrorKind::InvalidState,
                            "retained_file_scope_mismatch",
                        ));
                    }
                }
                effort = stored.effort.clone();
                if !cancellation_only && effort.is_some() && !self.sponsorship_available() {
                    return Err(problem(ErrorKind::Unsupported, "delegation_unavailable"));
                }
                if !cancellation_only
                    && effort.is_some()
                    && stored.goal.is_some()
                    && !self.goal_sponsorship_available()
                {
                    return Err(goals::funded_review_unavailable());
                }
                subagent = stored.subagent.is_some();
                if let Some(assignment) = &stored.subagent {
                    let profile = subagent_profile.ok_or_else(|| {
                        problem(ErrorKind::InvalidState, "subagent_assignment_mismatch")
                    })?;
                    profile.require_assignment(assignment, !stored.operating_regime.is_act())?;
                    if !cancellation_only
                        && assignment.named_sponsorship.is_some()
                        && !self.goal_sponsorship_available()
                    {
                        return Err(goals::funded_review_unavailable());
                    }
                    if !cancellation_only
                        && !(if profile.sponsorship().is_some()
                            || assignment.named_sponsorship.is_some()
                        {
                            self.sponsorship_available()
                        } else {
                            self.subagents_available()
                        })
                    {
                        return Err(problem(ErrorKind::Unsupported, "subagents_unavailable"));
                    }
                    if stored.questions
                        || stored.allow_wakeups
                        || stored.allow_library_selection
                        || stored.configuration_permission
                            != crate::ConfigurationPermission::Disabled
                        || stored.allow_reviewer_primary_read
                        || (stored.permission_capture.is_some() && profile.sponsorship().is_none())
                        || stored.host_tools_capture.is_some()
                        || stored.desktop_image_generation.is_some()
                        || stored.allow_image_reference
                        || stored.allow_attachment_reference
                        || stored.allow_workspace_reference
                        || stored.allow_image_placement
                        || stored.editor_endpoint.is_some()
                        || stored.editor_presentation
                        || stored.editor_svg_target.is_some()
                        || stored.guidance.is_some()
                        || stored.goal.is_some()
                        || stored.effort.is_some()
                        || stored.completion_checks.is_some()
                        || !matches!(
                            stored.max_steps,
                            Some(1..=grida_agent_master::subagents::INFERENCE_STEPS_PER_ASSIGNMENT)
                        )
                        || !matches!(stored.parts.as_slice(), [PromptPart::Text { .. }])
                    {
                        return Err(problem(
                            ErrorKind::InvalidState,
                            "invalid_subagent_authority",
                        ));
                    }
                    config.instructions.push_str("\n\n");
                    config
                        .instructions
                        .push_str(grida_agent_master::subagents::INSTRUCTIONS);
                }
                if !cancellation_only
                    && stored.allow_library_selection
                    && !execution.tool_result_images
                {
                    return Err(problem(
                        ErrorKind::Unsupported,
                        "library_selection_unavailable",
                    ));
                }
                if !cancellation_only
                    && !self.operating_regime.is_act()
                    && stored.operating_regime.is_act()
                {
                    return Err(problem(ErrorKind::Conflict, "retained_act_requires_act"));
                }
                stored.operating_regime.apply(&mut config);
                if stored.editor_presentation {
                    config.instructions.push_str("\n\n");
                    config
                        .instructions
                        .push_str(grida_agent_master::presentation::INSTRUCTIONS);
                }
                if !cancellation_only
                    && stored.editor_svg_target.is_some()
                    && (stored.editor_endpoint.is_none() || stored.allow_wakeups)
                {
                    return Err(problem(ErrorKind::InvalidState, "invalid_svg_text_scope"));
                }
                if !cancellation_only
                    && stored.operating_regime.is_act()
                    && let Some(capture) = &stored.host_tools_capture
                {
                    host_tools.push(self.retained_host_tools(capture)?);
                }
                if !cancellation_only && let Some(endpoint) = &stored.editor_endpoint {
                    if !stored.operating_regime.is_act()
                        || stored.goal.is_some()
                        || subagent
                        || self.side_context.is_some()
                        || host_tools.iter().any(|tools| tools.has_local_surface())
                    {
                        return Err(problem(
                            ErrorKind::InvalidState,
                            "invalid_editor_surface_scope",
                        ));
                    }
                    host_tools.push(Arc::new(host_tools::HostTools::editor(
                        self.editor_surfaces.tool_host(
                            session.clone(),
                            endpoint.clone(),
                            stored.editor_presentation,
                            stored.editor_svg_target.clone(),
                        )?,
                        endpoint.clone(),
                        stored.editor_presentation,
                        stored.editor_svg_target.is_some(),
                    )?));
                }
                if !cancellation_only && let Some(binding) = &stored.desktop_image_generation {
                    if !stored.operating_regime.is_act()
                        || stored.allow_wakeups
                        || stored.goal.is_some()
                        || subagent
                        || self.side_context.is_some()
                        || (stored.allow_image_reference && !stored.allow_library_selection)
                    {
                        return Err(problem(
                            ErrorKind::InvalidState,
                            "invalid_image_generation_scope",
                        ));
                    }
                    let owner = self
                        .desktop_image_generation
                        .as_ref()
                        .filter(|owner| owner.capture().as_ref() == Some(binding))
                        .ok_or_else(|| {
                            problem(
                                ErrorKind::Unavailable,
                                "retained_image_generation_binding_unavailable",
                            )
                        })?;
                    let attachment = stored
                        .allow_attachment_reference
                        .then(|| {
                            image_generation::attached_image(&stored.parts, session)
                                .cloned()
                                .ok_or_else(|| {
                                    problem(
                                        ErrorKind::InvalidState,
                                        "invalid_attachment_reference_scope",
                                    )
                                })
                        })
                        .transpose()?;
                    image_generation = Some(owner.prepare(
                        stored.allow_image_reference,
                        stored.allow_image_placement,
                        attachment,
                        stored.allow_workspace_reference,
                    )?);
                    if stored.allow_workspace_reference
                        && (stored.permission_capture.is_none()
                            || !self.supports_workspace_image_reference())
                    {
                        return Err(image_generation::workspace_reference_unavailable());
                    }
                } else if !cancellation_only
                    && (stored.allow_image_reference
                        || stored.allow_image_placement
                        || stored.allow_attachment_reference
                        || stored.allow_workspace_reference)
                {
                    return Err(problem(
                        ErrorKind::InvalidState,
                        "invalid_image_generation_scope",
                    ));
                }
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
                if stored.allow_reviewer_primary_read {
                    config.instructions.push('\n');
                    config
                        .instructions
                        .push_str(grida_agent_master::effort::PRIMARY_READ_REVIEW_INSTRUCTIONS);
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
                    config
                        .instructions
                        .push_str(grida_agent_master::goals::INSTRUCTIONS);
                }
                config.max_steps = stored.max_steps.unwrap_or(1);
                config.max_output_tokens = stored.max_output_tokens.or(config.max_output_tokens);
                // A level the current model cannot take falls back to its default.
                config.reasoning = stored
                    .reasoning
                    .filter(|level| execution.supports_reasoning(*level));
                let messages = if matches!(&stored.goal, Some(goals::GoalInput::Continue(_))) {
                    if !stored.parts.is_empty() {
                        return Err(problem(
                            ErrorKind::InvalidState,
                            "invalid_goal_continuation",
                        ));
                    }
                    Vec::new()
                } else {
                    prompt_input(&input.id, &stored.parts)?
                };
                (
                    messages,
                    stored.operating_regime,
                    stored.configuration.defaults.context.max_input_tokens,
                    stored.questions,
                    !cancellation_only && stored.operating_regime.is_act() && stored.allow_wakeups,
                    !cancellation_only && stored.allow_library_selection,
                    stored
                        .configuration_permission
                        .for_regime(stored.operating_regime),
                    Some(stored.configuration),
                    if cancellation_only {
                        None
                    } else {
                        stored.permission_capture
                    },
                    guidance,
                    if cancellation_only { None } else { stored.goal },
                    stored.completion_checks,
                )
            }
            _ => {
                return Err(problem(
                    ErrorKind::Unsupported,
                    "unsupported_submission_schema",
                ));
            }
        };
        if !cancellation_only && lifecycle_hooks.is_some() && permission_capture.is_none() {
            return Err(problem(
                ErrorKind::Unavailable,
                "lifecycle_hook_scope_unavailable",
            ));
        }
        if !cancellation_only
            && lifecycle_hooks.is_some()
            && lifecycle_hooks != self.capture_lifecycle_hooks()?
        {
            return Err(problem(
                ErrorKind::Unavailable,
                "lifecycle_hook_profile_unavailable",
            ));
        }
        if let Some(capture) = &permission_capture {
            let permissions = self
                .permissions
                .as_ref()
                .ok_or_else(|| problem(ErrorKind::Unavailable, "permission_profile_unavailable"))?;
            if subagent {
                permissions.validate_primary_review(capture)?;
            } else {
                permissions.validate_capture(capture)?;
            }
        }
        if config.max_steps == 0 || config.max_output_tokens == Some(0) {
            return Err(problem(ErrorKind::InvalidInput, "invalid_master_limits"));
        }
        let completion_authorized = completion_checks.is_some() && !cancellation_only;
        if completion_authorized
            && completion_checks != self.capture_completion_checks(operating_regime)?
        {
            return Err(problem(
                ErrorKind::Unavailable,
                "completion_check_profile_unavailable",
            ));
        }
        Ok(PreparedInput {
            lifecycle_hooks,
            spending,
            config,
            effort,
            subagent,
            operating_regime,
            messages,
            retained_file,
            limit,
            questions,
            allow_wakeups,
            allow_library_selection,
            configuration_permission,
            captured,
            permission_capture,
            host_tools,
            image_generation,
            guidance,
            goal,
            completion_checks,
            completion_authorized,
        })
    }

    async fn kick_queue(&self, session: SessionId) {
        self.kick_queue_at(session, None).await;
    }

    async fn kick_queue_at(&self, session: SessionId, recovery: Option<SessionRevision>) {
        if self.work.lock().await.closed {
            return;
        }
        let Ok(view) = self.store.inspect(session.clone()).await else {
            return;
        };
        if view.admission_paused || recovery.is_some_and(|revision| revision != view.revision) {
            return;
        }
        if view.current.is_some() {
            if recovery.is_none() {
                self.kick_resumed_goal(&view, None).await;
            }
            return;
        }
        if subagents::queued_work(&view).is_none()
            && self.goal_continuation(&view).await.ok().flatten().is_none()
        {
            return;
        }
        let Ok(turn) = TurnId::new(uuid()) else {
            return;
        };
        let mut work = self.work.lock().await;
        if work.closed {
            return;
        }
        if work.active.contains_key(&session) || work.active.len() >= MAX_ACTIVE_RUNS {
            work.defer(ReadyWork::Queue(session, recovery));
            return;
        }
        // Dropping the automatic continuation ticket detaches its result
        // channels. The registered worker still owns the selected turn.
        let _ = self.register(&mut work, session, turn, Launch::Queued(None, recovery));
    }

    async fn wake_ready(&self) {
        let _wake = self.wake_lock.lock().await;
        loop {
            let scan_next = {
                let mut work = self.work.lock().await;
                if work.closed || work.active.len() >= MAX_ACTIVE_RUNS {
                    return;
                }
                let has_ready = work
                    .ready
                    .iter()
                    .any(|ready| !work.active.contains_key(ready.session()));
                let scan = (work.stop_scan_active || work.missed_stops)
                    && (work.stop_scan_turn || !has_ready);
                if scan {
                    work.stop_scan_turn = false;
                }
                scan
            };
            if scan_next {
                self.scan_missed_stops().await;
                continue;
            }
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
                work.stop_scan_turn = true;
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
                if let ReadyWork::Sponsored(wake) = &work.ready[index] {
                    let wake = wake.clone();
                    // An intervening message may stale the claim during
                    // preflight. Keep this readiness until its worker checks it.
                    if self
                        .register(
                            &mut work,
                            wake.binding.session.clone(),
                            wake.binding.turn.clone(),
                            Launch::ResumeSponsored(wake),
                        )
                        .is_err()
                    {
                        work.ready.remove(index);
                    }
                    continue;
                }
                work.ready.remove(index)
            };
            match next {
                Some(ReadyWork::Queue(session, recovery)) => {
                    self.kick_queue_at(session, recovery).await
                }
                Some(ReadyWork::GoalResume(wake)) => self.kick_goal_resume(wake).await,
                Some(ReadyWork::Stop(session, turn)) => self.kick_stopped(session, turn).await,
                Some(ReadyWork::Answered { .. }) => unreachable!("answered wake registered above"),
                Some(ReadyWork::Sponsored(_)) => unreachable!("sponsored wake registered above"),
                None => return,
            }
        }
    }

    async fn finish_work(
        &self,
        session: &SessionId,
        unverified: bool,
        remove_answered: Option<(&TurnId, JournalPosition)>,
        remove_sponsored: Option<&sponsorship::SponsoredWake>,
    ) {
        {
            let mut work = self.work.lock().await;
            work.unverified |= unverified;
            if let Some(active) = work.active.remove(session)
                && !work.closed
            {
                if let Some(turn) = active.pending_stop {
                    work.defer(ReadyWork::Stop(session.clone(), turn));
                }
                work.missed_stops |= active.missed_stop;
            }
            if let Some((turn, through)) = remove_answered {
                work.ready.retain(|ready| {
                    !(ready.wakes_answer(session, turn) && matches!(ready, ReadyWork::Answered { position, .. } if *position <= through))
                });
            }
            if let Some(wake) = remove_sponsored {
                work.ready.retain(
                    |ready| !matches!(ready, ReadyWork::Sponsored(pending) if pending == wake),
                );
            }
        }
        self.changed.notify_waiters();
    }

    pub async fn submit_prompt(&self, request: PromptRequest) -> Result<DurableSubmission> {
        self.submit_prompt_with_context(request, SubmissionContext::default())
            .await
    }

    pub(crate) async fn submit_prompt_with_context(
        &self,
        request: PromptRequest,
        context: SubmissionContext,
    ) -> Result<DurableSubmission> {
        validate_prompt_parts(&request.parts)?;
        if let Some(accepted) = self.existing_submission(&request, &context).await? {
            return Ok(accepted);
        }
        let mut policy = self.submission_policy(&request, context.allow_wakeups)?;
        let editor_endpoint = context.editor_endpoint.clone();
        let editor_svg_target = context.editor_svg_target.clone();
        if editor_svg_target.is_some() && (editor_endpoint.is_none() || context.allow_wakeups) {
            return Err(problem(
                ErrorKind::Unsupported,
                "svg_text_requires_attached_act",
            ));
        }
        if editor_endpoint.is_some()
            && (!policy.operating_regime.is_act()
                || !self.supports_editor_tools()
                || policy.configuration_permission == crate::ConfigurationPermission::Change
                || !request
                    .parts
                    .iter()
                    .all(|part| matches!(part, PromptPart::Text { .. })))
        {
            return Err(problem(
                ErrorKind::Unsupported,
                "editor_surface_requires_workspace_act_text",
            ));
        }
        policy.editor_endpoint = editor_endpoint;
        policy.editor_presentation = context.editor_presentation;
        policy.editor_svg_target = editor_svg_target;
        policy.allow_library_selection = context.allow_library_selection;
        let result = async {
            let ticket = self.register_prompt(request.clone(), true, policy).await?;
            prompt_acceptance(ticket.admission).await
        }
        .await;
        match result {
            Ok(accepted) => Ok(accepted),
            // An acceptance may have committed before the claim or response
            // failed. Re-read its identity and leave unclaimed input queued.
            Err(error) => self
                .existing_submission(&request, &context)
                .await?
                .ok_or(error),
        }
    }

    async fn existing_submission(
        &self,
        request: &PromptRequest,
        context: &SubmissionContext,
    ) -> Result<Option<DurableSubmission>> {
        let Some(view) = self
            .store
            .input(request.session.clone(), request.id.clone())
            .await?
        else {
            return Ok(None);
        };
        lifecycle::check_input(&view.input, &request.parts)?;
        let settings = InputSettings::for_input(&view.input)?;
        settings.require_effort(request.effort, request.reasoning)?;
        if request
            .operating_regime
            .is_some_and(|regime| regime != settings.operating_regime)
        {
            return Err(problem(
                ErrorKind::Conflict,
                "submission_operating_regime_changed",
            ));
        }
        if settings.allow_wakeups != context.allow_wakeups {
            return Err(problem(
                ErrorKind::Conflict,
                "submission_wakeup_permission_changed",
            ));
        }
        if settings.allow_library_selection != context.allow_library_selection {
            return Err(problem(
                ErrorKind::Conflict,
                "submission_library_selection_changed",
            ));
        }
        let requested = request
            .configuration_permission
            .for_regime(settings.operating_regime);
        if (settings.configuration_permission == crate::ConfigurationPermission::Change)
            != (requested == crate::ConfigurationPermission::Change)
        {
            return Err(problem(
                ErrorKind::Conflict,
                "submission_configuration_permission_changed",
            ));
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
        self.owned_control(move |host| async move {
            let receipt = host
                .control_sponsorship(ControlRequest {
                    id: request,
                    session: session.clone(),
                    expected_revision: expected_session,
                    action: SessionControl::PauseAndCancel {
                        turn: turn.clone(),
                        expected: expected_control,
                    },
                })
                .await?;
            host.release_timer(&session, &turn).await;
            host.kick_stopped(session, turn).await;
            host.kick_sponsored_stop(&receipt).await;
            Ok(receipt.source)
        })
        .await
    }

    pub async fn configuration_inspect(&self) -> Result<ConfigurationInspection> {
        let mut inspection = self.with_configuration(Configuration::inspect).await?;
        inspection.exact_input_counting = self.execution.as_ref().is_some_and(|execution| {
            matches!(&execution.authorization.credential, Credential::Http(transport) if transport.supports_exact_input_counting())
        });
        Ok(inspection)
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
        let receipt = control(
            self,
            session.clone(),
            turn.clone(),
            ControlDirective::Cancel,
        )
        .await?;
        self.release_timer(&session, &turn).await;
        if let Some(receipt) = &receipt {
            self.kick_sponsored_stop(receipt).await;
        }
        Ok(())
    }

    pub async fn shutdown(&self) -> Result<()> {
        let deadline = tokio::time::Instant::now() + SHUTDOWN_TIMEOUT;
        let active = {
            let mut work = tokio::time::timeout_at(deadline, self.work.lock())
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "host_shutdown_timeout"))?;
            work.closed = true;
            if let Some(host_tools) = &self.host_tools {
                host_tools.close();
            }
            for timer in work.timers.values() {
                timer.cancel();
            }
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
                    control(self, session.clone(), turn.clone(), ControlDirective::Pause).await?;
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
                        && self.workers.load(Ordering::Acquire) == 0
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

    pub(crate) fn accepts_images(&self) -> bool {
        self.execution
            .as_ref()
            .is_some_and(|execution| execution.accepts_selected_png)
    }

    pub(crate) fn accepts_files(&self) -> bool {
        self.execution
            .as_ref()
            .is_some_and(|execution| execution.retained_inputs.is_some())
    }
}

impl From<GatewayChildBillingRef> for TurnLinkCursor {
    fn from(reference: GatewayChildBillingRef) -> Self {
        Self {
            session: reference.child_id,
            input: reference.input_id,
        }
    }
}

impl From<TurnLinkCursor> for GatewayChildBillingRef {
    fn from(cursor: TurnLinkCursor) -> Self {
        Self {
            child_id: cursor.session,
            input_id: cursor.input,
        }
    }
}

impl Execution {
    fn supports_reasoning(&self, level: agent_kit_core::inference::ReasoningEffort) -> bool {
        self.provider
            .capabilities(&self.config.model)
            .is_ok_and(|capabilities| capabilities.reasoning.contains(&level))
    }

    fn new(
        state_dir: &Path,
        options: ProviderOptions,
        supervised: Option<crate::SupervisedProvider>,
        retained_inputs: Option<Arc<retained_inputs::RetainedInputs>>,
    ) -> Result<Self> {
        let transport = Arc::new(HttpTransport::new(state_dir, &options, supervised)?);
        let configuration = transport.selection();
        let binding = transport.binding().clone();
        let mut capabilities = text_capabilities(options.protocol.as_str())?;
        if options.reasoning {
            capabilities.reasoning = agent_kit_core::inference::ReasoningEffort::ALL
                .into_iter()
                .collect();
        }
        let compatible_png = transport.accepts_compatible_png(&options.model);
        let gemini_flash = transport.is_reviewed_gemini_flash();
        let image_profile = if options.protocol == ProviderProtocol::Responses
            && options.model.as_str() == "gpt-5.4"
        {
            Some("responses-image-tools-v1")
        } else if compatible_png {
            Some("openrouter-png-tools-v1")
        } else if gemini_flash {
            Some("gemini-flash-png-v1")
        } else {
            None
        };
        let images = if let Some(profile) = image_profile.filter(|_| retained_inputs.is_some()) {
            capabilities.revision = BindingId::new(profile)?;
            capabilities.input_modalities.insert(Modality::Image);
            retained_inputs.clone()
        } else {
            None
        };
        let workspace_vision = images.is_some() && options.protocol == ProviderProtocol::Responses;
        let compatible_tool_images = compatible_png && images.is_some();
        let image_resolver = images.as_ref().map(|images| {
            let images = images.clone();
            Arc::new(move |media: &agent_kit_core::messages::MediaRef, maximum| {
                images.resolve(media, maximum)
            }) as Arc<agent_kit_providers::InputImageResolver>
        });
        let provider: Arc<dyn Provider> = match options.protocol {
            ProviderProtocol::OpenAiCompatible => {
                let provider = OpenAiCompatible::with_image_resolver(
                    binding.clone(),
                    BTreeMap::from([(
                        options.model.clone(),
                        ModelProfile {
                            capabilities,
                            output_limit: match options.compatible_output_limit_field {
                                Some(CompatibleOutputLimitField::MaxTokens) => {
                                    OutputLimitField::Tokens
                                }
                                Some(CompatibleOutputLimitField::MaxCompletionTokens) | None => {
                                    OutputLimitField::CompletionTokens
                                }
                            },
                            include_usage: true,
                            reasoning_field: if transport.reasoning_object() {
                                agent_kit_providers::ReasoningField::Object
                            } else {
                                agent_kit_providers::ReasoningField::Effort
                            },
                        },
                    )]),
                    transport.clone(),
                    PROVIDER_LIMITS,
                    image_resolver,
                )?;
                Arc::new(if options.llama_cpp_input_count {
                    provider.with_llama_cpp_input_count()?
                } else if compatible_tool_images {
                    provider.with_retained_png_tool_results()
                } else {
                    provider
                })
            }
            ProviderProtocol::Anthropic => Arc::new(Anthropic::new(
                binding.clone(),
                BTreeMap::from([(options.model.clone(), capabilities)]),
                transport.clone(),
                PROVIDER_LIMITS,
            )?),
            ProviderProtocol::Responses => Arc::new(Responses::with_image_resolver(
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
                image_resolver,
            )?),
            ProviderProtocol::Gemini => Arc::new(Gemini::with_image_resolver(
                binding.clone(),
                transport.replay_binding().cloned().ok_or_else(|| {
                    problem(ErrorKind::InvalidState, "provider_replay_binding_missing")
                })?,
                BTreeMap::from([(
                    options.model.clone(),
                    GeminiProfile {
                        capabilities,
                        requires_tool_signatures: gemini_flash,
                    },
                )]),
                transport.clone(),
                PROVIDER_LIMITS,
                image_resolver,
            )?),
        };
        let mut execution = Self::compose(
            configuration,
            options.model,
            Some(options.max_output_tokens),
            provider,
            binding,
            Credential::Http(transport),
        )?;
        execution.accepts_selected_png = images.is_some();
        execution.image_tools = images;
        execution.workspace_vision = workspace_vision;
        execution.tool_result_images = workspace_vision || compatible_tool_images;
        Ok(execution)
    }

    fn new_gg(
        options: GgOptions,
        scope: Fingerprint,
        binding: ProviderBinding,
        transport: Arc<dyn StreamingTransport>,
        credential: Credential,
        retained_inputs: Option<Arc<retained_inputs::RetainedInputs>>,
    ) -> Result<Self> {
        let configuration = Fingerprint::of(&("gg-chat-selection-v1", scope, &options.model))?;
        let images = retained_inputs.filter(|_| match &credential {
            Credential::Gg(connection) => connection.accepts_retained_png(&options.model),
            Credential::SupervisedGg(connection) => connection.accepts_retained_png(&options.model),
            _ => false,
        });
        let mut capabilities = text_capabilities("gg")?;
        let image_resolver = images.as_ref().map(|images| {
            let images = images.clone();
            Arc::new(move |media: &agent_kit_core::messages::MediaRef, maximum| {
                images.resolve_selected_image(media, maximum)
            }) as Arc<agent_kit_providers::InputImageResolver>
        });
        if image_resolver.is_some() {
            capabilities.revision = BindingId::new("gg-selected-png-v1")?;
            capabilities.input_modalities.insert(Modality::Image);
        }
        let profile = ModelProfile {
            capabilities,
            output_limit: OutputLimitField::CompletionTokens,
            include_usage: true,
            reasoning_field: Default::default(),
        };
        let spending_profile = Arc::new(spending::ProviderProfile {
            binding: binding.clone(),
            model: options.model.clone(),
            profile: profile.clone(),
            images: image_resolver.clone(),
        });
        let provider = OpenAiCompatible::with_image_resolver(
            binding.clone(),
            BTreeMap::from([(options.model.clone(), profile)]),
            transport,
            PROVIDER_LIMITS,
            image_resolver,
        )?
        // The first-party chat route uses this typed rejection only for
        // its pre-dispatch throttle. Downstream 429s have a different type.
        .with_admission_rate_limit_evidence();
        let mut execution = Self::compose(
            configuration,
            options.model,
            Some(options.max_output_tokens),
            Arc::new(provider),
            binding,
            credential,
        )?;
        execution.accepts_selected_png = images.is_some();
        execution.spending_profile = Some(spending_profile);
        Ok(execution)
    }

    fn new_chatgpt(
        model: ModelId,
        connection: Arc<crate::chatgpt_subscription::SupervisedChatGpt>,
    ) -> Result<Self> {
        let configuration = Fingerprint::of(&(
            "chatgpt-subscription-selection-v1",
            &connection.replay_binding,
            &model,
        ))?;
        let binding = connection.binding.clone();
        let provider = Arc::new(Responses::new(
            binding.clone(),
            connection.replay_binding.clone(),
            ResponsesEndpoint::Restricted,
            BTreeMap::from([(
                model.clone(),
                ResponsesProfile {
                    capabilities: ModelCapabilities {
                        reasoning: agent_kit_core::inference::ReasoningEffort::ALL
                            .into_iter()
                            .collect(),
                        ..text_capabilities("chatgpt-subscription")?
                    },
                    wire_model: connection.wire_model.clone(),
                    reasoning_effort: Some(agent_kit_providers::ResponsesReasoningEffort::Medium),
                },
            )]),
            connection.clone(),
            PROVIDER_LIMITS,
        )?);
        Self::compose(
            configuration,
            model,
            None,
            provider,
            binding,
            Credential::SupervisedChatGpt(connection),
        )
    }

    fn compose(
        configuration: Fingerprint,
        model: ModelId,
        max_output_tokens: Option<u64>,
        provider: Arc<dyn Provider>,
        binding: ProviderBinding,
        credential: Credential,
    ) -> Result<Self> {
        let inference = GrantSelection {
            authority: binding.authority,
            grants: Vec::new(),
        };
        let owner = match &credential {
            Credential::Http(_) => Fingerprint::of(&"local-credential-owner-v1")?,
            Credential::Gg(connection) => Fingerprint::of(&("gg-owner-v1", connection.scope))?,
            Credential::SupervisedGg(connection) => {
                Fingerprint::of(&("gg-owner-v1", connection.scope))?
            }
            Credential::SupervisedChatGpt(connection) => {
                Fingerprint::of(&("chatgpt-owner-v1", &connection.replay_binding))?
            }
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
                max_operations: MAX_TURN_OPERATIONS,
                max_concurrent_inferences: MAX_ACTIVE_RUNS,
                max_concurrent_tools: 1,
                max_output_bytes: 512 * 1024,
                operation_timeout: MODEL_TIMEOUT,
                observer_capacity: UPDATE_CAPACITY,
            },
        })?;
        Ok(Self {
            configuration,
            owner,
            runtime,
            config: MasterConfig {
                model,
                instructions: CORE_INSTRUCTIONS.trim().into(),
                max_steps: MAX_TURN_STEPS,
                max_output_tokens,
                reasoning: Default::default(),
            },
            provider,
            spending_profile: None,
            authority: MasterAuthority {
                inference,
                tools: BTreeMap::new(),
            },
            authorization,
            questions,
            configuration_tools,
            accepts_selected_png: false,
            image_tools: None,
            workspace_vision: false,
            tool_result_images: false,
            retained_inputs: None,
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
        reasoning: Default::default(),
    })
}

enum Credential {
    Http(Arc<HttpTransport>),
    Gg(Arc<GgConnection>),
    SupervisedGg(Arc<crate::gg::SupervisedGg>),
    SupervisedChatGpt(Arc<crate::chatgpt_subscription::SupervisedChatGpt>),
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
                Credential::SupervisedGg(connection) => connection.validate(),
                Credential::SupervisedChatGpt(connection) => connection.validate(),
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
    live: Option<broadcast::Sender<live::LiveUpdate>>,
) -> Result<RunResult> {
    let agent_kit_runtime::OpenedTurn { turn, mut observer } = opened;
    let binding = observer.snapshot().state.binding().clone();
    let mut live = live.map(|sender| live::Publisher::new(sender, binding.clone()));
    let review = turn
        .operations()
        .operation_id(&grida_agent_master::approval_review::operation_key())?;
    let mut publish = |update| {
        if matches!(&update, TurnUpdate::Inference { operation, .. } | TurnUpdate::Operation { operation, .. }
            if operation == &review)
        {
            return;
        }
        if let Some(live) = &mut live {
            live.update(&update);
        }
        let _ = updates.send(update);
    };
    let mut observer_open = true;
    let outcome = {
        let run = master.run(turn, input);
        tokio::pin!(run);
        loop {
            tokio::select! {
                outcome = &mut run => break outcome,
                update = observer.next(), if observer_open => match update {
                    Some(update) => publish(update),
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
            publish(update);
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
                let library_selections = library::pending(&state)?.selections;
                if !questions.questions.is_empty()
                    || !approvals.is_empty()
                    || !library_selections.is_empty()
                {
                    return Ok(RunResult::InputRequired(PendingInteractions {
                        questions,
                        approvals,
                        library_selections,
                    }));
                }
            }
            Ok(RunResult::Suspended)
        }
    }
}

async fn control(
    host: &Host,
    session: SessionId,
    turn: TurnId,
    directive: ControlDirective,
) -> Result<Option<OperationPairReceipt>> {
    for _ in 0..4 {
        let session_view = host.store.inspect(session.clone()).await?;
        let turn_view = host
            .store
            .inspect_turn(session.clone(), turn.clone())
            .await?;
        // A worker can still be releasing its lease after durable suspension.
        // Host shutdown preserves the recorded pause state of that waiting task.
        if matches!(turn_view.disposition, TurnDisposition::Settled)
            || (directive == ControlDirective::Cancel && turn_view.controls.cancelled)
            || (directive == ControlDirective::Pause
                && (turn_view.disposition == TurnDisposition::Suspended
                    || turn_view.controls.paused
                    || turn_view.controls.cancelled))
        {
            return Ok(None);
        }
        if session_view
            .current
            .as_ref()
            .map(|current| &current.binding.turn)
            != Some(&turn)
        {
            return Err(problem(ErrorKind::Conflict, "control_turn_changed"));
        }
        let result = host
            .control_sponsorship(agent_kit_sessions::ControlRequest {
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
            Ok(receipt) => return Ok(Some(receipt)),
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
    inputs: Vec<ChangeId>,
) -> Result<ClaimRequest> {
    Ok(ClaimRequest {
        id: change_id()?,
        session,
        expected_revision: revision,
        selection: TurnSelection::New { turn, inputs },
    })
}

fn encode_stored_prompt(prompt: &StoredPrompt) -> Result<Envelope> {
    encode(INPUT_SCHEMA, INPUT_VERSION, prompt)
}

/// Whether a payload is an input this host stored.
fn is_stored_input(payload: &Envelope) -> bool {
    payload.schema().as_str() == INPUT_SCHEMA && payload.version() == INPUT_VERSION
}

fn decode_input<T: serde::de::DeserializeOwned>(input: &Submission) -> Result<T> {
    serde_json::from_slice(input.payload.bytes())
        .map_err(|_| problem(ErrorKind::InvalidState, "invalid_submission"))
}

pub(crate) fn validate_prompt_parts(parts: &[PromptPart]) -> Result<()> {
    let mut uploads = 0;
    let mut files = 0;
    for part in parts {
        match part {
            PromptPart::Image { .. } => uploads += 1,
            PromptPart::File { .. } => files += 1,
            PromptPart::RetainedImage { .. } => {
                return Err(problem(
                    ErrorKind::InvalidInput,
                    "retained_image_not_supplied",
                ));
            }
            PromptPart::RetainedFile { .. } => {
                return Err(problem(
                    ErrorKind::InvalidInput,
                    "retained_file_not_supplied",
                ));
            }
            _ => {}
        }
    }
    if uploads > 1 {
        return Err(problem(ErrorKind::LimitExceeded, "image_count_limit"));
    }
    if files > 1 || files > 0 && uploads > 0 {
        return Err(problem(
            ErrorKind::LimitExceeded,
            "file_attachment_count_limit",
        ));
    }
    validate_prompt_record(parts)
}

fn validate_prompt_record(parts: &[PromptPart]) -> Result<()> {
    if parts.is_empty() || parts.len() > MAX_PROMPT_PARTS {
        return Err(problem(ErrorKind::InvalidInput, "invalid_prompt_parts"));
    }
    let metadata: Vec<_> = parts
        .iter()
        .filter(|part| !matches!(part, PromptPart::Image { .. } | PromptPart::File { .. }))
        .collect();
    let bytes = serde_json::to_vec(&metadata)
        .map_err(|_| problem(ErrorKind::InvalidInput, "prompt_encoding_failed"))?;
    if bytes.len() > MAX_PROMPT_BYTES {
        return Err(problem(ErrorKind::LimitExceeded, "prompt_too_large"));
    }
    Ok(())
}

fn prompt_input(id: &ChangeId, parts: &[PromptPart]) -> Result<Vec<Message>> {
    validate_prompt_record(parts)?;
    let content = parts
        .iter()
        .map(|part| {
            Ok(match part {
                PromptPart::Text { text } => Content::Text(text.clone()),
                reference @ PromptPart::ResourceLink { .. } => {
                    // A reference is context supplied by the user. It is neither
                    // imported nor granted filesystem or network authority here.
                    Content::Text(serde_json::to_string(reference).expect("serializable reference"))
                }
                PromptPart::Skill { reference } => {
                    Content::Text(format!("\n\nSelected skill {}.", reference.name()))
                }
                PromptPart::Image { .. } => {
                    return Err(problem(
                        ErrorKind::InvalidInput,
                        "image_input_requires_acceptance",
                    ));
                }
                PromptPart::RetainedImage { asset } => Content::Media(images::media(asset)?),
                PromptPart::File { .. } => {
                    return Err(problem(
                        ErrorKind::InvalidInput,
                        "file_input_requires_acceptance",
                    ));
                }
                PromptPart::RetainedFile { work } => {
                    Content::Media(retained_file::media(work.asset())?)
                }
            })
        })
        .collect::<Result<Vec<_>>>()?;
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
    decode_session_configuration(&view.configuration)
}

fn decode_session_configuration(config: &Envelope) -> Result<SessionConfiguration> {
    if config.schema().as_str() != SESSION_SCHEMA || config.version() != SESSION_VERSION {
        return Err(problem(
            ErrorKind::Unsupported,
            "unsupported_session_configuration",
        ));
    }
    let configuration: SessionConfiguration = serde_json::from_slice(config.bytes())
        .map_err(|_| problem(ErrorKind::InvalidState, "invalid_session_configuration"))?;
    if let Some(subagent) = &configuration.subagent {
        subagent.validate()?;
    }
    Ok(configuration)
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
