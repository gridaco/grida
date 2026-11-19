//! A connection-local presentation of the host's authorized transcript.

use super::transport::Delivery;
use super::unavailable;
use crate::host::{TranscriptInputFacts, message_context};
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::{
    ContentBlock, ContentChunk, ResourceLink, SessionId, SessionNotification, SessionUpdate,
    ToolCall as AcpToolCall, ToolCallStatus, ToolKind,
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
use std::sync::Arc;

const MAX_CHUNK_BYTES: usize = 8 * 1024;
pub(super) const TRANSCRIPT_WINDOW: &str = "co.grida/session/transcript-window";
pub(super) const ACTIVITY_ORDER: &str = "co.grida/session/activity-order";

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
    ordering: Option<Arc<crate::host::activity_order::State>>,
    turn: Option<agent_kit_core::TurnId>,
    tool_images: bool,
    calls: BTreeMap<agent_kit_core::ToolCallId, (MessageId, ToolCall)>,
    finished: BTreeSet<agent_kit_core::ToolCallId>,
}

impl Projection {
    pub(super) fn new(session: SessionId) -> Self {
        Self {
            session,
            replay_id: None,
            streamed_text: BTreeMap::new(),
            ordering: None,
            turn: None,
            tool_images: false,
            calls: BTreeMap::new(),
            finished: BTreeSet::new(),
        }
    }

    pub(super) fn with_activity_order(
        mut self,
        ordering: Option<Arc<crate::host::activity_order::State>>,
    ) -> Self {
        self.ordering = ordering;
        self
    }

    pub(super) fn with_tool_images(mut self, enabled: bool) -> Self {
        self.tool_images = enabled;
        self
    }

    fn image_owner(&self) -> Option<agent_kit_core::SessionId> {
        self.tool_images
            .then(|| agent_kit_core::SessionId::new(self.session.0.to_string()).ok())
            .flatten()
    }

    pub(super) fn set_turn(&mut self, turn: agent_kit_core::TurnId) {
        self.turn = Some(turn);
    }

    fn stamp(
        &self,
        meta: &mut Value,
        turn: Option<&agent_kit_core::TurnId>,
        message: Option<&MessageId>,
        call: Option<&agent_kit_core::ToolCallId>,
    ) {
        let Some(ordering) = &self.ordering else {
            return;
        };
        let session = agent_kit_core::SessionId::new(self.session.0.to_string()).ok();
        let order = session.as_ref().zip(turn).and_then(|(session, turn)| {
            if let Some(call) = call {
                ordering.call(session, turn, call)
            } else {
                message.and_then(|message| ordering.message(session, turn, message))
            }
        });
        let fields = meta.as_object_mut().expect("object metadata");
        fields.remove("activityOrder");
        fields.remove("activityOrderIncomplete");
        fields.extend(
            crate::host::activity_order::metadata(order)
                .as_object()
                .unwrap()
                .clone(),
        );
    }

    fn metadata(
        &self,
        base: Option<(&str, Value)>,
        fact: &Value,
    ) -> serde_json::Map<String, Value> {
        let mut meta = serde_json::Map::new();
        if let Some((key, value)) = base {
            meta.insert(key.into(), value);
        }
        if self.ordering.is_some() {
            meta.insert(ACTIVITY_ORDER.into(), fact.clone());
        }
        meta
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
        input_facts: &TranscriptInputFacts,
        message_context: bool,
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
            if !matches!(message.role, Role::User | Role::Assistant)
                || message_context::is_supplemental(&message)
            {
                continue;
            }
            let mut meta = json!({"requestId": request_id});
            if let Some(turn) = &turn {
                meta["turnId"] = json!(turn);
            }
            self.stamp(&mut meta, turn.as_ref(), Some(&message.id), None);
            if message.role == Role::Assistant {
                meta["phase"] = json!(match (answers.contains(&message.id), message.phase) {
                    (true, _) | (false, Some(MessagePhase::Answer)) => "answer",
                    _ => "progress",
                });
            }
            let mut text_meta = meta.clone();
            let text: String =
                if let Some(reply) = grida_agent_master::questions::visible_reply(&message) {
                    text_meta["questionReply"] =
                        json!({ "waitId": reply.question_item_id, "question": reply.question });
                    reply.answer
                } else {
                    visible_parts(&message).collect()
                };
            if message.role == Role::User
                && turn.is_some()
                && input_facts.svg_text_selections.contains(&message.id)
            {
                text_meta["svgTextSelection"] = json!(true);
            }
            if message_context
                && message.role == Role::User
                && let Some(parts) = input_facts.display_parts.get(&message.id)
            {
                text_meta["displayParts"] = json!(parts);
            }
            let text_metadata = self.metadata(Some((TRANSCRIPT_WINDOW, text_meta)), &meta);
            self.chunk_with(
                connection,
                delivery,
                message.role,
                &message.id,
                &text,
                text_metadata,
            )
            .await?;
            self.attachments(connection, delivery, &message, Some(&meta))
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
                self.stamp(&mut attribution, turn.as_ref(), None, Some(&call.id));
                let update = activity_update(
                    &message.id,
                    call,
                    outcome,
                    result,
                    attribution,
                    turn.as_ref().and(self.image_owner().as_ref()),
                );
                let notification = SessionNotification::new(self.session.clone(), update.0)
                    .meta(self.metadata(Some((TRANSCRIPT_WINDOW, update.1.clone())), &update.1));
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
            TurnUpdate::Snapshot(view) if self.ordering.is_some() || self.tool_images => {
                let mut updates = Vec::new();
                for HistoryRecord::Message(message) in view.state.history().records() {
                    if message.role != Role::Tool {
                        continue;
                    }
                    for part in &message.content {
                        if let Content::ToolResult(result) = part
                            && !self.finished.contains(&result.call)
                            && let Some((message, call)) = self.calls.get(&result.call)
                        {
                            updates.push((message.clone(), call.clone(), result.clone()));
                        }
                    }
                }
                for (message, call, result) in updates {
                    self.tool(connection, delivery, &message, &call, Some(&result))
                        .await?;
                    self.finished.insert(call.id);
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
        if !matches!(message.role, Role::User | Role::Assistant)
            || message_context::is_supplemental(&message)
        {
            return Ok(());
        }
        let text: String = grida_agent_master::questions::visible_reply(&message)
            .map(|reply| reply.answer)
            .unwrap_or_else(|| visible_parts(&message).collect());
        let suffix = if let Some(prefix) = self.streamed_text.remove(&message.id) {
            text.strip_prefix(&prefix)
                .ok_or_else(|| unavailable("session_message_projection_conflict"))?
        } else {
            &text
        };
        self.chunk(connection, delivery, message.role, &message.id, suffix)
            .await?;
        let mut meta = self
            .replay_id
            .as_ref()
            .map(|request_id| json!({"requestId": request_id}));
        if self.ordering.is_some() {
            let fact = meta.get_or_insert_with(|| json!({}));
            if let Some(turn) = &self.turn {
                fact["turnId"] = json!(turn);
            }
            self.stamp(fact, self.turn.as_ref(), Some(&message.id), None);
        }
        self.attachments(connection, delivery, &message, meta.as_ref())
            .await?;
        if (self.ordering.is_some() || (self.tool_images && self.turn.is_some()))
            && message.role == Role::Assistant
        {
            for part in &message.content {
                if let Content::ToolCall(call) = part
                    && !self.calls.contains_key(&call.id)
                {
                    self.calls
                        .insert(call.id.clone(), (message.id.clone(), call.clone()));
                    self.tool(connection, delivery, &message.id, call, None)
                        .await?;
                }
            }
        }
        Ok(())
    }

    async fn tool(
        &self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        message: &MessageId,
        call: &ToolCall,
        result: Option<&ToolResult>,
    ) -> Result<()> {
        let mut meta = json!({});
        if let Some(turn) = &self.turn {
            meta["turnId"] = json!(turn);
        }
        self.stamp(&mut meta, self.turn.as_ref(), None, Some(&call.id));
        let outcome = result.map_or(Outcome::Running, |result| Outcome::Finished(result.status));
        let (update, meta) = activity_update(
            message,
            call,
            outcome,
            result,
            meta,
            self.turn.as_ref().and(self.image_owner().as_ref()),
        );
        let notification = SessionNotification::new(self.session.clone(), update)
            .meta(self.metadata(Some((super::live::CAPABILITY, meta.clone())), &meta));
        delivery.send(connection, notification).await
    }

    /// A person's retained attachments, each as a link to the held asset. The
    /// link names the attachment for display; it never carries its bytes.
    async fn attachments(
        &self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        message: &Message,
        meta: Option<&Value>,
    ) -> Result<()> {
        if message.role != Role::User {
            return Ok(());
        }
        let observation =
            crate::host::editor_observation::is_observation(message).then(editor_context_link);
        for link in observation.into_iter().chain(attachment_links(message)) {
            let chunk =
                ContentChunk::new(ContentBlock::ResourceLink(link)).message_id(message.id.as_str());
            let mut notification = SessionNotification::new(
                self.session.clone(),
                SessionUpdate::UserMessageChunk(chunk),
            );
            if let Some(meta) = meta {
                notification = notification.meta(
                    self.metadata(
                        self.replay_id
                            .as_ref()
                            .map(|_| (TRANSCRIPT_WINDOW, meta.clone())),
                        meta,
                    ),
                );
            }
            delivery.send(connection, notification).await?;
        }
        Ok(())
    }

    async fn chunk_with(
        &self,
        connection: &ConnectionTo<Client>,
        delivery: &Delivery,
        role: Role,
        id: &MessageId,
        mut text: &str,
        mut metadata: serde_json::Map<String, Value>,
    ) -> Result<()> {
        let mut has_display_parts = metadata
            .get(TRANSCRIPT_WINDOW)
            .is_some_and(|facts| facts.get("displayParts").is_some());
        while !text.is_empty() || has_display_parts {
            let end = text.floor_char_boundary(MAX_CHUNK_BYTES.min(text.len()));
            let (part, remaining) = text.split_at(end);
            let chunk = ContentChunk::new(part.to_owned().into()).message_id(id.as_str());
            let update = match role {
                Role::User => SessionUpdate::UserMessageChunk(chunk),
                Role::Assistant => SessionUpdate::AgentMessageChunk(chunk),
                _ => return Ok(()),
            };
            let notification =
                SessionNotification::new(self.session.clone(), update).meta(metadata.clone());
            delivery.send(connection, notification).await?;
            if has_display_parts {
                if let Some(Value::Object(facts)) = metadata.get_mut(TRANSCRIPT_WINDOW) {
                    facts.remove("displayParts");
                }
                has_display_parts = false;
            }
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
            if self.replay_id.is_some() || self.ordering.is_some() {
                let mut fact = json!({});
                if let Some(request_id) = &self.replay_id {
                    fact["requestId"] = json!(request_id);
                }
                if let Some(turn) = &self.turn {
                    fact["turnId"] = json!(turn);
                }
                self.stamp(&mut fact, self.turn.as_ref(), Some(id), None);
                notification = notification.meta(
                    self.metadata(
                        self.replay_id
                            .as_ref()
                            .map(|_| (TRANSCRIPT_WINDOW, fact.clone())),
                        &fact,
                    ),
                );
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
    // A reference's poster frame travels with its link, so it counts too.
    let attachments = attachment_links(message)
        .map(|link| {
            ACTIVITY_RECORD_BYTES
                + link
                    .meta
                    .as_ref()
                    .and_then(|meta| serde_json::to_string(meta).ok())
                    .map_or(0, |meta| meta.len())
        })
        .sum::<usize>();
    visible_parts(message).map(|part| part.len()).sum::<usize>()
        + activity * ACTIVITY_RECORD_BYTES
        + attachments
        + usize::from(message_context::has_context(message)) * message_context::MAX_BYTES
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
    image_owner: Option<&agent_kit_core::SessionId>,
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
        .raw_output(result.map(|result| {
            let mut output = tool_output(result);
            if let Some(owner) = image_owner {
                let images = crate::host::tool_images::references(result, owner);
                if !images.is_empty() {
                    output["images"] = json!(
                        images
                            .iter()
                            .take(crate::host::tool_images::MAX_IMAGES)
                            .collect::<Vec<_>>()
                    );
                    if images.len() > crate::host::tool_images::MAX_IMAGES {
                        output["omittedImages"] =
                            json!(images.len() - crate::host::tool_images::MAX_IMAGES);
                    }
                }
            }
            output
        }));
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
        ToolArguments::Text(text) | ToolArguments::Malformed(text) => {
            json!(shorten(text, MAX_INPUT_TEXT).0)
        }
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

/// A message's readable text. A person's attachments are not text; they are
/// presented as links (`attachment_links`).
fn visible_parts(message: &Message) -> impl Iterator<Item = Cow<'_, str>> {
    let hidden = crate::host::editor_observation::is_observation(message)
        || message_context::is_supplemental(message);
    message.content.iter().filter_map(move |content| {
        if hidden || !matches!(message.role, Role::User | Role::Assistant) {
            return None;
        }
        match content {
            Content::Text(text) => Some(Cow::Borrowed(text.as_str())),
            _ => None,
        }
    })
}

/// URI scheme naming an attachment the host retains for a chat. Clients
/// cannot resolve it; it identifies the attachment within the transcript.
pub(crate) const RETAINED_ATTACHMENT_URI: &str = "urn:grida:retained-attachment:";

pub(super) fn editor_context_link() -> ResourceLink {
    ResourceLink::new("Editor context", "urn:grida:editor-context")
}

fn attachment_links(message: &Message) -> impl Iterator<Item = ResourceLink> + '_ {
    message.content.iter().filter_map(move |content| {
        let Content::Media(media) = content else {
            return None;
        };
        if message.role != Role::User {
            return None;
        }
        let uri = format!("{RETAINED_ATTACHMENT_URI}{}", media.id);
        if let Some(image) = crate::host::retained_raster(media) {
            let mut details = serde_json::Map::new();
            if let Some(path) = image.source_path() {
                details.insert("sourcePath".into(), json!(path));
            }
            details.insert("preparation".into(), json!(image.preparation));
            return Some(
                ResourceLink::new(image.name, uri)
                    .mime_type(image.mime_type)
                    .size(i64::try_from(image.original.size()).ok())
                    .meta(serde_json::Map::from_iter([(
                        "co.grida/image-attachment".into(),
                        Value::Object(details),
                    )])),
            );
        }
        if crate::host::is_retained_image(media) {
            let size =
                crate::host::retained_image_size(media).and_then(|size| i64::try_from(size).ok());
            return Some(
                ResourceLink::new("image.png", uri)
                    .mime_type("image/png".to_owned())
                    .size(size),
            );
        }
        if let Some(reference) = grida_agent_master::file_reference::reference(media) {
            return Some(file_reference_link(&reference));
        }
        grida_agent_master::retained_file::name(media).map(|name| ResourceLink::new(name, uri))
    })
}

/// `_meta` key of a file reference link: the workspace path and the preview a
/// client showed for it.
pub(crate) const FILE_REFERENCE_META: &str = "co.grida/file-reference";

/// A resource a person attached by reference, as the link they sent. The link
/// names a local path; inspecting it still needs the agent's own permissions.
pub(crate) fn file_reference_link(
    reference: &grida_agent_master::file_reference::FileReference,
) -> ResourceLink {
    let uri = reqwest::Url::from_file_path(&reference.path)
        .map_or_else(|()| format!("file://{}", reference.path), String::from);
    let mut details = serde_json::Map::new();
    if let Some(path) = &reference.workspace_path {
        details.insert("workspacePath".into(), json!(path));
    }
    if let Some(preview) = &reference.preview {
        details.insert("preview".into(), json!(preview));
    }
    let link = ResourceLink::new(reference.name.clone(), uri)
        .mime_type(reference.mime_type.clone())
        .size(reference.size.and_then(|size| i64::try_from(size).ok()));
    if details.is_empty() {
        link
    } else {
        link.meta(serde_json::Map::from_iter([(
            FILE_REFERENCE_META.into(),
            Value::Object(details),
        )]))
    }
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
            started_ms: 1,
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

#[cfg(test)]
mod attachment_tests {
    use super::*;
    use agent_kit_core::messages::{MediaRef, Provenance, ProvenanceKind, Retention};
    use agent_kit_core::{ArtifactId, BindingId};

    fn media(id: &str, media_type: &str, locator: &str) -> Content {
        Content::Media(MediaRef {
            id: ArtifactId::new(id).unwrap(),
            media_type: media_type.into(),
            locator: locator.into(),
            access_scope: BindingId::new("retained-input/chat").unwrap(),
            retention: Retention::Retained,
        })
    }

    fn message(role: Role, content: Vec<Content>) -> Message {
        Message {
            id: MessageId::new("message").unwrap(),
            role,
            phase: None,
            content,
            provenance: Provenance {
                source: "test".into(),
                kind: ProvenanceKind::Supplied,
                fingerprint: None,
            },
        }
    }

    #[test]
    fn a_persons_attachments_are_links_not_text() {
        let asked = message(
            Role::User,
            vec![
                Content::Text("What colour is it?".into()),
                media("image-1", "image/png", "retained-input:{}"),
                media(
                    "file-1",
                    grida_agent_master::retained_file::MEDIA_TYPE,
                    "retained-file-name:brief.md",
                ),
            ],
        );
        let text: String = visible_parts(&asked).collect();
        assert_eq!(text, "What colour is it?");
        let links: Vec<_> = attachment_links(&asked).collect();
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].name, "image.png");
        assert_eq!(links[0].mime_type.as_deref(), Some("image/png"));
        assert_eq!(links[0].uri, "urn:grida:retained-attachment:image-1");
        assert_eq!(links[1].name, "brief.md");
        assert_eq!(links[1].uri, "urn:grida:retained-attachment:file-1");
        let record = HistoryRecord::Message(asked);
        assert_eq!(
            visible_record_bytes(&record),
            "What colour is it?".len() + 2 * ACTIVITY_RECORD_BYTES
        );
    }

    #[test]
    fn unrecognized_or_assistant_media_is_not_linked() {
        let foreign = message(
            Role::User,
            vec![media("other", "image/jpeg", "elsewhere:x")],
        );
        assert_eq!(attachment_links(&foreign).count(), 0);
        let answered = message(
            Role::Assistant,
            vec![media("image-1", "image/png", "retained-input:{}")],
        );
        assert_eq!(attachment_links(&answered).count(), 0);
    }
}
