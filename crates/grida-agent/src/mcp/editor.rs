//! GRIDA-SEC-004 — private correlated read from the owning Desktop process.

use crate::editor_surfaces::{
    LIST_OPEN,
    mcp::{capability_definition, project, protocol_error},
};
use crate::tool_host::{
    CapabilityCall, CapabilityEffect, CapabilityExecutor, CapabilityReply, ToolHost,
};
use agent_kit_core::tools::ToolOutcome;
use agent_kit_core::{BoxFuture, Error, ErrorKind, Result};
use rmcp::model::{
    CallToolRequest, CallToolRequestParams, ClientCapabilities, ClientJsonRpcMessage,
    ClientRequest, GetMeta, Implementation, ListToolsRequest, PaginatedRequestParams,
    ProtocolVersion, RequestId, RequestMetaObject, ServerJsonRpcMessage, ServerResult, Tool,
};
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
    id: RequestId,
    request: CallToolRequestParams,
    version: u32,
    deadline: Instant,
    reply: oneshot::Sender<ServerJsonRpcMessage>,
}

pub(super) async fn tool(
    input: &mut BufReader<impl AsyncRead + Unpin>,
    output: &mut (impl AsyncWrite + Unpin),
) -> Result<(ToolHost, Pipe, Tool)> {
    let id = RequestId::String(uuid::Uuid::new_v4().to_string().into());
    let request = ListToolsRequest::with_param(PaginatedRequestParams::default()).into();
    let result = tokio::time::timeout(REPLY_TIME, exchange(input, output, id, request, None))
        .await
        .map_err(|_| pipe_error())??;
    let ServerJsonRpcMessage::Response(reply) = result else {
        return Err(pipe_error());
    };
    let ServerResult::ListToolsResult(mut list) = reply.result else {
        return Err(pipe_error());
    };
    if list.next_cursor.is_some() || list.tools.len() != 1 {
        return Err(pipe_error());
    }
    let descriptor = list.tools.pop().ok_or_else(pipe_error)?;
    let definition = capability_definition(descriptor.clone())
        .filter(|definition| {
            definition.tool.id.as_str() == LIST_OPEN && definition.effect == CapabilityEffect::Read
        })
        .ok_or_else(pipe_error)?;
    let (outgoing, incoming) = mpsc::channel(1);
    let host = ToolHost::new(vec![(
        definition,
        Arc::new(Observe(outgoing)) as Arc<dyn CapabilityExecutor>,
    )])?;
    Ok((host, Pipe(incoming), descriptor))
}

impl CapabilityExecutor for Observe {
    fn validate(&self, arguments: &Value) -> Result<()> {
        if arguments.is_object() {
            Ok(())
        } else {
            Err(Error::new(
                ErrorKind::InvalidInput,
                "desktop_tool_requires_object",
            ))
        }
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let Some(arguments) = call.arguments.as_object() else {
                return CapabilityReply {
                    binding: call.binding,
                    outcome: ToolOutcome::failed("desktop_tool_requires_object"),
                };
            };
            let deadline = call.deadline.min(Instant::now() + REPLY_TIME);
            let (reply, result) = oneshot::channel();
            let sent = self.0.try_send(Pending {
                id: RequestId::String(call.binding.id.as_str().into()),
                request: CallToolRequestParams::new(call.capability.as_str().to_owned())
                    .with_arguments(arguments.clone()),
                version: call.version,
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
                    reply = result => match reply {
                        Ok(ServerJsonRpcMessage::Response(reply)) => match reply.result {
                            ServerResult::CallToolResult(result) => project(result),
                            _ => ToolOutcome::uncertain(),
                        },
                        Ok(ServerJsonRpcMessage::Error(reply)) => protocol_error(reply.error),
                        _ => ToolOutcome::uncertain(),
                    },
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
        mut input: BufReader<impl AsyncRead + Unpin>,
        mut output: impl AsyncWrite + Unpin,
    ) -> Result<()> {
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
            let result = tokio::time::timeout_at(
                pending.deadline.into(),
                exchange(
                    &mut input,
                    &mut output,
                    pending.id,
                    CallToolRequest::new(pending.request).into(),
                    Some(pending.version),
                ),
            )
            .await
            .map_err(|_| pipe_error())??;
            let _ = pending.reply.send(result);
        }
    }
}

async fn exchange(
    input: &mut BufReader<impl AsyncRead + Unpin>,
    output: &mut (impl AsyncWrite + Unpin),
    id: RequestId,
    mut body: ClientRequest,
    version: Option<u32>,
) -> Result<ServerJsonRpcMessage> {
    let metadata = body.get_meta_mut();
    *metadata = RequestMetaObject::with_client_context(
        ProtocolVersion::V_2026_07_28,
        Implementation::new("grida-agent", env!("CARGO_PKG_VERSION")),
        ClientCapabilities::default(),
    );
    if let Some(version) = version {
        metadata.insert("co.grida/definitionRevision".to_owned(), version.into());
    }
    let wire = ClientJsonRpcMessage::request(body, id.clone());
    let mut request = serde_json::to_vec(&wire).map_err(|_| pipe_error())?;
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
    let reply = serde_json::from_slice(&bytes).map_err(|_| pipe_error())?;
    match &reply {
        ServerJsonRpcMessage::Response(response) if response.id == id => Ok(reply),
        ServerJsonRpcMessage::Error(error) if error.id.as_ref() == Some(&id) => Ok(reply),
        _ => Err(pipe_error()),
    }
}

fn pipe_error() -> Error {
    Error::new(ErrorKind::Unavailable, "editor_mcp_pipe_unavailable")
}
