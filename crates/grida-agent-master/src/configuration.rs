//! Product defaults and their supported user-facing meaning.

use serde::{Deserialize, Serialize};
use std::num::NonZeroU64;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UserDefaults {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_context_window: Option<NonZeroU64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_auto_compact_token_limit: Option<NonZeroU64>,
    /// Preserve the exact serialized defaults and policy of previously accepted inputs.
    #[serde(default, rename = "context", skip_serializing_if = "Option::is_none")]
    legacy_context: Option<LegacyContext>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyContext {
    max_input_tokens: Option<NonZeroU64>,
}

impl UserDefaults {
    /// Only a stored input accepted under the previous policy can carry this value.
    pub fn legacy_input_limit(&self) -> Option<NonZeroU64> {
        self.legacy_context.as_ref()?.max_input_tokens
    }

    /// Once an older active configuration is authenticated, new work uses the current policy.
    pub fn discard_legacy_context(&mut self) -> bool {
        self.legacy_context.take().is_some()
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum SettingChange {
    SetModelContextWindow { value: NonZeroU64 },
    ResetModelContextWindow,
    SetModelAutoCompactTokenLimit { value: NonZeroU64 },
    ResetModelAutoCompactTokenLimit,
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
    scope: "Agent defaults in this configuration.",
    activation: "Applies to later accepted inputs.",
};

pub const MODEL_AUTO_COMPACT_TOKEN_LIMIT: FieldDefinition = FieldDefinition {
    key: "model_auto_compact_token_limit",
    label: "Automatic compaction threshold",
    description: "Token usage at which to compact the conversation, capped at 90% of a known effective context window.",
    default_rule: "Use 90% of the effective model context window, when known.",
    ..MODEL_CONTEXT_WINDOW
};
