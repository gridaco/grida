//! Golden: Pixel Preview stability sweep
//!
//! Generates a small contact sheet that sweeps pan/zoom while Pixel Preview is enabled,
//! to visually confirm the Stable strategy avoids shimmer (sampling-phase flicker).
//!
//! Output: `crates/grida-canvas/goldens/pixel_preview_stability.png`

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

    // Prefer curved primitives for shimmer/AA stability verification.
    // (Rectangles are less informative for sampling-phase flicker.)
    let mut ellipse = nf.create_ellipse_node();
    ellipse.transform = math2::transform::AffineTransform::new(0.0, 0.0, 0.0);
    ellipse.size = Size {
        width: 16.0,
        height: 16.0,
    };
    ellipse.fills = Paints::new([Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(240, 240, 240, 255),
        blend_mode: BlendMode::default(),
        active: true,
    })]);
    ellipse.strokes = Paints::new([Paint::Solid(SolidPaint::BLACK)]);
    ellipse.stroke_width = SingularStrokeWidth(Some(1.0));

    let mut graph = SceneGraph::new();
    graph.append_children(vec![Node::Ellipse(ellipse)], Parent::Root);

    Scene {
        name: "Pixel Preview Stability".to_string(),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

fn render_frame(scale: u8, zoom: f32, cx: f32, cy: f32) -> skia_safe::Image {
    let (w, h) = (192u32, 192u32);
    let scene = build_scene();

    let mut camera = Camera2D::new(Size {
        width: w as f32,
        height: h as f32,
    });
    camera.set_zoom(zoom);
    camera.set_center(cx, cy);

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
    // Sweep: vary zoom across columns and center-x pan across rows.
    let scale = 1u8;
    // Include zoom values around sizing thresholds to catch phase/parity flips,
    // plus a very high zoom where offscreen dims become tiny (edge-coverage regression test).
    let zooms = [12.9f32, 13.0f32, 13.1f32, 13.2f32, 64.0f32];
    // Center near the ellipse stroke so the very-high-zoom column is informative.
    // (At z=64 the view window is ~3x3 world units, so centering at 8,8 samples only the fill.)
    let pans = [1.0f32, 1.02f32, 1.04f32];

    let frames: Vec<(String, skia_safe::Image)> = pans
        .iter()
        .flat_map(|cx| {
            zooms.iter().map(move |z| {
                let label = format!("z={:.2}, cx={:.2}", z, cx);
                (label, render_frame(scale, *z, *cx, 6.0))
            })
        })
        .collect();

    let padding = 12.0;
    let label_h = 16.0;
    let cell_w = frames[0].1.width() as f32;
    let cell_h = frames[0].1.height() as f32;
    let cols = zooms.len() as f32;
    let rows = pans.len() as f32;

    let out_w = (padding + cols * (cell_w + padding)) as i32;
    let out_h = (padding + rows * (cell_h + label_h + padding)) as i32;

    let mut surface = surfaces::raster_n32_premul((out_w, out_h)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let font = Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        10.0,
    );
    let mut text_paint = SkPaint::default();
    text_paint.set_color(Color::BLACK);
    text_paint.set_anti_alias(true);

    for (idx, (label, img)) in frames.iter().enumerate() {
        let r = idx / zooms.len();
        let c = idx % zooms.len();
        let x = padding + c as f32 * (cell_w + padding);
        let y = padding + r as f32 * (cell_h + label_h + padding);

        canvas.draw_str(label, (x, y + 12.0), &font, &text_paint);
        canvas.draw_image(img, (x, y + label_h), None);

        let mut border = SkPaint::default();
        border.set_color(Color::from_argb(255, 220, 220, 220));
        border.set_style(skia_safe::paint::Style::Stroke);
        border.set_stroke_width(1.0);
        canvas.draw_rect(
            Rect::from_xywh(x, y + label_h, cell_w, cell_h),
            &border,
        );
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/pixel_preview_stability.png"),
        data.as_bytes(),
    )
    .expect("write png");
}

