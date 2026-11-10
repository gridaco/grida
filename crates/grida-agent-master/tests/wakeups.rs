use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::inference::{
    InferenceControl, InferenceOutcome, InferenceRequest, InferenceRun, InferenceStatus, Modality,
    ModelCapabilities, PreparedRequest, Provider, ProviderBinding, ProviderEvent,
};
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role, ToolArguments, ToolCall,
};
use agent_kit_core::tools::{Inventory, Tool};
use agent_kit_core::turn::{CommitReceipt, ControlDirective, OperationOutcome, TurnState};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, MessageId, ModelId, PrincipalId, ProviderId, Result,
    SchemaId, ScopeId, SessionId, ToolCallId, TurnId, WaitId,
};
use agent_kit_runtime::{
    AdmissionContext, ExecutionLimits, ExecutionServices, Runtime, ToolAdmission, ToolDecision,
    ToolGate, Turn,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ControlRequest, CreateSession, SessionControl, SessionStore,
    Submission, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent_master::wakeups::{
    Delivery, Resolution, WakeupDisposition, WakeupTool, defer_for_wakeup, prepare_delivery,
    read_disposition, read_wakeup,
};
use grida_agent_master::{Master, MasterAuthority, MasterConfig, MasterOutcome};
use serde_json::json;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const START: u64 = 10_000;
const DUE: u64 = 15_000;
const CONTINUATION: &str = "Check whether the render finished.";

#[derive(Default)]
struct FixtureProvider {
    requests: Mutex<Vec<InferenceRequest>>,
    two_calls: bool,
}

impl Provider for FixtureProvider {
    fn capabilities(&self, _: &ModelId) -> Result<ModelCapabilities> {
        Ok(ModelCapabilities {
            revision: BindingId::new("wake-fixture")?,
            input_modalities: [Modality::Text].into(),
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
                id: ToolCallId::new("request-wakeup")?,
                tool: request.request().tools[0].id.clone(),
                arguments: ToolArguments::Json(json!({
                    "delay_ms": DUE - START,
                    "prompt": CONTINUATION,
                    "reason": "Check the render",
                })),
            })
        } else {
            Content::Text("Continued the render task.".into())
        };
        let second = if self.two_calls
            && let Content::ToolCall(call) = &content
        {
            let mut call = call.clone();
            call.id = ToolCallId::new("another-wakeup")?;
            Some(Content::ToolCall(call))
        } else {
            None
        };
        let mut message = message(&format!("fixture-{index}"), Role::Assistant, content);
        message.content.extend(second);
        requests.push(request.request().clone());
        let outcome = InferenceOutcome {
            status: InferenceStatus::Completed,
            messages: vec![message],
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

struct Gate(Arc<AtomicU64>);

impl ToolGate for Gate {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            assert_eq!(admission.grants, grants());
            Ok(defer_for_wakeup(
                &admission,
                &context.operations,
                self.0.load(Ordering::SeqCst),
            )
            .await?
            .unwrap_or(ToolDecision::Permit))
        })
    }
}

impl AuthorityValidator for Gate {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            assert_eq!(request.selection, grants());
            Ok(())
        })
    }
}

struct Fixture {
    directory: tempfile::TempDir,
    provider: Arc<FixtureProvider>,
    clock: Arc<AtomicU64>,
}

impl Fixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700))
                .unwrap();
        }
        Self {
            directory,
            provider: Arc::default(),
            clock: Arc::new(AtomicU64::new(START)),
        }
    }

    fn store(&self) -> SqliteStore {
        SqliteStore::open(self.directory.path().join("sessions.sqlite")).unwrap()
    }

    async fn claim(&self, store: &SqliteStore, selection: TurnSelection, request: &str) -> Turn {
        let revision = store.inspect(session()).await.unwrap().revision;
        let ClaimOutcome::Acquired(claim) = store
            .claim(ClaimRequest {
                id: change(request),
                session: session(),
                expected_revision: revision,
                selection,
            })
            .await
            .unwrap()
        else {
            panic!("expected task ownership");
        };
        let gate = Arc::new(Gate(self.clock.clone()));
        let provider: Arc<dyn Provider> = self.provider.clone();
        Runtime::new(ExecutionServices {
            providers: BTreeMap::from([(provider_id(), provider)]),
            tools: Inventory::new().snapshot(&[]).unwrap(),
            authority: gate.clone(),
            gate,
            limits: ExecutionLimits {
                max_operations: 16,
                max_concurrent_inferences: 1,
                max_concurrent_tools: 1,
                max_output_bytes: 64 * 1024,
                operation_timeout: Duration::from_secs(5),
                observer_capacity: 16,
            },
        })
        .unwrap()
        .open(claim.lease)
        .await
        .unwrap()
        .turn
    }

    async fn start(&self, store: &SqliteStore) -> WaitId {
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
        let opened = self
            .claim(
                store,
                TurnSelection::New {
                    turn: turn(),
                    inputs: vec![change("input")],
                },
                "first-claim",
            )
            .await;
        let MasterOutcome::Suspended(receipt) = self.run(opened).await else {
            panic!("expected durable suspension");
        };
        store
            .verify(CommitReceipt::Suspended(receipt))
            .await
            .unwrap();
        let state = recorded(store).await;
        let wait = state.waits().values().next().unwrap();
        assert_eq!(state.waits().len(), 1);
        let scheduled = read_wakeup(wait).unwrap();
        assert_eq!(scheduled.due_at_ms, DUE);
        assert_eq!(scheduled.request.prompt, CONTINUATION);
        assert!(state.operations()[&scheduled.operation].attempts.is_empty());
        assert_eq!(self.provider.requests.lock().unwrap().len(), 1);
        wait.id.clone()
    }

    async fn resume(&self, store: &SqliteStore, request: &str) -> MasterOutcome {
        let view = store.inspect(session()).await.unwrap().current.unwrap();
        let selection = if view.controls.paused {
            TurnSelection::ResumePaused {
                turn: turn(),
                epoch: view.binding.epoch,
                position: view.position,
                control_revision: view.controls.revision,
            }
        } else {
            TurnSelection::Resume {
                turn: turn(),
                epoch: view.binding.epoch,
                position: view.position,
            }
        };
        self.run(self.claim(store, selection, request).await).await
    }

    async fn run(&self, turn: Turn) -> MasterOutcome {
        let tool = Arc::new(WakeupTool::new(turn.operations()).unwrap());
        let id = tool.definition().id.clone();
        let mut inventory = Inventory::new();
        inventory.insert(tool).unwrap();
        let authority = MasterAuthority {
            inference: grants(),
            tools: BTreeMap::from([(id.clone(), grants())]),
        };
        let master = Master::new(
            MasterConfig {
                model: ModelId::new("fixture-model").unwrap(),
                instructions: "Finish the task.".into(),
                max_steps: 4,
                max_output_tokens: Some(1024),
            },
            self.provider.clone(),
            inventory.snapshot(&[id]).unwrap(),
            authority,
        )
        .unwrap();
        master
            .run(
                turn,
                vec![message(
                    "input",
                    Role::User,
                    Content::Text("Finish the render.".into()),
                )],
            )
            .await
            .unwrap()
    }
}

fn grants() -> GrantSelection {
    GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("fixture").unwrap(),
            binding: BindingId::new("wakeup").unwrap(),
            scope: ScopeId::new("task").unwrap(),
        },
        grants: vec![],
    }
}

fn provider_id() -> ProviderId {
    ProviderId::new("fixture").unwrap()
}
fn session() -> SessionId {
    SessionId::new("scheduled-chat").unwrap()
}
fn turn() -> TurnId {
    TurnId::new("render-task").unwrap()
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

async fn recorded(store: &SqliteStore) -> TurnState {
    store
        .inspect_turn_with(session(), turn(), |state| Ok(state.clone()))
        .await
        .unwrap()
}

async fn delivery(store: &SqliteStore, resolution: Resolution) -> ControlRequest {
    ControlRequest {
        id: resolution.request,
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        action: SessionControl::Resolve {
            turn: turn(),
            expected: resolution.expected_control,
            wait: resolution.wait,
            answer: resolution.answer,
        },
    }
}

async fn control(store: &SqliteStore, directive: ControlDirective, request: &str) {
    let view = store.inspect(session()).await.unwrap();
    store
        .control(ControlRequest {
            id: change(request),
            session: session(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn(),
                expected: view.current.unwrap().controls.revision,
                directive,
            },
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn a_due_wakeup_resumes_the_same_task_once_after_restart() {
    let fixture = Fixture::new();
    let id = {
        let store = fixture.store();
        fixture.start(&store).await
    };
    let store = fixture.store();
    let state = recorded(&store).await;
    assert_eq!(
        prepare_delivery(&state, &id, WakeupDisposition::Due, DUE - 1).unwrap(),
        Delivery::NotDue
    );
    let Delivery::Resolve(ready) =
        prepare_delivery(&state, &id, WakeupDisposition::Due, DUE).unwrap()
    else {
        panic!("due wake-up must be deliverable");
    };
    let raced = delivery(&store, ready).await;
    control(&store, ControlDirective::Pause, "pause").await;
    assert!(store.control(raced).await.is_err());
    assert_eq!(
        prepare_delivery(&recorded(&store).await, &id, WakeupDisposition::Due, DUE).unwrap(),
        Delivery::Paused
    );

    fixture.clock.store(DUE + 500, Ordering::SeqCst);
    assert!(matches!(
        fixture.resume(&store, "explicit-unpause").await,
        MasterOutcome::Suspended(_)
    ));
    let state = recorded(&store).await;
    assert_eq!(read_wakeup(&state.waits()[&id]).unwrap().due_at_ms, DUE);
    assert_eq!(fixture.provider.requests.lock().unwrap().len(), 1);
    let Delivery::Resolve(ready) =
        prepare_delivery(&state, &id, WakeupDisposition::Due, DUE + 500).unwrap()
    else {
        panic!("expected one delivery");
    };
    assert!(ready.can_wake);
    let request = delivery(&store, ready).await;
    assert_eq!(
        store.control(request.clone()).await.unwrap(),
        store.control(request).await.unwrap()
    );
    assert!(
        matches!(fixture.resume(&store, "timer-resume").await, MasterOutcome::Settled(receipt) if receipt.outcome.status == OutcomeStatus::Succeeded)
    );
    let state = recorded(&store).await;
    let wake = read_wakeup(&state.waits()[&id]).unwrap();
    assert_eq!(state.operations()[&wake.operation].attempts.len(), 1);
    assert_eq!(
        prepare_delivery(&state, &id, WakeupDisposition::Due, DUE + 10_000).unwrap(),
        Delivery::AlreadyResolved
    );
    assert_eq!(fixture.provider.requests.lock().unwrap().len(), 2);
    let Some(OperationOutcome::Tool(outcome)) = state.operations()[&wake.operation].outcome()
    else {
        panic!("expected a wake-up result");
    };
    assert_eq!(outcome.receipt, state.waits()[&id].answer);
    assert!(format!("{:?}", outcome.content).contains(CONTINUATION));
}

#[tokio::test]
async fn cancellation_does_not_execute_the_scheduled_prompt_or_override_pause() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let id = fixture.start(&store).await;
    let Delivery::Resolve(cancel) = prepare_delivery(
        &recorded(&store).await,
        &id,
        WakeupDisposition::Cancelled,
        START + 1,
    )
    .unwrap() else {
        panic!("an unpaused wake-up can be cancelled");
    };
    assert!(!cancel.can_wake);
    control(&store, ControlDirective::Pause, "pause").await;
    let state = recorded(&store).await;
    let Delivery::Resolve(ready) =
        prepare_delivery(&state, &id, WakeupDisposition::Cancelled, START + 1).unwrap()
    else {
        panic!("a paused wake-up can be cancelled");
    };
    assert!(!ready.can_wake);
    store.control(delivery(&store, ready).await).await.unwrap();
    let state = recorded(&store).await;
    assert!(state.controls().paused);
    assert_eq!(
        read_disposition(&state.waits()[&id]).unwrap(),
        Some(WakeupDisposition::Cancelled)
    );
    assert!(prepare_delivery(&state, &id, WakeupDisposition::Due, DUE).is_err());
    assert_eq!(fixture.provider.requests.lock().unwrap().len(), 1);
    assert!(matches!(
        fixture.resume(&store, "resume-cancelled").await,
        MasterOutcome::Settled(_)
    ));
    let state = recorded(&store).await;
    let wake = read_wakeup(&state.waits()[&id]).unwrap();
    let Some(OperationOutcome::Tool(outcome)) = state.operations()[&wake.operation].outcome()
    else {
        panic!("expected a cancellation result");
    };
    assert!(!format!("{:?}", outcome.content).contains(CONTINUATION));
}

#[tokio::test]
async fn stopping_the_task_refuses_its_due_delivery() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let id = fixture.start(&store).await;
    control(&store, ControlDirective::Cancel, "stop").await;
    assert_eq!(
        prepare_delivery(&recorded(&store).await, &id, WakeupDisposition::Due, DUE)
            .unwrap_err()
            .code,
        "wakeup_unavailable"
    );
    assert_eq!(fixture.provider.requests.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn parallel_requests_can_register_only_one_wakeup_for_the_task() {
    let mut fixture = Fixture::new();
    Arc::get_mut(&mut fixture.provider).unwrap().two_calls = true;
    let store = fixture.store();
    fixture.start(&store).await;
    let state = recorded(&store).await;
    assert_eq!(state.waits().len(), 1);
    assert!(state.operations().values().any(|operation| {
        matches!(operation.outcome(), Some(OperationOutcome::Tool(outcome))
        if outcome.status == OutcomeStatus::Failed && outcome.content == [
            agent_kit_core::messages::ResultContent::Text("task_wakeup_limit".into())
        ])
    }));
}
