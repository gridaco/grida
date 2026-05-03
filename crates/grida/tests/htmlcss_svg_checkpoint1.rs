//! Checkpoint 1 visual proof for `htmlcss::svg`.
//!
//! Renders a small SVG covering every shape the new pipeline supports and
//! writes a PNG to `target/htmlcss_svg_checkpoint1.png`. Open that file
//! to verify the renderer is producing pixels at all — there is no oracle
//! comparison here yet (that's checkpoint 3, against the resvg-test-suite).

use grida::htmlcss::svg;
use skia_safe::{surfaces, Color, EncodedImageFormat};

const FIXTURE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <rect x="0"   y="0"  width="200" height="100" fill="#f0f0f0"/>

  <!-- plain rect -->
  <rect x="10" y="10" width="40" height="40" fill="red"/>

  <!-- rounded rect -->
  <rect x="60" y="10" width="40" height="40" rx="10" ry="10" fill="green"/>

  <!-- circle + ellipse -->
  <circle cx="130" cy="30" r="20" fill="rgb(0,0,255)"/>
  <ellipse cx="170" cy="30" rx="20" ry="12" fill="orange"/>

  <!-- stroke-only line -->
  <line x1="10" y1="80" x2="60" y2="80" stroke="black" stroke-width="3"/>

  <!-- polygon (filled, with stroke) -->
  <polygon points="80,90 100,60 120,90" fill="purple" stroke="black" stroke-width="2"/>

  <!-- polyline (open, stroke only) -->
  <polyline points="140,90 150,70 160,90 170,70 180,90"
            fill="none" stroke="teal" stroke-width="2"/>

  <!-- group with transform -->
  <g transform="translate(0, 0) scale(1)">
    <rect x="190" y="90" width="8" height="8" fill="black"/>
  </g>
</svg>"##;

#[test]
fn checkpoint1_renders_basic_shapes_to_png() {
    let (w, h) = (400i32, 200i32);

    let picture = svg::render_to_picture(FIXTURE, w as f32, h as f32)
        .expect("render_to_picture should succeed");

    let mut surface = surfaces::raster_n32_premul((w, h)).expect("raster surface");
    {
        let canvas = surface.canvas();
        canvas.clear(Color::WHITE);
        canvas.draw_picture(&picture, None, None);
    }
    let image = surface.image_snapshot();
    let png = image
        .encode(None, EncodedImageFormat::PNG, None)
        .expect("encode PNG");

    let out_dir = std::path::PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    std::fs::create_dir_all(&out_dir).ok();
    let out_path = out_dir.join("htmlcss_svg_checkpoint1.png");
    std::fs::write(&out_path, png.as_bytes()).expect("write PNG");

    eprintln!("checkpoint1 PNG: {}", out_path.display());

    // Sanity check: the picture must contain at least one non-trivial draw.
    // A reasonable proxy is "image has at least one non-white pixel".
    let pixmap = image.peek_pixels().expect("peek pixels");
    let bytes = pixmap.bytes().expect("bytes");
    let any_non_white = bytes.chunks_exact(4).any(|px| {
        // BGRA / RGBA — for non-white check we just need any byte < 255.
        px[0] < 255 || px[1] < 255 || px[2] < 255
    });
    assert!(
        any_non_white,
        "rendered PNG is all white — pipeline produced no draws"
    );
}

#[test]
fn checkpoint1_render_into_canvas_succeeds() {
    let svg_xml = br#"<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">
        <rect x="0" y="0" width="50" height="50" fill="red"/>
    </svg>"#;

    let mut surface = surfaces::raster_n32_premul((50, 50)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    svg::render_into(
        canvas,
        svg_xml,
        skia_safe::Rect::from_xywh(0.0, 0.0, 50.0, 50.0),
        &grida::htmlcss::NoImages,
    )
    .expect("render_into should succeed");

    let image = surface.image_snapshot();
    let pixmap = image.peek_pixels().expect("peek pixels");
    let bytes = pixmap.bytes().expect("bytes");
    // Centre pixel of a fully-red rect should be red.
    let stride = pixmap.row_bytes();
    let center = (25 * stride) + (25 * 4);
    let center_px = &bytes[center..center + 4];
    // raster_n32_premul layout varies by platform; treat any of (R-high) or
    // (B-high) as evidence the red rect was painted (i.e. only the red
    // channel saturated, others ~0).
    let red_first = center_px[0] > 200 && center_px[1] < 50 && center_px[2] < 50;
    let blue_first = center_px[2] > 200 && center_px[1] < 50 && center_px[0] < 50;
    assert!(
        red_first || blue_first,
        "expected solid-red center pixel, got {:?}",
        center_px
    );
}
