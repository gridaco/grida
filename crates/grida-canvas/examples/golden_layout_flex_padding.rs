use cg::cg::types::*;
use cg::layout::tmp_example::{compute_flex_layout_for_container, ContainerWithStyle};
use cg::layout::LayoutStyle;
use cg::node::schema::{ContainerNodeRec, Size};
use skia_safe::{Canvas, Color, Font, Paint, Rect};
use taffy::prelude::*;

fn main() {
    // Create a surface for rendering
    let mut surface = skia_safe::surfaces::raster_n32_premul((800, 600)).unwrap();
    let canvas = surface.canvas();

    // Clear background
    canvas.clear(Color::from_argb(255, 255, 255, 255));

    // Create base container
    let base_container = ContainerNodeRec {
        name: Some("Demo Container".to_string()),
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: math2::transform::AffineTransform::identity(),
        size: Size {
            width: 400.0,
            height: 200.0,
        },
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
        padding: EdgeInsets {
            left: 20.0,
            right: 20.0,
            top: 20.0,
            bottom: 20.0,
        },
        layout_gap: LayoutGap {
            main_axis_gap: 10.0,
            cross_axis_gap: 10.0,
        },
    };

    // Create container with layout style
    let container_with_style =
        ContainerWithStyle::from_container(base_container).with_layout(LayoutStyle {
            width: Dimension::length(400.0),
            height: Dimension::length(200.0),
            flex_grow: 0.0,
        });

    // Create child containers
    let child_containers = vec![
        create_child_container("child-1", 100.0, 80.0),
        create_child_container("child-2", 100.0, 80.0),
        create_child_container("child-3", 100.0, 80.0),
        create_child_container("child-4", 100.0, 80.0),
    ];

    // Create children with layout styles
    let children_with_styles: Vec<ContainerWithStyle> = child_containers
        .into_iter()
        .map(|child| {
            ContainerWithStyle::from_container(child).with_layout(LayoutStyle {
                width: Dimension::length(100.0),
                height: Dimension::length(80.0),
                flex_grow: 1.0,
                ..Default::default()
            })
        })
        .collect();

    // Compute layout
    let layouts = compute_flex_layout_for_container(
        &container_with_style,
        children_with_styles.iter().collect(),
    );

    // Render the demo
    render_demo(
        canvas,
        &container_with_style,
        &children_with_styles,
        &layouts,
    );

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/layout_flex_padding.png", data.as_bytes()).unwrap();

    println!("✓ Generated goldens/layout_flex_padding.png");
}

fn create_child_container(id: &str, width: f32, height: f32) -> ContainerNodeRec {
    // Use a simple hash of the string as u64 ID
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    id.hash(&mut hasher);
    let id_u64 = hasher.finish();

    ContainerNodeRec {
        name: Some(format!("Child {}", id)),
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        transform: math2::transform::AffineTransform::identity(),
        size: Size { width, height },
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

fn render_demo(
    canvas: &Canvas,
    container: &ContainerWithStyle,
    children: &[ContainerWithStyle],
    layouts: &[cg::layout::ComputedLayout],
) {
    let base_x = 50.0;
    let base_y = 50.0;

    // Draw container outline
    let mut container_paint = Paint::default();
    container_paint.set_anti_alias(true);
    container_paint.set_color(Color::from_argb(100, 0, 0, 0));
    container_paint.set_style(skia_safe::PaintStyle::Stroke);
    container_paint.set_stroke_width(2.0);

    let container_rect = Rect::from_xywh(
        base_x,
        base_y,
        container.available_size().0,
        container.available_size().1,
    );
    canvas.draw_rect(&container_rect, &container_paint);

    // Draw padding area
    let mut padding_paint = Paint::default();
    padding_paint.set_anti_alias(true);
    padding_paint.set_color(Color::from_argb(50, 0, 0, 255));
    padding_paint.set_style(skia_safe::PaintStyle::Fill);

    let padding_rect = Rect::from_xywh(
        base_x + 20.0,                       // padding left
        base_y + 20.0,                       // padding top
        container.available_size().0 - 40.0, // width - padding
        container.available_size().1 - 40.0, // height - padding
    );
    canvas.draw_rect(&padding_rect, &padding_paint);

    // Draw children
    let colors = [
        Color::from_argb(200, 255, 0, 0),   // Red
        Color::from_argb(200, 0, 255, 0),   // Green
        Color::from_argb(200, 0, 0, 255),   // Blue
        Color::from_argb(200, 255, 255, 0), // Yellow
    ];

    for (i, layout) in layouts.iter().enumerate() {
        let color = colors[i % colors.len()];
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(color);

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
        let typeface = cg::fonts::embedded::TYPEFACE_GEISTMONO.with(|t| t.clone());
        let font = Font::new(typeface, 16.0);
        let mut text_paint = Paint::default();
        text_paint.set_anti_alias(true);
        text_paint.set_color(Color::from_argb(255, 0, 0, 0));

        let text = format!("{}", i + 1);
        canvas.draw_str(
            &text,
            (base_x + layout.x + 5.0, base_y + layout.y + 20.0),
            &font,
            &text_paint,
        );
    }

    // Draw title
    let typeface = cg::fonts::embedded::TYPEFACE_GEISTMONO.with(|t| t.clone());
    let title_font = Font::new(typeface, 20.0);
    let mut title_paint = Paint::default();
    title_paint.set_anti_alias(true);
    title_paint.set_color(Color::from_argb(255, 0, 0, 0));

    canvas.draw_str(
        "ContainerWithStyle Demo - Flex Layout with Padding",
        (base_x, base_y - 30.0),
        &title_font,
        &title_paint,
    );
}
