mod stream;

use crate::wire::{
    EncodedRequest, RateRejectionEvidence, check_count_control, count_failure, count_openai_input,
    function_name, image_data_url, image_profile, lower_tool_offers, short_identity, text_profile,
    tool_result, tool_result_payload,
};
use crate::{
    InputImageResolver, StreamLimits, StreamingTransport, TransportOperation, TransportRequest,
};
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceRequest, InferenceRun,
    InputMeasurement, ModelCapabilities, PreparedRequest, Provider, ProviderBinding,
    RequestControl,
};
use agent_kit_core::messages::{
    Content, Message, ResultContent, Retention, Role, ToolArguments, ToolResult,
};
use agent_kit_core::{BoxFuture, Error, ErrorKind, ModelId, Result};
use serde_json::{Value, json};
use std::borrow::Cow;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

/// Where an endpoint reads the requested output-token limit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputLimitField {
    /// `max_completion_tokens`, as in OpenAI Chat Completions.
    CompletionTokens,
    /// `max_tokens`, for endpoints that read the earlier field.
    Tokens,
}

/// Explicit capabilities of a model on the selected compatible endpoint.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelProfile {
    /// The capabilities requests are validated against.
    pub capabilities: ModelCapabilities,
    /// The field that carries the output-token limit.
    pub output_limit: OutputLimitField,
    /// Request streamed usage with `stream_options.include_usage`.
    pub include_usage: bool,
    /// Where this endpoint reads a requested reasoning level.
    pub reasoning_field: ReasoningField,
}

/// Where an endpoint reads a requested reasoning level.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ReasoningField {
    /// Top-level `reasoning_effort`, as in OpenAI Chat Completions.
    #[default]
    Effort,
    /// `reasoning.effort`, as in OpenRouter.
    Object,
}

/// Chat Completions SSE with text, optional PNGs and client-executed JSON tools.
pub struct OpenAiCompatible {
    binding: ProviderBinding,
    models: BTreeMap<ModelId, ModelProfile>,
    transport: Arc<dyn StreamingTransport>,
    limits: StreamLimits,
    images: Option<Arc<InputImageResolver>>,
    retained_png_tool_results: bool,
    rate_rejection_evidence: RateRejectionEvidence,
    llama_cpp_input_count: bool,
}

impl OpenAiCompatible {
    /// A text adapter for the bound endpoint and its explicit model registry.
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
            retained_png_tool_results: false,
            rate_rejection_evidence: RateRejectionEvidence::None,
            llama_cpp_input_count: false,
        })
    }

    /// Enable retained PNG tool-result projection on a reviewed endpoint.
    /// The host must verify support for a user image following a tool exchange.
    /// The model must also support JSON tools and have a bound image resolver.
    pub fn with_retained_png_tool_results(mut self) -> Self {
        self.retained_png_tool_results = true;
        self
    }

    /// Enable admission evidence for a trusted endpoint that guarantees a
    /// complete HTTP 429 with code `rate_limit_exceeded` and type
    /// `rate_limit_error` precedes execution. The caller decides whether to retry.
    pub fn with_admission_rate_limit_evidence(mut self) -> Self {
        self.rate_rejection_evidence = RateRejectionEvidence::CodeAndType;
        self
    }

    /// Use the reviewed llama.cpp input-count route for this bound text profile.
    /// The host verifies the endpoint and owns the operation allowlist.
    pub fn with_llama_cpp_input_count(mut self) -> Result<Self> {
        if self
            .models
            .values()
            .any(|model| !text_profile(&model.capabilities))
        {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "input_measurement_unavailable",
            ));
        }
        self.llama_cpp_input_count = true;
        Ok(self)
    }

    fn prepared_model(&self, request: &PreparedRequest) -> Result<&ModelProfile> {
        let profile = self.model(&request.request().model)?;
        if request.binding() != &self.binding || request.capabilities() != &profile.capabilities {
            return Err(Error::new(
                ErrorKind::Conflict,
                "prepared_provider_binding_changed",
            ));
        }
        Ok(profile)
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
        let has_tool_media = request
            .messages
            .iter()
            .flat_map(|message| &message.content)
            .any(|part| matches!(part, Content::ToolResult(result) if has_result_media(result)));
        let tool_image_resolver = if has_tool_media {
            let resolver = self
                .images
                .as_deref()
                .filter(|_| {
                    self.retained_png_tool_results
                        && model.capabilities.json_tools
                        && image_profile(&model.capabilities)
                })
                .ok_or_else(unsupported_tool_media)?;
            validate_tool_exchanges(&request.messages)?;
            resolve_images.then_some(resolver)
        } else {
            None
        };
        for group in request
            .messages
            .chunk_by(|left, right| left.role == Role::Tool && right.role == Role::Tool)
        {
            let message = &group[0];
            if message.role == Role::Tool {
                if !model.capabilities.json_tools {
                    return Err(Error::new(
                        ErrorKind::Unsupported,
                        "unsupported_tool_history",
                    ));
                }
                lower_tool_group(
                    group,
                    tool_image_resolver,
                    &mut remaining_images,
                    &mut messages,
                )?;
            } else if message.role == Role::User
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
        let (names, offers) = lower_tool_offers(&request.tools, function_name)?;
        let mut tools = Vec::new();
        for (name, offer, parameters) in offers {
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
        if let Some(level) = request.reasoning {
            match model.reasoning_field {
                ReasoningField::Effort => body["reasoning_effort"] = level.as_str().into(),
                ReasoningField::Object => body["reasoning"] = json!({"effort": level.as_str()}),
            }
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

    fn measure_input_async<'a>(
        &'a self,
        request: &'a PreparedRequest,
        control: RequestControl,
    ) -> BoxFuture<'a, std::result::Result<InputMeasurement, InferenceFailure>> {
        Box::pin(async move {
            if !self.llama_cpp_input_count {
                return Err(count_failure(
                    "input_measurement_unavailable",
                    FailureKind::Configuration,
                ));
            }
            check_count_control(&control)?;
            let encoded = self
                .prepared_model(request)
                .and_then(|profile| self.encode(request.request(), profile, true))
                .map_err(|error| count_failure(&error.code, FailureKind::Configuration))?;
            count_openai_input(
                self.transport.as_ref(),
                TransportRequest {
                    binding: self.binding.clone(),
                    operation: TransportOperation::LlamaCppChatInputTokens,
                    body: encoded.body,
                    max_response_bytes: self.limits.max_response_bytes,
                },
                control,
            )
            .await
        })
    }

    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        let profile = self.prepared_model(&request)?;
        let encoded = self.encode(request.request(), profile, true)?;
        let transport = Arc::clone(&self.transport);
        let limits = self.limits;
        let evidence = self.rate_rejection_evidence;
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
                evidence,
            )
        }))
    }
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

fn unsupported_tool_media() -> Error {
    Error::new(ErrorKind::Unsupported, "unsupported_tool_media")
}

fn has_result_media(result: &ToolResult) -> bool {
    result
        .content
        .iter()
        .any(|part| matches!(part, ResultContent::Media(_)))
}

// Check the exchange boundaries before staging an image as a user message.
// Sibling replies may be recorded in a different order than the calls.
fn validate_tool_exchanges(messages: &[Message]) -> Result<()> {
    let invalid = || Error::new(ErrorKind::InvalidInput, "invalid_compatible_tool_exchange");
    let mut pending = BTreeSet::new();
    for message in messages {
        if message.role == Role::Tool {
            if message.content.is_empty() {
                return Err(invalid());
            }
            for part in &message.content {
                if !matches!(part, Content::ToolResult(result) if pending.remove(&result.call)) {
                    return Err(invalid());
                }
            }
        } else {
            if !pending.is_empty() {
                return Err(invalid());
            }
            if message.role == Role::Assistant {
                pending.extend(message.content.iter().filter_map(|part| match part {
                    Content::ToolCall(call) => Some(&call.id),
                    _ => None,
                }));
            }
        }
    }
    if !pending.is_empty() {
        return Err(invalid());
    }
    Ok(())
}

fn lower_tool_group(
    group: &[Message],
    resolver: Option<&InputImageResolver>,
    remaining: &mut usize,
    output: &mut Vec<Value>,
) -> Result<()> {
    let mut attachments = Vec::new();
    for part in group.iter().flat_map(|message| &message.content) {
        let Content::ToolResult(result) = part else {
            return Err(Error::new(ErrorKind::InvalidInput, "invalid_tool_message"));
        };
        let call = short_identity("call", &result.call)?;
        let content = if has_result_media(result) {
            lower_tool_images(result, &call, resolver, remaining, &mut attachments)?
        } else {
            tool_result(result)?
        };
        let content = serde_json::to_string(&content)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "tool_result_encoding_failed"))?;
        output.push(json!({ "role": "tool", "tool_call_id": call, "content": content }));
    }
    // Chat Completions accepts images in user content. Keep the synthetic
    // content outside the contiguous tool replies, even across message records.
    if !attachments.is_empty() {
        output.push(json!({ "role": "user", "content": attachments }));
    }
    Ok(())
}

fn lower_tool_images(
    result: &ToolResult,
    call: &str,
    resolver: Option<&InputImageResolver>,
    remaining: &mut usize,
    attachments: &mut Vec<Value>,
) -> Result<Value> {
    let mut content = Vec::new();
    let mut ordinal = 0;
    for part in &result.content {
        match part {
            ResultContent::Text(text) => content.push(Cow::Borrowed(text.as_str())),
            ResultContent::Media(media)
                if media.media_type == "image/png" && media.retention == Retention::Retained =>
            {
                ordinal += 1;
                let label = format!("Tool-provided image {ordinal} for result {call}");
                let url = image_data_url(media, resolver, remaining)?;
                content.push(Cow::Owned(format!("[{label} attached below]")));
                attachments.push(json!({ "type": "text", "text": label }));
                attachments.push(json!({ "type": "image_url", "image_url": { "url": url } }));
            }
            ResultContent::Media(_) => return Err(unsupported_tool_media()),
        }
    }
    Ok(tool_result_payload(result, content))
}

fn lower_message(message: &Message, tools_supported: bool, output: &mut Vec<Value>) -> Result<()> {
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
