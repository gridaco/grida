//! GRIDA-SEC-004 / GRIDA-SEC-014 — ranged reads from one authorized native directory.

mod stdio;
pub use stdio::serve_stdio;

use crate::file_tools::{CurrentFileAuthority, open_root_file, validate_path, verify_open_path};
use crate::workspace::{FileAccess, FileTarget, WorkspaceSnapshot};
use agent_kit_core::{BindingId, Error, ErrorKind, Result};
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::sync::Arc;
use std::time::SystemTime;

const CHUNK_BYTES: usize = 64 * 1024;

/// Metadata and a byte reader from the same descriptor.
pub struct OpenedWorkspaceFile {
    file: File,
    target: FileTarget,
    current: Arc<CurrentFileAuthority>,
    size: u64,
    modified: SystemTime,
}

impl OpenedWorkspaceFile {
    /// Read through one named directory grant. The trusted host supplies the
    /// captured selection and current authority, including its protected roots.
    /// In-root symbolic links resolve before the descriptor-relative open.
    pub fn open(
        captured: &WorkspaceSnapshot,
        directory: &BindingId,
        relative: &Path,
        current: Arc<CurrentFileAuthority>,
    ) -> Result<Self> {
        validate_path(relative)?;
        let live = current()?;
        let scope = captured.select(
            Some(directory),
            Path::new(""),
            FileAccess::Read,
            &live.grants,
            &live.protected,
        )?;
        let pinned = scope.read_root(&live.workspace, &live.grants, &live.protected)?;
        let target = captured.select(
            Some(directory),
            relative,
            FileAccess::Read,
            &live.grants,
            &live.protected,
        )?;
        let path = target
            .path()
            .strip_prefix(scope.root())
            .map_err(|_| Error::new(ErrorKind::Unavailable, "workspace_path_outside_root"))?;
        let file = open_root_file(pinned, scope.root(), path)?;
        let metadata = file.metadata().map_err(|_| unavailable())?;
        let modified = metadata.modified().map_err(|_| unavailable())?;
        revalidate(&target, &current)?;
        Ok(Self {
            file,
            target,
            current,
            size: metadata.len(),
            modified,
        })
    }

    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn modified(&self) -> SystemTime {
        self.modified
    }

    /// Open an exact byte span. HTTP range selection belongs to the caller.
    /// A zero-length span is valid up to and including the captured size.
    pub fn range(mut self, offset: u64, length: u64) -> Result<WorkspaceFileRange> {
        if offset.checked_add(length).is_none_or(|end| end > self.size) {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "workspace_file_range_invalid",
            ));
        }
        revalidate(&self.target, &self.current)?;
        self.file
            .seek(SeekFrom::Start(offset))
            .map_err(|_| unavailable())?;
        Ok(WorkspaceFileRange {
            opened: self,
            remaining: length,
        })
    }
}

/// Bounded-chunk stream. Dropping the reader releases the file descriptor.
pub struct WorkspaceFileRange {
    opened: OpenedWorkspaceFile,
    remaining: u64,
}

impl Read for WorkspaceFileRange {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() || self.remaining == 0 {
            return Ok(0);
        }
        self.check_authority()?;
        let mut bytes = [0; CHUNK_BYTES];
        let limit = output
            .len()
            .min(self.remaining.min(CHUNK_BYTES as u64) as usize);
        let count = self.opened.file.read(&mut bytes[..limit])?;
        if count == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "workspace_file_shrunk",
            ));
        }
        // Withhold the just-read bytes when current authority changed.
        self.check_authority()?;
        output[..count].copy_from_slice(&bytes[..count]);
        self.remaining -= count as u64;
        Ok(count)
    }
}

impl WorkspaceFileRange {
    fn check_authority(&self) -> io::Result<()> {
        revalidate(&self.opened.target, &self.opened.current)
            .and_then(|()| verify_open_path(&self.opened.file, self.opened.target.root()))
            .map_err(|error| io::Error::new(io::ErrorKind::PermissionDenied, error.code))?;
        if self.opened.file.metadata()?.nlink() != 1 {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "file_type_unsupported",
            ));
        }
        Ok(())
    }
}

fn revalidate(target: &FileTarget, current: &Arc<CurrentFileAuthority>) -> Result<()> {
    let live = current()?;
    target.revalidate(&live.workspace, &live.grants, &live.protected)
}

fn unavailable() -> Error {
    Error::new(ErrorKind::Unavailable, "file_unavailable")
}
