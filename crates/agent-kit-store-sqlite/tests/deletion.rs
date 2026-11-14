#[allow(dead_code)]
mod support;

use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role};
use agent_kit_core::turn::{JournalAction, TurnOutcome, TurnState};
use agent_kit_core::{Envelope, Error, ErrorKind, Fingerprint, MessageId, SessionId};
use agent_kit_sessions::{CreateSession, SessionStore};
use agent_kit_store_sqlite::SqliteStore;
use agent_kit_store_sqlite::context::ContextInstall;
use agent_kit_store_sqlite::deletion::{DeleteDependents, DeleteSession, SessionDeleted};
use agent_kit_store_sqlite::history::{
    HistorySeed, HistorySelection, RetainedHistory, SeededSession,
};
use support::{change, claim, commit, payload, private_directory, session, submission, turn};

fn project(configuration: &Envelope) -> Option<Fingerprint> {
    Fingerprint::of(configuration).ok()
}

fn create(id: SessionId, scope: &str) -> CreateSession {
    CreateSession {
        id,
        request: change("create"),
        configuration: payload(scope),
    }
}

async fn deletion(store: &SqliteStore) -> DeleteSession {
    DeleteSession {
        session: session(),
        scope: project(&payload("workspace")).unwrap(),
        request: change("delete"),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        expected_catalog_revision: store.catalog_entry(session()).await.unwrap().revision,
        dependents: None,
    }
}

async fn remove(
    store: &SqliteStore,
    request: DeleteSession,
) -> agent_kit_core::Result<SessionDeleted> {
    store.delete_idle(request, |_, _| Ok(()), |_| Ok(())).await
}

fn records(state: &TurnState) -> Vec<HistoryRecord> {
    state.history().records().to_vec()
}

fn copy_seed(history: RetainedHistory) -> agent_kit_core::Result<HistorySeed> {
    Ok(HistorySeed {
        records: history.into_records(),
        provenance: payload("portable prefix"),
    })
}

fn user_message() -> HistoryRecord {
    HistoryRecord::Message(Message {
        id: MessageId::new("message").unwrap(),
        role: Role::User,
        phase: None,
        content: vec![Content::Text("Retained independently by the fork".into())],
        provenance: Provenance {
            source: "fixture".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    })
}

fn success() -> TurnOutcome {
    TurnOutcome {
        status: OutcomeStatus::Succeeded,
        account: None,
        evidence: vec![],
    }
}

#[tokio::test]
async fn removes_only_owned_rows_and_replays_exact_receipt_after_reopen() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&path, project).unwrap();
    let original = create(session(), "workspace");
    store.create(original.clone()).await.unwrap();
    let basis = store
        .context_history_with(session(), None, records)
        .await
        .unwrap()
        .basis;
    let input = submission("input", "original input");
    store.submit(session(), input.clone()).await.unwrap();
    let owner = claim(&store, "claim", vec![input.id.clone()]).await;
    let message = user_message();
    commit(
        &owner,
        "finish",
        vec![
            JournalAction::AppendHistory(vec![message.clone()]),
            JournalAction::Settle(success()),
        ],
    )
    .await;
    drop(owner);
    store
        .install_context(ContextInstall {
            session: session(),
            turn: turn(),
            expected_context: basis,
            expected_outcome: Fingerprint::of(&success()).unwrap(),
            replacement: HistorySeed {
                records: vec![message.clone()],
                provenance: payload("context"),
            },
            covered_through: None,
        })
        .await
        .unwrap();
    let before = store
        .retained_history_with(session(), HistorySelection::Current, records)
        .await
        .unwrap();
    let fork = SessionId::new("fork").unwrap();
    let fork_request = SeededSession {
        create: create(fork.clone(), "workspace"),
        source: session(),
        expected_history: before.basis,
        intent: Fingerprint::of(&"fork").unwrap(),
    };
    let fork_created = store
        .create_seeded(fork_request.clone(), records, copy_seed)
        .await
        .unwrap();
    let neighbor = SessionId::new("neighbor").unwrap();
    store
        .create(create(neighbor.clone(), "another workspace"))
        .await
        .unwrap();
    let request = deletion(&store).await;
    let mut foreign = request.clone();
    foreign.scope = project(&payload("another workspace")).unwrap();
    assert_eq!(
        remove(&store, foreign.clone()).await.unwrap_err().code,
        "session_missing"
    );
    let receipt = remove(&store, request.clone()).await.unwrap();
    assert_eq!(receipt.session, session());
    assert_eq!(receipt.request, request.request);
    assert_eq!(
        store.inspect(session()).await.unwrap_err().code,
        "session_missing"
    );
    assert_eq!(
        store.submit(session(), input).await.unwrap_err().code,
        "session_missing"
    );
    assert_eq!(
        store.catalog_entry(session()).await.unwrap_err().code,
        "session_catalog_entry_missing"
    );
    drop(store);

    let connection = rusqlite::Connection::open(&path).unwrap();
    // Removing the session row removes every row it owns; only its
    // retirement remains.
    for sql in [
        "SELECT count(*) FROM context_replacements WHERE session=?1",
        "SELECT count(*) FROM history_views WHERE session=?1",
        "SELECT count(*) FROM submissions WHERE session=?1",
        "SELECT count(*) FROM submission_links WHERE session=?1 OR parent_session=?1",
        "SELECT count(*) FROM requests WHERE session=?1",
        "SELECT count(*) FROM turns WHERE session=?1",
        "SELECT count(*) FROM turn_parts WHERE session=?1",
        "SELECT count(*) FROM turn_messages WHERE session=?1",
        "SELECT count(*) FROM sessions WHERE id=?1",
    ] {
        assert_eq!(
            connection
                .query_row(sql, [session().as_str()], |row| row.get::<_, i64>(0))
                .unwrap(),
            0,
            "{sql}"
        );
    }
    assert_eq!(
        connection
            .query_row(
                "SELECT count(*) FROM session_retirements WHERE session=?1",
                [session().as_str()],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
    drop(connection);

    let store = SqliteStore::open_cataloged(&path, project).unwrap();
    assert_eq!(
        store.deletion_receipt(request.clone()).await.unwrap(),
        Some(receipt.clone())
    );
    assert_eq!(
        store
            .delete_idle(
                request.clone(),
                |_, _| panic!("retired"),
                |_| panic!("retired")
            )
            .await
            .unwrap(),
        receipt
    );
    assert_eq!(store.deletion_receipt(foreign).await.unwrap(), None);
    let mut changed = request;
    changed.expected_catalog_revision += 1;
    assert_eq!(
        store.deletion_receipt(changed).await.unwrap_err().code,
        "request_identity_reused"
    );
    assert_eq!(
        store.create(original.clone()).await.unwrap_err().code,
        "session_identity_retired"
    );
    assert_eq!(
        store
            .create_seeded(fork_request, records, copy_seed)
            .await
            .unwrap(),
        fork_created
    );
    let fork_history = store
        .retained_history_with(fork.clone(), HistorySelection::Current, records)
        .await
        .unwrap();
    assert_eq!(fork_history.seed.as_ref().unwrap().records, vec![message]);
    let retired_fork = SeededSession {
        create: original,
        source: fork.clone(),
        expected_history: fork_history.basis,
        intent: Fingerprint::of(&"second fork").unwrap(),
    };
    assert_eq!(
        store
            .create_seeded(retired_fork, records, copy_seed)
            .await
            .unwrap_err()
            .code,
        "session_identity_retired"
    );
    assert_eq!(
        store
            .list_catalog(project(&payload("workspace")).unwrap(), 0, None)
            .await
            .unwrap()
            .entries[0]
            .session,
        fork
    );
    assert!(store.inspect(neighbor).await.is_ok());
}

#[tokio::test]
async fn rejects_stale_or_unsettled_deletion_and_preserves_owner_policy() {
    let directory = private_directory();
    let store =
        SqliteStore::open_cataloged(directory.path().join("sessions.sqlite"), project).unwrap();
    store.create(create(session(), "workspace")).await.unwrap();
    let stale_catalog = deletion(&store).await;
    let mut catalog = store.catalog_entry(session()).await.unwrap();
    catalog.label = Some("Renamed".into());
    store.replace_catalog_entry(catalog).await.unwrap();
    assert_eq!(
        remove(&store, stale_catalog).await.unwrap_err().code,
        "session_catalog_revision_changed"
    );
    let stale_session = deletion(&store).await;
    store
        .submit(session(), submission("queued", "accepted input"))
        .await
        .unwrap();
    assert_eq!(
        remove(&store, stale_session).await.unwrap_err().code,
        "stale_session_revision"
    );
    assert_eq!(
        remove(&store, deletion(&store).await)
            .await
            .unwrap_err()
            .code,
        "session_deletion_requires_empty_queue"
    );
    let owner = claim(&store, "claim", vec![change("queued")]).await;
    assert_eq!(
        remove(&store, deletion(&store).await)
            .await
            .unwrap_err()
            .code,
        "session_deletion_requires_idle"
    );
    commit(&owner, "finish", vec![JournalAction::Settle(success())]).await;
    let request = deletion(&store).await;
    assert!(store.inspect(session()).await.unwrap().current.is_none());
    assert_eq!(
        remove(&store, request.clone()).await.unwrap_err().code,
        "session_deletion_requires_idle"
    );
    drop(owner);

    let refused = store
        .delete_idle(
            request.clone(),
            |configuration, state| {
                assert_eq!(configuration, &payload("workspace"));
                assert!(state.is_initial());
                Err(Error::new(ErrorKind::Conflict, "owner_refuses_session"))
            },
            |_| panic!("metadata guard refused"),
        )
        .await
        .unwrap_err();
    assert_eq!(refused.code, "owner_refuses_session");
    let refused = store
        .delete_idle(
            request.clone(),
            |_, _| Ok(()),
            |snapshot| {
                assert_eq!(snapshot.binding().turn, turn());
                assert_eq!(snapshot.outcome(), Some(&success()));
                Err(Error::new(ErrorKind::Conflict, "owner_refuses_turn"))
            },
        )
        .await
        .unwrap_err();
    assert_eq!(refused.code, "owner_refuses_turn");
    assert_eq!(store.deletion_receipt(request.clone()).await.unwrap(), None);
    assert!(
        store
            .input(session(), change("queued"))
            .await
            .unwrap()
            .is_some()
    );
    remove(&store, request).await.unwrap();
}

#[tokio::test]
async fn deletion_and_submit_serialize_without_losing_accepted_input() {
    let directory = private_directory();
    let store =
        SqliteStore::open_cataloged(directory.path().join("sessions.sqlite"), project).unwrap();
    store.create(create(session(), "workspace")).await.unwrap();
    let request = deletion(&store).await;
    let (retired, accepted) = tokio::join!(
        remove(&store, request),
        store.submit(session(), submission("input", "work"))
    );
    match (retired, accepted) {
        (Ok(_), Err(error)) => assert_eq!(error.code, "session_missing"),
        (Err(error), Ok(_)) => {
            assert_eq!(error.code, "stale_session_revision");
            assert_eq!(store.inspect(session()).await.unwrap().queued.len(), 1);
        }
        result => panic!("unexpected deletion/admission outcomes: {result:?}"),
    }
}

#[tokio::test]
async fn a_queued_dependent_rolls_back_the_entire_reviewed_retirement() {
    let directory = private_directory();
    let store =
        SqliteStore::open_cataloged(directory.path().join("sessions.sqlite"), project).unwrap();
    let first = SessionId::new("first").unwrap();
    let second = SessionId::new("second").unwrap();
    store.create(create(session(), "workspace")).await.unwrap();
    store.create(create(first.clone(), "owned")).await.unwrap();
    store.create(create(second.clone(), "owned")).await.unwrap();
    store
        .submit(second.clone(), submission("pending", "Leave this queued"))
        .await
        .unwrap();

    let scope = project(&payload("owned")).unwrap();
    let preview = store.retirement_dependencies(scope).await.unwrap();
    assert_eq!(preview.sessions, vec![first.clone(), second.clone()]);
    let mut request = deletion(&store).await;
    request.dependents = Some(DeleteDependents {
        scope,
        basis: preview.basis,
    });
    let error = store
        .delete_idle_with_dependents(
            request.clone(),
            None,
            |_, _| Ok(()),
            |_, _| Ok(()),
            |_| Ok(()),
        )
        .await
        .unwrap_err();
    assert_eq!(error.code, "session_deletion_requires_empty_queue");
    assert!(store.deletion_receipt(request).await.unwrap().is_none());
    assert!(store.inspect(session()).await.is_ok());
    assert!(store.inspect(first).await.is_ok());
    assert_eq!(store.inspect(second).await.unwrap().queued.len(), 1);
}
