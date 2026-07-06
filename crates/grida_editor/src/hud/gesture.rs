//! Gesture state and the pending pointer-down — the deferred-
//! selection anchor of the golden router's singleton-vs-ambiguous
//! rule. The drag threshold is the sole click-vs-drag discriminator.

use math2::rect::Rectangle;

use super::vocab::{Id, ResizeDirection, RotationCorner, SelectMode, SelectionShape};

/// Screen distance (logical px) that promotes a pending press into a
/// drag. The only discriminator — no timing or velocity heuristics.
pub const DRAG_THRESHOLD_PX: f32 = 3.0;

/// The guide-create threshold (`ruler.md` RUL-5, web parity: 4 px):
/// a press on a ruler strip must travel this far before a guide
/// materializes — no zombie guide on a stray click.
pub const GUIDE_CREATE_THRESHOLD_PX: f32 = 4.0;

/// The active gesture. Exclusive: one at a time.
#[derive(Debug, Clone)]
pub(super) enum HudGesture {
    Idle,
    Marquee {
        anchor: [f32; 2],
        current: [f32; 2],
        additive: bool,
    },
    Translate {
        ids: Vec<Id>,
        anchor: [f32; 2],
        last: [f32; 2],
    },
    Resize {
        ids: Vec<Id>,
        direction: ResizeDirection,
        /// Union shape at pointer-down (canvas space).
        initial: Rectangle,
        anchor: [f32; 2],
        last: [f32; 2],
        /// Whether any preview was emitted; a click-no-drag on a
        /// handle emits nothing at all.
        dragged: bool,
    },
    Rotate {
        ids: Vec<Id>,
        corner: RotationCorner,
        center: [f32; 2],
        anchor_angle: f32,
        last_angle: f32,
        dragged: bool,
    },
    /// A guide edit (`ruler.md` RUL-9): `index: None` = a create drag
    /// out of a strip, `Some` = moving an existing guide.
    Guide {
        axis: math2::vector2::Axis,
        index: Option<usize>,
    },
}

impl HudGesture {
    pub(super) fn is_active(&self) -> bool {
        !matches!(self, HudGesture::Idle)
    }
}

/// What a drag becomes if the pending press crosses the threshold.
#[derive(Debug, Clone)]
pub(super) enum DragPlan {
    Translate {
        ids: Vec<Id>,
    },
    Marquee {
        additive: bool,
    },
    /// Author a new guide (a strip press; the axis is the guide's —
    /// the strip's counter axis). Promotion uses the guide-create
    /// threshold (RUL-5), not the generic discriminator.
    GuideNew {
        axis: math2::vector2::Axis,
    },
    /// Move an existing guide.
    GuideMove {
        axis: math2::vector2::Axis,
        index: usize,
    },
    /// Readonly or otherwise inert: the press can still click, never
    /// drag.
    None,
}

/// A deferred (ambiguous) pointer-down: holds the anchor, the select
/// intent that fires on-up-without-drag, and the drag plan. Promotion
/// to a gesture ALWAYS cancels the deferred select.
#[derive(Debug, Clone)]
pub(super) struct Pending {
    pub(super) anchor_screen: [f32; 2],
    pub(super) anchor_canvas: [f32; 2],
    pub(super) deferred: Option<(Vec<Id>, SelectMode)>,
    pub(super) drag: DragPlan,
}

/// The union resize math, in canvas space. `delta` is cumulative from
/// the gesture anchor; `from_center` (alt) resizes symmetrically
/// about the initial center; `aspect` (shift) locks the initial
/// aspect ratio, scaling by the dominant axis.
pub fn resize_rect(
    initial: &Rectangle,
    dir: ResizeDirection,
    delta: [f32; 2],
    from_center: bool,
    aspect: bool,
) -> Rectangle {
    use ResizeDirection::*;
    let (w0, h0) = (initial.width.max(1.0), initial.height.max(1.0));

    // Per-axis size change implied by the dragged edge(s).
    let dw = match dir {
        E | NE | SE => delta[0],
        W | NW | SW => -delta[0],
        N | S => 0.0,
    };
    let dh = match dir {
        S | SE | SW => delta[1],
        N | NE | NW => -delta[1],
        E | W => 0.0,
    };
    let scale = if from_center { 2.0 } else { 1.0 };
    let mut w = (w0 + dw * scale).max(1.0);
    let mut h = (h0 + dh * scale).max(1.0);

    if aspect {
        let sx = w / w0;
        let sy = h / h0;
        let s = if (sx - 1.0).abs() >= (sy - 1.0).abs() {
            sx
        } else {
            sy
        };
        w = (w0 * s).max(1.0);
        h = (h0 * s).max(1.0);
    }

    if from_center {
        let c = initial.center();
        return Rectangle::from_xywh(c[0] - w * 0.5, c[1] - h * 0.5, w, h);
    }

    // Anchor: the opposite corner / edge stays fixed. Horizontal:
    // dragging east keeps the west side; edges without a horizontal
    // component keep the horizontal center (relevant under aspect).
    let x = match dir {
        E | NE | SE => initial.x,
        W | NW | SW => initial.x + initial.width - w,
        N | S => initial.x + (initial.width - w) * 0.5,
    };
    let y = match dir {
        S | SE | SW => initial.y,
        N | NE | NW => initial.y + initial.height - h,
        E | W => initial.y + (initial.height - h) * 0.5,
    };
    Rectangle::from_xywh(x, y, w, h)
}

/// Rotation snap grid under shift: 15°.
pub(super) const ROTATE_SNAP: f32 = std::f32::consts::PI / 12.0;

/// Union AABB of the shapes (canvas space).
pub(super) fn union_aabb(shapes: &[SelectionShape]) -> Option<Rectangle> {
    if shapes.is_empty() {
        return None;
    }
    let rects: Vec<Rectangle> = shapes.iter().map(|s| s.aabb()).collect();
    Some(math2::rect::union(&rects))
}
