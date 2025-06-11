use crate::node::schema::*;
use skia_safe::{Path, Point, RRect, Rect};

/// Internal universal Painter's shape abstraction for optimized drawing
/// Virtual nodes like Group, BooleanOperation are not Painter's shapes, they use different methods.
pub struct PainterShape {
    pub rect: Rect,
    pub rect_shape: Option<Rect>,
    pub rrect: Option<RRect>,
    pub oval: Option<Rect>,
    pub path: Option<Path>,
}

impl PainterShape {
    /// Construct a plain rectangle shape
    pub fn from_rect(rect: Rect) -> Self {
        Self {
            rect,
            rect_shape: Some(rect),
            rrect: None,
            oval: None,
            path: None,
        }
    }
    /// Construct a rounded rectangle shape
    pub fn from_rrect(rrect: RRect) -> Self {
        Self {
            rect: rrect.rect().clone(),
            rect_shape: None,
            rrect: Some(rrect),
            oval: None,
            path: None,
        }
    }
    /// Construct an oval/ellipse shape
    pub fn from_oval(rect: Rect) -> Self {
        Self {
            rect,
            rect_shape: None,
            rrect: None,
            oval: Some(rect),
            path: None,
        }
    }
    /// Construct a path-based shape (bounding rect must be provided)
    pub fn from_path(path: Path) -> Self {
        Self {
            rect: path.bounds().clone(),
            rect_shape: None,
            rrect: None,
            oval: None,
            path: Some(path),
        }
    }

    pub fn to_path(&self) -> Path {
        let mut path = Path::new();

        if let Some(rect) = self.rect_shape {
            path.add_rect(rect, None);
        } else if let Some(rrect) = &self.rrect {
            path.add_rrect(rrect, None);
        } else if let Some(oval) = &self.oval {
            path.add_oval(oval, None);
        } else if let Some(existing_path) = &self.path {
            path = existing_path.clone();
        } else {
            // Fallback to rect if no specific shape is set
            path.add_rect(self.rect, None);
        }

        path
    }
}

pub fn build_shape(node: &IntrinsicSizeNode) -> PainterShape {
    match node {
        IntrinsicSizeNode::Rectangle(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if !r.is_zero() {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl, r.tl),
                        Point::new(r.tr, r.tr),
                        Point::new(r.br, r.br),
                        Point::new(r.bl, r.bl),
                    ],
                );
                PainterShape::from_rrect(rrect)
            } else {
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Ellipse(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            PainterShape::from_oval(rect)
        }
        IntrinsicSizeNode::Polygon(n) => {
            let path = if n.corner_radius > 0.0 {
                n.to_path()
            } else {
                let mut p = Path::new();
                let mut iter = n.points.iter();
                if let Some(&pt) = iter.next() {
                    p.move_to((pt.x, pt.y));
                    for &pt in iter {
                        p.line_to((pt.x, pt.y));
                    }
                    p.close();
                }
                p
            };
            PainterShape::from_path(path)
        }
        IntrinsicSizeNode::RegularPolygon(n) => {
            let poly = n.to_polygon();
            build_shape(&IntrinsicSizeNode::Polygon(poly))
        }
        IntrinsicSizeNode::RegularStarPolygon(n) => {
            let poly = n.to_polygon();
            build_shape(&IntrinsicSizeNode::Polygon(poly))
        }
        IntrinsicSizeNode::Line(n) => {
            let mut path = Path::new();
            path.move_to((0.0, 0.0));
            path.line_to((n.size.width, 0.0));
            PainterShape::from_path(path)
        }
        IntrinsicSizeNode::Path(n) => {
            if let Some(path) = Path::from_svg(&n.data) {
                PainterShape::from_path(path)
            } else {
                // Fallback to empty rect if path is invalid
                PainterShape::from_rect(Rect::new(0.0, 0.0, 0.0, 0.0))
            }
        }
        IntrinsicSizeNode::Container(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if r.tl > 0.0 || r.tr > 0.0 || r.bl > 0.0 || r.br > 0.0 {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl, r.tl),
                        Point::new(r.tr, r.tr),
                        Point::new(r.br, r.br),
                        Point::new(r.bl, r.bl),
                    ],
                );
                PainterShape::from_rrect(rrect)
            } else {
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Image(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if r.tl > 0.0 || r.tr > 0.0 || r.bl > 0.0 || r.br > 0.0 {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl, r.tl),
                        Point::new(r.tr, r.tr),
                        Point::new(r.br, r.br),
                        Point::new(r.bl, r.bl),
                    ],
                );
                PainterShape::from_rrect(rrect)
            } else {
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Error(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            PainterShape::from_rect(rect)
        }
        IntrinsicSizeNode::TextSpan(_) => {
            // Text spans don't have a shape
            PainterShape::from_rect(Rect::new(0.0, 0.0, 0.0, 0.0))
        }
    }
}
