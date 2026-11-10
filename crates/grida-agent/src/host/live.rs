//! Read-only updates from turns owned independently of an ACP prompt request.

use super::RunResult;
use agent_kit_core::inference::InferenceUpdate;
use agent_kit_core::messages::{Content, OutcomeStatus, Role};
use agent_kit_core::turn::{OperationOutcome, TurnBinding};
use agent_kit_core::{MessageId, SessionId, TurnId, WaitId};
use agent_kit_runtime::TurnUpdate;
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub(crate) enum LiveUpdate {
    Text(LiveText),
    Lifecycle(Lifecycle),
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
}

impl Publisher {
    pub(super) fn new(sender: broadcast::Sender<LiveUpdate>, binding: TurnBinding) -> Self {
        Self {
            sender,
            binding,
            offsets: BTreeMap::new(),
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
                }
            }
            _ => {}
        }
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
