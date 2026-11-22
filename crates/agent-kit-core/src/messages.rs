use crate::{
    ArtifactId, BindingId, Envelope, Fingerprint, MessageId, ProviderId, ToolCallId, ToolId,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Message {
    pub id: MessageId,
    pub role: Role,
    pub phase: Option<MessagePhase>,
    pub content: Vec<Content>,
    pub provenance: Provenance,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessagePhase {
    Progress,
    Answer,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum Content {
    Text(String),
    Reasoning(String),
    Media(MediaRef),
    ToolCall(ToolCall),
    ToolResult(ToolResult),
    ProviderState(ProviderState),
    /// An observation of work performed inside the model provider's inference.
    ProviderEvidence(ProviderEvidence),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ProviderEvidence {
    WebSearch {
        status: SearchStatus,
        action: Option<SearchAction>,
    },
    UrlCitation(UrlCitation),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchStatus {
    InProgress,
    Completed,
    Failed,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SearchAction {
    Search {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        query: Option<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        queries: Vec<String>,
    },
    OpenPage {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
    FindInPage {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        url: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pattern: Option<String>,
    },
}

/// End-exclusive character offsets in the assistant message's visible text.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UrlCitation {
    pub url: String,
    pub title: String,
    pub start_index: usize,
    pub end_index: usize,
}

impl ProviderEvidence {
    /// A hosted search has one current state per output item. Citations are
    /// additive and may be reported in both progress and final output.
    pub fn record(&self, content: &mut Vec<Content>) -> bool {
        for part in content.iter_mut() {
            let Content::ProviderEvidence(previous) = part else {
                continue;
            };
            if previous == self {
                return false;
            }
            if matches!(
                (&*previous, self),
                (Self::WebSearch { .. }, Self::WebSearch { .. })
            ) {
                *previous = self.clone();
                return true;
            }
        }
        content.push(Content::ProviderEvidence(self.clone()));
        true
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Provenance {
    pub source: String,
    pub kind: ProvenanceKind,
    pub fingerprint: Option<Fingerprint>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProvenanceKind {
    Supplied,
    Observed,
    Generated,
    Transformed,
    Synthetic,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MediaRef {
    pub id: ArtifactId,
    pub media_type: String,
    pub locator: String,
    pub access_scope: BindingId,
    pub retention: Retention,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum Retention {
    Ephemeral,
    Retained,
    Until(u64),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: ToolCallId,
    pub tool: ToolId,
    pub arguments: ToolArguments,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ToolArguments {
    Json(serde_json::Value),
    Text(String),
    /// The provider's text for a call to a JSON tool that is not a JSON
    /// object. No tool accepts it: the call receives a failed result the
    /// model can correct from, and the text is returned to the provider as
    /// the model wrote it where its wire format allows.
    Malformed(String),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolResult {
    pub call: ToolCallId,
    pub status: OutcomeStatus,
    pub content: Vec<ResultContent>,
    pub structured: Option<serde_json::Value>,
    pub truncated: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutcomeStatus {
    Succeeded,
    Failed,
    Cancelled,
    Uncertain,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ResultContent {
    Text(String),
    Media(MediaRef),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderState {
    pub producer: ProviderId,
    pub binding: BindingId,
    pub validity: Fingerprint,
    pub payload: Envelope,
}
