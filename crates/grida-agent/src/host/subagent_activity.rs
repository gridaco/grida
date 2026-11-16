//! GRIDA-SEC-004 — bounded visible child activity, authorized through its parent.

use super::*;
use agent_kit_core::inference::InferenceUpdate;
use agent_kit_core::messages::{
    MessagePhase, OutcomeStatus, ResultContent, ToolArguments, ToolResult,
};
use agent_kit_core::turn::TurnBinding;
use agent_kit_runtime::TurnUpdate;
use agent_kit_store_sqlite::history::{ReplayCursor, ReplayTurn};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::{Value, json};
use std::sync::Mutex as SyncMutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const COUNT_LIMIT: usize = 512;
const COUNT_CACHE: Duration = Duration::from_secs(2);
const MAX_CACHED_PARENTS: usize = 8;
const MAX_LIVE_SESSIONS: usize = 128;
const MAX_LIVE_BYTES: usize = 256 * 1024;
const MAX_TEXT_BYTES: usize = 64 * 1024;
const MAX_WIRE_BYTES: usize = 768 * 1024;

#[derive(Default)]
pub(super) struct State {
    counts: Mutex<BTreeMap<SessionId, CountSnapshot>>,
    live: SyncMutex<BTreeMap<SessionId, LiveConversation>>,
}

struct CountSnapshot {
    sampled: Instant,
    observed_at_ms: u64,
    rows: Vec<Child>,
    counts: Counts,
}

struct LiveConversation {
    turn: TurnId,
    updated: Instant,
    messages: BTreeMap<MessageId, String>,
    order: Vec<MessageId>,
    bytes: usize,
    truncated: bool,
}

impl State {
    /// Only public assistant text enters this cache. Provider reasoning and
    /// transport state never do. It is transient and cannot claim crash durability.
    pub(super) fn update(&self, binding: &TurnBinding, update: &TurnUpdate) {
        let TurnUpdate::Inference {
            update: InferenceUpdate::TextDelta { message, text },
            ..
        } = update
        else {
            return;
        };
        let mut conversations = self.live.lock().unwrap();
        if !conversations.contains_key(&binding.session)
            && conversations.len() >= MAX_LIVE_SESSIONS
            && let Some(oldest) = conversations
                .iter()
                .min_by_key(|(_, item)| item.updated)
                .map(|(id, _)| id.clone())
        {
            conversations.remove(&oldest);
        }
        let conversation = conversations
            .entry(binding.session.clone())
            .or_insert_with(|| LiveConversation::new(binding.turn.clone()));
        if conversation.turn != binding.turn {
            *conversation = LiveConversation::new(binding.turn.clone());
        }
        conversation.updated = Instant::now();
        if conversation.messages.len() >= 128 && !conversation.messages.contains_key(message) {
            conversation.truncated = true;
            return;
        }
        if !conversation.messages.contains_key(message) {
            conversation.order.push(message.clone());
        }
        let value = conversation.messages.entry(message.clone()).or_default();
        let remaining = (MAX_LIVE_BYTES - conversation.bytes).min(MAX_TEXT_BYTES - value.len());
        let length = text.floor_char_boundary(remaining.min(text.len()));
        value.push_str(&text[..length]);
        conversation.bytes += length;
        conversation.truncated |= length < text.len();
    }
}

impl LiveConversation {
    fn new(turn: TurnId) -> Self {
        Self {
            turn,
            updated: Instant::now(),
            messages: BTreeMap::new(),
            order: Vec::new(),
            bytes: 0,
            truncated: false,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Counts {
    pub active: usize,
    pub done: usize,
    /// False means these are lower bounds over the newest 512 children.
    pub complete: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Child {
    pub child_id: SessionId,
    pub name: String,
    pub kind: &'static str,
    pub status: &'static str,
    pub section: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_turn_id: Option<TurnId>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LifecycleEvent {
    event_id: String,
    child_id: SessionId,
    name: String,
    kind: &'static str,
    child_turn_id: TurnId,
    parent_turn_id: TurnId,
    input_id: ChangeId,
    at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<OutcomeStatus>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ActivityPage {
    parent_session_id: SessionId,
    children: Vec<Child>,
    next_after_child_id: Option<SessionId>,
    counts: Counts,
    observed_at_ms: u64,
    events: Vec<LifecycleEvent>,
    events_complete: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CapturedExecution {
    model: Option<String>,
    /// Null denotes the captured model default or unavailable legacy evidence.
    effort: Option<&'static str>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscriptMessage {
    message_id: MessageId,
    role: Role,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    turn_id: Option<TurnId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    phase: Option<&'static str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    activity: Vec<Value>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    truncated: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    live: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscriptTurn {
    turn_id: TurnId,
    status: Option<OutcomeStatus>,
    started_at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    settled_at_ms: Option<u64>,
    execution: CapturedExecution,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct LiveState {
    available: bool,
    truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationPage {
    parent_session_id: SessionId,
    child_id: SessionId,
    name: String,
    kind: &'static str,
    view: SessionRevision,
    messages: Vec<TranscriptMessage>,
    turns: Vec<TranscriptTurn>,
    execution: Option<CapturedExecution>,
    older: Option<String>,
    live: LiveState,
    observed_at_ms: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Cursor {
    parent: SessionId,
    child: SessionId,
    before: ReplayCursor,
}

impl Host {
    pub(crate) async fn subagent_activity(
        &self,
        parent: SessionId,
        after: Option<SessionId>,
    ) -> Result<ActivityPage> {
        self.require_activity_parent(&parent).await?;
        // The catalog checks the anchor's scope even when a cached status
        // summary exists. An opaque child identity is never read authority.
        let page = self
            .store
            .list_catalog_configurations(catalog::child_scope(&parent)?, 0, after)
            .await?;
        let (counts, observed_at_ms, cached) = self.activity_counts(&parent).await?;
        let mut children = Vec::with_capacity(page.entries.len());
        let mut events = Vec::new();
        let mut events_complete = true;
        for (id, configuration) in page.entries {
            let profile = subagents::child_profile(&parent, &configuration)?;
            let mut child = match cached.iter().find(|row| row.child_id == id) {
                Some(row) => row.clone(),
                None => child_row(&self.store.inspect(id.clone()).await?, &profile),
            };
            let history = self
                .transcript_window(id.clone(), None, visible_bytes)
                .await?;
            events_complete &= history.older.is_none();
            if let Some(turn) = history.turns.last() {
                child.updated_at_ms = Some(turn.settled_ms.unwrap_or(turn.started_ms));
            }
            for turn in &history.turns {
                if events.len() + if turn.settled_ms.is_some() { 2 } else { 1 } > 512 {
                    events_complete = false;
                    break;
                }
                if let Some((input, parent_turn)) = self.assignment_identity(&id, &turn.id).await? {
                    events.push(LifecycleEvent {
                        event_id: format!("{}/{}/started", id.as_str(), turn.id.as_str()),
                        child_id: id.clone(),
                        name: profile.name().to_owned(),
                        kind: "started",
                        child_turn_id: turn.id.clone(),
                        parent_turn_id: parent_turn.clone(),
                        input_id: input.clone(),
                        at_ms: turn.started_ms,
                        status: None,
                    });
                    if let Some(at_ms) = turn.settled_ms {
                        events.push(LifecycleEvent {
                            event_id: format!("{}/{}/finished", id.as_str(), turn.id.as_str()),
                            child_id: id.clone(),
                            name: profile.name().to_owned(),
                            kind: "finished",
                            child_turn_id: turn.id.clone(),
                            parent_turn_id: parent_turn,
                            input_id: input,
                            at_ms,
                            status: turn.status,
                        });
                    }
                }
            }
            children.push(child);
        }
        events.sort_by(|a, b| (a.at_ms, &a.event_id).cmp(&(b.at_ms, &b.event_id)));
        let mut result = ActivityPage {
            parent_session_id: parent,
            children,
            next_after_child_id: page.next_after,
            counts,
            observed_at_ms,
            events,
            events_complete,
        };
        while serde_json::to_vec(&result)
            .map_err(|_| problem(ErrorKind::InvalidState, "subagent_activity_encoding"))?
            .len()
            > MAX_WIRE_BYTES
            && !result.events.is_empty()
        {
            result.events.remove(0);
            result.events_complete = false;
        }
        bounded_wire(&result)?;
        Ok(result)
    }

    async fn require_activity_parent(&self, parent: &SessionId) -> Result<()> {
        if !self.subagents_available() {
            return Err(problem(ErrorKind::Unsupported, "subagents_unavailable"));
        }
        let view = self.store.inspect(parent.clone()).await?;
        if session_configuration(&view)?.subagent.is_some() {
            return Err(problem(
                ErrorKind::Unavailable,
                "subagent_parent_unavailable",
            ));
        }
        Ok(())
    }

    async fn activity_counts(&self, parent: &SessionId) -> Result<(Counts, u64, Vec<Child>)> {
        let mut cache = self.subagent_activity.counts.lock().await;
        if let Some(snapshot) = cache.get(parent)
            && snapshot.sampled.elapsed() < COUNT_CACHE
        {
            return Ok((
                snapshot.counts.clone(),
                snapshot.observed_at_ms,
                snapshot.rows.clone(),
            ));
        }
        if cache.len() >= MAX_CACHED_PARENTS
            && !cache.contains_key(parent)
            && let Some(oldest) = cache
                .iter()
                .min_by_key(|(_, item)| item.sampled)
                .map(|(id, _)| id.clone())
        {
            cache.remove(&oldest);
        }
        let mut rows = Vec::new();
        let mut after = None;
        let complete = loop {
            let page = self
                .store
                .list_catalog_configurations(catalog::child_scope(parent)?, 0, after)
                .await?;
            for (id, configuration) in page.entries {
                let profile = subagents::child_profile(parent, &configuration)?;
                rows.push(child_row(&self.store.inspect(id).await?, &profile));
            }
            if page.next_after.is_none() {
                break true;
            }
            if rows.len() >= COUNT_LIMIT {
                break false;
            }
            after = page.next_after;
        };
        let counts = Counts {
            active: rows.iter().filter(|row| row.section == "active").count(),
            done: rows.iter().filter(|row| row.section == "done").count(),
            complete,
        };
        let observed_at_ms = now_ms();
        cache.insert(
            parent.clone(),
            CountSnapshot {
                sampled: Instant::now(),
                observed_at_ms,
                rows: rows.clone(),
                counts: counts.clone(),
            },
        );
        Ok((counts, observed_at_ms, rows))
    }

    pub(crate) async fn subagent_conversation(
        &self,
        parent: SessionId,
        child: SessionId,
        before: Option<String>,
    ) -> Result<ConversationPage> {
        self.require_activity_parent(&parent).await?;
        let view = self.store.inspect(child.clone()).await?;
        let profile = subagents::child_profile(&parent, &view.configuration)?;
        let latest = before.is_none();
        let cursor = before
            .map(|value| decode_cursor(value, &parent, &child))
            .transpose()?;
        let window = self
            .transcript_window(child.clone(), cursor, visible_bytes)
            .await?;
        let execution = match view.current.as_ref().or(view.latest.as_ref()) {
            Some(turn) => Some(
                self.captured_child_execution(&child, &turn.binding.turn)
                    .await?,
            ),
            None => None,
        };
        let mut turns = Vec::with_capacity(window.turns.len());
        for turn in &window.turns {
            turns.push(TranscriptTurn {
                turn_id: turn.id.clone(),
                status: turn.status,
                started_at_ms: turn.started_ms,
                settled_at_ms: turn.settled_ms,
                execution: self.captured_child_execution(&child, &turn.id).await?,
            });
        }
        let mut messages = project_messages(window.records, &window.turns);
        let mut live = LiveState {
            available: view.current.is_none(),
            truncated: false,
        };
        if latest && let Some(current) = &view.current {
            let conversations = self.subagent_activity.live.lock().unwrap();
            if let Some(current_text) = conversations
                .get(&child)
                .filter(|item| item.turn == current.binding.turn)
            {
                live.available = true;
                live.truncated = current_text.truncated;
                let mut visible_bytes: usize =
                    messages.iter().map(|message| message.text.len()).sum();
                for id in &current_text.order {
                    let text = &current_text.messages[id];
                    if text.is_empty() {
                        continue;
                    }
                    if messages.iter().any(|message| &message.message_id == id) {
                        continue;
                    }
                    if messages.len() >= 128 || visible_bytes + text.len() > MAX_LIVE_BYTES {
                        live.truncated = true;
                        break;
                    }
                    visible_bytes += text.len();
                    messages.push(TranscriptMessage {
                        message_id: id.clone(),
                        role: Role::Assistant,
                        text: text.clone(),
                        turn_id: Some(current.binding.turn.clone()),
                        phase: Some("progress"),
                        activity: Vec::new(),
                        truncated: current_text.truncated,
                        live: true,
                    });
                }
            }
        }
        let older = window
            .older
            .map(|before| {
                encode_cursor(Cursor {
                    parent: parent.clone(),
                    child: child.clone(),
                    before,
                })
            })
            .transpose()?;
        let result = ConversationPage {
            parent_session_id: parent,
            child_id: child,
            name: profile.name().to_owned(),
            kind: child_kind(&profile, &view.configuration),
            view: window.view,
            messages,
            turns,
            execution,
            older,
            live,
            observed_at_ms: now_ms(),
        };
        bounded_wire(&result)?;
        Ok(result)
    }

    async fn captured_child_execution(
        &self,
        child: &SessionId,
        turn: &TurnId,
    ) -> Result<CapturedExecution> {
        for input in self
            .store
            .turn_submissions(child.clone(), turn.clone())
            .await?
        {
            if !is_stored_input(&input.payload) {
                continue;
            }
            let stored: StoredPrompt = decode_input(&input)?;
            return Ok(CapturedExecution {
                model: stored.model.map(|model| model.as_str().to_owned()),
                effort: if stored
                    .effort
                    .as_ref()
                    .is_some_and(|policy| policy.preset() == EffortPreset::Ultra)
                {
                    Some("ultra")
                } else {
                    stored.reasoning.map(|value| value.as_str())
                },
            });
        }
        Ok(CapturedExecution {
            model: None,
            effort: None,
        })
    }

    async fn assignment_identity(
        &self,
        child: &SessionId,
        turn: &TurnId,
    ) -> Result<Option<(ChangeId, TurnId)>> {
        for input in self
            .store
            .turn_submissions(child.clone(), turn.clone())
            .await?
        {
            if !is_stored_input(&input.payload) {
                continue;
            }
            let stored: StoredPrompt = decode_input(&input)?;
            if let Some(assignment) = stored.subagent {
                return Ok(Some((input.id, assignment.parent_turn)));
            }
        }
        Ok(None)
    }
}

fn child_kind(
    profile: &grida_agent_master::subagents::Profile,
    configuration: &Envelope,
) -> &'static str {
    let worker = decode_session_configuration(configuration)
        .is_ok_and(|configuration| configuration.worker.is_some());
    if profile.sponsorship().is_some() && !worker {
        "review"
    } else {
        "named"
    }
}

fn child_row(view: &SessionView, profile: &grida_agent_master::subagents::Profile) -> Child {
    let queued = view
        .queued
        .iter()
        .any(|input| !subagents::is_message(&input.input));
    let status = match &view.current {
        Some(turn) => match turn.disposition {
            TurnDisposition::Running => "running",
            TurnDisposition::Suspended => "paused",
            TurnDisposition::Interrupted => "interrupted",
            TurnDisposition::Settled => "uncertain",
        },
        None if queued => {
            if view.admission_paused {
                "paused"
            } else {
                "queued"
            }
        }
        None => match view
            .latest
            .as_ref()
            .and_then(|turn| turn.outcome.as_ref())
            .map(|outcome| outcome.status)
        {
            Some(OutcomeStatus::Succeeded) => "succeeded",
            Some(OutcomeStatus::Failed) => "failed",
            Some(OutcomeStatus::Cancelled) => "cancelled",
            Some(OutcomeStatus::Uncertain) => "uncertain",
            None => "ready",
        },
    };
    let section = if !queued && matches!(status, "succeeded" | "failed" | "cancelled") {
        "done"
    } else {
        "active"
    };
    Child {
        child_id: view.session.clone(),
        name: profile.name().to_owned(),
        kind: child_kind(profile, &view.configuration),
        status,
        section,
        updated_at_ms: None,
        latest_turn_id: view
            .current
            .as_ref()
            .or(view.latest.as_ref())
            .map(|turn| turn.binding.turn.clone()),
    }
}

fn visible_bytes(record: &HistoryRecord) -> usize {
    let HistoryRecord::Message(message) = record;
    message
        .content
        .iter()
        .map(|part| match part {
            Content::Text(text) if matches!(message.role, Role::User | Role::Assistant) => {
                text.len()
            }
            Content::ToolCall(_) | Content::ToolResult(_) => 64,
            _ => 0,
        })
        .sum()
}

fn project_messages(
    records: Vec<agent_kit_store_sqlite::history::ReplayRecord>,
    turns: &[ReplayTurn],
) -> Vec<TranscriptMessage> {
    let mut results = BTreeMap::new();
    for record in &records {
        let HistoryRecord::Message(message) = &record.record;
        if message.role != Role::Tool {
            continue;
        }
        for part in &message.content {
            if let Content::ToolResult(result) = part {
                results.insert(result.call.clone(), result);
            }
        }
    }
    let mut answers = BTreeSet::new();
    for turn in turns.iter().filter(|turn| turn.tail) {
        answers.extend(grida_agent_master::activity::final_answers(
            records
                .iter()
                .filter(|record| record.turn.as_ref() == Some(&turn.id))
                .map(|record| {
                    let HistoryRecord::Message(message) = &record.record;
                    message
                }),
            turn.status,
        ));
    }
    records.iter().filter_map(|record| {
        let HistoryRecord::Message(message) = &record.record;
        if !matches!(message.role, Role::User | Role::Assistant) { return None; }
        let text: String = message.content.iter().filter_map(|part| match part { Content::Text(text) => Some(text.as_str()), _ => None }).collect();
        let (text, mut truncated) = shortened(&text, MAX_TEXT_BYTES);
        let mut activity = Vec::new();
        for part in &message.content {
            if let Content::ToolCall(call) = part {
                if activity.len() >= 16 { truncated = true; break; }
                let classified = grida_agent_master::activity::classify(&call.tool);
                let result = results.get(&call.id).copied();
                let outcome = result.map_or_else(|| {
                    if turns.iter().find(|turn| Some(&turn.id) == record.turn.as_ref()).is_some_and(|turn| turn.status.is_some()) { "uncertain" } else { "running" }
                }, |result| outcome_label(result.status));
                let input = match &call.arguments {
                    ToolArguments::Json(value) => bounded_json(value, 0),
                    ToolArguments::Text(text) | ToolArguments::Malformed(text) => json!(shortened(text, 4096).0),
                };
                let mut item = json!({"callId":call.id,"title":call.tool,"kind":classified.kind,"outcome":outcome,"input":input});
                if let Some(source) = classified.source { item["source"] = json!(source); }
                if let Some(result) = result { item["output"] = tool_output(result); }
                activity.push(item);
            }
        }
            if text.is_empty() && activity.is_empty() {
                return None;
            }
            Some(TranscriptMessage {
            message_id: message.id.clone(), role: message.role, text, turn_id: record.turn.clone(),
            phase: (message.role == Role::Assistant).then_some(if answers.contains(&message.id) || message.phase == Some(MessagePhase::Answer) { "answer" } else { "progress" }),
            activity, truncated, live: false,
        })
    }).collect()
}

fn tool_output(result: &ToolResult) -> Value {
    let text = result
        .content
        .iter()
        .filter_map(|part| match part {
            ResultContent::Text(text) => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n");
    let (text, shortened) = shortened(&text, 8192);
    json!({"text":text,"truncated":result.truncated || shortened})
}

fn bounded_json(value: &Value, depth: u8) -> Value {
    if depth >= 8 {
        return Value::Null;
    }
    match value {
        Value::String(text) => json!(shortened(text, 4096).0),
        Value::Array(items) => Value::Array(
            items
                .iter()
                .take(32)
                .map(|value| bounded_json(value, depth + 1))
                .collect(),
        ),
        Value::Object(items) => Value::Object(
            items
                .iter()
                .take(32)
                .map(|(key, value)| (shortened(key, 256).0, bounded_json(value, depth + 1)))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn shortened(value: &str, maximum: usize) -> (String, bool) {
    let end = value.floor_char_boundary(value.len().min(maximum));
    (value[..end].to_owned(), end < value.len())
}

fn outcome_label(status: OutcomeStatus) -> &'static str {
    match status {
        OutcomeStatus::Succeeded => "succeeded",
        OutcomeStatus::Failed => "failed",
        OutcomeStatus::Cancelled => "cancelled",
        OutcomeStatus::Uncertain => "uncertain",
    }
}

fn encode_cursor(cursor: Cursor) -> Result<String> {
    serde_json::to_vec(&cursor)
        .map(|bytes| URL_SAFE_NO_PAD.encode(bytes))
        .map_err(|_| problem(ErrorKind::InvalidState, "subagent_cursor_unavailable"))
}

fn decode_cursor(value: String, parent: &SessionId, child: &SessionId) -> Result<ReplayCursor> {
    let fail = || problem(ErrorKind::InvalidInput, "subagent_cursor_invalid");
    if value.len() > 4096 {
        return Err(fail());
    }
    let bytes = URL_SAFE_NO_PAD.decode(value).map_err(|_| fail())?;
    let cursor: Cursor = serde_json::from_slice(&bytes).map_err(|_| fail())?;
    if &cursor.parent != parent || &cursor.child != child {
        return Err(fail());
    }
    Ok(cursor.before)
}

fn bounded_wire<T: Serialize>(value: &T) -> Result<()> {
    if serde_json::to_vec(value)
        .map_err(|_| problem(ErrorKind::InvalidState, "subagent_activity_encoding"))?
        .len()
        > MAX_WIRE_BYTES
    {
        return Err(problem(
            ErrorKind::LimitExceeded,
            "subagent_activity_page_too_large",
        ));
    }
    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::{ModelId, OperationId};

    fn binding(session: &str, turn: &str) -> TurnBinding {
        TurnBinding {
            session: SessionId::new(session).unwrap(),
            turn: TurnId::new(turn).unwrap(),
            epoch: 1,
        }
    }

    fn update(message: &str, text: &str) -> TurnUpdate {
        TurnUpdate::Inference {
            operation: OperationId::new("inference").unwrap(),
            update: InferenceUpdate::TextDelta {
                message: MessageId::new(message).unwrap(),
                text: text.into(),
            },
        }
    }

    #[test]
    fn transient_visible_text_is_bounded_ordered_and_never_keeps_reasoning() {
        let state = State::default();
        let owner = binding("child", "first");
        state.update(
            &owner,
            &TurnUpdate::Inference {
                operation: OperationId::new("inference").unwrap(),
                update: InferenceUpdate::ReasoningDelta {
                    message: MessageId::new("secret").unwrap(),
                    text: "not for display".into(),
                },
            },
        );
        state.update(&owner, &update("z-first", "Visible "));
        state.update(&owner, &update("z-first", "progress"));
        state.update(&owner, &update("a-later", &"é".repeat(MAX_TEXT_BYTES)));
        let live = state.live.lock().unwrap();
        let child = live.get(&owner.session).unwrap();
        assert_eq!(child.messages.len(), 2);
        assert_eq!(
            child.messages[&MessageId::new("z-first").unwrap()],
            "Visible progress"
        );
        assert_eq!(
            child.order.iter().map(|id| id.as_str()).collect::<Vec<_>>(),
            ["z-first", "a-later"]
        );
        assert_eq!(
            child.messages[&MessageId::new("a-later").unwrap()].len(),
            MAX_TEXT_BYTES
        );
        assert!(child.truncated);
        drop(live);
        state.update(&binding("child", "next"), &update("next", "new work"));
        let live = state.live.lock().unwrap();
        let child = live.get(&owner.session).unwrap();
        assert_eq!(child.messages.len(), 1);
        assert_eq!(child.turn.as_str(), "next");
    }

    #[test]
    fn reasoning_only_records_make_no_visible_message_and_cursors_keep_both_owners() {
        use agent_kit_core::messages::{Message, Provenance, ProvenanceKind};
        use agent_kit_store_sqlite::history::ReplayRecord;
        let message = Message {
            id: MessageId::new("hidden").unwrap(),
            role: Role::Assistant,
            phase: None,
            content: vec![Content::Reasoning("private reasoning".into())],
            provenance: Provenance {
                source: "fixture".into(),
                kind: ProvenanceKind::Generated,
                fingerprint: None,
            },
        };
        assert!(
            project_messages(
                vec![ReplayRecord {
                    turn: Some(TurnId::new("turn").unwrap()),
                    record: HistoryRecord::Message(message)
                }],
                &[]
            )
            .is_empty()
        );
        let parent = SessionId::new("parent").unwrap();
        let child = SessionId::new("child").unwrap();
        let before: ReplayCursor = serde_json::from_value(
            json!({"view":1,"boundary":{"kind":"turn","ordinal":1,"cut":null}}),
        )
        .unwrap();
        let encoded = encode_cursor(Cursor {
            parent: parent.clone(),
            child: child.clone(),
            before: before.clone(),
        })
        .unwrap();
        assert_eq!(
            decode_cursor(encoded.clone(), &parent, &child).unwrap(),
            before
        );
        assert!(
            decode_cursor(
                encoded.clone(),
                &SessionId::new("other-parent").unwrap(),
                &child
            )
            .is_err()
        );
        assert!(decode_cursor(encoded, &parent, &SessionId::new("other-child").unwrap()).is_err());
    }

    #[tokio::test]
    async fn bounded_count_snapshots_do_not_hide_later_catalog_pages() {
        let root = tempfile::tempdir().unwrap();
        let host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:9/v1".into(),
                model: ModelId::new("never-dispatched").unwrap(),
                max_output_tokens: 128,
                credential_env: None,
                protocol: ProviderProtocol::OpenAiCompatible,
                credential_home: None,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap()
        .with_subagents();
        let parent = host.new_session(root.path().into()).await.unwrap();
        for index in 0..COUNT_LIMIT + 1 {
            host.create_subagent(
                parent.clone(),
                ChangeId::new(format!("create-{index}")).unwrap(),
                format!("Child {index}"),
                1,
            )
            .await
            .unwrap();
        }
        let mut after = None;
        let mut ids = BTreeSet::new();
        loop {
            let page = host.subagent_activity(parent.clone(), after).await.unwrap();
            assert_eq!(page.counts.active, COUNT_LIMIT);
            assert_eq!(page.counts.done, 0);
            assert!(!page.counts.complete);
            assert!(page.children.len() <= 32);
            for row in page.children {
                assert_eq!(row.status, "ready");
                assert!(row.updated_at_ms.is_none());
                assert!(ids.insert(row.child_id));
            }
            match page.next_after_child_id {
                Some(cursor) => after = Some(cursor),
                None => break,
            }
        }
        assert_eq!(ids.len(), COUNT_LIMIT + 1);
        let foreign = host.new_session(root.path().into()).await.unwrap();
        let foreign_child = host
            .create_subagent(
                foreign.clone(),
                ChangeId::new("foreign").unwrap(),
                "Other".into(),
                1,
            )
            .await
            .unwrap();
        assert!(
            host.subagent_activity(parent.clone(), Some(foreign_child.clone()))
                .await
                .is_err()
        );
        assert_eq!(
            host.subagent_conversation(parent, foreign_child, None)
                .await
                .unwrap_err()
                .code,
            "subagent_unavailable"
        );
        host.shutdown().await.unwrap();
    }
}
