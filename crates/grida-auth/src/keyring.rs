// GRIDA-SEC-010 — exact existing native keytar identities, no fallback.
use crate::{Error, Result};
pub(crate) trait Keyring: Send + Sync {
    fn read(&self, service: &str, account: &str) -> Result<Option<String>>;
    fn write(&self, service: &str, account: &str, value: &str) -> Result<()>;
}
pub(crate) struct NativeKeyring;
fn failed() -> Error {
    Error::new("custody_failed")
}

#[cfg(target_os = "macos")]
impl Keyring for NativeKeyring {
    fn read(&self, service: &str, account: &str) -> Result<Option<String>> {
        match security_framework::passwords::get_generic_password(service, account) {
            Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| failed()),
            Err(error) if error.code() == -25300 => Ok(None),
            Err(_) => Err(failed()),
        }
    }
    fn write(&self, service: &str, account: &str, value: &str) -> Result<()> {
        security_framework::passwords::set_generic_password(service, account, value.as_bytes())
            .map_err(|_| failed())?;
        if self.read(service, account)?.as_deref() != Some(value) {
            return Err(failed());
        }
        Ok(())
    }
}

#[cfg(target_os = "linux")]
impl Keyring for NativeKeyring {
    fn read(&self, service: &str, account: &str) -> Result<Option<String>> {
        use secret_service::{EncryptionType, blocking::SecretService};
        use std::collections::HashMap;
        let connection = SecretService::connect(EncryptionType::Dh).map_err(|_| failed())?;
        let mut found = connection
            .search_items(HashMap::from([
                ("xdg:schema", "org.freedesktop.Secret.Generic"),
                ("service", service),
                ("account", account),
            ]))
            .map_err(|_| failed())?;
        if found.locked.len() + found.unlocked.len() > 1 {
            return Err(failed());
        }
        if let Some(item) = found.locked.pop() {
            item.unlock().map_err(|_| failed())?;
            return String::from_utf8(item.get_secret().map_err(|_| failed())?)
                .map(Some)
                .map_err(|_| failed());
        }
        found
            .unlocked
            .pop()
            .map(|item| {
                String::from_utf8(item.get_secret().map_err(|_| failed())?).map_err(|_| failed())
            })
            .transpose()
    }
    fn write(&self, service: &str, account: &str, value: &str) -> Result<()> {
        use secret_service::{EncryptionType, blocking::SecretService};
        use std::collections::HashMap;
        let connection = SecretService::connect(EncryptionType::Dh).map_err(|_| failed())?;
        let attributes = HashMap::from([
            ("xdg:schema", "org.freedesktop.Secret.Generic"),
            ("service", service),
            ("account", account),
        ]);
        let mut found = connection
            .search_items(attributes.clone())
            .map_err(|_| failed())?;
        if found.locked.len() + found.unlocked.len() > 1 {
            return Err(failed());
        }
        if let Some(item) = found.locked.pop().or_else(|| found.unlocked.pop()) {
            item.unlock().map_err(|_| failed())?;
            item.set_secret(value.as_bytes(), "text/plain")
                .map_err(|_| failed())?;
        } else {
            let collection = connection.get_default_collection().map_err(|_| failed())?;
            collection.unlock().map_err(|_| failed())?;
            collection
                .create_item(
                    &format!("{service}/{account}"),
                    attributes,
                    value.as_bytes(),
                    true,
                    "text/plain",
                )
                .map_err(|_| failed())?;
        }
        if self.read(service, account)?.as_deref() != Some(value) {
            return Err(failed());
        }
        Ok(())
    }
}
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
impl Keyring for NativeKeyring {
    fn read(&self, _: &str, _: &str) -> Result<Option<String>> {
        Err(failed())
    }
    fn write(&self, _: &str, _: &str, _: &str) -> Result<()> {
        Err(failed())
    }
}
