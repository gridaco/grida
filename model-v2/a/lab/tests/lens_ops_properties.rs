//! Whole-list lens-operation property seam.

use anchor_lab::model::*;
use anchor_lab::pick::pick;
use anchor_lab::properties::*;
use anchor_lab::resolve::{resolve, resolve_view, ResolveOptions};

fn target(document: &Document, node: NodeId) -> PropertyTarget {
    PropertyTarget::new(document.key_of(node).unwrap(), PropertyKey::LensOps)
}

fn lens_scene() -> (Document, NodeId, NodeId, NodeId) {
    let mut builder = DocBuilder::new();
    let frame = builder.add(
        0,
        Header::new(SizeIntent::Fixed(200.0), SizeIntent::Fixed(40.0)),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                direction: Direction::Row,
                gap_main: 10.0,
                ..LayoutBehavior::default()
            },
            clips_content: false,
        },
    );
    let lens = builder.add(
        frame,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens { ops: vec![] },
    );
    let child = builder.add(
        lens,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let sibling = builder.add(
        frame,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    (builder.build(), lens, child, sibling)
}

#[test]
fn lens_ops_is_a_lens_only_visual_transform_property() {
    let mut builder = DocBuilder::new();
    let lens = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens {
            ops: vec![LensOp::Translate { x: 3.0, y: 4.0 }],
        },
    );
    let shape = builder.add(
        lens,
        Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let document = builder.build();
    let spec = PropertyKey::LensOps.spec();

    assert_eq!(spec.value_kind, PropertyValueKind::LensOps);
    assert_eq!(spec.applicability, PropertyApplicability::Lens);
    assert!(spec.applies_to(document.get(lens)));
    assert!(!spec.applies_to(document.get(shape)));
    assert_eq!(
        spec.impact.bits(),
        PropertyImpact::TRANSFORM.bits()
            | PropertyImpact::BOUNDS.bits()
            | PropertyImpact::PAINT.bits()
    );
    assert_eq!(
        spec.base_value(document.get(lens)),
        Some(PropertyValue::LensOps(vec![LensOp::Translate {
            x: 3.0,
            y: 4.0
        }]))
    );
    assert_eq!(
        ValueView::base(&document).lens_ops(lens),
        [LensOp::Translate { x: 3.0, y: 4.0 }]
    );

    let error = PropertyValues::new(
        &document,
        [(target(&document, shape), PropertyValue::LensOps(vec![]))],
    )
    .unwrap_err();
    assert!(matches!(error, PropertyError::Inapplicable { .. }));
}

#[test]
fn lens_ops_validation_rejects_only_non_finite_parameters() {
    let mut builder = DocBuilder::new();
    let lens = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens { ops: vec![] },
    );
    builder.add(
        lens,
        Header::new(SizeIntent::Fixed(10.0), SizeIntent::Fixed(10.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let document = builder.build();
    let target = target(&document, lens);

    let valid = vec![
        LensOp::Translate { x: -2.0, y: 3.0 },
        LensOp::Rotate { deg: -450.0 },
        LensOp::Scale { x: 0.0, y: -2.0 },
        LensOp::Skew {
            x_deg: 89.0,
            y_deg: -89.0,
        },
        LensOp::Matrix {
            m: [-1.0, 0.0, 0.0, 0.0, 4.0, 5.0],
        },
    ];
    PropertyValues::new(&document, [(target, PropertyValue::LensOps(valid))]).unwrap();

    for invalid in [
        LensOp::Translate {
            x: f32::NAN,
            y: 0.0,
        },
        LensOp::Rotate { deg: f32::INFINITY },
        LensOp::Scale {
            x: 1.0,
            y: f32::NEG_INFINITY,
        },
        LensOp::Skew {
            x_deg: f32::NAN,
            y_deg: 0.0,
        },
        LensOp::Matrix {
            m: [1.0, 0.0, 0.0, 1.0, f32::INFINITY, 0.0],
        },
    ] {
        let error =
            PropertyValues::new(&document, [(target, PropertyValue::LensOps(vec![invalid]))])
                .unwrap_err();
        assert!(
            matches!(&error, PropertyError::InvalidValue { reason, .. } if reason.contains("lens operation 0") && reason.contains("finite")),
            "{error}"
        );
    }
}

#[test]
fn effective_lens_ops_change_reads_but_not_layout() {
    let (document, lens, child, sibling) = lens_scene();
    let options = ResolveOptions {
        viewport: (200.0, 40.0),
        ..ResolveOptions::default()
    };
    let base = resolve(&document, &options);
    let values = PropertyValues::new(
        &document,
        [(
            target(&document, lens),
            PropertyValue::LensOps(vec![LensOp::Translate { x: 100.0, y: 0.0 }]),
        )],
    )
    .unwrap();
    let view = ValueView::new(&document, &values).unwrap();
    let effective = resolve_view(&view, &options);

    assert_eq!(
        view.lens_ops(lens),
        [LensOp::Translate { x: 100.0, y: 0.0 }]
    );
    assert_eq!(effective.box_of(lens), base.box_of(lens));
    assert_eq!(effective.box_of(sibling), base.box_of(sibling));
    assert_eq!(effective.world_of(lens), base.world_of(lens));
    assert_eq!(effective.world_of(child).e, base.world_of(child).e + 100.0);
    assert_eq!(pick(&base, 5.0, 5.0), Some(lens));
    assert_ne!(pick(&effective, 5.0, 5.0), Some(lens));
    assert_eq!(pick(&effective, 105.0, 5.0), Some(lens));
}
