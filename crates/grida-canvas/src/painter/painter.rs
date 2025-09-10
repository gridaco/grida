use super::cvt;
use super::geometry::*;
use super::layer::{LayerList, PainterPictureLayer};
use super::shadow;
use super::text_stroke;
use crate::cache::geometry::GeometryCache;
use crate::cache::{scene::SceneCache, vector_path::VectorPathCache};
use crate::cg::types::*;
use crate::node::repository::NodeRepository;
use crate::node::schema::*;
use crate::runtime::repository::{FontRepository, ImageRepository};
use crate::shape::*;
use crate::sk;
use crate::vectornetwork::vn_painter::StrokeOptions;
use math2::transform::AffineTransform;
use skia_safe::{canvas::SaveLayerRec, textlayout, Paint as SkPaint, Path, Point};
use std::cell::RefCell;
use std::rc::Rc;

/// A painter that handles all drawing operations for nodes,
/// with proper effect ordering and a layer‐blur/backdrop‐blur pipeline.
pub struct Painter<'a> {
    canvas: &'a skia_safe::Canvas,
    fonts: &'a FontRepository,
    images: &'a ImageRepository,
    path_cache: RefCell<VectorPathCache>,
    scene_cache: Option<&'a SceneCache>,
}

impl<'a> Painter<'a> {
    /// Create a new Painter that uses the SceneCache's paragraph cache
    pub fn new_with_scene_cache(
        canvas: &'a skia_safe::Canvas,
        fonts: &'a FontRepository,
        images: &'a ImageRepository,
        scene_cache: &'a SceneCache,
    ) -> Self {
        Self {
            canvas,
            fonts,
            images,
            path_cache: RefCell::new(VectorPathCache::new()),
            scene_cache: Some(scene_cache), // Store reference to scene cache
        }
    }

    #[cfg(test)]
    pub fn path_cache(&self) -> &RefCell<VectorPathCache> {
        &self.path_cache
    }

    /// Create a NodePainter that uses this Painter for its operations
    pub fn node_painter(&self) -> NodePainter<'_> {
        NodePainter::new(self)
    }

    // ============================
    // === Helper Methods ========
    // ============================

    fn with_transform_option<F: FnOnce()>(&self, transform: &Option<AffineTransform>, f: F) {
        if let Some(transform) = transform {
            self.with_transform(&transform.matrix, f);
        } else {
            f();
        }
    }

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

    /// Draw a text drop shadow using a paragraph as the source.
    fn draw_text_shadow(&self, paragraph: &Rc<RefCell<textlayout::Paragraph>>, shadow: &FeShadow) {
        let mut paint = SkPaint::default();
        paint.set_image_filter(shadow::drop_shadow_image_filter(shadow));
        paint.set_anti_alias(true);
        self.canvas
            .save_layer(&SaveLayerRec::default().paint(&paint));
        paragraph.borrow().paint(self.canvas, Point::new(0.0, 0.0));
        self.canvas.restore();
    }

    /// Draw an inner shadow for text using a paragraph as the source.
    fn draw_text_inner_shadow(
        &self,
        paragraph: &Rc<RefCell<textlayout::Paragraph>>,
        shadow: &FeShadow,
    ) {
        let mut paint = SkPaint::default();
        paint.set_image_filter(shadow::inner_shadow_image_filter(shadow));
        paint.set_anti_alias(true);
        self.canvas
            .save_layer(&SaveLayerRec::default().paint(&paint));
        paragraph.borrow().paint(self.canvas, Point::new(0.0, 0.0));
        self.canvas.restore();
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
        _id: &NodeId,
        text: &str,
        width: &Option<f32>,
        max_lines: &Option<usize>,
        ellipsis: &Option<String>,
        fills: &[Paint],
        align: &TextAlign,
        // TODO: vertical align shall be computed on our end, since sk paragraph does not have a concept of "vertical align"
        _valign: &TextAlignVertical,
        style: &TextStyleRec,
    ) -> Rc<RefCell<textlayout::Paragraph>> {
        let scene_cache = self
            .scene_cache
            .expect("Painter must have scene_cache for text rendering");
        scene_cache.paragraph.borrow_mut().paragraph(
            text,
            fills,
            align,
            style,
            max_lines,
            ellipsis,
            *width,
            self.fonts,
            self.images,
            Some(_id),
        )
    }

    fn draw_fills(&self, shape: &PainterShape, fills: &[Paint]) {
        if fills.is_empty() {
            return;
        }
        if let Some(paint) = cvt::sk_paint_stack(
            fills,
            1.0,
            (shape.rect.width(), shape.rect.height()),
            self.images,
        ) {
            self.canvas.draw_path(&shape.to_path(), &paint);
        }
    }

    fn draw_strokes(
        &self,
        shape: &PainterShape,
        strokes: &[Paint],
        stroke_width: f32,
        stroke_align: StrokeAlign,
        stroke_dash_array: Option<&Vec<f32>>,
    ) {
        if stroke_width <= 0.0 || strokes.is_empty() {
            return;
        }
        let stroke_path = stroke_geometry(
            &shape.to_path(),
            stroke_width,
            stroke_align,
            stroke_dash_array,
        );
        self.draw_stroke_path(shape, &stroke_path, strokes);
    }

    fn draw_stroke_path(
        &self,
        shape: &PainterShape,
        stroke_path: &skia_safe::Path,
        strokes: &[Paint],
    ) {
        if strokes.is_empty() {
            return;
        }
        if let Some(paint) = cvt::sk_paint_stack(
            strokes,
            1.0,
            (shape.rect.width(), shape.rect.height()),
            self.images,
        ) {
            self.canvas.draw_path(stroke_path, &paint);
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

    fn draw_text_span(
        &self,
        id: &NodeId,
        text: &str,
        width: &Option<f32>,
        max_lines: &Option<usize>,
        ellipsis: &Option<String>,
        fills: &[Paint],
        strokes: &[Paint],
        stroke_width: f32,
        stroke_align: &StrokeAlign,
        text_align: &TextAlign,
        text_align_vertical: &TextAlignVertical,
        text_style: &TextStyleRec,
    ) {
        if fills.is_empty() {
            return;
        }

        let paragraph = self.cached_paragraph(
            id,
            text,
            width,
            max_lines,
            ellipsis,
            fills,
            text_align,
            text_align_vertical,
            text_style,
        );
        let layout_size = {
            let para = paragraph.borrow();
            (para.max_width(), para.height())
        };

        self.draw_text_paragraph(&paragraph, strokes, stroke_width, stroke_align, layout_size);
    }

    fn draw_text_paragraph(
        &self,
        paragraph: &Rc<RefCell<textlayout::Paragraph>>,
        strokes: &[Paint],
        stroke_width: f32,
        stroke_align: &StrokeAlign,
        layout_size: (f32, f32),
    ) {
        if stroke_width > 0.0 && matches!(stroke_align, StrokeAlign::Outside) {
            for stroke_paint_def in strokes {
                paragraph.borrow_mut().visit(|_, info| {
                    if let Some(info) = info {
                        text_stroke::draw_text_stroke_outside_fast_pre(
                            self.canvas,
                            info.glyphs(),
                            info.positions(),
                            info.origin(),
                            info.font(),
                            stroke_paint_def,
                            stroke_width,
                            layout_size,
                        );
                    }
                });
            }
        }

        // Now we can simply paint the paragraph - all paint handling is done in paragraph()
        paragraph.borrow().paint(self.canvas, Point::new(0.0, 0.0));

        if stroke_width > 0.0 && !matches!(stroke_align, StrokeAlign::Outside) {
            for stroke_paint_def in strokes {
                paragraph.borrow_mut().visit(|_, info| {
                    if let Some(info) = info {
                        text_stroke::draw_text_stroke(
                            self.canvas,
                            info.glyphs(),
                            info.positions(),
                            info.origin(),
                            info.font(),
                            stroke_paint_def,
                            stroke_width,
                            *stroke_align,
                        );
                    }
                });
            }
        }
    }

    /// Draw a single [`PainterPictureLayer`].
    pub fn draw_layer(&self, layer: &PainterPictureLayer) {
        match layer {
            PainterPictureLayer::Shape(shape_layer) => {
                self.with_blendmode(shape_layer.base.blend_mode, || {
                    self.with_transform(&shape_layer.base.transform.matrix, || {
                        let shape = &shape_layer.shape;
                        let effect_ref = &shape_layer.effects;
                        let clip_path = &shape_layer.base.clip_path;
                        let draw_content = || {
                            self.with_opacity(shape_layer.base.opacity, || {
                                if shape.is_closed() {
                                    self.draw_fills(shape, &shape_layer.fills);
                                }
                                if let Some(path) = &shape_layer.stroke_path {
                                    self.draw_stroke_path(shape, path, &shape_layer.strokes);
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
                self.with_blendmode(text_layer.base.blend_mode, || {
                    self.with_transform(&text_layer.base.transform.matrix, || {
                        let effects = &text_layer.effects;
                        let clip_path = &text_layer.base.clip_path;

                        let paragraph = self.cached_paragraph(
                            &text_layer.base.id,
                            &text_layer.text,
                            &text_layer.width,
                            &text_layer.max_lines,
                            &text_layer.ellipsis,
                            &text_layer.fills,
                            &text_layer.text_align,
                            &text_layer.text_align_vertical,
                            &text_layer.text_style,
                        );
                        let layout_size = {
                            let para = paragraph.borrow();
                            (para.max_width(), para.height())
                        };

                        let draw_content = || {
                            self.with_opacity(text_layer.base.opacity, || {
                                if text_layer.fills.is_empty() {
                                    return;
                                }
                                self.draw_text_paragraph(
                                    &paragraph,
                                    &text_layer.strokes,
                                    text_layer.stroke_width,
                                    &text_layer.stroke_align,
                                    layout_size,
                                );
                            });
                        };

                        let apply_effects = || {
                            if let Some(blur) = effects.backdrop_blur {
                                self.draw_backdrop_blur(&text_layer.shape, &blur);
                            }

                            for shadow in &effects.shadows {
                                if let FilterShadowEffect::DropShadow(ds) = shadow {
                                    self.draw_text_shadow(&paragraph, ds);
                                }
                            }

                            draw_content();

                            for shadow in &effects.shadows {
                                if let FilterShadowEffect::InnerShadow(is) = shadow {
                                    self.draw_text_inner_shadow(&paragraph, is);
                                }
                            }
                        };

                        let draw_with_effects = || {
                            if let Some(layer_blur) = effects.blur {
                                self.with_layer_blur(layer_blur.radius, apply_effects);
                            } else {
                                apply_effects();
                            }
                        };

                        if let Some(clip) = clip_path {
                            self.canvas.save();
                            self.canvas.clip_path(clip, None, true);
                            draw_with_effects();
                            self.canvas.restore();
                        } else {
                            draw_with_effects();
                        }
                    });
                });
            }
            PainterPictureLayer::Vector(vector_layer) => {
                self.with_blendmode(vector_layer.base.blend_mode, || {
                    self.with_transform(&vector_layer.base.transform.matrix, || {
                        let shape = &vector_layer.shape;
                        let effect_ref = &vector_layer.effects;
                        let clip_path = &vector_layer.base.clip_path;
                        let draw_content = || {
                            self.with_opacity(vector_layer.base.opacity, || {
                                // Use VNPainter for vector network rendering
                                let vn_painter =
                                    crate::vectornetwork::vn_painter::VNPainter::new(self.canvas);

                                // Convert strokes to StrokeOptions for VNPainter
                                let stroke_options = if !vector_layer.strokes.is_empty() {
                                    let first_stroke = &vector_layer.strokes[0];
                                    let stroke_color = match first_stroke {
                                        Paint::Solid(solid) => solid.color,
                                        _ => CGColor(0, 0, 0, 255), // Default black
                                    };
                                    Some(StrokeOptions {
                                        width: vector_layer.stroke_width,
                                        align: vector_layer.stroke_align,
                                        color: stroke_color,
                                        width_profile: vector_layer.stroke_width_profile.clone(),
                                    })
                                } else {
                                    None
                                };

                                vn_painter.draw(
                                    &vector_layer.vector,
                                    &vector_layer.fills,
                                    stroke_options.as_ref(),
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

/// A painter specifically for drawing nodes, using the main Painter for operations.
/// This separates node-specific drawing logic from the main Painter while maintaining
/// the ability to test golden outputs.
pub struct NodePainter<'a> {
    painter: &'a Painter<'a>,
}

impl<'a> NodePainter<'a> {
    /// Create a new NodePainter that uses the given Painter
    pub fn new(painter: &'a Painter<'a>) -> Self {
        Self { painter }
    }

    /// Draw a RectangleNode, respecting its transform, effect, fill, stroke, blend mode, opacity
    pub fn draw_rect_node(&self, node: &RectangleNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Rectangle(node.clone()));
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            self.painter.draw_fills(&shape, &node.fills);
                            self.painter.draw_strokes(
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
    pub fn draw_image_node(&self, node: &ImageNodeRec) -> bool {
        self.painter.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Image(node.clone()));

            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            // convert the image itself to a paint
                            let image_paint = Paint::Image(ImagePaint {
                                hash: node.hash.clone(),
                                opacity: node.opacity,
                                transform: AffineTransform::identity(),
                                fit: math2::box_fit::BoxFit::Cover,
                                blend_mode: BlendMode::default(),
                            });

                            self.painter
                                .draw_fills(&shape, std::slice::from_ref(&image_paint));
                            self.painter.draw_strokes(
                                &shape,
                                std::slice::from_ref(&node.stroke),
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
    pub fn draw_ellipse_node(&self, node: &EllipseNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Ellipse(node.clone()));
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            self.painter.draw_fills(&shape, &node.fills);
                            self.painter.draw_strokes(
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
    pub fn draw_line_node(&self, node: &LineNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Line(node.clone()));

            self.painter.with_opacity(node.opacity, || {
                self.painter.with_blendmode(node.blend_mode, || {
                    self.painter.draw_strokes(
                        &shape,
                        &node.strokes,
                        node.stroke_width,
                        node.get_stroke_align(),
                        node.stroke_dash_array.as_ref(),
                    );
                });
            });
        });
    }

    pub fn draw_vector_node(&self, node: &VectorNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let path = node.to_path();
            let stroke_align = node.get_stroke_align();
            let shape = PainterShape::from_path(path);
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            if let Some(fill) = &node.fill {
                                self.painter.draw_fills(&shape, std::slice::from_ref(fill));
                            }
                            self.painter.draw_strokes(
                                &shape,
                                &node.strokes,
                                node.stroke_width,
                                stroke_align,
                                node.stroke_dash_array.as_ref(),
                            );
                        });
                    });
                });
        });
    }

    /// Draw a PathNode (SVG path data)
    pub fn draw_path_node(&self, node: &SVGPathNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let path = self.painter.cached_path(&node.id, &node.data);
            let shape = PainterShape::from_path((*path).clone());
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            self.painter
                                .draw_fills(&shape, std::slice::from_ref(&node.fill));
                            if let Some(stroke) = &node.stroke {
                                self.painter.draw_strokes(
                                    &shape,
                                    std::slice::from_ref(stroke),
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
    pub fn draw_polygon_node(&self, node: &PolygonNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let path = node.to_path();
            let shape = PainterShape::from_path(path.clone());
            self.painter
                .draw_shape_with_effects(&node.effects, &shape, || {
                    self.painter.with_opacity(node.opacity, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            self.painter.draw_fills(&shape, &node.fills);
                            self.painter.draw_strokes(
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
    pub fn draw_regular_polygon_node(&self, node: &RegularPolygonNodeRec) {
        let points = node.to_points();

        let polygon = PolygonNodeRec {
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
    pub fn draw_regular_star_polygon_node(&self, node: &RegularStarPolygonNodeRec) {
        let points = node.to_points();

        let polygon = PolygonNodeRec {
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

    /// Draw a TextSpanNode (simple text block)
    pub fn draw_text_span_node(&self, node: &TextSpanNodeRec) {
        if node.fills.is_empty() {
            return;
        }
        self.painter.with_transform(&node.transform.matrix, || {
            self.painter.with_opacity(node.opacity, || {
                self.painter.with_blendmode(node.blend_mode, || {
                    self.painter.draw_text_span(
                        &node.id,
                        &node.text,
                        &node.width,
                        &node.max_lines,
                        &node.ellipsis,
                        &node.fills,
                        &node.strokes,
                        node.stroke_width,
                        &node.stroke_align,
                        &node.text_align,
                        &node.text_align_vertical,
                        &node.text_style,
                    );
                });
            });
        });
    }

    /// Draw a ContainerNode (background + stroke + children)
    pub fn draw_container_node_recursively(
        &self,
        node: &ContainerNodeRec,
        repository: &NodeRepository,
        cache: &GeometryCache,
    ) {
        self.painter.with_transform(&node.transform.matrix, || {
            self.painter.with_opacity(node.opacity, || {
                let shape = build_shape(&IntrinsicSizeNode::Container(node.clone()));

                // Draw effects, fills, children (with optional clipping), then strokes last
                self.painter
                    .draw_shape_with_effects(&node.effects, &shape, || {
                        self.painter.with_blendmode(node.blend_mode, || {
                            // Paint fills first
                            self.painter.draw_fills(&shape, &node.fills);

                            // Children are drawn next; if `clip` is enabled we push
                            // a clip region for the container's shape so that
                            // descendants are clipped but the container's own stroke
                            // remains unaffected.
                            if node.clip {
                                self.painter.with_clip(&shape, || {
                                    for child_id in &node.children {
                                        if let Some(child) = repository.get(child_id) {
                                            self.draw_node_recursively(child, repository, cache);
                                        }
                                    }
                                });
                            } else {
                                for child_id in &node.children {
                                    if let Some(child) = repository.get(child_id) {
                                        self.draw_node_recursively(child, repository, cache);
                                    }
                                }
                            }

                            // Finally paint the stroke so it is not clipped by the
                            // container's own clip and always renders above children.
                            self.painter.draw_strokes(
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

    pub fn draw_error_node(&self, node: &ErrorNodeRec) {
        self.painter.with_transform(&node.transform.matrix, || {
            let shape = build_shape(&IntrinsicSizeNode::Error(node.clone()));

            // Create a red fill paint
            let fill = Paint::Solid(SolidPaint {
                color: CGColor(255, 0, 0, 51), // Semi-transparent red
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            });
            let stroke = Paint::Solid(SolidPaint {
                color: CGColor(255, 0, 0, 255), // Solid red
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
            });

            self.painter.with_opacity(node.opacity, || {
                self.painter.draw_fills(&shape, std::slice::from_ref(&fill));
                self.painter.draw_strokes(
                    &shape,
                    std::slice::from_ref(&stroke),
                    1.0,
                    StrokeAlign::Inside,
                    None,
                );
            });
        });
    }

    /// Draw a GroupNode: no shape of its own, only children, but apply transform + opacity
    pub fn draw_group_node_recursively(
        &self,
        node: &GroupNodeRec,
        repository: &NodeRepository,
        cache: &GeometryCache,
    ) {
        self.painter.with_transform_option(&node.transform, || {
            self.painter.with_opacity(node.opacity, || {
                for child_id in &node.children {
                    if let Some(child) = repository.get(child_id) {
                        self.draw_node_recursively(child, repository, cache);
                    }
                }
            });
        });
    }

    pub fn draw_boolean_operation_node_recursively(
        &self,
        node: &BooleanPathOperationNodeRec,
        repository: &NodeRepository,
        cache: &GeometryCache,
    ) {
        self.painter.with_transform_option(&node.transform, || {
            if let Some(shape) = boolean_operation_shape(node, repository, cache) {
                self.painter
                    .draw_shape_with_effects(&node.effects, &shape, || {
                        self.painter.with_opacity(node.opacity, || {
                            self.painter.with_blendmode(node.blend_mode, || {
                                self.painter
                                    .draw_fills(&shape, std::slice::from_ref(&node.fill));
                                if let Some(stroke) = &node.stroke {
                                    self.painter.draw_strokes(
                                        &shape,
                                        std::slice::from_ref(stroke),
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
        if !node.active() {
            return;
        }
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
        if !node.active() {
            return;
        }
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
}
