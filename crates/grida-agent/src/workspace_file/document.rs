//! GRIDA-SEC-004 / GRIDA-SEC-014 — one Main-selected document, without a directory grant.

use super::stdio::{NativeIdentity, invalid_frame, milliseconds, output_failed};
use super::write::Staged;
use super::{CHUNK_BYTES, unavailable};
use crate::file_tools::open_root_file;
use crate::workspace::{ProtectedRoots, validate_absolute};
use agent_kit_core::{Error, ErrorKind, Result};
use rustix::fs::{Mode, OFlags, fsync, getpath, open, renameat};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, Metadata};
use std::io::{BufRead, Read, Write};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Request {
    document: DocumentRequest,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DocumentRequest {
    path: PathBuf,
    parent_identity: NativeIdentity,
    identity: NativeIdentity,
    protected: Vec<PathBuf>,
    write: Option<Save>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Save {
    length: u64,
    expected_mtime: String,
    temporary: String,
}

struct Selected {
    path: PathBuf,
    parent: File,
    parent_identity: NativeIdentity,
    identity: NativeIdentity,
    protected: ProtectedRoots,
}

#[derive(Serialize)]
struct Opened {
    size: String,
    mtime: f64,
}

#[derive(Serialize)]
struct Saved {
    identity: NativeIdentity,
    mtime: f64,
}

pub(super) fn serve(
    input: &mut impl BufRead,
    output: &mut impl Write,
    request: Request,
) -> Result<()> {
    let DocumentRequest {
        path,
        parent_identity,
        identity,
        protected,
        write,
    } = request.document;
    validate_absolute(&path)?;
    let parent_path = path.parent().ok_or_else(invalid_frame)?;
    let protected = ProtectedRoots::new(protected)?;
    protected.check(&path)?;
    // Search-only permits descriptor-relative lookup and fsync without
    // granting a directory listing, including when the parent is HOME.
    let search = OFlags::from_bits_retain(libc::O_SEARCH as _);
    let parent = open(
        parent_path,
        search | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::empty(),
    )
    .map_err(|_| unavailable())?
    .into();
    let selected = Selected {
        path,
        parent,
        parent_identity,
        identity,
        protected,
    };
    let metadata = selected.check(&selected.identity)?;
    match write {
        Some(save) => selected.save(input, output, save, &metadata),
        None => selected.read(input, output, &metadata),
    }
}

impl Selected {
    fn parent_path(&self) -> &Path {
        self.path.parent().expect("validated parent")
    }

    fn name(&self) -> &Path {
        Path::new(self.path.file_name().expect("validated file"))
    }

    fn check(&self, identity: &NativeIdentity) -> Result<Metadata> {
        self.protected.check(&self.path)?;
        exact_path(&self.parent, self.parent_path())?;
        let parent = self.parent.metadata().map_err(|_| unavailable())?;
        let current_parent = fs::symlink_metadata(self.parent_path()).map_err(|_| changed())?;
        let current = fs::symlink_metadata(&self.path).map_err(|_| changed())?;
        if !parent.is_dir()
            || !current_parent.is_dir()
            || !self.parent_identity.matches(&parent)
            || !self.parent_identity.matches(&current_parent)
            || !current.is_file()
            || current.nlink() != 1
            || parent.dev() != current.dev()
            || !identity.matches(&current)
        {
            return Err(changed());
        }
        Ok(current)
    }

    fn read(
        &self,
        input: &mut impl BufRead,
        output: &mut impl Write,
        original: &Metadata,
    ) -> Result<()> {
        let mut file = open_root_file(&self.parent, self.parent_path(), self.name())?;
        let check = |file: &File| {
            exact_path(file, &self.path)?;
            let current = self.check(&self.identity)?;
            let opened = file.metadata().map_err(|_| unavailable())?;
            if !self.identity.matches(&opened)
                || opened.nlink() != 1
                || !same_version(original, &opened)
                || !same_version(original, &current)
            {
                return Err(changed());
            }
            Ok(())
        };
        check(&file)?;
        send(
            output,
            &Opened {
                size: original.len().to_string(),
                mtime: file_mtime(original)?,
            },
        )?;
        let Some(span) = super::stdio::frame::<super::stdio::Span>(input)? else {
            return Ok(());
        };
        // The stand-alone text client consumes the whole selected file.
        if span.offset != "0" || span.length != original.len().to_string() {
            return Err(invalid_frame());
        }
        let mut bytes = [0; CHUNK_BYTES];
        let mut remaining = original.len();
        while remaining > 0 {
            check(&file)?;
            let chunk = remaining.min(CHUNK_BYTES as u64) as usize;
            file.read_exact(&mut bytes[..chunk])
                .map_err(|_| unavailable())?;
            check(&file)?;
            output
                .write_all(&bytes[..chunk])
                .map_err(|_| output_failed())?;
            remaining -= chunk as u64;
        }
        check(&file)?;
        output.flush().map_err(|_| output_failed())
    }

    fn save(
        &self,
        input: &mut impl BufRead,
        output: &mut impl Write,
        save: Save,
        original: &Metadata,
    ) -> Result<()> {
        let mtime = save
            .expected_mtime
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite())
            .ok_or_else(invalid_frame)?;
        let temporary = save
            .temporary
            .strip_prefix(".grida-save-")
            .and_then(|value| value.strip_suffix(".tmp"))
            .and_then(|value| Uuid::parse_str(value).ok())
            .filter(|id| format!(".grida-save-{id}.tmp") == save.temporary)
            .ok_or_else(invalid_frame)?;
        if file_mtime(original)? != mtime {
            return Err(modified());
        }
        self.protected
            .check(&self.parent_path().join(&save.temporary))?;
        let stage = Staged::create_named(
            &self.parent,
            format!(".grida-save-{temporary}.tmp"),
            Mode::from_bits_truncate(0o600),
        )?;
        // Stream into the one staged file. Payload size does not size a Rust
        // allocation or inherit the separate workspace writer's text limit.
        let copied = std::io::copy(&mut (&mut *input).take(save.length), &mut &stage.file)
            .map_err(|_| save_failed())?;
        if copied != save.length || !input.fill_buf().map_err(|_| invalid_frame())?.is_empty() {
            return Err(invalid_frame());
        }
        stage.file.sync_all().map_err(|_| save_failed())?;
        let staged = stage.file.metadata().map_err(|_| save_failed())?;
        let identity = NativeIdentity::capture(&staged)?;
        let written_mtime = file_mtime(&staged)?;
        let latest = self.check(&self.identity)?;
        if !same_version(original, &latest) || file_mtime(&latest)? != mtime {
            return Err(modified());
        }
        if !stage.owns_name() {
            return Err(changed());
        }
        renameat(&self.parent, stage.name.as_str(), &self.parent, self.name())
            .map_err(|_| unverified())?;
        fsync(&self.parent).map_err(|_| unverified())?;
        let current = self.check(&identity).map_err(|_| unverified())?;
        if !same_version_after_rename(&staged, &current) {
            return Err(unverified());
        }
        send(
            output,
            &Saved {
                identity,
                mtime: written_mtime,
            },
        )
        .map_err(|_| unverified())
    }
}

fn exact_path(file: &File, path: &Path) -> Result<()> {
    let actual = getpath(file).map_err(|_| changed())?;
    if actual.to_bytes() != path.as_os_str().as_bytes() {
        return Err(changed());
    }
    Ok(())
}

fn same_version(left: &Metadata, right: &Metadata) -> bool {
    same_version_after_rename(left, right)
        && (left.ctime(), left.ctime_nsec()) == (right.ctime(), right.ctime_nsec())
}

fn same_version_after_rename(left: &Metadata, right: &Metadata) -> bool {
    (left.len(), left.mtime(), left.mtime_nsec())
        == (right.len(), right.mtime(), right.mtime_nsec())
}

fn file_mtime(metadata: &Metadata) -> Result<f64> {
    metadata
        .modified()
        .map(milliseconds)
        .map_err(|_| unavailable())
}

fn send(output: &mut impl Write, response: &impl Serialize) -> Result<()> {
    serde_json::to_writer(&mut *output, response).map_err(|_| output_failed())?;
    output
        .write_all(b"\n")
        .and_then(|()| output.flush())
        .map_err(|_| output_failed())
}

fn changed() -> Error {
    Error::new(ErrorKind::Conflict, "document_file_changed")
}

fn modified() -> Error {
    Error::new(ErrorKind::Conflict, "workspace_write_modified_since")
}

fn save_failed() -> Error {
    Error::new(ErrorKind::Unavailable, "workspace_write_failed")
}

fn unverified() -> Error {
    Error::new(ErrorKind::Uncertain, "workspace_write_unverified")
}
