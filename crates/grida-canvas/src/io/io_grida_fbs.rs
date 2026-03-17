//! FlatBuffers (`.grida`) → Rust runtime decoder.
//!
//! Converts a `GridaFile` FlatBuffers binary into a `Scene`.
//!
//! The FBS document stores nodes in a flat `[NodeSlot]` list.  Each layer node
//! carries a `ParentReference` (parent id + fractional-index position string)
//! so the tree can be reconstructed after decoding.  Scene nodes are the roots.
//!
//! ## Usage
//!
//! ```no_run
//! use cg::io::io_grida_fbs;
//! let bytes = std::fs::read("example.grida").unwrap();
//! let scene = io_grida_fbs::decode(&bytes).unwrap();
//! ```

use std::collections::HashMap;

use math2::{box_fit::BoxFit, transform::AffineTransform};

/// Schema version emitted by the Rust FlatBuffers writer.
///
/// Keep in sync with the TS constant `grida.program.document.SCHEMA_VERSION`
/// (`packages/grida-canvas-schema/grida.ts`).
pub const SCHEMA_VERSION: &str = "0.91.0-beta+20260311";

use crate::cg::{
    alignment::Alignment,
    color::CGColor,
    fe::{
        FeBackdropBlur, FeBlur, FeGaussianBlur, FeLayerBlur, FeLiquidGlass, FeNoiseEffect,
        FeProgressiveBlur, FeShadow, FilterShadowEffect, NoiseEffectColors,
    },
    stroke_dasharray::StrokeDashArray,
    stroke_width::{RectangularStrokeWidth, SingularStrokeWidth, StrokeWidth},
    tilemode::TileMode,
    varwidth,
    types::{
        Axis, BlendMode, BooleanPathOperation, CGPoint, ContainerClipFlag, CornerSmoothing,
        CrossAxisAlignment, EdgeInsets, FontWeight, GradientStop, ImageFilters, ImagePaint,
        ImagePaintFit, LayerBlendMode, LayerMaskType, LayoutGap, LayoutMode, LayoutPositioning,
        LayoutWrap, LinearGradientPaint, MainAxisAlignment, Paint, Paints, RadialGradientPaint,
        RectangularCornerRadius, ResourceRef, SolidPaint, StrokeAlign, StrokeCap, StrokeJoin,
        StrokeMarkerPreset, StrokeMiterLimit, SweepGradientPaint, TextAlign, TextAlignVertical,
        TextStyleRec,
    },
};
use crate::node::{
    id::NodeIdGenerator,
    scene_graph::SceneGraph,
    schema::{
        BooleanPathOperationNodeRec, ContainerNodeRec, EllipseNodeRec, GroupNodeRec,
        InitialContainerNodeRec, LayerEffects, LayoutChildStyle, LayoutContainerStyle,
        LayoutDimensionStyle, LayoutPositioningBasis, LineNodeRec, Node, RectangleNodeRec,
        RegularPolygonNodeRec, RegularStarPolygonNodeRec, Scene, Size, StrokeStyle,
        TextSpanNodeRec, VectorNodeRec,
    },
};
use crate::vectornetwork::{
    VectorNetwork, VectorNetworkLoop, VectorNetworkRegion, VectorNetworkSegment,
};

use super::generated::grida::grida as fbs;

// ─────────────────────────────────────────────────────────────────────────────
// Error type
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum FbsDecodeError {
    InvalidBuffer(flatbuffers::InvalidFlatbuffer),
    MissingDocument,
    MissingScene,
}

impl std::fmt::Display for FbsDecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FbsDecodeError::InvalidBuffer(e) => write!(f, "invalid FlatBuffer: {e}"),
            FbsDecodeError::MissingDocument => write!(f, "GridaFile.document is null"),
            FbsDecodeError::MissingScene => write!(f, "document has no scenes"),
        }
    }
}

impl std::error::Error for FbsDecodeError {}

impl From<flatbuffers::InvalidFlatbuffer> for FbsDecodeError {
    fn from(e: flatbuffers::InvalidFlatbuffer) -> Self {
        FbsDecodeError::InvalidBuffer(e)
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Shared intermediate structs — decoded once, threaded into every node builder
// ═════════════════════════════════════════════════════════════════════════════

/// Fields common to every layer-bearing node, decoded from `LayerTrait`.
struct LayerCommon {
    active: bool,
    opacity: f32,
    blend_mode: LayerBlendMode,
    mask: Option<LayerMaskType>,
    effects: LayerEffects,
    /// Rotation in degrees — only used by Container/InitialContainer nodes
    /// that store rotation as a plain f32 field. For shape/line/text nodes
    /// use `rotation_cos_sin` instead to avoid lossy degree conversion.
    rotation: f32,
    /// Raw (cos, sin) extracted directly from the FBS `CGTransform2D` matrix.
    /// Used by shape/line/text/group decoders to build transforms without
    /// lossy `atan2 → to_degrees → to_radians → sin_cos` round-trips.
    rotation_cos_sin: (f32, f32),
    layout_child: Option<LayoutChildStyle>,
}

/// Spatial properties for shape-like nodes (everything except Container and
/// InitialContainer) — position, size, and the transform that bakes them together.
struct ShapeLayout {
    x: f32,
    y: f32,
    size: Size,
    /// `from_box_center(x, y, w, h, rotation)` — the canonical shape transform.
    transform: AffineTransform,
    width: Option<f32>,
    height: Option<f32>,
}

fn decode_layer_common(sys: &fbs::SystemNodeTrait<'_>, layer: &fbs::LayerTrait<'_>) -> LayerCommon {
    let layout = layer.layout();
    let plt = layer.post_layout_transform();
    LayerCommon {
        active: sys.active(),
        opacity: layer.opacity(),
        blend_mode: decode_layer_blend_mode(layer.blend_mode()),
        mask: decode_mask_type(layer.mask_type_type()),
        effects: decode_layer_effects(layer.effects()),
        rotation: extract_rotation_degrees(plt),
        rotation_cos_sin: extract_rotation_cos_sin(plt),
        layout_child: layout.as_ref().and_then(decode_layout_child_style),
    }
}

fn decode_shape_layout(layer: &fbs::LayerTrait<'_>, cos_sin: (f32, f32)) -> ShapeLayout {
    let layout = layer.layout();
    let (x, y) = layout.as_ref().map(decode_layout_xy).unwrap_or((0.0, 0.0));
    let (w, h) = layout.as_ref().map(decode_dimensions).unwrap_or((None, None));
    let size = Size {
        width: w.unwrap_or(0.0),
        height: h.unwrap_or(0.0),
    };
    let (cos, sin) = cos_sin;
    let transform =
        AffineTransform::from_box_center_raw(x, y, size.width, size.height, cos, sin);
    ShapeLayout {
        x,
        y,
        size,
        transform,
        width: w,
        height: h,
    }
}

fn singular_stroke_width(w: f32) -> SingularStrokeWidth {
    if w == 0.0 {
        SingularStrokeWidth(None)
    } else {
        SingularStrokeWidth(Some(w))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/// Result of decoding a `.grida` FlatBuffers binary that also carries the
/// ID mapping needed for re-encoding.
pub struct DecodeResult {
    /// The decoded scenes (typically one).
    pub scenes: Vec<Scene>,
    /// Mapping from internal `NodeId` to the original string IDs stored in the
    /// FBS file.  Required for [`encode`] round-trips.
    pub id_map: HashMap<crate::node::id::NodeId, String>,
    /// The string IDs of the scene nodes, in document order.
    pub scene_ids: Vec<String>,
    /// Mapping from internal `NodeId` to the original fractional-index position
    /// string stored in the FBS file. Required for [`encode`] round-trips so
    /// that child ordering is preserved exactly.
    pub position_map: HashMap<crate::node::id::NodeId, String>,
}

/// Decode a `.grida` FlatBuffers binary into a `Scene`.
///
/// Picks the first scene listed in `CanvasDocument.scenes`. If the document
/// contains multiple scenes, use `decode_all` and index into the result.
pub fn decode(bytes: &[u8]) -> Result<Scene, FbsDecodeError> {
    let scenes = decode_all(bytes)?;
    scenes
        .into_iter()
        .next()
        .ok_or(FbsDecodeError::MissingScene)
}

/// Decode a `.grida` FlatBuffers binary and return the full [`DecodeResult`]
/// including the ID mapping needed for round-trip encoding.
pub fn decode_with_id_map(bytes: &[u8]) -> Result<DecodeResult, FbsDecodeError> {
    decode_all_inner(bytes)
}

/// Decode a `.grida` FlatBuffers binary into all `Scene`s present in the document.
pub fn decode_all(bytes: &[u8]) -> Result<Vec<Scene>, FbsDecodeError> {
    decode_all_inner(bytes).map(|r| r.scenes)
}

fn decode_all_inner(bytes: &[u8]) -> Result<DecodeResult, FbsDecodeError> {
    let opts = flatbuffers::VerifierOptions {
        max_tables: usize::MAX,
        max_depth: 1024,
        ..Default::default()
    };
    let grida_file = flatbuffers::root_with_opts::<fbs::GridaFile>(&opts, bytes)?;
    let document = grida_file
        .document()
        .ok_or(FbsDecodeError::MissingDocument)?;

    // ── 1. Collect scene node IDs (scene ordering) ──────────────────────────
    let mut scene_ids_ordered: Vec<String> = Vec::new();
    if let Some(scenes_vec) = document.scenes() {
        for i in 0..scenes_vec.len() {
            scene_ids_ordered.push(scenes_vec.get(i).id().to_owned());
        }
    }

    // ── 2. Decode all node slots ─────────────────────────────────────────────

    struct NodeEntry {
        id: String,
        parent: Option<(String, String)>, // (parent_id, fractional-index position)
        node: Node,
    }

    struct SceneMeta {
        #[allow(dead_code)]
        id: String,
        name: String,
        background_color: Option<CGColor>,
    }

    let mut node_entries: Vec<NodeEntry> = Vec::new();
    let mut scene_metas: HashMap<String, SceneMeta> = HashMap::new();

    /// Helper macro: every layer-bearing node type follows the same pattern of
    /// extracting `sys`, `layer`, `id`, `parent` from the slot, then calling a
    /// decoder.  This macro eliminates that boilerplate and makes it impossible
    /// to forget any step.
    macro_rules! decode_layer_node {
        ($slot:expr, $accessor:ident, $decode_fn:expr) => {
            if let Some(typed) = $slot.$accessor() {
                let sys = typed.node();
                let layer = typed.layer();
                let id = sys.id().id().to_owned();
                let parent = decode_parent_ref(&layer);
                let lc = decode_layer_common(&sys, &layer);
                let node = $decode_fn(&lc, &layer, &typed);
                node_entries.push(NodeEntry { id, parent, node });
            }
        };
    }

    if let Some(nodes_vec) = document.nodes() {
        for i in 0..nodes_vec.len() {
            let slot = nodes_vec.get(i);
            match slot.node_type() {
                fbs::Node::SceneNode => {
                    if let Some(sn) = slot.node_as_scene_node() {
                        let sys = sn.node();
                        let id = sys.id().id().to_owned();
                        let name = sys.name().unwrap_or("").to_owned();
                        let bg = sn
                            .scene_background_color()
                            .map(decode_rgba32f_to_cg_color);
                        scene_metas.insert(
                            id.clone(),
                            SceneMeta {
                                id,
                                name,
                                background_color: bg,
                            },
                        );
                    }
                }
                fbs::Node::GroupNode => {
                    decode_layer_node!(slot, node_as_group_node, decode_group_node);
                }
                fbs::Node::ContainerNode => {
                    decode_layer_node!(slot, node_as_container_node, decode_container_node);
                }
                fbs::Node::InitialContainerNode => {
                    decode_layer_node!(
                        slot,
                        node_as_initial_container_node,
                        decode_initial_container_node
                    );
                }
                fbs::Node::BasicShapeNode => {
                    decode_layer_node!(slot, node_as_basic_shape_node, decode_basic_shape_node);
                }
                fbs::Node::VectorNode => {
                    decode_layer_node!(slot, node_as_vector_node, decode_vector_node);
                }
                fbs::Node::LineNode => {
                    decode_layer_node!(slot, node_as_line_node, decode_line_node);
                }
                fbs::Node::TextSpanNode => {
                    decode_layer_node!(slot, node_as_text_span_node, decode_text_span_node);
                }
                fbs::Node::BooleanOperationNode => {
                    decode_layer_node!(
                        slot,
                        node_as_boolean_operation_node,
                        decode_boolean_operation_node
                    );
                }
                fbs::Node::UnknownNode | fbs::Node::NONE | _ => {}
            }
        }
    }

    // ── 3. Build ID mapping (string → internal NodeId) ───────────────────────
    let mut string_to_internal_id: HashMap<String, crate::node::id::NodeId> = HashMap::new();
    let mut id_generator = NodeIdGenerator::new();

    for e in &node_entries {
        string_to_internal_id
            .entry(e.id.clone())
            .or_insert_with(|| id_generator.next());
    }
    for (sid, _) in &scene_metas {
        string_to_internal_id
            .entry(sid.clone())
            .or_insert_with(|| id_generator.next());
    }

    let get_id = |s: &String| string_to_internal_id.get(s).copied();

    // ── 4. Build children_by_parent (sorted by fractional index) ─────────────
    let mut children_by_parent: HashMap<String, Vec<(String, String)>> = HashMap::new();
    for e in &node_entries {
        if let Some((parent_id, position)) = &e.parent {
            children_by_parent
                .entry(parent_id.clone())
                .or_default()
                .push((e.id.clone(), position.clone()));
        }
    }
    for children in children_by_parent.values_mut() {
        children.sort_by(|a, b| a.1.cmp(&b.1));
    }

    let node_pairs: Vec<_> = node_entries
        .iter()
        .filter_map(|e| Some((get_id(&e.id)?, e.node.clone())))
        .collect();

    let internal_links: HashMap<_, Vec<_>> = children_by_parent
        .iter()
        .filter_map(|(parent_str, children)| {
            let parent_internal = get_id(parent_str)?;
            let child_internals: Vec<_> = children
                .iter()
                .filter_map(|(child_str, _)| get_id(child_str))
                .collect();
            if child_internals.is_empty() {
                None
            } else {
                Some((parent_internal, child_internals))
            }
        })
        .collect();

    // ── 5. Produce one Scene per listed scene id ──────────────────────────────
    let mut scenes: Vec<Scene> = Vec::new();

    let iter: Box<dyn Iterator<Item = &String>> = if !scene_ids_ordered.is_empty() {
        Box::new(scene_ids_ordered.iter())
    } else {
        Box::new(scene_metas.keys())
    };

    for scene_id_str in iter {
        let meta = scene_metas.get(scene_id_str);
        let name = meta.map(|m| m.name.clone()).unwrap_or_default();
        let background_color = meta.and_then(|m| m.background_color);

        let roots_strings = children_by_parent
            .get(scene_id_str)
            .cloned()
            .unwrap_or_default();
        let roots_internal: Vec<_> = roots_strings
            .iter()
            .filter_map(|(child_str, _)| get_id(child_str))
            .collect();

        let graph = SceneGraph::new_from_snapshot(
            node_pairs.clone(),
            internal_links.clone(),
            roots_internal,
        );

        scenes.push(Scene {
            name,
            graph,
            background_color,
        });
    }

    // Build the reverse id map (internal → string) for round-trip encoding.
    let id_map: HashMap<crate::node::id::NodeId, String> = string_to_internal_id
        .iter()
        .map(|(s, &nid)| (nid, s.clone()))
        .collect();

    // Build the position map (internal NodeId → original position string)
    // so the encoder can preserve child ordering exactly.
    let mut position_map: HashMap<crate::node::id::NodeId, String> = HashMap::new();
    for e in &node_entries {
        if let Some((_parent_id, position)) = &e.parent {
            if let Some(&nid) = string_to_internal_id.get(&e.id) {
                position_map.insert(nid, position.clone());
            }
        }
    }

    Ok(DecodeResult {
        scenes,
        id_map,
        scene_ids: scene_ids_ordered,
        position_map,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy helpers
// ─────────────────────────────────────────────────────────────────────────────

fn decode_parent_ref(layer: &fbs::LayerTrait<'_>) -> Option<(String, String)> {
    let parent_ref = layer.parent();
    let parent_id = parent_ref.parent_id().id().to_owned();
    if parent_id.is_empty() {
        return None;
    }
    let position = parent_ref.position().unwrap_or("").to_owned();
    Some((parent_id, position))
}

// ─────────────────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────────────────

fn decode_rgba32f_to_cg_color(rgba: &fbs::RGBA32F) -> CGColor {
    CGColor {
        r: (rgba.r().clamp(0.0, 1.0) * 255.0).round() as u8,
        g: (rgba.g().clamp(0.0, 1.0) * 255.0).round() as u8,
        b: (rgba.b().clamp(0.0, 1.0) * 255.0).round() as u8,
        a: (rgba.a().clamp(0.0, 1.0) * 255.0).round() as u8,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enum mapping macro + all enum conversions
// ─────────────────────────────────────────────────────────────────────────────

/// Generate a matched pair of `decode_*` and `encode_*` functions for a
/// 1-to-1 enum mapping between an FBS type and a Rust type.
///
/// Syntax:
///   `enum_map!(decode_fn, encode_fn, FbsType, RustType, default, { Variant1, Variant2, … });`
///
/// The `default` is returned by `decode_fn` when the FBS value doesn't match
/// any listed variant (forward-compat for new enum members added later).
macro_rules! enum_map {
    ($decode:ident, $encode:ident, $fbs:ty, $rust:ty, $default:expr, { $($v:ident),+ $(,)? }) => {
        fn $decode(v: $fbs) -> $rust {
            match v { $( <$fbs>::$v => <$rust>::$v, )+ _ => $default, }
        }
        fn $encode(v: $rust) -> $fbs {
            match v { $( <$rust>::$v => <$fbs>::$v, )+ }
        }
    };
}

enum_map!(decode_blend_mode, encode_blend_mode, fbs::BlendMode, BlendMode, BlendMode::Normal, {
    Normal, Multiply, Screen, Overlay, Darken, Lighten, ColorDodge, ColorBurn,
    HardLight, SoftLight, Difference, Exclusion, Hue, Saturation, Color, Luminosity,
});

fn decode_layer_blend_mode(fbs_mode: fbs::LayerBlendMode) -> LayerBlendMode {
    match fbs_mode {
        fbs::LayerBlendMode::PassThrough => LayerBlendMode::PassThrough,
        other => LayerBlendMode::Blend(decode_blend_mode(fbs::BlendMode(other.0))),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paint decoding
// ─────────────────────────────────────────────────────────────────────────────

fn decode_gradient_stops(stops: flatbuffers::Vector<'_, fbs::GradientStop>) -> Vec<GradientStop> {
    (0..stops.len())
        .map(|i| {
            let s = stops.get(i);
            let color = decode_rgba32f_to_cg_color(s.stop_color());
            GradientStop {
                offset: s.stop_offset(),
                color,
            }
        })
        .collect()
}

fn decode_fbs_transform(t: &fbs::CGTransform2D) -> AffineTransform {
    AffineTransform::from_acebdf(t.m00(), t.m01(), t.m02(), t.m10(), t.m11(), t.m12())
}

fn extract_rotation_degrees(transform: Option<&fbs::CGTransform2D>) -> f32 {
    match transform {
        Some(t) => t.m10().atan2(t.m00()).to_degrees(),
        None => 0.0,
    }
}

/// Extract the raw (cos, sin) pair directly from the `CGTransform2D` matrix,
/// avoiding the lossy `atan2 → to_degrees → to_radians → sin_cos` chain.
fn extract_rotation_cos_sin(transform: Option<&fbs::CGTransform2D>) -> (f32, f32) {
    match transform {
        Some(t) => (t.m00(), t.m10()),
        None => (1.0, 0.0),
    }
}

fn decode_paint_item(item: &fbs::PaintStackItem<'_>) -> Option<Paint> {
    match item.paint_type() {
        fbs::Paint::SolidPaint => {
            let sp = item.paint_as_solid_paint()?;
            let color = sp
                .color()
                .map(decode_rgba32f_to_cg_color)
                .unwrap_or(CGColor::TRANSPARENT);
            Some(Paint::Solid(SolidPaint {
                active: sp.active(),
                color,
                blend_mode: decode_blend_mode(sp.blend_mode()),
            }))
        }
        fbs::Paint::LinearGradientPaint => {
            let lgp = item.paint_as_linear_gradient_paint()?;
            let stops = lgp.stops().map(decode_gradient_stops).unwrap_or_default();
            let transform = lgp
                .transform()
                .map(decode_fbs_transform)
                .unwrap_or_default();
            let xy1 = lgp
                .xy1()
                .map(|a| Alignment(a.x(), a.y()))
                .unwrap_or(Alignment::CENTER_LEFT);
            let xy2 = lgp
                .xy2()
                .map(|a| Alignment(a.x(), a.y()))
                .unwrap_or(Alignment::CENTER_RIGHT);
            Some(Paint::LinearGradient(LinearGradientPaint {
                active: lgp.active(),
                xy1,
                xy2,
                tile_mode: TileMode::default(),
                transform,
                stops,
                opacity: lgp.opacity(),
                blend_mode: decode_blend_mode(lgp.blend_mode()),
            }))
        }
        fbs::Paint::RadialGradientPaint => {
            let rgp = item.paint_as_radial_gradient_paint()?;
            let stops = rgp.stops().map(decode_gradient_stops).unwrap_or_default();
            let transform = rgp
                .transform()
                .map(decode_fbs_transform)
                .unwrap_or_default();
            Some(Paint::RadialGradient(RadialGradientPaint {
                active: rgp.active(),
                transform,
                stops,
                opacity: rgp.opacity(),
                blend_mode: decode_blend_mode(rgp.blend_mode()),
                tile_mode: TileMode::default(),
            }))
        }
        fbs::Paint::SweepGradientPaint => {
            let sgp = item.paint_as_sweep_gradient_paint()?;
            let stops = sgp.stops().map(decode_gradient_stops).unwrap_or_default();
            let transform = sgp
                .transform()
                .map(decode_fbs_transform)
                .unwrap_or_default();
            Some(Paint::SweepGradient(SweepGradientPaint {
                active: sgp.active(),
                transform,
                stops,
                opacity: sgp.opacity(),
                blend_mode: decode_blend_mode(sgp.blend_mode()),
            }))
        }
        fbs::Paint::ImagePaint => {
            let ip = item.paint_as_image_paint()?;
            let image_ref = if let Some(hash_ref) = ip.image_as_resource_ref_hash() {
                ResourceRef::HASH(hash_ref.hash().unwrap_or("").to_owned())
            } else if let Some(rid_ref) = ip.image_as_resource_ref_rid() {
                ResourceRef::RID(rid_ref.rid().unwrap_or("").to_owned())
            } else {
                return None;
            };
            let alignement = ip
                .alignement()
                .map(|a| Alignment(a.x(), a.y()))
                .unwrap_or(Alignment::CENTER);
            let fit = decode_image_paint_fit(&ip);
            Some(Paint::Image(ImagePaint {
                active: ip.active(),
                image: image_ref,
                quarter_turns: ip.quarter_turns(),
                alignement,
                fit,
                opacity: ip.opacity(),
                blend_mode: decode_blend_mode(ip.blend_mode()),
                filters: ImageFilters::default(),
            }))
        }
        _ => None,
    }
}

fn decode_image_paint_fit(ip: &fbs::ImagePaint<'_>) -> ImagePaintFit {
    match ip.fit_type() {
        fbs::ImagePaintFit::ImagePaintFitFit => {
            let box_fit = ip
                .fit_as_image_paint_fit_fit()
                .map(|f| decode_box_fit(f.box_fit()))
                .unwrap_or(BoxFit::Cover);
            ImagePaintFit::Fit(box_fit)
        }
        fbs::ImagePaintFit::ImagePaintFitTransform => {
            let transform = ip
                .fit_as_image_paint_fit_transform()
                .and_then(|f| f.transform())
                .map(decode_fbs_transform)
                .unwrap_or_default();
            ImagePaintFit::Transform(transform)
        }
        _ => ImagePaintFit::Fit(BoxFit::Cover),
    }
}

enum_map!(decode_box_fit, encode_box_fit, fbs::BoxFit, BoxFit, BoxFit::Cover, {
    Contain, Cover, Fill, None,
});

fn decode_paints_vec(
    vec: Option<flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<fbs::PaintStackItem<'_>>>>,
) -> Paints {
    let items = match vec {
        Some(v) => v,
        None => return Paints::new(Vec::<Paint>::new()),
    };
    let paints: Vec<_> = (0..items.len())
        .filter_map(|i| decode_paint_item(&items.get(i)))
        .collect();
    Paints::new(paints)
}

// ─────────────────────────────────────────────────────────────────────────────
// Effects decoding
// ─────────────────────────────────────────────────────────────────────────────

/// Decode the `FeBlur` union from an `FeLayerBlur` or `FeBackdropBlur` table.
///
/// Checks the `blur_type` discriminant first; falls back to Gaussian if
/// the variant is unrecognised or the payload is missing.
fn decode_fe_blur_from_layer(lb: &fbs::FeLayerBlur<'_>) -> FeBlur {
    match lb.blur_type() {
        fbs::FeBlur::FeProgressiveBlur => {
            if let Some(p) = lb.blur_as_fe_progressive_blur() {
                return decode_progressive_blur(&p);
            }
        }
        _ => {}
    }
    // Default / Gaussian path
    FeBlur::Gaussian(FeGaussianBlur {
        radius: lb
            .blur_as_fe_gaussian_blur()
            .map(|g| g.radius())
            .unwrap_or(0.0),
    })
}

fn decode_fe_blur_from_backdrop(bb: &fbs::FeBackdropBlur<'_>) -> FeBlur {
    match bb.blur_type() {
        fbs::FeBlur::FeProgressiveBlur => {
            if let Some(p) = bb.blur_as_fe_progressive_blur() {
                return decode_progressive_blur(&p);
            }
        }
        _ => {}
    }
    FeBlur::Gaussian(FeGaussianBlur {
        radius: bb
            .blur_as_fe_gaussian_blur()
            .map(|g| g.radius())
            .unwrap_or(0.0),
    })
}

fn decode_progressive_blur(p: &fbs::FeProgressiveBlur<'_>) -> FeBlur {
    let start = p
        .start()
        .map(|a| Alignment(a.x(), a.y()))
        .unwrap_or(Alignment(0.0, 0.0));
    let end = p
        .end()
        .map(|a| Alignment(a.x(), a.y()))
        .unwrap_or(Alignment(0.0, 0.0));
    FeBlur::Progressive(FeProgressiveBlur {
        start,
        end,
        radius: p.radius(),
        radius2: p.radius2(),
    })
}

fn decode_layer_effects(effects: Option<fbs::LayerEffects<'_>>) -> LayerEffects {
    let effects = match effects {
        Some(e) => e,
        None => return LayerEffects::default(),
    };

    let mut out = LayerEffects::default();

    if let Some(lb) = effects.fe_blur() {
        out.blur = Some(FeLayerBlur {
            blur: decode_fe_blur_from_layer(&lb),
            active: lb.active(),
        });
    }

    if let Some(bb) = effects.fe_backdrop_blur() {
        out.backdrop_blur = Some(FeBackdropBlur {
            blur: decode_fe_blur_from_backdrop(&bb),
            active: bb.active(),
        });
    }

    if let Some(shadows_vec) = effects.fe_shadows() {
        for i in 0..shadows_vec.len() {
            let effect = shadows_vec.get(i);
            if let Some(shadow_fbs) = effect.shadow() {
                let shadow = decode_fe_shadow(&shadow_fbs);
                if effect.kind() == fbs::FilterShadowEffectKind::InnerShadow {
                    out.shadows.push(FilterShadowEffect::InnerShadow(shadow));
                } else {
                    out.shadows.push(FilterShadowEffect::DropShadow(shadow));
                }
            }
        }
    }

    if let Some(lg) = effects.fe_glass() {
        out.glass = Some(FeLiquidGlass {
            light_intensity: lg.light_intensity(),
            light_angle: lg.light_angle(),
            refraction: lg.refraction(),
            depth: lg.depth(),
            dispersion: lg.dispersion(),
            blur_radius: lg.blur_radius(),
            active: lg.active(),
        });
    }

    if let Some(noises_vec) = effects.fe_noises() {
        for i in 0..noises_vec.len() {
            let ne = noises_vec.get(i);
            out.noises.push(decode_fe_noise(&ne));
        }
    }

    out
}

fn decode_fe_shadow(s: &fbs::FeShadow<'_>) -> FeShadow {
    FeShadow {
        dx: s.dx(),
        dy: s.dy(),
        blur: s.blur(),
        spread: s.spread(),
        color: s.color().map(decode_rgba32f_to_cg_color).unwrap_or(CGColor { r: 0, g: 0, b: 0, a: 64 }),
        active: s.active(),
    }
}

fn decode_fe_noise(ne: &fbs::FeNoiseEffect<'_>) -> FeNoiseEffect {
    const DEFAULT_MONO: CGColor = CGColor { r: 0, g: 0, b: 0, a: 64 };
    let default_mono = || NoiseEffectColors::Mono { color: DEFAULT_MONO };

    let coloring = ne
        .coloring()
        .map(|c| match c.kind() {
            fbs::NoiseEffectColorsKind::Mono => NoiseEffectColors::Mono {
                color: c.mono_color().map(decode_rgba32f_to_cg_color).unwrap_or(DEFAULT_MONO),
            },
            fbs::NoiseEffectColorsKind::Duo => NoiseEffectColors::Duo {
                color1: c.duo_color1().map(decode_rgba32f_to_cg_color).unwrap_or(CGColor { r: 0, g: 0, b: 0, a: 128 }),
                color2: c.duo_color2().map(decode_rgba32f_to_cg_color).unwrap_or(CGColor { r: 255, g: 255, b: 255, a: 128 }),
            },
            fbs::NoiseEffectColorsKind::Multi => NoiseEffectColors::Multi { opacity: c.multi_opacity() },
            _ => default_mono(),
        })
        .unwrap_or_else(default_mono);

    FeNoiseEffect {
        active: ne.active(),
        noise_size: ne.noise_size(),
        density: ne.density(),
        num_octaves: ne.num_octaves(),
        seed: ne.seed(),
        coloring,
        blend_mode: decode_blend_mode(ne.blend_mode()),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stroke decoding
// ─────────────────────────────────────────────────────────────────────────────

fn decode_stroke_style_from_fbs(ss: Option<fbs::StrokeStyle<'_>>) -> StrokeStyle {
    let ss = match ss {
        Some(s) => s,
        None => return StrokeStyle::default(),
    };
    StrokeStyle {
        stroke_align: decode_stroke_align(ss.stroke_align()),
        stroke_cap: decode_stroke_cap(ss.stroke_cap()),
        stroke_join: decode_stroke_join(ss.stroke_join()),
        stroke_miter_limit: StrokeMiterLimit(ss.stroke_miter_limit()),
        stroke_dash_array: ss
            .stroke_dash_array()
            .filter(|v| v.len() > 0)
            .map(|v| StrokeDashArray((0..v.len()).map(|i| v.get(i)).collect())),
    }
}

enum_map!(decode_stroke_align, encode_stroke_align, fbs::StrokeAlign, StrokeAlign, StrokeAlign::Center, {
    Inside, Center, Outside,
});
enum_map!(decode_stroke_cap, encode_stroke_cap, fbs::StrokeCap, StrokeCap, StrokeCap::Butt, {
    Butt, Round, Square,
});
enum_map!(decode_stroke_join, encode_stroke_join, fbs::StrokeJoin, StrokeJoin, StrokeJoin::Miter, {
    Miter, Round, Bevel,
});
enum_map!(decode_stroke_marker, encode_stroke_marker, fbs::StrokeMarkerPreset, StrokeMarkerPreset, StrokeMarkerPreset::None, {
    None, RightTriangleOpen, EquilateralTriangle, Circle, Square, Diamond, VerticalBar,
});
enum_map!(decode_boolean_path_op, encode_boolean_path_op, fbs::BooleanPathOperation, BooleanPathOperation, BooleanPathOperation::Union, {
    Union, Intersection, Difference, Xor,
});
enum_map!(decode_text_align, encode_text_align, fbs::TextAlign, TextAlign, TextAlign::Left, {
    Left, Center, Right, Justify,
});
enum_map!(decode_text_align_vertical, encode_text_align_vertical, fbs::TextAlignVertical, TextAlignVertical, TextAlignVertical::Top, {
    Top, Center, Bottom,
});

/// Decode a `StrokeGeometryTrait` into `(StrokeStyle, f32, Option<VarWidthProfile>)`.
fn decode_stroke_geometry_trait(
    sg: Option<fbs::StrokeGeometryTrait<'_>>,
) -> (StrokeStyle, f32, Option<varwidth::VarWidthProfile>) {
    let sg = match sg {
        Some(s) => s,
        None => return (StrokeStyle::default(), 0.0, None),
    };
    let style = decode_stroke_style_from_fbs(sg.stroke_style());
    let profile = sg.stroke_width_profile().map(|p| {
        let stops = p
            .stops()
            .map(|stops_vec| {
                (0..stops_vec.len())
                    .map(|i| {
                        let s = stops_vec.get(i);
                        varwidth::WidthStop { u: s.u(), r: s.r() }
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        varwidth::VarWidthProfile {
            base: sg.stroke_width() * 0.5,
            stops,
        }
    });
    (style, sg.stroke_width(), profile)
}

/// Decode a `RectangularStrokeGeometryTrait` into `(StrokeStyle, StrokeWidth)`.
fn decode_rectangular_stroke_geometry(
    sg: Option<fbs::RectangularStrokeGeometryTrait<'_>>,
) -> (StrokeStyle, StrokeWidth) {
    let sg = match sg {
        Some(s) => s,
        None => return (StrokeStyle::default(), StrokeWidth::None),
    };
    let style = decode_stroke_style_from_fbs(sg.stroke_style());
    let width = match sg.rectangular_stroke_width() {
        Some(rsw) => {
            let top = rsw.stroke_top_width();
            let right = rsw.stroke_right_width();
            let bottom = rsw.stroke_bottom_width();
            let left = rsw.stroke_left_width();
            if top == right && right == bottom && bottom == left {
                if top == 0.0 {
                    StrokeWidth::None
                } else {
                    StrokeWidth::Uniform(top)
                }
            } else {
                StrokeWidth::Rectangular(RectangularStrokeWidth {
                    stroke_top_width: top,
                    stroke_right_width: right,
                    stroke_bottom_width: bottom,
                    stroke_left_width: left,
                })
            }
        }
        None => StrokeWidth::None,
    };
    (style, width)
}

// ─────────────────────────────────────────────────────────────────────────────
// Corner radius / smoothing
// ─────────────────────────────────────────────────────────────────────────────

fn decode_corner_radius(cr: Option<fbs::RectangularCornerRadiusTrait<'_>>) -> RectangularCornerRadius {
    use crate::cg::types::Radius;
    match cr.and_then(|t| t.rectangular_corner_radius()) {
        Some(rcr) => RectangularCornerRadius {
            tl: Radius::elliptical(rcr.tl().rx(), rcr.tl().ry()),
            tr: Radius::elliptical(rcr.tr().rx(), rcr.tr().ry()),
            bl: Radius::elliptical(rcr.bl().rx(), rcr.bl().ry()),
            br: Radius::elliptical(rcr.br().rx(), rcr.br().ry()),
        },
        None => RectangularCornerRadius::default(),
    }
}

fn decode_corner_smoothing(cr: Option<fbs::RectangularCornerRadiusTrait<'_>>) -> CornerSmoothing {
    match cr {
        Some(cr) => CornerSmoothing(cr.corner_smoothing()),
        None => CornerSmoothing::default(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout decoding
// ─────────────────────────────────────────────────────────────────────────────

/// Extract (x, y) from the layout position, regardless of whether it is encoded
/// as Cartesian or Inset.  For Inset, `left` and `top` are used as x and y
/// (matching the JSON path where `layout_inset_left`/`layout_inset_top` are the
/// position of non-container shapes).
fn decode_layout_xy(ls: &fbs::LayoutStyle<'_>) -> (f32, f32) {
    match ls.layout_position_type() {
        fbs::LayoutPositioningBasis::LayoutPositioningCartesian => ls
            .layout_position_as_layout_positioning_cartesian()
            .map(|c| (c.x(), c.y()))
            .unwrap_or((0.0, 0.0)),
        fbs::LayoutPositioningBasis::LayoutPositioningInset => ls
            .layout_position_as_layout_positioning_inset()
            .map(|inset| {
                let left = inset.left().and_then(|v| v.value()).unwrap_or(0.0);
                let top = inset.top().and_then(|v| v.value()).unwrap_or(0.0);
                (left, top)
            })
            .unwrap_or((0.0, 0.0)),
        _ => (0.0, 0.0),
    }
}

fn decode_layout_position(ls: &fbs::LayoutStyle<'_>) -> LayoutPositioningBasis {
    match ls.layout_position_type() {
        fbs::LayoutPositioningBasis::LayoutPositioningCartesian => {
            if let Some(cart) = ls.layout_position_as_layout_positioning_cartesian() {
                LayoutPositioningBasis::Cartesian(CGPoint::new(cart.x(), cart.y()))
            } else {
                LayoutPositioningBasis::zero()
            }
        }
        fbs::LayoutPositioningBasis::LayoutPositioningInset => {
            if let Some(inset) = ls.layout_position_as_layout_positioning_inset() {
                let top = inset.top().and_then(|v| v.value()).unwrap_or(0.0);
                let right = inset.right().and_then(|v| v.value()).unwrap_or(0.0);
                let bottom = inset.bottom().and_then(|v| v.value()).unwrap_or(0.0);
                let left = inset.left().and_then(|v| v.value()).unwrap_or(0.0);
                LayoutPositioningBasis::Inset(EdgeInsets {
                    top,
                    right,
                    bottom,
                    left,
                })
            } else {
                LayoutPositioningBasis::zero()
            }
        }
        _ => LayoutPositioningBasis::zero(),
    }
}

fn decode_dimensions(ls: &fbs::LayoutStyle<'_>) -> (Option<f32>, Option<f32>) {
    match ls.layout_dimensions() {
        Some(dim) => {
            let w = decode_dimension_value(dim.layout_target_width());
            let h = decode_dimension_value(dim.layout_target_height());
            (w, h)
        }
        None => (None, None),
    }
}

fn decode_dimension_value(dv: Option<fbs::LayoutDimensionValue<'_>>) -> Option<f32> {
    let dv = dv?;
    match dv.unit() {
        fbs::LayoutDimensionUnit::LengthPx => dv.value(),
        _ => None,
    }
}

fn decode_layout_dimension_style(ls: &fbs::LayoutStyle<'_>) -> LayoutDimensionStyle {
    let dim = ls.layout_dimensions();
    LayoutDimensionStyle {
        layout_target_width: dim
            .as_ref()
            .and_then(|d| decode_dimension_value(d.layout_target_width())),
        layout_target_height: dim
            .as_ref()
            .and_then(|d| decode_dimension_value(d.layout_target_height())),
        layout_min_width: None,
        layout_max_width: None,
        layout_min_height: None,
        layout_max_height: None,
        layout_target_aspect_ratio: None,
    }
}

fn decode_layout_container_style(ls: &fbs::LayoutStyle<'_>) -> LayoutContainerStyle {
    match ls.layout_container() {
        Some(lc) => {
            let layout_mode = if lc.layout_mode() == fbs::LayoutMode::Flex {
                LayoutMode::Flex
            } else {
                LayoutMode::Normal
            };
            let layout_direction = if lc.layout_direction() == fbs::Axis::Vertical {
                Axis::Vertical
            } else {
                Axis::Horizontal
            };
            let layout_wrap = match lc.layout_wrap() {
                fbs::LayoutWrap::Wrap => Some(LayoutWrap::Wrap),
                fbs::LayoutWrap::NoWrap => Some(LayoutWrap::NoWrap),
                _ => None,
            };
            let layout_main_axis_alignment =
                decode_main_axis_alignment(lc.layout_main_axis_alignment());
            let layout_cross_axis_alignment =
                decode_cross_axis_alignment(lc.layout_cross_axis_alignment());
            let layout_padding = lc.layout_padding().map(|p| EdgeInsets {
                top: p.top(),
                right: p.right(),
                bottom: p.bottom(),
                left: p.left(),
            });
            let main_gap = lc.layout_main_axis_gap();
            let cross_gap = lc.layout_cross_axis_gap();
            let layout_gap = if main_gap > 0.0 || cross_gap > 0.0 {
                Some(LayoutGap {
                    main_axis_gap: main_gap,
                    cross_axis_gap: cross_gap,
                })
            } else {
                None
            };
            LayoutContainerStyle {
                layout_mode,
                layout_direction,
                layout_wrap,
                layout_main_axis_alignment,
                layout_cross_axis_alignment,
                layout_padding,
                layout_gap,
            }
        }
        None => LayoutContainerStyle::default(),
    }
}

/// Like `enum_map!` but the decode function returns `Option<RustType>` — `None`
/// for any FBS value not in the listed variants (e.g. the FBS `None` sentinel).
macro_rules! enum_map_opt {
    ($decode:ident, $encode:ident, $fbs:ty, $rust:ty, { $($v:ident),+ $(,)? }) => {
        fn $decode(v: $fbs) -> Option<$rust> {
            match v { $( <$fbs>::$v => Some(<$rust>::$v), )+ _ => None, }
        }
        fn $encode(v: $rust) -> $fbs {
            match v { $( <$rust>::$v => <$fbs>::$v, )+ }
        }
    };
}

enum_map_opt!(decode_main_axis_alignment, encode_main_axis_alignment, fbs::MainAxisAlignment, MainAxisAlignment, {
    Start, Center, End, SpaceBetween, SpaceAround, SpaceEvenly, Stretch,
});
enum_map_opt!(decode_cross_axis_alignment, encode_cross_axis_alignment, fbs::CrossAxisAlignment, CrossAxisAlignment, {
    Start, Center, End, Stretch,
});

fn decode_layout_child_style(ls: &fbs::LayoutStyle<'_>) -> Option<LayoutChildStyle> {
    let lc = ls.layout_child()?;
    let layout_positioning = match lc.layout_positioning() {
        fbs::LayoutPositioning::Absolute => LayoutPositioning::Absolute,
        _ => LayoutPositioning::Auto,
    };
    Some(LayoutChildStyle {
        layout_grow: lc.layout_grow(),
        layout_positioning,
    })
}

fn decode_mask_type(fbs_mask_type: fbs::LayerMaskType) -> Option<LayerMaskType> {
    use crate::cg::types::ImageMaskType;
    match fbs_mask_type {
        fbs::LayerMaskType::NONE => None,
        fbs::LayerMaskType::LayerMaskTypeImage => Some(LayerMaskType::Image(ImageMaskType::Alpha)),
        fbs::LayerMaskType::LayerMaskTypeGeometry => Some(LayerMaskType::Geometry),
        _ => None,
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Node-specific decoders
//
// Every function below receives a pre-decoded `LayerCommon` so the shared
// fields (active, opacity, blend_mode, mask, effects, rotation, layout_child)
// are decoded exactly once and cannot diverge between node types.
// ═════════════════════════════════════════════════════════════════════════════

fn decode_vector_network(vnd: Option<fbs::VectorNetworkData<'_>>) -> VectorNetwork {
    let Some(vnd) = vnd else {
        return VectorNetwork::default();
    };

    let vertices: Vec<(f32, f32)> = vnd
        .vertices()
        .map(|v| (0..v.len()).map(|i| { let p = v.get(i); (p.x(), p.y()) }).collect())
        .unwrap_or_default();

    let segments: Vec<VectorNetworkSegment> = vnd
        .segments()
        .map(|s| {
            (0..s.len())
                .map(|i| {
                    let seg = s.get(i);
                    VectorNetworkSegment {
                        a: seg.segment_vertex_a() as usize,
                        b: seg.segment_vertex_b() as usize,
                        ta: (seg.tangent_a().x(), seg.tangent_a().y()),
                        tb: (seg.tangent_b().x(), seg.tangent_b().y()),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let regions: Vec<VectorNetworkRegion> = vnd
        .regions()
        .map(|rs| {
            (0..rs.len())
                .filter_map(|i| {
                    let region = rs.get(i);
                    let loops: Vec<VectorNetworkLoop> = region
                        .region_loops()
                        .map(|ls| {
                            (0..ls.len())
                                .filter_map(|j| {
                                    let lp = ls.get(j);
                                    lp.loop_segment_indices().map(|idx| {
                                        VectorNetworkLoop(
                                            (0..idx.len()).map(|k| idx.get(k) as usize).collect(),
                                        )
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    let fill_rule = match region.region_fill_rule() {
                        fbs::FillRule::EvenOdd => crate::cg::types::FillRule::EvenOdd,
                        _ => crate::cg::types::FillRule::NonZero,
                    };
                    let fills = region
                        .region_fill_paints()
                        .map(|p| decode_paints_vec(Some(p)));
                    Some(VectorNetworkRegion {
                        loops,
                        fill_rule,
                        fills,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    VectorNetwork {
        vertices,
        segments,
        regions,
    }
}

fn decode_group_node(
    lc: &LayerCommon,
    layer: &fbs::LayerTrait<'_>,
    _gn: &fbs::GroupNode<'_>,
) -> Node {
    let sl = decode_shape_layout(layer, lc.rotation_cos_sin);
    Node::Group(GroupNodeRec {
        active: lc.active,
        opacity: lc.opacity,
        blend_mode: lc.blend_mode,
        mask: lc.mask,
        transform: Some(sl.transform),
    })
}

fn decode_container_node(
    lc: &LayerCommon,
    layer: &fbs::LayerTrait<'_>,
    cn: &fbs::ContainerNode<'_>,
) -> Node {
    let layout = layer.layout();
    let position = layout.as_ref().map(decode_layout_position).unwrap_or_default();
    let layout_container = layout.as_ref().map(decode_layout_container_style).unwrap_or_default();
    let layout_dimensions = layout.as_ref().map(decode_layout_dimension_style).unwrap_or_default();
    let (stroke_style, stroke_width) = decode_rectangular_stroke_geometry(cn.stroke_geometry());

    Node::Container(ContainerNodeRec {
        active: lc.active,
        opacity: lc.opacity,
        blend_mode: lc.blend_mode,
        mask: lc.mask,
        rotation: lc.rotation,
        position,
        layout_container,
        layout_dimensions,
        layout_child: lc.layout_child.clone(),
        corner_radius: decode_corner_radius(cn.corner_radius()),
        corner_smoothing: decode_corner_smoothing(cn.corner_radius()),
        fills: decode_paints_vec(cn.fill_paints()),
        strokes: decode_paints_vec(cn.stroke_paints()),
        stroke_style,
        stroke_width,
        effects: lc.effects.clone(),
        clip: cn.clips_content() as ContainerClipFlag,
    })
}

fn decode_initial_container_node(
    lc: &LayerCommon,
    layer: &fbs::LayerTrait<'_>,
    _icn: &fbs::InitialContainerNode<'_>,
) -> Node {
    let layout = layer.layout();
    let lcs = layout.as_ref().map(decode_layout_container_style).unwrap_or_default();
    Node::InitialContainer(InitialContainerNodeRec {
        active: lc.active,
        layout_mode: lcs.layout_mode,
        layout_direction: lcs.layout_direction,
        layout_wrap: lcs.layout_wrap.unwrap_or(LayoutWrap::NoWrap),
        layout_main_axis_alignment: lcs.layout_main_axis_alignment.unwrap_or(MainAxisAlignment::Start),
        layout_cross_axis_alignment: lcs.layout_cross_axis_alignment.unwrap_or(CrossAxisAlignment::Start),
        padding: lcs.layout_padding.unwrap_or_default(),
        layout_gap: lcs.layout_gap.unwrap_or(LayoutGap {
            main_axis_gap: 0.0,
            cross_axis_gap: 0.0,
        }),
    })
}

fn decode_basic_shape_node(
    lc: &LayerCommon,
    layer: &fbs::LayerTrait<'_>,
    bsn: &fbs::BasicShapeNode<'_>,
) -> Node {
    use fbs::CanonicalLayerShape as BST;

    let sl = decode_shape_layout(layer, lc.rotation_cos_sin);
    let fills = decode_paints_vec(bsn.fill_paints());
    let strokes = decode_paints_vec(bsn.stroke_paints());
    // For rectangles the TS encoder writes per-corner rectangular_corner_radius;
    // for polygons/stars it writes the scalar corner_radius field.
    let corner_radius = {
        use crate::cg::types::Radius;
        if let Some(rcr) = bsn.rectangular_corner_radius() {
            RectangularCornerRadius {
                tl: Radius::elliptical(rcr.tl().rx(), rcr.tl().ry()),
                tr: Radius::elliptical(rcr.tr().rx(), rcr.tr().ry()),
                bl: Radius::elliptical(rcr.bl().rx(), rcr.bl().ry()),
                br: Radius::elliptical(rcr.br().rx(), rcr.br().ry()),
            }
        } else {
            let r = Radius::circular(bsn.corner_radius());
            RectangularCornerRadius { tl: r, tr: r, bl: r, br: r }
        }
    };
    let stroke_style = decode_stroke_style_from_fbs(bsn.stroke_style());
    let stroke_width_f32 = bsn.stroke_width();

    match bsn.shape_type() {
        BST::CanonicalShapeRectangular => Node::Rectangle(RectangleNodeRec {
            active: lc.active,
            opacity: lc.opacity,
            blend_mode: lc.blend_mode,
            mask: lc.mask,
            transform: sl.transform,
            size: sl.size,
            corner_radius,
            corner_smoothing: CornerSmoothing::default(),
            fills,
            strokes,
            stroke_style,
            stroke_width: if stroke_width_f32 == 0.0 {
                StrokeWidth::None
            } else {
                StrokeWidth::Uniform(stroke_width_f32)
            },
            effects: lc.effects.clone(),
            layout_child: lc.layout_child.clone(),
        }),
        BST::CanonicalShapeElliptical => {
            let ring = bsn
                .shape_as_canonical_shape_elliptical()
                .and_then(|s| s.ring_sector_data());
            let (inner_radius, start_angle, angle) = match ring {
                Some(r) => {
                    let ir = r.inner_radius_ratio();
                    let sa = r.start_angle();
                    let a = r.angle();
                    (
                        if ir != 0.0 { Some(ir) } else { None },
                        sa,
                        if a != 360.0 { Some(a) } else { None },
                    )
                }
                None => (None, 0.0, None),
            };
            Node::Ellipse(EllipseNodeRec {
                active: lc.active,
                opacity: lc.opacity,
                blend_mode: lc.blend_mode,
                mask: lc.mask,
                transform: sl.transform,
                size: sl.size,
                fills,
                strokes,
                stroke_style,
                stroke_width: singular_stroke_width(stroke_width_f32),
                inner_radius,
                start_angle,
                angle,
                // corner_radius is not in the FBS schema; defaults to None
                corner_radius: None,
                effects: lc.effects.clone(),
                layout_child: lc.layout_child.clone(),
            })
        }
        BST::CanonicalShapeRegularPolygon => {
            let point_count = bsn
                .shape_as_canonical_shape_regular_polygon()
                .map(|s| s.point_count() as usize)
                .unwrap_or(5);
            Node::RegularPolygon(RegularPolygonNodeRec {
                active: lc.active,
                opacity: lc.opacity,
                blend_mode: lc.blend_mode,
                mask: lc.mask,
                transform: sl.transform,
                size: sl.size,
                point_count,
                corner_radius: corner_radius.tl.rx,
                fills,
                strokes,
                stroke_style,
                stroke_width: singular_stroke_width(stroke_width_f32),
                effects: lc.effects.clone(),
                layout_child: lc.layout_child.clone(),
            })
        }
        BST::CanonicalShapeRegularStarPolygon => {
            let (point_count, inner_radius) = bsn
                .shape_as_canonical_shape_regular_star_polygon()
                .map(|s| (s.point_count() as usize, s.inner_radius_ratio()))
                .unwrap_or((5, 0.4));
            Node::RegularStarPolygon(RegularStarPolygonNodeRec {
                active: lc.active,
                opacity: lc.opacity,
                blend_mode: lc.blend_mode,
                mask: lc.mask,
                transform: sl.transform,
                size: sl.size,
                point_count,
                inner_radius,
                corner_radius: corner_radius.tl.rx,
                fills,
                strokes,
                stroke_style,
                stroke_width: singular_stroke_width(stroke_width_f32),
                effects: lc.effects.clone(),
                layout_child: lc.layout_child.clone(),
            })
        }
        _ => Node::Vector(VectorNodeRec {
            active: lc.active,
            opacity: lc.opacity,
            blend_mode: lc.blend_mode,
            mask: lc.mask,
            transform: sl.transform,
            network: VectorNetwork::default(),
            corner_radius: 0.0,
            fills,
            strokes,
            stroke_width: stroke_width_f32,
            stroke_width_profile: None,
            stroke_align: stroke_style.stroke_align,
            stroke_cap: stroke_style.stroke_cap,
            stroke_join: stroke_style.stroke_join,
            stroke_miter_limit: stroke_style.stroke_miter_limit,
            stroke_dash_array: stroke_style.stroke_dash_array,
            marker_start_shape: StrokeMarkerPreset::None,
            marker_end_shape: StrokeMarkerPreset::None,
            layout_child: lc.layout_child.clone(),
            effects: lc.effects.clone(),
        }),
    }
}

fn decode_vector_node(
    lc: &LayerCommon,
    layer: &fbs::LayerTrait<'_>,
    vn: &fbs::VectorNode<'_>,
) -> Node {
    let sl = decode_shape_layout(layer, lc.rotation_cos_sin);
    let (stroke_style, stroke_width_f32, stroke_width_profile) =
        decode_stroke_geometry_trait(vn.stroke_geometry());

    Node::Vector(VectorNodeRec {
        active: lc.active,
        opacity: lc.opacity,
        blend_mode: lc.blend_mode,
        mask: lc.mask,
        transform: sl.transform,
        network: decode_vector_network(vn.vector_network_data()),
        corner_radius: 0.0,
        fills: decode_paints_vec(vn.fill_paints()),
        strokes: decode_paints_vec(vn.stroke_paints()),
        stroke_width: stroke_width_f32,
        stroke_width_profile,
        stroke_align: stroke_style.stroke_align,
        stroke_cap: stroke_style.stroke_cap,
        stroke_join: stroke_style.stroke_join,
        stroke_miter_limit: stroke_style.stroke_miter_limit,
        stroke_dash_array: stroke_style.stroke_dash_array,
        marker_start_shape: decode_stroke_marker(vn.marker_start_shape()),
        marker_end_shape: decode_stroke_marker(vn.marker_end_shape()),
        layout_child: lc.layout_child.clone(),
        effects: lc.effects.clone(),
    })
}

fn decode_line_node(
    lc: &LayerCommon,
    layer: &fbs::LayerTrait<'_>,
    ln: &fbs::LineNode<'_>,
) -> Node {
    let sl = decode_shape_layout(layer, lc.rotation_cos_sin);
    let sg = ln.stroke_geometry();
    let stroke_width = sg.as_ref().map(|s| s.stroke_width()).unwrap_or(0.0);
    let stroke_cap = sg
        .as_ref()
        .and_then(|s| s.stroke_style())
        .map(|ss| decode_stroke_cap(ss.stroke_cap()))
        .unwrap_or_default();
    let miter_limit = sg
        .as_ref()
        .and_then(|s| s.stroke_style())
        .map(|ss| StrokeMiterLimit(ss.stroke_miter_limit()))
        .unwrap_or_default();
    let stroke_dash_array = sg
        .as_ref()
        .and_then(|s| s.stroke_style())
        .and_then(|ss| {
            ss.stroke_dash_array()
                .filter(|v| v.len() > 0)
                .map(|v| StrokeDashArray((0..v.len()).map(|i| v.get(i)).collect()))
        });

    // Lines use translation + rotation (no center-origin) and height=0.
    // Use raw cos/sin to avoid lossy degree conversion.
    let (cos, sin) = lc.rotation_cos_sin;
    let transform = AffineTransform::from_translation_rotation_raw(sl.x, sl.y, cos, sin);
    let size = Size {
        width: sl.size.width,
        height: 0.0,
    };

    Node::Line(LineNodeRec {
        active: lc.active,
        opacity: lc.opacity,
        blend_mode: lc.blend_mode,
        mask: lc.mask,
        transform,
        size,
        strokes: decode_paints_vec(ln.stroke_paints()),
        stroke_width,
        stroke_cap,
        stroke_miter_limit: miter_limit,
        stroke_dash_array,
        _data_stroke_align: StrokeAlign::Center,
        effects: lc.effects.clone(),
        layout_child: lc.layout_child.clone(),
        marker_start_shape: decode_stroke_marker(ln.marker_start_shape()),
        marker_end_shape: decode_stroke_marker(ln.marker_end_shape()),
    })
}

fn decode_boolean_operation_node(
    lc: &LayerCommon,
    layer: &fbs::LayerTrait<'_>,
    bon: &fbs::BooleanOperationNode<'_>,
) -> Node {
    let sl = decode_shape_layout(layer, lc.rotation_cos_sin);
    let op = decode_boolean_path_op(bon.op());
    let corner_r = bon
        .corner_radius()
        .and_then(|cr| cr.corner_radius())
        .map(|r| r.rx());
    let (stroke_style, stroke_width_f32, _profile) =
        decode_stroke_geometry_trait(bon.stroke_geometry());

    Node::BooleanOperation(BooleanPathOperationNodeRec {
        active: lc.active,
        opacity: lc.opacity,
        blend_mode: lc.blend_mode,
        mask: lc.mask,
        effects: lc.effects.clone(),
        transform: Some(sl.transform),
        op,
        corner_radius: corner_r,
        fills: decode_paints_vec(bon.fill_paints()),
        strokes: decode_paints_vec(bon.stroke_paints()),
        stroke_style,
        stroke_width: singular_stroke_width(stroke_width_f32),
    })
}

fn decode_text_span_node(
    lc: &LayerCommon,
    layer: &fbs::LayerTrait<'_>,
    tn: &fbs::TextSpanNode<'_>,
) -> Node {
    let sl = decode_shape_layout(layer, lc.rotation_cos_sin);
    // Text uses translation + rotation (no center-origin).
    // Use raw cos/sin to avoid lossy degree conversion.
    let (cos, sin) = lc.rotation_cos_sin;
    let transform = AffineTransform::from_translation_rotation_raw(sl.x, sl.y, cos, sin);

    let props = tn.properties();
    let text = props
        .as_ref()
        .and_then(|p| p.text())
        .unwrap_or("")
        .to_owned();

    let text_style = props
        .as_ref()
        .and_then(|p| p.text_style())
        .map(|ts| {
            let mut rec = TextStyleRec::from_font(ts.font_family(), ts.font_size());
            rec.font_weight = FontWeight(ts.font_weight().value());
            rec
        })
        .unwrap_or_else(|| TextStyleRec::from_font("Inter", 14.0));

    let text_align = props
        .as_ref()
        .map(|p| decode_text_align(p.text_align()))
        .unwrap_or(TextAlign::Left);

    let text_align_vertical = props
        .as_ref()
        .map(|p| decode_text_align_vertical(p.text_align_vertical()))
        .unwrap_or(TextAlignVertical::Top);

    let fill_paints = props
        .as_ref()
        .map(|p| decode_paints_vec(p.fill_paints()))
        .unwrap_or_else(|| Paints::new(Vec::<Paint>::new()));
    let stroke_paints = props
        .as_ref()
        .map(|p| decode_paints_vec(p.stroke_paints()))
        .unwrap_or_else(|| Paints::new(Vec::<Paint>::new()));
    let stroke_width = props
        .as_ref()
        .and_then(|p| p.stroke_geometry())
        .map(|sg| sg.stroke_width())
        .unwrap_or(0.0);
    let stroke_align = props
        .as_ref()
        .and_then(|p| p.stroke_geometry())
        .and_then(|sg| sg.stroke_style())
        .map(|ss| decode_stroke_align(ss.stroke_align()))
        .unwrap_or(StrokeAlign::Center);

    Node::TextSpan(TextSpanNodeRec {
        active: lc.active,
        transform,
        width: sl.width,
        height: sl.height,
        layout_child: lc.layout_child.clone(),
        text,
        text_style,
        text_align,
        text_align_vertical,
        max_lines: None,
        ellipsis: None,
        fills: fill_paints,
        strokes: stroke_paints,
        stroke_width,
        stroke_align,
        opacity: lc.opacity,
        blend_mode: lc.blend_mode,
        mask: lc.mask,
        effects: lc.effects.clone(),
    })
}

// ═════════════════════════════════════════════════════════════════════════════
// Encoder — Scene → FlatBuffers binary (`.grida`)
//
// The encode path is the exact inverse of the decode path above.
// Given a `Scene` and an ID mapping, it produces a `.grida` FlatBuffers
// binary that round-trips through decode identically.
// ═════════════════════════════════════════════════════════════════════════════

use crate::node::schema::NodeId;

/// Encode a `Scene` into a `.grida` FlatBuffers binary.
///
/// - `scene`: the scene to encode.
/// - `scene_id`: the string ID for the scene node (e.g. `"scene1"`).
/// - `id_map`: maps internal `NodeId` → string IDs.
///
/// Returns the encoded bytes (including the `"GRID"` file identifier).
pub fn encode(
    scene: &Scene,
    scene_id: &str,
    id_map: &HashMap<NodeId, String>,
    position_map: &HashMap<NodeId, String>,
) -> Vec<u8> {
    let mut fbb = flatbuffers::FlatBufferBuilder::with_capacity(4096);

    // ── 1. Encode all nodes ─────────────────────────────────────────────────
    let mut node_slot_offsets = Vec::new();

    // 1a. Scene node
    let scene_slot = encode_scene_node(&mut fbb, scene, scene_id);
    node_slot_offsets.push(scene_slot);

    // 1b. Layer nodes — walk the tree in order (roots first, then children)
    for root_id in scene.graph.roots() {
        encode_tree_recursive(
            &mut fbb,
            &scene.graph,
            root_id,
            scene_id,
            id_map,
            position_map,
            &mut node_slot_offsets,
        );
    }

    // ── 2. Build nodes vector ───────────────────────────────────────────────
    let nodes_vec = fbb.create_vector(&node_slot_offsets);

    // ── 3. Build scenes array ───────────────────────────────────────────────
    let scene_id_str = fbb.create_string(scene_id);
    let scene_nid = fbs::NodeIdentifier::create(
        &mut fbb,
        &fbs::NodeIdentifierArgs { id: Some(scene_id_str) },
    );
    let scenes_vec = fbb.create_vector(&[scene_nid]);

    // ── 4. Build CanvasDocument ─────────────────────────────────────────────
    let schema_version_str = fbb.create_string(SCHEMA_VERSION);
    let doc = fbs::CanvasDocument::create(
        &mut fbb,
        &fbs::CanvasDocumentArgs {
            schema_version: Some(schema_version_str),
            nodes: Some(nodes_vec),
            scenes: Some(scenes_vec),
        },
    );

    // ── 5. Build GridaFile root ─────────────────────────────────────────────
    let root = fbs::GridaFile::create(
        &mut fbb,
        &fbs::GridaFileArgs { document: Some(doc) },
    );

    fbb.finish(root, Some("GRID"));
    fbb.finished_data().to_vec()
}

/// Encode multiple scenes into a single `.grida` FlatBuffers binary.
///
/// Each entry is `(scene_id, scene, id_map, position_map)`.
/// All scenes share the same flat `nodes` vector; each scene's nodes
/// are prefixed with a scene-type NodeSlot that references `scene_id`.
pub fn encode_multi(
    entries: &[(
        &str,
        &Scene,
        &HashMap<NodeId, String>,
        &HashMap<NodeId, String>,
    )],
) -> Vec<u8> {
    let mut fbb = flatbuffers::FlatBufferBuilder::with_capacity(8192);
    let mut node_slot_offsets = Vec::new();
    let mut scene_nids = Vec::new();

    for (scene_id, scene, id_map, position_map) in entries {
        // Scene node
        let scene_slot = encode_scene_node(&mut fbb, scene, scene_id);
        node_slot_offsets.push(scene_slot);

        // Layer nodes
        for root_id in scene.graph.roots() {
            encode_tree_recursive(
                &mut fbb,
                &scene.graph,
                root_id,
                scene_id,
                id_map,
                position_map,
                &mut node_slot_offsets,
            );
        }

        // Scene identifier
        let scene_id_str = fbb.create_string(scene_id);
        let scene_nid = fbs::NodeIdentifier::create(
            &mut fbb,
            &fbs::NodeIdentifierArgs {
                id: Some(scene_id_str),
            },
        );
        scene_nids.push(scene_nid);
    }

    let nodes_vec = fbb.create_vector(&node_slot_offsets);
    let scenes_vec = fbb.create_vector(&scene_nids);
    let schema_version_str = fbb.create_string(SCHEMA_VERSION);
    let doc = fbs::CanvasDocument::create(
        &mut fbb,
        &fbs::CanvasDocumentArgs {
            schema_version: Some(schema_version_str),
            nodes: Some(nodes_vec),
            scenes: Some(scenes_vec),
        },
    );
    let root = fbs::GridaFile::create(
        &mut fbb,
        &fbs::GridaFileArgs { document: Some(doc) },
    );
    fbb.finish(root, Some("GRID"));
    fbb.finished_data().to_vec()
}

/// Recursively encode a node and all its children into NodeSlots.
fn encode_tree_recursive<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    graph: &SceneGraph,
    node_id: &NodeId,
    parent_id: &str,
    id_map: &HashMap<NodeId, String>,
    position_map: &HashMap<NodeId, String>,
    out: &mut Vec<flatbuffers::WIPOffset<fbs::NodeSlot<'a>>>,
) {
    let node = match graph.get_node(node_id) {
        Ok(n) => n,
        Err(_) => return,
    };
    let string_id = match id_map.get(node_id) {
        Some(s) => s.as_str(),
        None => return,
    };

    // Use the original position string from the FBS file if available.
    // Fall back to generating base-62-style position strings that stay
    // lexicographically sorted: a0..a9, aa..az, b00..b0z, etc.
    let position = match position_map.get(node_id) {
        Some(pos) => pos.clone(),
        None => {
            let siblings = graph
                .get_children(&graph.get_parent(node_id).unwrap_or(0))
                .map(|v| v.as_slice())
                .unwrap_or(&[]);
            let idx = siblings.iter().position(|id| id == node_id).unwrap_or(0);
            generate_fractional_position(idx)
        }
    };

    let slot = encode_node(fbb, node, string_id, parent_id, &position);
    out.push(slot);

    // Recurse into children
    if let Some(children) = graph.get_children(node_id) {
        for child_id in children.clone() {
            encode_tree_recursive(fbb, graph, &child_id, string_id, id_map, position_map, out);
        }
    }
}

/// Generate a lexicographically sortable position string for child index `idx`.
/// Produces: a0, a1, ..., a9, aa, ab, ..., az, b00, b01, ..., b0z, b10, ...
/// This matches the pattern used by fractional-indexing libraries.
fn generate_fractional_position(idx: usize) -> String {
    if idx < 36 {
        // a0..a9, aa..az  (single char after 'a')
        let ch = if idx < 10 {
            (b'0' + idx as u8) as char
        } else {
            (b'a' + (idx - 10) as u8) as char
        };
        format!("a{ch}")
    } else {
        // b00..b0z, b10..b1z, etc.
        let rem = idx - 36;
        let hi = rem / 36;
        let lo = rem % 36;
        let hi_ch = if hi < 10 {
            (b'0' + hi as u8) as char
        } else {
            (b'a' + (hi - 10) as u8) as char
        };
        let lo_ch = if lo < 10 {
            (b'0' + lo as u8) as char
        } else {
            (b'a' + (lo - 10) as u8) as char
        };
        format!("b{hi_ch}{lo_ch}")
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene node encoding
// ─────────────────────────────────────────────────────────────────────────────

fn encode_scene_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    scene: &Scene,
    scene_id: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    let sys = encode_system_node_trait(fbb, scene_id, &scene.name, true, false);

    let bg = scene.background_color.map(|c| encode_color_to_rgba32f(&c));

    let sn = fbs::SceneNode::create(fbb, &fbs::SceneNodeArgs {
        node: Some(sys),
        scene_background_color: bg.as_ref(),
        ..Default::default()
    });

    make_node_slot(fbb, fbs::Node::SceneNode, sn.as_union_value())
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch: Node enum → typed encoder
// ─────────────────────────────────────────────────────────────────────────────

fn encode_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    node: &Node,
    node_id: &str,
    parent_id: &str,
    position: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    match node {
        Node::Container(r) => encode_container_node(fbb, r, node_id, parent_id, position),
        Node::InitialContainer(r) => {
            encode_initial_container_node(fbb, r, node_id, parent_id, position)
        }
        Node::Rectangle(r) => encode_basic_shape_node(
            fbb,
            node_id,
            parent_id,
            position,
            fbs::CanonicalLayerShape::CanonicalShapeRectangular,
            fbs::BasicShapeNodeType::Rectangle,
            BasicShapeFields::Rectangle(r),
        ),
        Node::Ellipse(r) => encode_basic_shape_node(
            fbb,
            node_id,
            parent_id,
            position,
            fbs::CanonicalLayerShape::CanonicalShapeElliptical,
            fbs::BasicShapeNodeType::Ellipse,
            BasicShapeFields::Ellipse(r),
        ),
        Node::RegularPolygon(r) => encode_basic_shape_node(
            fbb,
            node_id,
            parent_id,
            position,
            fbs::CanonicalLayerShape::CanonicalShapeRegularPolygon,
            fbs::BasicShapeNodeType::RegularPolygon,
            BasicShapeFields::RegularPolygon(r),
        ),
        Node::RegularStarPolygon(r) => encode_basic_shape_node(
            fbb,
            node_id,
            parent_id,
            position,
            fbs::CanonicalLayerShape::CanonicalShapeRegularStarPolygon,
            fbs::BasicShapeNodeType::RegularStarPolygon,
            BasicShapeFields::RegularStarPolygon(r),
        ),
        Node::Group(r) => encode_group_node(fbb, r, node_id, parent_id, position),
        Node::Line(r) => encode_line_node(fbb, r, node_id, parent_id, position),
        Node::Vector(r) => encode_vector_node(fbb, r, node_id, parent_id, position),
        Node::TextSpan(r) => encode_text_span_node(fbb, r, node_id, parent_id, position),
        Node::BooleanOperation(r) => {
            encode_boolean_operation_node(fbb, r, node_id, parent_id, position)
        }
        // Fallback: encode as UnknownNode
        _ => {
            let sys = encode_system_node_trait(fbb, node_id, "", true, false);
            let un = fbs::UnknownNode::create(fbb, &fbs::UnknownNodeArgs { node: Some(sys) });
            make_node_slot(fbb, fbs::Node::UnknownNode, un.as_union_value())
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: SystemNodeTrait
// ─────────────────────────────────────────────────────────────────────────────

fn encode_system_node_trait<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    id: &str,
    name: &str,
    active: bool,
    locked: bool,
) -> flatbuffers::WIPOffset<fbs::SystemNodeTrait<'a>> {
    let id_str = fbb.create_string(id);
    let nid = fbs::NodeIdentifier::create(fbb, &fbs::NodeIdentifierArgs { id: Some(id_str) });
    let name_str = if !name.is_empty() {
        Some(fbb.create_string(name))
    } else {
        None
    };
    fbs::SystemNodeTrait::create(
        fbb,
        &fbs::SystemNodeTraitArgs {
            id: Some(nid),
            active,
            name: name_str,
            locked,
        },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: LayerTrait
// ─────────────────────────────────────────────────────────────────────────────

struct LayerTraitInput<'a, 'b> {
    parent_id: &'b str,
    position: &'b str,
    opacity: f32,
    blend_mode: LayerBlendMode,
    mask: Option<LayerMaskType>,
    effects: &'b LayerEffects,
    /// Post-layout transform matrix (cos/sin values directly from the source
    /// transform, avoiding lossy radians→degrees→radians conversion).
    post_layout_transform: Option<fbs::CGTransform2D>,
    layout: Option<flatbuffers::WIPOffset<fbs::LayoutStyle<'a>>>,
}

fn encode_layer_trait<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    input: &LayerTraitInput<'a, '_>,
) -> flatbuffers::WIPOffset<fbs::LayerTrait<'a>> {
    // Parent reference
    let parent_id_str = fbb.create_string(input.parent_id);
    let parent_nid =
        fbs::NodeIdentifier::create(fbb, &fbs::NodeIdentifierArgs { id: Some(parent_id_str) });
    let pos_str = fbb.create_string(input.position);
    let parent_ref = fbs::ParentReference::create(
        fbb,
        &fbs::ParentReferenceArgs {
            parent_id: Some(parent_nid),
            position: Some(pos_str),
        },
    );

    // Blend mode
    let fbs_blend_mode = encode_layer_blend_mode(input.blend_mode);

    // Mask type — union requires BOTH discriminant and payload
    let (fbs_mask_disc, fbs_mask_payload) = encode_mask_type(fbb, input.mask);

    // Effects
    let effects = encode_layer_effects(fbb, input.effects);

    fbs::LayerTrait::create(
        fbb,
        &fbs::LayerTraitArgs {
            parent: Some(parent_ref),
            opacity: input.opacity,
            blend_mode: fbs_blend_mode,
            mask_type_type: fbs_mask_disc,
            mask_type: fbs_mask_payload,
            effects,
            layout: input.layout,
            post_layout_transform: input.post_layout_transform.as_ref(),
            post_layout_transform_origin: None,
        },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Color encoding
// ─────────────────────────────────────────────────────────────────────────────

/// Build a `CGTransform2D` rotation matrix from rotation in degrees.
/// Used for container nodes which store rotation as a separate scalar.
fn rotation_degrees_to_transform(degrees: f32) -> Option<fbs::CGTransform2D> {
    if degrees == 0.0 {
        None
    } else {
        let rad = degrees.to_radians();
        let (sin, cos) = rad.sin_cos();
        Some(fbs::CGTransform2D::new(cos, -sin, 0.0, sin, cos, 0.0))
    }
}

/// Build a `CGTransform2D` rotation matrix directly from an `AffineTransform`'s
/// cos/sin components, avoiding the lossy radians→degrees→radians conversion.
/// Returns `None` only when the rotation is **exactly** identity (cos=1, sin=0),
/// preserving even tiny near-zero rotations for perfect round-trip fidelity.
fn affine_to_rotation_transform(t: &AffineTransform) -> Option<fbs::CGTransform2D> {
    let cos = t.matrix[0][0];
    let sin = t.matrix[1][0];
    // Only skip when exactly identity — even sub-epsilon rotations must survive
    // round-trips so that decode(encode(decode(bytes))) is bit-identical.
    if cos == 1.0 && sin == 0.0 {
        None
    } else {
        Some(fbs::CGTransform2D::new(cos, -sin, 0.0, sin, cos, 0.0))
    }
}

fn encode_color_to_rgba32f(c: &CGColor) -> fbs::RGBA32F {
    fbs::RGBA32F::new(
        c.r as f32 / 255.0,
        c.g as f32 / 255.0,
        c.b as f32 / 255.0,
        c.a as f32 / 255.0,
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Blend mode encoding
// ─────────────────────────────────────────────────────────────────────────────

fn encode_layer_blend_mode(lbm: LayerBlendMode) -> fbs::LayerBlendMode {
    match lbm {
        LayerBlendMode::PassThrough => fbs::LayerBlendMode::PassThrough,
        LayerBlendMode::Blend(bm) => fbs::LayerBlendMode(encode_blend_mode(bm).0),
    }
}

fn encode_mask_type<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    mask: Option<LayerMaskType>,
) -> (fbs::LayerMaskType, Option<flatbuffers::WIPOffset<flatbuffers::UnionWIPOffset>>) {
    match mask {
        None => (fbs::LayerMaskType::NONE, None),
        Some(LayerMaskType::Image(imt)) => {
            let fbs_imt = match imt {
                crate::cg::types::ImageMaskType::Alpha => fbs::ImageMaskType::Alpha,
                crate::cg::types::ImageMaskType::Luminance => fbs::ImageMaskType::Luminance,
            };
            let table = fbs::LayerMaskTypeImage::create(
                fbb,
                &fbs::LayerMaskTypeImageArgs {
                    image_mask_type: fbs_imt,
                },
            );
            (
                fbs::LayerMaskType::LayerMaskTypeImage,
                Some(table.as_union_value()),
            )
        }
        Some(LayerMaskType::Geometry) => {
            let table = fbs::LayerMaskTypeGeometry::create(
                fbb,
                &fbs::LayerMaskTypeGeometryArgs {},
            );
            (
                fbs::LayerMaskType::LayerMaskTypeGeometry,
                Some(table.as_union_value()),
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paint encoding
// ─────────────────────────────────────────────────────────────────────────────

fn encode_paints<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    paints: &Paints,
) -> Option<flatbuffers::WIPOffset<flatbuffers::Vector<'a, flatbuffers::ForwardsUOffset<fbs::PaintStackItem<'a>>>>> {
    if paints.is_empty() {
        return None;
    }
    let items: Vec<_> = paints
        .as_slice()
        .iter()
        .filter_map(|p| encode_paint_item(fbb, p))
        .collect();
    Some(fbb.create_vector(&items))
}

fn encode_paint_item<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    paint: &Paint,
) -> Option<flatbuffers::WIPOffset<fbs::PaintStackItem<'a>>> {
    match paint {
        Paint::Solid(sp) => {
            let color = encode_color_to_rgba32f(&sp.color);
            let solid = fbs::SolidPaint::create(fbb, &fbs::SolidPaintArgs {
                active: sp.active,
                color: Some(&color),
                blend_mode: encode_blend_mode(sp.blend_mode),
            });
            Some(fbs::PaintStackItem::create(fbb, &fbs::PaintStackItemArgs {
                paint_type: fbs::Paint::SolidPaint,
                paint: Some(solid.as_union_value()),
            }))
        }
        Paint::LinearGradient(lg) => {
            let stops = encode_gradient_stops(fbb, &lg.stops);
            let xy1 = fbs::Alignment::new(lg.xy1.0, lg.xy1.1);
            let xy2 = fbs::Alignment::new(lg.xy2.0, lg.xy2.1);
            let transform = encode_affine_to_cg_transform(&lg.transform);
            let lgp = fbs::LinearGradientPaint::create(fbb, &fbs::LinearGradientPaintArgs {
                active: lg.active,
                xy1: Some(&xy1),
                xy2: Some(&xy2),
                stops: Some(stops),
                opacity: lg.opacity,
                blend_mode: encode_blend_mode(lg.blend_mode),
                transform: Some(&transform),
                ..Default::default()
            });
            Some(fbs::PaintStackItem::create(fbb, &fbs::PaintStackItemArgs {
                paint_type: fbs::Paint::LinearGradientPaint,
                paint: Some(lgp.as_union_value()),
            }))
        }
        Paint::RadialGradient(rg) => {
            let stops = encode_gradient_stops(fbb, &rg.stops);
            let transform = encode_affine_to_cg_transform(&rg.transform);
            let rgp = fbs::RadialGradientPaint::create(fbb, &fbs::RadialGradientPaintArgs {
                active: rg.active,
                stops: Some(stops),
                opacity: rg.opacity,
                blend_mode: encode_blend_mode(rg.blend_mode),
                transform: Some(&transform),
                ..Default::default()
            });
            Some(fbs::PaintStackItem::create(fbb, &fbs::PaintStackItemArgs {
                paint_type: fbs::Paint::RadialGradientPaint,
                paint: Some(rgp.as_union_value()),
            }))
        }
        Paint::SweepGradient(sg) => {
            let stops = encode_gradient_stops(fbb, &sg.stops);
            let transform = encode_affine_to_cg_transform(&sg.transform);
            let sgp = fbs::SweepGradientPaint::create(fbb, &fbs::SweepGradientPaintArgs {
                active: sg.active,
                stops: Some(stops),
                opacity: sg.opacity,
                blend_mode: encode_blend_mode(sg.blend_mode),
                transform: Some(&transform),
            });
            Some(fbs::PaintStackItem::create(fbb, &fbs::PaintStackItemArgs {
                paint_type: fbs::Paint::SweepGradientPaint,
                paint: Some(sgp.as_union_value()),
            }))
        }
        Paint::Image(ip) => {
            let image_ref_offset = match &ip.image {
                ResourceRef::HASH(h) => {
                    let hash_str = fbb.create_string(h);
                    let href = fbs::ResourceRefHASH::create(fbb, &fbs::ResourceRefHASHArgs { hash: Some(hash_str) });
                    (fbs::ResourceRef::ResourceRefHASH, href.as_union_value())
                }
                ResourceRef::RID(r) => {
                    let rid_str = fbb.create_string(r);
                    let rref = fbs::ResourceRefRID::create(fbb, &fbs::ResourceRefRIDArgs { rid: Some(rid_str) });
                    (fbs::ResourceRef::ResourceRefRID, rref.as_union_value())
                }
            };
            let alignment = fbs::Alignment::new(ip.alignement.0, ip.alignement.1);
            let (fit_type, fit_value) = encode_image_paint_fit(fbb, &ip.fit);
            let ip_offset = fbs::ImagePaint::create(fbb, &fbs::ImagePaintArgs {
                active: ip.active,
                image_type: image_ref_offset.0,
                image: Some(image_ref_offset.1),
                quarter_turns: ip.quarter_turns,
                alignement: Some(&alignment),
                fit_type,
                fit: Some(fit_value),
                opacity: ip.opacity,
                blend_mode: encode_blend_mode(ip.blend_mode),
                ..Default::default()
            });
            Some(fbs::PaintStackItem::create(fbb, &fbs::PaintStackItemArgs {
                paint_type: fbs::Paint::ImagePaint,
                paint: Some(ip_offset.as_union_value()),
            }))
        }
        _ => None,
    }
}

fn encode_image_paint_fit<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    fit: &ImagePaintFit,
) -> (fbs::ImagePaintFit, flatbuffers::WIPOffset<flatbuffers::UnionWIPOffset>) {
    match fit {
        ImagePaintFit::Fit(box_fit) => {
            let f = fbs::ImagePaintFitFit::create(fbb, &fbs::ImagePaintFitFitArgs { box_fit: encode_box_fit(*box_fit) });
            (fbs::ImagePaintFit::ImagePaintFitFit, f.as_union_value())
        }
        ImagePaintFit::Transform(t) => {
            let ct = encode_affine_to_cg_transform(t);
            let f = fbs::ImagePaintFitTransform::create(fbb, &fbs::ImagePaintFitTransformArgs { transform: Some(&ct) });
            (fbs::ImagePaintFit::ImagePaintFitTransform, f.as_union_value())
        }
        ImagePaintFit::Tile(tile) => {
            let fbs_repeat = match tile.repeat {
                crate::cg::types::ImageRepeat::RepeatX => fbs::ImageRepeat::RepeatX,
                crate::cg::types::ImageRepeat::RepeatY => fbs::ImageRepeat::RepeatY,
                crate::cg::types::ImageRepeat::Repeat => fbs::ImageRepeat::Repeat,
            };
            let fbs_tile = fbs::ImageTile::new(tile.scale, fbs_repeat);
            let f = fbs::ImagePaintFitTile::create(fbb, &fbs::ImagePaintFitTileArgs { tile: Some(&fbs_tile) });
            (fbs::ImagePaintFit::ImagePaintFitTile, f.as_union_value())
        }
    }
}

fn encode_gradient_stops<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    stops: &[GradientStop],
) -> flatbuffers::WIPOffset<flatbuffers::Vector<'a, fbs::GradientStop>> {
    let fbs_stops: Vec<_> = stops
        .iter()
        .map(|s| {
            let color = encode_color_to_rgba32f(&s.color);
            fbs::GradientStop::new(s.offset, &color)
        })
        .collect();
    fbb.create_vector(&fbs_stops)
}

fn encode_affine_to_cg_transform(t: &AffineTransform) -> fbs::CGTransform2D {
    fbs::CGTransform2D::new(
        t.matrix[0][0], // m00 = a
        t.matrix[0][1], // m01 = c
        t.matrix[0][2], // m02 = tx
        t.matrix[1][0], // m10 = b
        t.matrix[1][1], // m11 = d
        t.matrix[1][2], // m12 = ty
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Effects encoding
// ─────────────────────────────────────────────────────────────────────────────

/// Encode an `FeBlur` variant into its FBS union discriminant + payload.
fn encode_fe_blur<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    blur: &FeBlur,
) -> (fbs::FeBlur, flatbuffers::WIPOffset<flatbuffers::UnionWIPOffset>) {
    match blur {
        FeBlur::Gaussian(g) => {
            let offset =
                fbs::FeGaussianBlur::create(fbb, &fbs::FeGaussianBlurArgs { radius: g.radius });
            (fbs::FeBlur::FeGaussianBlur, offset.as_union_value())
        }
        FeBlur::Progressive(p) => {
            let fbs_start = fbs::Alignment::new(p.start.0, p.start.1);
            let fbs_end = fbs::Alignment::new(p.end.0, p.end.1);
            let offset = fbs::FeProgressiveBlur::create(
                fbb,
                &fbs::FeProgressiveBlurArgs {
                    start: Some(&fbs_start),
                    end: Some(&fbs_end),
                    radius: p.radius,
                    radius2: p.radius2,
                },
            );
            (fbs::FeBlur::FeProgressiveBlur, offset.as_union_value())
        }
    }
}

fn encode_layer_effects<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    effects: &LayerEffects,
) -> Option<flatbuffers::WIPOffset<fbs::LayerEffects<'a>>> {
    let has_any = effects.blur.is_some()
        || effects.backdrop_blur.is_some()
        || !effects.shadows.is_empty()
        || effects.glass.is_some()
        || !effects.noises.is_empty();
    if !has_any {
        return None;
    }

    let blur_offset = effects.blur.as_ref().map(|lb| {
        let (blur_type, blur_union) = encode_fe_blur(fbb, &lb.blur);
        fbs::FeLayerBlur::create(fbb, &fbs::FeLayerBlurArgs {
            active: lb.active,
            blur_type,
            blur: Some(blur_union),
        })
    });

    let backdrop_blur_offset = effects.backdrop_blur.as_ref().map(|bb| {
        let (blur_type, blur_union) = encode_fe_blur(fbb, &bb.blur);
        fbs::FeBackdropBlur::create(fbb, &fbs::FeBackdropBlurArgs {
            active: bb.active,
            blur_type,
            blur: Some(blur_union),
        })
    });

    let shadows_offset = if effects.shadows.is_empty() {
        None
    } else {
        let shadow_items: Vec<_> = effects.shadows.iter().map(|s| encode_filter_shadow_effect(fbb, s)).collect();
        Some(fbb.create_vector(&shadow_items))
    };

    let glass_offset = effects.glass.as_ref().map(|lg| {
        fbs::FeLiquidGlass::create(fbb, &fbs::FeLiquidGlassArgs {
            active: lg.active,
            light_intensity: lg.light_intensity,
            light_angle: lg.light_angle,
            refraction: lg.refraction,
            depth: lg.depth,
            dispersion: lg.dispersion,
            blur_radius: lg.blur_radius,
        })
    });

    let noises_offset = if effects.noises.is_empty() {
        None
    } else {
        let noise_items: Vec<_> = effects.noises.iter().map(|n| encode_fe_noise_effect(fbb, n)).collect();
        Some(fbb.create_vector(&noise_items))
    };

    Some(fbs::LayerEffects::create(fbb, &fbs::LayerEffectsArgs {
        fe_blur: blur_offset,
        fe_backdrop_blur: backdrop_blur_offset,
        fe_shadows: shadows_offset,
        fe_glass: glass_offset,
        fe_noises: noises_offset,
    }))
}

fn encode_filter_shadow_effect<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    effect: &FilterShadowEffect,
) -> flatbuffers::WIPOffset<fbs::FilterShadowEffect<'a>> {
    let (kind, shadow) = match effect {
        FilterShadowEffect::DropShadow(s) => (fbs::FilterShadowEffectKind::DropShadow, s),
        FilterShadowEffect::InnerShadow(s) => (fbs::FilterShadowEffectKind::InnerShadow, s),
    };
    let color = encode_color_to_rgba32f(&shadow.color);
    let shadow_offset = fbs::FeShadow::create(fbb, &fbs::FeShadowArgs {
        active: shadow.active, dx: shadow.dx, dy: shadow.dy,
        blur: shadow.blur, spread: shadow.spread, color: Some(&color),
    });
    fbs::FilterShadowEffect::create(fbb, &fbs::FilterShadowEffectArgs {
        kind, shadow: Some(shadow_offset),
    })
}

fn encode_fe_noise_effect<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    noise: &FeNoiseEffect,
) -> flatbuffers::WIPOffset<fbs::FeNoiseEffect<'a>> {
    let coloring = encode_noise_colors(fbb, &noise.coloring);
    fbs::FeNoiseEffect::create(fbb, &fbs::FeNoiseEffectArgs {
        active: noise.active, noise_size: noise.noise_size, density: noise.density,
        num_octaves: noise.num_octaves, seed: noise.seed, coloring: Some(coloring),
        blend_mode: encode_blend_mode(noise.blend_mode),
    })
}

fn encode_noise_colors<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    colors: &NoiseEffectColors,
) -> flatbuffers::WIPOffset<fbs::NoiseEffectColors<'a>> {
    match colors {
        NoiseEffectColors::Mono { color } => {
            let c = encode_color_to_rgba32f(color);
            fbs::NoiseEffectColors::create(fbb, &fbs::NoiseEffectColorsArgs {
                kind: fbs::NoiseEffectColorsKind::Mono, mono_color: Some(&c), ..Default::default()
            })
        }
        NoiseEffectColors::Duo { color1, color2 } => {
            let c1 = encode_color_to_rgba32f(color1);
            let c2 = encode_color_to_rgba32f(color2);
            fbs::NoiseEffectColors::create(fbb, &fbs::NoiseEffectColorsArgs {
                kind: fbs::NoiseEffectColorsKind::Duo, duo_color1: Some(&c1), duo_color2: Some(&c2), ..Default::default()
            })
        }
        NoiseEffectColors::Multi { opacity } => {
            fbs::NoiseEffectColors::create(fbb, &fbs::NoiseEffectColorsArgs {
                kind: fbs::NoiseEffectColorsKind::Multi, multi_opacity: *opacity, ..Default::default()
            })
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stroke encoding
// ─────────────────────────────────────────────────────────────────────────────

fn encode_stroke_style<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    ss: &StrokeStyle,
) -> flatbuffers::WIPOffset<fbs::StrokeStyle<'a>> {
    let dash = ss.stroke_dash_array.as_ref().map(|da| {
        let floats: Vec<f32> = da.0.clone();
        fbb.create_vector(&floats)
    });
    fbs::StrokeStyle::create(
        fbb,
        &fbs::StrokeStyleArgs {
            stroke_align: encode_stroke_align(ss.stroke_align),
            stroke_cap: encode_stroke_cap(ss.stroke_cap),
            stroke_join: encode_stroke_join(ss.stroke_join),
            stroke_miter_limit: ss.stroke_miter_limit.0,
            stroke_dash_array: dash,
        },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout encoding
// ─────────────────────────────────────────────────────────────────────────────

fn encode_px_offset<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    v: f32,
) -> flatbuffers::WIPOffset<fbs::PositioningSideOffsetValue<'a>> {
    fbs::PositioningSideOffsetValue::create(
        fbb,
        &fbs::PositioningSideOffsetValueArgs {
            kind: fbs::PositioningSideOffsetKind::Px,
            value: Some(v),
        },
    )
}

fn encode_dim_px<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    v: Option<f32>,
) -> Option<flatbuffers::WIPOffset<fbs::LayoutDimensionValue<'a>>> {
    v.map(|px| {
        fbs::LayoutDimensionValue::create(
            fbb,
            &fbs::LayoutDimensionValueArgs {
                unit: fbs::LayoutDimensionUnit::LengthPx,
                value: Some(px),
            },
        )
    })
}

fn encode_dimensions<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    w: Option<f32>,
    h: Option<f32>,
) -> flatbuffers::WIPOffset<fbs::LayoutDimensionStyle<'a>> {
    let dim_w = encode_dim_px(fbb, w);
    let dim_h = encode_dim_px(fbb, h);
    fbs::LayoutDimensionStyle::create(
        fbb,
        &fbs::LayoutDimensionStyleArgs {
            layout_target_width: dim_w,
            layout_target_height: dim_h,
            layout_target_aspect_ratio: None,
        },
    )
}

fn encode_layout_child_style<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    child: &Option<LayoutChildStyle>,
) -> Option<flatbuffers::WIPOffset<fbs::LayoutChildStyle<'a>>> {
    child.as_ref().map(|lc| {
        let pos = match lc.layout_positioning {
            LayoutPositioning::Absolute => fbs::LayoutPositioning::Absolute,
            LayoutPositioning::Auto => fbs::LayoutPositioning::Auto,
        };
        fbs::LayoutChildStyle::create(
            fbb,
            &fbs::LayoutChildStyleArgs {
                layout_grow: lc.layout_grow,
                layout_positioning: pos,
            },
        )
    })
}

fn encode_layout_position<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    pos: &LayoutPositioningBasis,
) -> (
    fbs::LayoutPositioningBasis,
    Option<flatbuffers::WIPOffset<flatbuffers::UnionWIPOffset>>,
) {
    match pos {
        LayoutPositioningBasis::Cartesian(p) => {
            let cart = fbs::LayoutPositioningCartesian::create(
                fbb,
                &fbs::LayoutPositioningCartesianArgs { x: p.x, y: p.y },
            );
            (
                fbs::LayoutPositioningBasis::LayoutPositioningCartesian,
                Some(cart.as_union_value()),
            )
        }
        LayoutPositioningBasis::Inset(ei) => {
            let left = encode_px_offset(fbb, ei.left);
            let top = encode_px_offset(fbb, ei.top);
            let right = encode_px_offset(fbb, ei.right);
            let bottom = encode_px_offset(fbb, ei.bottom);
            let inset = fbs::LayoutPositioningInset::create(
                fbb,
                &fbs::LayoutPositioningInsetArgs {
                    left: Some(left),
                    top: Some(top),
                    right: Some(right),
                    bottom: Some(bottom),
                },
            );
            (
                fbs::LayoutPositioningBasis::LayoutPositioningInset,
                Some(inset.as_union_value()),
            )
        }
        #[allow(deprecated)]
        _ => (fbs::LayoutPositioningBasis::NONE, None),
    }
}

// ─── LayoutStyle builders ────────────────────────────────────────────────────

/// Build a LayoutStyle for shape nodes (position as Inset, dimensions, child style).
fn encode_shape_layout<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    x: f32,
    y: f32,
    width: Option<f32>,
    height: Option<f32>,
    layout_child: &Option<LayoutChildStyle>,
) -> flatbuffers::WIPOffset<fbs::LayoutStyle<'a>> {
    let left = encode_px_offset(fbb, x);
    let top = encode_px_offset(fbb, y);
    let inset = fbs::LayoutPositioningInset::create(
        fbb,
        &fbs::LayoutPositioningInsetArgs {
            left: Some(left),
            top: Some(top),
            right: None,
            bottom: None,
        },
    );
    let dims = encode_dimensions(fbb, width, height);
    let child = encode_layout_child_style(fbb, layout_child);
    fbs::LayoutStyle::create(
        fbb,
        &fbs::LayoutStyleArgs {
            layout_position_type: fbs::LayoutPositioningBasis::LayoutPositioningInset,
            layout_position: Some(inset.as_union_value()),
            layout_dimensions: Some(dims),
            layout_container: None,
            layout_child: child,
        },
    )
}

/// Build a LayoutStyle for container nodes (position, dimensions, container style, child style).
fn encode_container_layout<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    position: &LayoutPositioningBasis,
    dimensions: &LayoutDimensionStyle,
    container_style: &LayoutContainerStyle,
    layout_child: &Option<LayoutChildStyle>,
) -> flatbuffers::WIPOffset<fbs::LayoutStyle<'a>> {
    let (pos_type, pos_offset) = encode_layout_position(fbb, position);

    // Container style — use FBS `::None` sentinels for unset optional enum fields
    // so the decoder can distinguish "not set" from "explicitly set to default".
    let padding = container_style.layout_padding.as_ref().map(|p| {
        fbs::EdgeInsets::new(p.top, p.right, p.bottom, p.left)
    });
    let lc_fbs = Some(fbs::LayoutContainerStyle::create(
        fbb,
        &fbs::LayoutContainerStyleArgs {
            layout_mode: match container_style.layout_mode {
                LayoutMode::Flex => fbs::LayoutMode::Flex,
                LayoutMode::Normal => fbs::LayoutMode::Normal,
            },
            layout_direction: match container_style.layout_direction {
                Axis::Horizontal => fbs::Axis::Horizontal,
                Axis::Vertical => fbs::Axis::Vertical,
            },
            layout_wrap: container_style
                .layout_wrap
                .map(|w| match w {
                    LayoutWrap::Wrap => fbs::LayoutWrap::Wrap,
                    LayoutWrap::NoWrap => fbs::LayoutWrap::NoWrap,
                })
                .unwrap_or(fbs::LayoutWrap::None),
            layout_main_axis_alignment: container_style
                .layout_main_axis_alignment
                .map(encode_main_axis_alignment)
                .unwrap_or(fbs::MainAxisAlignment::None),
            layout_cross_axis_alignment: container_style
                .layout_cross_axis_alignment
                .map(encode_cross_axis_alignment)
                .unwrap_or(fbs::CrossAxisAlignment::None),
            layout_padding: padding.as_ref(),
            layout_main_axis_gap: container_style
                .layout_gap
                .as_ref()
                .map(|g| g.main_axis_gap)
                .unwrap_or(0.0),
            layout_cross_axis_gap: container_style
                .layout_gap
                .as_ref()
                .map(|g| g.cross_axis_gap)
                .unwrap_or(0.0),
        },
    ));

    let dims = encode_dimensions(fbb, dimensions.layout_target_width, dimensions.layout_target_height);
    let child = encode_layout_child_style(fbb, layout_child);
    fbs::LayoutStyle::create(
        fbb,
        &fbs::LayoutStyleArgs {
            layout_position_type: pos_type,
            layout_position: pos_offset,
            layout_dimensions: Some(dims),
            layout_container: lc_fbs,
            layout_child: child,
        },
    )
}

// ─── Shared encoder helpers ──────────────────────────────────────────────────

/// Wrap a typed FBS node into a `NodeSlot`.
fn make_node_slot<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    node_type: fbs::Node,
    node: flatbuffers::WIPOffset<flatbuffers::UnionWIPOffset>,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    fbs::NodeSlot::create(
        fbb,
        &fbs::NodeSlotArgs {
            node_type,
            node: Some(node),
        },
    )
}

/// Create a `StrokeGeometryTrait` from a `StrokeStyle`, scalar width, and
/// optional variable-width profile.
fn encode_stroke_geometry<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    ss: &StrokeStyle,
    width: f32,
    profile: Option<&varwidth::VarWidthProfile>,
) -> flatbuffers::WIPOffset<fbs::StrokeGeometryTrait<'a>> {
    let stroke_style_offset = encode_stroke_style(fbb, ss);
    let profile_offset = profile.map(|p| {
        let stop_offsets: Vec<_> = p
            .stops
            .iter()
            .map(|s| {
                fbs::VariableWidthStop::create(
                    fbb,
                    &fbs::VariableWidthStopArgs { u: s.u, r: s.r },
                )
            })
            .collect();
        let stops_vec = fbb.create_vector(&stop_offsets);
        fbs::VariableWidthProfile::create(
            fbb,
            &fbs::VariableWidthProfileArgs {
                stops: Some(stops_vec),
            },
        )
    });
    fbs::StrokeGeometryTrait::create(
        fbb,
        &fbs::StrokeGeometryTraitArgs {
            stroke_style: Some(stroke_style_offset),
            stroke_width: width,
            stroke_width_profile: profile_offset,
        },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Node-specific encoders
// ─────────────────────────────────────────────────────────────────────────────

fn encode_container_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    r: &ContainerNodeRec,
    node_id: &str,
    parent_id: &str,
    position: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    let sys = encode_system_node_trait(fbb, node_id, "", r.active, false);
    let layout = encode_container_layout(
        fbb,
        &r.position,
        &r.layout_dimensions,
        &r.layout_container,
        &r.layout_child,
    );
    let layer = encode_layer_trait(
        fbb,
        &LayerTraitInput {
            parent_id,
            position,
            opacity: r.opacity,
            blend_mode: r.blend_mode,
            mask: r.mask,
            effects: &r.effects,
            post_layout_transform: rotation_degrees_to_transform(r.rotation),
            layout: Some(layout),
        },
    );

    // Corner radius
    let rcr = encode_rectangular_corner_radius(&r.corner_radius);
    let cr_trait = fbs::RectangularCornerRadiusTrait::create(
        fbb,
        &fbs::RectangularCornerRadiusTraitArgs {
            rectangular_corner_radius: Some(&rcr),
            corner_smoothing: r.corner_smoothing.0,
        },
    );

    // Stroke geometry
    let stroke_style_offset = encode_stroke_style(fbb, &r.stroke_style);
    let rsw = encode_rectangular_stroke_width(&r.stroke_width);
    let sg = fbs::RectangularStrokeGeometryTrait::create(
        fbb,
        &fbs::RectangularStrokeGeometryTraitArgs {
            stroke_style: Some(stroke_style_offset),
            rectangular_stroke_width: rsw.as_ref(),
            stroke_width_profile: None,
        },
    );

    let fill_offsets = encode_paints(fbb, &r.fills);
    let stroke_offsets = encode_paints(fbb, &r.strokes);

    let cn = fbs::ContainerNode::create(fbb, &fbs::ContainerNodeArgs {
        node: Some(sys), layer: Some(layer),
        corner_radius: Some(cr_trait), stroke_geometry: Some(sg),
        fill_paints: fill_offsets, stroke_paints: stroke_offsets,
        clips_content: r.clip,
    });
    make_node_slot(fbb, fbs::Node::ContainerNode, cn.as_union_value())
}

fn encode_initial_container_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    r: &InitialContainerNodeRec,
    node_id: &str,
    parent_id: &str,
    position: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    let sys = encode_system_node_trait(fbb, node_id, "", r.active, false);

    // Build container-style layout
    let container_style = LayoutContainerStyle {
        layout_mode: r.layout_mode,
        layout_direction: r.layout_direction,
        layout_wrap: Some(r.layout_wrap),
        layout_main_axis_alignment: Some(r.layout_main_axis_alignment),
        layout_cross_axis_alignment: Some(r.layout_cross_axis_alignment),
        layout_padding: Some(r.padding),
        layout_gap: Some(r.layout_gap),
    };
    let layout = encode_container_layout(
        fbb,
        &LayoutPositioningBasis::zero(),
        &LayoutDimensionStyle::default(),
        &container_style,
        &None,
    );
    let default_effects = LayerEffects::default();
    let layer = encode_layer_trait(
        fbb,
        &LayerTraitInput {
            parent_id,
            position,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            effects: &default_effects,
            post_layout_transform: None,
            layout: Some(layout),
        },
    );

    let icn = fbs::InitialContainerNode::create(fbb, &fbs::InitialContainerNodeArgs {
        node: Some(sys), layer: Some(layer),
    });
    make_node_slot(fbb, fbs::Node::InitialContainerNode, icn.as_union_value())
}

fn encode_group_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    r: &GroupNodeRec,
    node_id: &str,
    parent_id: &str,
    position: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    let (x, y) = match &r.transform {
        Some(t) => (t.x(), t.y()),
        None => (0.0, 0.0),
    };
    let plt = r.transform.as_ref().and_then(affine_to_rotation_transform);

    let sys = encode_system_node_trait(fbb, node_id, "", r.active, false);
    let layout = encode_shape_layout(fbb, x, y, None, None, &None);
    let default_effects = LayerEffects::default();
    let layer = encode_layer_trait(
        fbb,
        &LayerTraitInput {
            parent_id,
            position,
            opacity: r.opacity,
            blend_mode: r.blend_mode,
            mask: r.mask,
            effects: &default_effects,
            post_layout_transform: plt,
            layout: Some(layout),
        },
    );

    let gn = fbs::GroupNode::create(fbb, &fbs::GroupNodeArgs {
        node: Some(sys), layer: Some(layer),
    });
    make_node_slot(fbb, fbs::Node::GroupNode, gn.as_union_value())
}

/// Unified data source for BasicShapeNode encoding.
enum BasicShapeFields<'a> {
    Rectangle(&'a RectangleNodeRec),
    Ellipse(&'a EllipseNodeRec),
    RegularPolygon(&'a RegularPolygonNodeRec),
    RegularStarPolygon(&'a RegularStarPolygonNodeRec),
}

fn encode_basic_shape_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    node_id: &str,
    parent_id: &str,
    position: &str,
    shape_type: fbs::CanonicalLayerShape,
    node_type: fbs::BasicShapeNodeType,
    fields: BasicShapeFields<'_>,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    // Extract common fields from the variant
    let (active, opacity, blend_mode, mask, effects, transform, size, fills, strokes, layout_child) =
        match &fields {
            BasicShapeFields::Rectangle(r) => (
                r.active, r.opacity, r.blend_mode, r.mask, &r.effects, &r.transform, &r.size,
                &r.fills, &r.strokes, &r.layout_child,
            ),
            BasicShapeFields::Ellipse(e) => (
                e.active, e.opacity, e.blend_mode, e.mask, &e.effects, &e.transform, &e.size,
                &e.fills, &e.strokes, &e.layout_child,
            ),
            BasicShapeFields::RegularPolygon(p) => (
                p.active, p.opacity, p.blend_mode, p.mask, &p.effects, &p.transform, &p.size,
                &p.fills, &p.strokes, &p.layout_child,
            ),
            BasicShapeFields::RegularStarPolygon(s) => (
                s.active, s.opacity, s.blend_mode, s.mask, &s.effects, &s.transform, &s.size,
                &s.fills, &s.strokes, &s.layout_child,
            ),
        };

    // Reverse-engineer x, y from from_box_center transform
    let (x, y) = reverse_from_box_center(transform, size.width, size.height);
    let plt = affine_to_rotation_transform(transform);

    let sys = encode_system_node_trait(fbb, node_id, "", active, false);
    let layout = encode_shape_layout(
        fbb,
        x,
        y,
        Some(size.width),
        Some(size.height),
        layout_child,
    );
    let layer = encode_layer_trait(
        fbb,
        &LayerTraitInput {
            parent_id,
            position,
            opacity,
            blend_mode,
            mask,
            effects,
            post_layout_transform: plt,
            layout: Some(layout),
        },
    );

    let fill_offsets = encode_paints(fbb, fills);
    let stroke_offsets = encode_paints(fbb, strokes);

    // Corner radius (scalar for polygon/star, rectangular for rectangle)
    let scalar_cr = match &fields {
        BasicShapeFields::Rectangle(r) => r.corner_radius.tl.rx,
        BasicShapeFields::Ellipse(_) => 0.0,
        BasicShapeFields::RegularPolygon(p) => p.corner_radius,
        BasicShapeFields::RegularStarPolygon(s) => s.corner_radius,
    };
    let rect_cr = match &fields {
        BasicShapeFields::Rectangle(r) => Some(encode_rectangular_corner_radius(&r.corner_radius)),
        _ => None,
    };

    // Stroke
    let (stroke_width_f32, stroke_style) = match &fields {
        BasicShapeFields::Rectangle(r) => (r.stroke_width.max(), &r.stroke_style),
        BasicShapeFields::Ellipse(e) => (e.stroke_width.0.unwrap_or(0.0), &e.stroke_style),
        BasicShapeFields::RegularPolygon(p) => (p.stroke_width.0.unwrap_or(0.0), &p.stroke_style),
        BasicShapeFields::RegularStarPolygon(s) => {
            (s.stroke_width.0.unwrap_or(0.0), &s.stroke_style)
        }
    };
    let stroke_style_offset = encode_stroke_style(fbb, stroke_style);

    // Shape descriptor
    let shape_offset = match &fields {
        BasicShapeFields::Rectangle(_) => {
            fbs::CanonicalShapeRectangular::create(fbb, &fbs::CanonicalShapeRectangularArgs {}).as_union_value()
        }
        BasicShapeFields::Ellipse(e) => {
            let inner = e.inner_radius.unwrap_or(0.0);
            let angle = e.angle.unwrap_or(360.0);
            let ring_sector_data = if inner != 0.0 || angle != 360.0 || e.start_angle != 0.0 {
                Some(fbs::CanonicalEllipticalShapeRingSectorParameters::create(
                    fbb,
                    &fbs::CanonicalEllipticalShapeRingSectorParametersArgs {
                        inner_radius_ratio: inner,
                        start_angle: e.start_angle,
                        angle,
                    },
                ))
            } else {
                None
            };
            fbs::CanonicalShapeElliptical::create(
                fbb,
                &fbs::CanonicalShapeEllipticalArgs { ring_sector_data },
            )
            .as_union_value()
        }
        BasicShapeFields::RegularPolygon(p) => {
            fbs::CanonicalShapeRegularPolygon::create(fbb, &fbs::CanonicalShapeRegularPolygonArgs {
                point_count: p.point_count as u32,
            }).as_union_value()
        }
        BasicShapeFields::RegularStarPolygon(s) => {
            fbs::CanonicalShapeRegularStarPolygon::create(fbb, &fbs::CanonicalShapeRegularStarPolygonArgs {
                point_count: s.point_count as u32,
                inner_radius_ratio: s.inner_radius,
            }).as_union_value()
        }
    };

    let bsn = fbs::BasicShapeNode::create(fbb, &fbs::BasicShapeNodeArgs {
        node: Some(sys), layer: Some(layer),
        type_: node_type, shape_type, shape: Some(shape_offset),
        corner_radius: scalar_cr, fill_paints: fill_offsets,
        stroke_style: Some(stroke_style_offset), stroke_width: stroke_width_f32,
        rectangular_corner_radius: rect_cr.as_ref(),
        stroke_paints: stroke_offsets,
        ..Default::default()
    });

    make_node_slot(fbb, fbs::Node::BasicShapeNode, bsn.as_union_value())
}

fn encode_line_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    r: &LineNodeRec,
    node_id: &str,
    parent_id: &str,
    position: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    // Lines use AffineTransform::new(x, y, rotation)
    let x = r.transform.x();
    let y = r.transform.y();
    let plt = affine_to_rotation_transform(&r.transform);

    let sys = encode_system_node_trait(fbb, node_id, "", r.active, false);
    let layout = encode_shape_layout(fbb, x, y, Some(r.size.width), None, &r.layout_child);
    let layer = encode_layer_trait(
        fbb,
        &LayerTraitInput {
            parent_id,
            position,
            opacity: r.opacity,
            blend_mode: r.blend_mode,
            mask: r.mask,
            effects: &r.effects,
            post_layout_transform: plt,
            layout: Some(layout),
        },
    );

    let sg = encode_stroke_geometry(fbb, &StrokeStyle {
        stroke_align: r._data_stroke_align,
        stroke_cap: r.stroke_cap,
        stroke_join: StrokeJoin::Miter,
        stroke_miter_limit: r.stroke_miter_limit,
        stroke_dash_array: r.stroke_dash_array.clone(),
    }, r.stroke_width, None);

    let stroke_offsets = encode_paints(fbb, &r.strokes);

    let ln = fbs::LineNode::create(fbb, &fbs::LineNodeArgs {
        node: Some(sys), layer: Some(layer), stroke_geometry: Some(sg),
        stroke_paints: stroke_offsets,
        marker_start_shape: encode_stroke_marker(r.marker_start_shape),
        marker_end_shape: encode_stroke_marker(r.marker_end_shape),
    });
    make_node_slot(fbb, fbs::Node::LineNode, ln.as_union_value())
}

fn encode_vector_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    r: &VectorNodeRec,
    node_id: &str,
    parent_id: &str,
    position: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    let x = r.transform.x();
    let y = r.transform.y();
    let plt = affine_to_rotation_transform(&r.transform);

    let sys = encode_system_node_trait(fbb, node_id, "", r.active, false);
    let layout = encode_shape_layout(fbb, x, y, None, None, &r.layout_child);
    let layer = encode_layer_trait(
        fbb,
        &LayerTraitInput {
            parent_id,
            position,
            opacity: r.opacity,
            blend_mode: r.blend_mode,
            mask: r.mask,
            effects: &r.effects,
            post_layout_transform: plt,
            layout: Some(layout),
        },
    );

    // Vector network
    let vn = encode_vector_network(fbb, &r.network);

    let sg = encode_stroke_geometry(fbb, &StrokeStyle {
        stroke_align: r.stroke_align,
        stroke_cap: r.stroke_cap,
        stroke_join: r.stroke_join,
        stroke_miter_limit: r.stroke_miter_limit,
        stroke_dash_array: r.stroke_dash_array.clone(),
    }, r.stroke_width, r.stroke_width_profile.as_ref());

    let fill_offsets = encode_paints(fbb, &r.fills);
    let stroke_offsets = encode_paints(fbb, &r.strokes);

    let vn_node = fbs::VectorNode::create(fbb, &fbs::VectorNodeArgs {
        node: Some(sys), layer: Some(layer), stroke_geometry: Some(sg),
        stroke_paints: stroke_offsets, fill_paints: fill_offsets,
        vector_network_data: vn,
        marker_start_shape: encode_stroke_marker(r.marker_start_shape),
        marker_end_shape: encode_stroke_marker(r.marker_end_shape),
        ..Default::default()
    });
    make_node_slot(fbb, fbs::Node::VectorNode, vn_node.as_union_value())
}

fn encode_text_span_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    r: &TextSpanNodeRec,
    node_id: &str,
    parent_id: &str,
    position: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    let x = r.transform.x();
    let y = r.transform.y();
    let plt = affine_to_rotation_transform(&r.transform);

    let sys = encode_system_node_trait(fbb, node_id, "", r.active, false);
    let layout = encode_shape_layout(fbb, x, y, r.width, r.height, &r.layout_child);
    let layer = encode_layer_trait(
        fbb,
        &LayerTraitInput {
            parent_id,
            position,
            opacity: r.opacity,
            blend_mode: r.blend_mode,
            mask: r.mask,
            effects: &r.effects,
            post_layout_transform: plt,
            layout: Some(layout),
        },
    );

    // Text style
    let font_family_str = fbb.create_string(&r.text_style.font_family);
    let font_weight = fbs::FontWeight::new(r.text_style.font_weight.0);
    let text_style = fbs::TextStyleRec::create(fbb, &fbs::TextStyleRecArgs {
        font_family: Some(font_family_str),
        font_size: r.text_style.font_size,
        font_weight: Some(&font_weight),
        ..Default::default()
    });

    let text_str = fbb.create_string(&r.text);
    let fill_offsets = encode_paints(fbb, &r.fills);
    let stroke_offsets = encode_paints(fbb, &r.strokes);

    let sg = encode_stroke_geometry(fbb, &StrokeStyle {
        stroke_align: r.stroke_align,
        stroke_cap: StrokeCap::Butt,
        stroke_join: StrokeJoin::Miter,
        stroke_miter_limit: StrokeMiterLimit::default(),
        stroke_dash_array: None,
    }, r.stroke_width, None);

    let props = fbs::TextSpanNodeProperties::create(fbb, &fbs::TextSpanNodePropertiesArgs {
        text: Some(text_str), text_style: Some(text_style),
        text_align: encode_text_align(r.text_align),
        text_align_vertical: encode_text_align_vertical(r.text_align_vertical),
        fill_paints: fill_offsets, stroke_paints: stroke_offsets,
        stroke_geometry: Some(sg),
        ..Default::default()
    });

    let tn = fbs::TextSpanNode::create(fbb, &fbs::TextSpanNodeArgs {
        node: Some(sys), layer: Some(layer), properties: Some(props),
    });
    make_node_slot(fbb, fbs::Node::TextSpanNode, tn.as_union_value())
}

fn encode_boolean_operation_node<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    r: &BooleanPathOperationNodeRec,
    node_id: &str,
    parent_id: &str,
    position: &str,
) -> flatbuffers::WIPOffset<fbs::NodeSlot<'a>> {
    let sys = encode_system_node_trait(fbb, node_id, "", r.active, false);
    let layout = encode_shape_layout(fbb, 0.0, 0.0, None, None, &None);
    let layer = encode_layer_trait(
        fbb,
        &LayerTraitInput {
            parent_id,
            position,
            opacity: r.opacity,
            blend_mode: r.blend_mode,
            mask: r.mask,
            effects: &r.effects,
            post_layout_transform: None,
            layout: Some(layout),
        },
    );

    let op = encode_boolean_path_op(r.op);

    // Corner radius
    let cr_offset = r.corner_radius.map(|cr| {
        let radius = fbs::CGRadius::new(cr, cr);
        let cr_trait = fbs::CornerRadiusTrait::create(
            fbb,
            &fbs::CornerRadiusTraitArgs {
                corner_radius: Some(&radius),
                corner_smoothing: 0.0,
            },
        );
        cr_trait
    });

    let sg = encode_stroke_geometry(fbb, &r.stroke_style, r.stroke_width.0.unwrap_or(0.0), None);
    let fill_offsets = encode_paints(fbb, &r.fills);
    let stroke_offsets = encode_paints(fbb, &r.strokes);

    let bon = fbs::BooleanOperationNode::create(
        fbb,
        &fbs::BooleanOperationNodeArgs {
            node: Some(sys),
            layer: Some(layer),
            op,
            corner_radius: cr_offset,
            fill_paints: fill_offsets,
            stroke_geometry: Some(sg),
            stroke_paints: stroke_offsets,
        },
    );
    make_node_slot(fbb, fbs::Node::BooleanOperationNode, bon.as_union_value())
}

// ─────────────────────────────────────────────────────────────────────────────
// Vector network encoding
// ─────────────────────────────────────────────────────────────────────────────

fn encode_vector_network<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    network: &VectorNetwork,
) -> Option<flatbuffers::WIPOffset<fbs::VectorNetworkData<'a>>> {
    if network.vertices.is_empty() && network.segments.is_empty() && network.regions.is_empty() {
        return None;
    }

    let vertices: Vec<fbs::CGPoint> = network
        .vertices
        .iter()
        .map(|(x, y)| fbs::CGPoint::new(*x, *y))
        .collect();
    let vertices_vec = fbb.create_vector(&vertices);

    let segments: Vec<fbs::VectorNetworkSegment> = network
        .segments
        .iter()
        .map(|s| {
            let ta = fbs::CGPoint::new(s.ta.0, s.ta.1);
            let tb = fbs::CGPoint::new(s.tb.0, s.tb.1);
            fbs::VectorNetworkSegment::new(s.a as u32, s.b as u32, &ta, &tb)
        })
        .collect();
    let segments_vec = fbb.create_vector(&segments);

    let region_offsets: Vec<_> = network
        .regions
        .iter()
        .map(|r| encode_vector_network_region(fbb, r))
        .collect();
    let regions_vec = fbb.create_vector(&region_offsets);

    Some(fbs::VectorNetworkData::create(
        fbb,
        &fbs::VectorNetworkDataArgs {
            vertices: Some(vertices_vec),
            segments: Some(segments_vec),
            regions: Some(regions_vec),
        },
    ))
}

fn encode_vector_network_region<'a, A: flatbuffers::Allocator + 'a>(
    fbb: &mut flatbuffers::FlatBufferBuilder<'a, A>,
    region: &VectorNetworkRegion,
) -> flatbuffers::WIPOffset<fbs::VectorNetworkRegion<'a>> {
    let loops: Vec<_> = region
        .loops
        .iter()
        .map(|l| {
            let indices: Vec<u32> = l.0.iter().map(|&i| i as u32).collect();
            let indices_vec = fbb.create_vector(&indices);
            fbs::VectorNetworkLoop::create(
                fbb,
                &fbs::VectorNetworkLoopArgs {
                    loop_segment_indices: Some(indices_vec),
                },
            )
        })
        .collect();
    let loops_vec = fbb.create_vector(&loops);

    let fill_rule = match region.fill_rule {
        crate::cg::types::FillRule::EvenOdd => fbs::FillRule::EvenOdd,
        crate::cg::types::FillRule::NonZero => fbs::FillRule::NonZero,
    };

    let fills_offset = region
        .fills
        .as_ref()
        .and_then(|p| encode_paints(fbb, p));

    fbs::VectorNetworkRegion::create(
        fbb,
        &fbs::VectorNetworkRegionArgs {
            region_loops: Some(loops_vec),
            region_fill_rule: fill_rule,
            region_fill_paints: fills_offset,
        },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers for encoding
// ─────────────────────────────────────────────────────────────────────────────

fn encode_rectangular_corner_radius(
    cr: &RectangularCornerRadius,
) -> fbs::RectangularCornerRadius {
    let tl = fbs::CGRadius::new(cr.tl.rx, cr.tl.ry);
    let tr = fbs::CGRadius::new(cr.tr.rx, cr.tr.ry);
    let bl = fbs::CGRadius::new(cr.bl.rx, cr.bl.ry);
    let br = fbs::CGRadius::new(cr.br.rx, cr.br.ry);
    fbs::RectangularCornerRadius::new(&tl, &tr, &bl, &br)
}

fn encode_rectangular_stroke_width(sw: &StrokeWidth) -> Option<fbs::RectangularStrokeWidth> {
    match sw {
        StrokeWidth::None => Some(fbs::RectangularStrokeWidth::new(0.0, 0.0, 0.0, 0.0)),
        StrokeWidth::Uniform(w) => Some(fbs::RectangularStrokeWidth::new(*w, *w, *w, *w)),
        StrokeWidth::Rectangular(rsw) => Some(fbs::RectangularStrokeWidth::new(
            rsw.stroke_top_width,
            rsw.stroke_right_width,
            rsw.stroke_bottom_width,
            rsw.stroke_left_width,
        )),
    }
}

/// Reverse-engineer (x, y) from an `AffineTransform` that was created via
/// `AffineTransform::from_box_center(x, y, w, h, rotation_deg)`.
///
/// `from_box_center` = `from_box(x, y, w, h, deg, 0.5, 0.5)`:
///   tx = x + (w/2)*(1-cos) + sin*(h/2)
///   ty = y + (h/2)*(1-cos) - sin*(w/2)
///
/// So: x = tx - (w/2)*(1-cos) - sin*(h/2)
///     y = ty - (h/2)*(1-cos) + sin*(w/2)
fn reverse_from_box_center(t: &AffineTransform, w: f32, h: f32) -> (f32, f32) {
    let cos = t.matrix[0][0];
    let sin = t.matrix[1][0];
    let tx = t.matrix[0][2];
    let ty = t.matrix[1][2];
    let x = tx - (w / 2.0) * (1.0 - cos) - sin * (h / 2.0);
    let y = ty - (h / 2.0) * (1.0 - cos) + sin * (w / 2.0);
    (x, y)
}
