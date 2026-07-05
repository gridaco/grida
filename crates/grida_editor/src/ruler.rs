//! Ruler — the edge rulers' pure strip layout
//! (`docs/wg/canvas/ruler.md`, `RUL-*`).
//!
//! This module owns the layout *math* of a strip — tick step
//! selection, merged selection ranges, the fade near priority points
//! — as pure functions (`RUL-1`: the strips are a pure function of
//! camera, viewport, selection bounds, and guides). The shell paints
//! from these; guide *interaction* rides the HUD's intent seam
//! ([`crate::hud`], `RUL-9`), and guide *truth* lives in the document
//! ([`crate::document`], `RUL-4`).
//!
//! Ported from the web doctrine source (`@grida/canvas-hud`'s `ruler`
//! primitive / `@grida/ruler`): same 1-2-5 step series, same ≥ 50 px
//! spacing rule, same overlap-fade semantics.
//!
//! Axis orientation (`RUL-10`) in these terms: a strip lays out its
//! **own** axis — the caller passes the top strip x-projected ranges,
//! marks for axis-`x` guides, and the x components of the camera; the
//! counter-axis *authoring* rule lives entirely in the HUD's strip
//! regions.

/// Strip width, logical px — same for both strips so the corner
/// square stays square (web `DEFAULT_RULER_STRIP`).
pub const STRIP_PX: f32 = 20.0;

/// Minimum on-screen major-tick spacing (`RUL-2`).
pub const TICK_MIN_SPACING_PX: f32 = 50.0;

/// The 1-2-5 step series, canvas units (web `DEFAULT_RULER_STEPS`).
pub const STEPS: [f32; 12] = [
    1.0, 2.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0,
];

/// Fade radius around priority points (guide marks, range
/// boundaries), screen px (web `DEFAULT_RULER_OVERLAP_THRESHOLD`).
pub const FADE_PX: f32 = 80.0;

/// The tick step for a zoom (`RUL-2`): the smallest series step whose
/// on-screen spacing is ≥ [`TICK_MIN_SPACING_PX`]; the largest step
/// when none satisfies it.
pub fn step(zoom: f32) -> f32 {
    let z = zoom.abs();
    for s in STEPS {
        if s * z >= TICK_MIN_SPACING_PX {
            return s;
        }
    }
    STEPS[STEPS.len() - 1]
}

/// A major tick: its canvas-unit coordinate and screen position.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tick {
    /// Canvas-unit coordinate (the label).
    pub unit: f32,
    /// Screen position along the strip, logical px.
    pub px: f32,
}

/// The major ticks visible on a strip of `length_px`, given the
/// camera's axis components (`zoom` = scale, `offset_px` =
/// translation): every [`step`]-multiple whose projection lands in
/// `[0, length_px]`.
pub fn ticks(zoom: f32, offset_px: f32, length_px: f32) -> Vec<Tick> {
    if !zoom.is_finite() || zoom == 0.0 || !offset_px.is_finite() || length_px <= 0.0 {
        return Vec::new();
    }
    let step = step(zoom);
    let start_unit = -offset_px / zoom;
    let end_unit = start_unit + length_px / zoom;
    let (lo, hi) = (start_unit.min(end_unit), start_unit.max(end_unit));
    let first = (lo / step).floor() * step;
    let mut out = Vec::new();
    let mut unit = first;
    while unit < hi {
        let px = unit * zoom + offset_px;
        if (0.0..=length_px).contains(&px) {
            out.push(Tick { unit, px });
        }
        unit += step;
    }
    out
}

/// Merge overlapping ranges (`RUL-3`): sorted by start, ranges whose
/// spans touch or overlap fuse, so a multi-selection's shared
/// boundaries never double-label. Canvas units, `[min, max]` pairs.
pub fn merge_ranges(ranges: &[[f32; 2]]) -> Vec<[f32; 2]> {
    if ranges.is_empty() {
        return Vec::new();
    }
    let mut sorted: Vec<[f32; 2]> = ranges
        .iter()
        .map(|r| [r[0].min(r[1]), r[0].max(r[1])])
        .collect();
    sorted.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap_or(std::cmp::Ordering::Equal));
    let mut merged: Vec<[f32; 2]> = Vec::with_capacity(sorted.len());
    let mut prev = sorted[0];
    for curr in sorted.into_iter().skip(1) {
        if curr[0] <= prev[1] {
            prev[1] = prev[1].max(curr[1]);
        } else {
            merged.push(prev);
            prev = curr;
        }
    }
    merged.push(prev);
    merged
}

/// Tick alpha near priority points (guide marks, range boundaries):
/// proportional to the distance to the nearest priority point within
/// [`FADE_PX`], and to the strip origin (the corner square) — the
/// web's overlap rule, so authored positions win the label space.
pub fn fade(pos_px: f32, priority_px: &[f32]) -> f32 {
    let mut alpha: f32 = if pos_px.abs() < FADE_PX {
        pos_px.abs() / FADE_PX
    } else {
        1.0
    };
    for q in priority_px {
        let d = (q - pos_px).abs();
        if d < FADE_PX {
            alpha = alpha.min(d / FADE_PX);
        }
    }
    alpha
}

/// Chrome label for a canvas-unit coordinate: integer-clean, one
/// decimal otherwise (shared formatting with the HUD's badges).
pub fn label(unit: f32) -> String {
    crate::hud::label_number(unit)
}
