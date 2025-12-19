use crate::cg::prelude::*;
use crate::io::io_css::*;
use crate::node::schema::*;
use crate::vectornetwork::*;
use math2::{box_fit::BoxFit, transform::AffineTransform};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub fn parse(file: &str) -> Result<JSONCanvasFile, serde_json::Error> {
    serde_json::from_str(file)
}

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
    /// Scene IDs referencing scene nodes in document.nodes
    pub scenes_ref: Vec<String>,
    /// Hierarchy links map (node_id -> children IDs)
    pub links: HashMap<String, Option<Vec<String>>>,
    pub entry_scene_id: Option<String>,
}

// TODO_REMOVE_IR: Identical to GradientStop, can use GradientStop directly with serde attributes
#[derive(Debug, Deserialize)]
pub struct JSONGradientStop {
    pub offset: f32,
    #[serde(with = "color_formats::object::RGBA32F")]
    pub color: CGColor,
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
        #[serde(with = "color_formats::object::RGBA32F", default)]
        color: CGColor,
        #[serde(rename = "blend_mode", alias = "blendMode", default)]
        blend_mode: BlendMode,
        #[serde(default = "default_active")]
        active: bool,
    },
    #[serde(rename = "linear_gradient")]
    LinearGradient {
        id: Option<String>,
        transform: Option<CGTransform2D>,
        stops: Vec<JSONGradientStop>,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blend_mode", alias = "blendMode", default)]
        blend_mode: BlendMode,
        #[serde(default = "default_active")]
        active: bool,
    },
    #[serde(rename = "radial_gradient")]
    RadialGradient {
        id: Option<String>,
        transform: Option<CGTransform2D>,
        stops: Vec<JSONGradientStop>,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blend_mode", alias = "blendMode", default)]
        blend_mode: BlendMode,
        #[serde(default = "default_active")]
        active: bool,
    },
    #[serde(rename = "diamond_gradient")]
    DiamondGradient {
        id: Option<String>,
        transform: Option<CGTransform2D>,
        stops: Vec<JSONGradientStop>,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blend_mode", alias = "blendMode", default)]
        blend_mode: BlendMode,
        #[serde(default = "default_active")]
        active: bool,
    },
    #[serde(rename = "sweep_gradient")]
    SweepGradient {
        id: Option<String>,
        transform: Option<CGTransform2D>,
        stops: Vec<JSONGradientStop>,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blend_mode", alias = "blendMode", default)]
        blend_mode: BlendMode,
        #[serde(default = "default_active")]
        active: bool,
    },
    #[serde(rename = "image")]
    Image {
        #[serde(default)]
        src: Option<String>,
        #[serde(default)]
        transform: Option<CGTransform2D>,
        #[serde(default)]
        fit: Option<String>,
        #[serde(default)]
        repeat: ImageRepeat,
        #[serde(rename = "quarter_turns", alias = "quarterTurns", default)]
        quarter_turns: u8,
        #[serde(default = "default_image_scale")]
        scale: f32,
        #[serde(default = "default_opacity")]
        opacity: f32,
        #[serde(rename = "blend_mode", alias = "blendMode", default)]
        blend_mode: BlendMode,
        // Image filters
        #[serde(default)]
        filters: ImageFilters,
        #[serde(default = "default_active")]
        active: bool,
    },
}

#[derive(Debug, Deserialize)]
pub struct CSSBorder {
    #[serde(rename = "border_width", alias = "borderWidth")]
    pub border_width: Option<f32>,
    #[serde(
        rename = "border_color",
        alias = "borderColor",
        with = "color_formats::object::RGBA32F",
        default
    )]
    pub border_color: CGColor,
    #[serde(rename = "border_style", alias = "borderStyle")]
    pub border_style: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct JSONSVGPath {
    pub d: String,
    #[serde(rename = "fill_rule", alias = "fillRule", default)]
    pub fill_rule: FillRule,
    pub fill: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JSONVariableWidthProfile {
    pub stops: Vec<WidthStop>,
}

// TODO_REMOVE_IR: Almost identical to FeShadow, but has extra `inset` field. Could use FeShadow directly with custom handling for inset flag
#[derive(Debug, Deserialize)]
pub struct JSONFeShadow {
    #[serde(with = "color_formats::object::RGBA32F")]
    pub color: CGColor,
    pub dx: f32,
    pub dy: f32,
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub spread: f32,
    #[serde(default)]
    pub inset: bool,
    #[serde(default = "default_true")]
    pub active: bool,
}

// TODO_REMOVE_IR: Identical to FeLiquidGlass, can use FeLiquidGlass directly with serde rename attributes
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct JSONFeLiquidGlass {
    #[serde(rename = "light_intensity", alias = "lightIntensity")]
    pub light_intensity: f32,
    #[serde(rename = "light_angle", alias = "lightAngle")]
    pub light_angle: f32,
    #[serde(rename = "refraction")]
    pub refraction: f32,
    #[serde(rename = "depth")]
    pub depth: f32,
    #[serde(rename = "dispersion")]
    pub dispersion: f32,
    #[serde(rename = "radius")]
    pub blur_radius: f32,
    #[serde(default = "default_true")]
    pub active: bool,
}

impl Default for JSONFeLiquidGlass {
    fn default() -> Self {
        let defaults = FeLiquidGlass::default();
        Self {
            light_intensity: defaults.light_intensity,
            light_angle: defaults.light_angle,
            refraction: defaults.refraction,
            depth: defaults.depth,
            dispersion: defaults.dispersion,
            blur_radius: defaults.blur_radius,
            active: defaults.active,
        }
    }
}

/// JSON representation of inner blur types (without wrapper)
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum JSONFeBlurInner {
    #[serde(rename = "blur")]
    Gaussian { radius: f32 },
    #[serde(rename = "progressive-blur")]
    Progressive(JSONFeProgressiveBlur),
}

/// JSON representation of layer blur wrapper (matches TypeScript FeLayerBlur)
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename = "filter-blur")]
pub struct JSONFeLayerBlur {
    pub blur: JSONFeBlurInner,
    #[serde(default = "default_true")]
    pub active: bool,
}

/// JSON representation of backdrop blur wrapper (matches TypeScript FeBackdropBlur)
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename = "backdrop-filter-blur")]
pub struct JSONFeBackdropBlur {
    pub blur: JSONFeBlurInner,
    #[serde(default = "default_true")]
    pub active: bool,
}

fn default_true() -> bool {
    true
}

// TODO_REMOVE_IR: Could use FeProgressiveBlur directly with custom serde deserializer for (x1, y1, x2, y2) format
/// JSON representation of progressive blur with Alignment coordinates (x1, y1, x2, y2)
///
/// Coordinates are in Alignment range where:
/// - -1.0 = edge (left/top)
/// - 0.0 = center
/// - 1.0 = edge (right/bottom)
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct JSONFeProgressiveBlur {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub radius: f32,
    pub radius2: f32,
}

impl From<JSONFeBlurInner> for FeBlur {
    fn from(json_blur: JSONFeBlurInner) -> Self {
        match json_blur {
            JSONFeBlurInner::Gaussian { radius } => FeBlur::Gaussian(FeGaussianBlur { radius }),
            JSONFeBlurInner::Progressive(json_progressive) => {
                FeBlur::Progressive(json_progressive.into())
            }
        }
    }
}

impl From<JSONFeProgressiveBlur> for FeProgressiveBlur {
    fn from(json: JSONFeProgressiveBlur) -> Self {
        // Expect coordinates to already be in Alignment range (-1.0 to 1.0)
        // where -1.0 = edge, 0.0 = center, 1.0 = edge
        FeProgressiveBlur {
            start: Alignment(json.x1, json.y1),
            end: Alignment(json.x2, json.y2),
            radius: json.radius,
            radius2: json.radius2,
        }
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
            active: box_shadow.active,
        }
    }
}

impl From<JSONFeLiquidGlass> for FeLiquidGlass {
    fn from(glass: JSONFeLiquidGlass) -> Self {
        FeLiquidGlass {
            light_intensity: glass.light_intensity,
            light_angle: glass.light_angle,
            refraction: glass.refraction,
            depth: glass.depth,
            dispersion: glass.dispersion,
            blur_radius: glass.blur_radius,
            active: glass.active,
        }
    }
}

// TODO_REMOVE_IR: Identical to NoiseEffectColors, can use NoiseEffectColors directly with serde attributes
/// JSON representation of noise effect coloring strategies
#[derive(Debug, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum JSONFeNoiseColors {
    Mono {
        #[serde(with = "color_formats::object::RGBA32F", default)]
        color: CGColor,
    },
    Duo {
        #[serde(with = "color_formats::object::RGBA32F")]
        color1: CGColor,
        #[serde(with = "color_formats::object::RGBA32F")]
        color2: CGColor,
    },
    Multi {
        opacity: f32,
    },
}

// TODO_REMOVE_IR: Identical to FeNoiseEffect, can use FeNoiseEffect directly with serde rename attributes
/// JSON representation of noise effect
#[derive(Debug, Deserialize)]
pub struct JSONFeNoise {
    #[serde(rename = "noise_size", alias = "noiseSize")]
    pub noise_size: f32,
    #[serde(rename = "density")]
    pub density: f32,
    #[serde(
        rename = "num_octaves",
        alias = "numOctaves",
        default = "default_num_octaves"
    )]
    pub num_octaves: i32,
    #[serde(rename = "seed", default)]
    pub seed: f32,
    #[serde(flatten)]
    pub coloring: JSONFeNoiseColors,
    #[serde(rename = "active", default = "default_true")]
    pub active: bool,
    #[serde(rename = "blend_mode", alias = "blendMode", default)]
    pub blend_mode: BlendMode,
}

fn default_num_octaves() -> i32 {
    3
}

impl From<JSONFeNoiseColors> for NoiseEffectColors {
    fn from(json: JSONFeNoiseColors) -> Self {
        match json {
            JSONFeNoiseColors::Mono { color } => NoiseEffectColors::Mono { color: color },
            JSONFeNoiseColors::Duo { color1, color2 } => NoiseEffectColors::Duo {
                color1: color1,
                color2: color2,
            },
            JSONFeNoiseColors::Multi { opacity } => NoiseEffectColors::Multi { opacity },
        }
    }
}

impl From<JSONFeNoise> for FeNoiseEffect {
    fn from(json: JSONFeNoise) -> Self {
        FeNoiseEffect {
            noise_size: json.noise_size,
            density: json.density,
            num_octaves: json.num_octaves,
            seed: json.seed,
            coloring: json.coloring.into(),
            active: json.active,
            blend_mode: json.blend_mode,
        }
    }
}

impl From<Option<JSONPaint>> for Paint {
    fn from(fill: Option<JSONPaint>) -> Self {
        match fill {
            Some(JSONPaint::Solid {
                color,
                blend_mode,
                active,
            }) => Paint::Solid(SolidPaint {
                color: color,
                blend_mode,
                active,
            }),
            Some(JSONPaint::LinearGradient {
                transform,
                stops,
                opacity,
                blend_mode,
                active,
                ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::LinearGradient(LinearGradientPaint {
                    xy1: Alignment::CENTER_LEFT,
                    xy2: Alignment::CENTER_RIGHT,
                    tile_mode: TileMode::Clamp,
                    transform: transform
                        .map(|t| t.into())
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity,
                    blend_mode,
                    active,
                })
            }
            Some(JSONPaint::RadialGradient {
                transform,
                stops,
                opacity,
                blend_mode,
                active,
                ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::RadialGradient(RadialGradientPaint {
                    transform: transform
                        .map(|t| t.into())
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity,
                    blend_mode,
                    active,
                    tile_mode: TileMode::Clamp,
                })
            }
            Some(JSONPaint::DiamondGradient {
                transform,
                stops,
                opacity,
                blend_mode,
                active,
                ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::DiamondGradient(DiamondGradientPaint {
                    transform: transform
                        .map(|t| t.into())
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity,
                    blend_mode,
                    active,
                })
            }
            Some(JSONPaint::SweepGradient {
                transform,
                stops,
                opacity,
                blend_mode,
                active,
                ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::SweepGradient(SweepGradientPaint {
                    transform: transform
                        .map(|t| t.into())
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity,
                    blend_mode,
                    active,
                })
            }
            Some(JSONPaint::Image {
                src,
                transform,
                fit,
                repeat,
                quarter_turns,
                scale,
                opacity,
                blend_mode,
                filters,
                active,
            }) => {
                let url = src.unwrap_or_default();
                let image_paint = ImagePaint {
                    image: ResourceRef::RID(url),
                    quarter_turns: quarter_turns % 4,
                    alignement: Alignment::CENTER,
                    fit: json_paint_to_image_paint_fit(fit, transform, Some(scale), Some(repeat)),
                    opacity,
                    blend_mode,
                    filters,
                    active,
                };

                Paint::Image(image_paint)
            }
            None => Paint::Solid(SolidPaint {
                color: CGColor::TRANSPARENT,
                blend_mode: BlendMode::default(),
                active: true,
            }),
        }
    }
}

impl From<JSONVariableWidthProfile> for VarWidthProfile {
    fn from(profile: JSONVariableWidthProfile) -> Self {
        VarWidthProfile {
            base: 1.0, // TODO: need to use node's stroke width as base
            stops: profile
                .stops
                .into_iter()
                .map(|s| WidthStop::from(s))
                .collect(),
        }
    }
}

/// Converts JSON positioning fields to LayoutPositioningBasis
/// - If right/bottom are present, uses Inset basis (preserves all four edges)
/// - Otherwise, uses Cartesian basis (x,y)
fn json_position_to_layout_basis(
    left: Option<f32>,
    top: Option<f32>,
    right: Option<f32>,
    bottom: Option<f32>,
) -> LayoutPositioningBasis {
    if right.is_some() || bottom.is_some() {
        // Inset basis: preserve all four edges (missing edges default to 0.0)
        LayoutPositioningBasis::Inset(EdgeInsets {
            top: top.unwrap_or(0.0),
            right: right.unwrap_or(0.0),
            bottom: bottom.unwrap_or(0.0),
            left: left.unwrap_or(0.0),
        })
    } else {
        // Cartesian basis (x,y)
        LayoutPositioningBasis::Cartesian(CGPoint::new(left.unwrap_or(0.0), top.unwrap_or(0.0)))
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

/// SceneNode as it appears in document.nodes
#[derive(Debug, Deserialize)]
pub struct JSONSceneNode {
    #[serde(rename = "id")]
    pub id: String,
    #[serde(rename = "name")]
    pub name: String,
    #[serde(rename = "active")]
    pub active: Option<bool>,
    #[serde(rename = "locked")]
    pub locked: Option<bool>,
    #[serde(
        with = "color_formats::object::RGBA32F",
        rename = "background_color",
        alias = "backgroundColor",
        default
    )]
    pub background_color: CGColor,
    pub guides: Option<Vec<serde_json::Value>>,
    pub constraints: Option<HashMap<String, String>>,
    pub edges: Option<Vec<serde_json::Value>>,
    pub order: Option<i32>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum JSONCornerRadius {
    Uniform(f32),
    PerCorner(Vec<f32>),
    PerCornerObject {
        #[serde(rename = "top_left_radius", alias = "topLeftRadius")]
        top_left_radius: f32,
        #[serde(rename = "top_right_radius", alias = "topRightRadius")]
        top_right_radius: f32,
        #[serde(rename = "bottom_right_radius", alias = "bottomRightRadius")]
        bottom_right_radius: f32,
        #[serde(rename = "bottom_left_radius", alias = "bottomLeftRadius")]
        bottom_left_radius: f32,
    },
}

impl JSONCornerRadius {
    fn into_rectangular(self) -> RectangularCornerRadius {
        match self {
            JSONCornerRadius::Uniform(radius) => RectangularCornerRadius::circular(radius),
            JSONCornerRadius::PerCorner(values) => {
                // Interpret values following CSS border-radius shorthand semantics.
                // https://developer.mozilla.org/en-US/docs/Web/CSS/border-radius
                match values.len() {
                    0 => RectangularCornerRadius::default(),
                    1 => RectangularCornerRadius::circular(values[0]),
                    2 => RectangularCornerRadius {
                        tl: Radius::circular(values[0]),
                        tr: Radius::circular(values[1]),
                        br: Radius::circular(values[0]),
                        bl: Radius::circular(values[1]),
                    },
                    _ => {
                        let mut iter = values.into_iter();
                        let tl = iter.next().unwrap_or_default();
                        let tr = iter.next().unwrap_or(tl);
                        let br = iter.next().unwrap_or(tr);
                        let bl = iter.next().unwrap_or(br);
                        RectangularCornerRadius {
                            tl: Radius::circular(tl),
                            tr: Radius::circular(tr),
                            br: Radius::circular(br),
                            bl: Radius::circular(bl),
                        }
                    }
                }
            }
            JSONCornerRadius::PerCornerObject {
                top_left_radius,
                top_right_radius,
                bottom_right_radius,
                bottom_left_radius,
            } => RectangularCornerRadius {
                tl: Radius::circular(top_left_radius),
                tr: Radius::circular(top_right_radius),
                br: Radius::circular(bottom_right_radius),
                bl: Radius::circular(bottom_left_radius),
            },
        }
    }

    fn into_uniform(self) -> Option<f32> {
        match self {
            JSONCornerRadius::Uniform(radius) => Some(radius),
            JSONCornerRadius::PerCorner(values) => {
                if values.is_empty() {
                    None
                } else if values
                    .iter()
                    .all(|&value| (value - values[0]).abs() < f32::EPSILON)
                {
                    Some(values[0])
                } else {
                    None
                }
            }
            JSONCornerRadius::PerCornerObject {
                top_left_radius,
                top_right_radius,
                bottom_right_radius,
                bottom_left_radius,
            } => {
                // Check if all corners have the same radius
                if (top_left_radius - top_right_radius).abs() < f32::EPSILON
                    && (top_right_radius - bottom_right_radius).abs() < f32::EPSILON
                    && (bottom_right_radius - bottom_left_radius).abs() < f32::EPSILON
                {
                    Some(top_left_radius)
                } else {
                    None
                }
            }
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct JSONUnknownNodeProperties {
    #[serde(rename = "id")]
    pub id: String,
    #[serde(rename = "name", default)]
    pub name: Option<String>,
    #[serde(rename = "active", default = "default_active")]
    pub active: bool,
    #[serde(rename = "locked", default = "default_locked")]
    pub locked: bool,
    // blend
    #[serde(rename = "opacity", default = "default_opacity")]
    pub opacity: f32,
    #[serde(rename = "blend_mode", alias = "blendMode", default)]
    pub blend_mode: JSONLayerBlendMode,
    #[serde(rename = "mask")]
    pub mask: Option<JSONLayerMaskType>,
    #[serde(rename = "z_index", alias = "zIndex", default = "default_z_index")]
    pub z_index: i32,
    // css
    #[serde(rename = "position")]
    pub position: Option<CSSPosition>,
    #[serde(rename = "left")]
    pub left: Option<f32>,
    #[serde(rename = "top")]
    pub top: Option<f32>,
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

    #[serde(rename = "layout_min_width", alias = "minWidth", default)]
    pub layout_min_width: Option<f32>,
    #[serde(rename = "layout_max_width", alias = "maxWidth", default)]
    pub layout_max_width: Option<f32>,
    #[serde(rename = "layout_min_height", alias = "minHeight", default)]
    pub layout_min_height: Option<f32>,
    #[serde(rename = "layout_max_height", alias = "maxHeight", default)]
    pub layout_max_height: Option<f32>,

    /// Layout target aspect ratio constraint (w, h).
    ///
    /// This is stored in Grida documents as a JSON tuple/array like `[16, 9]`.
    /// When present, it is mapped into `LayoutDimensionStyle.layout_target_aspect_ratio`.
    #[serde(rename = "layout_target_aspect_ratio", alias = "aspectRatio")]
    pub layout_target_aspect_ratio: Option<(f32, f32)>,

    #[serde(rename = "corner_radius", alias = "cornerRadius", default)]
    pub corner_radius: Option<JSONCornerRadius>,
    #[serde(
        rename = "rectangular_corner_radius_top_left",
        alias = "cornerRadiusTopLeft",
        default,
        deserialize_with = "de_radius_option"
    )]
    pub rectangular_corner_radius_top_left: Option<Radius>,
    #[serde(
        rename = "rectangular_corner_radius_top_right",
        alias = "cornerRadiusTopRight",
        default,
        deserialize_with = "de_radius_option"
    )]
    pub rectangular_corner_radius_top_right: Option<Radius>,
    #[serde(
        rename = "rectangular_corner_radius_bottom_right",
        alias = "cornerRadiusBottomRight",
        default,
        deserialize_with = "de_radius_option"
    )]
    pub rectangular_corner_radius_bottom_right: Option<Radius>,
    #[serde(
        rename = "rectangular_corner_radius_bottom_left",
        alias = "cornerRadiusBottomLeft",
        default,
        deserialize_with = "de_radius_option"
    )]
    pub rectangular_corner_radius_bottom_left: Option<Radius>,
    #[serde(rename = "corner_smoothing", alias = "cornerSmoothing", default)]
    pub corner_smoothing: Option<f32>,

    // fill
    #[serde(rename = "fill")]
    pub fill: Option<JSONPaint>,
    #[serde(rename = "fill_paints")]
    pub fill_paints: Option<Vec<JSONPaint>>,
    // stroke
    #[serde(
        rename = "stroke_width",
        alias = "strokeWidth",
        default = "default_stroke_width"
    )]
    pub stroke_width: f32,
    #[serde(rename = "stroke_width_profile", alias = "strokeWidthProfile")]
    pub stroke_width_profile: Option<JSONVariableWidthProfile>,
    #[serde(rename = "rectangular_stroke_width_left", alias = "strokeLeftWidth")]
    pub rectangular_stroke_width_left: Option<f32>,
    #[serde(rename = "rectangular_stroke_width_top", alias = "strokeTopWidth")]
    pub rectangular_stroke_width_top: Option<f32>,
    #[serde(rename = "rectangular_stroke_width_right", alias = "strokeRightWidth")]
    pub rectangular_stroke_width_right: Option<f32>,
    #[serde(
        rename = "rectangular_stroke_width_bottom",
        alias = "strokeBottomWidth"
    )]
    pub rectangular_stroke_width_bottom: Option<f32>,
    #[serde(rename = "stroke_align", alias = "strokeAlign")]
    pub stroke_align: Option<StrokeAlign>,
    #[serde(rename = "stroke_cap", alias = "strokeCap")]
    pub stroke_cap: Option<StrokeCap>,
    #[serde(rename = "stroke_join", alias = "strokeJoin")]
    pub stroke_join: Option<StrokeJoin>,
    #[serde(rename = "stroke_miter_limit", alias = "strokeMiterLimit")]
    pub stroke_miter_limit: Option<StrokeMiterLimit>,
    #[serde(
        rename = "stroke_dash_array",
        alias = "strokeDashArray",
        alias = "strokeDasharray"
    )]
    pub stroke_dash_array: Option<Vec<f32>>,
    #[serde(rename = "stroke")]
    pub stroke: Option<JSONPaint>,
    #[serde(rename = "stroke_paints")]
    pub stroke_paints: Option<Vec<JSONPaint>>,
    // effects
    #[serde(rename = "fe_shadows", alias = "feShadows")]
    pub fe_shadows: Option<Vec<JSONFeShadow>>,
    #[serde(rename = "fe_blur", alias = "feBlur")]
    pub fe_blur: Option<JSONFeLayerBlur>,
    #[serde(rename = "fe_backdrop_blur", alias = "feBackdropBlur")]
    pub fe_backdrop_blur: Option<JSONFeBackdropBlur>,
    #[serde(rename = "fe_liquid_glass", alias = "feLiquidGlass")]
    pub fe_liquid_glass: Option<JSONFeLiquidGlass>,
    #[serde(rename = "fe_noises", alias = "feNoises")]
    pub fe_noises: Option<Vec<JSONFeNoise>>,
    // vector
    #[serde(rename = "vector_network", alias = "vectorNetwork")]
    pub vector_network: Option<JSONVectorNetwork>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum JSONNode {
    #[serde(rename = "group")]
    Group(JSONGroupNode),
    #[serde(rename = "container", alias = "component")]
    Container(JSONContainerNode),
    #[serde(rename = "path", alias = "svgpath")]
    Path(JSONPathNode),
    #[serde(rename = "vector")]
    Vector(JSONVectorNode),
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
    #[serde(rename = "scene")]
    Scene(JSONSceneNode),
    Unknown(JSONUnknownNodeProperties),
}

/// JSON representation of LayoutMode for deserialization
#[derive(Debug, Deserialize, Clone, Copy)]
pub enum JSONLayoutMode {
    /// Legacy - will be removed, replaced with Normal
    #[serde(rename = "flow")]
    Flow,
    #[serde(rename = "flex")]
    Flex,
    #[serde(rename = "normal")]
    Normal,
}

impl Default for JSONLayoutMode {
    fn default() -> Self {
        JSONLayoutMode::Normal
    }
}

impl From<JSONLayoutMode> for LayoutMode {
    fn from(mode: JSONLayoutMode) -> Self {
        match mode {
            JSONLayoutMode::Flow => LayoutMode::Normal,
            JSONLayoutMode::Normal => LayoutMode::Normal,
            JSONLayoutMode::Flex => LayoutMode::Flex,
        }
    }
}

/// JSON representation of Axis for deserialization
#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum JSONAxis {
    Horizontal,
    Vertical,
}

impl Default for JSONAxis {
    fn default() -> Self {
        JSONAxis::Horizontal
    }
}

impl From<JSONAxis> for Axis {
    fn from(axis: JSONAxis) -> Self {
        match axis {
            JSONAxis::Horizontal => Axis::Horizontal,
            JSONAxis::Vertical => Axis::Vertical,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct JSONContainerNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "expanded")]
    pub expanded: Option<bool>,

    // layout
    #[serde(rename = "layout", default)]
    pub layout: JSONLayoutMode,
    // Flat padding properties
    #[serde(rename = "padding_top", alias = "paddingTop", default)]
    pub padding_top: f32,
    #[serde(rename = "padding_right", alias = "paddingRight", default)]
    pub padding_right: f32,
    #[serde(rename = "padding_bottom", alias = "paddingBottom", default)]
    pub padding_bottom: f32,
    #[serde(rename = "padding_left", alias = "paddingLeft", default)]
    pub padding_left: f32,
    #[serde(rename = "direction", default)]
    pub direction: JSONAxis,
    #[serde(rename = "layout_wrap", alias = "layoutWrap")]
    pub layout_wrap: Option<LayoutWrap>,
    #[serde(rename = "main_axis_alignment", alias = "mainAxisAlignment")]
    pub main_axis_alignment: Option<MainAxisAlignment>,
    #[serde(rename = "cross_axis_alignment", alias = "crossAxisAlignment")]
    pub cross_axis_alignment: Option<CrossAxisAlignment>,
    #[serde(rename = "main_axis_gap", alias = "mainAxisGap", default)]
    pub main_axis_gap: f32,
    #[serde(rename = "cross_axis_gap", alias = "crossAxisGap", default)]
    pub cross_axis_gap: f32,
}

#[derive(Debug, Deserialize)]
pub struct JSONGroupNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "expanded")]
    pub expanded: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct JSONTextNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "text")]
    pub text: String,
    #[serde(rename = "max_lines", alias = "maxLines", default)]
    pub max_lines: Option<usize>,
    #[serde(rename = "text_align", alias = "textAlign", default)]
    pub text_align: TextAlign,
    #[serde(rename = "text_align_vertical", alias = "textAlignVertical", default)]
    pub text_align_vertical: TextAlignVertical,

    #[serde(rename = "text_decoration_line", alias = "textDecorationLine", default)]
    pub text_decoration_line: TextDecorationLine,
    #[serde(
        rename = "text_decoration_style",
        alias = "textDecorationStyle",
        default
    )]
    pub text_decoration_style: Option<TextDecorationStyle>,
    #[serde(
        rename = "text_decoration_color",
        alias = "textDecorationColor",
        with = "color_formats::object::RGBA32F",
        default
    )]
    pub text_decoration_color: CGColor,
    #[serde(
        rename = "text_decoration_skip_ink",
        alias = "textDecorationSkipInk",
        default
    )]
    pub text_decoration_skip_ink: Option<bool>,
    #[serde(
        rename = "text_decoration_thickness",
        alias = "textDecorationThickness",
        default
    )]
    pub text_decoration_thinkness: Option<f32>,

    #[serde(rename = "line_height", alias = "lineHeight", default)]
    pub line_height: Option<f32>,
    #[serde(rename = "letter_spacing", alias = "letterSpacing", default)]
    pub letter_spacing: Option<f32>,
    #[serde(rename = "word_spacing", alias = "wordSpacing", default)]
    pub word_spacing: Option<f32>,
    #[serde(rename = "font_size", alias = "fontSize", default)]
    pub font_size: Option<f32>,
    #[serde(rename = "font_family", alias = "fontFamily", default)]
    pub font_family: Option<String>,
    #[serde(rename = "font_weight", alias = "fontWeight", default)]
    pub font_weight: FontWeight,
    #[serde(rename = "font_width", alias = "fontWidth", default)]
    pub font_width: Option<f32>,
    #[serde(rename = "font_style_italic", alias = "fontStyleItalic", default)]
    pub font_style_italic: bool,

    #[serde(rename = "font_kerning", alias = "fontKerning", default)]
    pub font_kerning: bool,
    #[serde(rename = "font_features", alias = "fontFeatures", default)]
    pub font_features: Option<HashMap<String, bool>>,
    #[serde(rename = "font_variations", alias = "fontVariations", default)]
    pub font_variations: Option<HashMap<String, f32>>,

    #[serde(
        rename = "font_optical_sizing",
        alias = "fontOpticalSizing",
        default,
        deserialize_with = "de_optical_sizing"
    )]
    pub font_optical_sizing: FontOpticalSizing,

    #[serde(rename = "text_transform", alias = "textTransform", default)]
    pub text_transform: TextTransform,
}

#[derive(Debug, Deserialize)]
pub struct JSONPathNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    pub paths: Option<Vec<JSONSVGPath>>,
}

pub type JSONVectorNetworkVertex = (f32, f32);

// TODO_REMOVE_IR: Identical to VectorNetworkSegment, can use VectorNetworkSegment directly with serde attributes
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
    pub fit: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct JSONVectorNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "vector_network", alias = "vectorNetwork")]
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
    #[serde(rename = "angle_offset", alias = "angleOffset", default)]
    pub angle_offset: Option<f32>,

    /// inner radius in 0..1
    #[serde(rename = "inner_radius", alias = "innerRadius", default)]
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

    #[serde(rename = "point_count", alias = "pointCount")]
    pub point_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct JSONRegularStarPolygonNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "point_count", alias = "pointCount")]
    pub point_count: usize,

    #[serde(rename = "inner_radius", alias = "innerRadius")]
    pub inner_radius: f32,
}

#[derive(Debug, Deserialize)]
pub struct JSONBooleanOperationNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "op")]
    pub op: BooleanPathOperation,
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

fn default_image_scale() -> f32 {
    1.0
}

impl From<JSONGroupNode> for GroupNodeRec {
    fn from(node: JSONGroupNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        GroupNodeRec {
            active: node.base.active,
            // TODO: group's transform should be handled differently
            transform: Some(transform),
            // Children populated from links after conversion
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
        }
    }
}

impl From<JSONContainerNode> for ContainerNodeRec {
    fn from(node: JSONContainerNode) -> Self {
        // Build stroke width early before any moves
        let stroke_width: StrokeWidth = build_unknown_stroke_width(&node.base).into();

        // For containers, preserve Auto vs explicit size distinction
        let width = match node.base.width {
            CSSDimension::Auto => None,
            CSSDimension::LengthPX(length) => Some(length),
        };
        let height = match node.base.height {
            CSSDimension::Auto => None,
            CSSDimension::LengthPX(length) => Some(length),
        };

        ContainerNodeRec {
            active: node.base.active,
            rotation: node.base.rotation,
            position: json_position_to_layout_basis(
                node.base.left,
                node.base.top,
                node.base.right,
                node.base.bottom,
            ),
            corner_radius: merge_corner_radius(
                node.base.corner_radius,
                node.base.rectangular_corner_radius_top_left,
                node.base.rectangular_corner_radius_top_right,
                node.base.rectangular_corner_radius_bottom_right,
                node.base.rectangular_corner_radius_bottom_left,
            ),
            corner_smoothing: CornerSmoothing::new(node.base.corner_smoothing.unwrap_or(0.0)),
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_style: StrokeStyle {
                stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
                stroke_cap: node.base.stroke_cap.unwrap_or_default(),
                stroke_join: node.base.stroke_join.unwrap_or_default(),
                stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
                stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            },
            stroke_width,
            blend_mode: node.base.blend_mode.into(),
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            // Children populated from links after conversion
            clip: true,
            mask: node.base.mask.map(|m| m.into()),
            layout_container: LayoutContainerStyle {
                layout_mode: node.layout.into(),
                layout_direction: node.direction.into(),
                layout_wrap: node.layout_wrap,
                layout_main_axis_alignment: node.main_axis_alignment,
                layout_cross_axis_alignment: node.cross_axis_alignment,
                layout_padding: {
                    let padding = EdgeInsets {
                        top: node.padding_top,
                        right: node.padding_right,
                        bottom: node.padding_bottom,
                        left: node.padding_left,
                    };
                    if padding.is_zero() {
                        None
                    } else {
                        Some(padding)
                    }
                },
                layout_gap: if node.main_axis_gap > 0.0 || node.cross_axis_gap > 0.0 {
                    Some(LayoutGap {
                        main_axis_gap: node.main_axis_gap,
                        cross_axis_gap: node.cross_axis_gap,
                    })
                } else {
                    None
                },
            },
            layout_dimensions: LayoutDimensionStyle {
                layout_target_width: width,
                layout_target_height: height,
                layout_min_width: node.base.layout_min_width,
                layout_max_width: node.base.layout_max_width,
                layout_min_height: node.base.layout_min_height,
                layout_max_height: node.base.layout_max_height,
                layout_target_aspect_ratio: node.base.layout_target_aspect_ratio,
            },
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
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
            active: node.base.active,
            transform: AffineTransform::from_box_center(
                node.base.left.unwrap_or(0.0),
                node.base.top.unwrap_or(0.0),
                node.base.width.length(0.0),
                node.base.height.length(0.0),
                node.base.rotation,
            ),
            width,
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
            height,
            max_lines: node.max_lines,
            ellipsis: None,
            text: node.text,
            text_style: TextStyleRec {
                text_decoration: Some(TextDecorationRec {
                    text_decoration_line: node.text_decoration_line,
                    text_decoration_color: Some(node.text_decoration_color),
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
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            blend_mode: node.base.blend_mode.into(),
            opacity: node.base.opacity,
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
        }
    }
}

impl From<JSONEllipseNode> for Node {
    fn from(node: JSONEllipseNode) -> Self {
        // Build stroke width early before any moves
        let stroke_width: SingularStrokeWidth = build_unknown_stroke_width(&node.base).into();

        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::Ellipse(EllipseNodeRec {
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_style: StrokeStyle {
                stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
                stroke_cap: node.base.stroke_cap.unwrap_or_default(),
                stroke_join: node.base.stroke_join.unwrap_or_default(),
                stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
                stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            },
            stroke_width,
            inner_radius: node.inner_radius,
            start_angle: node.angle_offset.unwrap_or(0.0),
            angle: node.angle,
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
            corner_radius: node
                .base
                .corner_radius
                .and_then(JSONCornerRadius::into_uniform),
        })
    }
}

impl From<JSONRectangleNode> for Node {
    fn from(node: JSONRectangleNode) -> Self {
        // Build stroke width early before any moves
        let stroke_width: StrokeWidth = build_unknown_stroke_width(&node.base).into();

        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::Rectangle(RectangleNodeRec {
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: merge_corner_radius(
                node.base.corner_radius,
                node.base.rectangular_corner_radius_top_left,
                node.base.rectangular_corner_radius_top_right,
                node.base.rectangular_corner_radius_bottom_right,
                node.base.rectangular_corner_radius_bottom_left,
            ),
            corner_smoothing: CornerSmoothing::new(node.base.corner_smoothing.unwrap_or(0.0)),
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_style: StrokeStyle {
                stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
                stroke_cap: node.base.stroke_cap.unwrap_or_default(),
                stroke_join: node.base.stroke_join.unwrap_or_default(),
                stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
                stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            },
            stroke_width,
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
        })
    }
}

impl From<JSONImageNode> for Node {
    fn from(node: JSONImageNode) -> Self {
        // Build stroke width early before any moves
        let stroke_width: StrokeWidth = build_unknown_stroke_width(&node.base).into();

        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
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
                repeat,
                quarter_turns,
                scale,
                opacity,
                blend_mode,
                filters,
                active,
            }) => {
                let resolved = h.unwrap_or_else(|| url.clone());
                let image_paint = ImagePaint {
                    image: ResourceRef::RID(resolved),
                    quarter_turns: quarter_turns % 4,
                    alignement: Alignment::CENTER,
                    fit: json_paint_to_image_paint_fit(fit, t, Some(scale), Some(repeat)),
                    opacity,
                    blend_mode,
                    filters,
                    active,
                };

                image_paint
            }
            _ => ImagePaint {
                image: ResourceRef::RID(url.clone()),
                quarter_turns: 0,
                alignement: Alignment::CENTER,
                fit: json_paint_to_image_paint_fit(node.fit, None, None, None),
                opacity: 1.0,
                blend_mode: BlendMode::default(),
                filters: ImageFilters::default(),
                active: true,
            },
        };

        Node::Image(ImageNodeRec {
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: merge_corner_radius(
                node.base.corner_radius,
                node.base.rectangular_corner_radius_top_left,
                node.base.rectangular_corner_radius_top_right,
                node.base.rectangular_corner_radius_bottom_right,
                node.base.rectangular_corner_radius_bottom_left,
            ),
            corner_smoothing: CornerSmoothing::new(node.base.corner_smoothing.unwrap_or(0.0)),
            fill: fill.clone(),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_style: StrokeStyle {
                stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
                stroke_cap: node.base.stroke_cap.unwrap_or_default(),
                stroke_join: node.base.stroke_join.unwrap_or_default(),
                stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
                stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            },
            stroke_width,
            image: fill.image.clone(),
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
        })
    }
}

impl From<JSONRegularPolygonNode> for Node {
    fn from(node: JSONRegularPolygonNode) -> Self {
        // Build stroke width early before any moves
        let stroke_width: SingularStrokeWidth = build_unknown_stroke_width(&node.base).into();

        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::RegularPolygon(RegularPolygonNodeRec {
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: node
                .base
                .corner_radius
                .and_then(JSONCornerRadius::into_uniform)
                .unwrap_or(0.0),
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_style: StrokeStyle {
                stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
                stroke_cap: node.base.stroke_cap.unwrap_or_default(),
                stroke_join: node.base.stroke_join.unwrap_or_default(),
                stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
                stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            },
            stroke_width,
            point_count: node.point_count,
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
        })
    }
}

impl From<JSONRegularStarPolygonNode> for Node {
    fn from(node: JSONRegularStarPolygonNode) -> Self {
        // Build stroke width early before any moves
        let stroke_width: SingularStrokeWidth = build_unknown_stroke_width(&node.base).into();

        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::RegularStarPolygon(RegularStarPolygonNodeRec {
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: node.base.height.length(0.0),
            },
            corner_radius: node
                .base
                .corner_radius
                .and_then(JSONCornerRadius::into_uniform)
                .unwrap_or(0.0),
            inner_radius: node.inner_radius,
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_style: StrokeStyle {
                stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
                stroke_cap: node.base.stroke_cap.unwrap_or_default(),
                stroke_join: node.base.stroke_join.unwrap_or_default(),
                stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
                stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            },
            stroke_width,
            point_count: node.point_count,
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
        })
    }
}

impl From<JSONPathNode> for Node {
    fn from(node: JSONPathNode) -> Self {
        // Build stroke width early before any moves
        let stroke_width: SingularStrokeWidth = build_unknown_stroke_width(&node.base).into();

        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        // For vector nodes, we'll create a path node with the path data
        Node::Path(PathNodeRec {
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            transform,
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            data: node.paths.map_or("".to_string(), |paths| {
                paths
                    .iter()
                    .map(|path| path.d.clone())
                    .collect::<Vec<String>>()
                    .join(" ")
            }),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_style: StrokeStyle {
                stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
                stroke_cap: node.base.stroke_cap.unwrap_or_default(),
                stroke_join: node.base.stroke_join.unwrap_or_default(),
                stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
                stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            },
            stroke_width,
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
        })
    }
}

impl From<JSONLineNode> for Node {
    fn from(node: JSONLineNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::Line(LineNodeRec {
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            transform,
            size: Size {
                width: node.base.width.length(0.0),
                height: 0.0,
            },
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_width: node.base.stroke_width,
            stroke_cap: node.base.stroke_cap.unwrap_or_default(),
            stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
            _data_stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Center),
            stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
        })
    }
}

impl From<JSONVectorNode> for Node {
    fn from(node: JSONVectorNode) -> Self {
        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
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
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            transform,
            network,
            corner_radius: node
                .base
                .corner_radius
                .and_then(JSONCornerRadius::into_uniform)
                .unwrap_or(0.0),
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_width: node.base.stroke_width,
            stroke_width_profile: node.base.stroke_width_profile.map(|p| p.into()),
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_cap: node.base.stroke_cap.unwrap_or_default(),
            stroke_join: node.base.stroke_join.unwrap_or_default(),
            stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
            stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            layout_child: Some(LayoutChildStyle {
                layout_positioning: node
                    .base
                    .position
                    .map(|position| position.into())
                    .unwrap_or_default(),
                layout_grow: 0.0,
            }),
        })
    }
}

impl From<JSONBooleanOperationNode> for Node {
    fn from(node: JSONBooleanOperationNode) -> Self {
        // Build stroke width early before any moves
        let stroke_width: SingularStrokeWidth = build_unknown_stroke_width(&node.base).into();

        // TODO: boolean operation's transform should be handled differently
        let transform = AffineTransform::from_box_center(
            node.base.left.unwrap_or(0.0),
            node.base.top.unwrap_or(0.0),
            node.base.width.length(0.0),
            node.base.height.length(0.0),
            node.base.rotation,
        );

        Node::BooleanOperation(BooleanPathOperationNodeRec {
            active: node.base.active,
            opacity: node.base.opacity,
            blend_mode: node.base.blend_mode.into(),
            mask: node.base.mask.map(|m| m.into()),
            effects: merge_effects(
                node.base.fe_shadows,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
                node.base.fe_liquid_glass,
                node.base.fe_noises,
            ),
            transform: Some(transform),
            op: node.op,
            corner_radius: node
                .base
                .corner_radius
                .and_then(JSONCornerRadius::into_uniform),
            // Children populated from links after conversion
            fills: merge_paints(node.base.fill, node.base.fill_paints),
            strokes: merge_paints(node.base.stroke, node.base.stroke_paints),
            stroke_style: StrokeStyle {
                stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
                stroke_cap: node.base.stroke_cap.unwrap_or_default(),
                stroke_join: node.base.stroke_join.unwrap_or_default(),
                stroke_miter_limit: node.base.stroke_miter_limit.unwrap_or_default(),
                stroke_dash_array: node.base.stroke_dash_array.map(StrokeDashArray::from),
            },
            stroke_width,
        })
    }
}

impl From<JSONNode> for Node {
    fn from(node: JSONNode) -> Self {
        match node {
            JSONNode::Group(group) => Node::Group(group.into()),
            JSONNode::Container(container) => Node::Container(container.into()),
            JSONNode::Text(text) => Node::TextSpan(text.into()),
            JSONNode::Path(vector) => vector.into(),
            JSONNode::Vector(path) => path.into(),
            JSONNode::Ellipse(ellipse) => ellipse.into(),
            JSONNode::Rectangle(rectangle) => rectangle.into(),
            JSONNode::RegularPolygon(rpolygon) => rpolygon.into(),
            JSONNode::RegularStarPolygon(rsp) => rsp.into(),
            JSONNode::Line(line) => line.into(),
            JSONNode::BooleanOperation(boolean) => boolean.into(),
            JSONNode::Image(image) => image.into(),
            JSONNode::Unknown(unknown) => Node::Error(ErrorNodeRec {
                active: unknown.active,
                transform: AffineTransform::identity(),
                size: Size {
                    width: unknown.width.length(0.0),
                    height: unknown.height.length(0.0),
                },
                opacity: unknown.opacity,
                error: "Unknown node".to_string(),
            }),
            JSONNode::Scene(scene) => {
                // Scene nodes should be filtered out before conversion
                // This case should not be reached in normal operation
                Node::Error(ErrorNodeRec {
                    active: scene.active.unwrap_or(true),
                    transform: AffineTransform::identity(),
                    size: Size {
                        width: 0.0,
                        height: 0.0,
                    },
                    opacity: 1.0,
                    error: "Scene nodes should not be converted to regular nodes".to_string(),
                })
            }
        }
    }
}

/// Helper function to convert JSON paint fields to ImagePaintFit
/// This handles the logic where transform is used when fit is "transform",
/// and scale/repeat are used when fit is "tile"
fn json_paint_to_image_paint_fit(
    fit: Option<String>,
    transform: Option<CGTransform2D>,
    scale: Option<f32>,
    repeat: Option<ImageRepeat>,
) -> ImagePaintFit {
    match fit.as_deref() {
        Some("transform") => {
            // Use the separate transform field
            let json_transform = transform.unwrap_or_default();
            ImagePaintFit::Transform(json_transform.into())
        }
        Some("tile") => {
            // Handle tile mode using the separate scale and repeat fields
            ImagePaintFit::Tile(ImageTile {
                scale: scale.unwrap_or(1.0),
                repeat: repeat.map(|r| r.into()).unwrap_or(ImageRepeat::Repeat),
            })
        }
        Some("contain") => ImagePaintFit::Fit(BoxFit::Contain),
        Some("cover") => ImagePaintFit::Fit(BoxFit::Cover),
        Some("fill") => ImagePaintFit::Fit(BoxFit::Fill),
        Some("none") => ImagePaintFit::Fit(BoxFit::None),
        _ => ImagePaintFit::Fit(BoxFit::Cover), // Default fallback
    }
}

fn de_radius_option<'de, D>(deserializer: D) -> Result<Option<Radius>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Option<Value> = Deserialize::deserialize(deserializer)?;
    match value {
        Some(Value::Number(n)) => Ok(Some(Radius::circular(n.as_f64().unwrap_or(0.0) as f32))),
        Some(Value::Array(values)) => {
            let mut iter = values.into_iter().filter_map(|value| value.as_f64());
            let rx = iter.next().unwrap_or(0.0) as f32;
            let ry = iter.next().unwrap_or(rx as f64) as f32;
            Ok(Some(Radius::elliptical(rx, ry)))
        }
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
    corner_radius: Option<JSONCornerRadius>,
    corner_radius_top_left: Option<Radius>,
    corner_radius_top_right: Option<Radius>,
    corner_radius_bottom_right: Option<Radius>,
    corner_radius_bottom_left: Option<Radius>,
) -> RectangularCornerRadius {
    let mut r = corner_radius
        .map(JSONCornerRadius::into_rectangular)
        .unwrap_or_default();
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

/// Helper function to build UnknownStrokeWidth from JSON node properties
fn build_unknown_stroke_width(base: &JSONUnknownNodeProperties) -> UnknownStrokeWidth {
    UnknownStrokeWidth {
        stroke_width: Some(base.stroke_width),
        stroke_top_width: base.rectangular_stroke_width_top,
        stroke_right_width: base.rectangular_stroke_width_right,
        stroke_bottom_width: base.rectangular_stroke_width_bottom,
        stroke_left_width: base.rectangular_stroke_width_left,
    }
}

#[cfg(test)]
mod corner_radius_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn corner_radius_array_deserializes_into_rectangular_radius() {
        let json_props = json!({
            "id": "node-1",
            "name": "Cornered",
            "active": true,
            "locked": false,
            "opacity": 1.0,
            "blend_mode": "normal",
            "z_index": 0,
            "position": "absolute",
            "left": 0,
            "top": 0,
            "rotation": 0,
            "width": 100,
            "height": 50,
            "corner_radius": [12, 8, 4, 2]
        });

        let props: JSONUnknownNodeProperties = serde_json::from_value(json_props).unwrap();
        let radius = merge_corner_radius(
            props.corner_radius,
            props.rectangular_corner_radius_top_left,
            props.rectangular_corner_radius_top_right,
            props.rectangular_corner_radius_bottom_right,
            props.rectangular_corner_radius_bottom_left,
        );

        assert_eq!(radius.tl.rx, 12.0);
        assert_eq!(radius.tr.rx, 8.0);
        assert_eq!(radius.br.rx, 4.0);
        assert_eq!(radius.bl.rx, 2.0);
    }
}

#[cfg(test)]
mod padding_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_container_with_flat_padding_properties() {
        // Test flat properties format
        let json = json!({
            "type": "container",
            "id": "container-1",
            "name": "Container",
            "active": true,
            "locked": false,
            "opacity": 1.0,
            "blend_mode": "normal",
            "z_index": 0,
            "position": "absolute",
            "left": 0,
            "top": 0,
            "rotation": 0,
            "width": 200,
            "height": 200,
            "padding_top": 10.0,
            "padding_right": 15.0,
            "padding_bottom": 20.0,
            "padding_left": 25.0,
            "layout": "flex"
        });

        let container: JSONContainerNode = serde_json::from_value(json).unwrap();
        let container_rec: ContainerNodeRec = container.into();

        let padding = container_rec.layout_container.layout_padding.unwrap();
        assert_eq!(padding.top, 10.0);
        assert_eq!(padding.right, 15.0);
        assert_eq!(padding.bottom, 20.0);
        assert_eq!(padding.left, 25.0);
    }

    #[test]
    fn test_container_with_partial_padding() {
        // Test that partial padding values default to 0
        let json = json!({
            "type": "container",
            "id": "container-2",
            "name": "Container",
            "active": true,
            "locked": false,
            "opacity": 1.0,
            "blend_mode": "normal",
            "z_index": 0,
            "position": "absolute",
            "left": 0,
            "top": 0,
            "rotation": 0,
            "width": 200,
            "height": 200,
            "padding_top": 10.0,
            "padding_left": 20.0,
            "layout": "flex"
        });

        let container: JSONContainerNode = serde_json::from_value(json).unwrap();
        let container_rec: ContainerNodeRec = container.into();

        let padding = container_rec.layout_container.layout_padding.unwrap();
        assert_eq!(padding.top, 10.0);
        assert_eq!(padding.right, 0.0);
        assert_eq!(padding.bottom, 0.0);
        assert_eq!(padding.left, 20.0);
    }

    #[test]
    fn test_container_without_padding() {
        let json = json!({
            "type": "container",
            "id": "container-3",
            "name": "Container",
            "active": true,
            "locked": false,
            "opacity": 1.0,
            "blend_mode": "normal",
            "z_index": 0,
            "position": "absolute",
            "left": 0,
            "top": 0,
            "rotation": 0,
            "width": 200,
            "height": 200,
            "layout": "flex"
        });

        let container: JSONContainerNode = serde_json::from_value(json).unwrap();
        let container_rec: ContainerNodeRec = container.into();

        assert!(container_rec.layout_container.layout_padding.is_none());
    }
}

fn merge_effects(
    fe_shadows: Option<Vec<JSONFeShadow>>,
    fe_blur: Option<JSONFeLayerBlur>,
    fe_backdrop_blur: Option<JSONFeBackdropBlur>,
    fe_liquid_glass: Option<JSONFeLiquidGlass>,
    fe_noises: Option<Vec<JSONFeNoise>>,
) -> LayerEffects {
    let mut effects = LayerEffects::default();
    if let Some(layer_blur) = fe_blur {
        effects.blur = Some(FeLayerBlur {
            blur: layer_blur.blur.into(),
            active: layer_blur.active,
        });
    }
    if let Some(backdrop_blur) = fe_backdrop_blur {
        effects.backdrop_blur = Some(FeBackdropBlur {
            blur: backdrop_blur.blur.into(),
            active: backdrop_blur.active,
        });
    }
    if let Some(liquid_glass) = fe_liquid_glass {
        effects.glass = Some(liquid_glass.into());
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
    if let Some(noises) = fe_noises {
        effects.noises = noises.into_iter().map(|n| n.into()).collect();
    }
    effects
}

/// Flattened JSON representation of LayerBlendMode for easier deserialization
#[derive(Debug, Deserialize)]
pub enum JSONLayerBlendMode {
    #[serde(rename = "pass-through")]
    PassThrough,
    #[serde(rename = "normal")]
    Normal,
    #[serde(rename = "multiply")]
    Multiply,
    #[serde(rename = "screen")]
    Screen,
    #[serde(rename = "overlay")]
    Overlay,
    #[serde(rename = "darken")]
    Darken,
    #[serde(rename = "lighten")]
    Lighten,
    #[serde(rename = "color-dodge")]
    ColorDodge,
    #[serde(rename = "color-burn")]
    ColorBurn,
    #[serde(rename = "hard-light")]
    HardLight,
    #[serde(rename = "soft-light")]
    SoftLight,
    #[serde(rename = "difference")]
    Difference,
    #[serde(rename = "exclusion")]
    Exclusion,
    #[serde(rename = "hue")]
    Hue,
    #[serde(rename = "saturation")]
    Saturation,
    #[serde(rename = "color")]
    Color,
    #[serde(rename = "luminosity")]
    Luminosity,
}

impl Default for JSONLayerBlendMode {
    fn default() -> Self {
        JSONLayerBlendMode::PassThrough
    }
}

impl Into<LayerBlendMode> for JSONLayerBlendMode {
    fn into(self) -> LayerBlendMode {
        match self {
            JSONLayerBlendMode::PassThrough => LayerBlendMode::PassThrough,
            JSONLayerBlendMode::Normal => LayerBlendMode::Blend(BlendMode::Normal),
            JSONLayerBlendMode::Multiply => LayerBlendMode::Blend(BlendMode::Multiply),
            JSONLayerBlendMode::Screen => LayerBlendMode::Blend(BlendMode::Screen),
            JSONLayerBlendMode::Overlay => LayerBlendMode::Blend(BlendMode::Overlay),
            JSONLayerBlendMode::Darken => LayerBlendMode::Blend(BlendMode::Darken),
            JSONLayerBlendMode::Lighten => LayerBlendMode::Blend(BlendMode::Lighten),
            JSONLayerBlendMode::ColorDodge => LayerBlendMode::Blend(BlendMode::ColorDodge),
            JSONLayerBlendMode::ColorBurn => LayerBlendMode::Blend(BlendMode::ColorBurn),
            JSONLayerBlendMode::HardLight => LayerBlendMode::Blend(BlendMode::HardLight),
            JSONLayerBlendMode::SoftLight => LayerBlendMode::Blend(BlendMode::SoftLight),
            JSONLayerBlendMode::Difference => LayerBlendMode::Blend(BlendMode::Difference),
            JSONLayerBlendMode::Exclusion => LayerBlendMode::Blend(BlendMode::Exclusion),
            JSONLayerBlendMode::Hue => LayerBlendMode::Blend(BlendMode::Hue),
            JSONLayerBlendMode::Saturation => LayerBlendMode::Blend(BlendMode::Saturation),
            JSONLayerBlendMode::Color => LayerBlendMode::Blend(BlendMode::Color),
            JSONLayerBlendMode::Luminosity => LayerBlendMode::Blend(BlendMode::Luminosity),
        }
    }
}

/// Flattened JSON representation of LayerMaskType for easier deserialization
#[derive(Debug, Deserialize)]
pub enum JSONLayerMaskType {
    #[serde(rename = "geometry")]
    Geometry,
    #[serde(rename = "alpha")]
    Alpha,
    #[serde(rename = "luminance")]
    Luminance,
}

impl Into<LayerMaskType> for JSONLayerMaskType {
    fn into(self) -> LayerMaskType {
        match self {
            JSONLayerMaskType::Geometry => LayerMaskType::Geometry,
            JSONLayerMaskType::Alpha => LayerMaskType::Image(ImageMaskType::Alpha),
            JSONLayerMaskType::Luminance => LayerMaskType::Image(ImageMaskType::Luminance),
        }
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
                assert_eq!(boolean_node.base.left, Some(100.0));
                assert_eq!(boolean_node.base.top, Some(100.0));
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
            "font_optical_sizing": "auto"
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
            "font_optical_sizing": "none"
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
            "font_optical_sizing": 16.5
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
            "font_optical_sizing": "invalid_value"
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
            "font_optical_sizing": "none"
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
            "font_optical_sizing": 16.5
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
            color: CGColor::RED,
            blend_mode: BlendMode::default(),
            active: true,
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
            color: CGColor::RED,
            blend_mode: BlendMode::default(),
            active: true,
        });
        let paints = Some(vec![]);
        let result = merge_paints(paint, paints);
        assert_eq!(result.len(), 1);

        // Test case 4: both paint and paints, if paints >= 1, use paints
        let paint = Some(JSONPaint::Solid {
            color: CGColor::RED,
            blend_mode: BlendMode::default(),
            active: true,
        });
        let paints = Some(vec![
            JSONPaint::Solid {
                color: CGColor::GREEN,
                blend_mode: BlendMode::default(),
                active: true,
            },
            JSONPaint::Solid {
                color: CGColor::BLUE,
                blend_mode: BlendMode::default(),
                active: true,
            },
        ]);
        let result = merge_paints(paint, paints);
        assert_eq!(result.len(), 2);

        // Test case 5: no paint but has paints, use paints
        let paint = None;
        let paints = Some(vec![JSONPaint::Solid {
            color: CGColor::GREEN,
            blend_mode: BlendMode::default(),
            active: true,
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
            "blend_mode": "pass-through"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize rectangle with pass-through blend mode");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(
                    rect.base.blend_mode,
                    JSONLayerBlendMode::PassThrough
                ));
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
            "blend_mode": "normal"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize rectangle with normal blend mode");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(rect.base.blend_mode, JSONLayerBlendMode::Normal));
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_paint_blend_mode_normal() {
        let json = r#"{
            "type": "solid",
            "blend_mode": "normal"
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
    fn deserialize_layer_blend_mode_multiply() {
        let json = r#"{
            "id": "rect-multiply",
            "name": "Multiply Blend Rect",
            "type": "rectangle",
            "left": 0.0,
            "top": 0.0,
            "width": 100.0,
            "height": 100.0,
            "blend_mode": "multiply"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("deserializing with multiply blendMode should not error");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(rect.base.blend_mode, JSONLayerBlendMode::Multiply));
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_layer_blend_mode_into_conversion() {
        // Test the Into conversion
        let json_blend = JSONLayerBlendMode::PassThrough;
        let layer_blend: LayerBlendMode = json_blend.into();
        assert!(matches!(layer_blend, LayerBlendMode::PassThrough));

        let json_blend = JSONLayerBlendMode::Normal;
        let layer_blend: LayerBlendMode = json_blend.into();
        assert!(matches!(
            layer_blend,
            LayerBlendMode::Blend(BlendMode::Normal)
        ));

        let json_blend = JSONLayerBlendMode::Multiply;
        let layer_blend: LayerBlendMode = json_blend.into();
        assert!(matches!(
            layer_blend,
            LayerBlendMode::Blend(BlendMode::Multiply)
        ));
    }

    #[test]
    fn deserialize_layer_mask_type_geometry() {
        let json = r#"{
            "id": "rect-geometry-mask",
            "name": "Geometry Mask Rect",
            "type": "rectangle",
            "left": 0.0,
            "top": 0.0,
            "width": 100.0,
            "height": 100.0,
            "mask": "geometry"
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("deserializing with geometry mask should not error");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(rect.base.mask, Some(JSONLayerMaskType::Geometry)));
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_layer_mask_type_alpha() {
        let json = r#"{
            "id": "rect-alpha-mask",
            "name": "Alpha Mask Rect",
            "type": "rectangle",
            "left": 0.0,
            "top": 0.0,
            "width": 100.0,
            "height": 100.0,
            "mask": "alpha"
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("deserializing with alpha mask should not error");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(rect.base.mask, Some(JSONLayerMaskType::Alpha)));
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_layer_mask_type_luminance() {
        let json = r#"{
            "id": "rect-luminance-mask",
            "name": "Luminance Mask Rect",
            "type": "rectangle",
            "left": 0.0,
            "top": 0.0,
            "width": 100.0,
            "height": 100.0,
            "mask": "luminance"
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("deserializing with luminance mask should not error");
        match node {
            JSONNode::Rectangle(rect) => {
                assert!(matches!(rect.base.mask, Some(JSONLayerMaskType::Luminance)));
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_layer_mask_type_into_conversion() {
        // Test the Into conversion
        let json_mask = JSONLayerMaskType::Geometry;
        let layer_mask: LayerMaskType = json_mask.into();
        assert!(matches!(layer_mask, LayerMaskType::Geometry));

        let json_mask = JSONLayerMaskType::Alpha;
        let layer_mask: LayerMaskType = json_mask.into();
        assert!(matches!(
            layer_mask,
            LayerMaskType::Image(ImageMaskType::Alpha)
        ));

        let json_mask = JSONLayerMaskType::Luminance;
        let layer_mask: LayerMaskType = json_mask.into();
        assert!(matches!(
            layer_mask,
            LayerMaskType::Image(ImageMaskType::Luminance)
        ));
    }

    #[test]
    fn json_paint_to_image_paint_fit_helper() {
        // Test the helper function with standard fits (transform should be ignored)
        let fit = Some("cover".to_string());
        let transform = Some(CGTransform2D::from([[1.0, 0.0, 10.0], [0.0, 1.0, 20.0]]));
        let result = json_paint_to_image_paint_fit(fit, transform, None, None);
        assert!(matches!(result, ImagePaintFit::Fit(BoxFit::Cover)));

        // Test with transform fit
        let fit = Some("transform".to_string());
        let transform = Some(CGTransform2D::from([[2.0, 0.0, 5.0], [0.0, 2.0, 10.0]]));
        let result = json_paint_to_image_paint_fit(fit, transform, None, None);
        match result {
            ImagePaintFit::Transform(affine) => {
                assert_eq!(affine.matrix[0], [2.0, 0.0, 5.0]);
                assert_eq!(affine.matrix[1], [0.0, 2.0, 10.0]);
            }
            _ => panic!("Expected Transform variant"),
        }

        // Test with tile fit using separate scale and repeat
        let fit = Some("tile".to_string());
        let scale = Some(2.0);
        let repeat = Some(ImageRepeat::RepeatX);
        let result = json_paint_to_image_paint_fit(fit, None, scale, repeat);
        match result {
            ImagePaintFit::Tile(tile) => {
                assert_eq!(tile.scale, 2.0);
                assert!(matches!(tile.repeat, ImageRepeat::RepeatX));
            }
            _ => panic!("Expected Tile variant"),
        }
    }

    #[test]
    fn deserialize_scene_node() {
        let json = r#"{
            "id": "main",
            "name": "Main Scene",
            "type": "scene",
            "active": true,
            "locked": false,
            "background_color": {"r": 245, "g": 245, "b": 245, "a": 1.0},
            "constraints": {"children": "multiple"},
            "guides": [],
            "edges": []
        }"#;

        let node: JSONNode = serde_json::from_str(json).expect("failed to deserialize scene node");

        match node {
            JSONNode::Scene(scene_node) => {
                assert_eq!(scene_node.id, "main");
                assert_eq!(scene_node.name, "Main Scene");
                assert_eq!(scene_node.active, Some(true));
                assert_eq!(scene_node.locked, Some(false));
            }
            _ => panic!("Expected Scene node"),
        }
    }

    #[test]
    fn parse_grida_file_new_format() {
        let json = r#"{
            "version": "0.89.0-beta+20251219",
            "document": {
                "nodes": {
                    "main": {
                        "id": "main",
                        "name": "Main Scene",
                        "type": "scene",
                        "active": true,
                        "locked": false,
                        "background_color": {"r": 245, "g": 245, "b": 245, "a": 1.0},
                        "constraints": {"children": "multiple"},
                        "guides": [],
                        "edges": []
                    },
                    "rect1": {
                        "id": "rect1",
                        "name": "Rectangle",
                        "type": "rectangle",
                        "left": 100,
                        "top": 100,
                        "width": 200,
                        "height": 150
                    }
                },
                "links": {
                    "main": ["rect1"],
                    "rect1": null
                },
                "scenes_ref": ["main"],
                "entry_scene_id": "main",
                "bitmaps": {},
                "properties": {}
            }
        }"#;

        let file: JSONCanvasFile =
            serde_json::from_str(json).expect("failed to parse new format grida file");

        // Verify structure
        assert_eq!(file.document.scenes_ref, vec!["main".to_string()]);
        assert_eq!(file.document.entry_scene_id, Some("main".to_string()));

        // Verify scene node
        let scene_node = file.document.nodes.get("main").unwrap();
        assert!(matches!(scene_node, JSONNode::Scene(_)));

        // Verify links
        assert_eq!(
            file.document.links.get("main"),
            Some(&Some(vec!["rect1".to_string()]))
        );
    }

    #[test]
    fn parse_grida_file_with_container_children() {
        // Test that container nodes with children in links work correctly
        let json = r#"{
            "version": "0.89.0-beta+20251219",
            "document": {
                "nodes": {
                    "main": {
                        "id": "main",
                        "name": "Main Scene",
                        "type": "scene",
                        "active": true,
                        "locked": false,
                        "background_color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0},
                        "constraints": {"children": "multiple"},
                        "guides": [],
                        "edges": []
                    },
                    "container1": {
                        "id": "container1",
                        "name": "Container",
                        "type": "container",
                        "left": 0,
                        "top": 0,
                        "width": 500,
                        "height": 500
                    },
                    "rect1": {
                        "id": "rect1",
                        "name": "Rectangle",
                        "type": "rectangle",
                        "left": 10,
                        "top": 10,
                        "width": 100,
                        "height": 100
                    }
                },
                "links": {
                    "main": ["container1"],
                    "container1": ["rect1"],
                    "rect1": null
                },
                "scenes_ref": ["main"],
                "bitmaps": {},
                "properties": {}
            }
        }"#;

        let file: JSONCanvasFile =
            serde_json::from_str(json).expect("failed to parse grida file with container children");

        // Verify structure
        assert_eq!(file.document.scenes_ref, vec!["main".to_string()]);

        // Verify container node exists (children come from links)
        assert!(matches!(
            file.document.nodes.get("container1"),
            Some(JSONNode::Container(_))
        ));

        // Verify links
        assert_eq!(
            file.document.links.get("container1"),
            Some(&Some(vec!["rect1".to_string()]))
        );
    }

    #[test]
    fn test_nested_children_population() {
        // Test that deeply nested children get properly populated from links
        let json = r#"{
            "version": "0.89.0-beta+20251219",
            "document": {
                "nodes": {
                    "main": {
                        "id": "main",
                        "name": "Main Scene",
                        "type": "scene",
                        "active": true,
                        "locked": false,
                        "background_color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0},
                        "constraints": {"children": "multiple"},
                        "guides": [],
                        "edges": []
                    },
                    "container1": {
                        "id": "container1",
                        "name": "Container 1",
                        "type": "container",
                        "left": 0,
                        "top": 0,
                        "width": 500,
                        "height": 500
                    },
                    "container2": {
                        "id": "container2",
                        "name": "Container 2",
                        "type": "container",
                        "left": 10,
                        "top": 10,
                        "width": 400,
                        "height": 400
                    },
                    "rect1": {
                        "id": "rect1",
                        "name": "Rectangle",
                        "type": "rectangle",
                        "left": 20,
                        "top": 20,
                        "width": 100,
                        "height": 100
                    }
                },
                "links": {
                    "main": ["container1"],
                    "container1": ["container2"],
                    "container2": ["rect1"],
                    "rect1": null
                },
                "scenes_ref": ["main"],
                "bitmaps": {},
                "properties": {}
            }
        }"#;

        let file: JSONCanvasFile =
            serde_json::from_str(json).expect("failed to parse grida file with nested children");

        // Verify deeply nested links structure
        assert_eq!(
            file.document.links.get("main"),
            Some(&Some(vec!["container1".to_string()]))
        );
        assert_eq!(
            file.document.links.get("container1"),
            Some(&Some(vec!["container2".to_string()]))
        );
        assert_eq!(
            file.document.links.get("container2"),
            Some(&Some(vec!["rect1".to_string()]))
        );
        assert_eq!(file.document.links.get("rect1"), Some(&None));
    }

    #[test]
    fn deserialize_gaussian_blur() {
        let json = r#"{
            "type": "blur",
            "radius": 10.0
        }"#;

        let blur: JSONFeBlurInner =
            serde_json::from_str(json).expect("failed to deserialize gaussian blur");

        match blur {
            JSONFeBlurInner::Gaussian { radius } => {
                assert_eq!(radius, 10.0);
            }
            _ => panic!("Expected Gaussian blur variant"),
        }

        // Test conversion to FeBlur
        let fe_blur: FeBlur = blur.into();
        match fe_blur {
            FeBlur::Gaussian(gaussian) => {
                assert_eq!(gaussian.radius, 10.0);
            }
            _ => panic!("Expected Gaussian blur"),
        }
    }

    #[test]
    fn deserialize_progressive_blur() {
        let json = r#"{
            "type": "progressive-blur",
            "x1": 0.0,
            "y1": -1.0,
            "x2": 0.0,
            "y2": 1.0,
            "radius": 0.0,
            "radius2": 40.0
        }"#;

        let blur: JSONFeBlurInner =
            serde_json::from_str(json).expect("failed to deserialize progressive blur");

        match blur {
            JSONFeBlurInner::Progressive(progressive) => {
                assert_eq!(progressive.x1, 0.0);
                assert_eq!(progressive.y1, -1.0);
                assert_eq!(progressive.x2, 0.0);
                assert_eq!(progressive.y2, 1.0);
                assert_eq!(progressive.radius, 0.0);
                assert_eq!(progressive.radius2, 40.0);
            }
            _ => panic!("Expected Progressive blur variant"),
        }

        // Test conversion to FeBlur
        let fe_blur: FeBlur = blur.into();
        match fe_blur {
            FeBlur::Progressive(progressive) => {
                // Values are used directly as Alignment coordinates
                assert_eq!(progressive.start.x(), 0.0);
                assert_eq!(progressive.start.y(), -1.0);
                assert_eq!(progressive.end.x(), 0.0);
                assert_eq!(progressive.end.y(), 1.0);
                assert_eq!(progressive.radius, 0.0);
                assert_eq!(progressive.radius2, 40.0);
            }
            _ => panic!("Expected Progressive blur"),
        }
    }

    #[test]
    fn deserialize_rectangle_with_gaussian_blur() {
        let json = r#"{
            "id": "rect-1",
            "name": "Blurred Rectangle",
            "type": "rectangle",
            "left": 100.0,
            "top": 100.0,
            "width": 200.0,
            "height": 200.0,
            "fe_blur": {
                "type": "filter-blur",
                "blur": {
                    "type": "blur",
                    "radius": 5.0
                }
            }
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("failed to deserialize rectangle with gaussian blur");

        match node {
            JSONNode::Rectangle(rect) => {
                let converted: Node = rect.into();
                if let Node::Rectangle(rect_rec) = converted {
                    assert!(rect_rec.effects.blur.is_some());
                    match &rect_rec.effects.blur.as_ref().unwrap().blur {
                        FeBlur::Gaussian(gaussian) => {
                            assert_eq!(gaussian.radius, 5.0);
                        }
                        _ => panic!("Expected Gaussian blur"),
                    }
                } else {
                    panic!("Expected Rectangle node");
                }
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_rectangle_with_progressive_blur() {
        let json = r#"{
            "id": "rect-2",
            "name": "Progressive Blur Rectangle",
            "type": "rectangle",
            "left": 100.0,
            "top": 100.0,
            "width": 200.0,
            "height": 400.0,
            "fe_blur": {
                "type": "filter-blur",
                "blur": {
                    "type": "progressive-blur",
                    "x1": 0.0,
                    "y1": -1.0,
                    "x2": 0.0,
                    "y2": 1.0,
                    "radius": 0.0,
                    "radius2": 30.0
                }
            }
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize rectangle with progressive blur");

        match node {
            JSONNode::Rectangle(rect) => {
                let converted: Node = rect.into();
                if let Node::Rectangle(rect_rec) = converted {
                    assert!(rect_rec.effects.blur.is_some());
                    match &rect_rec.effects.blur.as_ref().unwrap().blur {
                        FeBlur::Progressive(progressive) => {
                            // Values are used directly as Alignment coordinates
                            assert_eq!(progressive.start.x(), 0.0); // center
                            assert_eq!(progressive.start.y(), -1.0); // top
                            assert_eq!(progressive.end.x(), 0.0); // center
                            assert_eq!(progressive.end.y(), 1.0); // bottom
                            assert_eq!(progressive.radius, 0.0);
                            assert_eq!(progressive.radius2, 30.0);
                        }
                        _ => panic!("Expected Progressive blur"),
                    }
                } else {
                    panic!("Expected Rectangle node");
                }
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_rectangle_with_backdrop_blur() {
        let json = r#"{
            "id": "rect-3",
            "name": "Backdrop Blur Rectangle",
            "type": "rectangle",
            "left": 100.0,
            "top": 100.0,
            "width": 200.0,
            "height": 200.0,
            "fe_backdrop_blur": {
                "type": "backdrop-filter-blur",
                "blur": {
                    "type": "blur",
                    "radius": 15.0
                }
            }
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("failed to deserialize rectangle with backdrop blur");

        match node {
            JSONNode::Rectangle(rect) => {
                let converted: Node = rect.into();
                if let Node::Rectangle(rect_rec) = converted {
                    assert!(rect_rec.effects.backdrop_blur.is_some());
                    match &rect_rec.effects.backdrop_blur.as_ref().unwrap().blur {
                        FeBlur::Gaussian(gaussian) => {
                            assert_eq!(gaussian.radius, 15.0);
                        }
                        _ => panic!("Expected Gaussian blur"),
                    }
                } else {
                    panic!("Expected Rectangle node");
                }
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_rectangle_with_progressive_backdrop_blur() {
        let json = r#"{
            "id": "rect-4",
            "name": "Progressive Backdrop Blur Rectangle",
            "type": "rectangle",
            "left": 100.0,
            "top": 100.0,
            "width": 200.0,
            "height": 300.0,
            "fe_backdrop_blur": {
                "type": "backdrop-filter-blur",
                "blur": {
                    "type": "progressive-blur",
                    "x1": -1.0,
                    "y1": -1.0,
                    "x2": 1.0,
                    "y2": 1.0,
                    "radius": 0.0,
                    "radius2": 50.0
                }
            }
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize rectangle with progressive backdrop blur");

        match node {
            JSONNode::Rectangle(rect) => {
                let converted: Node = rect.into();
                if let Node::Rectangle(rect_rec) = converted {
                    assert!(rect_rec.effects.backdrop_blur.is_some());
                    match &rect_rec.effects.backdrop_blur.as_ref().unwrap().blur {
                        FeBlur::Progressive(progressive) => {
                            // Verify diagonal gradient - values used directly
                            assert_eq!(progressive.start.x(), -1.0); // left
                            assert_eq!(progressive.start.y(), -1.0); // top
                            assert_eq!(progressive.end.x(), 1.0); // right
                            assert_eq!(progressive.end.y(), 1.0); // bottom
                            assert_eq!(progressive.radius, 0.0);
                            assert_eq!(progressive.radius2, 50.0);
                        }
                        _ => panic!("Expected Progressive blur"),
                    }
                } else {
                    panic!("Expected Rectangle node");
                }
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_text_with_layer_blur() {
        let json = r#"{
            "id": "text-1",
            "name": "Blurred Text",
            "type": "text",
            "text": "Hello World",
            "left": 100.0,
            "top": 100.0,
            "width": 200.0,
            "height": "auto",
            "fe_blur": {
                "type": "filter-blur",
                "blur": {
                    "type": "blur",
                    "radius": 8.0
                }
            }
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("failed to deserialize text with blur");

        match node {
            JSONNode::Text(text) => {
                let converted: TextSpanNodeRec = text.into();
                assert!(converted.effects.blur.is_some());
                match &converted.effects.blur.as_ref().unwrap().blur {
                    FeBlur::Gaussian(gaussian) => {
                        assert_eq!(gaussian.radius, 8.0);
                    }
                    _ => panic!("Expected Gaussian blur"),
                }
            }
            _ => panic!("Expected Text node"),
        }
    }

    #[test]
    fn test_progressive_blur_coordinate_conversion() {
        // Test that Alignment coordinates (-1 to 1) are used directly

        // Top-left to bottom-right diagonal
        let json_progressive = JSONFeProgressiveBlur {
            x1: -1.0,
            y1: -1.0,
            x2: 1.0,
            y2: 1.0,
            radius: 0.0,
            radius2: 20.0,
        };
        let progressive: FeProgressiveBlur = json_progressive.into();
        assert_eq!(progressive.start.x(), -1.0);
        assert_eq!(progressive.start.y(), -1.0);
        assert_eq!(progressive.end.x(), 1.0);
        assert_eq!(progressive.end.y(), 1.0);

        // Center point
        let json_progressive = JSONFeProgressiveBlur {
            x1: 0.0,
            y1: 0.0,
            x2: 0.0,
            y2: 0.0,
            radius: 10.0,
            radius2: 20.0,
        };
        let progressive: FeProgressiveBlur = json_progressive.into();
        assert_eq!(progressive.start.x(), 0.0);
        assert_eq!(progressive.start.y(), 0.0);
        assert_eq!(progressive.end.x(), 0.0);
        assert_eq!(progressive.end.y(), 0.0);

        // Vertical gradient from top to bottom center
        let json_progressive = JSONFeProgressiveBlur {
            x1: 0.0,
            y1: -1.0,
            x2: 0.0,
            y2: 1.0,
            radius: 0.0,
            radius2: 40.0,
        };
        let progressive: FeProgressiveBlur = json_progressive.into();
        assert_eq!(progressive.start.x(), 0.0); // center horizontally
        assert_eq!(progressive.start.y(), -1.0); // top edge
        assert_eq!(progressive.end.x(), 0.0); // center horizontally
        assert_eq!(progressive.end.y(), 1.0); // bottom edge

        // Horizontal gradient from left to right center
        let json_progressive = JSONFeProgressiveBlur {
            x1: -1.0,
            y1: 0.0,
            x2: 1.0,
            y2: 0.0,
            radius: 0.0,
            radius2: 25.0,
        };
        let progressive: FeProgressiveBlur = json_progressive.into();
        assert_eq!(progressive.start.x(), -1.0); // left edge
        assert_eq!(progressive.start.y(), 0.0); // center vertically
        assert_eq!(progressive.end.x(), 1.0); // right edge
        assert_eq!(progressive.end.y(), 0.0); // center vertically
    }

    #[test]
    fn deserialize_container_with_multiple_blur_effects() {
        let json = r#"{
            "id": "container-1",
            "name": "Container with Blurs",
            "type": "container",
            "left": 0.0,
            "top": 0.0,
            "width": 300.0,
            "height": 400.0,
            "fe_blur": {
                "type": "filter-blur",
                "blur": {
                    "type": "progressive-blur",
                    "x1": 0.0,
                    "y1": -1.0,
                    "x2": 0.0,
                    "y2": 1.0,
                    "radius": 0.0,
                    "radius2": 35.0
                }
            },
            "fe_backdrop_blur": {
                "type": "backdrop-filter-blur",
                "blur": {
                    "type": "blur",
                    "radius": 12.0
                }
            }
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize container with both blur types");

        match node {
            JSONNode::Container(container) => {
                let converted: ContainerNodeRec = container.into();

                // Verify layer blur is progressive
                assert!(converted.effects.blur.is_some());
                match &converted.effects.blur.as_ref().unwrap().blur {
                    FeBlur::Progressive(progressive) => {
                        assert_eq!(progressive.start.x(), 0.0);
                        assert_eq!(progressive.start.y(), -1.0);
                        assert_eq!(progressive.end.x(), 0.0);
                        assert_eq!(progressive.end.y(), 1.0);
                        assert_eq!(progressive.radius2, 35.0);
                    }
                    _ => panic!("Expected Progressive blur for layer blur"),
                }

                // Verify backdrop blur is gaussian
                assert!(converted.effects.backdrop_blur.is_some());
                match &converted.effects.backdrop_blur.as_ref().unwrap().blur {
                    FeBlur::Gaussian(gaussian) => {
                        assert_eq!(gaussian.radius, 12.0);
                    }
                    _ => panic!("Expected Gaussian blur for backdrop blur"),
                }
            }
            _ => panic!("Expected Container node"),
        }
    }

    #[test]
    fn deserialize_container_with_layout_properties() {
        // Test that layout and direction are correctly typed and deserialized
        let json = r#"{
            "id": "container-layout",
            "name": "Container with Layout",
            "type": "container",
            "left": 100.0,
            "top": 100.0,
            "width": 400.0,
            "height": 300.0,
            "layout": "flex",
            "direction": "vertical"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize container with layout properties");

        match node {
            JSONNode::Container(container) => {
                // Verify typed enums
                assert!(matches!(container.layout, JSONLayoutMode::Flex));
                assert!(matches!(container.direction, JSONAxis::Vertical));

                // Verify conversion
                let converted: ContainerNodeRec = container.into();
                assert!(matches!(
                    converted.layout_container.layout_mode,
                    LayoutMode::Flex
                ));
                assert!(matches!(
                    converted.layout_container.layout_direction,
                    Axis::Vertical
                ));
            }
            _ => panic!("Expected Container node"),
        }
    }

    #[test]
    fn deserialize_container_with_alignment_properties() {
        // Test that alignment properties are correctly typed and deserialized
        let json = r#"{
            "id": "container-aligned",
            "name": "Container with Alignments",
            "type": "container",
            "left": 0.0,
            "top": 0.0,
            "width": 600.0,
            "height": 400.0,
            "layout": "flex",
            "direction": "horizontal",
            "main_axis_alignment": "space-between",
            "cross_axis_alignment": "center"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize container with alignment properties");

        match node {
            JSONNode::Container(container) => {
                // Verify typed enums
                assert!(matches!(
                    container.main_axis_alignment,
                    Some(MainAxisAlignment::SpaceBetween)
                ));
                assert!(matches!(
                    container.cross_axis_alignment,
                    Some(CrossAxisAlignment::Center)
                ));

                // Verify conversion
                let converted: ContainerNodeRec = container.into();
                assert!(matches!(
                    converted.layout_container.layout_main_axis_alignment,
                    Some(MainAxisAlignment::SpaceBetween)
                ));
                assert!(matches!(
                    converted.layout_container.layout_cross_axis_alignment,
                    Some(CrossAxisAlignment::Center)
                ));
            }
            _ => panic!("Expected Container node"),
        }
    }

    #[test]
    fn deserialize_container_with_padding() {
        // Test that padding is correctly typed and deserialized as uniform value
        let json = r#"{
            "id": "container-padded",
            "name": "Container with Padding",
            "type": "container",
            "left": 0.0,
            "top": 0.0,
            "width": 400.0,
            "height": 300.0,
            "layout": "flex",
            "padding_top": 20.0,
            "padding_right": 20.0,
            "padding_bottom": 20.0,
            "padding_left": 20.0
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("failed to deserialize container with padding");

        match node {
            JSONNode::Container(container) => {
                // Verify padding fields
                assert_eq!(container.padding_top, 20.0);
                assert_eq!(container.padding_right, 20.0);
                assert_eq!(container.padding_bottom, 20.0);
                assert_eq!(container.padding_left, 20.0);

                // Verify conversion to EdgeInsets
                let converted: ContainerNodeRec = container.into();
                assert!(converted.layout_container.layout_padding.is_some());

                let padding = converted.layout_container.layout_padding.unwrap();
                assert_eq!(padding.top, 20.0);
                assert_eq!(padding.right, 20.0);
                assert_eq!(padding.bottom, 20.0);
                assert_eq!(padding.left, 20.0);
            }
            _ => panic!("Expected Container node"),
        }
    }

    #[test]
    fn deserialize_container_with_complete_layout() {
        // Test a container with all layout properties
        let json = r#"{
            "id": "container-complete",
            "name": "Complete Layout Container",
            "type": "container",
            "left": 50.0,
            "top": 50.0,
            "width": 500.0,
            "height": 400.0,
            "layout": "flex",
            "direction": "vertical",
            "padding_top": 15.0,
            "padding_right": 15.0,
            "padding_bottom": 15.0,
            "padding_left": 15.0,
            "main_axis_alignment": "center",
            "cross_axis_alignment": "stretch"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize container with complete layout");

        match node {
            JSONNode::Container(container) => {
                // Verify all properties
                assert!(matches!(container.layout, JSONLayoutMode::Flex));
                assert!(matches!(container.direction, JSONAxis::Vertical));
                assert_eq!(container.padding_top, 15.0);
                assert_eq!(container.padding_right, 15.0);
                assert_eq!(container.padding_bottom, 15.0);
                assert_eq!(container.padding_left, 15.0);
                assert!(matches!(
                    container.main_axis_alignment,
                    Some(MainAxisAlignment::Center)
                ));
                assert!(matches!(
                    container.cross_axis_alignment,
                    Some(CrossAxisAlignment::Stretch)
                ));

                // Verify conversion
                let converted: ContainerNodeRec = container.into();
                assert!(matches!(
                    converted.layout_container.layout_mode,
                    LayoutMode::Flex
                ));
                assert!(matches!(
                    converted.layout_container.layout_direction,
                    Axis::Vertical
                ));
                assert!(converted.layout_container.layout_padding.is_some());

                let padding = converted.layout_container.layout_padding.unwrap();
                assert_eq!(padding.top, 15.0);
                assert_eq!(padding.right, 15.0);
                assert_eq!(padding.bottom, 15.0);
                assert_eq!(padding.left, 15.0);
            }
            _ => panic!("Expected Container node"),
        }
    }

    #[test]
    fn deserialize_container_with_gap() {
        // Test that gap properties are correctly deserialized
        let json = r#"{
            "id": "container-gap",
            "name": "Container with Gap",
            "type": "container",
            "left": 0.0,
            "top": 0.0,
            "width": 400.0,
            "height": 300.0,
            "layout": "flex",
            "main_axis_gap": 20.0,
            "cross_axis_gap": 10.0
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("failed to deserialize container with gap");

        match node {
            JSONNode::Container(container) => {
                // Verify gap fields (non-optional now)
                assert_eq!(container.main_axis_gap, 20.0);
                assert_eq!(container.cross_axis_gap, 10.0);

                // Verify conversion to LayoutGap
                let converted: ContainerNodeRec = container.into();
                assert!(converted.layout_container.layout_gap.is_some());

                let gap = converted.layout_container.layout_gap.unwrap();
                assert_eq!(gap.main_axis_gap, 20.0);
                assert_eq!(gap.cross_axis_gap, 10.0);
            }
            _ => panic!("Expected Container node"),
        }
    }

    #[test]
    fn deserialize_container_with_layout_wrap() {
        // Test that layoutWrap is correctly deserialized
        let json_wrap = r#"{
            "id": "container-wrap",
            "name": "Container with Wrap",
            "type": "container",
            "left": 0.0,
            "top": 0.0,
            "width": 400.0,
            "height": 300.0,
            "layout": "flex",
            "layout_wrap": "wrap"
        }"#;

        let node: JSONNode =
            serde_json::from_str(json_wrap).expect("failed to deserialize container with wrap");

        match node {
            JSONNode::Container(container) => {
                assert!(matches!(container.layout_wrap, Some(LayoutWrap::Wrap)));

                let converted: ContainerNodeRec = container.into();
                assert!(matches!(
                    converted.layout_container.layout_wrap,
                    Some(LayoutWrap::Wrap)
                ));
            }
            _ => panic!("Expected Container node"),
        }

        // Test nowrap
        let json_nowrap = r#"{
            "id": "container-nowrap",
            "name": "Container with NoWrap",
            "type": "container",
            "left": 0.0,
            "top": 0.0,
            "width": 400.0,
            "height": 300.0,
            "layout": "flex",
            "layout_wrap": "nowrap"
        }"#;

        let node: JSONNode =
            serde_json::from_str(json_nowrap).expect("failed to deserialize container with nowrap");

        match node {
            JSONNode::Container(container) => {
                assert!(matches!(container.layout_wrap, Some(LayoutWrap::NoWrap)));

                let converted: ContainerNodeRec = container.into();
                assert!(matches!(
                    converted.layout_container.layout_wrap,
                    Some(LayoutWrap::NoWrap)
                ));
            }
            _ => panic!("Expected Container node"),
        }
    }

    #[test]
    fn deserialize_rectangle_with_corner_smoothing() {
        let json = r#"{
            "id": "rect-smooth",
            "name": "Smooth Rectangle",
            "type": "rectangle",
            "left": 100.0,
            "top": 100.0,
            "width": 200.0,
            "height": 200.0,
            "corner_radius": 50.0,
            "corner_smoothing": 0.6
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize rectangle with corner smoothing");

        match node {
            JSONNode::Rectangle(rect) => {
                assert_eq!(rect.base.corner_smoothing, Some(0.6));

                let converted: Node = rect.into();
                if let Node::Rectangle(rect_rec) = converted {
                    assert_eq!(rect_rec.corner_smoothing.value(), 0.6);
                } else {
                    panic!("Expected Rectangle node");
                }
            }
            _ => panic!("Expected Rectangle node"),
        }
    }

    #[test]
    fn deserialize_container_with_corner_smoothing() {
        let json = r#"{
            "id": "container-smooth",
            "name": "Smooth Container",
            "type": "container",
            "left": 0.0,
            "top": 0.0,
            "width": 300.0,
            "height": 300.0,
            "corner_radius": 40.0,
            "corner_smoothing": 1.0
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize container with corner smoothing");

        match node {
            JSONNode::Container(container) => {
                assert_eq!(container.base.corner_smoothing, Some(1.0));

                let converted: ContainerNodeRec = container.into();
                assert_eq!(converted.corner_smoothing.value(), 1.0);
            }
            _ => panic!("Expected Container node"),
        }
    }

    #[test]
    fn deserialize_image_with_corner_smoothing() {
        let json = r#"{
            "id": "image-smooth",
            "name": "Smooth Image",
            "type": "image",
            "src": "test.png",
            "left": 0.0,
            "top": 0.0,
            "width": 250.0,
            "height": 250.0,
            "corner_radius": 30.0,
            "corner_smoothing": 0.8
        }"#;

        let node: JSONNode =
            serde_json::from_str(json).expect("failed to deserialize image with corner smoothing");

        match node {
            JSONNode::Image(image) => {
                assert_eq!(image.base.corner_smoothing, Some(0.8));

                let converted: Node = image.into();
                if let Node::Image(image_rec) = converted {
                    assert_eq!(image_rec.corner_smoothing.value(), 0.8);
                } else {
                    panic!("Expected Image node");
                }
            }
            _ => panic!("Expected Image node"),
        }
    }

    #[test]
    fn deserialize_container_with_all_layout_properties() {
        // Test a container with all layout properties including gap and wrap
        let json = r#"{
            "id": "container-all",
            "name": "All Layout Properties",
            "type": "container",
            "left": 100.0,
            "top": 100.0,
            "width": 600.0,
            "height": 500.0,
            "layout": "flex",
            "direction": "horizontal",
            "layout_wrap": "wrap",
            "padding_top": 20.0,
            "padding_right": 20.0,
            "padding_bottom": 20.0,
            "padding_left": 20.0,
            "main_axis_gap": 30.0,
            "cross_axis_gap": 15.0,
            "main_axis_alignment": "space-between",
            "cross_axis_alignment": "center"
        }"#;

        let node: JSONNode = serde_json::from_str(json)
            .expect("failed to deserialize container with all layout properties");

        match node {
            JSONNode::Container(container) => {
                // Verify all properties
                assert!(matches!(container.layout, JSONLayoutMode::Flex));
                assert!(matches!(container.direction, JSONAxis::Horizontal));
                assert!(matches!(container.layout_wrap, Some(LayoutWrap::Wrap)));
                assert_eq!(container.padding_top, 20.0);
                assert_eq!(container.padding_right, 20.0);
                assert_eq!(container.padding_bottom, 20.0);
                assert_eq!(container.padding_left, 20.0);
                assert_eq!(container.main_axis_gap, 30.0);
                assert_eq!(container.cross_axis_gap, 15.0);
                assert!(matches!(
                    container.main_axis_alignment,
                    Some(MainAxisAlignment::SpaceBetween)
                ));
                assert!(matches!(
                    container.cross_axis_alignment,
                    Some(CrossAxisAlignment::Center)
                ));

                // Verify conversion
                let converted: ContainerNodeRec = container.into();
                assert!(matches!(
                    converted.layout_container.layout_mode,
                    LayoutMode::Flex
                ));
                assert!(matches!(
                    converted.layout_container.layout_direction,
                    Axis::Horizontal
                ));
                assert!(matches!(
                    converted.layout_container.layout_wrap,
                    Some(LayoutWrap::Wrap)
                ));

                // Verify padding
                let padding = converted.layout_container.layout_padding.unwrap();
                assert_eq!(padding.top, 20.0);
                assert_eq!(padding.right, 20.0);
                assert_eq!(padding.bottom, 20.0);
                assert_eq!(padding.left, 20.0);

                // Verify gap
                let gap = converted.layout_container.layout_gap.unwrap();
                assert_eq!(gap.main_axis_gap, 30.0);
                assert_eq!(gap.cross_axis_gap, 15.0);

                // Verify alignments
                assert!(matches!(
                    converted.layout_container.layout_main_axis_alignment,
                    Some(MainAxisAlignment::SpaceBetween)
                ));
                assert!(matches!(
                    converted.layout_container.layout_cross_axis_alignment,
                    Some(CrossAxisAlignment::Center)
                ));
            }
            _ => panic!("Expected Container node"),
        }
    }
}
