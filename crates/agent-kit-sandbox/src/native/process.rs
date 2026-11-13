//! GRIDA-SEC-004 — native launch, confinement profiles and supervision.

#[cfg(target_os = "linux")]
use super::placeholder::Placeholder;
use super::*;
use crate::wire::HELPER_FLAG;
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixStream;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock, mpsc};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt, DuplexStream, WriteHalf};
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;

const DRAIN_GRACE: Duration = Duration::from_millis(500);
const REAP_GRACE: Duration = Duration::from_secs(2);

pub(crate) struct Running {
    stop: CancellationToken,
    task: JoinHandle<ProcessEvidence>,
}

impl Running {
    pub(crate) fn request_stop(&self) {
        self.stop.cancel();
    }

    pub(crate) async fn finish(mut self) -> Result<ProcessEvidence> {
        (&mut self.task)
            .await
            .map_err(|_| refused(ErrorKind::Uncertain, "sandbox_supervisor_lost"))
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        self.stop.cancel();
    }
}

/// Placeholders a launch holds for missing protected paths. Only bubblewrap
/// needs them: Seatbelt denies a path whether or not it exists.
#[derive(Default)]
pub(super) struct Placeholders(#[cfg(target_os = "linux")] Vec<Placeholder>);

impl Placeholders {
    #[cfg(target_os = "linux")]
    fn hold(prepared: &mut Prepared) -> Result<Self> {
        let mut held = Self::default();
        let mut verified = Vec::new();
        for (path, access) in prepared.placeholder_candidates()? {
            match Placeholder::hold(&path) {
                Ok(Some(placeholder)) => {
                    // An unwritable placeholder is mounted onto itself, so the
                    // helper can require that exact directory. An unreadable
                    // one is covered by an empty file system instead.
                    if access == DeniedAccess::Write {
                        verified.push(placeholder.identity());
                    }
                    held.0.push(placeholder);
                }
                Ok(None) => {}
                Err(error) => {
                    held.release(true);
                    return Err(error);
                }
            }
        }
        prepared.launch.roots.extend(verified);
        Ok(held)
    }

    #[cfg(target_os = "macos")]
    fn hold(_: &mut Prepared) -> Result<Self> {
        Ok(Self())
    }

    /// `ended` states that no process of the launch can still observe them.
    fn release(self, ended: bool) {
        #[cfg(target_os = "linux")]
        for placeholder in self.0 {
            placeholder.release(ended);
        }
        #[cfg(target_os = "macos")]
        let _ = ended;
    }
}

pub(super) fn spawn(
    mut prepared: Prepared,
    cancellation: CancellationToken,
    stream: Option<DuplexStream>,
) -> Result<Running> {
    let runtime = tokio::runtime::Handle::try_current()
        .map_err(|_| refused(ErrorKind::InvalidState, "sandbox_async_runtime_required"))?;
    let held = Placeholders::hold(&mut prepared)?;
    match launch(prepared, cancellation, stream, runtime, held) {
        Ok(running) => Ok(running),
        Err((error, held)) => {
            // Nothing started unless the launcher's start is uncertain.
            held.release(error.kind != ErrorKind::Uncertain);
            Err(error)
        }
    }
}

fn launch(
    mut prepared: Prepared,
    cancellation: CancellationToken,
    stream: Option<DuplexStream>,
    runtime: tokio::runtime::Handle,
    held: Placeholders,
) -> std::result::Result<Running, (Error, Placeholders)> {
    let started = (|| {
        // Preparation measured this frame with room for every placeholder.
        let payload = serde_json::to_vec(&prepared.launch)
            .map_err(|_| refused(ErrorKind::InvalidInput, "sandbox_setup_encoding"))?;
        if payload.len() > wire::MAX_FRAME_BYTES {
            return Err(refused(ErrorKind::LimitExceeded, "sandbox_setup_limit"));
        }
        let channel = || refused(ErrorKind::Unavailable, "sandbox_status_channel_unavailable");
        let (status_read, status_write) = UnixStream::pair().map_err(|_| channel())?;
        status_read.set_nonblocking(true).map_err(|_| channel())?;
        let status_read = tokio::net::UnixStream::from_std(status_read).map_err(|_| channel())?;
        let mut command = command(&prepared, status_write.as_raw_fd());
        command
            .env_clear()
            .current_dir("/")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        configure_spawn(&mut command, status_write.as_raw_fd())?;
        if prepared.valid_until <= Instant::now() || cancellation.is_cancelled() {
            return Err(refused(ErrorKind::InvalidState, "sandbox_admission_closed"));
        }
        // Tokio can fail to register a child with the process or I/O driver
        // after the OS has started it. No setup frame was sent, but launcher
        // termination and cleanup are not established on this error path.
        let child = spawn_on_launcher(command, runtime)?
            .map_err(|_| refused(ErrorKind::Uncertain, "sandbox_spawn_unconfirmed"))?;
        drop(status_write);
        Ok((child, status_read, payload))
    })();
    let (child, status_read, payload) = match started {
        Ok(started) => started,
        Err(error) => return Err((error, held)),
    };
    prepared.placeholders = held;
    let stop = CancellationToken::new();
    let task = tokio::spawn(supervise(
        child,
        status_read,
        prepared,
        payload,
        cancellation,
        stop.clone(),
        stream,
    ));
    Ok(Running { stop, task })
}

type LaunchJob = Box<dyn FnOnce() + Send>;

/// Start the launcher from a thread this crate owns for the life of the
/// process. bubblewrap's `--die-with-parent` follows the thread that forked
/// it, so a caller's short-lived thread, such as a blocking-pool worker,
/// would otherwise end a running sandbox when that thread retires.
/// The outer error means the launch was never attempted.
fn spawn_on_launcher(
    mut command: Command,
    runtime: tokio::runtime::Handle,
) -> Result<io::Result<Child>> {
    let unavailable = || refused(ErrorKind::Unavailable, "sandbox_launcher_unavailable");
    static LAUNCHER: OnceLock<Option<Mutex<mpsc::Sender<LaunchJob>>>> = OnceLock::new();
    let launcher = LAUNCHER
        .get_or_init(|| {
            let (jobs, received) = mpsc::channel::<LaunchJob>();
            std::thread::Builder::new()
                .name("agent-kit-sandbox-launcher".into())
                .spawn(move || {
                    for job in received {
                        // A failed job must not end launches for the process.
                        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(job));
                    }
                })
                .ok()
                .map(|_| Mutex::new(jobs))
        })
        .as_ref()
        .ok_or_else(unavailable)?;
    let (reply, result) = mpsc::sync_channel(1);
    let job: LaunchJob = Box::new(move || {
        // The child registers with the caller's runtime for reaping and I/O.
        let _runtime = runtime.enter();
        let _ = reply.send(command.spawn());
    });
    launcher
        .lock()
        .map_err(|_| unavailable())?
        .send(job)
        .map_err(|_| unavailable())?;
    // A job that ended without replying may have started the launcher.
    Ok(result
        .recv()
        .unwrap_or_else(|_| Err(io::Error::other("sandbox launcher ended"))))
}

#[cfg(target_os = "macos")]
const PLATFORM_DEFAULTS: &str = r#"(allow sysctl-read
  (sysctl-name "hw.activecpu") (sysctl-name "hw.byteorder") (sysctl-name "hw.cacheconfig")
  (sysctl-name "hw.cachelinesize_compat") (sysctl-name "hw.cpufamily") (sysctl-name "hw.cputype")
  (sysctl-name "hw.l1dcachesize_compat") (sysctl-name "hw.l1icachesize_compat")
  (sysctl-name "hw.l2cachesize_compat") (sysctl-name "hw.l3cachesize_compat")
  (sysctl-name "hw.logicalcpu_max") (sysctl-name "hw.machine") (sysctl-name "hw.model")
  (sysctl-name "hw.memsize") (sysctl-name "hw.ncpu") (sysctl-name "hw.nperflevels")
  (sysctl-name-prefix "hw.optional.arm.") (sysctl-name-prefix "hw.optional.armv8_")
  (sysctl-name "hw.packages") (sysctl-name "hw.physicalcpu") (sysctl-name "hw.physicalcpu_max")
  (sysctl-name "hw.logicalcpu") (sysctl-name "hw.cpufrequency") (sysctl-name "hw.tbfrequency_compat")
  (sysctl-name "hw.vectorunit") (sysctl-name-prefix "hw.perflevel")
  (sysctl-name "machdep.cpu.brand_string") (sysctl-name "kern.argmax") (sysctl-name "kern.hostname")
  (sysctl-name "kern.maxfilesperproc") (sysctl-name "kern.maxproc") (sysctl-name "kern.osproductversion")
  (sysctl-name "kern.osrelease") (sysctl-name "kern.ostype") (sysctl-name "kern.osvariant_status")
  (sysctl-name "kern.osversion") (sysctl-name "kern.secure_kernel") (sysctl-name "kern.sysv.semmns")
  (sysctl-name "kern.usrstack64") (sysctl-name "kern.version") (sysctl-name "sysctl.proc_cputype")
  (sysctl-name "vm.loadavg") (sysctl-name-prefix "kern.proc.pgrp.") (sysctl-name-prefix "kern.proc.pid."))
(allow sysctl-write (sysctl-name "kern.grade_cputype"))
(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))
(allow mach-lookup
  (global-name "com.apple.analyticsd") (global-name "com.apple.analyticsd.messagetracer")
  (global-name "com.apple.appsleep") (global-name "com.apple.bsd.dirhelper")
  (global-name "com.apple.diagnosticd") (global-name "com.apple.dt.automationmode.reader")
  (global-name "com.apple.espd") (global-name "com.apple.logd") (global-name "com.apple.logd.events")
  (global-name "com.apple.secinitd") (global-name "com.apple.system.DirectoryService.libinfo_v1")
  (global-name "com.apple.system.logger") (global-name "com.apple.system.notification_center")
  (global-name "com.apple.system.opendirectoryd.membership") (global-name "com.apple.trustd")
  (global-name "com.apple.trustd.agent") (global-name "com.apple.xpc.activity.unmanaged"))
(allow file-read-metadata (literal "/tmp") (literal "/var") (literal "/etc"))
(allow ipc-posix-sem)
(allow pseudo-tty)
(allow file-read* file-write* file-ioctl (literal "/dev/ptmx"))
(allow file-read* file-write* (require-all (regex #"^/dev/ttys[0-9]+") (extension "com.apple.sandbox.pty")))
(allow file-ioctl (regex #"^/dev/ttys[0-9]+"))
"#;

#[cfg(target_os = "macos")]
fn command(prepared: &Prepared, status: i32) -> Command {
    let mut command = Command::new("/usr/bin/sandbox-exec");
    let mut profile = String::from(
        "(version 1)\n(deny default)\n(allow process-fork)\n\
         (allow signal (target same-sandbox))\n(allow process-info* (target same-sandbox))\n\
         (allow file-read* file-test-existence (literal \"/\"))\n\
         (allow file-read* file-write-data (literal \"/dev/null\"))\n\
         (allow sysctl-read (sysctl-name \"hw.pagesize\") (sysctl-name \"hw.pagesize_compat\"))\n",
    );
    // Platform services ordinary toolchains need: system information, the
    // user database, the per-user cache and temporary directory lookup,
    // logging, certificate trust, semaphores, pseudo-terminals, and resolving
    // the system's top-level links such as /tmp. None grants file contents or
    // network access.
    profile.push_str(PLATFORM_DEFAULTS);
    let mut locations: Vec<_> = prepared
        .locations
        .iter()
        .map(|location| (&location.bound, location.access))
        .collect();
    locations.push((&prepared.helper.bound, Access::Runtime));
    use std::fmt::Write as _;
    // Protected paths are excluded from every grant that contains them.
    let mut unreadable = String::new();
    let mut unwritable = String::new();
    for (index, (path, access)) in prepared.protected.iter().enumerate() {
        let name = format!("P{index}");
        let exclusion = format!(" (require-not (subpath (param \"{name}\")))");
        if *access == crate::DeniedAccess::ReadWrite {
            unreadable.push_str(&exclusion);
        }
        unwritable.push_str(&exclusion);
        command.arg("-D").arg(format!("{name}={}", path.display()));
    }
    if prepared.disk_read {
        // Other launches' private temporary storage stays hidden. This
        // launch's own directory is allowed below as a location.
        let hidden = format!("{unreadable} (require-not (subpath (param \"T\")))");
        let _ = writeln!(
            profile,
            "(allow file-read* file-test-existence (require-all (subpath \"/\"){hidden}))"
        );
        let _ = writeln!(
            profile,
            "(allow process-exec file-map-executable (require-all (subpath \"/\"){hidden}))"
        );
        command
            .arg("-D")
            .arg(format!("T={}", prepared.temporary_parent.path().display()));
    }
    for (index, (bound, access)) in locations.iter().enumerate() {
        let name = format!("L{index}");
        let matcher = if bound.directory {
            "subpath"
        } else {
            "literal"
        };
        let location = format!("({matcher} (param \"{name}\"))");
        let filter = format!("(require-all {location}{unreadable})");
        let _ = writeln!(profile, "(allow file-read* file-test-existence {filter})");
        let _ = writeln!(
            profile,
            "(allow file-read-metadata file-test-existence (path-ancestors (param \"{name}\")))"
        );
        if *access == Access::Write {
            let _ = writeln!(
                profile,
                "(allow file-write* (require-all {location}{unwritable}))"
            );
        }
        // Any approved content can be interpreted. Exec/map is limited to
        // the same visible roots, including the explicitly selected binary.
        let _ = writeln!(profile, "(allow process-exec file-map-executable {filter})");
        command
            .arg("-D")
            .arg(format!("{name}={}", bound.path().display()));
    }
    command
        .arg("-p")
        .arg(profile)
        .arg(prepared.helper.bound.path())
        .arg(HELPER_FLAG)
        .arg(status.to_string());
    command
}

#[cfg(target_os = "linux")]
fn command(prepared: &Prepared, status: i32) -> Command {
    let mut command = Command::new(prepared.bubblewrap.bound.path());
    command.args([
        "--unshare-user",
        "--disable-userns",
        "--unshare-pid",
        "--unshare-ipc",
        "--unshare-net",
        "--unshare-uts",
        "--cap-drop",
        "ALL",
        "--die-with-parent",
        "--as-pid-1",
        "--clearenv",
    ]);
    let temporary_parent = prepared.temporary_parent.path();
    if prepared.disk_read {
        // Everything readable first; later mounts narrow or widen it. Other
        // launches' private temporary storage is hidden under an empty
        // file system.
        command.args(["--ro-bind", "/", "/"]);
        command.arg("--tmpfs").arg(temporary_parent);
    }
    command.args(["--proc", "/proc", "--dev", "/dev"]);
    let mut mounts = BTreeMap::new();
    for location in &prepared.locations {
        for destination in [location.bound.path(), location.destination.as_path()] {
            let write = location.access == Access::Write;
            mounts
                .entry(destination)
                .and_modify(|entry: &mut (&Path, bool)| entry.1 |= write)
                .or_insert((location.bound.path(), write));
        }
    }
    let mut mounts: Vec<_> = mounts.into_iter().collect();
    mounts.sort_by_key(|(destination, _)| destination.components().count());
    for (destination, (source, write)) in mounts {
        command
            .arg(if write { "--bind" } else { "--ro-bind" })
            .arg(source)
            .arg(destination);
    }
    if prepared.disk_read {
        command.arg("--remount-ro").arg(temporary_parent);
    }
    // Carve protected paths out of the mounts above, outermost first. A
    // missing path that a writable mount would let the payload create holds
    // a placeholder for this launch, so it exists here; any other missing
    // path is out of the payload's reach.
    for (path, access) in prepared.carve_outs() {
        let Ok(metadata) = std::fs::symlink_metadata(path) else {
            continue;
        };
        match (access, metadata.is_dir()) {
            (crate::DeniedAccess::ReadWrite, true) => {
                command
                    .arg("--tmpfs")
                    .arg(path)
                    .arg("--remount-ro")
                    .arg(path);
            }
            (crate::DeniedAccess::ReadWrite, false) => {
                command.arg("--ro-bind").arg("/dev/null").arg(path);
            }
            (crate::DeniedAccess::Write, _) => {
                command.arg("--ro-bind").arg(path).arg(path);
            }
        }
    }
    // The helper runs from its own path. Under disk read every other path
    // is read-only, so no new mount point could be created for it.
    let helper = prepared.helper.bound.path();
    command
        .arg("--ro-bind")
        .arg(helper)
        .arg(helper)
        .arg("--")
        .arg(helper)
        .arg(HELPER_FLAG)
        .arg(status.to_string());
    command
}

#[allow(unsafe_code)]
fn configure_spawn(command: &mut Command, preserve: i32) -> Result<()> {
    #[cfg(target_os = "macos")]
    let high_descriptor = fs::read_dir("/dev/fd")
        .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_descriptor_scan_failed"))?
        .filter_map(|entry| {
            entry
                .ok()?
                .file_name()
                .to_string_lossy()
                .parse::<i32>()
                .ok()
        })
        .max()
        .unwrap_or(preserve)
        .max(preserve);
    // The child is between fork and exec here. Only async-signal-safe
    // system calls run, and the standard library's exec error pipe remains
    // open until exec because all other descriptors become close-on-exec.
    unsafe {
        command.pre_exec(move || {
            if libc::setsid() < 0 {
                return Err(io::Error::last_os_error());
            }
            #[cfg(target_os = "linux")]
            if libc::syscall(
                libc::SYS_close_range,
                3_u32,
                u32::MAX,
                libc::CLOSE_RANGE_CLOEXEC,
            ) != 0
            {
                return Err(io::Error::last_os_error());
            }
            #[cfg(target_os = "macos")]
            {
                let mut limit: libc::rlimit = std::mem::zeroed();
                if libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit) != 0
                    || limit.rlim_cur > 1_048_576
                {
                    return Err(io::Error::from_raw_os_error(libc::EINVAL));
                }
                let last = (limit.rlim_cur as i32).max(high_descriptor);
                for fd in 3..=last {
                    if libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC) < 0 {
                        let error = io::Error::last_os_error();
                        if error.raw_os_error() != Some(libc::EBADF) {
                            return Err(error);
                        }
                    }
                }
            }
            if libc::fcntl(preserve, libc::F_SETFD, 0) < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        });
    }
    Ok(())
}

#[derive(Default)]
struct Output {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    received: usize,
    truncated: bool,
}

async fn capture_output(
    mut input: impl AsyncRead + Unpin,
    capture: Arc<Mutex<Output>>,
    stderr: bool,
    max: usize,
    overflow: CancellationToken,
    mut forward: Option<WriteHalf<DuplexStream>>,
) {
    let mut bytes = [0; 8192];
    loop {
        match input.read(&mut bytes).await {
            Ok(0) => return,
            Ok(count) => {
                let take = {
                    let mut output = capture.lock().expect("output lock");
                    let take = count.min(max - output.received);
                    output.received += take;
                    if forward.is_none() {
                        let target = if stderr {
                            &mut output.stderr
                        } else {
                            &mut output.stdout
                        };
                        target.extend_from_slice(&bytes[..take]);
                    }
                    if take < count {
                        output.truncated = true;
                        overflow.cancel();
                    }
                    take
                };
                if let Some(writer) = &mut forward
                    && writer.write_all(&bytes[..take]).await.is_err()
                {
                    capture.lock().expect("output lock").truncated = true;
                    return;
                }
                if take < count {
                    return;
                }
            }
            Err(_) => {
                capture.lock().expect("output lock").truncated = true;
                return;
            }
        }
    }
}

async fn supervise(
    mut child: Child,
    mut status: tokio::net::UnixStream,
    prepared: Prepared,
    payload: Vec<u8>,
    cancellation: CancellationToken,
    stop: CancellationToken,
    stream: Option<DuplexStream>,
) -> ProcessEvidence {
    let capture = Arc::new(Mutex::new(Output::default()));
    let overflow = CancellationToken::new();
    let input_overflow = CancellationToken::new();
    let (stream_input, stream_output) = stream
        .map(tokio::io::split)
        .map_or((None, None), |(input, output)| (Some(input), Some(output)));
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");
    let mut output_tasks = [
        tokio::spawn(capture_output(
            stdout,
            capture.clone(),
            false,
            prepared.max_output_bytes,
            overflow.clone(),
            stream_output,
        )),
        tokio::spawn(capture_output(
            stderr,
            capture.clone(),
            true,
            prepared.max_output_bytes,
            overflow.clone(),
            None,
        )),
    ];
    let mut input = child.stdin.take().expect("stdin piped");
    let input_task = tokio::spawn({
        let input_overflow = input_overflow.clone();
        async move {
            input
                .write_all(&(payload.len() as u32).to_be_bytes())
                .await?;
            input.write_all(&payload).await?;
            if let Some(mut stream) = stream_input {
                let copied =
                    tokio::io::copy(&mut (&mut stream).take(MAX_INPUT as u64), &mut input).await?;
                if copied == MAX_INPUT as u64 && stream.read_u8().await.is_ok() {
                    input_overflow.cancel();
                }
            } else {
                input.write_all(&prepared.stdin).await?;
            }
            input.shutdown().await
        }
    });
    let pid = child.id().expect("spawned process has id") as i32;
    let deadline = (Instant::now() + prepared.timeout).min(prepared.valid_until);
    let probe = matches!(prepared.launch.task, Task::Probe);
    let mut status_bytes = Vec::new();
    let mut observation = None;
    let stopped = tokio::select! {
        biased;
        _ = cancellation.cancelled() => Some(StopReason::Requested),
        _ = stop.cancelled() => Some(StopReason::Requested),
        _ = input_overflow.cancelled() => Some(StopReason::InputLimit),
        _ = overflow.cancelled() => Some(StopReason::OutputLimit),
        _ = tokio::time::sleep_until(deadline.into()) => Some(StopReason::Deadline),
        // Seatbelt's helper holds the group open after the payload exits.
        // Darwin can reject a group signal once only zombies remain.
        _ = read_terminal_prefix(&mut status, &mut status_bytes, probe),
            if prepared.support.backend == Backend::Seatbelt => None,
        result = wait_without_reaping(pid) => {
            observation = Some(result);
            None
        },
    };
    input_task.abort();
    let process_group_signalled = match observation {
        Some(Err(_)) => false,
        _ => signal_process_group(pid).is_ok(),
    };
    let _ = status.shutdown().await;
    let reaped = tokio::time::timeout(REAP_GRACE, child.wait())
        .await
        .is_ok_and(|result| result.is_ok());

    let remaining_status_bytes = (7 - status_bytes.len()) as u64;
    let status_read = async {
        // A malformed status stream never implies successful payload execution.
        (&mut status)
            .take(remaining_status_bytes)
            .read_to_end(&mut status_bytes)
            .await
    };
    let status_complete = tokio::time::timeout(DRAIN_GRACE, status_read)
        .await
        .is_ok_and(|result| result.is_ok());
    let outputs_complete = tokio::time::timeout(DRAIN_GRACE, async {
        for task in &mut output_tasks {
            let _ = task.await;
        }
    })
    .await
    .is_ok();
    if !outputs_complete {
        for task in &output_tasks {
            task.abort();
        }
    }

    let completion = if status_complete {
        parse_status(&status_bytes, probe)
    } else {
        Completion::Uncertain
    };
    let descendants = match (completion, prepared.support.backend) {
        (Completion::SetupFailed, _) if reaped => Descendants::NoPayload,
        (_, Backend::Seatbelt) if process_group_signalled && reaped => {
            Descendants::ProcessGroupSignalled
        }
        (Completion::Exited(_) | Completion::Signaled(_), Backend::Bubblewrap)
            if reaped && stopped.is_none() =>
        {
            Descendants::NamespaceEnded
        }
        _ => Descendants::Unverified,
    };
    prepared.placeholders.release(matches!(
        descendants,
        Descendants::NoPayload | Descendants::NamespaceEnded
    ));
    let temporary_removed = prepared.temporary.close().is_ok();
    let mut output = capture.lock().expect("output lock");
    ProcessEvidence {
        support: prepared.support,
        completion,
        stopped: stopped
            .or_else(|| {
                input_overflow
                    .is_cancelled()
                    .then_some(StopReason::InputLimit)
            })
            .or_else(|| overflow.is_cancelled().then_some(StopReason::OutputLimit)),
        stdout: std::mem::take(&mut output.stdout),
        stderr: std::mem::take(&mut output.stderr),
        output_truncated: output.truncated || !outputs_complete,
        descendants,
        temporary_removed,
    }
}

async fn read_terminal_prefix(
    status: &mut tokio::net::UnixStream,
    bytes: &mut Vec<u8>,
    probe: bool,
) -> io::Result<()> {
    let terminal_size = if probe { 5 } else { 6 };
    let mut byte = [0];
    while bytes.len() < terminal_size && bytes.as_slice() != [wire::STATUS_SETUP_FAILED] {
        if status.read(&mut byte).await? == 0 {
            break;
        }
        bytes.push(byte[0]);
    }
    Ok(())
}

fn parse_status(bytes: &[u8], probe: bool) -> Completion {
    if bytes == [wire::STATUS_SETUP_FAILED] {
        return Completion::SetupFailed;
    }
    let bytes = if probe {
        bytes
    } else if let Some(payload) = bytes.strip_prefix(&[wire::STATUS_READY]) {
        payload
    } else {
        return Completion::Uncertain;
    };
    match bytes {
        [wire::STATUS_EXIT, a, b, c, d] => Completion::Exited(i32::from_be_bytes([*a, *b, *c, *d])),
        [wire::STATUS_SIGNAL, a, b, c, d] => {
            Completion::Signaled(i32::from_be_bytes([*a, *b, *c, *d]))
        }
        _ => Completion::Uncertain,
    }
}

async fn wait_without_reaping(pid: i32) -> io::Result<()> {
    // Keep the root PID reserved until we signal its private process group.
    // Reaping first would allow PID/PGID reuse to target an unrelated process.
    loop {
        match observed_exit(pid) {
            Ok(true) => return Ok(()),
            Ok(false) => {}
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error),
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

#[allow(unsafe_code)]
fn observed_exit(pid: i32) -> io::Result<bool> {
    let mut info = unsafe { std::mem::zeroed::<libc::siginfo_t>() };
    let result = unsafe {
        libc::waitid(
            libc::P_PID,
            pid as libc::id_t,
            &mut info,
            libc::WEXITED | libc::WNOWAIT | libc::WNOHANG,
        )
    };
    if result == 0 {
        Ok(unsafe { info.si_pid() } == pid)
    } else {
        Err(io::Error::last_os_error())
    }
}

#[allow(unsafe_code)]
fn signal_process_group(pid: i32) -> io::Result<()> {
    if unsafe { libc::kill(-pid, libc::SIGKILL) } == 0 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::ESRCH) {
        Ok(())
    } else {
        Err(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_payload_exit_requires_the_helpers_start_evidence() {
        assert_eq!(parse_status(b"E\0\0\0\0", false), Completion::Uncertain);
        assert_eq!(parse_status(b"S\0\0\0\x09", false), Completion::Uncertain);
        assert_eq!(parse_status(b"R", false), Completion::Uncertain);
        assert_eq!(parse_status(b"RF", false), Completion::Uncertain);
        assert_eq!(parse_status(b"F", false), Completion::SetupFailed);
        assert_eq!(parse_status(b"RE\0\0\0\0", false), Completion::Exited(0));
        assert_eq!(parse_status(b"E\0\0\0\0", true), Completion::Exited(0));
    }
}
