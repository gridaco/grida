use crate::sse::Decoder;
use crate::{
    StreamLimits, StreamingTransport, TransportFailure, TransportRequest, TransportResponse,
};
use agent_kit_core::inference::{
    FailureKind, InferenceControl, InferenceFailure, InferenceStatus, InferenceUpdate,
    MeasurementKind, Modality, ModelCapabilities, ProviderEvent, UsageObservation,
};
use agent_kit_core::messages::{ResultContent, ToolResult};
use agent_kit_core::{
    AttemptId, Envelope, Error, ErrorKind, Fingerprint, Result, SchemaId, ToolId,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, VecDeque};
use std::fmt::Write;
use std::sync::Arc;

pub(crate) enum Incoming {
    Receipt(Envelope),
    Frame(Vec<u8>),
    End,
    Failure(InferenceStatus, InferenceFailure),
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
            request: Some(request),
            response: None,
            control,
            limits,
            decoder: Decoder::new(limits.max_event_bytes),
            bytes_received: 0,
            pending_limit: None,
        }
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
                return Incoming::Failure(
                    InferenceStatus::Failed,
                    read_http_error(response, self.limits.max_event_bytes).await,
                );
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
        },
    )
}

#[derive(Deserialize)]
struct ErrorBody {
    error: WireError,
}

#[derive(Deserialize)]
struct WireError {
    code: Option<serde_json::Value>,
    #[serde(rename = "type")]
    kind: Option<String>,
    status: Option<String>,
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

pub(crate) async fn read_http_error(
    mut response: TransportResponse,
    maximum: usize,
) -> InferenceFailure {
    if matches!(response.status, 401..=403) {
        return classify_error(response.status, None, response.retry_after_ms);
    }
    let mut bytes = Vec::new();
    while let Some(Ok(chunk)) = response.body.next().await {
        if chunk.is_empty() || chunk.len() > maximum.saturating_sub(bytes.len()) {
            break;
        }
        bytes.extend_from_slice(&chunk);
        if bytes.len() == maximum {
            break;
        }
    }
    let parsed: Option<ErrorBody> = serde_json::from_slice(&bytes).ok();
    let code = parsed.as_ref().and_then(|parsed| {
        parsed
            .error
            .code
            .as_ref()
            .and_then(Value::as_str)
            .or(parsed.error.kind.as_deref())
            .or(parsed.error.status.as_deref())
    });
    classify_error(response.status, code, response.retry_after_ms)
}

pub(crate) fn classify_error(
    status: u16,
    code: Option<&str>,
    retry_after_ms: Option<u64>,
) -> InferenceFailure {
    let (kind, code) = match (status, code) {
        (402, _) => (FailureKind::Quota, "payment_required"),
        (401 | 403, _)
        | (
            _,
            Some(
                "authentication_error"
                | "permission_error"
                | "UNAUTHENTICATED"
                | "PERMISSION_DENIED",
            ),
        ) => (FailureKind::Authentication, "authentication_required"),
        (_, Some("insufficient_quota" | "billing_hard_limit_reached")) => {
            (FailureKind::Quota, "quota_exhausted")
        }
        (_, Some("context_length_exceeded")) => (FailureKind::ContextLimit, "context_limit"),
        (429, _) | (_, Some("rate_limit_error" | "RESOURCE_EXHAUSTED")) => {
            (FailureKind::RateLimit, "rate_limit")
        }
        (408 | 500..=599, _) | (_, Some("overloaded_error" | "api_error" | "UNAVAILABLE")) => {
            (FailureKind::Transient, "provider_unavailable")
        }
        (400 | 404 | 422, _) | (_, Some("invalid_request_error" | "INVALID_ARGUMENT")) => {
            (FailureKind::Configuration, "provider_request_rejected")
        }
        _ => (FailureKind::Protocol, "provider_response_error"),
    };
    InferenceFailure {
        kind,
        code: code.into(),
        retry_after_ms,
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

pub(crate) fn tool_result(result: &ToolResult) -> Result<Value> {
    let mut text = Vec::new();
    for part in &result.content {
        let ResultContent::Text(value) = part else {
            return Err(Error::new(ErrorKind::Unsupported, "unsupported_tool_media"));
        };
        text.push(value);
    }
    Ok(json!({
        "status": result.status, "content": text, "structured": result.structured,
        "truncated": result.truncated
    }))
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
