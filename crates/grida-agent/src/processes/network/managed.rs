//! GRIDA-SEC-004 — command-owned HTTPS CONNECT with per-destination approval.

use super::{CommandNetworkDestination, native::public_address};
use agent_kit_core::{BoxFuture, CancellationToken, Error, ErrorKind, Result};
use agent_kit_sandbox::HttpProxy;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::collections::BTreeMap;
use std::io;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use subtle::ConstantTimeEq;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::{Mutex, Notify, OnceCell};
use tokio::task::JoinSet;

#[cfg(test)]
#[path = "managed_lifecycle.rs"]
mod managed_lifecycle;
#[cfg(test)]
#[path = "package_clients.rs"]
mod package_clients;

const CONNECTIONS: usize = 32;
const DESTINATIONS: usize = 32;
const HANDSHAKE: Duration = Duration::from_secs(10);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const IDLE_TIMEOUT: Duration = Duration::from_secs(120);
const HEADER_BYTES: u64 = 8192;

pub(crate) type ApproveDestination =
    dyn Fn(CommandNetworkDestination) -> BoxFuture<'static, bool> + Send + Sync;

type Resolve = dyn Fn(String, u16) -> BoxFuture<'static, io::Result<Vec<SocketAddr>>> + Send + Sync;
type Dial = dyn Fn(SocketAddr) -> BoxFuture<'static, io::Result<TcpStream>> + Send + Sync;
type Decision = Arc<OnceCell<bool>>;
#[cfg(target_os = "macos")]
type Listener = tokio::net::TcpListener;
#[cfg(target_os = "macos")]
type Client = TcpStream;
#[cfg(target_os = "linux")]
type Listener = tokio::net::UnixListener;
#[cfg(target_os = "linux")]
type Client = tokio::net::UnixStream;

pub(crate) struct ManagedCommandProxy {
    listener: Listener,
    endpoint: HttpProxy,
    authorization: String,
    destinations: Mutex<BTreeMap<CommandNetworkDestination, Decision>>,
    approve: Arc<ApproveDestination>,
    #[cfg(target_os = "linux")]
    _state: tempfile::TempDir,
}

impl ManagedCommandProxy {
    pub(crate) fn bind(state_directory: &Path, approve: Arc<ApproveDestination>) -> Result<Self> {
        Self::bind_inner(state_directory, approve).map_err(|_| {
            Error::new(
                ErrorKind::Unavailable,
                "command_network_mediator_unavailable",
            )
        })
    }

    fn bind_inner(state_directory: &Path, approve: Arc<ApproveDestination>) -> io::Result<Self> {
        let password = uuid::Uuid::new_v4().simple().to_string();
        let authorization = format!("Basic {}", STANDARD.encode(format!("grida:{password}")));
        #[cfg(target_os = "macos")]
        let (listener, endpoint) = {
            let _ = state_directory;
            let local = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
            let port = local.local_addr()?.port();
            local.set_nonblocking(true)?;
            (
                Listener::from_std(local)?,
                HttpProxy::Loopback { port, password },
            )
        };
        #[cfg(target_os = "linux")]
        let (listener, endpoint, state) = {
            use std::os::unix::fs::PermissionsExt;
            let state = tempfile::Builder::new()
                .permissions(std::fs::Permissions::from_mode(0o700))
                .tempdir_in(state_directory)?;
            use std::os::fd::AsRawFd;
            let directory = std::fs::File::open(state.path())?;
            let socket = state.path().canonicalize()?.join("proxy");
            let listener =
                Listener::bind(format!("/proc/self/fd/{}/proxy", directory.as_raw_fd()))?;
            (listener, HttpProxy::Unix { socket, password }, state)
        };
        Ok(Self {
            listener,
            endpoint,
            authorization,
            destinations: Mutex::default(),
            approve,
            #[cfg(target_os = "linux")]
            _state: state,
        })
    }

    pub(crate) fn endpoint(&self) -> &HttpProxy {
        &self.endpoint
    }

    pub(crate) async fn serve(self, stop: CancellationToken) {
        let _ = self
            .serve_with(
                stop,
                |host, port| {
                    Box::pin(
                        async move { Ok(tokio::net::lookup_host((host, port)).await?.collect()) },
                    )
                },
                |address| Box::pin(TcpStream::connect(address)),
            )
            .await;
    }

    pub(super) async fn serve_with(
        self,
        stop: CancellationToken,
        resolve: impl Fn(String, u16) -> BoxFuture<'static, io::Result<Vec<SocketAddr>>>
        + Send
        + Sync
        + 'static,
        dial: impl Fn(SocketAddr) -> BoxFuture<'static, io::Result<TcpStream>> + Send + Sync + 'static,
    ) -> io::Result<()> {
        // The task set owns every stream. Dropping it closes pending and active
        // tunnels together with the listener and its credential.
        let proxy = Arc::new(self);
        let mut connections = JoinSet::new();
        let resolve = Arc::new(resolve);
        let dial = Arc::new(dial);
        loop {
            tokio::select! {
                biased;
                _ = stop.cancelled() => {
                    connections.shutdown().await;
                    return Ok(());
                }
                _ = connections.join_next(), if !connections.is_empty() => {},
                accepted = proxy.listener.accept(), if connections.len() < CONNECTIONS => {
                    let (client, _) = accepted?;
                    let (proxy, resolve, dial) = (proxy.clone(), resolve.clone(), dial.clone());
                    let stop = stop.clone();
                    connections.spawn(async move {
                        tokio::select! {
                            biased;
                            _ = stop.cancelled() => {}
                            _ = proxy.connect(client, &*resolve, &*dial) => {}
                        }
                    });
                }
            }
        }
    }

    async fn is_approved(&self, destination: &CommandNetworkDestination) -> bool {
        let decision = {
            let mut destinations = self.destinations.lock().await;
            if destinations.len() >= DESTINATIONS && !destinations.contains_key(destination) {
                return false;
            }
            destinations.entry(destination.clone()).or_default().clone()
        };
        *decision
            .get_or_init(|| (self.approve)(destination.clone()))
            .await
    }

    async fn connect(&self, client: Client, resolve: &Resolve, dial: &Dial) -> io::Result<()> {
        let mut client = BufReader::new(client);
        let request = tokio::time::timeout(HANDSHAKE, self.request(&mut client)).await?;
        let destination = match request {
            Ok(destination) => destination,
            Err(response) => {
                client.write_all(response).await?;
                return Ok(());
            }
        };
        if !self.is_approved(&destination).await {
            client.write_all(DENIED).await?;
            return Ok(());
        }
        let remote = tokio::time::timeout(CONNECT_TIMEOUT, async {
            let addresses = resolve(format!("{}.", destination.host), destination.port).await?;
            // Dial the checked addresses directly and never ask the OS to resolve again.
            for address in addresses.into_iter().filter(|address| {
                matches!(address, SocketAddr::V4(v4) if public_address(*v4.ip()) && v4.port() == destination.port)
            }) {
                if let Ok(stream) = dial(address).await {
                    return Ok::<_, io::Error>(stream);
                }
            }
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        }).await;
        let mut remote = match remote {
            Ok(Ok(stream)) => stream,
            _ => {
                client.write_all(UNAVAILABLE).await?;
                return Ok(());
            }
        };
        client
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await?;
        relay(&mut client, &mut remote).await
    }

    async fn request(
        &self,
        client: &mut BufReader<Client>,
    ) -> std::result::Result<CommandNetworkDestination, &'static [u8]> {
        let mut headers = client.take(HEADER_BYTES);
        let mut line = String::new();
        headers
            .read_line(&mut line)
            .await
            .map_err(|_| BAD_REQUEST)?;
        let mut request_line = line.strip_suffix("\r\n").ok_or(BAD_REQUEST)?.split(' ');
        let (Some("CONNECT"), Some(authority), Some("HTTP/1.0" | "HTTP/1.1"), None) = (
            request_line.next(),
            request_line.next(),
            request_line.next(),
            request_line.next(),
        ) else {
            return Err(BAD_REQUEST);
        };
        let (host, port) = authority.rsplit_once(':').ok_or(BAD_REQUEST)?;
        let destination = CommandNetworkDestination {
            host: host.to_ascii_lowercase(),
            port: port.parse().map_err(|_| BAD_REQUEST)?,
        };
        destination.validate().map_err(|_| BAD_REQUEST)?;
        let mut authorized = false;
        loop {
            line.clear();
            headers
                .read_line(&mut line)
                .await
                .map_err(|_| BAD_REQUEST)?;
            let line = line.strip_suffix("\r\n").ok_or(BAD_REQUEST)?;
            if line.is_empty() {
                break;
            }
            let (name, value) = line.split_once(':').ok_or(BAD_REQUEST)?;
            if name.eq_ignore_ascii_case("proxy-authorization") {
                if authorized
                    || !bool::from(self.authorization.as_bytes().ct_eq(value.trim().as_bytes()))
                {
                    return Err(AUTH_REQUIRED);
                }
                authorized = true;
            }
        }
        authorized.then_some(destination).ok_or(AUTH_REQUIRED)
    }
}

const BAD_REQUEST: &[u8] =
    b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
const AUTH_REQUIRED: &[u8] = b"HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"command\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
const DENIED: &[u8] = b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
const UNAVAILABLE: &[u8] =
    b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";

async fn relay(client: &mut BufReader<Client>, remote: &mut TcpStream) -> io::Result<()> {
    let progress = Notify::new();
    let (client_read, client_write) = tokio::io::split(client);
    let (remote_read, remote_write) = remote.split();
    tokio::select! {
        result = async { tokio::try_join!(relay_direction(client_read, remote_write, &progress), relay_direction(remote_read, client_write, &progress)) } => result.map(|_| ()),
        () = async { while tokio::time::timeout(IDLE_TIMEOUT, progress.notified()).await.is_ok() {} } => Err(io::ErrorKind::TimedOut.into()),
    }
}

async fn relay_direction(
    mut reader: impl tokio::io::AsyncRead + Unpin,
    mut writer: impl tokio::io::AsyncWrite + Unpin,
    progress: &Notify,
) -> io::Result<()> {
    let mut buffer = [0; 16 * 1024];
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            return writer.shutdown().await;
        }
        writer.write_all(&buffer[..read]).await?;
        progress.notify_one();
    }
}
