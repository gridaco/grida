//! Pixel-comparison tests for the flatten (shape → vector network) pipeline.
//!
//! Each test renders the original shape path and then renders the vector
//! network that the flatten pipeline would produce (optionally with
//! corner_radius as a PathEffect). The two images are compared via rendiff.

use cg::cg::types::{Radius, RectangularCornerRadius};
use cg::shape::*;
use cg::vectornetwork::VectorNetwork;
use rendiff::Threshold;
use skia_safe::{surfaces, Color4f, ColorSpace, Paint};

/// Render a Skia path to RGBA pixels.
fn render_to_rgba(path: &skia_safe::Path, w: i32, h: i32) -> Vec<[u8; 4]> {
    let mut paint = Paint::new(Color4f::new(1.0, 0.0, 0.0, 1.0), &ColorSpace::new_srgb());
    paint.set_anti_alias(true);
    let mut surface = surfaces::raster_n32_premul((w, h)).expect("surface");
    surface.canvas().clear(Color4f::new(0.0, 0.0, 0.0, 0.0));
    surface.canvas().draw_path(path, &paint);
    let img = surface.image_snapshot();
    let info = img.image_info();
    let row_bytes = info.min_row_bytes();
    let mut raw = vec![0u8; row_bytes * h as usize];
    img.read_pixels(
        &info,
        &mut raw,
        row_bytes,
        skia_safe::IPoint::new(0, 0),
        skia_safe::image::CachingHint::Allow,
    );
    let pixel_count = (w * h) as usize;
    let mut rgba = Vec::with_capacity(pixel_count);
    for i in 0..pixel_count {
        let off = i * 4;
        // Skia N32 premul is BGRA on little-endian → RGBA for rendiff
        rgba.push([raw[off + 2], raw[off + 1], raw[off], raw[off + 3]]);
    }
    rgba
}

/// Apply corner radius to a path via Skia's corner PathEffect.
fn apply_corner_radius(path: &skia_safe::Path, radius: f32) -> skia_safe::Path {
    if radius <= 0.0 {
        return path.clone();
    }
    cg::shape::build_corner_radius_path(path, radius)
}

/// Assert that two rendered images match within the rendiff threshold.
///
/// Allows any number of edge anti-aliasing differences ≤10 and up to 300
/// differences ≤60 per-channel (conic vs cubic rasterization differences).
fn assert_rendiff_match(
    name: &str,
    pixels_a: Vec<[u8; 4]>,
    pixels_b: Vec<[u8; 4]>,
    w: usize,
    h: usize,
) {
    let img_a = imgref::Img::new(pixels_a, w, h);
    let img_b = imgref::Img::new(pixels_b, w, h);
    let diff = rendiff::diff(img_a.as_ref(), img_b.as_ref());
    let threshold = Threshold::new([(10, usize::MAX), (60, 300)]);
    assert!(
        threshold.allows(diff.histogram()),
        "{name}: pixel mismatch exceeds threshold.\n  histogram: {:?}",
        diff.histogram(),
    );
}

// ── Rectangle tests ──────────────────────────────────────────────────────────

#[test]
fn flatten_rect_no_radius() {
    let w = 200;
    let h = 150;
    let shape = RectShape {
        width: w as f32,
        height: h as f32,
    };

    // Original: simple rect path
    let original_path: skia_safe::Path = (&shape).into();
    let original = render_to_rgba(&original_path, w, h);

    // Flattened: rect VN → path (no corner radius)
    let vn = build_rect_vector_network(&shape);
    let vn_paths = vn.to_paths();
    let flattened = render_to_rgba(&vn_paths[0], w, h);

    assert_rendiff_match(
        "rect_no_radius",
        original,
        flattened,
        w as usize,
        h as usize,
    );
}

#[test]
fn flatten_rect_uniform_radius() {
    let w = 200;
    let h = 200;
    let radius = 30.0_f32;
    let corner_radius = RectangularCornerRadius::circular(radius);

    // Rectangle with uniform radius: Bézier curves are baked into the VN.
    // (corner_path PathEffect and native rrect use different math, so
    // baking is the only way to guarantee pixel-identical output.)
    let shape = RRectShape {
        width: w as f32,
        height: h as f32,
        corner_radius,
    };

    let original_path = build_rrect_path(&shape);
    let original = render_to_rgba(&original_path, w, h);

    let vn = build_rrect_vector_network(&shape);
    let vn_paths = vn.to_paths();
    let flattened = render_to_rgba(&vn_paths[0], w, h);

    assert_rendiff_match(
        "rect_uniform_radius",
        original,
        flattened,
        w as usize,
        h as usize,
    );
}

#[test]
fn flatten_rect_non_uniform_radius() {
    let w = 200;
    let h = 150;
    let corner_radius = RectangularCornerRadius {
        tl: Radius::circular(10.0),
        tr: Radius::circular(30.0),
        br: Radius::circular(50.0),
        bl: Radius::circular(20.0),
    };

    let shape = RRectShape {
        width: w as f32,
        height: h as f32,
        corner_radius,
    };

    // Original: rrect path (non-uniform)
    let original_path = build_rrect_path(&shape);
    let original = render_to_rgba(&original_path, w, h);

    // Flattened: bake Bézier curves into VN (no separate corner_radius)
    let vn = build_rrect_vector_network(&shape);
    let vn_paths = vn.to_paths();
    let flattened = render_to_rgba(&vn_paths[0], w, h);

    assert_rendiff_match(
        "rect_non_uniform_radius",
        original,
        flattened,
        w as usize,
        h as usize,
    );
}

// ── Polygon tests ────────────────────────────────────────────────────────────

#[test]
fn flatten_polygon_no_radius() {
    let w = 200;
    let h = 200;

    let shape = RegularPolygonShape {
        width: w as f32,
        height: h as f32,
        point_count: 6,
        corner_radius: 0.0,
    };

    let original_path = build_regular_polygon_path(&shape);
    let original = render_to_rgba(&original_path, w, h);

    let vg = build_regular_polygon_vector_geometry(&shape);
    let vn: VectorNetwork = vg.into();
    let vn_paths = vn.to_paths();
    let flattened = render_to_rgba(&vn_paths[0], w, h);

    assert_rendiff_match(
        "polygon_no_radius",
        original,
        flattened,
        w as usize,
        h as usize,
    );
}

#[test]
fn flatten_polygon_with_radius() {
    let w = 200;
    let h = 200;
    let radius = 15.0_f32;

    let shape = RegularPolygonShape {
        width: w as f32,
        height: h as f32,
        point_count: 5,
        corner_radius: radius,
    };

    // Original: polygon path with corner radius applied
    let original_path = build_regular_polygon_path(&shape);
    let original = render_to_rgba(&original_path, w, h);

    // Flattened: polygon VN (straight) + corner_radius as PathEffect
    let vg = build_regular_polygon_vector_geometry(&shape);
    let vn: VectorNetwork = vg.into();
    let vn_paths = vn.to_paths();
    let rounded_path = apply_corner_radius(&vn_paths[0], radius);
    let flattened = render_to_rgba(&rounded_path, w, h);

    assert_rendiff_match(
        "polygon_with_radius",
        original,
        flattened,
        w as usize,
        h as usize,
    );
}

// ── Star tests ───────────────────────────────────────────────────────────────

#[test]
fn flatten_star_no_radius() {
    let w = 200;
    let h = 200;

    let shape = RegularStarShape {
        width: w as f32,
        height: h as f32,
        inner_radius_ratio: 0.5,
        point_count: 5,
        corner_radius: 0.0,
    };

    let original_path = build_star_path(&shape);
    let original = render_to_rgba(&original_path, w, h);

    let vg = build_star_vector_geometry(&shape);
    let vn: VectorNetwork = vg.into();
    let vn_paths = vn.to_paths();
    let flattened = render_to_rgba(&vn_paths[0], w, h);

    assert_rendiff_match(
        "star_no_radius",
        original,
        flattened,
        w as usize,
        h as usize,
    );
}

#[test]
fn flatten_star_with_radius() {
    let w = 200;
    let h = 200;
    let radius = 10.0_f32;

    let shape = RegularStarShape {
        width: w as f32,
        height: h as f32,
        inner_radius_ratio: 0.4,
        point_count: 6,
        corner_radius: radius,
    };

    let original_path = build_star_path(&shape);
    let original = render_to_rgba(&original_path, w, h);

    let vg = build_star_vector_geometry(&shape);
    let vn: VectorNetwork = vg.into();
    let vn_paths = vn.to_paths();
    let rounded_path = apply_corner_radius(&vn_paths[0], radius);
    let flattened = render_to_rgba(&rounded_path, w, h);

    assert_rendiff_match(
        "star_with_radius",
        original,
        flattened,
        w as usize,
        h as usize,
    );
}

// ── Ellipse test ─────────────────────────────────────────────────────────────

#[test]
fn flatten_ellipse() {
    let w = 200;
    let h = 150;

    let shape = EllipseShape {
        width: w as f32,
        height: h as f32,
    };

    let original_path = build_ellipse_path(&shape);
    let original = render_to_rgba(&original_path, w, h);

    let vn = build_ellipse_vector_network(&shape);
    let vn_paths = vn.to_paths();
    let flattened = render_to_rgba(&vn_paths[0], w, h);

    assert_rendiff_match("ellipse", original, flattened, w as usize, h as usize);
}
