//! GRIDA-SEC-004 — permanent removal of an admitted saved chat within its workspace.

use super::*;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::TurnState;
use agent_kit_store_sqlite::deletion::{DeleteDependents, DeleteSession, SessionDeleted};

pub(crate) struct SavedChatDeletion {
    pub session: SessionId,
    pub cwd: PathBuf,
    pub request: ChangeId,
    pub expected_revision: SessionRevision,
    pub expected_catalog_revision: u64,
    pub expected_owned_children: Option<Fingerprint>,
}

impl SavedChatDeletion {
    async fn scoped(self) -> Result<(DeleteSession, PathBuf)> {
        tokio::task::spawn_blocking(move || {
            let cwd = canonical_workspace(&self.cwd)?;
            let dependents = match self.expected_owned_children {
                Some(basis) => Some(DeleteDependents {
                    scope: catalog::child_scope(&self.session)?,
                    basis,
                }),
                None => None,
            };
            let request = DeleteSession {
                session: self.session,
                scope: catalog::workspace_scope(&cwd)?,
                request: self.request,
                expected_revision: self.expected_revision,
                expected_catalog_revision: self.expected_catalog_revision,
                dependents,
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

    pub(crate) async fn preview_saved_chat_deletion(
        &self,
        session: SessionId,
        cwd: PathBuf,
    ) -> Result<(usize, Fingerprint)> {
        let cwd = tokio::task::spawn_blocking(move || canonical_workspace(&cwd))
            .await
            .map_err(|_| problem(ErrorKind::Unavailable, "workspace_unavailable"))??;
        let view = self.store.inspect(session.clone()).await?;
        require_saved_workspace(&view.configuration, &cwd)?;
        let children = self
            .store
            .retirement_dependencies(catalog::child_scope(&session)?)
            .await?;
        Ok((children.sessions.len(), children.basis))
    }

    pub(crate) async fn saved_chat_deletion_receipt(
        &self,
        request: SavedChatDeletion,
    ) -> Result<Option<SessionDeleted>> {
        self.owned_control(move |host| async move {
            let (request, _) = request.scoped().await?;
            let _admission = host.configuration_admission.lock().await;
            match host.store.deletion_receipt(request).await? {
                Some(receipt) => Ok(Some(host.finish_deletion(receipt).await?)),
                None => Ok(None),
            }
        })
        .await
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
            // Wait out a settled turn's worker before admission, which that
            // worker's next queued input may need. Idleness is checked below.
            drop(host.settled_work(&request.session).await);
            let _admission = host.configuration_admission.lock().await;
            if let Some(receipt) = host.store.deletion_receipt(request.clone()).await? {
                return host.finish_deletion(receipt).await;
            }
            let session = request.session.clone();
            let view = host.store.inspect(session.clone()).await?;
            require_saved_workspace(&view.configuration, &cwd)?;
            let child_scope = catalog::child_scope(&session)?;
            let children = host.store.retirement_dependencies(child_scope).await?;
            if let Some(expected) = &request.dependents {
                if expected.basis != children.basis {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "session_deletion_dependencies_changed",
                    ));
                }
            } else if !children.sessions.is_empty() {
                return Err(problem(
                    ErrorKind::Conflict,
                    "session_deletion_has_subagents",
                ));
            }
            let mut family = Vec::with_capacity(1 + children.sessions.len());
            family.push(session);
            family.extend(children.sessions);
            {
                let mut work = host.work.lock().await;
                if work.closed {
                    return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
                }
                if family.iter().any(|id| {
                    work.active.contains_key(id)
                        || work.ready.iter().any(|ready| ready.session() == id)
                        || work.timers.keys().any(|(owner, _)| owner == id)
                }) {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "session_deletion_requires_idle",
                    ));
                }
                work.retiring.extend(family.iter().cloned());
            }
            // Running processes do not keep a chat from being deleted: they
            // are stopped before its data is removed.
            let mut result = Ok(());
            for id in &family {
                result = host
                    .processes
                    .retire(id, std::time::Instant::now() + PROCESS_STOP_WAIT)
                    .await;
                if result.is_err() {
                    break;
                }
            }
            let result = match result {
                Ok(()) => {
                    host.delete_owned_chat(state_dir, cwd, request, family[1..].to_vec())
                        .await
                }
                Err(error) => Err(error),
            };
            let mut work = host.work.lock().await;
            for id in &family {
                work.retiring.remove(id);
                host.processes.release(id);
            }
            result
        })
        .await
    }

    async fn delete_owned_chat(
        &self,
        state_dir: Arc<Path>,
        cwd: PathBuf,
        request: DeleteSession,
        children: Vec<SessionId>,
    ) -> Result<SessionDeleted> {
        let owner = request.session.clone();
        let parent = owner.clone();
        let child_cwd = cwd.clone();
        let cleanup = tokio::task::spawn_blocking(move || {
            // Named children only accept text. Unexpected retained storage
            // needs its own ownership proof before the family can retire.
            for child in children {
                if retained_inputs::RetainedInputs::retirement_identity(&state_dir, &child)?
                    .is_some()
                {
                    return Err(problem(
                        ErrorKind::Conflict,
                        "session_deletion_has_retained_inputs",
                    ));
                }
            }
            retained_inputs::RetainedInputs::retirement_identity(&state_dir, &owner)
        })
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))?
        .map_err(|_| problem(ErrorKind::Conflict, "session_deletion_has_retained_inputs"))?;
        let receipt = self
            .store
            .delete_idle_with_dependents(
                request,
                cleanup,
                move |configuration, driver| {
                    require_saved_workspace(configuration, &cwd)?;
                    goals::require_resolved_goal(driver)
                },
                move |configuration, driver| {
                    let configuration = decode_session_configuration(configuration)?;
                    if configuration.cwd != child_cwd {
                        return Err(problem(
                            ErrorKind::Conflict,
                            "session_deletion_dependencies_changed",
                        ));
                    }
                    let profile = configuration
                        .subagent
                        .filter(|profile| profile.parent() == &parent)
                        .ok_or_else(|| {
                            problem(ErrorKind::Conflict, "session_deletion_dependencies_changed")
                        })?;
                    profile.allocation(driver).map(|_| ())
                },
                require_resolved_work,
            )
            .await?;
        self.finish_deletion(receipt).await
    }

    async fn finish_deletion(&self, mut receipt: SessionDeleted) -> Result<SessionDeleted> {
        let spending = self.spending.clone();
        let owner = receipt.session.clone();
        tokio::task::spawn_blocking(move || spending.retire(&owner))
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "session_deletion_unverified"))?
            .map_err(|_| problem(ErrorKind::Uncertain, "session_deletion_unverified"))?;
        if let Some(identity) = receipt.cleanup {
            self.cleanup_retired(receipt.session.clone(), identity)
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "session_deletion_unverified"))?;
            receipt.cleanup = None;
        }
        Ok(receipt)
    }

    async fn cleanup_retired(&self, session: SessionId, identity: [u8; 32]) -> Result<()> {
        let state_dir = self
            .state_dir
            .clone()
            .ok_or_else(|| problem(ErrorKind::Unavailable, "attachment_storage_unavailable"))?;
        let owner = session.clone();
        tokio::task::spawn_blocking(move || {
            retained_inputs::RetainedInputs::retire(&state_dir, &owner, identity)
        })
        .await
        .map_err(|_| problem(ErrorKind::Uncertain, "session_deletion_unverified"))??;
        self.store
            .finish_retirement_cleanup(session, identity)
            .await
    }

    pub(crate) async fn recover_retired_chat_data(&self) {
        if !self.deletion_available() {
            return;
        }
        let _ = self
            .owned_control(|host| async move {
                let mut after = None;
                while !host.controls.is_closed() {
                    let pending = host.store.pending_retirement_cleanup(after).await?;
                    let Some((last, _)) = pending.last() else {
                        break;
                    };
                    after = Some(last.clone());
                    for (session, identity) in pending {
                        let _admission = host.configuration_admission.lock().await;
                        if host.controls.is_closed() {
                            return Ok(());
                        }
                        if host.cleanup_retired(session, identity).await.is_err() {
                            eprintln!("grida-agent: retired chat data cleanup is pending");
                        }
                    }
                }
                Ok(())
            })
            .await;
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
