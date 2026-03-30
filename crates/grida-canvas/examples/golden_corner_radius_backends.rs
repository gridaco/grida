//! # Corner Radius Backends: Visual Comparison
//!
//! This example demonstrates that Skia's native rrect and the `corner_path`
//! PathEffect produce **different curves** for the same corner radius value.
//!
//! Output: `goldens/corner_radius_backends.png`
//!
//! The image shows three columns at two different radii:
//! - **Red** — Native `SkRRect` (conic arcs, true circular corners)
//! - **Blue** — `PathEffect::corner_path` on a sharp rect path
//! - **Overlay** — Both drawn with 50% opacity to visualize the difference
//!
//! See `shape/corner.rs` for full documentation of this limitation.

use cg::cg::types::RectangularCornerRadius;
use cg::shape::*;
use skia_safe::{surfaces, Color, Color4f, ColorSpace, Paint};

fn main() {
    let radii = [40.0_f32, 80.0_f32];
    let shape_w = 300.0_f32;
    let shape_h = 300.0_f32;
    let pad = 30.0_f32;
    let col_w = shape_w + pad;
    let row_h = shape_h + pad;

    let canvas_w = (col_w * 3.0 + pad) as i32;
    let canvas_h = (row_h * radii.len() as f32 + pad) as i32;

    let mut surface = surfaces::raster_n32_premul((canvas_w, canvas_h)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Paints
    let mut paint_rrect = Paint::new(Color4f::new(0.84, 0.36, 0.36, 1.0), &ColorSpace::new_srgb());
    paint_rrect.set_anti_alias(true);

    let mut paint_corner = Paint::new(Color4f::new(0.20, 0.47, 0.76, 1.0), &ColorSpace::new_srgb());
    paint_corner.set_anti_alias(true);

    let mut paint_rrect_overlay = paint_rrect.clone();
    paint_rrect_overlay.set_alpha_f(0.5);
    let mut paint_corner_overlay = paint_corner.clone();
    paint_corner_overlay.set_alpha_f(0.5);

    for (row, &radius) in radii.iter().enumerate() {
        let y = pad + row as f32 * row_h;

        // Build paths
        let rect_shape = RectShape {
            width: shape_w,
            height: shape_h,
        };
        let rect_path: skia_safe::Path = (&rect_shape).into();
        let corner_effect_path = build_corner_radius_path(&rect_path, radius);

        let rrect_shape = RRectShape {
            width: shape_w,
            height: shape_h,
            corner_radius: RectangularCornerRadius::circular(radius),
        };
        let rrect_path = build_rrect_path(&rrect_shape);

        // Col 1: Native rrect (red)
        canvas.save();
        canvas.translate((pad, y));
        canvas.draw_path(&rrect_path, &paint_rrect);
        canvas.restore();

        // Col 2: corner_path effect (blue)
        canvas.save();
        canvas.translate((pad + col_w, y));
        canvas.draw_path(&corner_effect_path, &paint_corner);
        canvas.restore();

        // Col 3: Overlay
        canvas.save();
        canvas.translate((pad + col_w * 2.0, y));
        canvas.draw_path(&rrect_path, &paint_rrect_overlay);
        canvas.draw_path(&corner_effect_path, &paint_corner_overlay);
        canvas.restore();
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    let out_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/goldens/corner_radius_backends.png"
    );
    std::fs::write(out_path, data.as_bytes()).unwrap();
    println!("Written to {out_path}");
}
