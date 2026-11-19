#[allow(dead_code)]
mod support;

use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{JournalAction, JournalChange, TurnOutcome};
use agent_kit_core::{Envelope, ErrorKind, Fingerprint, SessionId, TurnId};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, CreateSession, RecoveryRequest, SessionStore, TurnDisposition,
    TurnSelection,
};
use agent_kit_store_sqlite::{
    SqliteStore,
    catalog::{CatalogPage, InitialLabel},
};
use support::{change, payload, private_directory, submission};

#[tokio::test]
async fn conversation_pages_seek_past_a_moved_anchor_and_date_only_new_messages() {
    use agent_kit_core::MessageId;
    use agent_kit_core::history::HistoryRecord;
    use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
    use agent_kit_store_sqlite::catalog::{ConversationOrder::Recent, ConversationProjection};

    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let open = || {
        SqliteStore::open_with_conversations(
            &filename,
            project,
            None,
            ConversationProjection {
                group: |env| {
                    matches!(env.bytes(), b"a" | b"b")
                        .then(|| String::from_utf8(env.bytes().to_vec()).unwrap())
                },
                input: |input| input.payload.bytes() == b"message",
                message: |message| message.role == Role::Assistant,
            },
        )
        .unwrap()
    };
    let store = open();
    let a = create("first", "a").id;
    let b = create("second", "b").id;
    for (id, group) in [
        ("first", "a"),
        ("second", "b"),
        ("empty", "a"),
        ("private", "private"),
    ] {
        store.create(create(id, group)).await.unwrap();
    }
    let message = submission("input", "message");
    for id in [a.clone(), b.clone(), SessionId::new("private").unwrap()] {
        store.submit(id, message.clone()).await.unwrap();
    }
    // Pin an old timestamp tie in the closed fixture instead of sleeping to
    // arrange clock ticks. All observations and subsequent writes use the store.
    drop(store);
    let db = rusqlite::Connection::open(&filename).unwrap();
    assert_eq!(
        db.execute(
            "UPDATE sessions SET last_message_ms=7 WHERE last_message_ms IS NOT NULL",
            []
        )
        .unwrap(),
        2
    );
    drop(db);
    let store = open();
    let first = store
        .list_conversations(None, 0, Recent, None, 1)
        .await
        .unwrap();
    assert_eq!(first.entries[0].record.entry.session, a);
    let after = first.next_after.unwrap();
    let claim_request = ClaimRequest {
        id: change("claim"),
        session: b.clone(),
        expected_revision: store.inspect(b.clone()).await.unwrap().revision,
        selection: TurnSelection::New {
            turn: TurnId::new("turn").unwrap(),
            inputs: vec![message.id.clone()],
        },
    };
    let ClaimOutcome::Acquired(claim) = store.claim(claim_request).await.unwrap() else {
        panic!("expected lease")
    };
    let mut renamed = store.catalog_entry(a.clone()).await.unwrap();
    renamed.label = Some("renamed".into());
    store.replace_catalog_entry(renamed).await.unwrap();
    store.submit(a.clone(), message).await.unwrap(); // accepted retry
    store
        .submit(a.clone(), submission("internal", "internal"))
        .await
        .unwrap();
    let before = store
        .list_conversations(None, 0, Recent, None, 32)
        .await
        .unwrap()
        .entries;
    assert_eq!(
        before
            .iter()
            .map(|r| r.record.last_message_ms)
            .collect::<Vec<_>>(),
        [Some(7), Some(7), None]
    );
    assert_eq!(
        before[1].record.current_turn_disposition,
        Some(TurnDisposition::Running)
    );
    store
        .submit(a.clone(), submission("later", "message"))
        .await
        .unwrap();
    let tail = store
        .list_conversations(None, 0, Recent, Some(after), 1)
        .await
        .unwrap();
    assert_eq!(tail.entries[0].record.entry.session, b);

    let reply = HistoryRecord::Message(Message {
        id: MessageId::new("reply").unwrap(),
        role: Role::Assistant,
        phase: None,
        content: vec![Content::Text("reply".into())],
        provenance: Provenance {
            source: "fixture".into(),
            kind: ProvenanceKind::Generated,
            fingerprint: None,
        },
    });
    support::commit(
        &claim,
        "publish",
        vec![JournalAction::AppendHistory(vec![reply])],
    )
    .await;
    let page = store
        .list_conversations(Some("b".into()), 0, Recent, None, 32)
        .await
        .unwrap();
    assert_eq!(page.entries.len(), 1);
    assert_eq!(page.entries[0].group, "b");
    assert_eq!(page.entries[0].record.entry.session, b);
    assert!(page.entries[0].record.last_message_ms.unwrap() > 7);
}

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
async fn catalog_paging_keeps_scope_and_creation_order() {
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    for n in 0..34 {
        store
            .create(create(&format!("a-{n:02}"), "a"))
            .await
            .unwrap();
        store
            .create(create(&format!("b-{n:02}"), "b"))
            .await
            .unwrap();
    }
    // A configuration the owner does not recognize is in no scope.
    store
        .create(create("unprojected", "unknown"))
        .await
        .unwrap();
    let scope_a = project(&payload("a")).unwrap();
    let scope_b = project(&payload("b")).unwrap();
    let page = store.list_catalog(scope_a, 0, None).await.unwrap();
    let expected: Vec<_> = (2..34)
        .rev()
        .map(|n| SessionId::new(format!("a-{n:02}")).unwrap())
        .collect();
    assert_eq!(ids(&page), expected);
    assert_eq!(page.next_after, expected.last().cloned());
    let records = store.list_catalog_records(scope_a, 0, None).await.unwrap();
    assert_eq!(records.next_after, page.next_after);
    assert_eq!(
        records
            .entries
            .iter()
            .map(|record| record.entry.clone())
            .collect::<Vec<_>>(),
        page.entries
    );
    assert!(
        records
            .entries
            .iter()
            .all(|record| record.latest_turn_activity_ms.is_none())
    );
    let error = match store
        .list_catalog(scope_b, 0, page.next_after.clone())
        .await
    {
        Err(error) => error,
        Ok(_) => panic!("foreign cursor must be rejected"),
    };
    assert_eq!(error.kind, ErrorKind::InvalidInput);
    assert_eq!(error.code, "invalid_session_cursor");
    let error = store
        .list_catalog_records(scope_b, 0, page.next_after.clone())
        .await
        .err()
        .unwrap();
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
        .list_catalog(scope_a, 0, page.next_after.clone())
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
    let records = reopened
        .list_catalog_records(scope_a, 0, page.next_after)
        .await
        .unwrap();
    assert!(records.next_after.is_none());
    assert_eq!(
        records
            .entries
            .into_iter()
            .map(|record| record.entry)
            .collect::<Vec<_>>(),
        tail.entries
    );
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
async fn catalog_organization_fences_edits() {
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let scope = project(&payload("a")).unwrap();
    let chat = create("chat", "a");
    let id = chat.id.clone();
    store.create(chat).await.unwrap();
    let before = store.inspect(id.clone()).await.unwrap();
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
    // A stale revision is a conflict to reload and retry, as for deletion.
    let stale = store.replace_catalog_entry(draft).await.unwrap_err();
    assert_eq!(stale.code, "session_catalog_revision_changed");
    assert_eq!(stale.kind, ErrorKind::Conflict);
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
    assert_eq!(
        store
            .catalog_record(id.clone())
            .await
            .unwrap()
            .latest_turn_activity_ms,
        None
    );
    drop(store);

    let reopened = SqliteStore::open_cataloged(&filename, project).unwrap();
    assert_eq!(reopened.catalog_entry(id).await.unwrap(), archived);
}

#[tokio::test]
async fn the_first_input_and_its_label_commit_and_replay_together() {
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let chat = create("first-label", "a");
    let id = chat.id.clone();
    store.create(chat).await.unwrap();
    let first = submission("first", "request");
    let rejected = store
        .submit_with_initial_label(
            id.clone(),
            first.clone(),
            None,
            Some(InitialLabel::Display("x".repeat(257))),
        )
        .await
        .unwrap_err();
    assert_eq!(rejected.code, "session_catalog_label_too_large");
    assert!(store.inspect(id.clone()).await.unwrap().queued.is_empty());
    assert!(
        store
            .catalog_entry(id.clone())
            .await
            .unwrap()
            .label
            .is_none()
    );

    let (receipt, basis) = store
        .submit_with_initial_label(
            id.clone(),
            first.clone(),
            None,
            Some(InitialLabel::Display("Excerpt".into())),
        )
        .await
        .unwrap();
    assert_eq!(receipt.position, 0);
    let provisional = store.catalog_entry(id.clone()).await.unwrap();
    assert_eq!(basis, Some(provisional.revision));
    assert_eq!(provisional.label.as_deref(), Some("Excerpt"));
    // Legacy submitters accepted inputs without a catalog suggestion receipt.
    let legacy = create("legacy", "a");
    let legacy_id = legacy.id.clone();
    store.create(legacy).await.unwrap();
    store
        .submit(legacy_id.clone(), submission("old", "existing input"))
        .await
        .unwrap();
    drop(store);

    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let retry = store
        .submit_with_initial_label(
            id.clone(),
            first,
            None,
            Some(InitialLabel::Display("Retry".into())),
        )
        .await
        .unwrap();
    assert_eq!(retry, (receipt, None));
    let (later, basis) = store
        .submit_with_initial_label(
            id.clone(),
            submission("later", "second request"),
            None,
            Some(InitialLabel::Display("Later".into())),
        )
        .await
        .unwrap();
    assert_eq!(later.position, 1);
    assert!(basis.is_none());
    assert_eq!(store.catalog_entry(id).await.unwrap(), provisional);
    let (_, late) = store
        .submit_with_initial_label(
            legacy_id.clone(),
            submission("new", "new input"),
            None,
            Some(InitialLabel::Display("Too late".into())),
        )
        .await
        .unwrap();
    assert!(late.is_none());
    assert!(
        store
            .catalog_entry(legacy_id)
            .await
            .unwrap()
            .label
            .is_none()
    );
}

#[tokio::test]
async fn confirming_or_clearing_a_provisional_label_revokes_the_generation_revision() {
    let store = SqliteStore::open_in_memory().unwrap();
    for (name, initial, explicit) in [
        (
            "confirm",
            InitialLabel::Display("Excerpt".into()),
            Some("Excerpt".into()),
        ),
        ("clear", InitialLabel::Display("Excerpt".into()), None),
        ("keep-untitled", InitialLabel::AwaitSuggestion, None),
    ] {
        let chat = create(name, "a");
        let id = chat.id.clone();
        store.create(chat).await.unwrap();
        let (_, basis) = store
            .submit_with_initial_label(
                id.clone(),
                submission("first", "request"),
                None,
                Some(initial),
            )
            .await
            .unwrap();
        let mut manual = store.catalog_entry(id.clone()).await.unwrap();
        manual.label = explicit;
        let confirmed = store.replace_catalog_entry(manual.clone()).await.unwrap();
        assert!(confirmed.revision > basis.unwrap());
        assert_eq!(
            store.replace_catalog_entry(manual).await.unwrap(),
            confirmed
        );
        store
            .finish_label_suggestion(id.clone(), basis.unwrap(), "Generated".into())
            .await
            .unwrap();
        assert_eq!(store.catalog_entry(id).await.unwrap(), confirmed);
    }
}

#[tokio::test]
async fn a_rename_can_cross_only_the_automatic_catalog_revisions() {
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let chat = create("no-hint", "a");
    let id = chat.id.clone();
    store.create(chat).await.unwrap();
    let (_, basis) = store
        .submit_with_initial_label(
            id.clone(),
            submission("first", "request"),
            None,
            Some(InitialLabel::AwaitSuggestion),
        )
        .await
        .unwrap();
    let before = store.catalog_entry(id.clone()).await.unwrap();
    store
        .finish_label_suggestion(id.clone(), basis.unwrap(), "Generated".into())
        .await
        .unwrap();
    drop(store);
    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let generated = store.catalog_entry(id.clone()).await.unwrap();
    assert_eq!(generated.label.as_deref(), Some("Generated"));
    let mut stale_move = before.clone();
    stale_move.bucket = 1;
    assert_eq!(
        store
            .replace_catalog_entry(stale_move)
            .await
            .unwrap_err()
            .code,
        "session_catalog_revision_changed"
    );
    let cleared = store.replace_catalog_entry(before).await.unwrap();
    assert!(cleared.revision > generated.revision && cleared.label.is_none());
    let mut stale_rename = generated;
    stale_rename.label = Some("Competing human rename".into());
    assert_eq!(
        store
            .replace_catalog_entry(stale_rename)
            .await
            .unwrap_err()
            .code,
        "session_catalog_revision_changed"
    );
}

#[tokio::test]
async fn moving_a_chat_before_or_during_its_first_submission_preserves_title_ownership() {
    let store = SqliteStore::open_in_memory().unwrap();
    let chat = create("moved", "a");
    let id = chat.id.clone();
    store.create(chat).await.unwrap();
    let mut entry = store.catalog_entry(id.clone()).await.unwrap();
    entry.bucket = 1;
    let mut archived = store.replace_catalog_entry(entry).await.unwrap();
    archived.bucket = 0;
    store.replace_catalog_entry(archived).await.unwrap();
    let (_, basis) = store
        .submit_with_initial_label(
            id.clone(),
            submission("first", "request"),
            None,
            Some(InitialLabel::Display("Excerpt".into())),
        )
        .await
        .unwrap();
    let provisional = store.catalog_entry(id.clone()).await.unwrap();
    assert_eq!(provisional.label.as_deref(), Some("Excerpt"));
    let mut archive = provisional.clone();
    archive.bucket = 1;
    let archived = store.replace_catalog_entry(archive.clone()).await.unwrap();
    assert_eq!(
        store.replace_catalog_entry(archive).await.unwrap(),
        archived
    );
    store
        .finish_label_suggestion(id.clone(), basis.unwrap(), "Generated".into())
        .await
        .unwrap();
    let finished = store.catalog_entry(id.clone()).await.unwrap();
    assert_eq!(finished.bucket, 1);
    assert_eq!(finished.label.as_deref(), Some("Generated"));
    let mut stale = provisional;
    stale.label = Some("Stale".into());
    assert_eq!(
        store.replace_catalog_entry(stale).await.unwrap_err().code,
        "session_catalog_revision_changed"
    );
    let mut human = archived;
    human.label = Some("Owner".into());
    let saved = store.replace_catalog_entry(human).await.unwrap();
    assert_eq!(saved.bucket, 1);
    assert_eq!(saved.label.as_deref(), Some("Owner"));
}

#[tokio::test]
async fn a_catalog_profile_is_kept_by_the_database() {
    let directory = private_directory();
    let cataloged = directory.path().join("cataloged.sqlite");
    drop(SqliteStore::open_cataloged(&cataloged, project).unwrap());
    assert_eq!(
        SqliteStore::open(&cataloged).err().unwrap().code,
        "store_profile_mismatch"
    );
    let plain = directory.path().join("plain.sqlite");
    drop(SqliteStore::open(&plain).unwrap());
    let error = SqliteStore::open_cataloged(&plain, project).err().unwrap();
    assert_eq!(error.code, "store_profile_mismatch");
    assert_eq!(error.kind, ErrorKind::Unsupported);
    SqliteStore::open_cataloged(&cataloged, project).unwrap();
    SqliteStore::open(&plain).unwrap();
}

#[tokio::test]
async fn catalog_records_retain_turn_timing_across_settlement_retries_and_reopen() {
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let scope = project(&payload("a")).unwrap();
    let other_scope = project(&payload("b")).unwrap();
    let creation = create("timed", "a");
    let id = creation.id.clone();
    let created = store.create(creation.clone()).await.unwrap();
    let empty = store
        .scoped_catalog_record(scope, id.clone())
        .await
        .unwrap();
    assert_eq!(empty.latest_turn_activity_ms, None);
    assert_eq!(empty.current_turn_disposition, None);
    assert_eq!(store.catalog_record(id.clone()).await.unwrap(), empty);
    for session in [id.clone(), SessionId::new("missing").unwrap()] {
        let error = store
            .scoped_catalog_record(other_scope, session)
            .await
            .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Unavailable);
        assert_eq!(error.code, "session_catalog_scope_mismatch");
    }
    let missing = store
        .catalog_record(SessionId::new("missing").unwrap())
        .await
        .unwrap_err();
    assert_eq!(missing.code, "session_catalog_entry_missing");

    let input = submission("input", "work");
    let accepted = store.submit(id.clone(), input.clone()).await.unwrap();
    assert_eq!(
        store.catalog_record(id.clone()).await.unwrap(),
        empty,
        "queued input has no retained local turn timing"
    );
    let request = ClaimRequest {
        id: change("claim"),
        session: id.clone(),
        expected_revision: store.inspect(id.clone()).await.unwrap().revision,
        selection: TurnSelection::New {
            turn: TurnId::new("turn").unwrap(),
            inputs: vec![input.id.clone()],
        },
    };
    let ClaimOutcome::Acquired(claim) = store.claim(request.clone()).await.unwrap() else {
        panic!("expected an acquired turn")
    };
    let read_times = || {
        let (started, settled) = rusqlite::Connection::open(&filename)
            .unwrap()
            .query_row(
                "SELECT started_ms,settled_ms FROM turns WHERE session=?1",
                [id.as_str()],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?)),
            )
            .unwrap();
        (
            u64::try_from(started).unwrap(),
            settled.map(|value| u64::try_from(value).unwrap()),
        )
    };
    let (started, settled) = read_times();
    assert!(started > 0);
    assert_eq!(settled, None);
    let running = store.catalog_record(id.clone()).await.unwrap();
    assert_eq!(running.entry, empty.entry);
    assert_eq!(running.latest_turn_activity_ms, Some(started));
    assert_eq!(
        running.current_turn_disposition,
        Some(TurnDisposition::Running)
    );
    assert_eq!(
        store
            .list_catalog_records(scope, 0, None)
            .await
            .unwrap()
            .entries,
        [running]
    );

    let binding = claim.lease.binding().clone();
    drop(claim);
    assert_eq!(
        store
            .list_catalog_records(scope, 0, None)
            .await
            .unwrap()
            .entries[0]
            .current_turn_disposition,
        Some(TurnDisposition::Interrupted)
    );
    let ClaimOutcome::Acquired(claim) = store
        .recover(RecoveryRequest {
            id: change("recover"),
            session: id.clone(),
            turn: binding.turn,
            expected_epoch: binding.epoch,
        })
        .await
        .unwrap()
    else {
        panic!("expected a recovery lease")
    };
    let state = claim.lease.journal().load().await.unwrap();
    let finish = JournalChange::new(
        change("finish"),
        state.binding().clone(),
        state.position(),
        state.controls().revision,
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })],
    )
    .unwrap();
    let receipt = claim.lease.journal().commit(finish.clone()).await.unwrap();
    let (retained_start, settled) = read_times();
    assert_eq!(retained_start, started);
    let settled = settled.unwrap();
    assert!(settled >= started);
    let finished = store.catalog_record(id.clone()).await.unwrap();
    assert_eq!(finished.entry, empty.entry);
    assert_eq!(finished.latest_turn_activity_ms, Some(settled));
    assert_eq!(finished.current_turn_disposition, None);
    assert_eq!(claim.lease.journal().commit(finish).await.unwrap(), receipt);
    assert!(matches!(
        store.claim(request).await.unwrap(),
        ClaimOutcome::Existing(_)
    ));
    assert_eq!(store.create(creation).await.unwrap(), created);
    assert_eq!(store.submit(id.clone(), input).await.unwrap(), accepted);
    assert_eq!(store.catalog_record(id.clone()).await.unwrap(), finished);
    assert_eq!(read_times(), (started, Some(settled)));

    let before = store.inspect(id.clone()).await.unwrap();
    let mut edit = finished.entry;
    edit.label = Some("Renamed".into());
    edit.bucket = 1;
    let updated = store.replace_catalog_entry(edit.clone()).await.unwrap();
    assert_eq!(
        store.replace_catalog_entry(edit.clone()).await.unwrap(),
        updated
    );
    let organized = store.catalog_record(id.clone()).await.unwrap();
    assert_eq!(organized.entry, updated);
    assert_eq!(organized.latest_turn_activity_ms, Some(settled));
    edit.label = Some("Stale rename".into());
    assert_eq!(
        store.replace_catalog_entry(edit).await.unwrap_err().code,
        "session_catalog_revision_changed"
    );
    assert_eq!(store.inspect(id.clone()).await.unwrap(), before);
    assert!(
        store
            .list_catalog_records(scope, 0, None)
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    assert_eq!(
        store
            .list_catalog_records(scope, 1, None)
            .await
            .unwrap()
            .entries,
        std::slice::from_ref(&organized)
    );
    drop(claim);
    drop(store);
    let reopened = SqliteStore::open_cataloged(&filename, project).unwrap();
    assert_eq!(
        reopened.scoped_catalog_record(scope, id).await.unwrap(),
        organized
    );
}

#[tokio::test]
async fn catalog_timing_uses_latest_ordinal_and_only_projects_returned_entries() {
    let directory = private_directory();
    let filename = directory.path().join("sessions.sqlite");
    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let scope = project(&payload("a")).unwrap();
    for index in 0..35 {
        store
            .create(create(&format!("a-{index:02}"), "a"))
            .await
            .unwrap();
    }
    store.create(create("foreign", "b")).await.unwrap();
    store.create(create("other-bucket", "a")).await.unwrap();
    let mut other_bucket = store
        .catalog_entry(SessionId::new("other-bucket").unwrap())
        .await
        .unwrap();
    other_bucket.bucket = 1;
    store.replace_catalog_entry(other_bucket).await.unwrap();
    drop(store);

    // Alter only the closed fixture. Malformed payloads make accidental
    // configuration, turn-head or journal decoding fail this metadata read.
    let connection = rusqlite::Connection::open(&filename).unwrap();
    connection
        .execute(
            "UPDATE sessions SET configuration=X'FF',driver_state=X'FF'",
            [],
        )
        .unwrap();
    for index in 0..35 {
        let id = format!("a-{index:02}");
        connection
            .execute(
                "INSERT INTO turns(session,id,head,history_len,stored_bytes,started_ms,settled_ms)
             VALUES(?1,'earlier',X'FF',0,1,800,900)",
                [&id],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO turns(session,id,head,history_len,stored_bytes,started_ms,settled_ms)
             VALUES(?1,'latest',X'FF',0,1,?2,?3)",
                rusqlite::params![id, 100 + index, (index % 2 == 1).then_some(200 + index)],
            )
            .unwrap();
    }
    // The lookahead entry, foreign scope and another bucket must not receive
    // timing lookups. The lookahead fails explicitly once it is returned.
    connection
        .pragma_update(None, "ignore_check_constraints", true)
        .unwrap();
    connection
        .execute(
            "UPDATE turns SET started_ms=-1,settled_ms=NULL WHERE session='a-02'",
            [],
        )
        .unwrap();
    for id in ["foreign", "other-bucket"] {
        connection
            .execute(
                "INSERT INTO turns(session,id,head,history_len,stored_bytes,started_ms)
             VALUES(?1,'invalid',X'FF',0,1,-1)",
                [id],
            )
            .unwrap();
    }
    drop(connection);

    let store = SqliteStore::open_cataloged(&filename, project).unwrap();
    let page = store.list_catalog_records(scope, 0, None).await.unwrap();
    assert_eq!(page.entries.len(), 32);
    assert_eq!(page.next_after.as_ref().unwrap().as_str(), "a-03");
    for (index, record) in (3..35).rev().zip(page.entries) {
        assert_eq!(record.entry.session.as_str(), format!("a-{index:02}"));
        let expected = if index % 2 == 0 {
            100 + index
        } else {
            200 + index
        };
        assert_eq!(record.latest_turn_activity_ms, Some(expected));
    }
    let error = store
        .list_catalog_records(scope, 0, page.next_after)
        .await
        .err()
        .unwrap();
    assert_eq!(error.kind, ErrorKind::InvalidState);
    assert_eq!(error.code, "negative_stored_position");
}
