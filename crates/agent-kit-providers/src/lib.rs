//! Provider protocol adapters over a host-owned streaming transport.

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
pub use openai::{ModelProfile, OpenAiCompatible, OutputLimitField};
pub use responses::{ReasoningEffort, Responses, ResponsesEndpoint, ResponsesProfile};

/// Resolve a host-authorized, immutable image reference to its exact bytes.
/// This bounded local read runs only when counting or starting a request.
pub type InputImageResolver = dyn Fn(&MediaRef, usize) -> Result<Vec<u8>> + Send + Sync;

/// A trusted transport's optional projection of its own terminal evidence.
/// The adapter supplies the observed HTTP receipt and a validated finish frame.
pub type TerminalReceiptDecoder = dyn Fn(&Envelope, &[u8]) -> Option<Envelope> + Send + Sync;

/// The bound host selects the destination and injects credentials. The body
/// contains conversation data and deliberately has no Debug implementation.
pub struct TransportRequest {
    pub binding: ProviderBinding,
    pub operation: TransportOperation,
    pub body: Vec<u8>,
    pub max_response_bytes: usize,
}

/// A provider operation resolved against an approved binding by the host.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TransportOperation {
    ChatCompletions,
    OpenAiResponses,
    OpenAiResponsesInputTokens,
    AnthropicMessages,
    GeminiStreamGenerateContent { model: ModelId },
}

pub struct TransportResponse {
    pub status: u16,
    pub request_id: Option<String>,
    pub retry_after_ms: Option<u64>,
    pub body: BoxStream<'static, std::result::Result<Vec<u8>, TransportFailure>>,
}

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
    fn send(
        &self,
        request: TransportRequest,
        control: RequestControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>>;

    fn terminal_receipt_decoder(&self) -> Option<Arc<TerminalReceiptDecoder>> {
        None
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StreamLimits {
    pub max_request_bytes: usize,
    pub max_response_bytes: usize,
    pub max_event_bytes: usize,
    pub max_tool_calls: usize,
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
