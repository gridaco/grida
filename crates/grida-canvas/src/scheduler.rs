use std::time::{Duration, Instant};

/// A module that controls frame pacing using target and max FPS limits.
/// In native builds, it will sleep to prevent the loop from running too fast.
/// In WebAssembly (wasm32), the sleep function is a no-op since sleeping on the main thread is not possible.
pub struct FrameScheduler {
    last_frame_time: Instant,
    target_frame_time: Duration,
    max_frame_time: Option<Duration>, // Optional hard cap to prevent over-drawing
}

impl FrameScheduler {
    /// Creates a new scheduler with a given target FPS.
    pub fn new(target_fps: u32) -> Self {
        Self {
            last_frame_time: Instant::now(),
            target_frame_time: Duration::from_micros(1_000_000 / target_fps as u64),
            max_frame_time: None,
        }
    }

    /// Optionally set a maximum FPS to avoid excessive rendering on high-refresh devices.
    pub fn with_max_fps(mut self, max_fps: u32) -> Self {
        self.max_frame_time = Some(Duration::from_micros(1_000_000 / max_fps as u64));
        self
    }

    /// No-op implementation for WASM — the browser handles frame pacing via requestAnimationFrame.
    #[cfg(target_arch = "wasm32")]
    fn sleep_to_maintain_fps(&mut self) {
        // No-op in WASM
    }

    /// For native platforms, this function ensures that the frame loop does not run faster
    /// than the target or max FPS by sleeping the remaining time, if any.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn sleep_to_maintain_fps(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_frame_time);

        // If max_frame_time is set, take the slower of the two
        let target = match self.max_frame_time {
            Some(max_time) => self.target_frame_time.max(max_time),
            None => self.target_frame_time,
        };

        if elapsed < target {
            std::thread::sleep(target - elapsed);
        }

        self.last_frame_time = Instant::now();
    }

    pub fn get_target_frame_time(&self) -> Duration {
        self.target_frame_time
    }

    pub fn get_max_frame_time(&self) -> Option<Duration> {
        self.max_frame_time
    }
}
