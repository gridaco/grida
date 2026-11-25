//! Timing bounds for the native tools that wait for work or time.

use std::time::{Duration, Instant};

pub(crate) const MAX_MS: u64 = 300_000;
const RESULT_MARGIN: Duration = Duration::from_secs(2);

/// Allow time for the executor's input check, waiting, and result collection.
pub(crate) fn execution_timeout(wait: Duration) -> Duration {
    wait + Duration::from_secs(5)
}

pub(crate) fn until(start: Instant, duration: Duration, deadline: Option<Instant>) -> Instant {
    let requested = start + duration;
    deadline.map_or(requested, |outer| {
        requested
            .min(outer.checked_sub(RESULT_MARGIN).unwrap_or(outer))
            .max(start)
    })
}
