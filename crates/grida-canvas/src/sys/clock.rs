use std::time::Duration;

pub trait Ticker {
    fn tick(&mut self, time: f64);
    fn now(&self) -> f64;
    fn hz(&self) -> f64;
    fn delta(&self) -> Duration;
    fn elapsed(&self) -> Duration;
}

/// A single-threaded clock designed for event loop integration.
///
/// The `EventLoopClock` is designed to be bound to external event loops (e.g., VSync,
/// redraw requests, or other periodic events) rather than running its own timing loop.
/// It provides high-resolution timing suitable for up to 144Hz refresh rates while
/// maintaining predictable behavior within the constraints of the bound event loop.
///
/// # Purpose
///
/// This clock is specifically designed for scenarios where:
/// - You need to track time progression within an existing event loop
/// - The loop frequency is reasonably predictable (e.g., 60Hz, 120Hz, 144Hz)
/// - You want to measure delta time between frames/events
/// - You need cumulative elapsed time tracking
///
/// # Usage Pattern
///
/// ```rust,ignore
/// use cg::sys::clock::EventLoopClock;
/// let mut clock = EventLoopClock::new();
///
/// // In your event loop (e.g., VSync callback, redraw request, etc.)
/// loop {
///     // `now` should come from a high precision clock (e.g. `performance.now`)
///     let now = performance_now();
///     clock.tick(now); // Called by external event source
///     
///     // Use `clock.delta` for frame-rate independent updates
///     // update_animation(clock.delta);
///     
///     // Use clock.elapsed for absolute time tracking
///     if clock.elapsed.as_secs() > 5 {
///         // Do something after 5 seconds
///     }
/// }
/// ```
///
/// # Limitations and Considerations
///
/// ## Tick Reliability
/// The clock relies on external sources to call `tick()`. There is a chance that:
/// - Certain ticks may be skipped due to system load
/// - Ticks may be delayed beyond the expected interval
/// - The event loop may pause or suspend (e.g., tab switching, system sleep)
///
/// The clock handles these scenarios gracefully by measuring actual time differences
/// rather than assuming fixed intervals.
///
/// ## Not Suitable For
/// - **High-frequency physics simulations**: Requires sub-frame precision and CPU clock accuracy
/// - **Real-time systems**: No guarantees about tick timing or frequency
/// - **Precise interval timing**: Use dedicated timing mechanisms for exact intervals
/// - **Multi-threaded scenarios**: This is a single-threaded clock
///
/// ## When to Use Alternatives
/// - For physics engines: Use dedicated physics timers with fixed time steps
/// - For audio timing: Use audio-specific timing mechanisms
/// - For network protocols: Use system time or dedicated network timers
/// - For benchmarking: Use high-resolution performance counters
///
/// # Performance
///
/// The clock uses `std::time::Instant` for high-resolution timing with minimal overhead.
/// Each `tick()` call performs only a few arithmetic operations, making it suitable
/// for high-frequency event loops.
pub struct EventLoopClock {
    last: f64,
    /// Delta time in milliseconds
    pub delta: f64,
    /// Elapsed time in milliseconds
    pub elapsed: f64,
}

impl Ticker for EventLoopClock {
    fn tick(&mut self, time: f64) {
        self.tick(time);
    }

    fn now(&self) -> f64 {
        self.last
    }

    fn hz(&self) -> f64 {
        self.hz()
    }

    fn delta(&self) -> Duration {
        Duration::from_millis(self.delta as u64)
    }

    fn elapsed(&self) -> Duration {
        Duration::from_millis(self.elapsed as u64)
    }
}

impl EventLoopClock {
    /// Creates a new `EventLoopClock` initialized to the current time.
    ///
    /// The clock starts with zero delta and elapsed time, ready to be ticked
    /// by the external event loop.
    pub fn new() -> Self {
        Self {
            last: 0.0,
            delta: 0.0,
            elapsed: 0.0,
        }
    }

    /// Updates the clock with the current time.
    ///
    /// This method should be called by the external event loop (e.g., VSync callback,
    /// redraw request, or other periodic event) to advance the clock. The method:
    ///
    /// - Calculates the time delta since the last tick
    /// - Accumulates the delta into the total elapsed time
    /// - Updates the internal timestamp for the next tick
    ///
    /// # Behavior with Irregular Ticks
    ///
    /// If ticks are delayed or skipped, the delta will reflect the actual time
    /// difference rather than the expected interval. This ensures that animations
    /// and time-based logic remain consistent even with irregular timing.
    ///
    /// # Example Scenarios
    ///
    /// - **Normal operation**: Ticks every ~16.67ms (60Hz) → delta ≈ 16.67ms
    /// - **Frame drop**: Tick delayed by 50ms → delta = 50ms
    /// - **System pause**: Tick after 1 second pause → delta = 1 second
    /// - **High frequency**: Ticks every ~6.94ms (144Hz) → delta ≈ 6.94ms
    pub fn tick(&mut self, time_ms: f64) {
        if self.last == 0.0 {
            self.delta = 0.0;
            self.last = time_ms;
            return;
        }

        self.delta = time_ms - self.last;
        self.elapsed += self.delta;
        self.last = time_ms;
    }

    /// Returns the current time. (within this clock's context)
    ///
    /// This method returns the last tick time, which can be used for absolute time tracking.
    /// It is useful for scenarios where you need to know the exact time of the last tick.
    pub fn now(&self) -> f64 {
        self.last
    }

    /// Returns the vibration rate in Hz.
    ///
    /// This method calculates the frame rate based on the time delta between ticks.
    /// It is useful for monitoring and debugging frame rates in real-time applications.
    pub fn hz(&self) -> f64 {
        if self.delta > 0.0 {
            1000.0 / self.delta
        } else {
            0.0
        }
    }
}
