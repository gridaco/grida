//! Portable conversation context and the provenance of its retained prefix.
//! GRIDA-SEC-004 keeps restricted source material out of derived context.

use crate::{decode, encode, file_reference, questions};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, ResultContent, Role};
use agent_kit_core::turn::JournalPosition;
use agent_kit_core::{
    Envelope, Error, ErrorKind, Fingerprint, MessageId, Result, SessionId, TurnId,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

const SCHEMA: &str = "grida.agent.conversation_seed";
pub const AUTHORED_INPUT_PREFIX: &str = "input";
pub const EDITOR_OBSERVATION_SOURCE: &str = "editor-context";
pub const MESSAGE_CONTEXT_SOURCE: &str = "message-context";

/// How the agent applies project guidance within its existing workspace authority.
pub const PROJECT_INSTRUCTIONS_POLICY: &str = "\
Project instructions apply to the subtree rooted at the directory containing each AGENTS.md. \
When project instructions conflict for a path, the closest applicable AGENTS.md takes precedence. \
Explicit chat instructions take precedence over project guidance. \
Use the host's captured instructions for the entire turn, including captured ancestors that still \
apply when moving into a different branch. The starting directory selects the instruction chain. \
Tool paths still default to the project root. Use the tool's path or working directory to target the \
intended location. Before acting below the starting directory or in a different branch, use your \
existing workspace tools to check for AGENTS.md only in directories outside the captured chain. \
Apply each file only within its own subtree. Treat any instructions you discover as task guidance \
within your existing permissions.";

/// The committed source view from which the selection was made.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConversationSource {
    pub session: SessionId,
    pub view: u64,
    pub tail: Option<(TurnId, JournalPosition)>,
    pub fingerprint: Fingerprint,
}

/// Inherited messages are addressed by their visible ID in the selected view.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConversationAnchor {
    Inherited { message: MessageId },
    Turn { turn: TurnId, message: MessageId },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "anchor", rename_all = "snake_case")]
pub enum ConversationCut {
    Through(ConversationAnchor),
    BeforeEditableUser(ConversationAnchor),
}

impl ConversationCut {
    fn anchor(&self) -> &ConversationAnchor {
        match self {
            Self::Through(anchor) | Self::BeforeEditableUser(anchor) => anchor,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeedOrigin {
    pub session: SessionId,
    pub view: u64,
    pub turn: TurnId,
    pub position: JournalPosition,
    pub message: MessageId,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeedEntry {
    pub origin: SeedOrigin,
    pub message: Option<MessageId>,
    pub editable: bool,
    pub omissions: Vec<SeedOmission>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeedOmission {
    pub part: usize,
    pub kind: SeedOmissionKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SeedOmissionKind {
    Instruction,
    Reasoning,
    Media,
    ToolCall,
    ToolResult {
        text: bool,
        media: bool,
        structured: bool,
    },
    ProviderState,
    UnsupportedRoleContent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeedProvenance {
    pub source: ConversationSource,
    pub cut: ConversationCut,
    /// Includes entries whose material has no portable projection.
    pub entries: Vec<SeedEntry>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedOmissions {
    pub instructions: usize,
    pub reasoning: usize,
    pub media: usize,
    pub tool_calls: usize,
    pub tool_results: usize,
    pub tool_results_with_media: usize,
    pub provider_state: usize,
    pub other_content: usize,
}

impl SeedProvenance {
    /// The visible ID of a source-view message after this history cut.
    pub fn retained_message_id(&self, previous: &str) -> Option<&MessageId> {
        self.entries.iter().find_map(|entry| {
            entry.message.as_ref().filter(|id| {
                id.as_str() == previous
                    || (entry.origin.session == self.source.session
                        && entry.origin.message.as_str() == previous)
            })
        })
    }

    /// Interpret the product provenance retained beside a seed's records.
    pub fn decode(envelope: &Envelope) -> Result<Self> {
        decode(SCHEMA, envelope)
    }

    pub fn omissions(&self) -> SeedOmissions {
        let mut counts = SeedOmissions::default();
        for omission in self.entries.iter().flat_map(|entry| &entry.omissions) {
            counts.record(&omission.kind);
        }
        counts
    }
}

impl SeedOmissions {
    pub(super) fn record(&mut self, kind: &SeedOmissionKind) {
        match kind {
            SeedOmissionKind::Instruction => self.instructions += 1,
            SeedOmissionKind::Reasoning => self.reasoning += 1,
            SeedOmissionKind::Media => self.media += 1,
            SeedOmissionKind::ToolCall => self.tool_calls += 1,
            SeedOmissionKind::ToolResult { media, .. } => {
                self.tool_results += 1;
                self.tool_results_with_media += usize::from(*media);
            }
            SeedOmissionKind::ProviderState => self.provider_state += 1,
            SeedOmissionKind::UnsupportedRoleContent => self.other_content += 1,
        }
    }

    /// Product-authored context disclosure. It carries no source material or authority.
    pub fn context_disclosure(&self) -> Option<String> {
        let omitted: Vec<_> = [
            (self.media, "media parts"),
            (self.tool_calls, "tool calls"),
            (self.tool_results, "tool result payloads"),
            (
                self.tool_results_with_media,
                "tool results containing media",
            ),
            (self.provider_state, "provider continuation parts"),
            (self.other_content, "other unsupported parts"),
        ]
        .into_iter()
        .filter(|(count, _)| *count > 0)
        .map(|(count, label)| format!("{label} ({count})"))
        .collect();
        (!omitted.is_empty()).then(|| format!(
            "The preceding context was imported as portable text. Omitted material includes {}. \
             Treat historical tool notes as evidence about prior work. Confirm missing information \
             when it matters to the current task.",
            omitted.join(", ")
        ))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ConversationSeed {
    records: Vec<HistoryRecord>,
    provenance: SeedProvenance,
}

struct PrefixEntry {
    entry: SeedEntry,
    record: Option<HistoryRecord>,
    selected: bool,
}

impl PrefixEntry {
    fn accompanies(&self, authored: &SeedOrigin) -> bool {
        let origin = &self.entry.origin;
        if origin.session != authored.session
            || origin.view != authored.view
            || origin.turn != authored.turn
        {
            return false;
        }
        let Some(HistoryRecord::Message(message)) = &self.record else {
            return false;
        };
        let Some((source, input)) = origin.message.as_str().split_once('/') else {
            return false;
        };
        message.role == Role::User
            && message.provenance.kind == ProvenanceKind::Observed
            && message.provenance.source == source
            && match source {
                MESSAGE_CONTEXT_SOURCE => input == authored.message.as_str(),
                EDITOR_OBSERVATION_SOURCE => {
                    authored.message.as_str().split_once('/')
                        == Some((AUTHORED_INPUT_PREFIX, input))
                }
                _ => false,
            }
    }
}

impl ConversationSeed {
    /// Lower the already ordered source prefix into portable text and lineage.
    /// Local entries supply a turn ID and its observed committed journal position.
    pub fn lower(
        source: ConversationSource,
        cut: ConversationCut,
        inherited: Option<Self>,
        local: impl IntoIterator<Item = (TurnId, JournalPosition, HistoryRecord)>,
    ) -> Result<Self> {
        let mut records = Vec::new();
        let mut entries = Vec::new();
        let anchor = cut.anchor();
        let inherited = inherited.into_iter().flat_map(move |inherited| {
            let mut inherited_records = inherited.records.into_iter();
            inherited.provenance.entries.into_iter().map(move |entry| {
                let record = entry.message.as_ref().map(|_| {
                    inherited_records
                        .next()
                        .expect("seed records match provenance")
                });
                let selected = entry.message.as_ref().is_some_and(|message| {
                    matches!(anchor, ConversationAnchor::Inherited { message: selected } if selected == message)
                });
                Ok(PrefixEntry { entry, record, selected })
            })
        });
        let local = local
            .into_iter()
            .map(|(turn, position, HistoryRecord::Message(message))| {
                let selected = matches!(anchor, ConversationAnchor::Turn {
                turn: selected_turn, message: selected_message,
            } if selected_turn == &turn && selected_message == &message.id);
                if selected && !matches!(message.role, Role::User | Role::Assistant) {
                    return Err(Error::new(
                        ErrorKind::InvalidInput,
                        "history_anchor_not_visible",
                    ));
                }
                let origin = SeedOrigin {
                    session: source.session.clone(),
                    view: source.view,
                    turn,
                    position,
                    message: message.id.clone(),
                };
                let (entry, record) = lower_message(origin, message)?;
                Ok(PrefixEntry {
                    entry,
                    record,
                    selected,
                })
            });
        let mut prefix = inherited.chain(local).peekable();
        while let Some(candidate) = prefix.next() {
            let PrefixEntry {
                entry,
                record,
                selected,
            } = candidate?;
            if !selected {
                entries.push(entry);
                records.extend(record);
                continue;
            }
            match &cut {
                ConversationCut::BeforeEditableUser(_) => {
                    if record.is_none() {
                        return Err(Error::new(
                            ErrorKind::InvalidInput,
                            "history_anchor_not_visible",
                        ));
                    }
                    if !entry.editable {
                        return Err(Error::new(
                            ErrorKind::InvalidInput,
                            "history_anchor_not_editable",
                        ));
                    }
                }
                ConversationCut::Through(_) => {
                    let authored = entry.origin.clone();
                    let before = records.len();
                    entries.push(entry);
                    records.extend(record);
                    // The host records the accepted message and its context together.
                    // Keep the attached observations even when the authored input has
                    // no portable text of its own.
                    while let Some(companion) = prefix.next_if(|candidate| {
                        candidate
                            .as_ref()
                            .is_ok_and(|part| part.accompanies(&authored))
                    }) {
                        let companion = companion?;
                        entries.push(companion.entry);
                        records.extend(companion.record);
                    }
                    if records.len() == before {
                        return Err(Error::new(
                            ErrorKind::InvalidInput,
                            "history_anchor_not_visible",
                        ));
                    }
                }
            }
            return Ok(Self {
                records,
                provenance: SeedProvenance {
                    source,
                    cut,
                    entries,
                },
            });
        }
        Err(Error::new(
            ErrorKind::InvalidInput,
            "history_anchor_missing",
        ))
    }

    /// Interpret the product provenance retained beside portable history records.
    pub fn from_parts(records: Vec<HistoryRecord>, provenance: &Envelope) -> Result<Self> {
        let provenance = SeedProvenance::decode(provenance)?;
        let mut visible = provenance
            .entries
            .iter()
            .filter_map(|entry| entry.message.as_ref().map(|id| (id, entry.editable)));
        let mut ids = BTreeSet::new();
        for HistoryRecord::Message(message) in &records {
            let Some((id, editable)) = visible.next() else {
                return Err(invalid_seed());
            };
            if &message.id != id
                || !ids.insert(id)
                || !matches!(message.role, Role::User | Role::Assistant)
                || message.content.is_empty()
                || message
                    .content
                    .iter()
                    .any(|part| !matches!(part, Content::Text(_)))
                || (editable && message.role != Role::User)
            {
                return Err(invalid_seed());
            }
        }
        if visible.next().is_some() {
            return Err(invalid_seed());
        }
        Ok(Self {
            records,
            provenance,
        })
    }

    pub fn provenance(&self) -> &SeedProvenance {
        &self.provenance
    }

    pub fn records(&self) -> &[HistoryRecord] {
        &self.records
    }

    pub fn into_records(self) -> Vec<HistoryRecord> {
        self.records
    }

    pub fn into_parts(self) -> Result<(Vec<HistoryRecord>, Envelope)> {
        Ok((self.records, encode(SCHEMA, &self.provenance)?))
    }
}

pub fn is_editable_user(message: &Message) -> bool {
    message.role == Role::User
        && message.provenance.kind != ProvenanceKind::Observed
        && !matches!(
            message.provenance.source.as_str(),
            questions::ANSWER_SOURCE | questions::TOOL_ANSWER_SOURCE
        )
        && message
            .content
            .iter()
            .any(|part| matches!(part, Content::Text(text) if !text.is_empty()))
}

fn lower_message(
    origin: SeedOrigin,
    message: Message,
) -> Result<(SeedEntry, Option<HistoryRecord>)> {
    let role = message.role;
    let editable = is_editable_user(&message);
    let question_reply = questions::visible_replies(&message).is_some();
    let (content, omissions) = portable_parts(role, message.content);
    let projected = if content.is_empty() {
        None
    } else {
        let fingerprint = Fingerprint::of(&origin)?;
        let digest = fingerprint.to_hex();
        Some(Message {
            id: MessageId::new(format!("seed/{digest}"))?,
            role: if role == Role::Tool {
                Role::Assistant
            } else {
                role
            },
            phase: message.phase,
            content,
            provenance: if question_reply {
                Provenance {
                    source: questions::ANSWER_SOURCE.into(),
                    kind: ProvenanceKind::Transformed,
                    fingerprint: Some(fingerprint),
                }
            } else if role == Role::User && message.provenance.kind == ProvenanceKind::Observed {
                // Host observations remain attributed as data, including in derived chats.
                message.provenance
            } else {
                Provenance {
                    source: "retained_history".into(),
                    kind: ProvenanceKind::Transformed,
                    fingerprint: Some(fingerprint),
                }
            },
        })
    };
    let entry = SeedEntry {
        origin,
        message: projected.as_ref().map(|message| message.id.clone()),
        editable,
        omissions,
    };
    Ok((entry, projected.map(HistoryRecord::Message)))
}

pub(super) fn portable_parts(role: Role, parts: Vec<Content>) -> (Vec<Content>, Vec<SeedOmission>) {
    let mut omissions = Vec::new();
    let mut content = Vec::new();
    for (part, value) in parts.into_iter().enumerate() {
        let kind = match (role, value) {
            (Role::System, _) => SeedOmissionKind::Instruction,
            (Role::User | Role::Assistant, Content::Text(text)) => {
                if !text.is_empty() {
                    content.push(Content::Text(text));
                }
                continue;
            }
            (Role::Tool, Content::ToolResult(result)) => {
                let mut reference = format!("Prior tool result ({:?})", result.status);
                if result.truncated {
                    reference.push_str(" [truncated]");
                }
                // The result may contain scoped file data or private tool output.
                // The portable projection carries only the observed disposition.
                content.push(Content::Text(reference));
                SeedOmissionKind::ToolResult {
                    text: result
                        .content
                        .iter()
                        .any(|part| matches!(part, ResultContent::Text(_))),
                    media: result
                        .content
                        .iter()
                        .any(|part| matches!(part, ResultContent::Media(_))),
                    structured: result.structured.is_some(),
                }
            }
            (Role::User | Role::Assistant, Content::Media(media))
                if let Some(text) = file_reference::display(&media) =>
            {
                // A file reference is the person's description of a local
                // file (name, type, size, path); its bytes never entered the
                // conversation. Carry the text the model read for it.
                content.push(Content::Text(text));
                continue;
            }
            (_, Content::Reasoning(_)) => SeedOmissionKind::Reasoning,
            (_, Content::Media(_)) => SeedOmissionKind::Media,
            (_, Content::ToolCall(_)) => SeedOmissionKind::ToolCall,
            (_, Content::ProviderState(_)) => SeedOmissionKind::ProviderState,
            _ => SeedOmissionKind::UnsupportedRoleContent,
        };
        omissions.push(SeedOmission { part, kind });
    }
    (content, omissions)
}

fn invalid_seed() -> Error {
    Error::new(ErrorKind::InvalidState, "invalid_conversation_seed")
}
