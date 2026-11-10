//! GRIDA-SEC-004 — executable custody for reviewed host commands.

use super::{ErrorKind, Result, refused};
use std::fs::{File, OpenOptions};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;

pub(super) fn require_system_installation(path: &Path, executable: &File) -> Result<()> {
    let unavailable = || {
        refused(
            ErrorKind::Unsupported,
            "reviewed_executable_custody_unavailable",
        )
    };
    let parent = path.parent().ok_or_else(unavailable)?;
    if ![Path::new("/bin"), Path::new("/usr/bin")].contains(&parent) || !unprivileged() {
        return Err(unavailable());
    }

    // A root-owned executable still needs a parent the current user cannot
    // rename or replace. Check from the root down, without following aliases.
    let ancestors: Vec<_> = parent.ancestors().collect();
    for path in ancestors.into_iter().rev() {
        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)
            .map_err(|_| unavailable())?;
        if !administrator_controlled(&directory) {
            return Err(unavailable());
        }
    }
    if !administrator_controlled(executable) {
        return Err(unavailable());
    }
    Ok(())
}

fn administrator_controlled(file: &File) -> bool {
    file.metadata()
        .is_ok_and(|metadata| metadata.uid() == 0 && metadata.mode() & 0o022 == 0)
        && no_extended_acl(file)
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn unprivileged() -> bool {
    // These process identity queries have no pointer arguments.
    unsafe {
        libc::geteuid() != 0
            && libc::getuid() == libc::geteuid()
            && libc::getgid() == libc::getegid()
            && libc::issetugid() == 0
    }
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn no_extended_acl(file: &File) -> bool {
    use std::ffi::{c_int, c_void};

    // Darwin <sys/acl.h> defines the extended ACL type and fd API.
    const ACL_TYPE_EXTENDED: c_int = 0x100;
    unsafe extern "C" {
        fn acl_get_fd_np(fd: c_int, kind: c_int) -> *mut c_void;
        fn acl_free(acl: *mut c_void) -> c_int;
    }
    // The descriptor remains live and a returned ACL is freed exactly once.
    let acl = unsafe { acl_get_fd_np(file.as_raw_fd(), ACL_TYPE_EXTENDED) };
    if acl.is_null() {
        return std::io::Error::last_os_error().raw_os_error() == Some(libc::ENOENT);
    }
    unsafe { acl_free(acl) };
    false
}

#[cfg(target_os = "linux")]
#[allow(unsafe_code)]
fn unprivileged() -> bool {
    #[repr(C)]
    struct Header {
        version: u32,
        pid: libc::c_int,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Capabilities {
        effective: u32,
        permitted: u32,
        inheritable: u32,
    }

    let (mut uid, mut effective_uid, mut saved_uid) = (0, 0, 0);
    let (mut gid, mut effective_gid, mut saved_gid) = (0, 0, 0);
    let mut header = Header {
        // Linux <linux/capability.h> version 3 uses two capability words.
        version: 0x2008_0522,
        pid: 0,
    };
    let mut caps = [Capabilities {
        effective: 0,
        permitted: 0,
        inheritable: 0,
    }; 2];
    // All kernel outputs point to writable storage of the declared ABI size.
    let ordinary = unsafe {
        libc::getresuid(&mut uid, &mut effective_uid, &mut saved_uid) == 0
            && libc::getresgid(&mut gid, &mut effective_gid, &mut saved_gid) == 0
            && libc::syscall(
                libc::SYS_capget,
                &mut header as *mut Header,
                caps.as_mut_ptr(),
            ) == 0
    };
    ordinary
        && uid != 0
        && uid == effective_uid
        && uid == saved_uid
        && gid == effective_gid
        && gid == saved_gid
        && caps
            .iter()
            .all(|entry| entry.effective == 0 && entry.permitted == 0)
}

#[cfg(target_os = "linux")]
#[allow(unsafe_code)]
fn no_extended_acl(file: &File) -> bool {
    // Require a known local filesystem with POSIX access ACL semantics.
    // Remote or userspace filesystems may report ownership and ACLs differently.
    let mut filesystem = std::mem::MaybeUninit::<libc::statfs>::uninit();
    if unsafe { libc::fstatfs(file.as_raw_fd(), filesystem.as_mut_ptr()) } != 0 {
        return false;
    }
    let kind = unsafe { filesystem.assume_init() }.f_type;
    if ![
        libc::EXT4_SUPER_MAGIC,
        0x5846_5342, // XFS_SUPER_MAGIC in Linux <linux/magic.h>.
        libc::BTRFS_SUPER_MAGIC,
        libc::OVERLAYFS_SUPER_MAGIC,
    ]
    .contains(&kind)
    {
        return false;
    }
    // With a null output pointer and length zero, this queries presence only.
    let result = unsafe {
        libc::fgetxattr(
            file.as_raw_fd(),
            c"system.posix_acl_access".as_ptr(),
            std::ptr::null_mut(),
            0,
        )
    };
    result == -1 && std::io::Error::last_os_error().raw_os_error() == Some(libc::ENODATA)
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn queries_the_darwin_acl_of_the_opened_file() {
        let file = tempfile::NamedTempFile::new().unwrap();
        assert!(no_extended_acl(file.as_file()));
        let chmod = std::process::Command::new("/bin/chmod")
            .args(["+a", "everyone allow write,delete"])
            .arg(file.path())
            .status()
            .unwrap();
        assert!(chmod.success());
        assert!(!no_extended_acl(file.as_file()));
    }
}
