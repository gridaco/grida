pub mod arc;
pub mod ellipse;
pub mod polygon;
pub mod ring;
pub mod rpolygon;
pub mod star;
pub mod vn;

pub use arc::*;
pub use ellipse::*;
pub use polygon::*;
pub use ring::*;
pub use rpolygon::*;
pub use star::*;
pub use vn::*;

pub enum Shape {
    SimplePolygon(SimplePolygonShape),
    Ellipse(EllipseShape),
    EllipticalArc(EllipticalArcShape),
    EllipticalRing(EllipticalRingShape),
    EllipticalRegularStar(EllipticalRegularStarShape),
    EllipticalRegularPolygon(EllipticalRegularPolygonShape),
}

impl Into<skia_safe::Path> for &Shape {
    fn into(self) -> skia_safe::Path {
        match self {
            Shape::SimplePolygon(shape) => build_simple_polygon_path(&shape),
            Shape::Ellipse(shape) => build_ellipse_path(&shape),
            Shape::EllipticalArc(shape) => build_arc_path(&shape),
            Shape::EllipticalRing(shape) => build_ring_path(&shape),
            Shape::EllipticalRegularStar(shape) => build_star_path(&shape),
            Shape::EllipticalRegularPolygon(shape) => {
                build_path_from_points(&build_regular_polygon_points(&shape))
            }
        }
    }
}
