use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::inference::{
    InferenceControl, InferenceOutcome, InferenceRequest, InferenceRun, InferenceStatus,
    InferenceUpdate, InputFormat, Modality, ModelCapabilities, PreparedRequest, Provider,
    ProviderBinding, ProviderEvent,
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
use grida_agent_master::{Master, MasterAuthority, MasterConfig, MasterOutcome, read_account};
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
    ToolThenAnswer,
    Tools,
}

struct ScriptProvider {
    script: Script,
    calls: AtomicUsize,
    requests: Mutex<Vec<InferenceRequest>>,
}

impl Provider for ScriptProvider {
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
                authority: authority(),
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
        let tools = matches!(self.script, Script::Tools)
            || matches!(self.script, Script::ToolThenAnswer) && index == 0;
        let (content, update) = if tools {
            let call = ToolCall {
                id: ToolCallId::new(format!("call-{index}"))?,
                tool: tool_id(),
                arguments: ToolArguments::Json(serde_json::json!({ "value": "echoed" })),
            };
            (
                Content::ToolCall(call.clone()),
                Some(ProviderEvent::Update(InferenceUpdate::ToolCall(call))),
            )
        } else {
            (Content::Text("Finished".into()), None)
        };
        let outcome = InferenceOutcome {
            status: InferenceStatus::Completed,
            messages: vec![message(
                &format!("answer-{index}"),
                Role::Assistant,
                content,
            )],
            usage: vec![],
            failure: None,
            receipt: None,
        };
        let events = update
            .into_iter()
            .chain(std::iter::once(ProviderEvent::Finished(outcome)))
            .collect::<Vec<_>>();
        Ok(InferenceRun::from_stream(control, move |_| {
            Box::pin(stream::iter(events))
        }))
    }
}

struct EchoTool {
    definition: ToolDefinition,
    calls: AtomicUsize,
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

struct Granted;
impl AuthorityValidator for Granted {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            if request.selection == grants() {
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
        });
        let tool = Arc::new(EchoTool::new());
        let mut inventory = Inventory::new();
        inventory.insert(tool.clone()).unwrap();
        Self {
            directory,
            provider,
            tool,
            inventory: inventory.snapshot(&[tool_id()]).unwrap(),
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
            authority: Arc::new(Granted),
            gate,
            limits: ExecutionLimits {
                max_operations: 64,
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
                inference: grants(),
                tools: if matches!(self.provider.script, Script::Answer) {
                    BTreeMap::new()
                } else {
                    BTreeMap::from([(tool_id(), grants())])
                },
            },
        )
        .unwrap()
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
    ControlAfterCommit(ControlDirective),
    ControlBeforeBoundary(ControlDirective),
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
            ) {
                let previous = self.loads_before_control.fetch_update(
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                    |remaining| remaining.checked_sub(1),
                );
                if previous == Ok(1) {
                    let PublicationInterruption::ControlBeforeBoundary(directive) =
                        self.interruption
                    else {
                        unreachable!()
                    };
                    let state = self.lease.journal().load().await?;
                    let change = JournalChange::new(
                        change_id("racing-control"),
                        state.binding().clone(),
                        state.position(),
                        state.controls().revision,
                        vec![JournalAction::Control(directive)],
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
                PublicationInterruption::BeforeCommit | PublicationInterruption::BeforeOutcome => {
                    Err(Error::new(
                        ErrorKind::Unavailable,
                        "publication_interrupted",
                    ))
                }
                PublicationInterruption::ControlBeforeBoundary(_) => {
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
            }
        })
    }
    fn lookup(&self, id: ChangeId) -> BoxFuture<'_, Result<Option<CommitReceipt>>> {
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
    let claim = fixture.recover(&reopened).await;
    let opened = fixture.runtime().open(claim.lease).await.unwrap();
    let result = fixture.master(4, "Changed").run(opened.turn, input()).await;
    let Err(error) = result else {
        panic!("changed configuration must be rejected")
    };
    assert_eq!(error.code, "master_configuration_changed");
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 1);
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
    assert_eq!(fixture.provider.calls.load(Ordering::SeqCst), 2);
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 2);
    store.verify(CommitReceipt::Settled(receipt)).await.unwrap();
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

struct DeferForInput;
impl ToolGate for DeferForInput {
    fn decide(
        &self,
        _: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
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
async fn stopping_a_deferred_turn_withdraws_input_and_cancels_prepared_tools() {
    let fixture = Fixture::new(Script::ToolThenAnswer);
    let store = fixture.store();
    let claim = fixture.claim(&store).await;
    let opened = fixture
        .runtime_with_gate(Arc::new(DeferForInput))
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
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 0);
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
        .runtime_with_gate(Arc::new(DeferForInput))
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
    assert_eq!(fixture.tool.calls.load(Ordering::SeqCst), 0);
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
