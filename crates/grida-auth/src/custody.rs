// GRIDA-SEC-010 — binding, revisions, durable backend selection and migration.
use crate::{
    Config, Error, Identity, Result,
    config::opaque,
    keyring::{Keyring, NativeKeyring},
    native,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use zeroize::{Zeroize, Zeroizing};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Backend {
    Keyring,
    File,
}
#[derive(Debug, Clone, Serialize)]
pub struct StorageInfo {
    pub backend: Backend,
    pub profile: String,
    pub initialized: bool,
    pub migration: Option<&'static str>,
}

// Declaration order is the legacy JSON.stringify order used for SHA-256.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Binding {
    home: String,
    issuer: String,
    client_id: String,
    api_origin: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Session {
    pub issuer: String,
    pub client_id: String,
    pub api_origin: String,
    pub access_token: String,
    pub refresh_token: String,
    #[serde(deserialize_with = "crate::wire::deserialize_integer")]
    pub expires_at: i64,
    pub identity: Identity,
}
impl Drop for Session {
    fn drop(&mut self) {
        self.access_token.zeroize();
        self.refresh_token.zeroize();
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Envelope {
    pub revision: String,
    #[serde(deserialize_with = "crate::wire::required_nullable")]
    pub session: Option<Session>,
}
impl Envelope {
    fn empty() -> Self {
        Self {
            revision: uuid::Uuid::new_v4().to_string(),
            session: None,
        }
    }
}
#[derive(Serialize, Deserialize)]
struct Metadata {
    version: u8,
    binding: Binding,
    backend: Backend,
    initialized: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    envelope: Option<Envelope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    migration: Option<Migration>,
}
#[derive(Clone, Serialize, Deserialize)]
struct Migration {
    from: Backend,
    to: Backend,
}
#[derive(Serialize, Deserialize)]
struct KeyringEnvelope {
    version: u8,
    binding: Binding,
    #[serde(flatten)]
    envelope: Envelope,
}

pub(crate) struct Store {
    directory: PathBuf,
    filename: PathBuf,
    binding: Binding,
    profile: String,
    requested: Mutex<Option<Backend>>,
    keyring: Arc<dyn Keyring>,
}
fn failed() -> Error {
    Error::new("custody_failed")
}
const SERVICE: &str = "Grida Native Auth";
const MAX_SAFE: i64 = 9_007_199_254_740_991;

pub(crate) struct Transaction<'a> {
    store: &'a Store,
    metadata: Metadata,
}
impl Transaction<'_> {
    pub(crate) fn read(&self) -> Result<Envelope> {
        self.store.envelope(&self.metadata)
    }
    pub(crate) fn write(&mut self, session: Option<Session>) -> Result<()> {
        let envelope = Envelope {
            revision: uuid::Uuid::new_v4().to_string(),
            session,
        };
        self.store.validate(&envelope)?;
        match self.metadata.backend {
            Backend::Keyring => self.store.write_keyring(&envelope),
            Backend::File => {
                self.metadata.envelope = Some(envelope);
                self.store.save(&self.metadata)
            }
        }
    }
}

impl Store {
    pub(crate) fn open(config: &Config, home: PathBuf, storage: Option<Backend>) -> Result<Self> {
        Self::with_keyring(config, home, storage, Arc::new(NativeKeyring))
    }
    fn with_keyring(
        config: &Config,
        home: PathBuf,
        storage: Option<Backend>,
        keyring: Arc<dyn Keyring>,
    ) -> Result<Self> {
        config.validate()?;
        native::location(&home).map_err(|_| failed())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(&home)
                .map_err(|_| failed())?;
        }
        let canonical = std::fs::canonicalize(&home).map_err(|_| failed())?;
        let directory = canonical.join("auth");
        native::directory(&directory)?;
        let binding = Binding {
            home: canonical.to_str().ok_or_else(failed)?.into(),
            issuer: config.issuer.clone(),
            client_id: config.client_id.clone(),
            api_origin: config.api_origin.clone(),
        };
        let profile = Sha256::digest(serde_json::to_vec(&binding).map_err(|_| failed())?)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        let directory = directory.join(&profile);
        native::directory(&directory)?;
        Ok(Self {
            filename: directory.join("credentials.json"),
            directory,
            binding,
            profile,
            requested: Mutex::new(storage),
            keyring,
        })
    }
    pub(crate) fn exclusive<T>(
        &self,
        operation: impl FnOnce(&mut Transaction<'_>) -> Result<T>,
    ) -> Result<T> {
        native::locked(&self.directory, || {
            let mut metadata = self.load(true)?;
            if metadata.migration.is_some() {
                return Err(failed());
            }
            self.initialize(&mut metadata)?;
            operation(&mut Transaction {
                store: self,
                metadata,
            })
        })
    }
    pub(crate) fn info(&self) -> Result<StorageInfo> {
        native::locked(&self.directory, || Ok(self.describe(&self.load(false)?)))
    }
    fn describe(&self, metadata: &Metadata) -> StorageInfo {
        StorageInfo {
            backend: metadata.backend,
            profile: self.profile.clone(),
            initialized: metadata.initialized,
            migration: metadata.migration.as_ref().map(|_| "pending"),
        }
    }
    fn fresh(&self, backend: Backend) -> Metadata {
        Metadata {
            version: 1,
            binding: self.binding.clone(),
            backend,
            initialized: backend == Backend::File,
            envelope: (backend == Backend::File).then(Envelope::empty),
            migration: None,
        }
    }
    fn load(&self, enforce: bool) -> Result<Metadata> {
        native::cleanup(&self.filename)?;
        let requested = *self.requested.lock().map_err(|_| failed())?;
        let Some(bytes) = native::read(&self.filename, "custody_failed")? else {
            let metadata = self.fresh(requested.unwrap_or(Backend::Keyring));
            self.save(&metadata)?;
            return Ok(metadata);
        };
        let value: serde_json::Value =
            serde_json::from_slice(&Zeroizing::new(bytes)).map_err(|_| failed())?;
        if value
            .get("migration")
            .is_some_and(serde_json::Value::is_null)
            || value.get("backend").and_then(serde_json::Value::as_str) == Some("keyring")
                && value.get("envelope").is_some()
        {
            return Err(failed());
        }
        let metadata: Metadata = serde_json::from_value(value).map_err(|_| failed())?;
        if metadata.version != 1
            || metadata.binding != self.binding
            || (metadata.backend == Backend::File
                && (!metadata.initialized || metadata.envelope.is_none()))
            || (metadata.backend == Backend::Keyring && metadata.envelope.is_some())
            || metadata.migration.as_ref().is_some_and(|m| m.from == m.to)
        {
            return Err(failed());
        }
        if let Some(envelope) = &metadata.envelope {
            self.validate(envelope)?;
        }
        if enforce && !metadata.initialized && requested == Some(Backend::File) {
            let metadata = self.fresh(Backend::File);
            self.save(&metadata)?;
            return Ok(metadata);
        }
        if enforce && requested.is_some_and(|r| r != metadata.backend) {
            return Err(failed());
        }
        Ok(metadata)
    }
    fn save(&self, metadata: &Metadata) -> Result<()> {
        native::atomic_write(
            &self.filename,
            &Zeroizing::new(serde_json::to_vec(metadata).map_err(|_| failed())?),
        )
    }
    fn initialize(&self, metadata: &mut Metadata) -> Result<()> {
        if metadata.initialized {
            return Ok(());
        }
        if let Some(value) = self.keyring.read(SERVICE, &self.profile)?
            && self.parse_keyring(&value)?.session.is_some()
        {
            return Err(failed());
        }
        self.write_keyring(&Envelope::empty())?;
        metadata.initialized = true;
        self.save(metadata)
    }
    fn envelope(&self, metadata: &Metadata) -> Result<Envelope> {
        let envelope = match metadata.backend {
            Backend::File => metadata.envelope.clone().ok_or_else(failed)?,
            Backend::Keyring => self.parse_keyring(&Zeroizing::new(
                self.keyring
                    .read(SERVICE, &self.profile)?
                    .ok_or_else(failed)?,
            ))?,
        };
        self.validate(&envelope)?;
        Ok(envelope)
    }
    fn validate(&self, envelope: &Envelope) -> Result<()> {
        let id = uuid::Uuid::parse_str(&envelope.revision).map_err(|_| failed())?;
        if id.get_version_num() != 4
            || id.get_variant() != uuid::Variant::RFC4122
            || id.to_string() != envelope.revision
        {
            return Err(failed());
        }
        if let Some(s) = &envelope.session
            && (s.issuer != self.binding.issuer
                || s.client_id != self.binding.client_id
                || s.api_origin != self.binding.api_origin
                || !opaque(&s.access_token)
                || !opaque(&s.refresh_token)
                || !(0..=MAX_SAFE).contains(&s.expires_at)
                || !opaque(&s.identity.id)
                || [&s.identity.email, &s.identity.display_name]
                    .iter()
                    .any(|v| {
                        v.as_ref()
                            .is_some_and(|t| t.encode_utf16().count() > 16_384)
                    }))
        {
            return Err(failed());
        }
        Ok(())
    }
    fn parse_keyring(&self, value: &str) -> Result<Envelope> {
        if value.encode_utf16().count() > 131_072 {
            return Err(failed());
        }
        let record: KeyringEnvelope = serde_json::from_str(value).map_err(|_| failed())?;
        if record.version != 1 || record.binding != self.binding {
            return Err(failed());
        }
        self.validate(&record.envelope)?;
        Ok(record.envelope)
    }
    fn write_keyring(&self, envelope: &Envelope) -> Result<()> {
        let value = Zeroizing::new(
            serde_json::to_string(&KeyringEnvelope {
                version: 1,
                binding: self.binding.clone(),
                envelope: envelope.clone(),
            })
            .map_err(|_| failed())?,
        );
        self.keyring.write(SERVICE, &self.profile, &value)?;
        if self.keyring.read(SERVICE, &self.profile)?.as_deref() != Some(&value) {
            return Err(failed());
        }
        Ok(())
    }
    pub(crate) fn migrate(&self, backend: Backend) -> Result<StorageInfo> {
        native::locked(&self.directory, || {
            let mut metadata = self.load(false)?;
            if !metadata.initialized && backend == Backend::File {
                metadata = self.fresh(Backend::File);
                self.save(&metadata)?;
                *self.requested.lock().map_err(|_| failed())? = Some(backend);
                return Ok(self.describe(&metadata));
            }
            self.initialize(&mut metadata)?;
            if metadata.migration.as_ref().is_some_and(|m| m.to != backend) {
                return Err(failed());
            }
            if metadata.migration.is_none() && metadata.backend == backend {
                return Ok(self.describe(&metadata));
            }
            if metadata.migration.is_none() {
                metadata.migration = Some(Migration {
                    from: metadata.backend,
                    to: backend,
                });
                self.save(&metadata)?;
            }
            if metadata.backend != backend {
                let mut envelope = self.envelope(&metadata)?;
                envelope.revision = uuid::Uuid::new_v4().to_string();
                let mut destination = self.fresh(backend);
                destination.initialized = true;
                destination.migration = metadata.migration.clone();
                match backend {
                    Backend::File => destination.envelope = Some(envelope),
                    Backend::Keyring => self.write_keyring(&envelope)?,
                }
                self.save(&destination)?;
                metadata = destination;
            }
            if metadata
                .migration
                .as_ref()
                .is_some_and(|m| m.from == Backend::Keyring)
            {
                self.write_keyring(&Envelope::empty())?;
            }
            metadata.migration = None;
            self.save(&metadata)?;
            *self.requested.lock().map_err(|_| failed())? = Some(backend);
            Ok(self.describe(&metadata))
        })
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    #[derive(Default)]
    struct MemoryKeyring {
        value: Mutex<Option<String>>,
        reject_empty: AtomicBool,
        reads: AtomicUsize,
    }
    impl Keyring for MemoryKeyring {
        fn read(&self, service: &str, account: &str) -> Result<Option<String>> {
            assert_eq!(service, "Grida Native Auth");
            assert_eq!(account.len(), 64);
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(self.value.lock().unwrap().clone())
        }
        fn write(&self, _: &str, _: &str, value: &str) -> Result<()> {
            if self.reject_empty.load(Ordering::SeqCst)
                && serde_json::from_str::<serde_json::Value>(value).unwrap()["session"].is_null()
            {
                return Err(failed());
            }
            *self.value.lock().unwrap() = Some(value.into());
            Ok(())
        }
    }
    fn config() -> Config {
        Config {
            client_id: "synthetic-cli".into(),
            publishable_key: "sb_publishable_synthetic".into(),
            issuer: "https://identity.example/auth/v1".into(),
            api_origin: "https://api.example".into(),
            redirect_uris: vec!["http://127.0.0.1:49182/callback".into()],
        }
    }
    fn setup() -> (tempfile::TempDir, Store, Arc<MemoryKeyring>) {
        let temp = tempfile::tempdir().unwrap();
        let keyring = Arc::new(MemoryKeyring::default());
        let store = Store::with_keyring(
            &config(),
            std::fs::canonicalize(temp.path()).unwrap(),
            Some(Backend::File),
            keyring.clone(),
        )
        .unwrap();
        (temp, store, keyring)
    }
    fn session() -> Session {
        let c = config();
        Session {
            issuer: c.issuer,
            client_id: c.client_id,
            api_origin: c.api_origin,
            access_token: "synthetic-access".into(),
            refresh_token: "synthetic-refresh".into(),
            expires_at: 9_000_000_000_000,
            identity: Identity {
                id: "synthetic-user".into(),
                email: None,
                display_name: None,
            },
        }
    }
    #[test]
    fn ordered_profile_preimage_matches_typescript() {
        let binding = Binding {
            home: "/synthetic/grida".into(),
            issuer: "https://identity.example/auth/v1".into(),
            client_id: "synthetic-cli".into(),
            api_origin: "https://api.example".into(),
        };
        assert_eq!(
            serde_json::to_string(&binding).unwrap(),
            r#"{"home":"/synthetic/grida","issuer":"https://identity.example/auth/v1","clientId":"synthetic-cli","apiOrigin":"https://api.example"}"#
        );
        let digest = Sha256::digest(serde_json::to_vec(&binding).unwrap())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        assert_eq!(
            digest,
            "5576382ee69914acaf894b5d416653b08bba54f40460d0d3ba52f8ccd9c16fe4"
        );
    }
    #[test]
    fn frozen_v1_file_and_keyring_records_survive_current_readers() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../packages/grida-auth/fixtures/account-v1/custody.json"
        ))
        .unwrap();
        let binding: Binding =
            serde_json::from_value(fixture["file_metadata"]["binding"].clone()).unwrap();
        let preimage = serde_json::to_string(&binding).unwrap();
        assert_eq!(preimage, fixture["binding_preimage"]);
        let digest = Sha256::digest(preimage.as_bytes())
            .iter()
            .map(|v| format!("{v:02x}"))
            .collect::<String>();
        assert_eq!(digest, fixture["profile_sha256"]);
        let config = Config {
            issuer: binding.issuer,
            api_origin: binding.api_origin,
            client_id: binding.client_id,
            publishable_key: "sb_publishable_synthetic".into(),
            redirect_uris: vec!["http://127.0.0.1:47902/callback".into()],
        };
        for (backend, metadata_name, record_name) in [
            (Backend::File, "file_metadata", "keyring_record"),
            (Backend::Keyring, "keyring_metadata", "keyring_record"),
            (Backend::Keyring, "keyring_metadata", "keyring_tombstone"),
        ] {
            let temp = tempfile::tempdir().unwrap();
            let home = std::fs::canonicalize(temp.path()).unwrap();
            let keyring = Arc::new(MemoryKeyring::default());
            let store =
                Store::with_keyring(&config, home.clone(), Some(backend), keyring.clone()).unwrap();
            let mut metadata = fixture[metadata_name].clone();
            metadata["binding"]["home"] = serde_json::json!(home);
            native::atomic_write(&store.filename, &serde_json::to_vec(&metadata).unwrap()).unwrap();
            let mut record = fixture[record_name].clone();
            record["binding"]["home"] = serde_json::json!(home);
            *keyring.value.lock().unwrap() = Some(record.to_string());
            let envelope = store.exclusive(|tx| tx.read()).unwrap();
            assert_eq!(envelope.revision, record["revision"]);
            assert_eq!(
                serde_json::to_value(&envelope.session).unwrap(),
                record["session"]
            );
            let before = envelope.revision;
            store.exclusive(|tx| tx.write(None)).unwrap();
            let cleared = store.exclusive(|tx| tx.read()).unwrap();
            assert!(cleared.session.is_none());
            assert_ne!(before, cleared.revision);
        }
    }
    #[test]
    fn file_keyring_migration_erases_plaintext_and_keeps_tombstone() {
        let (_temp, store, keyring) = setup();
        store.exclusive(|tx| tx.write(Some(session()))).unwrap();
        let revision = store.exclusive(|tx| Ok(tx.read()?.revision)).unwrap();
        assert_eq!(
            store.migrate(Backend::Keyring).unwrap().backend,
            Backend::Keyring
        );
        let bytes = std::fs::read_to_string(&store.filename).unwrap();
        assert!(!bytes.contains("synthetic-refresh"));
        assert!(!bytes.contains("envelope"));
        assert_ne!(
            store.exclusive(|tx| Ok(tx.read()?.revision)).unwrap(),
            revision
        );
        store.migrate(Backend::File).unwrap();
        assert_eq!(
            store
                .exclusive(|tx| Ok(tx.read()?.session.unwrap().refresh_token.clone()))
                .unwrap(),
            "synthetic-refresh"
        );
        let persisted: serde_json::Value =
            serde_json::from_str(keyring.value.lock().unwrap().as_ref().unwrap()).unwrap();
        assert!(persisted["session"].is_null());
    }
    #[test]
    fn failed_cleanup_leaves_pending_fence_then_resumes() {
        let (_temp, store, keyring) = setup();
        store.exclusive(|tx| tx.write(Some(session()))).unwrap();
        store.migrate(Backend::Keyring).unwrap();
        keyring.reject_empty.store(true, Ordering::SeqCst);
        assert_eq!(
            store.migrate(Backend::File).unwrap_err().code(),
            "custody_failed"
        );
        let info = store.info().unwrap();
        assert_eq!(info.backend, Backend::File);
        assert_eq!(info.migration, Some("pending"));
        assert_eq!(
            store.exclusive(|_| Ok(())).unwrap_err().code(),
            "custody_failed"
        );
        keyring.reject_empty.store(false, Ordering::SeqCst);
        store.migrate(Backend::File).unwrap();
        assert!(
            store
                .exclusive(|tx| Ok(tx.read()?.session.is_some()))
                .unwrap()
        );
    }
    #[test]
    fn storage_info_never_opens_native_keyring() {
        let temp = tempfile::tempdir().unwrap();
        let keyring = Arc::new(MemoryKeyring::default());
        let store = Store::with_keyring(
            &config(),
            std::fs::canonicalize(temp.path()).unwrap(),
            None,
            keyring.clone(),
        )
        .unwrap();
        assert!(!store.info().unwrap().initialized);
        assert_eq!(keyring.reads.load(Ordering::SeqCst), 0);
        store.migrate(Backend::File).unwrap();
        assert_eq!(keyring.reads.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn lost_metadata_never_adopts_existing_signed_in_keyring() {
        let (_temp, store, _keyring) = setup();
        store.exclusive(|tx| tx.write(Some(session()))).unwrap();
        store.migrate(Backend::Keyring).unwrap();
        std::fs::remove_file(&store.filename).unwrap();
        assert_eq!(
            store.exclusive(|_| Ok(())).unwrap_err().code(),
            "custody_failed"
        );
    }
    #[test]
    fn missing_nullable_fields_and_invalid_revision_fail_closed() {
        let (_temp, store, _) = setup();
        store.exclusive(|tx| tx.write(Some(session()))).unwrap();
        let original: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&store.filename).unwrap()).unwrap();
        for field in ["email", "display_name"] {
            let mut value = original.clone();
            value["envelope"]["session"]["identity"]
                .as_object_mut()
                .unwrap()
                .remove(field);
            native::atomic_write(&store.filename, &serde_json::to_vec(&value).unwrap()).unwrap();
            assert_eq!(
                store.exclusive(|_| Ok(())).unwrap_err().code(),
                "custody_failed"
            );
        }
        let mut value = original;
        value["envelope"]["revision"] = serde_json::json!("11111111-1111-4111-1111-111111111111");
        native::atomic_write(&store.filename, &serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(
            store.exclusive(|_| Ok(())).unwrap_err().code(),
            "custody_failed"
        );
    }
    #[test]
    fn admission_key_rotation_keeps_profile_identity() {
        let (temp, first, keyring) = setup();
        let mut config = config();
        config.publishable_key = "sb_publishable_changed".into();
        let second = Store::with_keyring(
            &config,
            std::fs::canonicalize(temp.path()).unwrap(),
            Some(Backend::File),
            keyring,
        )
        .unwrap();
        assert_eq!(first.profile, second.profile);
    }
}
