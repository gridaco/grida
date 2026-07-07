//! Scene painter: resolved SOA columns → Skia canvas. Dumb by design —
//! every world transform comes from the resolver (lens children arrive
//! post-ops), the camera is one outer matrix, and nothing here writes.
//!
//! Declared spike limitation: text renders single-line via the default
//! typeface while the MODEL measures with the lab stub — the mismatch is
//! DEC-4/B-1 territory and stays visible, not patched over.

use anchor_lab::math::Affine;
use anchor_lab::model::*;
use anchor_lab::resolve::Resolved;
use skia_safe::{Canvas, Color, Font, FontMgr, Matrix, Paint, PaintStyle, Rect};

use crate::camera::Camera;

pub struct Painter {
    pub font: Option<skia_safe::Typeface>,
}

impl Painter {
    pub fn new() -> Painter {
        Painter {
            font: FontMgr::new().legacy_make_typeface(None, skia_safe::FontStyle::default()),
        }
    }

    pub fn skia_matrix(t: &Affine) -> Matrix {
        Matrix::new_all(t.a, t.c, t.e, t.b, t.d, t.f, 0.0, 0.0, 1.0)
    }

    pub fn color(hex: Option<&str>, fallback: Color) -> Color {
        let Some(h) = hex else { return fallback };
        let h = h.trim_start_matches('#');
        if h.len() == 6 {
            if let Ok(v) = u32::from_str_radix(h, 16) {
                return Color::from_argb(
                    255,
                    ((v >> 16) & 0xff) as u8,
                    ((v >> 8) & 0xff) as u8,
                    (v & 0xff) as u8,
                );
            }
        }
        fallback
    }

    pub fn paint_scene(
        &self,
        canvas: &Canvas,
        doc: &Document,
        resolved: &Resolved,
        camera: &Camera,
    ) {
        self.paint_node(canvas, doc, resolved, camera, doc.root);
    }

    fn paint_node(
        &self,
        canvas: &Canvas,
        doc: &Document,
        resolved: &Resolved,
        camera: &Camera,
        id: NodeId,
    ) {
        let Some(world) = resolved.world_opt(id) else {
            return; // hidden subtree
        };
        let node = doc.get(id);
        let total = camera.view().then(&world);

        // Root is the infinite canvas backdrop — no ink of its own here.
        if id != doc.root && !node.payload.box_is_derived() {
            canvas.save();
            canvas.set_matrix(&Self::skia_matrix(&total).into());
            let b = resolved.box_of(id);
            match &node.payload {
                Payload::Frame { .. } => {
                    let mut fill = Paint::default();
                    fill.set_anti_alias(true);
                    fill.set_color(Self::color(node.fill.as_deref(), Color::WHITE));
                    let r = Rect::from_wh(b.w, b.h);
                    canvas.draw_rect(r, &fill);
                    let mut stroke = Paint::default();
                    stroke.set_anti_alias(true);
                    stroke.set_style(PaintStyle::Stroke);
                    stroke.set_stroke_width(1.0);
                    stroke.set_color(Color::from_argb(255, 0xC9, 0xCE, 0xD4));
                    canvas.draw_rect(r, &stroke);
                }
                Payload::Shape { desc } => {
                    let mut p = Paint::default();
                    p.set_anti_alias(true);
                    p.set_color(Self::color(node.fill.as_deref(), Color::from_argb(255, 0x4A, 0x90, 0xD9)));
                    match desc {
                        ShapeDesc::Rect => {
                            canvas.draw_rect(Rect::from_wh(b.w, b.h), &p);
                        }
                        ShapeDesc::Ellipse => {
                            canvas.draw_oval(Rect::from_wh(b.w, b.h), &p);
                        }
                        ShapeDesc::Line => {
                            p.set_style(PaintStyle::Stroke);
                            p.set_stroke_width(2.0);
                            canvas.draw_line((0.0, 0.0), (b.w, 0.0), &p);
                        }
                    }
                }
                Payload::Text { content, font_size } => {
                    if let Some(tf) = &self.font {
                        let font = Font::new(tf.clone(), *font_size);
                        let mut p = Paint::default();
                        p.set_anti_alias(true);
                        p.set_color(Self::color(node.fill.as_deref(), Color::BLACK));
                        // Baseline approximation against the lab's box
                        // metric (top-anchored, 1.2em line) — declared.
                        canvas.draw_str(content.as_str(), (0.0, font_size * 0.85), &font, &p);
                    }
                }
                Payload::Group | Payload::Lens { .. } => unreachable!(),
            }
            canvas.restore();
        }

        for &c in &node.children {
            self.paint_node(canvas, doc, resolved, camera, c);
        }
    }
}
