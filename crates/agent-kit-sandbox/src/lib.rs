//! Finite commands under a host-issued, denied-network native scope.

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

#[derive(Clone, Debug)]
pub struct TrustedExecutable {
    pub path: PathBuf,
    pub sha256: [u8; 32],
}

#[derive(Clone, Debug)]
pub struct Installation {
    pub helper: TrustedExecutable,
    pub bubblewrap: Option<TrustedExecutable>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Termination {
    ProcessGroup,
    AllDescendants,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeniedAccess {
    Write,
    ReadWrite,
}

#[derive(Clone, Debug)]
pub struct ProtectedPath {
    pub path: PathBuf,
    pub access: DeniedAccess,
}

/// The trusted host issues this scope after evaluating its current policy.
#[derive(Clone, Debug)]
pub struct ExecutionScope {
    pub grants: GrantSelection,
    pub revision: BindingId,
    pub valid_until: Instant,
    pub read: Vec<PathBuf>,
    pub write: Vec<PathBuf>,
    pub runtime: Vec<PathBuf>,
    pub protected: Vec<ProtectedPath>,
    pub temporary_parent: PathBuf,
    pub termination: Termination,
}

pub struct ProcessSpec {
    pub executable: PathBuf,
    pub arguments: Vec<String>,
    pub cwd: PathBuf,
    pub environment: BTreeMap<String, String>,
    pub stdin: Vec<u8>,
    pub timeout: Duration,
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Backend {
    Seatbelt,
    Bubblewrap,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Support {
    pub backend: Backend,
    pub termination: Termination,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StopReason {
    Requested,
    Deadline,
    InputLimit,
    OutputLimit,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Completion {
    Exited(i32),
    Signaled(i32),
    SetupFailed,
    Uncertain,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Descendants {
    NoPayload,
    ProcessGroupSignalled,
    NamespaceEnded,
    Unverified,
}

pub struct ProcessEvidence {
    pub support: Support,
    pub completion: Completion,
    pub stopped: Option<StopReason>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub output_truncated: bool,
    pub descendants: Descendants,
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

pub struct Sandbox {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    native: native::Installation,
}

pub struct PreparedProcess {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    native: native::Prepared,
}

pub struct RunningProcess {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    native: native::Running,
}

impl Sandbox {
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

    /// Check the actual native launch using the requested scope and an internal probe.
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
    pub fn request_stop(&self) {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        self.native.request_stop();
    }

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
