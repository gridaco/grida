//! GRIDA-SEC-004 — detached observation for already attached sessions.

use super::{ConnectionSessions, Delivery};
use crate::host::live::{LifecycleFact, LiveUpdate};
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::{ContentChunk, SessionNotification, SessionUpdate};
use agent_client_protocol::{Client, Result};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast::{Receiver, error::RecvError};

pub(super) const CAPABILITY: &str = "co.grida/session/updates";
pub(super) const LIFECYCLE: &str = "co.grida/session/lifecycle";
const CHUNK_BYTES: usize = 8 * 1024;

pub(super) async fn forward(
    connection: ConnectionTo<Client>,
    delivery: Arc<Delivery>,
    sessions: Arc<Mutex<ConnectionSessions>>,
    mut updates: Receiver<LiveUpdate>,
    text_enabled: bool,
    lifecycle_enabled: bool,
) -> Result<()> {
    let stream = async {
        loop {
            match updates.recv().await {
                Ok(LiveUpdate::Text(update)) => {
                    if !text_enabled || !sessions.lock().unwrap().can_deliver(&update.session) {
                        continue;
                    }
                    let mut offset = update.offset;
                    let mut replace = update.replace;
                    let mut text = update.text.as_ref();
                    while !text.is_empty() {
                        let end = text.floor_char_boundary(text.len().min(CHUNK_BYTES));
                        let (part, remaining) = text.split_at(end);
                        let chunk = ContentChunk::new(part.to_owned().into())
                            .message_id(update.message.as_str());
                        let metadata = json!({
                            "turnId": update.turn,
                            "offsetBytes": offset,
                            "replace": replace,
                        });
                        send(
                            &connection,
                            &delivery,
                            &sessions,
                            &update.session,
                            chunk,
                            CAPABILITY,
                            metadata,
                        )
                        .await?;
                        offset += end;
                        replace = false;
                        text = remaining;
                    }
                }
                Ok(LiveUpdate::Lifecycle(update)) => {
                    if !lifecycle_enabled {
                        continue;
                    }
                    let metadata = match update.fact {
                        LifecycleFact::Settled(status) => {
                            json!({"kind": "settled", "turnId": update.turn, "status": status})
                        }
                        LifecycleFact::ApprovalRequired(wait) => {
                            json!({"kind": "approval_required", "turnId": update.turn, "waitId": wait})
                        }
                    };
                    send(
                        &connection,
                        &delivery,
                        &sessions,
                        &update.session,
                        ContentChunk::new("".to_owned().into()),
                        LIFECYCLE,
                        metadata,
                    )
                    .await?;
                }
                Err(RecvError::Lagged(_)) => {
                    if !text_enabled {
                        continue;
                    }
                    let attached = sessions.lock().unwrap().attached.clone();
                    for session in attached {
                        send(
                            &connection,
                            &delivery,
                            &sessions,
                            &session,
                            ContentChunk::new("".to_owned().into()),
                            CAPABILITY,
                            json!({"resyncRequired": true}),
                        )
                        .await?;
                    }
                }
                Err(RecvError::Closed) => return Ok(()),
            }
        }
    };
    tokio::select! {
        _ = connection.incoming_closed() => Ok(()),
        result = stream => result,
    }
}

async fn send(
    connection: &ConnectionTo<Client>,
    delivery: &Delivery,
    sessions: &Mutex<ConnectionSessions>,
    session: &agent_kit_core::SessionId,
    chunk: ContentChunk,
    capability: &'static str,
    metadata: Value,
) -> Result<()> {
    delivery
        .send_if(|| {
            let state = sessions.lock().unwrap();
            if !state.can_deliver(session) {
                return Ok(false);
            }
            connection.send_notification(
                SessionNotification::new(
                    session.as_str().to_owned(),
                    SessionUpdate::AgentMessageChunk(chunk),
                )
                .meta(
                    [(capability.into(), metadata)]
                        .into_iter()
                        .collect::<agent_client_protocol::v1::schema::Meta>(),
                ),
            )?;
            Ok(true)
        })
        .await
}
