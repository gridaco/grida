use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::history::{HistoryPosition, HistoryRecord};
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceOutcome, InferenceRequest,
    InferenceRun, InferenceStatus, InferenceUpdate, InputFormat, InputMeasurement, MeasurementKind,
    Modality, ModelCapabilities, PreparedRequest, Provider, ProviderBinding, ProviderEvent,
    RequestControl,
};
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role, ToolArguments, ToolCall,
};
use agent_kit_core::tools::{
    Inventory, Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool,
    ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{
    CommitReceipt, ControlDirective, ControlReader, ControlRevision, ControlSnapshot,
    EphemeralControl, EphemeralJournal, JournalAction, JournalChange, ResponseContract,
    TurnBinding, TurnJournal, TurnLease, TurnOutcome, TurnState, WaitRecord, bind_lease,
};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, GrantId, MessageId,
    ModelId, PrincipalId, ProviderId, Result, SchemaId, ScopeId, SessionId, ToolCallId, ToolId,
    TurnId, WaitId,
};
use agent_kit_runtime::*;
use futures_util::{StreamExt, stream};
use std::collections::{BTreeMap, BTreeSet};
use std::num::NonZeroU64;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{Notify, mpsc};

fn grants() -> GrantSelection {
    GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("local-user").unwrap(),
            binding: BindingId::new("host").unwrap(),
            scope: ScopeId::new("workspace").unwrap(),
        },
        grants: vec![GrantId::new("tools").unwrap()],
    }
}

fn tool_grants() -> BTreeMap<ToolId, GrantSelection> {
    BTreeMap::from([(ToolId::new("counter").unwrap(), grants())])
}

fn binding() -> TurnBinding {
    TurnBinding {
        session: SessionId::new("session").unwrap(),
        turn: TurnId::new("turn").unwrap(),
        epoch: 1,
    }
}

fn envelope(text: &str) -> Envelope {
    Envelope::new(
        SchemaId::new("test-text").unwrap(),
        1,
        text.as_bytes().to_vec(),
    )
    .unwrap()
}

fn question() -> WaitRecord {
    WaitRecord {
        id: WaitId::new("question").unwrap(),
        request: envelope("Continue?"),
        response: ResponseContract {
            schema: SchemaId::new("test-text").unwrap(),
            version: 1,
        },
        answer: None,
        withdrawn: false,
    }
}

struct Authority {
    allowed: AtomicBool,
    requests: Mutex<Vec<AuthorityRequest>>,
}

impl Authority {
    fn allowed() -> Arc<Self> {
        Arc::new(Self {
            allowed: AtomicBool::new(true),
            requests: Mutex::new(vec![]),
        })
    }
}

impl AuthorityValidator for Authority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            self.requests.lock().unwrap().push(request);
            if self.allowed.load(Ordering::SeqCst) {
                Ok(())
            } else {
                Err(Error::new(ErrorKind::Unavailable, "grant_denied"))
            }
        })
    }
}

struct Allow;
impl ToolGate for Allow {
    fn decide(&self, _: ToolAdmission, _: AdmissionContext) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async { Ok(ToolDecision::Permit) })
    }
}

struct Ask;
impl ToolGate for Ask {
    fn decide(
        &self,
        _: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            let pending = question();
            let id = pending.id.clone();
            context.operations.request_input(pending).await?;
            if context
                .operations
                .view()
                .state
                .waits()
                .get(&id)
                .unwrap()
                .answer
                .is_some()
            {
                Ok(ToolDecision::Permit)
            } else {
                Ok(ToolDecision::Defer(id))
            }
        })
    }
}

struct ScriptedProvider {
    starts: AtomicUsize,
    attempts: Mutex<Vec<agent_kit_core::AttemptId>>,
    events: Vec<ProviderEvent>,
    receiver: Mutex<Option<mpsc::UnboundedReceiver<ProviderEvent>>>,
}

impl ScriptedProvider {
    fn complete() -> Arc<Self> {
        Arc::new(Self {
            starts: AtomicUsize::new(0),
            attempts: Mutex::new(vec![]),
            events: vec![ProviderEvent::Finished(inference_outcome(vec![
                Content::Text("answer".into()),
            ]))],
            receiver: Mutex::new(None),
        })
    }

    fn streaming() -> (Arc<Self>, mpsc::UnboundedSender<ProviderEvent>) {
        let (sender, receiver) = mpsc::unbounded_channel();
        (
            Arc::new(Self {
                starts: AtomicUsize::new(0),
                attempts: Mutex::new(vec![]),
                events: vec![],
                receiver: Mutex::new(Some(receiver)),
            }),
            sender,
        )
    }
}

impl Provider for ScriptedProvider {
    fn capabilities(&self, _: &ModelId) -> Result<ModelCapabilities> {
        Ok(ModelCapabilities {
            revision: BindingId::new("model-v1").unwrap(),
            input_modalities: BTreeSet::from([Modality::Text]),
            json_tools: true,
            text_tools: false,
            max_output_tokens: Some(1024),
        })
    }

    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        let capabilities = self.capabilities(&request.model)?;
        PreparedRequest::from_validated(
            request,
            ProviderBinding {
                provider: ProviderId::new("test").unwrap(),
                authority: grants().authority,
            },
            capabilities,
        )
    }

    fn start(&self, _: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        self.starts.fetch_add(1, Ordering::SeqCst);
        self.attempts.lock().unwrap().push(control.attempt.clone());
        if let Some(receiver) = self.receiver.lock().unwrap().take() {
            Ok(InferenceRun::from_stream(control, |_| {
                stream::unfold(receiver, |mut receiver| async move {
                    receiver.recv().await.map(|event| (event, receiver))
                })
                .boxed()
            }))
        } else {
            let events = self.events.clone();
            Ok(InferenceRun::from_stream(control, |_| {
                stream::iter(events).boxed()
            }))
        }
    }
}

fn inference_outcome(content: Vec<Content>) -> InferenceOutcome {
    InferenceOutcome {
        status: InferenceStatus::Completed,
        messages: vec![Message {
            id: MessageId::new("answer").unwrap(),
            role: Role::Assistant,
            phase: None,
            content,
            provenance: Provenance {
                source: "test".into(),
                kind: ProvenanceKind::Generated,
                fingerprint: None,
            },
        }],
        usage: vec![],
        failure: None,
        receipt: None,
    }
}

struct CounterTool {
    definition: ToolDefinition,
    calls: AtomicUsize,
    recoveries: AtomicUsize,
    attempts: Mutex<Vec<agent_kit_core::AttemptId>>,
    release: Option<Arc<Notify>>,
}

impl CounterTool {
    fn new(release: Option<Arc<Notify>>) -> Arc<Self> {
        Arc::new(Self {
            definition: ToolDefinition {
                id: ToolId::new("counter").unwrap(),
                version: 1,
                description: "Count an invocation".into(),
                input: InputFormat::Json(serde_json::json!({"type":"object"})),
                max_input_bytes: 1024,
                max_output_bytes: 4096,
                recovery: RecoveryKind::Reconcile,
            },
            calls: AtomicUsize::new(0),
            recoveries: AtomicUsize::new(0),
            attempts: Mutex::new(vec![]),
            release,
        })
    }
}

fn success() -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Succeeded,
        content: vec![],
        structured: Some(serde_json::json!({"done":true})),
        receipt: None,
        truncated: false,
    }
}

impl Tool for CounterTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        match arguments {
            ToolArguments::Json(value) if value.is_object() => Ok(()),
            _ => Err(Error::new(ErrorKind::InvalidInput, "object_required")),
        }
    }
    fn invoke(&self, _: Invocation, context: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.attempts.lock().unwrap().push(context.attempt);
            self.calls.fetch_add(1, Ordering::SeqCst);
            if let Some(release) = &self.release {
                release.notified().await;
            }
            success()
        })
    }
    fn recover(
        &self,
        _: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.attempts.lock().unwrap().push(context.attempt);
            self.recoveries.fetch_add(1, Ordering::SeqCst);
            success()
        })
    }
}

fn inventory(tool: &Arc<CounterTool>) -> agent_kit_core::tools::InventorySnapshot {
    let mut inventory = Inventory::new();
    inventory.insert(tool.clone()).unwrap();
    inventory
        .snapshot(std::slice::from_ref(&tool.definition.id))
        .unwrap()
}

fn runtime(
    provider: Arc<dyn Provider>,
    tool: &Arc<CounterTool>,
    gate: Arc<dyn ToolGate>,
    authority: Arc<Authority>,
) -> Runtime {
    Runtime::new(ExecutionServices {
        providers: BTreeMap::from([(ProviderId::new("test").unwrap(), provider)]),
        tools: inventory(tool),
        authority,
        gate,
        limits: ExecutionLimits {
            max_operations: 32,
            max_concurrent_inferences: 1,
            max_concurrent_tools: 1,
            max_output_bytes: 65_536,
            operation_timeout: Duration::from_secs(5),
            observer_capacity: 16,
        },
    })
    .unwrap()
}

fn request(
    provider: &ScriptedProvider,
    tools: &agent_kit_core::tools::InventorySnapshot,
) -> PreparedRequest {
    provider
        .prepare(InferenceRequest {
            model: ModelId::new("test-model").unwrap(),
            messages: vec![],
            tools: tools.offers().unwrap(),
            max_output_tokens: Some(256),
            extension: None,
        })
        .unwrap()
}

fn invocation(value: u64) -> PlannedInvocation {
    PlannedInvocation {
        tool: ToolId::new("counter").unwrap(),
        arguments: ToolArguments::Json(serde_json::json!({"value":value})),
        grants: grants(),
    }
}

async fn wait_for_count(counter: &AtomicUsize, expected: usize) {
    tokio::time::timeout(Duration::from_secs(2), async {
        while counter.load(Ordering::SeqCst) < expected {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("operation started");
}

#[tokio::test]
async fn simple_master_publishes_history_and_checkpoint_atomically() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let mut turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let outcome = turn
        .step(StepPlan {
            key: OperationKey::new("answer").unwrap(),
            request: request(&provider, &inventory(&tool)),
            inference_grants: grants(),
            tool_grants: tool_grants(),
            tools: inventory(&tool),
        })
        .await
        .unwrap();
    assert_eq!(turn.view().state.history().position(), HistoryPosition(0));
    let receipt = turn
        .publish_continuation(
            OperationKey::new("publish").unwrap(),
            outcome.history.clone(),
            envelope("done"),
        )
        .await
        .unwrap();
    let replay = turn
        .publish_continuation(
            OperationKey::new("publish").unwrap(),
            outcome.history,
            envelope("done"),
        )
        .await
        .unwrap();
    assert_eq!(receipt, replay);
    assert_eq!(turn.view().state.history().position(), HistoryPosition(1));
    let view = turn.view();
    let result = turn
        .try_finish(CompletionDraft {
            expected_control: view.state.controls().revision,
            expected_history: view.state.history().position(),
            outcome: TurnOutcome {
                status: OutcomeStatus::Succeeded,
                account: None,
                evidence: vec![],
            },
        })
        .await
        .unwrap();
    assert!(matches!(result, FinishOutcome::Settled(_)));
}

#[tokio::test]
async fn repeated_operations_return_committed_results_and_reject_changed_input() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    let key = OperationKey::new("tool").unwrap();
    let first = operations.invoke(key.clone(), invocation(1)).await.unwrap();
    assert_eq!(
        operations.invoke(key.clone(), invocation(1)).await.unwrap(),
        first
    );
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    assert_eq!(
        operations
            .invoke(key, invocation(2))
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Conflict
    );
    let key = OperationKey::new("model").unwrap();
    let input = request(&provider, &inventory(&tool));
    let result = operations
        .infer(key.clone(), input.clone(), grants())
        .await
        .unwrap();
    assert_eq!(
        operations.infer(key, input, grants()).await.unwrap(),
        result
    );
    assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn concurrent_duplicates_attach_to_one_tool_execution() {
    let provider = ScriptedProvider::complete();
    let release = Arc::new(Notify::new());
    let tool = CounterTool::new(Some(release.clone()));
    let runtime = runtime(provider, &tool, Arc::new(Allow), Authority::allowed());
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let first_ops = turn.operations();
    let second_ops = turn.operations();
    let first = tokio::spawn(async move {
        first_ops
            .invoke(OperationKey::new("one").unwrap(), invocation(1))
            .await
    });
    wait_for_count(&tool.calls, 1).await;
    let second = tokio::spawn(async move {
        second_ops
            .invoke(OperationKey::new("one").unwrap(), invocation(1))
            .await
    });
    tokio::task::yield_now().await;
    release.notify_one();
    assert_eq!(
        first.await.unwrap().unwrap(),
        second.await.unwrap().unwrap()
    );
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn early_tool_effect_survives_inference_stream_failure_and_replay() {
    let (provider, sender) = ScriptedProvider::streaming();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let mut turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let plan = StepPlan {
        key: OperationKey::new("step").unwrap(),
        request: request(&provider, &inventory(&tool)),
        inference_grants: grants(),
        tool_grants: tool_grants(),
        tools: inventory(&tool),
    };
    let replay = StepPlan {
        key: plan.key.clone(),
        request: plan.request.clone(),
        inference_grants: grants(),
        tool_grants: tool_grants(),
        tools: inventory(&tool),
    };
    let task = tokio::spawn(async move {
        let outcome = turn.step(plan).await;
        (turn, outcome)
    });
    sender
        .send(ProviderEvent::Update(InferenceUpdate::ToolCall(ToolCall {
            id: ToolCallId::new("call").unwrap(),
            tool: ToolId::new("counter").unwrap(),
            arguments: ToolArguments::Json(serde_json::json!({"value":1})),
        })))
        .unwrap();
    wait_for_count(&tool.calls, 1).await;
    drop(sender);
    let (mut turn, result) = task.await.unwrap();
    let outcome = result.unwrap();
    assert_eq!(outcome.inference.status, InferenceStatus::Interrupted);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    assert_eq!(outcome.tools.len(), 1);
    assert_eq!(
        turn.view()
            .state
            .operations()
            .values()
            .filter(|op| op.record.origin.is_some())
            .count(),
        1
    );
    assert_eq!(turn.step(replay).await.unwrap(), outcome);
    assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    let messages: Vec<_> = outcome
        .history
        .into_iter()
        .map(|record| {
            let HistoryRecord::Message(message) = record;
            message
        })
        .collect();
    agent_kit_core::history::validate_exchanges(&messages, false).unwrap();
}

#[tokio::test]
async fn coalesced_pause_interrupts_older_inference_but_not_work_started_after_resume() {
    let (provider, _sender) = ScriptedProvider::streaming();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let operations = turn.operations();
    let inference = {
        let operations = operations.clone();
        let request = request(&provider, &inventory(&tool));
        tokio::spawn(async move {
            operations
                .infer(OperationKey::new("older").unwrap(), request, grants())
                .await
        })
    };
    wait_for_count(&provider.starts, 1).await;
    // The in-memory journal applies both controls before this task yields to
    // the monitor, which can then only read the latest, resumed snapshot.
    ephemeral
        .control
        .change(
            ChangeId::new("pause").unwrap(),
            ControlRevision(0),
            ControlDirective::Pause,
        )
        .await
        .unwrap();
    ephemeral
        .control
        .change(
            ChangeId::new("resume").unwrap(),
            ControlRevision(1),
            ControlDirective::Resume,
        )
        .await
        .unwrap();
    assert!(matches!(
        operations
            .invoke(OperationKey::new("newer").unwrap(), invocation(1))
            .await
            .unwrap(),
        InvokeOutcome::Complete(ToolOutcome {
            status: OutcomeStatus::Succeeded,
            ..
        })
    ));
    let outcome = tokio::time::timeout(Duration::from_secs(1), inference)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(outcome.status, InferenceStatus::Interrupted);
    let failure = outcome.failure.unwrap();
    assert_eq!(
        failure.kind,
        agent_kit_core::inference::FailureKind::Cancelled
    );
    assert_eq!(failure.code, "turn_paused");
    assert!(!turn.view().state.controls().paused);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[derive(Default)]
struct AskForSecondCall(AtomicUsize);
impl ToolGate for AskForSecondCall {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        self.0.fetch_add(1, Ordering::SeqCst);
        if matches!(admission.invocation.arguments(), ToolArguments::Json(value) if value["value"] == 2)
        {
            Ask.decide(admission, context)
        } else {
            Box::pin(async { Ok(ToolDecision::Permit) })
        }
    }
}

#[tokio::test]
async fn stopped_step_projects_only_recorded_pairs_without_dispatch_or_gate_work() {
    let (provider, sender) = ScriptedProvider::streaming();
    let tool = CounterTool::new(None);
    let authority = Authority::allowed();
    let gate = Arc::new(AskForSecondCall::default());
    let runtime = runtime(provider.clone(), &tool, gate.clone(), authority.clone());
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let mut turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let call = |id, value| ToolCall {
        id: ToolCallId::new(id).unwrap(),
        tool: tool.definition.id.clone(),
        arguments: invocation(value).arguments,
    };
    let completed = call("completed", 1);
    sender
        .send(ProviderEvent::Finished(inference_outcome(vec![
            Content::Text("Work in progress".into()),
            Content::ToolCall(completed.clone()),
            Content::ToolCall(call("deferred", 2)),
        ])))
        .unwrap();
    let key = OperationKey::new("step").unwrap();
    let outcome = turn
        .step(StepPlan {
            key: key.clone(),
            request: request(&provider, &inventory(&tool)),
            inference_grants: grants(),
            tool_grants: tool_grants(),
            tools: inventory(&tool),
        })
        .await
        .unwrap();
    assert!(outcome.history.is_empty());
    assert!(
        outcome
            .tools
            .iter()
            .any(|tool| matches!(tool.outcome, InvokeOutcome::Deferred(_)))
    );
    let revision = turn.view().state.controls().revision;
    ephemeral
        .control
        .change(
            ChangeId::new("stop").unwrap(),
            revision,
            ControlDirective::Cancel,
        )
        .await
        .unwrap();
    let requests = authority.requests.lock().unwrap().len();
    let history = turn.recorded_step_history(&key).await.unwrap().unwrap();
    let messages: Vec<_> = history
        .into_iter()
        .map(|HistoryRecord::Message(message)| message)
        .collect();
    agent_kit_core::history::validate_exchanges(&messages, false).unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(
        messages[0].content,
        vec![
            Content::Text("Work in progress".into()),
            Content::ToolCall(completed.clone())
        ]
    );
    assert!(
        matches!(&messages[1].content[..], [Content::ToolResult(result)] if result.call == completed.id && result.status == OutcomeStatus::Succeeded)
    );
    assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    assert_eq!(gate.0.load(Ordering::SeqCst), 2);
    assert_eq!(authority.requests.lock().unwrap().len(), requests);
    assert_eq!(turn.view().state.history().position(), HistoryPosition(0));
}

#[tokio::test]
async fn observer_drop_does_not_stop_work_but_controller_drop_closes_handles() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(provider, &tool, Arc::new(Allow), Authority::allowed());
    let opened = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap();
    drop(opened.observer);
    let operations = opened.turn.operations();
    operations
        .invoke(OperationKey::new("before").unwrap(), invocation(1))
        .await
        .unwrap();
    drop(opened.turn);
    assert_eq!(
        operations
            .invoke(OperationKey::new("after").unwrap(), invocation(1))
            .await
            .unwrap_err()
            .kind,
        ErrorKind::InvalidState
    );
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn deferred_gate_keeps_question_and_runs_independent_inference() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(provider.clone(), &tool, Arc::new(Ask), Authority::allowed());
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let mut turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let operations = turn.operations();
    let key = OperationKey::new("needs-answer").unwrap();
    assert!(matches!(
        operations.invoke(key.clone(), invocation(1)).await.unwrap(),
        InvokeOutcome::Deferred(_)
    ));
    let mut changed = invocation(1);
    changed.grants.authority.binding = BindingId::new("renewed").unwrap();
    assert_eq!(
        operations
            .invoke(key.clone(), changed)
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Conflict
    );
    operations
        .infer(
            OperationKey::new("independent").unwrap(),
            request(&provider, &inventory(&tool)),
            grants(),
        )
        .await
        .unwrap();
    assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
    let revision = turn.view().state.controls().revision;
    ephemeral
        .control
        .resolve(
            ChangeId::new("answer").unwrap(),
            revision,
            question().id,
            envelope("yes"),
        )
        .await
        .unwrap();
    assert!(matches!(
        operations.invoke(key, invocation(1)).await.unwrap(),
        InvokeOutcome::Complete(_)
    ));
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    let view = turn.view();
    assert!(matches!(
        turn.try_finish(CompletionDraft {
            expected_control: view.state.controls().revision,
            expected_history: view.state.history().position(),
            outcome: TurnOutcome {
                status: OutcomeStatus::Succeeded,
                account: None,
                evidence: vec![]
            }
        })
        .await
        .unwrap(),
        FinishOutcome::Settled(_)
    ));
}

#[tokio::test]
async fn paused_wait_returns_pending_and_suspends_with_question_intact() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(provider, &tool, Arc::new(Allow), Authority::allowed());
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let mut turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let operations = turn.operations();
    operations.request_input(question()).await.unwrap();
    let revision = turn.view().state.controls().revision;
    ephemeral
        .control
        .change(
            ChangeId::new("pause").unwrap(),
            revision,
            ControlDirective::Pause,
        )
        .await
        .unwrap();
    assert_eq!(
        operations.wait(question()).await.unwrap(),
        WaitOutcome::Pending(question().id)
    );
    let view = turn.view();
    let receipt = turn
        .try_suspend(SuspensionDraft {
            expected_control: view.state.controls().revision,
            expected_history: view.state.history().position(),
            checkpoint: Some(envelope("pending")),
        })
        .await
        .unwrap();
    assert!(matches!(receipt, SuspendOutcome::Suspended(_)));
    assert!(
        turn.view()
            .state
            .waits()
            .get(&question().id)
            .unwrap()
            .is_pending()
    );
}

#[tokio::test]
async fn abandoned_tool_is_never_reexecuted_without_explicit_recovery() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(Some(Arc::new(Notify::new())));
    let runtime = runtime(provider, &tool, Arc::new(Allow), Authority::allowed());
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    let execution = operations.clone();
    let task = tokio::spawn(async move {
        execution
            .invoke(OperationKey::new("effect").unwrap(), invocation(1))
            .await
    });
    wait_for_count(&tool.calls, 1).await;
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert_eq!(
        operations
            .invoke(OperationKey::new("effect").unwrap(), invocation(1))
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Uncertain
    );
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    let recovered = operations
        .recover_tool(OperationKey::new("effect").unwrap())
        .await
        .unwrap();
    assert_eq!(recovered.status, OutcomeStatus::Succeeded);
    assert_eq!(tool.recoveries.load(Ordering::SeqCst), 1);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    let attempts = tool.attempts.lock().unwrap().clone();
    assert_eq!(attempts.len(), 2);
    assert_eq!(attempts[0], attempts[1]);
    assert_eq!(
        operations
            .invoke(OperationKey::new("effect").unwrap(), invocation(1))
            .await
            .unwrap(),
        InvokeOutcome::Complete(recovered)
    );
}

struct FaultJournal {
    lease: Arc<TurnLease>,
    commits: AtomicUsize,
    fault_at: usize,
    unresolved: bool,
    failed: AtomicBool,
    race_control: Option<(RacePoint, Arc<EphemeralControl>)>,
    raced: AtomicBool,
}

#[derive(Clone, Copy)]
enum RacePoint {
    Boundary,
    Start,
}

impl TurnJournal for FaultJournal {
    fn binding(&self) -> &TurnBinding {
        self.lease.binding()
    }
    fn load(&self) -> BoxFuture<'_, Result<TurnState>> {
        self.lease.journal().load()
    }
    fn commit(&self, change: JournalChange) -> BoxFuture<'_, Result<CommitReceipt>> {
        Box::pin(async move {
            let count = self.commits.fetch_add(1, Ordering::SeqCst) + 1;
            if let Some((point, control)) = &self.race_control
                && change.actions().iter().any(|action| match point {
                    RacePoint::Boundary => {
                        matches!(action, JournalAction::Settle(_) | JournalAction::Suspend)
                    }
                    RacePoint::Start => matches!(action, JournalAction::StartAttempt { .. }),
                })
                && !self.raced.swap(true, Ordering::SeqCst)
            {
                let state = self.lease.journal().load().await?;
                control
                    .change(
                        ChangeId::new("race-pause").unwrap(),
                        state.controls().revision,
                        ControlDirective::Pause,
                    )
                    .await?;
                if matches!(point, RacePoint::Start) {
                    let state = self.lease.journal().load().await?;
                    control
                        .change(
                            ChangeId::new("race-resume").unwrap(),
                            state.controls().revision,
                            ControlDirective::Resume,
                        )
                        .await?;
                }
            }
            if count == self.fault_at && self.unresolved {
                self.failed.store(true, Ordering::SeqCst);
                return Err(Error::new(ErrorKind::Uncertain, "lost_ack"));
            }
            let receipt = self.lease.journal().commit(change).await?;
            if count == self.fault_at {
                return Err(Error::new(ErrorKind::Uncertain, "lost_ack"));
            }
            Ok(receipt)
        })
    }
    fn lookup(&self, id: ChangeId) -> BoxFuture<'_, Result<Option<CommitReceipt>>> {
        Box::pin(async move {
            if self.failed.load(Ordering::SeqCst) {
                return Err(Error::new(ErrorKind::Unavailable, "readback_unavailable"));
            }
            self.lease.journal().lookup(id).await
        })
    }
}

impl ControlReader for FaultJournal {
    fn binding(&self) -> &TurnBinding {
        self.lease.binding()
    }
    fn read(&self) -> BoxFuture<'_, Result<ControlSnapshot>> {
        self.lease.controls().read()
    }
    fn changed(&self, after: ControlRevision) -> BoxFuture<'_, Result<ControlSnapshot>> {
        self.lease.controls().changed(after)
    }
}

fn fault_lease(
    fault_at: usize,
    unresolved: bool,
    race: Option<RacePoint>,
) -> (TurnLease, Arc<EphemeralControl>) {
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let control = Arc::new(ephemeral.control);
    let fault = Arc::new(FaultJournal {
        lease: Arc::new(ephemeral.lease),
        commits: AtomicUsize::new(0),
        fault_at,
        unresolved,
        failed: AtomicBool::new(false),
        race_control: race.map(|point| (point, control.clone())),
        raced: AtomicBool::new(false),
    });
    struct Journal(Arc<FaultJournal>);
    impl TurnJournal for Journal {
        fn binding(&self) -> &TurnBinding {
            TurnJournal::binding(self.0.as_ref())
        }
        fn load(&self) -> BoxFuture<'_, Result<TurnState>> {
            TurnJournal::load(self.0.as_ref())
        }
        fn commit(&self, change: JournalChange) -> BoxFuture<'_, Result<CommitReceipt>> {
            TurnJournal::commit(self.0.as_ref(), change)
        }
        fn lookup(&self, id: ChangeId) -> BoxFuture<'_, Result<Option<CommitReceipt>>> {
            TurnJournal::lookup(self.0.as_ref(), id)
        }
    }
    (
        bind_lease(binding(), Box::new(Journal(fault.clone())), fault).unwrap(),
        control,
    )
}

#[tokio::test]
async fn start_attempt_does_not_rebase_across_a_coalesced_pause_and_resume() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let (lease, _) = fault_lease(0, false, Some(RacePoint::Start));
    let turn = runtime.open(lease).await.unwrap().turn;
    let operations = turn.operations();
    let key = OperationKey::new("older").unwrap();
    let outcome = operations
        .infer(key.clone(), request(&provider, &inventory(&tool)), grants())
        .await
        .unwrap();
    assert_eq!(outcome.status, InferenceStatus::Failed);
    assert_eq!(outcome.failure.unwrap().code, "turn_paused");
    let view = turn.view();
    assert!(
        view.state.operations()[&operations.operation_id(&key).unwrap()]
            .attempts
            .is_empty()
    );
    assert!(view.state.controls().admits_work());
    assert_eq!(provider.starts.load(Ordering::SeqCst), 0);

    let fresh = operations
        .infer(
            OperationKey::new("newer").unwrap(),
            request(&provider, &inventory(&tool)),
            grants(),
        )
        .await
        .unwrap();
    assert_eq!(fresh.status, InferenceStatus::Completed);
    assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn lost_outcome_ack_is_read_back_without_repeating_the_tool() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(provider, &tool, Arc::new(Allow), Authority::allowed());
    let (lease, _) = fault_lease(3, false, None);
    let turn = runtime.open(lease).await.unwrap().turn;
    let operations = turn.operations();
    let result = operations
        .invoke(OperationKey::new("effect").unwrap(), invocation(1))
        .await
        .unwrap();
    assert_eq!(
        operations
            .invoke(OperationKey::new("effect").unwrap(), invocation(1))
            .await
            .unwrap(),
        result
    );
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn unknown_prepare_commit_freezes_admission_before_any_effect() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(provider, &tool, Arc::new(Allow), Authority::allowed());
    let (lease, _) = fault_lease(1, true, None);
    let turn = runtime.open(lease).await.unwrap().turn;
    let operations = turn.operations();
    assert_eq!(
        operations
            .invoke(OperationKey::new("effect").unwrap(), invocation(1))
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Uncertain
    );
    assert!(turn.view().admission_closed);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
    assert!(
        operations
            .invoke(OperationKey::new("other").unwrap(), invocation(2))
            .await
            .is_err()
    );
}

struct ActivateGrant {
    authority: Arc<Authority>,
}

impl ToolGate for ActivateGrant {
    fn decide(&self, _: ToolAdmission, _: AdmissionContext) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async {
            self.authority.allowed.store(true, Ordering::SeqCst);
            Ok(ToolDecision::Permit)
        })
    }
}

#[tokio::test]
async fn gate_activates_captured_grant_before_dispatch_validation() {
    let authority = Authority::allowed();
    authority.allowed.store(false, Ordering::SeqCst);
    let tool = CounterTool::new(None);
    let runtime = runtime(
        ScriptedProvider::complete(),
        &tool,
        Arc::new(ActivateGrant {
            authority: authority.clone(),
        }),
        authority.clone(),
    );
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    let key = OperationKey::new("approved").unwrap();
    operations.invoke(key.clone(), invocation(1)).await.unwrap();
    let view = turn.view();
    let id = operations.operation_id(&key).unwrap();
    let operation = view.state.operations().get(&id).unwrap();
    let requests = authority.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].action, operation.record.input.fingerprint());
    assert_eq!(requests[0].selection, operation.record.grants);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

struct PauseGate {
    control: Arc<EphemeralControl>,
}

impl ToolGate for PauseGate {
    fn decide(
        &self,
        _: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            self.control
                .change(
                    ChangeId::new("pause-in-gate").unwrap(),
                    context.operations.view().state.controls().revision,
                    ControlDirective::Pause,
                )
                .await?;
            Ok(ToolDecision::Permit)
        })
    }
}

#[tokio::test]
async fn pause_between_prepare_and_dispatch_records_definite_nonexecution() {
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        ScriptedProvider::complete(),
        &tool,
        Arc::new(PauseGate {
            control: Arc::new(ephemeral.control),
        }),
        Authority::allowed(),
    );
    let mut turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let result = turn
        .operations()
        .invoke(OperationKey::new("paused").unwrap(), invocation(1))
        .await
        .unwrap();
    assert!(matches!(
        result,
        InvokeOutcome::Complete(ToolOutcome {
            status: OutcomeStatus::Failed,
            ..
        })
    ));
    assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
    let view = turn.view();
    assert!(
        view.state
            .operations()
            .values()
            .all(|operation| operation.outcome().is_some())
    );
    assert!(matches!(
        turn.try_suspend(SuspensionDraft {
            expected_control: view.state.controls().revision,
            expected_history: view.state.history().position(),
            checkpoint: None
        })
        .await
        .unwrap(),
        SuspendOutcome::Suspended(_)
    ));
}

#[tokio::test]
async fn dropping_controller_cancels_local_execution_and_retains_uncertainty() {
    let tool = CounterTool::new(Some(Arc::new(Notify::new())));
    let runtime = runtime(
        ScriptedProvider::complete(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    let execution = operations.clone();
    let task = tokio::spawn(async move {
        execution
            .invoke(OperationKey::new("active").unwrap(), invocation(1))
            .await
    });
    wait_for_count(&tool.calls, 1).await;
    drop(turn);
    let outcome = tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(matches!(
        outcome,
        InvokeOutcome::Complete(ToolOutcome {
            status: OutcomeStatus::Uncertain,
            ..
        })
    ));
    assert!(
        operations
            .view()
            .state
            .operations()
            .values()
            .all(|operation| operation.is_uncertain())
    );
}

#[tokio::test]
async fn rejected_finish_preserves_a_usable_controller() {
    let tool = CounterTool::new(None);
    let runtime = runtime(
        ScriptedProvider::complete(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let mut turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let result = turn
        .try_finish(CompletionDraft {
            expected_control: ControlRevision(99),
            expected_history: HistoryPosition(0),
            outcome: TurnOutcome {
                status: OutcomeStatus::Succeeded,
                account: None,
                evidence: vec![],
            },
        })
        .await
        .unwrap();
    assert!(matches!(result, FinishOutcome::Continue(_)));
    turn.operations()
        .invoke(OperationKey::new("still-usable").unwrap(), invocation(1))
        .await
        .unwrap();
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn terminal_commits_do_not_rebase_after_a_racing_control_change() {
    for suspend in [false, true] {
        let tool = CounterTool::new(None);
        let runtime = runtime(
            ScriptedProvider::complete(),
            &tool,
            Arc::new(Allow),
            Authority::allowed(),
        );
        let (lease, control) = fault_lease(0, false, Some(RacePoint::Boundary));
        let mut turn = runtime.open(lease).await.unwrap().turn;
        if suspend {
            assert!(matches!(
                turn.try_suspend(SuspensionDraft {
                    expected_control: ControlRevision(0),
                    expected_history: HistoryPosition(0),
                    checkpoint: None
                })
                .await
                .unwrap(),
                SuspendOutcome::Continue(_)
            ));
        } else {
            assert!(matches!(
                turn.try_finish(CompletionDraft {
                    expected_control: ControlRevision(0),
                    expected_history: HistoryPosition(0),
                    outcome: TurnOutcome {
                        status: OutcomeStatus::Succeeded,
                        account: None,
                        evidence: vec![]
                    }
                })
                .await
                .unwrap(),
                FinishOutcome::Continue(_)
            ));
        }
        let view = turn.view();
        assert!(view.state.outcome().is_none());
        assert!(!view.state.is_suspended());
        assert!(view.state.controls().paused);
        control
            .change(
                ChangeId::new("resume-after-race").unwrap(),
                view.state.controls().revision,
                ControlDirective::Resume,
            )
            .await
            .unwrap();
        turn.operations()
            .invoke(OperationKey::new("still-open").unwrap(), invocation(1))
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn completed_step_replays_after_its_tool_inventory_is_removed() {
    let provider = Arc::new(ScriptedProvider {
        starts: AtomicUsize::new(0),
        attempts: Mutex::new(vec![]),
        receiver: Mutex::new(None),
        events: vec![ProviderEvent::Finished(inference_outcome(vec![
            Content::ToolCall(ToolCall {
                id: ToolCallId::new("call").unwrap(),
                tool: ToolId::new("counter").unwrap(),
                arguments: ToolArguments::Json(serde_json::json!({})),
            }),
        ]))],
    });
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let mut turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let input = request(&provider, &inventory(&tool));
    let first = turn
        .step(StepPlan {
            key: OperationKey::new("step").unwrap(),
            request: input.clone(),
            inference_grants: grants(),
            tool_grants: tool_grants(),
            tools: inventory(&tool),
        })
        .await
        .unwrap();
    let empty = Inventory::new().snapshot(&[]).unwrap();
    let repeated = turn
        .step(StepPlan {
            key: OperationKey::new("step").unwrap(),
            request: input,
            inference_grants: grants(),
            tool_grants: tool_grants(),
            tools: empty,
        })
        .await
        .unwrap();
    assert_eq!(first, repeated);
    assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn paused_turn_rejects_external_recovery() {
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let tool = CounterTool::new(Some(Arc::new(Notify::new())));
    let runtime = runtime(
        ScriptedProvider::complete(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let operations = turn.operations();
    let execution = operations.clone();
    let task = tokio::spawn(async move {
        execution
            .invoke(OperationKey::new("effect").unwrap(), invocation(1))
            .await
    });
    wait_for_count(&tool.calls, 1).await;
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    ephemeral
        .control
        .change(
            ChangeId::new("pause").unwrap(),
            turn.view().state.controls().revision,
            ControlDirective::Pause,
        )
        .await
        .unwrap();
    assert_eq!(
        operations
            .recover_tool(OperationKey::new("effect").unwrap())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::InvalidState
    );
    assert_eq!(tool.recoveries.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn orphan_inference_retains_early_tool_call_identity_without_reexecution() {
    let (provider, sender) = ScriptedProvider::streaming();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let mut turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    let key = OperationKey::new("orphan").unwrap();
    let input = request(&provider, &inventory(&tool));
    let mut run = Box::pin(turn.step(StepPlan {
        key: key.clone(),
        request: input.clone(),
        inference_grants: grants(),
        tool_grants: tool_grants(),
        tools: inventory(&tool),
    }));
    sender
        .send(ProviderEvent::Update(InferenceUpdate::ToolCall(ToolCall {
            id: ToolCallId::new("original-provider-call").unwrap(),
            tool: ToolId::new("counter").unwrap(),
            arguments: ToolArguments::Json(serde_json::json!({})),
        })))
        .unwrap();
    tokio::select! {
        result = &mut run => panic!("inference ended prematurely: {result:?}"),
        _ = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if operations.view().state.operations().values().any(|operation| operation.record.origin.is_some() && operation.outcome().is_some()) { break; }
                tokio::task::yield_now().await;
            }
        }) => {}
    }
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    drop(run);
    let id = operations.operation_id(&key).unwrap();
    let outcome = operations.record_interruption(id.clone()).await.unwrap();
    assert!(outcome.is_uncertain());
    let replay = turn
        .step(StepPlan {
            key,
            request: input,
            inference_grants: grants(),
            tool_grants: tool_grants(),
            tools: inventory(&tool),
        })
        .await
        .unwrap();
    assert_eq!(replay.tools.len(), 1);
    assert_eq!(replay.tools[0].call.id.as_str(), "original-provider-call");
    assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    let view = turn.view();
    assert!(matches!(
        turn.try_finish(CompletionDraft {
            expected_control: view.state.controls().revision,
            expected_history: view.state.history().position(),
            outcome: TurnOutcome {
                status: OutcomeStatus::Cancelled,
                account: None,
                evidence: vec![id]
            }
        })
        .await
        .unwrap(),
        FinishOutcome::Settled(_)
    ));
}

#[tokio::test]
async fn independent_tools_share_bounded_execution_capacity() {
    let release = Arc::new(Notify::new());
    let tool = CounterTool::new(Some(release.clone()));
    let runtime = runtime(
        ScriptedProvider::complete(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let first = turn.operations();
    let second = turn.operations();
    let first = tokio::spawn(async move {
        first
            .invoke(OperationKey::new("first").unwrap(), invocation(1))
            .await
    });
    wait_for_count(&tool.calls, 1).await;
    let second = tokio::spawn(async move {
        second
            .invoke(OperationKey::new("second").unwrap(), invocation(2))
            .await
    });
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
    release.notify_one();
    wait_for_count(&tool.calls, 2).await;
    release.notify_one();
    first.await.unwrap().unwrap();
    second.await.unwrap().unwrap();
}

#[tokio::test]
async fn operation_and_interaction_limits_apply_before_new_records() {
    let tool = CounterTool::new(None);
    let runtime = Runtime::new(ExecutionServices {
        providers: BTreeMap::new(),
        tools: inventory(&tool),
        authority: Authority::allowed(),
        gate: Arc::new(Allow),
        limits: ExecutionLimits {
            max_operations: 1,
            max_concurrent_inferences: 1,
            max_concurrent_tools: 1,
            max_output_bytes: 1024,
            operation_timeout: Duration::from_secs(1),
            observer_capacity: 1,
        },
    })
    .unwrap();
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    operations
        .invoke(OperationKey::new("one").unwrap(), invocation(1))
        .await
        .unwrap();
    assert_eq!(
        operations
            .invoke(OperationKey::new("two").unwrap(), invocation(2))
            .await
            .unwrap_err()
            .kind,
        ErrorKind::LimitExceeded
    );
    operations.request_input(question()).await.unwrap();
    let mut second = question();
    second.id = WaitId::new("second").unwrap();
    assert_eq!(
        operations.request_input(second).await.unwrap_err().kind,
        ErrorKind::LimitExceeded
    );
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

struct BlockingRecovery(Arc<CounterTool>);
impl Tool for BlockingRecovery {
    fn definition(&self) -> &ToolDefinition {
        self.0.definition()
    }
    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        self.0.validate(arguments)
    }
    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        self.0.invoke(invocation, context)
    }
    fn recover(&self, _: InvocationRecovery, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async {
            self.0.recoveries.fetch_add(1, Ordering::SeqCst);
            std::future::pending().await
        })
    }
}

#[tokio::test]
async fn recovery_deadline_preserves_uncertainty_and_releases_capacity() {
    let tool = CounterTool::new(Some(Arc::new(Notify::new())));
    let mut tools = Inventory::new();
    tools
        .insert(Arc::new(BlockingRecovery(tool.clone())))
        .unwrap();
    let runtime = Runtime::new(ExecutionServices {
        providers: BTreeMap::new(),
        tools: tools
            .snapshot(std::slice::from_ref(&tool.definition.id))
            .unwrap(),
        authority: Authority::allowed(),
        gate: Arc::new(Allow),
        limits: ExecutionLimits {
            max_operations: 4,
            max_concurrent_inferences: 1,
            max_concurrent_tools: 1,
            max_output_bytes: 1024,
            operation_timeout: Duration::from_millis(20),
            observer_capacity: 4,
        },
    })
    .unwrap();
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    operations
        .invoke(OperationKey::new("one").unwrap(), invocation(1))
        .await
        .unwrap();
    let recovered = tokio::time::timeout(
        Duration::from_secs(1),
        operations.recover_tool(OperationKey::new("one").unwrap()),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(recovered.status, OutcomeStatus::Uncertain);
    assert_eq!(tool.recoveries.load(Ordering::SeqCst), 1);
    let second = tokio::time::timeout(
        Duration::from_secs(1),
        operations.invoke(OperationKey::new("two").unwrap(), invocation(2)),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(matches!(
        second,
        InvokeOutcome::Complete(ToolOutcome {
            status: OutcomeStatus::Uncertain,
            ..
        })
    ));
    assert_eq!(tool.calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn master_can_order_captured_tool_declarations() {
    let provider = ScriptedProvider::complete();
    let first = CounterTool::new(None);
    let mut second = CounterTool::new(None);
    Arc::get_mut(&mut second).unwrap().definition.id = ToolId::new("another").unwrap();
    let mut tools = Inventory::new();
    tools.insert(first.clone()).unwrap();
    tools.insert(second).unwrap();
    let captured = tools
        .snapshot(&[
            ToolId::new("another").unwrap(),
            ToolId::new("counter").unwrap(),
        ])
        .unwrap();
    let mut offered = captured.offers().unwrap();
    offered.reverse();
    let request = provider
        .prepare(InferenceRequest {
            model: ModelId::new("test-model").unwrap(),
            messages: vec![],
            tools: offered,
            max_output_tokens: Some(256),
            extension: None,
        })
        .unwrap();
    let runtime = runtime(provider, &first, Arc::new(Allow), Authority::allowed());
    let mut turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    turn.step(StepPlan {
        key: OperationKey::new("ordered").unwrap(),
        request,
        inference_grants: grants(),
        tool_grants: tool_grants(),
        tools: captured,
    })
    .await
    .unwrap();
}

fn tool_provider() -> Arc<ScriptedProvider> {
    Arc::new(ScriptedProvider {
        starts: AtomicUsize::new(0),
        attempts: Mutex::new(vec![]),
        receiver: Mutex::new(None),
        events: vec![ProviderEvent::Finished(inference_outcome(vec![
            Content::ToolCall(ToolCall {
                id: ToolCallId::new("call").unwrap(),
                tool: ToolId::new("counter").unwrap(),
                arguments: ToolArguments::Json(serde_json::json!({})),
            }),
        ]))],
    })
}

#[tokio::test]
async fn step_keeps_provider_and_tool_authorities_independent() {
    let provider = tool_provider();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let mut turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let mut local = grants();
    local.authority.principal = PrincipalId::new("local-files").unwrap();
    local.authority.scope = ScopeId::new("file-scope").unwrap();
    turn.step(StepPlan {
        key: OperationKey::new("split-authority").unwrap(),
        request: request(&provider, &inventory(&tool)),
        inference_grants: grants(),
        tool_grants: BTreeMap::from([(tool.definition.id.clone(), local.clone())]),
        tools: inventory(&tool),
    })
    .await
    .unwrap();
    let view = turn.view();
    let tool_record = view
        .state
        .operations()
        .values()
        .find(|operation| operation.record.origin.is_some())
        .unwrap();
    assert_eq!(tool_record.record.grants, local);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn missing_tool_authority_never_uses_provider_grants() {
    let provider = tool_provider();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let mut turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let result = turn
        .step(StepPlan {
            key: OperationKey::new("missing-tool-authority").unwrap(),
            request: request(&provider, &inventory(&tool)),
            inference_grants: grants(),
            tool_grants: BTreeMap::new(),
            tools: inventory(&tool),
        })
        .await;
    assert_eq!(result.unwrap_err().code, "tool_authority_missing");
    assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
    assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
}

struct ReceiptTool {
    definition: ToolDefinition,
    recoveries: AtomicUsize,
}
impl Tool for ReceiptTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    fn validate(&self, _: &ToolArguments) -> Result<()> {
        Ok(())
    }
    fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async {
            let mut outcome = ToolOutcome::uncertain();
            outcome.receipt = Some(envelope("remote-job"));
            outcome.content = vec![agent_kit_core::messages::ResultContent::Text(
                "x".repeat(128),
            )];
            outcome
        })
    }
    fn recover(
        &self,
        recovery: InvocationRecovery,
        _: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            assert!(recovery.receipts.contains(&envelope("remote-job")));
            if self.recoveries.fetch_add(1, Ordering::SeqCst) == 0 {
                ToolOutcome::uncertain()
            } else {
                success()
            }
        })
    }
}

#[tokio::test]
async fn truncation_and_repeated_recovery_preserve_prior_receipts() {
    let mut definition = CounterTool::new(None).definition.clone();
    definition.max_output_bytes = 16;
    let tool = Arc::new(ReceiptTool {
        definition,
        recoveries: AtomicUsize::new(0),
    });
    let mut inventory = Inventory::new();
    inventory.insert(tool.clone()).unwrap();
    let runtime = Runtime::new(ExecutionServices {
        providers: BTreeMap::new(),
        tools: inventory
            .snapshot(std::slice::from_ref(&tool.definition.id))
            .unwrap(),
        authority: Authority::allowed(),
        gate: Arc::new(Allow),
        limits: ExecutionLimits {
            max_operations: 4,
            max_concurrent_inferences: 1,
            max_concurrent_tools: 1,
            max_output_bytes: 16,
            operation_timeout: Duration::from_secs(1),
            observer_capacity: 4,
        },
    })
    .unwrap();
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    let key = OperationKey::new("receipt").unwrap();
    let InvokeOutcome::Complete(first) =
        operations.invoke(key.clone(), invocation(1)).await.unwrap()
    else {
        panic!("unexpected wait")
    };
    assert!(first.truncated);
    assert_eq!(first.receipt, Some(envelope("remote-job")));
    assert_eq!(
        operations.recover_tool(key.clone()).await.unwrap().status,
        OutcomeStatus::Uncertain
    );
    assert_eq!(
        operations.recover_tool(key).await.unwrap().status,
        OutcomeStatus::Succeeded
    );
    assert_eq!(tool.recoveries.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn stopped_deferred_work_can_be_withdrawn_and_settled_without_execution() {
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        ScriptedProvider::complete(),
        &tool,
        Arc::new(Ask),
        Authority::allowed(),
    );
    let mut turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let operations = turn.operations();
    let key = OperationKey::new("deferred").unwrap();
    assert!(matches!(
        operations.invoke(key.clone(), invocation(1)).await.unwrap(),
        InvokeOutcome::Deferred(_)
    ));
    ephemeral
        .control
        .change(
            ChangeId::new("stop").unwrap(),
            turn.view().state.controls().revision,
            ControlDirective::Cancel,
        )
        .await
        .unwrap();
    operations
        .cancel_prepared(operations.operation_id(&key).unwrap())
        .await
        .unwrap();
    operations.withdraw_input(question().id).await.unwrap();
    let view = turn.view();
    assert!(matches!(
        turn.try_finish(CompletionDraft {
            expected_control: view.state.controls().revision,
            expected_history: view.state.history().position(),
            outcome: TurnOutcome {
                status: OutcomeStatus::Cancelled,
                account: None,
                evidence: vec![]
            }
        })
        .await
        .unwrap(),
        FinishOutcome::Settled(_)
    ));
    assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn completed_step_replays_with_replaced_execution_grants() {
    let provider = tool_provider();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let mut turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let input = request(&provider, &inventory(&tool));
    let first = turn
        .step(StepPlan {
            key: OperationKey::new("step").unwrap(),
            request: input.clone(),
            inference_grants: grants(),
            tool_grants: tool_grants(),
            tools: inventory(&tool),
        })
        .await
        .unwrap();
    let mut replacement = grants();
    replacement.authority.principal = PrincipalId::new("replacement").unwrap();
    replacement.grants = vec![GrantId::new("replacement").unwrap()];
    let replay = turn
        .step(StepPlan {
            key: OperationKey::new("step").unwrap(),
            request: input,
            inference_grants: replacement.clone(),
            tool_grants: BTreeMap::from([(tool.definition.id.clone(), replacement)]),
            tools: inventory(&tool),
        })
        .await
        .unwrap();
    assert_eq!(first, replay);
    assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn deferred_step_reuses_recorded_grants_only_with_current_compatible_selection() {
    for allowed in [true, false] {
        let provider = tool_provider();
        let tool = CounterTool::new(None);
        let authority = Authority::allowed();
        let runtime = runtime(provider.clone(), &tool, Arc::new(Ask), authority.clone());
        let ephemeral = EphemeralJournal::create(binding()).unwrap();
        let mut turn = runtime.open(ephemeral.lease).await.unwrap().turn;
        let input = request(&provider, &inventory(&tool));
        let plan = |tool_grants| StepPlan {
            key: OperationKey::new("step").unwrap(),
            request: input.clone(),
            inference_grants: grants(),
            tool_grants,
            tools: inventory(&tool),
        };
        let first = turn.step(plan(tool_grants())).await.unwrap();
        assert!(matches!(first.tools[0].outcome, InvokeOutcome::Deferred(_)));
        let view = turn.view();
        let recorded = view
            .state
            .operations()
            .values()
            .find(|operation| operation.record.source_call.is_some())
            .unwrap();
        assert!(recorded.attempts.is_empty());
        ephemeral
            .control
            .resolve(
                ChangeId::new("answer").unwrap(),
                view.state.controls().revision,
                question().id,
                envelope("yes"),
            )
            .await
            .unwrap();

        let mut fresh = grants();
        fresh.authority.binding = BindingId::new("fresh-host").unwrap();
        fresh.grants = vec![GrantId::new("fresh-grant").unwrap()];
        let selection = |grants| BTreeMap::from([(tool.definition.id.clone(), grants)]);
        let mut other_scope = fresh.clone();
        other_scope.authority.scope = ScopeId::new("other-workspace").unwrap();
        let mut other_principal = fresh.clone();
        other_principal.authority.principal = PrincipalId::new("other-user").unwrap();
        for (grants, expected) in [
            (BTreeMap::new(), ErrorKind::Unavailable),
            (selection(other_scope), ErrorKind::Conflict),
            (selection(other_principal), ErrorKind::Conflict),
        ] {
            assert_eq!(turn.step(plan(grants)).await.unwrap_err().kind, expected);
        }
        assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
        assert!(
            authority
                .requests
                .lock()
                .unwrap()
                .iter()
                .all(|request| request.operation != recorded.record.id)
        );

        authority.allowed.store(allowed, Ordering::SeqCst);
        let resumed = turn.step(plan(selection(fresh))).await.unwrap();
        let InvokeOutcome::Complete(outcome) = &resumed.tools[0].outcome else {
            panic!("an answered tool must receive a disposition");
        };
        let expected = if allowed {
            OutcomeStatus::Succeeded
        } else {
            OutcomeStatus::Failed
        };
        assert_eq!(outcome.status, expected);
        assert_eq!(tool.calls.load(Ordering::SeqCst), usize::from(allowed));
        assert_eq!(provider.starts.load(Ordering::SeqCst), 1);
        let current = turn.view();
        let operation = current.operation(&recorded.record.id).unwrap();
        assert_eq!(operation.record.grants, recorded.record.grants);
        assert_eq!(operation.attempts.len(), usize::from(allowed));
        assert_eq!(
            authority.requests.lock().unwrap().last(),
            Some(&AuthorityRequest {
                operation: recorded.record.id.clone(),
                action: recorded.record.input.fingerprint(),
                selection: recorded.record.grants.clone(),
            })
        );
    }
}

#[tokio::test]
async fn executors_receive_the_admitted_attempt_identity() {
    let provider = ScriptedProvider::complete();
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let operations = turn.operations();
    let inference_key = OperationKey::new("inference").unwrap();
    let tool_key = OperationKey::new("tool").unwrap();
    operations
        .infer(
            inference_key.clone(),
            request(&provider, &inventory(&tool)),
            grants(),
        )
        .await
        .unwrap();
    operations
        .invoke(tool_key.clone(), invocation(1))
        .await
        .unwrap();
    let view = turn.view();
    let inference_id = operations.operation_id(&inference_key).unwrap();
    let tool_id = operations.operation_id(&tool_key).unwrap();
    assert_eq!(
        provider.attempts.lock().unwrap()[0],
        view.state.operations()[&inference_id].attempts[0].id
    );
    assert_eq!(
        tool.attempts.lock().unwrap()[0],
        view.state.operations()[&tool_id].attempts[0].id
    );
}

struct CountedProvider {
    inner: Arc<ScriptedProvider>,
    measured: Mutex<Vec<(Fingerprint, RequestControl)>>,
    generation_deadline: Mutex<Option<Instant>>,
    entered: Notify,
    release: Option<Notify>,
    result: std::result::Result<InputMeasurement, InferenceFailure>,
}

impl CountedProvider {
    fn new(
        blocked: bool,
        result: std::result::Result<InputMeasurement, InferenceFailure>,
    ) -> Arc<Self> {
        Arc::new(Self {
            inner: ScriptedProvider::complete(),
            measured: Mutex::default(),
            generation_deadline: Mutex::default(),
            entered: Notify::new(),
            release: blocked.then(Notify::new),
            result,
        })
    }

    fn exact(blocked: bool) -> Arc<Self> {
        Self::new(
            blocked,
            Ok(InputMeasurement {
                tokens: 100,
                kind: MeasurementKind::Exact,
            }),
        )
    }

    fn bounded_request(&self, tool: &Arc<CounterTool>) -> PreparedRequest {
        request(&self.inner, &inventory(tool))
            .with_input_limit(NonZeroU64::new(100).unwrap())
            .unwrap()
    }
}

impl Provider for CountedProvider {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities> {
        self.inner.capabilities(model)
    }

    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        self.inner.prepare(request)
    }

    fn measure_input_async<'a>(
        &'a self,
        request: &'a PreparedRequest,
        control: RequestControl,
    ) -> BoxFuture<'a, std::result::Result<InputMeasurement, InferenceFailure>> {
        Box::pin(async move {
            self.measured
                .lock()
                .unwrap()
                .push((request.fingerprint(), control));
            self.entered.notify_one();
            if let Some(release) = &self.release {
                release.notified().await;
            }
            self.result.clone()
        })
    }

    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        *self.generation_deadline.lock().unwrap() = control.deadline;
        self.inner.start(request, control)
    }
}

#[tokio::test]
async fn exact_count_and_generation_share_authority_identity_and_deadline() {
    let provider = CountedProvider::exact(false);
    let tool = CounterTool::new(None);
    let authority = Authority::allowed();
    let runtime = runtime(provider.clone(), &tool, Arc::new(Allow), authority.clone());
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let key = OperationKey::new("bounded").unwrap();
    let prepared = provider.bounded_request(&tool);
    let fingerprint = prepared.fingerprint();
    let outcome = turn
        .operations()
        .infer(key.clone(), prepared.clone(), grants())
        .await
        .unwrap();
    assert_eq!(outcome.status, InferenceStatus::Completed);
    assert!(outcome.usage.is_empty());
    let record = turn.operation(&key).unwrap().unwrap();
    assert_eq!(record.attempts.len(), 1);
    {
        let authorized = authority.requests.lock().unwrap();
        assert_eq!(authorized.len(), 2);
        assert_eq!(authorized[0], authorized[1]);
        assert_eq!(authorized[0].action, fingerprint);
        assert_eq!(authorized[0].operation, record.record.id);
        let counts = provider.measured.lock().unwrap();
        assert_eq!(counts.len(), 1);
        assert_eq!(counts[0].0, fingerprint);
        assert!(counts[0].1.deadline.is_some());
        assert_eq!(
            counts[0].1.deadline,
            *provider.generation_deadline.lock().unwrap()
        );
        assert!(counts[0].1.cancellation.is_cancelled());
    }
    let changed = prepared
        .clone()
        .with_input_limit(NonZeroU64::new(101).unwrap())
        .unwrap();
    assert_eq!(
        turn.operations()
            .infer(key.clone(), changed, grants())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Conflict,
    );
    assert_eq!(
        turn.operations()
            .infer(key, prepared, grants())
            .await
            .unwrap(),
        outcome
    );
    assert_eq!(provider.measured.lock().unwrap().len(), 1);
    assert_eq!(provider.inner.starts.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn a_count_needs_authority_and_cannot_outlive_revocation() {
    let provider = CountedProvider::exact(true);
    let tool = CounterTool::new(None);
    let authority = Authority::allowed();
    let runtime = runtime(provider.clone(), &tool, Arc::new(Allow), authority.clone());
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let prepared = provider.bounded_request(&tool);
    authority.allowed.store(false, Ordering::SeqCst);
    let denied = turn
        .operations()
        .infer(
            OperationKey::new("denied").unwrap(),
            prepared.clone(),
            grants(),
        )
        .await
        .unwrap();
    assert_eq!(denied.failure.unwrap().code, "grant_denied");
    assert!(provider.measured.lock().unwrap().is_empty());

    authority.allowed.store(true, Ordering::SeqCst);
    let key = OperationKey::new("revoked").unwrap();
    let operation = turn.operations();
    let worker = {
        let key = key.clone();
        tokio::spawn(async move { operation.infer(key, prepared, grants()).await.unwrap() })
    };
    tokio::time::timeout(Duration::from_secs(1), provider.entered.notified())
        .await
        .unwrap();
    assert!(turn.operation(&key).unwrap().unwrap().attempts.is_empty());
    authority.allowed.store(false, Ordering::SeqCst);
    provider.release.as_ref().unwrap().notify_one();
    let rejected = tokio::time::timeout(Duration::from_secs(1), worker)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(rejected.failure.unwrap().code, "grant_denied");
    assert_eq!(provider.inner.starts.load(Ordering::SeqCst), 0);
    let record = turn.operation(&key).unwrap().unwrap();
    assert!(record.attempts.is_empty());
    assert!(record.rejection.is_some());
}

#[tokio::test]
async fn pause_and_cancel_interrupt_counting_with_no_generation_attempt() {
    for (directive, code) in [
        (ControlDirective::Pause, "turn_paused"),
        (ControlDirective::Cancel, "turn_cancelled"),
    ] {
        let provider = CountedProvider::exact(true);
        let tool = CounterTool::new(None);
        let runtime = runtime(
            provider.clone(),
            &tool,
            Arc::new(Allow),
            Authority::allowed(),
        );
        let ephemeral = EphemeralJournal::create(binding()).unwrap();
        let turn = runtime.open(ephemeral.lease).await.unwrap().turn;
        let prepared = provider.bounded_request(&tool);
        let key = OperationKey::new("interrupted-count").unwrap();
        let operation = turn.operations();
        let worker = {
            let key = key.clone();
            tokio::spawn(async move { operation.infer(key, prepared, grants()).await.unwrap() })
        };
        tokio::time::timeout(Duration::from_secs(1), provider.entered.notified())
            .await
            .unwrap();
        ephemeral
            .control
            .change(
                ChangeId::new("stop-count").unwrap(),
                turn.view().state.controls().revision,
                directive,
            )
            .await
            .unwrap();
        let rejected = tokio::time::timeout(Duration::from_secs(1), worker)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(rejected.status, InferenceStatus::Failed);
        assert_eq!(
            rejected.failure.unwrap(),
            InferenceFailure {
                kind: FailureKind::Cancelled,
                code: code.into(),
                retry_after_ms: None,
                dispatch: None,
            }
        );
        let record = turn.operation(&key).unwrap().unwrap();
        assert!(record.attempts.is_empty());
        assert!(record.rejection.is_some());
        assert!(
            provider.measured.lock().unwrap()[0]
                .1
                .cancellation
                .is_cancelled()
        );
        assert_eq!(provider.inner.starts.load(Ordering::SeqCst), 0);
    }
}

#[tokio::test]
async fn a_typed_count_failure_has_no_generation_usage_or_attempt() {
    let failure = InferenceFailure {
        kind: FailureKind::RateLimit,
        code: "rate_limit".into(),
        retry_after_ms: Some(750),
        dispatch: None,
    };
    let provider = CountedProvider::new(false, Err(failure.clone()));
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let key = OperationKey::new("count-rate-limit").unwrap();
    let outcome = turn
        .operations()
        .infer(key.clone(), provider.bounded_request(&tool), grants())
        .await
        .unwrap();
    assert_eq!(outcome.failure, Some(failure));
    assert!(outcome.usage.is_empty());
    let record = turn.operation(&key).unwrap().unwrap();
    assert!(record.attempts.is_empty());
    assert!(record.rejection.is_some());
    assert_eq!(provider.inner.starts.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn an_expired_count_rejects_before_generation() {
    let provider = CountedProvider::exact(true);
    let tool = CounterTool::new(None);
    let runtime = runtime(
        provider.clone(),
        &tool,
        Arc::new(Allow),
        Authority::allowed(),
    );
    let turn = runtime
        .open(EphemeralJournal::create(binding()).unwrap().lease)
        .await
        .unwrap()
        .turn;
    let prepared = provider.bounded_request(&tool);
    let key = OperationKey::new("slow-count").unwrap();
    let worker = {
        let key = key.clone();
        let operations = turn.operations();
        tokio::spawn(async move { operations.infer(key, prepared, grants()).await.unwrap() })
    };
    provider.entered.notified().await;
    tokio::time::advance(Duration::from_secs(6)).await;
    let rejected = worker.await.unwrap();
    assert_eq!(rejected.failure.unwrap().code, "deadline");
    assert!(turn.operation(&key).unwrap().unwrap().attempts.is_empty());
    assert!(
        provider.measured.lock().unwrap()[0]
            .1
            .cancellation
            .is_cancelled()
    );
    assert_eq!(provider.inner.starts.load(Ordering::SeqCst), 0);
}
