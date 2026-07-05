//! Gesture-time alignment — `docs/wg/canvas/snap.md` (`SNAP-*`
//! contracts): the snap family (geometry, space, pixel grid) as
//! interpretation stages, with the guide chrome that explains them.
//!
//! Host-side and pure, like [`crate::measurement`]: the HUD stays
//! snap-blind (`SNAP-1` extends `HUD-1/7`) — [`crate::interpret`]
//! calls [`translate`] / [`resize`] between intent and mutation, and
//! the chrome rides the HUD draw list as decorative host-fed extras.
//!
//! The engine is `math2::snap` (the `cmath.ext.snap` port); this
//! module owns the canvas orchestration instead of
//! [`math2::snap::canvas::snap_to_canvas_geometry`] because that
//! function drops the axis-level hit indices the guide chrome needs,
//! and the space orchestration outright (both-sides snap over the
//! distribution projections plus the direction-aligned anchor filter
//! — the named gaps in snap.md's "Engine notes"). Vector-geometry
//! snapping is a separate deferred system
//! (`docs/wg/feat-vector-network/snap-vector.md`).
//!
//! Doctrine sources: threshold and quantum from the web editor
//! (`editor/grida-canvas/reducers/tools/snap.ts` — `q = 1`,
//! `threshold = ceil(factor / zoom) − 0.5`, the 64-anchor limits);
//! the space orchestration from `@grida/cmath/_snap`'s
//! `snapToObjectsSpace` (the reference combines a pair's two flanks
//! by strongest |distance| where the TS takes a plain signed min — a
//! quirk, not doctrine); resize moving-edge snapping from
//! `@grida/svg-editor`'s `SnapSession.snap_resize`; chrome rules from
//! `cmath`'s `guide.plot` (hit points as markers, co-aligned hits
//! spanned by hairlines, guide/resize hits as full-length rules,
//! space hits as labelled gap lines).

use math2::range;
use math2::rect::{self, Rectangle};
use math2::snap::axis::{self, Snap1DResult};
use math2::snap::spacing::{self, ProjectionPoint};
use math2::vector2::Axis;

pub use math2::snap::canvas::Guide;

use crate::hud::{HudPrim, Role};

/// The two toggles the host exposes (`snap.md`), independent and both
/// on by default in the reference editor. Space snap rides the
/// `geometry` toggle — both are content snaps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Config {
    /// Content snaps: magnetic alignment to neighborhood bounds and
    /// guides (`SNAP-2`, `SNAP-10`) and equal-spacing candidates
    /// (`SNAP-11`).
    pub geometry: bool,
    /// Snap to pixel grid: quantization of gesture-produced values
    /// (`SNAP-4`).
    pub pixel_grid: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            geometry: true,
            pixel_grid: true,
        }
    }
}

/// The unit lattice (`SNAP-4`). A configurable quantum is named
/// deferred in snap.md.
const QUANTUM: f32 = 1.0;

/// Screen-space capture distance factor (reference 5–6 px,
/// `SNAP-9`); the web's `DEFAULT_SNAP_MOVEMENT_THRESHOLD_FACTOR`.
pub const THRESHOLD_FACTOR: f32 = 5.0;

/// Anchor counts above this get the proximity pre-filter, and the
/// space snap turns off entirely (its distribution geometry is
/// quadratic in anchors; the web's `SPACING_SNAP_ANCHOR_LIMIT`).
const NEARBY_FILTER_LIMIT: usize = 64;

/// The magnetic zone in canvas units: a screen constant divided by
/// zoom (`SNAP-9`). The web's exact shape — `ceil` onto the integer
/// lattice, then −0.5 so a quantized distance is strictly inside or
/// outside the zone, never on its edge.
pub fn threshold(zoom: f32) -> f32 {
    (THRESHOLD_FACTOR / zoom.max(f32::EPSILON)).ceil() - 0.5
}

/// The frozen snap session (`SNAP-7`): agent and anchors are captured
/// once at gesture start and reused every move — a gesture cannot
/// chase its own snapping. When the pixel grid was on at freeze,
/// members and anchors are lattice-quantized here, so content snap
/// between them stays on the lattice (`SNAP-4` composes with
/// `SNAP-2`).
#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    /// Union bounds of the moving content at gesture start.
    pub agent: Rectangle,
    /// The neighborhood: parent + sibling bounds, plus nothing the
    /// gesture moves.
    pub anchors: Vec<Rectangle>,
    /// The scene's guides ([ruler](../docs/wg/canvas/ruler.md)).
    pub guides: Vec<Guide>,
    /// Pixel-grid state captured at freeze; a mid-gesture settings
    /// flip takes effect on the next gesture (the *disable modifier*
    /// stays live — `SNAP-3` names the content snaps only).
    quantized: bool,
}

impl Session {
    pub fn freeze(
        member_worlds: &[Rectangle],
        anchors: Vec<Rectangle>,
        guides: Vec<Guide>,
        pixel_grid: bool,
    ) -> Self {
        let q = |r: Rectangle| {
            if pixel_grid {
                rect::quantize(r, QUANTUM)
            } else {
                r
            }
        };
        let members: Vec<Rectangle> = member_worlds.iter().map(|r| q(*r)).collect();
        Self {
            agent: rect::union(&members),
            anchors: anchors.into_iter().map(q).collect(),
            guides,
            quantized: pixel_grid,
        }
    }
}

/// One space-snap hit (`SNAP-11`), denormalized to what the gap-label
/// chrome needs.
#[derive(Debug, Clone, PartialEq)]
pub struct SpacingHit {
    /// Main-axis span of the new equal gap: the projection origin →
    /// the landed edge (`o → p`).
    pub line: [f32; 2],
    /// Index into [`Session::anchors`] — the rect the new gap is
    /// measured from; its counter-axis mid carries the gap line.
    pub anchor: usize,
    /// The existing uniform-gap pair the candidate extends —
    /// `([anchor indices], gap)`; `None` for a center fit.
    pub pair: Option<([usize; 2], f32)>,
}

/// One axis's content-snap hit, at the level of detail the chrome
/// needs (`SNAP-8`): which agent points aligned, to which anchor
/// points, guides, or spacing candidates. Only the winning source(s)
/// carry hits.
#[derive(Debug, Clone, PartialEq)]
pub struct AxisHit {
    /// The signed correction applied on this axis.
    pub distance: f32,
    /// Indices into the snapped agent's 9-points chunk.
    pub agent_points: Vec<usize>,
    /// `(anchor index, 9-point index)` pairs that aligned.
    pub anchor_points: Vec<(usize, usize)>,
    /// Indices into the session's guides that aligned.
    pub guides: Vec<usize>,
    /// Equal-spacing candidates that aligned (`SNAP-11`).
    pub spacing: Vec<SpacingHit>,
}

/// A content snap that fired on at least one axis.
#[derive(Debug, Clone, PartialEq)]
pub struct GeometrySnap {
    /// The agent rect after all correction, canvas space.
    pub agent: Rectangle,
    pub x: Option<AxisHit>,
    pub y: Option<AxisHit>,
}

/// One corrected translate preview.
#[derive(Debug, Clone, PartialEq)]
pub struct Snapped {
    /// The corrected cumulative delta, relative to the frozen agent.
    pub delta: [f32; 2],
    /// Present exactly when a content snap aligned an axis — the
    /// chrome source (`SNAP-8`); `None` draws nothing.
    pub geometry: Option<GeometrySnap>,
}

/// The translate pipeline (snap.md "The pipeline"): axis-lock arrives
/// in `movement` (a locked axis is `None` — it is never snapped and
/// its component of the result is the frozen-axis identity), then the
/// pixel-grid stage quantizes the moved position against the frozen
/// gesture-start anchor (`SNAP-4` — no drift across previews), then
/// the content snaps (geometry `SNAP-2`, space `SNAP-11`) correct
/// toward the strongest alignment within threshold, live-bypassed by
/// the disable modifier (`SNAP-3`). Pure: same session, config,
/// movement → same result.
pub fn translate(
    session: &Session,
    config: &Config,
    disabled: bool,
    movement: axis::Movement,
    zoom: f32,
) -> Snapped {
    let normalized = axis::normalize(movement);
    let mut moved = session.agent.translate(normalized);
    if session.quantized {
        // round(anchor + delta): the rounding anchor is the frozen
        // (already-integral) gesture-start origin, so this equals the
        // spec's q(delta) = round((anchor+delta)/q)·q − anchor.
        moved = rect::quantize(moved, QUANTUM);
    }

    let geometry = if config.geometry && !disabled {
        snap_content(session, moved, movement, zoom)
    } else {
        None
    };
    if let Some(geo) = &geometry {
        moved = geo.agent;
    }

    Snapped {
        delta: [moved.x - session.agent.x, moved.y - session.agent.y],
        geometry,
    }
}

/// Scalar of a point on an axis.
fn on(axis: Axis, p: &[f32; 2]) -> f32 {
    match axis {
        Axis::X => p[0],
        Axis::Y => p[1],
    }
}

fn counter(axis: Axis) -> Axis {
    match axis {
        Axis::X => Axis::Y,
        Axis::Y => Axis::X,
    }
}

/// Content snap on the moved agent: per axis (skipping locked ones),
/// geometry — the agent's 9-points against the anchors' 9-points and
/// its min/max/center against the guides — then space — equal-gap
/// candidates from direction-aligned anchors, tested at the
/// geometry-corrected position. The strongest hit within threshold
/// wins (by magnitude); ties draw every winning source's chrome.
fn snap_content(
    session: &Session,
    moved: Rectangle,
    movement: axis::Movement,
    zoom: f32,
) -> Option<GeometrySnap> {
    let t = threshold(zoom);

    // Proximity pre-filter: anchors beyond any possible alignment
    // reach cannot hit; keep per-move cost bounded at large counts.
    let anchor_indices: Vec<usize> = if session.anchors.len() > NEARBY_FILTER_LIMIT {
        let pad = t + moved.width.max(moved.height);
        session
            .anchors
            .iter()
            .enumerate()
            .filter(|(_, r)| {
                r.x + r.width >= moved.x - pad
                    && r.x <= moved.x + moved.width + pad
                    && r.y + r.height >= moved.y - pad
                    && r.y <= moved.y + moved.height + pad
            })
            .map(|(i, _)| i)
            .collect()
    } else {
        (0..session.anchors.len()).collect()
    };

    let agent9 = rect::to_9points_chunk(&moved);

    // ── Pass 1: geometry (objects + guides), per axis ──────────────
    struct AxisSources {
        objects: Option<Snap1DResult>,
        guides: Option<Snap1DResult>,
        guide_map: Vec<usize>,
    }
    let sources = |axis: Axis| -> AxisSources {
        let agent_scalars: Vec<f32> = agent9.iter().map(|p| on(axis, p)).collect();
        let anchor_scalars: Vec<f32> = anchor_indices
            .iter()
            .flat_map(|&i| rect::to_9points_chunk(&session.anchors[i]))
            .map(|p| on(axis, &p))
            .collect();
        let objects = snap1d_opt(&agent_scalars, &anchor_scalars, t);

        let guide_map: Vec<usize> = session
            .guides
            .iter()
            .enumerate()
            .filter(|(_, g)| g.axis == axis)
            .map(|(i, _)| i)
            .collect();
        let guide_offsets: Vec<f32> = guide_map
            .iter()
            .map(|&i| session.guides[i].offset)
            .collect();
        let range3 = range::to_3points_chunk(range::from_rectangle(&moved, axis));
        let guides = snap1d_opt(&range3, &guide_offsets, t);
        AxisSources {
            objects,
            guides,
            guide_map,
        }
    };
    let sx = movement.0.is_some().then(|| sources(Axis::X));
    let sy = movement.1.is_some().then(|| sources(Axis::Y));

    let dist = |r: &Option<Snap1DResult>| r.as_ref().map_or(f32::INFINITY, |r| r.distance);
    let best2 = |a: f32, b: f32| if a.abs() <= b.abs() { a } else { b };
    let geo_best = |s: &Option<AxisSources>| {
        s.as_ref()
            .map_or(f32::INFINITY, |s| best2(dist(&s.objects), dist(&s.guides)))
    };
    let (gx, gy) = (geo_best(&sx), geo_best(&sy));

    // ── Pass 2: space, per axis, alignment-tested at the geometry-
    // corrected position (the TS `intersectionTest`) ────────────────
    let tested = moved.translate([
        if gx.is_finite() { gx } else { 0.0 },
        if gy.is_finite() { gy } else { 0.0 },
    ]);
    let space = |axis: Axis, enabled: bool| -> Option<(f32, Vec<SpacingHit>)> {
        if !enabled || session.anchors.len() > NEARBY_FILTER_LIMIT {
            return None;
        }
        snap_space_axis(session, moved, tested, axis, t)
    };
    let spx = space(Axis::X, sx.is_some());
    let spy = space(Axis::Y, sy.is_some());

    // ── Pass 3: combine — strongest |distance| wins, ties compose ──
    let combine = |s: Option<AxisSources>, sp: Option<(f32, Vec<SpacingHit>)>| -> Option<AxisHit> {
        let s = s?;
        let (od, gd) = (dist(&s.objects), dist(&s.guides));
        let spd = sp.as_ref().map_or(f32::INFINITY, |(d, _)| *d);
        let d = best2(best2(od, gd), spd);
        if d.is_infinite() {
            return None;
        }
        let mut hit = AxisHit {
            distance: d,
            agent_points: Vec::new(),
            anchor_points: Vec::new(),
            guides: Vec::new(),
            spacing: Vec::new(),
        };
        if od == d
            && let Some(o) = s.objects
        {
            hit.agent_points = o.hit_agent_indices;
            hit.anchor_points = o
                .hit_anchor_indices
                .into_iter()
                .map(|flat| (anchor_indices[flat / 9], flat % 9))
                .collect();
            hit.anchor_points.sort_unstable();
        }
        if gd == d
            && let Some(g) = s.guides
        {
            hit.guides = g
                .hit_anchor_indices
                .into_iter()
                .map(|i| s.guide_map[i])
                .collect();
            hit.guides.sort_unstable();
        }
        if spd == d
            && let Some((_, hits)) = sp
        {
            hit.spacing = hits;
        }
        Some(hit)
    };
    let x = combine(sx, spx);
    let y = combine(sy, spy);
    if x.is_none() && y.is_none() {
        return None;
    }
    let dx = x.as_ref().map_or(0.0, |h| h.distance);
    let dy = y.as_ref().map_or(0.0, |h| h.distance);
    Some(GeometrySnap {
        agent: moved.translate([dx, dy]),
        x,
        y,
    })
}

/// Space snap on one axis (`SNAP-11`): direction-aligned anchors
/// (counter-axis ranges overlapping the agent's, tested at its
/// geometry-corrected position) plot their distribution geometry;
/// the agent's leading edge snaps to the after-gap flank, its
/// trailing edge to the before-gap flank (plus the center fit inside
/// a wider gap), and the two flanks combine by strongest |distance|.
fn snap_space_axis(
    session: &Session,
    moved: Rectangle,
    tested: Rectangle,
    axis: Axis,
    t: f32,
) -> Option<(f32, Vec<SpacingHit>)> {
    let c = counter(axis);
    let test_range = range::from_rectangle(&tested, c);
    let aligned: Vec<usize> = session
        .anchors
        .iter()
        .enumerate()
        .filter(|(_, a)| {
            let r = range::from_rectangle(a, c);
            r[0] <= test_range[1] && test_range[0] <= r[1]
        })
        .map(|(i, _)| i)
        .collect();
    if aligned.is_empty() {
        return None;
    }
    let ranges: Vec<range::Range> = aligned
        .iter()
        .map(|&i| range::from_rectangle(&session.anchors[i], axis))
        .collect();
    let agent_range = range::from_rectangle(&moved, axis);
    let geom = spacing::plot_distribution_geometry(&ranges, Some(agent_range[1] - agent_range[0]));

    let flatten = |side: &[Vec<ProjectionPoint>]| -> (Vec<ProjectionPoint>, Vec<usize>) {
        let mut flat = Vec::new();
        let mut loops = Vec::new();
        for (li, points) in side.iter().enumerate() {
            for p in points {
                flat.push(*p);
                loops.push(li);
            }
        }
        (flat, loops)
    };
    let (a_flat, a_loops) = flatten(&geom.a);
    let (b_flat, b_loops) = flatten(&geom.b);
    let a_pos: Vec<f32> = a_flat.iter().map(|p| p.p).collect();
    let b_pos: Vec<f32> = b_flat.iter().map(|p| p.p).collect();
    let a_snap = snap1d_opt(&[agent_range[0]], &a_pos, t);
    let b_snap = snap1d_opt(&[agent_range[1]], &b_pos, t);

    let dist = |r: &Option<Snap1DResult>| r.as_ref().map_or(f32::INFINITY, |r| r.distance);
    let (ad, bd) = (dist(&a_snap), dist(&b_snap));
    let d = if ad.abs() <= bd.abs() { ad } else { bd };
    if d.is_infinite() {
        return None;
    }

    let mut hits: Vec<SpacingHit> = Vec::new();
    let mut collect =
        |snap: &Option<Snap1DResult>, flat: &[ProjectionPoint], loops: &[usize], leading: bool| {
            let Some(s) = snap else { return };
            if s.distance != d {
                return;
            }
            let mut indices = s.hit_anchor_indices.clone();
            indices.sort_unstable();
            for fi in indices {
                let pp = flat[fi];
                let own = geom.loops[loops[fi]];
                let center_fit = pp.fwd < 0;
                // The rect the new gap is measured from: the pair member
                // whose edge the projection origin sits on (`guide.plot`'s
                // pick, per flank).
                let pick = match (leading, center_fit) {
                    (true, true) | (false, false) => 0,
                    (true, false) | (false, true) => 1,
                };
                let anchor = aligned[own[pick]];
                let pair = (!center_fit).then(|| {
                    let f = pp.fwd as usize;
                    let l = geom.loops[f];
                    ([aligned[l[0]], aligned[l[1]]], geom.gaps[f])
                });
                hits.push(SpacingHit {
                    line: [pp.o, pp.p],
                    anchor,
                    pair,
                });
            }
        };
    collect(&a_snap, &a_flat, &a_loops, true);
    collect(&b_snap, &b_flat, &b_loops, false);
    Some((d, hits))
}

/// `snap1d`, with the empty/no-hit cases folded to `None`.
fn snap1d_opt(agents: &[f32], anchors: &[f32], threshold: f32) -> Option<Snap1DResult> {
    if agents.is_empty() || anchors.is_empty() {
        return None;
    }
    let r = axis::snap1d(agents, anchors, threshold, 0.0);
    r.distance.is_finite().then_some(r)
}

// ── Resize (SNAP-10) ─────────────────────────────────────────────────

/// The moving edge values of a resize target, per axis (`None` = the
/// axis has no moving edge). The interpreter derives them from the
/// dragged handle direction — the anchored side never appears here.
pub type MovingEdges = (Option<f32>, Option<f32>);

/// A fired resize snap (`SNAP-10`): per axis, the signed correction
/// on the moving edge and the aligned offset it landed on (the rule
/// chrome's position).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ResizeSnap {
    pub dx: f32,
    pub dy: f32,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

/// Resize snap: each moving edge, as a scalar, against the anchors'
/// per-axis three offsets (min / center / max) and the guides on that
/// axis — translate's candidate set reduced to scalars (`SNAP-10`;
/// the svg-editor's `snap_resize`). The anchored side contributes
/// nothing and an axis with no moving edge is never corrected. Space
/// snap does not run on resize.
pub fn resize(
    session: &Session,
    config: &Config,
    disabled: bool,
    edges: MovingEdges,
    zoom: f32,
) -> Option<ResizeSnap> {
    if !config.geometry || disabled {
        return None;
    }
    let t = threshold(zoom);
    let axis_snap = |axis: Axis, edge: Option<f32>| -> Option<(f32, f32)> {
        let e = edge?;
        let mut candidates: Vec<f32> = session
            .anchors
            .iter()
            .flat_map(|r| {
                let rg = range::from_rectangle(r, axis);
                [rg[0], (rg[0] + rg[1]) * 0.5, rg[1]]
            })
            .collect();
        candidates.extend(
            session
                .guides
                .iter()
                .filter(|g| g.axis == axis)
                .map(|g| g.offset),
        );
        let r = snap1d_opt(&[e], &candidates, t)?;
        Some((r.distance, e + r.distance))
    };
    let x = axis_snap(Axis::X, edges.0);
    let y = axis_snap(Axis::Y, edges.1);
    if x.is_none() && y.is_none() {
        return None;
    }
    Some(ResizeSnap {
        dx: x.map_or(0.0, |(d, _)| d),
        dy: y.map_or(0.0, |(d, _)| d),
        x: x.map(|(_, at)| at),
        y: y.map(|(_, at)| at),
    })
}

// ── Guide drag (ruler.md, RUL-6) ─────────────────────────────────────

/// The anchor offsets a dragged guide snaps to (`RUL-6`): the
/// per-axis three offsets (min / center / max) of each content bound,
/// lattice-quantized like every session anchor. Frozen at gesture
/// open (`SNAP-7` discipline), same as a content session.
pub fn guide_anchor_offsets(axis: Axis, anchors: &[Rectangle]) -> Vec<f32> {
    let mut out = Vec::with_capacity(anchors.len() * 3);
    for r in anchors {
        let r = rect::quantize(*r, QUANTUM);
        let rg = range::from_rectangle(&r, axis);
        out.extend([rg[0], (rg[0] + rg[1]) * 0.5, rg[1]]);
    }
    out
}

/// Correct a dragged guide's offset (`RUL-6`): geometry snap to the
/// frozen anchor offsets — honoring the geometry toggle and the live
/// disable modifier (`SNAP-3`) — then the **unconditional** lattice
/// quantize: a committed guide offset is an integer regardless of the
/// pixel-grid snap toggle (guides are integer by construction; web
/// parity, except the web also skips the disable modifier here — an
/// inconsistency ruler.md declines to adopt).
pub fn guide_offset(
    offset: f32,
    anchor_offsets: &[f32],
    config: &Config,
    disabled: bool,
    zoom: f32,
) -> f32 {
    let mut v = offset;
    if config.geometry
        && !disabled
        && let Some(r) = snap1d_opt(&[v], anchor_offsets, threshold(zoom))
    {
        v += r.distance;
    }
    v.round()
}

/// Rules-only chrome for a resize snap (snap.md "The chrome"): a
/// full-length hairline at each aligned offset — the moving edge is a
/// scalar, and a rule is its honest witness.
pub fn resize_chrome(snap: &ResizeSnap) -> Vec<HudPrim> {
    let mut prims = Vec::new();
    if let Some(at) = snap.x {
        prims.push(HudPrim::Rule {
            axis: Axis::X,
            offset: at,
            role: Role::Snap,
        });
    }
    if let Some(at) = snap.y {
        prims.push(HudPrim::Rule {
            axis: Axis::Y,
            offset: at,
            role: Role::Snap,
        });
    }
    prims
}

// ── Chrome ───────────────────────────────────────────────────────────

/// Convert a fired content snap into decorative chrome (`SNAP-8`):
/// the `guide.plot` rules — a crosshair marker on every exact hit
/// point, a hairline through each set of two-or-more co-aligned points, a
/// full-length rule for each guide hit, and labelled gap lines for
/// each space hit (the new equal gap, plus the pair gap it extends).
/// Canvas-space geometry; no primitive here can register a hit
/// region.
pub fn chrome(session: &Session, geo: &GeometrySnap) -> Vec<HudPrim> {
    let mut prims = Vec::new();
    let agent9 = rect::to_9points_chunk(&geo.agent);

    for (axis, hit) in [(Axis::X, &geo.x), (Axis::Y, &geo.y)] {
        let Some(hit) = hit else { continue };
        // The exact aligned points: the agent's own hits (post
        // correction) plus the anchor points they landed on.
        let mut points: Vec<[f32; 2]> = hit.agent_points.iter().map(|&i| agent9[i]).collect();
        points.extend(
            hit.anchor_points
                .iter()
                .map(|&(a, p)| rect::to_9points_chunk(&session.anchors[a])[p]),
        );
        for p in &points {
            prims.push(HudPrim::Point {
                anchor: *p,
                role: Role::Snap,
            });
        }
        // Hairlines through co-aligned positions: group by the
        // snapped axis value, span the counter-axis extent. Sorted so
        // the chrome is a pure function of its inputs.
        let (main, cnt): (Vec<f32>, Vec<f32>) = points
            .iter()
            .map(|p| (on(axis, p), on(counter(axis), p)))
            .unzip();
        let mut order: Vec<usize> = (0..points.len()).collect();
        order.sort_by(|&a, &b| (main[a], cnt[a]).partial_cmp(&(main[b], cnt[b])).unwrap());
        let mut i = 0;
        while i < order.len() {
            let mut j = i + 1;
            while j < order.len() && main[order[j]] == main[order[i]] {
                j += 1;
            }
            if j - i > 1 {
                let at = main[order[i]];
                let (lo, hi) = (cnt[order[i]], cnt[order[j - 1]]);
                prims.push(HudPrim::Line {
                    a: oriented(axis, at, lo),
                    b: oriented(axis, at, hi),
                    dashed: false,
                    role: Role::Snap,
                });
            }
            i = j;
        }
        for &g in &hit.guides {
            let guide = session.guides[g];
            prims.push(HudPrim::Rule {
                axis: guide.axis,
                offset: guide.offset,
                role: Role::Snap,
            });
        }
        // Space hits: a labelled line over the new equal gap, riding
        // the source anchor's counter-axis mid; when the candidate
        // extends an existing pair, a labelled line over that pair's
        // gap too — the labels are the shared spacing value.
        for sh in &hit.spacing {
            let mid = range_mid(range::from_rectangle(
                &session.anchors[sh.anchor],
                counter(axis),
            ));
            gap_line(&mut prims, axis, sh.line[0], sh.line[1], mid);
            if let Some((pair, gap)) = sh.pair {
                let first = &session.anchors[pair[0]];
                let second = &session.anchors[pair[1]];
                let pair_mid = (range_mid(range::from_rectangle(first, counter(axis)))
                    + range_mid(range::from_rectangle(second, counter(axis))))
                    * 0.5;
                let from = range::from_rectangle(first, axis)[1];
                gap_line(&mut prims, axis, from, from + gap, pair_mid);
            }
        }
    }
    prims
}

/// A main/counter scalar pair as a canvas point.
fn oriented(axis: Axis, main: f32, cnt: f32) -> [f32; 2] {
    match axis {
        Axis::X => [main, cnt],
        Axis::Y => [cnt, main],
    }
}

fn range_mid(r: range::Range) -> f32 {
    (r[0] + r[1]) * 0.5
}

/// A labelled gap line: solid segment from `from` to `to` on `axis`
/// at counter-axis position `mid`, with the gap value pilled at its
/// midpoint.
fn gap_line(prims: &mut Vec<HudPrim>, axis: Axis, from: f32, to: f32, mid: f32) {
    let a = oriented(axis, from, mid);
    let b = oriented(axis, to, mid);
    prims.push(HudPrim::Line {
        a,
        b,
        dashed: false,
        role: Role::Snap,
    });
    prims.push(HudPrim::Pill {
        anchor: [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5],
        text: crate::hud::label_number((to - from).abs()),
        role: Role::Snap,
    });
}
