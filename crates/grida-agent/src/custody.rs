//! GRIDA-SEC-014 — explicit provider credential lookup for the native host.

use agent_kit_core::{BindingId, Error, ErrorKind, Fingerprint, Result};
use grida_auth::{CredentialContinuityStore, ProviderStore};
use reqwest::header::HeaderValue;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use subtle::ConstantTimeEq;
use uuid::Uuid;
use zeroize::Zeroizing;

pub(crate) enum CredentialSource {
    Environment { name: String },
    Stored { home: PathBuf, provider: String },
}

#[derive(Clone, Copy)]
pub(crate) enum CredentialFormat {
    Bearer,
    ApiKey,
}

pub(crate) struct CapturedCredential {
    source: Arc<Lookup>,
    nonce: Uuid,
    generation: Zeroizing<[u8; 32]>,
    invalidated: AtomicBool,
}

enum Lookup {
    Environment(String),
    Stored {
        store: ProviderStore,
        provider: String,
    },
}

impl CapturedCredential {
    /// Resolve the selected source during host startup. Each use checks the
    /// currently read value. Observed changes or removal retire this capture.
    /// The source exposes no revision for changes made entirely between reads;
    /// the host still enforces independent grant revocation.
    pub(crate) fn capture(source: CredentialSource) -> Result<Self> {
        let source = Arc::new(match source {
            CredentialSource::Environment { name } => {
                if name.is_empty()
                    || name.len() > 128
                    || !name
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
                {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "invalid_credential_environment_name",
                    ));
                }
                Lookup::Environment(name)
            }
            CredentialSource::Stored { home, provider } => Lookup::Stored {
                store: ProviderStore::new(home).map_err(store_error)?,
                provider,
            },
        });
        let secret = source.read()?.ok_or_else(missing)?;
        let wire_secret = source.bearer_key(&secret);
        if wire_secret.trim().is_empty()
            || !wire_secret.bytes().all(|byte| matches!(byte, b' '..=b'~'))
        {
            return Err(problem("provider_credential_invalid"));
        }
        let nonce = Uuid::new_v4();
        let generation = value_generation(&nonce, &secret);
        Ok(Self {
            source,
            nonce,
            generation,
            invalidated: AtomicBool::new(false),
        })
    }

    pub(crate) fn source_kind(&self) -> &'static str {
        match self.source.as_ref() {
            Lookup::Environment(_) => "environment",
            Lookup::Stored { .. } => "stored-byok",
        }
    }

    pub(crate) fn is_stored_for(&self, provider: &str) -> bool {
        matches!(self.source.as_ref(), Lookup::Stored { provider: id, .. } if id == provider)
    }

    /// Call at startup with the owned private state directory and a lineage
    /// that identifies the approved endpoint, model and credential source.
    pub(crate) fn replay_binding(
        &self,
        state_dir: &Path,
        lineage: Fingerprint,
    ) -> Result<BindingId> {
        let secret = self.check_value(self.source.read()?)?;
        let store = CredentialContinuityStore::new(state_dir.to_path_buf()).map_err(store_error)?;
        let identity = store.bind(*lineage.bytes(), &secret).map_err(store_error)?;
        BindingId::new(identity)
    }

    pub(crate) async fn validate(&self) -> Result<()> {
        self.current().await.map(|_| ())
    }

    /// The transport chooses the destination and header name from its approved
    /// operation binding before asking for a formatted credential.
    pub(crate) async fn header(&self, format: CredentialFormat) -> Result<HeaderValue> {
        let secret = self.current().await?;
        let mut header = match format {
            CredentialFormat::Bearer => {
                let bearer = Zeroizing::new(format!("Bearer {}", self.source.bearer_key(&secret)));
                HeaderValue::from_str(&bearer)
            }
            CredentialFormat::ApiKey => HeaderValue::from_str(&secret),
        }
        .map_err(|_| problem("provider_credential_invalid"))?;
        header.set_sensitive(true);
        Ok(header)
    }

    async fn current(&self) -> Result<Zeroizing<String>> {
        if self.invalidated.load(Ordering::Acquire) {
            return Err(changed());
        }
        let secret = match self.source.as_ref() {
            Lookup::Environment(_) => self.source.read()?,
            Lookup::Stored { .. } => {
                let source = Arc::clone(&self.source);
                tokio::task::spawn_blocking(move || source.read())
                    .await
                    .map_err(|_| problem("provider_credential_lookup_failed"))??
            }
        };
        self.check_value(secret)
    }

    fn check_value(&self, secret: Option<Zeroizing<String>>) -> Result<Zeroizing<String>> {
        let Some(secret) = secret else {
            self.invalidated.store(true, Ordering::Release);
            return Err(missing());
        };
        let current = value_generation(&self.nonce, &secret);
        if !bool::from(current.as_slice().ct_eq(self.generation.as_slice())) {
            self.invalidated.store(true, Ordering::Release);
        }
        if self.invalidated.load(Ordering::Acquire) {
            return Err(changed());
        }
        Ok(secret)
    }
}

impl Lookup {
    /// These stored provider keys previously used a trimmed value for Desktop
    /// transport. Capture and continuity still compare the original bytes.
    fn bearer_key<'a>(&self, secret: &'a str) -> &'a str {
        match self {
            Self::Stored { provider, .. }
                if matches!(provider.as_str(), "openrouter" | "vercel") =>
            {
                secret.trim()
            }
            _ => secret,
        }
    }

    fn read(&self) -> Result<Option<Zeroizing<String>>> {
        Ok(match self {
            Self::Environment(name) => std::env::var(name)
                .ok()
                .map(Zeroizing::new)
                .filter(|secret| !secret.is_empty() && secret.len() <= 4096),
            Self::Stored { store, provider } => store
                .read(provider)
                .map_err(store_error)?
                .map(Zeroizing::new),
        })
    }
}

fn value_generation(nonce: &Uuid, secret: &str) -> Zeroizing<[u8; 32]> {
    let mut hasher = Sha256::new();
    hasher.update(nonce.as_bytes());
    hasher.update(secret.as_bytes());
    Zeroizing::new(hasher.finalize().into())
}

fn store_error(error: grida_auth::Error) -> Error {
    let kind = match error.code() {
        "invalid_input" | "invalid_store" | "credential_continuity_invalid" => {
            ErrorKind::InvalidInput
        }
        "unsupported_platform"
        | "unsupported_version"
        | "credential_continuity_version_unsupported" => ErrorKind::Unsupported,
        "credential_continuity_full" => ErrorKind::LimitExceeded,
        _ => ErrorKind::Unavailable,
    };
    Error::new(kind, error.code())
}

fn missing() -> Error {
    problem("provider_credential_unavailable")
}

fn changed() -> Error {
    problem("provider_credential_changed")
}

fn problem(code: &'static str) -> Error {
    Error::new(ErrorKind::Unavailable, code)
}
