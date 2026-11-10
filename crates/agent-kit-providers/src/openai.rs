mod stream;

use crate::wire::{
    function_name, image_data_url, image_profile, short_identity, text_profile, tool_result,
};
use crate::{
    InputImageResolver, StreamLimits, StreamingTransport, TransportOperation, TransportRequest,
};
use agent_kit_core::inference::{
    InferenceControl, InferenceRequest, InferenceRun, InputFormat, ModelCapabilities,
    PreparedRequest, Provider, ProviderBinding,
};
use agent_kit_core::messages::{Content, Message, Role, ToolArguments};
use agent_kit_core::{Error, ErrorKind, ModelId, Result, ToolId};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputLimitField {
    CompletionTokens,
    Tokens,
}

/// Explicit capabilities of a model on the selected compatible endpoint.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelProfile {
    pub capabilities: ModelCapabilities,
    pub output_limit: OutputLimitField,
    pub include_usage: bool,
}

pub struct OpenAiCompatible {
    binding: ProviderBinding,
    models: BTreeMap<ModelId, ModelProfile>,
    transport: Arc<dyn StreamingTransport>,
    limits: StreamLimits,
    images: Option<Arc<InputImageResolver>>,
}

impl OpenAiCompatible {
    pub fn new(
        binding: ProviderBinding,
        models: BTreeMap<ModelId, ModelProfile>,
        transport: Arc<dyn StreamingTransport>,
        limits: StreamLimits,
    ) -> Result<Self> {
        Self::with_image_resolver(binding, models, transport, limits, None)
    }

    /// Enable inline PNG input only on model profiles that explicitly declare it.
    pub fn with_image_resolver(
        binding: ProviderBinding,
        models: BTreeMap<ModelId, ModelProfile>,
        transport: Arc<dyn StreamingTransport>,
        limits: StreamLimits,
        images: Option<Arc<InputImageResolver>>,
    ) -> Result<Self> {
        limits.validate()?;
        if models.is_empty()
            || models.values().any(|model| {
                !(text_profile(&model.capabilities)
                    || (images.is_some() && image_profile(&model.capabilities)))
            })
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
            images,
        })
    }

    fn model(&self, model: &ModelId) -> Result<&ModelProfile> {
        self.models
            .get(model)
            .ok_or_else(|| Error::new(ErrorKind::Unsupported, "model_unavailable"))
    }

    fn encode(
        &self,
        request: &InferenceRequest,
        model: &ModelProfile,
        resolve_images: bool,
    ) -> Result<EncodedRequest> {
        if request.extension.is_some() {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "unsupported_request_extension",
            ));
        }
        let mut messages = Vec::new();
        let mut remaining_images = self.limits.max_request_bytes / 4 * 3;
        for message in &request.messages {
            if message.role == Role::User
                && message
                    .content
                    .iter()
                    .any(|part| matches!(part, Content::Media(_)))
            {
                let resolver = self.images.as_deref().ok_or_else(unsupported_image)?;
                messages.push(lower_image_message(
                    message,
                    resolve_images.then_some(resolver),
                    &mut remaining_images,
                )?);
            } else {
                lower_message(message, model.capabilities.json_tools, &mut messages)?;
            }
        }
        let mut names = BTreeMap::new();
        let mut tools = Vec::new();
        for offer in &request.tools {
            let InputFormat::Json(parameters) = &offer.input else {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "unsupported_tool_format",
                ));
            };
            if !parameters.is_object() {
                return Err(Error::new(ErrorKind::InvalidInput, "invalid_tool_schema"));
            }
            let name = function_name(&offer.id)?;
            if names.insert(name.clone(), offer.id.clone()).is_some() {
                return Err(Error::new(ErrorKind::Conflict, "wire_tool_name_collision"));
            }
            tools.push(json!({ "type": "function", "function": {
                "name": name, "description": offer.description, "parameters": parameters
            }}));
        }
        let mut body = json!({ "model": request.model.as_str(), "messages": messages, "stream": true, "n": 1 });
        if !tools.is_empty() {
            body["tools"] = Value::Array(tools);
        }
        if model.include_usage {
            body["stream_options"] = json!({ "include_usage": true });
        }
        if let Some(maximum) = request.max_output_tokens {
            let field = match model.output_limit {
                OutputLimitField::CompletionTokens => "max_completion_tokens",
                OutputLimitField::Tokens => "max_tokens",
            };
            body[field] = maximum.into();
        }
        let body = serde_json::to_vec(&body)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "request_encoding_failed"))?;
        if body.len() > self.limits.max_request_bytes {
            return Err(Error::new(ErrorKind::LimitExceeded, "request_byte_limit"));
        }
        Ok(EncodedRequest { body, names })
    }
}

impl Provider for OpenAiCompatible {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities> {
        Ok(self.model(model)?.capabilities.clone())
    }

    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        let profile = self.model(&request.model)?;
        request.validate(&profile.capabilities)?;
        self.encode(&request, profile, false)?;
        PreparedRequest::from_validated(request, self.binding.clone(), profile.capabilities.clone())
    }

    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        let profile = self.model(&request.request().model)?;
        if request.binding() != &self.binding || request.capabilities() != &profile.capabilities {
            return Err(Error::new(
                ErrorKind::Conflict,
                "prepared_provider_binding_changed",
            ));
        }
        let encoded = self.encode(request.request(), profile, true)?;
        let transport = Arc::clone(&self.transport);
        let limits = self.limits;
        let request = TransportRequest {
            binding: self.binding.clone(),
            operation: TransportOperation::ChatCompletions,
            body: encoded.body,
            max_response_bytes: limits.max_response_bytes,
        };
        let message_id =
            agent_kit_core::MessageId::new(short_identity("message", &control.attempt)?)?;
        Ok(InferenceRun::from_stream(control, move |control| {
            stream::events(
                transport,
                request,
                control,
                limits,
                encoded.names,
                message_id,
            )
        }))
    }
}

struct EncodedRequest {
    body: Vec<u8>,
    names: BTreeMap<String, ToolId>,
}

fn lower_image_message(
    message: &Message,
    resolver: Option<&InputImageResolver>,
    remaining: &mut usize,
) -> Result<Value> {
    let content = message
        .content
        .iter()
        .map(|part| match part {
            Content::Text(text) => Ok(json!({ "type": "text", "text": text })),
            Content::Media(media) if media.media_type == "image/png" => {
                let url = image_data_url(media, resolver, remaining)?;
                Ok(json!({ "type": "image_url", "image_url": { "url": url } }))
            }
            _ => Err(unsupported_image()),
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(json!({ "role": "user", "content": content }))
}

fn unsupported_image() -> Error {
    Error::new(ErrorKind::Unsupported, "unsupported_compatible_input_image")
}

fn lower_message(message: &Message, tools_supported: bool, output: &mut Vec<Value>) -> Result<()> {
    if message.role == Role::Tool {
        if !tools_supported {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "unsupported_tool_history",
            ));
        }
        for part in &message.content {
            let Content::ToolResult(result) = part else {
                return Err(Error::new(ErrorKind::InvalidInput, "invalid_tool_message"));
            };
            let content = tool_result(result)?;
            let content = serde_json::to_string(&content)
                .map_err(|_| Error::new(ErrorKind::InvalidInput, "tool_result_encoding_failed"))?;
            output.push(json!({ "role": "tool", "tool_call_id": short_identity("call", &result.call)?, "content": content }));
        }
        return Ok(());
    }
    let mut text = String::new();
    let mut calls = Vec::new();
    for part in &message.content {
        match part {
            Content::Text(value) => text.push_str(value),
            // Plain compatible endpoints have no portable reasoning-input field.
            Content::Reasoning(_) if message.role == Role::Assistant => {}
            Content::ToolCall(call) if message.role == Role::Assistant && tools_supported => {
                let ToolArguments::Json(arguments) = &call.arguments else {
                    return Err(Error::new(
                        ErrorKind::Unsupported,
                        "unsupported_tool_format",
                    ));
                };
                let arguments = serde_json::to_string(arguments).map_err(|_| {
                    Error::new(ErrorKind::InvalidInput, "tool_argument_encoding_failed")
                })?;
                calls.push(json!({ "id": short_identity("call", &call.id)?, "type": "function", "function": {
                    "name": function_name(&call.tool)?, "arguments": arguments
                }}));
            }
            Content::Media(_) | Content::ProviderState(_) => {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "unsupported_conversation_content",
                ));
            }
            _ => {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "invalid_conversation_content",
                ));
            }
        }
    }
    let role = match message.role {
        Role::System => "system",
        Role::User => "user",
        Role::Assistant => "assistant",
        Role::Tool => unreachable!("tool messages handled above"),
    };
    let mut encoded = json!({ "role": role, "content": text });
    if !calls.is_empty() {
        encoded["tool_calls"] = Value::Array(calls);
    }
    output.push(encoded);
    Ok(())
}
