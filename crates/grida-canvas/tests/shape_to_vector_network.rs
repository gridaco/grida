use cg::cg::types::RectangularCornerRadius;
use cg::shape::*;

#[test]
fn ellipse_vector_network_has_four_segments() {
    let shape = EllipseShape {
        width: 100.0,
        height: 80.0,
    };
    let vn = build_ellipse_vector_network(&shape);
    assert_eq!(vn.vertices.len(), 4);
    assert_eq!(vn.segments.len(), 4);
}

#[test]
fn rrect_vector_network_has_eight_segments() {
    let shape = RRectShape {
        width: 100.0,
        height: 80.0,
        corner_radius: RectangularCornerRadius::circular(10.0),
    };
    let vn = build_rrect_vector_network(&shape);
    assert_eq!(vn.vertices.len(), 8);
    assert_eq!(vn.segments.len(), 8);
}
