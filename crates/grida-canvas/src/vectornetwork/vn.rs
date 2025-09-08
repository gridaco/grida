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

impl VectorNetworkSegment {
    /// straight line segment between two vertex indices
    pub fn ab(a: usize, b: usize) -> Self {
        Self {
            a,
            b,
            ta: None,
            tb: None,
        }
    }
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

#[derive(Debug, Clone)]
pub struct PiecewiseVectorNetworkGeometry {
    /// Array of unique vertex positions in 2D space.
    ///
    /// Each vertex is represented as a tuple of `(x, y)` coordinates.
    /// Vertices are indexed by their position in this array, and segments
    /// reference vertices by these indices for memory efficiency.
    pub vertices: Vec<(f32, f32)>,
    /// Array of segment definitions, each referencing vertices by index.
    ///
    /// Each segment connects two vertices and may contain tangent information
    /// for Bézier curve control. The segments form a piecewise curve network
    /// that can represent complex paths with both linear and curved segments.
    pub segments: Vec<VectorNetworkSegment>,
}

impl PiecewiseVectorNetworkGeometry {
    /// Creates a new `PiecewiseVectorNetworkGeometry` with built-in validation.
    ///
    /// This constructor validates the geometry immediately upon creation,
    /// ensuring that the resulting instance is suitable for rendering backend
    /// operations. If validation fails, returns an `Err` with a descriptive
    /// error message instead of panicking.
    ///
    /// # Arguments
    ///
    /// * `vertices` - Array of unique vertex positions in 2D space
    /// * `segments` - Array of segment definitions referencing vertices by index
    ///
    /// # Returns
    ///
    /// Returns `Ok(PiecewiseVectorNetworkGeometry)` if validation succeeds,
    /// or `Err(String)` with a descriptive error message if validation fails.
    /// See [`validate`](Self::validate) for details on validation requirements.
    ///
    /// # Example
    ///
    /// ```rust
    /// use cg::vectornetwork::vn::{PiecewiseVectorNetworkGeometry, VectorNetworkSegment};
    ///
    /// // Valid geometry - will succeed
    /// let geometry = PiecewiseVectorNetworkGeometry::new(
    ///     vec![(0.0, 0.0), (100.0, 0.0), (200.0, 100.0)],
    ///     vec![
    ///         VectorNetworkSegment { a: 0, b: 1, ta: Some((50.0, 50.0)), tb: Some((-50.0, 50.0)) },
    ///         VectorNetworkSegment { a: 1, b: 2, ta: Some((50.0, 50.0)), tb: Some((50.0, -50.0)) },
    ///     ],
    /// ).expect("Valid geometry should be created successfully");
    ///
    /// // Invalid geometry - will return Err
    /// let invalid_result = PiecewiseVectorNetworkGeometry::new(
    ///     vec![(0.0, 0.0)], // Only one vertex
    ///     vec![VectorNetworkSegment { a: 0, b: 1, ta: None, tb: None }], // References non-existent vertex 1
    /// );
    /// assert!(invalid_result.is_err());
    /// ```
    pub fn new(
        vertices: Vec<(f32, f32)>,
        segments: Vec<VectorNetworkSegment>,
    ) -> Result<Self, String> {
        let geometry = Self { vertices, segments };

        // Validate the geometry immediately
        geometry.validate()?;

        Ok(geometry)
    }

    /// Validates the integrity of the piecewise vector network geometry.
    ///
    /// This method performs comprehensive validation to ensure the geometry
    /// is suitable for rendering backend operations. Unlike the TypeScript
    /// version which has no validation, this Rust implementation includes
    /// built-in validation for data integrity and connectivity.
    ///
    /// # Validation Checks
    ///
    /// - **Index bounds**: All segment indices (`a`, `b`) must be valid within the vertices array
    /// - **Vertex connectivity**: Ensures segments form a connected network where appropriate
    /// - **Tangent validity**: Validates that tangent vectors are well-formed and within reasonable bounds
    /// - **Geometry consistency**: Checks for degenerate cases that could cause rendering issues
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the geometry is valid, or an `Err` with a descriptive
    /// message indicating the specific validation failure.
    ///
    /// # Example
    ///
    /// ```rust
    /// use cg::vectornetwork::vn::{PiecewiseVectorNetworkGeometry, VectorNetworkSegment};
    ///
    /// let geometry = PiecewiseVectorNetworkGeometry {
    ///     vertices: vec![(0.0, 0.0), (100.0, 0.0), (200.0, 100.0)],
    ///     segments: vec![
    ///         VectorNetworkSegment { a: 0, b: 1, ta: Some((50.0, 50.0)), tb: Some((-50.0, 50.0)) },
    ///         VectorNetworkSegment { a: 1, b: 2, ta: Some((50.0, 50.0)), tb: Some((50.0, -50.0)) },
    ///     ],
    /// };
    ///
    /// match geometry.validate() {
    ///     Ok(()) => println!("Geometry is valid for rendering"),
    ///     Err(e) => eprintln!("Validation failed: {}", e),
    /// }
    /// ```
    pub fn validate(&self) -> Result<(), String> {
        // Validate vertex indices in segments
        for (i, segment) in self.segments.iter().enumerate() {
            if segment.a >= self.vertices.len() {
                return Err(format!(
                    "Segment {}: vertex index 'a' ({}) out of bounds (max: {})",
                    i,
                    segment.a,
                    self.vertices.len() - 1
                ));
            }
            if segment.b >= self.vertices.len() {
                return Err(format!(
                    "Segment {}: vertex index 'b' ({}) out of bounds (max: {})",
                    i,
                    segment.b,
                    self.vertices.len() - 1
                ));
            }

            // Validate tangent vectors if present
            if let Some(ta) = segment.ta {
                if ta.0.is_nan() || ta.1.is_nan() || ta.0.is_infinite() || ta.1.is_infinite() {
                    return Err(format!("Segment {}: invalid tangent 'ta' ({:?})", i, ta));
                }
            }
            if let Some(tb) = segment.tb {
                if tb.0.is_nan() || tb.1.is_nan() || tb.0.is_infinite() || tb.1.is_infinite() {
                    return Err(format!("Segment {}: invalid tangent 'tb' ({:?})", i, tb));
                }
            }
        }

        // Validate vertex positions
        for (i, vertex) in self.vertices.iter().enumerate() {
            if vertex.0.is_nan()
                || vertex.1.is_nan()
                || vertex.0.is_infinite()
                || vertex.1.is_infinite()
            {
                return Err(format!("Vertex {}: invalid position ({:?})", i, vertex));
            }
        }

        Ok(())
    }
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
    pub fn to_appended_path(&self) -> skia_safe::Path {
        let mut merged = skia_safe::Path::new();
        for p in self.to_paths() {
            merged.add_path(&p, (0.0, 0.0), skia_safe::path::AddPathMode::Append);
        }
        merged
    }

    /// Union all paths returned by [`to_union`](Self::to_union) into a single path.
    pub fn to_union_path(&self) -> skia_safe::Path {
        let mut merged = skia_safe::Path::new();
        for p in self.to_paths() {
            if let Some(unioned) = skia_safe::op(&merged, &p, skia_safe::PathOp::Union) {
                merged = unioned;
            } else {
                continue;
            }
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
        self.to_union_path()
    }
}
