use super::*;
use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::driver_state::{DriverStateChange, DriverStateRevision};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::ToolArguments;
use agent_kit_core::tools::{
    Inventory, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{
    ControlDirective, OperationInput, OperationOutcome, OperationRecord, TurnBinding,
};
use agent_kit_core::{AttemptId, BindingId, BoxFuture, OperationId, PrincipalId, ScopeId, ToolId};
use agent_kit_sessions::{SessionView, TurnControl};
use agent_kit_store_sqlite::{
    OperationClaim, OperationClaimSource, OperationPairControl, OperationRelatedControl,
};

#[path = "resume.rs"]
mod resume;

struct WorkTool(ToolDefinition);

impl Tool for WorkTool {
    fn definition(&self) -> &ToolDefinition {
        &self.0
    }

    fn validate(&self, _: &ToolArguments) -> Result<()> {
        Ok(())
    }

    fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        panic!("the store does not execute tools")
    }
}

async fn source(owner: &ClaimedTurn, operation: &str, attempt: &str) -> OperationClaimSource {
    let id = ToolId::new("start-work").unwrap();
    let mut inventory = Inventory::new();
    inventory
        .insert(Arc::new(WorkTool(ToolDefinition {
            id: id.clone(),
            version: 1,
            description: "Start independent work".into(),
            input: InputFormat::Text,
            max_input_bytes: 256,
            max_output_bytes: 256,
            recovery: RecoveryKind::Reconcile,
        })))
        .unwrap();
    let operation = OperationId::new(operation).unwrap();
    let attempt = AttemptId::new(attempt).unwrap();
    let invocation = inventory
        .snapshot(std::slice::from_ref(&id))
        .unwrap()
        .prepare(
            operation.clone(),
            &id,
            ToolArguments::Text("Review this result".into()),
        )
        .unwrap()
        .invocation()
        .clone();
    let action = invocation.fingerprint();
    commit(
        owner,
        operation.as_str(),
        vec![
            JournalAction::prepare(OperationRecord {
                id: operation.clone(),
                input: OperationInput::Tool(invocation),
                origin: None,
                source_call: None,
                grants: GrantSelection {
                    authority: AuthorityBinding {
                        principal: PrincipalId::new("fixture").unwrap(),
                        binding: BindingId::new("fixture-binding").unwrap(),
                        scope: ScopeId::new("fixture-scope").unwrap(),
                    },
                    grants: vec![],
                },
            }),
            JournalAction::StartAttempt {
                operation: operation.clone(),
                attempt: attempt.clone(),
            },
        ],
    )
    .await;
    OperationClaimSource {
        binding: owner.lease.binding().clone(),
        control: owner.lease.controls().read().await.unwrap().revision,
        operation,
        attempt,
        action,
    }
}

async fn owning_operation(store: &SqliteStore) -> (ClaimedTurn, OperationClaimSource) {
    let input = submission("parent-input", "Work with a reviewer");
    store.submit(session(), input.clone()).await.unwrap();
    let parent = claim(store, "parent-claim", vec![input.id]).await;
    let selected = source(&parent, "launch", "launch-attempt").await;
    (parent, selected)
}

fn request(source: OperationClaimSource, destination: &str) -> OperationClaim {
    let child = SessionId::new(destination).unwrap();
    let input = submission("child-input", "Review the current result");
    OperationClaim {
        source,
        create: CreateSession {
            id: child.clone(),
            request: change("child-create"),
            configuration: payload("opaque-child-configuration"),
        },
        claim: ClaimRequest {
            id: change("child-claim"),
            session: child,
            expected_revision: SessionRevision(0),
            selection: TurnSelection::New {
                turn: TurnId::new("child-turn").unwrap(),
                inputs: vec![input.id.clone()],
            },
        },
        input,
        driver_state: DriverStateChange {
            expected: DriverStateRevision(0),
            value: Some(payload("opaque-reservation")),
        },
    }
}

fn assert_absent(result: Result<SessionView>) {
    assert_error(result, ErrorKind::InvalidInput, "session_missing");
}

#[tokio::test]
async fn exact_concurrent_claims_create_one_child_and_preserve_ordinary_receipts() {
    let (_directory, store) = store().await;
    let (parent, selected) = owning_operation(&store).await;
    let request = request(selected, "child");
    let before = parent.lease.journal().load().await.unwrap().position();
    let (left, right) = tokio::join!(
        store.claim_from_operation(request.clone()),
        store.claim_from_operation(request.clone()),
    );
    let child = match (left.unwrap(), right.unwrap()) {
        (ClaimOutcome::Acquired(child), ClaimOutcome::Existing(view))
        | (ClaimOutcome::Existing(view), ClaimOutcome::Acquired(child)) => {
            assert_eq!(&view.binding, child.lease.binding());
            assert_eq!(view.disposition, TurnDisposition::Running);
            child
        }
        _ => panic!("one request must acquire and one must observe"),
    };
    let binding = child.lease.binding().clone();
    assert_eq!(child.configuration, request.create.configuration);
    assert_eq!(child.inputs, vec![request.input.clone()]);
    let child_view = store.inspect(binding.session.clone()).await.unwrap();
    assert_eq!(child_view.driver_state.revision(), DriverStateRevision(1));
    assert_eq!(
        child_view.driver_state.value(),
        request.driver_state.value.as_ref(),
    );
    assert_eq!(
        store.create(request.create.clone()).await.unwrap().revision,
        SessionRevision(0),
    );
    let accepted = store
        .submit(binding.session.clone(), request.input.clone())
        .await
        .unwrap();
    assert_eq!(accepted.input, request.input.id);
    let selected = store
        .input(binding.session.clone(), accepted.input)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(accepted.position, selected.position);
    assert_eq!(
        selected.disposition,
        InputDisposition::Claimed {
            turn: binding.turn.clone()
        }
    );
    assert_eq!(
        before,
        parent.lease.journal().load().await.unwrap().position()
    );
    assert_error(
        store
            .recover(RecoveryRequest {
                id: change("recover-owned-child"),
                session: binding.session.clone(),
                turn: binding.turn.clone(),
                expected_epoch: binding.epoch,
            })
            .await,
        ErrorKind::Conflict,
        "turn_still_owned",
    );
    let receipt = commit(
        &child,
        "settle-child",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })],
    )
    .await;
    store.verify(receipt).await.unwrap();
    assert!(matches!(
        store.claim_from_operation(request).await.unwrap(),
        ClaimOutcome::Existing(view) if view.disposition == TurnDisposition::Settled
    ));
}

#[tokio::test]
async fn source_must_match_its_live_tool_attempt_and_open_control_revision() {
    let (_directory, store) = store().await;
    let (_parent, selected) = owning_operation(&store).await;
    let request = request(selected, "child");
    let mut wrong = request.clone();
    wrong.source.attempt = AttemptId::new("another-attempt").unwrap();
    assert_error(
        store.claim_from_operation(wrong).await,
        ErrorKind::Conflict,
        "operation_claim_source_mismatch",
    );
    let mut wrong = request.clone();
    wrong.source.action = Fingerprint::of(&"another-action").unwrap();
    assert_error(
        store.claim_from_operation(wrong).await,
        ErrorKind::Conflict,
        "operation_claim_source_mismatch",
    );
    let view = store.inspect(session()).await.unwrap();
    store
        .control(ControlRequest {
            id: change("pause-source"),
            session: session(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn(),
                expected: request.source.control,
                directive: ControlDirective::Pause,
            },
        })
        .await
        .unwrap();
    assert_error(
        store.claim_from_operation(request.clone()).await,
        ErrorKind::Conflict,
        "stale_control_revision",
    );
    let mut observed = request.clone();
    observed.source.control = store
        .inspect_turn(session(), turn())
        .await
        .unwrap()
        .controls
        .revision;
    assert_error(
        store.claim_from_operation(observed).await,
        ErrorKind::InvalidState,
        "operation_claim_source_closed",
    );
    assert_absent(store.inspect(request.create.id).await);
}

#[tokio::test]
async fn lost_acknowledgment_reopens_only_the_existing_child_claim() {
    let (directory, store) = store().await;
    let (parent, selected) = owning_operation(&store).await;
    let request = request(selected.clone(), "child");
    let lost = store.claim_from_operation(request.clone()).await.unwrap();
    let binding = match &lost {
        ClaimOutcome::Acquired(child) => child.lease.binding().clone(),
        ClaimOutcome::Existing(_) => panic!("expected initial claim"),
    };
    drop(lost);
    drop(parent);
    drop(store);

    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let ClaimOutcome::Existing(view) = store.claim_from_operation(request.clone()).await.unwrap()
    else {
        panic!("retry must not acquire a lease");
    };
    assert_eq!(view.binding, binding);
    assert_eq!(view.disposition, TurnDisposition::Interrupted);
    let other = self::request(selected, "alternate-child");
    assert_error(
        store.claim_from_operation(other.clone()).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    assert_absent(store.inspect(other.create.id).await);
    let recovery = RecoveryRequest {
        id: change("recover-child"),
        session: binding.session.clone(),
        turn: binding.turn.clone(),
        expected_epoch: binding.epoch,
    };
    let ClaimOutcome::Acquired(child) = store.recover(recovery).await.unwrap() else {
        panic!("explicit recovery must acquire the released turn");
    };
    assert_eq!(child.lease.binding().epoch, binding.epoch + 1);
    assert_eq!(child.inputs, vec![request.input.clone()]);
    assert!(matches!(
        store.claim_from_operation(request).await.unwrap(),
        ClaimOutcome::Existing(view) if view.binding == *child.lease.binding()
    ));
}

async fn turn_control(
    store: &SqliteStore,
    binding: &TurnBinding,
    id: &str,
    directive: ControlDirective,
) -> ControlRequest {
    let view = store.inspect(binding.session.clone()).await.unwrap();
    let current = view.current.unwrap();
    assert_eq!(current.binding, *binding);
    ControlRequest {
        id: change(id),
        session: binding.session.clone(),
        expected_revision: view.revision,
        action: SessionControl::Turn {
            turn: binding.turn.clone(),
            expected: current.controls.revision,
            directive,
        },
    }
}

fn state_control(mut request: ControlRequest, revision: u64, value: &str) -> ControlRequest {
    let SessionControl::Turn {
        turn,
        expected,
        directive,
    } = request.action
    else {
        panic!("expected a turn directive");
    };
    request.action = SessionControl::DriverState {
        change: DriverStateChange {
            expected: DriverStateRevision(revision),
            value: Some(payload(value)),
        },
        turn: Some(TurnControl {
            turn,
            expected,
            directive,
        }),
    };
    request
}

async fn claim_destination(store: &SqliteStore, request: OperationClaim) -> ClaimedTurn {
    let ClaimOutcome::Acquired(child) = store.claim_from_operation(request).await.unwrap() else {
        panic!("expected an acquired destination");
    };
    child
}

#[tokio::test]
async fn operation_claim_observation_preserves_exact_assignment_after_reuse() {
    let (directory, store) = store().await;
    let (parent, launch) = owning_operation(&store).await;
    let child = claim_destination(&store, request(launch.clone(), "reviewer")).await;
    let original = child.lease.binding().clone();
    commit(
        &child,
        "settle-review",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })],
    )
    .await;
    let later_input = submission("later-input", "Later, unrelated assignment");
    store
        .submit(original.session.clone(), later_input.clone())
        .await
        .unwrap();
    let view = store.inspect(original.session.clone()).await.unwrap();
    let ClaimOutcome::Acquired(later) = store
        .claim(ClaimRequest {
            id: change("later-claim"),
            session: original.session.clone(),
            expected_revision: view.revision,
            selection: TurnSelection::New {
                turn: TurnId::new("later-review").unwrap(),
                inputs: vec![later_input.id],
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected a later assignment")
    };
    assert_ne!(later.lease.binding().turn, original.turn);

    let unrelated = source(&parent, "another-launch", "another-attempt").await;
    let another = claim_destination(&store, request(unrelated.clone(), "another-reviewer")).await;
    assert_error(
        store
            .inspect_operation_claim_with(
                launch.binding.session.clone(),
                launch.binding.turn.clone(),
                vec![launch.operation.clone(), unrelated.operation.clone()],
                |_| Ok(()),
            )
            .await,
        ErrorKind::Conflict,
        "operation_claim_ambiguous",
    );
    let mut settled = [launch.clone(), unrelated]
        .map(|source| JournalAction::CompleteAttempt {
            operation: source.operation,
            attempt: source.attempt,
            outcome: OperationOutcome::Tool(ToolOutcome::failed("fixture_complete")),
        })
        .to_vec();
    settled.push(JournalAction::Settle(TurnOutcome {
        status: OutcomeStatus::Succeeded,
        account: None,
        evidence: vec![],
    }));
    commit(&parent, "settle-parent", settled).await;
    drop((another, later, child, parent, store));

    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let observed = store
        .inspect_operation_claim_with(
            launch.binding.session,
            launch.binding.turn,
            vec![launch.operation, OperationId::new("unclaimed").unwrap()],
            |state| Ok((state.binding().clone(), state.outcome().unwrap().status)),
        )
        .await
        .unwrap();
    assert_eq!(observed, Some((original, OutcomeStatus::Succeeded)));
}

#[tokio::test]
async fn derived_turn_control_replays_the_original_request_after_related_mutation() {
    let (_directory, store) = store().await;
    let (parent, operation) = owning_operation(&store).await;
    let child = claim_destination(&store, request(operation.clone(), "child")).await;
    let binding = child.lease.binding();
    let local = turn_control(&store, binding, "pause-local", ControlDirective::Pause).await;
    let receipt = store
        .control_turn_with_driver_state(local.clone(), |state| {
            assert_eq!(state.revision(), DriverStateRevision(1));
            Ok(Some(payload("local-blocker")))
        })
        .await
        .unwrap();
    assert_eq!(receipt.driver_state_revision, Some(DriverStateRevision(2)));
    let related = OperationPairControl {
        source: turn_control(
            &store,
            parent.lease.binding(),
            "pause-source",
            ControlDirective::Pause,
        )
        .await,
        related: OperationRelatedControl::Apply {
            operation: operation.operation,
            request: state_control(
                turn_control(&store, binding, "pause-related", ControlDirective::Pause).await,
                2,
                "both-blockers",
            ),
        },
    };
    store.control_operation_pair(related).await.unwrap();
    assert_eq!(
        store
            .control_turn_with_driver_state(local.clone(), |_| panic!("must not derive again"))
            .await
            .unwrap(),
        receipt,
    );
    assert_eq!(
        store.control_receipt(local.clone()).await.unwrap(),
        Some(receipt.clone())
    );
    assert_eq!(store.control(local.clone()).await.unwrap(), receipt);
    let mut altered = local;
    altered.id = change("different-pause");
    let view = store.inspect(binding.session.clone()).await.unwrap();
    altered.expected_revision = view.revision;
    assert_error(
        store
            .control_turn_with_driver_state(altered, |_| panic!("stale turn control"))
            .await,
        ErrorKind::Conflict,
        "stale_journal_change",
    );
    assert_eq!(view.driver_state.value(), Some(&payload("both-blockers")));
    assert_eq!(store.inspect(binding.session.clone()).await.unwrap(), view);
}

#[tokio::test]
async fn derived_turn_control_and_related_pair_serialize_on_the_destination() {
    let (_directory, store) = store().await;
    let (parent, operation) = owning_operation(&store).await;
    let child = claim_destination(&store, request(operation.clone(), "child")).await;
    let binding = child.lease.binding();
    let local = turn_control(&store, binding, "pause-local", ControlDirective::Pause).await;
    let paired = OperationPairControl {
        source: turn_control(
            &store,
            parent.lease.binding(),
            "pause-source",
            ControlDirective::Pause,
        )
        .await,
        related: OperationRelatedControl::Apply {
            operation: operation.operation,
            request: state_control(
                turn_control(&store, binding, "pause-related", ControlDirective::Pause).await,
                1,
                "related-blocker",
            ),
        },
    };
    let (independent, ancestor) = tokio::join!(
        store.control_turn_with_driver_state(local.clone(), |_| Ok(Some(payload("local-blocker")))),
        store.control_operation_pair(paired),
    );
    let source = store.inspect_turn(session(), turn()).await.unwrap();
    let destination = store.inspect(binding.session.clone()).await.unwrap();
    assert!(destination.current.unwrap().controls.paused);
    assert_eq!(destination.driver_state.revision(), DriverStateRevision(2));
    match (independent, ancestor) {
        (Ok(receipt), Err(conflict)) => {
            assert_eq!(conflict.code, "stale_session_revision");
            assert!(!source.controls.paused);
            assert_eq!(
                destination.driver_state.value(),
                Some(&payload("local-blocker"))
            );
            assert_eq!(store.control_receipt(local).await.unwrap(), Some(receipt));
        }
        (Err(conflict), Ok(_)) => {
            assert_eq!(conflict.code, "stale_session_revision");
            assert!(source.controls.paused);
            assert_eq!(
                destination.driver_state.value(),
                Some(&payload("related-blocker"))
            );
            assert_eq!(store.control_receipt(local).await.unwrap(), None);
        }
        _ => panic!("only one control may commit against the same destination revision"),
    }
}

#[tokio::test]
async fn absence_control_and_related_claim_have_one_winner() {
    let (_directory, store) = store().await;
    let (parent, selected) = owning_operation(&store).await;
    let claim = request(selected, "child");
    let control = OperationPairControl {
        source: turn_control(
            &store,
            parent.lease.binding(),
            "pause",
            ControlDirective::Pause,
        )
        .await,
        related: OperationRelatedControl::Absent {
            session: claim.create.id.clone(),
        },
    };
    let (paused, claimed) = tokio::join!(
        store.control_operation_pair(control.clone()),
        store.claim_from_operation(claim.clone()),
    );
    let parent = store.inspect_turn(session(), turn()).await.unwrap();
    match (paused, claimed) {
        (Ok(receipt), Err(rejected)) => {
            assert_eq!(rejected.code, "stale_control_revision");
            assert!(parent.controls.paused);
            assert_absent(store.inspect(claim.create.id).await);
            assert_eq!(
                store.operation_pair_receipt(control.source).await.unwrap(),
                Some(receipt)
            );
        }
        (Err(pause), Ok(ClaimOutcome::Acquired(child))) => {
            assert_eq!(pause.code, "operation_pair_destination_exists");
            assert_eq!(child.lease.binding().session, claim.create.id);
            assert!(!parent.controls.paused);
            assert_eq!(
                store.operation_pair_receipt(control.source).await.unwrap(),
                None
            );
        }
        _ => panic!("the absence check and claim must serialize"),
    }
}

#[tokio::test]
async fn paired_receipts_replay_after_destination_changes_and_can_resume_both() {
    let (directory, store) = store().await;
    let (parent, selected) = owning_operation(&store).await;
    let child = claim_destination(&store, request(selected.clone(), "child")).await;
    let parent_binding = parent.lease.binding().clone();
    let child_binding = child.lease.binding().clone();
    let destination = state_control(
        turn_control(
            &store,
            &child_binding,
            "pause-child",
            ControlDirective::Pause,
        )
        .await,
        1,
        "opaque-paired-pause",
    );
    let pause = OperationPairControl {
        source: turn_control(
            &store,
            &parent_binding,
            "pause-parent",
            ControlDirective::Pause,
        )
        .await,
        related: OperationRelatedControl::Apply {
            operation: selected.operation.clone(),
            request: destination.clone(),
        },
    };
    let receipt = store.control_operation_pair(pause.clone()).await.unwrap();
    assert_eq!(
        store.control(destination).await.unwrap(),
        receipt.destination.clone().unwrap(),
    );
    let later = state_control(
        turn_control(
            &store,
            &child_binding,
            "later-pause",
            ControlDirective::Pause,
        )
        .await,
        2,
        "opaque-independent-pause",
    );
    store.control(later).await.unwrap();
    commit(
        &parent,
        "suspend-parent",
        vec![
            JournalAction::CompleteAttempt {
                operation: selected.operation.clone(),
                attempt: selected.attempt,
                outcome: OperationOutcome::Tool(ToolOutcome::failed("fixture")),
            },
            JournalAction::Suspend,
        ],
    )
    .await;
    commit(&child, "suspend-child", vec![JournalAction::Suspend]).await;
    drop(parent);
    drop(child);
    drop(store);
    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    assert_eq!(
        store
            .operation_pair_receipt(pause.source.clone())
            .await
            .unwrap(),
        Some(receipt.clone())
    );
    assert_eq!(
        store.control_operation_pair(pause.clone()).await.unwrap(),
        receipt
    );
    let mut altered = pause.clone();
    altered.related = OperationRelatedControl::Absent {
        session: child_binding.session.clone(),
    };
    assert_error(
        store.control_operation_pair(altered).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    let mut altered = pause.source;
    altered.expected_revision = receipt.source.revision;
    assert_error(
        store.operation_pair_receipt(altered).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    let resume = OperationPairControl {
        source: turn_control(
            &store,
            &parent_binding,
            "resume-parent",
            ControlDirective::Resume,
        )
        .await,
        related: OperationRelatedControl::Apply {
            operation: selected.operation,
            request: state_control(
                turn_control(
                    &store,
                    &child_binding,
                    "resume-child",
                    ControlDirective::Resume,
                )
                .await,
                3,
                "opaque-resumed",
            ),
        },
    };
    store.control_operation_pair(resume).await.unwrap();
    for binding in [parent_binding, child_binding.clone()] {
        let view = store
            .inspect_turn(binding.session, binding.turn)
            .await
            .unwrap();
        assert!(!view.controls.paused);
        assert_eq!(view.disposition, TurnDisposition::Suspended);
        assert_eq!(view.binding.epoch, binding.epoch);
    }
    let child = store.inspect(child_binding.session).await.unwrap();
    assert_eq!(child.driver_state.revision(), DriverStateRevision(4));
    assert_eq!(child.driver_state.value(), Some(&payload("opaque-resumed")));
}

#[tokio::test]
async fn paired_controls_roll_back_and_reject_independent_receipts() {
    let (_directory, store) = store().await;
    let (parent, selected) = owning_operation(&store).await;
    let child = claim_destination(&store, request(selected.clone(), "child")).await;
    let mut source = turn_control(
        &store,
        parent.lease.binding(),
        "stop-parent",
        ControlDirective::Cancel,
    )
    .await;
    source.action = SessionControl::PauseAndCancel {
        turn: turn(),
        expected: selected.control,
    };
    let destination = state_control(
        turn_control(
            &store,
            child.lease.binding(),
            "stop-child",
            ControlDirective::Cancel,
        )
        .await,
        1,
        "opaque-cancelled",
    );
    let mut stop = OperationPairControl {
        source: source.clone(),
        related: OperationRelatedControl::Apply {
            operation: selected.operation,
            request: destination.clone(),
        },
    };
    let before = store.inspect(destination.session.clone()).await.unwrap();
    stop.source.expected_revision = SessionRevision(0);
    assert_error(
        store.control_operation_pair(stop.clone()).await,
        ErrorKind::Conflict,
        "stale_session_revision",
    );
    assert_eq!(
        store.inspect(destination.session.clone()).await.unwrap(),
        before
    );
    assert_eq!(
        store.operation_pair_receipt(source.clone()).await.unwrap(),
        None
    );
    // A successful pair can use both original identities after the rollback.
    stop.source = source.clone();
    let receipt = store.control_operation_pair(stop).await.unwrap();
    let parent = store.inspect(source.session.clone()).await.unwrap();
    assert!(parent.admission_paused);
    assert!(parent.current.unwrap().controls.cancelled);
    let child = store.inspect(destination.session.clone()).await.unwrap();
    assert_eq!(
        child.driver_state.value(),
        Some(&payload("opaque-cancelled"))
    );
    assert!(child.current.unwrap().controls.cancelled);
    assert_eq!(
        store.control(destination).await.unwrap(),
        receipt.destination.unwrap()
    );

    let (_directory, store) = self::store().await;
    let (parent, selected) = owning_operation(&store).await;
    let source = turn_control(
        &store,
        parent.lease.binding(),
        "standalone-pause",
        ControlDirective::Pause,
    )
    .await;
    let ordinary = store.control(source.clone()).await.unwrap();
    assert_eq!(
        store.operation_pair_receipt(source.clone()).await.unwrap(),
        None
    );
    assert_eq!(
        store.control_receipt(source.clone()).await.unwrap(),
        Some(ordinary)
    );
    let mut changed = source.clone();
    changed.expected_revision = SessionRevision(0);
    assert_error(
        store.control_receipt(changed).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    assert_error(
        store
            .control_operation_pair(OperationPairControl {
                source,
                related: OperationRelatedControl::Absent {
                    session: request(selected, "child").create.id,
                },
            })
            .await,
        ErrorKind::Conflict,
        "operation_pair_control_already_recorded",
    );
}

#[tokio::test]
async fn only_exact_related_controls_or_settled_destinations_are_accepted() {
    let (_directory, store) = store().await;
    let (parent, selected) = owning_operation(&store).await;
    let child = claim_destination(&store, request(selected.clone(), "child")).await;
    let destination = child.lease.binding();
    let source = turn_control(
        &store,
        parent.lease.binding(),
        "pause-parent",
        ControlDirective::Pause,
    )
    .await;
    for (operation, turn, code) in [
        (
            OperationId::new("unrelated").unwrap(),
            destination.turn.clone(),
            "operation_pair_claim_missing",
        ),
        (
            selected.operation.clone(),
            TurnId::new("wrong-turn").unwrap(),
            "operation_pair_destination_mismatch",
        ),
        (
            selected.operation.clone(),
            destination.turn.clone(),
            "operation_pair_destination_unsettled",
        ),
    ] {
        assert_error(
            store
                .control_operation_pair(OperationPairControl {
                    source: source.clone(),
                    related: OperationRelatedControl::Settled {
                        operation,
                        session: destination.session.clone(),
                        turn,
                    },
                })
                .await,
            ErrorKind::Conflict,
            code,
        );
    }
    commit(
        &child,
        "settle-child",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })],
    )
    .await;
    let before = store.inspect(destination.session.clone()).await.unwrap();
    let receipt = store
        .control_operation_pair(OperationPairControl {
            source,
            related: OperationRelatedControl::Settled {
                operation: selected.operation,
                session: destination.session.clone(),
                turn: destination.turn.clone(),
            },
        })
        .await
        .unwrap();
    assert!(receipt.destination.is_none());
    assert_eq!(
        store.inspect(destination.session.clone()).await.unwrap(),
        before
    );
    assert!(
        store
            .inspect_turn(session(), turn())
            .await
            .unwrap()
            .controls
            .paused
    );
}

#[tokio::test]
async fn destination_and_source_are_independent_fences_and_failed_writes_roll_back() {
    let (_directory, store) = store().await;
    let (parent, selected) = owning_operation(&store).await;
    let request = request(selected.clone(), "child");
    let mut stale = request.clone();
    stale.driver_state.expected = DriverStateRevision(1);
    assert_error(
        store.claim_from_operation(stale).await,
        ErrorKind::Conflict,
        "driver_state_revision_changed",
    );
    assert_absent(store.inspect(request.create.id.clone()).await);
    let ClaimOutcome::Acquired(child) = store.claim_from_operation(request.clone()).await.unwrap()
    else {
        panic!("known rejected reservation should leave the destination absent");
    };
    let other = source(&parent, "second-launch", "second-attempt").await;
    assert_error(
        store
            .claim_from_operation(self::request(other.clone(), "child"))
            .await,
        ErrorKind::Conflict,
        "session_exists",
    );
    drop(parent);
    let abandoned = self::request(other, "abandoned-child");
    assert_error(
        store.claim_from_operation(abandoned.clone()).await,
        ErrorKind::Conflict,
        "operation_claim_source_not_owned",
    );
    assert_absent(store.inspect(abandoned.create.id).await);
    assert_eq!(child.lease.binding().session, request.create.id);
}
