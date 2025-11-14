use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window;

fn create_flex_demo_scene() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // ROOT 1: ICB (resizes with window)
    let mut icb = nf.create_initial_container_node();
    icb.layout_mode = LayoutMode::Flex;
    icb.layout_direction = Axis::Horizontal;
    icb.layout_wrap = LayoutWrap::Wrap;
    icb.layout_gap = LayoutGap {
        main_axis_gap: 20.0,
        cross_axis_gap: 20.0,
    };
    icb.padding = EdgeInsets::all(20.0);
    let icb_id = graph.append_child(Node::InitialContainer(icb), Parent::Root);

    // Create colored boxes for ICB
    let colors = [
        ("Red", CGColor(239, 68, 68, 255)),
        ("Blue", CGColor(59, 130, 246, 255)),
        ("Green", CGColor(34, 197, 94, 255)),
        ("Yellow", CGColor(234, 179, 8, 255)),
        ("Purple", CGColor(168, 85, 247, 255)),
    ];

    for (_name, color) in colors.iter() {
        let mut box_node = nf.create_container_node();
        box_node.layout_dimensions.width = Some(100.0);
        box_node.layout_dimensions.height = Some(100.0);
        // Participate in parent's flex layout
        box_node.layout_child = Some(LayoutChildStyle {
            layout_grow: 0.0,
            layout_positioning: LayoutPositioning::Auto,
        });
        box_node.fills = Paints::new([Paint::Solid(SolidPaint {
            color: *color,
            blend_mode: BlendMode::default(),
            active: true,
        })]);
        box_node.corner_radius = RectangularCornerRadius::all(Radius { rx: 8.0, ry: 8.0 });
        graph.append_child(Node::Container(box_node), Parent::NodeId(icb_id));
    }

    // ROOT 2: Fixed Container (doesn't resize with window) - positioned above ICB
    let mut fixed_container = nf.create_container_node();
    fixed_container.layout_dimensions.width = Some(250.0); // Fixed width
    fixed_container.layout_dimensions.height = Some(150.0); // Fixed height
    fixed_container.layout_container = LayoutContainerStyle {
        layout_mode: LayoutMode::Flex,
        layout_direction: Axis::Vertical,
        layout_gap: Some(LayoutGap::uniform(10.0)),
        layout_padding: Some(EdgeInsets::all(15.0)),
        ..Default::default()
    };
    fixed_container.fills = Paints::new([Paint::Solid(SolidPaint {
        color: CGColor(255, 200, 200, 255), // Light red background
        blend_mode: BlendMode::default(),
        active: true,
    })]);
    fixed_container.position = CGPoint::new(100.0, -50.0).into(); // Position it at (100, 50) - above ICB area
    let fixed_id = graph.append_child(Node::Container(fixed_container), Parent::Root);

    // Create smaller boxes for fixed container
    let fixed_colors = [
        ("Orange", CGColor(255, 165, 0, 255)),
        ("Pink", CGColor(255, 192, 203, 255)),
        ("Cyan", CGColor(0, 255, 255, 255)),
    ];

    for (_name, color) in fixed_colors.iter() {
        let mut box_node = nf.create_container_node();
        box_node.layout_dimensions.width = Some(80.0);
        box_node.layout_dimensions.height = Some(50.0);
        box_node.layout_child = Some(LayoutChildStyle {
            layout_grow: 0.0,
            layout_positioning: LayoutPositioning::Auto,
        });
        box_node.fills = Paints::new([Paint::Solid(SolidPaint {
            color: *color,
            blend_mode: BlendMode::default(),
            active: true,
        })]);
        box_node.corner_radius = RectangularCornerRadius::all(Radius { rx: 4.0, ry: 4.0 });
        graph.append_child(Node::Container(box_node), Parent::NodeId(fixed_id));
    }

    Scene {
        name: "Dual Root Layout Demo".to_string(),
        graph,
        background_color: Some(CGColor(255, 255, 255, 255)),
    }
}

#[tokio::main]
async fn main() {
    println!("Dual Root Layout Demo");
    println!("====================");
    println!();
    println!("✓ ROOT 1: ICB (resizes with window)");
    println!("  - Horizontal flex with 5 colored boxes");
    println!("  - 20px gap, 20px padding");
    println!("  - Items wrap when window is resized");
    println!();
    println!("✓ ROOT 2: Fixed Container (doesn't resize)");
    println!("  - Fixed 250x150 size at position (100, 50)");
    println!("  - Vertical flex with 3 smaller boxes");
    println!("  - 10px gap, 15px padding");
    println!();
    println!("Try resizing the window to see the difference!");
    println!("- ICB boxes will reflow and wrap");
    println!("- Fixed container stays the same size and position");

    let scene = create_flex_demo_scene();

    window::run_demo_window_with(scene, |renderer, _tx, _font_tx, _proxy| {
        // Disable tile caching for smoother resize
        renderer.set_cache_tile(false);
    })
    .await;
}
