use crate::repository::NodeRepository;
use crate::schema::{
    BaseNode, BlendMode, Color, ContainerNode, EllipseNode, FeBackdropBlur, FeDropShadow,
    FeGaussianBlur, FilterEffect, FontWeight, LineNode, Node, NodeId, Paint, RectangleNode,
    RectangularCornerRadius, RegularPolygonNode, RegularStarPolygonNode, Size, SolidPaint,
    StrokeAlign, TextAlign, TextAlignVertical, TextDecoration, TextSpanNode, TextStyle,
    TextTransform,
};
use crate::transform::AffineTransform;
use figma::rest::{
    BooleanOperationNode, CanvasNode, ComponentNode, ComponentSetNode, DocumentNode, Effect,
    FrameNode, InstanceNode, LayerBase, LinkUnfurlNode, Node as FigmaNode, Paint as FigmaPaint,
    RGBA, RegularPolygonNode as FigmaRegularPolygonNode, SectionNode, ShapeNode, SliceNode,
    StarNode, TextNode, Vector,
};

/// Converts Figma nodes to Grida schema
pub struct FigmaConverter {
    repository: NodeRepository,
}

impl FigmaConverter {
    pub fn new() -> Self {
        Self {
            repository: NodeRepository::new(),
        }
    }

    /// Convert Figma's relative transform matrix to AffineTransform
    fn convert_transform(relative_transform: Option<&Vec<Vec<f32>>>) -> AffineTransform {
        relative_transform.map_or(AffineTransform::identity(), |transform| {
            // Convert Figma's 2x3 transform matrix to AffineTransform
            // Figma matrix: [a c tx]
            //              [b d ty]
            AffineTransform {
                matrix: [
                    [transform[0][0], transform[0][1], transform[0][2]],
                    [transform[1][0], transform[1][1], transform[1][2]],
                ],
            }
        })
    }

    /// Convert Figma's base node to our BaseNode
    fn convert_base_node(base: &LayerBase) -> BaseNode {
        BaseNode {
            id: base.id.clone(),
            name: base.name.clone(),
            active: base.visible.unwrap_or(true),
        }
    }

    /// Convert Figma's RGBA color to our Color
    fn convert_color(color: &RGBA) -> Color {
        Color(
            (color.r * 255.0) as u8,
            (color.g * 255.0) as u8,
            (color.b * 255.0) as u8,
            (color.a * 255.0) as u8,
        )
    }

    /// Convert Figma's paint to our Paint
    fn convert_paint(paint: &FigmaPaint) -> Paint {
        match paint {
            FigmaPaint::SOLID { color } => Paint::Solid(SolidPaint {
                color: Self::convert_color(color),
                opacity: 1.0,
            }),
            _ => Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            }),
        }
    }

    /// Convert Figma's fills to our Paint
    fn convert_fills(fills: Option<&Vec<FigmaPaint>>) -> Paint {
        fills.and_then(|fills| fills.first()).map_or(
            Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            }),
            |paint| Self::convert_paint(paint),
        )
    }

    /// Convert Figma's strokes to our Paint
    fn convert_strokes(strokes: Option<&Vec<FigmaPaint>>) -> Paint {
        Self::convert_fills(strokes)
    }

    /// Convert Figma's stroke align to our StrokeAlign
    fn convert_stroke_align(stroke_align: Option<&str>) -> StrokeAlign {
        match stroke_align {
            Some("INSIDE") => StrokeAlign::Inside,
            Some("OUTSIDE") => StrokeAlign::Outside,
            _ => StrokeAlign::Center,
        }
    }

    /// Convert Figma's Vector to our Size
    fn convert_size(size: Option<&Vector>) -> Size {
        size.map_or(
            Size {
                width: 0.0,
                height: 0.0,
            },
            |size| Size {
                width: size.x,
                height: size.y,
            },
        )
    }

    /// Convert Figma's visibility to opacity (1.0 if visible, 0.0 if not)
    fn convert_opacity(visible: Option<bool>) -> f32 {
        visible.unwrap_or(true).then_some(1.0).unwrap_or(0.0)
    }

    /// Convert Figma's text decoration to our TextDecoration
    fn convert_text_decoration(decoration: Option<&str>) -> TextDecoration {
        match decoration {
            Some("UNDERLINE") => TextDecoration::Underline,
            Some("STRIKETHROUGH") => TextDecoration::LineThrough,
            _ => TextDecoration::None,
        }
    }

    /// Convert Figma's text alignment to our TextAlign
    fn convert_text_align(align: Option<&str>) -> TextAlign {
        match align {
            Some("CENTER") => TextAlign::Center,
            Some("RIGHT") => TextAlign::Right,
            Some("JUSTIFIED") => TextAlign::Justify,
            _ => TextAlign::Left,
        }
    }

    /// Convert Figma's vertical text alignment to our TextAlignVertical
    fn convert_text_align_vertical(align: Option<&str>) -> TextAlignVertical {
        match align {
            Some("CENTER") => TextAlignVertical::Center,
            Some("BOTTOM") => TextAlignVertical::Bottom,
            _ => TextAlignVertical::Top,
        }
    }

    /// Convert Figma's effects to our FilterEffect
    fn convert_effects(effects: Option<&Vec<Effect>>) -> Option<FilterEffect> {
        // If no effects, return None
        let effects = effects?;
        if effects.is_empty() {
            return None;
        }

        // Take the first effect for now (we could potentially combine multiple effects in the future)
        match &effects[0] {
            Effect::DropShadow(drop_shadow) => {
                if !drop_shadow.base.visible {
                    return None;
                }
                Some(FilterEffect::DropShadow(FeDropShadow {
                    dx: drop_shadow.base.offset.x,
                    dy: drop_shadow.base.offset.y,
                    blur: drop_shadow.base.radius,
                    color: Self::convert_color(&drop_shadow.base.color),
                }))
            }
            Effect::LayerBlur(blur) => {
                if !blur.base.visible {
                    return None;
                }
                Some(FilterEffect::GaussianBlur(FeGaussianBlur {
                    radius: blur.base.radius,
                }))
            }
            Effect::BackgroundBlur(blur) => {
                if !blur.base.visible {
                    return None;
                }
                Some(FilterEffect::BackdropBlur(FeBackdropBlur {
                    radius: blur.base.radius,
                }))
            }
            // Skip other effects for now as they're not supported in our schema
            _ => None,
        }
    }

    /// Convert a Figma node to Grida schema
    pub fn convert_node(&mut self, node: &FigmaNode) -> Result<NodeId, String> {
        let grid_node = match node {
            FigmaNode::Document(document) => self.convert_document(document)?,
            FigmaNode::Canvas(canvas) => self.convert_canvas(canvas)?,
            FigmaNode::Frame(frame) => self.convert_frame(frame)?,
            FigmaNode::Group(group) => self.convert_frame(group)?, // Groups are just frames in Figma
            FigmaNode::Vector(vector) => self.convert_vector(vector)?,
            FigmaNode::BooleanOperation(boolean) => self.convert_boolean(boolean)?,
            FigmaNode::Star(star) => self.convert_star(star)?,
            FigmaNode::Line(line) => self.convert_line(line)?,
            FigmaNode::Ellipse(ellipse) => self.convert_ellipse(ellipse)?,
            FigmaNode::RegularPolygon(polygon) => self.convert_regular_polygon(polygon)?,
            FigmaNode::Rectangle(rectangle) => self.convert_rectangle(rectangle)?,
            FigmaNode::Text(text) => self.convert_text(text)?,
            FigmaNode::Slice(slice) => self.convert_slice(slice)?,
            FigmaNode::Component(component) => self.convert_component(component)?,
            FigmaNode::ComponentSet(component_set) => self.convert_component_set(component_set)?,
            FigmaNode::Instance(instance) => self.convert_instance(instance)?,
            FigmaNode::Section(section) => self.convert_section(section)?,
            FigmaNode::LinkUnfurl(link) => self.convert_link(link)?,
            FigmaNode::Unknown => return Err("Unknown node type".to_string()),
        };

        Ok(self.repository.insert(grid_node))
    }

    fn convert_document(&mut self, document: &DocumentNode) -> Result<Node, String> {
        let children = document
            .children
            .iter()
            .map(|child| self.convert_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: document.base.id.clone(),
                name: document.base.name.clone(),
                active: document.base.visible.unwrap_or(true),
            },
            blend_mode: BlendMode::Normal,
            transform: AffineTransform::identity(),
            size: Size {
                width: 0.0,
                height: 0.0,
            },
            corner_radius: RectangularCornerRadius::zero(),
            fill: Paint::Solid(SolidPaint {
                color: Color(255, 255, 255, 255),
                opacity: 1.0,
            }),
            stroke: None,
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            effect: None,
            children,
            opacity: 1.0,
            clip: true,
        }))
    }

    fn convert_canvas(&mut self, canvas: &CanvasNode) -> Result<Node, String> {
        let children = canvas
            .children
            .iter()
            .map(|child| self.convert_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: canvas.base.id.clone(),
                name: canvas.base.name.clone(),
                active: canvas.base.visible.unwrap_or(true),
            },
            blend_mode: BlendMode::Normal,
            transform: AffineTransform::identity(),
            size: Size {
                width: 0.0,
                height: 0.0,
            },
            corner_radius: RectangularCornerRadius::zero(),
            fill: canvas.background_color.as_ref().map_or(
                Paint::Solid(SolidPaint {
                    color: Color(255, 255, 255, 255),
                    opacity: 1.0,
                }),
                |color| {
                    Paint::Solid(SolidPaint {
                        color: Color(
                            (color.r * 255.0) as u8,
                            (color.g * 255.0) as u8,
                            (color.b * 255.0) as u8,
                            (color.a * 255.0) as u8,
                        ),
                        opacity: 1.0,
                    })
                },
            ),
            stroke: None,
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            effect: None,
            children,
            opacity: 1.0,
            clip: true,
        }))
    }

    fn convert_frame(&mut self, frame: &FrameNode) -> Result<Node, String> {
        let children = frame
            .children
            .iter()
            .map(|child| self.convert_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        let size = frame.size.as_ref().map_or(
            Size {
                width: 0.0,
                height: 0.0,
            },
            |size| Size {
                width: size.x,
                height: size.y,
            },
        );

        let transform = Self::convert_transform(frame.relative_transform.as_ref());

        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: frame.base.id.clone(),
                name: frame.base.name.clone(),
                active: frame.base.visible.unwrap_or(true),
            },
            blend_mode: BlendMode::Normal,
            transform,
            size,
            corner_radius: RectangularCornerRadius::zero(),
            fill: Paint::Solid(SolidPaint {
                color: Color(255, 255, 255, 255),
                opacity: 1.0,
            }),
            stroke: None,
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            effect: None,
            children,
            opacity: 1.0,
            clip: frame.clips_content.unwrap_or(true),
        }))
    }

    fn convert_text(&mut self, text: &TextNode) -> Result<Node, String> {
        let style = text.style.as_ref().ok_or("Missing text style")?;
        let bounding_box = text
            .absolute_bounding_box
            .as_ref()
            .ok_or("Missing bounding box")?;

        Ok(Node::TextSpan(TextSpanNode {
            base: Self::convert_base_node(&text.base),
            transform: Self::convert_transform(None),
            size: Size {
                width: bounding_box.width,
                height: bounding_box.height,
            },
            text: text.characters.clone(),
            text_style: TextStyle {
                text_decoration: Self::convert_text_decoration(style.text_decoration.as_deref()),
                font_family: style
                    .font_family
                    .clone()
                    .unwrap_or_else(|| "Inter".to_string()),
                font_size: style.font_size.unwrap_or(14.0),
                font_weight: FontWeight::new(style.font_weight.unwrap_or(400)),
                letter_spacing: style.letter_spacing,
                line_height: style.line_height_px,
                text_transform: TextTransform::None,
            },
            text_align: Self::convert_text_align(style.text_align_horizontal.as_deref()),
            text_align_vertical: Self::convert_text_align_vertical(
                style.text_align_vertical.as_deref(),
            ),
            fill: Self::convert_fills(style.fills.as_ref()),
            stroke: None,
            stroke_width: None,
            stroke_align: StrokeAlign::Inside,
            opacity: Self::convert_opacity(text.base.visible),
            blend_mode: BlendMode::Normal,
        }))
    }

    fn convert_vector(&mut self, vector: &ShapeNode) -> Result<Node, String> {
        // TODO: Implement vector conversion
        Err("Not implemented".to_string())
    }

    fn convert_boolean(&mut self, boolean: &BooleanOperationNode) -> Result<Node, String> {
        // TODO: Implement boolean operation conversion
        Err("Not implemented".to_string())
    }

    fn convert_star(&mut self, star: &StarNode) -> Result<Node, String> {
        let size = Self::convert_size(star.base.size.as_ref());
        let transform = Self::convert_transform(star.base.relative_transform.as_ref());

        Ok(Node::RegularStarPolygon(RegularStarPolygonNode {
            base: Self::convert_base_node(&star.base.base),
            transform,
            size,
            point_count: 5,     // Default to 5 points for a star
            inner_radius: 0.4,  // Default inner radius to 0.4 (40% of outer radius)
            corner_radius: 0.0, // Figma stars don't have corner radius
            fill: Self::convert_fills(star.base.fills.as_ref()),
            stroke: Self::convert_strokes(star.base.strokes.as_ref()),
            stroke_width: star.base.stroke_weight.unwrap_or(1.0),
            stroke_align: Self::convert_stroke_align(star.base.stroke_align.as_deref()),
            stroke_dash_array: star.base.stroke_dashes.clone(),
            opacity: Self::convert_opacity(star.base.base.visible),
            blend_mode: BlendMode::Normal,
            effect: None, // Effects are not currently supported in the Figma API types
        }))
    }

    fn convert_line(&mut self, line: &ShapeNode) -> Result<Node, String> {
        let mut size = Self::convert_size(line.size.as_ref());
        size.height = 0.0; // Lines have no height in our schema
        let transform = Self::convert_transform(line.relative_transform.as_ref());

        Ok(Node::Line(LineNode {
            base: Self::convert_base_node(&line.base),
            transform,
            size,
            stroke: Self::convert_strokes(line.strokes.as_ref()),
            stroke_width: line.stroke_weight.unwrap_or(1.0),
            stroke_align: Self::convert_stroke_align(line.stroke_align.as_deref()),
            stroke_dash_array: line.stroke_dashes.clone(),
            opacity: Self::convert_opacity(line.base.visible),
            blend_mode: BlendMode::Normal,
        }))
    }

    fn convert_ellipse(&mut self, ellipse: &ShapeNode) -> Result<Node, String> {
        let size = Self::convert_size(ellipse.size.as_ref());
        let transform = Self::convert_transform(ellipse.relative_transform.as_ref());

        Ok(Node::Ellipse(EllipseNode {
            base: Self::convert_base_node(&ellipse.base),
            transform,
            size,
            fill: Self::convert_fills(ellipse.fills.as_ref()),
            stroke: Self::convert_strokes(ellipse.strokes.as_ref()),
            stroke_width: ellipse.stroke_weight.unwrap_or(1.0),
            stroke_align: Self::convert_stroke_align(ellipse.stroke_align.as_deref()),
            stroke_dash_array: ellipse.stroke_dashes.clone(),
            opacity: Self::convert_opacity(ellipse.base.visible),
            blend_mode: BlendMode::Normal,
            effect: None, // Effects are not currently supported in the Figma API types
        }))
    }

    fn convert_regular_polygon(
        &mut self,
        polygon: &FigmaRegularPolygonNode,
    ) -> Result<Node, String> {
        let size = Self::convert_size(polygon.base.size.as_ref());
        let transform = Self::convert_transform(polygon.base.relative_transform.as_ref());

        Ok(Node::RegularPolygon(RegularPolygonNode {
            base: Self::convert_base_node(&polygon.base.base),
            transform,
            size,
            point_count: 3,     // Default to triangle if not specified
            corner_radius: 0.0, // Figma regular polygons don't have corner radius
            fill: Self::convert_fills(polygon.base.fills.as_ref()),
            stroke: Self::convert_strokes(polygon.base.strokes.as_ref()),
            stroke_width: polygon.base.stroke_weight.unwrap_or(1.0),
            stroke_align: Self::convert_stroke_align(polygon.base.stroke_align.as_deref()),
            stroke_dash_array: polygon.base.stroke_dashes.clone(),
            opacity: Self::convert_opacity(polygon.base.base.visible),
            blend_mode: BlendMode::Normal,
            effect: None, // Effects are not currently supported in the Figma API types
        }))
    }

    fn convert_rectangle(&mut self, rectangle: &ShapeNode) -> Result<Node, String> {
        let size = Self::convert_size(rectangle.size.as_ref());
        let transform = Self::convert_transform(rectangle.relative_transform.as_ref());

        Ok(Node::Rectangle(RectangleNode {
            base: Self::convert_base_node(&rectangle.base),
            transform,
            size,
            corner_radius: RectangularCornerRadius::zero(), // TODO: Get corner radius from Figma
            fill: Self::convert_fills(rectangle.fills.as_ref()),
            stroke: Self::convert_strokes(rectangle.strokes.as_ref()),
            stroke_width: rectangle.stroke_weight.unwrap_or(1.0),
            stroke_align: Self::convert_stroke_align(rectangle.stroke_align.as_deref()),
            stroke_dash_array: rectangle.stroke_dashes.clone(),
            opacity: Self::convert_opacity(rectangle.base.visible),
            blend_mode: BlendMode::Normal,
            effect: None, // Effects are not currently supported in the Figma API types
        }))
    }

    fn convert_slice(&mut self, slice: &SliceNode) -> Result<Node, String> {
        // TODO: Implement slice conversion
        Err("Not implemented".to_string())
    }

    fn convert_component(&mut self, component: &ComponentNode) -> Result<Node, String> {
        // TODO: Implement component conversion
        Err("Not implemented".to_string())
    }

    fn convert_component_set(&mut self, component_set: &ComponentSetNode) -> Result<Node, String> {
        // TODO: Implement component set conversion
        Err("Not implemented".to_string())
    }

    fn convert_instance(&mut self, instance: &InstanceNode) -> Result<Node, String> {
        // TODO: Implement instance conversion
        Err("Not implemented".to_string())
    }

    fn convert_section(&mut self, section: &SectionNode) -> Result<Node, String> {
        // TODO: Implement section conversion
        Err("Not implemented".to_string())
    }

    fn convert_link(&mut self, link: &LinkUnfurlNode) -> Result<Node, String> {
        // TODO: Implement link conversion
        Err("Not implemented".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_node() {
        // TODO: Add tests
    }
}
