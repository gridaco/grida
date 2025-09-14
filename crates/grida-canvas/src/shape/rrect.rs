use super::vn::{VectorNetwork, VectorNetworkSegment};
use crate::cg::types::*;
use math2::KAPPA;

pub struct RRectShape {
    /// width of the box
    pub width: f32,
    /// height of the box
    pub height: f32,
    /// corner radius
    pub corner_radius: RectangularCornerRadius,
}

pub fn build_rrect(shape: &RRectShape) -> skia_safe::RRect {
    let irect = skia_safe::Rect::from_xywh(0.0, 0.0, shape.width, shape.height);

    if shape.corner_radius.is_zero() {
        skia_safe::RRect::new_rect(irect)
    } else {
        skia_safe::RRect::new_rect_radii(
            irect,
            &[
                shape.corner_radius.tl.tuple().into(),
                shape.corner_radius.tr.tuple().into(),
                shape.corner_radius.br.tuple().into(),
                shape.corner_radius.bl.tuple().into(),
            ],
        )
    }
}

pub fn build_rrect_path(shape: &RRectShape) -> skia_safe::Path {
    let mut path = skia_safe::Path::new();
    path.add_rrect(build_rrect(shape), None);
    path
}

/// Build a [`VectorNetwork`] representing this rounded rectangle.
///
/// The network is constructed with segments in clockwise order starting from
/// the top edge. Each corner is approximated with a single cubic Bézier curve
/// using the KAPPA constant.
#[deprecated(note = "use VectorGeometryShape instead")]
pub fn build_rrect_vector_network(shape: &RRectShape) -> VectorNetwork {
    let w = shape.width;
    let h = shape.height;
    let tl = shape.corner_radius.tl;
    let tr = shape.corner_radius.tr;
    let br = shape.corner_radius.br;
    let bl = shape.corner_radius.bl;

    let mut vertices: Vec<(f32, f32)> = Vec::new();
    let mut segments: Vec<VectorNetworkSegment> = Vec::new();

    // helper to push vertex and return index
    let mut push = |p: (f32, f32)| {
        vertices.push(p);
        vertices.len() - 1
    };
    // helper to create line segment
    let line = |a: usize, b: usize| VectorNetworkSegment::ab(a, b);

    // Starting point (top-left edge start)
    let start = (tl.rx, 0.0);
    let start_idx = push(start);
    let mut prev = start_idx;

    // Top edge
    let top_right_start = (w - tr.rx, 0.0);
    let tr_start_idx = push(top_right_start);
    segments.push(line(prev, tr_start_idx));
    prev = tr_start_idx;

    // Top-right corner
    if !tr.is_zero() {
        let end = (w, tr.ry);
        let end_idx = push(end);
        segments.push(VectorNetworkSegment {
            a: prev,
            b: end_idx,
            ta: (KAPPA * tr.rx, 0.0),
            tb: (0.0, -KAPPA * tr.ry),
        });
        prev = end_idx;
    }

    // Right edge
    let br_start = (w, h - br.ry);
    let br_start_idx = push(br_start);
    segments.push(line(prev, br_start_idx));
    prev = br_start_idx;

    // Bottom-right corner
    if !br.is_zero() {
        let end = (w - br.rx, h);
        let end_idx = push(end);
        segments.push(VectorNetworkSegment {
            a: prev,
            b: end_idx,
            ta: (0.0, KAPPA * br.ry),
            tb: (-KAPPA * br.rx, 0.0),
        });
        prev = end_idx;
    }

    // Bottom edge
    let bl_start = (bl.rx, h);
    let bl_start_idx = push(bl_start);
    segments.push(line(prev, bl_start_idx));
    prev = bl_start_idx;

    // Bottom-left corner
    if !bl.is_zero() {
        let end = (0.0, h - bl.ry);
        let end_idx = push(end);
        segments.push(VectorNetworkSegment {
            a: prev,
            b: end_idx,
            ta: (-KAPPA * bl.rx, 0.0),
            tb: (0.0, KAPPA * bl.ry),
        });
        prev = end_idx;
    }

    // Left edge
    let tl_start = (0.0, tl.ry);
    let tl_start_idx = if tl_start == start {
        start_idx
    } else {
        push(tl_start)
    };
    segments.push(line(prev, tl_start_idx));
    prev = tl_start_idx;

    // Top-left corner / close
    if !tl.is_zero() {
        segments.push(VectorNetworkSegment {
            a: prev,
            b: start_idx,
            ta: (0.0, -KAPPA * tl.ry),
            tb: (KAPPA * tl.rx, 0.0),
        });
    }

    VectorNetwork {
        vertices,
        segments,
        regions: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vectornetwork::VectorNetworkSegment;

    #[test]
    fn rectangle_vector_network_is_minimal() {
        let shape = RRectShape {
            width: 100.0,
            height: 50.0,
            corner_radius: RectangularCornerRadius::zero(),
        };

        #[allow(deprecated)]
        let vn = build_rrect_vector_network(&shape);

        assert_eq!(vn.vertices.len(), 4);
        assert_eq!(vn.segments.len(), 4);

        assert_eq!(vn.segments[0], VectorNetworkSegment::ab(0, 1));
        assert_eq!(vn.segments[1], VectorNetworkSegment::ab(1, 2));
        assert_eq!(vn.segments[2], VectorNetworkSegment::ab(2, 3));
        assert_eq!(vn.segments[3], VectorNetworkSegment::ab(3, 0));
    }
}
