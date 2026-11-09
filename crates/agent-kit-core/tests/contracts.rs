use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::context::{
    ContextInput, ContextLimits, ContextMeasure, ContextMeasurement, ContextTransform, assemble,
};
use agent_kit_core::history::{History, HistoryPosition, HistoryProjection, HistoryRecord};
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceOutcome, InferenceRequest, InferenceRun,
    InferenceStatus, InferenceUpdate, InputFormat, MeasurementKind, Modality, ModelCapabilities,
    ProviderBinding, ProviderEvent,
};
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, ResultContent, Role,
    ToolArguments, ToolCall, ToolResult,
};
use agent_kit_core::tools::{
    Inventory, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::*;
use agent_kit_core::*;
use futures_util::stream;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

fn message(id: &str, text: &str) -> Message {
    Message {
        id: MessageId::new(id).unwrap(),
        role: Role::User,
        phase: None,
        content: vec![Content::Text(text.into())],
        provenance: Provenance {
            source: "input".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    }
}

fn authority() -> AuthorityBinding {
    AuthorityBinding {
        principal: PrincipalId::new("principal").unwrap(),
        binding: BindingId::new("authority").unwrap(),
        scope: ScopeId::new("scope").unwrap(),
    }
}

fn grants() -> GrantSelection {
    GrantSelection {
        authority: authority(),
        grants: vec![GrantId::new("grant").unwrap()],
    }
}

fn binding() -> TurnBinding {
    TurnBinding {
        session: SessionId::new("session").unwrap(),
        turn: TurnId::new("turn").unwrap(),
        epoch: 1,
    }
}

fn envelope(text: &str) -> Envelope {
    Envelope::new(SchemaId::new("text").unwrap(), 1, text.as_bytes().to_vec()).unwrap()
}

fn capabilities() -> ModelCapabilities {
    ModelCapabilities {
        revision: BindingId::new("capabilities").unwrap(),
        input_modalities: [Modality::Text].into(),
        json_tools: true,
        text_tools: true,
        max_output_tokens: Some(1024),
    }
}

fn request() -> InferenceRequest {
    InferenceRequest {
        model: ModelId::new("model").unwrap(),
        messages: vec![message("input", "hello")],
        tools: vec![],
        max_output_tokens: Some(32),
        extension: None,
    }
}

fn inference_control(cancellation: CancellationToken) -> InferenceControl {
    InferenceControl {
        attempt: AttemptId::new("attempt").unwrap(),
        cancellation,
        deadline: None,
        max_output_bytes: 16384,
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
                id: ToolId::new("echo").unwrap(),
                version: 1,
                description: "Echo text".into(),
                input: InputFormat::Text,
                max_input_bytes: 1024,
                max_output_bytes: 1024,
                recovery: RecoveryKind::Repeatable,
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
        match arguments {
            ToolArguments::Text(value) if value != "reject" => Ok(()),
            _ => Err(Error::new(ErrorKind::InvalidInput, "invalid_echo_input")),
        }
    }
    fn invoke(
        &self,
        invocation: Invocation,
        _context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move {
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![ResultContent::Text(format!("{:?}", invocation.arguments()))],
                structured: None,
                receipt: None,
                truncated: false,
            }
        })
    }
}

fn invocation() -> Invocation {
    let mut inventory = Inventory::new();
    inventory.insert(Arc::new(EchoTool::new())).unwrap();
    inventory
        .snapshot(&[ToolId::new("echo").unwrap()])
        .unwrap()
        .prepare(
            OperationId::new("operation").unwrap(),
            &ToolId::new("echo").unwrap(),
            ToolArguments::Text("hello".into()),
        )
        .unwrap()
        .invocation()
        .clone()
}

fn operation() -> OperationRecord {
    OperationRecord {
        id: OperationId::new("operation").unwrap(),
        input: OperationInput::Tool(invocation()),
        origin: None,
        source_call: None,
        grants: grants(),
    }
}

fn change(state: &TurnState, id: &str, actions: Vec<JournalAction>) -> JournalChange {
    JournalChange::new(
        ChangeId::new(id).unwrap(),
        state.binding().clone(),
        state.position(),
        state.controls().revision,
        actions,
    )
    .unwrap()
}

fn start_actions() -> Vec<JournalAction> {
    vec![
        JournalAction::prepare(operation()),
        JournalAction::StartAttempt {
            operation: OperationId::new("operation").unwrap(),
            attempt: AttemptId::new("attempt").unwrap(),
        },
    ]
}

fn outcome(status: OutcomeStatus) -> OperationOutcome {
    OperationOutcome::Tool(ToolOutcome {
        status,
        content: vec![],
        structured: None,
        receipt: None,
        truncated: false,
    })
}

#[test]
fn identities_validate_construction_and_deserialization() {
    for input in ["", "with space", "line\nbreak"] {
        assert!(MessageId::new(input).is_err());
    }
    assert!(MessageId::new("x".repeat(257)).is_err());
    assert!(serde_json::from_str::<MessageId>("\"with space\"").is_err());
    assert_eq!(
        MessageId::new("model/provider:version").unwrap().as_str(),
        "model/provider:version"
    );
}

#[test]
fn fingerprints_ignore_json_object_insertion_order() {
    let a = serde_json::json!({"b": {"d": 4, "c": 3}, "a": 1});
    let b = serde_json::json!({"a": 1, "b": {"c": 3, "d": 4}});
    assert_eq!(Fingerprint::of(&a).unwrap(), Fingerprint::of(&b).unwrap());
    assert_ne!(
        Fingerprint::of(&a).unwrap(),
        Fingerprint::of(&serde_json::json!({"a": 2})).unwrap()
    );
}

#[test]
fn envelope_rejects_unversioned_or_oversized_payloads() {
    assert!(Envelope::new(SchemaId::new("data").unwrap(), 0, vec![]).is_err());
    assert!(
        Envelope::new(
            SchemaId::new("data").unwrap(),
            1,
            vec![0; Envelope::MAX_BYTES + 1]
        )
        .is_err()
    );
    let value = envelope("hello");
    assert_eq!(
        value,
        serde_json::from_slice(&serde_json::to_vec(&value).unwrap()).unwrap()
    );
}

#[test]
fn history_append_is_atomic_and_fork_preserves_source() {
    let mut history = History::new();
    history
        .append(
            HistoryPosition(0),
            &[HistoryRecord::Message(message("one", "first"))],
        )
        .unwrap();
    let before = history.clone();
    let invalid = vec![
        HistoryRecord::Message(message("two", "second")),
        HistoryRecord::Message(message("one", "duplicate")),
    ];
    assert!(history.append(history.position(), &invalid).is_err());
    assert_eq!(history, before);
    let mut fork = history.fork(history.position()).unwrap();
    fork.append(
        fork.position(),
        &[HistoryRecord::Message(message("three", "branch"))],
    )
    .unwrap();
    assert_eq!(history, before);
    assert_eq!(fork.position(), HistoryPosition(2));
}

#[test]
fn history_rejects_result_without_its_call() {
    let mut invalid = message("result", "");
    invalid.content = vec![Content::ToolResult(ToolResult {
        call: ToolCallId::new("unknown").unwrap(),
        status: OutcomeStatus::Succeeded,
        content: vec![],
        structured: None,
        truncated: false,
    })];
    assert!(
        History::new()
            .append(HistoryPosition(0), &[HistoryRecord::Message(invalid)])
            .is_err()
    );
}

struct Measure(MeasurementKind);
impl ContextMeasure for Measure {
    fn measure(&self, content: &[Message]) -> Result<ContextMeasurement> {
        Ok(ContextMeasurement {
            tokens: content.len() as u64 * 10,
            kind: self.0,
        })
    }
}

#[test]
fn context_enforces_bounds_without_promoting_estimates() {
    let mut history = History::new();
    history
        .append(
            HistoryPosition(0),
            &[HistoryRecord::Message(message("one", "first"))],
        )
        .unwrap();
    let view = history
        .project(&HistoryProjection {
            selection: history.selection(),
            replacements: vec![],
        })
        .unwrap();
    let input = || ContextInput {
        history: &view,
        fragments: &[],
        overhead: ContextMeasurement {
            tokens: 0,
            kind: MeasurementKind::Exact,
        },
    };
    let limits = ContextLimits {
        max_input_tokens: 10,
        require_bound: true,
        allow_pending_tool_calls: false,
    };
    let snapshot = assemble(
        input(),
        limits,
        ContextTransform::Preserve,
        &Measure(MeasurementKind::Exact),
    )
    .unwrap();
    assert_eq!(snapshot.messages[0].provenance, view.messages[0].provenance);
    assert!(
        assemble(
            input(),
            limits,
            ContextTransform::Preserve,
            &Measure(MeasurementKind::Estimate)
        )
        .is_err()
    );
    assert!(
        assemble(
            input(),
            ContextLimits {
                max_input_tokens: 9,
                ..limits
            },
            ContextTransform::Preserve,
            &Measure(MeasurementKind::Exact)
        )
        .is_err()
    );
}

#[test]
fn context_rejects_trimming_half_a_tool_exchange() {
    let mut history = History::new();
    let mut call = message("call", "");
    call.content = vec![Content::ToolCall(ToolCall {
        id: ToolCallId::new("call").unwrap(),
        tool: ToolId::new("echo").unwrap(),
        arguments: ToolArguments::Text("hello".into()),
    })];
    let mut result = message("result", "");
    result.content = vec![Content::ToolResult(ToolResult {
        call: ToolCallId::new("call").unwrap(),
        status: OutcomeStatus::Succeeded,
        content: vec![],
        structured: None,
        truncated: false,
    })];
    history
        .append(
            HistoryPosition(0),
            &[HistoryRecord::Message(call), HistoryRecord::Message(result)],
        )
        .unwrap();
    let view = history
        .project(&HistoryProjection {
            selection: history.selection(),
            replacements: vec![],
        })
        .unwrap();
    assert!(
        assemble(
            ContextInput {
                history: &view,
                fragments: &[],
                overhead: ContextMeasurement {
                    tokens: 0,
                    kind: MeasurementKind::Exact
                }
            },
            ContextLimits {
                max_input_tokens: 100,
                require_bound: true,
                allow_pending_tool_calls: false
            },
            ContextTransform::KeepLast(1),
            &Measure(MeasurementKind::Exact)
        )
        .is_err()
    );
}

#[test]
fn preparation_rejects_unsupported_capabilities_and_changed_fingerprints() {
    let binding = ProviderBinding {
        provider: ProviderId::new("provider").unwrap(),
        authority: authority(),
    };
    let prepared = agent_kit_core::inference::PreparedRequest::from_validated(
        request(),
        binding.clone(),
        capabilities(),
    )
    .unwrap();
    let mut encoded = serde_json::to_value(&prepared).unwrap();
    encoded["request"]["max_output_tokens"] = 33.into();
    assert!(serde_json::from_value::<agent_kit_core::inference::PreparedRequest>(encoded).is_err());
    let mut too_large = request();
    too_large.max_output_tokens = Some(1025);
    assert!(
        agent_kit_core::inference::PreparedRequest::from_validated(
            too_large,
            binding,
            capabilities()
        )
        .is_err()
    );
}

#[tokio::test]
async fn tool_preflight_precedes_execution_and_retains_definition() {
    let tool = Arc::new(EchoTool::new());
    let mut inventory = Inventory::new();
    inventory.insert(tool.clone()).unwrap();
    let snapshot = inventory.snapshot(&[ToolId::new("echo").unwrap()]).unwrap();
    assert!(
        snapshot
            .prepare(
                OperationId::new("rejected").unwrap(),
                &ToolId::new("echo").unwrap(),
                ToolArguments::Text("reject".into())
            )
            .is_err()
    );
    assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
    let prepared = snapshot
        .prepare(
            OperationId::new("accepted").unwrap(),
            &ToolId::new("echo").unwrap(),
            ToolArguments::Text("hello".into()),
        )
        .unwrap();
    assert_eq!(prepared.invocation().definition(), tool.definition());
    let result = prepared
        .invoke(InvocationContext {
            attempt: AttemptId::new("attempt").unwrap(),
            cancellation: CancellationToken::new(),
            deadline: None,
            max_output_bytes: 1024,
        })
        .await;
    assert_eq!(result.status, OutcomeStatus::Succeeded);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn cancelled_tool_never_dispatches() {
    let tool = Arc::new(EchoTool::new());
    let mut inventory = Inventory::new();
    inventory.insert(tool.clone()).unwrap();
    let prepared = inventory
        .snapshot(&[ToolId::new("echo").unwrap()])
        .unwrap()
        .prepare(
            OperationId::new("accepted").unwrap(),
            &ToolId::new("echo").unwrap(),
            ToolArguments::Text("hello".into()),
        )
        .unwrap();
    let token = CancellationToken::new();
    token.cancel();
    assert_eq!(
        prepared
            .invoke(InvocationContext {
                attempt: AttemptId::new("attempt").unwrap(),
                cancellation: token,
                deadline: None,
                max_output_bytes: 1024
            })
            .await
            .status,
        OutcomeStatus::Cancelled
    );
    assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn inference_eof_retains_partial_content_and_is_interrupted() {
    let events = vec![ProviderEvent::Update(InferenceUpdate::TextDelta {
        message: MessageId::new("answer").unwrap(),
        text: "partial".into(),
    })];
    let run = InferenceRun::from_stream(inference_control(CancellationToken::new()), |_| {
        Box::pin(stream::iter(events))
    });
    let result = run.finish().await;
    assert_eq!(result.status, InferenceStatus::Interrupted);
    assert_eq!(result.failure.unwrap().kind, FailureKind::Protocol);
    assert_eq!(
        result.messages[0].content[0],
        Content::Text("partial".into())
    );
}

#[tokio::test]
async fn inference_drop_cancels_its_transport_scope_without_cancelling_parent() {
    let parent = CancellationToken::new();
    let captured = Arc::new(Mutex::new(None));
    let other = Arc::clone(&captured);
    let run = InferenceRun::from_stream(inference_control(parent.clone()), move |control| {
        *other.lock().unwrap() = Some(control.cancellation);
        Box::pin(stream::pending())
    });
    drop(run);
    assert!(captured.lock().unwrap().as_ref().unwrap().is_cancelled());
    assert!(!parent.is_cancelled());
}

#[tokio::test]
async fn parent_cancellation_interrupts_pending_inference() {
    let parent = CancellationToken::new();
    let run = InferenceRun::from_stream(inference_control(parent.clone()), |_| {
        Box::pin(stream::pending())
    });
    parent.cancel();
    let result = run.finish().await;
    assert_eq!(result.status, InferenceStatus::Interrupted);
    assert_eq!(result.failure.unwrap().kind, FailureKind::Cancelled);
}

#[tokio::test]
async fn inference_limit_preserves_terminal_receipt() {
    let terminal = InferenceOutcome {
        status: InferenceStatus::Completed,
        messages: vec![message("answer", &"x".repeat(1024))],
        usage: vec![],
        failure: None,
        receipt: Some(envelope("receipt")),
    };
    let run = InferenceRun::from_stream(
        InferenceControl {
            max_output_bytes: 64,
            ..inference_control(CancellationToken::new())
        },
        |_| Box::pin(stream::iter([ProviderEvent::Finished(terminal)])),
    );
    let result = run.finish().await;
    assert_eq!(result.status, InferenceStatus::Limited);
    assert_eq!(result.receipt, Some(envelope("receipt")));
}

#[test]
fn journal_rejects_an_entire_batch_when_later_admission_fails() {
    let mut state = TurnState::new(binding()).unwrap();
    let batch = change(
        &state,
        "change",
        vec![
            JournalAction::Control(ControlDirective::Pause),
            JournalAction::prepare(operation()),
        ],
    );
    assert!(state.apply(batch).is_err());
    assert!(!state.controls().paused);
    assert!(state.operations().is_empty());
    assert_eq!(state.position(), JournalPosition(0));
}

#[test]
fn journal_replays_identical_changes_and_rejects_changed_content() {
    let mut state = TurnState::new(binding()).unwrap();
    let original = change(&state, "change", start_actions());
    let receipt = state.apply(original.clone()).unwrap();
    assert_eq!(state.apply(original).unwrap(), receipt);
    let conflicting = change(
        &state,
        "change",
        vec![JournalAction::Control(ControlDirective::Cancel)],
    );
    assert!(state.apply(conflicting).is_err());
    assert_eq!(state.position(), JournalPosition(1));
}

#[test]
fn semantic_change_digest_is_independent_of_admission_positions() {
    let first = JournalChange::new(
        ChangeId::new("change").unwrap(),
        binding(),
        JournalPosition(0),
        ControlRevision(0),
        vec![JournalAction::Control(ControlDirective::Pause)],
    )
    .unwrap();
    let second = JournalChange::new(
        ChangeId::new("change").unwrap(),
        binding(),
        JournalPosition(4),
        ControlRevision(2),
        vec![JournalAction::Control(ControlDirective::Pause)],
    )
    .unwrap();
    assert_ne!(first.fingerprint(), second.fingerprint());
    assert_eq!(first.content_fingerprint(), second.content_fingerprint());
}

#[test]
fn uncertain_effect_requires_reconciliation_before_repetition() {
    let mut state = TurnState::new(binding()).unwrap();
    state
        .apply(change(&state, "start", start_actions()))
        .unwrap();
    state
        .apply(change(
            &state,
            "unknown",
            vec![JournalAction::CompleteAttempt {
                operation: OperationId::new("operation").unwrap(),
                attempt: AttemptId::new("attempt").unwrap(),
                outcome: outcome(OutcomeStatus::Uncertain),
            }],
        ))
        .unwrap();
    assert!(state.operations().values().next().unwrap().is_uncertain());
    assert!(
        state
            .apply(change(
                &state,
                "repeat",
                vec![JournalAction::StartAttempt {
                    operation: OperationId::new("operation").unwrap(),
                    attempt: AttemptId::new("attempt-2").unwrap()
                }]
            ))
            .is_err()
    );
    state
        .apply(change(
            &state,
            "readback",
            vec![JournalAction::ReconcileAttempt {
                operation: OperationId::new("operation").unwrap(),
                attempt: AttemptId::new("attempt").unwrap(),
                outcome: outcome(OutcomeStatus::Succeeded),
            }],
        ))
        .unwrap();
    assert!(!state.operations().values().next().unwrap().is_uncertain());
    assert!(
        state
            .apply(change(
                &state,
                "repeat-success",
                vec![JournalAction::StartAttempt {
                    operation: OperationId::new("operation").unwrap(),
                    attempt: AttemptId::new("attempt-3").unwrap()
                }]
            ))
            .is_err()
    );
}

#[test]
fn settlement_requires_accounted_work_and_resolved_waits() {
    let mut state = TurnState::new(binding()).unwrap();
    state
        .apply(change(&state, "start", start_actions()))
        .unwrap();
    let finish = || {
        JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })
    };
    assert!(
        state
            .apply(change(&state, "early-finish", vec![finish()]))
            .is_err()
    );
    state
        .apply(change(
            &state,
            "done",
            vec![JournalAction::CompleteAttempt {
                operation: OperationId::new("operation").unwrap(),
                attempt: AttemptId::new("attempt").unwrap(),
                outcome: outcome(OutcomeStatus::Succeeded),
            }],
        ))
        .unwrap();
    assert!(matches!(
        state
            .apply(change(&state, "finish", vec![finish()]))
            .unwrap(),
        CommitReceipt::Settled(_)
    ));
    assert!(
        state
            .apply(change(
                &state,
                "more",
                vec![JournalAction::prepare(operation())]
            ))
            .is_err()
    );
}

#[test]
fn state_roundtrip_rejects_inconsistent_bindings() {
    let state = TurnState::new(binding()).unwrap();
    let data = serde_json::to_vec(&state).unwrap();
    let restored: TurnState = serde_json::from_slice(&data).unwrap();
    assert_eq!(restored.binding(), state.binding());
    let mut corrupt = serde_json::to_value(&state).unwrap();
    corrupt["controls"]["binding"]["turn"] = "different".into();
    assert!(serde_json::from_value::<TurnState>(corrupt).is_err());
}

#[test]
fn a_new_epoch_fences_previous_changes() {
    let mut state = TurnState::new(binding()).unwrap();
    let old = change(&state, "old", start_actions());
    state
        .rebind(TurnBinding {
            epoch: 2,
            ..binding()
        })
        .unwrap();
    assert!(state.apply(old).is_err());
    assert_eq!(state.position(), JournalPosition(0));
}

#[tokio::test]
async fn ephemeral_controls_wake_observers_and_retries_are_idempotent() {
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let revision = ephemeral.lease.controls().read().await.unwrap().revision;
    let (observed, changed) = tokio::join!(
        ephemeral.lease.controls().changed(revision),
        ephemeral.control.change(
            ChangeId::new("pause").unwrap(),
            revision,
            ControlDirective::Pause
        )
    );
    assert!(observed.unwrap().paused);
    let receipt = changed.unwrap();
    assert_eq!(
        ephemeral
            .control
            .change(
                ChangeId::new("pause").unwrap(),
                revision,
                ControlDirective::Pause
            )
            .await
            .unwrap(),
        receipt
    );
    assert!(
        ephemeral
            .control
            .change(
                ChangeId::new("pause").unwrap(),
                revision,
                ControlDirective::Cancel
            )
            .await
            .is_err()
    );
}

#[tokio::test]
async fn question_answers_remain_available_while_paused() {
    let ephemeral = EphemeralJournal::create(binding()).unwrap();
    let state = ephemeral.lease.journal().load().await.unwrap();
    ephemeral
        .lease
        .journal()
        .commit(change(
            &state,
            "question",
            vec![
                JournalAction::OpenWait(WaitRecord {
                    id: WaitId::new("question").unwrap(),
                    request: envelope("choose"),
                    response: ResponseContract {
                        schema: SchemaId::new("text").unwrap(),
                        version: 1,
                    },
                    answer: None,
                    withdrawn: false,
                }),
                JournalAction::Control(ControlDirective::Pause),
            ],
        ))
        .await
        .unwrap();
    let state = ephemeral.lease.journal().load().await.unwrap();
    ephemeral
        .control
        .resolve(
            ChangeId::new("answer").unwrap(),
            state.controls().revision,
            WaitId::new("question").unwrap(),
            envelope("selected"),
        )
        .await
        .unwrap();
    let state = ephemeral.lease.journal().load().await.unwrap();
    assert!(state.controls().paused);
    assert_eq!(
        state.waits()[&WaitId::new("question").unwrap()].answer,
        Some(envelope("selected"))
    );
}

struct BoundPort(TurnBinding);
impl TurnJournal for BoundPort {
    fn binding(&self) -> &TurnBinding {
        &self.0
    }
    fn load(&self) -> BoxFuture<'_, Result<TurnState>> {
        Box::pin(async { TurnState::new(self.0.clone()) })
    }
    fn commit(&self, _change: JournalChange) -> BoxFuture<'_, Result<CommitReceipt>> {
        Box::pin(async { Err(Error::new(ErrorKind::Unavailable, "read_only")) })
    }
    fn lookup(&self, _change: ChangeId) -> BoxFuture<'_, Result<Option<CommitReceipt>>> {
        Box::pin(async { Ok(None) })
    }
}
impl ControlReader for BoundPort {
    fn binding(&self) -> &TurnBinding {
        &self.0
    }
    fn read(&self) -> BoxFuture<'_, Result<ControlSnapshot>> {
        Box::pin(async { Ok(TurnState::new(self.0.clone())?.controls().clone()) })
    }
    fn changed(&self, _after: ControlRevision) -> BoxFuture<'_, Result<ControlSnapshot>> {
        self.read()
    }
}

#[test]
fn lease_factory_rejects_mismatched_journal_and_control_bindings() {
    let different = TurnBinding {
        epoch: 2,
        ..binding()
    };
    assert!(
        bind_lease(
            binding(),
            Box::new(BoundPort(binding())),
            Arc::new(BoundPort(different))
        )
        .is_err()
    );
    assert!(
        bind_lease(
            binding(),
            Box::new(BoundPort(binding())),
            Arc::new(BoundPort(binding()))
        )
        .is_ok()
    );
}

#[tokio::test]
async fn tool_output_limits_preserve_actual_execution_status() {
    let tool = Arc::new(EchoTool::new());
    let mut inventory = Inventory::new();
    inventory.insert(tool.clone()).unwrap();
    let prepared = inventory
        .snapshot(&[ToolId::new("echo").unwrap()])
        .unwrap()
        .prepare(
            OperationId::new("bounded").unwrap(),
            &ToolId::new("echo").unwrap(),
            ToolArguments::Text("hello".into()),
        )
        .unwrap();
    let result = prepared
        .invoke(InvocationContext {
            attempt: AttemptId::new("attempt").unwrap(),
            cancellation: CancellationToken::new(),
            deadline: None,
            max_output_bytes: 1,
        })
        .await;
    assert_eq!(result.status, OutcomeStatus::Succeeded);
    assert!(result.truncated);
    assert!(result.content.is_empty());
    assert_eq!(tool.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn unavailable_recovery_does_not_invoke_the_tool_again() {
    let tool = Arc::new(EchoTool::new());
    let mut inventory = Inventory::new();
    inventory.insert(tool.clone()).unwrap();
    let prepared = inventory
        .snapshot(&[ToolId::new("echo").unwrap()])
        .unwrap()
        .prepare(
            OperationId::new("recover").unwrap(),
            &ToolId::new("echo").unwrap(),
            ToolArguments::Text("hello".into()),
        )
        .unwrap();
    let recovery = agent_kit_core::tools::InvocationRecovery {
        invocation: prepared.invocation().clone(),
        checkpoint: None,
        receipts: vec![],
    };
    let outcome = prepared
        .recover(
            recovery,
            InvocationContext {
                attempt: AttemptId::new("attempt").unwrap(),
                cancellation: CancellationToken::new(),
                deadline: None,
                max_output_bytes: 1024,
            },
        )
        .await;
    assert_eq!(outcome.status, OutcomeStatus::Uncertain);
    assert_eq!(tool.calls.load(Ordering::SeqCst), 0);
}

#[test]
fn operation_origin_must_identify_existing_distinct_work() {
    for origin in ["missing", "operation"] {
        let mut state = TurnState::new(binding()).unwrap();
        let mut record = operation();
        record.origin = Some(OperationId::new(origin).unwrap());
        assert!(
            state
                .apply(change(
                    &state,
                    "prepare",
                    vec![JournalAction::prepare(record)]
                ))
                .is_err()
        );
        assert!(state.operations().is_empty());
    }
}

#[test]
fn prepared_rejection_settles_without_inventing_a_physical_attempt() {
    let mut state = TurnState::new(binding()).unwrap();
    state
        .apply(change(
            &state,
            "prepare",
            vec![JournalAction::prepare(operation())],
        ))
        .unwrap();
    state
        .apply(change(
            &state,
            "cancel",
            vec![JournalAction::Control(ControlDirective::Cancel)],
        ))
        .unwrap();
    state
        .apply(change(
            &state,
            "rejected",
            vec![JournalAction::RejectPrepared {
                operation: OperationId::new("operation").unwrap(),
                outcome: outcome(OutcomeStatus::Cancelled),
            }],
        ))
        .unwrap();
    assert!(
        state
            .operations()
            .values()
            .next()
            .unwrap()
            .attempts
            .is_empty()
    );
    assert!(matches!(
        state
            .apply(change(
                &state,
                "settled",
                vec![JournalAction::Settle(TurnOutcome {
                    status: OutcomeStatus::Cancelled,
                    account: None,
                    evidence: vec![]
                })]
            ))
            .unwrap(),
        CommitReceipt::Settled(_)
    ));
}

#[test]
fn prepared_rejection_cannot_claim_a_successful_effect() {
    let mut state = TurnState::new(binding()).unwrap();
    state
        .apply(change(
            &state,
            "prepare",
            vec![JournalAction::prepare(operation())],
        ))
        .unwrap();
    assert!(
        state
            .apply(change(
                &state,
                "rejected",
                vec![JournalAction::RejectPrepared {
                    operation: OperationId::new("operation").unwrap(),
                    outcome: outcome(OutcomeStatus::Succeeded)
                }]
            ))
            .is_err()
    );
    assert!(
        state
            .operations()
            .values()
            .next()
            .unwrap()
            .outcome()
            .is_none()
    );
}

#[test]
fn restored_state_rejects_unrecorded_journal_positions() {
    let mut state = TurnState::new(binding()).unwrap();
    state
        .apply(change(
            &state,
            "prepare",
            vec![JournalAction::prepare(operation())],
        ))
        .unwrap();
    let mut value = serde_json::to_value(&state).unwrap();
    value["position"] = 999.into();
    assert!(serde_json::from_value::<TurnState>(value).is_err());
}

struct TestProvider;
impl agent_kit_core::inference::Provider for TestProvider {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities> {
        if model.as_str() != "model" {
            return Err(Error::new(ErrorKind::Unsupported, "model_unavailable"));
        }
        Ok(capabilities())
    }
    fn prepare(
        &self,
        request: InferenceRequest,
    ) -> Result<agent_kit_core::inference::PreparedRequest> {
        let capabilities = self.capabilities(&request.model)?;
        agent_kit_core::inference::PreparedRequest::from_validated(
            request,
            ProviderBinding {
                provider: ProviderId::new("provider").unwrap(),
                authority: authority(),
            },
            capabilities,
        )
    }
    fn start(
        &self,
        _request: agent_kit_core::inference::PreparedRequest,
        control: InferenceControl,
    ) -> Result<InferenceRun> {
        Ok(InferenceRun::from_stream(control, |_| {
            Box::pin(stream::iter([ProviderEvent::Finished(InferenceOutcome {
                status: InferenceStatus::Completed,
                messages: vec![],
                usage: vec![],
                failure: None,
                receipt: None,
            })]))
        }))
    }
}

#[tokio::test]
async fn direct_provider_use_requires_no_turn_or_session() {
    let provider: &dyn agent_kit_core::inference::Provider = &TestProvider;
    let prepared = provider.prepare(request()).unwrap();
    let outcome = provider
        .start(prepared, inference_control(CancellationToken::new()))
        .unwrap()
        .finish()
        .await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
}

#[tokio::test]
async fn interrupted_stream_retains_completed_tool_arguments() {
    let call = ToolCall {
        id: ToolCallId::new("call").unwrap(),
        tool: ToolId::new("echo").unwrap(),
        arguments: ToolArguments::Text("ready".into()),
    };
    let events = vec![ProviderEvent::Update(InferenceUpdate::ToolCall(
        call.clone(),
    ))];
    let outcome = InferenceRun::from_stream(inference_control(CancellationToken::new()), |_| {
        Box::pin(stream::iter(events))
    })
    .finish()
    .await;
    assert_eq!(outcome.status, InferenceStatus::Interrupted);
    assert_eq!(outcome.messages[0].content[0], Content::ToolCall(call));
}

#[test]
fn reconciliation_retains_the_previous_outcome_evidence() {
    let mut state = TurnState::new(binding()).unwrap();
    state
        .apply(change(&state, "start", start_actions()))
        .unwrap();
    state
        .apply(change(
            &state,
            "unknown",
            vec![JournalAction::CompleteAttempt {
                operation: OperationId::new("operation").unwrap(),
                attempt: AttemptId::new("attempt").unwrap(),
                outcome: outcome(OutcomeStatus::Uncertain),
            }],
        ))
        .unwrap();
    state
        .apply(change(
            &state,
            "resolved",
            vec![JournalAction::ReconcileAttempt {
                operation: OperationId::new("operation").unwrap(),
                attempt: AttemptId::new("attempt").unwrap(),
                outcome: outcome(OutcomeStatus::Succeeded),
            }],
        ))
        .unwrap();
    let attempt = &state.operations().values().next().unwrap().attempts[0];
    assert_eq!(
        attempt.prior_outcomes,
        vec![outcome(OutcomeStatus::Uncertain)]
    );
    assert_eq!(attempt.outcome, Some(outcome(OutcomeStatus::Succeeded)));
    let restored: TurnState = serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
    assert_eq!(
        restored.operations().values().next().unwrap().attempts[0],
        *attempt
    );
}

#[test]
fn history_deserialization_preserves_constructor_invariants() {
    let mut history = History::new();
    history
        .append(
            HistoryPosition(0),
            &[HistoryRecord::Message(message("one", "first"))],
        )
        .unwrap();
    let mut value = serde_json::to_value(&history).unwrap();
    let original = value["records"][0].clone();
    value["records"].as_array_mut().unwrap().push(original);
    assert!(serde_json::from_value::<History>(value).is_err());
}

fn inference_operation(id: &str) -> OperationRecord {
    let prepared = agent_kit_core::inference::PreparedRequest::from_validated(
        request(),
        ProviderBinding {
            provider: ProviderId::new("provider").unwrap(),
            authority: authority(),
        },
        capabilities(),
    )
    .unwrap();
    OperationRecord {
        id: OperationId::new(id).unwrap(),
        input: OperationInput::Inference(prepared),
        origin: None,
        source_call: None,
        grants: grants(),
    }
}

fn sourced_operation(id: &str, origin: &str, call: &str) -> OperationRecord {
    let mut inventory = Inventory::new();
    inventory.insert(Arc::new(EchoTool::new())).unwrap();
    let invocation = inventory
        .snapshot(&[ToolId::new("echo").unwrap()])
        .unwrap()
        .prepare(
            OperationId::new(id).unwrap(),
            &ToolId::new("echo").unwrap(),
            ToolArguments::Text("hello".into()),
        )
        .unwrap()
        .invocation()
        .clone();
    OperationRecord {
        id: OperationId::new(id).unwrap(),
        input: OperationInput::Tool(invocation),
        origin: Some(OperationId::new(origin).unwrap()),
        source_call: Some(ToolCallId::new(call).unwrap()),
        grants: grants(),
    }
}

#[test]
fn source_call_requires_an_originating_inference() {
    let mut state = TurnState::new(binding()).unwrap();
    let mut missing = operation();
    missing.source_call = Some(ToolCallId::new("call").unwrap());
    assert!(
        state
            .apply(change(
                &state,
                "missing-origin",
                vec![JournalAction::prepare(missing)]
            ))
            .is_err()
    );
    state
        .apply(change(
            &state,
            "tool-origin",
            vec![JournalAction::prepare(operation())],
        ))
        .unwrap();
    assert!(
        state
            .apply(change(
                &state,
                "wrong-origin",
                vec![JournalAction::prepare(sourced_operation(
                    "child",
                    "operation",
                    "call"
                ))]
            ))
            .is_err()
    );
    let mut wrong_kind = inference_operation("child-inference");
    wrong_kind.origin = Some(OperationId::new("operation").unwrap());
    wrong_kind.source_call = Some(ToolCallId::new("call").unwrap());
    assert!(
        state
            .apply(change(
                &state,
                "wrong-kind",
                vec![JournalAction::prepare(wrong_kind)]
            ))
            .is_err()
    );
}

#[test]
fn source_call_correlation_is_unique_within_each_inference() {
    let mut state = TurnState::new(binding()).unwrap();
    state
        .apply(change(
            &state,
            "source",
            vec![JournalAction::prepare(inference_operation("source"))],
        ))
        .unwrap();
    state
        .apply(change(
            &state,
            "child",
            vec![JournalAction::prepare(sourced_operation(
                "child", "source", "call",
            ))],
        ))
        .unwrap();
    assert!(
        state
            .apply(change(
                &state,
                "duplicate-child",
                vec![JournalAction::prepare(sourced_operation(
                    "duplicate-child",
                    "source",
                    "call"
                ))]
            ))
            .is_err()
    );
    state
        .apply(change(
            &state,
            "next-source",
            vec![JournalAction::prepare(inference_operation("next-source"))],
        ))
        .unwrap();
    state
        .apply(change(
            &state,
            "next-child",
            vec![JournalAction::prepare(sourced_operation(
                "next-child",
                "next-source",
                "call",
            ))],
        ))
        .unwrap();
    let restored: TurnState = serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
    assert_eq!(
        restored.operations()[&OperationId::new("child").unwrap()]
            .record
            .source_call,
        Some(ToolCallId::new("call").unwrap())
    );
}

#[test]
fn older_operation_records_without_source_call_remain_readable() {
    let original = operation();
    let mut value = serde_json::to_value(&original).unwrap();
    value.as_object_mut().unwrap().remove("source_call");
    let decoded: OperationRecord = serde_json::from_value(value).unwrap();
    assert_eq!(decoded.source_call, None);
    assert_eq!(decoded, original);
}

#[test]
fn late_reconciliation_preserves_terminal_account_and_closed_admission() {
    let mut state = TurnState::new(binding()).unwrap();
    state
        .apply(change(&state, "start", start_actions()))
        .unwrap();
    state
        .apply(change(
            &state,
            "unknown",
            vec![JournalAction::CompleteAttempt {
                operation: OperationId::new("operation").unwrap(),
                attempt: AttemptId::new("attempt").unwrap(),
                outcome: outcome(OutcomeStatus::Uncertain),
            }],
        ))
        .unwrap();
    let terminal = TurnOutcome {
        status: OutcomeStatus::Uncertain,
        account: Some(envelope("unknown when the turn ended")),
        evidence: vec![OperationId::new("operation").unwrap()],
    };
    let settlement = state
        .apply(change(
            &state,
            "settlement",
            vec![JournalAction::Settle(terminal.clone())],
        ))
        .unwrap();
    assert!(matches!(settlement, CommitReceipt::Settled(_)));
    let history = state.history().clone();
    let control = state.controls().clone();
    let receipt = state
        .apply(change(
            &state,
            "late-evidence",
            vec![JournalAction::ReconcileAttempt {
                operation: OperationId::new("operation").unwrap(),
                attempt: AttemptId::new("attempt").unwrap(),
                outcome: outcome(OutcomeStatus::Succeeded),
            }],
        ))
        .unwrap();
    assert!(matches!(receipt, CommitReceipt::Recorded(_)));
    assert_eq!(state.outcome(), Some(&terminal));
    assert_eq!(state.history(), &history);
    assert_eq!(state.controls(), &control);
    assert!(
        state
            .apply(change(
                &state,
                "new-work",
                vec![JournalAction::prepare(inference_operation("new-work"))]
            ))
            .is_err()
    );
    assert!(
        state
            .apply(change(
                &state,
                "change-control",
                vec![JournalAction::Control(ControlDirective::Resume)]
            ))
            .is_err()
    );
    assert!(
        state
            .apply(change(
                &state,
                "checkpoint",
                vec![JournalAction::SetCheckpoint(envelope("later"))]
            ))
            .is_err()
    );
    assert!(
        state
            .apply(change(
                &state,
                "duplicate-evidence",
                vec![JournalAction::ReconcileAttempt {
                    operation: OperationId::new("operation").unwrap(),
                    attempt: AttemptId::new("attempt").unwrap(),
                    outcome: outcome(OutcomeStatus::Failed)
                }]
            ))
            .is_err()
    );
    let restored: TurnState = serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
    assert_eq!(restored.outcome(), Some(&terminal));
    assert_eq!(
        restored.operations().values().next().unwrap().outcome(),
        Some(&outcome(OutcomeStatus::Succeeded))
    );
}

#[test]
fn suspended_control_changes_have_recorded_receipts() {
    let mut state = TurnState::new(binding()).unwrap();
    let receipt = state
        .apply(change(&state, "suspend", vec![JournalAction::Suspend]))
        .unwrap();
    assert!(matches!(receipt, CommitReceipt::Suspended(_)));
    let receipt = state
        .apply(change(
            &state,
            "cancel",
            vec![JournalAction::Control(ControlDirective::Cancel)],
        ))
        .unwrap();
    assert!(matches!(receipt, CommitReceipt::Recorded(_)));
    assert!(state.is_suspended());
    assert!(state.controls().cancelled);
    state.validate().unwrap();
}

#[tokio::test]
async fn inference_factory_receives_the_callers_attempt_identity() {
    let attempt = AttemptId::new("attempt-identity").unwrap();
    let expected = attempt.clone();
    let run = InferenceRun::from_stream(
        InferenceControl {
            attempt,
            ..inference_control(CancellationToken::new())
        },
        move |control| {
            assert_eq!(control.attempt, expected);
            Box::pin(stream::iter([ProviderEvent::Finished(InferenceOutcome {
                status: InferenceStatus::Completed,
                messages: vec![],
                usage: vec![],
                failure: None,
                receipt: None,
            })]))
        },
    );
    assert_eq!(run.finish().await.status, InferenceStatus::Completed);
}

struct AttemptTool {
    definition: ToolDefinition,
    observed: Mutex<Option<AttemptId>>,
}
impl Tool for AttemptTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    fn validate(&self, _: &ToolArguments) -> Result<()> {
        Ok(())
    }
    fn invoke(&self, _: Invocation, context: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        *self.observed.lock().unwrap() = Some(context.attempt);
        Box::pin(async {
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![],
                structured: None,
                receipt: None,
                truncated: false,
            }
        })
    }
}

#[tokio::test]
async fn prepared_tool_preserves_the_attempt_identity_for_its_executor() {
    let tool = Arc::new(AttemptTool {
        definition: EchoTool::new().definition,
        observed: Mutex::new(None),
    });
    let mut inventory = Inventory::new();
    inventory.insert(tool.clone()).unwrap();
    let prepared = inventory
        .snapshot(&[ToolId::new("echo").unwrap()])
        .unwrap()
        .prepare(
            OperationId::new("invocation").unwrap(),
            &ToolId::new("echo").unwrap(),
            ToolArguments::Text("hello".into()),
        )
        .unwrap();
    let attempt = AttemptId::new("tool-attempt").unwrap();
    prepared
        .invoke(InvocationContext {
            attempt: attempt.clone(),
            cancellation: CancellationToken::new(),
            deadline: None,
            max_output_bytes: 1024,
        })
        .await;
    assert_eq!(tool.observed.lock().unwrap().as_ref(), Some(&attempt));
}
