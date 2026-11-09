//! Provider protocol adapters over a host-owned streaming transport.

mod openai;
mod sse;

use agent_kit_core::BoxFuture;
use agent_kit_core::inference::{InferenceControl, ProviderBinding};
use futures_core::stream::BoxStream;

pub use openai::{ModelProfile, OpenAiCompatible, OutputLimitField, StreamLimits};

/// The bound host selects the destination and injects credentials. The body
/// contains conversation data and deliberately has no Debug implementation.
pub struct TransportRequest {
    pub binding: ProviderBinding,
    pub path: &'static str,
    pub body: Vec<u8>,
    pub max_response_bytes: usize,
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

/// Sends a JSON POST to the approved binding-relative path. The host applies
/// the supplied cancellation/deadline, bounds incoming data, and disables
/// automatic retries and redirects. A dropped body releases its stream.
pub trait StreamingTransport: Send + Sync {
    fn send(
        &self,
        request: TransportRequest,
        control: InferenceControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>>;
}
