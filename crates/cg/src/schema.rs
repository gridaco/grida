use crate::transform::AffineTransform;
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
pub struct Size {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone)]
pub struct ContainerNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub children: Vec<NodeId>,
    pub opacity: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct RectangularCornerRadius {
    pub tl: f32,
    pub tr: f32,
    pub bl: f32,
    pub br: f32,
}

#[derive(Debug, Clone)]
pub struct LineNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub fill: Color,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct RectNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub fill: Color,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct ImageNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub src: String,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct EllipseNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub fill: Color,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct TextNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub text: String,
    pub font_size: f32,
    pub fill: Color,
    pub opacity: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct Color(pub u8, pub u8, pub u8, pub u8);

// Example doc tree container
pub type NodeMap = HashMap<NodeId, Node>;
