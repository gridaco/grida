pub mod corner;
pub mod ellipse;
pub mod ellipse_ring;
pub mod ellipse_ring_sector;
pub mod ellipse_sector;
pub mod polygon;
pub mod regular_polygon;
pub mod regular_star;
pub mod rrect;
pub mod stroke;
pub mod vn;

pub use corner::*;
pub use ellipse::*;
pub use ellipse_ring::*;
pub use ellipse_ring_sector::*;
pub use ellipse_sector::*;
pub use polygon::*;
pub use regular_polygon::*;
pub use regular_star::*;
pub use rrect::*;
pub use stroke::*;
pub use vn::*;

pub enum Shape {
    RRect(RRectShape),
    SimplePolygon(SimplePolygonShape),
    Ellipse(EllipseShape),
    EllipticalRingSector(EllipticalRingSectorShape),
    EllipticalSector(EllipticalSectorShape),
    EllipticalRing(EllipticalRingShape),
    RegularStarPolygon(RegularStarShape),
    RegularPolygon(RegularPolygonShape),
}

impl Into<skia_safe::Path> for &Shape {
    fn into(self) -> skia_safe::Path {
        match self {
            Shape::RRect(shape) => build_rrect_path(&shape),
            Shape::SimplePolygon(shape) => build_simple_polygon_path(&shape),
            Shape::Ellipse(shape) => build_ellipse_path(&shape),
            Shape::EllipticalRingSector(shape) => build_ring_sector_path(&shape),
            Shape::EllipticalSector(shape) => build_sector_path(&shape),
            Shape::EllipticalRing(shape) => build_ring_path(&shape),
            Shape::RegularStarPolygon(shape) => build_star_path(&shape),
            Shape::RegularPolygon(shape) => build_regular_polygon_path(&shape),
        }
    }
}
