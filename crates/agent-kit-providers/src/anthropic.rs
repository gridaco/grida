mod stream;

use crate::wire::{
    EncodedRequest, function_name, lower_tool_offers, short_identity, text_profile, tool_result,
};
use crate::{StreamLimits, StreamingTransport, TransportOperation, TransportRequest};
use agent_kit_core::inference::{
    InferenceControl, InferenceRequest, InferenceRun, ModelCapabilities, PreparedRequest, Provider,
    ProviderBinding,
};
use agent_kit_core::messages::{Content, OutcomeStatus, Role, ToolArguments};
use agent_kit_core::{Error, ErrorKind, MessageId, ModelId, Result};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

/// Anthropic Messages with text and client-executed JSON tools.
pub struct Anthropic {
    binding: ProviderBinding,
    models: BTreeMap<ModelId, ModelCapabilities>,
    transport: Arc<dyn StreamingTransport>,
    limits: StreamLimits,
}

impl Anthropic {
    /// A text adapter for the bound endpoint. Profiles must be text-only and
    /// declare no reasoning levels.
    pub fn new(
        binding: ProviderBinding,
        models: BTreeMap<ModelId, ModelCapabilities>,
        transport: Arc<dyn StreamingTransport>,
        limits: StreamLimits,
    ) -> Result<Self> {
        limits.validate()?;
        // This profile has no thinking field, so declared reasoning levels
        // could pass request validation and then be silently ignored.
        if models.is_empty()
            || !models
                .values()
                .all(|profile| text_profile(profile) && profile.reasoning.is_empty())
        {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "unsupported_model_profile",
            ));
        }
        Ok(Self {
            binding,
            models,
            transport,
            limits,
        })
    }

    fn encode(&self, request: &InferenceRequest) -> Result<EncodedRequest> {
        if request.extension.is_some() {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "unsupported_request_extension",
            ));
        }
        let maximum = request
            .max_output_tokens
            .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "output_token_limit_required"))?;
        let tools_supported = self.capabilities(&request.model)?.json_tools;
        let mut system = Vec::new();
        let mut messages: Vec<Value> = Vec::new();
        let mut pending = BTreeSet::new();
        for message in &request.messages {
            if message.role != Role::Tool && !pending.is_empty() {
                return Err(Error::new(ErrorKind::InvalidInput, "tool_result_position"));
            }
            if message.role == Role::System && !messages.is_empty() {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "system_message_position",
                ));
            }
            let mut blocks = Vec::new();
            for content in &message.content {
                match (message.role, content) {
                    (Role::System, Content::Text(text)) => {
                        system.push(json!({"type": "text", "text": text}));
                    }
                    (Role::User | Role::Assistant, Content::Text(text)) => {
                        blocks.push(json!({"type": "text", "text": text}));
                    }
                    // Plain Messages has no portable reasoning-input field.
                    (Role::Assistant, Content::Reasoning(_)) => {}
                    (Role::Assistant, Content::ToolCall(call)) if tools_supported => {
                        let ToolArguments::Json(input) = &call.arguments else {
                            return Err(Error::new(
                                ErrorKind::Unsupported,
                                "unsupported_tool_format",
                            ));
                        };
                        if !input.is_object() {
                            return Err(Error::new(
                                ErrorKind::InvalidInput,
                                "invalid_tool_arguments",
                            ));
                        }
                        pending.insert(&call.id);
                        blocks.push(json!({
                            "type": "tool_use", "id": short_identity("call", &call.id)?,
                            "name": function_name(&call.tool)?, "input": input
                        }));
                    }
                    (Role::Tool, Content::ToolResult(result)) if tools_supported => {
                        if !pending.remove(&result.call) {
                            return Err(Error::new(
                                ErrorKind::InvalidInput,
                                "tool_result_position",
                            ));
                        }
                        blocks.push(json!({
                            "type": "tool_result", "tool_use_id": short_identity("call", &result.call)?,
                            "content": tool_result(result)?.to_string(),
                            "is_error": result.status != OutcomeStatus::Succeeded
                        }));
                    }
                    _ => {
                        return Err(Error::new(
                            ErrorKind::Unsupported,
                            "unsupported_conversation_content",
                        ));
                    }
                }
            }
            if message.role != Role::System && !blocks.is_empty() {
                let role = if message.role == Role::Assistant {
                    "assistant"
                } else {
                    "user"
                };
                if let Some(previous) = messages
                    .last_mut()
                    .filter(|previous| previous["role"] == role)
                {
                    previous["content"]
                        .as_array_mut()
                        .expect("encoded blocks")
                        .append(&mut blocks);
                } else {
                    messages.push(json!({"role": role, "content": blocks}));
                }
            }
        }
        let (names, offers) = lower_tool_offers(&request.tools, function_name)?;
        let mut tools = Vec::new();
        for (name, offer, schema) in offers {
            tools.push(
                json!({"name": name, "description": offer.description, "input_schema": schema}),
            );
        }
        let mut body = json!({
            "model": request.model.as_str(), "messages": messages, "max_tokens": maximum, "stream": true
        });
        if !system.is_empty() {
            body["system"] = system.into();
        }
        if !tools.is_empty() {
            body["tools"] = tools.into();
        }
        let body = serde_json::to_vec(&body)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "request_encoding_failed"))?;
        if body.len() > self.limits.max_request_bytes {
            return Err(Error::new(ErrorKind::LimitExceeded, "request_byte_limit"));
        }
        Ok(EncodedRequest { body, names })
    }
}

impl Provider for Anthropic {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities> {
        self.models
            .get(model)
            .cloned()
            .ok_or_else(|| Error::new(ErrorKind::Unsupported, "model_unavailable"))
    }

    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        let capabilities = self.capabilities(&request.model)?;
        request.validate(&capabilities)?;
        self.encode(&request)?;
        PreparedRequest::from_validated(request, self.binding.clone(), capabilities)
    }

    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        if request.binding() != &self.binding
            || request.capabilities() != &self.capabilities(&request.request().model)?
        {
            return Err(Error::new(
                ErrorKind::Conflict,
                "prepared_provider_binding_changed",
            ));
        }
        let encoded = self.encode(request.request())?;
        let transport = Arc::clone(&self.transport);
        let limits = self.limits;
        let request = TransportRequest {
            binding: self.binding.clone(),
            operation: TransportOperation::AnthropicMessages,
            body: encoded.body,
            max_response_bytes: limits.max_response_bytes,
        };
        let message = MessageId::new(short_identity("message", &control.attempt)?)?;
        Ok(InferenceRun::from_stream(control, move |control| {
            stream::events(transport, request, control, limits, encoded.names, message)
        }))
    }
}
