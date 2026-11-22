//! Denied-network policy applied only after namespace and bind verification.

use std::io;

#[cfg(any(target_arch = "aarch64", target_arch = "x86_64"))]
#[allow(unsafe_code)]
pub fn apply(allow_private_tcp: bool) -> io::Result<()> {
    const LOAD_WORD: u16 = 0x20;
    const JUMP_EQ: u16 = 0x15;
    const AND: u16 = 0x54;
    #[cfg(target_arch = "x86_64")]
    const JUMP_GE: u16 = 0x35;
    const RETURN: u16 = 0x06;
    const ALLOW: u32 = 0x7fff0000;
    const KILL: u32 = 0x80000000;
    const ERRNO: u32 = 0x00050000;
    #[cfg(target_arch = "aarch64")]
    const ARCH: u32 = 0xc00000b7;
    #[cfg(target_arch = "x86_64")]
    const ARCH: u32 = 0xc000003e;
    let instruction = |code, jt, jf, k| libc::sock_filter { code, jt, jf, k };
    let mut filter = vec![
        instruction(LOAD_WORD, 0, 0, 4),
        instruction(JUMP_EQ, 1, 0, ARCH),
        instruction(RETURN, 0, 0, KILL),
        instruction(LOAD_WORD, 0, 0, 0),
    ];
    #[cfg(target_arch = "x86_64")]
    filter.extend([
        instruction(JUMP_GE, 0, 1, 0x40000000),
        instruction(RETURN, 0, 0, KILL),
    ]);
    filter.extend([
        // Returning ENOSYS permits libc to fall back to ordinary clone/fork.
        instruction(JUMP_EQ, 0, 1, libc::SYS_clone3 as u32),
        instruction(RETURN, 0, 0, ERRNO | libc::ENOSYS as u32),
    ]);
    let mut allow_stream_socket =
        |syscall: libc::c_long, domain: i32, extra_protocol: Option<u32>| {
            let mut rules = vec![
                instruction(LOAD_WORD, 0, 0, 16), // args[0]: domain
                instruction(JUMP_EQ, 1, 0, domain as u32),
                instruction(RETURN, 0, 0, ERRNO | libc::EPERM as u32),
                instruction(LOAD_WORD, 0, 0, 24), // args[1]: type and flags
                instruction(
                    AND,
                    0,
                    0,
                    !(libc::SOCK_CLOEXEC | libc::SOCK_NONBLOCK) as u32,
                ), // AND
                instruction(JUMP_EQ, 1, 0, libc::SOCK_STREAM as u32),
                instruction(RETURN, 0, 0, ERRNO | libc::EPERM as u32),
                instruction(LOAD_WORD, 0, 0, 32), // args[2]: protocol
            ];
            if let Some(protocol) = extra_protocol {
                rules.push(instruction(JUMP_EQ, 1, 0, protocol));
            }
            rules.extend([
                instruction(JUMP_EQ, 0, 1, 0),
                instruction(RETURN, 0, 0, ALLOW),
                instruction(RETURN, 0, 0, ERRNO | libc::EPERM as u32),
            ]);
            filter.push(instruction(JUMP_EQ, 0, rules.len() as u8, syscall as u32));
            filter.extend(rules);
        };
    // Runtimes use already-connected Unix stream pairs for internal wakeups.
    // Neither endpoint can bind a name or reach a pre-existing Unix socket.
    allow_stream_socket(libc::SYS_socketpair, libc::AF_UNIX, None);
    if allow_private_tcp {
        // bwrap created and the helper verified a fresh network namespace.
        // Only TCP streams on its private loopback can reach the proxy.
        allow_stream_socket(
            libc::SYS_socket,
            libc::AF_INET,
            Some(libc::IPPROTO_TCP as u32),
        );
    }
    for syscall in [
        libc::SYS_socket,
        libc::SYS_bind,
        libc::SYS_io_uring_setup,
        libc::SYS_io_uring_enter,
        libc::SYS_io_uring_register,
        libc::SYS_ptrace,
        libc::SYS_process_vm_readv,
        libc::SYS_process_vm_writev,
        libc::SYS_pidfd_getfd,
        libc::SYS_open_by_handle_at,
        libc::SYS_bpf,
        libc::SYS_unshare,
        libc::SYS_setns,
        libc::SYS_mount,
        libc::SYS_umount2,
        libc::SYS_pivot_root,
    ] {
        filter.push(instruction(JUMP_EQ, 0, 1, syscall as u32));
        filter.push(instruction(RETURN, 0, 0, ERRNO | libc::EPERM as u32));
    }
    filter.push(instruction(RETURN, 0, 0, ALLOW));
    let program = libc::sock_fprog {
        len: filter.len() as u16,
        filter: filter.as_mut_ptr(),
    };
    // Apply the filter to the launch thread before spawning the payload.
    // The kernel copies this bounded program and the restriction is inherited.
    // Prevent ordinary procfs opens of the same-UID helper's memory or fds.
    if unsafe { libc::prctl(libc::PR_SET_DUMPABLE, 0, 0, 0, 0) } != 0
        || unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) } != 0
        || unsafe { libc::prctl(libc::PR_SET_SECCOMP, 2, &program as *const _, 0, 0) } != 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
pub fn apply(_allow_private_tcp: bool) -> io::Result<()> {
    Err(io::ErrorKind::Unsupported.into())
}

#[cfg(all(test, any(target_arch = "aarch64", target_arch = "x86_64")))]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::os::fd::AsRawFd;
    use std::os::unix::net::{UnixDatagram, UnixListener, UnixStream};

    #[test]
    #[allow(unsafe_code)]
    fn runtime_stream_pairs_cannot_be_named() {
        let fixture = tempfile::tempdir().unwrap();
        std::thread::spawn(move || {
            apply(true).unwrap();
            let (mut sender, mut receiver) = UnixStream::pair().unwrap();
            sender.write_all(b"wake").unwrap();
            let mut received = [0; 4];
            receiver.read_exact(&mut received).unwrap();
            assert_eq!(&received, b"wake");
            assert_eq!(
                UnixDatagram::pair().unwrap_err().raw_os_error(),
                Some(libc::EPERM)
            );
            assert_eq!(
                UnixListener::bind(fixture.path().join("named.sock"))
                    .unwrap_err()
                    .raw_os_error(),
                Some(libc::EPERM)
            );
            // A family-only Unix address requests Linux's abstract autobind.
            let address = libc::AF_UNIX as libc::sa_family_t;
            let result = unsafe {
                libc::bind(
                    sender.as_raw_fd(),
                    std::ptr::from_ref(&address).cast(),
                    std::mem::size_of_val(&address) as libc::socklen_t,
                )
            };
            assert_eq!(result, -1);
            assert_eq!(io::Error::last_os_error().raw_os_error(), Some(libc::EPERM));
        })
        .join()
        .unwrap();
    }
}
