//! Denied-network policy applied only after namespace and bind verification.

use std::io;

#[cfg(any(target_arch = "aarch64", target_arch = "x86_64"))]
#[allow(unsafe_code)]
pub fn apply(allow_private_tcp: bool) -> io::Result<()> {
    const LOAD_WORD: u16 = 0x20;
    const JUMP_EQ: u16 = 0x15;
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
    if allow_private_tcp {
        // bwrap created and the helper verified a fresh network namespace.
        // This exception admits TCP streams to its own private loopback.
        // AF_UNIX (including abstract sockets) stays denied, as do packet,
        // netlink and raw sockets. Architecture checks above pin the ABI.
        let restricted_socket = [
            instruction(LOAD_WORD, 0, 0, 16), // args[0]: domain
            instruction(JUMP_EQ, 1, 0, libc::AF_INET as u32),
            instruction(RETURN, 0, 0, ERRNO | libc::EPERM as u32),
            instruction(LOAD_WORD, 0, 0, 24), // args[1]: type and flags
            instruction(
                0x54,
                0,
                0,
                !(libc::SOCK_CLOEXEC | libc::SOCK_NONBLOCK) as u32,
            ), // AND
            instruction(JUMP_EQ, 1, 0, libc::SOCK_STREAM as u32),
            instruction(RETURN, 0, 0, ERRNO | libc::EPERM as u32),
            instruction(LOAD_WORD, 0, 0, 32), // args[2]: protocol
            instruction(JUMP_EQ, 1, 0, 0),
            instruction(JUMP_EQ, 0, 1, libc::IPPROTO_TCP as u32),
            instruction(RETURN, 0, 0, ALLOW),
            instruction(RETURN, 0, 0, ERRNO | libc::EPERM as u32),
        ];
        filter.push(instruction(
            JUMP_EQ,
            0,
            restricted_socket.len() as u8,
            libc::SYS_socket as u32,
        ));
        filter.extend(restricted_socket);
    }
    for syscall in [
        libc::SYS_socket,
        libc::SYS_socketpair,
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
    // The helper is single threaded. The kernel copies this bounded program
    // before the vector goes out of scope, and the restriction is inherited.
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
