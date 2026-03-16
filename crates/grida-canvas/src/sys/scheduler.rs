#[cfg(not(target_arch = "wasm32"))]
use std::collections::VecDeque;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;
use std::time::Duration;

/// A module that controls frame pacing using target and max FPS limits,
/// while maintaining frame duration statistics for FPS estimation.
/// In WASM, the pacing logic is a no-op and the browser controls timing.
pub struct FrameScheduler {
    #[cfg(not(target_arch = "wasm32"))]
    last_frame_time: Instant,
    target_frame_time: Duration,
    max_frame_time: Option<Duration>,
    #[cfg(not(target_arch = "wasm32"))]
    frame_durations: VecDeque<Duration>,
    #[cfg(not(target_arch = "wasm32"))]
    max_samples: usize,
}

impl FrameScheduler {
    /// Creates a new scheduler with a given target FPS and rolling sample size.
    pub fn new(target_fps: u32) -> Self {
        Self {
            #[cfg(not(target_arch = "wasm32"))]
            last_frame_time: Instant::now(),
            target_frame_time: Duration::from_micros(1_000_000 / target_fps as u64),
            max_frame_time: None,
            #[cfg(not(target_arch = "wasm32"))]
            frame_durations: VecDeque::with_capacity(60),
            #[cfg(not(target_arch = "wasm32"))]
            max_samples: 60,
        }
    }

    /// Sets a maximum FPS cap to prevent over-drawing on high-refresh displays.
    pub fn with_max_fps(mut self, max_fps: u32) -> Self {
        self.max_frame_time = Some(Duration::from_micros(1_000_000 / max_fps as u64));
        self
    }

    /// Disable frame pacing entirely (uncapped FPS).
    /// Useful for benchmarking raw render throughput.
    pub fn with_no_limit(mut self) -> Self {
        self.target_frame_time = Duration::ZERO;
        self.max_frame_time = None;
        self
    }

    /// Records the most recent frame duration for smoothing.
    #[cfg(not(target_arch = "wasm32"))]
    fn record_frame_duration(&mut self, duration: Duration) {
        if self.frame_durations.len() == self.max_samples {
            self.frame_durations.pop_front();
        }
        self.frame_durations.push_back(duration);
    }

    /// Returns the average FPS based on the last N recorded frames.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn average_fps(&self) -> f32 {
        if self.frame_durations.is_empty() {
            return 0.0;
        }

        let total: Duration = self.frame_durations.iter().copied().sum();
        let avg = total / self.frame_durations.len() as u32;
        1_000_000.0 / avg.as_micros() as f32
    }

    /// In WASM, the browser controls frame rate; no frame duration tracking.
    #[cfg(target_arch = "wasm32")]
    pub fn average_fps(&self) -> f32 {
        0.0
    }

    /// No-op in WASM; browser controls frame rate via rAF.
    #[cfg(target_arch = "wasm32")]
    pub fn sleep_to_maintain_fps(&mut self) {
        // no-op
    }

    /// For native platforms, enforces frame pacing and tracks durations.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn sleep_to_maintain_fps(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_frame_time);

        let target = match self.max_frame_time {
            Some(max_time) => self.target_frame_time.max(max_time),
            None => self.target_frame_time,
        };

        if elapsed < target {
            std::thread::sleep(target - elapsed);
        }

        let end = Instant::now();
        let frame_duration = end.duration_since(self.last_frame_time);
        self.record_frame_duration(frame_duration);
        self.last_frame_time = end;
    }

    /// Returns the configured target frame time.
    pub fn get_target_frame_time(&self) -> Duration {
        self.target_frame_time
    }

    /// Returns the configured maximum frame time, if any.
    pub fn get_max_frame_time(&self) -> Option<Duration> {
        self.max_frame_time
    }
}
