use crate::cg::types::*;
use crate::cg::varwidth::{VarWidthProfile, WidthStop};
use crate::io::io_css::{
    de_css_dimension, default_height_css, default_width_css, CSSDimension, CSSObjectFit,
};
use crate::node::schema::*;
use crate::vectornetwork::*;
use math2::{box_fit::BoxFit, transform::AffineTransform};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct JSONCanvasFile {
    pub version: String,
    pub document: JSONDocument,
}

#[derive(Debug, Deserialize)]
pub struct JSONDocument {
    pub bitmaps: HashMap<String, serde_json::Value>,
    pub properties: HashMap<String, serde_json::Value>,
    pub nodes: HashMap<String, JSONNode>,
    pub scenes: HashMap<String, JSONScene>,
    pub entry_scene_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct JSONGradientStop {
    pub offset: f32,
    pub color: JSONRGBA,
}

impl From<JSONGradientStop> for GradientStop {
    fn from(stop: JSONGradientStop) -> Self {
        GradientStop {
            offset: stop.offset,
            color: stop.color.into(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum JSONPaint {
    #[serde(rename = "solid")]
    Solid {
        color: Option<JSONRGBA>,
        #[serde(rename = "blendMode", default)]
        blend_mode: BlendMode,
    },
    #[serde(rename = "linear_gradient")]
    LinearGradient {
        id: Option<String>,
        transform: Option<[[f32; 3]; 2]>,
        stops: Vec<JSONGradientStop>,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blendMode", default)]
        blend_mode: BlendMode,
    },
    #[serde(rename = "radial_gradient")]
    RadialGradient {
        id: Option<String>,
        transform: Option<[[f32; 3]; 2]>,
        stops: Vec<JSONGradientStop>,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blendMode", default)]
        blend_mode: BlendMode,
    },
    #[serde(rename = "diamond_gradient")]
    DiamondGradient {
        id: Option<String>,
        transform: Option<[[f32; 3]; 2]>,
        stops: Vec<JSONGradientStop>,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blendMode", default)]
        blend_mode: BlendMode,
    },
    #[serde(rename = "sweep_gradient")]
    SweepGradient {
        id: Option<String>,
        transform: Option<[[f32; 3]; 2]>,
        stops: Vec<JSONGradientStop>,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blendMode", default)]
        blend_mode: BlendMode,
    },
    #[serde(rename = "image")]
    Image {
        #[serde(default)]
        src: Option<String>,
        transform: Option<[[f32; 3]; 2]>,
        #[serde(default)]
        fit: CSSObjectFit,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blendMode", default)]
        blend_mode: BlendMode,
        // Image filters
        #[serde(default)]
        filters: ImageFilters,
    },
}

#[derive(Debug, Deserialize)]
pub struct CSSBorder {
    #[serde(rename = "borderWidth")]
    pub border_width: Option<f32>,
    #[serde(rename = "borderColor")]
    pub border_color: Option<JSONRGBA>,
    #[serde(rename = "borderStyle")]
    pub border_style: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct JSONSVGPath {
    pub d: String,
    #[serde(rename = "fillRule")]
    pub fill_rule: FillRule,
    pub fill: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JSONRGBA {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JSONVarWidthStop {
    pub u: f32,
    pub r: f32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JSONVariableWidthProfile {
    pub stops: Vec<JSONVarWidthStop>,
}

#[derive(Debug, Deserialize)]
pub struct JSONFeShadow {
    pub color: JSONRGBA,
    pub dx: f32,
    pub dy: f32,
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub spread: f32,
    #[serde(default)]
    pub inset: bool,
}

impl From<JSONRGBA> for CGColor {
    fn from(color: JSONRGBA) -> Self {
        CGColor(color.r, color.g, color.b, (color.a * 255.0).round() as u8)
    }
}

impl From<JSONFeShadow> for FeShadow {
    fn from(box_shadow: JSONFeShadow) -> Self {
        FeShadow {
            dx: box_shadow.dx,
            dy: box_shadow.dy,
            blur: box_shadow.blur,
            spread: box_shadow.spread,
            color: box_shadow.color.into(),
        }
    }
}

impl From<Option<JSONPaint>> for Paint {
    fn from(fill: Option<JSONPaint>) -> Self {
        match fill {
            Some(JSONPaint::Solid { color, blend_mode }) => Paint::Solid(SolidPaint {
                color: color.map_or(CGColor::TRANSPARENT, |c| c.into()),
                blend_mode,
            }),
            Some(JSONPaint::LinearGradient {
                transform,
                stops,
                opacity,
                blend_mode,
                ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::LinearGradient(LinearGradientPaint {
                    transform: transform
                        .map(|m| AffineTransform { matrix: m })
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity,
                    blend_mode,
                })
            }
            Some(JSONPaint::RadialGradient {
                transform,
                stops,
                opacity,
                blend_mode,
                ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::RadialGradient(RadialGradientPaint {
                    transform: transform
                        .map(|m| AffineTransform { matrix: m })
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity,
                    blend_mode,
                })
            }
            Some(JSONPaint::DiamondGradient {
                transform,
                stops,
                opacity,
                blend_mode,
                ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::DiamondGradient(DiamondGradientPaint {
                    transform: transform
                        .map(|m| AffineTransform { matrix: m })
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity,
                    blend_mode,
                })
            }
            Some(JSONPaint::SweepGradient {
                transform,
                stops,
                opacity,
                blend_mode,
                ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::SweepGradient(SweepGradientPaint {
                    transform: transform
                        .map(|m| AffineTransform { matrix: m })
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity,
                    blend_mode,
                })
            }
            Some(JSONPaint::Image {
                src,
                transform,
                fit,
                opacity,
                blend_mode,
                filters,
            }) => {
                let url = src.unwrap_or_default();
                let image_paint = ImagePaint {
                    image: ResourceRef::RID(url),
                    transform: transform
                        .map(|m| AffineTransform { matrix: m })
                        .unwrap_or_else(AffineTransform::identity),
                    fit: fit.into(),
                    opacity,
                    blend_mode,
                    filters,
                };

                Paint::Image(image_paint)
            }
            None => Paint::Solid(SolidPaint {
                color: CGColor::TRANSPARENT,
                blend_mode: BlendMode::default(),
            }),
        }
    }
}

impl From<JSONVariableWidthProfile> for VarWidthProfile {
    fn from(profile: JSONVariableWidthProfile) -> Self {
        VarWidthProfile {
            base: 1.0, // TODO: need to use node's stroke width as base
            stops: profile.stops.into_iter().map(|s| s.into()).collect(),
        }
    }
}

impl From<JSONVarWidthStop> for WidthStop {
    fn from(stop: JSONVarWidthStop) -> Self {
        WidthStop {
            u: stop.u,
            r: stop.r,
        }
    }
}

impl From<CSSObjectFit> for BoxFit {
    fn from(fit: CSSObjectFit) -> Self {
        match fit {
            CSSObjectFit::Contain => BoxFit::Contain,
            CSSObjectFit::Cover => BoxFit::Cover,
            CSSObjectFit::Fill => BoxFit::Fill,
            CSSObjectFit::None => BoxFit::None,
        }
    }
}

/// Utility function to merge single and multiple paint properties according to the specified logic:
/// - if paint and no paints, use [paint]
/// - if no paint and no paints, use []
/// - if both paint and paints, if paints is empty, use [paint]
/// - if both paint and paints, if paints >= 1, use paints
pub fn merge_paints(paint: Option<JSONPaint>, paints: Option<Vec<JSONPaint>>) -> Paints {
    let paints_vec = match (paint, paints) {
        (Some(p), None) => vec![Paint::from(Some(p))],
        (None, None) => vec![],
        (Some(p), Some(paints_vec)) => {
            if paints_vec.is_empty() {
                vec![Paint::from(Some(p))]
            } else {
                // Optimize: avoid repeated Paint::from() calls by using collect with map
                paints_vec
                    .into_iter()
                    .map(|p| Paint::from(Some(p)))
                    .collect()
            }
        }
        (None, Some(paints_vec)) => {
            // Optimize: avoid repeated Paint::from() calls by using collect with map
            paints_vec
                .into_iter()
                .map(|p| Paint::from(Some(p)))
                .collect()
        }
    };

    Paints::from(paints_vec)
}

#[derive(Debug, Deserialize)]
pub struct JSONScene {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub children: Vec<String>,
    #[serde(rename = "backgroundColor")]
    pub background_color: Option<JSONRGBA>,
    pub guides: Option<Vec<serde_json::Value>>,
    pub constraints: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
pub struct JSONUnknownNodeProperties {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default = "default_locked")]
    pub locked: bool,
    // blend
    #[serde(rename = "opacity", default = "default_opacity")]
    pub opacity: f32,
    #[serde(
        rename = "blendMode",
        default,
        deserialize_with = "de_layer_blend_mode"
    )]
    pub blend_mode: LayerBlendMode,
    #[serde(rename = "zIndex", default = "default_z_index")]
    pub z_index: i32,
    // css
    #[serde(rename = "position")]
    pub position: Option<String>,
    #[serde(rename = "left")]
    pub left: f32,
    #[serde(rename = "top")]
    pub top: f32,
    #[serde(rename = "right")]
    pub right: Option<f32>,
    #[serde(rename = "bottom")]
    pub bottom: Option<f32>,
    #[serde(rename = "rotation", default = "default_rotation")]
    pub rotation: f32,
    #[serde(rename = "border")]
    pub border: Option<CSSBorder>,
    #[serde(rename = "style")]
    pub style: Option<HashMap<String, serde_json::Value>>,
    // geometry - defaults to 0 for non-intrinsic size nodes
    #[serde(
        rename = "width",
        default = "default_width_css",
        deserialize_with = "de_css_dimension"
    )]
    pub width: CSSDimension,
    #[serde(
        rename = "height",
        default = "default_height_css",
        deserialize_with = "de_css_dimension"
    )]
    pub height: CSSDimension,

    #[serde(rename = "cornerRadius", default)]
    pub corner_radius: Option<f32>,
    #[serde(
        rename = "cornerRadiusTopLeft",
        default,
        deserialize_with = "de_radius_option"
    )]
    pub corner_radius_top_left: Option<Radius>,
    #[serde(
        rename = "cornerRadiusTopRight",
        default,
        deserialize_with = "de_radius_option"
    )]
    pub corner_radius_top_right: Option<Radius>,
    #[serde(
        rename = "cornerRadiusBottomRight",
        default,
        deserialize_with = "de_radius_option"
    )]
    pub corner_radius_bottom_right: Option<Radius>,
    #[serde(
        rename = "cornerRadiusBottomLeft",
        default,
        deserialize_with = "de_radius_option"
    )]
    pub corner_radius_bottom_left: Option<Radius>,

    // fill
    #[serde(rename = "fill")]
    pub fill: Option<JSONPaint>,
    #[serde(rename = "fills")]
    pub fills: Option<Vec<JSONPaint>>,
    // stroke
    #[serde(rename = "strokeWidth", default = "default_stroke_width")]
    pub stroke_width: f32,
    #[serde(rename = "strokeWidthProfile")]
    pub stroke_width_profile: Option<JSONVariableWidthProfile>,
    #[serde(rename = "strokeAlign")]
    pub stroke_align: Option<StrokeAlign>,
    #[serde(rename = "strokeCap")]
    pub stroke_cap: Option<String>,
    #[serde(rename = "stroke")]
    pub stroke: Option<JSONPaint>,
    #[serde(rename = "strokes")]
    pub strokes: Option<Vec<JSONPaint>>,
    // effects
    #[serde(rename = "feShadows")]
    pub fe_shadows: Option<Vec<JSONFeShadow>>,
    #[serde(rename = "feBlur")]
    pub fe_blur: Option<FeGaussianBlur>,
    #[serde(rename = "feBackdropBlur")]
    pub fe_backdrop_blur: Option<FeGaussianBlur>,
    // vector
    #[serde(rename = "vectorNetwork")]
    pub vector_network: Option<JSONVectorNetwork>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum JSONNode {
    #[serde(rename = "group")]
    Group(JSONGroupNode),
    #[serde(rename = "container")]
    Container(JSONContainerNode),
    #[serde(rename = "svgpath")]
    SVGPath(JSONSVGPathNode),
    #[serde(rename = "vector")]
    Path(JSONVectorNode),
    #[serde(rename = "ellipse")]
    Ellipse(JSONEllipseNode),
    #[serde(rename = "rectangle")]
    Rectangle(JSONRectangleNode),
    #[serde(rename = "polygon")]
    RegularPolygon(JSONRegularPolygonNode),
    #[serde(rename = "star")]
    RegularStarPolygon(JSONRegularStarPolygonNode),
    #[serde(rename = "line")]
    Line(JSONLineNode),
    #[serde(rename = "text")]
    Text(JSONTextNode),
    #[serde(rename = "boolean")]
    BooleanOperation(JSONBooleanOperationNode),
    #[serde(rename = "image")]
    Image(JSONImageNode),
    Unknown(JSONUnknownNodeProperties),
}

#[derive(Debug, Deserialize)]
pub struct JSONContainerNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "expanded")]
    pub expanded: Option<bool>,
    #[serde(rename = "children")]
    pub children: Option<Vec<String>>,

    // layout
    pub layout: Option<String>,
    pub padding: Option<serde_json::Value>,
    pub direction: Option<String>,
    #[serde(rename = "mainAxisAlignment")]
    pub main_axis_alignment: Option<String>,
    #[serde(rename = "crossAxisAlignment")]
    pub cross_axis_alignment: Option<String>,
    #[serde(rename = "mainAxisGap")]
    pub main_axis_gap: Option<f32>,
    #[serde(rename = "crossAxisGap")]
    pub cross_axis_gap: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct JSONGroupNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "expanded")]
    pub expanded: Option<bool>,
    #[serde(rename = "children")]
    pub children: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct JSONTextNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    pub text: String,
    #[serde(rename = "maxLines", default)]
    pub max_lines: Option<usize>,
    #[serde(rename = "textAlign", default)]
    pub text_align: TextAlign,
    #[serde(rename = "textAlignVertical", default)]
    pub text_align_vertical: TextAlignVertical,

    #[serde(rename = "textDecorationLine", default)]
    pub text_decoration_line: TextDecorationLine,
    #[serde(rename = "textDecorationStyle", default)]
    pub text_decoration_style: Option<TextDecorationStyle>,
    #[serde(rename = "textDecorationColor", default)]
    pub text_decoration_color: Option<JSONRGBA>,
    #[serde(rename = "textDecorationSkipInk", default)]
    pub text_decoration_skip_ink: Option<bool>,
    #[serde(rename = "textDecorationThickness", default)]
    pub text_decoration_thinkness: Option<f32>,

    #[serde(rename = "lineHeight", default)]
    pub line_height: Option<f32>,
    #[serde(rename = "letterSpacing", default)]
    pub letter_spacing: Option<f32>,
    #[serde(rename = "wordSpacing", default)]
    pub word_spacing: Option<f32>,
    #[serde(rename = "fontSize", default)]
    pub font_size: Option<f32>,
    #[serde(rename = "fontFamily", default)]
    pub font_family: Option<String>,
    #[serde(rename = "fontWeight", default)]
    pub font_weight: FontWeight,
    #[serde(rename = "fontWidth", default)]
    pub font_width: Option<f32>,
    #[serde(rename = "fontStyleItalic", default)]
    pub font_style_italic: bool,

    #[serde(rename = "fontKerning", default)]
    pub font_kerning: bool,
    #[serde(rename = "fontFeatures", default)]
    pub font_features: Option<HashMap<String, bool>>,
    #[serde(rename = "fontVariations", default)]
    pub font_variations: Option<HashMap<String, f32>>,

    #[serde(
        rename = "fontOpticalSizing",
        default,
        deserialize_with = "de_optical_sizing"
    )]
    pub font_optical_sizing: FontOpticalSizing,

    #[serde(rename = "textTransform", default)]
    pub text_transform: TextTransform,
}

#[derive(Debug, Deserialize)]
pub struct JSONSVGPathNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    pub paths: Option<Vec<JSONSVGPath>>,
}

pub type JSONVectorNetworkVertex = (f32, f32);

#[derive(Debug, Deserialize, Serialize)]
pub struct JSONVectorNetworkSegment {
    pub a: usize,
    pub b: usize,
    #[serde(default)]
    pub ta: (f32, f32),
    #[serde(default)]
    pub tb: (f32, f32),
}

#[derive(Debug, Deserialize, Serialize)]
pub struct JSONVectorNetwork {
    #[serde(default)]
    pub vertices: Vec<JSONVectorNetworkVertex>,
    #[serde(default)]
    pub segments: Vec<JSONVectorNetworkSegment>,
}

impl From<JSONVectorNetwork> for VectorNetwork {
    fn from(network: JSONVectorNetwork) -> Self {
        VectorNetwork {
            vertices: network.vertices.into_iter().map(|v| (v.0, v.1)).collect(),
            segments: network
                .segments
                .into_iter()
                .map(|s| VectorNetworkSegment {
                    a: s.a,
                    b: s.b,
                    ta: s.ta,
                    tb: s.tb,
                })
                .collect(),
            regions: vec![],
        }
    }
}

impl From<&VectorNetwork> for JSONVectorNetwork {
    fn from(network: &VectorNetwork) -> Self {
        JSONVectorNetwork {
            vertices: network.vertices.iter().map(|v| (v.0, v.1)).collect(),
            segments: network
                .segments
                .iter()
                .map(|s| JSONVectorNetworkSegment {
                    a: s.a,
                    b: s.b,
                    ta: s.ta,
                    tb: s.tb,
                })
                .collect(),
        }
    }
}

impl From<VectorNetwork> for JSONVectorNetwork {
    fn from(network: VectorNetwork) -> Self {
        (&network).into()
    }
}

#[derive(Debug, Deserialize)]
pub struct JSONLineNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,
}

#[derive(Debug, Deserialize)]
pub struct JSONImageNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,
    #[serde(rename = "src")]
    pub src: Option<String>,
    #[serde(rename = "fit", default)]
    pub fit: CSSObjectFit,
}

#[derive(Debug, Deserialize)]
pub struct JSONVectorNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "vectorNetwork")]
    pub vector_network: Option<JSONVectorNetwork>,
}

#[derive(Debug, Deserialize)]
pub struct JSONEllipseNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    /// angle in degrees 0..360
    #[serde(rename = "angle", default)]
    pub angle: Option<f32>,

    /// angle offset in degrees (start angle) 0..360
    #[serde(rename = "angleOffset", default)]
    pub angle_offset: Option<f32>,

    /// inner radius in 0..1
    #[serde(rename = "innerRadius", default)]
    pub inner_radius: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct JSONRectangleNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,
}

#[derive(Debug, Deserialize)]
pub struct JSONRegularPolygonNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "pointCount")]
    pub point_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct JSONRegularStarPolygonNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "pointCount")]
    pub point_count: usize,

    #[serde(rename = "innerRadius")]
    pub inner_radius: f32,
}

#[derive(Debug, Deserialize)]
pub struct JSONBooleanOperationNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "op")]
    pub op: BooleanPathOperation,

    #[serde(rename = "children")]
    pub children: Vec<String>,
}

// Default value functions
fn default_active() -> bool {
    true
}
fn default_locked() -> bool {
    false
}
fn default_opacity() -> f32 {
    1.0
}
fn default_rotation() -> f32 {
    0.0
}
fn default_z_index() -> i32 {
    0
}

fn default_stroke_width() -> f32 {
    0.0
}

pub fn parse(file: &str) -> Result<JSONCanvasFile, serde_json::Error> {
    serde_json::from_str(file)
}

impl From<JSONGroupNode> for GroupNodeRec {
    fn from(node: JSONGroupNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        GroupNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            // TODO: group's transform should be handled differently
            transform: Some(transform),
            children: node.children.unwrap_or_default(),
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            mask_type: LayerMaskType::default(),
        }
    }
}

impl From<JSONContainerNode> for ContainerNodeRec {
    fn from(node: JSONContainerNode) -> Self {
        ContainerNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            transform: AffineTransform::from_box_center(
                node.base.left,
                node.base.top,
                node.base.width.length(0.0),
                node.base.height.length(0.0),
                node.base.rotation,
            ),
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: merge_corner_radius(
                node.base.corner_radius,
                node.base.corner_radius_top_left,
                node.base.corner_radius_top_right,
                node.base.corner_radius_bottom_right,
                node.base.corner_radius_bottom_left,
            ),
            fills: merge_paints(node.base.fill, node.base.fills),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            children: node.children.unwrap_or_default(),
            clip: true,
            mask_type: LayerMaskType::default(),
        }
    }
}

impl From<JSONTextNode> for TextSpanNodeRec {
    fn from(node: JSONTextNode) -> Self {
        // For text nodes, width can be Auto or fixed Length
        let width = match node.base.width {
            CSSDimension::Auto => None,
            CSSDimension::LengthPX(length) => Some(length),
        };

        let height = match node.base.height {
            CSSDimension::Auto => None,
            CSSDimension::LengthPX(length) => Some(length),
        };

        TextSpanNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            transform: AffineTransform::from_box_center(
                node.base.left,
                node.base.top,
                node.base.width.length(0.0),
                node.base.height.length(0.0),
                node.base.rotation,
            ),
            width,
            height,
            max_lines: node.max_lines,
            ellipsis: None,
            text: node.text,
            text_style: TextStyleRec {
                text_decoration: Some(TextDecorationRec {
                    text_decoration_line: node.text_decoration_line,
                    text_decoration_color: node.text_decoration_color.map(CGColor::from),
                    text_decoration_style: node.text_decoration_style,
                    text_decoration_skip_ink: node.text_decoration_skip_ink,
                    text_decoration_thinkness: node.text_decoration_thinkness,
                }),
                font_family: node.font_family.unwrap_or_else(|| "".to_string()),
                font_size: node.font_size.unwrap_or(14.0),
                font_weight: node.font_weight,
                font_width: node.font_width,
                font_style_italic: node.font_style_italic,
                letter_spacing: node
                    .letter_spacing
                    .map(TextLetterSpacing::Factor)
                    .unwrap_or_default(),
                word_spacing: node
                    .word_spacing
                    .map(TextWordSpacing::Factor)
                    .unwrap_or_default(),
                line_height: node
                    .line_height
                    .map(TextLineHeight::Factor)
                    .unwrap_or_default(),
                text_transform: node.text_transform,
                font_kerning: node.font_kerning,
                font_features: node.font_features.map(|ff| {
                    ff.into_iter()
                        .map(|(tag, value)| FontFeature { tag, value })
                        .collect()
                }),
                font_variations: node.font_variations.map(|fv| {
                    fv.into_iter()
                        .map(|(axis, value)| FontVariation { axis, value })
                        .collect()
                }),
                font_optical_sizing: node.font_optical_sizing,
            },
            text_align: node.text_align,
            text_align_vertical: node.text_align_vertical,
            fills: merge_paints(node.base.fill, node.base.fills),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            mask_type: LayerMaskType::default(),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
        }
    }
}

impl From<JSONEllipseNode> for Node {
    fn from(node: JSONEllipseNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::Ellipse(EllipseNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            mask_type: LayerMaskType::default(),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            fills: merge_paints(node.base.fill, node.base.fills),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,

            inner_radius: node.inner_radius,
            start_angle: node.angle_offset.unwrap_or(0.0),
            angle: node.angle,
            corner_radius: node.base.corner_radius,
        })
    }
}

impl From<JSONRectangleNode> for Node {
    fn from(node: JSONRectangleNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::Rectangle(RectangleNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            mask_type: LayerMaskType::default(),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: merge_corner_radius(
                node.base.corner_radius,
                node.base.corner_radius_top_left,
                node.base.corner_radius_top_right,
                node.base.corner_radius_bottom_right,
                node.base.corner_radius_bottom_left,
            ),
            fills: merge_paints(node.base.fill, node.base.fills),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
        })
    }
}

impl From<JSONImageNode> for Node {
    fn from(node: JSONImageNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        let url = node.src.clone().unwrap_or_default();

        let fill = match node.base.fill {
            Some(JSONPaint::Image {
                src: h,
                transform: t,
                fit,
                opacity,
                blend_mode,
                filters,
            }) => {
                let resolved = h.unwrap_or_else(|| url.clone());
                let image_paint = ImagePaint {
                    image: ResourceRef::RID(resolved),
                    transform: t
                        .map(|m| AffineTransform { matrix: m })
                        .unwrap_or_else(AffineTransform::identity),
                    fit: fit.into(),
                    opacity,
                    blend_mode,
                    filters,
                };

                image_paint
            }
            _ => ImagePaint {
                image: ResourceRef::RID(url.clone()),
                transform: AffineTransform::identity(),
                fit: node.fit.into(),
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                filters: ImageFilters::default(),
            },
        };

        Node::Image(ImageNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            mask_type: LayerMaskType::default(),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: merge_corner_radius(
                node.base.corner_radius,
                node.base.corner_radius_top_left,
                node.base.corner_radius_top_right,
                node.base.corner_radius_bottom_right,
                node.base.corner_radius_bottom_left,
            ),
            fill: fill.clone(),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            image: fill.image.clone(),
        })
    }
}

impl From<JSONRegularPolygonNode> for Node {
    fn from(node: JSONRegularPolygonNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::RegularPolygon(RegularPolygonNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            mask_type: LayerMaskType::default(),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: node.base.corner_radius.unwrap_or(0.0),
            fills: merge_paints(node.base.fill, node.base.fills),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            point_count: node.point_count,
        })
    }
}

impl From<JSONRegularStarPolygonNode> for Node {
    fn from(node: JSONRegularStarPolygonNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::RegularStarPolygon(RegularStarPolygonNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            mask_type: LayerMaskType::default(),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: node.base.corner_radius.unwrap_or(0.0),
            inner_radius: node.inner_radius,
            fills: merge_paints(node.base.fill, node.base.fills),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            point_count: node.point_count,
        })
    }
}

impl From<JSONSVGPathNode> for Node {
    fn from(node: JSONSVGPathNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        // For vector nodes, we'll create a path node with the path data
        Node::SVGPath(SVGPathNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            mask_type: LayerMaskType::default(),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            transform,
            fills: merge_paints(node.base.fill, node.base.fills),
            data: node.paths.map_or("".to_string(), |paths| {
                paths
                    .iter()
                    .map(|path| path.d.clone())
                    .collect::<Vec<String>>()
                    .join(" ")
            }),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: 0.0,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
        })
    }
}

impl From<JSONLineNode> for Node {
    fn from(node: JSONLineNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::Line(LineNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            mask_type: LayerMaskType::default(),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: 0.0,
            },
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            _data_stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Center),
            stroke_dash_array: None,
        })
    }
}

impl From<JSONVectorNode> for Node {
    fn from(node: JSONVectorNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        let network = node
            .vector_network
            .or(node.base.vector_network)
            .map(|vn| vn.into())
            .unwrap_or_default();

        Node::Vector(VectorNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            mask_type: LayerMaskType::default(),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            transform,
            network,
            corner_radius: node.base.corner_radius.unwrap_or(0.0),
            fills: merge_paints(node.base.fill, node.base.fills),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_width_profile: node.base.stroke_width_profile.map(|p| p.into()),
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
        })
    }
}

impl From<JSONBooleanOperationNode> for Node {
    fn from(node: JSONBooleanOperationNode) -> Self {
        // TODO: boolean operation's transform should be handled differently
        let transform = AffineTransform::from_box_center(
            node.base.left,
            node.base.top,
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::BooleanOperation(BooleanPathOperationNodeRec {
            id: node.base.id,
            name: node.base.name,
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode,
            mask_type: LayerMaskType::default(),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            transform: Some(transform),
            op: node.op,
            corner_radius: node.base.corner_radius,
            children: node.children,
            fills: merge_paints(node.base.fill, node.base.fills),
            strokes: merge_paints(node.base.stroke, node.base.strokes),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
        })
    }
}

impl From<JSONNode> for Node {
    fn from(node: JSONNode) -> Self {
        match node {
            JSONNode::Group(group) => Node::Group(group.into()),
            JSONNode::Container(container) => Node::Container(container.into()),
            JSONNode::Text(text) => Node::TextSpan(text.into()),
            JSONNode::SVGPath(vector) => vector.into(),
            JSONNode::Path(path) => path.into(),
            JSONNode::Ellipse(ellipse) => ellipse.into(),
            JSONNode::Rectangle(rectangle) => rectangle.into(),
            JSONNode::RegularPolygon(rpolygon) => rpolygon.into(),
            JSONNode::RegularStarPolygon(rsp) => rsp.into(),
            JSONNode::Line(line) => line.into(),
            JSONNode::BooleanOperation(boolean) => boolean.into(),
            JSONNode::Image(image) => image.into(),
            JSONNode::Unknown(unknown) => Node::Error(ErrorNodeRec {
                id: unknown.id,
                name: unknown.name,
                active: unknown.active,
                transform: AffineTransform::identity(),
                size: Size {
                    width: unknown.width.length(0.0),
                    height: unknown.height.length(0.0),
                },
                opacity: unknown.opacity,
                error: "Unknown node".to_string(),
            }),
        }
    }
}

fn de_radius_option<'de, D>(deserializer: D) -> Result<Option<Radius>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Option<Value> = Deserialize::deserialize(deserializer)?;
    match value {
        Some(Value::Number(n)) => Ok(Some(Radius::circular(n.as_f64().unwrap_or(0.0) as f32))),
        _ => Ok(None),
    }
}

#[allow(dead_code)]
fn de_radius<'de, D>(deserializer: D) -> Result<Radius, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Value = Deserialize::deserialize(deserializer)?;
    match value {
        Value::Number(n) => Ok(Radius::circular(n.as_f64().unwrap_or(0.0) as f32)),
        _ => Ok(Radius::zero()),
    }
}

// https://github.com/serde-rs/json/issues/1284
fn de_optical_sizing<'de, D>(deserializer: D) -> Result<FontOpticalSizing, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Value = Deserialize::deserialize(deserializer)?;
    match value {
        Value::String(s) => match s.as_str() {
            "auto" => Ok(FontOpticalSizing::Auto),
            "none" => Ok(FontOpticalSizing::None),
            _ => Ok(FontOpticalSizing::Auto), // Fallback to Auto for invalid strings
        },
        Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                Ok(FontOpticalSizing::Fixed(f as f32))
            } else {
                Ok(FontOpticalSizing::Auto) // Fallback to Auto for invalid numbers
            }
        }
        _ => Ok(FontOpticalSizing::Auto), // Fallback to Auto for other types
    }
}

fn merge_corner_radius(
    corner_radius: Option<f32>,
    corner_radius_top_left: Option<Radius>,
    corner_radius_top_right: Option<Radius>,
    corner_radius_bottom_right: Option<Radius>,
    corner_radius_bottom_left: Option<Radius>,
) -> RectangularCornerRadius {
    let mut r = RectangularCornerRadius::circular(corner_radius.unwrap_or(0.0));
    if let Some(corner_radius_top_left) = corner_radius_top_left {
        r.tl = corner_radius_top_left;
    }
    if let Some(corner_radius_top_right) = corner_radius_top_right {
        r.tr = corner_radius_top_right;
    }
    if let Some(corner_radius_bottom_right) = corner_radius_bottom_right {
        r.br = corner_radius_bottom_right;
    }
    if let Some(corner_radius_bottom_left) = corner_radius_bottom_left {
        r.bl = corner_radius_bottom_left;
    }
    r
}

fn merge_effects(
    fe_shadows: Option<Vec<JSONFeShadow>>,
    fe_blur: Option<FeGaussianBlur>,
    fe_backdrop_blur: Option<FeGaussianBlur>,
) -> LayerEffects {
    let mut effects = LayerEffects::default();
    if let Some(filter_blur) = fe_blur {
        effects.blur = Some(filter_blur);
    }
    if let Some(filter_backdrop_blur) = fe_backdrop_blur {
        effects.backdrop_blur = Some(filter_backdrop_blur);
    }
    if let Some(shadows) = fe_shadows {
        for shadow in shadows {
            if shadow.inset {
                effects
                    .shadows
                    .push(FilterShadowEffect::InnerShadow(shadow.into()));
            } else {
                effects
                    .shadows
                    .push(FilterShadowEffect::DropShadow(shadow.into()));
            }
        }
    }
    effects
}

// Custom deserializer for layer blend mode strings used by JSON input
fn de_layer_blend_mode<'de, D>(deserializer: D) -> Result<LayerBlendMode, D::Error>
where
    D: serde::Deserializer<'de>,
{
    // Accept either missing/null (default) or string values
    let val: Option<String> = Option::deserialize(deserializer)?;
    let Some(s) = val else {
        return Ok(LayerBlendMode::default());
    };

    if s == "pass-through" {
        return Ok(LayerBlendMode::PassThrough);
    }

    // Delegate to BlendMode for other strings like "normal", "multiply", ...
    match serde_json::from_str::<BlendMode>(&format!("\"{}\"", s)) {
        Ok(bm) => Ok(LayerBlendMode::from(bm)),
        // Fallback: any unknown/invalid string becomes PassThrough
        Err(_) => Ok(LayerBlendMode::PassThrough),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_boolean_operation_node() {
        let json = r#"{
            "id": "boolean-1",
            "name": "Boolean Operation",
            "type": "boolean",
            "op": "union",
            "children": ["child-1", "child-2"],
            "left": 100.0,
            "top": 100.0,
            "width": 200.0,
            "height": 200.0,
            "fill": {"type": "solid", "color": {"r": 255, "g": 0, "b": 0, "a": 1.0}}
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("failed to deserialize BooleanOperationNode");

        match node {
            JSONNode::BooleanOperation(boolean_node) => {
                assert_eq!(boolean_node.base.id, "boolean-1");
                assert_eq!(
                    boolean_node.base.name,
                    Some("Boolean Operation".to_string())
                );
                assert_eq!(boolean_node.op, BooleanPathOperation::Union);
                assert_eq!(boolean_node.children, vec!["child-1", "child-2"]);
                assert_eq!(boolean_node.base.left, 100.0);
                assert_eq!(boolean_node.base.top, 100.0);
                assert_eq!(boolean_node.base.width, CSSDimension::LengthPX(200.0));
                assert_eq!(boolean_node.base.height, CSSDimension::LengthPX(200.0));
            }
            _ => panic!("Expected BooleanOperation node"),
        }
    }

    #[test]
    fn deserialize_json_vector_network() {
        // Test with a simple vector network
        let json = r#"{
            "vertices": [
                [0.0, 0.0],
                [100.0, 0.0],
                [100.0, 100.0],
                [0.0, 100.0]
            ],
            "segments": [
                {"a": 0, "b": 1, "ta": [0.0, 0.0], "tb": [0.0, 0.0]},
                {"a": 1, "b": 2, "ta": [0.0, 0.0], "tb": [0.0, 0.0]},
                {"a": 2, "b": 3, "ta": [0.0, 0.0], "tb": [0.0, 0.0]},
                {"a": 3, "b": 0, "ta": [0.0, 0.0], "tb": [0.0, 0.0]}
            ]
        }"#;

        let network: JSONVectorNetwork =
            serde_json::from_str(json).expect("failed to deserialize JSONVectorNetwork");

        assert_eq!(network.vertices.len(), 4);
        assert_eq!(network.segments.len(), 4);

        // Check vertices
        assert_eq!(network.vertices[0], (0.0, 0.0));
        assert_eq!(network.vertices[1], (100.0, 0.0));
        assert_eq!(network.vertices[2], (100.0, 100.0));
        assert_eq!(network.vertices[3], (0.0, 100.0));

        // Check segments
        assert_eq!(network.segments[0].a, 0);
        assert_eq!(network.segments[0].b, 1);
        assert_eq!(network.segments[1].a, 1);
        assert_eq!(network.segments[1].b, 2);
        assert_eq!(network.segments[2].a, 2);
        assert_eq!(network.segments[2].b, 3);
        assert_eq!(network.segments[3].a, 3);
        assert_eq!(network.segments[3].b, 0);
    }

    #[test]
    fn deserialize_json_vector_network_with_tangents() {
        // Test with segments that have tangent handles
        let json = r#"{
            "vertices": [
                [0.0, 0.0],
                [100.0, 100.0]
            ],
            "segments": [
                {"a": 0, "b": 1, "ta": [10.0, -10.0], "tb": [-10.0, 10.0]}
            ]
        }"#;

        let network: JSONVectorNetwork = serde_json::from_str(json)
            .expect("failed to deserialize JSONVectorNetwork with tangents");

        assert_eq!(network.vertices.len(), 2);
        assert_eq!(network.segments.len(), 1);

        // Check tangent handles
        assert_eq!(network.segments[0].ta, (10.0, -10.0));
        assert_eq!(network.segments[0].tb, (-10.0, 10.0));
    }

    #[test]
    fn deserialize_json_vector_network_empty() {
        // Test with empty vectors (should use defaults)
        let json = r#"{}"#;

        let network: JSONVectorNetwork =
            serde_json::from_str(json).expect("failed to deserialize empty JSONVectorNetwork");

        assert_eq!(network.vertices.len(), 0);
        assert_eq!(network.segments.len(), 0);
    }

    #[test]
    fn deserialize_json_vector_network_partial() {
        // Test with only vertices, no segments
        let json = r#"{
            "vertices": [
                [0.0, 0.0],
                [50.0, 50.0]
            ]
        }"#;

        let network: JSONVectorNetwork =
            serde_json::from_str(json).expect("failed to deserialize partial JSONVectorNetwork");

        assert_eq!(network.vertices.len(), 2);
        assert_eq!(network.segments.len(), 0);
        assert_eq!(network.vertices[0], (0.0, 0.0));
        assert_eq!(network.vertices[1], (50.0, 50.0));
    }

    #[test]
    fn test_css_dimension_integration() {
        // Test JSON with auto width for text node
        let json_text_auto = r#"{
            "id": "text-1",
            "name": "Auto Width Text",
            "type": "text",
            "text": "Hello World",
            "left": 100.0,
            "top": 100.0,
            "width": "auto",
            "height": "auto"
        }"#;

        let text_node: JSONNode =
            serde_json::from_str(json_text_auto).expect("failed to deserialize text node");

        match text_node {
            JSONNode::Text(text) => {
                assert_eq!(text.base.width, CSSDimension::Auto);
                assert_eq!(text.base.height, CSSDimension::Auto);
            }
            _ => panic!("Expected Text node"),
        }

        // Test JSON with fixed width for text node
        let json_text_fixed = r#"{
            "id": "text-2",
            "name": "Fixed Width Text",
            "type": "text",
            "text": "Hello World",
            "left": 100.0,
            "top": 100.0,
            "width": 200.0,
            "height": "auto"
        }"#;

        let text_node_fixed: JSONNode = serde_json::from_str(json_text_fixed)
            .expect("failed to deserialize text node with fixed width");

        match text_node_fixed {
            JSONNode::Text(text) => {
                assert_eq!(text.base.width, CSSDimension::LengthPX(200.0));
                assert_eq!(text.base.height, CSSDimension::Auto);
            }
            _ => panic!("Expected Text node"),
        }

        // Test JSON with auto width for rectangle (should default to 0.0)
        let json_rect_auto = r#"{
            "id": "rect-1",
            "name": "Auto Width Rectangle",
            "type": "rectangle",
            "left": 100.0,
            "top": 100.0,
            "width": "auto",
            "height": "auto",
            "fill": {"type": "solid", "color": {"r": 255, "g": 0, "b": 0, "a": 1.0}}
        }"#;

        let rect_node: JSONNode =
            serde_json::from_str(json_rect_auto).expect("failed to deserialize rectangle node");

        match rect_node {
            JSONNode::Rectangle(rect) => {
                // Rectangle should use 0.0 for auto dimensions
                assert_eq!(rect.base.width, CSSDimension::Auto);
                assert_eq!(rect.base.height, CSSDimension::Auto);
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn test_font_optical_sizing_parsing() {
        // Test "auto" case
        let json_auto = r#"{
            "id": "text-1",
            "type": "text",
            "text": "Test",
            "left": 0,
            "top": 0,
            "fontOpticalSizing": "auto"
        }"#;

        let node: JSONNode = serde_json::from_str(json_auto).expect("Failed to parse 'auto'");
        if let JSONNode::Text(text) = node {
            assert!(matches!(text.font_optical_sizing, FontOpticalSizing::Auto));
        } else {
            panic!("Expected Text node");
        }

        // Test "none" case
        let json_none = r#"{
            "id": "text-2",
            "type": "text",
            "text": "Test",
            "left": 0,
            "top": 0,
            "fontOpticalSizing": "none"
        }"#;

        let node: JSONNode = serde_json::from_str(json_none).expect("Failed to parse 'none'");
        if let JSONNode::Text(text) = node {
            assert!(matches!(text.font_optical_sizing, FontOpticalSizing::None));
        } else {
            panic!("Expected Text node");
        }

        // Test numeric case
        let json_fixed = r#"{
            "id": "text-3",
            "type": "text",
            "text": "Test",
            "left": 0,
            "top": 0,
            "fontOpticalSizing": 16.5
        }"#;

        let node: JSONNode = serde_json::from_str(json_fixed).expect("Failed to parse numeric");
        if let JSONNode::Text(text) = node {
            match text.font_optical_sizing {
                FontOpticalSizing::Fixed(value) => assert_eq!(value, 16.5),
                _ => panic!("Expected Fixed variant"),
            }
        } else {
            panic!("Expected Text node");
        }

        // Test invalid string fallback to Auto (via serde default)
        let json_invalid = r#"{
            "id": "text-4",
            "type": "text",
            "text": "Test",
            "left": 0,
            "top": 0,
            "fontOpticalSizing": "invalid_value"
        }"#;

        let node: JSONNode = serde_json::from_str(json_invalid).expect("Failed to parse invalid");
        if let JSONNode::Text(text) = node {
            assert!(matches!(text.font_optical_sizing, FontOpticalSizing::Auto));
        } else {
            panic!("Expected Text node");
        }
    }

    #[test]
    fn test_font_optical_sizing_all_variants() {
        // Test "none" variant
        let json_none = r#"{
            "id": "text-1",
            "name": "text",
            "type": "text",
            "text": "Text",
            "left": 100,
            "top": 100,
            "fontOpticalSizing": "none"
        }"#;

        let node: JSONNode =
            serde_json::from_str(json_none).expect("Failed to parse 'none' variant");
        if let JSONNode::Text(text) = node {
            assert!(matches!(text.font_optical_sizing, FontOpticalSizing::None));
        } else {
            panic!("Expected Text node");
        }

        // Test numeric variant
        let json_fixed = r#"{
            "id": "text-2",
            "name": "text",
            "type": "text",
            "text": "Text",
            "left": 100,
            "top": 100,
            "fontOpticalSizing": 16.5
        }"#;

        let node: JSONNode =
            serde_json::from_str(json_fixed).expect("Failed to parse numeric variant");
        if let JSONNode::Text(text) = node {
            match text.font_optical_sizing {
                FontOpticalSizing::Fixed(value) => assert_eq!(value, 16.5),
                _ => panic!("Expected Fixed variant"),
            }
        } else {
            panic!("Expected Text node");
        }

        // Test default value (when fontOpticalSizing is not specified)
        let json_default = r#"{
            "id": "text-3",
            "name": "text",
            "type": "text",
            "text": "Text",
            "left": 100,
            "top": 100
        }"#;

        let node: JSONNode =
            serde_json::from_str(json_default).expect("Failed to parse default variant");
        if let JSONNode::Text(text) = node {
            assert!(matches!(text.font_optical_sizing, FontOpticalSizing::Auto));
        } else {
            panic!("Expected Text node");
        }
    }

    #[test]
    fn deserialize_json_vector_network_without_tangents() {
        // Test with segments that don't have tangent handles (ta/tb should default to (0.0, 0.0))
        let json = r#"{
            "vertices": [
                [0.0, 0.0],
                [100.0, 0.0],
                [100.0, 100.0],
                [0.0, 100.0]
            ],
            "segments": [
                {"a": 0, "b": 1},
                {"a": 1, "b": 2},
                {"a": 2, "b": 3},
                {"a": 3, "b": 0}
            ]
        }"#;

        let network: JSONVectorNetwork = serde_json::from_str(json)
            .expect("failed to deserialize JSONVectorNetwork without tangents");

        assert_eq!(network.vertices.len(), 4);
        assert_eq!(network.segments.len(), 4);

        // Check vertices
        assert_eq!(network.vertices[0], (0.0, 0.0));
        assert_eq!(network.vertices[1], (100.0, 0.0));
        assert_eq!(network.vertices[2], (100.0, 100.0));
        assert_eq!(network.vertices[3], (0.0, 100.0));

        // Check segments - tangent handles should default to (0.0, 0.0)
        assert_eq!(network.segments[0].a, 0);
        assert_eq!(network.segments[0].b, 1);
        assert_eq!(network.segments[0].ta, (0.0, 0.0));
        assert_eq!(network.segments[0].tb, (0.0, 0.0));

        assert_eq!(network.segments[1].a, 1);
        assert_eq!(network.segments[1].b, 2);
        assert_eq!(network.segments[1].ta, (0.0, 0.0));
        assert_eq!(network.segments[1].tb, (0.0, 0.0));

        assert_eq!(network.segments[2].a, 2);
        assert_eq!(network.segments[2].b, 3);
        assert_eq!(network.segments[2].ta, (0.0, 0.0));
        assert_eq!(network.segments[2].tb, (0.0, 0.0));

        assert_eq!(network.segments[3].a, 3);
        assert_eq!(network.segments[3].b, 0);
        assert_eq!(network.segments[3].ta, (0.0, 0.0));
        assert_eq!(network.segments[3].tb, (0.0, 0.0));
    }

    #[test]
    fn test_merge_paints_logic() {
        use super::merge_paints;
        use super::JSONPaint;

        // Test case 1: paint and no paints, use [paint]
        let paint = Some(JSONPaint::Solid {
            color: Some(JSONRGBA {
                r: 255,
                g: 0,
                b: 0,
                a: 1.0,
            }),
            blend_mode: BlendMode::default(),
        });
        let paints = None;
        let result = merge_paints(paint, paints);
        assert_eq!(result.len(), 1);

        // Test case 2: no paint and no paints, use []
        let paint = None;
        let paints = None;
        let result = merge_paints(paint, paints);
        assert_eq!(result.len(), 0);

        // Test case 3: both paint and paints, if paints is empty, use [paint]
        let paint = Some(JSONPaint::Solid {
            color: Some(JSONRGBA {
                r: 255,
                g: 0,
                b: 0,
                a: 1.0,
            }),
            blend_mode: BlendMode::default(),
        });
        let paints = Some(vec![]);
        let result = merge_paints(paint, paints);
        assert_eq!(result.len(), 1);

        // Test case 4: both paint and paints, if paints >= 1, use paints
        let paint = Some(JSONPaint::Solid {
            color: Some(JSONRGBA {
                r: 255,
                g: 0,
                b: 0,
                a: 1.0,
            }),
            blend_mode: BlendMode::default(),
        });
        let paints = Some(vec![
            JSONPaint::Solid {
                color: Some(JSONRGBA {
                    r: 0,
                    g: 255,
                    b: 0,
                    a: 1.0,
                }),
                blend_mode: BlendMode::default(),
            },
            JSONPaint::Solid {
                color: Some(JSONRGBA {
                    r: 0,
                    g: 0,
                    b: 255,
                    a: 1.0,
                }),
                blend_mode: BlendMode::default(),
            },
        ]);
        let result = merge_paints(paint, paints);
        assert_eq!(result.len(), 2);

        // Test case 5: no paint but has paints, use paints
        let paint = None;
        let paints = Some(vec![JSONPaint::Solid {
            color: Some(JSONRGBA {
                r: 0,
                g: 255,
                b: 0,
                a: 1.0,
            }),
            blend_mode: BlendMode::default(),
        }]);
        let result = merge_paints(paint, paints);
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn deserialize_layer_blend_mode_pass_through() {
        let json = r#"{
            "id": "rect-pt",
            "name": "PassThrough Rect",
            "type": "rectangle",
            "left": 0.0,
            "top": 0.0,
            "width": 100.0,
            "height": 100.0,
            "blendMode": "pass-through"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize rectangle with pass-through blend mode");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(rect.base.blend_mode, LayerBlendMode::PassThrough));
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_layer_blend_mode_normal() {
        let json = r#"{
            "id": "rect-normal",
            "name": "Normal Rect",
            "type": "rectangle",
            "left": 0.0,
            "top": 0.0,
            "width": 100.0,
            "height": 100.0,
            "blendMode": "normal"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize rectangle with normal blend mode");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(
                    rect.base.blend_mode,
                    LayerBlendMode::Blend(BlendMode::Normal)
                ));
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_paint_blend_mode_normal() {
        let json = r#"{
            "type": "solid",
            "blendMode": "normal"
        }"#;

        let paint: JSONPaint =
            serde_json::from_str(json).expect("failed to deserialize paint with normal blend mode");
        match paint {
            JSONPaint::Solid { blend_mode, .. } => {
                assert!(matches!(blend_mode, BlendMode::Normal));
            }
            _ => panic!("Expected Solid paint"),
        }
    }

    #[test]
    fn deserialize_layer_blend_mode_invalid_falls_back_to_pass_through() {
        let json = r#"{
            "id": "rect-invalid",
            "name": "Invalid Blend Rect",
            "type": "rectangle",
            "left": 0.0,
            "top": 0.0,
            "width": 100.0,
            "height": 100.0,
            "blendMode": "definitely-not-a-valid-mode"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("deserializing with invalid blendMode should not error");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(rect.base.blend_mode, LayerBlendMode::PassThrough));
            }
            _ => panic!("Expected Rectangle node"),
        }
    }
}
