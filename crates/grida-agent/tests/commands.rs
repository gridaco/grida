#![cfg(any(target_os = "macos", target_os = "linux"))]

// GRIDA-SEC-004: chat processes under the native sandbox, outliving the call
// and the turn that started them.
use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Inventory, InventorySnapshot, InvocationContext, InvocationRecovery, ToolOutcome,
};
use agent_kit_core::turn::{ControlDirective, EphemeralJournal, TurnBinding};
use agent_kit_core::{
    AttemptId, BindingId, BoxFuture, CancellationToken, ChangeId, GrantId, OperationId,
    PrincipalId, Result, ScopeId, SessionId, ToolId, TurnId,
};
use agent_kit_runtime::{
    AdmissionContext, ExecutionLimits, ExecutionServices, InvokeOutcome, OperationKey,
    PlannedInvocation, Runtime, ToolAdmission, ToolDecision, ToolGate,
};
use agent_kit_sandbox::{
    DeniedAccess, ExecutionScope, Installation, ProtectedPath, Sandbox, Termination,
    TrustedExecutable,
};
use grida_agent::command::CommandLimits;
use grida_agent::processes::{ProcessSessions, ProcessState, ProcessTools};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tempfile::TempDir;

const WAIT: Duration = Duration::from_secs(12);

struct Fixture {
    _base: TempDir,
    workspace: PathBuf,
    temporary: PathBuf,
    sandbox: Arc<Sandbox>,
    scope: ExecutionScope,
    sessions: Arc<ProcessSessions>,
}

impl Fixture {
    fn new() -> Self {
        let base = tempfile::tempdir().unwrap();
        let base_path = base.path().canonicalize().unwrap();
        let workspace = base_path.join("workspace");
        let temporary = base_path.join("temporary");
        let outside = base_path.join("outside");
        for path in [&workspace, &temporary, &outside] {
            fs::create_dir(path).unwrap();
            fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
        }
        let helper =
            trusted(std::env::var_os("GRIDA_AGENT_TEST_SANDBOX_HELPER").expect(
                "set GRIDA_AGENT_TEST_SANDBOX_HELPER to the built agent-kit-sandbox-helper",
            ));
        #[cfg(target_os = "macos")]
        let bubblewrap = None;
        #[cfg(target_os = "linux")]
        let bubblewrap = Some(trusted(
            std::env::var_os("AGENT_KIT_TEST_BWRAP")
                .expect("set AGENT_KIT_TEST_BWRAP to a trusted non-setuid bwrap binary"),
        ));
        let sandbox = Arc::new(Sandbox::new(Installation { helper, bubblewrap }).unwrap());
        let runtime = [
            "/bin",
            "/usr/bin",
            "/usr/lib",
            "/usr/lib64",
            "/lib",
            "/lib64",
            "/System/Library",
            // macOS /bin/sh reads its selected shell here.
            "/private/var/select",
        ]
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .collect();
        let scope = ExecutionScope {
            grants: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("fixture-principal").unwrap(),
                    binding: BindingId::new("fixture-binding").unwrap(),
                    scope: ScopeId::new("fixture-workspace").unwrap(),
                },
                grants: vec![GrantId::new("fixture-command").unwrap()],
            },
            revision: BindingId::new("fixture-scope-revision").unwrap(),
            valid_until: Instant::now() + WAIT * 5,
            read: vec![workspace.clone()],
            write: vec![workspace.clone()],
            runtime,
            protected: vec![ProtectedPath {
                path: outside,
                access: DeniedAccess::ReadWrite,
            }],
            temporary_parent: temporary.clone(),
            termination: Termination::ProcessGroup,
            disk_read: false,
        };
        Self {
            _base: base,
            workspace,
            temporary,
            sandbox,
            scope,
            sessions: Arc::new(ProcessSessions::new()),
        }
    }

    /// One claim's tools for a chat, over the fixture's store.
    fn chat(&self, chat: &str) -> Chat {
        self.chat_in(chat, self.sessions.clone())
    }

    fn chat_in(&self, chat: &str, sessions: Arc<ProcessSessions>) -> Chat {
        let tools = ProcessTools::new(
            self.sandbox.clone(),
            self.scope.clone(),
            self.workspace.clone(),
            BTreeMap::from([("EXPLICIT".to_owned(), "fixture".to_owned())]),
            CommandLimits {
                timeout: WAIT,
                max_input_bytes: 4096,
                max_output_bytes: 16 * 1024,
            },
            sessions,
            session(chat),
        )
        .unwrap();
        let mut inventory = Inventory::new();
        for tool in tools.tools() {
            inventory.insert(tool).unwrap();
        }
        Chat {
            offered: inventory
                .snapshot(&[tool_id("exec_command"), tool_id("write_stdin")])
                .unwrap(),
            _tools: tools,
            next: 0,
        }
    }

    fn temporary_is_empty(&self) -> bool {
        self.temporary.read_dir().unwrap().next().is_none()
    }
}

struct Chat {
    offered: InventorySnapshot,
    _tools: ProcessTools,
    next: u32,
}

impl Chat {
    async fn call(&mut self, tool: &str, arguments: Value) -> ToolOutcome {
        self.call_with(tool, arguments, context(CancellationToken::new()))
            .await
    }

    async fn call_with(
        &mut self,
        tool: &str,
        arguments: Value,
        context: InvocationContext,
    ) -> ToolOutcome {
        self.next += 1;
        self.offered
            .prepare(
                OperationId::new(format!("call-{}", self.next)).unwrap(),
                &tool_id(tool),
                ToolArguments::Json(arguments),
            )
            .unwrap()
            .invoke(context)
            .await
    }

    /// Poll a process until its end is reported.
    async fn until_ended(&mut self, id: u64) -> String {
        tokio::time::timeout(WAIT, async {
            loop {
                let polled = self
                    .call(
                        "write_stdin",
                        json!({"session_id": id, "yield_time_ms": 5000}),
                    )
                    .await;
                let reported = text(&polled);
                if !reported.contains("Process running with session ID") {
                    return reported;
                }
            }
        })
        .await
        .unwrap()
    }
}

fn trusted(path: impl AsRef<Path>) -> TrustedExecutable {
    let path = path.as_ref().canonicalize().unwrap();
    TrustedExecutable {
        sha256: Sha256::digest(fs::read(&path).unwrap()).into(),
        path,
    }
}

fn tool_id(id: &str) -> ToolId {
    ToolId::new(id).unwrap()
}

fn session(id: &str) -> SessionId {
    SessionId::new(id).unwrap()
}

fn context(cancellation: CancellationToken) -> InvocationContext {
    InvocationContext {
        attempt: AttemptId::new("attempt").unwrap(),
        cancellation,
        deadline: Some(Instant::now() + WAIT),
        max_output_bytes: 16 * 1024,
    }
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

/// The number a still-running process was given.
fn running_id(outcome: &ToolOutcome) -> u64 {
    let reported = text(outcome);
    reported
        .lines()
        .find_map(|line| line.strip_prefix("Process running with session ID "))
        .unwrap_or_else(|| panic!("expected a running process: {reported}"))
        .parse()
        .unwrap()
}

fn output(reported: &str) -> &str {
    reported.split_once("\nOutput:\n").unwrap().1
}

#[tokio::test]
#[ignore = "requires a native sandbox outside the test runner's confinement"]
async fn a_command_that_ends_within_its_wait_reports_its_exit_without_a_session() {
    let fixture = Fixture::new();
    let mut chat = fixture.chat("ends");
    let operation = OperationId::new("finished").unwrap();
    let prepared = chat
        .offered
        .prepare(
            operation.clone(),
            &tool_id("exec_command"),
            ToolArguments::Json(json!({
                "cmd": "printf '%s\\n' \"$EXPLICIT\"; printf 'diagnostic\\n' >&2; exit 3",
            })),
        )
        .unwrap();
    let original = prepared.invocation().clone();
    let outcome = prepared.invoke(context(CancellationToken::new())).await;
    let reported = text(&outcome);
    assert_eq!(outcome.status, OutcomeStatus::Failed, "{reported}");
    assert!(
        reported.starts_with("Wall time: ") && reported.contains("\nProcess exited with code 3\n"),
        "{reported}"
    );
    assert!(!reported.contains("session ID"), "{reported}");
    // Pipes merge stdout and stderr.
    assert_eq!(output(&reported), "fixture\ndiagnostic\n");
    let details: Value = serde_json::from_slice(outcome.receipt.as_ref().unwrap().bytes()).unwrap();
    assert_eq!(details["cleanup_verified"], true, "{details}");
    assert!(fixture.sessions.list(&session("ends")).is_empty());
    assert!(fixture.temporary_is_empty());

    // The same claim reconciles its own attempt; any other is uncertain.
    let recovery = InvocationRecovery {
        invocation: original,
        checkpoint: None,
        receipts: vec![],
    };
    let tools = chat.offered.clone();
    let recover = |attempt: &str| {
        let tools = tools.clone();
        let recovery = recovery.clone();
        let mut context = context(CancellationToken::new());
        context.attempt = AttemptId::new(attempt).unwrap();
        async move {
            tools
                .prepare(
                    recovery.invocation.id().clone(),
                    &tool_id("exec_command"),
                    recovery.invocation.arguments().clone(),
                )
                .unwrap()
                .recover(recovery, context)
                .await
        }
    };
    assert_eq!(recover("attempt").await, outcome);
    assert_eq!(
        recover("another-attempt").await.status,
        OutcomeStatus::Uncertain
    );
    assert_eq!(
        fixture
            .chat("ends")
            .offered
            .prepare(
                operation,
                &tool_id("exec_command"),
                recovery.invocation.arguments().clone(),
            )
            .unwrap()
            .recover(recovery.clone(), context(CancellationToken::new()))
            .await
            .status,
        OutcomeStatus::Uncertain
    );

    let outside = fixture.workspace.with_file_name("outside");
    for workdir in [outside.clone(), outside.join("missing")] {
        let refused = chat
            .call("exec_command", json!({"cmd": "true", "workdir": workdir}))
            .await;
        assert_eq!(refused.status, OutcomeStatus::Failed);
        assert_eq!(
            refused.content,
            [ResultContent::Text("command_preparation_refused".into())]
        );
    }
}

#[tokio::test]
#[ignore = "requires a native sandbox outside the test runner's confinement"]
async fn a_long_command_keeps_running_as_a_numbered_process_until_its_end_is_read() {
    let fixture = Fixture::new();
    let mut chat = fixture.chat("long");
    let started = chat
        .call(
            "exec_command",
            json!({"cmd": "printf a; sleep 0.3; printf b; sleep 1.5; printf done", "yield_time_ms": 1000}),
        )
        .await;
    assert_eq!(started.status, OutcomeStatus::Succeeded, "{started:?}");
    let id = running_id(&started);
    // The wait collects everything that arrives before it ends.
    assert_eq!(output(&text(&started)), "ab");
    let listed = fixture.sessions.list(&session("long"));
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].process_id, id);
    assert_eq!(listed[0].state, ProcessState::Running);
    assert_eq!(listed[0].exit_code, None);
    assert_eq!(listed[0].cwd, fixture.workspace);
    assert!(!listed[0].terminal);
    assert!(listed[0].command.starts_with("printf a;"));

    let ended = chat.until_ended(id).await;
    assert!(ended.contains("\nProcess exited with code 0\n"), "{ended}");
    assert!(ended.ends_with("done"), "{ended}");
    // The end is reported once; the number is then unknown.
    assert!(fixture.sessions.list(&session("long")).is_empty());
    let gone = chat.call("write_stdin", json!({"session_id": id})).await;
    assert_eq!(gone.status, OutcomeStatus::Failed);
    assert_eq!(
        text(&gone),
        format!("unknown session id {id} (it may have ended or been stopped)")
    );
    assert!(fixture.temporary_is_empty());
}

#[tokio::test]
#[ignore = "requires a native sandbox outside the test runner's confinement"]
async fn terminal_sessions_take_input_and_pipe_sessions_take_only_interrupts() {
    let fixture = Fixture::new();
    let mut chat = fixture.chat("input");
    let terminal = chat
        .call(
            "exec_command",
            json!({"cmd": "read line; printf 'got:%s\\n' \"$line\"", "tty": true, "yield_time_ms": 500}),
        )
        .await;
    let id = running_id(&terminal);
    assert!(fixture.sessions.list(&session("input"))[0].terminal);
    let answered = chat
        .call(
            "write_stdin",
            json!({"session_id": id, "chars": "hello\n", "yield_time_ms": 2000}),
        )
        .await;
    let mut reported = text(&answered);
    if reported.contains("Process running with session ID") {
        reported.push_str(&chat.until_ended(id).await);
    }
    assert!(reported.contains("got:hello"), "{reported}");
    assert!(
        reported.contains("Process exited with code 0"),
        "{reported}"
    );

    let pipe = chat
        .call(
            "exec_command",
            json!({"cmd": "exec /bin/sleep 30", "yield_time_ms": 250}),
        )
        .await;
    let id = running_id(&pipe);
    let refused = chat
        .call("write_stdin", json!({"session_id": id, "chars": "x"}))
        .await;
    assert_eq!(refused.status, OutcomeStatus::Failed);
    assert_eq!(
        text(&refused),
        "stdin is closed for this session; rerun with tty=true"
    );
    let interrupted = chat
        .call(
            "write_stdin",
            json!({"session_id": id, "chars": "\u{3}", "yield_time_ms": 3000}),
        )
        .await;
    let mut reported = text(&interrupted);
    if reported.contains("Process running with session ID") {
        reported = chat.until_ended(id).await;
    }
    assert!(
        reported.contains("\nProcess terminated by signal 2\n"),
        "{reported}"
    );
    assert!(!reported.contains("exited with code"), "{reported}");
    assert!(fixture.sessions.list(&session("input")).is_empty());
    fixture
        .sessions
        .shutdown(Instant::now() + WAIT)
        .await
        .unwrap();
    assert!(fixture.temporary_is_empty());
}

#[tokio::test]
#[ignore = "requires a native sandbox outside the test runner's confinement"]
async fn processes_belong_to_their_chat_and_numbers_are_never_reused() {
    let fixture = Fixture::new();
    let long = json!({"cmd": "exec /bin/sleep 30", "yield_time_ms": 250});
    let first = {
        let mut claim = fixture.chat("owner");
        running_id(&claim.call("exec_command", long.clone()).await)
    };
    assert_eq!(first, 1);
    // A later claim of the same chat reaches it; another chat does not.
    let mut owner = fixture.chat("owner");
    let polled = owner
        .call(
            "write_stdin",
            json!({"session_id": first, "yield_time_ms": 250}),
        )
        .await;
    assert_eq!(running_id(&polled), first);
    let mut other = fixture.chat("other");
    let foreign = other
        .call("write_stdin", json!({"session_id": first}))
        .await;
    assert_eq!(foreign.status, OutcomeStatus::Failed);
    assert_eq!(
        running_id(&other.call("exec_command", long.clone()).await),
        1
    );

    // A wait cut short by cancellation keeps the process.
    let cancellation = CancellationToken::new();
    let cancel = cancellation.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(300)).await;
        cancel.cancel();
    });
    let cut = owner
        .call_with(
            "exec_command",
            json!({"cmd": "exec /bin/sleep 30", "yield_time_ms": 30000}),
            context(cancellation),
        )
        .await;
    assert_eq!(cut.status, OutcomeStatus::Cancelled, "{cut:?}");
    let second = running_id(&cut);
    assert_eq!(second, 2);

    // A stopped process reports its stop once; its number is not reused.
    assert_eq!(
        fixture
            .sessions
            .stop(&session("owner"), Some(&[second]), Instant::now() + WAIT)
            .await,
        [second]
    );
    let listed = fixture.sessions.list(&session("owner"));
    assert_eq!(
        listed
            .iter()
            .map(|entry| (entry.process_id, entry.state, entry.exit_code))
            .collect::<Vec<_>>(),
        [
            (first, ProcessState::Running, None),
            (second, ProcessState::Ended, None)
        ]
    );
    let stopped = owner.until_ended(second).await;
    assert!(stopped.contains("\nProcess stopped\n"), "{stopped}");
    assert_eq!(
        running_id(&owner.call("exec_command", long.clone()).await),
        3
    );
    // A new store in the same process continues the chat's numbering.
    let restarted = Arc::new(ProcessSessions::new());
    let mut later = fixture.chat_in("owner", restarted.clone());
    assert_eq!(
        running_id(&later.call("exec_command", long.clone()).await),
        4
    );

    // Shutdown stops every process and confirms its cleanup.
    for store in [&fixture.sessions, &restarted] {
        store.shutdown(Instant::now() + WAIT).await.unwrap();
    }
    for chat in ["owner", "other"] {
        assert!(
            fixture
                .sessions
                .list(&session(chat))
                .iter()
                .all(|entry| entry.state == ProcessState::Ended)
        );
    }
    let refused = owner.call("exec_command", long).await;
    assert_eq!(
        refused.content,
        [ResultContent::Text("process_sessions_closed".into())]
    );
    assert!(fixture.temporary_is_empty());
}

struct FixtureAuthority;
impl AuthorityValidator for FixtureAuthority {
    fn validate(&self, _: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async { Ok(()) })
    }
}
impl ToolGate for FixtureAuthority {
    fn decide(&self, _: ToolAdmission, _: AdmissionContext) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async { Ok(ToolDecision::Permit) })
    }
}

#[tokio::test]
#[ignore = "requires a native sandbox outside the test runner's confinement"]
async fn cancelling_the_turn_leaves_the_process_with_the_chat() {
    let fixture = Fixture::new();
    let chat = fixture.chat("turns");
    let runtime = Runtime::new(ExecutionServices {
        providers: Default::default(),
        tools: chat.offered.clone(),
        authority: Arc::new(FixtureAuthority),
        gate: Arc::new(FixtureAuthority),
        limits: ExecutionLimits {
            max_operations: 4,
            max_concurrent_inferences: 1,
            max_concurrent_tools: 1,
            max_output_bytes: 16 * 1024,
            operation_timeout: WAIT,
            observer_capacity: 8,
        },
    })
    .unwrap();
    let ephemeral = EphemeralJournal::create(TurnBinding {
        session: session("turns"),
        turn: TurnId::new("first-turn").unwrap(),
        epoch: 1,
    })
    .unwrap();
    let turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let operations = turn.operations();
    let plan = PlannedInvocation {
        tool: tool_id("exec_command"),
        arguments: ToolArguments::Json(json!({
            "cmd": "printf started > started; exec /bin/sleep 30", "yield_time_ms": 30000,
        })),
        grants: fixture.scope.grants.clone(),
    };
    let key = OperationKey::new("owned-process").unwrap();
    let invocation = tokio::spawn(async move { operations.invoke(key, plan).await });
    tokio::time::timeout(WAIT, async {
        while !fixture.workspace.join("started").is_file() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    ephemeral
        .control
        .change(
            ChangeId::new("stop-turn").unwrap(),
            turn.view().state.controls().revision,
            ControlDirective::Cancel,
        )
        .await
        .unwrap();
    let InvokeOutcome::Complete(outcome) = tokio::time::timeout(WAIT, invocation)
        .await
        .unwrap()
        .unwrap()
        .unwrap()
    else {
        panic!("the call did not return a recorded disposition");
    };
    assert_eq!(outcome.status, OutcomeStatus::Cancelled, "{outcome:?}");
    let id = running_id(&outcome);
    drop(turn);
    drop(chat);
    // The next turn's claim polls the same process.
    let mut next = fixture.chat("turns");
    let polled = next
        .call(
            "write_stdin",
            json!({"session_id": id, "yield_time_ms": 250}),
        )
        .await;
    assert_eq!(running_id(&polled), id);
    assert_eq!(
        fixture
            .sessions
            .stop(&session("turns"), None, Instant::now() + WAIT)
            .await,
        [id]
    );
    fixture
        .sessions
        .shutdown(Instant::now() + WAIT)
        .await
        .unwrap();
    assert!(fixture.temporary_is_empty());
}
