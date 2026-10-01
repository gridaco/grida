// GRIDA-SEC-004 / GRIDA-SEC-006 — explicit provider authority and safe scoped results.
// GRIDA-GG: provider — explicit scoped invocation authority; no account token or credential persistence.
//! Media contracts and provider execution with explicit host-owned HTTP authority.
mod catalogue;
mod discovery;
mod input;
mod media;
mod sse;
mod tripo;
pub use catalogue::{Catalog, Filter, Parsed, Selector};
pub use discovery::{VoiceFilter, normalize_key};
pub use media::{Asset, ExecutionAuthority, MediaClient, MediaResult, TaskReceipt};
use serde::{Deserialize, Serialize};
pub use sse::{SseEventFramer, first_sse_event_end};
use std::{collections::BTreeMap, fmt, future::Future, pin::Pin};

pub type HttpFuture<'a> =
    Pin<Box<dyn Future<Output = std::result::Result<Response, TransportError>> + Send + 'a>>;

/// The host authorizes every URL/address and bounds the response before retaining it.
/// Implementations MUST disable automatic retries and redirects, including for paid POSTs.
pub trait Transport: Send + Sync {
    fn request(&self, request: Request) -> HttpFuture<'_>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lane {
    Provider,
    Download,
    Upload,
}

/// Response completion is explicit because the video gateway keeps SSE sockets open.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ResponseCompletion {
    #[default]
    Body,
    FirstSseEvent,
}

/// Deliberately has no Debug implementation: headers and URLs may carry secrets.
pub struct Request {
    pub lane: Lane,
    pub method: String,
    pub url: String,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
    pub max_bytes: usize,
    pub completion: ResponseCompletion,
}
pub struct Response {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}
#[derive(Debug)]
pub struct TransportError;

/// Safe domain error. Never retains an upstream body, URL, prompt, credential or cause.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Failure {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_task: Option<TaskReceipt>,
}
impl Failure {
    pub(crate) fn new(code: &str) -> Self {
        Self {
            code: code.into(),
            message: code.into(),
            task_id: None,
            completed_task: None,
        }
    }
    pub(crate) fn task(mut self, id: &str) -> Self {
        self.task_id = Some(id.into());
        self
    }
    pub(crate) fn completed(mut self, receipt: Option<TaskReceipt>) -> Self {
        self.completed_task = receipt;
        self
    }
}
impl fmt::Display for Failure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.code)
    }
}
impl std::error::Error for Failure {}
pub type Result<T> = std::result::Result<T, Failure>;
pub(crate) fn invalid() -> Failure {
    Failure::new("invalid_response")
}
