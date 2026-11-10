//! Scoped finite commands and host-owned process cleanup.

use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::{
    AttemptId, BindingId, BoxFuture, CancellationToken, Envelope, Error, ErrorKind, Fingerprint,
    OperationId, Result, SchemaId, ToolId,
};
use agent_kit_sandbox::{
    Backend, Completion, Descendants, ExecutionScope, PreparedProcess, ProcessEvidence,
    ProcessSpec, RunningProcess, Sandbox, StopReason, Termination, TrustedExecutable,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{Notify, oneshot};

const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const MAX_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_ACTIVE: usize = 4;
const MAX_RETAINED: usize = 16;

#[derive(Clone, Copy, Debug)]
pub struct CommandLimits {
    pub timeout: Duration,
    pub max_input_bytes: usize,
    pub max_output_bytes: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandIdentity {
    pub operation: OperationId,
    pub attempt: AttemptId,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct CommandQuiescence {
    /// Supervisors still preparing, running, or cleaning up.
    pub pending: Vec<CommandIdentity>,
    /// Completed supervisors whose native cleanup evidence is incomplete.
    pub unverified: Vec<CommandIdentity>,
}

impl CommandQuiescence {
    pub fn is_verified(&self) -> bool {
        self.pending.is_empty() && self.unverified.is_empty()
    }
}

/// A host-owned finite command supervisor.
///
/// Keep this handle and its Tokio runtime alive through `stop_and_wait` before
/// releasing resources that depend on native cleanup. The runtime can settle an invocation as uncertain
/// before the supervisor finishes. Recovery reads bounded same-process evidence.
/// The runtime's durable journal owns dispatch deduplication across restarts.
// GRIDA-SEC-004: finite command authority and cleanup stay with the host.
pub struct CommandTool {
    sandbox: Arc<Sandbox>,
    scope: CommandScope,
    timeout: Duration,
    definition: ToolDefinition,
    activity: Arc<Activity>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandAccess {
    Read,
    ReadWrite,
}

type ResolveCommand = dyn Fn(&Invocation) -> Result<AuthorizedCommand> + Send + Sync;
pub(crate) type SpawnCommand =
    dyn Fn(PreparedProcess, CancellationToken) -> Result<RunningProcess> + Send + Sync;

enum CommandScope {
    Fixed(Box<ExecutionScope>),
    Authorized(Arc<ResolveCommand>),
}

pub(crate) struct AuthorizedCommand {
    pub scope: ExecutionScope,
    pub expected: Fingerprint,
    pub spawn: Arc<SpawnCommand>,
}

pub(crate) struct ReviewedCommand {
    pub spec: ProcessSpec,
    pub scope: ExecutionScope,
    pub executable: TrustedExecutable,
    pub spawn: Arc<SpawnCommand>,
}

enum ProcessAdmission {
    Fixed,
    Captured(Fingerprint, Arc<SpawnCommand>),
    Reviewed(TrustedExecutable, Arc<SpawnCommand>),
}

impl CommandTool {
    /// Create an adapter for a host-authorized scope. The host must probe
    /// native support for that scope before offering the tool.
    pub fn new(
        sandbox: Arc<Sandbox>,
        scope: ExecutionScope,
        limits: CommandLimits,
    ) -> Result<Self> {
        Self::with_scope(sandbox, CommandScope::Fixed(Box::new(scope)), limits)
    }

    pub(crate) fn authorized(
        sandbox: Arc<Sandbox>,
        limits: CommandLimits,
        resolve: Arc<ResolveCommand>,
    ) -> Result<Self> {
        Self::with_scope(sandbox, CommandScope::Authorized(resolve), limits)
    }

    fn with_scope(
        sandbox: Arc<Sandbox>,
        scope: CommandScope,
        limits: CommandLimits,
    ) -> Result<Self> {
        if limits.timeout.is_zero()
            || limits.timeout > MAX_TIMEOUT
            || !(1..=MAX_INPUT_BYTES).contains(&limits.max_input_bytes)
            || !(1..=MAX_OUTPUT_BYTES).contains(&limits.max_output_bytes)
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_command_limits",
            ));
        }
        let scoped = matches!(scope, CommandScope::Authorized(_));
        let mut schema = json!({
            "type": "object",
            "properties": {
                "program": {"type": "string"},
                "args": {"type": "array", "items": {"type": "string"}},
                "cwd": {"type": "string"},
                "env": {"type": "object", "additionalProperties": {"type": "string"}},
                "stdin": {"type": "string"}
            },
            "required": ["program", "args", "cwd"],
            "additionalProperties": false
        });
        let mut description = "Run one finite program in the granted workspace or scratch scope. Supply an absolute program path, argument array, and absolute working directory. The program receives explicit environment values, sandbox-owned temporary directory variables, and a bounded UTF-8 stdin string. Network access is denied. Output is bounded UTF-8 text with replacement characters for invalid bytes. Use an explicit interpreter when shell syntax is required.".to_owned();
        if scoped {
            schema["properties"]["directory"] = json!({"type":"string"});
            schema["properties"]["access"] = json!({"enum":["read","read_write"]});
            schema["required"] = json!(["program", "args", "cwd", "access"]);
            description.push_str(" Select read or read_write access explicitly. Use a named directory ID or omit it for the captured primary. The working directory must be inside that directory.");
        }
        Ok(Self {
            sandbox,
            scope,
            timeout: limits.timeout,
            definition: ToolDefinition {
                id: ToolId::new("run_command")?,
                version: if scoped { 2 } else { 1 },
                description,
                input: InputFormat::Json(schema),
                max_input_bytes: limits.max_input_bytes,
                max_output_bytes: limits.max_output_bytes,
                recovery: RecoveryKind::Reconcile,
            },
            activity: Arc::default(),
        })
    }

    pub(crate) async fn invoke_reviewed(
        &self,
        invocation: &Invocation,
        context: InvocationContext,
        command: ReviewedCommand,
        project: fn(ProcessEvidence, usize) -> (ToolOutcome, bool),
    ) -> ToolOutcome {
        self.run_process(
            invocation,
            context,
            command.scope,
            command.spec,
            ProcessAdmission::Reviewed(command.executable, command.spawn),
            project,
        )
        .await
    }

    async fn run_process(
        &self,
        invocation: &Invocation,
        context: InvocationContext,
        mut scope: ExecutionScope,
        spec: ProcessSpec,
        admission: ProcessAdmission,
        project: fn(ProcessEvidence, usize) -> (ToolOutcome, bool),
    ) -> ToolOutcome {
        let now = Instant::now();
        scope.valid_until = scope.valid_until.min(now + spec.timeout);
        if let Some(deadline) = context.deadline {
            scope.valid_until = scope.valid_until.min(deadline);
        }
        if context.cancellation.is_cancelled() || scope.valid_until <= now {
            return cancelled_before_launch();
        }
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return ToolOutcome::failed("command_runtime_unavailable");
        };
        let cancellation = context.cancellation.child_token();
        let _request_stop_on_drop = cancellation.clone().drop_guard();
        let identity = CommandIdentity {
            operation: invocation.id().clone(),
            attempt: context.attempt,
        };
        if let Err(error) = self.activity.register(
            identity.clone(),
            invocation.fingerprint(),
            cancellation.clone(),
        ) {
            return ToolOutcome::failed(&error.code);
        }
        let (send, receive) = oneshot::channel();
        let sandbox = Arc::clone(&self.sandbox);
        let activity = Arc::clone(&self.activity);
        runtime.spawn(async move {
            let (outcome, verified) =
                execute(sandbox, spec, scope, admission, cancellation, project).await;
            activity.finish(&identity.operation, outcome.clone(), verified);
            let _ = send.send(outcome);
        });
        receive.await.unwrap_or_else(|_| ToolOutcome::uncertain())
    }

    /// Close this scope's command admission, request stop, and await cleanup.
    ///
    /// A deadline leaves the supervisors owned by this capability. A later
    /// call can wait again. Unverified evidence stays visible after completion.
    /// Verification follows the scope's declared backend guarantee.
    pub async fn stop_and_wait(&self, deadline: Instant) -> CommandQuiescence {
        self.activity.close();
        loop {
            // notify_waiters wakes a Notified created before the state check.
            let changed = self.activity.changed.notified();
            let state = self.activity.quiescence();
            if state.pending.is_empty() {
                return state;
            }
            if tokio::time::timeout_at(deadline.into(), changed)
                .await
                .is_err()
            {
                return self.activity.quiescence();
            }
        }
    }
}

impl Drop for CommandTool {
    fn drop(&mut self) {
        self.activity.close();
    }
}

impl Tool for CommandTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        CommandArguments::parse(
            arguments,
            self.definition.max_input_bytes,
            matches!(self.scope, CommandScope::Authorized(_)),
        )
        .map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            if invocation.definition() != &self.definition {
                return ToolOutcome::failed("command_definition_changed");
            }
            let arguments = match CommandArguments::parse(
                invocation.arguments(),
                self.definition.max_input_bytes,
                matches!(self.scope, CommandScope::Authorized(_)),
            ) {
                Ok(arguments) => arguments,
                Err(error) => return ToolOutcome::failed(&error.code),
            };
            let maximum = context
                .max_output_bytes
                .min(self.definition.max_output_bytes);
            if maximum == 0 {
                return ToolOutcome::failed("command_output_limit_unavailable");
            }
            let (scope, admission) = match &self.scope {
                CommandScope::Fixed(scope) => ((**scope).clone(), ProcessAdmission::Fixed),
                CommandScope::Authorized(resolve) => match resolve(&invocation) {
                    Ok(authority) => (
                        authority.scope,
                        ProcessAdmission::Captured(authority.expected, authority.spawn),
                    ),
                    Err(error) => return ToolOutcome::failed(&error.code),
                },
            };
            let spec = arguments.into_spec(self.timeout, maximum);
            self.run_process(
                &invocation,
                context,
                scope,
                spec,
                admission,
                project_command,
            )
            .await
        })
    }

    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let outcome = self
                .activity
                .recover(&recovery.invocation, &context.attempt);
            bound_projection(
                outcome,
                context
                    .max_output_bytes
                    .min(self.definition.max_output_bytes),
            )
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CommandArguments {
    pub(crate) program: PathBuf,
    pub(crate) args: Vec<String>,
    pub(crate) cwd: PathBuf,
    #[serde(default)]
    pub(crate) env: BTreeMap<String, String>,
    #[serde(default)]
    pub(crate) stdin: String,
    pub(crate) directory: Option<BindingId>,
    pub(crate) access: Option<CommandAccess>,
}

impl CommandArguments {
    pub(crate) fn parse(arguments: &ToolArguments, maximum: usize, scoped: bool) -> Result<Self> {
        let ToolArguments::Json(value) = arguments else {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "command_arguments_invalid",
            ));
        };
        if serde_json::to_vec(arguments).map_or(usize::MAX, |bytes| bytes.len()) > maximum {
            return Err(Error::new(ErrorKind::LimitExceeded, "command_input_limit"));
        }
        let command: Self = serde_json::from_value(value.clone())
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "command_arguments_invalid"))?;
        if (scoped
            && (command.access.is_none()
                || value.get("directory").is_some_and(|value| value.is_null())))
            || (!scoped && (value.get("access").is_some() || value.get("directory").is_some()))
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "command_access_invalid",
            ));
        }
        if !valid_path(&command.program) || !valid_path(&command.cwd) {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "command_absolute_path_required",
            ));
        }
        if command.args.iter().any(|value| value.contains('\0'))
            || command.env.iter().any(|(key, value)| {
                key.is_empty() || key.contains(['\0', '=']) || value.contains('\0')
            })
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "command_arguments_invalid",
            ));
        }
        Ok(command)
    }

    pub(crate) fn into_spec(self, timeout: Duration, max_output_bytes: usize) -> ProcessSpec {
        ProcessSpec {
            executable: self.program,
            arguments: self.args,
            cwd: self.cwd,
            environment: self.env,
            stdin: self.stdin.into_bytes(),
            timeout,
            max_output_bytes,
        }
    }
}

fn valid_path(path: &Path) -> bool {
    path.is_absolute()
        && path.to_str().is_some_and(|value| !value.contains('\0'))
        && !path.components().any(|part| part == Component::ParentDir)
}

#[derive(Default)]
struct Activity {
    state: Mutex<ActivityState>,
    changed: Notify,
}

#[derive(Default)]
struct ActivityState {
    closed: bool,
    jobs: BTreeMap<OperationId, Job>,
}

struct Job {
    identity: CommandIdentity,
    fingerprint: Fingerprint,
    state: JobState,
}

enum JobState {
    Active(CancellationToken),
    Finished {
        outcome: ToolOutcome,
        verified: bool,
        finished_at: Instant,
    },
}

impl Activity {
    fn register(
        &self,
        identity: CommandIdentity,
        fingerprint: Fingerprint,
        cancellation: CancellationToken,
    ) -> Result<()> {
        let mut state = self.state.lock().expect("command activity lock");
        if state.closed {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "command_admission_closed",
            ));
        }
        if state.jobs.contains_key(&identity.operation) {
            return Err(Error::new(
                ErrorKind::Conflict,
                "command_operation_already_registered",
            ));
        }
        if state
            .jobs
            .values()
            .filter(|job| matches!(job.state, JobState::Active(_)))
            .count()
            >= MAX_ACTIVE
        {
            return Err(Error::new(
                ErrorKind::LimitExceeded,
                "command_activity_limit",
            ));
        }
        if state.jobs.len() >= MAX_RETAINED {
            let evict = state
                .jobs
                .iter()
                .filter_map(|(id, job)| match job.state {
                    JobState::Finished {
                        verified: true,
                        finished_at,
                        ..
                    } => Some((finished_at, id)),
                    _ => None,
                })
                .min()
                .map(|(_, id)| id.clone());
            let Some(evict) = evict else {
                return Err(Error::new(
                    ErrorKind::LimitExceeded,
                    "command_unverified_activity_limit",
                ));
            };
            state.jobs.remove(&evict);
        }
        state.jobs.insert(
            identity.operation.clone(),
            Job {
                identity,
                fingerprint,
                state: JobState::Active(cancellation),
            },
        );
        Ok(())
    }

    fn finish(&self, id: &OperationId, outcome: ToolOutcome, verified: bool) {
        {
            let mut state = self.state.lock().expect("command activity lock");
            let job = state.jobs.get_mut(id).expect("registered command");
            job.state = JobState::Finished {
                outcome,
                verified,
                finished_at: Instant::now(),
            };
        }
        self.changed.notify_waiters();
    }

    fn recover(&self, invocation: &Invocation, attempt: &AttemptId) -> ToolOutcome {
        let state = self.state.lock().expect("command activity lock");
        if let Some(job) = state.jobs.get(invocation.id())
            && job.fingerprint == invocation.fingerprint()
            && &job.identity.attempt == attempt
            && let JobState::Finished { outcome, .. } = &job.state
        {
            return outcome.clone();
        }
        ToolOutcome::uncertain()
    }

    fn close(&self) {
        let mut state = self.state.lock().expect("command activity lock");
        state.closed = true;
        for job in state.jobs.values() {
            if let JobState::Active(cancellation) = &job.state {
                cancellation.cancel();
            }
        }
    }

    fn quiescence(&self) -> CommandQuiescence {
        let state = self.state.lock().expect("command activity lock");
        let mut summary = CommandQuiescence::default();
        for job in state.jobs.values() {
            match job.state {
                JobState::Active(_) => summary.pending.push(job.identity.clone()),
                JobState::Finished {
                    verified: false, ..
                } => summary.unverified.push(job.identity.clone()),
                JobState::Finished { verified: true, .. } => {}
            }
        }
        summary
    }
}

async fn execute(
    sandbox: Arc<Sandbox>,
    spec: ProcessSpec,
    scope: ExecutionScope,
    admission: ProcessAdmission,
    cancellation: CancellationToken,
    project: fn(ProcessEvidence, usize) -> (ToolOutcome, bool),
) -> (ToolOutcome, bool) {
    let maximum = spec.max_output_bytes;
    let stop = cancellation.clone();
    let running = tokio::task::spawn_blocking(move || {
        if stop.is_cancelled() {
            return Ok(None);
        }
        // Native preparation may inspect paths before it decides containment.
        // Its diagnostics must not disclose whether a refused path exists.
        let prepared = sandbox
            .prepare(spec, scope)
            .map_err(|error| Error::new(error.kind, "command_preparation_refused"))?;
        if stop.is_cancelled() {
            return Ok(None);
        }
        match admission {
            ProcessAdmission::Fixed => prepared.spawn(stop),
            ProcessAdmission::Captured(expected, spawn) => {
                if prepared.capture_fingerprint()? != expected {
                    return Err(Error::new(ErrorKind::Conflict, "command_capture_changed"));
                }
                spawn(prepared, stop)
            }
            ProcessAdmission::Reviewed(executable, spawn) => {
                prepared.verify_executable(&executable)?;
                spawn(prepared, stop)
            }
        }
        .map(Some)
    })
    .await;
    match running {
        Ok(Ok(Some(running))) => match running.finish().await {
            Ok(evidence) => project(evidence, maximum),
            Err(_) => (ToolOutcome::uncertain(), false),
        },
        Ok(Ok(None)) => (cancelled_before_launch(), true),
        Ok(Err(error)) if error.kind == ErrorKind::Uncertain => (ToolOutcome::uncertain(), false),
        Ok(Err(error)) if error.code == "sandbox_admission_closed" => {
            (cancelled_before_launch(), true)
        }
        Ok(Err(error)) => (ToolOutcome::failed(&error.code), true),
        Err(_) => (ToolOutcome::uncertain(), false),
    }
}

fn cancelled_before_launch() -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Cancelled,
        content: vec![],
        structured: None,
        receipt: None,
        truncated: false,
    }
}

fn project_command(evidence: ProcessEvidence, maximum: usize) -> (ToolOutcome, bool) {
    project_process(evidence, maximum, true)
}

pub(crate) fn project_process(
    evidence: ProcessEvidence,
    maximum: usize,
    include_streams: bool,
) -> (ToolOutcome, bool) {
    let backend = match evidence.support.backend {
        Backend::Seatbelt => "seatbelt",
        Backend::Bubblewrap => "bubblewrap",
    };
    let descendants = match evidence.descendants {
        Descendants::NoPayload => "no_payload",
        Descendants::ProcessGroupSignalled => "process_group_signalled",
        Descendants::NamespaceEnded => "namespace_ended",
        Descendants::Unverified => "unverified",
    };
    let verified = evidence.temporary_removed
        && match evidence.descendants {
            Descendants::NoPayload | Descendants::NamespaceEnded => true,
            Descendants::ProcessGroupSignalled => {
                evidence.support.termination == Termination::ProcessGroup
            }
            Descendants::Unverified => false,
        };
    let completion = match evidence.completion {
        Completion::Exited(code) => json!({"kind": "exited", "code": code}),
        Completion::Signaled(signal) => json!({"kind": "signaled", "signal": signal}),
        Completion::SetupFailed => json!({"kind": "setup_failed"}),
        Completion::Uncertain => json!({"kind": "uncertain"}),
    };
    let stop_reason = evidence.stopped.map(|reason| match reason {
        StopReason::Requested => "requested",
        StopReason::Deadline => "deadline",
        StopReason::OutputLimit => "output_limit",
    });
    let status = match (verified, evidence.completion, evidence.stopped) {
        (false, _, _) | (_, Completion::Uncertain, _) => OutcomeStatus::Uncertain,
        (_, Completion::SetupFailed, _) => OutcomeStatus::Failed,
        (_, Completion::Exited(0), None) => OutcomeStatus::Succeeded,
        (_, _, Some(StopReason::Requested)) => OutcomeStatus::Cancelled,
        _ => OutcomeStatus::Failed,
    };
    let stdout = String::from_utf8_lossy(&evidence.stdout);
    let stderr = String::from_utf8_lossy(&evidence.stderr);
    let mut content = Vec::new();
    if include_streams {
        for (label, stream) in [("stdout", &stdout), ("stderr", &stderr)] {
            if !stream.is_empty() {
                content.push(ResultContent::Text(format!("{label}:\n{stream}")));
            }
        }
    }
    let details = json!({
        "backend": backend,
        "completion": completion,
        "stop_reason": stop_reason,
        "descendants": descendants,
        "temporary_removed": evidence.temporary_removed,
        "cleanup_verified": verified,
        "output_lossy": matches!(stdout, std::borrow::Cow::Owned(_)) || matches!(stderr, std::borrow::Cow::Owned(_)),
        "native_output_truncated": evidence.output_truncated,
    });
    let receipt = Envelope::new(
        SchemaId::new("grida.command.execution").expect("command receipt schema"),
        1,
        serde_json::to_vec(&details).expect("command receipt encoding"),
    )
    .expect("bounded command receipt");
    let outcome = ToolOutcome {
        status,
        content,
        structured: Some(details),
        receipt: Some(receipt),
        truncated: evidence.output_truncated,
    };
    (bound_projection(outcome, maximum), verified)
}

fn bound_projection(mut outcome: ToolOutcome, maximum: usize) -> ToolOutcome {
    let fits = |outcome: &ToolOutcome| {
        serde_json::to_vec(&(&outcome.content, &outcome.structured))
            .is_ok_and(|bytes| bytes.len() <= maximum)
    };
    if fits(&outcome) {
        return outcome;
    }
    let content = std::mem::take(&mut outcome.content);
    outcome.truncated = true;
    if !fits(&outcome) {
        outcome.structured = None;
    }
    for part in content {
        let ResultContent::Text(text) = part else {
            continue;
        };
        let mut low = 0;
        let mut high = text.len();
        while low < high {
            let mid = low + (high - low).div_ceil(2);
            let end = text.floor_char_boundary(mid);
            outcome
                .content
                .push(ResultContent::Text(text[..end].into()));
            if fits(&outcome) {
                low = mid;
            } else {
                high = mid - 1;
            }
            outcome.content.pop();
        }
        let end = text.floor_char_boundary(low);
        if end > 0 {
            outcome
                .content
                .push(ResultContent::Text(text[..end].into()));
        }
    }
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_sandbox::Support;

    fn identity(operation: &str) -> CommandIdentity {
        CommandIdentity {
            operation: OperationId::new(operation).unwrap(),
            attempt: AttemptId::new("attempt").unwrap(),
        }
    }

    #[test]
    fn commands_require_explicit_paths_and_reject_host_controls() {
        let input = |extra: serde_json::Value| {
            let mut value = json!({"program":"/bin/sh", "args":[], "cwd":"/tmp"});
            value
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            ToolArguments::Json(value)
        };
        assert!(
            CommandArguments::parse(&input(json!({"stdin":"\u{0000}café"})), 4096, false).is_ok()
        );
        for invalid in [
            json!({"program":"sh"}),
            json!({"cwd":"/tmp/../tmp"}),
            json!({"env":{"invalid=name":"value"}}),
            json!({"args":["\u{0000}"]}),
            json!({"network":true}),
            json!({"env":{"VISIBLE":42}}),
        ] {
            assert!(CommandArguments::parse(&input(invalid), 4096, false).is_err());
        }
        assert_eq!(
            CommandArguments::parse(&input(json!({})), 1, false)
                .err()
                .unwrap()
                .code,
            "command_input_limit"
        );
    }

    #[test]
    fn closing_signals_active_jobs_and_retains_unverified_cleanup() {
        let activity = Activity::default();
        let identity = identity("command");
        let fingerprint = Fingerprint::of(&0).unwrap();
        let cancellation = CancellationToken::new();
        activity
            .register(identity.clone(), fingerprint, cancellation.clone())
            .unwrap();
        activity.close();
        assert!(cancellation.is_cancelled());
        assert_eq!(
            activity.quiescence().pending,
            std::slice::from_ref(&identity)
        );
        activity.finish(&identity.operation, ToolOutcome::uncertain(), false);
        assert_eq!(
            activity.quiescence().unverified,
            std::slice::from_ref(&identity)
        );
        assert_eq!(
            activity
                .register(identity, fingerprint, CancellationToken::new())
                .unwrap_err()
                .code,
            "command_admission_closed"
        );
    }

    #[test]
    fn lifecycle_evidence_survives_bounded_lossy_output() {
        let evidence = ProcessEvidence {
            support: Support {
                backend: Backend::Seatbelt,
                termination: Termination::ProcessGroup,
            },
            completion: Completion::Exited(0),
            stopped: None,
            stdout: [vec![0xff], "é\n\\".repeat(256).into_bytes()].concat(),
            stderr: vec![],
            output_truncated: false,
            descendants: Descendants::ProcessGroupSignalled,
            temporary_removed: true,
        };
        let (outcome, verified) = project_command(evidence, 512);
        assert!(verified);
        assert_eq!(outcome.status, OutcomeStatus::Succeeded);
        assert!(outcome.truncated);
        assert!(
            serde_json::to_vec(&(&outcome.content, &outcome.structured))
                .unwrap()
                .len()
                <= 512
        );
        let details: serde_json::Value =
            serde_json::from_slice(outcome.receipt.unwrap().bytes()).unwrap();
        assert_eq!(details["output_lossy"], true);
        assert_eq!(details["completion"]["kind"], "exited");
        assert!(!outcome.content.is_empty());
    }
}
