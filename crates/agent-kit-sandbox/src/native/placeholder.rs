//! GRIDA-SEC-004 — read-only placeholders for missing protected paths.
//!
//! bubblewrap can only carve a protected path out of a writable mount when a
//! mount point exists. For a missing protected path the supervisor creates an
//! empty directory, mounts it read-only for the launch, and removes it once
//! no launch can still observe it. While one exists, the payload cannot create
//! the protected path.
//!
//! Launches in this or another host process can rely on the same placeholder.
//! Each holds a shared `flock` on it for as long as its namespace may exist.
//! A launch whose namespace is known to have ended removes the placeholder only
//! when it can take the lock exclusively, so a placeholder is never removed
//! under a live mount. Mode `0500` marks an empty directory as a placeholder
//! that a launch can join. A launch whose end is unverified keeps its lock for
//! the life of the process and leaves an ordinary empty directory behind.

use super::{ErrorKind, Result, refused};
use crate::wire::PathIdentity;
use std::ffi::CString;
use std::fs::File;
use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};

const MODE: libc::mode_t = 0o500;
const LEFT_BEHIND_MODE: libc::mode_t = 0o700;
const ATTEMPTS: usize = 4;

pub(super) struct Placeholder {
    path: PathBuf,
    parent: OwnedFd,
    name: CString,
    /// Holds the shared lock until released.
    directory: Option<File>,
    device: u64,
    inode: u64,
}

/// A placeholder dropped without a release, for example with its supervisor,
/// is treated as possibly still observed.
impl Drop for Placeholder {
    fn drop(&mut self) {
        if let Some(directory) = self.directory.take() {
            leave(directory);
        }
    }
}

/// Keep the shared lock for the life of the process so no launch removes the
/// placeholder under a namespace that may still rely on it, and turn it into
/// an ordinary directory that no later launch joins.
fn leave(directory: File) {
    let _ = change_mode(&directory, LEFT_BEHIND_MODE);
    std::mem::forget(directory);
}

impl Placeholder {
    /// Hold a placeholder at `path`, or return `None` when an entry that is
    /// not a placeholder already exists there.
    pub(super) fn hold(path: &Path) -> Result<Option<Self>> {
        let changed = || refused(ErrorKind::Conflict, "sandbox_location_changed");
        let unavailable = || refused(ErrorKind::Unavailable, "sandbox_placeholder_unavailable");
        let parent_path = path.parent().ok_or_else(changed)?;
        let name = path
            .file_name()
            .and_then(|name| CString::new(name.as_bytes()).ok())
            .ok_or_else(changed)?;
        for _ in 0..ATTEMPTS {
            let parent = open_parent(parent_path)?;
            let created = match mkdirat(&parent, &name) {
                Ok(()) => true,
                Err(error) if error.raw_os_error() == Some(libc::EEXIST) => false,
                Err(_) => return Err(unavailable()),
            };
            let directory = match openat_directory(&parent, &name) {
                Ok(directory) => directory,
                // The name exists but is not a directory, or it is a link.
                Err(error)
                    if !created
                        && matches!(error.raw_os_error(), Some(libc::ENOTDIR | libc::ELOOP)) =>
                {
                    return Ok(None);
                }
                // Removed since it was seen. Try again.
                Err(error) if !created && error.raw_os_error() == Some(libc::ENOENT) => continue,
                Err(_) => return Err(unavailable()),
            };
            // Nothing else can rely on a directory this call just created.
            let abandon = |error| {
                if created {
                    let _ = remove_directory_at(&parent, &name);
                }
                Err(error)
            };
            let Ok((device, inode, mode)) = stat(directory.as_raw_fd()) else {
                return abandon(unavailable());
            };
            if created {
                // The process umask must not change the placeholder marker.
                if change_mode(&directory, MODE).is_err() {
                    return abandon(unavailable());
                }
            } else if mode & 0o7777 != MODE || !is_empty(&directory)? {
                return Ok(None);
            }
            if flock(&directory, libc::LOCK_SH).is_err() {
                return abandon(unavailable());
            }
            // A launch that held the lock exclusively may have removed it, and
            // another entry may stand at the path now.
            if lstat_at(&parent, &name).is_ok_and(|(d, i)| d == device && i == inode) {
                return Ok(Some(Self {
                    path: path.to_owned(),
                    parent,
                    name,
                    directory: Some(directory),
                    device,
                    inode,
                }));
            }
        }
        Err(changed())
    }

    /// The identity the helper verifies inside the namespace.
    pub(super) fn identity(&self) -> PathIdentity {
        PathIdentity {
            path: self.path.clone(),
            device: self.device,
            inode: self.inode,
        }
    }

    /// Release this launch's hold. `ended` states that no process of the
    /// launch can still observe the placeholder's mount.
    pub(super) fn release(mut self, ended: bool) {
        let Some(directory) = self.directory.take() else {
            return;
        };
        if !ended {
            leave(directory);
            return;
        }
        // Only the last launch relying on it can lock it exclusively.
        if flock(&directory, libc::LOCK_EX | libc::LOCK_NB).is_ok()
            && lstat_at(&self.parent, &self.name)
                .is_ok_and(|(device, inode)| device == self.device && inode == self.inode)
        {
            // Fails harmlessly when something was placed inside meanwhile.
            let _ = remove_directory_at(&self.parent, &self.name);
        }
    }
}

#[allow(unsafe_code)]
fn open_parent(path: &Path) -> Result<OwnedFd> {
    let changed = || refused(ErrorKind::Conflict, "sandbox_location_changed");
    let raw = CString::new(path.as_os_str().as_bytes()).map_err(|_| changed())?;
    let fd = unsafe {
        libc::open(
            raw.as_ptr(),
            libc::O_PATH | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return Err(
            if io::Error::last_os_error().raw_os_error() == Some(libc::ENOENT) {
                refused(ErrorKind::Unsupported, "sandbox_protected_overlap")
            } else {
                changed()
            },
        );
    }
    let fd = unsafe { OwnedFd::from_raw_fd(fd) };
    // The opened directory must be the canonical parent itself, not a
    // directory reached through a link substituted on the way.
    match std::fs::read_link(format!("/proc/self/fd/{}", fd.as_raw_fd())) {
        Ok(resolved) if resolved == path => Ok(fd),
        _ => Err(changed()),
    }
}

#[allow(unsafe_code)]
fn mkdirat(parent: &OwnedFd, name: &CString) -> io::Result<()> {
    if unsafe { libc::mkdirat(parent.as_raw_fd(), name.as_ptr(), MODE) } == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[allow(unsafe_code)]
fn openat_directory(parent: &OwnedFd, name: &CString) -> io::Result<File> {
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}

#[allow(unsafe_code)]
fn stat(fd: i32) -> Result<(u64, u64, libc::mode_t)> {
    let mut stat = unsafe { std::mem::zeroed::<libc::stat>() };
    if unsafe { libc::fstat(fd, &mut stat) } != 0 {
        return Err(refused(
            ErrorKind::Unavailable,
            "sandbox_placeholder_unavailable",
        ));
    }
    Ok((stat.st_dev, stat.st_ino, stat.st_mode))
}

#[allow(unsafe_code)]
fn lstat_at(parent: &OwnedFd, name: &CString) -> io::Result<(u64, u64)> {
    let mut stat = unsafe { std::mem::zeroed::<libc::stat>() };
    if unsafe {
        libc::fstatat(
            parent.as_raw_fd(),
            name.as_ptr(),
            &mut stat,
            libc::AT_SYMLINK_NOFOLLOW,
        )
    } != 0
    {
        return Err(io::Error::last_os_error());
    }
    if stat.st_mode & libc::S_IFMT != libc::S_IFDIR {
        return Err(io::ErrorKind::InvalidData.into());
    }
    Ok((stat.st_dev, stat.st_ino))
}

fn is_empty(directory: &File) -> Result<bool> {
    std::fs::read_dir(format!("/proc/self/fd/{}", directory.as_raw_fd()))
        .map(|mut entries| entries.next().is_none())
        .map_err(|_| refused(ErrorKind::Unavailable, "sandbox_placeholder_unavailable"))
}

#[allow(unsafe_code)]
fn flock(file: &File, operation: i32) -> io::Result<()> {
    loop {
        if unsafe { libc::flock(file.as_raw_fd(), operation) } == 0 {
            return Ok(());
        }
        let error = io::Error::last_os_error();
        if error.kind() != io::ErrorKind::Interrupted {
            return Err(error);
        }
    }
}

#[allow(unsafe_code)]
fn change_mode(file: &File, mode: libc::mode_t) -> io::Result<()> {
    if unsafe { libc::fchmod(file.as_raw_fd(), mode) } == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[allow(unsafe_code)]
fn remove_directory_at(parent: &OwnedFd, name: &CString) -> io::Result<()> {
    if unsafe { libc::unlinkat(parent.as_raw_fd(), name.as_ptr(), libc::AT_REMOVEDIR) } == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}
