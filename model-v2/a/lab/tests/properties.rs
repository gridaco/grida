//! Closed typed-property registry and immutable ValueView contract.

use anchor_lab::grida_xml;
use anchor_lab::model::*;
use anchor_lab::pick::pick;
use anchor_lab::properties::*;
use anchor_lab::resolve::{resolve, resolve_view, ResolveOptions};
use std::collections::BTreeSet;

fn target(document: &Document, node: NodeId, property: PropertyKey) -> PropertyTarget {
    PropertyTarget::new(document.key_of(node).unwrap(), property)
}

fn flex_scene() -> (Document, NodeId, NodeId) {
    let source = r##"
<grida version="0">
  <container width="200" height="80" layout="flex" direction="row">
    <rect width="20" height="20" fill="#112233"/>
    <rect width="20" height="20"/>
  </container>
</grida>
"##;
    let document = grida_xml::parse(source).unwrap();
    let scene = document.get(document.root).children[0];
    let first = document.get(scene).children[0];
    let second = document.get(scene).children[1];
    (document, first, second)
}

fn per_side_stroke(payload: &Payload) -> Stroke {
    let mut stroke = Stroke::default_for(payload).unwrap();
    stroke.width = StrokeWidth::Rectangular(RectangularStrokeWidth {
        stroke_top_width: 1.0,
        stroke_right_width: 2.0,
        stroke_bottom_width: 3.0,
        stroke_left_width: 4.0,
    });
    stroke
}

fn stop(offset: f32) -> GradientStop {
    GradientStop {
        offset,
        color: Color::BLACK,
    }
}

#[test]
fn registry_is_closed_unique_and_every_base_accessor_matches_its_value_kind() {
    assert_eq!(property_registry().len(), PropertyKey::ALL.len());
    assert_eq!(
        property_registry()
            .iter()
            .map(|spec| spec.key)
            .collect::<BTreeSet<_>>()
            .len(),
        PropertyKey::ALL.len()
    );

    let document = grida_xml::parse(
        r#"
<grida version="0">
  <container>
    <rect width="10" height="10"/>
    <ellipse width="10" height="10"/>
    <line width="10"/>
    <path width="10" height="10" d="M0 0 L1 0 L1 1 Z"/>
    <text>text</text>
    <group><rect width="1" height="1"/></group>
    <lens><rect width="1" height="1"/></lens>
  </container>
</grida>
"#,
    )
    .unwrap();
    let frame = document.get(document.root).children[0];
    let children = &document.get(frame).children;
    assert_eq!(children.len(), 7);

    const FRAME_INAPPLICABLE: &[PropertyKey] = &[
        PropertyKey::AspectRatio,
        PropertyKey::LensOps,
        PropertyKey::PathGeometry,
    ];
    const NON_FRAME: &[PropertyKey] = &[
        PropertyKey::Layout,
        PropertyKey::ClipsContent,
        PropertyKey::LensOps,
        PropertyKey::PathGeometry,
    ];
    const ELLIPSE_INAPPLICABLE: &[PropertyKey] = &[
        PropertyKey::Layout,
        PropertyKey::ClipsContent,
        PropertyKey::CornerRadius,
        PropertyKey::CornerSmoothing,
        PropertyKey::LensOps,
        PropertyKey::PathGeometry,
    ];
    const PATH_INAPPLICABLE: &[PropertyKey] = &[
        PropertyKey::Layout,
        PropertyKey::ClipsContent,
        PropertyKey::CornerRadius,
        PropertyKey::CornerSmoothing,
        PropertyKey::LensOps,
    ];
    const LINE_INAPPLICABLE: &[PropertyKey] = &[
        PropertyKey::Height,
        PropertyKey::MinHeight,
        PropertyKey::MaxHeight,
        PropertyKey::AspectRatio,
        PropertyKey::Layout,
        PropertyKey::ClipsContent,
        PropertyKey::CornerRadius,
        PropertyKey::CornerSmoothing,
        PropertyKey::Fills,
        PropertyKey::LensOps,
        PropertyKey::PathGeometry,
    ];
    const TEXT_INAPPLICABLE: &[PropertyKey] = &[
        PropertyKey::AspectRatio,
        PropertyKey::Layout,
        PropertyKey::ClipsContent,
        PropertyKey::CornerRadius,
        PropertyKey::CornerSmoothing,
        PropertyKey::LensOps,
        PropertyKey::PathGeometry,
    ];
    const DERIVED_INAPPLICABLE: &[PropertyKey] = &[
        PropertyKey::Width,
        PropertyKey::Height,
        PropertyKey::MinWidth,
        PropertyKey::MaxWidth,
        PropertyKey::MinHeight,
        PropertyKey::MaxHeight,
        PropertyKey::AspectRatio,
        PropertyKey::Layout,
        PropertyKey::ClipsContent,
        PropertyKey::CornerRadius,
        PropertyKey::CornerSmoothing,
        PropertyKey::Fills,
        PropertyKey::Strokes,
        PropertyKey::PathGeometry,
    ];
    const GROUP_INAPPLICABLE: &[PropertyKey] = &[
        PropertyKey::Width,
        PropertyKey::Height,
        PropertyKey::MinWidth,
        PropertyKey::MaxWidth,
        PropertyKey::MinHeight,
        PropertyKey::MaxHeight,
        PropertyKey::AspectRatio,
        PropertyKey::Layout,
        PropertyKey::ClipsContent,
        PropertyKey::CornerRadius,
        PropertyKey::CornerSmoothing,
        PropertyKey::Fills,
        PropertyKey::Strokes,
        PropertyKey::LensOps,
        PropertyKey::PathGeometry,
    ];
    let cases: [(&str, NodeId, &[PropertyKey]); 8] = [
        ("frame", frame, FRAME_INAPPLICABLE),
        ("rect", children[0], NON_FRAME),
        ("ellipse", children[1], ELLIPSE_INAPPLICABLE),
        ("line", children[2], LINE_INAPPLICABLE),
        ("path", children[3], PATH_INAPPLICABLE),
        ("text", children[4], TEXT_INAPPLICABLE),
        ("group", children[5], GROUP_INAPPLICABLE),
        ("lens", children[6], DERIVED_INAPPLICABLE),
    ];

    for (kind, id, inapplicable) in cases {
        let node = document.get(id);
        for spec in property_registry() {
            let expected = !inapplicable.contains(&spec.key);
            assert_eq!(
                spec.applies_to(node),
                expected,
                "{kind} {:?} applicability",
                spec.key
            );
            match spec.base_value(node) {
                Some(value) => {
                    assert!(expected);
                    assert_eq!(value.kind(), spec.value_kind, "{kind} {:?}", spec.key);
                }
                None => assert!(!expected, "{kind} {:?} base value", spec.key),
            }
        }
    }

    assert!(!PropertyKey::Fills
        .spec()
        .applies_to(document.get(children[2])));
    assert!(PropertyKey::Strokes
        .spec()
        .applies_to(document.get(children[2])));
}

#[test]
fn property_values_reject_duplicates_stale_wrong_inapplicable_and_invalid_entries() {
    let (mut document, first, _) = flex_scene();
    let width = target(&document, first, PropertyKey::Width);
    let duplicate = PropertyValues::new(
        &document,
        [
            (width, PropertyValue::SizeIntent(SizeIntent::Fixed(30.0))),
            (width, PropertyValue::SizeIntent(SizeIntent::Fixed(40.0))),
        ],
    )
    .unwrap_err();
    assert!(matches!(duplicate, PropertyError::DuplicateTarget { .. }));

    let wrong = PropertyValues::new(&document, [(width, PropertyValue::Number(30.0))]).unwrap_err();
    assert!(matches!(wrong, PropertyError::WrongValueKind { .. }));

    let group = {
        let mut builder = DocBuilder::new();
        let group = builder.add(
            0,
            Header::new(SizeIntent::Auto, SizeIntent::Auto),
            Payload::Group,
        );
        (builder.build(), group)
    };
    let inapplicable = PropertyValues::new(
        &group.0,
        [(
            target(&group.0, group.1, PropertyKey::Width),
            PropertyValue::SizeIntent(SizeIntent::Fixed(1.0)),
        )],
    )
    .unwrap_err();
    assert!(matches!(inapplicable, PropertyError::Inapplicable { .. }));

    let invalid = PropertyValues::new(
        &document,
        [(
            target(&document, first, PropertyKey::Opacity),
            PropertyValue::Number(f32::NAN),
        )],
    )
    .unwrap_err();
    assert!(matches!(invalid, PropertyError::InvalidValue { .. }));

    let other = document.clone();
    let cross_document = PropertyValues::new(
        &other,
        [(width, PropertyValue::SizeIntent(SizeIntent::Fixed(30.0)))],
    )
    .unwrap_err();
    assert!(matches!(cross_document, PropertyError::StaleTarget { .. }));

    let retained = PropertyValues::new(
        &document,
        [(width, PropertyValue::SizeIntent(SizeIntent::Fixed(30.0)))],
    )
    .unwrap();
    document.remove_subtree(first);
    let stale = ValueView::new(&document, &retained).unwrap_err();
    assert!(matches!(stale, PropertyError::StaleTarget { .. }));
}

#[test]
fn paint_and_stroke_values_are_validated_recursively_without_subobject_targets() {
    let (document, first, _) = flex_scene();
    let mut gradient = LinearGradientPaint::default();
    gradient.opacity = f32::INFINITY;
    let paint_error = PropertyValues::new(
        &document,
        [(
            target(&document, first, PropertyKey::Fills),
            PropertyValue::Paints(Paints::new([Paint::LinearGradient(gradient)])),
        )],
    )
    .unwrap_err();
    assert!(matches!(paint_error, PropertyError::InvalidValue { .. }));

    let mut stroke = Stroke::default_for(&document.get(first).payload).unwrap();
    stroke.width = StrokeWidth::Uniform(-1.0);
    let stroke_error = PropertyValues::new(
        &document,
        [(
            target(&document, first, PropertyKey::Strokes),
            PropertyValue::Strokes(vec![stroke]),
        )],
    )
    .unwrap_err();
    assert!(matches!(stroke_error, PropertyError::InvalidValue { .. }));
}

#[test]
fn effective_gradients_reject_singular_transforms_for_every_gradient_kind() {
    let (document, rect, _) = flex_scene();
    let stops = vec![stop(0.0), stop(1.0)];
    let singular = anchor_lab::math::Affine {
        a: 1.0,
        b: 2.0,
        c: 2.0,
        d: 4.0,
        e: 8.0,
        f: 9.0,
    };
    let paints = [
        Paint::LinearGradient(LinearGradientPaint {
            transform: singular,
            stops: stops.clone(),
            ..Default::default()
        }),
        Paint::RadialGradient(RadialGradientPaint {
            transform: singular,
            stops: stops.clone(),
            ..Default::default()
        }),
        Paint::SweepGradient(SweepGradientPaint {
            transform: singular,
            stops: stops.clone(),
            ..Default::default()
        }),
        Paint::DiamondGradient(DiamondGradientPaint {
            transform: singular,
            stops,
            ..Default::default()
        }),
    ];

    for paint in paints {
        let error = PropertyValues::new(
            &document,
            [(
                target(&document, rect, PropertyKey::Fills),
                PropertyValue::Paints(Paints::new([paint])),
            )],
        )
        .unwrap_err();
        assert!(
            matches!(&error, PropertyError::InvalidValue { reason, .. } if reason.contains("transform must be invertible")),
            "{error}"
        );
    }
}

#[test]
fn effective_linear_gradient_endpoints_follow_skias_f32_degeneracy_boundary() {
    let (document, rect, _) = flex_scene();
    let key = target(&document, rect, PropertyKey::Fills);
    let threshold = anchor_lab::renderability::LINEAR_GRADIENT_DEGENERATE_THRESHOLD;
    let gradient = |distance: f32| {
        Paint::LinearGradient(LinearGradientPaint {
            xy1: Alignment::from_uv(0.0, 0.5),
            xy2: Alignment::from_uv(distance, 0.5),
            stops: vec![stop(0.0), stop(1.0)],
            ..Default::default()
        })
    };

    for distance in [0.0, threshold / 2.0, threshold] {
        let error = PropertyValues::new(
            &document,
            [(
                key,
                PropertyValue::Paints(Paints::new([gradient(distance)])),
            )],
        )
        .unwrap_err();
        assert!(
            matches!(&error, PropertyError::InvalidValue { reason, .. } if reason.contains("farther apart")),
            "distance={distance}: {error}"
        );
    }

    PropertyValues::new(
        &document,
        [(
            key,
            PropertyValue::Paints(Paints::new([gradient(threshold * 2.0)])),
        )],
    )
    .expect("a linear ramp above Skia's degeneracy threshold remains renderable");
}

#[test]
fn line_locked_height_and_gradient_stop_cardinality_are_rejected() {
    let document =
        grida_xml::parse(r#"<grida version="0"><container><line width="10"/></container></grida>"#)
            .unwrap();
    let scene = document.get(document.root).children[0];
    let line = document.get(scene).children[0];
    let height = PropertyValues::new(
        &document,
        [(
            target(&document, line, PropertyKey::Height),
            PropertyValue::SizeIntent(SizeIntent::Fixed(1.0)),
        )],
    )
    .unwrap_err();
    assert!(matches!(height, PropertyError::Inapplicable { .. }));

    let (document, rect, _) = flex_scene();
    for stops in [vec![], vec![stop(0.0)]] {
        let gradient = LinearGradientPaint {
            stops,
            ..Default::default()
        };
        let error = PropertyValues::new(
            &document,
            [(
                target(&document, rect, PropertyKey::Fills),
                PropertyValue::Paints(Paints::new([Paint::LinearGradient(gradient)])),
            )],
        )
        .unwrap_err();
        assert!(
            matches!(&error, PropertyError::InvalidValue { reason, .. } if reason.contains("at least two stops")),
            "{error}"
        );
    }
}

#[test]
fn base_and_empty_effective_views_both_reject_inapplicable_reads() {
    let document =
        grida_xml::parse(r#"<grida version="0"><container><line width="10"/></container></grida>"#)
            .unwrap();
    let scene = document.get(document.root).children[0];
    let line = document.get(scene).children[0];
    let empty = PropertyValues::default();
    let base = ValueView::base(&document);
    let effective = ValueView::new(&document, &empty).unwrap();

    assert!(std::panic::catch_unwind(|| base.height(line)).is_err());
    assert!(std::panic::catch_unwind(|| effective.height(line)).is_err());
}

#[test]
fn unrelated_effective_values_do_not_make_flex_read_inapplicable_geometry() {
    let mut builder = DocBuilder::new();
    let frame = builder.add(
        0,
        Header::new(SizeIntent::Fixed(200.0), SizeIntent::Fixed(80.0)),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                direction: Direction::Row,
                ..Default::default()
            },
            clips_content: false,
        },
    );
    let line = builder.add(
        frame,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Auto),
        Payload::Shape {
            desc: ShapeDesc::Line,
        },
    );
    let group = builder.add(
        frame,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Group,
    );
    builder.add(
        group,
        Header::new(SizeIntent::Fixed(12.0), SizeIntent::Fixed(10.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let lens = builder.add(
        frame,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens { ops: vec![] },
    );
    builder.add(
        lens,
        Header::new(SizeIntent::Fixed(8.0), SizeIntent::Fixed(6.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let document = builder.build();

    for node in [line, group, lens] {
        let values = PropertyValues::new(
            &document,
            [(
                target(&document, node, PropertyKey::Opacity),
                PropertyValue::Number(0.5),
            )],
        )
        .unwrap();
        let view = ValueView::new(&document, &values).unwrap();
        let resolved = resolve_view(&view, &ResolveOptions::default());
        assert!(resolved.box_opt(node).is_some());
    }
}

#[test]
fn effective_geometry_tuples_preserve_static_span_line_and_shape_rules() {
    let (document, rect, _) = flex_scene();
    let span_with_fixed = PropertyValues::new(
        &document,
        [(
            target(&document, rect, PropertyKey::X),
            PropertyValue::AxisBinding(AxisBinding::Span {
                start: 0.0,
                end: 0.0,
            }),
        )],
    )
    .unwrap_err();
    assert!(
        matches!(&span_with_fixed, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("span x")),
        "{span_with_fixed}"
    );

    let constrained = grida_xml::parse(
        r#"<grida version="0"><container><rect x="span 0 0" height="20"/></container></grida>"#,
    )
    .unwrap();
    let scene = constrained.get(constrained.root).children[0];
    let rect = constrained.get(scene).children[0];
    let span_with_min = PropertyValues::new(
        &constrained,
        [(
            target(&constrained, rect, PropertyKey::MinWidth),
            PropertyValue::OptionalNumber(Some(1.0)),
        )],
    )
    .unwrap_err();
    assert!(matches!(
        span_with_min,
        PropertyError::InvalidEffectiveState { .. }
    ));

    let line_document =
        grida_xml::parse(r#"<grida version="0"><container><line width="10"/></container></grida>"#)
            .unwrap();
    let scene = line_document.get(line_document.root).children[0];
    let line = line_document.get(scene).children[0];
    let line_y = PropertyValues::new(
        &line_document,
        [(
            target(&line_document, line, PropertyKey::Y),
            PropertyValue::AxisBinding(AxisBinding::Span {
                start: 0.0,
                end: 0.0,
            }),
        )],
    )
    .unwrap_err();
    assert!(
        matches!(&line_y, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("y Span")),
        "{line_y}"
    );
    let mut bad_line_document = line_document.clone();
    bad_line_document.get_mut(line).header.height = SizeIntent::Fixed(1.0);
    let bad_height = PropertyValues::new(
        &bad_line_document,
        [(
            target(&bad_line_document, line, PropertyKey::Width),
            PropertyValue::SizeIntent(SizeIntent::Fixed(12.0)),
        )],
    )
    .unwrap_err();
    assert!(
        matches!(&bad_height, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("locked to zero")),
        "{bad_height}"
    );

    let mut builder = DocBuilder::new();
    let group = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Group,
    );
    let lens = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Lens { ops: vec![] },
    );
    let derived = builder.build();
    for node in [group, lens] {
        let error = PropertyValues::new(
            &derived,
            [(
                target(&derived, node, PropertyKey::X),
                PropertyValue::AxisBinding(AxisBinding::Span {
                    start: 0.0,
                    end: 0.0,
                }),
            )],
        )
        .unwrap_err();
        assert!(
            matches!(&error, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("derived origin")),
            "{error}"
        );
    }

    let shapes = grida_xml::parse(
        r#"<grida version="0"><container><rect width="10" height="10"/><ellipse width="10" height="10"/><path width="10" height="10" d="M0 0 L1 0 L1 1 Z"/></container></grida>"#,
    )
    .unwrap();
    let scene = shapes.get(shapes.root).children[0];
    for &shape in &shapes.get(scene).children {
        let error = PropertyValues::new(
            &shapes,
            [(
                target(&shapes, shape, PropertyKey::Width),
                PropertyValue::SizeIntent(SizeIntent::Auto),
            )],
        )
        .unwrap_err();
        assert!(
            matches!(&error, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("require")),
            "{error}"
        );
    }
}

#[test]
fn effective_corner_and_stroke_pairs_are_validated_as_one_state() {
    let (mut smoothing_document, rect, _) = flex_scene();
    smoothing_document.get_mut(rect).corner_smoothing = CornerSmoothing(0.5);
    let stroke = per_side_stroke(&smoothing_document.get(rect).payload);
    let stroke_error = PropertyValues::new(
        &smoothing_document,
        [(
            target(&smoothing_document, rect, PropertyKey::Strokes),
            PropertyValue::Strokes(vec![stroke.clone()]),
        )],
    )
    .unwrap_err();
    assert!(
        matches!(&stroke_error, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("corner-smoothing")),
        "{stroke_error}"
    );

    let (mut stroke_document, rect, _) = flex_scene();
    stroke_document.get_mut(rect).strokes = vec![stroke.clone()];
    let smoothing_error = PropertyValues::new(
        &stroke_document,
        [(
            target(&stroke_document, rect, PropertyKey::CornerSmoothing),
            PropertyValue::Number(0.5),
        )],
    )
    .unwrap_err();
    assert!(
        matches!(&smoothing_error, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("corner-smoothing")),
        "{smoothing_error}"
    );

    let (mut elliptical_document, rect, _) = flex_scene();
    elliptical_document.get_mut(rect).corner_radius =
        RectangularCornerRadius::all(Radius { rx: 8.0, ry: 4.0 });
    let elliptical_error = PropertyValues::new(
        &elliptical_document,
        [(
            target(&elliptical_document, rect, PropertyKey::CornerSmoothing),
            PropertyValue::Number(0.5),
        )],
    )
    .unwrap_err();
    assert!(
        matches!(&elliptical_error, PropertyError::InvalidEffectiveState { reason, .. } if reason.contains("circular corner radii")),
        "{elliptical_error}"
    );

    let (mut radius_document, rect, _) = flex_scene();
    radius_document.get_mut(rect).corner_smoothing = CornerSmoothing(0.5);
    let radius_error = PropertyValues::new(
        &radius_document,
        [(
            target(&radius_document, rect, PropertyKey::CornerRadius),
            PropertyValue::CornerRadius(RectangularCornerRadius::all(Radius { rx: 8.0, ry: 4.0 })),
        )],
    )
    .unwrap_err();
    assert!(matches!(
        radius_error,
        PropertyError::InvalidEffectiveState { .. }
    ));

    let coordinated = PropertyValues::new(
        &smoothing_document,
        [
            (
                target(&smoothing_document, rect, PropertyKey::CornerSmoothing),
                PropertyValue::Number(0.0),
            ),
            (
                target(&smoothing_document, rect, PropertyKey::Strokes),
                PropertyValue::Strokes(vec![stroke]),
            ),
        ],
    )
    .unwrap();
    ValueView::new(&smoothing_document, &coordinated).unwrap();
}

#[test]
fn value_view_revalidates_aggregate_state_after_authored_changes() {
    let (mut document, rect, _) = flex_scene();
    let values = PropertyValues::new(
        &document,
        [(
            target(&document, rect, PropertyKey::Strokes),
            PropertyValue::Strokes(vec![per_side_stroke(&document.get(rect).payload)]),
        )],
    )
    .unwrap();
    document.get_mut(rect).corner_smoothing = CornerSmoothing(0.5);
    assert!(matches!(
        ValueView::new(&document, &values),
        Err(PropertyError::InvalidEffectiveState { .. })
    ));
}

#[test]
fn effective_image_paints_match_the_proving_renderer_capability_fence() {
    let (document, rect, _) = flex_scene();
    let key = target(&document, rect, PropertyKey::Fills);
    let valid = ImagePaint::from_rid("asset");
    PropertyValues::new(
        &document,
        [(
            key,
            PropertyValue::Paints(Paints::new([Paint::Image(valid.clone())])),
        )],
    )
    .unwrap();

    let mut unsupported = Vec::new();
    let mut quarter_turn = valid.clone();
    quarter_turn.quarter_turns = 1;
    unsupported.push(quarter_turn);
    let mut alignment = valid.clone();
    alignment.alignment = Alignment(-1.0, -1.0);
    unsupported.push(alignment);
    let mut transform = valid.clone();
    transform.fit = ImagePaintFit::Transform(anchor_lab::math::Affine::IDENTITY);
    unsupported.push(transform);
    let mut tile = valid.clone();
    tile.fit = ImagePaintFit::Tile(ImageTile {
        scale: 1.0,
        repeat: ImageRepeat::Repeat,
    });
    unsupported.push(tile);
    let mut filtered = valid;
    filtered.filters.exposure = 1.0;
    unsupported.push(filtered);

    for image in unsupported {
        let error = PropertyValues::new(
            &document,
            [(
                key,
                PropertyValue::Paints(Paints::new([Paint::Image(image)])),
            )],
        )
        .unwrap_err();
        assert!(matches!(error, PropertyError::InvalidValue { .. }));
    }
}

#[test]
fn absent_values_read_authored_base_while_typed_none_clears_optional_base() {
    let (mut document, first, _) = flex_scene();
    document.get_mut(first).header.min_width = Some(12.0);
    let key = target(&document, first, PropertyKey::MinWidth);

    let base = ValueView::base(&document);
    assert_eq!(base.min_width(first), Some(12.0));

    let values =
        PropertyValues::new(&document, [(key, PropertyValue::OptionalNumber(None))]).unwrap();
    let projected = ValueView::new(&document, &values).unwrap();
    assert_eq!(projected.min_width(first), None);
    assert_eq!(document.get(first).header.min_width, Some(12.0));
}

#[test]
fn empty_value_view_is_bit_exact_for_resolve_and_pick() {
    let source = r##"
<grida version="0">
  <container width="220" height="100" layout="flex" gap="4" fill="#223344">
    <text width="60">alpha beta</text>
    <path width="40" height="30" d="M0 0 L1 0 L1 1 Z"/>
    <rect width="20" height="20" hidden="true"/>
  </container>
</grida>
"##;
    let document = grida_xml::parse(source).unwrap();
    let values = PropertyValues::new(&document, []).unwrap();
    let view = ValueView::new(&document, &values).unwrap();
    let options = ResolveOptions::default();
    let base = resolve(&document, &options);
    let projected = resolve_view(&view, &options);
    assert_eq!(projected, base);
    assert_eq!(pick(&projected, 1.0, 1.0), pick(&base, 1.0, 1.0));
}

#[test]
fn valid_geometry_transform_and_visibility_values_change_only_the_view() {
    let (document, first, second) = flex_scene();
    let authored = document.clone();
    let options = ResolveOptions::default();
    let base = resolve(&document, &options);

    let width_values = PropertyValues::new(
        &document,
        [(
            target(&document, first, PropertyKey::Width),
            PropertyValue::SizeIntent(SizeIntent::Fixed(50.0)),
        )],
    )
    .unwrap();
    let width_view = ValueView::new(&document, &width_values).unwrap();
    let width_resolved = resolve_view(&width_view, &options);
    assert_eq!(base.box_of(second).x, 20.0);
    assert_eq!(width_resolved.box_of(second).x, 50.0);

    let rotation_values = PropertyValues::new(
        &document,
        [(
            target(&document, first, PropertyKey::Rotation),
            PropertyValue::Number(45.0),
        )],
    )
    .unwrap();
    let rotation_view = ValueView::new(&document, &rotation_values).unwrap();
    let rotation_resolved = resolve_view(&rotation_view, &options);
    assert_ne!(rotation_resolved.world_of(first), base.world_of(first));
    assert_ne!(rotation_resolved.aabb_of(first), base.aabb_of(first));

    let active_values = PropertyValues::new(
        &document,
        [(
            target(&document, first, PropertyKey::Active),
            PropertyValue::Boolean(false),
        )],
    )
    .unwrap();
    let active_view = ValueView::new(&document, &active_values).unwrap();
    let active_resolved = resolve_view(&active_view, &options);
    assert!(active_resolved.world_opt(first).is_none());
    assert_eq!(active_resolved.box_of(second).x, 0.0);

    assert_eq!(
        document, authored,
        "value views never mutate authored state"
    );
}

#[test]
fn effective_cross_size_controls_container_stretch_without_mutating_authored_state() {
    let mut builder = DocBuilder::new();
    let container = builder.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(100.0)),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                direction: Direction::Column,
                cross_align: CrossAlign::Stretch,
                ..Default::default()
            },
            clips_content: false,
        },
    );
    let authored_auto = builder.add(
        container,
        Header::new(SizeIntent::Auto, SizeIntent::Fixed(20.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let authored_fixed = builder.add(
        container,
        Header::new(SizeIntent::Fixed(30.0), SizeIntent::Fixed(20.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let document = builder.build();
    let authored = document.clone();
    let values = PropertyValues::new(
        &document,
        [
            (
                target(&document, authored_auto, PropertyKey::Width),
                PropertyValue::SizeIntent(SizeIntent::Fixed(40.0)),
            ),
            (
                target(&document, authored_fixed, PropertyKey::Width),
                PropertyValue::SizeIntent(SizeIntent::Auto),
            ),
        ],
    )
    .unwrap();
    let view = ValueView::new(&document, &values).unwrap();
    let resolved = resolve_view(&view, &ResolveOptions::default());

    assert_eq!(
        resolved.box_of(authored_auto).w,
        40.0,
        "an effective fixed cross size prevents container stretch"
    );
    assert_eq!(
        resolved.box_of(authored_fixed).w,
        100.0,
        "an effective Auto cross size permits container stretch"
    );
    assert_eq!(
        document, authored,
        "resolution leaves authored state intact"
    );
}

#[test]
fn rounded_and_smoothed_effective_clips_control_descendant_queries() {
    let document = grida_xml::parse(
        r#"
<grida version="0">
  <container width="100" height="100">
    <container x="10" y="10" width="80" height="80" clips="true">
      <rect width="80" height="80"/>
    </container>
  </container>
</grida>
"#,
    )
    .unwrap();
    let scene = document.get(document.root).children[0];
    let clip = document.get(scene).children[0];
    let child = document.get(clip).children[0];
    let options = ResolveOptions::default();

    let base = resolve(&document, &options);
    assert_eq!(pick(&base, 11.0, 11.0), Some(child));

    let rounded_values = PropertyValues::new(
        &document,
        [(
            target(&document, clip, PropertyKey::CornerRadius),
            PropertyValue::CornerRadius(RectangularCornerRadius::circular(30.0)),
        )],
    )
    .unwrap();
    let rounded_view = ValueView::new(&document, &rounded_values).unwrap();
    let rounded = resolve_view(&rounded_view, &options);
    assert_eq!(
        pick(&rounded, 11.0, 11.0),
        Some(clip),
        "the rounded corner excludes the child but not the frame's own box"
    );
    assert_eq!(pick(&rounded, 50.0, 11.0), Some(child));
    assert_eq!(pick(&rounded, 50.0, 50.0), Some(child));

    let ordinary_values = PropertyValues::new(
        &document,
        [(
            target(&document, clip, PropertyKey::CornerRadius),
            PropertyValue::CornerRadius(RectangularCornerRadius::circular(24.0)),
        )],
    )
    .unwrap();
    let ordinary_view = ValueView::new(&document, &ordinary_values).unwrap();
    let ordinary = resolve_view(&ordinary_view, &options);
    assert_eq!(pick(&ordinary, 28.0, 11.0), Some(child));

    let smooth_values = PropertyValues::new(
        &document,
        [
            (
                target(&document, clip, PropertyKey::CornerRadius),
                PropertyValue::CornerRadius(RectangularCornerRadius::circular(24.0)),
            ),
            (
                target(&document, clip, PropertyKey::CornerSmoothing),
                PropertyValue::Number(0.8),
            ),
        ],
    )
    .unwrap();
    let smooth_view = ValueView::new(&document, &smooth_values).unwrap();
    let smooth = resolve_view(&smooth_view, &options);
    assert_eq!(
        pick(&smooth, 28.0, 11.0),
        Some(clip),
        "effective smoothing uses the same extended corner path as raster clipping"
    );
}

#[test]
fn impacts_cover_the_declared_downstream_stages() {
    assert!(PropertyKey::Width
        .spec()
        .impact
        .contains(PropertyImpact::LAYOUT));
    for key in [
        PropertyKey::Rotation,
        PropertyKey::FlipX,
        PropertyKey::FlipY,
    ] {
        assert!(
            key.spec()
                .impact
                .contains(PropertyImpact::MEASURE | PropertyImpact::LAYOUT),
            "{key:?} participates in AABB-in-flow measurement and layout"
        );
        assert!(key
            .spec()
            .impact
            .contains(PropertyImpact::TRANSFORM | PropertyImpact::BOUNDS | PropertyImpact::PAINT));
    }
    assert!(PropertyKey::Strokes
        .spec()
        .impact
        .contains(PropertyImpact::BOUNDS | PropertyImpact::PAINT));
    assert!(PropertyKey::PathGeometry
        .spec()
        .impact
        .contains(PropertyImpact::BOUNDS | PropertyImpact::PAINT));
    assert!(!PropertyKey::PathGeometry
        .spec()
        .impact
        .contains(PropertyImpact::LAYOUT));
    assert!(PropertyKey::Fills
        .spec()
        .impact
        .contains(PropertyImpact::RESOURCE));
}
