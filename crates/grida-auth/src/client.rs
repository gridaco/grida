// GRIDA-SEC-010 — fixed registration, rotating custody, and local-session revoke.
use crate::{
    Backend, Config, Error, Identity, Logout, OrganizationsPage, Result, Status, StorageInfo,
    config::opaque,
    custody::{Session, Store, Transaction},
    wire,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use oauth2::{CsrfToken, PkceCodeChallenge};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use zeroize::{Zeroize, Zeroizing};

/// Secret-bearing transport input. Implementations must not log requests.
/// Send exactly once, reject redirects, enforce a bounded deadline and response
/// size, and never add ambient cookies or credentials. Auth owns all URL choices.
pub struct Request {
    pub url: String,
    pub method: &'static str,
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
    pub response_empty: bool,
}
impl Drop for Request {
    fn drop(&mut self) {
        for value in self.headers.values_mut() {
            value.zeroize();
        }
        self.body.zeroize();
    }
}
pub struct Response {
    pub status: u16,
    pub body: Value,
}
pub trait Transport: Send + Sync {
    fn send(&self, request: Request) -> Result<Response>;
}

/// Secret-bearing, memory-only GG handoff. Intentionally not Debug or Serialize.
pub struct GgGrant {
    token: Zeroizing<String>,
    pub organization_id: i64,
    pub organization_name: String,
    pub expires_at: String,
}
impl GgGrant {
    pub fn token(&self) -> &str {
        &self.token
    }
}

pub struct AuthClient {
    config: Config,
    store: Store,
    transport: Arc<dyn Transport>,
    generation: AtomicU64,
    login_active: AtomicBool,
    refresh_epoch: AtomicU64,
    refresh_result: Mutex<Option<Result<Status>>>,
}
struct LoginGuard<'a>(&'a AtomicBool);
impl Drop for LoginGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
struct Tokens {
    access: Zeroizing<String>,
    refresh: Zeroizing<String>,
    expires: i64,
}
fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn failure(code: &'static str) -> Error {
    Error::new(code)
}

impl AuthClient {
    pub fn open(
        config: Config,
        home: PathBuf,
        storage: Option<Backend>,
        transport: Arc<dyn Transport>,
    ) -> Result<Self> {
        let store = Store::open(&config, home, storage)?;
        Ok(Self {
            config,
            store,
            transport,
            generation: AtomicU64::new(0),
            login_active: AtomicBool::new(false),
            refresh_epoch: AtomicU64::new(0),
            refresh_result: Mutex::new(None),
        })
    }
    pub fn storage_info(&self) -> Result<StorageInfo> {
        self.store.info()
    }
    pub fn migrate(&self, backend: Backend) -> Result<StorageInfo> {
        self.store.migrate(backend)
    }
    pub fn status(&self) -> Result<Status> {
        self.store
            .exclusive(|tx| Ok(Self::view(tx.read()?.session.as_ref())))
    }
    pub fn cancel_login(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
    }
    fn check(&self, generation: u64) -> Result<()> {
        if self.generation.load(Ordering::SeqCst) != generation {
            Err(failure("cancelled"))
        } else {
            Ok(())
        }
    }
    fn view(session: Option<&Session>) -> Status {
        match session {
            None => Status::SignedOut,
            Some(s) if s.expires_at <= now() + 30_000 => Status::RefreshNeeded {
                identity: s.identity.clone(),
                expires_at: s.expires_at,
            },
            Some(s) => Status::SignedIn {
                identity: s.identity.clone(),
                expires_at: s.expires_at,
            },
        }
    }
    fn request(&self, request: Request) -> Result<Response> {
        self.transport.send(request).map_err(|error| {
            failure(if error.code() == "invalid_response" {
                "invalid_response"
            } else {
                "unavailable"
            })
        })
    }
    fn bearer(
        &self,
        token: &str,
        path: &str,
        method: &'static str,
        body: Option<String>,
    ) -> Result<Response> {
        let mut headers = BTreeMap::from([("authorization".into(), format!("Bearer {token}"))]);
        if body.is_some() {
            headers.insert("content-type".into(), "application/json".into());
        }
        self.request(Request {
            url: format!("{}{path}", self.config.api_origin),
            method,
            headers,
            body,
            response_empty: false,
        })
    }
    fn identity(&self, token: &str) -> Result<Identity> {
        let response = self.bearer(token, "/api/v1/auth/me", "GET", None)?;
        if response.status != 200 {
            return Err(failure(if matches!(response.status, 401 | 403) {
                "token_rejected"
            } else {
                "unavailable"
            }));
        }
        wire::identity(response.body)
    }
    fn exchange(&self, fields: &[(&str, &str)], fallback: Option<&str>) -> Result<Tokens> {
        let body = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(fields.iter().copied())
            .finish();
        let response = self.request(Request {
            url: format!("{}/oauth/token", self.config.issuer),
            method: "POST",
            headers: BTreeMap::from([(
                "content-type".into(),
                "application/x-www-form-urlencoded".into(),
            )]),
            body: Some(body),
            response_empty: false,
        })?;
        if response.status != 200 {
            return Err(failure(if (400..500).contains(&response.status) {
                "token_rejected"
            } else {
                "unavailable"
            }));
        }
        let body = response.body;
        let access = body
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|s| opaque(s))
            .ok_or_else(wire::invalid)?;
        let refresh = match body.get("refresh_token") {
            None | Some(Value::Null) => fallback,
            Some(v) => v.as_str(),
        }
        .filter(|s| opaque(s))
        .ok_or_else(wire::invalid)?;
        let expires = body
            .get("expires_in")
            .and_then(wire::integer)
            .filter(|n| wire::positive(*n))
            .and_then(|n| n.checked_mul(1000))
            .and_then(|n| n.checked_add(now()))
            .filter(|n| *n <= wire::MAX_SAFE)
            .ok_or_else(wire::invalid)?;
        if !body
            .get("token_type")
            .and_then(Value::as_str)
            .is_some_and(|t| t.eq_ignore_ascii_case("bearer"))
        {
            return Err(wire::invalid());
        }
        Ok(Tokens {
            access: Zeroizing::new(access.into()),
            refresh: Zeroizing::new(refresh.into()),
            expires,
        })
    }
    fn rotate(
        &self,
        tx: &mut Transaction<'_>,
        generation: u64,
        previous: Session,
    ) -> Result<Session> {
        self.check(generation)?;
        let tokens = self.exchange(
            &[
                ("grant_type", "refresh_token"),
                ("client_id", &self.config.client_id),
                ("refresh_token", &previous.refresh_token),
            ],
            Some(&previous.refresh_token),
        )?;
        let mut rotated = previous.clone();
        rotated.refresh_token = tokens.refresh.to_string();
        tx.write(Some(rotated.clone()))?;
        self.check(generation)?;
        let identity = self.identity(&tokens.access)?;
        self.check(generation)?;
        if identity.id != previous.identity.id {
            return Err(failure("token_rejected"));
        }
        rotated.access_token = tokens.access.to_string();
        rotated.expires_at = tokens.expires;
        rotated.identity = identity;
        tx.write(Some(rotated.clone()))?;
        self.check(generation)?;
        Ok(rotated)
    }
    fn authenticated<T>(&self, operation: impl FnOnce(&Session) -> Result<T>) -> Result<T> {
        if self.login_active.load(Ordering::SeqCst) {
            return Err(failure("session_busy"));
        }
        let generation = self.generation.load(Ordering::SeqCst);
        self.store.exclusive(|tx| {
            self.check(generation)?;
            let mut session = tx.read()?.session.ok_or_else(|| failure("signed_out"))?;
            if session.expires_at <= now() + 30_000 {
                session = self.rotate(tx, generation, session)?;
            }
            self.check(generation)?;
            let result = operation(&session)?;
            self.check(generation)?;
            Ok(result)
        })
    }
    pub fn refresh(&self) -> Result<Status> {
        let epoch = self.refresh_epoch.load(Ordering::SeqCst);
        let mut last = self
            .refresh_result
            .lock()
            .map_err(|_| failure("custody_failed"))?;
        if self.refresh_epoch.load(Ordering::SeqCst) != epoch {
            return last.clone().ok_or_else(|| failure("custody_failed"))?;
        }
        let result = self.refresh_once();
        *last = Some(result.clone());
        self.refresh_epoch.fetch_add(1, Ordering::SeqCst);
        result
    }
    fn refresh_once(&self) -> Result<Status> {
        if self.login_active.load(Ordering::SeqCst) {
            return Err(failure("session_busy"));
        }
        let generation = self.generation.load(Ordering::SeqCst);
        self.store.exclusive(|tx| {
            let previous = tx.read()?.session.ok_or_else(|| failure("signed_out"))?;
            Ok(Self::view(Some(&self.rotate(tx, generation, previous)?)))
        })
    }
    pub fn verify(&self) -> Result<Status> {
        if self.login_active.load(Ordering::SeqCst) {
            return Err(failure("session_busy"));
        }
        let generation = self.generation.load(Ordering::SeqCst);
        self.store.exclusive(|tx| {
            self.check(generation)?;
            let mut session = tx.read()?.session.ok_or_else(|| failure("signed_out"))?;
            if session.expires_at <= now() + 30_000 {
                session = self.rotate(tx, generation, session)?;
            }
            let identity = self.identity(&session.access_token)?;
            self.check(generation)?;
            if identity.id != session.identity.id {
                return Err(failure("token_rejected"));
            }
            session.identity = identity;
            tx.write(Some(session.clone()))?;
            self.check(generation)?;
            Ok(Self::view(Some(&session)))
        })
    }
    pub fn organizations(&self, after: Option<i64>) -> Result<OrganizationsPage> {
        if after.is_some_and(|id| !wire::positive(id)) {
            return Err(failure("invalid_input"));
        }
        self.authenticated(|s| {
            let path = format!(
                "/api/v1/account/organizations{}",
                after.map(|n| format!("?after={n}")).unwrap_or_default()
            );
            let response = self.bearer(&s.access_token, &path, "GET", None)?;
            account_status(response.status)?;
            wire::organizations(response.body, after)
        })
    }
    pub fn credits(&self, organization_id: i64) -> Result<Value> {
        if !wire::positive(organization_id) {
            return Err(failure("invalid_input"));
        }
        self.authenticated(|s| {
            let response = self.bearer(
                &s.access_token,
                &format!("/api/v1/account/credits?organization_id={organization_id}"),
                "GET",
                None,
            )?;
            account_status(response.status)?;
            wire::credits(response.body, organization_id)
        })
    }
    pub fn request_gg(&self, organization_id: i64) -> Result<GgGrant> {
        self.request_gg_with(organization_id, |grant| {
            Ok(GgGrant {
                token: Zeroizing::new(grant.token().into()),
                organization_id: grant.organization_id,
                organization_name: grant.organization_name.clone(),
                expires_at: grant.expires_at.clone(),
            })
        })
    }
    /// Accept a grant synchronously under the same custody and generation fence
    /// as its mint. The sink must be bounded, memory-only and must not reenter auth.
    pub fn request_gg_with<T>(
        &self,
        organization_id: i64,
        accept: impl FnOnce(&GgGrant) -> Result<T>,
    ) -> Result<T> {
        let generation = self.generation.load(Ordering::SeqCst);
        if !wire::positive(organization_id) {
            return Err(failure("invalid_input"));
        }
        self.authenticated(|s| {
            let response = self.bearer(
                &s.access_token,
                "/api/v1/auth/gg",
                "POST",
                Some(json!({"organization_id":organization_id}).to_string()),
            )?;
            if response.status == 429 {
                return Err(failure("rate_limited"));
            }
            account_status(response.status)?;
            let body = response.body;
            let token = body
                .get("token")
                .and_then(Value::as_str)
                .filter(|t| {
                    compact(t) && opaque(t) && *t != s.access_token && *t != s.refresh_token
                })
                .ok_or_else(wire::invalid)?;
            let org = body.get("organization").ok_or_else(wire::invalid)?;
            let name = org
                .get("name")
                .and_then(Value::as_str)
                .filter(|n| {
                    !n.is_empty()
                        && n.len() <= 39
                        && !n.starts_with('-')
                        && !n.ends_with('-')
                        && !n.contains("--")
                        && n.bytes()
                            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                })
                .ok_or_else(wire::invalid)?;
            let expires_at = body
                .get("expires_at")
                .and_then(Value::as_str)
                .ok_or_else(wire::invalid)?;
            let expiry = wire::timestamp(expires_at).ok_or_else(wire::invalid)?;
            if org.get("id").and_then(wire::integer) != Some(organization_id)
                || expiry <= now()
                || expiry > now() + 16 * 60_000
            {
                return Err(wire::invalid());
            }
            let grant = GgGrant {
                token: Zeroizing::new(token.into()),
                organization_id,
                organization_name: name.into(),
                expires_at: expires_at.into(),
            };
            if wire::timestamp(&grant.expires_at).is_none_or(|expiry| expiry <= now()) {
                return Err(failure("invalid_response"));
            }
            self.check(generation)?;
            accept(&grant).map_err(|_| failure("gg_handoff_failed"))
        })
    }
    pub fn logout(&self) -> Result<Logout> {
        self.generation.fetch_add(1, Ordering::SeqCst);
        let captured = self.store.exclusive(|tx| {
            let session = tx.read()?.session;
            tx.write(None)?;
            Ok(session)
        })?;
        let revocation = if let Some(session) = captured {
            if self.revoke(&session).is_ok() {
                "confirmed"
            } else {
                "unconfirmed"
            }
        } else {
            "not-needed"
        };
        Ok(Logout {
            state: "signed-out",
            revocation,
        })
    }
    fn revoke(&self, session: &Session) -> Result<()> {
        let (session_id, expiry) = self.logout_target(&session.access_token, &session.identity)?;
        let mut access = Zeroizing::new(session.access_token.clone());
        if session.expires_at.min(expiry) <= now() + 30_000 {
            let tokens = self.exchange(
                &[
                    ("grant_type", "refresh_token"),
                    ("client_id", &self.config.client_id),
                    ("refresh_token", &session.refresh_token),
                ],
                Some(&session.refresh_token),
            )?;
            let (renewed, expires) = self.logout_target(&tokens.access, &session.identity)?;
            if renewed != session_id || expires <= now() {
                return Err(failure("token_rejected"));
            }
            access = tokens.access;
        }
        if self.identity(&access)?.id != session.identity.id {
            return Err(failure("token_rejected"));
        }
        let response = self.request(Request {
            url: format!("{}/logout?scope=local", self.config.issuer),
            method: "POST",
            headers: BTreeMap::from([
                ("authorization".into(), format!("Bearer {}", *access)),
                ("apikey".into(), self.config.publishable_key.clone()),
            ]),
            body: None,
            response_empty: true,
        })?;
        if matches!(response.status, 200 | 204) {
            Ok(())
        } else {
            Err(failure("unavailable"))
        }
    }
    fn logout_target(&self, token: &str, identity: &Identity) -> Result<(uuid::Uuid, i64)> {
        let invalid = || failure("token_rejected");
        if !compact(token) || !opaque(token) {
            return Err(invalid());
        }
        let bytes = URL_SAFE_NO_PAD
            .decode(token.split('.').nth(1).ok_or_else(invalid)?)
            .map_err(|_| invalid())?;
        let v: Value = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
        if v.get("iss").and_then(Value::as_str) != Some(&self.config.issuer)
            || v.get("aud").and_then(Value::as_str) != Some("authenticated")
            || v.get("client_id").and_then(Value::as_str) != Some(&self.config.client_id)
            || v.get("sub").and_then(Value::as_str) != Some(&identity.id)
        {
            return Err(invalid());
        }
        let id = v
            .get("session_id")
            .and_then(Value::as_str)
            .filter(|s| s.len() == 36)
            .and_then(|s| uuid::Uuid::parse_str(s).ok())
            .filter(|u| !u.is_nil())
            .ok_or_else(invalid)?;
        let expiry = v
            .get("exp")
            .and_then(wire::integer)
            .filter(|n| wire::positive(*n))
            .and_then(|n| n.checked_mul(1000))
            .filter(|n| *n <= wire::MAX_SAFE)
            .ok_or_else(invalid)?;
        Ok((id, expiry))
    }
    /// Binds a registered loopback listener before opening the browser. The host
    /// should keep the blocking operation alive through cancellation and cleanup.
    pub fn login(
        &self,
        open_browser: impl FnOnce(&str) -> Result<()>,
        cancelled: &AtomicBool,
    ) -> Result<Status> {
        if self
            .login_active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(failure("login_in_progress"));
        }
        let _guard = LoginGuard(&self.login_active);
        let generation = self.generation.load(Ordering::SeqCst);
        let revision = self.store.exclusive(|tx| Ok(tx.read()?.revision))?;
        let (listener, redirect) = self
            .config
            .redirect_uris
            .iter()
            .find_map(|uri| {
                let parsed = url::Url::parse(uri).ok()?;
                TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, parsed.port()?))
                    .ok()
                    .map(|l| (l, uri.clone()))
            })
            .ok_or_else(|| failure("callback_unavailable"))?;
        listener
            .set_nonblocking(true)
            .map_err(|_| failure("callback_unavailable"))?;
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let state = CsrfToken::new_random();
        let mut authorization = url::Url::parse(&format!("{}/oauth/authorize", self.config.issuer))
            .map_err(|_| failure("invalid_config"))?;
        authorization.query_pairs_mut().extend_pairs([
            ("client_id", self.config.client_id.as_str()),
            ("response_type", "code"),
            ("redirect_uri", &redirect),
            ("scope", "email profile"),
            ("state", state.secret()),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
        ]);
        if cancelled.load(Ordering::SeqCst) {
            return Err(failure("cancelled"));
        }
        self.check(generation)?;
        open_browser(authorization.as_str()).map_err(|_| failure("browser_failed"))?;
        let code = self.callback(&listener, &redirect, state.secret(), generation, cancelled)?;
        drop(listener);
        let tokens = self.exchange(
            &[
                ("grant_type", "authorization_code"),
                ("client_id", &self.config.client_id),
                ("code", &code),
                ("redirect_uri", &redirect),
                ("code_verifier", verifier.secret()),
            ],
            None,
        )?;
        self.check(generation)?;
        if cancelled.load(Ordering::SeqCst) {
            return Err(failure("cancelled"));
        }
        let identity = self.identity(&tokens.access)?;
        let session = Session {
            issuer: self.config.issuer.clone(),
            client_id: self.config.client_id.clone(),
            api_origin: self.config.api_origin.clone(),
            access_token: tokens.access.to_string(),
            refresh_token: tokens.refresh.to_string(),
            expires_at: tokens.expires,
            identity,
        };
        self.store.exclusive(|tx| {
            self.check(generation)?;
            if cancelled.load(Ordering::SeqCst) {
                return Err(failure("cancelled"));
            }
            let previous = tx.read()?;
            if previous.revision != revision {
                return Err(failure("session_changed"));
            }
            tx.write(Some(session.clone()))?;
            if self.check(generation).is_err() || cancelled.load(Ordering::SeqCst) {
                tx.write(previous.session)?;
                return Err(failure("cancelled"));
            }
            Ok(Self::view(Some(&session)))
        })
    }
    fn callback(
        &self,
        listener: &TcpListener,
        redirect: &str,
        state: &str,
        generation: u64,
        cancelled: &AtomicBool,
    ) -> Result<Zeroizing<String>> {
        let deadline = Instant::now() + Duration::from_secs(120);
        while Instant::now() < deadline {
            self.check(generation)?;
            if cancelled.load(Ordering::SeqCst) {
                return Err(failure("cancelled"));
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    if let Some(result) = callback_request(
                        &mut stream,
                        redirect,
                        state,
                        &self.config.issuer,
                        deadline,
                        || {
                            self.check(generation)?;
                            if cancelled.load(Ordering::SeqCst) {
                                return Err(failure("cancelled"));
                            }
                            Ok(())
                        },
                    ) {
                        return result.map(Zeroizing::new);
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(10))
                }
                Err(_) => return Err(failure("callback_unavailable")),
            }
        }
        Err(failure("callback_timeout"))
    }
}

fn account_status(status: u16) -> Result<()> {
    if status == 200 {
        Ok(())
    } else {
        Err(failure(match status {
            401 => "token_rejected",
            403 => "forbidden",
            _ => "unavailable",
        }))
    }
}
fn compact(token: &str) -> bool {
    let parts: Vec<_> = token.split('.').collect();
    parts.len() == 3
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        })
}

fn callback_request(
    stream: &mut TcpStream,
    redirect: &str,
    state: &str,
    issuer: &str,
    deadline: Instant,
    check: impl Fn() -> Result<()>,
) -> Option<Result<String>> {
    // Darwin accepts inherit the listener's nonblocking flag. This reader uses
    // bounded blocking I/O; otherwise a delayed first byte looks like a failed
    // request and resets a valid callback before the browser sends its headers.
    if stream.set_nonblocking(false).is_err() {
        return Some(Err(failure("callback_unavailable")));
    }
    let _ = stream.set_write_timeout(Some(Duration::from_millis(250)));
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 1024];
    while bytes.len() < 8192 && !bytes.windows(4).any(|w| w == b"\r\n\r\n") {
        if let Err(error) = check() {
            return Some(Err(error));
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Some(Err(failure("callback_timeout")));
        }
        // A per-read timeout alone lets a trickling peer outlive the ceremony
        // deadline and delay cancellation while this socket is read.
        if stream
            .set_read_timeout(Some(Duration::from_millis(250).min(remaining)))
            .is_err()
        {
            return Some(Err(failure("callback_unavailable")));
        }
        match stream.read(&mut chunk) {
            Ok(0) => return None,
            Ok(n) => bytes.extend_from_slice(&chunk[..n]),
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                if let Err(error) = check() {
                    return Some(Err(error));
                }
                if Instant::now() >= deadline {
                    return Some(Err(failure("callback_timeout")));
                }
                return None;
            }
            Err(_) => return None,
        }
    }
    if let Err(error) = check() {
        return Some(Err(error));
    }
    if Instant::now() >= deadline {
        return Some(Err(failure("callback_timeout")));
    }
    let reject = |stream: &mut TcpStream| {
        let _ = stream.write_all(
            b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
        );
    };
    if bytes.len() > 8192 || !bytes.windows(4).any(|w| w == b"\r\n\r\n") {
        reject(stream);
        return None;
    }
    let Ok(raw) = std::str::from_utf8(&bytes) else {
        reject(stream);
        return None;
    };
    let mut lines = raw.split("\r\n");
    let first: Vec<_> = lines.next()?.split(' ').collect();
    let Ok(expected) = url::Url::parse(redirect) else {
        return Some(Err(failure("invalid_config")));
    };
    if first.len() != 3
        || first[0] != "GET"
        || first[1].split('?').next() != Some(expected.path())
        || first[1].contains('#')
        || !matches!(first[2], "HTTP/1.0" | "HTTP/1.1")
    {
        reject(stream);
        return None;
    }
    let headers: Vec<_> = lines
        .take_while(|l| !l.is_empty())
        .filter_map(|line| line.split_once(':'))
        .collect();
    if headers
        .iter()
        .any(|(name, _)| name.eq_ignore_ascii_case("origin"))
    {
        reject(stream);
        return None;
    }
    let hosts: Vec<_> = headers
        .into_iter()
        .filter(|(name, _)| name.eq_ignore_ascii_case("host"))
        .map(|(_, v)| v.trim())
        .collect();
    let authority = format!("127.0.0.1:{}", expected.port()?);
    if hosts.len() != 1 || hosts[0] != authority {
        reject(stream);
        return None;
    }
    let Ok(actual) = url::Url::parse(&format!("http://{authority}{}", first[1])) else {
        reject(stream);
        return None;
    };
    if actual.path() != expected.path() || actual.fragment().is_some() {
        reject(stream);
        return None;
    }
    let mut params = BTreeMap::new();
    let mut duplicate = false;
    for (k, v) in actual.query_pairs() {
        if params.insert(k.into_owned(), v.into_owned()).is_some() {
            duplicate = true;
        }
    }
    if duplicate
        || params.keys().any(|key| {
            !matches!(
                key.as_str(),
                "state" | "code" | "error" | "error_description" | "error_uri" | "iss"
            )
        })
    {
        reject(stream);
        return None;
    }
    if !bool::from(
        params
            .get("state")
            .map(String::as_bytes)
            .unwrap_or_default()
            .ct_eq(state.as_bytes()),
    ) {
        reject(stream);
        return None;
    }
    if params.contains_key("code") == params.contains_key("error")
        || params
            .get("code")
            .is_some_and(|code| !opaque(code) || code.encode_utf16().count() > 4096)
        || params.get("error").is_some_and(|error| {
            error.is_empty()
                || error.len() > 128
                || !error.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')
        })
    {
        reject(stream);
        return None;
    }
    let result = if params.get("iss").is_some_and(|s| s != issuer) {
        Err(failure("invalid_callback"))
    } else if let Some(error) = params.get("error") {
        Err(failure(if error == "access_denied" {
            "access_denied"
        } else {
            "authorization_failed"
        }))
    } else {
        params
            .remove("code")
            .filter(|s| opaque(s))
            .ok_or_else(|| failure("invalid_callback"))
    };
    let body = "You can return to Grida. This window may be closed.";
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\n\r\n{body}",
        body.len()
    );
    Some(result)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::Mutex;
    struct Script(Mutex<Vec<(String, Response)>>);
    impl Transport for Script {
        fn send(&self, request: Request) -> Result<Response> {
            let (expected, response) = self.0.lock().unwrap().remove(0);
            assert!(request.url.ends_with(&expected), "unexpected endpoint");
            assert!(!request.headers.contains_key("cookie"));
            Ok(response)
        }
    }
    fn config() -> Config {
        Config {
            client_id: "synthetic-cli".into(),
            publishable_key: "sb_publishable_synthetic".into(),
            issuer: "https://identity.example/auth/v1".into(),
            api_origin: "https://api.example".into(),
            redirect_uris: vec!["http://127.0.0.1:47192/callback".into()],
        }
    }
    fn session(config: &Config) -> Session {
        Session {
            issuer: config.issuer.clone(),
            client_id: config.client_id.clone(),
            api_origin: config.api_origin.clone(),
            access_token: "synthetic-old-access".into(),
            refresh_token: "synthetic-old-refresh".into(),
            expires_at: now() - 1000,
            identity: Identity {
                id: "synthetic-user".into(),
                email: None,
                display_name: None,
            },
        }
    }
    fn client(responses: Vec<(&str, u16, Value)>) -> (tempfile::TempDir, AuthClient, Arc<Script>) {
        let temp = tempfile::tempdir().unwrap();
        let home = std::fs::canonicalize(temp.path()).unwrap();
        let script = Arc::new(Script(Mutex::new(
            responses
                .into_iter()
                .map(|(url, status, body)| (url.into(), Response { status, body }))
                .collect(),
        )));
        let client = AuthClient::open(config(), home, Some(Backend::File), script.clone()).unwrap();
        (temp, client, script)
    }
    fn tokens() -> Value {
        json!({"access_token":"synthetic-new-access","refresh_token":"synthetic-new-refresh","token_type":"Bearer","expires_in":3600})
    }
    fn identity() -> Value {
        json!({"id":"synthetic-user","email":null,"display_name":"Example","untrusted":"discard"})
    }
    #[test]
    fn transport_preserves_only_the_safe_invalid_response_classification() {
        struct Rejected(&'static str);
        impl Transport for Rejected {
            fn send(&self, _: Request) -> Result<Response> {
                Err(failure(self.0))
            }
        }
        for (code, expected) in [
            ("invalid_response", "invalid_response"),
            ("unsafe_native_diagnostic", "unavailable"),
        ] {
            let temp = tempfile::tempdir().unwrap();
            let client = AuthClient::open(
                config(),
                std::fs::canonicalize(temp.path()).unwrap(),
                Some(Backend::File),
                Arc::new(Rejected(code)),
            )
            .unwrap();
            let error = client
                .request(Request {
                    url: "https://identity.example/auth/v1/oauth/token".into(),
                    method: "POST",
                    headers: BTreeMap::new(),
                    body: None,
                    response_empty: false,
                })
                .err()
                .unwrap();
            assert_eq!(error.code(), expected);
        }
    }
    #[test]
    fn accepted_rotation_survives_failed_identity() {
        let (_temp, client, _) = client(vec![
            ("/oauth/token", 200, tokens()),
            ("/api/v1/auth/me", 503, Value::Null),
        ]);
        client
            .store
            .exclusive(|tx| tx.write(Some(session(&client.config))))
            .unwrap();
        assert_eq!(client.refresh().unwrap_err().code(), "unavailable");
        let saved = client
            .store
            .exclusive(|tx| tx.read())
            .unwrap()
            .session
            .unwrap();
        assert_eq!(saved.refresh_token, "synthetic-new-refresh");
        assert_eq!(saved.access_token, "synthetic-old-access");
        assert!(matches!(
            client.status().unwrap(),
            Status::RefreshNeeded { .. }
        ));
    }
    #[test]
    fn protected_request_uses_rotated_bearer_and_safe_projection() {
        let (_temp, client, script) = client(vec![
            ("/oauth/token", 200, tokens()),
            ("/api/v1/auth/me", 200, identity()),
            (
                "/api/v1/account/organizations",
                200,
                json!({"organizations":[{"id":1,"name":"example","display_name":"Example","token":"discard"}],"next_cursor":null}),
            ),
        ]);
        client
            .store
            .exclusive(|tx| tx.write(Some(session(&client.config))))
            .unwrap();
        let page = client.organizations(None).unwrap();
        assert_eq!(page.organizations[0].id, 1);
        assert!(!serde_json::to_string(&page).unwrap().contains("token"));
        assert!(script.0.lock().unwrap().is_empty());
        assert!(matches!(client.status().unwrap(), Status::SignedIn { .. }));
    }
    #[test]
    fn status_never_uses_network_and_empty_logout_advances_revision() {
        let (_temp, client, _) = client(vec![]);
        let revision = client
            .store
            .exclusive(|tx| Ok(tx.read()?.revision))
            .unwrap();
        assert_eq!(client.status().unwrap(), Status::SignedOut);
        assert_eq!(client.logout().unwrap().revocation, "not-needed");
        assert_ne!(
            client
                .store
                .exclusive(|tx| Ok(tx.read()?.revision))
                .unwrap(),
            revision
        );
    }
    #[test]
    fn malformed_logout_token_clears_without_remote_fallback() {
        let (_temp, client, _) = client(vec![]);
        client
            .store
            .exclusive(|tx| tx.write(Some(session(&client.config))))
            .unwrap();
        assert_eq!(client.logout().unwrap().revocation, "unconfirmed");
        assert_eq!(client.status().unwrap(), Status::SignedOut);
    }
    #[test]
    fn logout_with_bound_session_uses_only_local_revoke() {
        let (_temp, client, script) = client(vec![
            ("/api/v1/auth/me", 200, identity()),
            ("/logout?scope=local", 204, Value::Null),
        ]);
        let mut s = session(&client.config);
        s.expires_at = now() + 3_600_000;
        let payload = json!({"iss":client.config.issuer,"aud":"authenticated","client_id":client.config.client_id,"sub":s.identity.id,"session_id":"712e1a6a-dd6d-481f-8eb1-a8e0cbd242a5","exp":s.expires_at/1000});
        s.access_token = format!("e30.{}.c2ln", URL_SAFE_NO_PAD.encode(payload.to_string()));
        client.store.exclusive(|tx| tx.write(Some(s))).unwrap();
        assert_eq!(client.logout().unwrap().revocation, "confirmed");
        assert!(script.0.lock().unwrap().is_empty());
    }
    #[test]
    fn second_client_observes_live_custody() {
        let (temp, first, script) = client(vec![]);
        let second = AuthClient::open(
            config(),
            std::fs::canonicalize(temp.path()).unwrap(),
            Some(Backend::File),
            script,
        )
        .unwrap();
        first
            .store
            .exclusive(|tx| tx.write(Some(session(&first.config))))
            .unwrap();
        assert!(matches!(
            second.status().unwrap(),
            Status::RefreshNeeded { .. }
        ));
        first.logout().unwrap();
        assert_eq!(second.status().unwrap(), Status::SignedOut);
    }
    #[test]
    fn login_round_trip_binds_pkce_state_and_revision() {
        let (_temp, mut client, _) = client(vec![
            ("/oauth/token", 200, tokens()),
            ("/api/v1/auth/me", 200, identity()),
        ]);
        let available = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = available.local_addr().unwrap().port();
        drop(available);
        client.config.redirect_uris = vec![format!("http://127.0.0.1:{port}/callback")];
        let result = client.login(|url| {
            let url = url::Url::parse(url).unwrap(); let values: BTreeMap<_,_> = url.query_pairs().collect();
            assert_eq!(values.get("code_challenge_method").unwrap(), "S256");
            assert_eq!(values.get("scope").unwrap(), "email profile");
            let state = values.get("state").unwrap().to_string();
            std::thread::spawn(move || { let mut socket = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST,port)).unwrap(); write!(socket,"GET /callback?code=synthetic-code&state={state} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n").unwrap(); let mut response = String::new();socket.read_to_string(&mut response).unwrap();assert!(response.starts_with("HTTP/1.1 200")); });
            Ok(())
        }, &AtomicBool::new(false)).unwrap();
        assert!(matches!(result, Status::SignedIn { .. }));
    }
    #[test]
    fn callback_rejects_host_and_duplicate_parameters() {
        fn attempt(request: String) -> Option<Result<String>> {
            let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
            let port = listener.local_addr().unwrap().port();
            let request = request.replace("PORT", &port.to_string());
            let writer = std::thread::spawn(move || {
                let mut stream = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)).unwrap();
                stream.write_all(request.as_bytes()).unwrap();
                let mut output = Vec::new();
                stream.read_to_end(&mut output).unwrap();
            });
            let (mut stream, _) = listener.accept().unwrap();
            let result = callback_request(
                &mut stream,
                &format!("http://127.0.0.1:{port}/callback"),
                "expected",
                "https://identity.example/auth/v1",
                Instant::now() + Duration::from_secs(5),
                || Ok(()),
            );
            drop(stream);
            writer.join().unwrap();
            result
        }
        assert!(
            attempt(
                "GET /callback?state=expected&code=x HTTP/1.1\r\nHost: evil.example\r\n\r\n".into()
            )
            .is_none()
        );
        assert!(
            attempt(
                "GET /callback?state=wrong&code=x HTTP/1.1\r\nHost: 127.0.0.1:PORT\r\n\r\n".into()
            )
            .is_none()
        );
        assert!(attempt("GET /callback?state=expected&code=x&code=y HTTP/1.1\r\nHost: 127.0.0.1:PORT\r\n\r\n".into()).is_none());
        assert!(attempt("GET /callback?state=expected&code=x HTTP/1.1\r\nHost: 127.0.0.1:PORT\r\nOrigin: https://evil.example\r\n\r\n".into()).is_none());
        assert!(attempt("GET /wrong/../callback?state=expected&code=x HTTP/1.1\r\nHost: 127.0.0.1:PORT\r\n\r\n".into()).is_none());
    }
    fn trickling_callback(cancel: bool) {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let cancelled = AtomicBool::new(false);
        let stopped = AtomicBool::new(false);
        std::thread::scope(|scope| {
            let writer = scope.spawn(|| {
                let mut stream = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)).unwrap();
                // Keep this peer connected and sending faster than the socket's
                // 250ms idle timeout, even after cancellation. Cap a broken
                // implementation's test duration instead of leaving it blocked.
                for index in 0..100 {
                    if stopped.load(Ordering::SeqCst) || stream.write_all(b"G").is_err() {
                        break;
                    }
                    if cancel && index == 5 {
                        cancelled.store(true, Ordering::SeqCst);
                    }
                    std::thread::sleep(Duration::from_millis(20));
                }
            });
            let (mut stream, _) = listener.accept().unwrap();
            let started = Instant::now();
            let result = callback_request(
                &mut stream,
                &format!("http://127.0.0.1:{port}/callback"),
                "expected",
                "https://identity.example/auth/v1",
                started
                    + if cancel {
                        Duration::from_secs(5)
                    } else {
                        Duration::from_millis(150)
                    },
                || {
                    if cancelled.load(Ordering::SeqCst) {
                        Err(failure("cancelled"))
                    } else {
                        Ok(())
                    }
                },
            );
            let elapsed = started.elapsed();
            stopped.store(true, Ordering::SeqCst);
            drop(stream);
            writer.join().unwrap();
            assert_eq!(
                result
                    .expect("callback must terminate the ceremony")
                    .unwrap_err()
                    .code(),
                if cancel {
                    "cancelled"
                } else {
                    "callback_timeout"
                }
            );
            assert!(
                elapsed < Duration::from_secs(1),
                "callback took {elapsed:?}"
            );
        });
    }
    #[test]
    fn callback_header_deadline_does_not_reset_as_bytes_arrive() {
        trickling_callback(false);
    }
    #[test]
    fn callback_header_cancellation_interrupts_a_trickling_peer() {
        trickling_callback(true);
    }
    #[test]
    fn callback_accepts_headers_after_accepting_a_nonblocking_socket() {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut peer = TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port)).unwrap();
        peer.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
        let (mut stream, _) = listener.accept().unwrap();
        // Darwin inherits the listener's O_NONBLOCK flag. Force that state on
        // every host so Linux also verifies the same delayed-first-byte race.
        stream.set_nonblocking(true).unwrap();
        let writer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            let request = format!(
                "GET /callback?state=expected&code=synthetic HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"
            );
            let _ = peer.write_all(request.as_bytes());
            let mut response = String::new();
            let _ = peer.read_to_string(&mut response);
            response
        });
        let result = callback_request(
            &mut stream,
            &format!("http://127.0.0.1:{port}/callback"),
            "expected",
            "https://identity.example/auth/v1",
            Instant::now() + Duration::from_secs(2),
            || Ok(()),
        );
        drop(stream);
        let response = writer.join().unwrap();
        assert_eq!(result.unwrap().unwrap(), "synthetic");
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
    }
    #[test]
    fn cancellation_keeps_lock_until_transport_settles_and_preserves_rotation() {
        use std::sync::mpsc;
        struct Blocking {
            started: Mutex<mpsc::Sender<()>>,
            released: Mutex<mpsc::Receiver<()>>,
        }
        impl Transport for Blocking {
            fn send(&self, request: Request) -> Result<Response> {
                if request.url.ends_with("/oauth/token") {
                    return Ok(Response {
                        status: 200,
                        body: tokens(),
                    });
                }
                assert!(request.url.ends_with("/api/v1/auth/me"));
                self.started.lock().unwrap().send(()).unwrap();
                self.released.lock().unwrap().recv().unwrap();
                Ok(Response {
                    status: 200,
                    body: identity(),
                })
            }
        }
        let temp = tempfile::tempdir().unwrap();
        let home = std::fs::canonicalize(temp.path()).unwrap();
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let client = Arc::new(
            AuthClient::open(
                config(),
                home.clone(),
                Some(Backend::File),
                Arc::new(Blocking {
                    started: Mutex::new(started_tx),
                    released: Mutex::new(release_rx),
                }),
            )
            .unwrap(),
        );
        client
            .store
            .exclusive(|tx| tx.write(Some(session(&client.config))))
            .unwrap();
        let rotating = client.clone();
        let rotation = std::thread::spawn(move || rotating.refresh());
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let other = AuthClient::open(
            config(),
            home,
            Some(Backend::File),
            Arc::new(Script(Mutex::new(vec![]))),
        )
        .unwrap();
        let (observed_tx, observed_rx) = mpsc::channel();
        let observer = std::thread::spawn(move || observed_tx.send(other.status()).unwrap());
        client.cancel_login();
        assert!(
            observed_rx
                .recv_timeout(Duration::from_millis(100))
                .is_err(),
            "cancellation must not release an active custody mutation"
        );
        release_tx.send(()).unwrap();
        assert_eq!(rotation.join().unwrap().unwrap_err().code(), "cancelled");
        assert!(matches!(
            observed_rx
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap(),
            Status::RefreshNeeded { .. }
        ));
        observer.join().unwrap();
        let saved = client
            .store
            .exclusive(|tx| tx.read())
            .unwrap()
            .session
            .unwrap();
        assert_eq!(saved.refresh_token, "synthetic-new-refresh");
        assert_eq!(saved.access_token, "synthetic-old-access");
    }
    #[test]
    fn stale_browser_consent_cannot_commit_after_another_clients_empty_logout() {
        let (temp, mut client, script) = client(vec![
            ("/oauth/token", 200, tokens()),
            ("/api/v1/auth/me", 200, identity()),
        ]);
        let other = AuthClient::open(
            config(),
            std::fs::canonicalize(temp.path()).unwrap(),
            Some(Backend::File),
            script,
        )
        .unwrap();
        let port = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        client.config.redirect_uris = vec![format!("http://127.0.0.1:{port}/callback")];
        let result=client.login(|authorization| {
            other.logout().unwrap();let url=url::Url::parse(authorization).unwrap();let state=url.query_pairs().find(|(k,_)|k=="state").unwrap().1.into_owned();
            std::thread::spawn(move||{let mut stream=TcpStream::connect((std::net::Ipv4Addr::LOCALHOST,port)).unwrap();write!(stream,"GET /callback?state={state}&code=synthetic-code HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n").unwrap();let mut body=Vec::new();stream.read_to_end(&mut body).unwrap();});Ok(())
        },&AtomicBool::new(false));
        assert_eq!(result.unwrap_err().code(), "session_changed");
        assert_eq!(client.status().unwrap(), Status::SignedOut);
    }
}
