//! GRIDA-SEC-004 — the trusted in-sandbox launcher. The owner's end of the
//! private status channel is also its control channel: end of stream or any
//! unknown byte ends everything this helper launched.

use crate::wire::{self, Launch, Mode, Task};
use std::collections::BTreeMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::os::fd::{AsFd, AsRawFd, FromRawFd, IntoRawFd};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

/// How long a terminal relay may keep forwarding output once the payload's
/// group has ended. A descendant in another group can hold the terminal open.
const RELAY_DRAIN: Duration = Duration::from_millis(500);
/// The window size a session terminal starts with.
const TERMINAL_COLUMNS: u16 = 80;
const TERMINAL_ROWS: u16 = 24;

/// What the owner asked of the helper.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Control {
    Interrupt,
    Stop,
    OwnerGone,
}

/// Read one control request. A failed read, end of stream or an unknown byte
/// fails closed as [`Control::OwnerGone`].
fn read_control(reader: &mut impl std::io::Read) -> Control {
    let mut byte = [0];
    loop {
        return match reader.read(&mut byte) {
            Ok(1) => match byte[0] {
                wire::CONTROL_INTERRUPT => Control::Interrupt,
                wire::CONTROL_STOP => Control::Stop,
                _ => Control::OwnerGone,
            },
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            _ => Control::OwnerGone,
        };
    }
}

pub fn run() -> bool {
    let mut arguments = std::env::args_os().skip(1);
    let (Some(flag), Some(raw_fd), None) = (arguments.next(), arguments.next(), arguments.next())
    else {
        return false;
    };
    let Ok(status_fd) = raw_fd.to_string_lossy().parse::<i32>() else {
        return false;
    };
    if flag != wire::HELPER_FLAG || status_fd < 3 {
        return false;
    }
    let Ok(mut status) = status_writer(status_fd) else {
        return false;
    };
    let launch = read_launch().and_then(validate);
    let Ok(launch) = launch else {
        let _ = status.write_all(&[wire::STATUS_SETUP_FAILED]);
        return false;
    };
    match launch.task {
        Task::Probe => {
            if probe(&launch.private_temp).is_err() {
                let _ = status.write_all(&[wire::STATUS_SETUP_FAILED]);
                return false;
            }
            if !report_exit(&mut status, wire::STATUS_EXIT, 0) {
                return false;
            }
            hold_until_released(&mut status);
            true
        }
        Task::Command {
            executable,
            arguments,
            cwd,
            environment,
            mode,
        } => supervise(
            status,
            Spec {
                executable,
                arguments,
                cwd,
                environment,
                mode,
            },
        ),
    }
}

struct Spec {
    executable: PathBuf,
    arguments: Vec<String>,
    cwd: PathBuf,
    environment: BTreeMap<String, String>,
    mode: Mode,
}

/// A pseudo-terminal allocated inside the sandbox. Both ends close on exec;
/// the payload receives the secondary end only as its stdio.
struct Terminal {
    primary: File,
    secondary: File,
}

/// The helper's handles on a session terminal's primary end.
struct Primary {
    relay: File,
    interrupt: File,
}

/// The launched payload, as the helper may still signal it.
struct Payload {
    pid: i32,
    /// The payload's own process group: always for a terminal session, and
    /// for a pipe session on Linux, where the helper's group reaches outside
    /// the PID namespace.
    group: Option<i32>,
    mode: Mode,
    /// True until the helper reaps the payload. A pid or group signal is sent
    /// only while it holds, so the identifiers cannot have been reused.
    unreaped: Mutex<bool>,
    /// Terminal mode: where an interrupt is typed.
    primary: Option<File>,
}

impl Payload {
    fn interrupt(&self) {
        match self.mode {
            Mode::Finite => {}
            Mode::Terminal => {
                // The line discipline turns this into SIGINT for the
                // terminal's foreground process group, or delivers it as
                // input when the payload disabled signal characters.
                if let Some(mut primary) = self.primary.as_ref() {
                    let _ = primary.write_all(&[0x03]);
                }
            }
            Mode::Pipe => self.signal(libc::SIGINT),
        }
    }

    /// End the payload and its own group while the owner still waits for
    /// the report.
    fn end(&self) {
        self.signal(libc::SIGKILL);
    }

    #[allow(unsafe_code)]
    fn signal(&self, signal: i32) {
        let unreaped = self
            .unreaped
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if !*unreaped {
            return;
        }
        let target = match (self.group, self.mode, signal) {
            (Some(group), _, _) => -group,
            // A macOS pipe payload shares the helper's group, which the
            // launcher created and holds only sandboxed processes. The helper
            // ignores the interrupt through a handler the payload does not
            // inherit across exec.
            (None, Mode::Pipe, libc::SIGINT) => 0,
            (None, _, _) => self.pid,
        };
        unsafe { libc::kill(target, signal) };
    }

    /// The owner closed the control channel or broke its protocol. Nothing
    /// remains to report to, so end everything this helper launched.
    #[allow(unsafe_code)]
    fn owner_gone(&self) -> ! {
        self.end();
        // The helper leads the launcher's process group, which holds only
        // sandboxed processes. On Linux the helper is the namespace's first
        // process, and its exit ends every other process in it.
        #[cfg(target_os = "macos")]
        unsafe {
            libc::kill(0, libc::SIGKILL)
        };
        unsafe { libc::_exit(1) }
    }

    /// After the payload exited and before it is reaped, end what remains
    /// in its own group.
    fn end_group(&self) {
        if self.group.is_some() {
            self.end();
        }
    }

    fn reap(&self, child: &mut Child) -> std::io::Result<std::process::ExitStatus> {
        *self
            .unreaped
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = false;
        child.wait()
    }
}

#[allow(unsafe_code)]
fn supervise(mut status: File, spec: Spec) -> bool {
    let session = spec.mode != Mode::Finite;
    let Ok(control) = status.try_clone() else {
        let _ = status.write_all(&[wire::STATUS_SETUP_FAILED]);
        return false;
    };
    let mut command = Command::new(&spec.executable);
    command
        .args(&spec.arguments)
        .current_dir(&spec.cwd)
        .env_clear()
        .envs(&spec.environment);
    let prepared = (|| -> std::io::Result<(Option<Primary>, Option<File>)> {
        match spec.mode {
            Mode::Finite => Ok((None, None)),
            Mode::Pipe => {
                // Stdin is the owner's pipe, closed after setup. Stdout and
                // stderr share one pipe so output keeps its arrival order.
                let merged = std::io::stdout().as_fd().try_clone_to_owned()?;
                command.stderr(Stdio::from(merged));
                #[cfg(target_os = "linux")]
                command.process_group(0);
                #[cfg(target_os = "macos")]
                ignore_interrupts()?;
                let null = OpenOptions::new().write(true).open("/dev/null")?;
                Ok((None, Some(null)))
            }
            Mode::Terminal => {
                let terminal = open_terminal()?;
                command
                    .stdin(Stdio::from(terminal.secondary.try_clone()?))
                    .stdout(Stdio::from(terminal.secondary.try_clone()?))
                    .stderr(Stdio::from(terminal.secondary.try_clone()?));
                // Between fork and exec only async-signal-safe calls run.
                // Stdio is already the terminal, so it becomes the new
                // session's controlling terminal.
                unsafe {
                    command.pre_exec(|| {
                        if libc::setsid() < 0
                            || libc::ioctl(0, libc::TIOCSCTTY as _, 0 as libc::c_int) < 0
                        {
                            return Err(std::io::Error::last_os_error());
                        }
                        Ok(())
                    });
                }
                let interrupt = terminal.primary.try_clone()?;
                // Only the command's copies of the secondary end remain.
                Ok((
                    Some(Primary {
                        relay: terminal.primary,
                        interrupt,
                    }),
                    None,
                ))
            }
        }
    })();
    let Ok((primary, null)) = prepared else {
        let _ = status.write_all(&[wire::STATUS_SETUP_FAILED]);
        return false;
    };
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(_) => {
            let _ = status.write_all(&[wire::STATUS_SETUP_FAILED]);
            return false;
        }
    };
    // The command's copies of the secondary end close with it, so the
    // terminal's output ends once the payload's processes close theirs.
    drop(command);
    let pid = child.id() as i32;
    let (relay, primary) = primary.map_or((None, None), |primary| {
        (Some(primary.relay), Some(primary.interrupt))
    });
    let payload = Arc::new(Payload {
        pid,
        group: match spec.mode {
            Mode::Terminal => Some(pid),
            Mode::Pipe if cfg!(target_os = "linux") => Some(pid),
            _ => None,
        },
        mode: spec.mode,
        unreaped: Mutex::new(true),
        primary,
    });
    if let Some(null) = null {
        // Only the payload and its descendants keep the output pipe open, so
        // the owner sees its end once they close it.
        unsafe { libc::dup2(null.as_raw_fd(), libc::STDOUT_FILENO) };
    }
    let relay = relay.map(relay_terminal);
    if status.write_all(&[wire::STATUS_READY]).is_err() {
        payload.end();
        let _ = payload.reap(&mut child);
        return false;
    }
    let reader = {
        let payload = Arc::clone(&payload);
        std::thread::Builder::new()
            .name("control".into())
            .spawn(move || {
                let mut control = control;
                loop {
                    match read_control(&mut control) {
                        Control::Interrupt => payload.interrupt(),
                        Control::Stop => payload.end(),
                        Control::OwnerGone => payload.owner_gone(),
                    }
                }
            })
    };
    let Ok(reader) = reader else {
        payload.end();
        let _ = payload.reap(&mut child);
        return false;
    };
    if wait_exited(pid).is_err() {
        payload.end();
        let _ = payload.reap(&mut child);
        return false;
    }
    payload.end_group();
    if let Some(relay) = relay {
        let _ = relay.recv_timeout(RELAY_DRAIN);
    }
    let Ok(exit) = payload.reap(&mut child) else {
        return false;
    };
    let reported = if let Some(code) = exit.code() {
        report_exit(&mut status, wire::STATUS_EXIT, code)
    } else if let Some(signal) = exit.signal() {
        report_exit(&mut status, wire::STATUS_SIGNAL, signal)
    } else {
        false
    };
    if !reported || (session && status.write_all(&[wire::STATUS_GROUP_ENDED]).is_err()) {
        return false;
    }
    // Keep a live group leader until the owner signals the group or closes
    // its end of the private status channel, which ends the helper.
    #[cfg(target_os = "macos")]
    let _ = reader.join();
    #[cfg(target_os = "linux")]
    drop(reader);
    true
}

/// Observe the payload's exit without reaping it, so its pid and group stay
/// reserved while the helper may still signal them. On Linux the helper is
/// the namespace's first process and inherits orphaned descendants; those
/// are reaped as they exit so a long session does not accumulate them.
#[allow(unsafe_code)]
fn wait_exited(pid: i32) -> std::io::Result<()> {
    loop {
        let mut info = unsafe { std::mem::zeroed::<libc::siginfo_t>() };
        let result =
            unsafe { libc::waitid(libc::P_ALL, 0, &mut info, libc::WEXITED | libc::WNOWAIT) };
        if result != 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() == std::io::ErrorKind::Interrupted {
                continue;
            }
            return Err(error);
        }
        let exited = unsafe { info.si_pid() };
        if exited == pid {
            return Ok(());
        }
        if exited > 0 {
            unsafe { libc::waitpid(exited, std::ptr::null_mut(), 0) };
        }
    }
}

#[cfg(target_os = "macos")]
extern "C" fn interrupt_ignored(_: libc::c_int) {}

/// A pipe payload on macOS shares the helper's group, so an interrupt sent
/// to that group must not end the helper. A caught signal resets to its
/// default at exec, while an ignored one would be inherited.
#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn ignore_interrupts() -> std::io::Result<()> {
    let handler: extern "C" fn(libc::c_int) = interrupt_ignored;
    unsafe {
        let mut action: libc::sigaction = std::mem::zeroed();
        action.sa_sigaction = handler as libc::sighandler_t;
        action.sa_flags = libc::SA_RESTART;
        libc::sigemptyset(&mut action.sa_mask);
        if libc::sigaction(libc::SIGINT, &action, std::ptr::null_mut()) != 0 {
            return Err(std::io::Error::last_os_error());
        }
    }
    Ok(())
}

#[allow(unsafe_code)]
fn open_terminal() -> std::io::Result<Terminal> {
    let check = |result: libc::c_int| {
        if result < 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(result)
        }
    };
    let fd = check(unsafe { libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY) })?;
    let primary = unsafe { File::from_raw_fd(fd) };
    check(unsafe { libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC) })?;
    check(unsafe { libc::grantpt(fd) })?;
    check(unsafe { libc::unlockpt(fd) })?;
    // The helper is single threaded here, so the shared name buffer is safe.
    let name = unsafe { libc::ptsname(fd) };
    if name.is_null() {
        return Err(std::io::Error::last_os_error());
    }
    let name = unsafe { std::ffi::CStr::from_ptr(name) };
    let path = PathBuf::from(std::ffi::OsStr::from_bytes(name.to_bytes()));
    let secondary = OpenOptions::new()
        .read(true)
        .write(true)
        .custom_flags(libc::O_NOCTTY)
        .open(path)?;
    let size = libc::winsize {
        ws_row: TERMINAL_ROWS,
        ws_col: TERMINAL_COLUMNS,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    check(unsafe { libc::ioctl(fd, libc::TIOCSWINSZ as _, &size) })?;
    Ok(Terminal { primary, secondary })
}

/// Relay owner input to the terminal and terminal output to the owner. The
/// returned channel reports when output ended, which happens once every
/// holder of the secondary end has closed it.
fn relay_terminal(primary: File) -> mpsc::Receiver<()> {
    let (ended, receiver) = mpsc::channel();
    let output = (
        primary.try_clone(),
        std::io::stdout().as_fd().try_clone_to_owned(),
    );
    if let (Ok(mut source), Ok(target)) = output {
        let mut target = File::from(target);
        let _ = std::thread::Builder::new()
            .name("terminal-output".into())
            .spawn(move || {
                let mut bytes = [0; 16 * 1024];
                loop {
                    match source.read(&mut bytes) {
                        Ok(0) => break,
                        Ok(count) => {
                            if target.write_all(&bytes[..count]).is_err() {
                                break;
                            }
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
                        // Linux reports EIO once the secondary end is closed.
                        Err(_) => break,
                    }
                }
                let _ = ended.send(());
            });
    }
    if let Ok(source) = std::io::stdin().as_fd().try_clone_to_owned() {
        let mut source = File::from(source);
        let mut target = primary;
        let _ = std::thread::Builder::new()
            .name("terminal-input".into())
            .spawn(move || {
                let mut bytes = [0; 16 * 1024];
                loop {
                    match source.read(&mut bytes) {
                        Ok(0) => break,
                        Ok(count) => {
                            if target.write_all(&bytes[..count]).is_err() {
                                break;
                            }
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
                        Err(_) => break,
                    }
                }
            });
    }
    receiver
}

fn report_exit(status: &mut File, kind: u8, value: i32) -> bool {
    let mut frame = [0; 5];
    frame[0] = kind;
    frame[1..].copy_from_slice(&value.to_be_bytes());
    status.write_all(&frame).is_ok()
}

/// After a probe, keep a live group leader on macOS until the owner signals
/// the group or closes its end of the private status channel.
fn hold_until_released(status: &mut File) {
    #[cfg(target_os = "macos")]
    let _ = read_control(status);
    #[cfg(target_os = "linux")]
    let _ = status;
}

#[allow(unsafe_code)]
fn status_writer(fd: i32) -> std::io::Result<File> {
    // The launcher reserves this inherited setup descriptor. Only the trusted
    // helper may write status, so it must close automatically at payload exec.
    if unsafe { libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC) } < 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(unsafe { File::from_raw_fd(fd) })
}

#[allow(unsafe_code)]
fn read_launch() -> std::io::Result<Launch> {
    // Read the exact setup frame without reading ahead into payload stdin.
    let mut input = unsafe { File::from_raw_fd(libc::STDIN_FILENO) };
    let result = (|| {
        let mut length = [0; 4];
        input.read_exact(&mut length)?;
        let length = u32::from_be_bytes(length) as usize;
        if length > wire::MAX_FRAME_BYTES {
            return Err(std::io::ErrorKind::InvalidData.into());
        }
        let mut bytes = vec![0; length];
        input.read_exact(&mut bytes)?;
        serde_json::from_slice(&bytes).map_err(std::io::Error::other)
    })();
    let _ = input.into_raw_fd();
    result
}

fn validate(launch: Launch) -> std::io::Result<Launch> {
    if !launch.roots.iter().all(wire::PathIdentity::matches) {
        return Err(std::io::ErrorKind::InvalidData.into());
    }
    #[cfg(target_os = "linux")]
    {
        let current = wire::namespaces()?;
        if current
            .iter()
            .zip(launch.host_namespaces)
            .any(|(inside, outside)| *inside == outside)
            || std::process::id() != 1
        {
            return Err(std::io::ErrorKind::PermissionDenied.into());
        }
        crate::linux_seccomp::apply()?;
    }
    Ok(launch)
}

fn probe(temp: &std::path::Path) -> std::io::Result<()> {
    use std::os::unix::net::UnixListener;
    // Both filesystem and abstract Unix socket authority must be unavailable
    // to payloads. Binding inside a private writable directory distinguishes
    // an IPC denial from a filesystem permission error.
    if UnixListener::bind(temp.join("socket-probe")).is_ok() {
        return Err(std::io::Error::other("unexpected Unix bind access"));
    }
    let address = std::net::SocketAddrV4::new(std::net::Ipv4Addr::LOCALHOST, 0);
    if std::net::TcpListener::bind(address).is_ok() {
        return Err(std::io::Error::other("unexpected IP bind access"));
    }
    let mut file = tempfile::tempfile_in(temp)?;
    file.write_all(b"probe")?;
    if file.as_raw_fd() <= 2 {
        return Err(std::io::ErrorKind::InvalidData.into());
    }
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use std::os::fd::OwnedFd;
    use std::os::unix::net::UnixStream;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn a_probe_helper_releases_its_wait_when_the_owner_disappears() {
        let (mut owner, helper) = UnixStream::pair().unwrap();
        let timeout = Duration::from_secs(1);
        owner.set_read_timeout(Some(timeout)).unwrap();
        let (finished, completion) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let mut status = File::from(OwnedFd::from(helper));
            let reported = report_exit(&mut status, wire::STATUS_EXIT, 0);
            hold_until_released(&mut status);
            finished.send(reported).unwrap();
        });
        let mut frame = [0; 5];
        owner.read_exact(&mut frame).unwrap();
        assert_eq!(frame, [wire::STATUS_EXIT, 0, 0, 0, 0]);
        assert!(matches!(
            completion.try_recv(),
            Err(mpsc::TryRecvError::Empty)
        ));
        drop(owner);
        assert!(completion.recv_timeout(timeout).unwrap());
        worker.join().unwrap();
    }
}

#[cfg(test)]
mod control_tests {
    use super::*;

    #[test]
    fn control_requests_fail_closed() {
        let read = |bytes: &[u8]| read_control(&mut std::io::Cursor::new(bytes.to_vec()));
        assert_eq!(read(b"I"), Control::Interrupt);
        assert_eq!(read(b"T"), Control::Stop);
        assert_eq!(read(b""), Control::OwnerGone);
        assert_eq!(read(b"X"), Control::OwnerGone);
        assert_eq!(read(b"\0"), Control::OwnerGone);
        let mut stream = std::io::Cursor::new(b"IIT".to_vec());
        assert_eq!(read_control(&mut stream), Control::Interrupt);
        assert_eq!(read_control(&mut stream), Control::Interrupt);
        assert_eq!(read_control(&mut stream), Control::Stop);
        assert_eq!(read_control(&mut stream), Control::OwnerGone);
    }
}
