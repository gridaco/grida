//! GRIDA-SEC-004 — bounded credential-bearing requests to the exact local MCP route.

use super::{VERSION, protocol_error, set_client_meta};
use agent_kit_core::{CancellationToken, Error, ErrorKind, Result};
use futures_util::{StreamExt, TryStreamExt};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HOST, HeaderValue};
use reqwest::{Client, StatusCode, Url};
use rmcp::model::{
    ClientJsonRpcMessage, ClientRequest, RequestId, ServerJsonRpcMessage, ServerResult,
};
use sse_stream::SseStream;
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

const MAX_HTTP_BYTES: usize = 256 * 1024;
const MAX_BEARER_BYTES: usize = 4096;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);

pub(super) struct Endpoint {
    url: Url,
    client: Client,
    authority: HeaderValue,
    authorization: HeaderValue,
    pub(super) closed: CancellationToken,
}

impl Endpoint {
    pub(super) fn new(endpoint: &str, bearer: &str) -> Result<Self> {
        let address = || Error::new(ErrorKind::InvalidInput, "invalid_mcp_endpoint");
        if endpoint.len() > 2048 {
            return Err(address());
        }
        let (authority, path) = endpoint
            .strip_prefix("http://")
            .and_then(|target| target.split_once('/'))
            .ok_or_else(address)?;
        let socket = authority.parse::<SocketAddr>().map_err(|_| address())?;
        if !socket.ip().is_loopback() || socket.port() == 0 {
            return Err(address());
        }
        let url = Url::parse(endpoint).map_err(|_| address())?;
        if url.query().is_some()
            || url.fragment().is_some()
            || url.path().strip_prefix('/') != Some(path)
        {
            return Err(address());
        }

        let authority = HeaderValue::from_str(&socket.to_string()).map_err(|_| address())?;
        let invalid_bearer = || Error::new(ErrorKind::InvalidInput, "invalid_mcp_bearer");
        let token = bearer.trim_end_matches('=');
        if token.is_empty()
            || bearer.len() > MAX_BEARER_BYTES
            || !token.bytes().all(|byte| {
                byte.is_ascii_alphanumeric()
                    || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'+' | b'/')
            })
        {
            return Err(invalid_bearer());
        }
        let bearer = Zeroizing::new(format!("Bearer {bearer}"));
        let mut authorization = HeaderValue::from_str(&bearer).map_err(|_| invalid_bearer())?;
        authorization.set_sensitive(true);
        let client = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .pool_max_idle_per_host(0)
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .connect_timeout(CONNECT_TIMEOUT)
            .http1_only()
            .build()
            .map_err(|_| Error::new(ErrorKind::Unavailable, "mcp_transport_unavailable"))?;
        Ok(Self {
            url,
            client,
            authority,
            authorization,
            closed: CancellationToken::new(),
        })
    }

    pub(super) async fn post(
        &self,
        mut request: ClientRequest,
        id: RequestId,
        deadline: Instant,
    ) -> Result<ServerResult> {
        if self.closed.is_cancelled() {
            return Err(super::endpoint_closed());
        }
        let timeout = deadline.saturating_duration_since(Instant::now());
        if timeout.is_zero() {
            return Err(transport_error());
        }
        let invalid_request = || Error::new(ErrorKind::InvalidInput, "mcp_request_encoding");
        let method = HeaderValue::from_str(request.method()).map_err(|_| invalid_request())?;
        let name = if let ClientRequest::CallToolRequest(request) = &request {
            Some(HeaderValue::from_str(&request.params.name).map_err(|_| invalid_request())?)
        } else {
            None
        };
        set_client_meta(&mut request);
        let body = serde_json::to_vec(&ClientJsonRpcMessage::request(request, id.clone()))
            .map_err(|_| invalid_request())?;
        if body.len() > MAX_HTTP_BYTES {
            return Err(body_limit());
        }
        let mut request = self
            .client
            .post(self.url.clone())
            .header(HOST, self.authority.clone())
            .header(AUTHORIZATION, self.authorization.clone())
            .header(ACCEPT, "application/json, text/event-stream")
            .header(CONTENT_TYPE, "application/json")
            .header("mcp-protocol-version", VERSION.as_str())
            .header("mcp-method", method)
            .timeout(timeout)
            .body(body);
        if let Some(name) = name {
            request = request.header("mcp-name", name);
        }
        let response = request.send().await.map_err(|_| transport_error())?;
        if response.status() != StatusCode::OK {
            return Err(Error::new(
                ErrorKind::Unavailable,
                "mcp_http_request_refused",
            ));
        }
        if response
            .content_length()
            .is_some_and(|bytes| bytes > MAX_HTTP_BYTES as u64)
        {
            return Err(body_limit());
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .map(str::trim)
            .ok_or_else(protocol_error)?;
        let sse = content_type.eq_ignore_ascii_case("text/event-stream");
        if !sse && !content_type.eq_ignore_ascii_case("application/json") {
            return Err(protocol_error());
        }
        let mut received = 0;
        let chunks = response.bytes_stream().map(move |chunk| {
            let chunk = chunk.map_err(|_| transport_error())?;
            received += chunk.len();
            if received > MAX_HTTP_BYTES {
                return Err(body_limit());
            }
            Ok(chunk)
        });
        if !sse {
            let body = chunks
                .try_fold(Vec::new(), |mut body, chunk| async move {
                    body.extend_from_slice(&chunk);
                    Ok(body)
                })
                .await?;
            return correlated(&body, &id)?.ok_or_else(protocol_error);
        }
        let mut stream = Box::pin(SseStream::from_bytes_stream(chunks));
        while let Some(event) = stream.next().await {
            let event = event.map_err(|_| protocol_error())?;
            if let Some(data) = event.data.filter(|data| !data.is_empty())
                && let Some(response) = correlated(data.as_bytes(), &id)?
            {
                return Ok(response);
            }
        }
        Err(protocol_error())
    }
}

fn correlated(bytes: &[u8], id: &RequestId) -> Result<Option<ServerResult>> {
    match serde_json::from_slice::<ServerJsonRpcMessage>(bytes).map_err(|_| protocol_error())? {
        ServerJsonRpcMessage::Response(reply) if reply.id == *id => Ok(Some(reply.result)),
        ServerJsonRpcMessage::Notification(_) => Ok(None),
        _ => Err(protocol_error()),
    }
}

fn body_limit() -> Error {
    Error::new(ErrorKind::LimitExceeded, "mcp_http_body_limit")
}

fn transport_error() -> Error {
    Error::new(ErrorKind::Unavailable, "mcp_transport_interrupted")
}
