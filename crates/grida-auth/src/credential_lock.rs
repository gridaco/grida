//! GRIDA-SEC-014 — source-writer coordination for one-time provider migration.
use crate::{Error, Result, native};
use std::path::PathBuf;

/// A private directory's process-shared lock, with no credential or SQLite
/// handle access. Source writers acquire this before entering ProviderStore.
pub struct CredentialLock {
    directory: PathBuf,
}
impl CredentialLock {
    pub fn new(directory: PathBuf) -> Result<Self> {
        native::normalized_location(&directory).map_err(|_| Error::new("invalid_input"))?;
        Ok(Self { directory })
    }
    pub fn run<T>(&self, operation: impl FnOnce() -> Result<T>) -> Result<T> {
        if !cfg!(any(target_os = "macos", target_os = "linux")) {
            return Err(Error::new("unsupported_platform"));
        }
        let mut output = None;
        native::locked(&self.directory, || {
            output = Some(operation());
            Ok(())
        })
        .map_err(|error| match error.code() {
            "session_busy" => Error::new("busy"),
            _ => Error::new("storage_failed"),
        })?;
        output.ok_or(Error::new("storage_failed"))?
    }
}
