use agent_kit_core::turn::{CommitReceipt, JournalAction, JournalChange};
use agent_kit_core::{ChangeId, Envelope, SchemaId, SessionId, TurnId};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ClaimedTurn, SessionStore, Submission, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use tempfile::TempDir;

pub fn private_directory() -> TempDir {
    let directory = tempfile::tempdir().unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    directory
}

#[allow(dead_code)]
/// Simulate a version-10 or earlier store, which also predates turn timing.
pub fn remove_turn_link_schema(connection: &rusqlite::Connection) {
    connection
        .execute_batch(
            "DROP TABLE turn_times;
             DROP TABLE turn_submission_links;
             DROP INDEX submissions_pending_link;
             DROP INDEX submissions_unknown_link;
             ALTER TABLE submissions DROP COLUMN link_projected;",
        )
        .unwrap();
}

pub fn change(value: &str) -> ChangeId {
    ChangeId::new(value).unwrap()
}
pub fn session() -> SessionId {
    SessionId::new("conversation").unwrap()
}
pub fn turn() -> TurnId {
    TurnId::new("turn").unwrap()
}
pub fn payload(value: &str) -> Envelope {
    Envelope::new(
        SchemaId::new("test.text").unwrap(),
        1,
        value.as_bytes().to_vec(),
    )
    .unwrap()
}
pub fn submission(id: &str, text: &str) -> Submission {
    Submission {
        id: change(id),
        payload: payload(text),
    }
}
pub async fn claim(store: &SqliteStore, id: &str, inputs: Vec<ChangeId>) -> ClaimedTurn {
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
pub async fn commit(claim: &ClaimedTurn, id: &str, actions: Vec<JournalAction>) -> CommitReceipt {
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
