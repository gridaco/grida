//! Framing and queue limits for the SDK's in-process channel transport.

use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::SessionNotification;
use agent_client_protocol::{Client, Error, RawJsonRpcMessage, Result, TransportFrame};
use futures_channel::mpsc::{UnboundedReceiver, UnboundedSender};
use futures_util::StreamExt;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::Semaphore;

pub(super) const MAX_FRAME_BYTES: usize = 1 << 20;
const MAX_QUEUED_INBOUND: usize = 32;
const MAX_OUTSTANDING_REQUESTS: usize = 16;
const MAX_QUEUED_UPDATES: usize = 8;
pub(super) const WRITE_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) struct Delivery {
    requests: AtomicUsize,
    updates: Semaphore,
}

impl Delivery {
    pub(super) fn new() -> Self {
        Self {
            requests: AtomicUsize::new(0),
            updates: Semaphore::new(MAX_QUEUED_UPDATES),
        }
    }

    fn reserve_request(&self) -> Result<()> {
        self.requests
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                (count < MAX_OUTSTANDING_REQUESTS).then_some(count + 1)
            })
            .map(|_| ())
            .map_err(|_| wire_error("too_many_outstanding_requests"))
    }

    pub(super) fn delivered(&self, frame: &TransportFrame) {
        match frame {
            TransportFrame::Single(RawJsonRpcMessage::Response(_)) => {
                let _ = self
                    .requests
                    .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                        count.checked_sub(1)
                    });
            }
            TransportFrame::Single(RawJsonRpcMessage::Notification(notification))
                if &*notification.method == "session/update" =>
            {
                self.updates.add_permits(1);
            }
            _ => {}
        }
    }

    pub(super) fn receive(
        &self,
        line: &str,
        incoming: &UnboundedSender<TransportFrame>,
    ) -> Result<bool> {
        if line.len() >= MAX_FRAME_BYTES {
            return Err(wire_error("acp_input_frame_too_large"));
        }
        let frame = match TransportFrame::parse_json(line) {
            // The SDK parser includes the raw line in parse-error data. Keep the
            // diagnostic small and leave supplied payloads out of responses.
            TransportFrame::Malformed { raw, error } => {
                let error = if error.code == Error::parse_error().code {
                    Error::parse_error()
                } else {
                    error
                };
                TransportFrame::Malformed { raw, error }
            }
            valid => valid,
        };
        if matches!(
            frame,
            TransportFrame::Single(RawJsonRpcMessage::Request(_))
                | TransportFrame::Malformed { .. }
        ) {
            self.reserve_request()?;
        }
        if incoming.len() >= MAX_QUEUED_INBOUND {
            return Err(wire_error("acp_input_queue_full"));
        }
        Ok(incoming.unbounded_send(frame).is_ok())
    }

    pub(super) async fn send(
        &self,
        connection: &ConnectionTo<Client>,
        notification: SessionNotification,
    ) -> Result<()> {
        self.send_if(|| {
            connection.send_notification(notification)?;
            Ok(true)
        })
        .await
    }

    pub(super) async fn send_if(&self, enqueue: impl FnOnce() -> Result<bool>) -> Result<()> {
        let permit = self
            .updates
            .acquire()
            .await
            .map_err(|_| wire_error("connection_closed"))?;
        if enqueue()? {
            permit.forget();
        }
        Ok(())
    }
}

pub(super) async fn read(
    input: impl AsyncRead + Unpin,
    incoming: UnboundedSender<TransportFrame>,
    delivery: std::sync::Arc<Delivery>,
) -> Result<()> {
    let mut reader = BufReader::new(input);
    let mut bytes = Vec::new();
    loop {
        bytes.clear();
        let count = (&mut reader)
            .take(MAX_FRAME_BYTES as u64 + 1)
            .read_until(b'\n', &mut bytes)
            .await
            .map_err(|_| wire_error("stdio_read_failed"))?;
        if count == 0 {
            return Ok(());
        }
        if count > MAX_FRAME_BYTES || bytes.last() != Some(&b'\n') {
            return Err(wire_error("invalid_stdio_frame_length"));
        }
        let line = std::str::from_utf8(&bytes[..count - 1])
            .map_err(|_| wire_error("invalid_stdio_frame_utf8"))?;
        if !delivery.receive(line, &incoming)? {
            return Ok(());
        }
    }
}

pub(super) async fn write(
    mut output: impl AsyncWrite + Unpin,
    mut outgoing: UnboundedReceiver<TransportFrame>,
    delivery: std::sync::Arc<Delivery>,
) -> Result<()> {
    while let Some(frame) = outgoing.next().await {
        let line = frame.to_json()?;
        if line.len() >= MAX_FRAME_BYTES {
            return Err(wire_error("stdio_output_frame_too_large"));
        }
        tokio::time::timeout(WRITE_TIMEOUT, async {
            output.write_all(line.as_bytes()).await?;
            output.write_all(b"\n").await?;
            output.flush().await
        })
        .await
        .map_err(|_| wire_error("stdio_write_timeout"))?
        .map_err(|_| wire_error("stdio_write_failed"))?;
        delivery.delivered(&frame);
    }
    Ok(())
}

pub(super) fn wire_error(code: &'static str) -> Error {
    Error::new(-32603, code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp::{ConnectionSessions, observation::Retirement};
    use agent_kit_core::SessionId;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn update_waiting_for_output_capacity_rechecks_the_retired_attachment() {
        let delivery = Delivery::new();
        let session = SessionId::new("session").unwrap();
        let sessions = Arc::new(Mutex::new(ConnectionSessions::default()));
        sessions.lock().unwrap().attached.insert(session.clone());
        for _ in 0..MAX_QUEUED_UPDATES {
            delivery.send_if(|| Ok(true)).await.unwrap();
        }
        let update = delivery.send_if(|| {
            assert!(!sessions.lock().unwrap().can_deliver(&session));
            Ok(false)
        });
        tokio::pin!(update);
        assert!(
            tokio::time::timeout(Duration::ZERO, &mut update)
                .await
                .is_err()
        );
        let fence = Retirement::begin(&sessions, &session).unwrap().unwrap();
        fence.revoke();
        drop(fence);
        delivery.updates.add_permits(1);
        update.await.unwrap();
        assert_eq!(delivery.updates.available_permits(), 1);
    }
}
