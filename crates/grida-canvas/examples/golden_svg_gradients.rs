use cg::cg::prelude::*;
use cg::node::schema::Scene;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};
use cg::svg::pack;
use math2::rect::Rectangle;
use skia_safe::EncodedImageFormat;

const LINEAR_SVG_BYTES: &[u8] =
    include_bytes!("../../../fixtures/test-svg/L0/paint-linear-gradient-01.svg");
const RADIAL_SVG_BYTES: &[u8] =
    include_bytes!("../../../fixtures/test-svg/L0/paint-radial-gradient-01.svg");

fn main() -> Result<(), Box<dyn std::error::Error>> {
    render_scene(
        scene_from_svg(
            LINEAR_SVG_BYTES,
            "svg linear gradient",
            Some(CGColor::from_rgba(240, 240, 240, 255)),
        ),
        200.0,
        200.0,
        "goldens/svg_linear_gradient.png",
    )?;
    render_scene(
        scene_from_svg(
            RADIAL_SVG_BYTES,
            "svg radial gradient",
            Some(CGColor::from_rgba(240, 240, 240, 255)),
        ),
        200.0,
        200.0,
        "goldens/svg_radial_gradient.png",
    )?;
    println!("✅ Wrote svg gradient goldens");
    Ok(())
}

fn scene_from_svg(bytes: &[u8], name: &str, background: Option<CGColor>) -> Scene {
    let svg = std::str::from_utf8(bytes).expect("svg fixture must be utf-8");
    let graph = pack::from_svg_str(svg).expect("failed to parse svg");
    Scene {
        name: name.into(),
        graph,
        background_color: background,
    }
}

fn render_scene(
    scene: Scene,
    width: f32,
    height: f32,
    output: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut renderer = Renderer::new_with_options(
        Backend::new_from_raster(width as i32, height as i32),
        None,
        Camera2D::new_from_bounds(Rectangle::from_xywh(0.0, 0.0, width, height)),
        RendererOptions {
            use_embedded_fonts: true,
        },
    );
    renderer.load_scene(scene);

    let surface = unsafe { &mut *renderer.backend.get_surface() };
    let canvas = surface.canvas();
    renderer.render_to_canvas(canvas, width, height);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .ok_or_else(|| "failed to encode png".to_string())?;
    std::fs::write(
        format!("{}/{}", env!("CARGO_MANIFEST_DIR"), output),
        data.as_bytes(),
    )?;

    renderer.free();
    Ok(())
}
