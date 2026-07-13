//! Format-neutral, explicit-time animation sampling.
//!
//! Authored frontends compile immutable typed tracks once. Sampling then maps
//! one exact [`SampleTime`] to the ordinary [`PropertyValues`] boundary without
//! mutating the [`Document`]. Clocks, playback, source parsing, and rendering
//! belong outside this module.

use crate::model::{AxisBinding, Document, NodeKey, SizeIntent};
use crate::properties::{
    PropertyError, PropertyKey, PropertyTarget, PropertyValue, PropertyValues,
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Endpoint {
    From,
    To,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndpointError {
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
        reason: EndpointError,
    },
    InvalidKeyframe {
        source: String,
        kind: TrackKind,
        keyframe_index: usize,
        reason: EndpointError,
    },
    UnsafeCubicControl {
        source: String,
        kind: TrackKind,
        segment_index: usize,
        control: CubicControl,
        reason: EndpointError,
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
        }
    }
}

impl std::error::Error for TrackError {}

/// One prevalidated replacement effect. Constructors are separated by output
/// shape so an authored frontend cannot pair a property with the wrong runtime
/// representation.
#[derive(Debug, Clone, PartialEq)]
pub struct Track {
    source: String,
    target: PropertyTarget,
    kind: TrackKind,
    curve: ScalarCurve,
    timing: Timing,
    fill: FillMode,
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
            curve: ScalarCurve::linear(from, to),
            timing,
            fill,
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
            curve,
            timing,
            fill,
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

    pub fn from(&self) -> f32 {
        self.curve.first_value()
    }

    pub fn to(&self) -> f32 {
        self.curve.last_value()
    }

    pub const fn curve(&self) -> &ScalarCurve {
        &self.curve
    }

    pub const fn timing(&self) -> Timing {
        self.timing
    }

    pub const fn fill(&self) -> FillMode {
        self.fill
    }

    fn endpoint_value(&self, value: f32) -> PropertyValue {
        match self.kind {
            TrackKind::AxisStart => PropertyValue::AxisBinding(AxisBinding::start(value)),
            TrackKind::FixedSize => PropertyValue::SizeIntent(SizeIntent::Fixed(value)),
            TrackKind::Opacity => PropertyValue::Number(value),
        }
    }

    fn sampled_value(&self, time: SampleTime) -> Option<PropertyValue> {
        match self.timing.contribution(time, self.fill) {
            Contribution::None => None,
            Contribution::To => Some(self.endpoint_value(self.curve.last_value())),
            Contribution::Active {
                numerator,
                denominator,
            } => Some(self.endpoint_value(self.curve.sample(numerator, denominator))),
        }
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

fn scalar_domain_error(kind: TrackKind, value: f32) -> Option<EndpointError> {
    if !value.is_finite() {
        return Some(EndpointError::NotFinite);
    }
    match kind {
        TrackKind::AxisStart => None,
        TrackKind::FixedSize if value < 0.0 => Some(EndpointError::Negative),
        TrackKind::FixedSize => None,
        TrackKind::Opacity if !(0.0..=1.0).contains(&value) => {
            Some(EndpointError::OutsideUnitInterval)
        }
        TrackKind::Opacity => None,
    }
}

fn rational_domain_error(kind: TrackKind, value: &BigRational) -> Option<EndpointError> {
    let zero = BigRational::zero();
    let maximum = binary32_rational(f32::MAX);
    match kind {
        TrackKind::AxisStart if value < &-&maximum || value > &maximum => {
            Some(EndpointError::OutsideFiniteBinary32)
        }
        TrackKind::AxisStart => None,
        TrackKind::FixedSize if value < &zero => Some(EndpointError::Negative),
        TrackKind::FixedSize if value > &maximum => Some(EndpointError::OutsideFiniteBinary32),
        TrackKind::FixedSize => None,
        TrackKind::Opacity if value < &zero || value > &BigRational::one() => {
            Some(EndpointError::OutsideUnitInterval)
        }
        TrackKind::Opacity => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Contribution {
    None,
    Active { numerator: u64, denominator: u64 },
    To,
}

/// Immutable, document-bound tracks in canonical target order.
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
        mut tracks: Vec<Track>,
    ) -> Result<Self, ProgramError> {
        let compiler_id = compiler_id.into();
        if compiler_id.is_empty() {
            return Err(ProgramError::EmptyCompilerId);
        }
        let document_root = document
            .key_of(document.root)
            .ok_or(ProgramError::DocumentHasNoLiveRoot)?;

        tracks.sort_by_key(Track::target);
        for pair in tracks.windows(2) {
            if pair[0].target == pair[1].target {
                return Err(ProgramError::DuplicateTarget {
                    target: pair[0].target,
                    first_source: pair[0].source.clone(),
                    second_source: pair[1].source.clone(),
                });
            }
        }

        for track in &tracks {
            let keyframe_count = track.curve.keyframe_count();
            for (keyframe_index, keyframe) in track.curve.keyframes().enumerate() {
                PropertyValues::new(
                    document,
                    [(track.target, track.endpoint_value(keyframe.value))],
                )
                .map_err(|error| {
                    if keyframe_count == 2 {
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
        for track in &self.tracks {
            let error = match document.node_for_key(track.target.node) {
                None => Some(PropertyError::StaleTarget {
                    target: track.target,
                }),
                Some(node) if !track.target.property.spec().applies_to(node) => {
                    Some(PropertyError::Inapplicable {
                        target: track.target,
                        applicability: track.target.property.spec().applicability,
                    })
                }
                Some(_) => None,
            };
            if let Some(error) = error {
                return Err(SampleError::InvalidValues {
                    compiler_id: self.compiler_id.clone(),
                    time,
                    sources: vec![track.source.clone()],
                    error,
                });
            }
        }

        let entries = self
            .tracks
            .iter()
            .filter_map(|track| track.sampled_value(time).map(|value| (track.target, value)))
            .collect::<Vec<_>>();
        PropertyValues::new(document, entries).map_err(|error| SampleError::InvalidValues {
            compiler_id: self.compiler_id.clone(),
            time,
            sources: implicated_sources(&self.tracks, &error),
            error,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProgramError {
    EmptyCompilerId,
    DocumentHasNoLiveRoot,
    DuplicateTarget {
        target: PropertyTarget,
        first_source: String,
        second_source: String,
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
            ProgramError::DuplicateTarget {
                target,
                first_source,
                second_source,
            } => write!(
                f,
                "animation tracks {first_source} and {second_source} both target {target:?}"
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
        }
    }
}

impl std::error::Error for ProgramError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ProgramError::InvalidEndpoint { error, .. }
            | ProgramError::InvalidKeyframe { error, .. } => Some(error),
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
        }
    }
}

impl std::error::Error for SampleError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            SampleError::InvalidValues { error, .. } => Some(error),
            _ => None,
        }
    }
}

fn implicated_sources(tracks: &[Track], error: &PropertyError) -> Vec<String> {
    let mut sources: Vec<String> = match error {
        PropertyError::DuplicateTarget { target }
        | PropertyError::StaleTarget { target }
        | PropertyError::WrongValueKind { target, .. }
        | PropertyError::Inapplicable { target, .. }
        | PropertyError::InvalidValue { target, .. } => tracks
            .iter()
            .filter(|track| track.target == *target)
            .map(|track| track.source.clone())
            .collect(),
        PropertyError::InvalidEffectiveState {
            node, properties, ..
        } => tracks
            .iter()
            .filter(|track| {
                track.target.node == *node && properties.contains(&track.target.property)
            })
            .map(|track| track.source.clone())
            .collect(),
    };
    sources.sort();
    sources.dedup();
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
