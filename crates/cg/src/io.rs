use crate::schema::{FontWeight, TextAlign, TextAlignVertical, TextDecoration};
use serde::Deserialize;
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
    #[serde(rename = "cornerRadius")]
    pub corner_radius: Option<serde_json::Value>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parse_canvas_json() {
        let data = fs::read_to_string("canvas.json").expect("failed to read file");
        let parsed: CanvasFile = serde_json::from_str(&data).expect("failed to parse JSON");

        assert_eq!(parsed.version, "0.0.1-beta.1+20250303");
        assert!(
            !parsed.document.nodes.is_empty(),
            "nodes should not be empty"
        );
    }
}
