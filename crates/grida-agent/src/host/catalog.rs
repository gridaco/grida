//! Transcript-free discovery of public saved chats in this host's store.

use super::*;
use agent_kit_store_sqlite::catalog::{
    CatalogEntry, CatalogRecord, ConversationAnchor, ConversationOrder, ConversationProjection,
    ConversationReadState, ReadStateUpdate,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};

const ACTIVE: u8 = 0;
const ARCHIVED: u8 = 1;

pub(super) const CONVERSATIONS: ConversationProjection = ConversationProjection {
    group: |configuration| {
        let config = decode_session_configuration(configuration).ok()?;
        if !config.cwd.is_absolute()
            || config.subagent.is_some()
            || config.worker.is_some()
            || config.side.is_some()
        {
            return None;
        }
        config.cwd.into_os_string().into_string().ok()
    },
    input: |input| {
        // A claim replays its already accepted input. Automatic goal continuation
        // and internal submissions do not represent a new user message.
        #[derive(Deserialize)]
        struct Input {
            goal: Option<goals::GoalInput>,
        }
        is_stored_input(&input.payload)
            && decode_input::<Input>(input)
                .is_ok_and(|input| !matches!(input.goal, Some(goals::GoalInput::Continue(_))))
    },
    message: |message| match message.role {
        Role::Assistant => {
            message.provenance.kind == ProvenanceKind::Generated
                && message.phase != Some(agent_kit_core::messages::MessagePhase::Progress)
                && !message
                    .content
                    .iter()
                    .any(|part| matches!(part, Content::ToolCall(_)))
                && message
                    .content
                    .iter()
                    .any(|part| matches!(part, Content::Text(text) if !text.trim().is_empty()))
        }
        Role::User => {
            message.provenance.kind == ProvenanceKind::Supplied
                && (grida_agent_master::questions::is_answer_contribution(message)
                    || (message.id.as_str().starts_with("steer/")
                        && matches!(
                            message.provenance.source.as_str(),
                            "native-client" | message_context::SUPPLIED_SOURCE
                        )))
        }
        _ => false,
    },
    final_reply: |state| {
        let messages = state
            .history()
            .records()
            .iter()
            .map(|HistoryRecord::Message(message)| message);
        let answers = grida_agent_master::activity::final_answers(
            messages.clone(),
            state.outcome().map(|outcome| outcome.status),
        );
        messages
            .rev()
            .find(|message| {
                answers.contains(&message.id)
                    && message.provenance.kind == ProvenanceKind::Generated
                    && message.content.iter().any(|part| match part {
                        Content::Text(text) => !text.trim().is_empty(),
                        Content::Media(_) => true,
                        _ => false,
                    })
            })
            .map(|message| message.id.clone())
    },
};

#[derive(Clone, Copy, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogOrder {
    Created,
    MessageActivity,
}

#[derive(Serialize, Deserialize)]
struct QueryCursor(Fingerprint, ConversationAnchor);

impl QueryCursor {
    fn encode(self) -> Result<String> {
        serde_json::to_vec(&self)
            .map(|bytes| format!("v2/{}", URL_SAFE_NO_PAD.encode(bytes)))
            .map_err(|_| problem(ErrorKind::InvalidState, "catalog_cursor_encoding_failed"))
    }
    fn decode(cursor: &str, query: Fingerprint) -> Result<ConversationAnchor> {
        let invalid = || problem(ErrorKind::InvalidInput, "invalid_session_cursor");
        let bytes = cursor
            .strip_prefix("v2/")
            .filter(|value| value.len() <= 1024)
            .and_then(|value| URL_SAFE_NO_PAD.decode(value).ok())
            .ok_or_else(invalid)?;
        let QueryCursor(stored, anchor) = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
        if stored != query || anchor.value < -1 {
            return Err(invalid());
        }
        Ok(anchor)
    }
}

pub(crate) struct ListedSession {
    pub cwd: PathBuf,
    pub record: CatalogRecord,
    pub cursor: String,
}

pub(crate) struct CatalogListing {
    pub entries: Vec<ListedSession>,
    pub has_more: bool,
}

/// Whether an open wait is a decision the person can answer. Scheduled
/// wakeups and other host-owned waits do not request a person's attention.
pub fn needs_user_input(schemas: &BTreeSet<SchemaId>) -> bool {
    schemas.iter().any(|schema| {
        matches!(
            schema.as_str(),
            grida_agent_master::questions::REQUEST_SCHEMA
                | crate::permissions::REQUEST
                | library::REQUEST
        )
    })
}

pub struct SessionCatalog {
    pub cwd: PathBuf,
    pub entries: Vec<CatalogRecord>,
    pub next_after: Option<SessionId>,
}

impl SessionCatalog {
    pub(crate) fn anchor(token: &str) -> Result<SessionId> {
        token
            .strip_prefix("v1/")
            .and_then(|id| SessionId::new(id).ok())
            .ok_or_else(|| problem(ErrorKind::InvalidInput, "invalid_session_cursor"))
    }
}

impl From<SessionCatalog> for CatalogListing {
    fn from(page: SessionCatalog) -> Self {
        Self {
            entries: page
                .entries
                .into_iter()
                .map(|record| ListedSession {
                    cwd: page.cwd.clone(),
                    cursor: format!("v1/{}", record.entry.session.as_str()),
                    record,
                })
                .collect(),
            has_more: page.next_after.is_some(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCatalogEntry {
    pub session_id: SessionId,
    pub title: Option<String>,
    pub revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_activity_at_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCatalogPage {
    pub entries: Vec<ArchiveCatalogEntry>,
    pub next_cursor: Option<SessionId>,
}

impl Host {
    pub(crate) async fn update_conversation_read(
        &self,
        cwd: PathBuf,
        session: SessionId,
        update: ReadStateUpdate,
    ) -> Result<ConversationReadState> {
        let cwd = tokio::task::spawn_blocking(move || canonical_workspace(&cwd))
            .await
            .map_err(|_| problem(ErrorKind::Unavailable, "workspace_unavailable"))??;
        if self
            .permissions
            .as_deref()
            .map(|p| p.catalog_workspace())
            .transpose()?
            .flatten()
            .is_some_and(|fixed| fixed != cwd)
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "session_catalog_scope_mismatch",
            ));
        }
        let group = cwd
            .into_os_string()
            .into_string()
            .map_err(|_| problem(ErrorKind::InvalidInput, "invalid_workspace_path"))?;
        self.store
            .update_read_state(group, ACTIVE, session, update)
            .await
    }

    pub(crate) async fn discover_chats(
        &self,
        cwd: Option<PathBuf>,
        order: CatalogOrder,
        cursor: Option<&str>,
    ) -> Result<CatalogListing> {
        let cwd = tokio::task::spawn_blocking(move || {
            cwd.as_deref().map(canonical_workspace).transpose()
        })
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "workspace_unavailable"))??;
        let fixed = self
            .permissions
            .as_deref()
            .map(|profile| profile.catalog_workspace())
            .transpose()?
            .flatten();
        if fixed
            .zip(cwd.as_deref())
            .is_some_and(|(fixed, requested)| fixed != requested)
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "session_catalog_scope_mismatch",
            ));
        }
        // Existing filtered queries keep their opaque creation-order cursors.
        if order == CatalogOrder::Created
            && let Some(cwd) = &cwd
        {
            let after = cursor.map(SessionCatalog::anchor).transpose()?;
            let page = self
                .store
                .list_catalog_records(workspace_scope(cwd)?, ACTIVE, after)
                .await?;
            return Ok(SessionCatalog {
                cwd: cwd.clone(),
                entries: page.entries,
                next_after: page.next_after,
            }
            .into());
        }
        let group = cwd.as_deref().or(fixed);
        let query = Fingerprint::of(&(
            "grida-chat-catalog-v1",
            self.state_dir.as_deref(),
            group,
            cwd.is_some(),
            order,
        ))?;
        let after = cursor
            .map(|token| QueryCursor::decode(token, query))
            .transpose()?;
        let group = group
            .map(|path| {
                path.to_str()
                    .map(str::to_owned)
                    .ok_or_else(|| problem(ErrorKind::InvalidInput, "invalid_workspace_path"))
            })
            .transpose()?;
        let order = match order {
            CatalogOrder::Created => ConversationOrder::Created,
            CatalogOrder::MessageActivity => ConversationOrder::Recent,
        };
        let page = self
            .store
            .list_conversations(group, ACTIVE, order, after, 32)
            .await?;
        Ok(CatalogListing {
            has_more: page.next_after.is_some(),
            entries: page
                .entries
                .into_iter()
                .map(|row| {
                    Ok(ListedSession {
                        cwd: PathBuf::from(row.group),
                        record: row.record,
                        cursor: QueryCursor(query, row.anchor).encode()?,
                    })
                })
                .collect::<Result<_>>()?,
        })
    }

    /// Read the saved display title without loading history or contacting a provider.
    pub async fn session_title(&self, id: SessionId) -> Result<Option<String>> {
        Ok(self.store.catalog_entry(id).await?.label)
    }

    /// Settings reads metadata without attaching a session or enabling execution.
    pub async fn archive_catalog(
        &self,
        cwd: PathBuf,
        after: Option<SessionId>,
    ) -> Result<ArchiveCatalogPage> {
        let page = self.list_sessions(cwd, true, after).await?;
        Ok(ArchiveCatalogPage {
            entries: page
                .entries
                .into_iter()
                .map(|record| ArchiveCatalogEntry {
                    session_id: record.entry.session,
                    title: record.entry.label,
                    revision: record.entry.revision,
                    last_activity_at_ms: record.latest_turn_activity_ms,
                })
                .collect(),
            next_cursor: page.next_after,
        })
    }

    /// Change only catalog placement, keeping execution, turns and hooks untouched.
    pub async fn unarchive_catalog(
        &self,
        cwd: PathBuf,
        session: SessionId,
        revision: u64,
    ) -> Result<()> {
        let cwd = tokio::task::spawn_blocking(move || canonical_workspace(&cwd))
            .await
            .map_err(|_| problem(ErrorKind::Unavailable, "workspace_unavailable"))??;
        let mut entry = self
            .store
            .scoped_catalog_entry(workspace_scope(&cwd)?, session)
            .await?;
        if entry.revision != revision {
            return Err(problem(
                ErrorKind::Conflict,
                "session_catalog_revision_changed",
            ));
        }
        if entry.bucket != ACTIVE {
            entry.bucket = ACTIVE;
            self.store.replace_catalog_entry(entry).await?;
        }
        Ok(())
    }

    pub async fn list_sessions(
        &self,
        cwd: PathBuf,
        archived: bool,
        after: Option<SessionId>,
    ) -> Result<SessionCatalog> {
        let cwd = tokio::task::spawn_blocking(move || canonical_workspace(&cwd))
            .await
            .map_err(|_| problem(ErrorKind::Unavailable, "workspace_unavailable"))??;
        let page = self
            .store
            .list_catalog_records(workspace_scope(&cwd)?, bucket(archived), after)
            .await?;
        Ok(SessionCatalog {
            cwd,
            entries: page.entries,
            next_after: page.next_after,
        })
    }

    pub(crate) async fn catalog_entry(&self, id: SessionId) -> Result<(CatalogRecord, bool)> {
        self.refuse_in_side_chat(&id, side_chats::Refusal::Catalog)
            .await?;
        self.read_with_title_state(&id, self.store.catalog_record(id.clone()))
            .await
    }

    pub(crate) async fn organize_session(
        &self,
        id: SessionId,
        revision: u64,
        title: Option<String>,
        archived: bool,
    ) -> Result<CatalogRecord> {
        let title = normalize_title(title)?;
        self.refuse_in_side_chat(&id, side_chats::Refusal::Catalog)
            .await?;
        let entry = self
            .store
            .replace_catalog_entry(CatalogEntry {
                session: id,
                bucket: bucket(archived),
                label: title,
                revision,
            })
            .await?;
        // The placement receipt needs no fallible observation after commit.
        // Read-only observations supply current turn activity.
        Ok(CatalogRecord {
            entry,
            read_state: ConversationReadState::default(),
            latest_turn_activity_ms: None,
            last_message_ms: None,
            current_turn_disposition: None,
            pending_request_schemas: BTreeSet::new(),
        })
    }
}

pub(super) fn normalize_title(title: Option<String>) -> Result<Option<String>> {
    let title = title.map(|title| title.trim().to_owned());
    if title
        .as_ref()
        .is_some_and(|title| title.is_empty() || title.chars().any(char::is_control))
    {
        return Err(problem(ErrorKind::InvalidInput, "invalid_session_title"));
    }
    Ok(title)
}

pub(crate) fn is_archived(entry: &CatalogEntry) -> bool {
    entry.bucket == ARCHIVED
}

fn bucket(archived: bool) -> u8 {
    if archived { ARCHIVED } else { ACTIVE }
}

pub(super) fn configuration_scope(configuration: &Envelope) -> Option<Fingerprint> {
    let config = decode_session_configuration(configuration).ok()?;
    if !config.cwd.is_absolute() {
        return None;
    }
    // Side chats share one scope outside every workspace, so no saved-chat
    // listing can reach them.
    match (config.subagent, config.side) {
        (Some(child), _) => child_scope(child.parent()).ok(),
        (None, Some(_)) => super::side_chats::scope().ok(),
        (None, None) => workspace_scope(&config.cwd).ok(),
    }
}

pub(super) fn child_scope(parent: &SessionId) -> Result<Fingerprint> {
    Fingerprint::of(&("grida-session-children-v1", parent))
}

pub(super) fn workspace_scope(cwd: &Path) -> Result<Fingerprint> {
    Fingerprint::of(&("grida-session-workspace-v1", cwd))
}
