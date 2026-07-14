//! Format-neutral effective path geometry through the ordinary value view.

use std::sync::Arc;

use anchor_lab::grida_xml;
use anchor_lab::math::RectF;
use anchor_lab::model::{Document, FillRule, NodeId, Payload, ShapeDesc, StrokeAlign};
use anchor_lab::path::{self, PathCommand, PathGeometry};
use anchor_lab::properties::{
    PropertyError, PropertyKey, PropertyTarget, PropertyValue, PropertyValues, ValueView,
};
use anchor_lab::resolve::{resolve, resolve_view, ResolveOptions};

fn only_child(document: &Document) -> NodeId {
    let scene = document.get(document.root).children[0];
    document.get(scene).children[0]
}

fn target(document: &Document, node: NodeId) -> PropertyTarget {
    PropertyTarget::new(
        document.key_of(node).expect("live node"),
        PropertyKey::PathGeometry,
    )
}

#[test]
fn checked_command_factory_derives_bounds_and_contour_closure() {
    let geometry = PathGeometry::from_commands(vec![
        PathCommand::MoveTo { x: 0.25, y: 0.25 },
        PathCommand::LineTo { x: 0.75, y: 0.25 },
        PathCommand::LineTo { x: 0.5, y: 0.75 },
        PathCommand::Close,
    ])
    .unwrap();

    assert_eq!(
        geometry.unit_bounds,
        RectF {
            x: 0.25,
            y: 0.25,
            w: 0.5,
            h: 0.5,
        }
    );
    assert!(geometry.all_contours_closed);
    geometry.validate().unwrap();

    let non_finite = PathGeometry::from_commands(vec![
        PathCommand::MoveTo { x: 0.0, y: 0.0 },
        PathCommand::LineTo {
            x: f32::NAN,
            y: 1.0,
        },
    ])
    .unwrap_err();
    assert!(non_finite.to_string().contains("finite"));

    let malformed =
        PathGeometry::from_commands(vec![PathCommand::LineTo { x: 1.0, y: 1.0 }]).unwrap_err();
    assert!(malformed.to_string().contains("follow a move"));
}

#[test]
fn svg_reference_box_normalizes_after_arc_lowering() {
    let source = "M64 32 A32 16 0 0 1 128 32 Z";
    let artifact = path::analyze_in_reference_box(source, FillRule::NonZero, 256.0, 128.0).unwrap();
    assert_eq!(artifact.d(), source);
    assert_eq!(artifact.source_reference_box(), (256.0, 128.0));
    assert_eq!(
        artifact.geometry().commands[0],
        PathCommand::MoveTo { x: 0.25, y: 0.25 }
    );
    assert!(artifact
        .geometry()
        .commands
        .iter()
        .any(|command| matches!(command, PathCommand::ConicTo { .. })));
    let resolved =
        path::materialize(artifact.geometry(), artifact.fill_rule(), 256.0, 128.0).unwrap();
    assert_eq!(
        resolved.commands[0],
        PathCommand::MoveTo { x: 64.0, y: 32.0 }
    );
    assert!(matches!(resolved.commands.last(), Some(PathCommand::Close)));

    let outside = path::analyze_in_reference_box("M0 0 L257 128", FillRule::NonZero, 256.0, 128.0)
        .unwrap_err();
    assert!(outside.to_string().contains("unit reference box"));
}

#[test]
fn grida_xml_writer_rejects_foreign_reference_box_source() {
    let mut document = grida_xml::parse(
        r#"<grida version="0"><container><path width="10" height="10" d="M0 0 L1 1"/></container></grida>"#,
    )
    .unwrap();
    let node = only_child(&document);
    let imported =
        path::analyze_in_reference_box("M0 0 L10 10", FillRule::NonZero, 10.0, 10.0).unwrap();
    let Payload::Shape {
        desc: ShapeDesc::Path(path),
    } = &mut document.get_mut(node).payload
    else {
        panic!("fixture contains a path")
    };
    *path = imported;

    let error = grida_xml::print(&document).unwrap_err().to_string();
    assert!(error.contains("unit reference box"), "{error}");
}

#[test]
fn effective_path_replaces_only_geometry_and_materializes_once_through_the_final_box() {
    let document = grida_xml::parse(
        r#"<grida version="0"><container><path x="10" y="20" width="200" height="100" d="M0 0 L1 0 L1 1 Z" fill-rule="evenodd"/></container></grida>"#,
    )
    .unwrap();
    let path = only_child(&document);
    let Payload::Shape {
        desc: ShapeDesc::Path(_),
    } = &document.get(path).payload
    else {
        panic!("expected path")
    };
    let sampled = path::analyze("M .25 .25 L .75 .25 L .5 .75 Z", FillRule::NonZero)
        .unwrap()
        .geometry()
        .clone();
    let values = PropertyValues::new(
        &document,
        [(
            target(&document, path),
            PropertyValue::PathGeometry(Arc::clone(&sampled)),
        )],
    )
    .unwrap();
    let view = ValueView::new(&document, &values).unwrap();

    assert!(Arc::ptr_eq(view.path_geometry(path), &sampled));
    let resolved = resolve_view(&view, &ResolveOptions::default());
    assert_eq!(
        resolved.aabb_of(path),
        RectF {
            x: 60.0,
            y: 45.0,
            w: 100.0,
            h: 50.0,
        }
    );
    assert_eq!(
        resolved.resolved_path_of(path).fill_rule,
        FillRule::EvenOdd,
        "effective geometry must not replace the authored fill rule"
    );

    let base = resolve(&document, &ResolveOptions::default());
    let empty = PropertyValues::default();
    let empty_view = ValueView::new(&document, &empty).unwrap();
    let empty_resolved = resolve_view(&empty_view, &ResolveOptions::default());
    assert_eq!(empty_resolved, base);
}

#[test]
fn effective_path_geometry_rejects_wrong_kind_wrong_arena_and_forged_artifacts() {
    let path_document = grida_xml::parse(
        r#"<grida version="0"><container><path width="10" height="10" d="M0 0 L1 0 L1 1 Z"/></container></grida>"#,
    )
    .unwrap();
    let path = only_child(&path_document);
    let valid = path::analyze("M0 0 L1 1", FillRule::NonZero)
        .unwrap()
        .geometry()
        .clone();

    let rect_document = grida_xml::parse(
        r#"<grida version="0"><container><rect width="10" height="10"/></container></grida>"#,
    )
    .unwrap();
    let rect = only_child(&rect_document);
    let inapplicable = PropertyValues::new(
        &rect_document,
        [(
            target(&rect_document, rect),
            PropertyValue::PathGeometry(Arc::clone(&valid)),
        )],
    )
    .unwrap_err();
    assert!(matches!(inapplicable, PropertyError::Inapplicable { .. }));

    let clone = path_document.clone();
    let wrong_arena = PropertyValues::new(
        &clone,
        [(
            target(&path_document, path),
            PropertyValue::PathGeometry(Arc::clone(&valid)),
        )],
    )
    .unwrap_err();
    assert!(matches!(wrong_arena, PropertyError::StaleTarget { .. }));

    let mut forged = (*valid).clone();
    forged.commands = vec![
        PathCommand::MoveTo { x: 0.0, y: 0.0 },
        PathCommand::LineTo {
            x: f32::INFINITY,
            y: 1.0,
        },
    ]
    .into();
    let invalid = PropertyValues::new(
        &path_document,
        [(
            target(&path_document, path),
            PropertyValue::PathGeometry(Arc::new(forged)),
        )],
    )
    .unwrap_err();
    assert!(matches!(invalid, PropertyError::InvalidValue { .. }));
}

#[test]
fn effective_open_path_cannot_invalidate_an_authored_outside_stroke() {
    let document = grida_xml::parse(
        r##"<grida version="0"><container><path width="10" height="10" d="M0 0 L1 0 L1 1 Z"><stroke width="1" align="outside"><solid color="#000"/></stroke></path></container></grida>"##,
    )
    .unwrap();
    let node = only_child(&document);
    let open = path::analyze("M0 0 L1 1", FillRule::NonZero)
        .unwrap()
        .geometry()
        .clone();
    let error = PropertyValues::new(
        &document,
        [(target(&document, node), PropertyValue::PathGeometry(open))],
    )
    .unwrap_err();

    assert!(
        matches!(&error, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("every drawable contour")),
        "{error}"
    );
}

#[test]
fn atomic_path_and_stroke_updates_validate_the_complete_effective_state() {
    let document = grida_xml::parse(
        r##"<grida version="0"><container><path width="10" height="10" d="M0 0 L1 1"><stroke width="1" align="center"><solid color="#000"/></stroke></path></container></grida>"##,
    )
    .unwrap();
    let node = only_child(&document);
    let node_key = document.key_of(node).unwrap();
    let closed = path::analyze("M0 0 L1 0 L1 1 Z", FillRule::NonZero)
        .unwrap()
        .geometry()
        .clone();
    let mut outside_strokes = document.get(node).strokes.clone();
    outside_strokes[0].align = StrokeAlign::Outside;

    for reverse in [false, true] {
        let mut entries = vec![
            (
                PropertyTarget::new(node_key, PropertyKey::PathGeometry),
                PropertyValue::PathGeometry(Arc::clone(&closed)),
            ),
            (
                PropertyTarget::new(node_key, PropertyKey::Strokes),
                PropertyValue::Strokes(outside_strokes.clone()),
            ),
        ];
        if reverse {
            entries.reverse();
        }
        PropertyValues::new(&document, entries).unwrap_or_else(|error| {
            panic!("combined state must be valid in either order: {error}")
        });
    }
}

#[test]
fn retained_path_spelling_stays_outside_effective_geometry() {
    let document = grida_xml::parse(
        r#"<grida version="0"><container><path width="10" height="10" d="M0 0 L1 0 L1 1 Z"/></container></grida>"#,
    )
    .unwrap();
    let node = only_child(&document);
    let absolute = path::analyze("M .25 .25 L .75 .25 L .5 .75 Z", FillRule::NonZero).unwrap();
    let relative = path::analyze("m .25 .25 l .5 0 l -.25 .5 z", FillRule::NonZero).unwrap();
    assert_ne!(absolute.d(), relative.d());
    assert!(absolute.same_visual_geometry(&relative));

    let absolute_values = PropertyValues::new(
        &document,
        [(
            target(&document, node),
            PropertyValue::PathGeometry(absolute.geometry().clone()),
        )],
    )
    .unwrap();
    let relative_values = PropertyValues::new(
        &document,
        [(
            target(&document, node),
            PropertyValue::PathGeometry(relative.geometry().clone()),
        )],
    )
    .unwrap();
    assert_eq!(absolute_values, relative_values);
}
