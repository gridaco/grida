use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{
    InferenceControl, InferenceOutcome, InferenceRequest, InferenceRun, InferenceStatus, Modality,
    ModelCapabilities, PreparedRequest, Provider, ProviderBinding, ProviderEvent,
};
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role, ToolArguments, ToolCall,
};
use agent_kit_core::tools::{
    Inventory, InventorySnapshot, Invocation, InvocationContext, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{CommitReceipt, ControlDirective, OperationOutcome, WaitRecord};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, GrantId, MessageId, ModelId,
    PrincipalId, ProviderId, Result, SchemaId, ScopeId, SessionId, ToolCallId, TurnId,
};
use agent_kit_runtime::{
    AdmissionContext, ExecutionLimits, ExecutionServices, InvokeOutcome, OperationKey, Runtime,
    StepPlan, SuspendOutcome, SuspensionDraft, ToolAdmission, ToolDecision, ToolGate, Turn,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ControlRequest, CreateSession, SessionControl, SessionStore,
    Submission, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent_master::questions::{
    QuestionAnswer, QuestionStyle, QuestionTool, defer_for_answer, prepare_answer, read_question,
    read_registration,
};
use grida_agent_master::{Master, MasterAuthority, MasterConfig, MasterOutcome};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const QUESTION: &str = "Which edition should the document target?";

struct ScriptProvider {
    requests: Mutex<Vec<InferenceRequest>>,
}

impl Provider for ScriptProvider {
    fn capabilities(&self, _: &ModelId) -> Result<ModelCapabilities> {
        Ok(ModelCapabilities {
            revision: BindingId::new("question-fixture")?,
            input_modalities: BTreeSet::from([Modality::Text]),
            json_tools: true,
            text_tools: false,
            max_output_tokens: Some(1024),
            reasoning: Default::default(),
        })
    }

    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        let capabilities = self.capabilities(&request.model)?;
        PreparedRequest::from_validated(
            request,
            ProviderBinding {
                provider: provider_id(),
                authority: grants().authority,
            },
            capabilities,
        )
    }

    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        let mut requests = self.requests.lock().unwrap();
        let index = requests.len();
        let content = if index == 0 {
            Content::ToolCall(ToolCall {
                id: ToolCallId::new("ask-edition")?,
                tool: request.request().tools[0].id.clone(),
                arguments: ToolArguments::Json(json!({
                    "question": QUESTION,
                    "options": ["Screen", "Print"]
                })),
            })
        } else {
            Content::Text("Completed available work.".into())
        };
        requests.push(request.request().clone());
        let outcome = InferenceOutcome {
            status: InferenceStatus::Completed,
            messages: vec![message(
                &format!("response-{index}"),
                Role::Assistant,
                content,
            )],
            usage: vec![],
            failure: None,
            receipt: None,
            terminal_receipt: None,
        };
        Ok(InferenceRun::from_stream(control, move |_| {
            Box::pin(futures_util::stream::iter([ProviderEvent::Finished(
                outcome,
            )]))
        }))
    }
}

struct QuestionAuthority;
impl AuthorityValidator for QuestionAuthority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move { authorize(&request.selection) })
    }
}
impl ToolGate for QuestionAuthority {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            authorize(&admission.grants)?;
            Ok(defer_for_answer(&admission, &context.operations)
                .await?
                .unwrap_or(ToolDecision::Permit))
        })
    }
}

fn authorize(selection: &GrantSelection) -> Result<()> {
    if selection != &grants() {
        return Err(Error::new(
            ErrorKind::InvalidState,
            "unexpected_fixture_authority",
        ));
    }
    Ok(())
}

fn grants() -> GrantSelection {
    GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("fixture").unwrap(),
            binding: BindingId::new("questions").unwrap(),
            scope: ScopeId::new("interaction").unwrap(),
        },
        grants: vec![GrantId::new("question").unwrap()],
    }
}

fn provider_id() -> ProviderId {
    ProviderId::new("fixture").unwrap()
}

fn model() -> ModelId {
    ModelId::new("fixture-model").unwrap()
}

fn session() -> SessionId {
    SessionId::new("question-session").unwrap()
}

fn turn() -> TurnId {
    TurnId::new("question-turn").unwrap()
}

fn change(name: &str) -> ChangeId {
    ChangeId::new(name).unwrap()
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
        Content::Text("Finish the document.".into()),
    )]
}

struct Fixture {
    state: tempfile::TempDir,
    provider: Arc<ScriptProvider>,
}

impl Fixture {
    fn new() -> Self {
        let state = tempfile::tempdir().unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(state.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self {
            state,
            provider: Arc::new(ScriptProvider {
                requests: Mutex::default(),
            }),
        }
    }

    fn store(&self) -> SqliteStore {
        SqliteStore::open(self.state.path().join("sessions.sqlite")).unwrap()
    }

    async fn reopen(&self) -> SqliteStore {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            match SqliteStore::open(self.state.path().join("sessions.sqlite")) {
                Ok(store) => return store,
                Err(error)
                    if error.code == "store_already_owned"
                        && tokio::time::Instant::now() < deadline =>
                {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                Err(error) => panic!("could not reopen fixture store: {error}"),
            }
        }
    }

    fn runtime(&self) -> Runtime {
        let provider: Arc<dyn Provider> = self.provider.clone();
        Runtime::new(ExecutionServices {
            providers: BTreeMap::from([(provider_id(), provider)]),
            tools: Inventory::new().snapshot(&[]).unwrap(),
            authority: Arc::new(QuestionAuthority),
            gate: Arc::new(QuestionAuthority),
            limits: ExecutionLimits {
                max_operations: 16,
                max_concurrent_inferences: 1,
                max_concurrent_tools: 1,
                max_output_bytes: 32 * 1024,
                operation_timeout: Duration::from_secs(5),
                observer_capacity: 16,
            },
        })
        .unwrap()
    }

    fn master(&self, tools: InventorySnapshot) -> Master {
        let authority = MasterAuthority {
            inference: grants(),
            tools: tools
                .offers()
                .unwrap()
                .into_iter()
                .map(|offer| (offer.id, grants()))
                .collect(),
        };
        Master::new(
            MasterConfig {
                model: model(),
                instructions: "Complete the task and incorporate user answers.".into(),
                max_steps: 5,
                max_output_tokens: Some(1024),
                reasoning: Default::default(),
            },
            self.provider.clone(),
            tools,
            authority,
        )
        .unwrap()
    }

    async fn open(&self, store: &SqliteStore) -> Turn {
        let payload = Envelope::new(SchemaId::new("fixture.text").unwrap(), 1, vec![]).unwrap();
        store
            .create(CreateSession {
                id: session(),
                request: change("create"),
                configuration: payload.clone(),
            })
            .await
            .unwrap();
        store
            .submit(
                session(),
                Submission {
                    id: change("input"),
                    payload,
                },
            )
            .await
            .unwrap();
        let view = store.inspect(session()).await.unwrap();
        self.claim(
            store,
            TurnSelection::New {
                turn: turn(),
                inputs: vec![change("input")],
            },
            view.revision,
            "claim",
        )
        .await
    }

    async fn resume(&self, store: &SqliteStore) -> Turn {
        let view = store.inspect(session()).await.unwrap();
        let current = view.current.unwrap();
        let selection = if current.controls.paused {
            TurnSelection::ResumePaused {
                turn: turn(),
                epoch: current.binding.epoch,
                position: current.position,
                control_revision: current.controls.revision,
            }
        } else {
            TurnSelection::Resume {
                turn: turn(),
                epoch: current.binding.epoch,
                position: current.position,
            }
        };
        self.claim(store, selection, view.revision, "resume").await
    }

    async fn claim(
        &self,
        store: &SqliteStore,
        selection: TurnSelection,
        revision: agent_kit_sessions::SessionRevision,
        id: &str,
    ) -> Turn {
        let ClaimOutcome::Acquired(claim) = store
            .claim(ClaimRequest {
                id: change(id),
                session: session(),
                expected_revision: revision,
                selection,
            })
            .await
            .unwrap()
        else {
            panic!("expected turn ownership");
        };
        self.runtime().open(claim.lease).await.unwrap().turn
    }

    async fn answer(&self, store: &SqliteStore, wait: &WaitRecord, answer: QuestionAnswer) {
        let prepared = prepare_answer(wait, answer).unwrap();
        let view = store.inspect(session()).await.unwrap();
        let current = view.current.unwrap();
        let action = if let Some(record) = prepared.contribution {
            SessionControl::ResolveAndAppend {
                turn: turn(),
                expected: current.controls.revision,
                expected_history: current.history_position,
                wait: prepared.wait,
                answer: prepared.answer,
                records: vec![record],
            }
        } else {
            SessionControl::Resolve {
                turn: turn(),
                expected: current.controls.revision,
                wait: prepared.wait,
                answer: prepared.answer,
            }
        };
        store
            .control(ControlRequest {
                id: change("answer"),
                session: session(),
                expected_revision: view.revision,
                action,
            })
            .await
            .unwrap();
    }
}

fn question_tool(turn: &Turn, style: QuestionStyle) -> QuestionTool {
    QuestionTool::new(turn.operations(), style).unwrap()
}

fn inventory(tool: impl Tool + 'static) -> InventorySnapshot {
    let id = tool.definition().id.clone();
    let mut inventory = Inventory::new();
    inventory.insert(Arc::new(tool)).unwrap();
    inventory.snapshot(&[id]).unwrap()
}

#[tokio::test]
async fn nonblocking_question_returns_a_receipt_and_uses_the_later_user_response() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let opened = fixture.open(&store).await;
    let ops = opened.operations();
    let tools = inventory(question_tool(&opened, QuestionStyle::Nonblocking));
    let MasterOutcome::Suspended(suspension) =
        fixture.master(tools).run(opened, input()).await.unwrap()
    else {
        panic!("an open question must keep the task resumable");
    };
    store
        .verify(CommitReceipt::Suspended(suspension))
        .await
        .unwrap();
    assert_eq!(fixture.provider.requests.lock().unwrap().len(), 2);

    let view = ops.view();
    let wait = view.state.waits().values().next().unwrap();
    assert_eq!(view.state.waits().len(), 1);
    let request = read_question(wait).unwrap();
    assert_eq!(request.style, QuestionStyle::Nonblocking);
    assert_eq!(request.prompt.question, QUESTION);
    assert!(wait.is_pending());
    let Some(OperationOutcome::Tool(outcome)) =
        view.operation(&request.operation).unwrap().outcome()
    else {
        panic!("question registration must return immediately");
    };
    assert_eq!(outcome.status, OutcomeStatus::Succeeded);
    let registration = read_registration(outcome.receipt.as_ref().unwrap()).unwrap();
    assert_eq!(registration.wait, wait.id);
    store.verify(registration.commit).await.unwrap();

    assert!(prepare_answer(wait, QuestionAnswer::Choice { index: 2 }).is_err());
    let answer = QuestionAnswer::Text {
        text: "Use a large-print edition.".into(),
    };
    let prepared = prepare_answer(wait, answer.clone()).unwrap();
    let Some(HistoryRecord::Message(contribution)) = prepared.contribution else {
        panic!("the answer must contribute a user message");
    };
    fixture.answer(&store, wait, answer).await;
    let resumed = fixture.resume(&store).await;
    let tools = inventory(question_tool(&resumed, QuestionStyle::Nonblocking));
    assert!(matches!(
        fixture.master(tools).run(resumed, input()).await.unwrap(),
        MasterOutcome::Settled(receipt) if receipt.outcome.status == OutcomeStatus::Succeeded
    ));
    let requests = fixture.provider.requests.lock().unwrap();
    assert_eq!(requests.len(), 3);
    assert!(requests[2].messages.contains(&contribution));
    assert_eq!(contribution.role, Role::User);
    assert!(
        matches!(&contribution.content[0], Content::Text(text) if text.contains("Use a large-print edition.") && text.contains(wait.id.as_str()) && !text.contains(QUESTION))
    );
}

#[tokio::test]
async fn answer_dependent_question_defers_without_dispatch_and_returns_the_selected_answer() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let opened = fixture.open(&store).await;
    let ops = opened.operations();
    let tools = inventory(question_tool(&opened, QuestionStyle::AnswerDependent));
    assert!(matches!(
        fixture.master(tools).run(opened, input()).await.unwrap(),
        MasterOutcome::Suspended(_)
    ));
    assert_eq!(fixture.provider.requests.lock().unwrap().len(), 1);

    let view = ops.view();
    let wait = view.state.waits().values().next().unwrap();
    let request = read_question(wait).unwrap();
    assert!(
        view.operation(&request.operation)
            .unwrap()
            .attempts
            .is_empty()
    );
    assert!(
        prepare_answer(wait, QuestionAnswer::Skipped)
            .unwrap()
            .contribution
            .is_none()
    );
    fixture
        .answer(&store, wait, QuestionAnswer::Choice { index: 1 })
        .await;

    let resumed = fixture.resume(&store).await;
    let ops = resumed.operations();
    let tools = inventory(question_tool(&resumed, QuestionStyle::AnswerDependent));
    assert!(matches!(
        fixture.master(tools).run(resumed, input()).await.unwrap(),
        MasterOutcome::Settled(receipt) if receipt.outcome.status == OutcomeStatus::Succeeded
    ));
    let view = ops.view();
    let record = view.operation(&request.operation).unwrap();
    assert_eq!(record.attempts.len(), 1);
    let Some(OperationOutcome::Tool(outcome)) = record.outcome() else {
        panic!("expected one tool result");
    };
    assert_eq!(outcome.status, OutcomeStatus::Succeeded);
    assert_eq!(
        outcome.content,
        [agent_kit_core::messages::ResultContent::Text(
            "Print".into()
        )]
    );
    assert_eq!(fixture.provider.requests.lock().unwrap().len(), 2);
    assert_eq!(view.state.waits().len(), 1);
}

struct InterruptedQuestion {
    inner: QuestionTool,
    registered: bool,
    entered: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl Tool for InterruptedQuestion {
    fn definition(&self) -> &ToolDefinition {
        self.inner.definition()
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        self.inner.validate(arguments)
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            if self.registered {
                assert_eq!(
                    self.inner.invoke(invocation, context).await.status,
                    OutcomeStatus::Succeeded
                );
            }
            self.entered
                .lock()
                .unwrap()
                .take()
                .unwrap()
                .send(())
                .unwrap();
            std::future::pending().await
        })
    }
}

#[tokio::test]
async fn reopened_turn_reconciles_existing_registration_and_leaves_missing_evidence_uncertain() {
    for registered in [true, false] {
        let fixture = Fixture::new();
        let (operation, attempt, wait_count) = {
            let store = fixture.store();
            let mut opened = fixture.open(&store).await;
            let (entered, interrupted) = tokio::sync::oneshot::channel();
            let tools = inventory(InterruptedQuestion {
                inner: question_tool(&opened, QuestionStyle::Nonblocking),
                registered,
                entered: Mutex::new(Some(entered)),
            });
            let offers = tools.offers().unwrap();
            let tool_grants = BTreeMap::from([(offers[0].id.clone(), grants())]);
            let request = fixture
                .provider
                .prepare(InferenceRequest {
                    model: model(),
                    messages: input(),
                    tools: offers,
                    max_output_tokens: Some(1024),
                    extension: None,
                    reasoning: Default::default(),
                })
                .unwrap();
            let worker = tokio::spawn(async move {
                let step = opened
                    .step(StepPlan {
                        key: OperationKey::new("question-step").unwrap(),
                        request,
                        inference_grants: grants(),
                        tool_grants,
                        tools,
                    })
                    .await
                    .unwrap();
                (opened, step)
            });
            tokio::time::timeout(Duration::from_secs(2), interrupted)
                .await
                .unwrap()
                .unwrap();
            let session_view = store.inspect(session()).await.unwrap();
            store
                .control(ControlRequest {
                    id: change("pause"),
                    session: session(),
                    expected_revision: session_view.revision,
                    action: SessionControl::Turn {
                        turn: turn(),
                        expected: session_view.current.unwrap().controls.revision,
                        directive: ControlDirective::Pause,
                    },
                })
                .await
                .unwrap();
            let (mut opened, step) = tokio::time::timeout(Duration::from_secs(2), worker)
                .await
                .unwrap()
                .unwrap();
            assert!(matches!(
                &step.tools[0].outcome,
                InvokeOutcome::Complete(outcome) if outcome.status == OutcomeStatus::Uncertain
            ));
            let view = opened.view();
            let operation = view
                .state
                .operations()
                .values()
                .find(|operation| operation.is_uncertain())
                .unwrap();
            let wait_count = view.state.waits().len();
            assert_eq!(wait_count, usize::from(registered));
            let draft = SuspensionDraft {
                expected_control: view.state.controls().revision,
                expected_history: view.state.history().position(),
                checkpoint: None,
            };
            assert!(matches!(
                opened.try_suspend(draft).await.unwrap(),
                SuspendOutcome::Suspended(_)
            ));
            (
                operation.record.id.clone(),
                operation.attempts[0].id.clone(),
                wait_count,
            )
        };

        let store = fixture.reopen().await;
        let resumed = fixture.resume(&store).await;
        let tools = inventory(question_tool(&resumed, QuestionStyle::Nonblocking));
        let outcome = resumed
            .operations()
            .reconcile_tool(operation.clone(), tools)
            .await
            .unwrap();
        let view = resumed.view();
        assert_eq!(view.state.waits().len(), wait_count);
        let record = view.operation(&operation).unwrap();
        assert_eq!(record.attempts.len(), 1);
        assert_eq!(record.attempts[0].id, attempt);
        if registered {
            assert_eq!(outcome.status, OutcomeStatus::Succeeded);
            let receipt = read_registration(outcome.receipt.as_ref().unwrap()).unwrap();
            assert!(view.state.waits().contains_key(&receipt.wait));
            assert!(receipt.commit.record().binding.epoch < view.state.binding().epoch);
            store.verify(receipt.commit).await.unwrap();
        } else {
            assert_eq!(outcome.status, OutcomeStatus::Uncertain);
        }
    }
}
