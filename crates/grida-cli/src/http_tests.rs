// GRIDA-SEC-006 / GRIDA-SEC-010 / GRIDA-SEC-013 — synthetic owned egress fixtures.
// GRIDA-GG: provider — explicit native authority, no account/provider crossover.
use super::*;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tokio_rustls::{
    TlsAcceptor,
    rustls::{RootCertStore, ServerConfig, pki_types::PrivatePkcs8KeyDer},
};

const FIXTURE_WAIT: Duration = Duration::from_secs(3);

fn provider_request() -> Request {
    let mut request = Request::new(
        Method::POST,
        "https://ai-gateway.vercel.sh/v3/ai/image-model",
        "{}",
    );
    request.headers.insert(
        "authorization",
        HeaderValue::from_static("Bearer synthetic-test-key"),
    );
    request
        .headers
        .insert("content-type", HeaderValue::from_static("application/json"));
    request
}

async fn fixture() -> (Transport, TcpListener, TlsAcceptor) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let cert = rcgen::generate_simple_self_signed(vec![
        "ai-gateway.vercel.sh".to_owned(),
        "cdn.example".to_owned(),
        "mozagqllybnbytfcmvdh.supabase.co".to_owned(),
        "grida.co".to_owned(),
    ])
    .unwrap();
    let mut roots = RootCertStore::empty();
    roots.add(cert.cert.der().clone()).unwrap();
    let mut transport = Transport::new(None).unwrap();
    transport.fixture = Some(listener.local_addr().unwrap());
    transport.tls = Arc::new(
        rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    );
    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(
            vec![cert.cert.der().clone()],
            PrivatePkcs8KeyDer::from(cert.signing_key.serialize_der()).into(),
        )
        .unwrap();
    (transport, listener, TlsAcceptor::from(Arc::new(config)))
}

async fn received<S: AsyncRead + Unpin>(stream: &mut S) -> Vec<u8> {
    timeout(FIXTURE_WAIT, async {
        let mut result = Vec::new();
        loop {
            result.push(stream.read_u8().await.unwrap());
            if result.ends_with(b"\r\n\r\n") {
                break;
            }
            assert!(result.len() < wire::HEAD_LIMIT);
        }
        let text = String::from_utf8(result.clone())
            .unwrap()
            .to_ascii_lowercase();
        let length = text
            .lines()
            .find_map(|line| line.strip_prefix("content-length: "))
            .map(|n| n.parse::<usize>().unwrap())
            .unwrap_or(0);
        assert!(length < 8192);
        let mut body = vec![0; length];
        stream.read_exact(&mut body).await.unwrap();
        result.extend_from_slice(&body);
        result
    })
    .await
    .unwrap()
}

#[test]
fn route_and_header_authority_do_not_cross_lanes() {
    let transport = Transport::new(Some(API)).unwrap();
    let allowed = [
        (Method::POST, "https://openrouter.ai/api/v1/images"),
        (
            Method::GET,
            "https://openrouter.ai/api/v1/videos/task/content",
        ),
        (Method::GET, "https://jobs.openrouter.ai/task"),
        (Method::GET, "https://ai-gateway.vercel.sh/v1/credits"),
        (
            Method::GET,
            "https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fflux%2Fdev",
        ),
        (Method::POST, "https://queue.fal.run/fal-ai/flux/dev"),
        (
            Method::POST,
            "https://api.elevenlabs.io/v1/text-to-speech/voice",
        ),
        (
            Method::POST,
            "https://openapi.tripo3d.ai/v3/generation/text-to-model",
        ),
        (Method::GET, "https://openapi.tripo3d.ai/v3/tasks/task_01-1"),
        (
            Method::PUT,
            "https://tripo-data.s3.us-west-2.amazonaws.com/object?signature=synthetic",
        ),
        (Method::POST, "https://grida.co/api/v1/ai/3d/rigging"),
    ];
    for (method, url) in allowed {
        assert!(
            transport
                .admit(Lane::Provider, &admitted_url(url).unwrap(), &method)
                .is_ok(),
            "{url}"
        );
    }
    for (method, url) in [
        (Method::GET, "https://openrouter.ai/api/v1/key?extra=1"),
        (
            Method::POST,
            "https://openrouter.ai/api/v1/chat/completions",
        ),
        (
            Method::GET,
            "https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/dev&extra=1",
        ),
        (Method::GET, "https://ai-gateway.vercel.sh:444/v1/credits"),
        (
            Method::POST,
            "https://grida.co/api/v1/ai/3d/rigging?extra=1",
        ),
        (
            Method::GET,
            "https://openapi.tripo3d.ai/v3/tasks/task?extra=1",
        ),
        (
            Method::POST,
            "https://api.elevenlabs.io/v1/text-to-speech/voice/stream",
        ),
        (
            Method::POST,
            "http://127.0.0.1:3041/api/v1/ai/images/generations",
        ),
    ] {
        assert!(
            transport
                .admit(Lane::Provider, &admitted_url(url).unwrap(), &method)
                .is_err(),
            "{url}"
        );
    }
    for bad in [
        "https://user:secret@openrouter.ai/api/v1/images",
        "https://openrouter.ai./api/v1/images",
        "https://openrouter.ai/api/v1/images#fragment",
        " https://openrouter.ai/api/v1/images",
        "https://openrouter.ai/\npath",
    ] {
        assert!(admitted_url(bad).is_err());
    }
    let mut request = provider_request();
    let target = admitted_url(&request.url).unwrap();
    request
        .headers
        .insert("cookie", HeaderValue::from_static("secret"));
    assert!(snapshot(Route::Vercel, &target, &mut request).is_err());
    let mut request = provider_request();
    assert!(snapshot(Route::Download, &target, &mut request).is_err());
    assert!(snapshot(Route::Upload, &target, &mut request).is_err());
    let mut request = provider_request();
    request
        .headers
        .insert("host", HeaderValue::from_static("evil.example"));
    assert!(snapshot(Route::Vercel, &target, &mut request).is_err());
}

#[test]
fn account_capability_has_exact_registration_routes_and_lower_limits() {
    let transport = Transport::account(ISSUER, API).unwrap();
    for (method, url) in [
        (Method::POST, format!("{ISSUER}/oauth/token")),
        (Method::POST, format!("{ISSUER}/logout?scope=local")),
        (
            Method::GET,
            format!("{API}/api/v1/account/organizations?after=123"),
        ),
        (
            Method::GET,
            format!("{API}/api/v1/account/credits?organization_id=3"),
        ),
        (Method::POST, format!("{API}/api/v1/auth/gg")),
    ] {
        assert!(
            transport
                .admit(Lane::Account, &admitted_url(&url).unwrap(), &method)
                .is_ok()
        );
    }
    for url in [
        format!("{ISSUER}/logout?scope=global"),
        format!("{API}/api/v1/account/organizations?after=01"),
        format!("{API}/api/v1/account/credits?organization_id=1&extra=1"),
        "https://attacker.example/api/v1/auth/me".to_owned(),
    ] {
        assert!(
            transport
                .admit(Lane::Account, &admitted_url(&url).unwrap(), &Method::GET)
                .is_err()
        );
    }
    assert!(
        Transport::new(None)
            .unwrap()
            .admit(
                Lane::Account,
                &admitted_url(&format!("{API}/api/v1/auth/me")).unwrap(),
                &Method::GET
            )
            .is_err()
    );
    assert!(Transport::account(LOCAL_ISSUER, LOCAL_GG).is_ok());
    assert!(Transport::account("http://127.0.0.1:1234/auth/v1", LOCAL_GG).is_err());
    assert!(Transport::account(ISSUER, LOCAL_GG).is_err());
    let mut request = Request::new(
        Method::POST,
        format!("{ISSUER}/oauth/token"),
        vec![0; ACCOUNT_LIMIT + 1],
    );
    request.headers.insert(
        "content-type",
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    assert!(
        snapshot(
            Route::Token,
            &admitted_url(&request.url).unwrap(),
            &mut request
        )
        .is_err()
    );
}

#[test]
fn all_dns_answers_must_be_public_before_one_is_selected() {
    let public: SocketAddr = "1.1.1.1:443".parse().unwrap();
    assert_eq!(select_public(&[public]).unwrap(), public);
    assert!(select_public(&[]).is_err());
    assert!(select_public(&vec![public; 33]).is_err());
    for address in [
        "127.0.0.1",
        "10.0.0.1",
        "100.64.0.1",
        "169.254.169.254",
        "192.0.2.1",
        "198.18.0.1",
        "224.0.0.1",
        "::1",
        "::ffff:1.1.1.1",
        "2001:db8::1",
        "2002::1",
        "3fff::1",
    ] {
        assert!(
            select_public(&[public, SocketAddr::new(address.parse().unwrap(), 443)]).is_err(),
            "{address}"
        );
    }
    assert!(public_address("2606:4700:4700::1111".parse().unwrap()));
}

#[test]
fn dns64_destinations_require_a_public_embedded_ipv4_address() {
    let translated: SocketAddr = "[64:ff9b::6812:260a]:443".parse().unwrap();
    let ipv4: SocketAddr = "104.18.38.10:443".parse().unwrap();
    assert_eq!(select_public(&[translated, ipv4]).unwrap(), translated);
    assert_eq!(select_public(&[translated]).unwrap(), translated);
    for address in [
        "0.0.0.0",
        "10.0.0.1",
        "100.64.0.1",
        "127.0.0.1",
        "169.254.169.254",
        "172.16.0.1",
        "192.0.0.1",
        "192.0.2.1",
        "192.88.99.1",
        "192.168.0.1",
        "198.18.0.1",
        "198.51.100.1",
        "203.0.113.1",
        "224.0.0.1",
        "255.255.255.255",
    ] {
        let translated_private = format!("64:ff9b::{address}").parse().unwrap();
        assert!(!public_address(translated_private), "{address}");
        assert!(select_public(&[ipv4, SocketAddr::new(translated_private, 443)]).is_err());
    }
    for address in ["64:ff9b:1::101:101", "64:ff9b::1:101:101", "::ffff:1.1.1.1"] {
        assert!(!public_address(address.parse().unwrap()), "{address}");
    }
}

#[test]
fn header_bounds_and_upload_body_kinds_are_checked_before_connecting() {
    let mut request = provider_request();
    let target = admitted_url(&request.url).unwrap();
    request
        .headers
        .insert("accept", HeaderValue::from_str(&"x".repeat(8193)).unwrap());
    assert!(snapshot(Route::Vercel, &target, &mut request).is_err());
    let mut request = provider_request();
    request.headers.insert(
        "accept",
        HeaderValue::from_bytes(b"text/plain\tsecret").unwrap(),
    );
    assert!(snapshot(Route::Vercel, &target, &mut request).is_err());
    let mut request = provider_request();
    request.headers.append(
        "authorization",
        HeaderValue::from_static("Bearer second-key"),
    );
    assert!(snapshot(Route::Vercel, &target, &mut request).is_err());
    let mut request = Request::new(
        Method::PUT,
        "https://tripo-data.s3.us-west-2.amazonaws.com/object?signature=test",
        Bytes::from_static(b"mesh"),
    );
    request.headers.insert(
        "content-type",
        HeaderValue::from_static("application/octet-stream"),
    );
    let target = admitted_url(&request.url).unwrap();
    assert!(snapshot(Route::Upload, &target, &mut request).is_ok());
    request.headers.remove("accept-encoding");
    request.headers.insert(
        "authorization",
        HeaderValue::from_static("Bearer synthetic"),
    );
    assert!(snapshot(Route::Upload, &target, &mut request).is_err());
    let mut request = Request::new(
        Method::POST,
        "https://openapi.tripo3d.ai/v3/files",
        Bytes::from_static(b"--boundary--\r\n"),
    );
    request.headers.insert(
        "authorization",
        HeaderValue::from_static("Bearer synthetic"),
    );
    request.headers.insert(
        "content-type",
        HeaderValue::from_static("multipart/form-data; boundary=boundary"),
    );
    let target = admitted_url(&request.url).unwrap();
    assert!(snapshot(Route::Tripo, &target, &mut request).is_ok());
}

#[tokio::test]
async fn tls_pin_does_not_replace_original_certificate_name() {
    let (transport, listener, tls) = fixture().await;
    let server = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        assert!(tls.accept(socket).await.is_err());
    });
    let mut request = provider_request();
    // Admitted provider route, but the pinned server certificate is only valid
    // for the fixture's Vercel/CDN names. No HTTP request can cross this mismatch.
    request.url = "https://openrouter.ai/api/v1/images".to_owned();
    assert!(
        transport
            .send(Lane::Provider, request, &CancellationToken::new())
            .await
            .is_err()
    );
    server.await.unwrap();
}

#[tokio::test]
async fn literal_private_destinations_and_unselected_local_gg_fail_closed() {
    let transport = Transport::new(None).unwrap();
    for url in [
        "https://127.0.0.1/",
        "https://[::1]/",
        "https://169.254.169.254/",
        "https://[::ffff:127.0.0.1]/",
    ] {
        assert!(
            transport
                .resolve(&admitted_url(url).unwrap())
                .await
                .is_err()
        );
    }
    let local = admitted_url("http://127.0.0.1:3041/api/v1/ai/images/generations").unwrap();
    assert!(
        transport
            .admit(Lane::Provider, &local, &Method::POST)
            .is_err()
    );
    let selected = Transport::new(Some(LOCAL_GG)).unwrap();
    assert!(
        selected
            .admit(Lane::Provider, &local, &Method::POST)
            .is_ok()
    );
    assert_eq!(
        selected.resolve(&local).await.unwrap(),
        "127.0.0.1:3041".parse().unwrap()
    );
}

#[tokio::test]
async fn paid_requests_are_never_retried_redirected_or_pooled() {
    for reply in [b"".as_slice(), b"HTTP/1.1 503 Unavailable\r\nRetry-After: 0\r\nContent-Length: 0\r\n\r\n", b"HTTP/1.1 307 Redirect\r\nLocation: https://attacker.example/\r\nContent-Length: 0\r\n\r\n"] {
        let (transport, listener, tls) = fixture().await;
        let reply = reply.to_vec();
        let redirecting = reply.starts_with(b"HTTP/1.1 307");
        let disconnected = reply.is_empty();
        let server = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = tls.accept(socket).await.unwrap();
            assert_eq!(socket.get_ref().1.server_name(), Some("ai-gateway.vercel.sh"));
            let request = String::from_utf8(received(&mut socket).await).unwrap();
            assert!(request.starts_with("POST /v3/ai/image-model HTTP/1.1"));
            assert!(request.contains("accept-encoding: identity"));
            assert!(request.contains("host: ai-gateway.vercel.sh"));
            assert!(request.ends_with("{}"));
            socket.write_all(&reply).await.unwrap();
            let _ = socket.shutdown().await;
            drop(socket);
            assert!(timeout(Duration::from_millis(100), listener.accept()).await.is_err());
        });
        let result = transport.send(Lane::Provider, provider_request(), &CancellationToken::new()).await;
        if redirecting || disconnected { assert!(result.is_err()); } else { assert_eq!(result.unwrap().status, 503); }
        server.await.unwrap();
    }
}

#[tokio::test]
async fn responses_are_owned_bounded_and_close_connections() {
    let (transport, listener, tls) = fixture().await;
    let server = tokio::spawn(async move {
        for _ in 0..2 {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = tls.accept(socket).await.unwrap();
            received(&mut socket).await;
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nSet-Cookie: never=retain\r\n\r\nok",
                )
                .await
                .unwrap();
            let mut byte = [0];
            let closed = timeout(FIXTURE_WAIT, socket.read(&mut byte)).await.unwrap();
            // TLS truncation is also an observed closed underlying socket.
            assert!(closed.is_err() || closed.unwrap() == 0);
        }
    });
    for _ in 0..2 {
        let response = transport
            .send(
                Lane::Provider,
                provider_request(),
                &CancellationToken::new(),
            )
            .await
            .unwrap();
        assert_eq!(response.body, "ok");
        assert!(!response.headers.contains_key("set-cookie"));
    }
    server.await.unwrap();
}

#[tokio::test]
async fn bounded_body_and_error_status_policy() {
    for (raw, expected) in [
        (
            "HTTP/1.1 200 OK\r\nContent-Length: 20\r\n\r\n12345678901234567890",
            None,
        ),
        (
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n6\r\n123456\r\n6\r\n123456\r\n0\r\n\r\n",
            None,
        ),
        (
            "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: 2\r\n\r\nab",
            None,
        ),
        (
            "HTTP/1.1 403 Forbidden\r\nContent-Encoding: gzip\r\nContent-Length: 100000\r\n\r\n",
            Some(403),
        ),
        (
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n0\r\nX-Finished: yes\r\n\r\n",
            Some(200),
        ),
    ] {
        let (transport, listener, tls) = fixture().await;
        let server = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = tls.accept(socket).await.unwrap();
            received(&mut socket).await;
            let _ = socket.write_all(raw.as_bytes()).await;
            let _ = socket.shutdown().await;
        });
        let mut request = provider_request();
        request.max_response_bytes = 10;
        let result = transport
            .send(Lane::Provider, request, &CancellationToken::new())
            .await;
        if let Some(status) = expected {
            let response = result.unwrap();
            assert_eq!(response.status, status);
            if status == 403 {
                assert!(response.body.is_empty());
            }
        } else {
            assert!(result.is_err());
        }
        server.await.unwrap();
    }
}

#[tokio::test]
async fn deadline_and_cancellation_close_stalled_body() {
    for cancelled in [false, true] {
        let (transport, listener, tls) = fixture().await;
        let (ready, observed) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = tls.accept(socket).await.unwrap();
            received(&mut socket).await;
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 200\r\n\r\n")
                .await
                .unwrap();
            ready.send(()).unwrap();
            let mut byte = [0];
            let closed = timeout(FIXTURE_WAIT, socket.read(&mut byte)).await.unwrap();
            assert!(closed.is_err() || closed.unwrap() == 0);
        });
        let token = CancellationToken::new();
        let cancelling = token.clone();
        tokio::spawn(async move {
            observed.await.unwrap();
            if cancelled {
                cancelling.cancel();
            }
        });
        let mut request = provider_request();
        request.deadline = Some(Instant::now() + Duration::from_millis(200));
        assert!(matches!(
            transport.send(Lane::Provider, request, &token).await,
            Err(Error::Cancelled)
        ));
        server.await.unwrap();
    }
    let token = CancellationToken::new();
    token.cancel();
    let (transport, listener, _) = fixture().await;
    assert!(matches!(
        transport
            .send(Lane::Provider, provider_request(), &token)
            .await,
        Err(Error::Cancelled)
    ));
    assert!(
        timeout(Duration::from_millis(50), listener.accept())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn downloads_follow_at_most_three_credential_free_hops() {
    for redirects in [3, 4] {
        let (transport, listener, tls) = fixture().await;
        let server = tokio::spawn(async move {
            for hop in 0..=3 {
                let (socket, _) = listener.accept().await.unwrap();
                let mut socket = tls.accept(socket).await.unwrap();
                let request = String::from_utf8(received(&mut socket).await).unwrap();
                assert!(request.starts_with(&format!("GET /{hop} HTTP/1.1")));
                assert!(!request.contains("authorization"));
                let response = if hop < redirects {
                    format!(
                        "HTTP/1.1 302 Redirect\r\nLocation: /{}\r\nContent-Length: 0\r\n\r\n",
                        hop + 1
                    )
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok".to_owned()
                };
                socket.write_all(response.as_bytes()).await.unwrap();
                let _ = socket.shutdown().await;
            }
            assert!(
                timeout(Duration::from_millis(100), listener.accept())
                    .await
                    .is_err()
            );
        });
        let result = transport
            .send(
                Lane::Download,
                Request::new(Method::GET, "https://cdn.example/0", Bytes::new()),
                &CancellationToken::new(),
            )
            .await;
        if redirects == 3 {
            assert_eq!(result.unwrap().body, "ok");
        } else {
            assert!(result.is_err());
        }
        server.await.unwrap();
    }
}

fn account_request(logout: bool) -> Request {
    let mut request = Request::new(
        if logout { Method::POST } else { Method::GET },
        if logout {
            format!("{ISSUER}/logout?scope=local")
        } else {
            format!("{API}/api/v1/auth/me")
        },
        Bytes::new(),
    );
    request.headers.insert(
        "authorization",
        HeaderValue::from_static("Bearer synthetic-test-token"),
    );
    if logout {
        request.headers.insert(
            "apikey",
            HeaderValue::from_static("synthetic-test-public-key"),
        );
    }
    request.completion = if logout {
        ResponseCompletion::Empty
    } else {
        ResponseCompletion::Body
    };
    request
}

#[tokio::test]
async fn account_status_only_responses_discard_bodies_at_headers() {
    for (logout, raw, expected) in [
        (
            true,
            "HTTP/1.1 200 OK\r\nContent-Length: 999999\r\n\r\nupstream-secret",
            200,
        ),
        (
            false,
            "HTTP/1.1 401 Unauthorized\r\nTransfer-Encoding: chunked\r\n\r\nf\r\nupstream-secret\r\n",
            401,
        ),
        (false, "HTTP/1.1 204 No Content\r\n\r\n", 204),
    ] {
        let (mut transport, listener, tls) = fixture().await;
        transport.account_origins = Some((ISSUER.into(), API.into()));
        let server = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = tls.accept(socket).await.unwrap();
            received(&mut socket).await;
            socket.write_all(raw.as_bytes()).await.unwrap();
            // No EOF: the operation must finish from the response status alone.
            let mut byte = [0];
            let closed = timeout(FIXTURE_WAIT, socket.read(&mut byte)).await.unwrap();
            assert!(closed.is_err() || closed.unwrap() == 0);
        });
        let response = timeout(
            FIXTURE_WAIT,
            transport.send(
                Lane::Account,
                account_request(logout),
                &CancellationToken::new(),
            ),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(response.status, expected);
        assert!(response.body.is_empty());
        server.await.unwrap();
    }
}

#[tokio::test]
async fn account_success_json_is_bounded_at_65536_bytes() {
    for (size, chunked) in [(65_536, false), (65_537, false), (65_537, true)] {
        let (mut transport, listener, tls) = fixture().await;
        transport.account_origins = Some((ISSUER.into(), API.into()));
        let server = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = tls.accept(socket).await.unwrap();
            received(&mut socket).await;
            let body = " ".repeat(size);
            let raw = if chunked {
                format!(
                    "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{size:x}\r\n{body}\r\n0\r\n\r\n"
                )
            } else {
                format!("HTTP/1.1 200 OK\r\nContent-Length: {size}\r\n\r\n{body}")
            };
            let _ = socket.write_all(raw.as_bytes()).await;
            let _ = socket.shutdown().await;
        });
        let result = transport
            .send(
                Lane::Account,
                account_request(false),
                &CancellationToken::new(),
            )
            .await;
        if size == 65_536 {
            assert_eq!(result.unwrap().body.len(), size);
        } else {
            assert!(matches!(result, Err(Error::InvalidResponse)));
        }
        server.await.unwrap();
    }
}

#[tokio::test]
async fn vercel_video_completes_at_first_data_event_and_closes_held_open_socket() {
    for event in [
        "data: {\"type\":\"result\",\"videos\":[]}\r\n\r\n",
        "data: {\"type\":\"result\",\"videos\":[]}\r\r",
        "data: {\"type\":\"error\",\"message\":\"synthetic\"}\r\n\r\n",
        "data: invalid-json\r\n\r\n",
        "data: \r\n\r\n",
    ] {
        let (transport, listener, tls) = fixture().await;
        let expected = format!(": keepalive\r\n\r\n{event}");
        let prefix = expected.clone();
        let server = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = tls.accept(socket).await.unwrap();
            received(&mut socket).await;
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n").await.unwrap();
            // Fragment the terminal delimiter across HTTP chunks and keep the
            // connection open. CR-only events and split CRLF both complete.
            for fragment in [&prefix[..prefix.len() - 1], &prefix[prefix.len() - 1..]] {
                socket
                    .write_all(format!("{:x}\r\n{fragment}\r\n", fragment.len()).as_bytes())
                    .await
                    .unwrap();
            }
            let mut byte = [0];
            let closed = timeout(FIXTURE_WAIT, socket.read(&mut byte)).await.unwrap();
            assert!(closed.is_err() || closed.unwrap() == 0);
        });
        let mut request = provider_request();
        request.url = "https://ai-gateway.vercel.sh/v3/ai/video-model".into();
        request.completion = ResponseCompletion::FirstSseEvent;
        let response = timeout(
            FIXTURE_WAIT,
            transport.send(Lane::Provider, request, &CancellationToken::new()),
        )
        .await
        .unwrap()
        .unwrap();
        // A terminal CR dispatches without waiting for the optional LF. Whether
        // that LF arrived in the same body frame must not affect completion.
        assert!(
            response.body == expected.as_bytes()
                || (expected.ends_with("\r\n")
                    && response.body == expected.as_bytes()[..expected.len() - 1])
        );
        server.await.unwrap();
    }
}

#[tokio::test]
async fn first_sse_event_requires_data_and_exact_video_route() {
    let (transport, listener, tls) = fixture().await;
    let mut wrong_route = provider_request();
    wrong_route.completion = ResponseCompletion::FirstSseEvent;
    assert!(
        transport
            .send(Lane::Provider, wrong_route, &CancellationToken::new())
            .await
            .is_err()
    );
    assert!(
        timeout(Duration::from_millis(50), listener.accept())
            .await
            .is_err()
    );
    let server = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let mut socket = tls.accept(socket).await.unwrap();
        received(&mut socket).await;
        socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\n: keepalive\n\nevent: progress\n\n\n\ndata: {\"type\":\"result\"}").await.unwrap();
        let mut byte = [0];
        let closed = timeout(FIXTURE_WAIT, socket.read(&mut byte)).await.unwrap();
        assert!(closed.is_err() || closed.unwrap() == 0);
    });
    let mut request = provider_request();
    request.url = "https://ai-gateway.vercel.sh/v3/ai/video-model".into();
    request.completion = ResponseCompletion::FirstSseEvent;
    request.deadline = Some(Instant::now() + Duration::from_millis(200));
    assert!(matches!(
        transport
            .send(Lane::Provider, request, &CancellationToken::new())
            .await,
        Err(Error::Cancelled)
    ));
    server.await.unwrap();
}
