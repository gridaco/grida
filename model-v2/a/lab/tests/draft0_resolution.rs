//! Focused Draft 0 resolution regressions: text measurement order, flex
//! stretch intent, and stroke-aware visual bounds.

mod common;
use common::*;

use anchor_lab::math::RectF;
use anchor_lab::model::*;

fn text_node(
    width: SizeIntent,
    min_width: Option<f32>,
    max_width: Option<f32>,
) -> (Document, NodeId) {
    let mut builder = DocBuilder::new();
    let mut header = Header::new(width, SizeIntent::Auto);
    header.min_width = min_width;
    header.max_width = max_width;
    let text = builder.add(
        0,
        header,
        Payload::Text {
            content: "aa bb cc".into(),
            font_size: 10.0,
        },
    );
    (builder.build(), text)
}

#[test]
fn text_auto_height_remeasures_at_the_final_constrained_width() {
    let cases = [
        (SizeIntent::Auto, None, Some(30.0), 30.0, 24.0),
        (SizeIntent::Auto, Some(60.0), None, 60.0, 12.0),
        (SizeIntent::Fixed(60.0), None, Some(30.0), 30.0, 24.0),
        (SizeIntent::Fixed(30.0), Some(60.0), None, 60.0, 12.0),
    ];

    for (width, min_width, max_width, expected_width, expected_height) in cases {
        let (doc, text) = text_node(width, min_width, max_width);
        let resolved = run(&doc);
        assert_close(resolved.box_of(text).w, expected_width, "final text width");
        assert_close(
            resolved.box_of(text).h,
            expected_height,
            "height measured from final width",
        );
    }
}

#[test]
fn explicit_line_breaks_contribute_to_auto_text_extents() {
    let mut builder = DocBuilder::new();
    let text = builder.add(
        0,
        Header::new(SizeIntent::Auto, SizeIntent::Auto),
        Payload::Text {
            content: "a\nbb\n".into(),
            font_size: 10.0,
        },
    );
    let resolved = run(&builder.build());
    assert_close(resolved.box_of(text).w, 12.0, "widest explicit line");
    assert_close(
        resolved.box_of(text).h,
        36.0,
        "trailing empty line is preserved",
    );
}

fn column_flex(cross_align: CrossAlign) -> Payload {
    Payload::Frame {
        layout: LayoutBehavior {
            mode: LayoutMode::Flex,
            direction: Direction::Column,
            cross_align,
            ..Default::default()
        },
        clips_content: false,
    }
}

#[test]
fn container_cross_stretch_reads_authored_auto_for_ordinary_children() {
    let mut builder = DocBuilder::new();
    let container = builder.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(100.0)),
        column_flex(CrossAlign::Stretch),
    );
    let auto = builder.add(
        container,
        Header::new(SizeIntent::Auto, SizeIntent::Fixed(20.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );
    let fixed = builder.add(
        container,
        Header::new(SizeIntent::Fixed(30.0), SizeIntent::Fixed(20.0)),
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: false,
        },
    );

    let resolved = run(&builder.build());
    assert_close(resolved.box_of(auto).w, 100.0, "auto cross size stretches");
    assert_close(
        resolved.box_of(fixed).w,
        30.0,
        "container stretch preserves fixed cross size",
    );
}

#[test]
fn child_align_stretch_overrides_fixed_text_cross_size() {
    let mut builder = DocBuilder::new();
    let container = builder.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(100.0)),
        column_flex(CrossAlign::Start),
    );
    let mut header = Header::new(SizeIntent::Fixed(30.0), SizeIntent::Auto);
    header.self_align = SelfAlign::Stretch;
    let text = builder.add(
        container,
        header,
        Payload::Text {
            content: "aaaa bbbb cccc".into(),
            font_size: 10.0,
        },
    );

    let resolved = run(&builder.build());
    assert_close(resolved.box_of(text).w, 100.0, "explicit text stretch");
    assert_close(
        resolved.box_of(text).h,
        12.0,
        "text remeasures at stretched width",
    );
}

#[test]
fn row_flex_self_stretch_preserves_the_lines_locked_zero_height() {
    let mut builder = DocBuilder::new();
    let container = builder.add(
        0,
        Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(80.0)),
        Payload::Frame {
            layout: LayoutBehavior {
                mode: LayoutMode::Flex,
                direction: Direction::Row,
                ..Default::default()
            },
            clips_content: false,
        },
    );
    let payload = Payload::Shape {
        desc: ShapeDesc::Line,
    };
    let mut header = Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(0.0));
    header.self_align = SelfAlign::Stretch;
    let line = builder.add(container, header, payload.clone());
    let mut stroke = Stroke::default_for(&payload).unwrap();
    stroke.width = StrokeWidth::Uniform(10.0);
    stroke.paints = Paints::solid(Color::BLACK);
    builder.node_mut(line).strokes.push(stroke);

    let resolved = run(&builder.build());
    assert_close(
        resolved.box_of(line).h,
        0.0,
        "flex cannot rewrite locked line height",
    );
    assert_close(
        resolved.aabb_of(line).h,
        10.0,
        "the line keeps a degenerate paint box plus stroke coverage",
    );
}

fn stroked_shape(desc: ShapeDesc, align: StrokeAlign, width: f32) -> (Document, NodeId) {
    let mut builder = DocBuilder::new();
    let mut header = Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(50.0));
    header.x = AxisBinding::start(10.0);
    header.y = AxisBinding::start(20.0);
    if desc == ShapeDesc::Line {
        header.height = SizeIntent::Fixed(0.0);
    }
    let payload = Payload::Shape { desc };
    let mut stroke = Stroke::default_for(&payload).expect("shape supports strokes");
    stroke.paints = Paints::solid(Color::BLACK);
    stroke.width = StrokeWidth::Uniform(width);
    stroke.align = align;
    let shape = builder.add(0, header, payload);
    builder.node_mut(shape).strokes.push(stroke);
    (builder.build(), shape)
}

#[test]
fn effective_strokes_expand_visual_bounds_without_changing_layout_bounds() {
    let cases = [
        (StrokeAlign::Inside, (10.0, 20.0, 100.0, 50.0)),
        (StrokeAlign::Center, (5.0, 15.0, 110.0, 60.0)),
        (StrokeAlign::Outside, (0.0, 10.0, 120.0, 70.0)),
    ];

    for (align, (x, y, width, height)) in cases {
        let (doc, shape) = stroked_shape(ShapeDesc::Rect, align, 10.0);
        let resolved = run(&doc);
        assert_rect(
            resolved.box_of(shape),
            10.0,
            20.0,
            100.0,
            50.0,
            "stroke does not affect layout box",
        );
        assert_rect(
            resolved.aabb_of(shape),
            x,
            y,
            width,
            height,
            "stroke expands visual bounds",
        );
    }
}

#[test]
fn per_side_strokes_expand_each_visual_bound_independently() {
    let (mut doc, shape) = stroked_shape(ShapeDesc::Rect, StrokeAlign::Outside, 1.0);
    doc.get_mut(shape).strokes[0].width = StrokeWidth::Rectangular(RectangularStrokeWidth {
        stroke_top_width: 2.0,
        stroke_right_width: 4.0,
        stroke_bottom_width: 6.0,
        stroke_left_width: 8.0,
    });

    let resolved = run(&doc);
    assert_rect(
        resolved.box_of(shape),
        10.0,
        20.0,
        100.0,
        50.0,
        "per-side stroke does not affect layout box",
    );
    assert_rect(
        resolved.aabb_of(shape),
        2.0,
        18.0,
        112.0,
        58.0,
        "per-side stroke contributes asymmetric visual outsets",
    );
}

#[test]
fn unsupported_rectangular_stroke_states_do_not_expand_visual_bounds() {
    let cases = [ShapeDesc::Ellipse, ShapeDesc::Rect];
    for desc in cases {
        let (mut doc, shape) = stroked_shape(desc, StrokeAlign::Outside, 1.0);
        doc.get_mut(shape).strokes[0].width = StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 2.0,
            stroke_right_width: 4.0,
            stroke_bottom_width: 6.0,
            stroke_left_width: 8.0,
        });
        if desc == ShapeDesc::Rect {
            doc.get_mut(shape).corner_smoothing = CornerSmoothing(0.5);
        }

        let resolved = run(&doc);
        assert_rect(
            resolved.aabb_of(shape),
            10.0,
            20.0,
            100.0,
            50.0,
            "unsupported rectangular stroke state has no visual coverage",
        );
    }
}

#[test]
fn stroke_expansion_is_transformed_with_the_node() {
    let (mut doc, shape) = stroked_shape(ShapeDesc::Rect, StrokeAlign::Outside, 10.0);
    doc.get_mut(shape).header.rotation = 90.0;
    let resolved = run(&doc);
    assert_rect(
        resolved.aabb_of(shape),
        25.0,
        -15.0,
        70.0,
        120.0,
        "expanded local stroke bounds rotate into world bounds",
    );
}

#[test]
fn line_stroke_bounds_expand_conservatively_around_the_degenerate_axis() {
    let (doc, line) = stroked_shape(ShapeDesc::Line, StrokeAlign::Center, 10.0);
    let resolved = run(&doc);
    assert_rect(
        resolved.box_of(line),
        10.0,
        20.0,
        100.0,
        0.0,
        "line layout box remains degenerate",
    );
    assert_rect(
        resolved.aabb_of(line),
        5.0,
        15.0,
        110.0,
        10.0,
        "line caps and width fit conservative bounds",
    );
}

#[test]
fn text_miter_limit_is_included_in_conservative_visual_bounds() {
    let mut builder = DocBuilder::new();
    let mut header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
    header.x = AxisBinding::start(20.0);
    header.y = AxisBinding::start(20.0);
    let payload = Payload::Text {
        content: "A".into(),
        font_size: 10.0,
    };
    let text = builder.add(0, header, payload.clone());
    let mut stroke = Stroke::default_for(&payload).unwrap();
    stroke.paints = Paints::solid(Color::BLACK);
    stroke.width = StrokeWidth::Uniform(2.0);
    stroke.align = StrokeAlign::Center;
    builder.node_mut(text).strokes.push(stroke);

    let resolved = run(&builder.build());
    assert_rect(
        resolved.aabb_of(text),
        16.0,
        16.0,
        14.0,
        20.0,
        "text miter extent is conservatively bounded",
    );
}

#[test]
fn ineffective_strokes_do_not_expand_visual_bounds() {
    let (mut doc, shape) = stroked_shape(ShapeDesc::Rect, StrokeAlign::Outside, 10.0);
    let stroke = &mut doc.get_mut(shape).strokes[0];
    stroke.paints = Paints::solid(Color::TRANSPARENT);
    let resolved = run(&doc);
    assert_rect(
        resolved.aabb_of(shape),
        10.0,
        20.0,
        100.0,
        50.0,
        "transparent stroke has no visual extent",
    );

    doc.get_mut(shape).strokes[0].paints = Paints::solid(Color::BLACK);
    doc.get_mut(shape).strokes[0].width = StrokeWidth::None;
    let resolved = run(&doc);
    assert_rect(
        resolved.aabb_of(shape),
        10.0,
        20.0,
        100.0,
        50.0,
        "zero-width stroke has no visual extent",
    );
}

#[test]
fn transformed_clip_bounds_exclude_outside_descendant_contributions() {
    let mut builder = DocBuilder::new();
    let mut clip_header = Header::new(SizeIntent::Fixed(100.0), SizeIntent::Fixed(60.0));
    clip_header.x = AxisBinding::start(200.0);
    clip_header.y = AxisBinding::start(100.0);
    clip_header.rotation = 90.0;
    let clip = builder.add(
        0,
        clip_header,
        Payload::Frame {
            layout: LayoutBehavior::default(),
            clips_content: true,
        },
    );
    let mut child_header = Header::new(SizeIntent::Fixed(20.0), SizeIntent::Fixed(20.0));
    child_header.x = AxisBinding::start(150.0);
    child_header.y = AxisBinding::start(10.0);
    let child = builder.add(
        clip,
        child_header,
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    );

    let resolved = run(&builder.build());
    let clip_world_aabb = RectF {
        x: 0.0,
        y: 0.0,
        w: 100.0,
        h: 60.0,
    }
    .transformed_aabb(&resolved.world_of(clip));
    assert_eq!(
        resolved.aabb_of(clip),
        clip_world_aabb,
        "a clipped-out child cannot enlarge its ancestor's visual bounds"
    );
    assert_eq!(
        resolved.aabb_of(child),
        RectF {
            x: 250.0,
            y: 230.0,
            w: 20.0,
            h: 20.0,
        },
        "the child's own conservative AABB remains independently readable"
    );
}
