//! Tiny standalone runner for diagnosing a single SVG render path.
//!
//! Usage: `cargo run -p grida_dev --release --example render_one_svg -- path/to/file.svg`
fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: render_one_svg <path>");
    let svg = std::fs::read_to_string(&path).expect("read");
    eprintln!("rendering {path}");
    let now = std::time::Instant::now();
    eprintln!("calling render_to_picture...");
    let res = grida::htmlcss::svg::render_to_picture(&svg, 500.0, 500.0);
    eprintln!("returned from render_to_picture");
    let dt = now.elapsed();
    match res {
        Ok(pic) => {
            eprintln!("Picture OK in {:?}", dt);
            // Now try the rasterization that the reftest does.
            use skia_safe::{surfaces, Color, EncodedImageFormat};
            let mut surface = surfaces::raster_n32_premul((500, 500)).expect("surface");
            {
                let canvas = surface.canvas();
                canvas.clear(Color::TRANSPARENT);
                canvas.draw_picture(&pic, None, None);
            }
            let image = surface.image_snapshot();
            let data = image
                .encode(None, EncodedImageFormat::PNG, None)
                .expect("encode");
            let out = std::env::args()
                .nth(2)
                .unwrap_or_else(|| "/tmp/render_one_svg.png".to_string());
            std::fs::write(&out, data.as_bytes()).expect("write");
            eprintln!("Raster+encode OK total {:?}", now.elapsed());
            eprintln!("wrote {out}");
        }
        Err(e) => eprintln!("Err in {:?}: {e}", dt),
    }
}
