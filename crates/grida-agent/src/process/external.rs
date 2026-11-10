//! GRIDA-SEC-004 — trusted source-built launcher for one confined ACP turn.

use super::{MAX_RUN_TIMEOUT, STOP_TIMEOUT, read_prompt, settled_status, write_record};
use crate::acp::external::{ExternalAcpDriver, ExternalAcpLaunch, read_account};
use crate::host::change_id;
use crate::launch_permissions::{Executable, read_profile};
use crate::scratch::check_private_directory;
use crate::workspace::{DirectorySpec, ProtectedRoots, WorkspaceSnapshot, validate_absolute};
use agent_kit_core::authority::{
    AuthorityBinding, AuthorityRequest, AuthorityValidator, GrantSelection,
};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, Role};
use agent_kit_core::turn::{CommitReceipt, ControlDirective, TurnBinding};
use agent_kit_core::{
    BindingId, BoxFuture, Error, ErrorKind, GrantId, PrincipalId, Result, ScopeId, SessionId,
    TurnId,
};
use agent_kit_sandbox::{
    DeniedAccess, ExecutionScope, Installation, ProtectedPath, Sandbox, Termination,
};
use agent_kit_sessions::{
    ClaimOutcome, ClaimRequest, ClaimedTurn, ControlRequest, CreateSession, DriverOutcome,
    SessionControl, SessionStore, TurnDisposition, TurnDriver, TurnSelection,
};
use agent_kit_store_sqlite::SqliteStore;
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use uuid::Uuid;

pub struct RunOptions {
    pub state_directory: PathBuf,
    pub profile: PathBuf,
    pub prompt: Option<String>,
    pub timeout: Duration,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileFile {
    version: u32,
    cwd: PathBuf,
    executable: Executable,
    #[serde(default)]
    arguments: Vec<String>,
    helper: Executable,
    bubblewrap: Option<Executable>,
    runtime_paths: Vec<PathBuf>,
    temporary_parent: PathBuf,
    #[serde(default)]
    protected_paths: Vec<PathBuf>,
}

#[derive(Default)]
struct SelectedAuthority(OnceLock<AuthorityRequest>);

impl AuthorityValidator for SelectedAuthority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            if self.0.get() == Some(&request) {
                Ok(())
            } else {
                Err(problem(
                    ErrorKind::InvalidState,
                    "external_acp_grant_mismatch",
                ))
            }
        })
    }
}

struct Ready {
    store: SqliteStore,
    driver: ExternalAcpDriver,
    claim: ClaimedTurn,
}

/// Run one selected peer without opening the ordinary model host.
pub async fn run(options: RunOptions, signal: impl Future<Output = Result<()>>) -> Result<u8> {
    if options.timeout.is_zero() || options.timeout > MAX_RUN_TIMEOUT {
        return Err(problem(ErrorKind::InvalidInput, "invalid_run_deadline"));
    }
    let deadline = Instant::now() + options.timeout;
    tokio::pin!(signal);
    let Ready {
        store,
        driver,
        claim,
    } = tokio::select! {
        result = tokio::time::timeout_at(deadline.into(), admit(options, deadline)) => result
            .map_err(|_| problem(ErrorKind::Unavailable, "run_deadline_reached"))??,
        result = &mut signal => {
            result?;
            return Ok(130);
        }
    };
    let binding = claim.lease.binding().clone();
    let input = claim.inputs[0].id.clone();
    let mut record = json!({
        "schema_version": 1,
        "kind": "accepted",
        "session_id": binding.session,
        "turn_id": binding.turn,
        "input_id": input,
    });
    let accepted = write_record(&record).await;
    let mut completion = driver.run(claim);
    if let Err(error) = accepted {
        // The accepted claim exists even when its output pipe is gone. Stop
        // it before polling the driver, which keeps the peer from launching.
        let stopped = stop_and_wait(&store, &binding, completion).await?;
        finish(&store, &binding, stopped).await?;
        return Err(error);
    }
    let result = tokio::select! {
        result = &mut completion => result,
        result = &mut signal => {
            let outcome = stop_and_wait(&store, &binding, completion).await?;
            result?;
            outcome
        }
    };
    let (disposition, code, account, reason) = finish(&store, &binding, result).await?;
    record["kind"] = json!("finished");
    record["disposition"] = json!(disposition);
    record["account"] = account;
    if let Some(reason) = reason {
        record["reason"] = json!(reason);
    }
    write_record(&record).await?;
    Ok(code)
}

async fn admit(options: RunOptions, deadline: Instant) -> Result<Ready> {
    let prompt = match options.prompt {
        Some(prompt) => prompt,
        None => read_prompt().await?,
    };
    let input = ExternalAcpDriver::submission(change_id()?, &prompt)?;
    check_private_directory(&options.state_directory)?;
    let authority = Arc::new(SelectedAuthority::default());
    let driver = load_driver(
        &options.profile,
        &options.state_directory,
        authority.clone(),
        options.timeout,
        deadline,
    )?;
    let store = SqliteStore::open(options.state_directory.join("runtime.sqlite"))?;
    let session = SessionId::new(Uuid::new_v4().to_string())?;
    let turn = TurnId::new(Uuid::new_v4().to_string())?;
    authority
        .0
        .set(driver.authority_request(&session, &turn, &input)?)
        .map_err(|_| {
            problem(
                ErrorKind::InvalidState,
                "external_acp_grant_already_selected",
            )
        })?;
    store
        .create(CreateSession {
            id: session.clone(),
            request: change_id()?,
            configuration: driver.configuration(),
        })
        .await?;
    let input_id = input.id.clone();
    store.submit(session.clone(), input).await?;
    let view = store.inspect(session.clone()).await?;
    let ClaimOutcome::Acquired(claim) = store
        .claim(ClaimRequest {
            id: change_id()?,
            session,
            expected_revision: view.revision,
            selection: TurnSelection::New {
                turn,
                inputs: vec![input_id],
            },
        })
        .await?
    else {
        return Err(problem(
            ErrorKind::Conflict,
            "external_acp_claim_already_exists",
        ));
    };
    Ok(Ready {
        store,
        driver,
        claim,
    })
}

fn load_driver(
    path: &Path,
    state: &Path,
    authority: Arc<SelectedAuthority>,
    timeout: Duration,
    deadline: Instant,
) -> Result<ExternalAcpDriver> {
    let bytes = read_profile(path)?;
    let profile: ProfileFile = serde_json::from_slice(&bytes).map_err(|_| invalid_profile())?;
    if profile.version != 1
        || profile.arguments.len() > 64
        || profile.arguments.iter().map(String::len).sum::<usize>() > 8 * 1024
        || profile.arguments.iter().any(|arg| arg.contains('\0'))
        || profile.runtime_paths.len() > 32
        || profile.protected_paths.len() > 32
        || cfg!(target_os = "linux") != profile.bubblewrap.is_some()
    {
        return Err(invalid_profile());
    }
    for path in &profile.runtime_paths {
        validate_absolute(path)?;
    }
    check_private_directory(&profile.temporary_parent)?;
    let mut protected = profile.protected_paths;
    protected.extend([path.to_owned(), state.to_owned()]);
    if let Some(home) = std::env::var_os("GRIDA_HOME").filter(|path| !path.is_empty()) {
        protected.push(PathBuf::from(home));
    }
    if let Some(home) = std::env::home_dir() {
        protected.push(home.join(".grida"));
    }
    let roots = ProtectedRoots::new(protected.clone())?;
    let selected = format!(
        "external-acp:{}",
        URL_SAFE_NO_PAD.encode(Sha256::digest(&bytes))
    );
    let revision = BindingId::new(&selected)?;
    let id = BindingId::new("primary")?;
    let workspace = WorkspaceSnapshot::capture(
        revision.clone(),
        0,
        vec![DirectorySpec {
            id: id.clone(),
            name: "Primary".into(),
            path: profile.cwd.clone(),
            generation: revision.clone(),
        }],
        Some(id),
        &roots,
    )?;
    let directory = workspace.permission_directory(None, &roots)?;
    if directory.root() != profile.cwd {
        return Err(invalid_profile());
    }
    let sandbox = Sandbox::new(Installation {
        helper: profile.helper.into(),
        bubblewrap: profile.bubblewrap.map(Into::into),
    })?;
    ExternalAcpDriver::for_directory(
        Arc::new(sandbox),
        ExternalAcpLaunch {
            executable: profile.executable.into(),
            arguments: profile.arguments,
            cwd: profile.cwd.clone(),
            scope: ExecutionScope {
                grants: GrantSelection {
                    authority: AuthorityBinding {
                        principal: PrincipalId::new("trusted-local-launcher")?,
                        binding: revision.clone(),
                        scope: ScopeId::new(selected)?,
                    },
                    grants: vec![GrantId::new("external-acp-read")?],
                },
                revision,
                valid_until: deadline,
                read: vec![profile.cwd],
                write: vec![],
                runtime: profile.runtime_paths,
                protected: protected
                    .into_iter()
                    .map(|path| ProtectedPath {
                        path,
                        access: DeniedAccess::ReadWrite,
                    })
                    .collect(),
                temporary_parent: profile.temporary_parent,
                termination: if cfg!(target_os = "linux") {
                    Termination::AllDescendants
                } else {
                    Termination::ProcessGroup
                },
            },
            timeout,
        },
        authority,
        directory.pinned_directory(),
    )
}

async fn stop_and_wait(
    store: &SqliteStore,
    binding: &TurnBinding,
    completion: impl Future<Output = Result<DriverOutcome>>,
) -> Result<Result<DriverOutcome>> {
    tokio::time::timeout(STOP_TIMEOUT, async {
        let view = store.inspect(binding.session.clone()).await?;
        if let Some(active) = view.current.filter(|turn| turn.binding == *binding) {
            let result = store
                .control(ControlRequest {
                    id: change_id()?,
                    session: binding.session.clone(),
                    expected_revision: view.revision,
                    action: SessionControl::Turn {
                        turn: binding.turn.clone(),
                        expected: active.controls.revision,
                        directive: ControlDirective::Cancel,
                    },
                })
                .await;
            if let Err(error) = result
                && store
                    .inspect_turn(binding.session.clone(), binding.turn.clone())
                    .await?
                    .disposition
                    != TurnDisposition::Settled
            {
                return Err(error);
            }
        }
        Ok(completion.await)
    })
    .await
    .map_err(|_| problem(ErrorKind::Uncertain, "run_stop_unverified"))?
}

async fn finish(
    store: &SqliteStore,
    binding: &TurnBinding,
    result: Result<DriverOutcome>,
) -> Result<(&'static str, u8, Value, Option<String>)> {
    match result {
        Ok(DriverOutcome::Settled(receipt)) => {
            let outcome = receipt.outcome.clone();
            verify(store, binding, CommitReceipt::Settled(receipt)).await?;
            let (disposition, code) = settled_status(outcome.status);
            let mut account = outcome
                .account
                .as_ref()
                .map(read_account)
                .transpose()?
                .unwrap_or(Value::Null);
            if let Some(object) = account.as_object_mut() {
                let text = store
                    .inspect_turn_with(binding.session.clone(), binding.turn.clone(), |state| {
                        Ok(state.history().records().iter().rev().find_map(|record| {
                            let HistoryRecord::Message(message) = record;
                            match (message.role, message.content.as_slice()) {
                                (Role::Assistant, [Content::Text(text)]) => Some(text.clone()),
                                _ => None,
                            }
                        }))
                    })
                    .await?;
                object.insert("text".into(), json!(text));
            }
            Ok((disposition, code, account, None))
        }
        Ok(DriverOutcome::Suspended(receipt)) => {
            verify(store, binding, CommitReceipt::Suspended(receipt)).await?;
            Ok(("suspended", 4, Value::Null, None))
        }
        Err(error) if error.kind == ErrorKind::Uncertain => {
            Ok(("uncertain", 5, Value::Null, Some(error.code)))
        }
        Err(error) => Err(error),
    }
}

async fn verify(store: &SqliteStore, binding: &TurnBinding, receipt: CommitReceipt) -> Result<()> {
    if receipt.record().binding != *binding {
        return Err(problem(
            ErrorKind::Conflict,
            "driver_receipt_binding_mismatch",
        ));
    }
    store.verify(receipt).await
}

fn invalid_profile() -> Error {
    problem(ErrorKind::InvalidInput, "external_acp_profile_invalid")
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}
