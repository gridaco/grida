use crate::wire::{self, Launch, PathIdentity, Task};
use crate::*;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;

mod process;

const MAX_PATHS: usize = 128;
const MAX_INPUT: usize = 1024 * 1024;
const MAX_OUTPUT: usize = 8 * 1024 * 1024;
const MAX_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MAX_TRUSTED_BINARY: u64 = 128 * 1024 * 1024;

fn refused(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}

struct Bound {
    identity: PathIdentity,
    directory: bool,
    _pin: File,
}

impl Bound {
    fn new(path: &Path) -> Result<Self> {
        let path = canonical(path)?;
        let expected = fs::symlink_metadata(&path)
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_location_unavailable"))?;
        if !expected.is_file() && !expected.is_dir() {
            return Err(refused(ErrorKind::InvalidInput, "sandbox_location_invalid"));
        }
        #[cfg(target_os = "linux")]
        let flags = libc::O_PATH | libc::O_NOFOLLOW;
        #[cfg(target_os = "macos")]
        let flags = libc::O_NONBLOCK | libc::O_NOFOLLOW;
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(flags)
            .open(&path)
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_location_unavailable"))?;
        let metadata = file
            .metadata()
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_location_unavailable"))?;
        if metadata.dev() != expected.dev() || metadata.ino() != expected.ino() {
            return Err(refused(ErrorKind::Conflict, "sandbox_location_changed"));
        }
        let identity = PathIdentity {
            path,
            device: metadata.dev(),
            inode: metadata.ino(),
        };
        if !identity.matches() {
            return Err(refused(ErrorKind::Conflict, "sandbox_location_changed"));
        }
        Ok(Self {
            identity,
            directory: metadata.is_dir(),
            _pin: file,
        })
    }

    fn includes(&self, path: &Path) -> bool {
        if self.directory {
            path.starts_with(&self.identity.path)
        } else {
            self.identity.path == path
        }
    }

    fn path(&self) -> &Path {
        &self.identity.path
    }
}

fn valid_path(path: &Path) -> bool {
    path.is_absolute()
        && path.to_str().is_some_and(|value| !value.contains('\0'))
        && !path
            .components()
            .any(|part| part == std::path::Component::ParentDir)
}

fn canonical(path: &Path) -> Result<PathBuf> {
    if !valid_path(path) {
        return Err(refused(
            ErrorKind::InvalidInput,
            "sandbox_absolute_path_required",
        ));
    }
    fs::canonicalize(path)
        .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_location_unavailable"))
}

fn protected_path(path: &Path) -> Result<PathBuf> {
    if !valid_path(path) {
        return Err(refused(
            ErrorKind::InvalidInput,
            "sandbox_absolute_path_required",
        ));
    }
    match fs::canonicalize(path) {
        Ok(path) => Ok(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let parent = path.parent().ok_or_else(|| {
                refused(ErrorKind::InvalidInput, "sandbox_protected_path_invalid")
            })?;
            let name = path.file_name().ok_or_else(|| {
                refused(ErrorKind::InvalidInput, "sandbox_protected_path_invalid")
            })?;
            Ok(protected_path(parent)?.join(name))
        }
        Err(_) => Err(refused(
            ErrorKind::Unavailable,
            "sandbox_protected_path_unavailable",
        )),
    }
}

struct Trusted {
    executable: TrustedExecutable,
    bound: Bound,
}

impl Trusted {
    fn new(executable: TrustedExecutable) -> Result<Self> {
        let bound = Bound::new(&executable.path)?;
        let trusted = Self { executable, bound };
        trusted.check()?;
        Ok(trusted)
    }

    fn check(&self) -> Result<()> {
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW)
            .open(self.bound.path())
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_launcher_missing"))?;
        let metadata = file
            .metadata()
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_launcher_missing"))?;
        if !metadata.is_file()
            || metadata.len() > MAX_TRUSTED_BINARY
            || metadata.mode() & 0o6000 != 0
            || metadata.mode() & 0o111 == 0
            || metadata.mode() & 0o022 != 0
            || metadata.dev() != self.bound.identity.device
            || metadata.ino() != self.bound.identity.inode
        {
            return Err(refused(ErrorKind::Unavailable, "sandbox_launcher_identity"));
        }
        let mut digest = Sha256::new();
        let mut reader = file.take(MAX_TRUSTED_BINARY + 1);
        let mut bytes = [0; 16 * 1024];
        loop {
            let read = reader
                .read(&mut bytes)
                .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_launcher_identity"))?;
            if read == 0 {
                break;
            }
            digest.update(&bytes[..read]);
        }
        let digest: [u8; 32] = digest.finalize().into();
        if digest != self.executable.sha256 || !self.bound.identity.matches() {
            return Err(refused(ErrorKind::Unavailable, "sandbox_launcher_identity"));
        }
        Ok(())
    }
}

pub(super) struct Installation {
    helper: Arc<Trusted>,
    #[cfg(target_os = "linux")]
    bubblewrap: Arc<Trusted>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum Access {
    Read,
    Write,
    Runtime,
}

struct Location {
    bound: Bound,
    access: Access,
    #[cfg(target_os = "linux")]
    destination: PathBuf,
}

pub(super) struct Prepared {
    helper: Arc<Trusted>,
    #[cfg(target_os = "linux")]
    bubblewrap: Arc<Trusted>,
    locations: Vec<Location>,
    anchors: Vec<Bound>,
    temporary: TempDir,
    launch: Launch,
    stdin: Vec<u8>,
    timeout: Duration,
    valid_until: Instant,
    max_output_bytes: usize,
    support: Support,
    _grants: GrantSelection,
    _revision: BindingId,
}

impl Installation {
    pub(super) fn new(installation: crate::Installation) -> Result<Self> {
        #[cfg(target_os = "linux")]
        if fs::read_to_string("/proc/sys/kernel/osrelease")
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_linux_kernel_unknown"))?
            .to_ascii_lowercase()
            .contains("microsoft")
        {
            return Err(refused(ErrorKind::Unsupported, "sandbox_wsl_unavailable"));
        }
        let helper = Arc::new(Trusted::new(installation.helper)?);
        #[cfg(target_os = "linux")]
        let bubblewrap =
            Arc::new(Trusted::new(installation.bubblewrap.ok_or_else(|| {
                refused(ErrorKind::Unavailable, "sandbox_bubblewrap_missing")
            })?)?);
        Ok(Self {
            helper,
            #[cfg(target_os = "linux")]
            bubblewrap,
        })
    }

    pub(super) async fn probe(&self, scope: &ExecutionScope) -> Result<Support> {
        let prepared = self.capture(scope, None)?;
        let support = prepared.support;
        let evidence = prepared.spawn(CancellationToken::new())?.finish().await?;
        if evidence.completion != Completion::Exited(0)
            || evidence.stopped.is_some()
            || !evidence.temporary_removed
        {
            return Err(refused(ErrorKind::Unavailable, "sandbox_probe_failed"));
        }
        Ok(support)
    }

    pub(super) fn prepare(&self, spec: ProcessSpec, scope: &ExecutionScope) -> Result<Prepared> {
        self.capture(scope, Some(spec))
    }

    fn capture(&self, scope: &ExecutionScope, spec: Option<ProcessSpec>) -> Result<Prepared> {
        let support = support(scope.termination)?;
        if scope.valid_until <= Instant::now() || scope.grants.grants.is_empty() {
            return Err(refused(ErrorKind::InvalidState, "sandbox_scope_expired"));
        }
        if scope.read.len() + scope.write.len() + scope.runtime.len() + scope.protected.len()
            > MAX_PATHS
        {
            return Err(refused(ErrorKind::LimitExceeded, "sandbox_scope_limit"));
        }
        let mut locations = Vec::new();
        for (access, paths) in [
            (Access::Read, &scope.read),
            (Access::Runtime, &scope.runtime),
            (Access::Write, &scope.write),
        ] {
            for path in paths {
                locations.push(Location::new(path, access)?);
            }
        }
        let temporary_parent = Bound::new(&scope.temporary_parent)?;
        let temporary_metadata = temporary_parent
            ._pin
            .metadata()
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_temporary_unavailable"))?;
        if !temporary_parent.directory
            || temporary_metadata.mode() & 0o077 != 0
            || locations
                .iter()
                .any(|location| overlaps(&location.bound, temporary_parent.path()))
        {
            return Err(refused(
                ErrorKind::InvalidInput,
                "sandbox_temporary_parent_not_private",
            ));
        }
        let temporary = tempfile::tempdir_in(temporary_parent.path())
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_temporary_unavailable"))?;
        locations.push(Location::new(temporary.path(), Access::Write)?);
        let mut anchors = vec![temporary_parent];
        let (task, stdin, timeout, max_output_bytes) = if let Some(mut spec) = spec {
            if spec.stdin.len() > MAX_INPUT
                || spec.max_output_bytes == 0
                || spec.max_output_bytes > MAX_OUTPUT
                || spec.timeout.is_zero()
                || spec.timeout > MAX_TIMEOUT
            {
                return Err(refused(ErrorKind::LimitExceeded, "sandbox_process_limit"));
            }
            validate_environment(&spec.environment)?;
            let launch_text_bytes = spec
                .arguments
                .iter()
                .map(String::len)
                .chain(
                    spec.environment
                        .iter()
                        .map(|(key, value)| key.len().saturating_add(value.len())),
                )
                .fold(0_usize, usize::saturating_add);
            if launch_text_bytes > wire::MAX_FRAME_BYTES {
                return Err(refused(ErrorKind::LimitExceeded, "sandbox_setup_limit"));
            }
            if spec
                .arguments
                .iter()
                .any(|argument| argument.contains('\0'))
            {
                return Err(refused(ErrorKind::InvalidInput, "sandbox_argument_invalid"));
            }
            let executable = Bound::new(&spec.executable)?;
            let cwd = Bound::new(&spec.cwd)?;
            if executable.directory
                || !cwd.directory
                || !locations
                    .iter()
                    .any(|location| location.bound.includes(executable.path()))
                || !locations
                    .iter()
                    .any(|location| location.bound.includes(cwd.path()))
            {
                return Err(refused(
                    ErrorKind::InvalidInput,
                    "sandbox_process_scope_invalid",
                ));
            }
            let temporary_path = temporary.path().to_string_lossy();
            for key in ["TMPDIR", "TMP", "TEMP"] {
                spec.environment
                    .insert(key.into(), temporary_path.to_string());
            }
            let task = Task::Command {
                executable: executable.path().to_owned(),
                arguments: spec.arguments,
                cwd: cwd.path().to_owned(),
                environment: spec.environment,
            };
            anchors.extend([executable, cwd]);
            (task, spec.stdin, spec.timeout, spec.max_output_bytes)
        } else {
            (Task::Probe, vec![], Duration::from_secs(5), 4096)
        };
        self.check_locations(&locations, scope)?;
        let mut roots = Vec::new();
        for location in &locations {
            roots.push(location.bound.identity.clone());
            #[cfg(target_os = "linux")]
            if location.destination != location.bound.path() {
                roots.push(PathIdentity {
                    path: location.destination.clone(),
                    ..location.bound.identity.clone()
                });
            }
        }
        roots.extend(anchors.iter().skip(1).map(|anchor| anchor.identity.clone()));
        let launch = Launch {
            roots,
            private_temp: temporary.path().to_owned(),
            task,
            #[cfg(target_os = "linux")]
            host_namespaces: wire::namespaces()
                .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_namespace_unavailable"))?,
        };
        Ok(Prepared {
            helper: Arc::clone(&self.helper),
            #[cfg(target_os = "linux")]
            bubblewrap: Arc::clone(&self.bubblewrap),
            locations,
            anchors,
            temporary,
            launch,
            stdin,
            timeout,
            max_output_bytes,
            support,
            valid_until: scope.valid_until,
            _grants: scope.grants.clone(),
            _revision: scope.revision.clone(),
        })
    }

    fn check_locations(&self, locations: &[Location], scope: &ExecutionScope) -> Result<()> {
        let mut launchers = vec![self.helper.bound.path()];
        #[cfg(target_os = "macos")]
        launchers.push(Path::new("/usr/bin/sandbox-exec"));
        #[cfg(target_os = "linux")]
        launchers.push(self.bubblewrap.bound.path());
        if locations.iter().any(|location| {
            location.access == Access::Write
                && launchers
                    .iter()
                    .any(|launcher| location.bound.includes(launcher))
        }) {
            return Err(refused(
                ErrorKind::InvalidInput,
                "sandbox_launcher_is_writable",
            ));
        }
        for protected in &scope.protected {
            let path = protected_path(&protected.path)?;
            let denied = locations.iter().any(|location| {
                (protected.access == DeniedAccess::ReadWrite || location.access == Access::Write)
                    && (overlaps(&location.bound, &path)
                        || overlaps(&location.bound, &protected.path))
            });
            if denied
                || (protected.access == DeniedAccess::ReadWrite
                    && launchers.iter().any(|launcher| launcher.starts_with(&path)))
            {
                return Err(refused(ErrorKind::Unsupported, "sandbox_protected_overlap"));
            }
        }
        Ok(())
    }
}

fn overlaps(location: &Bound, path: &Path) -> bool {
    location.includes(path) || location.path().starts_with(path)
}

impl Location {
    fn new(path: &Path, access: Access) -> Result<Self> {
        let bound = Bound::new(path)?;
        if bound.path() == Path::new("/") {
            return Err(refused(
                ErrorKind::Unsupported,
                "sandbox_root_grant_unavailable",
            ));
        }
        #[cfg(target_os = "linux")]
        let destination = if access == Access::Runtime {
            path.to_owned()
        } else {
            bound.path().to_owned()
        };
        #[cfg(target_os = "linux")]
        for reserved in ["/proc", "/dev", "/run/agent-kit-sandbox"] {
            if overlaps(&bound, Path::new(reserved)) || destination.starts_with(reserved) {
                return Err(refused(ErrorKind::Unsupported, "sandbox_reserved_location"));
            }
        }
        Ok(Self {
            bound,
            access,
            #[cfg(target_os = "linux")]
            destination,
        })
    }
}

fn validate_environment(environment: &BTreeMap<String, String>) -> Result<()> {
    if environment
        .iter()
        .any(|(key, value)| key.is_empty() || key.contains(['=', '\0']) || value.contains('\0'))
    {
        return Err(refused(
            ErrorKind::InvalidInput,
            "sandbox_environment_invalid",
        ));
    }
    Ok(())
}

fn support(termination: Termination) -> Result<Support> {
    #[cfg(target_os = "macos")]
    {
        if termination == Termination::AllDescendants {
            return Err(refused(
                ErrorKind::Unsupported,
                "sandbox_descendant_guarantee_unavailable",
            ));
        }
        Ok(Support {
            backend: Backend::Seatbelt,
            termination,
        })
    }
    #[cfg(target_os = "linux")]
    {
        if !cfg!(any(target_arch = "x86_64", target_arch = "aarch64")) {
            return Err(crate::unavailable());
        }
        let _ = termination;
        Ok(Support {
            backend: Backend::Bubblewrap,
            termination: Termination::AllDescendants,
        })
    }
}

pub(super) use process::Running;

impl Prepared {
    pub(super) fn spawn(self, cancellation: CancellationToken) -> Result<Running> {
        if self.valid_until <= Instant::now() || cancellation.is_cancelled() {
            return Err(refused(ErrorKind::InvalidState, "sandbox_admission_closed"));
        }
        self.helper.check()?;
        #[cfg(target_os = "linux")]
        self.bubblewrap.check()?;
        if self
            .locations
            .iter()
            .map(|location| &location.bound)
            .chain(&self.anchors)
            .any(|bound| !bound.identity.matches())
        {
            return Err(refused(ErrorKind::Conflict, "sandbox_location_changed"));
        }
        process::spawn(self, cancellation)
    }
}
