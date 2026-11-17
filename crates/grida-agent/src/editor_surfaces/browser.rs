//! GRIDA-SEC-004 — browser operations are addressed to one captured editor binding.

use super::EditorSurfaces;
use crate::browser_tools::{self, Capture, Reply};
use crate::file_tools::ImageCapture;
use crate::tool_host::{CapabilityCall, CapabilityDefinition, CapabilityExecutor, CapabilityReply};
use agent_client_protocol::{JsonRpcRequest, JsonRpcResponse};
use agent_kit_core::{BindingId, BoxFuture, Result, SessionId};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

pub(super) fn tools(
    owner: EditorSurfaces,
    session_id: SessionId,
    endpoint_id: BindingId,
    capture: Option<Arc<ImageCapture>>,
) -> Result<Vec<(CapabilityDefinition, Arc<dyn CapabilityExecutor>)>> {
    browser_tools::definitions(|operation| {
        Arc::new(Execute {
            owner: owner.clone(),
            session_id: session_id.clone(),
            endpoint_id: endpoint_id.clone(),
            operation,
            capture: Capture::Native(capture.clone()),
        })
    })
}

struct Execute {
    owner: EditorSurfaces,
    session_id: SessionId,
    endpoint_id: BindingId,
    operation: &'static str,
    capture: Capture,
}

impl CapabilityExecutor for Execute {
    fn validate(&self, arguments: &Value) -> Result<()> {
        browser_tools::validate(self.operation, arguments)
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = self.request(&call).await;
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

impl Execute {
    async fn request(&self, call: &CapabilityCall) -> agent_kit_core::tools::ToolOutcome {
        let Some(client) = self.owner.browser_client() else {
            return browser_tools::unavailable("browser_owner_unavailable");
        };
        if call.capability.as_str() == browser_tools::CAPTURE && !self.capture.available() {
            return browser_tools::unavailable("browser_capture_media_unavailable");
        }
        let deadline = browser_tools::deadline(call);
        let Some(timeout_ms) = browser_tools::owner_timeout(deadline) else {
            return browser_tools::unavailable("browser_deadline_elapsed");
        };
        if call.cancellation.is_cancelled() {
            return browser_tools::unavailable("browser_request_cancelled");
        }
        let request = Request {
            session_id: self.session_id.clone(),
            endpoint_id: self.endpoint_id.clone(),
            call_id: call.binding.id.clone(),
            operation: self.operation.to_owned(),
            arguments: call.arguments.clone(),
            timeout_ms,
        };
        // Dropping the pinned ACP response future sends $/cancel_request.
        let reply = tokio::select! {
            biased;
            _ = call.cancellation.cancelled() => None,
            _ = tokio::time::sleep_until(deadline.into()) => None,
            reply = client.send_request(request.clone()).block_task() => reply.ok(),
        };
        if let Some(reply) = reply
            && reply.session_id == request.session_id
            && reply.endpoint_id == request.endpoint_id
            && reply.call_id == request.call_id
        {
            return reply.result.outcome(call, self.capture.clone()).await;
        }
        browser_tools::uncertain()
    }
}

#[derive(Clone, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/editor/browser-tool", response = Response)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    session_id: SessionId,
    endpoint_id: BindingId,
    call_id: BindingId,
    operation: String,
    arguments: Value,
    timeout_ms: u64,
}

impl std::fmt::Debug for Request {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("BrowserToolRequest")
    }
}

#[derive(Clone, Deserialize, JsonRpcResponse, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Response {
    session_id: SessionId,
    endpoint_id: BindingId,
    call_id: BindingId,
    result: Reply,
}

impl std::fmt::Debug for Response {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("BrowserToolResponse")
    }
}
