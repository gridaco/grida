use cg::cg::prelude::*;
use cg::layout::engine::LayoutEngine;
use cg::layout::ComputedLayout;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use skia_safe::{Color, Paint, Rect};

fn main() {
    // Create a surface for rendering
    let mut surface = skia_safe::surfaces::raster_n32_premul((800, 600)).unwrap();
    let canvas = surface.canvas();

    // Clear background
    canvas.clear(Color::from_argb(255, 255, 255, 255));

    // Build scene graph with production pipeline
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Create ICB with flex layout and padding
    let mut icb = nf.create_initial_container_node();
    icb.layout_mode = LayoutMode::Flex;
    icb.layout_direction = Axis::Horizontal;
    icb.layout_wrap = LayoutWrap::Wrap;
    icb.layout_main_axis_alignment = MainAxisAlignment::Start;
    icb.layout_cross_axis_alignment = CrossAxisAlignment::Start;
    icb.padding = EdgeInsets {
        left: 20.0,
        right: 20.0,
        top: 20.0,
        bottom: 20.0,
    };
    icb.layout_gap = LayoutGap {
        main_axis_gap: 10.0,
        cross_axis_gap: 10.0,
    };
    let icb_id = graph.append_child(Node::InitialContainer(icb), Parent::Root);

    // Add child containers
    for i in 1..=4 {
        let child = create_child_container(&format!("child-{}", i), 100.0, 80.0);
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
            width: 400.0,
            height: 200.0,
        },
    );

    // Extract layouts
    let children_ids = scene.graph.get_children(&icb_id).unwrap();
    let layouts: Vec<ComputedLayout> = children_ids
        .iter()
        .map(|id| layout_result.get(id).cloned().unwrap())
        .collect();

    // Render the demo (simplified - just show the layouts work)
    // Note: render_demo function expects ContainerNodeRec which we don't have anymore
    // For now, let's just draw the computed layouts directly
    let colors = [
        CGColor::from_rgb(239, 68, 68),  // red
        CGColor::from_rgb(59, 130, 246), // blue
        CGColor::from_rgb(34, 197, 94),  // green
        CGColor::from_rgb(234, 179, 8),  // yellow
    ];

    for (i, layout) in layouts.iter().enumerate() {
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        let color = colors[i % colors.len()];
        paint.set_color(Color::from_argb(255, color.r(), color.g(), color.b()));
        paint.set_style(skia_safe::PaintStyle::Fill);

        // Offset by base position and padding
        let rect = Rect::from_xywh(
            50.0 + layout.x,
            50.0 + layout.y,
            layout.width,
            layout.height,
        );
        canvas.draw_rect(&rect, &paint);
    }

    // Save the result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();

    // Use cargo env to get the correct output directory
    let output_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let output_path = format!("{}/goldens/layout_flex_padding.png", output_dir);
    std::fs::write(&output_path, data.as_bytes()).unwrap();

    println!("✓ Generated {}", output_path);
}

fn create_child_container(id: &str, width: f32, height: f32) -> ContainerNodeRec {
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
            layout_mode: LayoutMode::Normal,
            layout_direction: Axis::Horizontal,
            layout_wrap: None,
            layout_main_axis_alignment: None,
            layout_cross_axis_alignment: None,
            layout_padding: None,
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
