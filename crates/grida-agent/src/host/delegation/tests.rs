//! GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-014 — delegated work keeps its accepted authority.

use super::*;
use crate::permissions::{AccessRule, DirectoryAccess, PermissionProfile};
use crate::workspace::{DirectorySpec, ProtectedRoots, WorkspaceSnapshot};
use agent_kit_core::AttemptId;
use agent_kit_core::inference::ReasoningEffort;
use agent_kit_core::turn::{JournalAction, JournalChange, OperationRecord};
use agent_kit_sessions::ClaimedTurn;

struct RecordedTool(ToolDefinition);
impl Tool for RecordedTool {
    fn definition(&self) -> &ToolDefinition {
        &self.0
    }
    fn validate(&self, _: &ToolArguments) -> Result<()> {
        Ok(())
    }
    fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        panic!("the test owns the admitted source operation")
    }
}

fn options() -> ProviderOptions {
    ProviderOptions {
        endpoint: "http://127.0.0.1:1/v1".into(),
        model: ModelId::new("fixture").unwrap(),
        max_output_tokens: 1024,
        credential_env: None,
        protocol: ProviderProtocol::OpenAiCompatible,
        credential_home: None,
        compatible_output_limit_field: None,
        llama_cpp_input_count: false,
        reasoning: true,
    }
}

fn open(root: &Path) -> Host {
    let project = root.join("project");
    std::fs::create_dir_all(&project).unwrap();
    let directory = BindingId::new("primary").unwrap();
    let workspace = Arc::new(
        WorkspaceSnapshot::capture(
            BindingId::new("workspace").unwrap(),
            1,
            vec![DirectorySpec {
                id: directory.clone(),
                name: "Project".into(),
                path: project,
                generation: BindingId::new("generation").unwrap(),
            }],
            Some(directory.clone()),
            &ProtectedRoots::new(vec![root.join("state")]).unwrap(),
        )
        .unwrap(),
    );
    let profile = PermissionProfile::new(
        BindingId::new("permission-profile").unwrap(),
        workspace,
        BTreeMap::from([(
            directory,
            DirectoryAccess {
                read: AccessRule::Allow,
                write: AccessRule::Allow,
                ..Default::default()
            },
        )]),
        vec![root.join("state")],
        None,
    )
    .unwrap();
    Host::open_supervised(
        &root.join("state"),
        options(),
        crate::SupervisedProvider::default(),
    )
    .unwrap()
    .with_subagents()
    .with_permission_profile(Arc::new(profile))
}

async fn parent(host: &Host, root: &Path, ultra: bool) -> (ClaimedTurn, StoredPrompt) {
    let project = root.join("project").canonicalize().unwrap();
    std::fs::write(
        project.join("AGENTS.md"),
        "Keep the accepted project rules.",
    )
    .unwrap();
    let session = host.new_session(project).await.unwrap();
    let view = host.store.inspect(session.clone()).await.unwrap();
    let effort = if ultra {
        host.capture_effort(EffortPreset::Ultra).unwrap()
    } else {
        None
    };
    let input = host
        .capture_input(
            &view,
            change_id().unwrap(),
            vec![PromptPart::Text {
                text: "Coordinate independent general tasks.".into(),
            }],
            SubmissionPolicy {
                request_options: Default::default(),
                selection_revision: None,
                selection_goal: false,
                questions: true,
                question_batches: false,
                allow_wakeups: false,
                allow_library_selection: false,
                allow_host_tools: false,
                desktop_image_generation: None,
                allow_image_placement: false,
                editor_endpoint: None,
                editor_presentation: false,
                editor_browser_tools: false,
                editor_svg_target: None,
                editor_tool_context_id: None,
                operating_regime: OperatingRegime::Act,
                subagent: None,
                effort,
                reasoning: Some(if ultra {
                    ReasoningEffort::XHigh
                } else {
                    ReasoningEffort::High
                }),
                spending: None,
            },
        )
        .await
        .unwrap();
    let stored = decode_input(&input).unwrap();
    let id = input.id.clone();
    host.store.submit(session.clone(), input).await.unwrap();
    let view = host.store.inspect(session.clone()).await.unwrap();
    let ClaimOutcome::Acquired(owner) = host
        .store
        .claim(
            new_claim(
                session,
                TurnId::new("parent-turn").unwrap(),
                view.revision,
                vec![id],
            )
            .unwrap(),
        )
        .await
        .unwrap()
    else {
        panic!("expected parent owner")
    };
    (owner, stored)
}

async fn source(owner: &ClaimedTurn, index: usize) -> OperationClaimSource {
    tool_source(owner, SPAWN, index, json!({"name":format!("Worker {index}"),"instructions":format!("Complete independent task {index} and return evidence.")})).await
}

async fn tool_source(
    owner: &ClaimedTurn,
    tool: &str,
    index: usize,
    arguments: Value,
) -> OperationClaimSource {
    let definition = definition(tool).unwrap();
    let mut inventory = Inventory::new();
    inventory
        .insert(Arc::new(RecordedTool(definition.clone())))
        .unwrap();
    let operation = OperationId::new(format!("{tool}-{index}")).unwrap();
    let attempt = AttemptId::new(format!("{tool}-attempt-{index}")).unwrap();
    let invocation = inventory
        .snapshot(std::slice::from_ref(&definition.id))
        .unwrap()
        .prepare(
            operation.clone(),
            &definition.id,
            ToolArguments::Json(arguments),
        )
        .unwrap()
        .invocation()
        .clone();
    let action = invocation.fingerprint();
    let state = owner.lease.journal().load().await.unwrap();
    owner
        .lease
        .journal()
        .commit(
            JournalChange::new(
                change_id().unwrap(),
                state.binding().clone(),
                state.position(),
                state.controls().revision,
                vec![
                    JournalAction::prepare(OperationRecord {
                        id: operation.clone(),
                        input: OperationInput::Tool(invocation),
                        origin: None,
                        source_call: None,
                        grants: grant(state.binding(), tool).unwrap(),
                    }),
                    JournalAction::StartAttempt {
                        operation: operation.clone(),
                        attempt: attempt.clone(),
                    },
                ],
            )
            .unwrap(),
        )
        .await
        .unwrap();
    OperationClaimSource {
        binding: state.binding().clone(),
        control: state.controls().revision,
        operation,
        attempt,
        action,
    }
}

fn control(view: &SessionView) -> TurnControl {
    let current = view.current.as_ref().unwrap();
    TurnControl {
        request: change_id().unwrap(),
        session: view.session.clone(),
        turn: current.binding.turn.clone(),
        expected_session: view.revision,
        expected_control: current.controls.revision,
    }
}

async fn message_worker(
    host: &Host,
    owner: &ClaimedTurn,
    stored: &StoredPrompt,
) -> (SessionId, ClaimedTurn) {
    let request = host
        .worker_claim(
            source(owner, 0).await,
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child")
    };
    (child, child_owner)
}

#[tokio::test]
async fn worker_information_is_appended_once_to_the_active_assignment_and_survives_reopen() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let (child, child_owner) = message_worker(&host, &owner, &stored).await;
    let text = "Use the clarified acceptance criterion.";
    let source = tool_source(&owner, SEND, 0, json!({"child":child,"text":text})).await;
    assert_eq!(
        host.send_worker_message(source.clone(), child.clone(), text.into(), true)
            .await
            .unwrap_err()
            .code,
        "worker_message_not_delivered"
    );
    let (first, duplicate) = tokio::join!(
        host.send_worker_message(source.clone(), child.clone(), text.into(), false),
        host.send_worker_message(source.clone(), child.clone(), text.into(), false),
    );
    let first = first.unwrap();
    assert_eq!(first, duplicate.unwrap());
    assert_eq!(first["delivered"]["status"], "appended");
    assert_eq!(first["delivered"]["turn"], TURN);
    assert_eq!(first["delivered"]["history_position"], 1);
    let state = child_owner.lease.journal().load().await.unwrap();
    assert_eq!(state.history().records().len(), 1);
    let HistoryRecord::Message(message) = &state.history().records()[0];
    assert_eq!(message.role, Role::User);
    assert_eq!(message.content, vec![Content::Text(text.into())]);
    assert!(
        host.store
            .inspect(child.clone())
            .await
            .unwrap()
            .queued
            .is_empty()
    );
    assert_eq!(
        host.store
            .turn_submissions(child.clone(), TurnId::new(TURN).unwrap())
            .await
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        host.send_worker_message(source.clone(), child.clone(), "changed text".into(), false)
            .await
            .unwrap_err()
            .code,
        "worker_message_source_changed"
    );
    let view = host.store.inspect(child.clone()).await.unwrap();
    host.pause(control(&view)).await.unwrap();
    assert_eq!(
        host.send_worker_message(source.clone(), child.clone(), text.into(), true)
            .await
            .unwrap(),
        first
    );
    settle_process_worker_cancelled(&child_owner).await;
    assert_eq!(
        host.send_worker_message(source.clone(), child.clone(), text.into(), true)
            .await
            .unwrap(),
        first
    );
    drop(child_owner);
    drop(owner);
    host.shutdown().await.unwrap();
    drop(host);
    let reopened = open(root.path());
    assert_eq!(
        reopened
            .send_worker_message(source, child.clone(), text.into(), true)
            .await
            .unwrap(),
        first
    );
    assert!(reopened.work.lock().await.ready.is_empty());
    assert!(
        reopened
            .store
            .inspect(child)
            .await
            .unwrap()
            .queued
            .is_empty()
    );
    reopened.shutdown().await.unwrap();
}

#[tokio::test]
async fn new_worker_information_refuses_paused_cancelled_settled_and_unowned_assignments() {
    for state in [
        "parent_pause",
        "parent_cancel",
        "child_pause",
        "child_cancel",
        "child_settled",
        "unowned",
    ] {
        let root = tempfile::tempdir().unwrap();
        let host = open(root.path());
        let (owner, stored) = parent(&host, root.path(), false).await;
        let (child, child_owner) = message_worker(&host, &owner, &stored).await;
        let text = "Further information.";
        let mut source = tool_source(&owner, SEND, 0, json!({"child":child,"text":text})).await;
        match state {
            "parent_pause" | "child_pause" => {
                let session = if state == "parent_pause" {
                    owner.lease.binding().session.clone()
                } else {
                    child.clone()
                };
                let view = host.store.inspect(session).await.unwrap();
                host.pause(control(&view)).await.unwrap();
            }
            "parent_cancel" | "child_cancel" => {
                let (session, turn) = if state == "parent_cancel" {
                    (
                        owner.lease.binding().session.clone(),
                        owner.lease.binding().turn.clone(),
                    )
                } else {
                    (child.clone(), TurnId::new(TURN).unwrap())
                };
                host.cancel(session, turn).await.unwrap();
            }
            "child_settled" => settle_process_worker_cancelled(&child_owner).await,
            "unowned" => source.binding.turn = TurnId::new("foreign-turn").unwrap(),
            _ => unreachable!(),
        }
        assert!(
            host.send_worker_message(source, child.clone(), text.into(), false)
                .await
                .is_err(),
            "{state}"
        );
        assert!(
            child_owner
                .lease
                .journal()
                .load()
                .await
                .unwrap()
                .history()
                .records()
                .is_empty(),
            "{state}"
        );
        assert!(
            host.store.inspect(child).await.unwrap().queued.is_empty(),
            "{state}"
        );
        drop(child_owner);
        drop(owner);
        host.shutdown().await.unwrap();
    }
}

#[tokio::test]
async fn worker_information_has_a_cumulative_assignment_bound() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let (child, child_owner) = message_worker(&host, &owner, &stored).await;
    for index in 0..=MAX_MESSAGES {
        let text = format!("Information {index}");
        let source = tool_source(&owner, SEND, index, json!({"child":child,"text":text})).await;
        let result = host
            .send_worker_message(source, child.clone(), text, false)
            .await;
        if index < MAX_MESSAGES {
            assert!(result.is_ok());
        } else {
            assert_eq!(result.unwrap_err().code, "worker_message_limit");
        }
    }
    assert_eq!(
        child_owner
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .history()
            .records()
            .len(),
        MAX_MESSAGES
    );
    assert!(host.store.inspect(child).await.unwrap().queued.is_empty());
    drop(child_owner);
    drop(owner);
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn an_admitted_message_recovery_observes_its_receipt_even_if_its_context_is_cancelled() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let (child, child_owner) = message_worker(&host, &owner, &stored).await;
    let text = "Already delivered information.";
    let source = tool_source(&owner, SEND, 0, json!({"child":child,"text":text})).await;
    let undelivered = tool_source(
        &owner,
        SEND,
        1,
        json!({"child":child,"text":"Not delivered."}),
    )
    .await;
    let receipt = host
        .send_worker_message(source.clone(), child.clone(), text.into(), false)
        .await
        .unwrap();
    let state = owner.lease.journal().load().await.unwrap();
    let invocation = |source: &OperationClaimSource| {
        let OperationInput::Tool(invocation) = &state.operations()[&source.operation].record.input
        else {
            panic!("expected tool")
        };
        invocation.clone()
    };
    let delivered_invocation = invocation(&source);
    let undelivered_invocation = invocation(&undelivered);
    let opened = host
        .execution()
        .unwrap()
        .runtime
        .open(owner.lease)
        .await
        .unwrap();
    let tool = WorkerTool {
        access: Access::bind(&host, &source.binding, stored.delegation.unwrap()).unwrap(),
        operations: opened.turn.operations(),
        definition: definition(SEND).unwrap(),
    };
    let cancellation = agent_kit_core::CancellationToken::new();
    cancellation.cancel();
    let context = |attempt| InvocationContext {
        attempt,
        cancellation: cancellation.clone(),
        deadline: None,
        max_output_bytes: 256 * 1024,
    };
    let recovery = |invocation| InvocationRecovery {
        invocation,
        checkpoint: None,
        receipts: Vec::new(),
    };
    let result = tool
        .recover(recovery(delivered_invocation), context(source.attempt))
        .await;
    assert_eq!(result.status, OutcomeStatus::Succeeded);
    assert_eq!(result.structured, Some(receipt));
    let missing = tool
        .recover(
            recovery(undelivered_invocation),
            context(undelivered.attempt),
        )
        .await;
    assert_eq!(missing.status, OutcomeStatus::Failed);
    assert_eq!(
        child_owner
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .history()
            .records()
            .len(),
        1
    );
    assert!(host.store.inspect(child).await.unwrap().queued.is_empty());
    drop(tool);
    drop(opened);
    drop(child_owner);
    host.shutdown().await.unwrap();
}

async fn settle_with_cleanup(
    host: &Host,
    owner: ClaimedTurn,
    mut account: grida_agent_master::Account,
) {
    let binding = owner.lease.binding().clone();
    let completion = completion_checks::CompletionAccess::bind(
        host,
        &binding,
        OperatingRegime::Act,
        None,
        None,
        true,
    )
    .unwrap();
    let execution = host.execution().unwrap();
    let authority = permissions::ToolAuthority::bind(
        execution.authorization.clone(),
        None,
        permissions::MaterialTools {
            image: None,
            file: None,
            skills: None,
        },
        None,
        permissions::HookTools {
            completion: Some(completion.clone()),
            before_tool: None,
            lifecycle: None,
        },
        Vec::new(),
        permissions::DelegationTools {
            review: None,
            workers: None,
        },
    )
    .unwrap();
    let runtime = execution
        .runtime
        .with_authorization(authority.clone(), authority);
    let mut opened = runtime.open(owner.lease).await.unwrap();
    let operations = opened.turn.operations();
    let proposal = agent_kit_core::turn::TurnOutcome {
        status: OutcomeStatus::Succeeded,
        account: Some(encode("grida.agent.account", 1, &account).unwrap()),
        evidence: Vec::new(),
    };
    let review = completion_checks::worker_checks(None)
        .unwrap()
        .review(
            &operations,
            &operations.view(),
            &proposal,
            &completion.inventory().unwrap(),
            &completion.grants(),
        )
        .await
        .unwrap();
    assert_eq!(review.decision, grida_agent_master::hooks::Decision::Allow);
    account.completion_checks = review.checks;
    let view = opened.turn.view();
    let finished = opened
        .turn
        .try_finish(agent_kit_runtime::CompletionDraft {
            expected_control: view.state.controls().revision,
            expected_history: view.state.history().position(),
            outcome: agent_kit_core::turn::TurnOutcome {
                status: OutcomeStatus::Succeeded,
                account: Some(encode("grida.agent.account", 1, &account).unwrap()),
                evidence: view.state.operations().keys().cloned().collect(),
            },
        })
        .await
        .unwrap();
    assert!(matches!(
        finished,
        agent_kit_runtime::FinishOutcome::Settled(_)
    ));
    drop(opened);
}

#[tokio::test]
async fn ordinary_delegation_is_independent_of_ultra_but_cannot_mint_goal_or_nested_allowance() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (_owner, stored) = parent(&host, root.path(), false).await;
    assert!(stored.effort.is_none());
    let policy = stored.delegation.unwrap();
    assert_eq!(policy.max_children(), 8);
    assert_eq!(policy.child_generation_steps(), 8);
    assert_eq!(policy.reserved_child_generation_steps(), 64);
    assert!(
        host.capture_delegation(OperatingRegime::Plan, false, false, false)
            .unwrap()
            .is_none()
    );
    assert!(
        host.capture_delegation(OperatingRegime::Act, true, false, false)
            .unwrap()
            .is_none()
    );
    assert!(
        host.capture_delegation(OperatingRegime::Act, false, true, false)
            .unwrap()
            .is_none()
    );
    assert!(
        host.capture_delegation(OperatingRegime::Act, false, false, true)
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn eight_operation_owned_workers_are_bounded_and_replaying_admission_creates_no_duplicate() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let policy = stored.delegation.unwrap();
    let mut children = Vec::new();
    for index in 0..8 {
        let source = source(&owner, index).await;
        let request = host
            .worker_claim(
                source.clone(),
                &format!("Worker {index}"),
                &format!("Complete independent task {index} and return evidence."),
                &policy,
            )
            .await
            .unwrap();
        let child = request.claim.session.clone();
        let ClaimOutcome::Acquired(child_owner) = host
            .store
            .claim_from_operation(request.clone())
            .await
            .unwrap()
        else {
            panic!("expected child owner")
        };
        let before = host.store.inspect(child.clone()).await.unwrap();
        assert!(!matches!(
            host.store.claim_from_operation(request).await.unwrap(),
            ClaimOutcome::Acquired(_)
        ));
        let after = host.store.inspect(child.clone()).await.unwrap();
        assert_eq!(before.revision, after.revision);
        let receipt = host
            .worker_receipt(&source.binding, &child, None)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(receipt["assignment"]["child"], json!(child));
        assert_eq!(receipt["assignment"]["input"], json!(INPUT));
        assert_eq!(receipt["assignment"]["turn"], json!(TURN));
        assert_eq!(receipt["max_generation_steps"], json!(8));
        children.push(child_owner);
    }
    let ninth = source(&owner, 8).await;
    let error = host
        .worker_claim(
            ninth,
            "Worker 8",
            "Complete independent task 8 and return evidence.",
            &policy,
        )
        .await
        .err()
        .unwrap();
    assert_eq!(error.code, "worker_allocation_exhausted");
    assert_eq!(
        host.worker_ids(owner.lease.binding()).await.unwrap().len(),
        8
    );
    drop(children);
}

#[tokio::test]
async fn cancellation_before_atomic_admission_refuses_the_child_even_after_a_request_was_built() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    host.cancel(source.binding.session.clone(), source.binding.turn.clone())
        .await
        .unwrap();
    assert!(host.store.claim_from_operation(request).await.is_err());
    assert_eq!(
        host.store.inspect(child).await.unwrap_err().code,
        "session_missing"
    );
}

#[tokio::test]
async fn workers_keep_captured_model_reasoning_permissions_and_project_material_without_nested_policy()
 {
    for ultra in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let host = open(root.path());
        let (owner, stored) = parent(&host, root.path(), ultra).await;
        assert_eq!(stored.effort.is_some(), ultra);
        let source = source(&owner, 0).await;
        let request = host
            .worker_claim(
                source,
                "Worker 0",
                "Complete independent task 0 and return evidence.",
                stored.delegation.as_ref().unwrap(),
            )
            .await
            .unwrap();
        let worker: StoredPrompt = decode_input(&request.input).unwrap();
        assert_eq!(worker.model, stored.model);
        assert_eq!(worker.reasoning, stored.reasoning);
        assert_eq!(
            worker.reasoning,
            Some(if ultra {
                ReasoningEffort::XHigh
            } else {
                ReasoningEffort::High
            })
        );
        assert_eq!(
            serde_json::to_value(&worker.authority).unwrap(),
            serde_json::to_value(&stored.authority).unwrap()
        );
        assert_eq!(worker.permission_capture, stored.permission_capture);
        assert!(worker.permission_capture.is_some());
        assert_eq!(
            serde_json::to_value(&worker.guidance).unwrap(),
            serde_json::to_value(&stored.guidance).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&worker.skills).unwrap(),
            serde_json::to_value(&stored.skills).unwrap()
        );
        assert!(worker.effort.is_none());
        assert!(worker.delegation.is_none());
        assert!(worker.worker.is_some());
        let configuration = decode_session_configuration(&request.create.configuration).unwrap();
        let prepared = host
            .prepare_input(
                host.execution().unwrap(),
                &request.claim.session,
                &configuration.cwd,
                &request.input,
                configuration.subagent.as_ref(),
                false,
                InputAuthority::RequireCaptured,
            )
            .unwrap();
        assert_eq!(prepared.config.reasoning, worker.reasoning);
        assert_eq!(prepared.config.model, worker.model.unwrap());
        assert_eq!(prepared.config.max_steps, 8);
    }
}

#[tokio::test]
async fn a_childs_independent_pause_survives_parent_pause_and_resume() {
    use agent_kit_core::turn::ControlDirective;
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(_child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child owner")
    };
    let view = host.store.inspect(child.clone()).await.unwrap();
    host.pause(control(&view)).await.unwrap();
    let view = host
        .store
        .inspect(source.binding.session.clone())
        .await
        .unwrap();
    host.pause(control(&view)).await.unwrap();
    let view = host.store.inspect(child.clone()).await.unwrap();
    let profile = session_configuration(&view).unwrap().subagent.unwrap();
    assert!(
        profile
            .sponsored_pause(&view.driver_state)
            .unwrap()
            .held_by_ancestor()
    );
    let view = host
        .store
        .inspect(source.binding.session.clone())
        .await
        .unwrap();
    let turn = view.current.as_ref().unwrap();
    host.store
        .control(ControlRequest {
            id: change_id().unwrap(),
            session: view.session.clone(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn.binding.turn.clone(),
                expected: turn.controls.revision,
                directive: ControlDirective::Resume,
            },
        })
        .await
        .unwrap();
    host.resume_workers(&source.binding.session, &source.binding.turn)
        .await
        .unwrap();
    let view = host.store.inspect(child).await.unwrap();
    let pause = profile.sponsored_pause(&view.driver_state).unwrap();
    assert!(!pause.held_by_ancestor());
    assert!(pause.effective());
    assert!(view.current.unwrap().controls.paused);
    assert!(host.work.lock().await.ready.is_empty());
}

#[tokio::test]
async fn a_committed_worker_admission_receipt_survives_owner_loss_and_reopen_without_starting_work()
{
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child owner")
    };
    let before = host
        .worker_receipt(&source.binding, &child, None)
        .await
        .unwrap()
        .unwrap();
    drop(child_owner);
    drop(owner);
    host.shutdown().await.unwrap();
    drop(host);
    let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
    let host = loop {
        match Host::open_supervised(
            &root.path().join("state"),
            options(),
            crate::SupervisedProvider::default(),
        ) {
            Ok(host) => break host.with_subagents(),
            Err(error)
                if error.code == "store_already_owned"
                    && tokio::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(5)).await
            }
            Err(error) => panic!("failed to reopen: {error}"),
        }
    };
    let after = host
        .worker_receipt(&source.binding, &child, None)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(before, after);
    assert!(host.work.lock().await.active.is_empty());
    assert!(host.work.lock().await.ready.is_empty());
}

#[tokio::test]
async fn an_assignment_cannot_replace_the_recorded_spawn_action_or_arguments() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let mut source = source(&owner, 0).await;
    let policy = stored.delegation.as_ref().unwrap();
    assert_eq!(
        host.worker_claim(
            source.clone(),
            "Worker 0",
            "Different instructions.",
            policy
        )
        .await
        .err()
        .unwrap()
        .code,
        "worker_source_changed"
    );
    source.action = Fingerprint::of(&"another action").unwrap();
    assert_eq!(
        host.worker_claim(
            source,
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            policy
        )
        .await
        .err()
        .unwrap()
        .code,
        "worker_source_changed"
    );
    assert!(
        host.worker_ids(owner.lease.binding())
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn recovery_repairs_a_parent_pause_committed_before_child_propagation() {
    use agent_kit_core::turn::ControlDirective;
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let accepted = request.input.clone();
    let ClaimOutcome::Acquired(_child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child owner")
    };
    // Model the crash window after durable parent control, before the host's
    // separate bounded propagation. Reopening must consult that durable owner.
    let view = host
        .store
        .inspect(source.binding.session.clone())
        .await
        .unwrap();
    let turn = view.current.unwrap();
    host.store
        .control(ControlRequest {
            id: change_id().unwrap(),
            session: view.session,
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn.binding.turn,
                expected: turn.controls.revision,
                directive: ControlDirective::Pause,
            },
        })
        .await
        .unwrap();
    assert!(
        !host
            .store
            .inspect(child.clone())
            .await
            .unwrap()
            .current
            .unwrap()
            .controls
            .paused
    );
    assert!(!host.reconcile_worker_owner(&accepted).await.unwrap());
    let child = host.store.inspect(child).await.unwrap();
    assert!(child.current.as_ref().unwrap().controls.paused);
    let profile = session_configuration(&child).unwrap().subagent.unwrap();
    assert!(
        profile
            .sponsored_pause(&child.driver_state)
            .unwrap()
            .held_by_ancestor()
    );
    assert!(host.work.lock().await.active.is_empty());
    assert!(host.work.lock().await.ready.is_empty());
}

#[tokio::test]
async fn parent_pause_also_fences_a_worker_request_prepared_before_the_pause() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let view = host.store.inspect(source.binding.session).await.unwrap();
    host.pause(control(&view)).await.unwrap();
    assert!(host.store.claim_from_operation(request).await.is_err());
    assert_eq!(
        host.store.inspect(child).await.unwrap_err().code,
        "session_missing"
    );
}

#[tokio::test]
async fn replaying_an_old_parent_pause_cannot_reapply_its_ancestor_block_after_resume() {
    use agent_kit_core::turn::ControlDirective;
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(_child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child owner")
    };
    let view = host.store.inspect(child.clone()).await.unwrap();
    host.pause(control(&view)).await.unwrap();
    let view = host
        .store
        .inspect(source.binding.session.clone())
        .await
        .unwrap();
    let pause = control(&view);
    let repeated_pause = || TurnControl {
        request: pause.request.clone(),
        session: pause.session.clone(),
        turn: pause.turn.clone(),
        expected_session: pause.expected_session,
        expected_control: pause.expected_control,
    };
    host.pause(repeated_pause()).await.unwrap();
    let view = host
        .store
        .inspect(source.binding.session.clone())
        .await
        .unwrap();
    let turn = view.current.unwrap();
    host.store
        .control(ControlRequest {
            id: change_id().unwrap(),
            session: view.session,
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn.binding.turn,
                expected: turn.controls.revision,
                directive: ControlDirective::Resume,
            },
        })
        .await
        .unwrap();
    host.resume_workers(&source.binding.session, &source.binding.turn)
        .await
        .unwrap();
    host.pause(repeated_pause()).await.unwrap();
    let parent = host.store.inspect(source.binding.session).await.unwrap();
    assert!(!parent.current.unwrap().controls.paused);
    let child = host.store.inspect(child).await.unwrap();
    let profile = session_configuration(&child).unwrap().subagent.unwrap();
    let pause = profile.sponsored_pause(&child.driver_state).unwrap();
    assert!(!pause.held_by_ancestor());
    assert!(pause.effective());
    assert!(child.current.unwrap().controls.paused);
}

#[tokio::test]
async fn reopened_stop_scanning_retires_a_worker_whose_owner_cancellation_was_not_propagated() {
    use agent_kit_core::turn::ControlDirective;
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child owner")
    };
    let view = host.store.inspect(source.binding.session).await.unwrap();
    let turn = view.current.unwrap();
    // The owner cancellation committed, then the process ended before child
    // propagation. No worker inference or tool effects have been dispatched.
    host.store
        .control(ControlRequest {
            id: change_id().unwrap(),
            session: view.session,
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn.binding.turn,
                expected: turn.controls.revision,
                directive: ControlDirective::Cancel,
            },
        })
        .await
        .unwrap();
    assert!(
        !host
            .store
            .inspect(child.clone())
            .await
            .unwrap()
            .current
            .unwrap()
            .controls
            .cancelled
    );
    drop(child_owner);
    drop(owner);
    host.shutdown().await.unwrap();
    drop(host);
    let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
    let host = loop {
        match Host::open_supervised(
            &root.path().join("state"),
            options(),
            crate::SupervisedProvider::default(),
        ) {
            Ok(host) => break host.with_subagents(),
            Err(error)
                if error.code == "store_already_owned"
                    && tokio::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(5)).await
            }
            Err(error) => panic!("failed to reopen: {error}"),
        }
    };
    host.work.lock().await.missed_stops = true;
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            host.scan_missed_stops().await;
            let view = host.store.inspect(child.clone()).await.unwrap();
            if view.current.is_none()
                && view.latest.as_ref().is_some_and(|turn| {
                    turn.outcome
                        .as_ref()
                        .is_some_and(|outcome| outcome.status == OutcomeStatus::Cancelled)
                })
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let operations = host
        .store
        .inspect_turn_with(child, TurnId::new(TURN).unwrap(), |state| {
            Ok(state.operations().len())
        })
        .await
        .unwrap();
    assert_eq!(operations, 0);
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn worker_preparation_preserves_the_exact_parent_task_spending_selection() {
    let root = tempfile::TempDir::new().unwrap();
    let host = open(root.path());
    let (owner, mut stored) = parent(&host, root.path(), false).await;
    let selection = spending::Store::select(
        Fingerprint::of(&"captured-provider-scope").unwrap(),
        &owner.lease.binding().session,
        &ChangeId::new("funded-parent-input").unwrap(),
        "10",
        4,
    )
    .unwrap();
    host.spending.publish_initial(&selection).unwrap();
    stored.spending = Some(selection.clone());
    let before = host.spending.inspect(&selection).unwrap();
    let worker = host
        .worker_prompt(
            stored,
            source(&owner, 0).await,
            "Worker 0",
            "Complete independent task 0 and return evidence.",
        )
        .unwrap();
    assert_eq!(worker.spending.as_ref(), Some(&selection));
    let retained: StoredPrompt = decode_input(&Submission {
        id: ChangeId::new("retained-worker-input").unwrap(),
        payload: encode_stored_prompt(&worker).unwrap(),
    })
    .unwrap();
    assert_eq!(retained.spending.as_ref(), Some(&selection));
    let after = host
        .spending
        .inspect(retained.spending.as_ref().unwrap())
        .unwrap();
    assert_eq!(before.max_cost_mills, after.max_cost_mills);
    assert_eq!(
        before.per_request_max_cost_mills,
        after.per_request_max_cost_mills
    );
    assert_eq!(before.remaining_mills, after.remaining_mills);
    assert_eq!(after.max_cost_mills, "10");
    assert_eq!(after.per_request_max_cost_mills, "2.5");
    assert_eq!(after.remaining_mills, "10");
    assert!(retained.delegation.is_none());
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn simultaneous_spawn_calls_cannot_overbook_the_retained_worker_allocation() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let policy = stored.delegation.unwrap();
    let mut calls = Vec::new();
    for index in 0..12 {
        let source = source(&owner, index).await;
        let host = host.clone();
        let policy = policy.clone();
        calls.push(async move {
            host.start_worker(
                source,
                &format!("Worker {index}"),
                &format!("Complete independent task {index} and return evidence."),
                &policy,
            )
            .await
        });
    }
    let results = futures_util::future::join_all(calls).await;
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 8);
    for error in results.into_iter().filter_map(Result::err) {
        assert_eq!(error.code, "worker_allocation_exhausted");
    }
    assert_eq!(
        host.worker_ids(owner.lease.binding()).await.unwrap().len(),
        8
    );
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn waiting_reports_owner_loss_without_starting_or_mislabeling_the_child() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let request = host
        .worker_claim(
            source(&owner, 0).await,
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child")
    };
    drop(child_owner);
    let result = host
        .worker_results(owner.lease.binding(), std::slice::from_ref(&child))
        .await
        .unwrap();
    assert_eq!(result["pending"][0]["status"], "interrupted");
    assert_eq!(result["collected"], json!([]));
    assert_eq!(
        host.store
            .inspect_turn_with(child, TurnId::new(TURN).unwrap(), |state| Ok(state
                .operations()
                .len()))
            .await
            .unwrap(),
        0
    );
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn collected_result_discloses_utf8_truncation_without_losing_assignment_identity() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let request = host
        .worker_claim(
            source(&owner, 0).await,
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child")
    };
    let account = grida_agent_master::Account {
        text: format!("{}😀more", "x".repeat(RESULT_BYTES - 1)),
        steps: 1,
        unresolved: Vec::new(),
        tool_activity: Default::default(),
        stop_reason: None,
        failure: None,
        inference_failure: None,
        inference_usage: Default::default(),
        independent_review: None,
        delegation: None,
        goal: None,
        completion_checks: Vec::new(),
        lifecycle_hooks: Vec::new(),
    };
    settle_with_cleanup(&host, child_owner, account).await;
    let result = host
        .worker_results(owner.lease.binding(), std::slice::from_ref(&child))
        .await
        .unwrap();
    assert_eq!(result["collected"][0]["child"], child.as_str());
    assert_eq!(result["collected"][0]["input"], INPUT);
    assert_eq!(result["collected"][0]["turn"], TURN);
    assert_eq!(result["collected"][0]["status"], "succeeded");
    assert_eq!(result["collected"][0]["resource_status"], "verified");
    assert_eq!(
        result["collected"][0]["text"].as_str().unwrap().len(),
        RESULT_BYTES - 1
    );
    assert_eq!(result["collected"][0]["text_truncated"], true);
    assert!(outcome(Ok(result)).truncated);
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn a_full_ready_queue_preserves_the_child_pause_until_resume_can_be_retained() {
    use agent_kit_core::turn::ControlDirective;
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            stored.delegation.as_ref().unwrap(),
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(_child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected child")
    };
    let parent_view = host
        .store
        .inspect(source.binding.session.clone())
        .await
        .unwrap();
    host.pause(control(&parent_view)).await.unwrap();
    let parent_view = host
        .store
        .inspect(source.binding.session.clone())
        .await
        .unwrap();
    let parent_turn = parent_view.current.as_ref().unwrap();
    host.store
        .control(ControlRequest {
            id: change_id().unwrap(),
            session: parent_view.session.clone(),
            expected_revision: parent_view.revision,
            action: SessionControl::Turn {
                turn: parent_turn.binding.turn.clone(),
                expected: parent_turn.controls.revision,
                directive: ControlDirective::Resume,
            },
        })
        .await
        .unwrap();
    let paused = host.store.inspect(child.clone()).await.unwrap();
    assert!(paused.current.as_ref().unwrap().controls.paused);
    {
        let mut work = host.work.lock().await;
        work.ready.extend((0..MAX_READY_SESSIONS).map(|index| {
            ReadyWork::Queue(SessionId::new(format!("other-{index}")).unwrap(), None)
        }));
    }
    assert_eq!(
        host.resume_workers(&source.binding.session, &source.binding.turn)
            .await
            .unwrap_err()
            .code,
        "host_ready_queue_limit"
    );
    let unchanged = host.store.inspect(child.clone()).await.unwrap();
    assert_eq!(paused.revision, unchanged.revision);
    assert_eq!(paused.current, unchanged.current);
    assert!(
        session_configuration(&unchanged)
            .unwrap()
            .subagent
            .unwrap()
            .sponsored_pause(&unchanged.driver_state)
            .unwrap()
            .held_by_ancestor()
    );
    assert_eq!(host.work.lock().await.ready.len(), MAX_READY_SESSIONS);
    host.work.lock().await.ready.clear();
    host.resume_workers(&source.binding.session, &source.binding.turn)
        .await
        .unwrap();
    let ready = host.store.inspect(child.clone()).await.unwrap();
    assert!(!ready.current.as_ref().unwrap().controls.paused);
    let work = host.work.lock().await;
    assert_eq!(work.ready.len(), 1);
    assert!(
        matches!(work.ready.front(),Some(ReadyWork::Sponsored(wake)) if wake.binding.session==child)
    );
    assert!(
        work.active.is_empty(),
        "retaining readiness must not start work"
    );
}

async fn record_unfinished_process_attempt(owner: &ClaimedTurn, index: usize) -> AttemptId {
    let definition = ToolDefinition {
        id: ToolId::new(crate::processes::EXEC_COMMAND).unwrap(),
        version: 1,
        description: "Start an owned native command.".into(),
        input: InputFormat::Json(json!({"type":"object"})),
        max_input_bytes: 4096,
        max_output_bytes: 4096,
        recovery: RecoveryKind::Unavailable,
    };
    let mut inventory = Inventory::new();
    inventory
        .insert(Arc::new(RecordedTool(definition.clone())))
        .unwrap();
    let operation = OperationId::new(format!("process-{index}")).unwrap();
    let attempt = AttemptId::new(format!("process-attempt-{index}")).unwrap();
    let invocation = inventory
        .snapshot(std::slice::from_ref(&definition.id))
        .unwrap()
        .prepare(
            operation.clone(),
            &definition.id,
            ToolArguments::Json(json!({"cmd":"bounded local work"})),
        )
        .unwrap()
        .invocation()
        .clone();
    let state = owner.lease.journal().load().await.unwrap();
    owner
        .lease
        .journal()
        .commit(
            JournalChange::new(
                change_id().unwrap(),
                state.binding().clone(),
                state.position(),
                state.controls().revision,
                vec![
                    JournalAction::prepare(OperationRecord {
                        id: operation.clone(),
                        input: OperationInput::Tool(invocation),
                        origin: None,
                        source_call: None,
                        grants: grant(state.binding(), crate::processes::EXEC_COMMAND).unwrap(),
                    }),
                    JournalAction::StartAttempt {
                        operation: operation.clone(),
                        attempt: attempt.clone(),
                    },
                    JournalAction::CompleteAttempt {
                        operation,
                        attempt: attempt.clone(),
                        outcome: agent_kit_core::turn::OperationOutcome::Tool(ToolOutcome {
                            status: OutcomeStatus::Succeeded,
                            content: vec![agent_kit_core::messages::ResultContent::Text(
                                "Process running with session ID 1".into(),
                            )],
                            structured: Some(json!({"cleanup_verified":false})),
                            receipt: None,
                            truncated: false,
                        }),
                    },
                ],
            )
            .unwrap(),
        )
        .await
        .unwrap();
    attempt
}

async fn settle_process_worker_cancelled(owner: &ClaimedTurn) {
    let state = owner.lease.journal().load().await.unwrap();
    owner
        .lease
        .journal()
        .commit(
            JournalChange::new(
                change_id().unwrap(),
                state.binding().clone(),
                state.position(),
                state.controls().revision,
                vec![JournalAction::Settle(agent_kit_core::turn::TurnOutcome {
                    status: OutcomeStatus::Cancelled,
                    account: None,
                    evidence: Vec::new(),
                })],
            )
            .unwrap(),
        )
        .await
        .unwrap();
}

/// A Stop may attempt cleanup, but its durable receipt must not assert that a
/// fresh empty process map accounts for an earlier owner's dispatched command.
async fn stop_and_wait_preserve_unknown_process_evidence(
    host: &Host,
    parent: ClaimedTurn,
    child: &SessionId,
    policy: Policy,
) {
    let binding = parent.lease.binding().clone();
    let access = Access::bind(host, &binding, policy).unwrap();
    let execution = host.execution().unwrap();
    let authorization = permissions::ToolAuthority::bind(
        execution.authorization.clone(),
        None,
        permissions::MaterialTools {
            image: None,
            file: None,
            skills: None,
        },
        None,
        permissions::HookTools {
            completion: None,
            before_tool: None,
            lifecycle: None,
        },
        Vec::new(),
        permissions::DelegationTools {
            review: None,
            workers: Some(access.clone()),
        },
    )
    .unwrap();
    let runtime = execution
        .runtime
        .with_authorization(authorization.clone(), authorization);
    let opened = runtime.open(parent.lease).await.unwrap();
    let operations = opened.turn.operations();
    let mut inventory = Inventory::new();
    let mut grants = BTreeMap::new();
    access
        .insert(operations.clone(), &mut inventory, &mut grants)
        .unwrap();
    let tools = inventory
        .snapshot(&grants.keys().cloned().collect::<Vec<_>>())
        .unwrap();
    let stopped = operations
        .invoke_with_inventory(
            agent_kit_runtime::OperationKey::new("stop-unverified-resource").unwrap(),
            agent_kit_runtime::PlannedInvocation {
                tool: ToolId::new(STOP).unwrap(),
                arguments: ToolArguments::Json(json!({"child":child})),
                grants: grants[&ToolId::new(STOP).unwrap()].clone(),
            },
            tools.clone(),
        )
        .await
        .unwrap();
    let agent_kit_runtime::InvokeOutcome::Complete(stopped) = stopped else {
        panic!("expected a retained stop result")
    };
    assert_eq!(stopped.status, OutcomeStatus::Succeeded);
    let stopped = stopped.structured.unwrap();
    assert_eq!(stopped["collected"][0]["status"], "cancelled", "{stopped}");
    assert_eq!(
        stopped["collected"][0]["resource_status"], "uncertain",
        "{stopped}"
    );
    assert_eq!(stopped["cleanup"][0]["status"], "uncertain", "{stopped}");
    let observed = operations
        .invoke_with_inventory(
            agent_kit_runtime::OperationKey::new("wait-unverified-resource").unwrap(),
            agent_kit_runtime::PlannedInvocation {
                tool: ToolId::new(WAIT).unwrap(),
                arguments: ToolArguments::Json(json!({"children":[child]})),
                grants: grants[&ToolId::new(WAIT).unwrap()].clone(),
            },
            tools,
        )
        .await
        .unwrap();
    let agent_kit_runtime::InvokeOutcome::Complete(observed) = observed else {
        panic!("expected a retained observation")
    };
    assert_eq!(observed.status, OutcomeStatus::Succeeded);
    let observed = observed.structured.unwrap();
    assert_eq!(
        observed["collected"][0]["status"], "cancelled",
        "{observed}"
    );
    assert_eq!(
        observed["collected"][0]["resource_status"], "uncertain",
        "{observed}"
    );
    assert!(
        !host
            .worker_stop_verified(
                &binding,
                child,
                &ChangeId::new(INPUT).unwrap(),
                &TurnId::new(TURN).unwrap()
            )
            .await
            .unwrap()
    );
}

#[tokio::test]
async fn stopping_after_reopen_cannot_turn_an_old_unknown_command_into_verified_cleanup() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let policy = stored.delegation.unwrap();
    let source = source(&owner, 0).await;
    let request = host
        .worker_claim(
            source.clone(),
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            &policy,
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected worker")
    };
    record_unfinished_process_attempt(&child_owner, 0).await;
    settle_process_worker_cancelled(&child_owner).await;
    drop(child_owner);
    drop(owner);
    host.shutdown().await.unwrap();
    drop(host);
    let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
    let host = loop {
        match Host::open_supervised(
            &root.path().join("state"),
            options(),
            crate::SupervisedProvider::default(),
        ) {
            Ok(host) => break host.with_subagents(),
            Err(error)
                if error.code == "store_already_owned"
                    && tokio::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(5)).await
            }
            Err(error) => panic!("failed to reopen: {error}"),
        }
    };
    assert!(host.processes.list(&child).is_empty());
    let ClaimOutcome::Acquired(recovered) = host
        .store
        .recover(RecoveryRequest {
            id: change_id().unwrap(),
            session: source.binding.session,
            turn: source.binding.turn,
            expected_epoch: source.binding.epoch,
        })
        .await
        .unwrap()
    else {
        panic!("expected recovered parent")
    };
    stop_and_wait_preserve_unknown_process_evidence(&host, recovered, &child, policy).await;
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn a_new_local_command_attempt_cannot_hide_an_older_unaccounted_attempt() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let policy = stored.delegation.unwrap();
    let request = host
        .worker_claim(
            source(&owner, 0).await,
            "Worker 0",
            "Complete independent task 0 and return evidence.",
            &policy,
        )
        .await
        .unwrap();
    let child = request.claim.session.clone();
    let ClaimOutcome::Acquired(child_owner) =
        host.store.claim_from_operation(request).await.unwrap()
    else {
        panic!("expected worker")
    };
    let old = record_unfinished_process_attempt(&child_owner, 0).await;
    let recent = record_unfinished_process_attempt(&child_owner, 1).await;
    host.processes.track_attempts(&child).unwrap();
    let launch = host.processes.admit_attempt(&child, &recent).unwrap();
    drop(launch);
    assert!(!host.processes.knows_attempt(&child, &old));
    assert!(host.processes.knows_attempt(&child, &recent));
    settle_process_worker_cancelled(&child_owner).await;
    drop(child_owner);
    stop_and_wait_preserve_unknown_process_evidence(&host, owner, &child, policy).await;
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn waiting_collects_terminal_failure_with_resource_uncertainty_without_polling_cleanup() {
    let root = tempfile::tempdir().unwrap();
    let host = open(root.path());
    let (owner, stored) = parent(&host, root.path(), false).await;
    let binding = owner.lease.binding().clone();
    let policy = stored.delegation.unwrap();
    let mut children = Vec::new();
    let mut cleanups = Vec::new();
    let mut launches = Vec::new();
    for (index, status) in [OutcomeStatus::Failed, OutcomeStatus::Cancelled]
        .into_iter()
        .enumerate()
    {
        let request = host
            .worker_claim(
                source(&owner, index).await,
                &format!("Worker {index}"),
                &format!("Complete independent task {index} and return evidence."),
                &policy,
            )
            .await
            .unwrap();
        let child = request.claim.session.clone();
        let ClaimOutcome::Acquired(child_owner) =
            host.store.claim_from_operation(request).await.unwrap()
        else {
            panic!("expected child")
        };
        let state = child_owner.lease.journal().load().await.unwrap();
        child_owner
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    state.binding().clone(),
                    state.position(),
                    state.controls().revision,
                    vec![JournalAction::Settle(agent_kit_core::turn::TurnOutcome {
                        status,
                        account: None,
                        evidence: Vec::new(),
                    })],
                )
                .unwrap(),
            )
            .await
            .unwrap();
        drop(child_owner);
        // The task has finished, but its native cleanup owner remains active.
        let cleanup = tokio::spawn(std::future::pending::<()>());
        host.work.lock().await.active.insert(
            child.clone(),
            Active {
                turn: TurnId::new(TURN).unwrap(),
                admitted: true,
                handle: cleanup.abort_handle(),
                pending_stop: None,
                missed_stop: false,
            },
        );
        launches.push(host.processes.admit(&child).unwrap());
        cleanups.push(cleanup);
        children.push(child);
    }
    let access = Access::bind(&host, &binding, policy).unwrap();
    let execution = host.execution().unwrap();
    let authorization = permissions::ToolAuthority::bind(
        execution.authorization.clone(),
        None,
        permissions::MaterialTools {
            image: None,
            file: None,
            skills: None,
        },
        None,
        permissions::HookTools {
            completion: None,
            before_tool: None,
            lifecycle: None,
        },
        Vec::new(),
        permissions::DelegationTools {
            review: None,
            workers: Some(access.clone()),
        },
    )
    .unwrap();
    let runtime = execution
        .runtime
        .with_authorization(authorization.clone(), authorization);
    let opened = runtime.open(owner.lease).await.unwrap();
    let operations = opened.turn.operations();
    let mut inventory = Inventory::new();
    let mut grants = BTreeMap::new();
    access
        .insert(operations.clone(), &mut inventory, &mut grants)
        .unwrap();
    let tools = inventory
        .snapshot(&grants.keys().cloned().collect::<Vec<_>>())
        .unwrap();
    let observed = tokio::time::timeout(
        Duration::from_secs(1),
        operations.invoke_with_inventory(
            agent_kit_runtime::OperationKey::new("observe-terminal-cleanup").unwrap(),
            agent_kit_runtime::PlannedInvocation {
                tool: ToolId::new(WAIT).unwrap(),
                arguments: ToolArguments::Json(json!({"children":children})),
                grants: grants[&ToolId::new(WAIT).unwrap()].clone(),
            },
            tools,
        ),
    )
    .await
    .unwrap()
    .unwrap();
    let agent_kit_runtime::InvokeOutcome::Complete(observed) = observed else {
        panic!("expected completed observation")
    };
    let observed = observed.structured.unwrap();
    assert!(observed["pending"].as_array().unwrap().is_empty());
    let collected = observed["collected"].as_array().unwrap();
    assert_eq!(collected.len(), 2);
    for (index, status) in ["failed", "cancelled"].into_iter().enumerate() {
        assert_eq!(collected[index]["status"], status);
        assert_eq!(collected[index]["resource_status"], "uncertain");
        assert!(
            !cleanups[index].is_finished(),
            "observation must leave the cleanup owner alive"
        );
        assert!(
            !launches[index].stop().is_cancelled(),
            "waiting must not perform cleanup"
        );
    }
    drop(launches);
    host.work.lock().await.active.clear();
    for cleanup in cleanups {
        cleanup.abort();
        let _ = cleanup.await;
    }
    drop(opened);
    host.shutdown().await.unwrap();
}
