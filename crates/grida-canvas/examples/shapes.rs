use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_shapes() -> Scene {
    let nf = NodeFactory::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.base.name = "Root Container".to_string();
    root_container_node.size = Size {
        width: 1080.0,
        height: 1080.0,
    };

    let mut repository = NodeRepository::new();

    let mut all_shape_ids = Vec::new();
    let spacing = 100.0;
    let start_x = 50.0;
    let base_size = 80.0;
    let items_per_row = 10;

    // Rectangle Row - demonstrating corner radius variations
    for i in 0..items_per_row {
        let mut rect = nf.create_rectangle_node();
        rect.base.name = format!("Rectangle {}", i + 1);
        rect.transform = AffineTransform::new(start_x + spacing * i as f32, 100.0, 0.0);
        rect.size = Size {
            width: base_size,
            height: base_size,
        };
        rect.corner_radius = RectangularCornerRadius::all(0.0 + (i as f32 * 8.0)); // 0 to 72
        rect.set_fill(Paint::Solid(SolidPaint {
            color: Color(
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                255,
            ), // Fading gray
            opacity: 1.0,
        }));
        all_shape_ids.push(rect.base.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Ellipse Row - demonstrating width/height ratio variations
    for i in 0..items_per_row {
        let mut ellipse = nf.create_ellipse_node();
        ellipse.base.name = format!("Ellipse {}", i + 1);
        ellipse.transform = AffineTransform::new(start_x + spacing * i as f32, 200.0, 0.0);
        ellipse.size = Size {
            width: base_size * (1.0 + (i as f32 * 0.1)), // 1.0x to 1.9x width
            height: base_size,
        };
        ellipse.fills = vec![Paint::Solid(SolidPaint {
            color: Color(
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                255,
            ), // Fading gray
            opacity: 1.0,
        })];
        all_shape_ids.push(ellipse.base.id.clone());
        repository.insert(Node::Ellipse(ellipse));
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
                Point { x, y }
            })
            .collect::<Vec<_>>();

        let mut polygon = nf.create_polygon_node();
        polygon.base.name = format!("Polygon {}", i + 1);
        polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 300.0, 0.0);
        polygon.points = points;
        polygon.corner_radius = 16.0;
        polygon.fills = vec![Paint::Solid(SolidPaint {
            color: Color(
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                255,
            ), // Fading gray
            opacity: 1.0,
        })];
        all_shape_ids.push(polygon.base.id.clone());
        repository.insert(Node::Polygon(polygon));
    }

    // Regular Polygon Row - demonstrating point count variations
    for i in 0..items_per_row {
        let mut regular_polygon = nf.create_regular_polygon_node();
        regular_polygon.base.name = format!("Regular Polygon {}", i + 1);
        regular_polygon.transform = AffineTransform::new(start_x + spacing * i as f32, 400.0, 0.0);
        regular_polygon.size = Size {
            width: base_size,
            height: base_size,
        };
        regular_polygon.point_count = 3 + i; // 3 to 12 points
        regular_polygon.fills = vec![Paint::Solid(SolidPaint {
            color: Color(
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                255,
            ), // Fading gray
            opacity: 1.0,
        })];
        all_shape_ids.push(regular_polygon.base.id.clone());
        repository.insert(Node::RegularPolygon(regular_polygon));
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
        path.base.name = format!("Path {}", i + 1);
        path.transform = AffineTransform::new(start_x + spacing * i as f32, 500.0, 0.0);
        path.data = data.to_string();
        path.fill = Paint::Solid(SolidPaint {
            color: Color(
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                255,
            ), // Fading gray
            opacity: 1.0,
        });
        all_shape_ids.push(path.base.id.clone());
        repository.insert(Node::SVGPath(path));
    }

    // Star Polygon Row - demonstrating different point counts and inner radius variations
    for i in 0..items_per_row {
        let mut star = nf.create_regular_star_polygon_node();
        star.base.name = format!("Star Polygon {}", i + 1);
        star.transform = AffineTransform::new(start_x + spacing * i as f32, 600.0, 0.0);
        star.size = Size {
            width: base_size,
            height: base_size,
        };
        star.point_count = 3 + i; // 3 to 12 points
        star.inner_radius = 0.7 - (i as f32 * 0.05); // 0.3 to 0.75 inner radius
        star.fills = vec![Paint::Solid(SolidPaint {
            color: Color(
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                200 - (i * 20) as u8,
                255,
            ), // Fading gray
            opacity: 1.0,
        })];
        all_shape_ids.push(star.base.id.clone());
        repository.insert(Node::RegularStarPolygon(star));
    }

    // Set up the root container
    root_container_node.children.extend(all_shape_ids);
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: "Shapes Demo".to_string(),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repository,
        background_color: Some(Color(250, 250, 250, 255)),
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_shapes().await;
    window::run_demo_window(scene).await;
}
