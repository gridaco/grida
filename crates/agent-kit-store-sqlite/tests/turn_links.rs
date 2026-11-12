#[allow(dead_code)]
mod support;

use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{JournalAction, TurnOutcome, TurnState};
use agent_kit_core::{Envelope, Error, ErrorKind, Fingerprint, Result, SessionId, TurnId};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ControlRequest, CreateSession, InputDisposition, SessionControl,
    SessionStore, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use agent_kit_store_sqlite::deletion::DeleteSession;
use agent_kit_store_sqlite::turn_links::{TurnLinkCursor, TurnLinkDecision, TurnLinkParent};
use std::path::Path;
use support::{change, commit, payload, private_directory, remove_turn_link_schema, submission};

fn session(id: &str) -> SessionId {
    SessionId::new(id).unwrap()
}

fn turn(id: &str) -> TurnId {
    TurnId::new(id).unwrap()
}

fn cursor(child: &str, input: &str) -> TurnLinkCursor {
    TurnLinkCursor {
        session: session(child),
        input: change(input),
    }
}

fn scope(configuration: &Envelope) -> Option<Fingerprint> {
    Fingerprint::of(configuration).ok()
}

fn link(configuration: &Envelope, input: &Envelope) -> Result<TurnLinkDecision> {
    let configuration = str::from_utf8(configuration.bytes()).unwrap();
    let Some(parent) = configuration.strip_prefix("child/") else {
        return Ok(TurnLinkDecision::Unrelated);
    };
    let input = str::from_utf8(input.bytes()).unwrap();
    if input == "malformed" {
        return Err(Error::new(ErrorKind::InvalidState, "test_projection_error"));
    }
    if input == "unclassified" {
        return Ok(TurnLinkDecision::CoverageUnknown);
    }
    Ok(TurnLinkDecision::Linked(TurnLinkParent {
        session: SessionId::new(parent)?,
        turn: if input == "unknown" {
            None
        } else {
            Some(TurnId::new(input)?)
        },
    }))
}

fn open(path: &Path) -> SqliteStore {
    SqliteStore::open_cataloged_with_turn_links(path, scope, link).unwrap()
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

async fn settle(store: &SqliteStore, id: &str, input: &str, child_turn: &str) {
    let id = session(id);
    let ClaimOutcome::Acquired(claim) = store
        .claim(ClaimRequest {
            id: change(child_turn),
            session: id.clone(),
            expected_revision: store.inspect(id.clone()).await.unwrap().revision,
            selection: TurnSelection::New {
                turn: turn(child_turn),
                inputs: vec![change(input)],
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected a new turn");
    };
    commit(
        &claim,
        "settle",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: Vec::new(),
        })],
    )
    .await;
}

async fn source_turn(store: &SqliteStore, source: &str, id: &str) {
    store
        .submit(session(source), submission(id, "source"))
        .await
        .unwrap();
    settle(store, source, id, id).await;
}

fn projected_turn(state: &TurnState) -> Result<TurnId> {
    Ok(state.binding().turn.clone())
}

#[tokio::test]
async fn historical_links_preserve_exact_assignment_and_disclose_unknown_sources_after_reopen() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let generic = SqliteStore::open(&path).unwrap();
    create(&generic, "parent", "root").await;
    create(&generic, "foreign", "root").await;
    create(&generic, "child", "child/parent").await;
    source_turn(&generic, "parent", "first").await;
    source_turn(&generic, "parent", "second").await;
    source_turn(&generic, "foreign", "first").await;
    for (input, source, child_turn) in [
        ("shared", "first", "original"),
        ("reuse", "second", "latest"),
        ("unknown", "unknown", "historical-unknown"),
        ("missing", "missing-source", "historical-missing"),
    ] {
        generic
            .submit(session("child"), submission(input, source))
            .await
            .unwrap();
        settle(&generic, "child", input, child_turn).await;
    }
    assert_eq!(
        generic
            .turn_links(session("parent"), turn("first"), None, projected_turn)
            .await
            .err()
            .unwrap()
            .code,
        "turn_link_projection_missing",
    );
    drop(generic);
    let previous = rusqlite::Connection::open(&path).unwrap();
    remove_turn_link_schema(&previous);
    previous.pragma_update(None, "user_version", 10).unwrap();
    drop(previous);

    for _ in 0..2 {
        let store = open(&path);
        let page = store
            .turn_links(session("parent"), turn("first"), None, projected_turn)
            .await
            .unwrap();
        assert!(page.coverage_incomplete);
        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].cursor, cursor("child", "shared"));
        assert_eq!(page.entries[0].configuration, payload("child/parent"));
        assert_eq!(
            page.entries[0].disposition,
            InputDisposition::Completed {
                turn: turn("original"),
            },
        );
        assert_eq!(
            page.entries[0].turn,
            Some((turn("original"), turn("original"))),
        );
        for (parent, source) in [
            ("parent", "second"),
            ("foreign", "first"),
            ("parent", "missing-source"),
        ] {
            assert_eq!(
                store
                    .inspect_turn_link_with(
                        session(parent),
                        turn(source),
                        cursor("child", "shared"),
                        projected_turn,
                    )
                    .await
                    .unwrap(),
                None,
            );
        }
        let foreign = store
            .turn_links(session("foreign"), turn("first"), None, projected_turn)
            .await
            .unwrap();
        assert!(!foreign.coverage_incomplete);
        assert!(foreign.entries.is_empty());
    }
    let current = rusqlite::Connection::open(&path).unwrap();
    let version: u32 = current
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 12);
}

#[tokio::test]
async fn exact_scope_paging_survives_later_inserts_and_cascade_deletion() {
    let directory = private_directory();
    let store = open(&directory.path().join("sessions.sqlite"));
    create(&store, "parent", "root").await;
    source_turn(&store, "parent", "source").await;
    source_turn(&store, "parent", "other").await;
    for index in 0..17 {
        let id = format!("child-{index:02}");
        create(&store, &id, "child/parent").await;
        store
            .submit(session(&id), submission("shared", "source"))
            .await
            .unwrap();
        settle(&store, &id, "shared", &id).await;
    }
    let first = store
        .turn_links(session("parent"), turn("source"), None, projected_turn)
        .await
        .unwrap();
    assert_eq!(first.entries.len(), 16);
    let after = first.next_after.unwrap();
    assert_eq!(after, cursor("child-15", "shared"));
    create(&store, "aaa", "child/parent").await;
    store
        .submit(session("aaa"), submission("shared", "source"))
        .await
        .unwrap();
    let tail = store
        .turn_links(
            session("parent"),
            turn("source"),
            Some(after.clone()),
            projected_turn,
        )
        .await
        .unwrap();
    assert_eq!(tail.entries.len(), 2);
    assert_eq!(tail.entries[0].cursor, cursor("child-16", "shared"));
    assert_eq!(tail.entries[1].cursor, cursor("aaa", "shared"));
    assert_eq!(tail.entries[1].disposition, InputDisposition::Queued);
    assert!(tail.entries[1].turn.is_none());
    assert!(tail.next_after.is_none());
    assert_eq!(
        store
            .turn_links(
                session("parent"),
                turn("other"),
                Some(after.clone()),
                projected_turn,
            )
            .await
            .err()
            .unwrap()
            .code,
        "invalid_turn_link_cursor",
    );
    assert_eq!(
        store
            .inspect_turn_link_with(
                session("parent"),
                turn("source"),
                after.clone(),
                projected_turn
            )
            .await
            .unwrap(),
        Some(turn("child-15")),
    );
    delete(&store, "child-15", "child/parent").await;
    assert_eq!(
        store
            .inspect_turn_link_with(session("parent"), turn("source"), after, projected_turn)
            .await
            .unwrap(),
        None,
    );
    delete(&store, "parent", "root").await;
    assert!(
        store
            .turn_links(session("parent"), turn("source"), None, projected_turn)
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert!(
        store
            .input(session("child-16"), change("shared"))
            .await
            .unwrap()
            .is_some()
    );
}

async fn delete(store: &SqliteStore, id: &str, configuration: &str) {
    let id = session(id);
    store
        .delete_idle(
            DeleteSession {
                session: id.clone(),
                scope: scope(&payload(configuration)).unwrap(),
                request: change("delete"),
                expected_revision: store.inspect(id.clone()).await.unwrap().revision,
                expected_catalog_revision: store.catalog_entry(id).await.unwrap().revision,
                dependents: None,
            },
            |_, _| Ok(()),
            |_| Ok(()),
        )
        .await
        .unwrap();
}

#[tokio::test]
async fn invalid_live_projection_rolls_back_admission_and_queue_replacement() {
    let directory = private_directory();
    let store = open(&directory.path().join("sessions.sqlite"));
    create(&store, "parent", "root").await;
    create(&store, "child", "child/parent").await;
    source_turn(&store, "parent", "source").await;
    for text in ["missing", "unknown", "unclassified", "malformed"] {
        assert!(
            store
                .submit(session("child"), submission("request", text))
                .await
                .is_err()
        );
        assert!(
            store
                .input(session("child"), change("request"))
                .await
                .unwrap()
                .is_none()
        );
    }
    let input = submission("request", "source");
    let accepted = store.submit(session("child"), input.clone()).await.unwrap();
    assert_eq!(
        store.submit(session("child"), input).await.unwrap(),
        accepted
    );
    let before = store.inspect(session("child")).await.unwrap();
    assert!(
        store
            .control(ControlRequest {
                id: change("replace"),
                session: session("child"),
                expected_revision: before.revision,
                action: SessionControl::ReplaceQueued {
                    input: change("request"),
                    replacement: submission("replacement", "missing"),
                },
            })
            .await
            .is_err()
    );
    assert_eq!(store.inspect(session("child")).await.unwrap(), before);
    assert!(
        store
            .input(session("child"), change("replacement"))
            .await
            .unwrap()
            .is_none()
    );
    let page = store
        .turn_links(session("parent"), turn("source"), None, projected_turn)
        .await
        .unwrap();
    assert_eq!(page.entries.len(), 1);
    assert!(!page.coverage_incomplete);
    assert_eq!(page.entries[0].cursor, cursor("child", "request"));
}

#[tokio::test]
async fn failed_backfill_leaves_the_batch_unprojected_for_owner_retry() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let generic = SqliteStore::open(&path).unwrap();
    create(&generic, "parent", "root").await;
    create(&generic, "child", "child/parent").await;
    source_turn(&generic, "parent", "source").await;
    generic
        .submit(session("child"), submission("prior", "source"))
        .await
        .unwrap();
    for index in 0..126 {
        generic
            .submit(
                session("parent"),
                submission(&format!("ignored-{index}"), "unlinked"),
            )
            .await
            .unwrap();
    }
    generic
        .submit(session("child"), submission("valid", "source"))
        .await
        .unwrap();
    generic
        .submit(session("child"), submission("bad", "malformed"))
        .await
        .unwrap();
    drop(generic);

    let failure = SqliteStore::open_cataloged_with_turn_links(&path, scope, link)
        .err()
        .unwrap();
    assert_eq!(failure.code, "test_projection_error");
    let connection = rusqlite::Connection::open(&path).unwrap();
    let counts: (u32, u32) = connection
        .query_row(
            "SELECT (SELECT count(*) FROM turn_submission_links),
                    (SELECT count(*) FROM submissions WHERE link_projected=0)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(counts, (1, 2));
    drop(connection);

    let store =
        SqliteStore::open_cataloged_with_turn_links(&path, scope, |configuration, input| {
            if input.bytes() == b"malformed" {
                link(configuration, &payload("unknown"))
            } else {
                link(configuration, input)
            }
        })
        .unwrap();
    let page = store
        .turn_links(session("parent"), turn("source"), None, projected_turn)
        .await
        .unwrap();
    assert_eq!(page.entries.len(), 2);
    assert_eq!(page.entries[0].cursor, cursor("child", "prior"));
    assert_eq!(page.entries[1].cursor, cursor("child", "valid"));
    assert!(page.coverage_incomplete);
}

#[tokio::test]
async fn malformed_historical_envelopes_and_orphans_keep_exact_evidence_available() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let generic = SqliteStore::open(&path).unwrap();
    create(&generic, "parent", "root").await;
    create(&generic, "independent", "root").await;
    create(&generic, "valid", "child/parent").await;
    create(&generic, "bad-payload", "child/parent").await;
    create(&generic, "bad-configuration", "child/parent").await;
    create(&generic, "altered-payload", "child/parent").await;
    create(&generic, "orphan", "child/missing-parent").await;
    source_turn(&generic, "parent", "source").await;
    source_turn(&generic, "independent", "source").await;
    for child in [
        "valid",
        "bad-payload",
        "bad-configuration",
        "altered-payload",
        "orphan",
    ] {
        generic
            .submit(session(child), submission("assignment", "source"))
            .await
            .unwrap();
        settle(&generic, child, "assignment", "work").await;
    }
    drop(generic);
    let previous = rusqlite::Connection::open(&path).unwrap();
    remove_turn_link_schema(&previous);
    previous
        .execute_batch(
            "UPDATE sessions SET configuration=X'00' WHERE id='bad-configuration';
             UPDATE submissions SET payload=X'00' WHERE session='bad-payload';
             PRAGMA user_version=10;",
        )
        .unwrap();
    previous
        .execute(
            "UPDATE submissions SET payload=?1 WHERE session='altered-payload'",
            [serde_json::to_vec(&payload("changed")).unwrap()],
        )
        .unwrap();
    drop(previous);

    for _ in 0..2 {
        let store = open(&path);
        let page = store
            .turn_links(session("parent"), turn("source"), None, projected_turn)
            .await
            .unwrap();
        assert!(page.coverage_incomplete);
        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].cursor, cursor("valid", "assignment"));
        assert_eq!(page.entries[0].turn, Some((turn("work"), turn("work"))));
        let independent = store
            .turn_links(session("independent"), turn("source"), None, projected_turn)
            .await
            .unwrap();
        assert!(independent.coverage_incomplete);
        assert!(independent.entries.is_empty());
        assert!(
            store
                .inspect_turn_link_with(
                    session("parent"),
                    turn("source"),
                    cursor("bad-payload", "assignment"),
                    projected_turn,
                )
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(
            store
                .input(session("altered-payload"), change("assignment"))
                .await
                .unwrap_err()
                .code,
            "stored_input_fingerprint_mismatch",
        );
    }
    let current = rusqlite::Connection::open(&path).unwrap();
    let unknown: u32 = current
        .query_row(
            "SELECT count(*) FROM submissions WHERE link_projected=2",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(unknown, 4);
}
