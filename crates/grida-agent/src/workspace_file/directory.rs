//! GRIDA-SEC-004 / GRIDA-SEC-014 — complete, bounded listings of one pinned directory.

use super::*;
use crate::file_tools::{FileAuthority, open_root_directory};
use crate::workspace_search::{
    Child, MAX_DIRECTORY_ENTRIES, MAX_DIRECTORY_NAME_BYTES, WorkspaceSearch, WorkspaceSearchEntry,
    WorkspaceSearchKind,
};
use rustix::fs::{AtFlags, Dir, FileType, statat};
use rustix::io::Errno;
use serde::Serialize;

const MAX_FRAME_BYTES: usize = 2 * 1024 * 1024;

#[derive(Serialize)]
struct Listing {
    entries: Vec<Entry>,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    kind: &'static str,
    #[serde(skip)]
    exact_name: bool,
}

pub(super) fn list(
    authority: &FileAuthority,
    directory: &BindingId,
    relative: &Path,
) -> Result<Vec<u8>> {
    let entries = read(authority, directory, relative, false)?;
    let encoded = serde_json::to_vec(&Listing { entries }).map_err(|_| unavailable())?;
    if encoded.len() >= MAX_FRAME_BYTES {
        return Err(limit());
    }
    Ok(encoded)
}

pub(super) fn search(
    authority: &FileAuthority,
    directory: &BindingId,
    query: &str,
) -> Result<Vec<WorkspaceSearchEntry>> {
    let matched = if query.trim().is_empty() {
        Vec::new()
    } else {
        WorkspaceSearch::from_directories(|relative| {
            read(authority, directory, relative, true).map(|entries| {
                entries
                    .into_iter()
                    .filter_map(|entry| {
                        if !entry.exact_name {
                            return None;
                        }
                        Some(Child {
                            name: entry.name,
                            kind: match entry.kind {
                                "file" => WorkspaceSearchKind::File,
                                "directory" => WorkspaceSearchKind::Directory,
                                _ => return None,
                            },
                        })
                    })
                    .collect()
            })
        })?
        .search(query)
    };
    // Reconfirm the root after traversing independently pinned directories.
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
    scope.revalidate(workspace, grants, protected)?;
    Ok(matched)
}

fn read(
    authority: &FileAuthority,
    directory: &BindingId,
    relative: &Path,
    exact: bool,
) -> Result<Vec<Entry>> {
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
    if exact && path != relative {
        return Err(changed());
    }
    let file = open_root_directory(root, scope.root(), path)?;
    let mut entries = Vec::new();
    let mut name_bytes = 0;
    for entry in Dir::read_from(&file).map_err(|_| unavailable())? {
        let entry = entry.map_err(|_| unavailable())?;
        let name = entry.file_name();
        if matches!(name.to_bytes(), b"." | b"..") {
            continue;
        }
        if entries.len() == MAX_DIRECTORY_ENTRIES {
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
        let exact_name = name.to_str().is_ok();
        let name = name.to_string_lossy().into_owned();
        name_bytes += name.len();
        if name_bytes >= MAX_DIRECTORY_NAME_BYTES {
            return Err(limit());
        }
        entries.push(Entry {
            name,
            kind,
            exact_name,
        });
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
    Ok(entries)
}

fn limit() -> Error {
    Error::new(ErrorKind::LimitExceeded, "workspace_directory_limit")
}

fn changed() -> Error {
    Error::new(ErrorKind::Conflict, "workspace_directory_changed")
}
