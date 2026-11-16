mod stream;

use crate::wire::{
    EncodedRequest, append_image_base64, image_profile, lower_tool_offers, short_identity,
    text_profile, tool_result,
};
use crate::{
    InputImageResolver, StreamLimits, StreamingTransport, TransportOperation, TransportRequest,
};
use agent_kit_core::inference::{
    InferenceControl, InferenceRequest, InferenceRun, ModelCapabilities, PreparedRequest, Provider,
    ProviderBinding,
};
use agent_kit_core::messages::{Content, Message, ProviderState, Role};
use agent_kit_core::{
    BindingId, Envelope, Error, ErrorKind, Fingerprint, MessageId, ModelId, ProviderId, Result,
    SchemaId, ToolCallId, ToolId,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::Arc;

/// A registry model's capabilities and tool-signature requirement.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeminiProfile {
    /// The capabilities requests are validated against; no reasoning levels.
    pub capabilities: ModelCapabilities,
    /// Require the first function-call part of a tool step to carry its signature.
    pub requires_tool_signatures: bool,
}

/// Gemini GenerateContent with text, explicitly supported PNGs, and client-executed JSON tools.
pub struct Gemini {
    binding: ProviderBinding,
    replay_binding: BindingId,
    models: BTreeMap<ModelId, GeminiProfile>,
    transport: Arc<dyn StreamingTransport>,
    limits: StreamLimits,
    images: Option<Arc<InputImageResolver>>,
}

impl Gemini {
    /// The host retains replay_binding across execution-grant generations only
    /// while the provider account and endpoint lineage remain verified.
    pub fn new(
        binding: ProviderBinding,
        replay_binding: BindingId,
        models: BTreeMap<ModelId, GeminiProfile>,
        transport: Arc<dyn StreamingTransport>,
        limits: StreamLimits,
    ) -> Result<Self> {
        Self::with_image_resolver(binding, replay_binding, models, transport, limits, None)
    }

    /// Permit retained user PNGs only on model profiles with the image modality.
    pub fn with_image_resolver(
        binding: ProviderBinding,
        replay_binding: BindingId,
        models: BTreeMap<ModelId, GeminiProfile>,
        transport: Arc<dyn StreamingTransport>,
        limits: StreamLimits,
        images: Option<Arc<InputImageResolver>>,
    ) -> Result<Self> {
        limits.validate()?;
        if models.is_empty()
            || !models.iter().all(|(model, profile)| {
                model
                    .as_str()
                    .as_bytes()
                    .first()
                    .is_some_and(u8::is_ascii_alphanumeric)
                    && model.as_str().bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.')
                    })
                    && (text_profile(&profile.capabilities)
                        || (images.is_some() && image_profile(&profile.capabilities)))
                    // This profile has no thinking configuration, so declared
                    // reasoning levels would otherwise be silently ignored.
                    && profile.capabilities.reasoning.is_empty()
            })
        {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "unsupported_model_profile",
            ));
        }
        Ok(Self {
            binding,
            replay_binding,
            models,
            transport,
            limits,
            images,
        })
    }

    fn model(&self, model: &ModelId) -> Result<&GeminiProfile> {
        self.models
            .get(model)
            .ok_or_else(|| Error::new(ErrorKind::Unsupported, "model_unavailable"))
    }

    fn encode(
        &self,
        request: &InferenceRequest,
        profile: &GeminiProfile,
        resolve_images: bool,
    ) -> Result<EncodedRequest> {
        if request.extension.is_some() {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "unsupported_request_extension",
            ));
        }
        let mut system = Vec::new();
        let mut contents = Vec::new();
        let mut pending = Vec::new();
        let mut results = BTreeMap::new();
        let allow_images = image_profile(&profile.capabilities);
        let image_resolver = self.images.as_deref().filter(|_| resolve_images);
        let mut remaining_images = self.limits.max_request_bytes / 4 * 3;
        for message in &request.messages {
            if message.role == Role::Tool {
                for part in &message.content {
                    let Content::ToolResult(result) = part else {
                        return Err(Error::new(ErrorKind::InvalidInput, "invalid_tool_message"));
                    };
                    results.insert(result.call.clone(), tool_result(result)?);
                }
                continue;
            }
            flush_results(&mut pending, &mut results, &mut contents)?;
            if message.role == Role::System && !contents.is_empty() {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "system_message_position",
                ));
            }

            let parts = match self.replay(request, message, profile)? {
                Some(replay) => {
                    pending = replay.calls;
                    replay.parts
                }
                None => {
                    message_parts(message, allow_images, image_resolver, &mut remaining_images)?
                }
            };
            if message.role == Role::System {
                system.extend(parts);
            } else if !parts.is_empty() {
                let role = if message.role == Role::Assistant {
                    "model"
                } else {
                    "user"
                };
                contents.push(json!({"role": role, "parts": parts}));
            }
        }
        flush_results(&mut pending, &mut results, &mut contents)?;

        let (names, offers) = lower_tool_offers(&request.tools, function_name)?;
        let mut declarations = Vec::new();
        for (name, offer, schema) in offers {
            declarations.push(json!({
                "name": name, "description": offer.description, "parametersJsonSchema": schema
            }));
        }
        let mut body = json!({"contents": contents, "generationConfig": {"candidateCount": 1}});
        if !system.is_empty() {
            body["systemInstruction"] = json!({"parts": system});
        }
        if !declarations.is_empty() {
            body["tools"] = json!([{"functionDeclarations": declarations}]);
        }
        if let Some(maximum) = request.max_output_tokens {
            body["generationConfig"]["maxOutputTokens"] = maximum.into();
        }
        let body = serde_json::to_vec(&body)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "request_encoding_failed"))?;
        if body.len() > self.limits.max_request_bytes {
            return Err(Error::new(ErrorKind::LimitExceeded, "request_byte_limit"));
        }
        Ok(EncodedRequest { body, names })
    }

    fn replay(
        &self,
        request: &InferenceRequest,
        message: &Message,
        profile: &GeminiProfile,
    ) -> Result<Option<Replay>> {
        if message.role != Role::Assistant {
            return Ok(None);
        }
        let Some(Content::ProviderState(state)) = message.content.last() else {
            return Ok(None);
        };
        let projection = &message.content[..message.content.len() - 1];
        let scope = self.replay_scope(&request.model);
        if state.producer != scope.producer
            || state.binding != scope.binding
            || state.payload.schema().as_str() != REPLAY_SCHEMA
            || state.payload.version() != 1
            || state.validity != scope.fingerprint(&message.id, projection, &state.payload)?
        {
            return Err(Error::new(
                ErrorKind::Conflict,
                "provider_state_binding_changed",
            ));
        }
        let replay: Replay = serde_json::from_slice(state.payload.bytes())
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "invalid_provider_state"))?;
        if profile.requires_tool_signatures
            && !replay.calls.is_empty()
            && replay
                .parts
                .iter()
                .find(|part| part.get("functionCall").is_some())
                .and_then(|part| part.get("thoughtSignature"))
                .and_then(Value::as_str)
                .is_none_or(str::is_empty)
        {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "missing_tool_thought_signature",
            ));
        }
        Ok(Some(replay))
    }

    fn replay_scope(&self, model: &ModelId) -> ReplayScope {
        ReplayScope {
            producer: self.binding.provider.clone(),
            binding: self.replay_binding.clone(),
            model: model.clone(),
        }
    }
}

impl Provider for Gemini {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities> {
        Ok(self.model(model)?.capabilities.clone())
    }

    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        let profile = self.model(&request.model)?;
        let capabilities = profile.capabilities.clone();
        request.validate(&capabilities)?;
        self.encode(&request, profile, false)?;
        PreparedRequest::from_validated(request, self.binding.clone(), capabilities)
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
        let stream_profile = stream::Profile {
            scope: self.replay_scope(&request.request().model),
            requires_tool_signatures: profile.requires_tool_signatures,
            names: encoded.names,
        };
        let request = TransportRequest {
            binding: self.binding.clone(),
            operation: TransportOperation::GeminiStreamGenerateContent {
                model: request.request().model.clone(),
            },
            body: encoded.body,
            max_response_bytes: limits.max_response_bytes,
        };
        let message = MessageId::new(short_identity("message", &control.attempt)?)?;
        Ok(InferenceRun::from_stream(control, move |control| {
            stream::events(transport, request, control, limits, message, stream_profile)
        }))
    }
}

const REPLAY_SCHEMA: &str = "gemini.generate-content.parts";

#[derive(Default, Deserialize, Serialize)]
struct Replay {
    parts: Vec<Value>,
    calls: Vec<RemoteCall>,
}

#[derive(Deserialize, Serialize)]
struct RemoteCall {
    call: ToolCallId,
    name: String,
    id: Option<String>,
}

#[derive(Serialize)]
struct ReplayScope {
    producer: ProviderId,
    binding: BindingId,
    model: ModelId,
}

impl Replay {
    fn state(
        &self,
        scope: &ReplayScope,
        message: &MessageId,
        projection: &[Content],
    ) -> Result<ProviderState> {
        let bytes = serde_json::to_vec(self)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "provider_state_encoding_failed"))?;
        let payload = Envelope::new(SchemaId::new(REPLAY_SCHEMA)?, 1, bytes)?;
        let validity = scope.fingerprint(message, projection, &payload)?;
        Ok(ProviderState {
            producer: scope.producer.clone(),
            binding: scope.binding.clone(),
            validity,
            payload,
        })
    }
}

impl ReplayScope {
    fn fingerprint(
        &self,
        message: &MessageId,
        projection: &[Content],
        payload: &Envelope,
    ) -> Result<Fingerprint> {
        Fingerprint::of(&(self, message, projection, payload))
    }
}

// Gemini function names must also begin with a letter or underscore, so this
// rule is stricter than the shared one.
fn function_name(tool: &ToolId) -> Result<String> {
    let id = tool.as_str();
    if id.len() <= 64
        && id
            .as_bytes()
            .first()
            .is_some_and(|byte| byte.is_ascii_alphabetic() || *byte == b'_')
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Ok(id.into());
    }
    short_identity("tool", tool)
}

fn message_parts(
    message: &Message,
    allow_images: bool,
    resolver: Option<&InputImageResolver>,
    remaining_images: &mut usize,
) -> Result<Vec<Value>> {
    let mut parts = Vec::new();
    for part in &message.content {
        match part {
            Content::Text(text) => parts.push(json!({"text": text})),
            Content::Media(media)
                if message.role == Role::User
                    && allow_images
                    && media.media_type == "image/png" =>
            {
                let mut data = String::new();
                append_image_base64(&mut data, media, resolver, remaining_images)?;
                parts.push(json!({"inlineData": {"mimeType": "image/png", "data": data}}));
            }
            // Interrupted reasoning summaries are display evidence and have no replay state.
            Content::Reasoning(_) if message.role == Role::Assistant => {}
            _ => {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "unsupported_conversation_content",
                ));
            }
        }
    }
    Ok(parts)
}

fn flush_results(
    pending: &mut Vec<RemoteCall>,
    results: &mut BTreeMap<ToolCallId, Value>,
    contents: &mut Vec<Value>,
) -> Result<()> {
    if pending.len() != results.len() {
        return Err(Error::new(ErrorKind::InvalidInput, "unmatched_tool_result"));
    }
    if pending.is_empty() {
        return Ok(());
    }
    let mut parts = Vec::new();
    for call in pending.drain(..) {
        let result = results
            .remove(&call.call)
            .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "unmatched_tool_result"))?;
        let mut response = json!({"name": call.name, "response": result});
        if let Some(id) = call.id {
            response["id"] = id.into();
        }
        parts.push(json!({"functionResponse": response}));
    }
    contents.push(json!({"role": "user", "parts": parts}));
    Ok(())
}
