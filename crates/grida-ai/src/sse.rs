// GRIDA-SEC-004 — bounded streaming event completion without socket EOF.
/// Framing state for a bounded, monotonically growing SSE byte buffer.
/// Each byte is scanned once. The caller retains the buffer and applies its byte
/// and time limits before calling the parser; no payload is copied here.
#[derive(Default)]
pub struct SseEventFramer {
    scanned: usize,
    line_start: usize,
    has_data: bool,
    completed: Option<usize>,
}

impl SseEventFramer {
    /// Returns the absolute byte end of the first complete event containing a
    /// data field, even when its value is empty or invalid JSON. Comments and
    /// empty events are skipped. A partial event at EOF is not dispatched.
    pub fn event_end(&mut self, bytes: &[u8]) -> Option<usize> {
        if self.completed.is_some() {
            return self.completed;
        }
        if self.scanned == 0 && bytes.first() == Some(&0xef) {
            if bytes.len() < 3 {
                return None;
            }
            if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
                self.scanned = 3;
                self.line_start = 3;
            }
        }
        while self.scanned < bytes.len() {
            let byte = bytes[self.scanned];
            if byte != b'\n' && byte != b'\r' {
                self.scanned += 1;
                continue;
            }
            // CR alone is a complete SSE line ending. A terminal empty line
            // can dispatch immediately, even when an optional LF has not arrived.
            // Other split CRLFs wait so the LF cannot become a second line.
            if byte == b'\r' && self.scanned + 1 == bytes.len() {
                if self.scanned == self.line_start && self.has_data {
                    self.completed = Some(self.scanned + 1);
                    return self.completed;
                }
                return None;
            }
            let end = self.scanned
                + 1
                + usize::from(byte == b'\r' && bytes.get(self.scanned + 1) == Some(&b'\n'));
            let line = &bytes[self.line_start..self.scanned];
            if line.is_empty() && self.has_data {
                self.completed = Some(end);
                return self.completed;
            }
            if line == b"data" || line.starts_with(b"data:") {
                self.has_data = true;
            }
            self.scanned = end;
            self.line_start = end;
        }
        None
    }
}

/// Convenience for one complete buffer. Streaming hosts should retain a
/// SseEventFramer to avoid rescanning already received bytes.
pub fn first_sse_event_end(bytes: &[u8]) -> Option<usize> {
    SseEventFramer::default().event_end(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_chunk_boundary_preserves_first_event() {
        let bytes = b"\xef\xbb\xbf: heartbeat\r\n\r\nid: one\r\ndata: {\r\ndata: \"type\":\"result\"}\r\n\r\ndata: ignored\n\n";
        let expected = bytes
            .windows(15)
            .position(|w| w == b"data: ignored\n\n")
            .unwrap();
        for split in 0..=bytes.len() {
            let mut parser = SseEventFramer::default();
            let first = parser.event_end(&bytes[..split]);
            let end = if split == expected - 1 {
                expected - 1
            } else {
                expected
            };
            assert_eq!(first.or_else(|| parser.event_end(bytes)), Some(end));
        }
        let mut parser = SseEventFramer::default();
        for end in 0..expected - 1 {
            assert_eq!(parser.event_end(&bytes[..end]), None);
        }
        assert_eq!(parser.event_end(&bytes[..expected - 1]), Some(expected - 1));
        assert_eq!(parser.event_end(bytes), Some(expected - 1));
    }
    #[test]
    fn cr_only_event_completes_without_another_byte_or_eof() {
        let bytes = b"data: {}\r\r";
        for split in 0..=bytes.len() {
            let mut parser = SseEventFramer::default();
            let first = parser.event_end(&bytes[..split]);
            assert_eq!(first.or_else(|| parser.event_end(bytes)), Some(bytes.len()));
        }
    }
    #[test]
    fn empty_data_is_an_event_but_eof_does_not_dispatch_partial_data() {
        assert_eq!(first_sse_event_end(b": comment\n\ndata:\n\n"), Some(18));
        assert_eq!(first_sse_event_end(b"data\n\n"), Some(6));
        assert_eq!(first_sse_event_end(b"data: {}\n"), None);
        assert_eq!(first_sse_event_end(b"data: {}"), None);
    }
}
