//! Causal ordering for model input assembled from committed turn history.

use agent_kit_core::MessageId;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{FailureKind, InferenceStatus};
use agent_kit_core::messages::{Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role};
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnState};
use std::collections::{BTreeMap, BTreeSet};

/// Told to the model after the person interrupts work, in place of the
/// response that was cut off. Mirrors the established agent convention: the
/// unfinished response is not part of model context.
pub const INTERRUPTED_GUIDANCE: &str = "The user interrupted the previous response on purpose. If any tools or commands were aborted, they may have partially executed.";

/// Told to the model in place of a response cut off by a pause that the
/// person then resumed. The turn continues, so the note asks the model to carry
/// on rather than treat the interruption as the person's latest request.
pub const RESUMED_GUIDANCE: &str = "The user paused the previous response and then resumed it. Continue the task from where it stopped, taking any later messages into account. If any tools or commands were aborted, they may have partially executed.";

/// The history a model reads for one turn. It differs from the transcript in
/// one way: a response the person interrupted (by pausing or stopping) is
/// replaced by a note. Within a turn that continued after a pause, the note is
/// [`RESUMED_GUIDANCE`]; a stopped turn ends with [`INTERRUPTED_GUIDANCE`].
/// The transcript keeps showing the interrupted text.
pub fn model_context(state: &TurnState) -> Vec<HistoryRecord> {
    let records = project(state);
    let mut interrupted = BTreeSet::new();
    for operation in state.operations().values() {
        if let Some(OperationOutcome::Inference(outcome)) = operation.outcome()
            && outcome.status == InferenceStatus::Interrupted
            && outcome
                .failure
                .as_ref()
                .is_some_and(|failure| failure.kind == FailureKind::Cancelled)
        {
            interrupted.extend(
                outcome
                    .messages
                    .iter()
                    .filter(|item| item.role == Role::Assistant)
                    .map(|item| item.id.clone()),
            );
        }
    }
    let mut output = Vec::with_capacity(records.len() + 1);
    let mut previous_dropped = false;
    for record in records {
        let item = message(&record);
        if item.role == Role::Assistant && interrupted.contains(&item.id) {
            if !previous_dropped
                && let Some(note) = interruption_note(state, output.len(), RESUMED_GUIDANCE)
            {
                output.push(note);
            }
            previous_dropped = true;
            continue;
        }
        previous_dropped = false;
        output.push(record);
    }
    let stopped = state
        .outcome()
        .is_some_and(|outcome| outcome.status == OutcomeStatus::Cancelled);
    if stopped {
        let at = match output.last() {
            Some(record) if message(record).id.as_str().starts_with(NOTE_PREFIX) => {
                output.len() - 1
            }
            _ => output.len(),
        };
        if let Some(note) = interruption_note(state, at, INTERRUPTED_GUIDANCE) {
            output.truncate(at);
            output.push(note);
        }
    }
    output
}

const NOTE_PREFIX: &str = "interrupted/";

fn interruption_note(state: &TurnState, at: usize, text: &str) -> Option<HistoryRecord> {
    let id = MessageId::new(format!(
        "{NOTE_PREFIX}{}/{at}",
        state.binding().turn.as_str()
    ))
    .ok()?;
    Some(HistoryRecord::Message(Message {
        id,
        role: Role::User,
        phase: None,
        content: vec![Content::Text(text.into())],
        provenance: Provenance {
            source: "product-instructions".into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: None,
        },
    }))
}

/// Keep the contents of published history and present responses before any
/// later user inputs that were absent from their recorded requests.
pub fn project(state: &TurnState) -> Vec<HistoryRecord> {
    let records = state.history().records();
    let users: Vec<_> = records
        .iter()
        .filter(|record| message(record).role == Role::User)
        .collect();
    if users.is_empty() {
        return records.to_vec();
    }
    let user_positions: BTreeMap<_, _> = users
        .iter()
        .enumerate()
        .map(|(index, record)| {
            let user = message(record);
            (&user.id, (index + 1, user))
        })
        .collect();
    let mut responses = BTreeMap::new();
    for operation in state.operations().values() {
        let (OperationInput::Inference(request), Some(OperationOutcome::Inference(outcome))) =
            (&operation.record.input, operation.outcome())
        else {
            continue;
        };
        let basis = request
            .request()
            .messages
            .iter()
            .try_fold(0, |basis, input| match user_positions.get(&input.id) {
                Some(&(position, user)) if user == input => Some(basis.max(position)),
                Some(_) => None,
                None => Some(basis),
            });
        for response in outcome
            .messages
            .iter()
            .filter(|item| item.role == Role::Assistant)
        {
            responses
                .entry(&response.id)
                .and_modify(|known| *known = None)
                .or_insert(basis.map(|basis| (response, basis)));
        }
    }

    let mut output = Vec::with_capacity(records.len());
    let mut received = 0;
    let mut emitted = 0;
    let mut start = 0;
    let mut basis = Some(0);
    let mut calls = BTreeSet::new();
    for (index, record) in records.iter().enumerate() {
        let item = message(record);
        if item.role == Role::User {
            // An exchange published by the master is contiguous. Preserve an
            // imported or otherwise unfamiliar history instead of splitting it.
            if !calls.is_empty() {
                return records.to_vec();
            }
            received += 1;
            start = index + 1;
            continue;
        }
        let item_basis = match item.role {
            Role::Assistant => responses
                .get(&item.id)
                .copied()
                .flatten()
                .filter(|(response, _)| published_response(item, response))
                .map(|(_, basis)| basis),
            Role::Tool
                if !calls.is_empty()
                    && !item.content.is_empty()
                    && item
                        .content
                        .iter()
                        .all(|part| matches!(part, Content::ToolResult(_))) =>
            {
                // The published result travels with its earlier tool call.
                Some(0)
            }
            _ => None,
        };
        basis = basis.zip(item_basis).map(|(left, right)| left.max(right));
        for part in &item.content {
            match part {
                Content::ToolCall(call) if item.role == Role::Assistant => {
                    calls.insert(&call.id);
                }
                Content::ToolResult(result) if item.role == Role::Tool => {
                    if !calls.remove(&result.call) {
                        return records.to_vec();
                    }
                }
                Content::ToolCall(_) | Content::ToolResult(_) => return records.to_vec(),
                _ => {}
            }
        }
        if calls.is_empty() {
            // Unknown responses are barriers at their durable position.
            // Both the user lane and the response lane retain their own order.
            let end = basis.unwrap_or(received).clamp(emitted, received);
            output.extend(users[emitted..end].iter().map(|record| (*record).clone()));
            output.extend_from_slice(&records[start..=index]);
            emitted = end;
            start = index + 1;
            basis = Some(0);
        }
    }
    if !calls.is_empty() {
        return records.to_vec();
    }
    output.extend(users[emitted..].iter().map(|record| (*record).clone()));
    output
}

fn message(record: &HistoryRecord) -> &Message {
    let HistoryRecord::Message(message) = record;
    message
}

fn published_response(published: &Message, recorded: &Message) -> bool {
    if published.phase != recorded.phase || published.provenance != recorded.provenance {
        return false;
    }
    let mut parts = published.content.iter().peekable();
    for part in &recorded.content {
        if parts.peek() == Some(&part) {
            parts.next();
        } else if !matches!(part, Content::ToolCall(_) | Content::ToolResult(_)) {
            return false;
        }
    }
    // Publication may omit incomplete tool calls while retaining their
    // surrounding response. Every other part must match the recorded outcome.
    parts.next().is_none()
}
