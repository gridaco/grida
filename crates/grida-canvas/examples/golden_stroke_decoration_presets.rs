//! # Stroke Decoration Presets — Built-in shapes catalog
//!
//! **Purpose**: Show exactly what end-users see in the Grida editor.
//!
//! Uses the **real Grida renderer** pipeline (`Renderer` → layer flattening →
//! painter → marker module) with `LineNodeRec` — the same code path as the
//! production editor.
//!
//! Each built-in `StrokeMarkerPreset` preset is shown at **10 px stroke width**
//! on a straight line with decoration at the **end** endpoint only.
//! Red vertical guidelines mark the logical start and end.

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

const LINE_LENGTH: f32 = 400.0;
const STROKE_W: f32 = 10.0;
const LEFT: f32 = 80.0;
const ROW_H: f32 = 90.0;

fn build_scene() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let presets: Vec<(&str, StrokeMarkerPreset)> = vec![
        ("none", StrokeMarkerPreset::None),
        ("right_triangle_open", StrokeMarkerPreset::RightTriangleOpen),
        ("equilateral_triangle", StrokeMarkerPreset::EquilateralTriangle),
        ("circle", StrokeMarkerPreset::Circle),
        ("square", StrokeMarkerPreset::Square),
        ("diamond", StrokeMarkerPreset::Diamond),
        ("vertical_bar", StrokeMarkerPreset::VerticalBar),
    ];

    for (i, (_label, decoration)) in presets.iter().enumerate() {
        let y = 60.0 + i as f32 * ROW_H;

        let mut line = nf.create_line_node();
        line.transform = AffineTransform::new(LEFT, y, 0.0);
        line.size = Size {
            width: LINE_LENGTH,
            height: 0.0,
        };
        line.stroke_width = STROKE_W;
        line.strokes = Paints::new([Paint::from(CGColor::from_rgba(40, 40, 40, 255))]);
        line.stroke_cap = StrokeCap::Butt;
        line.marker_start_shape = StrokeMarkerPreset::None;
        line.marker_end_shape = *decoration;

        graph.append_child(Node::Line(line), Parent::Root);
    }

    Scene {
        name: "stroke decoration presets".into(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

#[tokio::main]
async fn main() {
    let scene = build_scene();

    let width = 600.0;
    let height = 60.0 + 7.0 * ROW_H + 40.0;

    let mut renderer = Renderer::new(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, width, height)),
    );
    renderer.load_scene(scene);

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let canvas = surface.canvas();

    // Render scene (strokes + decorations via real pipeline)
    renderer.render_to_canvas(canvas, width, height);

    // Overlay: red guidelines + labels (drawn after renderer, on top)
    let font = skia_safe::Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        12.0,
    );
    let label_paint = {
        let mut p = skia_safe::Paint::default();
        p.set_anti_alias(true);
        p.set_color(skia_safe::Color::from_rgb(80, 80, 80));
        p
    };
    let guide_paint = {
        let mut p = skia_safe::Paint::default();
        p.set_anti_alias(true);
        p.set_style(skia_safe::PaintStyle::Stroke);
        p.set_stroke_width(1.0);
        p.set_color(skia_safe::Color::from_rgb(220, 40, 40));
        p
    };
    let section_paint = {
        let mut p = skia_safe::Paint::default();
        p.set_anti_alias(true);
        p.set_color(skia_safe::Color::from_rgb(160, 160, 160));
        p
    };
    let title_font = skia_safe::Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        11.0,
    );

    canvas.draw_str(
        &format!("Built-in presets  |  sw={STROKE_W}  |  red = logical endpoint"),
        skia_safe::Point::new(LEFT, 25.0),
        &title_font,
        &section_paint,
    );

    let labels = [
        "none",
        "right_triangle_open",
        "equilateral_triangle",
        "circle",
        "square",
        "diamond",
        "vertical_bar",
    ];

    for (i, label) in labels.iter().enumerate() {
        let y = 60.0 + i as f32 * ROW_H;

        // Red guides
        canvas.draw_line(
            skia_safe::Point::new(LEFT, y - 35.0),
            skia_safe::Point::new(LEFT, y + 35.0),
            &guide_paint,
        );
        canvas.draw_line(
            skia_safe::Point::new(LEFT + LINE_LENGTH, y - 35.0),
            skia_safe::Point::new(LEFT + LINE_LENGTH, y + 35.0),
            &guide_paint,
        );

        // Label
        canvas.draw_str(
            label,
            skia_safe::Point::new(LEFT, y + 48.0),
            &font,
            &label_paint,
        );
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let out = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/goldens/stroke_decoration_presets.png"
    );
    std::fs::write(out, data.as_bytes()).unwrap();
    println!("Saved {}", out);

    renderer.free();
}
