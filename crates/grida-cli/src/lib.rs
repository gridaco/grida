//! Static CLI grammar and offline output. Parsing does not acquire host authority.
// GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-014 — explicit grammar precedes credential custody.

pub mod account;
#[cfg(feature = "conformance")]
pub mod conformance;
pub mod credentials;
pub mod error;
pub mod files;
mod grammar;
mod help;
pub mod host;
pub mod http;
pub mod input;
pub mod output;
pub mod runtime;

pub use grammar::*;
pub use help::Topic;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureCode {
    InvalidUsage,
    InteractionRequired,
}

impl FailureCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidUsage => "invalid_usage",
            Self::InteractionRequired => "interaction_required",
        }
    }
    pub fn exit_code(self) -> u8 {
        match self {
            Self::InvalidUsage => 2,
            Self::InteractionRequired => 1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Failure {
    pub code: FailureCode,
    pub message: &'static str,
}

impl Failure {
    pub fn usage() -> Self {
        Self {
            code: FailureCode::InvalidUsage,
            message: "Invalid command or options. Run grida --help or grida <command> --help.",
        }
    }
}

impl std::fmt::Display for Failure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{} ({})", self.message, self.code.as_str())
    }
}
impl std::error::Error for Failure {}
