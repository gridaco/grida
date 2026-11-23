//! Product defaults and their supported user-facing meaning.

use serde::{Deserialize, Serialize};
use std::num::NonZeroU64;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UserDefaults {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_context_window: Option<NonZeroU64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_auto_compact_token_limit: Option<NonZeroU64>,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct FieldDefinition {
    pub key: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub value_type: &'static str,
    pub units: &'static str,
    pub minimum: u64,
    pub maximum: u64,
    pub default_rule: &'static str,
    pub scope: &'static str,
    pub activation: &'static str,
}

pub const MODEL_CONTEXT_WINDOW: FieldDefinition = FieldDefinition {
    key: "model_context_window",
    label: "Model context window",
    description: "Context window size for usage and automatic compaction, capped by known model capacity.",
    value_type: "integer",
    units: "tokens",
    minimum: 1,
    maximum: 9_007_199_254_740_991,
    default_rule: "Use the selected model's known context window.",
    scope: "Global agent defaults.",
    activation: "Applies to later accepted inputs.",
};

pub const MODEL_AUTO_COMPACT_TOKEN_LIMIT: FieldDefinition = FieldDefinition {
    key: "model_auto_compact_token_limit",
    label: "Automatic compaction threshold",
    description: "Token usage at which to compact the conversation, capped at 90% of a known effective context window.",
    default_rule: "Use 90% of the effective model context window, when known.",
    ..MODEL_CONTEXT_WINDOW
};
