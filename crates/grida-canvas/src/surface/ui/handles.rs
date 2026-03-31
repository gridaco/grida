//! Selection handles — resize knobs, side edges, and rotation corners.
//!
//! This module owns:
//! 1. **Geometry computation** — [`SelectionHandles`] computes screen-space
//!    rects for 8 resize handles and 4 rotation handles from a screen-space
//!    bounding box.
//! 2. **Hit testing** — [`SelectionHandles::hit_test`] checks a screen-space
//!    point against all handles (rotation first, then resize).
//! 3. **Rendering** — [`SelectionHandles::draw`] paints visible corner knobs
//!    and (optional) rotation areas onto a Skia canvas.
//!
//! The module intentionally does **not** dispatch editing commands — it only
//! reports *which* handle was hit and what cursor to show. The host (or a
//! future gesture layer) decides what to do with that information.

use crate::surface::cursor::{ResizeDirection, RotationCorner};
use skia_safe::{Canvas, Color, Contains, Paint, PaintStyle, Rect};

// ── Layout constants (logical pixels, scaled by `dpr` at draw time) ──────────

/// Size of the visible corner resize knob (square, in logical px).
const CORNER_KNOB_SIZE: f32 = 8.0;
/// Minimum hit-target size for any handle (ensures usability on HiDPI).
const MIN_HIT_SIZE: f32 = 16.0;
/// Thickness of the invisible side (edge) resize handles.
const SIDE_THICKNESS: f32 = 8.0;
/// Offset of rotation handles from the selection corner (outward, logical px).
const ROTATION_OFFSET: f32 = 10.0;
/// Size of the rotation hit area (square, logical px).
const ROTATION_HIT_SIZE: f32 = 16.0;

/// Minimum screen-space dimension (width or height) of the selection box
/// before resize handles become visible. Matches the web editor's
/// `MIN_NODE_OVERLAY_RESIZE_HANDLES_VISIBLE_UI_SIZE` (12 px).
const MIN_HANDLES_VISIBLE_SIZE: f32 = 12.0;

/// Accent color for knob outlines (matches selection overlay).
const ACCENT_COLOR: Color = Color::from_argb(255, 0, 120, 255);

// ── Types ────────────────────────────────────────────────────────────────────

/// Which handle was hit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandleHit {
    Resize(ResizeDirection),
    Rotate(RotationCorner),
}

/// A single handle's screen-space hit rect.
#[derive(Debug, Clone, Copy)]
pub struct HandleRect {
    pub hit: HandleHit,
    pub screen_rect: Rect,
}

/// Precomputed screen-space handle rects for a single selection bounding box.
///
/// Created once per frame (or per selection change) and reused for both
/// drawing and hit testing.
#[derive(Debug, Clone)]
pub struct SelectionHandles {
    /// 8 resize handle rects (4 corners + 4 sides).
    pub resize: [HandleRect; 8],
    /// 4 rotation handle rects (one per corner, placed outside the bounds).
    pub rotation: [HandleRect; 4],
    /// Whether the handles should be visually drawn.
    /// `false` when the selection is too small in screen space.
    pub visible: bool,
    /// DPR-scaled corner knob half-size (for drawing the white square).
    knob_half: f32,
}

impl SelectionHandles {
    /// Compute handle positions from an axis-aligned screen-space bounding
    /// rect. All coordinates are in physical pixels (already DPR-scaled).
    ///
    /// `dpr` is used to scale logical constants to physical pixels.
    pub fn from_screen_rect(screen_rect: Rect, dpr: f32) -> Self {
        let l = screen_rect.left;
        let t = screen_rect.top;
        let r = screen_rect.right;
        let b = screen_rect.bottom;
        let w = r - l;
        let h = b - t;

        let knob = CORNER_KNOB_SIZE * dpr;
        let knob_half = knob * 0.5;
        let hit_half = (MIN_HIT_SIZE * dpr) * 0.5;
        let side_thick = SIDE_THICKNESS * dpr;
        let side_half = side_thick * 0.5;
        let rot_off = ROTATION_OFFSET * dpr;
        let rot_size = ROTATION_HIT_SIZE * dpr;
        let rot_half = rot_size * 0.5;

        let visible = w >= MIN_HANDLES_VISIBLE_SIZE * dpr && h >= MIN_HANDLES_VISIBLE_SIZE * dpr;

        // Helper: centered rect
        let centered = |cx: f32, cy: f32, half: f32| -> Rect {
            Rect::from_ltrb(cx - half, cy - half, cx + half, cy + half)
        };

        // ── Resize handles ───────────────────────────────────────────────
        // Corners: centered at each corner, hit area = max(knob, MIN_HIT_SIZE).
        let resize_nw = HandleRect {
            hit: HandleHit::Resize(ResizeDirection::NW),
            screen_rect: centered(l, t, hit_half),
        };
        let resize_ne = HandleRect {
            hit: HandleHit::Resize(ResizeDirection::NE),
            screen_rect: centered(r, t, hit_half),
        };
        let resize_se = HandleRect {
            hit: HandleHit::Resize(ResizeDirection::SE),
            screen_rect: centered(r, b, hit_half),
        };
        let resize_sw = HandleRect {
            hit: HandleHit::Resize(ResizeDirection::SW),
            screen_rect: centered(l, b, hit_half),
        };

        // Sides: span the full edge length, side_thick wide, centered on the edge.
        let resize_n = HandleRect {
            hit: HandleHit::Resize(ResizeDirection::N),
            screen_rect: Rect::from_ltrb(l + hit_half, t - side_half, r - hit_half, t + side_half),
        };
        let resize_e = HandleRect {
            hit: HandleHit::Resize(ResizeDirection::E),
            screen_rect: Rect::from_ltrb(r - side_half, t + hit_half, r + side_half, b - hit_half),
        };
        let resize_s = HandleRect {
            hit: HandleHit::Resize(ResizeDirection::S),
            screen_rect: Rect::from_ltrb(l + hit_half, b - side_half, r - hit_half, b + side_half),
        };
        let resize_w = HandleRect {
            hit: HandleHit::Resize(ResizeDirection::W),
            screen_rect: Rect::from_ltrb(l - side_half, t + hit_half, l + side_half, b - hit_half),
        };

        // ── Rotation handles ─────────────────────────────────────────────
        // Placed outside each corner, offset outward by `rot_off`.
        let rotation_nw = HandleRect {
            hit: HandleHit::Rotate(RotationCorner::NW),
            screen_rect: centered(l - rot_off, t - rot_off, rot_half),
        };
        let rotation_ne = HandleRect {
            hit: HandleHit::Rotate(RotationCorner::NE),
            screen_rect: centered(r + rot_off, t - rot_off, rot_half),
        };
        let rotation_se = HandleRect {
            hit: HandleHit::Rotate(RotationCorner::SE),
            screen_rect: centered(r + rot_off, b + rot_off, rot_half),
        };
        let rotation_sw = HandleRect {
            hit: HandleHit::Rotate(RotationCorner::SW),
            screen_rect: centered(l - rot_off, b + rot_off, rot_half),
        };

        Self {
            resize: [
                resize_nw, resize_ne, resize_se, resize_sw, resize_n, resize_e, resize_s, resize_w,
            ],
            rotation: [rotation_nw, rotation_ne, rotation_se, rotation_sw],
            visible,
            knob_half,
        }
    }

    /// Hit-test a screen-space point against all handles.
    ///
    /// Returns the topmost hit. Priority order:
    /// 1. Rotation handles (outermost)
    /// 2. Corner resize handles
    /// 3. Side resize handles
    ///
    /// This matches the web editor's z-index priority for large selections.
    pub fn hit_test(&self, screen_point: [f32; 2]) -> Option<HandleHit> {
        let pt = skia_safe::Point::new(screen_point[0], screen_point[1]);

        // Rotation handles first (outside the bounds, highest priority).
        for h in &self.rotation {
            if h.screen_rect.contains(pt) {
                return Some(h.hit);
            }
        }
        // Corner resize handles (indices 0..4).
        for h in &self.resize[..4] {
            if h.screen_rect.contains(pt) {
                return Some(h.hit);
            }
        }
        // Side resize handles (indices 4..8).
        for h in &self.resize[4..] {
            if h.screen_rect.contains(pt) {
                return Some(h.hit);
            }
        }
        None
    }

    /// Draw the visible parts of the handles onto the canvas.
    ///
    /// Only the 4 corner resize knobs are drawn (white filled squares with
    /// an accent-colored border). Side handles and rotation handles are
    /// invisible interaction zones — they are hit-tested but not rendered.
    pub fn draw(&self, canvas: &Canvas) {
        if !self.visible {
            return;
        }

        let mut fill = Paint::default();
        fill.set_color(Color::WHITE);
        fill.set_style(PaintStyle::Fill);
        fill.set_anti_alias(true);

        let mut stroke = Paint::default();
        stroke.set_color(ACCENT_COLOR);
        stroke.set_style(PaintStyle::Stroke);
        stroke.set_stroke_width(1.0);
        stroke.set_anti_alias(true);

        // Draw the 4 corner knobs (first 4 entries in `resize`).
        for handle in &self.resize[..4] {
            // The visible knob is smaller than the hit rect.
            let c = handle.screen_rect.center();
            let knob_rect = Rect::from_xywh(
                c.x - self.knob_half,
                c.y - self.knob_half,
                self.knob_half * 2.0,
                self.knob_half * 2.0,
            );
            canvas.draw_rect(knob_rect, &fill);
            canvas.draw_rect(knob_rect, &stroke);
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_handles(x: f32, y: f32, w: f32, h: f32, dpr: f32) -> SelectionHandles {
        let rect = Rect::from_xywh(x, y, w, h);
        SelectionHandles::from_screen_rect(rect, dpr)
    }

    #[test]
    fn corner_knobs_centered_on_corners() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // NW corner should be centered at (100, 100)
        let nw = &h.resize[0];
        let center = nw.screen_rect.center();
        assert!((center.x - 100.0).abs() < 0.01);
        assert!((center.y - 100.0).abs() < 0.01);
        // SE corner should be centered at (300, 300)
        let se = &h.resize[2];
        let center = se.screen_rect.center();
        assert!((center.x - 300.0).abs() < 0.01);
        assert!((center.y - 300.0).abs() < 0.01);
    }

    #[test]
    fn rotation_handles_outside_bounds() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // NW rotation should be to the top-left of (100, 100)
        let nw_rot = &h.rotation[0];
        let center = nw_rot.screen_rect.center();
        assert!(
            center.x < 100.0,
            "rotation NW center.x should be < 100, got {}",
            center.x
        );
        assert!(
            center.y < 100.0,
            "rotation NW center.y should be < 100, got {}",
            center.y
        );
        // SE rotation should be to the bottom-right of (300, 300)
        let se_rot = &h.rotation[2];
        let center = se_rot.screen_rect.center();
        assert!(
            center.x > 300.0,
            "rotation SE center.x should be > 300, got {}",
            center.x
        );
        assert!(
            center.y > 300.0,
            "rotation SE center.y should be > 300, got {}",
            center.y
        );
    }

    #[test]
    fn hit_test_rotation_has_priority_over_resize() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // The rotation NW handle is at ~(90, 90). The resize NW handle is at ~(100, 100).
        // A point near the rotation handle should hit rotation, not resize.
        let rot_center = h.rotation[0].screen_rect.center();
        let hit = h.hit_test([rot_center.x, rot_center.y]);
        assert_eq!(hit, Some(HandleHit::Rotate(RotationCorner::NW)));
    }

    #[test]
    fn hit_test_resize_corner() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // Exactly at the NW corner
        let hit = h.hit_test([100.0, 100.0]);
        assert_eq!(hit, Some(HandleHit::Resize(ResizeDirection::NW)));
    }

    #[test]
    fn hit_test_resize_side() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // Middle of the top edge
        let hit = h.hit_test([200.0, 100.0]);
        assert_eq!(hit, Some(HandleHit::Resize(ResizeDirection::N)));
    }

    #[test]
    fn hit_test_miss() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // Center of the selection — should miss all handles
        let hit = h.hit_test([200.0, 200.0]);
        assert_eq!(hit, None);
    }

    #[test]
    fn handles_not_visible_when_too_small() {
        let h = make_handles(100.0, 100.0, 5.0, 5.0, 1.0);
        assert!(!h.visible);
    }

    #[test]
    fn handles_visible_when_large_enough() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        assert!(h.visible);
    }

    #[test]
    fn dpr_scaling() {
        let h1 = make_handles(0.0, 0.0, 100.0, 100.0, 1.0);
        let h2 = make_handles(0.0, 0.0, 100.0, 100.0, 2.0);
        // The knob visual size should double with 2x DPR.
        assert!((h2.knob_half - h1.knob_half * 2.0).abs() < 0.01);
    }

    #[test]
    fn side_handles_span_between_corners() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // The N side handle should span from (100 + hit_half) to (300 - hit_half)
        let n = &h.resize[4];
        assert!(matches!(n.hit, HandleHit::Resize(ResizeDirection::N)));
        // Its left should be > 100 (offset by corner hit area)
        assert!(n.screen_rect.left > 100.0);
        // Its right should be < 300
        assert!(n.screen_rect.right < 300.0);
    }

    #[test]
    fn all_eight_resize_directions_present() {
        let h = make_handles(0.0, 0.0, 200.0, 200.0, 1.0);
        let dirs: Vec<_> = h
            .resize
            .iter()
            .map(|hr| match hr.hit {
                HandleHit::Resize(d) => d,
                _ => panic!("expected resize"),
            })
            .collect();
        assert!(dirs.contains(&ResizeDirection::NW));
        assert!(dirs.contains(&ResizeDirection::NE));
        assert!(dirs.contains(&ResizeDirection::SE));
        assert!(dirs.contains(&ResizeDirection::SW));
        assert!(dirs.contains(&ResizeDirection::N));
        assert!(dirs.contains(&ResizeDirection::E));
        assert!(dirs.contains(&ResizeDirection::S));
        assert!(dirs.contains(&ResizeDirection::W));
    }

    #[test]
    fn all_four_rotation_corners_present() {
        let h = make_handles(0.0, 0.0, 200.0, 200.0, 1.0);
        let corners: Vec<_> = h
            .rotation
            .iter()
            .map(|hr| match hr.hit {
                HandleHit::Rotate(c) => c,
                _ => panic!("expected rotation"),
            })
            .collect();
        assert!(corners.contains(&RotationCorner::NW));
        assert!(corners.contains(&RotationCorner::NE));
        assert!(corners.contains(&RotationCorner::SE));
        assert!(corners.contains(&RotationCorner::SW));
    }

    #[test]
    fn hit_test_all_four_corners() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // NE corner at (300, 100)
        assert_eq!(
            h.hit_test([300.0, 100.0]),
            Some(HandleHit::Resize(ResizeDirection::NE))
        );
        // SE corner at (300, 300)
        assert_eq!(
            h.hit_test([300.0, 300.0]),
            Some(HandleHit::Resize(ResizeDirection::SE))
        );
        // SW corner at (100, 300)
        assert_eq!(
            h.hit_test([100.0, 300.0]),
            Some(HandleHit::Resize(ResizeDirection::SW))
        );
    }

    #[test]
    fn hit_test_all_four_sides() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // Middle of east edge
        assert_eq!(
            h.hit_test([300.0, 200.0]),
            Some(HandleHit::Resize(ResizeDirection::E))
        );
        // Middle of south edge
        assert_eq!(
            h.hit_test([200.0, 300.0]),
            Some(HandleHit::Resize(ResizeDirection::S))
        );
        // Middle of west edge
        assert_eq!(
            h.hit_test([100.0, 200.0]),
            Some(HandleHit::Resize(ResizeDirection::W))
        );
    }

    #[test]
    fn hit_test_all_rotation_corners() {
        let h = make_handles(100.0, 100.0, 200.0, 200.0, 1.0);
        // NE rotation at ~(310, 90)
        let ne_center = h.rotation[1].screen_rect.center();
        assert_eq!(
            h.hit_test([ne_center.x, ne_center.y]),
            Some(HandleHit::Rotate(RotationCorner::NE))
        );
        // SE rotation at ~(310, 310)
        let se_center = h.rotation[2].screen_rect.center();
        assert_eq!(
            h.hit_test([se_center.x, se_center.y]),
            Some(HandleHit::Rotate(RotationCorner::SE))
        );
        // SW rotation at ~(90, 310)
        let sw_center = h.rotation[3].screen_rect.center();
        assert_eq!(
            h.hit_test([sw_center.x, sw_center.y]),
            Some(HandleHit::Rotate(RotationCorner::SW))
        );
    }

    #[test]
    fn resize_direction_classification() {
        assert!(ResizeDirection::NW.is_corner());
        assert!(ResizeDirection::NE.is_corner());
        assert!(ResizeDirection::SE.is_corner());
        assert!(ResizeDirection::SW.is_corner());
        assert!(!ResizeDirection::N.is_corner());
        assert!(!ResizeDirection::E.is_corner());
        assert!(!ResizeDirection::S.is_corner());
        assert!(!ResizeDirection::W.is_corner());
    }

    #[test]
    fn handles_at_origin() {
        let h = make_handles(0.0, 0.0, 200.0, 200.0, 1.0);
        // NW corner should be at origin
        let nw = &h.resize[0];
        let center = nw.screen_rect.center();
        assert!((center.x).abs() < 0.01);
        assert!((center.y).abs() < 0.01);
    }

    #[test]
    fn handles_with_high_dpr() {
        let h = make_handles(0.0, 0.0, 400.0, 400.0, 3.0);
        // Even at 3x DPR, structure should be valid
        assert!(h.visible);
        assert_eq!(h.resize.len(), 8);
        assert_eq!(h.rotation.len(), 4);
        // Hit test should still work
        assert_eq!(
            h.hit_test([0.0, 0.0]),
            Some(HandleHit::Resize(ResizeDirection::NW))
        );
    }
}
