//! Validated host defaults with revision-checked, atomic TOML persistence.

use agent_kit_core::{Error, ErrorKind, Fingerprint, Result};
use grida_agent_master::configuration::{
    CONTEXT_MAX_INPUT_TOKENS, FieldDefinition, SettingChange, UserDefaults,
};
use serde::{Deserialize, Serialize};
use std::fs::{File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use toml_edit::{DocumentMut, Item, Table, value};

const MAX_FILE_BYTES: u64 = 64 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigurationSnapshot {
    pub identity: Fingerprint,
    pub source_revision: Option<Fingerprint>,
    pub defaults: UserDefaults,
}

#[derive(Clone, Debug, Serialize)]
pub struct ConfigurationInspection {
    pub field: FieldDefinition,
    pub file_revision: Option<Fingerprint>,
    pub file_diagnostic: Option<Error>,
    pub active: ConfigurationSnapshot,
}

pub struct Configuration {
    directory: PathBuf,
    directory_metadata: Metadata,
    writer: File,
    active: Mutex<ConfigurationSnapshot>,
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
        let directory_metadata = validate_directory(directory)?;
        let directory = directory
            .canonicalize()
            .map_err(|_| unavailable("config_directory_unavailable"))?;
        let writer = open_writer(&directory.join("config.lock"))?;
        let source = read_source(&directory)?;
        let active = snapshot(&source)?;
        Ok(Self {
            directory,
            directory_metadata,
            writer,
            active: Mutex::new(active),
        })
    }

    /// Inspection reports file edits independently of the active defaults.
    pub fn inspect(&self) -> Result<ConfigurationInspection> {
        let active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.validate_directory()?;
        let bytes = read_bytes(&self.directory.join("config.toml"))?;
        let file_revision = revision(bytes.as_deref())?;
        let file_diagnostic = parse(bytes.as_deref()).err();
        Ok(ConfigurationInspection {
            field: CONTEXT_MAX_INPUT_TOKENS,
            file_revision,
            file_diagnostic,
            active: active.clone(),
        })
    }

    pub fn snapshot(&self) -> Result<ConfigurationSnapshot> {
        self.active
            .lock()
            .map(|active| active.clone())
            .map_err(|_| unavailable("config_lock_failed"))
    }

    /// Activate an explicit manual edit after validating its exact revision.
    pub fn reload(&self, expected: Option<Fingerprint>) -> Result<ConfigurationSnapshot> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.validate_directory()?;
        let source = read_source(&self.directory)?;
        check_revision(source.revision, expected)?;
        *active = snapshot(&source)?;
        Ok(active.clone())
    }

    /// A managed change edits only the reviewed field. The cross-process lock
    /// serializes managed writers. External editors use explicit reload.
    pub fn update(
        &self,
        expected: Option<Fingerprint>,
        change: SettingChange,
    ) -> Result<ConfigurationSnapshot> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        self.validate_directory()?;
        let _writer = WriterGuard::acquire(&self.writer)?;
        let mut source = read_source(&self.directory)?;
        check_revision(source.revision, expected)?;
        let requested = match change {
            SettingChange::SetContextMaxInputTokens { value } => {
                if value.get() > CONTEXT_MAX_INPUT_TOKENS.maximum {
                    return Err(invalid("config_value_out_of_range"));
                }
                Some(value)
            }
            SettingChange::ResetContextMaxInputTokens => None,
        };
        if source.defaults.context.max_input_tokens == requested {
            *active = snapshot(&source)?;
            return Ok(active.clone());
        }
        if source.revision.is_none() {
            source.document["schema_version"] = value(1);
        }
        if let Some(requested) = requested {
            if !source.document.contains_key("context") {
                source.document["context"] = Item::Table(Table::new());
            }
            source.document["context"]["max_input_tokens"] = value(requested.get() as i64);
        } else if let Some(context) = source
            .document
            .get_mut("context")
            .and_then(Item::as_table_like_mut)
        {
            context.remove("max_input_tokens");
        }
        let bytes = source.document.to_string().into_bytes();
        let defaults = parse(Some(&bytes))?;
        self.validate_directory()?;
        // Detect manual edits that happened during validation before replacing.
        let current = read_bytes(&self.directory.join("config.toml"))?;
        check_revision(revision(current.as_deref())?, expected)?;
        write_atomic(&self.directory, &bytes)?;
        source.revision = revision(Some(&bytes))?;
        source.defaults = defaults;
        *active = snapshot(&source)?;
        Ok(active.clone())
    }

    fn validate_directory(&self) -> Result<()> {
        let current = validate_directory(&self.directory)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if current.dev() != self.directory_metadata.dev()
                || current.ino() != self.directory_metadata.ino()
            {
                return Err(unavailable("config_directory_changed"));
            }
        }
        #[cfg(not(unix))]
        let _ = (&current, &self.directory_metadata);
        Ok(())
    }
}

fn snapshot(source: &Source) -> Result<ConfigurationSnapshot> {
    Ok(ConfigurationSnapshot {
        identity: Fingerprint::of(&(source.revision, &source.defaults))?,
        source_revision: source.revision,
        defaults: source.defaults.clone(),
    })
}

fn check_revision(actual: Option<Fingerprint>, expected: Option<Fingerprint>) -> Result<()> {
    if actual != expected {
        return Err(Error::new(ErrorKind::Conflict, "config_revision_changed"));
    }
    Ok(())
}

fn revision(bytes: Option<&[u8]>) -> Result<Option<Fingerprint>> {
    bytes.map(|bytes| Fingerprint::of(&bytes)).transpose()
}

fn read_source(directory: &Path) -> Result<Source> {
    let bytes = read_bytes(&directory.join("config.toml"))?;
    let defaults = parse(bytes.as_deref())?;
    let document = match &bytes {
        Some(bytes) => std::str::from_utf8(bytes)
            .map_err(|_| invalid("config_encoding_invalid"))?
            .parse::<DocumentMut>()
            .map_err(|_| invalid("config_toml_invalid"))?,
        None => DocumentMut::new(),
    };
    Ok(Source {
        revision: revision(bytes.as_deref())?,
        document,
        defaults,
    })
}

fn parse(bytes: Option<&[u8]>) -> Result<UserDefaults> {
    let Some(bytes) = bytes else {
        return Ok(UserDefaults::default());
    };
    let text = std::str::from_utf8(bytes).map_err(|_| invalid("config_encoding_invalid"))?;
    let document = text
        .parse::<DocumentMut>()
        .map_err(|_| invalid("config_toml_invalid"))?;
    if document
        .iter()
        .any(|(key, _)| !matches!(key, "schema_version" | "context"))
    {
        return Err(invalid("config_unknown_field"));
    }
    if document.get("schema_version").and_then(Item::as_integer) != Some(1) {
        return Err(Error::new(
            ErrorKind::Unsupported,
            "config_schema_unsupported",
        ));
    }
    let mut defaults = UserDefaults::default();
    if let Some(context) = document.get("context") {
        let context = context
            .as_table_like()
            .ok_or_else(|| invalid("config_context_invalid"))?;
        if context.iter().any(|(key, _)| key != "max_input_tokens") {
            return Err(invalid("config_unknown_field"));
        }
        if let Some(limit) = context.get("max_input_tokens") {
            let limit = limit
                .as_integer()
                .filter(|value| *value > 0)
                .ok_or_else(|| invalid("config_value_out_of_range"))?;
            defaults.context.max_input_tokens = NonZeroU64::new(limit as u64);
        }
    }
    Ok(defaults)
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

fn write_atomic(directory: &Path, bytes: &[u8]) -> Result<()> {
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
    file.persist(directory.join("config.toml"))
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
