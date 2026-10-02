// GRIDA-SEC-006 / GRIDA-SEC-010 / GRIDA-SEC-013 — destination-bound native egress.
// GRIDA-GG: provider — explicit native authority, no account/provider crossover.
//! One admitted operation owns one connection. No proxy discovery, cookie jar,
//! connection pool, automatic redirect, or retry exists in this transport.
use bytes::{Bytes, BytesMut};
use http::{HeaderMap, HeaderValue, Method};
use http_body_util::{BodyExt, Full};
use hyper_util::rt::TokioIo;
use rustls::pki_types::ServerName;
use rustls_platform_verifier::BuilderVerifierExt;
use std::{
    fmt,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    net::TcpStream,
    time::{Instant, timeout, timeout_at},
};
use tokio_rustls::TlsConnector;
use tokio_util::sync::CancellationToken;
use url::Url;

#[cfg(test)]
#[path = "http_tests.rs"]
mod tests;
#[path = "http_wire.rs"]
mod wire;

pub const MAX_BODY: usize = 128 * 1024 * 1024;
pub const MAX_RESPONSE: usize = 256 * 1024 * 1024;
const ACCOUNT_LIMIT: usize = 65_536;
const LOCAL_GG: &str = "http://127.0.0.1:3041";
const LOCAL_ISSUER: &str = "http://127.0.0.1:55431/auth/v1";
const ISSUER: &str = "https://mozagqllybnbytfcmvdh.supabase.co/auth/v1";
const API: &str = "https://grida.co";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lane {
    Provider,
    Download,
    Account,
}

/// The admitted operation decides when its response has enough information.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResponseCompletion {
    Body,
    Empty,
    FirstSseEvent,
}

/// Owned request data. Debug is intentionally absent: headers/body may be secret.
pub struct Request {
    pub method: Method,
    pub url: String,
    pub headers: HeaderMap,
    pub body: Bytes,
    /// An earlier caller deadline can shorten, never extend, the route limit.
    pub deadline: Option<Instant>,
    pub max_response_bytes: usize,
    pub completion: ResponseCompletion,
}
impl Request {
    pub fn new(method: Method, url: impl Into<String>, body: impl Into<Bytes>) -> Self {
        Self {
            method,
            url: url.into(),
            headers: HeaderMap::new(),
            body: body.into(),
            deadline: None,
            max_response_bytes: MAX_RESPONSE,
            completion: ResponseCompletion::Body,
        }
    }
}

pub struct Response {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Bytes,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    Failed,
    Cancelled,
    InvalidResponse,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Failed => "media_transport_failed",
            Self::Cancelled => "Media request aborted",
            Self::InvalidResponse => "invalid_response",
        })
    }
}
impl std::error::Error for Error {}
type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Route {
    Openrouter,
    Vercel,
    Fal,
    Elevenlabs,
    Tripo,
    Upload,
    Gg,
    Download,
    Token,
    Logout,
    Account,
}

#[derive(Clone)]
pub struct Transport {
    gg_origin: Option<String>,
    account_origins: Option<(String, String)>,
    tls: Arc<rustls::ClientConfig>,
    #[cfg(test)]
    fixture: Option<SocketAddr>,
}

impl Transport {
    pub fn new(gg_origin: Option<&str>) -> Result<Self> {
        if gg_origin.is_some_and(|origin| origin != API && origin != LOCAL_GG) {
            return Err(Error::Failed);
        }
        let provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
        let tls = rustls::ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .map_err(|_| Error::Failed)?
            .with_platform_verifier()
            .map_err(|_| Error::Failed)?
            .with_no_client_auth();
        Ok(Self {
            gg_origin: gg_origin.map(str::to_owned),
            account_origins: None,
            tls: Arc::new(tls),
            #[cfg(test)]
            fixture: None,
        })
    }

    /// Registration capability, separate from provider authority. Only shipped
    /// production and explicit local-fixture registration pairs are admitted.
    pub fn account(issuer: &str, api_origin: &str) -> Result<Self> {
        if !matches!(
            (issuer, api_origin),
            (ISSUER, API) | (LOCAL_ISSUER, LOCAL_GG)
        ) {
            return Err(Error::Failed);
        }
        let mut transport = Self::new(None)?;
        transport.account_origins = Some((issuer.to_owned(), api_origin.to_owned()));
        Ok(transport)
    }

    pub async fn send(
        &self,
        lane: Lane,
        mut request: Request,
        cancel: &CancellationToken,
    ) -> Result<Response> {
        let mut target = admitted_url(&request.url)?;
        let route = self.admit(lane, &target, &request.method)?;
        match request.completion {
            ResponseCompletion::Empty if route != Route::Logout => return Err(Error::Failed),
            ResponseCompletion::FirstSseEvent
                if route != Route::Vercel
                    || request.method != Method::POST
                    || target.path() != "/v3/ai/video-model" =>
            {
                return Err(Error::Failed);
            }
            _ => {}
        }
        snapshot(route, &target, &mut request)?;
        let seconds = if lane == Lane::Account {
            15
        } else if route == Route::Gg && target.path().starts_with("/api/v1/ai/3d/") {
            780
        } else {
            600
        };
        let maximum = Instant::now() + Duration::from_secs(seconds);
        let deadline = request.deadline.map_or(maximum, |d| d.min(maximum));
        let operation = async {
            for hop in 0..=3 {
                self.admit(lane, &target, &request.method)?;
                let address = self.resolve(&target).await?;
                let response = self.open(lane, &request, &target, address).await?;
                if lane != Lane::Download || !redirect(response.status) {
                    return Ok(response);
                }
                if hop == 3 {
                    return Err(Error::Failed);
                }
                let location = response
                    .headers
                    .get("location")
                    .ok_or(Error::Failed)?
                    .to_str()
                    .map_err(|_| Error::Failed)?;
                // Reject controls/oversized locations before URL normalization.
                valid_url_text(location)?;
                let next = target.join(location).map_err(|_| Error::Failed)?;
                target = admitted_url(next.as_str())?;
            }
            Err(Error::Failed)
        };
        tokio::select! { biased;
            _ = cancel.cancelled() => Err(Error::Cancelled),
            result = timeout_at(deadline, operation) => result.unwrap_or(Err(Error::Cancelled)),
        }
    }

    fn admit(&self, lane: Lane, url: &Url, method: &Method) -> Result<Route> {
        if lane == Lane::Account {
            return self.admit_account(url, method);
        }
        let host = url.host_str().ok_or(Error::Failed)?;
        let path = url.path();
        if lane == Lane::Download {
            if url.scheme() == "https"
                && url.port().is_none()
                && matches!(*method, Method::GET | Method::HEAD)
            {
                return Ok(Route::Download);
            }
            return Err(Error::Failed);
        }
        if self.gg_origin.as_deref() == Some(url.origin().ascii_serialization().as_str()) {
            if *method == Method::POST
                && url.query().is_none()
                && matches!(
                    path,
                    "/api/v1/ai/images/generations"
                        | "/api/v1/ai/videos/generations"
                        | "/api/v1/ai/music/generations"
                        | "/api/v1/ai/3d/uploads"
                        | "/api/v1/ai/3d/model-generation"
                        | "/api/v1/ai/3d/rig-check"
                        | "/api/v1/ai/3d/rigging"
                )
            {
                return Ok(Route::Gg);
            }
            return Err(Error::Failed);
        }
        if url.scheme() != "https" || url.port().is_some() {
            return Err(Error::Failed);
        }
        if host == "tripo-data.s3.us-west-2.amazonaws.com" && *method == Method::PUT && path != "/"
        {
            return Ok(Route::Upload);
        }
        if host == "openrouter.ai" {
            let poll = path.strip_prefix("/api/v1/videos/").is_some_and(|rest| {
                one_segment(rest) || rest.strip_suffix("/content").is_some_and(one_segment)
            });
            if (*method == Method::POST && matches!(path, "/api/v1/images" | "/api/v1/videos"))
                || (*method == Method::GET
                    && (poll || (path == "/api/v1/key" && url.query().is_none())))
            {
                return Ok(Route::Openrouter);
            }
        }
        if host.ends_with(".openrouter.ai") && *method == Method::GET {
            return Ok(Route::Openrouter);
        }
        if host == "ai-gateway.vercel.sh"
            && ((*method == Method::POST
                && matches!(path, "/v3/ai/image-model" | "/v3/ai/video-model"))
                || (*method == Method::GET && path == "/v1/credits" && url.query().is_none()))
        {
            return Ok(Route::Vercel);
        }
        if host == "api.fal.ai"
            && *method == Method::GET
            && path == "/v1/models/pricing"
            && url.query_pairs().collect::<Vec<_>>()
                == [("endpoint_id".into(), "fal-ai/flux/dev".into())]
        {
            return Ok(Route::Fal);
        }
        if host == "queue.fal.run" && matches!(*method, Method::GET | Method::POST) && path != "/" {
            return Ok(Route::Fal);
        }
        if host == "api.elevenlabs.io"
            && ((*method == Method::GET && path == "/v2/voices")
                || (*method == Method::POST
                    && (path == "/v1/sound-generation"
                        || path
                            .strip_prefix("/v1/text-to-speech/")
                            .is_some_and(one_segment))))
        {
            return Ok(Route::Elevenlabs);
        }
        if host == "openapi.tripo3d.ai"
            && url.query().is_none()
            && ((*method == Method::POST
                && matches!(
                    path,
                    "/v3/files"
                        | "/v3/animations/rig-check"
                        | "/v3/animations/rig"
                        | "/v3/generation/text-to-model"
                        | "/v3/generation/image-to-model"
                        | "/v3/generation/multiview-to-model"
                ))
                || (*method == Method::GET
                    && (path == "/v3/account/balance"
                        || path.strip_prefix("/v3/tasks/").is_some_and(|s| {
                            !s.is_empty()
                                && s.bytes()
                                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
                        }))))
        {
            return Ok(Route::Tripo);
        }
        Err(Error::Failed)
    }

    fn admit_account(&self, url: &Url, method: &Method) -> Result<Route> {
        let (issuer, api) = self.account_origins.as_ref().ok_or(Error::Failed)?;
        if url.as_str() == format!("{issuer}/oauth/token") && *method == Method::POST {
            return Ok(Route::Token);
        }
        if url.as_str() == format!("{issuer}/logout?scope=local") && *method == Method::POST {
            return Ok(Route::Logout);
        }
        if url.origin().ascii_serialization() != *api {
            return Err(Error::Failed);
        }
        let allowed = match (method.as_str(), url.path(), url.query()) {
            ("GET", "/api/v1/auth/me", None)
            | ("GET", "/api/v1/account/organizations", None)
            | ("POST", "/api/v1/auth/gg", None) => true,
            ("GET", "/api/v1/account/organizations", Some(query)) => {
                query.strip_prefix("after=").is_some_and(positive_integer)
            }
            ("GET", "/api/v1/account/credits", Some(query)) => query
                .strip_prefix("organization_id=")
                .is_some_and(positive_integer),
            _ => false,
        };
        if allowed {
            Ok(Route::Account)
        } else {
            Err(Error::Failed)
        }
    }

    async fn resolve(&self, target: &Url) -> Result<SocketAddr> {
        #[cfg(test)]
        if let Some(address) = self.fixture {
            return Ok(address);
        }
        let host = target
            .host_str()
            .ok_or(Error::Failed)?
            .trim_matches(['[', ']']);
        let port = target.port_or_known_default().ok_or(Error::Failed)?;
        let origin = target.origin().ascii_serialization();
        let local = (self.gg_origin.as_deref() == Some(LOCAL_GG) && origin == LOCAL_GG)
            || self.account_origins.as_ref().is_some_and(|(issuer, api)| {
                issuer == LOCAL_ISSUER && (origin == *api || origin == "http://127.0.0.1:55431")
            });
        if local {
            return Ok(SocketAddr::from(([127, 0, 0, 1], port)));
        }
        if let Ok(ip) = host.parse::<IpAddr>() {
            return if public_address(ip) {
                Ok(SocketAddr::new(ip, port))
            } else {
                Err(Error::Failed)
            };
        }
        let addresses = timeout(
            Duration::from_secs(5),
            tokio::net::lookup_host((host, port)),
        )
        .await
        .map_err(|_| Error::Failed)?
        .map_err(|_| Error::Failed)?
        .take(33)
        .collect::<Vec<_>>();
        select_public(&addresses)
    }

    async fn open(
        &self,
        lane: Lane,
        request: &Request,
        target: &Url,
        address: SocketAddr,
    ) -> Result<Response> {
        let connect = async {
            let socket = TcpStream::connect(address)
                .await
                .map_err(|_| Error::Failed)?;
            if target.scheme() == "https" {
                let host = target
                    .host_str()
                    .ok_or(Error::Failed)?
                    .trim_matches(['[', ']'])
                    .to_owned();
                let name = ServerName::try_from(host).map_err(|_| Error::Failed)?;
                let stream = TlsConnector::from(self.tls.clone())
                    .connect(name, socket)
                    .await
                    .map_err(|_| Error::Failed)?;
                Ok(Box::new(stream) as Box<dyn Io>)
            } else {
                Ok(Box::new(socket) as Box<dyn Io>)
            }
        };
        let io = timeout(Duration::from_secs(15), connect)
            .await
            .map_err(|_| Error::Failed)??;
        let guard = wire::WireGuard::new(io, request.method == Method::HEAD);
        let (mut sender, connection) = hyper::client::conn::http1::Builder::new()
            .max_buf_size(wire::HEAD_LIMIT)
            .handshake(TokioIo::new(guard))
            .await
            .map_err(|_| Error::Failed)?;
        let connection = AbortConnection(tokio::spawn(connection));
        let path = match target.query() {
            Some(query) => format!("{}?{query}", target.path()),
            None => target.path().to_owned(),
        };
        let mut outgoing = hyper::Request::builder()
            .method(request.method.clone())
            .uri(path)
            .body(Full::new(request.body.clone()))
            .map_err(|_| Error::Failed)?;
        *outgoing.headers_mut() = request.headers.clone();
        let host = match target.port() {
            Some(port) => format!("{}:{port}", target.host_str().ok_or(Error::Failed)?),
            None => target.host_str().ok_or(Error::Failed)?.to_owned(),
        };
        outgoing.headers_mut().insert(
            "host",
            HeaderValue::from_str(&host).map_err(|_| Error::Failed)?,
        );
        outgoing
            .headers_mut()
            .insert("connection", HeaderValue::from_static("close"));
        let incoming = sender
            .send_request(outgoing)
            .await
            .map_err(|_| Error::Failed)?;
        let status = incoming.status().as_u16();
        if !(200..600).contains(&status) || (lane != Lane::Download && (300..400).contains(&status))
        {
            return Err(Error::Failed);
        }
        let (parts, mut body) = incoming.into_parts();
        let mut headers = parts.headers;
        headers.remove("set-cookie");
        // Account failures and logout are status-only. Do not retain or wait
        // for an upstream body, including an endless or oversized response.
        if lane == Lane::Account
            && (request.completion == ResponseCompletion::Empty || status >= 300 || status == 204)
        {
            return Ok(Response {
                status,
                headers,
                body: Bytes::new(),
            });
        }
        let length = if let Some(value) = headers.get("content-length") {
            let value = value.to_str().map_err(|_| Error::Failed)?;
            if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
                return Err(Error::Failed);
            }
            let number = value.parse::<u64>().map_err(|_| Error::Failed)?;
            if number > 9_007_199_254_740_991 {
                return Err(Error::Failed);
            }
            Some(number)
        } else {
            None
        };
        let limit = request.max_response_bytes.min(if lane == Lane::Account {
            ACCOUNT_LIMIT
        } else {
            MAX_RESPONSE
        });
        let unsafe_body = headers
            .get("content-encoding")
            .is_some_and(|value| value.as_bytes() != b"identity")
            || length.is_some_and(|n| n > limit as u64);
        if unsafe_body && status < 400 {
            return Err(if lane == Lane::Account {
                Error::InvalidResponse
            } else {
                Error::Failed
            });
        }
        if unsafe_body
            || redirect(status)
            || request.method == Method::HEAD
            || matches!(status, 204 | 205 | 304)
        {
            return Ok(Response {
                status,
                headers,
                body: Bytes::new(),
            });
        }
        let mut bytes = BytesMut::new();
        let mut sse = grida_ai::SseEventFramer::default();
        while let Some(frame) = body.frame().await {
            let frame = frame.map_err(|_| Error::Failed)?;
            if let Some(data) = frame.data_ref() {
                if data.len() > limit - bytes.len() {
                    return Err(if lane == Lane::Account {
                        Error::InvalidResponse
                    } else {
                        Error::Failed
                    });
                }
                bytes.extend_from_slice(data);
                if request.completion == ResponseCompletion::FirstSseEvent
                    && (200..300).contains(&status)
                    && let Some(end) = sse.event_end(&bytes)
                {
                    bytes.truncate(end);
                    break;
                }
            }
        }
        drop(connection);
        Ok(Response {
            status,
            headers,
            body: bytes.freeze(),
        })
    }
}

trait Io: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Io for T {}
struct AbortConnection(tokio::task::JoinHandle<std::result::Result<(), hyper::Error>>);
impl Drop for AbortConnection {
    fn drop(&mut self) {
        self.0.abort();
    }
}

fn one_segment(value: &str) -> bool {
    !value.is_empty() && !value.contains('/')
}
fn positive_integer(value: &str) -> bool {
    !value.starts_with('0')
        && !value.is_empty()
        && value.bytes().all(|b| b.is_ascii_digit())
        && value
            .parse::<u64>()
            .is_ok_and(|n| n <= 9_007_199_254_740_991)
}
fn redirect(status: u16) -> bool {
    matches!(status, 301 | 302 | 303 | 307 | 308)
}
fn valid_url_text(value: &str) -> Result<()> {
    if value.len() > 16 * 1024 || value.bytes().any(|b| b <= 32 || b == 127) {
        Err(Error::Failed)
    } else {
        Ok(())
    }
}
fn admitted_url(value: &str) -> Result<Url> {
    valid_url_text(value)?;
    let url = Url::parse(value).map_err(|_| Error::Failed)?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none_or(|h| h.ends_with('.'))
    {
        return Err(Error::Failed);
    }
    Ok(url)
}

fn snapshot(route: Route, target: &Url, request: &mut Request) -> Result<()> {
    let mut size = 0;
    for (name, value) in &request.headers {
        size += name.as_str().len() + value.as_bytes().len();
        if size > wire::HEAD_LIMIT
            || value.as_bytes().len() > 8192
            || value.as_bytes().iter().any(|b| *b <= 31 || *b == 127)
        {
            return Err(Error::Failed);
        }
        let name = name.as_str();
        let common = matches!(name, "accept" | "content-type" | "user-agent");
        let allowed = match route {
            Route::Download => matches!(name, "accept" | "user-agent"),
            Route::Upload => common,
            Route::Elevenlabs => common || name == "xi-api-key",
            Route::Token => matches!(name, "accept" | "content-type"),
            Route::Logout => matches!(name, "accept" | "content-type" | "authorization" | "apikey"),
            Route::Account => matches!(name, "accept" | "content-type" | "authorization"),
            Route::Vercel => {
                common
                    || name == "authorization"
                    || matches!(
                        name,
                        "ai-gateway-protocol-version"
                            | "ai-gateway-auth-method"
                            | "ai-model-id"
                            | "ai-image-model-specification-version"
                            | "ai-video-model-specification-version"
                    )
            }
            _ => common || name == "authorization",
        };
        if !allowed {
            return Err(Error::Failed);
        }
    }
    let content_type = request
        .headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    match route {
        Route::Download => {}
        Route::Upload => {
            if content_type != "application/octet-stream"
                || request.body.is_empty()
                || request.body.len() > 60_000_000
            {
                return Err(Error::Failed);
            }
        }
        Route::Elevenlabs => {
            if request.headers.get_all("xi-api-key").iter().count() != 1
                || request.headers["xi-api-key"].is_empty()
            {
                return Err(Error::Failed);
            }
        }
        Route::Token => {
            if content_type != "application/x-www-form-urlencoded" || request.body.is_empty() {
                return Err(Error::Failed);
            }
        }
        _ => {
            if request.headers.get_all("authorization").iter().count() != 1 {
                return Err(Error::Failed);
            }
            let auth = request.headers["authorization"]
                .to_str()
                .map_err(|_| Error::Failed)?;
            let credential = auth
                .strip_prefix(if route == Route::Fal {
                    "Key "
                } else {
                    "Bearer "
                })
                .ok_or(Error::Failed)?;
            if credential.is_empty() || credential.chars().any(char::is_whitespace) {
                return Err(Error::Failed);
            }
            if route == Route::Logout
                && (request.headers.get_all("apikey").iter().count() != 1
                    || request.headers["apikey"].is_empty())
            {
                return Err(Error::Failed);
            }
        }
    }
    let account = matches!(route, Route::Account | Route::Token | Route::Logout);
    if request.body.len() > if account { ACCOUNT_LIMIT } else { MAX_BODY } {
        return Err(Error::Failed);
    }
    if !request.body.is_empty() && route != Route::Upload {
        if request.method != Method::POST {
            return Err(Error::Failed);
        }
        let multipart = route == Route::Tripo && target.path() == "/v3/files";
        if multipart {
            let boundary = content_type
                .strip_prefix("multipart/form-data; boundary=")
                .ok_or(Error::Failed)?;
            if boundary.is_empty()
                || boundary.len() > 70
                || !boundary
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
            {
                return Err(Error::Failed);
            }
        } else if route != Route::Token && !content_type.starts_with("application/json") {
            return Err(Error::Failed);
        }
    }
    request
        .headers
        .insert("accept-encoding", HeaderValue::from_static("identity"));
    Ok(())
}

fn public_address(address: IpAddr) -> bool {
    // RFC 6052's well-known DNS64 prefix carries an IPv4 destination. Validate
    // that destination too: admitting the prefix alone would allow private IPs.
    if let IpAddr::V6(ipv6) = address
        && ipv6.segments()[..6] == [0x64, 0xff9b, 0, 0, 0, 0]
    {
        let bytes = ipv6.octets();
        return public_address(IpAddr::V4(std::net::Ipv4Addr::new(
            bytes[12], bytes[13], bytes[14], bytes[15],
        )));
    }
    const DENIED: &[&str] = &[
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.88.99.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "2001::/23",
        "2001:db8::/32",
        "2002::/16",
        "3fff::/20",
    ];
    (address.is_ipv4()
        || "2000::/3"
            .parse::<ipnet::IpNet>()
            .expect("constant network")
            .contains(&address))
        && !DENIED.iter().any(|net| {
            net.parse::<ipnet::IpNet>()
                .expect("constant network")
                .contains(&address)
        })
}
fn select_public(addresses: &[SocketAddr]) -> Result<SocketAddr> {
    if addresses.is_empty()
        || addresses.len() > 32
        || addresses.iter().any(|a| !public_address(a.ip()))
    {
        Err(Error::Failed)
    } else {
        Ok(addresses[0])
    }
}
