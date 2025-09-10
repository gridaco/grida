use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_ellipses() -> Scene {
    let nf = NodeFactory::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.name = Some("Root Container".to_string());
    root_container_node.size = Size {
        width: 1200.0,
        height: 800.0,
    };

    let mut repository = NodeRepository::new();

    let mut all_ellipse_ids = Vec::new();
    let spacing = 120.0;
    let start_x = 60.0;
    let base_size = 100.0;
    let items_per_row = 8;

    // Row 1: Basic ellipses with different aspect ratios
    for i in 0..items_per_row {
        let mut ellipse = nf.create_ellipse_node();
        ellipse.name = Some(format!("Ellipse {}", i + 1));
        ellipse.transform = AffineTransform::new(start_x + spacing * i as f32, 80.0, 0.0);
        ellipse.size = Size {
            width: base_size * (0.5 + (i as f32 * 0.2)), // 0.5x to 1.9x width
            height: base_size,
        };
        ellipse.fills = vec![Paint::from(CGColor(
            100 + (i * 20) as u8,
            150 + (i * 10) as u8,
            200 + (i * 5) as u8,
            255,
        ))]; // Blue gradient
        all_ellipse_ids.push(ellipse.id.clone());
        repository.insert(Node::Ellipse(ellipse));
    }

    // Row 2: Ellipses with different inner radius (rings)
    for i in 0..items_per_row {
        let mut ring = nf.create_ellipse_node();
        ring.name = Some(format!("Ring {}", i + 1));
        ring.transform = AffineTransform::new(start_x + spacing * i as f32, 220.0, 0.0);
        ring.size = Size {
            width: base_size,
            height: base_size,
        };
        ring.inner_radius = Some(0.1 + (i as f32 * 0.1)); // 0.1 to 0.8 inner radius
        ring.fills = vec![Paint::from(CGColor(
            200 + (i * 7) as u8,
            100 + (i * 15) as u8,
            50 + (i * 20) as u8,
            255,
        ))]; // Orange gradient
        all_ellipse_ids.push(ring.id.clone());
        repository.insert(Node::Ellipse(ring));
    }

    // Row 3: Arcs with different angles
    for i in 0..items_per_row {
        let mut arc = nf.create_ellipse_node();
        arc.name = Some(format!("Arc {}", i + 1));
        arc.transform = AffineTransform::new(start_x + spacing * i as f32, 360.0, 0.0);
        arc.size = Size {
            width: base_size,
            height: base_size,
        };
        arc.start_angle = 0.0;
        arc.angle = Some(30.0 + (i as f32 * 45.0)); // 30 to 345 degrees
        arc.fills = vec![Paint::from(CGColor(
            50 + (i * 25) as u8,
            200 + (i * 7) as u8,
            100 + (i * 15) as u8,
            255,
        ))]; // Green gradient
        all_ellipse_ids.push(arc.id.clone());
        repository.insert(Node::Ellipse(arc));
    }

    // Row 4: Arcs with inner radius (donut arcs)
    for i in 0..items_per_row {
        let mut donut_arc = nf.create_ellipse_node();
        donut_arc.name = Some(format!("Donut Arc {}", i + 1));
        donut_arc.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
        donut_arc.size = Size {
            width: base_size,
            height: base_size,
        };
        donut_arc.start_angle = 0.0;
        donut_arc.angle = Some(60.0 + (i as f32 * 37.5)); // 60 to 337.5 degrees
        donut_arc.inner_radius = Some(0.4); // Fixed inner radius
        donut_arc.fills = vec![Paint::from(CGColor(
            200 + (i * 7) as u8,
            50 + (i * 25) as u8,
            150 + (i * 12) as u8,
            255,
        ))]; // Purple gradient
        all_ellipse_ids.push(donut_arc.id.clone());
        repository.insert(Node::Ellipse(donut_arc));
    }

    // Row 5: Ellipses with strokes
    for i in 0..items_per_row {
        let mut stroke_ellipse = nf.create_ellipse_node();
        stroke_ellipse.name = Some(format!("Stroke Ellipse {}", i + 1));
        stroke_ellipse.transform = AffineTransform::new(start_x + spacing * i as f32, 640.0, 0.0);
        stroke_ellipse.size = Size {
            width: base_size * (0.8 + (i as f32 * 0.15)), // 0.8x to 1.85x width
            height: base_size,
        };
        stroke_ellipse.fills = vec![Paint::from(CGColor(255, 255, 255, 255))];
        stroke_ellipse.strokes = vec![Paint::from(CGColor(
            255 - (i * 30) as u8,
            100 + (i * 20) as u8,
            50 + (i * 25) as u8,
            255,
        ))]; // Red gradient stroke
        stroke_ellipse.stroke_width = 3.0 + (i as f32 * 2.0); // 3 to 17 stroke weight
        all_ellipse_ids.push(stroke_ellipse.id.clone());
        repository.insert(Node::Ellipse(stroke_ellipse));
    }

    // Set up the root container
    root_container_node.children.extend(all_ellipse_ids);
    let root_container_id = root_container_node.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Ellipse Demo".to_string(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(CGColor(245, 245, 245, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_ellipses().await;
    window::run_demo_window(scene).await;
}
