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
    /// Base debounce threshold in milliseconds before stable frame fires.
    stable_delay_ms: f64,
    /// True after an unstable render, until a stable render completes.
    needs_stable: bool,
    /// Smoothed input interval (EMA, milliseconds) for adaptive stable delay.
    ///
    /// During slow trackpad scrolling, events arrive at 60-120ms intervals —
    /// longer than the base 50ms stable delay. Without adaptation, every gap
    /// triggers a stable frame that nukes the pan cache and forces a full
    /// redraw. By tracking the input cadence, `poll()` extends the effective
    /// delay to `max(base, cadence * CADENCE_MULTIPLIER)`, ensuring stable
    /// frames only fire when the user truly stops interacting.
    input_cadence_ms: f64,
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

    /// Multiplier applied to the smoothed input cadence.
    ///
    /// Effective stable delay = max(base_delay, cadence × multiplier).
    /// At 2.5×, an 80ms trackpad cadence yields a 200ms effective delay,
    /// comfortably above the 80ms inter-event gap.
    const CADENCE_MULTIPLIER: f64 = 2.5;

    /// Intervals longer than this (ms) are treated as session breaks and
    /// do not update the cadence EMA.
    const CADENCE_MAX_INTERVAL: f64 = 500.0;

    /// EMA smoothing factor for input cadence (0 < α ≤ 1).
    /// Lower values = more smoothing, slower to react.
    const CADENCE_ALPHA: f64 = 0.3;

    /// Create a new `FrameLoop` with the default stable delay.
    pub fn new() -> Self {
        Self::with_stable_delay(Self::DEFAULT_STABLE_DELAY_MS)
    }

    /// Create a new `FrameLoop` with a custom stable delay.
    pub fn with_stable_delay(stable_delay_ms: f64) -> Self {
        Self {
            prev_frame: 0,
            next_frame: 0,
            last_change_time: f64::NAN, // NAN = no prior invalidation
            stable_delay_ms,
            needs_stable: false,
            input_cadence_ms: 0.0,
        }
    }

    /// Something changed. Bumps `next_frame`, records timestamp, updates
    /// the input cadence EMA, and sets `needs_stable = true`. O(1).
    pub fn invalidate(&mut self, now: f64) {
        // Update cadence EMA from the interval since the last invalidation.
        if self.last_change_time.is_finite() {
            let interval = now - self.last_change_time;
            if interval > 0.0 && interval < Self::CADENCE_MAX_INTERVAL {
                if self.input_cadence_ms == 0.0 {
                    // First sample — seed the EMA.
                    self.input_cadence_ms = interval;
                } else {
                    self.input_cadence_ms = self.input_cadence_ms * (1.0 - Self::CADENCE_ALPHA)
                        + interval * Self::CADENCE_ALPHA;
                }
            } else if interval >= Self::CADENCE_MAX_INTERVAL {
                // Session break — reset cadence for the new interaction.
                self.input_cadence_ms = 0.0;
            }
        }

        self.next_frame = self.next_frame.wrapping_add(1);
        self.last_change_time = now;
        self.needs_stable = true;
    }

    /// Effective stable delay, accounting for input cadence.
    ///
    /// Returns `max(base_delay, cadence × CADENCE_MULTIPLIER)`.
    fn effective_stable_delay(&self) -> f64 {
        if self.input_cadence_ms > 0.0 {
            self.stable_delay_ms
                .max(self.input_cadence_ms * Self::CADENCE_MULTIPLIER)
        } else {
            self.stable_delay_ms
        }
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
            if elapsed >= self.effective_stable_delay() {
                return Some(FrameQuality::Stable);
            }
        }

        None
    }

    /// Mark frame as rendered. If `Stable`, clears `needs_stable` and
    /// resets the input cadence for the next interaction session.
    /// If `Unstable`, keeps `needs_stable = true` so `poll()` will
    /// return `Stable` once the debounce expires.
    pub fn complete(&mut self, quality: FrameQuality) {
        self.prev_frame = self.next_frame;
        match quality {
            FrameQuality::Stable => {
                self.needs_stable = false;
                // Do NOT reset cadence or last_change_time here.
                // The user may still be interacting (slow trackpad).
                // Cadence resets naturally in invalidate() when the
                // interval exceeds CADENCE_MAX_INTERVAL (session break).
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

        // New invalidation at 145ms resets the debounce.
        // Cadence becomes 45ms → effective delay = max(50, 45×2.5) = 112.5ms.
        fl.invalidate(145.0);
        assert_eq!(fl.poll(145.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // Old debounce (150ms) shouldn't fire stable
        assert_eq!(fl.poll(155.0), None);

        // Base debounce (195ms) not enough — cadence pushes it to 257.5ms
        assert_eq!(fl.poll(195.0), None);

        // Adaptive debounce: 145 + 112.5 = 257.5ms
        assert_eq!(fl.poll(258.0), Some(FrameQuality::Stable));
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

    #[test]
    fn adaptive_delay_slow_cadence() {
        // Simulate slow trackpad scrolling at 80ms intervals.
        // The adaptive delay should prevent stable frames from firing
        // between scroll events.
        let mut fl = FrameLoop::new();

        // First scroll event
        fl.invalidate(0.0);
        assert_eq!(fl.poll(0.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // Second scroll event at 80ms — cadence seeds to 80ms.
        // Effective delay = max(50, 80×2.5) = 200ms.
        fl.invalidate(80.0);
        assert_eq!(fl.poll(80.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // 50ms after last event — base delay expired but adaptive delay
        // keeps us idle. No stable frame intrusion!
        assert_eq!(fl.poll(130.0), None);

        // Third scroll event at 160ms — cadence stays ~80ms.
        fl.invalidate(160.0);
        assert_eq!(fl.poll(160.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // Still no stable frame between events
        assert_eq!(fl.poll(210.0), None);

        // User stops scrolling. Stable fires after adaptive delay.
        // Cadence ≈ 80ms, effective delay ≈ 200ms.
        // Last event at 160ms → stable at ~360ms.
        assert_eq!(fl.poll(350.0), None);
        assert_eq!(fl.poll(361.0), Some(FrameQuality::Stable));
        fl.complete(FrameQuality::Stable);

        assert!(fl.is_idle());
    }

    #[test]
    fn cadence_persists_across_stable() {
        let mut fl = FrameLoop::new();

        // Build up a slow cadence (80ms)
        fl.invalidate(0.0);
        fl.complete(FrameQuality::Unstable);
        fl.invalidate(80.0);
        fl.complete(FrameQuality::Unstable);

        // Let stable fire — cadence persists (interaction might continue).
        assert_eq!(fl.poll(280.0), Some(FrameQuality::Stable));
        fl.complete(FrameQuality::Stable);

        // Interaction continues soon after. The interval 300-80=220ms
        // blends with the old cadence 80ms → EMA ≈ 122ms.
        // Effective delay = max(50, 122×2.5) = 305ms.
        fl.invalidate(300.0);
        assert_eq!(fl.poll(300.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // 50ms later: base delay expired but cadence keeps us idle
        assert_eq!(fl.poll(350.0), None);
        // 200ms later: still within 305ms effective delay
        assert_eq!(fl.poll(500.0), None);
        // After effective delay: 300 + 305 = 605ms
        assert_eq!(fl.poll(606.0), Some(FrameQuality::Stable));
        fl.complete(FrameQuality::Stable);
    }

    #[test]
    fn cadence_resets_on_session_break() {
        let mut fl = FrameLoop::new();

        // Build up cadence
        fl.invalidate(0.0);
        fl.complete(FrameQuality::Unstable);
        fl.invalidate(80.0);
        fl.complete(FrameQuality::Unstable);

        // Let stable fire
        assert_eq!(fl.poll(280.0), Some(FrameQuality::Stable));
        fl.complete(FrameQuality::Stable);

        // Long pause (>500ms) — session break resets cadence.
        fl.invalidate(900.0); // 900 - 80 = 820ms > 500ms → cadence resets to 0
        assert_eq!(fl.poll(900.0), Some(FrameQuality::Unstable));
        fl.complete(FrameQuality::Unstable);

        // Now cadence=0, so base delay (50ms) applies.
        assert_eq!(fl.poll(950.0), Some(FrameQuality::Stable));
    }

    #[test]
    fn adaptive_delay_fast_cadence_uses_base() {
        // Fast input (16ms, typical 60fps mouse) — cadence × 2.5 = 40ms < base 50ms.
        // The base delay should be used.
        let mut fl = FrameLoop::new();

        fl.invalidate(0.0);
        fl.complete(FrameQuality::Unstable);
        fl.invalidate(16.0);
        fl.complete(FrameQuality::Unstable);
        fl.invalidate(32.0);
        fl.complete(FrameQuality::Unstable);

        // Base delay applies: 32 + 50 = 82ms
        assert_eq!(fl.poll(81.0), None);
        assert_eq!(fl.poll(82.0), Some(FrameQuality::Stable));
    }
}
