//! ENG-2.4 socket · the one frame entry point. `render(...)` (step 6)
//! runs `resolve -> build -> execute` and returns the resolved tier, the
//! drawlist, and timings — the host clears the canvas and paints its own
//! chrome around this, never the other way round (the compositor owns
//! pacing; the host adapts). Kept a single seam so the fragmented
//! tick/redraw rot the legacy `FrameLoop` unified never regrows.

use anchor_lab::math::Affine;
use anchor_lab::model::Document;
use anchor_lab::resolve::{resolve_with_text_layout, ResolveOptions, Resolved};
use std::time::Instant;

use crate::drawlist::{build_with_text_fonts, DrawList};
use crate::paint::{execute, PaintCtx};
use crate::text_layout::SkiaTextLayoutOracle;

/// Per-frame timings for the three pipeline seams (nanoseconds). Populated
/// by the same spans [`crate::trace`] reads when the `trace` feature is on;
/// always cheap enough to compute unconditionally here.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct FrameStats {
    pub resolve_ns: u128,
    pub build_ns: u128,
    pub execute_ns: u128,
}

/// Resolve a document with the host text environment and build a replayable
/// drawlist that owns every exact font selected during shaping.
///
/// This is the public non-rasterizing stage boundary. Callers that need stage
/// retained lists or custom surfaces use it instead of combining the glyphless
/// compatibility resolver with [`crate::drawlist::build_glyphless`].
pub fn resolve_and_build(
    doc: &Document,
    opts: &ResolveOptions,
    ctx: &PaintCtx,
) -> (Resolved, DrawList) {
    let (resolved, list, _) = resolve_and_build_profiled(doc, opts, ctx);
    (resolved, list)
}

fn resolve_and_build_profiled(
    doc: &Document,
    opts: &ResolveOptions,
    ctx: &PaintCtx,
) -> (Resolved, DrawList, FrameStats) {
    let t0 = Instant::now();
    let text_layout = SkiaTextLayoutOracle::new(ctx);
    let resolved = resolve_with_text_layout(doc, opts, &text_layout);
    let t1 = Instant::now();
    let list = build_with_text_fonts(doc, &resolved, text_layout.font_registry());
    let t2 = Instant::now();
    (
        resolved,
        list,
        FrameStats {
            resolve_ns: (t1 - t0).as_nanos(),
            build_ns: (t2 - t1).as_nanos(),
            execute_ns: 0,
        },
    )
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
    let (resolved, list, mut stats) = resolve_and_build_profiled(doc, opts, ctx);
    let t0 = Instant::now();
    execute(canvas, &list, view, ctx);
    stats.execute_ns = t0.elapsed().as_nanos();
    (resolved, list, stats)
}
