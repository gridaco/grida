//! Workspace-scoped, transcript-free discovery of saved chats.

use super::*;
use agent_kit_store_sqlite::catalog::{CatalogEntry, CatalogRecord};

const ACTIVE: u8 = 0;
const ARCHIVED: u8 = 1;

pub struct SessionCatalog {
    pub cwd: PathBuf,
    pub entries: Vec<CatalogRecord>,
    pub next_after: Option<SessionId>,
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
            latest_turn_activity_ms: None,
            current_turn_disposition: None,
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
