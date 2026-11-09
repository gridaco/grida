//! Product defaults and their supported user-facing meaning.

use serde::{Deserialize, Serialize};
use std::num::NonZeroU64;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UserDefaults {
    pub context: ContextDefaults,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextDefaults {
    pub max_input_tokens: Option<NonZeroU64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum SettingChange {
    SetContextMaxInputTokens { value: NonZeroU64 },
    ResetContextMaxInputTokens,
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

pub const CONTEXT_MAX_INPUT_TOKENS: FieldDefinition = FieldDefinition {
    key: "context.max_input_tokens",
    label: "Maximum context input",
    description: "Upper limit on complete model input, including instructions, history, media, tool declarations, and provider framing. Available provider capacity and host limits can lower the effective limit.",
    value_type: "integer",
    units: "tokens",
    minimum: 1,
    maximum: i64::MAX as u64,
    default_rule: "Automatic budgeting within the selected model and host limits.",
    scope: "User defaults on this host. A task-only request uses its own override.",
    activation: "Applies to later accepted tasks. Existing work retains its captured settings.",
};
