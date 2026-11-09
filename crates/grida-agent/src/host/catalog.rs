//! Workspace-scoped, transcript-free discovery of saved chats.

use super::*;

pub struct SessionCatalog {
    pub cwd: PathBuf,
    pub sessions: Vec<SessionId>,
    pub next_after: Option<SessionId>,
}

impl Host {
    pub async fn list_sessions(
        &self,
        cwd: PathBuf,
        after: Option<SessionId>,
    ) -> Result<SessionCatalog> {
        let cwd = tokio::task::spawn_blocking(move || canonical_workspace(&cwd))
            .await
            .map_err(|_| problem(ErrorKind::Unavailable, "workspace_unavailable"))??;
        let page = self
            .store
            .list_catalog(workspace_scope(&cwd)?, after)
            .await?;
        Ok(SessionCatalog {
            cwd,
            sessions: page.sessions,
            next_after: page.next_after,
        })
    }
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
