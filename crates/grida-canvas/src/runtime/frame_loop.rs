/// Unified frame lifecycle controller.
///
/// `FrameLoop` is the single owner of "should we render, and at what quality?"
/// It is **source-agnostic**: it does not know *what* changed (camera, scene,
/// config, etc.) — only *that* something changed and *when*.
///
/// # Design
///
/// The host calls one function per frame. The engine decides whether to produce
/// pixels. No callbacks from engine to host. No platform-specific notification
/// mechanism inside the rendering core.
///
/// Three operations:
/// - [`invalidate`](FrameLoop::invalidate) — something changed, O(1)
/// - [`poll`](FrameLoop::poll) — should we render this tick?
/// - [`complete`](FrameLoop::complete) — mark frame as rendered
///
/// All times are host-provided `f64` milliseconds (e.g. from
/// `performance.now()` or `requestAnimationFrame`). No `std::time::Instant`.
#[derive(Debug)]
pub struct FrameLoop {
    /// Last rendered frame number.
    prev_frame: u64,
    /// Next pending frame number.
    next_frame: u64,
    /// Host-time (ms) of last invalidation.
    last_change_time: f64,
    /// Debounce threshold in milliseconds before stable frame fires.
    stable_delay_ms: f64,
    /// True after an unstable render, until a stable render completes.
    needs_stable: bool,
}

/// What quality of frame to render.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameQuality {
    /// Fast, reduced-quality frame during active interaction.
    Unstable,
    /// Full-quality frame after interaction settles.
    Stable,
}

impl Default for FrameLoop {
    fn default() -> Self {
        Self::new()
    }
}

impl FrameLoop {
    /// Default debounce delay (milliseconds) before a stable frame fires.
    pub const DEFAULT_STABLE_DELAY_MS: f64 = 50.0;

    /// Create a new `FrameLoop` with the default stable delay.
    pub fn new() -> Self {
        Self::with_stable_delay(Self::DEFAULT_STABLE_DELAY_MS)
    }

    /// Create a new `FrameLoop` with a custom stable delay.
    pub fn with_stable_delay(stable_delay_ms: f64) -> Self {
        Self {
            prev_frame: 0,
            next_frame: 0,
            last_change_time: 0.0,
            stable_delay_ms,
            needs_stable: false,
        }
    }

    /// Something changed. Bumps `next_frame`, records timestamp, sets
    /// `needs_stable = true`. O(1), no plan building.
    pub fn invalidate(&mut self, now: f64) {
        self.next_frame = self.next_frame.wrapping_add(1);
        self.last_change_time = now;
        self.needs_stable = true;
    }

    /// Called once per host frame. Returns:
    /// - `None` — idle, nothing to render
    /// - `Some(Unstable)` — change within debounce window, render fast
    /// - `Some(Stable)` — debounce expired and stable still owed, render full quality
    pub fn poll(&self, now: f64) -> Option<FrameQuality> {
        // New frame pending (change since last render)?
        let has_pending = self.next_frame != self.prev_frame;

        if has_pending {
            // Always render pending frames as unstable first.
            return Some(FrameQuality::Unstable);
        }

        // No new frame pending, but do we owe a stable frame?
        if self.needs_stable {
            let elapsed = now - self.last_change_time;
            if elapsed >= self.stable_delay_ms {
                return Some(FrameQuality::Stable);
            }
        }

        None
    }

    /// Mark frame as rendered. If `Stable`, clears `needs_stable`.
    /// If `Unstable`, keeps `needs_stable = true` so `poll()` will
    /// return `Stable` once the debounce expires.
    pub fn complete(&mut self, quality: FrameQuality) {
        self.prev_frame = self.next_frame;
        match quality {
            FrameQuality::Stable => {
                self.needs_stable = false;
            }
            FrameQuality::Unstable => {
                // needs_stable stays true — poll() will fire Stable later
            }
        }
    }

    /// Whether the frame loop is completely idle (no pending work).
    pub fn is_idle(&self) -> bool {
        self.next_frame == self.prev_frame && !self.needs_stable
    }

    /// Current frame number.
    pub fn current_frame(&self) -> u64 {
        self.next_frame
    }

    /// Last rendered frame number.
    pub fn last_rendered_frame(&self) -> u64 {
        self.prev_frame
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_by_default() {
        let fl = FrameLoop::new();
        assert!(fl.is_idle());
        assert_eq!(fl.poll(0.0), None);
        assert_eq!(fl.poll(1000.0), None);
    }

    #[test]
    fn invalidate_triggers_unstable() {
        let mut fl = FrameLoop::new();
        fl.invalidate(100.0);
        assert!(!fl.is_idle());
        assert_eq!(fl.poll(100.0), Some(FrameQuality::Unstable));
    }

    #[test]
    fn complete_unstable_then_stable_after_delay() {
        let mut fl = FrameLoop::new();
        fl.invalidate(100.0);

        // First poll: unstable
        assert_eq!(fl.poll(100.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // Immediately after: no pending, but stable not yet due
        assert_eq!(fl.poll(110.0), None);

        // After debounce: stable fires
        assert_eq!(fl.poll(200.0), Some(FrameQuality::Stable));
        fl.complete(FrameQuality::Stable);

        // Now idle
        assert!(fl.is_idle());
        assert_eq!(fl.poll(300.0), None);
    }

    #[test]
    fn rapid_invalidations_coalesce() {
        let mut fl = FrameLoop::new();

        // 10 invalidations in rapid succession
        for i in 0..10 {
            fl.invalidate(100.0 + i as f64);
        }

        // Only one unstable frame needed
        assert_eq!(fl.poll(109.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // Stable fires after the *last* invalidation's debounce
        assert_eq!(fl.poll(150.0), None); // 109 + 50 = 159 not yet
        assert_eq!(fl.poll(159.0), Some(FrameQuality::Stable));
        fl.complete(FrameQuality::Stable);

        assert!(fl.is_idle());
    }

    #[test]
    fn invalidate_during_stable_wait_restarts_debounce() {
        let mut fl = FrameLoop::new();
        fl.invalidate(100.0);

        assert_eq!(fl.poll(100.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // Waiting for stable at 150ms...
        assert_eq!(fl.poll(140.0), None);

        // New invalidation at 145ms resets the debounce
        fl.invalidate(145.0);
        assert_eq!(fl.poll(145.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // Old debounce (150ms) shouldn't fire stable
        assert_eq!(fl.poll(155.0), None);

        // New debounce (145 + 50 = 195ms) fires stable
        assert_eq!(fl.poll(195.0), Some(FrameQuality::Stable));
        fl.complete(FrameQuality::Stable);

        assert!(fl.is_idle());
    }

    #[test]
    fn custom_stable_delay() {
        let mut fl = FrameLoop::with_stable_delay(200.0);
        fl.invalidate(0.0);

        assert_eq!(fl.poll(0.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        assert_eq!(fl.poll(100.0), None);
        assert_eq!(fl.poll(199.0), None);
        assert_eq!(fl.poll(200.0), Some(FrameQuality::Stable));
    }

    #[test]
    fn complete_stable_without_unstable() {
        // Edge case: if we directly call complete(Stable), needs_stable clears
        let mut fl = FrameLoop::new();
        fl.invalidate(0.0);

        // Skip unstable, go straight to stable (e.g. scene load)
        assert_eq!(fl.poll(0.0), Some(FrameQuality::Unstable));
        // But the caller renders it as stable quality
        fl.complete(FrameQuality::Stable);

        // Should be idle — stable was delivered
        assert!(fl.is_idle());
    }

    #[test]
    fn frame_numbers_increment() {
        let mut fl = FrameLoop::new();
        assert_eq!(fl.current_frame(), 0);
        assert_eq!(fl.last_rendered_frame(), 0);

        fl.invalidate(0.0);
        assert_eq!(fl.current_frame(), 1);
        assert_eq!(fl.last_rendered_frame(), 0);

        fl.complete(FrameQuality::Unstable);
        assert_eq!(fl.last_rendered_frame(), 1);

        fl.invalidate(10.0);
        fl.invalidate(20.0);
        assert_eq!(fl.current_frame(), 3);
    }
}
