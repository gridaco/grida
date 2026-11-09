//! Reusable conversation, execution, and durable-record contracts.
//!
//! Providers, tools, authority validators, and journal adapters are supplied by
//! callers. These modules own no credentials, filesystem, transport, or policy.

pub mod authority;
pub mod context;
pub mod history;
pub mod inference;
pub mod messages;
pub mod tools;
pub mod turn;

mod values;

pub use tokio_util::sync::CancellationToken;
pub use values::*;

pub type BoxFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

/// A structural failure. Operational failures are recorded in operation outcomes.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Error {
    pub kind: ErrorKind,
    pub code: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    InvalidInput,
    Unsupported,
    Conflict,
    LimitExceeded,
    InvalidState,
    Unavailable,
    Uncertain,
}

impl Error {
    pub fn new(kind: ErrorKind, code: impl Into<String>) -> Self {
        Self {
            kind,
            code: code.into(),
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({:?})", self.code, self.kind)
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;
