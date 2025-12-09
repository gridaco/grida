//! Shape building for rendering
//!
//! ## Pipeline Guarantees
//!
//! This module guarantees:
//! - build_shape() requires resolved bounds from GeometryCache for all nodes
//! - V2 nodes (with auto-sizing) ALWAYS use provided bounds
//! - V1 nodes (fixed schema) use schema values (bounds parameter for future migration)
//! - Missing bounds when accessed is a PANIC (pipeline bug)

use crate::cg::prelude::*;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::*;
use crate::shape::*;
use crate::{cache::geometry::GeometryCache, sk};
use math2::rect::Rectangle;
use math2::transform::AffineTransform;
use skia_safe::{Path, RRect, Rect};

/// Internal universal Painter's shape abstraction for optimized drawing
/// Virtual nodes like Group, BooleanOperation are not Painter's shapes, they use different methods.
#[derive(Debug, Clone)]
pub struct PainterShape {
    pub rect: Rect,
    pub rect_shape: Option<Rect>,
    pub rrect: Option<RRect>,
    pub oval: Option<Rect>,
    pub path: Option<Path>,
}

impl PainterShape {
    pub fn empty() -> Self {
        Self {
            rect: Rect::new(0.0, 0.0, 0.0, 0.0),
            rect_shape: None,
            rrect: None,
            oval: None,
            path: None,
        }
    }
    /// Construct a plain rectangle shape
    pub fn from_rect(rect: impl Into<Rect>) -> Self {
        let r: Rect = rect.into();
        Self {
            rect: r,
            rect_shape: Some(r),
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

    pub fn from_shape(shape: &Shape) -> Self {
        match shape {
            Shape::Ellipse(shape) => {
                PainterShape::from_oval(Rect::from_xywh(0.0, 0.0, shape.width, shape.height))
            }
            Shape::Rect(shape) => {
                PainterShape::from_rect(Rect::from_xywh(0.0, 0.0, shape.width, shape.height))
            }
            Shape::RRect(shape) => PainterShape::from_rrect(shape.into()),
            _ => PainterShape::from_path(shape.into()),
        }
    }

    /// Extract corner radii from the shape
    ///
    /// Returns corner radii [top-left, top-right, bottom-right, bottom-left]
    /// for shapes that support them (RRect). Returns uniform zeros for other shapes.
    ///
    /// # Returns
    /// - For RRect: Actual corner radii extracted from the shape (uses x-radius)
    /// - For Rect, Oval, Path: [0.0, 0.0, 0.0, 0.0] (no rounded corners)
    pub fn corner_radii(&self) -> [f32; 4] {
        if let Some(rrect) = &self.rrect {
            // Extract radii from RRect using radii_ref()
            // Returns [UpperLeft, UpperRight, LowerRight, LowerLeft]
            let radii = rrect.radii_ref();
            [
                radii[0].x, // top-left (UpperLeft)
                radii[1].x, // top-right (UpperRight)
                radii[2].x, // bottom-right (LowerRight)
                radii[3].x, // bottom-left (LowerLeft)
            ]
        } else {
            // No rounded corners for other shape types
            [0.0, 0.0, 0.0, 0.0]
        }
    }

    pub fn to_path(&self) -> Path {
        if let Some(rect) = self.rect_shape {
            Path::rect(rect, None)
        } else if let Some(rrect) = &self.rrect {
            Path::rrect(rrect, None)
        } else if let Some(oval) = &self.oval {
            Path::oval(oval, None)
        } else if let Some(existing_path) = &self.path {
            existing_path.clone()
        } else {
            // Fallback to rect if no specific shape is set
            Path::rect(self.rect, None)
        }
    }

    pub fn is_closed(&self) -> bool {
        if let Some(path) = &self.path {
            path.is_last_contour_closed()
        } else {
            true
        }
    }
}

/// Build shape from node + resolved geometry
///
/// All dimensions come from bounds (resolved by GeometryCache).
/// This ensures V2 auto-sized nodes and future migrations render correctly.
pub fn build_shape(node: &Node, bounds: &Rectangle) -> PainterShape {
    match node {
        Node::Polygon(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        Node::RegularPolygon(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        Node::RegularStarPolygon(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        Node::Line(n) => PainterShape::from_path(Path::line((0.0, 0.0), (n.size.width, 0.0))),
        Node::Path(n) => {
            if let Some(path) = Path::from_svg(&n.data) {
                PainterShape::from_path(path)
            } else {
                // Fallback to empty rect if path is invalid
                PainterShape::from_rect(Rect::new(0.0, 0.0, 0.0, 0.0))
            }
        }
        Node::Vector(n) => {
            let path = n.to_path();
            PainterShape::from_path(path)
        }
        Node::Ellipse(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        Node::Rectangle(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        Node::Container(n) => {
            // ALWAYS use resolved bounds from GeometryCache
            let width = bounds.width;
            let height = bounds.height;

            let r = n.corner_radius;
            if !r.is_zero() {
                // Check if corner smoothing is enabled
                if n.corner_smoothing.value() > 0.0 {
                    let smooth = OrthogonalSmoothRRectShape {
                        width,
                        height,
                        corner_radius: n.corner_radius,
                        corner_smoothing: n.corner_smoothing,
                    };
                    PainterShape::from_path(build_orthogonal_smooth_rrect_path(&smooth))
                } else {
                    let rrect = build_rrect(&RRectShape {
                        width,
                        height,
                        corner_radius: n.corner_radius,
                    });
                    PainterShape::from_rrect(rrect)
                }
            } else {
                let rect = Rect::from_xywh(0.0, 0.0, width, height);
                PainterShape::from_rect(rect)
            }
        }
        Node::Image(n) => {
            let r = n.corner_radius;
            if !r.is_zero() {
                // Check if corner smoothing is enabled
                if n.corner_smoothing.value() > 0.0 {
                    let smooth = OrthogonalSmoothRRectShape {
                        width: n.size.width,
                        height: n.size.height,
                        corner_radius: r,
                        corner_smoothing: n.corner_smoothing,
                    };
                    PainterShape::from_path(build_orthogonal_smooth_rrect_path(&smooth))
                } else {
                    let rrect = build_rrect(&n.to_own_shape());
                    PainterShape::from_rrect(rrect)
                }
            } else {
                let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
                PainterShape::from_rect(rect)
            }
        }
        Node::Error(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            PainterShape::from_rect(rect)
        }
        // Non-shape nodes (Group, BooleanOperation, InitialContainer, TextSpan)
        _ => PainterShape::from_rect(Rect::new(0.0, 0.0, 0.0, 0.0)),
    }
}

/// Merges multiple shapes into a single path using boolean operations.
///
/// This function takes a list of shapes and their corresponding boolean operations,
/// and merges them into a single path. The first shape is used as the base,
/// and subsequent shapes are combined using the specified operations.
///
/// # Parameters
///
/// - `shapes`: A slice of tuples containing (PainterShape, BooleanPathOperation)
///   The first shape is used as the base, subsequent shapes are combined with the base
///   using their respective operations.
///
/// # Returns
///
/// A merged `Path` representing the result of all boolean operations.
/// If no shapes are provided, returns an empty path.
///
/// # Example
///
/// ```rust,ignore
/// let shapes = vec![
///     (shape1, BooleanPathOperation::Union),
///     (shape2, BooleanPathOperation::Intersection),
/// ];
/// let merged_path = merge_shapes(&shapes);
/// ```
pub fn merge_shapes(shapes: &[(PainterShape, BooleanPathOperation)]) -> Path {
    if shapes.is_empty() {
        return Path::new();
    }

    let mut result = shapes[0].0.to_path();

    for (shape, operation) in shapes.iter().skip(1) {
        let shape_path = shape.to_path();
        if let Some(merged) = Path::op(&result, &shape_path, (*operation).into()) {
            result = merged;
        }
    }

    result
}

/// Compute the resulting path for a [`BooleanPathOperationNode`] in its local coordinate space.
pub fn boolean_operation_path(
    id: &NodeId,
    node: &BooleanPathOperationNodeRec,
    graph: &SceneGraph,
    cache: &GeometryCache,
) -> Option<Path> {
    let world = cache
        .get_world_transform(id)
        .unwrap_or_else(AffineTransform::identity);
    let inv = world.inverse().unwrap_or_else(AffineTransform::identity);

    let mut shapes_with_ops = Vec::new();

    let children = graph.get_children(id)?;
    for (i, child_id) in children.iter().enumerate() {
        if let Ok(child_node) = graph.get_node(child_id) {
            let mut path = match child_node {
                Node::BooleanOperation(child_bool) => {
                    boolean_operation_path(child_id, child_bool, graph, cache)?
                }
                _ => {
                    // Get bounds from geometry cache - guaranteed to exist
                    let bounds = cache
                        .get_world_bounds(child_id)
                        .expect("Geometry must exist for all nodes");
                    let intrinsic = match child_node {
                        Node::Rectangle(n) => Node::Rectangle(n.clone()),
                        Node::Ellipse(n) => Node::Ellipse(n.clone()),
                        Node::Polygon(n) => Node::Polygon(n.clone()),
                        Node::RegularPolygon(n) => Node::RegularPolygon(n.clone()),
                        Node::RegularStarPolygon(n) => Node::RegularStarPolygon(n.clone()),
                        Node::Line(n) => Node::Line(n.clone()),
                        Node::Path(n) => Node::Path(n.clone()),
                        Node::Vector(n) => Node::Vector(n.clone()),
                        Node::Image(n) => Node::Image(n.clone()),
                        Node::Container(n) => Node::Container(n.clone()),
                        Node::Error(n) => Node::Error(n.clone()),
                        _ => return None, // Non-shape nodes
                    };
                    build_shape(&intrinsic, &bounds).to_path()
                }
            };

            let child_world = cache
                .get_world_transform(child_id)
                .unwrap_or_else(AffineTransform::identity);
            let relative = inv.compose(&child_world);
            path = path.make_transform(&sk::sk_matrix(relative.matrix));

            let op = if i == 0 {
                BooleanPathOperation::Union
            } else {
                node.op
            };
            shapes_with_ops.push((PainterShape::from_path(path), op));
        }
    }

    if shapes_with_ops.is_empty() {
        return None;
    }

    let path = merge_shapes(&shapes_with_ops);
    let path = if let Some(r) = node.corner_radius {
        if r > 0.0 {
            build_corner_radius_path(&path, r)
        } else {
            path
        }
    } else {
        path
    };

    Some(path)
}

/// Convenience wrapper around [`boolean_operation_path`] returning a [`PainterShape`].
pub fn boolean_operation_shape(
    id: &NodeId,
    node: &BooleanPathOperationNodeRec,
    graph: &SceneGraph,
    cache: &GeometryCache,
) -> Option<PainterShape> {
    boolean_operation_path(id, node, graph, cache).map(PainterShape::from_path)
}
