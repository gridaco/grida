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

impl Host {
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
    workspace_scope(&config.cwd).ok()
}

fn workspace_scope(cwd: &Path) -> Result<Fingerprint> {
    Fingerprint::of(&("grida-session-workspace-v1", cwd))
}
