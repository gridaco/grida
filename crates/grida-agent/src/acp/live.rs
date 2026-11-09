//! GRIDA-SEC-004 — detached text observation for already attached sessions.

use super::{ConnectionSessions, Delivery};
use crate::host::live::LiveText;
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::{ContentChunk, SessionNotification, SessionUpdate};
use agent_client_protocol::{Client, Result};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast::{Receiver, error::RecvError};

pub(super) const CAPABILITY: &str = "co.grida/session/updates";
const CHUNK_BYTES: usize = 8 * 1024;

pub(super) async fn forward(
    connection: ConnectionTo<Client>,
    delivery: Arc<Delivery>,
    sessions: Arc<Mutex<ConnectionSessions>>,
    mut updates: Receiver<LiveText>,
) -> Result<()> {
    let stream = async {
        loop {
            match updates.recv().await {
                Ok(update) => {
                    if !sessions.lock().unwrap().attached.contains(&update.session) {
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
                            update.session.as_str(),
                            chunk,
                            metadata,
                        )
                        .await?;
                        offset += end;
                        replace = false;
                        text = remaining;
                    }
                }
                Err(RecvError::Lagged(_)) => {
                    let attached = sessions.lock().unwrap().attached.clone();
                    for session in attached {
                        send(
                            &connection,
                            &delivery,
                            session.as_str(),
                            ContentChunk::new("".to_owned().into()),
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
    session: &str,
    chunk: ContentChunk,
    metadata: Value,
) -> Result<()> {
    delivery
        .send(
            connection,
            SessionNotification::new(session.to_owned(), SessionUpdate::AgentMessageChunk(chunk))
                .meta(
                    [(CAPABILITY.into(), metadata)]
                        .into_iter()
                        .collect::<agent_client_protocol::v1::schema::Meta>(),
                ),
        )
        .await
}
