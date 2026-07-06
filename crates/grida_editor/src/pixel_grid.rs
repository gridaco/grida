//! Pixel grid — the unit lattice's visual render
//! (`docs/wg/canvas/pixel-grid.md`, `PXG-*`).
//!
//! This module is the **render** half of the term only: a pure plan of
//! which integer canvas coordinates get a hairline this frame. It
//! shares nothing with "snap to pixel grid" — quantization is an
//! interpretation stage owned by [`crate::snap`] and neither reads the
//! other's toggle (`PXG-5`); the two agree only on the lattice itself
//! (quantum 1, integer canvas coordinates).
//!
//! The split of labor with the shell mirrors the web host
//! (`@grida/canvas-pixelgrid` / the hud `pixel-grid` primitive): the
//! plan here is a pure function of (enabled, zoom, visible rect) —
//! `PXG-4` — and the shell paints each planned offset as a full-height
//! (-width) line, stroked at [`STROKE_DEVICE_PX`] **in device space**
//! so the hairline is one device pixel at any zoom and display scale
//! (`PXG-3` is that paint rule; the plan carries no widths because
//! width must not scale with the camera).

use math2::rect::Rectangle;

/// The zoom gate (`PXG-2`): the grid renders only while
/// `zoom > ZOOM_THRESHOLD` (logical screen px per canvas unit). Below
/// ~4× the hairlines collapse into a moiré wash; the gate is a hard
/// switch, not a fade — web host parity.
pub const ZOOM_THRESHOLD: f32 = 4.0;

/// Overscan beyond the visible range, canvas units, so lines do not
/// pop at the viewport edge during pan (web parity: ±2 steps).
pub const OVERSCAN: i64 = 2;

/// The stroke width the painter must use, in **device** pixels
/// (`PXG-3`): the shell strokes planned lines in device space at this
/// width instead of scaling a canvas-space width by the camera.
pub const STROKE_DEVICE_PX: f32 = 1.0;

/// One frame's grid plan: every integer canvas coordinate to paint,
/// per axis. `xs` are vertical lines (`x = k`), `ys` horizontal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lines {
    pub xs: Vec<i64>,
    pub ys: Vec<i64>,
}

/// Plan the grid for one frame. Pure over its inputs (`PXG-4`):
/// `None` when the grid is disabled or the zoom gate holds
/// (`PXG-2`); otherwise every integer canvas coordinate in `visible`
/// (plus [`OVERSCAN`]) on both axes.
pub fn plan(enabled: bool, zoom: f32, visible: &Rectangle) -> Option<Lines> {
    // `zoom > threshold` (not `>= / !<=`): the gate holds at the
    // threshold itself, and a NaN zoom keeps it closed.
    let open = enabled && zoom > ZOOM_THRESHOLD;
    if !open {
        return None;
    }
    let span = |lo: f32, hi: f32| -> Vec<i64> {
        let (lo, hi) = (lo.min(hi), lo.max(hi));
        let start = (lo.floor() as i64) - OVERSCAN;
        let end = (hi.ceil() as i64) + OVERSCAN;
        (start..=end).collect()
    };
    Some(Lines {
        xs: span(visible.x, visible.x + visible.width),
        ys: span(visible.y, visible.y + visible.height),
    })
}
