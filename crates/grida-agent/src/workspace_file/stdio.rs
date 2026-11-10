//! GRIDA-SEC-004 / GRIDA-SEC-014 — one registered-root read on private pipes.

use super::*;
use crate::file_tools::FileAuthority;
use crate::workspace::{DirectoryGrant, DirectorySpec, ProtectedRoots};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

const MAX_FRAME: usize = 32 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OpenRequest {
    workspace_id: BindingId,
    root: PathBuf,
    identity: RootIdentity,
    protected: Vec<PathBuf>,
    path: PathBuf,
    #[serde(default)]
    include_modified: bool,
    #[serde(default)]
    list_directory: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RootIdentity {
    device: String,
    inode: String,
    birth_time_ns: String,
}

impl RootIdentity {
    fn matches(&self, metadata: &std::fs::Metadata) -> bool {
        self.device == metadata.dev().to_string()
            && self.inode == metadata.ino().to_string()
            && metadata
                .created()
                .ok()
                .and_then(|created| created.duration_since(UNIX_EPOCH).ok())
                .is_some_and(|created| self.birth_time_ns == created.as_nanos().to_string())
    }
}

#[derive(Serialize)]
struct Opened {
    size: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    mtime: Option<f64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Span {
    offset: String,
    length: String,
}

/// Serve one read on the trusted owner's inherited pipes. The caller owns
/// registration, its current grant, process containment, and cancellation.
pub fn serve_stdio() -> Result<()> {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    let request = frame::<OpenRequest>(&mut input)?.ok_or_else(invalid_frame)?;
    if request.list_directory && request.include_modified {
        return Err(invalid_frame());
    }
    let directory = BindingId::new("registered-workspace")?;
    let protected = Arc::new(ProtectedRoots::new(request.protected)?);
    let snapshot = Arc::new(WorkspaceSnapshot::capture(
        request.workspace_id,
        1,
        vec![DirectorySpec {
            id: directory.clone(),
            name: "Registered workspace".into(),
            path: request.root.clone(),
            generation: BindingId::new("private-file-read")?,
        }],
        Some(directory.clone()),
        &protected,
    )?);
    let bound = snapshot
        .directories()
        .next()
        .expect("one registered directory");
    let metadata = bound
        .pinned_directory()
        .metadata()
        .map_err(|_| unavailable())?;
    if bound.root() != request.root || !request.identity.matches(&metadata) {
        return Err(Error::new(
            ErrorKind::Conflict,
            "workspace_directory_changed",
        ));
    }
    let authority = FileAuthority {
        grants: [DirectoryGrant::bind(&snapshot, &directory, true, false)?].into(),
        workspace: snapshot.clone(),
        protected,
    };
    if request.list_directory {
        let listing = super::directory::list(&authority, &directory, &request.path)?;
        return output
            .write_all(&listing)
            .and_then(|()| output.write_all(b"\n"))
            .and_then(|()| output.flush())
            .map_err(|_| output_failed());
    }
    let opened = OpenedWorkspaceFile::open(
        &snapshot,
        &directory,
        &request.path,
        Arc::new(move || Ok(authority.clone())),
    )?;
    serde_json::to_writer(
        &mut output,
        &Opened {
            size: opened.size().to_string(),
            mtime: request
                .include_modified
                .then(|| milliseconds(opened.modified())),
        },
    )
    .map_err(|_| output_failed())?;
    output
        .write_all(b"\n")
        .and_then(|()| output.flush())
        .map_err(|_| output_failed())?;
    let Some(span) = frame::<Span>(&mut input)? else {
        // A caller closing the request pipe after observing size owns no range.
        return Ok(());
    };
    let offset = span.offset.parse().map_err(|_| invalid_frame())?;
    let length = span.length.parse().map_err(|_| invalid_frame())?;
    let range = opened.range(offset, length)?;
    io::copy(
        &mut BufReader::with_capacity(CHUNK_BYTES, range),
        &mut output,
    )
    .and_then(|_| output.flush())
    .map_err(|_| Error::new(ErrorKind::Unavailable, "workspace_file_stream_failed"))?;
    Ok(())
}

fn milliseconds(time: SystemTime) -> f64 {
    let nanoseconds = match time.duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_nanos() as i128,
        Err(before_epoch) => -(before_epoch.duration().as_nanos() as i128),
    };
    let seconds = nanoseconds.div_euclid(1_000_000_000);
    let nanos = nanoseconds.rem_euclid(1_000_000_000);
    // Match Node's stat.mtimeMs, including the fractional part used by writes.
    seconds as f64 * 1_000.0 + nanos as f64 / 1_000_000.0
}

fn frame<T: for<'de> Deserialize<'de>>(input: &mut impl BufRead) -> Result<Option<T>> {
    let mut line = Vec::new();
    let length = input
        .take((MAX_FRAME + 1) as u64)
        .read_until(b'\n', &mut line)
        .map_err(|_| invalid_frame())?;
    if length == 0 {
        return Ok(None);
    }
    if length > MAX_FRAME || line.last() != Some(&b'\n') {
        return Err(invalid_frame());
    }
    serde_json::from_slice(&line)
        .map(Some)
        .map_err(|_| invalid_frame())
}

fn invalid_frame() -> Error {
    Error::new(ErrorKind::InvalidInput, "workspace_file_frame_invalid")
}

fn output_failed() -> Error {
    Error::new(ErrorKind::Unavailable, "workspace_file_output_unavailable")
}
