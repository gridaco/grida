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
            let seg_box = if let (Some(ta), Some(tb)) = (seg.ta, seg.tb) {
                // Treat zero tangents the same as None
                if is_zero(ta) || is_zero(tb) {
                    Rectangle::from_points(&[[a.0, a.1], [b.0, b.1]])
                } else {
                    math2::bezier_get_bbox(&math2::CubicBezierWithTangents {
                        a: [a.0, a.1],
                        b: [b.0, b.1],
                        ta: [ta.0, ta.1],
                        tb: [tb.0, tb.1],
                    })
                }
            } else {
                Rectangle::from_points(&[[a.0, a.1], [b.0, b.1]])
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

        // initial M
        let segment_first = match segments.first() {
            Some(seg) => seg,
            None => return path,
        };
        let v_start = vertices[segment_first.a];
        path.move_to((v_start.0, v_start.1));

        for segment in segments {
            let a = self.vertices[segment.a];
            let b = self.vertices[segment.b];

            // if both ta and tb are Some and non-zero, we need to add a cubic bezier curve
            if let (Some(ta), Some(tb)) = (segment.ta, segment.tb) {
                if !is_zero(ta) && !is_zero(tb) {
                    let c1 = [a.0 + ta.0, a.1 + ta.1];
                    let c2 = [b.0 + tb.0, b.1 + tb.1];
                    path.cubic_to((c1[0], c1[1]), (c2[0], c2[1]), (b.0, b.1));
                } else {
                    path.line_to((b.0, b.1));
                }
            } else {
                path.line_to((b.0, b.1));
            }
        }

        // final Z (if closed)
        if let Some(segment_last) = segments.last() {
            if segment_last.b == segment_first.a {
                path.close();
            }
        }

        return path;
    }
}
