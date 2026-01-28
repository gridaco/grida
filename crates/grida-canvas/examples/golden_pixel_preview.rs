//! Golden: Pixel Preview (Normal vs Pixelated)
//!
//! Renders the same simple scene at a high zoom twice:
//! - Normal rendering (smooth, re-rasterized vectors)
//! - Pixel Preview 1x (downsample then nearest-neighbor upscale)
//!
//! Output: `crates/grida-canvas/goldens/pixel_preview.png`

use cg::cg::prelude::*;
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::runtime::{
    camera::Camera2D,
    scene::{Backend, FrameFlushResult, Renderer, RendererOptions},
};
use skia_safe::{surfaces, Color, Font, Paint as SkPaint, Rect};

fn build_scene() -> Scene {
    let nf = NodeFactory::new();

    // A small stroked rectangle (1px stroke) so pixelation is obvious when zoomed.
    let mut rect = nf.create_rectangle_node();
    rect.transform = math2::transform::AffineTransform::new(0.0, 0.0, 0.0);
    rect.size = Size {
        width: 6.0,
        height: 6.0,
    };
    rect.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(240, 240, 240, 255),
        blend_mode: BlendMode::default(),
        active: true,
    }));
    rect.strokes = Paints::new([Paint::Solid(SolidPaint::BLACK)]);
    rect.stroke_width = StrokeWidth::Uniform(1.0);

    // A stroked ellipse to make jagged curves obvious in pixel preview.
    let mut ellipse = nf.create_ellipse_node();
    ellipse.transform = math2::transform::AffineTransform::new(8.0, 0.0, 0.0);
    ellipse.size = Size {
        width: 6.0,
        height: 6.0,
    };
    ellipse.fills = Paints::new([Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(240, 240, 240, 255),
        blend_mode: BlendMode::default(),
        active: true,
    })]);
    ellipse.strokes = Paints::new([Paint::Solid(SolidPaint::BLACK)]);
    ellipse.stroke_width = SingularStrokeWidth(Some(1.0));

    let mut graph = SceneGraph::new();
    graph.append_children(
        vec![Node::Rectangle(rect), Node::Ellipse(ellipse)],
        Parent::Root,
    );

    Scene {
        name: "Pixel Preview Golden".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

fn render_with_pixel_preview(scale: u8) -> skia_safe::Image {
    let (w, h) = (256u32, 256u32);
    let scene = build_scene();

    let mut camera = Camera2D::new(Size {
        width: w as f32,
        height: h as f32,
    });
    // High zoom so the effect is obvious (but still recognizable).
    camera.set_zoom(24.0);
    camera.set_center(7.0, 3.0);

    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(w as i32, h as i32),
        None,
        camera,
        RendererOptions {
            use_embedded_fonts: true,
        },
    );

    renderer.load_scene(scene);
    renderer.set_pixel_preview_scale(scale);
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
    let normal = render_with_pixel_preview(0);
    let pixel_1x = render_with_pixel_preview(1);

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
    canvas.draw_image(&pixel_1x, (right_x, top_y), None);

    // Labels
    let font = Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        12.0,
    );
    let mut paint = SkPaint::default();
    paint.set_color(Color::BLACK);
    paint.set_anti_alias(true);
    canvas.draw_str("Normal", (left_x, padding + 12.0), &font, &paint);
    canvas.draw_str("Pixel Preview 1x", (right_x, padding + 12.0), &font, &paint);

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
        Rect::from_xywh(right_x, top_y, normal.width() as f32, normal.height() as f32),
        &border,
    );

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/pixel_preview.png"),
        data.as_bytes(),
    )
    .expect("write png");
}

