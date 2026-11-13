use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::driver_state::{DriverStateChange, DriverStateRevision, DriverStateSnapshot};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{
    DispatchEvidence, FailureKind, InferenceControl, InferenceFailure, InferenceOutcome,
    InferenceRequest, InferenceRun, InferenceStatus, InferenceUpdate, InputFormat,
    InputMeasurement, MeasurementKind, Modality, ModelCapabilities, PreparedRequest, Provider,
    ProviderBinding, ProviderEvent, RequestControl, UsageObservation,
};
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, ResultContent, Role,
    ToolArguments, ToolCall,
};
use agent_kit_core::tools::{
    Inventory, InventorySnapshot, Invocation, InvocationContext, RecoveryKind, Tool,
    ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{
    CommitReceipt, ControlDirective, ControlReader, ControlRevision, ControlSnapshot,
    JournalAction, JournalChange, OperationOutcome, ResponseContract, TurnBinding, TurnJournal,
    TurnLease, TurnOutcome, TurnState, WaitRecord, bind_lease,
};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, GrantId, MessageId, ModelId,
    PrincipalId, ProviderId, Result, SchemaId, ScopeId, SessionId, ToolCallId, ToolId, TurnId,
    WaitId,
};
use agent_kit_runtime::{
    AdmissionContext, CompletionDraft, ExecutionLimits, ExecutionServices, FinishOutcome,
    InvokeOutcome, OperationKey, PlannedInvocation, Runtime, ToolAdmission, ToolDecision, ToolGate,
    TurnObserver, TurnOperations, TurnView,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ClaimedTurn, ControlRequest, CreateSession, RecoveryRequest,
    SessionControl, SessionStore, Submission, TurnControl, TurnDisposition, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use futures_util::stream;
use grida_agent_master::effort::{Policy as EffortPolicy, Preset};
use grida_agent_master::goals::{Allowance, Blocker, Goal, Objective, Status, Usage, WorkOutcome};
use grida_agent_master::hooks::{
    CheckInvocation, CheckMode, CheckStatus, CompletionCheck, CompletionChecks,
};
use grida_agent_master::{
    Master, MasterAuthority, MasterConfig, MasterOutcome, OperatingRegime, StopReason,
    approval_review, lifecycle_hooks, read_account, subagents,
};
use std::collections::{BTreeMap, BTreeSet};
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tempfile::TempDir;

fn session_id() -> SessionId {
    SessionId::new("conversation").unwrap()
}
fn turn_id() -> TurnId {
    TurnId::new("turn").unwrap()
}
fn change_id(value: &str) -> ChangeId {
    ChangeId::new(value).unwrap()
}
fn provider_id() -> ProviderId {
    ProviderId::new("script").unwrap()
}
fn tool_id() -> ToolId {
    ToolId::new("echo").unwrap()
}
fn review_tool_id() -> ToolId {
    ToolId::new("review_independently").unwrap()
}
fn envelope(value: &str) -> Envelope {
    Envelope::new(
        SchemaId::new("test.text").unwrap(),
        1,
        value.as_bytes().to_vec(),
    )
    .unwrap()
}
fn authority() -> AuthorityBinding {
    AuthorityBinding {
        principal: PrincipalId::new("test").unwrap(),
        binding: BindingId::new("local").unwrap(),
        scope: ScopeId::new("test").unwrap(),
    }
}
fn grants() -> GrantSelection {
    GrantSelection {
        authority: authority(),
        grants: vec![GrantId::new("execute").unwrap()],
    }
}
fn message(id: &str, role: Role, content: Content) -> Message {
    Message {
        id: MessageId::new(id).unwrap(),
        role,
        phase: None,
        content: vec![content],
        provenance: Provenance {
            source: "fixture".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    }
}
fn input() -> Vec<Message> {
    vec![message(
        "input",
        Role::User,
        Content::Text("Complete the task".into()),
    )]
}

#[derive(Clone, Copy)]
enum Script {
    Answer,
    AdmissionLimit(u64),
    UsageAnswer,
    Failure(FailureKind),
    DeadlineCut,
    ToolThenAnswer,
    ToolAndDeferred,
    Tools,
    /// One reply that makes this many tool calls, then an answer.
    ParallelTools(usize),
    EffortReview,
    GoalReport {
        call: &'static str,
    },
}

struct ScriptProvider {
    script: Script,
    calls: AtomicUsize,
    requests: Mutex<Vec<InferenceRequest>>,
    measurement: Mutex<Option<InputMeasurement>>,
    measured_requests: Mutex<Vec<InferenceRequest>>,
    hold_next_count: Mutex<Option<Arc<tokio::sync::Notify>>>,
    authority: Mutex<AuthorityBinding>,
    capabilities: Mutex<ModelCapabilities>,
    prepare_failure: Mutex<Option<Error>>,
}

impl Provider for ScriptProvider {
    fn measure_input(&self, request: &PreparedRequest) -> Result<InputMeasurement> {
        self.measured_requests
            .lock()
            .unwrap()
            .push(request.request().clone());
        self.measurement
            .lock()
            .unwrap()
            .ok_or_else(|| Error::new(ErrorKind::Unsupported, "input_measurement_unavailable"))
    }

    fn measure_input_async<'a>(
        &'a self,
        request: &'a PreparedRequest,
        _: RequestControl,
    ) -> BoxFuture<'a, std::result::Result<InputMeasurement, InferenceFailure>> {
        Box::pin(async move {
            let result = self
                .measure_input(request)
                .map_err(|error| InferenceFailure {
                    kind: FailureKind::Configuration,
                    code: error.code,
                    retry_after_ms: None,
                    dispatch: None,
                });
            let held = self.hold_next_count.lock().unwrap().take();
            if let Some(entered) = held {
                entered.notify_one();
                std::future::pending::<()>().await;
            }
            result
        })
    }

    fn capabilities(&self, _: &ModelId) -> Result<ModelCapabilities> {
        Ok(self.capabilities.lock().unwrap().clone())
    }
    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        if let Some(error) = self.prepare_failure.lock().unwrap().clone() {
            return Err(error);
        }
        let capabilities = self.capabilities(&request.model)?;
        PreparedRequest::from_validated(
            request,
            ProviderBinding {
                provider: provider_id(),
                authority: self.authority.lock().unwrap().clone(),
            },
            capabilities,
        )
    }
    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        if request.capabilities() != &self.capabilities(&request.request().model)? {
            return Err(Error::new(
                ErrorKind::Conflict,
                "prepared_provider_binding_changed",
            ));
        }
        let index = self.calls.fetch_add(1, Ordering::SeqCst);
        self.requests
            .lock()
            .unwrap()
            .push(request.request().clone());
        if let Script::AdmissionLimit(delay) = self.script
            && index == 0
        {
            let outcome = InferenceOutcome {
                status: InferenceStatus::Failed,
                messages: Vec::new(),
                usage: Vec::new(),
                failure: Some(InferenceFailure {
                    kind: FailureKind::RateLimit,
                    code: "rate_limit".into(),
                    retry_after_ms: Some(delay),
                    dispatch: Some(DispatchEvidence::RejectedBeforeExecution),
                }),
                receipt: None,
                terminal_receipt: None,
            };
            return Ok(InferenceRun::from_stream(control, move |_| {
                Box::pin(stream::iter([ProviderEvent::Finished(outcome)]))
            }));
        }
        let tools = matches!(self.script, Script::Tools)
            || matches!(
                self.script,
                Script::ToolThenAnswer | Script::ToolAndDeferred
            ) && index == 0;
        let mut content = if tools {
            let call = ToolCall {
                id: ToolCallId::new(format!("call-{index}"))?,
                tool: tool_id(),
                arguments: ToolArguments::Json(serde_json::json!({ "value": "echoed" })),
            };
            vec![Content::ToolCall(call)]
        } else {
            vec![Content::Text("Finished".into())]
        };
        if let Script::ParallelTools(count) = self.script
            && index == 0
        {
            content = (0..count)
                .map(|call| {
                    Ok(Content::ToolCall(ToolCall {
                        id: ToolCallId::new(format!("parallel-{call}"))?,
                        tool: tool_id(),
                        arguments: ToolArguments::Json(serde_json::json!({ "value": "echoed" })),
                    }))
                })
                .collect::<Result<_>>()?;
        }
        if let Script::GoalReport { call } = self.script {
            content = if index == 0 {
                vec![Content::ToolCall(ToolCall {
                    id: ToolCallId::new("goal-check")?,
                    tool: tool_id(),
                    arguments: ToolArguments::Json(serde_json::json!({"value":"opened"})),
                })]
            } else if index == 1 {
                vec![Content::ToolCall(ToolCall {
                    id: ToolCallId::new("goal-report")?,
                    tool: ToolId::new("goal_report")?,
                    arguments: ToolArguments::Json(serde_json::json!({"report": {
                        "kind":"completion", "summary":"The export was verified",
                        "evidence":[{"criterion":1,"call":call}]
                    }})),
                })]
            } else {
                content
            };
        }
        if matches!(self.script, Script::EffortReview) {
            let parts = || {
                request
                    .request()
                    .messages
                    .iter()
                    .flat_map(|message| &message.content)
            };
            let prompted = request.request().messages.first().is_some_and(|system| {
                system.role == Role::System && system.content.iter().any(|part| {
                    matches!(part, Content::Text(text) if text.contains("Ultra effort is active."))
                })
            });
            if prompted {
                content = if index == 0 {
                    assert!(
                        request
                            .request()
                            .tools
                            .iter()
                            .any(|offer| offer.id == review_tool_id())
                    );
                    vec![Content::ToolCall(ToolCall {
                        id: ToolCallId::new("review-first")?,
                        tool: review_tool_id(),
                        arguments: ToolArguments::Json(serde_json::json!({"expected":3})),
                    })]
                } else {
                    let finding = parts()
                        .find_map(|part| match part {
                            Content::ToolResult(result)
                                if result.call.as_str() == "review-first" =>
                            {
                                match result.content.as_slice() {
                                    [ResultContent::Text(finding)] => Some(finding),
                                    _ => None,
                                }
                            }
                            _ => None,
                        })
                        .expect("the recorded independent finding");
                    vec![Content::Text(format!("Independent review: {finding}"))]
                };
            }
        }
        if matches!(self.script, Script::ToolAndDeferred) && index == 0 {
            content.push(Content::ToolCall(ToolCall {
                id: ToolCallId::new(format!("deferred-{index}"))?,
                tool: tool_id(),
                arguments: ToolArguments::Json(serde_json::json!({ "value": "ask" })),
            }));
        }
        let mut events: Vec<_> = content
            .iter()
            .filter_map(|part| match part {
                Content::ToolCall(call) => Some(ProviderEvent::Update(InferenceUpdate::ToolCall(
                    call.clone(),
                ))),
                _ => None,
            })
            .collect();
        let usage = if matches!(self.script, Script::UsageAnswer) {
            [
                ("input_tokens", 1, 5),
                ("input_tokens", 2, 7),
                ("cached_input_tokens", 2, 2),
                ("input_tokens", 1, 5),
            ]
            .into_iter()
            .map(|(category, revision, quantity)| UsageObservation {
                attempt: control.attempt.clone(),
                source: "fixture".into(),
                category: category.into(),
                unit: "tokens".into(),
                revision,
                quantity,
                certainty: MeasurementKind::Exact,
                final_value: revision == 2,
            })
            .collect()
        } else {
            vec![]
        };
        let (status, failure) = if let Script::Failure(kind) = self.script {
            let status = if matches!(kind, FailureKind::ContextLimit | FailureKind::OutputLimit) {
                InferenceStatus::Limited
            } else {
                InferenceStatus::Failed
            };
            (
                status,
                Some(InferenceFailure {
                    kind,
                    code: "fixture_failure".into(),
                    retry_after_ms: None,
                    dispatch: None,
                }),
            )
        } else if matches!(self.script, Script::DeadlineCut) {
            (
                InferenceStatus::Interrupted,
                Some(InferenceFailure {
                    kind: FailureKind::Cancelled,
                    code: "deadline".into(),
                    retry_after_ms: None,
                    dispatch: None,
                }),
            )
        } else {
            (InferenceStatus::Completed, None)
        };
        let outcome = InferenceOutcome {
            status,
            messages: vec![Message {
                id: MessageId::new(format!("answer-{index}"))?,
                role: Role::Assistant,
                phase: None,
                content,
                provenance: Provenance {
                    source: "fixture".into(),
                    kind: ProvenanceKind::Supplied,
                    fingerprint: None,
                },
            }],
            usage,
            failure,
            receipt: None,
            terminal_receipt: None,
        };
        events.push(ProviderEvent::Finished(outcome));
        Ok(InferenceRun::from_stream(control, move |_| {
            Box::pin(stream::iter(events))
        }))
    }
}

struct EchoTool {
    definition: ToolDefinition,
    calls: AtomicUsize,
    uncertain: AtomicBool,
}
impl EchoTool {
    fn new() -> Self {
        Self {
            definition: ToolDefinition {
                id: tool_id(),
                version: 1,
                description: "Returns a supplied value".into(),
                input: InputFormat::Json(serde_json::json!({ "type": "object" })),
                max_input_bytes: 4096,
                max_output_bytes: 4096,
                recovery: RecoveryKind::Unavailable,
            },
            calls: AtomicUsize::new(0),
            uncertain: AtomicBool::new(false),
        }
    }
}
impl Tool for EchoTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        if matches!(arguments, ToolArguments::Json(value) if value.get("value").is_some_and(serde_json::Value::is_string))
        {
            Ok(())
        } else {
            Err(Error::new(ErrorKind::InvalidInput, "value_missing"))
        }
    }
    fn invoke(&self, invocation: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        if self.uncertain.load(Ordering::SeqCst) {
            return Box::pin(async { ToolOutcome::uncertain() });
        }
        let ToolArguments::Json(arguments) = invocation.arguments() else {
            unreachable!()
        };
        let value = arguments["value"].as_str().unwrap().to_owned();
        Box::pin(async move {
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![ResultContent::Text(value)],
                structured: None,
                receipt: None,
                truncated: false,
            }
        })
    }
}

struct IndependentReview {
    definition: ToolDefinition,
    child: subagents::Profile,
    allocation: Mutex<DriverStateSnapshot>,
    invocations: AtomicUsize,
}

impl Tool for IndependentReview {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        if matches!(arguments, ToolArguments::Json(input) if input["expected"].as_u64().is_some()) {
            Ok(())
        } else {
            Err(Error::new(
                ErrorKind::InvalidInput,
                "expected_count_missing",
            ))
        }
    }

    fn invoke(&self, invocation: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.invocations.fetch_add(1, Ordering::SeqCst);
            let mut state = self.allocation.lock().unwrap();
            let reservation = match self.child.reserve(&state) {
                Ok(reservation) => reservation,
                Err(error) => return ToolOutcome::failed(&error.code),
            };
            state.apply(reservation).unwrap();
            let ToolArguments::Json(input) = invocation.arguments() else {
                unreachable!()
            };
            let actual = ["title", "body"].len();
            let expected = input["expected"].as_u64().unwrap();
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![ResultContent::Text(format!(
                    "The inspected layout has {actual} items. The assignment expected {expected}."
                ))],
                structured: None,
                receipt: None,
                truncated: false,
            }
        })
    }
}

struct Granted(Vec<GrantSelection>);
impl AuthorityValidator for Granted {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            if self.0.contains(&request.selection) {
                Ok(())
            } else {
                Err(Error::new(ErrorKind::InvalidInput, "unexpected_grant"))
            }
        })
    }
}
struct Permit;
impl ToolGate for Permit {
    fn decide(&self, _: ToolAdmission, _: AdmissionContext) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async { Ok(ToolDecision::Permit) })
    }
}

struct Fixture {
    directory: TempDir,
    provider: Arc<ScriptProvider>,
    tool: Arc<EchoTool>,
    inventory: InventorySnapshot,
    max_operations: usize,
}
impl Fixture {
    fn new(script: Script) -> Self {
        let directory = tempfile::tempdir().unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700))
                .unwrap();
        }
        let provider = Arc::new(ScriptProvider {
            script,
            calls: AtomicUsize::new(0),
            requests: Mutex::new(vec![]),
            measurement: Mutex::new(None),
            measured_requests: Mutex::new(vec![]),
            hold_next_count: Mutex::new(None),
            authority: Mutex::new(authority()),
            capabilities: Mutex::new(ModelCapabilities {
                revision: BindingId::new("script-v1").unwrap(),
                input_modalities: BTreeSet::from([Modality::Text]),
                json_tools: true,
                text_tools: true,
                max_output_tokens: Some(4096),
                reasoning: Default::default(),
            }),
            prepare_failure: Mutex::new(None),
        });
        let tool = Arc::new(EchoTool::new());
        let mut inventory = Inventory::new();
        inventory.insert(tool.clone()).unwrap();
        Self {
            directory,
            provider,
            tool,
            inventory: inventory.snapshot(&[tool_id()]).unwrap(),
            max_operations: 64,
        }
    }
    fn store(&self) -> SqliteStore {
        SqliteStore::open(self.directory.path().join("sessions.sqlite")).unwrap()
    }
    fn install_review(&mut self) -> Arc<IndependentReview> {
        let review = Arc::new(IndependentReview {
            definition: ToolDefinition {
                id: review_tool_id(),
                version: 1,
                description: "Run one independent read-only layout review.".into(),
                input: InputFormat::Json(serde_json::json!({"type":"object"})),
                max_input_bytes: 4096,
                max_output_bytes: 4096,
                recovery: RecoveryKind::Unavailable,
            },
            child: subagents::Profile::new(session_id(), "Reviewer".into(), 1, &authority())
                .unwrap(),
            allocation: Mutex::new(DriverStateSnapshot::default()),
            invocations: AtomicUsize::new(0),
        });
        let mut inventory = Inventory::new();
        inventory.insert(self.tool.clone()).unwrap();
        inventory.insert(review.clone()).unwrap();
        self.inventory = inventory.snapshot(&[tool_id(), review_tool_id()]).unwrap();
        review
    }

    fn effort(&self, preset: Preset) -> EffortPolicy {
        let offer = self
            .inventory
            .offers()
            .unwrap()
            .into_iter()
            .find(|offer| offer.id == review_tool_id())
            .unwrap();
        EffortPolicy::capture(
            preset,
            NonZeroU32::new(2).unwrap(),
            NonZeroU32::new(6).unwrap(),
            Some((&offer, &self.grants())),
        )
        .unwrap()
    }
    async fn reopen(&self) -> SqliteStore {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            match SqliteStore::open(self.directory.path().join("sessions.sqlite")) {
                Ok(store) => return store,
                Err(error)
                    if error.code == "store_already_owned"
                        && tokio::time::Instant::now() < deadline =>
                {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                Err(error) => panic!("database ownership did not settle: {error}"),
            }
        }
    }
    fn runtime(&self) -> Runtime {
        self.runtime_with_gate(Arc::new(Permit))
    }
    fn runtime_with_gate(&self, gate: Arc<dyn ToolGate>) -> Runtime {
        self.runtime_granting(gate, vec![])
    }
    fn runtime_granting(&self, gate: Arc<dyn ToolGate>, private: Vec<GrantSelection>) -> Runtime {
        let provider: Arc<dyn Provider> = self.provider.clone();
        let mut accepted = vec![self.grants()];
        accepted.extend(private);
        Runtime::new(ExecutionServices {
            providers: BTreeMap::from([(provider_id(), provider)]),
            tools: self.inventory.clone(),
            authority: Arc::new(Granted(accepted)),
            gate,
            limits: ExecutionLimits {
                max_operations: self.max_operations,
                max_concurrent_inferences: 1,
                max_concurrent_tools: 2,
                max_output_bytes: 64 * 1024,
                operation_timeout: Duration::from_secs(5),
                observer_capacity: 64,
            },
        })
        .unwrap()
    }
    fn master(&self, steps: u32, instructions: &str) -> Master {
        self.master_in(steps, instructions, OperatingRegime::Act)
    }
    fn master_in(&self, steps: u32, instructions: &str, regime: OperatingRegime) -> Master {
        let mut config = MasterConfig {
            model: ModelId::new("model").unwrap(),
            instructions: instructions.into(),
            max_steps: steps,
            max_output_tokens: Some(1024),
            reasoning: Default::default(),
        };
        regime.apply(&mut config);
        Master::new(
            config,
            self.provider.clone(),
            self.inventory.clone(),
            MasterAuthority {
                inference: self.grants(),
                tools: match self.provider.script {
                    Script::Answer => BTreeMap::new(),
                    Script::GoalReport { .. } | Script::EffortReview | Script::Tools => self
                        .inventory
                        .offers()
                        .unwrap()
                        .into_iter()
                        .map(|offer| (offer.id, self.grants()))
                        .collect(),
                    _ => BTreeMap::from([(tool_id(), self.grants())]),
                },
            },
        )
        .unwrap()
    }
    fn grants(&self) -> GrantSelection {
        GrantSelection {
            authority: self.provider.authority.lock().unwrap().clone(),
            grants: grants().grants,
        }
    }
    async fn claim(&self, store: &SqliteStore) -> ClaimedTurn {
        store
            .create(CreateSession {
                id: session_id(),
                request: change_id("create"),
                configuration: envelope("configuration"),
            })
            .await
            .unwrap();
        store
            .submit(
                session_id(),
                Submission {
                    id: change_id("input"),
                    payload: envelope("Complete the task"),
                },
            )
            .await
            .unwrap();
        let request = ClaimRequest {
            id: change_id("claim"),
            session: session_id(),
            expected_revision: store.inspect(session_id()).await.unwrap().revision,
            selection: TurnSelection::New {
                turn: turn_id(),
                inputs: vec![change_id("input")],
            },
        };
        let ClaimOutcome::Acquired(claim) = store.claim(request).await.unwrap() else {
            panic!("expected execution ownership")
        };
        claim
    }
    async fn recover(&self, store: &SqliteStore) -> ClaimedTurn {
        let ClaimOutcome::Acquired(claim) = store
            .recover(RecoveryRequest {
                id: change_id("recover"),
                session: session_id(),
                turn: turn_id(),
                expected_epoch: 1,
            })
            .await
            .unwrap()
        else {
            panic!("expected recovery ownership")
        };
        claim
    }
}

#[derive(Clone, Copy)]
enum PublicationInterruption {
    BeforeCommit,
    BeforeSettlement,
    BeforeOutcome,
    BeforeDispatch,
    AfterRequestCheckpoint,
    ControlAfterCommit(ControlDirective),
    ControlBeforeBoundary(ControlDirective),
    InputAfterCommit,
    QuestionAfterCommit,
    InputBeforeBoundary,
}

/// Injects a boundary event after provider/tool outcomes are durable.
struct InterruptPublication {
    lease: Arc<TurnLease>,
    armed: AtomicBool,
    loads_before_control: AtomicUsize,
    interruption: PublicationInterruption,
}
impl TurnJournal for InterruptPublication {
    fn binding(&self) -> &TurnBinding {
        self.lease.binding()
    }
    fn load(&self) -> BoxFuture<'_, Result<TurnState>> {
        Box::pin(async move {
            if matches!(
                self.interruption,
                PublicationInterruption::ControlBeforeBoundary(_)
                    | PublicationInterruption::InputBeforeBoundary
            ) {
                let previous = self.loads_before_control.fetch_update(
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                    |remaining| remaining.checked_sub(1),
                );
                if previous == Ok(1) {
                    let action = match self.interruption {
                        PublicationInterruption::ControlBeforeBoundary(directive) => {
                            JournalAction::Control(directive)
                        }
                        PublicationInterruption::InputBeforeBoundary => {
                            JournalAction::AppendHistory(vec![HistoryRecord::Message(message(
                                "late-input",
                                Role::User,
                                Content::Text("Apply this correction".into()),
                            ))])
                        }
                        _ => unreachable!(),
                    };
                    let state = self.lease.journal().load().await?;
                    let change = JournalChange::new(
                        change_id("racing-control"),
                        state.binding().clone(),
                        state.position(),
                        state.controls().revision,
                        vec![action],
                    )?;
                    self.lease.journal().commit(change).await?;
                }
            }
            self.lease.journal().load().await
        })
    }
    fn commit(&self, change: JournalChange) -> BoxFuture<'_, Result<CommitReceipt>> {
        let publishes_history = change
            .actions()
            .iter()
            .any(|action| matches!(action, JournalAction::AppendHistory(_)));
        let publishes_continuation = change
            .actions()
            .iter()
            .any(|action| matches!(action, JournalAction::SetCheckpoint(_)));
        let boundary_matches = match self.interruption {
            PublicationInterruption::BeforeSettlement => change
                .actions()
                .iter()
                .any(|action| matches!(action, JournalAction::Settle(_))),
            PublicationInterruption::AfterRequestCheckpoint => {
                publishes_continuation && !publishes_history
            }
            PublicationInterruption::BeforeDispatch => change
                .actions()
                .iter()
                .any(|action| matches!(action, JournalAction::StartAttempt { .. })),
            PublicationInterruption::BeforeOutcome => change
                .actions()
                .iter()
                .any(|action| matches!(action, JournalAction::CompleteAttempt { .. })),
            _ => publishes_history && publishes_continuation,
        };
        let interrupt = boundary_matches && self.armed.swap(false, Ordering::SeqCst);
        if !interrupt {
            return self.lease.journal().commit(change);
        }
        Box::pin(async move {
            match self.interruption {
                PublicationInterruption::AfterRequestCheckpoint => {
                    self.lease.journal().commit(change).await?;
                    Err(Error::new(
                        ErrorKind::Unavailable,
                        "request_checkpoint_interrupted",
                    ))
                }
                PublicationInterruption::BeforeCommit
                | PublicationInterruption::BeforeSettlement
                | PublicationInterruption::BeforeOutcome
                | PublicationInterruption::BeforeDispatch => Err(Error::new(
                    ErrorKind::Unavailable,
                    "publication_interrupted",
                )),
                PublicationInterruption::ControlBeforeBoundary(_)
                | PublicationInterruption::InputBeforeBoundary => {
                    let receipt = self.lease.journal().commit(change).await?;
                    self.loads_before_control.store(2, Ordering::SeqCst);
                    Ok(receipt)
                }
                PublicationInterruption::ControlAfterCommit(directive) => {
                    let receipt = self.lease.journal().commit(change).await?;
                    let state = self.lease.journal().load().await?;
                    let control = JournalChange::new(
                        change_id("injected-control"),
                        state.binding().clone(),
                        state.position(),
                        state.controls().revision,
                        vec![JournalAction::Control(directive)],
                    )?;
                    self.lease.journal().commit(control).await?;
                    Ok(receipt)
                }
                PublicationInterruption::InputAfterCommit => {
                    let receipt = self.lease.journal().commit(change).await?;
                    let state = self.lease.journal().load().await?;
                    let contribution = JournalChange::new(
                        change_id("incoming-steering"),
                        state.binding().clone(),
                        state.position(),
                        state.controls().revision,
                        vec![JournalAction::AppendHistory(vec![HistoryRecord::Message(
                            message(
                                "steering",
                                Role::User,
                                Content::Text("Use the revised direction".into()),
                            ),
                        )])],
                    )?;
                    self.lease.journal().commit(contribution).await?;
                    Ok(receipt)
                }
                PublicationInterruption::QuestionAfterCommit => {
                    let receipt = self.lease.journal().commit(change).await?;
                    let state = self.lease.journal().load().await?;
                    let question = JournalChange::new(
                        change_id("registered-question"),
                        state.binding().clone(),
                        state.position(),
                        state.controls().revision,
                        vec![JournalAction::OpenWait(WaitRecord {
                            id: WaitId::new("question")?,
                            request: envelope("Choose the direction"),
                            response: ResponseContract {
                                schema: SchemaId::new("test.text")?,
                                version: 1,
                            },
                            answer: None,
                            withdrawn: false,
                        })],
                    )?;
                    self.lease.journal().commit(question).await?;
                    Ok(receipt)
                }
            }
        })
    }
    fn lookup(&self, id: ChangeId) -> BoxFuture<'_, Result<Option<CommitReceipt>>> {
        if matches!(
            self.interruption,
            PublicationInterruption::AfterRequestCheckpoint
        ) && !self.armed.load(Ordering::SeqCst)
        {
            return Box::pin(async {
                Err(Error::new(ErrorKind::Unavailable, "journal_disconnected"))
            });
        }
        self.lease.journal().lookup(id)
    }
}
struct ForwardControls {
    lease: Arc<TurnLease>,
}
impl ControlReader for ForwardControls {
    fn binding(&self) -> &TurnBinding {
        self.lease.binding()
    }
    fn read(&self) -> BoxFuture<'_, Result<ControlSnapshot>> {
        self.lease.controls().read()
    }
    fn changed(&self, revision: ControlRevision) -> BoxFuture<'_, Result<ControlSnapshot>> {
        self.lease.controls().changed(revision)
    }
}
fn interrupted(lease: TurnLease) -> TurnLease {
    intercept_publication(lease, PublicationInterruption::BeforeCommit)
}

fn intercept_publication(lease: TurnLease, interruption: PublicationInterruption) -> TurnLease {
    let binding = lease.binding().clone();
    let lease = Arc::new(lease);
    let journal = InterruptPublication {
        lease: Arc::clone(&lease),
        armed: AtomicBool::new(true),
        loads_before_control: AtomicUsize::new(0),
        interruption,
    };
    bind_lease(
        binding,
        Box::new(journal),
        Arc::new(ForwardControls { lease }),
    )
    .unwrap()
}

struct ReviewedCheck {
    definition: ToolDefinition,
    calls: AtomicUsize,
    result: CheckStatus,
}

impl Tool for ReviewedCheck {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, args: &ToolArguments) -> Result<()> {
        CheckInvocation::read(args).map(|_| ())
    }

    fn invoke(&self, invocation: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let invocation = CheckInvocation::read(invocation.arguments()).unwrap();
            assert!(invocation.occurrence.has_text);
            self.calls.fetch_add(1, Ordering::SeqCst);
            let (status, reply) = match self.result {
                CheckStatus::Allowed => (
                    OutcomeStatus::Succeeded,
                    Some(serde_json::json!({"decision":"allow"})),
                ),
                CheckStatus::Denied => (
                    OutcomeStatus::Succeeded,
                    Some(
                        serde_json::json!({"decision":"deny","reason":"The result failed verification."}),
                    ),
                ),
                CheckStatus::Uncertain => (OutcomeStatus::Uncertain, None),
                _ => unreachable!("unsupported test check result"),
            };
            ToolOutcome {
                status,
                content: Vec::new(),
                structured: reply,
                receipt: None,
                truncated: false,
            }
        })
    }
}

#[tokio::test]
async fn settlement_recovery_reuses_the_original_candidate_and_completion_check() {
    recover_completion_check(CheckStatus::Allowed, OutcomeStatus::Succeeded, "Finished").await;
}

#[tokio::test]
async fn blocked_completion_accounts_for_retained_work_without_replaying_the_check() {
    recover_completion_check(
        CheckStatus::Denied,
        OutcomeStatus::Failed,
        "A required completion check did not pass. Review the recorded work before continuing.",
    )
    .await;
    recover_completion_check(
        CheckStatus::Uncertain,
        OutcomeStatus::Uncertain,
        "A required completion check could not be verified. Review the recorded work before continuing.",
    )
    .await;
}

async fn recover_completion_check(
    check_result: CheckStatus,
    outcome_status: OutcomeStatus,
    text: &str,
) {
    let fixture = Fixture::new(Script::ToolThenAnswer);
    let store = fixture.store();
    let handler = Arc::new(ReviewedCheck {
        definition: ToolDefinition {
            id: ToolId::new("review").unwrap(),
            version: 1,
            description: "Review the saved answer.".into(),
            input: InputFormat::Json(serde_json::json!({"type":"object"})),
            max_input_bytes: 32 * 1024,
            max_output_bytes: 1024,
            recovery: RecoveryKind::Unavailable,
        },
        calls: AtomicUsize::new(0),
        result: check_result,
    });
    let check = CompletionCheck {
        id: BindingId::new("review").unwrap(),
        revision: agent_kit_core::Fingerprint::of(handler.definition()).unwrap(),
        handler: handler.definition().id.clone(),
        mode: CheckMode::Required,
    };
    let selected = CompletionChecks::new(vec![check.clone()]).unwrap();
    let mut inventory = Inventory::new();
    inventory.insert(handler.clone()).unwrap();
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime()
        .open(intercept_publication(
            claim.lease,
            PublicationInterruption::BeforeSettlement,
        ))
        .await
        .unwrap();
    let error = fixture
        .master(4, "Answer")
        .with_completion_checks(
            selected.clone(),
            inventory
                .snapshot(std::slice::from_ref(&check.handler))
                .unwrap(),
            BTreeMap::from([(check.id.clone(), fixture.grants())]),
        )
        .run(opened.turn, input())
        .await
        .err()
        .expect("settlement interruption");
    assert_eq!(error.code, "commit_outcome_unknown");
    assert_eq!(handler.calls.load(Ordering::SeqCst), 1);
    assert!(
        fixture.provider.requests.lock().unwrap()[0]
            .tools
            .iter()
            .all(|offered| offered.id != check.handler)
    );
    drop(store);

    let store = fixture.reopen().await;
    let claim = fixture.recover(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Answer")
        .with_completion_checks(
            selected,
            Inventory::new().snapshot(&[]).unwrap(),
            BTreeMap::new(),
        )
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected recovered settlement");
    };
    assert_eq!(receipt.outcome.status, outcome_status);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.text, text);
    assert_eq!(account.steps, 2);
    assert_eq!(account.tool_activity.unwrap().succeeded, 1);
    assert_eq!(account.completion_checks.len(), 1);
    assert_eq!(account.completion_checks[0].status, check_result);
    let operation = account.completion_checks[0].operation.as_ref().unwrap();
    assert!(receipt.outcome.evidence.contains(operation));
    assert_eq!(
        account.unresolved.contains(operation),
        check_result == CheckStatus::Uncertain
    );
    let history = store.history(session_id(), None).await.unwrap();
    assert!(history.iter().any(|HistoryRecord::Message(message)| {
        message.role == Role::Assistant
            && message.content.contains(&Content::Text("Finished".into()))
    }));
    assert_eq!(handler.calls.load(Ordering::SeqCst), 1);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn answer_settles_with_a_persisted_account_and_observation_starts_no_work() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected settlement")
    };
    store
        .verify(CommitReceipt::Settled(receipt.clone()))
        .await
        .unwrap();
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.text, "Finished");
    assert_eq!(account.steps, 1);
    assert!(account.unresolved.is_empty());
    assert!(account.inference_usage.observations.is_empty());
    assert_eq!(account.inference_usage.unreported_attempts.len(), 1);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 0);
    drop(store);
    let reopened = fixture.reopen().await;
    let view = reopened.inspect(session_id()).await.unwrap();
    assert!(view.current.is_none());
    assert_eq!(view.latest.unwrap().disposition, TurnDisposition::Settled);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn committed_inference_is_reused_after_interrupted_publication() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime()
        .open(interrupted(claim.lease))
        .await
        .unwrap();
    assert!(
        fixture
            .master(4, "Be concise")
            .run(opened.turn, input())
            .await
            .is_err()
    );
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    drop(store);
    let reopened = fixture.reopen().await;
    let claim = fixture.recover(&reopened).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected settlement")
    };
    reopened
        .verify(CommitReceipt::Settled(receipt.clone()))
        .await
        .unwrap();
    assert_eq!(
        read_account(receipt.outcome.account.as_ref().unwrap())
            .unwrap()
            .text,
        "Finished"
    );
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn committed_tool_results_are_reused_and_reach_the_next_model_request() {
    let fixture = Fixture::new(Script::ToolThenAnswer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime()
        .open(interrupted(claim.lease))
        .await
        .unwrap();
    assert!(
        fixture
            .master(4, "Use tools")
            .run(opened.turn, input())
            .await
            .is_err()
    );
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    drop(store);
    let reopened = fixture.reopen().await;
    let claim = fixture.recover(&reopened).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Use tools")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected settlement")
    };
    reopened
        .verify(CommitReceipt::Settled(receipt.clone()))
        .await
        .unwrap();
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.steps, 2);
    assert_eq!(account.tool_activity.unwrap().succeeded, 1);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    let requests = fixture.provider.requests.lock().unwrap();
    assert!(requests[1].messages.iter().flat_map(|message| &message.content).any(|part| matches!(part, Content::ToolResult(result) if result.status == OutcomeStatus::Succeeded && result.content == vec![ResultContent::Text("echoed".into())])));
}

#[test]
fn a_goal_continues_without_review_once_its_allowance_cannot_cover_the_reserve() {
    let mut fixture = Fixture::new(Script::EffortReview);
    fixture.install_review();
    let ultra = fixture.effort(Preset::Ultra);
    assert_eq!(ultra.reserved_child_generation_steps(), 2);
    let mut goal = Goal::start(
        change_id("continue-goal"),
        Objective {
            description: "Finish the export".into(),
            criteria: vec!["The export opens".into()],
        },
        Allowance {
            work_turns: NonZeroU32::new(3).unwrap(),
            inference_steps: NonZeroU32::new(3).unwrap(),
        },
    )
    .unwrap();
    assert_eq!(goal.continuation_effort(None), None);
    assert_eq!(
        goal.continuation_effort(Some(ultra.clone())),
        Some(ultra.clone())
    );
    let basis = goal.basis().clone();
    goal.reserve(&basis, turn_id(), NonZeroU32::new(1).unwrap())
        .unwrap();
    assert_eq!(goal.remaining().inference_steps, 2);
    assert_eq!(goal.continuation_effort(Some(ultra)), None);
}

#[tokio::test]
async fn ultra_requests_and_integrates_independent_review_in_plan_and_act() {
    for regime in [OperatingRegime::Plan, OperatingRegime::Act] {
        for preset in [Preset::Standard, Preset::Ultra] {
            let mut fixture = Fixture::new(Script::EffortReview);
            let review = fixture.install_review();
            let policy = fixture.effort(preset);
            let ultra = preset == Preset::Ultra;
            assert_eq!(policy.preset(), preset);
            assert_eq!(policy.parent_generation_steps(), if ultra { 4 } else { 2 });
            assert_eq!(
                policy.reserved_child_generation_steps(),
                if ultra { 2 } else { 0 }
            );
            let store = fixture.store();
            let claim = fixture.claim(&store).await;
            let opened = fixture.runtime().open(claim.lease).await.unwrap();
            let MasterOutcome::Settled(receipt) = fixture
                .master_in(2, "Inspect the fixture layout.", regime)
                .with_effort(policy)
                .unwrap()
                .run(opened.turn, input())
                .await
                .unwrap()
            else {
                panic!("expected a settled review")
            };
            let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
            assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
            assert_eq!(account.steps, if ultra { 2 } else { 1 });
            assert_eq!(
                account.text,
                if ultra {
                    "Independent review: The inspected layout has 2 items. The assignment expected 3."
                } else {
                    "Finished"
                }
            );
            assert_eq!(
                review.invocations.load(Ordering::SeqCst),
                usize::from(ultra)
            );
            let allocation = review
                .child
                .allocation(&review.allocation.lock().unwrap())
                .unwrap();
            assert_eq!(allocation.reserved, u8::from(ultra));
            for request in fixture.provider.requests.lock().unwrap().iter() {
                assert_eq!(request.tools, fixture.inventory.offers().unwrap());
                assert_eq!(request.max_output_tokens, Some(1024));
                let [Content::Text(instructions)] = request.messages[0].content.as_slice() else {
                    panic!("expected selected product instructions")
                };
                assert_eq!(instructions.contains("Plan is active."), !regime.is_act());
                assert_eq!(instructions.contains("Ultra effort is active."), ultra);
            }
        }
    }
}

#[test]
fn ultra_requires_room_for_independent_work_and_a_selected_offer() {
    let standard = NonZeroU32::new(2).unwrap();
    assert_eq!(
        EffortPolicy::capture(Preset::Ultra, standard, NonZeroU32::new(6).unwrap(), None)
            .unwrap_err()
            .code,
        "ultra_delegation_unavailable"
    );
    let mut fixture = Fixture::new(Script::EffortReview);
    let review = fixture.install_review();
    let offer = review.definition.offer().unwrap();
    assert_eq!(
        EffortPolicy::capture(
            Preset::Ultra,
            standard,
            NonZeroU32::new(4).unwrap(),
            Some((&offer, &fixture.grants())),
        )
        .unwrap_err()
        .code,
        "effort_allowance_unavailable"
    );
}

#[tokio::test]
async fn effort_keeps_parent_generation_inside_its_selected_allowance() {
    for (preset, steps) in [(Preset::Standard, 2), (Preset::Ultra, 4)] {
        let mut fixture = Fixture::new(Script::Tools);
        let review = fixture.install_review();
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let MasterOutcome::Settled(receipt) = fixture
            .master(2, "Use permitted tools.")
            .with_effort(fixture.effort(preset))
            .unwrap()
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("expected a step-limited result")
        };
        assert_eq!(receipt.outcome.status, OutcomeStatus::Failed);
        let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
        assert_eq!(account.stop_reason, Some(StopReason::StepLimit));
        assert_eq!(account.steps, steps);
        assert_eq!(
            fixture.provider.calls.load(Ordering::SeqCst),
            steps as usize
        );
        assert_eq!(review.invocations.load(Ordering::SeqCst), 0);
    }
}

#[tokio::test]
async fn retained_ultra_replays_exact_policy_or_can_stop_without_the_delegate() {
    for recovery in ["same", "different", "unavailable", "stop"] {
        let mut fixture = Fixture::new(Script::EffortReview);
        let review = fixture.install_review();
        let policy = fixture.effort(Preset::Ultra);
        let standard = fixture.effort(Preset::Standard);
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let opened = fixture
            .runtime()
            .open(interrupted(claim.lease))
            .await
            .unwrap();
        assert!(
            fixture
                .master(2, "Inspect the layout.")
                .with_effort(policy.clone())
                .unwrap()
                .run(opened.turn, input())
                .await
                .is_err()
        );
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
        assert_eq!(review.invocations.load(Ordering::SeqCst), 1);
        drop(store);

        let reopened = fixture.reopen().await;
        let claim = fixture.recover(&reopened).await;
        let state = claim.lease.journal().load().await.unwrap();
        let encoded: serde_json::Value =
            serde_json::from_slice(state.checkpoint().unwrap().bytes()).unwrap();
        let retained: EffortPolicy = serde_json::from_value(encoded["effort"].clone()).unwrap();
        assert_eq!(retained, policy);
        if matches!(recovery, "unavailable" | "stop") {
            fixture.inventory = Inventory::new().snapshot(&[]).unwrap();
        }
        if recovery == "stop" {
            let view = reopened.inspect(session_id()).await.unwrap();
            reopened
                .control(ControlRequest {
                    id: change_id("stop-without-review"),
                    session: session_id(),
                    expected_revision: view.revision,
                    action: SessionControl::Turn {
                        turn: turn_id(),
                        expected: view.current.unwrap().controls.revision,
                        directive: ControlDirective::Cancel,
                    },
                })
                .await
                .unwrap();
        }
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let outcome = fixture
            .master(2, "Inspect the layout.")
            .with_effort(if recovery == "different" {
                standard
            } else {
                retained
            })
            .unwrap()
            .run(opened.turn, input())
            .await;
        match (recovery, outcome) {
            ("same", Ok(MasterOutcome::Settled(receipt))) => {
                assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
                assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
            }
            ("stop", Ok(MasterOutcome::Settled(receipt))) => {
                assert_eq!(receipt.outcome.status, OutcomeStatus::Cancelled);
                let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
                assert_eq!(account.tool_activity.unwrap().succeeded, 1);
            }
            ("different", Err(error)) => assert_eq!(error.code, "master_effort_changed"),
            ("unavailable", Err(error)) => assert_eq!(error.code, "ultra_delegation_unavailable"),
            _ => panic!("unexpected retained effort outcome for {recovery}"),
        }
        assert_eq!(review.invocations.load(Ordering::SeqCst), 1);
        if recovery != "same" {
            assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
        }
    }
}

#[tokio::test]
async fn stopping_a_recovered_turn_publishes_tool_result_recorded_before_interruption() {
    let fixture = Fixture::new(Script::ToolThenAnswer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime()
        .open(interrupted(claim.lease))
        .await
        .unwrap();
    assert!(
        fixture
            .master(4, "Use tools")
            .run(opened.turn, input())
            .await
            .is_err()
    );
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    assert_eq!(store.history(session_id(), None).await.unwrap().len(), 1);
    drop(store);

    let reopened = fixture.reopen().await;
    let claim = fixture.recover(&reopened).await;
    let view = reopened.inspect(session_id()).await.unwrap();
    reopened
        .control(ControlRequest {
            id: change_id("stop"),
            session: session_id(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn_id(),
                expected: view.current.unwrap().controls.revision,
                directive: ControlDirective::Cancel,
            },
        })
        .await
        .unwrap();
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Use tools")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected stopped settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Cancelled);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.tool_activity.unwrap().succeeded, 1);
    reopened
        .verify(CommitReceipt::Settled(receipt))
        .await
        .unwrap();
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    let history = reopened.history(session_id(), None).await.unwrap();
    let messages: Vec<_> = history
        .into_iter()
        .map(|HistoryRecord::Message(message)| message)
        .collect();
    agent_kit_core::history::validate_exchanges(&messages, false).unwrap();
    assert_eq!(messages.len(), 3);
    assert!(
        matches!(&messages[1].content[..], [Content::ToolCall(call)] if call.id.as_str() == "call-0")
    );
    assert!(
        matches!(&messages[2].content[..], [Content::ToolResult(result)] if result.call.as_str() == "call-0" && result.status == OutcomeStatus::Succeeded && result.content == vec![ResultContent::Text("echoed".into())])
    );
}

#[tokio::test]
async fn changed_master_configuration_cannot_resume_a_retained_decision() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime()
        .open(interrupted(claim.lease))
        .await
        .unwrap();
    assert!(
        fixture
            .master(4, "Original")
            .run(opened.turn, input())
            .await
            .is_err()
    );
    drop(store);
    let reopened = fixture.reopen().await;
    let history = reopened.history(session_id(), None).await.unwrap();
    let claim = fixture.recover(&reopened).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let additional_input = vec![message(
        "extra",
        Role::User,
        Content::Text("Keep working".into()),
    )];
    let result = fixture
        .master(4, "Changed")
        .run(opened.turn, additional_input)
        .await;
    let Err(error) = result else {
        panic!("changed configuration must be rejected")
    };
    assert_eq!(error.code, "master_configuration_changed");
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(reopened.history(session_id(), None).await.unwrap(), history);
    assert_eq!(
        reopened
            .inspect_turn(session_id(), turn_id())
            .await
            .unwrap()
            .disposition,
        TurnDisposition::Interrupted
    );
}

#[tokio::test]
async fn step_limit_bounds_repeated_tool_calls_and_records_a_failed_account() {
    let fixture = Fixture::new(Script::Tools);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(2, "Use tools")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected bounded settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Failed);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.steps, 2);
    assert!(account.text.contains("step limit"));
    assert_eq!(account.stop_reason, Some(StopReason::StepLimit));
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 2);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

struct ContinueHook {
    definition: ToolDefinition,
    calls: AtomicUsize,
}

impl Tool for ContinueHook {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, args: &ToolArguments) -> Result<()> {
        let ToolArguments::Json(value) = args else {
            return Err(Error::new(ErrorKind::InvalidInput, "hook_envelope"));
        };
        serde_json::from_value::<lifecycle_hooks::HookInvocation>(value.clone())
            .map(|_| ())
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "hook_envelope"))
    }

    fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: Vec::new(),
                structured: Some(serde_json::json!({
                    "decision": "continue",
                    "context": "Verify the export once more."
                })),
                receipt: None,
                truncated: false,
            }
        })
    }
}

struct NeverApproves;

impl approval_review::Reviewer for NeverApproves {
    fn review<'a>(
        &'a self,
        _: &'a TurnOperations,
        _: &'a TurnView,
        _: &'a [WaitId],
    ) -> BoxFuture<'a, Result<bool>> {
        Box::pin(async { Ok(false) })
    }
}

#[tokio::test]
async fn a_completion_hook_continuation_stops_at_the_effective_step_limit() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let handler = Arc::new(ContinueHook {
        definition: ToolDefinition {
            id: ToolId::new("continue_hook").unwrap(),
            version: 1,
            description: "Ask for one more verification pass.".into(),
            input: InputFormat::Json(serde_json::json!({"type":"object"})),
            max_input_bytes: 64 * 1024,
            max_output_bytes: 1024,
            recovery: RecoveryKind::Unavailable,
        },
        calls: AtomicUsize::new(0),
    });
    let hook = lifecycle_hooks::LifecycleHook {
        id: BindingId::new("verify").unwrap(),
        source: "trusted-user".into(),
        revision: agent_kit_core::Fingerprint::of(&("verify", "reviewed")).unwrap(),
        event: lifecycle_hooks::HookEvent::BeforeCompletion,
        tool: None,
        mode: CheckMode::Required,
        handler: handler.definition().id.clone(),
    };
    let mut inventory = Inventory::new();
    inventory.insert(handler.clone()).unwrap();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    // The approval reviewer reserves one of the three configured steps.
    let MasterOutcome::Settled(receipt) = fixture
        .master(3, "Answer")
        .with_approval_reviewer(Arc::new(NeverApproves))
        .with_lifecycle_hooks(
            lifecycle_hooks::LifecycleHooks::new(vec![hook.clone()]).unwrap(),
            inventory
                .snapshot(std::slice::from_ref(&hook.handler))
                .unwrap(),
            BTreeMap::from([(hook.id.clone(), fixture.grants())]),
        )
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected a settled turn");
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Failed);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.steps, 2);
    assert_eq!(account.stop_reason, None);
    assert_eq!(account.text, "Finished");
    assert_eq!(account.failure.unwrap().code, "lifecycle_hook_step_limit");
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
    assert_eq!(handler.calls.load(Ordering::SeqCst), 2);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

struct AllowingHandler {
    definition: ToolDefinition,
    calls: AtomicUsize,
}

impl AllowingHandler {
    fn new(id: &str) -> Arc<Self> {
        Arc::new(Self {
            definition: ToolDefinition {
                id: ToolId::new(id).unwrap(),
                version: 1,
                description: "Allow the reviewed occurrence.".into(),
                input: InputFormat::Json(serde_json::json!({"type":"object"})),
                max_input_bytes: 64 * 1024,
                max_output_bytes: 1024,
                recovery: RecoveryKind::Unavailable,
            },
            calls: AtomicUsize::new(0),
        })
    }
}

impl Tool for AllowingHandler {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, args: &ToolArguments) -> Result<()> {
        match args {
            ToolArguments::Json(value) if value.is_object() => Ok(()),
            _ => Err(Error::new(ErrorKind::InvalidInput, "handler_arguments")),
        }
    }

    fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: Vec::new(),
                structured: Some(serde_json::json!({"decision": "allow"})),
                receipt: None,
                truncated: false,
            }
        })
    }
}

fn private_grant(name: &str) -> GrantSelection {
    GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("private").unwrap(),
            binding: BindingId::new(format!("{name}/turn")).unwrap(),
            scope: ScopeId::new(name).unwrap(),
        },
        grants: vec![GrantId::new(name).unwrap()],
    }
}

#[tokio::test]
async fn after_tool_hooks_observe_model_tools_but_not_private_checks() {
    let fixture = Fixture::new(Script::ToolThenAnswer);
    let store = fixture.store();
    let admission = AllowingHandler::new("admission_check");
    let completion = AllowingHandler::new("completion_check");
    let observer = AllowingHandler::new("after_tool_hook");
    let admission_grant = private_grant("admission");
    let completion_grant = private_grant("completion");
    let mut private = Inventory::new();
    private.insert(admission.clone()).unwrap();
    private.insert(completion.clone()).unwrap();
    let private = private
        .snapshot(&[
            admission.definition().id.clone(),
            completion.definition().id.clone(),
        ])
        .unwrap();
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime_granting(
            Arc::new(Permit),
            vec![admission_grant.clone(), completion_grant.clone()],
        )
        .open(claim.lease)
        .await
        .unwrap();
    // Checks the host already ran under this turn's private authority.
    for (key, tool, grant) in [
        ("hook/admission", &admission, &admission_grant),
        ("hook/completion", &completion, &completion_grant),
    ] {
        let outcome = opened
            .turn
            .operations()
            .invoke_with_inventory(
                OperationKey::new(key).unwrap(),
                PlannedInvocation {
                    tool: tool.definition().id.clone(),
                    arguments: ToolArguments::Json(serde_json::json!({})),
                    grants: grant.clone(),
                },
                private.clone(),
            )
            .await
            .unwrap();
        assert!(matches!(outcome, InvokeOutcome::Complete(_)));
    }
    let check = CompletionCheck {
        id: BindingId::new("completion").unwrap(),
        revision: agent_kit_core::Fingerprint::of(completion.definition()).unwrap(),
        handler: completion.definition().id.clone(),
        mode: CheckMode::Required,
    };
    let hook = lifecycle_hooks::LifecycleHook {
        id: BindingId::new("observe-tools").unwrap(),
        source: "trusted-user".into(),
        revision: agent_kit_core::Fingerprint::of(&("observe-tools", "reviewed")).unwrap(),
        event: lifecycle_hooks::HookEvent::AfterTool,
        tool: None,
        mode: CheckMode::Observe,
        handler: observer.definition().id.clone(),
    };
    let mut hooks = Inventory::new();
    hooks.insert(observer.clone()).unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Use tools")
        .with_required_admission_check(admission_grant)
        .with_completion_checks(
            CompletionChecks::new(vec![check.clone()]).unwrap(),
            private,
            BTreeMap::from([(check.id.clone(), completion_grant)]),
        )
        .with_lifecycle_hooks(
            lifecycle_hooks::LifecycleHooks::new(vec![hook.clone()]).unwrap(),
            hooks.snapshot(std::slice::from_ref(&hook.handler)).unwrap(),
            BTreeMap::from([(hook.id.clone(), fixture.grants())]),
        )
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected a settled turn");
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    // One moment for the model's tool call; none for the private checks or
    // for the hook's own handler operation.
    assert_eq!(observer.calls.load(Ordering::SeqCst), 1);
    assert_eq!(admission.calls.load(Ordering::SeqCst), 1);
    assert_eq!(completion.calls.load(Ordering::SeqCst), 2);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[test]
fn accounts_saved_without_a_stop_reason_remain_readable() {
    let envelope = Envelope::new(
        SchemaId::new("grida.agent.account").unwrap(),
        1,
        br#"{"text":"Finished","steps":1,"unresolved":[]}"#.to_vec(),
    )
    .unwrap();
    let account = read_account(&envelope).unwrap();
    assert_eq!(account.text, "Finished");
    assert_eq!(account.stop_reason, None);
}

#[tokio::test]
async fn cancellation_after_answer_publication_precedes_successful_settlement() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(
        claim.lease,
        PublicationInterruption::ControlAfterCommit(ControlDirective::Cancel),
    );
    let opened = fixture.runtime().open(lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected cancelled settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Cancelled);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

async fn wait_for_retry(observer: &mut TurnObserver) -> u64 {
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if let Some(due) = observer
                .snapshot()
                .state
                .checkpoint()
                .and_then(|checkpoint| {
                    let value: serde_json::Value =
                        serde_json::from_slice(checkpoint.bytes()).unwrap();
                    value["retry"]["not_before_ms"].as_u64()
                })
            {
                return due;
            }
            observer.next().await.expect("the run retains its retry");
        }
    })
    .await
    .expect("the first definitive rejection schedules a retry")
}

#[tokio::test]
async fn a_paused_retry_reopens_with_the_same_due_time_and_authority() {
    enum Change {
        None,
        LiveBinding,
        Principal,
        Scope,
    }
    for change in [
        Change::None,
        Change::LiveBinding,
        Change::Principal,
        Change::Scope,
    ] {
        let fixture = Fixture::new(Script::AdmissionLimit(1_500));
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let mut opened = fixture.runtime().open(claim.lease).await.unwrap();
        let master = fixture.master(4, "Be concise");
        let task = tokio::spawn(async move { master.run(opened.turn, input()).await });
        let due = wait_for_retry(&mut opened.observer).await;
        let view = store.inspect(session_id()).await.unwrap();
        let current = view.current.unwrap();
        store
            .control(ControlRequest {
                id: change_id("pause-backoff"),
                session: session_id(),
                expected_revision: view.revision,
                action: SessionControl::Turn {
                    turn: turn_id(),
                    expected: current.controls.revision,
                    directive: ControlDirective::Pause,
                },
            })
            .await
            .unwrap();
        let MasterOutcome::Suspended(receipt) = tokio::time::timeout(Duration::from_secs(1), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap()
        else {
            panic!("Pause must interrupt the backoff");
        };
        store
            .verify(CommitReceipt::Suspended(receipt))
            .await
            .unwrap();
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
        drop(opened.observer);
        drop(store);

        {
            let mut authority = fixture.provider.authority.lock().unwrap();
            match change {
                Change::None => {}
                Change::LiveBinding => authority.binding = BindingId::new("renewed").unwrap(),
                Change::Principal => authority.principal = PrincipalId::new("changed").unwrap(),
                Change::Scope => authority.scope = ScopeId::new("changed").unwrap(),
            }
        }
        let store = fixture.reopen().await;
        assert_eq!(
            store
                .inspect_turn_with(session_id(), turn_id(), |state| {
                    let checkpoint = state.checkpoint().expect("retained retry");
                    let value: serde_json::Value =
                        serde_json::from_slice(checkpoint.bytes()).unwrap();
                    Ok(value["retry"]["not_before_ms"].as_u64())
                })
                .await
                .unwrap(),
            Some(due)
        );
        let view = store.inspect(session_id()).await.unwrap();
        let current = view.current.unwrap();
        store
            .control(ControlRequest {
                id: change_id("resume-backoff"),
                session: session_id(),
                expected_revision: view.revision,
                action: SessionControl::Turn {
                    turn: turn_id(),
                    expected: current.controls.revision,
                    directive: ControlDirective::Resume,
                },
            })
            .await
            .unwrap();
        let view = store.inspect(session_id()).await.unwrap();
        let current = view.current.unwrap();
        let ClaimOutcome::Acquired(claim) = store
            .claim(ClaimRequest {
                id: change_id("claim-backoff"),
                session: session_id(),
                expected_revision: view.revision,
                selection: TurnSelection::Resume {
                    turn: turn_id(),
                    epoch: current.binding.epoch,
                    position: current.position,
                },
            })
            .await
            .unwrap()
        else {
            panic!("expected resumed retry");
        };
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let MasterOutcome::Settled(receipt) = fixture
            .master(4, "Be concise")
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("the resumed retry must settle");
        };
        let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
        if matches!(change, Change::Principal | Change::Scope) {
            assert_eq!(receipt.outcome.status, OutcomeStatus::Failed);
            assert_eq!(account.failure.unwrap().code, "retry_authority_changed");
            assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
        } else {
            assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
            assert_eq!(account.steps, 2);
            assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
        }
        store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    }
}

#[tokio::test]
async fn stopping_during_backoff_dispatches_no_retry() {
    let fixture = Fixture::new(Script::AdmissionLimit(3_000));
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let mut opened = fixture.runtime().open(claim.lease).await.unwrap();
    let master = fixture.master(4, "Be concise");
    let task = tokio::spawn(async move { master.run(opened.turn, input()).await });
    wait_for_retry(&mut opened.observer).await;
    let view = store.inspect(session_id()).await.unwrap();
    let current = view.current.unwrap();
    store
        .control(ControlRequest {
            id: change_id("stop-backoff"),
            session: session_id(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn_id(),
                expected: current.controls.revision,
                directive: ControlDirective::Cancel,
            },
        })
        .await
        .unwrap();
    let MasterOutcome::Settled(receipt) = tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap()
    else {
        panic!("Stop must interrupt the backoff");
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Cancelled);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn pause_after_answer_publication_suspends_before_settlement() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(
        claim.lease,
        PublicationInterruption::ControlAfterCommit(ControlDirective::Pause),
    );
    let opened = fixture.runtime().open(lease).await.unwrap();
    let MasterOutcome::Suspended(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected suspension")
    };
    store
        .verify(CommitReceipt::Suspended(receipt))
        .await
        .unwrap();
    let view = store.inspect(session_id()).await.unwrap();
    let current = view.current.unwrap();
    assert_eq!(current.disposition, TurnDisposition::Suspended);
    assert!(current.outcome.is_none());
    store
        .control(ControlRequest {
            id: change_id("resume-control"),
            session: session_id(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn_id(),
                expected: current.controls.revision,
                directive: ControlDirective::Resume,
            },
        })
        .await
        .unwrap();
    let view = store.inspect(session_id()).await.unwrap();
    let current = view.current.unwrap();
    let ClaimOutcome::Acquired(claim) = store
        .claim(ClaimRequest {
            id: change_id("resume"),
            session: session_id(),
            expected_revision: view.revision,
            selection: TurnSelection::Resume {
                turn: turn_id(),
                epoch: current.binding.epoch,
                position: current.position,
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected resumed owner")
    };
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn dispatched_orphan_is_reported_without_another_provider_request() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(claim.lease, PublicationInterruption::BeforeOutcome);
    let opened = fixture.runtime().open(lease).await.unwrap();
    assert!(
        fixture
            .master(4, "Be concise")
            .run(opened.turn, input())
            .await
            .is_err()
    );
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    drop(store);
    let reopened = fixture.reopen().await;
    let claim = fixture.recover(&reopened).await;
    let state = claim.lease.journal().load().await.unwrap();
    assert_eq!(
        state
            .operations()
            .values()
            .filter(|operation| operation.is_running())
            .count(),
        1
    );
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected uncertain settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Uncertain);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(
        read_account(receipt.outcome.account.as_ref().unwrap())
            .unwrap()
            .unresolved
            .len(),
        1
    );
    reopened
        .verify(CommitReceipt::Settled(receipt))
        .await
        .unwrap();
}

#[tokio::test]
async fn fresh_authority_replaces_only_a_request_that_never_dispatched() {
    for interruption in [
        PublicationInterruption::BeforeDispatch,
        PublicationInterruption::AfterRequestCheckpoint,
    ] {
        let fixture = Fixture::new(Script::Answer);
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let lease = intercept_publication(claim.lease, interruption);
        let opened = fixture.runtime().open(lease).await.unwrap();
        assert!(
            fixture
                .master(1, "Be concise")
                .run(opened.turn, input())
                .await
                .is_err()
        );
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);
        drop(store);
        let store = fixture.reopen().await;
        fixture.provider.authority.lock().unwrap().binding = BindingId::new("fresh-host").unwrap();
        let claim = fixture.recover(&store).await;
        let state = claim.lease.journal().load().await.unwrap();
        assert!(state.operations().len() <= 1);
        assert!(
            state
                .operations()
                .values()
                .all(|operation| operation.attempts.is_empty())
        );
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let MasterOutcome::Settled(receipt) = fixture
            .master(1, "Be concise")
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("expected fresh request settlement")
        };
        assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
        let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
        assert_eq!(account.steps, 1);
        assert!(account.unresolved.is_empty());
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
        store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    }
}

#[tokio::test]
async fn reopening_an_unstarted_request_under_a_new_profile() {
    for failure in [
        None,
        Some(Error::new(
            ErrorKind::Unsupported,
            "missing_tool_thought_signature",
        )),
    ] {
        let fixture = Fixture::new(Script::Answer);
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let lease = intercept_publication(claim.lease, PublicationInterruption::BeforeDispatch);
        let opened = fixture.runtime().open(lease).await.unwrap();
        let result = fixture
            .master(1, "Be concise")
            .run(opened.turn, input())
            .await;
        assert!(matches!(result, Err(error) if error.code == "commit_outcome_unknown"));
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);
        drop(store);

        let store = fixture.reopen().await;
        fixture.provider.authority.lock().unwrap().binding = BindingId::new("fresh-host").unwrap();
        {
            let mut capabilities = fixture.provider.capabilities.lock().unwrap();
            capabilities.revision = BindingId::new("script-png-v1").unwrap();
            capabilities.input_modalities.insert(Modality::Image);
        }
        *fixture.provider.prepare_failure.lock().unwrap() = failure.clone();
        let claim = fixture.recover(&store).await;
        let state = claim.lease.journal().load().await.unwrap();
        let [original] = state.operations().values().collect::<Vec<_>>()[..] else {
            panic!("expected one prepared operation");
        };
        assert!(original.attempts.is_empty());
        assert!(original.outcome().is_none());
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let operations = opened.turn.operations();
        let MasterOutcome::Settled(receipt) = fixture
            .master(1, "Be concise")
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("expected a durable settlement");
        };
        let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
        let (status, steps) = if failure.is_some() {
            (OutcomeStatus::Failed, 0)
        } else {
            (OutcomeStatus::Succeeded, 1)
        };
        assert_eq!(receipt.outcome.status, status);
        assert_eq!(account.steps, steps);
        assert_eq!(account.failure, failure);
        assert!(account.unresolved.is_empty());
        let view = operations.view();
        let retired = &view.state.operations()[&original.record.id];
        assert!(retired.attempts.is_empty());
        assert!(
            matches!(retired.outcome(), Some(OperationOutcome::Inference(outcome))
            if outcome.failure.as_ref().is_some_and(|failure| failure.kind == FailureKind::Cancelled))
        );
        assert_eq!(view.state.operations().len(), 1 + steps as usize);
        assert_eq!(
            fixture.provider.calls.load(Ordering::SeqCst),
            steps as usize
        );
        let retained = receipt.outcome.clone();
        store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
        drop(operations);
        drop(store);

        let reopened = fixture.reopen().await;
        assert_eq!(
            reopened
                .inspect_turn(session_id(), turn_id())
                .await
                .unwrap()
                .outcome,
            Some(retained)
        );
    }
}

#[tokio::test]
async fn unstarted_requests_cannot_renew_under_another_principal_or_scope() {
    for replace_principal in [true, false] {
        let fixture = Fixture::new(Script::Answer);
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let lease = intercept_publication(claim.lease, PublicationInterruption::BeforeDispatch);
        let opened = fixture.runtime().open(lease).await.unwrap();
        assert!(
            fixture
                .master(2, "Be concise")
                .run(opened.turn, input())
                .await
                .is_err()
        );
        drop(store);
        let store = fixture.reopen().await;
        {
            let mut authority = fixture.provider.authority.lock().unwrap();
            if replace_principal {
                authority.principal = PrincipalId::new("another-principal").unwrap();
            } else {
                authority.scope = ScopeId::new("another-scope").unwrap();
            }
        }
        let claim = fixture.recover(&store).await;
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let result = fixture
            .master(2, "Be concise")
            .run(opened.turn, input())
            .await;
        assert!(matches!(result, Err(error) if error.code == "continuation_authority_changed"));
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);
    }
}

#[tokio::test]
async fn a_correction_received_before_dispatch_replaces_the_unsent_request() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(claim.lease, PublicationInterruption::BeforeDispatch);
    let opened = fixture.runtime().open(lease).await.unwrap();
    assert!(
        fixture
            .master(1, "Be concise")
            .run(opened.turn, input())
            .await
            .is_err()
    );
    let view = store.inspect(session_id()).await.unwrap();
    let current = view.current.unwrap();
    store
        .control(ControlRequest {
            id: change_id("steer-unsent"),
            session: session_id(),
            expected_revision: view.revision,
            action: SessionControl::AppendHistory {
                turn: turn_id(),
                expected: current.controls.revision,
                expected_history: current.history_position,
                records: vec![HistoryRecord::Message(message(
                    "correction",
                    Role::User,
                    Content::Text("Use this correction".into()),
                ))],
            },
        })
        .await
        .unwrap();
    let claim = fixture.recover(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(1, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected corrected request settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    {
        let requests = fixture.provider.requests.lock().unwrap();
        assert!(
            requests[0]
                .messages
                .iter()
                .any(|message| message.id.as_str() == "correction")
        );
    }
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn a_retained_preparation_limit_settles_without_dispatching_its_replacement() {
    let mut fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(claim.lease, PublicationInterruption::BeforeDispatch);
    let opened = fixture.runtime().open(lease).await.unwrap();
    assert!(
        fixture
            .master(1, "Be concise")
            .run(opened.turn, input())
            .await
            .is_err()
    );
    drop(store);
    let store = fixture.reopen().await;
    fixture.provider.authority.lock().unwrap().binding = BindingId::new("fresh-host").unwrap();
    fixture.max_operations = 1;
    let claim = fixture.recover(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(1, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected limit settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Failed);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.failure.unwrap().code, "operation_limit");
    assert!(account.unresolved.is_empty());
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn a_reply_with_more_tool_calls_than_operation_slots_settles_at_the_limit() {
    let mut fixture = Fixture::new(Script::ParallelTools(6));
    fixture.max_operations = 4;
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Use tools")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected limit settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Failed);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.failure.unwrap().code, "operation_limit");
    assert!(account.unresolved.is_empty());
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    // The inference and three calls fill the four slots; the rest never run.
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 3);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn steering_racing_uncertain_settlement_never_admits_more_work() {
    let fixture = Fixture::new(Script::ToolThenAnswer);
    fixture.tool.uncertain.store(true, Ordering::SeqCst);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(claim.lease, PublicationInterruption::InputBeforeBoundary);
    let opened = fixture.runtime().open(lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected uncertain settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Uncertain);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn legacy_completion_checks_the_original_request_before_settling() {
    for add_input in [false, true] {
        let fixture = Fixture::new(Script::Answer);
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let lease = intercept_publication(
            claim.lease,
            PublicationInterruption::ControlAfterCommit(ControlDirective::Pause),
        );
        let opened = fixture.runtime().open(lease).await.unwrap();
        assert!(matches!(
            fixture
                .master(4, "Be concise")
                .run(opened.turn, input())
                .await
                .unwrap(),
            MasterOutcome::Suspended(_)
        ));
        let view = store.inspect(session_id()).await.unwrap();
        let current = view.current.unwrap();
        let ClaimOutcome::Acquired(claim) = store
            .claim(ClaimRequest {
                id: change_id("resume"),
                session: session_id(),
                expected_revision: view.revision,
                selection: TurnSelection::ResumePaused {
                    turn: turn_id(),
                    epoch: current.binding.epoch,
                    position: current.position,
                    control_revision: current.controls.revision,
                },
            })
            .await
            .unwrap()
        else {
            panic!("expected resumed owner")
        };
        let state = claim.lease.journal().load().await.unwrap();
        let checkpoint = state.checkpoint().unwrap();
        let mut legacy: serde_json::Value = serde_json::from_slice(checkpoint.bytes()).unwrap();
        legacy.as_object_mut().unwrap().remove("request_history");
        legacy.as_object_mut().unwrap().remove("request_generation");
        let checkpoint = Envelope::new(
            checkpoint.schema().clone(),
            checkpoint.version(),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();
        let mut actions = vec![JournalAction::SetCheckpoint(checkpoint)];
        if add_input {
            actions.push(JournalAction::AppendHistory(vec![HistoryRecord::Message(
                message(
                    "new-input",
                    Role::User,
                    Content::Text("Apply this correction".into()),
                ),
            )]));
        }
        claim
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id("legacy-state"),
                    state.binding().clone(),
                    state.position(),
                    state.controls().revision,
                    actions,
                )
                .unwrap(),
            )
            .await
            .unwrap();
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let MasterOutcome::Settled(receipt) = fixture
            .master(4, "Be concise")
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("expected legacy settlement")
        };
        assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
        assert_eq!(
            fixture.provider.calls.load(Ordering::SeqCst),
            if add_input { 2 } else { 1 }
        );
        store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    }
}

#[tokio::test]
async fn stopped_recovered_orphan_keeps_uncertainty_without_redispatch() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(claim.lease, PublicationInterruption::BeforeOutcome);
    let opened = fixture.runtime().open(lease).await.unwrap();
    assert!(
        fixture
            .master(4, "Be concise")
            .run(opened.turn, input())
            .await
            .is_err()
    );
    drop(store);
    let reopened = fixture.reopen().await;
    let claim = fixture.recover(&reopened).await;
    let view = reopened.inspect(session_id()).await.unwrap();
    reopened
        .control(ControlRequest {
            id: change_id("stop"),
            session: session_id(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn_id(),
                expected: view.current.unwrap().controls.revision,
                directive: ControlDirective::Cancel,
            },
        })
        .await
        .unwrap();
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected cancelled settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Cancelled);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(
        read_account(receipt.outcome.account.as_ref().unwrap())
            .unwrap()
            .unresolved
            .len(),
        1
    );
    reopened
        .verify(CommitReceipt::Settled(receipt))
        .await
        .unwrap();
}

#[derive(Default)]
struct DeferForInput {
    calls: AtomicUsize,
}
impl ToolGate for DeferForInput {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if matches!(admission.invocation.arguments(), ToolArguments::Json(value) if value["value"] == "echoed")
            {
                return Ok(ToolDecision::Permit);
            }
            let wait = WaitId::new("permission")?;
            context
                .operations
                .request_input(WaitRecord {
                    id: wait.clone(),
                    request: envelope("Continue?"),
                    response: ResponseContract {
                        schema: SchemaId::new("test.text")?,
                        version: 1,
                    },
                    answer: None,
                    withdrawn: false,
                })
                .await?;
            Ok(ToolDecision::Defer(wait))
        })
    }
}

#[derive(Default)]
struct PauseSecondTool {
    entered: tokio::sync::Notify,
    visits: AtomicUsize,
}

impl ToolGate for PauseSecondTool {
    fn decide(
        &self,
        admission: ToolAdmission,
        _: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            if matches!(admission.invocation.arguments(), ToolArguments::Json(value) if value["value"] == "ask")
                && self.visits.fetch_add(1, Ordering::SeqCst) == 0
            {
                self.entered.notify_one();
                std::future::pending::<()>().await;
            }
            Ok(ToolDecision::Permit)
        })
    }
}

#[tokio::test]
async fn a_paused_gate_preserves_the_step_and_its_completed_sibling() {
    for stop in [false, true] {
        let fixture = Fixture::new(Script::ToolAndDeferred);
        let gate = Arc::new(PauseSecondTool::default());
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let mut opened = fixture
            .runtime_with_gate(gate.clone())
            .open(claim.lease)
            .await
            .unwrap();
        let master = fixture.master(3, "Use both tools");
        let task = tokio::spawn(async move { master.run(opened.turn, input()).await });
        tokio::time::timeout(Duration::from_secs(2), async {
            gate.entered.notified().await;
            loop {
                if opened.observer.snapshot().state.operations().values().any(|record| {
                    matches!(record.outcome(), Some(OperationOutcome::Tool(outcome)) if outcome.status == OutcomeStatus::Succeeded)
                }) {
                    break;
                }
                opened.observer.next().await.expect("sibling remains observable");
            }
        }).await.unwrap();
        let view = store.inspect(session_id()).await.unwrap();
        store
            .control(ControlRequest {
                id: change_id("pause-tool-gate"),
                session: session_id(),
                expected_revision: view.revision,
                action: SessionControl::Turn {
                    turn: turn_id(),
                    expected: view.current.unwrap().controls.revision,
                    directive: ControlDirective::Pause,
                },
            })
            .await
            .unwrap();
        let MasterOutcome::Suspended(suspended) =
            tokio::time::timeout(Duration::from_secs(2), task)
                .await
                .unwrap()
                .unwrap()
                .unwrap()
        else {
            panic!("expected a paused step")
        };
        store
            .verify(CommitReceipt::Suspended(suspended))
            .await
            .unwrap();
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
        assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
        let history = store.history(session_id(), None).await.unwrap();
        assert_eq!(
            history.len(),
            1,
            "candidate history must remain unpublished"
        );

        let view = store.inspect(session_id()).await.unwrap();
        let current = view.current.unwrap();
        store
            .control(ControlRequest {
                id: change_id("resolve-tool-gate"),
                session: session_id(),
                expected_revision: view.revision,
                action: if stop {
                    SessionControl::PauseAndCancel {
                        turn: turn_id(),
                        expected: current.controls.revision,
                    }
                } else {
                    SessionControl::Turn {
                        turn: turn_id(),
                        expected: current.controls.revision,
                        directive: ControlDirective::Resume,
                    }
                },
            })
            .await
            .unwrap();
        let claim = if stop {
            fixture.recover(&store).await
        } else {
            let view = store.inspect(session_id()).await.unwrap();
            let current = view.current.unwrap();
            let ClaimOutcome::Acquired(claim) = store
                .claim(ClaimRequest {
                    id: change_id("resume-tool-gate"),
                    session: session_id(),
                    expected_revision: view.revision,
                    selection: TurnSelection::Resume {
                        turn: turn_id(),
                        epoch: current.binding.epoch,
                        position: current.position,
                    },
                })
                .await
                .unwrap()
            else {
                panic!("expected resumed step owner")
            };
            claim
        };
        let opened = fixture
            .runtime_with_gate(gate.clone())
            .open(claim.lease)
            .await
            .unwrap();
        let MasterOutcome::Settled(receipt) = fixture
            .master(3, "Use both tools")
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("expected terminal settlement")
        };
        let expected_work = if stop { 1 } else { 2 };
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), expected_work);
        assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), expected_work);
        assert_eq!(gate.visits.load(Ordering::SeqCst), expected_work);
        assert_eq!(
            receipt.outcome.status,
            if stop {
                OutcomeStatus::Cancelled
            } else {
                OutcomeStatus::Succeeded
            }
        );
        let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
        assert!(account.unresolved.is_empty());
        let tools = account.tool_activity.unwrap();
        assert_eq!(tools.succeeded, expected_work);
        assert_eq!(tools.cancelled, usize::from(stop));
    }
}

#[tokio::test]
async fn stopping_a_deferred_turn_keeps_completed_results_and_withdraws_input() {
    let fixture = Fixture::new(Script::ToolAndDeferred);
    let gate = Arc::new(DeferForInput::default());
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime_with_gate(gate.clone())
        .open(claim.lease)
        .await
        .unwrap();
    let MasterOutcome::Suspended(receipt) = fixture
        .master(4, "Use tools")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected input suspension")
    };
    store
        .verify(CommitReceipt::Suspended(receipt))
        .await
        .unwrap();
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    assert_eq!(gate.calls.load(Ordering::SeqCst), 2);
    let view = store.inspect(session_id()).await.unwrap();
    store
        .control(ControlRequest {
            id: change_id("stop"),
            session: session_id(),
            expected_revision: view.revision,
            action: SessionControl::PauseAndCancel {
                turn: turn_id(),
                expected: view.current.unwrap().controls.revision,
            },
        })
        .await
        .unwrap();
    let claim = fixture.recover(&store).await;
    let opened = fixture
        .runtime_with_gate(gate.clone())
        .open(claim.lease)
        .await
        .unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Use tools")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected cancelled settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Cancelled);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert!(account.unresolved.is_empty());
    let tools = account.tool_activity.unwrap();
    assert_eq!(tools.succeeded, 1);
    assert_eq!(tools.cancelled, 1);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    assert_eq!(gate.calls.load(Ordering::SeqCst), 2);
    let messages: Vec<_> = store
        .history(session_id(), None)
        .await
        .unwrap()
        .into_iter()
        .map(|HistoryRecord::Message(message)| message)
        .collect();
    agent_kit_core::history::validate_exchanges(&messages, false).unwrap();
    let results: Vec<_> = messages
        .iter()
        .flat_map(|message| &message.content)
        .filter_map(|part| match part {
            Content::ToolResult(result) => Some((result.call.as_str(), result.status)),
            _ => None,
        })
        .collect();
    assert_eq!(
        results,
        [
            ("call-0", OutcomeStatus::Succeeded),
            ("deferred-0", OutcomeStatus::Cancelled)
        ]
    );
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    assert!(store.inspect(session_id()).await.unwrap().current.is_none());
}

#[tokio::test]
async fn cancellation_racing_with_settlement_reconsiders_the_stale_basis() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(
        claim.lease,
        PublicationInterruption::ControlBeforeBoundary(ControlDirective::Cancel),
    );
    let opened = fixture.runtime().open(lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected cancelled settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Cancelled);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn previous_turns_supply_model_context_without_copying_transcript_records() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(_) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected first settlement")
    };
    drop(store);
    let store = fixture.reopen().await;
    let follow_up = message(
        "follow-up",
        Role::User,
        Content::Text("Continue the conversation".into()),
    );
    let submission = Submission {
        id: change_id("follow-up"),
        payload: envelope("Continue the conversation"),
    };
    store
        .submit(session_id(), submission.clone())
        .await
        .unwrap();
    let second_turn = TurnId::new("follow-up-turn").unwrap();
    let request = ClaimRequest {
        id: change_id("claim-follow-up"),
        session: session_id(),
        expected_revision: store.inspect(session_id()).await.unwrap().revision,
        selection: TurnSelection::New {
            turn: second_turn.clone(),
            inputs: vec![submission.id],
        },
    };
    let ClaimOutcome::Acquired(claim) = store.claim(request).await.unwrap() else {
        panic!("expected second claim")
    };
    assert!(
        claim
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .history()
            .records()
            .is_empty()
    );
    let preceding: Vec<_> = store
        .history(session_id(), Some(second_turn))
        .await
        .unwrap()
        .into_iter()
        .map(|record| {
            let HistoryRecord::Message(message) = record;
            message
        })
        .collect();
    assert_eq!(
        preceding
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        ["input", "answer-0"]
    );

    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .with_history(preceding.clone())
        .run(opened.turn, vec![follow_up.clone()])
        .await
        .unwrap()
    else {
        panic!("expected second settlement")
    };
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    let persisted = store.history(session_id(), None).await.unwrap();
    let ids: Vec<_> = persisted
        .iter()
        .map(|record| {
            let HistoryRecord::Message(message) = record;
            message.id.as_str()
        })
        .collect();
    assert_eq!(ids, ["input", "answer-0", "follow-up", "answer-1"]);
    let requests = fixture.provider.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1].messages[0].role, Role::System);
    assert_eq!(&requests[1].messages[1..3], preceding.as_slice());
    assert_eq!(requests[1].messages[3..], [follow_up]);
}

#[tokio::test]
async fn steering_after_result_publication_is_incorporated_before_settlement() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(claim.lease, PublicationInterruption::InputAfterCommit);
    let opened = fixture.runtime().open(lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected settlement after incorporating steering")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    let requests = fixture.provider.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert!(
        !requests[0]
            .messages
            .iter()
            .any(|message| message.id.as_str() == "steering")
    );
    assert!(
        requests[1]
            .messages
            .iter()
            .any(|message| message.id.as_str() == "steering")
    );
}

#[tokio::test]
async fn unanswered_question_suspends_and_its_answer_becomes_new_input_on_resume() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let lease = intercept_publication(claim.lease, PublicationInterruption::QuestionAfterCommit);
    let opened = fixture.runtime().open(lease).await.unwrap();
    let outcome = tokio::time::timeout(
        Duration::from_secs(2),
        fixture.master(4, "Be concise").run(opened.turn, input()),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(matches!(outcome, MasterOutcome::Suspended(_)));
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    let session = store.inspect(session_id()).await.unwrap();
    let turn = session.current.unwrap();
    store
        .control(ControlRequest {
            id: change_id("answer"),
            session: session_id(),
            expected_revision: session.revision,
            action: SessionControl::ResolveAndAppend {
                turn: turn_id(),
                expected: turn.controls.revision,
                expected_history: agent_kit_core::history::HistoryPosition(2),
                wait: WaitId::new("question").unwrap(),
                answer: envelope("Use the new direction"),
                records: vec![HistoryRecord::Message(message(
                    "answer-to-question",
                    Role::User,
                    Content::Text("Use the new direction".into()),
                ))],
            },
        })
        .await
        .unwrap();
    let view = store.inspect(session_id()).await.unwrap();
    let current = view.current.unwrap();
    let ClaimOutcome::Acquired(claim) = store
        .claim(ClaimRequest {
            id: change_id("resume"),
            session: session_id(),
            expected_revision: view.revision,
            selection: TurnSelection::Resume {
                turn: turn_id(),
                epoch: current.binding.epoch,
                position: current.position,
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected resumed owner")
    };
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected answered settlement")
    };
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    let requests = fixture.provider.requests.lock().unwrap();
    assert!(
        requests[1]
            .messages
            .iter()
            .any(|message| message.id.as_str() == "answer-to-question")
    );
}

#[tokio::test]
async fn a_recovered_turn_requires_the_same_preceding_context() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let preceding = vec![message(
        "prior",
        Role::User,
        Content::Text("original context".into()),
    )];
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime()
        .open(interrupted(claim.lease))
        .await
        .unwrap();
    assert!(
        fixture
            .master(4, "Be concise")
            .with_history(preceding.clone())
            .run(opened.turn, input())
            .await
            .is_err()
    );
    drop(store);

    let store = fixture.reopen().await;
    let claim = fixture.recover(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let changed = vec![message(
        "prior",
        Role::User,
        Content::Text("changed context".into()),
    )];
    let Err(error) = fixture
        .master(4, "Be concise")
        .with_history(changed)
        .run(opened.turn, input())
        .await
    else {
        panic!("expected changed context to be rejected")
    };
    assert_eq!(error.kind, ErrorKind::Conflict);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    drop(store);

    let store = fixture.reopen().await;
    let ClaimOutcome::Acquired(claim) = store
        .recover(RecoveryRequest {
            id: change_id("recover-original-context"),
            session: session_id(),
            turn: turn_id(),
            expected_epoch: 2,
        })
        .await
        .unwrap()
    else {
        panic!("expected recovery owner")
    };
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .with_history(preceding)
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected original context to settle")
    };
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn automatic_input_budget_does_not_request_a_hard_measurement() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap();
    assert!(
        fixture
            .provider
            .measured_requests
            .lock()
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn provider_managed_output_keeps_existing_bounded_configuration_encoding() {
    let serialized =
        r#"{"model":"model","instructions":"Be concise","max_steps":4,"max_output_tokens":1024}"#;
    let mut config: MasterConfig = serde_json::from_str(serialized).unwrap();
    assert_eq!(config.max_output_tokens, Some(1024));
    // Existing durable continuations fingerprint this serialized configuration.
    assert_eq!(serde_json::to_string(&config).unwrap(), serialized);
    config.max_output_tokens = None;
    let encoded = serde_json::to_value(&config).unwrap();
    assert!(encoded.get("max_output_tokens").is_none());
    assert_eq!(
        serde_json::from_value::<MasterConfig>(encoded).unwrap(),
        config
    );

    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    Master::new(
        config,
        fixture.provider.clone(),
        fixture.inventory.clone(),
        MasterAuthority {
            inference: fixture.grants(),
            tools: BTreeMap::new(),
        },
    )
    .unwrap()
    .run(opened.turn, input())
    .await
    .unwrap();
    assert_eq!(
        fixture.provider.requests.lock().unwrap()[0].max_output_tokens,
        None
    );
}

#[tokio::test]
async fn hard_input_limit_measures_the_assembled_request_before_dispatch() {
    let fixture = Fixture::new(Script::Answer);
    *fixture.provider.measurement.lock().unwrap() = Some(InputMeasurement {
        tokens: 100,
        kind: MeasurementKind::UpperBound,
    });
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let prior = message(
        "prior-context",
        Role::Assistant,
        Content::Text("Prior work".into()),
    );
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .with_history(vec![prior.clone()])
        .with_input_limit(std::num::NonZeroU64::new(100))
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
    let measured = fixture.provider.measured_requests.lock().unwrap();
    assert_eq!(measured.len(), 1);
    assert_eq!(measured[0].messages[0].role, Role::System);
    assert_eq!(measured[0].messages[1], prior);
    assert_eq!(measured[0].messages[2], input()[0]);
    assert!(!measured[0].tools.is_empty());
    assert_eq!(fixture.provider.requests.lock().unwrap()[0], measured[0]);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn unsupported_estimated_and_excessive_input_settle_without_provider_dispatch() {
    for (measurement, code, explanation) in [
        (
            None,
            "input_measurement_unavailable",
            "The selected model cannot verify the configured input limit.",
        ),
        (
            Some(InputMeasurement {
                tokens: 1,
                kind: MeasurementKind::Estimate,
            }),
            "input_bound_unavailable",
            "The selected model cannot verify the configured input limit.",
        ),
        (
            Some(InputMeasurement {
                tokens: 101,
                kind: MeasurementKind::Exact,
            }),
            "input_token_limit",
            "The request exceeds the configured input limit.",
        ),
    ] {
        let fixture = Fixture::new(Script::Answer);
        *fixture.provider.measurement.lock().unwrap() = measurement;
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let MasterOutcome::Settled(receipt) = fixture
            .master(4, "Be concise")
            .with_input_limit(std::num::NonZeroU64::new(100))
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("expected failed settlement")
        };
        assert_eq!(receipt.outcome.status, OutcomeStatus::Failed);
        let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
        assert_eq!(account.failure.unwrap().code, code);
        assert!(account.text.starts_with(explanation), "{}", account.text);
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);
        store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
        assert_eq!(
            store
                .inspect_turn(session_id(), turn_id())
                .await
                .unwrap()
                .disposition,
            TurnDisposition::Settled
        );
    }
}

#[tokio::test]
async fn persisted_usage_keeps_latest_cumulative_values_and_separate_categories() {
    let fixture = Fixture::new(Script::UsageAnswer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(4, "Be concise")
        .run(opened.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected settlement")
    };
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    drop(store);
    let store = fixture.reopen().await;
    let state = store.inspect_turn(session_id(), turn_id()).await.unwrap();
    let account = read_account(state.outcome.unwrap().account.as_ref().unwrap()).unwrap();
    assert!(account.inference_usage.unreported_attempts.is_empty());
    let observations = account.inference_usage.observations;
    assert_eq!(observations.len(), 2);
    assert!(
        observations
            .iter()
            .any(|observation| observation.category == "input_tokens"
                && observation.quantity == 7
                && observation.final_value)
    );
    assert!(
        observations
            .iter()
            .any(|observation| observation.category == "cached_input_tokens"
                && observation.quantity == 2)
    );
}

#[tokio::test]
async fn provider_failure_classification_survives_the_completion_account() {
    for kind in [
        FailureKind::ContextLimit,
        FailureKind::OutputLimit,
        FailureKind::Authentication,
    ] {
        let fixture = Fixture::new(Script::Failure(kind));
        let store = fixture.store();
        let claim = fixture.claim(&store).await;
        let opened = fixture.runtime().open(claim.lease).await.unwrap();
        let MasterOutcome::Settled(receipt) = fixture
            .master(4, "Be concise")
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("expected failed settlement")
        };
        assert_eq!(receipt.outcome.status, OutcomeStatus::Failed);
        let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
        assert_eq!(account.inference_failure.unwrap().kind, kind);
        if kind == FailureKind::OutputLimit {
            assert_eq!(
                account.stop_reason,
                Some(grida_agent_master::StopReason::OutputLimit)
            );
        } else {
            assert_eq!(account.stop_reason, None);
        }
    }
}

#[tokio::test]
async fn pausing_an_input_count_preserves_the_last_generation_step() {
    let fixture = Fixture::new(Script::Answer);
    *fixture.provider.measurement.lock().unwrap() = Some(InputMeasurement {
        tokens: 100,
        kind: MeasurementKind::Exact,
    });
    let entered = Arc::new(tokio::sync::Notify::new());
    *fixture.provider.hold_next_count.lock().unwrap() = Some(entered.clone());
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let operations = opened.turn.operations();
    let limit = std::num::NonZeroU64::new(100);
    let master = fixture.master(1, "Be concise").with_input_limit(limit);
    let worker = tokio::spawn(async move { master.run(opened.turn, input()).await.unwrap() });
    tokio::time::timeout(Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    let view = store.inspect(session_id()).await.unwrap();
    store
        .control(ControlRequest {
            id: change_id("pause-during-count"),
            session: session_id(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn_id(),
                expected: view.current.unwrap().controls.revision,
                directive: ControlDirective::Pause,
            },
        })
        .await
        .unwrap();
    let MasterOutcome::Suspended(suspension) = tokio::time::timeout(Duration::from_secs(2), worker)
        .await
        .unwrap()
        .unwrap()
    else {
        panic!("expected durable suspension after pausing the count");
    };
    store
        .verify(CommitReceipt::Suspended(suspension))
        .await
        .unwrap();
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);
    let view = operations.view();
    let [original] = view.state.operations().values().collect::<Vec<_>>()[..] else {
        panic!("expected one prepared operation");
    };
    assert!(original.attempts.is_empty());

    let view = store.inspect(session_id()).await.unwrap();
    let current = view.current.unwrap();
    let ClaimOutcome::Acquired(claim) = store
        .claim(ClaimRequest {
            id: change_id("resume-after-count"),
            session: session_id(),
            expected_revision: view.revision,
            selection: TurnSelection::ResumePaused {
                turn: turn_id(),
                epoch: current.binding.epoch,
                position: current.position,
                control_revision: current.controls.revision,
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected resumed owner");
    };
    let resumed = fixture.runtime().open(claim.lease).await.unwrap();
    let operations = resumed.turn.operations();
    let MasterOutcome::Settled(receipt) = fixture
        .master(1, "Be concise")
        .with_input_limit(limit)
        .run(resumed.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected the resumed task to settle");
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.steps, 1);
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    assert_eq!(fixture.provider.measured_requests.lock().unwrap().len(), 2);
    let view = operations.view();
    assert_eq!(view.state.operations().len(), 2);
    assert_eq!(
        view.state
            .operations()
            .values()
            .map(|operation| operation.attempts.len())
            .sum::<usize>(),
        1
    );
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn a_request_prepared_after_resume_settles_its_own_interruption_as_uncertain() {
    let fixture = Fixture::new(Script::DeadlineCut);
    *fixture.provider.measurement.lock().unwrap() = Some(InputMeasurement {
        tokens: 100,
        kind: MeasurementKind::Exact,
    });
    let entered = Arc::new(tokio::sync::Notify::new());
    *fixture.provider.hold_next_count.lock().unwrap() = Some(entered.clone());
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let limit = std::num::NonZeroU64::new(100);
    let master = fixture.master(3, "Be concise").with_input_limit(limit);
    let worker = tokio::spawn(async move { master.run(opened.turn, input()).await.unwrap() });
    tokio::time::timeout(Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    let view = store.inspect(session_id()).await.unwrap();
    store
        .control(ControlRequest {
            id: change_id("pause-before-dispatch"),
            session: session_id(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn_id(),
                expected: view.current.unwrap().controls.revision,
                directive: ControlDirective::Pause,
            },
        })
        .await
        .unwrap();
    let MasterOutcome::Suspended(suspension) = tokio::time::timeout(Duration::from_secs(2), worker)
        .await
        .unwrap()
        .unwrap()
    else {
        panic!("expected durable suspension before the first dispatch");
    };
    store
        .verify(CommitReceipt::Suspended(suspension))
        .await
        .unwrap();
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);

    let view = store.inspect(session_id()).await.unwrap();
    let current = view.current.unwrap();
    let ClaimOutcome::Acquired(claim) = store
        .claim(ClaimRequest {
            id: change_id("resume-before-dispatch"),
            session: session_id(),
            expected_revision: view.revision,
            selection: TurnSelection::ResumePaused {
                turn: turn_id(),
                epoch: current.binding.epoch,
                position: current.position,
                control_revision: current.controls.revision,
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected resumed owner");
    };
    let resumed = fixture.runtime().open(claim.lease).await.unwrap();
    let MasterOutcome::Settled(receipt) = fixture
        .master(3, "Be concise")
        .with_input_limit(limit)
        .run(resumed.turn, input())
        .await
        .unwrap()
    else {
        panic!("expected the interrupted request to settle");
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Uncertain);
    let account = read_account(receipt.outcome.account.as_ref().unwrap()).unwrap();
    assert_eq!(account.steps, 1);
    assert_eq!(account.stop_reason, None);
    assert_eq!(
        account.text,
        "The model request reached its time limit. Review any partial work, then try a shorter request."
    );
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
}

#[tokio::test]
async fn goal_controls_and_terminal_account_share_exact_durable_state() {
    let fixture = Fixture::new(Script::Answer);
    let store = fixture.store();
    let runtime = fixture.runtime();
    let session = session_id();
    let turn = turn_id();
    let accepted = change_id("goal-work");
    store
        .create(CreateSession {
            id: session.clone(),
            request: change_id("create-goal-session"),
            configuration: envelope("configuration"),
        })
        .await
        .unwrap();
    let mut goal = Goal::start(
        change_id("start-goal"),
        Objective {
            description: "Verify the handoff".into(),
            criteria: vec!["The exported file opens".into()],
        },
        Allowance {
            work_turns: NonZeroU32::new(3).unwrap(),
            inference_steps: NonZeroU32::new(8).unwrap(),
        },
    )
    .unwrap();
    let original_basis = goal.basis().clone();
    goal.reserve(&original_basis, turn.clone(), NonZeroU32::new(2).unwrap())
        .unwrap();
    let start = ControlRequest {
        id: change_id("accept-goal"),
        session: session.clone(),
        expected_revision: store.inspect(session.clone()).await.unwrap().revision,
        action: SessionControl::DriverState {
            change: DriverStateChange {
                expected: DriverStateRevision(0),
                value: Some(goal.encode().unwrap()),
            },
            turn: None,
        },
    };
    let started = store.control(start.clone()).await.unwrap();
    assert_eq!(started.driver_state_revision, Some(DriverStateRevision(1)));
    assert_eq!(store.control(start).await.unwrap(), started);
    store
        .submit(
            session.clone(),
            Submission {
                id: accepted.clone(),
                payload: envelope("continue the goal"),
            },
        )
        .await
        .unwrap();
    let ClaimOutcome::Acquired(claim) = store
        .claim(ClaimRequest {
            id: change_id("claim-goal"),
            session: session.clone(),
            expected_revision: store.inspect(session.clone()).await.unwrap().revision,
            selection: TurnSelection::New {
                turn: turn.clone(),
                inputs: vec![accepted],
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected goal work ownership");
    };
    let mut opened = runtime.open(claim.lease).await.unwrap();
    assert_eq!(
        opened.turn.view().state.driver_state().value(),
        Some(&goal.encode().unwrap())
    );

    let mut stale = goal.clone();
    stale.account(&turn, WorkOutcome::NotDispatched).unwrap();
    goal.set_paused(&original_basis, true).unwrap();
    let before = store.inspect(session.clone()).await.unwrap();
    let current = before.current.unwrap();
    let pause_change = DriverStateChange {
        expected: DriverStateRevision(1),
        value: Some(goal.encode().unwrap()),
    };
    let targetless = ControlRequest {
        id: change_id("missing-pause-target"),
        session: session.clone(),
        expected_revision: before.revision,
        action: SessionControl::DriverState {
            change: pause_change.clone(),
            turn: None,
        },
    };
    assert_eq!(
        store.control(targetless).await.unwrap_err().code,
        "driver_state_requires_turn_control"
    );
    let paused = store
        .control(ControlRequest {
            id: change_id("pause-goal"),
            session: session.clone(),
            expected_revision: before.revision,
            action: SessionControl::DriverState {
                change: pause_change,
                turn: Some(TurnControl {
                    turn: turn.clone(),
                    expected: current.controls.revision,
                    directive: ControlDirective::Pause,
                }),
            },
        })
        .await
        .unwrap();
    assert_eq!(paused.driver_state_revision, Some(DriverStateRevision(2)));
    let observed = store.inspect(session.clone()).await.unwrap();
    let current = observed.current.unwrap();
    assert!(current.controls.paused);
    assert!(
        Goal::decode(observed.driver_state.value().unwrap())
            .unwrap()
            .paused()
    );
    let FinishOutcome::Continue(rejected) = opened
        .turn
        .try_finish_with_driver_state(
            CompletionDraft {
                expected_control: current.controls.revision,
                expected_history: current.history_position,
                outcome: TurnOutcome {
                    status: OutcomeStatus::Succeeded,
                    account: None,
                    evidence: vec![],
                },
            },
            DriverStateChange {
                expected: DriverStateRevision(1),
                value: Some(stale.encode().unwrap()),
            },
        )
        .await
        .unwrap()
    else {
        panic!("a stale decision settled the turn");
    };
    assert_eq!(rejected.code, "driver_state_revision_changed");
    assert!(
        store
            .inspect_turn(session.clone(), turn.clone())
            .await
            .unwrap()
            .outcome
            .is_none()
    );

    goal.clear(&goal.basis().clone()).unwrap();
    let cleared = store
        .control(ControlRequest {
            id: change_id("clear-goal"),
            session: session.clone(),
            expected_revision: observed.revision,
            action: SessionControl::DriverState {
                change: DriverStateChange {
                    expected: DriverStateRevision(2),
                    value: Some(goal.encode().unwrap()),
                },
                turn: Some(TurnControl {
                    turn: turn.clone(),
                    expected: current.controls.revision,
                    directive: ControlDirective::Cancel,
                }),
            },
        })
        .await
        .unwrap();
    assert_eq!(cleared.driver_state_revision, Some(DriverStateRevision(3)));
    goal.account(&turn, WorkOutcome::NotDispatched).unwrap();
    let final_goal = goal.encode().unwrap();
    let current = store
        .inspect_turn(session.clone(), turn.clone())
        .await
        .unwrap();
    assert!(current.controls.cancelled);
    let FinishOutcome::Settled(receipt) = opened
        .turn
        .try_finish_with_driver_state(
            CompletionDraft {
                expected_control: current.controls.revision,
                expected_history: current.history_position,
                outcome: TurnOutcome {
                    status: OutcomeStatus::Cancelled,
                    account: Some(final_goal.clone()),
                    evidence: vec![],
                },
            },
            DriverStateChange {
                expected: DriverStateRevision(3),
                value: Some(final_goal),
            },
        )
        .await
        .unwrap()
    else {
        panic!("expected atomic goal settlement");
    };
    assert_eq!(
        receipt.record.driver_state_revision,
        Some(DriverStateRevision(4))
    );
    drop(opened);
    drop(store);

    let reopened = fixture.reopen().await;
    reopened
        .verify(CommitReceipt::Settled(*receipt))
        .await
        .unwrap();
    let observed = reopened.inspect(session).await.unwrap();
    assert!(observed.current.is_none());
    assert_eq!(observed.driver_state.revision(), DriverStateRevision(4));
    let restored = Goal::decode(observed.driver_state.value().unwrap()).unwrap();
    assert_eq!(restored.status(), Status::Cleared);
    assert!(restored.reservation().is_none());
    assert_eq!(
        observed.latest.unwrap().outcome.unwrap().account.as_ref(),
        observed.driver_state.value()
    );
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);
}

fn goal_for_work(steps: u32) -> Goal {
    let mut goal = Goal::start(
        change_id("goal"),
        Objective {
            description: "Verify the handoff".into(),
            criteria: vec!["The exported file opens".into()],
        },
        Allowance {
            work_turns: NonZeroU32::new(3).unwrap(),
            inference_steps: NonZeroU32::new(steps).unwrap(),
        },
    )
    .unwrap();
    goal.reserve(
        &goal.basis().clone(),
        turn_id(),
        NonZeroU32::new(steps).unwrap(),
    )
    .unwrap();
    goal
}

async fn claim_goal_work(store: &SqliteStore, goal: &Goal) -> ClaimedTurn {
    let session = session_id();
    let created = store
        .create(CreateSession {
            id: session.clone(),
            request: change_id("create-goal-session"),
            configuration: envelope("configuration"),
        })
        .await
        .unwrap();
    store
        .control(ControlRequest {
            id: change_id("accept-goal"),
            session: session.clone(),
            expected_revision: created.revision,
            action: SessionControl::DriverState {
                change: DriverStateChange {
                    expected: DriverStateRevision(0),
                    value: Some(goal.encode().unwrap()),
                },
                turn: None,
            },
        })
        .await
        .unwrap();
    let input = change_id("goal-input");
    store
        .submit(
            session.clone(),
            Submission {
                id: input.clone(),
                payload: envelope("continue goal"),
            },
        )
        .await
        .unwrap();
    let ClaimOutcome::Acquired(claim) = store
        .claim(ClaimRequest {
            id: change_id("claim-goal"),
            session: session.clone(),
            expected_revision: store.inspect(session).await.unwrap().revision,
            selection: TurnSelection::New {
                turn: turn_id(),
                inputs: vec![input],
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected goal work ownership");
    };
    claim
}

#[tokio::test]
async fn ultra_cannot_spend_child_capacity_from_a_parent_only_goal_reservation() {
    let mut fixture = Fixture::new(Script::EffortReview);
    let review = fixture.install_review();
    let store = fixture.store();
    let goal = goal_for_work(8);
    let claim = claim_goal_work(&store, &goal).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let Err(error) = fixture
        .master(2, "Inspect the fixture layout.")
        .with_effort(fixture.effort(Preset::Ultra))
        .unwrap()
        .run(opened.turn, input())
        .await
    else {
        panic!("expected goal work to refuse a separate child allowance")
    };
    assert_eq!(error.code, "goal_child_allowance_unavailable");
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 0);
    assert_eq!(review.invocations.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn goal_completion_requires_an_independently_verified_current_tool_call() {
    use grida_agent_master::goals::tools;

    for (call, verify, expected) in [
        ("goal-check", true, Status::Complete),
        (
            "goal-check",
            false,
            Status::Blocked(Blocker::UnverifiedCompletion),
        ),
        (
            "goal-report",
            true,
            Status::Blocked(Blocker::UnverifiedCompletion),
        ),
        (
            "another-turn-call",
            true,
            Status::Blocked(Blocker::UnverifiedCompletion),
        ),
    ] {
        let mut fixture = Fixture::new(Script::GoalReport { call });
        let store = fixture.store();
        let goal = goal_for_work(4);
        let mut inventory = Inventory::new();
        inventory.insert(fixture.tool.clone()).unwrap();
        let mut selected = vec![tool_id()];
        for tool in tools::for_work(&goal, &turn_id()).unwrap() {
            selected.push(tool.definition().id.clone());
            inventory.insert(tool).unwrap();
        }
        fixture.inventory = inventory.snapshot(&selected).unwrap();
        let claimed = claim_goal_work(&store, &goal).await;
        let runtime = fixture.runtime();
        let opened = runtime.open(claimed.lease).await.unwrap();
        let mut master = fixture.master(8, "Verify the export");
        if verify {
            master = master.with_goal_verifier(|criterion, operation| {
                matches!(&operation.record.input, agent_kit_core::turn::OperationInput::Tool(invocation)
                    if invocation.definition().id == tool_id())
                    && matches!(operation.outcome(), Some(agent_kit_core::turn::OperationOutcome::Tool(outcome))
                        if outcome.content == vec![ResultContent::Text("opened".into())])
                    && criterion == "The exported file opens"
            });
        }
        let MasterOutcome::Settled(receipt) = master.run(opened.turn, input()).await.unwrap()
        else {
            panic!("expected goal work to settle");
        };
        assert_eq!(receipt.outcome.status, OutcomeStatus::Succeeded);
        let account = read_account(receipt.outcome.account.as_ref().unwrap())
            .unwrap()
            .goal
            .unwrap();
        assert_eq!(account.status, expected);
        assert_eq!(
            account.spent,
            Usage {
                work_turns: 1,
                inference_steps: 3,
            }
        );
        assert_eq!(
            account.verified.len(),
            usize::from(expected == Status::Complete)
        );
        assert!(account.held.is_none());
        assert_eq!(
            receipt.record.driver_state_revision,
            Some(DriverStateRevision(2))
        );
        if let Some(verified) = account.verified.first() {
            assert!(receipt.outcome.evidence.contains(&verified.operation));
        }
        let current = store.inspect(session_id()).await.unwrap();
        assert_eq!(
            Goal::decode(current.driver_state.value().unwrap())
                .unwrap()
                .status(),
            expected
        );
        store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
    }
}

#[tokio::test]
async fn goal_work_clamps_steps_and_retains_uncertainty() {
    for uncertain in [false, true] {
        let fixture = Fixture::new(Script::Tools);
        fixture.tool.uncertain.store(uncertain, Ordering::SeqCst);
        let store = fixture.store();
        let goal = goal_for_work(1);
        let claimed = claim_goal_work(&store, &goal).await;
        let runtime = fixture.runtime();
        let opened = runtime.open(claimed.lease).await.unwrap();
        let MasterOutcome::Settled(receipt) = fixture
            .master(8, "Verify the export")
            .run(opened.turn, input())
            .await
            .unwrap()
        else {
            panic!("expected goal work to settle");
        };
        let account = read_account(receipt.outcome.account.as_ref().unwrap())
            .unwrap()
            .goal
            .unwrap();
        assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
        assert_eq!(account.remaining.inference_steps, 0);
        if uncertain {
            assert_eq!(account.status, Status::Blocked(Blocker::UncertainWork));
            assert_eq!(account.held.unwrap().uncertain_steps, Some(1));
            assert_eq!(account.spent, Usage::default());
        } else {
            assert_eq!(account.status, Status::Exhausted);
            assert!(account.held.is_none());
            assert_eq!(account.spent.inference_steps, 1);
        }
    }
}
