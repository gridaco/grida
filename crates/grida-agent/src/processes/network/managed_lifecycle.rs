use super::{CommandNetworkDestination, HttpProxy, ManagedCommandProxy};
use agent_kit_core::{BoxFuture, CancellationToken};
use base64::{Engine, engine::general_purpose::STANDARD};
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[tokio::test]
#[ignore = "requires a loopback listener"]
async fn managed_proxy_closes_active_tunnels_on_command_cancellation() {
    let state = tempfile::tempdir().unwrap();
    let origin = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let origin_address = origin.local_addr().unwrap();
    let stop = CancellationToken::new();
    let approvals = Arc::new(AtomicUsize::new(0));
    let observed = approvals.clone();
    let approve = Arc::new(
        move |destination: CommandNetworkDestination| -> BoxFuture<'static, bool> {
            observed.fetch_add(1, Ordering::Relaxed);
            Box::pin(async move {
                destination.host == "registry.example.test" && destination.port == 443
            })
        },
    );
    let proxy = ManagedCommandProxy::bind(state.path(), approve).unwrap();
    #[cfg(target_os = "macos")]
    let HttpProxy::Loopback { port, password } = proxy.endpoint();
    #[cfg(target_os = "macos")]
    let ingress = SocketAddr::from((Ipv4Addr::LOCALHOST, *port));
    #[cfg(target_os = "linux")]
    let HttpProxy::Unix { socket, password } = proxy.endpoint();
    #[cfg(target_os = "linux")]
    let ingress = socket.clone();
    let credential = STANDARD.encode(format!("grida:{password}"));
    let request = format!(
        "CONNECT registry.example.test:443 HTTP/1.1\r\nHost: registry.example.test:443\r\nProxy-Authorization: Basic {credential}\r\n\r\n"
    );
    let connect = || async {
        #[cfg(target_os = "macos")]
        let mut client = TcpStream::connect(ingress).await.unwrap();
        #[cfg(target_os = "linux")]
        let mut client = tokio::net::UnixStream::connect(&ingress).await.unwrap();
        client.write_all(request.as_bytes()).await.unwrap();
        client
    };

    let (resolving, pending_resolution) = tokio::sync::oneshot::channel();
    let (resolver_alive, mut resolver_gone) = tokio::sync::oneshot::channel::<()>();
    let held_lookup = std::sync::Mutex::new(Some((resolving, resolver_alive)));
    let resolutions = AtomicUsize::new(0);
    let dials = Arc::new(AtomicUsize::new(0));
    let captured_dials = dials.clone();
    let serve = tokio::spawn(proxy.serve_with(
        stop.clone(),
        move |_, port| {
            let count = resolutions.fetch_add(1, Ordering::Relaxed);
            if count < 2 {
                return Box::pin(async move { Ok(vec![SocketAddr::from(([1, 1, 1, 1], port))]) });
            }
            let (resolving, resolver_alive) = held_lookup.lock().unwrap().take().unwrap();
            Box::pin(async move {
                resolving.send(()).unwrap();
                let _resolver = resolver_alive;
                std::future::pending().await
            })
        },
        move |_| {
            captured_dials.fetch_add(1, Ordering::Relaxed);
            Box::pin(TcpStream::connect(origin_address))
        },
    ));

    tokio::time::timeout(Duration::from_secs(10), async {
        let mut tunnels = Vec::new();
        for _ in 0..2 {
            let mut client = connect().await;
            let (mut remote, _) = origin.accept().await.unwrap();
            const GRANTED: &[u8] = b"HTTP/1.1 200 Connection Established\r\n\r\n";
            let mut response = [0; GRANTED.len()];
            client.read_exact(&mut response).await.unwrap();
            assert_eq!(&response, GRANTED);
            remote.write_all(b"fixture").await.unwrap();
            let mut payload = [0; 7];
            client.read_exact(&mut payload).await.unwrap();
            assert_eq!(&payload, b"fixture");
            tunnels.push((client, remote));
        }
        let mut pending_client = connect().await;
        pending_resolution.await.unwrap();
        assert_eq!(approvals.load(Ordering::Relaxed), 1);

        stop.cancel();
        serve.await.unwrap().unwrap();
        assert_eq!(
            resolver_gone.try_recv(),
            Err(tokio::sync::oneshot::error::TryRecvError::Closed)
        );
        assert_eq!(dials.load(Ordering::Relaxed), 2);
        assert_eq!(pending_client.read(&mut [0]).await.unwrap(), 0);
        for (mut client, mut remote) in tunnels {
            assert_eq!(client.read(&mut [0]).await.unwrap(), 0);
            assert_eq!(remote.read(&mut [0]).await.unwrap(), 0);
        }
    })
    .await
    .expect("active tunnels did not close after cancellation");
}
