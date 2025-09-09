use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::repository::NodeRepository;
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use math2::{rect::Rectangle, transform::AffineTransform};

async fn scene() -> Scene {
    let nf = NodeFactory::new();
    let mut repo = NodeRepository::new();

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 400.0,
        height: 400.0,
    };
    container.stroke_width = 10.0;
    container.stroke_align = StrokeAlign::Outside;
    container.strokes = vec![Paint::Solid(SolidPaint {
        color: CGColor(255, 0, 0, 255),
        opacity: 1.0,
    })];
    container.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(255, 255, 255, 255),
        opacity: 1.0,
    }));
    // Center the container in the 800x800 canvas
    container.transform = AffineTransform::new(200.0, 200.0, 0.0);

    // Create a circle that will overlap with the container's stroke
    let mut circle = nf.create_ellipse_node();
    circle.name = Some("Overlapping Circle".to_string());
    circle.size = Size {
        width: 400.0,
        height: 400.0,
    };
    circle.set_fill(Paint::Solid(SolidPaint {
        color: CGColor(0, 255, 0, 255), // Green color
        opacity: 1.0,
    }));
    // Position the circle at the right-bottom of the container
    // Container is 400x400, centered at (200, 200), so right-bottom would be around (350, 350)
    // But we want it to overlap with the stroke, so position it at the edge
    circle.transform = AffineTransform::new(200.0, 200.0, 0.0);

    let circle_id = circle.id.clone();
    repo.insert(Node::Ellipse(circle));

    let container_id = container.id.clone();
    // Add the circle as a child of the container
    container.children = vec![circle_id];
    repo.insert(Node::Container(container));

    Scene {
        id: "scene".into(),
        name: "container stroke".into(),
        children: vec![container_id],
        nodes: repo,
        background_color: None,
    }
}

#[tokio::main]
async fn main() {
    let scene = scene().await;

    let width = 800.0;
    let height = 800.0;

    let mut renderer = Renderer::new(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, width, height)),
    );
    renderer.load_scene(scene);

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let canvas = surface.canvas();
    renderer.render_to_canvas(canvas, width, height);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/container_stroke.png"),
        data.as_bytes(),
    )
    .unwrap();

    renderer.free();
}
