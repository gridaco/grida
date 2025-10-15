use crate::cg::types::*;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::*;
use crate::shape::*;
use crate::{cache::geometry::GeometryCache, sk};
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
            _ => PainterShape::from_path(shape.into()),
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

    pub fn is_closed(&self) -> bool {
        if let Some(path) = &self.path {
            path.is_last_contour_closed()
        } else {
            true
        }
    }
}

pub fn build_shape(node: &IntrinsicSizeNode) -> PainterShape {
    match node {
        IntrinsicSizeNode::Polygon(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        IntrinsicSizeNode::RegularPolygon(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        IntrinsicSizeNode::RegularStarPolygon(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        IntrinsicSizeNode::Line(n) => {
            let mut path = Path::new();
            path.move_to((0.0, 0.0));
            path.line_to((n.size.width, 0.0));
            PainterShape::from_path(path)
        }
        IntrinsicSizeNode::SVGPath(n) => {
            if let Some(path) = Path::from_svg(&n.data) {
                PainterShape::from_path(path)
            } else {
                // Fallback to empty rect if path is invalid
                PainterShape::from_rect(Rect::new(0.0, 0.0, 0.0, 0.0))
            }
        }
        IntrinsicSizeNode::Vector(n) => {
            let path = n.to_path();
            PainterShape::from_path(path)
        }
        IntrinsicSizeNode::Ellipse(n) => {
            let shape = n.to_shape();
            PainterShape::from_shape(&shape)
        }
        IntrinsicSizeNode::Rectangle(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if !r.is_zero() {
                let rrect = build_rrect(&n.to_own_shape());
                PainterShape::from_rrect(rrect)
            } else {
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Container(n) => {
            let r = n.corner_radius;
            if !r.is_zero() {
                let rrect = build_rrect(&n.to_own_shape());
                PainterShape::from_rrect(rrect)
            } else {
                let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Image(n) => {
            let r = n.corner_radius;
            if !r.is_zero() {
                let rrect = build_rrect(&n.to_own_shape());
                PainterShape::from_rrect(rrect)
            } else {
                let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
                PainterShape::from_rect(rect)
            }
        }
        IntrinsicSizeNode::Error(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            PainterShape::from_rect(rect)
        }
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

/// Build a [`PainterShape`] for a node if it has intrinsic geometry.
pub fn build_shape_from_node(node: &Node) -> Option<PainterShape> {
    match node {
        Node::Rectangle(n) => Some(build_shape(&IntrinsicSizeNode::Rectangle(n.clone()))),
        Node::Ellipse(n) => Some(build_shape(&IntrinsicSizeNode::Ellipse(n.clone()))),
        Node::Polygon(n) => Some(build_shape(&IntrinsicSizeNode::Polygon(n.clone()))),
        Node::RegularPolygon(n) => Some(build_shape(&IntrinsicSizeNode::RegularPolygon(n.clone()))),
        Node::RegularStarPolygon(n) => Some(build_shape(&IntrinsicSizeNode::RegularStarPolygon(
            n.clone(),
        ))),
        Node::Line(n) => Some(build_shape(&IntrinsicSizeNode::Line(n.clone()))),
        Node::SVGPath(n) => Some(build_shape(&IntrinsicSizeNode::SVGPath(n.clone()))),
        Node::Image(n) => Some(build_shape(&IntrinsicSizeNode::Image(n.clone()))),
        Node::Error(n) => Some(build_shape(&IntrinsicSizeNode::Error(n.clone()))),
        _ => None,
    }
}

/// Compute the resulting path for a [`BooleanPathOperationNode`] in its local coordinate space.
pub fn boolean_operation_path(
    node: &BooleanPathOperationNodeRec,
    graph: &SceneGraph,
    cache: &GeometryCache,
) -> Option<Path> {
    let world = cache
        .get_world_transform(&node.id)
        .unwrap_or_else(AffineTransform::identity);
    let inv = world.inverse().unwrap_or_else(AffineTransform::identity);

    let mut shapes_with_ops = Vec::new();

    let children = graph.get_children(&node.id)?;
    for (i, child_id) in children.iter().enumerate() {
        if let Ok(child_node) = graph.get_node(child_id) {
            let mut path = match child_node {
                Node::BooleanOperation(child_bool) => {
                    boolean_operation_path(child_bool, graph, cache)?
                }
                _ => build_shape_from_node(child_node)?.to_path(),
            };

            let child_world = cache
                .get_world_transform(child_id)
                .unwrap_or_else(AffineTransform::identity);
            let relative = inv.compose(&child_world);
            path.transform(&sk::sk_matrix(relative.matrix));

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
    node: &BooleanPathOperationNodeRec,
    graph: &SceneGraph,
    cache: &GeometryCache,
) -> Option<PainterShape> {
    boolean_operation_path(node, graph, cache).map(PainterShape::from_path)
}
