use cg::cg::types::*;
use cg::layout::tmp_example::{compute_flex_layout_for_container, ContainerWithStyle};
use cg::layout::{ComputedLayout, LayoutStyle};
use cg::node::schema::{ContainerNodeRec, Size as SchemaSize};
use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Rect};
use taffy::prelude::*;

fn create_container(id: &str, width: f32, height: f32) -> ContainerNodeRec {
    create_container_with_gap(id, width, height, 10.0)
}

fn create_container_with_gap(id: &str, width: f32, height: f32, gap: f32) -> ContainerNodeRec {
    // Use a simple hash of the string as u64 ID
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    id.hash(&mut hasher);
    let id_u64 = hasher.finish();

    ContainerNodeRec {
        name: Some(format!("Container {}", id)),
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
        layout_wrap: LayoutWrap::Wrap,
        layout_main_axis_alignment: MainAxisAlignment::Start,
        layout_cross_axis_alignment: CrossAxisAlignment::Start,
        padding: EdgeInsets::default(),
        layout_gap: LayoutGap {
            main_axis_gap: gap,
            cross_axis_gap: gap,
        },
    }
}

fn main() {
    // Create a surface to draw on
    let (width, height) = (1200, 1800);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Load font for labels
    let font_data = cg::fonts::embedded::geist::BYTES;
    let font_mgr = FontMgr::new();
    let typeface = font_mgr.new_from_data(font_data, None).unwrap();
    let label_font = Font::new(typeface.clone(), 16.0);
    let title_font = Font::new(typeface.clone(), 24.0);

    // Define colors for children (cycling through)
    let colors = [
        CGColor::from_rgb(239, 68, 68),  // red-500
        CGColor::from_rgb(59, 130, 246), // blue-500
        CGColor::from_rgb(34, 197, 94),  // green-500
        CGColor::from_rgb(234, 179, 8),  // yellow-500
        CGColor::from_rgb(168, 85, 247), // purple-500
        CGColor::from_rgb(236, 72, 153), // pink-500
    ];

    let start_x = 50.0;
    let mut current_y = 100.0;
    let scenario_spacing = 50.0; // Base spacing between scenarios

    // Draw title
    let mut title_paint = Paint::default();
    title_paint.set_anti_alias(true);
    title_paint.set_color(Color::BLACK);
    canvas.draw_str(
        "Flex Layout Demo - Row with Wrap",
        skia_safe::Point::new(start_x, 50.0),
        &title_font,
        &title_paint,
    );

    // Scenario 1: Wide container (800px) - No wrap expected
    {
        let container =
            ContainerWithStyle::from_container(create_container("scenario-1", 800.0, 200.0))
                .with_layout(LayoutStyle {
                    width: Dimension::length(800.0),
                    height: Dimension::auto(),
                    flex_grow: 0.0,
                });

        let children: Vec<ContainerWithStyle> = (0..6)
            .map(|i| {
                ContainerWithStyle::from_container(create_container(
                    &format!("child-1-{}", i),
                    100.0,
                    100.0,
                ))
                .with_layout(LayoutStyle {
                    width: Dimension::length(100.0),
                    height: Dimension::length(100.0),
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
            "Scenario 1: Wide Container (800px) - No Wrap",
            &label_font,
            800.0,
            &typeface,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 2: Medium container (400px) - Partial wrap
    {
        let container =
            ContainerWithStyle::from_container(create_container("scenario-2", 400.0, 300.0))
                .with_layout(LayoutStyle {
                    width: Dimension::length(400.0),
                    height: Dimension::auto(),
                    flex_grow: 0.0,
                });

        let children: Vec<ContainerWithStyle> = (0..6)
            .map(|i| {
                ContainerWithStyle::from_container(create_container(
                    &format!("child-2-{}", i),
                    100.0,
                    100.0,
                ))
                .with_layout(LayoutStyle {
                    width: Dimension::length(100.0),
                    height: Dimension::length(100.0),
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
            "Scenario 2: Medium Container (400px) - Partial Wrap",
            &label_font,
            400.0,
            &typeface,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 3: Narrow container (250px) - Heavy wrap
    {
        let container =
            ContainerWithStyle::from_container(create_container("scenario-3", 250.0, 700.0))
                .with_layout(LayoutStyle {
                    width: Dimension::length(250.0),
                    height: Dimension::auto(),
                    flex_grow: 0.0,
                });

        let children: Vec<ContainerWithStyle> = (0..6)
            .map(|i| {
                ContainerWithStyle::from_container(create_container(
                    &format!("child-3-{}", i),
                    100.0,
                    100.0,
                ))
                .with_layout(LayoutStyle {
                    width: Dimension::length(100.0),
                    height: Dimension::length(100.0),
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
            "Scenario 3: Narrow Container (250px) - Heavy Wrap",
            &label_font,
            250.0,
            &typeface,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 4: Different child sizes in medium container
    {
        let container =
            ContainerWithStyle::from_container(create_container("scenario-4", 500.0, 300.0))
                .with_layout(LayoutStyle {
                    width: Dimension::length(500.0),
                    height: Dimension::auto(),
                    flex_grow: 0.0,
                });

        let child_sizes = vec![
            (80.0, 80.0),
            (120.0, 100.0),
            (100.0, 60.0),
            (150.0, 80.0),
            (90.0, 90.0),
            (110.0, 70.0),
        ];

        let children: Vec<ContainerWithStyle> = child_sizes
            .iter()
            .enumerate()
            .map(|(i, (w, h))| {
                ContainerWithStyle::from_container(create_container(
                    &format!("child-4-{}", i),
                    *w,
                    *h,
                ))
                .with_layout(LayoutStyle {
                    width: Dimension::length(*w),
                    height: Dimension::length(*h),
                    ..Default::default()
                })
            })
            .collect();

        let layouts = compute_flex_layout_for_container(&container, children.iter().collect());

        let _height_used = render_scenario(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            "Scenario 4: Medium Container (500px) - Different Child Sizes",
            &label_font,
            500.0,
            &typeface,
        );
    }

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/layout_flex.png"),
        data.as_bytes(),
    )
    .unwrap();

    println!("✓ Generated goldens/layout_flex.png");
}

/// Render a single layout scenario and return the total height used
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
    label_paint.set_color(Color::from_argb(180, 0, 0, 0));
    canvas.draw_str(
        label,
        skia_safe::Point::new(base_x, base_y - 10.0),
        label_font,
        &label_paint,
    );

    // Draw container outline
    let mut container_paint = Paint::default();
    container_paint.set_anti_alias(true);
    container_paint.set_color(Color::from_argb(40, 0, 0, 0));
    container_paint.set_style(skia_safe::PaintStyle::Stroke);
    container_paint.set_stroke_width(2.0);

    // Find max Y to determine container height
    let max_height = layouts
        .iter()
        .map(|l| l.y + l.height)
        .max_by(|a, b| a.partial_cmp(b).unwrap())
        .unwrap_or(0.0);

    let container_rect = Rect::from_xywh(base_x, base_y + 10.0, container_width, max_height + 10.0);
    canvas.draw_rect(&container_rect, &container_paint);

    // Draw each child
    for (i, layout) in layouts.iter().enumerate() {
        let color = colors[i % colors.len()];
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from(color));

        let child_rect = Rect::from_xywh(
            base_x + layout.x,
            base_y + 10.0 + layout.y,
            layout.width,
            layout.height,
        );

        // Draw rounded rectangle
        let rrect = skia_safe::RRect::new_rect_radii(
            child_rect,
            &[
                skia_safe::Point::new(8.0, 8.0),
                skia_safe::Point::new(8.0, 8.0),
                skia_safe::Point::new(8.0, 8.0),
                skia_safe::Point::new(8.0, 8.0),
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

        // Draw child index
        let mut index_paint = Paint::default();
        index_paint.set_anti_alias(true);
        index_paint.set_color(Color::WHITE);
        let index_font = Font::new(typeface.clone(), 14.0);
        canvas.draw_str(
            &format!("{}", i + 1),
            skia_safe::Point::new(
                base_x + layout.x + layout.width / 2.0 - 5.0,
                base_y + 10.0 + layout.y + layout.height / 2.0 + 5.0,
            ),
            &index_font,
            &index_paint,
        );
    }

    // Calculate and return the total height used by this scenario
    let max_height = layouts
        .iter()
        .map(|l| l.y + l.height)
        .max_by(|a, b| a.partial_cmp(b).unwrap())
        .unwrap_or(0.0);

    // Return total height: label space + container padding + content height + bottom padding
    20.0 + 20.0 + max_height + 20.0
}
