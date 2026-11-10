//! A connection-local presentation of the host's authorized transcript.

use super::transport::Delivery;
use super::unavailable;
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::{
    ContentChunk, SessionId, SessionNotification, SessionUpdate,
};
use agent_client_protocol::{Client, Result};
use agent_kit_core::MessageId;
use agent_kit_core::inference::InferenceUpdate;
use agent_kit_core::messages::{Content, Message, Role};
use agent_kit_core::turn::OperationOutcome;
use agent_kit_runtime::TurnUpdate;
use std::collections::BTreeMap;

const MAX_CHUNK_BYTES: usize = 8 * 1024;

pub(super) struct Projection {
    session: SessionId,
    // Compare live deltas with the recorded message before filling in any
    // unstreamed suffix. A disagreement cannot be represented as an append.
    streamed_text: BTreeMap<MessageId, String>,
}

impl Projection {
    pub(super) fn new(session: SessionId) -> Self {
        Self {
            session,
            streamed_text: BTreeMap::new(),
        }
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
        let text: String = message
            .content
            .into_iter()
            .filter_map(|content| match content {
                Content::Text(text) => Some(text),
                Content::Media(media) if crate::host::is_retained_image(&media) => {
                    Some(crate::host::RETAINED_IMAGE_LABEL.to_owned())
                }
                Content::Media(media) => grida_agent_master::retained_file::display(&media),
                _ => None,
            })
            .collect();
        let suffix = if let Some(prefix) = self.streamed_text.remove(&message.id) {
            text.strip_prefix(&prefix)
                .ok_or_else(|| unavailable("session_message_projection_conflict"))?
        } else {
            &text
        };
        self.chunk(connection, delivery, message.role, &message.id, suffix)
            .await
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
            delivery
                .send(
                    connection,
                    SessionNotification::new(self.session.clone(), update),
                )
                .await?;
            text = remaining;
        }
        Ok(())
    }
}
