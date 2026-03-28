//! Pixel-accuracy tests for the translate-fold optimization.
//!
//! Verifies that pre-applying translation to shape coordinates (the fast path)
//! produces identical pixels to the canonical save/concat(matrix)/restore path.
//!
//! The optimization folds pure-translation transforms directly into shape
//! coordinates, eliminating canvas.save(), canvas.concat(), and canvas.restore().
//! These tests verify pixel-identical output at the Skia canvas level.

use skia_safe::{surfaces, Paint, Path, Point, RRect, Rect, Surface};

const W: i32 = 400;
const H: i32 = 400;

fn make_surface() -> Surface {
    surfaces::raster_n32_premul((W, H)).expect("surface")
}

/// Read RGBA pixels from a surface.
fn surface_to_rgba(surface: &mut Surface) -> Vec<[u8; 4]> {
    let img = surface.image_snapshot();
    let info = img.image_info();
    let row_bytes = info.min_row_bytes();
    let mut raw = vec![0u8; row_bytes * H as usize];
    img.read_pixels(
        &info,
        &mut raw,
        row_bytes,
        skia_safe::IPoint::new(0, 0),
        skia_safe::image::CachingHint::Allow,
    );
    let pixel_count = (W * H) as usize;
    let mut rgba = Vec::with_capacity(pixel_count);
    for i in 0..pixel_count {
        let off = i * 4;
        // Skia N32 premul is BGRA on little-endian → RGBA
        rgba.push([raw[off + 2], raw[off + 1], raw[off], raw[off + 3]]);
    }
    rgba
}

/// Assert pixel-identical output (0 diff tolerance).
fn assert_pixels_identical(name: &str, a: &[[u8; 4]], b: &[[u8; 4]]) {
    assert_eq!(a.len(), b.len(), "{name}: pixel count mismatch");
    let mut diff_count = 0;
    let mut max_diff = 0u8;
    for (pa, pb) in a.iter().zip(b.iter()) {
        for c in 0..4 {
            let d = (pa[c] as i16 - pb[c] as i16).unsigned_abs() as u8;
            if d > 0 {
                diff_count += 1;
                max_diff = max_diff.max(d);
            }
        }
    }
    assert_eq!(
        diff_count, 0,
        "{name}: {diff_count} channel diffs found (max diff: {max_diff})"
    );
}

// ── Rect tests ──────────────────────────────────────────────────────────

/// Test: draw_rect via save/concat/restore vs draw_rect with pre-translated coords.
#[test]
fn translate_fold_rect_pixel_identical() {
    let local_rect = Rect::from_xywh(0.0, 0.0, 50.0, 35.0);
    let offsets: &[(f32, f32)] = &[
        (10.0, 20.0),
        (100.5, 50.5),   // sub-pixel
        (0.0, 0.0),      // identity
        (200.0, 300.0),  // large offset
        (0.3, 0.7),      // fractional
        (123.456, 78.9), // non-round
    ];

    for &(tx, ty) in offsets {
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(200, 255, 0, 0));

        // Path A: canonical save/concat/restore
        let mut sa = make_surface();
        {
            let canvas = sa.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            canvas.save();
            let m = skia_safe::Matrix::translate((tx, ty));
            canvas.concat(&m);
            canvas.draw_rect(local_rect, &paint);
            canvas.restore();
        }
        let pixels_a = surface_to_rgba(&mut sa);

        // Path B: pre-translated rect (the optimization)
        let mut sb = make_surface();
        {
            let canvas = sb.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            canvas.draw_rect(local_rect.with_offset((tx, ty)), &paint);
        }
        let pixels_b = surface_to_rgba(&mut sb);

        assert_pixels_identical(&format!("rect({tx},{ty})"), &pixels_a, &pixels_b);
    }
}

// ── RRect tests ──────────────────────────────────────────────────────────

/// Test: draw_rrect via save/concat/restore vs draw_rrect with with_offset.
#[test]
fn translate_fold_rrect_pixel_identical() {
    let local_rrect = RRect::new_rect_xy(Rect::from_xywh(0.0, 0.0, 60.0, 45.0), 8.0, 8.0);
    let offsets: &[(f32, f32)] = &[
        (15.0, 25.0),
        (80.5, 40.5),
        (0.0, 0.0),
        (150.0, 200.0),
        (0.25, 0.75),
    ];

    for &(tx, ty) in offsets {
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(180, 0, 128, 255));

        // Path A: save/concat/restore
        let mut sa = make_surface();
        {
            let canvas = sa.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            canvas.save();
            canvas.concat(&skia_safe::Matrix::translate((tx, ty)));
            canvas.draw_rrect(local_rrect, &paint);
            canvas.restore();
        }
        let pixels_a = surface_to_rgba(&mut sa);

        // Path B: with_offset (the optimization)
        let mut sb = make_surface();
        {
            let canvas = sb.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            canvas.draw_rrect(local_rrect.with_offset((tx, ty)), &paint);
        }
        let pixels_b = surface_to_rgba(&mut sb);

        assert_pixels_identical(&format!("rrect({tx},{ty})"), &pixels_a, &pixels_b);
    }
}

// ── Oval tests ──────────────────────────────────────────────────────────

/// Test: draw_oval via save/concat/restore vs draw_oval with pre-translated rect.
#[test]
fn translate_fold_oval_pixel_identical() {
    let local_oval = Rect::from_xywh(0.0, 0.0, 50.0, 35.0);
    let offsets: &[(f32, f32)] = &[
        (20.0, 30.0),
        (90.5, 60.5),
        (0.0, 0.0),
        (180.0, 250.0),
        (0.1, 0.9),
    ];

    for &(tx, ty) in offsets {
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(220, 0, 200, 100));

        // Path A: save/concat/restore
        let mut sa = make_surface();
        {
            let canvas = sa.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            canvas.save();
            canvas.concat(&skia_safe::Matrix::translate((tx, ty)));
            canvas.draw_oval(local_oval, &paint);
            canvas.restore();
        }
        let pixels_a = surface_to_rgba(&mut sa);

        // Path B: translated oval rect (the optimization)
        let mut sb = make_surface();
        {
            let canvas = sb.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            canvas.draw_oval(local_oval.with_offset((tx, ty)), &paint);
        }
        let pixels_b = surface_to_rgba(&mut sb);

        assert_pixels_identical(&format!("oval({tx},{ty})"), &pixels_a, &pixels_b);
    }
}

// ── Opacity tests ───────────────────────────────────────────────────────

/// Test: translating a semi-transparent rect preserves opacity blending.
#[test]
fn translate_fold_opacity_pixel_identical() {
    let local_rect = Rect::from_xywh(0.0, 0.0, 60.0, 40.0);
    let offsets: &[(f32, f32)] = &[(30.0, 40.0), (100.5, 70.5), (0.0, 0.0)];
    let opacities: &[f32] = &[0.5, 0.3, 0.8, 0.1, 1.0];

    for &(tx, ty) in offsets {
        for &opacity in opacities {
            let mut paint = Paint::default();
            paint.set_anti_alias(true);
            // Bake opacity into paint alpha (this is what per-paint-alpha does)
            paint.set_color(skia_safe::Color::from_argb(
                (255.0 * opacity) as u8,
                200,
                50,
                50,
            ));

            // Path A: save/concat/restore
            let mut sa = make_surface();
            {
                let canvas = sa.canvas();
                canvas.clear(skia_safe::Color::WHITE);
                canvas.save();
                canvas.concat(&skia_safe::Matrix::translate((tx, ty)));
                canvas.draw_rect(local_rect, &paint);
                canvas.restore();
            }
            let pixels_a = surface_to_rgba(&mut sa);

            // Path B: pre-translated
            let mut sb = make_surface();
            {
                let canvas = sb.canvas();
                canvas.clear(skia_safe::Color::WHITE);
                canvas.draw_rect(local_rect.with_offset((tx, ty)), &paint);
            }
            let pixels_b = surface_to_rgba(&mut sb);

            assert_pixels_identical(
                &format!("opacity({tx},{ty},a={opacity})"),
                &pixels_a,
                &pixels_b,
            );
        }
    }
}

// ── Multi-shape scene test ──────────────────────────────────────────────

/// Test: render multiple shapes at different positions to verify that
/// translate-fold produces identical composited output.
#[test]
fn translate_fold_multi_shape_scene_pixel_identical() {
    struct ShapeDef {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        color: skia_safe::Color,
    }

    let shapes = vec![
        ShapeDef {
            x: 10.0,
            y: 10.0,
            w: 40.0,
            h: 30.0,
            color: skia_safe::Color::from_argb(255, 255, 0, 0),
        },
        ShapeDef {
            x: 60.0,
            y: 20.0,
            w: 50.0,
            h: 40.0,
            color: skia_safe::Color::from_argb(200, 0, 255, 0),
        },
        ShapeDef {
            x: 120.5,
            y: 80.5,
            w: 35.0,
            h: 25.0,
            color: skia_safe::Color::from_argb(180, 0, 0, 255),
        },
        ShapeDef {
            x: 200.0,
            y: 150.0,
            w: 60.0,
            h: 50.0,
            color: skia_safe::Color::from_argb(150, 255, 255, 0),
        },
        ShapeDef {
            x: 50.0,
            y: 250.0,
            w: 80.0,
            h: 20.0,
            color: skia_safe::Color::from_argb(255, 128, 0, 255),
        },
        ShapeDef {
            x: 300.0,
            y: 10.0,
            w: 45.0,
            h: 45.0,
            color: skia_safe::Color::from_argb(200, 0, 200, 200),
        },
    ];

    // Path A: each shape drawn via save/concat/restore
    let mut sa = make_surface();
    {
        let canvas = sa.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        for s in &shapes {
            let local_rect = Rect::from_xywh(0.0, 0.0, s.w, s.h);
            let mut paint = Paint::default();
            paint.set_anti_alias(true);
            paint.set_color(s.color);
            canvas.save();
            canvas.concat(&skia_safe::Matrix::translate((s.x, s.y)));
            canvas.draw_rect(local_rect, &paint);
            canvas.restore();
        }
    }
    let pixels_a = surface_to_rgba(&mut sa);

    // Path B: each shape drawn with pre-translated coords
    let mut sb = make_surface();
    {
        let canvas = sb.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        for s in &shapes {
            let translated_rect = Rect::from_xywh(s.x, s.y, s.w, s.h);
            let mut paint = Paint::default();
            paint.set_anti_alias(true);
            paint.set_color(s.color);
            canvas.draw_rect(translated_rect, &paint);
        }
    }
    let pixels_b = surface_to_rgba(&mut sb);

    assert_pixels_identical("multi-shape-scene", &pixels_a, &pixels_b);
}

// ── Path fallback test ──────────────────────────────────────────────────

/// Test: for path shapes, the optimization falls back to save/translate/restore.
/// Verify this still matches save/concat(full_matrix)/restore.
#[test]
fn translate_fold_path_fallback_pixel_identical() {
    let path = Path::polygon(
        &[
            Point::new(0.0, 0.0),
            Point::new(30.0, 0.0),
            Point::new(30.0, 20.0),
            Point::new(15.0, 30.0),
            Point::new(0.0, 20.0),
        ],
        true,
        None,
        None,
    );

    let offsets: &[(f32, f32)] = &[(50.0, 50.0), (150.5, 100.5), (0.0, 0.0)];

    for &(tx, ty) in offsets {
        let mut paint = Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(skia_safe::Color::from_argb(255, 200, 100, 50));

        // Path A: save/concat(translate_matrix)/restore
        let mut sa = make_surface();
        {
            let canvas = sa.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            canvas.save();
            canvas.concat(&skia_safe::Matrix::translate((tx, ty)));
            canvas.draw_path(&path, &paint);
            canvas.restore();
        }
        let pixels_a = surface_to_rgba(&mut sa);

        // Path B: save/translate/draw/restore (the optimization's fallback)
        let mut sb = make_surface();
        {
            let canvas = sb.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            if tx == 0.0 && ty == 0.0 {
                canvas.draw_path(&path, &paint);
            } else {
                canvas.save();
                canvas.translate((tx, ty));
                canvas.draw_path(&path, &paint);
                canvas.restore();
            }
        }
        let pixels_b = surface_to_rgba(&mut sb);

        assert_pixels_identical(&format!("path({tx},{ty})"), &pixels_a, &pixels_b);
    }
}
