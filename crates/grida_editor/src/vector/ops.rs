//! Pure vector-network editing operations (`vector-edit.md`).
//!
//! Every function here is a value-level operation on the engine's
//! [`VectorNetwork`] — no editor, no document, no gesture state. The
//! semantics port the production vector-network editor's; the numbered
//! contracts whose math lives here are `VEC-6` (shape-preserving
//! split), `VEC-9` (vertex delete removes incident segments, bridges
//! nothing), and `VEC-10` (tangent mirroring exactness), plus the
//! bounds-refit and exit-normalization (`optimize`) recipes.
//!
//! Region upkeep: the mode never authors regions (they are derived,
//! never authored — spec), but a vector node may arrive carrying them,
//! so every topology operation keeps region loops consistent: segment
//! indices are remapped, loops that reference a removed segment are
//! dropped, and regions left with no loops are dropped. Region paints
//! ride along untouched.

use grida::vectornetwork::{
    VectorNetwork, VectorNetworkLoop, VectorNetworkRegion, VectorNetworkSegment,
};
use math2::CubicBezierWithTangents;

use super::SegEnd;

/// Collinearity epsilon for [`infer_mirroring`]: the normalized cross
/// product below which two opposite tangents count as one straight
/// line through the vertex.
pub const MIRRORING_ANGLE_EPSILON: f32 = 1e-3;

fn v2(p: (f32, f32)) -> [f32; 2] {
    [p.0, p.1]
}

fn t2(p: [f32; 2]) -> (f32, f32) {
    (p[0], p[1])
}

/// The network's tight bounds in the node's local space — the union of
/// its segments' cubic bounding boxes (falling back to the vertex hull
/// when the network has no segments). `None` for an empty network. This
/// matches the engine's `path.compute_tight_bounds()` (both tight), so
/// it is the box a paint fills — the size gradients/images map into.
pub fn network_bounds(net: &VectorNetwork) -> Option<math2::Rectangle> {
    let mut min = [f32::INFINITY; 2];
    let mut max = [f32::NEG_INFINITY; 2];
    let mut fold = |p: [f32; 2]| {
        min[0] = min[0].min(p[0]);
        min[1] = min[1].min(p[1]);
        max[0] = max[0].max(p[0]);
        max[1] = max[1].max(p[1]);
    };
    if net.segments.is_empty() {
        for v in &net.vertices {
            fold(v2(*v));
        }
    } else {
        for i in 0..net.segments.len() {
            if let Some(c) = segment_cubic(net, i) {
                let bb = math2::bezier::get_bbox(&c);
                fold([bb.x, bb.y]);
                fold([bb.x + bb.width, bb.y + bb.height]);
            }
        }
    }
    min[0].is_finite().then_some(math2::Rectangle {
        x: min[0],
        y: min[1],
        width: max[0] - min[0],
        height: max[1] - min[1],
    })
}

/// The segment as a cubic in the node's local space (`None` when the
/// index or its vertex references are out of bounds).
pub fn segment_cubic(net: &VectorNetwork, index: usize) -> Option<CubicBezierWithTangents> {
    let seg = net.segments.get(index)?;
    let a = *net.vertices.get(seg.a)?;
    let b = *net.vertices.get(seg.b)?;
    Some(CubicBezierWithTangents {
        a: v2(a),
        b: v2(b),
        ta: v2(seg.ta),
        tb: v2(seg.tb),
    })
}

/// Indices of the segments incident to `vertex`.
pub fn segments_at(net: &VectorNetwork, vertex: usize) -> Vec<usize> {
    net.segments
        .iter()
        .enumerate()
        .filter(|(_, s)| s.a == vertex || s.b == vertex)
        .map(|(i, _)| i)
        .collect()
}

/// Number of segments incident to `vertex`.
pub fn vertex_degree(net: &VectorNetwork, vertex: usize) -> usize {
    net.segments
        .iter()
        .filter(|s| s.a == vertex || s.b == vertex)
        .count()
}

/// Add a vertex at `p`, deduplicating by exact position match, and
/// return its index.
pub fn add_vertex(net: &mut VectorNetwork, p: (f32, f32)) -> usize {
    if let Some(existing) = net.vertices.iter().position(|v| *v == p) {
        return existing;
    }
    net.vertices.push(p);
    net.vertices.len() - 1
}

/// Add a segment `a → b` with the given endpoint-relative tangents and
/// return its index.
pub fn add_segment(
    net: &mut VectorNetwork,
    a: usize,
    b: usize,
    ta: (f32, f32),
    tb: (f32, f32),
) -> usize {
    net.segments.push(VectorNetworkSegment { a, b, ta, tb });
    net.segments.len() - 1
}

/// Remove the listed segments (indices into the current segment list),
/// remapping region loops and dropping the ones that referenced a
/// removed segment.
pub fn remove_segments(net: &mut VectorNetwork, removed: &[usize]) {
    if removed.is_empty() {
        return;
    }
    let len = net.segments.len();
    let mut keep = vec![true; len];
    for &i in removed {
        if i < len {
            keep[i] = false;
        }
    }
    // old index → new index for kept segments.
    let mut map: Vec<Option<usize>> = Vec::with_capacity(len);
    let mut next = 0usize;
    for &k in &keep {
        map.push(if k { Some(next) } else { None });
        if k {
            next += 1;
        }
    }
    let mut idx = 0usize;
    net.segments.retain(|_| {
        let k = keep[idx];
        idx += 1;
        k
    });
    remap_regions(net, |old| map.get(old).copied().flatten().map(|i| vec![i]));
}

/// Delete a vertex: the vertex, **every** incident segment (`VEC-9` —
/// incident segments are removed, never bridged), and the index shift
/// on segments above it.
pub fn delete_vertex(net: &mut VectorNetwork, vertex: usize) {
    if vertex >= net.vertices.len() {
        return;
    }
    let incident = segments_at(net, vertex);
    remove_segments(net, &incident);
    net.vertices.remove(vertex);
    for seg in &mut net.segments {
        if seg.a > vertex {
            seg.a -= 1;
        }
        if seg.b > vertex {
            seg.b -= 1;
        }
    }
}

/// Delete a single segment, keeping its vertices (orphans are cleaned
/// at exit by [`optimize`]).
pub fn delete_segment(net: &mut VectorNetwork, segment: usize) {
    remove_segments(net, &[segment]);
}

/// Split a segment at parametric `t`, returning the new vertex's
/// index. Shape-preserving (`VEC-6`): curves subdivide by de Casteljau;
/// a straight segment (both tangents zero) splits into two straight
/// segments — zero tangents stay zero, no phantom handles. The two
/// halves take the split segment's index and the one after it; region
/// loops are remapped accordingly.
pub fn split_segment(net: &mut VectorNetwork, segment: usize, t: f32) -> Option<usize> {
    let cubic = segment_cubic(net, segment)?;
    let seg = net.segments[segment].clone();
    let t = t.clamp(0.0, 1.0);

    let straight = seg.ta == (0.0, 0.0) && seg.tb == (0.0, 0.0);
    let (split_point, left_tangents, right_tangents) = if straight {
        let p = (
            cubic.a[0] + (cubic.b[0] - cubic.a[0]) * t,
            cubic.a[1] + (cubic.b[1] - cubic.a[1]) * t,
        );
        (p, ((0.0, 0.0), (0.0, 0.0)), ((0.0, 0.0), (0.0, 0.0)))
    } else {
        let (left, right) = math2::bezier::subdivide(&cubic, t);
        (
            t2(left.b),
            (t2(left.ta), t2(left.tb)),
            (t2(right.ta), t2(right.tb)),
        )
    };

    net.vertices.push(split_point);
    let vertex = net.vertices.len() - 1;

    net.segments[segment] = VectorNetworkSegment {
        a: seg.a,
        b: vertex,
        ta: left_tangents.0,
        tb: left_tangents.1,
    };
    net.segments.insert(
        segment + 1,
        VectorNetworkSegment {
            a: vertex,
            b: seg.b,
            ta: right_tangents.0,
            tb: right_tangents.1,
        },
    );

    // Region loops: indices above the split shift by one; the split
    // segment itself becomes its two halves, kept adjacent so the
    // loop's chain stays contiguous in either traversal direction.
    remap_regions(net, |old| {
        Some(match old.cmp(&segment) {
            std::cmp::Ordering::Less => vec![old],
            std::cmp::Ordering::Equal => vec![segment, segment + 1],
            std::cmp::Ordering::Greater => vec![old + 1],
        })
    });

    Some(vertex)
}

/// Tangent mirroring mode for [`update_tangent`] (`VEC-10`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Mirroring {
    /// Infer from the geometry at gesture start: collinear opposite
    /// tangents move as smooth ([`Mirroring::All`] when lengths match,
    /// [`Mirroring::Angle`] otherwise), anything else independent.
    #[default]
    Auto,
    /// Mirror angle and length: the opposite tangent is the exact
    /// negation.
    All,
    /// Mirror angle only; the opposite tangent keeps its length.
    Angle,
    /// Independent: the opposite tangent is untouched.
    None,
}

/// Resolve [`Mirroring::Auto`] from the two tangents meeting at a
/// vertex: smooth iff both are non-zero, collinear (normalized cross
/// within [`MIRRORING_ANGLE_EPSILON`]), and opposite in direction —
/// `All` when their lengths match exactly, `Angle` otherwise.
pub fn infer_mirroring(current: (f32, f32), other: (f32, f32)) -> Mirroring {
    if current == (0.0, 0.0) || other == (0.0, 0.0) {
        return Mirroring::None;
    }
    let (ax, ay) = current;
    let (bx, by) = other;
    let la = ax.hypot(ay);
    let lb = bx.hypot(by);
    let cross = ax * by - ay * bx;
    if (cross / (la * lb)).abs() > MIRRORING_ANGLE_EPSILON {
        return Mirroring::None;
    }
    if ax * bx + ay * by >= 0.0 {
        return Mirroring::None;
    }
    if (la - lb).abs() < f32::EPSILON {
        Mirroring::All
    } else {
        Mirroring::Angle
    }
}

/// Set one tangent, mirroring into the opposite tangent at the shared
/// vertex per `mirroring` (`VEC-10`). Mirroring applies only when
/// exactly one *other* segment meets the vertex — at junctions
/// (degree > 2) and open ends every mode degrades to independent.
/// `Auto` resolves from the geometry *before* the update.
pub fn update_tangent(
    net: &mut VectorNetwork,
    segment: usize,
    end: SegEnd,
    value: (f32, f32),
    mirroring: Mirroring,
) {
    if segment >= net.segments.len() {
        return;
    }
    let vertex = match end {
        SegEnd::A => net.segments[segment].a,
        SegEnd::B => net.segments[segment].b,
    };

    // The single other segment at this vertex, if there is exactly one.
    let connected: Vec<usize> = segments_at(net, vertex)
        .into_iter()
        .filter(|&i| i != segment)
        .collect();
    let connection = match connected.as_slice() {
        [single] => {
            let other = &net.segments[*single];
            let other_end = if other.a == vertex {
                SegEnd::A
            } else {
                SegEnd::B
            };
            Some((*single, other_end))
        }
        _ => None,
    };

    let effective = match (mirroring, &connection) {
        (Mirroring::Auto, Some((other_index, other_end))) => {
            let current = match end {
                SegEnd::A => net.segments[segment].ta,
                SegEnd::B => net.segments[segment].tb,
            };
            let other = match other_end {
                SegEnd::A => net.segments[*other_index].ta,
                SegEnd::B => net.segments[*other_index].tb,
            };
            infer_mirroring(current, other)
        }
        (Mirroring::Auto, None) => Mirroring::None,
        (explicit, _) => explicit,
    };

    match end {
        SegEnd::A => net.segments[segment].ta = value,
        SegEnd::B => net.segments[segment].tb = value,
    }

    let Some((other_index, other_end)) = connection else {
        return;
    };
    let mirrored = match effective {
        Mirroring::None | Mirroring::Auto => return,
        Mirroring::All => (-value.0, -value.1),
        Mirroring::Angle => {
            let existing = match other_end {
                SegEnd::A => net.segments[other_index].ta,
                SegEnd::B => net.segments[other_index].tb,
            };
            let len = existing.0.hypot(existing.1);
            let angle = value.1.atan2(value.0) + std::f32::consts::PI;
            (angle.cos() * len, angle.sin() * len)
        }
    };
    match other_end {
        SegEnd::A => net.segments[other_index].ta = mirrored,
        SegEnd::B => net.segments[other_index].tb = mirrored,
    }
}

/// The pen's smooth-continuation tangent for adopting `vertex` as the
/// origin (`VEC-7`): the negation of the open end's tangent when the
/// vertex has degree exactly 1, zero otherwise (isolated vertices and
/// junctions start flat).
pub fn next_mirrored_tangent(net: &VectorNetwork, vertex: usize) -> (f32, f32) {
    let incident = segments_at(net, vertex);
    let [single] = incident.as_slice() else {
        return (0.0, 0.0);
    };
    let seg = &net.segments[*single];
    if seg.b == vertex {
        (-seg.tb.0, -seg.tb.1)
    } else {
        (-seg.ta.0, -seg.ta.1)
    }
}

/// A segment's state frozen at gesture start (endpoint positions and
/// tangents). Bending solves against the frozen curve so the gesture
/// stays stable under its own previews.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FrozenSegment {
    pub a: (f32, f32),
    pub b: (f32, f32),
    pub ta: (f32, f32),
    pub tb: (f32, f32),
}

/// Freeze a segment for a bend gesture.
pub fn freeze_segment(net: &VectorNetwork, segment: usize) -> Option<FrozenSegment> {
    let seg = net.segments.get(segment)?;
    Some(FrozenSegment {
        a: *net.vertices.get(seg.a)?,
        b: *net.vertices.get(seg.b)?,
        ta: seg.ta,
        tb: seg.tb,
    })
}

/// Bend a segment through `target` at parametric `grab_t`: solve the
/// tangent pair that makes the *frozen* curve pass through the target
/// (offset-corrected if the segment's start vertex moved since the
/// freeze) and write it to the live segment.
pub fn bend_segment(
    net: &mut VectorNetwork,
    segment: usize,
    grab_t: f32,
    target: (f32, f32),
    frozen: &FrozenSegment,
) {
    let Some(seg) = net.segments.get(segment) else {
        return;
    };
    let Some(current_a) = net.vertices.get(seg.a).copied() else {
        return;
    };
    let offset = (current_a.0 - frozen.a.0, current_a.1 - frozen.a.1);
    let adjusted = [target.0 - offset.0, target.1 - offset.1];
    let cubic = CubicBezierWithTangents {
        a: v2(frozen.a),
        b: v2(frozen.b),
        ta: v2(frozen.ta),
        tb: v2(frozen.tb),
    };
    let (ta, tb) = math2::bezier::solve_tangents_for_point(&cubic, grab_t, adjusted);
    let seg = &mut net.segments[segment];
    seg.ta = t2(ta);
    seg.tb = t2(tb);
}

/// Translate the listed vertices by `delta`. Tangents are
/// endpoint-relative and ride along untouched.
pub fn translate_vertices(net: &mut VectorNetwork, vertices: &[usize], delta: (f32, f32)) {
    for &i in vertices {
        if let Some(v) = net.vertices.get_mut(i) {
            v.0 += delta.0;
            v.1 += delta.1;
        }
    }
}

/// Translate the whole network by `delta`.
pub fn translate(net: &mut VectorNetwork, delta: (f32, f32)) {
    for v in &mut net.vertices {
        v.0 += delta.0;
        v.1 += delta.1;
    }
}

/// Apply an affine transform to the whole network: vertices through the
/// full transform, segment tangents through its **linear part** only
/// (tangents are endpoint-relative directions, so a translation must not
/// touch them). Used to bake a member's own transform into its network
/// when flattening a multi-node selection into one vector (`FLAT-1`).
pub fn apply_affine(net: &mut VectorNetwork, t: &math2::transform::AffineTransform) {
    let m = t.matrix;
    for v in &mut net.vertices {
        let (x, y) = *v;
        *v = (
            m[0][0] * x + m[0][1] * y + m[0][2],
            m[1][0] * x + m[1][1] * y + m[1][2],
        );
    }
    let lin = |(dx, dy): (f32, f32)| (m[0][0] * dx + m[0][1] * dy, m[1][0] * dx + m[1][1] * dy);
    for s in &mut net.segments {
        s.ta = lin(s.ta);
        s.tb = lin(s.tb);
    }
}

/// Append `src` into `dst`, offsetting `src`'s vertex, segment, and
/// region-loop indices so the two networks combine into one without
/// collision — the structural combine flatten uses to bake a partition's
/// shapes into a single vector node (`FLAT-1`).
pub fn append(dst: &mut VectorNetwork, src: &VectorNetwork) {
    let v_off = dst.vertices.len();
    let s_off = dst.segments.len();
    dst.vertices.extend(src.vertices.iter().copied());
    for s in &src.segments {
        dst.segments.push(VectorNetworkSegment {
            a: s.a + v_off,
            b: s.b + v_off,
            ta: s.ta,
            tb: s.tb,
        });
    }
    for r in &src.regions {
        dst.regions.push(VectorNetworkRegion {
            loops: r
                .loops
                .iter()
                .map(|l| VectorNetworkLoop(l.0.iter().map(|i| i + s_off).collect()))
                .collect(),
            fill_rule: r.fill_rule,
            fills: r.fills.clone(),
        });
    }
}

/// Re-anchor the network so its tight bounds sit at the local origin,
/// returning the local delta the geometry moved by — the caller
/// compensates the node's position by the same delta (rotated into the
/// parent frame when the node carries rotation) so the geometry's
/// world position never shifts (`VEC-3`).
pub fn refit(net: &mut VectorNetwork) -> (f32, f32) {
    if net.vertices.is_empty() {
        return (0.0, 0.0);
    }
    let bounds = net.bounds();
    translate(net, (-bounds.x, -bounds.y));
    (bounds.x, bounds.y)
}

/// Exit normalization (`vector-edit.md` lifecycle): deduplicate
/// vertices (exact match by default; `vertex_tolerance` widens it),
/// deduplicate identical segments, drop zero-tangent self-loops, drop
/// vertices no segment references, and keep region loops consistent
/// through it all. Returns the normalized network.
///
/// Unlike the production editor's normalizer (which discards regions),
/// region topology survives: loops remap onto the deduplicated
/// segments and only drop when a member segment was dropped.
pub fn optimize(net: &VectorNetwork, vertex_tolerance: f32) -> VectorNetwork {
    // 1. Deduplicate vertices.
    let mut vertices: Vec<(f32, f32)> = Vec::with_capacity(net.vertices.len());
    let mut vertex_map: Vec<usize> = Vec::with_capacity(net.vertices.len());
    for p in &net.vertices {
        let existing = vertices.iter().position(|v| {
            (v.0 - p.0).abs() <= vertex_tolerance && (v.1 - p.1).abs() <= vertex_tolerance
        });
        vertex_map.push(match existing {
            Some(i) => i,
            None => {
                vertices.push(*p);
                vertices.len() - 1
            }
        });
    }

    // 2. Remap, deduplicate (exact match), and filter segments,
    //    tracking old → new for the region loops.
    let mut segments: Vec<VectorNetworkSegment> = Vec::with_capacity(net.segments.len());
    let mut segment_map: Vec<Option<usize>> = Vec::with_capacity(net.segments.len());
    for seg in &net.segments {
        let remapped = VectorNetworkSegment {
            a: vertex_map[seg.a],
            b: vertex_map[seg.b],
            ta: seg.ta,
            tb: seg.tb,
        };
        // Zero-tangent self-loop: dropped.
        if remapped.a == remapped.b && remapped.ta == (0.0, 0.0) && remapped.tb == (0.0, 0.0) {
            segment_map.push(None);
            continue;
        }
        segment_map.push(Some(match segments.iter().position(|s| *s == remapped) {
            Some(i) => i,
            None => {
                segments.push(remapped);
                segments.len() - 1
            }
        }));
    }

    // 3. Drop unused vertices.
    let mut used = vec![false; vertices.len()];
    for seg in &segments {
        used[seg.a] = true;
        used[seg.b] = true;
    }
    let mut final_vertices: Vec<(f32, f32)> = Vec::with_capacity(vertices.len());
    let mut final_vertex_map: Vec<usize> = vec![0; vertices.len()];
    for (i, v) in vertices.iter().enumerate() {
        if used[i] {
            final_vertex_map[i] = final_vertices.len();
            final_vertices.push(*v);
        }
    }
    for seg in &mut segments {
        seg.a = final_vertex_map[seg.a];
        seg.b = final_vertex_map[seg.b];
    }

    // 4. Regions ride the segment map.
    let mut out = VectorNetwork {
        vertices: final_vertices,
        segments,
        regions: net.regions.clone(),
    };
    remap_regions(&mut out, |old| {
        segment_map.get(old).copied().flatten().map(|i| vec![i])
    });
    out
}

/// Structural network equality: vertices, segments (tangents
/// included), and region topology (loop indices + fill rule). Region
/// *paints* are excluded — the mode never edits them (the same bound
/// as the document's structural signature).
pub fn network_eq(a: &VectorNetwork, b: &VectorNetwork) -> bool {
    a.vertices == b.vertices
        && a.segments == b.segments
        && a.regions.len() == b.regions.len()
        && a.regions.iter().zip(&b.regions).all(|(ra, rb)| {
            ra.fill_rule == rb.fill_rule
                && ra.loops.len() == rb.loops.len()
                && ra.loops.iter().zip(&rb.loops).all(|(la, lb)| la.0 == lb.0)
        })
}

/// Rewrite every region loop through `map` (old segment index → the
/// replacement index sequence, or `None` when the segment is gone).
/// Loops that reference a gone segment drop; regions left with no
/// loops drop.
fn remap_regions(net: &mut VectorNetwork, map: impl Fn(usize) -> Option<Vec<usize>>) {
    if net.regions.is_empty() {
        return;
    }
    let regions = std::mem::take(&mut net.regions);
    net.regions = regions
        .into_iter()
        .filter_map(|region| {
            let loops: Vec<VectorNetworkLoop> = region
                .loops
                .into_iter()
                .filter_map(|l| {
                    l.0.into_iter()
                        .map(&map)
                        .collect::<Option<Vec<Vec<usize>>>>()
                        .map(|expanded| VectorNetworkLoop(expanded.into_iter().flatten().collect()))
                })
                .collect();
            if loops.is_empty() {
                None
            } else {
                Some(VectorNetworkRegion {
                    loops,
                    fill_rule: region.fill_rule,
                    fills: region.fills,
                })
            }
        })
        .collect();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn net_open_chain() -> VectorNetwork {
        // 0 —— 1 —— 2, straight.
        VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0)],
            segments: vec![
                VectorNetworkSegment::ab(0, 1),
                VectorNetworkSegment::ab(1, 2),
            ],
            regions: Vec::new(),
        }
    }

    fn sample(net: &VectorNetwork, segment: usize, t: f32) -> [f32; 2] {
        math2::bezier::evaluate(&segment_cubic(net, segment).unwrap(), t)
    }

    fn close(p: [f32; 2], q: [f32; 2], eps: f32) -> bool {
        (p[0] - q[0]).abs() <= eps && (p[1] - q[1]).abs() <= eps
    }

    // -- VEC-6 ---------------------------------------------------------------

    #[test]
    fn vec_6_split_straight_yields_two_straights() {
        let mut net = net_open_chain();
        let v = split_segment(&mut net, 0, 0.25).unwrap();
        assert_eq!(net.vertices[v], (25.0, 0.0));
        assert_eq!(net.segments.len(), 3);
        assert_eq!(net.segments[0].ta, (0.0, 0.0));
        assert_eq!(net.segments[0].tb, (0.0, 0.0));
        assert_eq!(net.segments[1].ta, (0.0, 0.0));
        assert_eq!(net.segments[1].tb, (0.0, 0.0));
        assert_eq!((net.segments[0].a, net.segments[0].b), (0, v));
        assert_eq!((net.segments[1].a, net.segments[1].b), (v, 1));
    }

    #[test]
    fn vec_6_split_curve_preserves_shape() {
        let mut net = net_open_chain();
        net.segments[0].ta = (20.0, 40.0);
        net.segments[0].tb = (-20.0, 40.0);
        let before: Vec<[f32; 2]> = (0..=16).map(|i| sample(&net, 0, i as f32 / 16.0)).collect();

        let t = 0.4;
        split_segment(&mut net, 0, t).unwrap();

        for (i, expected) in before.iter().enumerate() {
            let u = i as f32 / 16.0;
            let actual = if u <= t {
                sample(&net, 0, u / t)
            } else {
                sample(&net, 1, (u - t) / (1.0 - t))
            };
            assert!(close(*expected, actual, 1e-2), "u={u}");
        }
    }

    #[test]
    fn split_remaps_region_loops() {
        let mut net = VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0), (50.0, 80.0)],
            segments: vec![
                VectorNetworkSegment::ab(0, 1),
                VectorNetworkSegment::ab(1, 2),
                VectorNetworkSegment::ab(2, 0),
            ],
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2])],
                fill_rule: grida::cg::prelude::FillRule::EvenOdd,
                fills: None,
            }],
        };
        split_segment(&mut net, 1, 0.5).unwrap();
        assert_eq!(net.regions[0].loops[0].0, vec![0, 1, 2, 3]);
    }

    // -- VEC-9 ---------------------------------------------------------------

    #[test]
    fn vec_9_delete_vertex_removes_incident_bridges_nothing() {
        // A degree-3 junction: vertex 0 joined to 1, 2, 3; plus one
        // segment 1—2 that must survive with reindexed endpoints.
        let mut net = VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0), (0.0, 100.0), (-100.0, 0.0)],
            segments: vec![
                VectorNetworkSegment::ab(0, 1),
                VectorNetworkSegment::ab(0, 2),
                VectorNetworkSegment::ab(3, 0),
                VectorNetworkSegment::ab(1, 2),
            ],
            regions: Vec::new(),
        };
        assert_eq!(vertex_degree(&net, 0), 3);

        delete_vertex(&mut net, 0);

        // Exactly the 3 incident segments removed, nothing bridged.
        assert_eq!(net.segments.len(), 1);
        assert_eq!(net.vertices.len(), 3);
        // The survivor 1—2 reindexed to 0—1.
        assert_eq!((net.segments[0].a, net.segments[0].b), (0, 1));
        assert_eq!(net.vertices[0], (100.0, 0.0));
        assert_eq!(net.vertices[1], (0.0, 100.0));
    }

    #[test]
    fn delete_segment_keeps_vertices() {
        let mut net = net_open_chain();
        delete_segment(&mut net, 0);
        assert_eq!(net.segments.len(), 1);
        assert_eq!(net.vertices.len(), 3);
    }

    // -- VEC-10 --------------------------------------------------------------

    /// Two segments meeting at vertex 1 with smooth (collinear,
    /// opposite) tangents there: seg0.tb and seg1.ta.
    fn net_smooth_join() -> VectorNetwork {
        VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0), (200.0, 0.0)],
            segments: vec![
                VectorNetworkSegment {
                    a: 0,
                    b: 1,
                    ta: (0.0, 0.0),
                    tb: (-10.0, -10.0),
                },
                VectorNetworkSegment {
                    a: 1,
                    b: 2,
                    ta: (10.0, 10.0),
                    tb: (0.0, 0.0),
                },
            ],
            regions: Vec::new(),
        }
    }

    #[test]
    fn vec_10_all_is_exact_negation() {
        let mut net = net_smooth_join();
        update_tangent(&mut net, 0, SegEnd::B, (5.0, 20.0), Mirroring::All);
        assert_eq!(net.segments[0].tb, (5.0, 20.0));
        assert_eq!(net.segments[1].ta, (-5.0, -20.0));
    }

    #[test]
    fn vec_10_angle_preserves_length() {
        let mut net = net_smooth_join();
        let before_len = {
            let t = net.segments[1].ta;
            t.0.hypot(t.1)
        };
        update_tangent(&mut net, 0, SegEnd::B, (30.0, 0.0), Mirroring::Angle);
        let after = net.segments[1].ta;
        assert!((after.0.hypot(after.1) - before_len).abs() < 1e-4);
        // Collinear with the set tangent, opposite direction.
        assert!(after.0 < 0.0);
        assert!(after.1.abs() < 1e-4);
    }

    #[test]
    fn vec_10_none_leaves_opposite_untouched() {
        let mut net = net_smooth_join();
        update_tangent(&mut net, 0, SegEnd::B, (5.0, 20.0), Mirroring::None);
        assert_eq!(net.segments[1].ta, (10.0, 10.0));
    }

    #[test]
    fn vec_10_auto_resolves_iff_collinear_at_start() {
        // Smooth join → auto mirrors (lengths equal → All).
        let mut net = net_smooth_join();
        update_tangent(&mut net, 0, SegEnd::B, (5.0, 20.0), Mirroring::Auto);
        assert_eq!(net.segments[1].ta, (-5.0, -20.0));

        // Corner join (non-collinear) → auto leaves it alone.
        let mut net = net_smooth_join();
        net.segments[1].ta = (10.0, -30.0);
        update_tangent(&mut net, 0, SegEnd::B, (5.0, 20.0), Mirroring::Auto);
        assert_eq!(net.segments[1].ta, (10.0, -30.0));
    }

    #[test]
    fn mirroring_degrades_at_junctions() {
        // Degree-3 vertex: even explicit All has no single opposite.
        let mut net = net_smooth_join();
        net.vertices.push((100.0, 100.0));
        net.segments.push(VectorNetworkSegment::ab(1, 3));
        update_tangent(&mut net, 0, SegEnd::B, (5.0, 20.0), Mirroring::All);
        assert_eq!(net.segments[0].tb, (5.0, 20.0));
        assert_eq!(net.segments[1].ta, (10.0, 10.0), "untouched at junction");
    }

    // -- VEC-7's mirror source -------------------------------------------------

    #[test]
    fn next_mirrored_tangent_open_end_only() {
        let mut net = net_open_chain();
        net.segments[1].tb = (7.0, -3.0);
        // Vertex 2 is the open end of segment 1 (its `b`).
        assert_eq!(next_mirrored_tangent(&net, 2), (-7.0, 3.0));
        // Vertex 1 has degree 2: flat.
        assert_eq!(next_mirrored_tangent(&net, 1), (0.0, 0.0));
        // Reversed incidence: open end at a segment's `a`.
        let net2 = VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0)],
            segments: vec![VectorNetworkSegment {
                a: 0,
                b: 1,
                ta: (4.0, 5.0),
                tb: (0.0, 0.0),
            }],
            regions: Vec::new(),
        };
        assert_eq!(next_mirrored_tangent(&net2, 0), (-4.0, -5.0));
    }

    // -- bend ------------------------------------------------------------------

    #[test]
    fn bend_passes_through_target() {
        let mut net = net_open_chain();
        let frozen = freeze_segment(&net, 0).unwrap();
        let target = (50.0, 40.0);
        bend_segment(&mut net, 0, 0.5, target, &frozen);
        let on_curve = sample(&net, 0, 0.5);
        assert!(close(on_curve, [target.0, target.1], 1e-2), "{on_curve:?}");
        // Endpoints unmoved: bending shapes tangents only.
        assert_eq!(net.vertices[0], (0.0, 0.0));
        assert_eq!(net.vertices[1], (100.0, 0.0));
    }

    // -- refit -----------------------------------------------------------------

    #[test]
    fn refit_anchors_bounds_at_origin() {
        let mut net = net_open_chain();
        translate(&mut net, (13.0, -7.0));
        let delta = refit(&mut net);
        assert_eq!(delta, (13.0, -7.0));
        let bounds = net.bounds();
        assert!(bounds.x.abs() < 1e-5 && bounds.y.abs() < 1e-5);
        assert_eq!(net.vertices[0], (0.0, 0.0));
    }

    #[test]
    fn refit_accounts_for_curve_extrema() {
        // A curve bulging left of its endpoints: the tight bounds
        // include the extremum, not just the vertices.
        let mut net = VectorNetwork {
            vertices: vec![(0.0, 0.0), (0.0, 100.0)],
            segments: vec![VectorNetworkSegment {
                a: 0,
                b: 1,
                ta: (-40.0, 30.0),
                tb: (-40.0, -30.0),
            }],
            regions: Vec::new(),
        };
        let delta = refit(&mut net);
        assert!(delta.0 < 0.0, "extremum is left of the endpoints");
        let bounds = net.bounds();
        assert!(bounds.x.abs() < 1e-3 && bounds.y.abs() < 1e-3);
    }

    // -- optimize ---------------------------------------------------------------

    #[test]
    fn optimize_dedupes_and_drops_unused() {
        let net = VectorNetwork {
            vertices: vec![
                (0.0, 0.0),
                (100.0, 0.0),
                (0.0, 0.0),   // duplicate of 0
                (55.0, 55.0), // unused
            ],
            segments: vec![
                VectorNetworkSegment::ab(0, 1),
                VectorNetworkSegment::ab(2, 1), // duplicate of 0—1 after dedupe
                VectorNetworkSegment::ab(2, 2), // zero-tangent self-loop
            ],
            regions: Vec::new(),
        };
        let out = optimize(&net, 0.0);
        assert_eq!(out.vertices, vec![(0.0, 0.0), (100.0, 0.0)]);
        assert_eq!(out.segments.len(), 1);
        assert_eq!((out.segments[0].a, out.segments[0].b), (0, 1));
    }

    #[test]
    fn optimize_is_idempotent_and_keeps_regions() {
        let net = VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0), (50.0, 80.0), (0.0, 0.0)],
            segments: vec![
                VectorNetworkSegment::ab(0, 1),
                VectorNetworkSegment::ab(1, 2),
                VectorNetworkSegment::ab(2, 3), // closes onto duplicate of 0
            ],
            regions: vec![VectorNetworkRegion {
                loops: vec![VectorNetworkLoop(vec![0, 1, 2])],
                fill_rule: grida::cg::prelude::FillRule::EvenOdd,
                fills: None,
            }],
        };
        let once = optimize(&net, 0.0);
        assert_eq!(once.vertices.len(), 3);
        assert_eq!(once.regions.len(), 1);
        assert_eq!(once.regions[0].loops[0].0, vec![0, 1, 2]);
        let twice = optimize(&once, 0.0);
        assert!(network_eq(&once, &twice));
    }

    #[test]
    fn network_eq_sees_tangents_and_regions() {
        let a = net_open_chain();
        let mut b = net_open_chain();
        assert!(network_eq(&a, &b));
        b.segments[0].ta = (1.0, 0.0);
        assert!(!network_eq(&a, &b));
    }
}
