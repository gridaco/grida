mod stream;

use crate::wire::{function_name, read_http_error, short_identity, text_profile, tool_result};
use crate::{
    StreamLimits, StreamingTransport, TransportFailure, TransportOperation, TransportRequest,
};
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceRequest, InferenceRun, InputFormat,
    InputMeasurement, MeasurementKind, Modality, ModelCapabilities, PreparedRequest, Provider,
    ProviderBinding, RequestControl,
};
use agent_kit_core::messages::{
    Content, MediaRef, Message, MessagePhase, ProvenanceKind, ProviderState, Role,
};
use agent_kit_core::{
    BindingId, BoxFuture, Envelope, Error, ErrorKind, Fingerprint, ModelId, ProviderId, Result,
    SchemaId, ToolCallId, ToolId,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Instant;

const COUNT_RESPONSE_BYTES: usize = 4096;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ResponsesEndpoint {
    Api,
    Subscription,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    #[serde(rename = "none")]
    Disabled,
    Minimal,
    Low,
    Medium,
    High,
    XHigh,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResponsesProfile {
    /// The adapter derives a revision from this revision and the wire profile.
    pub capabilities: ModelCapabilities,
    pub wire_model: ModelId,
    pub reasoning_effort: Option<ReasoningEffort>,
}

/// Resolve a host-authorized, immutable image reference to its exact bytes.
/// This bounded local read runs only when counting or starting a request.
pub type InputImageResolver = dyn Fn(&MediaRef, usize) -> Result<Vec<u8>> + Send + Sync;

/// Stateless Responses SSE with text, optional images, and client-executed JSON functions.
pub struct Responses {
    binding: ProviderBinding,
    replay_binding: BindingId,
    endpoint: ResponsesEndpoint,
    models: BTreeMap<ModelId, ResponsesProfile>,
    transport: Arc<dyn StreamingTransport>,
    limits: StreamLimits,
    images: Option<Arc<InputImageResolver>>,
}

impl Responses {
    /// Keep replay_binding only while the host can establish account and
    /// destination continuity. Live request authority is checked independently.
    pub fn new(
        binding: ProviderBinding,
        replay_binding: BindingId,
        endpoint: ResponsesEndpoint,
        models: BTreeMap<ModelId, ResponsesProfile>,
        transport: Arc<dyn StreamingTransport>,
        limits: StreamLimits,
    ) -> Result<Self> {
        Self::with_image_resolver(
            binding,
            replay_binding,
            endpoint,
            models,
            transport,
            limits,
            None,
        )
    }

    pub fn with_image_resolver(
        binding: ProviderBinding,
        replay_binding: BindingId,
        endpoint: ResponsesEndpoint,
        mut models: BTreeMap<ModelId, ResponsesProfile>,
        transport: Arc<dyn StreamingTransport>,
        limits: StreamLimits,
        images: Option<Arc<InputImageResolver>>,
    ) -> Result<Self> {
        limits.validate()?;
        if models.is_empty()
            || models.values().any(|profile| {
                let capabilities = &profile.capabilities;
                !(text_profile(capabilities)
                    || (images.is_some()
                        && endpoint == ResponsesEndpoint::Api
                        && !capabilities.text_tools
                        && capabilities.input_modalities
                            == [Modality::Text, Modality::Image].into_iter().collect()))
            })
        {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "unsupported_model_profile",
            ));
        }
        for profile in models.values_mut() {
            profile.capabilities.revision = BindingId::new(short_identity(
                "responses",
                &(
                    &profile.capabilities.revision,
                    endpoint,
                    &profile.wire_model,
                    profile.reasoning_effort,
                ),
            )?)?;
        }
        Ok(Self {
            binding,
            replay_binding,
            endpoint,
            models,
            transport,
            limits,
            images,
        })
    }

    fn model(&self, model: &ModelId) -> Result<&ResponsesProfile> {
        self.models
            .get(model)
            .ok_or_else(|| Error::new(ErrorKind::Unsupported, "model_unavailable"))
    }

    fn scope(&self, model: &ModelId, profile: &ResponsesProfile) -> ReplayScope {
        ReplayScope {
            producer: self.binding.provider.clone(),
            binding: self.replay_binding.clone(),
            model: model.clone(),
            wire_model: profile.wire_model.clone(),
            endpoint: self.endpoint,
            reasoning_effort: profile.reasoning_effort,
        }
    }

    fn encode_input(
        &self,
        request: &InferenceRequest,
        profile: &ResponsesProfile,
        scope: &ReplayScope,
        resolve_images: bool,
    ) -> Result<(Value, BTreeMap<String, ToolId>)> {
        if request.extension.is_some() {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "unsupported_request_extension",
            ));
        }
        if self.endpoint == ResponsesEndpoint::Subscription && request.max_output_tokens.is_some() {
            return Err(Error::new(
                ErrorKind::Unsupported,
                "responses_output_limit_unsupported",
            ));
        }
        let mut instructions = Vec::new();
        let mut input = Vec::new();
        let mut calls = BTreeMap::new();
        let mut image_bytes = self.limits.max_request_bytes / 4 * 3;
        for message in &request.messages {
            match message.role {
                Role::System => {
                    if !input.is_empty() {
                        return Err(Error::new(
                            ErrorKind::Unsupported,
                            "system_message_position",
                        ));
                    }
                    instructions.extend(text(message)?);
                }
                Role::Assistant => {
                    if let Some(item) = scope.replay(message)? {
                        if let WireItem::FunctionCall { call_id, .. } = &item {
                            let [Content::ToolCall(call), Content::ProviderState(_)] =
                                message.content.as_slice()
                            else {
                                return Err(Error::new(
                                    ErrorKind::InvalidInput,
                                    "invalid_provider_state",
                                ));
                            };
                            calls.insert(call.id.clone(), call_id.clone());
                        }
                        input.push(serde_json::to_value(item).map_err(|_| encoding_error())?);
                    } else {
                        push_message(&mut input, message, "assistant")?;
                    }
                }
                Role::User => {
                    self.push_user(&mut input, message, resolve_images, &mut image_bytes)?
                }
                Role::Tool => {
                    for part in &message.content {
                        let Content::ToolResult(result) = part else {
                            return Err(Error::new(
                                ErrorKind::InvalidInput,
                                "invalid_tool_message",
                            ));
                        };
                        let call_id = calls.remove(&result.call).ok_or_else(|| {
                            Error::new(ErrorKind::InvalidInput, "unmatched_tool_result")
                        })?;
                        input.push(json!({
                            "type": "function_call_output",
                            "call_id": call_id,
                            "output": tool_result(result)?.to_string()
                        }));
                    }
                }
            }
        }
        let mut names = BTreeMap::new();
        let mut tools = Vec::new();
        for offer in &request.tools {
            let InputFormat::Json(schema) = &offer.input else {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "unsupported_tool_format",
                ));
            };
            if !schema.is_object() {
                return Err(Error::new(ErrorKind::InvalidInput, "invalid_tool_schema"));
            }
            let name = function_name(&offer.id)?;
            if names.insert(name.clone(), offer.id.clone()).is_some() {
                return Err(Error::new(ErrorKind::Conflict, "wire_tool_name_collision"));
            }
            tools.push(json!({
                "type": "function", "name": name, "description": offer.description,
                "parameters": schema, "strict": false
            }));
        }
        let mut body = json!({
            "model": profile.wire_model, "input": input,
            "instructions": instructions.join("\n\n")
        });
        if !tools.is_empty() {
            body["tools"] = tools.into();
        }
        if let Some(effort) = profile.reasoning_effort {
            body["reasoning"] = json!({"effort": effort});
        }
        Ok((body, names))
    }

    fn encode(
        &self,
        request: &InferenceRequest,
        profile: &ResponsesProfile,
        scope: &ReplayScope,
        resolve_images: bool,
    ) -> Result<EncodedRequest> {
        let (mut body, names) = self.encode_input(request, profile, scope, resolve_images)?;
        body["stream"] = true.into();
        body["store"] = false.into();
        body["include"] = json!(["reasoning.encrypted_content"]);
        if let Some(maximum) = request.max_output_tokens {
            body["max_output_tokens"] = maximum.into();
        }
        Ok(EncodedRequest {
            body: self.encode_body(&body)?,
            names,
        })
    }

    fn encode_body(&self, body: &Value) -> Result<Vec<u8>> {
        let bytes = serde_json::to_vec(body).map_err(|_| encoding_error())?;
        if bytes.len() > self.limits.max_request_bytes {
            return Err(Error::new(ErrorKind::LimitExceeded, "request_byte_limit"));
        }
        Ok(bytes)
    }

    fn push_user(
        &self,
        input: &mut Vec<Value>,
        message: &Message,
        resolve_images: bool,
        remaining: &mut usize,
    ) -> Result<()> {
        if !message
            .content
            .iter()
            .any(|part| matches!(part, Content::Media(_)))
        {
            return push_message(input, message, "user");
        }
        let resolver = self.images.as_ref().ok_or_else(unsupported_image)?;
        let content = message
            .content
            .iter()
            .map(|part| match part {
                Content::Text(text) => Ok(json!({"type": "input_text", "text": text})),
                Content::Media(media) => {
                    if !matches!(
                        media.media_type.as_str(),
                        "image/png" | "image/jpeg" | "image/webp" | "image/gif"
                    ) {
                        return Err(unsupported_image());
                    }
                    let mut url = format!("data:{};base64,", media.media_type);
                    if resolve_images {
                        let bytes = resolver(media, *remaining)?;
                        if bytes.is_empty() || bytes.len() > *remaining {
                            return Err(Error::new(ErrorKind::LimitExceeded, "request_byte_limit"));
                        }
                        *remaining -= bytes.len();
                        STANDARD.encode_string(&bytes, &mut url);
                    }
                    Ok(json!({"type": "input_image", "image_url": url, "detail": "auto"}))
                }
                _ => Err(Error::new(
                    ErrorKind::Unsupported,
                    "unsupported_conversation_content",
                )),
            })
            .collect::<Result<Vec<_>>>()?;
        input.push(json!({"type": "message", "role": "user", "content": content}));
        Ok(())
    }

    fn prepared_model(&self, request: &PreparedRequest) -> Result<&ResponsesProfile> {
        let profile = self.model(&request.request().model)?;
        if request.binding() != &self.binding || request.capabilities() != &profile.capabilities {
            return Err(Error::new(
                ErrorKind::Conflict,
                "prepared_provider_binding_changed",
            ));
        }
        Ok(profile)
    }

    async fn count(
        &self,
        request: &PreparedRequest,
        control: RequestControl,
    ) -> std::result::Result<InputMeasurement, InferenceFailure> {
        if self.endpoint != ResponsesEndpoint::Api {
            return Err(count_failure(
                "input_measurement_unavailable",
                FailureKind::Configuration,
            ));
        }
        if control.cancellation.is_cancelled() {
            return Err(count_failure("cancelled", FailureKind::Cancelled));
        }
        if control
            .deadline
            .is_some_and(|deadline| deadline <= Instant::now())
        {
            return Err(count_failure("deadline", FailureKind::Cancelled));
        }
        let body = (|| {
            let profile = self.prepared_model(request)?;
            let scope = self.scope(&request.request().model, profile);
            let (body, _) = self.encode_input(request.request(), profile, &scope, true)?;
            self.encode_body(&body)
        })()
        .map_err(|error| count_failure(&error.code, FailureKind::Configuration))?;
        let maximum = self.limits.max_response_bytes.min(COUNT_RESPONSE_BYTES);
        let mut response = self
            .transport
            .send(
                TransportRequest {
                    binding: self.binding.clone(),
                    operation: TransportOperation::OpenAiResponsesInputTokens,
                    body,
                    max_response_bytes: maximum,
                },
                control,
            )
            .await
            .map_err(|failure| match failure {
                TransportFailure::Unavailable => {
                    count_failure("input_measurement_unavailable", FailureKind::Configuration)
                }
                TransportFailure::Interrupted => {
                    count_failure("input_measurement_interrupted", FailureKind::Transient)
                }
            })?;
        if !(200..300).contains(&response.status) {
            return Err(read_http_error(response, maximum).await);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.body.next().await {
            let chunk = chunk.map_err(|_| {
                count_failure("input_measurement_interrupted", FailureKind::Transient)
            })?;
            if chunk.is_empty() || chunk.len() > maximum.saturating_sub(bytes.len()) {
                return Err(invalid_count());
            }
            bytes.extend(chunk);
        }
        let count: CountResponse = serde_json::from_slice(&bytes).map_err(|_| invalid_count())?;
        if count.object != "response.input_tokens" {
            return Err(invalid_count());
        }
        Ok(InputMeasurement {
            tokens: count.input_tokens,
            kind: MeasurementKind::Exact,
        })
    }
}

impl Provider for Responses {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities> {
        Ok(self.model(model)?.capabilities.clone())
    }

    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest> {
        let profile = self.model(&request.model)?;
        request.validate(&profile.capabilities)?;
        self.encode(
            &request,
            profile,
            &self.scope(&request.model, profile),
            false,
        )?;
        PreparedRequest::from_validated(request, self.binding.clone(), profile.capabilities.clone())
    }

    fn measure_input_async<'a>(
        &'a self,
        request: &'a PreparedRequest,
        control: RequestControl,
    ) -> BoxFuture<'a, std::result::Result<InputMeasurement, InferenceFailure>> {
        Box::pin(self.count(request, control))
    }

    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun> {
        let profile = self.prepared_model(&request)?;
        let scope = self.scope(&request.request().model, profile);
        let encoded = self.encode(request.request(), profile, &scope, true)?;
        let transport = Arc::clone(&self.transport);
        let limits = self.limits;
        let rate_rejection_evidence = self.endpoint == ResponsesEndpoint::Api;
        let request = TransportRequest {
            binding: self.binding.clone(),
            operation: TransportOperation::OpenAiResponses,
            body: encoded.body,
            max_response_bytes: limits.max_response_bytes,
        };
        Ok(InferenceRun::from_stream(control, move |control| {
            stream::events(
                transport,
                request,
                control,
                limits,
                scope,
                encoded.names,
                rate_rejection_evidence,
            )
        }))
    }
}

#[derive(Deserialize)]
struct CountResponse {
    object: String,
    input_tokens: u64,
}

fn count_failure(code: &str, kind: FailureKind) -> InferenceFailure {
    InferenceFailure {
        kind,
        code: code.into(),
        retry_after_ms: None,
        dispatch: None,
    }
}

fn invalid_count() -> InferenceFailure {
    count_failure("input_measurement_invalid", FailureKind::Protocol)
}

struct EncodedRequest {
    body: Vec<u8>,
    names: BTreeMap<String, ToolId>,
}

const REPLAY_SCHEMA: &str = "openai.responses.item";

#[derive(Serialize)]
struct ReplayScope {
    producer: ProviderId,
    binding: BindingId,
    model: ModelId,
    wire_model: ModelId,
    endpoint: ResponsesEndpoint,
    reasoning_effort: Option<ReasoningEffort>,
}

impl ReplayScope {
    fn state(&self, message: &Message, item: &WireItem) -> Result<ProviderState> {
        let bytes = serde_json::to_vec(item).map_err(|_| encoding_error())?;
        let payload = Envelope::new(SchemaId::new(REPLAY_SCHEMA)?, 1, bytes)?;
        Ok(ProviderState {
            producer: self.producer.clone(),
            binding: self.binding.clone(),
            validity: self.fingerprint(message, &message.content, &payload)?,
            payload,
        })
    }

    fn replay(&self, message: &Message) -> Result<Option<WireItem>> {
        let Some((Content::ProviderState(state), projection)) = message.content.split_last() else {
            return Ok(None);
        };
        if message.provenance.kind != ProvenanceKind::Generated
            || message.provenance.source != self.producer.as_str()
            || state.producer != self.producer
            || state.binding != self.binding
            || state.payload.schema().as_str() != REPLAY_SCHEMA
            || state.payload.version() != 1
            || state.validity != self.fingerprint(message, projection, &state.payload)?
        {
            return Err(Error::new(
                ErrorKind::Conflict,
                "provider_state_binding_changed",
            ));
        }
        serde_json::from_slice(state.payload.bytes())
            .map(Some)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "invalid_provider_state"))
    }

    fn fingerprint(
        &self,
        message: &Message,
        projection: &[Content],
        payload: &Envelope,
    ) -> Result<Fingerprint> {
        Fingerprint::of(&(self, &message.id, message.phase, projection, payload))
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WireItem {
    Message {
        id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        role: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        phase: Option<WirePhase>,
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<ItemStatus>,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<Vec<WireContent>>,
    },
    Reasoning {
        id: String,
        #[serde(default)]
        summary: Vec<Summary>,
        #[serde(skip_serializing_if = "Option::is_none")]
        encrypted_content: Option<String>,
    },
    FunctionCall {
        id: String,
        call_id: ToolCallId,
        name: String,
        arguments: String,
        #[serde(skip_serializing)]
        namespace: Option<String>,
        #[serde(skip_serializing)]
        encrypted_function_args: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<ItemStatus>,
    },
}

impl WireItem {
    fn id(&self) -> &str {
        match self {
            Self::Message { id, .. }
            | Self::Reasoning { id, .. }
            | Self::FunctionCall { id, .. } => id,
        }
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::Message { .. } => "message",
            Self::Reasoning { .. } => "reasoning",
            Self::FunctionCall { .. } => "function_call",
        }
    }
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum WirePhase {
    Commentary,
    PartialAnswer,
    FinalAnswer,
}

impl From<WirePhase> for MessagePhase {
    fn from(phase: WirePhase) -> Self {
        match phase {
            WirePhase::Commentary => Self::Progress,
            WirePhase::PartialAnswer | WirePhase::FinalAnswer => Self::Answer,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum ItemStatus {
    InProgress,
    Incomplete,
    Completed,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WireContent {
    OutputText {
        text: String,
        #[serde(skip_deserializing)]
        annotations: Vec<Value>,
    },
    Refusal {
        refusal: String,
    },
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Summary {
    SummaryText { text: String },
}

fn text(message: &Message) -> Result<Vec<&str>> {
    let mut parts = Vec::new();
    for part in &message.content {
        match part {
            Content::Text(text) => parts.push(text.as_str()),
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

fn push_message(input: &mut Vec<Value>, message: &Message, role: &str) -> Result<()> {
    let parts = text(message)?;
    if !parts.is_empty() {
        input.push(json!({"type": "message", "role": role, "content": parts.concat()}));
    }
    Ok(())
}

fn encoding_error() -> Error {
    Error::new(ErrorKind::InvalidInput, "request_encoding_failed")
}

fn unsupported_image() -> Error {
    Error::new(ErrorKind::Unsupported, "unsupported_responses_input_image")
}
