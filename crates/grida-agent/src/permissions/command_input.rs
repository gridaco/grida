//! GRIDA-SEC-004 / GRIDA-SEC-014 — finite commands consume one admitted text file.

use super::*;
use crate::processes::{FiniteCommand, FiniteLaunch, SpawnFiniteCommand};

impl TurnPermissions {
    pub(super) fn command_input_scope(&self, root: PathBuf) -> Result<ProcessScope> {
        if self.command_file_input() == CommandFileInput::None || self.profile.unconfined {
            return Err(denied());
        }
        let mut scope =
            self.profile
                .command_scope(self.commands.clone(), root, CommandAccess::Read)?;
        scope.disk_read = false;
        Ok(ProcessScope::Confined(scope))
    }

    pub(super) fn command_input_fingerprint(
        source: Fingerprint,
        command: Fingerprint,
    ) -> Result<Fingerprint> {
        Fingerprint::of(&(source, "command-file-input-v1", command))
    }

    pub(super) fn capture_command_input(
        &self,
        admission: &ToolAdmission,
        source: &ScopedCommandInput,
        command: Fingerprint,
    ) -> Result<(Ready, AccessRule)> {
        if self.state()?.revoked.contains(&source.directory) {
            return Err(revoked());
        }
        let (root, scope, rule) = match source.directory.as_str() {
            EXTERNAL_FILE_DIRECTORY if self.allow_external_file_read => {
                let (_, scope) = self.open_external_file(&source.path)?;
                (PathBuf::from("/"), scope, AccessRule::Ask)
            }
            EXTERNAL_FILE_DIRECTORY => return Err(denied()),
            _ => {
                let directory = self.captured_directory(Some(&source.directory))?;
                let rules = self
                    .profile
                    .directories
                    .get(&source.directory)
                    .ok_or_else(denied)?;
                if rules.read == AccessRule::Deny || self.profile.shell_covers_text_read(rules) {
                    return Err(denied());
                }
                let scope =
                    Fingerprint::of(&(self.profile.identity, directory.permission_identity()?))?;
                (directory.root().to_owned(), scope, rules.read)
            }
        };
        Ok((
            Ready {
                request: ApprovalRequest {
                    launch_scope: None,
                    session: self.selection.0.clone(),
                    turn: self.selection.1.clone(),
                    operation: admission.operation.clone(),
                    action: admission.invocation.fingerprint(),
                    scope: Self::command_input_fingerprint(scope, command)?,
                    directory: source.directory.clone(),
                    root,
                    effect: ApprovalEffect::Read {
                        tool: ToolId::new("read_file")?,
                        relative_path: source.path.clone(),
                        query: None,
                    },
                },
                command_capture: Some(command),
                approval: None,
                active: None,
            },
            rule,
        ))
    }

    pub(super) fn command_file_authority(
        self: &Arc<Self>,
        invocation: &Invocation,
    ) -> Result<AuthorizedProcess> {
        let directory = self.captured_directory(None)?;
        let primary = directory.spec().id.clone();
        let root = directory.root().to_owned();
        let scope = self.command_input_scope(root.clone())?;
        let command = self
            .profile
            .command
            .as_ref()
            .ok_or_else(command_unavailable)?;
        let operation = invocation.id().clone();
        let action = invocation.fingerprint();
        let (source, path, expected) = {
            let state = self.state()?;
            let ready = current(&state, &operation, action)?;
            let ApprovalEffect::Read {
                relative_path,
                query: None,
                ..
            } = &ready.request.effect
            else {
                return Err(denied());
            };
            (
                ready.request.directory.clone(),
                relative_path.clone(),
                ready.command_capture.ok_or_else(denied)?,
            )
        };
        let owner = self.clone();
        let invocation = invocation.clone();
        let spawn: Arc<SpawnFiniteCommand> = Arc::new(move |process, launch, stop| {
            if !matches!(launch, FiniteLaunch::Confined) {
                return Err(denied());
            }
            let files = owner.bound_file_tools(None, None, Default::default())?;
            let input = files.command_input(
                invocation.clone(),
                source.clone(),
                path.clone(),
                stop.clone(),
            )?;
            let mut state = owner.state()?;
            if state.revoked.contains(&primary) {
                return Err(revoked());
            }
            current(&state, &operation, action)?;
            let ready = state.ready.get_mut(&operation).ok_or_else(denied)?;
            if ready.active.is_some() {
                return Err(denied());
            }
            let running = process.spawn_with_input(input, stop.clone())?;
            ready.active = Some(stop);
            Ok(FiniteCommand::Confined(running))
        });
        Ok(AuthorizedProcess {
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            network_home: None,
            spawn_finite: Some(spawn),
            scope,
            expected,
            environment: command.environment.clone(),
            root,
            spawn: Arc::new(|_, _, _| Err(denied())),
        })
    }
}
