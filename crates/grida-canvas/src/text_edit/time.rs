//! Platform-agnostic time primitives.
//!
//! On native targets, [`Instant`] and [`Duration`] are thin wrappers around
//! their `std::time` counterparts — zero overhead.
//!
//! On `wasm32` targets (emscripten, unknown-unknown, wasi), `std::time::Instant`
//! is either unavailable or panics at runtime.  This module provides a
//! **tick-based** [`Instant`] instead: a monotonic counter that the host
//! advances by calling [`Instant::advance`] once per frame or event loop
//! iteration.  [`Duration`] is always `core::time::Duration`.
//!
//! # Wasm32 usage
//!
//! ```ignore
//! // In your event loop / requestAnimationFrame callback:
//! cg::text_edit::time::Instant::advance(frame_dt);
//! ```
//!
//! Where `frame_dt` is a `Duration` obtained from `performance.now()` or
//! similar.  All internal elapsed-time checks (history merge timeout,
//! cursor blink) then work transparently.

// ---------------------------------------------------------------------------
// Duration — always core::time::Duration
// ---------------------------------------------------------------------------

pub use core::time::Duration;

// ---------------------------------------------------------------------------
// Native Instant (non-wasm32)
// ---------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
mod imp {
    use core::time::Duration;

    /// A monotonic timestamp.  On native this is `std::time::Instant`.
    #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct Instant(std::time::Instant);

    impl Instant {
        /// Capture the current moment.
        #[inline]
        pub fn now() -> Self {
            Self(std::time::Instant::now())
        }

        /// Duration elapsed since `self`.
        #[inline]
        pub fn elapsed(self) -> Duration {
            self.0.elapsed()
        }

        /// Duration between `earlier` and `self` (`self - earlier`).
        #[inline]
        pub fn duration_since(self, earlier: Self) -> Duration {
            self.0.duration_since(earlier.0)
        }
    }

    impl std::ops::Add<Duration> for Instant {
        type Output = Self;
        #[inline]
        fn add(self, rhs: Duration) -> Self {
            Self(self.0 + rhs)
        }
    }

    impl std::ops::Sub<Duration> for Instant {
        type Output = Self;
        #[inline]
        fn sub(self, rhs: Duration) -> Self {
            Self(self.0 - rhs)
        }
    }

    impl std::ops::SubAssign<Duration> for Instant {
        #[inline]
        fn sub_assign(&mut self, rhs: Duration) {
            self.0 -= rhs;
        }
    }

    impl From<Instant> for std::time::Instant {
        #[inline]
        fn from(i: Instant) -> Self {
            i.0
        }
    }

    impl From<std::time::Instant> for Instant {
        #[inline]
        fn from(i: std::time::Instant) -> Self {
            Self(i)
        }
    }
}

// ---------------------------------------------------------------------------
// Wasm32 Instant — tick-based monotonic clock
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
mod imp {
    use core::sync::atomic::{AtomicU64, Ordering};
    use core::time::Duration;

    /// Global monotonic clock in microseconds, advanced by the host.
    static CLOCK_US: AtomicU64 = AtomicU64::new(0);

    /// A monotonic timestamp backed by the host-driven clock.
    ///
    /// On wasm32 there is no reliable `std::time::Instant`.  Instead the
    /// host advances a global microsecond counter via [`Instant::advance`]
    /// (typically from `performance.now()`), and all elapsed-time queries
    /// resolve against that counter.
    #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct Instant(u64);

    impl Instant {
        /// Capture the current moment (reads the global tick counter).
        #[inline]
        pub fn now() -> Self {
            Self(CLOCK_US.load(Ordering::Relaxed))
        }

        /// Duration elapsed since `self`.
        #[inline]
        pub fn elapsed(self) -> Duration {
            let now = CLOCK_US.load(Ordering::Relaxed);
            Duration::from_micros(now.saturating_sub(self.0))
        }

        /// Duration between `earlier` and `self` (`self - earlier`).
        #[inline]
        pub fn duration_since(self, earlier: Self) -> Duration {
            Duration::from_micros(self.0.saturating_sub(earlier.0))
        }

        /// Advance the global clock by `dt`.
        ///
        /// The host **should** call this regularly (e.g. once per frame with
        /// the delta obtained from `performance.now()`).  Without it,
        /// `elapsed()` always returns zero.  The history module treats
        /// zero-elapsed as "timeout expired" so undo granularity is
        /// preserved (every edit becomes a separate undo step).  Cursor
        /// blink will not toggle.
        pub fn advance(dt: Duration) {
            CLOCK_US.fetch_add(dt.as_micros() as u64, Ordering::Relaxed);
        }

        /// Set the global clock to an absolute value (microseconds).
        ///
        /// Useful for initialisation from `performance.now()` so the first
        /// `elapsed()` call returns a meaningful delta.
        pub fn set_micros(us: u64) {
            CLOCK_US.store(us, Ordering::Relaxed);
        }
    }

    impl core::ops::Add<Duration> for Instant {
        type Output = Self;
        #[inline]
        fn add(self, rhs: Duration) -> Self {
            Self(self.0.saturating_add(rhs.as_micros() as u64))
        }
    }

    impl core::ops::Sub<Duration> for Instant {
        type Output = Self;
        #[inline]
        fn sub(self, rhs: Duration) -> Self {
            Self(self.0.saturating_sub(rhs.as_micros() as u64))
        }
    }

    impl core::ops::SubAssign<Duration> for Instant {
        #[inline]
        fn sub_assign(&mut self, rhs: Duration) {
            self.0 = self.0.saturating_sub(rhs.as_micros() as u64);
        }
    }
}

pub use imp::Instant;
