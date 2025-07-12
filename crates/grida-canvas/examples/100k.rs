use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::window;
use math2::transform::AffineTransform;

async fn demo_n_shapes(n: usize) -> Scene {
    let nf = NodeFactory::new();

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

        // Create rainbow effect from top-left to bottom-right
        // Calculate diagonal position (0.0 to 1.0 across the diagonal)
        let diagonal_progress = (row + col) as f32 / (grid_height + grid_width - 2) as f32;

        // Convert to hue (0-360 degrees)
        let hue = diagonal_progress * 360.0;

        // Convert HSV to RGB
        let (r, g, b) = hsv_to_rgb(hue, 1.0, 1.0);

        rect.set_fill(Paint::Solid(SolidPaint {
            color: Color(r, g, b, 255),
            opacity: 1.0,
        }));

        all_shape_ids.push(rect.base.id.clone());
        repository.insert(Node::Rectangle(rect));
    }

    Scene {
        id: "scene".to_string(),
        name: format!("{} Shapes Performance Test", n),
        transform: AffineTransform::identity(),
        children: all_shape_ids,
        nodes: repository,
        background_color: None,
    }
}

// Helper function to convert HSV to RGB
fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (u8, u8, u8) {
    let h = h % 360.0;
    let c = v * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = v - c;

    let (r, g, b) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };

    (
        ((r + m) * 255.0) as u8,
        ((g + m) * 255.0) as u8,
        ((b + m) * 255.0) as u8,
    )
}

#[tokio::main]
async fn main() {
    let scene = demo_n_shapes(100000).await;
    window::run_demo_window(scene).await;
}
