use cg::cg::types::RectangularCornerRadius;
use cg::node::factory::NodeFactory;
use cg::node::schema::NodeShapeMixin;
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
fn rrect_vector_network_has_curved_corners() {
    let shape = RRectShape {
        width: 100.0,
        height: 80.0,
        corner_radius: RectangularCornerRadius::circular(10.0),
    };
    let vn = build_rrect_vector_network(&shape);

    // Each corner's conic is subdivided into multiple cubic segments.
    // With 4 corners, curved count should be a positive multiple of 4.
    let curved = vn
        .segments
        .iter()
        .filter(|s| s.ta != (0.0, 0.0) || s.tb != (0.0, 0.0))
        .count();
    assert!(
        curved >= 4,
        "expected at least 4 curved segments, got {curved}"
    );
    assert_eq!(
        curved % 4,
        0,
        "expected multiple of 4 curved segments, got {curved}"
    );
}

#[test]
fn ellipse_node_with_zero_inner_radius_has_four_segments() {
    let factory = NodeFactory::new();
    let mut ellipse = factory.create_ellipse_node();
    ellipse.inner_radius = Some(0.0);
    let vn = ellipse.to_vector_network();
    assert_eq!(vn.vertices.len(), 4);
    assert_eq!(vn.segments.len(), 4);
}
