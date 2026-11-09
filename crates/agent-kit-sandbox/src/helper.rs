use crate::wire::{self, Launch, Task};
use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, IntoRawFd};
use std::os::unix::process::ExitStatusExt;
use std::process::Command;

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
            report_exit(&mut status, wire::STATUS_EXIT, 0)
        }
        Task::Command {
            executable,
            arguments,
            cwd,
            environment,
        } => {
            let mut process = match Command::new(executable)
                .args(arguments)
                .current_dir(cwd)
                .env_clear()
                .envs(environment)
                .spawn()
            {
                Ok(process) => process,
                Err(_) => {
                    let _ = status.write_all(&[wire::STATUS_SETUP_FAILED]);
                    return false;
                }
            };
            if status.write_all(&[wire::STATUS_READY]).is_err() {
                let _ = process.kill();
                let _ = process.wait();
                return false;
            }
            let Ok(exit) = process.wait() else {
                return false;
            };
            if let Some(code) = exit.code() {
                report_exit(&mut status, wire::STATUS_EXIT, code)
            } else if let Some(signal) = exit.signal() {
                report_exit(&mut status, wire::STATUS_SIGNAL, signal)
            } else {
                false
            }
        }
    }
}

fn report_exit(status: &mut File, kind: u8, value: i32) -> bool {
    let mut frame = [0; 5];
    frame[0] = kind;
    frame[1..].copy_from_slice(&value.to_be_bytes());
    if status.write_all(&frame).is_err() {
        return false;
    }
    #[cfg(target_os = "macos")]
    {
        // Keep a live group leader until the owner signals the group or
        // closes its end of the private status channel.
        let _ = status.read_exact(&mut [0]);
    }
    true
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
    fn terminal_helper_releases_its_wait_when_the_owner_disappears() {
        let (mut owner, helper) = UnixStream::pair().unwrap();
        let timeout = Duration::from_secs(1);
        owner.set_read_timeout(Some(timeout)).unwrap();
        let (finished, completion) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let mut status = File::from(OwnedFd::from(helper));
            finished
                .send(report_exit(&mut status, wire::STATUS_EXIT, 0))
                .unwrap();
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
