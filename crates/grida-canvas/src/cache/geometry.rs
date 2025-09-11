use crate::cache::paragraph::ParagraphCache;
use crate::cg::types::*;
use crate::node::repository::NodeRepository;
use crate::node::schema::{
    IntrinsicSizeNode, LayerEffects, Node, NodeGeometryMixin, NodeId, Scene,
};
use crate::runtime::repository::FontRepository;
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
        Self::from_scene_with_paragraph_cache(
            scene,
            &mut ParagraphCache::new(),
            &FontRepository::new(),
        )
    }

    pub fn from_scene_with_paragraph_cache(
        scene: &Scene,
        paragraph_cache: &mut ParagraphCache,
        fonts: &FontRepository,
    ) -> Self {
        let mut cache = Self::new();
        let root_world = AffineTransform::identity();
        for child in &scene.children {
            Self::build_recursive(
                child,
                &scene.nodes,
                &root_world,
                None,
                &mut cache,
                paragraph_cache,
                fonts,
            );
        }
        cache
    }

    fn build_recursive(
        id: &NodeId,
        repo: &NodeRepository,
        parent_world: &AffineTransform,
        parent_id: Option<NodeId>,
        cache: &mut GeometryCache,
        paragraph_cache: &mut ParagraphCache,
        fonts: &FontRepository,
    ) -> Rectangle {
        let node = repo
            .get(id)
            .expect(&format!("node not found in geometry cache {id:?}"));

        match node {
            Node::Group(n) => {
                let world_transform = parent_world.compose(&n.transform.unwrap_or_default());
                let mut union_bounds: Option<Rectangle> = None;
                let mut union_render_bounds: Option<Rectangle> = None;
                for child_id in &n.children {
                    let child_bounds = Self::build_recursive(
                        child_id,
                        repo,
                        &world_transform,
                        Some(id.clone()),
                        cache,
                        paragraph_cache,
                        fonts,
                    );
                    union_bounds = match union_bounds {
                        Some(b) => Some(rect::union(&[b, child_bounds])),
                        None => Some(child_bounds),
                    };
                    if let Some(rb) = cache.get_render_bounds(child_id) {
                        union_render_bounds = match union_render_bounds {
                            Some(b) => Some(rect::union(&[b, rb])),
                            None => Some(rb),
                        };
                    }
                }

                let world_bounds = union_bounds.unwrap_or_else(|| Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                });

                let local_bounds = if let Some(inv) = world_transform.inverse() {
                    transform_rect(&world_bounds, &inv)
                } else {
                    Rectangle {
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        height: 0.0,
                    }
                };

                let render_bounds = union_render_bounds.unwrap_or(world_bounds);

                let entry = GeometryEntry {
                    transform: n.transform.unwrap_or_default(),
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
            Node::BooleanOperation(n) => {
                let world_transform = parent_world.compose(&n.transform.unwrap_or_default());
                let mut union_bounds: Option<Rectangle> = None;
                for child_id in &n.children {
                    let child_bounds = Self::build_recursive(
                        child_id,
                        repo,
                        &world_transform,
                        Some(id.clone()),
                        cache,
                        paragraph_cache,
                        fonts,
                    );
                    union_bounds = match union_bounds {
                        Some(b) => Some(rect::union(&[b, child_bounds])),
                        None => Some(child_bounds),
                    };
                }

                let world_bounds = union_bounds.unwrap_or_else(|| Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                });

                let local_bounds = if let Some(inv) = world_transform.inverse() {
                    transform_rect(&world_bounds, &inv)
                } else {
                    Rectangle {
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        height: 0.0,
                    }
                };

                let render_bounds = compute_render_bounds_from_style(
                    world_bounds,
                    if n.stroke.is_some() {
                        n.stroke_width
                    } else {
                        0.0
                    },
                    n.stroke_align,
                    &n.effects,
                );

                let entry = GeometryEntry {
                    transform: n.transform.unwrap_or_default(),
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
            Node::Container(n) => {
                let local_transform = n.transform;
                let world_transform = parent_world.compose(&local_transform);
                let local_bounds = n.rect();
                let world_bounds = transform_rect(&local_bounds, &world_transform);
                let mut union_world_bounds = world_bounds;
                let render_bounds = compute_render_bounds_from_style(
                    world_bounds,
                    if n.has_stroke_geometry() {
                        n.stroke_width
                    } else {
                        0.0
                    },
                    n.stroke_align,
                    &n.effects,
                );

                for child_id in &n.children {
                    let child_bounds = Self::build_recursive(
                        child_id,
                        repo,
                        &world_transform,
                        Some(id.clone()),
                        cache,
                        paragraph_cache,
                        fonts,
                    );
                    union_world_bounds = rect::union(&[union_world_bounds, child_bounds]);
                }

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

                union_world_bounds
            }
            Node::TextSpan(n) => {
                // Get final measured metrics from cache
                let measurements = paragraph_cache.measure(
                    &n.text,
                    &n.text_style,
                    &n.text_align,
                    &n.max_lines,
                    &n.ellipsis,
                    n.width,
                    fonts,
                    Some(&n.id),
                );

                // Create intrinsic bounds (starting at origin, like other nodes)
                /// TODO: Remove this hack to support 0 value visibility
                const MIN_SIZE_DIRTY_HACK: f32 = 1.0;
                let intrinsic_bounds = Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: measurements.max_width.max(MIN_SIZE_DIRTY_HACK),
                    height: n
                        .height
                        .unwrap_or(measurements.height)
                        .max(MIN_SIZE_DIRTY_HACK),
                };

                // Use the node's transform directly (which already includes positioning)
                let local_transform = n.transform;
                let world_transform = parent_world.compose(&local_transform);
                let world_bounds = transform_rect(&intrinsic_bounds, &world_transform);
                let render_bounds = compute_render_bounds(node, world_bounds);

                let entry = GeometryEntry {
                    transform: local_transform,
                    absolute_transform: world_transform,
                    bounding_box: intrinsic_bounds,
                    absolute_bounding_box: world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id.clone(),
                    dirty_transform: false,
                    dirty_bounds: false,
                };
                cache.entries.insert(id.clone(), entry.clone());

                intrinsic_bounds
            }
            _ => {
                let intrinsic_node = Box::new(match node {
                    Node::SVGPath(n) => IntrinsicSizeNode::SVGPath(n.clone()),
                    Node::Vector(n) => IntrinsicSizeNode::Vector(n.clone()),
                    Node::Rectangle(n) => IntrinsicSizeNode::Rectangle(n.clone()),
                    Node::Ellipse(n) => IntrinsicSizeNode::Ellipse(n.clone()),
                    Node::Polygon(n) => IntrinsicSizeNode::Polygon(n.clone()),
                    Node::RegularPolygon(n) => IntrinsicSizeNode::RegularPolygon(n.clone()),
                    Node::RegularStarPolygon(n) => IntrinsicSizeNode::RegularStarPolygon(n.clone()),
                    Node::Line(n) => IntrinsicSizeNode::Line(n.clone()),
                    Node::Image(n) => IntrinsicSizeNode::Image(n.clone()),
                    Node::Container(n) => IntrinsicSizeNode::Container(n.clone()),
                    Node::Error(n) => IntrinsicSizeNode::Error(n.clone()),
                    Node::TextSpan(_) | Node::Group(_) | Node::BooleanOperation(_) => {
                        unreachable!()
                    }
                });
                let intrinsic = intrinsic_node.as_ref();

                let (local_transform, local_bounds) = node_geometry(intrinsic);
                let world_transform = parent_world.compose(&local_transform);
                let world_bounds = transform_rect(&local_bounds, &world_transform);
                let render_bounds = compute_render_bounds(node, world_bounds);

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

    pub fn get_world_transform(&self, id: &str) -> Option<AffineTransform> {
        self.entries.get(id).map(|e| e.absolute_transform)
    }

    pub fn get_world_bounds(&self, id: &str) -> Option<Rectangle> {
        self.entries.get(id).map(|e| e.absolute_bounding_box)
    }

    /// Return expanded render bounds for a node if available.
    pub fn get_render_bounds(&self, id: &str) -> Option<Rectangle> {
        self.entries.get(id).map(|e| e.absolute_render_bounds)
    }

    /// Return the parent NodeId for a given node if available.
    pub fn get_parent(&self, id: &str) -> Option<NodeId> {
        self.entries.get(id).and_then(|e| e.parent.clone())
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn has(&self, id: &str) -> bool {
        self.entries.contains_key(id)
    }

    /// filter by node id and its entry data
    pub fn filter(&self, filter: impl Fn(&NodeId, &GeometryEntry) -> bool) -> Self {
        Self {
            entries: self
                .entries
                .iter()
                .filter(|(id, entry)| filter(id, entry))
                .map(|(id, entry)| (id.clone(), entry.clone()))
                .collect(),
        }
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
        IntrinsicSizeNode::SVGPath(n) => (n.transform, path_bounds(&n.data)),
        IntrinsicSizeNode::Vector(n) => (n.transform, n.network.bounds()),
        IntrinsicSizeNode::Image(n) => (n.transform, n.rect()),
    }
}

fn transform_rect(rect: &Rectangle, t: &AffineTransform) -> Rectangle {
    rect::transform(*rect, t)
}

fn polygon_bounds(points: &[CGPoint]) -> Rectangle {
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

fn inflate_rect(rect: Rectangle, delta: f32) -> Rectangle {
    if delta <= 0.0 {
        return rect;
    }
    Rectangle {
        x: rect.x - delta,
        y: rect.y - delta,
        width: rect.width + 2.0 * delta,
        height: rect.height + 2.0 * delta,
    }
}

fn stroke_outset(align: StrokeAlign, width: f32) -> f32 {
    match align {
        StrokeAlign::Inside => 0.0,
        StrokeAlign::Center => width / 2.0,
        StrokeAlign::Outside => width,
    }
}

fn compute_render_bounds_from_effects(bounds: Rectangle, effects: &LayerEffects) -> Rectangle {
    let mut bounds = bounds;
    if let Some(blur) = effects.blur {
        bounds = inflate_rect(bounds, blur.radius);
    }
    for shadow in &effects.shadows {
        bounds = compute_render_bounds_from_effect(bounds, &shadow.clone().into());
    }
    bounds
}

fn compute_render_bounds_from_effect(bounds: Rectangle, effect: &FilterEffect) -> Rectangle {
    match effect {
        FilterEffect::LayerBlur(blur) => inflate_rect(bounds, blur.radius),
        FilterEffect::BackdropBlur(blur) => inflate_rect(bounds, blur.radius),
        FilterEffect::DropShadow(shadow) => {
            // Apply spread by inflating the bounds, then offset and blur
            let mut rect = if shadow.spread != 0.0 {
                inflate_rect(bounds, shadow.spread)
            } else {
                bounds
            };
            rect.x += shadow.dx;
            rect.y += shadow.dy;
            inflate_rect(rect, shadow.blur)
        }
        // no inflation for inner shadow
        FilterEffect::InnerShadow(_shadow) => bounds,
    }
}

fn compute_render_bounds_from_style(
    world_bounds: Rectangle,
    stroke_width: f32,
    stroke_align: StrokeAlign,
    effects: &LayerEffects,
) -> Rectangle {
    let mut bounds = inflate_rect(world_bounds, stroke_outset(stroke_align, stroke_width));

    bounds = compute_render_bounds_from_effects(bounds, effects);

    bounds
}

fn compute_render_bounds(node: &Node, world_bounds: Rectangle) -> Rectangle {
    match node {
        Node::Rectangle(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.stroke_align,
            &n.effects,
        ),
        Node::Ellipse(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.stroke_align,
            &n.effects,
        ),
        Node::Polygon(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.stroke_align,
            &n.effects,
        ),
        Node::RegularPolygon(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.stroke_align,
            &n.effects,
        ),
        Node::RegularStarPolygon(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.stroke_align,
            &n.effects,
        ),
        Node::SVGPath(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.stroke_align,
            &n.effects,
        ),
        Node::Vector(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.get_stroke_align(),
            &n.effects,
        ),
        Node::Image(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.stroke_align,
            &n.effects,
        ),
        Node::Line(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.get_stroke_align(),
            &n.effects,
        ),
        Node::TextSpan(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width,
            n.stroke_align,
            &LayerEffects::default(),
        ),
        Node::Container(n) => compute_render_bounds_from_style(
            world_bounds,
            if n.has_stroke_geometry() {
                n.stroke_width
            } else {
                0.0
            },
            n.stroke_align,
            &n.effects,
        ),
        Node::Error(_) => world_bounds,
        Node::Group(_) | Node::BooleanOperation(_) => world_bounds,
    }
}
