//! ENG-2.4 socket · the one frame entry point. `render(...)` (step 6)
//! runs `resolve -> build -> execute` and returns the resolved tier, the
//! drawlist, and timings — the host clears the canvas and paints its own
//! chrome around this, never the other way round (the compositor owns
//! pacing; the host adapts). Kept a single seam so the fragmented
//! tick/redraw rot the legacy `FrameLoop` unified never regrows.

use anchor_lab::math::Affine;
use anchor_lab::model::Document;
use anchor_lab::resolve::{resolve, ResolveOptions, Resolved};
use std::time::Instant;

use crate::drawlist::{build, DrawList};
use crate::paint::{execute, PaintCtx};

/// Per-frame timings for the three pipeline seams (nanoseconds). Populated
/// by the same spans [`crate::trace`] reads when the `trace` feature is on;
/// always cheap enough to compute unconditionally here.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct FrameStats {
    pub resolve_ns: u128,
    pub build_ns: u128,
    pub execute_ns: u128,
}

/// The one frame entry: `resolve -> build -> execute`, immediate, no caches
/// (the spike's proven thesis). The host clears the canvas and paints its own
/// chrome around this; it never reaches into the stages. Returns the resolved
/// tier and drawlist (the host reuses them for HUD/pick/damage) plus timings.
/// The only skia this module names is the `Canvas` it hands to the executor —
/// all raster work stays in [`crate::paint`] (S-1).
pub fn render(
    canvas: &skia_safe::Canvas,
    doc: &Document,
    opts: &ResolveOptions,
    view: &Affine,
    ctx: &PaintCtx,
) -> (Resolved, DrawList, FrameStats) {
    let t0 = Instant::now();
    let resolved = resolve(doc, opts);
    let t1 = Instant::now();
    let list = build(doc, &resolved);
    let t2 = Instant::now();
    execute(canvas, &list, view, ctx);
    let t3 = Instant::now();
    let stats = FrameStats {
        resolve_ns: (t1 - t0).as_nanos(),
        build_ns: (t2 - t1).as_nanos(),
        execute_ns: (t3 - t2).as_nanos(),
    };
    (resolved, list, stats)
}
