use agent_kit_core::ErrorKind;
use grida_agent::configuration::Configuration;
use grida_agent_master::configuration::SettingChange;
use std::num::NonZeroU64;
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;

fn state() -> TempDir {
    let directory = tempfile::tempdir().unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    directory
}

fn write(directory: &Path, text: &str) {
    let path = directory.join("config.toml");
    std::fs::write(&path, text).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
}

fn set(value: u64) -> SettingChange {
    SettingChange::SetContextMaxInputTokens {
        value: NonZeroU64::new(value).unwrap(),
    }
}

#[test]
fn missing_file_uses_automatic_defaults_without_creating_configuration() {
    let directory = state();
    let configuration = Configuration::open(directory.path()).unwrap();
    let inspection = configuration.inspect().unwrap();
    assert!(inspection.file_revision.is_none());
    assert!(
        inspection
            .active
            .defaults
            .context
            .max_input_tokens
            .is_none()
    );
    assert!(inspection.file_diagnostic.is_none());
    configuration
        .update(None, SettingChange::ResetContextMaxInputTokens)
        .unwrap();
    assert!(!directory.path().join("config.toml").exists());
}

#[test]
fn changes_persist_and_captured_snapshots_stay_immutable() {
    let directory = state();
    let configuration = Configuration::open(directory.path()).unwrap();
    let captured = configuration.snapshot().unwrap();
    let changed = configuration.update(None, set(64000)).unwrap();
    assert_eq!(
        changed.defaults.context.max_input_tokens.unwrap().get(),
        64000
    );
    assert!(captured.defaults.context.max_input_tokens.is_none());
    assert_ne!(captured.identity, changed.identity);
    drop(configuration);
    let reopened = Configuration::open(directory.path()).unwrap();
    assert_eq!(reopened.snapshot().unwrap(), changed);
    let reset = reopened
        .update(
            changed.source_revision,
            SettingChange::ResetContextMaxInputTokens,
        )
        .unwrap();
    assert!(reset.defaults.context.max_input_tokens.is_none());
}

#[test]
fn managed_changes_preserve_unrelated_comments_and_tables() {
    let directory = state();
    write(
        directory.path(),
        "# Personal defaults\nschema_version = 1\n\n# Context selection\n[context]\nmax_input_tokens = 32000\n",
    );
    let configuration = Configuration::open(directory.path()).unwrap();
    let before = configuration.snapshot().unwrap();
    configuration
        .update(before.source_revision, set(64000))
        .unwrap();
    let text = std::fs::read_to_string(directory.path().join("config.toml")).unwrap();
    assert!(text.contains("# Personal defaults"));
    assert!(text.contains("# Context selection"));
    assert!(text.contains("max_input_tokens = 64000"));
}

#[test]
fn inline_context_tables_remain_editable() {
    let directory = state();
    write(
        directory.path(),
        "schema_version = 1\ncontext = { max_input_tokens = 100 }\n",
    );
    let configuration = Configuration::open(directory.path()).unwrap();
    let before = configuration.snapshot().unwrap();
    let changed = configuration
        .update(before.source_revision, set(200))
        .unwrap();
    assert_eq!(
        changed.defaults.context.max_input_tokens.unwrap().get(),
        200
    );
    configuration
        .update(
            changed.source_revision,
            SettingChange::ResetContextMaxInputTokens,
        )
        .unwrap();
    assert!(
        configuration
            .snapshot()
            .unwrap()
            .defaults
            .context
            .max_input_tokens
            .is_none()
    );
}

#[test]
fn invalid_startup_configuration_is_rejected_without_echoing_contents() {
    let directory = state();
    for text in [
        "schema_version = 2\n",
        "schema_version = 1\nunknown = 'private-value'\n",
        "schema_version = 1\ncontext = 1\n",
        "schema_version = 1\n[context]\nother = true\n",
        "schema_version = 1\n[context]\nmax_input_tokens = 0\n",
        "schema_version = 1\n[context]\nmax_input_tokens = -1\n",
        "schema_version = 1\n[context]\nmax_input_tokens = 'private-value'\n",
        "schema_version = 1\n[context]\nmax_input_tokens = 1.5\n",
        "private-value {{{",
    ] {
        write(directory.path(), text);
        let error = Configuration::open(directory.path()).err().unwrap();
        assert!(!error.to_string().contains("private-value"));
    }
}

#[test]
fn rejected_reload_retains_the_active_snapshot_and_reports_the_file() {
    let directory = state();
    let configuration = Configuration::open(directory.path()).unwrap();
    let before = configuration.snapshot().unwrap();
    write(
        directory.path(),
        "schema_version = 1\n[context]\nmax_input_tokens = 0\n",
    );
    let inspection = configuration.inspect().unwrap();
    assert_ne!(inspection.file_revision, before.source_revision);
    assert_eq!(
        inspection.file_diagnostic.unwrap().code,
        "config_value_out_of_range"
    );
    assert_eq!(
        configuration
            .reload(inspection.file_revision)
            .unwrap_err()
            .code,
        "config_value_out_of_range"
    );
    assert_eq!(configuration.snapshot().unwrap(), before);
}

#[test]
fn manual_edits_require_explicit_reload_and_stale_updates_preserve_them() {
    let directory = state();
    let configuration = Configuration::open(directory.path()).unwrap();
    let before = configuration.snapshot().unwrap();
    write(
        directory.path(),
        "schema_version = 1\n[context]\nmax_input_tokens = 4096\n",
    );
    assert_eq!(configuration.snapshot().unwrap(), before);
    assert_eq!(
        configuration
            .update(before.source_revision, set(2048))
            .unwrap_err()
            .kind,
        ErrorKind::Conflict
    );
    assert_eq!(
        configuration
            .reload(before.source_revision)
            .unwrap_err()
            .kind,
        ErrorKind::Conflict
    );
    let inspection = configuration.inspect().unwrap();
    let active = configuration.reload(inspection.file_revision).unwrap();
    assert_eq!(
        active.defaults.context.max_input_tokens.unwrap().get(),
        4096
    );
    assert_eq!(
        configuration.inspect().unwrap().file_revision,
        active.source_revision
    );
}

#[test]
fn competing_managed_writers_cannot_overwrite_the_same_revision() {
    let directory = state();
    let first = Arc::new(Configuration::open(directory.path()).unwrap());
    let second = Arc::new(Configuration::open(directory.path()).unwrap());
    let gate = Arc::new(std::sync::Barrier::new(2));
    let left = {
        let gate = Arc::clone(&gate);
        std::thread::spawn(move || {
            gate.wait();
            first.update(None, set(100))
        })
    };
    let right = std::thread::spawn(move || {
        gate.wait();
        second.update(None, set(200))
    });
    let results = [left.join().unwrap(), right.join().unwrap()];
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert!(
        results
            .iter()
            .find_map(|result| result.as_ref().err())
            .is_some_and(|error| error.code == "config_writer_busy"
                || error.code == "config_revision_changed")
    );
}

#[test]
fn values_outside_the_backing_format_are_rejected_without_writes() {
    let directory = state();
    let configuration = Configuration::open(directory.path()).unwrap();
    assert_eq!(
        configuration.update(None, set(u64::MAX)).unwrap_err().code,
        "config_value_out_of_range"
    );
    assert!(!directory.path().join("config.toml").exists());
}

#[test]
fn oversized_files_are_bounded_before_parsing() {
    let directory = state();
    write(directory.path(), &format!("# {}", "x".repeat(65536)));
    assert_eq!(
        Configuration::open(directory.path()).err().unwrap().code,
        "config_file_too_large"
    );
}

#[cfg(unix)]
#[test]
fn configuration_rejects_links_and_shared_permissions() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let directory = state();
    let outside = state();
    write(outside.path(), "schema_version = 1\n");
    let path = directory.path().join("config.toml");
    symlink(outside.path().join("config.toml"), &path).unwrap();
    assert_eq!(
        Configuration::open(directory.path()).err().unwrap().code,
        "config_file_invalid"
    );
    std::fs::remove_file(&path).unwrap();
    std::fs::hard_link(outside.path().join("config.toml"), &path).unwrap();
    assert_eq!(
        Configuration::open(directory.path()).err().unwrap().code,
        "config_file_not_private"
    );
    std::fs::remove_file(&path).unwrap();
    write(directory.path(), "schema_version = 1\n");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert_eq!(
        Configuration::open(directory.path()).err().unwrap().code,
        "config_file_not_private"
    );
    std::fs::remove_file(&path).unwrap();
    std::fs::set_permissions(directory.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(
        Configuration::open(directory.path()).err().unwrap().code,
        "config_directory_not_private"
    );
}

#[cfg(unix)]
#[test]
fn replaced_state_directory_is_rejected_before_any_write() {
    let parent = state();
    let original = parent.path().join("agent");
    std::fs::create_dir(&original).unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&original, std::fs::Permissions::from_mode(0o700)).unwrap();
    let configuration = Configuration::open(&original).unwrap();
    std::fs::rename(&original, parent.path().join("retained")).unwrap();
    std::fs::create_dir(&original).unwrap();
    std::fs::set_permissions(&original, std::fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(
        configuration.update(None, set(100)).unwrap_err().code,
        "config_directory_changed"
    );
    assert!(!original.join("config.toml").exists());
}

#[cfg(unix)]
#[test]
fn linked_writer_lock_is_rejected_without_changing_the_target() {
    let directory = state();
    let outside = state();
    let target = outside.path().join("target");
    std::fs::write(&target, b"retained").unwrap();
    std::os::unix::fs::symlink(&target, directory.path().join("config.lock")).unwrap();
    assert_eq!(
        Configuration::open(directory.path()).err().unwrap().code,
        "config_file_invalid"
    );
    assert_eq!(std::fs::read(&target).unwrap(), b"retained");
}
