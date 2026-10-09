// GRIDA-SEC-013 / GRIDA-SEC-014 — selected overrides precede lazy shared custody.
use crate::{
    error::{Error, Result},
    files,
    host::{self, Environment},
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::{self, IsTerminal, Write},
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;
use zeroize::{Zeroize, Zeroizing};
pub const PROVIDERS: [(&str, &str); 5] = [
    ("openrouter", "OPENROUTER_API_KEY"),
    ("vercel", "AI_GATEWAY_API_KEY"),
    ("fal", "FAL_KEY"),
    ("elevenlabs", "ELEVENLABS_API_KEY"),
    ("tripo", "TRIPO_API_KEY"),
];
fn failure(code: &str) -> Error {
    Error::new(
        code,
        match code {
            "invalid_credentials" => {
                "Provider key has an invalid format or is a placeholder. Check the provider key format in grida ai providers --help."
            }
            "cancelled" => "Provider credential input was cancelled.",
            _ => "Provider credential input could not be read.",
        },
    )
}
pub fn normalize(provider: &str, value: &str) -> Result<Zeroizing<String>> {
    grida_ai::normalize_key(provider, value)
        .map(Zeroizing::new)
        .map_err(|_| failure("invalid_credentials"))
}
pub struct Credentials {
    keys: BTreeMap<String, Zeroizing<String>>,
    sources: BTreeMap<String, &'static str>,
}
impl Credentials {
    pub async fn open(
        env: &Environment,
        selected: Option<&str>,
        stdin: bool,
        token: &CancellationToken,
    ) -> Result<Self> {
        if token.is_cancelled() {
            return Err(failure("cancelled"));
        }
        let slots: Vec<_> = PROVIDERS
            .iter()
            .filter(|(id, _)| selected.is_none_or(|s| s == *id))
            .copied()
            .collect();
        let mut owner = Self {
            keys: BTreeMap::new(),
            sources: BTreeMap::new(),
        };
        for (id, name) in &slots {
            if stdin && selected == Some(*id) {
                continue;
            }
            if let Some(value) = env.get(*name) {
                let key = normalize(
                    id,
                    value
                        .to_str()
                        .ok_or_else(|| failure("invalid_credentials"))?,
                )?;
                owner.keys.insert((*id).into(), key);
                owner.sources.insert((*id).into(), "environment");
            }
        }
        if stdin {
            let id = selected.ok_or_else(|| failure("invalid_credentials"))?;
            let key = read_key(id, token).await?;
            owner.keys.insert(id.into(), key);
            owner.sources.insert(id.into(), "stdin");
        }
        let missing: Vec<_> = slots
            .iter()
            .filter(|(id, _)| !owner.keys.contains_key(*id))
            .map(|(id, _)| (*id).to_owned())
            .collect();
        if !missing.is_empty() {
            let env = env.clone();
            let fetched = tokio::task::spawn_blocking(move || -> Result<Vec<(String, String)>> {
                let store = host::provider_store(&env)?;
                let mut found = vec![];
                for id in missing {
                    if let Some(key) = store.read(&id).map_err(host::provider_error)? {
                        found.push((id, key));
                    }
                }
                Ok(found)
            })
            .await
            .map_err(|_| failure("credentials_unavailable"))??;
            for (id, key) in fetched {
                let key = Zeroizing::new(key);
                owner.keys.insert(id.clone(), normalize(&id, &key)?);
                owner.sources.insert(id, "file");
            }
        }
        if token.is_cancelled() {
            return Err(failure("cancelled"));
        }
        Ok(owner)
    }
    pub fn key(&self, provider: &str) -> Option<&str> {
        self.keys.get(provider).map(|s| s.as_str())
    }
    pub fn status(&self) -> Vec<Value> {
        PROVIDERS.iter().map(|(id,name)|json!({"provider":id,"environment":name,"configured":self.keys.contains_key(*id),"source":self.sources.get(*id)})).collect()
    }
}
pub async fn read_key(provider: &str, token: &CancellationToken) -> Result<Zeroizing<String>> {
    let bytes = Zeroizing::new(
        files::read_bytes("-", true, 4096, token)
            .await
            .map_err(|e| {
                failure(match e.code {
                    "cancelled" => "cancelled",
                    "invalid_input" => "invalid_credentials",
                    _ => "credentials_unavailable",
                })
            })?,
    );
    normalize(provider, &String::from_utf8_lossy(&bytes))
}
pub async fn prompt(provider: &str, token: &CancellationToken) -> Result<Zeroizing<String>> {
    if !io::stdin().is_terminal() || !io::stderr().is_terminal() {
        return Err(Error::new(
            "interaction_required",
            "Use --key-stdin to configure a provider without an interactive terminal.",
        ));
    }
    let token = token.clone();
    let value = tokio::task::spawn_blocking(move || hidden_prompt(&token))
        .await
        .map_err(|_| failure("credentials_unavailable"))??;
    normalize(provider, &value)
}
fn hidden_prompt(token: &CancellationToken) -> Result<Zeroizing<String>> {
    use crossterm::{
        event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
        terminal,
    };
    struct Restore(bool);
    impl Drop for Restore {
        fn drop(&mut self) {
            if !self.0 {
                let _ = terminal::disable_raw_mode();
            }
            let _ = writeln!(io::stderr());
        }
    }
    let raw = terminal::is_raw_mode_enabled().map_err(|_| failure("credentials_unavailable"))?;
    terminal::enable_raw_mode().map_err(|_| failure("credentials_unavailable"))?;
    let _restore = Restore(raw);
    write!(
        io::stderr(),
        "API key (hidden; stored in plaintext with private permissions): "
    )
    .and_then(|_| io::stderr().flush())
    .map_err(|_| failure("credentials_unavailable"))?;
    let mut bytes = Zeroizing::new(String::new());
    let start = Instant::now();
    loop {
        if token.is_cancelled() {
            return Err(failure("cancelled"));
        }
        if start.elapsed() >= Duration::from_secs(30) {
            return Err(failure("credentials_unavailable"));
        }
        if !event::poll(Duration::from_millis(25))
            .map_err(|_| failure("credentials_unavailable"))?
        {
            continue;
        }
        if let Event::Key(key) = event::read().map_err(|_| failure("credentials_unavailable"))? {
            if key.kind == KeyEventKind::Release {
                continue;
            }
            match key.code {
                KeyCode::Char('c' | 'd') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                    return Err(failure("cancelled"));
                }
                KeyCode::Enter => return Ok(bytes),
                KeyCode::Backspace => {
                    if let Some(mut c) = bytes.pop() {
                        c.zeroize();
                    }
                }
                KeyCode::Char(c)
                    if (' '..='~').contains(&c)
                        && !key
                            .modifiers
                            .intersects(KeyModifiers::CONTROL | KeyModifiers::ALT)
                        && bytes.len() < 4096 =>
                {
                    bytes.push(c)
                }
                _ => return Err(failure("invalid_credentials")),
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn explicit_selected_key_never_opens_custody_or_other_slots() {
        let env = Environment::from([
            ("HOME".into(), "/does/not/exist".into()),
            ("FAL_KEY".into(), "fixture-key-id:fixture-key-secret".into()),
            ("OPENROUTER_API_KEY".into(), "invalid".into()),
        ]);
        let c = Credentials::open(&env, Some("fal"), false, &CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(c.key("fal"), Some("fixture-key-id:fixture-key-secret"));
        assert!(c.key("openrouter").is_none());
    }
    #[tokio::test]
    async fn malformed_explicit_key_never_falls_back() {
        let env = Environment::from([
            ("HOME".into(), "/does/not/exist".into()),
            ("FAL_KEY".into(), " ".into()),
        ]);
        assert_eq!(
            Credentials::open(&env, Some("fal"), false, &CancellationToken::new())
                .await
                .err()
                .unwrap()
                .value["code"],
            "invalid_credentials"
        );
    }
}
