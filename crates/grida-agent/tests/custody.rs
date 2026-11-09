//! GRIDA-SEC-014 — isolated provider custody and replay identity fixtures.

#[path = "../src/custody.rs"]
mod custody;

use agent_kit_core::{ErrorKind, Fingerprint};
use custody::{CapturedCredential, CredentialFormat, CredentialSource};

#[test]
fn environment_lookup_is_explicit_and_redacts_header() {
    const MODE: &str = "GRIDA_CUSTODY_FIXTURE_MODE";
    const NAME: &str = "GRIDA_CUSTODY_FIXTURE_KEY";
    const KEY: &str = "synthetic-environment-key";

    if let Ok(mode) = std::env::var(MODE) {
        let source = CredentialSource::Environment { name: NAME.into() };
        if mode == "absent" {
            let error = CapturedCredential::capture(source).err().unwrap();
            assert_eq!(error.code, "provider_credential_unavailable");
            return;
        }
        if mode == "invalid" {
            let error = CapturedCredential::capture(source).err().unwrap();
            assert_eq!(error.code, "provider_credential_invalid");
            assert!(!format!("{error:?}").contains(KEY));
            return;
        }
        let credential = CapturedCredential::capture(source).unwrap();
        assert_eq!(credential.source_kind(), "environment");
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            let state = tempfile::tempdir().unwrap();
            let directory = state.path().canonicalize().unwrap();
            let lineage = Fingerprint::of(&"fixture").unwrap();
            let error = credential.replay_binding(&directory, lineage).unwrap_err();
            assert_eq!(error.code, "unsupported_platform");
            assert!(!directory.join("credential-continuity").exists());
        }
        runtime.block_on(async {
            credential.validate().await.unwrap();
            let header = credential.header(CredentialFormat::Bearer).await.unwrap();
            assert!(header.is_sensitive());
            assert_eq!(header.to_str().unwrap(), "Bearer synthetic-environment-key");
            assert!(!format!("{header:?}").contains(KEY));
            let raw = credential.header(CredentialFormat::ApiKey).await.unwrap();
            assert!(raw.is_sensitive());
            assert_eq!(raw.to_str().unwrap(), KEY);
        });
        return;
    }

    // Process-local environment reads need no mutation of the test runner's environment.
    for (mode, key) in [
        ("present", Some(KEY)),
        ("absent", None),
        (
            "invalid",
            Some("synthetic-environment-key\r\nInjected: value"),
        ),
    ] {
        let mut child = std::process::Command::new(std::env::current_exe().unwrap());
        child.args([
            "--exact",
            "environment_lookup_is_explicit_and_redacts_header",
        ]);
        child.env_clear().env(MODE, mode);
        if let Some(key) = key {
            child.env(NAME, key);
        }
        let output = child.output().unwrap();
        assert!(output.status.success(), "failed custody fixture {mode}");
        assert!(!String::from_utf8_lossy(&output.stdout).contains(KEY));
        assert!(!String::from_utf8_lossy(&output.stderr).contains(KEY));
    }
}

#[test]
fn rejects_invalid_source_name_before_lookup() {
    let error = CapturedCredential::capture(CredentialSource::Environment {
        name: "INVALID=KEY".into(),
    })
    .err()
    .unwrap();
    assert_eq!(error.kind, ErrorKind::InvalidInput);
    assert_eq!(error.code, "invalid_credential_environment_name");
    assert!(!format!("{error:?}").contains("INVALID=KEY"));
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod stored {
    use super::*;
    use grida_auth::ProviderStore;
    use std::path::{Path, PathBuf};
    use tempfile::TempDir;

    fn home() -> (TempDir, PathBuf, ProviderStore) {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().canonicalize().unwrap();
        let store = ProviderStore::new(path.clone()).unwrap();
        (temp, path, store)
    }

    fn source(home: &Path) -> CredentialSource {
        CredentialSource::Stored {
            home: home.to_path_buf(),
            provider: "openai".into(),
        }
    }

    #[tokio::test]
    async fn desktop_byok_trims_bearer_only_and_compares_exact_stored_bytes() {
        let (_temp, home, store) = home();
        for provider in ["openrouter", "vercel"] {
            let source = || CredentialSource::Stored {
                home: home.clone(),
                provider: provider.into(),
            };
            store.set(provider, " \u{a0}fixture-key  ").unwrap();
            let credential = CapturedCredential::capture(source()).unwrap();
            let header = credential.header(CredentialFormat::Bearer).await.unwrap();
            assert!(header.is_sensitive());
            assert_eq!(header, "Bearer fixture-key");

            store.set(provider, "fixture-key").unwrap();
            assert_eq!(
                credential.validate().await.unwrap_err().code,
                "provider_credential_changed"
            );
            let current = CapturedCredential::capture(source()).unwrap();
            assert_eq!(
                current.header(CredentialFormat::Bearer).await.unwrap(),
                header
            );
        }
    }

    #[tokio::test]
    async fn stored_key_uses_only_selected_home_and_requires_rebinding_after_change() {
        let (_selected_temp, selected, store) = home();
        let (_other_temp, other, other_store) = home();
        other_store.set("openai", "other-synthetic-key").unwrap();
        assert_eq!(
            CapturedCredential::capture(source(&selected))
                .err()
                .unwrap()
                .code,
            "provider_credential_unavailable"
        );

        store.set("openai", "initial-synthetic-key").unwrap();
        let credential = CapturedCredential::capture(source(&selected)).unwrap();
        assert_eq!(credential.source_kind(), "stored-byok");
        let header = credential.header(CredentialFormat::ApiKey).await.unwrap();
        assert!(header.is_sensitive());
        assert_eq!(header.to_str().unwrap(), "initial-synthetic-key");
        assert!(!format!("{header:?}").contains("initial-synthetic-key"));

        store.set("openai", "rotated-synthetic-key").unwrap();
        let error = credential
            .header(CredentialFormat::Bearer)
            .await
            .unwrap_err();
        assert_eq!(error.code, "provider_credential_changed");
        assert!(!format!("{error:?}").contains("rotated-synthetic-key"));
        let rebound = CapturedCredential::capture(source(&selected)).unwrap();
        assert_eq!(
            rebound
                .header(CredentialFormat::Bearer)
                .await
                .unwrap()
                .to_str()
                .unwrap(),
            "Bearer rotated-synthetic-key"
        );

        store.remove("openai").unwrap();
        assert_eq!(
            rebound.validate().await.unwrap_err().code,
            "provider_credential_unavailable"
        );
        store.set("openai", "rotated-synthetic-key").unwrap();
        assert_eq!(
            rebound.validate().await.unwrap_err().code,
            "provider_credential_changed"
        );
        store.set("openai", "initial-synthetic-key").unwrap();
        assert_eq!(
            credential.validate().await.unwrap_err().code,
            "provider_credential_changed"
        );
        let separate = CapturedCredential::capture(source(&other)).unwrap();
        separate.validate().await.unwrap();
    }

    #[tokio::test]
    async fn preserves_store_failure_and_redacts_corrupted_content_at_dispatch() {
        let (_temp, path, store) = home();
        store.set("openai", "initial-synthetic-key").unwrap();
        let credential = CapturedCredential::capture(source(&path)).unwrap();
        let filename = path.join("providers/credentials.toml");
        let original = std::fs::read(&filename).unwrap();
        std::fs::write(&filename, "synthetic-private-parser-content").unwrap();
        let error = credential
            .header(CredentialFormat::ApiKey)
            .await
            .unwrap_err();
        assert_eq!(error.code, "invalid_store");
        assert!(!format!("{error:?}").contains("synthetic-private-parser-content"));

        std::fs::write(&filename, "version = 2\n").unwrap();
        let error = credential.validate().await.unwrap_err();
        assert_eq!(error.kind, ErrorKind::Unsupported);
        assert_eq!(error.code, "unsupported_version");

        std::fs::write(&filename, original).unwrap();
        credential.validate().await.unwrap();
    }

    #[test]
    fn replay_identity_survives_fresh_capture_and_rotates_on_credential_change() {
        let (_home_temp, home, store) = home();
        let state = tempfile::tempdir().unwrap();
        let directory = state.path().canonicalize().unwrap();
        let first_lineage = Fingerprint::of(&"first-endpoint-model-source").unwrap();
        let other_lineage = Fingerprint::of(&"other-endpoint-model-source").unwrap();
        let capture = || CapturedCredential::capture(source(&home)).unwrap();

        store.set("openai", "initial-synthetic-key").unwrap();
        let first_capture = capture();
        let first = first_capture
            .replay_binding(&directory, first_lineage)
            .unwrap();
        assert_eq!(
            capture().replay_binding(&directory, first_lineage).unwrap(),
            first
        );
        let other = capture().replay_binding(&directory, other_lineage).unwrap();
        assert_ne!(other, first);

        store.set("openai", "rotated-synthetic-key").unwrap();
        assert_eq!(
            first_capture
                .replay_binding(&directory, first_lineage)
                .unwrap_err()
                .code,
            "provider_credential_changed"
        );
        let next = capture().replay_binding(&directory, first_lineage).unwrap();
        assert_ne!(next, first);
        assert_eq!(
            capture().replay_binding(&directory, first_lineage).unwrap(),
            next
        );
        let record =
            std::fs::read_to_string(directory.join("credential-continuity/bindings.json")).unwrap();
        assert!(!record.contains("initial-synthetic-key"));
        assert!(!record.contains("rotated-synthetic-key"));
    }

    #[test]
    fn replay_identity_persists_across_processes() {
        const STATE: &str = "GRIDA_CUSTODY_FIXTURE_STATE";
        const KEY: &str = "GRIDA_CUSTODY_FIXTURE_KEY";
        const PREFIX: &str = "fixture-replay-identity=";
        if let Some(directory) = std::env::var_os(STATE) {
            let source = CredentialSource::Environment { name: KEY.into() };
            let credential = CapturedCredential::capture(source).unwrap();
            let lineage = Fingerprint::of(&"environment-lineage").unwrap();
            let identity = credential
                .replay_binding(Path::new(&directory), lineage)
                .unwrap();
            println!("{PREFIX}{identity}");
            return;
        }

        let state = tempfile::tempdir().unwrap();
        let directory = state.path().canonicalize().unwrap();
        let run = |secret: &str| {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "stored::replay_identity_persists_across_processes",
                    "--nocapture",
                ])
                .env_clear()
                .env(STATE, &directory)
                .env(KEY, secret)
                .output()
                .unwrap();
            assert!(output.status.success());
            let stdout = std::str::from_utf8(&output.stdout).unwrap();
            assert!(!stdout.contains(secret));
            assert!(!String::from_utf8_lossy(&output.stderr).contains(secret));
            stdout
                .lines()
                .find_map(|line| line.strip_prefix(PREFIX))
                .unwrap()
                .to_owned()
        };
        let first = run("synthetic-first-key");
        assert_eq!(run("synthetic-first-key"), first);
        assert_ne!(run("synthetic-rotated-key"), first);
    }

    #[test]
    fn replay_rejects_aliases_and_corrupt_records_without_replacing_them() {
        use std::os::unix::fs::symlink;

        let (_home_temp, home, store) = home();
        let state = tempfile::tempdir().unwrap();
        let directory = state.path().canonicalize().unwrap();
        let lineage = Fingerprint::of(&"fixture").unwrap();
        store.set("openai", "synthetic").unwrap();
        let credential = CapturedCredential::capture(source(&home)).unwrap();
        credential.replay_binding(&directory, lineage).unwrap();

        let path = directory.join("credential-continuity/bindings.json");
        let other_path = path.with_file_name("other.json");
        std::fs::rename(&path, &other_path).unwrap();
        symlink(&other_path, &path).unwrap();
        let original = std::fs::read(&other_path).unwrap();
        assert_eq!(
            credential
                .replay_binding(&directory, lineage)
                .unwrap_err()
                .code,
            "credential_continuity_storage_failed"
        );
        assert_eq!(std::fs::read(&other_path).unwrap(), original);

        std::fs::remove_file(&path).unwrap();
        std::fs::rename(&other_path, &path).unwrap();
        std::fs::write(&path, "synthetic-private-record-error").unwrap();
        let error = credential.replay_binding(&directory, lineage).unwrap_err();
        assert_eq!(error.code, "credential_continuity_invalid");
        assert!(!format!("{error:?}").contains("synthetic-private-record-error"));
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "synthetic-private-record-error"
        );
    }

    #[test]
    fn rejects_non_http_key_without_rewriting_store() {
        let (_temp, path, store) = home();
        store.set("openai", "synthetic-☃-key").unwrap();
        let error = CapturedCredential::capture(source(&path)).err().unwrap();
        assert_eq!(error.code, "provider_credential_invalid");
        assert!(!format!("{error:?}").contains("synthetic-"));
        assert_eq!(
            store.read("openai").unwrap().as_deref(),
            Some("synthetic-☃-key")
        );
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
#[test]
fn unsupported_stored_backend_fails_before_opening_its_files() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().canonicalize().unwrap();
    let error = CapturedCredential::capture(CredentialSource::Stored {
        home: home.clone(),
        provider: "openai".into(),
    })
    .err()
    .unwrap();
    assert_eq!(error.kind, ErrorKind::Unsupported);
    assert_eq!(error.code, "unsupported_platform");
    assert!(!home.join("providers").exists());
}
