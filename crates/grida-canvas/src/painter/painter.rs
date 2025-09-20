use super::geometry::*;
use super::layer::{LayerList, PainterPictureLayer};
use super::paint;
use super::shadow;
use super::text_stroke;
use crate::cache::geometry::GeometryCache;
use crate::cache::{scene::SceneCache, vector_path::VectorPathCache};
use crate::cg::types::*;
use crate::node::repository::NodeRepository;
use crate::node::schema::*;
use crate::runtime::{font_repository::FontRepository, image_repository::ImageRepository};
use crate::shape::*;
use crate::sk;
use crate::vectornetwork::vn_painter::StrokeOptions;
use math2::transform::AffineTransform;
use skia_safe::{
    canvas::SaveLayerRec, path::AddPathMode, textlayout, Paint as SkPaint, Path, Point,
};
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

    // ============================
    // === Helper Methods ========
    // ============================

    pub fn with_transform_option<F: FnOnce()>(&self, transform: &Option<AffineTransform>, f: F) {
        if let Some(transform) = transform {
            self.with_transform(&transform.matrix, f);
        } else {
            f();
        }
    }

    /// Save/restore transform state and apply a 2×3 matrix
    pub fn with_transform<F: FnOnce()>(&self, transform: &[[f32; 3]; 2], f: F) {
        let canvas = self.canvas;
        canvas.save();
        canvas.concat(&sk::sk_matrix(*transform));
        f();
        canvas.restore();
    }

    /// If opacity < 1.0, wrap drawing in a save_layer_alpha; else draw directly.
    pub fn with_opacity<F: FnOnce()>(&self, opacity: f32, f: F) {
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
    pub fn with_blendmode<F: FnOnce()>(&self, layer_blend_mode: LayerBlendMode, f: F) {
        let canvas = self.canvas;

        // let mut paint = SkPaint::default();
        // paint.set_blend_mode(blend_mode.into());
        // canvas.save_layer(&SaveLayerRec::default().paint(&paint));
        // f();
        // canvas.restore();

        if layer_blend_mode != LayerBlendMode::PassThrough {
            let mut paint = SkPaint::default();
            let blend_mode: BlendMode = layer_blend_mode.into();
            paint.set_blend_mode(blend_mode.into());
            canvas.save_layer(&SaveLayerRec::default().paint(&paint));
            f();
            canvas.restore();
        } else {
            f();
        }
    }

    /// Helper method to apply clipping to a region with optional corner radius
    pub fn with_clip<F: FnOnce()>(&self, shape: &PainterShape, f: F) {
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
    fn draw_text_shadow(
        &self,
        paragraph: &Rc<RefCell<textlayout::Paragraph>>,
        shadow: &FeShadow,
        y_offset: f32,
    ) {
        let mut paint = SkPaint::default();
        paint.set_image_filter(shadow::drop_shadow_image_filter(shadow));
        paint.set_anti_alias(true);
        self.canvas
            .save_layer(&SaveLayerRec::default().paint(&paint));
        self.canvas.translate((0.0, y_offset));
        paragraph.borrow().paint(self.canvas, Point::new(0.0, 0.0));
        self.canvas.restore();
    }

    /// Draw an inner shadow for text using a paragraph as the source.
    fn draw_text_inner_shadow(
        &self,
        paragraph: &Rc<RefCell<textlayout::Paragraph>>,
        shadow: &FeShadow,
        y_offset: f32,
    ) {
        let mut paint = SkPaint::default();
        paint.set_image_filter(shadow::inner_shadow_image_filter(shadow));
        paint.set_anti_alias(true);
        self.canvas
            .save_layer(&SaveLayerRec::default().paint(&paint));
        self.canvas.translate((0.0, y_offset));
        paragraph.borrow().paint(self.canvas, Point::new(0.0, 0.0));
        self.canvas.restore();
    }

    /// Draw a backdrop blur for text using the actual glyph outlines.
    ///
    /// This clips the canvas to the precise glyph paths derived from the
    /// paragraph's shaped runs and applies a backdrop blur within that clip.
    fn draw_text_backdrop_blur(
        &self,
        paragraph: &Rc<RefCell<textlayout::Paragraph>>,
        blur: &FeGaussianBlur,
        y_offset: f32,
    ) {
        // Build a path from all glyphs in the paragraph.
        let mut path = Path::new();
        paragraph.borrow_mut().visit(|_, info| {
            if let Some(info) = info {
                let glyphs = info.glyphs();
                let positions = info.positions();
                let origin = info.origin();
                let font = info.font();
                for (glyph, pos) in glyphs.iter().zip(positions.iter()) {
                    if let Some(glyph_path) = font.get_path(*glyph) {
                        let offset = Point::new(pos.x + origin.x, pos.y + origin.y + y_offset);
                        path.add_path(&glyph_path, offset, AddPathMode::Append);
                    }
                }
            }
        });

        if path.is_empty() {
            return;
        }

        let canvas = self.canvas;
        let Some(image_filter) =
            skia_safe::image_filters::blur((blur.radius, blur.radius), None, None, None)
        else {
            return;
        };

        canvas.save();
        canvas.clip_path(&path, None, true);
        let layer_rec = SaveLayerRec::default().backdrop(&image_filter);
        canvas.save_layer(&layer_rec);
        canvas.restore();
        canvas.restore();
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

    pub fn cached_path(&self, id: &NodeId, data: &str) -> Rc<Path> {
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

    pub fn draw_fills(&self, shape: &PainterShape, fills: &[Paint]) {
        if fills.is_empty() {
            return;
        }
        if let Some(paint) = paint::sk_paint_stack(
            fills,
            (shape.rect.width(), shape.rect.height()),
            self.images,
        ) {
            self.canvas.draw_path(&shape.to_path(), &paint);
        }
    }

    pub fn draw_strokes(
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
        if let Some(paint) = paint::sk_paint_stack(
            strokes,
            (shape.rect.width(), shape.rect.height()),
            self.images,
        ) {
            self.canvas.draw_path(stroke_path, &paint);
        }
    }

    /// Draw a shape applying all layer effects in the correct order.
    pub fn draw_shape_with_effects<F: Fn()>(
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

    pub fn draw_text_span(
        &self,
        id: &NodeId,
        text: &str,
        width: &Option<f32>,
        height: &Option<f32>,
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

        let layout_height = layout_size.1;
        let container_height = height.unwrap_or(layout_height);
        let y_offset = match height {
            Some(h) => match text_align_vertical {
                TextAlignVertical::Top => 0.0,
                TextAlignVertical::Center => (h - layout_height) / 2.0,
                TextAlignVertical::Bottom => h - layout_height,
            },
            None => 0.0,
        };

        self.draw_text_paragraph(
            &paragraph,
            strokes,
            stroke_width,
            stroke_align,
            (layout_size.0, container_height),
            y_offset,
        );
    }

    pub fn draw_text_paragraph(
        &self,
        paragraph: &Rc<RefCell<textlayout::Paragraph>>,
        strokes: &[Paint],
        stroke_width: f32,
        stroke_align: &StrokeAlign,
        layout_size: (f32, f32),
        y_offset: f32,
    ) {
        self.canvas.save();
        self.canvas.translate((0.0, y_offset));

        if stroke_width > 0.0 && !strokes.is_empty() && matches!(stroke_align, StrokeAlign::Outside)
        {
            let images = self.images;
            paragraph.borrow_mut().visit(|_, info| {
                if let Some(info) = info {
                    text_stroke::draw_text_stroke_outside_fast_pre(
                        self.canvas,
                        info.glyphs(),
                        info.positions(),
                        info.origin(),
                        info.font(),
                        strokes,
                        stroke_width,
                        layout_size,
                        images,
                    );
                }
            });
        }

        // Now we can simply paint the paragraph - all paint handling is done in paragraph()
        paragraph.borrow().paint(self.canvas, Point::new(0.0, 0.0));

        if stroke_width > 0.0
            && !strokes.is_empty()
            && !matches!(stroke_align, StrokeAlign::Outside)
        {
            let images = self.images;
            paragraph.borrow_mut().visit(|_, info| {
                if let Some(info) = info {
                    text_stroke::draw_text_stroke(
                        self.canvas,
                        info.glyphs(),
                        info.positions(),
                        info.origin(),
                        info.font(),
                        strokes,
                        stroke_width,
                        *stroke_align,
                        images,
                    );
                }
            });
        }

        self.canvas.restore();
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

                        let layout_height = layout_size.1;
                        let container_height = text_layer.height.unwrap_or(layout_height);
                        let y_offset = match text_layer.height {
                            Some(h) => match text_layer.text_align_vertical {
                                TextAlignVertical::Top => 0.0,
                                TextAlignVertical::Center => (h - layout_height) / 2.0,
                                TextAlignVertical::Bottom => h - layout_height,
                            },
                            None => 0.0,
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
                                    (layout_size.0, container_height),
                                    y_offset,
                                );
                            });
                        };

                        let apply_effects = || {
                            if let Some(blur) = effects.backdrop_blur {
                                self.draw_text_backdrop_blur(&paragraph, &blur, y_offset);
                            }

                            for shadow in &effects.shadows {
                                if let FilterShadowEffect::DropShadow(ds) = shadow {
                                    self.draw_text_shadow(&paragraph, ds, y_offset);
                                }
                            }

                            draw_content();

                            for shadow in &effects.shadows {
                                if let FilterShadowEffect::InnerShadow(is) = shadow {
                                    self.draw_text_inner_shadow(&paragraph, is, y_offset);
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
                                    crate::vectornetwork::vn_painter::VNPainter::new_with_images(
                                        self.canvas,
                                        self.images,
                                    );

                                // Convert strokes to StrokeOptions for VNPainter
                                let stroke_options = if !vector_layer.strokes.is_empty() {
                                    Some(StrokeOptions {
                                        width: vector_layer.stroke_width,
                                        align: vector_layer.stroke_align,
                                        paints: vector_layer.strokes.clone(),
                                        width_profile: vector_layer.stroke_width_profile.clone(),
                                    })
                                } else {
                                    None
                                };

                                vn_painter.draw(
                                    &vector_layer.vector,
                                    &vector_layer.fills,
                                    stroke_options.as_ref(),
                                    vector_layer.corner_radius,
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
