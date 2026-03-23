//! Cover Image Generator
//!
//! Builds a `.grida` file from the cover scene and renders it to `cover.png`
//! using the cg renderer pipeline.
//!
//! ## Usage
//!
//! ```bash
//! cargo run --package cg --example tool_gen_cover
//! ```
//!
//! ## Output
//!
//! - `fixtures/test-grida/cover.grida` — the scene in `.grida` format
//! - `crates/grida-canvas/cover.png`   — the rendered cover image

mod fixture_helpers;
mod fixtures;

use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use math2::rect::Rectangle;
use skia_safe as sk;

fn main() {
    // ── 1. Build the scene ──────────────────────────────────────────────
    let scene = fixtures::cover::build();

    // ── 2. Write .grida file ────────────────────────────────────────────
    let scenes: Vec<(&str, _)> = vec![("cover", scene.clone())];
    fixture_helpers::write_multi_fixture(&scenes, "cover");

    // ── 3. Render to PNG ────────────────────────────────────────────────
    let width = fixtures::cover::WIDTH;
    let height = fixtures::cover::HEIGHT;

    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, width, height)),
        RendererOptions {
            use_embedded_fonts: true,
            ..Default::default()
        },
    );

    renderer.load_scene(scene);

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let canvas = surface.canvas();
    renderer.render_to_canvas(canvas, width, height);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, sk::EncodedImageFormat::PNG, None)
        .expect("encode cover.png");

    let out_path = concat!(env!("CARGO_MANIFEST_DIR"), "/cover.png");
    std::fs::write(out_path, data.as_bytes()).expect("write cover.png");

    eprintln!("✓ Rendered cover image to {}", out_path);

    renderer.free();
}
