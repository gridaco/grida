use crate::cg::types::*;
use math2::Rectangle;
use skia_safe;

#[derive(Debug, Clone)]
pub struct VectorNetworkSegment {
    pub a: usize,
    pub b: usize,
    pub ta: Option<(f32, f32)>,
    pub tb: Option<(f32, f32)>,
}

/// A sequence of segment indices that form a closed contour (loop).
///
/// Each `VectorNetworkLoop` corresponds to a single closed ring in the
/// vector network. The segments must form a connected, circular path,
/// where the end of one segment connects to the start of the next,
/// eventually returning to the starting point.
///
/// This structure aligns conceptually with subpaths in SVG `<path>` data,
/// specifically each `M...Z` section.
///
/// # Example
/// ```rust,ignore
/// // A square made of 4 segments:
/// VectorNetworkLoop(vec![0, 1, 2, 3])
/// ```
#[derive(Debug, Clone)]
pub struct VectorNetworkLoop(
    /// Indices of the segments that make up the loop.
    pub Vec<usize>,
);

/// A filled region composed of one or more closed loops.
///
/// A region defines a topological "face" in the vector network. Each region
/// consists of one or more `VectorNetworkLoop`s, where:
/// - The **first loop** is the outer boundary (positive area),
/// - Subsequent loops (if any) represent holes (negative space).
///
/// This structure enables representation of compound paths, including
/// shapes with holes (e.g. letter “O” or donuts), multiple disjoint islands,
/// and nested fill areas.
///
/// This maps to SVG `<path>` with multiple `M...Z` subpaths and fill rules
/// like `evenodd` or `nonzero`, though the current model assumes even-odd
/// by loop parity.
///
/// # Example
/// ```rust,ignore
/// // A donut shape: outer square, inner square hole
/// VectorNetworkRegion {
///     loops: vec![
///         VectorNetworkLoop(vec![0, 1, 2, 3]), // outer
///         VectorNetworkLoop(vec![4, 5, 6, 7]), // hole
///     ]
/// }
/// ```
#[derive(Debug, Clone)]
pub struct VectorNetworkRegion {
    /// One or more loops that define this region.
    ///
    /// Each loop is a list of segment indices that form a closed contour.
    /// The first loop is assumed to be the outer boundary.
    /// Subsequent loops are treated as holes.
    pub loops: Vec<VectorNetworkLoop>,
    /// Fill rule used to determine how the area enclosed by the loops is filled.
    ///
    /// - `EvenOdd`: fill if the number of crossings is odd.
    /// - `NonZero`: fill if the winding number ≠ 0 (based on loop direction).
    ///
    /// This field maps directly to SVG's `fill-rule` attribute and Skia's `PathFillType`.
    pub fill_rule: FillRule,
    /// Fills applied to this region.
    ///
    /// When `None`, the region will not be filled by the vector-network painter.
    /// This mirrors node-level fill semantics where multiple paints may be
    /// stacked.
    pub fills: Option<Vec<Paint>>,
}

/// A full vector network representing a graph of vertices and segments.
///
/// - Vertices define points in 2D space.
/// - Segments connect pairs of vertices and may contain tangents for Bézier control.
/// - Regions (optional) define filled areas using loops of segments.
///
/// This structure is designed for SVG `<path>` compatibility and supports:
/// - Linear and cubic Bézier segments
/// - Multiple subpaths (via looped regions)
/// - Compound shapes with holes
///
/// # Notes
/// - The segments list is flat; ordering and connectivity must be tracked
///   separately to construct regions or faces.
/// - Regions are optional and may be omitted for stroke-only paths.
#[derive(Debug, Clone)]
pub struct VectorNetwork {
    pub vertices: Vec<(f32, f32)>,
    pub segments: Vec<VectorNetworkSegment>,
    pub regions: Vec<VectorNetworkRegion>,
}

fn is_zero(tangent: (f32, f32)) -> bool {
    tangent.0 == 0.0 && tangent.1 == 0.0
}

fn build_path_from_segments(
    vertices: &[(f32, f32)],
    segments: &[VectorNetworkSegment],
) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();

    if segments.is_empty() {
        return path;
    }

    let mut current_start: Option<usize> = None;
    let mut previous_end: Option<usize> = None;

    for segment in segments {
        let a_idx = segment.a;
        let b_idx = segment.b;
        let a = vertices[a_idx];
        let b = vertices[b_idx];
        let ta = segment.ta.unwrap_or((0.0, 0.0));
        let tb = segment.tb.unwrap_or((0.0, 0.0));

        if previous_end != Some(a_idx) {
            path.move_to((a.0, a.1));
            current_start = Some(a_idx);
        }

        if is_zero(ta) && is_zero(tb) {
            path.line_to((b.0, b.1));
        } else {
            let c1 = [a.0 + ta.0, a.1 + ta.1];
            let c2 = [b.0 + tb.0, b.1 + tb.1];
            path.cubic_to((c1[0], c1[1]), (c2[0], c2[1]), (b.0, b.1));
        }

        previous_end = Some(b_idx);

        if Some(b_idx) == current_start {
            path.close();
            previous_end = None;
            current_start = None;
        }
    }

    path
}

impl VectorNetwork {
    /// Convert this vector network into a list of [`skia_safe::Path`].
    ///
    /// When regions are defined, each region becomes its own path with the
    /// appropriate [`skia_safe::PathFillType`] set according to the region's
    /// [`FillRule`]. If no regions exist, a single path built from all segments
    /// is returned.
    pub fn to_paths(&self) -> Vec<skia_safe::Path> {
        let vertices = &self.vertices;
        let segments = &self.segments;

        if self.regions.is_empty() {
            return vec![build_path_from_segments(vertices, segments)];
        }

        let mut paths = Vec::with_capacity(self.regions.len());
        for region in &self.regions {
            let mut path = skia_safe::Path::new();
            for VectorNetworkLoop(seg_indices) in &region.loops {
                if seg_indices.is_empty() {
                    continue;
                }

                let mut current_start = None;
                let mut previous_end = None;
                for &idx in seg_indices {
                    let seg = &segments[idx];
                    let a_idx = seg.a;
                    let b_idx = seg.b;
                    let a = vertices[a_idx];
                    let b = vertices[b_idx];
                    let ta = seg.ta.unwrap_or((0.0, 0.0));
                    let tb = seg.tb.unwrap_or((0.0, 0.0));

                    if previous_end != Some(a_idx) {
                        path.move_to((a.0, a.1));
                        current_start = Some(a_idx);
                    }

                    if is_zero(ta) && is_zero(tb) {
                        path.line_to((b.0, b.1));
                    } else {
                        let c1 = (a.0 + ta.0, a.1 + ta.1);
                        let c2 = (b.0 + tb.0, b.1 + tb.1);
                        path.cubic_to(c1, c2, (b.0, b.1));
                    }

                    previous_end = Some(b_idx);
                    if Some(b_idx) == current_start {
                        path.close();
                        previous_end = None;
                        current_start = None;
                    }
                }
            }

            let fill_type = match region.fill_rule {
                FillRule::NonZero => skia_safe::PathFillType::Winding,
                FillRule::EvenOdd => skia_safe::PathFillType::EvenOdd,
            };
            path.set_fill_type(fill_type);
            paths.push(path);
        }

        paths
    }

    /// Merge all paths returned by [`to_paths`](Self::to_paths) into a single
    /// path. This is a temporary convenience and may not preserve fill rules
    /// across separate regions.
    pub fn to_path(&self) -> skia_safe::Path {
        let mut merged = skia_safe::Path::new();
        for p in self.to_paths() {
            merged.add_path(&p, (0.0, 0.0), skia_safe::path::AddPathMode::Append);
        }
        merged
    }

    pub fn bounds(&self) -> Rectangle {
        if self.vertices.is_empty() {
            return Rectangle::empty();
        }

        // When there are no segments we fall back to using the vertex points
        // to compute the bounding box. This should rarely happen for a valid
        // vector network but provides a safe default.
        if self.segments.is_empty() {
            return Rectangle::from_points(
                &self.vertices.iter().map(|v| [v.0, v.1]).collect::<Vec<_>>(),
            );
        }

        let mut bbox: Option<Rectangle> = None;
        for seg in &self.segments {
            let a = self.vertices[seg.a];
            let b = self.vertices[seg.b];
            let ta = seg.ta.unwrap_or((0.0, 0.0));
            let tb = seg.tb.unwrap_or((0.0, 0.0));
            let seg_box = if is_zero(ta) && is_zero(tb) {
                Rectangle::from_points(&[[a.0, a.1], [b.0, b.1]])
            } else {
                math2::bezier_get_bbox(&math2::CubicBezierWithTangents {
                    a: [a.0, a.1],
                    b: [b.0, b.1],
                    ta: [ta.0, ta.1],
                    tb: [tb.0, tb.1],
                })
            };

            bbox = Some(match bbox {
                Some(prev) => math2::rect::union(&[prev, seg_box]),
                None => seg_box,
            });
        }

        bbox.unwrap_or_else(Rectangle::empty)
    }
}

impl Default for VectorNetwork {
    fn default() -> Self {
        VectorNetwork {
            vertices: vec![],
            segments: vec![],
            regions: vec![],
        }
    }
}

impl Into<skia_safe::Path> for VectorNetwork {
    fn into(self) -> skia_safe::Path {
        self.to_path()
    }
}
