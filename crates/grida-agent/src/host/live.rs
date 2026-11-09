//! Read-only text from turns owned independently of an ACP prompt request.

use agent_kit_core::inference::InferenceUpdate;
use agent_kit_core::messages::{Content, Role};
use agent_kit_core::turn::{OperationOutcome, TurnBinding};
use agent_kit_core::{MessageId, SessionId, TurnId};
use agent_kit_runtime::TurnUpdate;
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::broadcast;

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
    sender: broadcast::Sender<LiveText>,
    binding: TurnBinding,
    offsets: BTreeMap<MessageId, usize>,
}

impl Publisher {
    pub(super) fn new(sender: broadcast::Sender<LiveText>, binding: TurnBinding) -> Self {
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
        let _ = self.sender.send(LiveText {
            session: self.binding.session.clone(),
            turn: self.binding.turn.clone(),
            message: message.clone(),
            offset,
            replace,
            text: Arc::from(text),
        });
    }
}
