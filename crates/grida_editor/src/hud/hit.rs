//! The hit backend — one of the HUD's two per-frame outputs
//! (`HUD-5`). Hit regions are registered by the chrome builder and
//! consulted at pointer-down (tier 1 of the golden router); they share
//! no geometry with the render backend: the hit-tester optimizes for
//! Fitts'-law reach, the renderer for legibility.

use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use super::vocab::{ResizeDirection, RotationCorner};

/// Overlay priorities — lower wins on overlap; ties resolve to the
/// later registration.
///
/// The ruler strips sit above everything (they are frame chrome at
/// the window edge — web parity: the ruler's z-index tops the canvas
/// stack); guide lines beat edge strips and bodies but lose to knobs.
pub const PRIORITY_STRIP: u8 = 5;
pub const PRIORITY_CORNER: u8 = 10;
pub const PRIORITY_GUIDE: u8 = 15;
pub const PRIORITY_EDGE: u8 = 20;
pub const PRIORITY_ROTATE: u8 = 30;
pub const PRIORITY_BODY: u8 = 40;

/// Hit geometry, deliberately independent of any render primitive.
/// The shared `Screen` prefix is doctrine, not noise: every hit shape
/// is resolved in screen space (matching `@grida/hud`'s vocabulary).
#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone)]
pub(super) enum HitShape {
    /// A screen-sized rect centered at a canvas-space anchor (plus a
    /// screen-space offset) — knobs and halos that keep their size at
    /// any zoom.
    ScreenRectAtCanvas {
        anchor: [f32; 2],
        offset: [f32; 2],
        width: f32,
        height: f32,
    },
    /// A pre-projected screen-space AABB — edge strips, unrotated
    /// bodies.
    ScreenAabb { rect: Rectangle },
    /// An oriented region: `rect` lives in a shadow space (the node's
    /// local frame) and `inverse` maps a screen point into it — exact
    /// containment at any rotation, no AABB inflation.
    ScreenObb {
        rect: Rectangle,
        inverse: AffineTransform,
    },
}

impl HitShape {
    /// Containment of a logical-screen point, projecting canvas
    /// anchors through `view` (canvas → screen).
    pub(super) fn contains(&self, screen: [f32; 2], view: &AffineTransform) -> bool {
        match self {
            HitShape::ScreenRectAtCanvas {
                anchor,
                offset,
                width,
                height,
            } => {
                let p = math2::vector2::transform(*anchor, view);
                let cx = p[0] + offset[0];
                let cy = p[1] + offset[1];
                (screen[0] - cx).abs() <= width * 0.5 && (screen[1] - cy).abs() <= height * 0.5
            }
            HitShape::ScreenAabb { rect } => rect.contains_point(screen),
            HitShape::ScreenObb { rect, inverse } => {
                rect.contains_point(math2::vector2::transform(screen, inverse))
            }
        }
    }
}

/// What a region routes to — the overlay-type key of the golden
/// router's tier-1 table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HudAction {
    Resize(ResizeDirection),
    Rotate(RotationCorner),
    /// The translate body: claims the press for "drag the existing
    /// selection", always defers.
    Body,
    /// A ruler strip (`ruler.md`): a drag out of it authors a guide
    /// on the carried axis — the strip's **counter** axis (`RUL-10`);
    /// a click is a no-op.
    GuideStrip(math2::vector2::Axis),
    /// An existing guide line, by index into the host-pushed guides
    /// mirror: a drag repositions it, a click is a no-op.
    GuideLine(usize),
}

/// One registered overlay hit region.
#[derive(Debug, Clone)]
pub(super) struct HitRegion {
    pub(super) shape: HitShape,
    pub(super) action: HudAction,
    pub(super) priority: u8,
}

/// The per-frame registry, rebuilt by the chrome builder.
#[derive(Debug, Default)]
pub(super) struct HitRegistry {
    regions: Vec<HitRegion>,
}

impl HitRegistry {
    pub(super) fn clear(&mut self) {
        self.regions.clear();
    }

    pub(super) fn add(&mut self, region: HitRegion) {
        self.regions.push(region);
    }

    /// Lowest priority value wins; ties resolve to the later
    /// registration.
    pub(super) fn hit_test(&self, screen: [f32; 2], view: &AffineTransform) -> Option<HudAction> {
        let mut best: Option<&HitRegion> = None;
        for region in &self.regions {
            if !region.shape.contains(screen, view) {
                continue;
            }
            match best {
                Some(b) if b.priority < region.priority => {}
                _ => best = Some(region),
            }
        }
        best.map(|r| r.action)
    }
}
