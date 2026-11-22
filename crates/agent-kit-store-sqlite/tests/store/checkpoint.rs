use super::*;
use agent_kit_core::ChangeId;
use agent_kit_core::turn::TurnBinding;

async fn begin(store: &SqliteStore, id: &str, input: ChangeId) -> ClaimedTurn {
    let request = ClaimRequest {
        id: change(&format!("claim-{id}")),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        selection: TurnSelection::New {
            turn: TurnId::new(id).unwrap(),
            inputs: vec![input],
        },
    };
    let ClaimOutcome::Acquired(claim) = store.claim(request).await.unwrap() else {
        panic!("expected new turn")
    };
    claim
}

async fn start(store: &SqliteStore, id: &str) -> ClaimedTurn {
    let input = submission(&format!("input-{id}"), "work");
    store.submit(session(), input.clone()).await.unwrap();
    begin(store, id, input.id).await
}

async fn finish(claimed: &ClaimedTurn) {
    commit(
        claimed,
        "finish",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })],
    )
    .await;
}

async fn check(
    store: &SqliteStore,
    owner: &ClaimedTurn,
    scope: Fingerprint,
    name: &str,
) -> (WaitId, agent_kit_store_sqlite::checkpoint::PrivateContext) {
    let wait = open_wait(owner, name).await;
    let context = store
        .private_context(owner.lease.binding().clone(), scope, wait.clone(), scope)
        .await
        .unwrap();
    (wait, context)
}

#[tokio::test]
async fn compatible_context_and_a_pending_fork_resume_from_their_own_committed_snapshots() {
    let (directory, store) = store().await;
    let scope = Fingerprint::of(&"settings and grants").unwrap();
    let first = start(&store, "first").await;
    let (wait, context) = check(&store, &first, scope, "initial").await;
    let id = context.id();
    assert!(context.is_trunk() && context.snapshot().is_none());
    assert_error(
        store
            .private_context(first.lease.binding().clone(), scope, wait.clone(), scope)
            .await,
        ErrorKind::Conflict,
        "private_context_already_owned",
    );
    answer(&first, &wait).await;
    let seed = payload("earlier private observation");
    assert!(context.publish(seed.clone(), |_| Ok(true)).await.unwrap());

    let (wa, trunk) = check(&store, &first, scope, "trunk").await;
    let (wb, fork) = check(&store, &first, scope, "fork").await;
    assert!(!fork.is_trunk());
    assert_eq!(fork.snapshot(), Some(&seed));
    answer(&first, &wa).await;
    let latest = payload("subsequent committed observation");
    assert!(trunk.publish(latest.clone(), |_| Ok(true)).await.unwrap());
    drop(fork);
    drop(first);
    drop(store);

    let path = directory.path().join("sessions.sqlite");
    let seeds = || {
        rusqlite::Connection::open(&path)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM private_branches", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap()
    };
    assert_eq!(
        seeds(),
        1,
        "only the unconsumed fork may retain a private seed"
    );
    let store = SqliteStore::open(&path).unwrap();
    let ClaimOutcome::Acquired(owner) = store
        .recover(RecoveryRequest {
            id: change("recover"),
            session: session(),
            turn: TurnId::new("first").unwrap(),
            expected_epoch: 1,
        })
        .await
        .unwrap()
    else {
        panic!("expected recovered owner")
    };
    let fork = store
        .private_context(owner.lease.binding().clone(), scope, wb.clone(), scope)
        .await
        .unwrap();
    assert_eq!(fork.id(), id);
    assert_eq!(fork.snapshot(), Some(&seed));
    assert!(!fork.is_trunk());
    answer(&owner, &wb).await;
    assert_eq!(seeds(), 0);
    assert!(
        !fork
            .publish(payload("fork observation"), |_| panic!(
                "fork cannot publish"
            ))
            .await
            .unwrap()
    );

    let (wait, aborted) = check(&store, &owner, scope, "aborted").await;
    answer(&owner, &wait).await;
    assert!(
        !aborted
            .publish(payload("unverified"), |_| Ok(false))
            .await
            .unwrap()
    );
    let (wait, stale) = check(&store, &owner, scope, "stale").await;
    answer(&owner, &wait).await;
    finish(&owner).await;
    assert!(!stale.publish(payload("late"), |_| Ok(true)).await.unwrap());
    drop(owner);
    let second = start(&store, "second").await;
    let (_, restored) = check(&store, &second, scope, "next").await;
    assert!(restored.is_trunk());
    assert_eq!(restored.id(), id);
    assert_eq!(restored.snapshot(), Some(&latest));
    assert!(store.history(session(), None).await.unwrap().is_empty());
}

#[tokio::test]
async fn changing_scope_or_revising_history_retires_private_context_and_outstanding_owners() {
    let (_directory, store) = store().await;
    let source = start(&store, "first").await;
    let a = Fingerprint::of(&"account-a").unwrap();
    let b = Fingerprint::of(&"account-b").unwrap();
    let (wait, original) = check(&store, &source, a, "source").await;
    let id = original.id();
    answer(&source, &wait).await;
    assert!(
        original
            .publish(payload("account a data"), |_| Ok(true))
            .await
            .unwrap()
    );
    let (prior_wait, old) = check(&store, &source, a, "old").await;
    let (other_wait, foreign) = check(&store, &source, b, "foreign").await;
    assert!(foreign.is_trunk() && foreign.snapshot().is_none());
    answer(&source, &prior_wait).await;
    assert!(
        !old.publish(payload("late old context"), |_| Ok(true))
            .await
            .unwrap()
    );

    let (wait, returned) = check(&store, &source, a, "returned").await;
    assert!(returned.snapshot().is_none());
    assert_ne!(id, returned.id());
    answer(&source, &other_wait).await;
    assert!(
        !foreign
            .publish(payload("late b"), |_| Ok(true))
            .await
            .unwrap()
    );
    let previous_id = returned.id();
    answer(&source, &wait).await;
    assert!(
        returned
            .publish(payload("before rewind"), |_| Ok(true))
            .await
            .unwrap()
    );
    finish(&source).await;
    drop(source);
    let retained = current_history(&store, session()).await;
    let input = submission("replacement", "new branch");
    store
        .revise_history(
            HistoryRevision {
                session: session(),
                request: change("rewind"),
                expected_revision: store.inspect(session()).await.unwrap().revision,
                expected_history: retained.basis,
                intent: Fingerprint::of(&"rewind").unwrap(),
                replacement: input.clone(),
            },
            |state| state.history().records().to_vec(),
            copy_seed,
        )
        .await
        .unwrap();
    let after = begin(&store, "after", input.id).await;
    let (wait, current) = check(&store, &after, a, "current").await;
    assert_ne!(current.id(), previous_id);
    assert!(current.snapshot().is_none());
    let stale = TurnBinding {
        epoch: after.lease.binding().epoch + 1,
        ..after.lease.binding().clone()
    };
    assert_error(
        store.private_context(stale, a, wait, a).await,
        ErrorKind::Conflict,
        "private_context_source_changed",
    );
}
