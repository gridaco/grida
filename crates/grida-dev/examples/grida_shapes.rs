use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use grida_dev::platform::native_demo;
use math2::transform::AffineTransform;

async fn demo_shapes() -> Scene {
    let nf = NodeFactory::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.layout_dimensions.width = Some(1080.0);
    root_container_node.layout_dimensions.height = Some(1200.0);

    let mut graph = SceneGraph::new();

    let spacing = 100.0;
    let start_x = 50.0;
    let base_size = 80.0;
    let items_per_row = 10;

    // Set up the root container first
    let root_container_id = graph.append_child(Node::Container(root_container_node), Parent::Root);

    // Rectangle Row - demonstrating corner radius variations
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::circular(0.0 + (i as f32 * 8.0)); // 0 to 72
        rect.set_fill(Paint::from(CGColor::from_rgba(
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            255,
        ))); // Fading gray
        graph.append_child(
            Node::Rectangle(rect),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Ellipse Row - demonstrating width/height ratio variations
    for i in 0..items_per_row {
        let mut ellipse = nf.create_ellipse_node();
        ellipse.transform = AffineTransform::new(start_x + spacing * i as f32, 200.0, 0.0);
        ellipse.size = Size {
            width: base_size * (1.0 + (i as f32 * 0.1)), // 1.0x to 1.9x width
            height: base_size,
        };
        ellipse.fills = Paints::new([Paint::from(CGColor::from_rgba(
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            255,
        ))]); // Fading gray
        graph.append_child(
            Node::Ellipse(ellipse),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Polygon Row - demonstrating point count variations
    for i in 0..items_per_row {
        let point_count = 3 + i; // 3 to 12 points
        let points = (0..point_count)
            .map(|j| {
                let angle = std::f32::consts::PI * 2.0 * (j as f32) / (point_count as f32)
                    - std::f32::consts::FRAC_PI_2;
                let radius = base_size / 2.0;
                let x = radius * angle.cos();
                let y = radius * angle.sin();
                CGPoint { x, y }
            })
            .collect::<Vec<_>>();

        let mut polygon = nf.create_polygon_node();
        polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
        polygon.points = points;
        polygon.corner_radius = 8.0;
        polygon.fills = Paints::new([Paint::from(CGColor::from_rgba(
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            255,
        ))]); // Fading gray
        graph.append_child(
            Node::Polygon(polygon),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Regular Polygon Row - demonstrating point count variations
    for i in 0..items_per_row {
        let mut regular_polygon = nf.create_regular_polygon_node();
        regular_polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 400.0, 0.0);
        regular_polygon.size = Size {
            width: base_size,
            height: base_size,
        };
        regular_polygon.point_count = 3 + i; // 3 to 12 points
        regular_polygon.fills = Paints::new([Paint::from(CGColor::from_rgba(
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            255,
        ))]); // Fading gray
        regular_polygon.corner_radius = 8.0;
        graph.append_child(
            Node::RegularPolygon(regular_polygon),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Path Row - demonstrating different path patterns
    let path_data = vec![
        "M50,0 L61,35 L98,35 L68,57 L79,91 L50,71 L21,91 L32,57 L2,35 L39,35 Z", // 5-point star
        "M50,0 L100,50 L0,50 Z",                                                 // Triangle
        "M0,0 L100,0 L100,100 L0,100 Z",                                         // Square
        "M50,0 L100,50 L50,100 L0,50 Z",                                         // Diamond
        "M0,0 L100,0 L100,100 L0,100 L0,0 M20,20 L80,20 L80,80 L20,80 Z",        // Square with hole
        "M50,0 A50,50 0 0 1 100,50 A50,50 0 0 1 50,100 A50,50 0 0 1 0,50 A50,50 0 0 1 50,0 Z", // Circle
        "M0,50 L50,0 L100,50 L50,100 Z", // Diamond
        "M0,0 L100,0 L50,100 Z",         // Triangle
        "M0,0 L100,0 L100,100 L0,100 Z M20,20 L80,20 L80,80 L20,80 Z", // Square with hole
        "M50,0 A50,50 0 0 1 100,50 A50,50 0 0 1 50,100 A50,50 0 0 1 0,50 A50,50 0 0 1 50,0 Z", // Circle
    ];
    for (i, data) in path_data.iter().enumerate() {
        let mut path = nf.create_path_node();
        path.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
        path.data = data.to_string();
        path.fills = Paints::new([Paint::from(CGColor::from_rgba(
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            255,
        ))]); // Fading gray
        graph.append_child(Node::Path(path), Parent::NodeId(root_container_id.clone()));
    }

    // Star Polygon Row - demonstrating different point counts and inner radius variations
    for i in 0..items_per_row {
        let mut star = nf.create_regular_star_polygon_node();
        star.transform = AffineTransform::new(start_x + spacing * i as f32, 600.0, 0.0);
        star.size = Size {
            width: base_size,
            height: base_size,
        };
        star.point_count = 3 + i; // 3 to 12 points
        star.inner_radius = 0.7 - (i as f32 * 0.05); // 0.3 to 0.75 inner radius
        star.fills = Paints::new([Paint::from(CGColor::from_rgba(
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            255,
        ))]); // Fading gray
        star.corner_radius = 8.0;
        graph.append_child(
            Node::RegularStarPolygon(star),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    // Arc Row - demonstrating different angle variations
    for i in 0..items_per_row {
        let mut arc = nf.create_ellipse_node();
        arc.transform = AffineTransform::new(start_x + spacing * i as f32, 700.0, 0.0);
        arc.size = Size {
            width: base_size,
            height: base_size,
        };
        arc.start_angle = 0.0;
        arc.angle = Some(45.0 + (i as f32 * 31.5)); // 45 to 360 degrees
        arc.inner_radius = Some(0.3); // Fixed inner radius for visibility
        arc.fills = Paints::new([Paint::from(CGColor::from_rgba(
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            200 - (i * 20) as u8,
            255,
        ))]); // Fading gray
        arc.corner_radius = Some(8.0);
        graph.append_child(
            Node::Ellipse(arc),
            Parent::NodeId(root_container_id.clone()),
        );
    }

    Scene {
        name: "Shapes Demo".to_string(),
        graph,
        background_color: Some(CGColor::from_rgba(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_shapes().await;
    native_demo::run_demo_window(scene).await;
}
