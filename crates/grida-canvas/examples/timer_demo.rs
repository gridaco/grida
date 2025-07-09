use cg::sys::clock::EventLoopClock;
use cg::sys::timer::TimerMgr;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

fn main() {
    println!("🕐 Timer System Demo");
    println!("===================");

    // Example 1: Basic Timer System
    println!("\n1. Basic Timer System Demo:");
    basic_timer_demo();

    // Example 2: Debouncer Demo
    println!("\n2. Debouncer Demo:");
    debouncer_demo();

    // Example 3: Application Integration Demo
    println!("\n3. Application Integration Demo:");
    application_integration_demo();
}

fn basic_timer_demo() {
    let mut timer_system = TimerMgr::new();
    let mut clock = EventLoopClock::new();
    let start_time = std::time::Instant::now();

    let counter = Arc::new(Mutex::new(0));
    let counter_clone = counter.clone();

    // Set a timeout that fires after 1 second
    let timeout_id = timer_system.set_timeout(Duration::from_millis(1000), move || {
        println!(
            "   ⏰ Timeout fired! Counter: {}",
            *counter_clone.lock().unwrap()
        );
    });

    // Set an interval that fires every 500ms
    let interval_counter = Arc::new(Mutex::new(0));
    let interval_counter_clone = interval_counter.clone();

    let interval_id = timer_system.set_interval(Duration::from_millis(500), move || {
        let mut count = interval_counter_clone.lock().unwrap();
        *count += 1;
        println!("   🔄 Interval fired! Count: {}", *count);

        // Stop after 5 intervals
        if *count >= 5 {
            println!("   🛑 Interval limit reached, stopping...");
        }
    });

    // Simulate the event loop for 3 seconds
    let start_time = std::time::Instant::now();
    while start_time.elapsed() < Duration::from_secs(3) {
        let now = start_time.elapsed().as_secs_f64() * 1000.0;
        clock.tick(now);
        timer_system.tick(clock.now());

        // Simulate some work
        thread::sleep(Duration::from_millis(16)); // ~60 FPS
    }

    // Cancel remaining timers
    timer_system.cancel(timeout_id);
    timer_system.cancel(interval_id);

    println!("   ✅ Timer demo completed");
}

fn debouncer_demo() {
    let mut timer_system = TimerMgr::new();
    let mut debouncer = timer_system.debounce(
        Duration::from_millis(300),
        || println!("   🎯 Debounced operation executed!"),
        true,
        true,
    );
    let mut clock = EventLoopClock::new();
    let start_time = std::time::Instant::now();

    println!("   Testing debouncer with leading=true, trailing=true");
    println!("   Triggering debounced operation multiple times...");

    // Simulate rapid-fire triggers
    for i in 0..5 {
        println!("   Call {}: ", i);
        debouncer.call(&mut timer_system, clock.now()); // leading on first call

        // Simulate time passing
        thread::sleep(Duration::from_millis(50));
        let now = start_time.elapsed().as_secs_f64() * 1000.0;
        clock.tick(now);
        timer_system.tick(clock.now());
    }

    // Wait for the debounce to expire
    println!("   Waiting for final trailing execution...");
    thread::sleep(Duration::from_millis(350));
    let now = start_time.elapsed().as_secs_f64() * 1000.0;
    clock.tick(now);

    timer_system.tick(clock.now());

    println!("   🎯 Final trailing execution!");

    println!("   ✅ Debouncer demo completed");

    // Test different configurations
    println!("\n   Testing leading=false, trailing=true:");
    let mut debouncer2 = timer_system.debounce(
        Duration::from_millis(200),
        || println!("   🎯 Trailing-only debounced operation!"),
        false,
        true,
    );

    for i in 0..3 {
        println!("   Call {}: ", i);
        debouncer2.call(&mut timer_system, clock.now()); // no immediate execution

        thread::sleep(Duration::from_millis(50));
        let now = start_time.elapsed().as_secs_f64() * 1000.0;
        clock.tick(now);
        timer_system.tick(clock.now());
    }

    // Wait for trailing execution
    thread::sleep(Duration::from_millis(250));
    let now = start_time.elapsed().as_secs_f64() * 1000.0;
    clock.tick(now);
    timer_system.tick(clock.now());
    println!("   ✅ Trailing-only execution completed!");
}

fn application_integration_demo() {
    // This demonstrates how the timer system would be used in a real application
    let mut timer_system = TimerMgr::new();
    let mut clock = EventLoopClock::new();

    let state = Arc::new(Mutex::new("idle".to_string()));
    let state_clone = state.clone();

    // Simulate a user action that triggers a save operation after a delay
    let _save_id = timer_system.set_timeout(Duration::from_millis(500), move || {
        println!("   💾 Auto-saving document...");
        let mut state = state_clone.lock().unwrap();
        *state = "saved".to_string();
    });

    // Simulate user typing (rapid triggers)
    println!("   Simulating user typing (save will happen after 500ms)...");
    let start_time = std::time::Instant::now();
    for i in 0..5 {
        println!("   User types character {}", i);
        thread::sleep(Duration::from_millis(100));
        let now = start_time.elapsed().as_secs_f64() * 1000.0;
        clock.tick(now);
        timer_system.tick(clock.now());
    }

    // Wait for the save to execute
    println!("   Waiting for save to execute...");
    thread::sleep(Duration::from_millis(600));
    let now = start_time.elapsed().as_secs_f64() * 1000.0;
    clock.tick(now);
    timer_system.tick(clock.now());

    // Check final state
    let final_state = state.lock().unwrap();
    println!("   Final state: {}", *final_state);

    // Set up a periodic health check
    let health_check_id = timer_system.set_interval(Duration::from_millis(1000), || {
        println!("   🏥 Health check: Application running normally");
    });

    // Run for a few seconds
    let start_time2 = std::time::Instant::now();
    while start_time2.elapsed() < Duration::from_secs(2) {
        let now = start_time2.elapsed().as_secs_f64() * 1000.0;
        clock.tick(now);
        timer_system.tick(clock.now());
        thread::sleep(Duration::from_millis(16));
    }

    // Clean up
    timer_system.cancel(health_check_id);
    println!("   ✅ Application integration demo completed");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_timer_system_basic() {
        let mut timer_system = TimerMgr::new();
        let mut clock = EventLoopClock::new();

        let counter = Arc::new(Mutex::new(0));
        let counter_clone = counter.clone();

        timer_system.set_timeout(Duration::from_millis(10), move || {
            *counter_clone.lock().unwrap() += 1;
        });

        let start = std::time::Instant::now();
        thread::sleep(Duration::from_millis(20));
        let now = start.elapsed().as_secs_f64() * 1000.0;
        clock.tick(now);
        timer_system.tick(clock.now());

        assert_eq!(*counter.lock().unwrap(), 1);
    }

    #[test]
    fn test_debouncer_basic() {
        let mut mgr = TimerMgr::new();
        let hits = Arc::new(Mutex::new(0));
        let hits_clone = hits.clone();

        let mut debounced = mgr.debounce(
            Duration::from_millis(50),
            move || {
                *hits_clone.lock().unwrap() += 1;
            },
            true,
            true,
        );

        debounced.call(&mut mgr, 0.0);
        assert!(debounced.is_pending());

        let start = std::time::Instant::now();
        thread::sleep(Duration::from_millis(60));
        mgr.tick(start.elapsed().as_secs_f64() * 1000.0);

        assert_eq!(*hits.lock().unwrap(), 2);
        assert!(!debounced.is_pending());
    }
}
