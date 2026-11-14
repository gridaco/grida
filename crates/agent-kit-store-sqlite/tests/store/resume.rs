use super::*;
use agent_kit_store_sqlite::ResumeCompanion;

async fn paused_claim(store: &SqliteStore, binding: &TurnBinding, id: &str) -> ClaimRequest {
    let view = store.inspect(binding.session.clone()).await.unwrap();
    let current = view.current.unwrap();
    assert_eq!(&current.binding, binding);
    ClaimRequest {
        id: change(id),
        session: binding.session.clone(),
        expected_revision: view.revision,
        selection: TurnSelection::ResumePaused {
            turn: binding.turn.clone(),
            epoch: binding.epoch,
            position: current.position,
            control_revision: current.controls.revision,
        },
    }
}

async fn suspend_source(owner: &ClaimedTurn, operation: &OperationClaimSource) {
    commit(
        owner,
        "suspend-source",
        vec![
            JournalAction::CompleteAttempt {
                operation: operation.operation.clone(),
                attempt: operation.attempt.clone(),
                outcome: OperationOutcome::Tool(ToolOutcome::failed("fixture")),
            },
            JournalAction::Suspend,
        ],
    )
    .await;
}

async fn paused_source_pair(
    store: &SqliteStore,
) -> (OperationClaimSource, ClaimRequest, ClaimedTurn) {
    let (parent, operation) = owning_operation(store).await;
    let child = claim_destination(store, request(operation.clone(), "child")).await;
    store
        .control_operation_pair(OperationPairControl {
            source: turn_control(
                store,
                parent.lease.binding(),
                "pause-source",
                ControlDirective::Pause,
            )
            .await,
            related: OperationRelatedControl::Apply {
                operation: operation.operation.clone(),
                request: turn_control(
                    store,
                    child.lease.binding(),
                    "pause-child",
                    ControlDirective::Pause,
                )
                .await,
            },
        })
        .await
        .unwrap();
    suspend_source(&parent, &operation).await;
    let resume = paused_claim(store, parent.lease.binding(), "resume-source").await;
    (operation, resume, child)
}

async fn related_resume(
    store: &SqliteStore,
    operation: &OperationClaimSource,
    child: &TurnBinding,
) -> ResumeCompanion {
    ResumeCompanion::Related(OperationRelatedControl::Apply {
        operation: operation.operation.clone(),
        request: state_control(
            turn_control(store, child, "resume-related", ControlDirective::Resume).await,
            1,
            "related-released",
        ),
    })
}

#[tokio::test]
async fn paused_claim_updates_opaque_state_and_acquires_only_one_lease() {
    let (_directory, store) = store().await;
    let (_parent, operation) = owning_operation(&store).await;
    let child = claim_destination(&store, request(operation, "child")).await;
    commit(
        &child,
        "pause-child",
        vec![
            JournalAction::Control(ControlDirective::Pause),
            JournalAction::Suspend,
        ],
    )
    .await;
    let request = paused_claim(&store, child.lease.binding(), "resume-child").await;
    let state = DriverStateChange {
        expected: DriverStateRevision(1),
        value: Some(payload("changed-with-resume")),
    };
    let companion = ResumeCompanion::DriverState(state.clone());
    assert_error(
        store.resume_with(request.clone(), companion.clone()).await,
        ErrorKind::Conflict,
        "turn_still_owned",
    );
    drop(child);
    let mut changed = state;
    changed.expected = DriverStateRevision(0);
    assert_error(
        store
            .resume_with(
                request.clone(),
                ResumeCompanion::DriverState(changed.clone()),
            )
            .await,
        ErrorKind::Conflict,
        "driver_state_revision_changed",
    );
    assert!(
        store
            .resume_receipt(request.clone())
            .await
            .unwrap()
            .is_none()
    );
    let (left, right) = tokio::join!(
        store.resume_with(request.clone(), companion.clone()),
        store.resume_with(request.clone(), companion),
    );
    let child = match (left.unwrap().claim, right.unwrap().claim) {
        (ClaimOutcome::Acquired(child), ClaimOutcome::Existing(view))
        | (ClaimOutcome::Existing(view), ClaimOutcome::Acquired(child)) => {
            assert_eq!(&view.binding, child.lease.binding());
            child
        }
        _ => panic!("expected one new owner"),
    };
    let snapshot = child.lease.journal().load().await.unwrap();
    assert_eq!(snapshot.binding().epoch, 2);
    assert!(!snapshot.controls().paused);
    assert_eq!(snapshot.driver_state().revision(), DriverStateRevision(2));
    assert_eq!(
        snapshot.driver_state().value(),
        Some(&payload("changed-with-resume"))
    );
    assert_eq!(
        store
            .inspect(request.session.clone())
            .await
            .unwrap()
            .driver_state,
        *snapshot.driver_state()
    );
    assert!(matches!(
        store.claim(request.clone()).await.unwrap(),
        ClaimOutcome::Existing(_)
    ));
    assert_error(
        store
            .resume_with(request, ResumeCompanion::DriverState(changed))
            .await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
}

#[tokio::test]
async fn related_resume_retains_readiness_after_reopen_without_issuing_another_lease() {
    let (directory, store) = store().await;
    let (operation, request, child) = paused_source_pair(&store).await;
    let binding = child.lease.binding().clone();
    let companion = related_resume(&store, &operation, &binding).await;
    assert_error(
        store.resume_with(request.clone(), companion.clone()).await,
        ErrorKind::Conflict,
        "resume_destination_not_suspended",
    );
    commit(&child, "suspend-child", vec![JournalAction::Suspend]).await;
    assert_error(
        store.resume_with(request.clone(), companion.clone()).await,
        ErrorKind::Conflict,
        "turn_still_owned",
    );
    drop(child);
    let before = store.inspect(binding.session.clone()).await.unwrap();
    let mut stale = request.clone();
    stale.expected_revision = SessionRevision(0);
    assert_error(
        store.resume_with(stale, companion.clone()).await,
        ErrorKind::Conflict,
        "stale_session_revision",
    );
    assert_eq!(
        store.inspect(binding.session.clone()).await.unwrap(),
        before
    );
    let committed = store
        .resume_with(request.clone(), companion.clone())
        .await
        .unwrap();
    let ClaimOutcome::Acquired(parent) = committed.claim else {
        panic!("expected the source lease");
    };
    let parent_binding = parent.lease.binding().clone();
    let related = committed.related.unwrap();
    store.verify(related.turn.clone().unwrap()).await.unwrap();
    drop(parent);
    drop(store);

    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let receipt = store
        .resume_receipt(request.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(receipt.turn.binding, parent_binding);
    assert_eq!(receipt.turn.disposition, TurnDisposition::Interrupted);
    assert_eq!(receipt.related, Some(related.clone()));
    let child = store.inspect(binding.session.clone()).await.unwrap();
    let state = child.current.unwrap();
    assert!(!state.controls.paused);
    assert_eq!(state.disposition, TurnDisposition::Suspended);
    assert_eq!(state.binding, binding);
    let stale_child = ClaimRequest {
        id: change("start-related"),
        session: binding.session.clone(),
        expected_revision: child.revision,
        selection: TurnSelection::Resume {
            turn: binding.turn.clone(),
            epoch: binding.epoch,
            position: state.position,
        },
    };
    store
        .control_operation_pair(OperationPairControl {
            source: turn_control(
                &store,
                &parent_binding,
                "pause-source-again",
                ControlDirective::Pause,
            )
            .await,
            related: OperationRelatedControl::Apply {
                operation: operation.operation,
                request: turn_control(
                    &store,
                    &binding,
                    "pause-related-again",
                    ControlDirective::Pause,
                )
                .await,
            },
        })
        .await
        .unwrap();
    assert_error(
        store.claim(stale_child).await,
        ErrorKind::Conflict,
        "stale_session_revision",
    );
    let replay = store.resume_with(request, companion).await.unwrap();
    assert!(matches!(replay.claim, ClaimOutcome::Existing(view)
        if view.binding == receipt.turn.binding && view.controls.paused));
    assert_eq!(replay.related, Some(related));
    assert!(
        store
            .inspect_turn(binding.session, binding.turn)
            .await
            .unwrap()
            .controls
            .paused
    );
}

#[tokio::test]
async fn competing_related_control_serializes_with_paused_source_claim() {
    let (_directory, store) = store().await;
    let (operation, request, child) = paused_source_pair(&store).await;
    let binding = child.lease.binding().clone();
    commit(&child, "suspend-child", vec![JournalAction::Suspend]).await;
    drop(child);
    let companion = related_resume(&store, &operation, &binding).await;
    let pause = state_control(
        turn_control(
            &store,
            &binding,
            "pause-independent",
            ControlDirective::Pause,
        )
        .await,
        1,
        "independent-block",
    );
    let (resumed, blocked) = tokio::join!(
        store.resume_with(request.clone(), companion),
        store.control(pause),
    );
    let child = store.inspect(binding.session).await.unwrap();
    match (resumed, blocked) {
        (Ok(resumed), Err(blocked)) => {
            assert_eq!(blocked.code, "stale_session_revision");
            assert!(matches!(resumed.claim, ClaimOutcome::Acquired(_)));
            assert!(!child.current.unwrap().controls.paused);
            assert_eq!(
                child.driver_state.value(),
                Some(&payload("related-released"))
            );
        }
        (Err(resumed), Ok(_)) => {
            assert_eq!(resumed.code, "stale_session_revision");
            assert!(store.resume_receipt(request).await.unwrap().is_none());
            assert!(
                store
                    .inspect_turn(session(), turn())
                    .await
                    .unwrap()
                    .controls
                    .paused
            );
            assert!(child.current.unwrap().controls.paused);
            assert_eq!(
                child.driver_state.value(),
                Some(&payload("independent-block"))
            );
        }
        _ => panic!("a changed companion must roll back the source claim"),
    }
}

#[tokio::test]
async fn exact_related_readiness_can_reclaim_once_after_the_source_is_interrupted() {
    let (directory, store) = store().await;
    let (operation, request, child) = paused_source_pair(&store).await;
    let binding = child.lease.binding().clone();
    commit(&child, "suspend-child", vec![JournalAction::Suspend]).await;
    drop(child);
    let companion = related_resume(&store, &operation, &binding).await;
    let result = store.resume_with(request.clone(), companion).await.unwrap();
    let ClaimOutcome::Acquired(parent) = result.claim else {
        panic!("expected the source lease");
    };
    let parent_binding = parent.lease.binding().clone();
    drop(parent);
    drop(store);

    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let receipt = store.resume_receipt(request).await.unwrap().unwrap();
    assert_eq!(receipt.turn.disposition, TurnDisposition::Interrupted);
    assert_eq!(receipt.turn.binding, parent_binding);
    let related = receipt.related.unwrap();
    let basis = related.turn.unwrap();
    let recorded = basis.record();
    assert_eq!(recorded.binding, binding);
    let wake = ClaimRequest {
        id: change("resume-from-related-receipt"),
        session: related.session,
        expected_revision: related.revision,
        selection: TurnSelection::Resume {
            turn: recorded.binding.turn.clone(),
            epoch: recorded.binding.epoch,
            position: recorded.position,
        },
    };
    let (left, right) = tokio::join!(store.claim(wake.clone()), store.claim(wake));
    let child = match (left.unwrap(), right.unwrap()) {
        (ClaimOutcome::Acquired(child), ClaimOutcome::Existing(observed))
        | (ClaimOutcome::Existing(observed), ClaimOutcome::Acquired(child)) => {
            assert_eq!(&observed.binding, child.lease.binding());
            child
        }
        _ => panic!("the exact wake must acquire only one owner"),
    };
    assert_eq!(child.lease.binding().epoch, binding.epoch + 1);
    assert_eq!(
        store.inspect_turn(session(), turn()).await.unwrap(),
        receipt.turn
    );
    store
        .control_operation_pair(OperationPairControl {
            source: turn_control(
                &store,
                &parent_binding,
                "pause-source-again",
                ControlDirective::Pause,
            )
            .await,
            related: OperationRelatedControl::Apply {
                operation: operation.operation,
                request: turn_control(
                    &store,
                    child.lease.binding(),
                    "pause-child-again",
                    ControlDirective::Pause,
                )
                .await,
            },
        })
        .await
        .unwrap();
    assert!(child.lease.controls().read().await.unwrap().paused);
}

#[tokio::test]
async fn absent_companion_fences_old_epoch_and_cannot_join_an_ordinary_receipt() {
    let (_directory, store) = store().await;
    let (parent, operation) = owning_operation(&store).await;
    let child = request(operation.clone(), "child");
    let companion = ResumeCompanion::Related(OperationRelatedControl::Absent {
        session: child.create.id.clone(),
    });
    store
        .control(
            turn_control(
                &store,
                parent.lease.binding(),
                "pause-source",
                ControlDirective::Pause,
            )
            .await,
        )
        .await
        .unwrap();
    suspend_source(&parent, &operation).await;
    let ordinary = paused_claim(&store, parent.lease.binding(), "ordinary-resume").await;
    drop(parent);
    let ClaimOutcome::Acquired(parent) = store.claim(ordinary.clone()).await.unwrap() else {
        panic!("expected ordinary claim");
    };
    assert!(
        store
            .resume_receipt(ordinary.clone())
            .await
            .unwrap()
            .unwrap()
            .related
            .is_none()
    );
    assert_error(
        store.resume_with(ordinary, companion.clone()).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    store
        .control(
            turn_control(
                &store,
                parent.lease.binding(),
                "pause-source-again",
                ControlDirective::Pause,
            )
            .await,
        )
        .await
        .unwrap();
    commit(
        &parent,
        "suspend-source-again",
        vec![JournalAction::Suspend],
    )
    .await;
    let claim = paused_claim(&store, parent.lease.binding(), "resume-with-absence").await;
    drop(parent);
    let result = store.resume_with(claim, companion).await.unwrap();
    let ClaimOutcome::Acquired(parent) = result.claim else {
        panic!("expected resumed source");
    };
    assert_eq!(parent.lease.binding().epoch, 3);
    assert!(result.related.is_none());
    assert_error(
        store.claim_from_operation(child.clone()).await,
        ErrorKind::Conflict,
        "stale_writer_epoch",
    );
    assert_absent(store.inspect(child.create.id).await);
}
