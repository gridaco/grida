//! GRIDA-SEC-004 / GRIDA-SEC-014 — trusted launch-only permission input.

use crate::command::CommandLimits;
use crate::goal_verification::ReadVerification;
use crate::permissions::{
    AccessRule, CommandProfile, DirectoryAccess, PermissionProfile, ReviewedHookCommand,
    ReviewedLifecycleHook,
};
use crate::workspace::{DirectorySpec, ProtectedRoots, WorkspaceSnapshot, validate_absolute};
use agent_kit_core::{BindingId, Error, ErrorKind, Fingerprint, Result};
use agent_kit_sandbox::{
    DeniedAccess, Installation, ProtectedPath, Sandbox, Termination, TrustedExecutable,
};
use grida_agent_master::{approval_review::ReadProfile, hooks::CheckMode};
use serde::Deserialize;
use std::collections::BTreeMap;
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
    before_completion: Option<CommandHook>,
    before_tool: Option<CommandHook>,
    #[serde(default)]
    hooks: Vec<LifecycleHookFile>,
    automatic_read_review: Option<ReadProfile>,
    goal_read_verification: Option<ReadVerification>,
    goal_read_verifications: Option<Vec<ReadVerification>>,
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
    #[serde(default)]
    write: AccessRule,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Command {
    helper: Executable,
    bubblewrap: Option<Executable>,
    runtime_paths: Vec<PathBuf>,
    temporary_parent: PathBuf,
    #[serde(default)]
    hooks_only: bool,
    /// Programs read and execute anywhere except protected paths.
    #[serde(default)]
    disk_read: bool,
    /// Programs start from the host's environment, minus Grida's own variables.
    #[serde(default)]
    inherit_environment: bool,
    /// Programs start from this environment instead, for a host whose own
    /// environment is not the person's (a desktop app captures their shell's).
    environment: Option<BTreeMap<String, String>>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Executable {
    path: PathBuf,
    sha256: [u8; 32],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommandHook {
    executable: Executable,
    #[serde(default)]
    arguments: Vec<String>,
    mode: CheckMode,
    timeout_ms: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LifecycleHookFile {
    id: BindingId,
    source: String,
    event: grida_agent_master::lifecycle_hooks::HookEvent,
    tool: Option<agent_kit_core::ToolId>,
    #[serde(default = "enabled_hook")]
    enabled: bool,
    executable: Executable,
    #[serde(default)]
    arguments: Vec<String>,
    mode: CheckMode,
    timeout_ms: u32,
}

fn enabled_hook() -> bool {
    true
}

impl CommandHook {
    fn reviewed(self, command: Option<&Command>) -> Result<ReviewedHookCommand> {
        let command = command.ok_or_else(invalid)?;
        let executable = self.executable;
        validate_absolute(&executable.path)?;
        let timeout = Duration::from_millis(u64::from(self.timeout_ms));
        let canonical = match executable.path.canonicalize() {
            Ok(canonical) => Some(canonical),
            Err(error)
                if error.kind() == std::io::ErrorKind::NotFound
                    && std::fs::symlink_metadata(&executable.path)
                        .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound) =>
            {
                None
            }
            Err(_) => return Err(invalid()),
        };
        // Availability belongs to dispatch, so a missing handler cannot block
        // inspection or Stop. Native preparation still verifies its pinned
        // canonical identity and ownership before any process can start.
        if canonical
            .as_ref()
            .is_some_and(|canonical| canonical != &executable.path)
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
        Ok(ReviewedHookCommand {
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
    load_permission_profile_excluding(profile_file, state_directory, credential_home, &[])
}

/// As [`load_permission_profile`], also keeping the named launch secret
/// variables (provider credential, listener and outbound tokens) out of any
/// environment programs receive.
pub fn load_permission_profile_excluding(
    profile_file: &Path,
    state_directory: &Path,
    credential_home: Option<&Path>,
    launch_secrets: &[&str],
) -> Result<Arc<PermissionProfile>> {
    let bytes = read_profile(profile_file)?;
    let profile: ProfileFile = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if profile.version != 1 || profile.directories.is_empty() || profile.directories.len() > 32 {
        return Err(invalid());
    }
    let goal_read_verifications = match (
        profile.goal_read_verification,
        profile.goal_read_verifications,
    ) {
        (Some(verification), None) => vec![verification],
        (None, verifications) => verifications.unwrap_or_default(),
        (Some(_), Some(_)) => return Err(invalid()),
    };

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
    let before_tool = profile
        .before_tool
        .map(|hook| hook.reviewed(profile.command.as_ref()))
        .transpose()?;
    if profile.hooks.len() > grida_agent_master::lifecycle_hooks::MAX_HOOKS {
        return Err(invalid());
    }
    let hooks = profile
        .hooks
        .into_iter()
        .map(|hook| {
            Ok(ReviewedLifecycleHook {
                id: hook.id,
                source: hook.source,
                event: hook.event,
                tool: hook.tool,
                enabled: hook.enabled,
                command: CommandHook {
                    executable: hook.executable,
                    arguments: hook.arguments,
                    mode: hook.mode,
                    timeout_ms: hook.timeout_ms,
                }
                .reviewed(profile.command.as_ref())?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let hooks_only = profile
        .command
        .as_ref()
        .is_some_and(|command| command.hooks_only);
    if hooks_only && ((completion.is_none() && hooks.is_empty()) || before_tool.is_some()) {
        return Err(invalid());
    }
    for hook in completion.iter().chain(before_tool.iter()) {
        write.push(hook.executable.path.clone());
    }
    for hook in &hooks {
        write.push(hook.command.executable.path.clone());
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
            disk_read: command.disk_read,
            environment: Arc::new(match command.environment {
                Some(environment) => without_host_variables(environment, launch_secrets)?,
                None if command.inherit_environment => inherited_environment(launch_secrets),
                None => BTreeMap::new(),
            }),
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
                write: directory.write,
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
    let selected_review = profile.automatic_read_review;
    let profile = PermissionProfile::with_denials(
        profile.revision,
        Arc::new(workspace),
        rules,
        denials,
        command,
    )?;
    let profile = match completion {
        Some(hook) => profile.with_completion_hook(hook, hooks_only)?,
        None => profile,
    };
    let profile = match before_tool {
        Some(hook) => profile.with_before_tool_hook(hook)?,
        None => profile,
    };
    let profile = match selected_review {
        Some(review) => profile.with_automatic_read_review(review)?,
        None => profile,
    };
    let profile = profile.with_lifecycle_hooks(hooks, hooks_only)?;
    Ok(Arc::new(
        profile.with_goal_read_verifications(goal_read_verifications)?,
    ))
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
pub(crate) fn read_profile(path: &Path) -> Result<Vec<u8>> {
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
    fn goal_verification_profile_is_bounded_and_preserves_capture_identity() {
        use agent_kit_core::ScopeId;
        use serde_json::{Value, json};

        let fixture = Fixture::new();
        fixture.write(&fixture.directory);
        let base: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
        let rule =
            json!({"directory":"project","relativePath":"manifest.txt","sha256":vec![0; 32]});
        let load = |singular, plural| {
            let mut profile = base.clone();
            profile["goalReadVerification"] = singular;
            profile["goalReadVerifications"] = plural;
            fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
            fixture.load()
        };
        let scope = ScopeId::new("goal").unwrap();
        let single = load(rule.clone(), Value::Null).unwrap();
        let list = load(Value::Null, json!([rule.clone()])).unwrap();
        assert_eq!(single.capture(scope.clone()), list.capture(scope.clone()));

        let mut other = rule.clone();
        other["relativePath"] = json!("another.txt");
        let pair = load(Value::Null, json!([rule.clone(), other.clone()])).unwrap();
        let reordered = load(Value::Null, json!([other.clone(), rule.clone()])).unwrap();
        assert_eq!(
            pair.capture(scope.clone()),
            reordered.capture(scope.clone())
        );
        other["sha256"] = json!(vec![1; 32]);
        let changed = load(Value::Null, json!([other, rule.clone()])).unwrap();
        assert!(changed.validate_capture(&pair.capture(scope)).is_err());

        assert_eq!(
            load(rule.clone(), json!([rule.clone()]))
                .err()
                .unwrap()
                .code,
            "permission_profile_invalid"
        );
        assert_eq!(
            load(Value::Null, json!([rule.clone(), rule.clone()]))
                .err()
                .unwrap()
                .code,
            "duplicate_goal_read_verification"
        );
        assert_eq!(
            load(Value::Null, json!(vec![rule.clone(); 17]))
                .err()
                .unwrap()
                .code,
            "goal_read_verification_limit"
        );
        let mut unknown_directory = rule;
        unknown_directory["directory"] = json!("unknown");
        assert_eq!(
            load(Value::Null, json!([unknown_directory]))
                .err()
                .unwrap()
                .code,
            "goal_read_verification_requires_read_authority"
        );
    }

    #[test]
    fn program_environments_omit_every_launch_secret_variable() {
        let inherited = inherited_environment(&["PATH", "HOME"]);
        assert!(!inherited.contains_key("PATH"));
        assert!(!inherited.contains_key("HOME"));
        assert!(inherited.keys().all(|name| !name.starts_with("GRIDA_")));
        assert!(inherited_environment(&[]).contains_key("PATH"));
        let supplied = without_host_variables(
            BTreeMap::from(
                [
                    ("ACP_TOKEN", "a"),
                    ("MCP_TOKEN", "b"),
                    ("GRIDA_STATE", "c"),
                    ("LANG", "C"),
                ]
                .map(|(name, value)| (name.to_owned(), value.to_owned())),
            ),
            &["ACP_TOKEN", "MCP_TOKEN"],
        )
        .unwrap();
        assert_eq!(supplied.keys().collect::<Vec<_>>(), ["LANG"]);
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

/// The host's environment for programs, without Grida's internal variables
/// or the secrets this host was launched with.
fn inherited_environment(launch_secrets: &[&str]) -> BTreeMap<String, String> {
    std::env::vars()
        .filter(|(name, _)| program_may_receive(name, launch_secrets))
        .collect()
}

fn program_may_receive(name: &str, launch_secrets: &[&str]) -> bool {
    !name.starts_with("GRIDA_") && !launch_secrets.contains(&name)
}

/// A supplied program environment, validated and filtered like an inherited one.
fn without_host_variables(
    environment: BTreeMap<String, String>,
    launch_secrets: &[&str],
) -> Result<BTreeMap<String, String>> {
    if environment.len() > 512
        || environment.iter().any(|(name, value)| {
            name.is_empty() || name.contains(['=', '\0']) || value.contains('\0')
        })
    {
        return Err(invalid());
    }
    Ok(environment
        .into_iter()
        .filter(|(name, _)| program_may_receive(name, launch_secrets))
        .collect())
}
