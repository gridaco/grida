use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_nested() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Demonstrate nested transformations and hierarchy
    // Each level applies cumulative transformations: translation + rotation + scale
    // Visual: concentric rotating squares that get progressively smaller and rotated

    let levels: i32 = 6; // Number of nesting levels
    let base_size = 400.0;

    // Build from outermost to innermost
    let mut current_parent = Parent::Root;

    for i in 0..levels {
        let depth_ratio = (i as f32) / (levels as f32);
        let size_reduction = 0.85_f32; // Each level is 85% of parent
        let current_size = base_size * size_reduction.powi(i as i32);
        let rotation = 15.0_f32.to_radians() * (i as f32); // Rotate 15 degrees per level

        // Create a container for this level
        let mut container = nf.create_container_node();

        // Each level is centered in its parent with rotation
        container.position = CGPoint::new(current_size * 0.075, current_size * 0.075).into();
        container.rotation = rotation;
        container.layout_dimensions.width = Some(current_size);
        container.layout_dimensions.height = Some(current_size);
        container.corner_radius = RectangularCornerRadius::circular(8.0);

        // Color gradient from blue (outer) to red (inner)
        let r = (255.0 * depth_ratio) as u8;
        let g = (100.0 * (1.0 - depth_ratio)) as u8;
        let b = (255.0 * (1.0 - depth_ratio)) as u8;
        container.set_fill(Paint::from(CGColor(r, g, b, 200)));

        // Add stroke to show boundaries
        container.strokes = Paints::new([Paint::from(CGColor(255, 255, 255, 255))]);
        container.stroke_width = 2.0.into();

        let container_id = graph.append_child(Node::Container(container), current_parent);

        // Add a label at each level
        let mut label = nf.create_text_span_node();
        label.transform = AffineTransform::new(10.0, 10.0, 0.0);
        label.text = format!("Level {}", i);
        label.text_style = TextStyleRec::from_font("", 14.0);
        label.fills = Paints::new([Paint::from(CGColor(255, 255, 255, 255))]);
        graph.append_child(Node::TextSpan(label), Parent::NodeId(container_id.clone()));

        // Move to next level (this container becomes the parent for the next iteration)
        current_parent = Parent::NodeId(container_id);
    }

    // Add final innermost content - a star
    let mut star = nf.create_regular_star_polygon_node();
    let final_size = base_size * 0.85_f32.powi(levels);
    star.transform = AffineTransform::new(final_size * 0.25, final_size * 0.25, 0.0);
    star.size = Size {
        width: final_size * 0.5,
        height: final_size * 0.5,
    };
    star.point_count = 5;
    star.inner_radius = 0.4;
    star.set_fill(Paint::from(CGColor(255, 255, 0, 255)));
    star.strokes = Paints::new([Paint::from(CGColor(255, 200, 0, 255))]);
    star.stroke_width = 3.0.into();
    graph.append_child(Node::RegularStarPolygon(star), current_parent);

    Scene {
        name: "Nested Demo".to_string(),
        background_color: Some(CGColor(250, 250, 250, 255)),
        graph,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_nested().await;

    window::run_demo_window(scene).await;
}
