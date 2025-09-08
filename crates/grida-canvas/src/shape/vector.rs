use super::*;

///
/// Portable VectorGeometry Shape definition, that can be converted to VectorNetwork
/// Unlike vector network, this is considered all-filled, does not represents any solid complex path.
/// Consider this as an alternative to [`SimplePolygonShape`], which it can contain a collection of polygons.
/// E.g. this is useful when converting a text glyphs as a portable model.
///
pub struct VectorGeometryShape {
    pub vertices: Vec<(f32, f32)>,
    pub segments: Vec<VectorNetworkSegment>,
    /// Corner radius effect to be applied to the path.
    /// If <= 0, corner radius is not applied.
    pub corner_radius: f32,
}

impl VectorGeometryShape {
    pub fn new() -> Self {
        Self {
            vertices: vec![],
            segments: vec![],
            corner_radius: 0.0,
        }
    }

    pub fn from_rect(x: f32, y: f32, w: f32, h: f32) -> Self {
        // Start at top-left (x, y). Proceed clockwise:
        let mut geometry = Self::new();
        geometry.vertices.push((x, y));
        geometry.vertices.push((x + w, y));
        geometry.vertices.push((x + w, y + h));
        geometry.vertices.push((x, y + h));
        geometry.segments.push(VectorNetworkSegment::ab(0, 1));
        geometry.segments.push(VectorNetworkSegment::ab(1, 2));
        geometry.segments.push(VectorNetworkSegment::ab(2, 3));
        geometry.segments.push(VectorNetworkSegment::ab(3, 0));
        geometry
    }

    pub fn from_rrect(x: f32, y: f32, w: f32, h: f32, corner_radius: f32) -> Self {
        let mut geometry = Self::from_rect(x, y, w, h);
        geometry.corner_radius = corner_radius;
        geometry
    }

    pub fn set_corner_radius(&mut self, radius: f32) {
        self.corner_radius = radius;
    }

    pub fn from_points(points: Vec<(f32, f32)>) -> Self {
        let n = points.len();

        // Create line segments connecting consecutive points, with the last segment connecting back to the first
        let mut segments: Vec<VectorNetworkSegment> = Vec::with_capacity(n);
        for i in 0..n {
            let a = i;
            let b = (i + 1) % n; // Wrap around to connect last point to first
            segments.push(VectorNetworkSegment::ab(a, b));
        }

        Self {
            vertices: points,
            segments,
            corner_radius: 0.0,
        }
    }
}

impl From<RectShape> for VectorGeometryShape {
    fn from(shape: RectShape) -> Self {
        Self::from_rect(0.0, 0.0, shape.width, shape.height)
    }
}

impl From<SimplePolygonShape> for VectorGeometryShape {
    fn from(shape: SimplePolygonShape) -> Self {
        // Convert CGPoint to (f32, f32) vertices
        let vertices: Vec<(f32, f32)> = shape.points.iter().map(|p| (p.x, p.y)).collect();

        let mut geometry = Self::from_points(vertices);
        geometry.corner_radius = shape.corner_radius;
        geometry
    }
}

impl From<RRectShape> for VectorGeometryShape {
    fn from(shape: RRectShape) -> Self {
        VectorGeometryShape::from_rrect(
            0.0,
            0.0,
            shape.width,
            shape.height,
            shape.corner_radius.avg(),
        )
    }
}
