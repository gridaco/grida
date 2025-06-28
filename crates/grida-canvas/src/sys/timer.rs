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
/// ```rust,no_run
/// use std::time::Duration;
/// use cg::sys::timer::TimerMgr;
/// use cg::sys::clock::EventLoopClock;
///
/// let mut timer_system = TimerMgr::new();
/// let mut clock = EventLoopClock::new();
///
/// // Create a one-shot timeout
/// let timeout_id = timer_system.set_timeout(Duration::from_secs(5), || {
///     println!("5 seconds have passed!");
/// });
///
/// // Create a debounced function
/// let mut debounced_fn = timer_system.debounce(
///     Duration::from_millis(300),
///     || println!("Debounced operation executed!"),
///     true,
///     true,
/// );
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
type TimerCallback = Box<dyn FnOnce() + 'static>;

/// Callback function for interval execution (can be called multiple times)
type IntervalCallback = Box<dyn Fn() + 'static>;

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
        F: FnOnce() + 'static,
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
        F: Fn() + 'static,
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

    /// Create a debounced function similar to lodash's `debounce`.
    ///
    /// The returned [`Debounce`] can be called with a mutable reference to
    /// this [`TimerMgr`]. Trailing executions are scheduled using the timer
    /// system, so no additional tick logic is required.
    pub fn debounce<F>(
        &mut self,
        wait: Duration,
        callback: F,
        leading: bool,
        trailing: bool,
    ) -> Debounce
    where
        F: FnMut() + 'static,
    {
        let state = DebounceState {
            wait,
            callback: Box::new(callback),
            leading,
            trailing,
            timer_id: None,
            last_call_time: None,
            last_execute_time: None,
        };

        Debounce {
            state: std::sync::Arc::new(std::sync::Mutex::new(state)),
        }
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

/// A debounced function returned by [`TimerMgr::debounce`].
pub struct Debounce {
    state: std::sync::Arc<std::sync::Mutex<DebounceState>>,
}

struct DebounceState {
    wait: Duration,
    callback: Box<dyn FnMut() + 'static>,
    leading: bool,
    trailing: bool,
    timer_id: Option<TimerId>,
    last_call_time: Option<Instant>,
    last_execute_time: Option<Instant>,
}

impl Debounce {
    /// Trigger the debounced function using the provided [`TimerMgr`].
    pub fn call(&mut self, mgr: &mut TimerMgr) {
        let mut state = self.state.lock().unwrap();
        let now = Instant::now();
        let is_first_call = state.last_call_time.is_none();
        let time_since_last_execute = state
            .last_execute_time
            .map(|last| now.duration_since(last))
            .unwrap_or(Duration::from_secs(0));

        state.last_call_time = Some(now);

        if state.leading && (is_first_call || time_since_last_execute >= state.wait) {
            (state.callback)();
            state.last_execute_time = Some(now);
        }

        if state.trailing {
            if let Some(id) = state.timer_id.take() {
                mgr.cancel(id);
            }
            let weak = std::sync::Arc::downgrade(&self.state);
            let wait = state.wait;
            state.timer_id = Some(mgr.set_timeout(wait, move || {
                if let Some(state_rc) = weak.upgrade() {
                    let mut s = state_rc.lock().unwrap();
                    s.timer_id = None;
                    (s.callback)();
                    s.last_execute_time = Some(Instant::now());
                }
            }));
        }
    }

    /// Cancel any pending execution.
    pub fn cancel(&mut self, mgr: &mut TimerMgr) {
        let mut state = self.state.lock().unwrap();
        if let Some(id) = state.timer_id.take() {
            mgr.cancel(id);
        }
        state.last_call_time = None;
        state.last_execute_time = None;
    }

    /// Immediately execute the callback and cancel pending timeouts.
    pub fn flush(&mut self, mgr: &mut TimerMgr) {
        self.cancel(mgr);
        let mut state = self.state.lock().unwrap();
        (state.callback)();
        state.last_execute_time = Some(Instant::now());
    }

    /// Returns `true` if a trailing execution is scheduled.
    pub fn is_pending(&self) -> bool {
        self.state.lock().unwrap().timer_id.is_some()
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
    fn test_debounce() {
        let mut mgr = TimerMgr::new();
        let executed = Arc::new(Mutex::new(0));
        let executed_clone = executed.clone();

        let mut debounced = mgr.debounce(
            Duration::from_millis(50),
            move || {
                *executed_clone.lock().unwrap() += 1;
            },
            true,
            true,
        );

        debounced.call(&mut mgr); // leading
        assert!(debounced.is_pending());

        thread::sleep(Duration::from_millis(60));
        mgr.tick(Instant::now());

        assert_eq!(*executed.lock().unwrap(), 2);
        assert!(!debounced.is_pending());
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
