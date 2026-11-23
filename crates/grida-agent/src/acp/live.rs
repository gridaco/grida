//! GRIDA-SEC-004 — detached observation for already attached sessions.

use super::projection::{Outcome, activity_update, question_replies_metadata};
use super::{ConnectionSessions, Delivery};
use crate::host::live::{LifecycleFact, LiveTextKind, LiveUpdate};
use crate::processes::ProcessSessions;
use agent_client_protocol::v1::ConnectionTo;
use agent_client_protocol::v1::schema::{ContentChunk, SessionNotification, SessionUpdate};
use agent_client_protocol::{Client, Result};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast::{Receiver, error::RecvError};

pub(super) const CAPABILITY: &str = "co.grida/session/updates";
pub(super) const LIFECYCLE: &str = "co.grida/session/lifecycle";
const CHUNK_BYTES: usize = 8 * 1024;

#[allow(clippy::too_many_arguments)]
pub(super) async fn forward(
    connection: ConnectionTo<Client>,
    delivery: Arc<Delivery>,
    sessions: Arc<Mutex<ConnectionSessions>>,
    mut updates: Receiver<LiveUpdate>,
    text_enabled: bool,
    lifecycle_enabled: bool,
    processes: Option<Arc<ProcessSessions>>,
    ordering: Arc<crate::host::activity_order::State>,
) -> Result<()> {
    let stream = async {
        loop {
            match updates.recv().await {
                Ok(LiveUpdate::Text(update)) => {
                    if !text_enabled {
                        continue;
                    }
                    let visible = {
                        let state = sessions.lock().unwrap();
                        state.can_deliver(&update.session)
                            && (!matches!(&update.kind, LiveTextKind::QuestionReply(_))
                                || state
                                    .negotiated
                                    .contains(super::extensions::QUESTION_BATCH_LIST))
                    };
                    if !visible {
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
                        let mut metadata = json!({
                            "turnId": update.turn,
                            "offsetBytes": offset,
                            "replace": replace,
                        });
                        let event = match &update.kind {
                            LiveTextKind::Assistant(citations) => {
                                if replace && !citations.is_empty() {
                                    metadata["citations"] =
                                        super::projection::citation_metadata(citations);
                                }
                                SessionUpdate::AgentMessageChunk(chunk)
                            }
                            LiveTextKind::QuestionReply(replies) => {
                                if replace {
                                    metadata["questionReplies"] =
                                        question_replies_metadata(replies);
                                }
                                SessionUpdate::UserMessageChunk(chunk)
                            }
                        };
                        if sessions
                            .lock()
                            .unwrap()
                            .negotiated
                            .contains(super::projection::ACTIVITY_ORDER)
                        {
                            metadata.as_object_mut().unwrap().extend(
                                crate::host::activity_order::metadata(ordering.message(
                                    &update.session,
                                    &update.turn,
                                    &update.message,
                                ))
                                .as_object()
                                .unwrap()
                                .clone(),
                            );
                        }
                        send_update(
                            &connection,
                            &delivery,
                            &sessions,
                            &update.session,
                            event,
                            CAPABILITY,
                            metadata,
                        )
                        .await?;
                        offset += end;
                        replace = false;
                        text = remaining;
                    }
                }
                Ok(LiveUpdate::HostedSearch {
                    session,
                    turn,
                    message,
                    status,
                    action,
                    settled,
                }) => {
                    if !text_enabled || !sessions.lock().unwrap().can_deliver(&session) {
                        continue;
                    }
                    let (update, mut metadata) = super::projection::hosted_activity(
                        &message,
                        status,
                        action.as_ref(),
                        settled,
                        json!({"turnId":turn}),
                    );
                    if sessions
                        .lock()
                        .unwrap()
                        .negotiated
                        .contains(super::projection::ACTIVITY_ORDER)
                    {
                        metadata.as_object_mut().unwrap().extend(
                            crate::host::activity_order::metadata(
                                ordering.message(&session, &turn, &message),
                            )
                            .as_object()
                            .unwrap()
                            .clone(),
                        );
                    }
                    send_update(
                        &connection,
                        &delivery,
                        &sessions,
                        &session,
                        update,
                        CAPABILITY,
                        metadata,
                    )
                    .await?;
                }
                Ok(LiveUpdate::Activity(update)) => {
                    if !text_enabled || !sessions.lock().unwrap().can_deliver(&update.session) {
                        continue;
                    }
                    let outcome = update
                        .result
                        .as_ref()
                        .map_or(Outcome::Running, |result| Outcome::Finished(result.status));
                    let (notification, mut metadata) = activity_update(
                        &update.message,
                        &update.call,
                        outcome,
                        update.result.as_deref(),
                        json!({"turnId": update.turn}),
                        sessions
                            .lock()
                            .unwrap()
                            .negotiated
                            .contains(super::extensions::tool_images::CAPABILITY)
                            .then_some(&update.session),
                    );
                    if sessions
                        .lock()
                        .unwrap()
                        .negotiated
                        .contains(super::projection::ACTIVITY_ORDER)
                    {
                        metadata.as_object_mut().unwrap().extend(
                            crate::host::activity_order::metadata(ordering.call(
                                &update.session,
                                &update.turn,
                                &update.call.id,
                            ))
                            .as_object()
                            .unwrap()
                            .clone(),
                        );
                    }
                    send_update(
                        &connection,
                        &delivery,
                        &sessions,
                        &update.session,
                        notification,
                        CAPABILITY,
                        metadata,
                    )
                    .await?;
                }
                Ok(LiveUpdate::Lifecycle(update)) => {
                    if !lifecycle_enabled {
                        continue;
                    }
                    let metadata = match update.fact {
                        LifecycleFact::Settled(status) => {
                            json!({"kind": "settled", "turnId": update.turn, "status": status})
                        }
                        LifecycleFact::AutomaticCompactionSettled(status) => {
                            json!({"kind": "automatic_compaction_settled", "turnId": update.turn, "status": status})
                        }
                        LifecycleFact::ApprovalRequired(wait) => {
                            json!({"kind": "approval_required", "turnId": update.turn, "waitId": wait})
                        }
                        LifecycleFact::QuestionAsked(wait) => {
                            json!({"kind": "question_asked", "turnId": update.turn, "waitId": wait})
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
                Ok(LiveUpdate::Processes(update)) => {
                    if processes.is_none() {
                        continue;
                    }
                    send(
                        &connection,
                        &delivery,
                        &sessions,
                        &update.session,
                        ContentChunk::new("".to_owned().into()),
                        super::extensions::PROCESSES,
                        json!({"processes": update.processes}),
                    )
                    .await?;
                }
                Err(RecvError::Lagged(_)) => {
                    let attached = sessions.lock().unwrap().attached.clone();
                    if let Some(processes) = &processes {
                        // A missed change is replaced by the current list.
                        for session in &attached {
                            send(
                                &connection,
                                &delivery,
                                &sessions,
                                session,
                                ContentChunk::new("".to_owned().into()),
                                super::extensions::PROCESSES,
                                json!({"processes": processes.list(session)}),
                            )
                            .await?;
                        }
                    }
                    if !text_enabled {
                        continue;
                    }
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
    send_update(
        connection,
        delivery,
        sessions,
        session,
        SessionUpdate::AgentMessageChunk(chunk),
        capability,
        metadata,
    )
    .await
}

async fn send_update(
    connection: &ConnectionTo<Client>,
    delivery: &Delivery,
    sessions: &Mutex<ConnectionSessions>,
    session: &agent_kit_core::SessionId,
    update: SessionUpdate,
    capability: &'static str,
    metadata: Value,
) -> Result<()> {
    delivery
        .send_if(|| {
            let state = sessions.lock().unwrap();
            if !state.can_deliver(session) {
                return Ok(false);
            }
            let mut meta = [(capability.into(), metadata.clone())]
                .into_iter()
                .collect::<agent_client_protocol::v1::schema::Meta>();
            if metadata.get("activityOrder").is_some()
                || metadata.get("activityOrderIncomplete").is_some()
            {
                meta.insert(super::projection::ACTIVITY_ORDER.into(), metadata);
            }
            connection.send_notification(
                SessionNotification::new(session.as_str().to_owned(), update.clone()).meta(meta),
            )?;
            Ok(true)
        })
        .await
}
