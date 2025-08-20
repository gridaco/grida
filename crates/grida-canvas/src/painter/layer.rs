use super::geometry::{
    boolean_operation_path, boolean_operation_shape, build_shape, merge_shapes, PainterShape,
};
use crate::cache::scene::SceneCache;
use crate::cg::types::*;
use crate::node::repository::NodeRepository;
use crate::node::schema::*;
use crate::shape::*;
use crate::sk;
use crate::vectornetwork::VectorNetwork;
use math2::{rect::Rectangle, transform::AffineTransform};
use skia_safe::Path;

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
/// ```rust,ignore
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
pub enum PainterPictureLayer {
    Shape(PainterPictureShapeLayer),
    Text(PainterPictureTextLayer),
    Vector(PainterPictureVectorLayer),
}

pub trait Layer {
    fn id(&self) -> &NodeId;
    fn z_index(&self) -> usize;
    fn transform(&self) -> AffineTransform;
    fn shape(&self) -> &PainterShape;
}

impl Layer for PainterPictureLayer {
    fn id(&self) -> &NodeId {
        match self {
            PainterPictureLayer::Shape(layer) => &layer.base.id,
            PainterPictureLayer::Text(layer) => &layer.base.id,
            PainterPictureLayer::Vector(layer) => &layer.base.id,
        }
    }

    fn z_index(&self) -> usize {
        match self {
            PainterPictureLayer::Shape(layer) => layer.base.z_index,
            PainterPictureLayer::Text(layer) => layer.base.z_index,
            PainterPictureLayer::Vector(layer) => layer.base.z_index,
        }
    }

    fn transform(&self) -> AffineTransform {
        match self {
            PainterPictureLayer::Shape(layer) => layer.base.transform,
            PainterPictureLayer::Text(layer) => layer.base.transform,
            PainterPictureLayer::Vector(layer) => layer.base.transform,
        }
    }

    fn shape(&self) -> &PainterShape {
        match self {
            PainterPictureLayer::Shape(layer) => &layer.shape,
            PainterPictureLayer::Vector(layer) => &layer.shape,
            PainterPictureLayer::Text(layer) => &layer.shape,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PainterPictureLayerBase {
    pub id: NodeId,
    pub z_index: usize,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub transform: AffineTransform,
    pub clip_path: Option<skia_safe::Path>,
}

#[derive(Debug, Clone)]
pub struct PainterPictureShapeLayer {
    pub base: PainterPictureLayerBase,
    pub shape: PainterShape,
    pub effects: LayerEffects,
    pub strokes: Vec<Paint>,
    pub fills: Vec<Paint>,
    pub stroke_path: Option<skia_safe::Path>,
}

#[derive(Debug, Clone)]
pub struct PainterPictureTextLayer {
    pub base: PainterPictureLayerBase,
    pub effects: LayerEffects,
    pub strokes: Vec<Paint>,
    pub fills: Vec<Paint>,
    pub stroke_path: Option<skia_safe::Path>,
    pub shape: PainterShape,
    pub width: Option<f32>,
    pub text: String,
    pub text_style: TextStyle,
    pub text_align: TextAlign,
    pub text_align_vertical: TextAlignVertical,
}

#[derive(Debug, Clone)]
pub struct PainterPictureVectorLayer {
    pub base: PainterPictureLayerBase,
    pub effects: LayerEffects,
    pub strokes: Vec<Paint>,
    pub fills: Vec<Paint>,
    pub shape: PainterShape,
    pub vector: VectorNetwork,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_width_profile: Option<crate::cg::varwidth::VarWidthProfile>,
}

/// Flat list of [`PainterPictureLayer`] entries.
#[derive(Debug, Default, Clone)]
pub struct LayerList {
    pub layers: Vec<PainterPictureLayer>,
}

impl LayerList {
    /// Flatten an entire scene into a layer list using the provided scene cache.
    pub fn from_scene(scene: &Scene, scene_cache: &SceneCache) -> Self {
        let mut list = LayerList::default();
        for id in &scene.children {
            Self::flatten_node(id, &scene.nodes, scene_cache, 1.0, &mut list.layers);
        }
        list
    }

    /// Build a layer list starting from a node subtree using a scene cache.
    pub fn from_node(
        id: &NodeId,
        repo: &NodeRepository,
        scene_cache: &SceneCache,
        opacity: f32,
    ) -> Self {
        let mut list = LayerList::default();
        Self::flatten_node(id, repo, scene_cache, opacity, &mut list.layers);
        list
    }

    pub fn len(&self) -> usize {
        self.layers.len()
    }

    fn flatten_node(
        id: &NodeId,
        repo: &NodeRepository,
        scene_cache: &SceneCache,
        parent_opacity: f32,
        out: &mut Vec<PainterPictureLayer>,
    ) {
        if let Some(node) = repo.get(id) {
            if !node.active() {
                return;
            }
            let transform = scene_cache
                .geometry()
                .get_world_transform(id)
                .unwrap_or_else(AffineTransform::identity);
            match node {
                Node::Group(n) => {
                    let opacity = parent_opacity * n.opacity;
                    for child in &n.children {
                        Self::flatten_node(child, repo, scene_cache, opacity, out);
                    }
                }
                Node::Container(n) => {
                    let opacity = parent_opacity * n.opacity;
                    let shape = build_shape(&IntrinsicSizeNode::Container(n.clone()));
                    let stroke_path = if n.strokes.len() > 0 && n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.stroke_align,
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.strokes.clone(),
                        fills: n.fills.clone(),
                        stroke_path,
                    }));
                    for child in &n.children {
                        Self::flatten_node(child, repo, scene_cache, opacity, out);
                    }
                }
                Node::BooleanOperation(n) => {
                    let opacity = parent_opacity * n.opacity;
                    if let Some(shape) = boolean_operation_shape(n, repo, scene_cache.geometry()) {
                        let stroke_path = if n.stroke.is_some() && n.stroke_width > 0.0 {
                            Some(stroke_geometry(
                                &shape.to_path(),
                                n.stroke_width,
                                n.stroke_align,
                                n.stroke_dash_array.as_ref(),
                            ))
                        } else {
                            None
                        };
                        out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                            base: PainterPictureLayerBase {
                                id: n.id.clone(),
                                z_index: out.len(),
                                opacity,
                                blend_mode: n.blend_mode,
                                transform,
                                clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                            },
                            shape,
                            effects: n.effects.clone(),
                            strokes: n.stroke.clone().into_iter().collect(),
                            fills: vec![n.fill.clone()],
                            stroke_path,
                        }));
                    } else {
                        for child in &n.children {
                            Self::flatten_node(child, repo, scene_cache, opacity, out);
                        }
                    }
                }
                Node::Rectangle(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::Rectangle(n.clone()));
                    let stroke_path = if n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.stroke_align,
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.strokes.clone(),
                        fills: n.fills.clone(),
                        stroke_path,
                    }))
                }
                Node::Ellipse(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::Ellipse(n.clone()));
                    let stroke_path = if n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.stroke_align,
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.strokes.clone(),
                        fills: n.fills.clone(),
                        stroke_path,
                    }))
                }
                Node::Polygon(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::Polygon(n.clone()));
                    let stroke_path = if n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.stroke_align,
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.strokes.clone(),
                        fills: n.fills.clone(),
                        stroke_path,
                    }))
                }
                Node::RegularPolygon(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::RegularPolygon(n.clone()));
                    let stroke_path = if n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.stroke_align,
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.strokes.clone(),
                        fills: n.fills.clone(),
                        stroke_path,
                    }))
                }
                Node::RegularStarPolygon(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::RegularStarPolygon(n.clone()));
                    let stroke_path = if n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.stroke_align,
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.strokes.clone(),
                        fills: n.fills.clone(),
                        stroke_path,
                    }))
                }
                Node::Line(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::Line(n.clone()));
                    let stroke_path = if n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.get_stroke_align(),
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.strokes.clone(),
                        fills: vec![],
                        stroke_path,
                    }))
                }
                Node::TextSpan(n) => {
                    // Create a rectangle shape for the text bounds
                    let text_bounds = scene_cache
                        .geometry()
                        .get_world_bounds(&n.id)
                        .unwrap_or_else(|| Rectangle {
                            x: n.x(),
                            y: n.y(),
                            width: n.width.unwrap_or(100.0),
                            height: n.text_style.font_size
                                * n.text_style.line_height.unwrap_or(1.2)
                                * 2.0,
                        });

                    let shape = PainterShape::from_rect(skia_safe::Rect::from_xywh(
                        0.0,
                        0.0,
                        text_bounds.width,
                        text_bounds.height,
                    ));

                    out.push(PainterPictureLayer::Text(PainterPictureTextLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        width: n.width,
                        effects: n.effects.clone(),
                        strokes: n.stroke.clone().into_iter().collect(),
                        fills: vec![n.fill.clone()],
                        stroke_path: None,
                        shape,
                        text: n.text.clone(),
                        text_style: n.text_style.clone(),
                        text_align: n.text_align,
                        text_align_vertical: n.text_align_vertical,
                    }))
                }
                Node::SVGPath(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::SVGPath(n.clone()));
                    let stroke_path = if n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.stroke_align,
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.stroke.clone().into_iter().collect(),
                        fills: vec![n.fill.clone()],
                        stroke_path,
                    }))
                }
                Node::Vector(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::Vector(n.clone()));
                    out.push(PainterPictureLayer::Vector(PainterPictureVectorLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: n.strokes.clone(),
                        fills: n.fill.clone().into_iter().collect(),
                        vector: n.network.clone(),
                        stroke_width: n.stroke_width,
                        stroke_align: n.stroke_align,
                        stroke_width_profile: n.stroke_width_profile.clone(),
                    }))
                }
                Node::Image(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::Image(n.clone()));
                    let stroke_path = if n.stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            n.stroke_width,
                            n.stroke_align,
                            n.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: n.effects.clone(),
                        strokes: vec![n.stroke.clone()],
                        fills: vec![Paint::Image(n.fill.clone())],
                        stroke_path,
                    }))
                }
                Node::Error(n) => {
                    let shape = build_shape(&IntrinsicSizeNode::Error(n.clone()));
                    out.push(PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: n.id.clone(),
                            z_index: out.len(),
                            opacity: parent_opacity * n.opacity,
                            blend_mode: BlendMode::Normal,
                            transform,
                            clip_path: Self::compute_clip_path(&n.id, repo, scene_cache),
                        },
                        shape,
                        effects: LayerEffects::new_empty(),
                        strokes: vec![],
                        fills: vec![],
                        stroke_path: None,
                    }))
                }
            }
        }
    }

    pub fn filter(&self, filter: impl Fn(&PainterPictureLayer) -> bool) -> Self {
        let mut list = LayerList::default();
        for layer in &self.layers {
            if filter(layer) {
                list.layers.push(layer.clone());
            }
        }
        list
    }

    /// Computes the clip path for a node by traversing up the hierarchy
    /// and collecting all clip shapes from parent nodes.
    ///
    /// This function walks up the node tree starting from the given node ID,
    /// collecting shapes from parent nodes that have `clip = true`.
    /// The shapes are merged using boolean operations to create a single clip path.
    ///
    /// # Parameters
    ///
    /// - `node_id`: The ID of the node to compute the clip path for
    /// - `repo`: The node repository containing all nodes
    /// - `scene_cache`: The scene cache for transforms
    ///
    /// # Returns
    ///
    /// An `Option<Path>` representing the merged clip path, or `None` if no clipping is needed.
    pub fn compute_clip_path(
        node_id: &NodeId,
        repo: &NodeRepository,
        scene_cache: &SceneCache,
    ) -> Option<Path> {
        let mut clip_shapes = Vec::new();
        let mut current_id = Some(node_id.clone());

        let current_world = scene_cache
            .geometry()
            .get_world_transform(node_id)
            .unwrap_or_else(AffineTransform::identity);
        let current_inv = current_world
            .inverse()
            .unwrap_or_else(AffineTransform::identity);

        // Walk up the hierarchy to collect clip shapes
        while let Some(id) = current_id {
            if let Some(node) = repo.get(&id) {
                match node {
                    Node::Container(n) => {
                        if n.clip {
                            // Get the world transform for this node
                            let world_transform = scene_cache
                                .geometry()
                                .get_world_transform(&id)
                                .unwrap_or_else(AffineTransform::identity);

                            // Build the shape and transform it relative to the current node
                            let shape = build_shape(&IntrinsicSizeNode::Container(n.clone()));
                            let mut path = shape.to_path();
                            let relative_transform = current_inv.compose(&world_transform);
                            path.transform(&sk::sk_matrix(relative_transform.matrix));

                            clip_shapes.push((
                                PainterShape::from_path(path),
                                BooleanPathOperation::Intersection,
                            ));
                        }
                    }
                    Node::BooleanOperation(n) => {
                        if let Some(mut path) =
                            boolean_operation_path(n, repo, scene_cache.geometry())
                        {
                            let world_transform = scene_cache
                                .geometry()
                                .get_world_transform(&id)
                                .unwrap_or_else(AffineTransform::identity);
                            let relative_transform = current_inv.compose(&world_transform);
                            path.transform(&sk::sk_matrix(relative_transform.matrix));

                            clip_shapes.push((
                                PainterShape::from_path(path),
                                BooleanPathOperation::Intersection,
                            ));
                        }
                    }
                    _ => {} // Skip other node types
                }

                // Move up to parent
                current_id = scene_cache.geometry().get_parent(&id);
            } else {
                break;
            }
        }

        // If we have clip shapes, merge them
        if !clip_shapes.is_empty() {
            Some(merge_shapes(&clip_shapes))
        } else {
            None
        }
    }
}
