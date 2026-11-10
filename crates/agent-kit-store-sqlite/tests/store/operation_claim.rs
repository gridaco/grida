use super::*;
use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::driver_state::{DriverStateChange, DriverStateRevision};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::ToolArguments;
use agent_kit_core::tools::{
    Inventory, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{ControlDirective, OperationInput, OperationRecord};
use agent_kit_core::{AttemptId, BindingId, BoxFuture, OperationId, PrincipalId, ScopeId, ToolId};
use agent_kit_sessions::SessionView;
use agent_kit_store_sqlite::{OperationClaim, OperationClaimSource};

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
