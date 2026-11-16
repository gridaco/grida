//! Provider protocol adapters over a host-owned streaming transport.

#![warn(missing_docs)]

mod anthropic;
mod gemini;
mod openai;
mod responses;
mod sse;
mod wire;

use agent_kit_core::inference::{ProviderBinding, RequestControl};
use agent_kit_core::messages::MediaRef;
use agent_kit_core::{BoxFuture, Envelope, Error, ErrorKind, ModelId, Result};
use futures_core::stream::BoxStream;
use std::sync::Arc;

pub use anthropic::Anthropic;
pub use gemini::{Gemini, GeminiProfile};
pub use openai::{ModelProfile, OpenAiCompatible, OutputLimitField, ReasoningField};
pub use responses::{Responses, ResponsesEndpoint, ResponsesProfile, ResponsesReasoningEffort};

/// Resolve a host-authorized, immutable image reference to its exact bytes.
/// This bounded local read runs only when counting or starting a request.
pub type InputImageResolver = dyn Fn(&MediaRef, usize) -> Result<Vec<u8>> + Send + Sync;

/// A trusted transport's optional projection of its own terminal evidence.
/// The adapter supplies the observed HTTP receipt and a validated finish frame.
pub type TerminalReceiptDecoder = dyn Fn(&Envelope, &[u8]) -> Option<Envelope> + Send + Sync;

/// The bound host selects the destination and injects credentials. The body
/// contains conversation data and deliberately has no Debug implementation.
pub struct TransportRequest {
    /// The approved binding the request must be sent under.
    pub binding: ProviderBinding,
    /// The operation the host resolves to a destination for this binding.
    pub operation: TransportOperation,
    /// The encoded JSON request body.
    pub body: Vec<u8>,
    /// The most response bytes the transport may deliver.
    pub max_response_bytes: usize,
}

/// A provider operation resolved against an approved binding by the host.
/// Each variant names its route relative to the binding's API base.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TransportOperation {
    /// `chat/completions`, streamed.
    ChatCompletions,
    /// `responses`, streamed.
    OpenAiResponses,
    /// `responses/input_tokens`, a JSON count response.
    OpenAiResponsesInputTokens,
    /// `chat/completions/input_tokens` on an opted-in llama.cpp endpoint, a
    /// JSON count response.
    LlamaCppChatInputTokens,
    /// `messages`, streamed.
    AnthropicMessages,
    /// `models/{model}:streamGenerateContent?alt=sse` for the registry model.
    GeminiStreamGenerateContent {
        /// The model the host validates and encodes as one path segment.
        model: ModelId,
    },
}

/// Selected response metadata and the bounded response body.
pub struct TransportResponse {
    /// The HTTP status code.
    pub status: u16,
    /// The provider's request identifier, when it reported one.
    pub request_id: Option<String>,
    /// An advisory retry delay from the response; it never schedules a retry.
    pub retry_after_ms: Option<u64>,
    /// Nonempty byte chunks of the response body.
    pub body: BoxStream<'static, std::result::Result<Vec<u8>, TransportFailure>>,
}

/// Whether a transport failure is known to precede dispatch.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransportFailure {
    /// The host can establish that no request was dispatched.
    Unavailable,
    /// Dispatch may have occurred, and the response is incomplete.
    Interrupted,
}

/// Sends a JSON POST to the approved operation of the supplied binding. The host applies
/// the supplied cancellation/deadline, bounds incoming data, and disables
/// automatic retries and redirects. Body items contain nonempty byte chunks.
/// A dropped body releases its stream.
pub trait StreamingTransport: Send + Sync {
    /// Dispatch one request under the supplied cancellation and deadline.
    fn send(
        &self,
        request: TransportRequest,
        control: RequestControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>>;

    /// An optional decoder for terminal evidence in a validated finish frame.
    /// Only the OpenAI-compatible adapter consults it.
    fn terminal_receipt_decoder(&self) -> Option<Arc<TerminalReceiptDecoder>> {
        None
    }
}

/// Mechanism bounds for one adapter. Every bound is nonzero, and neither the
/// event bound nor the tool-argument bound may exceed the response bound.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StreamLimits {
    /// The largest encoded request body.
    pub max_request_bytes: usize,
    /// The most response bytes read for one attempt.
    pub max_response_bytes: usize,
    /// The largest single SSE event, at most `max_response_bytes`.
    pub max_event_bytes: usize,
    /// The most tool calls accepted from one response.
    pub max_tool_calls: usize,
    /// The largest arguments of one tool call, at most `max_response_bytes`.
    pub max_tool_argument_bytes: usize,
}

impl StreamLimits {
    fn validate(self) -> Result<()> {
        if self.max_request_bytes == 0
            || self.max_response_bytes == 0
            || self.max_event_bytes == 0
            || self.max_event_bytes > self.max_response_bytes
            || self.max_tool_calls == 0
            || self.max_tool_argument_bytes == 0
            || self.max_tool_argument_bytes > self.max_response_bytes
        {
            return Err(Error::new(ErrorKind::InvalidInput, "invalid_stream_limits"));
        }
        Ok(())
    }
}
