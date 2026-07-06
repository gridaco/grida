//! Pixel-grid conformance — `docs/wg/canvas/pixel-grid.md`
//! (`PXG-1..5`): the visual lattice render as a pure plan.
//!
//! Headless notes on the contracts this suite can and cannot carry:
//!
//! - `PXG-2` (zoom gate) and `PXG-4` (determinism) test directly
//!   against [`pixel_grid::plan`].
//! - `PXG-3` (one device pixel) is a paint rule: the shell strokes
//!   planned lines in device space at [`pixel_grid::STROKE_DEVICE_PX`]
//!   instead of scaling a canvas-space width by the camera. The plan
//!   deliberately carries no width, so the only assertable half here
//!   is the constant the paint glue is bound to.
//! - `PXG-1`/`PXG-5` (purity / independence) are structural: the plan
//!   takes no snap configuration and the snap module takes no render
//!   flag — there is no code path from one to the other. The snap
//!   suite (`snap_contracts.rs`) exercises quantization with no grid
//!   anywhere in sight, which is `PXG-5`'s testable content.

use grida_editor::pixel_grid;
use math2::rect::Rectangle;

// PXG-2: at zoom ≤ threshold no line is planned even when enabled; at
// zoom > threshold every integer coordinate in view (plus overscan)
// is.
#[test]
fn pxg_2_zoom_gate_is_a_hard_switch() {
    let visible = Rectangle::from_xywh(10.3, 20.7, 5.5, 3.2);
    assert!(pixel_grid::plan(true, 4.0, &visible).is_none(), "at gate");
    assert!(pixel_grid::plan(true, 1.0, &visible).is_none(), "below");
    assert!(
        pixel_grid::plan(false, 64.0, &visible).is_none(),
        "disabled at any zoom"
    );

    let lines = pixel_grid::plan(true, 4.01, &visible).expect("above gate");
    // x ∈ [10.3, 15.8] → integers 10..=16, plus ±2 overscan.
    assert_eq!(lines.xs.first(), Some(&8));
    assert_eq!(lines.xs.last(), Some(&18));
    // y ∈ [20.7, 23.9] → integers 20..=24, plus ±2 overscan.
    assert_eq!(lines.ys.first(), Some(&18));
    assert_eq!(lines.ys.last(), Some(&26));
    // Every integer in between: the lattice has no holes.
    assert!(lines.xs.windows(2).all(|w| w[1] - w[0] == 1));
    assert!(lines.ys.windows(2).all(|w| w[1] - w[0] == 1));
}

// PXG-4: the plan is a pure function of (enabled, zoom, visible).
#[test]
fn pxg_4_plan_is_deterministic() {
    let visible = Rectangle::from_xywh(-3.7, 9.1, 12.0, 7.5);
    assert_eq!(
        pixel_grid::plan(true, 8.0, &visible),
        pixel_grid::plan(true, 8.0, &visible)
    );
}

// PXG-3's assertable half: the device-space stroke width the paint
// glue is bound to. The width is a constant, not a plan output,
// precisely so it can never scale with the camera.
#[test]
fn pxg_3_stroke_width_is_one_device_px() {
    assert_eq!(pixel_grid::STROKE_DEVICE_PX, 1.0);
}
