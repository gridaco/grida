use crate::{Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};

macro_rules! identity {
    ($($name:ident),+ $(,)?) => {$ (
        #[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Result<Self> {
                let value = value.into();
                if value.is_empty() || value.len() > 256 || !value.bytes().all(|c| {
                    c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.' | b':' | b'/' | b'@')
                }) {
                    return Err(Error::new(ErrorKind::InvalidInput, "invalid_identity"));
                }
                Ok(Self(value))
            }
            pub fn as_str(&self) -> &str { &self.0 }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(&self.0)
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> std::result::Result<Self, D::Error> {
                Self::new(String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
            }
        }
    )+};
}

identity!(
    MessageId,
    ToolCallId,
    ToolId,
    ModelId,
    ProviderId,
    PrincipalId,
    GrantId,
    ScopeId,
    OperationId,
    AttemptId,
    TurnId,
    SessionId,
    ChangeId,
    WaitId,
    SchemaId,
    ArtifactId,
    BindingId
);

/// SHA-256 of a canonical JSON value, independent of object insertion order.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Fingerprint([u8; 32]);

impl Fingerprint {
    pub fn of<T: Serialize>(value: &T) -> Result<Self> {
        fn ordered(value: serde_json::Value) -> serde_json::Value {
            match value {
                serde_json::Value::Object(object) => {
                    let sorted: std::collections::BTreeMap<_, _> = object.into_iter().collect();
                    serde_json::Value::Object(
                        sorted.into_iter().map(|(k, v)| (k, ordered(v))).collect(),
                    )
                }
                serde_json::Value::Array(values) => {
                    serde_json::Value::Array(values.into_iter().map(ordered).collect())
                }
                other => other,
            }
        }
        let value = serde_json::to_value(value)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "encoding_failed"))?;
        let bytes = serde_json::to_vec(&ordered(value))
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "encoding_failed"))?;
        Ok(Self(Sha256::digest(bytes).into()))
    }
    pub fn bytes(&self) -> &[u8; 32] {
        &self.0
    }
    /// The digest as 64 lowercase hexadecimal characters, the one encoding
    /// durable identifiers derived from a fingerprint use.
    pub fn to_hex(&self) -> String {
        use std::fmt::Write as _;
        self.0
            .iter()
            .fold(String::with_capacity(64), |mut text, byte| {
                let _ = write!(text, "{byte:02x}");
                text
            })
    }
}

/// Owner-defined data with an explicit schema and bounded encoded payload.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Envelope {
    schema: SchemaId,
    version: u32,
    bytes: Vec<u8>,
}

impl Envelope {
    pub const MAX_BYTES: usize = 8 * 1024 * 1024;

    pub fn new(schema: SchemaId, version: u32, bytes: Vec<u8>) -> Result<Self> {
        if version == 0 {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_schema_version",
            ));
        }
        if bytes.len() > Self::MAX_BYTES {
            return Err(Error::new(ErrorKind::LimitExceeded, "envelope_too_large"));
        }
        Ok(Self {
            schema,
            version,
            bytes,
        })
    }
    pub fn schema(&self) -> &SchemaId {
        &self.schema
    }
    pub fn version(&self) -> u32 {
        self.version
    }
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
}

impl<'de> Deserialize<'de> for Envelope {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Data {
            schema: SchemaId,
            version: u32,
            bytes: Vec<u8>,
        }
        let value = Data::deserialize(deserializer)?;
        Self::new(value.schema, value.version, value.bytes).map_err(serde::de::Error::custom)
    }
}
