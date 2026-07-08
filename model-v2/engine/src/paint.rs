//! ENG-2.1 · the paint executor — the ONLY module that touches skia
//! (containment rule S-1; a later core/paint crate split is then
//! mechanical). `execute(canvas, drawlist, view, ctx)` (step 6) replays a
//! [`DrawList`](crate::drawlist::DrawList) onto a skia `Canvas`,
//! composing `view.then(&item.world)` per item in the exact mathematical
//! form the current spike painter uses — pixel identity is a property of
//! doing the same float ops in the same order, not a tolerance.

use anchor_lab::math::Affine;
use skia_safe::{Canvas, Color, Font, ImageInfo, Matrix, Paint, PaintStyle, Rect};

use crate::drawlist::{Argb, DrawList, ItemKind};

/// Host-supplied paint state the drawlist does not carry: the resolved
/// typeface (mirrors the spike painter's field; `None` skips text, which
/// is today's behavior when no system face is found).
pub struct PaintCtx {
    pub font: Option<skia_safe::Typeface>,
}

/// Row-major `Affine` -> skia `Matrix`, byte-identical to the spike
/// painter's `skia_matrix` (SVG a b c d e f order).
fn skia_matrix(t: &Affine) -> Matrix {
    Matrix::new_all(t.a, t.c, t.e, t.b, t.d, t.f, 0.0, 0.0, 1.0)
}

/// Packed 0xAARRGGBB -> skia `Color`. Colors are already opaque and resolved
/// at build time, so this is a pure repack.
fn color(argb: Argb) -> Color {
    Color::new(argb)
}

/// Replay a [`DrawList`] onto a skia canvas under `view`. Each item composes
/// `view.then(&item.world)` — the exact call and operands the spike painter
/// used (`item.world` is the resolver's world, copied verbatim) — sets it as
/// the absolute matrix, and issues the same skia draw with the same final
/// `Paint` state. Per-item save/restore is pixel-neutral because the matrix
/// is set absolutely each time; a frame's fill and stroke are two items with
/// the same world, so they land identically to the painter's single-save
/// fill-then-stroke.
pub fn execute(canvas: &Canvas, list: &DrawList, view: &Affine, ctx: &PaintCtx) {
    for item in &list.items {
        let total = view.then(&item.world);
        canvas.save();
        canvas.set_matrix(&skia_matrix(&total).into());
        match &item.kind {
            ItemKind::RectFill { w, h, argb } => {
                let mut p = Paint::default();
                p.set_anti_alias(true);
                p.set_color(color(*argb));
                canvas.draw_rect(Rect::from_wh(*w, *h), &p);
            }
            ItemKind::RectStroke {
                w,
                h,
                argb,
                stroke_width,
            } => {
                let mut p = Paint::default();
                p.set_anti_alias(true);
                p.set_style(PaintStyle::Stroke);
                p.set_stroke_width(*stroke_width);
                p.set_color(color(*argb));
                canvas.draw_rect(Rect::from_wh(*w, *h), &p);
            }
            ItemKind::Oval { w, h, argb } => {
                let mut p = Paint::default();
                p.set_anti_alias(true);
                p.set_color(color(*argb));
                canvas.draw_oval(Rect::from_wh(*w, *h), &p);
            }
            ItemKind::Line {
                x1,
                y1,
                x2,
                y2,
                width,
                argb,
            } => {
                let mut p = Paint::default();
                p.set_anti_alias(true);
                p.set_style(PaintStyle::Stroke);
                p.set_stroke_width(*width);
                p.set_color(color(*argb));
                canvas.draw_line((*x1, *y1), (*x2, *y2), &p);
            }
            ItemKind::TextRun {
                text,
                font_size,
                baseline_y,
                argb,
            } => {
                if let Some(tf) = &ctx.font {
                    let font = Font::new(tf.clone(), *font_size);
                    let mut p = Paint::default();
                    p.set_anti_alias(true);
                    p.set_color(color(*argb));
                    canvas.draw_str(text.as_str(), (0.0, *baseline_y), &font, &p);
                }
            }
        }
        canvas.restore();
    }
}

/// Render a drawlist to a fresh raster surface and return its premultiplied
/// pixel bytes — the reference for differential pixel tests (`gate_diff` L2).
/// Bytes, NOT PNG: the encoder is not the system under test, and byte
/// equality is exact (ENG-0.3), not a tolerance. `font: None` in the gate
/// removes font-availability nondeterminism.
pub fn raster_to_bytes(list: &DrawList, view: &Affine, w: i32, h: i32, ctx: &PaintCtx) -> Vec<u8> {
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);
    execute(canvas, list, view, ctx);
    read_pixels(&mut surface, w, h)
}

/// Read a raster surface's premultiplied N32 pixels into a byte buffer.
pub fn read_pixels(surface: &mut skia_safe::Surface, w: i32, h: i32) -> Vec<u8> {
    let info = ImageInfo::new_n32_premul((w, h), None);
    let row_bytes = (w * 4) as usize;
    let mut buf = vec![0u8; row_bytes * h as usize];
    let ok = surface.read_pixels(&info, &mut buf, row_bytes, (0, 0));
    assert!(ok, "read_pixels failed");
    buf
}
