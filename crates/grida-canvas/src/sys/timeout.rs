use std::time::{Duration, Instant};

/// A one-shot timeout timer driven by an external clock.
///
/// `Timeout` represents a countdown timer that expires after a specified duration,
/// using externally supplied time (e.g. from a centralized tick-based clock).
/// It does not track time itself and must be ticked manually via the caller.
///
/// # Example
/// ```rust
/// use std::time::{Duration, Instant};
/// use grida_canvas::sys::timeout::Timeout;
///
/// let mut timeout = Timeout::new();
/// let now = Instant::now();
///
/// // Start a 1-second timeout
/// timeout.start(Duration::from_secs(1), now);
///
/// // Later in your loop or tick function
/// let later = now + Duration::from_millis(1200);
/// if timeout.is_expired(later) {
///     println!("Timeout expired!");
/// }
/// ```
pub struct Timeout {
    deadline: Option<Instant>,
}

impl Timeout {
    /// Creates a new inactive timeout.
    ///
    /// To activate, call [`start`] with a duration and the current time.
    pub fn new() -> Self {
        Self { deadline: None }
    }

    /// Starts or restarts the timeout with the given duration,
    /// using the provided `now` time as the starting point.
    pub fn start(&mut self, duration: Duration, now: Instant) {
        self.deadline = Some(now + duration);
    }

    /// Returns `true` if the timeout has expired at the given `now` time.
    ///
    /// Returns `false` if the timeout is inactive or not yet expired.
    pub fn is_expired(&self, now: Instant) -> bool {
        match self.deadline {
            Some(deadline) => now >= deadline,
            None => false,
        }
    }

    /// Clears the timeout, making it inactive.
    pub fn clear(&mut self) {
        self.deadline = None;
    }

    /// Returns `true` if the timeout is currently active.
    pub fn is_active(&self) -> bool {
        self.deadline.is_some()
    }
}
