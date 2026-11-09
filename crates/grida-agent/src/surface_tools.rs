//! Presentation tools for a caller with no editor endpoint.

use crate::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
    ToolHost,
};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent};
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::{BoxFuture, Error, ErrorKind, Result, ToolId};
use serde_json::{Value, json};
use std::sync::Arc;

const MAX_PATH_BYTES: usize = 4096;

pub fn headless_surface() -> Result<ToolHost> {
    let path = json!({"type": "string", "minLength": 1, "maxLength": MAX_PATH_BYTES});
    ToolHost::new([(
        CapabilityDefinition {
            tool: ToolDefinition {
                id: ToolId::new("surface_open")?,
                version: 1,
                description: "Request presentation of an existing workspace artifact. A headless host reports that presentation was unavailable.".into(),
                input: InputFormat::Json(json!({
                    "type": "object",
                    "properties": {"path": path},
                    "required": ["path"],
                    "additionalProperties": false
                })),
                max_input_bytes: 8192,
                max_output_bytes: 8192,
                recovery: RecoveryKind::Unavailable,
            },
            output_schema: json!({
                "type": "object",
                "properties": {
                    "path": path,
                    "requested": {"const": false},
                    "reason": {"const": "not_interactive"}
                },
                "required": ["path", "requested", "reason"],
                "additionalProperties": false
            }),
            effect: CapabilityEffect::Presentation,
        },
        Arc::new(HeadlessSurface) as Arc<dyn CapabilityExecutor>,
    )])
}

struct HeadlessSurface;

impl CapabilityExecutor for HeadlessSurface {
    fn validate(&self, arguments: &Value) -> Result<()> {
        path(arguments).map(|_| ())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = match path(&call.arguments) {
                Ok(path) => ToolOutcome {
                    status: OutcomeStatus::Succeeded,
                    content: vec![ResultContent::Text(
                        "Presentation unavailable in this non-interactive host.".into(),
                    )],
                    structured: Some(json!({
                        "path": path,
                        "requested": false,
                        "reason": "not_interactive"
                    })),
                    receipt: None,
                    truncated: false,
                },
                Err(error) => ToolOutcome::failed(&error.code),
            };
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}

fn path(arguments: &Value) -> Result<&str> {
    arguments
        .as_object()
        .filter(|object| object.len() == 1)
        .and_then(|object| object.get("path"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|path| path.starts_with('/') && path.len() <= MAX_PATH_BYTES)
        .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "invalid_surface_path"))
}
