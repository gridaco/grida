// GRIDA-SEC-010 / GRIDA-SEC-006 — isolated registration and browser authority.
// GRIDA-GG: token — explicit native authority, no account/provider crossover.
fn home_environment(home: &std::path::Path) -> super::Environment {
    super::Environment::from([
        ("HOME".into(), home.as_os_str().to_owned()),
        ("USERPROFILE".into(), home.as_os_str().to_owned()),
    ])
}

fn local_config() -> serde_json::Value {
    serde_json::json!({
        "clientId":"local-public-client",
        "publishableKey":"sb_publishable_local_fixture",
        "issuer":"http://127.0.0.1:55431/auth/v1",
        "apiOrigin":"http://127.0.0.1:3041",
        "redirectUris": super::CALLBACKS,
    })
}

fn write_config(path: &std::path::Path, value: &serde_json::Value) {
    std::fs::write(path, serde_json::to_vec(value).unwrap()).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
}

fn local_fixture() -> (tempfile::TempDir, super::Environment) {
    let tmp = tempfile::tempdir().unwrap();
    let user = tmp.path().join("user");
    std::fs::create_dir(&user).unwrap();
    let mut env = home_environment(&user);
    let config = tmp.path().join("public-client.json");
    write_config(&config, &local_config());
    env.insert("GRIDA_CLI_LOCAL_CONFIG".into(), config.into_os_string());
    env.insert(
        "GRIDA_HOME".into(),
        tmp.path().join("grida").into_os_string(),
    );
    (tmp, env)
}

fn invalid_host(env: &super::Environment) {
    let error = super::Host::open(env)
        .err()
        .expect("configuration must fail closed");
    assert_eq!(error.value["code"], "invalid_config");
    assert!(!error.value.to_string().contains("private-config-content"));
}

#[test]
fn local_registration_is_explicit_and_does_not_create_custody() {
    let (_tmp, env) = local_fixture();
    let host = super::Host::open(&env).unwrap();
    assert_eq!(host.config.issuer, "http://127.0.0.1:55431/auth/v1");
    assert_eq!(host.config.api_origin, "http://127.0.0.1:3041");
    assert_eq!(host.config.redirect_uris, super::CALLBACKS);
    assert!(!host.home.exists());
    let mut absent_home = env.clone();
    absent_home.remove("GRIDA_HOME");
    invalid_host(&absent_home);
}

#[test]
fn local_registration_rejects_unknown_fields_and_foreign_authority() {
    let (_tmp, env) = local_fixture();
    let path = std::path::Path::new(&env["GRIDA_CLI_LOCAL_CONFIG"]);
    for (field, value) in [
        (
            "issuer",
            serde_json::json!("https://example.invalid/auth/v1"),
        ),
        (
            "issuer",
            serde_json::json!("http://localhost:55431/auth/v1"),
        ),
        (
            "issuer",
            serde_json::json!("http://127.0.0.1:55431/auth/v1/"),
        ),
        ("apiOrigin", serde_json::json!("http://127.0.0.1:3042")),
        (
            "apiOrigin",
            serde_json::json!("http://127.0.0.1:3041?private=value"),
        ),
        ("redirectUris", serde_json::json!([])),
        (
            "redirectUris",
            serde_json::json!([super::CALLBACKS[0], super::CALLBACKS[0]]),
        ),
        (
            "redirectUris",
            serde_json::json!(["http://127.0.0.1:0/callback"]),
        ),
        ("clientId", serde_json::json!("untrusted client id")),
        ("publishableKey", serde_json::Value::Null),
        ("client_secret", serde_json::json!("private-config-content")),
    ] {
        let mut value_config = local_config();
        value_config[field] = value;
        write_config(path, &value_config);
        invalid_host(&env);
    }
    for malformed in [
        serde_json::Value::Null,
        serde_json::json!([]),
        serde_json::json!({}),
        serde_json::json!("private-config-content"),
    ] {
        write_config(path, &malformed);
        invalid_host(&env);
    }
}

#[test]
fn local_configuration_file_must_exist_be_regular_and_bounded() {
    let (tmp, env) = local_fixture();
    for path in [
        PathBuf::new(),
        PathBuf::from("relative.json"),
        tmp.path().join("missing"),
        tmp.path().to_owned(),
    ] {
        let mut candidate = env.clone();
        candidate.insert("GRIDA_CLI_LOCAL_CONFIG".into(), path.into_os_string());
        invalid_host(&candidate);
    }
    let path = Path::new(&env["GRIDA_CLI_LOCAL_CONFIG"]);
    for content in [
        Vec::new(),
        vec![b'x'; 8193],
        b"private-config-content".to_vec(),
    ] {
        std::fs::write(path, content).unwrap();
        invalid_host(&env);
    }
    assert!(!Path::new(&env["GRIDA_HOME"]).exists());
}

#[cfg(unix)]
#[test]
fn local_registration_refuses_linked_and_shared_writable_files() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let (tmp, env) = local_fixture();
    let config = Path::new(&env["GRIDA_CLI_LOCAL_CONFIG"]);
    let link = tmp.path().join("link.json");
    symlink(config, &link).unwrap();
    let mut alias = env.clone();
    alias.insert("GRIDA_CLI_LOCAL_CONFIG".into(), link.into_os_string());
    invalid_host(&alias);
    let hardlink = tmp.path().join("hard.json");
    std::fs::hard_link(config, &hardlink).unwrap();
    invalid_host(&env);
    std::fs::remove_file(hardlink).unwrap();
    std::fs::set_permissions(config, std::fs::Permissions::from_mode(0o666)).unwrap();
    invalid_host(&env);
}

#[test]
fn local_home_cannot_overlap_normal_home_even_when_uncreated() {
    let (_tmp, env) = local_fixture();
    let user = Path::new(&env["HOME"]);
    for path in [
        user.to_owned(),
        user.join(".grida"),
        user.join(".grida/new"),
        user.join("other/../.grida/new"),
    ] {
        let mut candidate = env.clone();
        candidate.insert("GRIDA_HOME".into(), path.into_os_string());
        invalid_host(&candidate);
    }
    #[cfg(target_os = "macos")]
    {
        let mut candidate = env.clone();
        candidate.insert(
            "GRIDA_HOME".into(),
            user.join(".GRIDA/new").into_os_string(),
        );
        invalid_host(&candidate);
    }
    assert!(!user.join(".grida").exists());
}

#[cfg(unix)]
#[test]
fn home_aliases_resolve_before_local_isolation_and_hosted_custody() {
    let (tmp, env) = local_fixture();
    let alias = tmp.path().join("user-alias");
    std::os::unix::fs::symlink(Path::new(&env["HOME"]), &alias).unwrap();
    for path in [
        alias.clone(),
        alias.join(".grida"),
        alias.join(".grida/new"),
    ] {
        let mut candidate = env.clone();
        candidate.insert("GRIDA_HOME".into(), path.into_os_string());
        invalid_host(&candidate);
    }
    let mut hosted = env;
    hosted.remove("GRIDA_CLI_LOCAL_CONFIG");
    hosted.insert(
        "GRIDA_HOME".into(),
        alias.join(".grida/new").into_os_string(),
    );
    assert_eq!(
        Host::open(&hosted).unwrap().home,
        canonical_path(&Path::new(&hosted["HOME"]).join(".grida/new")).unwrap()
    );
}

#[test]
fn browser_url_is_bound_to_selected_issuer_but_oauth_fields_remain_producer_owned() {
    let (_tmp, env) = local_fixture();
    let local = Host::open(&env).unwrap();
    let mut hosted_env = env;
    hosted_env.remove("GRIDA_CLI_LOCAL_CONFIG");
    let hosted = Host::open(&hosted_env).unwrap();
    for host in [&local, &hosted] {
        let good = format!(
            "{}/oauth/authorize?scope=future-scope&future_parameter=producer-owned",
            host.config.issuer
        );
        assert!(host.validate_url(&good).is_ok());
        for bad in [
            format!(" {good}"),
            format!("\u{001b}{good}"),
            format!("{good}#fragment"),
            format!("{good}\r"),
            format!("{good}&state={}", "x".repeat(8192)),
            good.replace("/oauth/authorize", "/other"),
        ] {
            assert_eq!(
                host.validate_url(&bad).unwrap_err().value["code"],
                "browser_failed"
            );
        }
    }
    assert!(
        hosted
            .validate_url("http://127.0.0.1:55431/auth/v1/oauth/authorize")
            .is_err()
    );
    assert!(
        local
            .validate_url(&format!("{}/oauth/authorize", hosted.config.issuer))
            .is_err()
    );
}

#[test]
fn hosted_registration_ignores_ambient_registration_and_browser_hooks() {
    let tmp = tempfile::tempdir().unwrap();
    let mut env = home_environment(tmp.path());
    for key in [
        "GRIDA_OAUTH_CLIENT_IDS",
        "GRIDA_OAUTH_ORIGIN",
        "GRIDA_API_ORIGIN",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NODE_OPTIONS",
        "LD_PRELOAD",
        "HTTP_PROXY",
        "PATH",
    ] {
        env.insert(key.into(), "private-config-content".into());
    }
    env.insert("DISPLAY".into(), ":0".into());
    let host = Host::open(&env).unwrap();
    env.insert("DISPLAY".into(), ":changed".into());
    assert_eq!(host.config.issuer, registration().issuer);
    assert_eq!(host.config.client_id, registration().client_id);
    assert_eq!(host.browser_env["PATH"], "/usr/bin:/bin");
    assert_eq!(host.browser_env["DISPLAY"], ":0");
    assert!(
        !host
            .browser_env
            .values()
            .any(|v| v == "private-config-content")
    );
}
use super::*;
#[test]
fn host_rejects_unsafe_homes_before_creation() {
    let tmp = tempfile::tempdir().unwrap();
    let env = home_environment(tmp.path());
    for home in [
        PathBuf::from(""),
        PathBuf::from("relative"),
        PathBuf::from("/"),
        tmp.path().to_owned(),
    ] {
        let mut e = env.clone();
        e.insert("GRIDA_HOME".into(), home.into_os_string());
        assert!(Host::open(&e).is_err());
    }
    assert!(!tmp.path().join(".grida").exists());
}
#[test]
fn browser_authority_is_shipped_and_environment_is_filtered() {
    let tmp = tempfile::tempdir().unwrap();
    let mut env = home_environment(tmp.path());
    env.extend([
        ("BROWSER".into(), "attack".into()),
        ("FAL_KEY".into(), "secret".into()),
    ]);
    let h = Host::open(&env).unwrap();
    assert!(
        h.validate_url(&format!(
            "{}/oauth/authorize?client_id=public",
            h.config.issuer
        ))
        .is_ok()
    );
    for bad in [
        "https://attacker.invalid/oauth/authorize",
        "file:///etc/passwd",
        "https://grida.co/\n",
    ] {
        assert!(h.validate_url(bad).is_err());
    }
    assert!(!h.browser_env.contains_key("BROWSER"));
    assert!(!h.browser_env.contains_key("FAL_KEY"));
}
