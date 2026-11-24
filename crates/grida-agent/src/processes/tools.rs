//! `exec_command` and `write_stdin`: the model's command tools.

use super::output::{self, Standing};
use super::{Entry, Io, ProcessAccess, ProcessSessions, RETAINED_OUTPUT_BYTES};
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
    UnconfinedScope,
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
const MAX_JUSTIFICATION_BYTES: usize = 1024;

pub(crate) type SpawnSession = dyn Fn(PreparedProcess, SessionOptions, CancellationToken) -> Result<RunningSession>
    + Send
    + Sync;

pub(crate) enum FiniteLaunch {
    Confined,
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    Network(Box<super::network::CommandMediator>),
}

pub(crate) enum FiniteCommand {
    Confined(agent_kit_sandbox::RunningProcess),
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    Network(super::network::NetworkCommand),
}

pub(crate) type SpawnFiniteCommand =
    dyn Fn(PreparedProcess, FiniteLaunch, CancellationToken) -> Result<FiniteCommand> + Send + Sync;

/// What the host authorizes for one `exec_command` call.
pub(crate) struct AuthorizedProcess {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub network_home: Option<PathBuf>,
    pub spawn_finite: Option<Arc<SpawnFiniteCommand>>,
    pub scope: ProcessScope,
    /// The capture the approved action was bound to.
    pub expected: Fingerprint,
    pub spawn: Arc<SpawnSession>,
    /// The environment the approved process was captured with.
    pub environment: Arc<BTreeMap<String, String>>,
    /// The working directory when the call names none.
    pub root: PathBuf,
}

pub(crate) enum ProcessScope {
    Confined(ExecutionScope),
    Unconfined(UnconfinedScope),
}

impl ProcessScope {
    fn valid_until(&self) -> Instant {
        match self {
            Self::Confined(scope) => scope.valid_until,
            Self::Unconfined(scope) => scope.valid_until,
        }
    }

    pub(crate) fn prepare(self, sandbox: &Sandbox, spec: ProcessSpec) -> Result<PreparedProcess> {
        match self {
            Self::Confined(scope) => sandbox.prepare(spec, scope),
            Self::Unconfined(scope) => sandbox.prepare_unconfined(spec, scope),
        }
    }
}

type ResolveProcess = dyn Fn(&Invocation) -> Result<AuthorizedProcess> + Send + Sync;

/// Accepted command networking. Earlier offers keep their original tool schema.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum CommandNetwork {
    Offline,
    ExactDestination,
    ManagedRetry,
    Managed,
}

#[derive(Clone, Copy)]
pub(crate) enum CommandToolMode {
    Fixed,
    Act {
        unconfined: bool,
        network: CommandNetwork,
        allow_escalation: bool,
    },
    Plan,
}

impl CommandToolMode {
    fn full_access(self) -> bool {
        matches!(
            self,
            Self::Act {
                unconfined: true,
                ..
            }
        )
    }

    fn allows_escalation(self) -> bool {
        matches!(
            self,
            Self::Act {
                unconfined: false,
                allow_escalation: true,
                ..
            }
        )
    }

    fn network(self) -> CommandNetwork {
        match self {
            Self::Act {
                unconfined: false,
                network,
                ..
            } => network,
            _ => CommandNetwork::Offline,
        }
    }

    fn allows_local_listener(self) -> bool {
        self.allows_escalation() && cfg!(target_os = "macos")
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum CommandFileInput {
    None,
    Scoped,
}

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
    mode: CommandToolMode,
    file_input: CommandFileInput,
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
            CommandToolMode::Fixed,
            CommandFileInput::None,
        )
    }

    pub(crate) fn authorized(
        sandbox: Arc<Sandbox>,
        limits: CommandLimits,
        sessions: Arc<ProcessSessions>,
        session: SessionId,
        mode: CommandToolMode,
        file_input: CommandFileInput,
        resolve: Arc<ResolveProcess>,
    ) -> Result<Self> {
        Self::with_authority(
            sandbox,
            Authority::Authorized(resolve),
            limits,
            sessions,
            session,
            mode,
            file_input,
        )
    }

    fn with_authority(
        sandbox: Arc<Sandbox>,
        authority: Authority,
        limits: CommandLimits,
        sessions: Arc<ProcessSessions>,
        session: SessionId,
        mode: CommandToolMode,
        file_input: CommandFileInput,
    ) -> Result<Self> {
        if !(1..=64 * 1024).contains(&limits.max_input_bytes)
            || !(1..=64 * 1024).contains(&limits.max_output_bytes)
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_command_limits",
            ));
        }
        if file_input != CommandFileInput::None
            && (matches!(authority, Authority::Fixed { .. }) || mode.full_access())
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "command_input_file_requires_confinement",
            ));
        }
        let shared = Arc::new(Shared {
            sandbox,
            authority,
            mode,
            file_input,
            sessions,
            session,
            recorded: Mutex::default(),
        });
        Ok(Self {
            exec: Arc::new(ExecCommand {
                definition: exec_definition(mode, file_input, limits)?,
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

fn exec_definition(
    mode: CommandToolMode,
    file_input: CommandFileInput,
    limits: CommandLimits,
) -> Result<ToolDefinition> {
    let unconfined = mode.full_access();
    let mut schema = json!({
        "type": "object",
        "properties": {
            "cmd": {"type": "string", "description": "Shell command to execute."},
            "workdir": {"type": "string", "description": "Absolute working directory within the selected directory. Omit for its root. Use this field or cd in cmd to run in a subfolder."},
            "tty": {"type": "boolean", "description": "True allocates a pseudo-terminal for the command; false or omitted uses plain pipes with stdin closed."},
            "yield_time_ms": {"type": "number", "description": "How long to wait for the command before returning. Defaults to 10000 ms; effective range is 250-30000 ms."},
            "max_output_tokens": {"type": "number", "description": "Output token budget. Defaults to 10000 tokens; larger requests may be capped."}
        },
        "required": ["cmd"],
        "additionalProperties": false
    });
    let mut description = "Runs a command in a PTY or pipes, returning output or a session ID for ongoing interaction. The command runs with `sh -c` semantics in the user's shell (sh, bash, zsh or dash) inside a sandbox: network access is denied and writes stay inside granted locations. A command still running when the wait ends keeps running; continue with write_stdin and its session ID.".to_owned();
    if mode.network() == CommandNetwork::Managed {
        description = "Runs a command in a PTY or pipes under the workspace sandbox. Outbound HTTPS uses the managed proxy and each destination is reviewed on first connection. Use ordinary exec_command for downloads and package installs. Use a workspace or temporary cache if needed. Poll a running command with write_stdin and its session ID.".into();
    }
    if unconfined {
        description = "Runs a command in a PTY or pipes with sh -c semantics in the user's shell (sh, bash, zsh or dash). Full access was explicitly selected: OS filesystem/network sandboxing is disabled, and commands can use the current OS user's files and network without further approval. This does not grant elevated OS privileges. A command still running when the wait ends keeps running; continue with write_stdin and its session ID.".into();
    }
    if !matches!(mode, CommandToolMode::Fixed) {
        schema["properties"]["access"] = json!({"enum": ["read", "read_write"], "description": if unconfined { "Declare the intended operation. Full access does not confine filesystem or network effects, including when read is selected." } else { "read lets the command read the directory; read_write also lets it write there." }});
        schema["properties"]["directory"] = json!({"type": "string", "description": "ID of a configured directory grant. Omit for the primary directory, including when workdir points to one of its subfolders."});
        schema["required"] = json!(["cmd", "access"]);
        description.push_str(" Select read or read_write access explicitly. The working directory must be inside the selected directory.");
    }
    if mode.network() == CommandNetwork::ExactDestination {
        schema["properties"]["network"] = json!({
            "type":"object", "properties":{"host":{"type":"string"},"port":{"type":"integer","minimum":1,"maximum":65535}},
            "required":["host","port"], "additionalProperties":false,
            "description":"Request one TCP connection to an exact public DNS host and port for this command. Use curl or another client that honors the supplied SOCKS5 proxy URL. Omit tty and yield_time_ms. The command ends within 30 seconds."
        });
        description.push_str(" On request, a one-action approval permits a single proxied connection. Raw sockets stay denied.");
    }
    if mode.allows_escalation() {
        schema["properties"]["sandbox_permissions"] = json!({
            "type": "string", "enum": ["use_default", "require_escalated"],
            "description": "Defaults to use_default. Use require_escalated and a justification to request one reviewed command when the default sandbox blocks necessary access. Use pipes with stdin closed."
        });
        schema["properties"]["justification"] = json!({
            "type": "string", "minLength": 1, "maxLength": MAX_JUSTIFICATION_BYTES,
            "description": format!("For require_escalated only. Explain in one line (up to {MAX_JUSTIFICATION_BYTES} UTF-8 bytes) what this command will do and which additional access it needs.")
        });
        description.push_str(" Use the default sandbox where possible. A reviewed command retains protected paths and the selected directory's access rules. Poll output or interrupt the process with write_stdin.");
    }
    if mode.network() == CommandNetwork::ManagedRetry {
        description.push_str(" For managed outbound commands, use a cache in the workspace or $TMPDIR if the usual cache is not writable. Poll a running command to completion when its result is needed.");
        schema["properties"]["network_access"] = json!({
            "type": "boolean",
            "description": "With require_escalated, request outbound HTTPS through the managed proxy. Each destination is reviewed when the command first connects."
        });
    }
    if mode.allows_local_listener() {
        schema["properties"]["listen_port"] = json!({
            "type": "integer", "minimum": 1, "maximum": 65535,
            "description": "With require_escalated, allow a TCP listener and loopback connections on this port for one command. For a local preview, use a loopback-only server or bind explicitly to 127.0.0.1 or ::1 on this port."
        });
    }
    let plan = matches!(mode, CommandToolMode::Plan);
    if plan {
        let properties = schema["properties"]
            .as_object_mut()
            .expect("command properties");
        properties.remove("tty");
        properties.remove("yield_time_ms");
        properties.insert(
            "access".into(),
            json!({
                "enum": ["read"],
                "description": "Read-only in Plan. Omit to use read access."
            }),
        );
        schema["required"] = json!(["cmd"]);
        description = "Run a read-only workspace command with /bin/sh in noninteractive pipes for up to 30 seconds. Network access is disabled, workspace files cannot change, and each run has its own temporary scratch directory. Omit directory and workdir to start at the primary workspace root.".into();
    }
    let version = match file_input {
        CommandFileInput::None if plan => 2,
        CommandFileInput::None => 1,
        CommandFileInput::Scoped => {
            schema["properties"]["input_file"] = json!({
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "Explicit ID for a separately scoped file read."},
                    "path": {"type": "string", "description": "File path relative to that directory."}
                },
                "required": ["directory", "path"],
                "additionalProperties": false,
                "description": "Read one separately scoped file into stdin, followed by EOF. This file grants no filesystem access to the command. For an approved read outside the workspace, use directory external-file and the absolute target path without its leading slash. The command starts in the primary workspace. Use read access and omit workdir, the command-level directory, tty, yield_time_ms and network."
            });
            description.push_str(" Use input_file only for a separately scoped file read. The host checks that grant and supplies the bounded contents on stdin to one offline, read-only command with /bin/sh.");
            5
        }
    };
    Ok(ToolDefinition {
        id: ToolId::new(EXEC_COMMAND)?,
        version: if mode.allows_escalation() { 7 } else { version },
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
pub(crate) struct ScopedCommandInput {
    pub(crate) directory: BindingId,
    pub(crate) path: PathBuf,
}

#[derive(Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum SandboxPermissions {
    #[default]
    UseDefault,
    RequireEscalated,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExecArguments {
    pub(crate) cmd: String,
    #[serde(default)]
    sandbox_permissions: SandboxPermissions,
    justification: Option<String>,
    pub(crate) network: Option<super::CommandNetworkDestination>,
    #[serde(default)]
    pub(crate) network_access: bool,
    pub(crate) listen_port: Option<std::num::NonZeroU16>,
    pub(crate) workdir: Option<PathBuf>,
    #[serde(default)]
    pub(crate) tty: bool,
    yield_time_ms: Option<f64>,
    max_output_tokens: Option<f64>,
    pub(crate) directory: Option<BindingId>,
    pub(crate) access: Option<CommandAccess>,
    pub(crate) input_file: Option<ScopedCommandInput>,
    #[serde(skip)]
    plan: bool,
}

impl ExecArguments {
    pub(crate) fn parse_for_mode(
        arguments: &ToolArguments,
        maximum: usize,
        mode: CommandToolMode,
        file_input: CommandFileInput,
    ) -> Result<Self> {
        let scoped = !matches!(mode, CommandToolMode::Fixed);
        let plan = matches!(mode, CommandToolMode::Plan);
        let value = json_arguments(arguments, maximum)?;
        if value.get("input_file").is_some() && file_input == CommandFileInput::None {
            return Err(invalid());
        }
        let mut command: Self = serde_json::from_value(value.clone()).map_err(|_| invalid())?;
        match command.sandbox_permissions {
            SandboxPermissions::RequireEscalated => {
                if value.get("listen_port").is_some() && command.listen_port.is_none() {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "command_listener_port_invalid",
                    ));
                }
                if command.network_access && command.listen_port.is_some() {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "command_network_scope_conflict",
                    ));
                }
                if command.tty
                    || value.get("network").is_some()
                    || value.get("input_file").is_some()
                {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "command_escalation_requires_plain_pipes",
                    ));
                }
                if !command.justification.as_deref().is_some_and(|reason| {
                    !reason.trim().is_empty()
                        && reason.len() <= MAX_JUSTIFICATION_BYTES
                        && !reason.chars().any(char::is_control)
                }) {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "command_escalation_justification_invalid",
                    ));
                }
            }
            SandboxPermissions::UseDefault
                if value.get("justification").is_some()
                    || value.get("listen_port").is_some()
                    || value.get("network_access").is_some() =>
            {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "command_escalation_justification_unexpected",
                ));
            }
            SandboxPermissions::UseDefault => {}
        }
        if plan {
            if command.access == Some(CommandAccess::ReadWrite)
                || value.get("access").is_some_and(|access| access.is_null())
                || command.tty
                || value.get("yield_time_ms").is_some()
                || value.get("network").is_some()
            {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "plan_command_read_only",
                ));
            }
            command.access = Some(CommandAccess::Read);
            command.plan = true;
        }
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
        if value.get("input_file").is_some() {
            let input = command.input_file.as_ref().ok_or_else(invalid)?;
            if command.access != Some(CommandAccess::Read)
                || ["workdir", "directory", "tty", "yield_time_ms", "network"]
                    .iter()
                    .any(|field| value.get(field).is_some())
            {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "command_input_file_requires_read_only_pipes",
                ));
            }
            if input.path.as_os_str().is_empty() {
                return Err(invalid());
            }
            crate::file_tools::validate_path(&input.path)?;
        }
        if let Some(destination) = &command.network {
            if !scoped || !command.supports_finite() {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "command_network_requires_finite_pipes",
                ));
            }
            destination.validate()?;
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

    pub(crate) fn supports_finite(&self) -> bool {
        !self.tty && self.yield_time_ms.is_none() && self.escalation_justification().is_none()
    }

    /// A valid request can be declined by the current permissions after the
    /// runtime has claimed the tool call and can return a regular result.
    pub(crate) fn check_retry_scope(&self, mode: CommandToolMode) -> Result<()> {
        if self.sandbox_permissions == SandboxPermissions::RequireEscalated
            && !mode.allows_escalation()
        {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "command_escalation_unavailable",
            ));
        }
        if self.network_access && mode.network() != CommandNetwork::ManagedRetry {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "command_network_unavailable",
            ));
        }
        if self.listen_port.is_some() && !mode.allows_local_listener() {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "command_listener_unavailable",
            ));
        }
        Ok(())
    }

    pub(crate) fn escalation_justification(&self) -> Option<&str> {
        self.justification.as_deref()
    }

    /// Run in the named or default directory, starting from the host's
    /// environment. Plan and separately scoped input use the system shell
    /// from the confined runtime.
    pub(crate) fn spec(
        &self,
        root: &Path,
        environment: &BTreeMap<String, String>,
        finite: bool,
    ) -> ProcessSpec {
        ProcessSpec {
            executable: if self.plan || self.input_file.is_some() {
                PathBuf::from(DEFAULT_SHELL)
            } else {
                shell(environment)
            },
            arguments: vec!["-c".into(), self.cmd.clone()],
            cwd: self.workdir.clone().unwrap_or_else(|| root.to_owned()),
            environment: environment.clone(),
            stdin: Vec::new(),
            timeout: if finite {
                Duration::from_secs(30)
            } else {
                SPECIFICATION_TIMEOUT
            },
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
    fn parse_arguments(&self, arguments: &ToolArguments) -> Result<ExecArguments> {
        ExecArguments::parse_for_mode(
            arguments,
            self.definition.max_input_bytes,
            self.shared.mode,
            self.shared.file_input,
        )
    }

    async fn run(&self, invocation: &Invocation, context: &InvocationContext) -> ToolOutcome {
        let started = Instant::now();
        let shared = &self.shared;
        let arguments = match self.parse_arguments(invocation.arguments()) {
            Ok(arguments) => arguments,
            Err(error) => return ToolOutcome::failed(&error.code),
        };
        if let Err(error) = arguments.check_retry_scope(shared.mode) {
            return ToolOutcome::failed(&error.code);
        }
        let maximum = context
            .max_output_bytes
            .min(self.definition.max_output_bytes);
        let budget = output_budget(arguments.max_output_tokens, maximum);
        let (scope, capture, environment, root) = match &shared.authority {
            Authority::Fixed {
                scope,
                environment,
                root,
            } => (
                ProcessScope::Confined((**scope).clone()),
                None,
                environment.clone(),
                root.clone(),
            ),
            Authority::Authorized(resolve) => match resolve(invocation) {
                Ok(authority) if authority.spawn_finite.is_some() => {
                    if !arguments.supports_finite() {
                        return ToolOutcome::failed("command_finite_required");
                    }
                    return self
                        .run_finite(authority, arguments, context, maximum)
                        .await;
                }
                Ok(_) if arguments.input_file.is_some() => {
                    return ToolOutcome::failed("command_input_file_unavailable");
                }
                Ok(_) if arguments.network.is_some() => {
                    return ToolOutcome::failed("command_network_unavailable");
                }
                Ok(authority) => (
                    authority.scope,
                    Some((authority.expected, authority.spawn)),
                    authority.environment,
                    authority.root,
                ),
                Err(error) => return ToolOutcome::failed(&error.code),
            },
        };
        let process_access = match (&scope, arguments.escalation_justification()) {
            (ProcessScope::Confined(_), None) => ProcessAccess::Confined,
            (ProcessScope::Confined(_), Some(_)) => ProcessAccess::Escalated,
            (ProcessScope::Unconfined(_), None) if shared.mode.full_access() => {
                ProcessAccess::FullAccess
            }
            _ => return ToolOutcome::failed("command_scope_changed"),
        };
        let spec = arguments.spec(&root, &environment, false);
        let cwd = spec.cwd.clone();
        let launch = match shared
            .sessions
            .admit_attempt(&shared.session, &context.attempt)
        {
            Ok(launch) => launch,
            Err(error) => return ToolOutcome::failed(&error.code),
        };
        if context.cancellation.is_cancelled() || scope.valid_until() <= Instant::now() {
            return cancelled();
        }
        // The process belongs to the chat, not to this call or its turn.
        let stop = launch.stop();
        let options = SessionOptions {
            terminal: arguments.tty,
            retained_output_bytes: RETAINED_OUTPUT_BYTES,
        };
        let sandbox = shared.sandbox.clone();
        let cancellation = context.cancellation.clone();
        let launch_stop = stop.clone();
        let launched = tokio::task::spawn_blocking(move || {
            if cancellation.is_cancelled() || launch_stop.is_cancelled() {
                return Ok(None);
            }
            // Native preparation may inspect paths before it decides
            // containment. Its diagnostics must not disclose whether a
            // refused path exists.
            let prepared = scope
                .prepare(&sandbox, spec)
                .map_err(|error| Error::new(error.kind, "command_preparation_refused"))?;
            if cancellation.is_cancelled() || launch_stop.is_cancelled() {
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
            launch,
            arguments.cmd.clone(),
            cwd,
            arguments.tty,
            process_access,
            running,
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

impl ExecCommand {
    async fn run_finite(
        &self,
        authority: AuthorizedProcess,
        arguments: ExecArguments,
        context: &InvocationContext,
        maximum: usize,
    ) -> ToolOutcome {
        let started = Instant::now();
        let budget = output_budget(arguments.max_output_tokens, maximum);
        let spec = arguments.spec(&authority.root, &authority.environment, true);
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        let network_deadline = authority.scope.valid_until().min(started + spec.timeout);
        let Some(spawn) = authority.spawn_finite else {
            return ToolOutcome::failed("command_finite_unavailable");
        };
        let sandbox = self.shared.sandbox.clone();
        if context.cancellation.is_cancelled() {
            return cancelled();
        }
        let launch = match self
            .shared
            .sessions
            .admit_attempt(&self.shared.session, &context.attempt)
        {
            Ok(launch) => launch,
            Err(error) => return ToolOutcome::failed(&error.code),
        };
        let stop = launch.stop();
        let _on_drop = stop.clone().drop_guard();
        let launch_stop = stop.clone();
        let prepare = move || {
            let prepared = authority
                .scope
                .prepare(&sandbox, spec)
                .map_err(|e| Error::new(e.kind, "command_preparation_refused"))?;
            if prepared.capture_fingerprint()? != authority.expected {
                return Err(Error::new(ErrorKind::Conflict, "command_capture_changed"));
            }
            if launch_stop.is_cancelled() {
                return Err(Error::new(ErrorKind::InvalidState, "command_cancelled"));
            }
            let launch = match arguments.network {
                #[cfg(any(target_os = "macos", target_os = "linux"))]
                Some(destination) => {
                    let home = authority.network_home.ok_or_else(|| {
                        Error::new(ErrorKind::Unavailable, "command_network_unavailable")
                    })?;
                    FiniteLaunch::Network(super::network::CommandMediator::bind(
                        &home,
                        destination,
                        network_deadline,
                    )?)
                }
                #[cfg(not(any(target_os = "macos", target_os = "linux")))]
                Some(_) => {
                    return Err(Error::new(
                        ErrorKind::Unavailable,
                        "command_network_unavailable",
                    ));
                }
                None => FiniteLaunch::Confined,
            };
            spawn(prepared, launch, launch_stop)
        };
        let mut worker = launch.supervise_finite(async move {
            let command = tokio::task::spawn_blocking(prepare)
                .await
                .map_err(|_| Error::new(ErrorKind::Uncertain, "command_launch_unverified"))??;
            match command {
                FiniteCommand::Confined(command) => Ok(super::FiniteEvidence {
                    process: command.finish().await?,
                    transfer_limit_exceeded: false,
                }),
                #[cfg(any(target_os = "macos", target_os = "linux"))]
                FiniteCommand::Network(command) => command.finish().await,
            }
        });
        let result = tokio::select! {
            result = &mut worker => result,
            _ = context.cancellation.cancelled() => {
                stop.cancel();
                worker.await
            }
        };
        let finite = match result {
            Ok(Ok(finite)) => finite,
            Ok(Err(error)) if error.code == "command_cancelled" => return cancelled(),
            Ok(Err(error)) if error.kind != ErrorKind::Uncertain => {
                return ToolOutcome::failed(&error.code);
            }
            _ => return ToolOutcome::uncertain(),
        };
        let ending = finite.ending();
        let evidence = finite.process;
        let mut captured = output::Captured::default();
        for output in [evidence.stdout, evidence.stderr] {
            captured.push(agent_kit_sandbox::SessionRead {
                output,
                ..Default::default()
            });
        }
        let mut outcome = output::outcome(
            ending.status,
            started.elapsed(),
            &Standing::Ended(&ending),
            &captured,
            budget,
            maximum,
        );
        outcome.truncated |= evidence.output_truncated;
        outcome
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
        if entry.access == ProcessAccess::FullAccess && !shared.mode.full_access() {
            return ToolOutcome::failed("process_requires_full_access");
        }
        if entry.access == ProcessAccess::Escalated
            && !arguments.chars.is_empty()
            && arguments.chars != INTERRUPT
        {
            return ToolOutcome::failed(
                "stdin is closed for the approved command. Poll or interrupt the process.",
            );
        }
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
        self.parse_arguments(arguments).map(|_| ())
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

    const WORKSPACE: CommandToolMode = CommandToolMode::Act {
        unconfined: false,
        network: CommandNetwork::ExactDestination,
        allow_escalation: false,
    };

    fn parse(
        value: serde_json::Value,
        mode: CommandToolMode,
        file_input: CommandFileInput,
    ) -> Result<ExecArguments> {
        ExecArguments::parse_for_mode(&ToolArguments::Json(value), 4096, mode, file_input)
    }

    fn exec(value: serde_json::Value, scoped: bool) -> Result<ExecArguments> {
        parse(
            value,
            if scoped {
                WORKSPACE
            } else {
                CommandToolMode::Fixed
            },
            CommandFileInput::None,
        )
    }

    #[test]
    fn exec_arguments_are_bounded_and_carry_no_host_controls() {
        assert!(exec(json!({"cmd": "npm test"}), false).is_ok());
        assert!(exec(json!({"cmd": "ls", "access": "read"}), true).is_ok());
        let network = json!({"host":"updates.example","port":443});
        assert!(
            exec(
                json!({"cmd":"curl", "access":"read", "network":network}),
                true
            )
            .unwrap()
            .supports_finite()
        );
        for (field, value) in [("tty", json!(true)), ("yield_time_ms", json!(500))] {
            let mut input = json!({"cmd":"curl", "access":"read"});
            input[field] = value;
            assert!(!exec(input.clone(), true).unwrap().supports_finite());
            input["network"] = network.clone();
            assert!(exec(input, true).is_err());
        }
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
            ExecArguments::parse_for_mode(
                &ToolArguments::Json(json!({"cmd": "ls"})),
                4,
                CommandToolMode::Fixed,
                CommandFileInput::None
            )
            .err()
            .unwrap()
            .code,
            "command_input_limit"
        );
    }

    #[test]
    fn plan_arguments_are_always_read_only_and_finite() {
        let parse = |value| parse(value, CommandToolMode::Plan, CommandFileInput::None);
        for input in [json!({"cmd":"ls"}), json!({"cmd":"ls", "access":"read"})] {
            let arguments = parse(input).unwrap();
            assert_eq!(arguments.access, Some(CommandAccess::Read));
            assert!(arguments.supports_finite());
        }
        for input in [
            json!({"cmd":"ls", "access":"read_write"}),
            json!({"cmd":"ls", "access":null}),
            json!({"cmd":"ls", "tty":true}),
            json!({"cmd":"ls", "yield_time_ms":250}),
            json!({"cmd":"ls", "network":{"host":"example.com","port":443}}),
        ] {
            assert_eq!(parse(input).err().unwrap().code, "plan_command_read_only");
        }
    }

    #[test]
    fn escalation_is_one_justified_pipe_command_on_an_enabled_workspace() {
        let enabled = CommandToolMode::Act {
            unconfined: false,
            network: CommandNetwork::ExactDestination,
            allow_escalation: true,
        };
        let limits = CommandLimits {
            timeout: Duration::from_secs(1),
            max_input_bytes: 4096,
            max_output_bytes: 4096,
        };
        let properties = |mode| {
            let definition = exec_definition(mode, CommandFileInput::None, limits).unwrap();
            let InputFormat::Json(schema) = definition.input else {
                panic!("expected JSON schema")
            };
            schema["properties"].clone()
        };
        let request = json!({
            "cmd":"pwd", "access":"read",
            "sandbox_permissions":"require_escalated", "justification":"Check the selected directory."
        });
        for mode in [
            CommandToolMode::Fixed,
            CommandToolMode::Plan,
            WORKSPACE,
            CommandToolMode::Act {
                unconfined: true,
                network: CommandNetwork::Offline,
                allow_escalation: true,
            },
        ] {
            assert!(properties(mode).get("sandbox_permissions").is_none());
            let mut request = request.clone();
            if matches!(mode, CommandToolMode::Fixed) {
                request.as_object_mut().unwrap().remove("access");
            }
            let request = parse(request, mode, CommandFileInput::None).unwrap();
            assert_eq!(
                request.check_retry_scope(mode).unwrap_err().code,
                "command_escalation_unavailable"
            );
        }
        assert_eq!(
            properties(enabled)["sandbox_permissions"]["enum"],
            json!(["use_default", "require_escalated"])
        );
        let parse = |input| parse(input, enabled, CommandFileInput::Scoped);
        let auth = parse(request.clone()).unwrap();
        assert_eq!(
            auth.escalation_justification(),
            Some("Check the selected directory.")
        );
        assert!(!auth.supports_finite());
        let mut yielding = request.clone();
        yielding["yield_time_ms"] = json!(250);
        assert!(parse(yielding).is_ok());
        let mut listener = request.clone();
        listener["access"] = json!("read");
        listener["listen_port"] = json!(43000);
        assert!(parse(listener).is_ok());
        assert_eq!(
            properties(enabled).get("listen_port").is_some(),
            cfg!(target_os = "macos")
        );

        let defaults = json!({"cmd":"ls","access":"read", "sandbox_permissions":"use_default"});
        assert!(
            parse(defaults)
                .unwrap()
                .escalation_justification()
                .is_none()
        );
        let mut missing = request.clone();
        missing.as_object_mut().unwrap().remove("justification");
        assert!(parse(missing).is_err());
        let mut at_limit = request.clone();
        at_limit["justification"] = json!("é".repeat(MAX_JUSTIFICATION_BYTES / 2));
        assert!(parse(at_limit).is_ok());
        for (field, invalid) in [
            ("listen_port", json!(0)),
            ("listen_port", json!(null)),
            ("listen_port", json!(65536)),
            ("justification", json!(null)),
            ("justification", json!("   ")),
            (
                "justification",
                json!("é".repeat(MAX_JUSTIFICATION_BYTES / 2 + 1)),
            ),
            ("justification", json!("reason\nsecond line")),
            ("sandbox_permissions", json!("use_default")),
            ("sandbox_permissions", json!("other")),
            ("tty", json!(true)),
            (
                "input_file",
                json!({"directory":"selected","path":"index.html"}),
            ),
            ("network", json!({"host":"example.com","port":443})),
        ] {
            let mut input = request.clone();
            input[field] = invalid;
            assert!(parse(input).is_err(), "{field}");
        }
    }

    #[test]
    fn scoped_input_is_one_relative_file_and_only_for_finite_read_pipes() {
        let input_file = json!({"directory": "chosen", "path": "report.txt"});
        let input = json!({"cmd": "cat", "access": "read", "input_file": input_file});
        let parse = |value, plan, file_input| {
            parse(
                value,
                if plan {
                    CommandToolMode::Plan
                } else {
                    WORKSPACE
                },
                file_input,
            )
        };
        let command = parse(input.clone(), false, CommandFileInput::Scoped).unwrap();
        assert!(command.supports_finite());
        assert_eq!(command.access, Some(CommandAccess::Read));
        let file = command.input_file.unwrap();
        assert_eq!(file.directory.as_str(), "chosen");
        assert_eq!(file.path, Path::new("report.txt"));
        assert!(parse(input.clone(), false, CommandFileInput::None).is_err());
        assert!(parse(input.clone(), true, CommandFileInput::None).is_err());
        let mut implicit = input.clone();
        implicit.as_object_mut().unwrap().remove("access");
        assert!(parse(implicit.clone(), true, CommandFileInput::Scoped).is_ok());
        assert!(parse(implicit, false, CommandFileInput::Scoped).is_err());
        for (key, value) in [
            ("access", json!("read_write")),
            ("directory", json!("other")),
            ("workdir", json!("/primary")),
            ("tty", json!(false)),
            ("yield_time_ms", json!(250)),
            ("network", json!(null)),
            ("input_file", json!(null)),
            ("input_file", json!({"path":"report.txt"})),
            ("input_file", json!({"directory":"chosen","path":""})),
            (
                "input_file",
                json!({"directory":"chosen","path":"/report.txt"}),
            ),
            (
                "input_file",
                json!({"directory":"chosen","path":"../report.txt"}),
            ),
        ] {
            let mut invalid = input.clone();
            invalid[key] = value;
            assert!(
                parse(invalid.clone(), false, CommandFileInput::Scoped).is_err(),
                "{invalid}"
            );
            assert!(
                parse(invalid.clone(), true, CommandFileInput::Scoped).is_err(),
                "{invalid}"
            );
        }
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
        use std::os::unix::fs::PermissionsExt;

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
        std::fs::set_permissions(&plain, std::fs::Permissions::from_mode(0o700)).unwrap();
        let custom_shell = environment(plain.to_str().unwrap());
        assert_eq!(shell(&custom_shell), plain);
        let plan = parse(
            json!({"cmd": "ls"}),
            CommandToolMode::Plan,
            CommandFileInput::None,
        )
        .unwrap()
        .spec(Path::new("/project"), &custom_shell, true);
        assert_eq!(plan.executable, Path::new(DEFAULT_SHELL));

        let spec = exec(json!({"cmd": "echo hi", "tty": true}), false)
            .unwrap()
            .spec(Path::new("/project"), &environment("/bin/sh"), false);
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
