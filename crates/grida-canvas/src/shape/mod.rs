pub mod arc;
pub mod corner;
pub mod ellipse;
pub mod polygon;
pub mod ring;
pub mod rpolygon;
pub mod rrect;
pub mod star;
pub mod stroke;
pub mod vn;

pub use arc::*;
pub use corner::*;
pub use ellipse::*;
pub use polygon::*;
pub use ring::*;
pub use rpolygon::*;
pub use rrect::*;
pub use star::*;
pub use stroke::*;
pub use vn::*;

pub enum Shape {
    RRect(RRectShape),
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
            Shape::RRect(shape) => build_rrect_path(&shape),
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
