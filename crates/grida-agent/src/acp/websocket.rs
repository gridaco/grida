//! Authenticated loopback WebSocket binding for independent ACP clients.

use super::serve_connection;
use super::transport::{Delivery, MAX_FRAME_BYTES, WRITE_TIMEOUT, wire_error};
use crate::host::Host;
use crate::loopback_bearer;
use agent_client_protocol::{Channel, Result as AcpResult};
use agent_kit_core::{Error, ErrorKind, Result};
use futures_util::{SinkExt, StreamExt};
use reqwest::Url;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinSet;
use tokio_tungstenite::accept_hdr_async_with_config;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use zeroize::Zeroizing;

const ENDPOINT_PATH: &str = "/acp";
const MAX_CLIENTS: usize = 16;
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(3);

pub struct ListenOptions {
    address: SocketAddr,
    authorization: Zeroizing<Vec<u8>>,
}

impl ListenOptions {
    pub fn from_environment(address: &str, token_env: &str) -> Result<Self> {
        Ok(Self {
            address: loopback_address(address)?,
            authorization: loopback_bearer::authorization_from_env(token_env)?,
        })
    }
}

pub async fn serve_websocket(host: Arc<Host>, options: ListenOptions) -> Result<()> {
    let listener = TcpListener::bind(options.address)
        .await
        .map_err(|_| Error::new(ErrorKind::Unavailable, "acp_listener_unavailable"))?;
    let address = listener
        .local_addr()
        .map_err(|_| Error::new(ErrorKind::Unavailable, "acp_listener_address_unavailable"))?;
    eprintln!("grida-agent: ACP listening on ws://{address}{ENDPOINT_PATH}");
    let host_header = Arc::new(address.to_string());
    let authorization = Arc::new(options.authorization);
    let mut clients = JoinSet::new();
    loop {
        tokio::select! {
            joined = clients.join_next(), if !clients.is_empty() => {
                if joined.is_some_and(|result| result.is_err()) {
                    eprintln!("grida-agent: ACP client task interrupted");
                }
            }
            stream = loopback_bearer::next_loopback("ACP", || listener.accept()) => {
                if clients.len() >= MAX_CLIENTS {
                    continue;
                }
                let host = host.clone();
                let host_header = host_header.clone();
                let authorization = authorization.clone();
                clients.spawn(async move {
                    // The listener owns the Host. A failed or disconnected
                    // client drops its own transport and observers only.
                    let _ = serve_client(stream, host, host_header, authorization).await;
                });
            }
        }
    }
}

async fn serve_client(
    stream: TcpStream,
    host: Arc<Host>,
    host_header: Arc<String>,
    authorization: Arc<Zeroizing<Vec<u8>>>,
) -> AcpResult<()> {
    let config = WebSocketConfig::default()
        .read_buffer_size(16 * 1024)
        .write_buffer_size(0)
        .max_write_buffer_size(MAX_FRAME_BYTES + 16 * 1024)
        .max_message_size(Some(MAX_FRAME_BYTES - 1))
        .max_frame_size(Some(MAX_FRAME_BYTES - 1));
    #[allow(
        clippy::result_large_err,
        reason = "The WebSocket handshake callback returns an HTTP response"
    )]
    let authorize = move |request: &Request, response: Response| match loopback_bearer::rejection(
        request,
        ENDPOINT_PATH,
        &host_header,
        &authorization,
    ) {
        None => Ok(response),
        Some(status) => {
            let mut rejected = ErrorResponse::new(None);
            *rejected.status_mut() = status;
            Err(rejected)
        }
    };
    let socket = tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        accept_hdr_async_with_config(stream, authorize, Some(config)),
    )
    .await
    .map_err(|_| wire_error("acp_websocket_handshake_timeout"))?
    .map_err(|_| wire_error("acp_websocket_handshake_failed"))?;
    let (mut sink, mut source) = socket.split();
    let delivery = Arc::new(Delivery::new());
    let (sdk, wire) = Channel::duplex();
    let (mut outgoing, incoming) = wire.into_parts();
    let read = async {
        // Moving the sender into the read half gives ACP an EOF when this
        // client disconnects, even while the host-owned run remains active.
        let incoming = incoming;
        while let Some(message) = source.next().await {
            match message.map_err(|_| wire_error("acp_websocket_read_failed"))? {
                Message::Text(line) => {
                    if !delivery.receive(line.as_str(), &incoming)? {
                        return Ok(());
                    }
                }
                Message::Close(_) => break,
                Message::Ping(_) | Message::Pong(_) => {}
                _ => return Err(wire_error("acp_websocket_text_required")),
            }
        }
        Ok(())
    };
    let write = async {
        while let Some(frame) = outgoing.next().await {
            let line = frame.to_json()?;
            if line.len() >= MAX_FRAME_BYTES {
                return Err(wire_error("acp_websocket_output_frame_too_large"));
            }
            tokio::time::timeout(WRITE_TIMEOUT, sink.send(Message::Text(line.into())))
                .await
                .map_err(|_| wire_error("acp_websocket_write_timeout"))?
                .map_err(|_| wire_error("acp_websocket_write_failed"))?;
            delivery.delivered(&frame);
        }
        Ok(())
    };
    tokio::try_join!(
        serve_connection(host, sdk, delivery.clone(), None, None),
        read,
        write
    )?;
    Ok(())
}

fn loopback_address(address: &str) -> Result<SocketAddr> {
    let invalid = || Error::new(ErrorKind::InvalidInput, "invalid_acp_listen_address");
    let url = Url::parse(address).map_err(|_| invalid())?;
    if url.scheme() != "ws"
        || url.path() != ENDPOINT_PATH
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid());
    }
    let ip = url
        .host_str()
        .and_then(|host| host.trim_matches(['[', ']']).parse::<IpAddr>().ok())
        .ok_or_else(invalid)?;
    if !ip.is_loopback() {
        return Err(invalid());
    }
    Ok(SocketAddr::new(
        ip,
        url.port_or_known_default().ok_or_else(invalid)?,
    ))
}
