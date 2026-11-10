use crate::sse::Decoder;
use crate::{
    InputImageResolver, StreamLimits, StreamingTransport, TransportFailure, TransportRequest,
    TransportResponse,
};
use agent_kit_core::inference::{
    DispatchEvidence, FailureKind, InferenceControl, InferenceFailure, InferenceStatus,
    InferenceUpdate, InputMeasurement, MeasurementKind, Modality, ModelCapabilities, ProviderEvent,
    RequestControl, UsageObservation,
};
use agent_kit_core::messages::{MediaRef, ResultContent, ToolResult};
use agent_kit_core::{
    AttemptId, Envelope, Error, ErrorKind, Fingerprint, Result, SchemaId, ToolId,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, VecDeque};
use std::fmt::Write;
use std::sync::Arc;
use std::time::Instant;

const COUNT_RESPONSE_BYTES: usize = 4096;

pub(crate) enum Incoming {
    Receipt(Envelope),
    Frame(Vec<u8>),
    End,
    Failure(InferenceStatus, InferenceFailure),
}

#[derive(Clone, Copy)]
pub(crate) enum RateRejectionEvidence {
    None,
    Code,
    CodeAndType,
}

pub(crate) struct WireStream {
    transport: Arc<dyn StreamingTransport>,
    request: Option<TransportRequest>,
    response: Option<TransportResponse>,
    control: InferenceControl,
    limits: StreamLimits,
    decoder: Decoder,
    bytes_received: usize,
    pending_limit: Option<&'static str>,
    rate_rejection_evidence: RateRejectionEvidence,
}

impl WireStream {
    pub(crate) fn new(
        transport: Arc<dyn StreamingTransport>,
        request: TransportRequest,
        control: InferenceControl,
        limits: StreamLimits,
    ) -> Self {
        Self {
            transport,
            rate_rejection_evidence: RateRejectionEvidence::None,
            request: Some(request),
            response: None,
            control,
            limits,
            decoder: Decoder::new(limits.max_event_bytes),
            bytes_received: 0,
            pending_limit: None,
        }
    }

    pub(crate) fn with_rate_rejection_evidence(mut self, evidence: RateRejectionEvidence) -> Self {
        self.rate_rejection_evidence = evidence;
        self
    }

    pub(crate) fn close(&mut self) {
        self.response.take();
    }

    pub(crate) async fn next(&mut self) -> Incoming {
        loop {
            if let Some(request) = self.request.take() {
                match self
                    .transport
                    .send(request, self.control.request_control())
                    .await
                {
                    Ok(mut response) => {
                        let evidence = response.request_id.take().and_then(receipt);
                        self.response = Some(response);
                        if let Some(evidence) = evidence {
                            return Incoming::Receipt(evidence);
                        }
                    }
                    Err(TransportFailure::Unavailable) => {
                        return failure(
                            InferenceStatus::Failed,
                            FailureKind::Transient,
                            "transport_unavailable",
                        );
                    }
                    Err(TransportFailure::Interrupted) => {
                        return failure(
                            InferenceStatus::Interrupted,
                            FailureKind::Transient,
                            "transport_interrupted",
                        );
                    }
                }
            }
            if let Some(frame) = self.decoder.pop() {
                return Incoming::Frame(frame);
            }
            if let Some(code) = self.pending_limit.take() {
                self.close();
                return failure(InferenceStatus::Limited, FailureKind::OutputLimit, code);
            }
            let Some(response) = self.response.as_mut() else {
                return Incoming::End;
            };
            if !(200..300).contains(&response.status) {
                let response = self
                    .response
                    .take()
                    .expect("non-success response is present");
                let status = response.status;
                let error = read_http_failure(
                    response,
                    self.limits.max_event_bytes,
                    self.rate_rejection_evidence,
                )
                .await;
                let disposition = match status {
                    // An upstream or intermediary failure can follow dispatch.
                    408 | 500..=599 => InferenceStatus::Interrupted,
                    429 if matches!(
                        self.rate_rejection_evidence,
                        RateRejectionEvidence::CodeAndType
                    ) && error.kind == FailureKind::RateLimit
                        && error.dispatch.is_none() =>
                    {
                        InferenceStatus::Interrupted
                    }
                    _ if error.kind == FailureKind::ContextLimit => InferenceStatus::Limited,
                    _ => InferenceStatus::Failed,
                };
                return Incoming::Failure(disposition, error);
            }
            match response.body.next().await {
                Some(Ok(bytes)) if bytes.is_empty() => {
                    self.close();
                    return failure(
                        InferenceStatus::Interrupted,
                        FailureKind::Protocol,
                        "empty_transport_chunk",
                    );
                }
                Some(Ok(bytes)) => {
                    let remaining = self.limits.max_response_bytes - self.bytes_received;
                    let accepted = remaining.min(bytes.len());
                    self.bytes_received += accepted;
                    if self.decoder.feed(&bytes[..accepted]).is_err() {
                        self.pending_limit = Some("event_byte_limit");
                    } else if accepted < bytes.len() {
                        self.pending_limit = Some("response_byte_limit");
                    }
                }
                Some(Err(_)) => {
                    self.close();
                    return failure(
                        InferenceStatus::Interrupted,
                        FailureKind::Transient,
                        "transport_interrupted",
                    );
                }
                None => {
                    self.close();
                    return if self.decoder.is_incomplete() {
                        failure(
                            InferenceStatus::Interrupted,
                            FailureKind::Protocol,
                            "incomplete_event",
                        )
                    } else {
                        Incoming::End
                    };
                }
            }
        }
    }
}

fn failure(status: InferenceStatus, kind: FailureKind, code: &str) -> Incoming {
    Incoming::Failure(
        status,
        InferenceFailure {
            kind,
            code: code.into(),
            retry_after_ms: None,
            dispatch: None,
        },
    )
}

#[derive(Deserialize)]
struct ErrorBody {
    error: WireError,
}

#[derive(Deserialize)]
pub(crate) struct WireError {
    code: Option<serde_json::Value>,
    #[serde(rename = "type")]
    kind: Option<Value>,
    status: Option<Value>,
}

impl WireError {
    pub(crate) fn code(&self) -> Option<&str> {
        self.code
            .as_ref()
            .and_then(Value::as_str)
            .or_else(|| self.kind.as_ref().and_then(Value::as_str))
            .or_else(|| self.status.as_ref().and_then(Value::as_str))
    }

    fn proves_rate_rejection(&self, evidence: RateRejectionEvidence) -> bool {
        self.code.as_ref().and_then(Value::as_str) == Some("rate_limit_exceeded")
            && match evidence {
                RateRejectionEvidence::None => false,
                RateRejectionEvidence::Code => true,
                RateRejectionEvidence::CodeAndType => {
                    self.kind.as_ref().and_then(Value::as_str) == Some("rate_limit_error")
                }
            }
    }
}

fn receipt(id: String) -> Option<Envelope> {
    if id.is_empty()
        || id.len() > 256
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return None;
    }
    Envelope::new(
        SchemaId::new("http.request-id").expect("constant schema"),
        1,
        id.into_bytes(),
    )
    .ok()
}

pub(crate) fn check_count_control(
    control: &RequestControl,
) -> std::result::Result<(), InferenceFailure> {
    if control.cancellation.is_cancelled() {
        return Err(count_failure("cancelled", FailureKind::Cancelled));
    }
    if control
        .deadline
        .is_some_and(|deadline| deadline <= Instant::now())
    {
        return Err(count_failure("deadline", FailureKind::Cancelled));
    }
    Ok(())
}

pub(crate) async fn count_openai_input(
    transport: &dyn StreamingTransport,
    mut request: TransportRequest,
    control: RequestControl,
) -> std::result::Result<InputMeasurement, InferenceFailure> {
    let maximum = request.max_response_bytes.min(COUNT_RESPONSE_BYTES);
    request.max_response_bytes = maximum;
    let mut response = transport
        .send(request, control)
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
        return Err(read_http_failure(response, maximum, RateRejectionEvidence::None).await);
    }
    let invalid = || count_failure("input_measurement_invalid", FailureKind::Protocol);
    let mut bytes = Vec::new();
    while let Some(chunk) = response.body.next().await {
        let chunk = chunk
            .map_err(|_| count_failure("input_measurement_interrupted", FailureKind::Transient))?;
        if chunk.is_empty() || chunk.len() > maximum.saturating_sub(bytes.len()) {
            return Err(invalid());
        }
        bytes.extend(chunk);
    }
    #[derive(Deserialize)]
    struct CountResponse {
        object: String,
        input_tokens: u64,
    }
    let count: CountResponse = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if count.object != "response.input_tokens" {
        return Err(invalid());
    }
    Ok(InputMeasurement {
        tokens: count.input_tokens,
        kind: MeasurementKind::Exact,
    })
}

pub(crate) fn count_failure(code: &str, kind: FailureKind) -> InferenceFailure {
    InferenceFailure {
        kind,
        code: code.into(),
        retry_after_ms: None,
        dispatch: None,
    }
}

async fn read_http_failure(
    mut response: TransportResponse,
    maximum: usize,
    rate_rejection_evidence: RateRejectionEvidence,
) -> InferenceFailure {
    if matches!(response.status, 401 | 402) {
        return classify_error(response.status, None, response.retry_after_ms);
    }
    let mut bytes = Vec::new();
    let complete = loop {
        match response.body.next().await {
            None => break true,
            Some(Ok(chunk))
                if !chunk.is_empty() && chunk.len() <= maximum.saturating_sub(bytes.len()) =>
            {
                bytes.extend_from_slice(&chunk);
                if bytes.len() == maximum {
                    break false;
                }
            }
            _ => break false,
        }
    };
    let parsed: Option<ErrorBody> = serde_json::from_slice(&bytes).ok();
    let code = parsed.as_ref().and_then(|parsed| parsed.error.code());
    let mut failure = classify_error(response.status, code, response.retry_after_ms);
    if complete
        && response.status == 429
        && parsed
            .as_ref()
            .is_some_and(|body| body.error.proves_rate_rejection(rate_rejection_evidence))
    {
        failure.dispatch = Some(DispatchEvidence::RejectedBeforeExecution);
    }
    failure
}

pub(crate) fn classify_error(
    status: u16,
    code: Option<&str>,
    retry_after_ms: Option<u64>,
) -> InferenceFailure {
    let (kind, code) = match (status, code) {
        (402, _) => (FailureKind::Quota, "payment_required"),
        (401, _) => (FailureKind::Authentication, "authentication_required"),
        (_, Some("model_not_found")) => (FailureKind::Configuration, "model_unavailable"),
        (403, _)
        | (
            _,
            Some(
                "authentication_error"
                | "permission_error"
                | "invalid_api_key"
                | "UNAUTHENTICATED"
                | "PERMISSION_DENIED",
            ),
        ) => (FailureKind::Authentication, "authentication_required"),
        (
            _,
            Some(
                "insufficient_quota"
                | "billing_hard_limit_reached"
                | "credit_balance_exhausted"
                | "organization_spend_limit_exceeded"
                | "project_spend_limit_exceeded"
                | "organization_usage_limit_exceeded"
                | "usage_limit_reached"
                | "workspace_member_usage_limit_reached",
            ),
        ) => (FailureKind::Quota, "quota_exhausted"),
        (_, Some("context_length_exceeded")) => (FailureKind::ContextLimit, "context_limit"),
        (429, _)
        | (
            _,
            Some("rate_limit_error" | "rate_limit_exceeded" | "slow_down" | "RESOURCE_EXHAUSTED"),
        ) => (FailureKind::RateLimit, "rate_limit"),
        (408 | 500..=599, _)
        | (
            _,
            Some(
                "overloaded_error" | "api_error" | "server_error" | "server_overloaded"
                | "UNAVAILABLE",
            ),
        ) => (FailureKind::Transient, "provider_unavailable"),
        (400 | 404 | 422, _)
        | (_, Some("invalid_request_error" | "invalid_prompt" | "INVALID_ARGUMENT")) => {
            (FailureKind::Configuration, "provider_request_rejected")
        }
        _ => (FailureKind::Protocol, "provider_response_error"),
    };
    InferenceFailure {
        kind,
        code: code.into(),
        retry_after_ms,
        dispatch: None,
    }
}

pub(crate) fn function_name(tool: &ToolId) -> Result<String> {
    let id = tool.as_str();
    if id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Ok(id.into());
    }
    short_identity("tool", tool)
}

pub(crate) fn short_identity(prefix: &str, value: &impl Serialize) -> Result<String> {
    let digest = Fingerprint::of(value)?;
    let mut name = format!("{prefix}_");
    for byte in &digest.bytes()[..16] {
        write!(&mut name, "{byte:02x}").expect("string formatting");
    }
    Ok(name)
}

pub(crate) fn text_profile(profile: &ModelCapabilities) -> bool {
    profile.input_modalities.len() == 1
        && profile.input_modalities.contains(&Modality::Text)
        && !profile.text_tools
}

pub(crate) fn image_profile(profile: &ModelCapabilities) -> bool {
    profile.input_modalities.len() == 2
        && profile.input_modalities.contains(&Modality::Text)
        && profile.input_modalities.contains(&Modality::Image)
        && !profile.text_tools
}

pub(crate) fn image_data_url(
    media: &MediaRef,
    resolver: Option<&InputImageResolver>,
    remaining: &mut usize,
) -> Result<String> {
    let mut url = format!("data:{};base64,", media.media_type);
    append_image_base64(&mut url, media, resolver, remaining)?;
    Ok(url)
}

pub(crate) fn append_image_base64(
    data: &mut String,
    media: &MediaRef,
    resolver: Option<&InputImageResolver>,
    remaining: &mut usize,
) -> Result<()> {
    if let Some(resolver) = resolver {
        let bytes = resolver(media, *remaining)?;
        if bytes.is_empty() || bytes.len() > *remaining {
            return Err(Error::new(ErrorKind::LimitExceeded, "request_byte_limit"));
        }
        *remaining -= bytes.len();
        STANDARD.encode_string(&bytes, data);
    }
    Ok(())
}

pub(crate) fn tool_result(result: &ToolResult) -> Result<Value> {
    let mut text = Vec::new();
    for part in &result.content {
        let ResultContent::Text(value) = part else {
            return Err(Error::new(ErrorKind::Unsupported, "unsupported_tool_media"));
        };
        text.push(value);
    }
    Ok(tool_result_payload(result, text))
}

pub(crate) fn tool_result_payload(result: &ToolResult, content: impl Serialize) -> Value {
    json!({
        "status": result.status, "content": content, "structured": result.structured,
        "truncated": result.truncated
    })
}

#[derive(Default)]
pub(crate) struct Usage {
    revision: u64,
    values: BTreeMap<&'static str, UsageObservation>,
}

impl Usage {
    pub(crate) fn observe<const N: usize>(
        &mut self,
        attempt: &AttemptId,
        source: &str,
        values: [(&'static str, Option<u64>); N],
        final_value: bool,
        updates: &mut VecDeque<ProviderEvent>,
    ) {
        self.revision += 1;
        for (category, quantity) in values {
            let Some(quantity) = quantity else {
                continue;
            };
            let observation = UsageObservation {
                attempt: attempt.clone(),
                source: source.into(),
                category: category.into(),
                unit: "tokens".into(),
                revision: self.revision,
                quantity,
                certainty: MeasurementKind::Exact,
                final_value,
            };
            self.values.insert(category, observation.clone());
            updates.push_back(ProviderEvent::Update(InferenceUpdate::Usage(observation)));
        }
    }

    pub(crate) fn finish(&mut self, final_value: bool) -> Vec<UsageObservation> {
        std::mem::take(&mut self.values)
            .into_values()
            .map(|mut observation| {
                if final_value {
                    observation.final_value = true;
                    observation.revision = self.revision + 1;
                }
                observation
            })
            .collect()
    }
}
