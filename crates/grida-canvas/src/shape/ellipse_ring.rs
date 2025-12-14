use super::vn::VectorNetwork;
use skia_safe;

pub struct EllipticalRingShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// inner radius in 0..1
    pub inner_radius_ratio: f32,
}

pub fn build_ring_path(shape: &EllipticalRingShape) -> skia_safe::Path {
    let mut builder = skia_safe::PathBuilder::new();

    let w = shape.width;
    let h = shape.height;
    let cx = w / 2.0;
    let cy = h / 2.0;
    let rx = w / 2.0;
    let ry = h / 2.0;
    let inner_rx = rx * shape.inner_radius_ratio;
    let inner_ry = ry * shape.inner_radius_ratio;

    // Create outer ellipse (clockwise)
    let outer_rect = skia_safe::Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0);
    builder.add_oval(outer_rect, None, None);

    // Create inner ellipse (counter-clockwise) to create the hole
    let inner_rect =
        skia_safe::Rect::from_xywh(cx - inner_rx, cy - inner_ry, inner_rx * 2.0, inner_ry * 2.0);
    builder.add_oval(inner_rect, Some(skia_safe::PathDirection::CCW), Some(0));

    builder.detach()
}

/// Build a [`VectorNetwork`] representing an elliptical ring. The outer
/// contour is clockwise and the inner contour is counter-clockwise so that the
/// resulting path forms a hole.
pub fn build_ring_vector_network(shape: &EllipticalRingShape) -> VectorNetwork {
    let outer = super::ellipse::build_ellipse_vector_network(&super::ellipse::EllipseShape {
        width: shape.width,
        height: shape.height,
    });

    let inner = super::ellipse::build_ellipse_vector_network_ccw(&super::ellipse::EllipseShape {
        width: shape.width * shape.inner_radius_ratio,
        height: shape.height * shape.inner_radius_ratio,
    });

    let mut vertices = outer.vertices;
    let offset = vertices.len();
    vertices.extend(inner.vertices);

    let mut segments = outer.segments;
    segments.extend(inner.segments.into_iter().map(|mut s| {
        s.a += offset;
        s.b += offset;
        s
    }));

    VectorNetwork {
        vertices,
        segments,
        regions: vec![],
    }
}
