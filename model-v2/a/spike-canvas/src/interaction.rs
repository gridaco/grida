//! The minimal interaction model — an EXPLICIT pointer state machine
//! (counterpart: grida_editor hud/gesture.rs + tool.rs). States are data,
//! transitions call lab ops, typed errors surface into the gesture log —
//! nothing here mutates the document except through `anchor_lab::ops`.
//!
//!   Idle -> Pressed(node) -> Dragging(Move | ResizeEdge | ResizeCorner
//!        | Rotate | Pan) -> Idle
//!
//! A gesture's log entry is the HEADER DIFF (before vs after) — the
//! honest write count: a drag re-applies its op continuously, but the
//! document ends as if written once (delta-form ops make that true).

use anchor_lab::math::Affine;
use anchor_lab::model::*;
use anchor_lab::ops::ResizeDrag;

use crate::shell::hud::HandleKind;

/// Screen-px tolerance for grabbing a handle.
pub const HANDLE_TOL: f32 = 10.0;
/// Drag starts after this many screen px (a click is not a move).
pub const DRAG_THRESHOLD: f32 = 3.0;

#[derive(Debug)]
pub enum Drag {
    Move {
        id: NodeId,
        last_screen: (f32, f32),
    },
    ResizeEdge {
        id: NodeId,
        drag: ResizeDrag,
    },
    ResizeCorner {
        id: NodeId,
        dx: ResizeDrag,
        dy: ResizeDrag,
    },
    Rotate {
        id: NodeId,
        center_screen: (f32, f32),
        grab_deg: f32,
        start_rot: f32,
        derived: bool,
    },
    Pan {
        last_screen: (f32, f32),
    },
}

#[derive(Debug, Default)]
pub enum Fsm {
    #[default]
    Idle,
    Pressed {
        id: NodeId,
        at_screen: (f32, f32),
    },
    Dragging(Drag),
}

/// Per-gesture scratch: the before-header for the diff, and every typed
/// error the ops raised (deduped — a span axis errors once, not per px).
pub struct Gesture {
    pub id: NodeId,
    pub title: String,
    pub before: Header,
    pub errors: Vec<String>,
}

impl Gesture {
    pub fn begin(doc: &Document, id: NodeId, title: &str) -> Gesture {
        Gesture {
            id,
            title: title.to_string(),
            before: doc.get(id).header.clone(),
            errors: Vec::new(),
        }
    }
    pub fn error(&mut self, e: String) {
        if !self.errors.contains(&e) {
            self.errors.push(e);
        }
    }
}

/// One finished gesture (or instant op) for the log panel.
pub struct LogEntry {
    pub title: String,
    pub writes: Vec<String>,
    pub errors: Vec<String>,
}

fn fmt_num(v: f32) -> String {
    let r = (v * 10.0).round() / 10.0;
    if r == r.trunc() {
        format!("{}", r as i64)
    } else {
        format!("{r}")
    }
}

fn fmt_binding(b: &AxisBinding) -> String {
    match b {
        AxisBinding::Pin { anchor, offset } => match anchor {
            AnchorEdge::Start => fmt_num(*offset),
            AnchorEdge::Center => format!("center {}", fmt_num(*offset)),
            AnchorEdge::End => format!("end {}", fmt_num(*offset)),
        },
        AxisBinding::Span { start, end } => {
            format!("span {} {}", fmt_num(*start), fmt_num(*end))
        }
    }
}

fn fmt_size(s: &SizeIntent) -> String {
    match s {
        SizeIntent::Fixed(v) => fmt_num(*v),
        SizeIntent::Auto => "auto".into(),
    }
}

/// The header diff — each changed field is one write line.
pub fn diff_header(before: &Header, after: &Header) -> Vec<String> {
    let mut out = Vec::new();
    if before.x != after.x {
        out.push(format!("x: {} -> {}", fmt_binding(&before.x), fmt_binding(&after.x)));
    }
    if before.y != after.y {
        out.push(format!("y: {} -> {}", fmt_binding(&before.y), fmt_binding(&after.y)));
    }
    if before.width != after.width {
        out.push(format!(
            "w: {} -> {}",
            fmt_size(&before.width),
            fmt_size(&after.width)
        ));
    }
    if before.height != after.height {
        out.push(format!(
            "h: {} -> {}",
            fmt_size(&before.height),
            fmt_size(&after.height)
        ));
    }
    if before.rotation != after.rotation {
        out.push(format!(
            "rotation: {} -> {}",
            fmt_num(before.rotation),
            fmt_num(after.rotation)
        ));
    }
    if before.flip_x != after.flip_x {
        out.push(format!("flip-x: {} -> {}", before.flip_x, after.flip_x));
    }
    if before.flip_y != after.flip_y {
        out.push(format!("flip-y: {} -> {}", before.flip_y, after.flip_y));
    }
    out
}

/// Which handle (if any) is under the cursor — same geometry the HUD
/// paints, so hit and chrome can never disagree.
pub fn handle_at(
    handles: &[(HandleKind, (f32, f32))],
    cursor: (f32, f32),
    dpr: f32,
) -> Option<HandleKind> {
    let tol = HANDLE_TOL * dpr;
    // Rotate first: it sits outside the box and must win over corners.
    for (k, p) in handles {
        if matches!(k, HandleKind::Rotate) && dist(*p, cursor) < tol {
            return Some(*k);
        }
    }
    for (k, p) in handles {
        if dist(*p, cursor) < tol {
            return Some(*k);
        }
    }
    None
}

pub fn dist(a: (f32, f32), b: (f32, f32)) -> f32 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
}

/// Resize drags per handle: which axis/axes move, which edge stays
/// FIXED (the anchor — opposite of the grabbed handle). Local edge
/// numbering: Edge 0=T 1=R 2=B 3=L; Corner 0=TL 1=TR 2=BR 3=BL.
pub fn resize_anchors(kind: HandleKind) -> (Option<AnchorEdge>, Option<AnchorEdge>) {
    match kind {
        HandleKind::Edge(1) => (Some(AnchorEdge::Start), None), // drag R, L fixed
        HandleKind::Edge(3) => (Some(AnchorEdge::End), None),   // drag L, R fixed
        HandleKind::Edge(2) => (None, Some(AnchorEdge::Start)), // drag B, T fixed
        HandleKind::Edge(0) => (None, Some(AnchorEdge::End)),   // drag T, B fixed
        HandleKind::Corner(2) => (Some(AnchorEdge::Start), Some(AnchorEdge::Start)),
        HandleKind::Corner(0) => (Some(AnchorEdge::End), Some(AnchorEdge::End)),
        HandleKind::Corner(1) => (Some(AnchorEdge::Start), Some(AnchorEdge::End)),
        HandleKind::Corner(3) => (Some(AnchorEdge::End), Some(AnchorEdge::Start)),
        _ => (None, None),
    }
}

/// Cursor position in the node's PARENT space — ops speak parent space
/// (bindings, resize anchors), the pointer speaks screen space; this is
/// the one conversion, done right (parent world inverse, not a guess).
pub fn parent_point(
    doc: &Document,
    resolved: &anchor_lab::resolve::Resolved,
    camera: &crate::camera::Camera,
    id: NodeId,
    screen: (f32, f32),
) -> (f32, f32) {
    let world = camera.screen_to_world(screen);
    match doc.parent_of(id) {
        Some(p) => match resolved.world_opt(p).and_then(|w| w.invert()) {
            Some(inv) => inv.apply(world),
            None => world,
        },
        None => world,
    }
}

/// Angle (degrees) of the cursor about a screen center — for the rotate
/// gesture. Zero at +x, increasing clockwise (y-down screen space,
/// matching the model's rotation sign).
pub fn screen_angle(center: (f32, f32), p: (f32, f32)) -> f32 {
    (p.1 - center.1).atan2(p.0 - center.0).to_degrees()
}

/// Compose a world-space affine's screen position for a node's box
/// center (rotate-gesture pivot).
pub fn box_center_screen(
    doc: &Document,
    resolved: &anchor_lab::resolve::Resolved,
    camera: &crate::camera::Camera,
    id: NodeId,
) -> (f32, f32) {
    if doc.get(id).payload.box_is_derived() {
        // Derived kinds pivot the GESTURE at the ink center (matches the
        // chrome, which shows ink bounds under DEC-0/V-4).
        let a = resolved.aabb_of(id);
        return camera.view().apply((a.x + a.w / 2.0, a.y + a.h / 2.0));
    }
    let lb = crate::shell::hud::local_box(doc, resolved, id);
    let t: Affine = camera.view().then(&resolved.world_of(id));
    t.apply((lb.x + lb.w / 2.0, lb.y + lb.h / 2.0))
}
