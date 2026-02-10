use super::geometry::{
    boolean_operation_path, boolean_operation_shape, build_shape, merge_shapes, PainterShape,
};
use crate::cache::scene::SceneCache;
use crate::cg::prelude::*;
use crate::node::scene_graph::SceneGraph;
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
///     fills: Paints::new([fill]),
///     strokes: Paints::new([stroke]),
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

#[derive(Debug, Clone)]
pub enum PainterRenderCommand {
    Draw(PainterPictureLayer),
    MaskGroup(PainterMaskGroup),
}

#[derive(Debug, Clone)]
pub struct PainterMaskGroup {
    pub mask_type: LayerMaskType,
    pub mask_commands: Vec<PainterRenderCommand>,
    pub content_commands: Vec<PainterRenderCommand>,
}

#[derive(Debug, Default)]
struct FlattenResult {
    commands: Vec<PainterRenderCommand>,
    mask: Option<LayerMaskType>,
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
    pub blend_mode: LayerBlendMode,
    pub transform: AffineTransform,
    pub clip_path: Option<skia_safe::Path>,
}

#[derive(Debug, Clone)]
pub struct PainterPictureShapeLayer {
    pub base: PainterPictureLayerBase,
    pub shape: PainterShape,
    pub effects: LayerEffects,
    pub strokes: Paints,
    pub fills: Paints,
    pub stroke_path: Option<skia_safe::Path>,
    /// Stroke decoration at the start endpoint (line nodes).
    pub stroke_decoration_start: StrokeDecoration,
    /// Stroke decoration at the end endpoint (line nodes).
    pub stroke_decoration_end: StrokeDecoration,
    /// Stroke width needed for decoration sizing.
    pub stroke_width: f32,
}

#[derive(Debug, Clone)]
pub struct PainterPictureTextLayer {
    pub base: PainterPictureLayerBase,
    pub effects: LayerEffects,
    pub strokes: Paints,
    pub fills: Paints,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_path: Option<skia_safe::Path>,
    pub shape: PainterShape,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub max_lines: Option<usize>,
    pub ellipsis: Option<String>,
    pub text: String,
    pub text_style: TextStyleRec,
    pub text_align: TextAlign,
    pub text_align_vertical: TextAlignVertical,
    pub id: NodeId,
}

#[derive(Debug, Clone)]
pub struct PainterPictureVectorLayer {
    pub base: PainterPictureLayerBase,
    pub effects: LayerEffects,
    pub strokes: Paints,
    pub fills: Paints,
    pub shape: PainterShape,
    pub vector: VectorNetwork,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_cap: StrokeCap,
    pub stroke_join: StrokeJoin,
    pub stroke_miter_limit: StrokeMiterLimit,
    pub stroke_width_profile: Option<crate::cg::varwidth::VarWidthProfile>,
    pub stroke_dash_array: Option<StrokeDashArray>,
    pub corner_radius: f32,
    /// Stroke decoration at the start endpoint (first vertex).
    pub stroke_decoration_start: StrokeDecoration,
    /// Stroke decoration at the end endpoint (last vertex).
    pub stroke_decoration_end: StrokeDecoration,
}

/// A layer with its associated node ID.
/// This pairs a layer with its source node ID, eliminating the need to store ID in the layer itself.
#[derive(Debug, Clone)]
pub struct LayerEntry {
    pub id: NodeId,
    pub layer: PainterPictureLayer,
}

/// Flat list of [`PainterPictureLayer`] entries with their IDs.
#[derive(Debug, Default, Clone)]
pub struct LayerList {
    pub layers: Vec<LayerEntry>,
    pub commands: Vec<PainterRenderCommand>,
}

impl LayerList {
    /// Filter paints to only include visible ones for performance optimization.
    ///
    /// This removes paints that are inactive or have zero opacity, which have no visual effect
    /// regardless of blend mode and can be safely skipped during rendering.
    fn filter_visible_paints(paints: &Paints) -> Paints {
        Paints::new(
            paints
                .iter()
                .filter(|paint| paint.visible())
                .cloned()
                .collect::<Vec<_>>(),
        )
    }

    fn filter_active_noises(noises: &[FeNoiseEffect]) -> Vec<FeNoiseEffect> {
        noises.iter().filter(|n| n.active).cloned().collect()
    }

    fn filter_active_shadows(shadows: &[FilterShadowEffect]) -> Vec<FilterShadowEffect> {
        shadows.iter().filter(|s| s.active()).cloned().collect()
    }

    fn filter_active_layer_blur(blur: &Option<FeLayerBlur>) -> Option<FeLayerBlur> {
        blur.as_ref()
            .and_then(|b| if b.active { Some(b.clone()) } else { None })
    }

    fn filter_active_backdrop_blur(blur: &Option<FeBackdropBlur>) -> Option<FeBackdropBlur> {
        blur.as_ref()
            .and_then(|b| if b.active { Some(b.clone()) } else { None })
    }

    fn filter_active_glass(glass: &Option<FeLiquidGlass>) -> Option<FeLiquidGlass> {
        glass
            .as_ref()
            .and_then(|g| if g.active { Some(*g) } else { None })
    }

    fn filter_active_effects(effects: &LayerEffects) -> LayerEffects {
        LayerEffects {
            shadows: Self::filter_active_shadows(&effects.shadows),
            blur: Self::filter_active_layer_blur(&effects.blur),
            backdrop_blur: Self::filter_active_backdrop_blur(&effects.backdrop_blur),
            glass: Self::filter_active_glass(&effects.glass),
            noises: Self::filter_active_noises(&effects.noises),
        }
    }

    /// Computes stroke geometry for rectangular shapes with support for per-side widths.
    ///
    /// This handles both uniform and per-side stroke widths for rectangular shapes.
    /// Per-side strokes are rendered as filled ring geometry (outer - inner rectangles).
    /// Falls back to uniform stroke rendering when corners are rounded.
    ///
    /// # Parameters
    ///
    /// - `stroke_width`: The resolved stroke width (uniform, rectangular, or none)
    /// - `corner_radius`: Corner radius configuration (per-side strokes need zero radius)
    /// - `stroke_style`: Stroke style (alignment, dash pattern, etc.)
    /// - `size`: The size of the rectangular shape
    /// - `shape`: The painter shape (used for uniform stroke fallback)
    ///
    /// # Returns
    ///
    /// A `Path` representing the stroke geometry, or `None` if there's no stroke.
    fn compute_rectangular_stroke_path(
        stroke_width: &StrokeWidth,
        corner_radius: &RectangularCornerRadius,
        stroke_style: &StrokeStyle,
        size: &Size,
        shape: &PainterShape,
    ) -> Option<Path> {
        match stroke_width {
            StrokeWidth::None => None,
            StrokeWidth::Uniform(width) => {
                if *width > 0.0 {
                    Some(stroke_geometry(
                        &shape.to_path(),
                        *width,
                        stroke_style.stroke_align,
                        stroke_style.stroke_cap,
                        stroke_style.stroke_join,
                        stroke_style.stroke_miter_limit,
                        stroke_style.stroke_dash_array.as_ref(),
                    ))
                } else {
                    None
                }
            }
            StrokeWidth::Rectangular(rect_stroke) => {
                // Per-side strokes support all alignments and corner radii
                // Use local-space rect (0, 0) since transform is already applied by painter
                let rect = skia_safe::Rect::from_xywh(0.0, 0.0, size.width, size.height);
                Some(stroke_geometry_rectangular(
                    rect,
                    rect_stroke,
                    corner_radius,
                    stroke_style.stroke_align,
                    stroke_style.stroke_miter_limit,
                    stroke_style.stroke_dash_array.as_ref(),
                ))
            }
        }
    }

    /// Flatten an entire scene into a layer list using the provided scene cache.
    pub fn from_scene(scene: &Scene, scene_cache: &SceneCache) -> Self {
        let mut list = LayerList::default();
        for id in scene.graph.roots() {
            let result = Self::flatten_node(&id, &scene.graph, scene_cache, 1.0, &mut list.layers);
            list.commands.extend(result.commands);
        }
        // Build a LUT (id -> index) for picture caching and quick lookup
        // by ensuring `layers` order and `commands` reference the same layer instances.
        list
    }

    /// Build a layer list starting from a node subtree using a scene cache.
    pub fn from_node(
        id: &NodeId,
        graph: &SceneGraph,
        scene_cache: &SceneCache,
        opacity: f32,
    ) -> Self {
        let mut list = LayerList::default();
        let result = Self::flatten_node(id, graph, scene_cache, opacity, &mut list.layers);
        list.commands = result.commands;
        list
    }

    pub fn len(&self) -> usize {
        self.layers.len()
    }

    fn flatten_node(
        id: &NodeId,
        graph: &SceneGraph,
        scene_cache: &SceneCache,
        parent_opacity: f32,
        out: &mut Vec<LayerEntry>,
    ) -> FlattenResult {
        let Ok(node) = graph.get_node(id) else {
            return FlattenResult::default();
        };

        if !node.active() {
            return FlattenResult::default();
        }

        let transform = scene_cache
            .geometry()
            .get_world_transform(id)
            .unwrap_or_else(AffineTransform::identity);

        match node {
            Node::Group(n) => {
                let opacity = parent_opacity * n.opacity;
                let children = graph.get_children(id).map(|c| c.as_slice()).unwrap_or(&[]);
                FlattenResult {
                    commands: Self::build_render_commands(
                        children,
                        graph,
                        scene_cache,
                        opacity,
                        out,
                    ),
                    mask: n.mask,
                }
            }
            Node::Container(n) => {
                let opacity = parent_opacity * n.opacity;
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let size = Size {
                    width: bounds.width,
                    height: bounds.height,
                };
                let stroke_path = Self::compute_rectangular_stroke_path(
                    &n.stroke_width,
                    &n.corner_radius,
                    &n.stroke_style,
                    &size,
                    &shape,
                );
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    stroke_path,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                let mut commands = vec![PainterRenderCommand::Draw(layer)];
                let children = graph.get_children(id).map(|c| c.as_slice()).unwrap_or(&[]);
                let child_commands =
                    Self::build_render_commands(children, graph, scene_cache, opacity, out);
                commands.extend(child_commands);
                FlattenResult {
                    commands,
                    mask: n.mask,
                }
            }
            Node::InitialContainer(_) => {
                // ICB is invisible - only render children
                let children = graph.get_children(id).map(|c| c.as_slice()).unwrap_or(&[]);
                FlattenResult {
                    commands: Self::build_render_commands(
                        children,
                        graph,
                        scene_cache,
                        parent_opacity,
                        out,
                    ),
                    mask: None,
                }
            }
            Node::BooleanOperation(n) => {
                let opacity = parent_opacity * n.opacity;
                if let Some(shape) = boolean_operation_shape(id, n, graph, scene_cache.geometry()) {
                    let stroke_width = n.stroke_width.value_or_zero();
                    let stroke_path = if !n.strokes.is_empty() && stroke_width > 0.0 {
                        Some(stroke_geometry(
                            &shape.to_path(),
                            stroke_width,
                            n.stroke_style.stroke_align,
                            n.stroke_style.stroke_cap,
                            n.stroke_style.stroke_join,
                            n.stroke_style.stroke_miter_limit,
                            n.stroke_style.stroke_dash_array.as_ref(),
                        ))
                    } else {
                        None
                    };
                    let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                        base: PainterPictureLayerBase {
                            id: id.clone(),
                            z_index: out.len(),
                            opacity,
                            blend_mode: n.blend_mode,
                            transform,
                            clip_path: Self::compute_clip_path(id, graph, scene_cache),
                        },
                        shape,
                        effects: Self::filter_active_effects(&n.effects),
                        strokes: Self::filter_visible_paints(&n.strokes),
                        fills: Self::filter_visible_paints(&n.fills),
                        stroke_path,
                        stroke_decoration_start: StrokeDecoration::None,
                        stroke_decoration_end: StrokeDecoration::None,
                        stroke_width: 0.0,
                    });
                    out.push(LayerEntry {
                        id: id.clone(),
                        layer: layer.clone(),
                    });
                    FlattenResult {
                        commands: vec![PainterRenderCommand::Draw(layer)],
                        mask: n.mask,
                    }
                } else {
                    let children = graph.get_children(id).map(|c| c.as_slice()).unwrap_or(&[]);
                    FlattenResult {
                        commands: Self::build_render_commands(
                            children,
                            graph,
                            scene_cache,
                            opacity,
                            out,
                        ),
                        mask: n.mask,
                    }
                }
            }
            Node::Rectangle(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let stroke_path = Self::compute_rectangular_stroke_path(
                    &n.stroke_width,
                    &n.corner_radius,
                    &n.stroke_style,
                    &n.size,
                    &shape,
                );
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    stroke_path,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::Ellipse(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let stroke_width = n.render_bounds_stroke_width();
                let stroke_path = if stroke_width > 0.0 {
                    Some(stroke_geometry(
                        &shape.to_path(),
                        stroke_width,
                        n.stroke_style.stroke_align,
                        n.stroke_style.stroke_cap,
                        n.stroke_style.stroke_join,
                        n.stroke_style.stroke_miter_limit,
                        n.stroke_style.stroke_dash_array.as_ref(),
                    ))
                } else {
                    None
                };
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    stroke_path,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::Polygon(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let stroke_width = n.render_bounds_stroke_width();
                let stroke_path = if stroke_width > 0.0 {
                    Some(stroke_geometry(
                        &shape.to_path(),
                        stroke_width,
                        n.stroke_style.stroke_align,
                        n.stroke_style.stroke_cap,
                        n.stroke_style.stroke_join,
                        n.stroke_style.stroke_miter_limit,
                        n.stroke_style.stroke_dash_array.as_ref(),
                    ))
                } else {
                    None
                };
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    stroke_path,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::RegularPolygon(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let stroke_width = n.render_bounds_stroke_width();
                let stroke_path = if stroke_width > 0.0 {
                    Some(stroke_geometry(
                        &shape.to_path(),
                        stroke_width,
                        n.stroke_style.stroke_align,
                        n.stroke_style.stroke_cap,
                        n.stroke_style.stroke_join,
                        n.stroke_style.stroke_miter_limit,
                        n.stroke_style.stroke_dash_array.as_ref(),
                    ))
                } else {
                    None
                };
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    stroke_path,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::RegularStarPolygon(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let stroke_width = n.render_bounds_stroke_width();
                let stroke_path = if stroke_width > 0.0 {
                    Some(stroke_geometry(
                        &shape.to_path(),
                        stroke_width,
                        n.stroke_style.stroke_align,
                        n.stroke_style.stroke_cap,
                        n.stroke_style.stroke_join,
                        n.stroke_style.stroke_miter_limit,
                        n.stroke_style.stroke_dash_array.as_ref(),
                    ))
                } else {
                    None
                };
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    stroke_path,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::Line(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let stroke_path = if n.stroke_width > 0.0 {
                    Some(stroke_geometry(
                        &shape.to_path(),
                        n.stroke_width,
                        n.get_stroke_align(),
                        n.stroke_cap,
                        StrokeJoin::default(), // Join not applicable for single line
                        n.stroke_miter_limit,
                        n.stroke_dash_array.as_ref(),
                    ))
                } else {
                    None
                };
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: n.strokes.clone(),
                    fills: Paints::default(),
                    stroke_path,
                    stroke_decoration_start: n.stroke_decoration_start,
                    stroke_decoration_end: n.stroke_decoration_end,
                    stroke_width: n.stroke_width,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::TextSpan(n) => {
                let text_bounds =
                    scene_cache
                        .geometry()
                        .get_world_bounds(id)
                        .unwrap_or_else(|| Rectangle {
                            x: n.x(),
                            y: n.y(),
                            width: n.width.unwrap_or(100.0),
                            height: (n.text_style.font_size
                                * match n.text_style.line_height {
                                    TextLineHeight::Fixed(height) => {
                                        height / n.text_style.font_size
                                    }
                                    TextLineHeight::Factor(factor) => factor,
                                    TextLineHeight::Normal => 1.2,
                                }
                                * 2.0)
                                .max(0.0),
                        });

                let rect_height = n.height.unwrap_or(text_bounds.height);
                let shape = PainterShape::from_rect(skia_safe::Rect::from_xywh(
                    0.0,
                    0.0,
                    text_bounds.width,
                    rect_height,
                ));

                let layer = PainterPictureLayer::Text(PainterPictureTextLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    width: n.width,
                    height: n.height,
                    max_lines: n.max_lines,
                    ellipsis: n.ellipsis.clone(),
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    stroke_width: n.stroke_width,
                    stroke_align: n.stroke_align,
                    stroke_path: None,
                    shape,
                    text: n.text.clone(),
                    text_style: n.text_style.clone(),
                    text_align: n.text_align,
                    text_align_vertical: n.text_align_vertical,
                    id: id.clone(),
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::Path(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let stroke_width = n.stroke_width.value_or_zero();
                let stroke_path = if stroke_width > 0.0 {
                    Some(stroke_geometry(
                        &shape.to_path(),
                        stroke_width,
                        n.stroke_style.stroke_align,
                        n.stroke_style.stroke_cap,
                        n.stroke_style.stroke_join,
                        n.stroke_style.stroke_miter_limit,
                        n.stroke_style.stroke_dash_array.as_ref(),
                    ))
                } else {
                    None
                };
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    stroke_path,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::Vector(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let layer = PainterPictureLayer::Vector(PainterPictureVectorLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&n.fills),
                    vector: n.network.clone(),
                    stroke_width: n.stroke_width,
                    stroke_align: n.get_stroke_align(),
                    stroke_cap: n.stroke_cap,
                    stroke_join: n.stroke_join,
                    stroke_miter_limit: n.stroke_miter_limit,
                    stroke_width_profile: n.stroke_width_profile.clone(),
                    stroke_dash_array: n.stroke_dash_array.clone(),
                    corner_radius: n.corner_radius,
                    stroke_decoration_start: n.stroke_decoration_start,
                    stroke_decoration_end: n.stroke_decoration_end,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::Image(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let stroke_width = n.render_bounds_stroke_width();
                let stroke_path = if stroke_width > 0.0 {
                    Some(stroke_geometry(
                        &shape.to_path(),
                        stroke_width,
                        n.stroke_style.stroke_align,
                        n.stroke_style.stroke_cap,
                        n.stroke_style.stroke_join,
                        n.stroke_style.stroke_miter_limit,
                        n.stroke_style.stroke_dash_array.as_ref(),
                    ))
                } else {
                    None
                };
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: n.blend_mode,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: Self::filter_active_effects(&n.effects),
                    strokes: Self::filter_visible_paints(&n.strokes),
                    fills: Self::filter_visible_paints(&Paints::new([Paint::Image(
                        n.fill.clone(),
                    )])),
                    stroke_path,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: n.mask,
                }
            }
            Node::Error(n) => {
                let bounds = scene_cache
                    .geometry()
                    .get_world_bounds(id)
                    .expect("Geometry must exist");
                let shape = build_shape(node, &bounds);
                let layer = PainterPictureLayer::Shape(PainterPictureShapeLayer {
                    base: PainterPictureLayerBase {
                        id: id.clone(),
                        z_index: out.len(),
                        opacity: parent_opacity * n.opacity,
                        blend_mode: LayerBlendMode::PassThrough,
                        transform,
                        clip_path: Self::compute_clip_path(id, graph, scene_cache),
                    },
                    shape,
                    effects: LayerEffects::default(),
                    strokes: Paints::default(),
                    fills: Paints::default(),
                    stroke_path: None,
                    stroke_decoration_start: StrokeDecoration::None,
                    stroke_decoration_end: StrokeDecoration::None,
                    stroke_width: 0.0,
                });
                out.push(LayerEntry {
                    id: id.clone(),
                    layer: layer.clone(),
                });
                FlattenResult {
                    commands: vec![PainterRenderCommand::Draw(layer)],
                    mask: None,
                }
            }
        }
    }

    fn build_render_commands(
        children: &[NodeId],
        graph: &SceneGraph,
        scene_cache: &SceneCache,
        parent_opacity: f32,
        out: &mut Vec<LayerEntry>,
    ) -> Vec<PainterRenderCommand> {
        // Build render commands from child nodes using flat list model.
        // Iterate children in z-order (bottom→top). Accumulate non-mask commands in `run`.
        // When a mask node is encountered, emit MaskGroup { mask, items: run } and clear run.
        let mut out_commands = Vec::new();
        let mut run: Vec<PainterRenderCommand> = Vec::new();
        for child_id in children {
            let result = Self::flatten_node(child_id, graph, scene_cache, parent_opacity, out);
            if let Some(mask_type) = result.mask {
                let mask_commands = result.commands;
                // Emit a scope with the accumulated run as content under this mask
                out_commands.push(PainterRenderCommand::MaskGroup(PainterMaskGroup {
                    mask_type,
                    mask_commands,
                    content_commands: std::mem::take(&mut run),
                }));
            } else {
                // Not a mask — accumulate into the current run
                run.extend(result.commands);
            }
        }
        // Flush remaining run (no mask above it)
        out_commands.extend(run.into_iter());
        out_commands
    }

    pub fn filter(&self, filter: impl Fn(&PainterPictureLayer) -> bool) -> Self {
        let mut list = LayerList::default();
        for indexed in &self.layers {
            if filter(&indexed.layer) {
                list.layers.push(indexed.clone());
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
        graph: &SceneGraph,
        scene_cache: &SceneCache,
    ) -> Option<Path> {
        let mut clip_shapes = Vec::new();
        // Start from the parent of the current node so that a node's own
        // `clip` property only affects its descendants and not itself.
        let mut current_id = scene_cache.geometry().get_parent(node_id);

        let current_world = scene_cache
            .geometry()
            .get_world_transform(node_id)
            .unwrap_or_else(AffineTransform::identity);
        let current_inv = current_world
            .inverse()
            .unwrap_or_else(AffineTransform::identity);

        // Walk up the hierarchy to collect clip shapes
        while let Some(id) = current_id {
            if let Ok(node) = graph.get_node(&id) {
                match node {
                    Node::Container(n) => {
                        if n.clip {
                            // Get the world transform for this node
                            let world_transform = scene_cache
                                .geometry()
                                .get_world_transform(&id)
                                .unwrap_or_else(AffineTransform::identity);

                            // Build the shape and transform it relative to the current node
                            let bounds = scene_cache
                                .geometry()
                                .get_world_bounds(&id)
                                .expect("Geometry must exist");
                            let shape = build_shape(node, &bounds);
                            let mut path = shape.to_path();
                            let relative_transform = current_inv.compose(&world_transform);
                            path = path.make_transform(&sk::sk_matrix(relative_transform.matrix));

                            clip_shapes.push((
                                PainterShape::from_path(path),
                                BooleanPathOperation::Intersection,
                            ));
                        }
                    }
                    Node::BooleanOperation(n) => {
                        if let Some(mut path) =
                            boolean_operation_path(&id, n, graph, scene_cache.geometry())
                        {
                            let world_transform = scene_cache
                                .geometry()
                                .get_world_transform(&id)
                                .unwrap_or_else(AffineTransform::identity);
                            let relative_transform = current_inv.compose(&world_transform);
                            path = path.make_transform(&sk::sk_matrix(relative_transform.matrix));

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
