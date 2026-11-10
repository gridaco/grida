use crate::authority::AuthorityBinding;
use crate::messages::{
    Content, Message, Provenance, ProvenanceKind, ProviderState, Role, ToolArguments, ToolCall,
};
use crate::{
    AttemptId, BindingId, BoxFuture, CancellationToken, Envelope, Error, ErrorKind, Fingerprint,
    MessageId, ModelId, ProviderId, Result, ToolId,
};
use futures_core::stream::BoxStream;
use futures_util::{FutureExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::num::NonZeroU64;
use std::time::Instant;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Modality {
    Text,
    Image,
    Audio,
    Video,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolOffer {
    pub id: ToolId,
    pub version: u32,
    pub description: String,
    pub input: InputFormat,
    pub fingerprint: Fingerprint,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "schema", rename_all = "snake_case")]
pub enum InputFormat {
    Json(serde_json::Value),
    Text,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelCapabilities {
    pub revision: BindingId,
    pub input_modalities: BTreeSet<Modality>,
    pub json_tools: bool,
    pub text_tools: bool,
    pub max_output_tokens: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct InferenceRequest {
    pub model: ModelId,
    pub messages: Vec<Message>,
    pub tools: Vec<ToolOffer>,
    pub max_output_tokens: Option<u64>,
    pub extension: Option<Envelope>,
}

impl InferenceRequest {
    pub fn validate(&self, capabilities: &ModelCapabilities) -> Result<()> {
        if self.max_output_tokens == Some(0)
            || self
                .max_output_tokens
                .zip(capabilities.max_output_tokens)
                .is_some_and(|(n, maximum)| n > maximum)
        {
            return Err(Error::new(ErrorKind::LimitExceeded, "output_token_limit"));
        }
        crate::history::validate_exchanges(&self.messages, false)?;
        let mut names = BTreeSet::new();
        for tool in &self.tools {
            if tool.version == 0 || !names.insert(&tool.id) {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "invalid_tool_inventory",
                ));
            }
            if match tool.input {
                InputFormat::Json(_) => !capabilities.json_tools,
                InputFormat::Text => !capabilities.text_tools,
            } {
                return Err(Error::new(
                    ErrorKind::Unsupported,
                    "unsupported_tool_format",
                ));
            }
        }
        for message in &self.messages {
            for content in &message.content {
                let modality = match content {
                    Content::Media(media) if media.media_type.starts_with("image/") => {
                        Modality::Image
                    }
                    Content::Media(media) if media.media_type.starts_with("audio/") => {
                        Modality::Audio
                    }
                    Content::Media(media) if media.media_type.starts_with("video/") => {
                        Modality::Video
                    }
                    Content::Media(_) => {
                        return Err(Error::new(ErrorKind::Unsupported, "unsupported_media_type"));
                    }
                    _ => Modality::Text,
                };
                if !capabilities.input_modalities.contains(&modality) {
                    return Err(Error::new(
                        ErrorKind::Unsupported,
                        "unsupported_input_modality",
                    ));
                }
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderBinding {
    pub provider: ProviderId,
    pub authority: AuthorityBinding,
}

/// Immutable input validated by a provider before any request is dispatched.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PreparedRequest {
    request: InferenceRequest,
    binding: ProviderBinding,
    capabilities: ModelCapabilities,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_limit: Option<NonZeroU64>,
    fingerprint: Fingerprint,
}

impl PreparedRequest {
    /// Provider adapters validate their extension and principal before calling this factory.
    pub fn from_validated(
        request: InferenceRequest,
        binding: ProviderBinding,
        capabilities: ModelCapabilities,
    ) -> Result<Self> {
        request.validate(&capabilities)?;
        let fingerprint = Fingerprint::of(&(&request, &binding, &capabilities))?;
        Ok(Self {
            request,
            binding,
            capabilities,
            input_limit: None,
            fingerprint,
        })
    }

    /// Bind a caller-selected input token ceiling to this request's identity.
    pub fn with_input_limit(mut self, limit: NonZeroU64) -> Result<Self> {
        self.input_limit = Some(limit);
        self.fingerprint =
            Fingerprint::of(&(&self.request, &self.binding, &self.capabilities, limit))?;
        Ok(self)
    }

    pub fn input_limit(&self) -> Option<NonZeroU64> {
        self.input_limit
    }

    pub fn request(&self) -> &InferenceRequest {
        &self.request
    }
    pub fn binding(&self) -> &ProviderBinding {
        &self.binding
    }
    pub fn capabilities(&self) -> &ModelCapabilities {
        &self.capabilities
    }
    pub fn fingerprint(&self) -> Fingerprint {
        self.fingerprint
    }
}

impl<'de> Deserialize<'de> for PreparedRequest {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Data {
            request: InferenceRequest,
            binding: ProviderBinding,
            capabilities: ModelCapabilities,
            #[serde(default)]
            input_limit: Option<NonZeroU64>,
            fingerprint: Fingerprint,
        }
        let data = Data::deserialize(deserializer)?;
        let mut request = Self::from_validated(data.request, data.binding, data.capabilities)
            .map_err(serde::de::Error::custom)?;
        if let Some(limit) = data.input_limit {
            request = request
                .with_input_limit(limit)
                .map_err(serde::de::Error::custom)?;
        }
        if request.fingerprint != data.fingerprint {
            return Err(serde::de::Error::custom("request fingerprint mismatch"));
        }
        Ok(request)
    }
}

pub trait Provider: Send + Sync {
    fn capabilities(&self, model: &ModelId) -> Result<ModelCapabilities>;
    fn prepare(&self, request: InferenceRequest) -> Result<PreparedRequest>;
    /// Measure the complete prepared input, including tool declarations and
    /// provider framing, using local information and without dispatch.
    fn measure_input(&self, _request: &PreparedRequest) -> Result<InputMeasurement> {
        Err(Error::new(
            ErrorKind::Unsupported,
            "input_measurement_unavailable",
        ))
    }
    /// Measure this exact prepared input within the caller's admitted request
    /// scope. Remote implementations use the supplied cancellation and deadline.
    fn measure_input_async<'a>(
        &'a self,
        request: &'a PreparedRequest,
        _control: RequestControl,
    ) -> BoxFuture<'a, std::result::Result<InputMeasurement, InferenceFailure>> {
        Box::pin(async move {
            self.measure_input(request)
                .map_err(|error| InferenceFailure {
                    kind: FailureKind::Configuration,
                    code: error.code,
                    retry_after_ms: None,
                    dispatch: None,
                })
        })
    }
    /// Failure here guarantees that dispatch has not begun.
    fn start(&self, request: PreparedRequest, control: InferenceControl) -> Result<InferenceRun>;
}

#[derive(Clone)]
pub struct InferenceControl {
    pub attempt: AttemptId,
    pub cancellation: CancellationToken,
    /// Provider adapters enforce this deadline in their transport.
    pub deadline: Option<Instant>,
    pub max_output_bytes: usize,
}

impl InferenceControl {
    pub fn request_control(&self) -> RequestControl {
        RequestControl {
            cancellation: self.cancellation.clone(),
            deadline: self.deadline,
        }
    }
}

/// Lifetime of an authorized provider request.
#[derive(Clone)]
pub struct RequestControl {
    pub cancellation: CancellationToken,
    pub deadline: Option<Instant>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum InferenceUpdate {
    TextDelta { message: MessageId, text: String },
    ReasoningDelta { message: MessageId, text: String },
    ToolCall(ToolCall),
    Usage(UsageObservation),
    ProviderState(ProviderState),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ProviderEvent {
    /// Provider evidence retained by the run without a public progress update.
    Receipt(Envelope),
    Update(InferenceUpdate),
    Finished(InferenceOutcome),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InferenceStatus {
    Completed,
    Limited,
    Refused,
    Interrupted,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct InferenceOutcome {
    pub status: InferenceStatus,
    pub messages: Vec<Message>,
    pub usage: Vec<UsageObservation>,
    pub failure: Option<InferenceFailure>,
    pub receipt: Option<Envelope>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InferenceFailure {
    pub kind: FailureKind,
    pub code: String,
    pub retry_after_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dispatch: Option<DispatchEvidence>,
}

/// Positive evidence from the adapter about the disposition of the request.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DispatchEvidence {
    RejectedBeforeExecution,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureKind {
    Authentication,
    Configuration,
    Quota,
    ContextLimit,
    RateLimit,
    Transient,
    Protocol,
    Cancelled,
    OutputLimit,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UsageObservation {
    pub attempt: AttemptId,
    pub source: String,
    pub category: String,
    pub unit: String,
    pub revision: u64,
    pub quantity: u64,
    pub certainty: MeasurementKind,
    pub final_value: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeasurementKind {
    Exact,
    UpperBound,
    Estimate,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputMeasurement {
    pub tokens: u64,
    pub kind: MeasurementKind,
}

/// Owns one provider stream and a child cancellation scope.
pub struct InferenceRun {
    stream: BoxStream<'static, ProviderEvent>,
    cancellation: CancellationToken,
    attempt: AttemptId,
    maximum: usize,
    received: usize,
    terminal: Option<InferenceOutcome>,
    partial: Vec<Message>,
    usage: UsageEvidence,
    receipt: Option<Envelope>,
    receipt_bytes: usize,
}

#[derive(Default)]
struct UsageEvidence {
    latest: BTreeMap<(String, String, String), (UsageObservation, usize)>,
    bytes: usize,
}

impl UsageEvidence {
    fn retain(
        &mut self,
        attempt: &AttemptId,
        observation: UsageObservation,
        limit: usize,
    ) -> std::result::Result<(), (FailureKind, &'static str)> {
        if &observation.attempt != attempt {
            return Err((FailureKind::Protocol, "usage_attempt_mismatch"));
        }
        let oversized = (FailureKind::OutputLimit, "response_byte_limit");
        if observation
            .source
            .len()
            .saturating_add(observation.category.len())
            .saturating_add(observation.unit.len())
            > limit
        {
            return Err(oversized);
        }
        let key = (
            observation.source.clone(),
            observation.category.clone(),
            observation.unit.clone(),
        );
        let previous_bytes = match self.latest.get(&key) {
            Some((previous, _)) if previous.revision > observation.revision => return Ok(()),
            Some((previous, _)) if previous.revision == observation.revision => {
                return if previous == &observation {
                    Ok(())
                } else {
                    Err((FailureKind::Protocol, "usage_revision_conflict"))
                };
            }
            Some((_, size)) => *size,
            None => 0,
        };
        // Charge one separator byte per observation and one opening bracket.
        let bytes = encoded_size(&observation).saturating_add(1);
        let total = (self.bytes - previous_bytes).saturating_add(bytes);
        if total.saturating_add(1) > limit {
            return Err(oversized);
        }
        self.bytes = total;
        self.latest.insert(key, (observation, bytes));
        Ok(())
    }

    fn encoded_size(&self) -> usize {
        self.bytes.saturating_add(usize::from(self.bytes > 0))
    }

    fn take(&mut self) -> Vec<UsageObservation> {
        self.bytes = 0;
        std::mem::take(&mut self.latest)
            .into_values()
            .map(|(value, _)| value)
            .collect()
    }
}

fn encoded_size(value: &impl Serialize) -> usize {
    serde_json::to_vec(value).map_or(usize::MAX, |bytes| bytes.len())
}

impl InferenceRun {
    /// The factory receives the same child control that this run owns.
    pub fn from_stream(
        control: InferenceControl,
        create: impl FnOnce(InferenceControl) -> BoxStream<'static, ProviderEvent>,
    ) -> Self {
        let child = InferenceControl {
            attempt: control.attempt.clone(),
            cancellation: control.cancellation.child_token(),
            deadline: control.deadline,
            max_output_bytes: control.max_output_bytes,
        };
        let cancellation = child.cancellation.clone();
        Self {
            stream: create(child),
            cancellation,
            attempt: control.attempt,
            maximum: control.max_output_bytes,
            received: 0,
            terminal: None,
            partial: vec![],
            usage: UsageEvidence::default(),
            receipt: None,
            receipt_bytes: 0,
        }
    }

    pub async fn next(&mut self) -> Option<InferenceUpdate> {
        while self.terminal.is_none() {
            let event = {
                let cancelled = self.cancellation.cancelled().fuse();
                let next = self.stream.next().fuse();
                futures_util::pin_mut!(cancelled, next);
                futures_util::select_biased! { _ = cancelled => None, value = next => value }
            };
            match event {
                Some(ProviderEvent::Receipt(receipt)) => {
                    if self.receipt.is_some() {
                        self.interrupt(
                            FailureKind::Protocol,
                            InferenceStatus::Interrupted,
                            "duplicate_provider_receipt",
                        );
                        continue;
                    }
                    let remaining = self.maximum.saturating_sub(self.received);
                    let size = if receipt.bytes().len() > remaining {
                        usize::MAX
                    } else {
                        encoded_size(&receipt)
                    };
                    if size > remaining {
                        self.interrupt(
                            FailureKind::OutputLimit,
                            InferenceStatus::Limited,
                            "receipt_byte_limit",
                        );
                        continue;
                    }
                    self.received += size;
                    self.receipt_bytes = size;
                    self.receipt = Some(receipt);
                }
                Some(ProviderEvent::Update(update)) => {
                    let size = encoded_size(&update);
                    if size > self.maximum.saturating_sub(self.received) {
                        self.interrupt(
                            FailureKind::OutputLimit,
                            InferenceStatus::Limited,
                            "output_limit",
                        );
                        continue;
                    }
                    self.received += size;
                    if let InferenceUpdate::Usage(observation) = &update
                        && let Err((kind, code)) =
                            self.usage
                                .retain(&self.attempt, observation.clone(), self.maximum)
                    {
                        self.interrupt(kind, InferenceStatus::Interrupted, code);
                        continue;
                    }
                    self.capture(&update);
                    return Some(update);
                }
                Some(ProviderEvent::Finished(mut outcome)) => {
                    if let Some(receipt) = self.receipt.take() {
                        if outcome
                            .receipt
                            .as_ref()
                            .is_some_and(|terminal| terminal != &receipt)
                        {
                            self.receipt = Some(receipt);
                            self.interrupt(
                                FailureKind::Protocol,
                                InferenceStatus::Interrupted,
                                "provider_receipt_changed",
                            );
                            continue;
                        }
                        outcome.receipt = Some(receipt);
                    }
                    let remaining = self.maximum.saturating_sub(self.receipt_bytes);
                    let mut size = encoded_size(&outcome.messages);
                    if size.saturating_add(self.usage.encoded_size()) > remaining {
                        outcome.messages = std::mem::take(&mut self.partial);
                        outcome.status = InferenceStatus::Limited;
                        outcome.failure.get_or_insert(InferenceFailure {
                            kind: FailureKind::OutputLimit,
                            code: "output_limit".into(),
                            retry_after_ms: None,
                            dispatch: None,
                        });
                        size = encoded_size(&outcome.messages);
                    }
                    for observation in std::mem::take(&mut outcome.usage) {
                        if let Err((kind, code)) = self.usage.retain(
                            &self.attempt,
                            observation,
                            remaining.saturating_sub(size),
                        ) {
                            outcome.status = if kind == FailureKind::OutputLimit {
                                InferenceStatus::Limited
                            } else {
                                InferenceStatus::Interrupted
                            };
                            outcome.failure = Some(InferenceFailure {
                                kind,
                                code: code.into(),
                                retry_after_ms: None,
                                dispatch: None,
                            });
                            break;
                        }
                    }
                    outcome.usage = self.usage.take();
                    self.terminal = Some(outcome);
                }
                None => {
                    let cancelled = self.cancellation.is_cancelled();
                    self.interrupt(
                        if cancelled {
                            FailureKind::Cancelled
                        } else {
                            FailureKind::Protocol
                        },
                        InferenceStatus::Interrupted,
                        if cancelled {
                            "cancelled"
                        } else {
                            "missing_terminal_evidence"
                        },
                    );
                }
            }
        }
        None
    }

    pub async fn finish(mut self) -> InferenceOutcome {
        while self.next().await.is_some() {}
        self.terminal
            .take()
            .expect("next establishes a terminal outcome")
    }

    fn interrupt(&mut self, kind: FailureKind, status: InferenceStatus, code: &str) {
        self.cancellation.cancel();
        self.terminal = Some(InferenceOutcome {
            status,
            messages: std::mem::take(&mut self.partial),
            usage: self.usage.take(),
            failure: Some(InferenceFailure {
                kind,
                code: code.into(),
                retry_after_ms: None,
                dispatch: None,
            }),
            receipt: self.receipt.take(),
        });
    }

    fn capture(&mut self, update: &InferenceUpdate) {
        match update {
            InferenceUpdate::TextDelta { message, text } => {
                self.capture_content(message.clone(), Content::Text(text.clone()))
            }
            InferenceUpdate::ReasoningDelta { message, text } => {
                self.capture_content(message.clone(), Content::Reasoning(text.clone()))
            }
            InferenceUpdate::ToolCall(call) => {
                let id = MessageId::new(call.id.as_str())
                    .expect("tool call identity is a validated message identity");
                self.capture_content(id, Content::ToolCall(call.clone()));
            }
            InferenceUpdate::ProviderState(state) => {
                let id = MessageId::new("provider-state").expect("constant identity");
                self.capture_content(id, Content::ProviderState(state.clone()));
            }
            InferenceUpdate::Usage(_) => {}
        }
    }

    fn capture_content(&mut self, id: MessageId, content: Content) {
        if let Some(existing) = self.partial.iter_mut().find(|message| message.id == id) {
            existing.content.push(content);
        } else {
            self.partial.push(Message {
                id,
                role: Role::Assistant,
                phase: None,
                content: vec![content],
                provenance: Provenance {
                    source: "provider".into(),
                    kind: ProvenanceKind::Generated,
                    fingerprint: None,
                },
            });
        }
    }
}

impl Drop for InferenceRun {
    fn drop(&mut self) {
        self.cancellation.cancel();
    }
}

/// Match an offered argument representation without interpreting domain values.
pub fn accepts_arguments(format: &InputFormat, arguments: &ToolArguments) -> bool {
    matches!(
        (format, arguments),
        (InputFormat::Json(_), ToolArguments::Json(_))
            | (InputFormat::Text, ToolArguments::Text(_))
    )
}
