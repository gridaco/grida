//! GRIDA-SEC-004 / GRIDA-SEC-014 — trusted launch-only permission input.

use crate::command::CommandLimits;
use crate::permissions::{
    AccessRule, CommandProfile, CompletionHook, DirectoryAccess, PermissionProfile,
};
use crate::workspace::{DirectorySpec, ProtectedRoots, WorkspaceSnapshot, validate_absolute};
use agent_kit_core::{BindingId, Error, ErrorKind, Fingerprint, Result};
use agent_kit_sandbox::{
    DeniedAccess, Installation, ProtectedPath, Sandbox, Termination, TrustedExecutable,
};
use grida_agent_master::hooks::CheckMode;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const MAX_PROFILE_BYTES: u64 = 64 * 1024;
const COMMAND_LIMITS: CommandLimits = CommandLimits {
    timeout: Duration::from_secs(30),
    max_input_bytes: 64 * 1024,
    max_output_bytes: 64 * 1024,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileFile {
    version: u32,
    workspace: BindingId,
    revision: BindingId,
    primary: BindingId,
    directories: Vec<Directory>,
    #[serde(default)]
    protected_paths: Vec<PathBuf>,
    command: Option<Command>,
    before_completion: Option<BeforeCompletion>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Directory {
    id: BindingId,
    name: String,
    path: PathBuf,
    generation: BindingId,
    #[serde(default)]
    read: AccessRule,
    #[serde(default)]
    command_read: AccessRule,
    #[serde(default)]
    command_read_write: AccessRule,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Command {
    helper: Executable,
    bubblewrap: Option<Executable>,
    runtime_paths: Vec<PathBuf>,
    temporary_parent: PathBuf,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Executable {
    path: PathBuf,
    sha256: [u8; 32],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BeforeCompletion {
    executable: Executable,
    #[serde(default)]
    arguments: Vec<String>,
    mode: CheckMode,
    timeout_ms: u32,
}

impl BeforeCompletion {
    fn reviewed(self, command: Option<&Command>) -> Result<CompletionHook> {
        let command = command.ok_or_else(invalid)?;
        let executable = self.executable;
        validate_absolute(&executable.path)?;
        let timeout = Duration::from_millis(u64::from(self.timeout_ms));
        if executable.path.canonicalize().map_err(|_| invalid())? != executable.path
            || timeout.is_zero()
            || timeout > COMMAND_LIMITS.timeout
            || self.arguments.len() > 64
            || self.arguments.iter().map(String::len).sum::<usize>() > 8 * 1024
            || self
                .arguments
                .iter()
                .any(|argument| argument.contains('\0'))
        {
            return Err(invalid());
        }
        let revision = Fingerprint::of(&(
            &executable.path,
            executable.sha256,
            &self.arguments,
            self.mode,
            self.timeout_ms,
            command.helper.sha256,
            command.bubblewrap.as_ref().map(|entry| entry.sha256),
        ))?;
        Ok(CompletionHook {
            executable: executable.into(),
            arguments: self.arguments,
            mode: self.mode,
            timeout,
            revision,
        })
    }
}

impl From<Executable> for TrustedExecutable {
    fn from(executable: Executable) -> Self {
        Self {
            path: executable.path,
            sha256: executable.sha256,
        }
    }
}

/// Load a profile explicitly selected by the supervising native process.
/// The profile is outside model-editable settings. Files and commands share
/// fixed custody denials, and command payloads cannot write installed tools.
pub fn load_permission_profile(
    profile_file: &Path,
    state_directory: &Path,
    credential_home: Option<&Path>,
) -> Result<Arc<PermissionProfile>> {
    let bytes = read_profile(profile_file)?;
    let profile: ProfileFile = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if profile.version != 1 || profile.directories.is_empty() || profile.directories.len() > 32 {
        return Err(invalid());
    }

    let mut read_write = profile.protected_paths;
    read_write.extend([profile_file.to_owned(), state_directory.to_owned()]);
    if let Some(home) = credential_home {
        read_write.push(home.to_owned());
    }
    if let Some(home) = std::env::var_os("GRIDA_HOME").filter(|path| !path.is_empty()) {
        read_write.push(PathBuf::from(home));
    }
    if let Some(home) = std::env::home_dir() {
        read_write.push(home.join(".grida"));
    }
    let mut write = vec![std::env::current_exe().map_err(|_| unavailable())?];
    let completion = profile
        .before_completion
        .map(|hook| hook.reviewed(profile.command.as_ref()))
        .transpose()?;
    if let Some(hook) = &completion {
        write.push(hook.executable.path.clone());
    }
    let command = if let Some(command) = profile.command {
        validate_command_paths(&command)?;
        write.push(command.helper.path.clone());
        if let Some(bubblewrap) = &command.bubblewrap {
            write.push(bubblewrap.path.clone());
        }
        Some(CommandProfile {
            sandbox: Arc::new(Sandbox::new(Installation {
                helper: command.helper.into(),
                bubblewrap: command.bubblewrap.map(Into::into),
            })?),
            runtime_paths: command.runtime_paths,
            temporary_parent: command.temporary_parent,
            termination: if cfg!(target_os = "linux") {
                Termination::AllDescendants
            } else {
                Termination::ProcessGroup
            },
            limits: COMMAND_LIMITS,
        })
    } else {
        None
    };
    let denials: Vec<_> = read_write
        .into_iter()
        .map(|path| ProtectedPath {
            path,
            access: DeniedAccess::ReadWrite,
        })
        .chain(write.into_iter().map(|path| ProtectedPath {
            path,
            access: DeniedAccess::Write,
        }))
        .collect();
    let protected = ProtectedRoots::new(denials.iter().map(|entry| entry.path.clone()).collect())?;
    let mut directories = Vec::new();
    let mut rules = std::collections::BTreeMap::new();
    for directory in profile.directories {
        rules.insert(
            directory.id.clone(),
            DirectoryAccess {
                read: directory.read,
                command_read: directory.command_read,
                command_read_write: directory.command_read_write,
            },
        );
        directories.push(DirectorySpec {
            id: directory.id,
            name: directory.name,
            path: directory.path,
            generation: directory.generation,
        });
    }
    let workspace = WorkspaceSnapshot::capture(
        profile.workspace,
        1,
        directories,
        Some(profile.primary),
        &protected,
    )?;
    let profile = PermissionProfile::with_denials(
        profile.revision,
        Arc::new(workspace),
        rules,
        denials,
        command,
    )?;
    Ok(Arc::new(match completion {
        Some(hook) => profile.with_completion_hook(hook)?,
        None => profile,
    }))
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn validate_command_paths(command: &Command) -> Result<()> {
    if command.runtime_paths.len() > 32 {
        return Err(invalid());
    }
    for path in &command.runtime_paths {
        validate_absolute(path)?;
    }
    crate::scratch::check_private_directory(&command.temporary_parent)?;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn validate_command_paths(_: &Command) -> Result<()> {
    Err(unsupported())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn read_profile(path: &Path) -> Result<Vec<u8>> {
    use rustix::fs::{Mode, OFlags, open};
    use std::fs::{self, File, Metadata};
    use std::io::Read;
    use std::os::unix::fs::MetadataExt;

    fn private(metadata: &Metadata) -> bool {
        metadata.is_file()
            && metadata.uid() == rustix::process::geteuid().as_raw()
            && metadata.mode() & 0o7777 == 0o600
            && metadata.nlink() == 1
    }

    validate_absolute(path)?;
    let parent = path.parent().ok_or_else(invalid)?;
    crate::scratch::check_private_directory(parent)?;
    let before = fs::symlink_metadata(path).map_err(|_| unavailable())?;
    if !private(&before) || fs::canonicalize(path).map_err(|_| unavailable())? != path {
        return Err(invalid());
    }
    let file: File = open(
        path,
        OFlags::RDONLY | OFlags::CLOEXEC | OFlags::NOFOLLOW | OFlags::NONBLOCK,
        Mode::empty(),
    )
    .map_err(|_| unavailable())?
    .into();
    let after = file.metadata().map_err(|_| unavailable())?;
    if !private(&after) || before.dev() != after.dev() || before.ino() != after.ino() {
        return Err(invalid());
    }
    let mut bytes = Vec::new();
    file.take(MAX_PROFILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unavailable())?;
    if bytes.len() as u64 > MAX_PROFILE_BYTES {
        return Err(Error::new(
            ErrorKind::LimitExceeded,
            "permission_profile_too_large",
        ));
    }
    Ok(bytes)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn read_profile(_: &Path) -> Result<Vec<u8>> {
    Err(unsupported())
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn unsupported() -> Error {
    Error::new(
        ErrorKind::Unsupported,
        "permission_profile_platform_unsupported",
    )
}
fn invalid() -> Error {
    Error::new(ErrorKind::InvalidInput, "permission_profile_invalid")
}
fn unavailable() -> Error {
    Error::new(ErrorKind::Unavailable, "permission_profile_unavailable")
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::{PermissionsExt, symlink};

    struct Fixture {
        _base: tempfile::TempDir,
        directory: PathBuf,
        state: PathBuf,
        custody: PathBuf,
        profile: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let base = tempfile::tempdir().unwrap();
            let root = base.path().canonicalize().unwrap();
            let profile_parent = root.join("private");
            let directory = root.join("project");
            let state = root.join("state");
            let custody = root.join("custody");
            for path in [&profile_parent, &directory, &state, &custody] {
                fs::create_dir(path).unwrap();
                fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
            }
            Self {
                _base: base,
                directory,
                state,
                custody,
                profile: profile_parent.join("profile.json"),
            }
        }

        fn write(&self, directory: &Path) {
            fs::write(
                &self.profile,
                serde_json::to_vec(&serde_json::json!({
                    "version":1,"workspace":"work","revision":"selected","primary":"project",
                    "directories":[{"id":"project","name":"Project","path":directory,
                        "generation":"original","read":"allow"}],
                }))
                .unwrap(),
            )
            .unwrap();
            fs::set_permissions(&self.profile, fs::Permissions::from_mode(0o600)).unwrap();
        }

        fn load(&self) -> Result<Arc<PermissionProfile>> {
            load_permission_profile(&self.profile, &self.state, Some(&self.custody))
        }
    }

    #[test]
    fn explicit_profile_matches_only_the_native_primary_directory() {
        let fixture = Fixture::new();
        fixture.write(&fixture.directory);
        let profile = fixture.load().unwrap();
        assert!(profile.matches_primary(&fixture.directory));
        assert!(!profile.matches_primary(&fixture.state));
        assert!(!profile.matches_primary(&fixture.directory.join("nested")));
    }

    #[test]
    fn profile_refuses_state_custody_and_its_own_parent_as_workspace() {
        let fixture = Fixture::new();
        for directory in [
            &fixture.state,
            &fixture.custody,
            &fixture.profile.parent().unwrap().to_owned(),
        ] {
            fixture.write(directory);
            assert_eq!(fixture.load().err().unwrap().code, "protected_root_overlap");
        }
    }

    #[test]
    fn profile_must_be_private_regular_and_single_linked() {
        let fixture = Fixture::new();
        fixture.write(&fixture.directory);
        fs::set_permissions(&fixture.profile, fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(
            fixture.load().err().unwrap().code,
            "permission_profile_invalid"
        );
        fs::set_permissions(&fixture.profile, fs::Permissions::from_mode(0o600)).unwrap();
        let alias = fixture.profile.with_file_name("alias.json");
        fs::hard_link(&fixture.profile, &alias).unwrap();
        assert_eq!(
            fixture.load().err().unwrap().code,
            "permission_profile_invalid"
        );
        fs::remove_file(&alias).unwrap();
        fs::rename(&fixture.profile, &alias).unwrap();
        symlink(alias, &fixture.profile).unwrap();
        assert_eq!(
            fixture.load().err().unwrap().code,
            "permission_profile_invalid"
        );
    }
}
