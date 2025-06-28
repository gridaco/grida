use std::collections::HashMap;
use std::time::{Duration, Instant};

/// A timer system for managing time-sensitive operations within the application.
///
/// The timer system is designed to work with the existing `EventLoopClock` and provides
/// functionality for:
/// - One-shot timeouts with callbacks
/// - Repeating timers
/// - Debounced operations
/// - Delayed execution
///
/// # Usage
///
/// ```rust
/// use std::time::Duration;
/// use crate::sys::timer::TimerMgr;
///
/// let mut timer_system = TimerMgr::new();
/// let clock = EventLoopClock::new();
///
/// // Create a one-shot timeout
/// let timeout_id = timer_system.set_timeout(Duration::from_secs(5), || {
///     println!("5 seconds have passed!");
/// });
///
/// // Create a debounced function
/// let debounced_fn = timer_system.debounce(Duration::from_millis(300), || {
///     println!("Debounced operation executed!");
/// });
///
/// // In your main loop
/// loop {
///     clock.tick();
///     timer_system.tick(clock.now());
/// }
/// ```
pub struct TimerMgr {
    timers: HashMap<TimerId, Timer>,
    next_id: u64,
}

/// Unique identifier for a timer
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TimerId(u64);

/// Represents a single timer with its configuration
struct Timer {
    timer_type: TimerType,
    deadline: Instant,
    interval: Option<Duration>,
    callback: Option<TimerCallback>,
    interval_callback: Option<IntervalCallback>,
    active: bool,
}

/// Different types of timers
#[derive(PartialEq, Debug)]
enum TimerType {
    /// One-shot timeout
    Timeout,
    /// Repeating timer
    Interval,
}

/// Callback function for timer execution
type TimerCallback = Box<dyn FnOnce() + Send + 'static>;

/// Callback function for interval execution (can be called multiple times)
type IntervalCallback = Box<dyn Fn() + Send + 'static>;

impl TimerMgr {
    /// Creates a new timer system
    pub fn new() -> Self {
        Self {
            timers: HashMap::new(),
            next_id: 1,
        }
    }

    /// Advances the timer system by one tick, executing any expired timers
    ///
    /// This should be called regularly (e.g., in your main event loop) with
    /// the current time from your clock system.
    pub fn tick(&mut self, now: Instant) {
        let mut expired_timers = Vec::new();

        // Collect expired timers
        for (id, timer) in &mut self.timers {
            if timer.active && now >= timer.deadline {
                println!("Timer expired: {:?}, type: {:?}", id, timer.timer_type);
                expired_timers.push(*id);
            }
        }

        // Execute expired timers
        for id in expired_timers {
            if let Some(timer) = self.timers.get_mut(&id) {
                if timer.active {
                    // Execute the callback if it exists
                    if let Some(callback) = timer.callback.take() {
                        callback();
                    }

                    // Execute interval callback if it exists
                    if let Some(interval_callback) = &timer.interval_callback {
                        interval_callback();
                    }

                    match timer.timer_type {
                        TimerType::Timeout => {
                            // One-shot timer, remove it
                            timer.active = false;
                        }
                        TimerType::Interval => {
                            // Repeating timer, schedule next execution
                            if let Some(interval) = timer.interval {
                                timer.deadline += interval;
                                println!(
                                    "Rescheduled interval for {:?} at {:?}",
                                    id, timer.deadline
                                );
                                // The interval callback can be called again
                            }
                        }
                    }
                }
            }
        }

        // Clean up inactive timers
        self.timers.retain(|_, timer| timer.active);
    }

    /// Sets a one-shot timeout that will execute the callback after the specified duration
    ///
    /// Returns a `TimerId` that can be used to cancel the timeout
    pub fn set_timeout<F>(&mut self, duration: Duration, callback: F) -> TimerId
    where
        F: FnOnce() + Send + 'static,
    {
        let id = self.next_timer_id();
        let deadline = Instant::now() + duration;

        let timer = Timer {
            timer_type: TimerType::Timeout,
            deadline,
            interval: None,
            callback: Some(Box::new(callback)),
            interval_callback: None,
            active: true,
        };

        self.timers.insert(id, timer);
        id
    }

    /// Sets a repeating timer that will execute the callback at regular intervals
    ///
    /// Returns a `TimerId` that can be used to cancel the interval
    pub fn set_interval<F>(&mut self, interval: Duration, callback: F) -> TimerId
    where
        F: Fn() + Send + 'static,
    {
        let id = self.next_timer_id();
        let deadline = Instant::now() + interval;

        let timer = Timer {
            timer_type: TimerType::Interval,
            deadline,
            interval: Some(interval),
            callback: None,
            interval_callback: Some(Box::new(callback)),
            active: true,
        };

        self.timers.insert(id, timer);
        id
    }

    /// Cancels a timer by its ID
    ///
    /// Returns `true` if the timer was found and cancelled, `false` otherwise
    pub fn cancel(&mut self, id: TimerId) -> bool {
        if let Some(timer) = self.timers.get_mut(&id) {
            timer.active = false;
            true
        } else {
            false
        }
    }

    /// Clears all active timers
    pub fn clear_all(&mut self) {
        for timer in self.timers.values_mut() {
            timer.active = false;
        }
        self.timers.clear();
    }

    /// Returns the number of active timers
    pub fn active_count(&self) -> usize {
        self.timers.values().filter(|timer| timer.active).count()
    }

    /// Returns `true` if there are any active timers
    pub fn has_active_timers(&self) -> bool {
        self.timers.values().any(|timer| timer.active)
    }

    // Private helper methods

    fn next_timer_id(&mut self) -> TimerId {
        let id = TimerId(self.next_id);
        self.next_id += 1;
        id
    }
}

impl Default for TimerMgr {
    fn default() -> Self {
        Self::new()
    }
}

/// A proper debouncer that supports leading and trailing execution
///
/// This implements a debounce function similar to lodash's debounce with support for:
/// - `leading`: Execute on the leading edge (first call)
/// - `trailing`: Execute on the trailing edge (after wait period)
/// - Both leading and trailing can be enabled/disabled independently
///
/// # Usage
///
/// ```rust
/// use std::time::Duration;
/// use crate::sys::timer::Debouncer;
///
/// let mut debouncer = Debouncer::new(
///     Duration::from_millis(300),
///     || println!("Debounced!"),
///     true,  // leading
///     true   // trailing
/// );
///
/// // Call multiple times rapidly
/// debouncer.call(); // Executes immediately (leading)
/// debouncer.call(); // Delayed
/// debouncer.call(); // Delayed
/// // After 300ms, executes again (trailing)
/// ```
pub struct Debouncer {
    wait: Duration,
    callback: Box<dyn Fn() + Send + 'static>,
    leading: bool,
    trailing: bool,
    timeout_deadline: Option<Instant>,
    last_call_time: Option<Instant>,
    last_execute_time: Option<Instant>,
}

impl Debouncer {
    /// Creates a new debouncer with the specified configuration
    ///
    /// # Arguments
    /// * `wait` - The number of milliseconds to delay
    /// * `callback` - The function to debounce
    /// * `leading` - Specify invoking on the leading edge of the timeout
    /// * `trailing` - Specify invoking on the trailing edge of the timeout
    pub fn new<F>(wait: Duration, callback: F, leading: bool, trailing: bool) -> Self
    where
        F: Fn() + Send + 'static,
    {
        Self {
            wait,
            callback: Box::new(callback),
            leading,
            trailing,
            timeout_deadline: None,
            last_call_time: None,
            last_execute_time: None,
        }
    }

    /// Calls the debounced function
    ///
    /// This method should be called whenever you want to trigger the debounced function.
    /// The actual execution depends on the leading/trailing configuration.
    pub fn call(&mut self) {
        let now = Instant::now();
        let is_first_call = self.last_call_time.is_none();
        let time_since_last_execute = self
            .last_execute_time
            .map(|last| now.duration_since(last))
            .unwrap_or(Duration::from_secs(0));

        self.last_call_time = Some(now);

        // Execute on leading edge
        if self.leading && (is_first_call || time_since_last_execute >= self.wait) {
            self.execute();
        }

        // Set up trailing execution
        if self.trailing {
            self.timeout_deadline = Some(now + self.wait);
        }
    }

    /// Checks if the debouncer should execute on trailing edge
    ///
    /// This should be called regularly in your main loop to check if the trailing
    /// execution should happen
    pub fn tick(&mut self, now: Instant) -> bool {
        if let Some(deadline) = self.timeout_deadline {
            if now >= deadline {
                self.timeout_deadline = None;
                if self.trailing {
                    self.execute();
                    return true;
                }
            }
        }
        false
    }

    /// Cancels the debounced function call
    pub fn cancel(&mut self) {
        self.timeout_deadline = None;
        self.last_call_time = None;
        self.last_execute_time = None;
    }

    /// Immediately executes the debounced function and cancels any pending execution
    pub fn flush(&mut self) {
        self.timeout_deadline = None;
        self.execute();
    }

    /// Checks if the debouncer is currently waiting (has a pending timeout)
    pub fn is_pending(&self) -> bool {
        self.timeout_deadline.is_some()
    }

    // Private helper methods

    fn execute(&mut self) {
        self.last_execute_time = Some(Instant::now());
        (self.callback)();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use std::thread;

    #[test]
    fn test_timeout() {
        let mut timer_system = TimerMgr::new();
        let counter = Arc::new(Mutex::new(0));
        let counter_clone = counter.clone();

        timer_system.set_timeout(Duration::from_millis(10), move || {
            *counter_clone.lock().unwrap() += 1;
        });

        // Wait for timeout to expire
        thread::sleep(Duration::from_millis(20));
        timer_system.tick(Instant::now());

        assert_eq!(*counter.lock().unwrap(), 1);
    }

    #[test]
    fn test_interval() {
        let mut timer_system = TimerMgr::new();
        let counter = Arc::new(Mutex::new(0));
        let counter_clone = counter.clone();

        println!("Setting up interval...");
        timer_system.set_interval(Duration::from_millis(10), move || {
            println!("Interval callback executed!");
            *counter_clone.lock().unwrap() += 1;
        });

        // Wait for multiple intervals
        println!("Waiting 35ms for intervals...");
        thread::sleep(Duration::from_millis(35));

        // Tick multiple times to simulate regular updates
        for i in 0..5 {
            println!("Tick {}", i);
            timer_system.tick(Instant::now());
            thread::sleep(Duration::from_millis(1));
        }

        let count = *counter.lock().unwrap();
        println!("Final count: {}", count);
        assert!(count >= 2, "Expected at least 2 intervals, got {}", count);
    }

    #[test]
    fn test_debouncer() {
        let mut debouncer = Debouncer::new(
            Duration::from_millis(50),
            || println!("Debounced!"),
            true,
            true,
        );

        // First call should execute immediately (leading)
        debouncer.call();
        assert!(debouncer.is_pending());

        // Wait for debounce to expire
        thread::sleep(Duration::from_millis(60));

        // Tick to check for trailing execution
        let executed = debouncer.tick(Instant::now());
        assert!(executed);
        assert!(!debouncer.is_pending());
    }

    #[test]
    fn test_cancel_timer() {
        let mut timer_system = TimerMgr::new();
        let counter = Arc::new(Mutex::new(0));
        let counter_clone = counter.clone();

        let id = timer_system.set_timeout(Duration::from_millis(100), move || {
            *counter_clone.lock().unwrap() += 1;
        });

        // Cancel the timer
        assert!(timer_system.cancel(id));

        // Wait and tick - should not execute
        thread::sleep(Duration::from_millis(120));
        timer_system.tick(Instant::now());

        assert_eq!(*counter.lock().unwrap(), 0);
    }
}
