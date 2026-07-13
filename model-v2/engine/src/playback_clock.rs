//! Explicit host-time to animation-time mapping.
//!
//! [`PlaybackClock`] is caller-owned playback state, not a wall clock or a
//! scheduler. The caller supplies every [`HostTime`]; this module returns only
//! the existing [`SampleTime`] consumed by animation and frame APIs.

use anchor_lab::animation::SampleTime;
use std::num::NonZeroU64;

/// Nanoseconds from one caller-owned monotonic epoch.
///
/// This is intentionally a different type from signed document
/// [`SampleTime`]. Equal host timestamps are valid; timestamps supplied to one
/// [`PlaybackClock`] must never decrease.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct HostTime(u64);

impl HostTime {
    pub const ZERO: Self = Self(0);

    pub const fn from_nanoseconds(nanoseconds: u64) -> Self {
        Self(nanoseconds)
    }

    pub const fn nanoseconds(self) -> u64 {
        self.0
    }
}

/// One explicit closed interval of document time available for playback.
///
/// The range is supplied by the host. It is never inferred from an animation
/// program, source document, or renderer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlaybackRange {
    start: SampleTime,
    end: SampleTime,
}

impl PlaybackRange {
    pub fn new(start: SampleTime, end: SampleTime) -> Result<Self, PlaybackClockError> {
        if end < start {
            return Err(PlaybackClockError::DescendingRange { start, end });
        }
        Ok(Self { start, end })
    }

    pub const fn start(self) -> SampleTime {
        self.start
    }

    pub const fn end(self) -> SampleTime {
        self.end
    }

    fn contains(self, time: SampleTime) -> bool {
        (self.start..=self.end).contains(&time)
    }

    fn terminal(self, direction: PlaybackDirection) -> SampleTime {
        match direction {
            PlaybackDirection::Forward => self.end,
            PlaybackDirection::Reverse => self.start,
        }
    }
}

/// A positive exact rational playback rate.
///
/// Zero speed is represented by a non-playing clock, and direction is a
/// separate value. Keeping both out of the rate removes signed-minimum and
/// negative-zero cases from time arithmetic.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlaybackRate {
    numerator: NonZeroU64,
    denominator: NonZeroU64,
}

impl PlaybackRate {
    pub const ONE: Self = Self {
        numerator: NonZeroU64::MIN,
        denominator: NonZeroU64::MIN,
    };

    pub fn new(numerator: u64, denominator: u64) -> Result<Self, PlaybackClockError> {
        let numerator = NonZeroU64::new(numerator).ok_or(PlaybackClockError::ZeroRateNumerator)?;
        let denominator =
            NonZeroU64::new(denominator).ok_or(PlaybackClockError::ZeroRateDenominator)?;
        let divisor = greatest_common_divisor(numerator.get(), denominator.get());
        Ok(Self {
            numerator: NonZeroU64::new(numerator.get() / divisor)
                .expect("a positive numerator remains positive after reduction"),
            denominator: NonZeroU64::new(denominator.get() / divisor)
                .expect("a positive denominator remains positive after reduction"),
        })
    }

    pub const fn numerator(self) -> u64 {
        self.numerator.get()
    }

    pub const fn denominator(self) -> u64 {
        self.denominator.get()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackDirection {
    Forward,
    Reverse,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlaybackMode {
    Paused {
        position: SampleTime,
    },
    Playing {
        anchor_host: HostTime,
        anchor_sample: SampleTime,
    },
}

/// A compact, source-neutral animation playback clock.
///
/// The clock starts paused. While playing, every result is derived from one
/// stable host/sample anchor; intermediate samples never accumulate deltas or
/// re-anchor the clock. Reaching the directional range endpoint returns that
/// endpoint and transitions to paused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlaybackClock {
    range: PlaybackRange,
    rate: PlaybackRate,
    direction: PlaybackDirection,
    mode: PlaybackMode,
    last_host: HostTime,
}

impl PlaybackClock {
    pub fn new(range: PlaybackRange, initial: SampleTime) -> Result<Self, PlaybackClockError> {
        if !range.contains(initial) {
            return Err(PlaybackClockError::PositionOutsideRange {
                position: initial,
                range,
            });
        }
        Ok(Self {
            range,
            rate: PlaybackRate::ONE,
            direction: PlaybackDirection::Forward,
            mode: PlaybackMode::Paused { position: initial },
            last_host: HostTime::ZERO,
        })
    }

    pub const fn range(&self) -> PlaybackRange {
        self.range
    }

    pub const fn rate(&self) -> PlaybackRate {
        self.rate
    }

    pub const fn direction(&self) -> PlaybackDirection {
        self.direction
    }

    pub const fn is_playing(&self) -> bool {
        matches!(self.mode, PlaybackMode::Playing { .. })
    }

    /// Observe document time at `now` and advance the state to an endpoint if
    /// one has been reached. The exact endpoint remains the returned sample.
    pub fn sample_time(&mut self, now: HostTime) -> Result<SampleTime, PlaybackClockError> {
        self.transaction(|next| next.reconcile(now))
    }

    /// Begin or continue playback without changing the visible sample.
    ///
    /// Calling `play` does not re-anchor while playback remains active. If
    /// observing `now` reaches the endpoint, that endpoint is returned and the
    /// clock pauses. Calling `play` while already paused there is a successful
    /// no-op rather than inventing loop or rewind policy.
    pub fn play(&mut self, now: HostTime) -> Result<SampleTime, PlaybackClockError> {
        self.transaction(|next| {
            let position = next.reconcile(now)?;
            if next.is_playing() {
                return Ok(position);
            }
            if !next.can_advance(position) {
                return Ok(position);
            }
            next.mode = PlaybackMode::Playing {
                anchor_host: now,
                anchor_sample: position,
            };
            Ok(position)
        })
    }

    /// Pause at the time derived under the previous state.
    pub fn pause(&mut self, now: HostTime) -> Result<SampleTime, PlaybackClockError> {
        self.transaction(|next| {
            let position = next.reconcile(now)?;
            next.mode = PlaybackMode::Paused { position };
            Ok(position)
        })
    }

    /// Seek to one explicit in-range document time.
    ///
    /// Seek is the only discontinuous control. It preserves playing versus
    /// paused state after reconciling the old mapping, except that seeking to
    /// the current directional endpoint pauses.
    pub fn seek(
        &mut self,
        position: SampleTime,
        now: HostTime,
    ) -> Result<SampleTime, PlaybackClockError> {
        self.transaction(|next| {
            next.reconcile(now)?;
            if !next.range.contains(position) {
                return Err(PlaybackClockError::PositionOutsideRange {
                    position,
                    range: next.range,
                });
            }
            let keep_playing = next.is_playing() && next.can_advance(position);
            next.set_position(position, now, keep_playing);
            Ok(position)
        })
    }

    /// Change rate without changing the sample visible at `now`.
    pub fn set_rate(
        &mut self,
        rate: PlaybackRate,
        now: HostTime,
    ) -> Result<SampleTime, PlaybackClockError> {
        self.transaction(|next| {
            let position = next.reconcile(now)?;
            if next.rate == rate {
                return Ok(position);
            }
            let keep_playing = next.is_playing();
            next.rate = rate;
            next.set_position(position, now, keep_playing);
            Ok(position)
        })
    }

    /// Change direction without changing the sample visible at `now`.
    pub fn set_direction(
        &mut self,
        direction: PlaybackDirection,
        now: HostTime,
    ) -> Result<SampleTime, PlaybackClockError> {
        self.transaction(|next| {
            let position = next.reconcile(now)?;
            if next.direction == direction {
                return Ok(position);
            }
            let keep_playing = next.is_playing();
            next.direction = direction;
            next.set_position(position, now, keep_playing && next.can_advance(position));
            Ok(position)
        })
    }

    fn transaction(
        &mut self,
        operation: impl FnOnce(&mut Self) -> Result<SampleTime, PlaybackClockError>,
    ) -> Result<SampleTime, PlaybackClockError> {
        let mut next = *self;
        let result = operation(&mut next)?;
        *self = next;
        Ok(result)
    }

    fn reconcile(&mut self, now: HostTime) -> Result<SampleTime, PlaybackClockError> {
        if now < self.last_host {
            return Err(PlaybackClockError::HostTimeRegressed {
                previous: self.last_host,
                current: now,
            });
        }

        let (position, reached_terminal) = match self.mode {
            PlaybackMode::Paused { position } => (position, false),
            PlaybackMode::Playing {
                anchor_host,
                anchor_sample,
            } => self.position_from_anchor(anchor_host, anchor_sample, now),
        };
        self.last_host = now;
        if reached_terminal {
            self.mode = PlaybackMode::Paused { position };
        }
        Ok(position)
    }

    fn position_from_anchor(
        &self,
        anchor_host: HostTime,
        anchor_sample: SampleTime,
        now: HostTime,
    ) -> (SampleTime, bool) {
        let elapsed = now
            .nanoseconds()
            .checked_sub(anchor_host.nanoseconds())
            .expect("a playing anchor cannot be newer than the last accepted host time");
        let advance = u128::from(elapsed) * u128::from(self.rate.numerator())
            / u128::from(self.rate.denominator());
        let terminal = self.range.terminal(self.direction);
        let distance = match self.direction {
            PlaybackDirection::Forward => {
                i128::from(terminal.nanoseconds()) - i128::from(anchor_sample.nanoseconds())
            }
            PlaybackDirection::Reverse => {
                i128::from(anchor_sample.nanoseconds()) - i128::from(terminal.nanoseconds())
            }
        };
        let distance =
            u128::try_from(distance).expect("a playback anchor is inside its directional range");
        if advance >= distance {
            return (terminal, true);
        }

        let advance = i128::try_from(advance)
            .expect("an unclamped advance is smaller than an unsigned 64-bit range span");
        let position = match self.direction {
            PlaybackDirection::Forward => i128::from(anchor_sample.nanoseconds()) + advance,
            PlaybackDirection::Reverse => i128::from(anchor_sample.nanoseconds()) - advance,
        };
        (
            SampleTime::try_from(position)
                .expect("an unclamped position remains inside the playback range"),
            false,
        )
    }

    fn can_advance(&self, position: SampleTime) -> bool {
        position != self.range.terminal(self.direction)
    }

    fn set_position(&mut self, position: SampleTime, now: HostTime, playing: bool) {
        self.mode = if playing {
            PlaybackMode::Playing {
                anchor_host: now,
                anchor_sample: position,
            }
        } else {
            PlaybackMode::Paused { position }
        };
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackClockError {
    DescendingRange {
        start: SampleTime,
        end: SampleTime,
    },
    ZeroRateNumerator,
    ZeroRateDenominator,
    PositionOutsideRange {
        position: SampleTime,
        range: PlaybackRange,
    },
    HostTimeRegressed {
        previous: HostTime,
        current: HostTime,
    },
}

impl std::fmt::Display for PlaybackClockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DescendingRange { start, end } => write!(
                f,
                "playback range end {}ns precedes start {}ns",
                end.nanoseconds(),
                start.nanoseconds()
            ),
            Self::ZeroRateNumerator => {
                f.write_str("playback rate numerator must be greater than zero")
            }
            Self::ZeroRateDenominator => {
                f.write_str("playback rate denominator must be greater than zero")
            }
            Self::PositionOutsideRange { position, range } => write!(
                f,
                "playback position {}ns is outside the closed range [{}ns, {}ns]",
                position.nanoseconds(),
                range.start.nanoseconds(),
                range.end.nanoseconds()
            ),
            Self::HostTimeRegressed { previous, current } => write!(
                f,
                "host time regressed from {}ns to {}ns",
                previous.nanoseconds(),
                current.nanoseconds()
            ),
        }
    }
}

impl std::error::Error for PlaybackClockError {}

fn greatest_common_divisor(mut left: u64, mut right: u64) -> u64 {
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left
}
