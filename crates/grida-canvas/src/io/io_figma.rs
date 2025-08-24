use crate::cg::types::*;
use crate::helpers::webfont_helper;
use crate::node::repository::NodeRepository;
use crate::node::schema::*;
use figma_api::models::minimal_strokes_trait::StrokeAlign as FigmaStrokeAlign;
use figma_api::models::type_style::{
    TextAlignHorizontal as FigmaTextAlignHorizontal, TextAlignVertical as FigmaTextAlignVertical,
    TextDecoration as FigmaTextDecoration,
};
use figma_api::models::vector::Vector;
use figma_api::models::{
    BooleanOperationNode as FigmaBooleanOperationNode, CanvasNode, ComponentNode, ComponentSetNode,
    DocumentNode, Effect, FrameNode, GroupNode, InstanceNode, LineNode as FigmaLineNode,
    LinkUnfurlNode, Paint as FigmaPaint, RectangleNode as FigmaRectangleNode,
    RegularPolygonNode as FigmaRegularPolygonNode, Rgba, SectionNode, SliceNode, StarNode,
    SubcanvasNode as FigmaSubcanvasNode, TextNode, VectorNode,
};
use math2::box_fit::BoxFit;
use math2::transform::AffineTransform;

const TRANSPARENT: Paint = Paint::Solid(SolidPaint {
    color: CGColor(0, 0, 0, 0),
    opacity: 0.0,
});

const BLACK: Paint = Paint::Solid(SolidPaint {
    color: CGColor(0, 0, 0, 255),
    opacity: 1.0,
});

// Map implementations
impl From<&Rgba> for CGColor {
    fn from(color: &Rgba) -> Self {
        CGColor(
            (color.r * 255.0) as u8,
            (color.g * 255.0) as u8,
            (color.b * 255.0) as u8,
            (color.a * 255.0) as u8,
        )
    }
}

impl From<&Box<Rgba>> for CGColor {
    fn from(color: &Box<Rgba>) -> Self {
        CGColor(
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
                color: CGColor::from(&solid.color),
                opacity: solid.opacity.unwrap_or(1.0) as f32,
            }),
            FigmaPaint::ImagePaint(image) => {
                let transform =
                    image
                        .image_transform
                        .as_ref()
                        .map_or(AffineTransform::identity(), |t| AffineTransform {
                            matrix: [
                                [t[0][0] as f32, t[0][1] as f32, t[0][2] as f32],
                                [t[1][0] as f32, t[1][1] as f32, t[1][2] as f32],
                            ],
                        });

                let fit = if transform != AffineTransform::identity() {
                    BoxFit::None
                } else {
                    match image.scale_mode {
                        figma_api::models::image_paint::ScaleMode::Fill => BoxFit::Cover,
                        figma_api::models::image_paint::ScaleMode::Fit => BoxFit::Contain,
                        figma_api::models::image_paint::ScaleMode::Tile => BoxFit::None,
                        figma_api::models::image_paint::ScaleMode::Stretch => BoxFit::None,
                    }
                };

                Paint::Image(ImagePaint {
                    transform,
                    hash: image.image_ref.clone(),
                    fit,
                    opacity: image.opacity.unwrap_or(1.0) as f32,
                })
            }
            FigmaPaint::GradientPaint(gradient) => {
                let stops = gradient
                    .gradient_stops
                    .iter()
                    .map(|stop| GradientStop {
                        offset: stop.position as f32,
                        color: CGColor::from(&stop.color),
                    })
                    .collect();

                match gradient.r#type {
                    figma_api::models::gradient_paint::Type::GradientLinear => {
                        Paint::LinearGradient(LinearGradientPaint {
                            transform: convert_gradient_transform(
                                &gradient.gradient_handle_positions,
                            ),
                            stops,
                            opacity: gradient.opacity.unwrap_or(1.0) as f32,
                        })
                    }
                    figma_api::models::gradient_paint::Type::GradientRadial => {
                        Paint::RadialGradient(RadialGradientPaint {
                            transform: convert_gradient_transform(
                                &gradient.gradient_handle_positions,
                            ),
                            stops,
                            opacity: gradient.opacity.unwrap_or(1.0) as f32,
                        })
                    }
                    figma_api::models::gradient_paint::Type::GradientDiamond => {
                        Paint::DiamondGradient(DiamondGradientPaint {
                            transform: convert_gradient_transform(
                                &gradient.gradient_handle_positions,
                            ),
                            stops,
                            opacity: gradient.opacity.unwrap_or(1.0) as f32,
                        })
                    }
                    figma_api::models::gradient_paint::Type::GradientAngular => {
                        Paint::SweepGradient(SweepGradientPaint {
                            transform: convert_gradient_transform(
                                &gradient.gradient_handle_positions,
                            ),
                            stops,
                            opacity: gradient.opacity.unwrap_or(1.0) as f32,
                        })
                    }
                    _ => Paint::Solid(SolidPaint {
                        color: CGColor(0, 0, 0, 255),
                        opacity: 1.0,
                    }),
                }
            }
            _ => Paint::Solid(SolidPaint {
                color: CGColor(0, 0, 0, 255),
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

impl From<&FigmaTextDecoration> for TextDecorationLine {
    fn from(decoration: &FigmaTextDecoration) -> Self {
        match decoration {
            FigmaTextDecoration::None => TextDecorationLine::None,
            FigmaTextDecoration::Underline => TextDecorationLine::Underline,
            FigmaTextDecoration::Strikethrough => TextDecorationLine::LineThrough,
        }
    }
}

fn map_option<'a, T, U>(value: Option<&'a T>) -> Option<U>
where
    U: From<&'a T>,
{
    value.map(|v| U::from(v))
}

/// Convert Figma gradient handle positions into an AffineTransform.
///
/// Figma provides three handle positions in normalized coordinates. The first
/// handle represents the start of the gradient, the second the end, and the
/// third defines the width of the gradient. We convert these into a 2x3 affine
/// transform matrix.
fn convert_gradient_transform(handles: &Vec<Vector>) -> AffineTransform {
    if handles.len() == 3 {
        let start = &handles[0];
        let end = &handles[1];
        let width = &handles[2];

        AffineTransform {
            matrix: [
                [
                    (end.x - start.x) as f32,
                    (width.x - start.x) as f32,
                    start.x as f32,
                ],
                [
                    (end.y - start.y) as f32,
                    (width.y - start.y) as f32,
                    start.y as f32,
                ],
            ],
        }
    } else {
        AffineTransform::identity()
    }
}

/// Converts Figma nodes to Grida schema
pub struct FigmaConverter {
    repository: NodeRepository,
    image_urls: std::collections::HashMap<String, String>,
    font_store: webfont_helper::FontUsageStore,
}

impl FigmaConverter {
    pub fn new() -> Self {
        Self {
            repository: NodeRepository::new(),
            image_urls: std::collections::HashMap::new(),
            font_store: webfont_helper::FontUsageStore::new(),
        }
    }

    pub fn with_image_urls(mut self, urls: std::collections::HashMap<String, String>) -> Self {
        self.image_urls = urls;
        self
    }

    pub fn get_discovered_fonts(&self) -> Vec<webfont_helper::FontInfo> {
        self.font_store.get_discovered_fonts()
    }

    fn register_font(
        &mut self,
        family: String,
        postscript_name: Option<String>,
        style: Option<String>,
    ) {
        self.font_store
            .register_font(family, postscript_name, style);
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
    fn convert_color(color: &Rgba) -> CGColor {
        color.into()
    }

    /// Convert Figma's paint to our Paint
    fn convert_paint(&self, paint: &FigmaPaint) -> Paint {
        match paint {
            FigmaPaint::SolidPaint(solid) => Paint::Solid(SolidPaint {
                color: CGColor::from(&solid.color),
                opacity: solid.opacity.unwrap_or(1.0) as f32,
            }),
            FigmaPaint::ImagePaint(image) => {
                let url = self
                    .image_urls
                    .get(&image.image_ref)
                    .cloned()
                    .unwrap_or_else(|| image.image_ref.clone());
                let transform =
                    image
                        .image_transform
                        .as_ref()
                        .map_or(AffineTransform::identity(), |t| AffineTransform {
                            matrix: [
                                [t[0][0] as f32, t[0][1] as f32, t[0][2] as f32],
                                [t[1][0] as f32, t[1][1] as f32, t[1][2] as f32],
                            ],
                        });

                let fit = if transform != AffineTransform::identity() {
                    BoxFit::None
                } else {
                    match image.scale_mode {
                        figma_api::models::image_paint::ScaleMode::Fill => BoxFit::Cover,
                        figma_api::models::image_paint::ScaleMode::Fit => BoxFit::Contain,
                        figma_api::models::image_paint::ScaleMode::Tile => BoxFit::None,
                        figma_api::models::image_paint::ScaleMode::Stretch => BoxFit::None,
                    }
                };

                Paint::Image(ImagePaint {
                    transform,
                    hash: url,
                    fit,
                    opacity: image.opacity.unwrap_or(1.0) as f32,
                })
            }
            FigmaPaint::GradientPaint(gradient) => {
                let stops = gradient
                    .gradient_stops
                    .iter()
                    .map(|stop| GradientStop {
                        offset: stop.position as f32,
                        color: CGColor::from(&stop.color),
                    })
                    .collect();

                match gradient.r#type {
                    figma_api::models::gradient_paint::Type::GradientLinear => {
                        Paint::LinearGradient(LinearGradientPaint {
                            transform: convert_gradient_transform(
                                &gradient.gradient_handle_positions,
                            ),
                            stops,
                            opacity: gradient.opacity.unwrap_or(1.0) as f32,
                        })
                    }
                    figma_api::models::gradient_paint::Type::GradientRadial => {
                        Paint::RadialGradient(RadialGradientPaint {
                            transform: convert_gradient_transform(
                                &gradient.gradient_handle_positions,
                            ),
                            stops,
                            opacity: gradient.opacity.unwrap_or(1.0) as f32,
                        })
                    }
                    figma_api::models::gradient_paint::Type::GradientDiamond => {
                        Paint::DiamondGradient(DiamondGradientPaint {
                            transform: convert_gradient_transform(
                                &gradient.gradient_handle_positions,
                            ),
                            stops,
                            opacity: gradient.opacity.unwrap_or(1.0) as f32,
                        })
                    }
                    figma_api::models::gradient_paint::Type::GradientAngular => {
                        Paint::SweepGradient(SweepGradientPaint {
                            transform: convert_gradient_transform(
                                &gradient.gradient_handle_positions,
                            ),
                            stops,
                            opacity: gradient.opacity.unwrap_or(1.0) as f32,
                        })
                    }
                    _ => Paint::Solid(SolidPaint {
                        color: CGColor(0, 0, 0, 255),
                        opacity: 1.0,
                    }),
                }
            }
            _ => Paint::Solid(SolidPaint {
                color: CGColor(0, 0, 0, 255),
                opacity: 1.0,
            }),
        }
    }

    /// Convert Figma's fills to our Paint vector
    fn convert_fills(&self, fills: Option<&Vec<FigmaPaint>>) -> Vec<Paint> {
        fills.map_or(Vec::new(), |paints| {
            // Filter out invisible paints and convert visible ones
            paints
                .iter()
                .filter(|paint| match paint {
                    FigmaPaint::SolidPaint(solid) => solid.visible.unwrap_or(true),
                    FigmaPaint::GradientPaint(gradient) => gradient.visible.unwrap_or(true),
                    FigmaPaint::ImagePaint(image) => image.visible.unwrap_or(true),
                    _ => true,
                })
                .map(|paint| self.convert_paint(paint))
                .collect()
        })
    }

    /// Convert Figma's strokes to our Paint vector
    fn convert_strokes(&self, strokes: Option<&Option<Vec<FigmaPaint>>>) -> Vec<Paint> {
        strokes
            .and_then(|s| s.as_ref())
            .map_or(Vec::new(), |paints| {
                // Filter out invisible paints and convert visible ones
                paints
                    .iter()
                    .filter(|paint| match paint {
                        FigmaPaint::SolidPaint(solid) => solid.visible.unwrap_or(true),
                        FigmaPaint::GradientPaint(gradient) => gradient.visible.unwrap_or(true),
                        FigmaPaint::ImagePaint(image) => image.visible.unwrap_or(true),
                        _ => true,
                    })
                    .map(|paint| self.convert_paint(paint))
                    .collect()
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
    fn convert_text_decoration(decoration: Option<&FigmaTextDecoration>) -> TextDecorationLine {
        map_option(decoration).unwrap_or(TextDecorationLine::None)
    }

    /// Convert Figma's text alignment to our TextAlign
    fn convert_text_align(align: Option<&FigmaTextAlignHorizontal>) -> TextAlign {
        map_option(align).unwrap_or(TextAlign::Left)
    }

    /// Convert Figma's vertical text alignment to our TextAlignVertical
    fn convert_text_align_vertical(align: Option<&FigmaTextAlignVertical>) -> TextAlignVertical {
        map_option(align).unwrap_or(TextAlignVertical::Top)
    }

    /// Convert Figma's effects to our FilterEffect vector
    fn convert_effects(effects: &Vec<Effect>) -> LayerEffects {
        let mut layer_effects = LayerEffects::new_empty();

        // If no effects, return empty vector
        if effects.is_empty() {
            return layer_effects;
        }

        // shadows
        let shadows: Vec<FilterShadowEffect> = effects
            .iter()
            .filter_map(|effect| match effect {
                Effect::DropShadow(drop_shadow) => {
                    drop_shadow
                        .visible
                        .then_some(FilterShadowEffect::DropShadow(FeShadow {
                            dx: drop_shadow.offset.x as f32,
                            dy: drop_shadow.offset.y as f32,
                            blur: drop_shadow.radius as f32,
                            color: Self::convert_color(&drop_shadow.color),
                            spread: drop_shadow.spread.unwrap_or(0.0) as f32,
                        }))
                }
                Effect::InnerShadow(inner_shadow) => {
                    inner_shadow
                        .visible
                        .then_some(FilterShadowEffect::InnerShadow(FeShadow {
                            dx: inner_shadow.offset.x as f32,
                            dy: inner_shadow.offset.y as f32,
                            blur: inner_shadow.radius as f32,
                            color: Self::convert_color(&inner_shadow.color),
                            spread: inner_shadow.spread.unwrap_or(0.0) as f32,
                        }))
                }
                _ => None,
            })
            .collect();

        let layer_blur: Option<FeGaussianBlur> = effects.iter().find_map(|effect| match effect {
            Effect::LayerBlur(blur) => blur.visible.then_some(FeGaussianBlur {
                radius: blur.radius as f32,
            }),
            _ => None,
        });

        let backdrop_blur: Option<FeGaussianBlur> =
            effects.iter().find_map(|effect| match effect {
                Effect::BackgroundBlur(blur) => blur.visible.then_some(FeGaussianBlur {
                    radius: blur.radius as f32,
                }),
                _ => None,
            });

        layer_effects.shadows = shadows;
        layer_effects.blur = layer_blur;
        layer_effects.backdrop_blur = backdrop_blur;

        layer_effects
    }

    /// Convert Figma's slice to our SliceNode
    fn convert_slice(&mut self, slice: &Box<SliceNode>) -> Result<Node, String> {
        Ok(Node::Error(ErrorNodeRec {
            id: slice.id.clone(),
            name: Some(format!("[Slice] {}", slice.name)),
            active: slice.visible.unwrap_or(true),
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

        Ok(Node::Container(ContainerNodeRec {
            id: component.id.clone(),
            name: Some(component.name.clone()),
            active: component.visible.unwrap_or(true),
            blend_mode: Self::convert_blend_mode(component.blend_mode),
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                component.corner_radius,
                component.rectangle_corner_radii.as_ref(),
            ),
            fills: self.convert_fills(Some(&component.fills.as_ref())),
            strokes: self.convert_strokes(Some(&component.strokes)),
            stroke_width: component.stroke_weight.unwrap_or(0.0) as f32,
            stroke_align: Self::convert_stroke_align(
                component
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: component
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            effects: Self::convert_effects(&component.effects),
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
        Ok(Node::Error(ErrorNodeRec {
            id: component_set.id.clone(),
            name: Some(format!("[ComponentSet] {}", component_set.name)),
            active: component_set.visible.unwrap_or(true),
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
            RectangularCornerRadius::circular(radius as f32)
        } else if let Some(radii) = rectangle_corner_radii {
            // If rectangle_corner_radii is present, use individual values
            if radii.len() == 4 {
                RectangularCornerRadius {
                    tl: Radius::circular(radii[0] as f32),
                    tr: Radius::circular(radii[1] as f32),
                    br: Radius::circular(radii[2] as f32),
                    bl: Radius::circular(radii[3] as f32),
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

        Ok(Node::Container(ContainerNodeRec {
            id: instance.id.clone(),
            name: Some(instance.name.clone()),
            active: instance.visible.unwrap_or(true),
            blend_mode: Self::convert_blend_mode(instance.blend_mode),
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                instance.corner_radius,
                instance.rectangle_corner_radii.as_ref(),
            ),
            fills: self.convert_fills(Some(&instance.fills.as_ref())),
            strokes: self.convert_strokes(Some(&instance.strokes)),
            stroke_width: instance.stroke_weight.unwrap_or(0.0) as f32,
            stroke_align: Self::convert_stroke_align(
                instance
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: instance
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            effects: Self::convert_effects(&instance.effects),
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

        Ok(Node::Container(ContainerNodeRec {
            id: section.id.clone(),
            name: Some(format!("[Section] {}", section.name)),
            active: section.visible.unwrap_or(true),
            blend_mode: BlendMode::Normal,
            transform: Self::convert_transform(section.relative_transform.as_ref()),
            size: Self::convert_size(section.size.as_ref()),
            corner_radius: RectangularCornerRadius::zero(),
            children,
            fills: self.convert_fills(Some(&section.fills.as_ref())),
            strokes: vec![],
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            opacity: Self::convert_opacity(section.visible),
            effects: LayerEffects::new_empty(),
            clip: false,
        }))
    }

    /// Convert Figma's link to our LinkUnfurlNode
    fn convert_link(&mut self, link: &Box<LinkUnfurlNode>) -> Result<Node, String> {
        Ok(Node::Error(ErrorNodeRec {
            id: link.id.clone(),
            name: Some(format!("[Link] {}", link.name)),
            active: link.visible.unwrap_or(true),
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
            FigmaSubcanvasNode::BooleanOperation(boolean) => {
                self.convert_boolean_operation(boolean)?
            }
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
        // canvas.background_color
        Ok(Scene {
            id: canvas.id.clone(),
            name: canvas.name.clone(),
            children,
            nodes: self.repository.clone(),
            background_color: Some(CGColor::from(&canvas.background_color)),
        })
    }

    fn convert_frame(&mut self, origin: &Box<FrameNode>) -> Result<Node, String> {
        let children = origin
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        let size = Self::convert_size(origin.size.as_ref());
        let transform = Self::convert_transform(origin.relative_transform.as_ref());

        Ok(Node::Container(ContainerNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                origin.corner_radius,
                origin.rectangle_corner_radii.as_ref(),
            ),
            fills: self.convert_fills(Some(&origin.fills.as_ref())),
            strokes: self.convert_strokes(Some(&origin.strokes)),
            stroke_width: origin.stroke_weight.unwrap_or(0.0) as f32,
            stroke_align: Self::convert_stroke_align(
                origin
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: origin
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            effects: Self::convert_effects(&origin.effects),
            children,
            opacity: Self::convert_opacity(origin.visible),
            clip: origin.clips_content,
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

    fn convert_text(&mut self, origin: &Box<TextNode>) -> Result<Node, String> {
        let style = origin.style.as_ref();

        // Register the font family and postscript name if they exist
        if let Some(font_family) = &style.font_family {
            self.register_font(
                font_family.clone(),
                style.font_post_script_name.clone(),
                style.font_style.clone(),
            );
        }

        Ok(Node::TextSpan(TextSpanNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            transform: Self::convert_transform(origin.relative_transform.as_ref()),
            width: origin
                .size
                .as_ref()
                .map_or(None, |size| Some(size.x as f32)),
            max_lines: None,
            ellipsis: None,
            // size: Size {
            //     width: origin.size.as_ref().map_or(0.0, |size| size.x as f32),
            //     height: origin.size.as_ref().map_or(0.0, |size| size.y as f32),
            // },
            text: origin.characters.clone(),
            text_style: TextStyleRec {
                text_decoration_line: Self::convert_text_decoration(style.text_decoration.as_ref()),
                text_decoration_color: None,
                text_decoration_style: None,
                text_decoration_skip_ink: None,
                text_decoration_thinkness: None,
                font_family: style
                    .font_family
                    .clone()
                    .unwrap_or_else(|| "Inter".to_string()),
                font_size: style.font_size.unwrap_or(14.0) as f32,
                font_weight: FontWeight::new(style.font_weight.unwrap_or(400.0) as u32),
                letter_spacing: style.letter_spacing.map(|v| v as f32),
                italic: style.italic.unwrap_or(false),
                line_height: style.line_height_px.map(|v| v as f32),
                text_transform: match origin.style.text_case.as_ref() {
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
            fill: self
                .convert_fills(Some(&origin.fills))
                .first()
                .cloned()
                .unwrap_or(BLACK),
            stroke: self.convert_strokes(Some(&origin.strokes)).first().cloned(),
            stroke_width: Some(origin.stroke_weight.unwrap_or(0.0) as f32),
            stroke_align: StrokeAlign::Inside,
            opacity: Self::convert_opacity(origin.visible),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
            effects: Self::convert_effects(&origin.effects),
        }))
    }

    fn convert_vector(&mut self, origin: &Box<VectorNode>) -> Result<Node, String> {
        let mut children = Vec::new();
        let mut path_index = 0;

        // Convert fill geometries to path nodes
        if let Some(fill_geometries) = &origin.fill_geometry {
            for geometry in fill_geometries {
                let path_node = Node::SVGPath(SVGPathNodeRec {
                    id: format!("{}-path-{}", origin.id, path_index),
                    name: Some(format!("{}-path-{}", origin.name, path_index)),
                    active: origin.visible.unwrap_or(true),
                    transform: AffineTransform::identity(),
                    fill: self
                        .convert_fills(Some(&origin.fills))
                        .first()
                        .cloned()
                        .unwrap_or(TRANSPARENT),
                    data: geometry.path.clone(),
                    stroke: None,
                    stroke_width: 0.0,
                    stroke_align: StrokeAlign::Inside,
                    stroke_dash_array: None,
                    opacity: Self::convert_opacity(origin.visible),
                    blend_mode: Self::convert_blend_mode(origin.blend_mode),
                    effects: Self::convert_effects(&origin.effects),
                });
                children.push(self.repository.insert(path_node));
                path_index += 1;
            }
        }

        // Convert stroke geometries to path nodes
        // stroke paint should be applied to the path, not stroke, as the stroke geometry is the baked path of the stroke.
        if let Some(stroke_geometries) = &origin.stroke_geometry {
            for geometry in stroke_geometries {
                let path_node = Node::SVGPath(SVGPathNodeRec {
                    id: format!("{}-path-{}", origin.id, path_index),
                    name: Some(format!("{}-path-{}", origin.name, path_index)),
                    active: origin.visible.unwrap_or(true),
                    transform: AffineTransform::identity(),
                    fill: self
                        .convert_strokes(Some(&origin.strokes))
                        .first()
                        .cloned()
                        .unwrap_or(TRANSPARENT),
                    data: geometry.path.clone(),
                    stroke: None,
                    stroke_width: 0.0,
                    stroke_align: StrokeAlign::Inside,
                    stroke_dash_array: None,
                    opacity: Self::convert_opacity(origin.visible),
                    blend_mode: Self::convert_blend_mode(origin.blend_mode),
                    effects: Self::convert_effects(&origin.effects),
                });
                children.push(self.repository.insert(path_node));
                path_index += 1;
            }
        }

        // Create a group node containing all the path nodes
        Ok(Node::Container(ContainerNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
            transform: Self::convert_transform(origin.relative_transform.as_ref()),
            size: Self::convert_size(origin.size.as_ref()),
            corner_radius: RectangularCornerRadius::zero(),
            fills: vec![TRANSPARENT],
            strokes: vec![],
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Inside,
            stroke_dash_array: None,
            effects: LayerEffects::new_empty(),
            children,
            opacity: Self::convert_opacity(origin.visible),
            clip: false,
        }))
    }

    fn convert_boolean_operation(
        &mut self,
        origin: &Box<FigmaBooleanOperationNode>,
    ) -> Result<Node, String> {
        let children = origin
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        let transform = Self::convert_transform(origin.relative_transform.as_ref());

        let op = match origin.boolean_operation {
            figma_api::models::boolean_operation_node::BooleanOperation::Union => {
                BooleanPathOperation::Union
            }
            figma_api::models::boolean_operation_node::BooleanOperation::Intersect => {
                BooleanPathOperation::Intersection
            }
            figma_api::models::boolean_operation_node::BooleanOperation::Subtract => {
                BooleanPathOperation::Difference
            }
            figma_api::models::boolean_operation_node::BooleanOperation::Exclude => {
                BooleanPathOperation::Xor
            }
        };

        Ok(Node::BooleanOperation(BooleanPathOperationNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            transform: Some(transform),
            op: op,
            children,
            // map this
            corner_radius: None,
            fill: self
                .convert_fills(Some(&origin.fills))
                .first()
                .cloned()
                .unwrap_or(TRANSPARENT),
            stroke: self.convert_strokes(Some(&origin.strokes)).first().cloned(),
            stroke_width: origin.stroke_weight.unwrap_or(0.0) as f32,
            stroke_align: Self::convert_stroke_align(
                origin
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: origin
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            effects: Self::convert_effects(&origin.effects),
            opacity: Self::convert_opacity(origin.visible),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
        }))
    }

    fn convert_star(&mut self, origin: &Box<StarNode>) -> Result<Node, String> {
        let size = Self::convert_size(origin.size.as_ref());
        let transform = Self::convert_transform(origin.relative_transform.as_ref());

        Ok(Node::RegularStarPolygon(RegularStarPolygonNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            transform,
            size,
            // not available in api?
            point_count: 5,     // Default to 5 points for a star
            inner_radius: 0.4,  // Default inner radius to 0.4 (40% of outer radius)
            corner_radius: 0.0, // Figma stars don't have corner radius
            fills: self.convert_fills(Some(&origin.fills)),
            strokes: self.convert_strokes(Some(&origin.strokes)),
            stroke_width: origin.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                origin
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: origin
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(origin.visible),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
            effects: Self::convert_effects(&origin.effects),
        }))
    }

    fn convert_line(&mut self, origin: &Box<FigmaLineNode>) -> Result<Node, String> {
        let mut size = Self::convert_size(origin.size.as_ref());
        size.height = 0.0; // Lines have no height in our schema
        let transform = Self::convert_transform(origin.relative_transform.as_ref());

        Ok(Node::Line(LineNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            transform,
            size,
            strokes: self
                .convert_strokes(Some(&origin.strokes))
                .into_iter()
                .collect(),
            stroke_width: origin.stroke_weight.unwrap_or(1.0) as f32,
            _data_stroke_align: Self::convert_stroke_align(
                origin
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: origin
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(origin.visible),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
            effects: Self::convert_effects(&origin.effects),
        }))
    }

    fn convert_ellipse(
        &mut self,
        origin: &Box<figma_api::models::EllipseNode>,
    ) -> Result<Node, String> {
        let size = Self::convert_size(origin.size.as_ref());
        let transform =
            Self::convert_transform(origin.relative_transform.as_ref().map(|v| v.as_ref()));

        Ok(Node::Ellipse(EllipseNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            transform,
            size,
            fills: self.convert_fills(Some(&origin.fills)),
            strokes: self.convert_strokes(Some(&origin.strokes)),
            stroke_width: origin.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                origin
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: origin
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(origin.visible),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
            effects: Self::convert_effects(&origin.effects),

            // arc data
            inner_radius: Some(origin.arc_data.inner_radius as f32),
            angle: Some(
                (origin.arc_data.ending_angle - origin.arc_data.starting_angle).to_degrees() as f32,
            ),
            start_angle: origin.arc_data.starting_angle.to_degrees() as f32,
            corner_radius: None,
        }))
    }

    fn convert_regular_polygon(
        &mut self,
        origin: &Box<FigmaRegularPolygonNode>,
    ) -> Result<Node, String> {
        let size = Self::convert_size(origin.size.as_ref());
        let transform = Self::convert_transform(origin.relative_transform.as_ref());
        Ok(Node::RegularPolygon(RegularPolygonNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            transform,
            size,
            // No count in api ?
            point_count: 3,
            corner_radius: origin.corner_radius.unwrap_or(0.0) as f32,
            fills: self.convert_fills(Some(&origin.fills)),
            strokes: self.convert_strokes(Some(&origin.strokes)),
            stroke_width: origin.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                origin
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: origin
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(origin.visible),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
            effects: Self::convert_effects(&origin.effects),
        }))
    }

    fn convert_rectangle(&mut self, origin: &Box<FigmaRectangleNode>) -> Result<Node, String> {
        let size = Self::convert_size(origin.size.as_ref());
        let transform = Self::convert_transform(origin.relative_transform.as_ref());

        Ok(Node::Rectangle(RectangleNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            transform,
            size,
            corner_radius: Self::convert_corner_radius(
                origin.corner_radius,
                origin.rectangle_corner_radii.as_ref(),
            ),
            fills: self.convert_fills(Some(&origin.fills)),
            strokes: self.convert_strokes(Some(&origin.strokes)),
            stroke_width: origin.stroke_weight.unwrap_or(1.0) as f32,
            stroke_align: Self::convert_stroke_align(
                origin
                    .stroke_align
                    .as_ref()
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_else(|| "CENTER".to_string()),
            ),
            stroke_dash_array: origin
                .stroke_dashes
                .clone()
                .map(|v| v.into_iter().map(|x| x as f32).collect()),
            opacity: Self::convert_opacity(origin.visible),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
            effects: Self::convert_effects(&origin.effects),
        }))
    }

    fn convert_group(&mut self, origin: &Box<GroupNode>) -> Result<Node, String> {
        let children = origin
            .children
            .iter()
            .map(|child| self.convert_sub_canvas_node(child))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Node::Group(GroupNodeRec {
            id: origin.id.clone(),
            name: Some(origin.name.clone()),
            active: origin.visible.unwrap_or(true),
            // the figma's relativeTransform for group is a no-op on our model.
            transform: None,
            children,
            opacity: Self::convert_opacity(origin.visible),
            blend_mode: Self::convert_blend_mode(origin.blend_mode),
        }))
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_convert_node() {
        // TODO: Add tests
    }
}
