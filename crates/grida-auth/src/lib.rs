//! Independent native account and shared provider custody.
//!
//! GRIDA-SEC-010 / GRIDA-SEC-014: no ambient credentials, generic authenticated
//! fetch, Desktop account cookies, or automatic storage fallback.

mod client;
mod config;
#[cfg(feature = "conformance")]
#[doc(hidden)]
pub mod conformance;
mod credential_continuity;
mod credential_lock;
mod custody;
mod keyring;
mod native;
mod providers;
mod wire;

pub use client::{AuthClient, GgGrant, GgGrantScope, Request, Response, Transport};
pub use config::Config;
pub use credential_continuity::CredentialContinuityStore;
pub use credential_lock::CredentialLock;
pub use custody::{Backend, StorageInfo};
pub use providers::{Presence, ProviderStore};
pub use wire::{Identity, Logout, Organization, OrganizationsPage, Status};

/// Refuse a path whose extended access control list grants any access. On
/// macOS an "allow" entry fails, a deny-only list passes, and a path that
/// cannot be queried fails closed. On other Unix platforms private-file checks
/// rely on the mode bits, so this passes. Non-Unix platforms refuse the check
/// until an ACL verifier is available. The path's final link is not followed.
#[cfg(unix)]
pub fn refuse_granting_acl(path: &std::path::Path) -> Result<()> {
    native::acl(path)
}

#[cfg(not(unix))]
pub fn refuse_granting_acl(_: &std::path::Path) -> Result<()> {
    Err(Error::new("unsupported_platform"))
}

#[cfg(all(test, not(unix)))]
#[test]
fn granting_acl_checks_require_a_supported_platform() {
    let file = tempfile::NamedTempFile::new().unwrap();
    assert_eq!(
        refuse_granting_acl(file.path()).unwrap_err().code(),
        "unsupported_platform"
    );
}

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
