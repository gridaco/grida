//! GRIDA-SEC-004 — a finite confined command can request one TCP destination.

use agent_kit_core::{Error, ErrorKind, Result};
use serde::{Deserialize, Serialize};

/// TCP endpoint whose name and port appear in the durable approval.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandNetworkDestination {
    pub host: String,
    pub port: u16,
}

impl CommandNetworkDestination {
    pub(super) fn validate(&self) -> Result<()> {
        // A canonical DNS name makes the grant, display and SOCKS request agree.
        if self.port == 0
            || self.host.len() > 253
            || !self.host.contains('.')
            || !self
                .host
                .rsplit('.')
                .next()
                .is_some_and(|label| label.bytes().all(|b| b.is_ascii_lowercase()))
            || self.host.split('.').any(|label| {
                label.is_empty()
                    || label.len() > 63
                    || label.starts_with('-')
                    || label.ends_with('-')
                    || !label
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            })
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "command_network_destination_invalid",
            ));
        }
        Ok(())
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(crate) use native::*;

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(super) mod managed;

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod native {
    use super::*;
    use crate::processes::FiniteEvidence;
    use agent_kit_core::CancellationToken;
    use agent_kit_sandbox::{PreparedProcess, RunningProcess};
    use std::io;
    use std::net::{Ipv4Addr, SocketAddr};
    use std::os::unix::fs::{PermissionsExt, symlink};
    use std::path::{Path, PathBuf};
    use subtle::ConstantTimeEq;
    use tempfile::TempDir;
    use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
    use tokio::net::{TcpStream, UnixListener, UnixStream};
    use uuid::Uuid;

    const STREAM_LIMIT: u64 = 8 * 1024 * 1024;

    pub(crate) struct CommandMediator {
        destination: CommandNetworkDestination,
        deadline: std::time::Instant,
        socket: PathBuf,
        protected_socket: PathBuf,
        listener: UnixListener,
        secret: String,
        _state: TempDir,
        _alias: TempDir,
    }

    impl CommandMediator {
        pub(crate) fn bind(
            root: &Path,
            destination: CommandNetworkDestination,
            deadline: std::time::Instant,
        ) -> Result<Box<Self>> {
            destination.validate()?;
            let error = |_| {
                Error::new(
                    ErrorKind::Unavailable,
                    "command_network_mediator_unavailable",
                )
            };
            let mut private = tempfile::Builder::new();
            private.permissions(std::fs::Permissions::from_mode(0o700));
            let state = private.tempdir_in(root).map_err(error)?;
            let canonical = state.path().canonicalize().map_err(error)?;
            // sockaddr_un has a short path limit. The socket inode stays under
            // protected agent state, including for long or non-ASCII state paths.
            let alias = private
                .tempdir_in(std::fs::canonicalize("/tmp").map_err(error)?)
                .map_err(error)?;
            symlink(&canonical, alias.path().join("broker")).map_err(error)?;
            let socket = alias.path().join("broker/s");
            let listener = UnixListener::bind(&socket).map_err(error)?;
            if socket.canonicalize().map_err(error)? != canonical.join("s") {
                return Err(error(io::ErrorKind::PermissionDenied.into()));
            }
            Ok(Box::new(Self {
                destination,
                deadline,
                socket,
                protected_socket: canonical.join("s"),
                listener,
                secret: Uuid::new_v4().simple().to_string(),
                _state: state,
                _alias: alias,
            }))
        }

        pub(crate) fn destination(&self) -> &CommandNetworkDestination {
            &self.destination
        }

        pub(crate) fn spawn(
            self: Box<Self>,
            launch: PreparedProcess,
            stop: CancellationToken,
        ) -> Result<NetworkCommand> {
            let running = launch.spawn_with_socks_proxy(
                &self.socket,
                &self.protected_socket,
                &self.secret,
                stop.clone(),
            )?;
            Ok(NetworkCommand {
                running,
                mediator: self,
                stop,
            })
        }

        async fn serve<A: Iterator<Item = SocketAddr>>(
            self,
            resolve: impl AsyncFnOnce(String, u16) -> io::Result<A>,
            connect: impl AsyncFnOnce(SocketAddr) -> io::Result<TcpStream>,
        ) -> io::Result<()> {
            // One authenticated CONNECT, no BIND, UDP, forwarding to a
            // second host, or reuse after the approved command has finished.
            let (mut client, _) = self.listener.accept().await?;
            self.authorize(&mut client).await?;
            // Resolve once, after authorization. Dial the checked address
            // directly; neither the client nor a subsequent lookup selects it.
            let dns = format!("{}.", self.destination.host);
            let address = resolve(dns, self.destination.port)
                .await?
                .find(|addr| matches!(addr, SocketAddr::V4(v4) if public_address(*v4.ip())))
                .ok_or_else(denied)?;
            Self::relay(client, connect(address).await?).await
        }

        async fn authorize(&self, client: &mut UnixStream) -> io::Result<()> {
            if client.read_u8().await? != 5 {
                return Err(denied());
            }
            let methods = field(client).await?;
            if !methods.contains(&2) {
                client.write_all(&[5, 255]).await?;
                return Err(denied());
            }
            client.write_all(&[5, 2]).await?;
            if client.read_u8().await? != 1
                || field(client).await? != b"grida"
                || !bool::from(self.secret.as_bytes().ct_eq(&field(client).await?))
            {
                client.write_all(&[1, 1]).await?;
                return Err(denied());
            }
            client.write_all(&[1, 0]).await?;
            let mut request = [0; 4];
            client.read_exact(&mut request).await?;
            if request != [5, 1, 0, 3]
                || field(client).await? != self.destination.host.as_bytes()
                || client.read_u16().await? != self.destination.port
            {
                client.write_all(&[5, 2, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
                return Err(denied());
            }
            Ok(())
        }

        async fn relay(mut client: UnixStream, remote: TcpStream) -> io::Result<()> {
            client.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
            let (client_read, client_write) = client.into_split();
            let (remote_read, remote_write) = remote.into_split();
            tokio::try_join!(
                copy_bounded(client_read, remote_write, STREAM_LIMIT),
                copy_bounded(remote_read, client_write, STREAM_LIMIT),
            )?;
            Ok(())
        }
    }

    pub(crate) struct NetworkCommand {
        running: RunningProcess,
        mediator: Box<CommandMediator>,
        stop: CancellationToken,
    }

    impl NetworkCommand {
        pub(crate) async fn finish(self) -> Result<FiniteEvidence> {
            self.finish_with(
                async |name, port| tokio::net::lookup_host((name, port)).await,
                async |address| TcpStream::connect(address).await,
            )
            .await
        }

        async fn finish_with<A: Iterator<Item = SocketAddr>>(
            self,
            resolve: impl AsyncFnOnce(String, u16) -> io::Result<A>,
            connect: impl AsyncFnOnce(SocketAddr) -> io::Result<TcpStream>,
        ) -> Result<FiniteEvidence> {
            // Close live streams at the grant deadline, including while the
            // process supervisor is still collecting cleanup evidence.
            let deadline = self.mediator.deadline.into();
            let evidence = self.running.finish();
            tokio::pin!(evidence);
            // Check the broker first when both sides end together so a process that
            // accepts a truncated stream as EOF cannot hide the transfer error.
            let transfer_limit_exceeded = tokio::select! {
                biased;
                result = tokio::time::timeout_at(deadline, self.mediator.serve(resolve, connect)) => {
                    matches!(result, Ok(Err(error)) if error.kind() == io::ErrorKind::FileTooLarge)
                }
                _ = self.stop.cancelled() => false,
                process = &mut evidence => return Ok(FiniteEvidence {
                    process: process?, transfer_limit_exceeded: false,
                }),
            };
            Ok(FiniteEvidence {
                process: evidence.await?,
                transfer_limit_exceeded,
            })
        }
    }

    async fn copy_bounded(
        reader: impl AsyncRead + Unpin,
        mut writer: impl AsyncWrite + Unpin,
        limit: u64,
    ) -> io::Result<()> {
        let mut allowed = reader.take(limit);
        tokio::io::copy(&mut allowed, &mut writer).await?;
        if allowed.limit() == 0 && allowed.into_inner().read(&mut [0]).await? > 0 {
            return Err(io::ErrorKind::FileTooLarge.into());
        }
        writer.shutdown().await
    }

    fn denied() -> io::Error {
        io::ErrorKind::PermissionDenied.into()
    }

    async fn field(client: &mut UnixStream) -> io::Result<Vec<u8>> {
        let mut bytes = vec![0; usize::from(client.read_u8().await?)];
        client.read_exact(&mut bytes).await?;
        Ok(bytes)
    }

    // Keep routing local, private, carrier, special-purpose, documentation,
    // benchmarking, multicast and reserved address space out of this grant.
    pub(super) fn public_address(ip: Ipv4Addr) -> bool {
        !matches!(
            ip.octets(),
            [0 | 10 | 127 | 224..=255, ..]
                | [100, 64..=127, ..]
                | [169, 254, ..]
                | [172, 16..=31, ..]
                | [192, 0, 0 | 2, _]
                | [192, 88, 99, _]
                | [192, 168, ..]
                | [198, 18 | 19, ..]
                | [198, 51, 100, _]
                | [203, 0, 113, _]
        )
    }
    #[cfg(test)]
    mod tests {
        use super::*;

        #[tokio::test]
        async fn bounded_relay_distinguishes_exact_eof_from_excess_bytes() {
            for (data, exceeded) in [
                (&b"abc"[..], false),
                (&b"abcd"[..], false),
                (&b"abcde"[..], true),
            ] {
                let mut copied = Vec::new();
                let result = copy_bounded(data, &mut copied, 4).await;
                assert_eq!(
                    result.err().map(|error| error.kind()),
                    exceeded.then_some(io::ErrorKind::FileTooLarge)
                );
                assert_eq!(copied, &data[..data.len().min(4)]);
            }
        }

        #[tokio::test]
        #[ignore = "requires the installed native sandbox helper"]
        async fn confined_command_transfers_through_its_approved_broker() {
            use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
            use agent_kit_core::messages::OutcomeStatus;
            use agent_kit_core::{BindingId, GrantId, PrincipalId, ScopeId};
            use agent_kit_sandbox::{
                Completion, DeniedAccess, ExecutionScope, Installation, ProcessSpec, ProtectedPath,
                Sandbox, Termination, TrustedExecutable,
            };
            use sha2::{Digest, Sha256};
            use std::os::unix::fs::DirBuilderExt;
            use std::time::{Duration, Instant};
            use tokio::io::{AsyncBufReadExt, BufReader};

            let trusted = |key| {
                let path = std::fs::canonicalize(std::env::var_os(key).expect(key)).unwrap();
                TrustedExecutable {
                    sha256: Sha256::digest(std::fs::read(&path).unwrap()).into(),
                    path,
                }
            };
            #[cfg(target_os = "macos")]
            let bubblewrap = None;
            #[cfg(target_os = "linux")]
            let bubblewrap = Some(trusted("AGENT_KIT_TEST_BWRAP"));
            let sandbox = Sandbox::new(Installation {
                helper: trusted("GRIDA_AGENT_TEST_SANDBOX_HELPER"),
                bubblewrap,
            })
            .unwrap();
            let base = tempfile::tempdir().unwrap();
            let root = base.path().canonicalize().unwrap();
            let workspace = root.join("workspace");
            let state = root.join("state");
            let temporary = root.join("temporary");
            for path in [&workspace, &state, &temporary] {
                std::fs::DirBuilder::new().mode(0o700).create(path).unwrap();
            }
            let scope = ExecutionScope {
                grants: GrantSelection {
                    authority: AuthorityBinding {
                        principal: PrincipalId::new("fixture-user").unwrap(),
                        binding: BindingId::new("host").unwrap(),
                        scope: ScopeId::new("project").unwrap(),
                    },
                    grants: vec![GrantId::new("finite-command").unwrap()],
                },
                revision: BindingId::new("fixture").unwrap(),
                valid_until: Instant::now() + Duration::from_secs(60),
                read: vec![workspace.clone()],
                write: vec![workspace.clone()],
                runtime: [
                    "/bin",
                    "/usr/bin",
                    "/lib",
                    "/lib64",
                    "/usr/lib",
                    "/usr/lib64",
                    "/System/Library",
                ]
                .into_iter()
                .map(PathBuf::from)
                .filter(|p| p.is_dir())
                .collect(),
                protected: vec![ProtectedPath {
                    path: state.clone(),
                    access: DeniedAccess::ReadWrite,
                }],
                temporary_parent: temporary,
                termination: Termination::ProcessGroup,
                disk_read: true,
                listen_port: None,
            };
            for exceeded in [false, true] {
                let destination = CommandNetworkDestination {
                    host: "feed.example".into(),
                    port: 80,
                };
                let mediator =
                    CommandMediator::bind(&state, destination, scope.valid_until).unwrap();
                let prepared = sandbox
                    .prepare(
                        ProcessSpec {
                            executable: "/usr/bin/curl".into(),
                            arguments: [
                                "--silent",
                                "--show-error",
                                "--max-time",
                                "10",
                                "--output",
                                "response",
                                "http://feed.example/manifest",
                            ]
                            .map(String::from)
                            .to_vec(),
                            cwd: workspace.clone(),
                            environment: Default::default(),
                            stdin: Vec::new(),
                            timeout: Duration::from_secs(15),
                            max_output_bytes: 4096,
                        },
                        scope.clone(),
                    )
                    .unwrap();
                let command = mediator.spawn(prepared, CancellationToken::new()).unwrap();
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                let origin = listener.local_addr().unwrap();
                let public: SocketAddr = "1.1.1.1:80".parse().unwrap();
                // Only name resolution and the final dial are fixtures. The
                // real broker selects the public address and checks the SOCKS
                // request sent by curl inside the native sandbox.
                let run = command.finish_with(
                    async |name, port| {
                        assert_eq!((name.as_str(), port), ("feed.example.", 80));
                        Ok([origin, public].into_iter())
                    },
                    async |address| {
                        assert_eq!(address, public);
                        TcpStream::connect(origin).await
                    },
                );
                let server = async {
                    let (stream, _) = listener.accept().await.unwrap();
                    let mut reader = BufReader::new(stream);
                    let mut line = String::new();
                    reader.read_line(&mut line).await.unwrap();
                    assert!(line.starts_with("GET /manifest HTTP/"));
                    while line != "\r\n" {
                        line.clear();
                        assert!(reader.read_line(&mut line).await.unwrap() > 0);
                    }
                    let mut stream = reader.into_inner();
                    let header = b"HTTP/1.0 200 OK\r\nConnection: close\r\n\r\n";
                    stream.write_all(header).await.unwrap();
                    if exceeded {
                        stream
                            .write_all(&vec![b'x'; STREAM_LIMIT as usize + 1 - header.len()])
                            .await
                            .unwrap();
                    } else {
                        stream.write_all(b"fixture response").await.unwrap();
                    }
                };
                let (result, ()) = tokio::time::timeout(Duration::from_secs(20), async {
                    tokio::join!(run, server)
                })
                .await
                .unwrap();
                let finite = result.unwrap();
                let ending = finite.ending();
                assert_eq!(
                    finite.process.completion,
                    Completion::Exited(0),
                    "{}",
                    String::from_utf8_lossy(&finite.process.stderr)
                );
                assert!(ending.verified);
                if exceeded {
                    assert_eq!(ending.status, OutcomeStatus::Failed);
                    assert_eq!(
                        ending.details["network_error"],
                        "command_network_transfer_limit"
                    );
                } else {
                    assert_eq!(ending.status, OutcomeStatus::Succeeded);
                    assert_eq!(
                        std::fs::read(workspace.join("response")).unwrap(),
                        b"fixture response"
                    );
                }
            }
        }

        #[test]
        fn permits_only_canonical_named_ports_and_public_ipv4_addresses() {
            for host in [
                "localhost",
                "127.0.0.1",
                "::1",
                "127.100",
                "Mixed.example",
                "a.example.",
                "-x.example",
                "a..example",
                "a.example/path",
            ] {
                assert!(
                    CommandNetworkDestination {
                        host: host.into(),
                        port: 443
                    }
                    .validate()
                    .is_err()
                );
            }
            let destination = CommandNetworkDestination {
                host: "cdn.example".into(),
                port: 443,
            };
            assert!(destination.validate().is_ok());
            assert!(
                CommandNetworkDestination {
                    port: 0,
                    ..destination
                }
                .validate()
                .is_err()
            );
            for addr in [
                "0.0.0.0",
                "10.1.2.3",
                "100.64.0.1",
                "127.0.0.1",
                "169.254.169.254",
                "172.16.0.1",
                "192.168.1.2",
                "192.0.2.1",
                "198.18.0.1",
                "203.0.113.2",
                "224.0.0.1",
                "255.255.255.255",
            ] {
                assert!(!public_address(addr.parse().unwrap()), "{addr}");
            }
            assert!(public_address("1.1.1.1".parse().unwrap()));
        }

        #[tokio::test]
        async fn broker_checks_credentials_destination_and_port_before_forwarding() {
            let home = tempfile::tempdir().unwrap();
            let destination = CommandNetworkDestination {
                host: "cdn.example".into(),
                port: 443,
            };
            let mediator = CommandMediator::bind(
                home.path(),
                destination,
                std::time::Instant::now() + std::time::Duration::from_secs(30),
            )
            .unwrap();
            for (secret, host, port, allowed) in [
                ("different", "cdn.example", 443, false),
                (mediator.secret.as_str(), "different.example", 443, false),
                (mediator.secret.as_str(), "cdn.example", 80, false),
                (mediator.secret.as_str(), "cdn.example", 443, true),
            ] {
                let (mut server, mut client) = UnixStream::pair().unwrap();
                let local = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                let address = local.local_addr().unwrap();
                let handshake = async {
                    client.write_all(&[5, 1, 2]).await.unwrap();
                    assert_eq!(client.read_u16().await.unwrap(), 0x0502);
                    client.write_all(b"\x01\x05grida").await.unwrap();
                    client.write_u8(secret.len() as u8).await.unwrap();
                    client.write_all(secret.as_bytes()).await.unwrap();
                    if client.read_u16().await.unwrap() != 0x0100 {
                        return false;
                    }
                    client
                        .write_all(&[5, 1, 0, 3, host.len() as u8])
                        .await
                        .unwrap();
                    client.write_all(host.as_bytes()).await.unwrap();
                    client.write_u16(port).await.unwrap();
                    let mut status = [0u8; 10];
                    client.read_exact(&mut status).await.unwrap();
                    if status[1] != 0 {
                        return false;
                    }
                    client.write_all(b"ping").await.unwrap();
                    client.shutdown().await.unwrap();
                    let mut data = Vec::new();
                    client.read_to_end(&mut data).await.unwrap();
                    assert_eq!(data, b"pong");
                    true
                };
                let broker = async {
                    let ok = mediator.authorize(&mut server).await.is_ok();
                    if ok {
                        let echo = async {
                            let (mut peer, _) = local.accept().await.unwrap();
                            let mut data = Vec::new();
                            peer.read_to_end(&mut data).await.unwrap();
                            assert_eq!(data, b"ping");
                            peer.write_all(b"pong").await.unwrap();
                        };
                        let remote = TcpStream::connect(address).await.unwrap();
                        let (relayed, ()) =
                            tokio::join!(CommandMediator::relay(server, remote), echo);
                        relayed.unwrap();
                    }
                    ok
                };
                let result = tokio::join!(handshake, broker);
                assert_eq!(result, (allowed, allowed));
            }
        }
    }
}
