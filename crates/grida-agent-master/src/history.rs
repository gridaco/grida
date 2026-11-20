//! Causal ordering for model input assembled from committed turn history.

use agent_kit_core::MessageId;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{FailureKind, InferenceFailure, InferenceStatus};
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, ResultContent, Role,
};
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnState};
use std::collections::{BTreeMap, BTreeSet};

/// Render prior assistant and tool messages for a different model. Preserve
/// visible facts while omitting private reasoning and provider continuation state.
pub fn portable_message(mut message: Message) -> Option<Message> {
    if !matches!(message.role, Role::Assistant | Role::Tool) {
        return Some(message);
    }
    message.content = message
        .content
        .into_iter()
        .filter_map(|part| match part {
            Content::Text(text) => Some(Content::Text(text)),
            Content::ToolCall(call) => Some(Content::Text(format!(
                "Earlier tool call (history only): {}",
                serde_json::json!({
                    "call": call.id,
                    "tool": call.tool,
                    "arguments": call.arguments,
                })
            ))),
            Content::ToolResult(result) => Some(Content::Text(format!(
                "Earlier tool result (history only): {}",
                serde_json::json!({
                    "call": result.call,
                    "status": result.status,
                    "content": result.content.into_iter().map(|part| match part {
                        ResultContent::Text(text) => serde_json::json!({"text": text}),
                        ResultContent::Media(media) => serde_json::json!({
                            "mediaType": media.media_type,
                            "omitted": "Media bytes are not portable between model routes.",
                        }),
                    }).collect::<Vec<_>>(),
                    "structured": result.structured,
                    "truncated": result.truncated,
                })
            ))),
            Content::Media(media) => Some(Content::Media(media)),
            Content::Reasoning(_) | Content::ProviderState(_) => None,
        })
        .collect();
    if message.content.is_empty() {
        return None;
    }
    message.role = Role::Assistant;
    message.provenance = Provenance {
        source: "retained_model_context".into(),
        kind: ProvenanceKind::Transformed,
        fingerprint: None,
    };
    Some(message)
}

/// Told to the model after the person interrupts work, in place of the
/// response that was cut off. The unfinished response stays out of model
/// context because the model cannot tell where it was cut off: kept, it reads
/// as a finished statement of its own and anchors the next response on work
/// the person deliberately stopped.
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
            && outcome.failure.as_ref().is_some_and(person_interruption)
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
        // A required answer already reaches the model through its tool result.
        // Keep its attributed reply in the transcript exactly once.
        if item.role == Role::User && item.provenance.source == crate::questions::TOOL_ANSWER_SOURCE
        {
            continue;
        }
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

/// A pause or stop from the person. Other cancellations, such as an
/// operation deadline, leave the published response in model context.
fn person_interruption(failure: &InferenceFailure) -> bool {
    failure.kind == FailureKind::Cancelled
        && matches!(failure.code.as_str(), "turn_paused" | "turn_cancelled")
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
    // An awaited answer is supplied to the model through the tool result.
    // Its transcript bubble must precede every response based on that result.
    let tool_answers: BTreeMap<_, _> = users
        .iter()
        .enumerate()
        .filter_map(|(index, record)| {
            let user = message(record);
            if user.provenance.source != crate::questions::TOOL_ANSWER_SOURCE {
                return None;
            }
            Some((user.id.as_str(), index + 1))
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
                None if input.role == Role::Tool => {
                    Some(input.content.iter().fold(basis, |position, part| {
                        match part {
                            Content::ToolResult(result) => crate::questions::answered_wait(result)
                                .and_then(|wait| tool_answers.get(wait))
                                .map_or(position, |answer| position.max(*answer)),
                            _ => position,
                        }
                    }))
                }
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
