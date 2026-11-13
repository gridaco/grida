use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{
    Inventory, InventorySnapshot, Invocation, InvocationContext, RecoveryKind, Tool,
    ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{
    CommitReceipt, ControlDirective, OperationInput, OperationOutcome, TurnOutcome,
};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, OperationId,
    PrincipalId, Result, SchemaId, ScopeId, SessionId, ToolId, TurnId,
};
use agent_kit_runtime::{
    AdmissionContext, CompletionDraft, ExecutionLimits, ExecutionServices, FinishOutcome,
    InvokeOutcome, OperationKey, PlannedInvocation, Runtime, SuspendOutcome, SuspensionDraft,
    ToolAdmission, ToolDecision, ToolGate, Turn,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ControlRequest, CreateSession, SessionControl, SessionStore,
    Submission, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent_master::hooks::{
    CheckMode, CheckStatus, CompletionCheck, CompletionChecks, Decision,
};
use serde_json::json;
use std::collections::BTreeMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Notify;

struct FixtureTool {
    definition: ToolDefinition,
    log: PathBuf,
    entered: Arc<Notify>,
}

impl Tool for FixtureTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        if matches!(arguments, ToolArguments::Json(value) if value.is_object()) {
            Ok(())
        } else {
            Err(Error::new(ErrorKind::InvalidInput, "fixture_arguments"))
        }
    }

    fn invoke(
        &self,
        invocation: Invocation,
        _context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let ToolArguments::Json(args) = invocation.arguments() else {
                unreachable!()
            };
            let label = if invocation.definition().id.as_str() == "fixture_action" {
                "existing-effect"
            } else {
                assert_eq!(args["occurrence"]["event"], "before_completion");
                assert_eq!(args["occurrence"]["version"], 1);
                assert_eq!(args["occurrence"]["turn"], task().as_str());
                assert_eq!(
                    args["occurrence"]["proposal"].as_str().map(str::len),
                    Some(64)
                );
                args["check"]["id"].as_str().unwrap()
            };
            let mut log = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.log)
                .unwrap();
            writeln!(log, "{label}").unwrap();
            log.sync_data().unwrap();
            let reply = match label {
                "observer" => return ToolOutcome::failed("fixture_observer_error"),
                "required" => json!({"decision":"deny", "reason":"Verification did not pass."}),
                "invalid" => json!({"decision":"allow", "grant":"unreviewed"}),
                "interrupted" => {
                    self.entered.notify_one();
                    return std::future::pending().await;
                }
                _ => json!({"decision":"allow"}),
            };
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![],
                structured: Some(reply),
                receipt: None,
                truncated: false,
            }
        })
    }
}

struct FixtureAuthority;

impl AuthorityValidator for FixtureAuthority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            assert_eq!(request.selection, selection());
            Ok(())
        })
    }
}

impl ToolGate for FixtureAuthority {
    fn decide(&self, _: ToolAdmission, _: AdmissionContext) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async { Ok(ToolDecision::Permit) })
    }
}

struct Fixture {
    directory: tempfile::TempDir,
    entered: Arc<Notify>,
    timeout: Duration,
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
            entered: Arc::default(),
            timeout: Duration::from_secs(5),
        }
    }

    fn store(&self) -> SqliteStore {
        SqliteStore::open(self.directory.path().join("hooks.sqlite")).unwrap()
    }

    async fn reopen(&self) -> SqliteStore {
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                match SqliteStore::open(self.directory.path().join("hooks.sqlite")) {
                    Ok(store) => return store,
                    Err(error) if error.code == "store_already_owned" => {
                        tokio::time::sleep(Duration::from_millis(5)).await;
                    }
                    Err(error) => panic!("could not reopen the fixture store: {error}"),
                }
            }
        })
        .await
        .unwrap()
    }

    fn log_path(&self) -> PathBuf {
        self.directory.path().join("effects")
    }

    fn effects(&self) -> Vec<String> {
        std::fs::read_to_string(self.log_path())
            .unwrap()
            .lines()
            .map(str::to_owned)
            .collect()
    }

    async fn open(&self, store: &SqliteStore, checks: &CompletionChecks) -> Turn {
        let payload = Envelope::new(
            SchemaId::new("fixture.hooks").unwrap(),
            1,
            serde_json::to_vec(checks).unwrap(),
        )
        .unwrap();
        store
            .create(CreateSession {
                id: chat(),
                request: change("create"),
                configuration: payload.clone(),
            })
            .await
            .unwrap();
        store
            .submit(
                chat(),
                Submission {
                    id: change("input"),
                    payload,
                },
            )
            .await
            .unwrap();
        self.claim(
            store,
            TurnSelection::New {
                turn: task(),
                inputs: vec![change("input")],
            },
            "claim",
        )
        .await
    }

    async fn resume(&self, store: &SqliteStore) -> Turn {
        let view = store.inspect(chat()).await.unwrap().current.unwrap();
        let request = if view.controls.paused {
            TurnSelection::ResumePaused {
                turn: task(),
                epoch: view.binding.epoch,
                position: view.position,
                control_revision: view.controls.revision,
            }
        } else {
            TurnSelection::Resume {
                turn: task(),
                epoch: view.binding.epoch,
                position: view.position,
            }
        };
        self.claim(store, request, "resume").await
    }

    fn inventory(&self) -> InventorySnapshot {
        let mut inventory = Inventory::new();
        let ids = [tool_id("fixture_action"), tool_id("fixture_hook")];
        for id in &ids {
            inventory
                .insert(Arc::new(FixtureTool {
                    definition: ToolDefinition {
                        id: id.clone(),
                        version: 1,
                        description: "Reviewed fixture action.".into(),
                        input: InputFormat::Json(json!({"type":"object"})),
                        max_input_bytes: 32 * 1024,
                        max_output_bytes: 4 * 1024,
                        recovery: RecoveryKind::Unavailable,
                    },
                    log: self.log_path(),
                    entered: self.entered.clone(),
                }))
                .unwrap();
        }
        inventory.snapshot(&ids).unwrap()
    }

    async fn claim(&self, store: &SqliteStore, target: TurnSelection, request: &str) -> Turn {
        let revision = store.inspect(chat()).await.unwrap().revision;
        let ClaimOutcome::Acquired(claim) = store
            .claim(ClaimRequest {
                id: change(request),
                session: chat(),
                expected_revision: revision,
                selection: target,
            })
            .await
            .unwrap()
        else {
            panic!("expected a task owner");
        };
        Runtime::new(ExecutionServices {
            providers: BTreeMap::new(),
            tools: self.inventory(),
            authority: Arc::new(FixtureAuthority),
            gate: Arc::new(FixtureAuthority),
            limits: ExecutionLimits {
                max_operations: 16,
                max_concurrent_inferences: 1,
                max_concurrent_tools: 1,
                max_output_bytes: 4 * 1024,
                operation_timeout: self.timeout,
                observer_capacity: 16,
            },
        })
        .unwrap()
        .open(claim.lease)
        .await
        .unwrap()
        .turn
    }
}

fn selection() -> GrantSelection {
    GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("fixture").unwrap(),
            binding: BindingId::new("reviewed-hooks").unwrap(),
            scope: ScopeId::new("local").unwrap(),
        },
        grants: vec![],
    }
}

fn chat() -> SessionId {
    SessionId::new("hook-chat").unwrap()
}
fn task() -> TurnId {
    TurnId::new("review-task").unwrap()
}
fn change(value: &str) -> ChangeId {
    ChangeId::new(value).unwrap()
}
fn tool_id(value: &str) -> ToolId {
    ToolId::new(value).unwrap()
}

fn check(name: &str, mode: CheckMode) -> CompletionCheck {
    CompletionCheck {
        id: BindingId::new(name).unwrap(),
        revision: Fingerprint::of(&"approved-handler").unwrap(),
        handler: tool_id("fixture_hook"),
        mode,
    }
}

fn grants(checks: &[CompletionCheck]) -> BTreeMap<BindingId, GrantSelection> {
    checks
        .iter()
        .map(|check| (check.id.clone(), selection()))
        .collect()
}

async fn prior_effect(turn: &Turn) -> OperationId {
    let ops = turn.operations();
    let key = OperationKey::new("existing-effect").unwrap();
    let id = ops.operation_id(&key).unwrap();
    assert!(
        matches!(ops.invoke(key, PlannedInvocation { tool:tool_id("fixture_action"), arguments:ToolArguments::Json(json!({})), grants:selection() }).await.unwrap(), InvokeOutcome::Complete(result) if result.status == OutcomeStatus::Succeeded)
    );
    id
}

fn proposal(evidence: Vec<OperationId>) -> TurnOutcome {
    TurnOutcome {
        status: OutcomeStatus::Succeeded,
        account: None,
        evidence,
    }
}

async fn suspend(turn: &mut Turn) {
    let view = turn.view();
    assert!(matches!(
        turn.try_suspend(SuspensionDraft {
            expected_control: view.state.controls().revision,
            expected_history: view.state.history().position(),
            checkpoint: None,
        })
        .await
        .unwrap(),
        SuspendOutcome::Suspended(_)
    ));
}

async fn issue(store: &SqliteStore, directive: ControlDirective) {
    let view = store.inspect(chat()).await.unwrap();
    store
        .control(ControlRequest {
            id: change("interrupt"),
            session: chat(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: task(),
                expected: view.current.unwrap().controls.revision,
                directive,
            },
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn required_check_blocks_after_observer_failure_and_replays_only_recorded_effects() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let checks = vec![
        check("observer", CheckMode::Observe),
        check("required", CheckMode::Required),
        check("skipped", CheckMode::Required),
    ];
    let selected = CompletionChecks::new(checks.clone()).unwrap();
    let mut turn = fixture.open(&store, &selected).await;
    let effect = prior_effect(&turn).await;
    let proposal = proposal(vec![effect.clone()]);
    let review = selected
        .review(
            &turn.operations(),
            &turn.view(),
            &proposal,
            &fixture.inventory(),
            &grants(&checks),
        )
        .await
        .unwrap();
    assert_eq!(review.decision, Decision::Block);
    assert_eq!(
        review
            .checks
            .iter()
            .map(|result| result.status)
            .collect::<Vec<_>>(),
        [
            CheckStatus::Failed,
            CheckStatus::Denied,
            CheckStatus::Skipped
        ]
    );
    assert_eq!(
        fixture.effects(),
        ["existing-effect", "observer", "required"]
    );
    suspend(&mut turn).await;
    drop(turn);
    drop(store);

    let store = fixture.reopen().await;
    let captured = store.turn_submissions(chat(), task()).await.unwrap();
    let selected: CompletionChecks = serde_json::from_slice(captured[0].payload.bytes()).unwrap();
    let mut turn = fixture.resume(&store).await;
    let basis = turn.view();
    let replay = selected
        .review(
            &turn.operations(),
            &basis,
            &proposal,
            &Inventory::new().snapshot(&[]).unwrap(),
            &BTreeMap::new(),
        )
        .await
        .unwrap();
    assert_eq!(replay, review);
    assert_eq!(
        fixture.effects(),
        ["existing-effect", "observer", "required"]
    );
    let mut outcome = proposal;
    outcome.status = OutcomeStatus::Failed;
    outcome.evidence.extend(
        replay
            .checks
            .into_iter()
            .filter_map(|record| record.operation),
    );
    let FinishOutcome::Settled(receipt) = turn
        .try_finish(CompletionDraft {
            expected_control: basis.state.controls().revision,
            expected_history: basis.state.history().position(),
            outcome,
        })
        .await
        .unwrap()
    else {
        panic!("expected checked settlement");
    };
    assert_eq!(receipt.outcome.evidence[0], effect);
    store
        .verify(CommitReceipt::Settled(*receipt))
        .await
        .unwrap();
}

#[tokio::test]
async fn invalid_output_blocks_and_a_changed_revision_cannot_reuse_the_hook_identity() {
    let fixture = Fixture::new();
    let store = fixture.store();
    let mut definition = check("invalid", CheckMode::Required);
    let authority = grants(std::slice::from_ref(&definition));
    let selected = CompletionChecks::new(vec![definition.clone()]).unwrap();
    let turn = fixture.open(&store, &selected).await;
    let proposal = proposal(vec![]);
    let review = selected
        .review(
            &turn.operations(),
            &turn.view(),
            &proposal,
            &fixture.inventory(),
            &authority,
        )
        .await
        .unwrap();
    assert_eq!(review.decision, Decision::Block);
    assert_eq!(review.checks[0].status, CheckStatus::InvalidReply);
    definition.revision = Fingerprint::of(&"replacement-revision").unwrap();
    let changed = CompletionChecks::new(vec![definition]).unwrap();
    let error = changed
        .review(
            &turn.operations(),
            &turn.view(),
            &proposal,
            &fixture.inventory(),
            &authority,
        )
        .await
        .unwrap_err();
    assert_eq!(error.code, "hook_identity_changed");
    assert_eq!(fixture.effects(), ["invalid"]);
}

#[tokio::test]
async fn pause_and_stop_preserve_interrupted_hook_evidence_and_block_later_checks() {
    for directive in [ControlDirective::Pause, ControlDirective::Cancel] {
        let fixture = Fixture::new();
        let store = fixture.store();
        let checks = vec![
            check("interrupted", CheckMode::Required),
            check("skipped", CheckMode::Required),
        ];
        let selected = CompletionChecks::new(checks.clone()).unwrap();
        let turn = fixture.open(&store, &selected).await;
        let effect = prior_effect(&turn).await;
        let candidate = proposal(vec![effect.clone()]);
        let worker = tokio::spawn({
            let selected = selected.clone();
            let candidate = candidate.clone();
            let authority = grants(&checks);
            let inventory = fixture.inventory();
            async move {
                let review = selected
                    .review(
                        &turn.operations(),
                        &turn.view(),
                        &candidate,
                        &inventory,
                        &authority,
                    )
                    .await
                    .unwrap();
                (turn, review)
            }
        });
        tokio::time::timeout(Duration::from_secs(2), fixture.entered.notified())
            .await
            .unwrap();
        issue(&store, directive).await;
        let (mut turn, review) = tokio::time::timeout(Duration::from_secs(2), worker)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(review.decision, Decision::Reconsider);
        assert_eq!(review.checks[0].status, CheckStatus::Uncertain);
        let id = review.checks[0].operation.clone().unwrap();
        assert!(
            matches!(turn.view().operation(&id).unwrap().outcome(), Some(OperationOutcome::Tool(outcome)) if outcome.status == OutcomeStatus::Uncertain)
        );
        assert_eq!(fixture.effects(), ["existing-effect", "interrupted"]);
        if directive == ControlDirective::Pause {
            suspend(&mut turn).await;
            drop(turn);
            drop(store);
            let store = fixture.reopen().await;
            let turn = fixture.resume(&store).await;
            let resumed = selected
                .review(
                    &turn.operations(),
                    &turn.view(),
                    &candidate,
                    &fixture.inventory(),
                    &grants(&checks),
                )
                .await
                .unwrap();
            assert_eq!(resumed.decision, Decision::Block);
            assert_eq!(resumed.checks[0].operation, Some(id));
        } else {
            let basis = turn.view();
            let mut outcome = candidate;
            outcome.status = OutcomeStatus::Cancelled;
            outcome.evidence.push(id);
            assert!(
                selected
                    .review(
                        &turn.operations(),
                        &basis,
                        &outcome,
                        &fixture.inventory(),
                        &grants(&checks)
                    )
                    .await
                    .unwrap()
                    .checks
                    .is_empty()
            );
            assert!(
                matches!(turn.try_finish(CompletionDraft { expected_control:basis.state.controls().revision, expected_history:basis.state.history().position(), outcome }).await.unwrap(), FinishOutcome::Settled(receipt) if receipt.outcome.status == OutcomeStatus::Cancelled)
            );
        }
        assert_eq!(fixture.effects(), ["existing-effect", "interrupted"]);
    }
}

#[tokio::test]
async fn a_bounded_handler_timeout_never_permits_required_completion_or_retries_an_effect() {
    let mut fixture = Fixture::new();
    fixture.timeout = Duration::from_millis(250);
    let store = fixture.store();
    let checks = vec![check("interrupted", CheckMode::Required)];
    let selected = CompletionChecks::new(checks.clone()).unwrap();
    let turn = fixture.open(&store, &selected).await;
    let proposal = proposal(vec![]);
    let review = selected
        .review(
            &turn.operations(),
            &turn.view(),
            &proposal,
            &fixture.inventory(),
            &grants(&checks),
        )
        .await
        .unwrap();
    assert_eq!(review.decision, Decision::Block);
    assert_eq!(review.checks[0].status, CheckStatus::Uncertain);
    assert_eq!(
        selected
            .review(
                &turn.operations(),
                &turn.view(),
                &proposal,
                &fixture.inventory(),
                &grants(&checks)
            )
            .await
            .unwrap(),
        review
    );
    assert_eq!(fixture.effects(), ["interrupted"]);
}

#[tokio::test]
async fn a_completed_allow_decision_cannot_settle_over_new_input() {
    use agent_kit_core::MessageId;
    use agent_kit_core::history::HistoryRecord;
    use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};

    let fixture = Fixture::new();
    let store = fixture.store();
    let check = check("allowed", CheckMode::Required);
    let authority = grants(std::slice::from_ref(&check));
    let selected = CompletionChecks::new(vec![check]).unwrap();
    let mut turn = fixture.open(&store, &selected).await;
    let mut outcome = proposal(vec![]);
    let basis = turn.view();
    let review = selected
        .review(
            &turn.operations(),
            &basis,
            &outcome,
            &fixture.inventory(),
            &authority,
        )
        .await
        .unwrap();
    assert_eq!(review.decision, Decision::Allow);
    outcome.evidence.extend(
        review
            .checks
            .into_iter()
            .filter_map(|check| check.operation),
    );
    let view = store.inspect(chat()).await.unwrap();
    store
        .control(ControlRequest {
            id: change("steer"),
            session: chat(),
            expected_revision: view.revision,
            action: SessionControl::AppendHistory {
                turn: task(),
                expected: basis.state.controls().revision,
                expected_history: basis.state.history().position(),
                records: vec![HistoryRecord::Message(Message {
                    id: MessageId::new("newer-input").unwrap(),
                    role: Role::User,
                    phase: None,
                    content: vec![Content::Text(
                        "Check the current version before finishing.".into(),
                    )],
                    provenance: Provenance {
                        source: "fixture".into(),
                        kind: ProvenanceKind::Supplied,
                        fingerprint: None,
                    },
                })],
            },
        })
        .await
        .unwrap();
    assert!(matches!(turn.try_finish(CompletionDraft {
        expected_control:basis.state.controls().revision, expected_history:basis.state.history().position(), outcome,
    }).await.unwrap(), FinishOutcome::Continue(error) if error.kind == ErrorKind::Conflict));
    assert_eq!(fixture.effects(), ["allowed"]);
}

struct LifecycleFixtureTool {
    definition: ToolDefinition,
    log: PathBuf,
    entered: Arc<Notify>,
}

impl Tool for LifecycleFixtureTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        let ToolArguments::Json(value) = arguments else {
            panic!("expected hook envelope")
        };
        let _: grida_agent_master::lifecycle_hooks::HookInvocation =
            serde_json::from_value(value.clone()).unwrap();
        Ok(())
    }
    fn invoke(&self, invocation: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let ToolArguments::Json(value) = invocation.arguments() else {
                unreachable!()
            };
            let selected: grida_agent_master::lifecycle_hooks::HookInvocation =
                serde_json::from_value(value.clone()).unwrap();
            let mut log = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.log)
                .unwrap();
            writeln!(log, "{}", selected.hook.id).unwrap();
            log.sync_data().unwrap();
            if selected.hook.id.as_str() == "interrupted" {
                self.entered.notify_one();
                return std::future::pending().await;
            }
            let reply = match selected.hook.id.as_str() {
                "observe" => return ToolOutcome::failed("observer unavailable"),
                "deny" => json!({"decision":"deny","reason":"Required verification did not pass."}),
                "invalid" => json!({"decision":"allow","permissions":"all"}),
                _ => json!({"decision":"allow","context":"Inspected contextual data."}),
            };
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![],
                structured: Some(reply),
                receipt: None,
                truncated: false,
            }
        })
    }
}

fn lifecycle_inventory(fixture: &Fixture) -> InventorySnapshot {
    let mut inventory = Inventory::new();
    inventory
        .insert(Arc::new(LifecycleFixtureTool {
            definition: ToolDefinition {
                id: tool_id("lifecycle_handler"),
                version: 1,
                description: "Reviewed lifecycle fixture.".into(),
                input: InputFormat::Json(json!({"type":"object"})),
                max_input_bytes: 64 * 1024,
                max_output_bytes: 4096,
                recovery: RecoveryKind::Unavailable,
            },
            log: fixture.log_path(),
            entered: fixture.entered.clone(),
        }))
        .unwrap();
    inventory.snapshot(&[tool_id("lifecycle_handler")]).unwrap()
}

fn lifecycle_selection(
    id: &str,
    event: grida_agent_master::lifecycle_hooks::HookEvent,
    mode: CheckMode,
) -> grida_agent_master::lifecycle_hooks::LifecycleHook {
    grida_agent_master::lifecycle_hooks::LifecycleHook {
        id: BindingId::new(id).unwrap(),
        source: "trusted-user".into(),
        revision: Fingerprint::of(&(id, "reviewed")).unwrap(),
        event,
        tool: None,
        mode,
        handler: tool_id("lifecycle_handler"),
    }
}

#[tokio::test]
async fn lifecycle_context_is_ordered_attributed_and_reused_after_restart() {
    use grida_agent_master::lifecycle_hooks::*;
    let fixture = Fixture::new();
    let store = fixture.store();
    let mut turn = fixture
        .open(&store, &CompletionChecks::new(vec![]).unwrap())
        .await;
    let hooks = LifecycleHooks::new(vec![
        lifecycle_selection("observe", HookEvent::SessionStart, CheckMode::Observe),
        lifecycle_selection("context", HookEvent::SessionStart, CheckMode::Required),
    ])
    .unwrap();
    let grants = hooks
        .definitions()
        .iter()
        .map(|hook| (hook.id.clone(), selection()))
        .collect();
    let occurrence = HookOccurrence::new(
        &turn.view(),
        HookMoment::SessionStart {
            control_revision: turn.view().state.controls().revision,
        },
    );
    let review = hooks
        .review(
            &turn.operations(),
            occurrence.clone(),
            &lifecycle_inventory(&fixture),
            &grants,
        )
        .await
        .unwrap();
    assert_eq!(review.decision, HookDecision::Allow);
    assert_eq!(review.results[0].status, CheckStatus::Failed);
    assert_eq!(review.results[1].status, CheckStatus::Allowed);
    assert_eq!(fixture.effects(), ["observe", "context"]);
    let context = hooks.context(&turn.view());
    assert_eq!(context.len(), 1);
    assert_eq!(context[0]["source"], "trusted-user");
    assert_eq!(context[0]["trust"], "contextual_data");
    suspend(&mut turn).await;
    drop(turn);
    drop(store);
    let store = fixture.reopen().await;
    let turn = fixture.resume(&store).await;
    let review = hooks
        .review(
            &turn.operations(),
            occurrence,
            &lifecycle_inventory(&fixture),
            &grants,
        )
        .await
        .unwrap();
    assert_eq!(review.decision, HookDecision::Allow);
    assert_eq!(hooks.context(&turn.view()), context);
    assert_eq!(hooks.results(&turn.view()).len(), 2);
    assert_eq!(fixture.effects(), ["observe", "context"]);
}

#[tokio::test]
async fn an_after_tool_hook_preserves_the_effect_and_records_skipped_following_checks() {
    use grida_agent_master::lifecycle_hooks::*;
    let fixture = Fixture::new();
    let store = fixture.store();
    let turn = fixture
        .open(&store, &CompletionChecks::new(vec![]).unwrap())
        .await;
    let effect = prior_effect(&turn).await;
    let view = turn.view();
    let record = view.operation(&effect).unwrap();
    let OperationInput::Tool(invocation) = &record.record.input else {
        unreachable!()
    };
    let Some(OperationOutcome::Tool(outcome)) = record.outcome() else {
        unreachable!()
    };
    let original = outcome.clone();
    let mut denied = lifecycle_selection("deny", HookEvent::AfterTool, CheckMode::Required);
    denied.tool = Some(tool_id("fixture_action"));
    let hooks = LifecycleHooks::new(vec![
        denied,
        lifecycle_selection("later", HookEvent::AfterTool, CheckMode::Required),
    ])
    .unwrap();
    let grants = hooks
        .definitions()
        .iter()
        .map(|hook| (hook.id.clone(), selection()))
        .collect();
    let review = hooks
        .review(
            &turn.operations(),
            HookOccurrence::new(
                &view,
                HookMoment::AfterTool {
                    operation: effect.clone(),
                    invocation: invocation.clone(),
                    outcome: original.clone(),
                },
            ),
            &lifecycle_inventory(&fixture),
            &grants,
        )
        .await
        .unwrap();
    assert_eq!(review.decision, HookDecision::Block);
    assert_eq!(review.results.len(), 2);
    assert_eq!(review.results[0].status, CheckStatus::Denied);
    assert_eq!(review.results[1].status, CheckStatus::Skipped);
    assert!(review.results[1].operation.is_none());
    assert!(
        matches!(turn.view().operation(&effect).unwrap().outcome(),Some(OperationOutcome::Tool(outcome)) if outcome==&original)
    );
    assert_eq!(fixture.effects(), ["existing-effect", "deny"]);
}

#[test]
fn lifecycle_configuration_and_reply_authority_are_narrow() {
    use grida_agent_master::lifecycle_hooks::*;
    let first = lifecycle_selection("same", HookEvent::BeforeTool, CheckMode::Required);
    assert!(LifecycleHooks::new(vec![first.clone(), first]).is_err());
    let mut invalid = lifecycle_selection("matcher", HookEvent::BeforeInput, CheckMode::Required);
    invalid.tool = Some(tool_id("read_file"));
    assert!(LifecycleHooks::new(vec![invalid]).is_err());
    assert!(
        serde_json::from_value::<HookReply>(json!({"decision":"allow","grant":"all"})).is_err()
    );
}

#[tokio::test]
async fn lifecycle_interruption_preserves_unknown_outcomes_without_replaying_after_restart() {
    use grida_agent_master::lifecycle_hooks::*;
    for directive in [ControlDirective::Pause, ControlDirective::Cancel] {
        let fixture = Fixture::new();
        let store = fixture.store();
        let turn = fixture
            .open(&store, &CompletionChecks::new(vec![]).unwrap())
            .await;
        let effect = prior_effect(&turn).await;
        let selected = LifecycleHooks::new(vec![
            lifecycle_selection(
                "interrupted",
                HookEvent::BeforeCompletion,
                CheckMode::Required,
            ),
            lifecycle_selection("later", HookEvent::BeforeCompletion, CheckMode::Required),
        ])
        .unwrap();
        let grants = selected
            .definitions()
            .iter()
            .map(|hook| (hook.id.clone(), selection()))
            .collect::<BTreeMap<_, _>>();
        let occurrence = HookOccurrence::new(
            &turn.view(),
            HookMoment::BeforeCompletion {
                proposal: proposal(vec![effect.clone()]),
            },
        );
        let worker = tokio::spawn({
            let selected = selected.clone();
            let occurrence = occurrence.clone();
            let inventory = lifecycle_inventory(&fixture);
            let grants = grants.clone();
            async move {
                let review = selected
                    .review(&turn.operations(), occurrence, &inventory, &grants)
                    .await
                    .unwrap();
                (turn, review)
            }
        });
        tokio::time::timeout(Duration::from_secs(2), fixture.entered.notified())
            .await
            .unwrap();
        issue(&store, directive).await;
        let (mut turn, review) = tokio::time::timeout(Duration::from_secs(2), worker)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(review.decision, HookDecision::Reconsider);
        assert_eq!(review.results[0].status, CheckStatus::Uncertain);
        assert_eq!(fixture.effects(), ["existing-effect", "interrupted"]);
        if directive == ControlDirective::Pause {
            suspend(&mut turn).await;
            drop(turn);
            drop(store);
            let store = fixture.reopen().await;
            let turn = fixture.resume(&store).await;
            let review = selected
                .review(
                    &turn.operations(),
                    occurrence,
                    &lifecycle_inventory(&fixture),
                    &grants,
                )
                .await
                .unwrap();
            assert_eq!(review.decision, HookDecision::Uncertain);
            assert_eq!(review.results[1].status, CheckStatus::Skipped);
            assert_eq!(fixture.effects(), ["existing-effect", "interrupted"]);
            assert!(
                matches!(turn.view().operation(&effect).unwrap().outcome(),Some(OperationOutcome::Tool(outcome)) if outcome.status==OutcomeStatus::Succeeded)
            );
        }
    }
}
