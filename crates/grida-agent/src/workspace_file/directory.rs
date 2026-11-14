//! GRIDA-SEC-004 / GRIDA-SEC-014 — complete, bounded listings of one pinned directory.

use super::*;
use crate::file_tools::{FileAuthority, open_root_directory};
use rustix::fs::{AtFlags, Dir, FileType, statat};
use rustix::io::Errno;
use serde::Serialize;

const MAX_ENTRIES: usize = 8_192;
const MAX_FRAME_BYTES: usize = 2 * 1024 * 1024;

#[derive(Serialize)]
struct Listing {
    entries: Vec<Entry>,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    kind: &'static str,
}

pub(super) fn list(
    authority: &FileAuthority,
    directory: &BindingId,
    relative: &Path,
) -> Result<Vec<u8>> {
    validate_path(relative)?;
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
        relative,
        FileAccess::Read,
        grants,
        protected,
    )?;
    let path = target
        .path()
        .strip_prefix(scope.root())
        .map_err(|_| changed())?;
    let file = open_root_directory(root, scope.root(), path)?;
    let mut entries = Vec::new();
    let mut name_bytes = 0;
    for entry in Dir::read_from(&file).map_err(|_| unavailable())? {
        let entry = entry.map_err(|_| unavailable())?;
        let name = entry.file_name();
        if matches!(name.to_bytes(), b"." | b"..") {
            continue;
        }
        if entries.len() == MAX_ENTRIES {
            return Err(limit());
        }
        let file_type = match entry.file_type() {
            FileType::Unknown => match statat(&file, name, AtFlags::SYMLINK_NOFOLLOW) {
                Ok(stat) => FileType::from_raw_mode(stat.st_mode),
                Err(Errno::NOENT) => continue,
                Err(_) => return Err(unavailable()),
            },
            file_type => file_type,
        };
        let kind = match file_type {
            FileType::Directory => "directory",
            FileType::RegularFile => "file",
            FileType::Symlink => "symlink",
            _ => "other",
        };
        let name = name.to_string_lossy().into_owned();
        name_bytes += name.len();
        if name_bytes >= MAX_FRAME_BYTES {
            return Err(limit());
        }
        entries.push(Entry { name, kind });
    }
    let encoded = serde_json::to_vec(&Listing { entries }).map_err(|_| unavailable())?;
    if encoded.len() >= MAX_FRAME_BYTES {
        return Err(limit());
    }
    scope.revalidate(workspace, grants, protected)?;
    target.revalidate(workspace, grants, protected)?;
    verify_open_path(&file, scope.root())?;
    let latest = open_root_directory(root, scope.root(), path)?;
    let first = file.metadata().map_err(|_| unavailable())?;
    let last = latest.metadata().map_err(|_| unavailable())?;
    if first.dev() != last.dev() || first.ino() != last.ino() {
        return Err(changed());
    }
    Ok(encoded)
}

fn limit() -> Error {
    Error::new(ErrorKind::LimitExceeded, "workspace_directory_limit")
}

fn changed() -> Error {
    Error::new(ErrorKind::Conflict, "workspace_directory_changed")
}
