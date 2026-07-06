//! Transparency grid — the alpha backdrop
//! (`docs/wg/canvas/transparency-grid.md`, `TG-*`).
//!
//! The checkerboard at the very bottom of the canvas stack
//! (transparency grid → solid background → content → pixel grid →
//! chrome): it shows wherever the layers above leave alpha, which is
//! what makes "nothing is painted here" visible. Pure plan — a
//! function of (device zoom, visible rect), `TG-1` — the shell
//! composites it (destination-over, after the content pass, since the
//! renderer owns the surface clear; see the doc's engine note).
//!
//! Cell math is the web doctrine source
//! (`@grida/canvas-transparency-grid`): a ~[`CELL_DEVICE_PX`] visual
//! cell at any zoom, achieved by quantizing `target / zoom` to the
//! 1-2-5 "nice number" series (`TG-3`) — the size steps rather than
//! shimmers as the camera scales, and cells stay anchored to
//! canvas-space step multiples so the pattern pans with the content.

use math2::rect::Rectangle;

/// Target visual cell size, device px (web parity).
pub const CELL_DEVICE_PX: f32 = 20.0;

/// Overscan beyond the visible range, in cells (web parity).
pub const OVERSCAN: i64 = 2;

/// Quantize to the 1-2-5 series ("nice numbers", web `quantize`):
/// `1eN`, `2eN`, or `5eN`, whichever band the value falls in.
/// Pathological inputs fall back to 1.
pub fn nice(value: f32) -> f32 {
    if value <= 0.0 || !value.is_finite() {
        return 1.0;
    }
    let exponent = value.log10().floor();
    let magnitude = 10f32.powf(exponent);
    let fraction = value / magnitude;
    let nice_fraction = if fraction < 1.5 {
        1.0
    } else if fraction < 3.0 {
        2.0
    } else if fraction < 7.0 {
        5.0
    } else {
        10.0
    };
    nice_fraction * magnitude
}

/// The cell size in canvas units for a device-scale zoom (`TG-3`).
pub fn step(zoom_device: f32) -> f32 {
    nice(CELL_DEVICE_PX / zoom_device.max(f32::EPSILON))
}

/// One frame's checker plan: the cell step (canvas units) and the
/// inclusive cell-index ranges covering the visible rect plus
/// overscan. A cell `(i, j)` spans
/// `[i·step, (i+1)·step) × [j·step, (j+1)·step)`; the filled cells
/// are those with even `i + j`.
#[derive(Debug, Clone, PartialEq)]
pub struct Cells {
    pub step: f32,
    pub ix: [i64; 2],
    pub iy: [i64; 2],
}

/// Plan the checker for one frame. Pure over its inputs (`TG-1`).
pub fn plan(zoom_device: f32, visible: &Rectangle) -> Cells {
    let step = step(zoom_device);
    let span = |lo: f32, hi: f32| -> [i64; 2] {
        let (lo, hi) = (lo.min(hi), lo.max(hi));
        [
            (lo / step).floor() as i64 - OVERSCAN,
            (hi / step).ceil() as i64 + OVERSCAN,
        ]
    };
    Cells {
        step,
        ix: span(visible.x, visible.x + visible.width),
        iy: span(visible.y, visible.y + visible.height),
    }
}
