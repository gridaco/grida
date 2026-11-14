//! Process-spawning fixtures run separately from immediate reopen tests.
//! A fork can briefly retain another thread's close-on-exec lock descriptor.

mod support;

use agent_kit_core::turn::JournalAction;
use agent_kit_sessions::{
    ClaimOutcome, CreateSession, RecoveryRequest, SessionStore, TurnDisposition,
};
use agent_kit_store_sqlite::SqliteStore;
use support::*;

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
