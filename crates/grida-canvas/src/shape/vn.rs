use math2::Rectangle;
use skia_safe;

#[derive(Debug, Clone)]
pub struct VectorNetworkSegment {
    pub a: usize,
    pub b: usize,
    pub ta: Option<[f32; 2]>,
    pub tb: Option<[f32; 2]>,
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

impl VectorNetwork {
    pub fn bounds(&self) -> Rectangle {
        if self.vertices.is_empty() {
            Rectangle::empty()
        } else {
            Rectangle::from_points(&self.vertices.iter().map(|v| [v.0, v.1]).collect::<Vec<_>>())
        }
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
        let mut builder = skia_safe::PathBuilder::new();

        let vertices = &self.vertices;
        let segments = &self.segments;

        // if no segments, return empty path
        if segments.is_empty() {
            return builder.snapshot();
        }

        // initial M
        let segment_first = match segments.first() {
            Some(seg) => seg,
            None => return builder.snapshot(),
        };
        let v_start = vertices[segment_first.a];
        builder.move_to(skia_safe::Point::new(v_start.0, v_start.1));

        for segment in segments {
            let a = self.vertices[segment.a];
            let b = self.vertices[segment.b];

            // if both ta and tb are Some, we need to add a cubic bezier curve
            if let (Some(ta), Some(tb)) = (segment.ta, segment.tb) {
                let c1 = [a.0 + ta[0], a.1 + ta[1]];
                let c2 = [b.0 + tb[0], b.1 + tb[1]];
                builder.cubic_to(
                    skia_safe::Point::new(c1[0], c1[1]),
                    skia_safe::Point::new(c2[0], c2[1]),
                    skia_safe::Point::new(b.0, b.1),
                );
            } else {
                builder.line_to(skia_safe::Point::new(b.0, b.1));
            }
        }

        // final Z (if closed)
        if let Some(segment_last) = segments.last() {
            if segment_last.b == segment_first.a {
                builder.close();
            }
        }

        return builder.snapshot();
    }
}
