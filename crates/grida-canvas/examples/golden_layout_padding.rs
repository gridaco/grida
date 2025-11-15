use cg::cg::prelude::*;
use cg::layout::engine::LayoutEngine;
use cg::layout::ComputedLayout;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Rect};

fn create_container(id: &str, width: f32, height: f32) -> ContainerNodeRec {
    create_container_with_padding(id, width, height, 0.0)
}

fn create_container_with_padding(
    id: &str,
    width: f32,
    height: f32,
    padding: f32,
) -> ContainerNodeRec {
    // Use a simple hash of the string as u64 ID
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    id.hash(&mut hasher);
    let _ = hasher.finish(); // Generate ID but don't store it since it's not used

    ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: Default::default(),
        corner_radius: Default::default(),
        corner_smoothing: Default::default(),
        fills: Default::default(),
        strokes: Default::default(),
        stroke_style: StrokeStyle {
            stroke_align: StrokeAlign::Center,
            stroke_cap: StrokeCap::default(),
            stroke_join: StrokeJoin::default(),
            stroke_miter_limit: StrokeMiterLimit::default(),
            stroke_dash_array: None,
        },
        stroke_width: Default::default(),
        effects: Default::default(),
        clip: Default::default(),
        layout_container: LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_wrap: Some(LayoutWrap::NoWrap),
            layout_main_axis_alignment: Some(MainAxisAlignment::Start),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Start),
            layout_padding: Some(EdgeInsets {
                left: padding,
                right: padding,
                top: padding,
                bottom: padding,
            }),
            layout_gap: None,
        },
        layout_dimensions: LayoutDimensionStyle {
            width: Some(width),
            height: Some(height),
            min_width: None,
            max_width: None,
            min_height: None,
            max_height: None,
        },
        layout_child: None,
    }
}

/// Build scene and compute layout using production pipeline
fn compute_layout_with_production_pipeline(
    icb_config: ContainerNodeRec,
    children: Vec<ContainerNodeRec>,
    viewport_size: Size,
) -> Vec<ComputedLayout> {
    let mut graph = SceneGraph::new();

    // Create ICB from config (convert to InitialContainer)
    let icb = cg::node::schema::InitialContainerNodeRec {
        active: icb_config.active,
        layout_mode: icb_config.layout_container.layout_mode,
        layout_direction: icb_config.layout_container.layout_direction,
        layout_wrap: icb_config
            .layout_container
            .layout_wrap
            .unwrap_or(LayoutWrap::NoWrap),
        layout_main_axis_alignment: icb_config
            .layout_container
            .layout_main_axis_alignment
            .unwrap_or(MainAxisAlignment::Start),
        layout_cross_axis_alignment: icb_config
            .layout_container
            .layout_cross_axis_alignment
            .unwrap_or(CrossAxisAlignment::Start),
        padding: icb_config
            .layout_container
            .layout_padding
            .unwrap_or(EdgeInsets::default()),
        layout_gap: icb_config
            .layout_container
            .layout_gap
            .unwrap_or(LayoutGap::default()),
    };
    let icb_id = graph.append_child(Node::InitialContainer(icb), Parent::Root);

    // Add children with Inset location for flex layout
    for child in children {
        // Position is now handled by layout field
        graph.append_child(Node::Container(child), Parent::NodeId(icb_id));
    }

    // Compute layout
    let scene = Scene {
        name: String::new(),
        graph,
        background_color: None,
    };
    let mut layout_engine = LayoutEngine::new();
    let layout_result = layout_engine.compute(&scene, viewport_size);

    // Extract layouts
    let children_ids = scene.graph.get_children(&icb_id).unwrap();
    children_ids
        .iter()
        .map(|id| layout_result.get(id).cloned().unwrap())
        .collect()
}

fn main() {
    // Create a surface to draw on
    let (width, height) = (1400, 2000);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Load font for labels
    let font_data = cg::fonts::embedded::geist::BYTES;
    let font_mgr = FontMgr::new();
    let typeface = font_mgr.new_from_data(font_data, None).unwrap();
    let label_font = Font::new(typeface.clone(), 14.0);
    let title_font = Font::new(typeface.clone(), 24.0);
    let small_font = Font::new(typeface.clone(), 12.0);

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
        "Flex Layout Demo - Padding Behavior",
        skia_safe::Point::new(start_x, 50.0),
        &title_font,
        &title_paint,
    );

    // Scenario 1: Fixed container + No padding + Fixed children
    {
        let container = create_container("scenario-1", 400.0, 120.0);

        let children: Vec<ContainerNodeRec> = (0..4)
            .map(|i| create_container(&format!("child-1-{}", i), 80.0, 80.0))
            .collect();

        let layouts = compute_layout_with_production_pipeline(
            container,
            children,
            Size {
                width: 400.0,
                height: 120.0,
            },
        );

        let height_used = render_scenario(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            "Scenario 1: Fixed Container (400px) + No Padding + Fixed Children (80px)",
            &label_font,
            400.0,
            &typeface,
            &small_font,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 2: Fixed container + Padding + Fixed children
    {
        let container = create_container_with_padding("scenario-2", 400.0, 120.0, 20.0);

        let children: Vec<ContainerNodeRec> = (0..4)
            .map(|i| create_container(&format!("child-2-{}", i), 80.0, 80.0))
            .collect();

        let layouts = compute_layout_with_production_pipeline(
            container,
            children,
            Size {
                width: 400.0,
                height: 120.0,
            },
        );

        let _height_used = render_scenario_with_padding(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            "Scenario 2: Fixed Container (400px) + Padding (20px) + Fixed Children (80px)",
            &label_font,
            400.0,
            &typeface,
            &small_font,
            20.0, // padding
        );

        current_y += _height_used + scenario_spacing;
    }

    // Scenario 3: Auto container + No padding + Fixed children
    {
        let container = create_container("scenario-3", 320.0, 80.0);

        let children: Vec<ContainerNodeRec> = (0..4)
            .map(|i| create_container(&format!("child-3-{}", i), 80.0, 80.0))
            .collect();

        let layouts = compute_layout_with_production_pipeline(
            container,
            children,
            Size {
                width: 320.0,
                height: 80.0,
            },
        );

        let _height_used = render_scenario(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            "Scenario 3: Auto Container + No Padding + Fixed Children (80px)",
            &label_font,
            320.0, // 4 * 80px
            &typeface,
            &small_font,
        );

        current_y += _height_used + scenario_spacing;
    }

    // Scenario 4: Auto container + Padding + Fixed children
    {
        let container = create_container_with_padding("scenario-4", 360.0, 120.0, 20.0);

        let children: Vec<ContainerNodeRec> = (0..4)
            .map(|i| create_container(&format!("child-4-{}", i), 80.0, 80.0))
            .collect();

        let layouts = compute_layout_with_production_pipeline(
            container,
            children,
            Size {
                width: 360.0,
                height: 120.0,
            },
        );

        let height_used = render_scenario_with_padding(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            "Scenario 4: Auto Container + Padding (20px) + Fixed Children (80px)",
            &label_font,
            360.0, // 4 * 80px + 2 * 20px padding
            &typeface,
            &small_font,
            20.0, // padding
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 5: Fixed container + No padding + Flexible children
    {
        let container = create_container("scenario-5", 400.0, 120.0);

        let children: Vec<ContainerNodeRec> = (0..4)
            .map(|i| create_container(&format!("child-5-{}", i), 100.0, 80.0))
            .collect();

        let layouts = compute_layout_with_production_pipeline(
            container,
            children,
            Size {
                width: 400.0,
                height: 120.0,
            },
        );

        let height_used = render_scenario(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            "Scenario 5: Fixed Container (400px) + No Padding + Flexible Children (auto width)",
            &label_font,
            400.0,
            &typeface,
            &small_font,
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 6: Fixed container + Padding + Flexible children
    {
        let container = create_container_with_padding("scenario-6", 400.0, 120.0, 20.0);

        let children: Vec<ContainerNodeRec> = (0..4)
            .map(|i| create_container(&format!("child-6-{}", i), 90.0, 80.0))
            .collect();

        let layouts = compute_layout_with_production_pipeline(
            container,
            children,
            Size {
                width: 400.0,
                height: 120.0,
            },
        );

        let height_used = render_scenario_with_padding(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            "Scenario 6: Fixed Container (400px) + Padding (20px) + Flexible Children (auto width)",
            &label_font,
            400.0,
            &typeface,
            &small_font,
            20.0, // padding
        );

        current_y += height_used + scenario_spacing;
    }

    // Scenario 7: Mixed children (fixed + flexible) + padding
    {
        let container = create_container_with_padding("scenario-7", 500.0, 120.0, 20.0);

        let child_configs = vec![
            (100.0, 80.0, false), // Fixed
            (120.0, 80.0, true),  // Flexible
            (80.0, 80.0, false),  // Fixed
            (120.0, 80.0, true),  // Flexible
        ];

        let children: Vec<ContainerNodeRec> = child_configs
            .iter()
            .enumerate()
            .map(|(i, (w, h, flexible))| {
                let mut container = create_container(&format!("child-7-{}", i), *w, *h);
                if *flexible {
                    // Auto width to allow flex-grow - set width to None to indicate auto
                    container.layout_dimensions.width = None;
                    container.layout_child = Some(LayoutChildStyle {
                        layout_grow: 1.0,
                        layout_positioning: LayoutPositioning::Auto,
                    });
                }
                container
            })
            .collect();

        let layouts = compute_layout_with_production_pipeline(
            container,
            children,
            Size {
                width: 500.0,
                height: 120.0,
            },
        );

        let _height_used = render_scenario_with_padding(
            canvas,
            &layouts,
            &colors,
            start_x,
            current_y,
            "Scenario 7: Mixed Children (Fixed + Flexible) + Padding (20px)",
            &label_font,
            500.0,
            &typeface,
            &small_font,
            20.0, // padding
        );
    }

    // Save the result to a PNG file
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    // Use cargo env to get the correct output directory
    let output_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let output_path = format!("{}/goldens/layout_padding.png", output_dir);
    std::fs::write(&output_path, data.as_bytes()).unwrap();

    println!("✓ Generated {}", output_path);
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
    _typeface: &skia_safe::Typeface,
    small_font: &Font,
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

        // Draw child index and size info
        let mut index_paint = Paint::default();
        index_paint.set_anti_alias(true);
        index_paint.set_color(Color::WHITE);
        canvas.draw_str(
            &format!("{}", i + 1),
            skia_safe::Point::new(
                base_x + layout.x + layout.width / 2.0 - 5.0,
                base_y + 10.0 + layout.y + layout.height / 2.0 + 5.0,
            ),
            small_font,
            &index_paint,
        );

        // Draw size info below the child
        let mut size_paint = Paint::default();
        size_paint.set_anti_alias(true);
        size_paint.set_color(Color::from_argb(120, 0, 0, 0));
        canvas.draw_str(
            &format!("{:.0}×{:.0}", layout.width, layout.height),
            skia_safe::Point::new(
                base_x + layout.x + layout.width / 2.0 - 15.0,
                base_y + 10.0 + layout.y + layout.height + 12.0,
            ),
            small_font,
            &size_paint,
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

/// Render a single layout scenario with padding visualization and return the total height used
fn render_scenario_with_padding(
    canvas: &skia_safe::Canvas,
    layouts: &[ComputedLayout],
    colors: &[CGColor],
    base_x: f32,
    base_y: f32,
    label: &str,
    label_font: &Font,
    container_width: f32,
    _typeface: &skia_safe::Typeface,
    small_font: &Font,
    padding: f32,
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

    // Draw padding visualization
    if padding > 0.0 {
        let mut padding_paint = Paint::default();
        padding_paint.set_anti_alias(true);
        padding_paint.set_color(Color::from_argb(30, 0, 100, 255));
        padding_paint.set_style(skia_safe::PaintStyle::Fill);

        // Top padding
        let top_padding_rect = Rect::from_xywh(base_x, base_y + 10.0, container_width, padding);
        canvas.draw_rect(&top_padding_rect, &padding_paint);

        // Bottom padding
        let bottom_padding_rect = Rect::from_xywh(
            base_x,
            base_y + 10.0 + max_height - padding,
            container_width,
            padding,
        );
        canvas.draw_rect(&bottom_padding_rect, &padding_paint);

        // Left padding
        let left_padding_rect = Rect::from_xywh(base_x, base_y + 10.0, padding, max_height);
        canvas.draw_rect(&left_padding_rect, &padding_paint);

        // Right padding
        let right_padding_rect = Rect::from_xywh(
            base_x + container_width - padding,
            base_y + 10.0,
            padding,
            max_height,
        );
        canvas.draw_rect(&right_padding_rect, &padding_paint);

        // Draw padding labels
        let mut padding_label_paint = Paint::default();
        padding_label_paint.set_anti_alias(true);
        padding_label_paint.set_color(Color::from_argb(150, 0, 100, 255));
        canvas.draw_str(
            &format!("{}px", padding as i32),
            skia_safe::Point::new(base_x + 5.0, base_y + 10.0 + padding / 2.0 + 3.0),
            small_font,
            &padding_label_paint,
        );
    }

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

        // Draw child index and size info
        let mut index_paint = Paint::default();
        index_paint.set_anti_alias(true);
        index_paint.set_color(Color::WHITE);
        canvas.draw_str(
            &format!("{}", i + 1),
            skia_safe::Point::new(
                base_x + layout.x + layout.width / 2.0 - 5.0,
                base_y + 10.0 + layout.y + layout.height / 2.0 + 5.0,
            ),
            small_font,
            &index_paint,
        );

        // Draw size info below the child
        let mut size_paint = Paint::default();
        size_paint.set_anti_alias(true);
        size_paint.set_color(Color::from_argb(120, 0, 0, 0));
        canvas.draw_str(
            &format!("{:.0}×{:.0}", layout.width, layout.height),
            skia_safe::Point::new(
                base_x + layout.x + layout.width / 2.0 - 15.0,
                base_y + 10.0 + layout.y + layout.height + 12.0,
            ),
            small_font,
            &size_paint,
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
