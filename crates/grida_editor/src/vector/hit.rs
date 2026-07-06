//! Pure hit resolution for vector edit mode (`vector-edit.md` — chrome
//! and hover, the pen's snap priority).
//!
//! Everything here is a pure function over a network + a cursor in the
//! node's **local** space, with screen-space thresholds divided by the
//! camera zoom (zoom-invariant, `vector-edit.md` Snapping). No editor,
//! no state: the mode machine calls these per event and owns what the
//! answers mean.

use grida::vectornetwork::VectorNetwork;

use super::SegEnd;
use super::ops;

/// Vertex snap threshold, in screen pixels (web parity).
pub const VERTEX_SNAP_PX: f32 = 5.0;
/// Segment projection threshold, in screen pixels (web parity). Wider
/// than the vertex threshold; the vertex wins inside its own
/// (`VEC-8`).
pub const SEGMENT_SNAP_PX: f32 = 10.0;

/// A tangent handle address: `(segment, end)` — the network model's
/// truth (module docs on [`super::SegEnd`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct TangentRef {
    pub segment: usize,
    pub end: SegEnd,
}

impl TangentRef {
    /// The vertex this tangent leaves from.
    pub fn vertex(&self, net: &VectorNetwork) -> Option<usize> {
        let seg = net.segments.get(self.segment)?;
        Some(match self.end {
            SegEnd::A => seg.a,
            SegEnd::B => seg.b,
        })
    }

    /// The handle's position in local space (vertex + tangent).
    pub fn position(&self, net: &VectorNetwork) -> Option<(f32, f32)> {
        let seg = net.segments.get(self.segment)?;
        let (vertex, tangent) = match self.end {
            SegEnd::A => (seg.a, seg.ta),
            SegEnd::B => (seg.b, seg.tb),
        };
        let v = net.vertices.get(vertex)?;
        Some((v.0 + tangent.0, v.1 + tangent.1))
    }
}

/// One interactive control of the mode's chrome. At most one is
/// hovered (`VEC-12`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Control {
    Vertex(usize),
    Segment(usize),
    Tangent(TangentRef),
}

/// What a pen press resolves to, by snap priority (`VEC-8`):
/// vertex ≻ hovered-segment projection ≻ free point.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PenTarget {
    /// Within the vertex threshold of an existing vertex.
    Vertex(usize),
    /// Within the segment threshold of a segment body: the projected
    /// parametric point (the split candidate, `VEC-6`).
    Segment {
        segment: usize,
        t: f32,
        point: (f32, f32),
    },
    /// Free space: the (unsnapped) cursor itself.
    Free((f32, f32)),
}

fn dist_sq(a: (f32, f32), b: (f32, f32)) -> f32 {
    let dx = a.0 - b.0;
    let dy = a.1 - b.1;
    dx * dx + dy * dy
}

/// The nearest vertex within `threshold` local units, if any.
pub fn nearest_vertex(net: &VectorNetwork, cursor: (f32, f32), threshold: f32) -> Option<usize> {
    let t2 = threshold * threshold;
    net.vertices
        .iter()
        .enumerate()
        .map(|(i, v)| (i, dist_sq(*v, cursor)))
        .filter(|(_, d)| *d <= t2)
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(i, _)| i)
}

/// The nearest segment projection within `threshold` local units, if
/// any: `(segment, t, point)`.
pub fn nearest_segment(
    net: &VectorNetwork,
    cursor: (f32, f32),
    threshold: f32,
) -> Option<(usize, f32, (f32, f32))> {
    let t2 = threshold * threshold;
    let mut best: Option<(usize, f32, (f32, f32), f32)> = None;
    for index in 0..net.segments.len() {
        let Some(cubic) = ops::segment_cubic(net, index) else {
            continue;
        };
        let (t, d) = math2::bezier::project(&cubic, [cursor.0, cursor.1]);
        if d > t2 {
            continue;
        }
        if best.map(|(_, _, _, bd)| d < bd).unwrap_or(true) {
            let p = math2::bezier::evaluate(&cubic, t);
            best = Some((index, t, (p[0], p[1]), d));
        }
    }
    best.map(|(i, t, p, _)| (i, t, p))
}

/// Resolve the hovered control (`VEC-12`: exclusive; the vertex wins
/// over any segment; a visible tangent knob wins over both, since it
/// draws on top). `tangents` lists the knobs currently visible under
/// the neighbourhood rule — hidden knobs are not hittable.
pub fn hover(
    net: &VectorNetwork,
    tangents: &[TangentRef],
    cursor: (f32, f32),
    zoom: f32,
) -> Option<Control> {
    let vertex_threshold = VERTEX_SNAP_PX / zoom;
    let knob = tangents
        .iter()
        .filter_map(|t| t.position(net).map(|p| (*t, dist_sq(p, cursor))))
        .filter(|(_, d)| *d <= vertex_threshold * vertex_threshold)
        .min_by(|a, b| a.1.total_cmp(&b.1));
    if let Some((t, _)) = knob {
        return Some(Control::Tangent(t));
    }
    if let Some(v) = nearest_vertex(net, cursor, vertex_threshold) {
        return Some(Control::Vertex(v));
    }
    nearest_segment(net, cursor, SEGMENT_SNAP_PX / zoom).map(|(i, _, _)| Control::Segment(i))
}

/// Resolve a pen press (`VEC-8` snap priority).
pub fn pen_target(net: &VectorNetwork, cursor: (f32, f32), zoom: f32) -> PenTarget {
    if let Some(v) = nearest_vertex(net, cursor, VERTEX_SNAP_PX / zoom) {
        return PenTarget::Vertex(v);
    }
    if let Some((segment, t, point)) = nearest_segment(net, cursor, SEGMENT_SNAP_PX / zoom) {
        return PenTarget::Segment { segment, t, point };
    }
    PenTarget::Free(cursor)
}

/// Marquee sub-selection predicates (`vector-edit.md` Sub-selection):
/// vertices by point-in-rect, segments by curve containment — exact
/// via the tight bbox (curve ⊆ rect ⇔ tight bbox ⊆ rect for an
/// axis-aligned rect). Returns `(vertices, segments)`.
pub fn marquee(net: &VectorNetwork, rect: &math2::Rectangle) -> (Vec<usize>, Vec<usize>) {
    let vertices: Vec<usize> = net
        .vertices
        .iter()
        .enumerate()
        .filter(|(_, v)| {
            v.0 >= rect.x
                && v.0 <= rect.x + rect.width
                && v.1 >= rect.y
                && v.1 <= rect.y + rect.height
        })
        .map(|(i, _)| i)
        .collect();
    let segments: Vec<usize> = (0..net.segments.len())
        .filter(|&i| {
            ops::segment_cubic(net, i).is_some_and(|cubic| {
                let bb = math2::bezier::get_bbox(&cubic);
                bb.x >= rect.x
                    && bb.y >= rect.y
                    && bb.x + bb.width <= rect.x + rect.width
                    && bb.y + bb.height <= rect.y + rect.height
            })
        })
        .collect();
    (vertices, segments)
}

#[cfg(test)]
mod tests {
    use super::*;
    use grida::vectornetwork::VectorNetworkSegment;

    fn net() -> VectorNetwork {
        VectorNetwork {
            vertices: vec![(0.0, 0.0), (100.0, 0.0)],
            segments: vec![VectorNetworkSegment::ab(0, 1)],
            regions: Vec::new(),
        }
    }

    // -- VEC-8 -----------------------------------------------------------------

    #[test]
    fn vec_8_vertex_wins_over_its_own_segment() {
        // 3 local units from vertex 0, right on the segment's body:
        // inside both thresholds → the vertex wins.
        let target = pen_target(&net(), (3.0, 0.0), 1.0);
        assert_eq!(target, PenTarget::Vertex(0));
    }

    #[test]
    fn segment_projection_between_vertices() {
        let target = pen_target(&net(), (50.0, 6.0), 1.0);
        let PenTarget::Segment { segment, t, point } = target else {
            panic!("expected segment, got {target:?}");
        };
        assert_eq!(segment, 0);
        assert!((t - 0.5).abs() < 1e-2);
        assert!((point.0 - 50.0).abs() < 1e-2 && point.1.abs() < 1e-2);
    }

    #[test]
    fn free_beyond_thresholds() {
        assert_eq!(
            pen_target(&net(), (50.0, 40.0), 1.0),
            PenTarget::Free((50.0, 40.0))
        );
    }

    #[test]
    fn thresholds_are_zoom_invariant() {
        // 8 local units off the segment: hit at zoom 1 (8 px < 10 px),
        // miss at zoom 4 (32 px > 10 px), hit again zoomed out.
        assert!(matches!(
            pen_target(&net(), (50.0, 8.0), 1.0),
            PenTarget::Segment { .. }
        ));
        assert!(matches!(
            pen_target(&net(), (50.0, 8.0), 4.0),
            PenTarget::Free(_)
        ));
        assert!(matches!(
            pen_target(&net(), (50.0, 8.0), 0.5),
            PenTarget::Segment { .. }
        ));
    }

    // -- hover exclusivity (VEC-12) ---------------------------------------------

    #[test]
    fn vec_12_hover_is_exclusive_vertex_over_segment() {
        assert_eq!(
            hover(&net(), &[], (2.0, 1.0), 1.0),
            Some(Control::Vertex(0))
        );
        assert_eq!(
            hover(&net(), &[], (50.0, 4.0), 1.0),
            Some(Control::Segment(0))
        );
        assert_eq!(hover(&net(), &[], (50.0, 50.0), 1.0), None);
    }

    #[test]
    fn visible_tangent_knob_wins() {
        let mut n = net();
        n.segments[0].ta = (10.0, 10.0); // knob at (10, 10)
        let knob = TangentRef {
            segment: 0,
            end: SegEnd::A,
        };
        // Knob visible: it wins near its position.
        assert_eq!(
            hover(&n, &[knob], (10.0, 9.0), 1.0),
            Some(Control::Tangent(knob))
        );
        // Knob hidden (not in the visible list): not hittable.
        assert_ne!(
            hover(&n, &[], (10.0, 9.0), 1.0),
            Some(Control::Tangent(knob))
        );
    }

    // -- marquee -----------------------------------------------------------------

    #[test]
    fn marquee_contains_vertices_and_whole_curves() {
        let mut n = net();
        n.segments[0].ta = (0.0, -30.0);
        n.segments[0].tb = (0.0, -30.0);
        // Rect around vertex 0 only: no segment (its bbox pokes out).
        let (vs, ss) = marquee(
            &n,
            &math2::Rectangle {
                x: -10.0,
                y: -10.0,
                width: 20.0,
                height: 20.0,
            },
        );
        assert_eq!(vs, vec![0]);
        assert!(ss.is_empty());
        // Rect around everything incl. the curve's bulge: both + the segment.
        let (vs, ss) = marquee(
            &n,
            &math2::Rectangle {
                x: -10.0,
                y: -40.0,
                width: 130.0,
                height: 60.0,
            },
        );
        assert_eq!(vs, vec![0, 1]);
        assert_eq!(ss, vec![0]);
    }
}
