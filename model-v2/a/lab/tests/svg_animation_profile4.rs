//! SVG Animation Profile 4 effects and typed-transform validation corpus.

use anchor_lab::animation::{
    AnimationProgram, CompositeOperation, IterationCompositeOperation, SampleTime, Track,
    TrackEffectKind, TransformKind, TransformValue,
};
use anchor_lab::math::Affine;
use anchor_lab::model::{AnchorEdge, AxisBinding, LensOp};
use anchor_lab::properties::{PropertyKey, PropertyTarget, PropertyValue};
use anchor_lab::svg_animation::{SourceSnapshot, SvgAnimationSource, PROFILE4_COMPILER_ID};

const EFFECTS_AND_TRANSFORMS: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile4-effects-and-transforms.svg");
const PROFILE3_ADDITIVE_BOUNDARIES: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile3-additive-boundaries.svg");
const PROFILE4_SHOWCASE: &str =
    include_str!("../../../engine/rig/examples/svg-animation-profile4-transform-showcase.svg");

fn materialize(source: &str) -> SvgAnimationSource {
    SvgAnimationSource::parse(SourceSnapshot::new("profile4-test.svg", source)).unwrap()
}

fn fixture() -> SvgAnimationSource {
    SvgAnimationSource::parse(SourceSnapshot::new(
        "svg-animation-profile4-effects-and-transforms.svg",
        EFFECTS_AND_TRANSFORMS,
    ))
    .unwrap()
}

fn track_by_id<'a>(program: &'a AnimationProgram, id: &str) -> &'a Track {
    let marker = format!("id=\"{id}\"");
    program
        .tracks()
        .iter()
        .find(|track| track.source().contains(&marker))
        .unwrap_or_else(|| panic!("animation track `{id}` exists"))
}

fn sampled_scalar(
    source: &SvgAnimationSource,
    program: &AnimationProgram,
    target: PropertyTarget,
    time_ns: i64,
) -> f32 {
    let values = program
        .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
        .unwrap();
    match values.get(target) {
        Some(PropertyValue::AxisBinding(AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset,
        })) => *offset,
        value => panic!("expected a sampled axis-start value, found {value:?}"),
    }
}

fn sampled_scalar_bits(
    source: &SvgAnimationSource,
    program: &AnimationProgram,
    target: PropertyTarget,
    time_ns: i64,
) -> Option<u32> {
    let values = program
        .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
        .unwrap();
    match values.get(target) {
        Some(PropertyValue::AxisBinding(AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset,
        })) => Some(offset.to_bits()),
        None => None,
        value => panic!("expected an optional sampled axis-start value, found {value:?}"),
    }
}

fn sampled_number(
    source: &SvgAnimationSource,
    program: &AnimationProgram,
    target: PropertyTarget,
    time_ns: i64,
) -> f32 {
    let values = program
        .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
        .unwrap();
    match values.get(target) {
        Some(PropertyValue::Number(value)) => *value,
        value => panic!("expected a sampled number, found {value:?}"),
    }
}

fn sampled_lens_ops(
    source: &SvgAnimationSource,
    program: &AnimationProgram,
    target: PropertyTarget,
    time_ns: i64,
) -> Vec<LensOp> {
    let values = program
        .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
        .unwrap();
    match values.get(target) {
        Some(PropertyValue::LensOps(ops)) => ops.clone(),
        value => panic!("expected a sampled transform list, found {value:?}"),
    }
}

fn matrix(op: &LensOp) -> [f32; 6] {
    match op {
        LensOp::Matrix { m } => *m,
        value => panic!("Profile 4 projects typed transform effects to matrices, found {value:?}"),
    }
}

fn folded_matrix(ops: &[LensOp]) -> [f32; 6] {
    let affine = ops.iter().fold(Affine::IDENTITY, |acc, op| {
        let [a, b, c, d, e, f] = matrix(op);
        acc.then(&Affine { a, b, c, d, e, f })
    });
    [affine.a, affine.b, affine.c, affine.d, affine.e, affine.f]
}

fn profile4_error(source: &str) -> String {
    match SvgAnimationSource::parse(SourceSnapshot::new("invalid-profile4.svg", source)) {
        Ok(source) => source.compile_profile4().unwrap_err().to_string(),
        Err(error) => error.to_string(),
    }
}

#[test]
fn checked_in_profile4_showcase_compiles() {
    let program = materialize(PROFILE4_SHOWCASE).compile_profile4().unwrap();
    assert_eq!(program.compiler_id(), PROFILE4_COMPILER_ID);
    assert!(!program.tracks().is_empty());
}

#[test]
fn profile4_is_bit_compatible_with_profile3_additive_and_accumulating_effects() {
    let source = materialize(PROFILE3_ADDITIVE_BOUNDARIES);
    let profile3 = source.compile_profile3().unwrap();
    let profile4 = source.compile_profile4().unwrap();
    let target = profile3.tracks()[0].target();

    for time_ns in [
        -1,
        0,
        999_999_999,
        1_000_000_000,
        2_499_999_999,
        2_500_000_000,
        3_499_999_999,
        3_500_000_000,
        4_499_999_999,
        4_500_000_000,
        6_999_999_999,
        7_000_000_000,
        7_000_000_001,
    ] {
        assert_eq!(
            sampled_scalar_bits(&source, &profile4, target, time_ns),
            sampled_scalar_bits(&source, &profile3, target, time_ns),
            "Profile 4 changed Profile 3 output at {time_ns}ns"
        );
    }
}

#[test]
fn fixture_compiles_to_typed_effects_and_transform_targets() {
    let compiled = fixture().into_compiled_profile4().unwrap();
    let program = compiled.animation();

    assert_eq!(compiled.viewport(), (256.0, 224.0));
    assert_eq!(program.compiler_id(), PROFILE4_COMPILER_ID);
    assert_eq!(program.tracks().len(), 7);

    let scalar_to = track_by_id(program, "scalar-to-live");
    assert_eq!(scalar_to.target().property, PropertyKey::X);
    assert_eq!(
        scalar_to.effect_kind(),
        TrackEffectKind::ScalarFromLiveUnderlying
    );

    let translate = track_by_id(program, "translate-effect");
    assert_eq!(translate.target().property, PropertyKey::LensOps);
    assert_eq!(translate.composite(), CompositeOperation::Add);
    assert_eq!(
        translate.iteration_composite(),
        IterationCompositeOperation::Accumulate
    );
    let translate_curve = translate.transform_curve().unwrap();
    assert_eq!(translate_curve.kind(), TransformKind::Translate);
    assert_eq!(
        translate_curve.first_value(),
        TransformValue::Translate { x: 0.0, y: 0.0 }
    );
    assert_eq!(
        translate_curve.last_value(),
        TransformValue::Translate { x: 20.0, y: 10.0 }
    );

    let scale = track_by_id(program, "scale-effect");
    let scale_curve = scale.transform_curve().unwrap();
    assert_eq!(scale_curve.kind(), TransformKind::Scale);
    assert_eq!(
        scale_curve.first_value(),
        TransformValue::Scale { x: 1.0, y: 1.0 }
    );
    assert_eq!(
        scale_curve.last_value(),
        TransformValue::Scale { x: 2.0, y: 3.0 }
    );

    let rotate = track_by_id(program, "rotate-effect");
    let rotate_curve = rotate.transform_curve().unwrap();
    assert_eq!(rotate_curve.kind(), TransformKind::Rotate);
    assert_eq!(
        rotate_curve.first_value(),
        TransformValue::Rotate {
            degrees: 0.0,
            center_x: 16.0,
            center_y: 140.0,
        }
    );
    assert_eq!(
        rotate_curve.last_value(),
        TransformValue::Rotate {
            degrees: 180.0,
            center_x: 16.0,
            center_y: 140.0,
        }
    );

    assert_eq!(
        program
            .tracks()
            .iter()
            .filter(|track| track.target().property == PropertyKey::LensOps)
            .count(),
        5
    );
}

#[test]
fn scalar_lone_to_interpolates_from_the_live_lower_sandwich() {
    let source = fixture();
    let program = source.compile_profile4().unwrap();
    let target = track_by_id(&program, "scalar-to-live").target();
    let expected = [20.0, 28.0, 36.0, 58.0, 76.0, 90.0, 68.0, 76.0, 84.0];

    for (index, expected) in expected.into_iter().enumerate() {
        let time_ns = i64::try_from(index).unwrap() * 500_000_000;
        assert_eq!(
            sampled_scalar(&source, &program, target, time_ns),
            expected,
            "unexpected lone-to sandwich value at {time_ns}ns"
        );
    }
}

#[test]
fn scalar_lone_to_normalizes_svg_composition_at_the_frontend_boundary() {
    let source = materialize(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="target" x="10" width="8" height="8"><animate id="live" attributeName="x" to="30" dur="2s" repeatCount="2" fill="freeze" additive="sum" accumulate="sum"/></rect></svg>"#,
    );
    let program = source.compile_profile4().unwrap();
    let track = track_by_id(&program, "live");

    assert_eq!(
        track.effect_kind(),
        TrackEffectKind::ScalarFromLiveUnderlying
    );
    assert_eq!(
        track.composite(),
        CompositeOperation::InterpolateLiveUnderlying
    );
    assert_eq!(
        track.iteration_composite(),
        IterationCompositeOperation::Replace
    );

    for (time_ns, expected) in [
        (0, 10.0),
        (1_000_000_000, 20.0),
        (2_000_000_000, 10.0),
        (3_000_000_000, 20.0),
        (4_000_000_000, 30.0),
    ] {
        assert_eq!(
            sampled_scalar(&source, &program, track.target(), time_ns),
            expected,
            "unexpected normalized lone-to value at {time_ns}ns"
        );
    }
}

#[test]
fn live_underlying_layers_fold_sequentially_before_final_opacity_clamp() {
    let source = materialize(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="target" width="8" height="8" opacity="0.8"><animate id="add" attributeName="opacity" from="0.5" to="0.5" dur="2s" additive="sum"/><animate id="first-live" attributeName="opacity" to="0" dur="2s"/><animate id="second-live" attributeName="opacity" to="1" dur="2s"/></rect></svg>"#,
    );
    let program = source.compile_profile4().unwrap();
    let first = track_by_id(&program, "first-live");
    let second = track_by_id(&program, "second-live");
    assert_eq!(
        first.composite(),
        CompositeOperation::InterpolateLiveUnderlying
    );
    assert_eq!(
        second.composite(),
        CompositeOperation::InterpolateLiveUnderlying
    );

    // At half progress the lower additive layer is 0.8 + 0.5 = 1.3.
    // The first live layer yields 0.65 and the second consumes that live
    // result to yield 0.825. Clamping the lower prefix early would yield 0.75;
    // making both live layers read one captured base would yield 1.0.
    assert_eq!(
        sampled_number(&source, &program, second.target(), 1_000_000_000).to_bits(),
        0.825_f32.to_bits()
    );
}

#[test]
fn transform_splines_and_signed_zero_accumulation_remain_typed_until_projection() {
    let source = materialize(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="8" height="8"><animateTransform id="spline" attributeName="transform" type="translate" values="0 0;10 20;30 40" keyTimes="0;0.25;1" calcMode="spline" keySplines="0 0 1 1;0 0 1 1" dur="4s" fill="freeze"/></rect><rect x="40" width="8" height="8"><animateTransform id="signed-zero" attributeName="transform" type="translate" from="-0 -0" to="-0 -0" dur="1s" repeatCount="2" fill="freeze" accumulate="sum"/></rect></svg>"#,
    );
    let program = source.compile_profile4().unwrap();
    let spline = track_by_id(&program, "spline");
    let signed_zero = track_by_id(&program, "signed-zero");

    assert_eq!(
        matrix(&sampled_lens_ops(&source, &program, spline.target(), 1_000_000_000)[0]),
        [1.0, 0.0, 0.0, 1.0, 10.0, 20.0]
    );
    assert_eq!(
        matrix(&sampled_lens_ops(&source, &program, spline.target(), 2_500_000_000)[0]),
        [1.0, 0.0, 0.0, 1.0, 20.0, 30.0]
    );

    let frozen =
        matrix(&sampled_lens_ops(&source, &program, signed_zero.target(), 2_000_000_000)[0]);
    assert_eq!(frozen[4].to_bits(), (-0.0_f32).to_bits());
    assert_eq!(frozen[5].to_bits(), (-0.0_f32).to_bits());
}

#[test]
fn additive_translate_is_postmultiplied_after_the_static_scale() {
    let source = fixture();
    let program = source.compile_profile4().unwrap();
    let target = track_by_id(&program, "translate-effect").target();
    let expected = [
        (0.0, 0.0),
        (5.0, 2.5),
        (10.0, 5.0),
        (15.0, 7.5),
        (20.0, 10.0),
        (25.0, 12.5),
        (30.0, 15.0),
        (35.0, 17.5),
        (40.0, 20.0),
    ];

    for (index, (x, y)) in expected.into_iter().enumerate() {
        let time_ns = i64::try_from(index).unwrap() * 500_000_000;
        let ops = sampled_lens_ops(&source, &program, target, time_ns);
        assert_eq!(ops.len(), 2);
        assert_eq!(matrix(&ops[0]), [2.0, 0.0, 0.0, 3.0, 0.0, 0.0]);
        assert_eq!(matrix(&ops[1]), [1.0, 0.0, 0.0, 1.0, x, y]);
        assert_eq!(
            folded_matrix(&ops),
            [2.0, 0.0, 0.0, 3.0, x * 2.0, y * 3.0],
            "translation must be transformed by the authored scale at {time_ns}ns"
        );
    }
}

#[test]
fn scale_accumulation_adds_authored_components() {
    let source = fixture();
    let program = source.compile_profile4().unwrap();
    let target = track_by_id(&program, "scale-effect").target();
    let expected = [(1.0, 1.0), (1.5, 2.0), (3.0, 4.0), (3.5, 5.0), (4.0, 6.0)];

    for (index, (x, y)) in expected.into_iter().enumerate() {
        let time_ns = i64::try_from(index).unwrap() * 500_000_000;
        let ops = sampled_lens_ops(&source, &program, target, time_ns);
        assert_eq!(ops.len(), 2);
        assert_eq!(matrix(&ops[0]), [1.0, 0.0, 0.0, 1.0, 136.0, 48.0]);
        assert_eq!(matrix(&ops[1]), [x, 0.0, 0.0, y, 0.0, 0.0]);
        assert_eq!(folded_matrix(&ops), [x, 0.0, 0.0, y, 136.0, 48.0]);
    }
}

#[test]
fn replacement_rotate_cuts_static_transform_and_preserves_the_pivot() {
    let source = fixture();
    let program = source.compile_profile4().unwrap();
    let target = track_by_id(&program, "rotate-effect").target();

    for (time_ns, expected) in [
        (0, [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]),
        (1_000_000_000, [0.0, 1.0, -1.0, 0.0, 156.0, 124.0]),
        (2_000_000_000, [-1.0, 0.0, 0.0, -1.0, 32.0, 280.0]),
    ] {
        let ops = sampled_lens_ops(&source, &program, target, time_ns);
        assert_eq!(ops.len(), 1, "replacement must cut the authored translate");
        assert_eq!(matrix(&ops[0]), expected);
        assert_eq!(folded_matrix(&ops), expected);
    }
}

#[test]
fn mixed_transform_effects_retain_low_to_high_list_order() {
    let source = fixture();
    let program = source.compile_profile4().unwrap();
    let target = track_by_id(&program, "order-scale").target();
    let stack = program
        .effect_stacks()
        .find(|stack| stack[0].target() == target)
        .unwrap();
    assert_eq!(stack.len(), 2);
    assert!(stack[0].source().contains("id=\"order-scale\""));
    assert!(stack[1].source().contains("id=\"order-rotate\""));

    let ops = sampled_lens_ops(&source, &program, target, 2_000_000_000);
    assert_eq!(ops.len(), 3);
    assert_eq!(matrix(&ops[0]), [1.0, 0.0, 0.0, 1.0, 152.0, 88.0]);
    assert_eq!(matrix(&ops[1]), [2.0, 0.0, 0.0, 3.0, 0.0, 0.0]);
    assert_eq!(matrix(&ops[2]), [0.0, 1.0, -1.0, 0.0, 0.0, 0.0]);
    assert_eq!(folded_matrix(&ops), [0.0, 3.0, -2.0, 0.0, 152.0, 88.0]);
}

#[test]
fn profile4_rejects_undefined_lone_to_and_deferred_transform_kinds() {
    let lone_to = profile4_error(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8"><animateTransform attributeName="transform" type="translate" to="20 10" dur="1s"/></rect></svg>"#,
    );
    assert!(lone_to.contains("a lone `to`"), "{lone_to}");
    assert!(lone_to.contains("undefined by SVG"), "{lone_to}");
    assert!(lone_to.contains("provide both from and to"), "{lone_to}");

    for kind in ["skewX", "skewY"] {
        let source = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8"><animateTransform attributeName="transform" type="{kind}" from="0" to="10" dur="1s"/></rect></svg>"#
        );
        let error = profile4_error(&source);
        assert!(
            error.contains("valid SVG but deferred by Profile 4"),
            "{error}"
        );
    }

    let matrix = profile4_error(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8"><animateTransform attributeName="transform" type="matrix" from="1 0 0 1 0 0" to="1 0 0 1 10 10" dur="1s"/></rect></svg>"#,
    );
    assert!(
        matrix.contains("must be translate, scale, or rotate"),
        "{matrix}"
    );
}

#[test]
fn transform_value_arity_defaults_are_explicit_and_invalid_rotate_arity_is_rejected() {
    let source = materialize(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8"><animateTransform id="translate" attributeName="transform" type="translate" from="2" to="8" dur="1s" additive="sum"/><animateTransform id="scale" attributeName="transform" type="scale" from="2" to="4" dur="1s" additive="sum"/><animateTransform id="rotate" attributeName="transform" type="rotate" from="0" to="90" dur="1s" additive="sum"/></rect></svg>"#,
    );
    let program = source.compile_profile4().unwrap();
    assert_eq!(
        track_by_id(&program, "translate")
            .transform_curve()
            .unwrap()
            .first_value(),
        TransformValue::Translate { x: 2.0, y: 0.0 }
    );
    assert_eq!(
        track_by_id(&program, "scale")
            .transform_curve()
            .unwrap()
            .first_value(),
        TransformValue::Scale { x: 2.0, y: 2.0 }
    );
    assert_eq!(
        track_by_id(&program, "rotate")
            .transform_curve()
            .unwrap()
            .last_value(),
        TransformValue::Rotate {
            degrees: 90.0,
            center_x: 0.0,
            center_y: 0.0,
        }
    );

    let error = profile4_error(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8"><animateTransform attributeName="transform" type="rotate" from="0 4" to="90 4" dur="1s"/></rect></svg>"#,
    );
    assert!(
        error.contains("requires one angle or angle plus two center coordinates"),
        "{error}"
    );
}

#[test]
fn nested_animate_transform_href_overrides_its_parent_target() {
    let source = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="parent" width="8" height="8"><animateTransform id="remote" href="#target" attributeName="transform" type="translate" from="0" to="20" dur="1s" fill="freeze"/></rect><rect id="target" x="24" width="8" height="8"/></svg>"##,
    );
    let program = source.compile_profile4().unwrap();
    let track = track_by_id(&program, "remote");

    assert_eq!(track.target().property, PropertyKey::LensOps);
    assert_eq!(
        matrix(&sampled_lens_ops(&source, &program, track.target(), 1_000_000_000)[0]),
        [1.0, 0.0, 0.0, 1.0, 20.0, 0.0]
    );
}

#[test]
fn static_transform_shell_revision_zero_pins_grammar_projection_and_order() {
    let source = materialize(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="target" width="8" height="8" transform="matrix(1.0000000596046448 2 3 4 5 6) translate(7) scale(2) rotate(90 10 20) skewX(0) skewY(0)"><animateTransform id="append" attributeName="transform" type="translate" values="3 4" dur="1s" additive="sum"/></rect></svg>"#,
    );
    let program = source.compile_profile4().unwrap();
    let target = track_by_id(&program, "append").target();
    let ops = sampled_lens_ops(&source, &program, target, 0);

    assert_eq!(ops.len(), 9);
    assert_eq!(matrix(&ops[0]), [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    assert_eq!(matrix(&ops[1]), [1.0, 0.0, 0.0, 1.0, 7.0, 0.0]);
    assert_eq!(matrix(&ops[2]), [2.0, 0.0, 0.0, 2.0, 0.0, 0.0]);
    assert_eq!(matrix(&ops[3]), [1.0, 0.0, 0.0, 1.0, 10.0, 20.0]);
    assert_eq!(matrix(&ops[4]), [0.0, 1.0, -1.0, 0.0, 0.0, 0.0]);
    assert_eq!(matrix(&ops[5]), [1.0, 0.0, 0.0, 1.0, -10.0, -20.0]);
    assert_eq!(matrix(&ops[6]), [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    assert_eq!(matrix(&ops[7]), [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    assert_eq!(matrix(&ops[8]), [1.0, 0.0, 0.0, 1.0, 3.0, 4.0]);

    // Revision zero intentionally inherits svgtypes' binary64 parse followed
    // by one binary32 cast, including this known double-rounding boundary.
    assert_eq!(
        "1.0000000596046448".parse::<f32>().unwrap().to_bits(),
        0x3f80_0001
    );
    assert_eq!(matrix(&ops[0])[0].to_bits(), 1.0_f32.to_bits());

    for transform in ["translate(1px)", "perspective(10)"] {
        let error = profile4_error(&format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8" transform="{transform}"/></svg>"#
        ));
        assert!(error.contains("invalid transform item 0"), "{error}");
    }
}
