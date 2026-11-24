use agent_kit_core::{Error, ErrorKind};
use grida_agent::configuration::{Configuration, GlobalConfigEdit, edit_global_config};
use std::path::Path;

fn write(directory: &Path, text: &str) {
    std::fs::write(directory.join("config.toml"), text).unwrap();
}

#[test]
fn missing_file_uses_defaults_without_creating_a_home_or_config() {
    let temporary = tempfile::tempdir().unwrap();
    let home = temporary.path().join("absent");
    let configuration = Configuration::open(&home).unwrap();
    let inspected = configuration.inspect().unwrap();
    assert_eq!(inspected.path, home.join("config.toml"));
    assert!(inspected.file_revision.is_none());
    assert!(inspected.active.defaults().model_context_window.is_none());
    assert!(inspected.file_diagnostic.is_none());
    assert!(!home.exists());
}

#[test]
fn reads_compaction_defaults_alongside_other_global_settings() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        r#"schema_version = 1
model_context_window = 9007199254740991
model_auto_compact_token_limit = 1024
web_search = "automatic"
typo = "private-value"
[desktop]
composer-predictions-enabled = false
[[hooks]]
enabled = false
"#,
    );
    let configuration = Configuration::open(home.path()).unwrap();
    let inspected = configuration.inspect().unwrap();
    assert!(inspected.file_diagnostic.is_none());
    assert_eq!(inspected.unknown_keys, ["typo"]);
    assert_eq!(
        serde_json::to_value(&inspected.active).unwrap()["defaults"]["model_context_window"]
            .as_u64(),
        Some(9_007_199_254_740_991)
    );
    assert_eq!(
        inspected
            .active
            .defaults()
            .model_auto_compact_token_limit
            .unwrap()
            .get(),
        1024
    );
}

#[test]
fn invalid_configuration_reports_the_key_and_retains_the_active_capture() {
    let home = tempfile::tempdir().unwrap();
    write(
        home.path(),
        "schema_version = 1\nmodel_context_window = 4096\n",
    );
    let configuration = Configuration::open(home.path()).unwrap();
    let before = configuration.snapshot().unwrap();
    for (text, diagnostic) in [
        ("schema_version = 2\n", "config_schema_unsupported"),
        ("private-value {{{", "config_toml_invalid"),
        (
            "schema_version = 1\nmodel_context_window = 'private-value'\n",
            "config_invalid_value_model_context_window",
        ),
        (
            "schema_version = 1\nmodel_auto_compact_token_limit = 9007199254740992\n",
            "config_invalid_value_model_auto_compact_token_limit",
        ),
    ] {
        write(home.path(), text);
        let inspection = configuration.inspect().unwrap();
        assert_eq!(inspection.file_diagnostic.unwrap().code, diagnostic);
        assert_eq!(
            configuration
                .reload(inspection.file_revision)
                .unwrap_err()
                .code,
            diagnostic
        );
        assert_eq!(configuration.snapshot().unwrap(), before);
    }
    let file = home.path().join("config.toml");
    std::fs::remove_file(&file).unwrap();
    std::fs::create_dir(&file).unwrap();
    let inspection = configuration.inspect().unwrap();
    assert_eq!(inspection.path, file);
    assert_eq!(inspection.active, before);
    assert_eq!(
        inspection.file_diagnostic.unwrap().code,
        "config_file_invalid"
    );
    assert!(inspection.file_revision.is_none());
    assert_eq!(
        Configuration::check(home.path()).unwrap_err().code,
        "config_file_invalid"
    );
    assert_eq!(
        configuration.reload(None).unwrap_err().code,
        "config_file_invalid"
    );
    assert_eq!(configuration.snapshot().unwrap(), before);
    std::fs::remove_dir(&file).unwrap();

    write(
        home.path(),
        "schema_version = 1\nmodel_context_window = 2048\n",
    );
    let inspection = configuration.inspect().unwrap();
    assert_eq!(
        configuration
            .reload(before.source_revision)
            .unwrap_err()
            .kind,
        ErrorKind::Conflict
    );
    assert_eq!(configuration.snapshot().unwrap(), before);
    let active = configuration.reload(inspection.file_revision).unwrap();
    assert_eq!(active.defaults().model_context_window.unwrap().get(), 2048);
    assert_eq!(before.defaults().model_context_window.unwrap().get(), 4096);
}

#[test]
fn creation_is_explicit_and_keeps_the_existing_file() {
    let temporary = tempfile::tempdir().unwrap();
    let home = temporary.path().join("new-home");
    edit_global_config(&home, GlobalConfigEdit::Create, || Ok(())).unwrap();
    let path = home.join("config.toml");
    let created = std::fs::read_to_string(&path).unwrap();
    assert!(created.contains("# model_auto_compact_token_limit"));
    for existing in ["schema_version = 1\n# user edits\n", "unfinished TOML [["] {
        write(&home, existing);
        edit_global_config(&home, GlobalConfigEdit::Create, || {
            panic!("no write needed")
        })
        .unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), existing);
    }
}

#[test]
fn managed_edits_keep_comments_sibling_fields_and_formatting() {
    let home = tempfile::tempdir().unwrap();
    for desktop in [
        "desktop = { 'composer-predictions-enabled' = false, sibling = 1 }",
        "desktop.'composer-predictions-enabled' = false # Keep inline\r\ndesktop.sibling = 1",
        "[desktop]\r\n'composer-predictions-enabled' = false # Keep inline\r\nsibling = 1",
        "[desktop]\r\nsibling = 1",
        "desktop = { sibling = 1 }",
    ] {
        let original = format!(
            "\u{feff}# Agent configuration\r\nschema_version = 1\r\nmodel_context_window = 2048\r\nweb_search = 'disabled' # Search comment\r\n{desktop}\r\n"
        );
        write(home.path(), &original);
        edit_global_config(
            home.path(),
            GlobalConfigEdit::SuggestedPrompts(true),
            || Ok(()),
        )
        .unwrap();
        edit_global_config(home.path(), GlobalConfigEdit::WebSearch(true), || Ok(())).unwrap();
        let saved = std::fs::read_to_string(home.path().join("config.toml")).unwrap();
        assert!(
            saved.starts_with("\u{feff}# Agent configuration\r\n"),
            "{saved:?}"
        );
        assert!(saved.contains("model_context_window = 2048"), "{saved:?}");
        assert!(saved.contains("sibling = 1"), "{saved:?}");
        assert!(saved.contains("# Search comment"), "{saved:?}");
        assert_eq!(
            saved.replace("\r\n", "").matches('\n').count(),
            0,
            "{saved:?}"
        );
        if desktop.contains("# Keep inline") {
            assert!(saved.contains("# Keep inline"), "{saved:?}");
        }
        let parsed = saved
            .trim_start_matches('\u{feff}')
            .parse::<toml_edit::DocumentMut>()
            .unwrap();
        assert_eq!(parsed["web_search"].as_str(), Some("automatic"));
        assert_eq!(
            parsed["desktop"]
                .as_table_like()
                .unwrap()
                .get("composer-predictions-enabled")
                .and_then(toml_edit::Item::as_bool),
            Some(true)
        );
    }
}

#[test]
fn contention_revocation_and_manual_edits_never_overwrite_another_value() {
    let home = tempfile::tempdir().unwrap();
    let path = home.path();
    let original = "schema_version = 1\nweb_search = \"disabled\"\n";
    write(path, original);
    edit_global_config(path, GlobalConfigEdit::WebSearch(true), || {
        let busy = edit_global_config(path, GlobalConfigEdit::SuggestedPrompts(true), || Ok(()));
        assert_eq!(busy.unwrap_err().code, "config_writer_busy");
        Ok(())
    })
    .unwrap();
    edit_global_config(path, GlobalConfigEdit::SuggestedPrompts(true), || Ok(())).unwrap();
    let retained = std::fs::read_to_string(path.join("config.toml")).unwrap();
    assert!(retained.contains("web_search = \"automatic\""));
    assert!(retained.contains("composer-predictions-enabled = true"));
    let revoked = edit_global_config(path, GlobalConfigEdit::WebSearch(false), || {
        Err(Error::new(ErrorKind::Unavailable, "revoked"))
    });
    assert_eq!(revoked.unwrap_err().code, "revoked");
    assert_eq!(
        std::fs::read_to_string(path.join("config.toml")).unwrap(),
        retained
    );
    let conflict = edit_global_config(path, GlobalConfigEdit::WebSearch(false), || {
        write(path, "schema_version = 1\n# manual edit\n");
        Ok(())
    });
    assert_eq!(conflict.unwrap_err().kind, ErrorKind::Conflict);
    assert_eq!(
        std::fs::read_to_string(path.join("config.toml")).unwrap(),
        "schema_version = 1\n# manual edit\n"
    );
}

#[cfg(unix)]
#[test]
fn config_bytes_stay_in_private_staging_until_publication() {
    use std::os::unix::fs::PermissionsExt;
    let home = tempfile::tempdir().unwrap();
    let path = home.path();
    let original = "schema_version = 1\n# private-config-marker\n";
    write(path, original);
    let staging = path.join(".config-staging");
    let rejected = edit_global_config(path, GlobalConfigEdit::WebSearch(true), || {
        let listed = std::fs::read_dir(path)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(
            listed,
            ["config.toml", "config.lock", ".config-staging"]
                .map(std::ffi::OsString::from)
                .into()
        );
        assert_eq!(
            std::fs::metadata(&staging).unwrap().permissions().mode() & 0o777,
            0o700
        );
        let staged = std::fs::read_dir(&staging)
            .unwrap()
            .filter(|entry| entry.as_ref().unwrap().file_name() != "write.lock")
            .map(|entry| entry.unwrap().path())
            .collect::<Vec<_>>();
        assert_eq!(staged.len(), 1);
        assert_eq!(
            std::fs::metadata(&staged[0]).unwrap().permissions().mode() & 0o077,
            0
        );
        let bytes = std::fs::read_to_string(&staged[0]).unwrap();
        assert!(bytes.contains("private-config-marker"));
        assert!(bytes.contains("web_search = \"automatic\""));
        assert_eq!(
            std::fs::read_to_string(path.join("config.toml")).unwrap(),
            original
        );
        Err(Error::new(ErrorKind::Unavailable, "revoked"))
    });
    assert_eq!(rejected.unwrap_err().code, "revoked");
    assert_eq!(
        std::fs::read_to_string(path.join("config.toml")).unwrap(),
        original
    );
    assert_eq!(
        std::fs::read_dir(&staging)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<Vec<_>>(),
        ["write.lock"]
    );
}

#[cfg(unix)]
#[test]
fn managed_writes_refuse_untrusted_staging_directories() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let home = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let staging = home.path().join(".config-staging");
    let edit = || {
        edit_global_config(home.path(), GlobalConfigEdit::Create, || {
            panic!("unsafe staging must fail before write admission")
        })
        .unwrap_err()
        .code
    };

    symlink(outside.path(), &staging).unwrap();
    assert_eq!(edit(), "config_directory_invalid");
    assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0);
    std::fs::remove_file(&staging).unwrap();
    std::fs::create_dir(&staging).unwrap();
    std::fs::set_permissions(&staging, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(edit(), "config_staging_directory_unsafe");
    assert!(!home.path().join("config.toml").exists());
}

#[cfg(unix)]
#[test]
fn global_configuration_allows_owner_writable_files_and_rejects_aliases() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let home = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    write(outside.path(), "schema_version = 1\n");
    let source = outside.path().join("config.toml");
    let path = home.path().join("config.toml");
    symlink(&source, &path).unwrap();
    assert!(Configuration::open(home.path()).is_err());
    std::fs::remove_file(&path).unwrap();
    std::fs::hard_link(&source, &path).unwrap();
    assert!(Configuration::open(home.path()).is_err());
    std::fs::remove_file(&path).unwrap();
    write(home.path(), "schema_version = 1\n");
    std::fs::set_permissions(home.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert!(Configuration::open(home.path()).is_ok());
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o664)).unwrap();
    assert!(Configuration::open(home.path()).is_err());
}

#[test]
fn a_personalization_edit_preserves_an_independently_invalid_limit() {
    let home = tempfile::tempdir().unwrap();
    let text = "schema_version = 1\nmodel_context_window = 0\n";
    write(home.path(), text);
    edit_global_config(home.path(), GlobalConfigEdit::WebSearch(false), || Ok(())).unwrap();
    let saved = std::fs::read_to_string(home.path().join("config.toml")).unwrap();
    assert!(saved.starts_with(text));
    assert!(saved.contains("web_search = \"disabled\""));
    assert_eq!(
        Configuration::open(home.path()).err().unwrap().code,
        "config_invalid_value_model_context_window"
    );
}

#[test]
fn opens_an_existing_config_for_repair_without_taking_a_write_lock() {
    let home = tempfile::tempdir().unwrap();
    let config = home.path().join("config.toml");
    let lock = home.path().join("config.lock");
    let oversized = vec![b' '; 65 * 1024];
    std::fs::write(&config, &oversized).unwrap();

    edit_global_config(home.path(), GlobalConfigEdit::Create, || {
        panic!("opening an existing file needs no write admission")
    })
    .unwrap();
    assert!(!lock.exists());
    assert_eq!(std::fs::read(&config).unwrap(), oversized);

    write(home.path(), "schema_version = 1\n");
    edit_global_config(home.path(), GlobalConfigEdit::WebSearch(false), || {
        edit_global_config(home.path(), GlobalConfigEdit::Create, || {
            panic!("opening an existing file needs no write admission")
        })
    })
    .unwrap();
}

#[test]
fn personalization_writes_refuse_to_replace_structured_content() {
    let home = tempfile::tempdir().unwrap();
    for (settings, edit) in [
        (
            "[web_search]\nuser_key = true\n",
            GlobalConfigEdit::WebSearch(false),
        ),
        (
            "web_search = { user_key = true }\n",
            GlobalConfigEdit::WebSearch(false),
        ),
        (
            "[desktop]\ncomposer-predictions-enabled = [true]\n",
            GlobalConfigEdit::SuggestedPrompts(false),
        ),
    ] {
        let text = format!("schema_version = 1\n{settings}");
        write(home.path(), &text);
        let error = edit_global_config(home.path(), edit, || {
            panic!("invalid edits must not reach write admission")
        })
        .unwrap_err();
        assert_eq!(error.code, "config_invalid_personalization");
        assert_eq!(
            std::fs::read_to_string(home.path().join("config.toml")).unwrap(),
            text
        );
    }
}
