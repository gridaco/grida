#![cfg(any(target_os = "macos", target_os = "linux"))]

// GRIDA-SEC-004 / GRIDA-SEC-014: selected roots and action-bound native effects.
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{Inventory, ToolOutcome};
use agent_kit_core::turn::{TurnLease, WaitRecord};
use agent_kit_core::{
    BindingId, ChangeId, Envelope, SchemaId, ScopeId, SessionId, ToolId, TurnId, WaitId,
};
use agent_kit_runtime::{
    ExecutionLimits, ExecutionServices, InvokeOutcome, OpenedTurn, OperationKey, PlannedInvocation,
    Runtime, TurnOperations,
};
use agent_kit_sandbox::{Installation, Sandbox, Termination, TrustedExecutable};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ControlRequest, CreateSession, RecoveryRequest, SessionControl,
    SessionStore, Submission, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use grida_agent::command::{CommandLimits, CommandTool};
use grida_agent::permissions::{
    AccessRule, ApprovalDecision, ApprovalEffect, CommandProfile, DirectoryAccess,
    PermissionCapture, PermissionProfile, TurnPermissions, approval_answer, read_approval,
};
use grida_agent::workspace::{DirectorySpec, ProtectedRoots, WorkspaceSnapshot};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tempfile::TempDir;

const TIMEOUT: Duration = Duration::from_secs(12);

struct Fixture {
    _base: TempDir,
    default: PathBuf,
    additional: PathBuf,
    protected: PathBuf,
    temporary: PathBuf,
    database: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let base = tempfile::tempdir().unwrap();
        let root = base.path().canonicalize().unwrap();
        for name in ["default", "additional", "protected", "temporary", "state"] {
            let path = root.join(name);
            fs::create_dir(&path).unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self {
            _base: base,
            default: root.join("default"),
            additional: root.join("additional"),
            protected: root.join("protected"),
            temporary: root.join("temporary"),
            database: root.join("state/agent.sqlite"),
        }
    }

    fn profile(&self, command: bool) -> Arc<PermissionProfile> {
        self.profile_with(command, false)
    }

    fn profile_with(&self, command: bool, write: bool) -> Arc<PermissionProfile> {
        let protected = vec![
            self.protected.clone(),
            self.database.parent().unwrap().to_owned(),
        ];
        let workspace = WorkspaceSnapshot::capture(
            binding("workspace"),
            1,
            [("default", &self.default), ("additional", &self.additional)]
                .into_iter()
                .map(|(name, path)| DirectorySpec {
                    id: binding(name),
                    name: name.into(),
                    path: path.clone(),
                    generation: binding("initial"),
                })
                .collect(),
            Some(binding("default")),
            &ProtectedRoots::new(protected.clone()).unwrap(),
        )
        .unwrap();
        Arc::new(
            PermissionProfile::new(
                binding("workspace-permissions"),
                Arc::new(workspace),
                [
                    (
                        binding("default"),
                        DirectoryAccess {
                            write: if write {
                                AccessRule::Allow
                            } else {
                                AccessRule::Deny
                            },
                            read: AccessRule::Allow,
                            command_read: if command {
                                AccessRule::Allow
                            } else {
                                AccessRule::Deny
                            },
                            command_read_write: if command && write {
                                AccessRule::Allow
                            } else {
                                AccessRule::Deny
                            },
                        },
                    ),
                    (
                        binding("additional"),
                        DirectoryAccess {
                            write: AccessRule::Deny,
                            read: AccessRule::Ask,
                            command_read: AccessRule::Deny,
                            command_read_write: if command {
                                AccessRule::Ask
                            } else {
                                AccessRule::Deny
                            },
                        },
                    ),
                ]
                .into(),
                protected,
                command.then(|| self.command_profile()),
            )
            .unwrap(),
        )
    }

    fn command_profile(&self) -> CommandProfile {
        let helper = trusted(PathBuf::from(
            std::env::var_os("GRIDA_AGENT_TEST_SANDBOX_HELPER")
                .expect("GRIDA_AGENT_TEST_SANDBOX_HELPER"),
        ));
        #[cfg(target_os = "macos")]
        let bubblewrap = None;
        #[cfg(target_os = "linux")]
        let bubblewrap = Some(trusted(PathBuf::from(
            std::env::var_os("AGENT_KIT_TEST_BWRAP").expect("AGENT_KIT_TEST_BWRAP"),
        )));
        CommandProfile {
            sandbox: Arc::new(Sandbox::new(Installation { helper, bubblewrap }).unwrap()),
            runtime_paths: [
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
            .collect(),
            temporary_parent: self.temporary.clone(),
            termination: Termination::ProcessGroup,
            limits: CommandLimits {
                timeout: TIMEOUT,
                max_input_bytes: 4096,
                max_output_bytes: 4096,
            },
            disk_read: false,
            environment: Default::default(),
        }
    }

    async fn first(&self, profile: &Arc<PermissionProfile>, allow_review: bool) -> Running {
        let store = Arc::new(SqliteStore::open(&self.database).unwrap());
        store
            .create(CreateSession {
                id: session(),
                request: change("create"),
                configuration: payload(),
            })
            .await
            .unwrap();
        let capture = profile.capture(ScopeId::new("accepted-input").unwrap());
        let input = Submission {
            id: change("input"),
            payload: Envelope::new(
                SchemaId::new("fixture.permission.capture").unwrap(),
                1,
                serde_json::to_vec(&capture).unwrap(),
            )
            .unwrap(),
        };
        store.submit(session(), input.clone()).await.unwrap();
        let claim = store
            .claim(ClaimRequest {
                id: change("claim"),
                session: session(),
                expected_revision: store.inspect(session()).await.unwrap().revision,
                selection: TurnSelection::New {
                    turn: turn(),
                    inputs: vec![input.id],
                },
            })
            .await
            .unwrap();
        let ClaimOutcome::Acquired(claim) = claim else {
            panic!("owner expected")
        };
        Running::open(profile, capture, store, claim.lease, allow_review).await
    }

    async fn reopen(&self, profile: &Arc<PermissionProfile>, epoch: u64) -> Running {
        // The aborted monitor can own the last store reference until polled.
        let store = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                match SqliteStore::open(&self.database) {
                    Ok(store) => break Arc::new(store),
                    Err(error) if error.code == "store_already_owned" => {
                        tokio::time::sleep(Duration::from_millis(5)).await;
                    }
                    Err(error) => panic!("cannot reopen fixture state: {error}"),
                }
            }
        })
        .await
        .expect("old owner must release the store");
        let claim = store
            .recover(RecoveryRequest {
                id: change("recovery"),
                session: session(),
                turn: turn(),
                expected_epoch: epoch,
            })
            .await
            .unwrap();
        let ClaimOutcome::Acquired(claim) = claim else {
            panic!("recovery owner expected")
        };
        let capture = serde_json::from_slice(claim.inputs[0].payload.bytes()).unwrap();
        Running::open(profile, capture, store, claim.lease, true).await
    }

    fn command(&self, executable: &Path, script: &str) -> Value {
        json!({
            "directory": "additional", "access": "read_write", "program": executable,
            "args": ["-c", script], "cwd": self.additional,
        })
    }
}

struct Running {
    store: Arc<SqliteStore>,
    opened: OpenedTurn,
    permissions: Arc<TurnPermissions>,
    command: Option<Arc<CommandTool>>,
    grants: std::collections::BTreeMap<ToolId, agent_kit_core::authority::GrantSelection>,
}

impl Running {
    async fn open(
        profile: &Arc<PermissionProfile>,
        capture: PermissionCapture,
        store: Arc<SqliteStore>,
        lease: TurnLease,
        allow_review: bool,
    ) -> Self {
        let permissions = profile
            .bind(
                &capture,
                lease.binding().clone(),
                store.clone(),
                allow_review,
            )
            .unwrap();
        let mut inventory = Inventory::new();
        let mut grants = Default::default();
        let command = permissions.insert(&mut inventory, &mut grants).unwrap();
        let tools = inventory
            .snapshot(&grants.keys().cloned().collect::<Vec<_>>())
            .unwrap();
        let runtime = Runtime::new(ExecutionServices {
            providers: Default::default(),
            tools,
            authority: permissions.clone(),
            gate: permissions.clone(),
            limits: ExecutionLimits {
                max_operations: 32,
                max_concurrent_inferences: 1,
                max_concurrent_tools: 1,
                max_output_bytes: 8192,
                operation_timeout: TIMEOUT,
                observer_capacity: 32,
            },
        })
        .unwrap();
        let runtime = runtime.with_authorization(permissions.clone(), permissions.clone());
        let opened = runtime.open(lease).await.unwrap();
        Self {
            store,
            opened,
            permissions,
            command,
            grants,
        }
    }

    fn call(
        &self,
        id: &str,
        tool: &str,
        arguments: Value,
    ) -> (TurnOperations, OperationKey, PlannedInvocation) {
        let tool = ToolId::new(tool).unwrap();
        (
            self.opened.turn.operations(),
            OperationKey::new(id).unwrap(),
            PlannedInvocation {
                grants: self.grants[&tool].clone(),
                tool,
                arguments: ToolArguments::Json(arguments),
            },
        )
    }

    async fn invoke(&self, id: &str, tool: &str, arguments: Value) -> InvokeOutcome {
        let (operations, key, plan) = self.call(id, tool, arguments);
        operations.invoke(key, plan).await.unwrap()
    }

    async fn approval(&self, wait: &WaitId) -> WaitRecord {
        let wait = wait.clone();
        self.store
            .inspect_turn_with(session(), turn(), move |state| {
                Ok(state.waits()[&wait].clone())
            })
            .await
            .unwrap()
    }

    async fn answer(&self, wait: WaitId, decision: ApprovalDecision) {
        let answer = approval_answer(&self.approval(&wait).await, decision).unwrap();
        let session_view = self.store.inspect(session()).await.unwrap();
        let request = ControlRequest {
            id: change(&format!("resolve/{wait}")),
            session: session(),
            expected_revision: session_view.revision,
            action: SessionControl::Resolve {
                turn: turn(),
                expected: session_view.current.unwrap().controls.revision,
                wait,
                answer,
            },
        };
        let receipt = self.store.control(request.clone()).await.unwrap();
        assert_eq!(receipt, self.store.control(request).await.unwrap());
    }
}

fn trusted(path: PathBuf) -> TrustedExecutable {
    let path = path.canonicalize().unwrap();
    TrustedExecutable {
        sha256: Sha256::digest(fs::read(&path).unwrap()).into(),
        path,
    }
}
fn binding(id: &str) -> BindingId {
    BindingId::new(id).unwrap()
}
fn change(id: &str) -> ChangeId {
    ChangeId::new(id).unwrap()
}
fn session() -> SessionId {
    SessionId::new("session").unwrap()
}
fn turn() -> TurnId {
    TurnId::new("turn").unwrap()
}
fn payload() -> Envelope {
    Envelope::new(SchemaId::new("fixture").unwrap(), 1, Vec::new()).unwrap()
}
fn deferred(outcome: InvokeOutcome) -> WaitId {
    let InvokeOutcome::Deferred(wait) = outcome else {
        panic!("expected wait, got {outcome:?}")
    };
    wait
}
fn completed(outcome: InvokeOutcome) -> ToolOutcome {
    let InvokeOutcome::Complete(outcome) = outcome else {
        panic!("expected outcome")
    };
    outcome
}
fn failed(outcome: InvokeOutcome, code: &str) {
    let outcome = completed(outcome);
    assert_eq!(outcome.status, OutcomeStatus::Failed, "{outcome:?}");
    assert_eq!(outcome.content, [ResultContent::Text(code.into())]);
}

#[tokio::test]
async fn workspace_read_uses_existing_grant_and_additional_access_is_one_action() {
    let fixture = Fixture::new();
    fs::write(fixture.default.join("note"), "default").unwrap();
    fs::write(fixture.additional.join("note"), "private").unwrap();
    let profile = fixture.profile(false);
    let run = fixture.first(&profile, true).await;
    let first = completed(
        run.invoke("existing", "read_file", json!({"path":"note"}))
            .await,
    );
    assert_eq!(first.content, [ResultContent::Text("default".into())]);
    assert!(run.opened.turn.view().state.waits().is_empty());
    let call = json!({"directory":"additional","path":"note"});
    let wait = deferred(run.invoke("ask", "read_file", call.clone()).await);
    let approval = read_approval(&run.approval(&wait).await).unwrap();
    assert_eq!(approval.directory, binding("additional"));
    assert!(matches!(approval.effect, ApprovalEffect::Read { .. }));
    run.answer(wait, ApprovalDecision::ApproveOnce).await;
    let read = completed(run.invoke("ask", "read_file", call.clone()).await);
    assert_eq!(read.content, [ResultContent::Text("private".into())]);
    let next = deferred(run.invoke("new-operation", "read_file", call.clone()).await);
    run.answer(next, ApprovalDecision::ApproveOnce).await;
    run.permissions.revoke(&binding("additional")).unwrap();
    failed(
        run.invoke("new-operation", "read_file", call).await,
        "permission_revoked",
    );
}

fn text(outcome: &ToolOutcome) -> String {
    outcome
        .content
        .iter()
        .map(|part| match part {
            ResultContent::Text(text) => text.clone(),
            _ => String::new(),
        })
        .collect()
}

#[tokio::test]
async fn writes_and_edits_stay_inside_the_project_and_off_metadata() {
    let fixture = Fixture::new();
    let run = fixture
        .first(&fixture.profile_with(false, true), true)
        .await;
    let file = fixture.default.join("src/note.txt");

    // A new file in a missing folder is created.
    let created = completed(
        run.invoke(
            "w1",
            "write_file",
            json!({"path":"src/note.txt","content":"one two two"}),
        )
        .await,
    );
    assert_eq!(created.status, OutcomeStatus::Succeeded, "{created:?}");
    assert_eq!(fs::read_to_string(&file).unwrap(), "one two two");

    // An ambiguous or missing match changes nothing.
    let ambiguous = completed(
        run.invoke(
            "e1",
            "edit_file",
            json!({"path":"src/note.txt","old_string":"two","new_string":"2"}),
        )
        .await,
    );
    assert_eq!(ambiguous.status, OutcomeStatus::Failed);
    assert!(text(&ambiguous).contains("edit_ambiguous"), "{ambiguous:?}");
    let missing = completed(
        run.invoke(
            "e2",
            "edit_file",
            json!({"path":"src/note.txt","old_string":"zero","new_string":"0"}),
        )
        .await,
    );
    assert!(text(&missing).contains("edit_no_match"), "{missing:?}");
    assert_eq!(fs::read_to_string(&file).unwrap(), "one two two");

    // A unique match, then every match.
    let edited = completed(
        run.invoke(
            "e3",
            "edit_file",
            json!({"path":"src/note.txt","old_string":"one","new_string":"1"}),
        )
        .await,
    );
    assert_eq!(edited.status, OutcomeStatus::Succeeded, "{edited:?}");
    completed(
        run.invoke(
            "e4",
            "edit_file",
            json!({"path":"src/note.txt","old_string":"two","new_string":"2","replace_all":true}),
        )
        .await,
    );
    assert_eq!(fs::read_to_string(&file).unwrap(), "1 2 2");

    // A long but legal file name is replaced in place.
    let long = format!("{}.txt", "n".repeat(240));
    for (id, content) in [("w-long-1", "first"), ("w-long-2", "second")] {
        let written = completed(
            run.invoke(id, "write_file", json!({"path":long,"content":content}))
                .await,
        );
        assert_eq!(written.status, OutcomeStatus::Succeeded, "{written:?}");
    }
    assert_eq!(
        fs::read_to_string(fixture.default.join(&long)).unwrap(),
        "second"
    );

    // Metadata, links and folders without a write rule are refused.
    fs::create_dir(fixture.default.join(".git")).unwrap();
    failed(
        run.invoke(
            "w2",
            "write_file",
            json!({"path":".git/config","content":"x"}),
        )
        .await,
        "file_protected_path",
    );
    assert!(!fixture.default.join(".git/config").exists());
    // A case-insensitive volume resolves these names to the metadata folders.
    for (index, path) in [".GIT/config", ".Grida/settings.json"].iter().enumerate() {
        failed(
            run.invoke(
                &format!("w2-{index}"),
                "write_file",
                json!({"path":path,"content":"x"}),
            )
            .await,
            "file_protected_path",
        );
    }
    assert!(!fixture.default.join(".git/config").exists());
    assert!(!fixture.default.join(".Grida").exists());
    std::os::unix::fs::symlink(
        fixture.additional.join("target"),
        fixture.default.join("link"),
    )
    .unwrap();
    let linked = completed(
        run.invoke("w3", "write_file", json!({"path":"link","content":"x"}))
            .await,
    );
    assert_eq!(linked.status, OutcomeStatus::Failed, "{linked:?}");
    assert!(!fixture.additional.join("target").exists());
    let elsewhere = completed(
        run.invoke(
            "w4",
            "write_file",
            json!({"directory":"additional","path":"note","content":"x"}),
        )
        .await,
    );
    assert_eq!(elsewhere.status, OutcomeStatus::Failed, "{elsewhere:?}");
    assert!(!fixture.additional.join("note").exists());
}

#[tokio::test]
#[ignore = "requires native confinement outside the test runner's sandbox"]
async fn commands_write_the_project_and_shared_temp_but_not_existing_metadata() {
    let fixture = Fixture::new();
    let run = fixture.first(&fixture.profile_with(true, true), true).await;
    let command = |script: &str| {
        json!({
            "access": "read_write", "program": "/bin/sh", "cwd": fixture.default,
            "args": ["-c", script],
        })
    };

    // Missing repository metadata may be created, as `git init` does.
    let init = completed(
        run.invoke(
            "init",
            "run_command",
            command("mkdir .git && printf ref > .git/HEAD"),
        )
        .await,
    );
    assert_eq!(init.status, OutcomeStatus::Succeeded, "{init:?}");
    assert_eq!(fs::read(fixture.default.join(".git/HEAD")).unwrap(), b"ref");

    // Once it exists, a later command cannot change it.
    let changed = completed(
        run.invoke("config", "run_command", command("printf x > .git/config"))
            .await,
    );
    assert_eq!(changed.status, OutcomeStatus::Failed, "{changed:?}");
    assert!(!fixture.default.join(".git/config").exists());

    // Agent configuration stays off limits even before it exists.
    let configured = completed(
        run.invoke("agent-config", "run_command", command("mkdir .grida"))
            .await,
    );
    assert_eq!(configured.status, OutcomeStatus::Failed, "{configured:?}");
    assert!(!fixture.default.join(".grida").exists());

    // Ordinary project files stay writable.
    let written = completed(
        run.invoke("file", "run_command", command("printf ok > note"))
            .await,
    );
    assert_eq!(written.status, OutcomeStatus::Succeeded, "{written:?}");
    assert_eq!(fs::read(fixture.default.join("note")).unwrap(), b"ok");

    // The shared temporary directory carries files between commands.
    let scratch = format!("/tmp/grida-agent-test-{}", std::process::id());
    let staged = completed(
        run.invoke(
            "tmp-write",
            "run_command",
            command(&format!("printf staged > {scratch}")),
        )
        .await,
    );
    assert_eq!(staged.status, OutcomeStatus::Succeeded, "{staged:?}");
    let reread = completed(
        run.invoke(
            "tmp-read",
            "run_command",
            command(&format!("cat {scratch}")),
        )
        .await,
    );
    let _ = fs::remove_file(&scratch);
    assert_eq!(reread.status, OutcomeStatus::Succeeded, "{reread:?}");
    assert!(text(&reread).contains("staged"), "{reread:?}");
}

#[tokio::test]
async fn unavailable_review_does_not_grant_or_open_an_interaction() {
    let fixture = Fixture::new();
    let run = fixture.first(&fixture.profile(false), false).await;
    failed(
        run.invoke(
            "read",
            "read_file",
            json!({"directory":"additional","path":"note"}),
        )
        .await,
        "permission_review_unavailable",
    );
    assert!(run.opened.turn.view().state.waits().is_empty());
}

#[tokio::test]
#[ignore = "requires native confinement outside the test runner's sandbox"]
async fn decline_and_durable_approval_dispatch_only_the_exact_command_once() {
    let fixture = Fixture::new();
    let profile = fixture.profile(true);
    let run = fixture.first(&profile, true).await;
    let baseline = completed(run.invoke("baseline", "run_command", json!({
        "access": "read", "program": "/bin/bash", "cwd": fixture.default,
        "args": ["-c", "printf baseline; (printf x > forbidden) 2>/dev/null; test ! -e forbidden"],
    })).await);
    assert_eq!(baseline.status, OutcomeStatus::Succeeded, "{baseline:?}");
    assert_eq!(
        baseline.content,
        [ResultContent::Text("stdout:\nbaseline".into())]
    );
    assert!(!fixture.default.join("forbidden").exists());
    assert!(run.opened.turn.view().state.waits().is_empty());
    let command = fixture.command(Path::new("/bin/bash"), "printf x >> effect");
    let marker = fixture.additional.join("effect");
    let wait = deferred(run.invoke("decline", "run_command", command.clone()).await);
    run.answer(wait, ApprovalDecision::Decline).await;
    failed(
        run.invoke("decline", "run_command", command.clone()).await,
        "permission_declined",
    );
    assert!(!marker.exists());
    let wait = deferred(run.invoke("approve", "run_command", command.clone()).await);
    let request = read_approval(&run.approval(&wait).await).unwrap();
    assert!(matches!(
        request.effect,
        ApprovalEffect::Command {
            access: grida_agent::command::CommandAccess::ReadWrite,
            executable: Some(ref executable),
            ..
        } if executable == Path::new("/bin/bash")
    ));
    run.answer(wait, ApprovalDecision::ApproveOnce).await;
    let epoch = run.opened.turn.view().state.binding().epoch;
    assert!(!marker.exists());
    drop(run);
    drop(profile);
    let restarted_profile = fixture.profile(true);
    let run = fixture.reopen(&restarted_profile, epoch).await;
    let result = completed(run.invoke("approve", "run_command", command.clone()).await);
    assert_eq!(result.status, OutcomeStatus::Succeeded, "{result:?}");
    assert_eq!(fs::read(&marker).unwrap(), b"x");
    assert_eq!(
        completed(run.invoke("approve", "run_command", command).await),
        result
    );
    assert_eq!(fs::read(&marker).unwrap(), b"x");
    assert!(
        run.command
            .as_ref()
            .unwrap()
            .stop_and_wait(Instant::now() + TIMEOUT)
            .await
            .is_verified()
    );
    assert_eq!(fs::read_dir(&fixture.temporary).unwrap().count(), 0);
}

#[tokio::test]
#[ignore = "requires native confinement outside the test runner's sandbox"]
async fn replacing_approved_executable_or_root_refuses_dispatch() {
    let fixture = Fixture::new();
    let profile = fixture.profile(true);
    let run = fixture.first(&profile, true).await;
    let executable = fixture.additional.join("command");
    fs::copy("/bin/bash", &executable).unwrap();
    let call = fixture.command(&executable, "printf x >> effect");
    let wait = deferred(
        run.invoke("changed-program", "run_command", call.clone())
            .await,
    );
    run.answer(wait, ApprovalDecision::ApproveOnce).await;
    fs::rename(&executable, fixture.additional.join("original")).unwrap();
    fs::copy("/bin/bash", &executable).unwrap();
    failed(
        run.invoke("changed-program", "run_command", call.clone())
            .await,
        "permission_action_changed",
    );
    let wait = deferred(
        run.invoke("changed-root", "run_command", call.clone())
            .await,
    );
    run.answer(wait, ApprovalDecision::ApproveOnce).await;
    let old = fixture.additional.with_file_name("old");
    fs::rename(&fixture.additional, &old).unwrap();
    fs::create_dir(&fixture.additional).unwrap();
    fs::copy("/bin/bash", &executable).unwrap();
    failed(
        run.invoke("changed-root", "run_command", call).await,
        "workspace_directory_changed",
    );
    assert!(!old.join("effect").exists());
    assert!(!fixture.additional.join("effect").exists());
}

#[tokio::test]
#[ignore = "requires native confinement outside the test runner's sandbox"]
async fn revocation_fences_approved_launch_and_stops_running_command() {
    let fixture = Fixture::new();
    let run = fixture.first(&fixture.profile(true), true).await;
    let call = fixture.command(
        Path::new("/bin/bash"),
        "printf x > started; /bin/sleep 30; printf x > finished",
    );
    let wait = deferred(run.invoke("active", "run_command", call.clone()).await);
    run.answer(wait, ApprovalDecision::ApproveOnce).await;
    let never = fixture.command(Path::new("/bin/bash"), "printf x > forbidden");
    let wait = deferred(
        run.invoke("not-dispatched", "run_command", never.clone())
            .await,
    );
    run.answer(wait, ApprovalDecision::ApproveOnce).await;
    let (operations, key, plan) = run.call("active", "run_command", call);
    let invocation = tokio::spawn(async move { operations.invoke(key, plan).await.unwrap() });
    tokio::time::timeout(TIMEOUT, async {
        while !fixture.additional.join("started").exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    run.permissions.revoke(&binding("additional")).unwrap();
    let result = completed(invocation.await.unwrap());
    assert!(
        matches!(
            result.status,
            OutcomeStatus::Cancelled | OutcomeStatus::Uncertain
        ),
        "{result:?}"
    );
    failed(
        run.invoke("not-dispatched", "run_command", never).await,
        "permission_revoked",
    );
    assert!(!fixture.additional.join("finished").exists());
    assert!(!fixture.additional.join("forbidden").exists());
    let cleanup = run
        .command
        .as_ref()
        .unwrap()
        .stop_and_wait(Instant::now() + TIMEOUT)
        .await;
    assert!(cleanup.pending.is_empty(), "{cleanup:?}");
    assert_eq!(
        result.structured.as_ref().unwrap()["cleanup_verified"],
        cleanup.is_verified()
    );
    if !cleanup.is_verified() {
        assert_eq!(result.status, OutcomeStatus::Uncertain);
        assert_eq!(cleanup.unverified.len(), 1);
    }
    assert_eq!(fs::read_dir(&fixture.temporary).unwrap().count(), 0);
}
