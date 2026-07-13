use anchor_lab::animation::{
    AnimationProgram, CubicBezier, CubicBezierError, CubicControl, Easing, Endpoint, EndpointError,
    FillMode, KeyframeOffset, KeyframeOffsetError, ProgramError, SampleError, SampleTime,
    ScalarCurve, ScalarCurveError, ScalarKeyframe, ScalarSegment, Timing, TimingError, Track,
    TrackError, TrackKind,
};
use anchor_lab::model::{
    AxisBinding, DocBuilder, Document, Header, Payload, ShapeDesc, SizeIntent,
};
use anchor_lab::properties::{PropertyKey, PropertyTarget, PropertyValue, PropertyValues};

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
            reason: EndpointError::Negative,
            ..
        })
    ));
    assert!(matches!(
        Track::opacity("outside", opacity, 0.0, 1.1, timing, FillMode::Remove),
        Err(TrackError::InvalidEndpoint {
            endpoint: Endpoint::To,
            reason: EndpointError::OutsideUnitInterval,
            ..
        })
    ));
    assert!(matches!(
        Track::opacity("nan", opacity, f32::NAN, 1.0, timing, FillMode::Remove),
        Err(TrackError::InvalidEndpoint {
            endpoint: Endpoint::From,
            reason: EndpointError::NotFinite,
            ..
        })
    ));
    assert_eq!(
        Track::opacity("", opacity, 0.0, 1.0, timing, FillMode::Remove),
        Err(TrackError::EmptySource)
    );
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
            reason: EndpointError::OutsideUnitInterval,
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
            reason: EndpointError::Negative,
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
            reason: EndpointError::OutsideFiniteBinary32,
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
            reason: EndpointError::OutsideUnitInterval,
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
    assert_eq!(track.from().to_bits(), (-0.0_f32).to_bits());
    assert_eq!(track.to().to_bits(), (-0.0_f32).to_bits());
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
fn program_is_document_bound_sorted_and_unique() {
    let (document, rect, _) = scene();
    let timing = Timing::new(0, 10, 1).unwrap();
    let x = target(&document, rect, PropertyKey::X);
    let opacity = target(&document, rect, PropertyKey::Opacity);
    let program = AnimationProgram::new(
        &document,
        "test-profile@0",
        vec![
            Track::opacity("second", opacity, 1.0, 0.0, timing, FillMode::Freeze).unwrap(),
            Track::axis_start("first", x, 0.0, 10.0, timing, FillMode::Freeze).unwrap(),
        ],
    )
    .unwrap();
    assert_eq!(program.compiler_id(), "test-profile@0");
    assert_eq!(program.tracks()[0].target(), x);
    assert_eq!(program.tracks()[1].target(), opacity);
    assert_eq!(
        program.document_root(),
        document.key_of(document.root).unwrap()
    );

    let duplicate = AnimationProgram::new(
        &document,
        "test-profile@0",
        vec![
            Track::axis_start("a", x, 0.0, 1.0, timing, FillMode::Remove).unwrap(),
            Track::axis_start("b", x, 2.0, 3.0, timing, FillMode::Remove).unwrap(),
        ],
    )
    .unwrap_err();
    assert!(matches!(
        duplicate,
        ProgramError::DuplicateTarget {
            first_source,
            second_source,
            ..
        } if first_source == "a" && second_source == "b"
    ));
    assert!(matches!(
        AnimationProgram::empty(&document, ""),
        Err(ProgramError::EmptyCompilerId)
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
    };
    let program = AnimationProgram::new(&document, "rounding@0", vec![track]).unwrap();
    let values = program
        .sample(&document, SampleTime::from_nanoseconds(1))
        .unwrap();
    match kind {
        TrackKind::AxisStart => sampled_axis(&values, target).unwrap(),
        TrackKind::FixedSize => sampled_size(&values, target).unwrap(),
        TrackKind::Opacity => sampled_number(&values, target).unwrap(),
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
