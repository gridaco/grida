//! GRIDA-SEC-014 — private credential continuity evidence separate from provider keys.

use crate::{Error, Result, native};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::path::PathBuf;
use subtle::ConstantTimeEq;
use uuid::{Uuid, Variant};
use zeroize::{ZeroizeOnDrop, Zeroizing};

const VERSION: u32 = 1;
const MAX_BINDINGS: usize = 32;
const MAX_BYTES: usize = 32 * 1024;

/// A private, bounded map from opaque caller lineages to credential continuity
/// identities. A match establishes equal credential bytes at the two reads.
pub struct CredentialContinuityStore {
    directory: PathBuf,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Document {
    version: u32,
    bindings: Vec<Binding>,
}

#[derive(Deserialize, Serialize, ZeroizeOnDrop)]
#[serde(deny_unknown_fields)]
struct Binding {
    lineage: [u8; 32],
    identity: [u8; 16],
    salt: [u8; 16],
    proof: [u8; 32],
}

impl CredentialContinuityStore {
    /// Select an explicit private home. Construction does not open storage.
    pub fn new(home: PathBuf) -> Result<Self> {
        native::normalized_location(&home).map_err(|_| Error::new("invalid_input"))?;
        Ok(Self {
            directory: home.join("credential-continuity"),
        })
    }

    /// Return only an opaque random identity. A credential mismatch replaces
    /// the identity for this lineage. The caller keeps authorization separate.
    pub fn bind(&self, lineage: [u8; 32], credential: &str) -> Result<String> {
        if credential.is_empty() || credential.len() > 16_384 {
            return Err(Error::new("invalid_input"));
        }
        let path = self.directory.join("bindings.json");
        native::locked(&self.directory, || {
            native::cleanup(&path)?;
            let bytes = native::read(&path, "credential_continuity_invalid")?.map(Zeroizing::new);
            let mut document = Document::parse(bytes.as_deref().map(Vec::as_slice))?;
            let (identity, changed) = document.bind(lineage, credential)?;
            if changed {
                let bytes = Zeroizing::new(serde_json::to_vec(&document).map_err(|_| invalid())?);
                if bytes.len() > MAX_BYTES {
                    return Err(invalid());
                }
                native::atomic_write(&path, &bytes)?;
            }
            Ok(identity.to_string())
        })
        .map_err(|error| match error.code() {
            "session_busy" => Error::new("credential_continuity_busy"),
            "custody_failed" => Error::new("credential_continuity_storage_failed"),
            _ => error,
        })
    }
}

impl Document {
    fn parse(bytes: Option<&[u8]>) -> Result<Self> {
        let Some(bytes) = bytes else {
            return Ok(Self {
                version: VERSION,
                bindings: Vec::new(),
            });
        };
        if bytes.len() > MAX_BYTES {
            return Err(invalid());
        }
        let document: Self = serde_json::from_slice(bytes).map_err(|_| invalid())?;
        if document.version != VERSION {
            return Err(Error::new("credential_continuity_version_unsupported"));
        }
        let mut lineages = BTreeSet::new();
        let mut identities = BTreeSet::new();
        if document.bindings.len() > MAX_BINDINGS
            || !document.bindings.iter().all(|binding| {
                let identity = Uuid::from_bytes(binding.identity);
                identity.get_version_num() == 4
                    && identity.get_variant() == Variant::RFC4122
                    && lineages.insert(binding.lineage)
                    && identities.insert(binding.identity)
            })
        {
            return Err(invalid());
        }
        Ok(document)
    }

    fn bind(&mut self, lineage: [u8; 32], credential: &str) -> Result<(Uuid, bool)> {
        if let Some(binding) = self
            .bindings
            .iter_mut()
            .find(|binding| binding.lineage == lineage)
        {
            let proof = Binding::proof(&lineage, &binding.salt, credential);
            if bool::from(proof.as_slice().ct_eq(binding.proof.as_slice())) {
                return Ok((Uuid::from_bytes(binding.identity), false));
            }
            *binding = Binding::new(lineage, credential);
            return Ok((Uuid::from_bytes(binding.identity), true));
        }
        if self.bindings.len() == MAX_BINDINGS {
            return Err(Error::new("credential_continuity_full"));
        }
        let binding = Binding::new(lineage, credential);
        let identity = Uuid::from_bytes(binding.identity);
        self.bindings.push(binding);
        Ok((identity, true))
    }
}

impl Binding {
    fn new(lineage: [u8; 32], credential: &str) -> Self {
        let identity = *Uuid::new_v4().as_bytes();
        let salt = *Uuid::new_v4().as_bytes();
        let proof = *Self::proof(&lineage, &salt, credential);
        Self {
            lineage,
            identity,
            salt,
            proof,
        }
    }

    fn proof(lineage: &[u8; 32], salt: &[u8; 16], credential: &str) -> Zeroizing<[u8; 32]> {
        let mut hasher = Sha256::new();
        hasher.update(b"grida-credential-continuity-v1");
        hasher.update(lineage);
        hasher.update(salt);
        hasher.update(credential.as_bytes());
        Zeroizing::new(hasher.finalize().into())
    }
}

fn invalid() -> Error {
    Error::new("credential_continuity_invalid")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_document_does_not_evict_existing_lineages() {
        let mut document = Document::parse(None).unwrap();
        for index in 0..MAX_BINDINGS {
            assert!(document.bind([index as u8; 32], "synthetic").unwrap().1);
        }
        assert_eq!(
            document
                .bind([u8::MAX; 32], "synthetic")
                .unwrap_err()
                .code(),
            "credential_continuity_full"
        );
        assert!(!document.bind([0; 32], "synthetic").unwrap().1);
        assert!(document.bind([0; 32], "rotated").unwrap().1);
    }
}
