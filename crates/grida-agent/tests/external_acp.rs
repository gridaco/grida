#![cfg(any(target_os = "macos", target_os = "linux"))]

use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, OutcomeStatus, Role};
use agent_kit_core::turn::{CommitReceipt, ControlDirective, JournalAction, JournalChange};
use agent_kit_core::{
    BindingId, BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, GrantId, PrincipalId,
    Result, SchemaId, ScopeId, SessionId, TurnId,
};
use agent_kit_sandbox::{
    DeniedAccess, ExecutionScope, Installation, ProtectedPath, Sandbox, Termination,
    TrustedExecutable,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ControlRequest, CreateSession, DriverOutcome, RecoveryRequest,
    RunDisposition, SessionControl, SessionStore, Sessions, TurnDisposition, TurnDriver,
    TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent::acp::external::{ExternalAcpDriver, ExternalAcpLaunch};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::DirBuilderExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const PEER: &str = r#"
function send(body) {
    print "{\"jsonrpc\":\"2.0\"," body "}"
    fflush()
}
function response(id, result) {
    send("\"id\":" id ",\"result\":" result)
}
function text(session, value) {
    send("\"method\":\"session/update\",\"params\":{\"sessionId\":\"" session "\",\"update\":{\"sessionUpdate\":\"agent_message_chunk\",\"content\":{\"type\":\"text\",\"text\":\"" value "\"}}}")
}
function id_of(line, field) {
    match(line, /"id"[[:space:]]*:[[:space:]]*("[^"]*"|[0-9]+)/)
    field = substr(line, RSTART, RLENGTH)
    sub(/^[^:]*:[[:space:]]*/, "", field)
    return field
}
/"method":"initialize"/ {
    response(id_of($0), "{\"protocolVersion\":1,\"agentCapabilities\":{},\"authMethods\":[]}")
    next
}
/"method":"session\/new"/ {
    if ($0 !~ /"mcpServers":\[\]/) exit 20
    response(id_of($0), "{\"sessionId\":\"foreign-session\"}")
    next
}
/"method":"session\/prompt"/ {
    if ($0 !~ /"sessionId":"foreign-session"/ || $0 !~ /reviewed prompt/) exit 21
    prompt = id_of($0)
    text("foreign-session", "partial ")
    if (mode == "disconnect") exit 0
    if (mode == "cancel") {
        marker = ENVIRON["TMPDIR"] "/prompt-received"
        print "ready" > marker
        close(marker)
        next
    }
    send("\"id\":\"file\",\"method\":\"fs/read_text_file\",\"params\":{\"sessionId\":\"foreign-session\",\"path\":\"/not-granted\"}")
    next
}
/"id":"file"/ {
    if ($0 !~ /"error":/) exit 22
    send("\"id\":\"permit\",\"method\":\"session/request_permission\",\"params\":{\"sessionId\":\"foreign-session\",\"toolCall\":{\"toolCallId\":\"private-call\"},\"options\":[{\"optionId\":\"permit\",\"name\":\"Allow once\",\"kind\":\"allow_once\"}]}")
    next
}
/"id":"permit"/ {
    if ($0 !~ /"outcome":"cancelled"/) exit 23
    text("foreign-session", "and completed")
    response(prompt, "{\"stopReason\":\"end_turn\"}")
    next
}
/"method":"session\/cancel"/ {
    if ($0 !~ /"sessionId":"foreign-session"/) exit 24
    response(prompt, "{\"stopReason\":\"cancelled\"}")
    next
}
"#;

#[derive(Default)]
struct Authority {
    requests: Mutex<Vec<AuthorityRequest>>,
    refuse_prompt: bool,
}

impl AuthorityValidator for Authority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            let mut requests = self.requests.lock().unwrap();
            requests.push(request);
            if self.refuse_prompt && requests.len() > 1 {
                return Err(Error::new(ErrorKind::InvalidState, "revoked"));
            }
            Ok(())
        })
    }
}

struct Fixture {
    directory: tempfile::TempDir,
    workspace: PathBuf,
    temporary: PathBuf,
    sandbox: Arc<Sandbox>,
    authority: Arc<Authority>,
}

impl Fixture {
    fn new(refuse_prompt: bool) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().canonicalize().unwrap();
        let workspace = root.join("workspace");
        let temporary = root.join("temporary");
        for path in [&workspace, &temporary] {
            fs::DirBuilder::new().mode(0o700).create(path).unwrap();
        }
        let helper = trusted(
            std::env::var_os("GRIDA_AGENT_TEST_SANDBOX_HELPER")
                .expect("set GRIDA_AGENT_TEST_SANDBOX_HELPER to the built native helper"),
        );
        #[cfg(target_os = "macos")]
        let bubblewrap = None;
        #[cfg(target_os = "linux")]
        let bubblewrap = Some(trusted(std::env::var_os("AGENT_KIT_TEST_BWRAP").expect(
            "set AGENT_KIT_TEST_BWRAP to the trusted non-setuid bubblewrap executable",
        )));
        Self {
            directory,
            workspace,
            temporary,
            sandbox: Arc::new(Sandbox::new(Installation { helper, bubblewrap }).unwrap()),
            authority: Arc::new(Authority {
                refuse_prompt,
                ..Authority::default()
            }),
        }
    }

    fn driver(&self, mode: &str) -> Arc<ExternalAcpDriver> {
        let executable = trusted("/usr/bin/awk");
        let mut arguments = vec![];
        if executable
            .path
            .file_name()
            .is_some_and(|name| name == "mawk")
        {
            // Mawk otherwise waits for a full block on pipe input.
            arguments.extend(["-W".into(), "interactive".into()]);
        }
        arguments.extend(["-v".into(), format!("mode={mode}"), PEER.into()]);
        let runtime = [
            "/bin",
            "/usr/bin",
            "/usr/lib",
            "/usr/lib64",
            "/lib",
            "/lib64",
            "/System/Library",
        ]
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .collect();
        Arc::new(
            ExternalAcpDriver::new(
                self.sandbox.clone(),
                ExternalAcpLaunch {
                    executable,
                    arguments,
                    cwd: self.workspace.clone(),
                    scope: ExecutionScope {
                        grants: GrantSelection {
                            authority: AuthorityBinding {
                                principal: PrincipalId::new("reviewed-user").unwrap(),
                                binding: BindingId::new("reviewed-launch").unwrap(),
                                scope: ScopeId::new("reviewed-workspace").unwrap(),
                            },
                            grants: vec![GrantId::new("external-read").unwrap()],
                        },
                        revision: BindingId::new("reviewed-revision").unwrap(),
                        valid_until: Instant::now() + Duration::from_secs(30),
                        read: vec![self.workspace.clone()],
                        write: vec![],
                        runtime,
                        protected: vec![ProtectedPath {
                            path: self.directory.path().join("state"),
                            access: DeniedAccess::ReadWrite,
                        }],
                        temporary_parent: self.temporary.clone(),
                        termination: Termination::ProcessGroup,
                    },
                    timeout: Duration::from_secs(8),
                },
                self.authority.clone(),
            )
            .unwrap(),
        )
    }

    fn open(&self) -> Arc<SqliteStore> {
        let state = self.directory.path().join("state");
        if !state.exists() {
            fs::DirBuilder::new().mode(0o700).create(&state).unwrap();
        }
        Arc::new(SqliteStore::open(state.join("turns.sqlite")).unwrap())
    }

    async fn admit(&self, store: &SqliteStore, driver: &ExternalAcpDriver) -> ClaimRequest {
        store
            .create(CreateSession {
                id: session(),
                request: change("create"),
                configuration: driver.configuration(),
            })
            .await
            .unwrap();
        store.submit(session(), input()).await.unwrap();
        ClaimRequest {
            id: change("claim"),
            session: session(),
            expected_revision: store.inspect(session()).await.unwrap().revision,
            selection: TurnSelection::New {
                turn: turn(),
                inputs: vec![input().id],
            },
        }
    }
}

fn trusted(path: impl AsRef<Path>) -> TrustedExecutable {
    let path = fs::canonicalize(path).unwrap();
    TrustedExecutable {
        sha256: Sha256::digest(fs::read(&path).unwrap()).into(),
        path,
    }
}
fn session() -> SessionId {
    SessionId::new("external-session").unwrap()
}
fn turn() -> TurnId {
    TurnId::new("external-turn").unwrap()
}
fn change(value: &str) -> ChangeId {
    ChangeId::new(value).unwrap()
}
fn input() -> agent_kit_sessions::Submission {
    ExternalAcpDriver::submission(change("input"), "reviewed prompt").unwrap()
}

fn account(outcome: &agent_kit_core::turn::TurnOutcome) -> Value {
    serde_json::from_slice(outcome.account.as_ref().unwrap().bytes()).unwrap()
}

async fn assistant(store: &SqliteStore) -> Option<String> {
    store
        .history(session(), None)
        .await
        .unwrap()
        .into_iter()
        .find_map(|record| {
            let HistoryRecord::Message(message) = record;
            if message.role == Role::Assistant
                && let [Content::Text(text)] = message.content.as_slice()
            {
                Some(text.clone())
            } else {
                None
            }
        })
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and a built helper"]
async fn owned_external_turn_streams_text_and_denies_peer_callbacks() {
    let fixture = Fixture::new(false);
    let store = fixture.open();
    let driver = fixture.driver("complete");
    let request = fixture.admit(&store, &driver).await;
    let sessions = Sessions::new(store.clone(), driver);
    let RunDisposition::Settled(receipt) = sessions.run_selected(request.clone()).await.unwrap()
    else {
        panic!("expected a verified settlement")
    };
    assert_eq!(
        receipt.outcome.status,
        OutcomeStatus::Succeeded,
        "{:?}",
        account(&receipt.outcome)
    );
    assert_eq!(account(&receipt.outcome)["peer_session"], "foreign-session");
    assert_eq!(account(&receipt.outcome)["peer_stop"], "end_turn");
    assert_eq!(
        assistant(&store).await.as_deref(),
        Some("partial and completed")
    );
    assert!(matches!(
        sessions.run_selected(request).await.unwrap(),
        RunDisposition::Existing(_)
    ));
    let requests = fixture.authority.requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0], requests[1]);
    assert!(fs::read_dir(&fixture.temporary).unwrap().next().is_none());
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and a built helper"]
async fn external_prompt_rechecks_the_grant_after_handshake() {
    let fixture = Fixture::new(true);
    let store = fixture.open();
    let driver = fixture.driver("complete");
    let request = fixture.admit(&store, &driver).await;
    let sessions = Sessions::new(store.clone(), driver);
    let RunDisposition::Settled(receipt) = sessions.run_selected(request).await.unwrap() else {
        panic!("expected a verified settlement")
    };
    let account = account(&receipt.outcome);
    assert_eq!(receipt.outcome.status, OutcomeStatus::Failed, "{account:?}");
    assert_eq!(account["code"], "external_acp_prompt_refused");
    assert_eq!(assistant(&store).await, None);
    assert_eq!(fixture.authority.requests.lock().unwrap().len(), 2);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and a built helper"]
async fn pause_before_external_launch_resumes_only_the_same_admitted_input() {
    let fixture = Fixture::new(false);
    let store = fixture.open();
    let driver = fixture.driver("complete");
    let request = fixture.admit(&store, &driver).await;
    let ClaimOutcome::Acquired(claim) = store.claim(request).await.unwrap() else {
        panic!("expected fresh claim")
    };
    let view = store.inspect(session()).await.unwrap();
    let current = view.current.unwrap();
    store
        .control(ControlRequest {
            id: change("pause-before-launch"),
            session: session(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn(),
                expected: current.controls.revision,
                directive: ControlDirective::Pause,
            },
        })
        .await
        .unwrap();
    let DriverOutcome::Suspended(receipt) = driver.run(claim).await.unwrap() else {
        panic!("expected a verified suspension")
    };
    store
        .verify(CommitReceipt::Suspended(receipt))
        .await
        .unwrap();
    assert!(fixture.authority.requests.lock().unwrap().is_empty());
    assert!(fs::read_dir(&fixture.temporary).unwrap().next().is_none());
    let view = store.inspect(session()).await.unwrap();
    let suspended = view.current.unwrap();
    let sessions = Sessions::new(store.clone(), driver);
    let RunDisposition::Settled(receipt) = sessions
        .run_selected(ClaimRequest {
            id: change("resume-before-launch"),
            session: session(),
            expected_revision: view.revision,
            selection: TurnSelection::ResumePaused {
                turn: turn(),
                epoch: suspended.binding.epoch,
                position: suspended.position,
                control_revision: suspended.controls.revision,
            },
        })
        .await
        .unwrap()
    else {
        panic!("expected a verified settlement")
    };
    assert_eq!(
        receipt.outcome.status,
        OutcomeStatus::Succeeded,
        "{:?}",
        account(&receipt.outcome)
    );
    assert_eq!(store.history(session(), None).await.unwrap().len(), 2);
    assert_eq!(fixture.authority.requests.lock().unwrap().len(), 2);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and a built helper"]
async fn caller_drop_retains_lease_until_external_cancel_and_cleanup() {
    let fixture = Fixture::new(false);
    let store = fixture.open();
    let driver = fixture.driver("cancel");
    let request = fixture.admit(&store, &driver).await;
    let sessions = Sessions::new(store.clone(), driver);
    let owner = tokio::spawn(async move { sessions.run_selected(request).await });
    tokio::time::timeout(Duration::from_secs(4), async {
        loop {
            if fs::read_dir(&fixture.temporary)
                .unwrap()
                .flatten()
                .any(|entry| entry.path().join("prompt-received").is_file())
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    owner.abort();
    let _ = owner.await;
    let view = store.inspect(session()).await.unwrap();
    let active = view.current.unwrap();
    assert_eq!(active.disposition, TurnDisposition::Running);
    let attempt = store
        .recover(RecoveryRequest {
            id: change("recover-active"),
            session: session(),
            turn: turn(),
            expected_epoch: active.binding.epoch,
        })
        .await
        .err()
        .unwrap();
    assert_eq!(attempt.kind, ErrorKind::Conflict);
    store
        .control(ControlRequest {
            id: change("stop"),
            session: session(),
            expected_revision: view.revision,
            action: SessionControl::Turn {
                turn: turn(),
                expected: active.controls.revision,
                directive: ControlDirective::Cancel,
            },
        })
        .await
        .unwrap();
    let outcome = tokio::time::timeout(Duration::from_secs(4), async {
        loop {
            if let Some(outcome) = store.inspect_turn(session(), turn()).await.unwrap().outcome {
                break outcome;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        outcome.status,
        OutcomeStatus::Cancelled,
        "{:?}",
        account(&outcome)
    );
    assert_eq!(account(&outcome)["peer_stop"], "cancelled");
    assert_eq!(assistant(&store).await.as_deref(), Some("partial "));
    assert!(fs::read_dir(&fixture.temporary).unwrap().next().is_none());
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and a built helper"]
async fn peer_disconnect_retains_partial_text_and_unknown_outcome() {
    let fixture = Fixture::new(false);
    let store = fixture.open();
    let driver = fixture.driver("disconnect");
    let request = fixture.admit(&store, &driver).await;
    let sessions = Sessions::new(store.clone(), driver);
    let RunDisposition::Settled(receipt) = sessions.run_selected(request).await.unwrap() else {
        panic!("expected a verified settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Uncertain);
    assert_eq!(assistant(&store).await.as_deref(), Some("partial "));
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and a built helper"]
async fn reopened_sqlite_reconciles_unconfirmed_dispatch_without_replay() {
    let fixture = Fixture::new(false);
    let store = fixture.open();
    let driver = fixture.driver("complete");
    let request = fixture.admit(&store, &driver).await;
    let ClaimOutcome::Acquired(claim) = store.claim(request).await.unwrap() else {
        panic!("expected fresh claim")
    };
    let basis = claim.lease.journal().load().await.unwrap();
    let profile: Fingerprint = serde_json::from_slice(claim.configuration.bytes()).unwrap();
    let input = input();
    let action = Fingerprint::of(&(profile, session(), turn(), &input.id, &input.payload)).unwrap();
    let dispatch = Envelope::new(
        SchemaId::new("grida.external-acp.dispatch").unwrap(),
        1,
        serde_json::to_vec(&json!({ "action": action, "input": input.id })).unwrap(),
    )
    .unwrap();
    claim
        .lease
        .journal()
        .commit(
            JournalChange::new(
                change("unconfirmed-handoff"),
                basis.binding().clone(),
                basis.position(),
                basis.controls().revision,
                vec![JournalAction::SetCheckpoint(dispatch)],
            )
            .unwrap(),
        )
        .await
        .unwrap();
    let epoch = basis.binding().epoch;
    drop(claim);
    drop(store);

    let store = fixture.open();
    let sessions = Sessions::new(store.clone(), driver);
    let RunDisposition::Settled(receipt) = sessions
        .recover(RecoveryRequest {
            id: change("reconcile"),
            session: session(),
            turn: turn(),
            expected_epoch: epoch,
        })
        .await
        .unwrap()
    else {
        panic!("expected a verified settlement")
    };
    assert_eq!(receipt.outcome.status, OutcomeStatus::Uncertain);
    assert_eq!(
        account(&receipt.outcome)["code"],
        "external_acp_previous_dispatch_unconfirmed"
    );
    assert!(receipt.record.binding.epoch > epoch);
    assert!(fixture.authority.requests.lock().unwrap().is_empty());
    assert!(fs::read_dir(&fixture.temporary).unwrap().next().is_none());
}
