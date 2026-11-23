//! GRIDA-SEC-004 — validated host defaults with revision-checked, atomic TOML
//! persistence, and the one host-state file the agent may change with approval.

use agent_kit_core::{Error, ErrorKind, Fingerprint, Result};
use grida_agent_master::configuration::{
    FieldDefinition, MODEL_AUTO_COMPACT_TOKEN_LIMIT, MODEL_CONTEXT_WINDOW, SettingChange,
    UserDefaults,
};
use serde::{Deserialize, Serialize};
use std::fs::{File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use toml_edit::{DocumentMut, Item, value};
use uuid::Uuid;

const MAX_FILE_BYTES: u64 = 64 * 1024;
const SOURCE_FILE: &str = "config.toml";
const WORKSPACE_ACTIVE_FILE: &str = "config.active-v1.json";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigurationSnapshot {
    pub identity: Fingerprint,
    pub source_revision: Option<Fingerprint>,
    pub defaults: UserDefaults,
}

#[derive(Clone, Debug, Serialize)]
pub struct ConfigurationInspection {
    pub fields: [FieldDefinition; 2],
    pub file_revision: Option<Fingerprint>,
    pub file_diagnostic: Option<Error>,
    pub active: ConfigurationSnapshot,
    pub exact_input_counting: bool,
}

/// The settings file content and whether it is in effect. Only the native
/// file tools, which exist on macOS and Linux, read the settings file.
#[cfg_attr(not(any(target_os = "macos", target_os = "linux")), allow(dead_code))]
pub(crate) struct SettingsRead {
    pub bytes: Option<Vec<u8>>,
    pub diagnostic: Option<Error>,
    pub applied: bool,
}

#[cfg_attr(not(any(target_os = "macos", target_os = "linux")), allow(dead_code))]
pub(crate) enum SettingsWrite {
    Applied,
    Invalid(Error),
}

pub struct Configuration {
    directory: PathBuf,
    directory_metadata: Metadata,
    writer: File,
    active: Mutex<ConfigurationSnapshot>,
    workspace_epoch: Option<Uuid>,
}

/// Private supervising launch selection for workers serving one workspace.
pub struct WorkspaceConfiguration {
    directory: PathBuf,
    epoch: Uuid,
}

impl WorkspaceConfiguration {
    pub fn new(directory: PathBuf, epoch: Uuid) -> Self {
        Self { directory, epoch }
    }

    pub(crate) fn open(&self, state: &Path) -> Result<Configuration> {
        let directory = self
            .directory
            .canonicalize()
            .map_err(|_| unavailable("config_directory_unavailable"))?;
        let canonical_state = state
            .canonicalize()
            .map_err(|_| unavailable("config_directory_unavailable"))?;
        let profiles = directory.join("profiles");
        let profile = state.file_name().and_then(|name| name.to_str());
        if self.directory != directory
            || canonical_state != state
            || self.epoch.is_nil()
            || (state != directory
                && (state.parent() != Some(profiles.as_path())
                    || !profile.is_some_and(|id| {
                        id.len() == 64
                            && id
                                .bytes()
                                .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
                    })))
        {
            return Err(invalid("workspace_configuration_scope_invalid"));
        }
        Configuration::open_in(&directory, Some(self.epoch))
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct WorkspaceActive {
    epoch: [u8; 16],
    snapshot: ConfigurationSnapshot,
}

struct Source {
    revision: Option<Fingerprint>,
    document: DocumentMut,
    defaults: UserDefaults,
}

impl Configuration {
    /// The host supplies its private state directory. Invalid startup content
    /// prevents activation instead of silently selecting automatic defaults.
    pub fn open(directory: &Path) -> Result<Self> {
        Self::open_in(directory, None)
    }

    fn open_in(directory: &Path, workspace_epoch: Option<Uuid>) -> Result<Self> {
        let directory_metadata = validate_directory(directory)?;
        let directory = directory
            .canonicalize()
            .map_err(|_| unavailable("config_directory_unavailable"))?;
        let writer = open_writer(&directory.join("config.lock"))?;
        let active = if let Some(epoch) = workspace_epoch {
            let _guard = WriterGuard::acquire(&writer)?;
            match read_workspace_active(&directory)? {
                Some(active) if &active.epoch == epoch.as_bytes() => active.snapshot,
                _ => {
                    let source = read_source(&directory)?;
                    let active = snapshot(&source)?;
                    write_workspace_active(&directory, epoch, &active, || {
                        check_directory_identity(&directory, &directory_metadata)?;
                        check_source_revision(&directory, source.revision)
                    })?;
                    active
                }
            }
        } else {
            snapshot(&read_source(&directory)?)?
        };
        Ok(Self {
            directory,
            directory_metadata,
            writer,
            active: Mutex::new(active),
            workspace_epoch,
        })
    }

    /// Inspection reports file edits independently of the active defaults.
    pub fn inspect(&self) -> Result<ConfigurationInspection> {
        let active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.validate_directory()?;
        let _writer = self.workspace_writer()?;
        let active = self.current(&active)?;
        let bytes = read_bytes(&self.directory.join(SOURCE_FILE))?;
        let file_revision = revision(bytes.as_deref())?;
        let file_diagnostic = parse(bytes.as_deref()).err();
        Ok(ConfigurationInspection {
            fields: [MODEL_CONTEXT_WINDOW, MODEL_AUTO_COMPACT_TOKEN_LIMIT],
            file_revision,
            file_diagnostic,
            active,
            exact_input_counting: false,
        })
    }

    pub fn snapshot(&self) -> Result<ConfigurationSnapshot> {
        let active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.current(&active)
    }

    /// Activate an explicit manual edit after validating its exact revision.
    pub fn reload(&self, expected: Option<Fingerprint>) -> Result<ConfigurationSnapshot> {
        self.reload_guarded(expected, || Ok(()))
    }

    pub(crate) fn reload_guarded(
        &self,
        expected: Option<Fingerprint>,
        admission: impl Fn() -> Result<()>,
    ) -> Result<ConfigurationSnapshot> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.validate_directory()?;
        let _writer = self.workspace_writer()?;
        self.require_workspace_epoch()?;
        let source = read_source(&self.directory)?;
        check_revision(source.revision, expected)?;
        admission()?;
        *active = self.activate(&source, admission)?;
        Ok(active.clone())
    }

    /// Update one active field, clearing any retired setting on publication.
    /// The cross-process lock serializes managed writers. External edits use explicit reload.
    pub fn update(
        &self,
        expected: Option<Fingerprint>,
        change: SettingChange,
    ) -> Result<ConfigurationSnapshot> {
        self.update_guarded(expected, change, || Ok(()))
    }

    pub(crate) fn update_guarded(
        &self,
        expected: Option<Fingerprint>,
        change: SettingChange,
        admission: impl Fn() -> Result<()>,
    ) -> Result<ConfigurationSnapshot> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.validate_directory()?;
        let _writer = WriterGuard::acquire(&self.writer)?;
        self.require_workspace_epoch()?;
        let mut source = read_source(&self.directory)?;
        check_revision(source.revision, expected)?;
        let (field, requested) = match change {
            SettingChange::SetModelContextWindow { value } => (MODEL_CONTEXT_WINDOW, Some(value)),
            SettingChange::ResetModelContextWindow => (MODEL_CONTEXT_WINDOW, None),
            SettingChange::SetModelAutoCompactTokenLimit { value } => {
                (MODEL_AUTO_COMPACT_TOKEN_LIMIT, Some(value))
            }
            SettingChange::ResetModelAutoCompactTokenLimit => {
                (MODEL_AUTO_COMPACT_TOKEN_LIMIT, None)
            }
        };
        if requested.is_some_and(|value| value.get() > field.maximum) {
            return Err(invalid("config_value_out_of_range"));
        }
        // A trusted change also removes the retired context table, including for a no-op reset.
        let retired = source.document.remove("context").is_some();
        let previous = source.document.get(field.key).and_then(Item::as_integer);
        let requested = requested.map(|value| value.get() as i64);
        if previous == requested && !retired {
            admission()?;
            *active = self.activate(&source, admission)?;
            return Ok(active.clone());
        }
        if source.revision.is_none() {
            source.document["schema_version"] = value(1);
        }
        if let Some(requested) = requested {
            source.document[field.key] = value(requested);
        } else {
            source.document.remove(field.key);
        }
        let bytes = source.document.to_string().into_bytes();
        let (_, defaults) = parse(Some(&bytes))?;
        self.validate_directory()?;
        write_atomic(&self.directory, SOURCE_FILE, &bytes, || {
            admission()?;
            self.validate_directory()?;
            // Detect manual edits through staging before replacing the file.
            check_source_revision(&self.directory, expected)?;
            admission()
        })?;
        source.revision = revision(Some(&bytes))?;
        source.defaults = defaults;
        *active = self.activate(&source, admission).map_err(|error| {
            if self.workspace_epoch.is_some() {
                Error::new(ErrorKind::Uncertain, "config_activation_uncertain")
            } else {
                error
            }
        })?;
        Ok(active.clone())
    }

    /// The directory holding the settings file. Hosts keep it protected from
    /// commands and every workspace path.
    pub(crate) fn directory(&self) -> &Path {
        &self.directory
    }

    /// The settings file as the agent's file tools read it, with whether its
    /// exact content is the active defaults.
    #[cfg_attr(not(any(target_os = "macos", target_os = "linux")), allow(dead_code))]
    pub(crate) fn read_settings(&self) -> Result<SettingsRead> {
        let active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.validate_directory()?;
        let _writer = self.workspace_writer()?;
        let active = self.current(&active)?;
        let bytes = read_bytes(&self.directory.join(SOURCE_FILE))?;
        let file_revision = revision(bytes.as_deref())?;
        Ok(SettingsRead {
            diagnostic: parse(bytes.as_deref()).err(),
            applied: file_revision == active.source_revision,
            bytes,
        })
    }

    /// Replace the settings file with content derived from its current bytes.
    /// Invalid content is reported and leaves the file and the active defaults
    /// unchanged. Valid content is published atomically and becomes the active
    /// defaults for later accepted input; accepted work keeps its capture.
    #[cfg_attr(not(any(target_os = "macos", target_os = "linux")), allow(dead_code))]
    pub(crate) fn replace_settings(
        &self,
        edit: impl FnOnce(Option<&[u8]>) -> Result<Vec<u8>>,
        admission: impl Fn() -> Result<()>,
    ) -> Result<SettingsWrite> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.validate_directory()?;
        let _writer = WriterGuard::acquire(&self.writer)?;
        self.require_workspace_epoch()?;
        let current = read_bytes(&self.directory.join(SOURCE_FILE))?;
        let expected = revision(current.as_deref())?;
        // This path publishes the exact file action that was approved.
        // Structured settings updates can clean retired keys on their next write.
        let bytes = edit(current.as_deref())?;
        let defaults = match parse(Some(&bytes)) {
            Ok((_, defaults)) => defaults,
            Err(error) => return Ok(SettingsWrite::Invalid(error)),
        };
        admission()?;
        write_atomic(&self.directory, SOURCE_FILE, &bytes, || {
            admission()?;
            self.validate_directory()?;
            // A concurrent manual edit wins; the agent rereads and retries.
            check_source_revision(&self.directory, expected)
        })?;
        let source = Source {
            revision: revision(Some(&bytes))?,
            document: DocumentMut::new(),
            defaults,
        };
        *active = self.activate(&source, || Ok(())).map_err(|error| {
            if self.workspace_epoch.is_some() {
                Error::new(ErrorKind::Uncertain, "config_activation_uncertain")
            } else {
                error
            }
        })?;
        Ok(SettingsWrite::Applied)
    }

    fn workspace_writer(&self) -> Result<Option<WriterGuard<'_>>> {
        self.workspace_epoch
            .map(|_| WriterGuard::acquire(&self.writer))
            .transpose()
    }

    fn current(&self, local: &ConfigurationSnapshot) -> Result<ConfigurationSnapshot> {
        if let Some(epoch) = self.workspace_epoch {
            self.validate_directory()?;
            return self.workspace_snapshot(epoch);
        }
        Ok(local.clone())
    }

    fn require_workspace_epoch(&self) -> Result<()> {
        if let Some(epoch) = self.workspace_epoch {
            self.workspace_snapshot(epoch)?;
        }
        Ok(())
    }

    fn workspace_snapshot(&self, epoch: Uuid) -> Result<ConfigurationSnapshot> {
        read_workspace_active(&self.directory)?
            .filter(|active| &active.epoch == epoch.as_bytes())
            .map(|active| active.snapshot)
            .ok_or_else(|| unavailable("workspace_configuration_epoch_changed"))
    }

    fn activate(
        &self,
        source: &Source,
        admission: impl Fn() -> Result<()>,
    ) -> Result<ConfigurationSnapshot> {
        let active = snapshot(source)?;
        if let Some(epoch) = self.workspace_epoch {
            write_workspace_active(&self.directory, epoch, &active, || {
                self.validate_directory()?;
                check_source_revision(&self.directory, source.revision)?;
                admission()
            })?;
        }
        Ok(active)
    }

    fn validate_directory(&self) -> Result<()> {
        check_directory_identity(&self.directory, &self.directory_metadata)
    }
}

fn snapshot(source: &Source) -> Result<ConfigurationSnapshot> {
    Ok(ConfigurationSnapshot {
        identity: Fingerprint::of(&(source.revision, &source.defaults))?,
        source_revision: source.revision,
        defaults: source.defaults.clone(),
    })
}

fn read_workspace_active(directory: &Path) -> Result<Option<WorkspaceActive>> {
    read_bytes(&directory.join(WORKSPACE_ACTIVE_FILE))?
        .map(|bytes| {
            let mut active: WorkspaceActive = serde_json::from_slice(&bytes)
                .map_err(|_| invalid("workspace_configuration_receipt_invalid"))?;
            let snapshot = &mut active.snapshot;
            if active.epoch == [0; 16]
                || snapshot.identity
                    != Fingerprint::of(&(snapshot.source_revision, &snapshot.defaults))?
                || [
                    snapshot.defaults.model_context_window,
                    snapshot.defaults.model_auto_compact_token_limit,
                    snapshot.defaults.legacy_input_limit(),
                ]
                .into_iter()
                .flatten()
                .any(|limit| limit.get() > MODEL_CONTEXT_WINDOW.maximum)
            {
                return Err(invalid("workspace_configuration_receipt_invalid"));
            }
            if snapshot.defaults.discard_legacy_context() {
                snapshot.identity =
                    Fingerprint::of(&(snapshot.source_revision, &snapshot.defaults))?;
            }
            Ok(active)
        })
        .transpose()
}

fn write_workspace_active(
    directory: &Path,
    epoch: Uuid,
    active: &ConfigurationSnapshot,
    admission: impl Fn() -> Result<()>,
) -> Result<()> {
    let bytes = serde_json::to_vec(&WorkspaceActive {
        epoch: *epoch.as_bytes(),
        snapshot: active.clone(),
    })
    .map_err(|_| invalid("workspace_configuration_receipt_invalid"))?;
    write_atomic(directory, WORKSPACE_ACTIVE_FILE, &bytes, admission)
}

fn check_revision(actual: Option<Fingerprint>, expected: Option<Fingerprint>) -> Result<()> {
    if actual != expected {
        return Err(Error::new(ErrorKind::Conflict, "config_revision_changed"));
    }
    Ok(())
}

fn check_source_revision(directory: &Path, expected: Option<Fingerprint>) -> Result<()> {
    let current = read_bytes(&directory.join(SOURCE_FILE))?;
    check_revision(revision(current.as_deref())?, expected)
}

fn revision(bytes: Option<&[u8]>) -> Result<Option<Fingerprint>> {
    bytes.map(|bytes| Fingerprint::of(&bytes)).transpose()
}

fn read_source(directory: &Path) -> Result<Source> {
    let bytes = read_bytes(&directory.join(SOURCE_FILE))?;
    let (document, defaults) = parse(bytes.as_deref())?;
    Ok(Source {
        revision: revision(bytes.as_deref())?,
        document,
        defaults,
    })
}

fn parse(bytes: Option<&[u8]>) -> Result<(DocumentMut, UserDefaults)> {
    let Some(bytes) = bytes else {
        return Ok((DocumentMut::new(), UserDefaults::default()));
    };
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(Error::new(
            ErrorKind::LimitExceeded,
            "config_file_too_large",
        ));
    }
    let text = std::str::from_utf8(bytes).map_err(|_| invalid("config_encoding_invalid"))?;
    let document = text
        .parse::<DocumentMut>()
        .map_err(|_| invalid("config_toml_invalid"))?;
    if document.iter().any(|(key, _)| {
        !matches!(
            key,
            "schema_version"
                | "context"
                | "model_context_window"
                | "model_auto_compact_token_limit"
        )
    }) {
        return Err(invalid("config_unknown_field"));
    }
    if document.get("schema_version").and_then(Item::as_integer) != Some(1) {
        return Err(Error::new(
            ErrorKind::Unsupported,
            "config_schema_unsupported",
        ));
    }
    if let Some(context) = document.get("context") {
        let context = context
            .as_table_like()
            .ok_or_else(|| invalid("config_context_invalid"))?;
        if context.iter().any(|(key, _)| key != "max_input_tokens") {
            return Err(invalid("config_unknown_field"));
        }
    }
    let read_limit = |field: FieldDefinition| -> Result<Option<NonZeroU64>> {
        document
            .get(field.key)
            .map(|item| {
                item.as_integer()
                    .and_then(|n| u64::try_from(n).ok())
                    .and_then(NonZeroU64::new)
                    .filter(|value| value.get() <= field.maximum)
                    .ok_or_else(|| invalid("config_value_out_of_range"))
            })
            .transpose()
    };
    let mut defaults = UserDefaults::default();
    defaults.model_context_window = read_limit(MODEL_CONTEXT_WINDOW)?;
    defaults.model_auto_compact_token_limit = read_limit(MODEL_AUTO_COMPACT_TOKEN_LIMIT)?;
    Ok((document, defaults))
}

fn validate_directory(directory: &Path) -> Result<Metadata> {
    let metadata = std::fs::symlink_metadata(directory)
        .map_err(|_| unavailable("config_directory_unavailable"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(invalid("config_directory_invalid"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err(invalid("config_directory_not_private"));
        }
    }
    Ok(metadata)
}

fn check_directory_identity(directory: &Path, expected: &Metadata) -> Result<()> {
    let current = validate_directory(directory)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if current.dev() != expected.dev() || current.ino() != expected.ino() {
            return Err(unavailable("config_directory_changed"));
        }
    }
    #[cfg(not(unix))]
    let _ = (&current, expected);
    Ok(())
}

fn read_bytes(path: &Path) -> Result<Option<Vec<u8>>> {
    let before = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(unavailable("config_file_unavailable")),
    };
    validate_file(&before)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut file = options
        .open(path)
        .map_err(|_| unavailable("config_file_unavailable"))?;
    let opened = file
        .metadata()
        .map_err(|_| unavailable("config_file_unavailable"))?;
    validate_file(&opened)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != opened.dev() || before.ino() != opened.ino() {
            return Err(unavailable("config_file_changed"));
        }
    }
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unavailable("config_file_unavailable"))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(Error::new(
            ErrorKind::LimitExceeded,
            "config_file_too_large",
        ));
    }
    Ok(Some(bytes))
}

fn validate_file(metadata: &Metadata) -> Result<()> {
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(invalid("config_file_invalid"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() & 0o077 != 0 || metadata.nlink() != 1 {
            return Err(invalid("config_file_not_private"));
        }
    }
    Ok(())
}

fn open_writer(path: &Path) -> Result<File> {
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        validate_file(&metadata)?;
    }
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .map_err(|_| unavailable("config_lock_unavailable"))?;
    validate_file(
        &file
            .metadata()
            .map_err(|_| unavailable("config_lock_unavailable"))?,
    )?;
    Ok(file)
}

struct WriterGuard<'a>(&'a File);

impl<'a> WriterGuard<'a> {
    fn acquire(file: &'a File) -> Result<Self> {
        file.try_lock()
            .map_err(|_| unavailable("config_writer_busy"))?;
        Ok(Self(file))
    }
}

impl Drop for WriterGuard<'_> {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}

fn write_atomic(
    directory: &Path,
    filename: &str,
    bytes: &[u8],
    admission: impl Fn() -> Result<()>,
) -> Result<()> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(Error::new(
            ErrorKind::LimitExceeded,
            "config_file_too_large",
        ));
    }
    let mut file = tempfile::Builder::new()
        .prefix(".config-")
        .tempfile_in(directory)
        .map_err(|_| unavailable("config_write_failed"))?;
    file.write_all(bytes)
        .map_err(|_| unavailable("config_write_failed"))?;
    file.as_file()
        .sync_all()
        .map_err(|_| unavailable("config_write_failed"))?;
    admission()?;
    file.persist(directory.join(filename))
        .map_err(|_| unavailable("config_write_failed"))?;
    #[cfg(unix)]
    File::open(directory)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| Error::new(ErrorKind::Uncertain, "config_sync_uncertain"))?;
    Ok(())
}

fn invalid(code: &str) -> Error {
    Error::new(ErrorKind::InvalidInput, code)
}

fn unavailable(code: &str) -> Error {
    Error::new(ErrorKind::Unavailable, code)
}

#[cfg(unix)]
#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::{PermissionsExt, symlink};

    fn private_workspace() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        std::fs::set_permissions(root.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        root
    }

    #[test]
    fn an_interrupted_workspace_update_keeps_the_previous_active_snapshot() {
        let root = private_workspace();
        let directory = root.path().canonicalize().unwrap();
        let epoch = Uuid::new_v4();
        let first = Configuration::open_in(&directory, Some(epoch)).unwrap();
        let second = Configuration::open_in(&directory, Some(epoch)).unwrap();
        let previous = first.snapshot().unwrap();

        let error = first
            .update_guarded(
                None,
                SettingChange::SetModelContextWindow {
                    value: NonZeroU64::new(8000).unwrap(),
                },
                || {
                    if directory.join(SOURCE_FILE).exists() {
                        return Err(Error::new(ErrorKind::Unavailable, "config_cancelled"));
                    }
                    Ok(())
                },
            )
            .unwrap_err();
        assert_eq!(error.kind, ErrorKind::Uncertain);
        assert_eq!(error.code, "config_activation_uncertain");

        let pending = second.inspect().unwrap();
        assert!(pending.file_revision.is_some());
        assert_eq!(pending.active, previous);
        assert_eq!(first.snapshot().unwrap(), previous);
        let reloaded = second.reload(pending.file_revision).unwrap();
        assert_eq!(reloaded.defaults.model_context_window.unwrap().get(), 8000);
        assert_eq!(first.snapshot().unwrap(), reloaded);
    }

    #[test]
    fn a_new_workspace_epoch_activates_pending_manual_settings_once() {
        let root = private_workspace();
        let directory = root.path().canonicalize().unwrap();
        let epoch = Uuid::new_v4();
        let first = Configuration::open_in(&directory, Some(epoch)).unwrap();
        let source = b"schema_version = 1\nmodel_context_window = 9000\n";
        write_atomic(&directory, SOURCE_FILE, source, || Ok(())).unwrap();
        let second = Configuration::open_in(&directory, Some(epoch)).unwrap();
        assert_eq!(second.snapshot().unwrap(), first.snapshot().unwrap());
        assert!(
            second
                .snapshot()
                .unwrap()
                .defaults
                .model_context_window
                .is_none()
        );

        let next = Configuration::open_in(&directory, Some(Uuid::new_v4())).unwrap();
        assert_eq!(
            next.snapshot()
                .unwrap()
                .defaults
                .model_context_window
                .unwrap()
                .get(),
            9000
        );
        let error = first.snapshot().unwrap_err();
        assert_eq!(error.code, "workspace_configuration_epoch_changed");
    }

    #[test]
    fn legacy_receipts_keep_accepted_policy_but_never_reactivate_it_for_new_inputs() {
        let root = private_workspace();
        let directory = root.path().canonicalize().unwrap();
        let epoch = Uuid::new_v4();
        let source = b"schema_version = 1\n[context]\nmax_input_tokens = 32\n";
        write_atomic(&directory, SOURCE_FILE, source, || Ok(())).unwrap();
        let source_revision = revision(Some(source)).unwrap();
        let empty_legacy = serde_json::json!({"context": {"max_input_tokens": null}});
        let empty: UserDefaults = serde_json::from_value(empty_legacy.clone()).unwrap();
        assert_eq!(serde_json::to_value(&empty).unwrap(), empty_legacy);
        assert!(empty.legacy_input_limit().is_none());
        let legacy = serde_json::json!({"context":{"max_input_tokens":32}});
        let identity = Fingerprint::of(&(source_revision, &legacy)).unwrap();
        let accepted = serde_json::json!({"identity":identity,"source_revision":source_revision,"defaults":legacy});
        let old: ConfigurationSnapshot = serde_json::from_value(accepted.clone()).unwrap();
        assert_eq!(old.defaults.legacy_input_limit(), NonZeroU64::new(32));
        assert_eq!(serde_json::to_value(&old).unwrap(), accepted);
        let mut receipt = serde_json::json!({"epoch":epoch.as_bytes(),"snapshot":accepted});
        let save = |value: &serde_json::Value| {
            write_atomic(
                &directory,
                WORKSPACE_ACTIVE_FILE,
                &serde_json::to_vec(value).unwrap(),
                || Ok(()),
            )
            .unwrap()
        };
        save(&receipt);
        let config = Configuration::open_in(&directory, Some(epoch)).unwrap();
        let current = config.snapshot().unwrap();
        assert_eq!(current.defaults, UserDefaults::default());
        assert_ne!(current.identity, identity);
        assert_eq!(current.source_revision, source_revision);
        assert_eq!(std::fs::read(directory.join(SOURCE_FILE)).unwrap(), source);

        receipt["snapshot"]["defaults"]["context"]["max_input_tokens"] = 12.into();
        save(&receipt);
        assert_eq!(
            config.snapshot().unwrap_err().code,
            "workspace_configuration_receipt_invalid"
        );
    }

    #[test]
    fn a_workspace_config_refuses_an_unrelated_or_aliased_state_directory() {
        let root = private_workspace();
        let other = private_workspace();
        let directory = root.path().canonicalize().unwrap();
        let alias = other.path().canonicalize().unwrap().join("alias");
        symlink(&directory, &alias).unwrap();
        let workspace = WorkspaceConfiguration::new(directory.clone(), Uuid::new_v4());
        for refused in [other.path().canonicalize().unwrap(), alias] {
            let error = workspace.open(&refused).err().unwrap();
            assert_eq!(error.code, "workspace_configuration_scope_invalid");
        }
        assert!(!directory.join(WORKSPACE_ACTIVE_FILE).exists());
    }

    #[test]
    fn an_invalid_settings_file_is_reported_on_load_and_never_applied() {
        let root = private_workspace();
        let directory = root.path().canonicalize().unwrap();
        let configuration = Configuration::open(&directory).unwrap();
        let source = b"schema_version = 1\nmodel_context_window = 0\n";
        write_atomic(&directory, SOURCE_FILE, source, || Ok(())).unwrap();
        let error = Configuration::open(&directory).err().unwrap();
        assert_eq!(error.code, "config_value_out_of_range");
        let read = configuration.read_settings().unwrap();
        assert_eq!(read.bytes.as_deref(), Some(&source[..]));
        assert_eq!(
            read.diagnostic.map(|error| error.code),
            Some("config_value_out_of_range".into())
        );
        assert!(!read.applied);
        assert!(
            configuration
                .snapshot()
                .unwrap()
                .defaults
                .model_context_window
                .is_none()
        );
    }

    #[test]
    fn manual_changes_during_staging_reject_the_managed_replacement() {
        let directory = private_workspace();
        let configuration = Configuration::open(directory.path()).unwrap();
        let before = configuration
            .update(
                None,
                SettingChange::SetModelContextWindow {
                    value: NonZeroU64::new(64).unwrap(),
                },
            )
            .unwrap();
        let result = configuration.update_guarded(
            before.source_revision,
            SettingChange::SetModelContextWindow {
                value: NonZeroU64::new(128).unwrap(),
            },
            || {
                std::fs::write(
                    directory.path().join("config.toml"),
                    "schema_version = 1\nmodel_context_window = 256\n",
                )
                .unwrap();
                Ok(())
            },
        );
        assert_eq!(result.unwrap_err().code, "config_revision_changed");
        let inspection = configuration.inspect().unwrap();
        assert_eq!(inspection.active, before);
        assert_ne!(inspection.file_revision, before.source_revision);
        let reloaded = configuration.reload(inspection.file_revision).unwrap();
        assert_eq!(reloaded.defaults.model_context_window.unwrap().get(), 256);
    }

    #[test]
    fn cancelled_publication_preserves_the_active_file_and_cleans_staging() {
        let directory = private_workspace();
        let configuration = Configuration::open(directory.path()).unwrap();
        let before = configuration.snapshot().unwrap();
        let checks = std::sync::atomic::AtomicUsize::new(0);
        let result = configuration.update_guarded(
            None,
            SettingChange::SetModelContextWindow {
                value: NonZeroU64::new(64).unwrap(),
            },
            || {
                if checks.fetch_add(1, std::sync::atomic::Ordering::Relaxed) == 0 {
                    return Ok(());
                }
                Err(Error::new(
                    ErrorKind::Unavailable,
                    "configuration_cancelled",
                ))
            },
        );
        assert_eq!(result.unwrap_err().code, "configuration_cancelled");
        assert_eq!(checks.load(std::sync::atomic::Ordering::Relaxed), 2);
        assert_eq!(configuration.snapshot().unwrap(), before);
        assert!(!directory.path().join("config.toml").exists());
        assert!(!std::fs::read_dir(directory.path()).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".config-")
        }));
    }
}
