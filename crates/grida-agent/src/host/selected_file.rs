//! GRIDA-SEC-004 — trusted headless intake reads one pinned regular file.

use super::problem;
use agent_kit_core::{ErrorKind, Result};
use std::path::Path;

pub(super) fn read_selected(
    path: &Path,
    maximum: usize,
    unavailable_code: &'static str,
    changed_code: &'static str,
    size_code: &'static str,
) -> Result<Vec<u8>> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use rustix::fs::{Mode, OFlags, open};
        use std::fs::File;
        use std::io::Read;
        use std::os::unix::fs::MetadataExt;

        let unavailable = || problem(ErrorKind::Unavailable, unavailable_code);
        let opened = open(
            path,
            OFlags::RDONLY | OFlags::CLOEXEC | OFlags::NOFOLLOW | OFlags::NONBLOCK,
            Mode::empty(),
        )
        .map_err(|_| unavailable())?;
        let mut file = File::from(opened);
        let before = file.metadata().map_err(|_| unavailable())?;
        if !before.is_file() || before.nlink() != 1 {
            return Err(unavailable());
        }
        if before.len() > maximum as u64 {
            return Err(problem(ErrorKind::LimitExceeded, size_code));
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take(maximum as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| unavailable())?;
        let after = file.metadata().map_err(|_| unavailable())?;
        if after.len() != bytes.len() as u64
            || before.len() != after.len()
            || before.mtime() != after.mtime()
            || before.mtime_nsec() != after.mtime_nsec()
            || before.ctime() != after.ctime()
            || before.ctime_nsec() != after.ctime_nsec()
            || after.nlink() != 1
        {
            return Err(problem(ErrorKind::Conflict, changed_code));
        }
        Ok(bytes)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (path, maximum, unavailable_code, changed_code, size_code);
        Err(problem(
            ErrorKind::Unsupported,
            "attachment_storage_unsupported",
        ))
    }
}
