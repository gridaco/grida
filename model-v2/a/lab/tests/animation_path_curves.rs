//! Format-neutral smooth and discrete path-geometry animation conformance.

use std::sync::Arc;

use anchor_lab::animation::{
    AnimationProgram, CubicBezier, CubicControl, DiscreteCurve, DiscreteCurveError,
    DiscreteKeyframe, Easing, FillMode, KeyframeOffset, PathCurve, PathCurveError, PathKeyframe,
    PathSegment, SampleTime, Timing, Track, TrackError,
};
use anchor_lab::model::{DocBuilder, Document, FillRule, Header, Payload, ShapeDesc, SizeIntent};
use anchor_lab::path::{self, PathCommand, PathGeometry};
use anchor_lab::properties::{PropertyKey, PropertyTarget, PropertyValue, PropertyValues};
use anchor_lab::resolve::{resolve_view, ResolveOptions};

fn geometry(commands: Vec<PathCommand>) -> Arc<PathGeometry> {
    PathGeometry::from_commands(commands).unwrap()
}

fn triangle(tip_x: f32) -> Arc<PathGeometry> {
    geometry(vec![
        PathCommand::MoveTo { x: 0.0, y: 0.0 },
        PathCommand::LineTo { x: 1.0, y: 0.0 },
        PathCommand::LineTo { x: tip_x, y: 1.0 },
        PathCommand::Close,
    ])
}

fn scene() -> (Document, PropertyTarget) {
    let mut builder = DocBuilder::new();
    let authored = path::analyze("M0 0 L1 0 L0 1 Z", FillRule::NonZero).unwrap();
    let node = builder.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(100.0)),
        Payload::Shape {
            desc: ShapeDesc::Path(authored),
        },
    );
    let document = builder.build();
    let target = PropertyTarget::new(
        document.key_of(node).expect("live path"),
        PropertyKey::PathGeometry,
    );
    (document, target)
}

fn sampled_path(values: &PropertyValues, target: PropertyTarget) -> Option<&Arc<PathGeometry>> {
    match values.get(target) {
        Some(PropertyValue::PathGeometry(path)) => Some(path),
        None => None,
        value => panic!("expected sampled path geometry, found {value:?}"),
    }
}

#[test]
fn smooth_path_curve_preserves_exact_endpoints_and_interpolates_every_command_component() {
    let from = geometry(vec![
        PathCommand::MoveTo { x: 0.0, y: 0.0 },
        PathCommand::LineTo { x: 0.25, y: 0.0 },
        PathCommand::QuadTo {
            x1: 0.25,
            y1: 0.25,
            x: 0.5,
            y: 0.0,
        },
        PathCommand::CubicTo {
            x1: 0.25,
            y1: 0.25,
            x2: 0.5,
            y2: 0.5,
            x: 0.75,
            y: 0.0,
        },
        PathCommand::Close,
    ]);
    let to = geometry(vec![
        PathCommand::MoveTo { x: 0.5, y: 0.5 },
        PathCommand::LineTo { x: 0.75, y: 1.0 },
        PathCommand::QuadTo {
            x1: 0.75,
            y1: 0.75,
            x: 1.0,
            y: 1.0,
        },
        PathCommand::CubicTo {
            x1: 0.75,
            y1: 0.75,
            x2: 1.0,
            y2: 1.0,
            x: 0.25,
            y: 1.0,
        },
        PathCommand::Close,
    ]);
    let (document, target) = scene();
    let track = Track::path_curve(
        "smooth",
        target,
        PathCurve::linear(Arc::clone(&from), Arc::clone(&to)).unwrap(),
        Timing::new(0, 2, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let program = AnimationProgram::new(&document, "smooth-path@0", vec![track]).unwrap();

    let at = |time| {
        program
            .sample(&document, SampleTime::from_nanoseconds(time))
            .unwrap()
    };
    let start = at(0);
    assert!(Arc::ptr_eq(sampled_path(&start, target).unwrap(), &from));

    let midpoint = at(1);
    assert_eq!(
        sampled_path(&midpoint, target).unwrap().commands.as_ref(),
        &[
            PathCommand::MoveTo { x: 0.25, y: 0.25 },
            PathCommand::LineTo { x: 0.5, y: 0.5 },
            PathCommand::QuadTo {
                x1: 0.5,
                y1: 0.5,
                x: 0.75,
                y: 0.5,
            },
            PathCommand::CubicTo {
                x1: 0.5,
                y1: 0.5,
                x2: 0.75,
                y2: 0.75,
                x: 0.5,
                y: 0.5,
            },
            PathCommand::Close,
        ]
    );

    let frozen = at(2);
    assert!(Arc::ptr_eq(sampled_path(&frozen, target).unwrap(), &to));
}

#[test]
fn smooth_path_curve_rejects_topology_conics_and_nonconvex_property_easing() {
    let line = geometry(vec![
        PathCommand::MoveTo { x: 0.0, y: 0.0 },
        PathCommand::LineTo { x: 1.0, y: 1.0 },
    ]);
    let quad = geometry(vec![
        PathCommand::MoveTo { x: 0.0, y: 0.0 },
        PathCommand::QuadTo {
            x1: 0.5,
            y1: 0.0,
            x: 1.0,
            y: 1.0,
        },
    ]);
    assert!(matches!(
        PathCurve::linear(Arc::clone(&line), quad),
        Err(PathCurveError::DifferentTopology { keyframe_index: 1 })
    ));

    let arc = path::analyze_geometry_in_reference_box("M0 0 A1 1 0 0 1 1 1", 1.0, 1.0).unwrap();
    assert!(matches!(
        PathCurve::linear(Arc::clone(&arc), arc),
        Err(PathCurveError::ConicNotInterpolable {
            keyframe_index: 0,
            ..
        })
    ));

    let arc = path::analyze_geometry_in_reference_box("M0 0 A1 1 0 0 1 1 1", 1.0, 1.0).unwrap();
    assert!(matches!(
        PathCurve::constant(arc),
        Err(PathCurveError::ConicNotInterpolable {
            keyframe_index: 0,
            ..
        })
    ));

    let nonconvex = Easing::CubicBezier(CubicBezier::new(0.25, -0.1, 0.75, 1.1).unwrap());
    assert!(matches!(
        PathCurve::new(
            PathKeyframe::new(KeyframeOffset::ZERO, Arc::clone(&line)),
            vec![PathSegment::new(
                nonconvex,
                PathKeyframe::new(KeyframeOffset::ONE, line),
            )],
        ),
        Err(PathCurveError::UnsafeCubicControl {
            segment_index: 0,
            control: CubicControl::Y1,
        })
    ));
}

#[test]
fn explicit_discrete_curve_switches_on_equal_offsets_and_holds_a_terminal_below_one() {
    let first = triangle(0.0);
    let second = triangle(0.5);
    let third = triangle(1.0);
    let curve = DiscreteCurve::new(vec![
        DiscreteKeyframe::new(
            KeyframeOffset::ZERO,
            PropertyValue::PathGeometry(Arc::clone(&first)),
        ),
        DiscreteKeyframe::new(
            KeyframeOffset::new(1, 4).unwrap(),
            PropertyValue::PathGeometry(Arc::clone(&second)),
        ),
        DiscreteKeyframe::new(
            KeyframeOffset::new(3, 4).unwrap(),
            PropertyValue::PathGeometry(Arc::clone(&third)),
        ),
    ])
    .unwrap();
    let (document, target) = scene();
    let track = Track::path_discrete_curve(
        "discrete",
        target,
        curve,
        Timing::new(0, 8, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let program = AnimationProgram::new(&document, "discrete-path@0", vec![track]).unwrap();

    for (time, expected) in [
        (0, &first),
        (1, &first),
        (2, &second),
        (5, &second),
        (6, &third),
        (7, &third),
        (8, &third),
    ] {
        let values = program
            .sample(&document, SampleTime::from_nanoseconds(time))
            .unwrap();
        assert!(
            Arc::ptr_eq(sampled_path(&values, target).unwrap(), expected),
            "unexpected held value at {time}ns"
        );
    }
}

#[test]
fn incompatible_pair_switches_after_easing_not_at_raw_half_progress() {
    let from = triangle(0.0);
    let to = geometry(vec![
        PathCommand::MoveTo { x: 0.0, y: 0.0 },
        PathCommand::QuadTo {
            x1: 0.5,
            y1: 0.0,
            x: 1.0,
            y: 1.0,
        },
    ]);
    let (document, target) = scene();
    let track = Track::path_discrete_fallback(
        "eased-fallback",
        target,
        Arc::clone(&from),
        Arc::clone(&to),
        Easing::CubicBezier(CubicBezier::new(0.42, 0.0, 1.0, 1.0).unwrap()),
        Timing::new(0, 16, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let program = AnimationProgram::new(&document, "eased-fallback@0", vec![track]).unwrap();

    let at_half = program
        .sample(&document, SampleTime::from_nanoseconds(8))
        .unwrap();
    assert!(
        Arc::ptr_eq(sampled_path(&at_half, target).unwrap(), &from),
        "ease-in remains below the discrete threshold at raw half progress"
    );
    let at_three_quarters = program
        .sample(&document, SampleTime::from_nanoseconds(12))
        .unwrap();
    assert!(Arc::ptr_eq(
        sampled_path(&at_three_quarters, target).unwrap(),
        &to
    ));
}

#[test]
fn sampled_geometry_uses_the_current_authored_fill_rule() {
    let from = triangle(0.0);
    let to = triangle(1.0);
    let (mut document, target) = scene();
    let track = Track::path_curve(
        "fill-rule-independent-geometry",
        target,
        PathCurve::linear(from, to).unwrap(),
        Timing::new(0, 2, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let program = AnimationProgram::new(&document, "fill-rule@0", vec![track]).unwrap();

    let node = document.get(document.root).children[0];
    let Payload::Shape {
        desc: ShapeDesc::Path(path),
    } = &mut document.get_mut(node).payload
    else {
        panic!("scene helper creates a path")
    };
    Arc::make_mut(path).set_fill_rule(FillRule::EvenOdd);

    let values = program
        .sample(&document, SampleTime::from_nanoseconds(1))
        .unwrap();
    let view = anchor_lab::properties::ValueView::new(&document, &values).unwrap();
    let resolved = resolve_view(&view, &ResolveOptions::default());
    assert_eq!(resolved.resolved_path_of(node).fill_rule, FillRule::EvenOdd);
}

#[test]
fn replacement_sandwich_falls_through_to_lower_freeze_or_keeps_higher_freeze() {
    let base = triangle(0.0);
    let lower_to = triangle(0.25);
    let higher_from = triangle(0.75);
    let higher_to = triangle(1.0);
    let (document, target) = scene();
    let lower = Track::path_curve(
        "lower",
        target,
        PathCurve::linear(Arc::clone(&base), Arc::clone(&lower_to)).unwrap(),
        Timing::new(0, 2, 1).unwrap(),
        FillMode::Freeze,
    )
    .unwrap();
    let higher = |fill| {
        Track::path_curve(
            "higher",
            target,
            PathCurve::linear(Arc::clone(&higher_from), Arc::clone(&higher_to)).unwrap(),
            Timing::new(1, 1, 1).unwrap(),
            fill,
        )
        .unwrap()
    };

    let removing = AnimationProgram::new(
        &document,
        "path-sandwich-remove@0",
        vec![lower.clone(), higher(FillMode::Remove)],
    )
    .unwrap();
    let during_higher = removing
        .sample(&document, SampleTime::from_nanoseconds(1))
        .unwrap();
    assert!(Arc::ptr_eq(
        sampled_path(&during_higher, target).unwrap(),
        &higher_from
    ));
    let after_higher = removing
        .sample(&document, SampleTime::from_nanoseconds(2))
        .unwrap();
    assert!(
        Arc::ptr_eq(sampled_path(&after_higher, target).unwrap(), &lower_to),
        "the removed higher replacement exposes the lower frozen value"
    );

    let freezing = AnimationProgram::new(
        &document,
        "path-sandwich-freeze@0",
        vec![lower, higher(FillMode::Freeze)],
    )
    .unwrap();
    let after_both = freezing
        .sample(&document, SampleTime::from_nanoseconds(2))
        .unwrap();
    assert!(
        Arc::ptr_eq(sampled_path(&after_both, target).unwrap(), &higher_to),
        "the higher frozen replacement continues to cut the lower value"
    );
}

#[test]
fn discrete_curve_rejects_mixed_complete_value_kinds() {
    let path = triangle(0.5);
    assert!(matches!(
        DiscreteCurve::new(vec![
            DiscreteKeyframe::new(KeyframeOffset::ZERO, PropertyValue::PathGeometry(path),),
            DiscreteKeyframe::new(KeyframeOffset::ONE, PropertyValue::Number(1.0)),
        ]),
        Err(DiscreteCurveError::MixedValueKind {
            keyframe_index: 1,
            ..
        })
    ));
}

#[test]
fn path_discrete_track_revalidates_public_geometry_metadata() {
    let valid = triangle(0.5);
    let mut malformed = valid.as_ref().clone();
    malformed.all_contours_closed = !malformed.all_contours_closed;
    let malformed = Arc::new(malformed);
    let curve = DiscreteCurve::new(vec![
        DiscreteKeyframe::new(
            KeyframeOffset::ZERO,
            PropertyValue::PathGeometry(Arc::clone(&valid)),
        ),
        DiscreteKeyframe::new(KeyframeOffset::ONE, PropertyValue::PathGeometry(malformed)),
    ])
    .unwrap();
    let (_document, target) = scene();

    assert!(matches!(
        Track::path_discrete_curve(
            "malformed-geometry",
            target,
            curve,
            Timing::new(0, 1, 1).unwrap(),
            FillMode::Remove,
        ),
        Err(TrackError::InvalidPathGeometry {
            keyframe_index: 1,
            ..
        })
    ));
}
