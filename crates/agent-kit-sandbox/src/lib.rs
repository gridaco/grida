//! Finite commands under a host-issued, denied-network native scope.
//!
//! GRIDA-SEC-004 — native confinement for host-approved processes.
//!
//! The caller decides current authority and supplies an [`ExecutionScope`]
//! and [`ProcessSpec`]. This crate prepares the exact launch, confines it
//! with Seatbelt (macOS) or bubblewrap (Linux), and returns
//! [`ProcessEvidence`] that never claims more than the backend established.
//! Other targets compile, and every operation returns `Unsupported`
//! `native_sandbox_unavailable`.

use agent_kit_core::authority::GrantSelection;
use agent_kit_core::{BindingId, CancellationToken, Error, ErrorKind, Fingerprint, Result};
use std::collections::BTreeMap;
use std::fmt;
use std::path::PathBuf;
use std::time::{Duration, Instant};

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod native;
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod wire;

/// An executable the caller has already placed under its own custody.
///
/// The file must be a regular, non-setuid, executable file that no group or
/// other user can write, at most 128 MiB, whose contents hash to `sha256`.
/// The sandbox pins its identity and rechecks the digest before each launch.
/// Keep it outside every writable scope.
#[derive(Clone, Debug)]
pub struct TrustedExecutable {
    /// Absolute path. It is canonicalized and must not change identity.
    pub path: PathBuf,
    /// SHA-256 digest of the exact file contents.
    pub sha256: [u8; 32],
}

/// The trusted launchers a [`Sandbox`] uses.
#[derive(Clone, Debug)]
pub struct Installation {
    /// This crate's `agent-kit-sandbox-helper` binary of the same version.
    pub helper: TrustedExecutable,
    /// A non-setuid bubblewrap (0.8 or later). Required on Linux, ignored on
    /// macOS.
    pub bubblewrap: Option<TrustedExecutable>,
}

/// How far the backend must be able to stop the launched work.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Termination {
    /// The launcher's own process group. A descendant that creates another
    /// session can outlive it.
    ProcessGroup,
    /// Every descendant. Only the Linux PID namespace provides this; macOS
    /// refuses the requirement with `sandbox_descendant_guarantee_unavailable`.
    AllDescendants,
}

/// What a [`ProtectedPath`] withholds.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeniedAccess {
    /// The path stays readable where the scope allows reads, never writable.
    Write,
    /// The path is neither readable nor writable.
    ReadWrite,
}

/// A path the process must not reach, whether or not it exists yet.
#[derive(Clone, Debug)]
pub struct ProtectedPath {
    /// Absolute path. Missing trailing components are allowed.
    pub path: PathBuf,
    pub access: DeniedAccess,
}

/// The trusted host issues this scope after evaluating its current policy.
#[derive(Clone, Debug)]
pub struct ExecutionScope {
    /// The caller's grants this scope realizes. Folded into the capture
    /// fingerprint; an empty selection is refused as `sandbox_scope_ungranted`.
    pub grants: GrantSelection,
    /// The caller's policy revision, folded into the capture fingerprint.
    pub revision: BindingId,
    /// Preparation and launch are refused at or after this instant, and a
    /// running process is stopped with [`StopReason::Deadline`].
    pub valid_until: Instant,
    /// Readable and executable locations. `/` itself cannot be granted.
    pub read: Vec<PathBuf>,
    /// Readable, writable and executable locations.
    pub write: Vec<PathBuf>,
    /// Read-only locations for the executable, interpreters and libraries.
    /// On Linux each is also mounted at the path as given, so a symlinked
    /// system directory such as `/lib` resolves inside the sandbox. Under
    /// `disk_read` the host's own link is visible and resolves instead.
    pub runtime: Vec<PathBuf>,
    /// Protected paths stay unreadable (`ReadWrite`) or unwritable (`Write`),
    /// including paths that do not exist yet. One inside a granted location
    /// is carved out of that location. One that equals or contains a granted
    /// location makes the scope unusable (`sandbox_protected_overlap`) when
    /// that location grants what it denies: any location under an unreadable
    /// path, or a writable location under an unwritable one. A read or
    /// runtime location under an unwritable path stays read-only.
    pub protected: Vec<ProtectedPath>,
    /// A directory only the current user can access (mode `0700` or
    /// stricter), outside every granted location. Each launch gets a private
    /// directory beneath it, exposed as `TMPDIR`, `TMP` and `TEMP` and removed
    /// afterwards. Other launches' directories stay hidden, also under
    /// `disk_read`.
    pub temporary_parent: PathBuf,
    pub termination: Termination,
    /// Read and execute anywhere the user can, except `ReadWrite`-protected
    /// paths and other launches' temporary storage. Writes still come only
    /// from `write` and private temporary storage.
    pub disk_read: bool,
}

/// The exact process to launch inside an [`ExecutionScope`].
pub struct ProcessSpec {
    /// Absolute path of a regular file covered by the scope (or anywhere
    /// readable under `disk_read`).
    pub executable: PathBuf,
    /// Arguments after the program name. No argument may contain NUL.
    pub arguments: Vec<String>,
    /// Working directory inside a read or write location.
    pub cwd: PathBuf,
    /// The complete payload environment. Nothing is inherited. `TMPDIR`,
    /// `TMP` and `TEMP` are replaced with the private temporary directory.
    pub environment: BTreeMap<String, String>,
    /// Fixed stdin, at most 1 MiB, followed by EOF.
    pub stdin: Vec<u8>,
    /// Wall-clock limit, at most 15 minutes. The scope deadline also applies.
    pub timeout: Duration,
    /// Combined stdout and stderr budget, 1 byte to 8 MiB. Exceeding it
    /// stops the process with [`StopReason::OutputLimit`].
    pub max_output_bytes: usize,
}

impl fmt::Debug for ProcessSpec {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProcessSpec")
            .field("executable", &self.executable)
            .field("cwd", &self.cwd)
            .field("timeout", &self.timeout)
            .field("max_output_bytes", &self.max_output_bytes)
            .finish_non_exhaustive()
    }
}

/// The native confinement mechanism.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Backend {
    /// macOS `sandbox-exec` with a generated deny-by-default profile.
    Seatbelt,
    /// Linux bubblewrap namespaces with a seccomp filter.
    Bubblewrap,
}

/// What the backend provides for a scope.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Support {
    pub backend: Backend,
    /// The termination guarantee actually provided. Linux always provides
    /// [`Termination::AllDescendants`].
    pub termination: Termination,
}

/// Why the sandbox stopped a process before it finished on its own.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StopReason {
    /// Cancellation token, [`RunningProcess::request_stop`], or the running
    /// handle was dropped.
    Requested,
    /// The process timeout or the scope's `valid_until` passed.
    Deadline,
    /// Streamed stdin exceeded 1 MiB.
    InputLimit,
    /// Output exceeded `max_output_bytes`.
    OutputLimit,
}

/// How the payload ended, as reported by the trusted helper.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Completion {
    /// The payload started and exited with this code.
    Exited(i32),
    /// The payload started and was terminated by this signal.
    Signaled(i32),
    /// The helper reported that the payload never started.
    SetupFailed,
    /// The status channel ended without a complete report. The payload may
    /// have started and may have had effects.
    Uncertain,
}

/// What the backend established about the launched process tree.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Descendants {
    /// No payload started and the launcher was reaped.
    NoPayload,
    /// The owned process group was signalled and its leader reaped. A
    /// descendant in another session may continue.
    ProcessGroupSignalled,
    /// The payload finished on its own, the launcher was reaped, and with it
    /// the PID namespace and every descendant ended.
    NamespaceEnded,
    /// Cleanup was not confirmed. Descendants and their effects may continue.
    Unverified,
}

/// Bounded output and native evidence of one launch.
pub struct ProcessEvidence {
    pub support: Support,
    pub completion: Completion,
    /// Set when the sandbox stopped the process or a limit was reached.
    pub stopped: Option<StopReason>,
    /// Captured stdout. Empty for a streamed launch, whose stdout went to the
    /// stream.
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    /// Output was cut at the budget, or a reader failed or did not drain in
    /// time.
    pub output_truncated: bool,
    pub descendants: Descendants,
    /// The private temporary directory was removed.
    pub temporary_removed: bool,
}

impl fmt::Debug for ProcessEvidence {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProcessEvidence")
            .field("support", &self.support)
            .field("completion", &self.completion)
            .field("stopped", &self.stopped)
            .field("output_truncated", &self.output_truncated)
            .field("descendants", &self.descendants)
            .field("temporary_removed", &self.temporary_removed)
            .finish_non_exhaustive()
    }
}

/// A verified installation of the trusted launchers.
pub struct Sandbox {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    native: native::Installation,
}

/// One exact launch, captured and checked but not started.
///
/// Dropping it removes its private temporary directory.
pub struct PreparedProcess {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    native: native::Prepared,
}

/// A launched process under supervision.
///
/// Supervision continues after this handle is dropped, but dropping it
/// requests a stop.
pub struct RunningProcess {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    native: native::Running,
}

impl Sandbox {
    /// Pin and verify the launchers. Linux also requires kernel 5.11 or later
    /// and refuses WSL.
    pub fn new(installation: Installation) -> Result<Self> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            Ok(Self {
                native: native::Installation::new(installation)?,
            })
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = installation;
            Err(unavailable())
        }
    }

    /// Check the actual native launch using the requested scope and an
    /// internal probe, including that the filesystem reports the location
    /// identities [`PreparedProcess::capture_fingerprint`] needs.
    pub async fn probe(&self, scope: &ExecutionScope) -> Result<Support> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            self.native.probe(scope).await
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = scope;
            Err(unavailable())
        }
    }

    /// Capture the exact launch: canonical locations and their identities,
    /// mandatory denials, limits, and the setup frame, which must fit the
    /// helper's limit. Allocates private temporary storage.
    pub fn prepare(&self, spec: ProcessSpec, scope: ExecutionScope) -> Result<PreparedProcess> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            Ok(PreparedProcess {
                native: self.native.prepare(spec, &scope)?,
            })
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = (spec, scope);
            Err(unavailable())
        }
    }
}

impl PreparedProcess {
    /// Verify system executable custody and the reviewed digest against the
    /// file bound by preparation. Ordinary commands do not use this check.
    pub fn verify_executable(&self, executable: &TrustedExecutable) -> Result<()> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        return self.native.verify_executable(executable);
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = executable;
            Err(unavailable())
        }
    }

    /// Identity of the process input and the exact native paths captured in
    /// this preparation. Output limits, deadlines and private temporary
    /// directories are execution bounds rather than part of this identity.
    pub fn capture_fingerprint(&self) -> Result<Fingerprint> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            self.native.capture_fingerprint()
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            Err(unavailable())
        }
    }

    /// Require the prepared working directory to belong to this exact
    /// host-opened read or write root, including its native identity.
    pub fn validate_working_root(&self, root: &std::fs::File) -> Result<()> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            self.native.validate_working_root(root)
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = root;
            Err(unavailable())
        }
    }

    /// Consume this exact preparation after the caller's admission barrier.
    ///
    /// Requires a Tokio runtime context. The launcher is started from a
    /// thread the sandbox owns, so the calling thread may end at any time.
    /// An `Uncertain` error means the launcher may have started.
    pub fn spawn(self, cancellation: CancellationToken) -> Result<RunningProcess> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            Ok(RunningProcess {
                native: self.native.spawn(cancellation)?,
            })
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let _ = cancellation;
            Err(unavailable())
        }
    }

    /// Open bounded, bidirectional stdio to a reviewed system executable.
    ///
    /// The stream carries only payload stdin and stdout. Closing its writer
    /// sends EOF. The running handle owns termination and evidence, including
    /// captured stderr. Read stdout while the process runs to allow progress.
    /// The process specification must have empty fixed stdin.
    ///
    /// Available only on macOS and Linux, since the stream type comes from
    /// the native runtime dependency.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub fn spawn_streaming(
        self,
        executable: &TrustedExecutable,
        cancellation: CancellationToken,
    ) -> Result<(RunningProcess, tokio::io::DuplexStream)> {
        let (native, stream) = self.native.spawn_streaming(executable, cancellation)?;
        Ok((RunningProcess { native }, stream))
    }
}

impl RunningProcess {
    /// Ask the supervisor to stop the process. Repeated requests are harmless.
    pub fn request_stop(&self) {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        self.native.request_stop();
    }

    /// Wait for supervision to end. A lost supervisor is `Uncertain`
    /// `sandbox_supervisor_lost`.
    pub async fn finish(self) -> Result<ProcessEvidence> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            self.native.finish().await
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            Err(unavailable())
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn unavailable() -> Error {
    Error::new(ErrorKind::Unsupported, "native_sandbox_unavailable")
}
