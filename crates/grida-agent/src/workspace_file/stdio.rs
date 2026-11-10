//! GRIDA-SEC-004 / GRIDA-SEC-014 — one registered-root file operation on private pipes.

use super::*;
use crate::file_tools::FileAuthority;
use crate::workspace::{DirectoryGrant, DirectorySpec, ProtectedRoots};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

const MAX_FRAME: usize = 32 * 1024;

#[derive(Deserialize)]
#[serde(untagged)]
enum Request {
    #[cfg(target_os = "macos")]
    Document(super::document::Request),
    Workspace(OpenRequest),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OpenRequest {
    workspace_id: BindingId,
    root: PathBuf,
    identity: NativeIdentity,
    protected: Vec<PathBuf>,
    path: PathBuf,
    #[serde(default)]
    include_modified: bool,
    #[serde(default)]
    list_directory: bool,
    write: Option<SaveRequest>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveRequest {
    length: usize,
    expected_mtime: Option<String>,
}

#[derive(Serialize)]
struct Saved {
    mtime: f64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NativeIdentity {
    device: String,
    inode: String,
    birth_time_ns: String,
}

impl NativeIdentity {
    #[cfg(target_os = "macos")]
    pub(super) fn capture(metadata: &std::fs::Metadata) -> Result<Self> {
        Ok(Self {
            device: metadata.dev().to_string(),
            inode: metadata.ino().to_string(),
            birth_time_ns: birth_time_ns(metadata).ok_or_else(unavailable)?,
        })
    }

    pub(super) fn matches(&self, metadata: &std::fs::Metadata) -> bool {
        self.device == metadata.dev().to_string()
            && self.inode == metadata.ino().to_string()
            && birth_time_ns(metadata).is_some_and(|birth| self.birth_time_ns == birth)
    }
}

fn birth_time_ns(metadata: &std::fs::Metadata) -> Option<String> {
    metadata.created().ok().and_then(|created| {
        created
            .duration_since(UNIX_EPOCH)
            .ok()
            .map(|elapsed| elapsed.as_nanos().to_string())
    })
}

#[derive(Serialize)]
struct Opened {
    size: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    mtime: Option<f64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Span {
    pub(super) offset: String,
    pub(super) length: String,
}

/// Serve one file operation on the trusted owner's inherited pipes. The caller owns
/// registration, its current grant, process containment, and cancellation.
pub fn serve_stdio() -> Result<()> {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    let request = match frame::<Request>(&mut input)?.ok_or_else(invalid_frame)? {
        #[cfg(target_os = "macos")]
        Request::Document(request) => {
            return super::document::serve(&mut input, &mut output, request);
        }
        Request::Workspace(request) => request,
    };
    if (request.list_directory && request.include_modified)
        || (request.write.is_some() && (request.list_directory || request.include_modified))
    {
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
        grants: [DirectoryGrant::bind(
            &snapshot,
            &directory,
            true,
            request.write.is_some(),
        )?]
        .into(),
        workspace: snapshot.clone(),
        protected,
    };
    if let Some(write) = request.write {
        if write.length > super::write::MAX_WRITE_BYTES {
            return Err(Error::new(
                ErrorKind::LimitExceeded,
                "workspace_write_limit",
            ));
        }
        // Parse the exact decimal representation of the client number.
        // The JSON decoder's default float path can round by one ULP.
        let expected_mtime = write
            .expected_mtime
            .as_deref()
            .map(|value| {
                value
                    .parse::<f64>()
                    .ok()
                    .filter(|mtime| mtime.is_finite())
                    .ok_or_else(invalid_frame)
            })
            .transpose()?;
        let mut content = vec![0; write.length];
        input
            .read_exact(&mut content)
            .map_err(|_| invalid_frame())?;
        if !input.fill_buf().map_err(|_| invalid_frame())?.is_empty() {
            return Err(invalid_frame());
        }
        std::str::from_utf8(&content)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "workspace_write_utf8"))?;
        let mtime = super::write::save(
            &authority,
            &directory,
            &request.path,
            &content,
            expected_mtime,
        )?;
        return serde_json::to_writer(&mut output, &Saved { mtime })
            .map_err(|_| output_failed())
            .and_then(|()| {
                output
                    .write_all(b"\n")
                    .and_then(|()| output.flush())
                    .map_err(|_| output_failed())
            });
    }
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

pub(super) fn milliseconds(time: SystemTime) -> f64 {
    let nanoseconds = match time.duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_nanos() as i128,
        Err(before_epoch) => -(before_epoch.duration().as_nanos() as i128),
    };
    let seconds = nanoseconds.div_euclid(1_000_000_000);
    let nanos = nanoseconds.rem_euclid(1_000_000_000);
    node_mtime_ms(seconds, nanos)
}

pub(super) fn frame<T: for<'de> Deserialize<'de>>(input: &mut impl BufRead) -> Result<Option<T>> {
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

pub(super) fn invalid_frame() -> Error {
    Error::new(ErrorKind::InvalidInput, "workspace_file_frame_invalid")
}

pub(super) fn output_failed() -> Error {
    Error::new(ErrorKind::Unavailable, "workspace_file_output_unavailable")
}
