use cg::cg::types::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use math2::{rect::Rectangle, transform::AffineTransform};

async fn scene() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut container = nf.create_container_node();
    container.size = Size {
        width: 400.0,
        height: 400.0,
    };
    container.stroke_width = 10.0;
    container.stroke_align = StrokeAlign::Outside;
    container.strokes = Paints::new([Paint::from(CGColor(255, 0, 0, 255))]);
    container.set_fill(Paint::from(CGColor(255, 255, 255, 255)));
    // Center the container in the 800x800 canvas
    container.transform = AffineTransform::new(200.0, 200.0, 0.0);

    // Create a circle that will overlap with the container's stroke
    let mut circle = nf.create_ellipse_node();
    circle.name = Some("Overlapping Circle".to_string());
    circle.size = Size {
        width: 400.0,
        height: 400.0,
    };
    circle.set_fill(Paint::from(CGColor(0, 255, 0, 255)));
    // Position the circle at the right-bottom of the container
    // Container is 400x400, centered at (200, 200), so right-bottom would be around (350, 350)
    // But we want it to overlap with the stroke, so position it at the edge
    circle.transform = AffineTransform::new(200.0, 200.0, 0.0);

    // Add container as root, then add circle as its child
    let container_id = graph.append_child(Node::Container(container), Parent::Root);
    graph.append_child(Node::Ellipse(circle), Parent::NodeId(container_id));

    Scene {
        name: "container stroke".into(),
        graph,
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
