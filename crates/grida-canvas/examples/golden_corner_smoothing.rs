/*! Corner Smoothing Visual Comparison
 *
 * Simple overlay test: circular corners (red) vs smoothed corners (blue)
 */

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use math2::{rect::Rectangle, transform::AffineTransform};

async fn create_scene() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let box_size = 600.0;
    let corner_radius = 150.0;
    let x = 100.0;
    let y = 100.0;

    println!("Creating overlay comparison:");
    println!("  Box size: {}×{}", box_size, box_size);
    println!("  Corner radius: {}", corner_radius);
    println!("  Smoothing: 1.0 (maximum)");
    println!();

    // Background: Circular corners (s=0.0) - RED stroke
    let mut rect_circular = nf.create_rectangle_node();
    rect_circular.transform = AffineTransform::new(x, y, 0.0);
    rect_circular.size = Size {
        width: box_size,
        height: box_size,
    };
    rect_circular.corner_radius = RectangularCornerRadius::circular(corner_radius);
    rect_circular.corner_smoothing = CornerSmoothing::new(0.0); // Circular
    rect_circular.fills = Paints::default(); // No fill
    rect_circular.strokes = Paints::new([Paint::from(CGColor::from_rgb(255, 50, 50))]);
    rect_circular.stroke_width = 3.0.into();
    rect_circular.stroke_style.stroke_align = StrokeAlign::Center;

    graph.append_child(Node::Rectangle(rect_circular), Parent::Root);

    // Foreground: Maximum smoothing (s=1.0) - BLUE stroke
    let mut rect_smoothed = nf.create_rectangle_node();
    rect_smoothed.transform = AffineTransform::new(x, y, 0.0);
    rect_smoothed.size = Size {
        width: box_size,
        height: box_size,
    };
    rect_smoothed.corner_radius = RectangularCornerRadius::circular(corner_radius);
    rect_smoothed.corner_smoothing = CornerSmoothing::new(1.0); // Maximum smoothing
    rect_smoothed.fills = Paints::default(); // No fill
    rect_smoothed.strokes = Paints::new([Paint::from(CGColor::from_rgb(50, 150, 255))]);
    rect_smoothed.stroke_width = 3.0.into();
    rect_smoothed.stroke_style.stroke_align = StrokeAlign::Center;

    graph.append_child(Node::Rectangle(rect_smoothed), Parent::Root);

    Scene {
        name: "corner smoothing comparison".into(),
        graph,
        background_color: Some(CGColor::BLACK),
    }
}

#[tokio::main]
async fn main() {
    println!("=== Corner Smoothing Visual Test ===\n");

    // Render scene
    let scene = create_scene().await;

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
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/corner_smoothing.png"),
        data.as_bytes(),
    )
    .unwrap();

    renderer.free();

    println!("✅ Test completed");
    println!("   Output: goldens/corner_smoothing.png");
    println!("\n📖 Visual guide:");
    println!("   RED = Circular corners (s=0.0, n=2.0, standard)");
    println!("   BLUE = Smoothed corners (s=1.0, n=10.0, superellipse)");
    println!("\n   If working correctly:");
    println!("   - Blue curve should be 'tighter' at corners");
    println!("   - Red curve should extend further out before turning");
    println!("   - Difference should be clearly visible");
}
