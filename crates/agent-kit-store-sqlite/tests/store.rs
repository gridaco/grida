mod support;

#[path = "store/operation_claim.rs"]
mod operation_claim;

use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role};
use agent_kit_core::turn::{
    CommitReceipt, ControlRevision, JournalAction, JournalChange, JournalPosition,
    ResponseContract, TurnOutcome, WaitRecord,
};
use agent_kit_core::{
    ErrorKind, Fingerprint, MessageId, Result, SchemaId, SessionId, TurnId, WaitId,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ClaimedTurn, ControlRequest, CreateSession, DriverOutcome,
    InputDisposition, RecoveryRequest, RunDisposition, SessionControl, SessionRevision,
    SessionStore, Sessions, TurnDisposition, TurnDriver, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use agent_kit_store_sqlite::history::{
    HistoryRevision, HistorySeed, HistorySelection, RetainedHistory, SeededSession,
};
use std::sync::Arc;
use std::time::Duration;
use support::*;
use tempfile::TempDir;

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
    support::remove_turn_link_schema(&previous);
    previous
        .execute_batch(
            "DROP TABLE session_retirements;
         DROP TABLE session_catalog;
         DROP TABLE session_context_replacements;
         DROP TABLE session_history_views;
         DROP INDEX session_turn_order;
         DROP INDEX submission_queue_order;
         ALTER TABLE submissions DROP COLUMN queue_order;
         ALTER TABLE submissions DROP COLUMN replacement_id;
         ALTER TABLE submissions DROP COLUMN withdrawn;
         ALTER TABLE sessions DROP COLUMN driver_state;
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
    finish_history_turn(&store, session(), "empty-turn", vec![]).await;
    let records: Vec<_> = (0..4_097)
        .map(|i| history_message(&format!("message-{i}"), "text"))
        .collect();
    let turn = finish_history_turn(&store, session(), "large-turn", records.clone()).await;
    assert_error(
        store.history(session(), None).await,
        ErrorKind::LimitExceeded,
        "history_projection_limit",
    );
    assert_error(
        store
            .context_prefix_with(session(), |state| state.history().records().to_vec())
            .await,
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
    let mut replay = store
        .open_history_replay(session(), |state| state.history().records().to_vec())
        .await
        .unwrap();
    assert_eq!(replay.next().await.unwrap(), Some(records));
    assert_eq!(replay.next().await.unwrap(), None);
}

#[tokio::test]
async fn bounded_context_prefix_keeps_whole_turns_and_checks_the_full_source() {
    use agent_kit_core::turn::TurnState;
    use agent_kit_store_sqlite::context::{ContextInstall, UnpromptedClaim};

    let (directory, store) = store().await;
    let prefix: Vec<_> = (0..4_094)
        .map(|index| history_message(&format!("old-{index}"), "older text"))
        .collect();
    let boundary = finish_history_turn(&store, session(), "prefix", prefix.clone()).await;
    finish_history_turn(&store, session(), "empty", vec![]).await;
    let suffix = vec![
        history_message("suffix-one", "keep one"),
        history_message("suffix-two", "keep two"),
        history_message("suffix-three", "keep three"),
    ];
    finish_history_turn(&store, session(), "suffix", suffix.clone()).await;
    let project = |state: &TurnState| state.history().records().to_vec();
    let captured = store.context_prefix_with(session(), project).await.unwrap();
    assert_eq!(captured.unprojected_suffix_after.as_ref(), Some(&boundary));
    assert_eq!(captured.history.clone().into_records(), prefix);
    assert_error(
        store.context_history_with(session(), None, project).await,
        ErrorKind::LimitExceeded,
        "history_projection_limit",
    );

    // A later turn that could fit alone still belongs to the untouched suffix.
    let later = history_message("later", "keep the later complete turn");
    finish_history_turn(&store, session(), "later", vec![later.clone()]).await;
    let current = store.context_prefix_with(session(), project).await.unwrap();
    assert_eq!(current.unprojected_suffix_after.as_ref(), Some(&boundary));
    assert_eq!(current.history.clone().into_records(), prefix);
    assert_eq!(
        current.history.basis,
        store
            .context_history_with(session(), None, |_| Vec::new())
            .await
            .unwrap()
            .basis
    );
    let request = UnpromptedClaim {
        session: session(),
        turn: TurnId::new("replacement-turn").unwrap(),
        request: change("replace-prefix"),
        expected_revision: current.history.session_revision,
        expected_context: current.history.basis,
        checkpoint: payload("current basis"),
    };
    assert_error(
        store
            .claim_unprompted(UnpromptedClaim {
                expected_context: captured.history.basis,
                ..request.clone()
            })
            .await,
        ErrorKind::Conflict,
        "history_basis_changed",
    );
    let ClaimOutcome::Acquired(claim) = store.claim_unprompted(request.clone()).await.unwrap()
    else {
        panic!("expected unprompted owner")
    };
    let outcome = TurnOutcome {
        status: OutcomeStatus::Succeeded,
        account: None,
        evidence: vec![],
    };
    commit(&claim, "done", vec![JournalAction::Settle(outcome.clone())]).await;
    drop(claim);
    let summary = history_message("summary", "compact prefix");
    store
        .install_context(ContextInstall {
            session: session(),
            turn: request.turn,
            expected_context: request.expected_context,
            expected_outcome: Fingerprint::of(&outcome).unwrap(),
            replacement: HistorySeed {
                records: vec![summary.clone()],
                provenance: payload("covered prefix"),
            },
            covered_through: current.unprojected_suffix_after,
        })
        .await
        .unwrap();
    drop(store);
    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let compacted = store.context_prefix_with(session(), project).await.unwrap();
    assert!(compacted.unprojected_suffix_after.is_none());
    assert_eq!(
        compacted.history.into_records(),
        [vec![summary], suffix.clone(), vec![later.clone()]].concat()
    );
    let mut replay = store.open_history_replay(session(), project).await.unwrap();
    let mut visible = Vec::new();
    while let Some(records) = replay.next().await.unwrap() {
        visible.extend(records);
    }
    assert_eq!(visible, [prefix, suffix, vec![later]].concat());
}

#[tokio::test]
async fn bounded_context_prefix_still_refuses_a_malformed_or_oversized_scan() {
    use agent_kit_core::turn::{TurnBinding, TurnState};

    let (directory, store) = store().await;
    let prefix = (0..4_096)
        .map(|index| history_message(&format!("prefix-{index}"), "older text"))
        .collect();
    finish_history_turn(&store, session(), "prefix", prefix).await;
    finish_history_turn(
        &store,
        session(),
        "suffix",
        vec![history_message("suffix", "unprojected suffix")],
    )
    .await;
    drop(store);
    let path = directory.path().join("sessions.sqlite");
    let corrupt = rusqlite::Connection::open(&path).unwrap();
    corrupt
        .execute(
            "INSERT INTO turns(session,id,snapshot) VALUES(?1,'malformed',?2)",
            rusqlite::params![session().as_str(), b"invalid"],
        )
        .unwrap();
    drop(corrupt);
    let project = |state: &TurnState| state.history().records().to_vec();
    let store = SqliteStore::open(&path).unwrap();
    assert_error(
        store.context_prefix_with(session(), project).await,
        ErrorKind::InvalidState,
        "stored_data_invalid",
    );
    drop(store);

    let mut connection = rusqlite::Connection::open(&path).unwrap();
    let transaction = connection.transaction().unwrap();
    transaction
        .execute("DELETE FROM turns WHERE id='malformed'", [])
        .unwrap();
    for index in 0..4_095 {
        let turn = TurnId::new(format!("empty-{index}")).unwrap();
        let state = TurnState::new(TurnBinding {
            session: session(),
            turn: turn.clone(),
            epoch: 1,
        })
        .unwrap();
        transaction
            .execute(
                "INSERT INTO turns(session,id,snapshot) VALUES(?1,?2,?3)",
                rusqlite::params![
                    session().as_str(),
                    turn.as_str(),
                    serde_json::to_vec(&state).unwrap()
                ],
            )
            .unwrap();
    }
    transaction.commit().unwrap();
    drop(connection);
    let store = SqliteStore::open(&path).unwrap();
    assert_error(
        store.context_prefix_with(session(), project).await,
        ErrorKind::LimitExceeded,
        "history_projection_limit",
    );
}

#[tokio::test]
async fn paged_transcript_replay_freezes_the_active_tail_without_a_lease() {
    let (_directory, store) = store().await;
    let mut expected = Vec::new();
    for i in 0..34 {
        let name = format!("settled-{i}");
        let record = history_message(&name, "before replay");
        finish_history_turn(&store, session(), &name, vec![record.clone()]).await;
        expected.push(record);
    }
    store
        .submit(session(), submission("active", "hello"))
        .await
        .unwrap();
    let active = claim(&store, "claim-active", vec![change("active")]).await;
    let current = history_message("active", "observed at replay start");
    commit(
        &active,
        "first",
        vec![JournalAction::AppendHistory(vec![current.clone()])],
    )
    .await;
    expected.push(current);

    let mut replay = store
        .open_history_replay(session(), |state| state.history().records().to_vec())
        .await
        .unwrap();
    let mut restored = replay.next().await.unwrap().unwrap();
    assert!(!restored.is_empty() && restored.len() < expected.len());
    commit(
        &active,
        "finish",
        vec![
            JournalAction::AppendHistory(vec![history_message("late", "after capture")]),
            JournalAction::Settle(TurnOutcome {
                status: OutcomeStatus::Succeeded,
                account: None,
                evidence: vec![],
            }),
        ],
    )
    .await;
    drop(active);
    finish_history_turn(
        &store,
        session(),
        "another-turn",
        vec![history_message("another", "next turn")],
    )
    .await;

    while let Some(page) = replay.next().await.unwrap() {
        restored.extend(page);
    }
    assert_eq!(restored, expected);
    assert_eq!(
        store.history(session(), None).await.unwrap().len(),
        expected.len() + 2
    );
}

#[tokio::test]
async fn upgraded_turns_replay_without_invented_timing() {
    let (directory, store) = store().await;
    let path = directory.path().join("sessions.sqlite");
    let old = history_message("before-upgrade", "kept text");
    finish_history_turn(&store, session(), "before-upgrade", vec![old.clone()]).await;
    drop(store);
    let previous = rusqlite::Connection::open(&path).unwrap();
    previous
        .execute_batch("DROP TABLE turn_times; PRAGMA user_version=11;")
        .unwrap();
    drop(previous);
    let store = SqliteStore::open(&path).unwrap();
    let new = history_message("after-upgrade", "timed text");
    finish_history_turn(&store, session(), "after-upgrade", vec![new.clone()]).await;
    let project = |state: &agent_kit_core::turn::TurnState| state.history().records().to_vec();
    let window = store
        .history_replay_window(session(), None, project, |_| 1)
        .await
        .unwrap();
    assert_eq!(plain(&window.records), vec![old, new]);
    let [before, after] = &window.turns[..] else {
        panic!("expected two turns")
    };
    assert_eq!(before.status, Some(OutcomeStatus::Succeeded));
    assert_eq!((before.started_ms, before.settled_ms), (None, None));
    assert!(after.started_ms.unwrap() <= after.settled_ms.unwrap());
}

#[tokio::test]
async fn earlier_replay_windows_keep_the_exact_boundary_as_new_turns_arrive() {
    let (_directory, store) = store().await;
    let mut expected = Vec::new();
    for i in 0..70 {
        let id = format!("window-turn-{i}");
        let record = history_message(&id, "recorded text");
        finish_history_turn(&store, session(), &id, vec![record.clone()]).await;
        expected.push(record);
    }
    let project = |state: &agent_kit_core::turn::TurnState| state.history().records().to_vec();
    let measure = |_: &HistoryRecord| 13;
    let latest = store
        .history_replay_window(session(), None, project, measure)
        .await
        .unwrap();
    assert_eq!(plain(&latest.records), expected[38..]);
    // Each record names its committing turn, and every contributing turn
    // carries its recorded outcome and wall-clock interval.
    assert_eq!(latest.turns.len(), 32);
    for (record, turn) in latest.records.iter().zip(&latest.turns) {
        assert_eq!(record.turn.as_ref(), Some(&turn.id));
        assert_eq!(turn.status, Some(OutcomeStatus::Succeeded));
        let (started, settled) = (turn.started_ms.unwrap(), turn.settled_ms.unwrap());
        assert!(started > 0 && started <= settled);
    }
    assert_eq!(latest.turns[0].id.as_str(), "window-turn-38");
    let mut windows = vec![plain(&latest.records)];
    let mut older = latest.older;
    finish_history_turn(
        &store,
        session(),
        "newer",
        vec![history_message("newer", "outside the window")],
    )
    .await;
    while let Some(cursor) = older {
        let page = store
            .history_replay_window(session(), Some(cursor), project, measure)
            .await
            .unwrap();
        assert_eq!(page.view, latest.view);
        windows.push(plain(&page.records));
        older = page.older;
    }
    assert_eq!(
        windows.into_iter().rev().flatten().collect::<Vec<_>>(),
        expected
    );
}

#[tokio::test]
async fn an_earlier_window_cannot_mix_changed_records_within_an_active_turn() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("window-input", "prompt"))
        .await
        .unwrap();
    let active = claim(&store, "claim-window", vec![change("window-input")]).await;
    let records = (0..132)
        .map(|i| history_message(&format!("window-record-{i}"), "text"))
        .collect::<Vec<_>>();
    commit(
        &active,
        "first",
        vec![JournalAction::AppendHistory(records.clone())],
    )
    .await;
    let project = |state: &agent_kit_core::turn::TurnState| state.history().records().to_vec();
    let measure = |_: &HistoryRecord| 4;
    let latest = store
        .history_replay_window(session(), None, project, measure)
        .await
        .unwrap();
    assert_eq!(plain(&latest.records), records[4..]);
    // A running turn has a recorded start and no outcome or finish.
    assert_eq!(latest.turns.len(), 1);
    assert_eq!(latest.turns[0].status, None);
    assert!(latest.turns[0].started_ms.is_some());
    assert_eq!(latest.turns[0].settled_ms, None);
    let older = store
        .history_replay_window(session(), latest.older.clone(), project, measure)
        .await
        .unwrap();
    assert_eq!(plain(&older.records), records[..4]);
    assert!(older.older.is_none());
    commit(
        &active,
        "append",
        vec![JournalAction::AppendHistory(vec![history_message(
            "late", "late",
        )])],
    )
    .await;
    assert_error(
        store
            .history_replay_window(session(), latest.older, project, measure)
            .await,
        ErrorKind::Conflict,
        "history_replay_window_changed",
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

#[tokio::test]
async fn stopped_turns_reject_late_answers_and_external_history() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    let wait = WaitId::new("question").unwrap();
    commit(
        &acquired,
        "stop",
        vec![
            JournalAction::OpenWait(WaitRecord {
                id: wait.clone(),
                request: payload("choose"),
                response: ResponseContract {
                    schema: SchemaId::new("test.text").unwrap(),
                    version: 1,
                },
                answer: None,
                withdrawn: false,
            }),
            JournalAction::Control(agent_kit_core::turn::ControlDirective::Cancel),
        ],
    )
    .await;
    let state = acquired.lease.journal().load().await.unwrap();
    let records = vec![HistoryRecord::Message(Message {
        id: MessageId::new("late").unwrap(),
        role: Role::User,
        phase: None,
        content: vec![Content::Text("late".into())],
        provenance: Provenance {
            source: "client".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    })];
    for action in [
        SessionControl::Resolve {
            turn: turn(),
            expected: state.controls().revision,
            wait: wait.clone(),
            answer: payload("late"),
        },
        SessionControl::AppendHistory {
            turn: turn(),
            expected: state.controls().revision,
            expected_history: state.history().position(),
            records: records.clone(),
        },
        SessionControl::ResolveAndAppend {
            turn: turn(),
            expected: state.controls().revision,
            expected_history: state.history().position(),
            wait: wait.clone(),
            answer: payload("late"),
            records,
        },
    ] {
        assert_error(
            store
                .control(ControlRequest {
                    id: change("late"),
                    session: session(),
                    expected_revision: store.inspect(session()).await.unwrap().revision,
                    action,
                })
                .await,
            ErrorKind::InvalidState,
            "turn_cancelled",
        );
        let current = acquired.lease.journal().load().await.unwrap();
        assert_eq!(current.position(), state.position());
        assert!(current.waits().get(&wait).unwrap().is_pending());
    }
}

async fn current_history(store: &SqliteStore, session: SessionId) -> RetainedHistory {
    store
        .retained_history_with(session, HistorySelection::Current, |state| {
            state.history().records().to_vec()
        })
        .await
        .unwrap()
}

fn copy_seed(history: RetainedHistory) -> Result<HistorySeed> {
    Ok(HistorySeed {
        records: history.into_records(),
        provenance: payload("fixture lineage"),
    })
}

#[tokio::test]
async fn fork_captures_live_source_and_retries_without_reading_it_again() {
    let (directory, store) = store().await;
    let input = submission("input", "source input");
    store.submit(session(), input.clone()).await.unwrap();
    let owner = claim(&store, "claim", vec![input.id]).await;
    let first = history_message("first", "committed before fork");
    let later = history_message("later", "committed after fork");
    commit(
        &owner,
        "first",
        vec![JournalAction::AppendHistory(vec![first.clone()])],
    )
    .await;
    let source = store.inspect(session()).await.unwrap();
    let destination = SessionId::new("fork").unwrap();
    let request = SeededSession {
        create: CreateSession {
            id: destination.clone(),
            request: change("fork"),
            configuration: payload("new settings"),
        },
        source: session(),
        expected_history: current_history(&store, session()).await.basis,
        intent: Fingerprint::of(&"first").unwrap(),
    };
    let created = store
        .create_seeded(
            request.clone(),
            |state| state.history().records().to_vec(),
            copy_seed,
        )
        .await
        .unwrap();

    assert_eq!(store.inspect(session()).await.unwrap(), source);
    commit(
        &owner,
        "later",
        vec![JournalAction::AppendHistory(vec![later.clone()])],
    )
    .await;
    assert_eq!(
        store.inspect(session()).await.unwrap().revision,
        source.revision
    );
    let mut stale = request.clone();
    stale.create.id = SessionId::new("stale-fork").unwrap();
    assert_error(
        store
            .create_seeded(
                stale.clone(),
                |state| state.history().records().to_vec(),
                copy_seed,
            )
            .await,
        ErrorKind::Conflict,
        "history_basis_changed",
    );
    assert_error(
        store.inspect(stale.create.id).await,
        ErrorKind::InvalidInput,
        "session_missing",
    );
    assert_eq!(
        store.history(session(), None).await.unwrap(),
        vec![first.clone(), later]
    );

    drop(owner);
    drop(store);
    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    assert_eq!(
        reopened
            .create_seeded(
                request.clone(),
                |_| panic!("retry projected source"),
                |_| panic!("retry rebuilt seed"),
            )
            .await
            .unwrap(),
        created
    );
    let mut changed = request;
    changed.intent = Fingerprint::of(&"changed cut").unwrap();
    assert_error(
        reopened.create_seeded(changed, |_| vec![], copy_seed).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    let fork = reopened.inspect(destination.clone()).await.unwrap();
    assert_eq!(fork.configuration, payload("new settings"));
    assert!(fork.current.is_none() && fork.latest.is_none() && fork.queued.is_empty());
    assert!(!fork.admission_paused);
    assert_eq!(
        reopened.history(destination.clone(), None).await.unwrap(),
        vec![first]
    );
    let retained = current_history(&reopened, destination).await;
    assert!(retained.basis.tail.is_none());
    assert!(retained.records.is_empty());
    assert_eq!(
        retained.seed.unwrap().provenance,
        payload("fixture lineage")
    );
}

#[tokio::test]
async fn revision_keeps_prior_turn_context_and_accepts_replacement_atomically() {
    let (directory, store) = store().await;
    let kept = history_message("kept", "keep");
    let original = history_message("original", "superseded");
    let first = finish_history_turn(&store, session(), "first", vec![kept.clone()]).await;
    let second = finish_history_turn(&store, session(), "second", vec![original.clone()]).await;
    let paused = store
        .control(ControlRequest {
            id: change("pause"),
            session: session(),
            expected_revision: store.inspect(session()).await.unwrap().revision,
            action: SessionControl::PauseAdmission,
        })
        .await
        .unwrap();
    let request = HistoryRevision {
        session: session(),
        request: change("revise"),
        expected_revision: paused.revision,
        expected_history: current_history(&store, session()).await.basis,
        intent: Fingerprint::of(&"before original").unwrap(),
        replacement: submission("revised", "new user text"),
    };
    let mut duplicate = request.clone();
    duplicate.replacement = submission("input-second", "would overwrite original input");
    let keep_for_failure = kept.clone();
    assert_error(
        store
            .revise_history(
                duplicate,
                |state| state.history().records().to_vec(),
                move |_| {
                    Ok(HistorySeed {
                        records: vec![keep_for_failure],
                        provenance: payload("cut"),
                    })
                },
            )
            .await,
        ErrorKind::Conflict,
        "input_identity_reused",
    );
    assert_eq!(
        store.history(session(), None).await.unwrap(),
        vec![kept.clone(), original.clone()]
    );
    assert_eq!(
        store.inspect(session()).await.unwrap().revision,
        paused.revision
    );

    let keep_for_seed = kept.clone();
    let receipt = store
        .revise_history(
            request.clone(),
            |state| state.history().records().to_vec(),
            move |_| {
                Ok(HistorySeed {
                    records: vec![keep_for_seed],
                    provenance: payload("cut"),
                })
            },
        )
        .await
        .unwrap();
    assert_eq!(
        store
            .submit(session(), request.replacement.clone())
            .await
            .unwrap(),
        receipt.acceptance
    );
    let revised = store.inspect(session()).await.unwrap();
    assert!(revised.admission_paused);
    assert_eq!(revised.queued[0].input, request.replacement);
    assert_eq!(
        store.history(session(), None).await.unwrap(),
        vec![kept.clone()]
    );
    assert!(
        store
            .history(session(), Some(first))
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        store
            .history(session(), Some(second.clone()))
            .await
            .unwrap(),
        vec![kept.clone()]
    );
    let old = store
        .retained_history_with(
            session(),
            HistorySelection::View(SessionRevision(0)),
            |state| state.history().records().to_vec(),
        )
        .await
        .unwrap();
    assert_eq!(old.into_records(), vec![kept.clone(), original.clone()]);
    assert_eq!(
        store
            .inspect_turn_with(session(), second, |state| {
                assert!(state.outcome().is_some());
                Ok(state.history().records().to_vec())
            })
            .await
            .unwrap(),
        vec![original],
    );

    let resumed = store
        .control(ControlRequest {
            id: change("resume"),
            session: session(),
            expected_revision: revised.revision,
            action: SessionControl::ResumeAdmission,
        })
        .await
        .unwrap();
    let replacement = TurnId::new("replacement").unwrap();
    let ClaimOutcome::Acquired(owner) = store
        .claim(ClaimRequest {
            id: change("claim-replacement"),
            session: session(),
            expected_revision: resumed.revision,
            selection: TurnSelection::New {
                turn: replacement.clone(),
                inputs: vec![request.replacement.id.clone()],
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected replacement owner");
    };
    assert_eq!(owner.inputs, vec![request.replacement.clone()]);
    let new = history_message("revised", "new user text");
    commit(
        &owner,
        "finish-replacement",
        vec![
            JournalAction::AppendHistory(vec![new.clone()]),
            JournalAction::Settle(TurnOutcome {
                status: OutcomeStatus::Succeeded,
                account: None,
                evidence: vec![],
            }),
        ],
    )
    .await;
    drop(owner);
    drop(store);

    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    assert_eq!(
        reopened
            .revise_history(
                request,
                |_| panic!("retry projected source"),
                |_| panic!("retry rebuilt seed"),
            )
            .await
            .unwrap(),
        receipt
    );
    assert_eq!(
        reopened
            .history(session(), Some(replacement))
            .await
            .unwrap(),
        vec![kept.clone()]
    );
    assert_eq!(
        reopened.history(session(), None).await.unwrap(),
        vec![kept, new]
    );
}

#[tokio::test]
async fn revision_refuses_queue_and_live_ownership() {
    let (_directory, store) = store().await;
    let input = submission("queued", "input");
    store.submit(session(), input.clone()).await.unwrap();
    let mut request = HistoryRevision {
        session: session(),
        request: change("revision"),
        expected_revision: store.inspect(session()).await.unwrap().revision,
        expected_history: current_history(&store, session()).await.basis,
        intent: Fingerprint::of(&"before").unwrap(),
        replacement: submission("replacement", "new"),
    };
    assert_error(
        store
            .revise_history(
                request.clone(),
                |_| vec![],
                |_| panic!("should refuse queue"),
            )
            .await,
        ErrorKind::Conflict,
        "history_revision_requires_empty_queue",
    );
    let owner = claim(&store, "claim-queued", vec![input.id]).await;
    request.expected_revision = store.inspect(session()).await.unwrap().revision;
    request.expected_history = current_history(&store, session()).await.basis;
    assert_error(
        store
            .revise_history(request, |_| vec![], |_| panic!("should refuse ownership"))
            .await,
        ErrorKind::Conflict,
        "history_revision_requires_idle",
    );
    drop(owner);
}

#[tokio::test]
async fn version_two_upgrades_with_original_history_view() {
    let (directory, store) = store().await;
    let original = history_message("previous", "existing history");
    finish_history_turn(&store, session(), "previous", vec![original.clone()]).await;
    drop(store);
    let path = directory.path().join("sessions.sqlite");
    let previous = rusqlite::Connection::open(&path).unwrap();
    support::remove_turn_link_schema(&previous);
    previous
        .execute_batch(
            "DROP TABLE session_retirements;
         DROP TABLE session_catalog;
         DROP TABLE session_context_replacements;
         DROP TABLE session_history_views;
         DROP INDEX session_turn_order;
         ALTER TABLE sessions DROP COLUMN driver_state;
         PRAGMA user_version=2;",
        )
        .unwrap();
    drop(previous);
    let store = SqliteStore::open(&path).unwrap();
    let retained = current_history(&store, session()).await;
    assert_eq!(retained.basis.view, SessionRevision(0));
    assert!(retained.seed.is_none());
    assert_eq!(retained.into_records(), vec![original]);
    drop(store);
    let reopened = rusqlite::Connection::open(&path).unwrap();
    let version: i64 = reopened
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 13);
}

#[tokio::test]
async fn older_reconciliation_invalidates_a_cut_without_moving_its_tail() {
    use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
    use agent_kit_core::inference::{
        InferenceOutcome, InferenceRequest, InferenceStatus, Modality, ModelCapabilities,
        PreparedRequest, ProviderBinding,
    };
    use agent_kit_core::turn::{OperationInput, OperationOutcome, OperationRecord, TurnState};
    use agent_kit_core::{
        AttemptId, BindingId, ModelId, OperationId, PrincipalId, ProviderId, ScopeId,
    };

    let (_directory, store) = store().await;
    let input = submission("original", "first input");
    store.submit(session(), input.clone()).await.unwrap();
    let old = claim(&store, "original-claim", vec![input.id]).await;
    let operation = OperationId::new("generation").unwrap();
    let attempt = AttemptId::new("generation-attempt").unwrap();
    let authority = AuthorityBinding {
        principal: PrincipalId::new("fixture").unwrap(),
        binding: BindingId::new("fixture-binding").unwrap(),
        scope: ScopeId::new("fixture-scope").unwrap(),
    };
    let prepared = PreparedRequest::from_validated(
        InferenceRequest {
            model: ModelId::new("fixture-model").unwrap(),
            messages: vec![],
            tools: vec![],
            max_output_tokens: None,
            extension: None,
            reasoning: Default::default(),
        },
        ProviderBinding {
            provider: ProviderId::new("fixture-provider").unwrap(),
            authority: authority.clone(),
        },
        ModelCapabilities {
            revision: BindingId::new("fixture-capabilities").unwrap(),
            input_modalities: [Modality::Text].into(),
            json_tools: false,
            text_tools: false,
            max_output_tokens: None,
            reasoning: Default::default(),
        },
    )
    .unwrap();
    let outcome = |status| {
        OperationOutcome::Inference(InferenceOutcome {
            status,
            messages: vec![],
            usage: vec![],
            failure: None,
            receipt: None,
            terminal_receipt: None,
        })
    };
    commit(
        &old,
        "initial",
        vec![
            JournalAction::prepare(OperationRecord {
                id: operation.clone(),
                input: OperationInput::Inference(prepared),
                origin: None,
                source_call: None,
                grants: GrantSelection {
                    authority,
                    grants: vec![],
                },
            }),
            JournalAction::StartAttempt {
                operation: operation.clone(),
                attempt: attempt.clone(),
            },
            JournalAction::CompleteAttempt {
                operation: operation.clone(),
                attempt: attempt.clone(),
                outcome: outcome(InferenceStatus::Interrupted),
            },
            JournalAction::Settle(TurnOutcome {
                status: OutcomeStatus::Uncertain,
                account: None,
                evidence: vec![operation.clone()],
            }),
        ],
    )
    .await;
    finish_history_turn(
        &store,
        session(),
        "newer",
        vec![history_message("newer", "latest")],
    )
    .await;
    let project = |state: &TurnState| {
        if let Some(outcome) = state
            .operations()
            .values()
            .next()
            .and_then(|op| op.outcome())
        {
            vec![history_message(
                "derived",
                if outcome.is_success() {
                    "confirmed"
                } else {
                    "uncertain"
                },
            )]
        } else {
            state.history().records().to_vec()
        }
    };
    let before = store
        .retained_history_with(session(), HistorySelection::Current, project)
        .await
        .unwrap();
    let revision = store.inspect(session()).await.unwrap().revision;
    commit(
        &old,
        "late-evidence",
        vec![JournalAction::ReconcileAttempt {
            operation,
            attempt,
            outcome: outcome(InferenceStatus::Completed),
        }],
    )
    .await;
    let after = store
        .retained_history_with(session(), HistorySelection::Current, project)
        .await
        .unwrap();
    assert_eq!(store.inspect(session()).await.unwrap().revision, revision);
    assert_eq!(before.basis.tail, after.basis.tail);
    assert_ne!(before.records, after.records);
    assert_ne!(before.basis.fingerprint, after.basis.fingerprint);

    let destination = SessionId::new("stale-derived").unwrap();
    assert_error(
        store
            .create_seeded(
                SeededSession {
                    create: CreateSession {
                        id: destination.clone(),
                        request: change("fork"),
                        configuration: payload("settings"),
                    },
                    source: session(),
                    expected_history: before.basis,
                    intent: Fingerprint::of(&"older cut").unwrap(),
                },
                project,
                |_| panic!("must refuse a stale projection before lowering"),
            )
            .await,
        ErrorKind::Conflict,
        "history_basis_changed",
    );
    assert_error(
        store.inspect(destination).await,
        ErrorKind::InvalidInput,
        "session_missing",
    );
}

#[tokio::test]
async fn malformed_seed_creates_neither_a_session_nor_a_receipt() {
    let (_directory, store) = store().await;
    let destination = SessionId::new("malformed-seed").unwrap();
    let request = SeededSession {
        create: CreateSession {
            id: destination.clone(),
            request: change("seed"),
            configuration: payload("settings"),
        },
        source: session(),
        expected_history: current_history(&store, session()).await.basis,
        intent: Fingerprint::of(&"cut").unwrap(),
    };
    let duplicate = history_message("duplicate", "two records share one identity");
    assert_error(
        store
            .create_seeded(
                request.clone(),
                |_| vec![],
                move |_| {
                    Ok(HistorySeed {
                        records: vec![duplicate.clone(), duplicate],
                        provenance: payload("fixture lineage"),
                    })
                },
            )
            .await,
        ErrorKind::Conflict,
        "duplicate_message",
    );
    assert_error(
        store.inspect(destination.clone()).await,
        ErrorKind::InvalidInput,
        "session_missing",
    );
    assert_eq!(
        store
            .create_seeded(request, |_| vec![], copy_seed)
            .await
            .unwrap()
            .session,
        destination
    );
}

#[tokio::test]
async fn unprompted_maintenance_admits_only_before_the_exact_queue_head() {
    use agent_kit_store_sqlite::context::UnpromptedClaim;

    let (_directory, store) = store().await;
    let first = submission("first-queued", "First immutable input");
    let second = submission("second-queued", "Second immutable input");
    store.submit(session(), first.clone()).await.unwrap();
    store.submit(session(), second.clone()).await.unwrap();
    let before = store.inspect(session()).await.unwrap();
    let history = store
        .context_history_with(session(), None, |_| vec![])
        .await
        .unwrap();
    let request = UnpromptedClaim {
        session: session(),
        turn: TurnId::new("maintenance").unwrap(),
        request: change("maintenance-claim"),
        expected_revision: history.session_revision,
        expected_context: history.basis,
        checkpoint: payload("Captured summary request"),
    };
    assert_error(
        store
            .claim_unprompted_before_input(request.clone(), second.id.clone())
            .await,
        ErrorKind::Conflict,
        "session_queue_waiting",
    );
    assert_eq!(store.inspect(session()).await.unwrap(), before);
    let ClaimOutcome::Acquired(claim) = store
        .claim_unprompted_before_input(request.clone(), first.id.clone())
        .await
        .unwrap()
    else {
        panic!("expected maintenance lease")
    };
    assert!(claim.inputs.is_empty());
    let after = store.inspect(session()).await.unwrap();
    assert_eq!(after.queued, before.queued);
    assert_eq!(after.current.unwrap().binding.turn, request.turn);
    assert!(matches!(
        store
            .claim_unprompted_before_input(request.clone(), first.id)
            .await
            .unwrap(),
        ClaimOutcome::Existing(_)
    ));
    assert_error(
        store
            .claim_unprompted_before_input(request, second.id)
            .await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
}

#[tokio::test]
async fn context_prefix_replacement_retains_suffix_transcript_and_queued_input() {
    use agent_kit_store_sqlite::context::{ContextInstall, UnpromptedClaim};

    let (directory, store) = store().await;
    let original = history_message("original", "Original transcript");
    let original_turn =
        finish_history_turn(&store, session(), "original", vec![original.clone()]).await;
    let tail = history_message("tail", "Unchanged suffix");
    finish_history_turn(&store, session(), "tail", vec![tail.clone()]).await;
    let source = store
        .context_history_with(session(), None, |state| state.history().records().to_vec())
        .await
        .unwrap();
    let maintenance = TurnId::new("summary-turn").unwrap();
    let request = UnpromptedClaim {
        session: session(),
        turn: maintenance.clone(),
        request: change("compact"),
        expected_revision: source.session_revision,
        expected_context: source.basis.clone(),
        checkpoint: payload("captured source"),
    };
    let ClaimOutcome::Acquired(claim) = store.claim_unprompted(request.clone()).await.unwrap()
    else {
        panic!("expected unprompted owner")
    };
    assert!(claim.inputs.is_empty());
    assert!(matches!(
        store.claim_unprompted(request).await.unwrap(),
        ClaimOutcome::Existing(_)
    ));
    assert_eq!(
        claim.lease.journal().load().await.unwrap().checkpoint(),
        Some(&payload("captured source"))
    );
    let queued = submission("queued-after-capture", "New input during compaction");
    let accepted = store.submit(session(), queued.clone()).await.unwrap();
    let outcome = TurnOutcome {
        status: OutcomeStatus::Succeeded,
        account: Some(payload("validated summary")),
        evidence: vec![],
    };
    commit(
        &claim,
        "complete-summary",
        vec![JournalAction::Settle(outcome.clone())],
    )
    .await;
    drop(claim);
    drop(store);
    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();

    let summary = history_message("summary", "Short summary");
    let install = ContextInstall {
        session: session(),
        turn: maintenance,
        expected_context: source.basis,
        expected_outcome: Fingerprint::of(&outcome).unwrap(),
        replacement: HistorySeed {
            records: vec![summary.clone()],
            provenance: payload("covered original"),
        },
        covered_through: Some(original_turn.clone()),
    };
    let mut mismatch = install.clone();
    mismatch.expected_outcome = Fingerprint::of(&"wrong").unwrap();
    assert_error(
        store.install_context(mismatch).await,
        ErrorKind::Conflict,
        "context_outcome_changed",
    );
    let mut invalid_cut = install.clone();
    invalid_cut.covered_through = Some(install.turn.clone());
    assert_error(
        store.install_context(invalid_cut).await,
        ErrorKind::Conflict,
        "context_coverage_boundary_changed",
    );
    assert_eq!(
        store
            .context_history_with(session(), None, |state| state.history().records().to_vec())
            .await
            .unwrap()
            .into_records(),
        [original.clone(), tail.clone()]
    );
    store.install_context(install.clone()).await.unwrap();
    assert_eq!(
        store.history(session(), None).await.unwrap(),
        [original, tail.clone()]
    );
    let observed = store.inspect(session()).await.unwrap();
    assert_eq!(observed.queued[0].input, queued);
    assert_eq!(observed.queued[0].position, accepted.position);
    drop(store);

    let store = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let next = TurnId::new("future").unwrap();
    let ClaimOutcome::Acquired(next_claim) = store
        .claim(ClaimRequest {
            id: change("claim-queued"),
            session: session(),
            expected_revision: observed.revision,
            selection: TurnSelection::New {
                turn: next.clone(),
                inputs: vec![queued.id],
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected queued input owner")
    };
    assert_eq!(
        store
            .context_history_with(session(), Some(next), |state| state
                .history()
                .records()
                .to_vec())
            .await
            .unwrap()
            .into_records(),
        [summary, tail]
    );
    assert!(
        store
            .context_history_with(session(), Some(original_turn), |state| state
                .history()
                .records()
                .to_vec())
            .await
            .unwrap()
            .into_records()
            .is_empty()
    );
    store.install_context(install).await.unwrap();
    drop(next_claim);
}

#[tokio::test]
async fn context_candidate_cannot_install_after_a_new_turn_claim() {
    use agent_kit_store_sqlite::context::{ContextInstall, UnpromptedClaim};

    let (_directory, store) = store().await;
    let original = history_message("original", "Original transcript");
    finish_history_turn(&store, session(), "original", vec![original.clone()]).await;
    let source = store
        .context_history_with(session(), None, |state| state.history().records().to_vec())
        .await
        .unwrap();
    let maintenance = TurnId::new("summary-turn").unwrap();
    let ClaimOutcome::Acquired(claim) = store
        .claim_unprompted(UnpromptedClaim {
            session: session(),
            turn: maintenance.clone(),
            request: change("compact"),
            expected_revision: source.session_revision,
            expected_context: source.basis.clone(),
            checkpoint: payload("captured source"),
        })
        .await
        .unwrap()
    else {
        panic!("expected compaction owner");
    };
    let outcome = TurnOutcome {
        status: OutcomeStatus::Succeeded,
        account: Some(payload("summary candidate")),
        evidence: vec![],
    };
    commit(
        &claim,
        "candidate",
        vec![JournalAction::Settle(outcome.clone())],
    )
    .await;
    drop(claim);
    let later = history_message("later", "Newer input");
    finish_history_turn(&store, session(), "later", vec![later.clone()]).await;
    assert_error(
        store
            .install_context(ContextInstall {
                session: session(),
                turn: maintenance,
                expected_context: source.basis,
                expected_outcome: Fingerprint::of(&outcome).unwrap(),
                replacement: HistorySeed {
                    records: vec![history_message("summary", "Stale")],
                    provenance: payload("old"),
                },
                covered_through: None,
            })
            .await,
        ErrorKind::Conflict,
        "context_install_basis_changed",
    );
    assert_eq!(
        store
            .context_history_with(session(), None, |state| state.history().records().to_vec())
            .await
            .unwrap()
            .into_records(),
        [original, later]
    );
}

#[tokio::test]
async fn upgrades_context_store_without_inventing_driver_state() {
    let (directory, store) = store().await;
    let filename = directory.path().join("sessions.sqlite");
    let accepted = submission("prior-input", "pending user work");
    store.submit(session(), accepted.clone()).await.unwrap();
    let before = store.inspect(session()).await.unwrap();
    drop(store);

    let previous = rusqlite::Connection::open(&filename).unwrap();
    support::remove_turn_link_schema(&previous);
    previous
        .execute_batch(
            "DROP TABLE session_retirements;
             DROP TABLE session_catalog;
             ALTER TABLE sessions DROP COLUMN driver_state;
             PRAGMA user_version=4;",
        )
        .unwrap();
    drop(previous);

    let reopened = SqliteStore::open(filename).unwrap();
    let after = reopened.inspect(session()).await.unwrap();
    assert_eq!(after, before);
    assert!(after.driver_state.is_initial());
    assert_eq!(after.queued[0].input, accepted);
}

#[tokio::test]
async fn rejects_an_oversized_state_change_without_publishing_its_control() {
    use agent_kit_core::Envelope;
    use agent_kit_core::driver_state::{
        DriverStateChange, DriverStateRevision, DriverStateSnapshot,
    };
    use agent_kit_core::turn::ControlDirective;
    use agent_kit_sessions::TurnControl;

    let (_directory, store) = store().await;
    let accepted = submission("request", "hello");
    store.submit(session(), accepted.clone()).await.unwrap();
    let lease = claim(&store, "claim", vec![accepted.id]).await;
    let before = store.inspect(session()).await.unwrap();
    let payload = Envelope::new(
        SchemaId::new("test.state").unwrap(),
        1,
        vec![0; DriverStateSnapshot::MAX_BYTES + 1],
    )
    .unwrap();
    assert_error(
        store
            .control(ControlRequest {
                id: change("invalid-state"),
                session: session(),
                expected_revision: before.revision,
                action: SessionControl::DriverState {
                    change: DriverStateChange {
                        expected: DriverStateRevision(0),
                        value: Some(payload),
                    },
                    turn: Some(TurnControl {
                        turn: turn(),
                        expected: ControlRevision(0),
                        directive: ControlDirective::Pause,
                    }),
                },
            })
            .await,
        ErrorKind::LimitExceeded,
        "driver_state_limit",
    );
    assert_eq!(store.inspect(session()).await.unwrap(), before);
    assert!(
        !lease
            .lease
            .journal()
            .load()
            .await
            .unwrap()
            .controls()
            .paused
    );
}

#[tokio::test]
async fn conditional_submission_rejects_a_changed_session_and_replays_accepted_identity() {
    let (_directory, store) = store().await;
    let session = session();
    let before = store.inspect(session.clone()).await.unwrap();
    let generated = submission("driver-generated", "continue owned work");
    store
        .submit(session.clone(), submission("user", "new user input"))
        .await
        .unwrap();
    assert_error(
        store
            .submit_at_revision(session.clone(), generated.clone(), before.revision)
            .await,
        ErrorKind::Conflict,
        "stale_session_revision",
    );
    assert!(
        store
            .input(session.clone(), generated.id.clone())
            .await
            .unwrap()
            .is_none()
    );
    let current = store.inspect(session.clone()).await.unwrap();
    let accepted = store
        .submit_at_revision(session.clone(), generated.clone(), current.revision)
        .await
        .unwrap();
    assert_eq!(
        store
            .submit_at_revision(session.clone(), generated, before.revision)
            .await
            .unwrap(),
        accepted
    );
    assert_eq!(
        store.inspect(session).await.unwrap().queued[0].input.id,
        change("user")
    );
}

#[tokio::test]
async fn reserved_claim_retries_without_allocating_again_and_leaves_stale_work_queued() {
    use agent_kit_core::driver_state::{DriverStateChange, DriverStateRevision};

    let (_directory, store) = store().await;
    let session = session();
    let initial = store.inspect(session.clone()).await.unwrap();
    store
        .control(ControlRequest {
            id: change("set-driver-state"),
            session: session.clone(),
            expected_revision: initial.revision,
            action: SessionControl::DriverState {
                change: DriverStateChange {
                    expected: DriverStateRevision(0),
                    value: Some(payload("available")),
                },
                turn: None,
            },
        })
        .await
        .unwrap();
    let input = submission("driver-work", "accepted work");
    store.submit(session.clone(), input.clone()).await.unwrap();
    let expected = store.inspect(session.clone()).await.unwrap();
    let request = ClaimRequest {
        id: change("reserved-claim"),
        session: session.clone(),
        expected_revision: expected.revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs: vec![input.id.clone()],
        },
    };
    let wrong = DriverStateChange {
        expected: DriverStateRevision(0),
        value: Some(payload("reserved")),
    };
    assert_error(
        store.claim_with_driver_state(request.clone(), wrong).await,
        ErrorKind::Conflict,
        "driver_state_revision_changed",
    );
    assert_eq!(store.inspect(session.clone()).await.unwrap(), expected);
    let reserved = DriverStateChange {
        expected: DriverStateRevision(1),
        value: Some(payload("reserved")),
    };
    let ClaimOutcome::Acquired(lease) = store
        .claim_with_driver_state(request.clone(), reserved.clone())
        .await
        .unwrap()
    else {
        panic!("expected owned claim");
    };
    assert!(matches!(
        store
            .claim_with_driver_state(request.clone(), reserved.clone())
            .await
            .unwrap(),
        ClaimOutcome::Existing(_)
    ));
    let conflicting = DriverStateChange {
        value: Some(payload("replacement")),
        ..reserved
    };
    assert_error(
        store.claim_with_driver_state(request, conflicting).await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    let current = store.inspect(session.clone()).await.unwrap();
    let state = lease.lease.journal().load().await.unwrap();
    assert_eq!(state.driver_state(), &current.driver_state);
    assert_eq!(current.driver_state.revision(), DriverStateRevision(2));
    assert_eq!(current.driver_state.value(), Some(&payload("reserved")));
    assert_eq!(
        store
            .input(session, input.id)
            .await
            .unwrap()
            .unwrap()
            .disposition,
        InputDisposition::Claimed { turn: turn() }
    );
}

#[tokio::test]
async fn idle_accept_and_claim_is_atomic_and_replays_after_reopen() {
    use agent_kit_core::driver_state::{DriverStateChange, DriverStateRevision};

    let (directory, store) = store().await;
    let session = session();
    let input = submission("generated", "generated work");
    let user = submission("user", "user work");
    let stale = store.inspect(session.clone()).await.unwrap();
    store.submit(session.clone(), user.clone()).await.unwrap();
    let waiting = store.inspect(session.clone()).await.unwrap();
    let mut request = ClaimRequest {
        id: change("generated-claim"),
        session: session.clone(),
        expected_revision: stale.revision,
        selection: TurnSelection::New {
            turn: turn(),
            inputs: vec![input.id.clone()],
        },
    };
    let change = DriverStateChange {
        expected: DriverStateRevision(0),
        value: Some(payload("reserved")),
    };
    assert_error(
        store
            .submit_and_claim(request.clone(), input.clone(), change.clone())
            .await,
        ErrorKind::Conflict,
        "stale_session_revision",
    );
    request.expected_revision = waiting.revision;
    assert_error(
        store
            .submit_and_claim(request.clone(), input.clone(), change.clone())
            .await,
        ErrorKind::Conflict,
        "session_queue_waiting",
    );
    assert_eq!(store.inspect(session.clone()).await.unwrap(), waiting);
    assert!(
        store
            .input(session.clone(), input.id.clone())
            .await
            .unwrap()
            .is_none()
    );

    store
        .control(ControlRequest {
            id: agent_kit_core::ChangeId::new("withdraw-user").unwrap(),
            session: session.clone(),
            expected_revision: waiting.revision,
            action: SessionControl::WithdrawQueued { input: user.id },
        })
        .await
        .unwrap();
    request.expected_revision = store.inspect(session.clone()).await.unwrap().revision;
    let ClaimOutcome::Acquired(claimed) = store
        .submit_and_claim(request.clone(), input.clone(), change.clone())
        .await
        .unwrap()
    else {
        panic!("expected generated work lease");
    };
    assert_eq!(claimed.inputs, std::slice::from_ref(&input));
    drop(claimed);
    drop(store);
    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    let after = reopened.inspect(session.clone()).await.unwrap();
    assert_eq!(after.driver_state.value(), Some(&payload("reserved")));
    assert_eq!(after.driver_state.revision(), DriverStateRevision(1));
    assert!(after.queued.is_empty());
    assert!(matches!(
        reopened
            .submit_and_claim(request.clone(), input.clone(), change.clone())
            .await
            .unwrap(),
        ClaimOutcome::Existing(_)
    ));
    assert_error(
        reopened
            .submit_and_claim(request, submission("generated", "different work"), change)
            .await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    assert_eq!(
        reopened
            .input(session, input.id)
            .await
            .unwrap()
            .unwrap()
            .disposition,
        InputDisposition::Claimed { turn: turn() }
    );
}

#[tokio::test]
async fn a_derived_control_replays_original_intent_without_recomputing_new_state() {
    use agent_kit_core::driver_state::DriverStateRevision;
    use agent_kit_core::turn::ControlDirective;
    use agent_kit_store_sqlite::driver::{DriverControlPlan, DriverControlRequest};

    let (directory, store) = store().await;
    let accepted = submission("work", "start work");
    store.submit(session(), accepted.clone()).await.unwrap();
    let owned = claim(&store, "claim", vec![accepted.id]).await;
    let before = store.inspect(session()).await.unwrap();
    let request = DriverControlRequest {
        id: change("pause-intent"),
        session: session(),
        expected_revision: before.revision,
        expected_state: DriverStateRevision(0),
        intent: payload("pause the owned work"),
    };
    let receipt = store
        .control_driver_state(request.clone(), |state, current| {
            assert!(state.is_initial());
            assert_eq!(current.unwrap().binding.turn, turn());
            Ok(DriverControlPlan {
                value: Some(payload("paused driver state")),
                directive: Some(ControlDirective::Pause),
            })
        })
        .await
        .unwrap();
    assert_eq!(receipt.driver_state_revision, Some(DriverStateRevision(1)));
    let paused = owned.lease.journal().load().await.unwrap();
    assert!(paused.controls().paused);
    assert_eq!(
        paused.driver_state().value(),
        Some(&payload("paused driver state"))
    );
    drop(owned);
    drop(store);

    let reopened = SqliteStore::open(directory.path().join("sessions.sqlite")).unwrap();
    assert_eq!(
        reopened
            .control_driver_state(request.clone(), |_, _| panic!("replayed the decision"))
            .await
            .unwrap(),
        receipt
    );
    let reused = DriverControlRequest {
        intent: payload("clear"),
        ..request
    };
    assert_error(
        reopened
            .control_driver_state(reused, |_, _| panic!("accepted changed intent"))
            .await,
        ErrorKind::Conflict,
        "request_identity_reused",
    );
    assert_eq!(
        reopened
            .inspect(session())
            .await
            .unwrap()
            .driver_state
            .value(),
        Some(&payload("paused driver state"))
    );
}

fn plain(records: &[agent_kit_store_sqlite::history::ReplayRecord]) -> Vec<HistoryRecord> {
    records.iter().map(|item| item.record.clone()).collect()
}

/// A projection that panics fails its own read; the store stays usable,
/// because the open transaction rolled back as the panic unwound.
#[tokio::test]
async fn a_panicking_projection_leaves_the_store_usable() {
    let (_directory, store) = store().await;
    store
        .submit(session(), submission("input", "hello"))
        .await
        .unwrap();
    let acquired = claim(&store, "claim", vec![change("input")]).await;
    let error = store
        .inspect_turn_with(session(), turn(), |_| -> agent_kit_core::Result<()> {
            panic!("projection failed")
        })
        .await
        .unwrap_err();
    assert_eq!(error.code, "store_task_interrupted");
    commit(
        &acquired,
        "checkpoint",
        vec![JournalAction::SetCheckpoint(payload("after"))],
    )
    .await;
    store
        .submit(session(), submission("later", "again"))
        .await
        .unwrap();
    assert_eq!(store.inspect(session()).await.unwrap().queued.len(), 1);
}
