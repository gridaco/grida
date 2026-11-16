#[allow(dead_code)]
mod support;

use agent_kit_core::{Envelope, ErrorKind, Fingerprint, SessionId};
use agent_kit_sessions::{CreateSession, SessionStore};
use agent_kit_store_sqlite::SqliteStore;
use support::{change, payload, private_directory, submission};

fn project(configuration: &Envelope) -> Option<Fingerprint> {
    match configuration.bytes() {
        b"first" | b"second" => Fingerprint::of(&configuration.bytes()).ok(),
        _ => None,
    }
}

fn session(id: &str) -> SessionId {
    SessionId::new(id).unwrap()
}

async fn create(store: &SqliteStore, id: &str, configuration: &str) {
    store
        .create(CreateSession {
            id: session(id),
            request: change("create"),
            configuration: payload(configuration),
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn pages_include_every_scope_bucket_and_unprojected_session_without_mutation() {
    let directory = private_directory();
    let store =
        SqliteStore::open_cataloged(directory.path().join("sessions.sqlite"), project).unwrap();
    for index in (0..70).rev() {
        let id = format!("session-{index:02}");
        let configuration = match index % 3 {
            0 => "first",
            1 => "second",
            _ => "unprojected",
        };
        create(&store, &id, configuration).await;
        if index % 3 != 2 {
            let mut entry = store.catalog_entry(session(&id)).await.unwrap();
            entry.bucket = index % 5;
            store.replace_catalog_entry(entry).await.unwrap();
        }
    }
    store
        .submit(session("session-00"), submission("waiting", "retained"))
        .await
        .unwrap();
    let before = store.inspect(session("session-00")).await.unwrap();
    let mut after = None;
    let mut entries = Vec::new();
    let mut sizes = Vec::new();
    loop {
        let page = store.session_page(after).await.unwrap();
        sizes.push(page.entries.len());
        if page.next_after.is_some() {
            assert_eq!(page.next_after.as_ref(), page.entries.last());
        }
        entries.extend(page.entries);
        after = page.next_after;
        if after.is_none() {
            break;
        }
    }
    assert_eq!(sizes, [32, 32, 6]);
    let expected: Vec<_> = (0..70)
        .map(|index| session(&format!("session-{index:02}")))
        .collect();
    assert_eq!(entries, expected);
    assert_eq!(store.inspect(session("session-00")).await.unwrap(), before);
}

#[tokio::test]
async fn empty_and_exact_final_pages_terminate_without_a_cursor() {
    let store = SqliteStore::open_in_memory().unwrap();
    let empty = store.session_page(None).await.unwrap();
    assert!(empty.entries.is_empty() && empty.next_after.is_none());
    for index in 0..32 {
        create(&store, &format!("session-{index:02}"), "opaque").await;
    }
    let final_page = store.session_page(None).await.unwrap();
    assert_eq!(final_page.entries.len(), 32);
    assert!(final_page.next_after.is_none());
    let after_end = store.session_page(Some(session("z"))).await.unwrap();
    assert!(after_end.entries.is_empty() && after_end.next_after.is_none());
    let absent_cursor = store
        .session_page(Some(session("session-30a")))
        .await
        .unwrap();
    assert_eq!(absent_cursor.entries, [session("session-31")]);
    assert!(absent_cursor.next_after.is_none());
}

#[tokio::test]
async fn cursor_survives_removal_and_new_reads_observe_insertions() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open(&path).unwrap();
    for index in 0..40 {
        create(&store, &format!("session-{index:02}"), "opaque").await;
    }
    let first = store.session_page(None).await.unwrap();
    let cursor = first.next_after.unwrap();
    create(&store, "session-00a", "opaque").await;
    create(&store, "session-32a", "opaque").await;
    let second = store.session_page(Some(cursor.clone())).await.unwrap();
    assert_eq!(second.entries.len(), 9);
    assert!(!second.entries.contains(&session("session-00a")));
    assert!(second.entries.contains(&session("session-32a")));
    assert!(second.next_after.is_none());
    assert!(
        store
            .session_page(None)
            .await
            .unwrap()
            .entries
            .contains(&session("session-00a"))
    );
    drop(store);

    // Alter the file only while its sole store owner is closed.
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection
        .pragma_update(None, "foreign_keys", true)
        .unwrap();
    connection
        .execute("DELETE FROM sessions WHERE id=?1", [cursor.as_str()])
        .unwrap();
    drop(connection);
    let reopened = SqliteStore::open(&path).unwrap();
    assert_eq!(reopened.session_page(Some(cursor)).await.unwrap(), second);
}

#[tokio::test]
async fn malformed_stored_identities_fail_explicitly() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    drop(SqliteStore::open(&path).unwrap());
    for invalid in [
        rusqlite::types::Value::Text("bad id".into()),
        rusqlite::types::Value::Text("x".repeat(257)),
        rusqlite::types::Value::Blob(vec![0xff]),
    ] {
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection.execute("DELETE FROM sessions", []).unwrap();
        connection
            .execute(
                "INSERT INTO sessions(id,configuration,revision,paused,next_input) VALUES(?1,?2,0,0,0)",
                rusqlite::params![invalid, serde_json::to_vec(&payload("opaque")).unwrap()],
            )
            .unwrap();
        drop(connection);
        let store = SqliteStore::open(&path).unwrap();
        let error = store.session_page(None).await.unwrap_err();
        assert_eq!(error.kind, ErrorKind::InvalidState);
        assert_eq!(error.code, "stored_data_invalid");
    }
}

#[test]
fn session_pages_use_the_existing_identity_index() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    drop(SqliteStore::open(&path).unwrap());
    let connection = rusqlite::Connection::open(&path).unwrap();
    let query: String = connection
        .query_row(
            "EXPLAIN QUERY PLAN SELECT id FROM sessions WHERE id>?1 ORDER BY id LIMIT 33",
            ["cursor"],
            |row| row.get(3),
        )
        .unwrap();
    assert!(
        query.contains("SEARCH") && query.contains("COVERING INDEX"),
        "{query}"
    );
}
