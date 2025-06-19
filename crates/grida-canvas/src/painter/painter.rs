use super::cvt;
use super::geometry::*;
use super::layer::{LayerList, PainterPictureLayer};
use crate::node::repository::NodeRepository;
use crate::node::schema::*;
use crate::repository::{FontRepository, ImageRepository};
use math2::transform::AffineTransform;
use skia_safe::{Paint as SkPaint, Point, canvas::SaveLayerRec, textlayout};
use std::cell::RefCell;
use std::rc::Rc;

/// A painter that handles all drawing operations for nodes,
/// with proper effect ordering and a layer‐blur/backdrop‐blur pipeline.
pub struct Painter<'a> {
    canvas: &'a skia_safe::Canvas,
    fonts: Rc<RefCell<FontRepository>>,
    images: Rc<RefCell<ImageRepository>>,
}

impl<'a> Painter<'a> {
    /// Create a new Painter for the given canvas
    pub fn new(
        canvas: &'a skia_safe::Canvas,
        fonts: Rc<RefCell<FontRepository>>,
        images: Rc<RefCell<ImageRepository>>,
    ) -> Self {
        Self {
            canvas,
            fonts,
            images,
        }
    }

    // ============================
    // === Helper Methods ========
    // ============================

    /// Save/restore transform state and apply a 2×3 matrix
    fn with_transform<F: FnOnce()>(&self, transform: &[[f32; 3]; 2], f: F) {
        let canvas = self.canvas;
        canvas.save();
        canvas.concat(&cvt::sk_matrix(*transform));
        f();
        canvas.restore();
    }

    /// If opacity < 1.0, wrap drawing in a save_layer_alpha; else draw directly.
    fn with_opacity<F: FnOnce()>(&self, opacity: f32, f: F) {
        let canvas = self.canvas;
        if opacity < 1.0 {
            canvas.save_layer_alpha(None, (opacity * 255.0) as u32);
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    /// If blend mode is not Normal, wrap drawing in a save_layer with blend mode; else draw directly.
    fn with_blendmode<F: FnOnce()>(&self, blend_mode: BlendMode, f: F) {
        let canvas = self.canvas;
        if blend_mode != BlendMode::Normal {
            let mut paint = SkPaint::default();
            paint.set_blend_mode(blend_mode.into());
            canvas.save_layer(&SaveLayerRec::default().paint(&paint));
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    /// Helper method to apply clipping to a region with optional corner radius
    fn with_clip<F: FnOnce()>(&self, shape: &PainterShape, f: F) {
        let canvas = self.canvas;
        canvas.save();

        // Try to use the most efficient clipping method based on shape type
        if let Some(rect) = shape.rect_shape {
            // Simple rectangle - use clip_rect (fastest)
            canvas.clip_rect(rect, None, true);
        } else if let Some(rrect) = &shape.rrect {
            // Rounded rectangle - use clip_rrect (faster than path)
            canvas.clip_rrect(rrect, None, true);
        } else {
            // Complex shape - fall back to path clipping
            canvas.clip_path(&shape.to_path(), None, true);
        }

        f();
        canvas.restore();
    }

    /// Wrap a closure `f` in a layer that applies a Gaussian blur to everything drawn inside.
    fn with_layer_blur<F: FnOnce()>(&self, radius: f32, f: F) {
        let canvas = self.canvas;
        let image_filter = skia_safe::image_filters::blur((radius, radius), None, None, None);
        let mut paint = SkPaint::default();
        paint.set_image_filter(image_filter);
        canvas.save_layer(&SaveLayerRec::default().paint(&paint));
        f();
        canvas.restore();
    }

    /// Draw a drop shadow behind the content using a shape.
    fn draw_shadow(&self, shape: &PainterShape, shadow: &FeDropShadow) {
        let canvas = self.canvas;
        let Color(r, g, b, a) = shadow.color;
        let color = skia_safe::Color::from_argb(a, r, g, b);

        // Create drop shadow filter
        let image_filter = skia_safe::image_filters::drop_shadow(
            (shadow.dx, shadow.dy),     // offset as tuple
            (shadow.blur, shadow.blur), // sigma as tuple
            color,                      // color
            None,                       // color_space
            None,                       // input
            None,                       // crop_rect
        );

        // Create paint with the drop shadow filter
        let mut shadow_paint = SkPaint::default();
        shadow_paint.set_image_filter(image_filter);
        shadow_paint.set_anti_alias(true);

        // Draw the shadow using the shape's path
        canvas.draw_path(&shape.to_path(), &shadow_paint);
    }

    /// Draw a backdrop blur: blur what's behind the shape.
    fn draw_backdrop_blur(&self, shape: &PainterShape, blur: &FeBackdropBlur) {
        let canvas = self.canvas;
        // 1) Build a Gaussian‐blur filter for the backdrop
        let image_filter =
            skia_safe::image_filters::blur((blur.radius, blur.radius), None, None, None).unwrap();

        // 2) Clip to the shape
        canvas.save();
        canvas.clip_path(&shape.to_path(), None, true);

        // 3) Use a SaveLayerRec with a backdrop filter so that everything behind is blurred
        let layer_rec = SaveLayerRec::default().backdrop(&image_filter);
        canvas.save_layer(&layer_rec);

        // We don't draw any content here—just pushing and popping the layer
        canvas.restore(); // pop the SaveLayer
        canvas.restore(); // pop the clip
    }

    /// Draw fill for a shape using given paint.
    fn draw_fill(&self, shape: &PainterShape, fill: &Paint) {
        let canvas = self.canvas;
        let (fill_paint, image) = match fill {
            Paint::Image(image_paint) => {
                let images = self.images.borrow();
                if let Some(image) = images.get(&image_paint._ref) {
                    let mut paint = SkPaint::default();
                    paint.set_anti_alias(true);
                    (paint, Some(image.clone()))
                } else {
                    // Image not ready - skip fill
                    return;
                }
            }
            _ => (
                cvt::sk_paint(fill, 1.0, (shape.rect.width(), shape.rect.height())),
                None,
            ),
        };

        if let Some(image) = image {
            // For image fills, we need to clip to the shape's path
            canvas.save();
            canvas.clip_path(&shape.to_path(), None, true);
            canvas.draw_image_rect(image, None, shape.rect, &fill_paint);
            canvas.restore();
        } else {
            // For regular fills, draw the shape directly
            canvas.draw_path(&shape.to_path(), &fill_paint);
        }
    }

    /// Draw stroke for a shape using given paint.
    fn draw_stroke(
        &self,
        shape: &PainterShape,
        stroke: &Paint,
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_dash_array: Option<&Vec<f32>>,
    ) {
        if stroke_width <= 0.0 {
            return;
        }

        // Generate the stroke geometry
        let stroke_path = stroke_geometry(
            &shape.to_path(),
            stroke_width,
            stroke_align,
            stroke_dash_array,
        );

        self.draw_stroke_path(shape, stroke, &stroke_path);
    }

    /// Draw stroke for a shape using a precomputed stroke path.
    fn draw_stroke_path(
        &self,
        shape: &PainterShape,
        stroke: &Paint,
        stroke_path: &skia_safe::Path,
    ) {
        let canvas = self.canvas;

        // Draw the stroke using the generated geometry
        match stroke {
            Paint::Image(image_paint) => {
                let images = self.images.borrow();
                if let Some(image) = images.get(&image_paint._ref) {
                    let mut paint = SkPaint::default();
                    paint.set_anti_alias(true);

                    // For image strokes, we need to clip to the stroke geometry
                    canvas.save();
                    canvas.clip_path(&stroke_path, None, true);
                    canvas.draw_image_rect(image, None, shape.rect, &paint);
                    canvas.restore();
                }
            }
            _ => {
                let paint = cvt::sk_paint(stroke, 1.0, (shape.rect.width(), shape.rect.height()));
                canvas.draw_path(&stroke_path, &paint);
            }
        }
    }

    /// Shared utility to handle effect drawing for shapes
    fn draw_shape_with_effect<F: Fn()>(
        &self,
        effect: Option<&FilterEffect>,
        shape: &PainterShape,
        draw_content: F,
    ) {
        match effect {
            Some(FilterEffect::DropShadow(shadow)) => {
                self.draw_shadow(shape, shadow);
                draw_content();
            }
            Some(FilterEffect::BackdropBlur(blur)) => {
                self.draw_backdrop_blur(shape, blur);
                draw_content();
            }
            Some(FilterEffect::GaussianBlur(blur)) => {
                self.with_layer_blur(blur.radius, draw_content);
            }
            None => {
                draw_content();
            }
        }
    }

    // ============================
    // === Node Drawing Methods ===
    // ============================

    /// Draw a RectangleNode, respecting its transform, effect, fill, stroke, blend mode, opacity
    fn draw_rect_node(&self, node: &RectangleNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Rectangle(node.clone()));
            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill(&shape, &node.fill);
                        self.draw_stroke(
                            &shape,
                            &node.stroke,
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw an ImageNode, respecting transform, effect, rounded corners, blend mode, opacity
    fn draw_image_node(&self, node: &ImageNode) -> bool {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Image(node.clone()));

            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        // convert the image itself to a paint
                        let image_paint = Paint::Image(ImagePaint {
                            _ref: node._ref.clone(),
                            opacity: node.opacity,
                            transform: AffineTransform::identity(),
                            fit: math2::box_fit::BoxFit::Cover,
                        });

                        self.draw_fill(&shape, &image_paint);
                        self.draw_stroke(
                            &shape,
                            &node.stroke,
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
        true
    }

    /// Draw an EllipseNode
    fn draw_ellipse_node(&self, node: &EllipseNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Ellipse(node.clone()));
            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill(&shape, &node.fill);
                        self.draw_stroke(
                            &shape,
                            &node.stroke,
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw a LineNode
    fn draw_line_node(&self, node: &LineNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Line(node.clone()));

            self.with_opacity(node.opacity, || {
                self.with_blendmode(node.blend_mode, || {
                    let paint = cvt::sk_paint(&node.stroke, node.opacity, (node.size.width, 0.0));
                    let stroke_path = stroke_geometry(
                        &shape.to_path(),
                        node.stroke_width,
                        node.stroke_align,
                        node.stroke_dash_array.as_ref(),
                    );
                    self.canvas.draw_path(&stroke_path, &paint);
                });
            });
        });
    }

    /// Draw a PathNode (SVG path data)
    fn draw_path_node(&self, node: &PathNode) {
        self.with_transform(&node.transform.matrix, || {
            let path = skia_safe::path::Path::from_svg(&node.data).expect("invalid SVG path");
            let shape = PainterShape::from_path(path.clone());
            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill(&shape, &node.fill);
                        self.draw_stroke(
                            &shape,
                            &node.stroke,
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw a PolygonNode (arbitrary polygon with optional corner radius)
    fn draw_polygon_node(&self, node: &PolygonNode) {
        self.with_transform(&node.transform.matrix, || {
            let path = node.to_path();
            let shape = PainterShape::from_path(path.clone());
            self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill(&shape, &node.fill);
                        self.draw_stroke(
                            &shape,
                            &node.stroke,
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw a RegularPolygonNode by converting to a PolygonNode
    fn draw_regular_polygon_node(&self, node: &RegularPolygonNode) {
        let polygon = node.to_polygon();
        self.draw_polygon_node(&polygon);
    }

    /// Draw a RegularStarPolygonNode by converting to a PolygonNode
    fn draw_regular_star_polygon_node(&self, node: &RegularStarPolygonNode) {
        let polygon = node.to_polygon();
        self.draw_polygon_node(&polygon);
    }

    fn draw_text_span(
        &self,
        text: &str,
        size: &Size,
        fill: &Paint,
        text_align: &TextAlign,
        _text_align_vertical: &TextAlignVertical,
        text_style: &TextStyle,
    ) {
        // Prepare paint for fill
        let fill_paint = cvt::sk_paint(&fill, 1.0, (size.width, size.height));

        // Build paragraph style
        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(text_align.clone().into());

        let fonts = self.fonts.borrow();
        let mut para_builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, &fonts.font_collection());

        // Build text style
        let mut ts = make_textstyle(&text_style);
        ts.set_foreground_paint(&fill_paint);

        para_builder.push_style(&ts);
        // Apply text transform before adding text
        let transformed_text =
            crate::text::text_transform::transform_text(&text, text_style.text_transform);
        para_builder.add_text(&transformed_text);
        let mut paragraph = para_builder.build();
        para_builder.pop();
        paragraph.layout(size.width);

        paragraph.paint(self.canvas, Point::new(0.0, 0.0));
    }

    /// Draw a TextSpanNode (simple text block)
    fn draw_text_span_node(&self, node: &TextSpanNode) {
        self.with_transform(&node.transform.matrix, || {
            self.with_opacity(node.opacity, || {
                self.with_blendmode(node.blend_mode, || {
                    self.draw_text_span(
                        &node.text,
                        &node.size,
                        &node.fill,
                        &node.text_align,
                        &node.text_align_vertical,
                        &node.text_style,
                    );
                });
            });
        });

        // // Prepare paint for fill
        // let mut fill_paint = cvt::sk_paint(
        //     &node.fill,
        //     node.opacity,
        //     (node.size.width, node.size.height),
        // );
        // fill_paint.set_blend_mode(node.blend_mode.into());

        // // Build paragraph style
        // let mut paragraph_style = ParagraphStyle::new();
        // paragraph_style.set_text_direction(TextDirection::LTR);
        // paragraph_style.set_text_align(node.text_align.into());

        // let fonts = self.fonts.borrow();
        // let mut para_builder = ParagraphBuilder::new(&paragraph_style, &fonts.font_collection());

        // // Build text style
        // let mut ts = make_textstyle(&node.text_style);
        // ts.set_foreground_paint(&fill_paint);

        // para_builder.push_style(&ts);
        // // Apply text transform before adding text
        // let transformed_text =
        //     crate::text::text_transform::transform_text(&node.text, node.text_style.text_transform);
        // para_builder.add_text(&transformed_text);
        // let mut paragraph = para_builder.build();
        // para_builder.pop();
        // paragraph.layout(node.size.width);

        // self.with_transform(&node.transform.matrix, || {
        //     paragraph.paint(self.canvas, Point::new(0.0, 0.0));
        // });
    }

    /// Draw a ContainerNode (background + stroke + children)
    fn draw_container_node_recursively(&self, node: &ContainerNode, repository: &NodeRepository) {
        self.with_transform(&node.transform.matrix, || {
            self.with_opacity(node.opacity, || {
                let shape = build_shape(&IntrinsicSizeNode::Container(node.clone()));

                // Draw effects first (if any) - these won't be clipped
                self.draw_shape_with_effect(node.effect.as_ref(), &shape, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fill(&shape, &node.fill);
                        if let Some(stroke) = &node.stroke {
                            self.draw_stroke(
                                &shape,
                                stroke,
                                node.stroke_width,
                                node.stroke_align,
                                node.stroke_dash_array.as_ref(),
                            );
                        }
                    });
                });

                // Draw children with clipping if enabled
                if node.clip {
                    self.with_clip(&shape, || {
                        for child_id in &node.children {
                            if let Some(child) = repository.get(child_id) {
                                self.draw_node_recursively(child, repository);
                            }
                        }
                    });
                } else {
                    // Draw children without clipping
                    for child_id in &node.children {
                        if let Some(child) = repository.get(child_id) {
                            self.draw_node_recursively(child, repository);
                        }
                    }
                }
            });
        });
    }

    fn draw_error_node(&self, node: &ErrorNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Error(node.clone()));

            // Create a red fill paint
            let fill = Paint::Solid(SolidPaint {
                color: Color(255, 0, 0, 51), // Semi-transparent red
                opacity: 1.0,
            });
            let stroke = Paint::Solid(SolidPaint {
                color: Color(255, 0, 0, 255), // Solid red
                opacity: 1.0,
            });

            self.with_opacity(node.opacity, || {
                self.draw_fill(&shape, &fill);
                self.draw_stroke(&shape, &stroke, 1.0, StrokeAlign::Inside, None);
            });
        });
    }

    /// Draw a GroupNode: no shape of its own, only children, but apply transform + opacity
    fn draw_group_node_recursively(&self, node: &GroupNode, repository: &NodeRepository) {
        self.with_transform(&node.transform.matrix, || {
            self.with_opacity(node.opacity, || {
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node_recursively(child, repository);
                    }
                }
            });
        });
    }

    #[deprecated(note = "Boolean operations are not implemented properly")]
    fn draw_boolean_operation_node_recursively(
        &self,
        node: &BooleanPathOperationNode,
        repository: &NodeRepository,
    ) {
        self.with_transform(&node.transform.matrix, || {
            for child_id in &node.children {
                if let Some(child) = repository.get(child_id) {
                    self.draw_node_recursively(child, repository);
                }
            }
        });
    }

    pub fn draw_node(&self, node: &LeafNode) {
        match node {
            LeafNode::Error(n) => self.draw_error_node(n),
            LeafNode::Rectangle(n) => self.draw_rect_node(n),
            LeafNode::Ellipse(n) => self.draw_ellipse_node(n),
            LeafNode::Polygon(n) => self.draw_polygon_node(n),
            LeafNode::RegularPolygon(n) => self.draw_regular_polygon_node(n),
            LeafNode::TextSpan(n) => self.draw_text_span_node(n),
            LeafNode::Line(n) => self.draw_line_node(n),
            LeafNode::Image(n) => {
                self.draw_image_node(n);
            }
            LeafNode::Path(n) => self.draw_path_node(n),
            LeafNode::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(n),
        }
    }

    /// Dispatch to the correct node‐type draw method
    pub fn draw_node_recursively(&self, node: &Node, repository: &NodeRepository) {
        match node {
            Node::Error(n) => self.draw_error_node(n),
            Node::Group(n) => self.draw_group_node_recursively(n, repository),
            Node::Container(n) => self.draw_container_node_recursively(n, repository),
            Node::Rectangle(n) => self.draw_rect_node(n),
            Node::Ellipse(n) => self.draw_ellipse_node(n),
            Node::Polygon(n) => self.draw_polygon_node(n),
            Node::RegularPolygon(n) => self.draw_regular_polygon_node(n),
            Node::TextSpan(n) => self.draw_text_span_node(n),
            Node::Line(n) => self.draw_line_node(n),
            Node::Image(n) => {
                self.draw_image_node(n);
            }
            Node::Path(n) => self.draw_path_node(n),
            Node::BooleanOperation(n) => {
                self.draw_boolean_operation_node_recursively(n, repository)
            }
            Node::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(n),
        }
    }

    /// Draw a single [`PainterPictureLayer`].
    pub fn draw_layer(&self, layer: &PainterPictureLayer) {
        match layer {
            PainterPictureLayer::Shape(shape_layer) => {
                self.with_transform(&shape_layer.base.transform.matrix, || {
                    let shape = &shape_layer.base.shape;
                    let effect = shape_layer.base.effects.first();
                    let clip_path = &shape_layer.base.clip_path;
                    let draw_content = || {
                        self.with_opacity(shape_layer.base.opacity, || {
                            for fill in &shape_layer.base.fills {
                                self.draw_fill(shape, fill);
                            }
                            for stroke in &shape_layer.base.strokes {
                                if let Some(path) = &shape_layer.base.stroke_path {
                                    self.draw_stroke_path(shape, stroke, path);
                                }
                            }
                        });
                    };
                    if let Some(clip) = clip_path {
                        self.canvas.save();
                        self.canvas.clip_path(clip, None, true);
                        self.draw_shape_with_effect(effect, shape, draw_content);
                        self.canvas.restore();
                    } else {
                        self.draw_shape_with_effect(effect, shape, draw_content);
                    }
                });
            }
            PainterPictureLayer::Text(text_layer) => {
                self.with_transform(&text_layer.base.transform.matrix, || {
                    let shape = &text_layer.base.shape;
                    let effect = text_layer.base.effects.first();
                    let clip_path = &text_layer.base.clip_path;
                    let draw_content = || {
                        self.with_opacity(text_layer.base.opacity, || {
                            self.draw_text_span(
                                &text_layer.text,
                                &Size {
                                    width: shape.rect.width(),
                                    height: shape.rect.height(),
                                },
                                &text_layer.base.fills.first().unwrap(),
                                &text_layer.text_align,
                                &text_layer.text_align_vertical,
                                &text_layer.text_style,
                            );
                        });
                    };
                    if let Some(clip) = clip_path {
                        self.canvas.save();
                        self.canvas.clip_path(clip, None, true);
                        self.draw_shape_with_effect(effect, shape, draw_content);
                        self.canvas.restore();
                    } else {
                        self.draw_shape_with_effect(effect, shape, draw_content);
                    }
                });
            }
        }
    }

    /// Draw all layers in a [`LayerList`].
    pub fn draw_layer_list(&self, list: &LayerList) {
        for layer in &list.layers {
            self.draw_layer(layer);
        }
    }
}

fn make_textstyle(text_style: &TextStyle) -> skia_safe::textlayout::TextStyle {
    let mut ts = skia_safe::textlayout::TextStyle::new();
    ts.set_font_size(text_style.font_size);
    if let Some(letter_spacing) = text_style.letter_spacing {
        ts.set_letter_spacing(letter_spacing);
    }
    if let Some(line_height) = text_style.line_height {
        ts.set_height(line_height);
    }
    let mut decor = skia_safe::textlayout::Decoration::default();
    decor.ty = text_style.text_decoration.into();
    ts.set_decoration(&decor);
    ts.set_font_families(&[&text_style.font_family]);
    let font_style = skia_safe::FontStyle::new(
        skia_safe::font_style::Weight::from(text_style.font_weight.value() as i32),
        skia_safe::font_style::Width::NORMAL,
        skia_safe::font_style::Slant::Upright,
    );
    ts.set_font_style(font_style);
    ts
}
