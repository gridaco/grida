//! A turn's stored size and per-commit writes grow with what the turn adds,
//! not with the square of its length, while the journal reads back the same
//! state, including turns written before messages were stored once.

mod support;

use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{
    InferenceOutcome, InferenceRequest, InferenceStatus, Modality, ModelCapabilities,
    PreparedRequest, ProviderBinding,
};
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
use agent_kit_core::turn::{
    JournalAction, OperationInput, OperationOutcome, OperationRecord, TurnState,
};
use agent_kit_core::{
    AttemptId, BindingId, MessageId, ModelId, OperationId, PrincipalId, ProviderId, ScopeId,
};
use agent_kit_sessions::{ClaimedTurn, SessionStore};
use agent_kit_store_sqlite::SqliteStore;
use rusqlite::Connection;
use std::path::Path;
use support::*;

/// Earlier conversation every model call in the turn is sent again.
const CONTEXT_MESSAGES: usize = 20;
const MESSAGE_TEXT: usize = 2_000;

fn message(id: &str, role: Role) -> Message {
    Message {
        id: MessageId::new(id).unwrap(),
        role,
        phase: None,
        content: vec![Content::Text(format!("{id} {}", "x".repeat(MESSAGE_TEXT)))],
        provenance: Provenance {
            source: "fixture".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    }
}

fn authority() -> AuthorityBinding {
    AuthorityBinding {
        principal: PrincipalId::new("fixture").unwrap(),
        binding: BindingId::new("fixture-binding").unwrap(),
        scope: ScopeId::new("fixture-scope").unwrap(),
    }
}

fn request(messages: Vec<Message>) -> PreparedRequest {
    PreparedRequest::from_validated(
        InferenceRequest {
            model: ModelId::new("fixture-model").unwrap(),
            messages,
            tools: vec![],
            max_output_tokens: None,
            extension: None,
            reasoning: Default::default(),
        },
        ProviderBinding {
            provider: ProviderId::new("fixture-provider").unwrap(),
            authority: authority(),
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
    .unwrap()
}

/// Run `steps` model calls in one turn. Each call is sent the earlier
/// conversation and everything the turn has said so far, as an agent does.
async fn run_turn(store: &SqliteStore, steps: usize) -> (ClaimedTurn, Vec<TurnState>) {
    let input = submission("input", "start");
    store.submit(session(), input.clone()).await.unwrap();
    let claim = claim(store, "claim", vec![input.id]).await;
    // The conversation checkpoint a turn starts from is set once and kept.
    commit(
        &claim,
        "checkpoint",
        vec![JournalAction::SetCheckpoint(payload(
            &"c".repeat(64 * 1024),
        ))],
    )
    .await;
    let context: Vec<Message> = (0..CONTEXT_MESSAGES)
        .map(|index| message(&format!("context-{index}"), Role::User))
        .collect();
    let mut said: Vec<Message> = Vec::new();
    let mut states = Vec::new();
    let started = std::time::Instant::now();
    for step in 0..steps {
        let operation = OperationId::new(format!("call-{step}")).unwrap();
        let attempt = AttemptId::new(format!("attempt-{step}")).unwrap();
        let reply = message(&format!("reply-{step}"), Role::Assistant);
        let sent = context.iter().chain(&said).cloned().collect();
        commit(
            &claim,
            &format!("prepare-{step}"),
            vec![
                JournalAction::prepare(OperationRecord {
                    id: operation.clone(),
                    input: OperationInput::Inference(request(sent)),
                    origin: None,
                    source_call: None,
                    grants: GrantSelection {
                        authority: authority(),
                        grants: vec![],
                    },
                }),
                JournalAction::StartAttempt {
                    operation: operation.clone(),
                    attempt: attempt.clone(),
                },
            ],
        )
        .await;
        commit(
            &claim,
            &format!("complete-{step}"),
            vec![
                JournalAction::CompleteAttempt {
                    operation,
                    attempt,
                    outcome: OperationOutcome::Inference(InferenceOutcome {
                        status: InferenceStatus::Completed,
                        messages: vec![reply.clone()],
                        usage: vec![],
                        failure: None,
                        receipt: None,
                        terminal_receipt: None,
                    }),
                },
                JournalAction::AppendHistory(vec![HistoryRecord::Message(reply.clone())]),
            ],
        )
        .await;
        said.push(reply);
        if std::env::var("PROBE").is_ok() {
            eprintln!("step {step} at {:?}", started.elapsed());
        }
        states.push(claim.lease.journal().load().await.unwrap());
    }
    (claim, states)
}

/// Bytes the store holds for the turn: head, parts and messages.
fn stored(path: &Path) -> (usize, usize) {
    let connection = Connection::open(path).unwrap();
    let size = |sql: &str| -> usize {
        connection
            .query_row(sql, [], |row| row.get::<_, Option<i64>>(0))
            .unwrap()
            .unwrap_or(0) as usize
    };
    let head = size("SELECT SUM(length(snapshot)) FROM turns");
    let total = head
        + size("SELECT SUM(length(body)) FROM turn_parts")
        + size("SELECT SUM(length(body)) FROM turn_messages");
    (head, total)
}

async fn grow(steps: usize) -> (usize, usize, TurnState) {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = create(&path).await;
    let (claim, states) = run_turn(&store, steps).await;
    drop(claim);
    drop(store);
    let (head, total) = stored(&path);
    // Reopened, the journal reads back exactly the state it last wrote.
    let reopened = SqliteStore::open(&path).unwrap();
    let read = read(&reopened).await;
    let last = states.last().unwrap().clone();
    assert_eq!(same(&read), same(&last));
    (head, total, last)
}

/// A turn state compared by its full serialized value.
fn same(state: &TurnState) -> serde_json::Value {
    serde_json::to_value(state).unwrap()
}

async fn read(store: &SqliteStore) -> TurnState {
    store
        .inspect_turn_with(session(), turn(), |state| Ok(state.clone()))
        .await
        .unwrap()
}

async fn create(path: &Path) -> SqliteStore {
    let store = SqliteStore::open(path).unwrap();
    store
        .create(agent_kit_sessions::CreateSession {
            id: session(),
            request: change("create"),
            configuration: payload("configuration"),
        })
        .await
        .unwrap();
    store
}

#[tokio::test]
async fn stored_size_grows_with_what_the_turn_adds() {
    let (short_head, short, state) = grow(20).await;
    let (long_head, long, _) = grow(40).await;
    // The repeated context would make doubling the turn about quadruple its
    // size. Stored once, it roughly doubles.
    assert!(
        long * 10 < short * 25,
        "20 calls stored {short} bytes, 40 calls {long}"
    );
    // The head rewritten on every commit is small and does not grow with the
    // turn; the checkpoint is kept apart from it.
    assert!(short_head < 4_096, "head is {short_head} bytes");
    assert!(
        long_head < short_head + 4_096,
        "head grew from {short_head} to {long_head} bytes"
    );
    // The same turn as one value would hold every request's full context.
    let whole = serde_json::to_vec(&state).unwrap().len();
    assert!(short * 4 < whole, "stored {short} of {whole} bytes");
}

#[tokio::test]
async fn a_turn_written_as_one_value_reads_back_and_converts_on_its_next_commit() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = create(&path).await;
    let (claim, states) = run_turn(&store, 3).await;
    let original = states.last().unwrap().clone();
    // Rewrite the turn as an earlier store did: the whole state in its row.
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch("DELETE FROM turn_parts; DELETE FROM turn_messages;")
        .unwrap();
    connection
        .execute(
            "UPDATE turns SET snapshot=?1, bytes=NULL",
            [serde_json::to_vec(&original).unwrap()],
        )
        .unwrap();
    drop(connection);
    assert_eq!(same(&read(&store).await), same(&original));

    let reply = message("later", Role::Assistant);
    commit(
        &claim,
        "later",
        vec![JournalAction::AppendHistory(vec![HistoryRecord::Message(
            reply.clone(),
        )])],
    )
    .await;
    let converted = read(&store).await;
    assert_eq!(converted.operations(), original.operations());
    assert_eq!(
        converted.history().records().last(),
        Some(&HistoryRecord::Message(reply))
    );
    let connection = Connection::open(&path).unwrap();
    let head: Vec<u8> = connection
        .query_row("SELECT snapshot FROM turns", [], |row| row.get(0))
        .unwrap();
    let head: serde_json::Value = serde_json::from_slice(&head).unwrap();
    assert!(head.get("operations").is_none(), "{head}");
}

#[tokio::test]
async fn a_store_written_before_this_layout_upgrades_and_reads_its_turns() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = create(&path).await;
    let (claim, states) = run_turn(&store, 2).await;
    let original = states.last().unwrap().clone();
    drop(claim);
    drop(store);
    // The previous schema: whole turns in their rows, no layout tables.
    let connection = Connection::open(&path).unwrap();
    connection
        .execute(
            "UPDATE turns SET snapshot=?1",
            [serde_json::to_vec(&original).unwrap()],
        )
        .unwrap();
    connection
        .execute_batch(
            "DROP TABLE turn_parts; DROP TABLE turn_messages;
             ALTER TABLE turns DROP COLUMN bytes; ALTER TABLE turns DROP COLUMN generation;
             PRAGMA user_version=12;",
        )
        .unwrap();
    drop(connection);

    let store = SqliteStore::open(&path).unwrap();
    assert_eq!(same(&read(&store).await), same(&original));
    drop(store);
    let connection = Connection::open(&path).unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 13);
}

/// Replace the stored head of the only turn.
fn rewrite_head(path: &Path, head: &[u8]) {
    let connection = Connection::open(path).unwrap();
    connection
        .execute("UPDATE turns SET snapshot=?1", [head])
        .unwrap();
}

fn stored_head(path: &Path) -> Vec<u8> {
    Connection::open(path)
        .unwrap()
        .query_row("SELECT snapshot FROM turns", [], |row| row.get(0))
        .unwrap()
}

/// The same head held by a later writer of the turn.
fn superseded(head: &[u8]) -> Vec<u8> {
    let mut head: serde_json::Value = serde_json::from_slice(head).unwrap();
    head["binding"]["epoch"] = serde_json::json!(2);
    head["controls"]["binding"]["epoch"] = serde_json::json!(2);
    serde_json::to_vec(&head).unwrap()
}

/// Controls and views read from a turn's head equal those of the assembled
/// turn, in both layouts.
async fn assert_head_reads(store: &SqliteStore, claim: Option<&ClaimedTurn>) {
    let assembled = store.inspect_turn(session(), turn()).await.unwrap();
    let view = store.inspect(session()).await.unwrap();
    assert_eq!(view.latest.as_ref(), Some(&assembled));
    match claim {
        Some(claim) => {
            assert_eq!(view.current.as_ref(), Some(&assembled));
            let state = claim.lease.journal().load().await.unwrap();
            assert_eq!(assembled.history_position, state.history().position());
            assert_eq!(
                claim.lease.controls().read().await.unwrap(),
                state.controls().clone()
            );
        }
        None => assert_eq!(view.current, None),
    }
}

#[tokio::test]
async fn controls_and_views_of_a_running_turn_are_read_from_its_head() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = create(&path).await;
    let (claim, states) = run_turn(&store, 3).await;
    assert_head_reads(&store, Some(&claim)).await;

    // A head another writer now holds is refused to the earlier lease.
    let head = stored_head(&path);
    rewrite_head(&path, &superseded(&head));
    let error = claim.lease.controls().read().await.unwrap_err();
    assert_eq!(error.code, "stale_writer_epoch");
    rewrite_head(&path, &head);

    // A turn written as one value reads the same.
    let whole = serde_json::to_vec(states.last().unwrap()).unwrap();
    rewrite_head(&path, &whole);
    assert_head_reads(&store, Some(&claim)).await;
    rewrite_head(&path, &superseded(&whole));
    let error = claim.lease.controls().read().await.unwrap_err();
    assert_eq!(error.code, "stale_writer_epoch");
}

#[tokio::test]
async fn the_view_of_a_settled_turn_is_read_from_its_head() {
    use agent_kit_core::messages::OutcomeStatus;
    use agent_kit_core::turn::TurnOutcome;

    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = create(&path).await;
    let (claim, _) = run_turn(&store, 3).await;
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
    let settled = claim.lease.journal().load().await.unwrap();
    drop(claim);
    assert_head_reads(&store, None).await;
    let view = store.inspect(session()).await.unwrap().latest.unwrap();
    assert_eq!(view.history_position, settled.history().position());
    assert_eq!(
        view.disposition,
        agent_kit_sessions::TurnDisposition::Settled
    );

    rewrite_head(&path, &serde_json::to_vec(&settled).unwrap());
    assert_head_reads(&store, None).await;
}

/// Every message an inference operation holds, in its request, its attempts'
/// outcomes, the outcomes reconciliation replaced and a rejection, is stored
/// once apart from the operation, which refers to it by digest.
#[tokio::test]
async fn an_operation_part_refers_to_every_message_it_holds() {
    let directory = private_directory();
    let path = directory.path().join("sessions.sqlite");
    let store = create(&path).await;
    let input = submission("input", "start");
    store.submit(session(), input.clone()).await.unwrap();
    let claim = claim(&store, "claim", vec![input.id]).await;
    let outcome = |status, id: &str| {
        OperationOutcome::Inference(InferenceOutcome {
            status,
            messages: vec![message(id, Role::Assistant)],
            usage: vec![],
            failure: None,
            receipt: None,
            terminal_receipt: None,
        })
    };
    let prepare = |id: &str, sent: &str| {
        JournalAction::prepare(OperationRecord {
            id: OperationId::new(id).unwrap(),
            input: OperationInput::Inference(request(vec![message(sent, Role::User)])),
            origin: None,
            source_call: None,
            grants: GrantSelection {
                authority: authority(),
                grants: vec![],
            },
        })
    };
    let (operation, attempt) = (
        OperationId::new("call").unwrap(),
        AttemptId::new("attempt").unwrap(),
    );
    commit(
        &claim,
        "start",
        vec![
            prepare("call", "sent-message"),
            JournalAction::StartAttempt {
                operation: operation.clone(),
                attempt: attempt.clone(),
            },
            JournalAction::CompleteAttempt {
                operation: operation.clone(),
                attempt: attempt.clone(),
                outcome: outcome(InferenceStatus::Interrupted, "interrupted-reply"),
            },
            JournalAction::ReconcileAttempt {
                operation,
                attempt,
                outcome: outcome(InferenceStatus::Completed, "reconciled-reply"),
            },
            prepare("refused", "refused-request"),
            JournalAction::RejectPrepared {
                operation: OperationId::new("refused").unwrap(),
                outcome: outcome(InferenceStatus::Failed, "rejection-reply"),
            },
        ],
    )
    .await;
    let state = claim.lease.journal().load().await.unwrap();
    let connection = Connection::open(&path).unwrap();
    let mut statement = connection
        .prepare("SELECT body FROM turn_parts WHERE key LIKE 'o/%'")
        .unwrap();
    let parts: Vec<String> = statement
        .query_map([], |row| row.get::<_, Vec<u8>>(0))
        .unwrap()
        .map(|body| String::from_utf8(body.unwrap()).unwrap())
        .collect();
    assert_eq!(parts.len(), 2);
    for id in [
        "sent-message",
        "interrupted-reply",
        "reconciled-reply",
        "refused-request",
        "rejection-reply",
    ] {
        assert!(parts.iter().all(|part| !part.contains(id)), "{id} inline");
    }
    let messages: i64 = connection
        .query_row("SELECT COUNT(*) FROM turn_messages", [], |row| row.get(0))
        .unwrap();
    assert_eq!(messages, 5);
    drop(claim);
    drop(store);
    let reopened = SqliteStore::open(&path).unwrap();
    assert_eq!(same(&read(&reopened).await), same(&state));
}
