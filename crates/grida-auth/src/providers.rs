// GRIDA-SEC-014 — language-neutral provider v1 protocol, shared with Desktop.
use crate::{Error, Result, native};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use zeroize::{Zeroize, Zeroizing};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Presence {
    pub provider: String,
}

pub struct ProviderStore {
    directory: PathBuf,
    filename: PathBuf,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Document {
    version: i64,
    migration: Migration,
    providers: BTreeMap<String, Entry>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    api_key: String,
}
impl Drop for Entry {
    fn drop(&mut self) {
        self.api_key.zeroize();
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Migration {
    state: MigrationState,
    removed: Vec<String>,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum MigrationState {
    Unstarted,
    Pending,
    Complete,
}

fn valid_provider(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.as_bytes()[0].is_ascii_lowercase()
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_' || c == b'-')
}
fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= 16_384 && !key.chars().any(char::is_control)
}
fn invalid() -> Error {
    Error::new("invalid_store")
}

impl Document {
    fn empty() -> Self {
        Self {
            version: 1,
            migration: Migration {
                state: MigrationState::Unstarted,
                removed: Vec::new(),
            },
            providers: BTreeMap::new(),
        }
    }
    fn validate(&self) -> Result<()> {
        if self.version != 1 {
            return Err(Error::new("unsupported_version"));
        }
        let removed: BTreeSet<_> = self.migration.removed.iter().collect();
        if removed.len() != self.migration.removed.len()
            || removed.len() + self.providers.len() > 128
            || (self.migration.state != MigrationState::Unstarted && !removed.is_empty())
            || removed.iter().any(|id| !valid_provider(id))
            || self.providers.iter().any(|(id, entry)| {
                !valid_provider(id) || !valid_key(&entry.api_key) || removed.contains(id)
            })
        {
            return Err(invalid());
        }
        Ok(())
    }
    fn parse(bytes: &[u8]) -> Result<Self> {
        let text = std::str::from_utf8(bytes).map_err(|_| invalid())?;
        if text.starts_with('\u{feff}') {
            return Err(invalid());
        }
        let value: toml::Value = toml::from_str(text).map_err(|_| invalid())?;
        match value.get("version").and_then(toml::Value::as_integer) {
            None => return Err(invalid()),
            Some(1) => (),
            Some(_) => return Err(Error::new("unsupported_version")),
        }
        fn depth(value: &toml::Value, level: usize) -> bool {
            if level > 4 {
                return false;
            }
            match value {
                toml::Value::Table(table) => table.values().all(|v| depth(v, level + 1)),
                toml::Value::Array(array) => array.iter().all(|v| depth(v, level + 1)),
                _ => true,
            }
        }
        if !depth(&value, 0) {
            return Err(invalid());
        }
        let document: Self = value.try_into().map_err(|_| invalid())?;
        document.validate()?;
        Ok(document)
    }
}

impl ProviderStore {
    /// Construction validates an explicit location without opening any store.
    pub fn new(home: PathBuf) -> Result<Self> {
        native::normalized_location(&home).map_err(|_| Error::new("invalid_input"))?;
        let directory = home.join("providers");
        let filename = directory.join("credentials.toml");
        Ok(Self {
            directory,
            filename,
        })
    }
    fn run<T>(
        &self,
        migration: bool,
        operation: impl FnOnce(&mut Document) -> Result<T>,
    ) -> Result<T> {
        if !cfg!(any(target_os = "linux", target_os = "macos")) {
            return Err(Error::new("unsupported_platform"));
        }
        native::locked(&self.directory, || {
            native::cleanup(&self.filename)?;
            let mut document = match native::read(&self.filename, "invalid_store")? {
                Some(bytes) => Document::parse(&Zeroizing::new(bytes))?,
                None => Document::empty(),
            };
            if !migration && document.migration.state == MigrationState::Pending {
                return Err(Error::new("migration_pending"));
            }
            operation(&mut document)
        })
        .map_err(|error| match error.code() {
            "session_busy" => Error::new("store_busy"),
            "custody_failed" => Error::new("storage_failed"),
            _ => error,
        })
    }
    fn write(&self, document: &mut Document) -> Result<()> {
        document.validate()?;
        document.migration.removed.sort();
        let body = Zeroizing::new(toml::to_string(document).map_err(|_| invalid())?);
        let text = Zeroizing::new(format!(
            "# Contains secrets. Do not commit, log, or share this file.\n{}",
            *body
        ));
        if text.len() > native::LIMIT {
            return Err(invalid());
        }
        native::atomic_write(&self.filename, text.as_bytes())
    }
    /// Secret-bearing result. Callers must never serialize it into public output.
    pub fn read(&self, provider: &str) -> Result<Option<String>> {
        if !valid_provider(provider) {
            return Err(Error::new("invalid_input"));
        }
        self.run(false, |document| {
            Ok(document
                .providers
                .get(provider)
                .map(|entry| entry.api_key.clone()))
        })
    }
    pub fn list(&self) -> Result<Vec<Presence>> {
        self.run(false, |document| {
            Ok(document
                .providers
                .keys()
                .map(|provider| Presence {
                    provider: provider.clone(),
                })
                .collect())
        })
    }
    pub fn set(&self, provider: &str, key: &str) -> Result<()> {
        if !valid_provider(provider) || !valid_key(key) {
            return Err(Error::new("invalid_input"));
        }
        self.run(false, |document| {
            document.providers.insert(
                provider.into(),
                Entry {
                    api_key: key.into(),
                },
            );
            document.migration.removed.retain(|id| id != provider);
            self.write(document)
        })
    }
    pub fn remove(&self, provider: &str) -> Result<()> {
        if !valid_provider(provider) {
            return Err(Error::new("invalid_input"));
        }
        self.run(false, |document| {
            document.providers.remove(provider);
            if document.migration.state == MigrationState::Unstarted
                && !document.migration.removed.iter().any(|id| id == provider)
            {
                document.migration.removed.push(provider.into());
            }
            self.write(document)
        })
    }
    /// Caller must hold its source writer lock throughout this call. Pending
    /// retries invoke only retirement, never reimport potentially stale keys.
    pub fn migrate(
        &self,
        read: impl FnOnce() -> Result<Vec<(String, String)>>,
        retire: impl FnOnce() -> Result<()>,
    ) -> Result<()> {
        self.run(true, |document| {
            if document.migration.state == MigrationState::Complete {
                return Ok(());
            }
            if document.migration.state == MigrationState::Unstarted {
                let entries = read().map_err(|_| Error::new("migration_failed"))?;
                let mut seen = BTreeSet::new();
                if entries.len() > 128 {
                    return Err(Error::new("invalid_input"));
                }
                for (id, key) in &entries {
                    if !valid_provider(id) || !valid_key(key) || !seen.insert(id) {
                        return Err(Error::new("invalid_input"));
                    }
                }
                for (id, key) in entries {
                    if !document.providers.contains_key(&id)
                        && !document.migration.removed.contains(&id)
                    {
                        document.providers.insert(id, Entry { api_key: key });
                    }
                }
                document.migration = Migration {
                    state: MigrationState::Pending,
                    removed: Vec::new(),
                };
                self.write(document)?;
            }
            retire().map_err(|_| Error::new("migration_failed"))?;
            document.migration = Migration {
                state: MigrationState::Complete,
                removed: Vec::new(),
            };
            self.write(document)
        })
    }
}
