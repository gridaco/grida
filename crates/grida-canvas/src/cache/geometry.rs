//! Geometry cache - Transform and bounds resolution
//!
//! ## Pipeline Guarantees
//!
//! This module guarantees:
//! - Every node in scene graph has a GeometryEntry
//! - All transforms are fully resolved (no None/fallbacks)
//! - All bounds include layout-computed dimensions for V2 nodes
//! - Consumes LayoutResult as immutable input from LayoutEngine
//! - Missing layout for Inset nodes is a PANIC (LayoutEngine bug)
//! - Missing geometry entry when accessed is a PANIC (GeometryCache bug)

use crate::cache::paragraph::ParagraphCache;
use crate::cg::prelude::*;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::{LayerEffects, Node, NodeGeometryMixin, NodeId, NodeRectMixin, Scene};
use crate::runtime::font_repository::FontRepository;
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

/// Context passed during geometry building
struct GeometryBuildContext {
    viewport_size: crate::node::schema::Size,
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

    pub fn from_scene(scene: &Scene, fonts: &FontRepository) -> Self {
        Self::from_scene_with_paragraph_cache(scene, &mut ParagraphCache::new(), fonts)
    }

    pub fn from_scene_with_paragraph_cache(
        scene: &Scene,
        paragraph_cache: &mut ParagraphCache,
        fonts: &FontRepository,
    ) -> Self {
        let default_viewport = crate::node::schema::Size {
            width: 1920.0,
            height: 1080.0,
        };
        Self::from_scene_with_layout(scene, paragraph_cache, fonts, None, default_viewport)
    }

    pub fn from_scene_with_layout(
        scene: &Scene,
        paragraph_cache: &mut ParagraphCache,
        fonts: &FontRepository,
        layout_result: Option<&crate::layout::cache::LayoutResult>,
        viewport_size: crate::node::schema::Size,
    ) -> Self {
        let mut cache = Self::new();
        let root_world = AffineTransform::identity();
        let context = GeometryBuildContext { viewport_size };

        for child in scene.graph.roots() {
            Self::build_recursive(
                &child,
                &scene.graph,
                &root_world,
                None,
                &mut cache,
                paragraph_cache,
                fonts,
                layout_result,
                &context,
            );
        }
        cache
    }

    fn build_recursive(
        id: &NodeId,
        graph: &SceneGraph,
        parent_world: &AffineTransform,
        parent_id: Option<NodeId>,
        cache: &mut GeometryCache,
        paragraph_cache: &mut ParagraphCache,
        fonts: &FontRepository,
        layout_result: Option<&crate::layout::cache::LayoutResult>,
        context: &GeometryBuildContext,
    ) -> Rectangle {
        let node = graph
            .get_node(id)
            .expect(&format!("node not found in geometry cache {id:?}"));

        match node {
            Node::Group(n) => {
                let world_transform = parent_world.compose(&n.transform.unwrap_or_default());
                let mut union_bounds: Option<Rectangle> = None;
                let mut union_render_bounds: Option<Rectangle> = None;
                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        let child_bounds = Self::build_recursive(
                            child_id,
                            graph,
                            &world_transform,
                            Some(id.clone()),
                            cache,
                            paragraph_cache,
                            fonts,
                            layout_result,
                            context,
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
            Node::InitialContainer(_n) => {
                // ICB fills viewport - size from context
                // Layout was already computed by LayoutEngine
                let size = context.viewport_size;

                let local_transform = AffineTransform::identity();
                let world_transform = parent_world.compose(&local_transform);

                let local_bounds = Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width: size.width,
                    height: size.height,
                };

                // Build children geometries (may use computed layouts from LayoutEngine)
                let mut union_world_bounds = transform_rect(&local_bounds, &world_transform);

                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        let child_bounds = Self::build_recursive(
                            child_id,
                            graph,
                            &world_transform,
                            Some(id.clone()),
                            cache,
                            paragraph_cache,
                            fonts,
                            layout_result,
                            context,
                        );
                        union_world_bounds = rect::union(&[union_world_bounds, child_bounds]);
                    }
                }

                let render_bounds = union_world_bounds; // ICB has no effects

                let entry = GeometryEntry {
                    transform: local_transform,
                    absolute_transform: world_transform,
                    bounding_box: local_bounds,
                    absolute_bounding_box: union_world_bounds,
                    absolute_render_bounds: render_bounds,
                    parent: parent_id,
                    dirty_transform: false,
                    dirty_bounds: false,
                };

                cache.entries.insert(id.clone(), entry);
                union_world_bounds
            }
            Node::BooleanOperation(n) => {
                let world_transform = parent_world.compose(&n.transform.unwrap_or_default());
                let mut union_bounds: Option<Rectangle> = None;
                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        let child_bounds = Self::build_recursive(
                            child_id,
                            graph,
                            &world_transform,
                            Some(id.clone()),
                            cache,
                            paragraph_cache,
                            fonts,
                            layout_result,
                            context,
                        );
                        union_bounds = match union_bounds {
                            Some(b) => Some(rect::union(&[b, child_bounds])),
                            None => Some(child_bounds),
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

                let render_bounds = compute_render_bounds_from_style(
                    world_bounds,
                    n.stroke_width.value_or_zero(),
                    n.stroke_style.stroke_align,
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
                // All containers use computed layout (roots have position corrected by LayoutEngine)
                let (x, y, width, height) = if let Some(result) = layout_result {
                    // Layout engine is active: use computed layout
                    let computed = result
                        .get(id)
                        .expect("Container must have layout result when layout engine is used");
                    (computed.x, computed.y, computed.width, computed.height)
                } else {
                    // No layout engine: use schema directly (backward compatibility)
                    (
                        n.position.x().unwrap_or(0.0),
                        n.position.y().unwrap_or(0.0),
                        n.layout_dimensions.width.unwrap_or(0.0),
                        n.layout_dimensions.height.unwrap_or(0.0),
                    )
                };
                let local_transform = AffineTransform::new(x, y, n.rotation);

                let local_bounds = Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width,
                    height,
                };

                let world_transform = parent_world.compose(&local_transform);
                let world_bounds = transform_rect(&local_bounds, &world_transform);
                let mut union_world_bounds = world_bounds;
                let render_bounds = if let Some(rect_stroke) = n.rectangular_stroke_width() {
                    compute_render_bounds_with_rectangular_stroke(
                        world_bounds,
                        &rect_stroke,
                        n.stroke_style.stroke_align,
                        &n.effects,
                    )
                } else {
                    compute_render_bounds_from_style(
                        world_bounds,
                        n.render_bounds_stroke_width(),
                        n.stroke_style.stroke_align,
                        &n.effects,
                    )
                };

                if let Some(children) = graph.get_children(id) {
                    for child_id in children {
                        let child_bounds = Self::build_recursive(
                            child_id,
                            graph,
                            &world_transform,
                            Some(id.clone()),
                            cache,
                            paragraph_cache,
                            fonts,
                            layout_result,
                            context,
                        );
                        union_world_bounds = rect::union(&[union_world_bounds, child_bounds]);
                    }
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
                    Some(id),
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
                // Leaf nodes - check layout result first, fallback to schema transform
                let (rec_transform, schema_width, schema_height) = match node {
                    Node::Rectangle(n) => (n.transform, n.size.width, n.size.height),
                    Node::Ellipse(n) => (n.transform, n.size.width, n.size.height),
                    Node::Image(n) => (n.transform, n.size.width, n.size.height),
                    Node::RegularPolygon(n) => (n.transform, n.size.width, n.size.height),
                    Node::RegularStarPolygon(n) => (n.transform, n.size.width, n.size.height),
                    Node::Line(n) => (n.transform, n.size.width, 0.0),
                    Node::Polygon(n) => {
                        let rect = n.rect();
                        (n.transform, rect.width, rect.height)
                    }
                    Node::SVGPath(n) => {
                        let rect = n.rect();
                        (n.transform, rect.width, rect.height)
                    }
                    Node::Vector(n) => {
                        let rect = n.network.bounds();
                        (n.transform, rect.width, rect.height)
                    }
                    Node::Error(n) => (n.transform, n.size.width, n.size.height),
                    // V2/special nodes handled above
                    _ => unreachable!("Has dedicated case above"),
                };

                // Position and size resolution:
                // - If layout result exists: Use computed position/size (participating in flex layout)
                // - If no layout result: Use schema transform (no layout engine, or non-participating nodes)
                let (x, y, width, height) =
                    if let Some(result) = layout_result.and_then(|r| r.get(id)) {
                        // Has computed layout: use layout position and size
                        (result.x, result.y, result.width, result.height)
                    } else {
                        // No layout: use schema transform
                        (
                            rec_transform.x(),
                            rec_transform.y(),
                            schema_width,
                            schema_height,
                        )
                    };

                let local_transform = AffineTransform::new(x, y, rec_transform.rotation());

                let local_bounds = Rectangle {
                    x: 0.0,
                    y: 0.0,
                    width,
                    height,
                };

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

    pub fn get_transform(&self, id: &NodeId) -> Option<AffineTransform> {
        self.entries.get(id).map(|e| e.transform)
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

    /// Return the parent NodeId for a given node if available.
    pub fn get_parent(&self, id: &NodeId) -> Option<NodeId> {
        self.entries.get(id).and_then(|e| e.parent.clone())
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn has(&self, id: &NodeId) -> bool {
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

fn transform_rect(rect: &Rectangle, t: &AffineTransform) -> Rectangle {
    rect::transform(*rect, t)
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
    if let Some(blur) = &effects.blur {
        bounds = match blur {
            FeBlur::Gaussian(gaussian) => {
                // Use 3x sigma for 99.7% Gaussian coverage
                inflate_rect(bounds, gaussian.radius * 3.0)
            }
            FeBlur::Progressive(progressive) => {
                // Use the maximum of both radii for bounds calculation
                // to handle both increasing and decreasing blur gradients
                // Multiply by 3.0 for proper 3-sigma Gaussian coverage
                let max_radius = progressive.radius.max(progressive.radius2);
                inflate_rect(bounds, max_radius * 3.0)
            }
        };
    }
    for shadow in &effects.shadows {
        bounds = compute_render_bounds_from_effect(bounds, &shadow.clone().into());
    }
    bounds
}

fn compute_render_bounds_from_effect(bounds: Rectangle, effect: &FilterEffect) -> Rectangle {
    match effect {
        FilterEffect::LiquidGlass(glass) => inflate_rect(bounds, glass.blur_radius * 3.0),
        FilterEffect::LayerBlur(blur) => match blur {
            FeBlur::Gaussian(gaussian) => inflate_rect(bounds, gaussian.radius * 3.0),
            FeBlur::Progressive(progressive) => {
                let max_radius = progressive.radius.max(progressive.radius2);
                inflate_rect(bounds, max_radius * 3.0)
            }
        },
        FilterEffect::BackdropBlur(blur) => match blur {
            FeBlur::Gaussian(gaussian) => inflate_rect(bounds, gaussian.radius * 3.0),
            FeBlur::Progressive(progressive) => {
                let max_radius = progressive.radius.max(progressive.radius2);
                inflate_rect(bounds, max_radius * 3.0)
            }
        },
        FilterEffect::DropShadow(shadow) => {
            // Apply spread by inflating the bounds, then offset and blur
            let mut rect = if shadow.spread != 0.0 {
                inflate_rect(bounds, shadow.spread)
            } else {
                bounds
            };
            rect.x += shadow.dx;
            rect.y += shadow.dy;
            // Use 3x sigma for proper Gaussian blur coverage
            inflate_rect(rect, shadow.blur * 3.0)
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

/// Computes render bounds for nodes with per-side stroke widths.
///
/// Handles all three stroke alignments:
/// - **Center**: Inflate by half-widths (stroke extends inward and outward)
/// - **Inside**: No inflation (stroke is entirely inside node bounds)
/// - **Outside**: Inflate by full-widths (stroke extends entirely outward)
fn compute_render_bounds_with_rectangular_stroke(
    world_bounds: Rectangle,
    rect_stroke: &RectangularStrokeWidth,
    stroke_align: StrokeAlign,
    effects: &LayerEffects,
) -> Rectangle {
    let mut bounds = world_bounds;

    // Inflate based on stroke alignment
    match stroke_align {
        StrokeAlign::Center => {
            // Center: inflate by half the stroke width on each side
            bounds = rect::inflate(
                bounds,
                rect::Sides {
                    top: rect_stroke.stroke_top_width / 2.0,
                    right: rect_stroke.stroke_right_width / 2.0,
                    bottom: rect_stroke.stroke_bottom_width / 2.0,
                    left: rect_stroke.stroke_left_width / 2.0,
                },
            );
        }
        StrokeAlign::Inside => {
            // Inside: no inflation - stroke is entirely inside the node bounds
            // bounds remain unchanged
        }
        StrokeAlign::Outside => {
            // Outside: inflate by full stroke width on each side
            bounds = rect::inflate(
                bounds,
                rect::Sides {
                    top: rect_stroke.stroke_top_width,
                    right: rect_stroke.stroke_right_width,
                    bottom: rect_stroke.stroke_bottom_width,
                    left: rect_stroke.stroke_left_width,
                },
            );
        }
    }

    bounds = compute_render_bounds_from_effects(bounds, effects);

    bounds
}

fn compute_render_bounds(node: &Node, world_bounds: Rectangle) -> Rectangle {
    match node {
        Node::Rectangle(n) => {
            // Check if this node has per-side stroke widths
            if let Some(rect_stroke) = n.rectangular_stroke_width() {
                compute_render_bounds_with_rectangular_stroke(
                    world_bounds,
                    &rect_stroke,
                    n.stroke_style.stroke_align,
                    &n.effects,
                )
            } else {
                compute_render_bounds_from_style(
                    world_bounds,
                    n.render_bounds_stroke_width(),
                    n.stroke_style.stroke_align,
                    &n.effects,
                )
            }
        }
        Node::Ellipse(n) => compute_render_bounds_from_style(
            world_bounds,
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::Polygon(n) => compute_render_bounds_from_style(
            world_bounds,
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::RegularPolygon(n) => compute_render_bounds_from_style(
            world_bounds,
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::RegularStarPolygon(n) => compute_render_bounds_from_style(
            world_bounds,
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
            &n.effects,
        ),
        Node::SVGPath(n) => compute_render_bounds_from_style(
            world_bounds,
            n.stroke_width.value_or_zero(),
            n.stroke_style.stroke_align,
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
            n.render_bounds_stroke_width(),
            n.stroke_style.stroke_align,
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
        Node::Container(n) => {
            // Check if this node has per-side stroke widths
            if let Some(rect_stroke) = n.rectangular_stroke_width() {
                compute_render_bounds_with_rectangular_stroke(
                    world_bounds,
                    &rect_stroke,
                    n.stroke_style.stroke_align,
                    &n.effects,
                )
            } else {
                compute_render_bounds_from_style(
                    world_bounds,
                    n.render_bounds_stroke_width(),
                    n.stroke_style.stroke_align,
                    &n.effects,
                )
            }
        }
        Node::Error(_) => world_bounds,
        Node::Group(_) | Node::BooleanOperation(_) | Node::InitialContainer(_) => world_bounds,
    }
}
