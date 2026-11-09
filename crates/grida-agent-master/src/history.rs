//! Causal ordering for model input assembled from committed turn history.

use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, Message, Role};
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnState};
use std::collections::{BTreeMap, BTreeSet};

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
