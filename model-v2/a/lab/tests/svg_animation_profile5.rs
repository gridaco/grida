//! SVG Animation Profile 5 solid-fill grammar and lowering corpus.

use anchor_lab::animation::{
    AnimationProgram, CompositeOperation, IterationCompositeOperation, SampleTime, Track,
    TrackEffectKind, TrackKind,
};
use anchor_lab::model::{BlendMode, Color, Paint};
use anchor_lab::properties::{PropertyKey, PropertyTarget, PropertyValue};
use anchor_lab::svg_animation::{SourceSnapshot, SvgAnimationSource, PROFILE5_COMPILER_ID};

const PROFILE4_EFFECTS: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile4-effects-and-transforms.svg");
const PROFILE5_BOUNDARIES: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile5-solid-fill-boundaries.svg");
const PROFILE5_SHOWCASE: &str =
    include_str!("../../../engine/rig/examples/svg-animation-profile5-solid-fill-showcase.svg");

fn materialize(source: &str) -> SvgAnimationSource {
    SvgAnimationSource::parse(SourceSnapshot::new("profile5-test.svg", source)).unwrap()
}

fn track_by_id<'a>(program: &'a AnimationProgram, id: &str) -> &'a Track {
    let marker = format!("id=\"{id}\"");
    program
        .tracks()
        .iter()
        .find(|track| track.source().contains(&marker))
        .unwrap_or_else(|| panic!("animation track `{id}` exists"))
}

fn sampled_color(
    source: &SvgAnimationSource,
    program: &AnimationProgram,
    target: PropertyTarget,
    time_ns: i64,
) -> Option<Color> {
    let values = program
        .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
        .unwrap();
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

fn profile5_error(source: &str) -> String {
    match SvgAnimationSource::parse(SourceSnapshot::new("invalid-profile5.svg", source)) {
        Ok(source) => source.compile_profile5().unwrap_err().to_string(),
        Err(error) => error.to_string(),
    }
}

#[test]
fn checked_in_profile5_showcase_compiles() {
    let program = materialize(PROFILE5_SHOWCASE).compile_profile5().unwrap();
    assert_eq!(program.compiler_id(), PROFILE5_COMPILER_ID);
    assert!(!program.tracks().is_empty());
}

#[test]
fn profile5_is_cumulative_and_bit_compatible_with_profile4() {
    let source = materialize(PROFILE4_EFFECTS);
    let profile4 = source.compile_profile4().unwrap();
    let profile5 = source.compile_profile5().unwrap();
    assert_eq!(profile5.compiler_id(), PROFILE5_COMPILER_ID);

    for time_ns in [
        -1,
        0,
        500_000_000,
        1_000_000_000,
        2_000_000_000,
        3_999_999_999,
        4_000_000_000,
        8_000_000_000,
    ] {
        assert_eq!(
            profile5
                .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
                .unwrap(),
            profile4
                .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
                .unwrap(),
            "Profile 5 changed Profile 4 output at {time_ns}ns"
        );
    }
}

#[test]
fn fill_keyframes_accept_all_css_hex_widths_and_lower_to_one_typed_curve() {
    let source = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="target" width="16" height="16" fill="#0f172a"><animate id="hex-widths" attributeName="fill" values="#123;#1234;#112233;#11223344" keyTimes="0;0.25;0.75;1" calcMode="spline" keySplines="0 0 1 1;0.25 0.1 0.25 1;0 0 1 1" dur="4s" fill="freeze"/></rect></svg>"##,
    );
    let program = source.compile_profile5().unwrap();
    let track = track_by_id(&program, "hex-widths");
    assert_eq!(track.kind(), TrackKind::SolidFill);
    assert_eq!(track.target().property, PropertyKey::Fills);
    assert_eq!(track.effect_kind(), TrackEffectKind::SolidFillCurve);
    let colors = track
        .color_curve()
        .unwrap()
        .keyframes()
        .map(|keyframe| keyframe.color())
        .collect::<Vec<_>>();
    assert_eq!(
        colors,
        [
            Color(0xFF11_2233),
            Color(0x4411_2233),
            Color(0xFF11_2233),
            Color(0x4411_2233),
        ]
    );
}

#[test]
fn svg_color_sandwich_matches_characterized_addition_accumulation_and_rounding() {
    let source = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="target" width="16" height="16" fill="#100000"><animate id="foundation" attributeName="fill" from="#100000" to="#120000" dur="2s" repeatCount="2" fill="freeze" additive="sum" accumulate="sum"/><animate id="half-step" attributeName="fill" from="#00000000" to="#01000000" dur="2s" fill="freeze" additive="sum"/></rect></svg>"##,
    );
    let program = source.compile_profile5().unwrap();
    let foundation = track_by_id(&program, "foundation");
    assert_eq!(foundation.composite(), CompositeOperation::Add);
    assert_eq!(
        foundation.iteration_composite(),
        IterationCompositeOperation::Accumulate
    );

    for (seconds, red) in [(0, 32), (1, 34), (2, 51), (3, 52), (4, 53)] {
        assert_eq!(
            sampled_color(
                &source,
                &program,
                foundation.target(),
                seconds * 1_000_000_000,
            ),
            Some(Color(0xFF00_0000 | (red << 16))),
            "unexpected SVG color sandwich at {seconds}s"
        );
    }
}

#[test]
fn boundary_fixture_preserves_fractional_channels_and_defers_clamp() {
    let source = materialize(PROFILE5_BOUNDARIES);
    let program = source.compile_profile5().unwrap();

    let alpha = track_by_id(&program, "alpha-color");
    assert_eq!(
        sampled_color(&source, &program, alpha.target(), 0),
        Some(Color(0x00FF_0000)),
        "zero alpha must not erase the authored red channel"
    );
    assert_eq!(
        sampled_color(&source, &program, alpha.target(), 2_000_000_000),
        Some(Color(0x8080_0080)),
        "straight RGBA interpolation keeps hidden RGB independent from alpha"
    );

    let sandwich = track_by_id(&program, "sandwich-foundation");
    for (seconds, red) in [(0, 32), (1, 34), (2, 51), (3, 52), (4, 53)] {
        assert_eq!(
            sampled_color(
                &source,
                &program,
                sandwich.target(),
                seconds * 1_000_000_000,
            ),
            Some(Color(0xFF00_0000 | (red << 16)))
        );
    }

    let late_clamp = track_by_id(&program, "late-clamp-live");
    assert_eq!(
        sampled_color(&source, &program, late_clamp.target(), 2_000_000_000,),
        Some(Color(0xFF88_0000)),
        "red 272 from the lower sandwich must reach the higher midpoint before final clamp"
    );
}

#[test]
fn fill_lone_to_reads_the_live_lower_sandwich_and_normalizes_composition() {
    let source = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="target" width="16" height="16" fill="#102030"><animate id="lower" attributeName="fill" from="#203040" to="#405060" dur="2s" fill="freeze"/><animate id="live" attributeName="fill" to="#8090a0" dur="2s" fill="freeze" additive="sum" accumulate="sum"/></rect></svg>"##,
    );
    let program = source.compile_profile5().unwrap();
    let live = track_by_id(&program, "live");
    assert_eq!(
        live.effect_kind(),
        TrackEffectKind::SolidFillFromLiveUnderlying
    );
    assert_eq!(
        live.composite(),
        CompositeOperation::InterpolateLiveUnderlying
    );
    assert_eq!(
        live.iteration_composite(),
        IterationCompositeOperation::Replace
    );
    assert_eq!(
        sampled_color(&source, &program, live.target(), 1_000_000_000),
        Some(Color(0xFF58_6878))
    );
    assert_eq!(
        sampled_color(&source, &program, live.target(), 2_000_000_000),
        Some(Color(0xFF80_90A0))
    );
}

#[test]
fn parent_and_href_fill_targets_share_the_existing_fills_property() {
    let source = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect id="parent" width="16" height="16"><animate id="remote" href="#target" attributeName="fill" from="#000" to="#fff" dur="1s" fill="freeze"/></rect><rect id="target" x="32" width="16" height="16" fill="#123456"><animate id="nested" attributeName="fill" from="#123456" to="#654321" dur="1s" fill="freeze"/></rect></svg>"##,
    );
    let program = source.compile_profile5().unwrap();
    let remote = track_by_id(&program, "remote");
    let nested = track_by_id(&program, "nested");
    assert_eq!(remote.target(), nested.target());
    assert_eq!(remote.target().property, PropertyKey::Fills);
}

#[test]
fn replacement_fill_animates_over_authored_none_without_inventing_an_underlying_color() {
    let source = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect id="target" width="16" height="16" fill="none"><animate id="replacement" attributeName="fill" from="#123456" to="#abcdef" dur="1s" fill="remove"/></rect></svg>"##,
    );
    let program = source.compile_profile5().unwrap();
    let replacement = track_by_id(&program, "replacement");
    assert_eq!(
        sampled_color(&source, &program, replacement.target(), 0),
        Some(Color(0xFF12_3456))
    );
    assert_eq!(
        sampled_color(&source, &program, replacement.target(), 1_000_000_000,),
        None,
        "remove falls through to the authored empty Paints aggregate"
    );
}

#[test]
fn older_profiles_gate_fill_and_profile5_rejects_non_color_or_deferred_paints() {
    let fill_animation = r##"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8"><animate attributeName="fill" from="#000" to="#fff" dur="1s"/></rect></svg>"##;
    let source = materialize(fill_animation);
    let profile4 = source.compile_profile4().unwrap_err().to_string();
    assert!(profile4.contains("Profile 4"), "{profile4}");
    assert!(profile4.contains("fill"), "{profile4}");
    source.compile_profile5().unwrap();

    for value in ["none", "currentColor", "red", "rgb(0 0 0)", "url(#paint)"] {
        let error = profile5_error(&format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8"><animate attributeName="fill" from="#000" to="{value}" dur="1s"/></rect></svg>"##
        ));
        assert!(error.contains(value), "{error}");
        assert!(error.contains("resolved to target"), "{error}");
        assert!(error.contains("property `fill`"), "{error}");
        assert!(
            error.contains("solid legacy-sRGB color")
                || error.contains("solid color")
                || error.contains("hexadecimal"),
            "{error}"
        );
    }

    for (property, deferred_identity) in [
        ("stroke", "stroke-geometry"),
        ("stop-color", "stop target identity"),
    ] {
        let error = profile5_error(&format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="8" height="8"><animate attributeName="{property}" from="#000" to="#fff" dur="1s"/></rect></svg>"##
        ));
        assert!(error.contains(property), "{error}");
        assert!(error.contains("deferred by Profile 5"), "{error}");
        assert!(error.contains(deferred_identity), "{error}");
    }
}
