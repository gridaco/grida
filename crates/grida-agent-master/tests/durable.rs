use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceOutcome, InferenceRequest,
    InferenceRun, InferenceStatus, InferenceUpdate, InputFormat, InputMeasurement, MeasurementKind,
    Modality, ModelCapabilities, PreparedRequest, Provider, ProviderBinding, ProviderEvent,
    RequestControl, UsageObservation,
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
    JournalAction, JournalChange, ResponseContract, TurnBinding, TurnJournal, TurnLease, TurnState,
    WaitRecord, bind_lease,
};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, GrantId, MessageId, ModelId,
    PrincipalId, ProviderId, Result, SchemaId, ScopeId, SessionId, ToolCallId, ToolId, TurnId,
    WaitId,
};
use agent_kit_runtime::{
    AdmissionContext, ExecutionLimits, ExecutionServices, Runtime, ToolAdmission, ToolDecision,
    ToolGate,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ClaimedTurn, ControlRequest, CreateSession, RecoveryRequest,
    SessionControl, SessionStore, Submission, TurnDisposition, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use futures_util::stream;
use grida_agent_master::{
    Master, MasterAuthority, MasterConfig, MasterOutcome, StopReason, read_account,
};
use std::collections::{BTreeMap, BTreeSet};
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
    UsageAnswer,
    Failure(FailureKind),
    ToolThenAnswer,
    ToolAndDeferred,
    Tools,
}

struct ScriptProvider {
    script: Script,
    calls: AtomicUsize,
    requests: Mutex<Vec<InferenceRequest>>,
    measurement: Mutex<Option<InputMeasurement>>,
    measured_requests: Mutex<Vec<InferenceRequest>>,
    hold_next_count: Mutex<Option<Arc<tokio::sync::Notify>>>,
    authority: Mutex<AuthorityBinding>,
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
        Ok(ModelCapabilities {
            revision: BindingId::new("script-v1")?,
            input_modalities: BTreeSet::from([Modality::Text]),
            json_tools: true,
            text_tools: true,
            max_output_tokens: Some(4096),
        })
    }
    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
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
        let index = self.calls.fetch_add(1, Ordering::SeqCst);
        self.requests
            .lock()
            .unwrap()
            .push(request.request().clone());
        let tools = matches!(self.script, Script::Tools | Script::ToolAndDeferred)
            || matches!(self.script, Script::ToolThenAnswer) && index == 0;
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
        if matches!(self.script, Script::ToolAndDeferred) {
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

struct Granted(GrantSelection);
impl AuthorityValidator for Granted {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            if request.selection == self.0 {
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
        let provider: Arc<dyn Provider> = self.provider.clone();
        Runtime::new(ExecutionServices {
            providers: BTreeMap::from([(provider_id(), provider)]),
            tools: self.inventory.clone(),
            authority: Arc::new(Granted(self.grants())),
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
        Master::new(
            MasterConfig {
                model: ModelId::new("model").unwrap(),
                instructions: instructions.into(),
                max_steps: steps,
                max_output_tokens: 1024,
            },
            self.provider.clone(),
            self.inventory.clone(),
            MasterAuthority {
                inference: self.grants(),
                tools: if matches!(self.provider.script, Script::Answer) {
                    BTreeMap::new()
                } else {
                    BTreeMap::from([(tool_id(), self.grants())])
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
    assert_eq!(
        read_account(receipt.outcome.account.as_ref().unwrap())
            .unwrap()
            .steps,
        2
    );
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 1);
    let requests = fixture.provider.requests.lock().unwrap();
    assert!(requests[1].messages.iter().flat_map(|message| &message.content).any(|part| matches!(part, Content::ToolResult(result) if result.status == OutcomeStatus::Succeeded && result.content == vec![ResultContent::Text("echoed".into())])));
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
    assert!(
        read_account(receipt.outcome.account.as_ref().unwrap())
            .unwrap()
            .unresolved
            .is_empty()
    );
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
    for (measurement, code) in [
        (None, "input_measurement_unavailable"),
        (
            Some(InputMeasurement {
                tokens: 1,
                kind: MeasurementKind::Estimate,
            }),
            "input_bound_unavailable",
        ),
        (
            Some(InputMeasurement {
                tokens: 101,
                kind: MeasurementKind::Exact,
            }),
            "input_token_limit",
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
