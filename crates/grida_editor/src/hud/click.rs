//! Multi-click tracking — canvas-tuned window and distance, ported
//! from `@grida/hud`'s `ClickTracker` (250 ms / 5 px; the OS dblclick
//! window is too generous for canvas work).

/// Consecutive-click window in milliseconds.
pub const CLICK_WINDOW_MS: u64 = 250;

/// Maximum screen distance (logical px) between consecutive downs.
pub const CLICK_DISTANCE_PX: f32 = 5.0;

/// Tracks consecutive pointer-downs. The clock is injected (the
/// machine stays deterministic under test).
#[derive(Debug, Default)]
pub(super) struct ClickTracker {
    last_down_ms: Option<u64>,
    last_point: [f32; 2],
    count: u32,
}

impl ClickTracker {
    /// Register a pointer-down; returns the click count this down
    /// belongs to (1 = single, 2 = double, …).
    pub(super) fn register(&mut self, screen: [f32; 2], now_ms: u64) -> u32 {
        let chained = match self.last_down_ms {
            Some(last) => {
                let dx = screen[0] - self.last_point[0];
                let dy = screen[1] - self.last_point[1];
                now_ms.saturating_sub(last) <= CLICK_WINDOW_MS
                    && (dx * dx + dy * dy).sqrt() <= CLICK_DISTANCE_PX
            }
            None => false,
        };
        self.count = if chained { self.count + 1 } else { 1 };
        self.last_down_ms = Some(now_ms);
        self.last_point = screen;
        self.count
    }
}
