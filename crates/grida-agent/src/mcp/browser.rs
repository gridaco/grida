//! GRIDA-SEC-004 — correlated browser calls to the opted-in Desktop owner.

use crate::browser_tools::{self, Capture, Reply};
use crate::tool_host::{CapabilityCall, CapabilityExecutor, CapabilityReply, ToolHost};
use agent_kit_core::{BindingId, BoxFuture, CancellationToken, Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

const MAX_PENDING: usize = 8;
const DRAIN_TIME: Duration = Duration::from_secs(2);
const POLL_TIME: Duration = Duration::from_millis(20);

pub(super) struct Pipe(mpsc::Receiver<Pending>);
struct Execute {
    outgoing: mpsc::Sender<Pending>,
    operation: &'static str,
}

struct Pending {
    request_id: BindingId,
    operation: String,
    arguments: Value,
    deadline: Instant,
    cancellation: CancellationToken,
    reply: oneshot::Sender<Reply>,
}

struct Dispatched {
    deadline: Instant,
    cancellation: CancellationToken,
    reply: oneshot::Sender<Reply>,
    drain_deadline: Option<Instant>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Request<'a> {
    request_id: &'a BindingId,
    operation: &'a str,
    arguments: &'a Value,
    timeout_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Cancel<'a> {
    cancel_request_id: &'a BindingId,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Response {
    request_id: BindingId,
    result: Reply,
}

struct ReceivedResponse {
    frame: Response,
    received_at: Instant,
}

pub(super) fn tools() -> Result<(ToolHost, Pipe)> {
    let (outgoing, incoming) = mpsc::channel(MAX_PENDING);
    let host = ToolHost::new(browser_tools::definitions(|operation| {
        Arc::new(Execute {
            outgoing: outgoing.clone(),
            operation,
        })
    })?)?;
    Ok((host, Pipe(incoming)))
}

impl CapabilityExecutor for Execute {
    fn validate(&self, arguments: &Value) -> Result<()> {
        browser_tools::validate(self.operation, arguments)
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let deadline = browser_tools::deadline(&call);
            let (reply, result) = oneshot::channel();
            let sent = self.outgoing.try_send(Pending {
                request_id: call.binding.id.clone(),
                operation: self.operation.to_owned(),
                arguments: call.arguments.clone(),
                deadline,
                cancellation: call.cancellation.clone(),
                reply,
            });
            let outcome = match sent {
                Err(mpsc::error::TrySendError::Closed(_)) => {
                    browser_tools::unavailable("browser_owner_unavailable")
                }
                Err(mpsc::error::TrySendError::Full(_)) => {
                    browser_tools::unavailable("browser_owner_busy")
                }
                Ok(()) => {
                    let reply = tokio::select! {
                        biased;
                        _ = call.cancellation.cancelled() => None,
                        _ = tokio::time::sleep_until(deadline.into()) => None,
                        reply = result => reply.ok(),
                    };
                    match reply {
                        Some(reply) => reply.outcome(&call, Capture::Mcp).await,
                        None => browser_tools::uncertain(),
                    }
                }
            };
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

impl Pipe {
    pub(super) async fn run(
        self,
        input: impl AsyncRead + Unpin,
        output: impl AsyncWrite + Unpin,
    ) -> Result<()> {
        let (replies, responses) = mpsc::channel(MAX_PENDING);
        // Keep read_until out of the per-call select. A request from another
        // client cannot discard the partial bytes of an in-flight response.
        tokio::select! {
            biased;
            result = read_responses(input, replies) => result,
            result = self.dispatch(output, responses) => result,
        }
    }

    async fn dispatch(
        mut self,
        mut output: impl AsyncWrite + Unpin,
        mut responses: mpsc::Receiver<ReceivedResponse>,
    ) -> Result<()> {
        let mut dispatched = BTreeMap::<BindingId, Dispatched>::new();
        let mut maintenance =
            tokio::time::interval_at(tokio::time::Instant::now() + POLL_TIME, POLL_TIME);
        maintenance.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                biased;
                // Process received replies before expiring a drain. At most MAX_PENDING
                // valid replies can run before maintenance, which precedes new dispatches.
                response = responses.recv() => {
                    let Some(ReceivedResponse { frame, received_at }) = response else { return Ok(()); };
                    let pending = dispatched.remove(&frame.request_id).ok_or_else(pipe_error)?;
                    if pending.drain_deadline.is_some_and(|deadline| received_at >= deadline) {
                        return Err(pipe_error());
                    }
                    let _ = pending.reply.send(frame.result);
                }
                _ = maintenance.tick(), if !dispatched.is_empty() => {
                    let now = Instant::now();
                    for (id, pending) in &mut dispatched {
                        if let Some(drain) = pending.drain_deadline {
                            if drain <= now {
                                return Err(pipe_error());
                            }
                        } else if pending.cancellation.is_cancelled()
                            || pending.reply.is_closed() || pending.deadline <= now
                        {
                            write_frame(
                                &mut output,
                                &Cancel { cancel_request_id: id },
                                Instant::now() + DRAIN_TIME,
                            ).await?;
                            // The owner only gets a full drain window after its cancel is sent.
                            pending.drain_deadline = Some(Instant::now() + DRAIN_TIME);
                        }
                    }
                }
                pending = self.0.recv(), if dispatched.len() < MAX_PENDING => {
                    let Some(pending) = pending else { return Ok(()); };
                    if pending.reply.is_closed() || pending.cancellation.is_cancelled() {
                        continue;
                    }
                    let Some(timeout_ms) = browser_tools::owner_timeout(pending.deadline) else {
                        continue;
                    };
                    write_frame(&mut output, &Request {
                        request_id: &pending.request_id,
                        operation: &pending.operation,
                        arguments: &pending.arguments,
                        timeout_ms,
                    }, pending.deadline).await?;
                    if dispatched.insert(pending.request_id, Dispatched {
                        deadline: pending.deadline,
                        cancellation: pending.cancellation,
                        reply: pending.reply,
                        drain_deadline: None,
                    }).is_some() {
                        return Err(pipe_error());
                    }
                }
            }
        }
    }
}

async fn read_responses(
    input: impl AsyncRead + Unpin,
    replies: mpsc::Sender<ReceivedResponse>,
) -> Result<()> {
    let mut input = BufReader::new(input);
    let mut bytes = Vec::new();
    loop {
        bytes.clear();
        let read = (&mut input)
            .take(browser_tools::MAX_REPLY_BYTES as u64 + 1)
            .read_until(b'\n', &mut bytes)
            .await
            .map_err(|_| pipe_error())?;
        if read == 0 {
            return Ok(());
        }
        if bytes.len() > browser_tools::MAX_REPLY_BYTES || bytes.pop() != Some(b'\n') {
            return Err(pipe_error());
        }
        let received_at = Instant::now();
        let frame = serde_json::from_slice(&bytes).map_err(|_| pipe_error())?;
        if replies
            .send(ReceivedResponse { frame, received_at })
            .await
            .is_err()
        {
            return Ok(());
        }
    }
}

async fn write_frame(
    output: &mut (impl AsyncWrite + Unpin),
    frame: &impl Serialize,
    deadline: Instant,
) -> Result<()> {
    let mut bytes = serde_json::to_vec(frame).map_err(|_| pipe_error())?;
    if bytes.len() >= 64 * 1024 {
        return Err(pipe_error());
    }
    bytes.push(b'\n');
    tokio::time::timeout_at(deadline.into(), async {
        output.write_all(&bytes).await?;
        output.flush().await
    })
    .await
    .map_err(|_| pipe_error())?
    .map_err(|_| pipe_error())
}

fn pipe_error() -> Error {
    Error::new(
        ErrorKind::Unavailable,
        "editor_mcp_browser_pipe_unavailable",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::ToolId;
    use agent_kit_core::messages::OutcomeStatus;
    use serde_json::json;

    fn observed_reply(id: &str) -> ReceivedResponse {
        ReceivedResponse {
            frame: serde_json::from_value(json!({
                "requestId":id,
                "result":{"disposition":"dispatched_verified"}
            }))
            .unwrap(),
            received_at: Instant::now(),
        }
    }

    #[tokio::test]
    async fn cancellation_names_only_the_dispatched_browser_call_and_drains_its_reply() {
        let (host, pipe) = tools().unwrap();
        let grant = host.grant(&ToolId::new("browser_open").unwrap()).unwrap();
        let (peer, transport) = tokio::io::duplex(4096);
        let (reader, writer) = tokio::io::split(transport);
        let pipe = tokio::spawn(pipe.run(reader, writer));
        let (reader, mut writer) = tokio::io::split(peer);
        let mut reader = BufReader::new(reader).lines();
        let cancellation = CancellationToken::new();
        let call = |token| {
            let grant = grant.clone();
            tokio::spawn(async move {
                grant
                    .invoke(
                        1,
                        json!({"url":"http://127.0.0.1/"}),
                        token,
                        Instant::now() + Duration::from_secs(3),
                        4096,
                    )
                    .await
                    .unwrap()
            })
        };
        let pending = call(cancellation.clone());
        let initial: Value =
            serde_json::from_str(&reader.next_line().await.unwrap().unwrap()).unwrap();
        cancellation.cancel();
        let cancelled: Value =
            serde_json::from_str(&reader.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(cancelled, json!({"cancelRequestId":initial["requestId"]}));
        assert_eq!(pending.await.unwrap().status, OutcomeStatus::Uncertain);
        let abandoned = json!({"requestId":initial["requestId"],"result":{"disposition":"not_dispatched","error":"cancelled"}});
        writer
            .write_all(format!("{abandoned}\n").as_bytes())
            .await
            .unwrap();

        let next = call(CancellationToken::new());
        let request: Value =
            serde_json::from_str(&reader.next_line().await.unwrap().unwrap()).unwrap();
        assert_ne!(request["requestId"], initial["requestId"]);
        let response = json!({"requestId":request["requestId"],"result":{"disposition":"dispatched_verified"}});
        writer
            .write_all(format!("{response}\n").as_bytes())
            .await
            .unwrap();
        assert_eq!(next.await.unwrap().status, OutcomeStatus::Succeeded);
        host.close();
        writer.shutdown().await.unwrap();
        pipe.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn elapsed_cancellation_poll_runs_with_an_unrelated_reply_ready() {
        let (outgoing, incoming) = mpsc::channel(MAX_PENDING);
        let (replies, responses) = mpsc::channel(MAX_PENDING);
        let (peer, output) = tokio::io::duplex(4096);
        let mut frames = BufReader::new(peer).lines();
        let mut dispatch = std::pin::pin!(Pipe(incoming).dispatch(output, responses));

        let cancellation = CancellationToken::new();
        let mut waiters = Vec::new();
        for (id, cancellation) in [
            ("cancelled", cancellation.clone()),
            ("unrelated", CancellationToken::new()),
        ] {
            let (reply, waiter) = oneshot::channel();
            waiters.push(waiter);
            outgoing
                .send(Pending {
                    request_id: BindingId::new(id).unwrap(),
                    operation: "browser_open".to_owned(),
                    arguments: json!({"url":"http://127.0.0.1/"}),
                    deadline: Instant::now() + Duration::from_secs(3),
                    cancellation,
                    reply,
                })
                .await
                .unwrap();
        }
        assert!(futures_util::poll!(&mut dispatch).is_pending());
        for id in ["cancelled", "unrelated"] {
            let frame: Value =
                serde_json::from_str(&frames.next_line().await.unwrap().unwrap()).unwrap();
            assert_eq!(frame["requestId"], id);
        }

        cancellation.cancel();
        replies.send(observed_reply("unrelated")).await.unwrap();
        // The dispatcher resumes with both maintenance and a reply ready.
        tokio::time::sleep(POLL_TIME * 2).await;
        assert!(futures_util::poll!(&mut dispatch).is_pending());
        assert!(waiters[1].try_recv().is_ok());
        let frame = tokio::time::timeout(POLL_TIME, frames.next_line())
            .await
            .expect("a ready reply must not postpone cancellation")
            .unwrap()
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&frame).unwrap(),
            json!({"cancelRequestId":"cancelled"})
        );
    }

    #[tokio::test]
    async fn each_cancellation_gets_a_full_drain_window_after_its_write_flushes() {
        let (outgoing, incoming) = mpsc::channel(MAX_PENDING);
        let (replies, responses) = mpsc::channel(MAX_PENDING);
        let (peer, output) = tokio::io::duplex(1);
        let pipe = tokio::spawn(Pipe(incoming).dispatch(output, responses));
        let mut frames = BufReader::new(peer);
        let cancellation = CancellationToken::new();
        let mut waiters = Vec::new();
        for (id, cancellation) in [
            ("first", cancellation.clone()),
            ("second", cancellation.clone()),
            ("unrelated", CancellationToken::new()),
        ] {
            let (reply, waiter) = oneshot::channel();
            waiters.push(waiter);
            outgoing
                .send(Pending {
                    request_id: BindingId::new(id).unwrap(),
                    operation: "browser_open".to_owned(),
                    arguments: json!({"url":"http://127.0.0.1/"}),
                    deadline: Instant::now() + Duration::from_secs(10),
                    cancellation,
                    reply,
                })
                .await
                .unwrap();
            let mut line = String::new();
            tokio::time::timeout(Duration::from_secs(1), frames.read_line(&mut line))
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&line).unwrap()["requestId"],
                id
            );
        }

        cancellation.cancel();
        let prefix = tokio::time::timeout(Duration::from_secs(1), frames.read_u8())
            .await
            .unwrap()
            .unwrap();
        let pre_flush_deadline = Instant::now() + DRAIN_TIME;
        // The first frame cannot flush while the one-byte transport is full.
        tokio::time::sleep(POLL_TIME * 25).await;
        for (id, mut line) in [
            ("first", char::from(prefix).to_string()),
            ("second", String::new()),
        ] {
            tokio::time::timeout(Duration::from_secs(1), frames.read_line(&mut line))
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&line).unwrap(),
                json!({"cancelRequestId":id})
            );
        }
        replies.send(observed_reply("first")).await.unwrap();
        tokio::time::sleep_until((pre_flush_deadline + POLL_TIME).into()).await;
        replies.send(observed_reply("second")).await.unwrap();
        replies.send(observed_reply("unrelated")).await.unwrap();
        for waiter in waiters {
            tokio::time::timeout(Duration::from_secs(1), waiter)
                .await
                .unwrap()
                .unwrap();
        }
        drop(outgoing);
        pipe.await.unwrap().unwrap();
    }

    async fn delayed_drain(reply_queued_before_expiry: bool) {
        let (outgoing, incoming) = mpsc::channel(MAX_PENDING);
        let (replies, responses) = mpsc::channel(MAX_PENDING);
        let (peer, output) = tokio::io::duplex(4096);
        let mut frames = BufReader::new(peer).lines();
        let mut dispatch = std::pin::pin!(Pipe(incoming).dispatch(output, responses));

        let cancellation = CancellationToken::new();
        let mut waiters = Vec::new();
        for (id, cancellation) in [
            ("cancelled", cancellation.clone()),
            ("unrelated", CancellationToken::new()),
        ] {
            let (reply, waiter) = oneshot::channel();
            waiters.push(waiter);
            outgoing
                .send(Pending {
                    request_id: BindingId::new(id).unwrap(),
                    operation: "browser_open".to_owned(),
                    arguments: json!({"url":"http://127.0.0.1/"}),
                    deadline: Instant::now() + Duration::from_secs(10),
                    cancellation,
                    reply,
                })
                .await
                .unwrap();
        }
        assert!(futures_util::poll!(&mut dispatch).is_pending());
        for id in ["cancelled", "unrelated"] {
            let frame = tokio::time::timeout(Duration::from_secs(1), frames.next_line())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&frame).unwrap()["requestId"],
                id
            );
        }

        cancellation.cancel();
        tokio::time::sleep(POLL_TIME * 2).await;
        assert!(futures_util::poll!(&mut dispatch).is_pending());
        let frame = tokio::time::timeout(POLL_TIME, frames.next_line())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&frame).unwrap(),
            json!({"cancelRequestId":"cancelled"})
        );

        if reply_queued_before_expiry {
            replies.send(observed_reply("cancelled")).await.unwrap();
            replies.send(observed_reply("unrelated")).await.unwrap();
        }
        // Model the dispatcher resuming after backpressure on a write.
        tokio::time::sleep(DRAIN_TIME + POLL_TIME).await;
        if reply_queued_before_expiry {
            assert!(futures_util::poll!(&mut dispatch).is_pending());
            assert!(waiters.iter_mut().all(|waiter| waiter.try_recv().is_ok()));
        } else {
            replies.send(observed_reply("cancelled")).await.unwrap();
            assert!(matches!(
                futures_util::poll!(&mut dispatch),
                std::task::Poll::Ready(Err(_))
            ));
        }
    }

    #[tokio::test]
    async fn a_timely_queued_reply_survives_a_delayed_drain_check() {
        delayed_drain(true).await;
    }

    #[tokio::test]
    async fn a_reply_received_after_the_drain_deadline_retires_the_pipe() {
        delayed_drain(false).await;
    }
}
