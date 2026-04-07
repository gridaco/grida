use super::vn::*;

pub struct RectShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
}

impl From<&RectShape> for skia_safe::Rect {
    fn from(val: &RectShape) -> Self {
        skia_safe::Rect::from_wh(val.width, val.height)
    }
}

impl From<&RectShape> for skia_safe::Path {
    fn from(val: &RectShape) -> Self {
        let rect: skia_safe::Rect = val.into();
        skia_safe::Path::rect(rect, None)
    }
}

pub fn build_rect_vector_network(shape: &RectShape) -> VectorNetwork {
    let w = shape.width;
    let h = shape.height;

    // 4 vertices (corners)
    let vertices = vec![
        (0.0, 0.0), // 0: top-left
        (w, 0.0),   // 1: top-right
        (w, h),     // 2: bottom-right
        (0.0, h),   // 3: bottom-left
    ];

    // 4 line segments forming a closed rectangle
    let segments = vec![
        VectorNetworkSegment::ab(0, 1), // top edge
        VectorNetworkSegment::ab(1, 2), // right edge
        VectorNetworkSegment::ab(2, 3), // bottom edge
        VectorNetworkSegment::ab(3, 0), // left edge (close)
    ];

    VectorNetwork {
        vertices,
        segments,
        regions: vec![],
    }
}
