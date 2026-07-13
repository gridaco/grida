//! Pre-animation effective-value contract: one immutable typed view feeds
//! resolve, drawlist, query, damage, and raster. There is deliberately no
//! clock, timeline, track, keyframe, or playback state in these tests.

use anchor_engine::damage::{diff_frame, Damage};
use anchor_engine::drawlist::{
    build_glyphless_unchecked, build_glyphless_view_unchecked, ItemKind,
};
use anchor_engine::frame;
use anchor_engine::paint::{read_pixels, PaintCtx};
use anchor_engine::query::Query;
use anchor_engine::replay::resolved_bits_eq;
use anchor_lab::math::Affine;
use anchor_lab::model::*;
use anchor_lab::properties::{
    PropertyKey, PropertyTarget, PropertyValue, PropertyValues, ValueView,
};
use anchor_lab::resolve::{resolve, resolve_view, ResolveOptions};
use skia_safe::{surfaces, Color as SkColor};

const W: i32 = 180;
const H: i32 = 120;

fn options() -> ResolveOptions {
    ResolveOptions {
        viewport: (W as f32, H as f32),
        ..Default::default()
    }
}

fn target(document: &Document, node: NodeId, property: PropertyKey) -> PropertyTarget {
    PropertyTarget::new(document.key_of(node).expect("live node"), property)
}

fn value_set(
    document: &Document,
    entries: impl IntoIterator<Item = (NodeId, PropertyKey, PropertyValue)>,
) -> PropertyValues {
    PropertyValues::new(
        document,
        entries
            .into_iter()
            .map(|(node, key, value)| (target(document, node, key), value)),
    )
    .expect("valid effective values")
}

fn simple_scene() -> (Document, NodeId) {
    let mut builder = DocBuilder::new();
    let mut header = Header::new(SizeIntent::Fixed(48.0), SizeIntent::Fixed(36.0));
    header.x = AxisBinding::start(24.0);
    header.y = AxisBinding::start(28.0);
    let rect = builder.add(
        0,
        header,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(rect).fills = Paints::solid("#2563EB".into());
    (builder.build(), rect)
}

fn render_view(document: &Document, values: &PropertyValues) -> Vec<u8> {
    let view = ValueView::new(document, values).unwrap();
    let context = PaintCtx::new(None);
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    frame::render_view(
        surface.canvas(),
        &view,
        &options(),
        &Affine::IDENTITY,
        &context,
    )
    .expect("valid effective-value frame");
    read_pixels(&mut surface, W, H)
}

fn assert_changed_node(damage: &Damage, node: NodeId) {
    assert_eq!(damage.changed, vec![node]);
    assert!(damage.union_world.is_some(), "visual damage needs coverage");
}

#[test]
fn empty_values_are_the_exact_static_pipeline() {
    let (document, rect) = simple_scene();
    let values = PropertyValues::default();
    let value_view = ValueView::new(&document, &values).unwrap();
    let context = PaintCtx::new(None);

    let static_resolved = resolve(&document, &options());
    let viewed_resolved = resolve_view(&value_view, &options());
    assert!(resolved_bits_eq(&static_resolved, &viewed_resolved));

    let static_list = build_glyphless_unchecked(&document, &static_resolved);
    let viewed_list = build_glyphless_view_unchecked(&value_view, &viewed_resolved);
    assert_eq!(static_list, viewed_list);

    let static_query = Query::new(&static_resolved);
    let viewed_query = Query::new(&viewed_resolved);
    for point in [(0.0, 0.0), (30.0, 35.0), (70.0, 64.0), (100.0, 100.0)] {
        assert_eq!(
            static_query.hit_point(point.0, point.1),
            viewed_query.hit_point(point.0, point.1)
        );
    }
    assert_eq!(viewed_query.hit_point(30.0, 35.0), Some(rect));

    let static_product =
        frame::resolve_and_build(&document, &options(), &context).expect("valid static frame");
    let viewed_product = frame::resolve_and_build_view(&value_view, &options(), &context)
        .expect("valid effective-value frame");
    assert!(resolved_bits_eq(
        static_product.resolved(),
        viewed_product.resolved()
    ));
    assert_eq!(static_product.drawlist(), viewed_product.drawlist());
    assert!(diff_frame(&static_product, &viewed_product).is_empty());

    // The two public raster entries must not merely look close: their bytes
    // are the same static computation.
    let expected = render_view(&document, &values);
    let mut surface = surfaces::raster_n32_premul((W, H)).unwrap();
    surface.canvas().clear(SkColor::WHITE);
    frame::render(
        surface.canvas(),
        &document,
        &options(),
        &Affine::IDENTITY,
        &PaintCtx::new(None),
    )
    .expect("valid static frame");
    assert_eq!(read_pixels(&mut surface, W, H), expected);
}

#[test]
fn layout_rotation_and_query_observe_one_effective_view() {
    let mut builder = DocBuilder::new();
    let mut frame_header = Header::new(SizeIntent::Fixed(120.0), SizeIntent::Fixed(50.0));
    frame_header.x = AxisBinding::start(10.0);
    frame_header.y = AxisBinding::start(20.0);
    let parent = builder.add(
        0,
        frame_header,
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let first = builder.add(
        parent,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    let second = builder.add(
        parent,
        Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(first).fills = Paints::solid("#111827".into());
    builder.node_mut(second).fills = Paints::solid("#7C3AED".into());
    let document = builder.build();

    let layout = LayoutBehavior {
        mode: LayoutMode::Flex,
        direction: Direction::Row,
        gap_main: 12.0,
        ..Default::default()
    };
    let values = value_set(
        &document,
        [
            (parent, PropertyKey::Layout, PropertyValue::Layout(layout)),
            (second, PropertyKey::Rotation, PropertyValue::Number(30.0)),
        ],
    );
    let view = ValueView::new(&document, &values).unwrap();
    let resolved = resolve_view(&view, &options());

    assert_eq!(resolved.xywh(first), (0.0, 0.0, 20.0, 20.0));
    assert_eq!(resolved.xywh(second), (32.0, 0.0, 20.0, 20.0));
    assert_ne!(resolved.world_of(second), Affine::translate(42.0, 20.0));

    let query = Query::new(&resolved);
    assert_eq!(query.hit_point(20.0, 30.0), Some(first));
    assert_eq!(query.hit_point(52.0, 30.0), Some(second));

    let list = build_glyphless_view_unchecked(&view, &resolved);
    let second_item = list.items.iter().find(|item| item.node == second).unwrap();
    assert_eq!(second_item.world, resolved.world_of(second));
}

#[test]
fn effective_smooth_clip_query_matches_raster_coverage() {
    let mut builder = DocBuilder::new();
    let mut clip_header = Header::new(SizeIntent::Fixed(80.0), SizeIntent::Fixed(80.0));
    clip_header.x = AxisBinding::start(20.0);
    clip_header.y = AxisBinding::start(20.0);
    let clip = builder.add(
        0,
        clip_header,
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: true,
        },
    );
    let child = builder.add(
        clip,
        Header::new(SizeIntent::Fixed(80.0), SizeIntent::Fixed(80.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(child).fills = Paints::solid("#22C55E".into());
    let document = builder.build();
    let values = value_set(
        &document,
        [
            (
                clip,
                PropertyKey::CornerRadius,
                PropertyValue::CornerRadius(RectangularCornerRadius::circular(28.0)),
            ),
            (
                clip,
                PropertyKey::CornerSmoothing,
                PropertyValue::Number(0.7),
            ),
        ],
    );
    let view = ValueView::new(&document, &values).unwrap();
    let context = PaintCtx::new(None);
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    let (product, _) = frame::render_view(
        surface.canvas(),
        &view,
        &options(),
        &Affine::IDENTITY,
        &context,
    )
    .expect("valid effective-value frame");
    let pixels = read_pixels(&mut surface, W, H);
    let query = product.query();

    let mut inside = 0;
    let mut outside = 0;
    for local_y in (2..78).step_by(4) {
        for local_x in (2..78).step_by(4) {
            let x = 20 + local_x;
            let y = 20 + local_y;
            let offset = ((y * W + x) * 4) as usize;
            let pixel = &pixels[offset..offset + 4];
            let hit = query.hit_point(x as f32 + 0.5, y as f32 + 0.5);
            if pixel == [34, 197, 94, 255] {
                inside += 1;
                assert_eq!(hit, Some(child), "visible child pixel at ({x}, {y})");
            } else if pixel == [255, 255, 255, 255] {
                outside += 1;
                assert_ne!(hit, Some(child), "clipped child pixel at ({x}, {y})");
            }
        }
    }
    assert!(inside > 250, "probe must cover the clip interior");
    assert!(outside > 10, "probe must cover clipped smooth corners");
}

#[test]
fn effective_ordinary_elliptical_extreme_radii_query_matches_skia_raster() {
    let mut builder = DocBuilder::new();
    let mut clip_header = Header::new(SizeIntent::Fixed(80.0), SizeIntent::Fixed(60.0));
    clip_header.x = AxisBinding::start(20.0);
    clip_header.y = AxisBinding::start(20.0);
    let clip = builder.add(
        0,
        clip_header,
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: true,
        },
    );
    let child = builder.add(
        clip,
        Header::new(SizeIntent::Fixed(80.0), SizeIntent::Fixed(60.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(child).fills = Paints::solid("#22C55E".into());
    let document = builder.build();
    let extreme_ellipse = Radius {
        rx: f32::MAX,
        ry: f32::MAX / 2.0,
    };
    let values = value_set(
        &document,
        [(
            clip,
            PropertyKey::CornerRadius,
            PropertyValue::CornerRadius(RectangularCornerRadius::all(extreme_ellipse)),
        )],
    );
    let view = ValueView::new(&document, &values).unwrap();
    let context = PaintCtx::new(None);
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    let (product, _) = frame::render_view(
        surface.canvas(),
        &view,
        &options(),
        &Affine::IDENTITY,
        &context,
    )
    .expect("valid effective-value frame");
    let pixels = read_pixels(&mut surface, W, H);
    let query = product.query();

    let mut inside = 0;
    let mut outside = 0;
    for local_y in (1..59).step_by(2) {
        for local_x in (1..79).step_by(2) {
            let x = 20 + local_x;
            let y = 20 + local_y;
            let offset = ((y * W + x) * 4) as usize;
            let pixel = &pixels[offset..offset + 4];
            let hit = query.hit_point(x as f32 + 0.5, y as f32 + 0.5);
            if pixel == [34, 197, 94, 255] {
                inside += 1;
                assert_eq!(hit, Some(child), "visible child pixel at ({x}, {y})");
            } else if pixel == [255, 255, 255, 255] {
                outside += 1;
                assert_ne!(hit, Some(child), "clipped child pixel at ({x}, {y})");
            }
        }
    }
    assert!(
        inside > 900,
        "probe must cover the elliptical clip interior"
    );
    assert!(outside > 100, "probe must cover clipped elliptical corners");
}

#[test]
fn zero_width_effective_clip_is_empty_for_query_and_raster() {
    let mut builder = DocBuilder::new();
    let mut clip_header = Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(40.0));
    clip_header.x = AxisBinding::start(20.0);
    clip_header.y = AxisBinding::start(20.0);
    let clip = builder.add(
        0,
        clip_header,
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: true,
        },
    );
    let child = builder.add(
        clip,
        Header::new(SizeIntent::Fixed(30.0), SizeIntent::Fixed(30.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(child).fills = Paints::solid("#22C55E".into());
    let document = builder.build();
    let values = value_set(
        &document,
        [(
            clip,
            PropertyKey::Width,
            PropertyValue::SizeIntent(SizeIntent::Fixed(0.0)),
        )],
    );
    let view = ValueView::new(&document, &values).unwrap();
    let context = PaintCtx::new(None);
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("raster surface");
    surface.canvas().clear(SkColor::WHITE);
    let (product, _) = frame::render_view(
        surface.canvas(),
        &view,
        &options(),
        &Affine::IDENTITY,
        &context,
    )
    .expect("valid effective-value frame");
    let pixels = read_pixels(&mut surface, W, H);
    let query = product.query();

    let x = 21;
    let y = 25;
    let offset = ((y * W + x) * 4) as usize;
    assert_eq!(&pixels[offset..offset + 4], [255, 255, 255, 255]);
    assert_ne!(
        query.hit_point(x as f32 + 0.5, y as f32 + 0.5),
        Some(child),
        "an empty clip cannot expose a descendant the raster hides"
    );
}

#[test]
fn fills_and_opacity_produce_paint_damage_without_geometry_changes() {
    let (document, rect) = simple_scene();
    let base_values = PropertyValues::default();
    let fill_values = value_set(
        &document,
        [(
            rect,
            PropertyKey::Fills,
            PropertyValue::Paints(Paints::solid("#DC2626".into())),
        )],
    );
    let opacity_values = value_set(
        &document,
        [(rect, PropertyKey::Opacity, PropertyValue::Number(0.35))],
    );

    let base_view = ValueView::new(&document, &base_values).unwrap();
    let fill_view = ValueView::new(&document, &fill_values).unwrap();
    let opacity_view = ValueView::new(&document, &opacity_values).unwrap();
    let context = PaintCtx::new(None);
    let base_product =
        frame::resolve_and_build_view(&base_view, &options(), &context).expect("valid base frame");
    let fill_product =
        frame::resolve_and_build_view(&fill_view, &options(), &context).expect("valid fill frame");
    let opacity_product = frame::resolve_and_build_view(&opacity_view, &options(), &context)
        .expect("valid opacity frame");
    assert!(resolved_bits_eq(
        base_product.resolved(),
        fill_product.resolved()
    ));
    assert!(resolved_bits_eq(
        base_product.resolved(),
        opacity_product.resolved()
    ));

    assert_changed_node(&diff_frame(&base_product, &fill_product), rect);
    assert_changed_node(&diff_frame(&base_product, &opacity_product), rect);
    assert!(matches!(
        opacity_product
            .drawlist()
            .items
            .first()
            .map(|item| &item.kind),
        Some(ItemKind::BeginOpacity { opacity }) if *opacity == 0.35
    ));

    assert_ne!(
        render_view(&document, &base_values),
        render_view(&document, &fill_values)
    );
}

#[test]
fn inserting_a_parent_opacity_scope_does_not_spuriously_damage_unchanged_children() {
    let mut builder = DocBuilder::new();
    let parent = builder.add(
        0,
        Header::new(SizeIntent::Fixed(80.0), SizeIntent::Fixed(60.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let child = builder.add(
        parent,
        Header::new(SizeIntent::Fixed(30.0), SizeIntent::Fixed(20.0)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );
    builder.node_mut(child).fills = Paints::solid("#2563EB".into());
    let document = builder.build();
    let values = value_set(
        &document,
        [(parent, PropertyKey::Opacity, PropertyValue::Number(0.5))],
    );
    let base_view = ValueView::base(&document);
    let opacity_view = ValueView::new(&document, &values).unwrap();
    let context = PaintCtx::new(None);
    let base_product =
        frame::resolve_and_build_view(&base_view, &options(), &context).expect("valid base frame");
    let opacity_product = frame::resolve_and_build_view(&opacity_view, &options(), &context)
        .expect("valid opacity frame");

    let damage = diff_frame(&base_product, &opacity_product);
    assert_eq!(damage.changed, vec![parent]);
    assert!(!damage.changed.contains(&child));
    assert!(damage.union_world.is_some());
}

#[test]
fn strokes_change_bounds_and_active_prunes_every_consumer() {
    let (document, rect) = simple_scene();
    let mut stroke = Stroke::default_for(&document.get(rect).payload).unwrap();
    stroke.paints = Paints::solid("#F59E0B".into());
    stroke.width = StrokeWidth::Uniform(10.0);
    stroke.align = StrokeAlign::Outside;
    let stroke_values = value_set(
        &document,
        [(
            rect,
            PropertyKey::Strokes,
            PropertyValue::Strokes(vec![stroke]),
        )],
    );
    let hidden_values = value_set(
        &document,
        [(rect, PropertyKey::Active, PropertyValue::Boolean(false))],
    );

    let base_view = ValueView::base(&document);
    let stroke_view = ValueView::new(&document, &stroke_values).unwrap();
    let hidden_view = ValueView::new(&document, &hidden_values).unwrap();
    let context = PaintCtx::new(None);
    let base_product =
        frame::resolve_and_build_view(&base_view, &options(), &context).expect("valid base frame");
    let stroke_product = frame::resolve_and_build_view(&stroke_view, &options(), &context)
        .expect("valid stroke frame");
    assert!(stroke_product.resolved().aabb_of(rect).w > base_product.resolved().aabb_of(rect).w);
    assert_changed_node(&diff_frame(&base_product, &stroke_product), rect);
    assert!(stroke_product
        .drawlist()
        .items
        .iter()
        .any(|item| matches!(item.kind, ItemKind::RectStroke { .. })));

    let hidden_product = frame::resolve_and_build_view(&hidden_view, &options(), &context)
        .expect("valid hidden frame");
    assert!(hidden_product.resolved().world_opt(rect).is_none());
    assert!(hidden_product.drawlist().items.is_empty());
    assert_eq!(
        hidden_product.query().hit_point(30.0, 35.0),
        Some(document.root),
        "only the viewport backdrop remains hittable"
    );
    assert_changed_node(&diff_frame(&base_product, &hidden_product), rect);
}
