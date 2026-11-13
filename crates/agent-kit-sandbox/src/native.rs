//! GRIDA-SEC-004 — native scope preparation, identity capture and launch checks.

use crate::wire::{self, Launch, PathIdentity, Task};
use crate::*;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;

#[cfg(target_os = "linux")]
mod placeholder;
mod process;
mod reviewed;

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

    fn captured(&self) -> Result<(&PathIdentity, std::time::SystemTime)> {
        let created = self
            ._pin
            .metadata()
            .and_then(|metadata| metadata.created())
            .map_err(|_| {
                refused(
                    ErrorKind::Unsupported,
                    "sandbox_capture_identity_unavailable",
                )
            })?;
        Ok((&self.identity, created))
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
        check_executable(&self.bound, &self.executable, open_executable(&self.bound)?)
    }
}

fn open_executable(bound: &Bound) -> Result<File> {
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW)
        .open(bound.path())
        .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_launcher_missing"))
}

fn check_executable(bound: &Bound, executable: &TrustedExecutable, file: File) -> Result<()> {
    let metadata = file
        .metadata()
        .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_launcher_missing"))?;
    if !metadata.is_file()
        || metadata.len() > MAX_TRUSTED_BINARY
        || metadata.mode() & 0o6000 != 0
        || metadata.mode() & 0o111 == 0
        || metadata.mode() & 0o022 != 0
        || metadata.dev() != bound.identity.device
        || metadata.ino() != bound.identity.inode
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
    if digest != executable.sha256 || !bound.identity.matches() {
        return Err(refused(ErrorKind::Unavailable, "sandbox_launcher_identity"));
    }
    Ok(())
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

/// The executable and working directory bound by a command preparation.
struct ProcessBinding {
    executable: Bound,
    cwd: Bound,
}

impl ProcessBinding {
    fn bounds(&self) -> [&Bound; 2] {
        [&self.executable, &self.cwd]
    }
}

pub(super) struct Prepared {
    helper: Arc<Trusted>,
    #[cfg(target_os = "linux")]
    bubblewrap: Arc<Trusted>,
    locations: Vec<Location>,
    temporary_parent: Bound,
    process: Option<ProcessBinding>,
    temporary: TempDir,
    launch: Launch,
    stdin: Vec<u8>,
    timeout: Duration,
    valid_until: Instant,
    max_output_bytes: usize,
    support: Support,
    grants: GrantSelection,
    revision: BindingId,
    /// Canonical protected paths carved out of the granted locations.
    protected: Vec<(PathBuf, DeniedAccess)>,
    disk_read: bool,
    placeholders: process::Placeholders,
}

impl Installation {
    pub(super) fn new(installation: crate::Installation) -> Result<Self> {
        #[cfg(target_os = "linux")]
        {
            let release = fs::read_to_string("/proc/sys/kernel/osrelease")
                .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_linux_kernel_unknown"))?;
            if release.to_ascii_lowercase().contains("microsoft") {
                return Err(refused(ErrorKind::Unsupported, "sandbox_wsl_unavailable"));
            }
            match kernel_supported(&release) {
                Some(true) => {}
                Some(false) => {
                    return Err(refused(
                        ErrorKind::Unsupported,
                        "sandbox_linux_kernel_unsupported",
                    ));
                }
                None => {
                    return Err(refused(
                        ErrorKind::Unavailable,
                        "sandbox_linux_kernel_unknown",
                    ));
                }
            }
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
        // A command's capture fingerprint needs the same identities. Report a
        // filesystem that cannot provide them before any command is admitted.
        for location in &prepared.locations {
            if location.bound.path() != prepared.temporary.path() {
                location.bound.captured()?;
            }
        }
        let support = prepared.support;
        // The probe runs no payload, so a launcher that did not start is a
        // definite probe failure.
        let running =
            prepared
                .spawn(CancellationToken::new())
                .map_err(|error| match error.kind {
                    ErrorKind::Uncertain => refused(ErrorKind::Unavailable, "sandbox_probe_failed"),
                    _ => error,
                })?;
        let evidence = running.finish().await?;
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
        if scope.valid_until <= Instant::now() {
            return Err(refused(ErrorKind::InvalidState, "sandbox_scope_expired"));
        }
        if scope.grants.grants.is_empty() {
            return Err(refused(ErrorKind::InvalidInput, "sandbox_scope_ungranted"));
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
        let (task, process, stdin, timeout, max_output_bytes) = if let Some(mut spec) = spec {
            if spec.stdin.len() > MAX_INPUT
                || spec.max_output_bytes == 0
                || spec.max_output_bytes > MAX_OUTPUT
                || spec.timeout.is_zero()
                || spec.timeout > MAX_TIMEOUT
            {
                return Err(refused(ErrorKind::LimitExceeded, "sandbox_process_limit"));
            }
            validate_environment(&spec.environment)?;
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
                || (!scope.disk_read
                    && !locations
                        .iter()
                        .any(|location| location.bound.includes(executable.path())))
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
            (
                task,
                Some(ProcessBinding { executable, cwd }),
                spec.stdin,
                spec.timeout,
                spec.max_output_bytes,
            )
        } else {
            (Task::Probe, None, vec![], Duration::from_secs(5), 4096)
        };
        // Under disk read the host's own root is visible read-only, so a
        // runtime path that is a link, such as `/lib`, already resolves to
        // its bound target. A second mount there could only land on the link.
        #[cfg(target_os = "linux")]
        if scope.disk_read {
            for location in &mut locations {
                location.destination = location.bound.path().to_owned();
            }
        }
        let protected = self.check_locations(&locations, scope)?;
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
        if let Some(process) = &process {
            roots.extend(process.bounds().map(|bound| bound.identity.clone()));
        }
        let launch = Launch {
            roots,
            private_temp: temporary.path().to_owned(),
            task,
            #[cfg(target_os = "linux")]
            host_namespaces: wire::namespaces()
                .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_namespace_unavailable"))?,
        };
        let mut prepared = Prepared {
            helper: Arc::clone(&self.helper),
            #[cfg(target_os = "linux")]
            bubblewrap: Arc::clone(&self.bubblewrap),
            locations,
            temporary_parent,
            process,
            temporary,
            launch,
            stdin,
            timeout,
            max_output_bytes,
            support,
            valid_until: scope.valid_until,
            grants: scope.grants.clone(),
            revision: scope.revision.clone(),
            protected,
            disk_read: scope.disk_read,
            placeholders: process::Placeholders::default(),
        };
        prepared.measure_setup_frame()?;
        Ok(prepared)
    }

    fn check_locations(
        &self,
        locations: &[Location],
        scope: &ExecutionScope,
    ) -> Result<Vec<(PathBuf, DeniedAccess)>> {
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
        let mut carved = Vec::new();
        for protected in &scope.protected {
            let path = protected_path(&protected.path)?;
            // A protected path inside a granted location is carved out of it.
            // A granted location at or inside a protected path cannot be,
            // whatever either access: the backends express a denial as an
            // exclusion from grants, not as a narrower grant inside it.
            let denied = locations.iter().any(|location| {
                [path.as_path(), protected.path.as_path()]
                    .into_iter()
                    .any(|protected| location.bound.path().starts_with(protected))
            });
            if denied
                || (protected.access == DeniedAccess::ReadWrite
                    && launchers.iter().any(|launcher| launcher.starts_with(&path)))
            {
                return Err(refused(ErrorKind::Unsupported, "sandbox_protected_overlap"));
            }
            carved.push((path, protected.access));
        }
        Ok(carved)
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
        for reserved in ["/proc", "/dev"] {
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

/// Linux 5.11 added `close_range(CLOSE_RANGE_CLOEXEC)`, which the launch
/// uses to keep host descriptors out of the sandbox.
#[cfg(any(test, target_os = "linux"))]
fn kernel_supported(release: &str) -> Option<bool> {
    let mut parts = release.trim().split(['.', '-']);
    let major: u32 = parts.next()?.parse().ok()?;
    let minor: u32 = parts
        .next()?
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>()
        .parse()
        .ok()?;
    Some((major, minor) >= (5, 11))
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
    pub(super) fn verify_executable(&self, executable: &TrustedExecutable) -> Result<()> {
        let changed = || refused(ErrorKind::Conflict, "reviewed_executable_changed");
        let bound = &self
            .process
            .as_ref()
            .ok_or_else(|| refused(ErrorKind::InvalidState, "sandbox_capture_process_required"))?
            .executable;
        if bound.path() != executable.path {
            return Err(changed());
        }
        let file = open_executable(bound).map_err(|_| changed())?;
        reviewed::require_system_installation(bound.path(), &file)?;
        check_executable(bound, executable, file).map_err(|_| changed())
    }

    pub(super) fn capture_fingerprint(&self) -> Result<Fingerprint> {
        let Task::Command {
            executable,
            arguments,
            cwd,
            environment,
        } = &self.launch.task
        else {
            return Err(refused(
                ErrorKind::InvalidState,
                "sandbox_capture_process_required",
            ));
        };
        let environment: BTreeMap<_, _> = environment
            .iter()
            .filter(|(name, _)| !matches!(name.as_str(), "TMPDIR" | "TMP" | "TEMP"))
            .collect();
        let semantic_input =
            Fingerprint::of(&(executable, arguments, cwd, environment, &self.stdin))?;
        let roots = self
            .locations
            .iter()
            .filter(|location| location.bound.path() != self.temporary.path())
            .map(|location| {
                let access = match location.access {
                    Access::Read => "read",
                    Access::Write => "write",
                    Access::Runtime => "runtime",
                };
                #[cfg(target_os = "linux")]
                let destination = location.destination.as_path();
                #[cfg(target_os = "macos")]
                let destination = location.bound.path();
                Ok((access, destination, location.bound.captured()?))
            })
            .collect::<Result<Vec<_>>>()?;
        let process = self
            .process
            .as_ref()
            .ok_or_else(|| refused(ErrorKind::InvalidState, "sandbox_capture_process_required"))?
            .bounds()
            .map(Bound::captured)
            .into_iter()
            .collect::<Result<Vec<_>>>()?;
        let termination = match self.support.termination {
            Termination::ProcessGroup => "process_group",
            Termination::AllDescendants => "all_descendants",
        };
        #[cfg(target_os = "macos")]
        let launchers = [self.helper.executable.sha256];
        #[cfg(target_os = "linux")]
        let launchers = [
            self.helper.executable.sha256,
            self.bubblewrap.executable.sha256,
        ];
        Fingerprint::of(&(
            semantic_input,
            roots,
            process,
            termination,
            launchers,
            &self.grants,
            &self.revision,
        ))
    }

    pub(super) fn validate_working_root(&self, root: &File) -> Result<()> {
        let Task::Command { cwd, .. } = &self.launch.task else {
            return Err(refused(
                ErrorKind::InvalidState,
                "sandbox_capture_process_required",
            ));
        };
        let metadata = root
            .metadata()
            .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_working_root_unavailable"))?;
        if metadata.is_dir()
            && self.locations.iter().any(|location| {
                location.access != Access::Runtime
                    && location.bound.path() != self.temporary.path()
                    && location.bound.identity.device == metadata.dev()
                    && location.bound.identity.inode == metadata.ino()
                    && location.bound.includes(cwd)
            })
        {
            Ok(())
        } else {
            Err(refused(ErrorKind::Conflict, "sandbox_working_root_changed"))
        }
    }

    pub(super) fn spawn(self, cancellation: CancellationToken) -> Result<Running> {
        self.validate_spawn(&cancellation)?;
        process::spawn(self, cancellation, None)
    }

    pub(super) fn spawn_streaming(
        self,
        executable: &TrustedExecutable,
        cancellation: CancellationToken,
    ) -> Result<(Running, tokio::io::DuplexStream)> {
        if !self.stdin.is_empty() {
            return Err(refused(
                ErrorKind::InvalidInput,
                "sandbox_fixed_stdin_present",
            ));
        }
        self.validate_spawn(&cancellation)?;
        self.verify_executable(executable)?;
        let (client, supervisor) = tokio::io::duplex(16 * 1024);
        let running = process::spawn(self, cancellation, Some(supervisor))?;
        Ok((running, client))
    }

    fn validate_spawn(&self, cancellation: &CancellationToken) -> Result<()> {
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
            .chain([&self.temporary_parent])
            .chain(self.process.iter().flat_map(ProcessBinding::bounds))
            .any(|bound| !bound.identity.matches())
        {
            return Err(refused(ErrorKind::Conflict, "sandbox_location_changed"));
        }
        Ok(())
    }

    /// Refuse a setup frame the helper would reject, before admission. On
    /// Linux the frame later also carries the identity of each placeholder
    /// for a missing protected path, so those are counted at their largest.
    fn measure_setup_frame(&mut self) -> Result<()> {
        let roots = self.launch.roots.len();
        #[cfg(target_os = "linux")]
        {
            let missing = self.placeholder_candidates()?;
            self.launch
                .roots
                .extend(missing.into_iter().map(|(path, _)| PathIdentity {
                    path,
                    device: u64::MAX,
                    inode: u64::MAX,
                }));
        }
        let frame = serde_json::to_vec(&self.launch).map(|frame| frame.len());
        self.launch.roots.truncate(roots);
        let frame =
            frame.map_err(|_| refused(ErrorKind::InvalidInput, "sandbox_setup_encoding"))?;
        if frame > wire::MAX_FRAME_BYTES {
            return Err(refused(ErrorKind::LimitExceeded, "sandbox_setup_limit"));
        }
        Ok(())
    }
}

/// How bubblewrap carves protected paths out of the location mounts.
#[cfg(target_os = "linux")]
impl Prepared {
    /// The deepest location mount covering `path`, and whether it is writable.
    /// Mounts are applied outermost first, so the deepest one decides.
    fn covering_mount(&self, path: &Path) -> Option<bool> {
        let mut deepest: Option<(usize, bool)> = None;
        for location in &self.locations {
            for destination in [location.bound.path(), location.destination.as_path()] {
                let covers = if location.bound.directory {
                    path.starts_with(destination)
                } else {
                    path == destination
                };
                if !covers {
                    continue;
                }
                let depth = destination.components().count();
                let write = location.access == Access::Write;
                deepest = match deepest {
                    Some((current, writable)) if current > depth => Some((current, writable)),
                    Some((current, writable)) if current == depth => {
                        Some((current, writable || write))
                    }
                    _ => Some((depth, write)),
                };
            }
        }
        deepest.map(|(_, write)| write)
    }

    /// Protected paths that need a mount of their own, outermost first. One
    /// path protected twice keeps the stronger denial. A path inside an
    /// unreadable protected path, or an unwritable path inside an unwritable
    /// one, is already covered. A `Write` denial matters only where a
    /// writable mount would expose it, and a `ReadWrite` denial only where
    /// the path is visible at all.
    fn carve_outs(&self) -> Vec<(&Path, DeniedAccess)> {
        let mut merged = BTreeMap::new();
        for (path, access) in &self.protected {
            let entry = merged.entry(path.as_path()).or_insert(*access);
            if *access == DeniedAccess::ReadWrite {
                *entry = DeniedAccess::ReadWrite;
            }
        }
        merged
            .iter()
            .filter(|&(path, access)| {
                !merged.iter().any(|(other, other_access)| {
                    other != path
                        && path.starts_with(other)
                        && (*other_access == DeniedAccess::ReadWrite
                            || *access == DeniedAccess::Write)
                })
            })
            .filter(|&(path, access)| match access {
                DeniedAccess::Write => self.covering_mount(path) == Some(true),
                DeniedAccess::ReadWrite => self.disk_read || self.covering_mount(path).is_some(),
            })
            .map(|(path, access)| (*path, *access))
            .collect()
    }

    /// Carved paths that a writable mount would let the payload create. A
    /// missing one gets a read-only placeholder for the launch. One whose
    /// parent is also missing cannot be held that way and refuses the scope.
    fn placeholder_candidates(&self) -> Result<Vec<(PathBuf, DeniedAccess)>> {
        let carved = self.carve_outs();
        let mut candidates = Vec::new();
        for (path, access) in &carved {
            let nested = self
                .protected
                .iter()
                .any(|(other, _)| other.as_path() != *path && path.starts_with(other));
            if nested || self.covering_mount(path) != Some(true) {
                continue;
            }
            if fs::symlink_metadata(path).is_err()
                && !path
                    .parent()
                    .is_some_and(|parent| fs::symlink_metadata(parent).is_ok_and(|m| m.is_dir()))
            {
                return Err(refused(ErrorKind::Unsupported, "sandbox_protected_overlap"));
            }
            candidates.push((path.to_path_buf(), *access));
        }
        Ok(candidates)
    }
}

#[cfg(test)]
mod tests {
    use super::kernel_supported;

    #[test]
    fn linux_requires_descriptor_range_closing() {
        assert_eq!(kernel_supported("6.12.54-linuxkit\n"), Some(true));
        assert_eq!(kernel_supported("5.11.0"), Some(true));
        assert_eq!(kernel_supported("5.15.0-91-generic"), Some(true));
        assert_eq!(kernel_supported("5.10.0-28-amd64"), Some(false));
        assert_eq!(kernel_supported("4.19.0"), Some(false));
        assert_eq!(kernel_supported("6.1+rpt"), Some(true));
        assert_eq!(kernel_supported("unknown"), None);
    }
}
