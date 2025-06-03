use std::collections::HashMap;

pub type NodeId = String;

#[derive(Debug, Clone)]
pub enum Node {
    Container(ContainerNode),
    Rectangle(RectNode),
    Ellipse(EllipseNode),
    Text(TextNode),
}

#[derive(Debug, Clone)]
pub struct BaseNode {
    pub id: NodeId,
    pub name: String,
    pub active: bool,
}

#[derive(Debug, Clone)]
pub struct Transform {
    pub x: f32,
    pub y: f32,
    pub z: i32,
    pub rotation: f32,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone)]
pub struct ContainerNode {
    pub base: BaseNode,
    pub transform: Transform,
    pub size: Size,
    pub children: Vec<NodeId>,
}

#[derive(Debug, Clone)]
pub struct RectNode {
    pub base: BaseNode,
    pub transform: Transform,
    pub size: Size,
    pub corner_radius: f32,
    pub fill: Color,
}

#[derive(Debug, Clone)]
pub struct EllipseNode {
    pub base: BaseNode,
    pub transform: Transform,
    pub size: Size,
    pub fill: Color,
}

#[derive(Debug, Clone)]
pub struct TextNode {
    pub base: BaseNode,
    pub transform: Transform,
    pub size: Size,
    pub content: String,
    pub font_size: f32,
    pub fill: Color,
}

#[derive(Debug, Clone, Copy)]
pub struct Color(pub u8, pub u8, pub u8, pub u8);

// Example doc tree container
pub type NodeMap = HashMap<NodeId, Node>;
