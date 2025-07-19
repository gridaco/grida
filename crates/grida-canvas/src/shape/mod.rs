pub mod arc;
pub mod polygon;
pub mod ring;
pub mod rpolygon;
pub mod star;
pub mod vn;

pub use arc::*;
pub use polygon::*;
pub use ring::*;
pub use rpolygon::*;
pub use star::*;
pub use vn::*;

pub enum Shape {
    SimplePolygon(SimplePolygonShape),
    EllipticalArc(EllipticalArcShape),
    EllipticalRing(EllipticalRingShape),
    EllipticalRegularStar(EllipticalRegularStarShape),
    EllipticalRegularPolygon(EllipticalRegularPolygonShape),
}
