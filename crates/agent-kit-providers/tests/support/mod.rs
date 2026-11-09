use agent_kit_core::inference::{InferenceControl, InferenceRequest, InputFormat, ToolOffer};
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
use agent_kit_core::{
    AttemptId, BoxFuture, CancellationToken, Fingerprint, MessageId, ModelId, ToolId,
};
use agent_kit_providers::{
    StreamLimits, StreamingTransport, TransportFailure, TransportRequest, TransportResponse,
};
use futures_util::{StreamExt, stream};
use serde_json::{Value, json};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

type Reply = Result<TransportResponse, TransportFailure>;

pub(super) struct FixtureTransport {
    replies: Mutex<VecDeque<Reply>>,
    pub(super) requests: Mutex<Vec<(TransportRequest, InferenceControl)>>,
}

impl FixtureTransport {
    pub(super) fn new(replies: impl IntoIterator<Item = Reply>) -> Arc<Self> {
        Arc::new(Self {
            replies: Mutex::new(replies.into_iter().collect()),
            requests: Mutex::new(Vec::new()),
        })
    }
}

impl StreamingTransport for FixtureTransport {
    fn send(&self, request: TransportRequest, control: InferenceControl) -> BoxFuture<'_, Reply> {
        self.requests.lock().unwrap().push((request, control));
        let reply = self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .expect("unexpected transport dispatch");
        Box::pin(async { reply })
    }
}

pub(super) fn limits() -> StreamLimits {
    StreamLimits {
        max_request_bytes: 1 << 20,
        max_response_bytes: 1 << 20,
        max_event_bytes: 1 << 16,
        max_tool_calls: 8,
        max_tool_argument_bytes: 1 << 16,
    }
}

pub(super) fn message(id: &str, role: Role, content: Vec<Content>) -> Message {
    Message {
        id: MessageId::new(id).unwrap(),
        role,
        phase: None,
        content,
        provenance: Provenance {
            source: "fixture".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    }
}

pub(super) fn request() -> InferenceRequest {
    InferenceRequest {
        model: ModelId::new("model").unwrap(),
        messages: vec![message(
            "input",
            Role::User,
            vec![Content::Text("Respond briefly".into())],
        )],
        tools: vec![],
        max_output_tokens: Some(32),
        extension: None,
    }
}

pub(super) fn offer(id: &str) -> ToolOffer {
    ToolOffer {
        id: ToolId::new(id).unwrap(),
        version: 1,
        description: "Echo a value".into(),
        input: InputFormat::Json(
            json!({ "type": "object", "properties": { "value": { "type": "string" } } }),
        ),
        fingerprint: Fingerprint::of(&id).unwrap(),
    }
}

pub(super) fn tool_request() -> InferenceRequest {
    InferenceRequest {
        tools: vec![offer("echo")],
        ..request()
    }
}

pub(super) fn control(id: &str) -> InferenceControl {
    InferenceControl {
        attempt: AttemptId::new(id).unwrap(),
        cancellation: CancellationToken::new(),
        deadline: None,
        max_output_bytes: 1 << 20,
    }
}

pub(super) fn frame(value: Value) -> Vec<u8> {
    format!("data: {value}\r\n\r\n").into_bytes()
}

pub(super) fn response(
    chunks: impl IntoIterator<Item = Vec<u8>>,
    hold_open: bool,
) -> TransportResponse {
    let chunks: Vec<_> = chunks.into_iter().map(Ok).collect();
    let body = if hold_open {
        stream::iter(chunks).chain(stream::pending()).boxed()
    } else {
        stream::iter(chunks).boxed()
    };
    TransportResponse {
        status: 200,
        request_id: Some("request_123".into()),
        retry_after_ms: None,
        body,
    }
}
