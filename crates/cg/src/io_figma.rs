use crate::repository::NodeRepository;
use crate::schema::{
    BaseNode, BlendMode, Color, ContainerNode, ErrorNode, FeDropShadow, FeGaussianBlur,
    FilterEffect, FontWeight, ImagePaint, LineNode, Node, NodeId, Paint, PathNode, RectangleNode,
    RectangularCornerRadius, RegularPolygonNode, RegularStarPolygonNode, Scene, Size, SolidPaint,
    StrokeAlign, TextAlign, TextAlignVertical, TextDecoration, TextSpanNode, TextStyle,
    TextTransform,
};
use figma_api::models::minimal_strokes_trait::StrokeAlign as FigmaStrokeAlign;
use figma_api::models::type_style::{
    TextAlignHorizontal as FigmaTextAlignHorizontal, TextAlignVertical as FigmaTextAlignVertical,
    TextDecoration as FigmaTextDecoration,
};
use figma_api::models::vector::Vector;
use figma_api::models::{
    BooleanOperationNode, CanvasNode, ComponentNode, ComponentSetNode, DocumentNode, Effect,
    FrameNode, GroupNode, InstanceNode, LineNode as FigmaLineNode, LinkUnfurlNode,
    Paint as FigmaPaint, RectangleNode as FigmaRectangleNode,
    RegularPolygonNode as FigmaRegularPolygonNode, Rgba, SectionNode, SliceNode, StarNode,
    SubcanvasNode as FigmaSubcanvasNode, TextNode, VectorNode,
};
use grida_cmath::box_fit::BoxFit;
use grida_cmath::transform::AffineTransform;

const TRANSPARENT: Paint = Paint::Solid(SolidPaint {
    color: Color(0, 0, 0, 0),
    opacity: 0.0,
});

const BLACK: Paint = Paint::Solid(SolidPaint {
    color: Color(0, 0, 0, 255),
    opacity: 1.0,
});

const RED: Paint = Paint::Solid(SolidPaint {
    color: Color(255, 0, 0, 255),
    opacity: 1.0,
});

// Map implementations
impl From<&Rgba> for Color {
    fn from(color: &Rgba) -> Self {
        Color(
            (color.r * 255.0) as u8,
            (color.g * 255.0) as u8,
            (color.b * 255.0) as u8,
            (color.a * 255.0) as u8,
        )
    }
}

impl From<&Box<Rgba>> for Color {
    fn from(color: &Box<Rgba>) -> Self {
        Color(
            (color.r * 255.0) as u8,
            (color.g * 255.0) as u8,
            (color.b * 255.0) as u8,
            (color.a * 255.0) as u8,
        )
    }
}

impl From<&FigmaPaint> for Paint {
    fn from(paint: &FigmaPaint) -> Self {
        match paint {
            FigmaPaint::SolidPaint(solid) => Paint::Solid(SolidPaint {
                color: Color::from(&solid.color),
                opacity: solid.opacity.unwrap_or(1.0) as f32,
            }),
            FigmaPaint::ImagePaint(image) => Paint::Image(ImagePaint {
                transform: image.image_transform.as_ref().map_or(
                    AffineTransform::identity(),
                    |transform| AffineTransform {
                        matrix: [
                            [
                                transform[0][0] as f32,
                                transform[0][1] as f32,
                                transform[0][2] as f32,
                            ],
                            [
                                transform[1][0] as f32,
                                transform[1][1] as f32,
                                transform[1][2] as f32,
                            ],
                        ],
                    },
                ),
                _ref: image.image_ref.clone(),
                fit: match image.scale_mode {
                    figma_api::models::image_paint::ScaleMode::Fill => BoxFit::Cover,
                    figma_api::models::image_paint::ScaleMode::Fit => BoxFit::Contain,
                    figma_api::models::image_paint::ScaleMode::Tile => BoxFit::None,
                    figma_api::models::image_paint::ScaleMode::Stretch => BoxFit::None,
                },
                opacity: image.opacity.unwrap_or(1.0) as f32,
            }),
            _ => Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            }),
        }
    }
}

impl From<&FigmaStrokeAlign> for StrokeAlign {
    fn from(align: &FigmaStrokeAlign) -> Self {
        match align {
            FigmaStrokeAlign::Inside => StrokeAlign::Inside,
            FigmaStrokeAlign::Outside => StrokeAlign::Outside,
            FigmaStrokeAlign::Center => StrokeAlign::Center,
        }
    }
}

impl From<&FigmaTextAlignHorizontal> for TextAlign {
    fn from(align: &FigmaTextAlignHorizontal) -> Self {
        match align {
            FigmaTextAlignHorizontal::Left => TextAlign::Left,
            FigmaTextAlignHorizontal::Center => TextAlign::Center,
            FigmaTextAlignHorizontal::Right => TextAlign::Right,
            FigmaTextAlignHorizontal::Justified => TextAlign::Justify,
        }
    }
}

impl From<&FigmaTextAlignVertical> for TextAlignVertical {
    fn from(align: &FigmaTextAlignVertical) -> Self {
        match align {
            FigmaTextAlignVertical::Top => TextAlignVertical::Top,
            FigmaTextAlignVertical::Center => TextAlignVertical::Center,
            FigmaTextAlignVertical::Bottom => TextAlignVertical::Bottom,
        }
    }
}

impl From<&FigmaTextDecoration> for TextDecoration {
    fn from(decoration: &FigmaTextDecoration) -> Self {
        match decoration {
            FigmaTextDecoration::None => TextDecoration::None,
            FigmaTextDecoration::Underline => TextDecoration::Underline,
            FigmaTextDecoration::Strikethrough => TextDecoration::LineThrough,
        }
    }
}

fn map_option<'a, T, U>(value: Option<&'a T>) -> Option<U>
where
    U: From<&'a T>,
{
    value.map(|v| U::from(v))
}

/// Converts Figma nodes to Grida schema
pub struct FigmaConverter {
    repository: NodeRepository,
    image_urls: std::collections::HashMap<String, String>,
}

impl FigmaConverter {
    pub fn new() -> Self {
        Self {
            repository: NodeRepository::new(),
            image_urls: std::collections::HashMap::new(),
        }
    }

    pub fn with_image_urls(mut self, urls: std::collections::HashMap<String, String>) -> Self {
        self.image_urls = urls;
        self
    }

    /// Convert Figma's relative transform matrix to AffineTransform
    fn convert_transform(relative_transform: Option<&Vec<Vec<f64>>>) -> AffineTransform {
        relative_transform.map_or(AffineTransform::identity(), |transform| {
            // Convert Figma's 2x3 transform matrix to AffineTransform
            // Figma matrix: [a c tx]
            //              [b d ty]
            AffineTransform {
                matrix: [
                    [
                        transform[0][0] as f32,
                        transform[0][1] as f32,
                        transform[0][2] as f32,
                    ],
                    [
                        transform[1][0] as f32,
                        transform[1][1] as f32,
                        transform[1][2] as f32,
                    ],
                ],
            }
        })
    }

    /// Convert Figma's RGBA color to our Color
    fn convert_color(color: &Rgba) -> Color {
        color.into()
    }

    /// Convert Figma's paint to our Paint
    fn convert_paint(&self, paint: &FigmaPaint) -> Paint {
        match paint {
            FigmaPaint::SolidPaint(solid) => Paint::Solid(SolidPaint {
                color: Color::from(&solid.color),
                opacity: solid.opacity.unwrap_or(1.0) as f32,
            }),
            FigmaPaint::ImagePaint(image) => {
                let url = self
                    .image_urls
                    .get(&image.image_ref)
                    .cloned()
                    .unwrap_or_else(|| image.image_ref.clone());
                Paint::Image(ImagePaint {
                    transform: image.image_transform.as_ref().map_or(
                        AffineTransform::identity(),
                        |transform| AffineTransform {
                            matrix: [
                                [
                                    transform[0][0] as f32,
                                    transform[0][1] as f32,
                                    transform[0][2] as f32,
                                ],
                                [
                                    transform[1][0] as f32,
                                    transform[1][1] as f32,
                                    transform[1][2] as f32,
                                ],
                            ],
                        },
                    ),
                    _ref: url,
                    fit: match image.scale_mode {
                        figma_api::models::image_paint::ScaleMode::Fill => BoxFit::Cover,
                        figma_api::models::image_paint::ScaleMode::Fit => BoxFit::Contain,
                        figma_api::models::image_paint::ScaleMode::Tile => BoxFit::None,
                        figma_api::models::image_paint::ScaleMode::Stretch => BoxFit::None,
                    },
                    opacity: image.opacity.unwrap_or(1.0) as f32,
                })
            }
            _ => Paint::Solid(SolidPaint {
                color: Color(0, 0, 0, 255),
                opacity: 1.0,
            }),
        }
    }

    /// Convert Figma's fills to our Paint
    fn convert_fills(&self, fills: Option<&Vec<FigmaPaint>>) -> Option<Paint> {
        fills.and_then(|paints| {
            // Filter out invisible paints and get the first visible one
            paints
                .iter()
                .filter(|paint| match paint {
                    FigmaPaint::SolidPaint(solid) => solid.visible.unwrap_or(true),
                    FigmaPaint::GradientPaint(gradient) => gradient.visible.unwrap_or(true),
                    FigmaPaint::ImagePaint(image) => image.visible.unwrap_or(true),
                    _ => true,
                })
                .next()
                .map(|paint| self.convert_paint(paint))
        })
    }

    /// Convert Figma's strokes to our Paint
    fn convert_strokes(&self, strokes: Option<&Option<Vec<FigmaPaint>>>) -> Option<Paint> {
        strokes.and_then(|s| s.as_ref()).and_then(|paints| {
            // Filter out invisible paints and get the first visible one
            paints
                .iter()
                .filter(|paint| match paint {
                    FigmaPaint::SolidPaint(solid) => solid.visible.unwrap_or(true),
                    FigmaPaint::GradientPaint(gradient) => gradient.visible.unwrap_or(true),
                    FigmaPaint::ImagePaint(image) => image.visible.unwrap_or(true),
                    _ => true,
                })
                .next()
                .map(|paint| self.convert_paint(paint))
        })
    }

    /// Convert Figma's stroke align to our StrokeAlign
    fn convert_stroke_align(stroke_align: String) -> StrokeAlign {
        match stroke_align.as_str() {
            "INSIDE" => StrokeAlign::Inside,
            "OUTSIDE" => StrokeAlign::Outside,
            "CENTER" => StrokeAlign::Center,
            _ => StrokeAlign::Center,
        }
    }

    /// Convert Figma's Vector to our Size
    fn convert_size(size: Option<&Box<Vector>>) -> Size {
        size.map_or(
            Size {
                width: 0.0,
                height: 0.0,
            },
            |size| Size {
                width: size.x as f32,
                height: size.y as f32,
            },
        )
    }

    /// Convert Figma's visibility to opacity (1.0 if visible, 0.0 if not)
    fn convert_opacity(visible: Option<bool>) -> f32 {
        visible.unwrap_or(true).then_some(1.0).unwrap_or(0.0)
    }

    /// Convert Figma's text decoration to our TextDecoration
    fn convert_text_decoration(decoration: Option<&FigmaTextDecoration>) -> TextDecoration {
        map_option(decoration).unwrap_or(TextDecoration::None)
    }

    /// Convert Figma's text alignment to our TextAlign
    fn convert_text_align(align: Option<&FigmaTextAlignHorizontal>) -> TextAlign {
        map_option(align).unwrap_or(TextAlign::Left)
    }

    /// Convert Figma's vertical text alignment to our TextAlignVertical
    fn convert_text_align_vertical(align: Option<&FigmaTextAlignVertical>) -> TextAlignVertical {
        map_option(align).unwrap_or(TextAlignVertical::Top)
    }

    /// Convert Figma's effects to our FilterEffect
    fn convert_effects(effects: Option<&Vec<Effect>>) -> Option<FilterEffect> {
        // If no effects, return None
        let effects = effects?;
        if effects.is_empty() {
            return None;
        }

        // Find the first valid effect
        for effect in effects {
            match effect {
                Effect::DropShadow(drop_shadow) => {
                    if !drop_shadow.visible {
                        continue;
                    }
                    return Some(FilterEffect::DropShadow(FeDropShadow {
                        dx: drop_shadow.offset.x as f32,
                        dy: drop_shadow.offset.y as f32,
                        blur: drop_shadow.radius as f32,
                        color: Self::convert_color(&drop_shadow.color),
                    }));
                }
                Effect::LayerBlur(blur) => {
                    if !blur.visible {
                        continue;
                    }
                    return Some(FilterEffect::GaussianBlur(FeGaussianBlur {
                        radius: blur.radius as f32,
                    }));
                }
                _ => continue, // Skip unsupported effects
            }
        }

        None // No valid effects found
    }

    /// Convert Figma's slice to our SliceNode
    fn convert_slice(&mut self, slice: &Box<SliceNode>) -> Result<Node, String> {
        Ok(Node::Error(ErrorNode {
            base: BaseNode {
                id: slice.id.clone(),
                name: format!("[Slice] {}", slice.name),
                active: slice.visible.unwrap_or(true),
            },
            transform: AffineTransform::identity(),
            size: Size {
                width: 100.0,
                height: 100.0,
            },
            opacity: Self::convert_opacity(slice.visible),
            error: format!("Unsupported node type: Slice"),
        }))
    }

    /// Convert Figma's component to our ComponentNode
    fn convert_component(&mut self, component: &Box<ComponentNode>) -> Result<Node, String> {
        // Since ComponentNode inherits from FrameNode, we can reuse convert_frame
        // by creating a FrameNode with the instance's properties (at the moment, we're mapping it manually)

        let children = component
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        let size = Self::convert_size(component.size.as_ref());
        let transform = Self::convert_transform(component.relative_transform.as_ref());

        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: component.id.clone(),
                name: component.name.clone(),
                active: component.visible.unwrap_or(true),
            },
            blend_mode: Self::convert_blend_mode(component.blend_mode),
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                component.corner_radius,
                component.rectangle_corner_radii.as_ref(),
            ),
            fill: self
                .convert_fills(Some(&component.fills.as_ref()))
                .unwrap_or(TRANSPARENT),
            stroke: self.convert_strokes(Some(&component.strokes)),
            stroke_width: component.stroke_weight.unwrap_or(0.0) as f32,
            stroke_align: Self::convert_stroke_align(
                component
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: component
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            effect: Self::convert_effects(Some(&component.effects)),
            children,
            opacity: Self::convert_opacity(component.visible),
            clip: component.clips_content,
        }))
    }

    /// Convert Figma's component set to our ComponentSetNode
    fn convert_component_set(
        &mut self,
        component_set: &Box<ComponentSetNode>,
    ) -> Result<Node, String> {
        Ok(Node::Error(ErrorNode {
            base: BaseNode {
                id: component_set.id.clone(),
                name: format!("[ComponentSet] {}", component_set.name),
                active: component_set.visible.unwrap_or(true),
            },
            transform: Self::convert_transform(component_set.relative_transform.as_ref()),
            size: Self::convert_size(component_set.size.as_ref()),
            opacity: Self::convert_opacity(component_set.visible),
            error: format!("Unsupported node type: ComponentSet"),
        }))
    }

    /// Convert Figma's corner radii array to our RectangularCornerRadius
    fn convert_corner_radius(
        corner_radius: Option<f64>,
        rectangle_corner_radii: Option<&Vec<f64>>,
    ) -> RectangularCornerRadius {
        if let Some(radius) = corner_radius {
            // If corner_radius is present, use it for all corners
            RectangularCornerRadius {
                tl: radius as f32,
                tr: radius as f32,
                br: radius as f32,
                bl: radius as f32,
            }
        } else if let Some(radii) = rectangle_corner_radii {
            // If rectangle_corner_radii is present, use individual values
            if radii.len() == 4 {
                RectangularCornerRadius {
                    tl: radii[0] as f32,
                    tr: radii[1] as f32,
                    br: radii[2] as f32,
                    bl: radii[3] as f32,
                }
            } else {
                RectangularCornerRadius::zero()
            }
        } else {
            // If neither is present, return zero radius
            RectangularCornerRadius::zero()
        }
    }

    /// Convert Figma's instance to our InstanceNode
    fn convert_instance(&mut self, instance: &Box<InstanceNode>) -> Result<Node, String> {
        // Since InstanceNode inherits from FrameNode, we can reuse convert_frame
        // by creating a FrameNode with the instance's properties (at the moment, we're mapping it manually)

        let children = instance
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        let size = Self::convert_size(instance.size.as_ref());
        let transform = Self::convert_transform(instance.relative_transform.as_ref());

        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: instance.id.clone(),
                name: instance.name.clone(),
                active: instance.visible.unwrap_or(true),
            },
            blend_mode: Self::convert_blend_mode(instance.blend_mode),
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                instance.corner_radius,
                instance.rectangle_corner_radii.as_ref(),
            ),
            fill: self
                .convert_fills(Some(&instance.fills.as_ref()))
                .unwrap_or(TRANSPARENT),
            stroke: self.convert_strokes(Some(&instance.strokes)),
            stroke_width: instance.stroke_weight.unwrap_or(0.0) as f32,
            stroke_align: Self::convert_stroke_align(
                instance
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: instance
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            effect: Self::convert_effects(Some(&instance.effects)),
            children,
            opacity: Self::convert_opacity(instance.visible),
            clip: instance.clips_content,
        }))
    }

    /// Convert Figma's section to our SectionNode
    fn convert_section(&mut self, section: &Box<SectionNode>) -> Result<Node, String> {
        let children = section
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: section.id.clone(),
                name: format!("[Section] {}", section.name),
                active: section.visible.unwrap_or(true),
            },
            blend_mode: BlendMode::Normal,
            transform: Self::convert_transform(section.relative_transform.as_ref()),
            size: Self::convert_size(section.size.as_ref()),
            corner_radius: RectangularCornerRadius::zero(),
            children,
            fill: self
                .convert_fills(Some(&section.fills.as_ref()))
                .unwrap_or(TRANSPARENT),
            stroke: None,
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            opacity: Self::convert_opacity(section.visible),
            effect: None,
            clip: false,
        }))
    }

    /// Convert Figma's link to our LinkUnfurlNode
    fn convert_link(&mut self, link: &Box<LinkUnfurlNode>) -> Result<Node, String> {
        Ok(Node::Error(ErrorNode {
            base: BaseNode {
                id: link.id.clone(),
                name: format!("[Link] {}", link.name),
                active: link.visible.unwrap_or(true),
            },
            transform: AffineTransform::identity(),
            size: Size {
                width: 100.0,
                height: 100.0,
            },
            opacity: Self::convert_opacity(link.visible),
            error: format!("Unsupported node type: Link"),
        }))
    }

    /// Convert Figma's node to Grida schema
    pub fn convert_sub_canvas_node(&mut self, node: &FigmaSubcanvasNode) -> Result<NodeId, String> {
        let grid_node = match node {
            FigmaSubcanvasNode::Frame(frame) => self.convert_frame(frame)?,
            FigmaSubcanvasNode::Group(group) => self.convert_group(group)?,
            FigmaSubcanvasNode::Vector(vector) => self.convert_vector(vector)?,
            FigmaSubcanvasNode::BooleanOperation(boolean) => self.convert_boolean(boolean)?,
            FigmaSubcanvasNode::Star(star) => self.convert_star(star)?,
            FigmaSubcanvasNode::Line(line) => self.convert_line(line)?,
            FigmaSubcanvasNode::Ellipse(ellipse) => self.convert_ellipse(ellipse)?,
            FigmaSubcanvasNode::RegularPolygon(polygon) => self.convert_regular_polygon(polygon)?,
            FigmaSubcanvasNode::Rectangle(rectangle) => self.convert_rectangle(rectangle)?,
            FigmaSubcanvasNode::Text(text) => self.convert_text(text)?,
            FigmaSubcanvasNode::Slice(slice) => self.convert_slice(slice)?,
            FigmaSubcanvasNode::Component(component) => self.convert_component(component)?,
            FigmaSubcanvasNode::ComponentSet(component_set) => {
                self.convert_component_set(component_set)?
            }
            FigmaSubcanvasNode::Instance(instance) => self.convert_instance(instance)?,
            FigmaSubcanvasNode::Section(section) => self.convert_section(section)?,
            FigmaSubcanvasNode::LinkUnfurl(link) => self.convert_link(link)?,
            FigmaSubcanvasNode::Connector(_) => Err("Connector nodes not supported".to_string())?,
            FigmaSubcanvasNode::Embed(_) => Err("Embed nodes not supported".to_string())?,
            FigmaSubcanvasNode::ShapeWithText(_) => {
                Err("Shape with text nodes not supported".to_string())?
            }
            FigmaSubcanvasNode::Sticky(_) => Err("Sticky nodes not supported".to_string())?,
            FigmaSubcanvasNode::TableCell(_) => Err("Table cell nodes not supported".to_string())?,
            FigmaSubcanvasNode::Table(_) => Err("Table nodes not supported".to_string())?,
            FigmaSubcanvasNode::WashiTape(_) => Err("Washi tape nodes not supported".to_string())?,
            FigmaSubcanvasNode::Widget(_) => Err("Widget nodes not supported".to_string())?,
            FigmaSubcanvasNode::TextPath(_) => Err("Text path nodes not supported".to_string())?,
            FigmaSubcanvasNode::TransformGroup(_) => {
                Err("Transform group nodes not supported".to_string())?
            }
        };

        Ok(self.repository.insert(grid_node))
    }

    pub fn convert_document(&mut self, document: &Box<DocumentNode>) -> Result<Vec<Scene>, String> {
        document
            .children
            .iter()
            .map(|canvas| self.convert_canvas(canvas))
            .collect::<Result<Vec<_>, _>>()
    }

    fn convert_canvas(&mut self, canvas: &CanvasNode) -> Result<Scene, String> {
        let children = canvas
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Scene {
            id: canvas.id.clone(),
            name: canvas.name.clone(),
            transform: AffineTransform::identity(),
            children,
            nodes: self.repository.clone(),
        })
    }

    fn convert_frame(&mut self, frame: &Box<FrameNode>) -> Result<Node, String> {
        let children = frame
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        let size = Self::convert_size(frame.size.as_ref());
        let transform = Self::convert_transform(frame.relative_transform.as_ref());

        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: frame.id.clone(),
                name: frame.name.clone(),
                active: frame.visible.unwrap_or(true),
            },
            blend_mode: Self::convert_blend_mode(frame.blend_mode),
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                frame.corner_radius,
                frame.rectangle_corner_radii.as_ref(),
            ),
            fill: self
                .convert_fills(Some(&frame.fills.as_ref()))
                .unwrap_or(TRANSPARENT),
            stroke: self.convert_strokes(Some(&frame.strokes)),
            stroke_width: frame.stroke_weight.unwrap_or(0.0) as f32,
            stroke_align: Self::convert_stroke_align(
                frame
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: frame
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            effect: Self::convert_effects(Some(&frame.effects)),
            children,
            opacity: Self::convert_opacity(frame.visible),
            clip: frame.clips_content,
        }))
    }

    /// Convert Figma's blend mode to our BlendMode
    fn convert_blend_mode(blend_mode: figma_api::models::BlendMode) -> BlendMode {
        match blend_mode {
            figma_api::models::BlendMode::Normal => BlendMode::Normal,
            figma_api::models::BlendMode::Multiply => BlendMode::Multiply,
            figma_api::models::BlendMode::Screen => BlendMode::Screen,
            figma_api::models::BlendMode::Overlay => BlendMode::Overlay,
            figma_api::models::BlendMode::Darken => BlendMode::Darken,
            figma_api::models::BlendMode::Lighten => BlendMode::Lighten,
            figma_api::models::BlendMode::ColorDodge => BlendMode::ColorDodge,
            figma_api::models::BlendMode::ColorBurn => BlendMode::ColorBurn,
            figma_api::models::BlendMode::HardLight => BlendMode::HardLight,
            figma_api::models::BlendMode::SoftLight => BlendMode::SoftLight,
            figma_api::models::BlendMode::Difference => BlendMode::Difference,
            figma_api::models::BlendMode::Exclusion => BlendMode::Exclusion,
            figma_api::models::BlendMode::Hue => BlendMode::Hue,
            figma_api::models::BlendMode::Saturation => BlendMode::Saturation,
            figma_api::models::BlendMode::Color => BlendMode::Color,
            figma_api::models::BlendMode::Luminosity => BlendMode::Luminosity,
            figma_api::models::BlendMode::PassThrough => BlendMode::Normal,
            figma_api::models::BlendMode::LinearBurn => BlendMode::ColorBurn,
            figma_api::models::BlendMode::LinearDodge => BlendMode::ColorDodge,
        }
    }

    fn convert_text(&mut self, text: &Box<TextNode>) -> Result<Node, String> {
        let style = text.style.as_ref();

        Ok(Node::TextSpan(TextSpanNode {
            base: BaseNode {
                id: text.id.clone(),
                name: text.name.clone(),
                active: text.visible.unwrap_or(true),
            },
            transform: Self::convert_transform(text.relative_transform.as_ref()),
            size: Size {
                width: text.size.as_ref().map_or(0.0, |size| size.x as f32),
                height: text.size.as_ref().map_or(0.0, |size| size.y as f32),
            },
            text: text.characters.clone(),
            text_style: TextStyle {
                text_decoration: Self::convert_text_decoration(style.text_decoration.as_ref()),
                font_family: style
                    .font_family
                    .clone()
                    .unwrap_or_else(|| "Inter".to_string()),
                font_size: style.font_size.unwrap_or(14.0) as f32,
                font_weight: FontWeight::new(style.font_weight.unwrap_or(400.0) as u32),
                letter_spacing: style.letter_spacing.map(|v| v as f32),
                line_height: style.line_height_px.map(|v| v as f32),
                text_transform: match text.style.text_case.as_ref() {
                    Some(figma_api::models::type_style::TextCase::Upper) => {
                        TextTransform::Uppercase
                    }
                    Some(figma_api::models::type_style::TextCase::Lower) => {
                        TextTransform::Lowercase
                    }
                    Some(figma_api::models::type_style::TextCase::Title) => {
                        TextTransform::Capitalize
                    }
                    Some(figma_api::models::type_style::TextCase::SmallCaps) => TextTransform::None,
                    Some(figma_api::models::type_style::TextCase::SmallCapsForced) => {
                        TextTransform::None
                    }
                    None => TextTransform::None,
                },
            },
            text_align: Self::convert_text_align(style.text_align_horizontal.as_ref()),
            text_align_vertical: Self::convert_text_align_vertical(
                style.text_align_vertical.as_ref(),
            ),
            fill: self.convert_fills(style.fills.as_ref()).unwrap_or(BLACK),
            stroke: self.convert_strokes(Some(&text.strokes)),
            stroke_width: Some(text.stroke_weight.unwrap_or(0.0) as f32),
            stroke_align: StrokeAlign::Inside,
            opacity: Self::convert_opacity(text.visible),
            blend_mode: Self::convert_blend_mode(text.blend_mode),
        }))
    }

    fn convert_vector(&mut self, vector: &Box<VectorNode>) -> Result<Node, String> {
        let mut children = Vec::new();
        let mut path_index = 0;

        // Convert fill geometries to path nodes
        if let Some(fill_geometries) = &vector.fill_geometry {
            for geometry in fill_geometries {
                let path_node = Node::Path(PathNode {
                    base: BaseNode {
                        id: format!("{}-path-{}", vector.id, path_index),
                        name: format!("{}-path-{}", vector.name, path_index),
                        active: vector.visible.unwrap_or(true),
                    },
                    transform: AffineTransform::identity(),
                    fill: self
                        .convert_fills(Some(&vector.fills))
                        .unwrap_or(TRANSPARENT),
                    data: geometry.path.clone(),
                    stroke: Paint::Solid(SolidPaint {
                        color: Color(0, 0, 0, 0),
                        opacity: 0.0,
                    }),
                    stroke_width: 0.0,
                    stroke_align: StrokeAlign::Inside,
                    stroke_dash_array: None,
                    opacity: Self::convert_opacity(vector.visible),
                    blend_mode: Self::convert_blend_mode(vector.blend_mode),
                    effect: Self::convert_effects(Some(&vector.effects)),
                });
                children.push(self.repository.insert(path_node));
                path_index += 1;
            }
        }

        // Convert stroke geometries to path nodes
        // stroke paint should be applied to the path, not stroke, as the stroke geometry is the baked path of the stroke.
        if let Some(stroke_geometries) = &vector.stroke_geometry {
            for geometry in stroke_geometries {
                let path_node = Node::Path(PathNode {
                    base: BaseNode {
                        id: format!("{}-path-{}", vector.id, path_index),
                        name: format!("{}-path-{}", vector.name, path_index),
                        active: vector.visible.unwrap_or(true),
                    },
                    transform: AffineTransform::identity(),
                    fill: self
                        .convert_strokes(Some(&vector.strokes))
                        .unwrap_or(TRANSPARENT),
                    data: geometry.path.clone(),
                    stroke: TRANSPARENT,
                    stroke_width: 0.0,
                    stroke_align: StrokeAlign::Inside,
                    stroke_dash_array: None,
                    opacity: Self::convert_opacity(vector.visible),
                    blend_mode: Self::convert_blend_mode(vector.blend_mode),
                    effect: Self::convert_effects(Some(&vector.effects)),
                });
                children.push(self.repository.insert(path_node));
                path_index += 1;
            }
        }

        // Create a group node containing all the path nodes
        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: vector.id.clone(),
                name: vector.name.clone(),
                active: vector.visible.unwrap_or(true),
            },
            blend_mode: Self::convert_blend_mode(vector.blend_mode),
            transform: Self::convert_transform(vector.relative_transform.as_ref()),
            size: Self::convert_size(vector.size.as_ref()),
            corner_radius: RectangularCornerRadius::zero(),
            fill: TRANSPARENT,
            stroke: None,
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            effect: None,
            children,
            opacity: Self::convert_opacity(vector.visible),
            clip: false,
        }))
    }

    fn convert_boolean(&mut self, boolean: &Box<BooleanOperationNode>) -> Result<Node, String> {
        Ok(Node::Error(ErrorNode {
            base: BaseNode {
                id: boolean.id.clone(),
                name: format!("[Boolean] {}", boolean.name),
                active: boolean.visible.unwrap_or(true),
            },
            transform: Self::convert_transform(boolean.relative_transform.as_ref()),
            size: Self::convert_size(boolean.size.as_ref()),
            opacity: Self::convert_opacity(boolean.visible),
            error: format!("Unsupported node type: Boolean"),
        }))
    }

    fn convert_star(&mut self, star: &Box<StarNode>) -> Result<Node, String> {
        let size = Self::convert_size(star.size.as_ref());
        let transform = Self::convert_transform(star.relative_transform.as_ref());

        Ok(Node::RegularStarPolygon(RegularStarPolygonNode {
            base: BaseNode {
                id: star.id.clone(),
                name: star.name.clone(),
                active: star.visible.unwrap_or(true),
            },
            transform,
            size,
            point_count: 5,     // Default to 5 points for a star
            inner_radius: 0.4,  // Default inner radius to 0.4 (40% of outer radius)
            corner_radius: 0.0, // Figma stars don't have corner radius
            fill: self.convert_fills(Some(&star.fills)).unwrap_or(TRANSPARENT),
            stroke: self
                .convert_strokes(Some(&star.strokes))
                .unwrap_or(TRANSPARENT),
            stroke_width: star.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                star.stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: star
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(star.visible),
            blend_mode: Self::convert_blend_mode(star.blend_mode),
            effect: Self::convert_effects(Some(&star.effects)),
        }))
    }

    fn convert_line(&mut self, line: &Box<FigmaLineNode>) -> Result<Node, String> {
        let mut size = Self::convert_size(line.size.as_ref());
        size.height = 0.0; // Lines have no height in our schema
        let transform = Self::convert_transform(line.relative_transform.as_ref());

        Ok(Node::Line(LineNode {
            base: BaseNode {
                id: line.id.clone(),
                name: line.name.clone(),
                active: line.visible.unwrap_or(true),
            },
            transform,
            size,
            stroke: self
                .convert_strokes(Some(&line.strokes))
                .unwrap_or(TRANSPARENT),
            stroke_width: line.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                line.stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: line
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(line.visible),
            blend_mode: Self::convert_blend_mode(line.blend_mode),
        }))
    }

    fn convert_ellipse(
        &mut self,
        ellipse: &Box<figma_api::models::EllipseNode>,
    ) -> Result<Node, String> {
        let size = Self::convert_size(ellipse.size.as_ref());
        let transform =
            Self::convert_transform(ellipse.relative_transform.as_ref().map(|v| v.as_ref()));

        Ok(Node::Ellipse(crate::schema::EllipseNode {
            base: BaseNode {
                id: ellipse.id.clone(),
                name: ellipse.name.clone(),
                active: ellipse.visible.unwrap_or(true),
            },
            transform,
            size,
            fill: self
                .convert_fills(Some(&ellipse.fills))
                .unwrap_or(TRANSPARENT),
            stroke: self
                .convert_strokes(Some(&ellipse.strokes))
                .unwrap_or(TRANSPARENT),
            stroke_width: ellipse.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                ellipse
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: ellipse
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(ellipse.visible),
            blend_mode: Self::convert_blend_mode(ellipse.blend_mode),
            effect: Self::convert_effects(Some(&ellipse.effects)),
        }))
    }

    fn convert_regular_polygon(
        &mut self,
        polygon: &Box<FigmaRegularPolygonNode>,
    ) -> Result<Node, String> {
        let size = Self::convert_size(polygon.size.as_ref());
        let transform = Self::convert_transform(polygon.relative_transform.as_ref());
        Ok(Node::RegularPolygon(RegularPolygonNode {
            base: BaseNode {
                id: polygon.id.clone(),
                name: polygon.name.clone(),
                active: polygon.visible.unwrap_or(true),
            },
            transform,
            size,
            // No count in api ?
            point_count: 3,
            corner_radius: polygon.corner_radius.unwrap_or(0.0) as f32,
            fill: self
                .convert_fills(Some(&polygon.fills))
                .unwrap_or(TRANSPARENT),
            stroke: self
                .convert_strokes(Some(&polygon.strokes))
                .unwrap_or(TRANSPARENT),
            stroke_width: polygon.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                polygon
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: polygon
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(polygon.visible),
            blend_mode: Self::convert_blend_mode(polygon.blend_mode),
            effect: Self::convert_effects(Some(&polygon.effects)),
        }))
    }

    fn convert_rectangle(&mut self, rectangle: &Box<FigmaRectangleNode>) -> Result<Node, String> {
        let size = Self::convert_size(rectangle.size.as_ref());
        let transform = Self::convert_transform(rectangle.relative_transform.as_ref());

        Ok(Node::Rectangle(RectangleNode {
            base: BaseNode {
                id: rectangle.id.clone(),
                name: rectangle.name.clone(),
                active: rectangle.visible.unwrap_or(true),
            },
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                rectangle.corner_radius,
                rectangle.rectangle_corner_radii.as_ref(),
            ),
            fill: self
                .convert_fills(Some(&rectangle.fills))
                .unwrap_or(TRANSPARENT),
            stroke: self
                .convert_strokes(Some(&rectangle.strokes))
                .unwrap_or(TRANSPARENT),
            stroke_width: rectangle.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                rectangle
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: rectangle
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(rectangle.visible),
            blend_mode: Self::convert_blend_mode(rectangle.blend_mode),
            effect: Self::convert_effects(Some(&rectangle.effects)),
        }))
    }

    fn convert_group(&mut self, group: &Box<GroupNode>) -> Result<Node, String> {
        let children = group
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        let size = Self::convert_size(group.size.as_ref());
        let transform = Self::convert_transform(group.relative_transform.as_ref());

        Ok(Node::Container(ContainerNode {
            base: BaseNode {
                id: group.id.clone(),
                name: group.name.clone(),
                active: group.visible.unwrap_or(true),
            },
            blend_mode: Self::convert_blend_mode(group.blend_mode),
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                group.corner_radius,
                group.rectangle_corner_radii.as_ref(),
            ),
            fill: self.convert_fills(None).unwrap_or(TRANSPARENT),
            stroke: None,
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            effect: None,
            children,
            opacity: 1.0,
            clip: group.clips_content,
        }))
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
