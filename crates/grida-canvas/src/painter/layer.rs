use super::geometry::{PainterShape, build_shape};
use crate::cache::geometry::GeometryCache;
use crate::node::schema::*;
use crate::rect::{self, Rect};
use crate::repository::NodeRepository;
use math2::transform::AffineTransform;

/// A Skia-friendly, cacheable picture layer for vector rendering.
///
/// `PainterPictureLayer` represents a flattened, self-contained unit of vector draw commands,
/// recorded as a Skia `SkPicture`. It is designed for reuse across multiple frames or draw passes,
/// enabling high-performance rendering via picture caching.
///
/// This is the first step of isolating draw content from rendering context (transform, opacity, blend),
/// allowing layers to be reused with different composite properties (see `LayerUsage`).
///
/// ## Characteristics
///
/// - Contains **pure draw content** (shape, paint, effects)
/// - Does **not** include transform, opacity, blend mode, clip
/// - Can be recorded once and reused as `SkPicture` or rendered live
/// - Effects like blur/shadow are baked into the picture if needed
///
/// ## Use Cases
///
/// - Caching static shape trees (e.g. icons, frames, symbols)
/// - Re-recording affected subtrees for dirty region rendering
/// - Serving as a source input for tile-based compositing
///
/// ## Typical Workflow
///
/// 1. Compile scene node(s) into a `PainterPictureLayer`
/// 2. Record its content into a `SkPicture`
/// 3. On each frame, draw the cached picture with:
///     - transform
///     - opacity
///     - blend mode
///
/// ## Example
///
/// ```rust
/// // Layer definition
/// let layer = PainterPictureLayer {
///     shape: shape,
///     fills: vec![fill],
///     strokes: vec![stroke],
///     effects: vec![],
/// };
///
/// // Record
/// let picture = record_to_sk_picture(&layer);
///
/// // Use
/// canvas.save();
/// canvas.concat(transform);
/// canvas.save_layer_alpha(...);
/// canvas.draw_picture(&picture, None, None);
/// canvas.restore();
/// canvas.restore();
/// ```
///
/// ## See Also
/// - [`LayerUsage`] — carries per-frame composite state (transform, opacity)
/// - [`RenderCommand`] — full rendering instruction with resolved state
/// - [`PainterShape`] — resolved shape geometry abstraction
#[derive(Debug, Clone)]
pub struct PainterPictureLayer {
    pub id: NodeId,
    pub z_index: usize,
    pub opacity: f32,
    pub transform: AffineTransform,
    pub shape: PainterShape,
    pub effects: Vec<FilterEffect>,
    pub strokes: Vec<Paint>,
    pub fills: Vec<Paint>,
}

/// Flat list of [`PainterPictureLayer`] entries.
#[derive(Debug, Default, Clone)]
pub struct LayerList {
    pub layers: Vec<PainterPictureLayer>,
}

impl LayerList {
    /// Flatten an entire scene into a layer list using the provided geometry cache.
    pub fn from_scene(scene: &Scene, cache: &GeometryCache, bounding: Option<Rect>) -> Self {
        let mut list = LayerList::default();
        for id in &scene.children {
            Self::flatten_node(
                id,
                &scene.nodes,
                cache,
                1.0,
                bounding.as_ref(),
                &mut list.layers,
            );
        }
        list
    }

    /// Build a layer list starting from a node subtree using a geometry cache.
    pub fn from_node(
        id: &NodeId,
        repo: &NodeRepository,
        cache: &GeometryCache,
        opacity: f32,
        bounding: Option<Rect>,
    ) -> Self {
        let mut list = LayerList::default();
        Self::flatten_node(
            id,
            repo,
            cache,
            opacity,
            bounding.as_ref(),
            &mut list.layers,
        );
        list
    }

    fn flatten_node(
        id: &NodeId,
        repo: &NodeRepository,
        cache: &GeometryCache,
        parent_opacity: f32,
        bounding: Option<&Rect>,
        out: &mut Vec<PainterPictureLayer>,
    ) {
        if let Some(node) = repo.get(id) {
            if let Some(view) = bounding {
                if let Some(bounds) = cache.get_render_bounds(id) {
                    if !rect::intersects(&bounds, view) {
                        return;
                    }
                }
            }
            let transform = cache
                .get_world_transform(id)
                .unwrap_or_else(AffineTransform::identity);
            match node {
                Node::Group(n) => {
                    let opacity = parent_opacity * n.opacity;
                    for child in &n.children {
                        Self::flatten_node(child, repo, cache, opacity, bounding, out);
                    }
                }
                Node::Container(n) => {
                    let opacity = parent_opacity * n.opacity;
                    out.push(PainterPictureLayer {
                        id: n.base.id.clone(),
                        z_index: out.len(),
                        opacity,
                        transform,
                        shape: build_shape(&IntrinsicSizeNode::Container(n.clone())),
                        effects: n.effect.clone().into_iter().collect(),
                        strokes: n.stroke.clone().into_iter().collect(),
                        fills: vec![n.fill.clone()],
                    });
                    for child in &n.children {
                        Self::flatten_node(child, repo, cache, opacity, bounding, out);
                    }
                }
                Node::BooleanOperation(n) => {
                    let opacity = parent_opacity * n.opacity;
                    for child in &n.children {
                        Self::flatten_node(child, repo, cache, opacity, bounding, out);
                    }
                }
                Node::Rectangle(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::Rectangle(n.clone())),
                    effects: n.effect.clone().into_iter().collect(),
                    strokes: vec![n.stroke.clone()],
                    fills: vec![n.fill.clone()],
                }),
                Node::Ellipse(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::Ellipse(n.clone())),
                    effects: n.effect.clone().into_iter().collect(),
                    strokes: vec![n.stroke.clone()],
                    fills: vec![n.fill.clone()],
                }),
                Node::Polygon(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::Polygon(n.clone())),
                    effects: n.effect.clone().into_iter().collect(),
                    strokes: vec![n.stroke.clone()],
                    fills: vec![n.fill.clone()],
                }),
                Node::RegularPolygon(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::RegularPolygon(n.clone())),
                    effects: n.effect.clone().into_iter().collect(),
                    strokes: vec![n.stroke.clone()],
                    fills: vec![n.fill.clone()],
                }),
                Node::RegularStarPolygon(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::RegularStarPolygon(n.clone())),
                    effects: n.effect.clone().into_iter().collect(),
                    strokes: vec![n.stroke.clone()],
                    fills: vec![n.fill.clone()],
                }),
                Node::Line(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::Line(n.clone())),
                    effects: vec![],
                    strokes: vec![n.stroke.clone()],
                    fills: vec![],
                }),
                Node::TextSpan(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::TextSpan(n.clone())),
                    effects: vec![],
                    strokes: n.stroke.clone().into_iter().collect(),
                    fills: vec![n.fill.clone()],
                }),
                Node::Path(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::Path(n.clone())),
                    effects: n.effect.clone().into_iter().collect(),
                    strokes: vec![n.stroke.clone()],
                    fills: vec![n.fill.clone()],
                }),
                Node::Image(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::Image(n.clone())),
                    effects: n.effect.clone().into_iter().collect(),
                    strokes: vec![n.stroke.clone()],
                    fills: vec![n.fill.clone()],
                }),
                Node::Error(n) => out.push(PainterPictureLayer {
                    id: n.base.id.clone(),
                    z_index: out.len(),
                    opacity: parent_opacity * n.opacity,
                    transform,
                    shape: build_shape(&IntrinsicSizeNode::Error(n.clone())),
                    effects: vec![],
                    strokes: vec![],
                    fills: vec![],
                }),
            }
        }
    }
}
