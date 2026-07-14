//! Format-neutral Profile 5 solid-fill effect conformance.

use anchor_lab::animation::{
    AnimationProgram, AnimationValueError, ColorCurve, ColorCurveError, ColorKeyframe,
    ColorSegment, CompositeOperation, Easing, FillMode, IterationCompositeOperation,
    KeyframeOffset, ProgramError, SampleError, SampleTime, Timing, Track, TrackEffectKind,
    TrackError, TrackKind, UnderlyingValueShape, MAX_SOLID_FILL_EFFECTS_PER_TARGET,
};
use anchor_lab::model::{
    BlendMode, Color, DocBuilder, Document, Header, ImagePaint, Paint, Paints, Payload, ShapeDesc,
    SizeIntent, SolidPaint,
};
use anchor_lab::properties::{PropertyKey, PropertyTarget, PropertyValue, PropertyValues};

fn scene(fills: Paints) -> (Document, u32) {
    let mut builder = DocBuilder::new();
    let rect = builder.add(
        0,
        Header::new(SizeIntent::Fixed(32.0), SizeIntent::Fixed(24.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(rect).fills = fills;
    (builder.build(), rect)
}

fn target(document: &Document, node: u32, property: PropertyKey) -> PropertyTarget {
    PropertyTarget::new(document.key_of(node).expect("live node"), property)
}

fn sampled_color(values: &PropertyValues, target: PropertyTarget) -> Option<Color> {
    match values.get(target) {
        Some(PropertyValue::Paints(paints)) => match paints.as_slice() {
            [Paint::Solid(paint)] if paint.active && paint.blend_mode == BlendMode::Normal => {
                Some(paint.color)
            }
            value => panic!("expected one active normal solid paint, found {value:?}"),
        },
        None => None,
        value => panic!("expected sampled fills, found {value:?}"),
    }
}

#[test]
fn color_curve_rejects_every_noncanonical_offset_topology() {
    let color = Color::BLACK;
    let half = KeyframeOffset::new(1, 2).unwrap();
    let quarter = KeyframeOffset::new(1, 4).unwrap();

    assert!(matches!(
        ColorCurve::new(
            ColorKeyframe::new(quarter, color),
            vec![ColorSegment::new(
                Easing::Linear,
                ColorKeyframe::new(KeyframeOffset::ONE, color),
            )],
        ),
        Err(ColorCurveError::FirstOffsetMustBeZero { actual }) if actual == quarter
    ));
    assert!(matches!(
        ColorCurve::new(
            ColorKeyframe::new(KeyframeOffset::ZERO, color),
            vec![ColorSegment::new(
                Easing::Linear,
                ColorKeyframe::new(half, color),
            )],
        ),
        Err(ColorCurveError::LastOffsetMustBeOne { actual }) if actual == half
    ));
    assert!(matches!(
        ColorCurve::new(
            ColorKeyframe::new(KeyframeOffset::ZERO, color),
            vec![
                ColorSegment::new(
                    Easing::Linear,
                    ColorKeyframe::new(half, color),
                ),
                ColorSegment::new(
                    Easing::Linear,
                    ColorKeyframe::new(half, color),
                ),
            ],
        ),
        Err(ColorCurveError::OffsetsNotStrictlyIncreasing {
            previous_index: 1,
            current_index: 2,
            previous,
            current,
        }) if previous == half && current == half
    ));
}

#[test]
fn color_curves_are_typed_complete_fill_values_and_preserve_curve_structure() {
    let quarter = KeyframeOffset::new(1, 4).unwrap();
    let curve = ColorCurve::new(
        ColorKeyframe::new(KeyframeOffset::ZERO, Color(0x0000_0000)),
        vec![
            ColorSegment::new(
                Easing::Linear,
                ColorKeyframe::new(quarter, Color(0x4040_2000)),
            ),
            ColorSegment::new(
                Easing::Linear,
                ColorKeyframe::new(KeyframeOffset::ONE, Color(0xFFFD_0000)),
            ),
        ],
    )
    .unwrap();
    assert_eq!(curve.keyframe_count(), 3);
    assert_eq!(curve.first_color(), Color(0x0000_0000));
    assert_eq!(curve.last_color(), Color(0xFFFD_0000));

    // Replacement must be able to cut any authored fill aggregate. It emits
    // one complete singleton-solid `Paints` value, not a nested color patch.
    let authored = Paints::new([
        Paint::Solid(SolidPaint::new(Color(0xFF10_1828))),
        Paint::Solid(SolidPaint::new(Color(0x8025_63EB))),
    ]);
    let (document, rect) = scene(authored);
    let fills = target(&document, rect, PropertyKey::Fills);
    let track = Track::solid_fill_curve(
        "typed-fill",
        fills,
        curve,
        Timing::new(10, 4, 1).unwrap(),
        FillMode::Remove,
    )
    .unwrap();
    assert_eq!(track.kind(), TrackKind::SolidFill);
    assert_eq!(track.effect_kind(), TrackEffectKind::SolidFillCurve);
    assert!(track.color_curve().is_some());
    assert!(track.scalar_curve().is_none());
    assert!(track.transform_curve().is_none());

    let program = AnimationProgram::new(&document, "typed-fill@0", vec![track]).unwrap();
    assert_eq!(
        sampled_color(
            &program
                .sample(&document, SampleTime::from_nanoseconds(10))
                .unwrap(),
            fills,
        ),
        Some(Color(0x0000_0000))
    );
    assert_eq!(
        sampled_color(
            &program
                .sample(&document, SampleTime::from_nanoseconds(11))
                .unwrap(),
            fills,
        ),
        Some(Color(0x4040_2000)),
        "the exact keyframe retains its authored RGBA8 value"
    );
    assert_eq!(
        sampled_color(
            &program
                .sample(&document, SampleTime::from_nanoseconds(14))
                .unwrap(),
            fills,
        ),
        None,
        "remove falls through to the authored two-paint aggregate"
    );
}

#[test]
fn color_interpolation_is_unpremultiplied_and_quantizes_half_up_once() {
    let (document, rect) = scene(Paints::solid(Color::BLACK));
    let fills = target(&document, rect, PropertyKey::Fills);
    let program = AnimationProgram::new(
        &document,
        "rgba-midpoint@0",
        vec![Track::solid_fill(
            "rgba-midpoint",
            fills,
            Color(0x0000_0000),
            Color(0xFDFD_0000),
            Timing::new(0, 2, 1).unwrap(),
            FillMode::Freeze,
        )
        .unwrap()],
    )
    .unwrap();

    assert_eq!(
        sampled_color(
            &program
                .sample(&document, SampleTime::from_nanoseconds(1))
                .unwrap(),
            fills,
        ),
        Some(Color(0x7F7F_0000)),
        "alpha and red interpolate independently; 126.5 rounds to 127"
    );
}

#[test]
fn color_sandwich_retains_fractional_channels_through_addition_and_accumulation() {
    let (document, rect) = scene(Paints::solid(Color(0xFF10_0000)));
    let fills = target(&document, rect, PropertyKey::Fills);
    let foundation = Track::solid_fill(
        "foundation",
        fills,
        Color(0xFF10_0000),
        Color(0xFF12_0000),
        Timing::new(0, 2, 2).unwrap(),
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Accumulate,
    )
    .unwrap();
    let half_step = Track::solid_fill(
        "half-step",
        fills,
        Color(0x0000_0000),
        Color(0x0001_0000),
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
        "exact-color-sandwich@0",
        vec![foundation, half_step],
    )
    .unwrap();

    // This is the Chromium characterization sequence. At t=1 the two effects
    // contribute 17 and 0.5 over authored 16: keeping exact channels through
    // the sandwich gives 33.5 -> 34. Per-effect quantization would give 33.
    for (time, red) in [(0, 32), (1, 34), (2, 51), (3, 52), (4, 53)] {
        let expected = Color(0xFF00_0000 | (red << 16));
        assert_eq!(
            sampled_color(
                &program
                    .sample(&document, SampleTime::from_nanoseconds(time))
                    .unwrap(),
                fills,
            ),
            Some(expected),
            "unexpected composed color at {time}ns"
        );
    }
}

#[test]
fn higher_live_effect_reads_unclamped_lower_color() {
    let (document, rect) = scene(Paints::solid(Color(0xFFF0_0000)));
    let fills = target(&document, rect, PropertyKey::Fills);
    let lower = Track::solid_fill(
        "overflowing-lower",
        fills,
        Color(0x0020_0000),
        Color(0x0020_0000),
        Timing::new(0, 4, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    )
    .unwrap();
    let higher = Track::solid_fill_from_live_underlying(
        "live-higher",
        fills,
        Color::BLACK,
        Easing::Linear,
        Timing::new(0, 4, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let program = AnimationProgram::new(&document, "late-clamp@0", vec![lower, higher]).unwrap();

    assert_eq!(
        sampled_color(
            &program
                .sample(&document, SampleTime::from_nanoseconds(2))
                .unwrap(),
            fills,
        ),
        Some(Color(0xFF88_0000)),
        "the higher midpoint reads red 272 from below, yielding 136; clamping below first would yield 128"
    );
}

#[test]
fn lone_to_reads_the_live_lower_color_and_addition_requires_a_compatible_solid_base() {
    let (document, rect) = scene(Paints::solid(Color(0xFF10_2030)));
    let fills = target(&document, rect, PropertyKey::Fills);
    let lower = Track::solid_fill(
        "lower",
        fills,
        Color(0xFF20_3040),
        Color(0xFF40_5060),
        Timing::new(0, 2, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let live = Track::solid_fill_from_live_underlying(
        "live",
        fills,
        Color(0xFF80_90A0),
        Easing::Linear,
        Timing::new(0, 2, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    assert_eq!(
        live.effect_kind(),
        TrackEffectKind::SolidFillFromLiveUnderlying
    );
    let program = AnimationProgram::new(&document, "live-color@0", vec![lower, live]).unwrap();
    assert_eq!(
        sampled_color(
            &program
                .sample(&document, SampleTime::from_nanoseconds(1))
                .unwrap(),
            fills,
        ),
        Some(Color(0xFF58_6878)),
        "the lone-to effect interpolates from the sampled lower replacement"
    );

    let (empty_document, empty_rect) = scene(Paints::default());
    let fills = target(&empty_document, empty_rect, PropertyKey::Fills);
    let additive = Track::solid_fill(
        "needs-solid-base",
        fills,
        Color::BLACK,
        Color::BLACK,
        Timing::new(0, 1, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    )
    .unwrap();
    assert!(matches!(
        AnimationProgram::new(&empty_document, "bad-fill-base@0", vec![additive]),
        Err(ProgramError::InvalidComposition {
            error: AnimationValueError::UnsupportedUnderlying {
                expected: TrackKind::SolidFill,
                actual: UnderlyingValueShape::EmptyPaints,
                ..
            },
            ..
        })
    ));

    let opacity = target(&document, rect, PropertyKey::Opacity);
    assert!(matches!(
        Track::solid_fill(
            "wrong-property",
            opacity,
            Color::BLACK,
            Color::BLACK,
            Timing::new(0, 1, 1).unwrap(),
            FillMode::Remove,
        ),
        Err(TrackError::WrongProperty {
            kind: TrackKind::SolidFill,
            actual: PropertyKey::Opacity,
            ..
        })
    ));
}

#[test]
fn additive_color_underlying_shape_is_checked_at_construction_and_sample_time() {
    let mut inactive = SolidPaint::new(Color::BLACK);
    inactive.active = false;
    let mut blended = SolidPaint::new(Color::BLACK);
    blended.blend_mode = BlendMode::Multiply;
    let cases = [
        (Paints::default(), UnderlyingValueShape::EmptyPaints),
        (
            Paints::new([Paint::Solid(inactive)]),
            UnderlyingValueShape::InactiveSolidPaint,
        ),
        (
            Paints::new([Paint::Solid(blended)]),
            UnderlyingValueShape::BlendedSolidPaint,
        ),
        (
            Paints::new([Paint::Image(ImagePaint::from_rid("texture"))]),
            UnderlyingValueShape::NonSolidPaint,
        ),
        (
            Paints::new([
                Paint::Solid(SolidPaint::new(Color::BLACK)),
                Paint::Solid(SolidPaint::new(Color(0xFFFFFFFF))),
            ]),
            UnderlyingValueShape::PaintStack,
        ),
    ];

    for (paints, expected) in cases {
        let (document, rect) = scene(paints);
        let fills = target(&document, rect, PropertyKey::Fills);
        let additive = Track::solid_fill(
            "requires-compatible-solid",
            fills,
            Color::BLACK,
            Color::BLACK,
            Timing::new(0, 1, 1).unwrap(),
            FillMode::Freeze,
        )
        .unwrap()
        .with_composition(
            CompositeOperation::Add,
            IterationCompositeOperation::Replace,
        )
        .unwrap();
        let error = AnimationProgram::new(&document, "invalid-color-underlying@0", vec![additive])
            .unwrap_err();
        assert!(matches!(
            &error,
            ProgramError::InvalidComposition {
                error: AnimationValueError::UnsupportedUnderlying { actual, .. },
                ..
            } if *actual == expected
        ));
        assert!(
            error
                .to_string()
                .contains("exactly one active, normal-blend solid paint"),
            "{error}"
        );
    }

    let (mut document, rect) = scene(Paints::solid(Color::BLACK));
    let fills = target(&document, rect, PropertyKey::Fills);
    let additive = Track::solid_fill(
        "mutated-base",
        fills,
        Color::BLACK,
        Color::BLACK,
        Timing::new(10, 1, 1).unwrap(),
        FillMode::Remove,
    )
    .unwrap()
    .with_composition(
        CompositeOperation::Add,
        IterationCompositeOperation::Replace,
    )
    .unwrap();
    let program =
        AnimationProgram::new(&document, "mutated-color-underlying@0", vec![additive]).unwrap();
    document.get_mut(rect).fills = Paints::new([
        Paint::Solid(SolidPaint::new(Color::BLACK)),
        Paint::Solid(SolidPaint::new(Color(0xFFFFFFFF))),
    ]);
    assert!(matches!(
        program.sample(&document, SampleTime::ZERO),
        Err(SampleError::InvalidComposition {
            sources,
            error: AnimationValueError::UnsupportedUnderlying {
                actual: UnderlyingValueShape::PaintStack,
                ..
            },
            ..
        }) if sources == ["mutated-base"]
    ));
}

#[test]
fn exact_solid_fill_stacks_have_a_reported_complexity_limit() {
    let (document, rect) = scene(Paints::solid(Color::BLACK));
    let fills = target(&document, rect, PropertyKey::Fills);
    let tracks = (0..=MAX_SOLID_FILL_EFFECTS_PER_TARGET)
        .map(|index| {
            Track::solid_fill(
                format!("effect-{index}"),
                fills,
                Color::BLACK,
                Color::BLACK,
                Timing::new(0, 1, 1).unwrap(),
                FillMode::Freeze,
            )
            .unwrap()
        })
        .collect();
    assert!(matches!(
        AnimationProgram::new(&document, "bounded-solid-fill@0", tracks),
        Err(ProgramError::TooManySolidFillEffects {
            count,
            maximum: MAX_SOLID_FILL_EFFECTS_PER_TARGET,
            ..
        }) if count == MAX_SOLID_FILL_EFFECTS_PER_TARGET + 1
    ));
}
