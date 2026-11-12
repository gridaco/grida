//! A connection-local presentation of the host's authorized transcript.

use super::transport::Delivery;
use super::unavailable;
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::{
    ContentChunk, SessionId, SessionNotification, SessionUpdate, ToolCall as AcpToolCall,
    ToolCallStatus, ToolKind,
};
use agent_client_protocol::{Client, Result};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::InferenceUpdate;
use agent_kit_core::messages::{
    Content, Message, MessagePhase, OutcomeStatus, ResultContent, Role, ToolArguments, ToolCall,
    ToolResult,
};
use agent_kit_core::turn::OperationOutcome;
use agent_kit_core::{ChangeId, MessageId};
use agent_kit_runtime::TurnUpdate;
use agent_kit_store_sqlite::history::{ReplayCursor, ReplayRecord, ReplayTurn};
use grida_agent_master::activity::{self, ActivityKind};
use serde::Deserialize;
use serde_json::{Value, json};
use std::borrow::Cow;
use std::collections::{BTreeMap, BTreeSet};

const MAX_CHUNK_BYTES: usize = 8 * 1024;
pub(super) const TRANSCRIPT_WINDOW: &str = "co.grida/session/transcript-window";

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(super) enum ReplayRequest {
    Attach,
    Read {
        request_id: ChangeId,
        before: Option<ReplayCursor>,
    },
}

pub(super) struct Projection {
    session: SessionId,
    replay_id: Option<ChangeId>,
    // Compare live deltas with the recorded message before filling in any
    // unstreamed suffix. A disagreement cannot be represented as an append.
    streamed_text: BTreeMap<MessageId, String>,
}

impl Projection {
    pub(super) fn new(session: SessionId) -> Self {
        Self {
            session,
            replay_id: None,
            streamed_text: BTreeMap::new(),
        }
    }

    pub(super) fn correlate_replay(&mut self, request_id: ChangeId) {
        self.replay_id = Some(request_id);
    }

    pub(super) async fn replay(
        &mut self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        messages: impl IntoIterator<Item = Message>,
    ) -> Result<()> {
        for message in messages {
            self.message(connection, delivery, message).await?;
        }
        Ok(())
    }

    /// Replay a bounded window with turn attribution, final-answer
    /// classification and the tool activity recorded in each turn.
    pub(super) async fn replay_window(
        &mut self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        records: Vec<ReplayRecord>,
        turns: &[ReplayTurn],
    ) -> Result<()> {
        let request_id = self.replay_id.clone();
        let facts: BTreeMap<_, _> = turns.iter().map(|turn| (&turn.id, turn)).collect();
        let messages: Vec<_> = records
            .into_iter()
            .map(
                |ReplayRecord {
                     turn,
                     record: HistoryRecord::Message(message),
                 }| (turn, message),
            )
            .collect();
        let mut results = BTreeMap::new();
        for (_, message) in &messages {
            for part in &message.content {
                if let Content::ToolResult(result) = part {
                    results.insert(result.call.clone(), result.clone());
                }
            }
        }
        let mut answers = BTreeSet::new();
        for turn in turns.iter().filter(|turn| turn.tail) {
            answers.extend(activity::final_answers(
                messages
                    .iter()
                    .filter(|(owner, _)| owner.as_ref() == Some(&turn.id))
                    .map(|(_, message)| message),
                turn.status,
            ));
        }
        for (turn, message) in messages {
            if !matches!(message.role, Role::User | Role::Assistant) {
                continue;
            }
            let mut meta = json!({"requestId": request_id});
            if let Some(turn) = &turn {
                meta["turnId"] = json!(turn);
            }
            if message.role == Role::Assistant {
                meta["phase"] = json!(match (answers.contains(&message.id), message.phase) {
                    (true, _) | (false, Some(MessagePhase::Answer)) => "answer",
                    _ => "progress",
                });
            }
            let text: String = visible_parts(&message).collect();
            self.chunk_with(
                connection,
                delivery,
                message.role,
                &message.id,
                &text,
                &meta,
            )
            .await?;
            let settled = turn
                .as_ref()
                .and_then(|turn| facts.get(turn))
                .and_then(|turn| turn.status);
            for part in &message.content {
                let Content::ToolCall(call) = part else {
                    continue;
                };
                let result = results.get(&call.id);
                let outcome = match result {
                    Some(result) => Outcome::Finished(result.status),
                    None => match settled {
                        None => Outcome::Running,
                        Some(OutcomeStatus::Cancelled) => {
                            Outcome::Finished(OutcomeStatus::Cancelled)
                        }
                        Some(_) => Outcome::Finished(OutcomeStatus::Uncertain),
                    },
                };
                let mut attribution = meta.clone();
                attribution.as_object_mut().expect("object").remove("phase");
                let update = activity_update(&message.id, call, outcome, result, attribution);
                let notification = SessionNotification::new(self.session.clone(), update.0).meta(
                    serde_json::Map::from_iter([(TRANSCRIPT_WINDOW.into(), update.1)]),
                );
                delivery.send(connection, notification).await?;
            }
        }
        Ok(())
    }

    pub(super) async fn update(
        &mut self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        update: TurnUpdate,
    ) -> Result<()> {
        match update {
            TurnUpdate::Inference {
                update: InferenceUpdate::TextDelta { message, text },
                ..
            } => {
                self.chunk(connection, delivery, Role::Assistant, &message, &text)
                    .await?;
                self.streamed_text
                    .entry(message)
                    .or_default()
                    .push_str(&text);
            }
            TurnUpdate::Operation {
                outcome: OperationOutcome::Inference(outcome),
                ..
            } => {
                for message in outcome.messages {
                    self.message(connection, delivery, message).await?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    async fn message(
        &mut self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        message: Message,
    ) -> Result<()> {
        if !matches!(message.role, Role::User | Role::Assistant) {
            return Ok(());
        }
        let text: String = visible_parts(&message).collect();
        let suffix = if let Some(prefix) = self.streamed_text.remove(&message.id) {
            text.strip_prefix(&prefix)
                .ok_or_else(|| unavailable("session_message_projection_conflict"))?
        } else {
            &text
        };
        self.chunk(connection, delivery, message.role, &message.id, suffix)
            .await
    }

    async fn chunk_with(
        &self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        role: Role,
        id: &MessageId,
        mut text: &str,
        meta: &Value,
    ) -> Result<()> {
        while !text.is_empty() {
            let end = text.floor_char_boundary(MAX_CHUNK_BYTES.min(text.len()));
            let (part, remaining) = text.split_at(end);
            let chunk = ContentChunk::new(part.to_owned().into()).message_id(id.as_str());
            let update = match role {
                Role::User => SessionUpdate::UserMessageChunk(chunk),
                Role::Assistant => SessionUpdate::AgentMessageChunk(chunk),
                _ => return Ok(()),
            };
            let notification = SessionNotification::new(self.session.clone(), update).meta(
                serde_json::Map::from_iter([(TRANSCRIPT_WINDOW.into(), meta.clone())]),
            );
            delivery.send(connection, notification).await?;
            text = remaining;
        }
        Ok(())
    }

    async fn chunk(
        &self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        role: Role,
        id: &MessageId,
        mut text: &str,
    ) -> Result<()> {
        while !text.is_empty() {
            let end = text.floor_char_boundary(MAX_CHUNK_BYTES.min(text.len()));
            let (part, remaining) = text.split_at(end);
            let chunk = ContentChunk::new(part.to_owned().into()).message_id(id.as_str());
            let update = match role {
                Role::User => SessionUpdate::UserMessageChunk(chunk),
                Role::Assistant => SessionUpdate::AgentMessageChunk(chunk),
                _ => return Ok(()),
            };
            let mut notification = SessionNotification::new(self.session.clone(), update);
            if let Some(request_id) = &self.replay_id {
                notification = notification.meta(serde_json::Map::from_iter([(
                    TRANSCRIPT_WINDOW.into(),
                    serde_json::json!({"requestId": request_id}),
                )]));
            }
            delivery.send(connection, notification).await?;
            text = remaining;
        }
        Ok(())
    }
}

/// Recorded tool calls and results are displayed as activity, so they occupy
/// a small fixed share of a window in addition to readable text.
const ACTIVITY_RECORD_BYTES: usize = 64;

pub(super) fn visible_record_bytes(record: &HistoryRecord) -> usize {
    let HistoryRecord::Message(message) = record;
    let activity = message
        .content
        .iter()
        .filter(|part| match part {
            Content::ToolCall(_) => message.role == Role::Assistant,
            Content::ToolResult(_) => message.role == Role::Tool,
            _ => false,
        })
        .count();
    visible_parts(message).map(|part| part.len()).sum::<usize>() + activity * ACTIVITY_RECORD_BYTES
}

/// Recorded outcome and wall-clock interval for a replayed turn.
/// `goal_start` marks a turn whose input started a goal.
pub(super) fn turn_facts(turn: &ReplayTurn, goal_start: bool) -> Value {
    let mut facts = json!({
        "turnId": turn.id,
        "status": turn.status,
        "startedAtMs": turn.started_ms,
        "settledAtMs": turn.settled_ms,
    });
    if goal_start {
        facts["goalStart"] = json!(true);
    }
    if let Some(tokens) = turn.context_tokens {
        facts["contextTokens"] = json!(tokens);
    }
    // A compaction turn adds no transcript messages; its summary shows as a
    // note where earlier context was summarized.
    if let Some(summary) = turn
        .silent_account
        .as_ref()
        .and_then(|account| {
            grida_agent_master::compaction::CompactionAccount::from_envelope(account).ok()
        })
        .and_then(|account| account.summary().map(str::to_owned))
    {
        facts["compaction"] = json!({
            "summary": summary,
            "automatic": turn
                .id
                .as_str()
                .starts_with(crate::host::compaction::AUTOMATIC_TURN_PREFIX),
        });
    }
    facts
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Outcome {
    Running,
    Finished(OutcomeStatus),
}

/// One tool call as a standard ACP tool-call update plus Grida attribution.
/// The kind and wording come from the master's classification of the tool.
pub(super) fn activity_update(
    message: &MessageId,
    call: &ToolCall,
    outcome: Outcome,
    result: Option<&ToolResult>,
    mut attribution: Value,
) -> (SessionUpdate, Value) {
    let classified = activity::classify(&call.tool);
    let (status, label) = match outcome {
        Outcome::Running => (ToolCallStatus::InProgress, "running"),
        Outcome::Finished(OutcomeStatus::Succeeded) => (ToolCallStatus::Completed, "succeeded"),
        Outcome::Finished(OutcomeStatus::Failed) => (ToolCallStatus::Failed, "failed"),
        Outcome::Finished(OutcomeStatus::Cancelled) => (ToolCallStatus::Failed, "cancelled"),
        Outcome::Finished(OutcomeStatus::Uncertain) => (ToolCallStatus::Failed, "uncertain"),
    };
    let kind = match classified.kind {
        ActivityKind::Read => ToolKind::Read,
        ActivityKind::Search => ToolKind::Search,
        ActivityKind::Edit => ToolKind::Edit,
        ActivityKind::Execute => ToolKind::Execute,
        ActivityKind::Generate
        | ActivityKind::Integration
        | ActivityKind::Delegate
        | ActivityKind::Ask
        | ActivityKind::Other => ToolKind::Other,
    };
    let fields = attribution.as_object_mut().expect("object attribution");
    fields.insert("messageId".into(), json!(message));
    fields.insert("activity".into(), json!(classified.kind));
    fields.insert("outcome".into(), json!(label));
    if let Some(source) = classified.source {
        fields.insert("source".into(), json!(source));
    }
    let update = AcpToolCall::new(call.id.as_str().to_owned(), call.tool.as_str().to_owned())
        .kind(kind)
        .status(status)
        .raw_input(tool_input(&call.arguments))
        .raw_output(result.map(tool_output));
    (SessionUpdate::ToolCall(update), attribution)
}

/// The longest string a tool call's arguments carry to a client. File
/// contents and edits are previews, not the source of truth.
const MAX_INPUT_TEXT: usize = 4 * 1024;
/// The longest result text a tool call carries to a client.
const MAX_OUTPUT_TEXT: usize = 8 * 1024;
/// The largest structured result a tool call carries to a client.
const MAX_STRUCTURED_BYTES: usize = 4 * 1024;
/// The most items an argument list carries to a client.
const MAX_INPUT_ITEMS: usize = 64;

/// A tool call's arguments for display, with long values shortened.
fn tool_input(arguments: &ToolArguments) -> Value {
    match arguments {
        ToolArguments::Json(value) => bounded(value),
        ToolArguments::Text(text) => json!(shorten(text, MAX_INPUT_TEXT).0),
    }
}

fn bounded(value: &Value) -> Value {
    match value {
        Value::String(text) => json!(shorten(text, MAX_INPUT_TEXT).0),
        Value::Array(items) => {
            Value::Array(items.iter().take(MAX_INPUT_ITEMS).map(bounded).collect())
        }
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .take(MAX_INPUT_ITEMS)
                .map(|(key, value)| (key.clone(), bounded(value)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// A tool result for display: its text, shortened, and its structured value
/// when small.
fn tool_output(result: &ToolResult) -> Value {
    let text: String = result
        .content
        .iter()
        .filter_map(|content| match content {
            ResultContent::Text(text) => Some(text.as_str()),
            ResultContent::Media(_) => None,
        })
        .collect::<Vec<_>>()
        .join("\n");
    let (text, shortened) = shorten(&text, MAX_OUTPUT_TEXT);
    let mut output = json!({"text": text, "truncated": result.truncated || shortened});
    if let Some(structured) = result.structured.as_ref().filter(|value| {
        serde_json::to_vec(value).is_ok_and(|bytes| bytes.len() <= MAX_STRUCTURED_BYTES)
    }) {
        output["structured"] = structured.clone();
    }
    output
}

fn shorten(text: &str, maximum: usize) -> (String, bool) {
    if text.len() <= maximum {
        return (text.to_owned(), false);
    }
    (
        format!("{}…", &text[..text.floor_char_boundary(maximum)]),
        true,
    )
}

fn visible_parts(message: &Message) -> impl Iterator<Item = Cow<'_, str>> {
    message.content.iter().filter_map(|content| {
        if !matches!(message.role, Role::User | Role::Assistant) {
            return None;
        }
        match content {
            Content::Text(text) => Some(Cow::Borrowed(text.as_str())),
            Content::Media(media) if crate::host::is_retained_image(media) => {
                Some(Cow::Borrowed(crate::host::RETAINED_IMAGE_LABEL))
            }
            Content::Media(media) => {
                grida_agent_master::retained_file::display(media).map(Cow::Owned)
            }
            _ => None,
        }
    })
}

#[cfg(test)]
mod compaction_fact_tests {
    use super::*;
    use agent_kit_core::{Envelope, TurnId};
    use grida_agent_master::compaction::{CompactionAccount, CompactionFailure, Coverage};

    fn account(summary: Option<&str>) -> Envelope {
        let failed = CompactionAccount::failed(
            Coverage {
                records: 4,
                input_bytes: 1_000,
                omissions: Default::default(),
            },
            CompactionFailure::Provider,
            Default::default(),
        )
        .to_envelope()
        .unwrap();
        let mut value: Value = serde_json::from_slice(failed.bytes()).unwrap();
        value["failure"] = Value::Null;
        value["summary"] = json!(summary);
        Envelope::new(
            failed.schema().clone(),
            failed.version(),
            serde_json::to_vec(&value).unwrap(),
        )
        .unwrap()
    }

    fn turn(id: &str, silent_account: Option<Envelope>) -> ReplayTurn {
        ReplayTurn {
            id: TurnId::new(id).unwrap(),
            status: Some(OutcomeStatus::Succeeded),
            started_ms: Some(1),
            settled_ms: Some(2),
            context_tokens: None,
            silent_account,
            tail: true,
        }
    }

    #[test]
    fn a_compaction_turn_carries_its_summary_for_a_transcript_note() {
        let facts = turn_facts(
            &turn(
                "automatic-compact/abc",
                Some(account(Some("Earlier cart work."))),
            ),
            false,
        );
        assert_eq!(
            facts["compaction"],
            json!({"summary": "Earlier cart work.", "automatic": true})
        );
        let manual = turn_facts(&turn("manual", Some(account(Some("Summary.")))), false);
        assert_eq!(manual["compaction"]["automatic"], false);
    }

    #[test]
    fn other_turns_carry_no_compaction() {
        assert!(
            turn_facts(&turn("t", None), false)
                .get("compaction")
                .is_none()
        );
        assert!(
            turn_facts(&turn("t", Some(account(None))), false)
                .get("compaction")
                .is_none(),
            "a failed compaction has no summary to show"
        );
    }
}
