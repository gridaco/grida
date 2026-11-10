//! GRIDA-SEC-004 / GRIDA-SEC-014 — atomic UTF-8 saves relative to a pinned parent.

use super::*;
use crate::file_tools::{FileAuthority, open_root_directory};
use rustix::fs::{
    AtFlags, FileType, Mode, OFlags, Stat, fstat, fsync, mkdirat, openat, renameat, statat,
    unlinkat,
};
use rustix::io::Errno;
use std::ffi::OsStr;
use std::io::Write;
use std::path::Component;
use uuid::Uuid;

pub(super) const MAX_WRITE_BYTES: usize = 64 * 1024 * 1024;

pub(super) fn save(
    authority: &FileAuthority,
    directory: &BindingId,
    relative: &Path,
    bytes: &[u8],
    expected_mtime: Option<f64>,
) -> Result<f64> {
    validate_path(relative)?;
    let name = relative.file_name().ok_or_else(not_a_file)?;
    let relative_parent = relative.parent().ok_or_else(not_a_file)?;
    let FileAuthority {
        workspace,
        grants,
        protected,
    } = authority;
    let scope = workspace.select(
        Some(directory),
        Path::new(""),
        FileAccess::Read,
        grants,
        protected,
    )?;
    let root = scope.read_root(workspace, grants, protected)?;
    let target = workspace.select(
        Some(directory),
        relative_parent,
        FileAccess::Write,
        grants,
        protected,
    )?;
    let parent_path = target
        .path()
        .strip_prefix(scope.root())
        .map_err(|_| changed())?;
    let parent = create_parent(root, scope.root(), parent_path, || {
        target.revalidate(workspace, grants, protected)
    })?;
    let check_parent = || {
        target.revalidate(workspace, grants, protected)?;
        verify_open_path(&parent, scope.root())?;
        let latest = open_root_directory(root, scope.root(), parent_path)?;
        if same_file(&parent, &latest)? {
            Ok(())
        } else {
            Err(changed())
        }
    };
    check_parent()?;
    let stage = Staged::create(&parent)?;
    (&stage.file).write_all(bytes).map_err(|_| failed())?;
    stage.file.sync_all().map_err(|_| failed())?;
    let written_mtime = mtime(&fstat(&stage.file).map_err(|_| failed())?);
    check_parent()?;
    if !stage.owns_name() {
        return Err(changed());
    }
    check_destination(&parent, name, expected_mtime)?;
    // A competing external writer can still replace the name between
    // the last stat and rename. The rename itself is atomic.
    renameat(&parent, stage.name.as_str(), &parent, name).map_err(|_| unverified())?;
    fsync(&parent).map_err(|_| unverified())?;
    check_parent().map_err(|_| unverified())?;
    let stat = statat(&parent, name, AtFlags::SYMLINK_NOFOLLOW).map_err(|_| unverified())?;
    if !stage.matches(&stat) || mtime(&stat) != written_mtime {
        return Err(unverified());
    }
    Ok(written_mtime)
}

fn create_parent(
    root: &File,
    root_path: &Path,
    relative: &Path,
    check: impl Fn() -> Result<()>,
) -> Result<File> {
    let mut parent = root.try_clone().map_err(|_| failed())?;
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err(changed());
        };
        check()?;
        verify_open_path(&parent, root_path)?;
        match statat(&parent, name, AtFlags::SYMLINK_NOFOLLOW) {
            Ok(_) => {}
            Err(Errno::NOENT) => match mkdirat(&parent, name, Mode::from_bits_truncate(0o777)) {
                Ok(()) => fsync(&parent).map_err(|_| failed())?,
                Err(Errno::EXIST) => {}
                Err(_) => return Err(failed()),
            },
            Err(_) => return Err(failed()),
        }
        parent = open_root_directory(&parent, root_path, Path::new(name))?;
    }
    Ok(parent)
}

fn check_destination(parent: &File, name: &OsStr, expected: Option<f64>) -> Result<()> {
    let stat = match statat(parent, name, AtFlags::SYMLINK_NOFOLLOW) {
        Ok(stat) => stat,
        Err(Errno::NOENT) if expected.is_some() => return Err(modified_since()),
        Err(Errno::NOENT) => return Ok(()),
        Err(_) => return Err(failed()),
    };
    if FileType::from_raw_mode(stat.st_mode) != FileType::RegularFile || stat.st_nlink != 1 {
        return Err(not_a_file());
    }
    if stat.st_dev != fstat(parent).map_err(|_| failed())?.st_dev {
        return Err(Error::new(ErrorKind::Unavailable, "file_mount_unsupported"));
    }
    if expected.is_some_and(|expected| expected != mtime(&stat)) {
        return Err(modified_since());
    }
    Ok(())
}

fn mtime(stat: &Stat) -> f64 {
    node_mtime_ms(stat.st_mtime.into(), stat.st_mtime_nsec.into())
}

fn same_file(first: &File, second: &File) -> Result<bool> {
    let a = first.metadata().map_err(|_| failed())?;
    let b = second.metadata().map_err(|_| failed())?;
    Ok(a.dev() == b.dev() && a.ino() == b.ino())
}

pub(super) struct Staged<'a> {
    parent: &'a File,
    pub(super) file: File,
    pub(super) name: String,
    identity: Stat,
}

impl<'a> Staged<'a> {
    fn create(parent: &'a File) -> Result<Self> {
        let name = format!(".grida-save-{}.tmp", Uuid::new_v4());
        Self::create_named(parent, name, Mode::from_bits_truncate(0o644))
    }

    pub(super) fn create_named(parent: &'a File, name: String, mode: Mode) -> Result<Self> {
        let file: File = openat(
            parent,
            name.as_str(),
            OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            mode,
        )
        .map_err(|_| failed())?
        .into();
        let identity = fstat(&file).map_err(|_| failed())?;
        Ok(Self {
            parent,
            file,
            name,
            identity,
        })
    }

    fn matches(&self, stat: &Stat) -> bool {
        stat.st_dev == self.identity.st_dev
            && stat.st_ino == self.identity.st_ino
            && stat.st_nlink == 1
    }

    pub(super) fn owns_name(&self) -> bool {
        statat(self.parent, self.name.as_str(), AtFlags::SYMLINK_NOFOLLOW)
            .is_ok_and(|stat| self.matches(&stat))
    }
}

impl Drop for Staged<'_> {
    fn drop(&mut self) {
        if self.owns_name() {
            let _ = unlinkat(self.parent, self.name.as_str(), AtFlags::empty());
        }
    }
}

fn modified_since() -> Error {
    Error::new(ErrorKind::Conflict, "workspace_write_modified_since")
}

fn not_a_file() -> Error {
    Error::new(ErrorKind::InvalidInput, "workspace_write_type_unsupported")
}

fn changed() -> Error {
    Error::new(ErrorKind::Conflict, "workspace_directory_changed")
}

fn failed() -> Error {
    Error::new(ErrorKind::Unavailable, "workspace_write_failed")
}

fn unverified() -> Error {
    Error::new(ErrorKind::Unavailable, "workspace_write_unverified")
}
