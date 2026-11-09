// GRIDA-SEC-006 / GRIDA-SEC-013 — scoped GG chat on the CLI's direct transport.
// GRIDA-GG: provider — fixed inference destination and bounded response stream.

use super::{
    BodyExt, Connection, ConnectionResponse, HeaderMap, HeaderValue, Instant, MAX_RESPONSE, Method,
    Request, Route, Transport, admitted_url, snapshot, timeout_at, unsafe_response_body,
};
use agent_kit_core::inference::RequestControl;
use agent_kit_providers::{TransportFailure, TransportResponse};
use futures_util::{StreamExt, stream};
use grida_agent::gg::GgChatRequest;
use std::time::{Duration, SystemTime};
use tokio_util::sync::CancellationToken;

const CHAT_PATH: &str = "/api/v1/ai/chat/completions";
const CHAT_TIMEOUT: Duration = Duration::from_secs(120);

impl Transport {
    pub(crate) async fn stream_gg_chat(
        &self,
        chat: GgChatRequest,
        control: RequestControl,
    ) -> Result<TransportResponse, TransportFailure> {
        let request = chat_http_request(
            chat.target,
            chat.authorization,
            chat.body,
            chat.max_response_bytes,
        );
        self.stream_chat(request, chat.expires_at, control).await
    }

    pub(super) async fn stream_chat(
        &self,
        mut request: Request,
        expires_at: SystemTime,
        control: RequestControl,
    ) -> Result<TransportResponse, TransportFailure> {
        let unavailable = TransportFailure::Unavailable;
        let interrupted = TransportFailure::Interrupted;
        let origin = self.gg_origin.as_deref().ok_or(unavailable)?;
        if request.url != format!("{origin}{CHAT_PATH}")
            || request.method != Method::POST
            || request.max_response_bytes == 0
            || SystemTime::now() >= expires_at
        {
            return Err(unavailable);
        }

        let target = admitted_url(&request.url).map_err(|_| unavailable)?;
        snapshot(Route::Gg, &target, &mut request).map_err(|_| unavailable)?;

        let maximum = Instant::now() + CHAT_TIMEOUT;
        let deadline = control
            .deadline
            .map_or(maximum, |deadline| Instant::from_std(deadline).min(maximum));
        let cancellation = control.cancellation;
        if Instant::now() >= deadline {
            return Err(unavailable);
        }
        let connect = async {
            let address = self.resolve(&target).await?;
            self.connect(&request.method, &target, address).await
        };
        let connection = tokio::select! {
            biased;
            _ = cancellation.cancelled() => return Err(unavailable),
            result = timeout_at(deadline, connect) => {
                result.map_err(|_| unavailable)?.map_err(|_| unavailable)?
            }
        };
        // DNS and the handshake can outlast the grant. Check again before any
        // credential-bearing bytes can be dispatched.
        if Instant::now() >= deadline
            || SystemTime::now() >= expires_at
            || cancellation.is_cancelled()
        {
            return Err(unavailable);
        }
        let response = tokio::select! {
            biased;
            _ = cancellation.cancelled() => return Err(interrupted),
            result = timeout_at(deadline, connection.send(&request, &target)) => {
                result.map_err(|_| interrupted)?.map_err(|_| interrupted)?
            }
        };
        Ok(chat_response(
            response,
            request.max_response_bytes.min(MAX_RESPONSE),
            deadline,
            cancellation,
        ))
    }
}

pub(super) fn chat_http_request(
    target: String,
    mut authorization: HeaderValue,
    body: Vec<u8>,
    max_response_bytes: usize,
) -> Request {
    let mut request = Request::new(Method::POST, target, body);
    request.max_response_bytes = max_response_bytes;
    authorization.set_sensitive(true);
    request.headers.insert("authorization", authorization);
    request
        .headers
        .insert("content-type", HeaderValue::from_static("application/json"));
    request
        .headers
        .insert("accept", HeaderValue::from_static("text/event-stream"));
    request
}

fn chat_response(
    response: ConnectionResponse,
    limit: usize,
    deadline: Instant,
    cancellation: CancellationToken,
) -> TransportResponse {
    let ConnectionResponse {
        status,
        headers,
        body,
        connection,
    } = response;
    let request_id = single_header(&headers, "x-request-id")
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 128
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
        })
        .map(str::to_owned);
    let retry_after_ms = single_header(&headers, "retry-after")
        .filter(|value| value.bytes().all(|byte| byte.is_ascii_digit()))
        .and_then(|value| value.parse::<u64>().ok())
        .and_then(|seconds| seconds.checked_mul(1000));
    let unsafe_body = unsafe_response_body(&headers, limit) != Ok(false);
    let body =
        if matches!(status, 204 | 205 | 300..=399 | 401..=403) || (status >= 400 && unsafe_body) {
            stream::empty().boxed()
        } else if unsafe_body {
            // Keep the receipt when an oversized or encoded success body is refused.
            stream::once(async { Err(TransportFailure::Interrupted) }).boxed()
        } else {
            let state = ChatBody {
                body,
                _connection: connection,
                deadline,
                cancellation,
                remaining: limit,
            };
            stream::try_unfold(state, |mut state| async move {
                let chunk = state.read().await?;
                Ok(chunk.map(|chunk| (chunk, state)))
            })
            .boxed()
        };
    TransportResponse {
        status,
        request_id,
        retry_after_ms,
        body,
    }
}

fn single_header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let mut values = headers.get_all(name).iter();
    let value = values.next()?.to_str().ok()?;
    values.next().is_none().then_some(value)
}

struct ChatBody {
    body: hyper::body::Incoming,
    _connection: Connection,
    deadline: Instant,
    cancellation: CancellationToken,
    remaining: usize,
}

impl ChatBody {
    async fn read(&mut self) -> Result<Option<Vec<u8>>, TransportFailure> {
        let interrupted = TransportFailure::Interrupted;
        loop {
            if Instant::now() >= self.deadline {
                return Err(interrupted);
            }
            let frame = tokio::select! {
                biased;
                _ = self.cancellation.cancelled() => return Err(interrupted),
                result = timeout_at(self.deadline, self.body.frame()) => {
                    result.map_err(|_| interrupted)?
                }
            };
            let Some(frame) = frame else {
                return Ok(None);
            };
            let frame = frame.map_err(|_| interrupted)?;
            let Some(data) = frame.data_ref().filter(|data| !data.is_empty()) else {
                continue;
            };
            self.remaining = self.remaining.checked_sub(data.len()).ok_or(interrupted)?;
            return Ok(Some(data.to_vec()));
        }
    }
}
