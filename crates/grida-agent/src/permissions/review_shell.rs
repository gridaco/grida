//! GRIDA-SEC-004 / GRIDA-SEC-014 — privately inspect the parent's readable
//! environment using the existing native read-only sandbox and an empty stdin.

use super::*;
use agent_kit_sandbox::{Completion, StopReason};

impl PermissionProfile {
    pub(super) fn supports_review_shell(&self) -> bool {
        cfg!(any(target_os = "macos", target_os = "linux"))
            && self.command.is_some()
            && !self.hooks_only
            && !self.unconfined
            && self
                .directories
                .values()
                .any(|rule| rule.command_read == AccessRule::Allow)
    }
}

impl TurnPermissions {
    pub(crate) const MAX_REVIEW_COMMAND_BYTES: usize = 4096;

    pub(crate) fn allows_review_shell(&self) -> bool {
        self.review_shell
            && self.approve_for_me
            && self.binding.get().is_some()
            && self.state().is_ok_and(|state| {
                self.profile.directories.iter().any(|(id, rule)| {
                    rule.command_read == AccessRule::Allow && !state.revoked.contains(id)
                })
            })
    }

    /// Private evidence can be reused only with the same reader. Include live
    /// revocations and pinned workspace identities independently of turn IDs.
    pub(crate) fn review_context_identity(&self) -> Result<Fingerprint> {
        let workspace = self
            .profile
            .workspace
            .permission_identity(&self.profile.protected)?;
        Fingerprint::of(&(
            self.profile.identity,
            workspace,
            self.approve_for_me,
            self.review_shell,
            self.plan,
            self.broad_command_reads,
            &self.state()?.revoked,
        ))
    }

    /// The private reviewer has no process registry or foreground terminal
    /// handles. Finish supervision and revalidate the read grant before returning
    /// any bytes. Dropping the surrounding review also stops its native process.
    pub(crate) async fn run_review_command(
        &self,
        cmd: &str,
        directory: Option<&BindingId>,
        stop: &CancellationToken,
        deadline: Instant,
    ) -> Result<(bool, String)> {
        if !self.allows_review_shell() || stop.is_cancelled() {
            return Err(denied());
        }
        let command = self
            .profile
            .command
            .as_ref()
            .ok_or_else(command_unavailable)?;
        let root = self.captured_directory(directory)?;
        if cmd.trim().is_empty()
            || cmd.len() > Self::MAX_REVIEW_COMMAND_BYTES.min(command.limits.max_input_bytes)
            || self
                .profile
                .directories
                .get(&root.spec().id)
                .is_none_or(|rule| rule.command_read != AccessRule::Allow)
        {
            return Err(denied());
        }
        let mut scope = self.profile.command_scope(
            self.commands.clone(),
            root.root().to_owned(),
            CommandAccess::Read,
        )?;
        if self.plan {
            scope.disk_read &= self.broad_command_reads;
        }
        scope.valid_until = scope.valid_until.min(deadline);
        let readership = {
            let state = self.state()?;
            if state.revoked.contains(&root.spec().id) {
                return Err(revoked());
            }
            for entry in self.profile.workspace.directories() {
                if state.revoked.contains(&entry.spec().id) {
                    scope.protected.push(ProtectedPath {
                        path: entry.root().to_owned(),
                        access: DeniedAccess::ReadWrite,
                    });
                }
            }
            state.review_readers.clone()
        };
        let limit = Self::MAX_REVIEW_FILE_BYTES.min(command.limits.max_output_bytes);
        let spec = ProcessSpec {
            executable: "/bin/sh".into(),
            arguments: vec!["-c".into(), cmd.into()],
            cwd: root.root().to_owned(),
            environment: BTreeMap::from([("PATH".into(), "/usr/bin:/bin".into())]),
            stdin: vec![],
            timeout: scope
                .valid_until
                .saturating_duration_since(Instant::now())
                .min(Duration::from_secs(10)),
            // Retain a bounded prefix for the model when a normal command
            // completes. The supervisor still terminates runaway output.
            max_output_bytes: command.limits.max_output_bytes.min(64 * 1024),
        };
        let sandbox = Arc::clone(&command.sandbox);
        let prepared = tokio::task::spawn_blocking(move || sandbox.prepare(spec, scope))
            .await
            .map_err(|_| command_unavailable())??;
        validate_working_root(&prepared, root)?;
        let run = stop.child_token();
        let running = {
            let _state = self.state()?;
            if readership.is_cancelled() || stop.is_cancelled() {
                return Err(revoked());
            }
            prepared.spawn(run.clone())?
        };
        let mut finished = std::pin::pin!(running.finish());
        let evidence = tokio::select! {
            biased;
            _ = readership.cancelled() => {
                run.cancel();
                let _ = finished.await?;
                return Err(revoked());
            }
            result = &mut finished => result?,
        };
        if !crate::command::cleanup_verified(&evidence)
            || stop.is_cancelled()
            || readership.is_cancelled()
            || Instant::now() >= deadline
        {
            return Err(denied());
        }
        self.captured_directory(directory)?;
        if matches!(
            evidence.completion,
            Completion::SetupFailed | Completion::Uncertain
        ) || matches!(
            evidence.stopped,
            Some(StopReason::Requested | StopReason::Deadline | StopReason::InputLimit)
        ) {
            return Err(command_unavailable());
        }
        let success = evidence.completion == Completion::Exited(0) && evidence.stopped.is_none();
        let mut bytes = evidence.stdout;
        bytes.extend(evidence.stderr);
        let mut text = String::from_utf8_lossy(&bytes).into_owned();
        if evidence.output_truncated
            || evidence.stopped == Some(StopReason::OutputLimit)
            || text.len() > limit
        {
            const MARKER: &str = "\n[output truncated]";
            let end = text.floor_char_boundary(limit.saturating_sub(MARKER.len()));
            text.truncate(end);
            text.push_str(&MARKER[..MARKER.len().min(limit)]);
        }
        Ok((success, text))
    }
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::os::unix::fs::DirBuilderExt;

    struct Project {
        _temp: tempfile::TempDir,
        root: PathBuf,
        scope: Arc<PermissionProfile>,
    }

    impl Project {
        fn new(disk_read: bool) -> Self {
            fn trusted(variable: &str) -> TrustedExecutable {
                let path = PathBuf::from(std::env::var_os(variable).expect(variable));
                TrustedExecutable {
                    sha256: Sha256::digest(fs::read(&path).unwrap()).into(),
                    path,
                }
            }
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().canonicalize().unwrap();
            let project = root.join("project");
            let temporary = root.join("sandbox-temporary");
            let second = root.join("second");
            for path in [&project, &temporary, &second] {
                fs::DirBuilder::new().mode(0o700).create(path).unwrap();
            }
            fs::write(root.join("outside"), "outside").unwrap();
            fs::write(project.join("allowed"), "project").unwrap();
            fs::write(second.join("allowed"), "secondary").unwrap();
            let secret = root.join("protected");
            fs::write(&secret, "protected").unwrap();
            let primary = BindingId::new("project").unwrap();
            let secondary = BindingId::new("second").unwrap();
            let roots =
                [(primary.clone(), project), (secondary.clone(), second)].map(|(id, path)| {
                    crate::workspace::DirectorySpec {
                        name: id.to_string(),
                        id,
                        path,
                        generation: BindingId::new("fixture").unwrap(),
                    }
                });
            let workspace = WorkspaceSnapshot::capture(
                BindingId::new("workspace").unwrap(),
                1,
                Vec::from(roots),
                Some(primary.clone()),
                &ProtectedRoots::new(vec![secret.clone()]).unwrap(),
            )
            .unwrap();
            let access = DirectoryAccess {
                read: AccessRule::Allow,
                command_read: AccessRule::Allow,
                ..DirectoryAccess::default()
            };
            let command = CommandProfile {
                sandbox: Arc::new(
                    Sandbox::new(agent_kit_sandbox::Installation {
                        helper: trusted("GRIDA_AGENT_TEST_SANDBOX_HELPER"),
                        #[cfg(target_os = "linux")]
                        bubblewrap: Some(trusted("AGENT_KIT_TEST_BWRAP")),
                        #[cfg(target_os = "macos")]
                        bubblewrap: None,
                    })
                    .unwrap(),
                ),
                temporary_parent: temporary,
                runtime_paths: [
                    "/bin",
                    "/usr/bin",
                    "/lib",
                    "/lib64",
                    "/usr/lib",
                    "/usr/lib64",
                    "/System/Library",
                    "/private/var/select",
                ]
                .into_iter()
                .map(PathBuf::from)
                .filter(|p| p.is_dir())
                .collect(),
                termination: Termination::ProcessGroup,
                limits: CommandLimits {
                    timeout: Duration::from_secs(10),
                    max_input_bytes: 16 * 1024,
                    max_output_bytes: 64 * 1024,
                },
                disk_read,
                environment: Arc::new(BTreeMap::from([("HOST_ONLY".into(), "private".into())])),
            };
            let scope = PermissionProfile::new(
                BindingId::new("fixture").unwrap(),
                Arc::new(workspace),
                BTreeMap::from([(primary, access), (secondary, access)]),
                vec![secret],
                Some(command),
            )
            .unwrap()
            .with_approve_for_me(true);
            Self {
                _temp: temp,
                root,
                scope: Arc::new(scope),
            }
        }

        fn capture(&self) -> PermissionCapture {
            self.scope
                .capture_workspace(
                    ScopeId::new("input").unwrap(),
                    PermissionMode::ApproveForMe,
                    OperatingRegime::Act,
                )
                .unwrap()
        }

        fn bind(&self, capture: &PermissionCapture) -> Arc<TurnPermissions> {
            self.scope
                .bind(
                    capture,
                    TurnBinding {
                        session: SessionId::new("session").unwrap(),
                        turn: TurnId::new("turn").unwrap(),
                        epoch: 1,
                    },
                    Arc::new(SqliteStore::open_in_memory().unwrap()),
                    true,
                )
                .unwrap()
        }
    }

    async fn run(owner: &TurnPermissions, cmd: &str) -> (bool, String) {
        owner
            .run_review_command(
                cmd,
                None,
                &CancellationToken::new(),
                Instant::now() + Duration::from_secs(20),
            )
            .await
            .unwrap_or_else(|error| panic!("private command {cmd:?} failed: {error:?}"))
    }

    #[tokio::test]
    #[ignore = "requires the trusted native helper and working Seatbelt or bubblewrap"]
    async fn private_shell_inherits_read_scope_without_network_writes_environment_or_approval() {
        for disk in [false, true] {
            let project = Project::new(disk);
            let capture = project.capture();
            let owner = project.bind(&capture);
            assert!(owner.allows_review_shell());
            let result = run(
                &owner,
                "cat allowed; test -z \"$HOST_ONLY\" && printf scratch > \"$TMPDIR/inspection\"",
            )
            .await;
            assert_eq!(result, (true, "project".into()));
            let (completed, truncated) = run(
                &owner,
                r#"i=0; while [ "$i" -lt 1000 ]; do printf 0123456789; i=$((i + 1)); done"#,
            )
            .await;
            assert!(completed, "{truncated}");
            assert!(truncated.len() <= TurnPermissions::MAX_REVIEW_FILE_BYTES);
            assert!(truncated.ends_with("[output truncated]"));
            let (readable, output) = run(&owner, "cat ../outside").await;
            assert_eq!(readable, disk);
            if disk {
                assert_eq!(output, "outside");
            }
            let (readable, output) = run(&owner, "cat ../protected 2>/dev/null").await;
            assert_eq!((readable, output), (false, String::new()));
            assert!(!run(&owner, "printf change > allowed").await.0);
            assert_eq!(
                fs::read_to_string(project.root.join("project/allowed")).unwrap(),
                "project"
            );
            let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
            let cmd = format!(
                "/usr/bin/curl --noproxy '*' -s --max-time 1 http://{}/",
                listener.local_addr().unwrap()
            );
            assert!(!run(&owner, &cmd).await.0);
            listener.set_nonblocking(true).unwrap();
            assert_eq!(
                listener.accept().unwrap_err().kind(),
                std::io::ErrorKind::WouldBlock
            );

            // A turn accepted before the private shell grant stays file-only.
            let mut older = serde_json::to_value(&capture).unwrap();
            older.as_object_mut().unwrap().remove("review_shell");
            let retained = project.bind(&serde_json::from_value(older).unwrap());
            assert!(!retained.allows_review_shell());
            assert!(retained.allows_review_inspection());
            assert_ne!(
                owner.review_context_identity().unwrap(),
                retained.review_context_identity().unwrap()
            );
            let secondary = BindingId::new("second").unwrap();
            let scope_before = owner.review_context_identity().unwrap();
            assert_eq!(
                owner
                    .run_review_command(
                        "cat allowed",
                        Some(&secondary),
                        &CancellationToken::new(),
                        Instant::now() + Duration::from_secs(10)
                    )
                    .await
                    .unwrap(),
                (true, "secondary".into())
            );
            owner.revoke(&secondary).unwrap();
            assert_ne!(scope_before, owner.review_context_identity().unwrap());
            assert!(!run(&owner, "cat ../second/allowed").await.0);
            let previous = owner.review_context_identity().unwrap();
            owner
                .revoke(project.scope.workspace.primary().unwrap())
                .unwrap();
            assert_ne!(previous, owner.review_context_identity().unwrap());
            assert!(!owner.allows_review_shell());
        }
    }

    #[tokio::test]
    #[ignore = "requires the trusted native helper and working Seatbelt or bubblewrap"]
    async fn cancelling_or_revoking_private_inspection_drains_and_withholds_output() {
        for revoke in [false, true] {
            let project = Project::new(false);
            let capture = project.capture();
            let owner = project.bind(&capture);
            let stop = CancellationToken::new();
            let until = Instant::now() + Duration::from_secs(15);
            let run = owner.run_review_command(
                "printf started > \"$TMPDIR/running\"; printf private; exec /bin/sleep 8",
                None,
                &stop,
                until,
            );
            tokio::pin!(run);
            let scratch = project.root.join("sandbox-temporary");
            tokio::time::timeout(Duration::from_secs(4), async {
                loop {
                    tokio::select! {
                        _ = &mut run => panic!("shell should be waiting"),
                        _ = tokio::time::sleep(Duration::from_millis(10)) => {}
                    }
                    if fs::read_dir(&scratch)
                        .unwrap()
                        .any(|entry| entry.unwrap().path().join("running").exists())
                    {
                        break;
                    }
                }
            })
            .await
            .unwrap();
            if revoke {
                owner
                    .revoke(project.scope.workspace.primary().unwrap())
                    .unwrap()
            } else {
                stop.cancel()
            }
            assert!(
                tokio::time::timeout(Duration::from_secs(4), run)
                    .await
                    .unwrap()
                    .is_err()
            );
            assert_eq!(fs::read_dir(scratch).unwrap().count(), 0);
        }
    }
}
