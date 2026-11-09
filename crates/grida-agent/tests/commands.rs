#![cfg(any(target_os = "macos", target_os = "linux"))]

// GRIDA-SEC-004: exercise the scoped command and its native cleanup barrier.
use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Inventory, InventorySnapshot, InvocationContext, InvocationRecovery, Tool,
};
use agent_kit_core::turn::{ControlDirective, EphemeralJournal, OperationInput, TurnBinding};
use agent_kit_core::{
    AttemptId, BindingId, BoxFuture, CancellationToken, ChangeId, GrantId, OperationId,
    PrincipalId, Result, ScopeId, SessionId, TurnId,
};
use agent_kit_runtime::{
    AdmissionContext, ExecutionLimits, ExecutionServices, InvokeOutcome, OperationKey,
    PlannedInvocation, Runtime, ToolAdmission, ToolDecision, ToolGate,
};
use agent_kit_sandbox::{
    DeniedAccess, ExecutionScope, Installation, ProtectedPath, Sandbox, Termination,
    TrustedExecutable,
};
use grida_agent::command::{CommandLimits, CommandTool};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tempfile::TempDir;

const WAIT: Duration = Duration::from_secs(8);

struct Fixture {
    _base: TempDir,
    workspace: PathBuf,
    temporary: PathBuf,
    sandbox: Arc<Sandbox>,
    scope: ExecutionScope,
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
            valid_until: Instant::now() + WAIT * 3,
            read: vec![workspace.clone()],
            write: vec![workspace.clone()],
            runtime,
            protected: vec![ProtectedPath {
                path: outside,
                access: DeniedAccess::ReadWrite,
            }],
            temporary_parent: temporary.clone(),
            termination: Termination::ProcessGroup,
        };
        Self {
            _base: base,
            workspace,
            temporary,
            sandbox,
            scope,
        }
    }

    fn tool(&self) -> Arc<CommandTool> {
        Arc::new(
            CommandTool::new(
                self.sandbox.clone(),
                self.scope.clone(),
                CommandLimits {
                    timeout: WAIT * 2,
                    max_input_bytes: 4096,
                    max_output_bytes: 4096,
                },
            )
            .unwrap(),
        )
    }

    fn arguments(&self, script: &str) -> ToolArguments {
        ToolArguments::Json(json!({
            "program": "/bin/bash",
            "args": ["-c", script],
            "cwd": self.workspace,
            "env": {"EXPLICIT": "fixture"},
            "stdin": "café\n"
        }))
    }
}

fn trusted(path: impl AsRef<Path>) -> TrustedExecutable {
    let path = path.as_ref().canonicalize().unwrap();
    TrustedExecutable {
        sha256: Sha256::digest(fs::read(&path).unwrap()).into(),
        path,
    }
}

fn inventory(tool: &Arc<CommandTool>) -> InventorySnapshot {
    let mut inventory = Inventory::new();
    inventory.insert(tool.clone()).unwrap();
    inventory
        .snapshot(std::slice::from_ref(&tool.definition().id))
        .unwrap()
}

fn context(attempt: AttemptId) -> InvocationContext {
    InvocationContext {
        attempt,
        cancellation: CancellationToken::new(),
        deadline: Some(Instant::now() + WAIT),
        max_output_bytes: 4096,
    }
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
async fn finite_command_preserves_native_result_and_reconciles_exact_attempt() {
    let fixture = Fixture::new();
    let tool = fixture.tool();
    let offered = inventory(&tool);
    let operation = OperationId::new("read-stdin").unwrap();
    let attempt = AttemptId::new("first-attempt").unwrap();
    let prepared = offered
        .prepare(
            operation.clone(),
            &tool.definition().id,
            fixture.arguments("printf '%s\\n' \"$EXPLICIT\"; /bin/cat; printf 'diagnostic\\n' >&2"),
        )
        .unwrap();
    let original = prepared.invocation().clone();
    let outcome = prepared.invoke(context(attempt.clone())).await;
    assert_eq!(outcome.status, OutcomeStatus::Succeeded, "{outcome:?}");
    assert_eq!(
        outcome.content,
        [
            ResultContent::Text("stdout:\nfixture\ncafé\n".into()),
            ResultContent::Text("stderr:\ndiagnostic\n".into())
        ]
    );
    assert_eq!(
        outcome.structured.as_ref().unwrap()["cleanup_verified"],
        true
    );
    assert!(outcome.receipt.is_some());
    assert!(fixture.temporary.read_dir().unwrap().next().is_none());
    let recovery = InvocationRecovery {
        invocation: original,
        checkpoint: None,
        receipts: vec![],
    };
    assert_eq!(
        tool.recover(recovery.clone(), context(attempt.clone()))
            .await,
        outcome
    );
    assert_eq!(
        tool.recover(
            recovery.clone(),
            context(AttemptId::new("another-attempt").unwrap())
        )
        .await
        .status,
        OutcomeStatus::Uncertain
    );
    let altered = offered
        .prepare(
            operation,
            &tool.definition().id,
            fixture.arguments("exit 12"),
        )
        .unwrap();
    assert_eq!(
        tool.recover(
            InvocationRecovery {
                invocation: altered.invocation().clone(),
                ..recovery.clone()
            },
            context(attempt.clone())
        )
        .await
        .status,
        OutcomeStatus::Uncertain
    );
    let fresh_scope = fixture.tool();
    assert_eq!(
        fresh_scope.recover(recovery, context(attempt)).await.status,
        OutcomeStatus::Uncertain
    );

    let outside = fixture.workspace.with_file_name("outside");
    for (id, cwd) in [
        ("existing-outside-scope", outside.clone()),
        ("missing-outside-scope", outside.join("missing")),
    ] {
        let ToolArguments::Json(mut arguments) = fixture.arguments("exit 0") else {
            unreachable!("fixture arguments are JSON")
        };
        arguments["cwd"] = json!(cwd);
        let refused = offered
            .prepare(
                OperationId::new(id).unwrap(),
                &tool.definition().id,
                ToolArguments::Json(arguments),
            )
            .unwrap()
            .invoke(context(AttemptId::new("refused-attempt").unwrap()))
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
async fn runtime_cancellation_leaves_native_cleanup_under_host_ownership() {
    let fixture = Fixture::new();
    let tool = fixture.tool();
    let runtime = Runtime::new(ExecutionServices {
        providers: Default::default(),
        tools: inventory(&tool),
        authority: Arc::new(FixtureAuthority),
        gate: Arc::new(FixtureAuthority),
        limits: ExecutionLimits {
            max_operations: 4,
            max_concurrent_inferences: 1,
            max_concurrent_tools: 1,
            max_output_bytes: 4096,
            operation_timeout: WAIT * 2,
            observer_capacity: 8,
        },
    })
    .unwrap();
    let ephemeral = EphemeralJournal::create(TurnBinding {
        session: SessionId::new("fixture-session").unwrap(),
        turn: TurnId::new("fixture-turn").unwrap(),
        epoch: 1,
    })
    .unwrap();
    let turn = runtime.open(ephemeral.lease).await.unwrap().turn;
    let operations = turn.operations();
    let key = OperationKey::new("owned-command").unwrap();
    let operation_id = operations.operation_id(&key).unwrap();
    let plan = PlannedInvocation {
        tool: tool.definition().id.clone(),
        arguments: fixture.arguments("printf started > started; exec /bin/sleep 12"),
        grants: fixture.scope.grants.clone(),
    };
    let invocation = tokio::spawn(async move { operations.invoke(key, plan).await });
    tokio::time::timeout(WAIT, async {
        while !fixture.workspace.join("started").is_file() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert!(fixture.temporary.read_dir().unwrap().next().is_some());
    ephemeral
        .control
        .change(
            ChangeId::new("stop-command").unwrap(),
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
        panic!("the command did not return a recorded disposition");
    };
    assert_eq!(outcome.status, OutcomeStatus::Uncertain);
    let view = turn.view();
    let operation = &view.state.operations()[&operation_id];
    let OperationInput::Tool(original) = &operation.record.input else {
        panic!("expected tool invocation")
    };
    let attempt = operation.attempts[0].id.clone();
    let cleanup = tool.stop_and_wait(Instant::now() + WAIT).await;
    assert!(cleanup.pending.is_empty(), "{cleanup:?}");
    #[cfg(target_os = "macos")]
    assert!(cleanup.is_verified(), "{cleanup:?}");
    assert!(fixture.temporary.read_dir().unwrap().next().is_none());
    let recovered = tool
        .recover(
            InvocationRecovery {
                invocation: original.clone(),
                checkpoint: None,
                receipts: vec![],
            },
            context(attempt),
        )
        .await;
    assert!(recovered.receipt.is_some());
    assert_eq!(
        recovered.structured.as_ref().unwrap()["temporary_removed"],
        true
    );
    assert_eq!(
        recovered.structured.as_ref().unwrap()["cleanup_verified"],
        cleanup.is_verified()
    );
    let later = inventory(&tool)
        .prepare(
            OperationId::new("later-command").unwrap(),
            &tool.definition().id,
            fixture.arguments("printf repeated > repeated"),
        )
        .unwrap();
    let refused = later
        .invoke(context(AttemptId::new("later-attempt").unwrap()))
        .await;
    assert_eq!(refused.status, OutcomeStatus::Failed);
    assert_eq!(
        refused.content,
        [ResultContent::Text("command_admission_closed".into())]
    );
    assert!(!fixture.workspace.join("repeated").exists());
}
