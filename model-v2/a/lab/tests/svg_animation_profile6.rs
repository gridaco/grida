//! SVG Animation Profile 6 path-geometry grammar and lowering corpus.

use std::sync::Arc;

use anchor_lab::animation::{AnimationProgram, SampleTime, Track, TrackEffectKind, TrackKind};
use anchor_lab::path::{self, FillRule, PathCommand, PathGeometry};
use anchor_lab::properties::{PropertyKey, PropertyTarget, PropertyValue};
use anchor_lab::svg_animation::{SourceSnapshot, SvgAnimationSource, PROFILE6_COMPILER_ID};

const PROFILE5_BOUNDARIES: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile5-solid-fill-boundaries.svg");
const PATH_BOUNDARIES: &str =
    include_str!("../../../engine/rig/fixtures/svg-animation-profile6-path-boundaries.svg");
const PROFILE6_SHOWCASE: &str =
    include_str!("../../../engine/rig/examples/svg-animation-profile6-path-morph-showcase.svg");

fn materialize(source: &str) -> SvgAnimationSource {
    SvgAnimationSource::parse(SourceSnapshot::new("profile6-test.svg", source)).unwrap()
}

fn profile6_error(source: &str) -> String {
    match SvgAnimationSource::parse(SourceSnapshot::new("invalid-profile6.svg", source)) {
        Ok(source) => source.compile_profile6().unwrap_err().to_string(),
        Err(error) => error.to_string(),
    }
}

fn track_by_id<'a>(program: &'a AnimationProgram, id: &str) -> &'a Track {
    let marker = format!("id=\"{id}\"");
    program
        .tracks()
        .iter()
        .find(|track| track.source().contains(&marker))
        .unwrap_or_else(|| panic!("animation track `{id}` exists"))
}

fn sampled_path(
    source: &SvgAnimationSource,
    program: &AnimationProgram,
    target: PropertyTarget,
    time_ns: i64,
) -> Arc<PathGeometry> {
    let values = program
        .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
        .unwrap();
    match values.get(target) {
        Some(PropertyValue::PathGeometry(path)) => Arc::clone(path),
        value => panic!("expected sampled path geometry, found {value:?}"),
    }
}

#[test]
fn checked_in_profile6_showcase_compiles() {
    let program = materialize(PROFILE6_SHOWCASE).compile_profile6().unwrap();
    assert_eq!(program.compiler_id(), PROFILE6_COMPILER_ID);
    assert!(!program.tracks().is_empty());
}

#[test]
fn path_source_numbers_pin_binary64_then_binary32_conversion() {
    let source = "1.0000000596046448";
    assert_eq!(source.parse::<f32>().unwrap().to_bits(), 0x3f80_0001);

    let path = path::analyze_in_reference_box(
        format!("M 0 0 L {source} 0 L 0 1 Z"),
        FillRule::NonZero,
        2.0,
        2.0,
    )
    .unwrap();
    let PathCommand::LineTo { x, .. } = path.geometry().commands[1] else {
        panic!("expected the first drawing command to be a line")
    };
    assert_eq!(x.to_bits(), 0.5_f32.to_bits());
}

#[test]
fn profile6_is_cumulative_and_bit_compatible_with_profile5() {
    let source = materialize(PROFILE5_BOUNDARIES);
    let profile5 = source.compile_profile5().unwrap();
    let profile6 = source.compile_profile6().unwrap();
    assert_eq!(profile6.compiler_id(), PROFILE6_COMPILER_ID);

    for time_ns in [
        -1,
        0,
        1_000_000_000,
        2_500_000_000,
        4_000_000_000,
        8_000_000_000,
    ] {
        assert_eq!(
            profile6
                .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
                .unwrap(),
            profile5
                .sample(source.document(), SampleTime::from_nanoseconds(time_ns))
                .unwrap(),
            "Profile 6 changed Profile 5 output at {time_ns}ns"
        );
    }
}

#[test]
fn boundary_fixture_lowers_to_smooth_discrete_and_fallback_effects() {
    let source = materialize(PATH_BOUNDARIES);
    let program = source.compile_profile6().unwrap();
    assert_eq!(program.compiler_id(), PROFILE6_COMPILER_ID);
    assert_eq!(program.tracks().len(), 3);

    let smooth = track_by_id(&program, "smooth-curve");
    assert_eq!(smooth.kind(), TrackKind::PathGeometry);
    assert_eq!(smooth.target().property, PropertyKey::PathGeometry);
    assert_eq!(smooth.effect_kind(), TrackEffectKind::PathCurve);

    let discrete = track_by_id(&program, "discrete-values");
    assert_eq!(discrete.effect_kind(), TrackEffectKind::DiscreteCurve);

    let fallback = track_by_id(&program, "family-fallback");
    assert_eq!(fallback.effect_kind(), TrackEffectKind::EasedDiscretePair);
}

#[test]
fn source_family_topology_survives_render_geometry_expansion() {
    let source = materialize(PATH_BOUNDARIES);
    let program = source.compile_profile6().unwrap();

    let smooth = track_by_id(&program, "smooth-curve");
    let midpoint = sampled_path(&source, &program, smooth.target(), 1_000_000_000);
    assert!(matches!(midpoint.commands[0], PathCommand::MoveTo { .. }));
    assert!(midpoint
        .commands
        .iter()
        .any(|command| matches!(command, PathCommand::CubicTo { .. })));

    let fallback = track_by_id(&program, "family-fallback");
    let from =
        path::analyze_geometry_in_reference_box("M 376 20 H 472 V 108 H 376 Z", 512.0, 128.0)
            .unwrap();
    let to = path::analyze_geometry_in_reference_box(
        "M 424 16 L 488 64 L 424 112 L 360 64 Z",
        512.0,
        128.0,
    )
    .unwrap();
    assert_eq!(
        sampled_path(&source, &program, fallback.target(), 999_999_999),
        from
    );
    assert_eq!(
        sampled_path(&source, &program, fallback.target(), 1_000_000_000),
        to
    );
}

#[test]
fn parent_and_href_targeting_produce_the_same_sampled_path() {
    let parent = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <path id="mark" d="M 8 32 C 16 8 48 8 56 32 Z">
    <animate id="morph" attributeName="d" from="M 8 32 C 16 8 48 8 56 32 Z" to="M 8 32 C 16 56 48 56 56 32 Z" dur="2s"/>
  </path>
</svg>"##,
    );
    let referenced = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <path id="mark" d="M 8 32 C 16 8 48 8 56 32 Z"/>
  <animate id="morph" href="#mark" attributeName="d" from="M 8 32 C 16 8 48 8 56 32 Z" to="M 8 32 C 16 56 48 56 56 32 Z" dur="2s"/>
</svg>"##,
    );
    let parent_program = parent.compile_profile6().unwrap();
    let referenced_program = referenced.compile_profile6().unwrap();
    let parent_track = track_by_id(&parent_program, "morph");
    let referenced_track = track_by_id(&referenced_program, "morph");

    assert_eq!(
        sampled_path(
            &parent,
            &parent_program,
            parent_track.target(),
            1_000_000_000,
        )
        .commands,
        sampled_path(
            &referenced,
            &referenced_program,
            referenced_track.target(),
            1_000_000_000,
        )
        .commands,
    );
}

#[test]
fn smooth_shorthand_families_do_not_collapse_into_expanded_curve_families() {
    let source = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <path d="M 8 32 C 16 8 24 8 32 32 S 48 56 56 32">
    <animate id="cubic-family" attributeName="d" from="M 8 32 C 16 8 24 8 32 32 S 48 56 56 32" to="M 8 32 C 16 8 24 8 32 32 C 40 56 48 56 56 32" dur="2s"/>
  </path>
  <path d="M 8 32 Q 16 8 24 32 T 40 32">
    <animate id="quadratic-family" attributeName="d" from="M 8 32 Q 16 8 24 32 T 40 32" to="M 8 32 Q 16 8 24 32 Q 32 56 40 32" dur="2s"/>
  </path>
</svg>"##,
    );
    let program = source.compile_profile6().unwrap();

    for id in ["cubic-family", "quadratic-family"] {
        assert_eq!(
            track_by_id(&program, id).effect_kind(),
            TrackEffectKind::EasedDiscretePair,
            "{id} must retain its source command family before expansion"
        );
    }
}

#[test]
fn explicit_discrete_selects_arbitrary_arc_geometry_at_exact_key_times() {
    let source = materialize(PATH_BOUNDARIES);
    let program = source.compile_profile6().unwrap();
    let track = track_by_id(&program, "discrete-values");

    let arc = path::analyze_geometry_in_reference_box(
        "M 256 24 A 40 40 0 1 1 256 104 A 40 40 0 1 1 256 24 Z",
        512.0,
        128.0,
    )
    .unwrap();
    let triangle =
        path::analyze_geometry_in_reference_box("M 256 20 L 304 104 L 208 104 Z", 512.0, 128.0)
            .unwrap();
    let rounded_rect = path::analyze_geometry_in_reference_box(
        "M 224 24 H 288 A 8 8 0 0 1 296 32 V 96 A 8 8 0 0 1 288 104 H 224 A 8 8 0 0 1 216 96 V 32 A 8 8 0 0 1 224 24 Z",
        512.0,
        128.0,
    )
    .unwrap();
    assert_eq!(
        sampled_path(&source, &program, track.target(), 499_999_999),
        arc
    );
    assert_eq!(
        sampled_path(&source, &program, track.target(), 500_000_000),
        triangle
    );
    assert_eq!(
        sampled_path(&source, &program, track.target(), 1_499_999_999),
        triangle
    );
    assert_eq!(
        sampled_path(&source, &program, track.target(), 1_500_000_000),
        rounded_rect
    );
}

#[test]
fn static_path_uses_the_existing_unit_reference_artifact_and_older_profiles_gate_it() {
    let source_text = r##"<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128"><path id="mark" d="M 64 32 L 192 96 Z" fill="#123456"/></svg>"##;
    let source = materialize(source_text);
    let path = source
        .document()
        .get(source.document().get(source.document().root).children[0]);
    let anchor_lab::model::Payload::Shape {
        desc: anchor_lab::model::ShapeDesc::Path(path),
    } = &path.payload
    else {
        panic!("static SVG path materializes as the existing path payload")
    };
    assert_eq!(
        path.geometry().commands.as_ref(),
        [
            PathCommand::MoveTo { x: 0.25, y: 0.25 },
            PathCommand::LineTo { x: 0.75, y: 0.75 },
            PathCommand::Close,
        ]
    );
    source.compile_profile6().unwrap();
    let older = source.compile_profile5().unwrap_err().to_string();
    assert!(older.contains("unsupported static <path>"), "{older}");
}

#[test]
fn inherited_visual_effects_target_the_new_path_node_without_new_value_families() {
    let source = materialize(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <path id="mark" d="M 8 8 L 56 8 L 32 56 Z" fill="#102030" opacity="0.5">
    <animate id="fade" attributeName="opacity" from="0.5" to="1" dur="1s"/>
    <animate id="recolor" attributeName="fill" from="#102030" to="#abcdef" dur="1s"/>
    <animateTransform id="move" attributeName="transform" type="translate" from="0 0" to="4 0" dur="1s"/>
  </path>
</svg>"##,
    );
    let program = source.compile_profile6().unwrap();

    assert_eq!(track_by_id(&program, "fade").kind(), TrackKind::Opacity);
    assert_eq!(
        track_by_id(&program, "recolor").kind(),
        TrackKind::SolidFill
    );
    assert_eq!(
        track_by_id(&program, "move").kind(),
        TrackKind::LensTransform
    );
}

#[test]
fn smooth_arcs_and_mismatched_values_fail_with_actionable_discrete_guidance() {
    let smooth_arc = r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M 8 32 A 24 24 0 1 1 56 32 Z"><animate attributeName="d" from="M 8 32 A 24 24 0 1 1 56 32 Z" to="M 16 32 A 16 16 0 1 1 48 32 Z" dur="1s"/></path></svg>"##;
    let error = profile6_error(smooth_arc);
    assert!(error.contains("A/a"), "{error}");
    assert!(error.contains("calcMode=`discrete`"), "{error}");

    let mismatched_values = r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M 8 8 H 56 V 56 H 8 Z"><animate attributeName="d" values="M 8 8 H 56 V 56 H 8 Z;M 8 8 L 56 8 L 56 56 L 8 56 Z" dur="1s"/></path></svg>"##;
    let error = profile6_error(mismatched_values);
    assert!(error.contains("command-family topology"), "{error}");
    assert!(error.contains("calcMode=`discrete`"), "{error}");
}

#[test]
fn path_geometry_is_replacement_only_and_rejects_malformed_discrete_schedules() {
    let additive = r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M 8 8 L 56 8 L 32 56 Z"><animate attributeName="d" from="M 8 8 L 56 8 L 32 56 Z" to="M 16 8 L 48 8 L 32 56 Z" dur="1s" additive="sum"/></path></svg>"##;
    let error = profile6_error(additive);
    assert!(error.contains("does not admit Add"), "{error}");

    let bad_key_times = r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M 8 8 L 56 8 L 32 56 Z"><animate attributeName="d" values="M 8 8 L 56 8 L 32 56 Z;M 8 8 H 56 V 56 Z;M 8 56 L 56 56 L 32 8 Z" keyTimes="0;0.75;0.5" calcMode="discrete" dur="1s"/></path></svg>"##;
    let error = profile6_error(bad_key_times);
    assert!(error.contains("increase strictly"), "{error}");
}

#[test]
fn discrete_effect_stays_a_complete_typed_path_value() {
    let source = materialize(PATH_BOUNDARIES);
    let program = source.compile_profile6().unwrap();
    let track = track_by_id(&program, "discrete-values");
    let curve = track.discrete_curve().expect("expected a discrete curve");
    assert_eq!(curve.keyframes().len(), 3);
    assert!(curve
        .keyframes()
        .iter()
        .all(|keyframe| matches!(keyframe.value(), PropertyValue::PathGeometry(_))));
}
