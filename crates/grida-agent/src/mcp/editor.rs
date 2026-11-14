//! GRIDA-SEC-004 — private correlated read from the owning Desktop process.

use crate::editor_surfaces::{
    OpenSurfacesSnapshot, open_surfaces_definition, validate_open_surfaces_arguments,
};
use crate::tool_host::{CapabilityCall, CapabilityExecutor, CapabilityReply, ToolHost};
use agent_kit_core::tools::ToolOutcome;
use agent_kit_core::{BindingId, BoxFuture, Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

const MAX_REPLY_BYTES: usize = 17 * 1024;
const REPLY_TIME: Duration = Duration::from_secs(2);

pub(super) struct Pipe(mpsc::Receiver<Pending>);
struct Observe(mpsc::Sender<Pending>);

struct Pending {
    request_id: BindingId,
    deadline: Instant,
    reply: oneshot::Sender<OpenSurfacesSnapshot>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    request_id: &'a BindingId,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reply {
    request_id: BindingId,
    snapshot: OpenSurfacesSnapshot,
}

pub(super) fn tool() -> Result<(ToolHost, Pipe)> {
    let (outgoing, incoming) = mpsc::channel(1);
    let host = ToolHost::new(vec![(
        open_surfaces_definition()?,
        Arc::new(Observe(outgoing)) as Arc<dyn CapabilityExecutor>,
    )])?;
    Ok((host, Pipe(incoming)))
}

impl CapabilityExecutor for Observe {
    fn validate(&self, arguments: &Value) -> Result<()> {
        validate_open_surfaces_arguments(arguments)
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let deadline = call.deadline.min(Instant::now() + REPLY_TIME);
            let (reply, result) = oneshot::channel();
            let sent = self.0.try_send(Pending {
                request_id: call.binding.id.clone(),
                deadline,
                reply,
            });
            let outcome = match sent {
                Err(mpsc::error::TrySendError::Closed(_)) => {
                    ToolOutcome::failed("editor_surface_endpoint_unavailable")
                }
                Err(mpsc::error::TrySendError::Full(_)) => {
                    ToolOutcome::failed("editor_surface_endpoint_busy")
                }
                Ok(()) => tokio::select! {
                    biased;
                    _ = call.cancellation.cancelled() => ToolOutcome::uncertain(),
                    _ = tokio::time::sleep_until(deadline.into()) => ToolOutcome::uncertain(),
                    reply = result => reply.map_or_else(|_| ToolOutcome::uncertain(), OpenSurfacesSnapshot::outcome),
                },
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
        mut self,
        input: impl AsyncRead + Unpin,
        mut output: impl AsyncWrite + Unpin,
    ) -> Result<()> {
        let mut input = BufReader::new(input);
        loop {
            let pending = tokio::select! {
                biased;
                input = input.fill_buf() => {
                    return match input {
                        Ok([]) => Ok(()),
                        _ => Err(pipe_error()),
                    };
                }
                pending = self.0.recv() => pending,
            };
            let Some(pending) = pending else {
                return Ok(());
            };
            if pending.reply.is_closed() || pending.deadline <= Instant::now() {
                continue;
            }
            // The pipe owner drains a dispatched read even if its HTTP caller
            // leaves. An uncorrelated or partial reply retires the whole pipe.
            let snapshot = tokio::time::timeout_at(
                pending.deadline.into(),
                exchange(&mut input, &mut output, &pending.request_id),
            )
            .await
            .map_err(|_| pipe_error())??;
            let _ = pending.reply.send(snapshot);
        }
    }
}

async fn exchange(
    input: &mut BufReader<impl AsyncRead + Unpin>,
    output: &mut (impl AsyncWrite + Unpin),
    request_id: &BindingId,
) -> Result<OpenSurfacesSnapshot> {
    let mut request = serde_json::to_vec(&Read { request_id }).map_err(|_| pipe_error())?;
    request.push(b'\n');
    output.write_all(&request).await.map_err(|_| pipe_error())?;
    output.flush().await.map_err(|_| pipe_error())?;
    let mut bytes = Vec::new();
    (&mut *input)
        .take(MAX_REPLY_BYTES as u64 + 1)
        .read_until(b'\n', &mut bytes)
        .await
        .map_err(|_| pipe_error())?;
    if bytes.len() > MAX_REPLY_BYTES || bytes.pop() != Some(b'\n') {
        return Err(pipe_error());
    }
    let reply: Reply = serde_json::from_slice(&bytes).map_err(|_| pipe_error())?;
    if &reply.request_id != request_id {
        return Err(pipe_error());
    }
    Ok(reply.snapshot)
}

fn pipe_error() -> Error {
    Error::new(ErrorKind::Unavailable, "editor_mcp_pipe_unavailable")
}
