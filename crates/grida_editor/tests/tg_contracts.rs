//! Transparency-grid conformance — `docs/wg/canvas/transparency-grid.md`
//! (`TG-1..3`): the alpha backdrop's pure checker plan.
//!
//! `TG-2` (stack position) is a compositing rule: the shell paints the
//! plan destination-over after the content pass, so it lands exactly
//! where the layers above leave alpha. That half is paint glue; what
//! this suite carries is the plan's purity (`TG-1`) and the cell-size
//! stability band (`TG-3`).

use grida_editor::transparency_grid as tg;
use math2::rect::Rectangle;

// TG-3: at any zoom the cell's on-screen size stays within the 1-2-5
// quantization band around the 20-device-px target — it steps, never
// shimmers, and never collapses or explodes.
#[test]
fn tg_3_cell_size_stays_in_the_quantization_band() {
    for zoom in [0.02_f32, 0.1, 0.5, 1.0, 2.0, 4.0, 13.7, 64.0, 256.0] {
        let step = tg::step(zoom);
        let on_screen = step * zoom;
        // The 1-2-5 series brackets any target within [t/3, t·10/7)·…
        // in practice: a 20 px target lands between ~10 and ~67 px.
        assert!(
            (10.0..=67.0).contains(&on_screen),
            "zoom {zoom}: cell {step} canvas units = {on_screen} device px"
        );
    }
    // The quantized step is always a nice number: 1, 2, or 5 times a
    // power of ten.
    for v in [0.3_f32, 1.0, 4.9, 7.2, 19.0, 333.0] {
        let n = tg::nice(v);
        let mag = 10f32.powf(n.log10().floor());
        let frac = (n / mag).round();
        assert!(
            [1.0, 2.0, 5.0].contains(&frac) || (n / mag - 10.0).abs() < 1e-3,
            "nice({v}) = {n}"
        );
    }
}

// TG-1: the plan is a pure function of (zoom, visible), and covers
// the visible range plus overscan with cells anchored at canvas-space
// step multiples.
#[test]
fn tg_1_plan_is_pure_and_covers_the_view() {
    let visible = Rectangle::from_xywh(-37.5, 12.25, 400.0, 300.0);
    let a = tg::plan(1.0, &visible);
    let b = tg::plan(1.0, &visible);
    assert_eq!(a, b, "equal inputs, equal plans");

    // Every visible point falls inside the planned index ranges.
    let step = a.step;
    assert!((a.ix[0] as f32) * step <= visible.x);
    assert!((a.ix[1] as f32) * step >= visible.x + visible.width);
    assert!((a.iy[0] as f32) * step <= visible.y);
    assert!((a.iy[1] as f32) * step >= visible.y + visible.height);
}
