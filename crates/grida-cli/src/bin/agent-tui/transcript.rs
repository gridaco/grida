//! Render live and replayed messages in the same transcript by protocol identity.

use crate::protocol::{COMPACTION, LIVE, WINDOW};
use agent_client_protocol::v1::schema::{ContentBlock, SessionNotification, SessionUpdate};
use serde_json::Value;
use std::collections::BTreeSet;

const MAX_BUFFERED_EVENTS: usize = 1024;

#[derive(Default)]
pub struct Transcript {
    turns: Vec<Turn>,
    replay: Option<Replay>,
}

#[derive(Clone, Default)]
struct Turn {
    id: Option<String>,
    items: Vec<Item>,
}

#[derive(Clone)]
struct Item {
    id: String,
    order: Option<u64>,
    body: Body,
}

#[derive(Clone)]
enum Body {
    Message { by_user: bool, text: String },
    Compaction(String),
}

struct Replay {
    id: String,
    observations: Vec<Observation>,
    live: Vec<Observation>,
    interrupted: bool,
}

#[derive(Clone)]
enum Observation {
    Text {
        turn: Option<String>,
        id: String,
        by_user: bool,
        order: Option<u64>,
        text: String,
        offset: Option<usize>,
        replace: bool,
    },
    Compaction {
        turn: String,
        id: String,
        order: Option<u64>,
        status: String,
    },
}

impl Transcript {
    pub fn begin(&mut self, request_id: String) {
        self.replay = Some(Replay {
            id: request_id,
            observations: Vec::new(),
            live: Vec::new(),
            interrupted: false,
        });
    }

    /// Returns true when the client needs a fresh transcript window.
    pub fn note(&mut self, notification: &SessionNotification) -> bool {
        let Some(meta) = notification.meta.as_ref() else {
            return false;
        };
        if let Some(window) = meta.get(WINDOW) {
            if let Some(replay) = self.replay.as_mut()
                && window["requestId"] == replay.id
                && let Some(event) = text(notification, window, false)
            {
                replay.observations.push(event);
            }
            return false;
        }
        let event = if let Some(live) = meta.get(LIVE) {
            if live["resyncRequired"] == true {
                if let Some(replay) = self.replay.as_mut() {
                    replay.interrupted = true;
                    return false;
                }
                return true;
            }
            text(notification, live, true)
        } else {
            meta.get(COMPACTION)
                .and_then(|entry| compaction(&entry["turnId"], &entry["item"]))
        };
        let Some(event) = event else {
            return false;
        };
        if let Some(replay) = self.replay.as_mut() {
            if replay.live.len() == MAX_BUFFERED_EVENTS {
                replay.interrupted = true;
            } else {
                replay.live.push(event.clone());
            }
            // Also display live updates immediately while reading the window.
            self.apply(Some(event), false);
            false
        } else {
            self.apply(Some(event), false)
        }
    }

    pub fn finish(&mut self, response: &Value) -> bool {
        let Some(replay) = self.replay.take() else {
            return false;
        };
        if response["requestId"] != replay.id {
            return true;
        }
        let mut result = Self::default();
        if replay
            .observations
            .iter()
            .any(|event| matches!(event, Observation::Text { turn: None, .. }))
        {
            result.turn(None);
        }
        let mut settled = BTreeSet::new();
        let mut active = BTreeSet::new();
        if let Some(turns) = response["turns"].as_array() {
            for turn in turns {
                let Some(id) = turn["turnId"].as_str() else {
                    continue;
                };
                result.turn(Some(id.to_owned()));
                if turn["status"].is_null() {
                    active.insert(id);
                } else {
                    settled.insert(id);
                }
                if let Some(items) = turn["compactions"].as_array() {
                    for item in items {
                        result.apply(compaction(&turn["turnId"], item), false);
                    }
                }
            }
        }
        for event in replay.observations {
            result.apply(Some(event), false);
        }
        // The window may not contain an in-flight stream that was already
        // visible before the request. Retain only the known active turn's
        // newer compatible text and activity.
        for prior in &self.turns {
            if prior.id.as_deref().is_some_and(|id| active.contains(id)) {
                result.turn(prior.id.clone()).merge_active(prior);
            }
        }
        let mut stale = replay.interrupted;
        for event in replay.live {
            if !event.turn_id().is_some_and(|id| settled.contains(id)) {
                stale |= result.apply(Some(event), true);
            }
        }
        self.turns = result.turns;
        stale
    }

    pub fn abort_replay(&mut self) {
        self.replay = None;
    }

    pub fn lines(&self) -> Vec<String> {
        self.turns
            .iter()
            .flat_map(|turn| {
                let mut items: Vec<_> = turn.items.iter().collect();
                items.sort_by_key(|item| item.order.unwrap_or(u64::MAX));
                items.into_iter().flat_map(|item| match &item.body {
                    Body::Message { by_user, text } => {
                        let (prefix, text) = if *by_user {
                            ("You:", crate::file_picker::project_paths(text))
                        } else {
                            ("Agent:", std::borrow::Cow::Borrowed(text.as_str()))
                        };
                        format!("{prefix} {text}")
                            .lines()
                            .map(str::to_owned)
                            .collect::<Vec<_>>()
                    }
                    Body::Compaction(status) => {
                        vec![
                            match status.as_str() {
                                "running" => "Context compacting…",
                                "succeeded" => "Context compacted",
                                "failed" => "Context compaction failed",
                                _ => "Context compaction",
                            }
                            .into(),
                        ]
                    }
                })
            })
            .collect()
    }

    fn turn(&mut self, id: Option<String>) -> &mut Turn {
        let index = if let Some(index) = self.turns.iter().position(|turn| turn.id == id) {
            index
        } else {
            self.turns.push(Turn {
                id,
                items: Vec::new(),
            });
            self.turns.len() - 1
        };
        &mut self.turns[index]
    }

    fn apply(&mut self, event: Option<Observation>, merging: bool) -> bool {
        let Some(event) = event else {
            return false;
        };
        match event {
            Observation::Text {
                turn,
                id,
                by_user,
                order,
                text,
                offset,
                replace,
            } => {
                let item = self.turn(turn).item(id, order, || Body::Message {
                    by_user,
                    text: String::new(),
                });
                let Body::Message { text: current, .. } = &mut item.body else {
                    return true;
                };
                let offset = offset.unwrap_or(current.len());
                if replace {
                    if offset != 0 {
                        return true;
                    }
                    if !merging || !current.starts_with(&text) {
                        *current = text;
                    }
                    return false;
                }
                let Some(overlap) = current.get(offset..) else {
                    return true;
                };
                if let Some(suffix) = text.strip_prefix(overlap) {
                    current.push_str(suffix);
                    false
                } else {
                    !overlap.starts_with(&text)
                }
            }
            Observation::Compaction {
                turn,
                id,
                order,
                status,
            } => {
                let item = self
                    .turn(Some(turn))
                    .item(id, order, || Body::Compaction(status.clone()));
                if let Body::Compaction(current) = &mut item.body
                    && (*current == "running" || status != "running")
                {
                    *current = status;
                }
                false
            }
        }
    }
}

impl Turn {
    fn merge_active(&mut self, prior: &Self) {
        for item in &prior.items {
            let Some(current) = self.items.iter_mut().find(|current| current.id == item.id) else {
                self.items.push(item.clone());
                continue;
            };
            match (&mut current.body, &item.body) {
                (Body::Message { text: current, .. }, Body::Message { text: prior, .. })
                    if prior.starts_with(current.as_str()) =>
                {
                    current.clone_from(prior)
                }
                (Body::Compaction(current), Body::Compaction(prior)) if current == "running" => {
                    current.clone_from(prior);
                }
                _ => {}
            }
        }
    }

    fn item(&mut self, id: String, order: Option<u64>, body: impl FnOnce() -> Body) -> &mut Item {
        let index = if let Some(index) = self.items.iter().position(|item| item.id == id) {
            index
        } else {
            self.items.push(Item {
                id,
                order,
                body: body(),
            });
            self.items.len() - 1
        };
        self.items[index].order = self.items[index].order.or(order);
        &mut self.items[index]
    }
}

impl Observation {
    fn turn_id(&self) -> Option<&str> {
        match self {
            Self::Text { turn, .. } => turn.as_deref(),
            Self::Compaction { turn, .. } => Some(turn),
        }
    }
}

fn text(notification: &SessionNotification, meta: &Value, live: bool) -> Option<Observation> {
    let (chunk, by_user) = match &notification.update {
        SessionUpdate::UserMessageChunk(chunk) => (chunk, true),
        SessionUpdate::AgentMessageChunk(chunk) => (chunk, false),
        _ => return None,
    };
    let ContentBlock::Text(content) = &chunk.content else {
        return None;
    };
    Some(Observation::Text {
        turn: meta["turnId"].as_str().map(str::to_owned),
        id: chunk.message_id.as_ref()?.to_string(),
        by_user,
        order: meta["activityOrder"].as_u64(),
        text: content.text.clone(),
        offset: if live {
            Some(meta["offsetBytes"].as_u64()?.try_into().ok()?)
        } else {
            None
        },
        replace: live && meta["replace"] == true,
    })
}

fn compaction(turn: &Value, item: &Value) -> Option<Observation> {
    Some(Observation::Compaction {
        turn: turn.as_str()?.to_owned(),
        id: item["id"].as_str()?.to_owned(),
        order: item["activityOrder"].as_u64(),
        status: item["status"].as_str()?.to_owned(),
    })
}
