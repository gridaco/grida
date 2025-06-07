use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RGBA {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rectangle {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScrollBehavior {
    Scrolls,
    Fixed,
    StickyScrolls,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vector {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutConstraint {
    pub vertical: Option<String>,
    pub horizontal: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutGrid {
    pub pattern: Option<String>,
    pub section_size: Option<f32>,
    pub visible: Option<bool>,
    pub color: Option<RGBA>,
    pub alignment: Option<String>,
    pub gutter_size: Option<f32>,
    pub offset: Option<f32>,
    pub count: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hyperlink {
    pub r#type: String,
    pub url: Option<String>,
    #[serde(rename = "nodeID")]
    pub node_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerBase {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub visible: Option<bool>,
    #[serde(default)]
    pub locked: Option<bool>,
    #[serde(default)]
    pub rotation: Option<f32>,
    #[serde(default)]
    pub scroll_behavior: Option<ScrollBehavior>,
    #[serde(default)]
    pub component_property_references: Option<HashMap<String, String>>,
    #[serde(default)]
    pub plugin_data: Option<Value>,
    #[serde(default)]
    pub shared_plugin_data: Option<Value>,
    #[serde(default)]
    pub bound_variables: Option<Value>,
    #[serde(default)]
    pub explicit_variable_modes: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentNode {
    #[serde(flatten)]
    pub base: LayerBase,
    pub children: Vec<Node>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNode {
    #[serde(flatten)]
    pub base: LayerBase,
    pub children: Vec<Node>,
    #[serde(rename = "backgroundColor")]
    pub background_color: Option<RGBA>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameNode {
    #[serde(flatten)]
    pub base: LayerBase,
    pub children: Vec<Node>,
    #[serde(rename = "absoluteBoundingBox")]
    pub absolute_bounding_box: Option<Rectangle>,
    #[serde(rename = "absoluteRenderBounds")]
    pub absolute_render_bounds: Option<Rectangle>,
    pub preserve_ratio: Option<bool>,
    pub constraints: Option<LayoutConstraint>,
    #[serde(rename = "relativeTransform")]
    pub relative_transform: Option<Vec<Vec<f32>>>,
    pub size: Option<Vector>,
    pub layout_align: Option<String>,
    pub layout_grow: Option<u8>,
    pub layout_positioning: Option<String>,
    pub min_width: Option<f32>,
    pub max_width: Option<f32>,
    pub min_height: Option<f32>,
    pub max_height: Option<f32>,
    pub layout_sizing_horizontal: Option<String>,
    pub layout_sizing_vertical: Option<String>,
    pub clips_content: Option<bool>,
    pub layout_mode: Option<String>,
    pub primary_axis_sizing_mode: Option<String>,
    pub counter_axis_sizing_mode: Option<String>,
    pub primary_axis_align_items: Option<String>,
    pub counter_axis_align_items: Option<String>,
    pub padding_left: Option<f32>,
    pub padding_right: Option<f32>,
    pub padding_top: Option<f32>,
    pub padding_bottom: Option<f32>,
    pub item_spacing: Option<f32>,
    pub item_reverse_z_index: Option<bool>,
    pub strokes_included_in_layout: Option<bool>,
    pub layout_wrap: Option<String>,
    pub counter_axis_spacing: Option<f32>,
    pub counter_axis_align_content: Option<String>,
    pub layout_grids: Option<Vec<LayoutGrid>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionNode {
    #[serde(flatten)]
    pub base: LayerBase,
    pub children: Vec<Node>,
    #[serde(rename = "sectionContentsHidden")]
    pub section_contents_hidden: Option<bool>,
    #[serde(rename = "absoluteBoundingBox")]
    pub absolute_bounding_box: Option<Rectangle>,
    #[serde(rename = "absoluteRenderBounds")]
    pub absolute_render_bounds: Option<Rectangle>,
    pub preserve_ratio: Option<bool>,
    pub constraints: Option<LayoutConstraint>,
    #[serde(rename = "relativeTransform")]
    pub relative_transform: Option<Vec<Vec<f32>>>,
    pub size: Option<Vector>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeNode {
    #[serde(flatten)]
    pub base: LayerBase,
    #[serde(rename = "absoluteBoundingBox")]
    pub absolute_bounding_box: Option<Rectangle>,
    #[serde(rename = "absoluteRenderBounds")]
    pub absolute_render_bounds: Option<Rectangle>,
    pub preserve_ratio: Option<bool>,
    pub constraints: Option<LayoutConstraint>,
    #[serde(rename = "relativeTransform")]
    pub relative_transform: Option<Vec<Vec<f32>>>,
    pub size: Option<Vector>,
    pub strokes: Option<Vec<Paint>>,
    pub stroke_weight: Option<f32>,
    pub stroke_align: Option<String>,
    pub stroke_join: Option<String>,
    pub stroke_dashes: Option<Vec<f32>>,
    pub fills: Option<Vec<Paint>>,
    pub styles: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BooleanOperationNode {
    #[serde(flatten)]
    pub base: FrameNode,
    #[serde(rename = "booleanOperation")]
    pub boolean_operation: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentNode {
    #[serde(flatten)]
    pub base: FrameNode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentSetNode {
    #[serde(flatten)]
    pub base: FrameNode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceNode {
    #[serde(flatten)]
    pub base: FrameNode,
    #[serde(rename = "componentId")]
    pub component_id: Option<String>,
    #[serde(rename = "isExposedInstance")]
    pub is_exposed_instance: Option<bool>,
    #[serde(rename = "exposedInstances")]
    pub exposed_instances: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkUnfurlNode {
    #[serde(flatten)]
    pub base: LayerBase,
    pub size: Option<Vector>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SliceNode {
    #[serde(flatten)]
    pub base: LayerBase,
    pub size: Option<Vector>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StarNode {
    #[serde(flatten)]
    pub base: ShapeNode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegularPolygonNode {
    #[serde(flatten)]
    pub base: ShapeNode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextNode {
    #[serde(flatten)]
    pub base: LayerBase,
    pub characters: String,
    #[serde(rename = "style")]
    pub style: Option<TypeStyle>,
    #[serde(rename = "absoluteBoundingBox")]
    pub absolute_bounding_box: Option<Rectangle>,
    pub character_style_overrides: Option<Vec<u32>>,
    pub style_override_table: Option<HashMap<String, TypeStyle>>,
    pub line_types: Option<Vec<String>>,
    pub line_indentations: Option<Vec<u32>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeStyle {
    pub font_family: Option<String>,
    pub font_post_script_name: Option<String>,
    pub font_weight: Option<u32>,
    pub font_size: Option<f32>,
    pub text_case: Option<String>,
    pub text_align_horizontal: Option<String>,
    pub text_align_vertical: Option<String>,
    pub letter_spacing: Option<f32>,
    pub fills: Option<Vec<Paint>>,
    pub hyperlink: Option<Hyperlink>,
    pub opentype_flags: Option<HashMap<String, u32>>,
    pub semantic_weight: Option<String>,
    pub semantic_italic: Option<String>,
    pub paragraph_spacing: Option<f32>,
    pub paragraph_indent: Option<f32>,
    pub list_spacing: Option<f32>,
    pub text_decoration: Option<String>,
    pub text_auto_resize: Option<String>,
    pub text_truncation: Option<String>,
    pub max_lines: Option<u32>,
    pub line_height_px: Option<f32>,
    pub line_height_percent: Option<f32>,
    pub line_height_percent_font_size: Option<f32>,
    pub line_height_unit: Option<String>,
    pub is_override_over_text_style: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Paint {
    SOLID {
        color: RGBA,
    },
    IMAGE {
        image_ref: String,
        scale_mode: Option<String>,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum Node {
    #[serde(rename = "DOCUMENT")]
    Document(DocumentNode),
    #[serde(rename = "CANVAS")]
    Canvas(CanvasNode),
    #[serde(rename = "BOOLEAN_OPERATION")]
    BooleanOperation(BooleanOperationNode),
    #[serde(rename = "FRAME")]
    Frame(FrameNode),
    #[serde(rename = "GROUP")]
    Group(FrameNode),
    #[serde(rename = "COMPONENT")]
    Component(ComponentNode),
    #[serde(rename = "COMPONENT_SET")]
    ComponentSet(ComponentSetNode),
    #[serde(rename = "INSTANCE")]
    Instance(InstanceNode),
    #[serde(rename = "RECTANGLE")]
    Rectangle(ShapeNode),
    #[serde(rename = "REGULAR_POLYGON")]
    RegularPolygon(RegularPolygonNode),
    #[serde(rename = "SECTION")]
    Section(SectionNode),
    #[serde(rename = "SLICE")]
    Slice(SliceNode),
    #[serde(rename = "STAR")]
    Star(StarNode),
    #[serde(rename = "VECTOR")]
    Vector(ShapeNode),
    #[serde(rename = "ELLIPSE")]
    Ellipse(ShapeNode),
    #[serde(rename = "LINE")]
    Line(ShapeNode),
    #[serde(rename = "LINK_UNFURL")]
    LinkUnfurl(LinkUnfurlNode),
    #[serde(rename = "TEXT")]
    Text(TextNode),
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetFileResponse {
    pub name: String,
    pub role: Option<String>,
    #[serde(rename = "lastModified")]
    pub last_modified: String,
    #[serde(rename = "editorType")]
    pub editor_type: String,
    #[serde(rename = "thumbnailUrl")]
    pub thumbnail_url: Option<String>,
    pub version: String,
    pub document: DocumentNode,
}
