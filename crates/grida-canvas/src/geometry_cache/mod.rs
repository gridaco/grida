use crate::rect::Rect;
use crate::repository::NodeRepository;
use crate::schema::{Node, NodeId, Scene};
use math2::transform::AffineTransform;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct GeometryEntry {
    pub local_transform: AffineTransform,
    pub world_transform: AffineTransform,
    pub local_bounds: Rect,
    pub world_bounds: Rect,
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
    ) -> Rect {
        let node = repo.get(id).expect("node not found");
        let (local_transform, local_bounds, children) = Self::node_data(node);
        let world_transform = parent_world.compose(&local_transform);
        let world_bounds = Self::transform_rect(&local_bounds, &world_transform);

        let mut entry = GeometryEntry {
            local_transform,
            world_transform,
            local_bounds,
            world_bounds,
            parent: parent_id.clone(),
            dirty_transform: false,
            dirty_bounds: false,
        };

        let mut union_bounds = if world_bounds.width() > 0.0 || world_bounds.height() > 0.0 {
            Some(world_bounds)
        } else {
            None
        };

        for child_id in children {
            let child_bounds = Self::build_recursive(
                &child_id,
                repo,
                &entry.world_transform,
                Some(id.clone()),
                cache,
            );
            union_bounds = match union_bounds {
                Some(b) => Some(b.union(&child_bounds)),
                None => Some(child_bounds),
            };
        }

        if let Some(b) = union_bounds {
            entry.world_bounds = b;
        }

        cache.entries.insert(id.clone(), entry.clone());
        entry.world_bounds
    }

    fn node_data(node: &Node) -> (AffineTransform, Rect, Vec<NodeId>) {
        match node {
            Node::Error(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                Vec::new(),
            ),
            Node::Group(n) => (
                n.transform,
                Rect::new(0.0, 0.0, 0.0, 0.0),
                n.children.clone(),
            ),
            Node::Container(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                n.children.clone(),
            ),
            Node::Rectangle(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                Vec::new(),
            ),
            Node::Ellipse(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                Vec::new(),
            ),
            Node::Polygon(n) => (n.transform, Self::polygon_bounds(&n.points), Vec::new()),
            Node::RegularPolygon(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                Vec::new(),
            ),
            Node::RegularStarPolygon(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                Vec::new(),
            ),
            Node::Line(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                Vec::new(),
            ),
            Node::TextSpan(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                Vec::new(),
            ),
            Node::Path(n) => (n.transform, Self::path_bounds(&n.data), Vec::new()),
            Node::BooleanOperation(n) => (
                n.transform,
                Rect::new(0.0, 0.0, 0.0, 0.0),
                n.children.clone(),
            ),
            Node::Image(n) => (
                n.transform,
                Rect::new(0.0, 0.0, n.size.width, n.size.height),
                Vec::new(),
            ),
        }
    }

    fn polygon_bounds(points: &[crate::schema::Point]) -> Rect {
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
            Rect::new(0.0, 0.0, 0.0, 0.0)
        } else {
            Rect {
                min_x,
                min_y,
                max_x,
                max_y,
            }
        }
    }

    fn path_bounds(data: &str) -> Rect {
        if let Some(path) = skia_safe::path::Path::from_svg(data) {
            let b = path.compute_tight_bounds();
            Rect::new(b.left(), b.top(), b.width(), b.height())
        } else {
            Rect::new(0.0, 0.0, 0.0, 0.0)
        }
    }

    fn transform_point(t: &AffineTransform, x: f32, y: f32) -> (f32, f32) {
        let [[a, c, tx], [b, d, ty]] = t.matrix;
        let nx = a * x + c * y + tx;
        let ny = b * x + d * y + ty;
        (nx, ny)
    }

    fn transform_rect(rect: &Rect, t: &AffineTransform) -> Rect {
        let (x0, y0) = Self::transform_point(t, rect.min_x, rect.min_y);
        let (x1, y1) = Self::transform_point(t, rect.max_x, rect.min_y);
        let (x2, y2) = Self::transform_point(t, rect.min_x, rect.max_y);
        let (x3, y3) = Self::transform_point(t, rect.max_x, rect.max_y);
        let min_x = x0.min(x1.min(x2.min(x3)));
        let min_y = y0.min(y1.min(y2.min(y3)));
        let max_x = x0.max(x1.max(x2.max(x3)));
        let max_y = y0.max(y1.max(y2.max(y3)));
        Rect {
            min_x,
            min_y,
            max_x,
            max_y,
        }
    }

    pub fn get_world_transform(&self, id: &NodeId) -> Option<AffineTransform> {
        self.entries.get(id).map(|e| e.world_transform)
    }

    pub fn get_world_bounds(&self, id: &NodeId) -> Option<Rect> {
        self.entries.get(id).map(|e| e.world_bounds)
    }
}
