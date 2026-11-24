use super::*;
use agent_kit_sessions::QueueAction;

async fn control(store: &SqliteStore, id: &str, action: SessionControl) -> ControlRequest {
    ControlRequest {
        id: change(id),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        action,
    }
}

fn ids(view: &agent_kit_sessions::SessionView) -> Vec<&str> {
    view.queued
        .iter()
        .map(|row| row.input.id.as_str())
        .collect()
}

async fn finish(owner: &ClaimedTurn) {
    commit(
        owner,
        "finished",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })],
    )
    .await;
}

#[tokio::test]
async fn checkout_and_admission_cannot_win_the_same_revision() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("a", "first"))
        .await
        .unwrap();
    let request = control(
        &store,
        "edit",
        SessionControl::CheckoutQueued { input: change("a") },
    )
    .await;
    let claim = ClaimRequest {
        id: change("claim-a"),
        session: session(),
        expected_revision: request.expected_revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs: vec![change("a")],
        },
    };
    let (checked_out, claimed) = tokio::join!(store.control(request), store.claim(claim));
    assert_ne!(checked_out.is_ok(), claimed.is_ok());
    let view = store.inspect(session()).await.unwrap();
    assert!(view.queued.is_empty());
    if checked_out.is_ok() {
        assert_error(claimed, ErrorKind::Conflict, "stale_session_revision");
        assert!(view.current.is_none());
        assert!(view.checkout.is_some());
        let claim = ClaimRequest {
            id: change("claim-with-held-input"),
            session: session(),
            expected_revision: view.revision,
            selection: TurnSelection::New {
                turn: turn(),
                inputs: vec![change("a")],
            },
        };
        assert_error(
            store.claim(claim).await,
            ErrorKind::Conflict,
            "input_not_queued",
        );
    } else {
        assert_error(checked_out, ErrorKind::Conflict, "stale_session_revision");
        assert!(view.current.is_some());
        assert!(view.checkout.is_none());
    }
}

#[tokio::test]
async fn checked_out_input_survives_other_work_and_reinserts_in_its_reserved_position() {
    let (directory, store) = store().await;
    let a = submission("a", "first");
    let b = submission("b", "second");
    let c = submission("c", "third");
    for input in [&a, &b, &c] {
        store.submit(session(), input.clone()).await.unwrap();
    }
    let checkout = control(
        &store,
        "edit",
        SessionControl::CheckoutQueued {
            input: b.id.clone(),
        },
    )
    .await;
    let receipt = store.control(checkout.clone()).await.unwrap();
    let view = store.inspect(session()).await.unwrap();
    assert_eq!(ids(&view), ["a", "c"]);
    let held = view.checkout.unwrap();
    assert_eq!(held.input, b);
    assert_eq!(
        held.disposition,
        InputDisposition::CheckedOut {
            checkout: checkout.id.clone()
        }
    );
    let withdraw = control(
        &store,
        "not-waiting",
        SessionControl::WithdrawQueued {
            input: b.id.clone(),
        },
    )
    .await;
    assert_error(
        store.control(withdraw).await,
        ErrorKind::Conflict,
        "input_not_queued",
    );
    let claim = claim(&store, "claim-a", vec![a.id.clone()]).await;
    finish(&claim).await;
    drop(claim);
    store
        .submit(session(), submission("d", "fourth"))
        .await
        .unwrap();
    let reorder = control(
        &store,
        "move-d",
        SessionControl::ReorderQueued {
            inputs: vec![change("d"), c.id.clone()],
        },
    )
    .await;
    store.control(reorder).await.unwrap();
    drop(store);

    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let view = reopened.inspect(session()).await.unwrap();
    assert_eq!(ids(&view), ["d", "c"]);
    assert_eq!(view.checkout.unwrap().input, b);
    assert_eq!(reopened.control(checkout.clone()).await.unwrap(), receipt);
    assert_eq!(
        reopened
            .queue_action_receipt(session(), checkout.id.clone())
            .await
            .unwrap(),
        Some(receipt)
    );
    let replacement = submission("b-revised", "revised second");
    let reinsert = ControlRequest {
        id: change("save"),
        session: session(),
        expected_revision: checkout.expected_revision,
        action: SessionControl::ReinsertQueued {
            checkout: checkout.id.clone(),
            replacement: Some(replacement.clone()),
        },
    };
    let receipt = reopened.control(reinsert.clone()).await.unwrap();
    let view = reopened.inspect(session()).await.unwrap();
    assert_eq!(ids(&view), ["b-revised", "d", "c"]);
    assert!(view.checkout.is_none());
    assert_eq!(
        receipt.queue_action,
        Some(QueueAction::Reinserted {
            checkout: checkout.id,
            input: replacement.id.clone()
        })
    );
    let original = reopened
        .input(session(), b.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(original.input, b);
    assert_eq!(
        original.disposition,
        InputDisposition::Superseded {
            replacement: replacement.id
        }
    );
    drop(reopened);

    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    assert_eq!(
        reopened
            .queue_action_receipt(session(), reinsert.id.clone())
            .await
            .unwrap(),
        Some(receipt.clone())
    );
    assert_eq!(reopened.control(reinsert).await.unwrap(), receipt);
}

#[tokio::test]
async fn checkout_reserves_capacity_and_can_restore_its_exact_original() {
    let (_directory, store) = store().await;
    let original = submission("preserve", "immutable accepted content");
    let acceptance = store.submit(session(), original.clone()).await.unwrap();
    for index in 0..255 {
        let input = submission(&format!("queued-{index}"), "waiting");
        store.submit(session(), input).await.unwrap();
    }
    let checkout = control(
        &store,
        "edit",
        SessionControl::CheckoutQueued {
            input: original.id.clone(),
        },
    )
    .await;
    store.control(checkout.clone()).await.unwrap();
    let extra = submission("extra", "no capacity");
    assert_error(
        store.submit(session(), extra).await,
        ErrorKind::LimitExceeded,
        "session_queue_full",
    );
    let another_checkout = control(
        &store,
        "second-edit",
        SessionControl::CheckoutQueued {
            input: change("queued-0"),
        },
    )
    .await;
    assert_error(
        store.control(another_checkout).await,
        ErrorKind::Conflict,
        "queue_checkout_open",
    );
    let mut restore = control(
        &store,
        "restore",
        SessionControl::ReinsertQueued {
            checkout: checkout.id,
            replacement: None,
        },
    )
    .await;
    let receipt = store.control(restore.clone()).await.unwrap();
    restore.expected_revision = receipt.revision;
    assert_eq!(store.control(restore.clone()).await.unwrap(), receipt);
    if let SessionControl::ReinsertQueued { replacement, .. } = &mut restore.action {
        *replacement = Some(submission("replacement", "different intent"));
    }
    assert_error(
        store.control(restore).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    let view = store.inspect(session()).await.unwrap();
    assert!(view.checkout.is_none());
    assert_eq!(view.queued.len(), 256);
    assert_eq!(view.queued[0].position, acceptance.position);
    assert_eq!(view.queued[0].input, original);
}

#[tokio::test]
async fn queued_transfer_is_atomic_and_replays_after_settlement_and_restart() {
    let (directory, store) = store().await;
    let initial = submission("root", "active");
    let queued = submission("followup", "steer");
    let unaccepted = submission("later", "keep waiting");
    for input in [&initial, &queued, &unaccepted] {
        store.submit(session(), input.clone()).await.unwrap();
    }
    let owner = claim(&store, "claim-root", vec![initial.id.clone()]).await;
    let state = owner.lease.journal().load().await.unwrap();
    let records = vec![history_message("steer", "new direction")];
    let mut transfer = control(
        &store,
        "transfer",
        SessionControl::TransferQueued {
            input: queued.id.clone(),
            turn: turn(),
            expected: ControlRevision(state.controls().revision.0 + 1),
            records: records.clone(),
        },
    )
    .await;
    // The store attempts both changes together. A failed journal precondition
    // keeps the source and the recipient untouched and writes no receipt.
    let error = store.control(transfer.clone()).await.unwrap_err();
    assert_eq!(error.kind, ErrorKind::Conflict);
    assert!(
        store
            .queue_action_receipt(session(), transfer.id.clone())
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        ids(&store.inspect(session()).await.unwrap()),
        ["followup", "later"]
    );
    assert!(
        owner
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .history()
            .records()
            .is_empty()
    );
    if let SessionControl::TransferQueued { expected, .. } = &mut transfer.action {
        *expected = state.controls().revision;
    }
    let receipt = store.control(transfer.clone()).await.unwrap();
    assert_eq!(
        receipt.queue_action,
        Some(QueueAction::Transferred {
            input: queued.id.clone(),
            turn: turn()
        })
    );
    assert_eq!(ids(&store.inspect(session()).await.unwrap()), ["later"]);
    assert_eq!(
        store.turn_submissions(session(), turn()).await.unwrap(),
        vec![initial]
    );
    assert_eq!(
        owner
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .history()
            .records(),
        records
    );
    finish(&owner).await;
    drop(owner);
    let too_late = control(
        &store,
        "too-late",
        SessionControl::TransferQueued {
            input: unaccepted.id.clone(),
            turn: turn(),
            expected: state.controls().revision,
            records: vec![history_message("late", "do not transfer")],
        },
    )
    .await;
    assert_error(
        store.control(too_late).await,
        ErrorKind::Conflict,
        "active_turn_mismatch",
    );
    drop(store);

    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    assert_eq!(
        reopened
            .queue_action_receipt(session(), transfer.id.clone())
            .await
            .unwrap(),
        Some(receipt.clone())
    );
    assert_eq!(reopened.control(transfer).await.unwrap(), receipt);
    assert_eq!(reopened.history(session(), None).await.unwrap(), records);
    let transferred = reopened
        .input(session(), queued.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(transferred.input, queued);
    assert_eq!(
        transferred.disposition,
        InputDisposition::Transferred { turn: turn() }
    );
    assert_eq!(ids(&reopened.inspect(session()).await.unwrap()), ["later"]);
}

#[tokio::test]
async fn version_five_queued_inputs_and_control_receipts_survive_the_additive_upgrade() {
    let (directory, store) = store().await;
    let path = directory.path().join("sessions.sqlite");
    let queued = submission("old", "retained before upgrade");
    let acceptance = store.submit(session(), queued.clone()).await.unwrap();
    let pause = control(&store, "old-pause", SessionControl::PauseAdmission).await;
    let receipt = store.control(pause.clone()).await.unwrap();
    drop(store);

    // Version 6 only adds these schema objects, so removing them from a
    // database before any new controls produces the original version 5 layout.
    let old = rusqlite::Connection::open(&path).unwrap();
    old.execute_batch(
        "DROP VIEW runnable_queue;
         DROP TABLE queue_transfers;
         DROP TABLE queue_checkouts;
         PRAGMA user_version=5;",
    )
    .unwrap();
    drop(old);

    let upgraded = SqliteStore::open(path).unwrap();
    let view = upgraded.inspect(session()).await.unwrap();
    assert!(view.admission_paused);
    assert_eq!(view.revision, receipt.revision);
    assert_eq!(view.queued[0].input, queued);
    assert!(view.checkout.is_none());
    assert_eq!(
        upgraded.submit(session(), queued).await.unwrap(),
        acceptance
    );
    assert_eq!(upgraded.control(pause).await.unwrap(), receipt);
}
