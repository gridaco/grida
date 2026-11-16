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

/// SHA-256 of a value's canonical JSON encoding: compact serde_json text with
/// the keys of every object in ascending byte order, so object insertion order
/// never changes it. Serialized as 64 lowercase hexadecimal characters.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Fingerprint([u8; 32]);

impl Fingerprint {
    pub fn of<T: Serialize + ?Sized>(value: &T) -> Result<Self> {
        struct Hasher(Sha256);
        impl std::io::Write for Hasher {
            fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
                self.0.update(bytes);
                Ok(bytes.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let mut hasher = Hasher(Sha256::new());
        crate::canonical::to_writer(&mut hasher, value)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "encoding_failed"))?;
        Ok(Self(hasher.0.finalize().into()))
    }
    pub fn bytes(&self) -> &[u8; 32] {
        &self.0
    }
    /// A digest previously produced by `of`, read back from storage.
    pub const fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }
    /// The digest as 64 lowercase hexadecimal characters, the one text
    /// encoding of a fingerprint.
    pub fn to_hex(&self) -> String {
        const DIGITS: &[u8; 16] = b"0123456789abcdef";
        let mut text = String::with_capacity(64);
        for byte in self.0 {
            text.push(DIGITS[usize::from(byte >> 4)] as char);
            text.push(DIGITS[usize::from(byte & 0x0f)] as char);
        }
        text
    }
    /// Read back the text `to_hex` produces. Any other text, including
    /// uppercase digits and multibyte characters, is refused.
    pub fn from_hex(text: &str) -> Option<Self> {
        let text = text.as_bytes();
        if text.len() != 64 {
            return None;
        }
        let nibble = |digit: u8| match digit {
            b'0'..=b'9' => Some(digit - b'0'),
            b'a'..=b'f' => Some(digit - b'a' + 10),
            _ => None,
        };
        let mut bytes = [0u8; 32];
        for (byte, [high, low]) in bytes.iter_mut().zip(text.as_chunks::<2>().0) {
            *byte = nibble(*high)? << 4 | nibble(*low)?;
        }
        Some(Self(bytes))
    }
}

impl Serialize for Fingerprint {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_hex())
    }
}

impl<'de> Deserialize<'de> for Fingerprint {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        struct Hex;
        impl serde::de::Visitor<'_> for Hex {
            type Value = Fingerprint;
            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("64 lowercase hexadecimal characters")
            }
            fn visit_str<E: serde::de::Error>(
                self,
                text: &str,
            ) -> std::result::Result<Fingerprint, E> {
                Fingerprint::from_hex(text)
                    .ok_or_else(|| E::invalid_value(serde::de::Unexpected::Str(text), &self))
            }
        }
        deserializer.deserialize_str(Hex)
    }
}

/// Owner-defined data with an explicit schema and bounded encoded payload.
/// The payload serializes as padded standard base64.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Envelope {
    schema: SchemaId,
    version: u32,
    #[serde(serialize_with = "base64_bytes::serialize")]
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
            #[serde(deserialize_with = "base64_bytes::deserialize")]
            bytes: Vec<u8>,
        }
        let value = Data::deserialize(deserializer)?;
        Self::new(value.schema, value.version, value.bytes).map_err(serde::de::Error::custom)
    }
}

mod base64_bytes {
    use base64::Engine as _;
    use base64::engine::general_purpose::STANDARD;

    pub(super) fn serialize<S: serde::Serializer>(
        bytes: &[u8],
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&STANDARD.encode(bytes))
    }

    pub(super) fn deserialize<'de, D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Vec<u8>, D::Error> {
        struct Text;
        impl serde::de::Visitor<'_> for Text {
            type Value = Vec<u8>;
            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("padded standard base64")
            }
            fn visit_str<E: serde::de::Error>(self, text: &str) -> std::result::Result<Vec<u8>, E> {
                // Refuse an oversized payload before decoding it.
                if text.len() / 4 * 3 > super::Envelope::MAX_BYTES + 3 {
                    return Err(E::custom("envelope_too_large"));
                }
                STANDARD
                    .decode(text)
                    .map_err(|_| E::invalid_value(serde::de::Unexpected::Str("base64"), &self))
            }
        }
        deserializer.deserialize_str(Text)
    }
}
