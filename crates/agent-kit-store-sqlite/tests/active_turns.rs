#[allow(dead_code)]
mod support;

use agent_kit_core::{ErrorKind, SessionId, TurnId};
use agent_kit_sessions::{
    ClaimOutcome, CreateSession, RecoveryRequest, SessionStore, TurnDisposition,
};
use agent_kit_store_sqlite::SqliteStore;
use agent_kit_store_sqlite::context::UnpromptedClaim;
use support::{change, payload, private_directory};

#[tokio::test]
async fn pages_are_bounded_observations_and_cursor_survives_removal() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open(&path).unwrap();
    let mut leases = Vec::new();
    for index in 0..40 {
        let session = SessionId::new(format!("active-{index:02}")).unwrap();
        store
            .create(CreateSession {
                id: session.clone(),
                request: change("create"),
                configuration: payload("owner-defined"),
            })
            .await
            .unwrap();
        let history = store
            .context_history_with(session.clone(), None, |_| Vec::new())
            .await
            .unwrap();
        let claim = store
            .claim_unprompted(UnpromptedClaim {
                session,
                turn: TurnId::new("turn").unwrap(),
                request: change("claim"),
                expected_revision: history.session_revision,
                expected_context: history.basis,
                checkpoint: payload("checkpoint"),
            })
            .await
            .unwrap();
        let ClaimOutcome::Acquired(claim) = claim else {
            panic!("expected lease")
        };
        leases.push(claim);
    }
    store
        .create(CreateSession {
            id: SessionId::new("idle").unwrap(),
            request: change("create"),
            configuration: payload("idle"),
        })
        .await
        .unwrap();
    let first_id = SessionId::new("active-00").unwrap();
    let before = store.inspect(first_id.clone()).await.unwrap();
    let first = store.active_turn_page(None).await.unwrap();
    assert_eq!(first.entries.len(), 32);
    assert_eq!(first.entries[0].session, first_id);
    assert_eq!(first.entries[31].session.as_str(), "active-31");
    assert_eq!(first.next_after.as_ref().unwrap().as_str(), "active-31");
    assert_eq!(store.inspect(first_id.clone()).await.unwrap(), before);
    assert_eq!(
        before.current.unwrap().disposition,
        TurnDisposition::Running
    );
    let cursor = first.next_after.unwrap();
    let inserted = SessionId::new("active-00a").unwrap();
    store
        .create(CreateSession {
            id: inserted.clone(),
            request: change("create"),
            configuration: payload("inserted"),
        })
        .await
        .unwrap();
    let history = store
        .context_history_with(inserted.clone(), None, |_| Vec::new())
        .await
        .unwrap();
    let claim = store
        .claim_unprompted(UnpromptedClaim {
            session: inserted.clone(),
            turn: TurnId::new("turn").unwrap(),
            request: change("claim"),
            expected_revision: history.session_revision,
            expected_context: history.basis,
            checkpoint: payload("checkpoint"),
        })
        .await
        .unwrap();
    let ClaimOutcome::Acquired(claim) = claim else {
        panic!("expected lease")
    };
    leases.push(claim);
    let second = store.active_turn_page(Some(cursor.clone())).await.unwrap();
    assert_eq!(second.entries.len(), 8);
    assert!(second.next_after.is_none());
    assert_eq!(second.entries[0].session.as_str(), "active-32");
    assert!(
        store
            .active_turn_page(None)
            .await
            .unwrap()
            .entries
            .iter()
            .any(|entry| entry.session == inserted)
    );

    drop(leases);
    let interrupted = store
        .inspect_turn(first_id.clone(), TurnId::new("turn").unwrap())
        .await
        .unwrap();
    assert_eq!(interrupted.disposition, TurnDisposition::Interrupted);
    let stale = store
        .recover(RecoveryRequest {
            id: change("stale"),
            session: first_id,
            turn: TurnId::new("turn").unwrap(),
            expected_epoch: interrupted.binding.epoch + 1,
        })
        .await;
    assert_eq!(stale.err().unwrap().code, "recovery_state_mismatch");
    drop(store);

    // The cursor is a value, not a lookup of an anchor that must still exist.
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection
        .pragma_update(None, "foreign_keys", true)
        .unwrap();
    connection
        .execute("DELETE FROM sessions WHERE id=?1", [cursor.as_str()])
        .unwrap();
    drop(connection);
    let store = SqliteStore::open(&path).unwrap();
    let resumed = store.active_turn_page(Some(cursor)).await.unwrap();
    assert_eq!(resumed.entries, second.entries);
    assert!(resumed.next_after.is_none());
    assert!(
        store
            .active_turn_page(None)
            .await
            .unwrap()
            .entries
            .iter()
            .all(|entry| entry.session.as_str() != "idle")
    );
}

#[tokio::test]
async fn malformed_active_identity_is_reported_instead_of_skipped() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open(&path).unwrap();
    drop(store);
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection.execute(
        "INSERT INTO sessions(id,configuration,revision,paused,active_turn,next_input) VALUES('bad id',?1,0,0,'turn',0)",
        [serde_json::to_vec(&payload("configuration")).unwrap()],
    ).unwrap();
    drop(connection);
    let store = SqliteStore::open(&path).unwrap();
    let error = store.active_turn_page(None).await.unwrap_err();
    assert_eq!(error.kind, ErrorKind::InvalidState);
    assert_eq!(error.code, "stored_data_invalid");
    drop(store);
    for invalid in [
        rusqlite::types::Value::Blob(vec![0xff]),
        rusqlite::types::Value::Text("x".repeat(257)),
    ] {
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute("UPDATE sessions SET id='valid',active_turn=?1", [invalid])
            .unwrap();
        drop(connection);
        let store = SqliteStore::open(&path).unwrap();
        let error = store.active_turn_page(None).await.unwrap_err();
        assert_eq!(error.kind, ErrorKind::InvalidState);
        assert_eq!(error.code, "stored_data_invalid");
        drop(store);
    }
}

#[test]
fn an_active_turn_page_is_an_indexed_traversal() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    drop(SqliteStore::open(&path).unwrap());
    let connection = rusqlite::Connection::open(&path).unwrap();
    let query: String = connection.query_row(
        "EXPLAIN QUERY PLAN SELECT id,active_turn FROM sessions INDEXED BY sessions_active_turn_scan WHERE active_turn IS NOT NULL AND id>?1 ORDER BY id LIMIT 33",
        ["cursor"], |row| row.get(3),
    ).unwrap();
    assert!(
        query.contains("SEARCH") && query.contains("sessions_active_turn_scan"),
        "{query}"
    );
}
