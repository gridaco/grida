use super::{CommandNetworkDestination, ManagedCommandProxy};
use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::{BindingId, CancellationToken, GrantId, PrincipalId, ScopeId};
use agent_kit_sandbox::{
    Completion, DeniedAccess, ExecutionScope, Installation, ProcessSpec, ProtectedPath, Sandbox,
    Termination, TrustedExecutable,
};
use futures_util::FutureExt;
use futures_util::future::BoxFuture;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::net::{Ipv4Addr, SocketAddr};
use std::os::unix::fs::DirBuilderExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};

const INDEX: &str = "registry.example.test";
const ARTIFACTS: &str = "files.example.test";
const INDEX_ADDRESS: Ipv4Addr = Ipv4Addr::new(1, 1, 1, 1);
const ARTIFACT_ADDRESS: Ipv4Addr = Ipv4Addr::new(8, 8, 8, 8);

fn program(name: &str) -> PathBuf {
    std::env::split_paths(&std::env::var_os("PATH").expect("test PATH"))
        .map(|path| path.join(name))
        .find_map(|candidate| candidate.canonicalize().ok().filter(|path| path.is_file()))
        .unwrap_or_else(|| panic!("package-client regression requires {name}"))
}

struct Registry {
    _server: Child,
    _root: tempfile::TempDir,
    address: SocketAddr,
    certificate: PathBuf,
}

impl Registry {
    async fn start() -> Self {
        let root = tempfile::tempdir().unwrap();
        let mut server = Command::new(program("python3"))
            .args(["-c", include_str!("package_registry.py")])
            .arg(root.path())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let mut ready = String::new();
        let bytes_read = tokio::time::timeout(
            Duration::from_secs(20),
            BufReader::new(server.stdout.take().unwrap()).read_line(&mut ready),
        )
        .await
        .expect("fixture TLS server did not start")
        .unwrap();
        assert_ne!(bytes_read, 0, "fixture TLS server exited before readiness");
        let port = ready.trim().parse().expect("fixture TLS server port");
        Self {
            _server: server,
            certificate: root.path().canonicalize().unwrap().join("ca.pem"),
            _root: root,
            address: (Ipv4Addr::LOCALHOST, port).into(),
        }
    }
}

#[derive(Clone, Copy)]
enum Installer {
    Npm,
    Uv,
}

impl Installer {
    fn process(self, workspace: &Path, certificate: &Path) -> ProcessSpec {
        let path = |path: &Path| path.to_str().unwrap().to_owned();
        let mut environment = BTreeMap::from([("HOME".into(), path(workspace))]);
        let (executable, arguments) = match self {
            Self::Npm => {
                fs::write(
                    workspace.join("package.json"),
                    br#"{"name":"fixture","version":"1.0.0","private":true}"#,
                )
                .unwrap();
                fs::write(workspace.join("empty-npmrc"), "").unwrap();
                let arguments = vec![
                    path(&program("npm")),
                    "install".into(),
                    "grida-proxy-package@1.0.0".into(),
                    format!("--registry=https://{INDEX}"),
                    "--no-audit".into(),
                    "--no-fund".into(),
                    "--ignore-scripts".into(),
                    "--fetch-retries=0".into(),
                    "--cache=cache".into(),
                    "--userconfig=/dev/null".into(),
                    "--globalconfig=empty-npmrc".into(),
                    format!("--cafile={}", certificate.display()),
                ];
                (program("node"), arguments)
            }
            Self::Uv => {
                environment.extend([
                    ("SSL_CERT_FILE".into(), path(certificate)),
                    ("UV_HTTP_RETRIES".into(), "0".into()),
                    ("UV_HTTP_TIMEOUT".into(), "5".into()),
                ]);
                (
                    program("uv"),
                    vec![
                        "--no-config".into(),
                        "--no-python-downloads".into(),
                        "--cache-dir=cache".into(),
                        "pip".into(),
                        "install".into(),
                        "grida-proxy-wheel==1.0.0".into(),
                        format!("--index-url=https://{INDEX}/simple/"),
                        "--python".into(),
                        path(&program("python3")),
                        "--target=installed".into(),
                    ],
                )
            }
        };
        ProcessSpec {
            executable,
            arguments,
            cwd: workspace.to_owned(),
            environment,
            stdin: Vec::new(),
            timeout: Duration::from_secs(30),
            max_output_bytes: 16 * 1024,
        }
    }
}

fn sandbox() -> Sandbox {
    let trusted = |key| {
        let path = fs::canonicalize(std::env::var_os(key).expect(key)).unwrap();
        TrustedExecutable {
            sha256: Sha256::digest(fs::read(&path).unwrap()).into(),
            path,
        }
    };
    Sandbox::new(Installation {
        helper: trusted("GRIDA_AGENT_TEST_SANDBOX_HELPER"),
        #[cfg(target_os = "linux")]
        bubblewrap: Some(trusted("AGENT_KIT_TEST_BWRAP")),
        #[cfg(target_os = "macos")]
        bubblewrap: None,
    })
    .unwrap()
}

async fn install(registry: &Registry, installer: Installer, allow_artifact: bool) {
    let base = tempfile::tempdir().unwrap();
    let root = base.path().canonicalize().unwrap();
    let workspace = root.join("workspace");
    let state = root.join("state");
    let temporary = root.join("temporary");
    for path in [&workspace, &state, &temporary] {
        fs::DirBuilder::new().mode(0o700).create(path).unwrap();
    }
    let certificate = workspace.join("ca.pem");
    fs::copy(&registry.certificate, &certificate).unwrap();
    let scope = ExecutionScope {
        grants: GrantSelection {
            authority: AuthorityBinding {
                principal: PrincipalId::new("fixture-user").unwrap(),
                binding: BindingId::new("host").unwrap(),
                scope: ScopeId::new("project").unwrap(),
            },
            grants: vec![GrantId::new("managed-command").unwrap()],
        },
        revision: BindingId::new("fixture").unwrap(),
        valid_until: Instant::now() + Duration::from_secs(60),
        read: vec![workspace.clone()],
        write: vec![workspace.clone()],
        runtime: Vec::new(),
        protected: vec![ProtectedPath {
            path: state.clone(),
            access: DeniedAccess::ReadWrite,
        }],
        temporary_parent: temporary,
        termination: Termination::ProcessGroup,
        disk_read: true,
        listen_port: None,
    };
    let decisions = Arc::new(Mutex::new(Vec::new()));
    let approve = {
        let decisions = decisions.clone();
        Arc::new(
            move |destination: CommandNetworkDestination| -> BoxFuture<'static, bool> {
                let allowed = destination.port == 443
                    && (destination.host == INDEX
                        || (destination.host == ARTIFACTS && allow_artifact));
                decisions.lock().unwrap().push(destination);
                async move { allowed }.boxed()
            },
        )
    };
    let proxy = ManagedCommandProxy::bind(&state, approve).unwrap();
    let stop = CancellationToken::new();
    let running = sandbox()
        .prepare(installer.process(&workspace, &certificate), scope)
        .unwrap()
        .spawn_with_http_proxy(proxy.endpoint(), stop.clone())
        .unwrap();
    let dials = Arc::new(Mutex::new(Vec::new()));
    let connected = dials.clone();
    let origin = registry.address;
    let serve = proxy.serve_with(
        stop,
        |name, port| {
            Box::pin(async move {
                assert_eq!(port, 443);
                let address = match name.trim_end_matches('.') {
                    INDEX => INDEX_ADDRESS,
                    ARTIFACTS => ARTIFACT_ADDRESS,
                    other => panic!("unexpected registry name {other}"),
                };
                Ok(vec![SocketAddr::from((address, port))])
            })
        },
        move |address| {
            connected.lock().unwrap().push(address);
            // Only DNS and the final dial are substituted. Every connection
            // goes through the native sandbox and authenticated proxy.
            Box::pin(TcpStream::connect(origin))
        },
    );
    let result = tokio::time::timeout(Duration::from_secs(35), async {
        tokio::select! {
            result = running.finish() => result.unwrap(),
            result = serve => panic!("broker stopped while the installer was running: {result:?}"),
        }
    })
    .await
    .expect("package installer did not finish");

    let stderr = String::from_utf8_lossy(&result.stderr);
    let decisions = decisions.lock().unwrap();
    let hosts: Vec<_> = decisions
        .iter()
        .map(|decision| decision.host.as_str())
        .collect();
    let dials = dials.lock().unwrap();
    match (installer, allow_artifact) {
        (Installer::Npm, _) => {
            assert_eq!(result.completion, Completion::Exited(0), "{stderr}");
            assert_eq!(hosts, [INDEX]);
            assert!(
                dials.len() >= 2,
                "manifest and archive must use separate tunnels"
            );
            let payload = workspace.join("node_modules/grida-proxy-package/payload.bin");
            assert_eq!(fs::metadata(payload).unwrap().len(), 9 * 1024 * 1024);
        }
        (Installer::Uv, true) => {
            assert_eq!(result.completion, Completion::Exited(0), "{stderr}");
            assert_eq!(hosts, [INDEX, ARTIFACTS]);
            assert_eq!(
                fs::read(workspace.join("installed/grida_proxy_wheel.py")).unwrap(),
                b"value = 1\n"
            );
        }
        (Installer::Uv, false) => {
            assert!(
                matches!(result.completion, Completion::Exited(code) if code != 0),
                "{stderr}"
            );
            assert_eq!(hosts, [INDEX, ARTIFACTS]);
            assert!(!dials.is_empty());
            assert!(dials.iter().all(|address| address.ip() == INDEX_ADDRESS));
            assert!(!workspace.join("installed/grida_proxy_wheel.py").exists());
        }
    }
}

#[tokio::test]
#[ignore = "requires the native sandbox helper, npm, Python and OpenSSL"]
async fn confined_package_clients_install_npm_with_reused_approval_and_large_archive() {
    install(&Registry::start().await, Installer::Npm, true).await;
}

#[tokio::test]
#[ignore = "requires the native sandbox helper, uv, Python and OpenSSL"]
async fn confined_package_clients_install_uv_only_with_artifact_host_approval() {
    let registry = Registry::start().await;
    install(&registry, Installer::Uv, true).await;
    install(&registry, Installer::Uv, false).await;
}
