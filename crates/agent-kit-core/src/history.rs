use crate::messages::{Content, Message};
use crate::{Error, ErrorKind, MessageId, Result, ToolCallId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct HistoryPosition(pub u64);

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum HistoryRecord {
    Message(Message),
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct History {
    records: Vec<HistoryRecord>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistorySelection {
    pub start: HistoryPosition,
    pub end: HistoryPosition,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Replacement {
    pub range: HistorySelection,
    pub messages: Vec<Message>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HistoryProjection {
    pub selection: HistorySelection,
    pub replacements: Vec<Replacement>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ConversationView {
    pub messages: Vec<Message>,
    pub source_positions: Vec<HistoryPosition>,
}

pub struct HistoryView<'a> {
    pub records: &'a [HistoryRecord],
    pub selection: HistorySelection,
}

impl History {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn validate(&self) -> Result<()> {
        validate_records(&self.records)
    }
    pub fn position(&self) -> HistoryPosition {
        HistoryPosition(self.records.len() as u64)
    }
    pub fn records(&self) -> &[HistoryRecord] {
        &self.records
    }
    pub fn selection(&self) -> HistorySelection {
        HistorySelection {
            start: HistoryPosition(0),
            end: self.position(),
        }
    }

    pub fn append(
        &mut self,
        expected: HistoryPosition,
        records: &[HistoryRecord],
    ) -> Result<HistoryPosition> {
        if expected != self.position() {
            return Err(Error::new(ErrorKind::Conflict, "history_position_changed"));
        }
        let mut combined = self.records.clone();
        combined.extend_from_slice(records);
        validate_records(&combined)?;
        self.records = combined;
        Ok(self.position())
    }

    pub fn view(&self, selection: HistorySelection) -> Result<HistoryView<'_>> {
        let range = self.range(selection)?;
        Ok(HistoryView {
            records: &self.records[range],
            selection,
        })
    }

    pub fn fork(&self, at: HistoryPosition) -> Result<History> {
        let view = self.view(HistorySelection {
            start: HistoryPosition(0),
            end: at,
        })?;
        Ok(Self {
            records: view.records.to_vec(),
        })
    }

    pub fn project(&self, projection: &HistoryProjection) -> Result<ConversationView> {
        let selected = self.range(projection.selection)?;
        let mut cursor = selected.start;
        let mut messages = Vec::new();
        let mut source_positions = Vec::new();
        for replacement in &projection.replacements {
            let range = self.range(replacement.range)?;
            if range.start < cursor || range.end > selected.end || range.is_empty() {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    "invalid_history_replacement",
                ));
            }
            for (offset, record) in self.records[cursor..range.start].iter().enumerate() {
                let HistoryRecord::Message(message) = record;
                messages.push(message.clone());
                source_positions.push(HistoryPosition((cursor + offset) as u64));
            }
            messages.extend(replacement.messages.clone());
            source_positions.extend(std::iter::repeat_n(
                HistoryPosition(range.start as u64),
                replacement.messages.len(),
            ));
            cursor = range.end;
        }
        for (offset, record) in self.records[cursor..selected.end].iter().enumerate() {
            let HistoryRecord::Message(message) = record;
            messages.push(message.clone());
            source_positions.push(HistoryPosition((cursor + offset) as u64));
        }
        Ok(ConversationView {
            messages,
            source_positions,
        })
    }

    fn range(&self, selection: HistorySelection) -> Result<std::ops::Range<usize>> {
        if selection.start > selection.end || selection.end > self.position() {
            return Err(Error::new(ErrorKind::InvalidInput, "invalid_history_range"));
        }
        Ok(selection.start.0 as usize..selection.end.0 as usize)
    }
}

fn validate_records(records: &[HistoryRecord]) -> Result<()> {
    let mut messages = BTreeSet::<&MessageId>::new();
    let mut calls = BTreeSet::<&ToolCallId>::new();
    let mut results = BTreeSet::<&ToolCallId>::new();
    for record in records {
        let HistoryRecord::Message(message) = record;
        if !messages.insert(&message.id) {
            return Err(Error::new(ErrorKind::Conflict, "duplicate_message"));
        }
        for content in &message.content {
            match content {
                Content::ToolCall(call) if !calls.insert(&call.id) => {
                    return Err(Error::new(ErrorKind::Conflict, "duplicate_tool_call"));
                }
                Content::ToolResult(result)
                    if !calls.contains(&result.call) || !results.insert(&result.call) =>
                {
                    return Err(Error::new(ErrorKind::InvalidInput, "unmatched_tool_result"));
                }
                _ => {}
            }
        }
    }
    Ok(())
}

/// Validate exchanges in a model input. Pending calls may be explicitly allowed.
pub fn validate_exchanges(messages: &[Message], allow_pending: bool) -> Result<()> {
    let records: Vec<_> = messages
        .iter()
        .cloned()
        .map(HistoryRecord::Message)
        .collect();
    validate_records(&records)?;
    if !allow_pending {
        let mut pending = BTreeSet::new();
        for message in messages {
            for content in &message.content {
                match content {
                    Content::ToolCall(call) => {
                        pending.insert(call.id.clone());
                    }
                    Content::ToolResult(result) => {
                        pending.remove(&result.call);
                    }
                    _ => {}
                }
            }
        }
        if !pending.is_empty() {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "incomplete_tool_exchange",
            ));
        }
    }
    Ok(())
}

impl<'de> Deserialize<'de> for History {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Data {
            records: Vec<HistoryRecord>,
        }
        let data = Data::deserialize(deserializer)?;
        let history = Self {
            records: data.records,
        };
        history.validate().map_err(serde::de::Error::custom)?;
        Ok(history)
    }
}
