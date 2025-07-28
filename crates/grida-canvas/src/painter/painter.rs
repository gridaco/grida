use super::cvt;
use super::geometry::*;
use super::layer::{LayerList, PainterPictureLayer};
use super::shadow;
use crate::cache::geometry::GeometryCache;
use crate::cache::{paragraph::ParagraphCache, vector_path::VectorPathCache};
use crate::cg::types::*;
use crate::node::repository::NodeRepository;
use crate::node::schema::*;
use crate::runtime::repository::{FontRepository, ImageRepository};
use crate::shape::*;
use crate::sk;
use math2::{box_fit::BoxFit, transform::AffineTransform};
use skia_safe::{canvas::SaveLayerRec, textlayout, Paint as SkPaint, Path, Point};
use std::cell::RefCell;
use std::rc::Rc;

/// A painter that handles all drawing operations for nodes,
/// with proper effect ordering and a layer‐blur/backdrop‐blur pipeline.
pub struct Painter<'a> {
    canvas: &'a skia_safe::Canvas,
    fonts: Rc<RefCell<FontRepository>>,
    images: Rc<RefCell<ImageRepository>>,
    paragraph_cache: RefCell<ParagraphCache>,
    path_cache: RefCell<VectorPathCache>,
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
            paragraph_cache: RefCell::new(ParagraphCache::new()),
            path_cache: RefCell::new(VectorPathCache::new()),
        }
    }

    #[cfg(test)]
    pub fn paragraph_cache(&self) -> &RefCell<ParagraphCache> {
        &self.paragraph_cache
    }

    #[cfg(test)]
    pub fn path_cache(&self) -> &RefCell<VectorPathCache> {
        &self.path_cache
    }

    // ============================
    // === Helper Methods ========
    // ============================

    /// Save/restore transform state and apply a 2×3 matrix
    fn with_transform<F: FnOnce()>(&self, transform: &[[f32; 3]; 2], f: F) {
        let canvas = self.canvas;
        canvas.save();
        canvas.concat(&sk::sk_matrix(*transform));
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
    fn draw_shadow(&self, shape: &PainterShape, shadow: &FeShadow) {
        shadow::draw_drop_shadow(self.canvas, shape, shadow);
    }

    /// Draw an inner shadow clipped to the given shape.
    fn draw_inner_shadow(&self, shape: &PainterShape, shadow: &FeShadow) {
        shadow::draw_inner_shadow(self.canvas, shape, shadow);
    }

    /// Draw a backdrop blur: blur what's behind the shape.
    fn draw_backdrop_blur(&self, shape: &PainterShape, blur: &FeGaussianBlur) {
        let canvas = self.canvas;
        // 1) Build a Gaussian‐blur filter for the backdrop
        let Some(image_filter) =
            skia_safe::image_filters::blur((blur.radius, blur.radius), None, None, None)
        else {
            return;
        };

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

    fn cached_path(&self, id: &NodeId, data: &str) -> Rc<Path> {
        self.path_cache.borrow_mut().get_or_create(id, data)
    }

    fn cached_paragraph(
        &self,
        id: &NodeId,
        text: &str,
        size: &Size,
        fill: &Paint,
        align: &TextAlign,
        valign: &TextAlignVertical,
        style: &TextStyle,
    ) -> Rc<textlayout::Paragraph> {
        self.paragraph_cache.borrow_mut().get_or_create(
            id,
            text,
            size,
            fill,
            align,
            valign,
            style,
            &self.fonts.borrow(),
        )
    }

    /// Determine the transformation matrix for an [`ImagePaint`].
    ///
    /// If the paint specifies a [`BoxFit`] other than `None`, the box-fit
    /// transform is used. Otherwise, the paint's own transform is applied.
    fn image_paint_matrix(
        &self,
        paint: &ImagePaint,
        image_size: (f32, f32),
        container_size: (f32, f32),
    ) -> [[f32; 3]; 2] {
        match paint.fit {
            BoxFit::None => paint.transform.matrix,
            _ => {
                paint
                    .fit
                    .calculate_transform(image_size, container_size)
                    .matrix
            }
        }
    }

    fn draw_fills(&self, shape: &PainterShape, fills: &Vec<Paint>) {
        for fill in fills {
            self.draw_fill(shape, fill);
        }
    }

    /// Draw fill for a shape using given paint.
    fn draw_fill(&self, shape: &PainterShape, fill: &Paint) {
        let canvas = self.canvas;
        let (fill_paint, image, image_params) = match fill {
            Paint::Image(image_paint) => {
                let images = self.images.borrow();
                if let Some(image) =
                    images.get_by_size(&image_paint.hash, shape.rect.width(), shape.rect.height())
                {
                    let mut paint = SkPaint::default();
                    paint.set_anti_alias(true);
                    (paint, Some(image.clone()), Some(image_paint.clone()))
                } else {
                    // Image not ready - skip fill
                    return;
                }
            }
            _ => (
                cvt::sk_paint(fill, 1.0, (shape.rect.width(), shape.rect.height())),
                None,
                None,
            ),
        };

        if let (Some(image), Some(img_paint)) = (image, image_params) {
            // For image fills, clip to the shape and apply transforms
            canvas.save();
            canvas.clip_path(&shape.to_path(), None, true);

            // Apply either the fit transform or the paint's custom transform
            let m = self.image_paint_matrix(
                &img_paint,
                (image.width() as f32, image.height() as f32),
                (shape.rect.width(), shape.rect.height()),
            );
            canvas.concat(&sk::sk_matrix(m));

            canvas.draw_image_rect(
                &image,
                None,
                skia_safe::Rect::from_xywh(0.0, 0.0, image.width() as f32, image.height() as f32),
                &fill_paint,
            );
            canvas.restore();
        } else {
            // For regular fills, draw the shape directly
            canvas.draw_path(&shape.to_path(), &fill_paint);
        }
    }

    fn draw_strokes(
        &self,
        shape: &PainterShape,
        strokes: &Vec<Paint>,
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_dash_array: Option<&Vec<f32>>,
    ) {
        for stroke in strokes {
            self.draw_stroke(shape, stroke, stroke_width, stroke_align, stroke_dash_array);
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
                if let Some(image) =
                    images.get_by_size(&image_paint.hash, shape.rect.width(), shape.rect.height())
                {
                    let mut paint = SkPaint::default();
                    paint.set_anti_alias(true);

                    // For image strokes, clip and apply transforms
                    canvas.save();
                    canvas.clip_path(&stroke_path, None, true);

                    let m = self.image_paint_matrix(
                        image_paint,
                        (image.width() as f32, image.height() as f32),
                        (shape.rect.width(), shape.rect.height()),
                    );
                    canvas.concat(&sk::sk_matrix(m));

                    canvas.draw_image_rect(
                        &image,
                        None,
                        skia_safe::Rect::from_xywh(
                            0.0,
                            0.0,
                            image.width() as f32,
                            image.height() as f32,
                        ),
                        &paint,
                    );
                    canvas.restore();
                }
            }
            _ => {
                let paint = cvt::sk_paint(stroke, 1.0, (shape.rect.width(), shape.rect.height()));
                canvas.draw_path(&stroke_path, &paint);
            }
        }
    }

    /// Draw a shape applying all layer effects in the correct order.
    fn draw_shape_with_effects<F: Fn()>(
        &self,
        effects: &LayerEffects,
        shape: &PainterShape,
        draw_content: F,
    ) {
        let apply_effects = || {
            if let Some(blur) = effects.backdrop_blur {
                self.draw_backdrop_blur(shape, &blur);
            }

            for shadow in &effects.shadows {
                if let FilterShadowEffect::DropShadow(ds) = shadow {
                    self.draw_shadow(shape, ds);
                }
            }

            draw_content();

            for shadow in &effects.shadows {
                if let FilterShadowEffect::InnerShadow(is) = shadow {
                    self.draw_inner_shadow(shape, is);
                }
            }
        };

        if let Some(layer_blur) = effects.blur {
            self.with_layer_blur(layer_blur.radius, apply_effects);
        } else {
            apply_effects();
        }
    }

    // ============================
    // === Node Drawing Methods ===
    // ============================

    /// Draw a RectangleNode, respecting its transform, effect, fill, stroke, blend mode, opacity
    fn draw_rect_node(&self, node: &RectangleNode) {
        self.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Rectangle(node.clone()));
            self.draw_shape_with_effects(&node.effects, &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fills(&shape, &node.fills);
                        self.draw_strokes(
                            &shape,
                            &node.strokes,
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

            self.draw_shape_with_effects(&node.effects, &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        // convert the image itself to a paint
                        let image_paint = Paint::Image(ImagePaint {
                            hash: node.hash.clone(),
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
            self.draw_shape_with_effects(&node.effects, &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fills(&shape, &node.fills);
                        self.draw_strokes(
                            &shape,
                            &node.strokes,
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
                    for stroke in &node.strokes {
                        let paint = cvt::sk_paint(stroke, node.opacity, (node.size.width, 0.0));
                        let stroke_path = stroke_geometry(
                            &shape.to_path(),
                            node.stroke_width,
                            node.get_stroke_align(),
                            node.stroke_dash_array.as_ref(),
                        );
                        self.canvas.draw_path(&stroke_path, &paint);
                    }
                });
            });
        });
    }

    fn draw_vector_node(&self, node: &VectorNode) {
        self.with_transform(&node.transform.matrix, || {
            let path = node.to_path();
            let shape = PainterShape::from_path(path);
            self.draw_shape_with_effects(&node.effects, &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        if let Some(fill) = &node.fill {
                            self.draw_fill(&shape, fill);
                        }
                        self.draw_strokes(
                            &shape,
                            &node.strokes,
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });
            });
        });
    }

    /// Draw a PathNode (SVG path data)
    fn draw_path_node(&self, node: &SVGPathNode) {
        self.with_transform(&node.transform.matrix, || {
            let path = self.cached_path(&node.id, &node.data);
            let shape = PainterShape::from_path((*path).clone());
            self.draw_shape_with_effects(&node.effects, &shape, || {
                self.with_opacity(node.opacity, || {
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
            });
        });
    }

    /// Draw a PolygonNode (arbitrary polygon with optional corner radius)
    fn draw_polygon_node(&self, node: &PolygonNode) {
        self.with_transform(&node.transform.matrix, || {
            let path = node.to_path();
            let shape = PainterShape::from_path(path.clone());
            self.draw_shape_with_effects(&node.effects, &shape, || {
                self.with_opacity(node.opacity, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fills(&shape, &node.fills);
                        self.draw_strokes(
                            &shape,
                            &node.strokes,
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
        let points = node.to_points();

        let polygon = PolygonNode {
            id: node.id.clone(),
            name: node.name.clone(),
            active: node.active,
            transform: node.transform,
            points,
            corner_radius: node.corner_radius,
            fills: node.fills.clone(),
            strokes: node.strokes.clone(),
            stroke_width: node.stroke_width,
            stroke_align: node.stroke_align,
            opacity: node.opacity,
            blend_mode: node.blend_mode,
            effects: node.effects.clone(),
            stroke_dash_array: node.stroke_dash_array.clone(),
        };

        self.draw_polygon_node(&polygon);
    }

    /// Draw a RegularStarPolygonNode by converting to a PolygonNode
    fn draw_regular_star_polygon_node(&self, node: &RegularStarPolygonNode) {
        let points = node.to_points();

        let polygon = PolygonNode {
            id: node.id.clone(),
            name: node.name.clone(),
            active: node.active,
            transform: node.transform,
            points,
            corner_radius: node.corner_radius,
            fills: node.fills.clone(),
            strokes: node.strokes.clone(),
            stroke_width: node.stroke_width,
            stroke_align: node.stroke_align,
            opacity: node.opacity,
            blend_mode: node.blend_mode,
            effects: node.effects.clone(),
            stroke_dash_array: node.stroke_dash_array.clone(),
        };

        self.draw_polygon_node(&polygon);
    }

    fn draw_text_span(
        &self,
        id: &NodeId,
        text: &str,
        size: &Size,
        fill: &Paint,
        text_align: &TextAlign,
        text_align_vertical: &TextAlignVertical,
        text_style: &TextStyle,
    ) {
        let paragraph = self.cached_paragraph(
            id,
            text,
            size,
            fill,
            text_align,
            text_align_vertical,
            text_style,
        );
        paragraph.paint(self.canvas, Point::new(0.0, 0.0));
    }

    /// Draw a TextSpanNode (simple text block)
    fn draw_text_span_node(&self, node: &TextSpanNode) {
        self.with_transform(&node.transform.matrix, || {
            self.with_opacity(node.opacity, || {
                self.with_blendmode(node.blend_mode, || {
                    self.draw_text_span(
                        &node.id,
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
    fn draw_container_node_recursively(
        &self,
        node: &ContainerNode,
        repository: &NodeRepository,
        cache: &GeometryCache,
    ) {
        self.with_transform(&node.transform.matrix, || {
            self.with_opacity(node.opacity, || {
                let shape = build_shape(&IntrinsicSizeNode::Container(node.clone()));

                // Draw effects first (if any) - these won't be clipped
                self.draw_shape_with_effects(&node.effects, &shape, || {
                    self.with_blendmode(node.blend_mode, || {
                        self.draw_fills(&shape, &node.fills);
                        self.draw_strokes(
                            &shape,
                            &node.strokes,
                            node.stroke_width,
                            node.stroke_align,
                            node.stroke_dash_array.as_ref(),
                        );
                    });
                });

                // Draw children with clipping if enabled
                if node.clip {
                    self.with_clip(&shape, || {
                        for child_id in &node.children {
                            if let Some(child) = repository.get(child_id) {
                                self.draw_node_recursively(child, repository, cache);
                            }
                        }
                    });
                } else {
                    // Draw children without clipping
                    for child_id in &node.children {
                        if let Some(child) = repository.get(child_id) {
                            self.draw_node_recursively(child, repository, cache);
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
                color: CGColor(255, 0, 0, 51), // Semi-transparent red
                opacity: 1.0,
            });
            let stroke = Paint::Solid(SolidPaint {
                color: CGColor(255, 0, 0, 255), // Solid red
                opacity: 1.0,
            });

            self.with_opacity(node.opacity, || {
                self.draw_fill(&shape, &fill);
                self.draw_stroke(&shape, &stroke, 1.0, StrokeAlign::Inside, None);
            });
        });
    }

    /// Draw a GroupNode: no shape of its own, only children, but apply transform + opacity
    fn draw_group_node_recursively(
        &self,
        node: &GroupNode,
        repository: &NodeRepository,
        cache: &GeometryCache,
    ) {
        self.with_transform(&node.transform.matrix, || {
            self.with_opacity(node.opacity, || {
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node_recursively(child, repository, cache);
                    }
                }
            });
        });
    }

    fn draw_boolean_operation_node_recursively(
        &self,
        node: &BooleanPathOperationNode,
        repository: &NodeRepository,
        cache: &GeometryCache,
    ) {
        self.with_transform(&node.transform.matrix, || {
            if let Some(shape) = boolean_operation_shape(node, repository, cache) {
                self.draw_shape_with_effects(&node.effects, &shape, || {
                    self.with_opacity(node.opacity, || {
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
                });
            } else {
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node_recursively(child, repository, cache);
                    }
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
            LeafNode::Vector(n) => self.draw_vector_node(n),
            LeafNode::SVGPath(n) => self.draw_path_node(n),
            LeafNode::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(n),
        }
    }

    /// Dispatch to the correct node‐type draw method
    pub fn draw_node_recursively(
        &self,
        node: &Node,
        repository: &NodeRepository,
        cache: &GeometryCache,
    ) {
        match node {
            Node::Error(n) => self.draw_error_node(n),
            Node::Group(n) => self.draw_group_node_recursively(n, repository, cache),
            Node::Container(n) => self.draw_container_node_recursively(n, repository, cache),
            Node::Rectangle(n) => self.draw_rect_node(n),
            Node::Ellipse(n) => self.draw_ellipse_node(n),
            Node::Polygon(n) => self.draw_polygon_node(n),
            Node::RegularPolygon(n) => self.draw_regular_polygon_node(n),
            Node::TextSpan(n) => self.draw_text_span_node(n),
            Node::Line(n) => self.draw_line_node(n),
            Node::Image(n) => {
                self.draw_image_node(n);
            }
            Node::Vector(n) => self.draw_vector_node(n),
            Node::SVGPath(n) => self.draw_path_node(n),
            Node::BooleanOperation(n) => {
                self.draw_boolean_operation_node_recursively(n, repository, cache)
            }
            Node::RegularStarPolygon(n) => self.draw_regular_star_polygon_node(n),
        }
    }

    /// Draw a single [`PainterPictureLayer`].
    pub fn draw_layer(&self, layer: &PainterPictureLayer) {
        match layer {
            PainterPictureLayer::Shape(shape_layer) => {
                self.with_blendmode(shape_layer.base.blend_mode, || {
                    self.with_transform(&shape_layer.base.transform.matrix, || {
                        let shape = &shape_layer.base.shape;
                        let effect_ref = &shape_layer.base.effects;
                        let clip_path = &shape_layer.base.clip_path;
                        let draw_content = || {
                            self.with_opacity(shape_layer.base.opacity, || {
                                if shape.is_closed() {
                                    for fill in &shape_layer.base.fills {
                                        self.draw_fill(shape, fill);
                                    }
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
                            self.draw_shape_with_effects(effect_ref, shape, draw_content);
                            self.canvas.restore();
                        } else {
                            self.draw_shape_with_effects(effect_ref, shape, draw_content);
                        }
                    });
                });
            }
            PainterPictureLayer::Text(text_layer) => {
                self.with_transform(&text_layer.base.transform.matrix, || {
                    let shape = &text_layer.base.shape;
                    let effect_ref = &text_layer.base.effects;
                    let clip_path = &text_layer.base.clip_path;
                    let draw_content = || {
                        self.with_opacity(text_layer.base.opacity, || {
                            self.draw_text_span(
                                &text_layer.base.id,
                                &text_layer.text,
                                &Size {
                                    width: shape.rect.width(),
                                    height: shape.rect.height(),
                                },
                                // TODO: support multiple fills for text
                                match text_layer.base.fills.first() {
                                    Some(f) => f,
                                    None => return,
                                },
                                &text_layer.text_align,
                                &text_layer.text_align_vertical,
                                &text_layer.text_style,
                            );
                        });
                    };
                    if let Some(clip) = clip_path {
                        self.canvas.save();
                        self.canvas.clip_path(clip, None, true);
                        self.draw_shape_with_effects(effect_ref, shape, draw_content);
                        self.canvas.restore();
                    } else {
                        self.draw_shape_with_effects(effect_ref, shape, draw_content);
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

pub(crate) fn make_textstyle(text_style: &TextStyle) -> skia_safe::textlayout::TextStyle {
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
        if text_style.italic {
            skia_safe::font_style::Slant::Italic
        } else {
            skia_safe::font_style::Slant::Upright
        },
    );
    ts.set_font_style(font_style);
    ts
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::factory::NodeFactory;
    use crate::runtime::repository::{FontRepository, ImageRepository};
    use skia_safe::surfaces;
    use std::cell::RefCell;
    use std::rc::Rc;

    #[test]
    fn caches_reuse_paragraph_and_path() {
        let mut surface = surfaces::raster_n32_premul((100, 100)).unwrap();
        let canvas = surface.canvas();
        let fonts = Rc::new(RefCell::new(FontRepository::new()));
        let images = Rc::new(RefCell::new(ImageRepository::new()));
        let painter = Painter::new(canvas, fonts.clone(), images.clone());

        let nf = NodeFactory::new();
        let mut text = nf.create_text_span_node();
        text.text = "Hello".into();
        let text_id = text.id.clone();

        painter.draw_text_span_node(&text);
        let p_first = {
            let cache = painter.paragraph_cache().borrow();
            Rc::as_ptr(&cache.get(&text_id).unwrap().paragraph)
        };

        painter.draw_text_span_node(&text);
        {
            let cache = painter.paragraph_cache().borrow();
            assert_eq!(cache.len(), 1);
            assert_eq!(p_first, Rc::as_ptr(&cache.get(&text_id).unwrap().paragraph));
        }

        fonts.borrow_mut().insert("F".to_string(), vec![0u8; 4]);
        painter.draw_text_span_node(&text);
        {
            let cache = painter.paragraph_cache().borrow();
            assert_ne!(p_first, Rc::as_ptr(&cache.get(&text_id).unwrap().paragraph));
        }

        let mut path_node = nf.create_path_node();
        path_node.data = "M0 0L10 10Z".to_string();
        let path_id = path_node.id.clone();

        painter.draw_path_node(&path_node);
        let path_first = {
            let cache = painter.path_cache().borrow();
            cache.get(&path_id).unwrap().path.clone()
        };

        painter.draw_path_node(&path_node);
        {
            let cache = painter.path_cache().borrow();
            assert_eq!(cache.len(), 1);
            assert_eq!(
                Rc::ptr_eq(&path_first, &cache.get(&path_id).unwrap().path),
                true
            );
        }

        path_node.data = "M0 0L20 20Z".to_string();
        painter.draw_path_node(&path_node);
        {
            let cache = painter.path_cache().borrow();
            assert_eq!(
                Rc::ptr_eq(&path_first, &cache.get(&path_id).unwrap().path),
                false
            );
        }
    }
}
