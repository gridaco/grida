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

#[test]
fn ellipse_node_with_zero_inner_radius_has_four_segments() {
    let factory = NodeFactory::new();
    let mut ellipse = factory.create_ellipse_node();
    ellipse.inner_radius = Some(0.0);
    let vn = ellipse.to_vector_network();
    assert_eq!(vn.vertices.len(), 4);
    assert_eq!(vn.segments.len(), 4);
}
