pub struct EllipseShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
}

pub fn build_ellipse_path(shape: &EllipseShape) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();
    path.add_oval(
        skia_safe::Rect::from_xywh(0.0, 0.0, shape.width, shape.height),
        None,
    );
    path
}

use super::vn::{VectorNetwork, VectorNetworkSegment};

/// Build a clockwise oriented [`VectorNetwork`] approximating this ellipse
/// with four cubic Bézier segments.
pub fn build_ellipse_vector_network(shape: &EllipseShape) -> VectorNetwork {
    ellipse_to_vector_network(shape, true)
}

/// Build a counter-clockwise oriented [`VectorNetwork`] approximating this
/// ellipse. Used for inner contours (holes).
pub fn build_ellipse_vector_network_ccw(shape: &EllipseShape) -> VectorNetwork {
    ellipse_to_vector_network(shape, false)
}

fn ellipse_to_vector_network(shape: &EllipseShape, clockwise: bool) -> VectorNetwork {
    const KAPPA: f32 = 0.5522847498307936;
    let rx = shape.width / 2.0;
    let ry = shape.height / 2.0;
    let cx = rx;
    let cy = ry;
    let kx = rx * KAPPA;
    let ky = ry * KAPPA;

    let vertices: Vec<(f32, f32)>;
    let mut segments: Vec<VectorNetworkSegment> = Vec::new();

    if clockwise {
        vertices = vec![(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)];
        segments.push(VectorNetworkSegment {
            a: 0,
            b: 1,
            ta: Some((kx, 0.0)),
            tb: Some((0.0, -ky)),
        });
        segments.push(VectorNetworkSegment {
            a: 1,
            b: 2,
            ta: Some((0.0, ky)),
            tb: Some((kx, 0.0)),
        });
        segments.push(VectorNetworkSegment {
            a: 2,
            b: 3,
            ta: Some((-kx, 0.0)),
            tb: Some((0.0, ky)),
        });
        segments.push(VectorNetworkSegment {
            a: 3,
            b: 0,
            ta: Some((0.0, -ky)),
            tb: Some((-kx, 0.0)),
        });
    } else {
        vertices = vec![(cx, cy - ry), (cx - rx, cy), (cx, cy + ry), (cx + rx, cy)];
        segments.push(VectorNetworkSegment {
            a: 0,
            b: 1,
            ta: Some((-kx, 0.0)),
            tb: Some((0.0, -ky)),
        });
        segments.push(VectorNetworkSegment {
            a: 1,
            b: 2,
            ta: Some((0.0, ky)),
            tb: Some((-kx, 0.0)),
        });
        segments.push(VectorNetworkSegment {
            a: 2,
            b: 3,
            ta: Some((kx, 0.0)),
            tb: Some((0.0, ky)),
        });
        segments.push(VectorNetworkSegment {
            a: 3,
            b: 0,
            ta: Some((0.0, -ky)),
            tb: Some((kx, 0.0)),
        });
    }

    VectorNetwork { vertices, segments }
}
