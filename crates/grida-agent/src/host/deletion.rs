//! GRIDA-SEC-004 — permanent removal of an admitted saved chat within its workspace.

use super::*;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::TurnState;
use agent_kit_store_sqlite::deletion::{DeleteSession, SessionDeleted};

pub(crate) struct SavedChatDeletion {
    pub session: SessionId,
    pub cwd: PathBuf,
    pub request: ChangeId,
    pub expected_revision: SessionRevision,
    pub expected_catalog_revision: u64,
}

impl SavedChatDeletion {
    async fn scoped(self) -> Result<(DeleteSession, PathBuf)> {
        tokio::task::spawn_blocking(move || {
            let cwd = canonical_workspace(&self.cwd)?;
            let request = DeleteSession {
                session: self.session,
                scope: catalog::workspace_scope(&cwd)?,
                request: self.request,
                expected_revision: self.expected_revision,
                expected_catalog_revision: self.expected_catalog_revision,
            };
            Ok((request, cwd))
        })
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "workspace_unavailable"))?
    }
}

impl Host {
    pub(crate) fn deletion_available(&self) -> bool {
        cfg!(any(target_os = "macos", target_os = "linux")) && self.state_dir.is_some()
    }

    pub(crate) async fn saved_chat_deletion_receipt(
        &self,
        request: SavedChatDeletion,
    ) -> Result<Option<SessionDeleted>> {
        let (request, _) = request.scoped().await?;
        self.store.deletion_receipt(request).await
    }

    pub(crate) async fn delete_saved_chat(
        &self,
        request: SavedChatDeletion,
    ) -> Result<SessionDeleted> {
        self.owned_control(move |host| async move {
            let state_dir = host
                .state_dir
                .clone()
                .filter(|_| host.deletion_available())
                .ok_or_else(|| problem(ErrorKind::Unsupported, "session_deletion_unavailable"))?;
            let (request, cwd) = request.scoped().await?;
            let _admission = host.configuration_admission.lock().await;
            if let Some(receipt) = host.store.deletion_receipt(request.clone()).await? {
                return Ok(receipt);
            }
            let session = request.session.clone();
            {
                let mut work = host.work.lock().await;
                if work.closed {
                    return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
                }
                if work.active.contains_key(&session)
                    || work.ready.iter().any(|ready| ready.session() == &session)
                    || work.timers.keys().any(|(owner, _)| owner == &session)
                {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "session_deletion_requires_idle",
                    ));
                }
                work.retiring.insert(session.clone());
            }
            let result = host.delete_owned_chat(state_dir, cwd, request).await;
            host.work.lock().await.retiring.remove(&session);
            result
        })
        .await
    }

    async fn delete_owned_chat(
        &self,
        state_dir: Arc<Path>,
        cwd: PathBuf,
        request: DeleteSession,
    ) -> Result<SessionDeleted> {
        let view = self.store.inspect(request.session.clone()).await?;
        require_saved_workspace(&view.configuration, &cwd)?;
        if self
            .store
            .has_catalog_entries(catalog::child_scope(&request.session)?)
            .await?
        {
            return Err(problem(
                ErrorKind::Conflict,
                "session_deletion_has_subagents",
            ));
        }
        let owner = request.session.clone();
        if tokio::task::spawn_blocking(move || {
            images::Images::retained_scope_exists(&state_dir, &owner)
        })
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))??
        {
            return Err(problem(
                ErrorKind::Conflict,
                "session_deletion_has_retained_inputs",
            ));
        }
        self.store
            .delete_idle(
                request,
                move |configuration, driver| {
                    require_saved_workspace(configuration, &cwd)?;
                    goals::require_resolved_goal(driver)
                },
                require_resolved_work,
            )
            .await
    }
}

fn require_saved_workspace(configuration: &Envelope, cwd: &Path) -> Result<()> {
    let configuration = decode_session_configuration(configuration)?;
    if configuration.subagent.is_some() || configuration.cwd != cwd {
        return Err(problem(ErrorKind::InvalidInput, "session_missing"));
    }
    Ok(())
}

fn require_resolved_work(turn: &TurnState) -> Result<()> {
    if turn
        .outcome()
        .is_some_and(|outcome| outcome.status == OutcomeStatus::Uncertain)
        || turn.waits().values().any(|wait| wait.is_pending())
        || turn.operations().values().any(|operation| {
            operation.outcome().is_none()
                || (operation.is_uncertain()
                    && !grida_agent_master::presentation::unconfirmed(
                        operation,
                        &turn.binding().turn,
                    ))
        })
    {
        return Err(problem(
            ErrorKind::Conflict,
            "session_deletion_work_unresolved",
        ));
    }
    Ok(())
}
