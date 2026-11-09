//! GRIDA-SEC-004 / GRIDA-SEC-014 — provider HTTP on the private supervising pipe.

use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::{Client, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use agent_kit_core::inference::RequestControl;
use agent_kit_core::{Error, ErrorKind, Result};
use agent_kit_providers::{TransportFailure, TransportResponse};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures_util::StreamExt;
use reqwest::{Url, header::HeaderMap};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use uuid::Uuid;

pub(crate) const CAPABILITY: &str = "co.grida/provider/egress";
const UPLOAD_CHUNK: usize = 64 * 1024;
const READ_CHUNK: usize = 32 * 1024;
const REQUEST_LIMIT: usize = 1024 * 1024;
const RESPONSE_LIMIT: usize = 4 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone, Default)]
pub struct SupervisedProvider {
    connection: Arc<Mutex<Connection>>,
}

#[derive(Default)]
enum Connection {
    #[default]
    Waiting,
    Attached(ConnectionTo<Client>),
    Closed,
}

impl SupervisedProvider {
    pub(crate) fn attach(&self, connection: ConnectionTo<Client>) -> Result<()> {
        let mut current = self.connection.lock().unwrap();
        if !matches!(*current, Connection::Waiting) {
            return Err(Error::new(
                ErrorKind::Conflict,
                "provider_supervisor_attached",
            ));
        }
        *current = Connection::Attached(connection);
        Ok(())
    }

    pub(crate) fn detach(&self) {
        *self.connection.lock().unwrap() = Connection::Closed;
    }

    pub(crate) async fn send(
        &self,
        target: Url,
        headers: HeaderMap,
        body: Vec<u8>,
        max_response_bytes: usize,
        control: RequestControl,
    ) -> std::result::Result<TransportResponse, TransportFailure> {
        use TransportFailure::{Interrupted, Unavailable};
        if body.is_empty()
            || body.len() > REQUEST_LIMIT
            || !(1..=RESPONSE_LIMIT).contains(&max_response_bytes)
        {
            return Err(Unavailable);
        }
        let connection = match &*self.connection.lock().unwrap() {
            Connection::Attached(connection) => connection.clone(),
            _ => return Err(Unavailable),
        };
        let deadline = control
            .deadline
            .unwrap_or_else(|| Instant::now() + TIMEOUT)
            .min(Instant::now() + TIMEOUT);
        let timeout_ms = deadline
            .saturating_duration_since(Instant::now())
            .as_millis() as u64;
        if timeout_ms == 0 || control.cancellation.is_cancelled() {
            return Err(Unavailable);
        }
        let mut projected = Vec::with_capacity(headers.len());
        for (name, value) in &headers {
            projected.push((
                name.to_string(),
                value.to_str().map_err(|_| Unavailable)?.to_owned(),
            ));
        }
        let stream = Exchange {
            id: Uuid::new_v4().to_string(),
            connection,
            control,
            deadline,
        };
        let mut chunks = body.chunks(UPLOAD_CHUNK);
        let initial = STANDARD.encode(chunks.next().ok_or(Unavailable)?);
        let reply = stream
            .exchange(Action::Open {
                target: target.to_string(),
                headers: projected,
                timeout_ms,
                max_response_bytes,
                initial,
            })
            .await
            .ok_or(Unavailable)?;
        if !matches!(reply, Reply::Accepted) {
            return Err(Unavailable);
        }
        for chunk in chunks {
            let reply = stream
                .exchange(Action::Append {
                    data: STANDARD.encode(chunk),
                })
                .await;
            if !matches!(reply, Some(Reply::Accepted)) {
                return Err(Unavailable);
            }
        }
        if stream.control.cancellation.is_cancelled() || stream.deadline <= Instant::now() {
            return Err(Unavailable);
        }
        let (status, request_id, retry_after_ms) = match stream.exchange(Action::Dispatch).await {
            Some(Reply::Ready {
                http_status,
                request_id,
                retry_after_ms,
            }) if (200..600).contains(&http_status) => (http_status, request_id, retry_after_ms),
            Some(Reply::Unavailable) => return Err(Unavailable),
            _ => return Err(Interrupted),
        };
        let request_id = request_id.filter(|id| {
            !id.is_empty()
                && id.len() <= 128
                && id.bytes().all(|byte| {
                    byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.' | b':')
                })
        });
        let body = futures_util::stream::try_unfold(
            (stream, 0usize),
            move |(stream, consumed)| async move {
                match stream.exchange(Action::Read).await {
                    Some(Reply::End) => Ok(None),
                    Some(Reply::Chunk { data }) if data.len() <= READ_CHUNK.div_ceil(3) * 4 => {
                        let bytes = STANDARD.decode(data).map_err(|_| Interrupted)?;
                        if bytes.is_empty() || bytes.len() > READ_CHUNK {
                            return Err(Interrupted);
                        }
                        let total = consumed
                            .checked_add(bytes.len())
                            .filter(|total| *total <= max_response_bytes)
                            .ok_or(Interrupted)?;
                        Ok(Some((bytes, (stream, total))))
                    }
                    _ => Err(Interrupted),
                }
            },
        )
        .boxed();
        Ok(TransportResponse {
            status,
            request_id,
            retry_after_ms,
            body,
        })
    }
}

struct Exchange {
    id: String,
    connection: ConnectionTo<Client>,
    control: RequestControl,
    deadline: Instant,
}

impl Exchange {
    async fn exchange(&self, action: Action) -> Option<Reply> {
        tokio::select! {
            biased;
            _ = self.control.cancellation.cancelled() => None,
            _ = tokio::time::sleep_until(self.deadline.into()) => None,
            reply = async {
                self.connection.send_request(Request { id: self.id.clone(), action })
                    .block_task().await
            } => reply.ok(),
        }
    }
}

impl Drop for Exchange {
    fn drop(&mut self) {
        let _ = self.connection.send_notification(Cancel {
            id: self.id.clone(),
        });
    }
}

#[derive(Clone, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/provider/exchange", response = Reply)]
struct Request {
    id: String,
    #[serde(flatten)]
    action: Action,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
enum Action {
    Open {
        target: String,
        headers: Vec<(String, String)>,
        timeout_ms: u64,
        max_response_bytes: usize,
        initial: String,
    },
    Append {
        data: String,
    },
    Dispatch,
    Read,
}

#[derive(Clone, Serialize, Deserialize, JsonRpcResponse)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
enum Reply {
    Accepted,
    Ready {
        http_status: u16,
        request_id: Option<String>,
        retry_after_ms: Option<u64>,
    },
    Chunk {
        data: String,
    },
    End,
    Unavailable,
    Interrupted,
}

impl std::fmt::Debug for Request {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SupervisedProviderRequest")
    }
}

impl std::fmt::Debug for Reply {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SupervisedProviderReply")
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcNotification)]
#[notification(method = "_co.grida/provider/cancel")]
struct Cancel {
    id: String,
}
