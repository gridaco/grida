#![cfg(any(target_os = "macos", target_os = "linux"))]

// GRIDA-SEC-004: native confinement, process sessions and owner-loss cleanup.

use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::{BindingId, CancellationToken, GrantId, PrincipalId, ScopeId};
use agent_kit_sandbox::*;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn trusted(path: impl AsRef<Path>) -> TrustedExecutable {
    let path = fs::canonicalize(path).unwrap();
    TrustedExecutable {
        sha256: Sha256::digest(fs::read(&path).unwrap()).into(),
        path,
    }
}

#[allow(unsafe_code)]
fn inheritable(file: &fs::File) -> OwnedFd {
    let fd = unsafe { libc::fcntl(file.as_raw_fd(), libc::F_DUPFD, 50) };
    assert!(fd >= 50);
    // The test intentionally creates one non-CLOEXEC host descriptor.
    unsafe { OwnedFd::from_raw_fd(fd) }
}

struct Fixture {
    _base: TempDir,
    workspace: PathBuf,
    outside: PathBuf,
    temporary: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let base = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(base.path()).unwrap();
        let workspace = root.join("workspace");
        let outside = root.join("outside");
        let temporary = root.join("temporary");
        for path in [&workspace, &outside, &temporary] {
            fs::create_dir(path).unwrap();
            fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self {
            _base: base,
            workspace,
            outside,
            temporary,
        }
    }

    fn scope(&self) -> ExecutionScope {
        #[cfg(target_os = "macos")]
        let runtime = ["/bin", "/usr/bin", "/usr/lib", "/System/Library"]
            .into_iter()
            .map(PathBuf::from)
            .collect();
        #[cfg(target_os = "linux")]
        let runtime = [
            "/bin",
            "/usr/bin",
            "/lib",
            "/lib64",
            "/usr/lib",
            "/usr/lib64",
        ]
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .collect();
        ExecutionScope {
            grants: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("fixture-user").unwrap(),
                    binding: BindingId::new("local-host").unwrap(),
                    scope: ScopeId::new("fixture-workspace").unwrap(),
                },
                grants: vec![GrantId::new("finite-command").unwrap()],
            },
            revision: BindingId::new("fixture-revision").unwrap(),
            valid_until: Instant::now() + Duration::from_secs(30),
            read: vec![self.workspace.clone()],
            write: vec![self.workspace.clone()],
            runtime,
            protected: vec![ProtectedPath {
                path: self.outside.clone(),
                access: DeniedAccess::ReadWrite,
            }],
            temporary_parent: self.temporary.clone(),
            termination: Termination::ProcessGroup,
            disk_read: false,
        }
    }

    fn sandbox(&self) -> Sandbox {
        #[cfg(target_os = "linux")]
        let bubblewrap = Some(trusted(std::env::var_os("AGENT_KIT_TEST_BWRAP").expect(
            "set AGENT_KIT_TEST_BWRAP to an absolute, trusted non-setuid bwrap binary",
        )));
        #[cfg(target_os = "macos")]
        let bubblewrap = None;
        Sandbox::new(Installation {
            helper: trusted(env!("CARGO_BIN_EXE_agent-kit-sandbox-helper")),
            bubblewrap,
        })
        .unwrap()
    }

    fn command(&self, script: &str) -> ProcessSpec {
        ProcessSpec {
            executable: PathBuf::from("/bin/sh"),
            arguments: vec!["-c".into(), script.into(), "sh".into()],
            cwd: self.workspace.clone(),
            environment: BTreeMap::from([("VISIBLE".into(), "approved".into())]),
            stdin: vec![],
            timeout: Duration::from_secs(5),
            max_output_bytes: 4096,
        }
    }

    fn stream_command(&self, executable: &TrustedExecutable) -> ProcessSpec {
        ProcessSpec {
            executable: executable.path.clone(),
            arguments: vec![],
            cwd: self.workspace.clone(),
            environment: BTreeMap::new(),
            stdin: vec![],
            timeout: Duration::from_secs(5),
            max_output_bytes: 4096,
        }
    }
}

#[cfg(target_os = "macos")]
#[test]
fn unsupported_descendant_requirement_and_protected_overlap_refuse_before_launch() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let mut scope = fixture.scope();
    scope.termination = Termination::AllDescendants;
    let error = sandbox
        .prepare(fixture.command("exit 0"), scope)
        .err()
        .unwrap();
    assert_eq!(error.code, "sandbox_descendant_guarantee_unavailable");

    // A protected path inside a granted location is carved out of it.
    let mut scope = fixture.scope();
    scope.protected.push(ProtectedPath {
        path: fixture.workspace.join("future-protected-file"),
        access: DeniedAccess::Write,
    });
    assert!(sandbox.prepare(fixture.command("exit 0"), scope).is_ok());
    // A protected path that contains a granted location cannot be.
    let mut scope = fixture.scope();
    scope.protected.push(ProtectedPath {
        path: fixture.workspace.parent().unwrap().to_owned(),
        access: DeniedAccess::Write,
    });
    let error = sandbox
        .prepare(fixture.command("exit 0"), scope)
        .err()
        .unwrap();
    assert_eq!(error.code, "sandbox_protected_overlap");

    let mut scope = fixture.scope();
    scope.protected.clear();
    let mut spec = fixture.command("exit 0");
    spec.executable = fixture.outside.join("executable");
    fs::copy("/bin/sh", &spec.executable).unwrap();
    let error = sandbox.prepare(spec, scope).err().unwrap();
    assert_eq!(error.code, "sandbox_process_scope_invalid");
}

#[test]
#[cfg_attr(target_os = "linux", ignore = "requires bubblewrap")]
fn preparation_refuses_what_launch_could_not_honour() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();

    // An unreadable path that contains a readable location cannot be carved.
    let mut scope = fixture.scope();
    let inside = fixture.outside.join("inside");
    fs::create_dir(&inside).unwrap();
    scope.read.push(inside.clone());
    scope.protected = vec![ProtectedPath {
        path: fixture.outside.clone(),
        access: DeniedAccess::ReadWrite,
    }];
    let error = sandbox
        .prepare(fixture.command("exit 0"), scope)
        .err()
        .unwrap();
    assert_eq!(error.code, "sandbox_protected_overlap");
    // An unwritable path may contain a readable location: it grants nothing
    // the denial forbids. A reviewed program is both unwritable and run.
    let mut scope = fixture.scope();
    scope.read.push(inside);
    scope.runtime.push(PathBuf::from("/bin/sh"));
    scope.protected = vec![
        ProtectedPath {
            path: fixture.outside.clone(),
            access: DeniedAccess::Write,
        },
        ProtectedPath {
            path: PathBuf::from("/bin/sh"),
            access: DeniedAccess::Write,
        },
    ];
    assert!(sandbox.prepare(fixture.command("exit 0"), scope).is_ok());

    // A scope realizing no grant is not an expired one.
    let mut scope = fixture.scope();
    scope.grants.grants.clear();
    let error = sandbox
        .prepare(fixture.command("exit 0"), scope)
        .err()
        .unwrap();
    assert_eq!(error.code, "sandbox_scope_ungranted");

    // The setup frame is measured as the helper reads it, escapes included.
    let mut spec = fixture.command("exit 0");
    spec.arguments.push("\"".repeat(200 * 1024));
    let error = sandbox.prepare(spec, fixture.scope()).err().unwrap();
    assert_eq!(error.code, "sandbox_setup_limit");
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn changed_scope_identity_refuses_before_payload_spawn() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let prepared = sandbox
        .prepare(fixture.command("printf bad > marker"), fixture.scope())
        .unwrap();
    let previous = fixture.workspace.with_file_name("previous");
    fs::rename(&fixture.workspace, &previous).unwrap();
    fs::create_dir(&fixture.workspace).unwrap();
    let error = prepared.spawn(CancellationToken::new()).err().unwrap();
    assert_eq!(error.code, "sandbox_location_changed");
    assert!(!fixture.workspace.join("marker").exists());
    assert!(!previous.join("marker").exists());
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn changed_helper_contents_refuse_before_payload_spawn() {
    use std::io::Write;

    let fixture = Fixture::new();
    let helper = fixture.outside.join("helper");
    fs::copy(env!("CARGO_BIN_EXE_agent-kit-sandbox-helper"), &helper).unwrap();
    let sandbox = Sandbox::new(Installation {
        helper: trusted(&helper),
        bubblewrap: None,
    })
    .unwrap();
    let mut scope = fixture.scope();
    scope.protected.clear();
    let prepared = sandbox
        .prepare(fixture.command("printf bad > marker"), scope)
        .unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(helper)
        .unwrap()
        .write_all(b"changed")
        .unwrap();
    let error = prepared.spawn(CancellationToken::new()).err().unwrap();
    assert_eq!(error.code, "sandbox_launcher_identity");
    assert!(!fixture.workspace.join("marker").exists());
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn native_scope_confines_files_ipc_network_and_environment() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let secret = fixture.outside.join("secret");
    let forbidden_write = fixture.outside.join("new");
    fs::write(&secret, "private").unwrap();
    std::os::unix::fs::symlink(&secret, fixture.workspace.join("secret-link")).unwrap();
    let host_file = inheritable(&fs::File::open(&secret).unwrap());
    let local_socket = fixture.workspace.join("host.sock");
    let _unix_server = std::os::unix::net::UnixListener::bind(&local_socket).unwrap();
    let tcp_server = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = tcp_server.local_addr().unwrap().port();
    let mut spec = fixture.command(
        r#"
        IFS= read -r line || exit 31
        test "$line" = 'from stdin' || exit 32
        test "$VISIBLE" = approved || exit 33
        test -z "${HOME+x}" || exit 34
        if /bin/cat "$1" >/dev/null 2>&1; then exit 35; fi
        if /bin/cat secret-link >/dev/null 2>&1; then exit 43; fi
        if (: <&"$5") 2>/dev/null; then exit 44; fi
        if (printf bad > "$2") 2>/dev/null; then exit 36; fi
        printf private-temp > "$TMPDIR/file" || exit 37
        printf allowed > permitted || exit 38
        if test -x /usr/bin/nc; then
            if /usr/bin/nc -z -w 1 127.0.0.1 "$3" >/dev/null 2>&1; then exit 39; fi
            if /usr/bin/nc -z -w 1 -U "$4" >/dev/null 2>&1; then exit 40; fi
        fi
        if test -d /proc/1; then
            if (: < /proc/1/mem) 2>/dev/null; then exit 41; fi
            if (: < /proc/1/fd/0) 2>/dev/null; then exit 42; fi
            for descriptor in /proc/1/fd/*; do
                if /usr/bin/readlink "$descriptor" >/dev/null 2>&1; then exit 45; fi
            done
        fi
        printf complete
        "#,
    );
    spec.stdin = b"from stdin\n".to_vec();
    spec.arguments.extend([
        secret.to_string_lossy().into_owned(),
        forbidden_write.to_string_lossy().into_owned(),
        port.to_string(),
        local_socket.to_string_lossy().into_owned(),
        host_file.as_raw_fd().to_string(),
    ]);
    let evidence = sandbox
        .prepare(spec, fixture.scope())
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap()
        .finish()
        .await
        .unwrap();
    assert_eq!(
        evidence.completion,
        Completion::Exited(0),
        "{evidence:?} stderr={:?}",
        String::from_utf8_lossy(&evidence.stderr)
    );
    #[cfg(target_os = "macos")]
    assert_eq!(evidence.descendants, Descendants::ProcessGroupSignalled);
    #[cfg(target_os = "linux")]
    assert_eq!(evidence.descendants, Descendants::NamespaceEnded);
    let support = sandbox.probe(&fixture.scope()).await.unwrap();
    assert_eq!(evidence.support, support);
    assert_eq!(evidence.stdout, b"complete");
    assert_eq!(
        fs::read(fixture.workspace.join("permitted")).unwrap(),
        b"allowed"
    );
    assert!(!forbidden_write.exists());
    assert!(evidence.temporary_removed);
    assert!(fs::read_dir(&fixture.temporary).unwrap().next().is_none());
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn protected_paths_inside_a_writable_root_stay_unwritable() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let metadata = fixture.workspace.join(".git");
    fs::create_dir(&metadata).unwrap();
    fs::write(metadata.join("config"), "original").unwrap();
    let mut scope = fixture.scope();
    scope.protected.push(ProtectedPath {
        path: metadata.clone(),
        access: DeniedAccess::Write,
    });
    let evidence = sandbox
        .prepare(
            fixture.command(
                r#"
                /bin/cat .git/config >/dev/null || exit 31
                if (printf changed > .git/config) 2>/dev/null; then exit 32; fi
                if (printf new > .git/new) 2>/dev/null; then exit 33; fi
                printf allowed > permitted || exit 34
                printf complete
                "#,
            ),
            scope,
        )
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap()
        .finish()
        .await
        .unwrap();
    assert_eq!(
        evidence.completion,
        Completion::Exited(0),
        "stderr={:?}",
        String::from_utf8_lossy(&evidence.stderr)
    );
    assert_eq!(fs::read(metadata.join("config")).unwrap(), b"original");
    assert!(!metadata.join("new").exists());
    assert_eq!(
        fs::read(fixture.workspace.join("permitted")).unwrap(),
        b"allowed"
    );
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn missing_protected_paths_cannot_be_created_under_a_writable_root() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let mut scope = fixture.scope();
    scope.protected.extend([
        ProtectedPath {
            path: fixture.workspace.join(".agent"),
            access: DeniedAccess::Write,
        },
        ProtectedPath {
            path: fixture.workspace.join("state"),
            access: DeniedAccess::ReadWrite,
        },
    ]);
    let attempt = r#"
        if mkdir .agent 2>/dev/null; then exit 31; fi
        if (printf x > .agent) 2>/dev/null; then exit 32; fi
        if (printf x > .agent/config) 2>/dev/null; then exit 33; fi
        if mkdir state 2>/dev/null; then exit 34; fi
        if (printf x > state) 2>/dev/null; then exit 35; fi
        printf allowed > permitted || exit 36
    "#;
    // A longer launch relies on the same protection while a shorter one
    // starts and finishes.
    let older = sandbox
        .prepare(
            fixture.command(&format!(
                "{attempt}\nprintf ready > older-ready\n\
                 while [ ! -f release ]; do /bin/sleep 0.02; done"
            )),
            scope.clone(),
        )
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap();
    let ready = tokio::time::timeout(Duration::from_secs(3), async {
        while !fixture.workspace.join("older-ready").exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await;
    if ready.is_err() {
        older.request_stop();
        let evidence = older.finish().await.unwrap();
        panic!(
            "{evidence:?} stderr={:?}",
            String::from_utf8_lossy(&evidence.stderr)
        );
    }
    let newer = sandbox
        .prepare(fixture.command(attempt), scope)
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap()
        .finish()
        .await
        .unwrap();
    assert_eq!(
        newer.completion,
        Completion::Exited(0),
        "stderr={:?}",
        String::from_utf8_lossy(&newer.stderr)
    );
    fs::write(fixture.workspace.join("release"), b"").unwrap();
    let older = older.finish().await.unwrap();
    assert_eq!(
        older.completion,
        Completion::Exited(0),
        "stderr={:?}",
        String::from_utf8_lossy(&older.stderr)
    );
    #[cfg(target_os = "linux")]
    assert_eq!(older.descendants, Descendants::NamespaceEnded);
    // Nothing the launches were denied is left on the host.
    assert!(fs::symlink_metadata(fixture.workspace.join(".agent")).is_err());
    assert!(fs::symlink_metadata(fixture.workspace.join("state")).is_err());
    assert_eq!(
        fs::read(fixture.workspace.join("permitted")).unwrap(),
        b"allowed"
    );
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn denials_outside_the_grant_never_widen_access() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let secret = fixture.outside.join("secret");
    fs::write(&secret, "private").unwrap();
    let state = fixture.workspace.join("state");
    fs::create_dir(&state).unwrap();
    fs::write(state.join("token"), "private").unwrap();
    let mut scope = fixture.scope();
    // An unwritable path outside every grant stays out of reach, and a path
    // protected twice keeps the stronger denial.
    scope.protected = vec![
        ProtectedPath {
            path: secret.clone(),
            access: DeniedAccess::Write,
        },
        ProtectedPath {
            path: state.clone(),
            access: DeniedAccess::ReadWrite,
        },
        ProtectedPath {
            path: state.clone(),
            access: DeniedAccess::Write,
        },
    ];
    let mut spec = fixture.command(
        r#"
        if /bin/cat "$1" >/dev/null 2>&1; then exit 31; fi
        if /bin/cat state/token >/dev/null 2>&1; then exit 32; fi
        printf complete
        "#,
    );
    spec.arguments.push(secret.to_string_lossy().into_owned());
    let evidence = sandbox
        .prepare(spec, scope)
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap()
        .finish()
        .await
        .unwrap();
    assert_eq!(
        evidence.completion,
        Completion::Exited(0),
        "stderr={:?}",
        String::from_utf8_lossy(&evidence.stderr)
    );
    assert_eq!(evidence.stdout, b"complete");
}

#[test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
fn a_launch_outlives_the_thread_that_started_it() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .thread_keep_alive(Duration::from_millis(100))
        .build()
        .unwrap();
    runtime.block_on(async {
        let fixture = Fixture::new();
        let sandbox = std::sync::Arc::new(fixture.sandbox());
        let spec = fixture.command("/bin/sleep 2; printf complete");
        let scope = fixture.scope();
        // The blocking-pool thread retires long before the command ends.
        let running = tokio::task::spawn_blocking(move || {
            sandbox
                .prepare(spec, scope)
                .unwrap()
                .spawn(CancellationToken::new())
                .unwrap()
        })
        .await
        .unwrap();
        let evidence = running.finish().await.unwrap();
        assert_eq!(
            evidence.completion,
            Completion::Exited(0),
            "{evidence:?} stderr={:?}",
            String::from_utf8_lossy(&evidence.stderr)
        );
        assert_eq!(evidence.stdout, b"complete");
        #[cfg(target_os = "macos")]
        assert_eq!(evidence.descendants, Descendants::ProcessGroupSignalled);
        #[cfg(target_os = "linux")]
        assert_eq!(evidence.descendants, Descendants::NamespaceEnded);
    });
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn disk_read_reaches_outside_the_grant_but_not_protected_paths() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let elsewhere = fixture.temporary.parent().unwrap().join("elsewhere");
    fs::create_dir(&elsewhere).unwrap();
    fs::write(elsewhere.join("readme"), "visible").unwrap();
    let secret = fixture.outside.join("secret");
    fs::write(&secret, "private").unwrap();
    let mut scope = fixture.scope();
    scope.disk_read = true;
    let mut spec = fixture.command(
        r#"
        test "$(/bin/cat "$1")" = visible || exit 31
        if /bin/cat "$2" >/dev/null 2>&1; then exit 32; fi
        if (printf bad > "$1") 2>/dev/null; then exit 33; fi
        printf complete
        "#,
    );
    spec.arguments.extend([
        elsewhere.join("readme").to_string_lossy().into_owned(),
        secret.to_string_lossy().into_owned(),
    ]);
    let evidence = sandbox
        .prepare(spec, scope)
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap()
        .finish()
        .await
        .unwrap();
    assert_eq!(
        evidence.completion,
        Completion::Exited(0),
        "stderr={:?}",
        String::from_utf8_lossy(&evidence.stderr)
    );
    assert_eq!(fs::read(elsewhere.join("readme")).unwrap(), b"visible");
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn native_output_and_cancellation_are_bounded() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let mut noisy = fixture
        .command("printf ready > noisy-started; while :; do printf '0123456789abcdef'; done");
    noisy.max_output_bytes = 1024;
    let result = sandbox
        .prepare(noisy, fixture.scope())
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap()
        .finish()
        .await
        .unwrap();
    assert_eq!(result.stopped, Some(StopReason::OutputLimit), "{result:?}");
    assert!(result.output_truncated);
    assert_eq!(result.stdout.len() + result.stderr.len(), 1024);
    assert!(
        fixture.workspace.join("noisy-started").exists(),
        "{result:?} stdout={:?} stderr={:?}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(result.temporary_removed);

    let run = sandbox
        .prepare(
            fixture.command("printf ready > started; while :; do :; done"),
            fixture.scope(),
        )
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap();
    tokio::time::timeout(Duration::from_secs(3), async {
        while !fixture.workspace.join("started").exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    run.request_stop();
    run.request_stop();
    let result = run.finish().await.unwrap();
    assert_eq!(result.stopped, Some(StopReason::Requested));
    assert!(result.temporary_removed);
    #[cfg(target_os = "macos")]
    assert_eq!(result.descendants, Descendants::ProcessGroupSignalled);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn reviewed_streaming_stdio_exchanges_binary_data_and_closes() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let cat = trusted("/bin/cat");
    let scope = fixture.scope();
    let mut wrong = cat.clone();
    wrong.sha256[0] ^= 1;
    let error = sandbox
        .prepare(fixture.stream_command(&cat), scope.clone())
        .unwrap()
        .spawn_streaming(&wrong, CancellationToken::new())
        .err()
        .unwrap();
    assert_eq!(error.code, "reviewed_executable_changed");

    let mut fixed = fixture.stream_command(&cat);
    fixed.stdin = b"fixed".to_vec();
    let error = sandbox
        .prepare(fixed, scope.clone())
        .unwrap()
        .spawn_streaming(&cat, CancellationToken::new())
        .err()
        .unwrap();
    assert_eq!(error.code, "sandbox_fixed_stdin_present");

    let (running, mut stream) = sandbox
        .prepare(fixture.stream_command(&cat), scope)
        .unwrap()
        .spawn_streaming(&cat, CancellationToken::new())
        .unwrap();
    // Each response must arrive before the writer reaches EOF.
    for message in [[0xff, 0, 0x0a], [0, 0x0d, 0x80]] {
        stream.write_all(&message).await.unwrap();
        let mut response = [0; 3];
        stream.read_exact(&mut response).await.unwrap();
        assert_eq!(response, message);
    }
    stream.shutdown().await.unwrap();
    assert_eq!(stream.read(&mut [0; 1]).await.unwrap(), 0);
    let result = running.finish().await.unwrap();
    assert_eq!(result.completion, Completion::Exited(0), "{result:?}");
    assert_eq!(result.stopped, None, "{result:?}");
    assert!(result.stdout.is_empty() && result.stderr.is_empty());
    assert!(!result.output_truncated);
    assert!(result.temporary_removed);
    #[cfg(target_os = "macos")]
    assert_eq!(result.descendants, Descendants::ProcessGroupSignalled);
    #[cfg(target_os = "linux")]
    assert_eq!(result.descendants, Descendants::NamespaceEnded);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn reviewed_streaming_stdio_retains_bounds_and_stop_ownership() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let cat = trusted("/bin/cat");
    let mut output = fixture.stream_command(&cat);
    output.max_output_bytes = 8;
    let (running, mut stream) = sandbox
        .prepare(output, fixture.scope())
        .unwrap()
        .spawn_streaming(&cat, CancellationToken::new())
        .unwrap();
    stream.write_all(b"123456789").await.unwrap();
    let mut received = Vec::new();
    stream.read_to_end(&mut received).await.unwrap();
    let result = running.finish().await.unwrap();
    assert_eq!(received, b"12345678");
    assert_eq!(result.stopped, Some(StopReason::OutputLimit), "{result:?}");
    assert!(result.output_truncated && result.temporary_removed);

    let wc = trusted("/usr/bin/wc");
    let mut input = fixture.stream_command(&wc);
    input.arguments.push("-c".into());
    let (running, mut stream) = sandbox
        .prepare(input, fixture.scope())
        .unwrap()
        .spawn_streaming(&wc, CancellationToken::new())
        .unwrap();
    let _ = stream.write_all(&vec![0; 1024 * 1024 + 1]).await;
    let result = running.finish().await.unwrap();
    assert_eq!(result.stopped, Some(StopReason::InputLimit), "{result:?}");
    assert!(result.temporary_removed);

    let (running, mut stream) = sandbox
        .prepare(fixture.stream_command(&cat), fixture.scope())
        .unwrap()
        .spawn_streaming(&cat, CancellationToken::new())
        .unwrap();
    stream.write_all(b"ready").await.unwrap();
    let mut ready = [0; 5];
    stream.read_exact(&mut ready).await.unwrap();
    assert_eq!(&ready, b"ready");
    running.request_stop();
    let result = running.finish().await.unwrap();
    assert_eq!(result.stopped, Some(StopReason::Requested), "{result:?}");
    assert!(result.temporary_removed);
    assert_eq!(stream.read(&mut [0; 1]).await.unwrap(), 0);
    #[cfg(target_os = "macos")]
    assert_eq!(result.descendants, Descendants::ProcessGroupSignalled);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn concurrent_executions_cannot_read_each_others_temporary_files() {
    // Reading anywhere on disk still excludes other launches' storage.
    for disk_read in [false, true] {
        concurrent_temporary_files_stay_private(disk_read).await;
    }
}

async fn concurrent_temporary_files_stay_private(disk_read: bool) {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let mut scope = fixture.scope();
    scope.disk_read = disk_read;
    let older = sandbox.prepare(
        fixture.command("printf private > \"$TMPDIR/file\"; printf %s \"$TMPDIR/file\" > older-path; while :; do :; done"),
        scope.clone(),
    ).unwrap().spawn(CancellationToken::new()).unwrap();
    let older_path = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if let Ok(path) = fs::read_to_string(fixture.workspace.join("older-path"))
                && Path::new(&path).is_file()
            {
                break path;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let mut newer = fixture.command(
        "if /bin/cat \"$1\" >/dev/null 2>&1; then exit 51; fi; \
         if test -e \"$2\"; then exit 52; fi; \
         printf local > \"$TMPDIR/file\"",
    );
    newer.arguments.push(older_path.clone());
    newer.arguments.push(
        Path::new(&older_path)
            .parent()
            .unwrap()
            .to_string_lossy()
            .into_owned(),
    );
    let newer = sandbox
        .prepare(newer, scope)
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap()
        .finish()
        .await
        .unwrap();
    assert_eq!(
        newer.completion,
        Completion::Exited(0),
        "disk_read={disk_read} stderr={:?}",
        String::from_utf8_lossy(&newer.stderr)
    );
    assert!(newer.temporary_removed);
    assert_eq!(fs::read(&older_path).unwrap(), b"private");
    older.request_stop();
    assert!(older.finish().await.unwrap().temporary_removed);
    assert!(!Path::new(&older_path).exists());
}

#[cfg(target_os = "linux")]
#[tokio::test]
#[ignore = "requires bubblewrap and working PID namespaces"]
async fn a_new_session_cannot_outlive_the_linux_pid_namespace() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let mut scope = fixture.scope();
    scope.termination = Termination::AllDescendants;
    let run = sandbox
        .prepare(
            fixture.command(
                r#"
        /usr/bin/setsid /bin/sh -c '
            printf ready > detached
            remaining=60
            while [ "$remaining" -gt 0 ]; do
                if [ -f after-stop ]; then printf escaped > survived; exit; fi
                remaining=$((remaining - 1))
                /bin/sleep 0.05
            done
        ' &
        wait
    "#,
            ),
            scope,
        )
        .unwrap()
        .spawn(CancellationToken::new())
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), async {
        while !fixture.workspace.join("detached").exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    run.request_stop();
    let result = run.finish().await.unwrap();
    assert_eq!(result.stopped, Some(StopReason::Requested));
    assert_eq!(result.support.termination, Termination::AllDescendants);
    fs::write(fixture.workspace.join("after-stop"), b"continue").unwrap();
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert!(!fixture.workspace.join("survived").exists());
}

impl Fixture {
    /// A shell without the macOS `/bin/sh` selector, whose lookup the
    /// sandbox denies with a diagnostic on stderr. A session merges stderr
    /// into its output, so the fixtures avoid that noise.
    fn session_command(&self, script: &str) -> ProcessSpec {
        ProcessSpec {
            executable: PathBuf::from("/bin/bash"),
            ..self.command(script)
        }
    }
}

fn session_options(terminal: bool) -> SessionOptions {
    SessionOptions {
        terminal,
        retained_output_bytes: 64 * 1024,
    }
}

/// Read until `done` holds for everything read so far or the session ends.
async fn read_until(
    session: &RunningSession,
    within: Duration,
    done: impl Fn(&[u8]) -> bool,
) -> (Vec<u8>, bool) {
    let until = Instant::now() + within;
    let mut output = Vec::new();
    loop {
        let read = session.read(until, 64 * 1024).await;
        output.extend_from_slice(&read.output);
        if read.ended || done(&output) || Instant::now() >= until {
            return (output, read.ended);
        }
    }
}

fn contains(haystack: &[u8], needle: &str) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle.as_bytes())
}

async fn wait_for_file(path: &Path, within: Duration) -> bool {
    tokio::time::timeout(within, async {
        while !path.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .is_ok()
}

#[test]
fn a_session_handle_can_be_shared_across_tasks() {
    fn shared<T: Send + Sync + 'static>() {}
    fn sendable<T: Send>(_: &T) {}
    shared::<RunningSession>();
    shared::<std::sync::Arc<RunningSession>>();
    // A read can run on any runtime worker.
    let _ = |session: &RunningSession| {
        let read = session.read(Instant::now(), 1);
        sendable(&read);
    };
}

#[cfg(target_os = "macos")]
const SESSION_DESCENDANTS: Descendants = Descendants::ProcessGroupSignalled;
#[cfg(target_os = "linux")]
const SESSION_DESCENDANTS: Descendants = Descendants::NamespaceEnded;

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn pipe_session_reads_output_as_it_arrives() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let mut spec = fixture.session_command(
        r#"
        if IFS= read -r line; then exit 31; fi
        printf first
        /bin/sleep 1.5
        printf second >&2
        "#,
    );
    // A session is not bound by the finite timeout.
    spec.timeout = Duration::from_secs(1);
    let session = sandbox
        .prepare(spec, fixture.scope())
        .unwrap()
        .spawn_session(session_options(false), CancellationToken::new())
        .unwrap();
    let started = Instant::now();
    let first = session.read(started + Duration::from_secs(10), 4096).await;
    assert_eq!(first.output, b"first", "{first:?}");
    assert!(!first.ended && first.omitted_bytes == 0 && first.omitted_at.is_none());
    assert!(started.elapsed() < Duration::from_millis(1400));
    let quiet = session
        .read(Instant::now() + Duration::from_millis(200), 4096)
        .await;
    assert_eq!(quiet, SessionRead::default());
    let error = session.write(b"input").err().unwrap();
    assert_eq!(error.code, "sandbox_session_stdin_closed");
    let (rest, ended) = read_until(&session, Duration::from_secs(10), |_| false).await;
    assert_eq!(rest, b"second");
    assert!(ended && session.has_ended());
    let after = session
        .read(Instant::now() + Duration::from_secs(5), 4096)
        .await;
    assert!(after.ended && after.output.is_empty());
    let evidence = session.finish().await.unwrap();
    assert_eq!(evidence.completion, Completion::Exited(0), "{evidence:?}");
    assert_eq!(evidence.stopped, None);
    assert!(evidence.stdout.is_empty() && evidence.stderr.is_empty());
    assert!(!evidence.output_truncated);
    assert_eq!(evidence.descendants, SESSION_DESCENDANTS);
    assert!(evidence.temporary_removed);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn pipe_session_interrupt_signals_the_payload_and_keeps_supervision() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let trapped = sandbox
        .prepare(
            fixture.session_command(
                r#"
                trap 'printf interrupted; exit 7' INT
                printf ready
                while :; do /bin/sleep 0.05; done
                "#,
            ),
            fixture.scope(),
        )
        .unwrap()
        .spawn_session(session_options(false), CancellationToken::new())
        .unwrap();
    let (output, _) = read_until(&trapped, Duration::from_secs(10), |output| {
        contains(output, "ready")
    })
    .await;
    assert_eq!(output, b"ready");
    trapped.interrupt().unwrap();
    let (output, ended) = read_until(&trapped, Duration::from_secs(10), |_| false).await;
    assert!(ended, "{}", String::from_utf8_lossy(&output));
    assert_eq!(output, b"interrupted");
    assert!(trapped.interrupt().is_err());
    let evidence = trapped.finish().await.unwrap();
    assert_eq!(evidence.completion, Completion::Exited(7), "{evidence:?}");
    assert_eq!(evidence.stopped, None);
    assert_eq!(evidence.descendants, SESSION_DESCENDANTS);

    let plain = sandbox
        .prepare(
            fixture.session_command("printf ready; exec /bin/sleep 100"),
            fixture.scope(),
        )
        .unwrap()
        .spawn_session(session_options(false), CancellationToken::new())
        .unwrap();
    read_until(&plain, Duration::from_secs(10), |output| {
        contains(output, "ready")
    })
    .await;
    plain.interrupt().unwrap();
    let (_, ended) = read_until(&plain, Duration::from_secs(10), |_| false).await;
    assert!(ended);
    let evidence = plain.finish().await.unwrap();
    assert_eq!(
        evidence.completion,
        Completion::Signaled(libc::SIGINT),
        "{evidence:?}"
    );
    assert_eq!(evidence.stopped, None);
    assert_eq!(evidence.descendants, SESSION_DESCENDANTS);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn terminal_session_runs_on_a_pseudo_terminal() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let session = sandbox
        .prepare(
            fixture.session_command(
                r#"
                if test -t 0 && test -t 1 && test -t 2; then printf 'tty:yes\n'; fi
                printf 'size:%s\n' "$(/bin/stty size)"
                IFS= read -r line
                printf 'got:%s\n' "$line"
                "#,
            ),
            fixture.scope(),
        )
        .unwrap()
        .spawn_session(session_options(true), CancellationToken::new())
        .unwrap();
    let (output, _) = read_until(&session, Duration::from_secs(10), |output| {
        contains(output, "size:")
    })
    .await;
    assert!(
        contains(&output, "tty:yes\r\n"),
        "{}",
        String::from_utf8_lossy(&output)
    );
    session.write(b"hello\n").unwrap();
    let (rest, ended) = read_until(&session, Duration::from_secs(10), |_| false).await;
    let output = [output, rest].concat();
    assert!(ended, "{}", String::from_utf8_lossy(&output));
    assert!(
        contains(&output, "size:24 80"),
        "{}",
        String::from_utf8_lossy(&output)
    );
    // The terminal echoes the typed line before the payload consumes it.
    assert!(
        contains(&output, "hello\r\n"),
        "{}",
        String::from_utf8_lossy(&output)
    );
    assert!(
        contains(&output, "got:hello\r\n"),
        "{}",
        String::from_utf8_lossy(&output)
    );
    let error = session.write(&vec![0; 64 * 1024 + 1]).err().unwrap();
    assert_eq!(error.code, "sandbox_session_input_limit");
    let evidence = session.finish().await.unwrap();
    assert_eq!(evidence.completion, Completion::Exited(0), "{evidence:?}");
    assert_eq!(evidence.descendants, SESSION_DESCENDANTS);
    assert!(evidence.temporary_removed);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn terminal_session_interrupt_types_the_interrupt_character() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let session = sandbox
        .prepare(
            fixture.session_command("printf 'ready\\n'; exec /bin/sleep 100"),
            fixture.scope(),
        )
        .unwrap()
        .spawn_session(session_options(true), CancellationToken::new())
        .unwrap();
    read_until(&session, Duration::from_secs(10), |output| {
        contains(output, "ready")
    })
    .await;
    let interrupted = Instant::now();
    session.interrupt().unwrap();
    let (_, ended) = read_until(&session, Duration::from_secs(10), |_| false).await;
    assert!(ended);
    assert!(interrupted.elapsed() < Duration::from_secs(5));
    let evidence = session.finish().await.unwrap();
    assert_eq!(
        evidence.completion,
        Completion::Signaled(libc::SIGINT),
        "{evidence:?}"
    );
    assert_eq!(evidence.stopped, None);
    assert_eq!(evidence.descendants, SESSION_DESCENDANTS);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn stopping_a_session_ends_its_background_descendants() {
    for terminal in [false, true] {
        let fixture = Fixture::new();
        let sandbox = fixture.sandbox();
        let session = sandbox
            .prepare(
                fixture.session_command(
                    r#"
                    (
                        while :; do
                            if [ -f after-stop ]; then printf escaped > survived; exit; fi
                            /bin/sleep 0.05
                        done
                    ) &
                    printf ready > started
                    wait
                    "#,
                ),
                fixture.scope(),
            )
            .unwrap()
            .spawn_session(session_options(terminal), CancellationToken::new())
            .unwrap();
        assert!(wait_for_file(&fixture.workspace.join("started"), Duration::from_secs(10)).await);
        session.request_stop();
        session.request_stop();
        let (_, ended) = read_until(&session, Duration::from_secs(10), |_| false).await;
        assert!(ended);
        let evidence = session.finish().await.unwrap();
        assert_eq!(
            evidence.stopped,
            Some(StopReason::Requested),
            "{evidence:?}"
        );
        assert_eq!(
            evidence.completion,
            Completion::Signaled(libc::SIGKILL),
            "terminal={terminal} {evidence:?}"
        );
        assert_eq!(
            evidence.descendants, SESSION_DESCENDANTS,
            "terminal={terminal}"
        );
        assert!(evidence.temporary_removed);
        fs::write(fixture.workspace.join("after-stop"), b"continue").unwrap();
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert!(
            !fixture.workspace.join("survived").exists(),
            "terminal={terminal}"
        );
    }
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn a_session_ends_at_the_scope_deadline_or_when_its_handle_is_dropped() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let mut scope = fixture.scope();
    scope.valid_until = Instant::now() + Duration::from_secs(2);
    let session = sandbox
        .prepare(fixture.session_command("exec /bin/sleep 100"), scope)
        .unwrap()
        .spawn_session(session_options(true), CancellationToken::new())
        .unwrap();
    let evidence = session.finish().await.unwrap();
    assert_eq!(evidence.stopped, Some(StopReason::Deadline), "{evidence:?}");
    assert_eq!(evidence.descendants, SESSION_DESCENDANTS);

    let session = sandbox
        .prepare(
            fixture.session_command("while :; do printf alive > heartbeat; /bin/sleep 0.05; done"),
            fixture.scope(),
        )
        .unwrap()
        .spawn_session(session_options(false), CancellationToken::new())
        .unwrap();
    let heartbeat = fixture.workspace.join("heartbeat");
    assert!(wait_for_file(&heartbeat, Duration::from_secs(10)).await);
    drop(session);
    tokio::time::sleep(Duration::from_secs(2)).await;
    fs::remove_file(&heartbeat).unwrap();
    assert!(!wait_for_file(&heartbeat, Duration::from_millis(500)).await);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn retained_session_output_counts_what_it_drops() {
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let options = SessionOptions {
        terminal: false,
        retained_output_bytes: 1023,
    };
    let error = sandbox
        .prepare(fixture.session_command("exit 0"), fixture.scope())
        .unwrap()
        .spawn_session(options, CancellationToken::new())
        .err()
        .unwrap();
    assert_eq!(error.code, "sandbox_session_limit");
    let mut fixed = fixture.session_command("exit 0");
    fixed.stdin = b"fixed".to_vec();
    let error = sandbox
        .prepare(fixed, fixture.scope())
        .unwrap()
        .spawn_session(session_options(false), CancellationToken::new())
        .err()
        .unwrap();
    assert_eq!(error.code, "sandbox_fixed_stdin_present");

    let session = sandbox
        .prepare(
            fixture.session_command(
                "i=0; while [ $i -lt 2000 ]; do printf '0123456789abcdef'; i=$((i + 1)); done",
            ),
            fixture.scope(),
        )
        .unwrap()
        .spawn_session(
            SessionOptions {
                terminal: false,
                retained_output_bytes: 1024,
            },
            CancellationToken::new(),
        )
        .unwrap();
    // Nobody reads while the payload writes; it is never blocked.
    tokio::time::timeout(Duration::from_secs(20), async {
        while !session.has_ended() {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    let read = session.read(Instant::now(), 256).await;
    assert!(read.ended);
    assert_eq!(read.output.len(), 256);
    assert_eq!(read.omitted_bytes, 32_000 - 256);
    assert_eq!(read.omitted_at, Some(128));
    assert!(read.output.starts_with(b"0123456789abcdef"));
    assert!(read.output.ends_with(b"0123456789abcdef"));
    let evidence = session.finish().await.unwrap();
    assert_eq!(evidence.completion, Completion::Exited(0), "{evidence:?}");
    assert!(!evidence.output_truncated);
}

/// Started as its own process by the owner-loss fixture, which kills it.
#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn session_owner_process() {
    let Some(report) = std::env::var_os("AGENT_KIT_TEST_SESSION_OWNER") else {
        return;
    };
    let fixture = Fixture::new();
    let sandbox = fixture.sandbox();
    let mut scope = fixture.scope();
    scope.valid_until = Instant::now() + Duration::from_secs(60);
    let mut sessions = Vec::new();
    for (terminal, name) in [(false, "pipe"), (true, "terminal")] {
        sessions.push(
            sandbox
                .prepare(
                    fixture.session_command(&format!(
                        "( while :; do printf alive > {name}-child; /bin/sleep 0.05; done ) & \
                         while :; do printf alive > {name}; /bin/sleep 0.05; done"
                    )),
                    scope.clone(),
                )
                .unwrap()
                .spawn_session(session_options(terminal), CancellationToken::new())
                .unwrap(),
        );
    }
    fs::write(report, fixture.workspace.to_string_lossy().as_bytes()).unwrap();
    // The fixture kills this process before the sessions would end.
    tokio::time::sleep(Duration::from_secs(60)).await;
    drop(sessions);
}

#[tokio::test]
#[ignore = "requires native Seatbelt or bubblewrap and working namespaces"]
async fn a_session_ends_when_its_owner_process_disappears() {
    let directory = tempfile::tempdir().unwrap();
    let report = directory.path().join("workspace");
    let mut owner = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "session_owner_process",
            "--include-ignored",
            "--nocapture",
        ])
        .env("AGENT_KIT_TEST_SESSION_OWNER", &report)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let ready = tokio::time::timeout(Duration::from_secs(20), async {
        loop {
            if let Ok(workspace) = fs::read_to_string(&report) {
                let workspace = PathBuf::from(workspace);
                if ["pipe", "terminal", "pipe-child", "terminal-child"]
                    .iter()
                    .all(|name| workspace.join(name).exists())
                {
                    break workspace;
                }
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await;
    let Ok(workspace) = ready else {
        let _ = owner.kill();
        let _ = owner.wait();
        panic!("the owner process did not start its sessions");
    };
    // The owner ends without any chance to stop its sessions.
    owner.kill().unwrap();
    owner.wait().unwrap();
    tokio::time::sleep(Duration::from_secs(1)).await;
    for name in ["pipe", "terminal", "pipe-child", "terminal-child"] {
        fs::remove_file(workspace.join(name)).unwrap();
    }
    tokio::time::sleep(Duration::from_millis(500)).await;
    for name in ["pipe", "terminal", "pipe-child", "terminal-child"] {
        assert!(!workspace.join(name).exists(), "{name} outlived its owner");
    }
    let _ = fs::remove_dir_all(workspace.parent().unwrap());
}
