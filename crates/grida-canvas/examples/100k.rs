use cg::factory::NodeFactory;
use cg::repository::NodeRepository;
use cg::schema::*;
use grida_cmath::transform::AffineTransform;

mod window;

async fn demo_n_shapes(n: usize) -> Scene {
    let nf = NodeFactory::new();

    // Create a root container node
    let mut root_container_node = nf.create_container_node();
    root_container_node.base.name = "Root Container".to_string();

    let mut repository = NodeRepository::new();
    let mut all_shape_ids = Vec::new();

    // Grid parameters
    let shape_size = 100.0; // Fixed size of 100x100 per shape
    let spacing = 10.0; // Space between shapes

    // Calculate grid dimensions to make it as square as possible
    let grid_width = (n as f32).sqrt().ceil() as i32;
    let grid_height = (n as f32 / grid_width as f32).ceil() as i32;

    // Calculate starting position (top-left)
    let start_x = 0.0;
    let start_y = 0.0;

    // Generate shapes in a grid pattern
    for i in 0..n {
        let row = (i as i32) / grid_width;
        let col = (i as i32) % grid_width;

        let mut rect = nf.create_rectangle_node();
        rect.base.name = format!("Shape_{}", i);
        rect.transform = AffineTransform::new(
            start_x + (col as f32 * (shape_size + spacing)),
            start_y + (row as f32 * (shape_size + spacing)),
            0.0,
        );
        rect.size = Size {
            width: shape_size,
            height: shape_size,
        };
        rect.corner_radius = RectangularCornerRadius::all(10.0);

        // Create a gradient of colors
        let intensity = (i % 255) as u8;
        rect.fill = Paint::Solid(SolidPaint {
            color: Color(intensity, intensity, intensity, 255),
            opacity: 1.0,
        });

        all_shape_ids.push(rect.base.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    // Set up the root container
    root_container_node.children = all_shape_ids;
    let root_container_id = root_container_node.base.id.clone();
    repository.insert(Node::Container(root_container_node));

    Scene {
        id: "scene".to_string(),
        name: format!("{} Shapes Performance Test", n),
        transform: AffineTransform::identity(),
        children: vec![root_container_id],
        nodes: repository,
    }
}

#[tokio::main]
async fn main() {
    let scene = demo_n_shapes(100_000).await;
    window::run_demo_window(scene).await;
}
