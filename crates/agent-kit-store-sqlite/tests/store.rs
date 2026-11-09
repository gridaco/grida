use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role};
use agent_kit_core::turn::{
    CommitReceipt, ControlRevision, JournalAction, JournalChange, JournalPosition,
    ResponseContract, TurnOutcome, WaitRecord,
};
use agent_kit_core::{
    ChangeId, Envelope, ErrorKind, MessageId, Result, SchemaId, SessionId, TurnId, WaitId,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ClaimedTurn, ControlRequest, CreateSession, DriverOutcome,
    InputDisposition, RecoveryRequest, RunDisposition, SessionControl, SessionStore, Sessions,
    Submission, TurnDisposition, TurnDriver, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;

fn private_directory() -> TempDir {
    let directory = tempfile::tempdir().unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    directory
}

fn change(value: &str) -> ChangeId {
    ChangeId::new(value).unwrap()
}
fn session() -> SessionId {
    SessionId::new("conversation").unwrap()
}
fn turn() -> TurnId {
    TurnId::new("turn").unwrap()
}
fn payload(value: &str) -> Envelope {
    Envelope::new(
        SchemaId::new("test.text").unwrap(),
        1,
        value.as_bytes().to_vec(),
    )
    .unwrap()
}
fn submission(id: &str, text: &str) -> Submission {
    Submission {
        id: change(id),
        payload: payload(text),
    }
}
fn assert_error<T>(result: Result<T>, kind: ErrorKind, code: &str) {
    match result {
        Err(error) => {
            assert_eq!(error.kind, kind);
            assert_eq!(error.code, code);
        }
        Ok(_) => panic!("expected {code}"),
    }
}
async fn store() -> (TempDir, SqliteStore) {
    let directory = private_directory();
    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    store
        .create(CreateSession {
            id: session(),
            request: change("create"),
            configuration: payload("configuration"),
        })
        .await
        .unwrap();
    (directory, store)
}
async fn claim(store: &SqliteStore, id: &str, inputs: Vec<ChangeId>) -> ClaimedTurn {
    let request = ClaimRequest {
        id: change(id),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs,
        },
    };
    match store.claim(request).await.unwrap() {
        ClaimOutcome::Acquired(claim) => claim,
        ClaimOutcome::Existing(_) => panic!("expected a new owner"),
    }
}
async fn commit(claim: &ClaimedTurn, id: &str, actions: Vec<JournalAction>) -> CommitReceipt {
    let state = claim.lease.journal().load().await.unwrap();
    let change = JournalChange::new(
        change(id),
        state.binding().clone(),
        state.position(),
        state.controls().revision,
        actions,
    )
    .unwrap();
    claim.lease.journal().commit(change).await.unwrap()
}

#[tokio::test]
async fn acceptance_is_idempotent_and_inspection_is_observational() {
    let (_directory, store) = store().await;
    let input = submission("request", "hello");
    let first = store.submit(session(), input.clone()).await.unwrap();
    assert_eq!(store.submit(session(), input).await.unwrap(), first);
    assert_error(
        store
            .submit(session(), submission("request", "different"))
            .await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    let view = store.inspect(session()).await.unwrap();
    assert_eq!(view.queued.len(), 1);
    assert!(view.current.is_none());
    assert!(view.latest.is_none());
    assert_eq!(store.inspect(session()).await.unwrap(), view);
    assert_error(
        store
            .create(CreateSession {
                id: session(),
                request: change("create"),
                configuration: payload("changed"),
            })
            .await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
}

#[tokio::test]
async fn history_contribution_is_conditional_idempotent_and_retained() {
    let (directory, store) = store().await;
    store
        .submit(session(), submission("request", "hello"))
        .await
        .unwrap();
    let claim = claim(&store, "claim", vec![change("request")]).await;
    let state = claim.lease.journal().load().await.unwrap();
    let records = vec![HistoryRecord::Message(Message {
        id: MessageId::new("steering").unwrap(),
        role: Role::User,
        phase: None,
        content: vec![Content::Text("Use the revised direction".into())],
        provenance: Provenance {
            source: "client".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    })];
    let request = ControlRequest {
        id: change("steer"),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        action: SessionControl::AppendHistory {
            turn: turn(),
            expected: state.controls().revision,
            expected_history: state.history().position(),
            records: records.clone(),
        },
    };
    let receipt = store.control(request.clone()).await.unwrap();
    assert_eq!(store.control(request.clone()).await.unwrap(), receipt);
    assert_eq!(
        claim
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .history()
            .records(),
        records
    );
    let mut stale = request.clone();
    stale.id = change("stale-steering");
    stale.expected_revision = receipt.revision;
    assert_error(
        store.control(stale).await,
        ErrorKind::Conflict,
        "history_position_changed",
    );
    assert_eq!(
        store.inspect(session()).await.unwrap().revision,
        receipt.revision
    );
    drop(claim);
    drop(store);
    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    assert_eq!(reopened.control(request).await.unwrap(), receipt);
    assert_eq!(reopened.history(session(), None).await.unwrap(), records);
}

#[tokio::test]
async fn replacing_queued_input_retains_original_identity_and_queue_slot() {
    let (_directory, store) = store().await;
    let first = store
        .submit(session(), submission("a", "first"))
        .await
        .unwrap();
    store
        .submit(session(), submission("b", "second"))
        .await
        .unwrap();
    store
        .submit(session(), submission("c", "third"))
        .await
        .unwrap();
    let replacement = submission("replacement", "revised second");
    let request = ControlRequest {
        id: change("replace"),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        action: SessionControl::ReplaceQueued {
            input: change("b"),
            replacement: replacement.clone(),
        },
    };
    let receipt = store.control(request.clone()).await.unwrap();
    assert_eq!(store.control(request).await.unwrap(), receipt);
    let queued = store.inspect(session()).await.unwrap().queued;
    assert_eq!(
        queued
            .iter()
            .map(|input| input.input.id.clone())
            .collect::<Vec<_>>(),
        vec![change("a"), change("replacement"), change("c")]
    );
    assert_eq!(queued[0].position, first.position);
    assert_eq!(queued[1].position, 3);
    let old = store.input(session(), change("b")).await.unwrap().unwrap();
    assert_eq!(old.input.payload, payload("second"));
    assert_eq!(old.position, 1);
    assert_eq!(
        old.disposition,
        InputDisposition::Superseded {
            replacement: change("replacement")
        }
    );
    assert_error(
        store
            .claim(ClaimRequest {
                id: change("claim-superseded"),
                session: session(),
                expected_revision: store.inspect(session()).await.unwrap().revision,
                selection: TurnSelection::New {
                    turn: turn(),
                    inputs: vec![change("b")],
                },
            })
            .await,
        ErrorKind::Conflict,
        "input_not_queued",
    );
    assert_eq!(
        store.submit(session(), replacement).await.unwrap().position,
        3
    );
    assert_eq!(store.inspect(session()).await.unwrap().queued.len(), 3);
}

#[tokio::test]
async fn queue_reorder_and_withdrawal_survive_reopen_without_changing_acceptance_positions() {
    let (directory, store) = store().await;
    for id in ["a", "b", "c"] {
        store.submit(session(), submission(id, id)).await.unwrap();
    }
    store
        .control(ControlRequest {
            id: change("reorder"),
            session: session(),
            expected_revision: store.inspect(session()).await.unwrap().revision,
            action: SessionControl::ReorderQueued {
                inputs: vec![change("c"), change("a"), change("b")],
            },
        })
        .await
        .unwrap();
    store
        .control(ControlRequest {
            id: change("withdraw"),
            session: session(),
            expected_revision: store.inspect(session()).await.unwrap().revision,
            action: SessionControl::WithdrawQueued { input: change("a") },
        })
        .await
        .unwrap();
    drop(store);
    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let queued = store.inspect(session()).await.unwrap().queued;
    assert_eq!(
        queued
            .iter()
            .map(|input| input.input.id.clone())
            .collect::<Vec<_>>(),
        vec![change("c"), change("b")]
    );
    assert_eq!(
        queued
            .iter()
            .map(|input| input.position)
            .collect::<Vec<_>>(),
        vec![2, 1]
    );
    let withdrawn = store.input(session(), change("a")).await.unwrap().unwrap();
    assert_eq!(withdrawn.disposition, InputDisposition::Withdrawn);
    assert_eq!(withdrawn.input.payload, payload("a"));
    assert_eq!(
        store
            .submit(session(), submission("a", "a"))
            .await
            .unwrap()
            .position,
        0
    );
    assert_eq!(store.inspect(session()).await.unwrap().queued.len(), 2);
}

#[tokio::test]
async fn invalid_queue_edits_leave_the_original_state_intact() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("a", "first"))
        .await
        .unwrap();
    store
        .submit(session(), submission("b", "second"))
        .await
        .unwrap();
    let before = store.inspect(session()).await.unwrap();
    for (id, action) in [
        (
            "duplicate",
            SessionControl::ReorderQueued {
                inputs: vec![change("a"), change("a")],
            },
        ),
        (
            "missing",
            SessionControl::ReorderQueued {
                inputs: vec![change("a")],
            },
        ),
        (
            "foreign",
            SessionControl::ReorderQueued {
                inputs: vec![change("a"), change("other")],
            },
        ),
        (
            "reused",
            SessionControl::ReplaceQueued {
                input: change("a"),
                replacement: submission("b", "second"),
            },
        ),
    ] {
        assert!(
            store
                .control(ControlRequest {
                    id: change(id),
                    session: session(),
                    expected_revision: before.revision,
                    action
                })
                .await
                .is_err()
        );
        assert_eq!(store.inspect(session()).await.unwrap(), before);
    }
    let _claim = claim(&store, "claim", vec![change("a")]).await;
    assert_error(
        store
            .control(ControlRequest {
                id: change("late-edit"),
                session: session(),
                expected_revision: store.inspect(session()).await.unwrap().revision,
                action: SessionControl::ReplaceQueued {
                    input: change("a"),
                    replacement: submission("revision", "too late"),
                },
            })
            .await,
        ErrorKind::Conflict,
        "input_not_queued",
    );
    assert!(
        store
            .input(session(), change("revision"))
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn queue_replacement_and_claim_have_one_winner() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "original"))
        .await
        .unwrap();
    let revision = store.inspect(session()).await.unwrap().revision;
    let (replacement, claim) = tokio::join!(
        store.control(ControlRequest {
            id: change("replace"),
            session: session(),
            expected_revision: revision,
            action: SessionControl::ReplaceQueued {
                input: change("input"),
                replacement: submission("revised", "changed"),
            },
        }),
        store.claim(ClaimRequest {
            id: change("claim"),
            session: session(),
            expected_revision: revision,
            selection: TurnSelection::New {
                turn: turn(),
                inputs: vec![change("input")]
            },
        })
    );
    assert_ne!(replacement.is_ok(), claim.is_ok());
    if replacement.is_ok() {
        assert_eq!(
            store.inspect(session()).await.unwrap().queued[0].input.id,
            change("revised")
        );
        assert!(store.inspect(session()).await.unwrap().current.is_none());
    } else {
        let ClaimOutcome::Acquired(claim) = claim.unwrap() else {
            panic!("expected claimed input")
        };
        assert_eq!(claim.inputs[0].payload, payload("original"));
        assert!(
            store
                .input(session(), change("revised"))
                .await
                .unwrap()
                .is_none()
        );
    }
}

#[tokio::test]
async fn previous_schema_upgrades_without_changing_completed_or_queued_input() {
    let (directory, store) = store().await;
    store
        .submit(session(), submission("completed", "retained result input"))
        .await
        .unwrap();
    store
        .submit(session(), submission("pending", "retained pending input"))
        .await
        .unwrap();
    let claim = claim(&store, "claim", vec![change("completed")]).await;
    commit(
        &claim,
        "settle",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })],
    )
    .await;
    drop(claim);
    drop(store);
    let path = directory.path().join("sessions.sqlite");
    let previous = rusqlite::Connection::open(&path).unwrap();
    previous
        .execute_batch(
            "DROP INDEX submission_queue_order;
         ALTER TABLE submissions DROP COLUMN queue_order;
         ALTER TABLE submissions DROP COLUMN replacement_id;
         ALTER TABLE submissions DROP COLUMN withdrawn;
         PRAGMA user_version=1;",
        )
        .unwrap();
    drop(previous);
    let upgraded = SqliteStore::open(&path).unwrap();
    let pending = upgraded.inspect(session()).await.unwrap().queued;
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].input.payload, payload("retained pending input"));
    assert_eq!(pending[0].position, 1);
    let completed = upgraded
        .input(session(), change("completed"))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        completed.disposition,
        InputDisposition::Completed { turn: turn() }
    );
    assert_eq!(completed.input.payload, payload("retained result input"));
    assert_eq!(
        upgraded
            .submit(session(), submission("pending", "retained pending input"))
            .await
            .unwrap()
            .position,
        1
    );
}

#[tokio::test]
async fn concurrent_claims_issue_one_lease_and_retries_keep_current_disposition() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let request = ClaimRequest {
        id: change("claim"),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs: vec![change("input")],
        },
    };
    let (left, right) = tokio::join!(store.claim(request.clone()), store.claim(request.clone()));
    let acquired = match (left.unwrap(), right.unwrap()) {
        (ClaimOutcome::Acquired(claim), ClaimOutcome::Existing(view))
        | (ClaimOutcome::Existing(view), ClaimOutcome::Acquired(claim)) => {
            assert_eq!(view.binding, *claim.lease.binding());
            claim
        }
        _ => panic!("exactly one claim must own execution"),
    };
    assert!(store.inspect(session()).await.unwrap().queued.is_empty());
    let mut conflicting = request;
    conflicting.selection = TurnSelection::New {
        turn: TurnId::new("other").unwrap(),
        inputs: vec![change("input")],
    };
    assert_error(
        store.claim(conflicting).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    drop(acquired);
    assert_eq!(
        store
            .inspect_turn(session(), turn())
            .await
            .unwrap()
            .disposition,
        TurnDisposition::Interrupted
    );
}

#[tokio::test]
async fn selected_input_order_survives_recovery() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("first", "one"))
        .await
        .unwrap();
    store
        .submit(session(), submission("second", "two"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("second"), change("first")]).await;
    assert_eq!(acquired.inputs[0].id, change("second"));
    drop(acquired);
    let recovered = store
        .recover(RecoveryRequest {
            id: change("recover"),
            session: session(),
            turn: turn(),
            expected_epoch: 1,
        })
        .await
        .unwrap();
    let ClaimOutcome::Acquired(recovered) = recovered else {
        panic!("expected recovery owner")
    };
    assert_eq!(
        recovered
            .inputs
            .iter()
            .map(|input| input.id.clone())
            .collect::<Vec<_>>(),
        vec![change("second"), change("first")]
    );
}

#[tokio::test]
async fn journal_records_and_terminal_session_state_commit_together() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    let receipt = commit(
        &acquired,
        "finish",
        vec![
            JournalAction::SetCheckpoint(payload("complete")),
            JournalAction::Settle(TurnOutcome {
                status: OutcomeStatus::Succeeded,
                account: Some(payload("done")),
                evidence: vec![],
            }),
        ],
    )
    .await;
    store.verify(receipt.clone()).await.unwrap();
    let view = store.inspect(session()).await.unwrap();
    assert!(view.current.is_none());
    assert!(view.queued.is_empty());
    assert_eq!(view.latest.unwrap().disposition, TurnDisposition::Settled);
    assert_eq!(
        acquired
            .lease
            .journal()
            .lookup(change("finish"))
            .await
            .unwrap(),
        Some(receipt.clone())
    );
    let CommitReceipt::Settled(mut forged) = receipt else {
        panic!("expected settlement")
    };
    forged.record.position = JournalPosition(99);
    assert_error(
        store.verify(CommitReceipt::Settled(forged)).await,
        ErrorKind::Conflict,
        "receipt_not_committed",
    );
}

#[tokio::test]
async fn suspension_keeps_answers_and_resumes_under_a_new_epoch() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    let wait = WaitId::new("question").unwrap();
    let suspended = commit(
        &acquired,
        "suspend",
        vec![
            JournalAction::OpenWait(WaitRecord {
                id: wait.clone(),
                request: payload("question"),
                response: ResponseContract {
                    schema: SchemaId::new("test.text").unwrap(),
                    version: 1,
                },
                answer: None,
                withdrawn: false,
            }),
            JournalAction::Suspend,
        ],
    )
    .await;
    store.verify(suspended.clone()).await.unwrap();
    drop(acquired);
    let view = store.inspect(session()).await.unwrap();
    store
        .control(ControlRequest {
            id: change("answer"),
            session: session(),
            expected_revision: view.revision,
            action: SessionControl::Resolve {
                turn: turn(),
                expected: ControlRevision(1),
                wait: wait.clone(),
                answer: payload("answer"),
            },
        })
        .await
        .unwrap();
    let view = store.inspect(session()).await.unwrap();
    let current = view.current.unwrap();
    let resumed = store
        .claim(ClaimRequest {
            id: change("resume"),
            session: session(),
            expected_revision: view.revision,
            selection: TurnSelection::Resume {
                turn: turn(),
                epoch: 1,
                position: current.position,
            },
        })
        .await
        .unwrap();
    let ClaimOutcome::Acquired(resumed) = resumed else {
        panic!("expected resumed owner")
    };
    assert_eq!(resumed.lease.binding().epoch, 2);
    assert_eq!(
        resumed
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .waits()
            .get(&wait)
            .unwrap()
            .answer,
        Some(payload("answer"))
    );
    store.verify(suspended).await.unwrap();
}

#[tokio::test]
async fn a_live_owner_prevents_takeover_and_old_epoch_changes_are_rejected() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    let old = acquired.lease.journal().load().await.unwrap();
    assert_error(
        store
            .recover(RecoveryRequest {
                id: change("recover"),
                session: session(),
                turn: turn(),
                expected_epoch: 1,
            })
            .await,
        ErrorKind::Conflict,
        "turn_still_owned",
    );
    drop(acquired);
    let ClaimOutcome::Acquired(recovered) = store
        .recover(RecoveryRequest {
            id: change("recover"),
            session: session(),
            turn: turn(),
            expected_epoch: 1,
        })
        .await
        .unwrap()
    else {
        panic!("expected recovered owner")
    };
    let stale = JournalChange::new(
        change("stale"),
        old.binding().clone(),
        old.position(),
        old.controls().revision,
        vec![JournalAction::SetCheckpoint(payload("stale"))],
    )
    .unwrap();
    assert_error(
        recovered.lease.journal().commit(stale).await,
        ErrorKind::Conflict,
        "stale_journal_change",
    );
}

#[tokio::test]
async fn pause_and_cancel_are_atomic_and_control_retries_ignore_later_revisions() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    let view = store.inspect(session()).await.unwrap();
    let request = ControlRequest {
        id: change("stop"),
        session: session(),
        expected_revision: view.revision,
        action: SessionControl::PauseAndCancel {
            turn: turn(),
            expected: ControlRevision(0),
        },
    };
    let (changed, applied) = tokio::join!(
        tokio::time::timeout(
            Duration::from_secs(2),
            acquired.lease.controls().changed(ControlRevision(0))
        ),
        store.control(request.clone())
    );
    assert!(changed.unwrap().unwrap().cancelled);
    let applied = applied.unwrap();
    assert_eq!(store.control(request.clone()).await.unwrap(), applied);
    let view = store.inspect(session()).await.unwrap();
    assert!(view.admission_paused);
    assert!(view.current.unwrap().controls.cancelled);
    let mut conflicting = request;
    conflicting.action = SessionControl::ResumeAdmission;
    assert_error(
        store.control(conflicting).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    let state = acquired.lease.journal().load().await.unwrap();
    let invalid = JournalChange::new(
        change("invalid"),
        state.binding().clone(),
        state.position(),
        state.controls().revision,
        vec![
            JournalAction::SetCheckpoint(payload("candidate")),
            JournalAction::ResolveWait {
                wait: WaitId::new("missing").unwrap(),
                answer: payload("answer"),
            },
        ],
    )
    .unwrap();
    assert!(acquired.lease.journal().commit(invalid).await.is_err());
    assert!(
        acquired
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .checkpoint()
            .is_none()
    );
}

#[tokio::test]
async fn reopen_preserves_inputs_and_requires_explicit_recovery() {
    let (directory, store) = store().await;
    let path = directory.path().join("sessions.sqlite");
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    commit(
        &acquired,
        "checkpoint",
        vec![JournalAction::SetCheckpoint(payload("retained"))],
    )
    .await;
    assert_error(
        SqliteStore::open(&path),
        ErrorKind::Unavailable,
        "store_already_owned",
    );
    drop(store);
    assert_error(
        SqliteStore::open(&path),
        ErrorKind::Unavailable,
        "store_already_owned",
    );
    drop(acquired);
    let reopened = SqliteStore::open(&path).unwrap();
    assert_eq!(
        reopened
            .inspect(session())
            .await
            .unwrap()
            .current
            .unwrap()
            .disposition,
        TurnDisposition::Interrupted
    );
    let ClaimOutcome::Acquired(recovered) = reopened
        .recover(RecoveryRequest {
            id: change("recover"),
            session: session(),
            turn: turn(),
            expected_epoch: 1,
        })
        .await
        .unwrap()
    else {
        panic!("expected recovered owner")
    };
    assert_eq!(
        recovered.lease.journal().load().await.unwrap().checkpoint(),
        Some(&payload("retained"))
    );
    assert_eq!(recovered.inputs, vec![submission("input", "hello")]);
}

struct SuspendsThenFails;
impl TurnDriver for SuspendsThenFails {
    fn run(&self, claim: ClaimedTurn) -> agent_kit_core::BoxFuture<'static, Result<DriverOutcome>> {
        Box::pin(async move {
            commit(&claim, "suspend", vec![JournalAction::Suspend]).await;
            Err(agent_kit_core::Error::new(
                ErrorKind::Unavailable,
                "driver_return_lost",
            ))
        })
    }
}

#[tokio::test]
async fn committed_suspension_survives_loss_of_the_driver_return() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let request = ClaimRequest {
        id: change("claim"),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs: vec![change("input")],
        },
    };
    let sessions = Sessions::new(Arc::new(store), Arc::new(SuspendsThenFails));
    let RunDisposition::Existing(view) = sessions.run_selected(request).await.unwrap() else {
        panic!("expected stored disposition")
    };
    assert_eq!(view.disposition, TurnDisposition::Suspended);
}

#[test]
fn process_exit_retains_committed_work_and_releases_ownership() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg("abrupt_writer_child")
        .arg("--nocapture")
        .env("AGENT_STORE_EXIT_FIXTURE", &path)
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(91));
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let reopened = SqliteStore::open(&path).unwrap();
        let view = reopened.inspect(session()).await.unwrap();
        assert_eq!(
            view.current.unwrap().disposition,
            TurnDisposition::Interrupted
        );
        let ClaimOutcome::Acquired(recovered) = reopened
            .recover(RecoveryRequest {
                id: change("recover"),
                session: session(),
                turn: turn(),
                expected_epoch: 1,
            })
            .await
            .unwrap()
        else {
            panic!("expected recovery owner")
        };
        assert_eq!(
            recovered.lease.journal().load().await.unwrap().checkpoint(),
            Some(&payload("committed"))
        );
    });
}

#[test]
fn abrupt_writer_child() {
    let Some(path) = std::env::var_os("AGENT_STORE_EXIT_FIXTURE") else {
        return;
    };
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let store = SqliteStore::open(path).unwrap();
        store
            .create(CreateSession {
                id: session(),
                request: change("create"),
                configuration: payload("configuration"),
            })
            .await
            .unwrap();
        store
            .submit(session(), submission("input", "hello"))
            .await
            .unwrap();
        let acquired = claim(&store, "claim", vec![change("input")]).await;
        commit(
            &acquired,
            "checkpoint",
            vec![JournalAction::SetCheckpoint(payload("committed"))],
        )
        .await;
        std::process::exit(91);
    });
}

#[tokio::test]
async fn malformed_stored_turn_is_rejected_before_recovery() {
    let (directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    commit(
        &acquired,
        "checkpoint",
        vec![JournalAction::SetCheckpoint(payload("valid"))],
    )
    .await;
    drop(acquired);
    let connection = rusqlite::Connection::open(directory.path().join("sessions.sqlite")).unwrap();
    let bytes: Vec<u8> = connection
        .query_row("SELECT snapshot FROM turns", [], |row| row.get(0))
        .unwrap();
    let mut state: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    state["position"] = serde_json::json!(999);
    connection
        .execute(
            "UPDATE turns SET snapshot=?1",
            [serde_json::to_vec(&state).unwrap()],
        )
        .unwrap();
    assert_error(
        store.inspect_turn(session(), turn()).await,
        ErrorKind::InvalidState,
        "stored_data_invalid",
    );
}

#[tokio::test]
async fn failed_selection_preserves_queue_and_later_valid_claim() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let view = store.inspect(session()).await.unwrap();
    let mut request = ClaimRequest {
        id: change("claim"),
        session: session(),
        expected_revision: view.revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs: vec![change("missing")],
        },
    };
    assert_error(
        store.claim(request.clone()).await,
        ErrorKind::InvalidInput,
        "submission_missing",
    );
    assert_eq!(store.inspect(session()).await.unwrap(), view);
    request.selection = TurnSelection::New {
        turn: turn(),
        inputs: vec![change("input")],
    };
    assert!(matches!(
        store.claim(request).await.unwrap(),
        ClaimOutcome::Acquired(_)
    ));
}

#[test]
fn database_ownership_excludes_another_process() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let _owner = SqliteStore::open(&path).unwrap();
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg("ownership_probe_child")
        .arg("--nocapture")
        .env("AGENT_STORE_OWNER_FIXTURE", &path)
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(92));
}

#[test]
fn ownership_probe_child() {
    let Some(path) = std::env::var_os("AGENT_STORE_OWNER_FIXTURE") else {
        return;
    };
    let result = SqliteStore::open(path);
    match result {
        Err(error) if error.code == "store_already_owned" => std::process::exit(92),
        _ => std::process::exit(93),
    }
}

#[test]
fn unknown_database_schema_is_rejected() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    drop(SqliteStore::open(&path).unwrap());
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection
        .pragma_update(None, "user_version", 1000)
        .unwrap();
    drop(connection);
    assert_error(
        SqliteStore::open(&path),
        ErrorKind::Unsupported,
        "store_schema_unsupported",
    );
}

#[cfg(unix)]
#[test]
fn private_database_paths_reject_links_and_shared_access() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let target = directory.path().join("unrelated");
    std::fs::write(&target, "untouched").unwrap();
    symlink(&target, &path).unwrap();
    assert_error(
        SqliteStore::open(&path),
        ErrorKind::InvalidInput,
        "store_file_not_regular",
    );
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "untouched");
    std::fs::remove_file(&path).unwrap();
    std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_error(
        SqliteStore::open(&path),
        ErrorKind::InvalidInput,
        "store_directory_not_private",
    );
    std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    drop(SqliteStore::open(&path).unwrap());
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert_error(
        SqliteStore::open(&path),
        ErrorKind::InvalidInput,
        "store_file_not_private",
    );
}

#[tokio::test]
async fn changed_stored_input_is_rejected_before_claim() {
    let (directory, store) = store().await;
    store
        .submit(session(), submission("input", "original"))
        .await
        .unwrap();
    let revision = store.inspect(session()).await.unwrap().revision;
    let connection = rusqlite::Connection::open(directory.path().join("sessions.sqlite")).unwrap();
    connection
        .execute(
            "UPDATE submissions SET payload=?1",
            [serde_json::to_vec(&payload("changed")).unwrap()],
        )
        .unwrap();
    let request = ClaimRequest {
        id: change("claim"),
        session: session(),
        expected_revision: revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs: vec![change("input")],
        },
    };
    assert_error(
        store.claim(request).await,
        ErrorKind::InvalidState,
        "stored_input_fingerprint_mismatch",
    );
}

struct ForgedSuspension;
impl TurnDriver for ForgedSuspension {
    fn run(&self, claim: ClaimedTurn) -> agent_kit_core::BoxFuture<'static, Result<DriverOutcome>> {
        Box::pin(async move {
            let receipt = commit(&claim, "suspend", vec![JournalAction::Suspend]).await;
            let CommitReceipt::Suspended(mut receipt) = receipt else {
                panic!("expected suspension")
            };
            receipt.record.position = JournalPosition(1000);
            Ok(DriverOutcome::Suspended(receipt))
        })
    }
}

#[tokio::test]
async fn service_verifies_a_driver_receipt_before_reporting_suspension() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let request = ClaimRequest {
        id: change("claim"),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs: vec![change("input")],
        },
    };
    let sessions = Sessions::new(Arc::new(store), Arc::new(ForgedSuspension));
    assert_error(
        sessions.run_selected(request).await,
        ErrorKind::Conflict,
        "receipt_not_committed",
    );
}

#[tokio::test]
async fn cancelled_suspension_can_be_claimed_only_for_finalization() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    commit(&acquired, "suspend", vec![JournalAction::Suspend]).await;
    drop(acquired);
    let view = store.inspect(session()).await.unwrap();
    store
        .control(ControlRequest {
            id: change("stop"),
            session: session(),
            expected_revision: view.revision,
            action: SessionControl::PauseAndCancel {
                turn: turn(),
                expected: view.current.unwrap().controls.revision,
            },
        })
        .await
        .unwrap();
    let view = store.inspect(session()).await.unwrap();
    let current = view.current.unwrap();
    let normal_resume = ClaimRequest {
        id: change("resume"),
        session: session(),
        expected_revision: view.revision,
        selection: TurnSelection::Resume {
            turn: turn(),
            epoch: current.binding.epoch,
            position: current.position,
        },
    };
    assert_error(
        store.claim(normal_resume).await,
        ErrorKind::InvalidState,
        "session_admission_paused",
    );
    let ClaimOutcome::Acquired(recovered) = store
        .recover(RecoveryRequest {
            id: change("recover"),
            session: session(),
            turn: turn(),
            expected_epoch: 1,
        })
        .await
        .unwrap()
    else {
        panic!("expected finalization owner")
    };
    let state = recovered.lease.journal().load().await.unwrap();
    assert!(state.controls().cancelled);
    assert!(!state.controls().admits_work());
    assert_eq!(state.binding().epoch, 2);
    commit(
        &recovered,
        "cancelled",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Cancelled,
            account: None,
            evidence: vec![],
        })],
    )
    .await;
    assert!(store.inspect(session()).await.unwrap().current.is_none());
}

fn history_message(id: &str, text: &str) -> HistoryRecord {
    HistoryRecord::Message(Message {
        id: MessageId::new(id).unwrap(),
        role: Role::User,
        phase: None,
        content: vec![Content::Text(text.into())],
        provenance: Provenance {
            source: "fixture".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    })
}

async fn finish_history_turn(
    store: &SqliteStore,
    session: SessionId,
    turn: &str,
    records: Vec<HistoryRecord>,
) -> TurnId {
    let input = submission(&format!("input-{turn}"), "hello");
    store.submit(session.clone(), input.clone()).await.unwrap();
    let view = store.inspect(session.clone()).await.unwrap();
    let id = TurnId::new(turn).unwrap();
    let request = ClaimRequest {
        id: change(&format!("claim-{turn}")),
        session,
        expected_revision: view.revision,
        selection: TurnSelection::New {
            turn: id.clone(),
            inputs: vec![input.id],
        },
    };
    let ClaimOutcome::Acquired(claim) = store.claim(request).await.unwrap() else {
        panic!("expected new turn")
    };
    commit(
        &claim,
        "finish",
        vec![
            JournalAction::AppendHistory(records),
            JournalAction::Settle(TurnOutcome {
                status: OutcomeStatus::Succeeded,
                account: None,
                evidence: vec![],
            }),
        ],
    )
    .await;
    id
}

#[tokio::test]
async fn history_preserves_turn_creation_and_append_order_after_reopen() {
    let (directory, store) = store().await;
    let first_records = vec![
        history_message("z-first", "one"),
        history_message("z-second", "two"),
    ];
    let first = finish_history_turn(&store, session(), "turn-z", first_records.clone()).await;
    let other = SessionId::new("other").unwrap();
    store
        .create(CreateSession {
            id: other.clone(),
            request: change("create"),
            configuration: payload("other"),
        })
        .await
        .unwrap();
    let foreign_turn = finish_history_turn(
        &store,
        other,
        "foreign",
        vec![history_message("foreign-message", "different session")],
    )
    .await;
    let second_records = vec![history_message("a-first", "three")];
    let second = finish_history_turn(&store, session(), "turn-a", second_records.clone()).await;
    store
        .submit(session(), submission("pending", "still queued"))
        .await
        .unwrap();
    drop(store);

    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let before = reopened.inspect(session()).await.unwrap();
    assert_eq!(
        reopened.history(session(), None).await.unwrap(),
        [first_records.clone(), second_records].concat()
    );
    assert_eq!(
        reopened.history(session(), Some(second)).await.unwrap(),
        first_records
    );
    assert!(
        reopened
            .history(session(), Some(first))
            .await
            .unwrap()
            .is_empty()
    );
    assert_error(
        reopened.history(session(), Some(foreign_turn)).await,
        ErrorKind::InvalidInput,
        "turn_missing",
    );
    assert_eq!(reopened.inspect(session()).await.unwrap(), before);
}

#[tokio::test]
async fn input_observation_preserves_payload_and_disposition_after_reopen() {
    let (directory, store) = store().await;
    let input = submission("observed", "retained input");
    assert!(
        store
            .input(session(), input.id.clone())
            .await
            .unwrap()
            .is_none()
    );
    store.submit(session(), input.clone()).await.unwrap();
    let queued = store
        .input(session(), input.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(queued.input, input);
    assert_eq!(queued.disposition, InputDisposition::Queued);
    let owner = claim(&store, "claim", vec![input.id.clone()]).await;
    let claimed = store
        .input(session(), input.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(claimed.position, queued.position);
    assert_eq!(
        claimed.disposition,
        InputDisposition::Claimed { turn: turn() }
    );
    commit(
        &owner,
        "finish",
        vec![JournalAction::Settle(TurnOutcome {
            status: OutcomeStatus::Succeeded,
            account: None,
            evidence: vec![],
        })],
    )
    .await;
    drop(owner);
    let other = SessionId::new("other").unwrap();
    store
        .create(CreateSession {
            id: other.clone(),
            request: change("create"),
            configuration: payload("other"),
        })
        .await
        .unwrap();
    drop(store);

    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let before = reopened.inspect(session()).await.unwrap();
    let completed = reopened
        .input(session(), input.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(completed.input, input);
    assert_eq!(completed.position, queued.position);
    assert_eq!(
        completed.disposition,
        InputDisposition::Completed { turn: turn() }
    );
    assert!(
        reopened
            .input(other, input.id.clone())
            .await
            .unwrap()
            .is_none()
    );
    assert_error(
        reopened
            .input(SessionId::new("missing").unwrap(), input.id)
            .await,
        ErrorKind::InvalidInput,
        "session_missing",
    );
    assert_eq!(reopened.inspect(session()).await.unwrap(), before);
}

#[tokio::test]
async fn oversized_history_is_refused_without_returning_a_partial_projection() {
    let (_directory, store) = store().await;
    let records = (0..4_097)
        .map(|i| history_message(&format!("message-{i}"), "text"))
        .collect();
    let turn = finish_history_turn(&store, session(), "large-turn", records).await;
    assert_error(
        store.history(session(), None).await,
        ErrorKind::LimitExceeded,
        "history_projection_limit",
    );
    assert!(
        store
            .history(session(), Some(turn))
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn an_answer_and_its_history_contribution_commit_atomically() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let claim = claim(&store, "claim", vec![change("input")]).await;
    let wait = WaitId::new("question").unwrap();
    commit(
        &claim,
        "question",
        vec![JournalAction::OpenWait(WaitRecord {
            id: wait.clone(),
            request: payload("choose"),
            response: ResponseContract {
                schema: SchemaId::new("test.text").unwrap(),
                version: 1,
            },
            answer: None,
            withdrawn: false,
        })],
    )
    .await;
    let state = claim.lease.journal().load().await.unwrap();
    let answer_record = HistoryRecord::Message(Message {
        id: MessageId::new("answer").unwrap(),
        role: Role::User,
        phase: None,
        content: vec![Content::Text("selected".into())],
        provenance: Provenance {
            source: "client".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    });
    let mut request = ControlRequest {
        id: change("answer"),
        session: session(),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        action: SessionControl::ResolveAndAppend {
            turn: turn(),
            expected: state.controls().revision,
            expected_history: state.history().position(),
            wait: wait.clone(),
            answer: payload("selected"),
            records: vec![answer_record.clone(), answer_record.clone()],
        },
    };
    assert_error(
        store.control(request.clone()).await,
        ErrorKind::Conflict,
        "duplicate_message",
    );
    let unchanged = claim.lease.journal().load().await.unwrap();
    assert_eq!(unchanged.position(), state.position());
    assert!(unchanged.waits().get(&wait).unwrap().is_pending());
    let SessionControl::ResolveAndAppend { records, .. } = &mut request.action else {
        unreachable!()
    };
    records.pop();
    let receipt = store.control(request.clone()).await.unwrap();
    assert_eq!(store.control(request).await.unwrap(), receipt);
    let state = claim.lease.journal().load().await.unwrap();
    assert_eq!(
        state.waits().get(&wait).unwrap().answer,
        Some(payload("selected"))
    );
    assert_eq!(state.history().records(), &[answer_record]);
}

#[tokio::test]
async fn resuming_a_paused_turn_claims_exclusively_and_keeps_its_unanswered_wait() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    commit(
        &acquired,
        "pause",
        vec![
            JournalAction::OpenWait(WaitRecord {
                id: WaitId::new("question").unwrap(),
                request: payload("choose"),
                response: ResponseContract {
                    schema: SchemaId::new("test.text").unwrap(),
                    version: 1,
                },
                answer: None,
                withdrawn: false,
            }),
            JournalAction::Control(agent_kit_core::turn::ControlDirective::Pause),
            JournalAction::Suspend,
        ],
    )
    .await;
    let view = store.inspect(session()).await.unwrap();
    let current = view.current.unwrap();
    let request = ClaimRequest {
        id: change("resume"),
        session: session(),
        expected_revision: view.revision,
        selection: TurnSelection::ResumePaused {
            turn: turn(),
            epoch: current.binding.epoch,
            position: current.position,
            control_revision: current.controls.revision,
        },
    };
    assert!(
        store
            .claim_receipt(request.clone())
            .await
            .unwrap()
            .is_none()
    );
    assert_error(
        store.claim(request.clone()).await,
        ErrorKind::Conflict,
        "turn_still_owned",
    );
    assert!(
        store
            .inspect(session())
            .await
            .unwrap()
            .current
            .unwrap()
            .controls
            .paused
    );
    drop(acquired);
    let ClaimOutcome::Acquired(resumed) = store.claim(request.clone()).await.unwrap() else {
        panic!("expected resume lease")
    };
    let state = resumed.lease.journal().load().await.unwrap();
    assert_eq!(state.binding().epoch, 2);
    assert!(!state.controls().paused);
    assert!(
        state
            .waits()
            .get(&WaitId::new("question").unwrap())
            .unwrap()
            .is_pending()
    );
    assert_eq!(
        store
            .claim_receipt(request.clone())
            .await
            .unwrap()
            .unwrap()
            .binding
            .epoch,
        2
    );
    assert!(matches!(
        store.claim(request.clone()).await.unwrap(),
        ClaimOutcome::Existing(_)
    ));
    let mut conflict = request;
    conflict.expected_revision.0 += 1;
    assert_error(
        store.claim_receipt(conflict).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
}
