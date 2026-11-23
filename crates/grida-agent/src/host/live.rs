//! Read-only updates from turns owned independently of an ACP prompt request.

use super::RunResult;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::InferenceUpdate;
use agent_kit_core::messages::{
    Content, OutcomeStatus, ProviderEvidence, Role, SearchAction, SearchStatus, ToolCall,
    ToolResult, UrlCitation,
};
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnBinding, TurnState};
use agent_kit_core::{Envelope, MessageId, SessionId, ToolCallId, TurnId, WaitId};
use agent_kit_runtime::TurnUpdate;
use grida_agent_master::compaction::{self, CompactionActivityStatus};
use grida_agent_master::questions::QuestionReply;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use tokio::sync::broadcast;

/// Streaming and retained presentation use the same visible operations.
pub(super) fn publishes_operation(input: &OperationInput) -> bool {
    !matches!(input, OperationInput::Inference(request)
        if request.request().messages.first().is_some_and(|message|
            message.role == Role::System
                && (message.provenance.source == "approval-review"
                    || message.id.as_str() == "compaction/instructions")))
}

#[derive(Clone)]
pub(crate) enum LiveUpdate {
    Text(LiveText),
    Activity(LiveActivity),
    Compaction(LiveCompaction),
    HostedSearch {
        session: SessionId,
        turn: TurnId,
        message: MessageId,
        status: SearchStatus,
        action: Option<SearchAction>,
        settled: bool,
    },
    Lifecycle(Lifecycle),
    Processes(LiveProcesses),
}

/// Transcript presentation of one compaction, independent of turn settlement.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompactionItem {
    pub id: String,
    pub status: CompactionActivityStatus,
    pub automatic: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity_order: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

impl CompactionItem {
    pub(crate) fn standalone(turn: &TurnId, status: CompactionActivityStatus) -> Self {
        Self {
            id: format!("context-compaction/{turn}"),
            status,
            automatic: super::compaction::is_automatic_turn(turn),
            started_at_ms: None,
            finished_at_ms: None,
            activity_order: None,
            summary: None,
        }
    }
}

#[derive(Clone)]
pub(crate) struct LiveCompaction {
    pub session: SessionId,
    pub turn: TurnId,
    pub item: CompactionItem,
}

pub(super) fn publish_compaction(
    sender: &broadcast::Sender<LiveUpdate>,
    binding: &TurnBinding,
    item: CompactionItem,
) {
    let _ = sender.send(LiveUpdate::Compaction(LiveCompaction {
        session: binding.session.clone(),
        turn: binding.turn.clone(),
        item,
    }));
}

pub(super) fn compaction_items(
    state: &TurnState,
    mut position: impl FnMut(&str) -> Option<u64>,
) -> Vec<CompactionItem> {
    compaction::inline_compaction_activity(state)
        .into_iter()
        .map(|item| {
            let id = item.id(&state.binding().turn);
            let activity_order = position(&id);
            CompactionItem {
                id,
                status: item.status,
                automatic: true,
                started_at_ms: item.started_at_ms,
                finished_at_ms: item.finished_at_ms,
                activity_order,
                summary: None,
            }
        })
        .collect()
}

/// A chat's complete process list after it changed.
#[derive(Clone)]
pub(crate) struct LiveProcesses {
    pub session: SessionId,
    pub processes: Vec<crate::processes::ProcessEntry>,
}

/// A tool call requested by the current turn. `status` is set once the
/// call's recorded result is part of the turn's history.
#[derive(Clone)]
pub(crate) struct LiveActivity {
    pub session: SessionId,
    pub turn: TurnId,
    pub message: MessageId,
    pub call: ToolCall,
    /// The call's result once it has one.
    pub result: Option<Box<ToolResult>>,
}

#[derive(Clone)]
pub(crate) struct Lifecycle {
    pub session: SessionId,
    pub turn: TurnId,
    pub fact: LifecycleFact,
}

#[derive(Clone)]
pub(crate) enum LifecycleFact {
    Settled(OutcomeStatus),
    AutomaticCompactionSettled(OutcomeStatus),
    ApprovalRequired(WaitId),
    QuestionAsked(WaitId),
}

pub(super) fn publish_lifecycle(
    sender: &broadcast::Sender<LiveUpdate>,
    session: &SessionId,
    turn: &TurnId,
    result: &RunResult,
    automatic_compaction: bool,
) {
    if sender.receiver_count() == 0 {
        return;
    }
    let fact = match result {
        RunResult::Settled(outcome) if automatic_compaction => {
            LifecycleFact::AutomaticCompactionSettled(outcome.status)
        }
        RunResult::Settled(outcome) => LifecycleFact::Settled(outcome.status),
        RunResult::InputRequired(pending) => {
            let Some(approval) = pending.approvals.first() else {
                return;
            };
            LifecycleFact::ApprovalRequired(approval.wait_id.clone())
        }
        RunResult::Suspended => return,
    };
    let _ = sender.send(LiveUpdate::Lifecycle(Lifecycle {
        session: session.clone(),
        turn: turn.clone(),
        fact,
    }));
}

#[derive(Clone)]
pub(crate) enum LiveTextKind {
    Assistant(Vec<UrlCitation>),
    QuestionReply(Vec<QuestionReply>),
}

#[derive(Clone)]
pub(crate) struct LiveText {
    pub session: SessionId,
    pub turn: TurnId,
    pub message: MessageId,
    pub offset: usize,
    pub replace: bool,
    pub text: Arc<str>,
    pub kind: LiveTextKind,
}

pub(super) struct Publisher {
    sender: broadcast::Sender<LiveUpdate>,
    binding: TurnBinding,
    offsets: BTreeMap<MessageId, usize>,
    calls: BTreeMap<ToolCallId, (MessageId, ToolCall)>,
    finished: BTreeSet<ToolCallId>,
    announced_questions: BTreeSet<WaitId>,
    compaction_status: BTreeMap<String, CompactionActivityStatus>,
    compaction_checkpoint: Option<Envelope>,
    compaction_admitted: bool,
}

fn admits_compaction(state: &TurnState) -> bool {
    state.controls().admits_work() && !state.is_suspended() && state.outcome().is_none()
}

impl Publisher {
    pub(super) fn new(sender: broadcast::Sender<LiveUpdate>, state: &TurnState) -> Self {
        Self {
            sender,
            binding: state.binding().clone(),
            offsets: BTreeMap::new(),
            calls: BTreeMap::new(),
            finished: BTreeSet::new(),
            compaction_checkpoint: state.checkpoint().cloned(),
            compaction_admitted: admits_compaction(state),
            compaction_status: compaction::inline_compaction_activity(state)
                .into_iter()
                .map(|item| (item.id(&state.binding().turn), item.status))
                .collect(),
            // A resumed worker can inherit unanswered questions. Those are
            // visible in its snapshot and have no new registration to announce.
            announced_questions: state
                .waits()
                .values()
                .filter(|wait| wait.is_pending() && super::questions::is_question(wait))
                .map(|wait| wait.id.clone())
                .collect(),
        }
    }

    pub(super) fn compactions(
        &mut self,
        state: &TurnState,
        ordering: &super::activity_order::State,
    ) {
        let admitted = admits_compaction(state);
        let checkpoint = state.checkpoint();
        if self.compaction_checkpoint.as_ref() == checkpoint && self.compaction_admitted == admitted
        {
            return;
        }
        self.compaction_checkpoint = checkpoint.cloned();
        self.compaction_admitted = admitted;
        let items = compaction_items(state, |_| None);
        let latest_success = items
            .iter()
            .rposition(|item| item.status == CompactionActivityStatus::Succeeded);
        for (index, mut item) in items.into_iter().enumerate() {
            if self.compaction_status.insert(item.id.clone(), item.status) != Some(item.status) {
                item.activity_order =
                    ordering.record_event(&self.binding.session, &self.binding.turn, &item.id);
                if Some(index) == latest_success {
                    item.summary = compaction::inline_summary(state);
                }
                publish_compaction(&self.sender, &self.binding, item);
            }
        }
    }

    pub(super) fn update(&mut self, update: &TurnUpdate) {
        match update {
            TurnUpdate::Inference {
                update: InferenceUpdate::TextDelta { message, text },
                ..
            } => {
                let offset = self.offsets.entry(message.clone()).or_default();
                let start = *offset;
                *offset += text.len();
                self.publish(message, start, false, text, Vec::new());
            }
            TurnUpdate::Inference {
                update:
                    InferenceUpdate::ProviderEvidence {
                        message,
                        evidence: ProviderEvidence::WebSearch { status, action },
                    },
                ..
            } => {
                self.hosted(message, *status, action.clone(), false);
            }
            TurnUpdate::Operation {
                outcome: OperationOutcome::Inference(outcome),
                ..
            } => {
                for message in &outcome.messages {
                    if message.role != Role::Assistant {
                        continue;
                    }
                    self.offsets.remove(&message.id);
                    let text: String = message
                        .content
                        .iter()
                        .filter_map(|item| match item {
                            Content::Text(text) => Some(text.as_str()),
                            _ => None,
                        })
                        .collect();
                    if !text.is_empty() {
                        let citations = message
                            .content
                            .iter()
                            .filter_map(|part| match part {
                                Content::ProviderEvidence(ProviderEvidence::UrlCitation(
                                    citation,
                                )) => Some(citation.clone()),
                                _ => None,
                            })
                            .collect();
                        self.publish(&message.id, 0, true, &text, citations);
                    }
                    for item in &message.content {
                        if let Content::ProviderEvidence(ProviderEvidence::WebSearch {
                            status,
                            action,
                        }) = item
                        {
                            self.hosted(&message.id, *status, action.clone(), true);
                        }
                        if let Content::ToolCall(call) = item
                            && !self.calls.contains_key(&call.id)
                        {
                            self.calls
                                .insert(call.id.clone(), (message.id.clone(), call.clone()));
                            self.activity(&message.id, call, None);
                        }
                    }
                }
            }
            TurnUpdate::Snapshot(view) => {
                for wait in view.state.waits().values() {
                    if wait.is_pending()
                        && super::questions::is_question(wait)
                        && self.announced_questions.insert(wait.id.clone())
                    {
                        let _ = self.sender.send(LiveUpdate::Lifecycle(Lifecycle {
                            session: self.binding.session.clone(),
                            turn: self.binding.turn.clone(),
                            fact: LifecycleFact::QuestionAsked(wait.id.clone()),
                        }));
                    }
                }
                for HistoryRecord::Message(message) in view.state.history().records() {
                    if message.role != Role::Tool {
                        continue;
                    }
                    for item in &message.content {
                        let Content::ToolResult(result) = item else {
                            continue;
                        };
                        if self.finished.contains(&result.call) {
                            continue;
                        }
                        let Some((owner, call)) = self.calls.get(&result.call) else {
                            continue;
                        };
                        self.activity(owner, call, Some(Box::new(result.clone())));
                        self.finished.insert(result.call.clone());
                    }
                }
            }
            _ => {}
        }
    }

    fn hosted(
        &self,
        message: &MessageId,
        status: SearchStatus,
        action: Option<SearchAction>,
        settled: bool,
    ) {
        let _ = self.sender.send(LiveUpdate::HostedSearch {
            session: self.binding.session.clone(),
            turn: self.binding.turn.clone(),
            message: message.clone(),
            status,
            action,
            settled,
        });
    }

    fn activity(&self, message: &MessageId, call: &ToolCall, result: Option<Box<ToolResult>>) {
        if self.sender.receiver_count() == 0 {
            return;
        }
        let _ = self.sender.send(LiveUpdate::Activity(LiveActivity {
            session: self.binding.session.clone(),
            turn: self.binding.turn.clone(),
            message: message.clone(),
            call: call.clone(),
            result,
        }));
    }

    fn publish(
        &self,
        message: &MessageId,
        offset: usize,
        replace: bool,
        text: &str,
        citations: Vec<UrlCitation>,
    ) {
        if self.sender.receiver_count() == 0 || text.is_empty() {
            return;
        }
        let _ = self.sender.send(LiveUpdate::Text(LiveText {
            session: self.binding.session.clone(),
            turn: self.binding.turn.clone(),
            message: message.clone(),
            offset,
            replace,
            text: Arc::from(text),
            kind: LiveTextKind::Assistant(citations),
        }));
    }
}
