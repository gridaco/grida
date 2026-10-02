//! Independent native account and shared provider custody.
//!
//! GRIDA-SEC-010 / GRIDA-SEC-014: no ambient credentials, generic authenticated
//! fetch, Desktop account cookies, or automatic storage fallback.

mod client;
mod config;
#[cfg(feature = "conformance")]
#[doc(hidden)]
pub mod conformance;
mod credential_lock;
mod custody;
mod keyring;
mod native;
mod providers;
mod wire;

pub use client::{AuthClient, GgGrant, Request, Response, Transport};
pub use config::Config;
pub use credential_lock::CredentialLock;
pub use custody::{Backend, StorageInfo};
pub use providers::{Presence, ProviderStore};
pub use wire::{Identity, Logout, Organization, OrganizationsPage, Status};

/// Public failures carry only a fixed code. Native/parser/HTTP diagnostics and
/// source errors never cross this boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Error(&'static str);

impl Error {
    pub const fn new(code: &'static str) -> Self {
        Self(code)
    }
    pub const fn code(&self) -> &'static str {
        self.0
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Grida authentication failed ({})", self.0)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
