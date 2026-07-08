//! HUD chrome — screen-space, painted AFTER the scene (counterpart:
//! grida_editor hud/chrome.rs). Everything here is derived from the
//! resolved tier + camera; the HUD owns no document state.
//!
//! The oriented selection outline uses the node's LOCAL box mapped
//! through its world transform — for derived kinds the local box is
//! recovered exactly as `box − origin` (E-A1: bindings place the origin;
//! the box is origin + union offset).

use anchor_lab::math::RectF;
use anchor_lab::model::*;
use anchor_lab::resolve::Resolved;
use skia_safe::{Canvas, Color, Font, Paint, PaintStyle, PathBuilder, Rect};

use crate::camera::Camera;
use anchor_engine::paint::PaintCtx;

pub const HANDLE: f32 = 8.0;
pub const ROTATE_STICK: f32 = 26.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandleKind {
    Corner(u8), // 0=TL 1=TR 2=BR 3=BL (local box order)
    Edge(u8),   // 0=T 1=R 2=B 3=L
    Rotate,
}

/// The node's local box: boxed kinds are (0,0,w,h); derived kinds recover
/// the union rect from box − origin (both in parent space, pre-rotation).
pub fn local_box(doc: &Document, r: &Resolved, id: NodeId) -> RectF {
    let b = r.box_of(id);
    if doc.get(id).payload.box_is_derived() {
        let l = r.local_of(id);
        RectF {
            x: b.x - l.e,
            y: b.y - l.f,
            w: b.w,
            h: b.h,
        }
    } else {
        RectF {
            x: 0.0,
            y: 0.0,
            w: b.w,
            h: b.h,
        }
    }
}

/// Screen-space corner positions of the selection chrome (TL,TR,BR,BL).
/// Boxed kinds: the oriented box through the world transform. Derived
/// kinds: the INK bounds (`world_aabb`) — under DEC-0/V-4 the derived
/// BOX is sizing-tier (unrotated union) and would under-cover rotated
/// members; chrome must cover what the user sees.
pub fn screen_corners(doc: &Document, r: &Resolved, cam: &Camera, id: NodeId) -> [(f32, f32); 4] {
    if doc.get(id).payload.box_is_derived() {
        let a = r.aabb_of(id);
        let v = cam.view();
        return [
            v.apply((a.x, a.y)),
            v.apply((a.x + a.w, a.y)),
            v.apply((a.x + a.w, a.y + a.h)),
            v.apply((a.x, a.y + a.h)),
        ];
    }
    let lb = local_box(doc, r, id);
    let t = cam.view().then(&r.world_of(id));
    [
        t.apply((lb.x, lb.y)),
        t.apply((lb.x + lb.w, lb.y)),
        t.apply((lb.x + lb.w, lb.y + lb.h)),
        t.apply((lb.x, lb.y + lb.h)),
    ]
}

/// Handle anchor points in screen space, shared by paint and hit-testing
/// (one geometry, two consumers — never disagree).
pub fn handles(
    doc: &Document,
    r: &Resolved,
    cam: &Camera,
    id: NodeId,
    dpr: f32,
) -> Vec<(HandleKind, (f32, f32))> {
    let c = screen_corners(doc, r, cam, id);
    let mid = |a: (f32, f32), b: (f32, f32)| ((a.0 + b.0) / 2.0, (a.1 + b.1) / 2.0);
    let top = mid(c[0], c[1]);
    // "Up" along the box's own orientation: away from the bottom edge.
    let bottom = mid(c[3], c[2]);
    let up = {
        let dx = top.0 - bottom.0;
        let dy = top.1 - bottom.1;
        let len = (dx * dx + dy * dy).sqrt().max(1e-3);
        (dx / len, dy / len)
    };
    let stick = ROTATE_STICK * dpr;
    vec![
        (HandleKind::Corner(0), c[0]),
        (HandleKind::Corner(1), c[1]),
        (HandleKind::Corner(2), c[2]),
        (HandleKind::Corner(3), c[3]),
        (HandleKind::Edge(0), top),
        (HandleKind::Edge(1), mid(c[1], c[2])),
        (HandleKind::Edge(2), bottom),
        (HandleKind::Edge(3), mid(c[0], c[3])),
        (
            HandleKind::Rotate,
            (top.0 + up.0 * stick, top.1 + up.1 * stick),
        ),
    ]
}

fn stroke(color: Color, width: f32) -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Stroke);
    p.set_stroke_width(width);
    p.set_color(color);
    p
}

fn fill(color: Color) -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_color(color);
    p
}

const BLUE: Color = Color::new(0xFF4A90D9);
const INK: Color = Color::new(0xFF171A1F);

#[allow(clippy::too_many_arguments)]
pub fn paint_hud(
    canvas: &Canvas,
    doc: &Document,
    resolved: &Resolved,
    cam: &Camera,
    selection: Option<NodeId>,
    hover: Option<NodeId>,
    ctx: &PaintCtx,
) {
    paint_hud_dpr(canvas, doc, resolved, cam, selection, hover, ctx, 1.0);
}

#[allow(clippy::too_many_arguments)]
pub fn paint_hud_dpr(
    canvas: &Canvas,
    doc: &Document,
    resolved: &Resolved,
    cam: &Camera,
    selection: Option<NodeId>,
    hover: Option<NodeId>,
    ctx: &PaintCtx,
    dpr: f32,
) {
    canvas.save();
    canvas.reset_matrix(); // HUD lives in screen space

    if let Some(id) = hover {
        if Some(id) != selection && resolved.world_opt(id).is_some() {
            let c = screen_corners(doc, resolved, cam, id);
            let mut pb = PathBuilder::new();
            pb.move_to(c[0]);
            pb.line_to(c[1]);
            pb.line_to(c[2]);
            pb.line_to(c[3]);
            pb.close();
            canvas.draw_path(&pb.snapshot(), &stroke(Color::new(0x804A90D9), 1.5 * dpr));
        }
    }

    if let Some(id) = selection {
        if resolved.world_opt(id).is_some() {
            let c = screen_corners(doc, resolved, cam, id);
            let mut pb = PathBuilder::new();
            pb.move_to(c[0]);
            pb.line_to(c[1]);
            pb.line_to(c[2]);
            pb.line_to(c[3]);
            pb.close();
            canvas.draw_path(&pb.snapshot(), &stroke(BLUE, 1.5 * dpr));

            let hs = HANDLE * dpr;
            for (kind, (hx, hy)) in handles(doc, resolved, cam, id, dpr) {
                match kind {
                    HandleKind::Corner(_) | HandleKind::Edge(_) => {
                        let r = Rect::from_xywh(hx - hs / 2.0, hy - hs / 2.0, hs, hs);
                        canvas.draw_rect(r, &fill(Color::WHITE));
                        canvas.draw_rect(r, &stroke(BLUE, 1.2 * dpr));
                    }
                    HandleKind::Rotate => {
                        // stick from the top-edge midpoint
                        let top = handles(doc, resolved, cam, id, dpr)
                            .iter()
                            .find(|(k, _)| *k == HandleKind::Edge(0))
                            .map(|(_, p)| *p)
                            .unwrap();
                        canvas.draw_line(top, (hx, hy), &stroke(BLUE, 1.2 * dpr));
                        canvas.draw_circle((hx, hy), hs / 2.0, &fill(Color::WHITE));
                        canvas.draw_circle((hx, hy), hs / 2.0, &stroke(BLUE, 1.2 * dpr));
                    }
                }
            }

            // Ink readout (E-A7, demoted post-DEC-0): sizing never moves
            // with rotation anymore; the readout explains box vs INK.
            let node = doc.get(id);
            if let Some(tf) = &ctx.font {
                let b = resolved.box_of(id);
                let aabb = resolved.aabb_of(id);
                let label = if node.header.rotation != 0.0 {
                    format!(
                        "{} — {:.0}×{:.0} box · {:.0}×{:.0} ink · {:.1}°",
                        node.header.name.as_deref().unwrap_or("node"),
                        b.w,
                        b.h,
                        aabb.w,
                        aabb.h,
                        node.header.rotation
                    )
                } else {
                    format!(
                        "{} — {:.0}×{:.0}",
                        node.header.name.as_deref().unwrap_or("node"),
                        b.w,
                        b.h
                    )
                };
                let font = Font::new(tf.clone(), 12.0 * dpr);
                let anchor = c.iter().fold((f32::MAX, f32::MAX), |acc, p| {
                    (acc.0.min(p.0), acc.1.min(p.1))
                });
                let pos = (anchor.0, anchor.1 - 10.0 * dpr);
                let mut bg = fill(Color::new(0xE6FFFFFF));
                bg.set_style(PaintStyle::Fill);
                let (tw, _) = font.measure_str(&label, None);
                canvas.draw_rect(
                    Rect::from_xywh(pos.0 - 3.0, pos.1 - 12.0 * dpr, tw + 6.0, 16.0 * dpr),
                    &bg,
                );
                canvas.draw_str(&label, pos, &font, &fill(INK));
            }
        }
    }

    canvas.restore();
}
