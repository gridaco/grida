//! Format-neutral, explicit-time animation sampling.
//!
//! Authored frontends compile immutable typed tracks once. Sampling then maps
//! one exact [`SampleTime`] to the ordinary [`PropertyValues`] boundary without
//! mutating the [`Document`]. Clocks, playback, source parsing, and rendering
//! belong outside this module.

use crate::math::Affine;
use crate::model::{
    AnchorEdge, AxisBinding, BlendMode, Color, Document, LensOp, NodeKey, Paint, Paints, SizeIntent,
};
use crate::path::{PathCommand, PathGeometry};
use crate::properties::{
    PropertyError, PropertyKey, PropertyTarget, PropertyValue, PropertyValueKind, PropertyValues,
};
use num_bigint::{BigInt, BigUint};
use num_rational::BigRational;
use num_traits::{One, Signed, ToPrimitive, Zero};
use std::cmp::Ordering;
use std::num::NonZeroU64;
use std::sync::Arc;

/// Signed nanoseconds from an authored timeline's origin.
///
/// Negative values are valid host pre-roll. Arithmetic is exposed only through
/// checked operations so a caller cannot wrap semantic time accidentally.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SampleTime(i64);

impl SampleTime {
    pub const ZERO: Self = Self(0);

    pub const fn from_nanoseconds(nanoseconds: i64) -> Self {
        Self(nanoseconds)
    }

    pub const fn nanoseconds(self) -> i64 {
        self.0
    }

    pub fn checked_add_nanoseconds(self, delta: i64) -> Option<Self> {
        self.0.checked_add(delta).map(Self)
    }

    pub fn checked_sub_nanoseconds(self, delta: i64) -> Option<Self> {
        self.0.checked_sub(delta).map(Self)
    }
}

impl TryFrom<i128> for SampleTime {
    type Error = SampleTimeRangeError;

    fn try_from(value: i128) -> Result<Self, Self::Error> {
        i64::try_from(value)
            .map(Self)
            .map_err(|_| SampleTimeRangeError { nanoseconds: value })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SampleTimeRangeError {
    pub nanoseconds: i128,
}

impl std::fmt::Display for SampleTimeRangeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "sample time {}ns is outside the signed 64-bit range",
            self.nanoseconds
        )
    }
}

impl std::error::Error for SampleTimeRangeError {}

/// One finite, repeated active interval on the signed engine timeline.
/// Source frontends may narrow this format-neutral domain further.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timing {
    begin: SampleTime,
    duration_ns: u64,
    repeat_count: u64,
    active_end: SampleTime,
}

impl Timing {
    pub fn new(begin_ns: i64, duration_ns: u64, repeat_count: u64) -> Result<Self, TimingError> {
        if duration_ns == 0 {
            return Err(TimingError::ZeroDuration);
        }
        if repeat_count == 0 {
            return Err(TimingError::ZeroRepeatCount);
        }

        let active_length = u128::from(duration_ns) * u128::from(repeat_count);
        let overflow = || TimingError::ActiveEndOverflow {
            begin_ns,
            duration_ns,
            repeat_count,
        };
        let active_length = i128::try_from(active_length).map_err(|_| overflow())?;
        let active_end = i128::from(begin_ns)
            .checked_add(active_length)
            .ok_or_else(overflow)?;
        let active_end = i64::try_from(active_end).map_err(|_| overflow())?;

        Ok(Self {
            begin: SampleTime::from_nanoseconds(begin_ns),
            duration_ns,
            repeat_count,
            active_end: SampleTime::from_nanoseconds(active_end),
        })
    }

    pub const fn begin(self) -> SampleTime {
        self.begin
    }

    pub const fn duration_nanoseconds(self) -> u64 {
        self.duration_ns
    }

    pub const fn repeat_count(self) -> u64 {
        self.repeat_count
    }

    pub const fn active_end(self) -> SampleTime {
        self.active_end
    }

    fn contribution(self, time: SampleTime, fill: FillMode) -> Contribution {
        if time < self.begin {
            return Contribution::None;
        }
        if time >= self.active_end {
            return match fill {
                FillMode::Remove => Contribution::None,
                FillMode::Freeze => Contribution::To,
            };
        }

        let elapsed =
            (i128::from(time.nanoseconds()) - i128::from(self.begin.nanoseconds())) as u128;
        Contribution::Active {
            repeat_index: (elapsed / u128::from(self.duration_ns)) as u64,
            numerator: (elapsed % u128::from(self.duration_ns)) as u64,
            denominator: self.duration_ns,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimingError {
    ZeroDuration,
    ZeroRepeatCount,
    ActiveEndOverflow {
        begin_ns: i64,
        duration_ns: u64,
        repeat_count: u64,
    },
}

impl std::fmt::Display for TimingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TimingError::ZeroDuration => write!(f, "animation duration must be greater than zero"),
            TimingError::ZeroRepeatCount => {
                write!(f, "animation repeat count must be greater than zero")
            }
            TimingError::ActiveEndOverflow {
                begin_ns,
                duration_ns,
                repeat_count,
            } => write!(
                f,
                "animation active end overflows signed 64-bit nanoseconds: {begin_ns} + {duration_ns} * {repeat_count}"
            ),
        }
    }
}

impl std::error::Error for TimingError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FillMode {
    Remove,
    Freeze,
}

/// An exact, reduced position in a scalar keyframe curve.
///
/// Offsets are closed over `[0, 1]`. Retaining the authored position as a
/// rational avoids making timeline boundaries depend on a floating-point
/// approximation chosen by a frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct KeyframeOffset {
    numerator: u64,
    denominator: NonZeroU64,
}

impl KeyframeOffset {
    pub const ZERO: Self = Self {
        numerator: 0,
        denominator: NonZeroU64::MIN,
    };
    pub const ONE: Self = Self {
        numerator: 1,
        denominator: NonZeroU64::MIN,
    };

    pub fn new(numerator: u64, denominator: u64) -> Result<Self, KeyframeOffsetError> {
        let denominator = NonZeroU64::new(denominator)
            .ok_or(KeyframeOffsetError::ZeroDenominator { numerator })?;
        if numerator > denominator.get() {
            return Err(KeyframeOffsetError::OutsideUnitInterval {
                numerator,
                denominator: denominator.get(),
            });
        }

        let divisor = greatest_common_divisor(numerator, denominator.get());
        Ok(Self {
            numerator: numerator / divisor,
            denominator: NonZeroU64::new(denominator.get() / divisor)
                .expect("a nonzero denominator remains nonzero after reduction"),
        })
    }

    pub const fn numerator(self) -> u64 {
        self.numerator
    }

    pub const fn denominator(self) -> u64 {
        self.denominator.get()
    }

    fn rational(self) -> BigRational {
        BigRational::new(
            BigInt::from(self.numerator),
            BigInt::from(self.denominator.get()),
        )
    }

    fn cmp_ratio(self, numerator: u64, denominator: u64) -> Ordering {
        debug_assert!(denominator > 0);
        (u128::from(self.numerator) * u128::from(denominator))
            .cmp(&(u128::from(numerator) * u128::from(self.denominator.get())))
    }
}

impl PartialOrd for KeyframeOffset {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for KeyframeOffset {
    fn cmp(&self, other: &Self) -> Ordering {
        self.cmp_ratio(other.numerator, other.denominator.get())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyframeOffsetError {
    ZeroDenominator { numerator: u64 },
    OutsideUnitInterval { numerator: u64, denominator: u64 },
}

impl std::fmt::Display for KeyframeOffsetError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ZeroDenominator { numerator } => {
                write!(f, "keyframe offset {numerator}/0 has a zero denominator")
            }
            Self::OutsideUnitInterval {
                numerator,
                denominator,
            } => write!(
                f,
                "keyframe offset {numerator}/{denominator} is outside [0, 1]"
            ),
        }
    }
}

impl std::error::Error for KeyframeOffsetError {}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScalarKeyframe {
    offset: KeyframeOffset,
    value: f32,
}

impl ScalarKeyframe {
    pub const fn new(offset: KeyframeOffset, value: f32) -> Self {
        Self { offset, value }
    }

    pub const fn offset(self) -> KeyframeOffset {
        self.offset
    }

    pub const fn value(self) -> f32 {
        self.value
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CubicControl {
    X1,
    Y1,
    X2,
    Y2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CubicBezierError {
    NotFinite { control: CubicControl },
    XOutsideUnitInterval { control: CubicControl },
}

impl std::fmt::Display for CubicBezierError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFinite { control } => {
                write!(f, "cubic Bézier control {control:?} must be finite")
            }
            Self::XOutsideUnitInterval { control } => {
                write!(f, "cubic Bézier control {control:?} must be inside [0, 1]")
            }
        }
    }
}

impl std::error::Error for CubicBezierError {}

/// A CSS-compatible cubic Bézier timing function.
///
/// The x controls are constrained to `[0, 1]`, making x monotonic and its
/// inverse single-valued. Finite y controls may overshoot; the target property
/// domain is checked conservatively when a curve is attached to a track.
#[derive(Clone)]
pub struct CubicBezier {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    exact: Arc<ExactCubicBezier>,
}

impl CubicBezier {
    pub fn new(x1: f32, y1: f32, x2: f32, y2: f32) -> Result<Self, CubicBezierError> {
        for (control, value) in [
            (CubicControl::X1, x1),
            (CubicControl::Y1, y1),
            (CubicControl::X2, x2),
            (CubicControl::Y2, y2),
        ] {
            if !value.is_finite() {
                return Err(CubicBezierError::NotFinite { control });
            }
        }
        for (control, value) in [(CubicControl::X1, x1), (CubicControl::X2, x2)] {
            if !(0.0..=1.0).contains(&value) {
                return Err(CubicBezierError::XOutsideUnitInterval { control });
            }
        }

        let x1 = canonical_zero(x1);
        let y1 = canonical_zero(y1);
        let x2 = canonical_zero(x2);
        let y2 = canonical_zero(y2);
        Ok(Self {
            x1,
            y1,
            x2,
            y2,
            exact: Arc::new(ExactCubicBezier::new(x1, y1, x2, y2)),
        })
    }

    pub const fn x1(&self) -> f32 {
        self.x1
    }

    pub const fn y1(&self) -> f32 {
        self.y1
    }

    pub const fn x2(&self) -> f32 {
        self.x2
    }

    pub const fn y2(&self) -> f32 {
        self.y2
    }

    fn apply(&self, input: &BigRational) -> BigRational {
        if input.is_zero() || input.is_one() {
            return input.clone();
        }
        if self.x1 == self.y1 && self.x2 == self.y2 {
            return input.clone();
        }

        // At depth d, the bracket endpoints are adjacent multiples of 2^-d.
        // Retaining only the lower integer avoids constructing and reducing a
        // new rational for every comparison while preserving the specified
        // 128 exact dyadic bisections.
        let mut lower_numerator = BigInt::zero();
        for depth in 1..=CUBIC_BISECTION_STEPS {
            let midpoint_numerator = (&lower_numerator << 1_usize) + BigInt::one();
            match self.exact.x.compare_at(&midpoint_numerator, depth, input) {
                Ordering::Less => lower_numerator = midpoint_numerator,
                Ordering::Greater => lower_numerator <<= 1_usize,
                Ordering::Equal => return self.exact.y.rational_at(&midpoint_numerator, depth),
            }
        }

        let midpoint_numerator = (&lower_numerator << 1_usize) + BigInt::one();
        self.exact
            .y
            .rational_at(&midpoint_numerator, CUBIC_BISECTION_STEPS + 1)
    }
}

impl std::fmt::Debug for CubicBezier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CubicBezier")
            .field("x1", &self.x1)
            .field("y1", &self.y1)
            .field("x2", &self.x2)
            .field("y2", &self.y2)
            .finish()
    }
}

impl PartialEq for CubicBezier {
    fn eq(&self, other: &Self) -> bool {
        self.x1 == other.x1 && self.y1 == other.y1 && self.x2 == other.x2 && self.y2 == other.y2
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Easing {
    Linear,
    CubicBezier(CubicBezier),
}

impl Easing {
    fn apply(&self, input: &BigRational) -> BigRational {
        match self {
            Self::Linear => input.clone(),
            Self::CubicBezier(curve) => curve.apply(input),
        }
    }
}

/// One interval from the preceding keyframe to `end`.
///
/// Keeping the easing and terminal keyframe together makes it impossible to
/// create mismatched parallel keyframe/easing lists.
#[derive(Debug, Clone, PartialEq)]
pub struct ScalarSegment {
    easing: Easing,
    end: ScalarKeyframe,
}

impl ScalarSegment {
    pub const fn new(easing: Easing, end: ScalarKeyframe) -> Self {
        Self { easing, end }
    }

    pub fn easing(&self) -> Easing {
        self.easing.clone()
    }

    pub const fn end(&self) -> ScalarKeyframe {
        self.end
    }
}

/// The sole scalar animation representation, including linear from/to tracks.
#[derive(Debug, Clone, PartialEq)]
pub struct ScalarCurve {
    first: ScalarKeyframe,
    segments: Box<[ScalarSegment]>,
}

impl ScalarCurve {
    pub fn new(
        first: ScalarKeyframe,
        segments: Vec<ScalarSegment>,
    ) -> Result<Self, ScalarCurveError> {
        // A lone offset cannot affect sampling. Accept it, then erase that
        // semantically inert spelling so all constant curves have one form.
        if segments.is_empty() {
            return Ok(Self::constant(first.value));
        }
        if first.offset != KeyframeOffset::ZERO {
            return Err(ScalarCurveError::FirstOffsetMustBeZero {
                actual: first.offset,
            });
        }

        let mut previous = first.offset;
        for (segment_index, segment) in segments.iter().enumerate() {
            let current = segment.end.offset;
            if current <= previous {
                return Err(ScalarCurveError::OffsetsNotStrictlyIncreasing {
                    previous_index: segment_index,
                    current_index: segment_index + 1,
                    previous,
                    current,
                });
            }
            previous = current;
        }
        if previous != KeyframeOffset::ONE {
            return Err(ScalarCurveError::LastOffsetMustBeOne { actual: previous });
        }

        Ok(Self {
            first,
            segments: segments.into_boxed_slice(),
        })
    }

    pub fn linear(from: f32, to: f32) -> Self {
        Self {
            first: ScalarKeyframe::new(KeyframeOffset::ZERO, from),
            segments: vec![ScalarSegment::new(
                Easing::Linear,
                ScalarKeyframe::new(KeyframeOffset::ONE, to),
            )]
            .into_boxed_slice(),
        }
    }

    pub fn constant(value: f32) -> Self {
        Self {
            first: ScalarKeyframe::new(KeyframeOffset::ZERO, value),
            segments: Box::new([]),
        }
    }

    pub const fn first(&self) -> ScalarKeyframe {
        self.first
    }

    pub fn segments(&self) -> &[ScalarSegment] {
        &self.segments
    }

    pub fn keyframes(&self) -> impl Iterator<Item = &ScalarKeyframe> {
        std::iter::once(&self.first).chain(self.segments.iter().map(|segment| &segment.end))
    }

    pub fn keyframe_count(&self) -> usize {
        1 + self.segments.len()
    }

    pub fn first_value(&self) -> f32 {
        self.first.value
    }

    pub fn last_value(&self) -> f32 {
        self.segments
            .last()
            .map_or(self.first.value, |segment| segment.end.value)
    }

    fn sample(&self, numerator: u64, denominator: u64) -> f32 {
        debug_assert!(denominator > 0);
        debug_assert!(numerator < denominator);
        if self.segments.is_empty() || numerator == 0 {
            return self.first.value;
        }

        let segment_index = match self
            .segments
            .binary_search_by(|segment| segment.end.offset.cmp_ratio(numerator, denominator))
        {
            Ok(index) => return self.segments[index].end.value,
            Err(index) => index,
        };
        let segment = self
            .segments
            .get(segment_index)
            .expect("an active progress is below the required terminal offset one");
        let start = segment_index
            .checked_sub(1)
            .map_or(self.first, |index| self.segments[index].end);
        let progress = BigRational::new(BigInt::from(numerator), BigInt::from(denominator));
        let start_offset = start.offset.rational();
        let end_offset = segment.end.offset.rational();
        let local = (&progress - &start_offset) / (&end_offset - &start_offset);
        let eased = segment.easing.apply(&local);
        lerp_binary32_once_rational(start.value, segment.end.value, &eased)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScalarCurveError {
    FirstOffsetMustBeZero {
        actual: KeyframeOffset,
    },
    LastOffsetMustBeOne {
        actual: KeyframeOffset,
    },
    OffsetsNotStrictlyIncreasing {
        previous_index: usize,
        current_index: usize,
        previous: KeyframeOffset,
        current: KeyframeOffset,
    },
}

impl std::fmt::Display for ScalarCurveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FirstOffsetMustBeZero { actual } => write!(
                f,
                "the first keyframe offset must be 0, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::LastOffsetMustBeOne { actual } => write!(
                f,
                "the last keyframe offset must be 1, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::OffsetsNotStrictlyIncreasing {
                previous_index,
                current_index,
                previous,
                current,
            } => write!(
                f,
                "keyframe offsets must increase strictly: index {previous_index} is {}/{}, index {current_index} is {}/{}",
                previous.numerator(),
                previous.denominator(),
                current.numerator(),
                current.denominator()
            ),
        }
    }
}

impl std::error::Error for ScalarCurveError {}

/// One complete singleton-solid fill value at an exact curve offset.
///
/// The color is the value of an existing [`Paint::Solid`]. Sampling projects
/// the final composed result back to the ordinary ordered [`Paints`] property;
/// this is not a parallel color property or a nested paint-member target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ColorKeyframe {
    offset: KeyframeOffset,
    color: Color,
}

impl ColorKeyframe {
    pub const fn new(offset: KeyframeOffset, color: Color) -> Self {
        Self { offset, color }
    }

    pub const fn offset(self) -> KeyframeOffset {
        self.offset
    }

    pub const fn color(self) -> Color {
        self.color
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ColorSegment {
    easing: Easing,
    end: ColorKeyframe,
}

impl ColorSegment {
    pub const fn new(easing: Easing, end: ColorKeyframe) -> Self {
        Self { easing, end }
    }

    pub fn easing(&self) -> Easing {
        self.easing.clone()
    }

    pub const fn end(&self) -> ColorKeyframe {
        self.end
    }
}

/// A keyframed legacy-sRGB solid-fill color.
///
/// Channels are interpolated straight (unpremultiplied) and remain exact and
/// unbounded while effects are accumulated and composed. The complete color
/// sandwich is clamped and quantized to the engine's RGBA8 [`Color`] only when
/// it is projected to [`PropertyValue::Paints`].
#[derive(Debug, Clone, PartialEq)]
pub struct ColorCurve {
    first: ColorKeyframe,
    segments: Box<[ColorSegment]>,
}

impl ColorCurve {
    pub fn new(first: ColorKeyframe, segments: Vec<ColorSegment>) -> Result<Self, ColorCurveError> {
        if segments.is_empty() {
            return Ok(Self::constant(first.color));
        }
        if first.offset != KeyframeOffset::ZERO {
            return Err(ColorCurveError::FirstOffsetMustBeZero {
                actual: first.offset,
            });
        }

        let mut previous = first.offset;
        for (segment_index, segment) in segments.iter().enumerate() {
            let current = segment.end.offset;
            if current <= previous {
                return Err(ColorCurveError::OffsetsNotStrictlyIncreasing {
                    previous_index: segment_index,
                    current_index: segment_index + 1,
                    previous,
                    current,
                });
            }
            previous = current;
        }
        if previous != KeyframeOffset::ONE {
            return Err(ColorCurveError::LastOffsetMustBeOne { actual: previous });
        }

        Ok(Self {
            first,
            segments: segments.into_boxed_slice(),
        })
    }

    pub fn linear(from: Color, to: Color) -> Self {
        Self {
            first: ColorKeyframe::new(KeyframeOffset::ZERO, from),
            segments: vec![ColorSegment::new(
                Easing::Linear,
                ColorKeyframe::new(KeyframeOffset::ONE, to),
            )]
            .into_boxed_slice(),
        }
    }

    pub fn constant(color: Color) -> Self {
        Self {
            first: ColorKeyframe::new(KeyframeOffset::ZERO, color),
            segments: Box::new([]),
        }
    }

    pub const fn first(&self) -> ColorKeyframe {
        self.first
    }

    pub fn segments(&self) -> &[ColorSegment] {
        &self.segments
    }

    pub fn keyframes(&self) -> impl Iterator<Item = &ColorKeyframe> {
        std::iter::once(&self.first).chain(self.segments.iter().map(|segment| &segment.end))
    }

    pub fn keyframe_count(&self) -> usize {
        1 + self.segments.len()
    }

    pub const fn first_color(&self) -> Color {
        self.first.color
    }

    pub fn last_color(&self) -> Color {
        self.segments
            .last()
            .map_or(self.first.color, |segment| segment.end.color)
    }

    fn sample(&self, numerator: u64, denominator: u64) -> ExactColor {
        debug_assert!(denominator > 0);
        debug_assert!(numerator < denominator);
        if self.segments.is_empty() || numerator == 0 {
            return ExactColor::from(self.first.color);
        }

        let segment_index = match self
            .segments
            .binary_search_by(|segment| segment.end.offset.cmp_ratio(numerator, denominator))
        {
            Ok(index) => return ExactColor::from(self.segments[index].end.color),
            Err(index) => index,
        };
        let segment = self
            .segments
            .get(segment_index)
            .expect("an active progress is below the required terminal offset one");
        let start = segment_index
            .checked_sub(1)
            .map_or(self.first, |index| self.segments[index].end);
        let progress = BigRational::new(BigInt::from(numerator), BigInt::from(denominator));
        let start_offset = start.offset.rational();
        let end_offset = segment.end.offset.rational();
        let local = (&progress - &start_offset) / (&end_offset - &start_offset);
        ExactColor::from(start.color).interpolate(
            &ExactColor::from(segment.end.color),
            &segment.easing.apply(&local),
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorCurveError {
    FirstOffsetMustBeZero {
        actual: KeyframeOffset,
    },
    LastOffsetMustBeOne {
        actual: KeyframeOffset,
    },
    OffsetsNotStrictlyIncreasing {
        previous_index: usize,
        current_index: usize,
        previous: KeyframeOffset,
        current: KeyframeOffset,
    },
}

impl std::fmt::Display for ColorCurveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FirstOffsetMustBeZero { actual } => write!(
                f,
                "the first color keyframe offset must be 0, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::LastOffsetMustBeOne { actual } => write!(
                f,
                "the last color keyframe offset must be 1, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::OffsetsNotStrictlyIncreasing {
                previous_index,
                current_index,
                previous,
                current,
            } => write!(
                f,
                "color keyframe offsets must increase strictly: index {previous_index} is {}/{}, index {current_index} is {}/{}",
                previous.numerator(),
                previous.denominator(),
                current.numerator(),
                current.denominator()
            ),
        }
    }
}

impl std::error::Error for ColorCurveError {}

/// One complete, validated path geometry value at an exact curve offset.
#[derive(Debug, Clone, PartialEq)]
pub struct PathKeyframe {
    offset: KeyframeOffset,
    path: Arc<PathGeometry>,
}

impl PathKeyframe {
    pub const fn new(offset: KeyframeOffset, path: Arc<PathGeometry>) -> Self {
        Self { offset, path }
    }

    pub const fn offset(&self) -> KeyframeOffset {
        self.offset
    }

    pub fn path(&self) -> &Arc<PathGeometry> {
        &self.path
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PathSegment {
    easing: Easing,
    end: PathKeyframe,
}

impl PathSegment {
    pub const fn new(easing: Easing, end: PathKeyframe) -> Self {
        Self { easing, end }
    }

    pub fn easing(&self) -> Easing {
        self.easing.clone()
    }

    pub const fn end(&self) -> &PathKeyframe {
        &self.end
    }
}

/// A smoothly interpolated, topology-stable path curve.
///
/// Curves are already normalized into the engine's absolute command
/// vocabulary. Frontends remain responsible for any stricter source-level
/// compatibility rule (for example, SVG distinguishes `H` from `L` before
/// both become an engine line command). Rational conics are intentionally not
/// admitted: interpolating a lowered conic is not SVG arc interpolation.
#[derive(Debug, Clone, PartialEq)]
pub struct PathCurve {
    first: PathKeyframe,
    segments: Box<[PathSegment]>,
}

impl PathCurve {
    pub fn new(first: PathKeyframe, segments: Vec<PathSegment>) -> Result<Self, PathCurveError> {
        first
            .path
            .validate()
            .map_err(|error| PathCurveError::InvalidPath {
                keyframe_index: 0,
                reason: error.to_string(),
            })?;
        validate_path_topology(&first.path, &first.path, 0)?;
        if segments.is_empty() {
            return Ok(Self {
                first: PathKeyframe::new(KeyframeOffset::ZERO, first.path),
                segments: Box::new([]),
            });
        }
        if first.offset != KeyframeOffset::ZERO {
            return Err(PathCurveError::FirstOffsetMustBeZero {
                actual: first.offset,
            });
        }

        let mut previous = first.offset;
        for (segment_index, segment) in segments.iter().enumerate() {
            let keyframe_index = segment_index + 1;
            segment
                .end
                .path
                .validate()
                .map_err(|error| PathCurveError::InvalidPath {
                    keyframe_index,
                    reason: error.to_string(),
                })?;
            validate_path_topology(&first.path, &segment.end.path, keyframe_index)?;
            if let Easing::CubicBezier(easing) = &segment.easing {
                for (control, value) in [
                    (CubicControl::Y1, easing.y1()),
                    (CubicControl::Y2, easing.y2()),
                ] {
                    if !(0.0..=1.0).contains(&value) {
                        return Err(PathCurveError::UnsafeCubicControl {
                            segment_index,
                            control,
                        });
                    }
                }
            }
            let current = segment.end.offset;
            if current <= previous {
                return Err(PathCurveError::OffsetsNotStrictlyIncreasing {
                    previous_index: segment_index,
                    current_index: keyframe_index,
                    previous,
                    current,
                });
            }
            previous = current;
        }
        if previous != KeyframeOffset::ONE {
            return Err(PathCurveError::LastOffsetMustBeOne { actual: previous });
        }

        Ok(Self {
            first,
            segments: segments.into_boxed_slice(),
        })
    }

    pub fn linear(from: Arc<PathGeometry>, to: Arc<PathGeometry>) -> Result<Self, PathCurveError> {
        Self::new(
            PathKeyframe::new(KeyframeOffset::ZERO, from),
            vec![PathSegment::new(
                Easing::Linear,
                PathKeyframe::new(KeyframeOffset::ONE, to),
            )],
        )
    }

    pub fn constant(path: Arc<PathGeometry>) -> Result<Self, PathCurveError> {
        Self::new(PathKeyframe::new(KeyframeOffset::ZERO, path), vec![])
    }

    pub const fn first(&self) -> &PathKeyframe {
        &self.first
    }

    pub fn segments(&self) -> &[PathSegment] {
        &self.segments
    }

    pub fn keyframes(&self) -> impl Iterator<Item = &PathKeyframe> {
        std::iter::once(&self.first).chain(self.segments.iter().map(|segment| &segment.end))
    }

    pub fn first_path(&self) -> &Arc<PathGeometry> {
        &self.first.path
    }

    pub fn last_path(&self) -> &Arc<PathGeometry> {
        self.segments
            .last()
            .map_or(&self.first.path, |segment| &segment.end.path)
    }

    fn sample(&self, numerator: u64, denominator: u64) -> Arc<PathGeometry> {
        debug_assert!(denominator > 0);
        debug_assert!(numerator < denominator);
        if self.segments.is_empty() || numerator == 0 {
            return Arc::clone(&self.first.path);
        }

        let segment_index = match self
            .segments
            .binary_search_by(|segment| segment.end.offset.cmp_ratio(numerator, denominator))
        {
            Ok(index) => return Arc::clone(&self.segments[index].end.path),
            Err(index) => index,
        };
        let segment = self
            .segments
            .get(segment_index)
            .expect("an active progress is below the required terminal offset one");
        let start = segment_index
            .checked_sub(1)
            .map_or(&self.first, |index| &self.segments[index].end);
        let progress = BigRational::new(BigInt::from(numerator), BigInt::from(denominator));
        let start_offset = start.offset.rational();
        let end_offset = segment.end.offset.rational();
        let local = (&progress - &start_offset) / (&end_offset - &start_offset);
        interpolate_path(
            &start.path,
            &segment.end.path,
            &segment.easing.apply(&local),
        )
    }
}

fn validate_path_topology(
    first: &PathGeometry,
    candidate: &PathGeometry,
    keyframe_index: usize,
) -> Result<(), PathCurveError> {
    if first.commands.len() != candidate.commands.len() {
        return Err(PathCurveError::DifferentTopology { keyframe_index });
    }
    for (command_index, (left, right)) in first
        .commands
        .iter()
        .zip(candidate.commands.iter())
        .enumerate()
    {
        if matches!(left, PathCommand::ConicTo { .. })
            || matches!(right, PathCommand::ConicTo { .. })
        {
            return Err(PathCurveError::ConicNotInterpolable {
                keyframe_index,
                command_index,
            });
        }
        if std::mem::discriminant(left) != std::mem::discriminant(right) {
            return Err(PathCurveError::DifferentTopology { keyframe_index });
        }
    }
    Ok(())
}

fn interpolate_path(
    from: &Arc<PathGeometry>,
    to: &Arc<PathGeometry>,
    progress: &BigRational,
) -> Arc<PathGeometry> {
    debug_assert_eq!(from.commands.len(), to.commands.len());
    let lerp = |from, to| lerp_binary32_once_rational(from, to, progress);
    let commands = from
        .commands
        .iter()
        .zip(to.commands.iter())
        .map(|(from, to)| match (*from, *to) {
            (PathCommand::MoveTo { x: ax, y: ay }, PathCommand::MoveTo { x: bx, y: by }) => {
                PathCommand::MoveTo {
                    x: lerp(ax, bx),
                    y: lerp(ay, by),
                }
            }
            (PathCommand::LineTo { x: ax, y: ay }, PathCommand::LineTo { x: bx, y: by }) => {
                PathCommand::LineTo {
                    x: lerp(ax, bx),
                    y: lerp(ay, by),
                }
            }
            (
                PathCommand::QuadTo {
                    x1: ax1,
                    y1: ay1,
                    x: ax,
                    y: ay,
                },
                PathCommand::QuadTo {
                    x1: bx1,
                    y1: by1,
                    x: bx,
                    y: by,
                },
            ) => PathCommand::QuadTo {
                x1: lerp(ax1, bx1),
                y1: lerp(ay1, by1),
                x: lerp(ax, bx),
                y: lerp(ay, by),
            },
            (
                PathCommand::CubicTo {
                    x1: ax1,
                    y1: ay1,
                    x2: ax2,
                    y2: ay2,
                    x: ax,
                    y: ay,
                },
                PathCommand::CubicTo {
                    x1: bx1,
                    y1: by1,
                    x2: bx2,
                    y2: by2,
                    x: bx,
                    y: by,
                },
            ) => PathCommand::CubicTo {
                x1: lerp(ax1, bx1),
                y1: lerp(ay1, by1),
                x2: lerp(ax2, bx2),
                y2: lerp(ay2, by2),
                x: lerp(ax, bx),
                y: lerp(ay, by),
            },
            (PathCommand::Close, PathCommand::Close) => PathCommand::Close,
            _ => unreachable!("path curve topology is validated at construction"),
        })
        .collect::<Vec<_>>();
    PathGeometry::from_commands(commands)
        .expect("validated convex path interpolation remains a valid finite path")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathCurveError {
    FirstOffsetMustBeZero {
        actual: KeyframeOffset,
    },
    LastOffsetMustBeOne {
        actual: KeyframeOffset,
    },
    OffsetsNotStrictlyIncreasing {
        previous_index: usize,
        current_index: usize,
        previous: KeyframeOffset,
        current: KeyframeOffset,
    },
    InvalidPath {
        keyframe_index: usize,
        reason: String,
    },
    DifferentTopology {
        keyframe_index: usize,
    },
    ConicNotInterpolable {
        keyframe_index: usize,
        command_index: usize,
    },
    UnsafeCubicControl {
        segment_index: usize,
        control: CubicControl,
    },
}

impl std::fmt::Display for PathCurveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FirstOffsetMustBeZero { actual } => write!(
                f,
                "the first path keyframe offset must be 0, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::LastOffsetMustBeOne { actual } => write!(
                f,
                "the last path keyframe offset must be 1, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::OffsetsNotStrictlyIncreasing {
                previous_index,
                current_index,
                previous,
                current,
            } => write!(
                f,
                "path keyframe offsets must increase strictly: index {previous_index} is {}/{}, index {current_index} is {}/{}",
                previous.numerator(),
                previous.denominator(),
                current.numerator(),
                current.denominator()
            ),
            Self::InvalidPath {
                keyframe_index,
                reason,
            } => write!(f, "path keyframe {keyframe_index} is invalid: {reason}"),
            Self::DifferentTopology { keyframe_index } => write!(
                f,
                "path keyframe {keyframe_index} has incompatible normalized command topology"
            ),
            Self::ConicNotInterpolable {
                keyframe_index,
                command_index,
            } => write!(
                f,
                "path keyframe {keyframe_index} command {command_index} is a rational conic; lowered arc geometry is not smoothly interpolable"
            ),
            Self::UnsafeCubicControl {
                segment_index,
                control,
            } => write!(
                f,
                "path segment {segment_index} has {control:?} outside [0, 1]; path interpolation requires convex easing"
            ),
        }
    }
}

impl std::error::Error for PathCurveError {}

/// One complete property value selected at an exact discrete offset.
#[derive(Debug, Clone, PartialEq)]
pub struct DiscreteKeyframe {
    offset: KeyframeOffset,
    value: PropertyValue,
}

impl DiscreteKeyframe {
    pub const fn new(offset: KeyframeOffset, value: PropertyValue) -> Self {
        Self { offset, value }
    }

    pub const fn offset(&self) -> KeyframeOffset {
        self.offset
    }

    pub const fn value(&self) -> &PropertyValue {
        &self.value
    }
}

/// A format-neutral, hold-until-next-offset replacement curve.
///
/// The terminal offset may be below one, matching SMIL discrete keyTimes.
/// Frontends decide which properties admit this calculation mode.
#[derive(Debug, Clone, PartialEq)]
pub struct DiscreteCurve {
    keyframes: Box<[DiscreteKeyframe]>,
}

impl DiscreteCurve {
    pub fn new(mut keyframes: Vec<DiscreteKeyframe>) -> Result<Self, DiscreteCurveError> {
        if keyframes.is_empty() {
            return Err(DiscreteCurveError::Empty);
        }
        let expected = keyframes[0].value.kind();
        for (keyframe_index, keyframe) in keyframes.iter().enumerate().skip(1) {
            let actual = keyframe.value.kind();
            if actual != expected {
                return Err(DiscreteCurveError::MixedValueKind {
                    keyframe_index,
                    expected,
                    actual,
                });
            }
        }
        if keyframes.len() == 1 {
            keyframes[0].offset = KeyframeOffset::ZERO;
            return Ok(Self {
                keyframes: keyframes.into_boxed_slice(),
            });
        }
        if keyframes[0].offset != KeyframeOffset::ZERO {
            return Err(DiscreteCurveError::FirstOffsetMustBeZero {
                actual: keyframes[0].offset,
            });
        }
        for index in 1..keyframes.len() {
            let previous = keyframes[index - 1].offset;
            let current = keyframes[index].offset;
            if current <= previous {
                return Err(DiscreteCurveError::OffsetsNotStrictlyIncreasing {
                    previous_index: index - 1,
                    current_index: index,
                    previous,
                    current,
                });
            }
        }
        Ok(Self {
            keyframes: keyframes.into_boxed_slice(),
        })
    }

    pub fn keyframes(&self) -> &[DiscreteKeyframe] {
        &self.keyframes
    }

    pub fn first_value(&self) -> &PropertyValue {
        &self.keyframes[0].value
    }

    pub fn last_value(&self) -> &PropertyValue {
        &self.keyframes[self.keyframes.len() - 1].value
    }

    fn sample(&self, numerator: u64, denominator: u64) -> &PropertyValue {
        debug_assert!(denominator > 0);
        debug_assert!(numerator < denominator);
        let index = match self
            .keyframes
            .binary_search_by(|keyframe| keyframe.offset.cmp_ratio(numerator, denominator))
        {
            Ok(index) => index,
            Err(0) => 0,
            Err(index) => index - 1,
        };
        &self.keyframes[index].value
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscreteCurveError {
    Empty,
    MixedValueKind {
        keyframe_index: usize,
        expected: PropertyValueKind,
        actual: PropertyValueKind,
    },
    FirstOffsetMustBeZero {
        actual: KeyframeOffset,
    },
    OffsetsNotStrictlyIncreasing {
        previous_index: usize,
        current_index: usize,
        previous: KeyframeOffset,
        current: KeyframeOffset,
    },
}

impl std::fmt::Display for DiscreteCurveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "a discrete curve requires at least one keyframe"),
            Self::MixedValueKind {
                keyframe_index,
                expected,
                actual,
            } => write!(
                f,
                "discrete keyframe {keyframe_index} has {actual:?}, expected {expected:?}"
            ),
            Self::FirstOffsetMustBeZero { actual } => write!(
                f,
                "the first discrete keyframe offset must be 0, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::OffsetsNotStrictlyIncreasing {
                previous_index,
                current_index,
                previous,
                current,
            } => write!(
                f,
                "discrete keyframe offsets must increase strictly: index {previous_index} is {}/{}, index {current_index} is {}/{}",
                previous.numerator(),
                previous.denominator(),
                current.numerator(),
                current.denominator()
            ),
        }
    }
}

impl std::error::Error for DiscreteCurveError {}

/// A two-value discrete transition whose switch is measured after easing.
/// This represents SVG's bounded incompatible-path fallback without
/// pretending that it is an authored discrete keyframe schedule.
#[derive(Debug, Clone, PartialEq)]
struct EasedDiscretePair {
    from: PropertyValue,
    to: PropertyValue,
    easing: Easing,
}

impl EasedDiscretePair {
    fn path(from: Arc<PathGeometry>, to: Arc<PathGeometry>, easing: Easing) -> Self {
        Self {
            from: PropertyValue::PathGeometry(from),
            to: PropertyValue::PathGeometry(to),
            easing,
        }
    }

    const fn from(&self) -> &PropertyValue {
        &self.from
    }

    const fn to(&self) -> &PropertyValue {
        &self.to
    }

    fn sample(&self, numerator: u64, denominator: u64) -> &PropertyValue {
        let progress = BigRational::new(BigInt::from(numerator), BigInt::from(denominator));
        if self.easing.apply(&progress) < BigRational::new(BigInt::one(), BigInt::from(2)) {
            &self.from
        } else {
            &self.to
        }
    }
}

/// One SVG-compatible 2D transform operation.
///
/// This remains typed through interpolation and repeat accumulation. It is
/// converted to an affine lens operation only after sampling, so scale,
/// rotation centers, and accumulation never depend on matrix decomposition.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransformKind {
    Translate,
    Scale,
    Rotate,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TransformValue {
    Translate {
        x: f32,
        y: f32,
    },
    Scale {
        x: f32,
        y: f32,
    },
    Rotate {
        degrees: f32,
        center_x: f32,
        center_y: f32,
    },
}

impl TransformValue {
    pub const fn kind(self) -> TransformKind {
        match self {
            Self::Translate { .. } => TransformKind::Translate,
            Self::Scale { .. } => TransformKind::Scale,
            Self::Rotate { .. } => TransformKind::Rotate,
        }
    }

    pub const fn components(self) -> [f32; 3] {
        match self {
            Self::Translate { x, y } | Self::Scale { x, y } => [x, y, 0.0],
            Self::Rotate {
                degrees,
                center_x,
                center_y,
            } => [degrees, center_x, center_y],
        }
    }

    fn from_components(kind: TransformKind, [first, second, third]: [f32; 3]) -> Self {
        match kind {
            TransformKind::Translate => Self::Translate {
                x: first,
                y: second,
            },
            TransformKind::Scale => Self::Scale {
                x: first,
                y: second,
            },
            TransformKind::Rotate => Self::Rotate {
                degrees: first,
                center_x: second,
                center_y: third,
            },
        }
    }

    fn interpolate(self, to: Self, progress: &BigRational) -> Self {
        assert_eq!(
            self.kind(),
            to.kind(),
            "transform curve kinds are validated"
        );
        let from = self.components();
        let to = to.components();
        Self::from_components(
            self.kind(),
            std::array::from_fn(|index| {
                lerp_binary32_once_rational(from[index], to[index], progress)
            }),
        )
    }

    fn accumulated(self, terminal: Self, repeat_index: u64) -> Option<Self> {
        assert_eq!(
            self.kind(),
            terminal.kind(),
            "transform curve kinds are validated"
        );
        if repeat_index == 0 {
            return Some(self);
        }
        let value = self.components();
        let terminal = terminal.components();
        let components = std::array::from_fn(|index| {
            let exact = binary32_rational(value[index])
                + binary32_rational(terminal[index])
                    * BigRational::from_integer(BigInt::from(repeat_index));
            if exact.is_zero()
                && value[index] == 0.0
                && value[index].is_sign_negative()
                && terminal[index] == 0.0
                && terminal[index].is_sign_negative()
            {
                -0.0
            } else {
                round_rational_to_binary32(&exact)
            }
        });
        components
            .iter()
            .all(|value| value.is_finite())
            .then(|| Self::from_components(self.kind(), components))
    }

    fn into_lens_op(self) -> Option<LensOp> {
        let matrix = match self {
            Self::Translate { x, y } => Affine::translate(x, y),
            Self::Scale { x, y } => Affine::scale(x, y),
            Self::Rotate {
                degrees,
                center_x,
                center_y,
            } => Affine::translate(center_x, center_y)
                .then(&Affine::rotate_deg(degrees))
                .then(&Affine::translate(-center_x, -center_y)),
        };
        let m = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
        m.iter()
            .all(|value| value.is_finite())
            .then_some(LensOp::Matrix { m })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TransformKeyframe {
    offset: KeyframeOffset,
    value: TransformValue,
}

impl TransformKeyframe {
    pub const fn new(offset: KeyframeOffset, value: TransformValue) -> Self {
        Self { offset, value }
    }

    pub const fn offset(self) -> KeyframeOffset {
        self.offset
    }

    pub const fn value(self) -> TransformValue {
        self.value
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TransformSegment {
    easing: Easing,
    end: TransformKeyframe,
}

impl TransformSegment {
    pub const fn new(easing: Easing, end: TransformKeyframe) -> Self {
        Self { easing, end }
    }

    pub fn easing(&self) -> Easing {
        self.easing.clone()
    }

    pub const fn end(&self) -> TransformKeyframe {
        self.end
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TransformCurve {
    first: TransformKeyframe,
    segments: Box<[TransformSegment]>,
}

impl TransformCurve {
    pub fn new(
        first: TransformKeyframe,
        segments: Vec<TransformSegment>,
    ) -> Result<Self, TransformCurveError> {
        if !first
            .value
            .components()
            .iter()
            .all(|value| value.is_finite())
        {
            return Err(TransformCurveError::NonFiniteValue { keyframe_index: 0 });
        }
        if segments.is_empty() {
            return Ok(Self {
                first: TransformKeyframe::new(KeyframeOffset::ZERO, first.value),
                segments: Box::new([]),
            });
        }
        if first.offset != KeyframeOffset::ZERO {
            return Err(TransformCurveError::FirstOffsetMustBeZero {
                actual: first.offset,
            });
        }

        let kind = first.value.kind();
        let mut previous = first.offset;
        for (segment_index, segment) in segments.iter().enumerate() {
            let keyframe_index = segment_index + 1;
            if segment.end.value.kind() != kind {
                return Err(TransformCurveError::MixedKinds {
                    expected: kind,
                    keyframe_index,
                    actual: segment.end.value.kind(),
                });
            }
            if !segment
                .end
                .value
                .components()
                .iter()
                .all(|value| value.is_finite())
            {
                return Err(TransformCurveError::NonFiniteValue { keyframe_index });
            }
            let current = segment.end.offset;
            if current <= previous {
                return Err(TransformCurveError::OffsetsNotStrictlyIncreasing {
                    previous_index: segment_index,
                    current_index: keyframe_index,
                    previous,
                    current,
                });
            }
            previous = current;
        }
        if previous != KeyframeOffset::ONE {
            return Err(TransformCurveError::LastOffsetMustBeOne { actual: previous });
        }
        Ok(Self {
            first,
            segments: segments.into_boxed_slice(),
        })
    }

    pub fn linear(from: TransformValue, to: TransformValue) -> Result<Self, TransformCurveError> {
        Self::new(
            TransformKeyframe::new(KeyframeOffset::ZERO, from),
            vec![TransformSegment::new(
                Easing::Linear,
                TransformKeyframe::new(KeyframeOffset::ONE, to),
            )],
        )
    }

    pub fn constant(value: TransformValue) -> Result<Self, TransformCurveError> {
        Self::new(TransformKeyframe::new(KeyframeOffset::ZERO, value), vec![])
    }

    pub const fn first(&self) -> TransformKeyframe {
        self.first
    }

    pub fn segments(&self) -> &[TransformSegment] {
        &self.segments
    }

    pub fn keyframes(&self) -> impl Iterator<Item = &TransformKeyframe> {
        std::iter::once(&self.first).chain(self.segments.iter().map(|segment| &segment.end))
    }

    pub fn keyframe_count(&self) -> usize {
        1 + self.segments.len()
    }

    pub const fn kind(&self) -> TransformKind {
        self.first.value.kind()
    }

    pub const fn first_value(&self) -> TransformValue {
        self.first.value
    }

    pub fn last_value(&self) -> TransformValue {
        self.segments
            .last()
            .map_or(self.first.value, |segment| segment.end.value)
    }

    fn sample(&self, numerator: u64, denominator: u64) -> TransformValue {
        debug_assert!(denominator > 0);
        debug_assert!(numerator < denominator);
        if self.segments.is_empty() || numerator == 0 {
            return self.first.value;
        }
        let segment_index = match self
            .segments
            .binary_search_by(|segment| segment.end.offset.cmp_ratio(numerator, denominator))
        {
            Ok(index) => return self.segments[index].end.value,
            Err(index) => index,
        };
        let segment = &self.segments[segment_index];
        let start = segment_index
            .checked_sub(1)
            .map_or(self.first, |index| self.segments[index].end);
        let progress = BigRational::new(BigInt::from(numerator), BigInt::from(denominator));
        let start_offset = start.offset.rational();
        let end_offset = segment.end.offset.rational();
        let local = (&progress - &start_offset) / (&end_offset - &start_offset);
        start
            .value
            .interpolate(segment.end.value, &segment.easing.apply(&local))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransformCurveError {
    FirstOffsetMustBeZero {
        actual: KeyframeOffset,
    },
    LastOffsetMustBeOne {
        actual: KeyframeOffset,
    },
    OffsetsNotStrictlyIncreasing {
        previous_index: usize,
        current_index: usize,
        previous: KeyframeOffset,
        current: KeyframeOffset,
    },
    MixedKinds {
        expected: TransformKind,
        keyframe_index: usize,
        actual: TransformKind,
    },
    NonFiniteValue {
        keyframe_index: usize,
    },
}

impl std::fmt::Display for TransformCurveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FirstOffsetMustBeZero { actual } => write!(
                f,
                "the first transform keyframe offset must be 0, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::LastOffsetMustBeOne { actual } => write!(
                f,
                "the last transform keyframe offset must be 1, found {}/{}",
                actual.numerator(),
                actual.denominator()
            ),
            Self::OffsetsNotStrictlyIncreasing {
                previous_index,
                current_index,
                previous,
                current,
            } => write!(
                f,
                "transform keyframe offsets must increase strictly: index {previous_index} is {}/{}, index {current_index} is {}/{}",
                previous.numerator(),
                previous.denominator(),
                current.numerator(),
                current.denominator()
            ),
            Self::MixedKinds {
                expected,
                keyframe_index,
                actual,
            } => write!(
                f,
                "transform keyframe {keyframe_index} is {actual:?}, expected {expected:?}"
            ),
            Self::NonFiniteValue { keyframe_index } => {
                write!(f, "transform keyframe {keyframe_index} contains a non-finite component")
            }
        }
    }
}

impl std::error::Error for TransformCurveError {}

const CUBIC_BISECTION_STEPS: usize = 128;
const BINARY32_COMMON_DENOMINATOR_EXPONENT: usize = 149;

/// Exact power-basis coefficients for one cubic coordinate. Every finite
/// binary32 value is an integer over 2^149, so the controls can be compiled
/// once and all runtime bisection work can use bounded-size integers.
#[derive(Debug, PartialEq, Eq)]
struct CubicPolynomial {
    linear: BigInt,
    quadratic: BigInt,
    cubic: BigInt,
}

impl CubicPolynomial {
    fn new(control1: f32, control2: f32) -> Self {
        let control1 = binary32_scaled_integer(control1);
        let control2 = binary32_scaled_integer(control2);
        Self {
            linear: &control1 * 3,
            quadratic: &control2 * 3 - &control1 * 6,
            cubic: &control1 * 3 - &control2 * 3
                + (BigInt::one() << BINARY32_COMMON_DENOMINATOR_EXPONENT),
        }
    }

    /// Returns the exact coordinate numerator for `parameter_numerator / 2^depth`.
    /// The implicit positive denominator is `2^(149 + 3 * depth)`.
    fn numerator_at(&self, parameter_numerator: &BigInt, depth: usize) -> BigInt {
        parameter_numerator
            * ((&self.linear << (2 * depth))
                + parameter_numerator
                    * ((&self.quadratic << depth) + parameter_numerator * &self.cubic))
    }

    fn compare_at(
        &self,
        parameter_numerator: &BigInt,
        depth: usize,
        value: &BigRational,
    ) -> Ordering {
        let coordinate_numerator = self.numerator_at(parameter_numerator, depth);
        let left = coordinate_numerator * value.denom();
        let right = value.numer() << (BINARY32_COMMON_DENOMINATOR_EXPONENT + 3 * depth);
        left.cmp(&right)
    }

    fn rational_at(&self, parameter_numerator: &BigInt, depth: usize) -> BigRational {
        BigRational::new(
            self.numerator_at(parameter_numerator, depth),
            BigInt::one() << (BINARY32_COMMON_DENOMINATOR_EXPONENT + 3 * depth),
        )
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ExactCubicBezier {
    x: CubicPolynomial,
    y: CubicPolynomial,
}

impl ExactCubicBezier {
    fn new(x1: f32, y1: f32, x2: f32, y2: f32) -> Self {
        Self {
            x: CubicPolynomial::new(x1, x2),
            y: CubicPolynomial::new(y1, y2),
        }
    }
}

fn binary32_scaled_integer(value: f32) -> BigInt {
    let bits = value.to_bits();
    let negative = bits >> 31 != 0;
    let exponent_bits = ((bits >> 23) & 0xff) as usize;
    let fraction = bits & 0x7f_ff_ff;
    let (significand, shift) = if exponent_bits == 0 {
        (fraction, 0)
    } else {
        ((1 << 23) | fraction, exponent_bits - 1)
    };
    let magnitude = BigInt::from(significand) << shift;
    if negative {
        -magnitude
    } else {
        magnitude
    }
}

fn greatest_common_divisor(mut left: u64, mut right: u64) -> u64 {
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left
}

fn canonical_zero(value: f32) -> f32 {
    if value == 0.0 {
        0.0
    } else {
        value
    }
}

#[cfg(test)]
fn cubic_coordinate(
    control1: &BigRational,
    control2: &BigRational,
    parameter: &BigRational,
) -> BigRational {
    let inverse = BigRational::one() - parameter;
    let three = BigRational::from_integer(BigInt::from(3));
    &three * &inverse * &inverse * parameter * control1
        + &three * &inverse * parameter * parameter * control2
        + parameter * parameter * parameter
}

#[cfg(test)]
mod cubic_tests {
    use super::*;

    fn normalized_rational_reference(curve: &CubicBezier, input: &BigRational) -> BigRational {
        if input.is_zero() || input.is_one() {
            return input.clone();
        }
        if curve.x1 == curve.y1 && curve.x2 == curve.y2 {
            return input.clone();
        }

        let x1 = binary32_rational(curve.x1);
        let x2 = binary32_rational(curve.x2);
        let y1 = binary32_rational(curve.y1);
        let y2 = binary32_rational(curve.y2);
        let mut low = BigRational::zero();
        let mut high = BigRational::one();
        for _ in 0..CUBIC_BISECTION_STEPS {
            let midpoint = (&low + &high) / BigInt::from(2);
            match cubic_coordinate(&x1, &x2, &midpoint).cmp(input) {
                Ordering::Less => low = midpoint,
                Ordering::Greater => high = midpoint,
                Ordering::Equal => return cubic_coordinate(&y1, &y2, &midpoint),
            }
        }
        let parameter = (&low + &high) / BigInt::from(2);
        cubic_coordinate(&y1, &y2, &parameter)
    }

    #[test]
    fn integer_kernel_matches_the_normalized_rational_contract() {
        let curves = [
            CubicBezier::new(0.25, 0.1, 0.25, 1.0).unwrap(),
            CubicBezier::new(0.0, 1.0, 1.0, 1.0).unwrap(),
            CubicBezier::new(0.25, 0.25, 0.75, 0.75).unwrap(),
            CubicBezier::new(0.0, -1.0, 0.0, 2.0).unwrap(),
            CubicBezier::new(
                f32::from_bits(1),
                -f32::MAX,
                f32::from_bits(0x3f7f_ffff),
                f32::MAX,
            )
            .unwrap(),
        ];
        let inputs = [
            BigRational::zero(),
            BigRational::new(BigInt::one(), BigInt::from(u64::MAX)),
            BigRational::new(BigInt::one(), BigInt::from(3)),
            BigRational::new(BigInt::one(), BigInt::from(2)),
            BigRational::new(BigInt::from(2), BigInt::from(3)),
            BigRational::new(BigInt::from(u64::MAX - 1), BigInt::from(u64::MAX)),
            BigRational::one(),
        ];

        for curve in &curves {
            for input in &inputs {
                assert_eq!(
                    curve.apply(input),
                    normalized_rational_reference(curve, input),
                    "curve {curve:?} at {input}"
                );
            }
        }
    }

    #[test]
    fn integer_kernel_returns_a_depth_128_exact_inverse_hit() {
        let curve = CubicBezier::new(0.25, 0.1, 0.25, 1.0).unwrap();
        let denominator = BigInt::one() << CUBIC_BISECTION_STEPS;
        let parameter = BigRational::new(
            (BigInt::one() << (CUBIC_BISECTION_STEPS - 1)) + BigInt::one(),
            denominator,
        );
        let input = cubic_coordinate(
            &binary32_rational(curve.x1),
            &binary32_rational(curve.x2),
            &parameter,
        );
        let expected = cubic_coordinate(
            &binary32_rational(curve.y1),
            &binary32_rational(curve.y2),
            &parameter,
        );

        assert_eq!(curve.apply(&input), expected);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrackKind {
    AxisStart,
    FixedSize,
    Opacity,
    /// A complete singleton-solid value for the existing `Fills` aggregate.
    SolidFill,
    LensTransform,
    PathGeometry,
}

/// Trust-boundary ceiling for one exact-rational solid-fill sandwich.
///
/// Exact channel denominators can grow across additive effects. Bounding the
/// target stack keeps sampling work finite without weakening the ordinary
/// `Paints` model or introducing floating-point fallback.
pub const MAX_SOLID_FILL_EFFECTS_PER_TARGET: usize = 256;

/// How one effect combines with the lower-priority sandwich result.
///
/// This is format-neutral. SVG `additive="replace|sum"` is one frontend
/// spelling; future frontends may lower their own composition vocabulary to
/// the same operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompositeOperation {
    Replace,
    Add,
    /// Interpolate from the live lower sandwich value without cutting it off.
    InterpolateLiveUnderlying,
}

/// How later iterations combine with the effect's simple value.
///
/// `Accumulate` adds `repeat_index * final_keyframe` before the effect is
/// composed into its target sandwich.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IterationCompositeOperation {
    Replace,
    Accumulate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnimationValueOperation {
    Add,
    Accumulate,
    Project,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnderlyingValueShape {
    StartPin,
    CenterPin,
    EndPin,
    AxisSpan,
    FixedSize,
    AutoSize,
    Number,
    EmptyPaints,
    SolidPaint,
    InactiveSolidPaint,
    BlendedSolidPaint,
    NonSolidPaint,
    PaintStack,
    LensOps,
    PathGeometry,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnimationValueError {
    UnsupportedUnderlying {
        target: PropertyTarget,
        expected: TrackKind,
        actual: UnderlyingValueShape,
    },
    InvalidUnderlying {
        target: PropertyTarget,
        kind: TrackKind,
        reason: ScalarDomainError,
    },
    NonFiniteResult {
        target: PropertyTarget,
        operation: AnimationValueOperation,
    },
}

impl std::fmt::Display for AnimationValueError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedUnderlying {
                target,
                expected,
                actual,
            } => {
                if *expected == TrackKind::SolidFill {
                    write!(
                        f,
                        "animation target {target:?} needs exactly one active, normal-blend solid paint as its complete Fills underlying value, found {actual:?}"
                    )
                } else {
                    write!(
                        f,
                        "animation target {target:?} needs a compatible {expected:?} underlying value, found {actual:?}"
                    )
                }
            }
            Self::InvalidUnderlying {
                target,
                kind,
                reason,
            } => write!(
                f,
                "animation target {target:?} has an invalid {kind:?} underlying scalar: {reason:?}"
            ),
            Self::NonFiniteResult { target, operation } => write!(
                f,
                "animation {operation:?} produced a non-finite value for {target:?}"
            ),
        }
    }
}

impl std::error::Error for AnimationValueError {}

impl TrackKind {
    fn underlying_scalar(
        self,
        target: PropertyTarget,
        value: &PropertyValue,
    ) -> Result<f32, AnimationValueError> {
        let scalar = match (self, value) {
            (
                Self::AxisStart,
                PropertyValue::AxisBinding(AxisBinding::Pin {
                    anchor: AnchorEdge::Start,
                    offset,
                }),
            ) => Some(*offset),
            (Self::FixedSize, PropertyValue::SizeIntent(SizeIntent::Fixed(value))) => Some(*value),
            (Self::Opacity, PropertyValue::Number(value)) => Some(*value),
            (Self::SolidFill | Self::LensTransform | Self::PathGeometry, _) => None,
            _ => None,
        };
        let scalar = scalar.ok_or_else(|| AnimationValueError::UnsupportedUnderlying {
            target,
            expected: self,
            actual: underlying_value_shape(value),
        })?;
        if let Some(reason) = scalar_domain_error(self, scalar) {
            return Err(AnimationValueError::InvalidUnderlying {
                target,
                kind: self,
                reason,
            });
        }
        Ok(scalar)
    }

    fn underlying_color(
        self,
        target: PropertyTarget,
        value: &PropertyValue,
    ) -> Result<ExactColor, AnimationValueError> {
        let PropertyValue::Paints(paints) = value else {
            return Err(AnimationValueError::UnsupportedUnderlying {
                target,
                expected: self,
                actual: underlying_value_shape(value),
            });
        };
        let [Paint::Solid(paint)] = paints.as_slice() else {
            return Err(AnimationValueError::UnsupportedUnderlying {
                target,
                expected: self,
                actual: underlying_value_shape(value),
            });
        };
        if !paint.active || paint.blend_mode != BlendMode::Normal {
            return Err(AnimationValueError::UnsupportedUnderlying {
                target,
                expected: self,
                actual: underlying_value_shape(value),
            });
        }
        Ok(ExactColor::from(paint.color))
    }

    fn project_scalar(self, value: f32) -> PropertyValue {
        match self {
            Self::AxisStart => PropertyValue::AxisBinding(AxisBinding::start(value)),
            Self::FixedSize => PropertyValue::SizeIntent(SizeIntent::Fixed(value)),
            // SVG opacity addition is allowed to escape the property domain
            // internally. The existing document model remains normalized:
            // clamp once, after the complete sandwich has been composed.
            Self::Opacity => PropertyValue::Number(value.clamp(0.0, 1.0)),
            Self::SolidFill => unreachable!("solid fill tracks do not project scalar values"),
            Self::LensTransform => unreachable!("transform tracks do not project scalar values"),
            Self::PathGeometry => unreachable!("path tracks do not project scalar values"),
        }
    }
}

fn underlying_value_shape(value: &PropertyValue) -> UnderlyingValueShape {
    match value {
        PropertyValue::AxisBinding(AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            ..
        }) => UnderlyingValueShape::StartPin,
        PropertyValue::AxisBinding(AxisBinding::Pin {
            anchor: AnchorEdge::Center,
            ..
        }) => UnderlyingValueShape::CenterPin,
        PropertyValue::AxisBinding(AxisBinding::Pin {
            anchor: AnchorEdge::End,
            ..
        }) => UnderlyingValueShape::EndPin,
        PropertyValue::AxisBinding(AxisBinding::Span { .. }) => UnderlyingValueShape::AxisSpan,
        PropertyValue::SizeIntent(SizeIntent::Fixed(_)) => UnderlyingValueShape::FixedSize,
        PropertyValue::SizeIntent(SizeIntent::Auto) => UnderlyingValueShape::AutoSize,
        PropertyValue::Number(_) => UnderlyingValueShape::Number,
        PropertyValue::Paints(paints) => match paints.as_slice() {
            [] => UnderlyingValueShape::EmptyPaints,
            [Paint::Solid(paint)] if !paint.active => UnderlyingValueShape::InactiveSolidPaint,
            [Paint::Solid(paint)] if paint.blend_mode != BlendMode::Normal => {
                UnderlyingValueShape::BlendedSolidPaint
            }
            [Paint::Solid(_)] => UnderlyingValueShape::SolidPaint,
            [_] => UnderlyingValueShape::NonSolidPaint,
            _ => UnderlyingValueShape::PaintStack,
        },
        PropertyValue::LensOps(_) => UnderlyingValueShape::LensOps,
        PropertyValue::PathGeometry(_) => UnderlyingValueShape::PathGeometry,
        _ => UnderlyingValueShape::Other,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Endpoint {
    From,
    To,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScalarDomainError {
    NotFinite,
    Negative,
    OutsideUnitInterval,
    OutsideFiniteBinary32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrackError {
    EmptySource,
    WrongProperty {
        source: String,
        kind: TrackKind,
        actual: PropertyKey,
    },
    InvalidEndpoint {
        source: String,
        kind: TrackKind,
        endpoint: Endpoint,
        reason: ScalarDomainError,
    },
    InvalidKeyframe {
        source: String,
        kind: TrackKind,
        keyframe_index: usize,
        reason: ScalarDomainError,
    },
    UnsafeCubicControl {
        source: String,
        kind: TrackKind,
        segment_index: usize,
        control: CubicControl,
        reason: ScalarDomainError,
    },
    InvalidTransformProjection {
        source: String,
        keyframe_index: usize,
    },
    InvalidEffectValue {
        source: String,
        keyframe_index: usize,
        expected: PropertyValueKind,
        actual: PropertyValueKind,
    },
    InvalidPathGeometry {
        source: String,
        keyframe_index: usize,
        reason: String,
    },
    InvalidComposition {
        source: String,
        effect: TrackEffectKind,
        composite: CompositeOperation,
        iteration_composite: IterationCompositeOperation,
    },
}

impl std::fmt::Display for TrackError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TrackError::EmptySource => write!(f, "animation track source identity must not be empty"),
            TrackError::WrongProperty {
                source,
                kind,
                actual,
            } => write!(
                f,
                "animation track {source} of kind {kind:?} cannot target {actual:?}"
            ),
            TrackError::InvalidEndpoint {
                source,
                kind,
                endpoint,
                reason,
            } => write!(
                f,
                "animation track {source} has invalid {endpoint:?} endpoint for {kind:?}: {reason:?}"
            ),
            TrackError::InvalidKeyframe {
                source,
                kind,
                keyframe_index,
                reason,
            } => write!(
                f,
                "animation track {source} has invalid keyframe {keyframe_index} for {kind:?}: {reason:?}"
            ),
            TrackError::UnsafeCubicControl {
                source,
                kind,
                segment_index,
                control,
                reason,
            } => write!(
                f,
                "animation track {source} segment {segment_index} has an unsafe {control:?} property-space control for {kind:?}: {reason:?}"
            ),
            TrackError::InvalidTransformProjection {
                source,
                keyframe_index,
            } => write!(
                f,
                "animation track {source} transform keyframe {keyframe_index} cannot be represented as a finite affine value"
            ),
            TrackError::InvalidEffectValue {
                source,
                keyframe_index,
                expected,
                actual,
            } => write!(
                f,
                "animation track {source} keyframe {keyframe_index} has {actual:?}, expected {expected:?}"
            ),
            TrackError::InvalidPathGeometry {
                source,
                keyframe_index,
                reason,
            } => write!(
                f,
                "animation track {source} path keyframe {keyframe_index} is invalid: {reason}"
            ),
            TrackError::InvalidComposition {
                source,
                effect,
                composite,
                iteration_composite,
            } => write!(
                f,
                "animation track {source} effect {effect:?} does not admit {composite:?} composition with {iteration_composite:?} iteration composition"
            ),
        }
    }
}

impl std::error::Error for TrackError {}

/// The closed value/effect vocabulary sampled by one track.
#[derive(Debug, Clone, PartialEq)]
enum TrackEffect {
    /// Context-free scalar keyframes.
    ScalarCurve(ScalarCurve),
    /// Interpolate from the live lower sandwich value to `target`.
    ScalarFromLiveUnderlying { target: f32, easing: Easing },
    /// Context-free singleton-solid fill keyframes.
    SolidFillCurve(ColorCurve),
    /// Interpolate a singleton-solid lower fill to `target`.
    SolidFillFromLiveUnderlying { target: Color, easing: Easing },
    /// One typed 2D transform operation per keyframe.
    TransformCurve(TransformCurve),
    /// Compatible normalized path geometry interpolated component-wise.
    PathCurve(PathCurve),
    /// Complete property values selected by an authored discrete schedule.
    DiscreteCurve(DiscreteCurve),
    /// A bounded two-value discrete fallback measured after easing.
    EasedDiscretePair(EasedDiscretePair),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrackEffectKind {
    ScalarCurve,
    ScalarFromLiveUnderlying,
    SolidFillCurve,
    SolidFillFromLiveUnderlying,
    TransformCurve,
    PathCurve,
    DiscreteCurve,
    EasedDiscretePair,
}

impl TrackEffect {
    const fn kind(&self) -> TrackEffectKind {
        match self {
            Self::ScalarCurve(_) => TrackEffectKind::ScalarCurve,
            Self::ScalarFromLiveUnderlying { .. } => TrackEffectKind::ScalarFromLiveUnderlying,
            Self::SolidFillCurve(_) => TrackEffectKind::SolidFillCurve,
            Self::SolidFillFromLiveUnderlying { .. } => {
                TrackEffectKind::SolidFillFromLiveUnderlying
            }
            Self::TransformCurve(_) => TrackEffectKind::TransformCurve,
            Self::PathCurve(_) => TrackEffectKind::PathCurve,
            Self::DiscreteCurve(_) => TrackEffectKind::DiscreteCurve,
            Self::EasedDiscretePair(_) => TrackEffectKind::EasedDiscretePair,
        }
    }

    fn admits_composition(
        &self,
        composite: CompositeOperation,
        iteration_composite: IterationCompositeOperation,
    ) -> bool {
        match self {
            Self::ScalarCurve(_) | Self::SolidFillCurve(_) | Self::TransformCurve(_) => {
                composite != CompositeOperation::InterpolateLiveUnderlying
            }
            Self::ScalarFromLiveUnderlying { .. } | Self::SolidFillFromLiveUnderlying { .. } => {
                composite == CompositeOperation::InterpolateLiveUnderlying
                    && iteration_composite == IterationCompositeOperation::Replace
            }
            Self::PathCurve(_) | Self::DiscreteCurve(_) | Self::EasedDiscretePair(_) => {
                composite == CompositeOperation::Replace
                    && iteration_composite == IterationCompositeOperation::Replace
            }
        }
    }
}

/// One prevalidated typed effect. Constructors are separated by output shape
/// so an authored frontend cannot pair a property with the wrong runtime
/// representation.
#[derive(Debug, Clone, PartialEq)]
pub struct Track {
    source: String,
    target: PropertyTarget,
    kind: TrackKind,
    effect: TrackEffect,
    timing: Timing,
    fill: FillMode,
    composite: CompositeOperation,
    iteration_composite: IterationCompositeOperation,
}

impl Track {
    pub fn axis_start(
        source: impl Into<String>,
        target: PropertyTarget,
        from: f32,
        to: f32,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_linear(source, target, TrackKind::AxisStart, from, to, timing, fill)
    }

    pub fn fixed_size(
        source: impl Into<String>,
        target: PropertyTarget,
        from: f32,
        to: f32,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_linear(source, target, TrackKind::FixedSize, from, to, timing, fill)
    }

    pub fn opacity(
        source: impl Into<String>,
        target: PropertyTarget,
        from: f32,
        to: f32,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_linear(source, target, TrackKind::Opacity, from, to, timing, fill)
    }

    pub fn solid_fill(
        source: impl Into<String>,
        target: PropertyTarget,
        from: Color,
        to: Color,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_solid_fill_curve(source, target, ColorCurve::linear(from, to), timing, fill)
    }

    pub fn axis_start_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        curve: ScalarCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_curve(source, target, TrackKind::AxisStart, curve, timing, fill)
    }

    pub fn fixed_size_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        curve: ScalarCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_curve(source, target, TrackKind::FixedSize, curve, timing, fill)
    }

    pub fn opacity_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        curve: ScalarCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_curve(source, target, TrackKind::Opacity, curve, timing, fill)
    }

    pub fn solid_fill_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        curve: ColorCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_solid_fill_curve(source, target, curve, timing, fill)
    }

    pub fn axis_start_from_live_underlying(
        source: impl Into<String>,
        target: PropertyTarget,
        to: f32,
        easing: Easing,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_scalar_from_live_underlying(
            source,
            target,
            TrackKind::AxisStart,
            to,
            easing,
            timing,
            fill,
        )
    }

    pub fn fixed_size_from_live_underlying(
        source: impl Into<String>,
        target: PropertyTarget,
        to: f32,
        easing: Easing,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_scalar_from_live_underlying(
            source,
            target,
            TrackKind::FixedSize,
            to,
            easing,
            timing,
            fill,
        )
    }

    pub fn opacity_from_live_underlying(
        source: impl Into<String>,
        target: PropertyTarget,
        to: f32,
        easing: Easing,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        Self::new_scalar_from_live_underlying(
            source,
            target,
            TrackKind::Opacity,
            to,
            easing,
            timing,
            fill,
        )
    }

    pub fn solid_fill_from_live_underlying(
        source: impl Into<String>,
        target: PropertyTarget,
        to: Color,
        easing: Easing,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, TrackKind::SolidFill)?;
        Ok(Self {
            source,
            target,
            kind: TrackKind::SolidFill,
            effect: TrackEffect::SolidFillFromLiveUnderlying { target: to, easing },
            timing,
            fill,
            composite: CompositeOperation::InterpolateLiveUnderlying,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    pub fn lens_transform_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        curve: TransformCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, TrackKind::LensTransform)?;
        validate_transform_curve_domain(&source, &curve)?;
        Ok(Self {
            source,
            target,
            kind: TrackKind::LensTransform,
            effect: TrackEffect::TransformCurve(curve),
            timing,
            fill,
            composite: CompositeOperation::Replace,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    pub fn path_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        curve: PathCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, TrackKind::PathGeometry)?;
        Ok(Self {
            source,
            target,
            kind: TrackKind::PathGeometry,
            effect: TrackEffect::PathCurve(curve),
            timing,
            fill,
            composite: CompositeOperation::Replace,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    pub fn path_discrete_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        curve: DiscreteCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, TrackKind::PathGeometry)?;
        validate_discrete_path_values(
            &source,
            curve.keyframes().iter().map(|keyframe| keyframe.value()),
        )?;
        Ok(Self {
            source,
            target,
            kind: TrackKind::PathGeometry,
            effect: TrackEffect::DiscreteCurve(curve),
            timing,
            fill,
            composite: CompositeOperation::Replace,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    pub fn path_discrete_fallback(
        source: impl Into<String>,
        target: PropertyTarget,
        from: Arc<PathGeometry>,
        to: Arc<PathGeometry>,
        easing: Easing,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, TrackKind::PathGeometry)?;
        let effect = EasedDiscretePair::path(from, to, easing);
        validate_discrete_path_values(&source, [effect.from(), effect.to()].into_iter())?;
        Ok(Self {
            source,
            target,
            kind: TrackKind::PathGeometry,
            effect: TrackEffect::EasedDiscretePair(effect),
            timing,
            fill,
            composite: CompositeOperation::Replace,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    fn new_linear(
        source: impl Into<String>,
        target: PropertyTarget,
        kind: TrackKind,
        from: f32,
        to: f32,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, kind)?;
        validate_endpoint(&source, kind, Endpoint::From, from)?;
        validate_endpoint(&source, kind, Endpoint::To, to)?;
        Ok(Self {
            source,
            target,
            kind,
            effect: TrackEffect::ScalarCurve(ScalarCurve::linear(from, to)),
            timing,
            fill,
            composite: CompositeOperation::Replace,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    fn new_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        kind: TrackKind,
        curve: ScalarCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, kind)?;
        validate_curve_domain(&source, kind, &curve)?;
        Ok(Self {
            source,
            target,
            kind,
            effect: TrackEffect::ScalarCurve(curve),
            timing,
            fill,
            composite: CompositeOperation::Replace,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    fn new_scalar_from_live_underlying(
        source: impl Into<String>,
        target: PropertyTarget,
        kind: TrackKind,
        to: f32,
        easing: Easing,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, kind)?;
        validate_endpoint(&source, kind, Endpoint::To, to)?;
        validate_live_underlying_easing(&source, kind, &easing)?;
        Ok(Self {
            source,
            target,
            kind,
            effect: TrackEffect::ScalarFromLiveUnderlying { target: to, easing },
            timing,
            fill,
            composite: CompositeOperation::InterpolateLiveUnderlying,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    fn new_solid_fill_curve(
        source: impl Into<String>,
        target: PropertyTarget,
        curve: ColorCurve,
        timing: Timing,
        fill: FillMode,
    ) -> Result<Self, TrackError> {
        let source = source.into();
        validate_track_identity(&source, target, TrackKind::SolidFill)?;
        Ok(Self {
            source,
            target,
            kind: TrackKind::SolidFill,
            effect: TrackEffect::SolidFillCurve(curve),
            timing,
            fill,
            composite: CompositeOperation::Replace,
            iteration_composite: IterationCompositeOperation::Replace,
        })
    }

    pub fn source(&self) -> &str {
        &self.source
    }

    pub const fn target(&self) -> PropertyTarget {
        self.target
    }

    pub const fn kind(&self) -> TrackKind {
        self.kind
    }

    pub const fn effect_kind(&self) -> TrackEffectKind {
        self.effect.kind()
    }

    pub fn scalar_curve(&self) -> Option<&ScalarCurve> {
        match &self.effect {
            TrackEffect::ScalarCurve(curve) => Some(curve),
            _ => None,
        }
    }

    pub fn transform_curve(&self) -> Option<&TransformCurve> {
        match &self.effect {
            TrackEffect::TransformCurve(curve) => Some(curve),
            _ => None,
        }
    }

    pub fn color_curve(&self) -> Option<&ColorCurve> {
        match &self.effect {
            TrackEffect::SolidFillCurve(curve) => Some(curve),
            _ => None,
        }
    }

    pub fn path_curve_value(&self) -> Option<&PathCurve> {
        match &self.effect {
            TrackEffect::PathCurve(curve) => Some(curve),
            _ => None,
        }
    }

    pub fn discrete_curve(&self) -> Option<&DiscreteCurve> {
        match &self.effect {
            TrackEffect::DiscreteCurve(curve) => Some(curve),
            _ => None,
        }
    }

    pub const fn timing(&self) -> Timing {
        self.timing
    }

    pub const fn fill(&self) -> FillMode {
        self.fill
    }

    pub const fn composite(&self) -> CompositeOperation {
        self.composite
    }

    pub const fn iteration_composite(&self) -> IterationCompositeOperation {
        self.iteration_composite
    }

    /// Select effect and iteration composition when that pair is meaningful
    /// for this effect class.
    pub fn with_composition(
        mut self,
        composite: CompositeOperation,
        iteration_composite: IterationCompositeOperation,
    ) -> Result<Self, TrackError> {
        if !self
            .effect
            .admits_composition(composite, iteration_composite)
        {
            return Err(TrackError::InvalidComposition {
                source: self.source.clone(),
                effect: self.effect.kind(),
                composite,
                iteration_composite,
            });
        }
        self.composite = composite;
        self.iteration_composite = iteration_composite;
        Ok(self)
    }

    fn scalar_value(&self, value: f32) -> PropertyValue {
        match self.kind {
            TrackKind::AxisStart => PropertyValue::AxisBinding(AxisBinding::start(value)),
            TrackKind::FixedSize => PropertyValue::SizeIntent(SizeIntent::Fixed(value)),
            TrackKind::Opacity => PropertyValue::Number(value),
            TrackKind::SolidFill => {
                unreachable!("solid fill tracks do not project scalar values")
            }
            TrackKind::LensTransform => {
                unreachable!("transform tracks do not project scalar values")
            }
            TrackKind::PathGeometry => {
                unreachable!("path tracks do not project scalar values")
            }
        }
    }

    fn endpoint_values(&self) -> Vec<PropertyValue> {
        match &self.effect {
            TrackEffect::ScalarCurve(curve) => curve
                .keyframes()
                .map(|keyframe| self.scalar_value(keyframe.value))
                .collect(),
            TrackEffect::ScalarFromLiveUnderlying { target, .. } => {
                vec![self.scalar_value(*target)]
            }
            TrackEffect::SolidFillCurve(curve) => curve
                .keyframes()
                .map(|keyframe| PropertyValue::Paints(Paints::solid(keyframe.color)))
                .collect(),
            TrackEffect::SolidFillFromLiveUnderlying { target, .. } => {
                vec![PropertyValue::Paints(Paints::solid(*target))]
            }
            TrackEffect::TransformCurve(curve) => curve
                .keyframes()
                .map(|keyframe| {
                    PropertyValue::LensOps(vec![keyframe
                        .value
                        .into_lens_op()
                        .expect("track validation checks transform projection")])
                })
                .collect(),
            TrackEffect::PathCurve(curve) => curve
                .keyframes()
                .map(|keyframe| PropertyValue::PathGeometry(Arc::clone(keyframe.path())))
                .collect(),
            TrackEffect::DiscreteCurve(curve) => curve
                .keyframes()
                .iter()
                .map(|keyframe| keyframe.value().clone())
                .collect(),
            TrackEffect::EasedDiscretePair(effect) => {
                vec![effect.from().clone(), effect.to().clone()]
            }
        }
    }

    fn contribution(&self, time: SampleTime) -> Contribution {
        self.timing.contribution(time, self.fill)
    }

    fn overwrites_underlying(&self) -> bool {
        self.composite == CompositeOperation::Replace
    }

    fn needs_underlying(&self) -> bool {
        matches!(
            self.composite,
            CompositeOperation::Add | CompositeOperation::InterpolateLiveUnderlying
        )
    }
}

fn validate_track_identity(
    source: &str,
    target: PropertyTarget,
    kind: TrackKind,
) -> Result<(), TrackError> {
    if source.is_empty() {
        return Err(TrackError::EmptySource);
    }
    let property_matches = match kind {
        TrackKind::AxisStart => matches!(target.property, PropertyKey::X | PropertyKey::Y),
        TrackKind::FixedSize => matches!(target.property, PropertyKey::Width | PropertyKey::Height),
        TrackKind::Opacity => target.property == PropertyKey::Opacity,
        TrackKind::SolidFill => target.property == PropertyKey::Fills,
        TrackKind::LensTransform => target.property == PropertyKey::LensOps,
        TrackKind::PathGeometry => target.property == PropertyKey::PathGeometry,
    };
    if !property_matches {
        return Err(TrackError::WrongProperty {
            source: source.to_owned(),
            kind,
            actual: target.property,
        });
    }
    Ok(())
}

fn validate_discrete_path_values<'a>(
    source: &str,
    values: impl IntoIterator<Item = &'a PropertyValue>,
) -> Result<(), TrackError> {
    for (keyframe_index, value) in values.into_iter().enumerate() {
        match value {
            PropertyValue::PathGeometry(path) => {
                path.validate()
                    .map_err(|error| TrackError::InvalidPathGeometry {
                        source: source.to_owned(),
                        keyframe_index,
                        reason: error.to_string(),
                    })?;
            }
            _ => {
                return Err(TrackError::InvalidEffectValue {
                    source: source.to_owned(),
                    keyframe_index,
                    expected: PropertyValueKind::PathGeometry,
                    actual: value.kind(),
                });
            }
        }
    }
    Ok(())
}

fn validate_endpoint(
    source: &str,
    kind: TrackKind,
    endpoint: Endpoint,
    value: f32,
) -> Result<(), TrackError> {
    let reason = scalar_domain_error(kind, value);
    match reason {
        Some(reason) => Err(TrackError::InvalidEndpoint {
            source: source.to_owned(),
            kind,
            endpoint,
            reason,
        }),
        None => Ok(()),
    }
}

fn validate_curve_domain(
    source: &str,
    kind: TrackKind,
    curve: &ScalarCurve,
) -> Result<(), TrackError> {
    for (keyframe_index, keyframe) in curve.keyframes().enumerate() {
        if let Some(reason) = scalar_domain_error(kind, keyframe.value) {
            return Err(TrackError::InvalidKeyframe {
                source: source.to_owned(),
                kind,
                keyframe_index,
                reason,
            });
        }
    }

    let mut start = curve.first;
    for (segment_index, segment) in curve.segments.iter().enumerate() {
        if let Easing::CubicBezier(easing) = &segment.easing {
            let from = binary32_rational(start.value);
            let to = binary32_rational(segment.end.value);
            let delta = &to - &from;
            for (control, timing_control) in
                [(CubicControl::Y1, easing.y1), (CubicControl::Y2, easing.y2)]
            {
                let property_control = &from + &delta * binary32_rational(timing_control);
                if let Some(reason) = rational_domain_error(kind, &property_control) {
                    return Err(TrackError::UnsafeCubicControl {
                        source: source.to_owned(),
                        kind,
                        segment_index,
                        control,
                        reason,
                    });
                }
            }
        }
        start = segment.end;
    }
    Ok(())
}

fn validate_live_underlying_easing(
    source: &str,
    kind: TrackKind,
    easing: &Easing,
) -> Result<(), TrackError> {
    let Easing::CubicBezier(easing) = easing else {
        return Ok(());
    };
    // The lower endpoint is known only at sample time. Constraining timing-y
    // to the unit interval makes every result a convex interpolation between
    // two already-valid values, so no deferred domain check is required.
    for (control, value) in [(CubicControl::Y1, easing.y1), (CubicControl::Y2, easing.y2)] {
        if !(0.0..=1.0).contains(&value) {
            return Err(TrackError::UnsafeCubicControl {
                source: source.to_owned(),
                kind,
                segment_index: 0,
                control,
                reason: ScalarDomainError::OutsideUnitInterval,
            });
        }
    }
    Ok(())
}

fn validate_transform_curve_domain(source: &str, curve: &TransformCurve) -> Result<(), TrackError> {
    for (keyframe_index, keyframe) in curve.keyframes().enumerate() {
        if keyframe.value.into_lens_op().is_none() {
            return Err(TrackError::InvalidTransformProjection {
                source: source.to_owned(),
                keyframe_index,
            });
        }
    }

    let mut start = curve.first;
    for (segment_index, segment) in curve.segments.iter().enumerate() {
        if let Easing::CubicBezier(easing) = &segment.easing {
            let from = start.value.components();
            let to = segment.end.value.components();
            for component in 0..3 {
                let from = binary32_rational(from[component]);
                let delta = binary32_rational(to[component]) - &from;
                for (control, timing_control) in
                    [(CubicControl::Y1, easing.y1), (CubicControl::Y2, easing.y2)]
                {
                    let property_control = &from + &delta * binary32_rational(timing_control);
                    if let Some(reason) =
                        rational_domain_error(TrackKind::LensTransform, &property_control)
                    {
                        return Err(TrackError::UnsafeCubicControl {
                            source: source.to_owned(),
                            kind: TrackKind::LensTransform,
                            segment_index,
                            control,
                            reason,
                        });
                    }
                }
            }
        }
        start = segment.end;
    }
    Ok(())
}

fn scalar_domain_error(kind: TrackKind, value: f32) -> Option<ScalarDomainError> {
    if !value.is_finite() {
        return Some(ScalarDomainError::NotFinite);
    }
    match kind {
        TrackKind::AxisStart => None,
        TrackKind::FixedSize if value < 0.0 => Some(ScalarDomainError::Negative),
        TrackKind::FixedSize => None,
        TrackKind::Opacity if !(0.0..=1.0).contains(&value) => {
            Some(ScalarDomainError::OutsideUnitInterval)
        }
        TrackKind::Opacity => None,
        TrackKind::SolidFill => unreachable!("solid fill tracks have no scalar domain"),
        TrackKind::LensTransform => None,
        TrackKind::PathGeometry => unreachable!("path tracks have no scalar domain"),
    }
}

fn rational_domain_error(kind: TrackKind, value: &BigRational) -> Option<ScalarDomainError> {
    let zero = BigRational::zero();
    let maximum = binary32_rational(f32::MAX);
    match kind {
        TrackKind::AxisStart if value < &-&maximum || value > &maximum => {
            Some(ScalarDomainError::OutsideFiniteBinary32)
        }
        TrackKind::AxisStart => None,
        TrackKind::FixedSize if value < &zero => Some(ScalarDomainError::Negative),
        TrackKind::FixedSize if value > &maximum => Some(ScalarDomainError::OutsideFiniteBinary32),
        TrackKind::FixedSize => None,
        TrackKind::Opacity if value < &zero || value > &BigRational::one() => {
            Some(ScalarDomainError::OutsideUnitInterval)
        }
        TrackKind::Opacity => None,
        TrackKind::SolidFill => unreachable!("solid fill tracks have no scalar domain"),
        TrackKind::LensTransform if value < &-&maximum || value > &maximum => {
            Some(ScalarDomainError::OutsideFiniteBinary32)
        }
        TrackKind::LensTransform => None,
        TrackKind::PathGeometry => unreachable!("path tracks have no scalar domain"),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Contribution {
    None,
    Active {
        repeat_index: u64,
        numerator: u64,
        denominator: u64,
    },
    To,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SampledScalar {
    value: f32,
    repeat_index: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SampledTransform {
    value: TransformValue,
    repeat_index: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ExactColor {
    /// Straight legacy-sRGB red, green, blue, and alpha in unbounded byte
    /// channel space. Values are exact until the complete sandwich projects.
    channels: [BigRational; 4],
}

impl From<Color> for ExactColor {
    fn from(color: Color) -> Self {
        let argb = color.argb();
        Self {
            channels: [
                BigRational::from_integer(BigInt::from((argb >> 16) & 0xff)),
                BigRational::from_integer(BigInt::from((argb >> 8) & 0xff)),
                BigRational::from_integer(BigInt::from(argb & 0xff)),
                BigRational::from_integer(BigInt::from(argb >> 24)),
            ],
        }
    }
}

impl ExactColor {
    fn interpolate(&self, to: &Self, progress: &BigRational) -> Self {
        if progress.is_zero() || self == to {
            return self.clone();
        }
        if progress.is_one() {
            return to.clone();
        }
        Self {
            channels: std::array::from_fn(|index| {
                &self.channels[index] + (&to.channels[index] - &self.channels[index]) * progress
            }),
        }
    }

    fn add(&self, effect: &Self) -> Self {
        Self {
            channels: std::array::from_fn(|index| &self.channels[index] + &effect.channels[index]),
        }
    }

    fn accumulated(&self, terminal: Color, repeat_index: u64) -> Self {
        if repeat_index == 0 {
            return self.clone();
        }
        let terminal = Self::from(terminal);
        let repeat_index = BigRational::from_integer(BigInt::from(repeat_index));
        Self {
            channels: std::array::from_fn(|index| {
                &self.channels[index] + &terminal.channels[index] * &repeat_index
            }),
        }
    }

    fn into_color(self) -> Color {
        let [red, green, blue, alpha] = self.channels.map(round_color_channel);
        Color(
            (u32::from(alpha) << 24)
                | (u32::from(red) << 16)
                | (u32::from(green) << 8)
                | u32::from(blue),
        )
    }
}

fn round_color_channel(value: BigRational) -> u8 {
    let zero = BigRational::zero();
    let maximum = BigRational::from_integer(BigInt::from(255_u16));
    let value = if value < zero {
        zero
    } else if value > maximum {
        maximum
    } else {
        value
    };
    // Presentation conversion for non-negative channels is nearest integer,
    // with an exact half rounded upward (matching SVG color presentation in
    // Chromium and Rust's positive `f32::round`).
    let numerator = value.numer();
    let denominator = value.denom();
    let rounded: BigInt = (numerator * 2_u8 + denominator) / (denominator * 2_u8);
    rounded
        .to_u8()
        .expect("a clamped color channel is an integer from zero through 255")
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SampledColor {
    value: ExactColor,
    repeat_index: u64,
}

fn stack_underlying_scalar(
    document: &Document,
    stack: &[Track],
) -> Result<f32, AnimationValueError> {
    let track = &stack[0];
    let node = document
        .node_for_key(track.target.node)
        .expect("target validity is checked before composition");
    let value = track
        .target
        .property
        .spec()
        .base_value(node)
        .expect("target applicability is checked before composition");
    track.kind.underlying_scalar(track.target, &value)
}

fn stack_underlying_color(
    document: &Document,
    stack: &[Track],
) -> Result<ExactColor, AnimationValueError> {
    let track = &stack[0];
    let node = document
        .node_for_key(track.target.node)
        .expect("target validity is checked before composition");
    let value = track
        .target
        .property
        .spec()
        .base_value(node)
        .expect("target applicability is checked before composition");
    track.kind.underlying_color(track.target, &value)
}

fn stack_underlying_lens_ops(document: &Document, stack: &[Track]) -> Vec<LensOp> {
    let track = &stack[0];
    let node = document
        .node_for_key(track.target.node)
        .expect("target validity is checked before composition");
    match track
        .target
        .property
        .spec()
        .base_value(node)
        .expect("target applicability is checked before composition")
    {
        PropertyValue::LensOps(ops) => ops,
        _ => unreachable!("lens transform tracks target the LensOps property"),
    }
}

fn validate_stack_underlying_lens_ops(
    document: &Document,
    stack: &[Track],
) -> Result<(), PropertyError> {
    let target = stack[0].target;
    PropertyValues::new(
        document,
        [(
            target,
            PropertyValue::LensOps(stack_underlying_lens_ops(document, stack)),
        )],
    )
    .map(|_| ())
}

fn sampled_scalar_curve(
    curve: &ScalarCurve,
    contribution: Contribution,
    repeat_count: u64,
) -> SampledScalar {
    match contribution {
        Contribution::None => unreachable!("callers retain contributing tracks only"),
        Contribution::To => SampledScalar {
            value: curve.last_value(),
            repeat_index: repeat_count - 1,
        },
        Contribution::Active {
            repeat_index,
            numerator,
            denominator,
        } => SampledScalar {
            value: curve.sample(numerator, denominator),
            repeat_index,
        },
    }
}

fn sampled_transform_curve(
    curve: &TransformCurve,
    contribution: Contribution,
    repeat_count: u64,
) -> SampledTransform {
    match contribution {
        Contribution::None => unreachable!("callers retain contributing tracks only"),
        Contribution::To => SampledTransform {
            value: curve.last_value(),
            repeat_index: repeat_count - 1,
        },
        Contribution::Active {
            repeat_index,
            numerator,
            denominator,
        } => SampledTransform {
            value: curve.sample(numerator, denominator),
            repeat_index,
        },
    }
}

fn sampled_color_curve(
    curve: &ColorCurve,
    contribution: Contribution,
    repeat_count: u64,
) -> SampledColor {
    match contribution {
        Contribution::None => unreachable!("callers retain contributing tracks only"),
        Contribution::To => SampledColor {
            value: ExactColor::from(curve.last_color()),
            repeat_index: repeat_count - 1,
        },
        Contribution::Active {
            repeat_index,
            numerator,
            denominator,
        } => SampledColor {
            value: curve.sample(numerator, denominator),
            repeat_index,
        },
    }
}

fn scalar_from_live_underlying_value(
    underlying: f32,
    target: f32,
    easing: &Easing,
    contribution: Contribution,
) -> f32 {
    match contribution {
        Contribution::None => unreachable!("callers retain contributing tracks only"),
        Contribution::To => target,
        Contribution::Active {
            numerator,
            denominator,
            ..
        } => {
            let progress = BigRational::new(BigInt::from(numerator), BigInt::from(denominator));
            lerp_binary32_once_rational(underlying, target, &easing.apply(&progress))
        }
    }
}

fn color_from_live_underlying_value(
    underlying: &ExactColor,
    target: Color,
    easing: &Easing,
    contribution: Contribution,
) -> ExactColor {
    match contribution {
        Contribution::None => unreachable!("callers retain contributing tracks only"),
        Contribution::To => ExactColor::from(target),
        Contribution::Active {
            numerator,
            denominator,
            ..
        } => {
            let progress = BigRational::new(BigInt::from(numerator), BigInt::from(denominator));
            underlying.interpolate(&ExactColor::from(target), &easing.apply(&progress))
        }
    }
}

fn accumulated_scalar(track: &Track, sampled: SampledScalar) -> Result<f32, AnimationValueError> {
    if track.iteration_composite == IterationCompositeOperation::Replace
        || sampled.repeat_index == 0
    {
        return Ok(sampled.value);
    }

    let terminal = match &track.effect {
        TrackEffect::ScalarCurve(curve) => curve.last_value(),
        _ => unreachable!("only scalar curves use iteration accumulation"),
    };
    let exact = binary32_rational(sampled.value)
        + binary32_rational(terminal)
            * BigRational::from_integer(BigInt::from(sampled.repeat_index));
    let value = if exact.is_zero()
        && sampled.value == 0.0
        && sampled.value.is_sign_negative()
        && terminal == 0.0
        && terminal.is_sign_negative()
    {
        -0.0
    } else {
        round_rational_to_binary32(&exact)
    };
    value
        .is_finite()
        .then_some(value)
        .ok_or(AnimationValueError::NonFiniteResult {
            target: track.target,
            operation: AnimationValueOperation::Accumulate,
        })
}

fn accumulated_transform(
    track: &Track,
    sampled: SampledTransform,
) -> Result<TransformValue, AnimationValueError> {
    if track.iteration_composite == IterationCompositeOperation::Replace
        || sampled.repeat_index == 0
    {
        return Ok(sampled.value);
    }
    let terminal = match &track.effect {
        TrackEffect::TransformCurve(curve) => curve.last_value(),
        _ => unreachable!("only transform curves use transform accumulation"),
    };
    sampled
        .value
        .accumulated(terminal, sampled.repeat_index)
        .ok_or(AnimationValueError::NonFiniteResult {
            target: track.target,
            operation: AnimationValueOperation::Accumulate,
        })
}

fn accumulated_color(track: &Track, sampled: SampledColor) -> ExactColor {
    if track.iteration_composite == IterationCompositeOperation::Replace
        || sampled.repeat_index == 0
    {
        return sampled.value;
    }
    let terminal = match &track.effect {
        TrackEffect::SolidFillCurve(curve) => curve.last_color(),
        _ => unreachable!("only color curves use color accumulation"),
    };
    sampled.value.accumulated(terminal, sampled.repeat_index)
}

fn projected_transform(
    track: &Track,
    value: TransformValue,
) -> Result<LensOp, AnimationValueError> {
    value
        .into_lens_op()
        .ok_or(AnimationValueError::NonFiniteResult {
            target: track.target,
            operation: AnimationValueOperation::Project,
        })
}

fn add_scalar(
    target: PropertyTarget,
    underlying: f32,
    effect: f32,
) -> Result<f32, AnimationValueError> {
    let exact = binary32_rational(underlying) + binary32_rational(effect);
    let value = if exact.is_zero()
        && underlying == 0.0
        && underlying.is_sign_negative()
        && effect == 0.0
        && effect.is_sign_negative()
    {
        -0.0
    } else {
        round_rational_to_binary32(&exact)
    };
    value
        .is_finite()
        .then_some(value)
        .ok_or(AnimationValueError::NonFiniteResult {
            target,
            operation: AnimationValueOperation::Add,
        })
}

/// Immutable, document-bound effect stacks in canonical target
/// order.
///
/// The constructor receives tracks in low-to-high effect priority. Canonical
/// target grouping preserves that relative order within each target. Priority
/// is a program-level relation supplied by the frontend, not an intrinsic
/// property of a [`Track`].
#[derive(Debug, Clone, PartialEq)]
pub struct AnimationProgram {
    compiler_id: String,
    document_root: NodeKey,
    tracks: Vec<Track>,
}

impl AnimationProgram {
    pub fn new(
        document: &Document,
        compiler_id: impl Into<String>,
        mut tracks_low_to_high_priority: Vec<Track>,
    ) -> Result<Self, ProgramError> {
        let compiler_id = compiler_id.into();
        if compiler_id.is_empty() {
            return Err(ProgramError::EmptyCompilerId);
        }
        let document_root = document
            .key_of(document.root)
            .ok_or(ProgramError::DocumentHasNoLiveRoot)?;

        // Stable target grouping preserves the caller's low-to-high priority
        // order inside every effect stack.
        tracks_low_to_high_priority.sort_by_key(Track::target);
        let tracks = tracks_low_to_high_priority;

        for stack in tracks.chunk_by(|left, right| left.target == right.target) {
            if stack[0].kind == TrackKind::SolidFill
                && stack.len() > MAX_SOLID_FILL_EFFECTS_PER_TARGET
            {
                return Err(ProgramError::TooManySolidFillEffects {
                    target: stack[0].target,
                    count: stack.len(),
                    maximum: MAX_SOLID_FILL_EFFECTS_PER_TARGET,
                });
            }
        }

        for track in &tracks {
            let endpoint_values = track.endpoint_values();
            let keyframe_count = endpoint_values.len();
            for (keyframe_index, value) in endpoint_values.into_iter().enumerate() {
                PropertyValues::new(document, [(track.target, value)]).map_err(|error| {
                    if matches!(
                        track.effect,
                        TrackEffect::ScalarFromLiveUnderlying { .. }
                            | TrackEffect::SolidFillFromLiveUnderlying { .. }
                    ) {
                        ProgramError::InvalidEndpoint {
                            source: track.source.clone(),
                            endpoint: Endpoint::To,
                            error,
                        }
                    } else if keyframe_count == 2 {
                        ProgramError::InvalidEndpoint {
                            source: track.source.clone(),
                            endpoint: if keyframe_index == 0 {
                                Endpoint::From
                            } else {
                                Endpoint::To
                            },
                            error,
                        }
                    } else {
                        ProgramError::InvalidKeyframe {
                            source: track.source.clone(),
                            keyframe_index,
                            error,
                        }
                    }
                })?;
            }
        }

        for stack in tracks.chunk_by(|left, right| left.target == right.target) {
            if !stack.iter().any(Track::needs_underlying) {
                continue;
            }
            let sources = || unique_sources(stack.iter().filter(|track| track.needs_underlying()));
            if stack[0].kind == TrackKind::LensTransform {
                validate_stack_underlying_lens_ops(document, stack).map_err(|error| {
                    ProgramError::InvalidValues {
                        sources: sources(),
                        error,
                    }
                })?;
            } else if stack[0].kind == TrackKind::SolidFill {
                stack_underlying_color(document, stack).map_err(|error| {
                    ProgramError::InvalidComposition {
                        sources: sources(),
                        error,
                    }
                })?;
            } else {
                stack_underlying_scalar(document, stack).map_err(|error| {
                    ProgramError::InvalidComposition {
                        sources: sources(),
                        error,
                    }
                })?;
            }
        }

        Ok(Self {
            compiler_id,
            document_root,
            tracks,
        })
    }

    pub fn empty(
        document: &Document,
        compiler_id: impl Into<String>,
    ) -> Result<Self, ProgramError> {
        Self::new(document, compiler_id, vec![])
    }

    pub fn compiler_id(&self) -> &str {
        &self.compiler_id
    }

    pub const fn document_root(&self) -> NodeKey {
        self.document_root
    }

    pub fn tracks(&self) -> &[Track] {
        &self.tracks
    }

    /// Target-major effect stacks. Tracks inside each slice are ordered
    /// from lowest to highest effect priority.
    pub fn effect_stacks(&self) -> impl Iterator<Item = &[Track]> {
        self.tracks
            .chunk_by(|left, right| left.target == right.target)
    }

    /// Sample all tracks atomically. Any stale target or invalid combined
    /// effective state rejects the complete value set.
    pub fn sample(
        &self,
        document: &Document,
        time: SampleTime,
    ) -> Result<PropertyValues, SampleError> {
        let actual = document.key_of(document.root);
        if actual != Some(self.document_root) {
            return Err(SampleError::DocumentMismatch {
                compiler_id: self.compiler_id.clone(),
                time,
                expected: self.document_root,
                actual,
            });
        }

        // Program validity is independent from contribution state. A stale or
        // newly inapplicable target must not disappear behind pre-begin or
        // post-remove inactivity and silently turn Sample into Base.
        for stack in self.effect_stacks() {
            let target = stack[0].target;
            let error = match document.node_for_key(target.node) {
                None => Some(PropertyError::StaleTarget { target }),
                Some(node) if !target.property.spec().applies_to(node) => {
                    Some(PropertyError::Inapplicable {
                        target,
                        applicability: target.property.spec().applicability,
                    })
                }
                Some(_) => None,
            };
            if let Some(error) = error {
                return Err(SampleError::InvalidValues {
                    compiler_id: self.compiler_id.clone(),
                    time,
                    sources: unique_sources(stack.iter()),
                    error,
                });
            }
            if stack.iter().any(Track::needs_underlying) {
                let sources =
                    || unique_sources(stack.iter().filter(|track| track.needs_underlying()));
                if stack[0].kind == TrackKind::LensTransform {
                    validate_stack_underlying_lens_ops(document, stack).map_err(|error| {
                        SampleError::InvalidValues {
                            compiler_id: self.compiler_id.clone(),
                            time,
                            sources: sources(),
                            error,
                        }
                    })?;
                } else if stack[0].kind == TrackKind::SolidFill {
                    stack_underlying_color(document, stack).map_err(|error| {
                        SampleError::InvalidComposition {
                            compiler_id: self.compiler_id.clone(),
                            time,
                            sources: sources(),
                            error,
                        }
                    })?;
                } else {
                    stack_underlying_scalar(document, stack).map_err(|error| {
                        SampleError::InvalidComposition {
                            compiler_id: self.compiler_id.clone(),
                            time,
                            sources: sources(),
                            error,
                        }
                    })?;
                }
            }
        }

        let mut entries = Vec::new();
        let mut contributors = Vec::new();
        let mut sampled = Vec::new();
        for stack in self.effect_stacks() {
            sampled.clear();
            sampled.extend(
                stack
                    .iter()
                    .map(|track| (track, track.contribution(time)))
                    .filter(|(_, contribution)| *contribution != Contribution::None),
            );
            if sampled.is_empty() {
                continue;
            }

            let replacement = sampled
                .iter()
                .rposition(|(track, _)| track.overwrites_underlying());
            let influential = &sampled[replacement.unwrap_or(0)..];
            let sources = || unique_sources(influential.iter().map(|(track, _)| *track));
            let track = influential.last().expect("sampled stack is non-empty").0;
            if track.kind == TrackKind::PathGeometry {
                let (track, contribution) = *influential
                    .last()
                    .expect("a contributing path stack is non-empty");
                let value = match (&track.effect, contribution) {
                    (
                        TrackEffect::PathCurve(curve),
                        Contribution::Active {
                            numerator,
                            denominator,
                            ..
                        },
                    ) => PropertyValue::PathGeometry(curve.sample(numerator, denominator)),
                    (TrackEffect::PathCurve(curve), Contribution::To) => {
                        PropertyValue::PathGeometry(Arc::clone(curve.last_path()))
                    }
                    (
                        TrackEffect::DiscreteCurve(curve),
                        Contribution::Active {
                            numerator,
                            denominator,
                            ..
                        },
                    ) => curve.sample(numerator, denominator).clone(),
                    (TrackEffect::DiscreteCurve(curve), Contribution::To) => {
                        curve.last_value().clone()
                    }
                    (
                        TrackEffect::EasedDiscretePair(effect),
                        Contribution::Active {
                            numerator,
                            denominator,
                            ..
                        },
                    ) => effect.sample(numerator, denominator).clone(),
                    (TrackEffect::EasedDiscretePair(effect), Contribution::To) => {
                        effect.to().clone()
                    }
                    (_, Contribution::None) => {
                        unreachable!("non-contributing tracks are removed before sampling")
                    }
                    _ => unreachable!("path targets accept only path geometry effects"),
                };
                entries.push((track.target, value));
            } else if track.kind == TrackKind::LensTransform {
                let mut value = replacement
                    .is_none()
                    .then(|| stack_underlying_lens_ops(document, stack));
                for &(track, contribution) in influential {
                    let TrackEffect::TransformCurve(curve) = &track.effect else {
                        unreachable!("LensOps targets accept only transform curves")
                    };
                    let sampled =
                        sampled_transform_curve(curve, contribution, track.timing.repeat_count);
                    let effect = accumulated_transform(track, sampled)
                        .and_then(|value| projected_transform(track, value))
                        .map_err(|error| SampleError::InvalidComposition {
                            compiler_id: self.compiler_id.clone(),
                            time,
                            sources: unique_sources(std::iter::once(track)),
                            error,
                        })?;
                    match track.composite {
                        CompositeOperation::Replace => value = Some(vec![effect]),
                        CompositeOperation::Add => value
                            .as_mut()
                            .expect("additive transform stacks have an underlying list")
                            .push(effect),
                        CompositeOperation::InterpolateLiveUnderlying => {
                            unreachable!("transform curves reject live-underlying composition")
                        }
                    }
                }
                entries.push((
                    track.target,
                    PropertyValue::LensOps(value.expect("a contributing stack produces a value")),
                ));
            } else if track.kind == TrackKind::SolidFill {
                let mut value = match replacement {
                    Some(_) => None,
                    None => Some(stack_underlying_color(document, stack).map_err(|error| {
                        SampleError::InvalidComposition {
                            compiler_id: self.compiler_id.clone(),
                            time,
                            sources: sources(),
                            error,
                        }
                    })?),
                };

                for &(track, contribution) in influential {
                    match &track.effect {
                        TrackEffect::SolidFillCurve(curve) => {
                            let sampled =
                                sampled_color_curve(curve, contribution, track.timing.repeat_count);
                            let effect = accumulated_color(track, sampled);
                            value = Some(match track.composite {
                                CompositeOperation::Replace => effect,
                                CompositeOperation::Add => value
                                    .as_ref()
                                    .expect("additive fill-color stacks have an underlying color")
                                    .add(&effect),
                                CompositeOperation::InterpolateLiveUnderlying => {
                                    unreachable!("color curves reject live-underlying composition")
                                }
                            });
                        }
                        TrackEffect::SolidFillFromLiveUnderlying { target, easing } => {
                            value = Some(color_from_live_underlying_value(
                                value.as_ref().expect(
                                    "live-underlying color effects retain their lower sandwich value",
                                ),
                                *target,
                                easing,
                                contribution,
                            ));
                        }
                        _ => unreachable!("fill-color targets accept only color effects"),
                    }
                }
                entries.push((
                    track.target,
                    PropertyValue::Paints(Paints::solid(
                        value
                            .expect("a contributing fill-color stack produces a value")
                            .into_color(),
                    )),
                ));
            } else {
                let mut value = match replacement {
                    Some(_) => None,
                    None => Some(stack_underlying_scalar(document, stack).map_err(|error| {
                        SampleError::InvalidComposition {
                            compiler_id: self.compiler_id.clone(),
                            time,
                            sources: sources(),
                            error,
                        }
                    })?),
                };

                for (index, &(track, contribution)) in influential.iter().enumerate() {
                    match &track.effect {
                        TrackEffect::ScalarCurve(curve) => {
                            let sampled = sampled_scalar_curve(
                                curve,
                                contribution,
                                track.timing.repeat_count,
                            );
                            let effect = accumulated_scalar(track, sampled).map_err(|error| {
                                SampleError::InvalidComposition {
                                    compiler_id: self.compiler_id.clone(),
                                    time,
                                    sources: unique_sources(std::iter::once(track)),
                                    error,
                                }
                            })?;
                            value = Some(match track.composite {
                                CompositeOperation::Replace => effect,
                                CompositeOperation::Add => add_scalar(
                                    track.target,
                                    value.expect("additive stacks have an underlying scalar"),
                                    effect,
                                )
                                .map_err(|error| SampleError::InvalidComposition {
                                    compiler_id: self.compiler_id.clone(),
                                    time,
                                    sources: unique_sources(
                                        influential[..=index].iter().map(|(track, _)| *track),
                                    ),
                                    error,
                                })?,
                                CompositeOperation::InterpolateLiveUnderlying => {
                                    unreachable!("scalar curves reject live-underlying composition")
                                }
                            });
                        }
                        TrackEffect::ScalarFromLiveUnderlying { target, easing } => {
                            value = Some(scalar_from_live_underlying_value(
                                value.expect(
                                    "live-underlying effects retain their lower sandwich value",
                                ),
                                *target,
                                easing,
                                contribution,
                            ));
                        }
                        TrackEffect::SolidFillCurve(_)
                        | TrackEffect::SolidFillFromLiveUnderlying { .. }
                        | TrackEffect::TransformCurve(_)
                        | TrackEffect::PathCurve(_)
                        | TrackEffect::DiscreteCurve(_)
                        | TrackEffect::EasedDiscretePair(_) => {
                            unreachable!("scalar targets accept only scalar effects")
                        }
                    }
                }
                entries.push((
                    track.target,
                    track.kind.project_scalar(
                        value.expect("a contributing scalar stack produces a value"),
                    ),
                ));
            }
            contributors.extend(influential.iter().map(|(track, _)| *track));
        }
        PropertyValues::new(document, entries).map_err(|error| SampleError::InvalidValues {
            compiler_id: self.compiler_id.clone(),
            time,
            sources: implicated_sources(&contributors, &error),
            error,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProgramError {
    EmptyCompilerId,
    DocumentHasNoLiveRoot,
    TooManySolidFillEffects {
        target: PropertyTarget,
        count: usize,
        maximum: usize,
    },
    InvalidEndpoint {
        source: String,
        endpoint: Endpoint,
        error: PropertyError,
    },
    InvalidKeyframe {
        source: String,
        keyframe_index: usize,
        error: PropertyError,
    },
    InvalidValues {
        sources: Vec<String>,
        error: PropertyError,
    },
    InvalidComposition {
        sources: Vec<String>,
        error: AnimationValueError,
    },
}

impl std::fmt::Display for ProgramError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProgramError::EmptyCompilerId => {
                write!(f, "animation compiler identity must not be empty")
            }
            ProgramError::DocumentHasNoLiveRoot => {
                write!(f, "animation program document has no live root")
            }
            ProgramError::TooManySolidFillEffects {
                target,
                count,
                maximum,
            } => write!(
                f,
                "animation target {target:?} has {count} solid-fill effects; the exact-channel limit is {maximum}"
            ),
            ProgramError::InvalidEndpoint {
                source,
                endpoint,
                error,
            } => write!(
                f,
                "animation track {source} has an invalid {endpoint:?} endpoint: {error}"
            ),
            ProgramError::InvalidKeyframe {
                source,
                keyframe_index,
                error,
            } => write!(
                f,
                "animation track {source} has an invalid keyframe {keyframe_index}: {error}"
            ),
            ProgramError::InvalidValues { sources, error } => write!(
                f,
                "animation tracks {sources:?} have invalid underlying values: {error}"
            ),
            ProgramError::InvalidComposition { sources, error } => write!(
                f,
                "animation tracks {sources:?} have invalid composition: {error}"
            ),
        }
    }
}

impl std::error::Error for ProgramError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ProgramError::InvalidEndpoint { error, .. }
            | ProgramError::InvalidKeyframe { error, .. }
            | ProgramError::InvalidValues { error, .. } => Some(error),
            ProgramError::InvalidComposition { error, .. } => Some(error),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum SampleError {
    DocumentMismatch {
        compiler_id: String,
        time: SampleTime,
        expected: NodeKey,
        actual: Option<NodeKey>,
    },
    InvalidValues {
        compiler_id: String,
        time: SampleTime,
        sources: Vec<String>,
        error: PropertyError,
    },
    InvalidComposition {
        compiler_id: String,
        time: SampleTime,
        sources: Vec<String>,
        error: AnimationValueError,
    },
}

impl std::fmt::Display for SampleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SampleError::DocumentMismatch {
                compiler_id,
                time,
                expected,
                actual,
            } => write!(
                f,
                "animation program {compiler_id} failed at {}ns: compiled for {expected:?}, found {actual:?}",
                time.nanoseconds()
            ),
            SampleError::InvalidValues {
                compiler_id,
                time,
                sources,
                error,
            } => write!(
                f,
                "animation program {compiler_id} failed at {}ns for {sources:?}: {error}",
                time.nanoseconds()
            ),
            SampleError::InvalidComposition {
                compiler_id,
                time,
                sources,
                error,
            } => write!(
                f,
                "animation program {compiler_id} failed composition at {}ns for {sources:?}: {error}",
                time.nanoseconds()
            ),
        }
    }
}

impl std::error::Error for SampleError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            SampleError::InvalidValues { error, .. } => Some(error),
            SampleError::InvalidComposition { error, .. } => Some(error),
            _ => None,
        }
    }
}

fn implicated_sources(tracks: &[&Track], error: &PropertyError) -> Vec<String> {
    let implicated = match error {
        PropertyError::DuplicateTarget { target }
        | PropertyError::StaleTarget { target }
        | PropertyError::WrongValueKind { target, .. }
        | PropertyError::Inapplicable { target, .. }
        | PropertyError::InvalidValue { target, .. } => tracks
            .iter()
            .copied()
            .filter(|track| track.target == *target)
            .collect::<Vec<_>>(),
        PropertyError::InvalidEffectiveState {
            node, properties, ..
        } => tracks
            .iter()
            .copied()
            .filter(|track| {
                track.target.node == *node && properties.contains(&track.target.property)
            })
            .collect::<Vec<_>>(),
    };
    unique_sources(implicated)
}

fn unique_sources<'a>(tracks: impl IntoIterator<Item = &'a Track>) -> Vec<String> {
    let mut sources = Vec::new();
    for track in tracks {
        if !sources.iter().any(|source| source == &track.source) {
            sources.push(track.source.clone());
        }
    }
    sources
}

/// Evaluate `from + (to - from) * progress` exactly, then round once to
/// IEEE-754 binary32 under round-to-nearest, ties-to-even. Endpoint fast paths
/// preserve authored zero signs and bits.
fn lerp_binary32_once_rational(from: f32, to: f32, progress: &BigRational) -> f32 {
    if progress.is_zero() || from.to_bits() == to.to_bits() {
        return from;
    }
    if progress.is_one() {
        return to;
    }

    let from = binary32_rational(from);
    let to = binary32_rational(to);
    let exact = &from + (&to - &from) * progress;
    round_rational_to_binary32(&exact)
}

fn binary32_rational(value: f32) -> BigRational {
    let bits = value.to_bits();
    let negative = bits >> 31 != 0;
    let exponent_bits = ((bits >> 23) & 0xff) as i32;
    let fraction = bits & 0x7f_ff_ff;
    if exponent_bits == 0 && fraction == 0 {
        return BigRational::zero();
    }

    let (significand, exponent) = if exponent_bits == 0 {
        (fraction, -149)
    } else {
        ((1 << 23) | fraction, exponent_bits - 127 - 23)
    };
    let mut numerator = BigInt::from(significand);
    if negative {
        numerator = -numerator;
    }
    if exponent >= 0 {
        BigRational::from_integer(numerator << exponent as usize)
    } else {
        BigRational::new(numerator, BigInt::one() << (-exponent) as usize)
    }
}

fn round_rational_to_binary32(value: &BigRational) -> f32 {
    if value.is_zero() {
        return 0.0;
    }
    let sign = if value.is_negative() { 1_u32 << 31 } else { 0 };
    let numerator = value
        .numer()
        .abs()
        .to_biguint()
        .expect("absolute numerator is non-negative");
    let denominator = value
        .denom()
        .to_biguint()
        .expect("rational denominator is positive");
    let mut exponent = floor_log2_ratio(&numerator, &denominator);

    let magnitude_bits = if exponent >= -126 {
        let mut significand = round_scaled_ratio(&numerator, &denominator, 23 - exponent);
        let carry = BigUint::one() << 24_usize;
        if significand == carry {
            significand >>= 1_usize;
            exponent += 1;
        }
        if exponent > 127 {
            0x7f80_0000
        } else {
            let significand = significand.to_u32().expect("binary32 significand fits u32");
            (((exponent + 127) as u32) << 23) | (significand - (1 << 23))
        }
    } else {
        let significand = round_scaled_ratio(&numerator, &denominator, 149);
        significand
            .to_u32()
            .expect("binary32 subnormal significand fits u32")
    };
    f32::from_bits(sign | magnitude_bits)
}

fn floor_log2_ratio(numerator: &BigUint, denominator: &BigUint) -> i32 {
    let mut exponent = numerator.bits() as i32 - denominator.bits() as i32;
    let below = if exponent >= 0 {
        numerator < &(denominator << exponent as usize)
    } else {
        &(numerator << (-exponent) as usize) < denominator
    };
    if below {
        exponent -= 1;
    }
    exponent
}

fn round_scaled_ratio(numerator: &BigUint, denominator: &BigUint, binary_shift: i32) -> BigUint {
    let (scaled_numerator, scaled_denominator) = if binary_shift >= 0 {
        (numerator << binary_shift as usize, denominator.clone())
    } else {
        (numerator.clone(), denominator << (-binary_shift) as usize)
    };
    let quotient = &scaled_numerator / &scaled_denominator;
    let remainder = &scaled_numerator % &scaled_denominator;
    let twice_remainder = &remainder << 1_usize;
    let odd = (&quotient & BigUint::one()) == BigUint::one();
    if twice_remainder > scaled_denominator || (twice_remainder == scaled_denominator && odd) {
        quotient + BigUint::one()
    } else {
        quotient
    }
}
