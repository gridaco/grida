// GRIDA-SEC-014 — synthetic public store contracts and real private files.
#![cfg(unix)]
use grida_auth::ProviderStore;
use std::fs;
use std::os::unix::fs::PermissionsExt;

fn home() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
}

#[test]
fn shared_store_preserves_exact_values_and_other_writers() {
    let temp = home();
    let path = fs::canonicalize(temp.path()).unwrap();
    let first = ProviderStore::new(path.clone()).unwrap();
    let second = ProviderStore::new(path).unwrap();
    assert_eq!(first.read("example").unwrap(), None);
    first.set("example", "  synthetic-\"-\\-α-🙂  ").unwrap();
    second.set("other", "synthetic-other").unwrap();
    assert_eq!(
        second.read("example").unwrap().as_deref(),
        Some("  synthetic-\"-\\-α-🙂  ")
    );
    first.remove("example").unwrap();
    assert_eq!(
        second.list().unwrap(),
        vec![grida_auth::Presence {
            provider: "other".into()
        }]
    );
}

#[test]
fn existing_portable_fixtures_are_authoritative() {
    for (fixture, expected) in [
        ("unknown-version", "unsupported_version"),
        ("unknown-field", "invalid_store"),
        ("pending", "migration_pending"),
    ] {
        let temp = home();
        let path = fs::canonicalize(temp.path()).unwrap();
        let store = ProviderStore::new(path.clone()).unwrap();
        store.list().unwrap();
        let bytes = fs::read(format!(
            "../../packages/grida-auth/fixtures/providers-v1/{fixture}.toml"
        ))
        .unwrap();
        let file = path.join("providers/credentials.toml");
        fs::write(&file, &bytes).unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(store.list().unwrap_err().code(), expected);
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
}

#[test]
fn deletion_fence_wins_import_and_pending_resumes_without_read() {
    let temp = home();
    let store = ProviderStore::new(fs::canonicalize(temp.path()).unwrap()).unwrap();
    store.remove("removed").unwrap();
    let error = store
        .migrate(
            || {
                Ok(vec![
                    ("removed".into(), "synthetic-old".into()),
                    ("imported".into(), "synthetic-new".into()),
                ])
            },
            || Err(grida_auth::Error::new("unavailable")),
        )
        .unwrap_err();
    assert_eq!(error.code(), "migration_failed");
    assert_eq!(store.list().unwrap_err().code(), "migration_pending");
    store
        .migrate(|| panic!("pending must not reread source"), || Ok(()))
        .unwrap();
    assert_eq!(store.read("removed").unwrap(), None);
    assert_eq!(
        store.read("imported").unwrap().as_deref(),
        Some("synthetic-new")
    );
}

#[test]
fn unsafe_existing_file_is_never_repaired_or_treated_as_empty() {
    let temp = home();
    let path = fs::canonicalize(temp.path()).unwrap();
    let store = ProviderStore::new(path.clone()).unwrap();
    store.set("example", "synthetic").unwrap();
    let file = path.join("providers/credentials.toml");
    fs::set_permissions(&file, fs::Permissions::from_mode(0o644)).unwrap();
    assert_eq!(store.read("example").unwrap_err().code(), "storage_failed");
    assert_eq!(
        fs::metadata(file).unwrap().permissions().mode() & 0o777,
        0o644
    );
}
