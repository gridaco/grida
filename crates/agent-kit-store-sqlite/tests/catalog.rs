#[allow(dead_code)]
mod support;

use agent_kit_core::{Envelope, ErrorKind, Fingerprint, SessionId};
use agent_kit_sessions::{CreateSession, SessionStore};
use agent_kit_store_sqlite::{SqliteStore, catalog::CatalogPage};
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

fn ids(page: &CatalogPage) -> Vec<SessionId> {
    page.entries
        .iter()
        .map(|entry| entry.session.clone())
        .collect()
}

#[tokio::test]
async fn upgraded_projection_indexes_previously_hidden_records() {
    fn earlier(configuration: &Envelope) -> Option<Fingerprint> {
        if configuration.bytes() == b"b" {
            None
        } else {
            project(configuration)
        }
    }
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&filename, earlier).unwrap();
    store.create(create("a-chat", "a")).await.unwrap();
    store.create(create("b-chat", "b")).await.unwrap();
    let a = project(&payload("a")).unwrap();
    let b = project(&payload("b")).unwrap();
    assert!(store.has_catalog_entries(a).await.unwrap());
    assert!(!store.has_catalog_entries(b).await.unwrap());
    drop(store);

    let previous = rusqlite::Connection::open(&filename).unwrap();
    previous
        .execute_batch(
            "DROP INDEX session_retirements_pending;
             ALTER TABLE session_retirements DROP COLUMN cleanup;
             PRAGMA user_version=8;",
        )
        .unwrap();
    drop(previous);
    let store = SqliteStore::open_cataloged(filename, project).unwrap();
    assert_eq!(
        ids(&store.list_catalog(a, 0, None).await.unwrap()),
        [SessionId::new("a-chat").unwrap()]
    );
    assert!(store.has_catalog_entries(b).await.unwrap());
    assert_eq!(
        ids(&store.list_catalog(b, 0, None).await.unwrap()),
        [SessionId::new("b-chat").unwrap()]
    );
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
        .execute_batch(
            "DROP TABLE session_retirements; DROP TABLE session_catalog; PRAGMA user_version=5;",
        )
        .unwrap();
    drop(legacy);

    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let scope_a = project(&payload("a")).unwrap();
    let scope_b = project(&payload("b")).unwrap();
    let page = store.list_catalog(scope_a, 0, None).await.unwrap();
    let expected: Vec<_> = (2..34)
        .rev()
        .map(|n| SessionId::new(format!("a-{n:02}")).unwrap())
        .collect();
    assert_eq!(ids(&page), expected);
    assert_eq!(page.next_after, expected.last().cloned());
    let error = match store
        .list_catalog(scope_b, 0, page.next_after.clone())
        .await
    {
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
        store.list_catalog(scope_a, 0, None).await.unwrap().entries[0].session,
        new_id
    );
    drop(store);
    let reopened = SqliteStore::open_cataloged(&filename, project).unwrap();
    let tail = reopened
        .list_catalog(scope_a, 0, page.next_after)
        .await
        .unwrap();
    assert_eq!(
        ids(&tail),
        [
            SessionId::new("a-01").unwrap(),
            SessionId::new("a-00").unwrap()
        ]
    );
    assert!(tail.next_after.is_none());
    assert!(
        reopened
            .list_catalog(Fingerprint::of(&"empty-scope").unwrap(), 0, None)
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    let view = reopened.inspect(new_id).await.unwrap();
    assert!(view.current.is_none() && view.latest.is_none());
}

#[tokio::test]
async fn catalog_organization_upgrades_an_existing_index_and_fences_edits() {
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let scope = project(&payload("a")).unwrap();
    let chat = create("chat", "a");
    let id = chat.id.clone();
    store.create(chat).await.unwrap();
    let before = store.inspect(id.clone()).await.unwrap();
    drop(store);

    let legacy = rusqlite::Connection::open(&filename).unwrap();
    legacy
        .execute_batch(
            "DROP TABLE session_retirements;
             DROP INDEX session_catalog_bucket;
             ALTER TABLE session_catalog DROP COLUMN revision;
             ALTER TABLE session_catalog DROP COLUMN label;
             ALTER TABLE session_catalog DROP COLUMN bucket;
             CREATE INDEX session_catalog_scope ON session_catalog(scope,ordinal);
             PRAGMA user_version=6;",
        )
        .unwrap();
    drop(legacy);

    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let mut draft = store.catalog_entry(id.clone()).await.unwrap();
    assert_eq!(draft.revision, 0);
    assert_eq!(draft.label, None);
    assert_eq!(draft.bucket, 0);
    draft.label = Some("Draft".to_owned());
    draft.bucket = 1;
    let archived = store.replace_catalog_entry(draft.clone()).await.unwrap();
    assert_eq!(archived.revision, 1);
    assert_eq!(
        store.replace_catalog_entry(draft.clone()).await.unwrap(),
        archived
    );
    draft.label = Some("A stale rename".to_owned());
    assert_eq!(
        store.replace_catalog_entry(draft).await.unwrap_err().code,
        "session_catalog_revision_changed"
    );
    assert!(
        store
            .list_catalog(scope, 0, None)
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert_eq!(
        store.list_catalog(scope, 1, None).await.unwrap().entries,
        std::slice::from_ref(&archived)
    );
    assert_eq!(store.inspect(id.clone()).await.unwrap(), before);
    drop(store);

    let reopened = SqliteStore::open_cataloged(&filename, project).unwrap();
    assert_eq!(reopened.catalog_entry(id).await.unwrap(), archived);
}
