//! Retained SVG Animation Profiles 0–3 frontend/compiler contract.

use anchor_lab::animation::{
    AnimationProgram, CompositeOperation, Easing, IterationCompositeOperation, SampleTime,
};
use anchor_lab::model::{AnchorEdge, AxisBinding, SizeIntent};
use anchor_lab::properties::{PropertyKey, PropertyValue};
use anchor_lab::svg_animation::{
    SourceSnapshot, SvgAnimationSource, PROFILE0_COMPILER_ID, PROFILE1_COMPILER_ID,
    PROFILE2_COMPILER_ID, PROFILE3_COMPILER_ID,
};

const BOUNDARIES: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile0-boundaries.svg");
const KEYFRAME_BOUNDARIES: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile1-keyframe-boundaries.svg");
const SANDWICH_BOUNDARIES: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile2-sandwich-boundaries.svg");
const ADDITIVE_BOUNDARIES: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile3-additive-boundaries.svg");
const DEMO: &str = include_str!("../../../engine/rig/examples/svg-animation-profile0-demo.svg");
const KEYFRAME_DEMO: &str =
    include_str!("../../../engine/rig/examples/svg-animation-profile1-keyframes.svg");
const SANDWICH_DEMO: &str =
    include_str!("../../../engine/rig/examples/svg-animation-profile2-replacement-sandwich.svg");
const ADDITIVE_DEMO: &str =
    include_str!("../../../engine/rig/examples/svg-animation-profile3-motion-mixer.svg");

fn materialize(source: &str) -> SvgAnimationSource {
    SvgAnimationSource::parse(SourceSnapshot::new("inline.svg", source)).unwrap()
}

fn compile_error(source: &str) -> String {
    match SvgAnimationSource::parse(SourceSnapshot::new("invalid.svg", source)) {
        Ok(materialized) => materialized.compile_profile0().unwrap_err().to_string(),
        Err(error) => error.to_string(),
    }
}

fn compile_profile1_error(source: &str) -> String {
    match SvgAnimationSource::parse(SourceSnapshot::new("invalid-profile1.svg", source)) {
        Ok(materialized) => materialized.compile_profile1().unwrap_err().to_string(),
        Err(error) => error.to_string(),
    }
}

fn compile_profile2_error(source: &str) -> String {
    match SvgAnimationSource::parse(SourceSnapshot::new("invalid-profile2.svg", source)) {
        Ok(materialized) => materialized.compile_profile2().unwrap_err().to_string(),
        Err(error) => error.to_string(),
    }
}

fn compile_profile3_error(source: &str) -> String {
    match SvgAnimationSource::parse(SourceSnapshot::new("invalid-profile3.svg", source)) {
        Ok(materialized) => materialized.compile_profile3().unwrap_err().to_string(),
        Err(error) => error.to_string(),
    }
}

fn sampled_scalar_with(
    source: &str,
    time_ns: i64,
    compile: impl FnOnce(&SvgAnimationSource) -> AnimationProgram,
) -> Option<f32> {
    let materialized = materialize(source);
    let program = compile(&materialized);
    let target = program.tracks()[0].target();
    let values = program
        .sample(
            materialized.document(),
            SampleTime::from_nanoseconds(time_ns),
        )
        .unwrap();
    match values.get(target) {
        Some(PropertyValue::AxisBinding(AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset,
        })) => Some(*offset),
        Some(PropertyValue::SizeIntent(SizeIntent::Fixed(value))) => Some(*value),
        Some(PropertyValue::Number(value)) => Some(*value),
        None => None,
        value => panic!("unexpected sampled scalar value {value:?}"),
    }
}

fn sampled_scalar(source: &str, time_ns: i64) -> Option<f32> {
    sampled_scalar_with(source, time_ns, |materialized| {
        materialized.compile_profile0().unwrap()
    })
}

fn sampled_profile1_scalar(source: &str, time_ns: i64) -> Option<f32> {
    sampled_scalar_with(source, time_ns, |materialized| {
        materialized.compile_profile1().unwrap()
    })
}

fn sampled_profile2_scalar(source: &str, time_ns: i64) -> Option<f32> {
    sampled_scalar_with(source, time_ns, |materialized| {
        materialized.compile_profile2().unwrap()
    })
}

fn sampled_profile3_scalar(source: &str, time_ns: i64) -> Option<f32> {
    sampled_scalar_with(source, time_ns, |materialized| {
        materialized.compile_profile3().unwrap()
    })
}

#[test]
fn retained_source_materializes_once_and_compiles_typed_tracks() {
    let source = r##"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="64">
  <rect id="moving" x="10" y="8" width="20" height="16" rx="4" fill="#7c3aed">
    <animate id="move" attributeName="x" from="10" to="50" dur="1s" fill="freeze"/>
  </rect>
  <rect id="fading" x="80" y="8" width="20" height="16" fill="#2563eb" opacity="1"/>
  <animate href="#fading" attributeName="opacity" from="1" to="0" dur="1s" fill="freeze"/>
</svg>
"##;
    let materialized = materialize(source);
    assert_eq!(materialized.snapshot().source(), source);
    assert_eq!(materialized.snapshot().identity(), "inline.svg");
    assert_eq!(materialized.viewport(), (120.0, 64.0));
    assert!(materialized.has_animation_markup());
    assert_eq!(
        materialized
            .document()
            .get(materialized.document().root)
            .children
            .len(),
        2
    );

    let program = materialized.compile_profile0().unwrap();
    assert_eq!(program.compiler_id(), PROFILE0_COMPILER_ID);
    assert_eq!(program.tracks().len(), 2);
    assert_eq!(program.tracks()[0].target().property, PropertyKey::X);
    assert_eq!(program.tracks()[1].target().property, PropertyKey::Opacity);

    let values = program
        .sample(
            materialized.document(),
            SampleTime::from_nanoseconds(500_000_000),
        )
        .unwrap();
    assert!(values.iter().any(|(target, value)| {
        target.property == PropertyKey::X
            && matches!(
                value,
                PropertyValue::AxisBinding(AxisBinding::Pin {
                    anchor: AnchorEdge::Start,
                    offset
                }) if *offset == 30.0
            )
    }));
    assert!(values.iter().any(|(target, value)| {
        target.property == PropertyKey::Opacity
            && matches!(value, PropertyValue::Number(value) if *value == 0.5)
    }));
}

#[test]
fn all_five_properties_project_to_typed_midpoint_values() {
    let source = r##"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="64">
  <rect x="10" y="8" width="20" height="16" opacity="1">
    <animate attributeName="x" from="10" to="50" dur="1s" fill="freeze"/>
    <animate attributeName="y" from="8" to="28" dur="1s" fill="freeze"/>
    <animate attributeName="width" from="20" to="60" dur="1s" fill="freeze"/>
    <animate attributeName="height" from="16" to="32" dur="1s" fill="freeze"/>
    <animate attributeName="opacity" from="1" to="0" dur="1s" fill="freeze"/>
  </rect>
</svg>
"##;
    let materialized = materialize(source);
    let program = materialized.compile_profile0().unwrap();
    let values = program
        .sample(
            materialized.document(),
            SampleTime::from_nanoseconds(500_000_000),
        )
        .unwrap();

    for track in program.tracks() {
        let value = values.get(track.target()).unwrap();
        match (track.target().property, value) {
            (PropertyKey::X, PropertyValue::AxisBinding(AxisBinding::Pin { offset: 30.0, .. }))
            | (PropertyKey::Y, PropertyValue::AxisBinding(AxisBinding::Pin { offset: 18.0, .. }))
            | (PropertyKey::Width, PropertyValue::SizeIntent(SizeIntent::Fixed(40.0)))
            | (PropertyKey::Height, PropertyValue::SizeIntent(SizeIntent::Fixed(24.0)))
            | (PropertyKey::Opacity, PropertyValue::Number(0.5)) => {}
            other => panic!("unexpected midpoint projection {other:?}"),
        }
    }
}

#[test]
fn direct_seeks_are_order_independent_and_preserve_source_and_document() {
    let materialized = materialize(BOUNDARIES);
    let source_before = materialized.snapshot().source().to_string();
    let document_before = materialized.document().clone();
    let program = materialized.compile_profile0().unwrap();
    let times = [10, 17, 18, 25, 26, 9];
    let forward = times.map(|time| {
        program
            .sample(materialized.document(), SampleTime::from_nanoseconds(time))
            .unwrap()
    });
    let shuffled = [26, 18, 9, 25, 10, 17];
    for time in shuffled {
        let direct = program
            .sample(materialized.document(), SampleTime::from_nanoseconds(time))
            .unwrap();
        let expected = forward[times
            .iter()
            .position(|candidate| *candidate == time)
            .unwrap()]
        .clone();
        assert_eq!(direct, expected, "seek at {time}ns");
    }
    assert_eq!(materialized.snapshot().source(), source_before);
    assert_eq!(materialized.document(), &document_before);
}

#[test]
fn unsupported_dynamic_markup_is_retained_for_base_but_refused_for_sample() {
    let source = r##"
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="32">
  <rect id="base" x="4" y="4" width="12" height="12" fill="#2563eb"/>
  <set href="#base" attributeName="x" to="44" begin="0s"/>
</svg>
"##;
    let materialized = materialize(source);
    assert_eq!(materialized.snapshot().source(), source);
    assert!(materialized.has_animation_markup());
    assert_eq!(
        materialized
            .document()
            .get(materialized.document().root)
            .children
            .len(),
        1
    );
    let error = materialized.compile_profile0().unwrap_err().to_string();
    assert!(
        error.contains("recognizes only <animate> and <animateTransform>"),
        "{error}"
    );
}

#[test]
fn parent_and_same_document_href_targeting_are_equivalent() {
    let parent = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="32">
  <rect id="target" x="4" y="4" width="12" height="12">
    <animate attributeName="x" from="4" to="44" dur="1s"/>
  </rect>
</svg>
"#;
    let href = r##"
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="32">
  <rect id="target" x="4" y="4" width="12" height="12"/>
  <animate href="#target" attributeName="x" from="4" to="44" dur="1s"/>
</svg>
"##;
    assert_eq!(sampled_scalar(parent, 250_000_000), Some(14.0));
    assert_eq!(sampled_scalar(href, 250_000_000), Some(14.0));
}

#[test]
fn checked_boundary_fixture_hits_every_repeat_edge_exactly() {
    let expected: [(i64, Option<f32>); 9] = [
        (9, None),
        (10, Some(20.0)),
        (11, Some(22.0)),
        (17, Some(34.0)),
        (18, Some(20.0)),
        (19, Some(22.0)),
        (25, Some(34.0)),
        (26, Some(36.0)),
        (27, Some(36.0)),
    ];
    for (time, value) in expected {
        assert_eq!(sampled_scalar(BOUNDARIES, time), value, "at {time}ns");
    }
}

#[test]
fn profile1_is_bit_compatible_with_every_profile0_spelling() {
    let direct_rounding = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
  <rect width="1" height="1">
    <animate attributeName="x" from="-0" to="0.50000002980232238769531250000000000001"
      begin="2ms" dur="8ms" repeatCount="2" fill="freeze"/>
  </rect>
</svg>
"#;
    for (source, times) in [
        (BOUNDARIES, &[-1, 9, 10, 11, 17, 18, 19, 25, 26, 27][..]),
        (
            direct_rounding,
            &[
                -1, 1_999_999, 2_000_000, 3_000_000, 9_000_000, 10_000_000, 11_000_000, 17_000_000,
                18_000_000, 19_000_000,
            ][..],
        ),
    ] {
        for &time in times {
            assert_eq!(
                sampled_scalar(source, time).map(f32::to_bits),
                sampled_profile1_scalar(source, time).map(f32::to_bits),
                "Profile 1 changed Profile 0 output at {time}ns"
            );
        }
    }
}

#[test]
fn profile2_is_bit_compatible_with_profile1_single_effects() {
    for (source, times) in [
        (BOUNDARIES, &[-1, 9, 10, 11, 17, 18, 19, 25, 26, 27][..]),
        (
            KEYFRAME_BOUNDARIES,
            &[
                -1,
                0,
                499_999_999,
                500_000_000,
                999_999_999,
                1_000_000_000,
                2_000_000_000,
                3_000_000_000,
            ][..],
        ),
    ] {
        for &time in times {
            assert_eq!(
                sampled_profile2_scalar(source, time).map(f32::to_bits),
                sampled_profile1_scalar(source, time).map(f32::to_bits),
                "Profile 2 changed Profile 1 output at {time}ns"
            );
        }
    }
}

#[test]
fn profile2_orders_replacement_sandwiches_and_falls_through_exactly() {
    let materialized = materialize(SANDWICH_BOUNDARIES);
    let program = materialized.compile_profile2().unwrap();
    assert_eq!(program.compiler_id(), PROFILE2_COMPILER_ID);
    assert_eq!(program.tracks().len(), 2);
    assert_eq!(program.effect_stacks().count(), 1);
    assert!(program.tracks()[0].source().contains("lower"));
    assert!(program.tracks()[1].source().contains("higher"));

    let expected = [
        (0, None),
        (500_000_000, None),
        (999_999_999, None),
        (1_000_000_000, Some(16.0)),
        (1_000_000_001, Some(16.0)),
        (1_500_000_000, Some(21.0)),
        (1_999_999_999, Some(26.0)),
        (2_000_000_000, Some(72.0)),
        (2_000_000_001, Some(72.0)),
        (2_500_000_000, Some(80.0)),
        (2_999_999_999, Some(88.0)),
        (3_000_000_000, Some(36.0)),
        (3_000_000_001, Some(36.0)),
        (3_500_000_000, Some(41.0)),
        (4_000_000_000, Some(46.0)),
        (4_500_000_000, Some(51.0)),
        (4_999_999_999, Some(56.0)),
        (5_000_000_000, Some(56.0)),
        (5_000_000_001, Some(56.0)),
        (6_000_000_000, Some(56.0)),
    ];
    for (time, expected) in expected {
        let actual = sampled_profile2_scalar(SANDWICH_BOUNDARIES, time);
        assert_eq!(actual, expected, "at {time}ns");
    }
}

#[test]
fn profile2_uses_later_document_order_only_for_equal_begins() {
    let source = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
  <rect x="8" y="8" width="8" height="16">
    <animate id="earlier" attributeName="x" from="72" to="88" begin="1s" dur="4s" fill="freeze"/>
    <animate id="later" attributeName="x" from="16" to="56" begin="1s" dur="4s" fill="freeze"/>
  </rect>
</svg>
"#;
    assert_eq!(sampled_profile2_scalar(source, 2_000_000_000), Some(26.0));
}

#[test]
fn profile2_repeat_boundaries_do_not_reprioritize_a_lower_effect() {
    let source = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
  <rect x="8" y="8" width="8" height="16">
    <animate id="repeater" attributeName="x" from="70" to="90" begin="1s" dur="1s" repeatCount="3" fill="remove"/>
    <animate id="later-begin" attributeName="x" from="200" to="220" begin="1.5s" dur="2s" fill="remove"/>
  </rect>
</svg>
"#;

    for (time, expected) in [
        (1_999_999_999, 205.0),
        (2_000_000_000, 205.0),
        (2_000_000_001, 205.0),
        (2_999_999_999, 215.0),
        (3_000_000_000, 215.0),
        (3_000_000_001, 215.0),
        (3_499_999_999, 220.0),
        (3_500_000_000, 80.0),
        (3_500_000_001, 80.0),
    ] {
        assert_eq!(sampled_profile2_scalar(source, time), Some(expected));
    }
}

#[test]
fn profile2_repeats_sample_exact_boundaries_and_freeze_keeps_masking() {
    let repeat = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
  <rect x="8" y="8" width="8" height="16">
    <animate id="higher" attributeName="x" from="70" to="90" begin="2s" dur="1s" repeatCount="2" fill="remove"/>
    <animate id="lower" attributeName="x" from="10" to="50" begin="1s" dur="5s" fill="freeze"/>
  </rect>
</svg>
"#;
    for (time, expected) in [
        (1_999_999_999, 18.0),
        (2_000_000_000, 70.0),
        (2_000_000_001, 70.0),
        (2_999_999_999, 90.0),
        (3_000_000_000, 70.0),
        (3_000_000_001, 70.0),
        (3_999_999_999, 90.0),
        (4_000_000_000, 34.0),
        (4_000_000_001, 34.0),
    ] {
        assert_eq!(sampled_profile2_scalar(repeat, time), Some(expected));
    }

    let freeze = repeat.replace("fill=\"remove\"", "fill=\"freeze\"");
    for time in [4_000_000_000, 4_000_000_001] {
        assert_eq!(sampled_profile2_scalar(&freeze, time), Some(90.0));
    }
    assert_eq!(sampled_profile2_scalar(&freeze, 6_000_000_000), Some(90.0));
}

#[test]
fn profile2_remains_replacement_only() {
    for attribute in ["additive=\"sum\"", "accumulate=\"sum\""] {
        let source = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="1" height="1"><animate attributeName="x" from="0" to="1" dur="1s" {attribute}/></rect></svg>"#
        );
        let error = compile_profile2_error(&source);
        assert!(error.contains("must be"), "{error}");
        assert!(
            error.contains("replace") || error.contains("none"),
            "{error}"
        );
    }
}

#[test]
fn profile3_is_cumulative_and_lowers_svg_composition_to_typed_operations() {
    for source in [KEYFRAME_BOUNDARIES, SANDWICH_BOUNDARIES] {
        for time in [
            -1,
            0,
            499_999_999,
            500_000_000,
            999_999_999,
            1_000_000_000,
            1_500_000_000,
            1_999_999_999,
            2_000_000_000,
            2_500_000_000,
            2_999_999_999,
            3_000_000_000,
            3_500_000_000,
            4_000_000_000,
            4_500_000_000,
            4_999_999_999,
            5_000_000_000,
            6_000_000_000,
        ] {
            assert_eq!(
                sampled_profile3_scalar(source, time).map(f32::to_bits),
                sampled_profile2_scalar(source, time).map(f32::to_bits),
                "Profile 3 changed Profile 2 output at {time}ns"
            );
        }
    }

    let materialized = materialize(ADDITIVE_BOUNDARIES);
    let program = materialized.compile_profile3().unwrap();
    assert_eq!(program.compiler_id(), PROFILE3_COMPILER_ID);
    assert_eq!(program.tracks().len(), 4);
    assert_eq!(program.effect_stacks().count(), 1);
    let sources = program
        .tracks()
        .iter()
        .map(|track| {
            let source = track.source();
            let id = [
                "base-cumulative",
                "lower-replace",
                "upper-cumulative",
                "upper-temporary",
            ]
            .into_iter()
            .find(|id| source.contains(id))
            .unwrap();
            (id, track.composite(), track.iteration_composite())
        })
        .collect::<Vec<_>>();
    assert_eq!(
        sources,
        vec![
            (
                "base-cumulative",
                CompositeOperation::Add,
                IterationCompositeOperation::Accumulate,
            ),
            (
                "lower-replace",
                CompositeOperation::Replace,
                IterationCompositeOperation::Replace,
            ),
            (
                "upper-cumulative",
                CompositeOperation::Add,
                IterationCompositeOperation::Accumulate,
            ),
            (
                "upper-temporary",
                CompositeOperation::Add,
                IterationCompositeOperation::Replace,
            ),
        ]
    );

    for (time, expected) in [
        (0, 10.0),
        (500_000_000, 12.0),
        (1_000_000_000, 16.0),
        (1_500_000_000, 18.0),
        (2_000_000_000, 22.0),
        (2_500_000_000, 20.0),
        (3_000_000_000, 25.0),
        (3_500_000_000, 38.0),
        (4_000_000_000, 51.0),
        (4_500_000_000, 52.0),
        (5_000_000_000, 61.0),
        (5_500_000_000, 66.0),
        (6_000_000_000, 71.0),
        (6_500_000_000, 76.0),
        (7_000_000_000, 76.0),
    ] {
        assert_eq!(
            sampled_profile3_scalar(ADDITIVE_BOUNDARIES, time),
            Some(expected),
            "at {time}ns"
        );
    }
}

#[test]
fn profile3_lowers_replacement_accumulation_independently() {
    let source = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
  <rect x="10" y="8" width="8" height="16">
    <animate attributeName="x" from="20" to="30" dur="1s" repeatCount="3" fill="freeze" additive="replace" accumulate="sum"/>
  </rect>
</svg>
"#;
    let materialized = materialize(source);
    let program = materialized.compile_profile3().unwrap();
    assert_eq!(program.tracks().len(), 1);
    assert_eq!(program.tracks()[0].composite(), CompositeOperation::Replace);
    assert_eq!(
        program.tracks()[0].iteration_composite(),
        IterationCompositeOperation::Accumulate
    );

    for (time, expected) in [
        (0, 20.0),
        (1_000_000_000, 50.0),
        (1_500_000_000, 55.0),
        (3_000_000_000, 90.0),
    ] {
        assert_eq!(sampled_profile3_scalar(source, time), Some(expected));
    }
}

#[test]
fn profile3_has_exact_additive_repeat_and_fallthrough_boundaries() {
    for (time, expected) in [
        (999_999_999, 14.0),
        (1_000_000_000, 16.0),
        (2_499_999_999, 24.0),
        (2_500_000_000, 20.0),
        (3_499_999_999, 34.0),
        (3_500_000_000, 38.0),
        (4_499_999_999, 64.0),
        (4_500_000_000, 52.0),
    ] {
        assert_eq!(
            sampled_profile3_scalar(ADDITIVE_BOUNDARIES, time),
            Some(expected),
            "at {time}ns"
        );
    }
}

#[test]
fn profile3_clamps_only_the_final_opacity_sandwich() {
    let source = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
  <rect x="8" y="8" width="24" height="24" opacity="0.2">
    <animate attributeName="opacity" from="0.4" to="0.4" dur="1s" fill="freeze" additive="sum"/>
    <animate attributeName="opacity" from="0.5" to="0.5" dur="1s" fill="freeze" additive="sum"/>
  </rect>
</svg>
"#;
    assert_eq!(sampled_profile3_scalar(source, 0), Some(1.0));
}

#[test]
fn profile3_rejects_unknown_composition_values_without_weakening_older_profiles() {
    for (attribute, accepted) in [
        ("additive=\"multiply\"", "replace"),
        ("accumulate=\"multiply\"", "none"),
    ] {
        let source = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="1" height="1"><animate attributeName="x" from="0" to="1" dur="1s" {attribute}/></rect></svg>"#
        );
        let error = compile_profile3_error(&source);
        assert!(error.contains(accepted), "{error}");
        assert!(error.contains("sum"), "{error}");
    }

    let additive = ADDITIVE_BOUNDARIES.replace("additive=\"sum\"", "additive=\"replace\"");
    let error = compile_profile2_error(&additive);
    assert!(error.contains("accumulate"), "{error}");
    assert!(error.contains("none"), "{error}");
}

#[test]
fn profile1_values_and_key_times_lower_to_one_canonical_curve() {
    let source = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="32">
  <rect x="0" y="8" width="8" height="16">
    <animate
      attributeName="x"
      values="10;30;90"
      from="not-a-number"
      to="also-ignored"
      keyTimes="0;0.25;1"
      dur="1s"
      fill="freeze"
    />
  </rect>
</svg>
"#;
    let materialized = materialize(source);
    let program = materialized.compile_profile1().unwrap();
    assert_eq!(program.compiler_id(), PROFILE1_COMPILER_ID);
    let curve = program.tracks()[0].scalar_curve().unwrap();
    assert_eq!(curve.keyframe_count(), 3);
    assert_eq!(curve.keyframes().nth(1).unwrap().offset().numerator(), 1);
    assert_eq!(curve.keyframes().nth(1).unwrap().offset().denominator(), 4);
    assert!(curve
        .segments()
        .iter()
        .all(|segment| segment.easing() == Easing::Linear));

    assert_eq!(sampled_profile1_scalar(source, 0), Some(10.0));
    assert_eq!(sampled_profile1_scalar(source, 250_000_000), Some(30.0));
    assert_eq!(sampled_profile1_scalar(source, 625_000_000), Some(60.0));
    assert_eq!(sampled_profile1_scalar(source, 1_000_000_000), Some(90.0));
}

#[test]
fn profile1_implicit_equal_times_match_their_explicit_spelling() {
    let implicit = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="32">
  <rect width="8" height="16">
    <animate attributeName="x" values="0;30;90" calcMode="spline"
      keySplines="0.4 0 0.6 1;0.2 0.8 0.8 0.2" dur="1s" fill="freeze"/>
  </rect>
</svg>
"#;
    let explicit = implicit.replace(
        "calcMode=\"spline\"",
        "keyTimes=\"0;0.5;1\" calcMode=\"spline\"",
    );
    for time in [
        0,
        1,
        249_999_999,
        250_000_000,
        499_999_999,
        500_000_000,
        500_000_001,
        750_000_000,
        999_999_999,
        1_000_000_000,
    ] {
        assert_eq!(
            sampled_profile1_scalar(implicit, time).map(f32::to_bits),
            sampled_profile1_scalar(&explicit, time).map(f32::to_bits),
            "implicit and explicit equal offsets differ at {time}ns"
        );
    }
}

#[test]
fn profile1_constant_and_spline_modes_have_closed_semantics() {
    let constant = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32">
  <rect x="0" y="8" width="8" height="16">
    <animate attributeName="x" values="17" dur="1s" fill="freeze"/>
  </rect>
</svg>
"#;
    for time in [0, 1, 999_999_999, 1_000_000_000, i64::MAX] {
        assert_eq!(sampled_profile1_scalar(constant, time), Some(17.0));
    }

    let spline = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="32">
  <rect x="0" y="8" width="8" height="16">
    <animate
      attributeName="x"
      values="0;100"
      calcMode="spline"
      keySplines="0.5, 0 0.5, 1;"
      dur="1s"
      fill="freeze"
    />
  </rect>
</svg>
"#;
    let quarter = sampled_profile1_scalar(spline, 250_000_000).unwrap();
    let midpoint = sampled_profile1_scalar(spline, 500_000_000).unwrap();
    let three_quarters = sampled_profile1_scalar(spline, 750_000_000).unwrap();
    assert!(quarter < 25.0, "ease-in quarter was {quarter}");
    assert_eq!(midpoint.to_bits(), 50.0_f32.to_bits());
    assert!(
        three_quarters > 75.0,
        "ease-out quarter was {three_quarters}"
    );

    let ignored_linear_splines = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="32">
  <rect x="0" y="8" width="8" height="16">
    <animate
      attributeName="x"
      values="0;100"
      calcMode="linear"
      keySplines="0 1 1 0; 0 0 1 1"
      dur="1s"
      fill="freeze"
    />
  </rect>
</svg>
"#;
    assert_eq!(
        sampled_profile1_scalar(ignored_linear_splines, 250_000_000)
            .unwrap()
            .to_bits(),
        25.0_f32.to_bits(),
        "valid keySplines do not affect linear mode or impose a tuple count"
    );
}

#[test]
fn profile1_spline_controls_round_directly_to_binary32() {
    // This decimal is just above the midpoint between 0.5f32 and its next
    // representable value. Parsing through binary64 first rounds to the exact
    // midpoint and would then choose 0.5 by ties-to-even; direct binary32
    // parsing correctly chooses the upper value.
    let source = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
  <rect width="1" height="1">
    <animate
      attributeName="x"
      values="0;1"
      calcMode="spline"
      keySplines="0.50000002980232238769531250000000000001 0 1 1"
      dur="1s"
    />
  </rect>
</svg>
"#;
    let materialized = materialize(source);
    let program = materialized.compile_profile1().unwrap();
    let easing = program.tracks()[0].scalar_curve().unwrap().segments()[0].easing();
    let Easing::CubicBezier(spline) = easing else {
        panic!("expected cubic Bézier easing");
    };
    assert_eq!(spline.x1().to_bits(), 0x3f00_0001);
}

#[test]
fn profile1_keyframe_fixture_preserves_exact_boundaries_repeats_and_freeze() {
    let expected: [(i64, Option<f32>); 10] = [
        (9, None),
        (10, Some(4.0)),
        (13, Some(16.0)),
        (14, Some(20.0)),
        (15, Some(22.666666)),
        (26, Some(4.0)),
        (30, Some(20.0)),
        (41, Some(49.333332)),
        (42, Some(52.0)),
        (43, Some(52.0)),
    ];
    for (time, expected) in expected {
        let actual = sampled_profile1_scalar(KEYFRAME_BOUNDARIES, time);
        match (actual, expected) {
            (Some(actual), Some(expected)) => assert_eq!(
                actual.to_bits(),
                expected.to_bits(),
                "keyframe boundary sample at {time}ns"
            ),
            (actual, expected) => assert_eq!(actual, expected, "sample at {time}ns"),
        }
    }
}

#[test]
fn profile1_rejects_ambiguous_or_malformed_keyframe_grammar() {
    let cases = [
        (
            r#"<animate attributeName="x" values="" dur="1s"/>"#,
            "values on",
        ),
        (
            r#"<animate attributeName="x" values="0;;1" dur="1s"/>"#,
            "values[1]",
        ),
        (
            r#"<animate attributeName="x" values="bad" from="0" to="1" dur="1s"/>"#,
            "values[0]",
        ),
        (
            r#"<animate attributeName="x" values="0;1;2" keyTimes="0;1" dur="1s"/>"#,
            "has 2 entries; values has 3",
        ),
        (
            r#"<animate attributeName="x" values="0;1" keyTimes="0.1;1" dur="1s"/>"#,
            "first keyframe offset must be 0",
        ),
        (
            r#"<animate attributeName="x" values="0;1" keyTimes="0;0.9" dur="1s"/>"#,
            "last keyframe offset must be 1",
        ),
        (
            r#"<animate attributeName="x" values="0;1;2" keyTimes="0;0;1" dur="1s"/>"#,
            "increase strictly",
        ),
        (
            r#"<animate attributeName="x" values="0;1;2;3" keyTimes="0;0.75;0.5;1" dur="1s"/>"#,
            "increase strictly",
        ),
        (
            r#"<animate attributeName="x" values="0;1" calcMode="spline" dur="1s"/>"#,
            "requires `keySplines`",
        ),
        (
            r#"<animate attributeName="x" values="0;1;2" calcMode="spline" keySplines="0 0 1 1" dur="1s"/>"#,
            "has 1 entries; 2 required",
        ),
        (
            r#"<animate attributeName="x" values="0;1" calcMode="spline" keySplines="0 0 1 1.1" dur="1s"/>"#,
            "must be in [0, 1] before binary32 rounding",
        ),
        (
            r#"<animate attributeName="x" values="1" keyTimes="0" dur="1s"/>"#,
            "one-value constant",
        ),
        (
            r#"<animate attributeName="x" values="0;1" calcMode="discrete" dur="1s"/>"#,
            "valid SVG but unsupported by Profile 1",
        ),
        (
            r#"<animate attributeName="x" values="0;1" calcMode="linear" keySplines="broken" dur="1s"/>"#,
            "control 0 must be an SVG number",
        ),
        (
            r#"<animate attributeName="x" values="0;1" calcMode="spline" keySplines="0 0.5.5 1" dur="1s"/>"#,
            "requires a comma or XML whitespace",
        ),
        (
            r#"<animate attributeName="x" values="0;1" calcMode="spline" keySplines="0 0 1 1," dur="1s"/>"#,
            "ends with a comma",
        ),
        (
            r#"<animate attributeName="x" values="0;1" calcMode="spline" keySplines="0 0 1 1.0000000000000000000001" dur="1s"/>"#,
            "before binary32 rounding",
        ),
    ];

    for (animation, expected) in cases {
        let source = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="1" height="1">{animation}</rect></svg>"#
        );
        let error = compile_profile1_error(&source);
        assert!(
            error.contains(expected),
            "expected `{expected}` in `{error}`"
        );
        assert!(error.starts_with("invalid-profile1.svg:1:"), "{error}");
    }
}

#[test]
fn profile1_source_limits_close_the_new_list_and_exact_number_domains() {
    let document = |animation: &str| {
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="1" height="1">{animation}</rect></svg>"#
        )
    };

    let values_at_limit = (0..4_096)
        .map(|index| if index == 4_095 { "1" } else { "0" })
        .collect::<Vec<_>>()
        .join(";");
    let source = document(&format!(
        r#"<animate attributeName="x" values="{values_at_limit}" dur="1s"/>"#
    ));
    assert_eq!(
        materialize(&source).compile_profile1().unwrap().tracks()[0]
            .scalar_curve()
            .unwrap()
            .keyframe_count(),
        4_096
    );

    let values_over_limit = (0..4_097).map(|_| "0").collect::<Vec<_>>().join(";");
    let source = document(&format!(
        r#"<animate attributeName="x" values="{values_over_limit}" dur="1s"/>"#
    ));
    assert!(
        compile_profile1_error(&source).contains("profile limit is 4096"),
        "values limit must fail explicitly"
    );

    let splines_at_limit = (0..4_095).map(|_| "0 0 1 1").collect::<Vec<_>>().join(";");
    let source = document(&format!(
        r#"<animate attributeName="x" values="0;1" calcMode="linear" keySplines="{splines_at_limit}" dur="1s"/>"#
    ));
    materialize(&source).compile_profile1().unwrap();

    let splines_over_limit = format!("{splines_at_limit};0 0 1 1");
    let source = document(&format!(
        r#"<animate attributeName="x" values="0;1" calcMode="linear" keySplines="{splines_over_limit}" dur="1s"/>"#
    ));
    assert!(
        compile_profile1_error(&source).contains("profile limit is 4095"),
        "spline-list limit must fail explicitly"
    );

    let control_128 = format!("1.{}", "0".repeat(126));
    let source = document(&format!(
        r#"<animate attributeName="x" values="0;1" calcMode="spline" keySplines="0 0 1 {control_128}" dur="1s"/>"#
    ));
    materialize(&source).compile_profile1().unwrap();

    let control_129 = format!("1.{}", "0".repeat(127));
    let source = document(&format!(
        r#"<animate attributeName="x" values="0;1" calcMode="spline" keySplines="0 0 1 {control_129}" dur="1s"/>"#
    ));
    assert!(
        compile_profile1_error(&source)
            .contains("control 3 is 129 bytes; the profile limit is 128"),
        "spline-control token limit must fail explicitly"
    );

    let key_time_128 = format!("1.{}", "0".repeat(126));
    let source = document(&format!(
        r#"<animate attributeName="x" values="0;1" keyTimes="0;{key_time_128}" dur="1s"/>"#
    ));
    materialize(&source).compile_profile1().unwrap();

    let key_time_129 = format!("1.{}", "0".repeat(127));
    let source = document(&format!(
        r#"<animate attributeName="x" values="0;1" keyTimes="0;{key_time_129}" dur="1s"/>"#
    ));
    assert!(
        compile_profile1_error(&source).contains("is 129 bytes; the profile limit is 128"),
        "key-time token limit must fail explicitly"
    );

    for (middle, accepted) in [
        ("0.0000000000000000001", true),
        ("0.00000000000000000001", false),
    ] {
        let source = document(&format!(
            r#"<animate attributeName="x" values="0;1;2" keyTimes="0;{middle};1" dur="1s"/>"#
        ));
        if accepted {
            materialize(&source).compile_profile1().unwrap();
        } else {
            assert!(
                compile_profile1_error(&source).contains("unsigned 64-bit denominator domain"),
                "reduced-ratio boundary must fail explicitly"
            );
        }
    }

    for exponent in [128, -128] {
        let source = document(&format!(
            r#"<animate attributeName="x" values="0;1" keyTimes="0e{exponent};1" dur="1s"/>"#
        ));
        materialize(&source).compile_profile1().unwrap();
        let source = document(&format!(
            r#"<animate attributeName="x" values="0;1" calcMode="spline" keySplines="0e{exponent} 0 1 1" dur="1s"/>"#
        ));
        materialize(&source).compile_profile1().unwrap();
    }
    for exponent in [129, -129] {
        let expected = format!("decimal exponent must be in [-128, 128]; found {exponent}");
        let source = document(&format!(
            r#"<animate attributeName="x" values="0;1" keyTimes="0e{exponent};1" dur="1s"/>"#
        ));
        assert!(
            compile_profile1_error(&source).contains(&expected),
            "key-time exponent limit must fail explicitly"
        );
        let source = document(&format!(
            r#"<animate attributeName="x" values="0;1" calcMode="spline" keySplines="0e{exponent} 0 1 1" dur="1s"/>"#
        ));
        assert!(
            compile_profile1_error(&source).contains(&expected),
            "spline exponent limit must fail explicitly"
        );
    }
}

#[test]
fn authored_property_domains_are_checked_before_binary32_rounding() {
    let document = |animation: &str| {
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="1" height="1">{animation}</rect></svg>"#
        )
    };

    for animation in [
        r#"<animate attributeName="width" from="0" to="-1e-100" dur="1s"/>"#,
        r#"<animate attributeName="opacity" from="0" to="1.00000000000000001" dur="1s"/>"#,
    ] {
        let source = document(animation);
        let profile0 = compile_error(&source);
        let profile1 = compile_profile1_error(&source);
        assert!(profile0.contains("before binary32 rounding"), "{profile0}");
        assert!(profile1.contains("before binary32 rounding"), "{profile1}");
    }

    for animation in [
        r#"<animate attributeName="width" values="0;-1e-100" dur="1s"/>"#,
        r#"<animate attributeName="opacity" values="0;1.00000000000000001" dur="1s"/>"#,
    ] {
        let error = compile_profile1_error(&document(animation));
        assert!(error.contains("before binary32 rounding"), "{error}");
    }

    let signed_zero =
        document(r#"<animate attributeName="width" from="-0" to="-0.000e100" dur="1s"/>"#);
    materialize(&signed_zero).compile_profile0().unwrap();
    materialize(&signed_zero).compile_profile1().unwrap();
}

#[test]
fn profiles_reject_negative_begin_before_format_neutral_timing() {
    let source = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
  <rect width="1" height="1">
    <animate attributeName="x" from="0" to="1" begin="-1ms" dur="1s"/>
  </rect>
</svg>
"#;

    for error in [compile_error(source), compile_profile1_error(source)] {
        assert!(
            error.contains(
                "begin on <animate> at 4:5 must use the exact non-negative clock grammar"
            ),
            "{error}"
        );
    }
}

#[test]
fn namespace_prefixes_do_not_change_svg_element_identity() {
    let prefixed = r#"
<s:svg xmlns:s="http://www.w3.org/2000/svg" width="80" height="32">
  <s:rect id="target" x="4" y="4" width="12" height="12">
    <s:animate attributeName="x" from="4" to="44" dur="1s"/>
  </s:rect>
</s:svg>
"#;
    assert_eq!(sampled_scalar(prefixed, 500_000_000), Some(24.0));
}

#[test]
fn sample_is_strict_about_side_channels_targeting_and_grammar() {
    let cases = [
        (
            r#"<svg xmlns="urn:not-svg" width="10" height="10"/>"#,
            "not in the SVG namespace",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"/>"#,
            "viewBox is not accepted",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1" transform="translate(1 1)"/></svg>"#,
            "unknown attribute `transform`",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect id="r" width="1" height="1"/><animate href="other.svg#r" attributeName="x" from="0" to="1" dur="1s"/></svg>"#,
            "bare same-document fragment",
        ),
        (
            r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><rect id="r" width="1" height="1"/><animate xlink:href="#r" attributeName="x" from="0" to="1" dur="1s"/></svg>"##,
            "unsupported attribute `xlink:href`",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"><animate attributeName="x" from="0" to="1"/></rect></svg>"#,
            "requires `dur`",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"><animate attributeName="x" from="0" to="1" dur="1e-3s"/></rect></svg>"#,
            "decimal digits only",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"><animate attributeName="width" from="-1" to="1" dur="1s"/></rect></svg>"#,
            "non-negative for size animation",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"><animate attributeName="opacity" from="0" to="2" dur="1s"/></rect></svg>"#,
            "between 0 and 1 inclusive",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"><animateTransform attributeName="transform" dur="1s"/></rect></svg>"#,
            "admits only <animate>",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script/></svg>"#,
            "<script> is forbidden",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1" onclick="go()"><animate attributeName="x" from="0" to="1" dur="1s"/></rect></svg>"#,
            "event-handler attribute `onclick`",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1" style="animation: pulse 1s"><animate attributeName="x" from="0" to="1" dur="1s"/></rect></svg>"#,
            "CSS animation or transition",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"><animate attributeName="x" from="0" to="1" dur="1s" keyTimes="0;1"/></rect></svg>"#,
            "unsupported attribute `keyTimes`",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"><animate attributeName="x" from="0" to="1" dur="1s">not whitespace</animate></rect></svg>"#,
            "character content is not supported",
        ),
        (
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="1" height="1"><animate attributeName="x" from="0" to="1" dur="1s"><!-- not whitespace --></animate></rect></svg>"#,
            "found an XML comment",
        ),
    ];

    for (source, expected) in cases {
        let error = compile_error(source);
        assert!(
            error.contains(expected),
            "expected `{expected}` in `{error}`"
        );
        assert!(error.starts_with("invalid.svg:1:"), "{error}");
        if expected.contains("unsupported attribute") || expected.contains("forbidden") {
            assert!(error.contains("accepted Profile 0 dynamic form"), "{error}");
        }
    }
}

#[test]
fn duplicate_ids_and_legacy_profile_duplicate_effects_report_both_sites() {
    let duplicate_id = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <rect id="same" width="1" height="1"/>
  <rect id="same" width="1" height="1"/>
</svg>
"#;
    let error = compile_error(duplicate_id);
    assert!(error.contains("duplicate id `same`"), "{error}");
    assert!(error.contains("first declared at 3:"), "{error}");

    let duplicate_target = r#"
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <rect id="same" width="1" height="1">
    <animate attributeName="x" from="0" to="1" dur="1s"/>
    <animate attributeName="x" from="1" to="2" dur="1s"/>
  </rect>
</svg>
"#;
    for error in [
        compile_error(duplicate_target),
        compile_profile1_error(duplicate_target),
    ] {
        assert!(
            error.contains("duplicates the same node/property"),
            "{error}"
        );
        assert!(error.contains("first animated at 4:"), "{error}");
    }
    materialize(duplicate_target).compile_profile2().unwrap();
}

#[test]
fn visual_demo_is_a_real_profile0_program_not_a_manual_value_script() {
    let materialized =
        SvgAnimationSource::parse(SourceSnapshot::new("svg-animation-profile0-demo.svg", DEMO))
            .unwrap();
    let program = materialized.compile_profile0().unwrap();
    assert_eq!(materialized.viewport(), (960.0, 540.0));
    assert_eq!(
        materialized
            .document()
            .get(materialized.document().root)
            .children
            .len(),
        26
    );
    assert_eq!(program.tracks().len(), 31);
    assert!(program
        .tracks()
        .iter()
        .any(|track| track.target().property == PropertyKey::X));
    assert!(program
        .tracks()
        .iter()
        .any(|track| track.target().property == PropertyKey::Y));
    assert!(program
        .tracks()
        .iter()
        .any(|track| track.target().property == PropertyKey::Width));
    assert!(program
        .tracks()
        .iter()
        .any(|track| track.target().property == PropertyKey::Height));
    assert!(program
        .tracks()
        .iter()
        .any(|track| track.target().property == PropertyKey::Opacity));
}

#[test]
fn keyframe_demo_is_a_real_profile1_program_with_per_segment_easing() {
    let materialized = SvgAnimationSource::parse(SourceSnapshot::new(
        "svg-animation-profile1-keyframes.svg",
        KEYFRAME_DEMO,
    ))
    .unwrap();
    let program = materialized.compile_profile1().unwrap();
    assert_eq!(materialized.viewport(), (960.0, 540.0));
    assert_eq!(
        materialized
            .document()
            .get(materialized.document().root)
            .children
            .len(),
        40
    );
    assert_eq!(program.compiler_id(), PROFILE1_COMPILER_ID);
    assert_eq!(program.tracks().len(), 4);
    assert_eq!(
        program
            .tracks()
            .iter()
            .filter(|track| {
                track
                    .scalar_curve()
                    .unwrap()
                    .segments()
                    .iter()
                    .any(|segment| matches!(segment.easing(), Easing::CubicBezier(_)))
            })
            .count(),
        2
    );
    let mixed = program
        .tracks()
        .iter()
        .find(|track| {
            let segments = track.scalar_curve().unwrap().segments();
            segments.len() == 3
                && segments[0].easing() != segments[1].easing()
                && segments[1].easing() != segments[2].easing()
        })
        .expect("one track proves that easing belongs to each segment");
    assert_eq!(mixed.scalar_curve().unwrap().keyframe_count(), 4);
}

#[test]
fn sandwich_demo_is_a_real_profile2_program_with_one_composed_target() {
    let materialized = SvgAnimationSource::parse(SourceSnapshot::new(
        "svg-animation-profile2-replacement-sandwich.svg",
        SANDWICH_DEMO,
    ))
    .unwrap();
    let program = materialized.compile_profile2().unwrap();
    assert_eq!(materialized.viewport(), (960.0, 540.0));
    assert_eq!(program.compiler_id(), PROFILE2_COMPILER_ID);
    assert_eq!(program.tracks().len(), 4);
    let stacks = program.effect_stacks().collect::<Vec<_>>();
    assert_eq!(stacks.len(), 3);
    assert_eq!(
        stacks.iter().filter(|stack| stack.len() == 2).count(),
        1,
        "exactly the composed green rail is a replacement sandwich"
    );

    let target_named = |name: &str| {
        program
            .tracks()
            .iter()
            .find_map(|track| {
                let node = materialized.document().node_for_key(track.target().node)?;
                (node.header.name.as_deref() == Some(name)).then_some(track.target())
            })
            .unwrap_or_else(|| panic!("animated demo rail `{name}` exists"))
    };
    let lower = target_named("lower-only");
    let higher = target_named("higher-only");
    let composed = target_named("composed");
    let sample = |target, time| {
        let values = program
            .sample(materialized.document(), SampleTime::from_nanoseconds(time))
            .unwrap();
        match values.get(target) {
            Some(PropertyValue::AxisBinding(AxisBinding::Pin {
                anchor: AnchorEdge::Start,
                offset,
            })) => Some(*offset),
            None => None,
            value => panic!("unexpected demo rail value {value:?}"),
        }
    };

    assert_eq!(sample(lower, 1_500_000_000), Some(200.0));
    assert_eq!(sample(higher, 1_500_000_000), None);
    assert_eq!(
        sample(composed, 1_500_000_000),
        sample(lower, 1_500_000_000)
    );

    assert_eq!(sample(lower, 2_500_000_000), Some(360.0));
    assert_eq!(sample(higher, 2_500_000_000), Some(520.0));
    assert_eq!(
        sample(composed, 2_500_000_000),
        sample(higher, 2_500_000_000)
    );

    assert_eq!(sample(higher, 3_000_000_000), None);
    assert_eq!(sample(lower, 3_000_000_000), Some(440.0));
    assert_eq!(
        sample(composed, 3_000_000_000),
        sample(lower, 3_000_000_000)
    );

    assert_eq!(sample(lower, 5_000_000_000), Some(760.0));
    assert_eq!(
        sample(composed, 5_000_000_000),
        sample(lower, 5_000_000_000)
    );
}

#[test]
fn motion_mixer_demo_uses_profile3_composition_for_its_result_lane() {
    let materialized = SvgAnimationSource::parse(SourceSnapshot::new(
        "svg-animation-profile3-motion-mixer.svg",
        ADDITIVE_DEMO,
    ))
    .unwrap();
    let program = materialized.compile_profile3().unwrap();
    assert_eq!(materialized.viewport(), (960.0, 540.0));
    assert_eq!(program.compiler_id(), PROFILE3_COMPILER_ID);
    assert_eq!(program.tracks().len(), 9);

    let result = program
        .tracks()
        .iter()
        .find_map(|track| {
            let node = materialized.document().node_for_key(track.target().node)?;
            (node.header.name.as_deref() == Some("result")).then_some(track.target())
        })
        .expect("composed result lane exists");
    let result_stack = program
        .effect_stacks()
        .find(|stack| stack[0].target() == result)
        .expect("result lane has one effect stack");
    assert_eq!(result_stack.len(), 4);
    assert_eq!(
        result_stack
            .iter()
            .map(|track| track.composite())
            .collect::<Vec<_>>(),
        vec![
            CompositeOperation::Add,
            CompositeOperation::Replace,
            CompositeOperation::Add,
            CompositeOperation::Add,
        ]
    );

    for (time, expected) in [
        (0, 160.0),
        (500_000_000, 200.0),
        (1_000_000_000, 240.0),
        (1_500_000_000, 280.0),
        (2_000_000_000, 320.0),
        (2_500_000_000, 280.0),
        (3_000_000_000, 320.0),
        (3_500_000_000, 416.0),
        (4_000_000_000, 524.0),
        (4_500_000_000, 536.0),
        (5_000_000_000, 608.0),
        (5_500_000_000, 648.0),
        (6_000_000_000, 688.0),
        (6_500_000_000, 728.0),
        (7_000_000_000, 728.0),
    ] {
        let values = program
            .sample(materialized.document(), SampleTime::from_nanoseconds(time))
            .unwrap();
        match values.get(result) {
            Some(PropertyValue::AxisBinding(AxisBinding::Pin { offset, .. })) => {
                assert_eq!(*offset, expected, "at {time}ns")
            }
            value => panic!("unexpected result lane value {value:?}"),
        }
    }
}
