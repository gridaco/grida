// GRIDA-SEC-010 — explicit registration authority, never token/discovery input.
use crate::{Error, Result};
use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub client_id: String,
    pub publishable_key: String,
    pub issuer: String,
    pub api_origin: String,
    pub redirect_uris: Vec<String>,
}

pub(crate) fn opaque(value: &str) -> bool {
    !value.is_empty()
        && value.encode_utf16().count() <= 16_384
        && !value.chars().any(|c| matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'))
}
fn port(value: &str) -> bool {
    !value.starts_with('0') && value.parse::<u16>().is_ok_and(|p| p > 0)
}
fn origin(value: &str) -> bool {
    let (https, authority) = if let Some(v) = value.strip_prefix("https://") {
        (true, v)
    } else if let Some(v) = value.strip_prefix("http://") {
        (false, v)
    } else {
        return false;
    };
    let (host, has_port) = match authority.rsplit_once(':') {
        Some((host, value)) if port(value) => (host, true),
        Some(_) => return false,
        None => (authority, false),
    };
    if !https {
        return host == "127.0.0.1" && has_port;
    }
    host.split('.').all(|label| {
        !label.is_empty()
            && label.as_bytes()[0].is_ascii_alphanumeric()
            && label.as_bytes()[label.len() - 1].is_ascii_alphanumeric()
            && label
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    })
}

impl Config {
    pub fn validate(&self) -> Result<()> {
        let key = self
            .publishable_key
            .strip_prefix("sb_publishable_")
            .unwrap_or("");
        let invalid = || Error::new("invalid_config");
        if !opaque(&self.client_id)
            || key.is_empty()
            || key.len() > 256
            || !key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            || !self.issuer.strip_suffix("/auth/v1").is_some_and(origin)
            || !origin(&self.api_origin)
            || self.issuer.starts_with("http:") != self.api_origin.starts_with("http:")
            || self.redirect_uris.is_empty()
            || self.redirect_uris.len() > 8
        {
            return Err(invalid());
        }
        let mut seen = std::collections::HashSet::new();
        for uri in &self.redirect_uris {
            if !seen.insert(uri) {
                return Err(invalid());
            }
            let Some(rest) = uri.strip_prefix("http://127.0.0.1:") else {
                return Err(invalid());
            };
            let Some((p, path)) = rest.split_once('/') else {
                return Err(invalid());
            };
            if !port(p)
                || path.is_empty()
                || path.contains("//")
                || path.starts_with('/')
                || !path
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'/' | b'_' | b'-'))
            {
                return Err(invalid());
            }
        }
        Ok(())
    }
}
