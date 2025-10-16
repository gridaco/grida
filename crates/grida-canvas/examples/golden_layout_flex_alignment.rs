use cg::cg::types::*;
use cg::layout::tmp_example::{compute_flex_layout_for_container, ContainerWithStyle};
use cg::layout::{ComputedLayout, LayoutStyle};
use cg::node::schema::{ContainerNodeRec, Size as SchemaSize};
use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Rect};
use taffy::prelude::*;

fn create_container_with_alignment(
    id: &str,
    width: f32,
    height: f32,
    main_axis_alignment: MainAxisAlignment,
    cross_axis_alignment: CrossAxisAlignment,
) -> ContainerNodeRec {
    // Use a simple hash of the string as u64 ID
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    id.hash(&mut hasher);
    let id_u64 = hasher.finish();

    ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: math2::transform::AffineTransform::identity(),
        size: SchemaSize { width, height },
        corner_radius: RectangularCornerRadius::default(),
        fills: Paints::new([]),
        strokes: Paints::new([]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        stroke_dash_array: None,
        effects: cg::node::schema::LayerEffects::default(),
        clip: ContainerClipFlag::default(),
        layout_mode: LayoutMode::Flex,
        layout_direction: Axis::Horizontal,
        layout_wrap: LayoutWrap::NoWrap,
        layout_main_axis_alignment: main_axis_alignment,
        layout_cross_axis_alignment: cross_axis_alignment,
        padding: EdgeInsets::default(),
        layout_gap: LayoutGap::uniform(10.0),
    }
}

fn create_child_container(id: &str, width: f32, height: f32) -> ContainerNodeRec {
    // Use a simple hash of the string as u64 ID
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    id.hash(&mut hasher);
    let id_u64 = hasher.finish();

    ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: math2::transform::AffineTransform::identity(),
        size: SchemaSize { width, height },
        corner_radius: RectangularCornerRadius::default(),
        fills: Paints::new([]),
        strokes: Paints::new([]),
        stroke_width: 0.0,
        stroke_align: StrokeAlign::Center,
        stroke_dash_array: None,
        effects: cg::node::schema::LayerEffects::default(),
        clip: ContainerClipFlag::default(),
        layout_mode: LayoutMode::Normal,
        layout_direction: Axis::Horizontal,
        layout_wrap: LayoutWrap::NoWrap,
        layout_main_axis_alignment: MainAxisAlignment::Start,
        layout_cross_axis_alignment: CrossAxisAlignment::Start,
        padding: EdgeInsets::default(),
        layout_gap: LayoutGap::default(),
    }
}

fn main() {
    // Create a surface to draw on
    let (width, height) = (1400, 2400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Load font for labels
    let font_data = cg::fonts::embedded::geist::BYTES;
    let font_mgr = FontMgr::new();
    let typeface = font_mgr.new_from_data(font_data, None).unwrap();
    let label_font = Font::new(typeface.clone(), 14.0);
    let title_font = Font::new(typeface.clone(), 24.0);

    // Define colors for children
    let colors = [
        CGColor::from_rgb(239, 68, 68),  // red-500
        CGColor::from_rgb(59, 130, 246), // blue-500
        CGColor::from_rgb(34, 197, 94),  // green-500
    ];

    let start_x = 50.0;
    let mut current_y = 100.0;
    let scenario_spacing = 80.0;

    // Draw title
    let mut title_paint = Paint::default();
    title_paint.set_anti_alias(true);
    title_paint.set_color(Color::BLACK);
    canvas.draw_str(
        "Flex Layout Demo - Alignment Properties",
        skia_safe::Point::new(start_x, 50.0),
        &title_font,
        &title_paint,
    );

    // Main Axis Alignment Scenarios
    let main_axis_alignments = vec![
        (MainAxisAlignment::Start, "Start"),
        (MainAxisAlignment::Center, "Center"),
        (MainAxisAlignment::End, "End"),
        (MainAxisAlignment::SpaceBetween, "Space Between"),
        (MainAxisAlignment::SpaceAround, "Space Around"),
        (MainAxisAlignment::SpaceEvenly, "Space Evenly"),
    ];

    for (alignment, label) in main_axis_alignments {
        let container = ContainerWithStyle::from_container(create_container_with_alignment(
            &format!("main-{:?}", alignment),
            600.0,
            120.0,
            alignment,
            CrossAxisAlignment::Center,
        ))
        .with_layout(LayoutStyle {
            width: Dimension::length(600.0),
            height: Dimension::length(120.0),
            ..Default::default()
        });

        let children: Vec<ContainerWithStyle> = (0..3)
            .map(|i| {
                ContainerWithStyle::from_container(create_child_container(
                    &format!("child-main-{:?}-{}", alignment, i),
                    80.0,
                    80.0,
                ))
                .with_layout(LayoutStyle {
                    width: Dimension::length(80.0),
                    height: Dimension::length(80.0),
                    ..Default::default()
                })
            })
            .collect();

        let layouts = compute_flex_layout_for_container(&container, children.iter().collect());

        let height_used = render_scenario(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            &format!("Main Axis: {}", label),
            &label_font,
            600.0,
            &typeface,
        );

        current_y += height_used + scenario_spacing;
    }

    // Add separator
    current_y += 50.0;

    // Cross Axis Alignment Scenarios
    let cross_axis_alignments = vec![
        (CrossAxisAlignment::Start, "Start"),
        (CrossAxisAlignment::Center, "Center"),
        (CrossAxisAlignment::End, "End"),
        (CrossAxisAlignment::Stretch, "Stretch"),
    ];

    for (alignment, label) in cross_axis_alignments {
        let container = ContainerWithStyle::from_container(create_container_with_alignment(
            &format!("cross-{:?}", alignment),
            600.0,
            150.0,
            MainAxisAlignment::Start,
            alignment,
        ))
        .with_layout(LayoutStyle {
            width: Dimension::length(600.0),
            height: Dimension::length(150.0),
            ..Default::default()
        });

        let children: Vec<ContainerWithStyle> = vec![
            ContainerWithStyle::from_container(create_child_container("child-cross-1", 80.0, 60.0))
                .with_layout(LayoutStyle {
                    width: Dimension::length(80.0),
                    height: if matches!(alignment, CrossAxisAlignment::Stretch) {
                        Dimension::auto()
                    } else {
                        Dimension::length(60.0)
                    },
                    ..Default::default()
                }),
            ContainerWithStyle::from_container(create_child_container(
                "child-cross-2",
                80.0,
                100.0,
            ))
            .with_layout(LayoutStyle {
                width: Dimension::length(80.0),
                height: if matches!(alignment, CrossAxisAlignment::Stretch) {
                    Dimension::auto()
                } else {
                    Dimension::length(100.0)
                },
                ..Default::default()
            }),
            ContainerWithStyle::from_container(create_child_container("child-cross-3", 80.0, 80.0))
                .with_layout(LayoutStyle {
                    width: Dimension::length(80.0),
                    height: if matches!(alignment, CrossAxisAlignment::Stretch) {
                        Dimension::auto()
                    } else {
                        Dimension::length(80.0)
                    },
                    ..Default::default()
                }),
        ];

        let layouts = compute_flex_layout_for_container(&container, children.iter().collect());

        let height_used = render_scenario(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            &format!("Cross Axis: {}", label),
            &label_font,
            600.0,
            &typeface,
        );

        current_y += height_used + scenario_spacing;
    }

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/layout_flex_alignment.png", data.as_bytes()).unwrap();

    println!("✓ Generated goldens/layout_flex_alignment.png");
}

fn render_scenario(
    canvas: &skia_safe::Canvas,
    layouts: &[ComputedLayout],
    colors: &[CGColor],
    base_x: f32,
    base_y: f32,
    label: &str,
    label_font: &Font,
    container_width: f32,
    typeface: &skia_safe::Typeface,
) -> f32 {
    // Draw label
    let mut label_paint = Paint::default();
    label_paint.set_anti_alias(true);
    label_paint.set_color(Color::from_argb(255, 100, 100, 100));
    canvas.draw_str(
        label,
        skia_safe::Point::new(base_x, base_y - 10.0),
        label_font,
        &label_paint,
    );

    // Draw container outline
    let mut container_paint = Paint::default();
    container_paint.set_anti_alias(true);
    container_paint.set_color(Color::from_argb(100, 0, 0, 0));
    container_paint.set_style(skia_safe::PaintStyle::Stroke);
    container_paint.set_stroke_width(2.0);

    let max_height = layouts
        .iter()
        .map(|l| l.y + l.height)
        .max_by(|a, b| a.partial_cmp(b).unwrap())
        .unwrap_or(120.0);

    let container_rect = Rect::from_xywh(base_x, base_y, container_width, max_height);
    canvas.draw_rect(&container_rect, &container_paint);

    // Draw children
    for (i, layout) in layouts.iter().enumerate() {
        let color = colors[i % colors.len()];
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(Color::from_argb(color.a(), color.r(), color.g(), color.b()));

        let child_rect = Rect::from_xywh(
            base_x + layout.x,
            base_y + layout.y,
            layout.width,
            layout.height,
        );

        // Draw rounded rectangle
        let rrect = skia_safe::RRect::new_rect_radii(
            child_rect,
            &[
                skia_safe::Point::new(6.0, 6.0),
                skia_safe::Point::new(6.0, 6.0),
                skia_safe::Point::new(6.0, 6.0),
                skia_safe::Point::new(6.0, 6.0),
            ],
        );
        canvas.draw_rrect(&rrect, &paint);

        // Draw border
        let mut border_paint = Paint::default();
        border_paint.set_anti_alias(true);
        border_paint.set_color(Color::from_argb(80, 0, 0, 0));
        border_paint.set_style(skia_safe::PaintStyle::Stroke);
        border_paint.set_stroke_width(1.5);
        canvas.draw_rrect(&rrect, &border_paint);

        // Draw child number
        let font = Font::new(typeface.clone(), 16.0);
        let mut text_paint = Paint::default();
        text_paint.set_anti_alias(true);
        text_paint.set_color(Color::from_argb(255, 255, 255, 255));

        let text = format!("{}", i + 1);
        canvas.draw_str(
            &text,
            (
                base_x + layout.x + layout.width / 2.0 - 5.0,
                base_y + layout.y + layout.height / 2.0 + 5.0,
            ),
            &font,
            &text_paint,
        );
    }

    max_height + 20.0
}
