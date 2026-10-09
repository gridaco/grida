// GRIDA-SEC-010 / GRIDA-SEC-006 — shipped registration and isolated explicit local authority.
// GRIDA-GG: token — explicit native authority, no account/provider crossover.
use crate::error::{Error, Result};
use grida_auth::Config;
#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::{
    collections::BTreeMap,
    ffi::OsString,
    fs::OpenOptions,
    io::Read,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};
pub type Environment = BTreeMap<String, OsString>;
pub fn environment() -> Environment {
    std::env::vars_os()
        .filter_map(|(k, v)| k.into_string().ok().map(|k| (k, v)))
        .collect()
}
fn invalid() -> Error {
    Error::new(
        "invalid_config",
        "The CLI authentication configuration is invalid. Use an absolute GRIDA_HOME; local fixture configuration also requires an isolated home.",
    )
}
fn browser_error() -> Error {
    Error::new(
        "browser_failed",
        "The authorization browser could not be opened.",
    )
}
pub const CALLBACKS: [&str; 2] = [
    "http://127.0.0.1:55435/callback",
    "http://127.0.0.1:55436/callback",
];
pub fn registration() -> Config {
    Config {
        client_id: "ab2b3b01-a0a1-4d40-969c-b8fc177a2557".into(),
        publishable_key: "sb_publishable_dRc62vMF3jbqm2UD8cTGig_blvDStbc".into(),
        issuer: "https://mozagqllybnbytfcmvdh.supabase.co/auth/v1".into(),
        api_origin: "https://grida.co".into(),
        redirect_uris: CALLBACKS.map(String::from).to_vec(),
    }
}
pub struct Host {
    pub config: Config,
    pub home: PathBuf,
    browser_env: Environment,
}
fn user_home(env: &Environment) -> Result<PathBuf> {
    let name = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    env.get(name)
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .ok_or_else(invalid)
}
fn absolute(v: &std::ffi::OsStr) -> bool {
    Path::new(v).is_absolute() && !v.to_string_lossy().contains('\0')
}
pub fn canonical_path(path: &Path) -> std::io::Result<PathBuf> {
    let path = std::path::absolute(path)?;
    let mut existing = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                existing.pop();
            }
            other => existing.push(other.as_os_str()),
        }
    }
    let mut missing = vec![];
    loop {
        match existing.canonicalize() {
            Ok(mut p) => {
                for part in missing.iter().rev() {
                    p.push(part);
                }
                return Ok(p);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let name = existing.file_name().ok_or(e)?.to_owned();
                missing.push(name);
                existing.pop();
            }
            Err(e) => return Err(e),
        }
    }
}
impl Host {
    pub fn open(env: &Environment) -> Result<Self> {
        let local = env.get("GRIDA_CLI_LOCAL_CONFIG");
        let selected = env.get("GRIDA_HOME");
        if local.is_some_and(|p| !absolute(p))
            || selected.is_some_and(|p| !absolute(p))
            || (local.is_some() && selected.is_none())
        {
            return Err(invalid());
        }
        let user = user_home(env)?;
        let home = canonical_path(
            &selected
                .map(PathBuf::from)
                .unwrap_or_else(|| user.join(".grida")),
        )
        .map_err(|_| invalid())?;
        let normalize = |p: PathBuf| {
            if cfg!(target_os = "macos") {
                PathBuf::from(p.to_string_lossy().to_lowercase())
            } else {
                p
            }
        };
        let compared = normalize(home.clone());
        let ordinary = normalize(canonical_path(&user.join(".grida")).map_err(|_| invalid())?);
        let user = normalize(canonical_path(&user).map_err(|_| invalid())?);
        if compared.parent().is_none()
            || compared == user
            || (local.is_some() && compared.starts_with(ordinary))
        {
            return Err(invalid());
        }
        let config = if let Some(path) = local {
            local_registration(Path::new(path))?
        } else {
            registration()
        };
        config.validate().map_err(|_| invalid())?;
        let mut browser_env = Environment::from([("PATH".into(), "/usr/bin:/bin".into())]);
        for key in [
            "HOME",
            "USER",
            "LOGNAME",
            "LANG",
            "LC_ALL",
            "DISPLAY",
            "WAYLAND_DISPLAY",
            "XDG_RUNTIME_DIR",
            "XDG_CURRENT_DESKTOP",
            "XDG_SESSION_TYPE",
            "DBUS_SESSION_BUS_ADDRESS",
        ] {
            if let Some(v) = env.get(key) {
                browser_env.insert(key.into(), v.clone());
            }
        }
        Ok(Self {
            config,
            home,
            browser_env,
        })
    }
    pub fn open_browser(&self, value: &str) -> Result<()> {
        self.validate_url(value)?;
        let mut cmd = if cfg!(target_os = "macos") {
            let mut c = Command::new("/usr/bin/open");
            c.arg("--");
            c
        } else if cfg!(target_os = "linux") {
            Command::new("/usr/bin/xdg-open")
        } else {
            return Err(browser_error());
        };
        cmd.arg(value)
            .env_clear()
            .envs(&self.browser_env)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut child = cmd.spawn().map_err(|_| browser_error())?;
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(exit)) => {
                    return if exit.success() {
                        Ok(())
                    } else {
                        Err(browser_error())
                    };
                }
                Err(_) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(browser_error());
                }
                _ => {}
            }
            if start.elapsed() >= Duration::from_secs(10) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(browser_error());
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    pub fn validate_url(&self, value: &str) -> Result<()> {
        if value.encode_utf16().count() > 8192 || value.contains(['\r', '\n', '\0']) {
            return Err(browser_error());
        }
        let url = url::Url::parse(value).map_err(|_| browser_error())?;
        if url.as_str() != value
            || format!("{}{}", url.origin().ascii_serialization(), url.path())
                != format!("{}/oauth/authorize", self.config.issuer)
            || !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
        {
            return Err(browser_error());
        }
        Ok(())
    }
}
fn local_registration(path: &Path) -> Result<Config> {
    let result = (|| -> std::result::Result<Config, Box<dyn std::error::Error>> {
        let mut opts = OpenOptions::new();
        opts.read(true);
        #[cfg(unix)]
        opts.custom_flags(
            (rustix::fs::OFlags::NOFOLLOW | rustix::fs::OFlags::NONBLOCK).bits() as i32,
        );
        let file = opts.open(path)?;
        let meta = file.metadata()?;
        if !meta.is_file() || meta.len() == 0 || meta.len() > 8192 {
            return Err("file".into());
        }
        #[cfg(unix)]
        if meta.nlink() != 1
            || meta.mode() & 0o022 != 0
            || meta.uid() != rustix::process::getuid().as_raw()
        {
            return Err("permissions".into());
        }
        let mut bytes = vec![];
        file.take(8193).read_to_end(&mut bytes)?;
        if bytes.len() > 8192 {
            return Err("length".into());
        }
        let value: serde_json::Value = serde_json::from_slice(&bytes)?;
        let object = value.as_object().ok_or("object")?;
        if object.len() != 5
            || ![
                "apiOrigin",
                "clientId",
                "issuer",
                "publishableKey",
                "redirectUris",
            ]
            .iter()
            .all(|k| object.contains_key(*k))
        {
            return Err("fields".into());
        }
        let config: Config = serde_json::from_value(value)?;
        if config.client_id.is_empty()
            || config.client_id.len() > 256
            || !config
                .client_id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
            || config.issuer != "http://127.0.0.1:55431/auth/v1"
            || config.api_origin != "http://127.0.0.1:3041"
            || config.redirect_uris.is_empty()
            || config.redirect_uris.len() > 2
            || config
                .redirect_uris
                .iter()
                .any(|v| !CALLBACKS.contains(&v.as_str()))
            || config.redirect_uris.len() == 2 && config.redirect_uris[0] == config.redirect_uris[1]
        {
            return Err("registration".into());
        }
        Ok(config)
    })();
    result.map_err(|_| invalid())
}
pub fn provider_store(env: &Environment) -> Result<grida_auth::ProviderStore> {
    let user =
        user_home(env).map_err(|_| provider_error(grida_auth::Error::new("storage_failed")))?;
    let path = env
        .get("GRIDA_HOME")
        .filter(|p| absolute(p))
        .map(PathBuf::from)
        .unwrap_or_else(|| user.join(".grida"));
    let path = canonical_path(&path)
        .map_err(|_| provider_error(grida_auth::Error::new("storage_failed")))?;
    grida_auth::ProviderStore::new(path).map_err(provider_error)
}
pub fn provider_error(e: grida_auth::Error) -> Error {
    Error::new(
        e.code(),
        match e.code() {
            "unsupported_platform" => {
                "Stored provider credentials require macOS or Linux. Use an explicit environment key or --key-stdin for this invocation."
            }
            "migration_pending" | "migration_failed" => {
                "Desktop provider-key migration needs cleanup. Open the updated Desktop and retry a provider connection, or use an explicit environment key or --key-stdin."
            }
            "store_busy" => {
                "Provider credentials are busy in another process. Retry after it finishes."
            }
            "invalid_store" => {
                "credentials.toml is not a valid Grida provider credential file. Check its TOML syntax and required fields; run grida ai providers --help for the format. No alternate stored key was selected."
            }
            "unsupported_version" => {
                "credentials.toml uses an unsupported format version. Update Grida to a compatible version; do not change the version field to bypass this check."
            }
            "invalid_input" => {
                "Invalid provider credential input or storage location. Check the provider name and use an absolute GRIDA_HOME if set."
            }
            _ => {
                "Cannot access or lock provider credential storage. Check filesystem or sandbox access, ownership and private permissions for the Grida home; run grida ai providers --help for its location. No alternate stored key was selected."
            }
        },
    )
}
#[cfg(test)]
#[path = "host_tests.rs"]
mod tests;
