//! Workspace-scoped, transcript-free discovery of saved chats.

use super::*;
use agent_kit_store_sqlite::catalog::CatalogEntry;

const ACTIVE: u8 = 0;
const ARCHIVED: u8 = 1;

pub struct SessionCatalog {
    pub cwd: PathBuf,
    pub entries: Vec<CatalogEntry>,
    pub next_after: Option<SessionId>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCatalogEntry {
    pub session_id: SessionId,
    pub title: Option<String>,
    pub revision: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCatalogPage {
    pub entries: Vec<ArchiveCatalogEntry>,
    pub next_cursor: Option<SessionId>,
}

impl Host {
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
                .map(|entry| ArchiveCatalogEntry {
                    session_id: entry.session,
                    title: entry.label,
                    revision: entry.revision,
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
        entry.bucket = ACTIVE;
        self.store.replace_catalog_entry(entry).await?;
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
            .list_catalog(workspace_scope(&cwd)?, bucket(archived), after)
            .await?;
        Ok(SessionCatalog {
            cwd,
            entries: page.entries,
            next_after: page.next_after,
        })
    }

    pub(crate) async fn catalog_entry(&self, id: SessionId) -> Result<CatalogEntry> {
        self.refuse_in_side_chat(&id, side_chats::Refusal::Catalog)
            .await?;
        self.store.catalog_entry(id).await
    }

    pub(crate) async fn organize_session(
        &self,
        id: SessionId,
        revision: u64,
        title: Option<String>,
        archived: bool,
    ) -> Result<CatalogEntry> {
        let title = title.map(|title| title.trim().to_owned());
        if title
            .as_ref()
            .is_some_and(|title| title.is_empty() || title.chars().any(char::is_control))
        {
            return Err(problem(ErrorKind::InvalidInput, "invalid_session_title"));
        }
        self.refuse_in_side_chat(&id, side_chats::Refusal::Catalog)
            .await?;
        self.store
            .replace_catalog_entry(CatalogEntry {
                session: id,
                bucket: bucket(archived),
                label: title,
                revision,
            })
            .await
    }
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
