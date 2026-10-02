// GRIDA-SEC-010 / GRIDA-SEC-014 — private publication and the shared SQLite lock.
use crate::{Error, Result};
use rusqlite::{Connection, ErrorCode, OpenFlags};
use std::collections::HashMap;
#[cfg(unix)]
use std::fs::OpenOptions;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, TryLockError, Weak};
use std::time::{Duration, Instant};

pub(crate) const LIMIT: usize = 1_048_576;
fn failed() -> Error {
    Error::new("custody_failed")
}

pub(crate) fn location(path: &Path) -> Result<()> {
    if !cfg!(any(target_os = "macos", target_os = "linux")) {
        return Err(Error::new("unsupported_platform"));
    }
    normalized_location(path)
}
pub(crate) fn normalized_location(path: &Path) -> Result<()> {
    let text = path.to_str().ok_or_else(failed)?;
    if !path.is_absolute()
        || path.parent().is_none()
        || text.chars().any(|c| c.is_control())
        || path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        || text.contains("//")
        || text.split('/').any(|part| part == "." || part == "..")
        || text.ends_with('/')
    {
        return Err(failed());
    }
    Ok(())
}

#[cfg(unix)]
fn uid() -> u32 {
    rustix::process::geteuid().as_raw()
}

#[cfg(unix)]
fn owned(meta: &fs::Metadata, directory: bool) -> Result<()> {
    use std::os::unix::fs::MetadataExt;
    if meta.uid() != uid()
        || (meta.mode() & 0o7777) != if directory { 0o700 } else { 0o600 }
        || if directory {
            !meta.is_dir()
        } else {
            !meta.is_file() || meta.nlink() != 1
        }
    {
        return Err(failed());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn acl(path: &Path) -> Result<()> {
    use std::process::{Command, Stdio};
    let mut child = Command::new("/bin/ls")
        .args(["-lde"])
        .arg(path)
        .env_clear()
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| failed())?;
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(5)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(failed());
            }
        }
    }
    let output = child.wait_with_output().map_err(|_| failed())?;
    if !output.status.success() || output.stdout.len() > 65_536 {
        return Err(failed());
    }
    let text = std::str::from_utf8(&output.stdout).map_err(|_| failed())?;
    if text.lines().any(|line| {
        let line = line.trim_start();
        line.split_once(':').is_some_and(|(index, rest)| {
            !index.is_empty()
                && index.chars().all(|c| c.is_ascii_digit())
                && rest.split_whitespace().any(|word| word == "allow")
        })
    }) {
        return Err(failed());
    }
    Ok(())
}
#[cfg(all(unix, not(target_os = "macos")))]
fn acl(_: &Path) -> Result<()> {
    Ok(())
}

#[cfg(unix)]
pub(crate) fn directory(path: &Path) -> Result<()> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt};
    location(path)?;
    let mut current = PathBuf::from("/");
    for part in path.components().filter_map(|c| {
        if let Component::Normal(p) = c {
            Some(p)
        } else {
            None
        }
    }) {
        current.push(part);
        match fs::DirBuilder::new().mode(0o700).create(&current) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(_) => return Err(failed()),
        }
        let meta = fs::symlink_metadata(&current).map_err(|_| failed())?;
        if !meta.is_dir() || fs::canonicalize(&current).map_err(|_| failed())? != current {
            return Err(failed());
        }
        if current == path {
            owned(&meta, true)?;
        } else if (meta.uid() != uid() && meta.uid() != 0)
            || (meta.mode() & 0o022 != 0 && !(meta.uid() == 0 && meta.mode() & 0o1000 != 0))
        {
            return Err(failed());
        }
        acl(&current)?;
    }
    Ok(())
}
#[cfg(not(unix))]
pub(crate) fn directory(_: &Path) -> Result<()> {
    Err(Error::new("unsupported_platform"))
}

#[derive(Clone, Copy)]
pub(crate) enum Open {
    Read,
    Create,
    Existing,
}

#[cfg(unix)]
pub(crate) fn open(path: &Path, mode: Open) -> Result<File> {
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    location(path)?;
    directory(path.parent().ok_or_else(failed)?)?;
    let mut options = OpenOptions::new();
    options
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .mode(0o600);
    if !matches!(mode, Open::Read) {
        options.write(true).create_new(true);
    }
    let file = match options.open(path) {
        Ok(file) => file,
        Err(e)
            if matches!(mode, Open::Existing) && e.kind() == std::io::ErrorKind::AlreadyExists =>
        {
            OpenOptions::new()
                .read(true)
                .write(true)
                .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
                .open(path)
                .map_err(|_| failed())?
        }
        Err(_) => return Err(failed()),
    };
    let meta = file.metadata().map_err(|_| failed())?;
    let named = fs::symlink_metadata(path).map_err(|_| failed())?;
    owned(&meta, false)?;
    owned(&named, false)?;
    if meta.ino() != named.ino() || meta.dev() != named.dev() {
        return Err(failed());
    }
    acl(path)?;
    Ok(file)
}
#[cfg(not(unix))]
pub(crate) fn open(_: &Path, _: Open) -> Result<File> {
    Err(Error::new("unsupported_platform"))
}

pub(crate) fn read(path: &Path, limit_error: &'static str) -> Result<Option<Vec<u8>>> {
    location(path)?;
    directory(path.parent().ok_or_else(failed)?)?;
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(failed()),
        _ => (),
    }
    let file = open(path, Open::Read)?;
    if file.metadata().map_err(|_| failed())?.len() > LIMIT as u64 {
        return Err(Error::new(limit_error));
    }
    let mut bytes = Vec::new();
    file.take((LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| failed())?;
    if bytes.len() > LIMIT {
        return Err(Error::new(limit_error));
    }
    Ok(Some(bytes))
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    atomic_write_after_publish(path, bytes, || Ok(()))
}
fn atomic_write_after_publish(
    path: &Path,
    bytes: &[u8],
    after_publish: impl FnOnce() -> Result<()>,
) -> Result<()> {
    if bytes.len() > LIMIT {
        return Err(failed());
    }
    directory(path.parent().ok_or_else(failed)?)?;
    match fs::symlink_metadata(path) {
        Ok(_) => {
            drop(open(path, Open::Read)?);
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(_) => return Err(failed()),
    }
    let temporary = path.with_file_name(format!(
        "{}.{}.tmp",
        path.file_name()
            .and_then(|v| v.to_str())
            .ok_or_else(failed)?,
        uuid::Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = open(&temporary, Open::Create)?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| failed())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|_| failed())?;
        after_publish()?;
        // Once renamed, never restore an old refresh token on later failure.
        File::open(path.parent().ok_or_else(failed)?)
            .and_then(|f| f.sync_all())
            .map_err(|_| failed())
    })();
    if temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub(crate) fn cleanup(path: &Path) -> Result<()> {
    let parent = path.parent().ok_or_else(failed)?;
    let prefix = format!(
        "{}.",
        path.file_name()
            .and_then(|v| v.to_str())
            .ok_or_else(failed)?
    );
    for entry in fs::read_dir(parent).map_err(|_| failed())? {
        let entry = entry.map_err(|_| failed())?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let Some(id) = name
            .strip_prefix(&prefix)
            .and_then(|v| v.strip_suffix(".tmp"))
        else {
            continue;
        };
        if uuid::Uuid::parse_str(id).is_ok_and(|uuid| {
            uuid.get_version_num() == 4
                && uuid.get_variant() == uuid::Variant::RFC4122
                && uuid.to_string() == id
        }) {
            drop(open(&entry.path(), Open::Read)?);
            fs::remove_file(entry.path()).map_err(|_| failed())?;
        }
    }
    File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|_| failed())
}

type ProcessLocks = Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>;
static LOCKS: OnceLock<ProcessLocks> = OnceLock::new();

pub(crate) fn locked<T>(path: &Path, operation: impl FnOnce() -> Result<T>) -> Result<T> {
    let deadline = Instant::now() + Duration::from_secs(30);
    let mutex = {
        let mut locks = LOCKS
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| failed())?;
        if let Some(existing) = locks.get(path).and_then(Weak::upgrade) {
            existing
        } else {
            let mutex = Arc::new(Mutex::new(()));
            locks.insert(path.to_owned(), Arc::downgrade(&mutex));
            mutex
        }
    };
    let wait = || {
        if Instant::now() >= deadline {
            return Err(Error::new("session_busy"));
        }
        std::thread::sleep(
            Duration::from_millis(25).min(deadline.saturating_duration_since(Instant::now())),
        );
        Ok(())
    };
    let _guard = loop {
        match mutex.try_lock() {
            Ok(guard) => break guard,
            Err(TryLockError::WouldBlock) => wait()?,
            Err(_) => return Err(failed()),
        }
    };
    directory(path)?;
    let filename = path.join("profile.lock.sqlite");
    let file = open(&filename, Open::Existing)?;
    if file.metadata().map_err(|_| failed())?.len() != 0 {
        return Err(failed());
    }
    drop(file);
    let journal = path.join("profile.lock.sqlite-journal");
    if let Err(error) = read(&journal, "custody_failed") {
        match fs::symlink_metadata(&journal) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err(error),
        }
    }
    for suffix in ["-wal", "-shm"] {
        match fs::symlink_metadata(path.join(format!("profile.lock.sqlite{suffix}"))) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err(failed()),
        }
    }
    let connection = Connection::open_with_flags(
        &filename,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| failed())?;
    connection
        .busy_timeout(Duration::ZERO)
        .map_err(|_| failed())?;
    loop {
        if Instant::now() >= deadline {
            return Err(Error::new("session_busy"));
        }
        match connection.execute_batch("BEGIN IMMEDIATE") {
            Ok(()) => break,
            Err(rusqlite::Error::SqliteFailure(e, _)) if e.code == ErrorCode::DatabaseBusy => {
                wait()?
            }
            Err(_) => return Err(failed()),
        }
    }
    let result = operation();
    let released = connection.execute_batch("ROLLBACK").map_err(|_| failed());
    let closed = connection.close().map_err(|_| failed());
    released?;
    closed?;
    result
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    fn temp() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let path = fs::canonicalize(tmp.path()).unwrap().join("private");
        directory(&path).unwrap();
        (tmp, path)
    }
    #[test]
    fn post_publication_failure_never_restores_spent_credential() {
        let (_tmp, path) = temp();
        let file = path.join("credentials.json");
        atomic_write(&file, b"synthetic-old").unwrap();
        assert!(atomic_write_after_publish(&file, b"synthetic-rotated", || Err(failed())).is_err());
        assert_eq!(fs::read(file).unwrap(), b"synthetic-rotated");
    }
    #[test]
    fn rejected_operation_does_not_roll_back_published_custody() {
        let (_tmp, path) = temp();
        let file = path.join("credentials.json");
        let result: Result<()> = locked(&path, || {
            atomic_write(&file, b"synthetic-rotated")?;
            Err(failed())
        });
        assert!(result.is_err());
        assert_eq!(
            read(&file, "custody_failed").unwrap().unwrap(),
            b"synthetic-rotated"
        );
        locked(&path, || Ok(())).unwrap();
    }
    #[test]
    fn symlinks_and_hardlinks_are_rejected_without_mutating_target() {
        use std::os::unix::fs::symlink;
        let (_tmp, path) = temp();
        let original = path.join("original");
        atomic_write(&original, b"synthetic-original").unwrap();
        let alias = path.join("alias");
        symlink(&original, &alias).unwrap();
        assert!(atomic_write(&alias, b"replace").is_err());
        assert!(read(&alias, "custody_failed").is_err());
        fs::remove_file(&alias).unwrap();
        fs::hard_link(&original, &alias).unwrap();
        assert!(atomic_write(&alias, b"replace").is_err());
        assert!(read(&original, "custody_failed").is_err());
        assert_eq!(fs::read(&original).unwrap(), b"synthetic-original");
    }
    #[test]
    fn owned_orphans_are_removed_without_adopting_or_unlinking_unknown_files() {
        let (_tmp, path) = temp();
        let file = path.join("credentials.json");
        let orphan = path.join(format!("credentials.json.{}.tmp", uuid::Uuid::new_v4()));
        atomic_write(&orphan, b"synthetic-orphan").unwrap();
        let unrelated = path.join("credentials.json.keep.tmp");
        atomic_write(&unrelated, b"synthetic-unrelated").unwrap();
        locked(&path, || cleanup(&file)).unwrap();
        assert!(!orphan.exists());
        assert!(unrelated.exists());
        assert!(!file.exists());
    }
}
