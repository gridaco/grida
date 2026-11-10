//! GRIDA-SEC-004 / GRIDA-SEC-014 — descriptor-relative native read operations.

use super::*;
use crate::host::MAX_IMAGE_BYTES;
use crate::workspace::FileAccess;
use agent_kit_core::{Envelope, SchemaId};
use rustix::fs::{self as unix, AtFlags, Dir, FileType, Mode, OFlags, Stat};
use rustix::io::Errno;
use serde::Serialize;
use std::fs::File;
use std::io::{self, Read};

const MAX_LIST_ENTRIES: usize = 128;
const MAX_SEARCH_MATCHES: usize = 64;
const MAX_WALK_ENTRIES: usize = 1024;
const MAX_SEARCH_FILES: usize = 128;
const MAX_SEARCH_BYTES: usize = 2 * 1024 * 1024;
const MAX_FILE_BYTES: usize = 64 * 1024;
const MAX_SEARCH_DEPTH: usize = 8;
const SNIPPET_BYTES: usize = 240;

struct Root {
    file: File,
    path: PathBuf,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Kind {
    File,
    Directory,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    kind: Kind,
}

#[derive(Serialize)]
struct Match {
    path: PathBuf,
    line: usize,
    snippet: String,
}

impl FileTools {
    pub(super) fn execute(
        &self,
        operation: Operation,
        request: Request,
        budget: &Budget,
    ) -> Result<ToolOutcome> {
        let path = request.path.as_deref().unwrap_or_else(|| Path::new(""));
        let directory = request.directory.as_ref();
        let outcome = match operation {
            Operation::Read => {
                let mut file = self.open(directory, path, Kind::File, budget)?;
                let (bytes, limited) = read(&mut file, budget.output.min(MAX_FILE_BYTES), budget)?;
                if limited {
                    return Err(problem(ErrorKind::LimitExceeded, "file_read_limit"));
                }
                text_outcome(decode(bytes)?, false, budget.output)
            }
            Operation::View => self.view_image(directory, path, budget),
            Operation::CaptureReference => self.capture_reference(path, budget),
            Operation::List => self.list(directory, path, budget),
            Operation::Search => self.search(
                directory,
                path,
                request
                    .query
                    .as_deref()
                    .ok_or_else(|| problem(ErrorKind::InvalidInput, "file_arguments_invalid"))?,
                budget,
            ),
        }?;
        // Current authority must still permit delivery of the observed bytes.
        self.root(directory, budget)?;
        Ok(outcome)
    }

    fn view_image(
        &self,
        directory: Option<&BindingId>,
        path: &Path,
        budget: &Budget,
    ) -> Result<ToolOutcome> {
        let capture = self
            .capture_image
            .as_ref()
            .ok_or_else(|| problem(ErrorKind::Unavailable, "image_view_unavailable"))?;
        let bytes = self.read_png(directory, path, budget)?;
        let label = format!("Viewed PNG {} ({} bytes).", path.display(), bytes.len());
        let image = capture(bytes)?;
        bounded_outcome(
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![ResultContent::Text(label), ResultContent::Media(image)],
                structured: None,
                receipt: None,
                truncated: false,
            },
            budget.output,
        )
    }

    fn capture_reference(&self, path: &Path, budget: &Budget) -> Result<ToolOutcome> {
        let capture = self.capture_reference.as_ref().ok_or_else(|| {
            problem(
                ErrorKind::Unavailable,
                "workspace_image_reference_unavailable",
            )
        })?;
        let image = capture(self.read_png(None, path, budget)?)?;
        let receipt = Envelope::new(
            SchemaId::new(WORKSPACE_IMAGE_REFERENCE_SCHEMA)?,
            1,
            serde_json::to_vec(&image).map_err(|_| {
                problem(
                    ErrorKind::InvalidState,
                    "workspace_image_reference_encoding",
                )
            })?,
        )?;
        bounded_outcome(
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: vec![ResultContent::Text(
                    "Captured the workspace PNG as an image generation reference.".into(),
                )],
                structured: Some(json!({"reference_id": budget.invocation.id(), "path": path})),
                receipt: Some(receipt),
                truncated: false,
            },
            budget.output,
        )
    }

    fn read_png(
        &self,
        directory: Option<&BindingId>,
        path: &Path,
        budget: &Budget,
    ) -> Result<Vec<u8>> {
        let mut file = self.open(directory, path, Kind::File, budget)?;
        let before = unix::fstat(&file).map_err(open_error)?;
        let (bytes, limited) = read(&mut file, MAX_IMAGE_BYTES, budget)?;
        if limited {
            return Err(problem(ErrorKind::LimitExceeded, "image_size_limit"));
        }
        // Check the addressed path, not just the open descriptor, after reading.
        let current = self.open(directory, path, Kind::File, budget)?;
        let after = unix::fstat(&current).map_err(open_error)?;
        same_inode(&before, &after)?;
        if before.st_size != after.st_size
            || after.st_size != bytes.len() as i64
            || before.st_mtime != after.st_mtime
            || before.st_mtime_nsec != after.st_mtime_nsec
            || before.st_ctime != after.st_ctime
            || before.st_ctime_nsec != after.st_ctime_nsec
        {
            return Err(problem(ErrorKind::Conflict, "image_source_changed"));
        }
        budget.check()?;
        Ok(bytes)
    }

    fn root(&self, directory: Option<&BindingId>, budget: &Budget) -> Result<Root> {
        budget.check()?;
        let live = (self.current)(&budget.invocation)?;
        budget.check()?;
        let target = self.captured.select(
            directory,
            Path::new(""),
            FileAccess::Read,
            &live.grants,
            &live.protected,
        )?;
        let root = target.read_root(&live.workspace, &live.grants, &live.protected)?;
        budget.check()?;
        Ok(Root {
            file: root.try_clone().map_err(|_| unavailable())?,
            path: target.root().to_path_buf(),
        })
    }

    fn open(
        &self,
        directory: Option<&BindingId>,
        path: &Path,
        expected: Kind,
        budget: &Budget,
    ) -> Result<File> {
        validate_path(path)?;
        let root = self.root(directory, budget)?;
        budget.check()?;
        if path.as_os_str().is_empty() {
            return Ok(root.file);
        }
        open_beneath(root, path, expected, || budget.check())
    }

    fn list(
        &self,
        directory: Option<&BindingId>,
        path: &Path,
        budget: &Budget,
    ) -> Result<ToolOutcome> {
        let file = self.open(directory, path, Kind::Directory, budget)?;
        let mut entries = Vec::new();
        let mut truncated = false;
        for (index, entry) in Dir::read_from(&file).map_err(open_error)?.enumerate() {
            budget.check()?;
            if index >= MAX_WALK_ENTRIES || entries.len() >= MAX_LIST_ENTRIES {
                truncated = true;
                break;
            }
            let entry = entry.map_err(open_error)?;
            if let Some(child) = child(&file, entry.file_name().to_bytes())? {
                entries.push(child);
            }
        }
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        page(&entries, "entries", truncated, budget.output)
    }

    fn search(
        &self,
        directory: Option<&BindingId>,
        path: &Path,
        query: &str,
        budget: &Budget,
    ) -> Result<ToolOutcome> {
        let mut directories = vec![(path.to_path_buf(), 0)];
        let mut state = Search::default();
        'traverse: while let Some((path, depth)) = directories.pop() {
            if state.full() {
                state.truncated = true;
                break;
            }
            let file = self.open(directory, &path, Kind::Directory, budget);
            let Some(file) = state.open_descendant(file, depth != 0)? else {
                continue;
            };
            for entry in Dir::read_from(&file).map_err(open_error)? {
                budget.check()?;
                if state.full() {
                    state.truncated = true;
                    break 'traverse;
                }
                state.entries += 1;
                let entry = entry.map_err(open_error)?;
                let Some(child) = child(&file, entry.file_name().to_bytes())? else {
                    continue;
                };
                let path = path.join(child.name);
                if validate_path(&path).is_err() {
                    state.truncated = true;
                    continue;
                }
                match child.kind {
                    Kind::Directory if depth < MAX_SEARCH_DEPTH => {
                        directories.push((path, depth + 1))
                    }
                    Kind::Directory => state.truncated = true,
                    Kind::File => {
                        let opened = self.open(directory, &path, Kind::File, budget);
                        if let Some(mut file) = state.open_descendant(opened, true)? {
                            state.search_file(&mut file, path, query, budget)?;
                        }
                    }
                }
            }
        }
        state
            .matches
            .sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)));
        page(&state.matches, "matches", state.truncated, budget.output)
    }
}

#[derive(Default)]
struct Search {
    entries: usize,
    files: usize,
    bytes: usize,
    matches: Vec<Match>,
    truncated: bool,
}

impl Search {
    fn full(&self) -> bool {
        self.entries >= MAX_WALK_ENTRIES
            || self.files >= MAX_SEARCH_FILES
            || self.bytes >= MAX_SEARCH_BYTES
            || self.matches.len() >= MAX_SEARCH_MATCHES
    }

    fn open_descendant(
        &mut self,
        result: Result<File>,
        skip_unavailable: bool,
    ) -> Result<Option<File>> {
        match result {
            Ok(file) => Ok(Some(file)),
            Err(error)
                if skip_unavailable
                    && matches!(
                        error.code.as_str(),
                        "file_unavailable"
                            | "file_type_unsupported"
                            | "file_mount_unsupported"
                            | "file_symlink_unsupported"
                            | "file_path_changed"
                    ) =>
            {
                self.truncated = true;
                Ok(None)
            }
            Err(error) => Err(error),
        }
    }

    fn search_file(
        &mut self,
        file: &mut File,
        path: PathBuf,
        query: &str,
        budget: &Budget,
    ) -> Result<()> {
        self.files += 1;
        let remaining = MAX_SEARCH_BYTES - self.bytes;
        let maximum = MAX_FILE_BYTES.min(remaining.saturating_sub(1));
        let (bytes, limited) = read(file, maximum, budget)?;
        self.bytes += bytes.len();
        if limited {
            self.truncated = true;
            return Ok(());
        }
        let Ok(text) = decode(bytes) else {
            return Ok(());
        };
        for (index, line) in text.lines().enumerate() {
            budget.check()?;
            if let Some(found) = line.find(query) {
                if self.matches.len() >= MAX_SEARCH_MATCHES {
                    self.truncated = true;
                    break;
                }
                let start = line.floor_char_boundary(found.saturating_sub(48));
                let end = line.floor_char_boundary((start + SNIPPET_BYTES).min(line.len()));
                self.matches.push(Match {
                    path: path.clone(),
                    line: index + 1,
                    snippet: line[start..end].to_owned(),
                });
            }
        }
        Ok(())
    }
}

fn read(file: &mut File, maximum: usize, budget: &Budget) -> Result<(Vec<u8>, bool)> {
    if file.metadata().map_err(|_| unavailable())?.len() > maximum as u64 {
        return Ok((Vec::new(), true));
    }
    let mut bytes = Vec::new();
    let mut buffer = [0; 8192];
    while bytes.len() <= maximum {
        budget.check()?;
        let want = (maximum + 1 - bytes.len()).min(buffer.len());
        match file.read(&mut buffer[..want]) {
            Ok(0) => return Ok((bytes, false)),
            Ok(size) => bytes.extend_from_slice(&buffer[..size]),
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(_) => return Err(unavailable()),
        }
    }
    Ok((bytes, true))
}

fn decode(bytes: Vec<u8>) -> Result<String> {
    let invalid = || problem(ErrorKind::Unsupported, "file_utf8_text_required");
    if bytes.contains(&0) {
        return Err(invalid());
    }
    String::from_utf8(bytes).map_err(|_| invalid())
}

fn child(parent: &File, raw_name: &[u8]) -> Result<Option<Entry>> {
    let Ok(name) = std::str::from_utf8(raw_name) else {
        return Ok(None);
    };
    if name == "." || name == ".." || name.chars().any(char::is_control) {
        return Ok(None);
    }
    let stat = match unix::statat(parent, name, AtFlags::SYMLINK_NOFOLLOW) {
        Ok(stat) => stat,
        Err(Errno::NOENT) => return Ok(None),
        Err(error) => return Err(open_error(error)),
    };
    let kind = match FileType::from_raw_mode(stat.st_mode) {
        FileType::Directory => Kind::Directory,
        FileType::RegularFile if stat.st_nlink == 1 => Kind::File,
        _ => return Ok(None),
    };
    Ok(Some(Entry {
        name: name.to_owned(),
        kind,
    }))
}

fn read_flags(kind: Kind) -> OFlags {
    let mut flags = OFlags::RDONLY | OFlags::CLOEXEC | OFlags::NOFOLLOW | OFlags::NONBLOCK;
    if kind == Kind::Directory {
        flags |= OFlags::DIRECTORY;
    }
    flags
}

pub(crate) fn open_root_file(directory: &File, root: &Path, path: &Path) -> Result<File> {
    validate_path(path)?;
    if path.as_os_str().is_empty() {
        return Err(problem(
            ErrorKind::InvalidInput,
            "file_relative_path_invalid",
        ));
    }
    let root = Root {
        file: directory.try_clone().map_err(|_| unavailable())?,
        path: root.to_path_buf(),
    };
    open_beneath(root, path, Kind::File, || Ok(()))
}

pub(crate) fn open_root_directory(directory: &File, root: &Path, path: &Path) -> Result<File> {
    validate_path(path)?;
    let file = directory.try_clone().map_err(|_| unavailable())?;
    if path.as_os_str().is_empty() {
        return Ok(file);
    }
    open_beneath(
        Root {
            file,
            path: root.to_path_buf(),
        },
        path,
        Kind::Directory,
        || Ok(()),
    )
}

#[cfg(target_os = "linux")]
fn open_beneath(
    root: Root,
    path: &Path,
    expected: Kind,
    check: impl Fn() -> Result<()>,
) -> Result<File> {
    use rustix::fs::ResolveFlags;

    let Root { file, path: _path } = root;
    let root_stat = unix::fstat(&file).map_err(open_error)?;
    let open = |flags| {
        check()?;
        unix::openat2(
            &file,
            path,
            flags,
            Mode::empty(),
            ResolveFlags::BENEATH | ResolveFlags::NO_SYMLINKS | ResolveFlags::NO_XDEV,
        )
        .map_err(|error| match error {
            Errno::NOSYS => problem(ErrorKind::Unsupported, "file_safe_open_unavailable"),
            Errno::XDEV => problem(ErrorKind::Unavailable, "file_mount_unsupported"),
            _ => open_error(error),
        })
    };
    // Inspect without opening the device or FIFO. The second lookup resolves
    // the entire path beneath the pinned root again and must match this inode.
    let inspected = open(OFlags::PATH | OFlags::CLOEXEC)?;
    let before = unix::fstat(&inspected).map_err(open_error)?;
    check_kind(&before, expected, &root_stat)?;
    let readable = open(read_flags(expected))?;
    let after = unix::fstat(&readable).map_err(open_error)?;
    check_kind(&after, expected, &root_stat)?;
    same_inode(&before, &after)?;
    Ok(readable.into())
}

#[cfg(target_os = "macos")]
fn open_beneath(
    root: Root,
    path: &Path,
    expected: Kind,
    check: impl Fn() -> Result<()>,
) -> Result<File> {
    let Root {
        mut file,
        path: root_path,
    } = root;
    let root_stat = unix::fstat(&file).map_err(open_error)?;
    let mut components = path.components().peekable();
    while let Some(Component::Normal(name)) = components.next() {
        let kind = if components.peek().is_some() {
            Kind::Directory
        } else {
            expected
        };
        check()?;
        let prior = unix::statat(&file, name, AtFlags::SYMLINK_NOFOLLOW).map_err(open_error)?;
        check_kind(&prior, kind, &root_stat)?;
        check()?;
        let next: File = unix::openat(&file, name, read_flags(kind), Mode::empty())
            .map_err(open_error)?
            .into();
        let after = unix::fstat(&next).map_err(open_error)?;
        check_kind(&after, kind, &root_stat)?;
        same_inode(&prior, &after)?;
        file = next;
    }
    // A directory descriptor can survive a concurrent move. Verify the
    // opened object's kernel path before consuming its bytes or names.
    verify_open_path(&file, &root_path)?;
    Ok(file)
}

pub(crate) fn verify_open_path(file: &File, root: &Path) -> Result<()> {
    if !observed_path(file)?.starts_with(root) {
        return Err(problem(ErrorKind::Conflict, "file_path_changed"));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn observed_path(file: &File) -> Result<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    let path = unix::getpath(file).map_err(open_error)?;
    Ok(PathBuf::from(std::ffi::OsStr::from_bytes(path.to_bytes())))
}

#[cfg(target_os = "linux")]
fn observed_path(file: &File) -> Result<PathBuf> {
    use std::os::fd::AsRawFd;
    std::fs::read_link(format!("/proc/self/fd/{}", file.as_raw_fd())).map_err(|_| unavailable())
}

fn same_inode(before: &Stat, after: &Stat) -> Result<()> {
    if before.st_dev == after.st_dev && before.st_ino == after.st_ino {
        Ok(())
    } else {
        Err(problem(ErrorKind::Conflict, "file_path_changed"))
    }
}

fn check_kind(stat: &Stat, expected: Kind, root: &Stat) -> Result<()> {
    if stat.st_dev != root.st_dev {
        return Err(problem(ErrorKind::Unavailable, "file_mount_unsupported"));
    }
    match (FileType::from_raw_mode(stat.st_mode), expected) {
        (FileType::Symlink, _) => Err(problem(ErrorKind::Unsupported, "file_symlink_unsupported")),
        (FileType::Directory, Kind::Directory) => Ok(()),
        (FileType::RegularFile, Kind::File) if stat.st_nlink == 1 => Ok(()),
        _ => Err(problem(ErrorKind::Unsupported, "file_type_unsupported")),
    }
}

fn open_error(error: Errno) -> Error {
    if error == Errno::LOOP {
        problem(ErrorKind::Unsupported, "file_symlink_unsupported")
    } else {
        unavailable()
    }
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "file_unavailable")
}

fn text_outcome(text: String, truncated: bool, output: usize) -> Result<ToolOutcome> {
    bounded_outcome(
        ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content: vec![ResultContent::Text(text)],
            structured: None,
            receipt: None,
            truncated,
        },
        output,
    )
}

fn bounded_outcome(outcome: ToolOutcome, output: usize) -> Result<ToolOutcome> {
    if serde_json::to_vec(&(&outcome.content, &outcome.structured))
        .is_ok_and(|encoded| encoded.len() <= output)
    {
        Ok(outcome)
    } else {
        Err(problem(ErrorKind::LimitExceeded, "file_output_limit"))
    }
}

fn page(
    items: &[impl Serialize],
    field: &str,
    incomplete: bool,
    output: usize,
) -> Result<ToolOutcome> {
    let mut keep = items.len();
    loop {
        let truncated = incomplete || keep < items.len();
        let body = serde_json::to_string(&json!({field: &items[..keep], "truncated": truncated}))
            .map_err(|_| problem(ErrorKind::InvalidState, "file_projection_failed"))?;
        match text_outcome(body, truncated, output) {
            Ok(outcome) => return Ok(outcome),
            Err(error) if keep == 0 => return Err(error),
            Err(_) => keep /= 2,
        }
    }
}
