use crate::cg::types::*;
use crate::node::repository::NodeRepository;
use crate::node::schema::*;
use crate::painter::cvt;
use crate::sk::mappings::ToSkPath;
use crate::{cache::geometry::GeometryCache, path::*};
use math2::transform::AffineTransform;
use skia_safe::{
    path_effect::PathEffect, stroke_rec::InitStyle, Path, PathOp, Point, RRect, Rect, StrokeRec,
};

/// Computes the stroke geometry path for a given input `Path`, enabling rich stroke
/// rendering features such as image fills, gradients, and complex stroke alignment.
///
/// This function generates a *filled path* that visually represents the stroke outline,
/// based on stroke width, alignment, and optional dash pattern. The result can be used
/// with any fill-based rendering pipeline, e.g. image shaders, gradients, or masking.
///
/// # Parameters
///
/// - `source_path`: The original vector path to be stroked.
/// - `stroke_width`: The stroke width (measured in logical pixels).
/// - `stroke_align`: Controls how the stroke is aligned relative to the path.
///   - `StrokeAlign::Center`: Stroke is centered on the path (default Skia behavior).
///   - `StrokeAlign::Inside`: Stroke lies entirely inside the path boundary.
///   - `StrokeAlign::Outside`: Stroke lies entirely outside the path boundary.
/// - `stroke_dash_array`: Optional dash pattern (e.g., `[10.0, 4.0]` for 10 on, 4 off).
///
/// # Returns
///
/// A `Path` representing the stroke outline as a filled geometry. This path can be used
/// with image or gradient fills, or for clipping, hit-testing, or boolean operations.
///
/// # Behavior
///
/// - If `stroke_align` is not `Center`, the result uses boolean path operations to clip or subtract
///   the stroke geometry relative to the original path.
/// - If a dash array is provided, it is applied before stroking.
/// - If the path is empty or invalid, an empty `Path` is returned.
///
/// # Example
///
/// ```rust,ignore
/// let stroke_path = stroke_geometry(
///     &original_path,
///     4.0,
///     StrokeAlign::Inside,
///     Some(&vec![8.0, 4.0])
/// );
/// canvas.draw_path(&stroke_path, &image_paint);
/// ```
///
/// # See Also
///
/// - [`SkStrokeRec`](https://github.com/google/skia/blob/main/include/core/SkStrokeRec.h)
/// - [`SkPath::op`](https://github.com/google/skia/blob/main/include/core/SkPath.h)
/// - [`SkDashPathEffect`](https://github.com/google/skia/blob/main/include/effects/SkDashPathEffect.h)
pub fn stroke_geometry(
    source_path: &Path,
    stroke_width: f32,
    stroke_align: StrokeAlign,
    stroke_dash_array: Option<&Vec<f32>>,
) -> Path {
    use StrokeAlign::*;

    let adjusted_width = match stroke_align {
        Center => stroke_width,
        Inside => stroke_width * 2.0,  // we'll clip it later
        Outside => stroke_width * 2.0, // we'll subtract later
    };

    // Create a stroke record with the adjusted width
    let mut stroke_rec = StrokeRec::new(InitStyle::Hairline);
    stroke_rec.set_stroke_style(adjusted_width, false);

    // Apply dash effect if provided
    let mut path_to_stroke = source_path.clone();
    if let Some(dashes) = stroke_dash_array {
        if let Some(pe) = PathEffect::dash(dashes, 0.0) {
            if let Some((dashed, _)) =
                pe.filter_path(source_path, &stroke_rec, source_path.bounds())
            {
                path_to_stroke = dashed;
            }
        }
    }

    // Apply the stroke to create the outline
    let mut stroked_path = Path::new();
    if stroke_rec.apply_to_path(&mut stroked_path, &path_to_stroke) {
        match stroke_align {
            Center => stroked_path,
            Inside => {
                // Clip to original path: intersection
                if let Some(result) = Path::op(&stroked_path, source_path, PathOp::Intersect) {
                    result
                } else {
                    stroked_path
                }
            }
            Outside => {
                // Subtract original path from stroke outline
                if let Some(result) = Path::op(&stroked_path, source_path, PathOp::Difference) {
                    result
                } else {
                    stroked_path
                }
            }
        }
    } else {
        Path::new()
    }
}

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
        IntrinsicSizeNode::Rectangle(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if !r.is_zero() {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl.rx, r.tl.ry),
                        Point::new(r.tr.rx, r.tr.ry),
                        Point::new(r.br.rx, r.br.ry),
                        Point::new(r.bl.rx, r.bl.ry),
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
        IntrinsicSizeNode::Arc(n) => PainterShape::from_path(build_arc_path(n)),
        IntrinsicSizeNode::Polygon(n) => {
            let path = if n.corner_radius > 0.0 {
                n.to_sk_path()
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
        IntrinsicSizeNode::SVGPath(n) => {
            if let Some(path) = Path::from_svg(&n.data) {
                PainterShape::from_path(path)
            } else {
                // Fallback to empty rect if path is invalid
                PainterShape::from_rect(Rect::new(0.0, 0.0, 0.0, 0.0))
            }
        }
        IntrinsicSizeNode::Vector(n) => PainterShape::from_path(n.network.clone().into()),
        IntrinsicSizeNode::Container(n) => {
            let rect = Rect::from_xywh(0.0, 0.0, n.size.width, n.size.height);
            let r = n.corner_radius;
            if !r.is_zero() {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl.rx, r.tl.ry),
                        Point::new(r.tr.rx, r.tr.ry),
                        Point::new(r.br.rx, r.br.ry),
                        Point::new(r.bl.rx, r.bl.ry),
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
            if !r.is_zero() {
                let rrect = RRect::new_rect_radii(
                    rect,
                    &[
                        Point::new(r.tl.rx, r.tl.ry),
                        Point::new(r.tr.rx, r.tr.ry),
                        Point::new(r.br.rx, r.br.ry),
                        Point::new(r.bl.rx, r.bl.ry),
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
        IntrinsicSizeNode::TextSpan(n) => {
            // Text spans don't have a shape
            PainterShape::from_rect(Rect::new(0.0, 0.0, n.size.width, n.size.height))
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
        Node::Arc(n) => Some(build_shape(&IntrinsicSizeNode::Arc(n.clone()))),
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
    node: &BooleanPathOperationNode,
    repo: &NodeRepository,
    cache: &GeometryCache,
) -> Option<Path> {
    let world = cache
        .get_world_transform(&node.id)
        .unwrap_or_else(AffineTransform::identity);
    let inv = world.inverse().unwrap_or_else(AffineTransform::identity);

    let mut shapes_with_ops = Vec::new();

    for (i, child_id) in node.children.iter().enumerate() {
        if let Some(child_node) = repo.get(child_id) {
            let mut path = match child_node {
                Node::BooleanOperation(child_bool) => {
                    boolean_operation_path(child_bool, repo, cache)?
                }
                _ => build_shape_from_node(child_node)?.to_path(),
            };

            let child_world = cache
                .get_world_transform(child_id)
                .unwrap_or_else(AffineTransform::identity);
            let relative = inv.compose(&child_world);
            path.transform(&cvt::sk_matrix(relative.matrix));

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

    Some(merge_shapes(&shapes_with_ops))
}

/// Convenience wrapper around [`boolean_operation_path`] returning a [`PainterShape`].
pub fn boolean_operation_shape(
    node: &BooleanPathOperationNode,
    repo: &NodeRepository,
    cache: &GeometryCache,
) -> Option<PainterShape> {
    boolean_operation_path(node, repo, cache).map(PainterShape::from_path)
}
