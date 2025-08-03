use math2::Rectangle;
use skia_safe;

#[derive(Debug, Clone)]
pub struct VectorNetworkSegment {
    pub a: usize,
    pub b: usize,
    pub ta: Option<(f32, f32)>,
    pub tb: Option<(f32, f32)>,
}

#[derive(Debug, Clone)]
pub struct VectorNetworkLoop(
    /// Indices of the segments that make up the loop.
    pub Vec<usize>,
);

#[derive(Debug, Clone)]
pub struct VectorNetworkRegion {
    pub loops: Vec<VectorNetworkLoop>,
}

#[derive(Debug, Clone)]
pub struct VectorNetwork {
    pub vertices: Vec<(f32, f32)>,
    pub segments: Vec<VectorNetworkSegment>,
    // pub regions: Vec<VectorNetworkRegion>,
}

fn is_zero(tangent: (f32, f32)) -> bool {
    tangent.0 == 0.0 && tangent.1 == 0.0
}

impl VectorNetwork {
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
        }
    }
}

impl Into<skia_safe::Path> for VectorNetwork {
    //
    fn into(self) -> skia_safe::Path {
        let mut path = skia_safe::Path::new();

        let vertices = &self.vertices;
        let segments = &self.segments;

        // if no segments, return empty path
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

            // Start a new subpath if this segment does not connect
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
}
