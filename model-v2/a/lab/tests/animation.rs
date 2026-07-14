use anchor_lab::animation::{
    AnimationProgram, AnimationValueError, AnimationValueOperation, CompositeOperation,
    CubicBezier, CubicBezierError, CubicControl, Easing, Endpoint, FillMode,
    IterationCompositeOperation, KeyframeOffset, KeyframeOffsetError, ProgramError, SampleError,
    SampleTime, ScalarCurve, ScalarCurveError, ScalarDomainError, ScalarKeyframe, ScalarSegment,
    Timing, TimingError, Track, TrackEffectKind, TrackError, TrackKind, TransformCurve,
    TransformCurveError, TransformKeyframe, TransformSegment, TransformValue, UnderlyingValueShape,
};
use anchor_lab::model::{
    AxisBinding, DocBuilder, Document, Header, LensOp, Payload, ShapeDesc, SizeIntent,
};
use anchor_lab::properties::{
    PropertyError, PropertyKey, PropertyTarget, PropertyValue, PropertyValues,
};

fn scene() -> (Document, u32, u32) {
    let mut builder = DocBuilder::new();
    let first = builder.add(
        0,
        Header::new(SizeIntent::Fixed(80.0), SizeIntent::Fixed(60.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let second = builder.add(
        0,
        Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(30.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    (builder.build(), first, second)
}

fn lens_scene(ops: Vec<LensOp>) -> (Document, u32) {
    let mut builder = DocBuilder::new();
    let lens = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens { ops },
    );
    builder.add(
        lens,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    (builder.build(), lens)
}

fn target(document: &Document, node: u32, property: PropertyKey) -> PropertyTarget {
    PropertyTarget::new(document.key_of(node).expect("live node"), property)
}

fn sampled_number(values: &PropertyValues, target: PropertyTarget) -> Option<f32> {
    match values.get(target) {
        Some(PropertyValue::Number(value)) => Some(*value),
        None => None,
        value => panic!("expected sampled number, found {value:?}"),
    }
}

fn sampled_axis(values: &PropertyValues, target: PropertyTarget) -> Option<f32> {
    match values.get(target) {
        Some(PropertyValue::AxisBinding(AxisBinding::Pin { offset, .. })) => Some(*offset),
        None => None,
        value => panic!("expected sampled start axis, found {value:?}"),
    }
}

fn sampled_size(values: &PropertyValues, target: PropertyTarget) -> Option<f32> {
    match values.get(target) {
        Some(PropertyValue::SizeIntent(SizeIntent::Fixed(value))) => Some(*value),
        None => None,
        value => panic!("expected sampled fixed size, found {value:?}"),
    }
}

fn offset(numerator: u64, denominator: u64) -> KeyframeOffset {
    KeyframeOffset::new(numerator, denominator).unwrap()
}

fn keyframe(numerator: u64, denominator: u64, value: f32) -> ScalarKeyframe {
    ScalarKeyframe::new(offset(numerator, denominator), value)
}

fn segment(easing: Easing, numerator: u64, denominator: u64, value: f32) -> ScalarSegment {
    ScalarSegment::new(easing, keyframe(numerator, denominator, value))
}

#[test]
fn sample_time_and_timing_are_checked_integer_nanoseconds() {
    let negative = SampleTime::from_nanoseconds(-17);
    assert_eq!(negative.nanoseconds(), -17);
    assert_eq!(
        negative.checked_add_nanoseconds(20),
        Some(SampleTime::from_nanoseconds(3))
    );
    assert_eq!(
        SampleTime::from_nanoseconds(i64::MAX).checked_add_nanoseconds(1),
        None
    );
    assert_eq!(
        SampleTime::from_nanoseconds(i64::MIN).checked_sub_nanoseconds(1),
        None
    );
    assert!(SampleTime::try_from(i128::from(i64::MAX) + 1).is_err());

    assert_eq!(Timing::new(0, 0, 1), Err(TimingError::ZeroDuration));
    assert_eq!(Timing::new(0, 1, 0), Err(TimingError::ZeroRepeatCount));
    assert!(matches!(
        Timing::new(i64::MAX, 1, 1),
        Err(TimingError::ActiveEndOverflow { .. })
    ));

    let timing = Timing::new(20, 7, 3).unwrap();
    assert_eq!(timing.begin(), SampleTime::from_nanoseconds(20));
    assert_eq!(timing.duration_nanoseconds(), 7);
    assert_eq!(timing.repeat_count(), 3);
    assert_eq!(timing.active_end(), SampleTime::from_nanoseconds(41));

    let negative = Timing::new(-20, 7, 3).unwrap();
    assert_eq!(negative.begin(), SampleTime::from_nanoseconds(-20));
    assert_eq!(negative.active_end(), SampleTime::from_nanoseconds(1));

    let full_signed_span = Timing::new(i64::MIN, u64::MAX, 1).unwrap();
    assert_eq!(
        full_signed_span.active_end(),
        SampleTime::from_nanoseconds(i64::MAX)
    );
    assert!(matches!(
        Timing::new(i64::MIN, u64::MAX, 2),
        Err(TimingError::ActiveEndOverflow { .. })
    ));
}

#[test]
fn signed_timing_samples_before_and_across_the_timeline_origin() {
    let (document, rect, _) = scene();
    let x = target(&document, rect, PropertyKey::X);
    let timing = Timing::new(-10, 20, 1).unwrap();
    let program = AnimationProgram::new(
        &document,
        "signed-timeline@0",
        vec![Track::axis_start("move", x, 0.0, 20.0, timing, FillMode::Freeze).unwrap()],
    )
    .unwrap();

    let at = |nanoseconds| {
        program
            .sample(&document, SampleTime::from_nanoseconds(nanoseconds))
            .unwrap()
    };
    assert_eq!(sampled_axis(&at(-11), x), None);
    assert_eq!(sampled_axis(&at(-10), x), Some(0.0));
    assert_eq!(sampled_axis(&at(0), x), Some(10.0));
    assert_eq!(sampled_axis(&at(10), x), Some(20.0));

    let extreme = AnimationProgram::new(
        &document,
        "full-signed-span@0",
        vec![Track::axis_start(
            "move",
            x,
            0.0,
            1.0,
            Timing::new(i64::MIN, u64::MAX, 1).unwrap(),
            FillMode::Remove,
        )
        .unwrap()],
    )
    .unwrap();
    let midpoint = sampled_axis(
        &extreme
            .sample(&document, SampleTime::ZERO)
            .expect("signed subtraction must not overflow"),
        x,
    )
    .unwrap();
    assert_eq!(midpoint.to_bits(), 0.5_f32.to_bits());
}

#[test]
fn track_constructors_close_property_and_endpoint_domains() {
    let (document, rect, _) = scene();
    let timing = Timing::new(0, 10, 1).unwrap();
    let width = target(&document, rect, PropertyKey::Width);
    let opacity = target(&document, rect, PropertyKey::Opacity);

    assert!(matches!(
        Track::axis_start("wrong-property", width, 0.0, 1.0, timing, FillMode::Remove),
        Err(TrackError::WrongProperty {
            kind: TrackKind::AxisStart,
            actual: PropertyKey::Width,
            ..
        })
    ));
    assert!(matches!(
        Track::fixed_size("negative", width, -1.0, 1.0, timing, FillMode::Remove),
        Err(TrackError::InvalidEndpoint {
            endpoint: Endpoint::From,
            reason: ScalarDomainError::Negative,
            ..
        })
    ));
    assert!(matches!(
        Track::opacity("outside", opacity, 0.0, 1.1, timing, FillMode::Remove),
        Err(TrackError::InvalidEndpoint {
            endpoint: Endpoint::To,
            reason: ScalarDomainError::OutsideUnitInterval,
            ..
        })
    ));
    assert!(matches!(
        Track::opacity("nan", opacity, f32::NAN, 1.0, timing, FillMode::Remove),
        Err(TrackError::InvalidEndpoint {
            endpoint: Endpoint::From,
            reason: ScalarDomainError::NotFinite,
            ..
        })
    ));
    assert_eq!(
        Track::opacity("", opacity, 0.0, 1.0, timing, FillMode::Remove),
        Err(TrackError::EmptySource)
    );
}

#[test]
fn effect_accessors_and_composition_are_total_and_explicit() {
    let (document, rect, _) = scene();
    let x = target(&document, rect, PropertyKey::X);
    let timing = Timing::new(0, 10, 1).unwrap();

    let scalar = Track::axis_start("scalar", x, 0.0, 10.0, timing, FillMode::Remove).unwrap();
    assert_eq!(scalar.effect_kind(), TrackEffectKind::ScalarCurve);
    assert!(scalar.scalar_curve().is_some());
    assert!(scalar.transform_curve().is_none());
    assert_eq!(scalar.composite(), CompositeOperation::Replace);
    assert!(matches!(
        scalar.clone().with_composition(
            CompositeOperation::InterpolateLiveUnderlying,
            IterationCompositeOperation::Replace,
        ),
        Err(TrackError::InvalidComposition {
            effect: TrackEffectKind::ScalarCurve,
            composite: CompositeOperation::InterpolateLiveUnderlying,
            iteration_composite: IterationCompositeOperation::Replace,
            ..
        })
    ));

    let live = Track::axis_start_from_live_underlying(
        "live",
        x,
        10.0,
        Easing::Linear,
        timing,
        FillMode::Remove,
    )
    .unwrap();
    assert_eq!(
        live.effect_kind(),
        TrackEffectKind::ScalarFromLiveUnderlying
    );
    assert!(live.scalar_curve().is_none());
    assert!(live.transform_curve().is_none());
    assert_eq!(
        live.composite(),
        CompositeOperation::InterpolateLiveUnderlying
    );
    assert_eq!(
        live.iteration_composite(),
        IterationCompositeOperation::Replace
    );
    live.clone()
        .with_composition(
            CompositeOperation::InterpolateLiveUnderlying,
            IterationCompositeOperation::Replace,
        )
        .unwrap();
    for (composite, iteration_composite) in [
        (
            CompositeOperation::Replace,
            IterationCompositeOperation::Replace,
        ),
        (
            CompositeOperation::Add,
            IterationCompositeOperation::Replace,
        ),
        (
            CompositeOperation::InterpolateLiveUnderlying,
            IterationCompositeOperation::Accumulate,
        ),
    ] {
        assert!(matches!(
            live.clone()
                .with_composition(composite, iteration_composite),
            Err(TrackError::InvalidComposition {
                effect: TrackEffectKind::ScalarFromLiveUnderlying,
                ..
            })
        ));
    }

    let (lens_document, lens) = lens_scene(vec![]);
    let lens_ops = target(&lens_document, lens, PropertyKey::LensOps);
    let transform = Track::lens_transform_curve(
        "transform",
        lens_ops,
        TransformCurve::linear(
            TransformValue::Translate { x: 0.0, y: 0.0 },
            TransformValue::Translate { x: 10.0, y: 0.0 },
        )
        .unwrap(),
        timing,
        FillMode::Remove,
    )
    .unwrap();
    assert_eq!(transform.effect_kind(), TrackEffectKind::TransformCurve);
    assert!(transform.scalar_curve().is_none());
    assert!(transform.transform_curve().is_some());
    assert!(matches!(
        transform.with_composition(
            CompositeOperation::InterpolateLiveUnderlying,
            IterationCompositeOperation::Replace,
        ),
        Err(TrackError::InvalidComposition {
            effect: TrackEffectKind::TransformCurve,
            ..
        })
    ));
}

#[test]
fn transform_constant_constructor_preserves_curve_validation() {
    assert_eq!(
        TransformCurve::constant(TransformValue::Translate {
            x: f32::NAN,
            y: 0.0,
        }),
        Err(TransformCurveError::NonFiniteValue { keyframe_index: 0 })
    );

    let constant = TransformCurve::constant(TransformValue::Scale { x: 2.0, y: 3.0 }).unwrap();
    assert_eq!(constant.first().offset(), KeyframeOffset::ZERO);
    assert_eq!(constant.keyframe_count(), 1);
    assert_eq!(
        constant.first_value(),
        TransformValue::Scale { x: 2.0, y: 3.0 }
    );

    assert!(matches!(
        TransformCurve::new(
            TransformKeyframe::new(
                KeyframeOffset::ZERO,
                TransformValue::Translate { x: 0.0, y: 0.0 },
            ),
            vec![TransformSegment::new(
                Easing::Linear,
                TransformKeyframe::new(
                    KeyframeOffset::ONE,
                    TransformValue::Scale { x: 1.0, y: 1.0 },
                ),
            )],
        ),
        Err(TransformCurveError::MixedKinds {
            expected: anchor_lab::animation::TransformKind::Translate,
            keyframe_index: 1,
            actual: anchor_lab::animation::TransformKind::Scale,
        })
    ));

    let (document, lens) = lens_scene(vec![]);
    let target = target(&document, lens, PropertyKey::LensOps);
    let overflowing_pivot = TransformValue::Rotate {
        degrees: 90.0,
        center_x: f32::MAX,
        center_y: f32::MAX,
    };
    let curve = TransformCurve::linear(overflowing_pivot, overflowing_pivot).unwrap();
    assert!(matches!(
        Track::lens_transform_curve(
            "overflowing-pivot",
            target,
            curve,
            Timing::new(0, 1, 1).unwrap(),
            FillMode::Remove,
        ),
        Err(TrackError::InvalidTransformProjection {
            keyframe_index: 0,
            ..
        })
    ));
}

#[test]
fn offsets_are_exact_reduced_and_curves_have_one_canonical_structure() {
    let half = KeyframeOffset::new(2, 4).unwrap();
    assert_eq!(half.numerator(), 1);
    assert_eq!(half.denominator(), 2);
    assert_eq!(
        KeyframeOffset::new(0, u64::MAX).unwrap(),
        KeyframeOffset::ZERO
    );
    assert_eq!(
        KeyframeOffset::new(u64::MAX, u64::MAX).unwrap(),
        KeyframeOffset::ONE
    );
    assert_eq!(
        KeyframeOffset::new(1, 0),
        Err(KeyframeOffsetError::ZeroDenominator { numerator: 1 })
    );
    assert_eq!(
        KeyframeOffset::new(3, 2),
        Err(KeyframeOffsetError::OutsideUnitInterval {
            numerator: 3,
            denominator: 2,
        })
    );

    assert!(matches!(
        ScalarCurve::new(
            ScalarKeyframe::new(half, 0.0),
            vec![segment(Easing::Linear, 1, 1, 1.0)]
        ),
        Err(ScalarCurveError::FirstOffsetMustBeZero { actual }) if actual == half
    ));
    assert!(matches!(
        ScalarCurve::new(
            keyframe(0, 1, 0.0),
            vec![segment(Easing::Linear, 1, 2, 1.0)]
        ),
        Err(ScalarCurveError::LastOffsetMustBeOne { actual }) if actual == half
    ));
    assert!(matches!(
        ScalarCurve::new(
            keyframe(0, 1, 0.0),
            vec![
                segment(Easing::Linear, 1, 2, 1.0),
                segment(Easing::Linear, 2, 4, 2.0),
                segment(Easing::Linear, 1, 1, 3.0),
            ]
        ),
        Err(ScalarCurveError::OffsetsNotStrictlyIncreasing {
            previous_index: 1,
            current_index: 2,
            previous,
            current,
        }) if previous == half && current == half
    ));

    let constant = ScalarCurve::new(ScalarKeyframe::new(half, 7.0), vec![]).unwrap();
    assert_eq!(constant, ScalarCurve::constant(7.0));
    assert_eq!(constant.first().offset(), KeyframeOffset::ZERO);
    assert_eq!(constant.keyframe_count(), 1);
}

#[test]
fn old_from_to_constructors_are_bit_equivalent_curve_sugar() {
    let (document, rect, _) = scene();
    let target = target(&document, rect, PropertyKey::X);
    let timing = Timing::new(3, 13, 2).unwrap();
    let old = AnimationProgram::new(
        &document,
        "old-sugar@0",
        vec![Track::axis_start(
            "old",
            target,
            f32::from_bits(0xbf80_0001),
            f32::from_bits(0x3f00_0001),
            timing,
            FillMode::Freeze,
        )
        .unwrap()],
    )
    .unwrap();
    let explicit = AnimationProgram::new(
        &document,
        "explicit-curve@0",
        vec![Track::axis_start_curve(
            "explicit",
            target,
            ScalarCurve::linear(f32::from_bits(0xbf80_0001), f32::from_bits(0x3f00_0001)),
            timing,
            FillMode::Freeze,
        )
        .unwrap()],
    )
    .unwrap();

    for time in [0, 3, 4, 7, 9, 15, 16, 22, 29, i64::MAX] {
        let old = sampled_axis(
            &old.sample(&document, SampleTime::from_nanoseconds(time))
                .unwrap(),
            target,
        )
        .map(f32::to_bits);
        let explicit = sampled_axis(
            &explicit
                .sample(&document, SampleTime::from_nanoseconds(time))
                .unwrap(),
            target,
        )
        .map(f32::to_bits);
        assert_eq!(old, explicit, "sample at {time}ns");
    }
}

#[test]
fn uneven_offsets_interpolate_with_exact_local_progress() {
    let (document, rect, _) = scene();
    let x = target(&document, rect, PropertyKey::X);
    let curve = ScalarCurve::new(
        keyframe(0, 1, 0.0),
        vec![
            segment(Easing::Linear, 1, 4, 100.0),
            segment(Easing::Linear, 1, 1, 200.0),
        ],
    )
    .unwrap();
    let track = Track::axis_start_curve(
        "uneven",
        x,
        curve,
        Timing::new(0, 8, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let program = AnimationProgram::new(&document, "uneven@0", vec![track]).unwrap();

    for (time, expected) in [
        (0, 0.0_f32),
        (1, 50.0_f32),
        (2, 100.0_f32),
        (5, 150.0_f32),
        (8, 200.0_f32),
    ] {
        let actual = sampled_axis(
            &program
                .sample(&document, SampleTime::from_nanoseconds(time))
                .unwrap(),
            x,
        )
        .unwrap();
        assert_eq!(actual.to_bits(), expected.to_bits(), "sample at {time}ns");
    }
}

#[test]
fn keyframe_repeat_and_freeze_boundaries_preserve_authored_bits() {
    let (document, rect, _) = scene();
    let x = target(&document, rect, PropertyKey::X);
    let curve = ScalarCurve::new(
        keyframe(0, 1, 2.0),
        vec![
            segment(Easing::Linear, 1, 3, -0.0),
            segment(Easing::Linear, 1, 1, 12.0),
        ],
    )
    .unwrap();
    let track = Track::axis_start_curve(
        "boundaries",
        x,
        curve,
        Timing::new(0, 12, 2).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let program = AnimationProgram::new(&document, "boundaries@0", vec![track]).unwrap();

    for time in [4, 16] {
        let value = sampled_axis(
            &program
                .sample(&document, SampleTime::from_nanoseconds(time))
                .unwrap(),
            x,
        )
        .unwrap();
        assert_eq!(value.to_bits(), (-0.0_f32).to_bits());
    }
    assert_eq!(
        sampled_axis(
            &program
                .sample(&document, SampleTime::from_nanoseconds(12))
                .unwrap(),
            x,
        )
        .unwrap()
        .to_bits(),
        2.0_f32.to_bits(),
        "a repeat boundary returns the authored first keyframe"
    );
    for time in [24, 25, i64::MAX] {
        assert_eq!(
            sampled_axis(
                &program
                    .sample(&document, SampleTime::from_nanoseconds(time))
                    .unwrap(),
                x,
            )
            .unwrap()
            .to_bits(),
            12.0_f32.to_bits(),
            "freeze returns the authored last keyframe"
        );
    }
}

#[test]
fn cubic_identity_is_linear_and_exact_inverse_hits_return_exact_y() {
    let (document, rect, _) = scene();
    let opacity = target(&document, rect, PropertyKey::Opacity);
    let timing = Timing::new(0, 14, 1).unwrap();
    let identity = CubicBezier::new(0.25, 0.25, 0.75, 0.75).unwrap();
    let identity_curve = ScalarCurve::new(
        keyframe(0, 1, 0.0),
        vec![segment(Easing::CubicBezier(identity), 1, 1, 1.0)],
    )
    .unwrap();
    let linear = AnimationProgram::new(
        &document,
        "linear@0",
        vec![Track::opacity("linear", opacity, 0.0, 1.0, timing, FillMode::Freeze).unwrap()],
    )
    .unwrap();
    let identity = AnimationProgram::new(
        &document,
        "identity@0",
        vec![Track::opacity_curve(
            "identity",
            opacity,
            identity_curve,
            timing,
            FillMode::Freeze,
        )
        .unwrap()],
    )
    .unwrap();
    for time in 0..=14 {
        let linear_value = sampled_number(
            &linear
                .sample(&document, SampleTime::from_nanoseconds(time))
                .unwrap(),
            opacity,
        )
        .unwrap();
        let identity_value = sampled_number(
            &identity
                .sample(&document, SampleTime::from_nanoseconds(time))
                .unwrap(),
            opacity,
        )
        .unwrap();
        assert_eq!(linear_value.to_bits(), identity_value.to_bits());
    }

    // Bx(1/2) is exactly 1/2 for x controls (0, 1), so inversion hits the
    // first dyadic midpoint exactly. With y controls (1, 1), By(1/2) = 7/8.
    let exact_hit = CubicBezier::new(0.0, 1.0, 1.0, 1.0).unwrap();
    let curve = ScalarCurve::new(
        keyframe(0, 1, 0.0),
        vec![segment(Easing::CubicBezier(exact_hit), 1, 1, 1.0)],
    )
    .unwrap();
    let program = AnimationProgram::new(
        &document,
        "exact-cubic-hit@0",
        vec![Track::opacity_curve(
            "ease",
            opacity,
            curve,
            Timing::new(0, 2, 1).unwrap(),
            FillMode::Freeze,
        )
        .unwrap()],
    )
    .unwrap();
    let value = sampled_number(
        &program
            .sample(&document, SampleTime::from_nanoseconds(1))
            .unwrap(),
        opacity,
    )
    .unwrap();
    assert_eq!(value.to_bits(), 0.875_f32.to_bits());

    // A non-dyadic inverse exercises the full 128-step bracket. This golden
    // bit pattern is the once-rounded value for CSS `ease` at progress 1/3.
    let css_ease = CubicBezier::new(0.25, 0.1, 0.25, 1.0).unwrap();
    let curve = ScalarCurve::new(
        keyframe(0, 1, 0.0),
        vec![segment(Easing::CubicBezier(css_ease), 1, 1, 1.0)],
    )
    .unwrap();
    let program = AnimationProgram::new(
        &document,
        "css-ease@0",
        vec![Track::opacity_curve(
            "ease",
            opacity,
            curve,
            Timing::new(0, 3, 1).unwrap(),
            FillMode::Freeze,
        )
        .unwrap()],
    )
    .unwrap();
    let value = sampled_number(
        &program
            .sample(&document, SampleTime::from_nanoseconds(1))
            .unwrap(),
        opacity,
    )
    .unwrap();
    assert_eq!(value.to_bits(), 0x3f13_6bb6);
}

#[test]
fn cubic_controls_and_property_space_hulls_are_validated() {
    assert_eq!(
        CubicBezier::new(f32::NAN, 0.0, 1.0, 1.0),
        Err(CubicBezierError::NotFinite {
            control: CubicControl::X1,
        })
    );
    assert_eq!(
        CubicBezier::new(0.0, 0.0, 1.1, 1.0),
        Err(CubicBezierError::XOutsideUnitInterval {
            control: CubicControl::X2,
        })
    );
    assert_eq!(
        CubicBezier::new(0.0, f32::INFINITY, 1.0, 1.0),
        Err(CubicBezierError::NotFinite {
            control: CubicControl::Y1,
        })
    );

    let (document, rect, _) = scene();
    let timing = Timing::new(0, 10, 1).unwrap();
    let opacity = target(&document, rect, PropertyKey::Opacity);
    let opacity_overshoot = ScalarCurve::new(
        keyframe(0, 1, 0.0),
        vec![segment(
            Easing::CubicBezier(CubicBezier::new(0.0, -0.25, 1.0, 1.0).unwrap()),
            1,
            1,
            1.0,
        )],
    )
    .unwrap();
    assert!(matches!(
        Track::opacity_curve(
            "opacity-overshoot",
            opacity,
            opacity_overshoot,
            timing,
            FillMode::Remove,
        ),
        Err(TrackError::UnsafeCubicControl {
            segment_index: 0,
            control: CubicControl::Y1,
            reason: ScalarDomainError::OutsideUnitInterval,
            ..
        })
    ));

    let width = target(&document, rect, PropertyKey::Width);
    let negative_size_control = ScalarCurve::new(
        keyframe(0, 1, 10.0),
        vec![segment(
            Easing::CubicBezier(CubicBezier::new(0.0, -2.0, 1.0, 1.0).unwrap()),
            1,
            1,
            20.0,
        )],
    )
    .unwrap();
    assert!(matches!(
        Track::fixed_size_curve(
            "negative-size-control",
            width,
            negative_size_control,
            timing,
            FillMode::Remove,
        ),
        Err(TrackError::UnsafeCubicControl {
            control: CubicControl::Y1,
            reason: ScalarDomainError::Negative,
            ..
        })
    ));

    let x = target(&document, rect, PropertyKey::X);
    let overflowing_axis_control = ScalarCurve::new(
        keyframe(0, 1, -f32::MAX),
        vec![segment(
            Easing::CubicBezier(CubicBezier::new(0.0, f32::MAX, 1.0, 0.0).unwrap()),
            1,
            1,
            f32::MAX,
        )],
    )
    .unwrap();
    assert!(matches!(
        Track::axis_start_curve(
            "overflowing-axis-control",
            x,
            overflowing_axis_control,
            timing,
            FillMode::Remove,
        ),
        Err(TrackError::UnsafeCubicControl {
            control: CubicControl::Y1,
            reason: ScalarDomainError::OutsideFiniteBinary32,
            ..
        })
    ));
}

#[test]
fn every_curve_keyframe_is_validated_for_its_track_kind() {
    let (document, rect, _) = scene();
    let opacity = target(&document, rect, PropertyKey::Opacity);
    let curve = ScalarCurve::new(
        keyframe(0, 1, 0.0),
        vec![
            segment(Easing::Linear, 1, 2, 1.25),
            segment(Easing::Linear, 1, 1, 1.0),
        ],
    )
    .unwrap();
    assert!(matches!(
        Track::opacity_curve(
            "bad-middle",
            opacity,
            curve,
            Timing::new(0, 10, 1).unwrap(),
            FillMode::Remove,
        ),
        Err(TrackError::InvalidKeyframe {
            keyframe_index: 1,
            reason: ScalarDomainError::OutsideUnitInterval,
            ..
        })
    ));
}

#[test]
fn one_value_curves_are_constant_through_repeats_and_freeze() {
    let (document, rect, _) = scene();
    let opacity = target(&document, rect, PropertyKey::Opacity);
    let track = Track::opacity_curve(
        "constant",
        opacity,
        ScalarCurve::constant(-0.0),
        Timing::new(3, 5, 2).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let curve = track.scalar_curve().expect("the track owns a scalar curve");
    assert_eq!(curve.first_value().to_bits(), (-0.0_f32).to_bits());
    assert_eq!(curve.last_value().to_bits(), (-0.0_f32).to_bits());
    let program = AnimationProgram::new(&document, "constant@0", vec![track]).unwrap();

    assert_eq!(
        sampled_number(
            &program
                .sample(&document, SampleTime::from_nanoseconds(2))
                .unwrap(),
            opacity,
        ),
        None
    );
    for time in [3, 4, 7, 8, 12, 13, i64::MAX] {
        let value = sampled_number(
            &program
                .sample(&document, SampleTime::from_nanoseconds(time))
                .unwrap(),
            opacity,
        )
        .unwrap();
        assert_eq!(value.to_bits(), (-0.0_f32).to_bits());
    }
}

#[test]
fn program_is_document_bound_target_major_and_preserves_stack_priority() {
    let (document, rect, _) = scene();
    let timing = Timing::new(0, 10, 1).unwrap();
    let x = target(&document, rect, PropertyKey::X);
    let opacity = target(&document, rect, PropertyKey::Opacity);
    let program = AnimationProgram::new(
        &document,
        "test-profile@0",
        vec![
            Track::axis_start(
                "x-lower-later-begin",
                x,
                0.0,
                10.0,
                Timing::new(20, 20, 1).unwrap(),
                FillMode::Freeze,
            )
            .unwrap(),
            Track::opacity("opacity", opacity, 1.0, 0.0, timing, FillMode::Freeze).unwrap(),
            Track::axis_start(
                "x-higher-earlier-begin",
                x,
                20.0,
                30.0,
                Timing::new(10, 40, 1).unwrap(),
                FillMode::Freeze,
            )
            .unwrap(),
        ],
    )
    .unwrap();
    assert_eq!(program.compiler_id(), "test-profile@0");
    assert_eq!(program.tracks()[0].target(), x);
    assert_eq!(program.tracks()[0].source(), "x-lower-later-begin");
    assert_eq!(program.tracks()[1].target(), x);
    assert_eq!(program.tracks()[1].source(), "x-higher-earlier-begin");
    assert_eq!(program.tracks()[2].target(), opacity);
    let stacks = program.effect_stacks().collect::<Vec<_>>();
    assert_eq!(stacks.len(), 2);
    assert_eq!(stacks[0].len(), 2);
    assert_eq!(stacks[1].len(), 1);
    assert_eq!(
        sampled_axis(
            &program
                .sample(&document, SampleTime::from_nanoseconds(25))
                .unwrap(),
            x,
        ),
        Some(23.75),
        "the kernel preserves frontend priority instead of deriving it from begin time"
    );
    assert_eq!(
        program.document_root(),
        document.key_of(document.root).unwrap()
    );
    assert!(matches!(
        AnimationProgram::empty(&document, ""),
        Err(ProgramError::EmptyCompilerId)
    ));
}

#[test]
fn replacement_stack_selects_the_highest_contributor_and_falls_through() {
    let (document, rect, _) = scene();
    let x = target(&document, rect, PropertyKey::X);
    let lower = Track::axis_start(
        "lower",
        x,
        10.0,
        50.0,
        Timing::new(10, 40, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let middle = Track::axis_start(
        "middle",
        x,
        70.0,
        110.0,
        Timing::new(20, 20, 1).unwrap(),
        FillMode::Remove,
    )
    .unwrap();
    let higher = Track::axis_start(
        "higher",
        x,
        200.0,
        210.0,
        Timing::new(25, 5, 1).unwrap(),
        FillMode::Remove,
    )
    .unwrap();
    let program = AnimationProgram::new(
        &document,
        "replacement-stack@0",
        vec![lower, middle, higher],
    )
    .unwrap();

    let expected = [
        (9, None),
        (10, Some(10.0)),
        (19, Some(19.0)),
        (20, Some(70.0)),
        (25, Some(200.0)),
        (29, Some(208.0)),
        (30, Some(90.0)),
        (40, Some(40.0)),
        (50, Some(50.0)),
        (i64::MAX, Some(50.0)),
    ];
    for (time, expected) in expected {
        let values = program
            .sample(&document, SampleTime::from_nanoseconds(time))
            .unwrap();
        assert_eq!(sampled_axis(&values, x), expected, "sample at {time}ns");
        assert!(values.len() <= 1, "one stack emits at most one value");
    }

    let frozen_higher = AnimationProgram::new(
        &document,
        "replacement-freeze@0",
        vec![
            Track::axis_start(
                "lower",
                x,
                10.0,
                50.0,
                Timing::new(10, 40, 1).unwrap(),
                FillMode::Freeze,
            )
            .unwrap(),
            Track::axis_start(
                "higher",
                x,
                200.0,
                210.0,
                Timing::new(25, 5, 1).unwrap(),
                FillMode::Freeze,
            )
            .unwrap(),
        ],
    )
    .unwrap();
    for time in [30, 50, i64::MAX] {
        assert_eq!(
            sampled_axis(
                &frozen_higher
                    .sample(&document, SampleTime::from_nanoseconds(time))
                    .unwrap(),
                x,
            ),
            Some(210.0)
        );
    }
}

#[test]
fn scalar_composition_supports_all_effect_and_iteration_combinations() {
    let (mut document, rect, _) = scene();
    document.get_mut(rect).header.x = AxisBinding::start(10.0);
    let x = target(&document, rect, PropertyKey::X);
    let timing = Timing::new(0, 10, 3).unwrap();

    let cases = [
        (
            CompositeOperation::Replace,
            IterationCompositeOperation::Replace,
            [20.0, 25.0, 20.0, 25.0, 20.0, 25.0, 30.0],
        ),
        (
            CompositeOperation::Add,
            IterationCompositeOperation::Replace,
            [30.0, 35.0, 30.0, 35.0, 30.0, 35.0, 40.0],
        ),
        (
            CompositeOperation::Replace,
            IterationCompositeOperation::Accumulate,
            [20.0, 25.0, 50.0, 55.0, 80.0, 85.0, 90.0],
        ),
        (
            CompositeOperation::Add,
            IterationCompositeOperation::Accumulate,
            [30.0, 35.0, 60.0, 65.0, 90.0, 95.0, 100.0],
        ),
    ];

    for (composite, iteration, expected) in cases {
        let track = Track::axis_start(
            format!("{composite:?}-{iteration:?}"),
            x,
            20.0,
            30.0,
            timing,
            FillMode::Freeze,
        )
        .unwrap()
        .with_composition(composite, iteration)
        .unwrap();
        let program =
            AnimationProgram::new(&document, "composition-matrix@0", vec![track]).unwrap();
        for (time, expected) in [0, 5, 10, 15, 20, 25, 30].into_iter().zip(expected) {
            let values = program
                .sample(&document, SampleTime::from_nanoseconds(time))
                .unwrap();
            assert_eq!(sampled_axis(&values, x), Some(expected), "at {time}ns");
        }
    }
}

#[test]
fn cumulative_fixed_size_uses_the_last_keyframe_not_the_curve_delta() {
    let (mut document, rect, _) = scene();
    document.get_mut(rect).header.width = SizeIntent::Fixed(20.0);
    let width = target(&document, rect, PropertyKey::Width);
    let curve = ScalarCurve::new(
        keyframe(0, 1, 0.0),
        vec![
            segment(Easing::Linear, 1, 2, 15.0),
            segment(Easing::Linear, 1, 1, 10.0),
        ],
    )
    .unwrap();
    let track = Track::fixed_size_curve(
        "cumulative-width",
        width,
        curve,
        Timing::new(0, 20, 3).unwrap(),
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Accumulate,
    )
    .unwrap();
    let program = AnimationProgram::new(&document, "cumulative-width@0", vec![track]).unwrap();

    for (time, expected) in [
        (0, 20.0),
        (10, 35.0),
        (20, 30.0),
        (30, 45.0),
        (40, 40.0),
        (50, 55.0),
        (60, 50.0),
    ] {
        assert_eq!(
            sampled_size(
                &program
                    .sample(&document, SampleTime::from_nanoseconds(time))
                    .unwrap(),
                width,
            ),
            Some(expected),
            "at {time}ns"
        );
    }
}

#[test]
fn additive_sandwich_accumulates_then_composes_and_replacement_cuts_lower_layers() {
    let (mut document, rect, _) = scene();
    document.get_mut(rect).header.x = AxisBinding::start(8.0);
    let x = target(&document, rect, PropertyKey::X);
    let composed = |track: Result<Track, TrackError>, composite, iteration| {
        track
            .unwrap()
            .with_composition(composite, iteration)
            .unwrap()
    };
    let foundation = composed(
        Track::axis_start(
            "foundation",
            x,
            2.0,
            6.0,
            Timing::new(0, 10, 3).unwrap(),
            FillMode::Freeze,
        ),
        CompositeOperation::Add,
        IterationCompositeOperation::Accumulate,
    );
    let replacement = composed(
        Track::axis_start(
            "replacement",
            x,
            20.0,
            60.0,
            Timing::new(25, 40, 1).unwrap(),
            FillMode::Freeze,
        ),
        CompositeOperation::Replace,
        IterationCompositeOperation::Replace,
    );
    let persistent = composed(
        Track::axis_start(
            "persistent",
            x,
            0.0,
            8.0,
            Timing::new(30, 10, 2).unwrap(),
            FillMode::Freeze,
        ),
        CompositeOperation::Add,
        IterationCompositeOperation::Accumulate,
    );
    let temporary = composed(
        Track::axis_start(
            "temporary",
            x,
            4.0,
            12.0,
            Timing::new(35, 10, 1).unwrap(),
            FillMode::Remove,
        ),
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    );
    let program = AnimationProgram::new(
        &document,
        "additive-sandwich@0",
        vec![foundation, replacement, persistent, temporary],
    )
    .unwrap();

    for (time, expected) in [
        (0, 10.0),
        (5, 12.0),
        (10, 16.0),
        (15, 18.0),
        (20, 22.0),
        (25, 20.0),
        (30, 25.0),
        (35, 38.0),
        (40, 51.0),
        (45, 52.0),
        (50, 61.0),
        (55, 66.0),
        (60, 71.0),
        (65, 76.0),
        (70, 76.0),
    ] {
        let values = program
            .sample(&document, SampleTime::from_nanoseconds(time))
            .unwrap();
        assert_eq!(sampled_axis(&values, x), Some(expected), "at {time}ns");
    }
}

#[test]
fn typed_composition_rounds_per_layer_clamps_opacity_once_and_skips_masked_overflow() {
    let (mut document, rect, _) = scene();
    document.get_mut(rect).header.x = AxisBinding::start(1.0);
    document.get_mut(rect).header.opacity = 0.2;
    let x = target(&document, rect, PropertyKey::X);
    let opacity = target(&document, rect, PropertyKey::Opacity);
    let active = Timing::new(0, 10, 1).unwrap();
    let half_ulp = 2.0_f32.powi(-24);
    let add = |source, target, value| {
        Track::axis_start(source, target, value, value, active, FillMode::Freeze)
            .unwrap()
            .with_composition(
                CompositeOperation::Add,
                IterationCompositeOperation::Replace,
            )
            .unwrap()
    };
    let rounded = AnimationProgram::new(
        &document,
        "ordered-rounding@0",
        vec![add("first", x, half_ulp), add("second", x, half_ulp)],
    )
    .unwrap();
    assert_eq!(
        sampled_axis(&rounded.sample(&document, SampleTime::ZERO).unwrap(), x),
        Some(1.0),
        "two additions are rounded in sandwich order, not regrouped"
    );

    let opacity_add = |source, value| {
        Track::opacity(source, opacity, value, value, active, FillMode::Freeze)
            .unwrap()
            .with_composition(
                CompositeOperation::Add,
                IterationCompositeOperation::Replace,
            )
            .unwrap()
    };
    let opacity_program = AnimationProgram::new(
        &document,
        "late-opacity-clamp@0",
        vec![opacity_add("a", 0.4), opacity_add("b", 0.5)],
    )
    .unwrap();
    assert_eq!(
        sampled_number(
            &opacity_program.sample(&document, SampleTime::ZERO).unwrap(),
            opacity
        ),
        Some(1.0)
    );

    document.get_mut(rect).header.x = AxisBinding::start(f32::MAX);
    let overflow = add("overflow", x, f32::MAX);
    let failing = AnimationProgram::new(&document, "overflow@0", vec![overflow.clone()]).unwrap();
    assert!(matches!(
        failing.sample(&document, SampleTime::ZERO),
        Err(SampleError::InvalidComposition {
            error: AnimationValueError::NonFiniteResult { .. },
            ..
        })
    ));
    let masked = Track::axis_start("mask", x, 7.0, 7.0, active, FillMode::Freeze).unwrap();
    let program =
        AnimationProgram::new(&document, "masked-overflow@0", vec![overflow, masked]).unwrap();
    assert_eq!(
        sampled_axis(&program.sample(&document, SampleTime::ZERO).unwrap(), x),
        Some(7.0)
    );
}

#[test]
fn composition_arithmetic_errors_report_only_applied_sources() {
    let (mut document, rect, _) = scene();
    document.get_mut(rect).header.x = AxisBinding::start(f32::MAX);
    let x = target(&document, rect, PropertyKey::X);
    let timing = Timing::new(0, 10, 1).unwrap();
    let additive = |source, value| {
        Track::axis_start(source, x, value, value, timing, FillMode::Freeze)
            .unwrap()
            .with_composition(
                CompositeOperation::Add,
                IterationCompositeOperation::Replace,
            )
            .unwrap()
    };
    let program = AnimationProgram::new(
        &document,
        "causal-add-error@0",
        vec![
            additive("overflowing-add", f32::MAX),
            additive("not-yet-applied", 0.0),
        ],
    )
    .unwrap();
    assert!(matches!(
        program.sample(&document, SampleTime::ZERO),
        Err(SampleError::InvalidComposition {
            sources,
            error: AnimationValueError::NonFiniteResult {
                operation: AnimationValueOperation::Add,
                ..
            },
            ..
        }) if sources == ["overflowing-add"]
    ));

    let (document, rect, _) = scene();
    let x = target(&document, rect, PropertyKey::X);
    let overflowing_accumulation = Track::axis_start(
        "overflowing-accumulation",
        x,
        f32::MAX,
        f32::MAX,
        Timing::new(0, 1, 2).unwrap(),
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Replace,
        IterationCompositeOperation::Accumulate,
    )
    .unwrap();
    let later_add = Track::axis_start(
        "not-yet-applied",
        x,
        0.0,
        0.0,
        Timing::new(0, 2, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    )
    .unwrap();
    let program = AnimationProgram::new(
        &document,
        "causal-accumulation-error@0",
        vec![overflowing_accumulation, later_add],
    )
    .unwrap();
    assert!(matches!(
        program.sample(&document, SampleTime::from_nanoseconds(1)),
        Err(SampleError::InvalidComposition {
            sources,
            error: AnimationValueError::NonFiniteResult {
                operation: AnimationValueOperation::Accumulate,
                ..
            },
            ..
        }) if sources == ["overflowing-accumulation"]
    ));
}

#[test]
fn additive_tracks_require_authored_numeric_underlying_values() {
    let (mut document, rect, _) = scene();
    document.get_mut(rect).header.x = AxisBinding::center(12.0);
    let x = target(&document, rect, PropertyKey::X);
    let additive = Track::axis_start(
        "add",
        x,
        1.0,
        2.0,
        Timing::new(0, 10, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    )
    .unwrap();
    assert!(matches!(
        AnimationProgram::new(&document, "bad-underlying@0", vec![additive.clone()]),
        Err(ProgramError::InvalidComposition {
            error: AnimationValueError::UnsupportedUnderlying {
                actual: UnderlyingValueShape::CenterPin,
                ..
            },
            ..
        })
    ));

    document.get_mut(rect).header.width = SizeIntent::Auto;
    let width = target(&document, rect, PropertyKey::Width);
    let additive_width = Track::fixed_size(
        "add-width",
        width,
        1.0,
        2.0,
        Timing::new(0, 10, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    )
    .unwrap();
    assert!(matches!(
        AnimationProgram::new(&document, "auto-underlying@0", vec![additive_width]),
        Err(ProgramError::InvalidComposition {
            error: AnimationValueError::UnsupportedUnderlying {
                actual: UnderlyingValueShape::AutoSize,
                ..
            },
            ..
        })
    ));
    document.get_mut(rect).header.width = SizeIntent::Fixed(80.0);

    let replacement = Track::axis_start(
        "replace",
        x,
        1.0,
        2.0,
        Timing::new(0, 10, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    AnimationProgram::new(
        &document,
        "structural-base-replacement@0",
        vec![replacement],
    )
    .unwrap();

    document.get_mut(rect).header.x = AxisBinding::start(12.0);
    let program = AnimationProgram::new(&document, "mutated-underlying@0", vec![additive]).unwrap();
    document.get_mut(rect).header.x = AxisBinding::end(12.0);
    assert!(matches!(
        program.sample(&document, SampleTime::ZERO),
        Err(SampleError::InvalidComposition {
            error: AnimationValueError::UnsupportedUnderlying {
                actual: UnderlyingValueShape::EndPin,
                ..
            },
            ..
        })
    ));
}

#[test]
fn additive_underlying_scalars_are_domain_checked_at_construction_and_sample() {
    let timing = Timing::new(0, 10, 1).unwrap();
    let make_track = |source, target, kind| {
        let track = match kind {
            TrackKind::AxisStart => {
                Track::axis_start(source, target, 1.0, 2.0, timing, FillMode::Freeze)
            }
            TrackKind::FixedSize => {
                Track::fixed_size(source, target, 1.0, 2.0, timing, FillMode::Freeze)
            }
            TrackKind::Opacity => {
                Track::opacity(source, target, 0.1, 0.2, timing, FillMode::Freeze)
            }
            TrackKind::SolidFill | TrackKind::LensTransform | TrackKind::PathGeometry => {
                unreachable!("this table covers scalar track kinds")
            }
        };
        track
            .unwrap()
            .with_composition(
                CompositeOperation::Add,
                IterationCompositeOperation::Replace,
            )
            .unwrap()
    };
    let set_underlying = |document: &mut Document, node, kind, value| match kind {
        TrackKind::AxisStart => document.get_mut(node).header.x = AxisBinding::start(value),
        TrackKind::FixedSize => document.get_mut(node).header.width = SizeIntent::Fixed(value),
        TrackKind::Opacity => document.get_mut(node).header.opacity = value,
        TrackKind::SolidFill | TrackKind::LensTransform | TrackKind::PathGeometry => {
            unreachable!("this table covers scalar track kinds")
        }
    };

    for (kind, property, invalid, expected) in [
        (
            TrackKind::AxisStart,
            PropertyKey::X,
            f32::INFINITY,
            ScalarDomainError::NotFinite,
        ),
        (
            TrackKind::FixedSize,
            PropertyKey::Width,
            -1.0,
            ScalarDomainError::Negative,
        ),
        (
            TrackKind::Opacity,
            PropertyKey::Opacity,
            1.25,
            ScalarDomainError::OutsideUnitInterval,
        ),
    ] {
        let (mut document, rect, _) = scene();
        set_underlying(&mut document, rect, kind, invalid);
        let authored_target = target(&document, rect, property);
        match AnimationProgram::new(
            &document,
            "invalid-authored-underlying@0",
            vec![make_track("compile-add", authored_target, kind)],
        )
        .unwrap_err()
        {
            ProgramError::InvalidComposition {
                sources,
                error:
                    AnimationValueError::InvalidUnderlying {
                        target: actual,
                        kind: actual_kind,
                        reason,
                    },
            } => {
                assert_eq!(sources, ["compile-add"]);
                assert_eq!(actual, authored_target);
                assert_eq!(actual_kind, kind);
                assert_eq!(reason, expected);
            }
            error => panic!("expected invalid authored underlying scalar, found {error:?}"),
        }

        let (mut document, rect, _) = scene();
        let mutated_target = target(&document, rect, property);
        let program = AnimationProgram::new(
            &document,
            "invalid-mutated-underlying@0",
            vec![make_track("sample-add", mutated_target, kind)],
        )
        .unwrap();
        set_underlying(&mut document, rect, kind, invalid);
        match program.sample(&document, SampleTime::ZERO).unwrap_err() {
            SampleError::InvalidComposition {
                sources,
                error:
                    AnimationValueError::InvalidUnderlying {
                        target: actual,
                        kind: actual_kind,
                        reason,
                    },
                ..
            } => {
                assert_eq!(sources, ["sample-add"]);
                assert_eq!(actual, mutated_target);
                assert_eq!(actual_kind, kind);
                assert_eq!(reason, expected);
            }
            error => panic!("expected invalid mutated underlying scalar, found {error:?}"),
        }
    }
}

#[test]
fn additive_transform_underlying_is_checked_at_construction_even_when_masked() {
    let (document, lens) = lens_scene(vec![LensOp::Translate {
        x: f32::NAN,
        y: 0.0,
    }]);
    let lens_ops = target(&document, lens, PropertyKey::LensOps);
    let timing = Timing::new(0, 10, 1).unwrap();
    let curve = TransformCurve::linear(
        TransformValue::Translate { x: 0.0, y: 0.0 },
        TransformValue::Translate { x: 10.0, y: 0.0 },
    )
    .unwrap();
    let additive = Track::lens_transform_curve(
        "add-transform",
        lens_ops,
        curve.clone(),
        timing,
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    )
    .unwrap();
    let replacement = Track::lens_transform_curve(
        "replace-transform",
        lens_ops,
        curve,
        timing,
        FillMode::Freeze,
    )
    .unwrap();

    for tracks in [
        vec![additive.clone()],
        vec![additive.clone(), replacement.clone()],
    ] {
        assert!(matches!(
            AnimationProgram::new(&document, "invalid-lens-underlying@0", tracks),
            Err(ProgramError::InvalidValues {
                sources,
                error: PropertyError::InvalidValue { target, .. },
            }) if sources == ["add-transform"] && target == lens_ops
        ));
    }

    // Replacement never consumes the authored list, matching the existing
    // scalar replacement cutoff contract.
    AnimationProgram::new(
        &document,
        "replacement-quarantines-underlying@0",
        vec![replacement],
    )
    .unwrap();
}

#[test]
fn mutated_additive_transform_underlying_is_checked_while_inactive_and_masked() {
    let (mut document, lens) = lens_scene(vec![]);
    let lens_ops = target(&document, lens, PropertyKey::LensOps);
    let curve = TransformCurve::linear(
        TransformValue::Translate { x: 0.0, y: 0.0 },
        TransformValue::Translate { x: 10.0, y: 0.0 },
    )
    .unwrap();
    let additive = Track::lens_transform_curve(
        "inactive-add-transform",
        lens_ops,
        curve.clone(),
        Timing::new(100, 10, 1).unwrap(),
        FillMode::Remove,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    )
    .unwrap();
    let replacement = Track::lens_transform_curve(
        "higher-replacement",
        lens_ops,
        curve,
        Timing::new(0, 10, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let program = AnimationProgram::new(
        &document,
        "mutated-lens-underlying@0",
        vec![additive, replacement],
    )
    .unwrap();

    match &mut document.get_mut(lens).payload {
        Payload::Lens { ops } => ops.push(LensOp::Rotate { deg: f32::INFINITY }),
        _ => unreachable!("test node is a lens"),
    }

    assert!(matches!(
        program.sample(&document, SampleTime::from_nanoseconds(50)),
        Err(SampleError::InvalidValues {
            sources,
            error: PropertyError::InvalidValue { target, .. },
            ..
        }) if sources == ["inactive-add-transform"] && target == lens_ops
    ));
}

#[test]
fn empty_program_is_static_at_every_time_but_refuses_another_arena() {
    let (document, _, _) = scene();
    let program = AnimationProgram::empty(&document, "empty@0").unwrap();
    for time in [i64::MIN, -1, 0, 1, i64::MAX] {
        assert!(program
            .sample(&document, SampleTime::from_nanoseconds(time))
            .unwrap()
            .is_empty());
    }

    let clone = document.clone();
    assert!(matches!(
        program.sample(&clone, SampleTime::ZERO),
        Err(SampleError::DocumentMismatch { .. })
    ));
}

#[test]
fn repeats_remove_and_freeze_have_exact_boundary_behavior() {
    let (document, rect, _) = scene();
    let x = target(&document, rect, PropertyKey::X);
    let timing = Timing::new(10, 10, 2).unwrap();
    let remove = AnimationProgram::new(
        &document,
        "remove@0",
        vec![Track::axis_start("move", x, 2.0, 12.0, timing, FillMode::Remove).unwrap()],
    )
    .unwrap();

    let at = |nanoseconds| {
        remove
            .sample(&document, SampleTime::from_nanoseconds(nanoseconds))
            .unwrap()
    };
    assert_eq!(sampled_axis(&at(9), x), None);
    assert_eq!(
        sampled_axis(&at(10), x).unwrap().to_bits(),
        2.0_f32.to_bits()
    );
    assert_eq!(
        sampled_axis(&at(15), x).unwrap().to_bits(),
        7.0_f32.to_bits()
    );
    assert_eq!(
        sampled_axis(&at(20), x).unwrap().to_bits(),
        2.0_f32.to_bits(),
        "an internal repeat boundary begins the next iteration at progress zero"
    );
    assert_eq!(sampled_axis(&at(30), x), None);
    assert_eq!(sampled_axis(&at(i64::MAX), x), None);

    let freeze = AnimationProgram::new(
        &document,
        "freeze@0",
        vec![Track::axis_start("move", x, 2.0, -0.0, timing, FillMode::Freeze).unwrap()],
    )
    .unwrap();
    for time in [30, 31, i64::MAX] {
        assert_eq!(
            sampled_axis(
                &freeze
                    .sample(&document, SampleTime::from_nanoseconds(time))
                    .unwrap(),
                x,
            )
            .unwrap()
            .to_bits(),
            (-0.0_f32).to_bits(),
            "freeze returns the authored terminal endpoint bits"
        );
    }
}

fn midpoint_value(kind: TrackKind, from: f32, to: f32) -> f32 {
    let (document, rect, _) = scene();
    let timing = Timing::new(0, 2, 1).unwrap();
    let (target, track) = match kind {
        TrackKind::AxisStart => {
            let target = target(&document, rect, PropertyKey::X);
            (
                target,
                Track::axis_start("tie", target, from, to, timing, FillMode::Freeze).unwrap(),
            )
        }
        TrackKind::FixedSize => {
            let target = target(&document, rect, PropertyKey::Width);
            (
                target,
                Track::fixed_size("tie", target, from, to, timing, FillMode::Freeze).unwrap(),
            )
        }
        TrackKind::Opacity => {
            let target = target(&document, rect, PropertyKey::Opacity);
            (
                target,
                Track::opacity("tie", target, from, to, timing, FillMode::Freeze).unwrap(),
            )
        }
        TrackKind::SolidFill | TrackKind::LensTransform | TrackKind::PathGeometry => {
            unreachable!("midpoint_value covers scalar track kinds")
        }
    };
    let program = AnimationProgram::new(&document, "rounding@0", vec![track]).unwrap();
    let values = program
        .sample(&document, SampleTime::from_nanoseconds(1))
        .unwrap();
    match kind {
        TrackKind::AxisStart => sampled_axis(&values, target).unwrap(),
        TrackKind::FixedSize => sampled_size(&values, target).unwrap(),
        TrackKind::Opacity => sampled_number(&values, target).unwrap(),
        TrackKind::SolidFill | TrackKind::LensTransform | TrackKind::PathGeometry => {
            unreachable!("midpoint_value covers scalar track kinds")
        }
    }
}

#[test]
fn rational_interpolation_rounds_once_to_binary32_ties_even() {
    let even = f32::from_bits(0x3f00_0000);
    let odd = f32::from_bits(0x3f00_0001);
    let next_even = f32::from_bits(0x3f00_0002);
    assert_eq!(
        midpoint_value(TrackKind::Opacity, even, odd).to_bits(),
        even.to_bits(),
        "a halfway result chooses the even lower significand"
    );
    assert_eq!(
        midpoint_value(TrackKind::Opacity, odd, next_even).to_bits(),
        next_even.to_bits(),
        "a halfway result chooses the even upper significand"
    );

    let min_subnormal = f32::from_bits(1);
    let even_subnormal = f32::from_bits(2);
    assert_eq!(
        midpoint_value(TrackKind::FixedSize, 0.0, min_subnormal).to_bits(),
        0.0_f32.to_bits()
    );
    assert_eq!(
        midpoint_value(TrackKind::FixedSize, min_subnormal, even_subnormal).to_bits(),
        even_subnormal.to_bits()
    );
    let largest_subnormal = f32::from_bits(0x007f_ffff);
    let minimum_normal = f32::from_bits(0x0080_0000);
    assert_eq!(
        midpoint_value(TrackKind::FixedSize, largest_subnormal, minimum_normal,).to_bits(),
        minimum_normal.to_bits(),
        "rounding carries cleanly from the subnormal to normal encoding"
    );

    let negative_even = f32::from_bits(0xbf80_0000);
    let negative_odd = f32::from_bits(0xbf80_0001);
    assert_eq!(
        midpoint_value(TrackKind::AxisStart, negative_even, negative_odd).to_bits(),
        negative_even.to_bits(),
        "ties-to-even is symmetric for negative values"
    );
    assert_eq!(
        midpoint_value(TrackKind::AxisStart, -min_subnormal, -0.0).to_bits(),
        (-0.0_f32).to_bits(),
        "a negative halfway underflow retains the IEEE negative-zero sign"
    );

    let below_max = f32::from_bits(0x7f7f_fffe);
    assert_eq!(
        midpoint_value(TrackKind::AxisStart, below_max, f32::MAX).to_bits(),
        below_max.to_bits(),
        "rounding near the finite ceiling does not overflow"
    );
}

#[test]
fn a_stale_track_rejects_the_whole_sample_with_source_identity() {
    let (mut document, first, second) = scene();
    let timing = Timing::new(0, 10, 1).unwrap();
    let x = target(&document, first, PropertyKey::X);
    let opacity = target(&document, second, PropertyKey::Opacity);
    let program = AnimationProgram::new(
        &document,
        "atomic@0",
        vec![
            Track::axis_start("still-live", x, 0.0, 10.0, timing, FillMode::Freeze).unwrap(),
            Track::opacity("removed", opacity, 1.0, 0.0, timing, FillMode::Freeze).unwrap(),
        ],
    )
    .unwrap();
    document.remove_subtree(second);

    let error = program
        .sample(&document, SampleTime::from_nanoseconds(5))
        .unwrap_err();
    assert!(matches!(
        error,
        SampleError::InvalidValues { sources, .. } if sources == ["removed"]
    ));
}

#[test]
fn a_masked_stale_stack_reports_every_source() {
    let (mut document, first, _) = scene();
    let x = target(&document, first, PropertyKey::X);
    let program = AnimationProgram::new(
        &document,
        "stale-stack@0",
        vec![
            Track::axis_start(
                "lower-inactive",
                x,
                0.0,
                10.0,
                Timing::new(100, 10, 1).unwrap(),
                FillMode::Remove,
            )
            .unwrap(),
            Track::axis_start(
                "higher-frozen",
                x,
                20.0,
                30.0,
                Timing::new(0, 10, 1).unwrap(),
                FillMode::Freeze,
            )
            .unwrap(),
        ],
    )
    .unwrap();
    document.remove_subtree(first);

    let error = program
        .sample(&document, SampleTime::from_nanoseconds(50))
        .unwrap_err();
    assert!(matches!(
        error,
        SampleError::InvalidValues { sources, .. }
            if sources == ["lower-inactive", "higher-frozen"]
    ));
}

#[test]
fn inactive_tracks_still_refuse_stale_or_inapplicable_targets() {
    let (mut document, first, second) = scene();
    let delayed = Timing::new(10, 10, 1).unwrap();
    let width = target(&document, first, PropertyKey::Width);
    let opacity = target(&document, second, PropertyKey::Opacity);
    let program = AnimationProgram::new(
        &document,
        "inactive-validity@0",
        vec![
            Track::fixed_size(
                "becomes-inapplicable",
                width,
                80.0,
                100.0,
                delayed,
                FillMode::Remove,
            )
            .unwrap(),
            Track::opacity(
                "becomes-stale",
                opacity,
                1.0,
                0.0,
                delayed,
                FillMode::Remove,
            )
            .unwrap(),
        ],
    )
    .unwrap();

    document.remove_subtree(second);
    for time in [0, 20, i64::MAX] {
        let error = program
            .sample(&document, SampleTime::from_nanoseconds(time))
            .unwrap_err();
        assert!(matches!(
            error,
            SampleError::InvalidValues { sources, .. } if sources == ["becomes-stale"]
        ));
    }

    // Restore a separate program so the stale target cannot mask the
    // applicability check.
    let (mut document, first, _) = scene();
    let width = target(&document, first, PropertyKey::Width);
    let program = AnimationProgram::new(
        &document,
        "inactive-applicability@0",
        vec![Track::fixed_size(
            "becomes-inapplicable",
            width,
            80.0,
            100.0,
            delayed,
            FillMode::Remove,
        )
        .unwrap()],
    )
    .unwrap();
    document.get_mut(first).payload = Payload::Group;
    for time in [0, 20, i64::MAX] {
        let error = program
            .sample(&document, SampleTime::from_nanoseconds(time))
            .unwrap_err();
        assert!(matches!(
            error,
            SampleError::InvalidValues { sources, .. } if sources == ["becomes-inapplicable"]
        ));
    }
}
