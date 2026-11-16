//! Read-only updates from turns owned independently of an ACP prompt request.

use super::RunResult;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::InferenceUpdate;
use agent_kit_core::messages::{Content, OutcomeStatus, Role, ToolCall, ToolResult};
use agent_kit_core::turn::{OperationOutcome, TurnBinding};
use agent_kit_core::{MessageId, SessionId, ToolCallId, TurnId, WaitId};
use agent_kit_runtime::TurnUpdate;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub(crate) enum LiveUpdate {
    Text(LiveText),
    Activity(LiveActivity),
    Lifecycle(Lifecycle),
    Processes(LiveProcesses),
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
    ApprovalRequired(WaitId),
}

pub(super) fn publish_lifecycle(
    sender: &broadcast::Sender<LiveUpdate>,
    session: &SessionId,
    turn: &TurnId,
    result: &RunResult,
) {
    if sender.receiver_count() == 0 {
        return;
    }
    let fact = match result {
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
pub(crate) struct LiveText {
    pub session: SessionId,
    pub turn: TurnId,
    pub message: MessageId,
    pub offset: usize,
    pub replace: bool,
    pub text: Arc<str>,
}

pub(super) struct Publisher {
    sender: broadcast::Sender<LiveUpdate>,
    binding: TurnBinding,
    offsets: BTreeMap<MessageId, usize>,
    calls: BTreeMap<ToolCallId, (MessageId, ToolCall)>,
    finished: BTreeSet<ToolCallId>,
}

impl Publisher {
    pub(super) fn new(sender: broadcast::Sender<LiveUpdate>, binding: TurnBinding) -> Self {
        Self {
            sender,
            binding,
            offsets: BTreeMap::new(),
            calls: BTreeMap::new(),
            finished: BTreeSet::new(),
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
                self.publish(message, start, false, text);
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
                        self.publish(&message.id, 0, true, &text);
                    }
                    for item in &message.content {
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

    fn publish(&self, message: &MessageId, offset: usize, replace: bool, text: &str) {
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
        }));
    }
}
