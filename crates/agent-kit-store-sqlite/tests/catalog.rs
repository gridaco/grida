#[allow(dead_code)]
mod support;

use agent_kit_core::{Envelope, ErrorKind, Fingerprint, SessionId};
use agent_kit_sessions::{CreateSession, SessionStore};
use agent_kit_store_sqlite::SqliteStore;
use support::{change, payload, private_directory};

fn project(config: &Envelope) -> Option<Fingerprint> {
    match config.bytes() {
        b"a" | b"b" => Fingerprint::of(&config.bytes()).ok(),
        _ => None,
    }
}

fn create(id: &str, scope: &str) -> CreateSession {
    CreateSession {
        id: SessionId::new(id).unwrap(),
        request: change("create"),
        configuration: payload(scope),
    }
}

#[tokio::test]
async fn catalog_migration_and_paging_keep_scope_and_creation_order() {
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let legacy = SqliteStore::open(&filename).unwrap();
    for n in 0..34 {
        legacy
            .create(create(&format!("a-{n:02}"), "a"))
            .await
            .unwrap();
        legacy
            .create(create(&format!("b-{n:02}"), "b"))
            .await
            .unwrap();
    }
    legacy
        .create(create("unprojected", "unknown"))
        .await
        .unwrap();
    drop(legacy);
    let legacy = rusqlite::Connection::open(&filename).unwrap();
    legacy
        .execute_batch("DROP TABLE session_catalog; PRAGMA user_version=5;")
        .unwrap();
    drop(legacy);

    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let scope_a = project(&payload("a")).unwrap();
    let scope_b = project(&payload("b")).unwrap();
    let page = store.list_catalog(scope_a, None).await.unwrap();
    let expected: Vec<_> = (2..34)
        .rev()
        .map(|n| SessionId::new(format!("a-{n:02}")).unwrap())
        .collect();
    assert_eq!(page.sessions, expected);
    assert_eq!(page.next_after, expected.last().cloned());
    let error = match store.list_catalog(scope_b, page.next_after.clone()).await {
        Err(error) => error,
        Ok(_) => panic!("foreign cursor must be rejected"),
    };
    assert_eq!(error.kind, ErrorKind::InvalidInput);
    assert_eq!(error.code, "invalid_session_cursor");
    let newest = create("a-new", "a");
    let new_id = newest.id.clone();
    let accepted = store.create(newest.clone()).await.unwrap();
    assert_eq!(store.create(newest).await.unwrap(), accepted);
    assert_eq!(
        store.list_catalog(scope_a, None).await.unwrap().sessions[0],
        new_id
    );
    drop(store);
    let reopened = SqliteStore::open_cataloged(&filename, project).unwrap();
    let tail = reopened
        .list_catalog(scope_a, page.next_after)
        .await
        .unwrap();
    assert_eq!(
        tail.sessions,
        [
            SessionId::new("a-01").unwrap(),
            SessionId::new("a-00").unwrap()
        ]
    );
    assert!(tail.next_after.is_none());
    assert!(
        reopened
            .list_catalog(Fingerprint::of(&"empty-scope").unwrap(), None)
            .await
            .unwrap()
            .sessions
            .is_empty()
    );
    let view = reopened.inspect(new_id).await.unwrap();
    assert!(view.current.is_none() && view.latest.is_none());
}
