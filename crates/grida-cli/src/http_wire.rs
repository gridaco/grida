// GRIDA-SEC-013 — bound response heads before the HTTP parser, including trailers.
// This guard recognizes framing only. Hyper remains the HTTP protocol parser.
use std::{
    io,
    pin::Pin,
    task::{Context, Poll},
};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

pub(super) const HEAD_LIMIT: usize = 32 * 1024;
const CHUNK_LINE_LIMIT: usize = 8192;

#[derive(Debug)]
enum Phase {
    Head,
    Fixed(u64),
    Close,
    ChunkLine,
    ChunkData(u64),
    ChunkEnd(u8),
    Trailers,
    Done,
}

pub(super) struct WireGuard<S> {
    inner: S,
    phase: Phase,
    buffer: Vec<u8>,
    head_only: bool,
    informational: usize,
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "media_transport_failed")
}

impl<S> WireGuard<S> {
    pub(super) fn new(inner: S, head_only: bool) -> Self {
        Self {
            inner,
            phase: Phase::Head,
            buffer: Vec::with_capacity(HEAD_LIMIT),
            head_only,
            informational: 0,
        }
    }

    fn head(&mut self) -> io::Result<Phase> {
        let mut headers = [httparse::EMPTY_HEADER; 100];
        let mut response = httparse::Response::new(&mut headers);
        if response.parse(&self.buffer).map_err(|_| invalid())?
            != httparse::Status::Complete(self.buffer.len())
        {
            return Err(invalid());
        }
        let code = response.code.ok_or_else(invalid)?;
        if (100..200).contains(&code) {
            self.informational += 1;
            if code == 101 || self.informational > 32 {
                return Err(invalid());
            }
            return Ok(Phase::Head);
        }
        if !(200..600).contains(&code) {
            return Err(invalid());
        }
        let mut length = None;
        let mut chunked = false;
        for header in response.headers {
            if header.name.eq_ignore_ascii_case("content-length") {
                if length.is_some()
                    || header.value.is_empty()
                    || !header.value.iter().all(u8::is_ascii_digit)
                {
                    return Err(invalid());
                }
                length = Some(
                    std::str::from_utf8(header.value)
                        .map_err(|_| invalid())?
                        .parse::<u64>()
                        .map_err(|_| invalid())?,
                );
            } else if header.name.eq_ignore_ascii_case("transfer-encoding") {
                if chunked || !header.value.eq_ignore_ascii_case(b"chunked") {
                    return Err(invalid());
                }
                chunked = true;
            }
        }
        if chunked && length.is_some() {
            return Err(invalid());
        }
        if self.head_only || matches!(code, 204 | 205 | 304) {
            return Ok(Phase::Done);
        }
        Ok(if chunked {
            Phase::ChunkLine
        } else if let Some(n) = length {
            if n == 0 { Phase::Done } else { Phase::Fixed(n) }
        } else {
            Phase::Close
        })
    }

    fn observe(&mut self, bytes: &[u8]) -> io::Result<()> {
        let mut offset = 0;
        while offset < bytes.len() {
            match &mut self.phase {
                Phase::Head | Phase::Trailers | Phase::ChunkLine => {
                    let limit = if matches!(self.phase, Phase::ChunkLine) {
                        CHUNK_LINE_LIMIT
                    } else {
                        HEAD_LIMIT
                    };
                    if self.buffer.len() == limit {
                        return Err(invalid());
                    }
                    self.buffer.push(bytes[offset]);
                    offset += 1;
                    let complete = match self.phase {
                        Phase::ChunkLine => self.buffer.ends_with(b"\r\n"),
                        Phase::Trailers => {
                            self.buffer == b"\r\n" || self.buffer.ends_with(b"\r\n\r\n")
                        }
                        _ => self.buffer.ends_with(b"\r\n\r\n"),
                    };
                    if complete {
                        self.phase = match self.phase {
                            Phase::Head => self.head()?,
                            Phase::ChunkLine => {
                                let line = &self.buffer[..self.buffer.len() - 2];
                                let hex = line.split(|b| *b == b';').next().ok_or_else(invalid)?;
                                if hex.is_empty()
                                    || hex.len() > 16
                                    || !hex.iter().all(u8::is_ascii_hexdigit)
                                {
                                    return Err(invalid());
                                }
                                let n = u64::from_str_radix(
                                    std::str::from_utf8(hex).map_err(|_| invalid())?,
                                    16,
                                )
                                .map_err(|_| invalid())?;
                                if n == 0 {
                                    Phase::Trailers
                                } else {
                                    Phase::ChunkData(n)
                                }
                            }
                            Phase::Trailers => {
                                let mut headers = [httparse::EMPTY_HEADER; 100];
                                let httparse::Status::Complete((used, parsed)) =
                                    httparse::parse_headers(&self.buffer, &mut headers)
                                        .map_err(|_| invalid())?
                                else {
                                    return Err(invalid());
                                };
                                if used != self.buffer.len()
                                    || parsed.iter().any(|h| {
                                        ["content-length", "transfer-encoding", "host"]
                                            .iter()
                                            .any(|n| h.name.eq_ignore_ascii_case(n))
                                    })
                                {
                                    return Err(invalid());
                                }
                                Phase::Done
                            }
                            _ => unreachable!(),
                        };
                        self.buffer.clear();
                    }
                }
                Phase::Fixed(left) | Phase::ChunkData(left) => {
                    let used = (*left).min((bytes.len() - offset) as u64) as usize;
                    *left -= used as u64;
                    offset += used;
                    if *left == 0 {
                        self.phase = if matches!(self.phase, Phase::Fixed(_)) {
                            Phase::Done
                        } else {
                            Phase::ChunkEnd(0)
                        };
                    }
                }
                Phase::ChunkEnd(seen) => {
                    if bytes[offset] != b"\r\n"[*seen as usize] {
                        return Err(invalid());
                    }
                    offset += 1;
                    *seen += 1;
                    if *seen == 2 {
                        self.phase = Phase::ChunkLine;
                    }
                }
                Phase::Close => return Ok(()),
                // The response owner closes after HEAD/no-body responses. Bytes
                // coalesced after their head never become a second response.
                Phase::Done => return Ok(()),
            }
        }
        Ok(())
    }
}

impl<S: AsyncRead + Unpin> AsyncRead for WireGuard<S> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        output: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if output.remaining() == 0 {
            return Poll::Ready(Ok(()));
        }
        // Fixed scratch space prevents caller read-buffer growth from bypassing
        // the guard. No header buffer ever grows beyond HEAD_LIMIT.
        let mut scratch = [0_u8; 8192];
        let count = output.remaining().min(scratch.len());
        let mut input = ReadBuf::new(&mut scratch[..count]);
        match Pin::new(&mut self.inner).poll_read(cx, &mut input) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
            Poll::Ready(Ok(())) => {
                if let Err(error) = self.observe(input.filled()) {
                    return Poll::Ready(Err(error));
                }
                output.put_slice(input.filled());
                Poll::Ready(Ok(()))
            }
        }
    }
}

impl<S: AsyncWrite + Unpin> AsyncWrite for WireGuard<S> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bytes: &[u8],
    ) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.inner).poll_write(cx, bytes)
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
    fn is_write_vectored(&self) -> bool {
        self.inner.is_write_vectored()
    }
    fn poll_write_vectored(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bufs: &[io::IoSlice<'_>],
    ) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.inner).poll_write_vectored(cx, bufs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use http_body_util::{BodyExt, Empty};
    use hyper_util::rt::TokioIo;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    async fn through_hyper(raw: Vec<u8>) -> Result<Bytes, ()> {
        let (client, mut server) = tokio::io::duplex(1024 * 1024);
        tokio::spawn(async move {
            let mut byte = [0];
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                server.read_exact(&mut byte).await.unwrap();
                request.push(byte[0]);
            }
            let _ = server.write_all(&raw).await;
        });
        let (mut sender, conn) = hyper::client::conn::http1::Builder::new()
            .max_buf_size(HEAD_LIMIT)
            .handshake(TokioIo::new(WireGuard::new(client, false)))
            .await
            .unwrap();
        let task = tokio::spawn(conn);
        let request = hyper::Request::builder()
            .uri("http://provider.test/")
            .body(Empty::<Bytes>::new())
            .unwrap();
        let result = match sender.send_request(request).await {
            Ok(response) => response
                .into_body()
                .collect()
                .await
                .map(|b| b.to_bytes())
                .map_err(|_| ()),
            Err(_) => Err(()),
        };
        task.abort();
        result
    }

    #[tokio::test]
    async fn oversized_complete_head_is_rejected_before_hyper() {
        let reply = format!(
            "HTTP/1.1 200 OK\r\nX-Large: {}\r\nContent-Length: 0\r\n\r\n",
            "x".repeat(40 * 1024)
        );
        assert!(through_hyper(reply.into_bytes()).await.is_err());
    }

    #[tokio::test]
    async fn exact_head_boundary_informational_and_trailers() {
        let prefix = "HTTP/1.1 200 OK\r\nX-Large: ";
        let suffix = "\r\nContent-Length: 0\r\n\r\n";
        let raw = format!(
            "{prefix}{}{suffix}",
            "x".repeat(HEAD_LIMIT - prefix.len() - suffix.len())
        );
        assert!(through_hyper(raw.into_bytes()).await.is_ok());
        assert!(through_hyper(b"HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n0\r\nX-End: yes\r\n\r\n".to_vec()).await.is_ok());
        let interim = format!(
            "HTTP/1.1 100 Continue\r\nX-Large: {}\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n",
            "x".repeat(HEAD_LIMIT)
        );
        assert!(through_hyper(interim.into_bytes()).await.is_err());
        let trailers = format!(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\nX-Large: {}\r\n\r\n",
            "x".repeat(HEAD_LIMIT)
        );
        assert!(through_hyper(trailers.into_bytes()).await.is_err());
    }

    #[test]
    fn framing_is_independent_of_read_boundaries() {
        let raw = b"HTTP/1.1 103 Early Hints\r\nLink: x\r\n\r\nHTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3;foo=bar\r\nabc\r\n0\r\nX-End: yes\r\n\r\n";
        for size in 1..=raw.len() {
            let mut guard = WireGuard::new((), false);
            for chunk in raw.chunks(size) {
                guard.observe(chunk).unwrap();
            }
            assert!(matches!(guard.phase, Phase::Done));
            assert!(guard.buffer.capacity() <= HEAD_LIMIT);
        }
        for raw in [
            b"HTTP/1.1 101 Switching Protocols\r\n\r\n".as_slice(),
            b"HTTP/1.1 200 OK\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n",
        ] {
            assert!(WireGuard::new((), false).observe(raw).is_err());
        }
    }
}
