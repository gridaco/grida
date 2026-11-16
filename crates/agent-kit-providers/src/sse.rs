use std::collections::VecDeque;

/// Incremental SSE data framing. UTF-8 is decoded only after an entire event.
pub(crate) struct Decoder {
    maximum: usize,
    size: usize,
    first_line: bool,
    skip_lf: bool,
    line: Vec<u8>,
    data: Vec<u8>,
    has_data: bool,
    events: VecDeque<Vec<u8>>,
}

impl Decoder {
    pub(crate) fn new(maximum: usize) -> Self {
        Self {
            maximum,
            size: 0,
            first_line: true,
            skip_lf: false,
            line: Vec::new(),
            data: Vec::new(),
            has_data: false,
            events: VecDeque::new(),
        }
    }

    pub(crate) fn feed(&mut self, bytes: &[u8]) -> Result<(), ()> {
        for &byte in bytes {
            if std::mem::take(&mut self.skip_lf) && byte == b'\n' {
                continue;
            }
            self.size += 1;
            if self.size > self.maximum {
                return Err(());
            }
            match byte {
                b'\r' => {
                    self.end_line();
                    self.skip_lf = true;
                }
                b'\n' => self.end_line(),
                _ => self.line.push(byte),
            }
        }
        Ok(())
    }

    pub(crate) fn pop(&mut self) -> Option<Vec<u8>> {
        self.events.pop_front()
    }

    pub(crate) fn is_incomplete(&self) -> bool {
        self.has_data || !self.line.is_empty()
    }

    fn end_line(&mut self) {
        let mut line = self.line.as_slice();
        if std::mem::take(&mut self.first_line) {
            line = line.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(line);
        }
        if line.is_empty() {
            if std::mem::take(&mut self.has_data) {
                self.events.push_back(std::mem::take(&mut self.data));
            }
            self.size = 0;
        } else {
            let field = if line == b"data" {
                Some(&[][..])
            } else {
                line.strip_prefix(b"data:")
            };
            if let Some(value) = field {
                if self.has_data {
                    self.data.push(b'\n');
                }
                self.data
                    .extend_from_slice(value.strip_prefix(b" ").unwrap_or(value));
                self.has_data = true;
            }
        }
        self.line.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::Decoder;

    #[test]
    fn preserves_data_across_every_byte_split() {
        let bytes = "\u{feff}: ping\r\n\r\ndata: {\r\ndata: \"text\":\"안녕하세요\"}\r\n\r\ndata: [DONE]\r\r".as_bytes();
        for split in 0..=bytes.len() {
            let mut decoder = Decoder::new(128);
            decoder.feed(&bytes[..split]).unwrap();
            decoder.feed(&bytes[split..]).unwrap();
            assert_eq!(
                decoder.pop(),
                Some("{\n\"text\":\"안녕하세요\"}".as_bytes().to_vec())
            );
            assert_eq!(decoder.pop(), Some(b"[DONE]".to_vec()));
            assert_eq!(decoder.pop(), None);
        }
    }

    #[test]
    fn unfinished_events_remain_unpublished_and_bounded() {
        let mut decoder = Decoder::new(10);
        decoder.feed(b"data: 123\n").unwrap();
        assert_eq!(decoder.pop(), None);
        assert!(decoder.feed(b"a").is_err());
    }
}
