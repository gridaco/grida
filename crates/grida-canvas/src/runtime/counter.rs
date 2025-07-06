pub struct FrameCounter {
    /// last flushed frame
    prev: u64,
    /// next (current, planned, latest) frame
    next: u64,
}

impl FrameCounter {
    /// Create a new frame counter starting at 0
    pub fn new() -> Self {
        Self { prev: 0, next: 0 }
    }

    /// Queue a new frame and return the frame number
    pub fn queue(&mut self) -> u64 {
        if self.next <= self.prev {
            self.next = self.prev + 1;
        }
        self.next
    }

    /// Check if there are pending frames to flush
    pub fn has_pending(&self) -> bool {
        self.next > self.prev
    }

    /// Mark the current frame as flushed
    pub fn flush(&mut self) {
        self.prev = self.next;
    }

    /// Get the current frame number
    pub fn current(&self) -> u64 {
        self.next
    }

    /// Get the last flushed frame number
    pub fn last_flushed(&self) -> u64 {
        self.prev
    }

    /// Get the number of pending frames
    pub fn pending_count(&self) -> u64 {
        self.next.saturating_sub(self.prev)
    }

    /// Reset the counter (useful for testing or initialization)
    pub fn reset(&mut self) {
        self.prev = 0;
        self.next = 0;
    }

    /// Get frame statistics for debugging
    pub fn stats(&self) -> FrameCounterStats {
        FrameCounterStats {
            current: self.current(),
            last_flushed: self.last_flushed(),
            pending_count: self.pending_count(),
            has_pending: self.has_pending(),
        }
    }
}

/// Frame statistics for debugging and monitoring
#[derive(Debug, Clone)]
pub struct FrameCounterStats {
    pub current: u64,
    pub last_flushed: u64,
    pub pending_count: u64,
    pub has_pending: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_counter_basic_functionality() {
        let mut counter = FrameCounter::new();

        // Initially no pending frames
        assert!(!counter.has_pending());
        assert_eq!(counter.current(), 0);
        assert_eq!(counter.last_flushed(), 0);
        assert_eq!(counter.pending_count(), 0);

        // Queue a frame
        let frame = counter.queue();
        assert_eq!(frame, 1);
        assert!(counter.has_pending());
        assert_eq!(counter.current(), 1);
        assert_eq!(counter.last_flushed(), 0);
        assert_eq!(counter.pending_count(), 1);

        // Flush the frame
        counter.flush();
        assert!(!counter.has_pending());
        assert_eq!(counter.current(), 1);
        assert_eq!(counter.last_flushed(), 1);
        assert_eq!(counter.pending_count(), 0);

        // Queue another frame
        let frame = counter.queue();
        assert_eq!(frame, 2);
        assert!(counter.has_pending());
        assert_eq!(counter.current(), 2);
        assert_eq!(counter.last_flushed(), 1);
        assert_eq!(counter.pending_count(), 1);
    }

    #[test]
    fn frame_counter_reset() {
        let mut counter = FrameCounter::new();

        // Queue and flush a few frames
        counter.queue();
        counter.flush();
        counter.queue();
        counter.flush();

        // Reset
        counter.reset();
        assert!(!counter.has_pending());
        assert_eq!(counter.current(), 0);
        assert_eq!(counter.last_flushed(), 0);
        assert_eq!(counter.pending_count(), 0);
    }
}
