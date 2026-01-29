//! Golden: Outline Mode (Normal vs Outline)
//!
//! Renders the same scene twice:
//! - Normal rendering (fills, strokes, effects)
//! - Wireframe policy (geometry-only outlines, #444444)
//!
//! Output: `crates/grida-canvas/goldens/outline_mode.png`

use cg::cg::prelude::*;
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::runtime::{
    camera::Camera2D,
    render_policy::RenderPolicy,
    scene::{Backend, FrameFlushResult, Renderer, RendererOptions},
};
use skia_safe::{surfaces, Color, Font, Paint as SkPaint, Rect};

fn build_scene() -> Scene {
    let nf = NodeFactory::new();

    // 1. Circle (filled)
    let mut circle = nf.create_ellipse_node();
    // Camera is center-based (world origin at viewport center), so use signed positions.
    circle.transform = math2::transform::AffineTransform::new(-32.0, -24.0, 0.0);
    circle.size = Size {
        width: 44.0,
        height: 44.0,
    };
    circle.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(255, 0, 0, 255),
        blend_mode: BlendMode::default(),
        active: true,
    }));
    circle.strokes = Paints::new([Paint::Solid(SolidPaint::BLACK)]);
    circle.stroke_width = SingularStrokeWidth(Some(3.0));

    // 2. Triangle (regular polygon, filled)
    let mut triangle = nf.create_regular_polygon_node();
    triangle.transform = math2::transform::AffineTransform::new(32.0, -24.0, 0.0);
    triangle.size = Size {
        width: 44.0,
        height: 44.0,
    };
    triangle.point_count = 3;
    triangle.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(0, 153, 255, 255),
        blend_mode: BlendMode::default(),
        active: true,
    }));
    triangle.strokes = Paints::new([Paint::Solid(SolidPaint::BLACK)]);
    triangle.stroke_width = SingularStrokeWidth(Some(3.0));

    // 3. Text (single text node)
    let mut text = nf.create_text_span_node();
    text.transform = math2::transform::AffineTransform::new(-52.0, 28.0, 0.0);
    text.text = "Outline".to_string();
    text.fills = Paints::new([Paint::Solid(SolidPaint::BLACK)]);
    text.text_style.font_size = 26.0;
    text.text_style.font_family = "Geist Mono".to_string();

    let mut graph = SceneGraph::new();
    graph.append_children(
        vec![
            Node::Ellipse(circle),
            Node::RegularPolygon(triangle),
            Node::TextSpan(text),
        ],
        Parent::Root,
    );

    Scene {
        name: "Outline Mode Golden".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

fn render_with_outline_mode(outline: bool) -> skia_safe::Image {
    let (w, h) = (128u32, 128u32);
    let scene = build_scene();

    let mut camera = Camera2D::new(Size {
        width: w as f32,
        height: h as f32,
    });
    camera.set_zoom(1.0);

    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(w as i32, h as i32),
        None,
        camera,
        RendererOptions {
            use_embedded_fonts: true,
        },
    );

    renderer.load_scene(scene);
    renderer.set_render_policy(if outline {
        RenderPolicy::WIREFRAME_DEFAULT
    } else {
        RenderPolicy::STANDARD
    });
    renderer.queue_unstable();

    match renderer.flush() {
        FrameFlushResult::OK(_) => {}
        _ => panic!("expected rendered frame"),
    }

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let image = surface.image_snapshot();
    renderer.free();
    image
}

fn main() {
    let normal = render_with_outline_mode(false);
    let outline = render_with_outline_mode(true);

    let padding = 16.0;
    let label_h = 18.0;
    let out_w = (normal.width() as f32 * 2.0 + padding * 3.0) as i32;
    let out_h = (normal.height() as f32 + padding * 2.0 + label_h) as i32;

    let mut surface = surfaces::raster_n32_premul((out_w, out_h)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let left_x = padding;
    let top_y = padding + label_h;
    let right_x = padding * 2.0 + normal.width() as f32;

    // Draw images
    canvas.draw_image(&normal, (left_x, top_y), None);
    canvas.draw_image(&outline, (right_x, top_y), None);

    // Labels
    let font = Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        12.0,
    );
    let mut paint = SkPaint::default();
    paint.set_color(Color::BLACK);
    paint.set_anti_alias(true);
    canvas.draw_str("Normal", (left_x, padding + 12.0), &font, &paint);
    canvas.draw_str("Outline Mode", (right_x, padding + 12.0), &font, &paint);

    // Frame separators (optional)
    let mut border = SkPaint::default();
    border.set_color(Color::from_argb(255, 220, 220, 220));
    border.set_style(skia_safe::paint::Style::Stroke);
    border.set_stroke_width(1.0);
    canvas.draw_rect(
        Rect::from_xywh(left_x, top_y, normal.width() as f32, normal.height() as f32),
        &border,
    );
    canvas.draw_rect(
        Rect::from_xywh(
            right_x,
            top_y,
            normal.width() as f32,
            normal.height() as f32,
        ),
        &border,
    );

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/outline_mode.png"),
        data.as_bytes(),
    )
    .expect("write png");
}
