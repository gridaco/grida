use crate::node::schema::{IntrinsicSizeNode, Node, NodeId, Scene};
use crate::repository::NodeRepository;
use math2::rect;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;
use std::collections::HashMap;

/// Geometry data used for layout, culling, and rendering.
///
/// `local_bounds` and `world_bounds` represent the tight geometry bounds of the shape.
/// `render_bounds` includes visual overflow from effects such as blur, stroke, or shadows,
/// and is used for visibility culling and picture recording regions.
///
/// All bounds are updated during geometry cache construction and reused throughout the pipeline.
#[derive(Debug, Clone)]
pub struct GeometryEntry {
    /// relative transform
    pub transform: AffineTransform,
    /// absolute (world) transform
    pub absolute_transform: AffineTransform,
    /// relative AABB (after the transform is applied)
    pub bounding_box: Rectangle,
    /// absolute (world) AABB (after the transform is applied)
    pub absolute_bounding_box: Rectangle,
    /// Expanded bounds that include visual effects like blur, shadow, stroke, etc.
    /// Used for render-time culling and picture recording.
    #[deprecated(note = "TODO: Not ready")]
    pub absolute_render_bounds: Rectangle,
    pub parent: Option<NodeId>,
    pub dirty_transform: bool,
    pub dirty_bounds: bool,
}

#[derive(Debug, Clone)]
pub struct GeometryCache {
    entries: HashMap<NodeId, GeometryEntry>,
}

impl GeometryCache {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    pub fn from_scene(scene: &Scene) -> Self {
        let mut cache = Self::new();
        let root_world = scene.transform;
        for child in &scene.children {
            Self::build_recursive(child, &scene.nodes, &root_world, None, &mut cache);
        }
        cache
    }

    fn build_recursive(
        id: &NodeId,
        repo: &NodeRepository,
        parent_world: &AffineTransform,
        parent_id: Option<NodeId>,
        cache: &mut GeometryCache,
    ) -> Rectangle {
        let node = repo.get(id).expect("node not found");

        // only IntrinsicSizeNode is supported for now
        match node {
            Node::Group(n) => {
                let mut union_bounds: Option<Rectangle> = None;
                for child_id in &n.children {
                    let child_bounds = Self::build_recursive(
                        child_id,
                        repo,
                        parent_world,
                        Some(id.clone()),
                        cache,
                    );
                    union_bounds = match union_bounds {
                        Some(b) => Some(rect::union(&[b, child_bounds])),
                        None => Some(child_bounds),
                    };
                }
                union_bounds.unwrap_or_else(|| Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                })
            }
            Node::BooleanOperation(n) => {
                let mut union_bounds: Option<Rectangle> = None;
                for child_id in &n.children {
                    let child_bounds = Self::build_recursive(
                        child_id,
                        repo,
                        parent_world,
                        Some(id.clone()),
                        cache,
                    );
                    union_bounds = match union_bounds {
                        Some(b) => Some(rect::union(&[b, child_bounds])),
                        None => Some(child_bounds),
                    };
                }
                union_bounds.unwrap_or_else(|| Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                })
            }
            _ => {
                let intrinsic_node = Box::new(match node {
                    Node::Path(n) => IntrinsicSizeNode::Path(n.clone()),
                    Node::Rectangle(n) => IntrinsicSizeNode::Rectangle(n.clone()),
                    Node::Ellipse(n) => IntrinsicSizeNode::Ellipse(n.clone()),
                    Node::Polygon(n) => IntrinsicSizeNode::Polygon(n.clone()),
                    Node::RegularPolygon(n) => IntrinsicSizeNode::RegularPolygon(n.clone()),
                    Node::RegularStarPolygon(n) => IntrinsicSizeNode::RegularStarPolygon(n.clone()),
                    Node::Line(n) => IntrinsicSizeNode::Line(n.clone()),
                    Node::TextSpan(n) => IntrinsicSizeNode::TextSpan(n.clone()),
                    Node::Image(n) => IntrinsicSizeNode::Image(n.clone()),
                    Node::Container(n) => IntrinsicSizeNode::Container(n.clone()),
                    Node::Error(n) => IntrinsicSizeNode::Error(n.clone()),
                    Node::Group(_) | Node::BooleanOperation(_) => panic!("Unsupported node type"),
                });
                let node = intrinsic_node.as_ref();

                let (local_transform, local_bounds) = node_geometry(node);
                let world_transform = parent_world.compose(&local_transform);
                let world_bounds = transform_rect(&local_bounds, &world_transform);
                // For now, render_bounds is just world_bounds (placeholder)
                let render_bounds = world_bounds;

                let entry = GeometryEntry {
                    transform: local_transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id.clone(),
                    dirty_transform: false,
                    dirty_bounds: false,
                };

                cache.entries.insert(id.clone(), entry.clone());
                entry.absolute_bounding_box
            }
        }
    }

    pub fn get_world_transform(&self, id: &NodeId) -> Option<AffineTransform> {
        self.entries.get(id).map(|e| e.absolute_transform)
    }

    pub fn get_world_bounds(&self, id: &NodeId) -> Option<Rectangle> {
        self.entries.get(id).map(|e| e.absolute_bounding_box)
    }

    /// Return expanded render bounds for a node if available.
    pub fn get_render_bounds(&self, id: &NodeId) -> Option<Rectangle> {
        self.entries.get(id).map(|e| e.absolute_render_bounds)
    }
}

fn node_geometry(node: &IntrinsicSizeNode) -> (AffineTransform, Rectangle) {
    match node {
        IntrinsicSizeNode::Error(n) => (n.transform, n.rect()),
        IntrinsicSizeNode::Container(n) => (n.transform, n.rect()),
        IntrinsicSizeNode::Rectangle(n) => (n.transform, n.rect()),
        IntrinsicSizeNode::Ellipse(n) => (n.transform, n.rect()),
        IntrinsicSizeNode::Polygon(n) => (n.transform, polygon_bounds(&n.points)),
        IntrinsicSizeNode::RegularPolygon(n) => (n.transform, n.rect()),
        IntrinsicSizeNode::RegularStarPolygon(n) => (n.transform, n.rect()),
        IntrinsicSizeNode::Line(n) => (
            n.transform,
            Rectangle {
                x: 0.0,
                y: 0.0,
                width: n.size.width,
                height: 0.0,
            },
        ),
        IntrinsicSizeNode::TextSpan(n) => (
            n.transform,
            Rectangle {
                x: 0.0,
                y: 0.0,
                width: n.size.width,
                height: n.size.height,
            },
        ),
        IntrinsicSizeNode::Path(n) => (n.transform, path_bounds(&n.data)),
        IntrinsicSizeNode::Image(n) => (n.transform, n.rect()),
    }
}

fn transform_rect(rect: &Rectangle, t: &AffineTransform) -> Rectangle {
    rect::transform(*rect, t)
}

fn polygon_bounds(points: &[crate::node::schema::Point]) -> Rectangle {
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for p in points {
        min_x = min_x.min(p.x);
        min_y = min_y.min(p.y);
        max_x = max_x.max(p.x);
        max_y = max_y.max(p.y);
    }
    if points.is_empty() {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        }
    } else {
        Rectangle {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
        }
    }
}

fn path_bounds(data: &str) -> Rectangle {
    if let Some(path) = skia_safe::path::Path::from_svg(data) {
        let b = path.compute_tight_bounds();
        Rectangle {
            x: b.left(),
            y: b.top(),
            width: b.width(),
            height: b.height(),
        }
    } else {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        }
    }
}
