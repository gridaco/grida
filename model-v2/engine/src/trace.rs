//! ENG S-6 · feature-gated observability. With the `trace` feature off,
//! [`t_span!`] expands to the bare block and [`t_count!`] to nothing —
//! zero cost, so the profiler can never distort the profile (the legacy
//! loop measured exactly this trap: devtools cost-prediction polluted
//! plan build until it was gated). With `trace` on, spans accumulate
//! into a thread-local [`sink`] the host or gate drains per frame.
//!
//! Instrument only the three frame seams (resolve / build / execute) —
//! more is noise. The on/off delta is a one-time documented measurement,
//! not a per-frame check.

#[cfg(feature = "trace")]
pub mod sink {
    use std::cell::RefCell;

    thread_local! {
        static FRAME: RefCell<Vec<(&'static str, u128)>> = const { RefCell::new(Vec::new()) };
    }

    /// Record a span sample (nanoseconds) under `name`.
    pub fn record(name: &'static str, nanos: u128) {
        FRAME.with(|f| f.borrow_mut().push((name, nanos)));
    }

    /// Take and clear this thread's accumulated spans.
    pub fn drain() -> Vec<(&'static str, u128)> {
        FRAME.with(|f| f.borrow_mut().drain(..).collect())
    }
}

/// Time `$body` under `$name`. Off: just the block. On: the block, plus a
/// sample into the thread-local sink. Value-transparent either way.
#[macro_export]
macro_rules! t_span {
    ($name:expr, $body:block) => {{
        #[cfg(feature = "trace")]
        {
            let __t0 = std::time::Instant::now();
            let __r = $body;
            $crate::trace::sink::record($name, __t0.elapsed().as_nanos());
            __r
        }
        #[cfg(not(feature = "trace"))]
        {
            $body
        }
    }};
}

/// Count an event under `$name`. Off: nothing. On: one nanosecond-free
/// sample (count lives in the same sink as a zero-duration marker).
#[macro_export]
macro_rules! t_count {
    ($name:expr) => {{
        #[cfg(feature = "trace")]
        {
            $crate::trace::sink::record($name, 0);
        }
    }};
}
