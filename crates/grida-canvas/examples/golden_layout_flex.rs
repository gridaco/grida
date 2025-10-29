use cg::cg::types::*;
use cg::layout::engine::LayoutEngine;
use cg::layout::ComputedLayout;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::{
    ContainerNodeRec, LayoutContainerStyle, LayoutDimensionStyle, Node, Scene, Size, StrokeStyle,
};
use skia_safe::{surfaces, Color, Font, FontMgr, Paint, Rect};

fn create_container(id: &str, width: f32, height: f32) -> ContainerNodeRec {
    create_container_with_gap(id, width, height, 10.0)
}

fn create_container_with_gap(id: &str, width: f32, height: f32, gap: f32) -> ContainerNodeRec {
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
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
        },
        effects: Default::default(),
        clip: Default::default(),
        layout_container: LayoutContainerStyle {
            layout_mode: LayoutMode::Flex,
            layout_direction: Axis::Horizontal,
            layout_wrap: Some(LayoutWrap::Wrap),
            layout_main_axis_alignment: Some(MainAxisAlignment::Start),
            layout_cross_axis_alignment: Some(CrossAxisAlignment::Start),
            layout_padding: None,
            layout_gap: Some(LayoutGap {
                main_axis_gap: gap,
                cross_axis_gap: gap,
            }),
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
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        // Create ICB with flex layout
        let mut icb = nf.create_initial_container_node();
        icb.layout_mode = LayoutMode::Flex;
        icb.layout_direction = Axis::Horizontal;
        icb.layout_wrap = LayoutWrap::Wrap;
        icb.layout_main_axis_alignment = MainAxisAlignment::Start;
        icb.layout_cross_axis_alignment = CrossAxisAlignment::Start;
        icb.layout_gap = LayoutGap {
            main_axis_gap: 10.0,
            cross_axis_gap: 10.0,
        };
        let icb_id = graph.append_child(Node::InitialContainer(icb), Parent::Root);

        // Add children to scene graph
        for i in 0..6 {
            let child = create_container(&format!("child-1-{}", i), 100.0, 100.0);
            // Position is now handled by layout field
            graph.append_child(Node::Container(child), Parent::NodeId(icb_id));
        }

        // Compute layout using production pipeline
        let scene = Scene {
            name: String::new(),
            graph,
            background_color: None,
        };
        let mut layout_engine = LayoutEngine::new();
        let layout_result = layout_engine.compute(
            &scene,
            Size {
                width: 800.0,
                height: 200.0,
            },
        );

        // Extract layouts in order
        let children_ids = scene.graph.get_children(&icb_id).unwrap();
        let layouts: Vec<ComputedLayout> = children_ids
            .iter()
            .map(|id| layout_result.get(id).cloned().unwrap())
            .collect();

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
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        let mut icb = nf.create_initial_container_node();
        icb.layout_mode = LayoutMode::Flex;
        icb.layout_direction = Axis::Horizontal;
        icb.layout_wrap = LayoutWrap::Wrap;
        icb.layout_main_axis_alignment = MainAxisAlignment::Start;
        icb.layout_cross_axis_alignment = CrossAxisAlignment::Start;
        icb.layout_gap = LayoutGap {
            main_axis_gap: 10.0,
            cross_axis_gap: 10.0,
        };
        let icb_id = graph.append_child(Node::InitialContainer(icb), Parent::Root);

        for i in 0..6 {
            let child = create_container(&format!("child-2-{}", i), 100.0, 100.0);
            // Position is now handled by layout field
            graph.append_child(Node::Container(child), Parent::NodeId(icb_id));
        }

        let scene = Scene {
            name: String::new(),
            graph,
            background_color: None,
        };
        let mut layout_engine = LayoutEngine::new();
        let layout_result = layout_engine.compute(
            &scene,
            Size {
                width: 400.0,
                height: 300.0,
            },
        );

        let children_ids = scene.graph.get_children(&icb_id).unwrap();
        let layouts: Vec<ComputedLayout> = children_ids
            .iter()
            .map(|id| layout_result.get(id).cloned().unwrap())
            .collect();

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
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        let mut icb = nf.create_initial_container_node();
        icb.layout_mode = LayoutMode::Flex;
        icb.layout_direction = Axis::Horizontal;
        icb.layout_wrap = LayoutWrap::Wrap;
        icb.layout_main_axis_alignment = MainAxisAlignment::Start;
        icb.layout_cross_axis_alignment = CrossAxisAlignment::Start;
        icb.layout_gap = LayoutGap {
            main_axis_gap: 10.0,
            cross_axis_gap: 10.0,
        };
        let icb_id = graph.append_child(Node::InitialContainer(icb), Parent::Root);

        for i in 0..6 {
            let child = create_container(&format!("child-3-{}", i), 100.0, 100.0);
            // Position is now handled by layout field
            graph.append_child(Node::Container(child), Parent::NodeId(icb_id));
        }

        let scene = Scene {
            name: String::new(),
            graph,
            background_color: None,
        };
        let mut layout_engine = LayoutEngine::new();
        let layout_result = layout_engine.compute(
            &scene,
            Size {
                width: 250.0,
                height: 700.0,
            },
        );

        let children_ids = scene.graph.get_children(&icb_id).unwrap();
        let layouts: Vec<ComputedLayout> = children_ids
            .iter()
            .map(|id| layout_result.get(id).cloned().unwrap())
            .collect();

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
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();

        let mut icb = nf.create_initial_container_node();
        icb.layout_mode = LayoutMode::Flex;
        icb.layout_direction = Axis::Horizontal;
        icb.layout_wrap = LayoutWrap::Wrap;
        icb.layout_main_axis_alignment = MainAxisAlignment::Start;
        icb.layout_cross_axis_alignment = CrossAxisAlignment::Start;
        icb.layout_gap = LayoutGap {
            main_axis_gap: 10.0,
            cross_axis_gap: 10.0,
        };
        let icb_id = graph.append_child(Node::InitialContainer(icb), Parent::Root);

        let child_sizes = vec![
            (80.0, 80.0),
            (120.0, 100.0),
            (100.0, 60.0),
            (150.0, 80.0),
            (90.0, 90.0),
            (110.0, 70.0),
        ];

        for (i, (w, h)) in child_sizes.iter().enumerate() {
            let child = create_container(&format!("child-4-{}", i), *w, *h);
            // Position is now handled by layout field
            graph.append_child(Node::Container(child), Parent::NodeId(icb_id));
        }

        let scene = Scene {
            name: String::new(),
            graph,
            background_color: None,
        };
        let mut layout_engine = LayoutEngine::new();
        let layout_result = layout_engine.compute(
            &scene,
            Size {
                width: 500.0,
                height: 300.0,
            },
        );

        let children_ids = scene.graph.get_children(&icb_id).unwrap();
        let layouts: Vec<ComputedLayout> = children_ids
            .iter()
            .map(|id| layout_result.get(id).cloned().unwrap())
            .collect();

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
    // Use cargo env to get the correct output directory
    let output_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let output_path = format!("{}/goldens/layout_flex.png", output_dir);
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
