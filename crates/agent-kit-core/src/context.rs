use crate::history::{ConversationView, HistoryPosition, validate_exchanges};
use crate::inference::MeasurementKind;
use crate::messages::Message;
use crate::{Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContextMeasurement {
    pub tokens: u64,
    pub kind: MeasurementKind,
}

pub trait ContextMeasure {
    fn measure(&self, content: &[Message]) -> Result<ContextMeasurement>;
}

pub struct ContextInput<'a> {
    pub history: &'a ConversationView,
    pub fragments: &'a [Message],
    pub overhead: ContextMeasurement,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ContextLimits {
    pub max_input_tokens: u64,
    pub require_bound: bool,
    pub allow_pending_tool_calls: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContextTransform {
    Preserve,
    KeepLast(usize),
}

#[derive(Clone, Debug, PartialEq)]
pub struct ContextSnapshot {
    pub messages: Vec<Message>,
    pub source_positions: Vec<HistoryPosition>,
    pub occupancy: ContextMeasurement,
}

pub fn assemble(
    input: ContextInput<'_>,
    limits: ContextLimits,
    transform: ContextTransform,
    measure: &dyn ContextMeasure,
) -> Result<ContextSnapshot> {
    if limits.max_input_tokens == 0
        || input.history.messages.len() != input.history.source_positions.len()
    {
        return Err(Error::new(ErrorKind::InvalidInput, "invalid_context_input"));
    }
    let start = match transform {
        ContextTransform::Preserve => 0,
        ContextTransform::KeepLast(count) => input.history.messages.len().saturating_sub(count),
    };
    let mut messages = input.history.messages[start..].to_vec();
    messages.extend_from_slice(input.fragments);
    validate_exchanges(&messages, limits.allow_pending_tool_calls)?;
    let measured = measure.measure(&messages)?;
    let tokens = measured
        .tokens
        .checked_add(input.overhead.tokens)
        .ok_or_else(|| Error::new(ErrorKind::LimitExceeded, "context_count_overflow"))?;
    // Independently measured serialization fragments do not establish a combined bound.
    let kind = if input.overhead.tokens == 0 && input.overhead.kind == MeasurementKind::Exact {
        measured.kind
    } else {
        MeasurementKind::Estimate
    };
    if limits.require_bound && kind == MeasurementKind::Estimate {
        return Err(Error::new(
            ErrorKind::Unsupported,
            "context_bound_unavailable",
        ));
    }
    if tokens > limits.max_input_tokens {
        return Err(Error::new(ErrorKind::LimitExceeded, "context_limit"));
    }
    Ok(ContextSnapshot {
        messages,
        source_positions: input.history.source_positions[start..].to_vec(),
        occupancy: ContextMeasurement { tokens, kind },
    })
}
