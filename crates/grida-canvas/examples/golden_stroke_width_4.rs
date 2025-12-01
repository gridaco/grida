use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use math2::{rect::Rectangle, transform::AffineTransform};

/// Golden test example demonstrating per-side stroke widths on rectangles.
///
/// This example creates a 4x3 grid (4 rows, 3 columns) showcasing different per-side
/// stroke configurations with all three stroke alignments (Center, Inside, Outside):
/// - Row 1: Uniform stroke baseline (6px all sides) - blue solid
/// - Row 2: Thick horizontal (14px top/bottom, 2px left/right) - blue solid
/// - Row 3: Progressive widths (3px→6px→9px→12px clockwise) - blue solid
/// - Row 4: Dashed strokes with per-side widths (8px/4px alternating) - red dashed
async fn scene() -> Scene {
    create_stroke_width_4_scene()
}

#[tokio::main]
async fn main() {
    let scene = scene().await;

    let width = 800.0;
    let height = 600.0;

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
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/stroke_width_4.png"),
        data.as_bytes(),
    )
    .unwrap();

    println!("Saved goldens/stroke_width_4.png");

    renderer.free();
}

fn create_stroke_width_4_scene() -> Scene {
    let nf = NodeFactory::new();

    // Shared stroke paint (dark blue)
    let stroke_paint = Paint::from(CGColor::from_rgba(41, 98, 255, 255));
    let fill_paint = Paint::from(CGColor::from_rgba(255, 255, 255, 255));

    let rect_width = 180.0;
    let rect_height = 100.0;
    let spacing_x = 220.0;
    let spacing_y = 140.0;
    let start_x = 80.0;
    let start_y = 60.0;

    let mut rectangles = vec![];

    // Row 1: Uniform baseline stroke (6px all sides) with different alignments
    for (col, align) in [
        StrokeAlign::Center,
        StrokeAlign::Inside,
        StrokeAlign::Outside,
    ]
    .iter()
    .enumerate()
    {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(start_x + (col as f32) * spacing_x, start_y, 0.0);
        rect.size = Size {
            width: rect_width,
            height: rect_height,
        };
        rect.fills = Paints::new([fill_paint.clone()]);
        rect.strokes = Paints::new([stroke_paint.clone()]);
        rect.stroke_style.stroke_align = *align;
        rect.stroke_width = StrokeWidth::Uniform(6.0);
        rectangles.push(Node::Rectangle(rect));
    }

    // Row 2: Thick top/bottom (14px), thin left/right (2px) with different alignments
    for (col, align) in [
        StrokeAlign::Center,
        StrokeAlign::Inside,
        StrokeAlign::Outside,
    ]
    .iter()
    .enumerate()
    {
        let mut rect = nf.create_rectangle_node();
        rect.transform =
            AffineTransform::new(start_x + (col as f32) * spacing_x, start_y + spacing_y, 0.0);
        rect.size = Size {
            width: rect_width,
            height: rect_height,
        };
        rect.fills = Paints::new([fill_paint.clone()]);
        rect.strokes = Paints::new([stroke_paint.clone()]);
        rect.stroke_style.stroke_align = *align;
        rect.stroke_width = StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 14.0,
            stroke_right_width: 2.0,
            stroke_bottom_width: 14.0,
            stroke_left_width: 2.0,
        });
        rectangles.push(Node::Rectangle(rect));
    }

    // Row 3: Progressive widths (top=3, right=6, bottom=9, left=12) with different alignments
    for (col, align) in [
        StrokeAlign::Center,
        StrokeAlign::Inside,
        StrokeAlign::Outside,
    ]
    .iter()
    .enumerate()
    {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(
            start_x + (col as f32) * spacing_x,
            start_y + spacing_y * 2.0,
            0.0,
        );
        rect.size = Size {
            width: rect_width,
            height: rect_height,
        };
        rect.fills = Paints::new([fill_paint.clone()]);
        rect.strokes = Paints::new([stroke_paint.clone()]);
        rect.stroke_style.stroke_align = *align;
        rect.stroke_width = StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 3.0,
            stroke_right_width: 6.0,
            stroke_bottom_width: 9.0,
            stroke_left_width: 12.0,
        });
        rectangles.push(Node::Rectangle(rect));
    }

    // Row 4: Dashed per-side strokes with different alignments
    for (col, align) in [
        StrokeAlign::Center,
        StrokeAlign::Inside,
        StrokeAlign::Outside,
    ]
    .iter()
    .enumerate()
    {
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(
            start_x + (col as f32) * spacing_x,
            start_y + spacing_y * 3.0,
            0.0,
        );
        rect.size = Size {
            width: rect_width,
            height: rect_height,
        };
        rect.fills = Paints::new([Paint::from(CGColor::from_rgba(255, 255, 200, 255))]);
        rect.strokes = Paints::new([Paint::from(CGColor::from_rgba(255, 0, 0, 255))]); // Red
        rect.stroke_style.stroke_align = *align;
        rect.stroke_style.stroke_dash_array = Some(StrokeDashArray::from(vec![10.0, 5.0])); // Dashed!
        rect.stroke_width = StrokeWidth::Rectangular(RectangularStrokeWidth {
            stroke_top_width: 8.0,
            stroke_right_width: 4.0,
            stroke_bottom_width: 8.0,
            stroke_left_width: 4.0,
        });
        rectangles.push(Node::Rectangle(rect));
    }

    // Build scene graph
    let mut graph = SceneGraph::new();

    graph.append_children(rectangles, Parent::Root);

    Scene {
        name: "Stroke Width 4 - All Alignments".to_string(),
        background_color: Some(CGColor::from_rgba(240, 242, 245, 255)),
        graph,
    }
}
