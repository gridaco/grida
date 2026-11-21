//! GRIDA-SEC-004 / GRIDA-SEC-014 — supervisor-selected per-chat execution access.

use super::*;
use crate::permissions::PermissionMode;
use std::collections::BTreeSet;
use std::io::Write;

const SCHEMA: &str = "grida.agent.permission-mode";
const MAX_RECEIPTS: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PermissionModeSnapshot {
    pub session_id: SessionId,
    pub revision: u64,
    pub mode: PermissionMode,
    pub available: Vec<PermissionMode>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PermissionModeUpdate {
    pub cwd: PathBuf,
    pub session_id: SessionId,
    pub expected_revision: u64,
    pub request_id: ChangeId,
    pub mode: PermissionMode,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PermissionModeReceipt {
    #[serde(flatten)]
    pub state: PermissionModeSnapshot,
    pub request_id: ChangeId,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ledger {
    schema: String,
    session_id: SessionId,
    cwd: PathBuf,
    revision: u64,
    mode: PermissionMode,
    receipts: BTreeMap<ChangeId, (PermissionModeUpdate, PermissionModeReceipt)>,
    #[serde(default)]
    acknowledged: BTreeSet<ChangeId>,
}

impl Host {
    async fn permission_mode_scope(&self, cwd: &Path, session: &SessionId) -> Result<SessionView> {
        let cwd = canonical_workspace(cwd)?;
        let view = self.store.inspect(session.clone()).await?;
        let configuration = session_configuration(&view)?;
        if configuration.subagent.is_some() || configuration.side.is_some() {
            return Err(problem(ErrorKind::Unavailable, "session_missing"));
        }
        if configuration.cwd != cwd {
            return Err(problem(ErrorKind::Conflict, "session_workspace_mismatch"));
        }
        Ok(view)
    }

    fn permission_mode_path(&self, session: &SessionId) -> Result<PathBuf> {
        Ok(self
            .state_dir
            .as_ref()
            .ok_or_else(storage_unavailable)?
            .join("permission-modes")
            .join(format!(
                "{}.json",
                Fingerprint::of(&(SCHEMA, session))?.to_hex()
            )))
    }

    fn read_permission_mode(&self, session: &SessionId, cwd: &Path) -> Result<Option<Ledger>> {
        let path = self.permission_mode_path(session)?;
        match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(storage_unavailable()),
            Ok(_) => {}
        }
        let bytes = crate::launch_permissions::read_profile(&path)?;
        let ledger: Ledger = serde_json::from_slice(&bytes).map_err(|_| storage_unavailable())?;
        if ledger.schema != SCHEMA
            || &ledger.session_id != session
            || ledger.cwd != cwd
            || ledger.revision == 0
            || ledger.receipts.len() > MAX_RECEIPTS
            || ledger
                .acknowledged
                .iter()
                .any(|id| !ledger.receipts.contains_key(id))
            || ledger.receipts.iter().any(|(id, (update, receipt))| {
                update.session_id != ledger.session_id
                    || update.cwd != ledger.cwd
                    || &update.request_id != id
                    || &receipt.request_id != id
                    || receipt.state.session_id != ledger.session_id
                    || receipt.state.mode != update.mode
                    || update.expected_revision.checked_add(1) != Some(receipt.state.revision)
                    || receipt.state.revision > ledger.revision
                    || (receipt.state.revision == ledger.revision
                        && receipt.state.mode != ledger.mode)
            })
        {
            return Err(storage_unavailable());
        }
        Ok(Some(ledger))
    }

    fn write_permission_mode(&self, ledger: &Ledger) -> Result<()> {
        let path = self.permission_mode_path(&ledger.session_id)?;
        let parent = path.parent().ok_or_else(storage_unavailable)?;
        if !parent.exists() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                std::fs::DirBuilder::new()
                    .mode(0o700)
                    .create(parent)
                    .map_err(|_| storage_unavailable())?;
            }
        }
        crate::scratch::check_private_directory(parent)?;
        let mut file = tempfile::Builder::new()
            .prefix(".permission-mode-stage-")
            .tempfile_in(parent)
            .map_err(|_| storage_unavailable())?;
        let bytes = serde_json::to_vec(ledger).map_err(|_| storage_unavailable())?;
        if bytes.len() > 64 * 1024 {
            return Err(storage_unavailable());
        }
        file.write_all(&bytes)
            .and_then(|_| file.as_file().sync_all())
            .map_err(|_| storage_unavailable())?;
        file.persist(&path).map_err(|_| storage_unavailable())?;
        std::fs::File::open(parent)
            .and_then(|f| f.sync_all())
            .map_err(|_| storage_unavailable())
    }

    /// Called under configuration admission when inspecting or selecting access for new work.
    fn current_permission_ledger(&self, session: &SessionId, cwd: PathBuf) -> Result<Ledger> {
        let Some(mut ledger) = self.read_permission_mode(session, &cwd)? else {
            return Ok(Ledger {
                schema: SCHEMA.into(),
                session_id: session.clone(),
                cwd,
                revision: 0,
                mode: self.initial_permission_mode(),
                receipts: BTreeMap::new(),
                acknowledged: BTreeSet::new(),
            });
        };
        if ledger.mode == PermissionMode::ApproveForMe
            && !self.supports_permission_mode(ledger.mode)
        {
            // Retain old receipts for idempotent retries. Restoring reviewer support
            // later requires a fresh selection before new inputs can use it again.
            ledger.mode = PermissionMode::Restricted;
            ledger.revision = ledger
                .revision
                .checked_add(1)
                .ok_or_else(storage_unavailable)?;
            self.write_permission_mode(&ledger)?;
        }
        Ok(ledger)
    }

    fn initial_permission_mode(&self) -> PermissionMode {
        self.permissions
            .as_ref()
            .map_or(PermissionMode::Restricted, |p| p.initial_mode())
    }

    pub(super) fn selected_permission_mode(&self, session: &SessionView) -> Result<PermissionMode> {
        let configuration = session_configuration(session)?;
        if let Some(side) = configuration.side {
            return Ok(side.permission_mode);
        }
        // In-memory hosts have no retained selection and stay with their explicit
        // launch posture. Desktop always has private state.
        if self.state_dir.is_none() {
            return Ok(self.initial_permission_mode());
        }
        Ok(self
            .current_permission_ledger(&session.session, configuration.cwd)?
            .mode)
    }

    fn supports_permission_mode(&self, mode: PermissionMode) -> bool {
        self.permissions
            .as_ref()
            .map_or(mode == PermissionMode::Restricted, |profile| {
                profile.supports_mode(mode)
            })
    }

    fn permission_mode_snapshot(
        &self,
        session: SessionId,
        revision: u64,
        mode: PermissionMode,
    ) -> PermissionModeSnapshot {
        let available = [
            PermissionMode::Restricted,
            PermissionMode::ApproveForMe,
            PermissionMode::FullAccess,
        ]
        .into_iter()
        .filter(|mode| self.supports_permission_mode(*mode))
        .collect();
        PermissionModeSnapshot {
            session_id: session,
            revision,
            mode,
            available,
        }
    }

    pub async fn permission_mode(
        &self,
        cwd: PathBuf,
        session: SessionId,
    ) -> Result<PermissionModeSnapshot> {
        let _admission = self.configuration_admission.lock().await;
        let view = self.permission_mode_scope(&cwd, &session).await?;
        let cwd = session_configuration(&view)?.cwd;
        let ledger = self.current_permission_ledger(&session, cwd)?;
        if !self.supports_permission_mode(ledger.mode) {
            return Err(problem(
                ErrorKind::Unavailable,
                "permission_mode_unavailable",
            ));
        }
        Ok(self.permission_mode_snapshot(session, ledger.revision, ledger.mode))
    }

    /// Only a trusted supervisor may call this after authenticating the user's
    /// explicit choice. No dedicated model-facing operation grants this authority.
    pub async fn update_permission_mode(
        &self,
        update: PermissionModeUpdate,
    ) -> Result<PermissionModeReceipt> {
        // A setting change and each input's permission capture are ordered at admission.
        let _admission = self.configuration_admission.lock().await;
        let view = self
            .permission_mode_scope(&update.cwd, &update.session_id)
            .await?;
        let cwd = session_configuration(&view)?.cwd;
        let mut ledger = self.current_permission_ledger(&update.session_id, cwd)?;
        if let Some((original, receipt)) = ledger.receipts.get(&update.request_id) {
            return if original == &update {
                Ok(receipt.clone())
            } else {
                Err(problem(
                    ErrorKind::Conflict,
                    "permission_mode_request_changed",
                ))
            };
        }
        {
            let work = self.work.lock().await;
            if work.closed {
                return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
            }
            if work.retiring.contains(&update.session_id) {
                return Err(problem(ErrorKind::Conflict, "permission_mode_busy"));
            }
        }
        if ledger.revision != update.expected_revision {
            return Err(problem(
                ErrorKind::Conflict,
                "permission_mode_revision_changed",
            ));
        }
        if !self.supports_permission_mode(update.mode) {
            return Err(problem(
                ErrorKind::Unavailable,
                "permission_mode_unavailable",
            ));
        }
        if update.mode == PermissionMode::FullAccess {
            self.permissions
                .as_ref()
                .ok_or_else(storage_unavailable)?
                .full_access_profile()?;
        }
        ledger.revision = ledger
            .revision
            .checked_add(1)
            .ok_or_else(storage_unavailable)?;
        ledger.mode = update.mode;
        let receipt = PermissionModeReceipt {
            state: self.permission_mode_snapshot(
                update.session_id.clone(),
                ledger.revision,
                ledger.mode,
            ),
            request_id: update.request_id.clone(),
        };
        for id in std::mem::take(&mut ledger.acknowledged) {
            ledger.receipts.remove(&id);
        }
        if ledger.receipts.len() >= MAX_RECEIPTS {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "permission_mode_receipt_limit",
            ));
        }
        ledger
            .receipts
            .insert(update.request_id.clone(), (update, receipt.clone()));
        self.write_permission_mode(&ledger)?;
        Ok(receipt)
    }

    pub async fn acknowledge_permission_mode(
        &self,
        cwd: PathBuf,
        session: SessionId,
        request: ChangeId,
    ) -> Result<()> {
        let _admission = self.configuration_admission.lock().await;
        let view = self.permission_mode_scope(&cwd, &session).await?;
        let cwd = session_configuration(&view)?.cwd;
        let Some(mut ledger) = self.read_permission_mode(&session, &cwd)? else {
            return Ok(());
        };
        if ledger.receipts.contains_key(&request) && ledger.acknowledged.insert(request) {
            self.write_permission_mode(&ledger)?;
        }
        Ok(())
    }

    pub(super) fn retire_permission_mode(&self, session: &SessionId) -> Result<()> {
        let path = self.permission_mode_path(session)?;
        match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(_) => return Err(storage_unavailable()),
            Ok(_) => {}
        }
        // Validate private custody before removing a derived session record.
        let bytes = crate::launch_permissions::read_profile(&path)?;
        let ledger: Ledger = serde_json::from_slice(&bytes).map_err(|_| storage_unavailable())?;
        self.read_permission_mode(session, &ledger.cwd)?;
        std::fs::remove_file(&path).map_err(|_| storage_unavailable())?;
        std::fs::File::open(path.parent().ok_or_else(storage_unavailable)?)
            .and_then(|f| f.sync_all())
            .map_err(|_| storage_unavailable())
    }

    pub(super) async fn reconcile_permission_modes(&self) -> Result<()> {
        let _admission = self.configuration_admission.lock().await;
        let directory = self
            .state_dir
            .as_ref()
            .ok_or_else(storage_unavailable)?
            .join("permission-modes");
        if !directory.exists() {
            return Ok(());
        }
        crate::scratch::check_private_directory(&directory)?;
        for (index, entry) in std::fs::read_dir(&directory)
            .map_err(|_| storage_unavailable())?
            .enumerate()
        {
            if index >= 4096 {
                return Err(storage_unavailable());
            }
            let path = entry.map_err(|_| storage_unavailable())?.path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(storage_unavailable)?;
            let bytes = crate::launch_permissions::read_profile(&path)?;
            if name.starts_with(".permission-mode-stage-") {
                std::fs::remove_file(path).map_err(|_| storage_unavailable())?;
                continue;
            }
            let ledger: Ledger =
                serde_json::from_slice(&bytes).map_err(|_| storage_unavailable())?;
            if self.permission_mode_path(&ledger.session_id)? != path {
                return Err(storage_unavailable());
            }
            self.read_permission_mode(&ledger.session_id, &ledger.cwd)?;
            match self.store.inspect(ledger.session_id.clone()).await {
                Ok(_) => {}
                Err(error) if error.code == "session_missing" => {
                    self.retire_permission_mode(&ledger.session_id)?
                }
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }
}

fn storage_unavailable() -> Error {
    problem(
        ErrorKind::Unavailable,
        "permission_mode_storage_unavailable",
    )
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;

    fn host(path: &Path) -> Host {
        Host::open(
            path,
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:9/v1".into(),
                protocol: ProviderProtocol::OpenAiCompatible,
                model: ModelId::new("fixture").unwrap(),
                credential_env: None,
                credential_home: None,
                max_output_tokens: 1024,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: false,
            }),
        )
        .unwrap()
    }

    fn update(
        cwd: &Path,
        session: &SessionId,
        revision: u64,
        id: &str,
        mode: PermissionMode,
    ) -> PermissionModeUpdate {
        PermissionModeUpdate {
            cwd: cwd.to_owned(),
            session_id: session.clone(),
            expected_revision: revision,
            request_id: ChangeId::new(id).unwrap(),
            mode,
        }
    }

    #[tokio::test]
    async fn selections_are_private_per_chat_durable_exact_and_do_not_start_work() {
        let root = tempfile::tempdir().unwrap();
        let cwd = root.path().canonicalize().unwrap();
        let state = cwd.join("state");
        let host = host(&state);
        let a = host.new_session(cwd.clone()).await.unwrap();
        let b = host.new_session(cwd.clone()).await.unwrap();
        let before = host.inspect(a.clone()).await.unwrap();
        let expected = host.permission_mode(cwd.clone(), a.clone()).await.unwrap();
        assert_eq!(expected.mode, PermissionMode::Restricted);
        assert_eq!(expected.revision, 0);
        assert_eq!(expected.available, [PermissionMode::Restricted]);
        let change = update(&cwd, &a, 0, "explicit-choice", PermissionMode::Restricted);
        let receipt = host.update_permission_mode(change.clone()).await.unwrap();
        assert_eq!(receipt.state.revision, 1);
        assert_eq!(
            host.update_permission_mode(change.clone()).await.unwrap(),
            receipt
        );
        assert_eq!(host.inspect(a.clone()).await.unwrap(), before);
        assert_eq!(
            host.permission_mode(cwd.clone(), b.clone())
                .await
                .unwrap()
                .revision,
            0
        );
        let mut conflicting = change.clone();
        conflicting.mode = PermissionMode::FullAccess;
        assert_eq!(
            host.update_permission_mode(conflicting)
                .await
                .unwrap_err()
                .code,
            "permission_mode_request_changed"
        );
        drop(host);
        let host = Host::open(&state, None).unwrap();
        assert_eq!(
            host.permission_mode(cwd.clone(), a.clone()).await.unwrap(),
            receipt.state
        );
        assert_eq!(host.update_permission_mode(change).await.unwrap(), receipt);
        assert_eq!(
            host.permission_mode(cwd.clone(), b).await.unwrap().revision,
            0
        );
        assert_eq!(
            host.update_permission_mode(update(
                &cwd,
                &a,
                1,
                "unsupported",
                PermissionMode::FullAccess
            ))
            .await
            .unwrap_err()
            .code,
            "permission_mode_unavailable"
        );
        assert_eq!(
            host.update_permission_mode(update(&cwd, &a, 0, "stale", PermissionMode::Restricted))
                .await
                .unwrap_err()
                .code,
            "permission_mode_revision_changed"
        );
    }

    #[tokio::test]
    async fn acknowledged_updates_do_not_impose_a_lifetime_change_limit() {
        let root = tempfile::tempdir().unwrap();
        let cwd = root.path().canonicalize().unwrap();
        let host = host(&cwd.join("state"));
        let session = host.new_session(cwd.clone()).await.unwrap();
        for revision in 0..80 {
            let request = update(
                &cwd,
                &session,
                revision,
                &format!("change-{revision}"),
                PermissionMode::Restricted,
            );
            let receipt = host.update_permission_mode(request.clone()).await.unwrap();
            host.acknowledge_permission_mode(
                cwd.clone(),
                session.clone(),
                request.request_id.clone(),
            )
            .await
            .unwrap();
            host.acknowledge_permission_mode(
                cwd.clone(),
                session.clone(),
                request.request_id.clone(),
            )
            .await
            .unwrap();
            assert_eq!(host.update_permission_mode(request).await.unwrap(), receipt);
        }
        let ledger = host.read_permission_mode(&session, &cwd).unwrap().unwrap();
        assert_eq!(ledger.revision, 80);
        assert_eq!(ledger.receipts.len(), 1);
    }

    #[tokio::test]
    async fn the_next_permission_choice_can_change_while_a_settled_turn_finishes_cleanup() {
        let root = tempfile::tempdir().unwrap();
        let cwd = root.path().canonicalize().unwrap();
        let host = host(&cwd.join("state"));
        let session = host.new_session(cwd.clone()).await.unwrap();
        // Reproduce the interval after durable settlement and before the host
        // has finished retiring the turn's child processes.
        host.write_permission_mode(&Ledger {
            schema: SCHEMA.into(),
            session_id: session.clone(),
            cwd: cwd.clone(),
            revision: 1,
            mode: PermissionMode::FullAccess,
            receipts: BTreeMap::new(),
            acknowledged: BTreeSet::new(),
        })
        .unwrap();
        let cleanup = tokio::spawn(std::future::pending::<()>());
        host.work.lock().await.active.insert(
            session.clone(),
            Active {
                turn: TurnId::new("settled-turn").unwrap(),
                admitted: true,
                handle: cleanup.abort_handle(),
                pending_stop: None,
                missed_stop: false,
            },
        );
        let change = host.update_permission_mode(update(
            &cwd,
            &session,
            1,
            "downgrade",
            PermissionMode::Restricted,
        ));
        let receipt = tokio::time::timeout(Duration::from_secs(2), change)
            .await
            .expect("the composer choice is independent of process cleanup")
            .unwrap();
        assert_eq!(receipt.state.mode, PermissionMode::Restricted);
        cleanup.abort();
    }

    #[tokio::test]
    async fn changed_scope_and_unsafe_storage_cannot_supply_permission_settings() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let cwd = root.path().canonicalize().unwrap();
        let other = cwd.join("other");
        std::fs::create_dir(&other).unwrap();
        let host = host(&cwd.join("state"));
        let session = host.new_session(cwd.clone()).await.unwrap();
        assert_eq!(
            host.permission_mode(other, session.clone())
                .await
                .unwrap_err()
                .code,
            "session_workspace_mismatch"
        );
        host.update_permission_mode(update(
            &cwd,
            &session,
            0,
            "private",
            PermissionMode::Restricted,
        ))
        .await
        .unwrap();
        let path = host.permission_mode_path(&session).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(
            host.permission_mode(cwd.clone(), session.clone())
                .await
                .is_err()
        );
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        host.retire_permission_mode(&session).unwrap();
        assert!(!path.exists());
    }
}
