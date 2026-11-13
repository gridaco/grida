//! Reusable conversation, execution, and durable-record contracts.
//!
//! Providers, tools, authority validators, and journal adapters are supplied by
//! callers. These modules own no credentials, filesystem, transport, or policy.

pub mod authority;
pub mod context;
pub mod driver_state;
pub mod history;
pub mod inference;
pub mod messages;
pub mod tools;
pub mod turn;

mod values;

pub use tokio_util::sync::CancellationToken;
pub use values::*;

pub use futures_core::future::BoxFuture;

/// A structural failure. Operational failures are recorded in operation outcomes.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Error {
    pub kind: ErrorKind,
    pub code: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// The input is malformed or violates its own declared constraints.
    InvalidInput,
    /// The input is valid, but the receiving capability does not accept it.
    Unsupported,
    /// A conditional precondition no longer holds: an expected position or
    /// revision moved, or an identity was reused for different content.
    /// Re-read current state before deciding whether to retry.
    Conflict,
    /// A size, count, or numeric bound would be exceeded.
    LimitExceeded,
    /// The target's current state does not allow the requested transition.
    InvalidState,
    /// A required capability or resource cannot be reached now.
    Unavailable,
    /// Whether an effect happened is unknown; reconcile before repeating it.
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
