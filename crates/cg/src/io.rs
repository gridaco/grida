use crate::schema::{
    BaseNode, BlendMode, Color as SchemaColor, ContainerNode as SchemaContainerNode,
    EllipseNode as SchemaEllipseNode, FontWeight, GroupNode, Node as SchemaNode, NodeId, Paint,
    PathNode, PolygonNode, RectangleNode, RectangularCornerRadius, Size, SolidPaint, TextAlign,
    TextAlignVertical, TextDecoration, TextSpanNode, TextStyle,
};
use crate::transform::AffineTransform;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct CanvasFile {
    pub version: String,
    pub document: Document,
}

#[derive(Debug, Deserialize)]
pub struct Document {
    pub bitmaps: HashMap<String, serde_json::Value>,
    pub properties: HashMap<String, serde_json::Value>,
    pub nodes: HashMap<String, Node>,
    pub scenes: HashMap<String, Scene>,
    pub entry_scene_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Scene {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub children: Vec<String>,
    #[serde(rename = "backgroundColor")]
    pub background_color: Option<Color>,
    pub guides: Option<Vec<serde_json::Value>>,
    pub constraints: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum Node {
    #[serde(rename = "container")]
    Container(ContainerNode),
    #[serde(rename = "text")]
    Text(TextNode),
    #[serde(rename = "vector")]
    Vector(VectorNode),
    #[serde(rename = "ellipse")]
    Ellipse(EllipseNode),
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
pub struct ContainerNode {
    pub id: String,
    pub name: String,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default = "default_locked")]
    pub locked: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default = "default_rotation")]
    pub rotation: f32,
    #[serde(rename = "zIndex", default = "default_z_index")]
    pub z_index: i32,
    pub position: Option<String>,
    pub left: f32,
    pub top: f32,
    pub width: serde_json::Value,
    pub height: serde_json::Value,
    pub children: Vec<String>,
    pub expanded: Option<bool>,
    pub fill: Option<Fill>,
    pub border: Option<Border>,
    pub style: Option<HashMap<String, serde_json::Value>>,
    #[serde(
        rename = "cornerRadius",
        deserialize_with = "deserialize_corner_radius"
    )]
    pub corner_radius: Option<RectangularCornerRadius>,
    pub padding: Option<serde_json::Value>,
    pub layout: Option<String>,
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

fn deserialize_corner_radius<'de, D>(
    deserializer: D,
) -> Result<Option<RectangularCornerRadius>, D::Error>
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

#[derive(Debug, Deserialize)]
pub struct TextNode {
    pub id: String,
    pub name: String,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default = "default_locked")]
    pub locked: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default = "default_rotation")]
    pub rotation: f32,
    #[serde(rename = "zIndex", default = "default_z_index")]
    pub z_index: i32,
    pub position: Option<String>,
    pub left: f32,
    pub top: f32,
    pub right: Option<f32>,
    pub bottom: Option<f32>,
    pub width: serde_json::Value,
    pub height: serde_json::Value,
    pub fill: Option<Fill>,
    pub style: Option<HashMap<String, serde_json::Value>>,
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
pub struct VectorNode {
    pub id: String,
    pub name: String,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default = "default_locked")]
    pub locked: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default = "default_rotation")]
    pub rotation: f32,
    #[serde(rename = "zIndex", default = "default_z_index")]
    pub z_index: i32,
    pub position: Option<String>,
    pub left: f32,
    pub top: f32,
    pub width: f32,
    pub height: f32,
    pub fill: Option<Fill>,
    pub paths: Option<Vec<Path>>,
}

#[derive(Debug, Deserialize)]
pub struct EllipseNode {
    pub id: String,
    pub name: String,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default = "default_locked")]
    pub locked: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default = "default_rotation")]
    pub rotation: f32,
    #[serde(rename = "zIndex", default = "default_z_index")]
    pub z_index: i32,
    pub position: Option<String>,
    pub left: f32,
    pub top: f32,
    pub width: f32,
    pub height: f32,
    pub fill: Option<Fill>,
    #[serde(rename = "strokeWidth")]
    pub stroke_width: Option<f32>,
    #[serde(rename = "strokeCap")]
    pub stroke_cap: Option<String>,
    pub effects: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
pub struct Fill {
    #[serde(rename = "type")]
    pub kind: String,
    pub color: Option<Color>,
}

#[derive(Debug, Deserialize)]
pub struct Border {
    #[serde(rename = "borderWidth")]
    pub border_width: Option<f32>,
    #[serde(rename = "borderColor")]
    pub border_color: Option<Color>,
    #[serde(rename = "borderStyle")]
    pub border_style: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Path {
    pub d: String,
    #[serde(rename = "fillRule")]
    pub fill_rule: String,
    pub fill: String,
}

#[derive(Debug, Deserialize)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: f32,
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

pub fn parse(file: &str) -> Result<CanvasFile, serde_json::Error> {
    serde_json::from_str(file)
}

impl From<Color> for SchemaColor {
    fn from(color: Color) -> Self {
        SchemaColor(color.r, color.g, color.b, (color.a * 255.0) as u8)
    }
}

impl From<Option<Fill>> for Paint {
    fn from(fill: Option<Fill>) -> Self {
        match fill {
            Some(fill) => match fill.kind.as_str() {
                "solid" => {
                    if let Some(color) = fill.color {
                        Paint::Solid(SolidPaint {
                            color: SchemaColor(color.r, color.g, color.b, (color.a * 255.0) as u8),
                        })
                    } else {
                        Paint::Solid(SolidPaint {
                            color: SchemaColor(0, 0, 0, 0),
                        })
                    }
                }
                _ => Paint::Solid(SolidPaint {
                    color: SchemaColor(0, 0, 0, 0),
                }),
            },
            None => Paint::Solid(SolidPaint {
                color: SchemaColor(0, 0, 0, 0),
            }),
        }
    }
}

impl From<ContainerNode> for SchemaContainerNode {
    fn from(node: ContainerNode) -> Self {
        let width = match node.width {
            Value::Number(n) => n.as_f64().unwrap_or(0.0) as f32,
            _ => 0.0,
        };
        let height = match node.height {
            Value::Number(n) => n.as_f64().unwrap_or(0.0) as f32,
            _ => 0.0,
        };
        SchemaContainerNode {
            base: BaseNode {
                id: node.id,
                name: node.name,
                active: node.active,
            },
            blend_mode: BlendMode::Normal,
            transform: AffineTransform::new(node.left, node.top, node.rotation),
            size: Size { width, height },
            corner_radius: node
                .corner_radius
                .unwrap_or(RectangularCornerRadius::zero()),
            fill: node.fill.into(),
            stroke: None,
            stroke_width: 0.0,
            effect: None,
            children: node.children,
            opacity: node.opacity,
        }
    }
}

impl From<TextNode> for TextSpanNode {
    fn from(node: TextNode) -> Self {
        let width = match node.width {
            Value::Number(n) => n.as_f64().unwrap_or(0.0) as f32,
            _ => 0.0,
        };
        let height = match node.height {
            Value::Number(n) => n.as_f64().unwrap_or(0.0) as f32,
            _ => 0.0,
        };
        TextSpanNode {
            base: BaseNode {
                id: node.id,
                name: node.name,
                active: node.active,
            },
            blend_mode: BlendMode::Normal,
            transform: AffineTransform::new(node.left, node.top, node.rotation),
            size: Size { width, height },
            text: node.text,
            text_style: TextStyle {
                text_decoration: node.text_decoration,
                font_family: node.font_family.unwrap_or_else(|| "Inter".to_string()),
                font_size: node.font_size.unwrap_or(14.0),
                font_weight: node.font_weight,
                letter_spacing: node.letter_spacing,
                line_height: node.line_height,
            },
            text_align: node.text_align,
            text_align_vertical: node.text_align_vertical,
            fill: node.fill.into(),
            stroke: None,
            stroke_width: None,
            opacity: node.opacity,
        }
    }
}

impl From<EllipseNode> for SchemaNode {
    fn from(node: EllipseNode) -> Self {
        let transform = AffineTransform::new(node.left, node.top, node.rotation);

        SchemaNode::Ellipse(SchemaEllipseNode {
            base: BaseNode {
                id: node.id,
                name: node.name,
                active: node.active,
            },
            blend_mode: BlendMode::Normal,
            transform,
            size: Size {
                width: node.width,
                height: node.height,
            },
            fill: node.fill.into(),
            stroke: Paint::Solid(SolidPaint {
                color: SchemaColor(0, 0, 0, 255),
            }),
            stroke_width: node.stroke_width.unwrap_or(0.0),
            opacity: node.opacity,
        })
    }
}

impl From<VectorNode> for SchemaNode {
    fn from(node: VectorNode) -> Self {
        let transform = AffineTransform::new(node.left, node.top, node.rotation);

        // For vector nodes, we'll create a path node with the path data
        SchemaNode::Path(PathNode {
            base: BaseNode {
                id: node.id,
                name: node.name,
                active: node.active,
            },
            transform,
            fill: node.fill.into(),
            data: node.paths.map_or("".to_string(), |paths| {
                paths
                    .iter()
                    .map(|path| path.d.clone())
                    .collect::<Vec<String>>()
                    .join(" ")
            }),
            stroke: Paint::Solid(SolidPaint {
                color: SchemaColor(0, 0, 0, 255),
            }),
            stroke_width: 0.0,
            opacity: node.opacity,
        })
    }
}

impl From<Node> for SchemaNode {
    fn from(node: Node) -> Self {
        match node {
            Node::Container(container) => SchemaNode::Container(container.into()),
            Node::Text(text) => SchemaNode::TextSpan(text.into()),
            Node::Vector(vector) => vector.into(),
            Node::Ellipse(ellipse) => ellipse.into(),
            Node::Unknown => SchemaNode::Group(GroupNode {
                base: BaseNode {
                    id: "unknown".to_string(),
                    name: "Unknown Node".to_string(),
                    active: false,
                },
                transform: AffineTransform::identity(),
                children: vec![],
                opacity: 0.0,
                blend_mode: BlendMode::Normal,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parse_canvas_json() {
        let data = fs::read_to_string("resources/document.json").expect("failed to read file");
        let parsed: CanvasFile = serde_json::from_str(&data).expect("failed to parse JSON");

        assert_eq!(parsed.version, "0.0.1-beta.1+20250303");
        assert!(
            !parsed.document.nodes.is_empty(),
            "nodes should not be empty"
        );
    }
}
