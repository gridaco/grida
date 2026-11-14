//! `exec_command` and `write_stdin`: the model's command tools.

use super::output::{self, Standing};
use super::{Entry, Io, ProcessSessions, RETAINED_OUTPUT_BYTES};
use crate::command::{CommandAccess, CommandLimits, valid_path};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{
    Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::{
    AttemptId, BindingId, BoxFuture, CancellationToken, Error, ErrorKind, Fingerprint, OperationId,
    Result, SessionId, ToolId,
};
use agent_kit_sandbox::{
    ExecutionScope, PreparedProcess, ProcessSpec, RunningSession, Sandbox, SessionOptions,
};
use serde::Deserialize;
use serde_json::json;
use std::collections::{BTreeMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub(crate) const EXEC_COMMAND: &str = "exec_command";
pub(crate) const WRITE_STDIN: &str = "write_stdin";
const SHELLS: [&str; 4] = ["sh", "bash", "zsh", "dash"];
const DEFAULT_SHELL: &str = "/bin/sh";
const EXEC_YIELD_MS: (u64, u64, u64) = (10_000, 250, 30_000);
const WRITE_YIELD_MS: (u64, u64, u64) = (250, 250, 30_000);
const POLL_YIELD_MS: (u64, u64, u64) = (5_000, 5_000, 300_000);
const DEFAULT_OUTPUT_TOKENS: f64 = 10_000.0;
/// A wait ends this long before the call's own deadline so its output is
/// still recorded.
const DEADLINE_MARGIN: Duration = Duration::from_secs(2);
/// The sandbox's bound for one launch specification. Sessions are not held
/// to it; their scope's lifetime applies.
const SPECIFICATION_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_RECORDED: usize = 16;
const INTERRUPT: &str = "\u{3}";

pub(crate) type SpawnSession = dyn Fn(PreparedProcess, SessionOptions, CancellationToken) -> Result<RunningSession>
    + Send
    + Sync;

/// What the host authorizes for one `exec_command` call.
pub(crate) struct AuthorizedProcess {
    pub scope: ExecutionScope,
    /// The capture the approved action was bound to.
    pub expected: Fingerprint,
    pub spawn: Arc<SpawnSession>,
    /// The environment the approved process was captured with.
    pub environment: Arc<BTreeMap<String, String>>,
    /// The working directory when the call names none.
    pub root: PathBuf,
}

type ResolveProcess = dyn Fn(&Invocation) -> Result<AuthorizedProcess> + Send + Sync;

enum Authority {
    Fixed {
        scope: Box<ExecutionScope>,
        environment: Arc<BTreeMap<String, String>>,
        root: PathBuf,
    },
    Authorized(Arc<ResolveProcess>),
}

/// The two command tools of one chat, bound to the host's process store.
// GRIDA-SEC-004: authority comes from the host; sessions outlive the call.
pub struct ProcessTools {
    exec: Arc<ExecCommand>,
    write: Arc<WriteStdin>,
}

struct Shared {
    sandbox: Arc<Sandbox>,
    authority: Authority,
    sessions: Arc<ProcessSessions>,
    session: SessionId,
    recorded: Mutex<VecDeque<Recorded>>,
}

struct Recorded {
    operation: OperationId,
    fingerprint: Fingerprint,
    attempt: AttemptId,
    outcome: ToolOutcome,
}

struct ExecCommand {
    definition: ToolDefinition,
    shared: Arc<Shared>,
}

struct WriteStdin {
    definition: ToolDefinition,
    shared: Arc<Shared>,
}

impl ProcessTools {
    /// Tools for a fixed, host-issued scope. Commands start in `root` unless
    /// they name another working directory. The host must probe native
    /// support for that scope first.
    pub fn new(
        sandbox: Arc<Sandbox>,
        scope: ExecutionScope,
        root: PathBuf,
        environment: BTreeMap<String, String>,
        limits: CommandLimits,
        sessions: Arc<ProcessSessions>,
        session: SessionId,
    ) -> Result<Self> {
        Self::with_authority(
            sandbox,
            Authority::Fixed {
                scope: Box::new(scope),
                environment: Arc::new(environment),
                root,
            },
            limits,
            sessions,
            session,
        )
    }

    pub(crate) fn authorized(
        sandbox: Arc<Sandbox>,
        limits: CommandLimits,
        sessions: Arc<ProcessSessions>,
        session: SessionId,
        resolve: Arc<ResolveProcess>,
    ) -> Result<Self> {
        Self::with_authority(
            sandbox,
            Authority::Authorized(resolve),
            limits,
            sessions,
            session,
        )
    }

    fn with_authority(
        sandbox: Arc<Sandbox>,
        authority: Authority,
        limits: CommandLimits,
        sessions: Arc<ProcessSessions>,
        session: SessionId,
    ) -> Result<Self> {
        if !(1..=64 * 1024).contains(&limits.max_input_bytes)
            || !(1..=64 * 1024).contains(&limits.max_output_bytes)
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_command_limits",
            ));
        }
        let scoped = matches!(authority, Authority::Authorized(_));
        let shared = Arc::new(Shared {
            sandbox,
            authority,
            sessions,
            session,
            recorded: Mutex::default(),
        });
        Ok(Self {
            exec: Arc::new(ExecCommand {
                definition: exec_definition(scoped, limits)?,
                shared: shared.clone(),
            }),
            write: Arc::new(WriteStdin {
                definition: write_definition(limits)?,
                shared,
            }),
        })
    }

    /// `exec_command`, then `write_stdin`.
    pub fn tools(&self) -> [Arc<dyn Tool>; 2] {
        [self.exec.clone(), self.write.clone()]
    }
}

fn exec_definition(scoped: bool, limits: CommandLimits) -> Result<ToolDefinition> {
    let mut schema = json!({
        "type": "object",
        "properties": {
            "cmd": {"type": "string", "description": "Shell command to execute."},
            "workdir": {"type": "string", "description": "Absolute working directory. Defaults to the root of the selected directory."},
            "tty": {"type": "boolean", "description": "True allocates a pseudo-terminal for the command; false or omitted uses plain pipes with stdin closed."},
            "yield_time_ms": {"type": "number", "description": "How long to wait for the command before returning. Defaults to 10000 ms; effective range is 250-30000 ms."},
            "max_output_tokens": {"type": "number", "description": "Output token budget. Defaults to 10000 tokens; larger requests may be capped."}
        },
        "required": ["cmd"],
        "additionalProperties": false
    });
    let mut description = "Runs a command in a PTY or pipes, returning output or a session ID for ongoing interaction. The command runs with `sh -c` semantics in the user's shell (sh, bash, zsh or dash) inside a sandbox: network access is denied and writes stay inside granted locations. A command still running when the wait ends keeps running; continue with write_stdin and its session ID.".to_owned();
    if scoped {
        schema["properties"]["access"] = json!({"enum": ["read", "read_write"], "description": "read lets the command read the directory; read_write also lets it write there."});
        schema["properties"]["directory"] = json!({"type": "string", "description": "Named directory ID. Omit for the primary directory."});
        schema["required"] = json!(["cmd", "access"]);
        description.push_str(" Select read or read_write access explicitly. The working directory must be inside the selected directory.");
    }
    Ok(ToolDefinition {
        id: ToolId::new(EXEC_COMMAND)?,
        version: 1,
        description,
        input: InputFormat::Json(schema),
        max_input_bytes: limits.max_input_bytes,
        max_output_bytes: limits.max_output_bytes,
        recovery: RecoveryKind::Reconcile,
    })
}

fn write_definition(limits: CommandLimits) -> Result<ToolDefinition> {
    Ok(ToolDefinition {
        id: ToolId::new(WRITE_STDIN)?,
        version: 1,
        description: "Writes characters to an existing exec session and returns recent output. Send empty chars to poll.".into(),
        input: InputFormat::Json(json!({
            "type": "object",
            "properties": {
                "session_id": {"type": "number", "description": "Identifier of the running exec session."},
                "chars": {"type": "string", "description": "Characters to write to stdin. Defaults to empty, which polls without writing. \"\\u0003\" interrupts the process (Ctrl-C)."},
                "yield_time_ms": {"type": "number", "description": "How long to wait for output before returning. Non-empty writes default to 250 ms and cap at 30000 ms; empty polls wait 5000-300000 ms."},
                "max_output_tokens": {"type": "number", "description": "Output token budget. Defaults to 10000 tokens; larger requests may be capped."}
            },
            "required": ["session_id"],
            "additionalProperties": false
        })),
        max_input_bytes: limits.max_input_bytes,
        max_output_bytes: limits.max_output_bytes,
        recovery: RecoveryKind::Reconcile,
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExecArguments {
    pub(crate) cmd: String,
    pub(crate) workdir: Option<PathBuf>,
    #[serde(default)]
    pub(crate) tty: bool,
    yield_time_ms: Option<f64>,
    max_output_tokens: Option<f64>,
    pub(crate) directory: Option<BindingId>,
    pub(crate) access: Option<CommandAccess>,
}

impl ExecArguments {
    pub(crate) fn parse(arguments: &ToolArguments, maximum: usize, scoped: bool) -> Result<Self> {
        let value = json_arguments(arguments, maximum)?;
        let command: Self = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
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
        if command.cmd.trim().is_empty() || command.cmd.contains('\0') {
            return Err(invalid());
        }
        if command
            .workdir
            .as_deref()
            .is_some_and(|workdir| !valid_path(workdir))
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "command_absolute_path_required",
            ));
        }
        Ok(command)
    }

    /// `<shell> -c <cmd>` in the named or default directory, starting from
    /// the host's environment.
    pub(crate) fn spec(&self, root: &Path, environment: &BTreeMap<String, String>) -> ProcessSpec {
        ProcessSpec {
            executable: shell(environment),
            arguments: vec!["-c".into(), self.cmd.clone()],
            cwd: self.workdir.clone().unwrap_or_else(|| root.to_owned()),
            environment: environment.clone(),
            stdin: Vec::new(),
            timeout: SPECIFICATION_TIMEOUT,
            max_output_bytes: RETAINED_OUTPUT_BYTES,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WriteArguments {
    session_id: f64,
    #[serde(default)]
    chars: String,
    yield_time_ms: Option<f64>,
    max_output_tokens: Option<f64>,
}

impl WriteArguments {
    fn parse(arguments: &ToolArguments, maximum: usize) -> Result<(Self, u64)> {
        let value = json_arguments(arguments, maximum)?;
        let input: Self = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        let id = input.session_id;
        if id.fract() != 0.0 || !(1.0..=f64::from(u32::MAX)).contains(&id) {
            return Err(invalid());
        }
        Ok((input, id as u64))
    }
}

fn json_arguments(arguments: &ToolArguments, maximum: usize) -> Result<&serde_json::Value> {
    let ToolArguments::Json(value) = arguments else {
        return Err(invalid());
    };
    if serde_json::to_vec(arguments).map_or(usize::MAX, |bytes| bytes.len()) > maximum {
        return Err(Error::new(ErrorKind::LimitExceeded, "command_input_limit"));
    }
    Ok(value)
}

/// The environment's `SHELL` when it names a known shell by absolute path
/// and is an executable file, otherwise `/bin/sh`. Never a login or
/// interactive shell.
fn shell(environment: &BTreeMap<String, String>) -> PathBuf {
    environment
        .get("SHELL")
        .map(Path::new)
        .filter(|path| {
            valid_path(path)
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| SHELLS.contains(&name))
                && is_executable_file(path)
        })
        .map_or_else(|| PathBuf::from(DEFAULT_SHELL), Path::to_owned)
}

#[cfg(unix)]
fn is_executable_file(candidate: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    candidate
        .metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

/// Native commands have no sandbox off unix; the default shell is used and
/// the sandbox refuses the launch.
#[cfg(not(unix))]
fn is_executable_file(_candidate: &Path) -> bool {
    false
}

fn yield_until(
    start: Instant,
    requested: Option<f64>,
    (default, minimum, maximum): (u64, u64, u64),
    deadline: Option<Instant>,
) -> Instant {
    let milliseconds = requested
        .filter(|value| value.is_finite())
        .map_or(default, |value| {
            value.clamp(minimum as f64, maximum as f64) as u64
        });
    let until = start + Duration::from_millis(milliseconds);
    match deadline {
        Some(deadline) => until
            .min(deadline.checked_sub(DEADLINE_MARGIN).unwrap_or(deadline))
            .max(start),
        None => until,
    }
}

fn output_budget(requested: Option<f64>, maximum: usize) -> usize {
    let tokens = requested
        .filter(|value| value.is_finite())
        .unwrap_or(DEFAULT_OUTPUT_TOKENS)
        .max(1.0);
    ((tokens * 4.0).min(maximum as f64)) as usize
}

impl Shared {
    fn scoped(&self) -> bool {
        matches!(self.authority, Authority::Authorized(_))
    }

    fn record(&self, invocation: &Invocation, attempt: &AttemptId, outcome: &ToolOutcome) {
        let mut recorded = self
            .recorded
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if recorded.len() >= MAX_RECORDED {
            recorded.pop_front();
        }
        recorded.push_back(Recorded {
            operation: invocation.id().clone(),
            fingerprint: invocation.fingerprint(),
            attempt: attempt.clone(),
            outcome: outcome.clone(),
        });
    }

    /// The exact attempt's result, when this claim produced it.
    fn recorded(&self, invocation: &Invocation, attempt: &AttemptId) -> Option<ToolOutcome> {
        self.recorded
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .iter()
            .find(|recorded| {
                &recorded.operation == invocation.id()
                    && recorded.fingerprint == invocation.fingerprint()
                    && &recorded.attempt == attempt
            })
            .map(|recorded| recorded.outcome.clone())
    }
}

impl ExecCommand {
    async fn run(&self, invocation: &Invocation, context: &InvocationContext) -> ToolOutcome {
        let started = Instant::now();
        let shared = &self.shared;
        let arguments = match ExecArguments::parse(
            invocation.arguments(),
            self.definition.max_input_bytes,
            shared.scoped(),
        ) {
            Ok(arguments) => arguments,
            Err(error) => return ToolOutcome::failed(&error.code),
        };
        let maximum = context
            .max_output_bytes
            .min(self.definition.max_output_bytes);
        let budget = output_budget(arguments.max_output_tokens, maximum);
        let (scope, capture, environment, root) = match &shared.authority {
            Authority::Fixed {
                scope,
                environment,
                root,
            } => ((**scope).clone(), None, environment.clone(), root.clone()),
            Authority::Authorized(resolve) => match resolve(invocation) {
                Ok(authority) => (
                    authority.scope,
                    Some((authority.expected, authority.spawn)),
                    authority.environment,
                    authority.root,
                ),
                Err(error) => return ToolOutcome::failed(&error.code),
            },
        };
        let spec = arguments.spec(&root, &environment);
        let cwd = spec.cwd.clone();
        if let Err(error) = shared.sessions.admit(&shared.session) {
            return ToolOutcome::failed(&error.code);
        }
        if context.cancellation.is_cancelled() || scope.valid_until <= Instant::now() {
            return cancelled();
        }
        // The process belongs to the chat, not to this call or its turn.
        let stop = CancellationToken::new();
        let options = SessionOptions {
            terminal: arguments.tty,
            retained_output_bytes: RETAINED_OUTPUT_BYTES,
        };
        let sandbox = shared.sandbox.clone();
        let cancellation = context.cancellation.clone();
        let launch_stop = stop.clone();
        let launched = tokio::task::spawn_blocking(move || {
            if cancellation.is_cancelled() {
                return Ok(None);
            }
            // Native preparation may inspect paths before it decides
            // containment. Its diagnostics must not disclose whether a
            // refused path exists.
            let prepared = sandbox
                .prepare(spec, scope)
                .map_err(|error| Error::new(error.kind, "command_preparation_refused"))?;
            if cancellation.is_cancelled() {
                return Ok(None);
            }
            match capture {
                Some((expected, spawn)) => {
                    if prepared.capture_fingerprint()? != expected {
                        return Err(Error::new(ErrorKind::Conflict, "command_capture_changed"));
                    }
                    spawn(prepared, options, launch_stop)
                }
                None => prepared.spawn_session(options, launch_stop),
            }
            .map(Some)
        })
        .await;
        let running = match launched {
            Ok(Ok(Some(running))) => running,
            Ok(Ok(None)) => return cancelled(),
            Ok(Err(error)) if error.kind == ErrorKind::Uncertain => {
                return ToolOutcome::uncertain();
            }
            Ok(Err(error)) if error.code == "sandbox_admission_closed" => return cancelled(),
            Ok(Err(error)) => return ToolOutcome::failed(&error.code),
            Err(_) => return ToolOutcome::uncertain(),
        };
        let launched_at = Instant::now();
        let entry = shared.sessions.supervise(
            shared.session.clone(),
            arguments.cmd.clone(),
            cwd,
            arguments.tty,
            running,
            stop,
        );
        let mut unlisted = Unlisted {
            sessions: &shared.sessions,
            entry: &entry,
            armed: true,
        };
        let until = yield_until(
            launched_at,
            arguments.yield_time_ms,
            EXEC_YIELD_MS,
            context.deadline,
        );
        let mut io = entry.io.lock().await;
        let interrupted = collect(
            &shared.sessions,
            &entry,
            &mut io,
            until,
            &context.cancellation,
        )
        .await;
        let output = io.unread.take();
        drop(io);
        unlisted.armed = false;
        let wall = started.elapsed();
        if let Some(ending) = entry.ending() {
            return output::outcome(
                ending.status,
                wall,
                &Standing::Ended(&ending),
                &output,
                budget,
                maximum,
            );
        }
        // Still running after the wait, or the wait was interrupted: the
        // chat keeps the process and its buffered output.
        match shared.sessions.register(&entry) {
            Ok(id) => output::outcome(
                if interrupted {
                    OutcomeStatus::Cancelled
                } else {
                    OutcomeStatus::Succeeded
                },
                wall,
                &Standing::Running(id),
                &output,
                budget,
                maximum,
            ),
            Err(error) => ToolOutcome::failed(&error.code),
        }
    }
}

impl WriteStdin {
    async fn run(&self, invocation: &Invocation, context: &InvocationContext) -> ToolOutcome {
        let started = Instant::now();
        let shared = &self.shared;
        let (arguments, id) =
            match WriteArguments::parse(invocation.arguments(), self.definition.max_input_bytes) {
                Ok(arguments) => arguments,
                Err(error) => return ToolOutcome::failed(&error.code),
            };
        let maximum = context
            .max_output_bytes
            .min(self.definition.max_output_bytes);
        let budget = output_budget(arguments.max_output_tokens, maximum);
        let Some(entry) = shared.sessions.get(&shared.session, id) else {
            return ToolOutcome::failed(&format!(
                "unknown session id {id} (it may have ended or been stopped)"
            ));
        };
        let mut io = tokio::select! {
            io = entry.io.lock() => io,
            _ = context.cancellation.cancelled() => return cancelled(),
        };
        entry.touch();
        if !arguments.chars.is_empty()
            && let Some(running) = &io.running
        {
            let written = if entry.terminal {
                running.write(arguments.chars.as_bytes())
            } else if arguments.chars == INTERRUPT {
                running.interrupt()
            } else {
                return ToolOutcome::failed(
                    "stdin is closed for this session; rerun with tty=true",
                );
            };
            match written {
                Ok(()) => {}
                // It ended meanwhile; report the end below.
                Err(error) if error.code == "sandbox_session_ended" => {}
                Err(error) if error.kind == ErrorKind::LimitExceeded => {
                    return ToolOutcome::failed(
                        "input is too large: write at most 64 KiB at a time and let the process read it",
                    );
                }
                Err(error) => return ToolOutcome::failed(&error.code),
            }
        }
        let range = if arguments.chars.is_empty() {
            POLL_YIELD_MS
        } else {
            WRITE_YIELD_MS
        };
        let until = yield_until(started, arguments.yield_time_ms, range, context.deadline);
        let interrupted = collect(
            &shared.sessions,
            &entry,
            &mut io,
            until,
            &context.cancellation,
        )
        .await;
        let output = io.unread.take();
        drop(io);
        entry.touch();
        let wall = started.elapsed();
        match entry.ending() {
            Some(ending) => {
                // The end is reported once; the number is then unknown.
                shared.sessions.collect(&entry);
                output::outcome(
                    ending.status,
                    wall,
                    &Standing::Ended(&ending),
                    &output,
                    budget,
                    maximum,
                )
            }
            None => output::outcome(
                if interrupted {
                    OutcomeStatus::Cancelled
                } else {
                    OutcomeStatus::Succeeded
                },
                wall,
                &Standing::Running(id),
                &output,
                budget,
                maximum,
            ),
        }
    }
}

/// Read the process until `until`, its end, or cancellation, finalizing it
/// when it ends. Returns whether cancellation ended the wait.
async fn collect(
    sessions: &Arc<ProcessSessions>,
    entry: &Arc<Entry>,
    io: &mut Io,
    until: Instant,
    cancellation: &CancellationToken,
) -> bool {
    loop {
        let Some(running) = &io.running else {
            return false;
        };
        let read = tokio::select! {
            biased;
            _ = cancellation.cancelled() => return true,
            read = running.read(until, RETAINED_OUTPUT_BYTES) => read,
        };
        let ended = read.ended;
        io.unread.push(read);
        if ended {
            entry.finalize(sessions, io).await;
            return false;
        }
        if Instant::now() >= until {
            return false;
        }
    }
}

/// Lists a still-running process if its first wait is abandoned, so the
/// chat can still see and stop it.
struct Unlisted<'a> {
    sessions: &'a ProcessSessions,
    entry: &'a Arc<Entry>,
    armed: bool,
}

impl Drop for Unlisted<'_> {
    fn drop(&mut self) {
        if self.armed && !self.entry.has_ended() {
            let _ = self.sessions.register(self.entry);
        }
    }
}

fn cancelled() -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Cancelled,
        content: vec![],
        structured: None,
        receipt: None,
        truncated: false,
    }
}

fn invalid() -> Error {
    Error::new(ErrorKind::InvalidInput, "command_arguments_invalid")
}

impl Tool for ExecCommand {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        ExecArguments::parse(
            arguments,
            self.definition.max_input_bytes,
            self.shared.scoped(),
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
            let outcome = self.run(&invocation, &context).await;
            self.shared.record(&invocation, &context.attempt, &outcome);
            outcome
        })
    }

    /// Only this claim's own result is known; a launch it cannot account
    /// for stays uncertain.
    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.shared
                .recorded(&recovery.invocation, &context.attempt)
                .unwrap_or_else(ToolOutcome::uncertain)
        })
    }
}

impl Tool for WriteStdin {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        WriteArguments::parse(arguments, self.definition.max_input_bytes).map(|_| ())
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
            let outcome = self.run(&invocation, &context).await;
            self.shared.record(&invocation, &context.attempt, &outcome);
            outcome
        })
    }

    /// A poll can run again. Input may already have been delivered, so an
    /// unaccounted write stays uncertain.
    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            if let Some(outcome) = self.shared.recorded(&recovery.invocation, &context.attempt) {
                return outcome;
            }
            let poll = WriteArguments::parse(
                recovery.invocation.arguments(),
                self.definition.max_input_bytes,
            )
            .is_ok_and(|(arguments, _)| arguments.chars.is_empty());
            if !poll || recovery.invocation.definition() != &self.definition {
                return ToolOutcome::uncertain();
            }
            let outcome = self.run(&recovery.invocation, &context).await;
            self.shared
                .record(&recovery.invocation, &context.attempt, &outcome);
            outcome
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exec(value: serde_json::Value, scoped: bool) -> Result<ExecArguments> {
        ExecArguments::parse(&ToolArguments::Json(value), 4096, scoped)
    }

    #[test]
    fn exec_arguments_are_bounded_and_carry_no_host_controls() {
        assert!(exec(json!({"cmd": "npm test"}), false).is_ok());
        assert!(exec(json!({"cmd": "ls", "access": "read"}), true).is_ok());
        for (invalid, scoped) in [
            (json!({"cmd": ""}), false),
            (json!({"cmd": "  "}), false),
            (json!({"cmd": "a\u{0000}b"}), false),
            (json!({"cmd": "ls", "workdir": "relative"}), false),
            (json!({"cmd": "ls", "workdir": "/tmp/../etc"}), false),
            (json!({"cmd": "ls", "env": {"A": "b"}}), false),
            (json!({"cmd": "ls", "stdin": "x"}), false),
            (json!({"cmd": "ls", "shell": "/bin/bash"}), false),
            (json!({"cmd": "ls", "login": true}), false),
            (json!({"cmd": "ls", "tty": null}), false),
            (json!({"cmd": "ls", "access": "read"}), false),
            (json!({"cmd": "ls"}), true),
            (
                json!({"cmd": "ls", "access": "read", "directory": null}),
                true,
            ),
        ] {
            assert!(exec(invalid.clone(), scoped).is_err(), "{invalid}");
        }
        assert_eq!(
            ExecArguments::parse(&ToolArguments::Json(json!({"cmd": "ls"})), 4, false)
                .err()
                .unwrap()
                .code,
            "command_input_limit"
        );
    }

    #[test]
    fn write_arguments_name_one_positive_session() {
        let parse = |value| WriteArguments::parse(&ToolArguments::Json(value), 4096);
        assert_eq!(parse(json!({"session_id": 3})).unwrap().1, 3);
        assert_eq!(parse(json!({"session_id": 3.0, "chars": ""})).unwrap().1, 3);
        for invalid in [
            json!({}),
            json!({"session_id": 0}),
            json!({"session_id": -1}),
            json!({"session_id": 1.5}),
            json!({"session_id": "1"}),
            json!({"session_id": 1, "stdin": "x"}),
        ] {
            assert!(parse(invalid.clone()).is_err(), "{invalid}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn only_a_known_shell_named_by_absolute_path_is_used() {
        let environment = |shell: &str| BTreeMap::from([("SHELL".to_owned(), shell.to_owned())]);
        assert_eq!(shell(&BTreeMap::new()), PathBuf::from(DEFAULT_SHELL));
        assert_eq!(shell(&environment("/bin/sh")), PathBuf::from("/bin/sh"));
        for refused in ["bash", "/bin/../bin/bash", "/usr/bin/env", "/no/such/zsh"] {
            assert_eq!(
                shell(&environment(refused)),
                PathBuf::from(DEFAULT_SHELL),
                "{refused}"
            );
        }
        let directory = tempfile::tempdir().unwrap();
        let plain = directory.path().join("bash");
        std::fs::write(&plain, "").unwrap();
        assert_eq!(
            shell(&environment(plain.to_str().unwrap())),
            PathBuf::from(DEFAULT_SHELL)
        );
        let spec = ExecArguments::parse(
            &ToolArguments::Json(json!({"cmd": "echo hi", "tty": true})),
            4096,
            false,
        )
        .unwrap()
        .spec(Path::new("/project"), &environment("/bin/sh"));
        assert_eq!(spec.arguments, ["-c", "echo hi"]);
        assert_eq!(spec.cwd, PathBuf::from("/project"));
        assert!(spec.stdin.is_empty());
    }

    #[test]
    fn waits_and_budgets_are_clamped() {
        let start = Instant::now();
        let wait = |requested, range, deadline| {
            yield_until(start, requested, range, deadline).duration_since(start)
        };
        assert_eq!(wait(None, EXEC_YIELD_MS, None), Duration::from_secs(10));
        assert_eq!(
            wait(Some(1.0), EXEC_YIELD_MS, None),
            Duration::from_millis(250)
        );
        assert_eq!(
            wait(Some(1e9), EXEC_YIELD_MS, None),
            Duration::from_secs(30)
        );
        assert_eq!(
            wait(Some(10.0), POLL_YIELD_MS, None),
            Duration::from_secs(5)
        );
        assert_eq!(
            wait(Some(1e9), POLL_YIELD_MS, None),
            Duration::from_secs(300)
        );
        assert_eq!(wait(None, WRITE_YIELD_MS, None), Duration::from_millis(250));
        assert_eq!(
            wait(None, POLL_YIELD_MS, Some(start + Duration::from_secs(3))),
            Duration::from_secs(1)
        );
        assert_eq!(output_budget(None, 1 << 20), 40_000);
        assert_eq!(output_budget(Some(10.0), 1 << 20), 40);
        assert_eq!(output_budget(Some(1e9), 1000), 1000);
        assert_eq!(output_budget(Some(-5.0), 1000), 4);
    }
}
