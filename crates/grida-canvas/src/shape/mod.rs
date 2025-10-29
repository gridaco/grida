pub mod corner;
pub mod ellipse;
pub mod ellipse_ring;
pub mod ellipse_ring_sector;
pub mod ellipse_sector;
pub mod polygon;
pub mod rect;
pub mod regular_polygon;
pub mod regular_star;
pub mod rrect;
pub mod srrect_orthogonal;
pub mod stroke;
pub mod stroke_varwidth;
pub mod vector;

pub use corner::*;
pub use ellipse::*;
pub use ellipse_ring::*;
pub use ellipse_ring_sector::*;
pub use ellipse_sector::*;
pub use polygon::*;
pub use rect::*;
pub use regular_polygon::*;
pub use regular_star::*;
pub use rrect::*;
pub use srrect_orthogonal::*;
pub use stroke::*;
pub use stroke_varwidth::*;
pub use vector::*;

use crate::vectornetwork::*;

pub enum Shape {
    Rect(RectShape),
    RRect(RRectShape),
    OrthogonalSmoothRRect(OrthogonalSmoothRRectShape),
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
            Shape::Rect(shape) => shape.into(),
            Shape::RRect(shape) => build_rrect_path(&shape),
            Shape::OrthogonalSmoothRRect(shape) => build_orthogonal_smooth_rrect_path(&shape),
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

impl Into<VectorNetwork> for &Shape {
    fn into(self) -> VectorNetwork {
        match self {
            Shape::Rect(shape) => build_rect_vector_network(shape),
            Shape::RRect(shape) => build_rrect_vector_network(shape),
            Shape::OrthogonalSmoothRRect(shape) => {
                build_orthogonal_smooth_rrect_vector_network(shape)
            }
            Shape::SimplePolygon(shape) => build_simple_polygon_vector_network(shape),
            Shape::Ellipse(shape) => build_ellipse_vector_network(shape),
            Shape::EllipticalRingSector(_shape) => {
                todo!("Arc shape to vector network requires manual implementation")
            }
            Shape::EllipticalSector(_shape) => {
                todo!("Arc shape to vector network requires manual implementation")
            }
            Shape::EllipticalRing(shape) => build_ring_vector_network(shape),
            Shape::RegularStarPolygon(shape) => build_star_vector_network(shape),
            Shape::RegularPolygon(shape) => build_regular_polygon_vector_network(shape),
        }
    }
}
