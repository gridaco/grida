//! GRIDA-SEC-004 — the bearer perimeter shared by the host's loopback listeners.
//!
//! A listener binds a loopback address, accepts only loopback peers, and
//! serves one exact path to requests that carry no Origin, name the bound
//! address as their only Host, and present the launch token as their only
//! Authorization. The token comes from an environment variable chosen by the
//! trusted launch and is held in memory that is cleared when dropped.

use agent_kit_core::{Error, ErrorKind, Result};
use hyper::StatusCode;
use hyper::header::{AUTHORIZATION, HOST, ORIGIN};
use std::future::Future;
use std::net::SocketAddr;
use std::time::Duration;
use subtle::ConstantTimeEq;
use zeroize::Zeroizing;

const MAX_ENV_NAME_BYTES: usize = 128;
const TOKEN_HEX_DIGITS: usize = 64;
/// The pause after a failed accept, so descriptor exhaustion does not spin.
const ACCEPT_BACKOFF: Duration = Duration::from_millis(100);

/// Whether `name` can name an environment variable that carries a launch
/// secret: 1 to 128 ASCII letters, digits or underscores.
pub fn valid_secret_env_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_ENV_NAME_BYTES
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

/// The Authorization value a client must present: `Bearer` and the 64
/// hexadecimal digits held by the named variable.
pub(crate) fn authorization_from_env(name: &str) -> Result<Zeroizing<Vec<u8>>> {
    if !valid_secret_env_name(name) {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "invalid_server_token_environment_name",
        ));
    }
    let token = std::env::var(name)
        .ok()
        .map(Zeroizing::new)
        .filter(|token| {
            token.len() == TOKEN_HEX_DIGITS && token.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        .ok_or_else(|| Error::new(ErrorKind::Unavailable, "server_token_unavailable"))?;
    let mut authorization = Zeroizing::new(Vec::with_capacity(7 + TOKEN_HEX_DIGITS));
    authorization.extend_from_slice(b"Bearer ");
    authorization.extend_from_slice(token.as_bytes());
    Ok(authorization)
}

/// The status refusing a request outside the perimeter, or `None` to serve it.
pub(crate) fn rejection<B>(
    request: &hyper::http::Request<B>,
    path: &str,
    host: &str,
    authorization: &[u8],
) -> Option<StatusCode> {
    let uri = request.uri();
    if uri.path() != path || uri.query().is_some() || uri.authority().is_some() {
        return Some(StatusCode::NOT_FOUND);
    }
    let headers = request.headers();
    if headers.contains_key(ORIGIN)
        || headers.get_all(HOST).iter().count() != 1
        || headers
            .get(HOST)
            .is_none_or(|value| value.as_bytes() != host.as_bytes())
    {
        return Some(StatusCode::FORBIDDEN);
    }
    if headers.get_all(AUTHORIZATION).iter().count() != 1
        || headers
            .get(AUTHORIZATION)
            .is_none_or(|value| !bool::from(value.as_bytes().ct_eq(authorization)))
    {
        return Some(StatusCode::UNAUTHORIZED);
    }
    None
}

/// The next connection from a loopback peer. A failed accept, such as
/// descriptor exhaustion or a peer reset before accept, is transient: it is
/// reported, and accepting resumes after a short pause, so one failure never
/// closes the listener for its attached clients.
pub(crate) async fn next_loopback<S, F, Fut>(listener: &str, mut accept: F) -> S
where
    F: FnMut() -> Fut,
    Fut: Future<Output = std::io::Result<(S, SocketAddr)>>,
{
    loop {
        match accept().await {
            Ok((stream, peer)) if peer.ip().is_loopback() => return stream,
            Ok(_) => {}
            Err(error) => {
                eprintln!("grida-agent: {listener} accept failed: {error}");
                tokio::time::sleep(ACCEPT_BACKOFF).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::io;

    const AUTHORIZATION_VALUE: &[u8] = b"Bearer secret";

    fn request(uri: &str, headers: &[(&str, &str)]) -> hyper::http::Request<()> {
        let mut builder = hyper::http::Request::builder().uri(uri);
        for (name, value) in headers {
            builder = builder.header(*name, *value);
        }
        builder.body(()).unwrap()
    }

    fn check(uri: &str, headers: &[(&str, &str)]) -> Option<StatusCode> {
        rejection(
            &request(uri, headers),
            "/acp",
            "127.0.0.1:7",
            AUTHORIZATION_VALUE,
        )
    }

    #[test]
    fn every_refusal_has_its_status() {
        let host = ("host", "127.0.0.1:7");
        let bearer = ("authorization", "Bearer secret");
        assert_eq!(check("/acp", &[host, bearer]), None);
        for uri in ["/other", "/acp?x=1", "http://127.0.0.1:7/acp"] {
            assert_eq!(
                check(uri, &[host, bearer]),
                Some(StatusCode::NOT_FOUND),
                "{uri}"
            );
        }
        for headers in [
            vec![bearer],
            vec![("host", "localhost:7"), bearer],
            vec![host, host, bearer],
            vec![host, ("origin", "http://127.0.0.1:7"), bearer],
        ] {
            assert_eq!(
                check("/acp", &headers),
                Some(StatusCode::FORBIDDEN),
                "{headers:?}"
            );
        }
        for headers in [
            vec![host],
            vec![host, ("authorization", "Bearer other")],
            vec![host, bearer, bearer],
        ] {
            assert_eq!(
                check("/acp", &headers),
                Some(StatusCode::UNAUTHORIZED),
                "{headers:?}"
            );
        }
    }

    #[test]
    fn secret_variable_names_are_bounded_identifiers() {
        assert!(valid_secret_env_name("ACP_TOKEN_1"));
        let long = "A".repeat(129);
        for name in ["", "A-B", "A=B", long.as_str()] {
            assert!(!valid_secret_env_name(name), "{name}");
        }
        assert_eq!(
            authorization_from_env("A-B").err().unwrap().code,
            "invalid_server_token_environment_name"
        );
    }

    #[tokio::test]
    async fn a_failed_accept_does_not_end_the_listener() {
        let loopback: SocketAddr = "127.0.0.1:9".parse().unwrap();
        let remote: SocketAddr = "192.0.2.1:9".parse().unwrap();
        let mut accepted: VecDeque<io::Result<(u8, SocketAddr)>> = VecDeque::from([
            Err(io::Error::from_raw_os_error(libc::EMFILE)),
            Err(io::Error::from(io::ErrorKind::ConnectionAborted)),
            Ok((1, remote)),
            Ok((2, loopback)),
        ]);
        let stream = next_loopback("test", || {
            let next = accepted.pop_front().unwrap();
            async move { next }
        })
        .await;
        assert_eq!(stream, 2);
        assert!(accepted.is_empty());
    }
}
