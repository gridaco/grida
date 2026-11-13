use crate::history::{ConversationView, HistoryPosition, validate_exchanges};
pub use crate::inference::InputMeasurement as ContextMeasurement;
use crate::inference::MeasurementKind;
use crate::messages::Message;
use crate::{Error, ErrorKind, Result};

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

/// Assembled model input. `source_positions` runs parallel to `messages`:
/// each history-derived message carries its source position, and each
/// supplied fragment, which has no history source, carries `None`.
#[derive(Clone, Debug, PartialEq)]
pub struct ContextSnapshot {
    pub messages: Vec<Message>,
    pub source_positions: Vec<Option<HistoryPosition>>,
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
    let source_positions = input.history.source_positions[start..]
        .iter()
        .copied()
        .map(Some)
        .chain(std::iter::repeat_n(None, input.fragments.len()))
        .collect();
    Ok(ContextSnapshot {
        messages,
        source_positions,
        occupancy: ContextMeasurement { tokens, kind },
    })
}
