use crate::cg::types::*;
use crate::node::schema::*;
use math2::transform::AffineTransform;
use serde::Deserialize;
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
    Solid { color: Option<JSONRGBA> },
    #[serde(rename = "linear_gradient")]
    LinearGradient {
        id: Option<String>,
        transform: Option<[[f32; 3]; 2]>,
        stops: Vec<JSONGradientStop>,
    },
    #[serde(rename = "radial_gradient")]
    RadialGradient {
        id: Option<String>,
        transform: Option<[[f32; 3]; 2]>,
        stops: Vec<JSONGradientStop>,
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
pub struct SVGPath {
    pub d: String,
    #[serde(rename = "fillRule")]
    pub fill_rule: String,
    pub fill: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JSONRGBA {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f32,
}

#[derive(Debug, Deserialize)]
pub struct JSONFeDropShadow {
    pub color: JSONRGBA,
    pub offset: [f32; 2],
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub spread: f32,
}

impl From<JSONRGBA> for Color {
    fn from(color: JSONRGBA) -> Self {
        Color(color.r, color.g, color.b, (color.a * 255.0) as u8)
    }
}

impl From<JSONFeDropShadow> for FeDropShadow {
    fn from(box_shadow: JSONFeDropShadow) -> Self {
        FeDropShadow {
            dx: box_shadow.offset[0],
            dy: box_shadow.offset[1],
            blur: box_shadow.blur,
            spread: box_shadow.spread,
            color: box_shadow.color.into(),
        }
    }
}

impl From<Option<JSONPaint>> for Paint {
    fn from(fill: Option<JSONPaint>) -> Self {
        match fill {
            Some(JSONPaint::Solid { color }) => Paint::Solid(SolidPaint {
                color: color.map_or(Color(0, 0, 0, 0), |c| c.into()),
                opacity: 1.0,
            }),
            Some(JSONPaint::LinearGradient {
                transform, stops, ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::LinearGradient(LinearGradientPaint {
                    transform: transform
                        .map(|m| AffineTransform { matrix: m })
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity: 1.0,
                })
            }
            Some(JSONPaint::RadialGradient {
                transform, stops, ..
            }) => {
                let stops = stops.into_iter().map(|s| s.into()).collect();
                Paint::RadialGradient(RadialGradientPaint {
                    transform: transform
                        .map(|m| AffineTransform { matrix: m })
                        .unwrap_or_else(AffineTransform::identity),
                    stops,
                    opacity: 1.0,
                })
            }
            None => Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 0),
                opacity: 1.0,
            }),
        }
    }
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
    pub name: String,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default = "default_locked")]
    pub locked: bool,
    // blend
    #[serde(rename = "opacity", default = "default_opacity")]
    pub opacity: f32,
    #[serde(rename = "blendMode", default = "BlendMode::default")]
    pub blend_mode: BlendMode,
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
    // geometry
    #[serde(rename = "width", deserialize_with = "de_css_length")]
    pub width: f32,
    #[serde(rename = "height", deserialize_with = "de_css_length")]
    pub height: f32,
    #[serde(
        rename = "cornerRadius",
        default,
        deserialize_with = "de_corner_radius"
    )]
    pub corner_radius: Option<RectangularCornerRadius>,
    // fill
    #[serde(rename = "fill")]
    pub fill: Option<JSONPaint>,
    // stroke
    #[serde(rename = "strokeWidth", default = "default_stroke_width")]
    pub stroke_width: f32,
    #[serde(rename = "strokeAlign")]
    pub stroke_align: Option<StrokeAlign>,
    #[serde(rename = "strokeCap")]
    pub stroke_cap: Option<String>,
    #[serde(rename = "stroke")]
    pub stroke: Option<JSONPaint>,
    // effects
    #[serde(rename = "feDropShadow")]
    pub fe_drop_shadow: Option<JSONFeDropShadow>,
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
    #[serde(rename = "container")]
    Container(JSONContainerNode),
    #[serde(rename = "vector")]
    Vector(JSONVectorNode),
    #[serde(rename = "path")]
    Path(JSONPathNode),
    #[serde(rename = "ellipse")]
    Ellipse(JSONEllipseNode),
    #[serde(rename = "rectangle")]
    Rectangle(JSONRectangleNode),
    #[serde(rename = "line")]
    Line(JSONLineNode),
    #[serde(rename = "text")]
    Text(JSONTextNode),
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
pub struct JSONTextNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    pub text: String,
    #[serde(rename = "textAlign", default = "default_text_align")]
    pub text_align: TextAlign,
    #[serde(rename = "textAlignVertical", default = "default_text_align_vertical")]
    pub text_align_vertical: TextAlignVertical,
    #[serde(rename = "textDecoration", default = "default_text_decoration")]
    pub text_decoration: TextDecoration,
    #[serde(rename = "lineHeight")]
    pub line_height: Option<f32>,
    #[serde(rename = "letterSpacing")]
    pub letter_spacing: Option<f32>,
    #[serde(rename = "fontSize")]
    pub font_size: Option<f32>,
    #[serde(rename = "fontFamily")]
    pub font_family: Option<String>,
    #[serde(rename = "fontWeight", default = "default_font_weight")]
    pub font_weight: FontWeight,
}

#[derive(Debug, Deserialize)]
pub struct JSONVectorNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    pub paths: Option<Vec<SVGPath>>,
}

#[derive(Debug, Deserialize)]
pub struct JSONVectorNetworkVertex {
    pub p: [f32; 2],
}

#[derive(Debug, Deserialize)]
pub struct JSONVectorNetworkSegment {
    pub a: usize,
    pub b: usize,
    pub ta: [f32; 2],
    pub tb: [f32; 2],
}

#[derive(Debug, Deserialize)]
pub struct JSONVectorNetwork {
    #[serde(default)]
    pub vertices: Vec<JSONVectorNetworkVertex>,
    #[serde(default)]
    pub segments: Vec<JSONVectorNetworkSegment>,
}

impl From<JSONVectorNetwork> for VectorNetwork {
    fn from(network: JSONVectorNetwork) -> Self {
        VectorNetwork {
            vertices: network.vertices.into_iter().map(|v| v.p).collect(),
            segments: network
                .segments
                .into_iter()
                .map(|s| VectorNetworkSegment {
                    a: s.a,
                    b: s.b,
                    ta: Some(s.ta),
                    tb: Some(s.tb),
                })
                .collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct JSONLineNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,
}

#[derive(Debug, Deserialize)]
pub struct JSONPathNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,

    #[serde(rename = "vectorNetwork")]
    pub vector_network: Option<JSONVectorNetwork>,
}

#[derive(Debug, Deserialize)]
pub struct JSONEllipseNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,
}

#[derive(Debug, Deserialize)]
pub struct JSONRectangleNode {
    #[serde(flatten)]
    pub base: JSONUnknownNodeProperties,
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
fn default_text_align() -> TextAlign {
    TextAlign::Left
}
fn default_text_align_vertical() -> TextAlignVertical {
    TextAlignVertical::Top
}
fn default_text_decoration() -> TextDecoration {
    TextDecoration::None
}
fn default_font_weight() -> FontWeight {
    FontWeight::new(400)
}
fn default_stroke_width() -> f32 {
    0.0
}

pub fn parse(file: &str) -> Result<JSONCanvasFile, serde_json::Error> {
    serde_json::from_str(file)
}

impl From<JSONContainerNode> for ContainerNode {
    fn from(node: JSONContainerNode) -> Self {
        ContainerNode {
            base: BaseNode {
                id: node.base.id,
                name: node.base.name,
                active: node.base.active,
            },
            transform: AffineTransform::new(node.base.left, node.base.top, node.base.rotation),
            size: Size {
                width: node.base.width,
                height: node.base.height,
            },
            corner_radius: node
                .base
                .corner_radius
                .unwrap_or(RectangularCornerRadius::zero()),
            fills: vec![node.base.fill.into()],
            strokes: vec![node.base.stroke.into()],
            stroke_width: 0.0,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_drop_shadow,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
            children: node.children.unwrap_or_default(),
            clip: true,
        }
    }
}

impl From<JSONTextNode> for TextSpanNode {
    fn from(node: JSONTextNode) -> Self {
        let width = node.base.width;
        let height = node.base.height;
        TextSpanNode {
            base: BaseNode {
                id: node.base.id,
                name: node.base.name,
                active: node.base.active,
            },
            transform: AffineTransform::new(node.base.left, node.base.top, node.base.rotation),
            size: Size { width, height },
            text: node.text,
            text_style: TextStyle {
                text_decoration: node.text_decoration,
                font_family: node.font_family.unwrap_or_else(|| "Inter".to_string()),
                font_size: node.font_size.unwrap_or(14.0),
                font_weight: node.font_weight,
                italic: false,
                letter_spacing: node.letter_spacing,
                line_height: node.line_height,
                text_transform: TextTransform::None,
            },
            text_align: node.text_align,
            text_align_vertical: node.text_align_vertical,
            fill: node.base.fill.into(),
            stroke: None,
            stroke_width: None,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_drop_shadow,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
        }
    }
}

impl From<JSONEllipseNode> for Node {
    fn from(node: JSONEllipseNode) -> Self {
        let transform = AffineTransform::new(node.base.left, node.base.top, node.base.rotation);

        Node::Ellipse(EllipseNode {
            base: BaseNode {
                id: node.base.id,
                name: node.base.name,
                active: node.base.active,
            },
            transform,
            size: Size {
                width: node.base.width,
                height: node.base.height,
            },
            fills: vec![node.base.fill.into()],
            strokes: vec![node.base.stroke.into()],
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_drop_shadow,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
        })
    }
}

impl From<JSONRectangleNode> for Node {
    fn from(node: JSONRectangleNode) -> Self {
        let transform = AffineTransform::new(node.base.left, node.base.top, node.base.rotation);

        Node::Rectangle(RectangleNode {
            base: BaseNode {
                id: node.base.id,
                name: node.base.name,
                active: node.base.active,
            },
            transform,
            size: Size {
                width: node.base.width,
                height: node.base.height,
            },
            corner_radius: node
                .base
                .corner_radius
                .unwrap_or(RectangularCornerRadius::zero()),
            fills: vec![node.base.fill.into()],
            strokes: vec![node.base.stroke.into()],
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_drop_shadow,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
        })
    }
}

impl From<JSONVectorNode> for Node {
    fn from(node: JSONVectorNode) -> Self {
        let transform = AffineTransform::new(node.base.left, node.base.top, node.base.rotation);

        // For vector nodes, we'll create a path node with the path data
        Node::SVGPath(SVGPathNode {
            base: BaseNode {
                id: node.base.id,
                name: node.base.name,
                active: node.base.active,
            },
            transform,
            fill: node.base.fill.into(),
            data: node.paths.map_or("".to_string(), |paths| {
                paths
                    .iter()
                    .map(|path| path.d.clone())
                    .collect::<Vec<String>>()
                    .join(" ")
            }),
            stroke: None,
            stroke_width: 0.0,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_drop_shadow,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
        })
    }
}

impl From<JSONLineNode> for Node {
    fn from(node: JSONLineNode) -> Self {
        let transform = AffineTransform::new(node.base.left, node.base.top, node.base.rotation);

        Node::Line(LineNode {
            base: BaseNode {
                id: node.base.id,
                name: node.base.name,
                active: node.base.active,
            },
            transform,
            size: Size {
                width: node.base.width,
                height: 0.0,
            },
            strokes: vec![node.base.stroke.into()],
            stroke_width: node.base.stroke_width,
            _data_stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Center),
            stroke_dash_array: None,
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_drop_shadow,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
        })
    }
}

impl From<JSONPathNode> for Node {
    fn from(node: JSONPathNode) -> Self {
        let transform = AffineTransform::new(node.base.left, node.base.top, node.base.rotation);

        Node::Vector(VectorNode {
            base: BaseNode {
                id: node.base.id,
                name: node.base.name,
                active: node.base.active,
            },
            transform,
            fill: Some(node.base.fill.into()),
            network: node.vector_network.map(|vn| vn.into()).unwrap_or_default(),
            strokes: vec![node.base.stroke.into()],
            stroke_width: node.base.stroke_width,
            stroke_align: node.base.stroke_align.unwrap_or(StrokeAlign::Inside),
            stroke_dash_array: None,
            blend_mode: node.base.blend_mode,
            opacity: node.base.opacity,
            effects: merge_effects(
                node.base.fe_drop_shadow,
                node.base.fe_blur,
                node.base.fe_backdrop_blur,
            ),
        })
    }
}

impl From<JSONNode> for Node {
    fn from(node: JSONNode) -> Self {
        match node {
            JSONNode::Container(container) => Node::Container(container.into()),
            JSONNode::Text(text) => Node::TextSpan(text.into()),
            JSONNode::Vector(vector) => vector.into(),
            JSONNode::Path(path) => path.into(),
            JSONNode::Ellipse(ellipse) => ellipse.into(),
            JSONNode::Rectangle(rectangle) => rectangle.into(),
            JSONNode::Line(line) => line.into(),
            JSONNode::Unknown(unknown) => Node::Error(ErrorNode {
                base: BaseNode {
                    id: unknown.id,
                    name: unknown.name,
                    active: unknown.active,
                },
                transform: AffineTransform::identity(),
                size: Size {
                    width: unknown.width,
                    height: unknown.height,
                },
                opacity: unknown.opacity,
                error: "Unknown node".to_string(),
            }),
        }
    }
}

fn de_css_length<'de, D>(deserializer: D) -> Result<f32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Value = Deserialize::deserialize(deserializer)?;
    match value {
        Value::Number(n) => Ok(n.as_f64().unwrap_or(0.0) as f32),
        _ => Ok(0.0),
    }
}

fn de_corner_radius<'de, D>(deserializer: D) -> Result<Option<RectangularCornerRadius>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;

    match value {
        None => Ok(None),
        Some(v) => match v {
            serde_json::Value::Number(n) => {
                let radius = n.as_f64().unwrap_or(0.0) as f32;
                Ok(Some(RectangularCornerRadius::all(radius)))
            }
            serde_json::Value::Array(arr) => {
                if arr.len() == 4 {
                    let values: Vec<f32> = arr
                        .into_iter()
                        .map(|v| v.as_f64().unwrap_or(0.0) as f32)
                        .collect();
                    Ok(Some(RectangularCornerRadius {
                        tl: values[0],
                        tr: values[1],
                        bl: values[2],
                        br: values[3],
                    }))
                } else {
                    Ok(None)
                }
            }
            _ => Ok(None),
        },
    }
}

fn merge_effects(
    fe_drop_shadow: Option<JSONFeDropShadow>,
    fe_blur: Option<FeGaussianBlur>,
    fe_backdrop_blur: Option<FeGaussianBlur>,
) -> LayerEffects {
    let mut effects = LayerEffects::new_empty();
    if let Some(filter_blur) = fe_blur {
        effects.blur = Some(filter_blur);
    }
    if let Some(filter_backdrop_blur) = fe_backdrop_blur {
        effects.backdrop_blur = Some(filter_backdrop_blur);
    }
    if let Some(box_shadow) = fe_drop_shadow {
        effects
            .shadows
            .push(FilterShadowEffect::DropShadow(box_shadow.into()));
    }
    effects
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parse_canvas_json() {
        let path = "../fixtures/local/document.json";
        let Ok(data) = fs::read_to_string(path) else {
            eprintln!("test resource not found: {}", path);
            return;
        };
        let parsed: JSONCanvasFile = serde_json::from_str(&data).expect("failed to parse JSON");

        assert_eq!(parsed.version, "0.0.1-beta.1+20250303");
        assert!(
            !parsed.document.nodes.is_empty(),
            "nodes should not be empty"
        );
    }

    #[test]
    fn corner_radius_optional_and_falls_back_to_zero() {
        // Test JSON without cornerRadius field
        let json_without_corner_radius = r#"{
            "version": "0.0.1-beta.1+20250303",
            "document": {
                "bitmaps": {},
                "properties": {},
                "nodes": {
                    "test-rect": {
                        "type": "rectangle",
                        "id": "test-rect",
                        "name": "Test Rectangle",
                        "left": 0.0,
                        "top": 0.0,
                        "width": 100.0,
                        "height": 100.0,
                        "fill": {
                            "type": "solid",
                            "color": {
                                "r": 255,
                                "g": 0,
                                "b": 0,
                                "a": 1.0
                            }
                        }
                    }
                },
                "scenes": {}
            }
        }"#;

        let parsed: JSONCanvasFile = serde_json::from_str(json_without_corner_radius)
            .expect("failed to parse JSON without cornerRadius");

        // Verify that the rectangle node was parsed successfully
        if let Some(JSONNode::Rectangle(rect_node)) = parsed.document.nodes.get("test-rect") {
            // corner_radius should be None when not present in JSON
            assert!(rect_node.base.corner_radius.is_none());
        } else {
            panic!("Expected rectangle node not found");
        }

        // Test JSON with cornerRadius field
        let json_with_corner_radius = r#"{
            "version": "0.0.1-beta.1+20250303",
            "document": {
                "bitmaps": {},
                "properties": {},
                "nodes": {
                    "test-rect": {
                        "type": "rectangle",
                        "id": "test-rect",
                        "name": "Test Rectangle",
                        "left": 0.0,
                        "top": 0.0,
                        "width": 100.0,
                        "height": 100.0,
                        "cornerRadius": 10.0,
                        "fill": {
                            "type": "solid",
                            "color": {
                                "r": 255,
                                "g": 0,
                                "b": 0,
                                "a": 1.0
                            }
                        }
                    }
                },
                "scenes": {}
            }
        }"#;

        let parsed: JSONCanvasFile = serde_json::from_str(json_with_corner_radius)
            .expect("failed to parse JSON with cornerRadius");

        // Verify that the rectangle node was parsed successfully with cornerRadius
        if let Some(JSONNode::Rectangle(rect_node)) = parsed.document.nodes.get("test-rect") {
            // corner_radius should be Some when present in JSON
            assert!(rect_node.base.corner_radius.is_some());
            if let Some(corner_radius) = &rect_node.base.corner_radius {
                assert_eq!(corner_radius.tl, 10.0);
                assert_eq!(corner_radius.tr, 10.0);
                assert_eq!(corner_radius.bl, 10.0);
                assert_eq!(corner_radius.br, 10.0);
            }
        } else {
            panic!("Expected rectangle node not found");
        }
    }
}
