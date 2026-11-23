//! GRIDA-SEC-004 — global agent defaults and revision-checked TOML writes.

use agent_kit_core::{Error, ErrorKind, Fingerprint, Result};
use grida_agent_master::configuration::{
    FieldDefinition, MODEL_AUTO_COMPACT_TOKEN_LIMIT, MODEL_CONTEXT_WINDOW, UserDefaults,
};
use serde::{Deserialize, Serialize};
use std::fs::{File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use toml_edit::{DocumentMut, Item, Table, Value};

const MAX_FILE_BYTES: u64 = 64 * 1024;
const SOURCE_FILE: &str = "config.toml";
const PREDICTIONS: &str = "composer-predictions-enabled";
const TEMPLATE: &str = r#"# Grida agent settings shared across projects.
schema_version = 1

# Optional context window and automatic compaction threshold, in tokens.
# model_context_window = 64000
# model_auto_compact_token_limit = 48000

# Automatic web search on supported connections. Set "disabled" to turn it off.
# web_search = "automatic"

# Suggested follow-up prompts are off by default.
# [desktop]
# composer-predictions-enabled = false

# An enabled hook requires review in Settings → Hooks before it can run.
# Supported events are session_start, before_input, before_tool, after_tool,
# and before_completion.
# [[hooks]]
# id = "check-tool"
# event = "before_tool"
# tool = "exec_command"
# executable = "/usr/bin/printf"
# arguments = ["%s", '{"decision":"allow"}']
# mode = "observe"
# timeout_ms = 2000
# enabled = false
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigurationSnapshot {
    pub identity: Fingerprint,
    pub source_revision: Option<Fingerprint>,
    defaults: StoredDefaults,
}

// Recovered child inputs compare the original serialized payload byte for byte.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged, deny_unknown_fields)]
enum StoredDefaults {
    Current(UserDefaults),
    Historical {
        context: serde_json::Map<String, serde_json::Value>,
    },
}

impl ConfigurationSnapshot {
    /// An older worker captured a cap. The number itself is never used for execution.
    pub(crate) fn captured_retired_input_cap(&self) -> bool {
        matches!(&self.defaults, StoredDefaults::Historical { context }
            if context.get("max_input_tokens").is_some_and(|value| !value.is_null()))
    }

    pub fn defaults(&self) -> UserDefaults {
        match &self.defaults {
            StoredDefaults::Current(defaults) => *defaults,
            StoredDefaults::Historical { .. } => UserDefaults::default(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ConfigurationInspection {
    pub fields: [FieldDefinition; 2],
    pub path: PathBuf,
    pub file_revision: Option<Fingerprint>,
    pub file_diagnostic: Option<Error>,
    pub unknown_keys: Vec<String>,
    pub active: ConfigurationSnapshot,
}

pub struct Configuration {
    directory: PathBuf,
    active: Mutex<ConfigurationSnapshot>,
}

pub fn global_directory() -> Result<PathBuf> {
    match std::env::var_os("GRIDA_HOME").filter(|value| !value.is_empty()) {
        Some(value) if Path::new(&value).is_absolute() => Ok(value.into()),
        Some(_) => Err(invalid("config_home_must_be_absolute")),
        None => std::env::home_dir()
            .map(|home| home.join(".grida"))
            .ok_or_else(|| unavailable("config_home_unavailable")),
    }
}

impl Configuration {
    pub fn open_global() -> Result<Self> {
        Self::open(&global_directory()?)
    }

    pub fn open(directory: &Path) -> Result<Self> {
        let checked = Self::check(directory)?;
        Ok(Self {
            directory: directory.to_owned(),
            active: Mutex::new(checked.active),
        })
    }

    /// Check one source revision, using the same bytes for diagnostics and settings.
    pub fn check(directory: &Path) -> Result<ConfigurationInspection> {
        let bytes = read_source(directory)?;
        let parsed = parse(bytes.as_deref())?;
        report_unknown_keys(directory, &parsed.unknown_keys);
        let active = snapshot(bytes.as_deref(), parsed.defaults)?;
        Ok(ConfigurationInspection {
            fields: [MODEL_CONTEXT_WINDOW, MODEL_AUTO_COMPACT_TOKEN_LIMIT],
            path: directory.join(SOURCE_FILE),
            file_revision: active.source_revision,
            file_diagnostic: None,
            unknown_keys: parsed.unknown_keys,
            active,
        })
    }

    pub fn inspect(&self) -> Result<ConfigurationInspection> {
        let active = self.snapshot()?;
        let (file_revision, parsed) = match read_source(&self.directory) {
            Ok(bytes) => (revision(bytes.as_deref())?, parse(bytes.as_deref())),
            Err(error) => (None, Err(error)),
        };
        let (unknown_keys, file_diagnostic) = match parsed {
            Ok(source) => (source.unknown_keys, None),
            Err(error) => (Vec::new(), Some(error)),
        };
        Ok(ConfigurationInspection {
            fields: [MODEL_CONTEXT_WINDOW, MODEL_AUTO_COMPACT_TOKEN_LIMIT],
            path: self.directory.join(SOURCE_FILE),
            file_revision,
            file_diagnostic,
            unknown_keys,
            active,
        })
    }

    pub fn snapshot(&self) -> Result<ConfigurationSnapshot> {
        self.active
            .lock()
            .map(|active| active.clone())
            .map_err(|_| unavailable("config_lock_failed"))
    }

    /// Activate an explicit edit after validating its revision. Already-accepted
    /// inputs keep their captured defaults.
    pub fn reload(&self, expected: Option<Fingerprint>) -> Result<ConfigurationSnapshot> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| unavailable("config_lock_failed"))?;
        let bytes = read_source(&self.directory)?;
        check_revision(revision(bytes.as_deref())?, expected)?;
        let parsed = parse(bytes.as_deref())?;
        report_unknown_keys(&self.directory, &parsed.unknown_keys);
        *active = snapshot(bytes.as_deref(), parsed.defaults)?;
        Ok(active.clone())
    }
}

#[derive(Clone, Copy, Debug)]
pub enum GlobalConfigEdit {
    Create,
    SuggestedPrompts(bool),
    WebSearch(bool),
}

/// The Settings application invokes this writer for its narrowly scoped edits.
pub fn edit_global_config(
    directory: &Path,
    edit: GlobalConfigEdit,
    admit: impl FnOnce() -> Result<()>,
) -> Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(directory)
        .map_err(|_| unavailable("config_directory_unavailable"))?;
    let metadata = validate_directory(directory)?;
    let source_path = directory.join(SOURCE_FILE);
    let create = matches!(edit, GlobalConfigEdit::Create);
    // Opening an existing file must also work when its contents need repair
    // or another Settings writer currently owns the lock.
    if create && open_source(&source_path)?.is_some() {
        return check_directory_identity(directory, &metadata);
    }
    let writer = open_writer(&directory.join("config.lock"))?;
    let _guard = WriterGuard::acquire(&writer)?;
    check_directory_identity(directory, &metadata)?;
    let original = if create {
        if open_source(&source_path)?.is_some() {
            return check_directory_identity(directory, &metadata);
        }
        None
    } else {
        read_bytes(&source_path)?
    };
    let existing = original.as_deref().unwrap_or_else(|| TEMPLATE.as_bytes());
    let mut document = parse_document(existing)?;
    match edit {
        GlobalConfigEdit::Create => (),
        GlobalConfigEdit::SuggestedPrompts(enabled) => {
            if !document.contains_key("desktop") {
                document["desktop"] = Item::Table(Table::new());
            }
            let desktop = document["desktop"]
                .as_table_like_mut()
                .ok_or_else(|| invalid("config_invalid_value_desktop"))?;
            if desktop.get(PREDICTIONS).and_then(Item::as_bool) == Some(enabled) {
                return Ok(());
            }
            replace_value(desktop, PREDICTIONS, Value::from(enabled))?;
        }
        GlobalConfigEdit::WebSearch(enabled) => {
            let policy = if enabled { "automatic" } else { "disabled" };
            if document.get("web_search").and_then(Item::as_str) == Some(policy) {
                return Ok(());
            }
            replace_value(document.as_table_mut(), "web_search", Value::from(policy))?;
        }
    }
    let bytes = render(existing, &document);
    let expected = revision(original.as_deref())?;
    write_atomic(directory, original.is_none(), &bytes, || {
        check_directory_identity(directory, &metadata)?;
        check_revision(
            revision(read_bytes(&directory.join(SOURCE_FILE))?.as_deref())?,
            expected,
        )?;
        admit()?;
        check_directory_identity(directory, &metadata)?;
        check_revision(
            revision(read_bytes(&directory.join(SOURCE_FILE))?.as_deref())?,
            expected,
        )
    })
}

fn replace_value(table: &mut dyn toml_edit::TableLike, key: &str, mut next: Value) -> Result<()> {
    if let Some(item) = table.get_mut(key) {
        let value = item
            .as_value_mut()
            .filter(|value| !value.is_array() && !value.is_inline_table())
            .ok_or_else(|| invalid("config_invalid_personalization"))?;
        *next.decor_mut() = value.decor().clone();
        *value = next;
    } else {
        table.insert(key, Item::Value(next));
    }
    Ok(())
}

fn render(original: &[u8], document: &DocumentMut) -> Vec<u8> {
    let mut text = document.to_string();
    if original.windows(2).filter(|pair| *pair == b"\r\n").count()
        == original.iter().filter(|byte| **byte == b'\n').count()
        && original.contains(&b'\n')
    {
        text = text.replace("\r\n", "\n").replace('\n', "\r\n");
    }
    if original.starts_with(&[0xef, 0xbb, 0xbf]) {
        text.insert(0, '\u{feff}');
    }
    text.into_bytes()
}

fn snapshot(bytes: Option<&[u8]>, defaults: UserDefaults) -> Result<ConfigurationSnapshot> {
    let revision = revision(bytes)?;
    Ok(ConfigurationSnapshot {
        identity: Fingerprint::of(&(revision, &defaults))?,
        source_revision: revision,
        defaults: StoredDefaults::Current(defaults),
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

fn read_source(directory: &Path) -> Result<Option<Vec<u8>>> {
    match std::fs::symlink_metadata(directory) {
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        _ => {
            let metadata = validate_directory(directory)?;
            let result = read_bytes(&directory.join(SOURCE_FILE))?;
            check_directory_identity(directory, &metadata)?;
            Ok(result)
        }
    }
}

fn report_unknown_keys(directory: &Path, keys: &[String]) {
    let path = directory.join(SOURCE_FILE);
    let mut stderr = std::io::stderr().lock();
    for key in keys {
        let _ = writeln!(
            stderr,
            "grida-agent: ignoring unknown setting {key:?} in {path:?}"
        );
    }
}

fn parse_document(bytes: &[u8]) -> Result<DocumentMut> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(Error::new(
            ErrorKind::LimitExceeded,
            "config_file_too_large",
        ));
    }
    let text = std::str::from_utf8(bytes).map_err(|_| invalid("config_encoding_invalid"))?;
    let document = text
        .strip_prefix('\u{feff}')
        .unwrap_or(text)
        .parse::<DocumentMut>()
        .map_err(|_| invalid("config_toml_invalid"))?;
    if document.get("schema_version").and_then(Item::as_integer) != Some(1) {
        return Err(Error::new(
            ErrorKind::Unsupported,
            "config_schema_unsupported",
        ));
    }
    Ok(document)
}

#[derive(Default)]
struct Parsed {
    defaults: UserDefaults,
    unknown_keys: Vec<String>,
}

fn parse(bytes: Option<&[u8]>) -> Result<Parsed> {
    let Some(bytes) = bytes else {
        return Ok(Parsed::default());
    };
    let document = parse_document(bytes)?;
    let unknown_keys = document
        .iter()
        .filter(|(key, _)| {
            !matches!(
                *key,
                "schema_version"
                    | "desktop"
                    | "hooks"
                    | "web_search"
                    | "model_context_window"
                    | "model_auto_compact_token_limit"
            )
        })
        .map(|(key, _)| key.to_owned())
        .collect();
    let read_limit = |field: FieldDefinition| -> Result<Option<NonZeroU64>> {
        document
            .get(field.key)
            .map(|item| {
                item.as_integer()
                    .and_then(|n| u64::try_from(n).ok())
                    .and_then(NonZeroU64::new)
                    .filter(|value| value.get() <= field.maximum)
                    .ok_or_else(|| invalid(&format!("config_invalid_value_{}", field.key)))
            })
            .transpose()
    };
    let defaults = UserDefaults {
        model_context_window: read_limit(MODEL_CONTEXT_WINDOW)?,
        model_auto_compact_token_limit: read_limit(MODEL_AUTO_COMPACT_TOKEN_LIMIT)?,
    };
    Ok(Parsed {
        defaults,
        unknown_keys,
    })
}

fn validate_directory(directory: &Path) -> Result<Metadata> {
    let metadata = std::fs::symlink_metadata(directory)
        .map_err(|_| unavailable("config_directory_unavailable"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(invalid("config_directory_invalid"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.uid() != rustix::process::geteuid().as_raw() || metadata.mode() & 0o022 != 0 {
            return Err(invalid("config_directory_unsafe"));
        }
    }
    validate_acl(directory)?;
    Ok(metadata)
}

fn validate_acl(path: &Path) -> Result<()> {
    #[cfg(unix)]
    grida_auth::refuse_granting_acl(path).map_err(|_| invalid("config_access_control_unsafe"))?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
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

fn open_source(path: &Path) -> Result<Option<(File, Metadata)>> {
    let before = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(unavailable("config_file_unavailable")),
    };
    validate_file(&before, false)?;
    validate_acl(path)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .map_err(|_| unavailable("config_file_unavailable"))?;
    let opened = file
        .metadata()
        .map_err(|_| unavailable("config_file_unavailable"))?;
    validate_file(&opened, false)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != opened.dev() || before.ino() != opened.ino() {
            return Err(unavailable("config_file_changed"));
        }
    }
    Ok(Some((file, opened)))
}

fn read_bytes(path: &Path) -> Result<Option<Vec<u8>>> {
    let Some((mut file, opened)) = open_source(path)? else {
        return Ok(None);
    };
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
    let after = file
        .metadata()
        .map_err(|_| unavailable("config_file_unavailable"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if (
            after.len(),
            after.mtime(),
            after.mtime_nsec(),
            after.ctime(),
            after.ctime_nsec(),
        ) != (
            opened.len(),
            opened.mtime(),
            opened.mtime_nsec(),
            opened.ctime(),
            opened.ctime_nsec(),
        ) || after.len() != bytes.len() as u64
        {
            return Err(unavailable("config_file_changed"));
        }
    }
    #[cfg(not(unix))]
    let _ = (opened, after);
    Ok(Some(bytes))
}

fn validate_file(metadata: &Metadata, private: bool) -> Result<()> {
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(invalid("config_file_invalid"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let mode_mask = if private { 0o077 } else { 0o022 };
        if metadata.uid() != rustix::process::geteuid().as_raw()
            || metadata.mode() & mode_mask != 0
            || metadata.nlink() != 1
        {
            return Err(invalid("config_file_unsafe"));
        }
    }
    #[cfg(not(unix))]
    let _ = private;
    Ok(())
}

fn open_writer(path: &Path) -> Result<File> {
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        validate_file(&metadata, true)?;
        validate_acl(path)?;
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
        true,
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
    create: bool,
    bytes: &[u8],
    admission: impl FnOnce() -> Result<()>,
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
    if create {
        file.persist_noclobber(directory.join(SOURCE_FILE))
            .map_err(|error| {
                if error.error.kind() == std::io::ErrorKind::AlreadyExists {
                    Error::new(ErrorKind::Conflict, "config_revision_changed")
                } else {
                    unavailable("config_write_failed")
                }
            })?;
    } else {
        file.persist(directory.join(SOURCE_FILE))
            .map_err(|_| unavailable("config_write_failed"))?;
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_historical_accepted_payloads_without_exposing_a_runtime_limit() {
        let source_revision = revision(Some(b"schema_version = 1\n")).unwrap();
        for limit in [None, Some(32u64)] {
            let defaults = serde_json::json!({"context":{"max_input_tokens":limit}});
            let identity = Fingerprint::of(&(source_revision, &defaults))
                .unwrap()
                .to_hex();
            let revision = serde_json::to_string(&source_revision).unwrap();
            let old = format!(
                r#"{{"identity":"{identity}","source_revision":{revision},"defaults":{defaults}}}"#
            );
            let snapshot: ConfigurationSnapshot = serde_json::from_str(&old).unwrap();
            assert_eq!(snapshot.defaults(), UserDefaults::default());
            assert_eq!(snapshot.captured_retired_input_cap(), limit.is_some());
            assert_eq!(serde_json::to_string(&snapshot).unwrap(), old);
        }
    }
}
